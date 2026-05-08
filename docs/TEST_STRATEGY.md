# Teststrategie

## Testpyramide fuer Nextcloud-Apps

1. Syntax und Metadaten
2. Service-/Unit-Tests
3. App-Self-Check
4. Browser-Smoke ohne Login
5. Authentifizierte Browser-Tests mit Testbenutzer
6. Live-Smoke im Backup-Testfenster
7. Security-/Abuse-Tests
8. Nachkontrolle und Logauswertung

## Pflichtchecks vor Commit

```bash
php -l <php-dateien>
node --check <js-dateien>
git diff --check
npm run test:browser
bash scripts/self-check.sh
```

## Authentifizierte Browser-Tests

Regeln:

- Nur mit freigegebenem Testbenutzer.
- Zugangsdaten nur via Umgebungsvariablen.
- Keine Playwright-Traces/Videos mit Sessiondaten.
- Screenshots nur von App-Oberflaechen ohne sensible Daten.
- Nach jedem Test Reset/Cleanup.

Beispiel:

```bash
SAKURAALBUM_BASE_URL='https://example.org' \
SAKURAALBUM_TEST_USER='testuser' \
SAKURAALBUM_TEST_PASSWORD='***' \
npm run test:browser:auth
```

## Live-Test-Szenarien

Jede neue App sollte eigene Live-Smoke-Helfer bekommen:

- initialer Reset,
- Testdaten erzeugen,
- Einstellungen setzen,
- Vorschau/Dry-Run,
- Schreibjob oder Hintergrundjob,
- Ergebnis pruefen,
- Export/Download falls relevant,
- Reset,
- Cleanup,
- JSON-Summary ausgeben.

## Typische Szenarien

| Bereich | Szenario |
| --- | --- |
| Funktion | Erstellen, Aktualisieren, Verschieben, Loeschen |
| Rechte | User darf nur eigene Daten sehen |
| Admin | Admin-Routen nur fuer Admins |
| Pfade | Traversal, lange Pfade, Kontrollzeichen |
| Performance | Limits, Chunking, Wiederaufnahme |
| UI | Mobile Breite, Fokus, Kontrast, lange Texte |
| Diagnose | Fehlerlogs, CSV, Debug-Modus |
| Reset | Alle App-Daten des Testbenutzers sauber entfernen |

## Logauswertung

Nach Tests immer pruefen:

- App-eigene Logtabelle
- Health-/Diagnostic-Report
- CSV-Export
- `/var/www/nextcloud/data/nextcloud.log`

Erwartete Testwarnungen muessen dokumentiert werden. Unerwartete Warnungen sind Bugs oder Backlog-Eintraege.
