# ImageFlow

ImageFlow is a Nextcloud app for fast, controlled sorting of large image folders.

Current status: v1 production candidate for Nextcloud 33. The app keeps real file writes disabled by default. Sorting decisions are stored as assignments and queue items first; manual or background processing must be explicitly enabled by an administrator in a controlled window.

## Features In This Build

- Flow dashboard with a prominent create action, save, edit, duplicate, pause, safe preview and processing controls.
- Responsive sorting workspace with stable image stage, visible filmstrip footer, quick target creation and playful progress feedback.
- Fast target search for albums and folder targets directly in the sorting rail.
- Fast hotkeys for `1-9`, `A-I`, custom quick-target keys, `0`, `Space`, undo and arrow-key filmstrip navigation.
- Bounded image preload modes for light, balanced and turbo sorting.
- Tables for jobs, assignments, queue items, favorites and logs.
- Folder and album target APIs with explicit user-triggered target creation.
- Undo for recent decisions and removable planned worklist items before execution.
- Full-worklist safety summaries with compact filters for large pending Ablagen.
- Dashboard system check with safety flags, queue diagnostics and guided self-test steps.
- Guarded manual and background queue processing with checksum-safe copy/move support behind server-side flags.
- Quiet-server background gate based on server load and optional processing windows.
- Admin operation page for real-write and cron gates.
- User-visible diagnosis export with app settings, queue counts, background gate state and redacted logs.
- Browser tests for static UI, authenticated live use cases and opt-in real write execution.

## Local Checks

```bash
bash scripts/self-check.sh
npm run test:browser
```

Authenticated live tests are opt-in and must use the dedicated test account:

```bash
IMAGEFLOW_BASE_URL=https://chaosnet.me \
IMAGEFLOW_TEST_USER=albentest \
IMAGEFLOW_TEST_PASSWORD='<runtime-only>' \
npm run test:browser:auth
```

Real file-write coverage is a separate opt-in test:

```bash
IMAGEFLOW_AUTH_TESTS=1 IMAGEFLOW_REAL_WRITE_TESTS=1 \
IMAGEFLOW_BASE_URL=https://chaosnet.me \
IMAGEFLOW_TEST_USER=albentest \
IMAGEFLOW_TEST_PASSWORD='<runtime-only>' \
npx playwright test tests/Browser/real-execution-live.auth.spec.js --workers=1 --trace=off --reporter=line
```

## Manual Safe Test

See `docs/SELF_TEST.md` for the deployed self-test checklist and screenshot locations.
See `docs/V1_VERIFICATION.md` for the latest v1 production verification, backup references and browser test matrix.

## Safety

Do not deploy this app to a production Nextcloud instance without the documented backup and rollback process. Authenticated tests may only use the dedicated test user `albentest`; credentials must never be stored in this repository. Before any real-write test, create a backup and verify that `real_execution_enabled=0` and `background_processing_enabled=0` again afterwards.
