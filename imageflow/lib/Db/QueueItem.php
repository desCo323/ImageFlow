<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method int getJobId()
 * @method void setJobId(int $jobId)
 * @method int|null getAssignmentId()
 * @method void setAssignmentId(?int $assignmentId)
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getOperationType()
 * @method void setOperationType(string $operationType)
 * @method string getSourcePath()
 * @method void setSourcePath(string $sourcePath)
 * @method string|null getTargetPath()
 * @method void setTargetPath(?string $targetPath)
 * @method string|null getTargetAlbumId()
 * @method void setTargetAlbumId(?string $targetAlbumId)
 * @method string getStatus()
 * @method void setStatus(string $status)
 * @method bool getSafeMode()
 * @method void setSafeMode(bool $safeMode)
 * @method string|null getSourceChecksum()
 * @method void setSourceChecksum(?string $sourceChecksum)
 * @method string|null getTargetChecksum()
 * @method void setTargetChecksum(?string $targetChecksum)
 * @method int getAttempts()
 * @method void setAttempts(int $attempts)
 * @method string|null getLastError()
 * @method void setLastError(?string $lastError)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @method int|null getExecutedAt()
 * @method void setExecutedAt(?int $executedAt)
 */
class QueueItem extends Entity {
	protected int $jobId = 0;
	protected ?int $assignmentId = null;
	protected string $userId = '';
	protected string $operationType = '';
	protected string $sourcePath = '';
	protected ?string $targetPath = null;
	protected ?string $targetAlbumId = null;
	protected string $status = 'planned';
	protected bool $safeMode = true;
	protected ?string $sourceChecksum = null;
	protected ?string $targetChecksum = null;
	protected int $attempts = 0;
	protected ?string $lastError = null;
	protected int $createdAt = 0;
	protected int $updatedAt = 0;
	protected ?int $executedAt = null;

	protected array $_fieldTypes = [
		'id' => Types::BIGINT,
		'jobId' => Types::BIGINT,
		'assignmentId' => Types::BIGINT,
		'userId' => Types::STRING,
		'operationType' => Types::STRING,
		'sourcePath' => Types::STRING,
		'targetPath' => Types::STRING,
		'targetAlbumId' => Types::STRING,
		'status' => Types::STRING,
		'safeMode' => Types::BOOLEAN,
		'sourceChecksum' => Types::STRING,
		'targetChecksum' => Types::STRING,
		'attempts' => Types::INTEGER,
		'lastError' => Types::TEXT,
		'createdAt' => Types::BIGINT,
		'updatedAt' => Types::BIGINT,
		'executedAt' => Types::BIGINT,
	];
}
