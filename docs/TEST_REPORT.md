# TEST_REPORT

## Automatische Tests (CI)
Stand 29.09.2026 (bis Phase 6): `npm test` (Vitest) und `npm run build` (Typprüfung) liefen in der CI grün; Phase 7a (`tests/tour-search.test.ts`) ist lokal mit einem Ersatz-Testrunner (15/15) und in der CI (grün) geprüft; der Workflow „Android Debug APK“ baut die APK. Die Oberfläche und der native Teil (Kotlin) sind nicht automatisch getestet.

## Gerätetests GPS-Aufnahme (Pflicht laut ADR-001, noch NICHT durchgeführt)

### Vorbereitung
1. APK herunterladen: GitHub → Actions → „Android Debug APK“ → neuester grüner Lauf → Artifact `travelbook-debug-apk` (ZIP entpacken).
2. APK auf dem Handy installieren (Installation aus unbekannter Quelle erlauben). Spätere Builds aktualisieren die App, ohne Daten zu löschen; die App nicht vorher deinstallieren.
3. App öffnen, Tab „Aufnahme“: Standort „Beim Verwenden der App“ bzw. „Genau“ und Benachrichtigungen erlauben.
4. Akku-Einstellungen der App auf „Nicht optimiert/Unbeschränkt“ stellen (je Hersteller in den App-Infos).

