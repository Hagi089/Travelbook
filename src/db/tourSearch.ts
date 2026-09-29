import type { Tour } from './types';

/** Wie viele Touren der Filter „Letzte Touren“ zeigt. */
export const LATEST_TOUR_COUNT = 10;

export interface TourQuery {
  /** Suchtext; jedes Wort muss im Namen oder in den Notizen vorkommen (Groß-/Kleinschreibung egal). */
  text?: string;
  /** Jahr als "YYYY" (Vergleich mit dem Tourdatum). */
  year?: string;
  /** Nur die neuesten N Touren (nach Anwendung der übrigen Bedingungen). */
  latest?: number;
}

function newestFirst(a: Tour, b: Tour): number {
  return b.date.localeCompare(a.date) || (b.startTime ?? 0) - (a.startTime ?? 0);
}

function words(text: string): string[] {
  return text.toLocaleLowerCase('de').split(/\s+/).filter((w) => w !== '');
}

/** Wendet Suchtext, Jahr und „Letzte N“ auf eine Tourenliste an. Die Eingabe bleibt unverändert; das Ergebnis ist neueste zuerst sortiert. */
export function queryTours(tours: readonly Tour[], query: TourQuery): Tour[] {
  const terms = words(query.text ?? '');
  let result = tours.filter((t) => {
    if (query.year && t.date.slice(0, 4) !== query.year) return false;
    if (terms.length === 0) return true;
    const haystack = `${t.name}\n${t.notes}`.toLocaleLowerCase('de');
    return terms.every((w) => haystack.includes(w));
  });
  result = [...result].sort(newestFirst);
  if (query.latest !== undefined && query.latest >= 0) result = result.slice(0, query.latest);
  return result;
}

/** Jahre, in denen Touren liegen, neueste zuerst (ohne Duplikate). Ungültige Datumswerte werden ignoriert. */
export function tourYears(tours: readonly Tour[]): string[] {
  const years = new Set<string>();
  for (const t of tours) {
    const y = t.date.slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}
