<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\DoesNotExistException;
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

	/**
	 * @throws DoesNotExistException
	 */
	public function findForUserById(string $userId, int $id): SortAssignment {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->setMaxResults(1);

		return $this->findEntity($qb);
	}

	/**
	 * @param string[] $sourcePaths
	 * @return string[]
	 */
	public function findExistingSourcePaths(string $userId, int $jobId, array $sourcePaths): array {
		$sourcePaths = array_values(array_unique(array_filter($sourcePaths, static fn ($path): bool => is_string($path) && $path !== '')));
		if ($sourcePaths === []) {
			return [];
		}

		$qb = $this->db->getQueryBuilder();
		$qb->select('source_path')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->in('source_path', $qb->createNamedParameter($sourcePaths, IQueryBuilder::PARAM_STR_ARRAY)));

		$result = $qb->executeQuery();
		$existing = [];
		while ($row = $result->fetch()) {
			$existing[] = (string)$row['source_path'];
		}

		return array_values(array_unique($existing));
	}
}
