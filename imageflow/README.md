# ImageFlow

ImageFlow is a Nextcloud app for fast, controlled sorting of large image folders.

Current status: first functional preview. The app is installable as a Nextcloud 33 app and keeps real file writes disabled by default. Sorting decisions are stored as assignments and queue items first; manual or background processing must be explicitly enabled by an administrator.

## Features In This Build

- Round dashboard with save, edit, duplicate, pause, safe preview and processing controls.
- Sorting workspace with favorites, targets, image stage, filmstrip and playful progress feedback.
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
- User-visible debug protocol for sorting, queue and safety events.
- Local self-check and static browser smoke tests.

## Local Checks

```bash
bash scripts/self-check.sh
npm run test:browser
```

## Manual Safe Test

See `docs/SELF_TEST.md` for the deployed self-test checklist and screenshot locations.

## Safety

Do not deploy this app to a production Nextcloud instance without the documented backup and rollback process. Authenticated tests may only use the dedicated test user `albentest`; credentials must never be stored in this repository.
