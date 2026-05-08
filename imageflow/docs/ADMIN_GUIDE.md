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

The app stores jobs, assignments, queue rows, favorites and logs. The Worklist preview validates planned operations before queueing. The background worker does not perform destructive writes yet; queued rows are marked `blocked` by the execution guard and logged.

Before enabling real writes, implement and verify:

- exact dry-run plans,
- checksum validation,
- conflict handling,
- permission checks,
- resumable queue execution,
- rollback documentation.
