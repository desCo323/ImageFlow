<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\FavoriteTarget;
use OCA\ImageFlow\Db\FavoriteTargetMapper;
use OCP\AppFramework\Db\DoesNotExistException;

class FavoriteService {
	private const MODES = ['album', 'move', 'copy'];
	private const MAX_FAVORITES = 9;

	public function __construct(
		private readonly FavoriteTargetMapper $favoriteMapper,
		private readonly LogService $logService,
	) {
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function listFavorites(string $userId, string $mode, bool $includeSkip = true): array {
		$mode = $this->targetMode($mode);
		$favorites = array_map([$this, 'serializeFavorite'], $this->favoriteMapper->findForUserAndMode($userId, $mode, self::MAX_FAVORITES));

		return $includeSkip ? $this->withSkip($favorites) : $favorites;
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	public function createFavorite(string $userId, array $input): array {
		$mode = $this->targetMode((string)($input['mode'] ?? $input['targetMode'] ?? 'album'));
		$targetLabel = $this->requiredLabel($input['targetLabel'] ?? $input['label'] ?? $input['name'] ?? null);
		$targetId = $this->optionalString($input['targetId'] ?? $input['id'] ?? null, 255);
		$targetPath = $this->targetPath($mode, $input['targetPath'] ?? $input['path'] ?? null);

		if ($targetId === null && $targetPath === null) {
			throw new \InvalidArgumentException('Ein Favorit braucht ein Ziel.');
		}

		$duplicate = $this->favoriteMapper->findDuplicate($userId, $mode, $targetId, $targetPath);
		if ($duplicate !== null) {
			return [
				'favorite' => $this->serializeFavorite($duplicate),
				'favorites' => $this->listFavorites($userId, $mode),
				'duplicate' => true,
			];
		}

		if ($this->favoriteMapper->countForUserAndMode($userId, $mode) >= self::MAX_FAVORITES) {
				throw new \InvalidArgumentException('Maximal neun Schnellziele können direkte Hotkeys bekommen.');
		}

		$now = time();
		$position = $this->favoriteMapper->maxSortPosition($userId, $mode) + 1;
		$favorite = new FavoriteTarget();
		$favorite->setUserId($userId);
		$favorite->setTargetMode($mode);
		$favorite->setTargetId($targetId);
		$favorite->setTargetLabel($targetLabel);
		$favorite->setTargetPath($targetPath);
		$favorite->setSortPosition($position);
		$favorite->setHotkey($this->hotkeyForPosition($position));
		$favorite->setCreatedAt($now);
		$favorite->setUpdatedAt($now);
		$favorite = $this->favoriteMapper->insert($favorite);
		$this->normalizePositions($userId, $mode);

		$this->logService->info('favorite_created', $userId, [
			'favoriteId' => $favorite->getId(),
			'mode' => $mode,
			'targetLabel' => $targetLabel,
			'targetPath' => $targetPath,
			], null, 'Schnellziel wurde hinzugefügt.');

		return [
			'favorite' => $this->serializeFavorite($favorite),
			'favorites' => $this->listFavorites($userId, $mode),
			'duplicate' => false,
		];
	}

	/**
	 * @return array<string, mixed>
	 * @throws DoesNotExistException
	 */
	public function deleteFavorite(string $userId, int $favoriteId): array {
		$favorite = $this->favoriteMapper->findForUserById($userId, $favoriteId);
		$mode = $favorite->getTargetMode();
		$this->favoriteMapper->delete($favorite);
		$this->normalizePositions($userId, $mode);

		$this->logService->info('favorite_deleted', $userId, [
			'favoriteId' => $favoriteId,
			'mode' => $mode,
			'targetLabel' => $favorite->getTargetLabel(),
		], null, 'Favorit wurde entfernt.');

		return [
			'deleted' => true,
			'favoriteId' => $favoriteId,
			'favorites' => $this->listFavorites($userId, $mode),
		];
	}

	/**
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 */
	public function reorderFavorites(string $userId, array $input): array {
		$mode = $this->targetMode((string)($input['mode'] ?? $input['targetMode'] ?? 'album'));
		$rawIds = is_array($input['favoriteIds'] ?? null) ? $input['favoriteIds'] : ($input['favorites'] ?? []);
		if (!is_array($rawIds)) {
			$rawIds = [];
		}

		$ids = [];
		foreach ($rawIds as $item) {
			$id = is_array($item) ? ($item['id'] ?? null) : $item;
			if (is_numeric($id) && (int)$id > 0) {
				$ids[] = (int)$id;
			}
		}
		$ids = array_values(array_unique($ids));

		$favorites = $this->favoriteMapper->findForUserAndMode($userId, $mode, self::MAX_FAVORITES);
		$byId = [];
		foreach ($favorites as $favorite) {
			$byId[(int)$favorite->getId()] = $favorite;
		}

		$ordered = [];
		foreach ($ids as $id) {
			if (isset($byId[$id])) {
				$ordered[] = $byId[$id];
				unset($byId[$id]);
			}
		}
		foreach ($favorites as $favorite) {
			if (isset($byId[(int)$favorite->getId()])) {
				$ordered[] = $favorite;
			}
		}

		$now = time();
		foreach ($ordered as $index => $favorite) {
			$favorite->setSortPosition($index + 1);
			$favorite->setHotkey($this->hotkeyForPosition($index + 1));
			$favorite->setUpdatedAt($now);
			$this->favoriteMapper->update($favorite);
		}

		$this->logService->debug('favorites_reordered', $userId, [
			'mode' => $mode,
			'favoriteIds' => array_map(static fn (FavoriteTarget $favorite): int => (int)$favorite->getId(), $ordered),
		], null, 'Favoriten-Reihenfolge wurde gespeichert.');

		return [
			'favorites' => $this->listFavorites($userId, $mode),
		];
	}

	/**
	 * @param array<int, array<string, mixed>> $favorites
	 * @return array<int, array<string, mixed>>
	 */
	private function withSkip(array $favorites): array {
		$favorites[] = [
			'id' => 'skip',
				'label' => 'Überspringen',
			'path' => null,
			'targetId' => null,
			'hotkey' => '0',
			'position' => 10,
			'locked' => true,
			'targetType' => 'skip',
		];

		return $favorites;
	}

	/**
	 * @return array<string, mixed>
	 */
	private function serializeFavorite(FavoriteTarget $favorite): array {
		return [
			'id' => $favorite->getId(),
			'label' => $favorite->getTargetLabel(),
			'path' => $favorite->getTargetPath(),
			'targetId' => $favorite->getTargetId(),
			'hotkey' => $favorite->getHotkey(),
			'position' => $favorite->getSortPosition(),
			'targetMode' => $favorite->getTargetMode(),
			'locked' => false,
		];
	}

	private function normalizePositions(string $userId, string $mode): void {
		$favorites = $this->favoriteMapper->findForUserAndMode($userId, $mode, self::MAX_FAVORITES);
		$now = time();
		foreach ($favorites as $index => $favorite) {
			$position = $index + 1;
			if ($favorite->getSortPosition() === $position && $favorite->getHotkey() === $this->hotkeyForPosition($position)) {
				continue;
			}

			$favorite->setSortPosition($position);
			$favorite->setHotkey($this->hotkeyForPosition($position));
			$favorite->setUpdatedAt($now);
			$this->favoriteMapper->update($favorite);
		}
	}

	private function targetMode(string $mode): string {
		if (!in_array($mode, self::MODES, true)) {
			throw new \InvalidArgumentException('Ungültige Ablageart.');
		}

		return $mode;
	}

	private function targetPath(string $mode, mixed $value): ?string {
		if ($mode === 'album') {
			return null;
		}
		if (!is_scalar($value) || trim((string)$value) === '') {
			throw new \InvalidArgumentException('Für Ordner-Schnellziele wird ein Ablageordner benötigt.');
		}

		return PathHelper::displayPath((string)$value);
	}

	private function requiredLabel(mixed $value): string {
		if (!is_scalar($value)) {
			throw new \InvalidArgumentException('Der Favorit braucht einen Namen.');
		}
		$value = trim((string)$value);
		if ($value === '') {
			throw new \InvalidArgumentException('Der Favorit braucht einen Namen.');
		}

		return substr($value, 0, 255);
	}

	private function optionalString(mixed $value, int $length): ?string {
		if (!is_scalar($value)) {
			return null;
		}
		$value = trim((string)$value);
		return $value === '' ? null : substr($value, 0, $length);
	}

	private function hotkeyForPosition(int $position): string {
		return $position >= 1 && $position <= 9 ? (string)$position : '';
	}
}
