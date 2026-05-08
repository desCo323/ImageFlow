# Release- und Update-Policy

## Grundsatz

Ab einem produktionsnahen Stand wird jede installierte Version so behandelt, als koenne sie produktiv genutzt werden. Neue Versionen muessen Update- und Migrationssicherheit beachten.

## Versionierung

Empfohlen:

- Patch-Version fuer kleine UI-/Bugfix-Aenderungen.
- Minor-Version fuer neue Funktionen.
- Major-Version fuer inkompatible Aenderungen.

Jede Version braucht:

- `CHANGELOG.md`
- Version in `appinfo/info.xml`
- Version in `package.json`, falls vorhanden
- versionierte JS/CSS-Assets, falls Caching relevant
- Tests
- Backup-Testfenster

## Update-Ablauf

1. Lokale Checks.
2. Commit.
3. Build-Artefakt.
4. Production-Preflight.
5. Backup.
6. Deploy.
7. `occ upgrade`, falls noetig.
8. Code integrity check.
9. Maintenance off.
10. Live-Smoke.
11. Nachkontrolle.
12. Dokumentation und Push.

## Migrationsregeln

- Migrationen idempotent schreiben.
- Keine Daten ohne Backup loeschen.
- Neue Spalten mit Defaults.
- Bestehende Datenformate weiter lesen.
- Bei Syntax-/Namensaenderungen Schema-Version speichern.

## Store-Vorbereitung

Vor Store:

- kompatible Lizenz klaeren,
- App-Metadaten pruefen,
- Screenshots,
- README Deutsch/Englisch,
- Datenschutz,
- Sicherheitsmodell,
- Changelog,
- Release-Checkliste,
- Tests auf Ziel-Nextcloud-Versionen.
