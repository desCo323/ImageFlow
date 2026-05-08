<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getName()
 * @method void setName(string $name)
 * @method string getSourcePath()
 * @method void setSourcePath(string $sourcePath)
 * @method string getTargetMode()
 * @method void setTargetMode(string $targetMode)
 * @method string|null getTargetPath()
 * @method void setTargetPath(?string $targetPath)
 * @method string|null getAlbumName()
 * @method void setAlbumName(?string $albumName)
 * @method string getStatus()
 * @method void setStatus(string $status)
 * @method bool getSafeMode()
 * @method void setSafeMode(bool $safeMode)
 * @method string|null getOptionsJson()
 * @method void setOptionsJson(?string $optionsJson)
 * @method int getTotalFiles()
 * @method void setTotalFiles(int $totalFiles)
 * @method int getSortedFiles()
 * @method void setSortedFiles(int $sortedFiles)
 * @method int getSkippedFiles()
 * @method void setSkippedFiles(int $skippedFiles)
 * @method int getQueuedOperations()
 * @method void setQueuedOperations(int $queuedOperations)
 * @method int getExecutedOperations()
 * @method void setExecutedOperations(int $executedOperations)
 * @method int getFailedOperations()
 * @method void setFailedOperations(int $failedOperations)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @method int|null getLastOpenedAt()
 * @method void setLastOpenedAt(?int $lastOpenedAt)
 * @method int|null getExecutionStartedAt()
 * @method void setExecutionStartedAt(?int $executionStartedAt)
 * @method int|null getExecutionFinishedAt()
 * @method void setExecutionFinishedAt(?int $executionFinishedAt)
 * @method string|null getErrorMessage()
 * @method void setErrorMessage(?string $errorMessage)
 */
class SortJob extends Entity {
	protected string $userId = '';
	protected string $name = '';
	protected string $sourcePath = '/';
	protected string $targetMode = 'album';
	protected ?string $targetPath = null;
	protected ?string $albumName = null;
	protected string $status = 'draft';
	protected bool $safeMode = true;
	protected ?string $optionsJson = null;
	protected int $totalFiles = 0;
	protected int $sortedFiles = 0;
	protected int $skippedFiles = 0;
	protected int $queuedOperations = 0;
	protected int $executedOperations = 0;
	protected int $failedOperations = 0;
	protected int $createdAt = 0;
	protected int $updatedAt = 0;
	protected ?int $lastOpenedAt = null;
	protected ?int $executionStartedAt = null;
	protected ?int $executionFinishedAt = null;
	protected ?string $errorMessage = null;

	protected array $_fieldTypes = [
		'id' => Types::BIGINT,
		'userId' => Types::STRING,
		'name' => Types::STRING,
		'sourcePath' => Types::STRING,
		'targetMode' => Types::STRING,
		'targetPath' => Types::STRING,
		'albumName' => Types::STRING,
		'status' => Types::STRING,
		'safeMode' => Types::BOOLEAN,
		'optionsJson' => Types::TEXT,
		'totalFiles' => Types::INTEGER,
		'sortedFiles' => Types::INTEGER,
		'skippedFiles' => Types::INTEGER,
		'queuedOperations' => Types::INTEGER,
		'executedOperations' => Types::INTEGER,
		'failedOperations' => Types::INTEGER,
		'createdAt' => Types::BIGINT,
		'updatedAt' => Types::BIGINT,
		'lastOpenedAt' => Types::BIGINT,
		'executionStartedAt' => Types::BIGINT,
		'executionFinishedAt' => Types::BIGINT,
		'errorMessage' => Types::TEXT,
	];
}
