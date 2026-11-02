import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { SafetyReport, ModeratorActionLog } from '../types/safety';

const REPORTS_COLLECTION = 'safety_reports';
const POSTS_COLLECTION = 'community_posts';
const MOD_LOGS_COLLECTION = 'moderator_action_logs';

/**
 * Submit a community safety report for a post
 */
export async function submitSafetyReport(
  params: Omit<SafetyReport, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reportRef = doc(db, REPORTS_COLLECTION, reportId);
  const postRef = doc(db, POSTS_COLLECTION, params.postId);

  const payload = {
    ...params,
    id: reportId,
    status: 'pending',
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(reportRef, payload);

    // Update post report stats & flag status
    try {
      await updateDoc(postRef, {
        isFlagged: true,
        safetyCategory: params.category,
        safetyReason: params.details || `Reported for ${params.category}`,
        moderationStatus: 'under_review'
      });
    } catch {
      // Non-fatal if post doc fails update
    }

    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${REPORTS_COLLECTION}/${reportId}`);
  }
}

/**
 * Subscribe to safety reports in real-time (for Developer Control Panel)
 */
export function subscribeToSafetyReports(
  callback: (reports: SafetyReport[]) => void
): () => void {
  try {
    const q = query(collection(db, REPORTS_COLLECTION), orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const reports: SafetyReport[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            postId: data.postId || '',
            postTitle: data.postTitle || 'Community Post',
            postSnippet: data.postSnippet,
            authorId: data.authorId || '',
            authorName: data.authorName || 'Citizen',
            reporterId: data.reporterId || '',
            reporterName: data.reporterName || 'Citizen Reporter',
            category: data.category || 'misleading',
            details: data.details,
            status: data.status || 'pending',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
            resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate().toISOString() : undefined,
            actionTaken: data.actionTaken
          };
        });
        callback(reports);
      },
      (err) => {
        if (err.code === 'permission-denied') {
          console.warn('Safety reports feed restricted to moderators.');
          callback([]);
          return;
        }
        handleFirestoreError(err, OperationType.GET, REPORTS_COLLECTION);
      }
    );
  } catch (err) {
    console.warn('Unable to subscribe to safety reports:', err);
    callback([]);
    return () => {};
  }
}

/**
 * Action a report: dismiss or take down
 */
export async function resolveSafetyReport(
  reportId: string,
  action: 'actioned' | 'dismissed',
  moderatorEmail: string,
  actionDetails?: string
): Promise<void> {
  const reportRef = doc(db, REPORTS_COLLECTION, reportId);
  try {
    await updateDoc(reportRef, {
      status: action,
      resolvedAt: serverTimestamp(),
      actionTaken: actionDetails || action
    });

    // Log action
    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, MOD_LOGS_COLLECTION, logId), {
      id: logId,
      moderatorEmail,
      actionType: action === 'actioned' ? 'dismiss_report' : 'dismiss_report',
      targetId: reportId,
      targetType: 'report',
      details: actionDetails,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${REPORTS_COLLECTION}/${reportId}`);
  }
}

/**
 * Attach moderator safety advisory banner to a post
 */
export async function attachSafetyAdvisoryToPost(
  postId: string,
  advisory: string,
  moderatorEmail: string
): Promise<void> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    await updateDoc(postRef, {
      isFlagged: true,
      safetyAdvisory: advisory,
      moderationStatus: 'flagged'
    });

    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, MOD_LOGS_COLLECTION, logId), {
      id: logId,
      moderatorEmail,
      actionType: 'attach_advisory',
      targetId: postId,
      targetType: 'post',
      details: advisory,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Mark a post as safe / approved by moderator
 */
export async function approvePostSafety(
  postId: string,
  moderatorEmail: string
): Promise<void> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    await updateDoc(postRef, {
      isFlagged: false,
      safetyReason: '',
      safetyAdvisory: '',
      moderationStatus: 'approved'
    });

    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, MOD_LOGS_COLLECTION, logId), {
      id: logId,
      moderatorEmail,
      actionType: 'approve_post',
      targetId: postId,
      targetType: 'post',
      details: 'Approved content after safety review',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Developer / Moderator removes a post permanently
 */
export async function removePostByModerator(
  postId: string,
  reason: string,
  moderatorEmail: string
): Promise<void> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    await deleteDoc(postRef);

    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, MOD_LOGS_COLLECTION, logId), {
      id: logId,
      moderatorEmail,
      actionType: 'delete_post',
      targetId: postId,
      targetType: 'post',
      details: reason,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}`);
  }
}
