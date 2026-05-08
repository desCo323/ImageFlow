<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\QueueItem;
use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortJobMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IDBConnection;

class WorklistPreviewService {
	public function __construct(
		private readonly SortJobMapper $jobMapper,
		private readonly QueueItemMapper $queueMapper,
		private readonly IRootFolder $rootFolder,
		private readonly IConfig $config,
		private readonly IDBConnection $db,
		private readonly LogService $logService,
		private readonly BackgroundGateService $backgroundGateService,
	) {
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function preview(string $userId, int $jobId, int $limit = 250): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$options = $this->decodeOptions($job->getOptionsJson());
		$items = $this->queueMapper->findForJob($userId, $jobId, $limit);
		$seenKeys = [];
		$rows = [];
		$summary = [
			'total' => 0,
			'planned' => 0,
			'queued' => 0,
			'executing' => 0,
			'blocked' => 0,
			'executed' => 0,
			'failed' => 0,
			'ready' => 0,
			'warnings' => 0,
			'errors' => 0,
		];

		foreach ($items as $item) {
			$row = $this->previewItem($userId, $item, $seenKeys);
			$rows[] = $row;
			$summary['total']++;
			$status = (string)$row['status'];
			if (isset($summary[$status])) {
				$summary[$status]++;
			}
			if ($row['readiness'] === 'ready') {
				$summary['ready']++;
			} elseif ($row['readiness'] === 'warning') {
				$summary['warnings']++;
			} else {
				$summary['errors']++;
			}
		}

		$canQueue = $summary['planned'] > 0 && $summary['errors'] === 0;
		$this->logService->debug('worklist_preview_created', $userId, [
			'jobId' => $jobId,
			'total' => $summary['total'],
			'errors' => $summary['errors'],
			'warnings' => $summary['warnings'],
			'canQueue' => $canQueue,
		], $jobId, 'Ablage-Vorschau wurde geprüft.');

		$realExecutionEnabled = $this->realExecutionEnabled();
		$backgroundProcessingEnabled = $this->backgroundProcessingEnabled();
		$backgroundGate = $this->backgroundGateService->status();
		$backgroundMode = $this->backgroundMode($realExecutionEnabled, $backgroundProcessingEnabled, $backgroundGate);

		return [
			'job' => [
				'id' => $job->getId(),
				'name' => $job->getName(),
				'targetMode' => $job->getTargetMode(),
				'safeMode' => $job->getSafeMode(),
				'status' => $job->getStatus(),
				'options' => $options,
			],
			'summary' => $summary,
			'items' => $rows,
			'canQueue' => $canQueue,
			'executionMode' => $realExecutionEnabled ? 'real-writes-enabled' : 'dry-run-only',
			'backgroundMode' => $backgroundMode,
			'backgroundGate' => $backgroundGate,
			'autoProcess' => (bool)($options['autoProcess'] ?? false),
			'safety' => [
				'realExecutionEnabled' => $realExecutionEnabled,
				'backgroundProcessingEnabled' => $backgroundProcessingEnabled,
				'backgroundGate' => $backgroundGate,
				'writesBlocked' => !$realExecutionEnabled,
				'duplicateCheck' => true,
				'targetConflictCheck' => true,
				'checksumOnExecution' => $job->getSafeMode(),
				'checkedItems' => $summary['total'],
			],
			'message' => $realExecutionEnabled
				? 'Echte Dateiänderungen sind serverseitig freigeschaltet. Jede Ablage wird trotzdem noch einmal auf Doppelungen, Zielkonflikte und Prüfsummen geprüft.'
				: 'Dateiänderungen sind gesperrt. Du kannst die Ablage prüfen und für später merken, ohne Dateien zu verändern.',
		];
	}

