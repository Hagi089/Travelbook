# PROJECT_STATE

Stand: 29.09.2026 – Phasen 1–6, Material-3-Oberfläche und Phase 7a (Suche/Filter, neues App-Icon, auf dem Gerät bestätigt) und Phase 7b (Länder, auf dem Gerät positiv getestet) umgesetzt. Auf dem Gerät bestätigt: Oberfläche, Profil „Normal“ (2 s / 3 m), Fotos in der Detailansicht. Ungetestet auf dem Gerät: GPX-Export nach FileProvider-Fix (Fehler behoben, Bestätigung fehlt), Fotos im Import-Dialog, Live-Distanz, Ausblenden laufender Aufnahmen, Langzeit-Aufnahme (TEST_REPORT.md).

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
- Bekannt/bewusst: Eine laufende oder unterbrochene Aufnahme ist eine Tour mit Quelle `recording` ohne Endzeit; sie wird in Liste, Karte und Dashboard ausgeblendet (siehe „Vorarbeiten vor Phase 6“).
- Unsicherheit: Die Profile (Intervall/Distanz/Priorität) sind noch nicht festgelegt oder gemessen; das Kotlin-Plugin setzt sie in 5b, die Werte müssen an echten Geräten geprüft werden.

## Phase 5b: Android (implementiert; CI baut die Debug-APK, auf keinem Gerät getestet)
- Capacitor-Android-Projekt unter `android/` (App-ID `de.hagi089.travelbook`), Kotlin-Plugin `Tracking` (`TrackingStore` SQLite-Puffer, `TrackingService` Foreground Service Typ location, `TrackingPlugin`), Workflow `.github/workflows/android.yml` (Artifact `travelbook-debug-apk`, ca. 4,5 MB). Details: ARCHITECTURE.md (Umsetzung ADR-001), TECHNICAL_DOCUMENTATION.md.
- Nachgewiesen nur: Gradle-Build und Kompilierung in der CI. NICHT nachgewiesen: Start der App auf dem Handy, Berechtigungsdialoge, Aufnahme bei gesperrtem Display, Wiederaufnahme, Verhalten je Hersteller.

