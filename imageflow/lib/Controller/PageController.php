<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Controller;

use OCA\ImageFlow\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\Util;

class PageController extends Controller {
	public function __construct(IRequest $request) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		return $this->render('jobs', null);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function indexJob(int $jobId): TemplateResponse {
		return $this->render('sort', $jobId);
	}

	private function render(string $page, ?int $jobId): TemplateResponse {
		Util::addScript(Application::APP_ID, 'imageflow-main');
		Util::addStyle(Application::APP_ID, 'imageflow-main');

		$response = new TemplateResponse(Application::APP_ID, 'main', [
			'page' => $page,
			'jobId' => $jobId,
		]);

		$policy = new ContentSecurityPolicy();
		$policy->addAllowedScriptDomain("'self'");
		$response->setContentSecurityPolicy($policy);

		return $response;
	}
}
