# DATA_MODEL (Stand: Phase 2, implementiert)

Speicher: IndexedDB über Dexie 4, Datenbankname `gpx-tracker`, Schema-Version 1 (`src/db/db.ts`).
Zeiten: Unix-Millisekunden UTC. Tourdatum `date`: "YYYY-MM-DD".

| Tabelle | Primärschlüssel | Indizes | Inhalt |
|---|---|---|---|
| categories | id | sortOrder | Kategorien als eigene Entitäten (Name, Farbe, Reihenfolge, isDefault) |
| tours | id | categoryId, date, startTime, updatedAt | Tour-Metadaten und berechnete Werte, Notizen, Quelle |
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

## Noch nicht umgesetzt
- Berechnung der Tourwerte (Distanz, Höhenmeter, Geschwindigkeit) aus Trackpunkten: Phase 3.
- Vereinfachte Geometrie für die Kartenübersicht (zusätzliche Tabelle, Schema-Version 2): Phase 4.
- Fotokompression, EXIF-Bereinigung, Backup/Restore. Der native Aufzeichnungspuffer (Android, SQLite) liegt außerhalb dieser Datenbank und wird in Phase 5b umgesetzt.
