<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<AppLog>
 */
class AppLogMapper extends QBMapper {
	private const JOB_STATUS_EVENTS = [
		'job_created',
		'job_updated',
		'job_duplicated',
		'job_status_changed',
		'job_execution_queued',
		'job_processing_options_updated',
		'job_discarded',
		'assignment_planned',
		'assignment_duplicate_ignored',
		'assignment_source_already_decided',
		'image_skipped',
		'skip_duplicate_ignored',
		'queue_item_removed',
		'assignment_undone',
		'queue_manual_processing_blocked',
		'queue_manual_run_started',
		'queue_manual_run_finished',
		'queue_background_item_skipped_auto_disabled',
		'queue_execution_item_started',
		'queue_execution_item_executed',
		'queue_execution_item_blocked',
		'queue_execution_item_failed',
		'queue_execution_failed_exception',
		'queue_assignment_update_failed',
		'queue_job_stats_update_failed',
	];

	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'imageflow_logs', AppLog::class);
	}

	/**
	 * @return AppLog[]
	 */
	public function findRecent(int $limit = 100, ?string $level = null, ?string $userId = null, ?int $jobId = null): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->orderBy('created_at', 'DESC')
			->setMaxResults(max(1, min(5000, $limit)));

		if ($level !== null && $level !== '') {
			$qb->andWhere($qb->expr()->eq('level', $qb->createNamedParameter($level)));
		}
		if ($userId !== null && $userId !== '') {
			$qb->andWhere($qb->expr()->orX(
				$qb->expr()->eq('user_id', $qb->createNamedParameter($userId)),
				$qb->expr()->isNull('user_id'),
			));
		}
		if ($jobId !== null) {
			$qb->andWhere($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId)));
		}

		return $this->findEntities($qb);
	}

	/**
	 * @param int[] $jobIds
	 * @return AppLog[]
	 */
	public function findLatestForJobs(string $userId, array $jobIds): array {
		$jobIds = array_values(array_unique(array_filter($jobIds, static fn ($jobId): bool => is_int($jobId) && $jobId > 0)));
		if ($jobIds === []) {
			return [];
		}

		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->in('job_id', $qb->createNamedParameter($jobIds, IQueryBuilder::PARAM_INT_ARRAY)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->in('event', $qb->createNamedParameter(self::JOB_STATUS_EVENTS, IQueryBuilder::PARAM_STR_ARRAY)))
			->orderBy('created_at', 'DESC')
			->addOrderBy('id', 'DESC')
			->setMaxResults(min(1000, max(1, count($jobIds) * 10)));

		$latest = [];
		foreach ($this->findEntities($qb) as $log) {
			$jobId = $log->getJobId();
			if ($jobId !== null && !isset($latest[$jobId])) {
				$latest[$jobId] = $log;
			}
		}

		return array_values($latest);
	}

	public function deleteOlderThan(int $cutoff): int {
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->tableName)
			->where($qb->expr()->lt('created_at', $qb->createNamedParameter($cutoff, IQueryBuilder::PARAM_INT)));

		return $qb->executeStatement();
	}
}
