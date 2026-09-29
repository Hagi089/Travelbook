/**
 * Kartenquellen-Schicht. Die Oberfläche kennt nur `getTileSource(mode)`, nie eine feste URL.
 *
 * TEMP-ONLINE-MAP: Aktuell gibt es nur eine Online-Quelle (OpenStreetMap-Standardkacheln).
 * Für die spätere Offline-Karte: Quelle hier ergänzen, OFFLINE_MAPS_AVAILABLE auf true setzen
 * und die mit "TEMP-ONLINE-MAP" markierten Stellen zurückbauen (Liste: docs/ARCHITECTURE.md, ADR-002).
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

/** Solange false, ist der Offline-Modus in den Einstellungen deaktiviert. */
export const OFFLINE_MAPS_AVAILABLE = false;

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

/** Liefert die Kartenquelle für den Modus oder null, wenn dafür (noch) keine Quelle existiert. */
export function getTileSource(mode: MapMode): TileSource | null {
  if (mode === 'online') return ONLINE_OSM;
  return null; // Offline-Quelle: noch nicht vorhanden
}
