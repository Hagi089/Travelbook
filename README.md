# GPX Tracker

Persönliche GPX-Touren-App (PWA + Android via Capacitor). **Stand: Phase 1 – nur Projektgerüst.**
Es sind noch keine Funktionen (Karte, Import, GPS-Aufzeichnung) implementiert.

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
