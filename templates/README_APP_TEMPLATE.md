# <AppName>

Kurzbeschreibung der Nextcloud-App.

## Idee

Welche Luecke schliesst die App?

## Warum diese App?

| Ohne App | Mit App |
| --- | --- |
| Problem | Vorteil |

## Hauptfunktionen

- 

## Sicherheit

- Dry-Run/Fingerprint fuer Schreibaktionen.
- Exakte Bestaetigung fuer Loeschaktionen.
- Admin-Limits.
- Debug-Logs ohne Secrets.

## Installation ohne App Store

1. Backup erstellen.
2. App nach `/var/www/nextcloud/apps/<app-id>` kopieren.
3. Eigentümer setzen.
4. `occ app:enable <app-id>`.
5. `occ upgrade`, falls noetig.
6. Status pruefen.

## Tests

```bash
bash scripts/self-check.sh
npm run test:browser
```

## Lizenz

Lizenzstatus klar angeben.
