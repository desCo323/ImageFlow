# ImageFlow User Guide

## Jobs

Open ImageFlow from the Nextcloud navigation and create a sort job:

- choose a source folder with the folder picker,
- choose the target mode,
- choose a target folder with the folder picker when using copy or move,
- keep safe mode enabled,
- start sorting.

Target modes:

- `Nextcloud-Album zuordnen`
- `In Ordner verschieben`
- `In Ordner kopieren`

Sorting decisions are saved immediately, but file changes are not executed until the job is explicitly queued from the job dashboard.

Jobs that have not executed file operations can be discarded from the dashboard. Discarding removes the job, its planned assignments and its queued operations; it does not touch source files, target folders or albums.

Open a job with `Fortsetzen`, `Von vorne`, or `Offen`:

- `Fortsetzen` starts at the last saved image position,
- `Von vorne` starts at the first image in the source folder,
- `Offen` starts at the first image without a saved sort or skip decision.

## Sorting

The sorting page is structured for fast repeated decisions:

- left: favorite targets with hotkeys,
- center: current image,
- right: all available albums or folders,
- bottom: next images.

Targets from the right rail can be added to favorites with `+`. Favorites can be dragged into the desired order; positions `1-9` define the number hotkeys. The skip entry stays fixed on `0`.

In copy and move jobs, the target rail can browse folders. The main folder row assigns the current image to that folder, while the arrow button opens a child folder.

Hotkeys:

- `1-9`: favorite targets,
- `0`: skip,
- `Space`: skip,
- `ArrowLeft` / `ArrowRight`: move through the filmstrip.

## Execution

Use `Ausfuehren` on the job dashboard to open the Worklist preview first. The preview checks planned operations, missing sources or targets, possible duplicates and safe-mode readiness.

The preview shows whether file operations are currently locked or active on the server. In the default development configuration, real file writes are locked. Queueing execution records the intent and the background worker marks due items as blocked by the execution guard.

When an administrator deliberately enables real execution for a controlled test window, ImageFlow processes the queued worklist in small background batches. Safe Mode verifies copy/move operations with checksums, existing album memberships or identical copy targets are skipped as already done, and conflicting target files are not overwritten.
