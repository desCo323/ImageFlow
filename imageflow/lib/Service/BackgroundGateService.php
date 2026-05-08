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
		$maxLoad = $this->floatConfig('background_max_load_1m', 2.0, 0.1, 128.0);
		$currentLoad = $this->currentLoad();
		$loadOk = !$lowLoadOnly || ($currentLoad !== null && $currentLoad <= $maxLoad);

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
			'message' => $this->message($reason, $currentLoad, $maxLoad, $quietHoursStart, $quietHoursEnd),
			'lowLoadOnly' => $lowLoadOnly,
			'currentLoad1m' => $currentLoad,
			'maxLoad1m' => $maxLoad,
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

	private function message(string $reason, ?float $currentLoad, float $maxLoad, string $start, string $end): string {
		return match ($reason) {
			'server_load_too_high' => sprintf('Automatik wartet: Serverlast %.2f liegt über %.2f.', $currentLoad ?? 0.0, $maxLoad),
			'load_unavailable' => 'Automatik wartet: Serverlast konnte nicht gelesen werden.',
			'outside_quiet_hours' => sprintf('Automatik wartet auf das Zeitfenster %s-%s.', $start, $end),
			default => 'Automatik darf laufen, sobald wartende Ablagen vorhanden sind.',
		};
	}
}
