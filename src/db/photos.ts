import type { GpxDb } from './db';
import { newId } from './db';
import type { Photo } from './types';

export const MAX_PHOTOS_PER_TOUR = 3;

export async function addPhoto(
  db: GpxDb,
  tourId: string,
  input: Pick<Photo, 'data' | 'mimeType' | 'width' | 'height'>,
): Promise<Photo> {
  return db.transaction('rw', db.tours, db.photos, async () => {
    if (!(await db.tours.get(tourId))) throw new Error('Tour nicht gefunden.');
    if ((await db.photos.where('tourId').equals(tourId).count()) >= MAX_PHOTOS_PER_TOUR) {
      throw new Error(`Pro Tour sind höchstens ${MAX_PHOTOS_PER_TOUR} Fotos erlaubt.`);
    }
    const photo: Photo = { ...input, id: newId(), tourId, createdAt: Date.now() };
    await db.photos.add(photo);
    return photo;
  });
}

export function listPhotos(db: GpxDb, tourId: string): Promise<Photo[]> {
  return db.photos.where('tourId').equals(tourId).sortBy('createdAt');
}

export function deletePhoto(db: GpxDb, id: string): Promise<void> {
  return db.photos.delete(id);
}
