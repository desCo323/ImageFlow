# Changelog

## Unreleased

- Add v1 admin operation settings in the browser for real-write and cron gates.
- Add user-visible JSON diagnosis export with redacted logs and background diagnostics.
- Add opt-in real-write live browser coverage for copy, move, album execution and cron processing.
- Bump app version to 1.0.0 and update v1 documentation.
- Add production deploy PHP-FPM reload to avoid stale Nextcloud route/controller cache after file sync.
- Document the next high-speed filmstrip, preload buffer, idempotent worklist, and cron execution architecture block.
- Add keyboard filmstrip navigation, bounded image preload planning, active thumbnail selection, and duplicate queue protection for planned sort operations.
- Add Nextcloud preview and thumbnail URLs to image samples and render real images in the sorting stage and filmstrip.
- Add filecache-backed image paging, page controls, and persisted sort position per job for large folders.
- Add sort start choices for resume, from beginning, and first open image.
- Add editable target favorites with add, remove, drag-and-drop reorder, and stable number hotkeys.
- Add folder picker UI for source/target job setup and browsable folder targets in copy/move sorting mode.
- Add worklist dry-run preview before execution queueing and guarded non-destructive execution blocking.
- Add guarded real execution engine behind `real_execution_enabled` for album, copy, and move operations with checksum validation and idempotent duplicate handling.
- Add Flow terminology, automatic processing opt-in, manual batch processing endpoint, preload mode controls, user-visible debug protocol, and final preview screenshots.
- Add large-folder filmstrip stabilization coverage and explicit stale image preload release.
- Add dashboard safety status and a deployed self-test checklist.
- Add direct target creation, custom quick-target hotkeys, undo for recent decisions, and removable planned worklist items.
- Add quiet-server background gate for automatic processing with server-load and optional time-window checks.
- Add fast target search for album and folder targets in the sorting rail.
- Add full-worklist validation summaries and compact filters to the Ablage preview.
- Add dashboard system diagnostics and guided self-test status.
- Add a visible Flow creation action, fixed-height sorting workspace, visible filmstrip footer, and quick target-create button.
- Pin the Flow filmstrip to the viewport bottom and duplicate target creation in the Flow header for narrow Nextcloud layouts.
- Make ImageFlow fill the Nextcloud content width and add mobile-first Flow ordering with compact navigation.
- Compact the Flow header and filmstrip so thumbnails are image-only framed tiles and the main photo keeps more vertical space.
- Move Flow progress into the header, remove the duplicate header target-create action, and rename restart wording to clarify that executed file operations are not rolled back.
- Add optional recursive source folders, recursive folder target search, immediate target list insertion after creating folders/albums, a denser dashboard, and unlabeled preloaded-image thumbnails.

## 0.1.0 - 2026-05-08

- Initial installable ImageFlow skeleton.
- Flow dashboard and sort workspace UI foundation.
- Safe database schema for jobs, assignments, queue items, favorites, and debug logs.
- Background queue worker stub that does not perform file writes yet.
