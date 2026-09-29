# PROJECT_STATE

Stand: 29.09.2026 – Phase 4 abgeschlossen und vom Nutzer bestätigt. Phase 5a (Web-Teil der GPS-Aufnahme) implementiert, CI grün; Phase 5b (Android/Kotlin) als Nächstes.

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

## Funktioniert (Phase 4a/4b, vom Nutzer bestätigt am 29.09.2026)
- Kategorien-Verwaltung (anlegen, Name/Farbe ändern, löschen; bei zugeordneten Touren mit Auswahl der Zielkategorie) im Bereich „Einstellungen“ (`src/ui/categoriesPanel.ts`).
- Neuer Tab „Touren“ (`src/ui/toursView.ts`): Liste (neueste zuerst) mit Kategorienfilter, Tour bearbeiten (Name, Kategorie, Datum, Notizen), Tour löschen, Tour manuell anlegen.
- Manuelle Tour: Quelle `manual`, ohne Track; optional Distanz, Dauer und Ort (Breite/Länge). Nur mit Ort erscheint sie auf der Karte (als Punkt). Logik und Validierung in `src/db/manualTour.ts`, Tests in `tests/manual-tour.test.ts`.
- Bei importierten Touren bleiben berechnete Werte unveränderlich; nur Name, Kategorie, Datum und Notizen sind änderbar.
- Änderung an bestehendem Verhalten: `listTours` sortiert jetzt nach Datum, dann Startzeit (vorher Startzeit zuerst; manuelle Touren ohne Startzeit wären sonst immer ans Ende gerutscht).
- Oberfläche überarbeitet: einheitliches Karten-/Formular-Design (hell/dunkel), Einstellungen in Abschnitten (Karte mit Auswahlkarten Online/Offline, Kategorien mit Farbpunkt, automatischem Speichern und Tourenzahl, Datenschutz), Tourenliste mit deutschem Datum. Im Testbrowser mit Beispieldaten geprüft (Handybreite); Kartenansicht und echte Datenbank dabei nicht beteiligt.
- Tab „Touren“ heißt jetzt „Daten“. Neuer Tab „Dashboard“ (zwischen Daten und Import, `src/ui/dashboardView.ts`, Berechnung in `src/dashboard/stats.ts`, Tests `tests/dashboard.test.ts`): Fahrradtouren und Wandern (Anzahl, km, Zeit, Höhenmeter) sowie Wohnmobil (Anzahl Stellplätze, Top 5 besuchte Stellplätze).
- Festlegungen Dashboard: Grundlage sind die Standardkategorien per fester ID (Fahrradfahren, Wandern, Womo-Stellplatz; Umbenennen ist unschädlich, Löschen zeigt einen Hinweis). Zeit = Summe der Gesamtdauern, Höhenmeter = Summe Aufstieg. Jede Tour in Womo-Stellplatz = ein Besuch; gleicher Name (ohne Groß-/Kleinschreibung) = gleicher Stellplatz.
- Klick auf eine Route oder einen Punkt (Stellplatz) in der Karte öffnet die Details der Tour im Bereich „Daten“ (`ToursView.openTour`); „← Zurück“ führt zur Karte zurück. Die Detailansicht (Kennzahlen, Notizen, Bearbeiten, GPX exportieren, Löschen) ist auch aus der Liste erreichbar. Das frühere Info-Panel der Karte entfällt (Export/Löschen sind in die Details gewandert). Der Kartenausschnitt bleibt beim Zurückkehren erhalten und wird nur bei geänderter Auswahl/Filter neu angepasst.
- Nicht umgesetzt (bewusst): GPX-Wegpunkte (Waypoints) einer Tour erscheinen nicht als eigene Punkte auf der Karte.
- Nicht umgesetzt (bewusst): Ort per Kartenklick wählen, Kategorien umsortieren, Fotos in der Tourbearbeitung (Phase 6).

## Phase 5a: Web-Teil der Aufnahme (implementiert, CI grün: Tests, Typprüfung, Build, Deploy; Oberfläche noch nicht im Browser bestätigt)
- `src/tracking/types.ts`: Schnittstelle `TrackingPlugin` (start, pause, resume, stop, getStatus, getPendingPoints, ackPoints, checkPermissions, requestPermissions, openSettings). Recording-ID = Tour-ID; `seq` des Plugins = `seq` in `trackPoints` (macht die Übernahme idempotent).
- `src/tracking/recorder.ts`: `startRecording` (Tour zuerst anlegen, danach Plugin starten, bei Fehler Tour zurückrollen), `ingestPending` (erst in die Datenbank schreiben, dann bestätigen; serialisiert), `finishRecording`/`finalizeRecording` (Tourwerte aus den Punkten, leere Aufnahme wird verworfen), `recoverRecordings` (Crash-Recovery beim App-Start).
- `src/tracking/webFallback.ts`: Browser-Fallback mit `watchPosition`, meldet `backgroundCapable: false`. `src/tracking/plugin.ts`: wählt unter Capacitor das native Plugin `Tracking`, sonst den Fallback (neue Abhängigkeit `@capacitor/core`).
- `src/ui/recordView.ts`: neuer Tab „Aufnahme“ (Name, Kategorie, Genauigkeitsprofil, Start/Pause/Beenden, Zeit und Punktezahl, Hinweis bei fehlender Hintergrundfähigkeit). Übernahme der Punkte alle 10 s und bei Rückkehr in die App.
- Tests: `tests/tracking.test.ts` (simulierter nativer Puffer: Idempotenz nach fehlgeschlagener Bestätigung, gleichzeitige Aufrufe, Segmente, Wiederherstellung, Web-Fallback).
- Bekannt/bewusst: Eine laufende oder unterbrochene Aufnahme ist eine Tour mit Quelle `recording` ohne Endzeit und erscheint bis zum Abschluss in Liste und Dashboard (0 km). Live-Distanz wird noch nicht angezeigt (nur Zeit und Punktezahl).
- Unsicherheit: Die Profile (Intervall/Distanz/Priorität) sind noch nicht festgelegt oder gemessen; das Kotlin-Plugin setzt sie in 5b, die Werte müssen an echten Geräten geprüft werden.

## Aktuell in Arbeit
- Phase 5b: Android-Projekt (Capacitor, eingecheckt unter `android/`), Kotlin-Plugin `Tracking` mit Foreground Service, native Persistenz (SQLite), CI-Job für Debug-APK.

## Nächste Schritte
1. Phase 5b (siehe oben). Danach Gerätetests durch den Nutzer: gesperrtes Display, mindestens 2 h, zwei Hersteller, App-Kill und Neustart; Ergebnisse in TEST_REPORT.md (Pflicht laut ADR-001).

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
- Bestätigt am 29.09.2026 (Capacitor-8-Update-Anleitung): Node 22, minSdk 24, compileSdk/targetSdk 36, Android Gradle Plugin 8.13.0, Gradle 8.14.3, Kotlin 2.2.20, Android Studio Otter 2025.2.1+. Genaue Patchversionen von `@capacitor/*` liegen nicht vor (npm hier blockiert); `^8.0.0` ist ein Platzhalter, die CI zeigt, was installiert wird.
- Entschieden am 29.09.2026: applicationId `de.hagi089.travelbook`; Android-Ordner wird ins Repository eingecheckt (keine Erzeugung in der CI).

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.
- Trackpunkte liegen getrennt von den Tour-Metadaten (DATA_MODEL.md).
