# PROJECT_STATE

Stand: 29.09.2026 – Phase 3 (GPX, Berechnungen) abgeschlossen, CI grün.

## Repository
- GitHub: Hagi089/Travelbook, Branch `main`. Deployment per GitHub Actions nach GitHub Pages (https://hagi089.github.io/Travelbook/).

## Funktioniert (bestätigt)
- Phase 1: Vite + TypeScript + Vitest, CI-Build und Pages-Deployment laufen grün, Seite ist erreichbar (Platzhaltertext).

## Funktioniert (Phase 2, per CI bestätigt: Tests, Typprüfung, Build, Deploy)
- Phase 2: Dexie-Datenbank (`src/db/`), Kategorien-, Tour-, Trackpunkt-, Foto-Funktionen, Tests in `tests/db.test.ts` (siehe DATA_MODEL.md).
- Tests laufen nur in der CI (npm ist in der Entwicklungsumgebung blockiert). Testergebnisse werden bei Bedarf in TEST_REPORT.md festgehalten.

## Funktioniert (Phase 3, per CI bestätigt: Tests, Typprüfung, Build, Deploy)
- Phase 3: GPX-Parser, -Export, Berechnung der Tourwerte, Import-Entwurf (`src/gpx/`, `tests/gpx.test.ts`), siehe TECHNICAL_DOCUMENTATION.md. Enthält Roundtrip-Tests (Parser/Export und Import → Datenbank → Export → Import) und einen Test mit 50.000 Punkten.

## Aktuell in Arbeit
- Nichts; Phase 4 folgt.

## Nächste Schritte
1. Phase 4: Karte (Leaflet), Kategorien-UI, Import-Dialog.
2. Phase 5: Native Android-GPS (Foreground Service, eigenes Kotlin-Plugin, ADR-001), Gerätetests.

## Bekannte Probleme
- Keine bekannten. Node-20-Warnung der GitHub Actions (unkritisch).

## Offene Entscheidungen
- Schwellen für Höhenrauschen (3 m) und GPS-Sprung (70 m/s) an echten Tracks prüfen.
- Kartenquelle und Offline-Strategie (ARCHITECTURE.md).
- Capacitor- und Android-Zielversionen vor Phase 5 gegen aktuelle Doku bestätigen.

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.
- Trackpunkte liegen getrennt von den Tour-Metadaten (DATA_MODEL.md).
