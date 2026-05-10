<?php

declare(strict_types=1);

namespace OCA\ImageFlow\BackgroundJob;

use OCA\ImageFlow\Service\QueueExecutionService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\TimedJob;

class QueueExecutionJob extends TimedJob {
	public function __construct(
		ITimeFactory $time,
		private readonly QueueExecutionService $queueExecutionService,
	) {
		parent::__construct($time);
		$this->setAllowParallelRuns(false);
		$this->setTimeSensitivity(IJob::TIME_SENSITIVE);
		$this->setInterval(60);
	}

	protected function run($argument): void {
		$this->queueExecutionService->processDue(25);
	}
}
