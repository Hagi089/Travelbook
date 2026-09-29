import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GpxDb, addPhoto, createCategory, createManualTour, createTour, getTrackPoints, listCategories, listPhotos, seedDefaultCategories, type NewTour, type NewTrackPoint } from '../src/db';
import { applyBackup, createBackup, readBackup } from '../src/backup';
import { ZipReader, ZipWriter } from '../src/backup/zip';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../src/backup/format';

let counter = 0;
async function freshDb(): Promise<GpxDb> {
  const db = new GpxDb(`backup-test-db-${++counter}`);
  await db.open();
  await seedDefaultCategories(db);
  return db;
}

function tourInput(over: Partial<NewTour> = {}): NewTour {
  return {
    name: 'Testtour', categoryId: 'default-wandern', date: '2026-09-01', startTime: Date.UTC(2026, 8, 1, 8), endTime: Date.UTC(2026, 8, 1, 10), durationSec: 7200,
    distanceM: 12000, ascentM: 300, descentM: 280, avgSpeedMs: 1.6, maxSpeedMs: 3.1, startPoint: { lat: 48, lon: 11 }, endPoint: { lat: 48.1, lon: 11.1 }, notes: 'Notiz mit Umlaut ä', source: 'gpx-import', ...over,
  };
}

function points(n: number): NewTrackPoint[] {
  return Array.from({ length: n }, (_, i) => ({ segment: i < n / 2 ? 0 : 1, lat: 48 + i * 1e-5, lon: 11 + i * 1e-5, ele: i % 7 === 0 ? null : 500 + i, time: Date.UTC(2026, 8, 1, 8) + i * 1000, accuracy: i % 5 === 0 ? null : 4.5 }));
}

const JPEG = (n: number): Blob => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 1, 2, 3, 4, 250, 251])], { type: 'image/jpeg' });

async function bytesOf(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}

async function snapshot(db: GpxDb) {
  const tours = (await db.tours.toArray()).sort((a, b) => a.id.localeCompare(b.id));
  const pts: Record<string, unknown[]> = {};
  const photos: Record<string, { meta: unknown; bytes: number[] }[]> = {};
  for (const t of tours) {
    pts[t.id] = await getTrackPoints(db, t.id);
    photos[t.id] = await Promise.all((await listPhotos(db, t.id)).map(async ({ data, ...meta }) => ({ meta, bytes: await bytesOf(data) })));
  }
  return { categories: await listCategories(db), tours, waypoints: (await db.waypoints.toArray()).sort((a, b) => a.id.localeCompare(b.id)), pts, photos };
}

/** Quelle mit Import-Tour (Track, Waypoint, Land), Kategorie, Fotos und manueller Tour. */
async function buildSource(): Promise<{ db: GpxDb; tourId: string; manualId: string }> {
  const db = await freshDb();
  const cat = await createCategory(db, { name: 'Kajak', color: '#123456' });
  const tour = await createTour(db, tourInput({ name: 'Runde', categoryId: cat.id, countryCode: 'DE', countryManual: false }), points(200), [{ lat: 48.5, lon: 11.5, name: 'Gipfel', ele: 900, time: null }]);
  await addPhoto(db, tour.id, { data: JPEG(1), mimeType: 'image/jpeg', width: 10, height: 20 });
  await addPhoto(db, tour.id, { data: JPEG(2), mimeType: 'image/jpeg', width: 30, height: 40 });
  const manual = await createManualTour(db, { name: 'Stellplatz', categoryId: 'default-womo-stellplatz', date: '2026-08-15', notes: '', distanceM: null, durationSec: null, location: { lat: 43.7, lon: 7.2 } });
  return { db, tourId: tour.id, manualId: manual.id };
}

