import type { TrackPoint } from '../db/types';

export type LatLngTuple = [number, number];

function decimate<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  let last = -1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    if (idx !== last) out.push(items[idx]!);
    last = idx;
  }
  return out;
}

/**
 * Wandelt Trackpunkte in Liniensegmente für die Kartenübersicht um und dünnt sie gleichmäßig aus
 * (Anfang und Ende bleiben erhalten). Die gespeicherten Rohpunkte werden nicht verändert.
 * Interimslösung; vorgesehen ist später eine vorberechnete vereinfachte Geometrie.
 */
export function toSegments(points: ReadonlyArray<TrackPoint>, maxPoints = 400): LatLngTuple[][] {
  const bySegment = new Map<number, LatLngTuple[]>();
  for (const p of points) {
    const list = bySegment.get(p.segment) ?? [];
    list.push([p.lat, p.lon]);
    bySegment.set(p.segment, list);
  }
  const perSegment = Math.max(2, Math.ceil(maxPoints / Math.max(1, bySegment.size)));
  return [...bySegment.keys()]
    .sort((a, b) => a - b)
    .map((k) => decimate(bySegment.get(k)!, perSegment))
    .filter((s) => s.length > 0);
}
