/**
 * Darstellung: "system" folgt dem Gerät, "light"/"dark" erzwingen ein Farbschema.
 * Die Farbrollen selbst stehen in theme.css; hier wird nur `data-theme` am <html>-Element gesetzt.
 * index.html enthält denselben Lesevorgang als Inline-Skript, damit beim Laden nichts aufblitzt.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const THEME_KEY = 'gpx-tracker.theme';

export function parseThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Welches Farbschema tatsächlich gilt. */
export function resolveScheme(pref: ThemePref, systemPrefersDark: boolean): Scheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Nächste Einstellung beim Antippen des Schalters in der App-Leiste: immer das Gegenteil des aktuell sichtbaren Schemas. */
export function toggledPref(current: Scheme): ThemePref {
  return current === 'dark' ? 'light' : 'dark';
}

export function getThemePref(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system'; // Speicher nicht verfügbar
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function currentScheme(): Scheme {
  return resolveScheme(getThemePref(), systemPrefersDark());
}

/** Setzt data-theme (nur bei ausdrücklicher Wahl), color-scheme und die Farbe der Systemleiste. */
export function applyTheme(): void {
  const pref = getThemePref();
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  const bg = getComputedStyle(root).getPropertyValue('--md-sys-color-surface').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || (currentScheme() === 'dark' ? '#11140e' : '#f8faf0'));
  window.dispatchEvent(new CustomEvent('themechange'));
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* Speicher nicht verfügbar: Wahl gilt nur bis zum Neuladen */
    if (pref === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pref;
  }
  applyTheme();
}

/** Beim Start aufrufen; reagiert auch auf Wechsel des Geräte-Schemas im Modus "system". */
export function initTheme(): void {
  applyTheme();
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePref() === 'system') applyTheme();
    });
  }
}
