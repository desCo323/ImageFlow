# Entwicklungsgrundsaetze

## Zielbild

Eine Nextcloud-App soll so entwickelt werden, dass sie spaeter produktiv eingesetzt, aktualisiert, debuggt und veroeffentlicht werden kann.

Das bedeutet:

- updatefaehige Datenhaltung,
- klare Versionierung,
- kontrollierte Migrationen,
- professionelle Benutzeroberflaeche,
- nachvollziehbare Logs,
- sichere APIs,
- reproduzierbare Tests,
- dokumentierter Release-Prozess.

## Arbeitsweise

### 1. Bestehende Nextcloud-Konventionen respektieren

- App-Struktur nach Nextcloud-Standards.
- `appinfo/info.xml`, `appinfo/routes.php`, `lib/AppInfo/Application.php`.
- Controller fuer HTTP-APIs.
- Services fuer Fachlogik.
- Mapper/Entities fuer App-eigene Tabellen.
- Background Jobs fuer teure oder wiederkehrende Arbeit.

### 2. Fachlogik nicht in Controller oder JavaScript verstecken

Controller sollen:

- Auth/Berechtigung verlassen auf Nextcloud Framework plus eigene Checks,
- Eingaben an Services uebergeben,
- strukturierte JSON-Antworten liefern.

Services sollen:

- validieren,
- planen,
- schreiben,
- loggen,
- Fehler klassifizieren.

JavaScript soll:

- UI-Zustand darstellen,
- APIs aufrufen,
- keine sicherheitskritischen Entscheidungen allein treffen.

### 3. Datenmodell updatefaehig halten

- Eigene Tabellen mit klarer Schema-Version.
- Keine Bedeutung nur aus frei formatierten Namen ableiten.
- Kritische Beziehungen explizit speichern.
- Fuer spaetere Syntaxaenderungen Versionsfelder vorsehen.
- Migrationen rueckwaertsvertraeglich planen.

### 4. Kleine Releases statt grosse riskante Spruenge

Empfohlen:

- `0.x`: fruehe Entwicklung.
- `1.0.x`: haertende Release-Kandidaten.
- Jede Aenderung mit Changelog, Tests und Backup-Testfenster.

### 5. Cache-Busting fuer Frontend-Dateien

Wenn Nextcloud oder Browser alte JS/CSS-Dateien cachen koennen:

- versionierte Assets verwenden, z. B. `admin-settings-1014.js`.
- Alte Assets im Repo lassen, wenn sie als Rueckfallhistorie nuetzlich sind.
- `lib/Settings/*.php` auf neue Assetnamen umstellen.

## Qualitaetskriterien

Eine Funktion ist erst fertig, wenn:

- sie implementiert ist,
- sie lokal getestet ist,
- sie in der UI verstaendlich ist,
- sie geloggt/diagnostizierbar ist,
- sie sicher gegen naheliegende Fehlbedienung ist,
- sie dokumentiert ist,
- sie im kontrollierten Testfenster funktioniert,
- sie keine produktiven Daten des Testsystems hinterlaesst.
