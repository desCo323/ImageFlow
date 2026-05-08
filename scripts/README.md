# Scripts

Dieser Ordner enthaelt bewusst nur Hinweise. Neue Apps sollen eigene Skripte im jeweiligen Projektordner bekommen.

Empfohlene Skripte:

- `self-check.sh`
- `build-artifact.sh`
- `production-update.sh`
- `live-smoke.php`
- `live-security-smoke.php`
- `live-regression.php`

Alle Live-Skripte muessen ohne explizites Sicherheits-Flag verweigern, z. B.:

```bash
SAKURAALBUM_LIVE_SMOKE=1 php scripts/live-smoke.php
```

Das konkrete Flag soll pro App benannt werden.
