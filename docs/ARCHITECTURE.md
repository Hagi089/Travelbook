# ARCHITECTURE (Vorschlag – noch nichts implementiert)

## Kernfrage: Reicht eine PWA für GPS bei gesperrtem Display?
Nein. Browser/PWA-Geolocation (`watchPosition`) wird bei ausgeschaltetem Display bzw. pausierter WebView von Android gedrosselt oder gestoppt; einen Foreground Service kann eine PWA nicht starten. Daher: native Komponente nötig (Capacitor + Foreground Service). Die Web-UI bleibt zentral.

## Entscheidungen
| Thema | Gewählt | Begründung / Alternativen |
|---|---|---|
| Sprache/Build | TypeScript + Vite | Schnell, statisches Ergebnis für GitHub Pages (`base`-Pfad beachten). Framework-frei oder minimal, um Komplexität gering zu halten. |
| Karte | Leaflet | Klein, touchfähig, Canvas-Renderer für viele Linien, Clustering per Plugin. MapLibre GL wäre performanter, braucht aber Vektorkacheln/WebGL – mehr Komplexität. |
| Speicher | IndexedDB via Dexie | Migrationen (`version().upgrade()`), Blobs für Fotos. |
| Tracks | Trackpunkte getrennt von Tour-Metadaten speichern | Karte lädt nur vereinfachte Geometrie (z. B. Douglas-Peucker, mehrere Zoomstufen), Details erst in der Detailansicht. |
| Android | Capacitor + eigenes, schlankes Kotlin-Plugin (ADR-001) | Siehe ADR-001: native Persistenz, konfigurierbare Intervalle, Capacitor-8-Kompatibilität. |
| Deployment | GitHub Actions → Pages | Web-Build getrennt vom Android-Build. |

## Android-GPS (Konzept)
- Plugin startet Foreground Service (`foregroundServiceType="location"`) mit dauerhafter Notification (Distanz/Zeit, Aktion „öffnen“).
- Standort über Fused Location Provider; Profile: Hoch / Normal / Akku sparen (Intervalle + Mindestdistanz werden real gemessen, nicht geraten).
- Service schreibt Punkte **nativ** in eine lokale Datei/SQLite (Append-only), unabhängig von der WebView.
- WebView holt beim Start/Resume ausstehende Punkte per Plugin und schreibt sie in IndexedDB; Deduplizierung über Zeitstempel/Sequenznummer.
- Crash-Recovery: aktive Aufnahme-ID in nativem Zustand; App erkennt laufende/unterbrochene Aufnahme beim Start.
- Berechtigungen (zu verifizieren gegen aktuelle Android-Doku): ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION (ab Android 14), POST_NOTIFICATIONS (ab Android 13). ACCESS_BACKGROUND_LOCATION nur falls nötig – Start des Service aus sichtbarer App sollte genügen (prüfen). Akku-Optimierung: Nutzer per Hinweis zu den Systemeinstellungen führen; `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` ist bei Play-Store-Veröffentlichung eingeschränkt.
- Herstellerspezifisches Beenden (Xiaomi, Samsung, Huawei …) ist ein reales Risiko und nur mit Gerätetests belegbar.

## Karte & Offline
- OSM-Standardkacheln: Nutzungsrichtlinie verbietet Massen-Download/Offline-Vorhalten und verlangt Attribution; Service-Worker-Cache nur für bereits angezeigte Kacheln im normalen Umfang bzw. gar nicht.
- Echte Offline-Karte: eigene/erlaubte Quelle (z. B. PMTiles/MBTiles aus OSM-Daten, ODbL mit Attribution) – Entscheidung offen.
- Ländererkennung offline: gebündelte, vereinfachte Ländergrenzen (Natural Earth, gemeinfrei) statt Reverse-Geocoding.

## Risiken
1. Hintergrund-GPS je nach Hersteller/Akku-Optimierung. 2. WebView-Kill während Aufnahme (durch nativen Puffer abgefangen). 3. Kartenkachel-Lizenz/Offline. 4. Speicher durch Fotos (Verkleinern, ~1600 px, JPEG/WebP). 5. Performance bei 1000 Touren (vereinfachte Geometrie, Canvas). 6. IndexedDB-Eviction im Browser (`navigator.storage.persist()` + Backup-Export). 7. GitHub-Pages-Pfad und Service-Worker-Updates.

## Entwicklungsphasen
0 Analyse → 1 Gerüst/CI → 2 Datenmodell/Dexie → 3 GPX+Berechnung (mit GPS-Sprung-Filter, Rohdaten bleiben) → 4 Karte/Kategorien/Import → 5 Android-GPS → 6 Fotos/Notizen/Detail → 7 Suche/Filter/Land → 8 Backup/PWA-Offline → 9 unabhängiger Testdurchlauf.