## UI-Überarbeitung nach Material Design 3 (29.09.2026; lokal im Browser mit Screenshots und Ablauftests geprüft, auf dem Handy noch nicht bestätigt)
- Navigation: Navigationsleiste mit 4 Zielen (Karte, Daten, Dashboard, Einstellungen), obere App-Leiste mit Titel, Zurück-Pfeil (nur auf Unterseiten) und Hell/Dunkel-Schalter. „Aufnahme“ und „Import“ sind keine Tabs mehr, sondern Unterseiten von „Daten“: Der Extended FAB „Neue Tour“ (nur in der Datenliste) öffnet ein Bottom Sheet mit „Aufnahme starten“ (bzw. „Laufende Aufnahme öffnen“), „GPX importieren“ und „Manuell anlegen“. Läuft eine Aufnahme, zeigt ein Banner unter der App-Leiste auf allen Seiten „Aufnahme läuft · Zeit“; Antippen öffnet die Aufnahme.
- Android-Zurück-Taste: Unterseiten (Aufnahme, Import, Tour-Details, Formulare) legen einen History-Eintrag an; die Systemtaste löst die Zurück-Aktion aus (`src/ui/chrome.ts`). Verlässt man eine Unterseite über die Navigationsleiste, bleibt ein Eintrag stehen und kostet einmal einen zusätzlichen Zurück-Druck (bewusst einfach gehalten).
- Theme: `src/ui/theme.css` (Farbrollen `--md-sys-color-*` hell und dunkel, Formen), `src/ui/theme.ts` (System/Hell/Dunkel, gespeichert unter dem `localStorage`-Schlüssel `gpx-tracker.theme`), Inline-Skript in `index.html` gegen Aufblitzen, segmentierte Schaltfläche unter Einstellungen → Darstellung. Dunkle Karte: OSM-Kacheln werden per CSS-Filter invertiert, Routen bleiben unverändert.
- Komponenten: `src/ui/styles.css` (Buttons, Textfelder, Karten, Chips, Liste, Navigationsleiste, FAB, Bottom Sheet, Snackbar, Banner), `src/ui/icons.ts` (Google Material Icons, Apache 2.0), `src/ui/sheet.ts`, `src/ui/chrome.ts`. Die Überschriften `h2` in den Ansichten entfallen; der Titel steht in der App-Leiste.
- Aus dem Tauchlogbuch übernommen: feste untere Navigation, Hell/Dunkel-Schalter oben rechts, „+“-Aktion für Neues, Kennzahl-Kacheln. Farben und Formen folgen bewusst Material 3 statt dem Blau des Tauchlogbuchs; das Grün der App bleibt.
- Unsicherheit/Abweichungen: (1) m3.material.io ließ sich nicht als Text lesen (JavaScript-Seite); die Umsetzung folgt den Token-Namen aus Googles Material-Web-Repository und meiner Kenntnis der M3-Spezifikation. (2) Farbwerte sind von Hand aus einem Grün-Startton (#386A20) gesetzt, nicht mit dem Material Theme Builder erzeugt; Kontraste nicht per Werkzeug gemessen. (3) Textfelder haben das Label über dem Feld statt schwebend im Rahmen (M3-Abweichung, spart den Umbau der Formulare). (4) Lösch-Bestätigungen nutzen weiter den Browser-Dialog `confirm`, keinen M3-Dialog. (5) Nicht auf einem echten Android-Gerät geprüft: Navigationsleiste bei schmalen Displays (die Beschriftung „Einstellungen“ ist bei 390 px knapp), Zurück-Taste, Tastatur über dem FAB.
- Prüfung: `tests/theme.test.ts` (CI). Zusätzlich lokal (nicht im Repository): App mit In-Memory-Datenbankersatz in Chromium, Screenshots hell/dunkel bei 390 px und 20 Ablaufprüfungen (Theme, Zurück, Sheet, Banner); die Karte war dabei ein Platzhalter.

## Gerätetest-Rückmeldung (29.09.2026)
- Neue Oberfläche (Material 3): Nutzer ist zufrieden.
- Befund: GPS-Erhebung im Profil „Normal“ zu gering. Ursache im Code: `TrackingService.startUpdates` verwendete für „normal“ 5 s Intervall / 5 m Mindestdistanz (Annahme, nie gemessen). Geändert: Normal 2 s / 3 m, Hoch 1 s / 0 m; „Akku sparen“ unverändert. Nur die Kotlin-Datei betroffen (Web-Fallback ignoriert die Frequenz, Datenmodell und Schnittstelle unverändert).
- Unsicherheit: Ob „zu gering“ die Punktedichte oder die Positionsgenauigkeit (Fehler in m) meint, ist nicht geklärt; die Änderung adressiert die Punktedichte. Neue Werte sind Annahmen und am Gerät zu prüfen (Punktezahl/Kilometer, Rauschen im Stand, Akku). Falls die Positionsgenauigkeit gemeint ist: nächster Schritt wäre ein Filter auf `accuracy` (z. B. Punkte > 30 m verwerfen) bzw. `setWaitForAccurateLocation`.

- Vom Nutzer bestätigt (29.09.2026): Normal 2 s / 3 m passt.

## Vorarbeiten vor Phase 6 (29.09.2026, Schritt 4 der Liste; per CI zu bestätigen, auf dem Gerät ungetestet)
- Laufende/unterbrochene Aufnahmen (Quelle `recording`, keine Endzeit) erscheinen nicht mehr in Datenliste, Karte und Dashboard: `listTours` blendet sie standardmäßig aus (`includeOpenRecordings: true` zeigt sie). Wiederherstellung (`recoverRecordings`) nutzt `db.tours` direkt und ist nicht betroffen. Test in `tests/tracking.test.ts`.
- Live-Distanz: Aufnahmeansicht zeigt „Strecke“ (`computeStats` über die übernommenen Punkte, Aktualisierung alle 10 s und bei Rückkehr in die App; neuester Punkt kann bis zu 10 s fehlen).
- GPX-Export unter Android: `src/ui/download.ts` schreibt die Datei mit `@capacitor/filesystem` in den App-Cache und öffnet das Android-Teilen-Menü (`@capacitor/share`); im Browser bleibt der normale Download. Neue Abhängigkeiten `@capacitor/filesystem ^8.1.3`, `@capacitor/share ^8.0.2` (Versionen per npm-Registry geprüft, peer `@capacitor/core >=8`). Gerätetest 29.09.2026: Fehler „Couldn't find meta-data for provider with authority de.hagi089.travelbook.fileprovider“ – im selbst erstellten Android-Projekt fehlte der `FileProvider`. Behoben durch `<provider>` in `AndroidManifest.xml` und `res/xml/file_paths.xml` (nur App-Cache freigegeben); Wirkung nach neuer APK erneut zu prüfen. Unsicherheit: Verhalten auf dem Gerät (Teilen-Menü, Dateiname, „Speichern unter“) nicht bestätigt; kein `package-lock.json` im Repository.

## Phase 6 (29.09.2026): Fotos in der Tour-Detailansicht – vom Nutzer auf dem Gerät bestätigt („funktioniert“)
- Bereits vorhanden: Notizfeld (Bearbeiten), Detailansicht, `addPhoto`/`listPhotos`/`deletePhoto` mit Grenze 3 Fotos (Phase 2).
- Neu: `src/photos/resize.ts` (`preparePhoto`: EXIF-Ausrichtung anwenden, längste Kante max. 1600 px, JPEG Qualität 0,8; EXIF-Metadaten inkl. GPS entfallen durch die Neukodierung; `fitWithin` getestet), `src/ui/photosSection.ts` (Abschnitt „Fotos“ mit Vorschau, „+ Foto“ über die Systemauswahl `<input type=file accept=image/*>`, Entfernen mit Rückfrage, Vollbildansicht per Antippen), Einbindung in `detail()` in `src/ui/toursView.ts`, Stile am Ende von `src/ui/styles.css`, Tests `tests/photos.test.ts`.
- Unsicherheiten: (1) Ob die Systemauswahl in der Android-WebView Kamera und Galerie anbietet und ohne zusätzliche CAMERA-Berechtigung funktioniert, ist ungeprüft. (2) `createImageBitmap`/Canvas sind nicht automatisch getestet (nur Browser/WebView); HEIC-Fotos können je nach WebView scheitern (Fehlermeldung wird angezeigt). (3) Fotos im Import-Dialog (`createStagedPhotos` in `src/ui/photosSection.ts`, Übernahme nach dem Speichern der Tour; schlägt das Speichern der Fotos fehl, bleibt die Tour erhalten und der Nutzer wird auf die Detailansicht verwiesen): CI-grün abzuwarten, Gerät ungetestet. Nicht im Bearbeiten-Formular (Fotos dort nur in der Detailansicht) und nicht bei manuell angelegten Touren/Aufnahmen (dort ebenfalls über die Detailansicht). (4) Fotos sind seit Phase 8a im Backup (nicht im GPX).

## Phase 7a (29.09.2026): Suche und Filter – implementiert, CI grün (Tests, Typprüfung, Build, Deploy, Debug-APK), auf dem Gerät ungetestet
- Umfang mit dem Nutzer abgestimmt: 7a = Suche + Zeitraum, 7b = Länderzuordnung (folgt nach Freigabe von 7a). „Letzte Touren“ = 10 Touren.
- `src/db/tourSearch.ts` (`queryTours`, `tourYears`), Einbindung in `src/ui/toursView.ts` (Suchfeld, Auswahl Zeitraum, Anzeige „N von M Touren“), Stil `.toolbar input[type=text]` in `styles.css`, Tests `tests/tour-search.test.ts`. Kein Schema-Umbau, `listTours` unverändert, Karte unverändert (nur Kategorienfilter). Details: TECHNICAL_DOCUMENTATION.md.
- Prüfung: Typprüfung der neuen Datei und 15 Tests lokal mit Ersatzrunner grün; volle Typprüfung/Vitest/Build nur in der CI (npm blockiert); Oberfläche nicht im Browser angesehen.
- Bewusste Festlegungen: Zeitraum-Auswahl ist ein einziges Feld (Alle / Letzte 10 / Jahr), keine Kombination Jahr + Letzte 10; Jahre stammen aus den Touren der gewählten Kategorie. Suche ohne Umlaut-/Akzent-Vereinfachung („o“ findet kein „ö“).
- App-Icon: neues Icon des Nutzers (siehe TECHNICAL_DOCUMENTATION.md „App-Icon“). Vorher gab es weder Launcher-Icons noch PWA-Icons. Unsicherheit: Hintergrund (eingebranntes Schachbrett) wurde automatisch entfernt und nur visuell geprüft; Aussehen auf dem Launcher (adaptiv/rund/Themed) ungetestet.

## Phase 7a auf dem Gerät bestätigt (29.09.2026)
- Nutzer: „alles funktioniert“ (Suche, Zeitraumfilter, neues Icon), danach Freigabe für Phase 7b.

## Phase 7b (29.09.2026): Länderzuordnung – implementiert, CI grün (Tests inkl. Datenbank-Tests, Typprüfung, Build, Deploy, Debug-APK), auf dem Gerät ungetestet
- Neu: `src/geo/` (`countries.ts`: Punkt-in-Polygon, Küsten-Umkreis 20 km, Ländernamen über `Intl.DisplayNames`; `index.ts`: Laden der Grenzdaten bei Bedarf; `countryData.ts`: erzeugte Daten, 236 Codes, ca. 260 KB), `scripts/build-countries.py` (Erzeugung aus Natural Earth 50m, Quelle und Parameter in TECHNICAL_DOCUMENTATION.md), `src/db/country.ts` (`assignCountries`, `setTourCountry`), Felder `countryCode`/`countryManual` an `Tour`.
- **Abweichung vom Vorschlag:** keine Schema-Version 2 und keine Migration. Die neuen Felder sind optional und nicht indiziert; bestehende Touren erhalten das Land beim nächsten Öffnen der Datenliste bzw. Details (`assignCountries`, ändert `updatedAt` nicht). Grund: kein Eingriff in bestehende Daten nötig, geringeres Risiko.
- Oberfläche (`src/ui/toursView.ts`): Land in Liste und Details, Länderfilter (nur sichtbar, wenn Touren ein Land haben), Auswahl „Land“ im Bearbeiten-Formular (Automatisch / Kein Land / Liste). `src/db/tourSearch.ts`: Filter `country`, `tourCountryCodes`. `src/db/manualTour.ts`: Ortsänderung setzt ein automatisches Land zur Neuberechnung zurück.
- Prüfung: Ländererkennung mit 27 Fällen und die Suchtests lokal mit Ersatzrunner grün (u. a. Enklaven San Marino/Lesotho, Kosovo, Nordzypern, Kanaren, Meer = null). Datenbank-Tests (`tests/country.test.ts`, Nachberechnung/Korrektur) liefen nur in der CI (Dexie hier nicht installierbar) und sind dort grün. Oberfläche nicht im Browser angesehen.
- Unsicherheiten: (1) Vatikan und Gibraltar sind in den 50m-Daten kein eigenes Land (fallen an IT/ES). (2) Grenzen auf ca. 3 km vereinfacht: nahe Grenzen/Küsten Fehler möglich, per Korrektur behebbar. (3) Nur der Startpunkt zählt. (4) `Intl.DisplayNames` liefert deutsche Namen nur, wenn die Android-WebView es unterstützt; sonst erscheint der Code. (5) Im Browser ohne Netz kann der Chunk der Grenzdaten fehlen, bis Phase 8 (PWA-Offline) umgesetzt ist; die Android-App enthält alles lokal. (6) Weltkarte und Dashboard nutzen das Land noch nicht (mögliche Erweiterung: „Besuchte Länder“).

## Phase 7b auf dem Gerät (29.09.2026)
- Nutzer: „die Testergebnisse sind positiv“ (Länderzuordnung, Länderfilter, Korrektur). Welche der älteren offenen Gerätetests (GPX-Export, Live-Distanz, Ausblenden laufender Aufnahmen, Fotos im Import-Dialog, Langzeit-Aufnahme) damit abgedeckt sind, wurde nicht einzeln bestätigt; sie bleiben in TEST_REPORT.md offen, bis der Nutzer sie einträgt.

## Phase 8: Umfang (mit dem Nutzer abgestimmt, 29.09.2026)
- 8a Backup/Wiederherstellen als ZIP inkl. Fotos: Ersetzen **und** Zusammenführen, Einstellungen im Backup. 8b PWA-Offline (Service Worker). 8c Offline-Karte Stufe 1 (Welt-Grundkarte aus den gebündelten Ländergrenzen, danach Rückbau `TEMP-ONLINE-MAP`); Stufe 2 (regionale PMTiles-Karten) wird später getrennt entschieden.

## Phase 8a (29.09.2026): Backup und Wiederherstellen – implementiert; CI-Ergebnis siehe unten, auf dem Gerät ungetestet
- Neu: `src/backup/` (zip, format, export, import, settings), `src/ui/backupPanel.ts` (Einstellungen → Sicherung), `downloadBlob` in `src/ui/download.ts`, `navigator.storage.persist()` in `src/main.ts`, `SEEDED_KEY` in `src/db/categories.ts` exportiert (sonst keine Änderung am bestehenden Verhalten, kein Schema-Umbau). Format und Regeln: DATA_MODEL.md, Ablauf: TECHNICAL_DOCUMENTATION.md.
- Tests: `tests/zip.test.ts`, `tests/backup-format.test.ts`, `tests/backup.test.ts` (Roundtrip Ersetzen/Zusammenführen, Fotos byte-genau, 50.000 Punkte, beschädigte/fremde/neuere Dateien, laufende Aufnahme). Lokal geprüft: ZIP-Modul (auch mit Pythons `zipfile`) und Formatprüfung (11 Tests mit Ersatzrunner) sowie Typprüfung der neuen Dateien gegen eine handgeschriebene Dexie-Attrappe. Die Datenbank-Tests laufen erst in der CI.
- Unsicherheiten: (1) Ersetzen ist nicht in einer einzigen Transaktion (siehe TECHNICAL_DOCUMENTATION.md). (2) Unter Android ist der Weg Cache-Datei → Teilen-Menü für große Dateien ungetestet; Speicherbedarf bei sehr großen Backups (viele Fotos) nicht gemessen. (3) Dateiauswahl (`<input type=file>`) für ZIP in der Android-WebView ungetestet. (4) Nach dem Wiederherstellen wird die App neu geladen, damit alle Ansichten frische Daten zeigen. (5) Lösch-Rückfrage bei „Ersetzen“ nutzt weiter `confirm`.

## Phase 8b (29.09.2026): PWA-Offline – implementiert, auf dem Gerät/im Browser ungetestet
- Neu: `scripts/sw.template.js` + Vite-Plugin in `vite.config.ts` (erzeugt `dist/sw.js`), `src/pwa/register.ts`, `src/ui/updateNotice.ts`, Aufruf in `src/main.ts`; Test `tests/sw.test.ts`. Beschreibung: TECHNICAL_DOCUMENTATION.md. Kein Schema- oder Datenumbau; ohne Service-Worker-Unterstützung läuft die App wie bisher.
- Entscheidung: eigener kleiner Service Worker statt `vite-plugin-pwa`, weil die Kompatibilität mit Vite 6 hier nicht prüfbar war (npm blockiert) und der Umfang klein ist.
- Behebt die Unsicherheit aus 7b (5): Der Chunk mit den Ländergrenzen wird mitgespeichert.
- Unsicherheiten: (1) Echter Ablauf im Browser (erster Start online, danach Flugmodus, Update-Hinweis) ungetestet; Prüffälle 25–27 in TEST_REPORT.md. (2) Kartenkacheln bleiben online-only, bis 8c umgesetzt ist. (3) Der Plugin-Teil lief lokal nur gegen ein Attrappen-Verzeichnis, der echte Build läuft in der CI.

## Phase 8c Stufe 1 (29.09.2026): Offline-Weltkarte – implementiert, Darstellung nicht gesehen
- Offline-Modus in den Einstellungen wählbar: grobe Weltkarte aus den Ländergrenzen (kein Kachel-Download, keine Lizenzfrage). Dateien und Verhalten: TECHNICAL_DOCUMENTATION.md, Entscheidungsstand: ARCHITECTURE.md (Abschnitt „Stand Phase 8c“).
- Geändert: `src/map/tileSource.ts` (`getMapBackground`, `OFFLINE_MAPS_AVAILABLE` entfernt), `src/map/mapMode.ts` (Offline-Wahl wird nicht mehr ignoriert), `src/ui/mapView.ts`, `src/ui/settingsView.ts`, `src/ui/onlineNotice.ts` (nur Text), `src/ui/styles.css`; neu `src/map/countryShapes.ts`, `src/map/countryLayer.ts`, `tests/country-shapes.test.ts`; Test in `tests/ui-helpers.test.ts` angepasst. Online-Karte und alle übrigen Funktionen unverändert.
- Rückbau `TEMP-ONLINE-MAP`: teilweise (Begründung in ARCHITECTURE.md), Markierung bleibt an Online-Hinweis und OSM-Notiz.
- Unsicherheiten: (1) Optik und Geschwindigkeit der Canvas-Ebene auf Handy und Browser ungesehen (Prüffälle 28–30). (2) Bei starkem Zoom nur grobe Flächen. (3) Stufe 2 (Regionalkarten) ist nicht umgesetzt und braucht eine eigene Entscheidung.

## Gesamtprüfung des Projekts (29.09.2026, nach Phase 8c Stufe 1)
Ganzer Code geprüft (Datenbank, GPX, Aufnahme TS + Kotlin, Oberfläche, Länder, Backup, Service Worker, Karte, CI). Behoben (nur das Nötige, kein Umbau):
1. **Offline-Karte konnte unbrauchbar werden** (`src/ui/mapView.ts`, `src/map/tileSource.ts`): Ohne Kachelebene hat Leaflet keine höchste Zoomstufe; `fitBounds` auf eine einzelne Position (z. B. Stellplatz ohne Track, Kategorienfilter mit nur einem Punkt) ergab Zoom „unendlich“. Jetzt feste Obergrenze `MAP_MAX_ZOOM` = 19 (wie OSM, online also unverändert). Test in `tests/ui-helpers.test.ts`.
2. **Online-Kacheln wurden bei jedem Öffnen der Karte neu angelegt** (`mapView.ts`, bestand seit Phase 4): Flackern und unnötige Abrufe bei OSM. Die Kachelebene bleibt jetzt stehen, solange der Modus „online“ bleibt.
3. **Update-Hinweis ohne Wirkung in der ersten Sitzung** (`src/pwa/register.ts`): Wurde die Seite anfangs ohne Service Worker geladen und kam in derselben Sitzung eine neue Version, lud „Neu laden“ die Seite nicht neu (alte Oberfläche lief mit neuem Cache weiter). Jetzt wird nach „Neu laden“ immer neu geladen; beim allerersten Installieren weiterhin nicht.
4. **Snackbar entfernte den Hinweis „Neue Version verfügbar“** (`src/ui/sheet.ts`): z. B. die Meldung „unterbrochene Aufnahme gerettet“ löschte den stehenden Update-Hinweis. Jetzt nur noch frühere kurze Meldungen ersetzt.
5. **„Letztes Backup“ wurde auch bei abgebrochenem Teilen-Menü aktualisiert** (`src/ui/download.ts`, `src/ui/backupPanel.ts`): falsche Sicherheit. `downloadBlob` meldet jetzt, ob das Teilen-Menü ohne Auswahl geschlossen wurde; dann Hinweis statt Erfolgsmeldung. Unsicherheit: `@capacitor/share` meldet „abgebrochen“ laut Quellcode nur, wenn kein Ziel gewählt und die App nicht verlassen wurde; ob einzelne Ziele fälschlich als Abbruch gelten, ist am Gerät zu prüfen (Fall 31).
6. **Kategorienfarbe aus Backup-Dateien ungeprüft in `style`-Attributen** (`src/backup/format.ts`): Eine manipulierte Datei konnte beliebiges CSS einschleusen (z. B. Nachladen fremder Adressen). Jetzt nur `#rrggbb`, sonst Ersatzfarbe. Test in `tests/backup-format.test.ts`.

Zweiter Durchgang (30.09.2026, nachts, eigenständig): App aus den Quellen gebaut (Leaflet, Dexie, fast-xml-parser von GitHub; Capacitor als „Web“ ersetzt) und in Chromium (390 px) durchgespielt: GPX-Import (2 Tracks, Waypoint, Foto im Import-Dialog), manuelle Tour, Suche, Details, Fotos + Vollbild, GPX-Export, Dashboard, Karte online/offline hell/dunkel, Klick auf Track in der Offline-Karte, Backup erstellen → Ersetzen in leerem Browser, Zusammenführen zweimal (keine Doppelten), fremde ZIP abgelehnt, Aufnahme im Browser mit simuliertem GPS, Android-Zurück (history.back), Service Worker: Offline-Start, Tour offline anlegen (Land offline erkannt), Update-Hinweis. Zusätzlich behoben:
7. **Karte: gewählter Kategorie-Chip verschwand** (`mapView.ts`): Nach Antippen eines Chips weiter rechts sprang die Chipleiste an den Anfang zurück. Scrollposition bleibt jetzt erhalten.
8. **Einzelpunkt wurde auf Zoom 19 eingepasst** (`mapView.ts`, `tileSource.ts`): ohne Umgebung. Einpassen jetzt höchstens bis Zoom 15 (`FIT_MAX_ZOOM`); von Hand weiter hineinzoomen bleibt möglich.
9. **Karte las bei jedem Öffnen alle Trackpunkte neu** (`mapView.ts`): gemessen 100 Touren à 3000 Punkte ≈ 1,2 s im Desktop-Browser bei jedem Öffnen. Jetzt Zwischenspeicher je Tour (ID + `updatedAt`); erneutes Öffnen < 0,1 s. Erstes Öffnen nach App-Start unverändert.
10. **Foto-Vollbild blieb nach Zurück-Taste stehen** (`photosSection.ts`): Die Detailansicht schloss sich, das Vollbild lag danach über der Liste. Schließt sich jetzt mit.
- CI grün für beide Korrektur-Commits (`cfded26`, `161b71c`): Vitest inkl. Datenbank-Tests, strenge Typprüfung, Build, Pages-Deploy, Debug-APK. Gerätetests (Fälle 31–35) offen.
- Fix 3 (Update-Hinweis) im Browser nachgewiesen: mit altem `register.ts` lädt „Neu laden“ in der ersten Sitzung nicht neu, mit neuem schon.

Geprüft, ohne Handlungsbedarf bzw. bewusst nicht geändert (Hinweise für später):
- Browser-Aufnahme: Verweigert der Nutzer die Standortabfrage erst beim Start, läuft die Aufnahme ohne Punkte weiter (keine Meldung); beim Beenden wird sie verworfen. Nur Browser-Notlösung, Android nicht betroffen.
- Import-Dialog behält die zuletzt gezeigten Entwürfe beim erneuten Öffnen (gespeicherte sind gesperrt).
- Ein GPX-Import derselben Datei zweimal legt die Tour doppelt an (keine Duplikaterkennung).
- Bottom Sheet „Neue Tour“: Android-Zurück schließt die App statt des Sheets (kein History-Eintrag).
- Die Oberflächen-Prüfung lief im Desktop-Chromium, nicht in der Android-WebView; OSM-Kacheln waren in der Testumgebung gesperrt.
- Karte lädt bei jedem Öffnen alle Trackpunkte aller Touren (bekannte Interimslösung, ADR-002); bei sehr vielen Touren langsam.
- Design „System“ wird im Backup nicht gespeichert (Schlüssel fehlt dann); beim Wiederherstellen bleibt die Darstellung des Geräts. Klein, nicht geändert.
- Nur „ungefährer Standort“ erlaubt: Aufnahme startet nicht, Meldung spricht allgemein von fehlender Standortberechtigung.
- Exportierte GPX-Dateien bleiben im App-Cache liegen (Android räumt den Cache bei Bedarf selbst).
- Kein `package-lock.json`: CI installiert je Lauf die neuesten passenden Versionen.
- Lokal geprüft: 26 Tests (Backup-Format, Karten-Hilfen, ZIP, Service Worker) mit Ersatzrunner grün, Typprüfung von `src` gegen Platzhalter-Typen ohne Befund. Volle Prüfung nur in der CI.

## Aktuell in Arbeit
- Phase 8 (8a, 8b, 8c Stufe 1) umgesetzt; wartet auf CI-Ergebnis und Gerätetests (TEST_REPORT.md Fälle 20–30). Danach: Stufe 2 der Offline-Karte klären, Phase 9 (unabhängiger Testdurchlauf).

## CI / GitHub Actions (29.09.2026)
- Aktionen auf Node-24-Versionen angehoben: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/setup-java@v5`, `gradle/actions/setup-gradle@v5` (Gradle 8.14.3), `actions/upload-artifact@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v4`. Beide Workflows laufen ohne Annotationen (Warnungen).
- Runner auf `ubuntu-24.04` festgesetzt, weil `ubuntu-latest` am 19.10.2026 auf Ubuntu 26 wechselt. Umstellung später bewusst vornehmen und Build dabei prüfen.
- `android.yml` löst zusätzlich bei Änderungen an `src/**`, `index.html`, `public/**`, `package.json`, `capacitor.config.json` und am Workflow selbst aus (die APK enthält die Web-Oberfläche).

## Aktuell in Arbeit
- Nichts offen im Code. Wartet auf Gerätetests und Sichtprüfung der neuen Oberfläche durch den Nutzer.

## Nächste Schritte in Reihenfolge
1. Nutzer: neueste APK (Artifact `travelbook-debug-apk` des letzten grünen Laufs „Android Debug APK“) installieren, neue Oberfläche prüfen (Dunkelmodus, Navigationsleiste bei schmalem Display, Zurück-Taste).
2. Nutzer: Gerätetests nach `docs/TEST_REPORT.md` (mindestens 2 h gesperrtes Display, zwei Hersteller, App-Kill, Neustart); Ergebnisse dort eintragen.
3. Fehler aus 1./2. beheben; bei grundsätzlichem Scheitern des eigenen Plugins ADR-001-Fallback (Transistorsoft) bewerten.
4. Vor Phase 6 (umgesetzt, Gerätetest offen): GPX-Export unter Android, Live-Distanz, laufende Aufnahme nicht als 0-km-Tour.
5. Phase 6: erledigt (Fotos, Notizen, Detailansicht).
6. Phase 7a: Suche, Filter (bestätigt). Phase 7b: Land (bestätigt). Phase 8: Backup (8a), PWA-Offline (8b), Offline-Weltkarte Stufe 1 (8c) umgesetzt, Gerätetests offen; Stufe 2 (Regionalkarten) offen.
7. Phase 9: unabhängiger Testdurchlauf.
8. Nebenbei: `confirm`-Dialoge durch M3-Dialoge ersetzen, Release-Signaturschlüssel statt Debug-Keystore vor Veröffentlichung, `ubuntu-latest`-Umstellung.

## Bekannte Probleme
- Keine bekannten Fehler; offene Unsicherheiten siehe oben (Gerätetests fehlen).

## Arbeitsumgebung (für neue Chats)
- In der Claude-Entwicklungsumgebung ist npm blockiert (403): Tests, Typprüfung und Build laufen dort nicht. Nachweis ist ausschließlich der GitHub-Actions-Lauf nach dem Push.
- CI-Status lässt sich ohne Anmeldung über die GitHub-Schnittstelle abfragen: `https://api.github.com/repos/Hagi089/Travelbook/actions/runs?per_page=1` (Job-Schritte über `jobs_url`, Fehlermeldungen über `check-runs/<job-id>/annotations`).
- Das Repository heißt `Hagi089/Travelbook` (GitHub leitet von `travelbook` weiter). Commits gehen direkt auf `main`.
- Oberfläche kann nur der Nutzer auf dem Handy/im Browser prüfen: https://hagi089.github.io/Travelbook/

## Temporäre Lösungen (später zurückbauen)
- Online-Karte: Stellen mit `TEMP-ONLINE-MAP` (Online-Hinweis, OSM-Richtlinien-Notiz); Stand des Rückbaus in ARCHITECTURE.md (ADR-002, „Stand Phase 8c“).
- Dialoge: `window.confirm` beim Löschen (später durch M3-Dialog ersetzen).
- Export unter Android: Teilen-Menü statt „Speichern unter“ (Cache-Datei); ggf. später direkter Speicherort-Dialog.
- Feste Debug-Signatur im Repository (`android/app/debug.keystore`); vor einer Veröffentlichung durch einen Release-Schlüssel ersetzen.

## Offene Entscheidungen
- Schwellen für Höhenrauschen (3 m) und GPS-Sprung (70 m/s) an echten Tracks prüfen.
- Kartenquelle und Offline-Strategie (ARCHITECTURE.md).
- Bestätigt am 29.09.2026 (Capacitor-8-Update-Anleitung): Node 22, minSdk 24, compileSdk/targetSdk 36, Android Gradle Plugin 8.13.0, Gradle 8.14.3, Kotlin 2.2.20, Android Studio Otter 2025.2.1+. Genaue Patchversionen von `@capacitor/*` liegen nicht vor (npm hier blockiert); `^8.0.0` ist ein Platzhalter, die CI zeigt, was installiert wird.
- Entschieden am 29.09.2026: applicationId `de.hagi089.travelbook`; Android-Ordner wird ins Repository eingecheckt (keine Erzeugung in der CI).

## Wichtige Architekturentscheidungen
- ADR-001 (ARCHITECTURE.md): eigenes Kotlin-Plugin statt Community-Plugin; Transistorsoft als Fallback. Basiert auf Recherche, noch ohne Gerätetest.
- Trackpunkte liegen getrennt von den Tour-Metadaten (DATA_MODEL.md).
