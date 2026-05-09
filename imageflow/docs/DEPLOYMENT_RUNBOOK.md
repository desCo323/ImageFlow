# ImageFlow Deployment Runbook

## Current State

ImageFlow v1 is safe by default: the app may be deployed to the Nextcloud app directory, but real file operations stay disabled until an administrator explicitly enables them.

## Preflight

Run from the app directory:

```bash
cd /home/cloud/ImageFlow-work/imageflow
scripts/production-update.sh --preflight
```

The preflight checks:

- app metadata and package version,
- PHP/XML/JS syntax,
- route loading,
- shell syntax for deployment scripts,
- accidental GitHub token patterns,
- clean Git worktree unless `IMAGEFLOW_ALLOW_DIRTY=1` is set,
- Nextcloud `occ status`.

## Deploy Without Enabling

This copies the app but does not enable it:

```bash
cd /home/cloud/ImageFlow-work/imageflow
IMAGEFLOW_PRODUCTION_UPDATE=1 scripts/production-update.sh --deploy
```

The script creates a backup under `/home/cloud/imageflow-backups/` before touching the live app directory.
After file sync it reloads active `php*-fpm.service` units by default, so Nextcloud does not keep stale route or controller code in PHP runtime cache. Set `IMAGEFLOW_RELOAD_PHP_FPM=0` only when the deployment window explicitly handles PHP runtime reload another way.

## Deploy And Enable

This can run app migrations and must only be used inside a planned test window:

```bash
cd /home/cloud/ImageFlow-work/imageflow
IMAGEFLOW_PRODUCTION_UPDATE=1 IMAGEFLOW_ENABLE_APP=1 scripts/production-update.sh --deploy
```

Before running this:

- confirm the only test user is `albentest`,
- prepare isolated test folders,
- confirm the backup directory and restore prompt,
- ensure no real user data will be modified.

## Rollback

For file-level rollback:

```bash
cd /home/cloud/ImageFlow-work/imageflow
IMAGEFLOW_RESTORE=1 scripts/production-update.sh --restore /home/cloud/imageflow-backups/<backup-dir>
```

For database rollback, follow the generated `RESTORE_PROMPT.txt` in the backup directory. Only ImageFlow tables are in scope, usually `oc_imageflow_%` on this server.
The restore path also reloads active PHP-FPM services by default after replacing app files.

## Post-Test Checks

After every live test:

```bash
sudo -u www-data php /var/www/nextcloud/occ status
sudo -u www-data php /var/www/nextcloud/occ app:list | grep -A 20 imageflow || true
```

Also check `nextcloud.log` for new errors and clean up any isolated test folders used by `albentest`.

## Authenticated Browser Smoke

Authenticated tests are opt-in and must only use `albentest`:

```bash
cd /home/cloud/ImageFlow-work/imageflow
IMAGEFLOW_BASE_URL=https://chaosnet.me \
IMAGEFLOW_TEST_USER=albentest \
IMAGEFLOW_TEST_PASSWORD='<runtime-only>' \
npm run test:browser:auth
```

Do not store the password in files, traces, screenshots or shell profiles.

## Real Write Browser Test

Before running this test, create a backup. The test itself uses only isolated folders and albums named `ImageFlow V1 Real ...`, restores the safety flags, and deletes its own data.

```bash
cd /home/cloud/ImageFlow-work/imageflow
IMAGEFLOW_AUTH_TESTS=1 \
IMAGEFLOW_REAL_WRITE_TESTS=1 \
IMAGEFLOW_BASE_URL=https://chaosnet.me \
IMAGEFLOW_TEST_USER=albentest \
IMAGEFLOW_TEST_PASSWORD='<runtime-only>' \
npx playwright test tests/Browser/real-execution-live.auth.spec.js --workers=1 --trace=off --reporter=line
```

Mandatory post-test checks:

```bash
sudo -u www-data php /var/www/nextcloud/occ status
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow real_execution_enabled
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow background_processing_enabled
```

Expected app-config output is `0` for both flags.
