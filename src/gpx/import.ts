import type { GpxDb } from '../db/db';
import { createTour } from '../db/tours';
import type { NewTrackPoint, NewWaypoint, Tour } from '../db/types';
import { GpxError, parseGpx } from './parse';
import { computeStats, type TrackStats } from './stats';

/** Vorschau einer zu importierenden Tour. Der Nutzer kann Name, Kategorie, Datum und Notizen vor dem Speichern anpassen. */
export interface ImportDraft {
  name: string;
  points: NewTrackPoint[];
  waypoints: NewWaypoint[];
  stats: TrackStats;
  /** "YYYY-MM-DD" (lokale Zeit); ohne Zeitstempel im Track das heutige Datum als Vorschlag. */
  date: string;
  hasTime: boolean;
}

export function localDateString(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Jeder Track der Datei wird ein eigener Entwurf. Waypoints der Datei gehören zum ersten Entwurf. */
export function prepareImport(xml: string, fileName?: string): { drafts: ImportDraft[]; warnings: string[] } {
  const parsed = parseGpx(xml);
  if (parsed.tracks.length === 0) {
    throw new GpxError('Die Datei enthält keine Trackpunkte (nur Waypoints).');
  }
  const fileBase = fileName?.replace(/\.[^.]+$/, '') || null;
  const drafts = parsed.tracks.map((track, i): ImportDraft => {
    const stats = computeStats(track.points);
    return {
      name: track.name ?? parsed.name ?? fileBase ?? 'Importierte Tour',
      points: track.points,
      waypoints: i === 0 ? parsed.waypoints : [],
      stats,
      date: localDateString(stats.startTime ?? Date.now()),
      hasTime: stats.startTime !== null,
    };
  });
  return { drafts, warnings: parsed.warnings };
}

export async function saveDraft(
  db: GpxDb,
  draft: ImportDraft,
  opts: { categoryId: string; name?: string; notes?: string; date?: string },
): Promise<Tour> {
  const s = draft.stats;
  return createTour(
    db,
    {
      name: opts.name?.trim() || draft.name,
      categoryId: opts.categoryId,
      date: opts.date ?? draft.date,
      startTime: s.startTime,
      endTime: s.endTime,
      durationSec: s.durationSec,
      distanceM: s.distanceM,
      ascentM: s.ascentM,
      descentM: s.descentM,
      avgSpeedMs: s.avgSpeedMs,
      maxSpeedMs: s.maxSpeedMs,
      startPoint: s.startPoint,
      endPoint: s.endPoint,
      notes: opts.notes ?? '',
      source: 'gpx-import',
    },
    draft.points,
    draft.waypoints,
  );
}
