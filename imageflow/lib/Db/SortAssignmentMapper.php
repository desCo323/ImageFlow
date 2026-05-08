<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<SortAssignment>
 */
class SortAssignmentMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'imageflow_assignments', SortAssignment::class);
	}

	/**
	 * @return SortAssignment[]
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

	public function deleteForJob(string $userId, int $jobId): int {
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

		return $qb->executeStatement();
	}
}
