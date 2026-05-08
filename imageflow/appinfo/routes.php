<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#indexJob', 'url' => '/jobs/{jobId}', 'verb' => 'GET'],
		['name' => 'health#index', 'url' => '/api/v1/health', 'verb' => 'GET'],
		['name' => 'job#index', 'url' => '/api/v1/jobs', 'verb' => 'GET'],
		['name' => 'job#create', 'url' => '/api/v1/jobs', 'verb' => 'POST'],
		['name' => 'job#show', 'url' => '/api/v1/jobs/{jobId}', 'verb' => 'GET'],
		['name' => 'job#pause', 'url' => '/api/v1/jobs/{jobId}/pause', 'verb' => 'POST'],
		['name' => 'job#resume', 'url' => '/api/v1/jobs/{jobId}/resume', 'verb' => 'POST'],
		['name' => 'job#markReady', 'url' => '/api/v1/jobs/{jobId}/ready', 'verb' => 'POST'],
		['name' => 'job#queueExecution', 'url' => '/api/v1/jobs/{jobId}/queue-execution', 'verb' => 'POST'],
		['name' => 'sort#state', 'url' => '/api/v1/jobs/{jobId}/sort-state', 'verb' => 'GET'],
		['name' => 'sort#assign', 'url' => '/api/v1/jobs/{jobId}/assign', 'verb' => 'POST'],
		['name' => 'sort#skip', 'url' => '/api/v1/jobs/{jobId}/skip', 'verb' => 'POST'],
		['name' => 'target#index', 'url' => '/api/v1/targets', 'verb' => 'GET'],
		['name' => 'folder#index', 'url' => '/api/v1/folders', 'verb' => 'GET'],
		['name' => 'log#index', 'url' => '/api/v1/logs', 'verb' => 'GET'],
	],
];
