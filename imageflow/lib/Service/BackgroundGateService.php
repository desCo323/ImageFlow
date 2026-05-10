<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\AppInfo\Application;
use OCP\IConfig;

class BackgroundGateService {
	public function __construct(
		private readonly IConfig $config,
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function status(?int $now = null): array {
		$now ??= time();
		$lowLoadOnly = $this->boolConfig('background_low_load_only', true);
		$cpuCount = $this->cpuCount();
		$maxLoadPercent = $this->maxLoadPercent($cpuCount);
		$maxLoad = round(($maxLoadPercent / 100.0) * $cpuCount, 2);
		$currentLoad = $this->currentLoad();
		$currentLoadPercent = $currentLoad === null ? null : round(($currentLoad / max(1, $cpuCount)) * 100.0, 1);
		$loadOk = !$lowLoadOnly || ($currentLoadPercent !== null && $currentLoadPercent <= $maxLoadPercent);

		$quietHoursEnabled = $this->boolConfig('background_quiet_hours_enabled', false);
		$quietHoursStart = $this->timeConfig('background_quiet_hours_start', '22:00');
		$quietHoursEnd = $this->timeConfig('background_quiet_hours_end', '06:00');
		$currentTime = date('H:i', $now);
		$quietHoursOk = !$quietHoursEnabled || $this->isWithinWindow($currentTime, $quietHoursStart, $quietHoursEnd);

		$canRun = $loadOk && $quietHoursOk;
		$reason = 'ready';
		if (!$loadOk) {
			$reason = $currentLoad === null ? 'load_unavailable' : 'server_load_too_high';
		} elseif (!$quietHoursOk) {
			$reason = 'outside_quiet_hours';
		}

		return [
			'canRun' => $canRun,
			'reason' => $reason,
			'message' => $this->message($reason, $currentLoad, $currentLoadPercent, $maxLoadPercent, $cpuCount, $quietHoursStart, $quietHoursEnd),
			'lowLoadOnly' => $lowLoadOnly,
			'cpuCount' => $cpuCount,
			'currentLoad1m' => $currentLoad,
			'maxLoad1m' => $maxLoad,
			'currentLoadPercent' => $currentLoadPercent,
			'maxLoadPercent' => $maxLoadPercent,
			'loadOk' => $loadOk,
			'quietHoursEnabled' => $quietHoursEnabled,
			'quietHoursStart' => $quietHoursStart,
			'quietHoursEnd' => $quietHoursEnd,
			'quietHoursOk' => $quietHoursOk,
			'currentTime' => $currentTime,
		];
	}

	private function boolConfig(string $key, bool $default): bool {
		$value = $this->config->getAppValue(Application::APP_ID, $key, $default ? '1' : '0');
		return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
	}

	private function floatConfig(string $key, float $default, float $min, float $max): float {
		$value = str_replace(',', '.', $this->config->getAppValue(Application::APP_ID, $key, (string)$default));
		$float = is_numeric($value) ? (float)$value : $default;
		return max($min, min($max, $float));
	}

	private function maxLoadPercent(int $cpuCount): float {
		$explicit = $this->config->getAppValue(Application::APP_ID, 'background_max_load_percent', '');
		if (is_numeric(str_replace(',', '.', $explicit))) {
			return $this->floatConfig('background_max_load_percent', 70.0, 1.0, 100.0);
		}

		$legacy = str_replace(',', '.', $this->config->getAppValue(Application::APP_ID, 'background_max_load_1m', ''));
		$legacyRawLoad = is_numeric($legacy) ? max(0.1, min(128.0, (float)$legacy)) : 0.0;
		if ($legacyRawLoad > 0.0) {
			if (abs($legacyRawLoad - 2.0) < 0.001) {
				return 70.0;
			}
			return round(max(1.0, min(100.0, ($legacyRawLoad / max(1, $cpuCount)) * 100.0)), 1);
		}

		return 70.0;
	}

	private function timeConfig(string $key, string $default): string {
		$value = $this->config->getAppValue(Application::APP_ID, $key, $default);
		if (preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value) !== 1) {
			return $default;
		}

		return $value;
	}

	private function currentLoad(): ?float {
		$load = function_exists('sys_getloadavg') ? sys_getloadavg() : false;
		if (!is_array($load) || !isset($load[0]) || !is_numeric($load[0])) {
			return null;
		}

		return round((float)$load[0], 2);
	}

	private function cpuCount(): int {
		if (is_readable('/proc/cpuinfo')) {
			$cpuInfo = (string)file_get_contents('/proc/cpuinfo');
			preg_match_all('/^processor\s*:/m', $cpuInfo, $matches);
			if (count($matches[0]) > 0) {
				return count($matches[0]);
			}
		}

		return 1;
	}

	private function isWithinWindow(string $current, string $start, string $end): bool {
		$currentMinutes = $this->minutes($current);
		$startMinutes = $this->minutes($start);
		$endMinutes = $this->minutes($end);
		if ($startMinutes === $endMinutes) {
			return true;
		}
		if ($startMinutes < $endMinutes) {
			return $currentMinutes >= $startMinutes && $currentMinutes < $endMinutes;
		}

		return $currentMinutes >= $startMinutes || $currentMinutes < $endMinutes;
	}

	private function minutes(string $time): int {
		[$hours, $minutes] = array_map('intval', explode(':', $time));
		return ($hours * 60) + $minutes;
	}

	private function message(string $reason, ?float $currentLoad, ?float $currentLoadPercent, float $maxLoadPercent, int $cpuCount, string $start, string $end): string {
		return match ($reason) {
			'server_load_too_high' => sprintf('Automatik wartet: Serverauslastung %.1f%% liegt über %.1f%%. Linux-Load %.2f bei %d CPU-Kernen.', $currentLoadPercent ?? 0.0, $maxLoadPercent, $currentLoad ?? 0.0, $cpuCount),
			'load_unavailable' => 'Automatik wartet: Serverauslastung konnte nicht gelesen werden.',
			'outside_quiet_hours' => sprintf('Automatik wartet auf das Zeitfenster %s-%s.', $start, $end),
			default => sprintf('Automatik darf laufen: Serverauslastung %.1f%% liegt unter %.1f%%. Der nächste Nextcloud-Cronlauf verarbeitet freigegebene Ablagen.', $currentLoadPercent ?? 0.0, $maxLoadPercent),
		};
	}
}
