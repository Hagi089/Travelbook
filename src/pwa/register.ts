import { Capacitor } from '@capacitor/core';

/**
 * Registriert den Service Worker (Phase 8b), damit die App ohne Netz startet.
 * - Nur im Produktions-Build und nicht in der Android-App (dort liegen alle Dateien ohnehin lokal).
 * - Ein neuer Service Worker wartet. `onUpdate` bekommt eine Funktion, die ihn aktiviert; die Seite lädt danach neu.
 *   Beim allerersten Installieren gibt es keine Rückfrage und kein Neuladen.
 */
export function registerServiceWorker(onUpdate: (activate: () => void) => void): void {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  const start = (): void => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const announce = (worker: ServiceWorker): void => onUpdate(() => worker.postMessage({ type: 'SKIP_WAITING' }));
        if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(worker);
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        });
      })
      .catch(() => {
        /* Ohne Service Worker läuft die App online weiter wie bisher. */
      });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
