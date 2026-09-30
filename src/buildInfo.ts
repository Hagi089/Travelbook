/**
 * Versionsangabe der laufenden App. Die Werte setzt der Build (vite.config.ts, `define`); so zeigt jede Installation
 * (Web-App oder APK) genau den Stand, aus dem sie gebaut wurde. Ohne Build (z. B. Tests) gelten Ersatzwerte.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const PHASE_LABEL = 'Version 0.8 – Stand Phase 8 (Backup, Offline-Nutzung, Offline-Karte)';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unbekannt';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** Z. B. „Version 0.8.1 · Build a1b2c3d · 30.09.2026, 07:10“. */
export function buildInfoText(version = APP_VERSION, commit = BUILD_COMMIT, time = BUILD_TIME): string {
  const d = time ? new Date(time) : null;
  const when = d && Number.isFinite(d.getTime()) ? d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return [`Version ${version}`, `Build ${commit}`, when].filter(Boolean).join(' · ');
}
