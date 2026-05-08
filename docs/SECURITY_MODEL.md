# ImageFlow Security Model

Datum: 2026-05-08

## Grundsatz

ImageFlow darf produktive Dateien nicht unkontrolliert veraendern. Sortieren und Ausfuehren sind getrennte Schritte.

## Aktueller Sicherheitszustand

- Entwicklung erfolgt in `/home/cloud/ImageFlow-work`.
- Produktive App-Verzeichnisse werden nicht direkt editiert.
- Das App-Skeleton erzeugt geplante Queue-Eintraege.
- Der Hintergrundjob ist im Bootstrap-Modus nicht-destruktiv.
- Live-/Browser-Tests duerfen nur mit `albentest` laufen.
- Das Passwort des Testbenutzers wird nicht gespeichert.

## Schreibschutz-Konzept

Vor echten Schreiboperationen muessen diese Bedingungen erfuellt sein:

- Dry-Run mit exakter Operationsliste.
- Explizite Freigabe im Hauptmenue.
- Serverseitige Pfadnormalisierung ohne `..` oder Kontrollzeichen.
- Rechtepruefung pro Quelle und Ziel.
- Sicherer Modus mit Pruefsummen fuer Kopieren/Verschieben.
- Kein Loeschen ohne Fingerprint und exakte Bestaetigung.
- Ausfuehrliche, redigierte Debug-Logs ohne Secrets.

## Rollback

Jeder Deploy braucht:

- Backup des App-Verzeichnisses oder Markierung `app did not exist`.
- Dump relevanter ImageFlow-Tabellen.
- dokumentierten Restore-Prompt.
- Nachkontrolle mit `occ status`.
