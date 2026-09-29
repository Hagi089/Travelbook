import Dexie, { type Table } from 'dexie';
import type { Category, MetaEntry, Photo, Tour, TrackPoint, Waypoint } from './types';

export const DEFAULT_DB_NAME = 'gpx-tracker';

export class GpxDb extends Dexie {
  declare categories: Table<Category, string>;
  declare tours: Table<Tour, string>;
  declare trackPoints: Table<TrackPoint, [string, number]>;
  declare waypoints: Table<Waypoint, string>;
  declare photos: Table<Photo, string>;
  declare meta: Table<MetaEntry, string>;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    // Schema-Version 1. Änderungen nur über neue version(n)-Blöcke mit upgrade(), nie bestehende ändern.
    this.version(1).stores({
      categories: 'id, sortOrder',
      tours: 'id, categoryId, date, startTime, updatedAt',
      trackPoints: '[tourId+seq]',
      waypoints: 'id, tourId',
      photos: 'id, tourId',
      meta: 'key',
    });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
