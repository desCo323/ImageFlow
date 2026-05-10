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
use OCP\IGroupManager;
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
		private readonly IGroupManager $groupManager,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function export(): JSONResponse {
		$backgroundGate = $this->backgroundGateService->status();
		$anonymized = $this->boolParam('anonymized', false);
		$allLogs = $this->boolParam('scopeAll', false) && $this->groupManager->isAdmin($this->userId);
		$logUserId = $allLogs ? null : $this->userId;
		$payload = [
			'app' => Application::APP_ID,
			'version' => Application::VERSION,
			'generatedAt' => time(),
			'retentionDays' => 90,
			'anonymized' => $anonymized,
			'scope' => $allLogs ? 'all-users' : 'current-user',
			'userId' => $this->userId,
			'nextcloud' => [
				'version' => $this->config->getSystemValueString('version', ''),
				'backgroundJobsMode' => $this->config->getSystemValueString('backgroundjobs_mode', ''),
				'maintenanceWindowStart' => $this->config->getSystemValue('maintenance_window_start', null),
			],
			'server' => [
				'phpVersion' => PHP_VERSION,
				'phpSapi' => PHP_SAPI,
				'osFamily' => PHP_OS_FAMILY,
				'memoryLimit' => ini_get('memory_limit') ?: '',
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
				'Anonymisierte Exporte ersetzen Benutzer, Pfade, Dateinamen, Zielnamen und freie Textwerte durch stabile Platzhalter.',
				'Dieser Export enthält keine Nextcloud-Konfigurationsgeheimnisse und keinen Hostnamen.',
			],
			'logs' => $this->logService->recent($logUserId, $allLogs ? 5000 : 1000, '', null),
		];
		if ($anonymized) {
			$payload = $this->anonymizePayload($payload);
		}

		$response = new JSONResponse($payload);
		$suffix = $anonymized ? 'support-anonymized' : 'diagnostics';
		$response->addHeader('Content-Disposition', 'attachment; filename="imageflow-' . $suffix . '-' . date('Ymd-His') . '.json"');
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

	private function boolParam(string $key, bool $default): bool {
		$value = $this->request->getParam($key, $default ? '1' : '0');
		if (is_bool($value)) {
			return $value;
		}
		return is_scalar($value) ? in_array(strtolower((string)$value), ['1', 'true', 'yes', 'on'], true) : $default;
	}

	/**
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function anonymizePayload(array $payload): array {
		$map = [];
		return $this->anonymizeValue($payload, '', $map);
	}

	/**
	 * @param array<string, string> $map
	 */
	private function anonymizeValue(mixed $value, string $key, array &$map): mixed {
		if (is_array($value)) {
			$result = [];
			foreach ($value as $childKey => $childValue) {
				$result[$childKey] = $this->anonymizeValue($childValue, (string)$childKey, $map);
			}
			return $result;
		}
		if (!is_scalar($value) || $value === null) {
			return $value;
		}
		if (is_bool($value) || is_int($value) || is_float($value)) {
			return $value;
		}

		$text = (string)$value;
		if ($text === '') {
			return $text;
		}
		if ($this->isSensitiveKey($key)) {
			return $this->placeholder($this->placeholderPrefix($key), $text, $map);
		}

		return $this->anonymizeFreeText($text, $map);
	}

	private function isSensitiveKey(string $key): bool {
		return preg_match('/user|owner|uid|path|file|folder|album|label|name|source|target/i', $key) === 1
			&& preg_match('/version|mode|status|event|level|type|reason|message|generated|retention/i', $key) !== 1;
	}

	private function placeholderPrefix(string $key): string {
		if (preg_match('/user|owner|uid/i', $key) === 1) {
			return 'user';
		}
		if (preg_match('/path|folder|source|target/i', $key) === 1) {
			return 'path';
		}
		if (preg_match('/album/i', $key) === 1) {
			return 'album';
		}
		if (preg_match('/file/i', $key) === 1) {
			return 'file';
		}
		return 'text';
	}

	/**
	 * @param array<string, string> $map
	 */
	private function placeholder(string $prefix, string $value, array &$map): string {
		$mapKey = $prefix . ':' . $value;
		if (!isset($map[$mapKey])) {
			$map[$mapKey] = sprintf('[%s#%s]', $prefix, substr(hash('sha256', $mapKey), 0, 10));
		}
		return $map[$mapKey];
	}

	/**
	 * @param array<string, string> $map
	 */
	private function anonymizeFreeText(string $text, array &$map): string {
		$text = preg_replace_callback('/\/[^\s"\'<>]+/', fn (array $match): string => $this->placeholder('path', $match[0], $map), $text) ?? $text;
		$text = preg_replace_callback('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', fn (array $match): string => $this->placeholder('email', $match[0], $map), $text) ?? $text;
		$text = preg_replace_callback('/\b[\w.-]+\.(?:jpe?g|png|gif|webp|heic|heif|tiff?)\b/i', fn (array $match): string => $this->placeholder('file', $match[0], $map), $text) ?? $text;
		return $text;
	}
}
