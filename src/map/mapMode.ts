import type { MapMode } from './tileSource';

const KEY = 'gpx-tracker.mapMode';

/** Gewählter Kartenmodus (Standard: online). */
export function getMapMode(): MapMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'offline') return 'offline';
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 'online';
}

export function setMapMode(mode: MapMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignorieren */
  }
}
