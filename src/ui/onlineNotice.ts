import { h } from './dom';

/**
 * TEMP-ONLINE-MAP: Hinweis, dass die Online-Karte eine Internetverbindung braucht (nur im Online-Modus sichtbar).
 * Entfällt, wenn es detaillierte Offline-Karten gibt und die Online-Karte nicht mehr nötig ist (ADR-002).
 */
export function createOnlineNotice(): HTMLElement {
  const el = h('div', { class: 'notice', role: 'status' });
  const update = () => {
    if (navigator.onLine) {
      el.textContent = 'Online-Karte: Für den Kartenhintergrund ist eine Internetverbindung nötig. Deine Touren sind lokal gespeichert.';
      el.classList.remove('notice-warn');
    } else {
      el.textContent = 'Keine Internetverbindung: Der Kartenhintergrund kann nicht geladen werden. Deine Tracks werden weiterhin angezeigt. In den Einstellungen lässt sich die Offline-Karte wählen.';
      el.classList.add('notice-warn');
    }
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return el;
}
