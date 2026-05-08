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

The app stores rounds, assignments, queue rows, quick targets and logs. The Ablage preview validates planned operations before queueing.

Real execution code exists for album membership, copy and move operations, but it is disabled by default. Queued rows wait safely unless real execution is explicitly enabled and the user starts a manual batch or server-side background processing is enabled.

To enable the real execution path for a controlled test window:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow real_execution_enabled --value=1
```

To disable it again:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow real_execution_enabled --value=0
```

Background processing is also off by default. Enable it only for a controlled window after real execution has been reviewed:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_processing_enabled --value=1
```

Disable it again:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_processing_enabled --value=0
```

Background processing also has a quiet-server gate. By default, cron work only runs while the one-minute server load is at or below `2.0`:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_low_load_only --value=1
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_max_load_1m --value=2.0
```

Optional quiet hours can further restrict cron work to a server-local time window:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_quiet_hours_enabled --value=1
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_quiet_hours_start --value=22:00
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_quiet_hours_end --value=06:00
```

Only enable real execution after a fresh backup and only with isolated test folders/albums. Current execution safeguards:

- exact dry-run plans before queueing,
- Safe Mode SHA-256 validation for copy/move,
- no overwrite of existing target files,
- idempotent duplicate skip for matching copy targets and existing album memberships,
- move operations never delete the source when a different target file already exists,
- per-item queue status, attempts, checksums, error text and debug logs.
- automatic cron processing requires `real_execution_enabled=1`, `background_processing_enabled=1`, a passing quiet-server gate, and only picks queued rounds whose `autoProcess` option is enabled.
