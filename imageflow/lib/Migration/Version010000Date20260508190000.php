<?php

declare(strict_types=1);

namespace OCA\ImageFlow\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version010000Date20260508190000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if (!$schema->hasTable('imageflow_jobs')) {
			$table = $schema->createTable('imageflow_jobs');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('name', Types::STRING, [
				'notnull' => true,
				'length' => 160,
			]);
			$table->addColumn('source_path', Types::STRING, [
				'notnull' => true,
				'length' => 1024,
			]);
			$table->addColumn('target_mode', Types::STRING, [
				'notnull' => true,
				'length' => 32,
			]);
			$table->addColumn('target_path', Types::STRING, [
				'notnull' => false,
				'length' => 1024,
			]);
			$table->addColumn('album_name', Types::STRING, [
				'notnull' => false,
				'length' => 255,
			]);
			$table->addColumn('status', Types::STRING, [
				'notnull' => true,
				'length' => 32,
				'default' => 'draft',
			]);
			$table->addColumn('safe_mode', Types::BOOLEAN, [
				'notnull' => true,
				'default' => true,
			]);
			$table->addColumn('options_json', Types::TEXT, [
				'notnull' => false,
			]);
			$table->addColumn('total_files', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('sorted_files', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('skipped_files', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('queued_operations', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('executed_operations', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('failed_operations', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('created_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('updated_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('last_opened_at', Types::BIGINT, [
				'notnull' => false,
			]);
			$table->addColumn('execution_started_at', Types::BIGINT, [
				'notnull' => false,
			]);
			$table->addColumn('execution_finished_at', Types::BIGINT, [
				'notnull' => false,
			]);
			$table->addColumn('error_message', Types::TEXT, [
				'notnull' => false,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['user_id', 'updated_at'], 'ifl_job_user_updated');
			$table->addIndex(['user_id', 'status'], 'ifl_job_user_status');
			$table->addIndex(['status'], 'ifl_job_status');
		}

		if (!$schema->hasTable('imageflow_assignments')) {
			$table = $schema->createTable('imageflow_assignments');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('job_id', Types::BIGINT, [
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('file_id', Types::BIGINT, [
				'notnull' => false,
				'length' => 20,
			]);
			$table->addColumn('source_path', Types::STRING, [
				'notnull' => true,
				'length' => 1024,
			]);
			$table->addColumn('file_name', Types::STRING, [
				'notnull' => true,
				'length' => 255,
			]);
			$table->addColumn('mime_type', Types::STRING, [
				'notnull' => false,
				'length' => 128,
			]);
			$table->addColumn('target_type', Types::STRING, [
				'notnull' => true,
				'length' => 32,
			]);
			$table->addColumn('target_id', Types::STRING, [
				'notnull' => false,
				'length' => 255,
			]);
			$table->addColumn('target_label', Types::STRING, [
				'notnull' => true,
				'length' => 255,
			]);
			$table->addColumn('hotkey', Types::STRING, [
				'notnull' => false,
				'length' => 16,
			]);
			$table->addColumn('action_status', Types::STRING, [
				'notnull' => true,
				'length' => 32,
				'default' => 'planned',
			]);
			$table->addColumn('created_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('updated_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['job_id', 'created_at'], 'ifl_asg_job_created');
			$table->addIndex(['user_id', 'created_at'], 'ifl_asg_user_created');
			$table->addIndex(['action_status'], 'ifl_asg_status');
		}

		if (!$schema->hasTable('imageflow_queue')) {
			$table = $schema->createTable('imageflow_queue');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('job_id', Types::BIGINT, [
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('assignment_id', Types::BIGINT, [
				'notnull' => false,
				'length' => 20,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('operation_type', Types::STRING, [
				'notnull' => true,
				'length' => 32,
			]);
			$table->addColumn('source_path', Types::STRING, [
				'notnull' => true,
				'length' => 1024,
			]);
			$table->addColumn('target_path', Types::STRING, [
				'notnull' => false,
				'length' => 1024,
			]);
			$table->addColumn('target_album_id', Types::STRING, [
				'notnull' => false,
				'length' => 255,
			]);
			$table->addColumn('status', Types::STRING, [
				'notnull' => true,
				'length' => 32,
				'default' => 'planned',
			]);
			$table->addColumn('safe_mode', Types::BOOLEAN, [
				'notnull' => true,
				'default' => true,
			]);
			$table->addColumn('source_checksum', Types::STRING, [
				'notnull' => false,
				'length' => 128,
			]);
			$table->addColumn('target_checksum', Types::STRING, [
				'notnull' => false,
				'length' => 128,
			]);
			$table->addColumn('attempts', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('last_error', Types::TEXT, [
				'notnull' => false,
			]);
			$table->addColumn('created_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('updated_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('executed_at', Types::BIGINT, [
				'notnull' => false,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['job_id', 'status'], 'ifl_queue_job_status');
			$table->addIndex(['user_id', 'created_at'], 'ifl_queue_user_created');
			$table->addIndex(['status', 'created_at'], 'ifl_queue_due');
		}

		if (!$schema->hasTable('imageflow_favorites')) {
			$table = $schema->createTable('imageflow_favorites');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('target_mode', Types::STRING, [
				'notnull' => true,
				'length' => 32,
			]);
			$table->addColumn('target_id', Types::STRING, [
				'notnull' => false,
				'length' => 255,
			]);
			$table->addColumn('target_label', Types::STRING, [
				'notnull' => true,
				'length' => 255,
			]);
			$table->addColumn('target_path', Types::STRING, [
				'notnull' => false,
				'length' => 1024,
			]);
			$table->addColumn('hotkey', Types::STRING, [
				'notnull' => false,
				'length' => 16,
			]);
			$table->addColumn('sort_position', Types::INTEGER, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->addColumn('created_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->addColumn('updated_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['user_id', 'target_mode'], 'ifl_fav_user_mode');
			$table->addIndex(['user_id', 'sort_position'], 'ifl_fav_user_sort');
		}

		if (!$schema->hasTable('imageflow_logs')) {
			$table = $schema->createTable('imageflow_logs');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 20,
			]);
			$table->addColumn('level', Types::STRING, [
				'notnull' => true,
				'length' => 16,
			]);
			$table->addColumn('event', Types::STRING, [
				'notnull' => true,
				'length' => 96,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => false,
				'length' => 64,
			]);
			$table->addColumn('job_id', Types::BIGINT, [
				'notnull' => false,
				'length' => 20,
			]);
			$table->addColumn('message', Types::STRING, [
				'notnull' => true,
				'length' => 512,
				'default' => '',
			]);
			$table->addColumn('context_json', Types::TEXT, [
				'notnull' => false,
			]);
			$table->addColumn('created_at', Types::BIGINT, [
				'notnull' => true,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['created_at'], 'ifl_log_created');
			$table->addIndex(['level', 'created_at'], 'ifl_log_level_created');
			$table->addIndex(['user_id', 'created_at'], 'ifl_log_user_created');
			$table->addIndex(['job_id', 'created_at'], 'ifl_log_job_created');
			$table->addIndex(['event'], 'ifl_log_event');
		}

		return $schema;
	}
}
