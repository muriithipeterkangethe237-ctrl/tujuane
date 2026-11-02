/**
 * Service Worker Registration for TUJUANE
 * Registers service worker to enable app shell caching and offline support.
 */

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('TUJUANE Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.warn('TUJUANE Service Worker registration failed:', error);
        });
    });
  }
}
