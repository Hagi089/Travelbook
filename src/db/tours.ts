import Dexie from 'dexie';
import type { GpxDb } from './db';
import { newId } from './db';
import type { NewTour, NewTrackPoint, NewWaypoint, Tour, TrackPoint } from './types';

/** Legt Tour, Trackpunkte und Waypoints in einer Transaktion an: entweder alles oder nichts. */
export async function createTour(
  db: GpxDb,
  input: NewTour,
  points: NewTrackPoint[] = [],
  waypoints: NewWaypoint[] = [],
): Promise<Tour> {
  return db.transaction('rw', [db.tours, db.categories, db.trackPoints, db.waypoints], async () => {
    if (!(await db.categories.get(input.categoryId))) throw new Error('Kategorie nicht gefunden.');
    const now = Date.now();
    const tour: Tour = { ...input, id: input.id ?? newId(), createdAt: now, updatedAt: now };
    await db.tours.add(tour);
    if (points.length > 0) {
      await db.trackPoints.bulkAdd(points.map((p, seq) => ({ ...p, tourId: tour.id, seq })));
    }
    if (waypoints.length > 0) {
      await db.waypoints.bulkAdd(waypoints.map((w) => ({ ...w, id: newId(), tourId: tour.id })));
    }
    return tour;
  });
}

export function getTour(db: GpxDb, id: string): Promise<Tour | undefined> {
  return db.tours.get(id);
}

export interface TourFilter {
  categoryId?: string;
  /** Inklusive, Format "YYYY-MM-DD". */
  fromDate?: string;
  toDate?: string;
}

/** Neueste zuerst. */
export async function listTours(db: GpxDb, filter: TourFilter = {}): Promise<Tour[]> {
  const base = filter.categoryId ? db.tours.where('categoryId').equals(filter.categoryId) : db.tours.toCollection();
  const tours = await base
    .filter((t) => (!filter.fromDate || t.date >= filter.fromDate) && (!filter.toDate || t.date <= filter.toDate))
    .toArray();
  return tours.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0) || b.date.localeCompare(a.date));
}

export async function updateTour(
  db: GpxDb,
  id: string,
  patch: Partial<Omit<Tour, 'id' | 'createdAt'>>,
): Promise<Tour> {
  return db.transaction('rw', db.tours, db.categories, async () => {
    const existing = await db.tours.get(id);
    if (!existing) throw new Error('Tour nicht gefunden.');
    if (patch.categoryId && !(await db.categories.get(patch.categoryId))) throw new Error('Kategorie nicht gefunden.');
    const next: Tour = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: Date.now() };
    await db.tours.put(next);
    return next;
  });
}

export async function getTrackPoints(db: GpxDb, tourId: string): Promise<TrackPoint[]> {
  return db.trackPoints.where('[tourId+seq]').between([tourId, Dexie.minKey], [tourId, Dexie.maxKey]).toArray();
}

/** Löscht die Tour samt Trackpunkten, Waypoints und Fotos. */
export async function deleteTour(db: GpxDb, id: string): Promise<void> {
  await db.transaction('rw', [db.tours, db.trackPoints, db.waypoints, db.photos], async () => {
    await db.trackPoints.where('[tourId+seq]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete();
    await db.waypoints.where('tourId').equals(id).delete();
    await db.photos.where('tourId').equals(id).delete();
    await db.tours.delete(id);
  });
}
