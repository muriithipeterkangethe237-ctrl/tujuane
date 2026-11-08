/**
 * Service Worker Registration for TUJUANE
 * Registers service worker and forces update checks to guarantee the latest app icon and assets.
 */

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Immediately check for service worker update
          registration.update().catch(() => {});
        })
        .catch((error) => {
          console.warn('TUJUANE Service Worker registration failed:', error);
        });
    });
  }
}
