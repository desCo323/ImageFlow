# ImageFlow User Guide

## Runden

Open ImageFlow from the Nextcloud navigation and start a sorting round:

- check `Schutzstatus` before working on a productive server,
- choose a `Bilderordner` with the folder picker,
- choose what should happen with matching images,
- choose an `Ablageordner` when using copy or move,
- keep safe mode enabled,
- choose whether the round may be processed automatically during quiet server phases,
- choose the image buffer mode for large folders,
- save the round with `Runde speichern`, or use `Speichern & sortieren` to open it immediately.
- edit a saved draft from the overview with `Bearbeiten`, or create a fresh copy with `Kopie`.

Target modes:

- `Zu einem Album hinzufügen`
- `In Ordner verschieben`
- `In Ordner kopieren`

Sorting decisions are saved immediately, but file changes are not executed until the round is explicitly queued from the overview.

Rounds that have not executed file operations can be discarded from the overview. Discarding removes the round, its planned assignments and its queued operations; it does not touch source files, target folders or albums.

Open a round with `Weitermachen`, `Neu anfangen`, or `Offene Bilder`:

- `Weitermachen` starts at the last saved image position,
- `Neu anfangen` starts at the first image in the source folder,
- `Offene Bilder` starts at the first image without a saved sort or skip decision.

## Sorting

The sorting page is structured for fast repeated decisions:

- left: quick targets with hotkeys,
- center: current image,
- right: all available albums or folders,
- bottom: next images.

Targets from the right rail can be added to quick targets with `+`. Quick targets can be dragged into the desired order; positions `1-9` define the number hotkeys. The `Überspringen` entry stays fixed on `0`.

In copy and move rounds, the target rail can browse folders. The main folder row assigns the current image to that folder, while the arrow button opens a child folder.

Hotkeys:

- `1-9`: quick targets,
- `0`: skip the current image,
- `Space`: skip the current image,
- `ArrowLeft` / `ArrowRight`: move through the image band.

The round bar shows overall progress, the current decision streak, this session's collected decisions and the current pace. Each saved decision gives immediate visual feedback without changing files yet.

For large folders, ImageFlow keeps the visible filmstrip small, preloads nearby images and warms the next image page before you reach the end of the current page. Arrow-key navigation should therefore stay smooth even when the source folder contains far more images than the visible strip.

## Execution

Use `Ablage prüfen` on the overview to open the safe preview first. The preview checks planned operations, missing sources or targets, possible duplicates and safe-mode readiness.

The preview shows whether file operations are currently locked or active on the server. In the default configuration, real file writes are locked and queued work waits safely. If the administrator enables real writes, `Jetzt ablegen` runs a small manual batch. If both real writes and server-side background processing are enabled, and the round is marked for automatic processing, the cron worker can process queued work later.

The overview also shows the current safety status. `Geschützter Testbetrieb` means real file operations and cron processing are locked on the server.

When an administrator deliberately enables real execution for a controlled test window, ImageFlow processes the queued worklist in small background batches. Safe Mode verifies copy/move operations with checksums, existing album memberships or identical copy targets are skipped as already done, and conflicting target files are not overwritten.

## Protocol

The `Protokoll` tab shows debug, info, warning and error events for the current user. It is meant for tracing sorting decisions, queue state, background processing, duplicate detection and safety checks without exposing passwords or tokens.
