# ImageFlow User Guide

## Flows

Open ImageFlow from the Nextcloud navigation and start a Flow:

- check the dashboard safety status before working on a productive server,
- choose a source folder with the folder picker,
- choose the target mode,
- choose a target folder with the folder picker when using copy or move,
- keep safe mode enabled,
- choose whether the Flow may be processed automatically during quiet server phases,
- choose the image buffer mode for large folders,
- start sorting.

Target modes:

- `Nextcloud-Album zuordnen`
- `In Ordner verschieben`
- `In Ordner kopieren`

Sorting decisions are saved immediately, but file changes are not executed until the Flow is explicitly queued from the Flow dashboard.

Flows that have not executed file operations can be discarded from the dashboard. Discarding removes the Flow, its planned assignments and its queued operations; it does not touch source files, target folders or albums.

Open a Flow with `Fortsetzen`, `Von vorne`, or `Offen`:

- `Fortsetzen` starts at the last saved image position,
- `Von vorne` starts at the first image in the source folder,
- `Offen` starts at the first image without a saved sort or skip decision.

## Sorting

The sorting page is structured for fast repeated decisions:

- left: quick targets with hotkeys,
- center: current image,
- right: all available albums or folders,
- bottom: next images.

Targets from the right rail can be added to quick targets with `+`. Quick targets can be dragged into the desired order; positions `1-9` define the number hotkeys. The `Weiter` entry stays fixed on `0`.

In copy and move Flows, the target rail can browse folders. The main folder row assigns the current image to that folder, while the arrow button opens a child folder.

Hotkeys:

- `1-9`: quick targets,
- `0`: next image without sorting,
- `Space`: next image without sorting,
- `ArrowLeft` / `ArrowRight`: move through the image band.

The Flow bar shows overall progress, the current decision streak, this session's collected decisions and the current pace. Each saved decision gives immediate visual feedback without changing files yet.

## Execution

Use `Ablage pruefen` on the Flow dashboard to open the safe preview first. The preview checks planned operations, missing sources or targets, possible duplicates and safe-mode readiness.

The preview shows whether file operations are currently locked or active on the server. In the default configuration, real file writes are locked and queued work waits safely. If the administrator enables real writes, `Jetzt verarbeiten` runs a small manual batch. If both real writes and server-side background processing are enabled, and the Flow is marked for automatic processing, the cron worker can process queued work later.

The dashboard also shows the current safety status. `Sicherer Testbetrieb` means real file operations and cron processing are locked on the server.

When an administrator deliberately enables real execution for a controlled test window, ImageFlow processes the queued worklist in small background batches. Safe Mode verifies copy/move operations with checksums, existing album memberships or identical copy targets are skipped as already done, and conflicting target files are not overwritten.

## Protocol

The `Protokoll` tab shows debug, info, warning and error events for the current user. It is meant for tracing sorting decisions, queue state, background processing, duplicate detection and safety checks without exposing passwords or tokens.
