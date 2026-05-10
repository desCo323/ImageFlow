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

class SupportController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly IConfig $config,
		private readonly BackgroundGateService $backgroundGateService,
		private readonly QueueItemMapper $queueMapper,
		private readonly SortJobMapper $jobMapper,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function export(): JSONResponse {
		$backgroundGate = $this->backgroundGateService->status();
		$payload = [
			'app' => Application::APP_ID,
			'version' => Application::VERSION,
			'generatedAt' => time(),
			'userId' => $this->userId,
			'nextcloud' => [
				'version' => $this->config->getSystemValueString('version', ''),
				'backgroundJobsMode' => $this->config->getSystemValueString('backgroundjobs_mode', ''),
			],
			'settings' => [
				'realExecutionEnabled' => $this->config->getAppValue(Application::APP_ID, 'real_execution_enabled', '0') === '1',
				'backgroundProcessingEnabled' => $this->config->getAppValue(Application::APP_ID, 'background_processing_enabled', '0') === '1',
				'backgroundLowLoadOnly' => $this->config->getAppValue(Application::APP_ID, 'background_low_load_only', '1') === '1',
				'backgroundMaxLoadPercent' => $backgroundGate['maxLoadPercent'] ?? null,
				'backgroundMaxLoad1m' => $backgroundGate['maxLoad1m'] ?? null,
				'quietHoursEnabled' => $this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_enabled', '0') === '1',
				'quietHoursStart' => $this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_start', '22:00'),
				'quietHoursEnd' => $this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_end', '06:00'),
			],
			'backgroundGate' => $backgroundGate,
			'counts' => $this->counts(),
			'notes' => [
				'Systemweite Cron-Ereignisse haben userId=null.',
				'Kontextdaten werden vor dem Speichern durch ImageFlow redigiert.',
				'Dieser Export enthält keine Nextcloud-Konfigurationsgeheimnisse.',
			],
			'logs' => $this->logService->recent($this->userId, 500, '', null),
		];

		$response = new JSONResponse($payload);
		$response->addHeader('Content-Disposition', 'attachment; filename="imageflow-diagnostics-' . date('Ymd-His') . '.json"');
		return $response;
	}

	/**
	 * @return array<string, mixed>
	 */
	private function counts(): array {
		try {
			return [
				'databaseOk' => true,
				'jobCount' => $this->jobMapper->countForUser($this->userId),
				'queue' => [
					'total' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned', 'queued', 'executing', 'executed', 'blocked', 'failed']),
					'planned' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned']),
					'queued' => $this->queueMapper->countForUserByStatuses($this->userId, ['queued']),
					'executing' => $this->queueMapper->countForUserByStatuses($this->userId, ['executing']),
					'executed' => $this->queueMapper->countForUserByStatuses($this->userId, ['executed']),
					'issues' => $this->queueMapper->countForUserByStatuses($this->userId, ['blocked', 'failed']),
				],
			];
		} catch (\Throwable) {
			return [
				'databaseOk' => false,
				'jobCount' => 0,
				'queue' => [
					'total' => 0,
					'planned' => 0,
					'queued' => 0,
					'executing' => 0,
					'executed' => 0,
					'issues' => 0,
				],
			];
		}
	}
}
