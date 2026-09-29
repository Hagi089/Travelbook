import { defineConfig } from 'vite';

// GitHub Pages liefert unter /<repo-name>/ aus. Wird in der CI per BASE_PATH gesetzt.
// Lokal und für Capacitor (WebView) ist "./" korrekt.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node' },
});
