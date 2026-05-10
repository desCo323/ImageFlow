# ImageFlow Live Test Report - 2026-05-11

Test user: `albentest`

Backup before test:
`/home/cloud/imageflow-live-test-backups/live-100-20260511-003123`

Live browser artifacts:
`/home/cloud/ImageFlow-work/imageflow/test-results/live-100-series-20260511`

## Summary

- Result after fixes: 112/112 scenarios passed.
- Browser suites passed:
  - `tests/Browser/full-usercases-live.auth.spec.js`: 1 test, 62 named scenarios passed.
  - `tests/Browser/real-execution-live.auth.spec.js`: 1 test passed after fixing the loading race.
  - `tests/Browser/worklist-live.auth.spec.js`: 1 test passed.
  - `tests/Browser/target-create-live.auth.spec.js`: 2 tests passed.
  - `tests/Browser/static-ui.spec.js`: 29 tests passed after the fix.
- Additional live diagnostics checks passed:
  - Dashboard status line.
  - Review filing log.
  - Full admin diagnostics export.
  - Anonymized user and admin support exports.
  - 90-day log retention purge.

## Fixed During This Run

1. Admin settings loading race.
   - Finding: The admin settings form was interactive before server settings were fully loaded. A quick click on `Echte Dateiänderungen erlauben` could be overwritten by the async load response.
   - Fix: Operation inputs and the save button are disabled until real server settings are loaded.
   - Commit: `b4844bc disable admin settings while loading`
   - Verification: Static browser suite passed, then the real copy/move/album/background live suite passed.

## Scenario Results

