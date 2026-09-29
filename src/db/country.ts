import type { GpxDb } from './db';
import { updateTour } from './tours';
import type { Tour } from './types';
import { findCountry, loadCountryIndex } from '../geo';

/** Auswahl für die manuelle Korrektur des Landes einer Tour. */
export type CountryChoice = { kind: 'auto' } | { kind: 'none' } | { kind: 'code'; code: string };

/** Laufende oder unterbrochene Aufnahmen haben noch keinen endgültigen Startpunkt und werden übersprungen. */
function isOpenRecording(t: Tour): boolean {
  return t.source === 'recording' && t.endTime === null;
}

/**
 * Ergänzt das Land bei allen Touren, deren `countryCode` noch nicht berechnet ist (`undefined`), aus dem Startpunkt.
 * Ohne Startpunkt oder ohne Treffer wird `null` gespeichert. Manuell gesetzte Länder werden nie angefasst;
 * `updatedAt` bleibt unverändert (keine Nutzeränderung). Gibt die Zahl der ergänzten Touren zurück.
 * Wirft, wenn die Ländergrenzen nicht geladen werden können; die Touren bleiben dann unverändert.
 */
export async function assignCountries(db: GpxDb): Promise<number> {
  const pending = await db.tours.filter((t) => t.countryCode === undefined && !isOpenRecording(t)).toArray();
  if (pending.length === 0) return 0;
  const index = await loadCountryIndex();
  for (const t of pending) {
    const code = t.startPoint ? findCountry(index, t.startPoint.lat, t.startPoint.lon) : null;
    // Nur schreiben, wenn nicht inzwischen (z. B. durch die Nutzerin) ein Wert gesetzt wurde.
    await db.tours.where('id').equals(t.id).modify((row) => {
      if (row.countryCode === undefined) row.countryCode = code;
    });
  }
  return pending.length;
}

/** Setzt das Land einer Tour von Hand („Automatisch“ berechnet es beim nächsten Öffnen der Liste neu). */
export async function setTourCountry(db: GpxDb, id: string, choice: CountryChoice): Promise<Tour> {
  if (choice.kind === 'auto') return updateTour(db, id, { countryCode: undefined, countryManual: false });
  if (choice.kind === 'none') return updateTour(db, id, { countryCode: null, countryManual: true });
  const index = await loadCountryIndex();
  if (!index.codes.includes(choice.code)) throw new Error(`Unbekannter Ländercode: ${choice.code}`);
  return updateTour(db, id, { countryCode: choice.code, countryManual: true });
}
