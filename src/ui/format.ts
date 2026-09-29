function comma(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${comma(m / 1000, 2)} km`;
}

export function formatDuration(sec: number): string {
  if (!(sec > 0)) return '–';
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

export function formatSpeed(ms: number): string {
  return ms > 0 ? `${comma(ms * 3.6, 1)} km/h` : '–';
}

export function formatElevation(m: number): string {
  return `${Math.round(m)} m`;
}

/** "2026-08-14" → "14.08.2026"; andere Eingaben bleiben unverändert. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Ganze Zahl mit Punkt als Tausendertrenner: 12345 → "12.345". */
export function formatInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Summen-Kilometer mit einer Nachkommastelle: 1234500 m → "1.234,5 km". */
export function formatKm(m: number): string {
  const tenths = Math.round(m / 100); // ganzzahlig runden, vermeidet Gleitkomma-Effekte bei toFixed
  return `${formatInt(Math.floor(tenths / 10))},${tenths % 10} km`;
}
