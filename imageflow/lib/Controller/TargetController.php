<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\TargetService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class TargetController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly TargetService $targetService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		try {
			return new JSONResponse($this->targetService->listTargets(
				$this->userId,
				$this->stringParam('mode', 'album'),
				$this->stringParam('query', ''),
				$this->stringParam('path', '/'),
				$this->intParam('limit', 100, 1, 200),
				$this->stringParam('ordering', 'relevance'),
			));
		} catch (\InvalidArgumentException) {
			return new JSONResponse([
				'error' => 'invalid_target_request',
				'message' => 'Die Zielauswahl ist ungültig.',
			], Http::STATUS_BAD_REQUEST);
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