---

# ADR-001: GPS-Hintergrundaufzeichnung – Community-Plugin oder eigenes Kotlin-Plugin?
Status: entschieden am 29.09.2026 (auf Basis Dokumentations-/Issue-Recherche; **keine Gerätetests**, siehe „Verifikation“).

Hinweis: Ein „bestehendes eigenes Kotlin-Plugin“ existiert noch nicht. Verglichen wird das *geplante* eigene Plugin mit den Alternativen.

## 1. Geprüfte Lösungen
1. `@capacitor/geolocation` (offizielles Plugin)
2. `@capacitor-community/background-geolocation` (MIT)
3. `@capgo/background-geolocation` (Cap-go)
4. `@transistorsoft/capacitor-background-geolocation` v9 (kommerziell)
5. Capawesome Background Geolocation (kostenpflichtig, „Insiders“)
6. Eigenes Kotlin-Plugin (Foreground Service + Fused Location Provider + native Persistenz)

## 2. Vor- und Nachteile
| Lösung | Vorteile | Nachteile |
|---|---|---|
| 1 Offiziell | Wartung durch Capacitor-Team, kostenlos | Kein Foreground Service, kein Hintergrund-Tracking → ausgeschieden |
| 2 Community | MIT, kostenlos, Foreground Service (Typ location), kleine Codebasis, Notification-Anpassung | README nennt Support bis Capacitor v7; offenes Issue #156 (04/2026): Absturz beim Wechsel in den Hintergrund mit Capacitor v8. Nur `distanceFilter`, kein einstellbares Zeitintervall/Prioritätsprofil. Positionen kommen nur per JS-Callback – ist die WebView weg, gehen Punkte verloren (keine native Persistenz). Erfordert `android.useLegacyBridge`; Issues zu Ausfällen nach 5 min bzw. ~1 h (#89, #126). |
| 3 Capgo | Aktiv gepflegt, aktuelle Capacitor-Versionen | Junges Projekt; offenes Issue #84: Updates stoppen nach 3–5 min auf Oppo/Xiaomi. Ebenfalls Callback-Modell. Genaue Persistenz-/Intervall-Fähigkeiten nicht im Detail geprüft. |
| 4 Transistorsoft v9 | Sehr ausgereift: SQLite-Persistenz im Plugin, Bewegungserkennung, Boot-Start, Intervall-/Genauigkeitskonfiguration | Release-Builds Android benötigen Lizenz (ca. 399 USD pro App-ID laut Capawesome-Vergleich; Preis bei Transistorsoft selbst prüfen). Closed-Source-Kern → native Erweiterung eingeschränkt. Auch hier existieren Issues mit Ausfall nach ~5 min auf Xiaomi/OnePlus (#276, Ursache/Auflösung nicht geprüft). |
| 5 Capawesome | Kommerziell unterstützt | Abo (99 USD/Monat bzw. 990 USD/Jahr für Insiders-Paket), beendet Watch-Session bewusst nach Force-Quit/Reboot |
| 6 Eigenes Plugin | Volle Kontrolle; Punkte werden nativ **vor** jeder WebView-Übergabe persistiert; Fused-Location-Parameter (Intervall, Mindestdistanz, Priorität) frei einstellbar; unabhängig von Capacitor-Plugin-Wartung; Datenschutz auditierbar | Entwicklungs- und Wartungsaufwand; Android-Versionsänderungen liegen bei uns; keine iOS-Unterstützung (nicht gefordert) |

## 3. Entscheidung
**Eigenes, schlankes Kotlin-Plugin** (nur Android). Das MIT-lizenzierte Community-Plugin dient als Referenz für Service/Notification-Aufbau (Lizenzhinweis beachten, falls Code übernommen wird).

## 4. Begründung
- Wichtigste Anforderung ist verlustfreie Langzeitaufzeichnung: Das Callback-Modell der Community-Plugins verliert Punkte, sobald die WebView beendet wird. Native Persistenz ist Kernanforderung (Auftrag Abschnitt 16).
- Konfigurierbare Profile (Intervall/Distanz/Priorität) sind bei 2 nicht vorhanden.
- Compatibility-Risiko Capacitor 8 bei 2 (Issue #156).
- Transistorsoft wäre technisch stärker, aber kostenpflichtig und schlechter erweiterbar; bleibt als **Fallback**, falls das eigene Plugin die Gerätetests nicht besteht.
- Hersteller-Killer (Xiaomi/Oppo/…) treffen alle Lösungen, auch Transistorsoft und Capgo; kein Plugin löst das allein. Gegenmaßnahmen: Foreground Service mit sichtbarer Notification, Hinweis auf Akku-Einstellungen, Wiederaufnahme-Erkennung.

## 5. Konsequenzen
- Neues Verzeichnis `android-plugin/` (Capacitor-Plugin, Kotlin) bzw. lokales Plugin im `android/`-Projekt; TypeScript-Schnittstelle `TrackingPlugin` (start, pause, stop, getPendingPoints, ackPoints, getStatus, openSettings) mit Web-Fallback (`watchPosition`, ausdrücklich als „nicht hintergrundfähig“ markiert).
- Nativer Puffer (SQLite/Room) mit Sequenznummern; Web-UI übernimmt idempotent nach IndexedDB.
- Phase 5 wird vorgezogen (nach Phase 3), da Kernrisiko.
- **Verifikation (Pflicht vor „fertig“):** Gerätetest mit gesperrtem Display, mindestens 2 h, auf mindestens zwei Herstellern, mit App-Kill und Neustart-Szenario; Ergebnisse in `TEST_REPORT.md`. Besteht das Plugin nicht → Fallback Transistorsoft neu bewerten.
- Offen: Capacitor-Zielversion und Android-`targetSdk` vor Phase 1 gegen aktuelle Doku bestätigen.

---

# ADR-002: Kartenquelle – Online zuerst, Offline vorbereitet
Status: entschieden am 29.09.2026 (Vorgabe des Nutzers: erst einfach und schnell, Offline ist später wichtig, nichts verbauen).

## Problem
Die Weltkarte braucht Kartenkacheln. Echte Offline-Karten sind aufwendig (Quelle, Lizenz, Speicherplatz, Downloadverwaltung).

## Lösungen
1. Sofort Offline-Karten bauen – aufwendig, verzögert die restliche App.
2. Nur Online-Kacheln, fest im Code – schnell, aber später schwer umzubauen.
3. **Online-Kacheln hinter einer Kartenquellen-Schicht** mit Modus-Schalter (gewählt).

## Entscheidung und Begründung
Variante 3: Die Oberfläche fragt nur `getTileSource(mode)` (`src/map/tileSource.ts`). Aktuell gibt es dort nur die OSM-Online-Quelle; der Modus „offline“ liefert `null` und ist in den Einstellungen deaktiviert (`OFFLINE_MAPS_AVAILABLE = false`). Die App zeigt auf der Karte und in den Einstellungen ausdrücklich, dass eine Internetverbindung nötig ist.

## Rückbau-Liste bei Umstellung auf Offline (alle Stellen im Code mit `TEMP-ONLINE-MAP` markiert; `grep -rn TEMP-ONLINE-MAP src`)
1. `src/map/tileSource.ts`: Offline-Quelle ergänzen, `getTileSource('offline')` implementieren, `OFFLINE_MAPS_AVAILABLE = true`; `ONLINE_OSM` nur behalten, wenn Online weiterhin wählbar sein soll.
2. `src/ui/onlineNotice.ts` und deren Verwendung in `src/ui/mapView.ts` entfernen bzw. auf „Online-Modus“ beschränken.
3. `src/ui/settingsView.ts`: Deaktivierung der Offline-Auswahl und den Hinweistext „noch nicht verfügbar“ entfernen.
4. Test `tests/ui-helpers.test.ts` („liefert online die OSM-Quelle und offline (noch) keine“) anpassen.
5. Service Worker/Offline-Caching der Kacheln neu bewerten (OSM-Standardkacheln dürfen nicht massenhaft vorgeladen werden).

## Auswirkungen
- Die Karte zeigt ohne Internet keinen Hintergrund; Tracks und alle lokalen Daten bleiben sichtbar.
- Risiko: OSM-Standardkacheln sind nur für moderate Nutzung vorgesehen (Nutzungsrichtlinie der OSM Foundation). Für den privaten Gebrauch vertretbar, für eine breitere Veröffentlichung nicht.
- Interimslösung für viele Tracks: Übersicht dünnt Trackpunkte zur Laufzeit aus (`src/map/simplify.ts`). Vorberechnete vereinfachte Geometrie folgt später.

## Stand Phase 8c, Stufe 1 (29.09.2026): Offline-Weltkarte
- Der Offline-Modus ist jetzt wählbar. Er nutzt **keine Kacheln**, sondern zeichnet die gebündelten Ländergrenzen (`src/geo/`, Natural Earth 1:50m, ca. 3 km vereinfacht, ca. 40.000 Punkte) als Flächen auf eine eigene Leaflet-Ebene unter den Touren (`src/map/countryShapes.ts`, `countryLayer.ts`). Ergebnis: Länder und Küsten, keine Straßen, Orte oder Gewässerdetails. Sinnvoll bis etwa Regionsmaßstab.
- Schicht: `getMapBackground(mode)` liefert `{kind: 'tiles'}` (online) oder `{kind: 'countries'}` (offline); `getTileSource` bleibt für Kachelmodi bestehen (offline: `null`).
- Rückbau-Liste ADR-002 – Stand: (1) erledigt (Offline-Quelle ergänzt, `OFFLINE_MAPS_AVAILABLE` entfernt, `ONLINE_OSM` bleibt, weil Online wählbar bleibt); (3) erledigt (Auswahl aktiv, Text angepasst); (4) erledigt (Test angepasst); (5) erledigt für 8b (Service Worker speichert keine Kacheln); (2) **bewusst nicht entfernt**: `onlineNotice.ts` erscheint nur im Online-Modus und bleibt, solange Online die einzige detaillierte Karte ist. Die Markierung `TEMP-ONLINE-MAP` bleibt an diesen Stellen und an der OSM-Richtlinien-Notiz in `tileSource.ts`.
- **Stufe 2 (30.09.2026 vom Nutzer gestrichen/zurückgestellt, nicht geplant):** detaillierte Regionalkarten (z. B. PMTiles-Dateien, die der Nutzer importiert). Zu klären: Kartenquelle und Lizenz (ODbL/Attribution), Bibliothek für Leaflet, Speicherort (Android-Dateisystem statt IndexedDB), Größe pro Region. Bis dahin ist die Online-Karte die einzige detaillierte Karte.

## Umsetzung ADR-001 in Phase 5b (Stand 29.09.2026, noch ohne Gerätetest)
- Lokales Capacitor-Plugin `Tracking` direkt im `android/`-Projekt (`android/app/src/main/java/de/hagi089/travelbook/tracking/`), kein eigenes Modul. App-ID `de.hagi089.travelbook`.
- `TrackingStore`: SQLite (`SQLiteOpenHelper`, kein Room). Tabellen `recordings` (Zustand, Profil, Segment, `next_seq`) und `points`. Vergabe von `seq` und Einfügen des Punkts in einer Transaktion; `seq` wird nie zurückgesetzt, auch nicht nach dem Löschen bestätigter Punkte.
- `TrackingService`: Foreground Service, Typ `location`. Ein einziger Befehl „abgleichen“: liest den Soll-Zustand aus dem Store (recording / paused / keine aktive Aufnahme). Dieselbe Logik für Start, Pause, Fortsetzen, Stopp und Neustart durch das System (`START_STICKY`).
- Standort: Fused Location Provider (`play-services-location`), Priorität immer hoch; Profile (Annahmen, an Geräten zu prüfen): Hoch 1 s / 0 m, Normal 2 s / 3 m, Akku sparen 15 s / 10 m (Normal und Hoch am 29.09.2026 nach Gerätetest verdichtet: vorher 5 s / 5 m bzw. 2 s / 0 m, Punktedichte in Normal zu gering). Höhe: bei Android 14+ über Meeresspiegel (MSL), sonst Ellipsoid.
- Berechtigungen: Standort (fein) und Benachrichtigungen; kein `ACCESS_BACKGROUND_LOCATION` (Dienst wird nur aus sichtbarer App gestartet, laut Android-Doku ausreichend, am Gerät zu bestätigen).
- Wiederaufnahme: Wird der Dienst vom System beendet, während die Aufnahme als „recording“ gilt, startet ihn `getStatus()` beim nächsten Öffnen der App neu und legt ein neues Segment an (Lücke im Track wird nicht als Strecke gezählt).
- Bekannte Grenzen / Risiken: (1) Geräte ohne Google Play Services (z. B. neuere Huawei) haben keinen Fused Location Provider; ein Fallback auf `LocationManager` ist nicht umgesetzt. (2) Ob Android 14+ einen `START_STICKY`-Neustart aus dem Hintergrund mit Standortzugriff erlaubt, ist nicht belegt; deshalb der Neustart über die sichtbare App. (3) Herstellerspezifisches Beenden (Xiaomi, Samsung, Oppo …) ist nur per Gerätetest belegbar. (4) Keine automatischen Tests der nativen Seite (bräuchte Emulator/Robolectric); Nachweis sind die Gerätetests in `TEST_REPORT.md`. (5) Punkte eines gestoppten, aber nie übernommenen Recordings bleiben im Puffer, bis die App sie beim Start abholt.
- Debug-Signatur: `android/app/debug.keystore` (Standard-Passwort `android`) ist eingecheckt, damit CI-Builds sich gegenseitig aktualisieren können. Nicht für Veröffentlichung geeignet.
