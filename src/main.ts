import { DEFAULT_DB_NAME, GpxDb, seedDefaultCategories } from './db';
import { h } from './ui/dom';
import { startApp } from './ui/app';
import './ui/styles.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const db = new GpxDb(DEFAULT_DB_NAME);
    await db.open();
    await seedDefaultCategories(db);
    startApp(root, db);
  } catch (e) {
    root.replaceChildren(
      h('div', { class: 'scroll' }, h('h2', {}, 'Datenbank nicht verfügbar'), h('p', {}, `Die lokale Datenbank konnte nicht geöffnet werden: ${e instanceof Error ? e.message : String(e)}`)),
    );
  }
}

void boot();
