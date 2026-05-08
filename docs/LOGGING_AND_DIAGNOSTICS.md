# Logging und Diagnostik

## Ziel

Logs sollen so gut sein, dass eine zukuenftige Codex-Instanz Fehlerursachen selbst finden kann, ohne zuerst einen Menschen um Screenshots oder Vermutungen bitten zu muessen.

## Log-Level

| Level | Zweck |
| --- | --- |
| debug | Detaildaten fuer aktivierten Debug-Modus |
| info | normale wichtige Ereignisse |
| success | abgeschlossene erfolgreiche Operationen |
| warning | reparierbare oder erwartbar problematische Zustaende |
| error | fehlgeschlagene Operationen |

## Pflichtkontext

Jeder relevante Logeintrag sollte enthalten:

- Eventname
- User-ID, falls Benutzerkontext
- Run-ID oder Job-ID
- Status
- Dauer
- Limits
- Zaehler
- naechster Cursor
- Fehlercode
- redigierter Kontext

## Health Checks

Eine produktionsnahe App sollte Health-Befunde erzeugen fuer:

- Queue offen/fehlgeschlagen
- stale Locks
- haengende Runs
- fehlgeschlagene Cursor
- Cron zu alt
- Exportjobs haengen
- Debug deaktiviert
- aktuelle Fehler/Warnungen

## CSV-Export

- Admin-CSV fuer globale Diagnose.
- User-CSV fuer eigene Diagnose.
- Serverkopie im AppData speichern.
- Alte CSVs begrenzen nach Anzahl und Alter.
- CSV-Zellen gegen `=`, `+`, `-`, `@` am Anfang schuetzen.

## Debug-Modus

Debug muss zentral steuerbar sein:

- aus im Normalbetrieb moeglich,
- an im Testfenster,
- Retention einstellbar,
- Kontextlaenge begrenzt.
