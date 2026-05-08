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
	 * The first skeleton keeps execution intentionally non-destructive. Planned queue rows
	 * can be promoted to queued, but this worker only records that real writes are disabled.
	 */
	public function processDue(int $limit = 25): int {
		$processed = 0;
		foreach ($this->queueMapper->findDue($limit) as $item) {
			$item->setAttempts($item->getAttempts() + 1);
			$item->setStatus('planned');
			$item->setLastError('Execution worker is in non-destructive bootstrap mode.');
			$item->setUpdatedAt(time());
			$this->queueMapper->update($item);

			try {
				$job = $this->jobMapper->findForUserById($item->getUserId(), $item->getJobId());
				$job->setStatus('ready');
				$job->setUpdatedAt(time());
				$this->jobMapper->update($job);
			} catch (\Throwable) {
			}

			$this->logService->warning('queue_execution_skipped_bootstrap', $item->getUserId(), [
				'queueItemId' => $item->getId(),
				'jobId' => $item->getJobId(),
				'operationType' => $item->getOperationType(),
			], $item->getJobId(), 'Queue-Ausfuehrung ist im Bootstrap-Modus deaktiviert.');
			$processed++;
		}

		return $processed;
	}
}
