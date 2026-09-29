import { OFFLINE_MAPS_AVAILABLE, type MapMode } from './tileSource';

const KEY = 'gpx-tracker.mapMode';

/** Gewählter Kartenmodus; ein gespeicherter Offline-Modus wird ignoriert, solange Offline-Karten fehlen. */
export function getMapMode(): MapMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'offline' && OFFLINE_MAPS_AVAILABLE) return 'offline';
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 'online';
}

export function setMapMode(mode: MapMode): void {
  if (mode === 'offline' && !OFFLINE_MAPS_AVAILABLE) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignorieren */
  }
}
