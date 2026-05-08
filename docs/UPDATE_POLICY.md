# ImageFlow Update Policy

Datum: 2026-05-08

## Versionsschema

ImageFlow startet mit `0.1.0`. Vor produktivem Einsatz muss jede Version:

- einen Changelog-Eintrag haben,
- lokale Checks bestehen,
- im Arbeitsordner committed sein,
- mit Backup und Restore-Prompt deployed werden.

## Deploy-Regeln

- Kein Direkt-Edit unter `/var/www/nextcloud/apps/imageflow`.
- Deploy nur durch Kopie aus dem Arbeitsordner.
- Vor Deploy: Backup oder dokumentieren, dass die App noch nicht existiert.
- Nach Deploy: Eigentümer und Rechte pruefen.
- Nach Aktivierung: `occ status` und App-Version dokumentieren.

## Migrationen

- Migrationen muessen idempotent sein.
- Tabellen erhalten App-Prefix `imageflow_`.
- Datenbankaenderungen werden vor Live-Test gesichert.
