<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<SortJob>
 */
class SortJobMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'imageflow_jobs', SortJob::class);
	}

	/**
	 * @return SortJob[]
	 */
	public function findForUser(string $userId, int $limit = 100): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->orderBy('updated_at', 'DESC')
			->setMaxResults(max(1, min(250, $limit)));

		return $this->findEntities($qb);
	}

	/**
	 * @throws DoesNotExistException
	 */
	public function findForUserById(string $userId, int $id): SortJob {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->setMaxResults(1);

		return $this->findEntity($qb);
	}

	public function countForUser(string $userId): int {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'job_count')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['job_count'] ?? 0);
	}
}
