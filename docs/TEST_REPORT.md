# TEST_REPORT

## Automatische Tests (CI)
Stand 29.09.2026: `npm test` (Vitest) und `npm run build` (Typprüfung) laufen in der CI grün; der Workflow „Android Debug APK“ baut die APK. Die Oberfläche und der native Teil (Kotlin) sind nicht automatisch getestet.

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

### Geräte
| Gerät / Hersteller | Android-Version | Fälle bestanden | Auffälligkeiten |
|---|---|---|---|
| | | | |

Mindestens zwei Hersteller nötig (ADR-001). Bei Ausfällen: Zeitpunkt, Hersteller, Akku-Einstellung und Anzahl Punkte notieren.