### Testfälle (je Gerät ausfüllen)
| # | Fall | Erwartung | Ergebnis |
|---|---|---|---|
| 1 | Aufnahme starten, Display sperren, 2 h unterwegs (Profil „Normal“) | Track ohne Lücke > 1 min, Notification bleibt sichtbar | |
| 2 | Wie 1, Profil „Akku sparen“, Akkuverbrauch notieren | Track brauchbar, Verbrauch/h notieren | |
| 3 | Aufnahme laufend, App aus der Übersicht wegwischen, nach 10 min öffnen | Aufnahme läuft weiter, Punkte vorhanden | |
| 4 | Aufnahme laufend, Handy neu starten | Nach Neustart: App zeigt „unterbrochene Aufnahme gerettet“; Punkte bis zum Neustart vorhanden | |
| 5 | Pause, 5 min warten, Fortsetzen | Kein Punkt während der Pause; neues Segment (keine Strecke über die Lücke) | |
| 6 | Aufnahme beenden | Tour gespeichert mit Distanz/Dauer; Karte zeigt Track | |
| 7 | Berechtigung Standort verweigern | Verständliche Meldung, keine Aufnahme, keine Geister-Tour | |
| 8 | Flugmodus während der Aufnahme | GPS-Punkte kommen weiter (nur Karte braucht Internet) | |
| 9 | Tour in „Daten“ öffnen → GPX exportieren (Android) | Android-Teilen-Menü öffnet sich (Datei `<Name>.gpx`), Speichern/Teilen möglich; Abbrechen zeigt keinen Fehler | |
| 10 | Während der Aufnahme: „Strecke“ in der Aufnahmeansicht | Wert steigt, passt grob zur gegangenen Strecke | |
| 11 | Während der Aufnahme: Datenliste, Karte, Dashboard ansehen | Laufende Aufnahme erscheint dort nicht (Banner „Aufnahme läuft“ bleibt) | |
| 12 | Tour öffnen → „+ Foto“ → Foto aufnehmen bzw. aus Galerie wählen (bis 3), Foto antippen, Foto entfernen | Vorschau erscheint, Vollbild öffnet/schließt, Entfernen mit Rückfrage; Foto hochkant korrekt ausgerichtet; nach 3 Fotos verschwindet „+ Foto“; nach App-Neustart noch vorhanden |  |
| 13 | Daten: Suchfeld – Teil eines Tour-Namens oder ein Wort aus den Notizen eingeben; mehrere Wörter; Text löschen | Liste zeigt nur Treffer („N von M Touren“), alle Wörter müssen passen, ohne Text wieder alle | |
| 14 | Daten: Zeitraum „Letzte 10 Touren“ und ein Jahr wählen, mit Kategorie und Suche kombinieren; Tour öffnen und zurück | Höchstens 10 neueste bzw. nur Touren des Jahres; Filter bleiben nach „Zurück“ erhalten | |
| 15 | Neue APK installieren: App-Symbol im Launcher (eckig und rund/adaptiv) | Neues Icon (Wohnmobil-Motiv) sichtbar, nicht abgeschnitten oder verpixelt | |
| 16 | Daten öffnen (erstes Mal nach dem Update) | Bestehende Touren zeigen ihr Land in der Liste (Startpunkt bestimmt es); Liste bleibt bedienbar | |
| 17 | Länderfilter „Alle Länder“ → ein Land wählen, mit Kategorie/Zeitraum/Suche kombinieren | Nur Touren des Landes; Filter erscheint nur, wenn Touren ein Land haben | |
| 18 | Tour bearbeiten → „Land“ auf ein anderes Land / „Kein Land“ / „Automatisch“ stellen | Wert erscheint in Details und Liste; „Automatisch“ stellt das berechnete Land wieder her | |
| 19 | Manuelle Tour mit Ort in einem anderen Land anlegen bzw. Ort ändern (Land auf „Automatisch“) | Land folgt dem Ort; ein von Hand gesetztes Land bleibt bei Ortsänderung | |
| 20 | Einstellungen → Sicherung → „Backup erstellen“ (Android) | Teilen-Menü öffnet sich mit `travelbook-backup-JJJJ-MM-TT.zip`; Meldung mit Anzahl Touren/Fotos/Trackpunkte; „Letztes Backup“ aktualisiert | |
| 21 | Backup-ZIP auf einem PC öffnen | Enthält `manifest.json`, `data/*.json`, `data/tracks/…`, `photos/…` | |
| 22 | App-Daten löschen bzw. neu installieren, „Backup wiederherstellen“ → Datei wählen → „Ersetzen“ | Vorschau mit Anzahlen; danach Touren, Tracks, Notizen, Kategorien und Fotos wie vorher; Design/Kartenmodus wie gesichert | |
| 23 | Zweites Gerät (oder nach einer neuen Tour): „Zusammenführen“ | Nur fehlende Touren kommen dazu, vorhandene bleiben unverändert | |
| 24 | Backup während laufender Aufnahme; Datei mit anderem ZIP/beschädigt wählen | Verständliche Meldung, keine Änderung an den Daten | |
| 25 | Webseite (https://hagi089.github.io/Travelbook/) einmal online öffnen, kurz warten, dann Flugmodus und Seite neu laden bzw. aus dem Startbildschirm öffnen | App startet ohne Netz, Touren/Daten sichtbar, Ländername in der Liste (Länderdaten geladen); Kartenhintergrund fehlt (bis 8c) | |
| 26 | Nach einer neuen Version (nächster Deploy) App öffnen | Hinweis „Neue Version verfügbar“ mit „Neu laden“; nach Antippen lädt die App neu und zeigt die neue Version; ohne Antippen bleibt die laufende Sitzung unberührt | |
| 27 | Erster Besuch mit leerem Browser-Speicher | Kein Hinweis „Neue Version“, kein unerwartetes Neuladen | |
| 28 | Einstellungen → Karte → „Offline-Karte“, dann Karte öffnen (mit Internet) | Länder als helle Flächen auf blauem Meer, Hinweisleiste „Offline-Karte …“, Touren liegen darüber und sind antippbar; Pfeiltasten/Zoom flüssig | |
| 29 | Wie 28 im Flugmodus; Hell/Dunkel umschalten | Karte bleibt identisch sichtbar; Farben wechseln mit dem Design (Land/Meer/Grenzen) | |
| 30 | Zurück auf „Online-Karte“ und wieder „Offline-Karte“ | Kacheln erscheinen/verschwinden richtig, keine doppelten Ebenen, Touren bleiben oben | |
| 31 | Android: „Backup erstellen“, Teilen-Menü einmal ohne Auswahl schließen, einmal „Dateien“/Drive wählen | Ohne Auswahl: Hinweis „ohne Auswahl geschlossen“, „Letztes Backup“ unverändert. Mit Ziel: Erfolgsmeldung, „Letztes Backup“ aktualisiert | |
| 32 | Offline-Karte, Kategorie mit nur einem Stellplatz (Tour ohne Track) antippen | Karte zoomt auf den Punkt und bleibt bedienbar (kein leeres/graues Bild, Zoom-Knöpfe funktionieren) | |
| 33 | Online-Karte öffnen, zu „Daten“ wechseln, zurück zur Karte | Kartenhintergrund bleibt stehen (kein erneutes Laden/Flackern) | |

### Geräte
| Gerät / Hersteller | Android-Version | Fälle bestanden | Auffälligkeiten |
|---|---|---|---|
| | | | |

Mindestens zwei Hersteller nötig (ADR-001). Bei Ausfällen: Zeitpunkt, Hersteller, Akku-Einstellung und Anzahl Punkte notieren.
