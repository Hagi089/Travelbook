# TECHNICAL_DOCUMENTATION (Stand: Phase 5a)

## Module
- `src/db/` – lokale Datenbank (siehe DATA_MODEL.md).
- `src/gpx/parse.ts` – `parseGpx(xml)`: GPX 1.0/1.1 mit `fast-xml-parser`. Mehrere Tracks/Segmente, Waypoints, Routen (nur wenn keine Tracks vorhanden), fehlende Höhe/Zeit/Name, Erweiterungen werden ignoriert. Ungültige Koordinaten werden übersprungen und als Warnung gemeldet. Kaputtes XML, fremdes XML oder Dateien ohne Tracks/Routen/Waypoints werfen `GpxError`.
- `src/gpx/stats.ts` – `computeStats(points)`: Distanz (Haversine, Erdradius 6.371.008,8 m, ohne Verbindung zwischen Segmenten), Höhenmeter, Dauer, Durchschnitts-/Höchstgeschwindigkeit, Start-/Endpunkt.
- `src/gpx/export.ts` – `exportGpx(...)`: GPX 1.1, Waypoints vor dem Track, Koordinaten auf 7 Nachkommastellen (ca. 1 cm), Höhe auf 2, Zeiten als ISO-8601 UTC.
- `src/gpx/import.ts` – `prepareImport(xml, dateiname)` erzeugt pro Track einen Entwurf zur Kontrolle; `saveDraft(db, entwurf, {...})` speichert ihn. Waypoints gehören zum ersten Entwurf.
- `src/db/manualTour.ts` – `createManualTour`, `updateTourDetails` sowie Prüfhilfen (`validateDate`, `parseDecimal`, `buildLocation`). Alle Eingaben werden geprüft (Name nicht leer, Datum existiert, Werte nicht negativ, Ort vollständig und im gültigen Bereich).
- `src/ui/toursView.ts` (Tourenliste, Anlegen, Bearbeiten), `src/ui/categoriesPanel.ts` (Kategorien-Verwaltung, eingebettet in `settingsView.ts`).
- `src/dashboard/stats.ts` – `activityTotals`, `placeStats` (reine Funktionen); `src/ui/dashboardView.ts` stellt sie dar.
- `src/tracking/` – GPS-Aufnahme (Phase 5a), siehe unten.

## GPS-Aufnahme (Phase 5a)
Ablauf: Nutzer startet → `startRecording` legt die Tour an (Quelle `recording`, `endTime = null`) und startet das Plugin mit `recordingId = tour.id`. Das Plugin schreibt Punkte nativ in einen Puffer und vergibt `seq` (ab 0) und `segment` (nach jedem Pausieren um 1 erhöht). Die Oberfläche holt Punkte per `getPendingPoints`, schreibt sie mit `bulkPut` unter `[tourId+seq]` und bestätigt sie erst danach mit `ackPoints`. Beim Beenden: `stop`, restliche Punkte übernehmen, `computeStats` über alle Punkte, Tour aktualisieren.
- Ausfallsicherheit: Bricht die App zwischen Schreiben und Bestätigen ab, liefert das Plugin dieselben Punkte erneut; sie überschreiben sich selbst. `recoverRecordings` läuft beim App-Start: laufende Aufnahme → Punkte übernehmen, weiterlaufen lassen; Tour mit Quelle `recording` und ohne Endzeit, die nicht mehr läuft → verbliebene Punkte holen und abschließen (ohne Punkte: verwerfen).
- Web-Fallback (`webFallback.ts`): nur Arbeitsspeicher-Puffer, nicht hintergrundfähig, Oberfläche zeigt einen Warnhinweis. Bei Neuladen der Seite gehen nur die noch nicht übernommenen Punkte (höchstens ca. 10 s) verloren; der Rest wird als unterbrochene Aufnahme gerettet.
- Native Seite (Kotlin-Plugin `Tracking`): Phase 5b.
 (bewusste Festlegungen, an echten Tracks zu überprüfen)
- Höhenmeter: Änderungen unter 3 m werden als Rauschen ignoriert (`ELEVATION_THRESHOLD_M`).
- GPS-Sprünge: Teilstücke mit mehr als 70 m/s (nur erkennbar mit Zeitstempeln) werden aus Distanz und Höchstgeschwindigkeit herausgenommen; die Rohpunkte bleiben gespeichert.
- Durchschnittsgeschwindigkeit = Distanz / Gesamtdauer (Ende minus Start), nicht Bewegungszeit.
- Höchstgeschwindigkeit nur aus Teilstücken mit mindestens 1 s Abstand.
- Ohne Zeitstempel: Dauer und Geschwindigkeiten 0, Datum-Vorschlag ist das heutige Datum.

## Nicht umgesetzt
- Oberfläche für Import/Export, Dateiauswahl, Teilen unter Android, Kompression großer Tracks, Import anderer Formate (TCX, KML, FIT).
