import { applyBackup, applySettings, collectSettings, createBackup, getLastBackup, hasOpenRecording, OPEN_RECORDING_MESSAGE, readBackup, setLastBackup, type BackupData, type RestoreMode, type RestoreResult } from '../backup';
import type { GpxDb } from '../db-api';
import { confirmDialog } from './confirmDialog';
import { h } from './dom';
import { downloadBlob } from './download';

function num(n: number): string {
  return n.toLocaleString('de-DE');
}

function dateText(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function resultText(r: RestoreResult): string {
  if (r.mode === 'merge') {
    return `Zusammengeführt: ${num(r.toursAdded)} Touren ergänzt, ${num(r.toursSkipped)} waren schon vorhanden (unverändert), ${num(r.categoriesAdded)} neue Kategorien, ${num(r.photos)} Fotos.`;
  }
  return `Wiederhergestellt: ${num(r.toursAdded + r.toursOverwritten)} Touren aus dem Backup (${num(r.toursRemoved)} bisherige Touren entfernt), ${num(r.trackPoints)} Trackpunkte, ${num(r.photos)} Fotos.`;
}

/** Abschnitt „Sicherung“ in den Einstellungen: Backup als ZIP erstellen und wiederherstellen (Ersetzen oder Zusammenführen). */
export function createBackupPanel(db: GpxDb): { el: HTMLElement; refresh(): Promise<void> } {
  const el = h('div', { class: 'backup' });
  const status = h('p', { class: 'muted small backup-status' });
  const msg = h('p', { class: 'backup-msg', role: 'status' });
  const progress = h('progress', { class: 'backup-progress', max: '1', value: '0', hidden: '' });
  const create = h('button', { type: 'button', class: 'primary' }, 'Backup erstellen');
  const restore = h('button', { type: 'button', class: 'tonal' }, 'Backup wiederherstellen …');
  const fileInput = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed', hidden: '' });
  const restoreBox = h('div', { class: 'backup-restore', hidden: '' });
  let busy = false;
  let pending: BackupData | null = null;

  function setBusy(b: boolean): void {
    busy = b;
    create.disabled = b;
    restore.disabled = b;
  }
  function show(text: string, error = false): void {
    msg.textContent = text;
    msg.className = error ? 'backup-msg error' : 'backup-msg';
  }
  function setProgress(done: number, total: number, label: string): void {
    progress.hidden = false;
    progress.max = Math.max(1, total);
    progress.value = done;
    progress.title = label;
  }
  function endProgress(): void {
    progress.hidden = true;
  }

  async function refresh(): Promise<void> {
    const last = getLastBackup();
    let persisted = '';
    try {
      const p = await navigator.storage?.persisted?.();
      if (p === true) persisted = ' Der Browser schützt den Speicher dieser App vor automatischem Löschen.';
      else if (p === false) persisted = ' Der Browser garantiert den Speicher dieser App nicht – regelmäßige Backups sind wichtig.';
    } catch {
      /* nicht verfügbar */
    }
    status.textContent = (last ? `Letztes Backup: ${dateText(last)}.` : 'Noch kein Backup erstellt.') + persisted;
  }

  create.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    show('Backup wird erstellt …');
    try {
      if (await hasOpenRecording(db)) throw new Error(OPEN_RECORDING_MESSAGE);
      const result = await createBackup(db, collectSettings(), Date.now(), setProgress);
      const handedOver = await downloadBlob(result.fileName, result.blob);
      if (!handedOver) {
        // Teilen-Menü ohne Auswahl geschlossen: „Letztes Backup“ nicht aktualisieren, sonst entsteht falsche Sicherheit.
        show('Das Teilen-Menü wurde ohne Auswahl geschlossen – das Backup wurde vermutlich nirgends gespeichert. Bitte erneut „Backup erstellen“ wählen und ein Ziel (z. B. Drive oder „Dateien“) auswählen.', true);
        return;
      }
      setLastBackup(result.manifest.createdAt);
      const c = result.manifest.counts;
      show(`Backup erstellt (${sizeText(result.blob.size)}): ${num(c.tours)} Touren, ${num(c.photos)} Fotos, ${num(c.trackPoints)} Trackpunkte. Bitte die Datei an einem sicheren Ort ablegen (nicht nur auf diesem Gerät).`);
    } catch (e) {
      show(`Backup fehlgeschlagen: ${errorText(e)}`, true);
    } finally {
      endProgress();
      setBusy(false);
      await refresh();
    }
  });

  restore.addEventListener('click', () => {
    if (!busy) fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || busy) return;
    setBusy(true);
    restoreBox.hidden = true;
    pending = null;
    show('Backup wird geprüft …');
    try {
      if (await hasOpenRecording(db)) throw new Error(OPEN_RECORDING_MESSAGE);
      pending = await readBackup(file, setProgress);
      show('');
      renderRestoreBox(pending);
    } catch (e) {
      show(`Diese Datei kann nicht wiederhergestellt werden: ${errorText(e)}`, true);
    } finally {
      endProgress();
      setBusy(false);
    }
  });

  function renderRestoreBox(data: BackupData): void {
    const c = data.manifest.counts;
    const replace = h('input', { type: 'radio', name: 'restore-mode', value: 'replace' });
    const merge = h('input', { type: 'radio', name: 'restore-mode', value: 'merge' });
    merge.checked = true;
    const withSettings = h('input', { type: 'checkbox' });
    const hasSettings = Object.keys(data.manifest.settings).length > 0;
    withSettings.disabled = !hasSettings;
    const go = h('button', { type: 'button', class: 'primary' }, 'Wiederherstellen');
    const cancel = h('button', { type: 'button', class: 'ghost' }, 'Abbrechen');
    const option = (radio: HTMLInputElement, title: string, text: string): HTMLElement =>
      h('label', { class: 'option' }, radio, h('span', { class: 'option-text' }, h('span', { class: 'option-title' }, title), h('span', { class: 'muted small' }, text)));

    function mode(): RestoreMode {
      return replace.checked ? 'replace' : 'merge';
    }
    function syncSettingsDefault(): void {
      withSettings.checked = hasSettings && mode() === 'replace';
    }
    replace.addEventListener('change', syncSettingsDefault);
    merge.addEventListener('change', syncSettingsDefault);
    syncSettingsDefault();

    cancel.addEventListener('click', () => {
      pending = null;
      restoreBox.hidden = true;
      show('');
    });
    go.addEventListener('click', async () => {
      if (busy || !pending) return;
      const m = mode();
      if (m === 'replace' && !(await confirmDialog({ title: 'Alle Daten ersetzen?', text: 'Alle Touren, Kategorien und Fotos auf diesem Gerät werden durch den Inhalt des Backups ersetzt. Touren, die nur hier existieren, gehen verloren (außer sie sind in einem eigenen Backup gesichert).', confirmLabel: 'Ersetzen', destructive: true }))) return;
      setBusy(true);
      go.disabled = true;
      cancel.disabled = true;
      show('Wird wiederhergestellt …');
      try {
        const result = await applyBackup(db, pending, m, setProgress);
        const settingsApplied = withSettings.checked ? applySettings(pending.manifest.settings) : 0;
        pending = null;
        restoreBox.replaceChildren(
          h('h4', {}, 'Fertig'),
          h('p', { class: 'muted' }, resultText(result) + (settingsApplied > 0 ? ' Einstellungen übernommen.' : '')),
          (() => {
            const reload = h('button', { type: 'button', class: 'primary' }, 'App neu laden');
            reload.addEventListener('click', () => location.reload());
            return reload;
          })(),
        );
        show('');
      } catch (e) {
        show(`Wiederherstellen fehlgeschlagen: ${errorText(e)} Die Backup-Datei bleibt unverändert; ein erneuter Versuch ist möglich. Bisherige Daten wurden nicht gelöscht, außer dieselben Touren aus dem Backup wurden bereits übernommen.`, true);
        go.disabled = false;
        cancel.disabled = false;
      } finally {
        endProgress();
        setBusy(false);
      }
    });

    restoreBox.replaceChildren(
      h('h4', {}, 'Backup vom ' + dateText(data.manifest.createdAt)),
      h('p', { class: 'muted' }, `${num(c.tours)} Touren, ${num(c.categories)} Kategorien, ${num(c.photos)} Fotos, ${num(c.trackPoints)} Trackpunkte. Die Datei wurde geprüft (Prüfsummen, Verweise, Anzahlen).`),
      h('div', { class: 'options' },
        option(merge, 'Zusammenführen', 'Nur Touren ergänzen, die auf diesem Gerät noch fehlen. Bestehende Touren bleiben unverändert.'),
        option(replace, 'Ersetzen', 'Alle Daten auf diesem Gerät durch das Backup ersetzen (z. B. nach Neuinstallation oder auf einem neuen Gerät).'),
      ),
      h('label', { class: 'check' }, withSettings, h('span', {}, hasSettings ? 'Einstellungen (Design, Kartenmodus) übernehmen' : 'Keine Einstellungen im Backup')),
      h('div', { class: 'row actions' }, go, cancel),
    );
    restoreBox.hidden = false;
  }

  el.append(
    h('div', { class: 'row actions' }, create, restore),
    status,
    progress,
    msg,
    restoreBox,
    fileInput,
  );
  return { el, refresh };
}
