<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCA\ImageFlow\Service\JobService;
use OCA\ImageFlow\Service\LogService;
use OCA\ImageFlow\Service\QueueExecutionService;
use OCA\ImageFlow\Service\WorklistPreviewService;
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
		private readonly WorklistPreviewService $worklistPreviewService,
		private readonly QueueExecutionService $queueExecutionService,
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
			return $this->error('job_create_failed', 'Die Runde konnte nicht angelegt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function update(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->updateJob($this->userId, $jobId, $this->request->getParams()),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_job_request', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logService->exception('job_update_failed', $e, $this->userId, $jobId);
			return $this->error('job_update_failed', 'Die Runde konnte nicht gespeichert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function show(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->getJob($this->userId, $jobId),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		}
	}

	#[NoAdminRequired]
	public function pause(int $jobId): JSONResponse {
		return $this->status($jobId, 'paused');
	}

	#[NoAdminRequired]
	public function delete(int $jobId): JSONResponse {
		return $this->discard($jobId);
	}

	#[NoAdminRequired]
	public function duplicate(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->duplicateJob($this->userId, $jobId),
			], Http::STATUS_CREATED);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('job_duplicate_failed', $e, $this->userId, $jobId);
			return $this->error('job_duplicate_failed', 'Die Runde konnte nicht kopiert werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function discard(int $jobId): JSONResponse {
		try {
			return new JSONResponse([
				'deleted' => true,
				'jobId' => $jobId,
				'removed' => $this->jobService->discardJob($this->userId, $jobId),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('job_delete_blocked', $e->getMessage(), Http::STATUS_CONFLICT);
		} catch (\Throwable $e) {
			$this->logService->exception('job_delete_failed', $e, $this->userId, $jobId);
			return $this->error('job_delete_failed', 'Die Runde konnte nicht verworfen werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
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
	public function worklistPreview(int $jobId): JSONResponse {
		try {
			return new JSONResponse($this->worklistPreviewService->preview(
				$this->userId,
				$jobId,
				$this->intParam('limit', 250, 1, 500),
			));
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('worklist_preview_failed', $e, $this->userId, $jobId);
			return $this->error('worklist_preview_failed', 'Die Ablage konnte nicht geprüft werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function queueExecution(int $jobId): JSONResponse {
		try {
			$preview = $this->worklistPreviewService->preview($this->userId, $jobId, 500);
			if (!($preview['canQueue'] ?? false)) {
				$summary = is_array($preview['summary'] ?? null) ? $preview['summary'] : [];
				if (((int)($summary['queued'] ?? 0) + (int)($summary['executing'] ?? 0)) > 0) {
					$job = $this->jobService->updateProcessingOptions($this->userId, $jobId, $this->request->getParams());
					return new JSONResponse([
						'job' => $job,
						'preview' => $this->worklistPreviewService->preview($this->userId, $jobId, 500),
					]);
				}
				return new JSONResponse([
					'error' => 'worklist_not_ready',
					'message' => 'Die Ablage enthält Fehler oder noch keine Entscheidungen.',
					'preview' => $preview,
				], Http::STATUS_CONFLICT);
			}

			$job = $this->jobService->queueExecution($this->userId, $jobId, $this->request->getParams());
			return new JSONResponse([
				'job' => $job,
				'preview' => $this->worklistPreviewService->preview($this->userId, $jobId, 500),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('job_queue_execution_failed', $e, $this->userId, $jobId);
			return $this->error('job_queue_execution_failed', 'Die Ablage konnte nicht für später gemerkt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	public function processNow(int $jobId): JSONResponse {
		try {
			if (!$this->queueExecutionService->isRealExecutionEnabled()) {
				return new JSONResponse([
					'error' => 'real_execution_disabled',
					'message' => 'Echte Dateiänderungen sind serverseitig deaktiviert.',
					'preview' => $this->worklistPreviewService->preview($this->userId, $jobId, 500),
				], Http::STATUS_CONFLICT);
			}

			$result = $this->queueExecutionService->processJobNow($this->userId, $jobId, $this->intParam('limit', 25, 1, 100));
			return new JSONResponse([
				'result' => $result,
				'job' => $this->jobService->getJob($this->userId, $jobId),
				'preview' => $this->worklistPreviewService->preview($this->userId, $jobId, 500),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\Throwable $e) {
			$this->logService->exception('job_process_now_failed', $e, $this->userId, $jobId);
			return $this->error('job_process_now_failed', 'Die Ablage konnte nicht abgelegt werden.', Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	private function status(int $jobId, string $status): JSONResponse {
		try {
			return new JSONResponse([
				'job' => $this->jobService->setStatus($this->userId, $jobId, $status),
			]);
		} catch (DoesNotExistException) {
			return $this->error('job_not_found', 'Die Runde wurde nicht gefunden.', Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return $this->error('invalid_job_status', $e->getMessage(), Http::STATUS_BAD_REQUEST);
		}
	}

	private function intParam(string $key, int $default, int $min, int $max): int {
		$value = $this->request->getParam($key, $default);
		$value = is_numeric($value) ? (int)$value : $default;
		return max($min, min($max, $value));
	}

	private function error(string $error, string $message, int $status): JSONResponse {
		return new JSONResponse([
			'error' => $error,
			'message' => $message,
		], $status);
	}
}
