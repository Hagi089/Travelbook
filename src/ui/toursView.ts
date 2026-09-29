import {
  assignCountries,
  buildLocation,
  createManualTour,
  deleteTour,
  exportGpx,
  getTour,
  getTrackPoints,
  listCategories,
  listTours,
  LATEST_TOUR_COUNT,
  localDateString,
  parseDecimal,
  queryTours,
  setTourCountry,
  tourCountryCodes,
  tourYears,
  updateTourDetails,
  type Category,
  type GpxDb,
  type Tour,
} from '../db-api';
import { countryName, loadCountryIndex, sortedCountryCodes } from '../geo';
import type { Chrome } from './chrome';
import { h, type View } from './dom';
import { downloadText } from './download';
import { createPhotosSection } from './photosSection';
import { formatDate, formatDistance, formatDuration, formatElevation, formatSpeed } from './format';
import { kpi } from './kpi';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface ToursView extends View {
  /** Öffnet die Details einer Tour. `back` wird beim Verlassen der Details aufgerufen (z. B. Rückkehr zur Karte); ohne `back` geht es zurück zur Liste. */
  openTour(id: string, back?: () => void): Promise<void>;
  /** Öffnet das Formular „Neue Tour“ (manuell anlegen). */
  newTour(): Promise<void>;
}

