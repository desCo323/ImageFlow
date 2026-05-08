<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\StorageNotAvailableException;
use OCP\IURLGenerator;

class FolderBrowserService {
	public function __construct(
		private readonly IRootFolder $rootFolder,
		private readonly IURLGenerator $urlGenerator,
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function listFolders(string $userId, string $path, int $limit = 150): array {
		$limit = max(1, min(300, $limit));
		$currentPath = PathHelper::normalizeUserPath($path);
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$current = $currentPath === '' ? $userFolder : $userFolder->get($currentPath);
		if (!$current instanceof Folder) {
			throw new \InvalidArgumentException('Path is not a folder.');
		}

		$folders = [];
		$imageCount = 0;
		try {
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
		];
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function listSampleImages(string $userId, string $path, int $limit = 12): array {
		$limit = max(1, min(50, $limit));
		$currentPath = PathHelper::normalizeUserPath($path);
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$current = $currentPath === '' ? $userFolder : $userFolder->get($currentPath);
		if (!$current instanceof Folder) {
			throw new NotFoundException('Folder not found');
		}

		$images = [];
		foreach ($current->getDirectoryListing() as $node) {
			if (!$node instanceof File || !str_starts_with((string)$node->getMimeType(), 'image/')) {
				continue;
			}
			$relativePath = trim($currentPath . '/' . $node->getName(), '/');
			$images[] = [
				'fileId' => $node->getId(),
				'name' => $node->getName(),
				'path' => PathHelper::displayPath($relativePath),
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
			if (count($images) >= $limit) {
				break;
			}
		}

		return $images;
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
}