| # | Scenario | Result |
|---:|---|---|
| 1 | Anmeldung mit dem erlaubten Testkonto funktioniert | Passed |
| 2 | Schutzstatus sperrt echte Dateiänderungen | Passed |
| 3 | Entwicklungsflächen sind im normalen Betrieb nicht sichtbar | Passed |
| 4 | Alte Testdaten werden vor dem Lauf entfernt | Passed |
| 5 | Testordner und Testbilder werden real über Nextcloud-Dateien vorbereitet | Passed |
| 6 | Flow-anlegen-Schaltfläche fokussiert das Formular | Passed |
| 7 | Kopiermodus zeigt den Zielordner | Passed |
| 8 | Bilderordner kann über den Ordnerdialog gewählt werden | Passed |
| 9 | Zielordner kann über den Ordnerdialog gewählt werden | Passed |
| 10 | Unterordner können für die Bildrunde eingeschaltet werden | Passed |
| 11 | Sicherer Modus bleibt eingeschaltet | Passed |
| 12 | Automatik kann vorgemerkt werden, ohne echte Ablage zu starten | Passed |
| 13 | Turbo-Vorschau und alphabetische Ziele werden gespeichert | Passed |
| 14 | Tastenbelegung kann auf Buchstaben umgestellt werden | Passed |
| 15 | Flow lässt sich speichern und direkt öffnen | Passed |
| 16 | Sortierkopf zeigt kompakte Flow-Informationen | Passed |
| 17 | Fortschritt startet in einer neuen Runde bei null | Passed |
| 18 | Filmstreifen zeigt nur Bilder ohne sichtbare Beschriftung | Passed |
| 19 | Genau ein Vorschaubild ist aktiv markiert | Passed |
| 20 | Pfeil rechts wechselt ruckfrei zum nächsten Bild | Passed |
| 21 | Pfeil links kehrt zum vorherigen Bild zurück | Passed |
| 22 | Klick auf eine Miniatur setzt das Hauptbild | Passed |
| 23 | Große Bildmenge hält den Puffer begrenzt | Passed |
| 24 | Nächste Vorschauseite kann per Filmstreifen-Taste geöffnet werden | Passed |
| 25 | Vorherige Vorschauseite kann wieder geöffnet werden | Passed |
| 26 | Zielsuche findet einen vorhandenen Ordner | Passed |
| 27 | Zielsuche lässt sich leeren | Passed |
| 28 | Leere Zielsuche zeigt eine verständliche Meldung | Passed |
| 29 | Ordner-anlegen meldet fehlenden Namen sauber | Passed |
| 30 | Ordner-anlegen legt den Ordner real an und schließt das Feld | Passed |
| 31 | Neu angelegter Ordner bleibt über Suche auffindbar | Passed |
| 32 | Neu angelegter Ordner existiert auch in der Ziel-API | Passed |
| 33 | Schnellziel kann aus einem Zielordner angelegt werden | Passed |
| 34 | Doppeltes Schnellziel wird erkannt | Passed |
| 35 | Schnellziel kann entfernt werden | Passed |
| 36 | Schnellziel für bestehenden Ordner kann angelegt werden | Passed |
| 37 | Klick auf Schnellziel merkt eine Ablage vor und geht weiter | Passed |
| 38 | Rückgängig nimmt die letzte Entscheidung zurück | Passed |
| 39 | Direkter Klick auf Zielordner merkt eine Ablage vor | Passed |
| 40 | Leertaste überspringt das aktuelle Bild | Passed |
| 41 | Taste 0 überspringt ebenfalls | Passed |
| 42 | Strg+Z funktioniert nach Tastaturentscheidung | Passed |
| 43 | Von vorn ansehen setzt den sichtbaren Fortschritt auf 0 | Passed |
| 44 | Offene Bilder kann aus der Kopfzeile gestartet werden | Passed |
| 45 | Zurück führt in die Flow-Übersicht | Passed |
| 46 | Flow kann pausiert werden | Passed |
| 47 | Pausierter Flow kann fortgesetzt werden | Passed |
| 48 | Bearbeiten kann abgebrochen werden | Passed |
| 49 | Bearbeiten kann den Namen ändern | Passed |
| 50 | Flow kann dupliziert werden | Passed |
| 51 | Duplizierter Flow kann verworfen werden | Passed |
| 52 | Ablageprüfung öffnet ohne echte Dateiänderungen | Passed |
| 53 | Ablagefilter Auffälligkeiten funktioniert | Passed |
| 54 | Ablagefilter Bereit funktioniert | Passed |
| 55 | Ein Ablagepunkt kann entfernt werden | Passed |
| 56 | Ablage kann nur vorgemerkt werden | Passed |
| 57 | Jetzt ausführen bleibt ohne Realmodus gesperrt | Passed |
| 58 | Mobile Ansicht ordnet Foto, Ziele und Fußleiste sinnvoll an | Passed |
| 59 | Desktop-Ansicht gibt dem Hauptbild stabil Platz | Passed |
| 60 | Screenshots dokumentieren Hauptmenü, Sortierseite und Mobilansicht | Passed |
| 61 | Flow kann nach dem Test verworfen werden | Passed |
| 62 | Testdaten werden nach dem Lauf gelöscht | Passed |
| 63 | Worklist-Live-Test startet mit Login und Schutzstatusprüfung | Passed |
| 64 | Worklist-Live-Test entfernt alte Smoke-Flows | Passed |
| 65 | Worklist-Live-Test erstellt einen Kopier-Flow aus `/Photos` | Passed |
| 66 | Worklist-Live-Test findet ein echtes lesbares Bild in `/Photos` | Passed |
| 67 | Worklist-Live-Test speichert eine Ablageentscheidung | Passed |
| 68 | Worklist-Live-Test erzeugt eine fehlerfreie Dry-Run-Vorschau | Passed |
| 69 | Worklist-Live-Test öffnet `Ablage prüfen` im Browser | Passed |
| 70 | Worklist-Live-Test zeigt gesperrte Dateiänderungen verständlich an | Passed |
| 71 | Worklist-Live-Test merkt Ablage für später vor | Passed |
| 72 | Worklist-Live-Test blockiert `Jetzt ausführen` ohne Realmodus | Passed |
| 73 | Zielanlage-Live-Test öffnet einen echten Kopier-Flow | Passed |
| 74 | Zielanlage-Live-Test öffnet das Ordner-anlegen-Feld | Passed |
| 75 | Zielanlage-Live-Test legt einen Zielordner real an | Passed |
| 76 | Zielanlage-Live-Test schließt das Eingabefeld nach Erfolg | Passed |
| 77 | Zielanlage-Live-Test zeigt den neuen Zielordner sofort an | Passed |
| 78 | Zielanlage-Live-Test findet den neuen Zielordner per Suche | Passed |
| 79 | Zielanlage-Live-Test bestätigt den neuen Zielordner über die Ziel-API | Passed |
| 80 | Fehlender-Zielordner-Test fällt verständlich auf `/Photos` zurück | Passed |
| 81 | Fehlender-Zielordner-Test erlaubt danach neue Zielordneranlage | Passed |
| 82 | Real-Write-Test meldet sich mit `albentest` an | Passed |
| 83 | Real-Write-Test prüft Adminrechte für Betriebseinstellungen | Passed |
| 84 | Real-Write-Test bereinigt alte isolierte Testdaten | Passed |
| 85 | Real-Write-Test bereitet Copy/Move/Album/Cron-Quellen per DAV vor | Passed |
| 86 | Real-Write-Test schaltet echte Dateiänderungen über das Admin-UI frei | Passed |
| 87 | Real-Write-Test erstellt einen Kopier-Flow | Passed |
| 88 | Real-Write-Test merkt eine Kopierentscheidung vor | Passed |
| 89 | Real-Write-Test gibt die Kopierablage im Review frei | Passed |
| 90 | Real-Write-Test führt die Kopierablage manuell aus | Passed |
| 91 | Real-Write-Test bestätigt: Kopierquelle bleibt erhalten | Passed |
| 92 | Real-Write-Test bestätigt: Kopierziel existiert | Passed |
| 93 | Real-Write-Test erstellt einen Verschiebe-Flow | Passed |
| 94 | Real-Write-Test merkt eine Verschiebeentscheidung vor | Passed |
| 95 | Real-Write-Test führt die Verschiebeablage manuell aus | Passed |
| 96 | Real-Write-Test bestätigt: Verschiebequelle ist entfernt | Passed |
| 97 | Real-Write-Test bestätigt: Verschiebeziel existiert | Passed |
| 98 | Real-Write-Test erstellt ein Albumziel | Passed |
| 99 | Real-Write-Test erstellt einen Album-Flow | Passed |
| 100 | Real-Write-Test fügt ein Bild real dem Album hinzu | Passed |
| 101 | Real-Write-Test bestätigt den Album-Eintrag in der Datenbank | Passed |
| 102 | Real-Write-Test erstellt und queued einen Cron-Flow | Passed |
| 103 | Real-Write-Test aktiviert Hintergrundverarbeitung kontrolliert | Passed |
| 104 | Real-Write-Test führt den ImageFlow-Backgroundjob gezielt aus | Passed |
| 105 | Real-Write-Test bestätigt: Cron-Zielbild existiert | Passed |
| 106 | Real-Write-Test bestätigt manuelle und Hintergrund-Logs | Passed |
| 107 | Real-Write-Test bestätigt Diagnoseexport mit Logs | Passed |
| 108 | Dashboard-Diagnosetest bestätigt letzte Statuszeile unter Flows | Passed |
| 109 | Dashboard-Diagnosetest bestätigt `Ablage-Protokoll` im Review | Passed |
| 110 | Supportexport-Test bestätigt anonymisierte Review-Logs ohne direkte Benutzer-/Pfadlecks | Passed |
| 111 | Admin-Export-Test bestätigt globalen Voll-Logexport | Passed |
| 112 | Retention-Test bestätigt automatische Löschung von Logs älter als 90 Tage | Passed |

