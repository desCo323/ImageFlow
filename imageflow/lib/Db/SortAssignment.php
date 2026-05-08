<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method int getJobId()
 * @method void setJobId(int $jobId)
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method int|null getFileId()
 * @method void setFileId(?int $fileId)
 * @method string getSourcePath()
 * @method void setSourcePath(string $sourcePath)
 * @method string getFileName()
 * @method void setFileName(string $fileName)
 * @method string|null getMimeType()
 * @method void setMimeType(?string $mimeType)
 * @method string getTargetType()
 * @method void setTargetType(string $targetType)
 * @method string|null getTargetId()
 * @method void setTargetId(?string $targetId)
 * @method string getTargetLabel()
 * @method void setTargetLabel(string $targetLabel)
 * @method string|null getHotkey()
 * @method void setHotkey(?string $hotkey)
 * @method string getActionStatus()
 * @method void setActionStatus(string $actionStatus)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class SortAssignment extends Entity {
	protected int $jobId = 0;
	protected string $userId = '';
	protected ?int $fileId = null;
	protected string $sourcePath = '';
	protected string $fileName = '';
	protected ?string $mimeType = null;
	protected string $targetType = '';
	protected ?string $targetId = null;
	protected string $targetLabel = '';
	protected ?string $hotkey = null;
	protected string $actionStatus = 'planned';
	protected int $createdAt = 0;
	protected int $updatedAt = 0;

	protected array $_fieldTypes = [
		'id' => Types::BIGINT,
		'jobId' => Types::BIGINT,
		'userId' => Types::STRING,
		'fileId' => Types::BIGINT,
		'sourcePath' => Types::STRING,
		'fileName' => Types::STRING,
		'mimeType' => Types::STRING,
		'targetType' => Types::STRING,
		'targetId' => Types::STRING,
		'targetLabel' => Types::STRING,
		'hotkey' => Types::STRING,
		'actionStatus' => Types::STRING,
		'createdAt' => Types::BIGINT,
		'updatedAt' => Types::BIGINT,
	];
}
