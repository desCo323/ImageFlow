<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class LogController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		$jobId = $this->request->getParam('jobId', null);
		return new JSONResponse([
			'logs' => $this->logService->recent(
				$this->userId,
				$this->intParam('limit', 100, 1, 500),
				$this->stringParam('level', ''),
				is_numeric($jobId) ? (int)$jobId : null,
			),
		]);
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
