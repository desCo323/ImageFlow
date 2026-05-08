<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\JobService;
use OCA\ImageFlow\Service\LogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class JobController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly string $userId,
		private readonly JobService $jobService,
		private readonly LogService $logService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		return new JSONResponse([
			'jobs' => $this->jobService->listJobs($this->userId),
		]);
	}

	#[NoAdminRequired]
	public function create(): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->createJob($this->userId, $this->request->getParams()),
			], Http::STATUS_CREATED);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_job_request', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('job_create_failed', $e, $this->userId);
			return $this->error('job_create_failed', 'Der Sortierjob konnte nicht angelegt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function show(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->getJob($this->userId, $jobId),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		}
	}

	#[NoAdminRequired]
	public function pause(int $jobId): JSONResponse {
		return $this->status($jobId, 'paused');
	}

	#[NoAdminRequired]
	public function delete(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'deleted' => true,
				'jobId' => $jobId,
				'removed' => $this->jobService->discardJob($this->userId, $jobId),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('job_delete_blocked', $e->getMessage(), Http::STATUS_CONFLICT);
		} catch (\Throwable $e) {
			$this->logService->exception('job_delete_failed', $e, $this->userId, $jobId);
			return $this->error('job_delete_failed', 'Der Sortierjob konnte nicht verworfen werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function resume(int $jobId): JSONResponse {
		return $this->status($jobId, 'sorting');
	}

	#[NoAdminRequired]
	public function markReady(int $jobId): JSONResponse {
		return $this->status($jobId, 'ready');
	}

	#[NoAdminRequired]
	public function queueExecution(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->queueExecution($this->userId, $jobId),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('job_queue_execution_failed', $e, $this->userId, $jobId);
			return $this->error('job_queue_execution_failed', 'Die Ausfuehrung konnte nicht vorgemerkt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	private function status(int $jobId, string $status): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->setStatus($this->userId, $jobId, $status),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Der Sortierjob wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_job_status', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		}
	}

	private function error(string $error, string $message, int $status): JSONResponse {
		return new JSONResponse([
			'error' => $error,
			'message' => $message,
		], $status);
	}
}
