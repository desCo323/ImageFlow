# ImageFlow

ImageFlow ist eine Nextcloud-App fuer schnelles, kontrolliertes Sortieren grosser Bildordner.

Die App soll Sortierjobs anlegen, pausieren, fortsetzen und erst nach expliziter Freigabe ausfuehren. Beim Sortieren werden Bilder schnell angezeigt und per Klick oder Hotkey einem Ziel zugeordnet. Die eigentlichen Schreiboperationen wie Album-Zuordnung, Kopieren oder Verschieben laufen spaeter im Hintergrund.

## Projektidentitaet

| Feld | Wert |
| --- | --- |
| Anzeigename | ImageFlow |
| Nextcloud App-ID | imageflow |
| GitHub-Repository | desCo323/ImageFlow |
| Arbeitsordner | `/home/cloud/ImageFlow-work` |
| Geplantes App-Verzeichnis | `/home/cloud/ImageFlow-work/imageflow` |

## Kernfunktionen

- Hauptseite fuer Sortierjobs: Quelle waehlen, Zielmodus waehlen, Status kontrollieren.
- Zielmodi: Nextcloud-Album, Datei in Ordner verschieben, Datei in Ordner kopieren.
- Sortieransicht mit Job-Kopfbereich, Favoriten links, Bildmitte, Zielauswahl rechts und Filmstreifen unten.
- Favoriten per Drag and Drop sortieren; Reihenfolge bestimmt die Hotkeys.
- Hotkeys fuer schnelle Zuordnung, inklusive Ueberspringen per `0` oder Leertaste.
- Schreiboperationen werden als Queue gespeichert und erst nach explizitem Start im Hauptmenue ausgefuehrt.
- Sicherer Modus fuer Kopieren/Verschieben mit Pruefsummen und nachvollziehbaren Debug-Logs.
- UI-Richtung: an SakuraAlbum angelehnt, aber dichter, schneller und konsequenter auf Sortier-Workflows optimiert.

## Sicherheitsgrundsaetze

- Keine Entwicklung direkt unter `/var/www/nextcloud/apps/`.
- Kein Live-Test ohne Backup, Restore-Prompt, Testbenutzer und Nachkontrolle.
- Schreibaktionen zuerst als Dry-Run beziehungsweise geplante Operationen behandeln.
- Keine Secrets, Tokens, Passwoerter, Sessions, Screenshots mit Login-Daten oder echten Testdaten in Git.
- Produktive Daten duerfen bei Tests nicht veraendert werden.
- Live-/Browser-Tests duerfen nur mit dem freigegebenen Testbenutzer `albentest` erfolgen.

## Aktueller Status

Bootstrap-Phase. Der Projektname steht fest und die Nextcloud-App-Struktur wurde im Unterordner `imageflow/` angelegt. Die App ist lokal pruefbar und bewusst noch nicht produktiv deployed. Echte Datei-Schreiboperationen sind im ersten Skeleton deaktiviert.

## Arbeitsdokumentation

- Einstieg: [`CODEX_START_HERE.md`](CODEX_START_HERE.md)
- App: [`imageflow/README.md`](imageflow/README.md)
- Laufender Zustand: [`docs/SESSION_STATE.md`](docs/SESSION_STATE.md)
- UI-Referenz: [`docs/UI_REFERENCE.md`](docs/UI_REFERENCE.md)
- Sicherheitsmodell: [`docs/PRODUCTION_SAFETY_RULES.md`](docs/PRODUCTION_SAFETY_RULES.md)
- Teststrategie: [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md)
- UX-Leitlinien: [`docs/UX_AND_UI_GUIDELINES.md`](docs/UX_AND_UI_GUIDELINES.md)
