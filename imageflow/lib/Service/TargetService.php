<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class TargetService {
	public function __construct(
		private readonly IDBConnection $db,
		private readonly FolderBrowserService $folderBrowserService,
		private readonly LogService $logService,
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function listTargets(string $userId, string $mode, string $query = '', string $path = '/', int $limit = 100, string $ordering = 'relevance'): array {
		$limit = max(1, min(200, $limit));
		$ordering = in_array($ordering, ['relevance', 'alphabetical'], true) ? $ordering : 'relevance';
		if ($mode === 'album') {
			return [
				'mode' => $mode,
				'ordering' => $query === '' ? $ordering : 'search',
				'targets' => $this->listAlbums($userId, $query, $limit, $ordering),
			];
		}

		return [
			'mode' => $mode,
			'ordering' => 'alphabetical',
			'folders' => $this->folderBrowserService->listFolders($userId, $path, $limit),
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	public function createTarget(string $userId, array $input): array {
		$mode = (string)($input['mode'] ?? $input['targetMode'] ?? 'album');
		$name = $this->targetName((string)($input['name'] ?? $input['label'] ?? ''));
		if ($mode === 'album') {
			$target = $this->createAlbum($userId, $name);
			$this->logService->info('target_album_created', $userId, [
				'albumId' => $target['id'] ?? null,
				'label' => $target['label'] ?? $name,
				'duplicate' => (bool)($target['duplicate'] ?? false),
			], null, (bool)($target['duplicate'] ?? false) ? 'Album war schon vorhanden.' : 'Album wurde angelegt.');

			return [
				'mode' => 'album',
				'target' => $target,
				'targets' => $this->listAlbums($userId, '', 100, 'relevance'),
				'duplicate' => (bool)($target['duplicate'] ?? false),
			];
		}

		if ($mode !== 'copy' && $mode !== 'move') {
			throw new \InvalidArgumentException('Die Zielart ist ungültig.');
		}

		$parentPath = PathHelper::displayPath((string)($input['path'] ?? $input['parentPath'] ?? '/'));
		$result = $this->folderBrowserService->createFolder($userId, $parentPath, $name, 150);
		$this->logService->info('target_folder_created', $userId, [
			'mode' => $mode,
			'parentPath' => $parentPath,
			'folderPath' => $result['folder']['path'] ?? null,
			'duplicate' => (bool)($result['duplicate'] ?? false),
		], null, (bool)($result['duplicate'] ?? false) ? 'Ordner war schon vorhanden.' : 'Ordner wurde angelegt.');

		return [
			'mode' => $mode,
			'target' => [
				'id' => $result['folder']['path'] ?? null,
				'label' => $result['folder']['name'] ?? $name,
				'path' => $result['folder']['path'] ?? null,
				'hasChildren' => $result['folder']['hasChildren'] ?? false,
			],
			'folders' => $result['folders'],
			'duplicate' => (bool)($result['duplicate'] ?? false),
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function listAlbums(string $userId, string $query, int $limit, string $ordering): array {
		try {
			$qb = $this->db->getQueryBuilder();
			$qb->select('album_id', 'name', 'location', 'created', 'last_added_photo')
				->from('photos_albums')
				->where($qb->expr()->eq('user', $qb->createNamedParameter($userId)))
				->setMaxResults($limit);

			if ($query !== '') {
				$qb->andWhere($qb->expr()->iLike('name', $qb->createNamedParameter('%' . $this->db->escapeLikeParameter($query) . '%')));
				$qb->orderBy('name', 'ASC');
			} elseif ($ordering === 'relevance') {
				$qb->orderBy('last_added_photo', 'DESC')
					->addOrderBy('created', 'DESC')
					->addOrderBy('name', 'ASC');
			} else {
				$qb->orderBy('name', 'ASC');
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

	/**
	 * @return array<string, mixed>
	 */
	private function createAlbum(string $userId, string $name): array {
		$duplicate = $this->findAlbumByName($userId, $name);
		if ($duplicate !== null) {
			return [
				...$duplicate,
				'duplicate' => true,
			];
		}

		$created = time();
		$qb = $this->db->getQueryBuilder();
		$qb->insert('photos_albums')
			->values([
				'user' => $qb->createNamedParameter($userId),
				'name' => $qb->createNamedParameter($name),
				'location' => $qb->createNamedParameter(''),
				'created' => $qb->createNamedParameter($created, IQueryBuilder::PARAM_INT),
				'last_added_photo' => $qb->createNamedParameter(-1, IQueryBuilder::PARAM_INT),
			]);
		$qb->executeStatement();
		$id = (int)$qb->getLastInsertId();

		return [
			'id' => (string)$id,
			'label' => $name,
			'location' => '',
			'createdAt' => $created,
			'lastAddedPhoto' => -1,
			'duplicate' => false,
		];
	}

	/**
	 * @return array<string, mixed>|null
	 */
	private function findAlbumByName(string $userId, string $name): ?array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('album_id', 'name', 'location', 'created', 'last_added_photo')
			->from('photos_albums')
			->where($qb->expr()->eq('user', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('name', $qb->createNamedParameter($name)))
			->setMaxResults(1);

		$row = $qb->executeQuery()->fetch();
		if (!$row) {
			return null;
		}

		return [
			'id' => (string)$row['album_id'],
			'label' => (string)$row['name'],
			'location' => (string)($row['location'] ?? ''),
			'createdAt' => (int)($row['created'] ?? 0),
			'lastAddedPhoto' => (int)($row['last_added_photo'] ?? -1),
		];
	}

	private function targetName(string $name): string {
		$name = trim($name);
		if ($name === '') {
			throw new \InvalidArgumentException('Bitte gib einen Namen ein.');
		}

		return mb_substr($name, 0, 255);
	}
}
