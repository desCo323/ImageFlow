# ImageFlow UI Reference

Datum: 2026-05-08

## Referenz: SakuraAlbum

SakuraAlbum ist lokal installiert unter `/var/www/nextcloud/apps/sakuraalbum` und dient als visuelle Ausgangsbasis. Die Referenz wurde nur lesend geprueft.

Beobachtete UI-Merkmale:

- Nextcloud-Designvariablen fuer Text, Hintergrund, Border und Primaeraktionen.
- Ruhige Einstellungsoberflaeche mit klaren Panels, 8px-Radien und farbigen linken Akzentlinien.
- Akzentfarben: Sakura-Rot/Pink, Gruen/Tuerkis und Violett fuer Status- und Fortschrittsbereiche.
- Kompakte Meta-Kacheln, Status-Lanes, Fortschrittsbalken und detaillierte Diagnosebereiche.
- Sicherheitskritische Aktionen sind sichtbar getrennt und rot markiert.
- Erweiterte Test-/Schreibfunktionen sind in separaten Bereichen untergebracht.

## ImageFlow Richtung

ImageFlow soll die SakuraAlbum-Anmutung wiedererkennen lassen, aber staerker auf schnelle Sortierarbeit optimiert sein:

- Hauptseite als job-orientiertes Arbeitsdashboard statt Einstellungsseite.
- Sortieransicht als dichtes Arbeitslayout mit Kopfstatus, linker Favoritenleiste, grossem Bildfenster, rechter Zielauswahl und Filmstreifen.
- Fokus auf Tastaturbedienung: Hotkeys immer sichtbar, aber nicht stoerend.
- Ziele muessen sehr schnell erreichbar sein: Favoriten links, vollstaendige Zielsuche rechts.
- Hintergrund-Queue und sichere Ausfuehrung klar trennen: Sortieren plant Operationen, Hauptseite fuehrt sie nach Freigabe aus.
- Sicherheitszustand sichtbar machen: Dry-Run, sicherer Modus, Pruefsummenstatus, Fehlerprotokoll und Rollback-Hinweise.
- UI soll keine langen Erklaertexte brauchen; Status und Optionen muessen aus Labels, Icons, Tabellen und kompakten Hilfetexten verstaendlich sein.

## Erste Layout-Entscheidungen

- App-ID: `imageflow`
- Anzeigename: `ImageFlow`
- Hauptnavigation:
  - `Jobs`
  - `Sortieren`
  - `Protokoll`
  - `Einstellungen`
- Jobmodi:
  - `Album zuordnen`
  - `In Ordner verschieben`
  - `In Ordner kopieren`
- Schreibstatus:
  - `Entwurf`
  - `Sortierung laeuft`
  - `Bereit zur Ausfuehrung`
  - `Ausfuehrung geplant`
  - `Ausfuehrung laeuft`
  - `Pausiert`
  - `Abgeschlossen`
  - `Fehler`

## Browser-Test-Vorgabe

Authentifizierte Browser-Tests duerfen ausschliesslich mit dem Testbenutzer `albentest` laufen. Das Passwort wird nicht in diesem Repository dokumentiert.
