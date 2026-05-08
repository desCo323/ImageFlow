# ImageFlow Architecture

## Scope

ImageFlow is a Nextcloud app for fast photo triage. The first version separates sorting decisions from destructive file writes:

- Users create sort jobs.
- The sorting view records assignments and skip decisions.
- Assignments create queue rows.
- Queue execution is only started from the main job dashboard.
- The bootstrap worker is non-destructive and logs that real writes are disabled.

## App Structure

- `appinfo/info.xml`: Nextcloud app metadata and navigation entry.
- `appinfo/routes.php`: Page and JSON API routes.
- `lib/Controller`: Page, job, sort, target, folder, log and health endpoints.
- `lib/Service`: Job logic, folder browsing, target reads, queue processing, path normalization and logging.
- `lib/Db`: Entities and mappers for jobs, assignments, queue, favorites and logs.
- `lib/Migration`: Database schema.
- `js/` and `css/`: No-build frontend assets.
- `scripts/self-check.sh`: Local validation.
- `tests/Browser`: Static Playwright smoke tests.

## Data Model

- `imageflow_jobs`: One user-owned sorting job.
- `imageflow_assignments`: Individual sort or skip decisions.
- `imageflow_queue`: Planned background operations.
- `imageflow_favorites`: User target favorites and hotkey order.
- `imageflow_logs`: Detailed debug and audit events without secrets.

## Safety Boundary

The current `QueueExecutionJob` does not copy, move, delete or write album membership. This is intentional. Real execution must be implemented behind:

- explicit job-level user action,
- dry-run preview,
- safe-mode checksum validation for copy/move,
- path normalization,
- ownership and permission checks,
- detailed logs,
- rollback-tested deployment.
