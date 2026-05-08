# Produktionssicherheitsregeln

Diese Regeln gelten, wenn auf einem Server gearbeitet wird, der produktiv benutzt wird oder produktive Daten enthalten kann.

## Verboten ohne ausdrueckliche Freigabe

- `git reset --hard`
- `git checkout --` auf fremde Aenderungen
- Loeschen produktiver App-/Datenverzeichnisse ohne Backup
- Tests mit echten Benutzerkonten
- Speicherung von Tokens/Passwoertern in Dateien
- Direkte DB-Manipulation ohne Backup und Dokumentation
- Deaktivieren von CSRF fuer normale API-Routen
- Schwere Verarbeitung in Datei-Event-Hooks

## Backup vor Live-Test

Vor jedem Live-Test:

1. App-Verzeichnis sichern:

```bash
rsync -a --delete /var/www/nextcloud/apps/<app>/ "$BACKUP_DIR/app-before-test/"
```

2. Nextcloud-Status sichern:

```bash
sudo -u www-data php /var/www/nextcloud/occ status > "$BACKUP_DIR/occ-status-before.txt"
sudo -u www-data php /var/www/nextcloud/occ app:list > "$BACKUP_DIR/occ-app-list-before.txt"
```

3. Relevante Tabellen dumpen:

```bash
mysqldump --single-transaction --quick <db> <tables> | gzip -9 > "$BACKUP_DIR/db-before-test.sql.gz"
```

4. Restore-Prompt schreiben:

```text
Stelle <app> aus <backup>/app-before-test nach /var/www/nextcloud/apps/<app> wieder her,
setze Eigentümer www-data:www-data, pruefe danach occ status und stelle sicher,
dass maintenance false und needsDbUpgrade false sind. Falls DB-Testdaten zurueckgesetzt
werden muessen, importiere <backup>/db-before-test.sql.gz.
```

5. Pruefsummen:

```bash
sha256sum db-before-test.sql.gz RESTORE_PROMPT.txt occ-status-before.txt > SHA256SUMS
sha256sum -c SHA256SUMS
```

## Nachkontrolle nach Live-Test

Pflicht:

- `occ status`
- App-Version pruefen
- Testbenutzer-Daten pruefen
- Queue/Jobs/Cursor pruefen
- App-Logs auf Fehler/Warnungen pruefen
- `nextcloud.log` pruefen
- Testordner entfernen
- Export-/Temp-Ordner entfernen

## Rollback

Rollback ist einzuleiten, wenn:

- Nextcloud nach Deploy in Maintenance haengen bleibt,
- `needsDbUpgrade=true` bleibt,
- App nicht geladen wird,
- unerwartete Fehler in Nextcloud-Log auftreten,
- Testdaten nicht sauber entfernt werden koennen,
- produktive Funktionen beeintraechtigt sind.
