import Dexie from 'dexie';
import { SEEDED_KEY } from '../db/categories';
import type { GpxDb } from '../db/db';
import type { Category, MetaEntry, Photo, Tour, TrackPoint, Waypoint } from '../db/types';
import { hasOpenRecording, OPEN_RECORDING_MESSAGE, isOpenRecording, type Progress } from './export';
import {
  BackupError,
  CATEGORIES_FILE,
  MANIFEST_FILE,
  MAX_PHOTOS_PER_TOUR_IN_BACKUP,
  META_FILE,
  PHOTOS_FILE,
  TOURS_FILE,
  WAYPOINTS_FILE,
  assertUnique,
  isSafeId,
  parseCategory,
  parseList,
  parseManifest,
  parseMetaEntry,
  parsePhotoMeta,
  parseTour,
  parseTrackPoint,
  parseWaypoint,
  photoFileName,
  trackFileName,
  type BackupManifest,
  type BackupTrackPoint,
  type PhotoMeta,
} from './format';
import { ZipReader } from './zip';

export type RestoreMode = 'replace' | 'merge';

/** Geprüfter Inhalt eines Backups. Die Trackpunkte und Fotos bleiben im ZIP und werden erst beim Schreiben gelesen. */
export interface BackupData {
  manifest: BackupManifest;
  categories: Category[];
  tours: Tour[];
  waypoints: Waypoint[];
  photos: PhotoMeta[];
  meta: MetaEntry[];
  zip: ZipReader;
}

export interface RestoreResult {
  mode: RestoreMode;
  /** Neu angelegte Touren. */
  toursAdded: number;
  /** Ersetzen: bestehende Touren mit gleicher Kennung, die durch die Version aus dem Backup überschrieben wurden. */
  toursOverwritten: number;
  /** Ersetzen: Touren, die nicht im Backup waren und entfernt wurden. */
  toursRemoved: number;
  /** Zusammenführen: bereits vorhandene Touren, die unverändert blieben. */
  toursSkipped: number;
  categoriesAdded: number;
  trackPoints: number;
  photos: number;
}

function friendly(e: unknown): Error {
  return e instanceof BackupError ? e : e instanceof Error ? e : new Error(String(e));
}

/**
 * Liest und prüft ein Backup vollständig, OHNE etwas zu schreiben: Format, Formatversion, Felder, Verweise zwischen
 * Tabellen, Anzahlen laut Manifest, Prüfsummen aller Fotos und Tracks. Wirft bei jedem Fehler eine verständliche Meldung.
 */
