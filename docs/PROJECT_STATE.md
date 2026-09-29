# PROJECT_STATE

Stand: 29.09.2026 – Phase 2 (Datenmodell) abgeschlossen, CI grün.

## Repository
- GitHub: Hagi089/Travelbook, Branch `main`. Deployment per GitHub Actions nach GitHub Pages (https://hagi089.github.io/Travelbook/).

## Funktioniert (bestätigt)
- Phase 1: Vite + TypeScript + Vitest, CI-Build und Pages-Deployment laufen grün, Seite ist erreichbar (Platzhaltertext).

## Funktioniert (Phase 2, per CI bestätigt: Tests, Typprüfung, Build, Deploy)
- Phase 2: Dexie-Datenbank (`src/db/`), Kategorien-, Tour-, Trackpunkt-, Foto-Funktionen, Tests in `tests/db.test.ts` (siehe DATA_MODEL.md).
- Tests laufen nur in der CI (npm ist in der Entwicklungsumgebung blockiert). Testergebnisse werden bei Bedarf in TEST_REPORT.md festgehalten.

## Aktuell in Arbeit
- Nichts; Phase 3 folgt.

## Nächste Schritte
1. Phase 3: GPX-Parser und -Export, Berechnung der Tourwerte (Distanz, Höhenmeter, Geschwindigkeit, GPS-Sprung-Markierung), Tests inkl. Roundtrip.
2. Phase 4: Karte (Leaflet), Kategorien-UI, Import-Dialog.
3. Phase 5: Native Android-GPS (Foreground Service, eigenes Kotlin-Plugin, ADR-001), Gerätetests.

## Bekannte Probleme
- Keine bekannten. Node-20-Warnung der GitHub Actions (unkritisch).

## Offene Entscheidungen
- Kartenquelle und Offline-Strategie (ARCHITECTURE.md).
- Capacitor- und Android-Zielversionen vor Phase 5 gegen aktuelle Doku bestätigen.

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.
- Trackpunkte liegen getrennt von den Tour-Metadaten (DATA_MODEL.md).
