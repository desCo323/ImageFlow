<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method string getLevel()
 * @method void setLevel(string $level)
 * @method string getEvent()
 * @method void setEvent(string $event)
 * @method string|null getUserId()
 * @method void setUserId(?string $userId)
 * @method int|null getJobId()
 * @method void setJobId(?int $jobId)
 * @method string getMessage()
 * @method void setMessage(string $message)
 * @method string|null getContextJson()
 * @method void setContextJson(?string $contextJson)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class AppLog extends Entity {
	protected string $level = '';
	protected string $event = '';
	protected ?string $userId = null;
	protected ?int $jobId = null;
	protected string $message = '';
	protected ?string $contextJson = null;
	protected int $createdAt = 0;

	protected array $_fieldTypes = [
		'id' => Types::BIGINT,
		'level' => Types::STRING,
		'event' => Types::STRING,
		'userId' => Types::STRING,
		'jobId' => Types::BIGINT,
		'message' => Types::STRING,
		'contextJson' => Types::TEXT,
		'createdAt' => Types::BIGINT,
	];
}
