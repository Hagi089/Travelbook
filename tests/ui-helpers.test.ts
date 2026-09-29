import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '../src/db/types';
import { toSegments } from '../src/map/simplify';
import { FIT_MAX_ZOOM, getMapBackground, getTileSource, MAP_MAX_ZOOM, OFFLINE_COUNTRIES, ONLINE_OSM } from '../src/map/tileSource';
import { formatDate, formatDistance, formatDuration, formatSpeed } from '../src/ui/format';

function p(seq: number, segment = 0): TrackPoint {
  return { tourId: 't', seq, segment, lat: seq * 0.001, lon: 0, ele: null, time: null, accuracy: null };
}

describe('toSegments', () => {
  it('behält kurze Tracks unverändert und trennt Segmente', () => {
    const segs = toSegments([p(0, 0), p(1, 0), p(2, 1), p(3, 1)]);
    expect(segs).toEqual([
      [[0, 0], [1 * 0.001, 0]],
      [[2 * 0.001, 0], [3 * 0.001, 0]],
    ]);
  });

  it('dünnt lange Tracks aus und behält Anfang und Ende', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => p(i));
    const [seg] = toSegments(pts, 100);
    expect(seg!.length).toBeLessThanOrEqual(100);
    expect(seg!.length).toBeGreaterThan(50);
    expect(seg![0]).toEqual([0, 0]);
    expect(seg![seg!.length - 1]).toEqual([4999 * 0.001, 0]);
  });

  it('liefert für leere Eingabe keine Segmente', () => {
    expect(toSegments([])).toEqual([]);
  });
});

describe('Kartenquelle', () => {
  it('liefert online die OSM-Kacheln und offline Länderflächen ohne Kacheln und ohne Internet', () => {
    expect(getTileSource('online')).toBe(ONLINE_OSM);
    expect(getTileSource('offline')).toBeNull();
    expect(getMapBackground('online')).toEqual({ kind: 'tiles', source: ONLINE_OSM });
    expect(getMapBackground('offline')).toEqual({ kind: 'countries', base: OFFLINE_COUNTRIES });
    expect(OFFLINE_COUNTRIES.requiresInternet).toBe(false);
  });
  it('begrenzt die Zoomstufe auch ohne Kachelebene (Offline-Karte, einzelner Punkt)', () => {
    expect(Number.isFinite(MAP_MAX_ZOOM)).toBe(true);
    expect(MAP_MAX_ZOOM).toBe(ONLINE_OSM.maxZoom);
    expect(FIT_MAX_ZOOM).toBeLessThan(MAP_MAX_ZOOM);
  });
});

describe('Formatierung', () => {
  it('formatiert Distanz, Dauer und Geschwindigkeit', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12340)).toBe('12,34 km');
    expect(formatDuration(0)).toBe('–');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(3600 + 5 * 60)).toBe('1 h 05 min');
    expect(formatSpeed(0)).toBe('–');
    expect(formatSpeed(10)).toBe('36,0 km/h');
    expect(formatDate('2026-08-14')).toBe('14.08.2026');
    expect(formatDate('unbekannt')).toBe('unbekannt');
  });
});
