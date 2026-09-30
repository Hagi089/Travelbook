import { h } from './dom';
import type { Chrome } from './chrome';
import { icon, type IconName } from './icons';

export interface SheetItem {
  icon: IconName;
  label: string;
  text: string;
  onSelect: () => void;
}

/**
 * Modales Bottom Sheet (Material 3): Auswahl aus wenigen Aktionen. Schließt per Antippen der Fläche dahinter,
 * Escape oder Auswahl eines Eintrags. Fokus geht in das Sheet und danach zurück an den Auslöser.
 * Mit `chrome` schließt auch die Android-Zurück-Taste das Sheet (statt die App zu verlassen): Das Sheet registriert sich
 * als Zurück-Aktion; Auswahl eines Eintrags übergibt den History-Eintrag an die Folgeseite.
 */
export function openSheet(title: string, items: SheetItem[], chrome?: Chrome): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div', { class: 'sheet-handle' }), h('h2', { class: 'sheet-title' }, title));

  let closed = false;
  let dismissing = false;

  /** Nur die Darstellung schließen (mehrfach aufrufbar). */
  function hide(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 200);
    opener?.focus();
  }
  /** Der Nutzer schließt das Sheet (Fläche dahinter, Escape). Mit `chrome` über „Zurück“, damit der History-Eintrag verschwindet. */
  function dismiss(): void {
    if (closed || dismissing) return;
    dismissing = true;
    if (chrome) chrome.goBack();
    else hide();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') dismiss();
  }

  for (const it of items) {
    const b = h('button', { type: 'button', class: 'sheet-item' }, icon(it.icon), h('span', { class: 'sheet-item-text' }, h('span', { class: 'sheet-item-label' }, it.label), h('span', { class: 'sheet-item-support' }, it.text)));
    b.addEventListener('click', () => {
      hide();
      it.onSelect();
      chrome?.clearBackIf(hide); // hat die Folgeseite keine eigene Zurück-Aktion gesetzt, wird unsere entfernt
    });
    sheet.append(b);
  }
  scrim.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, sheet);
  chrome?.back(hide);
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
    sheet.querySelector<HTMLElement>('.sheet-item')?.focus();
  });
}

let snackTimer: ReturnType<typeof setTimeout> | null = null;

/** Kurze Rückmeldung am unteren Rand (Material 3 Snackbar), verschwindet nach einigen Sekunden. */
export function showSnackbar(text: string, ms = 6000): void {
  // Nur eine frühere kurze Meldung ersetzen, nicht den stehenden Hinweis „Neue Version verfügbar“ (auch .snackbar).
  document.querySelector('.snackbar:not(.update-notice)')?.remove();
  if (snackTimer) clearTimeout(snackTimer);
  const bar = h('div', { class: 'snackbar', role: 'status' }, text);
  document.body.append(bar);
  snackTimer = setTimeout(() => bar.remove(), ms);
}
