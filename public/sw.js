/**
 * TUJUANE Service Worker (v5)
 * - Pre-caches application shell, icons, and essential assets.
 * - Supports always-on online background notification delivery via Periodic Background Sync,
 *   Background Sync, and Push events even when no app tab/window is open.
 */

const CACHE_NAME = 'tujuane-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon.svg'
];

const SW_DB_NAME = 'tujuane_sw_db';
const SW_DB_VERSION = 1;
const SW_STORE_NAME = 'kv';
const SW_SESSION_KEY = 'session';
const PERIODIC_SYNC_TAG = 'tujuane-background-notifications';
const ONE_SHOT_SYNC_TAG = 'tujuane-sync-notifications';

function openTujuaneDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(SW_DB_NAME, SW_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
          db.createObjectStore(SW_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getSWStoredSession() {
  const db = await openTujuaneDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SW_STORE_NAME, 'readonly');
      const req = tx.objectStore(SW_STORE_NAME).get(SW_SESSION_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setSWStoredSession(session) {
  const db = await openTujuaneDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SW_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SW_STORE_NAME);
      if (session) {
        store.put(session, SW_SESSION_KEY);
      } else {
        store.delete(SW_SESSION_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function parseFirestoreValue(val) {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = (val.arrayValue && val.arrayValue.values) || [];
    return values.map(parseFirestoreValue);
  }
  if ('mapValue' in val) {
    return parseFirestoreFields((val.mapValue && val.mapValue.fields) || {});
  }
  return undefined;
}

function parseFirestoreFields(fields) {
  const result = {};
  if (!fields || typeof fields !== 'object') return result;
  for (const key of Object.keys(fields)) {
    result[key] = parseFirestoreValue(fields[key]);
  }
  return result;
}

async function refreshFirebaseIdToken(session) {
  if (!session || !session.refreshToken || !session.firebaseConfig || !session.firebaseConfig.apiKey) {
    return null;
  }
  try {
    const endpoint = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(
      session.firebaseConfig.apiKey
    )}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.id_token) return null;

    const updated = {
      ...session,
      idToken: data.id_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
    };
    await setSWStoredSession(updated);
    return updated;
  } catch {
    return null;
  }
}

async function getAuthorizedSession(session, forceRefresh = false) {
  if (!session || !session.uid) return null;
  const needsRefresh =
    forceRefresh || !session.idToken || !session.expiresAt || Date.now() >= session.expiresAt - 60000;
  if (needsRefresh) {
    const refreshed = await refreshFirebaseIdToken(session);
    if (refreshed) return refreshed;
  }
  return session.idToken ? session : null;
}

async function runFirestoreQuery(session, structuredQuery) {
  const { projectId, databaseId } = session.firebaseConfig || {};
  if (!projectId) return [];

  const dbId = databaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbId)}/documents:runQuery`;

  let activeSession = await getAuthorizedSession(session, false);
  if (!activeSession) return [];

  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeSession.idToken}`
    },
    body: JSON.stringify({ structuredQuery })
  });

  if (res.status === 401) {
    activeSession = await getAuthorizedSession(activeSession, true);
    if (!activeSession) return [];
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeSession.idToken}`
      },
      body: JSON.stringify({ structuredQuery })
    });
  }

  if (!res.ok) return [];
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row && row.document && row.document.fields)
    .map((row) => {
      const nameParts = String(row.document.name || '').split('/');
      const docId = nameParts[nameParts.length - 1] || '';
      return {
        docId,
        ...parseFirestoreFields(row.document.fields)
      };
    });
}

function isTypeAllowedByPrefs(type, prefs) {
  if (!prefs || !prefs.typePreferences) return true;
  if (type in prefs.typePreferences) {
    return prefs.typePreferences[type] !== false;
  }
  if (type === 'account_verified' || type === 'account_good_standing' || type === 'account_warning') {
    return prefs.typePreferences.account_status !== false;
  }
  return true;
}

async function checkOnlineNotificationsInBackground() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    return;
  }

  const session = await getSWStoredSession();
  if (!session || !session.uid || !session.firebaseConfig) {
    return;
  }

  const prefs = session.preferences || {};
  if (prefs.pushEnabled === false || prefs.backgroundAlertsEnabled === false) {
    return;
  }

  const seenSet = new Set(Array.isArray(session.notifiedIds) ? session.notifiedIds : []);
  const newlyAlertedIds = [];
  const pendingNotifications = [];

  try {
    // 1. Check unread user_notifications
    const unreadNotifs = await runFirestoreQuery(session, {
      from: [{ collectionId: 'user_notifications' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'userId' },
                op: 'EQUAL',
                value: { stringValue: session.uid }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: 'read' },
                op: 'EQUAL',
                value: { booleanValue: false }
              }
            }
          ]
        }
      },
      limit: 20
    });

    for (const notif of unreadNotifs) {
      const nId = notif.id || notif.docId;
      if (!nId || seenSet.has(nId)) continue;
      if (!isTypeAllowedByPrefs(notif.type, prefs)) continue;

      seenSet.add(nId);
      newlyAlertedIds.push(nId);
      pendingNotifications.push({
        title: notif.title || 'TUJUANE Update',
        body: notif.message || 'You have a new notification on TUJUANE.',
        tag: `tujuane_notif_${nId}`,
        data: {
          url: `/?notifId=${encodeURIComponent(nId)}&notifType=${encodeURIComponent(
            notif.type || ''
          )}&postId=${encodeURIComponent(notif.postId || '')}&actorId=${encodeURIComponent(
            notif.actorId || ''
          )}`,
          notificationId: nId,
          type: notif.type || 'channel',
          postId: notif.postId || '',
          actorId: notif.actorId || '',
          actorName: notif.actorName || 'Citizen'
        }
      });
    }

    // 2. Also check unread 1-on-1 direct chats directly
    if (isTypeAllowedByPrefs('direct_message', prefs)) {
      const userChats = await runFirestoreQuery(session, {
        from: [{ collectionId: 'chats' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'participants' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: session.uid }
          }
        },
        limit: 20
      });

      for (const chat of userChats) {
        const unreadBy = Array.isArray(chat.unreadBy) ? chat.unreadBy : [];
        if (!unreadBy.includes(session.uid)) continue;
        if (!chat.lastMessageSenderId || chat.lastMessageSenderId === session.uid) continue;

        const msgKey = `chat_${chat.docId}_${chat.lastMessageId || chat.lastMessageTimestamp || 'unread'}`;
        if (seenSet.has(msgKey)) continue;

        const senderDetails =
          (chat.participantDetails && chat.participantDetails[chat.lastMessageSenderId]) || {};
        const senderName = senderDetails.displayName || 'Citizen';

        seenSet.add(msgKey);
        newlyAlertedIds.push(msgKey);
        pendingNotifications.push({
          title: `Message from ${senderName}`,
          body: chat.lastMessage || 'Sent you a direct message on TUJUANE.',
          tag: `tujuane_chat_${chat.docId}`,
          data: {
            url: `/?notifType=direct_message&actorId=${encodeURIComponent(
              chat.lastMessageSenderId
            )}&actorName=${encodeURIComponent(senderName)}`,
            type: 'direct_message',
            actorId: chat.lastMessageSenderId,
            actorName: senderName
          }
        });
      }
    }

    // Dispatch OS notifications even when no app window is open
    const maxIndividual = 4;
    const toDisplay = pendingNotifications.slice(0, maxIndividual);
    for (const item of toDisplay) {
      await self.registration.showNotification(item.title, {
        body: item.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: item.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        data: item.data
      });
    }

    if (pendingNotifications.length > maxIndividual) {
      const remaining = pendingNotifications.length - maxIndividual;
      await self.registration.showNotification('TUJUANE Community Updates', {
        body: `You have ${remaining} more unread alerts waiting while online.`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'tujuane_summary_more',
        renotify: true,
        data: { url: '/?openNotifications=1' }
      });
    }

    if (newlyAlertedIds.length > 0) {
      const latestSession = await getSWStoredSession();
      if (latestSession && latestSession.uid === session.uid) {
        const mergedIds = Array.from(
          new Set([...(latestSession.notifiedIds || []), ...newlyAlertedIds])
        ).slice(-150);
        await setSWStoredSession({
          ...latestSession,
          notifiedIds: mergedIds,
          lastCheckedAt: Date.now()
        });
      }
    }
  } catch {
    // non-fatal background poll error
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.log('SW cache skip:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (
    url.pathname.includes('manifest.json') ||
    url.pathname.includes('icon') ||
    url.pathname.includes('apple-touch-icon') ||
    url.pathname.includes('favicon')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (
                url.origin === location.origin ||
                url.hostname.includes('googleapis.com') ||
                url.hostname.includes('gstatic.com')
              ) {
                cache.put(event.request, clone);
              }
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Notification click handler: Focuses existing window (and forwards route data) or opens TUJUANE directly
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'TUJUANE_NOTIFICATION_CLICK',
            data
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Periodic Background Sync: wakes SW periodically while device is online even with app closed
self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(checkOnlineNotificationsInBackground());
  }
});

// One-shot Background Sync: fires as soon as device connectivity is online
self.addEventListener('sync', (event) => {
  if (event.tag === ONE_SHOT_SYNC_TAG) {
    event.waitUntil(checkOnlineNotificationsInBackground());
  }
});

// Push notification event listener: displays explicit push payload or fetches live alerts
self.addEventListener('push', (event) => {
  let data = null;
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      const text = event.data.text();
      if (text) {
        data = {
          title: 'TUJUANE Kenya Community',
          body: text
        };
      }
    }
  }

  if (data && (data.title || data.body)) {
    const title = data.title || 'TUJUANE Kenya Community';
    const options = {
      body: data.body || 'You have new activity waiting for you on TUJUANE.',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || `tujuane_${Date.now()}`,
      renotify: true,
      vibrate: [200, 100, 200],
      data: data.data || { url: '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }

  // Wake-up push without payload: query unread Firestore notifications directly
  event.waitUntil(checkOnlineNotificationsInBackground());
});

// Client <-> Service Worker message bridge
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SYNC_SESSION' && msg.payload) {
    event.waitUntil(setSWStoredSession(msg.payload));
  } else if (msg.type === 'SYNC_PREFERENCES' && msg.payload) {
    event.waitUntil(
      getSWStoredSession().then((existing) => {
        if (!existing) return;
        return setSWStoredSession({ ...existing, preferences: msg.payload });
      })
    );
  } else if (msg.type === 'MARK_SEEN_IDS' && Array.isArray(msg.payload)) {
    event.waitUntil(
      getSWStoredSession().then((existing) => {
        if (!existing) return;
        const merged = Array.from(
          new Set([...(existing.notifiedIds || []), ...msg.payload])
        ).slice(-150);
        return setSWStoredSession({ ...existing, notifiedIds: merged });
      })
    );
  } else if (msg.type === 'CLEAR_SESSION') {
    event.waitUntil(setSWStoredSession(null));
  } else if (msg.type === 'CHECK_NOTIFICATIONS_NOW') {
    event.waitUntil(checkOnlineNotificationsInBackground());
  }
});
