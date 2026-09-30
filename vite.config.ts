import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Erzeugt nach dem Build dist/sw.js aus scripts/sw.template.js (Phase 8b): Liste aller Ausgabedateien (ohne Sourcemaps)
 * zum Vorab-Speichern und eine Version aus dem Inhalt, damit Änderungen an der App einen neuen Service Worker auslösen.
 */
// Bewusst ohne Plugin-Typ aus 'vite': vitest bringt ggf. eine andere Vite-Version mit, deren Typen nicht zueinander passen.
function serviceWorkerPlugin() {
  let root = process.cwd();
  let outDir = resolve(root, 'dist');
  return {
    name: 'travelbook-sw',
    apply: 'build' as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const template = readFileSync(resolve(root, 'scripts/sw.template.js'), 'utf8');
      const sw = template.split('__VERSION__').join(hash.digest('hex').slice(0, 12)).split('__PRECACHE__').join(JSON.stringify(files));
      if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) throw new Error('Service-Worker-Vorlage: Platzhalter nicht ersetzt.');
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

/** Kurzkennung des Builds: Commit aus der CI (GITHUB_SHA) oder lokal aus git; sonst „lokal“. */
function buildCommit(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'lokal';
  } catch {
    return 'lokal';
  }
}

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string };

// GitHub Pages liefert unter /<repo-name>/ aus. Wird in der CI per BASE_PATH gesetzt.
// Lokal und für Capacitor (WebView) ist "./" korrekt.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { outDir: 'dist', sourcemap: true },
  // Sichtbare Versionsangabe in den Einstellungen (src/buildInfo.ts).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [serviceWorkerPlugin()],
  test: { environment: 'node' },
});
