/**
 * Kartenquellen-Schicht. Die Oberfläche kennt nur `getMapBackground(mode)` bzw. `getTileSource(mode)`, nie eine feste URL.
 *
 * - Online: OpenStreetMap-Standardkacheln (TEMP-ONLINE-MAP: nur für moderate Nutzung, siehe unten).
 * - Offline (Phase 8c, Stufe 1): grobe Weltkarte aus den gebündelten Ländergrenzen (`src/geo/`), keine Kacheln.
 *   Detaillierte Regionalkarten (Stufe 2) sind noch nicht umgesetzt (docs/ARCHITECTURE.md, ADR-002).
 */
export type MapMode = 'online' | 'offline';

export interface TileSource {
  id: string;
  label: string;
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  /** true = Kacheln kommen aus dem Internet. */
  requiresInternet: boolean;
}

// TEMP-ONLINE-MAP: OSM-Standardkacheln sind nur für moderate Nutzung gedacht (Nutzungsrichtlinie der OSM Foundation)
// und dürfen nicht massenhaft vorgeladen werden. Für Offline-Karten eine eigene/erlaubte Quelle verwenden.
export const ONLINE_OSM: TileSource = {
  id: 'osm-online',
  label: 'OpenStreetMap (online)',
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  maxZoom: 19,
  requiresInternet: true,
};

/**
 * Höchste Zoomstufe der Karte, unabhängig vom Hintergrund. Leaflet leitet sie sonst aus den Kachelebenen ab; ohne
 * Kacheln (Offline-Weltkarte) wäre sie unbegrenzt und `fitBounds` auf einen einzelnen Punkt ergäbe Zoom „unendlich“.
 */
export const MAP_MAX_ZOOM = ONLINE_OSM.maxZoom;

/** Höchste Zoomstufe beim automatischen Einpassen der Touren (etwa Stadtteil-Maßstab), damit Einzelpunkte Umgebung zeigen. */
export const FIT_MAX_ZOOM = 15;

/** Offline-Hintergrund ohne Kacheln: Länderflächen aus den gebündelten Natural-Earth-Daten. */
export interface CountryBase {
  id: 'countries';
  label: string;
  attribution: string;
  requiresInternet: false;
}

export const OFFLINE_COUNTRIES: CountryBase = {
  id: 'countries',
  label: 'Weltkarte (Länder)',
  attribution: 'Ländergrenzen: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (gemeinfrei)',
  requiresInternet: false,
};

export type MapBackground = { kind: 'tiles'; source: TileSource } | { kind: 'countries'; base: CountryBase };

/** Kartenhintergrund für den Modus. */
export function getMapBackground(mode: MapMode): MapBackground {
  return mode === 'offline' ? { kind: 'countries', base: OFFLINE_COUNTRIES } : { kind: 'tiles', source: ONLINE_OSM };
}

/** Liefert die Kachelquelle für den Modus oder null, wenn der Modus keine Kacheln nutzt (Offline: Länderflächen). */
export function getTileSource(mode: MapMode): TileSource | null {
  const bg = getMapBackground(mode);
  return bg.kind === 'tiles' ? bg.source : null;
}
