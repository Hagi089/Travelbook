# TECHNICAL_DOCUMENTATION (Stand: Phase 5b + UI-Überarbeitung)

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
- Native Seite (Kotlin-Plugin `Tracking`, Phase 5b): siehe „Umsetzung ADR-001 in Phase 5b“ in ARCHITECTURE.md. Schnittstelle nach außen ist genau `src/tracking/types.ts`; Rückgabewerte fehlender Höhe/Genauigkeit sind `null`.

## Android-Build
- `capacitor.config.json` (appId, webDir `dist`), `android/` (Gradle 8.14.3, AGP 8.13.0, Kotlin 2.2.20, minSdk 24, compile/targetSdk 36, JDK 21).
- Von `npx cap sync android` erzeugt und nicht eingecheckt: `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`, `android/capacitor-cordova-android-plugins/`, `android/app/src/main/assets/public/`.
- CI: `.github/workflows/android.yml` (npm install → Web-Build → `cap sync` → `gradle assembleDebug` → Artifact). Gradle-Wrapper ist nicht eingecheckt; die CI installiert Gradle 8.14.3 über `gradle/actions/setup-gradle`.
- Bekannt: Export von GPX erfolgt unter Android noch per Browser-Download (`src/ui/download.ts`) und ist dort nicht geprüft.
## Oberfläche (Material Design 3)
- Aufbau: `src/ui/app.ts` baut App-Leiste, Banner, Ansichten, FAB und Navigationsleiste. Hauptziele: Karte, Daten, Dashboard, Einstellungen. Unterseiten: `record`, `import` (Elternziel „Daten“), außerdem Details und Formulare innerhalb von `toursView`.
- Ansichten steuern App-Leiste und FAB über das Objekt `Chrome` (`title`, `back`, `fab`). Wer eine Unterseite zeigt, setzt Titel und Zurück-Aktion; die Hauptziele setzen beides beim Wechsel zurück.
- Farben ausschließlich über `--md-sys-color-*` (theme.css); neue Komponenten dürfen keine festen Farben verwenden. Dunkel gilt bei Geräteeinstellung oder `html[data-theme=dark]`. Die beiden Dunkel-Blöcke in theme.css müssen identisch bleiben.
- Symbole: `icon('name')` aus `src/ui/icons.ts` (Pfaddaten, per DOM-API eingefügt). Neue Symbole dort ergänzen.

## Suche und Filter (Phase 7a)
- `src/db/tourSearch.ts`: reine Funktionen `queryTours(tours, {text, year, latest})` und `tourYears(tours)`; kein Datenbankzugriff, kein Schema-Umbau. Suchtext: jedes Wort muss im Namen oder in den Notizen vorkommen (Groß-/Kleinschreibung egal, Umlaute unverändert, kein regulärer Ausdruck). `latest` kürzt nach den übrigen Bedingungen auf die neuesten N (`LATEST_TOUR_COUNT` = 10).
- `src/ui/toursView.ts`: `refresh()` lädt die Touren der gewählten Kategorie aus der Datenbank, `render()` wendet Suche und Zeitraum im Speicher an (Auswahl „Alle Zeiträume“ / „Letzte 10 Touren“ / Jahr, Anzeige „N von M Touren“). Filterzustand bleibt beim Wechsel in die Details und zurück erhalten. Die Karte nutzt weiterhin nur den Kategorienfilter.

## Ländererkennung (Phase 7b)
- Daten: `src/geo/countryData.ts` (automatisch erzeugt, nicht von Hand ändern) aus Natural Earth 1:50m Admin 0 – Countries (gemeinfrei, Quelle nvkelso/natural-earth-vector, Commit ca96624). Erzeugt mit `python3 scripts/build-countries.py <ne_50m_admin_0_countries.geojson> 0.03`: Douglas-Peucker 0,03° (ca. 3 km), Koordinaten auf 0,01° gerundet, Nebeninseln < 0,15° entfallen (das größte Polygon eines Landes bleibt immer). 236 Ländercodes, ca. 40.000 Punkte, ca. 260 KB Text. Die Daten werden erst bei Bedarf geladen (`import()`, eigener Chunk, `src/geo/index.ts`) und sind Teil der App (funktioniert offline, sobald die Datei ausgeliefert ist).
- Codes: `ISO_A2_EH` aus den Rohdaten; Ausnahmen im Skript: Somaliland → SO, Nordzypern → CY, „Siachen Glacier“ entfällt. Kosovo = XK.
- Zuordnung (`src/geo/countries.ts`, `findCountry`): Punkt-in-Polygon (Strahlverfahren, Löcher beachtet); bei mehreren Treffern (Enklaven wie San Marino, Lesotho) gewinnt das Polygon mit der kleineren Umgrenzung. Liegt der Punkt in keinem Polygon, wird das nächste Land bis `SNAP_KM` = 20 km genommen (Küste, vereinfachte Grenzen), sonst `null` (offenes Meer).
- Namen: `Intl.DisplayNames('de')` (nichts gebündelt); fehlt dem System der Name, erscheint der Code.
- Datenbank: `src/db/country.ts` (`assignCountries`, `setTourCountry`), Regeln in DATA_MODEL.md. Oberfläche: `toursView.ts` ergänzt beim Öffnen der Liste und der Details fehlende Länder; Anzeige in Liste und Details, Länderfilter (nur sichtbar, wenn Länder vorhanden), Auswahl „Land“ im Bearbeiten-Formular (Automatisch / Kein Land / Liste). Schlägt das Laden der Grenzdaten fehl, bleibt die Ansicht benutzbar und der nächste Aufruf versucht es erneut.
- Bekannte Grenzen: Startpunkt entscheidet, Touren über Grenzen zählen nur für das Startland. Sehr kleine Gebiete fehlen in den 50m-Daten (z. B. Vatikan → Italien, Gibraltar → Spanien) und sind nur über die manuelle Korrektur setzbar; direkt an Grenzen/Küsten sind Fehler bis wenige km möglich. Weltkarte und Dashboard nutzen das Land noch nicht.

