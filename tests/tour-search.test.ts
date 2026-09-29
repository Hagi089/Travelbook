import { describe, expect, it } from 'vitest';
import { LATEST_TOUR_COUNT, queryTours, tourCountryCodes, tourYears, type Tour } from '../src/db';

let n = 0;
function tour(over: Partial<Tour> = {}): Tour {
  n += 1;
  return {
    id: `t${n}`,
    name: `Tour ${n}`,
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
    source: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('queryTours: Suche', () => {
  const tours = [
    tour({ name: 'Rundweg am Gardasee', notes: 'Sonne, Eis am Ufer', date: '2025-06-01' }),
    tour({ name: 'Radtour Mosel', notes: 'Regen', date: '2024-08-15' }),
    tour({ name: 'Stellplatz Ölberg', notes: 'ruhig, mit Aussicht auf den See', date: '2026-03-10' }),
  ];

  it('ohne Bedingungen bleiben alle Touren, neueste zuerst', () => {
    expect(queryTours(tours, {}).map((t) => t.date)).toEqual(['2026-03-10', '2025-06-01', '2024-08-15']);
  });

  it('findet im Namen und ignoriert Groß-/Kleinschreibung', () => {
    expect(queryTours(tours, { text: 'gardasee' }).map((t) => t.name)).toEqual(['Rundweg am Gardasee']);
  });

  it('findet in den Notizen', () => {
    expect(queryTours(tours, { text: 'regen' }).map((t) => t.name)).toEqual(['Radtour Mosel']);
  });

  it('alle Wörter müssen vorkommen (Name oder Notizen gemischt)', () => {
    expect(queryTours(tours, { text: 'Ölberg aussicht' }).map((t) => t.name)).toEqual(['Stellplatz Ölberg']);
    expect(queryTours(tours, { text: 'Gardasee Regen' })).toEqual([]);
  });

  it('Umlaute funktionieren auch in Großschreibung', () => {
    expect(queryTours(tours, { text: 'ÖLBERG' })).toHaveLength(1);
  });

  it('leerer oder nur aus Leerzeichen bestehender Text filtert nicht', () => {
    expect(queryTours(tours, { text: '   ' })).toHaveLength(3);
  });

  it('Suchtext wird nicht als regulärer Ausdruck gedeutet', () => {
    expect(queryTours(tours, { text: '.*' })).toEqual([]);
    expect(queryTours([tour({ name: 'A (B) +C' })], { text: '(b) +c' })).toHaveLength(1);
  });

  it('verändert die Eingabeliste nicht', () => {
    const before = tours.map((t) => t.id);
    queryTours(tours, { text: 'see', latest: 1 });
    expect(tours.map((t) => t.id)).toEqual(before);
  });
});

describe('queryTours: Jahr und Letzte Touren', () => {
  it('filtert nach Jahr', () => {
    const tours = [tour({ date: '2025-12-31' }), tour({ date: '2026-01-01' }), tour({ date: '2026-07-04' })];
    expect(queryTours(tours, { year: '2026' }).map((t) => t.date)).toEqual(['2026-07-04', '2026-01-01']);
    expect(queryTours(tours, { year: '2019' })).toEqual([]);
  });

  it('liefert die neuesten N, auch wenn die Eingabe unsortiert ist', () => {
    const tours = Array.from({ length: 15 }, (_, i) => tour({ date: `2026-01-${String(i + 1).padStart(2, '0')}` }));
    const shuffled = [...tours].reverse().sort((a, b) => (a.id < b.id ? -1 : 1));
    const result = queryTours(shuffled, { latest: LATEST_TOUR_COUNT });
    expect(result).toHaveLength(10);
    expect(result[0]?.date).toBe('2026-01-15');
    expect(result[9]?.date).toBe('2026-01-06');
  });

  it('gleicher Tag: spätere Startzeit zuerst, manuelle Touren ohne Startzeit zuletzt', () => {
    const a = tour({ date: '2026-05-01', startTime: 1000, name: 'früh' });
    const b = tour({ date: '2026-05-01', startTime: 2000, name: 'spät' });
    const c = tour({ date: '2026-05-01', startTime: null, name: 'manuell' });
    expect(queryTours([c, a, b], {}).map((t) => t.name)).toEqual(['spät', 'früh', 'manuell']);
  });

  it('weniger Touren als N: alle werden geliefert', () => {
    expect(queryTours([tour(), tour()], { latest: 10 })).toHaveLength(2);
  });

  it('kombiniert Suche, Jahr und Letzte N (erst filtern, dann kürzen)', () => {
    const tours = [
      tour({ name: 'See A', date: '2026-01-01' }),
      tour({ name: 'See B', date: '2026-02-01' }),
      tour({ name: 'See C', date: '2025-03-01' }),
      tour({ name: 'Berg', date: '2026-04-01' }),
    ];
    expect(queryTours(tours, { text: 'see', year: '2026' }).map((t) => t.name)).toEqual(['See B', 'See A']);
    expect(queryTours(tours, { text: 'see', latest: 1 }).map((t) => t.name)).toEqual(['See B']);
  });
});

describe('tourYears', () => {
  it('liefert Jahre ohne Duplikate, neueste zuerst', () => {
    const tours = [tour({ date: '2024-05-01' }), tour({ date: '2026-01-01' }), tour({ date: '2024-09-09' }), tour({ date: '2025-02-02' })];
    expect(tourYears(tours)).toEqual(['2026', '2025', '2024']);
  });

  it('ignoriert ungültige Datumswerte und liefert bei leerer Liste nichts', () => {
    expect(tourYears([tour({ date: 'kaputt' })])).toEqual([]);
    expect(tourYears([])).toEqual([]);
  });
});

describe('Land', () => {
  const tours = [
    tour({ name: 'A', countryCode: 'DE', date: '2026-01-01' }),
    tour({ name: 'B', countryCode: 'FR', date: '2026-02-01' }),
    tour({ name: 'C', countryCode: null, date: '2026-03-01' }),
    tour({ name: 'D', date: '2026-04-01' }), // Land noch nicht berechnet
    tour({ name: 'E', countryCode: 'DE', date: '2025-05-01' }),
  ];

  it('filtert nach Ländercode; Touren ohne Land fallen heraus', () => {
    expect(queryTours(tours, { country: 'DE' }).map((t) => t.name)).toEqual(['A', 'E']);
    expect(queryTours(tours, { country: 'FR' }).map((t) => t.name)).toEqual(['B']);
    expect(queryTours(tours, { country: 'AT' })).toEqual([]);
  });

  it('kombiniert Land mit Jahr und Suche', () => {
    expect(queryTours(tours, { country: 'DE', year: '2026' }).map((t) => t.name)).toEqual(['A']);
    expect(queryTours(tours, { country: 'DE', text: 'e' }).map((t) => t.name)).toEqual(['E']);
  });

  it('listet vorkommende Ländercodes ohne Duplikate und ohne leere Werte', () => {
    expect(tourCountryCodes(tours).sort()).toEqual(['DE', 'FR']);
    expect(tourCountryCodes([])).toEqual([]);
  });
});
