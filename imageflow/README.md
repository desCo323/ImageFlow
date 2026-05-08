# ImageFlow

ImageFlow is a Nextcloud app for fast, controlled sorting of large image folders.

Current status: bootstrap development. The app is installable as a Nextcloud 33 app skeleton, but real file writes are intentionally disabled. Sorting decisions are stored as assignments and queue items. Queue execution currently logs that destructive writes are disabled.

## Features In This Build

- Job dashboard with create, pause and queue controls.
- Sorting workspace with favorites, targets, image stage and filmstrip.
- Hotkey foundation for `1-9`, `0` and `Space`.
- Tables for jobs, assignments, queue items, favorites and logs.
- Folder and album target read APIs.
- Non-destructive background queue worker.
- Local self-check and static browser smoke tests.

## Local Checks

```bash
bash scripts/self-check.sh
npm run test:browser
```

## Safety

Do not deploy this app to a production Nextcloud instance without the documented backup and rollback process. Authenticated tests may only use the dedicated test user `albentest`; credentials must never be stored in this repository.
