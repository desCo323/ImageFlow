<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class TargetService {
	public function __construct(
		private readonly IDBConnection $db,
		private readonly FolderBrowserService $folderBrowserService,
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function listTargets(string $userId, string $mode, string $query = '', string $path = '/', int $limit = 100): array {
		$limit = max(1, min(200, $limit));
		if ($mode === 'album') {
			return [
				'mode' => $mode,
				'ordering' => $query === '' ? 'alphabetical' : 'search',
				'targets' => $this->listAlbums($userId, $query, $limit),
			];
		}

		return [
			'mode' => $mode,
			'ordering' => 'alphabetical',
			'folders' => $this->folderBrowserService->listFolders($userId, $path, $limit),
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function listAlbums(string $userId, string $query, int $limit): array {
		try {
			$qb = $this->db->getQueryBuilder();
			$qb->select('album_id', 'name', 'location', 'created', 'last_added_photo')
				->from('photos_albums')
				->where($qb->expr()->eq('user', $qb->createNamedParameter($userId)))
				->orderBy('name', 'ASC')
				->setMaxResults($limit);

			if ($query !== '') {
				$qb->andWhere($qb->expr()->iLike('name', $qb->createNamedParameter('%' . $this->db->escapeLikeParameter($query) . '%')));
			}

			$rows = $qb->executeQuery()->fetchAll();
			return array_map(static fn (array $row): array => [
				'id' => (string)$row['album_id'],
				'label' => (string)$row['name'],
				'location' => (string)($row['location'] ?? ''),
				'createdAt' => (int)($row['created'] ?? 0),
				'lastAddedPhoto' => (int)($row['last_added_photo'] ?? -1),
			], $rows);
		} catch (\Throwable) {
			return [];
		}
	}
}
