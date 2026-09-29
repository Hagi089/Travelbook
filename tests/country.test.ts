import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GpxDb,
  assignCountries,
  createManualTour,
  createTour,
  getTour,
  seedDefaultCategories,
  setTourCountry,
  updateTourDetails,
  type NewTour,
} from '../src/db';
import { COUNTRY_DATA } from '../src/geo/countryData';
import { SNAP_KM, countryName, findCountry, parseCountryData, sortedCountryCodes, type CountryIndex } from '../src/geo/countries';

describe('Ländererkennung (gebündelte Grenzen)', () => {
  let index: CountryIndex;
  beforeAll(() => {
    index = parseCountryData(COUNTRY_DATA);
  });

  it('enthält rund 230 Länder und Gebiete', () => {
    expect(index.codes.length).toBeGreaterThan(220);
    expect(index.codes).toContain('DE');
    expect(index.codes).toContain('XK');
  });

  const cases: Array<[string, number, number, string]> = [
    ['Berlin', 52.52, 13.405, 'DE'],
    ['München', 48.137, 11.575, 'DE'],
    ['Paris', 48.857, 2.352, 'FR'],
    ['Oslo', 59.91, 10.75, 'NO'],
    ['Bozen (Südtirol)', 46.5, 11.35, 'IT'],
    ['Innsbruck', 47.27, 11.39, 'AT'],
    ['Zürich', 47.37, 8.54, 'CH'],
    ['San Marino (Enklave in Italien)', 43.9424, 12.4578, 'SM'],
    ['Monaco', 43.7384, 7.4246, 'MC'],
    ['Vaduz', 47.141, 9.5215, 'LI'],
    ['Maseru (Lesotho, Enklave in Südafrika)', -29.31, 27.48, 'LS'],
    ['Kapstadt', -33.92, 18.42, 'ZA'],
    ['Pristina (Kosovo)', 42.66, 21.17, 'XK'],
    ['Nikosia Nordteil (zählt zu Zypern)', 35.19, 33.36, 'CY'],
    ['Palma de Mallorca', 39.57, 2.65, 'ES'],
    ['Teneriffa', 28.29, -16.63, 'ES'],
    ['Madeira', 32.65, -16.91, 'PT'],
    ['Maputo', -25.97, 32.57, 'MZ'],
    ['Tokio', 35.68, 139.69, 'JP'],
    ['Sydney', -33.87, 151.21, 'AU'],
    ['Nuuk', 64.18, -51.72, 'GL'],
  ];
  for (const [name, lat, lon, code] of cases) {
    it(`ordnet ${name} zu ${code}`, () => {
      expect(findCountry(index, lat, lon)).toBe(code);
    });
  }

  it('ordnet einen Punkt kurz vor der Küste dem Küstenland zu', () => {
    expect(findCountry(index, 54.9, 8.1)).toBe('DE'); // Nordsee bei Sylt, wenige km vor dem Land
  });

  it('liefert für offenes Meer null (weiter als SNAP_KM von jedem Land)', () => {
    expect(SNAP_KM).toBe(20);
    expect(findCountry(index, 30, -40)).toBeNull();
    expect(findCountry(index, 0, 0)).toBeNull();
  });

  it('liefert für ungültige Koordinaten null', () => {
    expect(findCountry(index, Number.NaN, 10)).toBeNull();
    expect(findCountry(index, 91, 10)).toBeNull();
    expect(findCountry(index, 10, 181)).toBeNull();
  });

  it('liefert deutsche Ländernamen und fällt sonst auf den Code zurück', () => {
    expect(countryName('DE')).toBe('Deutschland');
    expect(countryName('MZ')).toBe('Mosambik');
    expect(countryName('ZZ')).toBeTruthy();
  });

  it('sortiert Ländercodes nach deutschem Namen', () => {
    const sorted = sortedCountryCodes(index);
    expect(sorted).toHaveLength(index.codes.length);
    expect(sorted.indexOf('EG')).toBeLessThan(sorted.indexOf('DE')); // „Ägypten“ sortiert wie „A“
    expect(sorted.indexOf('DE')).toBeLessThan(sorted.indexOf('AT')); // „Deutschland“ vor „Österreich“ (Ö wie O)
  });
});

let counter = 0;
let db: GpxDb;

beforeEach(async () => {
  db = new GpxDb(`country-test-db-${++counter}`);
  await db.open();
  await seedDefaultCategories(db);
});

function imported(over: Partial<NewTour> = {}): NewTour {
  return {
    name: 'Import',
    categoryId: 'default-wandern',
    date: '2026-09-01',
    startTime: Date.UTC(2026, 8, 1, 8),
    endTime: Date.UTC(2026, 8, 1, 10),
    durationSec: 7200,
    distanceM: 12000,
    ascentM: 0,
    descentM: 0,
    avgSpeedMs: 1.6,
    maxSpeedMs: 3.1,
    startPoint: { lat: 52.52, lon: 13.405 },
    endPoint: { lat: 52.53, lon: 13.41 },
    notes: '',
    source: 'gpx-import',
    ...over,
  };
}

