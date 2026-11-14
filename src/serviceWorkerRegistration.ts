import { registerBackgroundNotificationTasks } from './services/backgroundNotificationSync';

/**
 * Service Worker Registration for TUJUANE
 * Registers service worker, registers background notification sync tasks,
 * and checks for updates to guarantee latest app assets and offline/background resilience.
 */

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.update().catch(() => {});
          if ('Notification' in window && Notification.permission === 'granted') {
            void registerBackgroundNotificationTasks();
          }
        })
        .catch((error) => {
          console.warn('TUJUANE Service Worker registration failed:', error);
        });
    });
  }
}
