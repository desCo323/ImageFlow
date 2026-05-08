# ImageFlow Test Backlog

Datum: 2026-05-08

## Lokal

- PHP-Syntaxcheck fuer alle App-Dateien.
- XML-Check fuer `appinfo/info.xml`.
- Routen-Check fuer `appinfo/routes.php`.
- Secret-Scan gegen bekannte Token-/Passwortmuster.
- Statischer Playwright-Smoke fuer Job-Dashboard und Sortieransicht.

## Vor erstem Deploy

- App-Verzeichnis-Backup vorbereiten.
- DB-Backup fuer ImageFlow-Tabellen vorbereiten.
- Restore-Prompt schreiben.
- `occ status` dokumentieren.

## Authentifizierte Tests

- Ausschliesslich Testbenutzer `albentest`.
- Testordner isoliert anlegen.
- Job mit Album-Modus anlegen.
- Job mit Kopiermodus anlegen.
- Job pausieren und fortsetzen.
- Sortierentscheidungen per Klick und Hotkey speichern.
- Ausfuehrung vormerken.
- Nachkontrolle: keine produktiven Daten veraendert.

## Noch nicht freigegeben

- Echtes Kopieren.
- Echtes Verschieben.
- Echte Album-Zuordnung.
- Loesch- oder Cleanup-Funktionen.
