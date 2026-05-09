<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\StorageNotAvailableException;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\IURLGenerator;

class FolderBrowserService {
	public function __construct(
		private readonly IRootFolder $rootFolder,
		private readonly IURLGenerator $urlGenerator,
		private readonly IDBConnection $db,
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function listFolders(string $userId, string $path, int $limit = 150, string $query = ''): array {
		$limit = max(1, min(300, $limit));
		$currentPath = PathHelper::normalizeUserPath($path);
		$needle = $this->searchTerm($query);
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$current = $currentPath === '' ? $userFolder : $userFolder->get($currentPath);
		if (!$current instanceof Folder) {
			throw new \InvalidArgumentException('Path is not a folder.');
		}

		$folders = [];
		$imageCount = 0;
		try {
			if ($needle !== '') {
				$folders = $this->searchFolders($current, $currentPath, $needle, $limit);
				foreach ($current->getDirectoryListing() as $node) {
					if ($node instanceof File && str_starts_with((string)$node->getMimeType(), 'image/')) {
						$imageCount++;
					}
				}
			} else {
				foreach ($current->getDirectoryListing() as $node) {
					if ($node instanceof Folder) {
						$childPath = trim($currentPath . '/' . $node->getName(), '/');
						$folders[] = [
							'name' => $node->getName(),
							'path' => PathHelper::displayPath($childPath),
							'hasChildren' => $this->hasChildFolders($node),
						];
					} elseif ($node instanceof File && str_starts_with((string)$node->getMimeType(), 'image/')) {
						$imageCount++;
					}
				}
			}
		} catch (StorageNotAvailableException) {
			throw new \RuntimeException('Storage is currently unavailable.');
		}

		usort($folders, static fn (array $a, array $b): int => strnatcasecmp((string)$a['name'], (string)$b['name']));
		$total = count($folders);

		return [
			'current' => [
				'name' => $currentPath === '' ? 'Dateien' : PathHelper::basename($currentPath),
				'path' => PathHelper::displayPath($currentPath),
			],
			'parent' => PathHelper::parentPath($currentPath),
			'folders' => array_slice($folders, 0, $limit),
			'imageCount' => $imageCount,
			'total' => $total,
			'limit' => $limit,
			'truncated' => $total > $limit,
			'query' => $query,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function createFolder(string $userId, string $parentPath, string $name, int $limit = 150): array {
		$folderName = $this->folderName($name);
		$currentPath = PathHelper::normalizeUserPath($parentPath);
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$current = $currentPath === '' ? $userFolder : $userFolder->get($currentPath);
		if (!$current instanceof Folder) {
			throw new \InvalidArgumentException('Path is not a folder.');
		}

		try {
			$duplicate = $current->nodeExists($folderName);
			if (!$duplicate) {
				$current->newFolder($folderName);
			}
			$created = $current->get($folderName);
			if (!$created instanceof Folder) {
				throw new \InvalidArgumentException('A file with this name already exists.');
			}
		} catch (StorageNotAvailableException) {
			throw new \RuntimeException('Storage is currently unavailable.');
		}

		$displayPath = PathHelper::displayPath(trim($currentPath . '/' . $folderName, '/'));
		return [
			'folder' => [
				'name' => $created->getName(),
				'path' => $displayPath,
				'hasChildren' => $this->hasChildFolders($created),
			],
			'folders' => $this->listFolders($userId, PathHelper::displayPath($currentPath), $limit),
			'duplicate' => $duplicate,
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function listSampleImages(string $userId, string $path, int $limit = 12): array {
		return $this->listImagePage($userId, $path, 0, $limit)['images'];
	}

	/**
	 * @return array{images: array<int, array<string, mixed>>, page: array<string, mixed>}
	 */
	public function listImagePage(string $userId, string $path, int $cursor = 0, int $limit = 48, bool $recursive = false): array {
		$limit = max(1, min(120, $limit));
		$cursor = max(0, $cursor);
		$currentPath = PathHelper::normalizeUserPath($path);
		$current = $this->folderForUserPath($userId, $currentPath);
		$total = $recursive ? $this->countImagesInFolderRecursive($current) : $this->countImagesInFolder($current);
		if ($total === 0) {
			return [
				'images' => [],
				'page' => $this->pageMeta($cursor, $limit, 0, 0, $recursive),
			];
		}

		if ($cursor >= $total) {
			$cursor = max(0, $total - $limit);
		}

		$fileIds = $recursive
			? $this->imageIdsForFolderPageRecursive($current, $cursor, $limit)
			: $this->imageIdsForFolderPage($current, $cursor, $limit);
		$images = [];
		foreach ($fileIds as $fileId) {
			$node = $this->firstReadableFileById($current, $fileId);
			if ($node === null) {
				continue;
			}
			$images[] = [
				'fileId' => $node->getId(),
				'name' => $node->getName(),
				'path' => $recursive ? $this->displayPathForNode($userId, $node) : PathHelper::displayPath(trim($currentPath . '/' . $node->getName(), '/')),
				'mimeType' => $node->getMimeType(),
				'size' => $node->getSize(),
				'mtime' => $node->getMTime(),
				'previewUrl' => $this->previewUrl($node, 1600, 1200, 'fill'),
				'thumbnailUrl' => $this->previewUrl($node, 320, 240, 'cover'),
				'viewUrl' => $this->urlGenerator->linkToRoute('files.view.indexViewFileid', [
					'view' => 'files',
					'fileid' => $node->getId(),
				]),
			];
		}

		return [
			'images' => $images,
			'page' => $this->pageMeta($cursor, $limit, $total, count($images), $recursive),
		];
	}

	private function folderForUserPath(string $userId, string $currentPath): Folder {
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$current = $currentPath === '' ? $userFolder : $userFolder->get($currentPath);
		if (!$current instanceof Folder) {
			throw new NotFoundException('Folder not found');
		}

		return $current;
	}

	private function searchTerm(string $value): string {
		$value = trim($value);
		return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
	}

	private function countImagesInFolder(Folder $folder): int {
		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'image_count')
			->from('filecache', 'fc')
			->innerJoin('fc', 'mimetypes', 'mt', $qb->expr()->eq('fc.mimetype', 'mt.id'))
			->where($qb->expr()->eq('fc.parent', $qb->createNamedParameter($folder->getId(), IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->like('mt.mimetype', $qb->createNamedParameter('image/%')));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['image_count'] ?? 0);
	}

	private function countImagesInFolderRecursive(Folder $folder): int {
		$info = $this->folderCacheInfo($folder);
		if ($info === null) {
			return $this->countImagesInFolder($folder);
		}

		$qb = $this->db->getQueryBuilder();
		$qb->selectAlias($qb->func()->count('*'), 'image_count')
			->from('filecache', 'fc')
			->innerJoin('fc', 'mimetypes', 'mt', $qb->expr()->eq('fc.mimetype', 'mt.id'))
			->where($qb->expr()->eq('fc.storage', $qb->createNamedParameter((int)$info['storage'], IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->like('fc.path', $qb->createNamedParameter($this->recursivePathLike((string)$info['path']))))
			->andWhere($qb->expr()->like('mt.mimetype', $qb->createNamedParameter('image/%')));

		$row = $qb->executeQuery()->fetch();
		return (int)($row['image_count'] ?? 0);
	}

	/**
	 * @return int[]
	 */
	private function imageIdsForFolderPage(Folder $folder, int $cursor, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('fc.fileid')
			->from('filecache', 'fc')
			->innerJoin('fc', 'mimetypes', 'mt', $qb->expr()->eq('fc.mimetype', 'mt.id'))
			->where($qb->expr()->eq('fc.parent', $qb->createNamedParameter($folder->getId(), IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->like('mt.mimetype', $qb->createNamedParameter('image/%')))
			->orderBy('fc.name', 'ASC')
			->addOrderBy('fc.fileid', 'ASC')
			->setFirstResult($cursor)
			->setMaxResults($limit);

		$result = $qb->executeQuery();
		$fileIds = [];
		while ($row = $result->fetch()) {
			$fileIds[] = (int)$row['fileid'];
		}

		return $fileIds;
	}

	/**
	 * @return int[]
	 */
	private function imageIdsForFolderPageRecursive(Folder $folder, int $cursor, int $limit): array {
		$info = $this->folderCacheInfo($folder);
		if ($info === null) {
			return $this->imageIdsForFolderPage($folder, $cursor, $limit);
		}

		$qb = $this->db->getQueryBuilder();
		$qb->select('fc.fileid')
			->from('filecache', 'fc')
			->innerJoin('fc', 'mimetypes', 'mt', $qb->expr()->eq('fc.mimetype', 'mt.id'))
			->where($qb->expr()->eq('fc.storage', $qb->createNamedParameter((int)$info['storage'], IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->like('fc.path', $qb->createNamedParameter($this->recursivePathLike((string)$info['path']))))
			->andWhere($qb->expr()->like('mt.mimetype', $qb->createNamedParameter('image/%')))
			->orderBy('fc.path', 'ASC')
			->addOrderBy('fc.fileid', 'ASC')
			->setFirstResult($cursor)
			->setMaxResults($limit);

		$result = $qb->executeQuery();
		$fileIds = [];
		while ($row = $result->fetch()) {
			$fileIds[] = (int)$row['fileid'];
		}

		return $fileIds;
	}

	private function firstReadableFileById(Folder $folder, int $fileId): ?File {
		foreach ($folder->getById($fileId) as $node) {
			if ($node instanceof File && str_starts_with((string)$node->getMimeType(), 'image/') && $node->isReadable()) {
				return $node;
			}
		}

		return null;
	}

	/**
	 * @return array<string, mixed>
	 */
	private function pageMeta(int $cursor, int $limit, int $total, int $returned, bool $recursive = false): array {
		$nextCursor = $cursor + $limit;
		$previousCursor = max(0, $cursor - $limit);

		return [
			'cursor' => $cursor,
			'limit' => $limit,
			'total' => $total,
			'returned' => $returned,
			'hasPrevious' => $cursor > 0,
			'previousCursor' => $cursor > 0 ? $previousCursor : null,
			'hasNext' => $nextCursor < $total,
			'nextCursor' => $nextCursor < $total ? $nextCursor : null,
			'mode' => $recursive ? 'recursive-filecache-offset' : 'filecache-offset',
			'recursive' => $recursive,
		];
	}

	/**
	 * @return array{storage: int, path: string}|null
	 */
	private function folderCacheInfo(Folder $folder): ?array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('storage', 'path')
			->from('filecache')
			->where($qb->expr()->eq('fileid', $qb->createNamedParameter($folder->getId(), IQueryBuilder::PARAM_INT)))
			->setMaxResults(1);

		$row = $qb->executeQuery()->fetch();
		if (!$row) {
			return null;
		}

		return [
			'storage' => (int)$row['storage'],
			'path' => (string)$row['path'],
		];
	}

	private function recursivePathLike(string $folderPath): string {
		return $this->db->escapeLikeParameter(rtrim($folderPath, '/')) . '/%';
	}

	private function displayPathForNode(string $userId, File $node): string {
		$path = $node->getPath();
		$userPrefix = '/' . $userId . '/files/';
		if (str_starts_with($path, $userPrefix)) {
			return PathHelper::displayPath(substr($path, strlen($userPrefix)));
		}

		$parts = explode('/files/', $path, 2);
		if (isset($parts[1])) {
			return PathHelper::displayPath($parts[1]);
		}

		return PathHelper::displayPath($node->getName());
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function searchFolders(Folder $folder, string $basePath, string $needle, int $limit): array {
		$matches = [];
		$pending = [[$folder, PathHelper::normalizeUserPath($basePath)]];
		$visited = 0;
		$maxVisited = max(300, $limit * 12);

		while ($pending !== [] && count($matches) < $limit && $visited < $maxVisited) {
			[$current, $currentPath] = array_shift($pending);
			$visited++;
			foreach ($current->getDirectoryListing() as $node) {
				if (!$node instanceof Folder) {
					continue;
				}
				$childPath = trim($currentPath . '/' . $node->getName(), '/');
				$displayPath = PathHelper::displayPath($childPath);
				if (str_contains($this->searchTerm($node->getName() . ' ' . $displayPath), $needle)) {
					$matches[] = [
						'name' => $node->getName(),
						'path' => $displayPath,
						'hasChildren' => $this->hasChildFolders($node),
					];
					if (count($matches) >= $limit) {
						break;
					}
				}
				$pending[] = [$node, $childPath];
			}
		}

		return $matches;
	}

	private function previewUrl(File $file, int $width, int $height, string $mode): string {
		return $this->urlGenerator->linkToRoute('core.Preview.getPreviewByFileId', [
			'fileId' => $file->getId(),
			'x' => $width,
			'y' => $height,
			'a' => true,
			'forceIcon' => false,
			'mimeFallback' => true,
			'mode' => $mode,
			'v' => $file->getMTime(),
		]);
	}

	private function hasChildFolders(Folder $folder): bool {
		try {
			foreach ($folder->getDirectoryListing() as $node) {
				if ($node instanceof Folder) {
					return true;
				}
			}
		} catch (\Throwable) {
			return false;
		}

		return false;
	}

	private function folderName(string $name): string {
		$name = trim($name);
		if ($name === '' || str_contains($name, '/') || str_contains($name, '\\') || $name === '.' || $name === '..') {
			throw new \InvalidArgumentException('Bitte gib einen gültigen Ordnernamen ein.');
		}

		return mb_substr($name, 0, 255);
	}
}
