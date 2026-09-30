import { Capacitor } from '@capacitor/core';
import { h } from './dom';
import { icon } from './icons';
import { currentScheme, setThemePref, toggledPref } from './theme';

/** Was Ansichten von der App-Leiste steuern dürfen. */
export interface Chrome {
  /** Titel in der App-Leiste. */
  title(text: string): void;
  /** Zurück-Aktion setzen (Pfeil erscheint, Android-Zurück-Taste löst sie aus) oder mit null entfernen. */
  back(fn: (() => void) | null): void;
  /** Schwebenden „Neue Tour“-Button ein-/ausblenden. */
  fab(visible: boolean): void;
  /** Löst „Zurück“ aus wie Pfeil bzw. Systemtaste (räumt dabei den History-Eintrag ab). */
  goBack(): void;
  /** Entfernt die Zurück-Aktion nur, wenn sie noch `fn` ist (ohne History-Änderung). */
  clearBackIf(fn: () => void): void;
  /**
   * Meldet eine Überlagerung an (z. B. Foto-Vollbild), die vor der Zurück-Aktion der Seite schließt. Gibt die Funktion
   * zurück, die sie wieder abmeldet (beim Schließen aufrufen). Im Browser läuft Zurück weiter über die History
   * (Seite verlassen, Überlagerung schließt mit); die App-Leiste und die Android-App schließen zuerst die Überlagerung.
   */
  overlay(close: () => void): () => void;
}

export interface ChromeView {
  chrome: Chrome;
  topBar: HTMLElement;
  fabButton: HTMLButtonElement;
}

/**
 * App-Leiste (Material 3 „Small top app bar“) mit Zurück-Pfeil und Hell/Dunkel-Schalter.
 *
 * Android-Zurück-Taste: Beim Wechsel von „keine Zurück-Aktion“ zu „hat Zurück-Aktion“ wird ein History-Eintrag
 * angelegt. Löst der Nutzer „Zurück“ aus (Pfeil oder Systemtaste), kommt ein popstate, und die Zurück-Aktion läuft.
 * Wird eine Unterseite auf anderem Weg verlassen (z. B. Navigationsleiste), bleibt der Eintrag stehen und wird
 * beim nächsten Zurück lautlos abgebaut – bewusst einfach gehalten statt History-Umbau mit Wettlaufgefahr.
 *
 * In der Android-App (Capacitor) gibt es keine History-Einträge: MainActivity.kt fragt bei jedem Zurück über
 * `window.__travelbookBack` an, ob die Oberfläche selbst zurückgehen kann (true) oder die App-Standardaktion gelten soll
 * (false, verlässt die App). Grund: Ein Test am Gerät zeigte, dass der History-Weg dort das Sheet „Neue Tour“ nicht
 * abfing und die App schloss.
 */
export function createChrome(onFabClick: () => void): ChromeView {
  const backBtn = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Zurück', hidden: '' }, icon('back'));
  const titleEl = h('h1', { class: 'top-title' });
  const themeBtn = h('button', { type: 'button', class: 'icon-button' });
  const topBar = h('header', { class: 'top-app-bar' }, backBtn, titleEl, themeBtn);
  const fabButton = h('button', { type: 'button', class: 'fab-extended', hidden: '' }, icon('add'), h('span', {}, 'Neue Tour'));
  fabButton.addEventListener('click', onFabClick);

  let backFn: (() => void) | null = null;
  let depth = 0;
  const native = Capacitor.isNativePlatform();

  const overlays: Array<() => void> = [];

  /** Führt die oberste Überlagerung bzw. die aktuelle Zurück-Aktion aus; false, wenn es nichts zu tun gibt. */
  function runBack(): boolean {
    const top = overlays.pop();
    if (top) {
      top();
      return true;
    }
    const f = backFn;
    if (!f) return false;
    backFn = null;
    backBtn.hidden = true;
    f();
    return true;
  }
  if (native) (window as unknown as { __travelbookBack?: () => boolean }).__travelbookBack = runBack;

  function renderTheme(): void {
    const dark = currentScheme() === 'dark';
    themeBtn.replaceChildren(icon(dark ? 'lightMode' : 'darkMode'));
    themeBtn.setAttribute('aria-label', dark ? 'Helles Design einschalten' : 'Dunkles Design einschalten');
  }
  themeBtn.addEventListener('click', () => setThemePref(toggledPref(currentScheme())));
  window.addEventListener('themechange', renderTheme);
  renderTheme();

  const chrome: Chrome = {
    title(text) {
      titleEl.textContent = text;
    },
    back(fn) {
      const hadNone = backFn === null;
      backFn = fn;
      backBtn.hidden = fn === null;
      if (fn && hadNone && !native) {
        history.pushState({ tb: 1 }, '');
        depth++;
      }
    },
    fab(visible) {
      fabButton.hidden = !visible;
    },
    overlay(close) {
      overlays.push(close);
      return () => {
        const i = overlays.lastIndexOf(close);
        if (i >= 0) overlays.splice(i, 1);
      };
    },
    goBack() {
      if (overlays.length > 0) runBack();
      else if (depth > 0) history.back();
      else runBack();
    },
    clearBackIf(fn) {
      if (backFn !== fn) return;
      backFn = null;
      backBtn.hidden = true;
    },
  };

  backBtn.addEventListener('click', () => chrome.goBack());

  window.addEventListener('popstate', () => {
    if (depth > 0) depth--;
    const f = backFn;
    if (f) {
      // Erst leeren: setzt die Zurück-Aktion eine Folgeseite, legt sie einen frischen History-Eintrag an.
      backFn = null;
      backBtn.hidden = true;
      f();
    } else if (depth > 0) {
      // Übrig gebliebene Einträge früherer Unterseiten lautlos abbauen.
      const d = depth;
      depth = 0;
      history.go(-d);
    }
  });

  return { chrome, topBar, fabButton };
}
