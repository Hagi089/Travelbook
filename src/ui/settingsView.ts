import { buildInfoText, PHASE_LABEL } from '../buildInfo';
import type { GpxDb } from '../db-api';
import { getMapMode, setMapMode } from '../map/mapMode';
import { ONLINE_OSM } from '../map/tileSource';
import { createBackupPanel } from './backupPanel';
import { createCategoriesPanel } from './categoriesPanel';
import { h, type View } from './dom';
import { icon } from './icons';
import { getThemePref, setThemePref, type ThemePref } from './theme';

function section(title: string, hint: string | null, ...body: Array<HTMLElement | null>): HTMLElement {
  return h('section', { class: 'settings-section' }, h('h3', {}, title), hint ? h('p', { class: 'muted' }, hint) : null, ...body);
}

/** Auswahlkarte für einen Kartenmodus (Radio-Button mit Titel und Erklärung). */
function modeOption(radio: HTMLInputElement, title: string, text: string, badge?: string): HTMLElement {
  const label = h('label', { class: radio.disabled ? 'option disabled' : 'option' }, radio, h('span', { class: 'option-text' }, h('span', { class: 'option-title' }, title, badge ? h('span', { class: 'badge' }, badge) : null), h('span', { class: 'muted small' }, text)));
  return label;
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

/** Segmentierte Schaltfläche (Material 3) für Hell/Dunkel/System. */
function themeSegments(): HTMLElement {
  const pref = getThemePref();
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Darstellung' });
  for (const o of THEME_OPTIONS) {
    const input = h('input', { type: 'radio', name: 'theme', value: o.value });
    input.checked = pref === o.value;
    input.addEventListener('change', () => {
      if (input.checked) setThemePref(o.value);
    });
    group.append(h('label', { class: 'segment' }, input, icon('check'), h('span', {}, o.label)));
  }
  return group;
}

export function createSettingsView(db: GpxDb): View {
  const categories = createCategoriesPanel(db);
  const backup = createBackupPanel(db);
  const el = h('section', { class: 'view scroll', hidden: '' });

  function render(): void {
    const mode = getMapMode();
    const online = h('input', { type: 'radio', name: 'mapmode', value: 'online' });
    const offline = h('input', { type: 'radio', name: 'mapmode', value: 'offline' });
    online.checked = mode === 'online';
    offline.checked = mode === 'offline';
    for (const r of [online, offline]) {
      r.addEventListener('change', () => {
        if (r.checked) setMapMode(r.value === 'offline' ? 'offline' : 'online');
      });
    }
    el.replaceChildren(
      h('div', { class: 'page' },
        section('Darstellung', 'Hell, dunkel oder wie das Gerät eingestellt ist. Der Schalter oben rechts wechselt schnell zwischen Hell und Dunkel.', themeSegments()),
        section(
          'Karte',
          null,
          h('div', { class: 'options' },
            modeOption(online, 'Online-Karte', `Kartenhintergrund von ${ONLINE_OSM.label}. Braucht eine Internetverbindung.`),
            modeOption(offline, 'Offline-Karte', 'Grobe Weltkarte aus gespeicherten Ländergrenzen, ohne Straßen und Orte. Funktioniert ohne Internet.'),
          ),
          h('p', { class: 'muted small' }, 'Deine Touren, Tracks und Notizen werden immer lokal auf dem Gerät gespeichert und auch ohne Internet angezeigt; nur der detaillierte Kartenhintergrund (Online-Karte) braucht Internet.'),
        ),
        section('Kategorien', 'Die Farbe einer Kategorie bestimmt die Darstellung der Touren auf der Karte. Änderungen werden automatisch gespeichert.', categories.el),
        section('Sicherung', 'Backup als ZIP-Datei mit allen Touren, Tracks, Notizen, Kategorien und Fotos. Damit lassen sich die Daten auf einem neuen Gerät oder nach einer Neuinstallation wiederherstellen. Das Backup ist nicht verschlüsselt und enthält deine Aufenthaltsorte – bitte sicher aufbewahren.', backup.el),
        section('Datenschutz', 'Alle Daten bleiben auf diesem Gerät. Es gibt kein Konto, keine Cloud und keine Analyse-Dienste.'),
        section('Über die App', PHASE_LABEL, h('p', { class: 'muted small app-version' }, buildInfoText())),
      ),
    );
  }
  render();
  window.addEventListener('themechange', () => {
    if (!el.hidden) render();
  });

  return {
    el,
    async onShow() {
      render();
      await categories.refresh();
      await backup.refresh();
    },
  };
}
