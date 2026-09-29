import { listCategories, listTours, type Category, type GpxDb, type Tour } from '../db-api';
import { activityTotals, DASHBOARD_CATEGORY_IDS, placeStats } from '../dashboard/stats';
import { h, type View } from './dom';
import { formatDate, formatDuration, formatInt, formatKm } from './format';
import { kpi } from './kpi';

function missing(title: string): HTMLElement {
  return h('section', { class: 'settings-section' }, h('h3', {}, title), h('p', { class: 'muted' }, 'Die zugehörige Standardkategorie existiert nicht mehr. Lege unter „Einstellungen“ eine Kategorie mit diesem Namen an und ordne Touren zu, um dieses Dashboard zu nutzen.'));
}

/** Dashboards: Fahrradtouren, Wandern, Wohnmobil (Stellplätze). Aggregation in `src/dashboard/stats.ts`. */
export function createDashboardView(db: GpxDb): View {
  const content = h('div', { class: 'page' });
  const el = h('section', { class: 'view scroll', hidden: '' }, content);

  function activity(title: string, cat: Category | undefined, tours: Tour[], distanceLabel: string, timeLabel: string): HTMLElement {
    if (!cat) return missing(title);
    const t = activityTotals(tours);
    return h(
      'section',
      { class: 'settings-section' },
      h('h3', {}, title),
      h('div', { class: 'kpis' }, kpi('Anzahl Touren', formatInt(t.count)), kpi(distanceLabel, formatKm(t.distanceM)), kpi(timeLabel, formatDuration(t.durationSec)), kpi('Höhenmeter', `${formatInt(t.ascentM)} m`)),
    );
  }

  function camper(title: string, cat: Category | undefined, tours: Tour[]): HTMLElement {
    if (!cat) return missing(title);
    const s = placeStats(tours, 5);
    return h(
      'section',
      { class: 'settings-section' },
      h('h3', {}, title),
      h('div', { class: 'kpis' }, kpi('Anzahl Stellplätze', formatInt(s.places)), kpi('Besuche gesamt', formatInt(tours.length))),
      h('h4', {}, 'Top 5 besuchte Stellplätze'),
      s.top.length === 0
        ? h('p', { class: 'muted' }, `Noch keine Stellplätze. Lege unter „Daten“ eine neue Tour in der Kategorie „${cat.name}“ an. Gleicher Name bedeutet gleicher Stellplatz.`)
        : h(
            'ol',
            { class: 'ranking' },
            ...s.top.map((p) => h('li', {}, h('span', { class: 'rank-name' }, p.name), h('span', { class: 'muted small' }, `${p.visits === 1 ? '1 Besuch' : `${p.visits} Besuche`} · zuletzt ${formatDate(p.lastDate)}`))),
          ),
    );
  }

  async function refresh(): Promise<void> {
    const categories = await listCategories(db);
    const find = (id: string) => categories.find((c) => c.id === id);
    const load = (id: string) => listTours(db, { categoryId: id });
    const [bike, hike, van] = await Promise.all([load(DASHBOARD_CATEGORY_IDS.bike), load(DASHBOARD_CATEGORY_IDS.hike), load(DASHBOARD_CATEGORY_IDS.camper)]);
    content.replaceChildren(
      h('h2', {}, 'Dashboard'),
      activity('Fahrradtouren', find(DASHBOARD_CATEGORY_IDS.bike), bike, 'Gefahrene km', 'Fahrzeit'),
      activity('Wandern', find(DASHBOARD_CATEGORY_IDS.hike), hike, 'Zurückgelegte km', 'Wanderzeit'),
      camper('Wohnmobil', find(DASHBOARD_CATEGORY_IDS.camper), van),
      h('p', { class: 'muted small' }, 'Grundlage sind die Standardkategorien Fahrradfahren, Wandern und Womo-Stellplatz. Zeiten sind Summen der Gesamtdauern; Touren ohne Zeitstempel zählen dabei 0.'),
    );
  }

  return { el, onShow: refresh };
}
