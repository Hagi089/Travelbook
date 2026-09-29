import type { GpxDb } from '../db-api';
import { h, type View } from './dom';
import { createDashboardView } from './dashboardView';
import { createImportView } from './importView';
import { createMapView } from './mapView';
import { createSettingsView } from './settingsView';
import { createToursView } from './toursView';

export function startApp(root: HTMLElement, db: GpxDb): void {
  const toursView = createToursView(db);
  /** Klick auf eine Tour in der Karte: Details im Bereich „Daten“ öffnen; „Zurück“ führt wieder zur Karte. */
  async function openTourFromMap(id: string): Promise<void> {
    await show('tours');
    await toursView.openTour(id, () => void show('map'));
  }
  const views: Record<string, View> = {
    map: createMapView(db, (id) => void openTourFromMap(id)),
    tours: toursView,
    dashboard: createDashboardView(db),
    import: createImportView(db, () => undefined),
    settings: createSettingsView(db),
  };
  const labels: Record<string, string> = { map: 'Karte', tours: 'Daten', dashboard: 'Dashboard', import: 'Import', settings: 'Einstellungen' };
  const nav = h('nav', { class: 'nav' });
  const buttons: Record<string, HTMLButtonElement> = {};

  async function show(key: string): Promise<void> {
    for (const [k, v] of Object.entries(views)) {
      v.el.hidden = k !== key;
      buttons[k]!.classList.toggle('active', k === key);
    }
    await views[key]!.onShow();
  }

  for (const key of Object.keys(views)) {
    const b = h('button', { type: 'button' }, labels[key]!);
    b.addEventListener('click', () => void show(key));
    buttons[key] = b;
    nav.append(b);
  }
  root.replaceChildren(h('main', { class: 'main' }, ...Object.values(views).map((v) => v.el)), nav);
  void show('map');
}
