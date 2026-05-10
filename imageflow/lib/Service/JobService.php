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
	private const TARGET_ORDERINGS = ['relevance', 'alphabetical'];
	private const HOTKEY_MODES = ['number-row', 'letters', 'custom'];
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
		$jobs = $this->jobMapper->findForUser($userId);
		$latestLogs = $this->logService->latestForJobs($userId, array_map(
			static fn (SortJob $job): int => (int)$job->getId(),
			$jobs,
		));

		return array_map(
			fn (SortJob $job): array => $this->serializeJob($job, $latestLogs[(int)$job->getId()] ?? null),
			$jobs,
		);
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	public function createJob(string $userId, array $input): array {
		$now = time();
		$settings = $this->jobSettings($input, null);

		$job = new SortJob();
		$job->setUserId($userId);
		$job->setName($settings['name']);
		$job->setSourcePath($settings['sourcePath']);
		$job->setTargetMode($settings['targetMode']);
		$job->setTargetPath($settings['targetPath']);
		$job->setAlbumName($settings['albumName']);
		$job->setStatus('draft');
		$job->setSafeMode($settings['safeMode']);
		$job->setOptionsJson(json_encode([
			...$settings['options'],
			'createdBy' => 'imageflow-ui',
		], JSON_THROW_ON_ERROR));
		$job->setCreatedAt($now);
		$job->setUpdatedAt($now);

		$job = $this->jobMapper->insert($job);
		$this->logService->info('job_created', $userId, [
			'jobId' => $job->getId(),
			'mode' => $settings['targetMode'],
			'sourcePath' => $settings['sourcePath'],
			'targetPath' => $settings['targetPath'],
			'safeMode' => $job->getSafeMode(),
		], $job->getId(), 'Runde wurde angelegt.');

		return $this->serializeJob($job);
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function updateJob(string $userId, int $jobId, array $input): array {
		$job = $this->jobMapper->findForUserById($userId, $jobId);
		$settings = $this->jobSettings($input, $job);

		if ($this->hasSavedDecisions($job) && $this->hasStructuralChanges($job, $settings)) {
			throw new \InvalidArgumentException('Diese Runde hat schon Entscheidungen. Quelle, Zielart und Sicherheitsmodus bleiben deshalb gesperrt. Erstelle dafür ein Duplikat.');
		}
		if ($job->getStatus() === 'executing' || $job->getStatus() === 'done') {
			throw new \InvalidArgumentException('Laufende oder erledigte Runden können nicht mehr bearbeitet werden.');
		}

		$job->setName($settings['name']);
		$job->setSourcePath($settings['sourcePath']);
		$job->setTargetMode($settings['targetMode']);
		$job->setTargetPath($settings['targetPath']);
		$job->setAlbumName($settings['albumName']);
		$job->setSafeMode($settings['safeMode']);
		$job->setOptionsJson(json_encode($settings['options'], JSON_THROW_ON_ERROR));
		$job->setUpdatedAt(time());
		$job = $this->jobMapper->update($job);

		$this->logService->info('job_updated', $userId, [
			'jobId' => $jobId,
			'mode' => $settings['targetMode'],
			'sourcePath' => $settings['sourcePath'],
			'targetPath' => $settings['targetPath'],
			'safeMode' => $settings['safeMode'],
		], $jobId, 'Runde wurde gespeichert.');

		return $this->serializeJob($job);
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function duplicateJob(string $userId, int $jobId): array {
		$source = $this->jobMapper->findForUserById($userId, $jobId);
		$options = $this->decodeJson($source->getOptionsJson());
		$copy = $this->createJob($userId, [
			'name' => substr($source->getName() . ' Duplikat', 0, 160),
			'sourcePath' => $source->getSourcePath(),
			'targetMode' => $source->getTargetMode(),
			'targetPath' => $source->getTargetPath(),
			'albumName' => $source->getAlbumName(),
			'safeMode' => $source->getSafeMode(),
			'autoProcess' => (bool)($options['autoProcess'] ?? false),
			'preloadMode' => $options['preloadMode'] ?? 'balanced',
			'targetOrdering' => $options['targetOrdering'] ?? 'relevance',
			'hotkeys' => $options['hotkeys'] ?? 'number-row',
			'customHotkeys' => $options['customHotkeys'] ?? [],
		]);

		$this->logService->info('job_duplicated', $userId, [
			'sourceJobId' => $jobId,
			'copyJobId' => $copy['id'] ?? null,
		], (int)($copy['id'] ?? $jobId), 'Runde wurde dupliziert.');

		return $copy;
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
		], $jobId, 'Rundenstatus wurde geändert.');

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
		], $jobId, 'Ablage wurde in der Übersicht für später gemerkt.');

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
			throw new \InvalidArgumentException('Runden mit laufender oder bereits abgelegter Ablage können nicht verworfen werden.');
		}

		$removedQueue = $this->queueMapper->deleteForJob($userId, $jobId);
		$removedAssignments = $this->assignmentMapper->deleteForJob($userId, $jobId);
		$this->jobMapper->delete($job);

		$this->logService->info('job_discarded', $userId, [
			'jobId' => $jobId,
			'removedAssignments' => $removedAssignments,
			'removedQueueItems' => $removedQueue,
		], null, 'Runde wurde verworfen.');

		return [
			'assignments' => $removedAssignments,
			'queueItems' => $removedQueue,
			'jobs' => 1,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function serializeJob(SortJob $job, ?array $latestLog = null): array {
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
			'lastRunStatus' => $latestLog,
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array{name: string, sourcePath: string, targetMode: string, targetPath: ?string, albumName: ?string, safeMode: bool, options: array<string, mixed>}
	 */
	private function jobSettings(array $input, ?SortJob $current): array {
		$currentOptions = $current !== null ? $this->decodeJson($current->getOptionsJson()) : [];
		$mode = $this->targetMode((string)($input['targetMode'] ?? $current?->getTargetMode() ?? 'album'));
		$sourcePath = PathHelper::displayPath((string)($input['sourcePath'] ?? $current?->getSourcePath() ?? '/'));
		$targetPath = null;
		if ($mode === 'move' || $mode === 'copy') {
			$targetPath = PathHelper::displayPath((string)($input['targetPath'] ?? $current?->getTargetPath() ?? '/'));
		}

		$name = trim((string)($input['name'] ?? $current?->getName() ?? ''));
		if ($name === '') {
			$name = 'Runde ' . date('Y-m-d H:i');
		}

		$options = $currentOptions;
		$options['targetOrdering'] = $this->targetOrdering((string)($input['targetOrdering'] ?? $options['targetOrdering'] ?? 'relevance'));
		$options['hotkeys'] = $this->hotkeyMode((string)($input['hotkeys'] ?? $options['hotkeys'] ?? 'number-row'));
		$options['customHotkeys'] = $this->customHotkeys($input['customHotkeys'] ?? $options['customHotkeys'] ?? []);
		$options['preloadMode'] = $this->preloadMode((string)($input['preloadMode'] ?? $options['preloadMode'] ?? 'balanced'));
		$options['autoProcess'] = $this->boolValue($input['autoProcess'] ?? $options['autoProcess'] ?? false);
		$options['recursiveSource'] = $this->boolValue($input['recursiveSource'] ?? $options['recursiveSource'] ?? false);

		return [
			'name' => substr($name, 0, 160),
			'sourcePath' => $sourcePath,
			'targetMode' => $mode,
			'targetPath' => $targetPath,
			'albumName' => $mode === 'album' ? $this->optionalString($input['albumName'] ?? $current?->getAlbumName(), 255) : null,
			'safeMode' => $this->boolValue($input['safeMode'] ?? $current?->getSafeMode() ?? true),
			'options' => $options,
		];
	}

	/**
	 * @param array{name: string, sourcePath: string, targetMode: string, targetPath: ?string, albumName: ?string, safeMode: bool, options: array<string, mixed>} $settings
	 */
	private function hasStructuralChanges(SortJob $job, array $settings): bool {
		return $job->getSourcePath() !== $settings['sourcePath']
			|| $job->getTargetMode() !== $settings['targetMode']
			|| $job->getTargetPath() !== $settings['targetPath']
			|| $job->getAlbumName() !== $settings['albumName']
			|| $job->getSafeMode() !== $settings['safeMode'];
	}

	private function hasSavedDecisions(SortJob $job): bool {
		return $job->getSortedFiles() > 0
			|| $job->getSkippedFiles() > 0
			|| $job->getQueuedOperations() > 0
			|| $job->getExecutedOperations() > 0
			|| $job->getFailedOperations() > 0;
	}

	private function targetMode(string $mode): string {
		if (!in_array($mode, self::MODES, true)) {
			throw new \InvalidArgumentException('Ungültige Ablageart.');
		}

		return $mode;
	}

	private function targetOrdering(string $ordering): string {
		return in_array($ordering, self::TARGET_ORDERINGS, true) ? $ordering : 'relevance';
	}

	private function hotkeyMode(string $mode): string {
		return in_array($mode, self::HOTKEY_MODES, true) ? $mode : 'number-row';
	}

	/**
	 * @return string[]
	 */
	private function customHotkeys(mixed $value): array {
		$items = is_array($value) ? $value : [];
		$keys = [];
		$seen = [];
		for ($index = 0; $index < 9; $index++) {
			$key = is_scalar($items[$index] ?? null) ? mb_strtolower(trim((string)$items[$index])) : '';
			$key = mb_substr($key, 0, 1);
			if ($key === '' || in_array($key, ['0', ' '], true) || isset($seen[$key])) {
				$key = '';
			}
			$keys[] = $key;
			if ($key !== '') {
				$seen[$key] = true;
			}
		}

		return $keys;
	}

	private function preloadMode(string $mode): string {
		return in_array($mode, ['light', 'balanced', 'turbo'], true) ? $mode : 'balanced';
	}

	private function boolValue(mixed $value): bool {
		if (is_bool($value)) {
			return $value;
		}
		if (is_string($value)) {
			return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
		}

		return (bool)$value;
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	private function processingOptions(SortJob $job, array $input): array {
		$options = $this->decodeJson($job->getOptionsJson());
		$options['autoProcess'] = $this->boolValue($input['autoProcess'] ?? ($options['autoProcess'] ?? false));
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