/** Datenliste mit Kategorienfilter, Detailansicht, manuellem Anlegen und Bearbeiten (Name, Kategorie, Datum, Notizen). */
export function createToursView(db: GpxDb, chrome: Chrome): ToursView {
  const filter = h('select', { 'aria-label': 'Kategorie filtern' });
  const period = h('select', { 'aria-label': 'Zeitraum filtern' });
  const search = h('input', { type: 'text', placeholder: 'Suchen in Name und Notizen', 'aria-label': 'Touren suchen', autocomplete: 'off', enterkeyhint: 'search' });
  const countryFilter = h('select', { 'aria-label': 'Land filtern' });
  const countryBar = h('div', { class: 'toolbar', hidden: '' }, countryFilter);
  const summary = h('p', { class: 'muted small', hidden: '' });
  const list = h('div', { class: 'tour-list' });
  const listPane = h('div', { class: 'page with-fab' }, h('div', { class: 'toolbar' }, filter, period), h('div', { class: 'toolbar' }, search), countryBar, summary, list);
  const editorPane = h('div', { class: 'page', hidden: '' });
  const el = h('section', { class: 'view scroll', hidden: '' }, listPane, editorPane);

  let categories: Category[] = [];
  let filterId = '';
  /** '' = alle, 'latest' = letzte Touren, sonst ein Jahr ("YYYY"). */
  let periodId = '';
  /** '' = alle Länder, sonst ein Ländercode. */
  let countryId = '';
  /** Touren der gewählten Kategorie (neueste zuerst); Suche und Zeitraum wirken darauf im Speicher. */
  let loaded: Tour[] = [];
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
    chrome.title('Daten');
    chrome.back(null);
    chrome.fab(true);
    editorPane.hidden = true;
    editorPane.replaceChildren();
    listPane.hidden = false;
  }

  /** Zeigt eine Unterseite (Details/Formular) mit Titel und Zurück-Aktion in der App-Leiste. */
  function showPane(node: HTMLElement, title: string, back: () => void): void {
    chrome.title(title);
    chrome.back(back);
    chrome.fab(false);
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
    // Land: „Automatisch“ = aus dem Startpunkt; nur beim Bearbeiten (neue manuelle Touren werden automatisch zugeordnet).
    const initialCountry = tour?.countryManual ? (tour.countryCode ?? 'none') : 'auto';
    const country = h('select', {});
    const fillCountryOptions = (codes: string[]): void => {
      const current = country.value || initialCountry;
      country.replaceChildren(
        h('option', { value: 'auto' }, 'Automatisch (aus dem Startpunkt)'),
        h('option', { value: 'none' }, 'Kein Land'),
        ...codes.map((c) => h('option', { value: c }, countryName(c))),
      );
      country.value = current;
    };
    fillCountryOptions(initialCountry !== 'auto' && initialCountry !== 'none' ? [initialCountry] : []);
    if (tour) {
      void loadCountryIndex()
        .then((index) => fillCountryOptions(sortedCountryCodes(index)))
        .catch(() => undefined); // Ländergrenzen nicht ladbar: Auswahl bleibt auf Automatisch/Kein Land/aktuelles Land beschränkt
    }
    const notes = h('textarea', { rows: '10', placeholder: 'Notizen' });
    notes.value = tour?.notes ?? '';
    const distance = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.distanceM > 0 ? String(Number((tour.distanceM / 1000).toFixed(3))).replace('.', ',') : '' });
    const duration = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.durationSec > 0 ? String(Math.round(tour.durationSec / 60)) : '' });
    const lat = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 48,137', value: tour?.startPoint ? String(tour.startPoint.lat).replace('.', ',') : '' });
    const lon = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 11,575', value: tour?.startPoint ? String(tour.startPoint.lon).replace('.', ',') : '' });
    const save = h('button', { type: 'button', class: 'primary' }, 'Speichern');
    const back = h('button', { type: 'button' }, 'Abbrechen');
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
        if (tour && country.value !== initialCountry) {
          await setTourCountry(db, tour.id, country.value === 'auto' ? { kind: 'auto' } : country.value === 'none' ? { kind: 'none' } : { kind: 'code', code: country.value });
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
      tour && !isManual
        ? h('div', { class: 'muted' }, `${formatDistance(tour.distanceM)} · ↑ ${formatElevation(tour.ascentM)} · ↓ ${formatElevation(tour.descentM)} · ${formatDuration(tour.durationSec)} (aus dem Track berechnet, nicht änderbar)`)
        : null,
      h('label', {}, 'Name', name),
      h('label', {}, 'Kategorie', category),
      h('label', {}, 'Datum', date),
      tour ? h('label', {}, 'Land', country) : null,
      tour ? h('div', { class: 'muted small' }, 'Automatisch wird das Land aus dem Startpunkt bestimmt (Grenzen vereinfacht, an Küsten und Grenzen ungenau). Hier lässt es sich korrigieren.') : null,
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
    const edit = h('button', { type: 'button', class: 'primary' }, 'Bearbeiten');
    const actions = h('div', { class: 'row actions' }, edit);
    const msg = h('div', { class: 'status error', role: 'status' });

    edit.addEventListener('click', () => showPane(editor(tour), 'Tour bearbeiten', () => void showDetail(tour.id)));

    if (!isManual) {
      const exportBtn = h('button', { type: 'button' }, 'GPX exportieren');
      exportBtn.addEventListener('click', async () => {
        try {
          const points = await getTrackPoints(db, tour.id);
          const waypoints = await db.waypoints.where('tourId').equals(tour.id).toArray();
          await downloadText(`${tour.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'tour'}.gpx`, exportGpx({ name: tour.name, notes: tour.notes, points, waypoints }));
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
      h('h2', { class: 'headline' }, tour.name),
      h('div', { class: 'detail-meta' }, h('span', { class: 'dot', style: `background:${cat?.color ?? '#555555'}` }), h('span', { class: 'muted' }, `${cat?.name ?? 'Ohne Kategorie'} · ${formatDate(tour.date)}${tour.countryCode ? ` · ${countryName(tour.countryCode)}` : ''}${isManual ? ' · manuell angelegt' : ''}`)),
      kpis.length > 0 ? h('div', { class: 'kpis' }, ...kpis) : null,
      tour.startPoint && isManual ? h('div', { class: 'muted' }, `Ort: ${tour.startPoint.lat.toFixed(5)}, ${tour.startPoint.lon.toFixed(5)}`) : null,
      createPhotosSection(db, tour.id),
      h('h4', {}, 'Notizen'),
      tour.notes ? h('div', { class: 'notes' }, tour.notes) : h('p', { class: 'muted' }, 'Keine Notizen.'),
      actions,
      msg,
    );
  }

  async function showDetail(id: string): Promise<void> {
    await ensureCountries(); // z. B. Aufruf aus der Karte, bevor die Liste je geöffnet wurde
    const tour = await getTour(db, id);
    if (!tour) {
      leaveDetail();
      return;
    }
    if (categories.length === 0) categories = await listCategories(db);
    showPane(detail(tour), 'Tour', leaveDetail);
  }

  function item(tour: Tour): HTMLElement {
    const cat = categories.find((c) => c.id === tour.categoryId);
    const meta = [formatDate(tour.date), cat?.name ?? 'Ohne Kategorie', tour.countryCode ? countryName(tour.countryCode) : null, tour.distanceM > 0 ? formatDistance(tour.distanceM) : null, tour.source === 'manual' ? 'manuell' : null]
      .filter((x): x is string => x !== null)
      .join(' · ');
    const b = h('button', { type: 'button', class: 'tour-item' }, h('span', { class: 'dot', style: `background:${cat?.color ?? '#555555'}` }), h('span', { class: 'tour-text' }, h('strong', {}, tour.name), h('span', { class: 'muted small' }, meta)));
    b.addEventListener('click', () => void showDetail(tour.id));
    return b;
  }

  /** Wendet Suchtext und Zeitraum auf die geladenen Touren an und zeichnet die Liste. */
  function render(): void {
    const years = tourYears(loaded);
    if (periodId && periodId !== 'latest' && !years.includes(periodId)) periodId = '';
    period.replaceChildren(
      h('option', { value: '' }, 'Alle Zeiträume'),
      h('option', { value: 'latest' }, `Letzte ${LATEST_TOUR_COUNT} Touren`),
      ...years.map((y) => h('option', { value: y }, y)),
    );
    period.value = periodId;
    const codes = tourCountryCodes(loaded);
    if (countryId && !codes.includes(countryId)) countryId = '';
    countryFilter.replaceChildren(
      h('option', { value: '' }, 'Alle Länder'),
      ...codes.sort((a, b) => countryName(a).localeCompare(countryName(b), 'de')).map((c) => h('option', { value: c }, countryName(c))),
    );
    countryFilter.value = countryId;
    countryBar.hidden = codes.length === 0;
    const text = search.value.trim();
    const active = text !== '' || periodId !== '' || countryId !== '';
    const tours = queryTours(loaded, {
      text,
      country: countryId || undefined,
      year: periodId && periodId !== 'latest' ? periodId : undefined,
      latest: periodId === 'latest' ? LATEST_TOUR_COUNT : undefined,
    });
    summary.hidden = !(active && loaded.length > 0);
    summary.textContent = `${tours.length} von ${loaded.length} Touren`;
    if (loaded.length === 0) {
      list.replaceChildren(h('p', { class: 'muted' }, 'Noch keine Touren. Tippe auf „Neue Tour“, um aufzuzeichnen, eine GPX-Datei zu importieren oder eine Tour manuell anzulegen.'));
    } else if (tours.length === 0) {
      list.replaceChildren(h('p', { class: 'muted' }, 'Keine passenden Touren gefunden.'));
    } else {
      list.replaceChildren(...tours.map(item));
    }
  }

  /** Ergänzt fehlende Länder. Ein Fehler (Grenzdaten nicht ladbar) blockiert die Ansicht nicht; der nächste Aufruf versucht es erneut. */
  async function ensureCountries(): Promise<void> {
    try {
      await assignCountries(db);
    } catch {
      /* Land bleibt vorerst leer */
    }
  }

  async function refresh(): Promise<void> {
    await ensureCountries();
    categories = await listCategories(db);
    if (filterId && !categories.some((c) => c.id === filterId)) filterId = '';
    filter.replaceChildren(h('option', { value: '' }, 'Alle Kategorien'), ...categories.map((c) => h('option', { value: c.id }, c.name)));
    filter.value = filterId;
    loaded = await listTours(db, filterId ? { categoryId: filterId } : {});
    render();
  }

  filter.addEventListener('change', () => {
    filterId = filter.value;
    void refresh();
  });
  period.addEventListener('change', () => {
    periodId = period.value;
    render();
  });
  countryFilter.addEventListener('change', () => {
    countryId = countryFilter.value;
    render();
  });
  search.addEventListener('input', render);

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
    async newTour() {
      if (categories.length === 0) categories = await listCategories(db);
      showPane(editor(null), 'Neue Tour', showList);
    },
  };
}
