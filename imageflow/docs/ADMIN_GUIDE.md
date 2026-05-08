# ImageFlow Admin Guide

## Installation Status

ImageFlow is in bootstrap development. Do not deploy it to a productive Nextcloud instance without a controlled backup and rollback window.

Use `docs/DEPLOYMENT_RUNBOOK.md` and `scripts/production-update.sh` for controlled preflight, backup, deploy and file-level rollback.

## Live Test Rules

- Use only the dedicated test user `albentest`.
- Do not use real user accounts.
- Use isolated test folders and test albums.
- Backup before every live test.
- Verify `occ status` before and after tests.
- Check `nextcloud.log` after every test.

## Current Write Behavior

The app stores jobs, assignments, queue rows, favorites and logs. The Worklist preview validates planned operations before queueing.

Real execution code exists for album membership, copy and move operations, but it is disabled by default. Without explicit server-side enablement, queued rows are marked `blocked` by the execution guard and logged.

To enable the real execution path for a controlled test window:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow real_execution_enabled --value=1
```

To disable it again:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow real_execution_enabled --value=0
```

Only enable real execution after a fresh backup and only with isolated test folders/albums. Current execution safeguards:

- exact dry-run plans before queueing,
- Safe Mode SHA-256 validation for copy/move,
- no overwrite of existing target files,
- idempotent duplicate skip for matching copy targets and existing album memberships,
- move operations never delete the source when a different target file already exists,
- per-item queue status, attempts, checksums, error text and debug logs.
