import { findCountry, parseCountryData, type CountryIndex } from './countries';

export * from './countries';

let cache: Promise<CountryIndex> | null = null;

/** Lädt die gebündelten Ländergrenzen beim ersten Aufruf (eigener Chunk, nicht im Start-Bundle) und merkt sie sich. */
export function loadCountryIndex(): Promise<CountryIndex> {
  if (!cache) {
    cache = import('./countryData').then((m) => parseCountryData(m.COUNTRY_DATA));
    // Schlägt das Laden fehl (z. B. Chunk nicht erreichbar), soll der nächste Aufruf es erneut versuchen.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

/** Ländercode zu einer Position oder `null` (siehe `findCountry`). */
export async function detectCountry(lat: number, lon: number): Promise<string | null> {
  return findCountry(await loadCountryIndex(), lat, lon);
}
