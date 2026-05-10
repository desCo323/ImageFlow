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

Administrators can also open `Administration settings` -> `ImageFlow`. The page must show the real-write and background switches, current background-gate status and the diagnosis export button.

## Manual Round Check

1. Open ImageFlow and create a round from a harmless folder owned by `albentest`.
2. Save it with `Flow speichern`, edit it with `Bearbeiten`, then create a duplicate with `Kopie`.
3. Open the round with `Weitermachen`, `Neu anfangen` and `Offene Bilder`.
4. Use ArrowLeft and ArrowRight in the filmstrip.
5. In a larger folder, hold ArrowRight near the end of the visible strip and confirm that the next page appears without a visible pause.
6. Use hotkeys `1`, `2`, `3`, `0` and Space, or `A-I` / custom keys when the round uses those hotkey modes.
7. Use `Rückgängig` before queue execution and confirm the image can be handled again.
8. Add and remove one quick target.
9. Open `Ablage prüfen`, remove one planned item, and confirm the count drops.
10. Confirm that file operations are locked and `Jetzt ausführen` is disabled or blocked.
11. Open `Protokoll` and confirm that recent sorting and queue events appear.
12. Use `Diagnose exportieren` and confirm a JSON file is offered.
13. Discard the test round from the overview.

No source files or target files should be changed while both server flags are `0`. Creating a new album or folder from the right rail is an immediate user-triggered change; test that only with a disposable name and clean it up afterwards.
