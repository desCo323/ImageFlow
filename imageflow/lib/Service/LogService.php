<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Service;

use OCA\ImageFlow\Db\AppLog;
use OCA\ImageFlow\Db\AppLogMapper;
use Psr\Log\LoggerInterface;

class LogService {
	public function __construct(
		private readonly AppLogMapper $mapper,
		private readonly LoggerInterface $logger,
	) {
	}

	public function debug(string $event, ?string $userId = null, array $context = [], ?int $jobId = null, string $message = ''): void {
		$this->write('debug', $event, $userId, $context, $jobId, $message);
	}

	public function info(string $event, ?string $userId = null, array $context = [], ?int $jobId = null, string $message = ''): void {
		$this->write('info', $event, $userId, $context, $jobId, $message);
	}

	public function warning(string $event, ?string $userId = null, array $context = [], ?int $jobId = null, string $message = ''): void {
		$this->write('warning', $event, $userId, $context, $jobId, $message);
	}

	public function exception(string $event, \Throwable $e, ?string $userId = null, ?int $jobId = null): void {
		$this->logger->error($event . ': ' . $e->getMessage(), [
			'app' => 'imageflow',
			'exception' => $e,
			'userId' => $userId,
			'jobId' => $jobId,
		]);
		$this->write('error', $event, $userId, [
			'exception' => $e::class,
			'message' => $e->getMessage(),
		], $jobId, $e->getMessage());
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function recent(?string $userId, int $limit = 100, ?string $level = null, ?int $jobId = null): array {
		return array_map([$this, 'serialize'], $this->mapper->findRecent($limit, $level, $userId, $jobId));
	}

	private function write(string $level, string $event, ?string $userId, array $context, ?int $jobId, string $message): void {
		try {
			$log = new AppLog();
			$log->setLevel($level);
			$log->setEvent(substr($event, 0, 96));
			$log->setUserId($userId);
			$log->setJobId($jobId);
			$log->setMessage(substr($message !== '' ? $message : $event, 0, 512));
			$log->setContextJson($context === [] ? null : json_encode($this->redact($context), JSON_THROW_ON_ERROR));
			$log->setCreatedAt(time());
			$this->mapper->insert($log);
		} catch (\Throwable $e) {
			$this->logger->warning('ImageFlow database log write failed: ' . $e->getMessage(), [
				'app' => 'imageflow',
				'event' => $event,
			]);
		}
	}

	/**
	 * @param array<string, mixed> $context
	 * @return array<string, mixed>
	 */
	private function redact(array $context): array {
		foreach ($context as $key => $value) {
			if (preg_match('/token|password|secret|credential|session/i', (string)$key) === 1) {
				$context[$key] = '[redacted]';
			} elseif (is_array($value)) {
				$context[$key] = $this->redact($value);
			}
		}

		return $context;
	}

	/**
	 * @return array<string, mixed>
	 */
	private function serialize(AppLog $log): array {
		return [
			'id' => $log->getId(),
			'level' => $log->getLevel(),
			'event' => $log->getEvent(),
			'userId' => $log->getUserId(),
			'jobId' => $log->getJobId(),
			'message' => $log->getMessage(),
			'context' => $this->decodeJson($log->getContextJson()),
			'createdAt' => $log->getCreatedAt(),
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	private function decodeJson(?string $json): array {
		if ($json === null || $json === '') {
			return [];
		}

		try {
			$decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
			return is_array($decoded) ? $decoded : [];
		} catch (\JsonException) {
			return [];
		}
	}
}
