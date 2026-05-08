# ImageFlow Architecture

## Scope

ImageFlow is a Nextcloud app for fast photo triage. The first version separates sorting decisions from destructive file writes:

- Users create sort jobs.
- Users can discard jobs until execution has started or operations were already executed.
- The sorting view records assignments and skip decisions.
- Assignments create queue rows.
- Queue execution is only started from the main job dashboard.
- The worker defaults to non-destructive guard mode. Real writes require the explicit app config flag `real_execution_enabled=1`.

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
- `imageflow_favorites`: User target favorites and hotkey order; positions `1-9` map to number hotkeys while skip remains fixed on `0`.
- `imageflow_logs`: Detailed debug and audit events without secrets.

Folder selection uses the same normalized user-relative path model as sorting. The browser API lists only folders reachable through the current user's Nextcloud filesystem view; it does not create, copy, move or delete files.

## Safety Boundary

The current `QueueExecutionJob` blocks queued operations unless `imageflow` app config `real_execution_enabled` is set to `1`. This default protects production installs during development.

When enabled, the worker executes small batches and uses these rules:

- album mode inserts only missing album memberships and treats existing memberships as idempotent success,
- copy mode never overwrites existing target files; Safe Mode can treat same-checksum targets as already done,
- move mode never overwrites existing target files and does not delete the source if a conflicting target exists,
- Safe Mode computes SHA-256 before and after copy/move and fails the queue item on mismatch,
- every item records status, attempts, checksums, error text and an audit log entry.

Real execution remains gated by explicit job-level user action, dry-run preview, normalized user-relative paths, current-user filesystem access and rollback-tested deployment.

## Next Performance Block

The next sorting workspace block is the high-speed filmstrip and worklist execution model:

- ArrowLeft and ArrowRight move through the filmstrip immediately; number hotkeys still assign the currently focused photo.
- The frontend keeps a bounded image buffer around the current position: decoded current image, several full-size neighbors, and a wider thumbnail window. Stale loads must be aborted, and memory must be released with an LRU-style cap.
- Large folders are read through filecache-backed offset cursor pages. The browser only receives the current page plus preview URLs, not the entire folder.
- A job can resume at its last saved cursor/index, restart from the beginning, or jump to the first image without a recorded sort/skip decision.
- Animations should use `transform` and `opacity` only, respect `prefers-reduced-motion`, and avoid layout shifts during rapid key navigation.
- Queue creation must be idempotent. Album and copy operations need a stable operation key and a pre-execution duplicate check so repeated processing runs do not create duplicate album memberships or duplicate copied files.
- The dashboard remains the execution gate: users can process the current worklist now, leave it queued for later, or allow a cron-controlled low-load execution window.
- Background execution processes small batches with detailed logs, retry metadata, and explicit idempotent outcomes when the desired target state already exists.
