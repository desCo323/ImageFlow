<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<QueueItem>
 */
class QueueItemMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'imageflow_queue', QueueItem::class);
	}

	/**
	 * @return QueueItem[]
	 */
	public function findForJob(string $userId, int $jobId, int $limit = 100): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->orderBy('created_at', 'DESC')
			->setMaxResults(max(1, min(250, $limit)));

		return $this->findEntities($qb);
	}

	/**
	 * @return QueueItem[]
	 */
	public function findDue(int $limit = 25): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->in('status', $qb->createNamedParameter(['queued'], IQueryBuilder::PARAM_STR_ARRAY)))
			->orderBy('created_at', 'ASC')
			->setMaxResults(max(1, min(100, $limit)));

		return $this->findEntities($qb);
	}

	public function countForJobByStatus(int $jobId, string $status): int {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'queue_count')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter($status)));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['queue_count'] ?? 0);
	}

	public function markPlannedQueuedForJob(string $userId, int $jobId): int {
		$qb = $this->db->getQueryBuilder();
		$qb->update($this->tableName)
			->set('status', $qb->createNamedParameter('queued'))
			->set('updated_at', $qb->createNamedParameter(time(), IQueryBuilder::PARAM_INT))
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('planned')));

		return $qb->executeStatement();
	}

	public function deleteForJob(string $userId, int $jobId): int {
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

		return $qb->executeStatement();
	}
}
