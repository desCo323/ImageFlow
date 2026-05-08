# ImageFlow User Guide

## Jobs

Open ImageFlow from the Nextcloud navigation and create a sort job:

- choose a source folder,
- choose the target mode,
- keep safe mode enabled,
- start sorting.

Target modes:

- `Nextcloud-Album zuordnen`
- `In Ordner verschieben`
- `In Ordner kopieren`

Sorting decisions are saved immediately, but file changes are not executed until the job is explicitly queued from the job dashboard.

Jobs that have not executed file operations can be discarded from the dashboard. Discarding removes the job, its planned assignments and its queued operations; it does not touch source files, target folders or albums.

## Sorting

The sorting page is structured for fast repeated decisions:

- left: favorite targets with hotkeys,
- center: current image,
- right: all available albums or folders,
- bottom: next images.

Hotkeys:

- `1-9`: favorite targets,
- `0`: skip,
- `Space`: skip.

## Execution

Use the job dashboard to mark a job for execution. In the bootstrap version, execution is intentionally non-destructive and only records a log entry.
