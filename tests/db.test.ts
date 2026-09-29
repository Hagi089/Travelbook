import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  GpxDb,
  MAX_PHOTOS_PER_TOUR,
  addPhoto,
  createCategory,
  createTour,
  deleteCategory,
  deleteTour,
  getTour,
  getTrackPoints,
  listCategories,
  listPhotos,
  listTours,
  seedDefaultCategories,
  updateCategory,
  updateTour,
  type NewTour,
  type NewTrackPoint,
} from '../src/db';

let counter = 0;
let db: GpxDb;

beforeEach(async () => {
  db = new GpxDb(`test-db-${++counter}`);
  await db.open();
});

function tourInput(categoryId: string, over: Partial<NewTour> = {}): NewTour {
  return {
    name: 'Testtour',
    categoryId,
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

function points(n: number): NewTrackPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    segment: i < n / 2 ? 0 : 1,
    lat: 48 + i * 0.0001,
    lon: 11 + i * 0.0001,
    ele: i % 3 === 0 ? null : 500 + i,
    time: i % 5 === 0 ? null : Date.UTC(2026, 8, 1, 8) + i * 1000,
    accuracy: null,
  }));
}

describe('Kategorien', () => {
  it('legt die 6 Standardkategorien einmalig an', async () => {
    await seedDefaultCategories(db);
    await seedDefaultCategories(db);
    const cats = await listCategories(db);
    expect(cats.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(cats.every((c) => c.isDefault)).toBe(true);
  });

  it('bringt gelöschte Standardkategorien nicht zurück', async () => {
    await seedDefaultCategories(db);
    await deleteCategory(db, 'default-tauchen');
    await seedDefaultCategories(db);
    const names = (await listCategories(db)).map((c) => c.name);
    expect(names).toHaveLength(5);
    expect(names).not.toContain('Tauchen');
  });

  it('erstellt, benennt um und lehnt Duplikate/leere Namen ab', async () => {
    await seedDefaultCategories(db);
    const c = await createCategory(db, { name: '  Skitour ', color: '#000000' });
    expect(c.name).toBe('Skitour');
    expect(c.sortOrder).toBe(6);
    await expect(createCategory(db, { name: 'skitour', color: '#111111' })).rejects.toThrow(/existiert bereits/);
    await expect(createCategory(db, { name: '   ', color: '#111111' })).rejects.toThrow(/leer/);
    const renamed = await updateCategory(db, c.id, { name: 'Skitouren' });
    expect(renamed.name).toBe('Skitouren');
    await expect(updateCategory(db, c.id, { name: 'Wandern' })).rejects.toThrow(/existiert bereits/);
  });

  it('löscht verwendete Kategorie nur mit Zielkategorie', async () => {
    await seedDefaultCategories(db);
    const t = await createTour(db, tourInput('default-wandern'));
    await expect(deleteCategory(db, 'default-wandern')).rejects.toThrow(/Zielkategorie/);
    expect(await db.categories.get('default-wandern')).toBeDefined();
    await deleteCategory(db, 'default-wandern', 'default-urlaub');
    expect(await db.categories.get('default-wandern')).toBeUndefined();
    expect((await getTour(db, t.id))?.categoryId).toBe('default-urlaub');
  });
});

describe('Touren', () => {
  beforeEach(async () => {
    await seedDefaultCategories(db);
  });

  it('speichert Tour und Trackpunkte verlustfrei und in Reihenfolge', async () => {
    const pts = points(10);
    const t = await createTour(db, tourInput('default-wandern'), pts);
    const back = await getTrackPoints(db, t.id);
    expect(back).toHaveLength(10);
    expect(back.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(back.map(({ tourId: _t, seq: _s, ...rest }) => rest)).toEqual(pts);
  });

  it('schreibt bei ungültiger Kategorie nichts', async () => {
    await expect(createTour(db, tourInput('gibt-es-nicht'), points(5))).rejects.toThrow(/Kategorie/);
    expect(await db.tours.count()).toBe(0);
    expect(await db.trackPoints.count()).toBe(0);
  });

  it('trennt Trackpunkte verschiedener Touren', async () => {
    const a = await createTour(db, tourInput('default-wandern'), points(4));
    const b = await createTour(db, tourInput('default-wandern'), points(7));
    expect(await getTrackPoints(db, a.id)).toHaveLength(4);
    expect(await getTrackPoints(db, b.id)).toHaveLength(7);
  });

  it('filtert nach Kategorie und Zeitraum, neueste zuerst', async () => {
    await createTour(db, tourInput('default-wandern', { name: 'A', date: '2026-01-10', startTime: 1 }));
    await createTour(db, tourInput('default-wandern', { name: 'B', date: '2026-06-10', startTime: 2 }));
    await createTour(db, tourInput('default-tauchen', { name: 'C', date: '2026-06-11', startTime: 3 }));
    expect((await listTours(db)).map((t) => t.name)).toEqual(['C', 'B', 'A']);
    expect((await listTours(db, { categoryId: 'default-wandern' })).map((t) => t.name)).toEqual(['B', 'A']);
    expect((await listTours(db, { fromDate: '2026-06-01', toDate: '2026-06-30' })).map((t) => t.name)).toEqual(['C', 'B']);
  });

  it('aktualisiert Tour, behält createdAt', async () => {
    const t = await createTour(db, tourInput('default-wandern'));
    const u = await updateTour(db, t.id, { notes: 'Schöner Tag', name: 'Neu' });
    expect(u.notes).toBe('Schöner Tag');
    expect(u.createdAt).toBe(t.createdAt);
    expect(u.updatedAt).toBeGreaterThanOrEqual(t.updatedAt);
    await expect(updateTour(db, t.id, { categoryId: 'nix' })).rejects.toThrow(/Kategorie/);
    await expect(updateTour(db, 'nix', { name: 'x' })).rejects.toThrow(/nicht gefunden/);
  });

  it('löscht Tour samt Trackpunkten, Waypoints und Fotos', async () => {
    const keep = await createTour(db, tourInput('default-wandern'), points(3));
    const t = await createTour(db, tourInput('default-wandern'), points(5), [
      { lat: 1, lon: 2, name: 'WP', ele: null, time: null },
    ]);
    await addPhoto(db, t.id, { data: new Blob(['x']), mimeType: 'image/jpeg', width: 1, height: 1 });
    await deleteTour(db, t.id);
    expect(await getTour(db, t.id)).toBeUndefined();
    expect(await getTrackPoints(db, t.id)).toHaveLength(0);
    expect(await db.waypoints.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    expect(await getTrackPoints(db, keep.id)).toHaveLength(3);
  });

  it('verarbeitet einen großen Track (20.000 Punkte)', async () => {
    const t = await createTour(db, tourInput('default-fahrradfahren'), points(20000));
    expect(await getTrackPoints(db, t.id)).toHaveLength(20000);
  }, 30000);
});

describe('Fotos', () => {
  it(`erlaubt höchstens ${MAX_PHOTOS_PER_TOUR} Fotos pro Tour`, async () => {
    await seedDefaultCategories(db);
    const t = await createTour(db, tourInput('default-urlaub'));
    const photo = { data: new Blob(['abc']), mimeType: 'image/jpeg', width: 10, height: 10 };
    for (let i = 0; i < MAX_PHOTOS_PER_TOUR; i++) await addPhoto(db, t.id, photo);
    await expect(addPhoto(db, t.id, photo)).rejects.toThrow(/höchstens/);
    expect(await listPhotos(db, t.id)).toHaveLength(MAX_PHOTOS_PER_TOUR);
    await expect(addPhoto(db, 'nix', photo)).rejects.toThrow(/nicht gefunden/);
  });
});
