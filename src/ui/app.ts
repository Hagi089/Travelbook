import type { GpxDb } from '../db-api';
import { h, type View } from './dom';
import { createImportView } from './importView';
import { createMapView } from './mapView';
import { createSettingsView } from './settingsView';

export function startApp(root: HTMLElement, db: GpxDb): void {
  const views: Record<string, View> = {
    map: createMapView(db),
    import: createImportView(db, () => undefined),
    settings: createSettingsView(),
  };
  const labels: Record<string, string> = { map: 'Karte', import: 'Import', settings: 'Einstellungen' };
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
