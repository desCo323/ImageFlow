<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortAssignmentMapper;
use OCA\ImageFlow\Db\SortJob;
use OCA\ImageFlow\Db\SortJobMapper;
use OCP\AppFramework\Db\DoesNotExistException;

class JobService {
	private const MODES = ['album', 'move', 'copy'];
	private const STATUSES = [
		'draft',
		'sorting',
		'paused',
		'ready',
		'queued',
		'executing',
		'done',
		'error',
	];

	public function __construct(
		private readonly SortJobMapper $jobMapper,
		private readonly QueueItemMapper $queueMapper,
		private readonly SortAssignmentMapper $assignmentMapper,
		private readonly LogService $logService,
	) {
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function listJobs(string $userId): array {
		return array_map([$this, 'serializeJob'], $this->jobMapper->findForUser($userId));
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	public function createJob(string $userId, array $input): array {
		$now = time();
		$mode = $this->targetMode((string)($input['targetMode'] ?? 'album'));
		$sourcePath = PathHelper::displayPath((string)($input['sourcePath'] ?? '/'));
		$targetPath = null;
		if ($mode === 'move' || $mode === 'copy') {
			$targetPath = PathHelper::displayPath((string)($input['targetPath'] ?? '/'));
		}

		$name = trim((string)($input['name'] ?? ''));
		if ($name === '') {
			$name = 'Sortierung ' . date('Y-m-d H:i');
		}

		$job = new SortJob();
		$job->setUserId($userId);
		$job->setName(substr($name, 0, 160));
		$job->setSourcePath($sourcePath);
		$job->setTargetMode($mode);
		$job->setTargetPath($targetPath);
		$job->setAlbumName($mode === 'album' ? $this->optionalString($input['albumName'] ?? null, 255) : null);
		$job->setStatus('draft');
		$job->setSafeMode((bool)($input['safeMode'] ?? true));
		$job->setOptionsJson(json_encode([
			'targetOrdering' => $input['targetOrdering'] ?? 'relevance',
			'hotkeys' => $input['hotkeys'] ?? 'number-row',
			'preloadMode' => $this->preloadMode((string)($input['preloadMode'] ?? 'balanced')),
			'autoProcess' => (bool)($input['autoProcess'] ?? false),
			'createdBy' => 'imageflow-ui',
		], JSON_THROW_ON_ERROR));
		$job->setCreatedAt($now);
		$job->setUpdatedAt($now);

		$job = $this->jobMapper->insert($job);
		$this->logService->info('job_created', $userId, [
			'jobId' => $job->getId(),
			'mode' => $mode,
			'sourcePath' => $sourcePath,
			'targetPath' => $targetPath,
			'safeMode' => $job->getSafeMode(),
		], $job->getId(), 'Flow wurde angelegt.');

		return $this->serializeJob($job);
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function getJob(string $userId, int $jobId): array {
		return $this->serializeJob($this->jobMapper->findForUserById($userId, $jobId));
	}

	/**
	 * @throws DoesNotExistException
	 */
	public function touchOpened(string $userId, int $jobId): SortJob {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$job->setLastOpenedAt(time());
		$job->setUpdatedAt(time());
		return $this->jobMapper->update($job);
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function setStatus(string $userId, int $jobId, string $status): array {
		if (!in_array($status, self::STATUSES, true)) {
			throw new \InvalidArgumentException('Invalid job status.');
		}

		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$job->setStatus($status);
		$job->setUpdatedAt(time());
		if ($status === 'queued') {
			$job->setQueuedOperations(
				$this->queueMapper->countForJobByStatus($jobId, 'queued') + $this->queueMapper->countForJobByStatus($jobId, 'planned')
			);
		}
		$job = $this->jobMapper->update($job);
		$this->logService->info('job_status_changed', $userId, [
			'jobId' => $jobId,
			'status' => $status,
		], $jobId, 'Flowstatus wurde geaendert.');

		return $this->serializeJob($job);
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function queueExecution(string $userId, int $jobId, array $input = []): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$options = $this->processingOptions($job, $input);
		$queued = $this->queueMapper->markPlannedQueuedForJob($userId, $jobId);
		$job->setStatus('queued');
		$job->setQueuedOperations($this->queueMapper->countForJobByStatus($jobId, 'queued'));
		$job->setOptionsJson(json_encode($options, JSON_THROW_ON_ERROR));
		$job->setUpdatedAt(time());
		$job = $this->jobMapper->update($job);
		$this->logService->info('job_execution_queued', $userId, [
			'jobId' => $jobId,
			'queuedItems' => $queued,
			'safeMode' => $job->getSafeMode(),
			'autoProcess' => (bool)$options['autoProcess'],
		], $jobId, 'Ausfuehrung wurde vom Hauptmenue aus vorgemerkt.');

		return $this->serializeJob($job);
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function updateProcessingOptions(string $userId, int $jobId, array $input = []): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$options = $this->processingOptions($job, $input);
		$job->setOptionsJson(json_encode($options, JSON_THROW_ON_ERROR));
		$job->setUpdatedAt(time());
		$job = $this->jobMapper->update($job);
		$this->logService->info('job_processing_options_updated', $userId, [
			'jobId' => $jobId,
			'autoProcess' => (bool)$options['autoProcess'],
			'preloadMode' => $options['preloadMode'] ?? 'balanced',
		], $jobId, 'Ablage-Einstellungen wurden aktualisiert.');

		return $this->serializeJob($job);
	}

	/**
	 * @return array<string, int>
	 * @throws DoesNotExistException
	 */
	public function discardJob(string $userId, int $jobId): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		if ($job->getStatus() === 'executing' || $job->getExecutedOperations() > 0) {
			throw new \InvalidArgumentException('Flows mit laufender oder bereits ausgefuehrter Ablage koennen nicht verworfen werden.');
		}

		$removedQueue = $this->queueMapper->deleteForJob($userId, $jobId);
		$removedAssignments = $this->assignmentMapper->deleteForJob($userId, $jobId);
		$this->jobMapper->delete($job);

		$this->logService->info('job_discarded', $userId, [
			'jobId' => $jobId,
			'removedAssignments' => $removedAssignments,
			'removedQueueItems' => $removedQueue,
		], null, 'Flow wurde verworfen.');

		return [
			'assignments' => $removedAssignments,
			'queueItems' => $removedQueue,
			'jobs' => 1,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function serializeJob(SortJob $job): array {
		return [
			'id' => $job->getId(),
			'name' => $job->getName(),
			'sourcePath' => $job->getSourcePath(),
			'targetMode' => $job->getTargetMode(),
			'targetPath' => $job->getTargetPath(),
			'albumName' => $job->getAlbumName(),
			'status' => $job->getStatus(),
			'safeMode' => $job->getSafeMode(),
			'options' => $this->decodeJson($job->getOptionsJson()),
			'totalFiles' => $job->getTotalFiles(),
			'sortedFiles' => $job->getSortedFiles(),
			'skippedFiles' => $job->getSkippedFiles(),
			'queuedOperations' => $job->getQueuedOperations(),
			'executedOperations' => $job->getExecutedOperations(),
			'failedOperations' => $job->getFailedOperations(),
			'createdAt' => $job->getCreatedAt(),
			'updatedAt' => $job->getUpdatedAt(),
			'lastOpenedAt' => $job->getLastOpenedAt(),
			'executionStartedAt' => $job->getExecutionStartedAt(),
			'executionFinishedAt' => $job->getExecutionFinishedAt(),
			'errorMessage' => $job->getErrorMessage(),
		];
	}

	private function targetMode(string $mode): string {
		if (!in_array($mode, self::MODES, true)) {
			throw new \InvalidArgumentException('Invalid target mode.');
		}

		return $mode;
	}

	private function preloadMode(string $mode): string {
		return in_array($mode, ['light', 'balanced', 'turbo'], true) ? $mode : 'balanced';
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	private function processingOptions(SortJob $job, array $input): array {
		$options = $this->decodeJson($job->getOptionsJson());
		$options['autoProcess'] = (bool)($input['autoProcess'] ?? ($options['autoProcess'] ?? false));
		if (isset($input['preloadMode']) && is_scalar($input['preloadMode'])) {
			$options['preloadMode'] = $this->preloadMode((string)$input['preloadMode']);
		}
		if (!isset($options['preloadMode']) || !is_string($options['preloadMode'])) {
			$options['preloadMode'] = 'balanced';
		}

		return $options;
	}

	private function optionalString(mixed $value, int $length): ?string {
		if (!is_scalar($value)) {
			return null;
		}
		$value = trim((string)$value);
		return $value === '' ? null : substr($value, 0, $length);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function decodeJson(?string $json): array {
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
}
