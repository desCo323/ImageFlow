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
			return new JSONResponse($this->sortService->state($this->userId, $jobId));
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

	private function error(string $error, string $message, int $status): JSONResponse {
		return new JSONResponse([
			'error' => $error,
			'message' => $message,
		], $status);
	}
}
