/** Datenmodell (siehe docs/DATA_MODEL.md). Alle Zeitwerte sind Unix-Millisekunden (UTC). */

export interface Category {
  id: string;
  name: string;
  color: string; // CSS-Farbe, z. B. "#2e7d32"
  sortOrder: number;
  /** true = wurde beim ersten Start als Standardkategorie angelegt (bleibt aber bearbeit- und löschbar). */
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TourSource = 'gpx-import' | 'recording' | 'manual';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Tour {
  id: string;
  name: string;
  categoryId: string;
  /** Kalendertag der Tour als "YYYY-MM-DD" (lokale Zeit des Nutzers). */
  date: string;
  startTime: number | null;
  endTime: number | null;
  durationSec: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  startPoint: LatLon | null;
  endPoint: LatLon | null;
  notes: string;
  source: TourSource;
  createdAt: number;
  updatedAt: number;
}

export interface TrackPoint {
  tourId: string;
  /** Laufende Nummer innerhalb der Tour, ab 0. Bildet zusammen mit tourId den Primärschlüssel. */
  seq: number;
  /** Index des Track-Segments (GPX <trkseg>), ab 0. */
  segment: number;
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null;
  accuracy: number | null;
}

export interface Waypoint {
  id: string;
  tourId: string;
  lat: number;
  lon: number;
  name: string;
  ele: number | null;
  time: number | null;
}

export interface Photo {
  id: string;
  tourId: string;
  data: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type NewTour = Omit<Tour, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export type NewTrackPoint = Omit<TrackPoint, 'tourId' | 'seq'>;
export type NewWaypoint = Omit<Waypoint, 'id' | 'tourId'>;
