import type { CountryIndex } from '../geo/countries';

/** Leaflet-Koordinate [Breite, Länge]. */
export type LatLngTuple = [number, number];

/** Ein Land mit allen seinen Flächen; je Fläche: Außenring, danach Löcher (wie bei Leaflet-Multipolygonen). */
export interface CountryShape {
  code: string;
  polygons: LatLngTuple[][][];
}

/** Rechnet einen Ring aus `src/geo` (Hundertstelgrad, [Länge, Breite, …]) in Leaflet-Koordinaten um. */
export function ringToLatLngs(ring: Float64Array): LatLngTuple[] {
  const out: LatLngTuple[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) out.push([(ring[i + 1] as number) / 100, (ring[i] as number) / 100]);
  return out;
}

/** Fasst die Flächen der Ländergrenzen je Ländercode zusammen (Grundlage der Offline-Weltkarte, Phase 8c). */
export function buildCountryShapes(index: CountryIndex): CountryShape[] {
  const byCode = new Map<string, LatLngTuple[][][]>();
  for (const poly of index.polygons) {
    const rings = poly.rings.map(ringToLatLngs).filter((r) => r.length >= 3);
    if (rings.length === 0) continue;
    const list = byCode.get(poly.code);
    if (list) list.push(rings);
    else byCode.set(poly.code, [rings]);
  }
  return [...byCode.entries()].map(([code, polygons]) => ({ code, polygons }));
}
