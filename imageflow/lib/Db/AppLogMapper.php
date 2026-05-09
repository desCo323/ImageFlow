<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<AppLog>
 */
class AppLogMapper extends QBMapper {
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
			->setMaxResults(max(1, min(500, $limit)));

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
}
