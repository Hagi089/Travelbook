import type { GpxDb } from '../db-api';
import { getMapMode, setMapMode } from '../map/mapMode';
import { OFFLINE_MAPS_AVAILABLE, ONLINE_OSM } from '../map/tileSource';
import { createCategoriesPanel } from './categoriesPanel';
import { h, type View } from './dom';

function section(title: string, hint: string | null, ...body: Array<HTMLElement | null>): HTMLElement {
  return h('section', { class: 'settings-section' }, h('h3', {}, title), hint ? h('p', { class: 'muted' }, hint) : null, ...body);
}

/** Auswahlkarte für einen Kartenmodus (Radio-Button mit Titel und Erklärung). */
function modeOption(radio: HTMLInputElement, title: string, text: string, badge?: string): HTMLElement {
  const label = h('label', { class: radio.disabled ? 'option disabled' : 'option' }, radio, h('span', { class: 'option-text' }, h('span', { class: 'option-title' }, title, badge ? h('span', { class: 'badge' }, badge) : null), h('span', { class: 'muted small' }, text)));
  return label;
}

export function createSettingsView(db: GpxDb): View {
  const categories = createCategoriesPanel(db);
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
      h('div', { class: 'page' },
        h('h2', {}, 'Einstellungen'),
        section(
          'Karte',
          null,
          h('div', { class: 'options' },
            modeOption(online, 'Online-Karte', `Kartenhintergrund von ${ONLINE_OSM.label}. Braucht eine Internetverbindung.`),
            modeOption(offline, 'Offline-Karte', OFFLINE_MAPS_AVAILABLE ? 'Kartenhintergrund ohne Internet.' : 'Kartenhintergrund ohne Internet, in Vorbereitung.', OFFLINE_MAPS_AVAILABLE ? undefined : 'bald'), // TEMP-ONLINE-MAP
          ),
          h('p', { class: 'muted small' }, 'Deine Touren, Tracks und Notizen werden immer lokal auf dem Gerät gespeichert und auch ohne Internet angezeigt; nur der Kartenhintergrund braucht Internet.'),
        ),
        section('Kategorien', 'Die Farbe einer Kategorie bestimmt die Darstellung der Touren auf der Karte. Änderungen werden automatisch gespeichert.', categories.el),
        section('Datenschutz', 'Alle Daten bleiben auf diesem Gerät. Es gibt kein Konto, keine Cloud und keine Analyse-Dienste.'),
      ),
    );
  }
  render();

  return {
    el,
    async onShow() {
      render();
      await categories.refresh();
    },
  };
}
