import { h } from './dom';
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
 */
export function openSheet(title: string, items: SheetItem[]): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div', { class: 'sheet-handle' }), h('h2', { class: 'sheet-title' }, title));

  function close(): void {
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 200);
    opener?.focus();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  for (const it of items) {
    const b = h('button', { type: 'button', class: 'sheet-item' }, icon(it.icon), h('span', { class: 'sheet-item-text' }, h('span', { class: 'sheet-item-label' }, it.label), h('span', { class: 'sheet-item-support' }, it.text)));
    b.addEventListener('click', () => {
      close();
      it.onSelect();
    });
    sheet.append(b);
  }
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, sheet);
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
    sheet.querySelector<HTMLElement>('.sheet-item')?.focus();
  });
}

let snackTimer: ReturnType<typeof setTimeout> | null = null;

/** Kurze Rückmeldung am unteren Rand (Material 3 Snackbar), verschwindet nach einigen Sekunden. */
export function showSnackbar(text: string, ms = 6000): void {
  document.querySelector('.snackbar')?.remove();
  if (snackTimer) clearTimeout(snackTimer);
  const bar = h('div', { class: 'snackbar', role: 'status' }, text);
  document.body.append(bar);
  snackTimer = setTimeout(() => bar.remove(), ms);
}
