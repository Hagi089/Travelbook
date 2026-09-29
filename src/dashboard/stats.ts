import type { Tour } from '../db/types';

/** Standardkategorien, auf denen die Dashboards beruhen (IDs bleiben beim Umbenennen stabil). */
export const DASHBOARD_CATEGORY_IDS = {
  bike: 'default-fahrradfahren',
  hike: 'default-wandern',
  camper: 'default-womo-stellplatz',
} as const;

export interface ActivityTotals {
  count: number;
  distanceM: number;
  /** Summe der Gesamtdauern (Ende minus Start), nicht Bewegungszeit; Touren ohne Zeitstempel zählen 0. */
  durationSec: number;
  ascentM: number;
}

/** Summiert Anzahl, Distanz, Dauer und Höhenmeter (Aufstieg) der übergebenen Touren. */
export function activityTotals(tours: ReadonlyArray<Tour>): ActivityTotals {
  const totals: ActivityTotals = { count: tours.length, distanceM: 0, durationSec: 0, ascentM: 0 };
  for (const t of tours) {
    totals.distanceM += t.distanceM;
    totals.durationSec += t.durationSec;
    totals.ascentM += t.ascentM;
  }
  return totals;
}

export interface PlaceVisits {
  name: string;
  visits: number;
  /** Datum des jüngsten Besuchs, "YYYY-MM-DD". */
  lastDate: string;
}

export interface PlaceStats {
  /** Anzahl verschiedener Stellplätze. */
  places: number;
  /** Am häufigsten besuchte Stellplätze; bei Gleichstand der zuletzt besuchte zuerst. */
  top: PlaceVisits[];
}

/**
 * Jede Tour einer Stellplatz-Kategorie ist ein Besuch. Gleicher Name (ohne Beachtung von Groß-/Kleinschreibung
 * und äußeren Leerzeichen) bedeutet gleicher Stellplatz.
 */
export function placeStats(tours: ReadonlyArray<Tour>, topN = 5): PlaceStats {
  const byKey = new Map<string, PlaceVisits>();
  for (const t of tours) {
    const name = t.name.trim();
    const key = name.toLocaleLowerCase();
    const cur = byKey.get(key);
    if (cur) {
      cur.visits += 1;
      if (t.date > cur.lastDate) cur.lastDate = t.date;
    } else {
      byKey.set(key, { name, visits: 1, lastDate: t.date });
    }
  }
  const all = [...byKey.values()].sort((a, b) => b.visits - a.visits || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
  return { places: all.length, top: all.slice(0, topN) };
}
