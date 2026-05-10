# ImageFlow Admin Guide

## Installation Status

ImageFlow v1 is designed to run conservatively on Nextcloud 33. Do not enable real file operations on a productive server without a controlled backup and rollback window.

Use `docs/DEPLOYMENT_RUNBOOK.md` and `scripts/production-update.sh` for controlled preflight, backup, deploy and file-level rollback.

## Live Test Rules

- Use only the dedicated test user `albentest`.
- Do not use real user accounts.
- Use isolated test folders and test albums.
- Backup before every live test.
- Verify `occ status` before and after tests.
- Check `nextcloud.log` after every test.
- Confirm the ImageFlow dashboard `Systemprüfung` shows locked file writes before running smoke tests.

## Operation Settings

Administrators configure ImageFlow under the regular Nextcloud administration area:

`Administration settings` -> `ImageFlow`

These settings are global app settings, not per-user preferences. They are stored in Nextcloud app config and affect all ImageFlow users. The page controls:

- `Echte Dateiänderungen erlauben`
- `Automatisch im Hintergrund ablegen`
- `Nur bei ruhigem Server laufen lassen`
- maximum one-minute server load
- optional quiet-hour start/end window

The shell equivalents are:

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

Background processing also has a quiet-server gate. Cron work uses normalized server usage: 100% means the full capacity of all CPU cores, not raw Linux load. The legacy raw load value is kept in diagnostics only.

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_low_load_only --value=1
sudo -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_max_load_percent --value=70
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

## Diagnosis Export

Every user can create a diagnosis export from the visible `Diagnose` action. The export contains:

- ImageFlow and Nextcloud version metadata,
- real-write/background settings,
- current background gate decision,
- job and queue counts for the current user,
- recent ImageFlow logs, including system cron events with `userId=null`.

Secrets are redacted before log storage. The export intentionally does not include Nextcloud config secrets, database passwords or user credentials.

## Real Write Test

The opt-in Playwright test `tests/Browser/real-execution-live.auth.spec.js` covers:

- manual copy with checksum-safe duplicate handling,
- manual move without source deletion on conflicts,
- album membership execution,
- queued automatic background execution through the registered Nextcloud background job,
- diagnosis export after real processing,
- cleanup of test jobs, test folders and test albums,
- forced reset of `real_execution_enabled=0` and `background_processing_enabled=0`.

Run it only after a fresh backup and only with `albentest`.