describe('Backup: Erstellen und Wiederherstellen', () => {
  let source: Awaited<ReturnType<typeof buildSource>>;
  beforeEach(async () => {
    source = await buildSource();
  });

  it('enthält Manifest mit Zahlen und Einstellungen, Tracks und Fotos als Dateien', async () => {
    const res = await createBackup(source.db, { 'gpx-tracker.theme': 'dark' }, Date.UTC(2026, 8, 29, 12));
    expect(res.fileName).toMatch(/^travelbook-backup-2026-09-29\.zip$/);
    expect(res.manifest.counts).toEqual({ categories: 7, tours: 2, trackPoints: 200, waypoints: 1, photos: 2 });
    const zip = await ZipReader.open(res.blob);
    const names = [...zip.entries.keys()];
    expect(names).toContain('manifest.json');
    expect(names).toContain(`data/tracks/${source.tourId}.json`);
    expect(names.filter((n) => n.startsWith('photos/'))).toHaveLength(2);
    expect(names.some((n) => n.includes(source.manualId) && n.startsWith('data/tracks/'))).toBe(false);
    expect((await zip.json<{ settings: Record<string, string> }>('manifest.json')).settings).toEqual({ 'gpx-tracker.theme': 'dark' });
  });

  it('Ersetzen: Roundtrip in eine andere Datenbank ergibt identische Daten (Fotos byte-genau)', async () => {
    const res = await createBackup(source.db, {});
    const target = await freshDb();
    const extra = await createTour(target, tourInput({ name: 'Nur hier' }), points(3));
    await addPhoto(target, extra.id, { data: JPEG(9), mimeType: 'image/jpeg', width: 1, height: 1 });

    const data = await readBackup(res.blob);
    const result = await applyBackup(target, data, 'replace');
    expect(result).toMatchObject({ mode: 'replace', toursAdded: 2, toursRemoved: 1, trackPoints: 200, photos: 2 });

    expect(await snapshot(target)).toEqual(await snapshot(source.db));
    expect(await target.tours.get(extra.id)).toBeUndefined();
    expect(await listPhotos(target, extra.id)).toHaveLength(0);
    expect(await getTrackPoints(target, extra.id)).toHaveLength(0);
  });

  it('Ersetzen: gleiche Kennung wird mit der Version aus dem Backup überschrieben, Kinder werden ersetzt', async () => {
    const res = await createBackup(source.db, {});
    const target = await freshDb();
    await applyBackup(target, await readBackup(res.blob), 'replace');
    await target.tours.update(source.tourId, { name: 'Lokal geändert' });
    await addPhoto(target, source.tourId, { data: JPEG(7), mimeType: 'image/jpeg', width: 1, height: 1 });
    const result = await applyBackup(target, await readBackup(res.blob), 'replace');
    expect(result.toursOverwritten).toBe(2);
    expect((await target.tours.get(source.tourId))?.name).toBe('Runde');
    expect(await listPhotos(target, source.tourId)).toHaveLength(2);
    expect(await getTrackPoints(target, source.tourId)).toHaveLength(200);
  });

  it('Ersetzen in leerer, nie befüllter Datenbank setzt den Seed-Marker (Standardkategorien kommen nicht doppelt)', async () => {
    const res = await createBackup(source.db, {});
    const target = new GpxDb(`backup-test-db-${++counter}`);
    await target.open();
    await applyBackup(target, await readBackup(res.blob), 'replace');
    await seedDefaultCategories(target);
    expect((await listCategories(target)).map((c) => c.id).sort()).toEqual((await listCategories(source.db)).map((c) => c.id).sort());
  });

  it('Zusammenführen: ergänzt nur unbekannte Touren, lässt bestehende unverändert, ordnet Kategorien nach Namen zu', async () => {
    const res = await createBackup(source.db, {});
    const target = await freshDb();
    const ownKajak = await createCategory(target, { name: 'kajak', color: '#000000' }); // gleicher Name, andere Kennung
    const own = await createTour(target, tourInput({ name: 'Eigene Tour', categoryId: ownKajak.id }), points(5));
    // dieselbe Tour wie in der Quelle, lokal umbenannt und ohne Foto
    await createTour(target, tourInput({ id: source.manualId, name: 'Lokaler Stellplatz', categoryId: 'default-womo-stellplatz' }));

    const result = await applyBackup(target, await readBackup(res.blob), 'merge');
    expect(result).toMatchObject({ mode: 'merge', toursAdded: 1, toursSkipped: 1, categoriesAdded: 0, photos: 2, trackPoints: 200 });
    expect((await target.tours.get(source.manualId))?.name).toBe('Lokaler Stellplatz');
    expect((await target.tours.get(own.id))?.name).toBe('Eigene Tour');
    const added = await target.tours.get(source.tourId);
    expect(added?.categoryId).toBe(ownKajak.id);
    expect(await listPhotos(target, source.tourId)).toHaveLength(2);
    expect(await getTrackPoints(target, source.tourId)).toHaveLength(200);
    expect((await listCategories(target)).filter((c) => c.name.toLowerCase() === 'kajak')).toHaveLength(1);
  });

  it('Zusammenführen: legt unbekannte Kategorien am Ende der Reihenfolge an', async () => {
    const res = await createBackup(source.db, {});
    const target = await freshDb();
    const before = await listCategories(target);
    await applyBackup(target, await readBackup(res.blob), 'merge');
    const after = await listCategories(target);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].name).toBe('Kajak');
    expect(after[after.length - 1].sortOrder).toBeGreaterThan(Math.max(...before.map((c) => c.sortOrder)));
  });

  it('übersteht eine Tour mit 50.000 Trackpunkten', async () => {
    const db = await freshDb();
    const big = await createTour(db, tourInput({ name: 'Groß' }), points(50000));
    const res = await createBackup(db, {});
    const target = await freshDb();
    await applyBackup(target, await readBackup(res.blob), 'replace');
    const back = await getTrackPoints(target, big.id);
    expect(back).toHaveLength(50000);
    expect(back[49999]).toEqual((await getTrackPoints(db, big.id))[49999]);
  }, 60000);
});

