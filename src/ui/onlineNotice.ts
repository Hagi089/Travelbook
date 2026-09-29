import { h } from './dom';

/**
 * TEMP-ONLINE-MAP: Hinweis, dass die Karte aktuell eine Internetverbindung braucht.
 * Beim Umstieg auf Offline-Karten: diese Datei und ihre Verwendungen (mapView.ts, settingsView.ts) entfernen.
 */
export function createOnlineNotice(): HTMLElement {
  const el = h('div', { class: 'notice', role: 'status' });
  const update = () => {
    if (navigator.onLine) {
      el.textContent = 'Online-Karte: Für den Kartenhintergrund ist eine Internetverbindung nötig. Deine Touren sind lokal gespeichert.';
      el.classList.remove('notice-warn');
    } else {
      el.textContent = 'Keine Internetverbindung: Der Kartenhintergrund kann nicht geladen werden. Deine Tracks werden weiterhin angezeigt.';
      el.classList.add('notice-warn');
    }
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return el;
}
