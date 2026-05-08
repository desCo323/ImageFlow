<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\FavoriteService;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class FavoriteController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly FavoriteService $favoriteService,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		try {
			return new JSONResponse([
				'favorites' => $this->favoriteService->listFavorites($this->userId, $this->stringParam('mode', 'album')),
			]);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_favorite_request', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		}
	}

	#[NoAdminRequired]
	public function create(): JSONResponse {
		try {
			return new JSONResponse($this->favoriteService->createFavorite($this->userId, $this->request->getParams()));
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_favorite', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('favorite_create_failed', $e, $this->userId);
			return $this->error('favorite_create_failed', 'Der Favorit konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function reorder(): JSONResponse {
		try {
			return new JSONResponse($this->favoriteService->reorderFavorites($this->userId, $this->request->getParams()));
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_favorite_order', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('favorite_reorder_failed', $e, $this->userId);
			return $this->error('favorite_reorder_failed', 'Die Favoriten-Reihenfolge konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function delete(int $favoriteId): JSONResponse {
		try {
			return new JSONResponse($this->favoriteService->deleteFavorite($this->userId, $favoriteId));
		} catch (DoesNotExistException) {
			return $this->error('favorite_not_found', 'Der Favorit wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('favorite_delete_failed', $e, $this->userId);
			return $this->error('favorite_delete_failed', 'Der Favorit konnte nicht entfernt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	private function stringParam(string $key, string $default): string {
		$value = $this->request->getParam($key, $default);
		return is_scalar($value) ? (string)$value : $default;
	}

	private function error(string $error, string $message, int $status): JSONResponse {
		return new JSONResponse([
			'error' => $error,
			'message' => $message,
		], $status);
	}
}
