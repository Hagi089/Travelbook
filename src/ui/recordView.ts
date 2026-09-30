import { getTrackPoints, listCategories, type GpxDb } from '../db-api';
import { computeStats } from '../gpx/stats';
import { finishRecording, ingestPending, recoverRecordings, startRecording } from '../tracking/recorder';
import { TRACKING_PROFILES, type TrackingPlugin, type TrackingProfile, type TrackingStatus } from '../tracking/types';
import { h, type View } from './dom';
import { formatDistance, formatDuration } from './format';

/** Abstand, in dem die Oberfläche Punkte aus dem Plugin in die Datenbank übernimmt, solange sie sichtbar ist. */
const SYNC_INTERVAL_MS = 10_000;

export interface RecordHooks {
  onTourSaved(): void;
  /** Nach Start, Pause, Fortsetzen und Beenden (für das Banner „Aufnahme läuft“ in der App). */
  onStateChange(): void;
}

export function createRecordView(db: GpxDb, plugin: TrackingPlugin, hooks: RecordHooks): View & { setMessage(text: string): void } {
  const el = h('section', { class: 'view scroll', hidden: '' });
  let status: TrackingStatus | null = null;
  let message = '';
  let busy = false;
  let clock: ReturnType<typeof setInterval> | null = null;
  let sync: ReturnType<typeof setInterval> | null = null;
  let elapsedEl: HTMLElement | null = null;
  /** Bisher zurückgelegte Strecke der laufenden Aufnahme (aus den übernommenen Punkten, aktualisiert mit jedem Abgleich). */
  let liveDistanceM = 0;

  function stopTimers(): void {
    if (clock) clearInterval(clock);
    if (sync) clearInterval(sync);
    clock = sync = null;
  }

  function tickElapsed(): void {
    if (elapsedEl && status?.startedAt) elapsedEl.textContent = formatDuration(Math.max(0, Math.round((Date.now() - status.startedAt) / 1000)));
  }

  async function refresh(): Promise<void> {
    status = await plugin.getStatus();
    if (status.state !== 'idle' && status.recordingId) {
      await ingestPending(db, plugin, status.recordingId);
      status = await plugin.getStatus();
      liveDistanceM = computeStats(await getTrackPoints(db, status.recordingId ?? '')).distanceM;
    } else {
      liveDistanceM = 0;
    }
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    message = '';
    render();
    try {
      await action();
    } catch (e) {
      message = `Fehler: ${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      await refresh();
    } catch (e) {
      message ||= `Status nicht lesbar: ${e instanceof Error ? e.message : String(e)}`;
    }
    busy = false;
    render();
    hooks.onStateChange();
  }

  function idleForm(): HTMLElement {
    const name = h('input', { type: 'text', placeholder: 'Name (leer = automatisch)' });
    const category = h('select', {});
    const profile = h('select', {}, ...TRACKING_PROFILES.map((p) => h('option', { value: p.id }, p.label)));
    profile.value = 'normal';
    const hint = h('div', { class: 'muted small' });
    const showHint = () => {
      hint.textContent = TRACKING_PROFILES.find((p) => p.id === profile.value)?.hint ?? '';
    };
    profile.addEventListener('change', showHint);
    showHint();
    const start = h('button', { type: 'button', class: 'primary' }, 'Aufnahme starten');
    void listCategories(db).then((cats) => {
      category.replaceChildren(...cats.map((c) => h('option', { value: c.id }, c.name)));
    });
    start.addEventListener('click', () =>
      run(async () => {
        if (!category.value) throw new Error('Bitte zuerst eine Kategorie anlegen.');
        const perm = await plugin.requestPermissions();
        if (perm.location === 'denied') throw new Error('Ohne Standortberechtigung ist keine Aufnahme möglich. Bitte in den Einstellungen der App erlauben.');
        await startRecording(db, plugin, { name: name.value, categoryId: category.value, profile: profile.value as TrackingProfile });
      }),
    );
    return h('div', { class: 'card' }, h('label', {}, 'Name', name), h('label', {}, 'Kategorie', category), h('label', {}, 'Genauigkeit', profile), hint, start);
  }

  function activePanel(s: TrackingStatus): HTMLElement {
    elapsedEl = h('strong', {}, '');
    const tourId = s.recordingId ?? '';
    const pause = h('button', { type: 'button' }, s.state === 'paused' ? 'Fortsetzen' : 'Pause');
    pause.addEventListener('click', () => run(async () => void (s.state === 'paused' ? await plugin.resume() : await plugin.pause())));
    const stop = h('button', { type: 'button', class: 'primary' }, 'Beenden und speichern');
    stop.addEventListener('click', () =>
      run(async () => {
        const tour = await finishRecording(db, plugin, tourId);
        message = tour ? `Gespeichert: ${tour.name} · ${formatDistance(tour.distanceM)} · ${formatDuration(tour.durationSec)}` : 'Keine Punkte aufgezeichnet – die Aufnahme wurde verworfen.';
        if (tour) hooks.onTourSaved();
      }),
    );
    return h(
      'div',
      { class: 'card' },
      s.error ? h('div', { class: 'notice notice-warn' }, s.error) : null,
      h('div', {}, s.state === 'paused' ? 'Pausiert' : 'Aufnahme läuft'),
      h('div', { class: 'muted' }, 'Zeit seit Start: ', elapsedEl),
      h('div', { class: 'muted' }, `Strecke: ${formatDistance(liveDistanceM)}`),
      h('div', { class: 'muted' }, `${s.pointCount} Punkte aufgezeichnet`),
      h('div', { class: 'actions' }, pause, stop),
    );
  }

  function render(): void {
    stopTimers();
    elapsedEl = null;
    const s = status;
    const active = s !== null && s.state !== 'idle';
    el.replaceChildren(
      h(
        'div',
        { class: 'page' },
        s && !s.backgroundCapable
          ? h('div', { class: 'notice notice-warn' }, 'Im Browser läuft die Aufnahme nur, solange diese Seite sichtbar ist und das Display an bleibt. Für Aufnahmen bei gesperrtem Handy bitte die Android-App verwenden.')
          : null,
        active ? activePanel(s) : idleForm(),
        message ? h('div', { class: 'status', role: 'status' }, message) : null,
        s?.backgroundCapable
          ? h('p', { class: 'muted small' }, 'Tipp: Schließe die App nicht per Wischen aus der Übersicht und nimm sie in den Akku-Einstellungen von der Optimierung aus, damit die Aufnahme zuverlässig weiterläuft.')
          : null,
      ),
    );
    if (active && !busy) {
      tickElapsed();
      clock = setInterval(tickElapsed, 1000);
      sync = setInterval(() => void refresh().then(render).catch(() => undefined), SYNC_INTERVAL_MS);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status && status.state !== 'idle') void refresh().then(render).catch(() => undefined);
  });

  return {
    el,
    setMessage(text: string) {
      message = text;
      render();
    },
    async onShow() {
      try {
        await refresh();
      } catch (e) {
        message = `Status nicht lesbar: ${e instanceof Error ? e.message : String(e)}`;
      }
      render();
    },
  };
}

/** Beim App-Start: nimmt unterbrochene Aufnahmen auf und schließt sie ab (siehe recoverRecordings). Gibt einen Hinweistext oder null zurück. */
export async function recoverAtStartup(db: GpxDb, plugin: TrackingPlugin): Promise<string | null> {
  const r = await recoverRecordings(db, plugin);
  const parts: string[] = [];
  if (r.finalized.length > 0) parts.push(`${r.finalized.length} unterbrochene Aufnahme(n) wurden gerettet und gespeichert.`);
  if (r.discarded > 0) parts.push(`${r.discarded} leere Aufnahme(n) verworfen.`);
  return parts.length > 0 ? parts.join(' ') : null;
}
