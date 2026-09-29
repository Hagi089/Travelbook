import { describe, expect, it } from 'vitest';
import { activityTotals, placeStats } from '../src/dashboard/stats';
import type { Tour } from '../src/db/types';
import { formatInt, formatKm } from '../src/ui/format';

function tour(over: Partial<Tour>): Tour {
  return {
    id: Math.random().toString(36),
    name: 'T',
    categoryId: 'default-wandern',
    date: '2026-01-01',
    startTime: null,
    endTime: null,
    durationSec: 0,
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    avgSpeedMs: 0,
    maxSpeedMs: 0,
    startPoint: null,
    endPoint: null,
    notes: '',
    source: 'gpx-import',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('activityTotals', () => {
  it('summiert Anzahl, Distanz, Dauer und Aufstieg', () => {
    const t = activityTotals([
      tour({ distanceM: 10000, durationSec: 3600, ascentM: 200, descentM: 900 }),
      tour({ distanceM: 2500, durationSec: 1800, ascentM: 50 }),
      tour({ source: 'manual' }),
    ]);
    expect(t).toEqual({ count: 3, distanceM: 12500, durationSec: 5400, ascentM: 250 });
  });

  it('liefert für keine Touren lauter Nullen', () => {
    expect(activityTotals([])).toEqual({ count: 0, distanceM: 0, durationSec: 0, ascentM: 0 });
  });
});

describe('placeStats', () => {
  it('zählt Stellplätze über gleiche Namen und ordnet nach Besuchen', () => {
    const s = placeStats([
      tour({ name: 'Camping Adria', date: '2026-05-01' }),
      tour({ name: ' camping adria ', date: '2026-07-01' }),
      tour({ name: 'Camping Adria', date: '2025-08-01' }),
      tour({ name: 'Seeblick', date: '2026-06-01' }),
      tour({ name: 'Waldplatz', date: '2026-04-01' }),
    ]);
    expect(s.places).toBe(3);
    expect(s.top[0]).toEqual({ name: 'Camping Adria', visits: 3, lastDate: '2026-07-01' });
    // Gleichstand (je 1 Besuch): der zuletzt besuchte zuerst
    expect(s.top.map((p) => p.name)).toEqual(['Camping Adria', 'Seeblick', 'Waldplatz']);
  });

  it('begrenzt auf die Top 5', () => {
    const tours = Array.from({ length: 8 }, (_, i) => tour({ name: `P${i}`, date: `2026-01-0${i + 1}` }));
    const s = placeStats(tours, 5);
    expect(s.places).toBe(8);
    expect(s.top).toHaveLength(5);
  });

  it('ist ohne Touren leer', () => {
    expect(placeStats([])).toEqual({ places: 0, top: [] });
  });
});

describe('Formatierung von Summen', () => {
  it('trennt Tausender und rundet', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(12345.6)).toBe('12.346');
    expect(formatKm(1234500)).toBe('1.234,5 km');
    expect(formatKm(0)).toBe('0,0 km');
    expect(formatKm(950)).toBe('1,0 km');
  });
});
