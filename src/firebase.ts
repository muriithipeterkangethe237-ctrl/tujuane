import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase with fallback if apiKey is redacted
const activeConfig = {
  ...firebaseConfig,
  apiKey: (!firebaseConfig.apiKey || firebaseConfig.apiKey === '[REDACTED]')
    ? 'AIzaSyDV3VrFRV9sEMfUjS4oo8k8VfSZxaa9hSA'
    : firebaseConfig.apiKey
};

const app = initializeApp(activeConfig);

// Initialize Firebase Auth with browserLocalPersistence so users stay logged in across app closes and browser restarts
export const auth = getAuth(app);

// Enforce browser-level local persistence for seamless one-time login
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Firebase Auth persistence notice:', err?.message || err);
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
export {
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence
};

// Initialize Cloud Firestore with persistent IndexedDB cache (survives reloads & minimizes server reads)
function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();

// Test Firestore Connection as specified in skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded();
      return;
    }
    const msg = error?.message || String(error);
    if (
      msg.includes('the client is offline') ||
      msg.includes('token-service-api') ||
      msg.includes('not-found') ||
      msg.includes('permission-denied')
    ) {
      console.info('Firestore initial connectivity tested.');
    }
  }
}

// Run connection test non-blockingly after initial bootstrap
setTimeout(testConnection, 500);

// Error Handling Infrastructure
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let quotaExceededFlag = false;
const quotaSubscribers = new Set<(exceeded: boolean) => void>();

export function isFirestoreQuotaExceeded(): boolean {
  return quotaExceededFlag;
}

export function subscribeToFirestoreQuotaStatus(
  listener: (exceeded: boolean) => void
): () => void {
  quotaSubscribers.add(listener);
  listener(quotaExceededFlag);
  return () => {
    quotaSubscribers.delete(listener);
  };
}

export function markFirestoreQuotaExceeded(): void {
  if (!quotaExceededFlag) {
    quotaExceededFlag = true;
    console.warn(
      'Firestore free daily quota limit exceeded. Operating in graceful fallback/cached mode until daily reset or plan upgrade.'
    );
    quotaSubscribers.forEach((cb) => {
      try {
        cb(true);
      } catch {
        // ignore listener errors
      }
    });
  }
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code = typeof (error as any)?.code === 'string' ? (error as any).code.toLowerCase() : '';
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    code.includes('resource-exhausted') ||
    message.includes('quota limit exceeded') ||
    message.includes('quota exceeded') ||
    message.includes('resource-exhausted') ||
    message.includes('free daily read units') ||
    message.includes('daily free read quota') ||
    message.includes('quota resets tomorrow')
  );
}

export function isFirestoreTransientError(error: unknown): boolean {
  if (!error) return false;
  const code = typeof (error as any)?.code === 'string' ? (error as any).code.toLowerCase() : '';
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'aborted' ||
    code === 'deadline-exceeded' ||
    message.includes('client is offline') ||
    message.includes('network error') ||
    message.includes('failed to get document because the client is offline')
  );
}

function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded();
    throw new Error(
      'Database daily free read quota reached. Cached data remains available; quota resets tomorrow.'
    );
  }
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Safe error handler for async onSnapshot listeners:
 * prevents unhandled runtime crashes when free daily quota is exceeded or device goes offline,
 * while surfacing permission/security errors cleanly.
 */
export function handleFirestoreListenerError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  fallbackCallback?: () => void
): void {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded();
    fallbackCallback?.();
    return;
  }

  if (isFirestoreTransientError(error)) {
    console.warn(`Firestore listener transient notice (${path || 'unknown'}):`, (error as any)?.message || error);
    fallbackCallback?.();
    return;
  }

  const code = typeof (error as any)?.code === 'string' ? (error as any).code.toLowerCase() : '';
  if (code === 'permission-denied') {
    const errInfo = buildFirestoreErrorInfo(error, operationType, path);
    console.warn('Firestore permission warning: ', JSON.stringify(errInfo));
    fallbackCallback?.();
    return;
  }

  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  fallbackCallback?.();
}