export async function readBackup(file: Blob, onProgress?: Progress): Promise<BackupData> {
  try {
    const zip = await ZipReader.open(file);
    if (!zip.has(MANIFEST_FILE)) throw new BackupError('Das ist kein Travelbook-Backup (manifest.json fehlt).');
    const manifest = parseManifest(await zip.json(MANIFEST_FILE));

    const categories = parseList(await zip.json(CATEGORIES_FILE), CATEGORIES_FILE, parseCategory);
    const tours = parseList(await zip.json(TOURS_FILE), TOURS_FILE, parseTour);
    const waypoints = parseList(await zip.json(WAYPOINTS_FILE), WAYPOINTS_FILE, parseWaypoint);
    const photos = parseList(await zip.json(PHOTOS_FILE), PHOTOS_FILE, parsePhotoMeta);
    const meta = zip.has(META_FILE) ? parseList(await zip.json(META_FILE), META_FILE, parseMetaEntry) : [];

    assertUnique(categories.map((c) => c.id), 'Kategorie');
    assertUnique(categories.map((c) => c.name.toLocaleLowerCase()), 'Kategoriename');
    assertUnique(tours.map((t) => t.id), 'Tour');
    assertUnique(waypoints.map((w) => w.id), 'Waypoint');
    assertUnique(photos.map((p) => p.id), 'Foto');
    assertUnique(meta.map((m) => m.key), 'Metadateneintrag');

    const categoryIds = new Set(categories.map((c) => c.id));
    const tourIds = new Set(tours.map((t) => t.id));
    for (const t of tours) {
      if (!categoryIds.has(t.categoryId)) throw new BackupError(`Das Backup ist ungültig: Tour "${t.name}" verweist auf eine fehlende Kategorie.`);
      if (isOpenRecording(t)) throw new BackupError(`Das Backup enthält eine unfertige Aufnahme ("${t.name}") und kann nicht wiederhergestellt werden.`);
    }
    for (const w of waypoints) if (!tourIds.has(w.tourId)) throw new BackupError('Das Backup ist ungültig: Ein Waypoint verweist auf eine fehlende Tour.');
    const perTour = new Map<string, number>();
    for (const p of photos) {
      if (!tourIds.has(p.tourId)) throw new BackupError('Das Backup ist ungültig: Ein Foto verweist auf eine fehlende Tour.');
      if (!p.mimeType.startsWith('image/')) throw new BackupError('Das Backup ist ungültig: Ein Foto hat keinen Bildtyp.');
      const n = (perTour.get(p.tourId) ?? 0) + 1;
      if (n > MAX_PHOTOS_PER_TOUR_IN_BACKUP) throw new BackupError(`Das Backup ist ungültig: Eine Tour hat mehr als ${MAX_PHOTOS_PER_TOUR_IN_BACKUP} Fotos.`);
      perTour.set(p.tourId, n);
    }

    if (manifest.counts.categories !== categories.length || manifest.counts.tours !== tours.length || manifest.counts.waypoints !== waypoints.length || manifest.counts.photos !== photos.length) {
      throw new BackupError('Das Backup ist unvollständig: Die Anzahlen im Manifest passen nicht zu den Daten.');
    }
    for (const name of zip.entries.keys()) {
      if (name.startsWith('data/tracks/')) {
        const tid = name.slice('data/tracks/'.length).replace(/\.json$/, '');
        if (!isSafeId(tid) || !tourIds.has(tid)) throw new BackupError(`Das Backup ist ungültig: Track ${name} gehört zu keiner Tour.`);
      }
    }

    const total = photos.length + tours.length;
    let done = 0;
    // Prüfsummen der Fotos (eines nach dem anderen, um den Speicher zu schonen)
    for (const p of photos) {
      await zip.entryBlob(photoFileName(p.id, p.mimeType), p.mimeType);
      onProgress?.(++done, total, 'Fotos prüfen');
    }
    // Tracks: parsen, prüfen, zählen – und wieder verwerfen
    let trackPointCount = 0;
    for (const t of tours) {
      trackPointCount += (await loadTrackPoints(zip, t.id)).length;
      onProgress?.(++done, total, 'Tracks prüfen');
    }
    if (trackPointCount !== manifest.counts.trackPoints) throw new BackupError('Das Backup ist unvollständig: Die Anzahl der Trackpunkte passt nicht zum Manifest.');

    return { manifest, categories, tours, waypoints, photos, meta, zip };
  } catch (e) {
    throw friendly(e);
  }
}

async function loadTrackPoints(zip: ZipReader, tourId: string): Promise<BackupTrackPoint[]> {
  const name = trackFileName(tourId);
  if (!zip.has(name)) return [];
  const points = parseList(await zip.json(name), name, (x) => parseTrackPoint(x, tourId));
  assertUnique(points.map((p) => String(p.seq)), `Trackpunkt-Nummer in ${tourId}`);
  return points;
}

/** Löscht Trackpunkte, Waypoints und Fotos einer Tour (innerhalb einer laufenden Transaktion). */
async function clearTourChildren(db: GpxDb, tourId: string): Promise<void> {
  await db.trackPoints.where('[tourId+seq]').between([tourId, Dexie.minKey], [tourId, Dexie.maxKey]).delete();
  await db.waypoints.where('tourId').equals(tourId).delete();
  await db.photos.where('tourId').equals(tourId).delete();
}

/**
 * Schreibt eine Tour samt Trackpunkten, Waypoints und Fotos in einer Transaktion (ganz oder gar nicht). Alles, was aus
 * dem ZIP gelesen werden muss, wird VOR der Transaktion gelesen (IndexedDB-Transaktionen vertragen keine fremden Wartezeiten).
 */
async function writeTour(db: GpxDb, data: BackupData, tour: Tour): Promise<{ trackPoints: number; photos: number }> {
  const points: TrackPoint[] = (await loadTrackPoints(data.zip, tour.id)).map((p) => ({ ...p, tourId: tour.id }));
  const waypoints = data.waypoints.filter((w) => w.tourId === tour.id);
  const photos: Photo[] = [];
  for (const meta of data.photos.filter((p) => p.tourId === tour.id)) {
    const blob = await data.zip.entryBlob(photoFileName(meta.id, meta.mimeType), meta.mimeType);
    photos.push({ id: meta.id, tourId: meta.tourId, data: blob, mimeType: meta.mimeType, width: meta.width, height: meta.height, createdAt: meta.createdAt });
  }
  await db.transaction('rw', [db.tours, db.trackPoints, db.waypoints, db.photos], async () => {
    await clearTourChildren(db, tour.id);
    await db.tours.put(tour);
    if (points.length > 0) await db.trackPoints.bulkPut(points);
    if (waypoints.length > 0) await db.waypoints.bulkPut(waypoints);
    if (photos.length > 0) await db.photos.bulkPut(photos);
  });
  return { trackPoints: points.length, photos: photos.length };
}

