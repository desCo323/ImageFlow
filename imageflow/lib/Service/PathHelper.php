<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

final class PathHelper {
	private const MAX_PATH_BYTES = 2048;
	private const MAX_PATH_SEGMENTS = 64;
	private const MAX_SEGMENT_BYTES = 255;

	public static function normalizeUserPath(string $path): string {
		$path = str_replace('\\', '/', $path);
		if (strlen($path) > self::MAX_PATH_BYTES) {
			throw new \InvalidArgumentException('Path is too long.');
		}
		if (str_contains($path, "\0") || preg_match('/[\x00-\x1F\x7F]/', $path) === 1) {
			throw new \InvalidArgumentException('Path contains invalid control characters.');
		}

		$path = trim($path);
		$path = trim($path, '/');
		$parts = [];

		foreach (explode('/', $path) as $rawPart) {
			$part = trim($rawPart);
			if ($part === '' || $part === '.') {
				continue;
			}
			if ($part === '..') {
				throw new \InvalidArgumentException('Path traversal is not allowed.');
			}
			if (strlen($part) > self::MAX_SEGMENT_BYTES) {
				throw new \InvalidArgumentException('Path segment is too long.');
			}
			$parts[] = $part;
			if (count($parts) > self::MAX_PATH_SEGMENTS) {
				throw new \InvalidArgumentException('Path has too many segments.');
			}
		}

		return implode('/', $parts);
	}

	public static function displayPath(string $path): string {
		$path = self::normalizeUserPath($path);
		return $path === '' ? '/' : '/' . $path;
	}

	public static function basename(string $path): string {
		$path = self::normalizeUserPath($path);
		if ($path === '') {
			return 'Dateien';
		}

		$parts = explode('/', $path);
		return end($parts) ?: 'Dateien';
	}

	public static function fileNameFromPath(string $path): string {
		$path = self::normalizeUserPath($path);
		if ($path === '') {
			return '';
		}

		$parts = explode('/', $path);
		return end($parts) ?: '';
	}

	public static function parentPath(string $path): ?string {
		$path = self::normalizeUserPath($path);
		if ($path === '') {
			return null;
		}

		$parts = explode('/', $path);
		array_pop($parts);
		return self::displayPath(implode('/', $parts));
	}
}
