# GPX Tracker

Persönliche GPX-Touren-App (PWA + Android via Capacitor). **Stand: Phase 3 – lokale Datenbank (`src/db`) und GPX-Import/-Export samt Berechnungen (`src/gpx`).**
Noch keine Oberfläche, Karte oder GPS-Aufzeichnung.

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