## App-Icon
- Quelle: Bild des Nutzers (29.09.2026, 512 × 512 px, Schachbrett-Hintergrund war ins Bild eingebrannt und wurde per Farb-/Flächenerkennung entfernt). PWA: `public/icons/` (192, 512, maskable-512 mit Rand auf `#f8faf0`, Apple-Touch, Favicon), eingetragen in `manifest.webmanifest` und `index.html`. Android: `res/mipmap-*` (Legacy quadratisch/rund, adaptives Vordergrundbild) und `mipmap-anydpi-v26` mit Hintergrundfarbe `#F8FAF0` (`values/ic_launcher_background.xml`), Verweise in `AndroidManifest.xml` (`icon`, `roundIcon`).

## Berechnungsannahmen (bewusste Festlegungen, an echten Tracks zu überprüfen)
- Höhenmeter: Änderungen unter 3 m werden als Rauschen ignoriert (`ELEVATION_THRESHOLD_M`).
- GPS-Sprünge: Teilstücke mit mehr als 70 m/s (nur erkennbar mit Zeitstempeln) werden aus Distanz und Höchstgeschwindigkeit herausgenommen; die Rohpunkte bleiben gespeichert.
- Durchschnittsgeschwindigkeit = Distanz / Gesamtdauer (Ende minus Start), nicht Bewegungszeit.
- Höchstgeschwindigkeit nur aus Teilstücken mit mindestens 1 s Abstand.
- Ohne Zeitstempel: Dauer und Geschwindigkeiten 0, Datum-Vorschlag ist das heutige Datum.

## Backup und Wiederherstellen (Phase 8a)
- Module: `src/backup/zip.ts` (eigener ZIP-Leser/-Schreiber ohne Abhängigkeit: Methoden stored/deflate, CRC-32 bei jedem Lesen geprüft, Lesen per `Blob.slice` ohne die ganze Datei zu laden; kein ZIP64, keine Verschlüsselung), `format.ts` (Format, Prüfung/Bereinigung aller Felder), `export.ts` (`createBackup`, `hasOpenRecording`), `import.ts` (`readBackup` prüft vollständig ohne zu schreiben, `applyBackup`), `settings.ts` (gesicherte Einstellungen, letzter Backup-Zeitpunkt). Oberfläche: `src/ui/backupPanel.ts` (Einstellungen → Sicherung), Datei-Ausgabe `downloadBlob` in `src/ui/download.ts` (Android: in 3-MB-Stücken in den App-Cache, dann Teilen-Menü).
- Warum kein ZIP-Paket: npm ist in der Entwicklungsumgebung blockiert, ein nicht prüfbares Paket sollte nicht die Datensicherung tragen. Das Modul ist klein und wird gegen Pythons `zipfile` und die Tests in `tests/zip.test.ts` geprüft.
- **Ersetzen:** Kategorien und Meta aus dem Backup werden geschrieben, dann tourweise (je Tour eine Transaktion: Tour, Trackpunkte, Waypoints, Fotos; bestehende Daten derselben Kennung werden ersetzt), **zuletzt** werden Touren und Kategorien entfernt, die nicht im Backup sind. Abweichung vom Vorschlag „ganz oder gar nicht“: Das Backup kann viele Trackpunkte enthalten, die nicht in einer einzigen IndexedDB-Transaktion im Speicher gehalten werden sollen. Ausgleich: Nichts wird gelöscht, bevor alles geschrieben ist; bei einem Abbruch bleiben bisherige Daten erhalten und derselbe Vorgang kann mit der Datei wiederholt werden.
- **Zusammenführen:** Nur Touren mit unbekannter Kennung werden ergänzt (samt Track, Waypoints, Fotos); bestehende Touren bleiben unverändert. Kategorien: gleiche Kennung → vorhandene; sonst gleicher Name (ohne Groß-/Kleinschreibung) → vorhandene; sonst neu, ans Ende der Reihenfolge.
- Speicherwunsch: `navigator.storage.persist()` beim Start (`src/main.ts`), Status in der Sicherung-Karte.
- Grenzen: Backup nicht verschlüsselt; höchstens 65.534 Dateien und 4 GB je ZIP; Fotos werden für die Prüfsumme einzeln in den Speicher gelesen, Tracks tourweise; Grenzen bei sehr großen Backups auf dem Gerät nicht gemessen.

