# ImageFlow Session State

Datum: 2026-05-08

## Neueste operative Notiz

- Benutzerauftrag: Nextcloud-App fuer schnelles Sortieren grosser Bildordner entwickeln; Projektname ImageFlow; GitHub-Repository `desCo323/ImageFlow`.
- Aktueller Stand: Blueprint-Arbeitsordner wurde nach `/home/cloud/ImageFlow-work` umbenannt. Lokales Git-Repo auf Branch `main` wurde initialisiert und Remote `origin` zeigt auf `https://github.com/desCo323/ImageFlow.git`. Die Nextcloud-App-Struktur `imageflow/` ist angelegt, lokal geprueft und nach GitHub gepusht. Es wurden keine produktiven Nextcloud-Dateien veraendert.
- Geaenderte Dateien: `README.md`, `.gitignore`, `docs/SESSION_STATE.md`, `docs/UI_REFERENCE.md`, `docs/SECURITY_MODEL.md`, `docs/TEST_BACKLOG.md`, `docs/UPDATE_POLICY.md`, `docs/BROWSER_TESTING.md`, `docs/STORE_RELEASE_CHECKLIST.md`, `imageflow/**`.
- Noch nicht deployed: Alles. Es gab keinen Deploy nach `/var/www/nextcloud/apps/`.
- Naechste Schritte: Kontrollierten Deploy vorbereiten, Backup-/Restore-Prompt schreiben, danach erst authentifizierte Browser-Tests mit `albentest`.

## Letzter Teststand

- Lokale Checks: `bash imageflow/scripts/self-check.sh` erfolgreich.
- Browser-Tests: `npm run test:browser` im Ordner `imageflow/` erfolgreich, 2 statische UI-Smokes.
- Self-check: PHP-Syntax, XML, Routen, JS-Syntax und Secret-Scan erfolgreich.
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
- Echte Ausfuehrung fuer Album-Zuordnung, Kopieren und Verschieben bewusst noch nicht implementiert.
- Dry-Run, sichere Ausfuehrung und Checksummenmodus technisch weiter ausarbeiten.
- Authentifizierte Browser-Teststrategie fuer Hauptseite und Sortieransicht umsetzen.
- GitHub-Push-Strategie ohne gespeicherte Tokens klaeren.
- SakuraAlbum lokal inspizieren, bevor UI-Komponenten fuer ImageFlow festgelegt werden.
- UI-Referenz aus SakuraAlbum in `docs/UI_REFERENCE.md` festgehalten.
- GitHub-Repo `desCo323/ImageFlow` ist privat und ueber den GitHub-Connector mit Schreibrechten sichtbar. Lokales `gh` ist auf dem Server nicht installiert; der Push wurde temporaer per `GIT_ASKPASS` durchgefuehrt, ohne Token in Git-Remote oder Projektdateien zu speichern.
- App-Skeleton `imageflow/` ist installierbar angelegt: Navigation, Routen, Controller, Migration, Services, UI, Self-Check und Browser-Smokes.
- Remote-Stand nach Bootstrap-Push: `origin/main` bei Commit `6838eba` (`merge GitHub initial state`).
- Deploy-/Rollback-Skript `imageflow/scripts/production-update.sh` und Runbook `imageflow/docs/DEPLOYMENT_RUNBOOK.md` sind angelegt, lokal geprueft und gepusht. Deploy bleibt durch `IMAGEFLOW_PRODUCTION_UPDATE=1` gesperrt.
- Remote-Stand nach Deploy-Tooling-Block: `origin/main` bei Commit `c0b07ba` (`add controlled ImageFlow deploy tooling`).

## Wiederherstellungsprompt

```text
Stelle ImageFlow aus <backup>/app-before-test nach /var/www/nextcloud/apps/imageflow wieder her, setze Eigentümer www-data:www-data, pruefe danach occ status und stelle sicher, dass maintenance false und needsDbUpgrade false sind.
```
