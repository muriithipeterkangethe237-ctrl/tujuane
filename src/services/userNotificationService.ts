import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserNotification, AccountStandingSummary } from '../types/notification';
import { CommunityPost } from '../types/community';
import { notificationService } from './notificationService';

const NOTIFICATIONS_COLLECTION = 'user_notifications';

/**
 * Send a notification to a specific citizen (post interaction, account status, social)
 */
export async function sendUserNotification(
  params: Omit<UserNotification, 'id' | 'read' | 'createdAt'>
): Promise<string> {
  // Prevent sending notifications to self
  if (params.actorId && params.actorId === params.userId) {
    return '';
  }

  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);

  const payload: any = {
    id: notificationId,
    userId: params.userId,
    category: params.category,
    type: params.type,
    title: params.title.trim().slice(0, 150),
    message: params.message.trim().slice(0, 500),
    read: false,
    createdAt: serverTimestamp()
  };

  if (params.postId) payload.postId = params.postId;
  if (params.postTitle) payload.postTitle = params.postTitle.slice(0, 150);
  if (params.actorId) payload.actorId = params.actorId;
  if (params.actorName) payload.actorName = params.actorName;
  if (params.actorPhoto) payload.actorPhoto = params.actorPhoto;
  if (params.actorCounty) payload.actorCounty = params.actorCounty;
  if (params.accountStatus) payload.accountStatus = params.accountStatus;
  if (params.badgeAwarded) payload.badgeAwarded = params.badgeAwarded;
  if (params.details) payload.details = params.details.slice(0, 500);

  try {
    await setDoc(notifRef, payload);
    return notificationId;
  } catch (error) {
    // Non-fatal logging to avoid interrupting main flow
    console.warn('Could not persist notification:', error);
    return '';
  }
}

/**
 * Subscribe to real-time notifications for the signed-in citizen
 */
export function subscribeToUserNotifications(
  userId: string,
  callback: (notifications: UserNotification[]) => void
): () => void {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId)
  );

  let initialLoad = true;
  let previousUnreadIds = new Set<string>();

  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserNotification[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          category: data.category || 'post_interaction',
          type: data.type || 'post_like',
          title: data.title || 'Notification',
          message: data.message || '',
          read: !!data.read,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
          postId: data.postId,
          postTitle: data.postTitle,
          actorId: data.actorId,
          actorName: data.actorName,
          actorPhoto: data.actorPhoto,
          actorCounty: data.actorCounty,
          accountStatus: data.accountStatus,
          badgeAwarded: data.badgeAwarded,
          details: data.details
        };
      });

      // Sort in-memory by newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // If new unread notification arrives after initial load, play audio chime & push
      if (!initialLoad) {
        const currentUnreads = list.filter((n) => !n.read);
        const newlyArrived = currentUnreads.filter((n) => !previousUnreadIds.has(n.id));
        if (newlyArrived.length > 0) {
          notificationService.playChime();
          const first = newlyArrived[0];
          notificationService.notify({
            title: first.title,
            body: first.message,
            type: first.category === 'social' ? 'mention' : 'channel',
            sourceId: first.id,
            sourceName: first.actorName || 'TUJUANE Alert'
          });
        }
      }

      previousUnreadIds = new Set(list.filter((n) => !n.read).map((n) => n.id));
      initialLoad = false;
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, NOTIFICATIONS_COLLECTION);
    }
  );
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  try {
    await updateDoc(notifRef, { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${NOTIFICATIONS_COLLECTION}/${notificationId}`);
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllUserNotificationsAsRead(userId: string): Promise<void> {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('read', '==', false)
  );

  try {
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Delete a single notification
 */
export async function deleteUserNotification(notificationId: string): Promise<void> {
  const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  try {
    await deleteDoc(notifRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${NOTIFICATIONS_COLLECTION}/${notificationId}`);
  }
}

/**
 * Clear all notifications for user
 */
export async function clearAllUserNotifications(userId: string): Promise<void> {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId)
  );

  try {
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Calculate the user's comprehensive Account Standing Summary
 */
export function calculateAccountStanding(
  userId: string,
  userPosts: CommunityPost[],
  notifications: UserNotification[]
): AccountStandingSummary {
  const myPosts = userPosts.filter((p) => p.authorId === userId);
  const totalPosts = myPosts.length;
  const totalUpvotes = myPosts.reduce((acc, p) => acc + (p.upvotes || 0), 0);

  // Check for flagged or advisory posts
  const flaggedPosts = myPosts.filter((p) => p.isFlagged || p.safetyAdvisory);
  const advisoryCount = flaggedPosts.length;

  // Check account status notifications
  const warningNotifs = notifications.filter(
    (n) => n.category === 'account_status' && n.type === 'account_warning'
  );
  const warningCount = warningNotifs.length;

  const verifiedNotif = notifications.find(
    (n) => n.category === 'account_status' && (n.type === 'account_verified' || n.accountStatus === 'verified')
  );
  const isVerified = !!verifiedNotif || totalUpvotes >= 15;

  let score = 100;
  score -= warningCount * 25;
  score -= advisoryCount * 15;
  if (isVerified) score = Math.min(100, score + 10);
  if (score < 0) score = 0;

  let status: 'good' | 'warning' | 'restricted' | 'verified' = 'good';
  let title = 'Account in Good Standing';
  let description = 'Your citizen account is verified, active, and adhering to Kenya community guidelines.';

  if (score <= 40 || warningCount >= 2) {
    status = 'warning';
    title = 'Account Under Caution';
    description = 'Your account has received safety advisories or warnings. Please review Kenya civic guidelines.';
  } else if (isVerified) {
    status = 'verified';
    title = 'Verified Citizen Contributor';
    description = 'You are an active, recognized community voice across Kenyan counties with positive civic impact.';
  }

  return {
    status,
    title,
    description,
    verifiedCitizen: isVerified,
    score,
    warningCount,
    advisoryCount,
    totalPosts,
    totalUpvotes
  };
}
