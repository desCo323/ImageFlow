<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<FavoriteTarget>
 */
class FavoriteTargetMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'imageflow_favorites', FavoriteTarget::class);
	}

	/**
	 * @return FavoriteTarget[]
	 */
	public function findForUserAndMode(string $userId, string $targetMode, int $limit = 20): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('target_mode', $qb->createNamedParameter($targetMode)))
			->orderBy('sort_position', 'ASC')
			->addOrderBy('target_label', 'ASC')
			->setMaxResults(max(1, min(50, $limit)));

		return $this->findEntities($qb);
	}

	/**
	 * @throws DoesNotExistException
	 */
	public function findForUserById(string $userId, int $id): FavoriteTarget {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->setMaxResults(1);

		return $this->findEntity($qb);
	}

	public function findDuplicate(string $userId, string $targetMode, ?string $targetId, ?string $targetPath): ?FavoriteTarget {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('target_mode', $qb->createNamedParameter($targetMode)))
			->setMaxResults(1);

		if ($targetPath !== null) {
			$qb->andWhere($qb->expr()->eq('target_path', $qb->createNamedParameter($targetPath)));
		} elseif ($targetId !== null) {
			$qb->andWhere($qb->expr()->eq('target_id', $qb->createNamedParameter($targetId)));
		} else {
			return null;
		}

		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	public function countForUserAndMode(string $userId, string $targetMode): int {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'favorite_count')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('target_mode', $qb->createNamedParameter($targetMode)));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['favorite_count'] ?? 0);
	}

	public function maxSortPosition(string $userId, string $targetMode): int {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->max('sort_position'), 'max_sort_position')
			->from($this->tableName)
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('target_mode', $qb->createNamedParameter($targetMode)));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['max_sort_position'] ?? 0);
	}
}
