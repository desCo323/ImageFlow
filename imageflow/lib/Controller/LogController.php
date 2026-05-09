<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortJobMapper;
use OCA\ImageFlow\Service\BackgroundGateService;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class LogController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly LogService $logService,
		private readonly IConfig $config,
		private readonly BackgroundGateService $backgroundGateService,
		private readonly QueueItemMapper $queueMapper,
		private readonly SortJobMapper $jobMapper,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		$jobId = $this->request->getParam('jobId', null);
		$limit = $this->intParam('limit', 100, 1, 500);
		$level = $this->stringParam('level', '');
		$resolvedJobId = is_numeric($jobId) ? (int)$jobId : null;
		return new JSONResponse([
			'diagnostics' => $this->diagnostics(),
			'logs' => $this->logService->recent($this->userId, $limit, $level, $resolvedJobId),
		]);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function diagnostics(): array {
		$realExecutionEnabled = $this->config->getAppValue(Application::APP_ID, 'real_execution_enabled', '0') === '1';
		$backgroundProcessingEnabled = $this->config->getAppValue(Application::APP_ID, 'background_processing_enabled', '0') === '1';
		$queue = [
			'total' => 0,
			'planned' => 0,
			'queued' => 0,
			'executing' => 0,
			'executed' => 0,
			'issues' => 0,
		];
		$databaseOk = true;
		try {
			$queue = [
				'total' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned', 'queued', 'executing', 'executed', 'blocked', 'failed']),
				'planned' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned']),
				'queued' => $this->queueMapper->countForUserByStatuses($this->userId, ['queued']),
				'executing' => $this->queueMapper->countForUserByStatuses($this->userId, ['executing']),
				'executed' => $this->queueMapper->countForUserByStatuses($this->userId, ['executed']),
				'issues' => $this->queueMapper->countForUserByStatuses($this->userId, ['blocked', 'failed']),
			];
			$jobCount = $this->jobMapper->countForUser($this->userId);
		} catch (\Throwable) {
			$databaseOk = false;
			$jobCount = 0;
		}

		return [
			'app' => Application::APP_ID,
			'version' => Application::VERSION,
			'generatedAt' => time(),
			'userId' => $this->userId,
			'realExecutionEnabled' => $realExecutionEnabled,
			'backgroundProcessingEnabled' => $backgroundProcessingEnabled,
			'processingMode' => $realExecutionEnabled
				? ($backgroundProcessingEnabled ? 'manual-and-background' : 'manual-only')
				: 'locked',
			'backgroundGate' => $this->backgroundGateService->status(),
			'databaseOk' => $databaseOk,
			'jobCount' => $jobCount,
			'queue' => $queue,
			'notes' => [
				'Systemweite Cron-Ereignisse haben userId=null und werden in diesem Logexport bewusst mitgeliefert.',
				'Secrets in Kontextdaten werden serverseitig redigiert.',
			],
		];
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
