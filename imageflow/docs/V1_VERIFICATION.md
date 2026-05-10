# ImageFlow V1 Verification

Date: 2026-05-10

This document records the v1 production verification performed on the deployed Nextcloud instance. Credentials are intentionally omitted.

## Safety Baseline

- Full Nextcloud preflight backup: `/home/cloud/imageflow-backups/v1-preflight-20260510-012923`
- Deploy rollback backup: `/home/cloud/imageflow-backups/imageflow-pre-update-1.0.0-20260510-020326`
- Database backup integrity: `gzip -t` passed for `nextcloud-db-before.sql.gz`
- Nextcloud status after deploy: maintenance mode off, database upgrade not required
- Final ImageFlow safety flags:
  - `real_execution_enabled=0`
  - `background_processing_enabled=0`
  - `background_low_load_only=1`
  - `background_max_load_1m=2`

## Automated Browser Coverage

Executed from `/home/cloud/ImageFlow-work/imageflow`:

```bash
npm run check
npx playwright test tests/Browser/static-ui.spec.js --trace=off --reporter=line
IMAGEFLOW_BASE_URL=https://chaosnet.me IMAGEFLOW_TEST_USER=albentest IMAGEFLOW_TEST_PASSWORD='<runtime-only>' npm run test:browser:auth
IMAGEFLOW_AUTH_TESTS=1 IMAGEFLOW_REAL_WRITE_TESTS=1 IMAGEFLOW_BASE_URL=https://chaosnet.me IMAGEFLOW_TEST_USER=albentest IMAGEFLOW_TEST_PASSWORD='<runtime-only>' npx playwright test tests/Browser/real-execution-live.auth.spec.js --workers=1 --trace=off --reporter=line
```

Results:

- Local self-check: passed
- Static browser UI suite: `24 passed`
- Authenticated live suite: `5 passed`, `1 skipped` as expected because real-write tests require the explicit real-write flag
- Opt-in real-write live suite: `1 passed`

The opt-in real-write suite covered:

- operation settings UI saving the real-write gate,
- checksum-safe copy,
- checksum-safe move,
- album membership execution,
- manual queue processing,
- background cron processing through the registered Nextcloud background job,
- diagnosis export after real processing,
- cleanup of ImageFlow V1 test jobs, folders and albums,
- forced reset of real-write and background flags.

## Live Screenshots

The latest live screenshots are committed under `docs/screenshots/` and indexed in `docs/SCREENSHOTS.md`:

- `35-v1-live-dashboard.png`
- `36-v1-live-sort-desktop.png`
- `37-v1-live-sort-mobile.png`
