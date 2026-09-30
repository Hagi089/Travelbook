# GPX Tracker

Persönliche GPX-Touren-App (PWA + Android via Capacitor). **Stand: Phase 8 – lokale Datenbank, GPX-Import/-Export, Weltkarte (Online-Karte oder grobe Offline-Weltkarte), Kategorien, Dashboard, Suche/Filter, Länder, Fotos, GPS-Aufnahme (Android-App mit Foreground Service; im Browser nur eingeschränkt), Backup/Wiederherstellen als ZIP inkl. Fotos, Offline-Start der Web-App (Service Worker).**
Detaillierte Offline-Karten (Straßen/Orte) gibt es noch nicht; die Online-Karte braucht Internet. Gerätetests stehen teilweise aus (siehe `docs/TEST_REPORT.md`).

## Befehle
    npm install
    npm run dev      # Entwicklungsserver
    npm test         # Vitest
    npm run build    # Typprüfung + Produktions-Build nach dist/

## Deployment
Push auf `main` startet `.github/workflows/deploy.yml` (Test → Build → GitHub Pages).
Einmalig im Repo: Settings → Pages → Source: „GitHub Actions“.

## Android-App (Debug-APK)
Signierter Release-Build (APK/AAB): Anleitung in `docs/RELEASE_SIGNING.md`. Abhängigkeiten sind über `package-lock.json` fixiert (`npm ci` in der CI; aktualisieren über den Workflow „Lockfile erzeugen“).

Der Workflow `.github/workflows/android.yml` baut bei Änderungen an `android/`, `src/tracking/` usw. eine Debug-APK (GitHub → Actions → „Android Debug APK“ → Artifact `travelbook-debug-apk`). Die APK ist mit dem eingecheckten Debug-Schlüssel `android/app/debug.keystore` signiert, damit neuere Builds die installierte App aktualisieren, ohne Daten zu löschen. Für eine Veröffentlichung ist ein eigener Release-Schlüssel nötig (noch nicht eingerichtet).

Lokal (Android Studio Otter 2025.2.1+, JDK 21): `npm install && npm run android:sync`, dann `android/` öffnen.

## Dokumentation
`docs/` (Architektur, Projektstatus, Datenmodell, technische Doku, Testbericht). Oberfläche nach Material Design 3 mit Hell/Dunkel (siehe PROJECT_STATE.md).
