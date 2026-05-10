# ImageFlow

ImageFlow ist eine Nextcloud-App fuer Menschen, die grosse Bildordner schnell sortieren wollen, ohne dabei sofort Dateien zu verschieben oder produktive Daten zu riskieren.

Der Kern ist ein Flow: Du waehlst einen Bilderordner, entscheidest ob Bilder in ein Album kommen, kopiert oder verschoben werden sollen, und sortierst dann Bild fuer Bild per Klick oder Hotkey. Erst danach pruefst du die Ablage und gibst sie bewusst frei.

![ImageFlow Dashboard](imageflow/docs/screenshots/35-v1-live-dashboard.png)

## Warum ImageFlow?

- Schnelles Sortieren grosser Bildmengen direkt in Nextcloud.
- Spielartige Sortieransicht mit Hotkeys, Serie, Tempoanzeige und unmittelbarem Feedback.
- Favoriten links, aktuelles Bild in der Mitte, alle Alben oder Ordner rechts.
- Filmstreifen unten mit vorgeladenen Bildern und Pfeiltasten-Navigation.
- Entscheidungen werden zuerst vorgemerkt. Kopieren, Verschieben oder Album-Aenderungen passieren erst nach Pruefung und Freigabe.
- Safe Mode mit Pruefsummen, Konfliktpruefung, Doppelungslogik und ausfuehrlichen Diagnose-Logs.
- Admin-Seite fuer globale Datei- und Automatikfreigaben.
- Deutsch und Englisch in der Oberflaeche; weitere Sprachen koennen ueber das UI-Dictionary ergaenzt werden.

## Ablauf

1. **Flow anlegen**: Quelle waehlen, Zielart festlegen, optional Unterordner einbeziehen und Sicherheitsmodus aktiv lassen.
2. **Sortieren**: Bild anzeigen lassen, Ziel anklicken oder Hotkey druecken. `0` und Leertaste ueberspringen, `Strg+Z` nimmt die letzte Entscheidung zurueck.
3. **Ablage pruefen**: Nach dem Sortieren auf **Ablage pruefen** klicken. ImageFlow zeigt Warnungen, Doppelungen und prueft die Ausfuehrbarkeit.
4. **Freigeben oder warten**: Die geprueften Entscheidungen koennen manuell gestartet oder vom Hintergrundjob in ruhigen Serverphasen verarbeitet werden.
5. **Nachvollziehen**: Diagnoseexport und Debug-Logs zeigen, was geplant, freigegeben, ausgefuehrt, blockiert oder fehlgeschlagen ist.

![Sortieransicht Desktop](imageflow/docs/screenshots/36-v1-live-sort-desktop.png)

![Sortieransicht Mobile](imageflow/docs/screenshots/37-v1-live-sort-mobile.png)

## Wichtige Bildschirme

| Bereich | Zweck |
| --- | --- |
| Dashboard | Flows anlegen, pausieren, fortsetzen, bearbeiten, duplizieren und Ablagepruefung starten. |
| Sortieransicht | Schnelles Entscheiden mit Favoriten, Hotkeys, Zielsuche, Zielanlage und Vorschauleiste. |
| Ablage pruefen | Alle vorgemerkten Entscheidungen validieren, Warnungen sehen und Ausfuehrung freigeben. |
| Admin-Einstellungen | Globale Freigabe echter Dateioperationen, Hintergrundverarbeitung, Serverlast-Grenze und Zeitfenster. |
| Protokoll | Diagnoseereignisse und Supportdaten fuer Fehleranalyse. |

![Ablage pruefen](imageflow/docs/screenshots/09-worklist-queued-state.png)

![Admin und Systemcheck](imageflow/docs/screenshots/27-system-check.png)

## Installation

Die App liegt im Unterordner `imageflow/`. Fuer eine Nextcloud-Installation wird dieser Ordner als App-Verzeichnis verwendet.

```bash
cd /var/www/nextcloud/apps
git clone https://github.com/desCo323/ImageFlow.git imageflow-repo
cp -a imageflow-repo/imageflow ./imageflow
sudo -u www-data php /var/www/nextcloud/occ app:enable imageflow
```

Bei einem Update:

```bash
cd /var/www/nextcloud/apps/imageflow-repo
git pull
sudo rsync -a --delete --exclude='node_modules' --exclude='test-results' imageflow/ /var/www/nextcloud/apps/imageflow/
sudo chown -R www-data:www-data /var/www/nextcloud/apps/imageflow
sudo -u www-data php /var/www/nextcloud/occ app:update imageflow
sudo -u www-data php /var/www/nextcloud/occ maintenance:repair
```

Fuer produktive Server gilt: Vor jedem Deployment Backup erstellen, App-Konfiguration sichern und echte Dateioperationen erst nach einem kontrollierten Testfenster aktivieren.

## Nutzung

- Nextcloud oeffnen und **ImageFlow** in der Navigation starten.
- **Flow anlegen** klicken und Bilderordner auswaehlen.
- Zielmodus waehlen: Album, Kopieren oder Verschieben.
- Bei Kopieren oder Verschieben den Zielordner festlegen.
- Optional **Unterordner mit einbeziehen**, **Vorschau laden** und **Tastenbelegung** anpassen.
- Mit **Speichern & loslegen** in die Sortieransicht wechseln.
- Nach der letzten Entscheidung den Hinweis beachten und **Ablage pruefen** oeffnen.
- Erst nach der Pruefung Entscheidungen freigeben oder manuell ausfuehren.

## Sicherheit

ImageFlow ist bewusst zweistufig aufgebaut:

- Sortieren speichert nur Entscheidungen und Queue-Eintraege.
- Dateioperationen sind serverseitig global abschaltbar.
- Der Safe Mode prueft Kopien und Verschiebungen mit Checksummen.
- Vor Ausfuehrung werden Zielkonflikte, Doppelungen und fehlende Quellen erkannt.
- Der Hintergrundjob laeuft nur, wenn Admin-Freigaben, Queue-Status und Serverlast-Gate passen.
- Diagnoseexporte sind fuer Support gedacht und werden auf sensible Werte reduziert.

Auf produktiven Systemen duerfen Live-Tests nur mit dem freigegebenen Testkonto `albentest` laufen. Keine Zugangsdaten oder Tokens gehoeren in dieses Repository.

## Entwicklung und Tests

```bash
cd imageflow
bash scripts/self-check.sh
npm run test:browser
```

Authentifizierte Browser-Tests sind opt-in und duerfen nur gegen ein vorbereitetes Testkonto laufen:

```bash
IMAGEFLOW_BASE_URL=https://example.org \
IMAGEFLOW_TEST_USER=albentest \
IMAGEFLOW_TEST_PASSWORD='<runtime-only>' \
npm run test:browser:auth
```

Dokumentation:

- App-Dokumentation: [`imageflow/README.md`](imageflow/README.md)
- Nutzerhandbuch: [`imageflow/docs/USER_GUIDE.md`](imageflow/docs/USER_GUIDE.md)
- Admin-Handbuch: [`imageflow/docs/ADMIN_GUIDE.md`](imageflow/docs/ADMIN_GUIDE.md)
- Architektur: [`imageflow/docs/ARCHITECTURE.md`](imageflow/docs/ARCHITECTURE.md)
- Verifikation: [`imageflow/docs/V1_VERIFICATION.md`](imageflow/docs/V1_VERIFICATION.md)
