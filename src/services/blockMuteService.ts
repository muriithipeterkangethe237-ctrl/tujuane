import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

const BLOCKED_CACHE_PREFIX = 'tujuane_blocked_users_';
const MUTED_CACHE_PREFIX = 'tujuane_muted_users_';

function getLocalCache(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalCache(key: string, list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Get locally cached blocked IDs for zero-latency UI checks
 */
export function getCachedBlockedUsers(userId: string): string[] {
  return getLocalCache(`${BLOCKED_CACHE_PREFIX}${userId}`);
}

/**
 * Get locally cached muted IDs for zero-latency notification filtering
 */
export function getCachedMutedUsers(userId: string): string[] {
  return getLocalCache(`${MUTED_CACHE_PREFIX}${userId}`);
}

/**
 * Block a target user account
 */
export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;

  // Optimistic local update
  const currentBlocked = getCachedBlockedUsers(currentUserId);
  if (!currentBlocked.includes(targetUserId)) {
    const updated = [...currentBlocked, targetUserId];
    setLocalCache(`${BLOCKED_CACHE_PREFIX}${currentUserId}`, updated);
  }

  const userRef = doc(db, 'users', currentUserId);
  try {
    await setDoc(
      userRef,
      {
        blockedUserIds: arrayUnion(targetUserId)
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${currentUserId}`);
  }
}

/**
 * Unblock a target user account
 */
export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId || !targetUserId) return;

  // Optimistic local update
  const currentBlocked = getCachedBlockedUsers(currentUserId);
  const updated = currentBlocked.filter((id) => id !== targetUserId);
  setLocalCache(`${BLOCKED_CACHE_PREFIX}${currentUserId}`, updated);

  const userRef = doc(db, 'users', currentUserId);
  try {
    await setDoc(
      userRef,
      {
        blockedUserIds: arrayRemove(targetUserId)
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${currentUserId}`);
  }
}

/**
 * Mute notifications from a target user account
 */
export async function muteUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;

  // Optimistic local update
  const currentMuted = getCachedMutedUsers(currentUserId);
  if (!currentMuted.includes(targetUserId)) {
    const updated = [...currentMuted, targetUserId];
    setLocalCache(`${MUTED_CACHE_PREFIX}${currentUserId}`, updated);
  }

  const userRef = doc(db, 'users', currentUserId);
  try {
    await setDoc(
      userRef,
      {
        mutedUserIds: arrayUnion(targetUserId)
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${currentUserId}`);
  }
}

/**
 * Unmute notifications from a target user account
 */
export async function unmuteUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId || !targetUserId) return;

  // Optimistic local update
  const currentMuted = getCachedMutedUsers(currentUserId);
  const updated = currentMuted.filter((id) => id !== targetUserId);
  setLocalCache(`${MUTED_CACHE_PREFIX}${currentUserId}`, updated);

  const userRef = doc(db, 'users', currentUserId);
  try {
    await setDoc(
      userRef,
      {
        mutedUserIds: arrayRemove(targetUserId)
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${currentUserId}`);
  }
}

/**
 * Real-time subscription to current user's blocked and muted lists
 */
export function subscribeBlockedAndMuted(
  userId: string,
  onUpdate: (data: { blockedUserIds: string[]; mutedUserIds: string[] }) => void
): () => void {
  if (!userId) return () => {};

  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const blockedUserIds: string[] = Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [];
        const mutedUserIds: string[] = Array.isArray(data.mutedUserIds) ? data.mutedUserIds : [];

        setLocalCache(`${BLOCKED_CACHE_PREFIX}${userId}`, blockedUserIds);
        setLocalCache(`${MUTED_CACHE_PREFIX}${userId}`, mutedUserIds);

        onUpdate({ blockedUserIds, mutedUserIds });
      }
    },
    (err) => {
      console.warn('Subscription to blocked/muted lists warning:', err?.message || err);
    }
  );
}
