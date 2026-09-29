# GPX Tracker

Persönliche GPX-Touren-App (PWA + Android via Capacitor). **Stand: Phase 4a – lokale Datenbank, GPX-Import/-Export, Weltkarte (Online-Kacheln) mit Import und Einstellungen.**
Noch keine GPS-Aufzeichnung, Kategorien-Verwaltung, Fotos oder Offline-Karte. Die Karte braucht aktuell eine Internetverbindung.

## Befehle
    npm install
    npm run dev      # Entwicklungsserver
    npm test         # Vitest
    npm run build    # Typprüfung + Produktions-Build nach dist/

## Deployment
Push auf `main` startet `.github/workflows/deploy.yml` (Test → Build → GitHub Pages).
Einmalig im Repo: Settings → Pages → Source: „GitHub Actions“.

## Dokumentation
`docs/` (Architektur, Projektstatus). Android/Capacitor folgt in einer späteren Phase.