	/**
	 * @param array<string, bool> $seenKeys
	 * @return array<string, mixed>
	 */
	private function previewItem(string $userId, QueueItem $item, array &$seenKeys): array {
		$messages = [];
		$readiness = 'ready';
		$key = $this->operationKey($item);
		if (isset($seenKeys[$key])) {
			$readiness = 'warning';
			$messages[] = 'Diese Entscheidung ist doppelt vorgemerkt und wird später nur einmal wirksam.';
		}
		$seenKeys[$key] = true;

		$sourceNode = $this->nodeForDisplayPath($userId, $item->getSourcePath());
		if (!$sourceNode instanceof File) {
			$readiness = 'error';
			$messages[] = 'Quelle fehlt oder ist keine Datei.';
		}

		if ($item->getOperationType() === 'album') {
			if ($item->getTargetAlbumId() === null || !$this->albumExists($userId, $item->getTargetAlbumId())) {
				$readiness = $this->worseReadiness($readiness, 'warning');
				$messages[] = 'Album konnte noch nicht sicher verifiziert werden.';
			} elseif ($sourceNode instanceof File && $this->albumContainsFile((int)$item->getTargetAlbumId(), $sourceNode->getId())) {
				$readiness = $this->worseReadiness($readiness, 'warning');
				$messages[] = 'Bild ist bereits im Album; die spätere Ablage überspringt die Doppelung.';
			}
		} elseif ($item->getOperationType() === 'copy' || $item->getOperationType() === 'move') {
			$targetPath = $item->getTargetPath();
			$targetNode = $targetPath !== null ? $this->nodeForDisplayPath($userId, $targetPath) : null;
			if (!$targetNode instanceof Folder) {
				$readiness = 'error';
				$messages[] = 'Ablageordner fehlt oder ist nicht lesbar.';
			} elseif ($sourceNode instanceof File) {
				$targetFilePath = rtrim($targetPath ?? '/', '/') . '/' . PathHelper::fileNameFromPath($item->getSourcePath());
				if ($this->nodeForDisplayPath($userId, $targetFilePath) instanceof File) {
					$readiness = $this->worseReadiness($readiness, 'warning');
					$messages[] = 'Zieldatei existiert bereits; die spätere Ablage muss die Doppelung sicher überspringen.';
				}
				if (PathHelper::parentPath($item->getSourcePath()) === PathHelper::displayPath((string)$targetPath)) {
					$readiness = $this->worseReadiness($readiness, 'warning');
					$messages[] = 'Quelle liegt bereits im Ablageordner.';
				}
			}
		} else {
			$readiness = 'error';
			$messages[] = 'Unbekannte Ablageart.';
		}

		if ($messages === []) {
			$messages[] = $item->getSafeMode() ? 'Bereit für die sichere Prüfung mit Checksumme.' : 'Bereit, aber ohne Checksumme.';
		}

		return [
			'id' => $item->getId(),
			'assignmentId' => $item->getAssignmentId(),
			'operationKey' => $key,
			'operationType' => $item->getOperationType(),
			'sourcePath' => $item->getSourcePath(),
			'targetPath' => $item->getTargetPath(),
			'targetAlbumId' => $item->getTargetAlbumId(),
			'status' => $item->getStatus(),
			'safeMode' => $item->getSafeMode(),
			'attempts' => $item->getAttempts(),
			'lastError' => $item->getLastError(),
			'readiness' => $readiness,
			'messages' => $messages,
		];
	}

	private function operationKey(QueueItem $item): string {
		return hash('sha256', implode('|', [
			$item->getOperationType(),
			$item->getSourcePath(),
			$item->getTargetPath() ?? '',
			$item->getTargetAlbumId() ?? '',
		]));
	}

	private function nodeForDisplayPath(string $userId, string $displayPath): mixed {
		try {
			$userFolder = $this->rootFolder->getUserFolder($userId);
			$path = PathHelper::normalizeUserPath($displayPath);
			return $path === '' ? $userFolder : $userFolder->get($path);
		} catch (\Throwable) {
			return null;
		}
	}

	private function albumExists(string $userId, string $albumId): bool {
		if (!ctype_digit($albumId)) {
			return false;
		}

		try {
			$qb = $this->db->getQueryBuilder();
			$qb->selectAlias($qb->func()->count('*'), 'album_count')
				->from('photos_albums')
				->where($qb->expr()->eq('user', $qb->createNamedParameter($userId)))
				->andWhere($qb->expr()->eq('album_id', $qb->createNamedParameter((int)$albumId, IQueryBuilder::PARAM_INT)))
				->setMaxResults(1);

			$row = $qb->executeQuery()->fetch();
			return (int)($row['album_count'] ?? 0) > 0;
		} catch (\Throwable) {
			return false;
		}
	}

	private function albumContainsFile(int $albumId, int $fileId): bool {
		try {
			$qb = $this->db->getQueryBuilder();
			$qb->selectAlias($qb->func()->count('*'), 'file_count')
				->from('photos_albums_files')
				->where($qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_INT)))
				->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
				->setMaxResults(1);

			$row = $qb->executeQuery()->fetch();
			return (int)($row['file_count'] ?? 0) > 0;
		} catch (\Throwable) {
			return false;
		}
	}

	private function realExecutionEnabled(): bool {
		return $this->config->getAppValue('imageflow', 'real_execution_enabled', '0') === '1';
	}

	private function backgroundProcessingEnabled(): bool {
		return $this->config->getAppValue('imageflow', 'background_processing_enabled', '0') === '1';
	}

	/**
	 * @param array<string, mixed> $backgroundGate
	 */
	private function backgroundMode(bool $realExecutionEnabled, bool $backgroundProcessingEnabled, array $backgroundGate): string {
		if (!$realExecutionEnabled || !$backgroundProcessingEnabled) {
			return 'manual-only';
		}

		return ($backgroundGate['canRun'] ?? false) ? 'cron-ready' : 'cron-waiting';
	}

	/**
	 * @return array<string, mixed>
	 */
	private function decodeOptions(?string $json): array {
		if ($json === null || $json === '') {
			return [];
		}
		try {
			$decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
			return is_array($decoded) ? $decoded : [];
		} catch (\JsonException) {
			return [];
		}
	}

	private function worseReadiness(string $current, string $candidate): string {
		$order = ['ready' => 0, 'warning' => 1, 'error' => 2];
		return ($order[$candidate] ?? 2) > ($order[$current] ?? 2) ? $candidate : $current;
	}
}
