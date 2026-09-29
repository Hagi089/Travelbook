import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GpxDb,
  buildLocation,
  createManualTour,
  createTour,
  deleteCategory,
  getTrackPoints,
  listTours,
  parseDecimal,
  seedDefaultCategories,
  updateTourDetails,
  validateDate,
  type NewTour,
} from '../src/db';

let counter = 0;
let db: GpxDb;

beforeEach(async () => {
  db = new GpxDb(`manual-test-db-${++counter}`);
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
    ascentM: 300,
    descentM: 280,
    avgSpeedMs: 1.6,
    maxSpeedMs: 3.1,
    startPoint: { lat: 48, lon: 11 },
    endPoint: { lat: 48.1, lon: 11.1 },
    notes: '',
    source: 'gpx-import',
    ...over,
  };
}

describe('Eingabehilfen', () => {
  it('prüft Datumsangaben', () => {
    expect(validateDate('2026-02-28')).toBe('2026-02-28');
    expect(() => validateDate('2026-02-30')).toThrow(/Datum/);
    expect(() => validateDate('01.09.2026')).toThrow(/Datum/);
    expect(() => validateDate('')).toThrow(/Datum/);
  });

  it('liest Dezimalzahlen mit Komma oder Punkt, leer ergibt null', () => {
    expect(parseDecimal('12,5', 'x')).toBe(12.5);
    expect(parseDecimal(' 3.25 ', 'x')).toBe(3.25);
    expect(parseDecimal('-48,1', 'x')).toBe(-48.1);
    expect(parseDecimal('  ', 'x')).toBeNull();
    expect(() => parseDecimal('abc', 'Distanz')).toThrow(/Distanz/);
    expect(() => parseDecimal('1,2,3', 'x')).toThrow();
  });

  it('verlangt für einen Ort beide Koordinaten im gültigen Bereich', () => {
    expect(buildLocation(null, null)).toBeNull();
    expect(buildLocation(48.1, 11.5)).toEqual({ lat: 48.1, lon: 11.5 });
    expect(() => buildLocation(48, null)).toThrow(/Breite und Länge/);
    expect(() => buildLocation(91, 0)).toThrow(/Breite/);
    expect(() => buildLocation(0, -181)).toThrow(/Länge/);
  });
});

describe('Manuelle Touren', () => {
  it('legt eine Tour ohne Track an, Quelle manual', async () => {
    const t = await createManualTour(db, {
      name: '  Strandtag  ',
      categoryId: 'default-urlaub',
      date: '2026-08-15',
      notes: 'Schöner Tag',
      distanceM: 5000,
      durationSec: 3600,
      location: { lat: 36.7, lon: -4.4 },
    });
    expect(t.name).toBe('Strandtag');
    expect(t.source).toBe('manual');
    expect(t.startTime).toBeNull();
    expect(t.avgSpeedMs).toBeCloseTo(5000 / 3600);
    expect(t.startPoint).toEqual({ lat: 36.7, lon: -4.4 });
    expect(t.notes).toBe('Schöner Tag');
    expect(await getTrackPoints(db, t.id)).toHaveLength(0);
    expect((await db.tours.get(t.id))?.name).toBe('Strandtag');
  });

  it('kommt ohne Distanz, Dauer und Ort aus', async () => {
    const t = await createManualTour(db, { name: 'Unterkunft Rom', categoryId: 'default-unterkunft', date: '2026-05-01' });
    expect(t.distanceM).toBe(0);
    expect(t.durationSec).toBe(0);
    expect(t.avgSpeedMs).toBe(0);
    expect(t.startPoint).toBeNull();
    expect(t.endPoint).toBeNull();
  });

  it('weist ungültige Eingaben ab und speichert dann nichts', async () => {
    const base = { name: 'X', categoryId: 'default-urlaub', date: '2026-05-01' };
    await expect(createManualTour(db, { ...base, name: '   ' })).rejects.toThrow(/Name/);
    await expect(createManualTour(db, { ...base, date: '2026-13-01' })).rejects.toThrow(/Datum/);
    await expect(createManualTour(db, { ...base, distanceM: -1 })).rejects.toThrow(/Distanz/);
    await expect(createManualTour(db, { ...base, durationSec: -5 })).rejects.toThrow(/Dauer/);
    await expect(createManualTour(db, { ...base, location: { lat: 100, lon: 0 } })).rejects.toThrow(/Breite/);
    await expect(createManualTour(db, { ...base, categoryId: 'gibt-es-nicht' })).rejects.toThrow(/Kategorie/);
    expect(await db.tours.count()).toBe(0);
  });

  it('sortiert manuelle Touren ohne Startzeit nach Datum in die Liste ein', async () => {
    await createTour(db, imported({ name: 'alt', date: '2026-01-10', startTime: Date.UTC(2026, 0, 10, 8) }));
    await createManualTour(db, { name: 'manuell neu', categoryId: 'default-urlaub', date: '2026-06-01' });
    await createTour(db, imported({ name: 'mittel', date: '2026-03-01', startTime: Date.UTC(2026, 2, 1, 8) }));
    expect((await listTours(db)).map((t) => t.name)).toEqual(['manuell neu', 'mittel', 'alt']);
  });
});

