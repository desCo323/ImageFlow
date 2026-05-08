<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortJobMapper;

class QueueExecutionService {
	public function __construct(
		private readonly QueueItemMapper $queueMapper,
		private readonly SortJobMapper $jobMapper,
		private readonly LogService $logService,
	) {
	}

	/**
	 * Reale Dateioperationen bleiben gesperrt, bis der Ausfuehrungsmodus bewusst
	 * aktiviert wird. Der Worker markiert Queue-Zeilen nachvollziehbar als blocked,
	 * statt sie still zurueck auf planned zu setzen.
	 */
	public function processDue(int $limit = 25): int {
		$processed = 0;
		foreach ($this->queueMapper->findDue($limit) as $item) {
			$item->setAttempts($item->getAttempts() + 1);
			$item->setStatus('blocked');
			$item->setLastError('Real file writes are disabled. Review the dry-run worklist before enabling execution.');
			$item->setUpdatedAt(time());
			$this->queueMapper->update($item);

			try {
				$job = $this->jobMapper->findForUserById($item->getUserId(), $item->getJobId());
				$job->setStatus('ready');
				$job->setQueuedOperations($this->queueMapper->countForJobByStatus($item->getJobId(), 'queued'));
				$job->setUpdatedAt(time());
				$this->jobMapper->update($job);
			} catch (\Throwable) {
			}

			$this->logService->warning('queue_execution_blocked_guard', $item->getUserId(), [
				'queueItemId' => $item->getId(),
				'jobId' => $item->getJobId(),
				'operationType' => $item->getOperationType(),
				'sourcePath' => $item->getSourcePath(),
				'targetPath' => $item->getTargetPath(),
			], $item->getJobId(), 'Queue-Ausfuehrung wurde durch den Sicherheitsmodus blockiert.');
			$processed++;
		}

		return $processed;
	}
}
