import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { getAnalytics, isSupported as isAnalyticsSupported, logEvent, Analytics } from 'firebase/analytics';
import { User } from 'firebase/auth';
import {
  db,
  isFirestoreQuotaError,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  handleFirestoreListenerError,
  OperationType
} from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types/chat';
import {
  TelemetrySession,
  CrashReport,
  CrashCategory,
  CrashSeverity,
  CrashStatus,
  BreadcrumbEntry,
  FunnelMilestoneKey,
  TelemetryAnalyticsSummary,
  FunnelStepMetric,
  DropOffPointMetric,
  RetentionCohortBucket,
  DailyEngagementPoint,
  ScreenEngagementMetric
} from '../types/telemetry';

const TELEMETRY_SESSIONS_COLLECTION = 'telemetry_sessions';
const CRASH_REPORTS_COLLECTION = 'crash_reports';

const LOCAL_IDENTITY_KEY = 'tujuane_telemetry_identity_v1';
const LOCAL_SESSIONS_KEY = 'tujuane_telemetry_local_sessions_v1';
const LOCAL_CRASHES_KEY = 'tujuane_telemetry_local_crashes_v1';

const MAX_LOCAL_SESSIONS = 40;
const MAX_LOCAL_CRASHES = 50;
const MAX_BREADCRUMBS = 10;
const MAX_CRASHES_PER_SESSION = 10;
const FLUSH_INTERVAL_MS = 18_000;

interface LocalTelemetryIdentity {
  firstSeenDateKey: string;
  activeDateKeys: string[];
  totalPriorSessions: number;
}

let analyticsInstance: Analytics | null = null;
let initialized = false;
let currentAuthUser: User | null = null;
let currentProfile: UserProfile | null = null;

let sessionId = '';
let sessionStartMs = Date.now();
let currentScreen = 'landing';
let currentScreenEnteredMs = Date.now();
let actionsCount = 0;
let crashCountInSession = 0;
let hasUnsyncedChanges = false;
let lastCloudFlushMs = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

const screensVisitedSet = new Set<string>(['landing']);
const screenDwellMap: Record<string, number> = {};
const funnelMilestonesSet = new Set<FunnelMilestoneKey>(['landing_viewed']);
const breadcrumbs: BreadcrumbEntry[] = [];
const reportedFingerprintsInSession = new Set<string>();

let dropOffStage = 'bounced_on_landing';

function getDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDaysBetweenDateKeys(startKey: string, endKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (!isFinite(start) || !isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function getDeviceType(): string {
  if (typeof window === 'undefined') return 'web';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getViewportString(): string {
  if (typeof window === 'undefined') return '0x0';
  return `${window.innerWidth}x${window.innerHeight}`;
}

function createSafeId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildFingerprint(name: string, message: string, screen: string): string {
  const raw = `${name}:${message.slice(0, 80)}:${screen}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

function loadOrCreateIdentity(): LocalTelemetryIdentity {
  const today = getDateKey();
  if (typeof window === 'undefined') {
    return { firstSeenDateKey: today, activeDateKeys: [today], totalPriorSessions: 0 };
  }
  try {
    const raw = localStorage.getItem(LOCAL_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalTelemetryIdentity;
      const activeSet = new Set(Array.isArray(parsed.activeDateKeys) ? parsed.activeDateKeys : []);
      activeSet.add(today);
      const updated: LocalTelemetryIdentity = {
        firstSeenDateKey: parsed.firstSeenDateKey || today,
        activeDateKeys: Array.from(activeSet).slice(-60),
        totalPriorSessions: (parsed.totalPriorSessions || 0) + 1
      };
      localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(updated));
      return updated;
    }
  } catch {
    // ignore storage errors
  }

  const fresh: LocalTelemetryIdentity = {
    firstSeenDateKey: today,
    activeDateKeys: [today],
    totalPriorSessions: 0
  };
  try {
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(fresh));
  } catch {
    // ignore
  }
  return fresh;
}

let identityCache: LocalTelemetryIdentity | null = null;
function getIdentity(): LocalTelemetryIdentity {
  if (!identityCache) {
    identityCache = loadOrCreateIdentity();
  }
  return identityCache;
}

function addBreadcrumb(type: BreadcrumbEntry['type'], label: string, screen: string = currentScreen): void {
  breadcrumbs.push({
    at: new Date().toISOString(),
    type,
    label: label.slice(0, 120),
    screen: screen.slice(0, 40)
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

function accumulateCurrentScreenDwell(): void {
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.round((now - currentScreenEnteredMs) / 1000));
  if (elapsedSec > 0) {
    screenDwellMap[currentScreen] = Math.min(86400, (screenDwellMap[currentScreen] || 0) + elapsedSec);
  }
  currentScreenEnteredMs = now;
}

function deriveNaturalDropOffStage(): string {
  if (funnelMilestonesSet.has('engaged_action')) {
    return 'completed_core_journey';
  }
  if (funnelMilestonesSet.has('feed_explored')) {
    return 'browsed_feed_no_post';
  }
  if (funnelMilestonesSet.has('auth_completed') && !funnelMilestonesSet.has('profile_completed')) {
    return 'signed_in_incomplete_profile';
  }
  if (funnelMilestonesSet.has('auth_started') && !funnelMilestonesSet.has('auth_completed')) {
    return 'dropped_during_auth';
  }
  if (currentScreen === 'landing') {
    return 'bounced_on_landing';
  }
  return `exited_on_${currentScreen}`;
}

function buildCurrentSessionSnapshot(): TelemetrySession {
  const idInfo = getIdentity();
  const today = getDateKey();
  const daysSince = diffDaysBetweenDateKeys(idInfo.firstSeenDateKey, today);
  const isReturning = daysSince >= 1 || idInfo.totalPriorSessions > 0;
  if (daysSince >= 1) {
    funnelMilestonesSet.add('returned_user');
  }

  const nowIso = new Date().toISOString();
  const durationSec = Math.min(86400, Math.max(0, Math.round((Date.now() - sessionStartMs) / 1000)));

  return {
    id: sessionId || createSafeId('sess'),
    userId: currentAuthUser?.uid || 'anonymous_local',
    userName: currentProfile?.displayName || currentAuthUser?.displayName || 'Citizen Visitor',
    county: currentProfile?.county || 'Kenya',
    startedAt: new Date(sessionStartMs).toISOString(),
    lastActiveAt: nowIso,
    durationSec,
    dateKey: today,
    firstSeenDateKey: idInfo.firstSeenDateKey,
    daysSinceFirstSeen: daysSince,
    isReturningUser: isReturning,
    screensVisited: Array.from(screensVisitedSet).slice(0, 20),
    screenDwellSec: { ...screenDwellMap },
    funnelMilestones: Array.from(funnelMilestonesSet).slice(0, 25),
    dropOffStage: dropOffStage.slice(0, 80),
    lastScreen: currentScreen.slice(0, 60),
    actionsCount,
    deviceType: getDeviceType(),
    viewport: getViewportString(),
    crashCount: crashCountInSession,
    updatedAt: nowIso,
    source: 'local'
  };
}

function saveLocalSessionSnapshot(session: TelemetrySession): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    const list: TelemetrySession[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.unshift(session);
    }
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(list.slice(0, MAX_LOCAL_SESSIONS)));
  } catch {
    // ignore storage quota errors
  }
}

function saveLocalCrashReport(report: CrashReport): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_CRASHES_KEY);
    const list: CrashReport[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((c) => c.id !== report.id);
    filtered.unshift(report);
    localStorage.setItem(LOCAL_CRASHES_KEY, JSON.stringify(filtered.slice(0, MAX_LOCAL_CRASHES)));
  } catch {
    // ignore storage errors
  }
}

export function getLocalTelemetrySnapshot(): {
  sessions: TelemetrySession[];
  crashes: CrashReport[];
} {
  if (typeof window === 'undefined') return { sessions: [], crashes: [] };
  try {
    const sRaw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    const cRaw = localStorage.getItem(LOCAL_CRASHES_KEY);
    return {
      sessions: sRaw ? (JSON.parse(sRaw) as TelemetrySession[]) : [],
      crashes: cRaw ? (JSON.parse(cRaw) as CrashReport[]) : []
    };
  } catch {
    return { sessions: [], crashes: [] };
  }
}

async function flushSessionToFirestore(force = false): Promise<void> {
  if (!sessionId) return;
  accumulateCurrentScreenDwell();
  const snapshot = buildCurrentSessionSnapshot();
  saveLocalSessionSnapshot(snapshot);

  if (!currentAuthUser) return;
  if (!hasUnsyncedChanges && !force) return;
  if (isFirestoreQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const now = Date.now();
  if (!force && now - lastCloudFlushMs < 12_000) return;

  lastCloudFlushMs = now;
  hasUnsyncedChanges = false;

  try {
    const ref = doc(db, TELEMETRY_SESSIONS_COLLECTION, sessionId);
    const payload = {
      id: snapshot.id,
      userId: currentAuthUser.uid,
      userName: (snapshot.userName || 'Citizen Member').slice(0, 100),
      county: (snapshot.county || 'Kenya').slice(0, 50),
      startedAt: snapshot.startedAt,
      lastActiveAt: snapshot.lastActiveAt,
      durationSec: Math.round(snapshot.durationSec),
      dateKey: snapshot.dateKey,
      firstSeenDateKey: snapshot.firstSeenDateKey,
      daysSinceFirstSeen: Math.round(snapshot.daysSinceFirstSeen),
      isReturningUser: Boolean(snapshot.isReturningUser),
      screensVisited: snapshot.screensVisited,
      screenDwellSec: snapshot.screenDwellSec,
      funnelMilestones: snapshot.funnelMilestones,
      dropOffStage: snapshot.dropOffStage,
      lastScreen: snapshot.lastScreen,
      actionsCount: Math.round(snapshot.actionsCount),
      deviceType: snapshot.deviceType,
      viewport: snapshot.viewport,
      crashCount: Math.round(snapshot.crashCount),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded();
    } else {
      console.warn('Telemetry session sync notice:', (err as any)?.message || err);
    }
  }
}

function logGaEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (!analyticsInstance) return;
  try {
    logEvent(analyticsInstance, name, params);
  } catch {
    // ignore analytics error
  }
}

/**
 * Initialize behind-the-scenes analytics & global crash listeners once at app startup.
 */
export function initTelemetryAndCrashReporting(): void {
  if (initialized) return;
  initialized = true;

  sessionId = createSafeId('sess');
  sessionStartMs = Date.now();
  currentScreenEnteredMs = Date.now();
  getIdentity();
  addBreadcrumb('navigation', 'App initialized on landing', 'landing');
  saveLocalSessionSnapshot(buildCurrentSessionSnapshot());

  // Initialize Firebase Analytics SDK if measurementId is present
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    isAnalyticsSupported()
      .then((supported) => {
        if (supported) {
          analyticsInstance = getAnalytics();
          logGaEvent('app_open', { platform: getDeviceType() });
        }
      })
      .catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      const errObj =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || 'Unhandled window runtime error');
      void reportAppCrash({
        error: errObj,
        category: 'runtime',
        severity: 'fatal',
        context: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const errObj =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason || 'Unhandled rejection'));
      void reportAppCrash({
        error: errObj,
        category: 'promise_rejection',
        severity: 'error'
      });
    });

    const handlePageExit = () => {
      dropOffStage = deriveNaturalDropOffStage();
      hasUnsyncedChanges = true;
      void flushSessionToFirestore(true);
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handlePageExit();
      }
    });
    window.addEventListener('pagehide', handlePageExit);

    flushTimer = setInterval(() => {
      if (hasUnsyncedChanges) {
        void flushSessionToFirestore(false);
      }
    }, FLUSH_INTERVAL_MS);
  }
}

export function disposeTelemetryForTests(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Sync signed-in Firebase user & profile details with behind-the-scenes session telemetry.
 */
export function setTelemetryUser(user: User | null, profile: UserProfile | null): void {
  const wasAnonymous = !currentAuthUser;
  currentAuthUser = user;
  currentProfile = profile;

  if (user) {
    funnelMilestonesSet.add('auth_started');
    funnelMilestonesSet.add('auth_completed');
    if (profile?.profileCompleted || profile?.profileCustomized) {
      funnelMilestonesSet.add('profile_completed');
    }
    dropOffStage = deriveNaturalDropOffStage();
    hasUnsyncedChanges = true;
    if (wasAnonymous) {
      addBreadcrumb('action', `Signed in as ${profile?.displayName || user.email || 'citizen'}`);
      void flushSessionToFirestore(true);
    }
  } else {
    saveLocalSessionSnapshot(buildCurrentSessionSnapshot());
  }
}

/**
 * Track screen / tab changes, calculating dwell time on previous screen silently.
 */
export function trackScreenView(screen: string): void {
  if (!initialized) initTelemetryAndCrashReporting();
  if (!screen) return;

  if (screen !== currentScreen) {
    accumulateCurrentScreenDwell();
    currentScreen = screen;
    currentScreenEnteredMs = Date.now();
    screensVisitedSet.add(screen);
    addBreadcrumb('navigation', `Navigated to ${screen}`, screen);
  }

  if (screen === 'community' || screen === 'polls' || screen === 'members' || screen === 'chat') {
    funnelMilestonesSet.add('feed_explored');
  }
  dropOffStage = deriveNaturalDropOffStage();
  hasUnsyncedChanges = true;
  logGaEvent('screen_view', { screen_name: screen });
  saveLocalSessionSnapshot(buildCurrentSessionSnapshot());
}

/**
 * Track funnel progression milestones silently.
 */
export function trackFunnelMilestone(milestone: FunnelMilestoneKey, label?: string): void {
  if (!initialized) initTelemetryAndCrashReporting();
  funnelMilestonesSet.add(milestone);
  actionsCount++;
  addBreadcrumb('action', label || milestone);
  dropOffStage = deriveNaturalDropOffStage();
  hasUnsyncedChanges = true;
  logGaEvent(milestone);
  saveLocalSessionSnapshot(buildCurrentSessionSnapshot());

  // Flush immediately on major conversion milestones
  if (milestone === 'auth_completed' || milestone === 'profile_completed' || milestone === 'engaged_action') {
    void flushSessionToFirestore(true);
  }
}

/**
 * Track explicit user drop-off / modal abandonment points (e.g., abandoned_auth_modal, abandoned_post_composer).
 */
export function trackDropOffPoint(stage: string, label?: string): void {
  if (!initialized) initTelemetryAndCrashReporting();
  if (!funnelMilestonesSet.has('engaged_action')) {
    dropOffStage = stage.slice(0, 80);
  }
  actionsCount++;
  addBreadcrumb('drop_off', label || stage);
  hasUnsyncedChanges = true;
  logGaEvent('funnel_drop_off', { stage });
  saveLocalSessionSnapshot(buildCurrentSessionSnapshot());
}

/**
 * Capture and report real-time errors / crashes with breadcrumbs and stack traces.
 */
export async function reportAppCrash(params: {
  error: unknown;
  category?: CrashCategory;
  severity?: CrashSeverity;
  componentStack?: string;
  context?: string;
  forceBypassDedupe?: boolean;
}): Promise<CrashReport | null> {
  if (!initialized) initTelemetryAndCrashReporting();

  const err = params.error;
  const name =
    err instanceof Error && err.name
      ? err.name.slice(0, 120)
      : params.category === 'manual_test'
      ? 'DiagnosticTestError'
      : 'ApplicationError';
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : String(err || 'Unknown error');
  const message = (params.context ? `${rawMessage} (${params.context})` : rawMessage).slice(0, 1000) || 'Unknown error';

  // Suppress noise from Firestore quota warnings so they don't flood crash reports
  if (isFirestoreQuotaError(err) || message.includes('Database daily free read quota reached')) {
    return null;
  }

  const category = params.category || 'runtime';
  const severity = params.severity || 'error';
  const fingerprint = buildFingerprint(name, message, currentScreen);

  if (!params.forceBypassDedupe && reportedFingerprintsInSession.has(fingerprint)) {
    return null;
  }
  if (!params.forceBypassDedupe && crashCountInSession >= MAX_CRASHES_PER_SESSION) {
    return null;
  }

  reportedFingerprintsInSession.add(fingerprint);
  crashCountInSession++;
  hasUnsyncedChanges = true;

  addBreadcrumb('error', `${name}: ${message.slice(0, 80)}`, currentScreen);

  const crashId = createSafeId('crash');
  const stackStr =
    err instanceof Error && err.stack ? err.stack.slice(0, 6000) : undefined;
  const nowIso = new Date().toISOString();

  const report: CrashReport = {
    id: crashId,
    fingerprint,
    userId: currentAuthUser?.uid || 'anonymous_local',
    userName: currentProfile?.displayName || currentAuthUser?.displayName || 'Citizen Visitor',
    sessionId: sessionId || 'local_session',
    message,
    name,
    stack: stackStr,
    componentStack: params.componentStack ? params.componentStack.slice(0, 4000) : undefined,
    category,
    severity,
    screen: currentScreen.slice(0, 60),
    breadcrumbs: [...breadcrumbs],
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : undefined,
    viewport: getViewportString(),
    status: 'open',
    createdAt: nowIso,
    source: 'local'
  };

  saveLocalCrashReport(report);
  saveLocalSessionSnapshot(buildCurrentSessionSnapshot());
  logGaEvent('exception', { description: message.slice(0, 100), fatal: severity === 'fatal' });

  if (
    currentAuthUser &&
    !isFirestoreQuotaExceeded() &&
    (typeof navigator === 'undefined' || navigator.onLine !== false)
  ) {
    try {
      const crashRef = doc(db, CRASH_REPORTS_COLLECTION, crashId);
      const cloudPayload: Record<string, unknown> = {
        id: report.id,
        fingerprint: report.fingerprint,
        userId: currentAuthUser.uid,
        userName: (report.userName || 'Citizen Member').slice(0, 100),
        sessionId: report.sessionId,
        message: report.message,
        name: report.name,
        category: report.category,
        severity: report.severity,
        screen: report.screen,
        breadcrumbs: report.breadcrumbs,
        viewport: report.viewport || getViewportString(),
        status: 'open',
        createdAt: serverTimestamp()
      };
      if (report.stack) cloudPayload.stack = report.stack;
      if (report.componentStack) cloudPayload.componentStack = report.componentStack;
      if (report.userAgent) cloudPayload.userAgent = report.userAgent;

      await setDoc(crashRef, cloudPayload);
      void flushSessionToFirestore(true);
    } catch (writeErr) {
      if (isFirestoreQuotaError(writeErr)) {
        markFirestoreQuotaExceeded();
      } else {
        console.warn('Crash report cloud write skipped:', (writeErr as any)?.message || writeErr);
      }
    }
  }

  return report;
}

/**
 * Subscribe to real-time Telemetry Sessions (Developer Panel only).
 */
export function subscribeToTelemetrySessions(
  callback: (sessions: TelemetrySession[]) => void
): () => void {
  const localInitial = getLocalTelemetrySnapshot().sessions;
  if (isFirestoreQuotaExceeded()) {
    callback(localInitial);
    return () => {};
  }

  const q = query(
    collection(db, TELEMETRY_SESSIONS_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(80)
  );

  return onSnapshot(
    q,
    (snap) => {
      const cloudSessions: TelemetrySession[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId || '',
          userName: data.userName || 'Citizen Member',
          county: data.county || 'Kenya',
          startedAt: typeof data.startedAt === 'string' ? data.startedAt : new Date().toISOString(),
          lastActiveAt: typeof data.lastActiveAt === 'string' ? data.lastActiveAt : new Date().toISOString(),
          durationSec: typeof data.durationSec === 'number' ? data.durationSec : 0,
          dateKey: data.dateKey || getDateKey(),
          firstSeenDateKey: data.firstSeenDateKey || data.dateKey || getDateKey(),
          daysSinceFirstSeen: typeof data.daysSinceFirstSeen === 'number' ? data.daysSinceFirstSeen : 0,
          isReturningUser: Boolean(data.isReturningUser),
          screensVisited: Array.isArray(data.screensVisited) ? data.screensVisited : [],
          screenDwellSec: data.screenDwellSec && typeof data.screenDwellSec === 'object' ? data.screenDwellSec : {},
          funnelMilestones: Array.isArray(data.funnelMilestones) ? data.funnelMilestones : [],
          dropOffStage: data.dropOffStage || 'unknown',
          lastScreen: data.lastScreen || 'landing',
          actionsCount: typeof data.actionsCount === 'number' ? data.actionsCount : 0,
          deviceType: data.deviceType || 'web',
          viewport: data.viewport || '',
          crashCount: typeof data.crashCount === 'number' ? data.crashCount : 0,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
          source: 'cloud'
        };
      });

      const mergedMap = new Map<string, TelemetrySession>();
      for (const s of cloudSessions) {
        mergedMap.set(s.id, s);
      }
      for (const local of getLocalTelemetrySnapshot().sessions) {
        if (!mergedMap.has(local.id)) {
          mergedMap.set(local.id, local);
        }
      }
      callback(
        Array.from(mergedMap.values()).sort(
          (a, b) => Date.parse(b.updatedAt || b.lastActiveAt) - Date.parse(a.updatedAt || a.lastActiveAt)
        )
      );
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.GET, TELEMETRY_SESSIONS_COLLECTION, () => {
        callback(getLocalTelemetrySnapshot().sessions);
      });
    }
  );
}

/**
 * Subscribe to real-time Crash Reports (Developer Panel only).
 */
export function subscribeToCrashReports(
  callback: (reports: CrashReport[]) => void
): () => void {
  const localInitial = getLocalTelemetrySnapshot().crashes;
  if (isFirestoreQuotaExceeded()) {
    callback(localInitial);
    return () => {};
  }

  const q = query(
    collection(db, CRASH_REPORTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(60)
  );

  return onSnapshot(
    q,
    (snap) => {
      const cloudReports: CrashReport[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fingerprint: data.fingerprint || d.id,
          userId: data.userId || '',
          userName: data.userName || 'Citizen Member',
          sessionId: data.sessionId || '',
          message: data.message || 'Unknown error',
          name: data.name || 'Error',
          stack: data.stack || undefined,
          componentStack: data.componentStack || undefined,
          category: (data.category as CrashCategory) || 'runtime',
          severity: (data.severity as CrashSeverity) || 'error',
          screen: data.screen || 'unknown',
          breadcrumbs: Array.isArray(data.breadcrumbs) ? data.breadcrumbs : [],
          userAgent: data.userAgent || undefined,
          viewport: data.viewport || undefined,
          status: (data.status as CrashStatus) || 'open',
          resolvedBy: data.resolvedBy || undefined,
          resolvedAt: data.resolvedAt?.toDate
            ? data.resolvedAt.toDate().toISOString()
            : typeof data.resolvedAt === 'string'
            ? data.resolvedAt
            : undefined,
          developerNotes: data.developerNotes || undefined,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
          source: 'cloud'
        };
      });

      const mergedMap = new Map<string, CrashReport>();
      for (const r of cloudReports) {
        mergedMap.set(r.id, r);
      }
      for (const local of getLocalTelemetrySnapshot().crashes) {
        if (!mergedMap.has(local.id)) {
          mergedMap.set(local.id, local);
        }
      }
      callback(
        Array.from(mergedMap.values()).sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
        )
      );
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.GET, CRASH_REPORTS_COLLECTION, () => {
        callback(getLocalTelemetrySnapshot().crashes);
      });
    }
  );
}

/**
 * Update a crash report status (resolved / ignored / open) from the Developer Panel.
 */
export async function updateCrashReportStatus(
  crashId: string,
  status: CrashStatus,
  developerEmail: string,
  developerNotes?: string
): Promise<void> {
  // Update local buffer immediately
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CRASHES_KEY);
      if (raw) {
        const list = (JSON.parse(raw) as CrashReport[]).map((c) =>
          c.id === crashId
            ? {
                ...c,
                status,
                resolvedBy: developerEmail,
                resolvedAt: new Date().toISOString(),
                developerNotes
              }
            : c
        );
        localStorage.setItem(LOCAL_CRASHES_KEY, JSON.stringify(list));
      }
    } catch {
      // ignore
    }
  }

  if (isFirestoreQuotaExceeded()) return;
  try {
    const ref = doc(db, CRASH_REPORTS_COLLECTION, crashId);
    const updatePayload: Record<string, unknown> = {
      status,
      resolvedBy: developerEmail.slice(0, 128),
      resolvedAt: new Date().toISOString()
    };
    if (developerNotes !== undefined) {
      updatePayload.developerNotes = developerNotes.slice(0, 500);
    }
    await updateDoc(ref, updatePayload);
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded();
    } else {
      console.warn('Could not update cloud crash status (may be local-only):', (err as any)?.message || err);
    }
  }
}

export async function deleteCrashReportRecord(crashId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CRASHES_KEY);
      if (raw) {
        const list = (JSON.parse(raw) as CrashReport[]).filter((c) => c.id !== crashId);
        localStorage.setItem(LOCAL_CRASHES_KEY, JSON.stringify(list));
      }
    } catch {
      // ignore
    }
  }

  if (isFirestoreQuotaExceeded()) return;
  try {
    await deleteDoc(doc(db, CRASH_REPORTS_COLLECTION, crashId));
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded();
    }
  }
}

const FUNNEL_STAGE_DEFS: Array<{
  key: FunnelMilestoneKey;
  label: string;
  description: string;
}> = [
  {
    key: 'landing_viewed',
    label: '1. App Visit',
    description: 'Landed on TUJUANE Hub'
  },
  {
    key: 'auth_started',
    label: '2. Auth Started',
    description: 'Opened Sign-In or Registration'
  },
  {
    key: 'auth_completed',
    label: '3. Signed In',
    description: 'Authenticated Firebase citizen account'
  },
  {
    key: 'profile_completed',
    label: '4. Profile Ready',
    description: 'Completed / customized citizen profile'
  },
  {
    key: 'feed_explored',
    label: '5. Explored App',
    description: 'Visited Feed, Polls, Directory, or Chat'
  },
  {
    key: 'engaged_action',
    label: '6. Core Action',
    description: 'Posted, commented, reacted, voted, or chatted'
  },
  {
    key: 'returned_user',
    label: '7. Retained (D1+)',
    description: 'Returned on a subsequent day'
  }
];

const SCREEN_LABELS: Record<string, string> = {
  landing: 'Hub Landing',
  community: 'Community Feed',
  polls: 'Daily Polls',
  chat: 'Messaging Hub',
  members: 'Citizen Directory',
  'dev-panel': 'Developer Panel'
};

const DROP_OFF_LABELS: Record<string, string> = {
  completed_core_journey: 'Completed Core Journey (Active)',
  bounced_on_landing: 'Dropped on Hub Landing (No Auth)',
  dropped_during_auth: 'Abandoned Sign-In / Sign-Up Modal',
  abandoned_auth_modal: 'Closed Auth Modal Before Login',
  signed_in_incomplete_profile: 'Stopped Before Completing Profile',
  abandoned_profile_setup: 'Closed Profile Editor Without Saving',
  abandoned_post_composer: 'Abandoned Post Creation Modal',
  browsed_feed_no_post: 'Browsed Feed (Lurked, No Action)',
  exited_on_community: 'Exited While Viewing Feed',
  exited_on_chat: 'Exited Inside Chat Hub',
  exited_on_polls: 'Exited on Daily Polls',
  exited_on_members: 'Exited on Citizen Directory'
};

/**
 * Aggregate live Telemetry Sessions, Registered Users, and Crash Reports into
 * actionable drop-off funnel, retention cohort, and stability metrics.
 */
export function computeAnalyticsSummary(
  sessions: TelemetrySession[],
  users: UserProfile[],
  crashes: CrashReport[]
): TelemetryAnalyticsSummary {
  const now = new Date();
  const todayKey = getDateKey(now);
  const sevenDaysAgoMs = now.getTime() - 7 * 86_400_000;
  const thirtyDaysAgoMs = now.getTime() - 30 * 86_400_000;

  // Compute DAU / WAU / MAU from both sessions and live user lastSeen timestamps
  const dauUserIds = new Set<string>();
  const wauUserIds = new Set<string>();
  const mauUserIds = new Set<string>();

  for (const s of sessions) {
    const uid = s.userId || s.id;
    const ms = Date.parse(s.lastActiveAt || s.updatedAt || s.startedAt);
    if (s.dateKey === todayKey) dauUserIds.add(uid);
    if (isFinite(ms) && ms >= sevenDaysAgoMs) wauUserIds.add(uid);
    if (isFinite(ms) && ms >= thirtyDaysAgoMs) mauUserIds.add(uid);
  }

  for (const u of users) {
    const lastSeenMs = u.lastSeen ? Date.parse(u.lastSeen) : 0;
    if (!lastSeenMs) continue;
    if (getDateKey(new Date(lastSeenMs)) === todayKey) dauUserIds.add(u.uid);
    if (lastSeenMs >= sevenDaysAgoMs) wauUserIds.add(u.uid);
    if (lastSeenMs >= thirtyDaysAgoMs) mauUserIds.add(u.uid);
  }

  const returningSessions = sessions.filter((s) => s.isReturningUser).length;
  const returningUserPct =
    sessions.length > 0
      ? Math.round((returningSessions / sessions.length) * 100)
      : users.length > 0
      ? Math.round(
          (users.filter((u) => {
            const created = u.createdAt ? Date.parse(u.createdAt) : 0;
            const seen = u.lastSeen ? Date.parse(u.lastSeen) : 0;
            return created > 0 && seen - created >= 86_400_000;
          }).length /
            users.length) *
            100
        )
      : 0;

  const totalDuration = sessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);
  const avgSessionDurationSec =
    sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0;

  const crashedSessions = sessions.filter((s) => (s.crashCount || 0) > 0).length;
  const crashFreeSessionPct =
    sessions.length > 0
      ? Math.max(0, Math.round(((sessions.length - crashedSessions) / sessions.length) * 1000) / 10)
      : crashes.filter((c) => c.status === 'open').length === 0
      ? 100
      : 95;

  // Funnel steps
  const totalBase = Math.max(1, sessions.length);
  const stepCounts = FUNNEL_STAGE_DEFS.map((def) => {
    const count = sessions.filter((s) => {
      if (s.funnelMilestones.includes(def.key)) return true;
      // Progressive inference so downstream actions imply earlier stages
      if (def.key === 'landing_viewed') return true;
      if (def.key === 'auth_started') {
        return s.funnelMilestones.includes('auth_completed') || s.userId !== 'anonymous_local';
      }
      if (def.key === 'auth_completed') return s.userId !== 'anonymous_local';
      return false;
    }).length;
    return { ...def, count };
  });

  // Enforce monotonic funnel floor for clean top-to-bottom progression
  let runningPrev = totalBase;
  const funnelSteps: FunnelStepMetric[] = stepCounts.map((step, idx) => {
    const prevCount = idx === 0 ? Math.max(step.count, 1) : runningPrev;
    const boundedCount = idx === 0 ? Math.max(step.count, sessions.length) : Math.min(prevCount, step.count);
    const dropOffCount = idx === 0 ? 0 : Math.max(0, prevCount - boundedCount);
    const dropOffPct =
      idx === 0 || prevCount === 0 ? 0 : Math.round((dropOffCount / prevCount) * 100);
    const conversionPct =
      sessions.length === 0 ? 0 : Math.round((boundedCount / Math.max(1, stepCounts[0].count || sessions.length)) * 100);
    runningPrev = boundedCount;
    return {
      key: step.key,
      label: step.label,
      description: step.description,
      count: boundedCount,
      conversionPct,
      dropOffCount,
      dropOffPct
    };
  });

  const highestDropOffStep =
    funnelSteps
      .slice(1)
      .filter((s) => s.dropOffCount > 0)
      .sort((a, b) => b.dropOffPct - a.dropOffPct)[0] || null;

  const overallFunnelConversionPct =
    funnelSteps.length >= 6 && funnelSteps[0].count > 0
      ? Math.round((funnelSteps[5].count / funnelSteps[0].count) * 100)
      : 0;

  // Drop-off stages summary
  const dropOffCounts = new Map<string, number>();
  for (const s of sessions) {
    const st = s.dropOffStage || 'unknown';
    dropOffCounts.set(st, (dropOffCounts.get(st) || 0) + 1);
  }
  const dropOffPoints: DropOffPointMetric[] = Array.from(dropOffCounts.entries())
    .map(([stage, count]) => ({
      stage,
      label: DROP_OFF_LABELS[stage] || stage.replace(/_/g, ' '),
      count,
      sharePct: Math.round((count / Math.max(1, sessions.length)) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // Retention Cohort Buckets (combining sessions + registered citizen account age/lastSeen)
  const retentionDefs = [
    { label: 'Day 0 (Signup / First Visit)', minDays: 0 },
    { label: 'Day 1+ Retention', minDays: 1 },
    { label: 'Day 3+ Retention', minDays: 3 },
    { label: 'Day 7+ Retention', minDays: 7 },
    { label: 'Day 14+ Retention', minDays: 14 }
  ];

  const retentionBuckets: RetentionCohortBucket[] = retentionDefs.map((bucket) => {
    // Combine telemetry sessions + registered user history
    const eligibleUserSet = new Set<string>();
    const retainedUserSet = new Set<string>();

    for (const u of users) {
      const createdMs = u.createdAt ? Date.parse(u.createdAt) : 0;
      const lastSeenMs = u.lastSeen ? Date.parse(u.lastSeen) : 0;
      if (!createdMs) continue;
      const accountAgeDays = Math.floor((now.getTime() - createdMs) / 86_400_000);
      if (accountAgeDays >= bucket.minDays) {
        eligibleUserSet.add(u.uid);
        if (lastSeenMs && Math.floor((lastSeenMs - createdMs) / 86_400_000) >= bucket.minDays) {
          retainedUserSet.add(u.uid);
        }
      }
    }

    for (const s of sessions) {
      const uid = s.userId || s.id;
      const firstMs = Date.parse(`${s.firstSeenDateKey}T00:00:00Z`);
      const ageFromFirst = isFinite(firstMs)
        ? Math.max(0, Math.floor((now.getTime() - firstMs) / 86_400_000))
        : 0;
      if (ageFromFirst >= bucket.minDays || (s.daysSinceFirstSeen || 0) >= bucket.minDays) {
        eligibleUserSet.add(uid);
        if ((s.daysSinceFirstSeen || 0) >= bucket.minDays) {
          retainedUserSet.add(uid);
        }
      }
    }

    const eligibleUsers = eligibleUserSet.size;
    const retainedUsers = retainedUserSet.size;
    return {
      label: bucket.label,
      retainedUsers,
      eligibleUsers,
      retentionPct: eligibleUsers > 0 ? Math.round((retainedUsers / eligibleUsers) * 100) : 0
    };
  });

  // 7-day Daily Engagement Trend
  const dailyTrend: DailyEngagementPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const dk = getDateKey(d);
    const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const daySessions = sessions.filter((s) => s.dateKey === dk);
    const dayUsers = new Set<string>(daySessions.map((s) => s.userId || s.id));

    for (const u of users) {
      if (u.lastSeen && getDateKey(new Date(u.lastSeen)) === dk) {
        dayUsers.add(u.uid);
      }
    }

    const dayCrashes = crashes.filter(
      (c) => c.createdAt && getDateKey(new Date(c.createdAt)) === dk
    ).length;

    dailyTrend.push({
      dateKey: dk,
      label,
      dau: dayUsers.size,
      sessions: daySessions.length,
      returningUsers: daySessions.filter((s) => s.isReturningUser).length,
      crashes: dayCrashes
    });
  }

  // Screen breakdown
  const screenAgg = new Map<string, { visits: number; totalDwell: number; exits: number }>();
  for (const s of sessions) {
    for (const sc of s.screensVisited) {
      const entry = screenAgg.get(sc) || { visits: 0, totalDwell: 0, exits: 0 };
      entry.visits++;
      entry.totalDwell += s.screenDwellSec?.[sc] || 0;
      if (s.lastScreen === sc) entry.exits++;
      screenAgg.set(sc, entry);
    }
  }
  const screenMetrics: ScreenEngagementMetric[] = Array.from(screenAgg.entries())
    .map(([screen, stats]) => ({
      screen,
      label: SCREEN_LABELS[screen] || screen,
      visits: stats.visits,
      avgDwellSec: stats.visits > 0 ? Math.round(stats.totalDwell / stats.visits) : 0,
      exitCount: stats.exits
    }))
    .sort((a, b) => b.visits - a.visits);

  return {
    totalSessions: sessions.length,
    dau: dauUserIds.size,
    wau: wauUserIds.size,
    mau: mauUserIds.size,
    returningUserPct,
    avgSessionDurationSec,
    crashFreeSessionPct,
    overallFunnelConversionPct,
    highestDropOffStep,
    funnelSteps,
    dropOffPoints,
    retentionBuckets,
    dailyTrend,
    screenMetrics
  };
}
