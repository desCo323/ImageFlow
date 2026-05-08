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
		], $jobId, 'Worklist-Dry-Run wurde berechnet.');

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
			'executionMode' => $this->realExecutionEnabled() ? 'real-writes-enabled' : 'dry-run-only',
				'backgroundMode' => ($this->backgroundProcessingEnabled() && $this->realExecutionEnabled()) ? 'cron-enabled' : 'manual-only',
			'autoProcess' => (bool)($options['autoProcess'] ?? false),
			'message' => $this->realExecutionEnabled()
				? 'Echte Dateioperationen sind serverseitig freigeschaltet. Die Worklist wird vor der Ausfuehrung weiterhin idempotent und sicher geprueft.'
				: 'Dateioperationen sind weiterhin gesperrt. Diese Vorschau prueft die Worklist vor der spaeteren Freigabe realer Writes.',
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
			$messages[] = 'Doppelte Operation in dieser Worklist.';
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
				$messages[] = 'Album konnte nicht sicher verifiziert werden.';
			} elseif ($sourceNode instanceof File && $this->albumContainsFile((int)$item->getTargetAlbumId(), $sourceNode->getId())) {
				$readiness = $this->worseReadiness($readiness, 'warning');
				$messages[] = 'Bild ist bereits im Album; spaetere Ausfuehrung ueberspringt das Duplikat.';
			}
		} elseif ($item->getOperationType() === 'copy' || $item->getOperationType() === 'move') {
			$targetPath = $item->getTargetPath();
			$targetNode = $targetPath !== null ? $this->nodeForDisplayPath($userId, $targetPath) : null;
			if (!$targetNode instanceof Folder) {
				$readiness = 'error';
				$messages[] = 'Zielordner fehlt oder ist nicht lesbar.';
			} elseif ($sourceNode instanceof File) {
				$targetFilePath = rtrim($targetPath ?? '/', '/') . '/' . PathHelper::fileNameFromPath($item->getSourcePath());
				if ($this->nodeForDisplayPath($userId, $targetFilePath) instanceof File) {
					$readiness = $this->worseReadiness($readiness, 'warning');
					$messages[] = 'Zieldatei existiert bereits; spaetere Ausfuehrung muss Duplikat sicher ueberspringen.';
				}
				if (PathHelper::parentPath($item->getSourcePath()) === PathHelper::displayPath((string)$targetPath)) {
					$readiness = $this->worseReadiness($readiness, 'warning');
					$messages[] = 'Quelle liegt bereits im Zielordner.';
				}
			}
		} else {
			$readiness = 'error';
			$messages[] = 'Unbekannter Operationstyp.';
		}

		if ($messages === []) {
			$messages[] = $item->getSafeMode() ? 'Bereit fuer sichere Pruefung mit Checksumme.' : 'Bereit, aber ohne Checksumme.';
		}

		return [
			'id' => $item->getId(),
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
