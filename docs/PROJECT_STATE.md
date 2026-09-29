# PROJECT_STATE

Stand: 29.09.2026 – Phase 0 (Analyse)

## Aktueller Stand
- Repository enthält nur den Projektauftrag (`Projetauftrag`). Kein Code, keine package.json, keine Konfiguration.
- Es gibt nichts zu übernehmen oder zu schützen; Greenfield.

## Funktioniert bereits
- Nichts (noch nichts implementiert).

## In Arbeit
- Analyse und Entwicklungsplan (dieses Dokument, ARCHITECTURE.md).

## Nächste Schritte
1. Entscheidungen in ARCHITECTURE.md bestätigen (Stack, Plugin-Strategie, Kartenkacheln).
2. Phase 1: Projektgerüst (Vite, TypeScript, Vitest, GitHub Actions, PWA-Grundlage).
3. Phase 2: Datenmodell + Dexie + Tests.
4. Phase 3: GPX-Parser/Export + Berechnungen + Tests.
5. Phase 4: Karte, Kategorien, Import-Dialog.
6. Phase 5: Native Android-GPS (Foreground Service) – vor UI-Feinschliff, da Kernrisiko.

## Bekannte Probleme
- Keine (kein Code).

## Offene Entscheidungen
- Kartenquelle und Offline-Strategie (siehe ARCHITECTURE.md).
- Zielversionen (Capacitor, Android compileSdk/targetSdk) – vor Projektstart aktuell recherchieren.

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.

## Update Phase 1 (Gerüst)
- Angelegt: package.json, tsconfig, vite.config.ts, index.html, manifest, src/main.ts, src/platform.ts, 1 Smoke-Test, GitHub-Actions-Workflow, README, .gitignore.
- **Ungetestet:** `npm install`, `npm test`, `npm run build` wurden nicht ausgeführt (Sandbox ohne Netz). Abhängigkeitsversionen sind nicht gegen die Registry verifiziert.
- Noch nicht vorhanden: Service Worker, Icons, Capacitor, Dexie, Leaflet.
