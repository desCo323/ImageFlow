# UX- und UI-Grundsaetze

## Ziel

Die App soll fuer normale Benutzer klar sein und fuer Administratoren trotzdem genug Kontrolle bieten.

## Benutzer-UI

- Erste Ansicht ist die nutzbare App, keine Marketingseite.
- Ein klarer normaler Ablauf:
  1. aktivieren,
  2. Quelle waehlen,
  3. Regeln setzen,
  4. Vorschau ansehen,
  5. Hintergrundlauf starten oder Automatik nutzen.
- Erweiterte Test-/Debugfunktionen getrennt darstellen.
- Gefaehrliche Aktionen in eigener Danger-Zone.
- Vor Loeschung immer Vorschau und exakte Bestaetigung.
- Fortschritt als Statusbar plus Details.
- Mobile Ansicht pruefen.

## Admin-UI

Admin-Seite sollte wie ein Betriebs-Cockpit funktionieren:

- Freigabe/Rollout
- Lastschutz/Limits
- Automatik/Cron
- Diagnose/Logs

Admins brauchen:

- klare aktive Werte,
- naechste Handlung,
- erkennbare Blocker,
- CSV/Diagnose,
- Hinweise auf Cron/Background-Jobs.

## Sprache

- Deutsch einfach und konkret.
- Umlaute ü ä ö verwenden.
- Technische Begriffe nur mit kurzer Erklaerung.
- Lange Hilfetexte kuerzen oder in Details verschieben.
- Keine unklaren Labels wie nur "Tiefe" ohne Beispiel.

## Accessibility

- Buttons mit eindeutigen Namen.
- Fokus sichtbar.
- Statusmeldungen mit `role="status"` und `aria-live`.
- Dynamische Ausgaben als `role="region"` beschriften.
- Tastaturbedienung testen.
- Mobile Breite testen.
- Text darf nicht ueberlaufen.
