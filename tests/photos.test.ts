import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GpxDb, addPhoto, createManualTour, listPhotos, seedDefaultCategories, MAX_PHOTOS_PER_TOUR } from '../src/db';
import { fitWithin } from '../src/photos/resize';

describe('fitWithin', () => {
  it('verkleinert proportional auf die längste Kante', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it('vergrößert kleine Bilder nie', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('liefert mindestens 1 px und lehnt ungültige Maße ab', () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1600, height: 1 });
    expect(() => fitWithin(0, 100)).toThrow('Maße');
  });
});

describe('Fotos pro Tour', () => {
  let db: GpxDb;
  let n = 0;
  beforeEach(async () => {
    db = new GpxDb(`photos-test-db-${++n}`);
    await db.open();
    await seedDefaultCategories(db);
  });

  it('erlaubt höchstens drei Fotos', async () => {
    const tour = await createManualTour(db, { name: 'T', categoryId: 'default-wandern', date: '2026-09-29', notes: '', distanceM: null, durationSec: null, location: null });
    const input = { data: new Blob(['x'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 10, height: 10 };
    for (let i = 0; i < MAX_PHOTOS_PER_TOUR; i++) await addPhoto(db, tour.id, input);
    await expect(addPhoto(db, tour.id, input)).rejects.toThrow('höchstens');
    expect(await listPhotos(db, tour.id)).toHaveLength(MAX_PHOTOS_PER_TOUR);
  });
});
