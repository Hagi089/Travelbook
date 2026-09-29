import { DEFAULT_DB_NAME, GpxDb, seedDefaultCategories } from './db';
import { h } from './ui/dom';
import { startApp } from './ui/app';
import { initTheme } from './ui/theme';
import './ui/theme.css';
import './ui/styles.css';

initTheme();

/** Bittet den Browser, den Speicher dieser App nicht automatisch zu löschen (ARCHITECTURE.md, Risiko 6). Ergebnis ist unverbindlich. */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* nicht verfügbar */
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const db = new GpxDb(DEFAULT_DB_NAME);
    await db.open();
    await seedDefaultCategories(db);
    void requestPersistentStorage();
    startApp(root, db);
  } catch (e) {
    root.replaceChildren(
      h('div', { class: 'scroll' }, h('h2', {}, 'Datenbank nicht verfügbar'), h('p', {}, `Die lokale Datenbank konnte nicht geöffnet werden: ${e instanceof Error ? e.message : String(e)}`)),
    );
  }
}

void boot();
