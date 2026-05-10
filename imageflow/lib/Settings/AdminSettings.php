<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Settings;

use OCA\ImageFlow\AppInfo\Application;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings {
	#[\Override]
	public function getForm(): TemplateResponse {
		Util::addScript(Application::APP_ID, 'imageflow-main');
		Util::addStyle(Application::APP_ID, 'imageflow-main');

		$response = new TemplateResponse(Application::APP_ID, 'settings-admin', []);
		$policy = new ContentSecurityPolicy();
		$policy->addAllowedScriptDomain("'self'");
		$response->setContentSecurityPolicy($policy);

		return $response;
	}

	#[\Override]
	public function getSection(): string {
		return Application::APP_ID;
	}

	#[\Override]
	public function getPriority(): int {
		return 10;
	}
}
