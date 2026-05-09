<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\BackgroundGateService;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IRequest;

class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly IConfig $config,
		private readonly IGroupManager $groupManager,
		private readonly BackgroundGateService $backgroundGateService,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		if (!$this->isAdmin()) {
			return $this->forbidden();
		}

		return new JSONResponse([
			'isAdmin' => true,
			'settings' => $this->settings(),
			'backgroundGate' => $this->backgroundGateService->status(),
		]);
	}

	#[NoAdminRequired]
	public function update(): JSONResponse {
		if (!$this->isAdmin()) {
			return $this->forbidden();
		}

		$before = $this->settings();
		$input = $this->request->getParams();
		$settings = [
			'realExecutionEnabled' => $this->boolValue($input['realExecutionEnabled'] ?? $before['realExecutionEnabled']),
			'backgroundProcessingEnabled' => $this->boolValue($input['backgroundProcessingEnabled'] ?? $before['backgroundProcessingEnabled']),
			'backgroundLowLoadOnly' => $this->boolValue($input['backgroundLowLoadOnly'] ?? $before['backgroundLowLoadOnly']),
			'backgroundMaxLoad1m' => $this->floatValue($input['backgroundMaxLoad1m'] ?? $before['backgroundMaxLoad1m'], 0.1, 128.0),
			'quietHoursEnabled' => $this->boolValue($input['quietHoursEnabled'] ?? $before['quietHoursEnabled']),
			'quietHoursStart' => $this->timeValue($input['quietHoursStart'] ?? $before['quietHoursStart'], (string)$before['quietHoursStart']),
			'quietHoursEnd' => $this->timeValue($input['quietHoursEnd'] ?? $before['quietHoursEnd'], (string)$before['quietHoursEnd']),
		];

		$this->config->setAppValue(Application::APP_ID, 'real_execution_enabled', $settings['realExecutionEnabled'] ? '1' : '0');
		$this->config->setAppValue(Application::APP_ID, 'background_processing_enabled', $settings['backgroundProcessingEnabled'] ? '1' : '0');
		$this->config->setAppValue(Application::APP_ID, 'background_low_load_only', $settings['backgroundLowLoadOnly'] ? '1' : '0');
		$this->config->setAppValue(Application::APP_ID, 'background_max_load_1m', (string)$settings['backgroundMaxLoad1m']);
		$this->config->setAppValue(Application::APP_ID, 'background_quiet_hours_enabled', $settings['quietHoursEnabled'] ? '1' : '0');
		$this->config->setAppValue(Application::APP_ID, 'background_quiet_hours_start', $settings['quietHoursStart']);
		$this->config->setAppValue(Application::APP_ID, 'background_quiet_hours_end', $settings['quietHoursEnd']);

		$this->logService->warning('admin_settings_updated', $this->userId, [
			'before' => $before,
			'after' => $settings,
		], null, 'ImageFlow Betriebseinstellungen wurden geändert.');

		return new JSONResponse([
			'isAdmin' => true,
			'settings' => $settings,
			'backgroundGate' => $this->backgroundGateService->status(),
		]);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function settings(): array {
		return [
			'realExecutionEnabled' => $this->config->getAppValue(Application::APP_ID, 'real_execution_enabled', '0') === '1',
			'backgroundProcessingEnabled' => $this->config->getAppValue(Application::APP_ID, 'background_processing_enabled', '0') === '1',
			'backgroundLowLoadOnly' => $this->config->getAppValue(Application::APP_ID, 'background_low_load_only', '1') === '1',
			'backgroundMaxLoad1m' => $this->floatValue($this->config->getAppValue(Application::APP_ID, 'background_max_load_1m', '2'), 0.1, 128.0),
			'quietHoursEnabled' => $this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_enabled', '0') === '1',
			'quietHoursStart' => $this->timeValue($this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_start', '22:00'), '22:00'),
			'quietHoursEnd' => $this->timeValue($this->config->getAppValue(Application::APP_ID, 'background_quiet_hours_end', '06:00'), '06:00'),
		];
	}

	private function isAdmin(): bool {
		return $this->groupManager->isAdmin($this->userId);
	}

	private function forbidden(): JSONResponse {
		return new JSONResponse([
			'error' => 'admin_required',
			'message' => 'Nur Administratoren können ImageFlow Betriebseinstellungen ändern.',
		], Http::STATUS_FORBIDDEN);
	}

	private function boolValue(mixed $value): bool {
		if (is_bool($value)) {
			return $value;
		}
		if (is_string($value)) {
			return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
		}

		return (bool)$value;
	}

	private function floatValue(mixed $value, float $min, float $max): float {
		$value = is_string($value) ? str_replace(',', '.', $value) : $value;
		$float = is_numeric($value) ? (float)$value : 2.0;
		return round(max($min, min($max, $float)), 2);
	}

	private function timeValue(mixed $value, string $fallback): string {
		$value = is_scalar($value) ? (string)$value : $fallback;
		return preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value) === 1 ? $value : $fallback;
	}
}
