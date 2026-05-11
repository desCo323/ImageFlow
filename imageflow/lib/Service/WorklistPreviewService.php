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
	private const VALIDATION_BATCH_SIZE = 250;

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
		$seenKeys = [];
		$seenMoveSources = [];
		$issueRows = [];
		$sampleRows = [];
		$displayLimit = max(1, min(500, $limit));
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

		$offset = 0;
		do {
			$items = $this->queueMapper->findForJob($userId, $jobId, self::VALIDATION_BATCH_SIZE, $offset);
			foreach ($items as $item) {
				$row = $this->previewItem($userId, $item, $seenKeys, $seenMoveSources);
				if ($this->isPreviewIssue($row) && count($issueRows) < $displayLimit) {
					$issueRows[] = $row;
				} elseif (count($sampleRows) < $displayLimit) {
					$sampleRows[] = $row;
				}
				$this->addToSummary($summary, $row);
			}
			$offset += count($items);
		} while (count($items) === self::VALIDATION_BATCH_SIZE);

		$rows = array_slice([...$issueRows, ...$sampleRows], 0, $displayLimit);
		$canQueue = $summary['planned'] > 0 && $summary['errors'] === 0;
		$truncated = $summary['total'] > count($rows);
		$this->logService->debug('worklist_preview_created', $userId, [
			'jobId' => $jobId,
			'total' => $summary['total'],
			'shown' => count($rows),
			'truncated' => $truncated,
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
			'window' => [
				'total' => $summary['total'],
				'shown' => count($rows),
				'limit' => $displayLimit,
				'truncated' => $truncated,
				'validationComplete' => true,
			],
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
	 * @param array<string, int> $summary
	 * @param array<string, mixed> $row
	 */
	private function addToSummary(array &$summary, array $row): void {
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

	/**
	 * @param array<string, mixed> $row
	 */
	private function isPreviewIssue(array $row): bool {
		return in_array((string)($row['readiness'] ?? ''), ['warning', 'error'], true)
			|| in_array((string)($row['status'] ?? ''), ['blocked', 'failed'], true);
	}

	/**
	 * @param array<string, bool> $seenKeys
	 * @param array<string, bool> $seenMoveSources
	 * @return array<string, mixed>
	 */
	private function previewItem(string $userId, QueueItem $item, array &$seenKeys, array &$seenMoveSources): array {
		$messages = [];
		$issues = [];
		$readiness = 'ready';
		$key = $this->operationKey($item);
		$sourcePath = $item->getSourcePath();
		if (in_array($item->getStatus(), ['blocked', 'failed'], true)) {
			$this->addPreviewIssue(
				$issues,
				$messages,
				$readiness,
				'execution_' . $item->getStatus(),
				'error',
				$item->getLastError() ?: 'Diese Ablage ist nach einem Ausführungsversuch blockiert. Prüfe das Protokoll und sortiere das Bild danach neu.',
				'review_log_and_resort'
			);
		}
		if ($item->getOperationType() === 'move' && isset($seenMoveSources[$sourcePath])) {
			$this->addPreviewIssue(
				$issues,
				$messages,
				$readiness,
				'duplicate_move_source',
				'error',
				'Dieses Bild ist mehrfach zum Verschieben vorgemerkt. Entferne alte Entscheidungen, bevor du die Ablage freigibst.',
				'remove_duplicate_decision'
			);
		} elseif ($item->getOperationType() === 'move') {
			$seenMoveSources[$sourcePath] = true;
		}
		if (isset($seenKeys[$key])) {
			$severity = $item->getOperationType() === 'move' ? 'error' : 'warning';
			$this->addPreviewIssue(
				$issues,
				$messages,
				$readiness,
				'duplicate_operation',
				$severity,
				$item->getOperationType() === 'move'
					? 'Diese Verschiebe-Entscheidung ist doppelt vorgemerkt und muss vor der Ablage bereinigt werden.'
					: 'Diese Entscheidung ist doppelt vorgemerkt und wird später sicher übersprungen, falls sie schon erledigt ist.',
				$severity === 'error' ? 'remove_duplicate_decision' : 'safe_skip_duplicate'
			);
		}
		$seenKeys[$key] = true;

		$sourceNode = $this->nodeForDisplayPath($userId, $sourcePath);
		if (!$sourceNode instanceof File) {
			$this->addPreviewIssue(
				$issues,
				$messages,
				$readiness,
				'source_missing',
				'error',
				'Quelle fehlt oder ist keine Datei.',
				'remove_and_resort'
			);
		}

		if ($item->getOperationType() === 'album') {
			if ($item->getTargetAlbumId() === null || !$this->albumExists($userId, $item->getTargetAlbumId())) {
				$this->addPreviewIssue(
					$issues,
					$messages,
					$readiness,
					'target_album_unverified',
					'warning',
					'Album konnte noch nicht sicher verifiziert werden.',
					'choose_album_again'
				);
			} elseif ($sourceNode instanceof File && $this->albumContainsFile((int)$item->getTargetAlbumId(), $sourceNode->getId())) {
				$this->addPreviewIssue(
					$issues,
					$messages,
					$readiness,
					'target_album_duplicate',
					'warning',
					'Bild ist bereits im Album; die spätere Ablage überspringt die Doppelung.',
					'safe_skip_duplicate'
				);
			}
		} elseif ($item->getOperationType() === 'copy' || $item->getOperationType() === 'move') {
			$targetPath = $item->getTargetPath();
			$targetNode = $targetPath !== null ? $this->nodeForDisplayPath($userId, $targetPath) : null;
			if (!$targetNode instanceof Folder) {
				$this->addPreviewIssue(
					$issues,
					$messages,
					$readiness,
					'target_folder_missing',
					'error',
					'Zielordner fehlt oder ist nicht lesbar.',
					'create_target_folder'
				);
			} elseif ($sourceNode instanceof File) {
				$targetFilePath = rtrim($targetPath ?? '/', '/') . '/' . PathHelper::fileNameFromPath($item->getSourcePath());
				if ($this->nodeForDisplayPath($userId, $targetFilePath) instanceof File) {
					$this->addPreviewIssue(
						$issues,
						$messages,
						$readiness,
						'target_file_exists',
						'warning',
						'Zieldatei existiert bereits; die spätere Ablage muss die Doppelung sicher überspringen.',
						'safe_skip_duplicate'
					);
				}
				if (PathHelper::parentPath($item->getSourcePath()) === PathHelper::displayPath((string)$targetPath)) {
					$this->addPreviewIssue(
						$issues,
						$messages,
						$readiness,
						'source_already_in_target',
						'warning',
						'Quelle liegt bereits im Zielordner.',
						'safe_skip_duplicate'
					);
				}
			}
		} else {
			$this->addPreviewIssue(
				$issues,
				$messages,
				$readiness,
				'unknown_operation',
				'error',
				'Unbekannte Ablageart.',
				'remove_and_resort'
			);
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
			'issues' => $issues,
			'messages' => $messages,
		];
	}

	/**
	 * @param array<int, array<string, string>> $issues
	 * @param array<int, string> $messages
	 */
	private function addPreviewIssue(array &$issues, array &$messages, string &$readiness, string $code, string $severity, string $message, string $action): void {
		$severity = $severity === 'error' ? 'error' : 'warning';
		$readiness = $this->worseReadiness($readiness, $severity);
		$messages[] = $message;
		$issues[] = [
			'code' => $code,
			'severity' => $severity,
			'message' => $message,
			'action' => $action,
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
