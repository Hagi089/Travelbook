# TECHNICAL_DOCUMENTATION (Stand: Phase 4b)

## Module
- `src/db/` – lokale Datenbank (siehe DATA_MODEL.md).
- `src/gpx/parse.ts` – `parseGpx(xml)`: GPX 1.0/1.1 mit `fast-xml-parser`. Mehrere Tracks/Segmente, Waypoints, Routen (nur wenn keine Tracks vorhanden), fehlende Höhe/Zeit/Name, Erweiterungen werden ignoriert. Ungültige Koordinaten werden übersprungen und als Warnung gemeldet. Kaputtes XML, fremdes XML oder Dateien ohne Tracks/Routen/Waypoints werfen `GpxError`.
- `src/gpx/stats.ts` – `computeStats(points)`: Distanz (Haversine, Erdradius 6.371.008,8 m, ohne Verbindung zwischen Segmenten), Höhenmeter, Dauer, Durchschnitts-/Höchstgeschwindigkeit, Start-/Endpunkt.
- `src/gpx/export.ts` – `exportGpx(...)`: GPX 1.1, Waypoints vor dem Track, Koordinaten auf 7 Nachkommastellen (ca. 1 cm), Höhe auf 2, Zeiten als ISO-8601 UTC.
- `src/gpx/import.ts` – `prepareImport(xml, dateiname)` erzeugt pro Track einen Entwurf zur Kontrolle; `saveDraft(db, entwurf, {...})` speichert ihn. Waypoints gehören zum ersten Entwurf.
- `src/db/manualTour.ts` – `createManualTour`, `updateTourDetails` sowie Prüfhilfen (`validateDate`, `parseDecimal`, `buildLocation`). Alle Eingaben werden geprüft (Name nicht leer, Datum existiert, Werte nicht negativ, Ort vollständig und im gültigen Bereich).
- `src/ui/toursView.ts` (Tourenliste, Anlegen, Bearbeiten), `src/ui/categoriesPanel.ts` (Kategorien-Verwaltung, eingebettet in `settingsView.ts`).
- `src/dashboard/stats.ts` – `activityTotals`, `placeStats` (reine Funktionen); `src/ui/dashboardView.ts` stellt sie dar.

## Berechnungsannahmen (bewusste Festlegungen, an echten Tracks zu überprüfen)
- Höhenmeter: Änderungen unter 3 m werden als Rauschen ignoriert (`ELEVATION_THRESHOLD_M`).
- GPS-Sprünge: Teilstücke mit mehr als 70 m/s (nur erkennbar mit Zeitstempeln) werden aus Distanz und Höchstgeschwindigkeit herausgenommen; die Rohpunkte bleiben gespeichert.
- Durchschnittsgeschwindigkeit = Distanz / Gesamtdauer (Ende minus Start), nicht Bewegungszeit.
- Höchstgeschwindigkeit nur aus Teilstücken mit mindestens 1 s Abstand.
- Ohne Zeitstempel: Dauer und Geschwindigkeiten 0, Datum-Vorschlag ist das heutige Datum.

## Nicht umgesetzt
- Oberfläche für Import/Export, Dateiauswahl, Teilen unter Android, Kompression großer Tracks, Import anderer Formate (TCX, KML, FIT).
