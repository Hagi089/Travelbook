import type { GpxDb } from './db';
import { createTour, updateTour } from './tours';
import type { LatLon, NewTour, Tour } from './types';

/** Eingaben für eine manuell angelegte Tour (ohne Track). Zeiten in Sekunden, Strecken in Metern. */
export interface ManualTourInput {
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  date: string;
  notes?: string;
  distanceM?: number | null;
  durationSec?: number | null;
  /** Optionaler Ort, damit die Tour auf der Weltkarte erscheint. */
  location?: LatLon | null;
}

/** Änderbare Felder einer bestehenden Tour. Distanz, Dauer und Ort nur bei Touren mit `source === 'manual'`. */
export interface TourDetailsPatch {
  name?: string;
  categoryId?: string;
  date?: string;
  notes?: string;
  distanceM?: number | null;
  durationSec?: number | null;
  location?: LatLon | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Prüft ein Datum im Format "YYYY-MM-DD" (auch, ob es den Tag wirklich gibt). */
export function validateDate(date: string): string {
  const err = new Error('Datum ungültig (erwartet: JJJJ-MM-TT).');
  if (!DATE_RE.test(date)) throw err;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw err;
  return date;
}

/** Liest eine Dezimalzahl aus einem Textfeld (Komma oder Punkt). Leer ergibt `null`. */
export function parseDecimal(text: string, label: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) throw new Error(`${label}: keine gültige Zahl.`);
  return Number(t);
}

/** Beide Werte leer → kein Ort; nur einer gesetzt oder außerhalb des Bereichs → Fehler. */
export function buildLocation(lat: number | null, lon: number | null): LatLon | null {
  if (lat === null && lon === null) return null;
  if (lat === null || lon === null) throw new Error('Ort: Breite und Länge müssen beide angegeben werden.');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Ort: Breite muss zwischen -90 und 90 liegen.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('Ort: Länge muss zwischen -180 und 180 liegen.');
  return { lat, lon };
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error('Der Name der Tour darf nicht leer sein.');
  return n;
}

function nonNegative(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} darf nicht negativ sein.`);
  return value;
}

function avgSpeed(distanceM: number, durationSec: number): number {
  return distanceM > 0 && durationSec > 0 ? distanceM / durationSec : 0;
}

/** Baut die Tour-Daten für eine manuell angelegte Tour und prüft alle Eingaben. */
export function buildManualTour(input: ManualTourInput): NewTour {
  const distanceM = nonNegative(input.distanceM, 'Distanz');
  const durationSec = nonNegative(input.durationSec, 'Dauer');
  const location = input.location ? buildLocation(input.location.lat, input.location.lon) : null;
  return {
    name: cleanName(input.name),
    categoryId: input.categoryId,
    date: validateDate(input.date),
    startTime: null,
    endTime: null,
    durationSec,
    distanceM,
    ascentM: 0,
    descentM: 0,
    avgSpeedMs: avgSpeed(distanceM, durationSec),
    maxSpeedMs: 0,
    startPoint: location,
    endPoint: location,
    notes: input.notes ?? '',
    source: 'manual',
  };
}

/** Legt eine Tour ohne Track an (Quelle `manual`). Trackpunkte gibt es nicht; ein Ort ist optional. */
export async function createManualTour(db: GpxDb, input: ManualTourInput): Promise<Tour> {
  return createTour(db, buildManualTour(input));
}

/**
 * Ändert Name, Kategorie, Datum und Notizen einer Tour. Bei manuell angelegten Touren zusätzlich
 * Distanz, Dauer und Ort. Berechnete Werte importierter oder aufgezeichneter Touren bleiben unangetastet.
 */
export async function updateTourDetails(db: GpxDb, id: string, patch: TourDetailsPatch): Promise<Tour> {
  const existing = await db.tours.get(id);
  if (!existing) throw new Error('Tour nicht gefunden.');
  const changes: Partial<Omit<Tour, 'id' | 'createdAt'>> = {};
  if (patch.name !== undefined) changes.name = cleanName(patch.name);
  if (patch.categoryId !== undefined) changes.categoryId = patch.categoryId;
  if (patch.date !== undefined) changes.date = validateDate(patch.date);
  if (patch.notes !== undefined) changes.notes = patch.notes;

  const touchesManualFields = patch.distanceM !== undefined || patch.durationSec !== undefined || patch.location !== undefined;
  if (touchesManualFields) {
    if (existing.source !== 'manual') {
      throw new Error('Distanz, Dauer und Ort lassen sich nur bei manuell angelegten Touren ändern.');
    }
    const distanceM = patch.distanceM !== undefined ? nonNegative(patch.distanceM, 'Distanz') : existing.distanceM;
    const durationSec = patch.durationSec !== undefined ? nonNegative(patch.durationSec, 'Dauer') : existing.durationSec;
    changes.distanceM = distanceM;
    changes.durationSec = durationSec;
    changes.avgSpeedMs = avgSpeed(distanceM, durationSec);
    if (patch.location !== undefined) {
      const location = patch.location ? buildLocation(patch.location.lat, patch.location.lon) : null;
      changes.startPoint = location;
      changes.endPoint = location;
    }
  }
  return updateTour(db, id, changes);
}
