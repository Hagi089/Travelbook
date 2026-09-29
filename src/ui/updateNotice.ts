import { h } from './dom';

/** Hinweis am unteren Rand: neue App-Version ist geladen und wartet. Bleibt stehen, bis der Nutzer „Neu laden“ wählt. */
export function showUpdateNotice(activate: () => void): void {
  if (document.querySelector('.update-notice')) return;
  const button = h('button', { type: 'button', class: 'ghost' }, 'Neu laden');
  button.addEventListener('click', () => {
    button.disabled = true;
    activate();
  });
  document.body.append(h('div', { class: 'snackbar update-notice', role: 'status' }, h('span', {}, 'Neue Version verfügbar.'), button));
}
