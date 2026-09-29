import type { GpxDb } from '../db/db';
import { getTrackPoints } from '../db/tours';
import type { Photo, Tour } from '../db/types';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  CATEGORIES_FILE,
  MANIFEST_FILE,
  META_FILE,
  PHOTOS_FILE,
  TOURS_FILE,
  WAYPOINTS_FILE,
  photoFileName,
  trackFileName,
  type BackupManifest,
  type PhotoMeta,
} from './format';
import { ZipWriter } from './zip';

export interface BackupResult {
  blob: Blob;
  fileName: string;
  manifest: BackupManifest;
}

export type Progress = (done: number, total: number, label: string) => void;

/** Eine laufende oder unterbrochene Aufnahme (Quelle "recording" ohne Endzeit) darf weder gesichert noch überschrieben werden. */
export function isOpenRecording(t: Tour): boolean {
  return t.source === 'recording' && t.endTime === null;
}

export async function hasOpenRecording(db: GpxDb): Promise<boolean> {
  return (await db.tours.filter(isOpenRecording).count()) > 0;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  return `travelbook-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;
}

export const OPEN_RECORDING_MESSAGE = 'Eine Aufnahme läuft oder ist noch nicht abgeschlossen. Bitte zuerst die Aufnahme beenden.';

/**
 * Erstellt das Backup als ZIP-Blob. Die Tabellen werden in einer Lese-Transaktion gemeinsam gelesen (konsistenter Stand),
 * Trackpunkte danach tourweise. Fotos werden unverändert (ohne Neukodierung) abgelegt.
 */
export async function createBackup(db: GpxDb, settings: Record<string, string>, now: number = Date.now(), onProgress?: Progress): Promise<BackupResult> {
  if (await hasOpenRecording(db)) throw new Error(OPEN_RECORDING_MESSAGE);

  const snapshot = await db.transaction('r', [db.categories, db.tours, db.waypoints, db.photos, db.meta], async () => ({
    categories: await db.categories.orderBy('sortOrder').toArray(),
    tours: await db.tours.toArray(),
    waypoints: await db.waypoints.toArray(),
    photos: await db.photos.toArray(),
    meta: await db.meta.toArray(),
  }));

  const tours = snapshot.tours.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? 0) - (b.startTime ?? 0) || a.id.localeCompare(b.id));
  const tourIds = new Set(tours.map((t) => t.id));
  const waypoints = snapshot.waypoints.filter((w) => tourIds.has(w.tourId));
  const photos: Photo[] = snapshot.photos.filter((p) => tourIds.has(p.tourId));

  const zip = new ZipWriter();
  const total = tours.length + photos.length + 1;
  let done = 0;
  let trackPointCount = 0;

  await zip.add(CATEGORIES_FILE, JSON.stringify(snapshot.categories), { compress: true });
  await zip.add(TOURS_FILE, JSON.stringify(tours), { compress: true });
  await zip.add(WAYPOINTS_FILE, JSON.stringify(waypoints), { compress: true });
  await zip.add(META_FILE, JSON.stringify(snapshot.meta), { compress: true });
  const photoMeta: PhotoMeta[] = photos.map((p) => ({ id: p.id, tourId: p.tourId, mimeType: p.mimeType, width: p.width, height: p.height, createdAt: p.createdAt }));
  await zip.add(PHOTOS_FILE, JSON.stringify(photoMeta), { compress: true });
  onProgress?.(++done, total, 'Tabellen');

  for (const tour of tours) {
    const points = await getTrackPoints(db, tour.id);
    if (points.length > 0) {
      trackPointCount += points.length;
      const slim = points.map(({ seq, segment, lat, lon, ele, time, accuracy }) => ({ seq, segment, lat, lon, ele, time, accuracy }));
      await zip.add(trackFileName(tour.id), JSON.stringify(slim), { compress: true });
    }
    onProgress?.(++done, total, 'Tracks');
  }

  for (const p of photos) {
    await zip.add(photoFileName(p.id, p.mimeType), p.data);
    onProgress?.(++done, total, 'Fotos');
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    counts: { categories: snapshot.categories.length, tours: tours.length, trackPoints: trackPointCount, waypoints: waypoints.length, photos: photos.length },
    settings,
  };
  await zip.add(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { compress: true });
  return { blob: zip.finish(), fileName: backupFileName(now), manifest };
}