describe('Tour bearbeiten', () => {
  it('ändert Name, Kategorie, Datum und Notizen und setzt updatedAt', async () => {
    const t = await createTour(db, imported());
    await new Promise((r) => setTimeout(r, 5));
    const u = await updateTourDetails(db, t.id, { name: ' Neu ', categoryId: 'default-fahrradfahren', date: '2026-09-02', notes: 'Notiz\nzweite Zeile' });
    expect(u.name).toBe('Neu');
    expect(u.categoryId).toBe('default-fahrradfahren');
    expect(u.date).toBe('2026-09-02');
    expect(u.notes).toBe('Notiz\nzweite Zeile');
    expect(u.createdAt).toBe(t.createdAt);
    expect(u.updatedAt).toBeGreaterThan(t.updatedAt);
    expect(u.distanceM).toBe(12000);
  });

  it('lässt berechnete Werte importierter Touren unverändert und verweigert deren Änderung', async () => {
    const t = await createTour(db, imported());
    await expect(updateTourDetails(db, t.id, { distanceM: 1 })).rejects.toThrow(/manuell/);
    await expect(updateTourDetails(db, t.id, { location: { lat: 1, lon: 1 } })).rejects.toThrow(/manuell/);
    const after = await db.tours.get(t.id);
    expect(after?.distanceM).toBe(12000);
    expect(after?.startPoint).toEqual({ lat: 48, lon: 11 });
  });

  it('berechnet bei manuellen Touren die Durchschnittsgeschwindigkeit neu und kann den Ort entfernen', async () => {
    const t = await createManualTour(db, { name: 'M', categoryId: 'default-wandern', date: '2026-05-01', distanceM: 4000, durationSec: 2000, location: { lat: 1, lon: 2 } });
    const u = await updateTourDetails(db, t.id, { distanceM: 6000, location: null });
    expect(u.distanceM).toBe(6000);
    expect(u.durationSec).toBe(2000);
    expect(u.avgSpeedMs).toBeCloseTo(3);
    expect(u.startPoint).toBeNull();
    expect(u.endPoint).toBeNull();
  });

  it('weist leeren Namen, ungültiges Datum und unbekannte Kategorie ab', async () => {
    const t = await createTour(db, imported());
    await expect(updateTourDetails(db, t.id, { name: '' })).rejects.toThrow(/Name/);
    await expect(updateTourDetails(db, t.id, { date: 'gestern' })).rejects.toThrow(/Datum/);
    await expect(updateTourDetails(db, t.id, { categoryId: 'gibt-es-nicht' })).rejects.toThrow(/Kategorie/);
    await expect(updateTourDetails(db, 'gibt-es-nicht', { name: 'x' })).rejects.toThrow(/nicht gefunden/);
    expect((await db.tours.get(t.id))?.name).toBe('Import');
  });
});

describe('Kategorie löschen mit Touren (Zusammenspiel mit der Verwaltung)', () => {
  it('verschiebt manuelle und importierte Touren in die Zielkategorie', async () => {
    const a = await createTour(db, imported());
    const b = await createManualTour(db, { name: 'M', categoryId: 'default-wandern', date: '2026-05-01' });
    await expect(deleteCategory(db, 'default-wandern')).rejects.toThrow(/Zielkategorie/);
    await deleteCategory(db, 'default-wandern', 'default-urlaub');
    expect((await db.tours.get(a.id))?.categoryId).toBe('default-urlaub');
    expect((await db.tours.get(b.id))?.categoryId).toBe('default-urlaub');
    expect(await db.categories.get('default-wandern')).toBeUndefined();
  });
});