## Commands

```bash
npm run check
npx playwright test tests/Browser/static-ui.spec.js --trace=off --reporter=line
IMAGEFLOW_AUTH_TESTS=1 IMAGEFLOW_BASE_URL=https://chaosnet.me IMAGEFLOW_TEST_USER=albentest IMAGEFLOW_TEST_PASSWORD='***' IMAGEFLOW_SCREENSHOT_DIR=/home/cloud/ImageFlow-work/imageflow/test-results/live-100-series-20260511 npx playwright test tests/Browser/full-usercases-live.auth.spec.js --trace=retain-on-failure --reporter=line
IMAGEFLOW_AUTH_TESTS=1 IMAGEFLOW_REAL_WRITE_TESTS=1 IMAGEFLOW_BASE_URL=https://chaosnet.me IMAGEFLOW_TEST_USER=albentest IMAGEFLOW_TEST_PASSWORD='***' npx playwright test tests/Browser/real-execution-live.auth.spec.js --trace=retain-on-failure --reporter=line
IMAGEFLOW_AUTH_TESTS=1 IMAGEFLOW_BASE_URL=https://chaosnet.me IMAGEFLOW_TEST_USER=albentest IMAGEFLOW_TEST_PASSWORD='***' npx playwright test tests/Browser/worklist-live.auth.spec.js tests/Browser/target-create-live.auth.spec.js --trace=retain-on-failure --reporter=line
```

