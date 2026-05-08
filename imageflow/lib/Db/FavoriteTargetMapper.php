<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\QBMapper;
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
}
