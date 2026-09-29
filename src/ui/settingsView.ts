import { getMapMode, setMapMode } from '../map/mapMode';
import { OFFLINE_MAPS_AVAILABLE, ONLINE_OSM } from '../map/tileSource';
import { h, type View } from './dom';

export function createSettingsView(): View {
  const el = h('section', { class: 'view scroll', hidden: '' });

  function render(): void {
    const mode = getMapMode();
    const online = h('input', { type: 'radio', name: 'mapmode', value: 'online' });
    const offline = h('input', { type: 'radio', name: 'mapmode', value: 'offline' });
    online.checked = mode === 'online';
    offline.checked = mode === 'offline';
    offline.disabled = !OFFLINE_MAPS_AVAILABLE; // TEMP-ONLINE-MAP: entfällt, sobald Offline-Karten existieren
    for (const r of [online, offline]) {
      r.addEventListener('change', () => {
        if (r.checked) setMapMode(r.value === 'offline' ? 'offline' : 'online');
      });
    }
    el.replaceChildren(
      h('h2', {}, 'Einstellungen'),
      h('h3', {}, 'Karte'),
      h('label', { class: 'radio' }, online, ` Online-Karte (${ONLINE_OSM.label})`),
      h('label', { class: 'radio' }, offline, OFFLINE_MAPS_AVAILABLE ? ' Offline-Karte' : ' Offline-Karte (noch nicht verfügbar)'),
      h('p', { class: 'muted' }, 'Die Online-Karte braucht eine Internetverbindung, um den Kartenhintergrund zu laden. Touren, Notizen und Fotos liegen immer lokal auf dem Gerät.'),
    );
  }
  render();

  return { el, onShow: render };
}