describe('assignCountries', () => {
  it('ergänzt das Land aus dem Startpunkt und lässt updatedAt unverändert', async () => {
    const t = await createTour(db, imported());
    expect(t.countryCode).toBeUndefined();
    expect(await assignCountries(db)).toBe(1);
    const after = await getTour(db, t.id);
    expect(after?.countryCode).toBe('DE');
    expect(after?.updatedAt).toBe(t.updatedAt);
  });

  it('speichert null ohne Startpunkt oder ohne Treffer', async () => {
    const none = await createTour(db, imported({ startPoint: null, endPoint: null }));
    const sea = await createTour(db, imported({ startPoint: { lat: 30, lon: -40 } }));
    await assignCountries(db);
    expect((await getTour(db, none.id))?.countryCode).toBeNull();
    expect((await getTour(db, sea.id))?.countryCode).toBeNull();
  });

  it('rechnet nichts doppelt (zweiter Lauf ändert nichts)', async () => {
    await createTour(db, imported());
    expect(await assignCountries(db)).toBe(1);
    expect(await assignCountries(db)).toBe(0);
  });

  it('überspringt laufende Aufnahmen und holt sie nach dem Abschluss nach', async () => {
    const rec = await createTour(db, imported({ source: 'recording', endTime: null, startPoint: null, endPoint: null }));
    expect(await assignCountries(db)).toBe(0);
    expect((await getTour(db, rec.id))?.countryCode).toBeUndefined();
    await db.tours.update(rec.id, { endTime: Date.now(), startPoint: { lat: 48.857, lon: 2.352 } });
    expect(await assignCountries(db)).toBe(1);
    expect((await getTour(db, rec.id))?.countryCode).toBe('FR');
  });

  it('überschreibt kein von Hand gesetztes Land', async () => {
    const t = await createTour(db, imported({ countryCode: 'FR', countryManual: true }));
    expect(await assignCountries(db)).toBe(0);
    expect((await getTour(db, t.id))?.countryCode).toBe('FR');
  });

  it('bestehende Touren ohne Länderfeld (Daten aus früheren Versionen) werden ergänzt', async () => {
    const t = await createTour(db, imported({ startPoint: { lat: 43.7384, lon: 7.4246 } }));
    const raw = await db.tours.get(t.id);
    expect(raw?.countryCode).toBeUndefined();
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBe('MC');
  });
});

describe('setTourCountry', () => {
  it('setzt ein Land von Hand und merkt es als manuell', async () => {
    const t = await createTour(db, imported());
    await assignCountries(db);
    const changed = await setTourCountry(db, t.id, { kind: 'code', code: 'AT' });
    expect(changed.countryCode).toBe('AT');
    expect(changed.countryManual).toBe(true);
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBe('AT');
  });

  it('„Kein Land“ speichert null als manuelle Wahl', async () => {
    const t = await createTour(db, imported());
    await assignCountries(db);
    const changed = await setTourCountry(db, t.id, { kind: 'none' });
    expect(changed.countryCode).toBeNull();
    expect(changed.countryManual).toBe(true);
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBeNull();
  });

  it('„Automatisch“ hebt die manuelle Wahl auf und berechnet neu', async () => {
    const t = await createTour(db, imported({ countryCode: 'FR', countryManual: true }));
    const reset = await setTourCountry(db, t.id, { kind: 'auto' });
    expect(reset.countryCode).toBeUndefined();
    expect(reset.countryManual).toBe(false);
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBe('DE');
  });

  it('lehnt unbekannte Ländercodes und unbekannte Touren ab', async () => {
    const t = await createTour(db, imported());
    await expect(setTourCountry(db, t.id, { kind: 'code', code: 'ZZ' })).rejects.toThrow(/Ländercode/);
    await expect(setTourCountry(db, 'gibt-es-nicht', { kind: 'none' })).rejects.toThrow(/nicht gefunden/);
  });
});

describe('Land bei manuellen Touren', () => {
  it('Ortsänderung berechnet das automatische Land neu', async () => {
    const t = await createManualTour(db, { name: 'Stellplatz', categoryId: 'default-womo-stellplatz', date: '2026-09-01', location: { lat: 52.52, lon: 13.405 } });
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBe('DE');
    await updateTourDetails(db, t.id, { location: { lat: 48.857, lon: 2.352 } });
    expect((await getTour(db, t.id))?.countryCode).toBeUndefined();
    await assignCountries(db);
    expect((await getTour(db, t.id))?.countryCode).toBe('FR');
  });

  it('Ortsänderung lässt ein von Hand gesetztes Land unverändert', async () => {
    const t = await createManualTour(db, { name: 'Stellplatz', categoryId: 'default-womo-stellplatz', date: '2026-09-01', location: { lat: 52.52, lon: 13.405 } });
    await setTourCountry(db, t.id, { kind: 'code', code: 'AT' });
    await updateTourDetails(db, t.id, { location: { lat: 48.857, lon: 2.352 } });
    expect((await getTour(db, t.id))?.countryCode).toBe('AT');
  });

  it('gleicher Ort beim Speichern setzt das Land nicht zurück', async () => {
    const t = await createManualTour(db, { name: 'Stellplatz', categoryId: 'default-womo-stellplatz', date: '2026-09-01', location: { lat: 52.52, lon: 13.405 } });
    await assignCountries(db);
    await updateTourDetails(db, t.id, { name: 'Umbenannt', location: { lat: 52.52, lon: 13.405 } });
    expect((await getTour(db, t.id))?.countryCode).toBe('DE');
  });
});
