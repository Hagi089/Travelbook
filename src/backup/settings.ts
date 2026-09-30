/**
 * Einstellungen, die im Backup mitgesichert werden (Phase 8a): nur die beiden Geräte-Einstellungen aus localStorage.
 * Beim Wiederherstellen wird jeder Wert geprüft; unbekannte Schlüssel und ungültige Werte werden ignoriert.
 * Ein fehlender Eintrag bedeutet den Standard (Design „system“, Karte „online“) und wird auch so gesichert, damit ein
 * Wiederherstellen die Wahl des Zielgeräts wirklich zurücksetzt.
 */
export const BACKUP_SETTING_KEYS = ['gpx-tracker.theme', 'gpx-tracker.mapMode'] as const;
export const LAST_BACKUP_KEY = 'gpx-tracker.lastBackup';

const ALLOWED_VALUES: Record<string, ReadonlyArray<string>> = {
  'gpx-tracker.theme': ['system', 'light', 'dark'],
  'gpx-tracker.mapMode': ['online', 'offline'],
};

const DEFAULTS: Record<string, string> = {
  'gpx-tracker.theme': 'system',
  'gpx-tracker.mapMode': 'online',
};

const THEME_KEY = 'gpx-tracker.theme';

/** Behält nur bekannte Schlüssel mit erlaubten Werten. */
export function sanitizeSettings(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BACKUP_SETTING_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && ALLOWED_VALUES[key].includes(v)) out[key] = v;
  }
  return out;
}

export function collectSettings(storage: Pick<Storage, 'getItem'> = localStorage): Record<string, string> {
  const raw: Record<string, unknown> = {};
  for (const key of BACKUP_SETTING_KEYS) {
    try {
      raw[key] = storage.getItem(key) ?? DEFAULTS[key];
    } catch {
      /* Speicher nicht verfügbar */
    }
  }
  return sanitizeSettings(raw);
}

/** Schreibt die (geprüften) Einstellungen. Wirkt nach dem Neuladen der App. */
export function applySettings(settings: Record<string, string>, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): number {
  const clean = sanitizeSettings(settings);
  let n = 0;
  for (const [k, v] of Object.entries(clean)) {
    try {
      // Design „system“ ist bei dieser App der fehlende Eintrag (siehe src/ui/theme.ts, index.html).
      if (k === THEME_KEY && v === 'system') storage.removeItem(k);
      else storage.setItem(k, v);
      n++;
    } catch {
      /* Speicher nicht verfügbar */
    }
  }
  return n;
}

export function getLastBackup(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setLastBackup(ts: number): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(ts));
  } catch {
    /* ignorieren */
  }
}
