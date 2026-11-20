import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  handleFirestoreListenerError,
  isFirestoreQuotaExceeded,
  OperationType
} from '../firebase';
import { UserProfile } from '../types/chat';
import {
  AppIssueReport,
  AppIssueStatus,
  SubmitAppIssueParams
} from '../types/appIssue';

const APP_ISSUES_COLLECTION = 'app_issue_reports';
const LOCAL_ISSUES_CACHE_KEY = 'tujuane_my_app_issues_cache_v1';

function loadCachedIssues(reporterId?: string): AppIssueReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_ISSUES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return reporterId
      ? (parsed as AppIssueReport[]).filter((item) => item.reporterId === reporterId)
      : (parsed as AppIssueReport[]);
  } catch {
    return [];
  }
}

function saveCachedIssue(issue: AppIssueReport): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadCachedIssues();
    const filtered = existing.filter((i) => i.id !== issue.id);
    localStorage.setItem(
      LOCAL_ISSUES_CACHE_KEY,
      JSON.stringify([issue, ...filtered].slice(0, 30))
    );
  } catch {
    // ignore storage errors
  }
}

function buildDeviceInfoSummary(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'Unknown device';
  const width = window.innerWidth;
  const height = window.innerHeight;
  const online = navigator.onLine ? 'Online' : 'Offline';
  const ua = navigator.userAgent || '';
  const shortBrowser = ua.includes('Chrome')
    ? 'Chrome'
    : ua.includes('Firefox')
    ? 'Firefox'
    : ua.includes('Safari')
    ? 'Safari'
    : 'Browser';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  return `${isMobile} · ${shortBrowser} · ${width}x${height} · ${online}`.slice(0, 300);
}

/**
 * Submit a citizen app issue / bug report to Firestore
 */
export async function submitAppIssueReport(
  reporter: UserProfile,
  params: SubmitAppIssueParams
): Promise<AppIssueReport> {
  const issueId = `issue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const issueRef = doc(db, APP_ISSUES_COLLECTION, issueId);

  const safeTitle = params.title.trim().slice(0, 150);
  const safeDesc = params.description.trim().slice(0, 1500);
  const deviceInfo = buildDeviceInfoSummary();
  const currentScreen = (params.currentScreen || 'app').trim().slice(0, 60);

  const payload: Record<string, any> = {
    id: issueId,
    reporterId: reporter.uid,
    reporterName: (reporter.displayName || 'Citizen Member').slice(0, 100),
    category: params.category,
    severity: params.severity,
    title: safeTitle,
    description: safeDesc,
    currentScreen,
    deviceInfo,
    status: 'open',
    createdAt: serverTimestamp()
  };

  if (reporter.email) {
    payload.reporterEmail = reporter.email.slice(0, 128);
  }
  if (reporter.county) {
    payload.reporterCounty = reporter.county.slice(0, 50);
  }

  const localRecord: AppIssueReport = {
    id: issueId,
    reporterId: reporter.uid,
    reporterName: payload.reporterName,
    reporterEmail: reporter.email,
    reporterCounty: reporter.county,
    category: params.category,
    severity: params.severity,
    title: safeTitle,
    description: safeDesc,
    currentScreen,
    deviceInfo,
    status: 'open',
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(issueRef, payload);
    saveCachedIssue(localRecord);
    return localRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${APP_ISSUES_COLLECTION}/${issueId}`);
  }
}

/**
 * Subscribe to the signed-in citizen's own submitted app issues
 */
export function subscribeToMyAppIssues(
  reporterId: string,
  callback: (issues: AppIssueReport[]) => void
): () => void {
  const cached = loadCachedIssues(reporterId);
  if (cached.length > 0) {
    callback(cached);
  }

  if (isFirestoreQuotaExceeded()) {
    if (cached.length === 0) callback([]);
    return () => {};
  }

  const q = query(
    collection(db, APP_ISSUES_COLLECTION),
    where('reporterId', '==', reporterId),
    limit(25)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: AppIssueReport[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reporterId: data.reporterId,
          reporterName: data.reporterName || 'Citizen Member',
          reporterEmail: data.reporterEmail,
          reporterCounty: data.reporterCounty,
          category: data.category || 'bug',
          severity: data.severity || 'medium',
          title: data.title || 'App Issue',
          description: data.description || '',
          currentScreen: data.currentScreen,
          deviceInfo: data.deviceInfo,
          status: data.status || 'open',
          developerNotes: data.developerNotes,
          resolvedBy: data.resolvedBy,
          resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate().toISOString() : data.resolvedAt,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.LIST, APP_ISSUES_COLLECTION, () =>
        callback(loadCachedIssues(reporterId))
      );
    }
  );
}

/**
 * Subscribe to all citizen-submitted app issue reports (Developer Panel only)
 */
export function subscribeToAllAppIssues(
  callback: (issues: AppIssueReport[]) => void
): () => void {
  if (isFirestoreQuotaExceeded()) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, APP_ISSUES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(80)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: AppIssueReport[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reporterId: data.reporterId,
          reporterName: data.reporterName || 'Citizen Member',
          reporterEmail: data.reporterEmail,
          reporterCounty: data.reporterCounty,
          category: data.category || 'bug',
          severity: data.severity || 'medium',
          title: data.title || 'App Issue',
          description: data.description || '',
          currentScreen: data.currentScreen,
          deviceInfo: data.deviceInfo,
          status: data.status || 'open',
          developerNotes: data.developerNotes,
          resolvedBy: data.resolvedBy,
          resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate().toISOString() : data.resolvedAt,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });
      callback(list);
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.LIST, APP_ISSUES_COLLECTION, () => callback([]));
    }
  );
}

/**
 * Update status & developer triage notes for an app issue report
 */
export async function updateAppIssueStatus(
  issueId: string,
  status: AppIssueStatus,
  developerEmail: string,
  developerNotes?: string
): Promise<void> {
  const issueRef = doc(db, APP_ISSUES_COLLECTION, issueId);
  const updates: Record<string, any> = {
    status,
    resolvedBy: developerEmail.slice(0, 128),
    resolvedAt: serverTimestamp()
  };

  if (developerNotes !== undefined) {
    updates.developerNotes = developerNotes.trim().slice(0, 500);
  }

  try {
    await updateDoc(issueRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${APP_ISSUES_COLLECTION}/${issueId}`);
  }
}
