# Sicherheitsmodell Vorlage

Diese Datei soll pro neuer App kopiert und konkret ausgefuellt werden.

## Schutzgueter

- Dateien der Benutzer
- App-eigene Datenbanktabellen
- Admin-Einstellungen
- Hintergrundjobs
- Diagnose-Logs
- Export-/Temp-Dateien
- Zugangsdaten und Tokens

## Rollen

| Rolle | Rechte |
| --- | --- |
| Benutzer | Eigene Einstellungen, eigene Vorschau, eigene App-Daten |
| Administrator | Globale Einstellungen, Diagnose, Lastlimits |
| Hintergrundjob | Serverinterne Verarbeitung innerhalb gespeicherter Limits |

## API-Regeln

- Keine `NoCSRFRequired` fuer normale mutierende APIs.
- Admin-APIs pruefen Admin-Rechte.
- User-APIs verwenden den angemeldeten Benutzer, nicht frei uebergebene User-IDs.
- Eingaben serverseitig validieren.
- Fehler strukturiert, aber ohne Secrets ausgeben.

## Pfadregeln

- Pfade normalisieren.
- `..`, NUL, Kontrollzeichen und leere Segmente blockieren.
- Maximale Pfadlaenge und Segmentanzahl begrenzen.
- Keine direkten lokalen Filesystempfade von Benutzern akzeptieren.
- Nextcloud Storage APIs verwenden.

## Schreib- und Loeschregeln

- Vorschau/Dry-Run vor Schreibaktion.
- Server-seitig gespeicherter oder reproduzierbarer Fingerprint.
- Fingerprint-Ablaufzeit.
- Loeschungen nur fuer eindeutig von der App verwaltete Objekte.
- Exakte Textbestaetigung fuer gefaehrliche Aktionen.

## Diagnose und Logs

- Secrets vor Speicherung redigieren.
- Log-Kontext begrenzen.
- CSV gegen Spreadsheet-Formel-Injection haerten.
- Retention/Pruning implementieren.
- Debug-Modus steuerbar machen.

## Angriffsszenarien

| Szenario | Gegenmassnahme |
| --- | --- |
| CSRF auf Schreibroute | CSRF-Token und Nextcloud Requesttoken |
| Fremder Benutzerzugriff | User-ID aus Session, serverseitige Ownership-Pruefung |
| Path Traversal | Normalisierung und harte Pfadvalidierung |
| Massenlast | Admin-Limits, Debounce, Queue, Chunking |
| Gefaehrliche Loeschung | Dry-Run, Fingerprint, exakte Bestaetigung |
| Datenleck in Logs | Redaction, Kontextlimit, CSV-Haertung |
| Hintergrundjob haengt | Locks, stale-lock recovery, Health-Check |