describe('Backup: Schutz und Fehlerfälle', () => {
  it('sichert und überschreibt nichts bei laufender Aufnahme', async () => {
    const source = await buildSource();
    const res = await createBackup(source.db, {});
    const db = await freshDb();
    await createTour(db, tourInput({ name: 'läuft', source: 'recording', endTime: null }));
    await expect(createBackup(db, {})).rejects.toThrow('Aufnahme');
    await expect(applyBackup(db, await readBackup(res.blob), 'replace')).rejects.toThrow('Aufnahme');
    expect(await db.tours.count()).toBe(1);
  });

  it('meldet ein beschädigtes Foto und schreibt nichts', async () => {
    const source = await buildSource();
    const res = await createBackup(source.db, {});
    const bytes = new Uint8Array(await res.blob.arrayBuffer());
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff && bytes[i + 3] === 1) {
        bytes[i + 8] ^= 0xff;
        break;
      }
    }
    await expect(readBackup(new Blob([bytes]))).rejects.toThrow('beschädigt');
  });

  it('lehnt fremde ZIP-Dateien, Nicht-ZIP und neuere Formate ab', async () => {
    await expect(readBackup(new Blob(['kein zip, aber lang genug für die Mindestgröße']))).rejects.toThrow('kein gültiges ZIP');
    const other = new ZipWriter();
    await other.add('foto.jpg', 'x');
    await expect(readBackup(other.finish())).rejects.toThrow('kein Travelbook-Backup');
    const newer = new ZipWriter();
    await newer.add('manifest.json', JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, createdAt: 1, counts: { categories: 0, tours: 0, trackPoints: 0, waypoints: 0, photos: 0 } }));
    await expect(readBackup(newer.finish())).rejects.toThrow('neueren App-Version');
  });

  it('erkennt fehlende Dateien und falsche Anzahlen', async () => {
    const source = await buildSource();
    const res = await createBackup(source.db, {});
    const zip = await ZipReader.open(res.blob);
    // ohne die Track-Datei: Anzahl der Trackpunkte passt nicht zum Manifest
    const w = new ZipWriter();
    for (const name of zip.entries.keys()) {
      if (name === `data/tracks/${source.tourId}.json`) continue;
      await w.add(name, await zip.bytes(name));
    }
    await expect(readBackup(w.finish())).rejects.toThrow('Trackpunkte');
    // ohne Foto-Datei
    const w2 = new ZipWriter();
    for (const name of zip.entries.keys()) {
      if (name.startsWith('photos/')) continue;
      await w2.add(name, await zip.bytes(name));
    }
    await expect(readBackup(w2.finish())).rejects.toThrow('fehlt');
  });
});