/**
 * Spielt ein geprüftes Backup ein.
 *
 * Ersetzen: Kategorien und Touren aus dem Backup werden geschrieben (gleiche Kennung = Version aus dem Backup gewinnt);
 * ERST ZULETZT werden Touren und Kategorien entfernt, die nicht im Backup sind. Bricht der Vorgang vorher ab, geht
 * dadurch nichts verloren, was nicht ohnehin durch das Backup überschrieben werden sollte; ein erneuter Versuch mit
 * derselben Datei ist möglich.
 *
 * Zusammenführen: Nur Touren mit unbekannter Kennung werden ergänzt (samt Track, Waypoints, Fotos). Bestehende Touren
 * bleiben unverändert. Kategorien werden über die Kennung, sonst über den Namen zugeordnet; unbekannte werden angelegt.
 */
export async function applyBackup(db: GpxDb, data: BackupData, mode: RestoreMode, onProgress?: Progress): Promise<RestoreResult> {
  if (await hasOpenRecording(db)) throw new Error(OPEN_RECORDING_MESSAGE);

  const existingTourIds = new Set<string>(await db.tours.toCollection().primaryKeys());
  const result: RestoreResult = { mode, toursAdded: 0, toursOverwritten: 0, toursRemoved: 0, toursSkipped: 0, categoriesAdded: 0, trackPoints: 0, photos: 0 };
  const total = data.tours.length + 1;
  let done = 0;

  if (mode === 'replace') {
    const existingCategoryIds = new Set<string>(await db.categories.toCollection().primaryKeys());
    await db.transaction('rw', [db.categories, db.meta], async () => {
      await db.categories.bulkPut(data.categories);
      await db.meta.bulkPut(data.meta);
      await db.meta.put({ key: SEEDED_KEY, value: true }); // sonst würden gelöschte Standardkategorien wiederkommen
    });
    result.categoriesAdded = data.categories.filter((c) => !existingCategoryIds.has(c.id)).length;
    for (const tour of data.tours) {
      const w = await writeTour(db, data, tour);
      result.trackPoints += w.trackPoints;
      result.photos += w.photos;
      if (existingTourIds.has(tour.id)) result.toursOverwritten++;
      else result.toursAdded++;
      onProgress?.(++done, total, 'Touren');
    }
    const keepTours = new Set(data.tours.map((t) => t.id));
    const keepCategories = new Set(data.categories.map((c) => c.id));
    const staleTours = [...existingTourIds].filter((id) => !keepTours.has(id));
    await db.transaction('rw', [db.tours, db.trackPoints, db.waypoints, db.photos, db.categories], async () => {
      for (const id of staleTours) {
        await clearTourChildren(db, id);
        await db.tours.delete(id);
      }
      const staleCategories = (await db.categories.toCollection().primaryKeys()).filter((id) => !keepCategories.has(id));
      if (staleCategories.length > 0) await db.categories.bulkDelete(staleCategories);
    });
    result.toursRemoved = staleTours.length;
    onProgress?.(++done, total, 'Aufräumen');
    return result;
  }

  // Zusammenführen
  const existingCategories = await db.categories.toArray();
  const categoryTarget = new Map<string, string>();
  const newCategories: Category[] = [];
  let sortOrder = existingCategories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
  for (const bc of data.categories) {
    const sameId = existingCategories.find((c) => c.id === bc.id);
    const sameName = existingCategories.find((c) => c.name.toLocaleLowerCase() === bc.name.toLocaleLowerCase());
    if (sameId) categoryTarget.set(bc.id, sameId.id);
    else if (sameName) categoryTarget.set(bc.id, sameName.id);
    else {
      newCategories.push({ ...bc, sortOrder: sortOrder++ });
      categoryTarget.set(bc.id, bc.id);
    }
  }
  if (newCategories.length > 0) await db.categories.bulkPut(newCategories);
  result.categoriesAdded = newCategories.length;

  for (const tour of data.tours) {
    if (existingTourIds.has(tour.id)) {
      result.toursSkipped++;
    } else {
      const w = await writeTour(db, data, { ...tour, categoryId: categoryTarget.get(tour.categoryId) ?? tour.categoryId });
      result.toursAdded++;
      result.trackPoints += w.trackPoints;
      result.photos += w.photos;
    }
    onProgress?.(++done, total, 'Touren');
  }
  return result;
}
