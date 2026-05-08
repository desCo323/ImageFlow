<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\BackgroundGateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class HealthController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly IConfig $config,
		private readonly BackgroundGateService $backgroundGateService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		$realExecutionEnabled = $this->config->getAppValue(Application::APP_ID, 'real_execution_enabled', '0') === '1';
		$backgroundProcessingEnabled = $this->config->getAppValue(Application::APP_ID, 'background_processing_enabled', '0') === '1';
		$backgroundGate = $this->backgroundGateService->status();

		return new JSONResponse([
			'app' => Application::APP_ID,
			'version' => Application::VERSION,
			'status' => $realExecutionEnabled ? 'execution-enabled' : 'safe-testing',
			'processingMode' => $realExecutionEnabled
				? ($backgroundProcessingEnabled ? 'manual-and-background' : 'manual-only')
				: 'locked',
			'destructiveWritesEnabled' => $realExecutionEnabled,
			'realExecutionEnabled' => $realExecutionEnabled,
			'backgroundProcessingEnabled' => $backgroundProcessingEnabled,
			'backgroundGate' => $backgroundGate,
			'safeModeDefault' => true,
		]);
	}
}
