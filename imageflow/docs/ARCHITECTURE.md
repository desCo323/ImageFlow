# ImageFlow Architecture

## Scope

ImageFlow is a Nextcloud app for fast photo triage. The first version separates sorting decisions from destructive file writes:

- Users create sorting rounds.
- Users can discard rounds until execution has started or operations were already executed.
- The sorting view records assignments and skip decisions.
- Assignments create queue rows.
- Queue execution is only started from the main overview.
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
- `imageflow_favorites`: User target favorites and hotkey order; positions `1-9` map to number, letter or custom hotkeys while skip remains fixed on `0`.
- `imageflow_logs`: Detailed debug and audit events without secrets.

Folder selection uses the same normalized user-relative path model as sorting. The browser API lists only folders reachable through the current user's Nextcloud filesystem view; it does not create, copy, move or delete files.

Target creation is explicit user action from the sorting rail. Album creation writes a Photos album row for the current user; folder creation uses the current user's filesystem view and returns the refreshed folder listing.

Target search is read-only. Album search runs through the target API query parameter, and folder search filters the currently opened folder before the result is returned to the rail.

## Safety Boundary

The current `QueueExecutionJob` blocks queued operations unless `imageflow` app config `real_execution_enabled` is set to `1`. This default protects production installs during development.

When enabled, the worker executes small batches and uses these rules:

- album mode inserts only missing album memberships and treats existing memberships as idempotent success,
- copy mode never overwrites existing target files; Safe Mode can treat same-checksum targets as already done,
- move mode never overwrites existing target files and does not delete the source if a conflicting target exists,
- Safe Mode computes SHA-256 before and after copy/move and fails the queue item on mismatch,
- every item records status, attempts, checksums, error text and an audit log entry.

Real execution remains gated by explicit job-level user action, dry-run preview, normalized user-relative paths, current-user filesystem access and rollback-tested deployment.

## Performance And Execution Block

The sorting workspace now uses the high-speed filmstrip and worklist execution model:

- ArrowLeft and ArrowRight move through the filmstrip immediately; number hotkeys still assign the currently focused photo.
- The frontend keeps a bounded image buffer around the current position. `light`, `balanced` and `turbo` preload modes control the neighbor radius while the global image buffer still has a memory cap and releases stale image loaders when they leave the buffer.
- Large folders are read through filecache-backed offset cursor pages. The browser only receives the current page plus preview URLs, not the entire folder.
- A job can resume at its last saved cursor/index, restart from the beginning, or jump to the first image without a recorded sort/skip decision.
- A planned decision can be undone or removed from the worklist until the linked queue item starts executing.
- Animations should use `transform` and `opacity` only, respect `prefers-reduced-motion`, and avoid layout shifts during rapid key navigation.
- Queue creation must be idempotent. Album and copy operations need a stable operation key and a pre-execution duplicate check so repeated processing runs do not create duplicate album memberships or duplicate copied files.
- The dashboard remains the execution gate: users can process the current worklist now, leave it queued for later, or allow a cron-controlled low-load execution window.
- Background execution is server-gated by `background_processing_enabled=1` and only processes queued rounds with `autoProcess=true`.
- Background execution also checks a quiet-server gate before touching queued work: one-minute load must be under `background_max_load_1m` when `background_low_load_only=1`, and optional quiet hours can restrict processing to a server-local time window.
- Background execution processes small batches with detailed logs, retry metadata, and explicit idempotent outcomes when the desired target state already exists.
- The `Protokoll` tab exposes per-user debug events from `imageflow_logs` so sorting, queue and safety behavior can be verified without shell access.
