# Changelog

## Unreleased

- Add production deploy PHP-FPM reload to avoid stale Nextcloud route/controller cache after file sync.
- Document the next high-speed filmstrip, preload buffer, idempotent worklist, and cron execution architecture block.
- Add keyboard filmstrip navigation, bounded image preload planning, active thumbnail selection, and duplicate queue protection for planned sort operations.
- Add Nextcloud preview and thumbnail URLs to image samples and render real images in the sorting stage and filmstrip.

## 0.1.0 - 2026-05-08

- Initial installable ImageFlow skeleton.
- Job dashboard and sort workspace UI foundation.
- Safe database schema for jobs, assignments, queue items, favorites, and debug logs.
- Background queue worker stub that does not perform file writes yet.
