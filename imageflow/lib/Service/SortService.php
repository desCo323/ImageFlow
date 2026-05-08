<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\FavoriteTargetMapper;
use OCA\ImageFlow\Db\QueueItem;
use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortAssignment;
use OCA\ImageFlow\Db\SortAssignmentMapper;
use OCA\ImageFlow\Db\SortJobMapper;
use OCP\AppFramework\Db\DoesNotExistException;

class SortService {
	private const REMOVABLE_QUEUE_STATUSES = ['planned', 'queued'];

	public function __construct(
		private readonly SortJobMapper $jobMapper,
		private readonly SortAssignmentMapper $assignmentMapper,
		private readonly QueueItemMapper $queueMapper,
		private readonly FavoriteTargetMapper $favoriteMapper,
		private readonly FolderBrowserService $folderBrowserService,
		private readonly JobService $jobService,
		private readonly LogService $logService,
	) {
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function state(string $userId, int $jobId, ?int $cursor = null, int $limit = 48, ?string $start = null): array {
		$job = $this->jobService->touchOpened($userId, $jobId);
		$options = $this->decodeOptions($job->getOptionsJson());
		$savedPosition = $this->savedPosition($options);
		$startMode = $this->startMode($start);
		$startPosition = [
			'mode' => $startMode,
			'cursor' => (int)$savedPosition['cursor'],
			'index' => (int)$savedPosition['index'],
			'fileId' => $savedPosition['fileId'],
		];
		if ($cursor !== null) {
			$startPosition = [
				'mode' => 'cursor',
				'cursor' => $cursor,
				'index' => 0,
				'fileId' => null,
			];
		} elseif ($startMode === 'begin') {
			$startPosition = [
				'mode' => 'begin',
				'cursor' => 0,
				'index' => 0,
				'fileId' => null,
			];
		} elseif ($startMode === 'unsorted') {
			$startPosition = $this->firstUnsortedPosition($userId, $jobId, $job->getSourcePath(), $limit);
		}

		$pageCursor = (int)$startPosition['cursor'];
		$imagePage = $this->safeImagePage($userId, $jobId, $job->getSourcePath(), $pageCursor, $limit);

		return [
			'job' => $this->jobService->serializeJob($job),
			'favorites' => $this->favorites($userId, $job->getTargetMode(), (string)($options['hotkeys'] ?? 'number-row'), is_array($options['customHotkeys'] ?? null) ? $options['customHotkeys'] : []),
			'recentAssignments' => array_map([$this, 'serializeAssignment'], $this->assignmentMapper->findForJob($userId, $jobId, 20)),
			'queue' => array_map([$this, 'serializeQueueItem'], $this->queueMapper->findForJob($userId, $jobId, 20)),
			'nextImages' => $imagePage['images'],
			'imagePage' => $imagePage['page'],
			'savedPosition' => $savedPosition,
			'start' => $startPosition,
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function position(string $userId, int $jobId, array $input): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$options = $this->decodeOptions($job->getOptionsJson());
		$position = [
			'cursor' => max(0, $this->optionalInt($input['cursor'] ?? 0) ?? 0),
			'index' => max(0, $this->optionalInt($input['index'] ?? 0) ?? 0),
			'fileId' => $this->optionalInt($input['fileId'] ?? null),
			'savedAt' => time(),
		];
		$options['sortPosition'] = $position;

		$job->setOptionsJson(json_encode($options, JSON_THROW_ON_ERROR));
		$job->setLastOpenedAt($position['savedAt']);
		$job->setUpdatedAt($position['savedAt']);
		$job = $this->jobMapper->update($job);

		$this->logService->debug('sort_position_saved', $userId, [
			'jobId' => $jobId,
			'cursor' => $position['cursor'],
			'index' => $position['index'],
			'fileId' => $position['fileId'],
		], $jobId, 'Sortierposition wurde gespeichert.');

		return [
			'savedPosition' => $position,
			'job' => $this->jobService->serializeJob($job),
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function assign(string $userId, int $jobId, array $input): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$now = time();
		$sourcePath = PathHelper::displayPath((string)($input['sourcePath'] ?? ''));
		$target = is_array($input['target'] ?? null) ? $input['target'] : [];
		$targetLabel = trim((string)($target['label'] ?? $target['name'] ?? 'Ziel'));
		$targetId = $this->optionalString($target['id'] ?? null, 255);
		$targetPath = $this->optionalPath($target['path'] ?? null);
		$queueTargetPath = $job->getTargetMode() === 'album' ? null : ($targetPath ?? $job->getTargetPath());
		$queueTargetAlbumId = $job->getTargetMode() === 'album' ? $targetId : null;

		$duplicateQueueItem = $this->queueMapper->findDuplicateOperation(
			$userId,
			$jobId,
			$job->getTargetMode(),
			$sourcePath,
			$queueTargetPath,
			$queueTargetAlbumId,
		);
		if ($duplicateQueueItem !== null) {
			$this->logService->debug('assignment_duplicate_ignored', $userId, [
				'jobId' => $jobId,
				'queueItemId' => $duplicateQueueItem->getId(),
				'sourcePath' => $sourcePath,
				'targetLabel' => $targetLabel,
			], $jobId, 'Doppelte Entscheidung wurde nicht erneut für die Ablage vorgemerkt.');

			return [
				'assignment' => null,
				'queueItem' => $this->serializeQueueItem($duplicateQueueItem),
				'job' => $this->jobService->serializeJob($job),
				'duplicate' => true,
			];
		}

		$assignment = new SortAssignment();
		$assignment->setJobId($jobId);
		$assignment->setUserId($userId);
		$assignment->setFileId($this->optionalInt($input['fileId'] ?? null));
		$assignment->setSourcePath($sourcePath);
		$assignment->setFileName(PathHelper::fileNameFromPath($sourcePath) ?: (string)($input['fileName'] ?? 'Bild'));
		$assignment->setMimeType($this->optionalString($input['mimeType'] ?? null, 128));
		$assignment->setTargetType($job->getTargetMode());
		$assignment->setTargetId($targetId);
		$assignment->setTargetLabel(substr($targetLabel !== '' ? $targetLabel : 'Ziel', 0, 255));
		$assignment->setHotkey($this->optionalString($input['hotkey'] ?? null, 16));
		$assignment->setActionStatus('planned');
		$assignment->setCreatedAt($now);
		$assignment->setUpdatedAt($now);
		$assignment = $this->assignmentMapper->insert($assignment);

		$queueItem = new QueueItem();
		$queueItem->setJobId($jobId);
		$queueItem->setAssignmentId($assignment->getId());
		$queueItem->setUserId($userId);
		$queueItem->setOperationType($job->getTargetMode());
		$queueItem->setSourcePath($sourcePath);
		$queueItem->setTargetPath($queueTargetPath);
		$queueItem->setTargetAlbumId($queueTargetAlbumId);
		$queueItem->setStatus('planned');
		$queueItem->setSafeMode($job->getSafeMode());
		$queueItem->setCreatedAt($now);
		$queueItem->setUpdatedAt($now);
		$queueItem = $this->queueMapper->insert($queueItem);

		$job->setStatus($job->getStatus() === 'draft' ? 'sorting' : $job->getStatus());
		$job->setSortedFiles($job->getSortedFiles() + 1);
		$job->setQueuedOperations($job->getQueuedOperations() + 1);
		$job->setUpdatedAt($now);
		$this->jobMapper->update($job);

		$this->logService->debug('assignment_planned', $userId, [
			'jobId' => $jobId,
			'assignmentId' => $assignment->getId(),
			'queueItemId' => $queueItem->getId(),
			'sourcePath' => $sourcePath,
			'targetLabel' => $targetLabel,
		], $jobId, 'Entscheidung wurde für die spätere Ablage gespeichert.');

		return [
			'assignment' => $this->serializeAssignment($assignment),
			'queueItem' => $this->serializeQueueItem($queueItem),
			'job' => $this->jobService->serializeJob($job),
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function skip(string $userId, int $jobId, array $input): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$now = time();
		$sourcePath = PathHelper::displayPath((string)($input['sourcePath'] ?? ''));

		$assignment = new SortAssignment();
		$assignment->setJobId($jobId);
		$assignment->setUserId($userId);
		$assignment->setFileId($this->optionalInt($input['fileId'] ?? null));
		$assignment->setSourcePath($sourcePath);
		$assignment->setFileName(PathHelper::fileNameFromPath($sourcePath) ?: 'Bild');
		$assignment->setMimeType($this->optionalString($input['mimeType'] ?? null, 128));
		$assignment->setTargetType('skip');
		$assignment->setTargetLabel('Übersprungen');
		$assignment->setHotkey($this->optionalString($input['hotkey'] ?? '0', 16));
		$assignment->setActionStatus('skipped');
		$assignment->setCreatedAt($now);
		$assignment->setUpdatedAt($now);
		$assignment = $this->assignmentMapper->insert($assignment);

		$job->setStatus($job->getStatus() === 'draft' ? 'sorting' : $job->getStatus());
		$job->setSkippedFiles($job->getSkippedFiles() + 1);
		$job->setUpdatedAt($now);
		$this->jobMapper->update($job);

		$this->logService->debug('image_skipped', $userId, [
			'jobId' => $jobId,
			'assignmentId' => $assignment->getId(),
			'sourcePath' => $sourcePath,
		], $jobId, 'Bild wurde übersprungen.');

		return [
			'assignment' => $this->serializeAssignment($assignment),
			'job' => $this->jobService->serializeJob($job),
		];
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function undoLast(string $userId, int $jobId): array {
		$this->jobMapper->findForUserById($userId, $jobId);
		$assignment = $this->assignmentMapper->findLastForJob($userId, $jobId);
		return $this->removeAssignment($userId, $jobId, $assignment, 'Letzte Entscheidung wurde zurückgenommen.');
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function removeQueueItem(string $userId, int $jobId, int $queueItemId): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$item = $this->queueMapper->findForUserById($userId, $queueItemId);
		if ($item->getJobId() !== $jobId) {
			throw new DoesNotExistException('Queue item not found');
		}
		if (!in_array($item->getStatus(), self::REMOVABLE_QUEUE_STATUSES, true)) {
			throw new \InvalidArgumentException('Diese Ablage kann nicht mehr entfernt werden, weil sie schon verarbeitet wird oder verarbeitet wurde.');
		}

		$assignment = $item->getAssignmentId() !== null
			? $this->assignmentMapper->findForUserById($userId, $item->getAssignmentId())
			: null;
		$this->queueMapper->delete($item);
		if ($assignment !== null) {
			$this->assignmentMapper->delete($assignment);
		}
		$job = $this->refreshJobAfterRemoval($job, $assignment?->getTargetType() ?? $item->getOperationType());
		$this->logService->info('queue_item_removed', $userId, [
			'jobId' => $jobId,
			'queueItemId' => $queueItemId,
			'assignmentId' => $assignment?->getId(),
			'sourcePath' => $item->getSourcePath(),
		], $jobId, 'Ablagepunkt wurde entfernt.');

		return [
			'removed' => [
				'queueItemId' => $queueItemId,
				'assignmentId' => $assignment?->getId(),
				'sourcePath' => $item->getSourcePath(),
			],
			'job' => $this->jobService->serializeJob($job),
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function favorites(string $userId, string $mode, string $hotkeyMode = 'number-row', array $customHotkeys = []): array {
		$favorites = array_map(fn ($favorite): array => [
			'id' => $favorite->getId(),
			'label' => $favorite->getTargetLabel(),
			'path' => $favorite->getTargetPath(),
			'targetId' => $favorite->getTargetId(),
			'hotkey' => $this->displayHotkey($favorite->getSortPosition(), $hotkeyMode, $customHotkeys),
			'position' => $favorite->getSortPosition(),
			'targetMode' => $favorite->getTargetMode(),
			'locked' => false,
		], $this->favoriteMapper->findForUserAndMode($userId, $mode, 9));

		$favorites[] = [
			'id' => 'skip',
			'label' => 'Überspringen',
			'path' => null,
			'targetId' => null,
			'hotkey' => '0',
			'position' => 10,
			'locked' => true,
			'targetType' => 'skip',
		];

		return $favorites;
	}

	/**
	 * @return array<string, mixed>
	 */
	private function removeAssignment(string $userId, int $jobId, SortAssignment $assignment, string $message): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		if ($assignment->getJobId() !== $jobId) {
			throw new DoesNotExistException('Assignment not found');
		}
		$queueItem = $this->queueMapper->findForAssignment($userId, $jobId, $assignment->getId());
		if ($queueItem !== null && !in_array($queueItem->getStatus(), self::REMOVABLE_QUEUE_STATUSES, true)) {
			throw new \InvalidArgumentException('Diese Entscheidung kann nicht mehr zurückgenommen werden, weil die Ablage schon verarbeitet wird oder verarbeitet wurde.');
		}

		if ($queueItem !== null) {
			$this->queueMapper->delete($queueItem);
		}
		$this->assignmentMapper->delete($assignment);
		$job = $this->refreshJobAfterRemoval($job, $assignment->getTargetType());

		$this->logService->info('assignment_undone', $userId, [
			'jobId' => $jobId,
			'assignmentId' => $assignment->getId(),
			'queueItemId' => $queueItem?->getId(),
			'sourcePath' => $assignment->getSourcePath(),
			'targetLabel' => $assignment->getTargetLabel(),
		], $jobId, $message);

		return [
			'assignment' => $this->serializeAssignment($assignment),
			'queueItem' => $queueItem !== null ? $this->serializeQueueItem($queueItem) : null,
			'job' => $this->jobService->serializeJob($job),
			'message' => $message,
		];
	}

	private function refreshJobAfterRemoval(\OCA\ImageFlow\Db\SortJob $job, string $targetType): \OCA\ImageFlow\Db\SortJob {
		if ($targetType === 'skip') {
			$job->setSkippedFiles(max(0, $job->getSkippedFiles() - 1));
		} else {
			$job->setSortedFiles(max(0, $job->getSortedFiles() - 1));
		}
		$queuedOperations = $this->queueMapper->countForJobByStatuses($job->getId(), self::REMOVABLE_QUEUE_STATUSES);
		$job->setQueuedOperations($queuedOperations);
		if (in_array($job->getStatus(), ['draft', 'sorting', 'paused', 'ready', 'queued'], true)) {
			$hasDecisions = $job->getSortedFiles() > 0 || $job->getSkippedFiles() > 0 || $job->getQueuedOperations() > 0;
			if ($job->getStatus() === 'queued' && $queuedOperations > 0) {
				$job->setStatus('queued');
			} elseif ($job->getStatus() === 'paused' && $hasDecisions) {
				$job->setStatus('paused');
			} else {
				$job->setStatus($hasDecisions ? 'sorting' : 'draft');
			}
		}
		$job->setUpdatedAt(time());
		return $this->jobMapper->update($job);
	}

	private function displayHotkey(int $position, string $hotkeyMode, array $customHotkeys = []): string {
		if ($hotkeyMode === 'custom') {
			$key = $customHotkeys[$position - 1] ?? '';
			if (is_scalar($key) && trim((string)$key) !== '') {
				return mb_substr(mb_strtolower(trim((string)$key)), 0, 1);
			}
		}
		if ($hotkeyMode === 'letters') {
			return chr(ord('a') + max(0, min(8, $position - 1)));
		}

		return (string)max(1, min(9, $position));
	}

	/**
	 * @return array{images: array<int, array<string, mixed>>, page: array<string, mixed>}
	 */
	private function safeImagePage(string $userId, int $jobId, string $sourcePath, int $cursor, int $limit): array {
		try {
			return $this->folderBrowserService->listImagePage($userId, $sourcePath, $cursor, $limit);
		} catch (\Throwable $e) {
			$this->logService->exception('image_page_failed', $e, $userId, $jobId);
			return [
				'images' => [],
				'page' => [
					'cursor' => max(0, $cursor),
					'limit' => $limit,
					'total' => 0,
					'returned' => 0,
					'hasPrevious' => false,
					'previousCursor' => null,
					'hasNext' => false,
					'nextCursor' => null,
					'mode' => 'unavailable',
				],
			];
		}
	}

	/**
	 * @return array{mode: string, cursor: int, index: int, fileId: ?int}
	 */
	private function firstUnsortedPosition(string $userId, int $jobId, string $sourcePath, int $limit): array {
		$cursor = 0;
		$pagesScanned = 0;
		$maxPages = null;

		do {
			$imagePage = $this->safeImagePage($userId, $jobId, $sourcePath, $cursor, $limit);
			$images = $imagePage['images'];
			if ($maxPages === null) {
				$total = $this->optionalInt($imagePage['page']['total'] ?? null) ?? 0;
				$maxPages = max(1, (int)ceil($total / max(1, $limit)) + 1);
			}

			$paths = [];
			foreach ($images as $image) {
				$path = (string)($image['path'] ?? '');
				if ($path !== '') {
					$paths[] = $path;
				}
			}
			$assigned = array_flip($this->assignmentMapper->findExistingSourcePaths($userId, $jobId, $paths));

			foreach ($images as $index => $image) {
				$path = (string)($image['path'] ?? '');
				if ($path !== '' && !isset($assigned[$path])) {
					return [
						'mode' => 'unsorted',
						'cursor' => (int)($imagePage['page']['cursor'] ?? $cursor),
						'index' => $index,
						'fileId' => $this->optionalInt($image['fileId'] ?? null),
					];
				}
			}

			$hasNext = (bool)($imagePage['page']['hasNext'] ?? false);
			$nextCursor = $this->optionalInt($imagePage['page']['nextCursor'] ?? null);
			$cursor = $nextCursor ?? ($cursor + $limit);
			$pagesScanned++;
		} while ($hasNext && $pagesScanned < ($maxPages ?? 1));

		return [
			'mode' => 'unsorted',
			'cursor' => 0,
			'index' => 0,
			'fileId' => null,
		];
	}

	/**
	 * @param array<string, mixed> $options
	 * @return array{cursor: int, index: int, fileId: ?int, savedAt: ?int}
	 */
	private function savedPosition(array $options): array {
		$position = is_array($options['sortPosition'] ?? null) ? $options['sortPosition'] : [];
		return [
			'cursor' => max(0, $this->optionalInt($position['cursor'] ?? 0) ?? 0),
			'index' => max(0, $this->optionalInt($position['index'] ?? 0) ?? 0),
			'fileId' => $this->optionalInt($position['fileId'] ?? null),
			'savedAt' => $this->optionalInt($position['savedAt'] ?? null),
		];
	}

	private function startMode(?string $start): string {
		return match ($start) {
			'begin', 'unsorted' => $start,
			default => 'resume',
		};
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

	/**
	 * @return array<string, mixed>
	 */
	private function serializeAssignment(SortAssignment $assignment): array {
		return [
			'id' => $assignment->getId(),
			'jobId' => $assignment->getJobId(),
			'fileId' => $assignment->getFileId(),
			'sourcePath' => $assignment->getSourcePath(),
			'fileName' => $assignment->getFileName(),
			'mimeType' => $assignment->getMimeType(),
			'targetType' => $assignment->getTargetType(),
			'targetId' => $assignment->getTargetId(),
			'targetLabel' => $assignment->getTargetLabel(),
			'hotkey' => $assignment->getHotkey(),
			'actionStatus' => $assignment->getActionStatus(),
			'createdAt' => $assignment->getCreatedAt(),
			'updatedAt' => $assignment->getUpdatedAt(),
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	private function serializeQueueItem(QueueItem $item): array {
		return [
			'id' => $item->getId(),
			'jobId' => $item->getJobId(),
			'assignmentId' => $item->getAssignmentId(),
			'operationType' => $item->getOperationType(),
			'sourcePath' => $item->getSourcePath(),
			'targetPath' => $item->getTargetPath(),
			'targetAlbumId' => $item->getTargetAlbumId(),
			'status' => $item->getStatus(),
			'safeMode' => $item->getSafeMode(),
			'attempts' => $item->getAttempts(),
			'lastError' => $item->getLastError(),
			'createdAt' => $item->getCreatedAt(),
			'updatedAt' => $item->getUpdatedAt(),
			'executedAt' => $item->getExecutedAt(),
		];
	}

	private function optionalString(mixed $value, int $length): ?string {
		if (!is_scalar($value)) {
			return null;
		}
		$value = trim((string)$value);
		return $value === '' ? null : substr($value, 0, $length);
	}

	private function optionalPath(mixed $value): ?string {
		if (!is_scalar($value) || trim((string)$value) === '') {
			return null;
		}
		return PathHelper::displayPath((string)$value);
	}

	private function optionalInt(mixed $value): ?int {
		if (!is_numeric($value)) {
			return null;
		}
		return (int)$value;
	}
}
