# DATA_MODEL (Stand: Phase 2, implementiert)

Speicher: IndexedDB über Dexie 4, Datenbankname `gpx-tracker`, Schema-Version 1 (`src/db/db.ts`).
Zeiten: Unix-Millisekunden UTC. Tourdatum `date`: "YYYY-MM-DD".

| Tabelle | Primärschlüssel | Indizes | Inhalt |
|---|---|---|---|
| categories | id | sortOrder | Kategorien als eigene Entitäten (Name, Farbe, Reihenfolge, isDefault) |
| tours | id | categoryId, date, startTime, updatedAt | Tour-Metadaten und berechnete Werte, Notizen, Quelle, Land (`countryCode`, `countryManual`) |
| trackPoints | [tourId+seq] | – | Trackpunkte (lat, lon, ele, time, accuracy, segment), getrennt von der Tour |
| waypoints | id | tourId | GPX-Waypoints einer Tour |
| photos | id | tourId | Foto als Blob plus Maße, max. 3 pro Tour |
| meta | key | – | interne Marker (z. B. Standardkategorien angelegt) |

## Regeln (im Code erzwungen und getestet)
- IDs sind UUIDs (`crypto.randomUUID`). Standardkategorien haben feste IDs (`default-wandern` usw.).
- Standardkategorien werden einmalig angelegt; gelöschte kommen nicht zurück. Alle Kategorien sind bearbeit- und löschbar.
- Kategorienamen sind eindeutig (ohne Beachtung der Groß-/Kleinschreibung) und nicht leer.
- Eine Kategorie mit zugeordneten Touren wird nur gelöscht, wenn eine Zielkategorie angegeben wird; die Touren wandern dorthin.
- Eine Tour braucht eine existierende Kategorie. Tour, Trackpunkte und Waypoints werden in einer Transaktion geschrieben (ganz oder gar nicht).
- Tour löschen entfernt Trackpunkte, Waypoints und Fotos mit.
- Höchstens 3 Fotos pro Tour.
- Manuelle Touren (`source: 'manual'`) haben keine Trackpunkte, `startTime`/`endTime` sind `null`; `startPoint`/`endPoint` sind gleich dem optional angegebenen Ort. Distanz, Dauer und Ort sind nur bei ihnen änderbar (`updateTourDetails`).
- Aufnahmen (`source: 'recording'`): Die Tour entsteht beim Start mit `endTime = null`; die `seq` der Trackpunkte ist die vom Plugin vergebene Nummer (idempotente Übernahme). Beim Abschluss werden Zeiten, Distanz usw. aus den Punkten berechnet. Eine Aufnahme ohne Punkte wird verworfen.
- Listen sortieren nach `date` absteigend, dann `startTime` absteigend.
- `createdAt` einer Tour bleibt bei Änderungen unverändert, `updatedAt` wird bei jeder Änderung gesetzt.

## Land (Phase 7b)
- `countryCode?: string | null` (ISO-3166-1-Alpha-2): `undefined` = noch nicht berechnet, `null` = kein Land gefunden oder „Kein Land“ gewählt. `countryManual?: boolean`: true = vom Nutzer gesetzt.
- Die Felder sind optional und nicht indiziert. Es gibt deshalb **keine neue Schema-Version und keine Migration**: bestehende Touren haben das Feld einfach nicht (= `undefined`) und werden beim nächsten Öffnen der Datenliste oder Tour-Details aus dem Startpunkt ergänzt (`assignCountries`). Gefiltert wird im Speicher.
- Automatisch berechnet wird nur bei `undefined`; ein manuell gesetztes Land wird nie überschrieben. Laufende/unterbrochene Aufnahmen werden übersprungen, bis sie abgeschlossen sind. Eine Ortsänderung bei manuellen Touren setzt ein automatisches Land auf `undefined` zurück (Neuberechnung), ein manuelles bleibt.
- `assignCountries` ändert `updatedAt` nicht; eine manuelle Wahl über `setTourCountry` schon.

## Backup-Format (Phase 8a)
ZIP-Datei `travelbook-backup-JJJJ-MM-TT.zip`; **keine Änderung am Datenbankschema** (Version 1 bleibt). Inhalt:
- `manifest.json`: `format: "travelbook-backup"`, `version: 1`, `createdAt` (Unix-ms), `counts` (categories, tours, trackPoints, waypoints, photos), `settings` (Schlüssel → Text, nur `gpx-tracker.theme` und `gpx-tracker.mapMode`).
- `data/categories.json`, `data/tours.json`, `data/waypoints.json`, `data/photos.json` (Metadaten ohne Bild), `data/meta.json`: Tabellen als JSON-Listen; Felder wie in `src/db/types.ts`.
- `data/tracks/<tourId>.json`: Trackpunkte einer Tour (ohne `tourId`), nur für Touren mit Punkten.
- `photos/<photoId>.<jpg|png|webp|gif|bin>`: Fotobytes unverändert.
- Regeln: Kennungen nur `[A-Za-z0-9_-]{1,80}`; Formatversionen > 1 werden abgelehnt; laufende/unterbrochene Aufnahmen (`source: recording`, keine Endzeit) werden weder gesichert noch überschrieben. JSON-Dateien sind per Deflate komprimiert (wenn `CompressionStream` vorhanden), Fotos unkomprimiert.
- Wiederherstellen prüft vor dem ersten Schreibzugriff: ZIP-Struktur, Prüfsummen aller Einträge, Felder und Wertebereiche, Verweise (Tour→Kategorie, Waypoint/Foto→Tour), höchstens 3 Fotos je Tour, Anzahlen laut Manifest.

## Noch nicht umgesetzt
- Berechnung der Tourwerte (Distanz, Höhenmeter, Geschwindigkeit) aus Trackpunkten: Phase 3.
- Vereinfachte Geometrie für die Kartenübersicht (zusätzliche Tabelle, Schema-Version 2): Phase 4.
- Der native Aufzeichnungspuffer (Android, SQLite) liegt außerhalb dieser Datenbank und wird in Phase 5b umgesetzt.
