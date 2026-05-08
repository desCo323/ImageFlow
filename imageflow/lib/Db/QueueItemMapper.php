<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\DoesNotExistException;
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

	/**
	 * @return QueueItem[]
	 */
	public function findDueForJob(string $userId, int $jobId, int $limit = 25): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter(['queued'], IQueryBuilder::PARAM_STR_ARRAY)))
			->orderBy('created_at', 'ASC')
			->setMaxResults(max(1, min(100, $limit)));

		return $this->findEntities($qb);
	}

	/**
	 * @throws DoesNotExistException
	 */
	public function findForUserById(string $userId, int $id): QueueItem {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->setMaxResults(1);

		return $this->findEntity($qb);
	}

	public function findForAssignment(string $userId, int $jobId, int $assignmentId): ?QueueItem {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('assignment_id', $qb->createNamedParameter($assignmentId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->setMaxResults(1);

		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
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

	/**
	 * @param string[] $statuses
	 */
	public function countForJobByStatuses(int $jobId, array $statuses): int {
		$statuses = array_values(array_unique(array_filter($statuses, static fn ($status): bool => is_string($status) && $status !== '')));
		if ($statuses === []) {
			return 0;
		}

		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'queue_count')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter($statuses, IQueryBuilder::PARAM_STR_ARRAY)));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['queue_count'] ?? 0);
	}

	public function findDuplicateOperation(
		string $userId,
		int $jobId,
		string $operationType,
		string $sourcePath,
		?string $targetPath,
		?string $targetAlbumId,
	): ?QueueItem {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('job_id', $qb->createNamedParameter($jobId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('operation_type', $qb->createNamedParameter($operationType)))
			->andWhere($qb->expr()->eq('source_path', $qb->createNamedParameter($sourcePath)))
			->orderBy('created_at', 'DESC')
			->setMaxResults(1);

		if ($targetPath === null) {
			$qb->andWhere($qb->expr()->isNull('target_path'));
		} else {
			$qb->andWhere($qb->expr()->eq('target_path', $qb->createNamedParameter($targetPath)));
		}

		if ($targetAlbumId === null) {
			$qb->andWhere($qb->expr()->isNull('target_album_id'));
		} else {
			$qb->andWhere($qb->expr()->eq('target_album_id', $qb->createNamedParameter($targetAlbumId)));
		}

		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
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