## PWA-Offline (Phase 8b)
- `scripts/sw.template.js` ist die Vorlage des Service Workers; das Vite-Plugin `travelbook-sw` in `vite.config.ts` schreibt nach dem Build `dist/sw.js` mit der Liste aller Ausgabedateien (ohne Sourcemaps) und einer Version aus dem Inhalt aller Dateien. Registrierung: `src/pwa/register.ts` (nur Produktions-Build, nicht in der Android-App, Pfad über `import.meta.env.BASE_URL`, deshalb passt es zu `/Travelbook/` und zu `./`). Hinweis „Neue Version verfügbar – Neu laden“: `src/ui/updateNotice.ts`.
- Verhalten: Installation lädt alle App-Dateien (am HTTP-Cache vorbei) und schlägt als Ganzes fehl, wenn eine Datei fehlt (der bisherige Service Worker bleibt dann aktiv). Ein neuer Service Worker wartet, bis der Nutzer „Neu laden“ antippt (`SKIP_WAITING`), damit eine laufende Aufnahme oder ein offenes Formular nicht unterbrochen wird; beim allerersten Installieren gibt es weder Hinweis noch Neuladen. Alte Caches (`travelbook-<Version>`) werden beim Aktivieren gelöscht. Navigationen liefern die zwischengespeicherte `index.html`, Dateien der App kommen zuerst aus dem Cache. Anfragen an fremde Herkünfte (OSM-Kacheln) und Nicht-GET-Anfragen werden nicht angefasst, Kacheln also nicht gespeichert (ADR-002).
- Tests: `tests/sw.test.ts` führt die Vorlage mit Attrappen für Cache/Netz aus (Installation, Fehlschlag, Aufräumen, Warten auf Freigabe, Offline-Auslieferung, fremde Herkunft, Netzfehler). Nicht automatisch getestet: echtes Verhalten im Browser (Installation, Update-Ablauf).
- Bekannte Grenzen: Das Neuladen nach „Neu laden“ ist erst mit dem nächsten Start der Installation vollständig belegt (siehe TEST_REPORT.md). Kein eigener Installations-Knopf (der Browser bietet „Zur Startseite hinzufügen“). Ob iOS/Safari sich gleich verhält, ist nicht geprüft.

## Offline-Weltkarte (Phase 8c, Stufe 1)
- Dateien: `src/map/tileSource.ts` (`getMapBackground`, `OFFLINE_COUNTRIES`), `src/map/countryShapes.ts` (reine Umrechnung der Grenzdaten in Leaflet-Koordinaten, getestet), `src/map/countryLayer.ts` (Canvas-Ebene `country-base`, z-Index 190, nicht interaktiv), Einbindung in `src/ui/mapView.ts` (`applyTileSource`), Farben über CSS-Variablen `--map-ocean/--map-land/--map-border` in `styles.css` (hell/dunkel, Wechsel über das Ereignis `themechange`).
- Verhalten: Offline-Modus zeichnet Land auf Meeresfarbe, Hinweisleiste „Offline-Karte: grobe Weltkarte …“, Attribution „Natural Earth“. Die Ebene wird beim Besuch der Karte nur einmal aufgebaut und beim Moduswechsel entfernt; schlägt das Laden der Grenzdaten fehl, erscheint ein Hinweis, die Touren bleiben sichtbar und der nächste Besuch versucht es erneut.
- Grenzen: Kein Maßstab-Limit (bei starkem Zoom sind nur Flächen sichtbar); keine Straßen/Orte; Grenzen ca. 3 km vereinfacht; die Ebene wird nur einmal pro Weltkopie gezeichnet (`worldCopyJump` springt zurück). Die Darstellung wurde nicht in einem Browser gesehen (Leaflet ist hier nicht installierbar); geprüft sind nur die Datenumrechnung (`tests/country-shapes.test.ts`) und die Typen gegen eine Attrappe.

## Nicht umgesetzt
- Oberfläche für Import/Export, Dateiauswahl, Teilen unter Android, Kompression großer Tracks, Import anderer Formate (TCX, KML, FIT).
