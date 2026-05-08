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
	public function state(string $userId, int $jobId): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$this->jobService->touchOpened($userId, $jobId);

		return [
			'job' => $this->jobService->serializeJob($job),
			'favorites' => $this->favorites($userId, $job->getTargetMode()),
			'recentAssignments' => array_map([$this, 'serializeAssignment'], $this->assignmentMapper->findForJob($userId, $jobId, 20)),
			'queue' => array_map([$this, 'serializeQueueItem'], $this->queueMapper->findForJob($userId, $jobId, 20)),
			'nextImages' => $this->safeSamples($userId, $job->getSourcePath()),
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
		$queueItem->setTargetPath($job->getTargetMode() === 'album' ? null : ($targetPath ?? $job->getTargetPath()));
		$queueItem->setTargetAlbumId($job->getTargetMode() === 'album' ? $targetId : null);
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
		], $jobId, 'Sortierentscheidung wurde als geplante Operation gespeichert.');

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
		$assignment->setTargetLabel('Uebersprungen');
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
		], $jobId, 'Bild wurde uebersprungen.');

		return [
			'assignment' => $this->serializeAssignment($assignment),
			'job' => $this->jobService->serializeJob($job),
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function favorites(string $userId, string $mode): array {
		$favorites = array_map(static fn ($favorite): array => [
			'id' => $favorite->getId(),
			'label' => $favorite->getTargetLabel(),
			'path' => $favorite->getTargetPath(),
			'targetId' => $favorite->getTargetId(),
			'hotkey' => $favorite->getHotkey(),
			'position' => $favorite->getSortPosition(),
		], $this->favoriteMapper->findForUserAndMode($userId, $mode, 10));

		if ($favorites !== []) {
			return $favorites;
		}

		return [
			['id' => 'placeholder-1', 'label' => 'Favorit 1', 'path' => null, 'targetId' => null, 'hotkey' => '1', 'position' => 1],
			['id' => 'placeholder-2', 'label' => 'Favorit 2', 'path' => null, 'targetId' => null, 'hotkey' => '2', 'position' => 2],
			['id' => 'skip', 'label' => 'Ueberspringen', 'path' => null, 'targetId' => null, 'hotkey' => '0', 'position' => 10],
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function safeSamples(string $userId, string $sourcePath): array {
		try {
			return $this->folderBrowserService->listSampleImages($userId, $sourcePath, 12);
		} catch (\Throwable) {
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
