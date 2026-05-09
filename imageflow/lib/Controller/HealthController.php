<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Db\QueueItemMapper;
use OCA\ImageFlow\Db\SortJobMapper;
use OCA\ImageFlow\Service\BackgroundGateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IRequest;

class HealthController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly IConfig $config,
		private readonly IGroupManager $groupManager,
		private readonly BackgroundGateService $backgroundGateService,
		private readonly SortJobMapper $jobMapper,
		private readonly QueueItemMapper $queueMapper,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		$realExecutionEnabled = $this->config->getAppValue(Application::APP_ID, 'real_execution_enabled', '0') === '1';
		$backgroundProcessingEnabled = $this->config->getAppValue(Application::APP_ID, 'background_processing_enabled', '0') === '1';
		$backgroundGate = $this->backgroundGateService->status();
		$diagnostics = $this->diagnostics($realExecutionEnabled, $backgroundProcessingEnabled, $backgroundGate);

		return new JSONResponse([
			'app' => Application::APP_ID,
			'version' => Application::VERSION,
			'status' => $diagnostics['status'],
			'processingMode' => $realExecutionEnabled
				? ($backgroundProcessingEnabled ? 'manual-and-background' : 'manual-only')
				: 'locked',
			'destructiveWritesEnabled' => $realExecutionEnabled,
			'realExecutionEnabled' => $realExecutionEnabled,
			'backgroundProcessingEnabled' => $backgroundProcessingEnabled,
			'backgroundGate' => $backgroundGate,
			'safeModeDefault' => true,
			'diagnostics' => $diagnostics,
		]);
	}

	/**
	 * @param array<string, mixed> $backgroundGate
	 * @return array<string, mixed>
	 */
	private function diagnostics(bool $realExecutionEnabled, bool $backgroundProcessingEnabled, array $backgroundGate): array {
		$databaseOk = true;
		$databaseMessage = 'ImageFlow Tabellen sind erreichbar.';
		try {
			$jobCount = $this->jobMapper->countForUser($this->userId);
			$queue = [
				'total' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned', 'queued', 'executing', 'executed', 'blocked', 'failed']),
				'planned' => $this->queueMapper->countForUserByStatuses($this->userId, ['planned']),
				'queued' => $this->queueMapper->countForUserByStatuses($this->userId, ['queued', 'executing']),
				'executed' => $this->queueMapper->countForUserByStatuses($this->userId, ['executed']),
				'issues' => $this->queueMapper->countForUserByStatuses($this->userId, ['blocked', 'failed']),
			];
		} catch (\Throwable $e) {
			$databaseOk = false;
			$databaseMessage = 'ImageFlow Tabellen konnten nicht geprüft werden.';
			$jobCount = 0;
			$queue = [
				'total' => 0,
				'planned' => 0,
				'queued' => 0,
				'executed' => 0,
				'issues' => 0,
			];
		}

		$checks = [
			[
				'id' => 'file-writes',
				'level' => $realExecutionEnabled ? 'warning' : 'ok',
				'label' => $realExecutionEnabled ? 'Dateiänderungen aktiv' : 'Dateiänderungen gesperrt',
				'message' => $realExecutionEnabled
					? 'Echte Dateiänderungen sind freigeschaltet. Nur mit bewusst vorbereitetem Testfenster verwenden.'
					: 'Sicherer Testbetrieb: Sortieren und Ablageprüfung verändern keine Dateien.',
			],
			[
				'id' => 'background',
				'level' => $backgroundProcessingEnabled ? (($backgroundGate['canRun'] ?? false) ? 'ok' : 'warning') : 'ok',
				'label' => $backgroundProcessingEnabled ? 'Automatik konfiguriert' : 'Automatik aus',
				'message' => $backgroundProcessingEnabled
					? (string)($backgroundGate['message'] ?? 'Hintergrundverarbeitung ist aktiviert.')
					: 'Cron verarbeitet keine ImageFlow Ablagen.',
			],
			[
				'id' => 'database',
				'level' => $databaseOk ? 'ok' : 'error',
				'label' => $databaseOk ? 'Datenbank erreichbar' : 'Datenbank prüfen',
				'message' => $databaseMessage,
			],
			[
				'id' => 'self-test-user',
				'level' => $this->userId === 'albentest' ? 'ok' : 'warning',
				'label' => $this->userId === 'albentest' ? 'Testkonto aktiv' : 'Kein Testkonto',
				'message' => $this->userId === 'albentest'
					? 'Der geführte Test darf mit diesem Konto durchgeführt werden.'
					: 'Produktive Konten dürfen nur lesen und prüfen. Geführte Tests laufen mit albentest.',
			],
		];
		$status = 'ready';
		foreach ($checks as $check) {
			if ($check['level'] === 'error') {
				$status = 'attention';
				break;
			}
			if ($check['level'] === 'warning' && $status !== 'attention') {
				$status = $realExecutionEnabled ? 'execution-enabled' : 'review';
			}
		}
		if (!$realExecutionEnabled && $databaseOk && $queue['issues'] === 0) {
			$status = 'safe-testing';
		}

		return [
			'status' => $status,
			'userId' => $this->userId,
			'isAdmin' => $this->groupManager->isAdmin($this->userId),
			'testUserAllowed' => $this->userId === 'albentest',
			'databaseOk' => $databaseOk,
			'jobCount' => $jobCount,
			'queue' => $queue,
			'checks' => $checks,
		];
	}
}
