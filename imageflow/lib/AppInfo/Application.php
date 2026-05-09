<?php

declare(strict_types=1);

namespace OCA\ImageFlow\AppInfo;

use OCA\ImageFlow\BackgroundJob\QueueExecutionJob;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\BackgroundJob\IJobList;

class Application extends App implements IBootstrap {
	public const APP_ID = 'imageflow';
	public const VERSION = '1.0.0';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
	}

	public function boot(IBootContext $context): void {
		$jobList = $context->getAppContainer()->get(IJobList::class);
		if (!$jobList->has(QueueExecutionJob::class, null)) {
			$jobList->add(QueueExecutionJob::class);
		}
	}
}
