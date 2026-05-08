# ImageFlow Self-Test

Use this checklist after a deployed update. It is written for the production server with real file operations disabled.

## Entry Point

- App URL: `https://chaosnet.me/apps/imageflow/`
- Test account: `albentest`
- Screenshot folder: `/home/cloud/ImageFlow-work/imageflow/docs/screenshots/`
- Screenshot index: `/home/cloud/ImageFlow-work/imageflow/docs/SCREENSHOTS.md`

Do not store credentials in files, traces, screenshots or shell history.

## Safety Check

Before testing, confirm the dashboard shows:

- `Geschützter Testbetrieb`,
- `Dateiänderungen gesperrt`,
- `Automatik aus`.

The same state can be verified in the shell:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow real_execution_enabled
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow background_processing_enabled
```

Expected output for both commands is `0`.

## Manual Round Check

1. Open ImageFlow and create a round from a harmless folder owned by `albentest`.
2. Open the round with `Weitermachen`, `Neu anfangen` and `Offene Bilder`.
3. Use ArrowLeft and ArrowRight in the filmstrip.
4. In a larger folder, hold ArrowRight near the end of the visible strip and confirm that the next page appears without a visible pause.
5. Use hotkeys `1`, `2`, `3`, `0` and Space.
6. Add and remove one quick target.
7. Open `Ablage ansehen`.
8. Confirm that file operations are locked and `Jetzt ablegen` is disabled or blocked.
9. Open `Protokoll` and confirm that recent sorting and queue events appear.
10. Discard the test round from the overview.

No source files, target files or albums should be changed while both server flags are `0`.
