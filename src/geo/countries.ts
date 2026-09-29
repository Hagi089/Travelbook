/**
 * Ländererkennung ohne Netz: Punkt-in-Polygon gegen gebündelte, vereinfachte Ländergrenzen
 * (Natural Earth 1:50m, gemeinfrei; erzeugt von scripts/build-countries.py).
 *
 * Genauigkeit: Grenzen sind auf ca. 3 km vereinfacht. Punkte direkt an der Grenze oder Küste können
 * daneben liegen; Punkte im Wasser bis `SNAP_KM` vor der Küste werden dem nächsten Land zugeordnet.
 */

/** Höchstabstand zur nächsten Landesgrenze (km), bis zu dem ein Punkt außerhalb aller Polygone noch zugeordnet wird. */
export const SNAP_KM = 20;

const KM_PER_DEGREE = 111.32;

interface GeoPolygon {
  code: string;
  /** Ringe als absolute Koordinaten [x0, y0, x1, y1, ...] in Hundertstelgrad (Länge, Breite); Ring 0 = außen, weitere = Löcher. */
  rings: Float64Array[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Fläche der Umgrenzung; bei mehreren Treffern (Enklaven) gewinnt das kleinere Polygon. */
  boxArea: number;
}

export interface CountryIndex {
  polygons: GeoPolygon[];
  /** Alle enthaltenen Ländercodes (ISO 3166-1 Alpha-2), unsortiert. */
  codes: string[];
}

function decodeRing(flat: number[]): Float64Array {
  const out = new Float64Array(flat.length);
  let x = flat[0] ?? 0;
  let y = flat[1] ?? 0;
  out[0] = x;
  out[1] = y;
  for (let i = 2; i < flat.length; i += 2) {
    x += flat[i] as number;
    y += flat[i + 1] as number;
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

/** Liest das JSON-Format aus `countryData.ts` (siehe scripts/build-countries.py). */
export function parseCountryData(text: string): CountryIndex {
  const raw = JSON.parse(text) as Record<string, number[][][]>;
  const polygons: GeoPolygon[] = [];
  for (const [code, polys] of Object.entries(raw)) {
    for (const poly of polys) {
      const rings = poly.map(decodeRing);
      const outer = rings[0];
      if (!outer) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < outer.length; i += 2) {
        const x = outer[i] as number;
        const y = outer[i + 1] as number;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      polygons.push({ code, rings, minX, minY, maxX, maxY, boxArea: (maxX - minX) * (maxY - minY) });
    }
  }
  return { polygons, codes: Object.keys(raw) };
}

/** Even-odd-Test (Strahlverfahren) für einen Ring. */
function inRing(x: number, y: number, ring: Float64Array): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i] as number;
    const yi = ring[2 * i + 1] as number;
    const xj = ring[2 * j] as number;
    const yj = ring[2 * j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, p: GeoPolygon): boolean {
  if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) return false;
  const outer = p.rings[0];
  if (!outer || !inRing(x, y, outer)) return false;
  for (let i = 1; i < p.rings.length; i++) {
    if (inRing(x, y, p.rings[i] as Float64Array)) return false;
  }
  return true;
}

/** Abstand eines Punkts zum Außenring in Kilometern (lokale flache Näherung, Längenabstand mit cos(Breite)). */
function distanceToOuterKm(x: number, y: number, ring: Float64Array, cosLat: number): number {
  let best = Infinity;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = (ring[2 * j] as number) * cosLat;
    const ay = ring[2 * j + 1] as number;
    const bx = (ring[2 * i] as number) * cosLat;
    const by = ring[2 * i + 1] as number;
    const px = x * cosLat;
    const dx = bx - ax;
    const dy = by - ay;
    const den = dx * dx + dy * dy;
    let t = den === 0 ? 0 : ((px - ax) * dx + (y - ay) * dy) / den;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return (best / 100) * KM_PER_DEGREE;
}

/**
 * Liefert den Ländercode (ISO-Alpha-2) zu einer Position oder `null`, wenn kein Land in Frage kommt
 * (offenes Meer, ungültige Koordinaten).
 */
export function findCountry(index: CountryIndex, lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const x = lon * 100;
  const y = lat * 100;

  let hit: GeoPolygon | null = null;
  for (const p of index.polygons) {
    if (inPolygon(x, y, p) && (hit === null || p.boxArea < hit.boxArea)) hit = p;
  }
  if (hit) return hit.code;

  // Außerhalb aller Polygone (Küste, vereinfachte Grenze): nächstes Land innerhalb von SNAP_KM.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const padY = (SNAP_KM / KM_PER_DEGREE) * 100;
  const padX = padY / cosLat;
  let bestCode: string | null = null;
  let bestKm = SNAP_KM;
  for (const p of index.polygons) {
    if (x < p.minX - padX || x > p.maxX + padX || y < p.minY - padY || y > p.maxY + padY) continue;
    const outer = p.rings[0];
    if (!outer) continue;
    const km = distanceToOuterKm(x, y, outer, cosLat);
    if (km <= bestKm) {
      bestKm = km;
      bestCode = p.code;
    }
  }
  return bestCode;
}

const names = new Map<string, string>();
let displayNames: Intl.DisplayNames | null | undefined;

/** Deutscher Ländername zum Code (über `Intl.DisplayNames`); fällt auf den Code zurück, wenn das System den Namen nicht kennt. */
export function countryName(code: string): string {
  const cached = names.get(code);
  if (cached) return cached;
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['de'], { type: 'region' });
    } catch {
      displayNames = null;
    }
  }
  let name = code;
  try {
    name = displayNames?.of(code) ?? code;
  } catch {
    name = code;
  }
  names.set(code, name);
  return name;
}

/** Alle Codes des Index, nach deutschem Namen sortiert (für Auswahllisten). */
export function sortedCountryCodes(index: CountryIndex): string[] {
  return [...index.codes].sort((a, b) => countryName(a).localeCompare(countryName(b), 'de'));
}
