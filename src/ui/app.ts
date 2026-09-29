import type { GpxDb } from '../db-api';
import { getTrackingPlugin } from '../tracking/plugin';
import type { TrackingStatus } from '../tracking/types';
import { createChrome } from './chrome';
import { createDashboardView } from './dashboardView';
import { h, type View } from './dom';
import { formatDuration } from './format';
import { icon, type IconName } from './icons';
import { createImportView } from './importView';
import { createMapView } from './mapView';
import { createRecordView, recoverAtStartup } from './recordView';
import { createSettingsView } from './settingsView';
import { openSheet, showSnackbar } from './sheet';
import { createToursView } from './toursView';

/** Ziele der Navigationsleiste (Material 3: 3–5 Ziele). Aufnahme und Import sind Unterseiten von „Daten“. */
const DESTINATIONS: ReadonlyArray<{ key: string; label: string; icon: IconName }> = [
  { key: 'map', label: 'Karte', icon: 'map' },
  { key: 'tours', label: 'Daten', icon: 'list' },
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'settings', label: 'Einstellungen', icon: 'settings' },
];

/** Unterseiten (ohne eigenes Ziel in der Navigationsleiste): Titel und zugehöriges Hauptziel. */
const SUBPAGES: Record<string, { title: string; parent: string }> = {
  record: { title: 'Aufnahme', parent: 'tours' },
  import: { title: 'GPX importieren', parent: 'tours' },
};

/** Wie oft der Aufnahmestatus für das Banner abgefragt wird, solange die App sichtbar ist. */
const BANNER_POLL_MS = 20_000;

export function startApp(root: HTMLElement, db: GpxDb): void {
  const tracking = getTrackingPlugin();
  let recStatus: TrackingStatus | null = null;
  let currentKey = 'map';

  const { chrome, topBar, fabButton } = createChrome(() => openNewTourSheet());

  const toursView = createToursView(db, chrome);
  const recordView = createRecordView(db, tracking, { onTourSaved: () => undefined, onStateChange: () => void refreshBanner() });
  const views: Record<string, View> = {
    map: createMapView(db, (id) => void openTourFromMap(id)),
    tours: toursView,
    dashboard: createDashboardView(db),
    settings: createSettingsView(db),
    record: recordView,
    import: createImportView(db, () => undefined),
  };

  /** Klick auf eine Tour in der Karte: Details im Bereich „Daten“ öffnen; „Zurück“ führt wieder zur Karte. */
  async function openTourFromMap(id: string): Promise<void> {
    await show('tours');
    await toursView.openTour(id, () => void show('map'));
  }

  // ---- Banner „Aufnahme läuft“ ----
  const bannerTime = h('span', { class: 'rec-time' });
  const bannerText = h('span', { class: 'rec-text' });
  const banner = h('button', { type: 'button', class: 'rec-banner', hidden: '' }, icon('record'), bannerText, bannerTime, icon('chevron'));
  banner.addEventListener('click', () => void show('record'));

  function renderBanner(): void {
    const active = recStatus !== null && recStatus.state !== 'idle';
    // Auf der Aufnahmeseite selbst wäre das Banner doppelt.
    banner.hidden = !active || currentKey === 'record';
    if (!active || !recStatus) return;
    bannerText.textContent = recStatus.state === 'paused' ? 'Aufnahme pausiert' : 'Aufnahme läuft';
    banner.classList.toggle('paused', recStatus.state === 'paused');
    tickBanner();
  }
  function tickBanner(): void {
    if (recStatus?.startedAt) bannerTime.textContent = formatDuration(Math.max(0, Math.round((Date.now() - recStatus.startedAt) / 1000)));
  }
  async function refreshBanner(): Promise<void> {
    try {
      recStatus = await tracking.getStatus();
    } catch {
      recStatus = null;
    }
    renderBanner();
  }
  setInterval(() => {
    if (document.visibilityState === 'visible') void refreshBanner();
  }, BANNER_POLL_MS);
  setInterval(() => {
    if (!banner.hidden) tickBanner();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshBanner();
  });

  // ---- „Neue Tour“ ----
  function openNewTourSheet(): void {
    const recording = recStatus !== null && recStatus.state !== 'idle';
    openSheet('Neue Tour', [
      recording
        ? { icon: 'record', label: 'Laufende Aufnahme öffnen', text: 'Es läuft bereits eine GPS-Aufnahme.', onSelect: () => void show('record') }
        : { icon: 'gps', label: 'Aufnahme starten', text: 'Route per GPS aufzeichnen, auch bei gesperrtem Display (Android-App).', onSelect: () => void show('record') },
      { icon: 'upload', label: 'GPX importieren', text: 'Eine Route aus einer GPX-Datei übernehmen.', onSelect: () => void show('import') },
      { icon: 'edit', label: 'Manuell anlegen', text: 'Tour ohne Track, z. B. einen Stellplatz oder eine Unterkunft.', onSelect: () => void toursView.newTour() },
    ]);
  }

  // ---- Navigation ----
  const nav = h('nav', { class: 'nav-bar', 'aria-label': 'Hauptnavigation' });
  const navButtons: Record<string, HTMLButtonElement> = {};
  for (const d of DESTINATIONS) {
    const b = h('button', { type: 'button', class: 'nav-item' }, h('span', { class: 'nav-indicator' }, icon(d.icon)), h('span', { class: 'nav-label' }, d.label));
    b.addEventListener('click', () => void show(d.key));
    navButtons[d.key] = b;
    nav.append(b);
  }

  async function show(key: string): Promise<void> {
    currentKey = key;
    const sub = SUBPAGES[key];
    const parent = sub?.parent ?? key;
    for (const [k, v] of Object.entries(views)) v.el.hidden = k !== key;
    for (const [k, b] of Object.entries(navButtons)) {
      const on = k === parent;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    chrome.title(sub?.title ?? DESTINATIONS.find((d) => d.key === key)?.label ?? '');
    chrome.back(sub ? () => void show(sub.parent) : null);
    chrome.fab(false); // die Ansicht selbst schaltet ihn bei Bedarf ein (Daten-Liste)
    renderBanner();
    await views[key]!.onShow();
    if (key === 'record') void refreshBanner();
  }

  root.replaceChildren(
    h('div', { class: 'app' }, topBar, banner, h('main', { class: 'main' }, ...Object.values(views).map((v) => v.el), fabButton), nav),
  );
  void refreshBanner();
  void show('map');
  // Crash-Recovery: unterbrochene Aufnahmen aufnehmen bzw. abschließen (docs/ARCHITECTURE.md, Android-GPS).
  void recoverAtStartup(db, tracking)
    .then((note) => {
      if (note) {
        recordView.setMessage(note);
        showSnackbar(note);
      }
      return refreshBanner();
    })
    .catch(() => undefined);
}
