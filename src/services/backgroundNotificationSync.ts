import type { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { NotificationPreferences } from '../types/notification';

const DB_NAME = 'tujuane_sw_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const SESSION_KEY = 'session';

export const PERIODIC_SYNC_TAG = 'tujuane-background-notifications';
export const ONE_SHOT_SYNC_TAG = 'tujuane-sync-notifications';

export interface SWStoredSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  firebaseConfig: {
    projectId: string;
    databaseId: string;
    apiKey: string;
  };
  preferences: NotificationPreferences;
  notifiedIds: string[];
  lastCheckedAt: number;
}

export interface BackgroundSyncCapabilities {
  swSupported: boolean;
  swReady: boolean;
  notificationsSupported: boolean;
  permission: NotificationPermission;
  periodicSyncSupported: boolean;
  periodicSyncRegistered: boolean;
  backgroundSyncSupported: boolean;
  backgroundSyncRegistered: boolean;
}

function getActiveApiKey(): string {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey === '[REDACTED]'
    ? 'AIzaSyDV3VrFRV9sEMfUjS4oo8k8VfSZxaa9hSA'
    : firebaseConfig.apiKey;
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readSessionRecord(): Promise<SWStoredSession | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => resolve((req.result as SWStoredSession) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeSessionRecord(session: SWStoredSession | null): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (session) {
        store.put(session, SESSION_KEY);
      } else {
        store.delete(SESSION_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function postMessageToSW(message: { type: string; payload?: unknown }): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage(message);
  } catch {
    // ignore SW messaging errors
  }
}

/**
 * Persists authenticated user tokens + preferences into IndexedDB so the
 * Service Worker can check online notifications even when no tab is open.
 */
export async function syncAuthToServiceWorker(
  user: User,
  preferences: NotificationPreferences
): Promise<void> {
  if (typeof window === 'undefined' || !user?.uid) return;
  try {
    const tokenResult = await user.getIdTokenResult();
    const existing = await readSessionRecord();
    const expiresAt = tokenResult.expirationTime
      ? new Date(tokenResult.expirationTime).getTime()
      : Date.now() + 55 * 60 * 1000;

    const session: SWStoredSession = {
      uid: user.uid,
      email: user.email || '',
      idToken: tokenResult.token,
      refreshToken: user.refreshToken || existing?.refreshToken || '',
      expiresAt,
      firebaseConfig: {
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        apiKey: getActiveApiKey()
      },
      preferences,
      notifiedIds:
        existing && existing.uid === user.uid && Array.isArray(existing.notifiedIds)
          ? existing.notifiedIds.slice(-150)
          : [],
      lastCheckedAt: existing?.lastCheckedAt || Date.now()
    };

    await writeSessionRecord(session);
    await postMessageToSW({ type: 'SYNC_SESSION', payload: session });
  } catch {
    // non-fatal
  }
}

/**
 * Updates notification preferences in IndexedDB and notifies active SW.
 */
export async function syncPreferencesToServiceWorker(
  preferences: NotificationPreferences
): Promise<void> {
  try {
    const existing = await readSessionRecord();
    if (!existing) return;
    const updated: SWStoredSession = {
      ...existing,
      preferences
    };
    await writeSessionRecord(updated);
    await postMessageToSW({ type: 'SYNC_PREFERENCES', payload: preferences });
  } catch {
    // ignore
  }
}

/**
 * Marks notification/message IDs as already seen so the Service Worker
 * does not re-notify when running in the background.
 */
export async function markNotificationIdsSeenInSW(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    const existing = await readSessionRecord();
    if (!existing) return;
    const merged = Array.from(new Set([...(existing.notifiedIds || []), ...ids])).slice(-150);
    await writeSessionRecord({
      ...existing,
      notifiedIds: merged,
      lastCheckedAt: Date.now()
    });
    await postMessageToSW({ type: 'MARK_SEEN_IDS', payload: ids });
  } catch {
    // ignore
  }
}

/**
 * Clears SW session data when user signs out.
 */
export async function clearServiceWorkerSession(): Promise<void> {
  try {
    await writeSessionRecord(null);
    await postMessageToSW({ type: 'CLEAR_SESSION' });
  } catch {
    // ignore
  }
}

/**
 * Registers browser Background Sync and Periodic Background Sync tasks
 * so the Service Worker wakes up when the device is online even without
 * launching the app.
 */
export async function registerBackgroundNotificationTasks(): Promise<BackgroundSyncCapabilities> {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  const permission: NotificationPermission = notificationsSupported ? Notification.permission : 'denied';

  const result: BackgroundSyncCapabilities = {
    swSupported,
    swReady: false,
    notificationsSupported,
    permission,
    periodicSyncSupported: false,
    periodicSyncRegistered: false,
    backgroundSyncSupported: false,
    backgroundSyncRegistered: false
  };

  if (!swSupported) return result;

  try {
    const reg = await navigator.serviceWorker.ready;
    result.swReady = !!reg;

    const syncManager = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (syncManager && typeof syncManager.register === 'function') {
      result.backgroundSyncSupported = true;
      try {
        await syncManager.register(ONE_SHOT_SYNC_TAG);
        result.backgroundSyncRegistered = true;
      } catch {
        // browser may restrict until interaction
      }
    }

    const periodicSync = (
      reg as unknown as {
        periodicSync?: {
          register: (tag: string, options?: { minInterval?: number }) => Promise<void>;
          getTags?: () => Promise<string[]>;
        };
      }
    ).periodicSync;

    if (periodicSync && typeof periodicSync.register === 'function') {
      result.periodicSyncSupported = true;
      try {
        await periodicSync.register(PERIODIC_SYNC_TAG, {
          minInterval: 15 * 60 * 1000 // 15 minutes (browsers clamp to site engagement min)
        });
        result.periodicSyncRegistered = true;
      } catch {
        // PeriodicSync requires installed PWA or permission depending on browser
        if (typeof periodicSync.getTags === 'function') {
          try {
            const tags = await periodicSync.getTags();
            result.periodicSyncRegistered = tags.includes(PERIODIC_SYNC_TAG);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}

/**
 * Asks the active Service Worker to run a background notification check immediately.
 */
export async function triggerImmediateSWNotificationCheck(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    await postMessageToSW({ type: 'CHECK_NOTIFICATIONS_NOW' });
    return true;
  } catch {
    return false;
  }
}
