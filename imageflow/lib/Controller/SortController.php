<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\LogService;
use OCA\ImageFlow\Service\SortService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class SortController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly SortService $sortService,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function state(int $jobId): JSONResponse {
		try {
			return new JSONResponse($this->sortService->state(
				$this->userId,
				$jobId,
				$this->optionalIntParam('cursor', 0, PHP_INT_MAX),
				$this->intParam('limit', 48, 1, 120),
				$this->stringParam('start', 32),
			));
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		}
	}

	#[NoAdminRequired]
	public function assign(int $jobId): JSONResponse {
		try {
			return new JSONResponse($this->sortService->assign($this->userId, $jobId, $this->request->getParams()));
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_assignment', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('assignment_failed', $e, $this->userId, $jobId);
			return $this->error('assignment_failed', 'Die Sortierentscheidung konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function skip(int $jobId): JSONResponse {
		try {
			return new JSONResponse($this->sortService->skip($this->userId, $jobId, $this->request->getParams()));
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_skip', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('skip_failed', $e, $this->userId, $jobId);
			return $this->error('skip_failed', 'Das Ueberspringen konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function position(int $jobId): JSONResponse {
		try {
			return new JSONResponse($this->sortService->position($this->userId, $jobId, $this->request->getParams()));
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_position', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('position_save_failed', $e, $this->userId, $jobId);
			return $this->error('position_save_failed', 'Die aktuelle Position konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	private function error(string $error, string $message, int $status): JSONResponse {
		return new JSONResponse([
			'error' => $error,
			'message' => $message,
		], $status);
	}

	private function optionalIntParam(string $key, int $min, int $max): ?int {
		$value = $this->request->getParam($key, null);
		if ($value === null || $value === '') {
			return null;
		}
		if (!is_numeric($value)) {
			return null;
		}

		return max($min, min($max, (int)$value));
	}

	private function intParam(string $key, int $default, int $min, int $max): int {
		$value = $this->request->getParam($key, $default);
		$value = is_numeric($value) ? (int)$value : $default;
		return max($min, min($max, $value));
	}

	private function stringParam(string $key, int $length): ?string {
		$value = $this->request->getParam($key, null);
		if (!is_scalar($value)) {
			return null;
		}

		$value = trim((string)$value);
		return $value === '' ? null : substr($value, 0, $length);
	}
}
