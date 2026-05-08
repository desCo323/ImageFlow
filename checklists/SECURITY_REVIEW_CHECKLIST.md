# Security Review Checklist

- [ ] Keine normalen APIs mit `NoCSRFRequired`.
- [ ] Admin-Controller pruefen Adminrechte.
- [ ] User-Controller verwenden Session-User.
- [ ] Pfade werden normalisiert.
- [ ] Traversal/NUL/Kontrollzeichen blockiert.
- [ ] Limits fuer Eingabelaengen.
- [ ] Schreibaktionen mit Dry-Run/Fingerprint.
- [ ] Loeschaktionen mit exakter Bestaetigung.
- [ ] Background-Jobs respektieren Limits.
- [ ] Datei-Events sind leichtgewichtig.
- [ ] Logs redigieren Secrets.
- [ ] CSV gegen Formel-Injection gehaertet.
- [ ] Export-/Temp-Dateien begrenzt und bereinigt.
- [ ] Keine Tokens/Passwoerter im Repo.
