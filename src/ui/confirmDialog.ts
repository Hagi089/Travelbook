import { h } from './dom';

export interface ConfirmOptions {
  title: string;
  /** Erklärender Text unter dem Titel. */
  text?: string;
  /** Beschriftung der bestätigenden Schaltfläche, z. B. „Löschen“. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Rot hervorgehoben (Löschen, Ersetzen). */
  destructive?: boolean;
}

type BackHook = () => boolean;
type BackWindow = Window & { __travelbookBack?: BackHook };

/**
 * Bestätigungsdialog im Material-3-Stil (ersetzt `window.confirm`). Liefert true bei Bestätigung, false bei Abbrechen,
 * Escape, Antippen der Fläche dahinter oder Android-Zurück-Taste. Fokus startet auf „Abbrechen“ und geht danach an den Auslöser zurück.
 * Android-Zurück: In der App fragt MainActivity `window.__travelbookBack` ab; solange der Dialog offen ist, schließt dieser Hook den Dialog
 * (die vorherige Zurück-Aktion wird danach wiederhergestellt). Im Browser gibt es dafür keinen History-Eintrag.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const win = window as BackWindow;
    const previousBack = win.__travelbookBack;
    const titleId = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;

    const scrim = h('div', { class: 'scrim dialog-scrim' });
    const cancel = h('button', { type: 'button', class: 'ghost' }, opts.cancelLabel ?? 'Abbrechen');
    const ok = h('button', { type: 'button', class: opts.destructive ? 'ghost danger' : 'ghost' }, opts.confirmLabel);
    const dialog = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('h2', { class: 'dialog-title', id: titleId }, opts.title),
      opts.text ? h('p', { class: 'dialog-text' }, opts.text) : null,
      h('div', { class: 'dialog-actions' }, cancel, ok),
    );

    let done = false;
    function finish(result: boolean): void {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      if (previousBack) win.__travelbookBack = previousBack;
      else delete win.__travelbookBack;
      scrim.classList.remove('open');
      dialog.classList.remove('open');
      setTimeout(() => {
        scrim.remove();
        dialog.remove();
      }, 150);
      opener?.focus();
      resolve(result);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Tab') {
        // Fokus im Dialog halten (zwei Schaltflächen).
        e.preventDefault();
        (document.activeElement === cancel ? ok : cancel).focus();
      }
    }

    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    scrim.addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onKey, true);
    win.__travelbookBack = () => {
      finish(false);
      return true;
    };

    document.body.append(scrim, dialog);
    requestAnimationFrame(() => {
      scrim.classList.add('open');
      dialog.classList.add('open');
    });
    cancel.focus();
  });
}
