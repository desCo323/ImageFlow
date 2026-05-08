# ImageFlow Browser Testing

Datum: 2026-05-08

## Lokal

Statische UI-Smokes:

```bash
cd /home/cloud/ImageFlow-work/imageflow
npm run test:browser
```

Diese Tests laufen ohne Nextcloud-Login und pruefen Layout-Grundfunktionen.

## Authentifiziert

Authentifizierte Tests duerfen nur mit dem Testbenutzer `albentest` laufen.

Passwoerter, Tokens und Sessiondaten duerfen nicht in Git, Logs, Screenshots oder Traces gespeichert werden.

Vor jedem authentifizierten Test:

- Backup erstellen.
- Testdaten isolieren.
- Restore-Prompt bereitlegen.
- Produktivstatus dokumentieren.

Nach jedem Test:

- Testdaten entfernen oder zuruecksetzen.
- `occ status` pruefen.
- `nextcloud.log` pruefen.
