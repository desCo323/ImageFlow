<?php

declare(strict_types=1);

namespace OCA\ImageFlow\AppInfo;

use OCA\ImageFlow\BackgroundJob\QueueExecutionJob;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\IJobList;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

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
		$this->ensureQueueJobRunsWithNormalCron($context->getAppContainer()->get(IDBConnection::class));
	}

	private function ensureQueueJobRunsWithNormalCron(IDBConnection $db): void {
		$qb = $db->getQueryBuilder();
		$qb->update('jobs')
			->set('time_sensitive', $qb->createNamedParameter(IJob::TIME_SENSITIVE, IQueryBuilder::PARAM_INT))
			->set('last_checked', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT))
			->where($qb->expr()->eq('class', $qb->createNamedParameter(QueueExecutionJob::class)))
			->andWhere($qb->expr()->neq('time_sensitive', $qb->createNamedParameter(IJob::TIME_SENSITIVE, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
