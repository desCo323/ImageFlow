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

- `Sicherer Testbetrieb`,
- `Dateioperationen gesperrt`,
- `Cron-Ablage aus`.

The same state can be verified in the shell:

```bash
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow real_execution_enabled
sudo -u www-data php /var/www/nextcloud/occ config:app:get imageflow background_processing_enabled
```

Expected output for both commands is `0`.

## Manual Flow Check

1. Open ImageFlow and create a Flow from a harmless folder owned by `albentest`.
2. Open the Flow with `Fortsetzen`, `Von vorne` and `Offen`.
3. Use ArrowLeft and ArrowRight in the filmstrip.
4. Use hotkeys `1`, `2`, `3`, `0` and Space.
5. Add and remove one quick target.
6. Open `Ablage pruefen`.
7. Confirm that file operations are locked and `Jetzt verarbeiten` is disabled or blocked.
8. Open `Protokoll` and confirm that recent sorting and queue events appear.
9. Discard the test Flow from the dashboard.

No source files, target files or albums should be changed while both server flags are `0`.
