# Codex Startanweisung fuer neue Nextcloud-App-Projekte

Du bist Codex und entwickelst eine Nextcloud-App auf einem Server, der produktiv genutzt werden kann. Arbeite vorsichtig, dokumentiert, testbar und immer mit Rollback-Moeglichkeit.

## Sofortige Arbeitsregeln

1. **Niemals direkt produktiv entwickeln.**
   - Entwickle in einem separaten Arbeitsordner im Home-Verzeichnis.
   - Produktive App-Verzeichnisse unter `/var/www/nextcloud/apps/` werden nur ueber ein kontrolliertes Deploy aktualisiert.

2. **Vor jedem Live-Test ein Backup.**
   - App-Verzeichnis sichern.
   - Relevante Datenbanktabellen sichern.
   - `occ status` und App-Version dokumentieren.
   - Wiederherstellungsprompt schreiben.
   - Pruefsummen erzeugen und verifizieren.

3. **Live-Tests nur mit ausdruecklich freigegebenem Testbenutzer.**
   - Keine Tests mit echten Benutzerkonten.
   - Testdaten isoliert in eindeutig benannten Ordnern.
   - Nach jedem Test: Reset, Cleanup, Nachkontrolle.

4. **Alle Schritte dokumentieren.**
   - Fuehre einen `docs/SESSION_STATE.md`.
   - Aktualisiere ihn haeufig.
   - Dokumentiere Stand, Tests, Backups, Deploys, Befunde und naechste Schritte.

5. **Keine Secrets speichern.**
   - Keine Tokens, Passwoerter oder Sessiondaten in Git.
   - Keine Traces/Videos/Screenshots mit Login-Daten.
   - GitHub-Tokens nur temporaer via `GIT_ASKPASS` oder Umgebungsvariable verwenden.

6. **Sicherheit vor Komfort.**
   - CSRF aktiv lassen.
   - Berechtigungen serverseitig pruefen.
   - Pfade normalisieren und begrenzen.
   - Schreib-/Loeschaktionen mit Dry-Run, Fingerprint und exakter Bestaetigung absichern.
   - Adminrouten strikt Admin-only.

7. **Performance und Last begrenzen.**
   - Keine schweren Scans in Datei-Events.
   - Datei-Events nur in Queue schreiben.
   - Hintergrundjobs mit Debounce, Limits, Wartungsfenstern und Chunking.
   - Fortsetzungen/Cursor fuer grosse Datenmengen.

8. **UX ernst nehmen.**
   - Normale Workflows einfach halten.
   - Erweiterte/Testfunktionen trennen.
   - Vorschau vor Schreibaktionen.
   - Status, Fortschritt und Details verstaendlich anzeigen.
   - Mobile Lesbarkeit pruefen.

9. **Automatisiert testen, bevor ein Mensch testet.**
   - Syntaxchecks.
   - Self-check.
   - Browser-Smoke.
   - Authentifizierte Browser-Flows, wenn Zugangsdaten explizit fuer Testbenutzer vorliegen.
   - Live-Smoke nur im Backup-Testfenster.

10. **Nach jedem Live-Test Zustand pruefen.**
    - Nextcloud `maintenance=false`.
    - `needsDbUpgrade=false`.
    - App-Version korrekt.
    - Testbenutzer sauber.
    - Keine unerwarteten Fehler/Warnungen.
    - `nextcloud.log` pruefen.

## Erwarteter Projektordner

Eine neue App sollte mindestens diese Struktur haben:

```text
NewApp-work/
  NewApp/
    appinfo/
    lib/
    js/
    css/
    img/
    tests/
    scripts/
    docs/
    README.md
    CHANGELOG.md
    LICENSE.md
```

## Pflichtdokumente im neuen Projekt

- `docs/SESSION_STATE.md`
- `docs/TEST_BACKLOG.md`
- `docs/SECURITY_MODEL.md`
- `docs/UPDATE_POLICY.md`
- `docs/BROWSER_TESTING.md`
- `docs/STORE_RELEASE_CHECKLIST.md`

## Standardablauf fuer jeden groesseren Block

1. Arbeitsstand pruefen.
2. Session-State aktualisieren.
3. Implementieren.
4. Lokale Checks.
5. Commit.
6. Production-Preflight.
7. Backup mit Restore-Prompt.
8. Deploy.
9. Live-Tests mit Testbenutzer.
10. Nachkontrolle.
11. Dokumentation aktualisieren.
12. Commit/Push.
