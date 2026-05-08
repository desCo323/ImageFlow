# ImageFlow Deployment Runbook

## Current State

ImageFlow is still in bootstrap mode. The app may be copied to the Nextcloud app directory for controlled testing, but real file operations are disabled in the queue worker.

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

For database rollback, follow the generated `RESTORE_PROMPT.txt` in the backup directory. Only `imageflow_%` tables are in scope.

## Post-Test Checks

After every live test:

```bash
sudo -u www-data php /var/www/nextcloud/occ status
sudo -u www-data php /var/www/nextcloud/occ app:list | grep -A 20 imageflow || true
```

Also check `nextcloud.log` for new errors and clean up any isolated test folders used by `albentest`.
