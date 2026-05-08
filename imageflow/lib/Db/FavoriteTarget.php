<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getTargetMode()
 * @method void setTargetMode(string $targetMode)
 * @method string|null getTargetId()
 * @method void setTargetId(?string $targetId)
 * @method string getTargetLabel()
 * @method void setTargetLabel(string $targetLabel)
 * @method string|null getTargetPath()
 * @method void setTargetPath(?string $targetPath)
 * @method string|null getHotkey()
 * @method void setHotkey(?string $hotkey)
 * @method int getSortPosition()
 * @method void setSortPosition(int $sortPosition)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class FavoriteTarget extends Entity {
	protected string $userId = '';
	protected string $targetMode = '';
	protected ?string $targetId = null;
	protected string $targetLabel = '';
	protected ?string $targetPath = null;
	protected ?string $hotkey = null;
	protected int $sortPosition = 0;
	protected int $createdAt = 0;
	protected int $updatedAt = 0;

	protected array $_fieldTypes = [
		'id' => Types::BIGINT,
		'userId' => Types::STRING,
		'targetMode' => Types::STRING,
		'targetId' => Types::STRING,
		'targetLabel' => Types::STRING,
		'targetPath' => Types::STRING,
		'hotkey' => Types::STRING,
		'sortPosition' => Types::INTEGER,
		'createdAt' => Types::BIGINT,
		'updatedAt' => Types::BIGINT,
	];
}
