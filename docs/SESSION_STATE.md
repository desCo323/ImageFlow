# ImageFlow Session State

Datum: 2026-05-08

## Neueste operative Notiz

- Benutzerauftrag: Nextcloud-App fuer schnelles Sortieren grosser Bildordner entwickeln; Projektname ImageFlow; GitHub-Repository `desCo323/ImageFlow`.
- Aktueller Stand: Blueprint-Arbeitsordner wurde nach `/home/cloud/ImageFlow-work` umbenannt. Lokales Git-Repo auf Branch `main` wurde initialisiert und Remote `origin` zeigt auf `https://github.com/desCo323/ImageFlow.git`. Es wurden keine produktiven Nextcloud-Dateien veraendert.
- Geaenderte Dateien: `README.md`, `.gitignore`, `docs/SESSION_STATE.md`, `docs/UI_REFERENCE.md`.
- Noch nicht deployed: Alles. Es gab keinen Deploy nach `/var/www/nextcloud/apps/`.
- Naechste Schritte: App-Skeleton im Unterordner `imageflow/` anlegen, Datenmodell fuer Jobs/Queue entwerfen, Sicherheits- und Rollback-Konzept konkretisieren.

## Letzter Teststand

- Lokale Checks: Noch keine App-Checks vorhanden.
- Browser-Tests: Noch nicht moeglich, da noch keine App-Oberflaeche existiert.
- Self-check: Noch nicht vorhanden.
- Live-Test: Nicht durchgefuehrt.
- Backup: Nicht erforderlich, da keine produktive Installation beruehrt wurde.
- Restore-Prompt: Noch nicht erforderlich.
- Nachkontrolle: Produktivpfad wurde nicht veraendert.

## Test- und Designvorgaben

- Live-/Browser-Tests duerfen nur mit dem dedizierten Testbenutzer `albentest` durchgefuehrt werden.
- Das Passwort des Testbenutzers wurde nur in der Unterhaltung genannt und darf nicht in Git, Logs, Screenshots oder Projektdateien gespeichert werden.
- Das Design soll sich an der installierten Nextcloud-App SakuraAlbum orientieren, aber fuer ImageFlow klarere Workflows, bessere Tastaturbedienung, bessere Statusanzeigen und eine schnellere Sortieransicht bieten.

## Offene Punkte

- Nextcloud-Zielversion und vorhandene Entwicklungswerkzeuge pruefen.
- App-Struktur `imageflow/` gemaess Nextcloud-Konventionen anlegen.
- Datenbanktabellen fuer Sortierjobs, Zielzuordnungen, Queue und Debug-Logs planen.
- Dry-Run, sichere Ausfuehrung und Checksummenmodus technisch festlegen.
- Browser-Teststrategie fuer Hauptseite und Sortieransicht erstellen.
- GitHub-Push-Strategie ohne gespeicherte Tokens klaeren.
- SakuraAlbum lokal inspizieren, bevor UI-Komponenten fuer ImageFlow festgelegt werden.
- UI-Referenz aus SakuraAlbum in `docs/UI_REFERENCE.md` festgehalten.
- GitHub-Repo `desCo323/ImageFlow` ist privat und ueber den GitHub-Connector mit Schreibrechten sichtbar. Lokales `gh` ist auf dem Server nicht installiert; ein CLI-Push wurde daher nicht mit Token erzwungen.

## Wiederherstellungsprompt

```text
Stelle ImageFlow aus <backup>/app-before-test nach /var/www/nextcloud/apps/imageflow wieder her, setze Eigentümer www-data:www-data, pruefe danach occ status und stelle sicher, dass maintenance false und needsDbUpgrade false sind.
```
