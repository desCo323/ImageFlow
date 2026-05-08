<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\QueueItem;
use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortAssignmentMapper;
use OCA\ImageFlow\Db\SortJob;
use OCA\ImageFlow\Db\SortJobMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IDBConnection;

class QueueExecutionService {
	private const STATUS_EXECUTED = 'executed';
	private const STATUS_BLOCKED = 'blocked';
	private const STATUS_FAILED = 'failed';

	public function __construct(
		private readonly QueueItemMapper $queueMapper,
		private readonly SortJobMapper $jobMapper,
		private readonly SortAssignmentMapper $assignmentMapper,
		private readonly IRootFolder $rootFolder,
		private readonly IConfig $config,
		private readonly IDBConnection $db,
		private readonly LogService $logService,
		private readonly BackgroundGateService $backgroundGateService,
	) {
	}

	public function processDue(int $limit = 25): int {
		if (!$this->backgroundProcessingEnabled()) {
			$this->logService->debug('queue_background_processing_skipped', null, [
				'backgroundProcessingEnabled' => false,
			], null, 'ImageFlow Hintergrund-Ablage ist serverseitig deaktiviert.');
			return 0;
		}
		if (!$this->realExecutionEnabled()) {
			$this->logService->debug('queue_background_execution_skipped', null, [
				'backgroundProcessingEnabled' => true,
				'realExecutionEnabled' => false,
			], null, 'ImageFlow Hintergrund-Ablage wartet, weil echte Dateiänderungen deaktiviert sind.');
			return 0;
		}
		$gate = $this->backgroundGateService->status();
		if (!($gate['canRun'] ?? false)) {
			$this->logService->debug('queue_background_gate_waiting', null, $gate, null, (string)($gate['message'] ?? 'ImageFlow Hintergrund-Ablage wartet.'));
			return 0;
		}

		return $this->processItems($this->queueMapper->findDue($limit * 4), $limit, false);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function processJobNow(string $userId, int $jobId, int $limit = 25): array {
		if (!$this->realExecutionEnabled()) {
			$this->logService->warning('queue_manual_processing_blocked', $userId, [
				'jobId' => $jobId,
				'realExecutionEnabled' => false,
			], $jobId, 'Manuelle Ablage wurde blockiert, weil echte Dateiänderungen deaktiviert sind.');
			return [
				'processed' => 0,
				'realExecutionEnabled' => false,
				'message' => 'Echte Dateiänderungen sind serverseitig deaktiviert.',
			];
		}

		$processed = $this->processItems($this->queueMapper->findDueForJob($userId, $jobId, $limit), $limit, true);
		return [
			'processed' => $processed,
			'realExecutionEnabled' => true,
			'message' => $processed > 0 ? 'Die vorgemerkte Ablage wurde abgelegt.' : 'Keine wartenden Bilder für die Ablage gefunden.',
		];
	}

	public function isRealExecutionEnabled(): bool {
		return $this->realExecutionEnabled();
	}

	public function isBackgroundProcessingEnabled(): bool {
		return $this->backgroundProcessingEnabled();
	}

	/**
	 * @param QueueItem[] $items
	 */
	private function processItems(array $items, int $limit, bool $manual): int {
		$processed = 0;
		foreach ($items as $item) {
			if ($processed >= max(1, $limit)) {
				break;
			}
			$item->setAttempts($item->getAttempts() + 1);
			$item->setStatus('executing');
			$item->setLastError(null);
			$item->setUpdatedAt(time());
			$item = $this->queueMapper->update($item);

			$job = $this->safeFindJob($item);
			if (!$manual && !$this->jobAllowsAutoProcess($job)) {
				$item->setStatus('queued');
				$item->setAttempts(max(0, $item->getAttempts() - 1));
				$item->setUpdatedAt(time());
				$this->queueMapper->update($item);
				continue;
			}
			$this->markJobExecuting($job);

			try {
				$result = $this->realExecutionEnabled()
					? $this->executeItem($item)
					: $this->blockedResult('Real file writes are disabled. Review the dry-run worklist before enabling execution.');
			} catch (\Throwable $e) {
				$this->logService->exception('queue_execution_failed_exception', $e, $item->getUserId(), $item->getJobId());
				$result = [
					'status' => self::STATUS_FAILED,
					'message' => $e->getMessage(),
					'sourceChecksum' => $item->getSourceChecksum(),
					'targetChecksum' => $item->getTargetChecksum(),
					'context' => [
						'exception' => $e::class,
					],
				];
			}

			$this->finishItem($item, $result);
			$this->updateAssignmentStatus($item, (string)$result['status']);
			$this->refreshJobStats($item->getUserId(), $item->getJobId());
			$processed++;
		}

		return $processed;
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function executeItem(QueueItem $item): array {
		return match ($item->getOperationType()) {
			'album' => $this->executeAlbum($item),
			'copy' => $this->executeCopy($item),
			'move' => $this->executeMove($item),
			default => $this->failedResult('Unbekannte Ablageart.', [
				'operationType' => $item->getOperationType(),
			]),
		};
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function executeAlbum(QueueItem $item): array {
		$source = $this->sourceFile($item);
		if (!$source instanceof File) {
			return $this->failedResult('Quelle fehlt oder ist keine Datei.');
		}
		$albumId = $item->getTargetAlbumId();
		if ($albumId === null || !ctype_digit($albumId) || !$this->albumExists($item->getUserId(), (int)$albumId)) {
			return $this->blockedResult('Album konnte nicht sicher verifiziert werden.');
		}

		$sourceChecksum = $this->checksumIfEnabled($source, $item);
		if ($this->albumContainsFile((int)$albumId, $source->getId())) {
			return $this->executedResult('Bild ist bereits im Album; Doppelung wurde übersprungen.', $sourceChecksum, null, [
				'albumId' => (int)$albumId,
				'fileId' => $source->getId(),
				'idempotent' => true,
			]);
		}

		$this->addFileToAlbum((int)$albumId, $source->getId(), $source->getOwner()?->getUID() ?? $item->getUserId());
		return $this->executedResult('Bild wurde dem Album hinzugefügt.', $sourceChecksum, null, [
			'albumId' => (int)$albumId,
			'fileId' => $source->getId(),
		]);
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function executeCopy(QueueItem $item): array {
		$source = $this->sourceFile($item);
		$targetFolder = $this->targetFolder($item);
		if (!$source instanceof File) {
			return $this->failedResult('Quelle fehlt oder ist keine Datei.');
		}
		if (!$targetFolder instanceof Folder) {
			return $this->failedResult('Ablageordner fehlt oder ist nicht lesbar.');
		}

		$fileName = PathHelper::fileNameFromPath($item->getSourcePath());
		if ($fileName === '') {
			return $this->failedResult('Quelldateiname ist leer.');
		}

		$sourceChecksum = $this->checksumIfEnabled($source, $item);
		$existingTarget = $this->existingTargetFile($targetFolder, $fileName);
		if ($existingTarget !== null) {
			return $this->handleExistingCopyTarget($item, $source, $existingTarget, $sourceChecksum);
		}

		$targetNode = $source->copy($targetFolder->getFullPath($fileName));
		if (!$targetNode instanceof File) {
			return $this->failedResult('Kopieren hat keine gültige Zieldatei erzeugt.');
		}
		$targetChecksum = $this->checksumIfEnabled($targetNode, $item);
		if ($item->getSafeMode() && $sourceChecksum !== $targetChecksum) {
			return $this->failedResult('Checksumme nach dem Kopieren stimmt nicht überein.', [
				'sourceChecksum' => $sourceChecksum,
				'targetChecksum' => $targetChecksum,
			]);
		}

		return $this->executedResult('Bild wurde sicher kopiert.', $sourceChecksum, $targetChecksum, [
			'sourcePath' => $item->getSourcePath(),
			'targetPath' => $this->joinDisplayPath((string)$item->getTargetPath(), $fileName),
		]);
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function executeMove(QueueItem $item): array {
		$source = $this->sourceFile($item);
		$targetFolder = $this->targetFolder($item);
		if (!$source instanceof File) {
			return $this->failedResult('Quelle fehlt oder ist keine Datei.');
		}
		if (!$targetFolder instanceof Folder) {
			return $this->failedResult('Ablageordner fehlt oder ist nicht lesbar.');
		}

		$fileName = PathHelper::fileNameFromPath($item->getSourcePath());
		if ($fileName === '') {
			return $this->failedResult('Quelldateiname ist leer.');
		}

		$sourceChecksum = $this->checksumIfEnabled($source, $item);
		$existingTarget = $this->existingTargetFile($targetFolder, $fileName);
		if ($existingTarget !== null) {
			if ($existingTarget->getPath() === $source->getPath()) {
				return $this->executedResult('Quelle liegt bereits im Ablageordner; Verschieben wurde als erledigt markiert.', $sourceChecksum, $sourceChecksum, [
					'idempotent' => true,
				]);
			}

			return $this->blockedResult('Zieldatei existiert bereits. Verschieben überschreibt nicht und löscht die Quelle nicht.', [
				'targetPath' => $this->joinDisplayPath((string)$item->getTargetPath(), $fileName),
			], $sourceChecksum);
		}

		$targetNode = $source->move($targetFolder->getFullPath($fileName));
		if (!$targetNode instanceof File) {
			return $this->failedResult('Verschieben hat keine gültige Zieldatei erzeugt.');
		}
		$targetChecksum = $this->checksumIfEnabled($targetNode, $item);
		if ($item->getSafeMode() && $sourceChecksum !== $targetChecksum) {
			return $this->failedResult('Checksumme nach dem Verschieben stimmt nicht überein.', [
				'sourceChecksum' => $sourceChecksum,
				'targetChecksum' => $targetChecksum,
			]);
		}

		return $this->executedResult('Bild wurde sicher verschoben.', $sourceChecksum, $targetChecksum, [
			'sourcePath' => $item->getSourcePath(),
			'targetPath' => $this->joinDisplayPath((string)$item->getTargetPath(), $fileName),
		]);
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function handleExistingCopyTarget(QueueItem $item, File $source, File $target, ?string $sourceChecksum): array {
		if ($target->getPath() === $source->getPath()) {
			return $this->executedResult('Quelle liegt bereits im Ablageordner; Kopieren wurde als erledigt markiert.', $sourceChecksum, $sourceChecksum, [
				'idempotent' => true,
			]);
		}

		if (!$item->getSafeMode()) {
			return $this->blockedResult('Zieldatei existiert bereits. Ohne Safe Mode wird keine Doppelung überschrieben.', [], $sourceChecksum);
		}

		$targetChecksum = $target->hash('sha256');
		if ($sourceChecksum === $targetChecksum) {
			return $this->executedResult('Zieldatei existiert bereits mit gleicher Checksumme; Doppelung wurde übersprungen.', $sourceChecksum, $targetChecksum, [
				'idempotent' => true,
			]);
		}

		return $this->blockedResult('Zieldatei existiert bereits mit anderer Checksumme.', [
			'sourceChecksum' => $sourceChecksum,
			'targetChecksum' => $targetChecksum,
		], $sourceChecksum, $targetChecksum);
	}

	private function finishItem(QueueItem $item, array $result): void {
		$status = (string)($result['status'] ?? self::STATUS_FAILED);
		$message = (string)($result['message'] ?? 'Unbekannter Ablagestatus.');
		$item->setStatus($status);
		$item->setSourceChecksum($result['sourceChecksum'] ?? null);
		$item->setTargetChecksum($result['targetChecksum'] ?? null);
		$item->setLastError($status === self::STATUS_EXECUTED ? null : $message);
		$item->setExecutedAt($status === self::STATUS_EXECUTED ? time() : null);
		$item->setUpdatedAt(time());
		$this->queueMapper->update($item);

		$event = match ($status) {
			self::STATUS_EXECUTED => 'queue_execution_item_executed',
			self::STATUS_BLOCKED => 'queue_execution_item_blocked',
			default => 'queue_execution_item_failed',
		};
		$level = $status === self::STATUS_EXECUTED ? 'info' : ($status === self::STATUS_BLOCKED ? 'warning' : 'exception');
		$context = array_merge([
			'queueItemId' => $item->getId(),
			'jobId' => $item->getJobId(),
			'operationType' => $item->getOperationType(),
			'sourcePath' => $item->getSourcePath(),
			'targetPath' => $item->getTargetPath(),
			'targetAlbumId' => $item->getTargetAlbumId(),
			'attempts' => $item->getAttempts(),
			'realExecutionEnabled' => $this->realExecutionEnabled(),
		], is_array($result['context'] ?? null) ? $result['context'] : []);

		if ($level === 'info') {
			$this->logService->info($event, $item->getUserId(), $context, $item->getJobId(), $message);
		} elseif ($level === 'warning') {
			$this->logService->warning($event, $item->getUserId(), $context, $item->getJobId(), $message);
		} else {
			$this->logService->warning($event, $item->getUserId(), $context, $item->getJobId(), $message);
		}
	}

	private function updateAssignmentStatus(QueueItem $item, string $status): void {
		$assignmentId = $item->getAssignmentId();
		if ($assignmentId === null) {
			return;
		}

		try {
			$assignment = $this->assignmentMapper->findForUserById($item->getUserId(), $assignmentId);
			$assignment->setActionStatus($status);
			$assignment->setUpdatedAt(time());
			$this->assignmentMapper->update($assignment);
		} catch (\Throwable $e) {
			$this->logService->exception('queue_assignment_update_failed', $e, $item->getUserId(), $item->getJobId());
		}
	}

	private function refreshJobStats(string $userId, int $jobId): void {
		try {
			$job = $this->jobMapper->findForUserById($userId, $jobId);
			$queued = $this->queueMapper->countForJobByStatus($jobId, 'queued')
				+ $this->queueMapper->countForJobByStatus($jobId, 'executing');
			$executed = $this->queueMapper->countForJobByStatus($jobId, self::STATUS_EXECUTED);
			$failed = $this->queueMapper->countForJobByStatuses($jobId, [self::STATUS_FAILED, self::STATUS_BLOCKED]);
			$planned = $this->queueMapper->countForJobByStatus($jobId, 'planned');

			$job->setQueuedOperations($queued + $planned);
			$job->setExecutedOperations($executed);
			$job->setFailedOperations($failed);
			$job->setUpdatedAt(time());
			if ($queued > 0) {
				$job->setStatus('executing');
			} elseif ($failed > 0) {
				$job->setStatus('error');
				$job->setErrorMessage('Mindestens eine Ablage wurde blockiert oder ist fehlgeschlagen.');
				$job->setExecutionFinishedAt(time());
			} elseif ($planned > 0) {
				$job->setStatus('ready');
			} else {
				$job->setStatus('done');
				$job->setExecutionFinishedAt(time());
				$job->setErrorMessage(null);
			}
			$this->jobMapper->update($job);
		} catch (\Throwable $e) {
			$this->logService->exception('queue_job_stats_update_failed', $e, $userId, $jobId);
		}
	}

	private function markJobExecuting(?SortJob $job): void {
		if ($job === null) {
			return;
		}
		try {
			if ($job->getExecutionStartedAt() === null) {
				$job->setExecutionStartedAt(time());
			}
			$job->setStatus('executing');
			$job->setUpdatedAt(time());
			$this->jobMapper->update($job);
		} catch (\Throwable) {
		}
	}

	private function safeFindJob(QueueItem $item): ?SortJob {
		try {
			return $this->jobMapper->findForUserById($item->getUserId(), $item->getJobId());
		} catch (\Throwable) {
			return null;
		}
	}

	private function sourceFile(QueueItem $item): ?File {
		$node = $this->nodeForDisplayPath($item->getUserId(), $item->getSourcePath());
		return $node instanceof File ? $node : null;
	}

	private function targetFolder(QueueItem $item): ?Folder {
		$targetPath = $item->getTargetPath();
		if ($targetPath === null) {
			return null;
		}
		$node = $this->nodeForDisplayPath($item->getUserId(), $targetPath);
		return $node instanceof Folder ? $node : null;
	}

	private function existingTargetFile(Folder $folder, string $fileName): ?File {
		try {
			if (!$folder->nodeExists($fileName)) {
				return null;
			}
			$node = $folder->get($fileName);
			return $node instanceof File ? $node : null;
		} catch (\Throwable) {
			return null;
		}
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

	private function checksumIfEnabled(File $file, QueueItem $item): ?string {
		return $item->getSafeMode() ? $file->hash('sha256') : null;
	}

	private function albumExists(string $userId, int $albumId): bool {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'album_count')
			->from('photos_albums')
			->where($qb->expr()->eq('user', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_INT)))
			->setMaxResults(1);

		$row = $qb->executeQuery()->fetch();
		return (int)($row['album_count'] ?? 0) > 0;
	}

	private function albumContainsFile(int $albumId, int $fileId): bool {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'file_count')
			->from('photos_albums_files')
			->where($qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
			->setMaxResults(1);

		$row = $qb->executeQuery()->fetch();
		return (int)($row['file_count'] ?? 0) > 0;
	}

	private function addFileToAlbum(int $albumId, int $fileId, string $owner): void {
		$now = time();
		$qb = $this->db->getQueryBuilder();
		$qb->insert('photos_albums_files')
			->values([
				'album_id' => $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_INT),
				'file_id' => $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT),
				'added' => $qb->createNamedParameter($now, IQueryBuilder::PARAM_INT),
				'owner' => $qb->createNamedParameter($owner),
			]);
		$qb->executeStatement();

		$qb = $this->db->getQueryBuilder();
		$qb->update('photos_albums')
			->set('last_added_photo', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT))
			->where($qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	private function realExecutionEnabled(): bool {
		return $this->config->getAppValue('imageflow', 'real_execution_enabled', '0') === '1';
	}

	private function backgroundProcessingEnabled(): bool {
		return $this->config->getAppValue('imageflow', 'background_processing_enabled', '0') === '1';
	}

	private function jobAllowsAutoProcess(?SortJob $job): bool {
		if ($job === null) {
			return false;
		}
		try {
			$options = json_decode((string)$job->getOptionsJson(), true, 512, JSON_THROW_ON_ERROR);
			return is_array($options) && (bool)($options['autoProcess'] ?? false);
		} catch (\JsonException) {
			return false;
		}
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function executedResult(string $message, ?string $sourceChecksum = null, ?string $targetChecksum = null, array $context = []): array {
		return [
			'status' => self::STATUS_EXECUTED,
			'message' => $message,
			'sourceChecksum' => $sourceChecksum,
			'targetChecksum' => $targetChecksum,
			'context' => $context,
		];
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function blockedResult(string $message, array $context = [], ?string $sourceChecksum = null, ?string $targetChecksum = null): array {
		return [
			'status' => self::STATUS_BLOCKED,
			'message' => $message,
			'sourceChecksum' => $sourceChecksum,
			'targetChecksum' => $targetChecksum,
			'context' => $context,
		];
	}

	/**
	 * @return array{status: string, message: string, sourceChecksum: ?string, targetChecksum: ?string, context: array<string, mixed>}
	 */
	private function failedResult(string $message, array $context = []): array {
		return [
			'status' => self::STATUS_FAILED,
			'message' => $message,
			'sourceChecksum' => $context['sourceChecksum'] ?? null,
			'targetChecksum' => $context['targetChecksum'] ?? null,
			'context' => $context,
		];
	}

	private function joinDisplayPath(string $folderPath, string $fileName): string {
		$folderPath = PathHelper::displayPath($folderPath);
		return ($folderPath === '/' ? '' : $folderPath) . '/' . $fileName;
	}
}
