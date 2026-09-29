# PROJECT_STATE

Stand: 29.09.2026 – Phase 4a CI grün (Handy-Test offen); Phase 4b (Verwaltung, manuelle Touren, Tourenliste) implementiert, CI-Ergebnis siehe unten.

## Repository
- GitHub: Hagi089/Travelbook, Branch `main`. Deployment per GitHub Actions nach GitHub Pages (https://hagi089.github.io/Travelbook/).

## Funktioniert (bestätigt)
- Phase 1: Vite + TypeScript + Vitest, CI-Build und Pages-Deployment laufen grün, Seite ist erreichbar (Platzhaltertext).

## Funktioniert (Phase 2, per CI bestätigt: Tests, Typprüfung, Build, Deploy)
- Phase 2: Dexie-Datenbank (`src/db/`), Kategorien-, Tour-, Trackpunkt-, Foto-Funktionen, Tests in `tests/db.test.ts` (siehe DATA_MODEL.md).
- Tests laufen nur in der CI (npm ist in der Entwicklungsumgebung blockiert). Testergebnisse werden bei Bedarf in TEST_REPORT.md festgehalten.

## Funktioniert (Phase 3, per CI bestätigt: Tests, Typprüfung, Build, Deploy)
- Phase 3: GPX-Parser, -Export, Berechnung der Tourwerte, Import-Entwurf (`src/gpx/`, `tests/gpx.test.ts`), siehe TECHNICAL_DOCUMENTATION.md. Enthält Roundtrip-Tests (Parser/Export und Import → Datenbank → Export → Import) und einen Test mit 50.000 Punkten.

## Implementiert, CI grün (Tests, Typprüfung, Build, Deploy); im Browser/auf dem Handy noch nicht bestätigt
- Phase 4a: Oberfläche (Karte, Import, Einstellungen) in `src/ui/`, Kartenquellen-Schicht in `src/map/` (ADR-002). Karte mit Leaflet und OSM-Online-Kacheln, Kategorienfilter, Tour-Auswahl mit Detailfeld, GPX-Export/Löschen, Import-Dialog mit Kontrolle vor dem Speichern, Kartenmodus-Schalter (Offline deaktiviert), Online-Hinweis.
- Automatisch getestet sind nur Hilfsfunktionen (`tests/ui-helpers.test.ts`), nicht die Oberfläche selbst. Sie wurde noch nicht im Browser oder auf dem Handy angesehen.

## Implementiert, Handy-/Browser-Test offen (Phase 4b)
- Kategorien-Verwaltung (anlegen, Name/Farbe ändern, löschen; bei zugeordneten Touren mit Auswahl der Zielkategorie) im Bereich „Einstellungen“ (`src/ui/categoriesPanel.ts`).
- Neuer Tab „Touren“ (`src/ui/toursView.ts`): Liste (neueste zuerst) mit Kategorienfilter, Tour bearbeiten (Name, Kategorie, Datum, Notizen), Tour löschen, Tour manuell anlegen.
- Manuelle Tour: Quelle `manual`, ohne Track; optional Distanz, Dauer und Ort (Breite/Länge). Nur mit Ort erscheint sie auf der Karte (als Punkt). Logik und Validierung in `src/db/manualTour.ts`, Tests in `tests/manual-tour.test.ts`.
- Bei importierten Touren bleiben berechnete Werte unveränderlich; nur Name, Kategorie, Datum und Notizen sind änderbar.
- Änderung an bestehendem Verhalten: `listTours` sortiert jetzt nach Datum, dann Startzeit (vorher Startzeit zuerst; manuelle Touren ohne Startzeit wären sonst immer ans Ende gerutscht).
- Nicht umgesetzt (bewusst): Ort per Kartenklick wählen, Kategorien umsortieren, Fotos in der Tourbearbeitung (Phase 6).

## Aktuell in Arbeit
- Abnahme von Phase 4a und 4b durch Test auf dem Handy.

## Nächste Schritte
1. Phase 5: Native Android-GPS (Foreground Service, eigenes Kotlin-Plugin, ADR-001), Gerätetests.

## Bekannte Probleme
- Keine bekannten. Node-20-Warnung der GitHub Actions (unkritisch).

## Arbeitsumgebung (für neue Chats)
- In der Claude-Entwicklungsumgebung ist npm blockiert (403): Tests, Typprüfung und Build laufen dort nicht. Nachweis ist ausschließlich der GitHub-Actions-Lauf nach dem Push.
- CI-Status lässt sich ohne Anmeldung über die GitHub-Schnittstelle abfragen: `https://api.github.com/repos/Hagi089/Travelbook/actions/runs?per_page=1` (Job-Schritte über `jobs_url`, Fehlermeldungen über `check-runs/<job-id>/annotations`).
- Das Repository heißt `Hagi089/Travelbook` (GitHub leitet von `travelbook` weiter). Commits gehen direkt auf `main`.
- Oberfläche kann nur der Nutzer auf dem Handy/im Browser prüfen: https://hagi089.github.io/Travelbook/

## Temporäre Lösungen (später zurückbauen)
- Online-Karte: alle Stellen mit `TEMP-ONLINE-MAP` im Code; Rückbau-Liste in ARCHITECTURE.md (ADR-002).
- Export per Browser-Download; unter Android (Capacitor) später durch Datei-Speichern/Teilen ersetzen.

## Offene Entscheidungen
- Schwellen für Höhenrauschen (3 m) und GPS-Sprung (70 m/s) an echten Tracks prüfen.
- Kartenquelle und Offline-Strategie (ARCHITECTURE.md).
- Capacitor- und Android-Zielversionen vor Phase 5 gegen aktuelle Doku bestätigen.

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.
- Trackpunkte liegen getrennt von den Tour-Metadaten (DATA_MODEL.md).
