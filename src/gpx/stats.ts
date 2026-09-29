import type { LatLon, NewTrackPoint } from '../db/types';

export const EARTH_RADIUS_M = 6371008.8;
/** Teilstücke mit höherer Geschwindigkeit (nur prüfbar mit Zeitstempeln) gelten als GPS-Sprung und werden nicht gezählt. */
export const MAX_PLAUSIBLE_SPEED_MS = 70;
/** Höhenänderungen unter dieser Schwelle (Meter) gelten als Rauschen. Annahme, an echten Tracks zu prüfen. */
export const ELEVATION_THRESHOLD_M = 3;

export interface TrackStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
  durationSec: number;
  startTime: number | null;
  endTime: number | null;
  /** Distanz geteilt durch Gesamtdauer (Ende minus Start), 0 ohne Zeitstempel. */
  avgSpeedMs: number;
  maxSpeedMs: number;
  startPoint: LatLon | null;
  endPoint: LatLon | null;
  /** Anzahl ausgelassener Teilstücke wegen unplausibler Geschwindigkeit. */
  skippedJumps: number;
}

export function haversineM(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Die Rohdaten bleiben unverändert; Sprünge werden nur aus den Berechnungen ausgenommen. */
export function computeStats(points: ReadonlyArray<NewTrackPoint>): TrackStats {
  let distanceM = 0;
  let maxSpeedMs = 0;
  let skippedJumps = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.segment !== b.segment) continue;
    const d = haversineM(a, b);
    if (a.time !== null && b.time !== null) {
      const dt = (b.time - a.time) / 1000;
      if (dt > 0) {
        const v = d / dt;
        if (v > MAX_PLAUSIBLE_SPEED_MS) {
          skippedJumps++;
          continue;
        }
        if (dt >= 1 && v > maxSpeedMs) maxSpeedMs = v;
      }
    }
    distanceM += d;
  }

  let ascentM = 0;
  let descentM = 0;
  let ref: number | null = null;
  for (const p of points) {
    if (p.ele === null) continue;
    if (ref === null) {
      ref = p.ele;
      continue;
    }
    const diff = p.ele - ref;
    if (diff >= ELEVATION_THRESHOLD_M) {
      ascentM += diff;
      ref = p.ele;
    } else if (diff <= -ELEVATION_THRESHOLD_M) {
      descentM += -diff;
      ref = p.ele;
    }
  }

  const timed = points.filter((p) => p.time !== null);
  const startTime = timed.length > 0 ? timed[0]!.time : null;
  const endTime = timed.length > 0 ? timed[timed.length - 1]!.time : null;
  const durationSec = startTime !== null && endTime !== null ? Math.max(0, (endTime - startTime) / 1000) : 0;
  const first = points[0];
  const last = points[points.length - 1];

  return {
    distanceM,
    ascentM,
    descentM,
    durationSec,
    startTime,
    endTime,
    avgSpeedMs: durationSec > 0 ? distanceM / durationSec : 0,
    maxSpeedMs,
    startPoint: first ? { lat: first.lat, lon: first.lon } : null,
    endPoint: last ? { lat: last.lat, lon: last.lon } : null,
    skippedJumps,
  };
}
