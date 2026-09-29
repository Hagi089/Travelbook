import {
  buildLocation,
  createManualTour,
  deleteTour,
  exportGpx,
  getTour,
  getTrackPoints,
  listCategories,
  listTours,
  localDateString,
  parseDecimal,
  updateTourDetails,
  type Category,
  type GpxDb,
  type Tour,
} from '../db-api';
import { h, type View } from './dom';
import { downloadText } from './download';
import { formatDate, formatDistance, formatDuration, formatElevation, formatSpeed } from './format';
import { kpi } from './kpi';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface ToursView extends View {
  /** Öffnet die Details einer Tour. `back` wird beim Verlassen der Details aufgerufen (z. B. Rückkehr zur Karte); ohne `back` geht es zurück zur Liste. */
  openTour(id: string, back?: () => void): Promise<void>;
}

/** Datenliste mit Kategorienfilter, Detailansicht, manuellem Anlegen und Bearbeiten (Name, Kategorie, Datum, Notizen). */
export function createToursView(db: GpxDb): ToursView {
  const filter = h('select', { 'aria-label': 'Kategorie filtern' });
  const newBtn = h('button', { type: 'button', class: 'primary' }, '+ Neue Tour');
  const list = h('div', { class: 'tour-list' });
  const listPane = h('div', { class: 'page' }, h('h2', {}, 'Daten'), h('div', { class: 'toolbar' }, filter, newBtn), list);
  const editorPane = h('div', { class: 'page', hidden: '' });
  const el = h('section', { class: 'view scroll', hidden: '' }, listPane, editorPane);

  let categories: Category[] = [];
  let filterId = '';
  /** Gesetzt, wenn die Details von außen (Karte) geöffnet wurden: „Zurück“ führt dann dorthin statt zur Liste. */
  let returnTo: (() => void) | null = null;

  /** Verlässt die Detailansicht: zurück zum Aufrufer (Karte) oder zur Liste. */
  function leaveDetail(): void {
    const back = returnTo;
    returnTo = null;
    if (back) back();
    else showList();
  }

  function showList(): void {
    editorPane.hidden = true;
    editorPane.replaceChildren();
    listPane.hidden = false;
  }

  function showPane(node: HTMLElement): void {
    listPane.hidden = true;
    editorPane.replaceChildren(node);
    editorPane.hidden = false;
    el.scrollTop = 0;
  }

  /** Formular zum Anlegen (`tour === null`) oder Bearbeiten einer Tour. */
  function editor(tour: Tour | null): HTMLElement {
    const isManual = tour === null || tour.source === 'manual';
    const name = h('input', { type: 'text', value: tour?.name ?? '' });
    const category = h('select', {}, ...categories.map((c) => h('option', { value: c.id }, c.name)));
    if (tour && categories.some((c) => c.id === tour.categoryId)) category.value = tour.categoryId;
    const date = h('input', { type: 'date', value: tour?.date ?? localDateString(Date.now()) });
    const notes = h('textarea', { rows: '10', placeholder: 'Notizen' });
    notes.value = tour?.notes ?? '';
    const distance = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.distanceM > 0 ? String(Number((tour.distanceM / 1000).toFixed(3))).replace('.', ',') : '' });
    const duration = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.durationSec > 0 ? String(Math.round(tour.durationSec / 60)) : '' });
    const lat = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 48,137', value: tour?.startPoint ? String(tour.startPoint.lat).replace('.', ',') : '' });
    const lon = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 11,575', value: tour?.startPoint ? String(tour.startPoint.lon).replace('.', ',') : '' });
    const save = h('button', { type: 'button', class: 'primary' }, 'Speichern');
    const back = h('button', { type: 'button' }, 'Zurück');
    const msg = h('div', { class: 'status error', role: 'status' });
    const buttons = h('div', { class: 'row actions' }, save, back);

    if (categories.length === 0) {
      save.disabled = true;
      msg.textContent = 'Es gibt keine Kategorie. Lege zuerst unter „Einstellungen“ eine Kategorie an.';
    }

    back.addEventListener('click', () => (tour ? void showDetail(tour.id) : showList()));

    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        if (isManual) {
          const km = parseDecimal(distance.value, 'Distanz');
          const min = parseDecimal(duration.value, 'Dauer');
          const location = buildLocation(parseDecimal(lat.value, 'Breite'), parseDecimal(lon.value, 'Länge'));
          const fields = { distanceM: km === null ? null : km * 1000, durationSec: min === null ? null : min * 60, location };
          if (tour) {
            await updateTourDetails(db, tour.id, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value, ...fields });
          } else {
            await createManualTour(db, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value, ...fields });
          }
        } else if (tour) {
          await updateTourDetails(db, tour.id, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value });
        }
        await refresh();
        if (tour) await showDetail(tour.id);
        else showList();
      } catch (e) {
        msg.textContent = errorText(e);
        save.disabled = false;
      }
    });

    return h(
      'div',
      {},
      h('h2', {}, tour ? 'Tour bearbeiten' : 'Neue Tour'),
      tour && !isManual
        ? h('div', { class: 'muted' }, `${formatDistance(tour.distanceM)} · ↑ ${formatElevation(tour.ascentM)} · ↓ ${formatElevation(tour.descentM)} · ${formatDuration(tour.durationSec)} (aus dem Track berechnet, nicht änderbar)`)
        : null,
      h('label', {}, 'Name', name),
      h('label', {}, 'Kategorie', category),
      h('label', {}, 'Datum', date),
      isManual ? h('div', { class: 'two' }, h('label', {}, 'Distanz in km', distance), h('label', {}, 'Dauer in Minuten', duration)) : null,
      isManual ? h('div', { class: 'muted' }, 'Ort (optional): Ohne Ort erscheint die Tour nur in der Liste, nicht auf der Karte. Breite: Norden positiv, Länge: Osten positiv.') : null,
      isManual ? h('div', { class: 'two' }, h('label', {}, 'Breite (Grad)', lat), h('label', {}, 'Länge (Grad)', lon)) : null,
      h('label', {}, 'Notizen', notes),
      buttons,
      msg,
    );
  }

  /** Nur lesende Detailansicht einer Tour mit Kennzahlen, Notizen und Aktionen. */
  function detail(tour: Tour): HTMLElement {
    const cat = categories.find((c) => c.id === tour.categoryId);
    const isManual = tour.source === 'manual';
    const back = h('button', { type: 'button', class: 'ghost' }, '← Zurück');
    const edit = h('button', { type: 'button', class: 'primary' }, 'Bearbeiten');
    const actions = h('div', { class: 'row actions' }, edit);
    const msg = h('div', { class: 'status error', role: 'status' });

    back.addEventListener('click', leaveDetail);
    edit.addEventListener('click', () => showPane(editor(tour)));

    if (!isManual) {
      const exportBtn = h('button', { type: 'button' }, 'GPX exportieren');
      exportBtn.addEventListener('click', async () => {
        try {
          const points = await getTrackPoints(db, tour.id);
          const waypoints = await db.waypoints.where('tourId').equals(tour.id).toArray();
          downloadText(`${tour.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'tour'}.gpx`, exportGpx({ name: tour.name, notes: tour.notes, points, waypoints }));
        } catch (e) {
          msg.textContent = errorText(e);
        }
      });
      actions.append(exportBtn);
    }
    const del = h('button', { type: 'button', class: 'danger ghost' }, 'Löschen');
    del.addEventListener('click', async () => {
      if (!window.confirm(`Tour "${tour.name}" wirklich löschen?`)) return;
      try {
        await deleteTour(db, tour.id);
        await refresh();
        leaveDetail();
      } catch (e) {
        msg.textContent = errorText(e);
      }
    });
    actions.append(del);

    const kpis: HTMLElement[] = [];
    if (!isManual) {
      kpis.push(kpi('Distanz', formatDistance(tour.distanceM)), kpi('Dauer', formatDuration(tour.durationSec)), kpi('Aufstieg', formatElevation(tour.ascentM)), kpi('Abstieg', formatElevation(tour.descentM)), kpi('Ø Geschwindigkeit', formatSpeed(tour.avgSpeedMs)), kpi('Höchstgeschwindigkeit', formatSpeed(tour.maxSpeedMs)));
    } else {
      if (tour.distanceM > 0) kpis.push(kpi('Distanz', formatDistance(tour.distanceM)));
      if (tour.durationSec > 0) kpis.push(kpi('Dauer', formatDuration(tour.durationSec)));
    }

    return h(
      'div',
      {},
      back,
      h('h2', {}, tour.name),
      h('div', { class: 'detail-meta' }, h('span', { class: 'dot', style: `background:${cat?.color ?? '#555555'}` }), h('span', { class: 'muted' }, `${cat?.name ?? 'Ohne Kategorie'} · ${formatDate(tour.date)}${isManual ? ' · manuell angelegt' : ''}`)),
      kpis.length > 0 ? h('div', { class: 'kpis' }, ...kpis) : null,
      tour.startPoint && isManual ? h('div', { class: 'muted' }, `Ort: ${tour.startPoint.lat.toFixed(5)}, ${tour.startPoint.lon.toFixed(5)}`) : null,
      h('h4', {}, 'Notizen'),
      tour.notes ? h('div', { class: 'notes' }, tour.notes) : h('p', { class: 'muted' }, 'Keine Notizen.'),
      actions,
      msg,
    );
  }

  async function showDetail(id: string): Promise<void> {
    const tour = await getTour(db, id);
    if (!tour) {
      leaveDetail();
      return;
    }
    if (categories.length === 0) categories = await listCategories(db);
    showPane(detail(tour));
  }

  function item(tour: Tour): HTMLElement {
    const cat = categories.find((c) => c.id === tour.categoryId);
    const meta = [formatDate(tour.date), cat?.name ?? 'Ohne Kategorie', tour.distanceM > 0 ? formatDistance(tour.distanceM) : null, tour.source === 'manual' ? 'manuell' : null]
      .filter((x): x is string => x !== null)
      .join(' · ');
    const b = h('button', { type: 'button', class: 'tour-item' }, h('span', { class: 'dot', style: `background:${cat?.color ?? '#555555'}` }), h('span', { class: 'tour-text' }, h('strong', {}, tour.name), h('span', { class: 'muted small' }, meta)));
    b.addEventListener('click', () => void showDetail(tour.id));
    return b;
  }

  async function refresh(): Promise<void> {
    categories = await listCategories(db);
    if (filterId && !categories.some((c) => c.id === filterId)) filterId = '';
    filter.replaceChildren(h('option', { value: '' }, 'Alle Kategorien'), ...categories.map((c) => h('option', { value: c.id }, c.name)));
    filter.value = filterId;
    const tours = await listTours(db, filterId ? { categoryId: filterId } : {});
    list.replaceChildren(...(tours.length > 0 ? tours.map(item) : [h('p', { class: 'muted' }, 'Noch keine Touren. Importiere eine GPX-Datei oder lege oben eine Tour manuell an.')]));
  }

  filter.addEventListener('change', () => {
    filterId = filter.value;
    void refresh();
  });

  newBtn.addEventListener('click', () => showPane(editor(null)));

  return {
    el,
    async onShow() {
      returnTo = null;
      showList();
      await refresh();
    },
    async openTour(id, back) {
      returnTo = back ?? null;
      await showDetail(id);
    },
  };
}
