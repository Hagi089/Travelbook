import type { GpxDb } from '../db/db';
import { newId } from '../db/db';
import { createTour, deleteTour, getTrackPoints, updateTour } from '../db/tours';
import type { Tour } from '../db/types';
import { localDateString } from '../gpx/import';
import { computeStats } from '../gpx/stats';
import type { NativePoint, TrackingPlugin, TrackingProfile } from './types';

/** Anzahl Punkte pro Übernahme-Runde aus dem nativen Puffer. */
export const INGEST_BATCH = 500;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function defaultRecordingName(ms: number): string {
  const d = new Date(ms);
  return `Aufnahme ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Legt die Tour an und startet danach das Plugin. Die Tour existiert also immer vor dem ersten Punkt.
 * Schlägt das Starten fehl (z. B. Berechtigung), wird die Tour wieder entfernt.
 */
export async function startRecording(
  db: GpxDb,
  plugin: TrackingPlugin,
  opts: { name: string; categoryId: string; profile: TrackingProfile },
): Promise<Tour> {
  const now = Date.now();
  const tour = await createTour(db, {
    id: newId(),
    name: opts.name.trim() || defaultRecordingName(now),
    categoryId: opts.categoryId,
    date: localDateString(now),
    startTime: now,
    endTime: null,
    durationSec: 0,
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    avgSpeedMs: 0,
    maxSpeedMs: 0,
    startPoint: null,
    endPoint: null,
    notes: '',
    source: 'recording',
  });
  try {
    await plugin.start({ recordingId: tour.id, profile: opts.profile });
  } catch (e) {
    await deleteTour(db, tour.id);
    throw e;
  }
  return tour;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Übernimmt unbestätigte Punkte aus dem nativen Puffer in die Datenbank und bestätigt sie danach.
 * - Erst schreiben, dann bestätigen: bricht etwas dazwischen ab, kommen die Punkte beim nächsten Mal erneut.
 * - Idempotent: Schlüssel ist [tourId+seq], doppelte Punkte überschreiben sich selbst.
 * - Aufrufe werden nacheinander ausgeführt (Timer, Sichtbarkeitswechsel und Stopp können zusammenfallen).
 * Gibt die Anzahl übernommener Punkte zurück.
 */
export function ingestPending(db: GpxDb, plugin: TrackingPlugin, tourId: string): Promise<number> {
  const run = queue.then(() => ingestNow(db, plugin, tourId));
  queue = run.catch(() => undefined);
  return run;
}

function isValid(p: NativePoint): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && Number.isInteger(p.seq) && p.seq >= 0;
}

async function ingestNow(db: GpxDb, plugin: TrackingPlugin, tourId: string): Promise<number> {
  let total = 0;
  let lastAcked = -1;
  for (;;) {
    const { points } = await plugin.getPendingPoints({ recordingId: tourId, limit: INGEST_BATCH });
    if (points.length === 0) return total;
    const maxSeq = points.reduce((m, p) => Math.max(m, p.seq), -1);
    // Schutz vor Endlosschleife, falls ein Plugin bestätigte Punkte erneut liefert.
    if (maxSeq <= lastAcked) return total;
    const valid = points.filter(isValid);
    await db.trackPoints.bulkPut(
      valid.map((p) => ({ tourId, seq: p.seq, segment: p.segment, lat: p.lat, lon: p.lon, ele: p.ele, time: p.time, accuracy: p.accuracy })),
    );
    await plugin.ackPoints({ recordingId: tourId, upToSeq: maxSeq });
    lastAcked = maxSeq;
    total += valid.length;
  }
}

/**
 * Berechnet die Tourwerte aus den gespeicherten Punkten und schließt die Aufnahme ab.
 * Eine Aufnahme ohne einen einzigen Punkt wird verworfen (Rückgabe null).
 */
export async function finalizeRecording(db: GpxDb, tourId: string): Promise<Tour | null> {
  const points = await getTrackPoints(db, tourId);
  if (points.length === 0) {
    await deleteTour(db, tourId);
    return null;
  }
  const s = computeStats(points);
  return updateTour(db, tourId, {
    startTime: s.startTime,
    // Ohne Zeitstempel (kommt bei nativen Punkten nicht vor) bleibt die Aufnahme sonst ewig "offen".
    endTime: s.endTime ?? Date.now(),
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    ascentM: s.ascentM,
    descentM: s.descentM,
    avgSpeedMs: s.avgSpeedMs,
    maxSpeedMs: s.maxSpeedMs,
    startPoint: s.startPoint,
    endPoint: s.endPoint,
  });
}

/** Beendet die Aufnahme, übernimmt alle restlichen Punkte und berechnet die Tourwerte. */
export async function finishRecording(db: GpxDb, plugin: TrackingPlugin, tourId: string): Promise<Tour | null> {
  await plugin.stop();
  await ingestPending(db, plugin, tourId);
  return finalizeRecording(db, tourId);
}

export interface RecoveryResult {
  /** Tour-ID einer noch laufenden Aufnahme (Service läuft weiter), sonst null. */
  activeTourId: string | null;
  /** Unterbrochene Aufnahmen (App/Handy beendet), die jetzt abgeschlossen wurden. */
  finalized: Tour[];
  /** Unterbrochene Aufnahmen ohne Punkte, die verworfen wurden. */
  discarded: number;
}

/**
 * Beim App-Start aufrufen (Crash-Recovery):
 * 1. Läuft nativ noch eine Aufnahme, werden deren Punkte übernommen und sie läuft weiter.
 * 2. Jede andere Tour mit Quelle "recording" ohne Endzeit ist unterbrochen: verbliebene native Punkte
 *    werden übernommen, danach wird sie mit den vorhandenen Punkten abgeschlossen.
 */
export async function recoverRecordings(db: GpxDb, plugin: TrackingPlugin): Promise<RecoveryResult> {
  const status = await plugin.getStatus();
  const activeTourId = status.state !== 'idle' ? status.recordingId : null;

  if (activeTourId) {
    if (!(await db.tours.get(activeTourId))) {
      // Die Datenbank kennt die laufende Aufnahme nicht (z. B. Browserdaten gelöscht): Tour nachlegen, damit keine Punkte verloren gehen.
      const category = await db.categories.orderBy('sortOrder').first();
      if (category) {
        const start = status.startedAt ?? Date.now();
        await createTour(db, {
          id: activeTourId,
          name: defaultRecordingName(start),
          categoryId: category.id,
          date: localDateString(start),
          startTime: start,
          endTime: null,
          durationSec: 0,
          distanceM: 0,
          ascentM: 0,
          descentM: 0,
          avgSpeedMs: 0,
          maxSpeedMs: 0,
          startPoint: null,
          endPoint: null,
          notes: '',
          source: 'recording',
        });
      }
    }
    if (await db.tours.get(activeTourId)) await ingestPending(db, plugin, activeTourId);
  }

  const open = await db.tours.filter((t) => t.source === 'recording' && t.endTime === null && t.id !== activeTourId).toArray();
  const finalized: Tour[] = [];
  let discarded = 0;
  for (const t of open) {
    await ingestPending(db, plugin, t.id);
    const done = await finalizeRecording(db, t.id);
    if (done) finalized.push(done);
    else discarded++;
  }
  return { activeTourId, finalized, discarded };
}
