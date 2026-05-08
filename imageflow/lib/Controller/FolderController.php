<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\FolderBrowserService;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;

class FolderController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly FolderBrowserService $folderBrowserService,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		try {
			$result = $this->folderBrowserService->listFolders(
				$this->userId,
				$this->stringParam('path', '/'),
				$this->intParam('limit', 150, 1, 300),
			);
			$this->logService->debug('folder_browser_listed', $this->userId, [
				'path' => $result['current']['path'] ?? '/',
				'folderCount' => count($result['folders'] ?? []),
				'imageCount' => $result['imageCount'] ?? 0,
			]);

			return new JSONResponse($result);
		} catch (NotFoundException|\InvalidArgumentException) {
			return new JSONResponse([
				'error' => 'folder_not_found',
				'message' => 'Der Ordner wurde nicht gefunden oder ist nicht lesbar.',
			], Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('folder_browser_failed', $e, $this->userId);
			return new JSONResponse([
				'error' => 'folder_browser_failed',
				'message' => 'Die Ordnerliste konnte nicht geladen werden.',
			], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	private function stringParam(string $key, string $default): string {
		$value = $this->request->getParam($key, $default);
		return is_scalar($value) ? (string)$value : $default;
	}

	private function intParam(string $key, int $default, int $min, int $max): int {
		$value = $this->request->getParam($key, $default);
		$value = is_numeric($value) ? (int)$value : $default;
		return max($min, min($max, $value));
	}
}
