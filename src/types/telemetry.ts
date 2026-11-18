export type FunnelMilestoneKey =
  | 'landing_viewed'
  | 'auth_started'
  | 'auth_completed'
  | 'profile_completed'
  | 'feed_explored'
  | 'engaged_action'
  | 'returned_user';

export type CrashCategory =
  | 'runtime'
  | 'promise_rejection'
  | 'react_boundary'
  | 'media_playback'
  | 'network_api'
  | 'firestore'
  | 'manual_test';

export type CrashSeverity = 'fatal' | 'error' | 'warning';

export type CrashStatus = 'open' | 'resolved' | 'ignored';

export interface BreadcrumbEntry {
  at: string;
  type: 'navigation' | 'action' | 'drop_off' | 'error';
  label: string;
  screen: string;
}

export interface TelemetrySession {
  id: string;
  userId: string;
  userName?: string;
  county?: string;
  startedAt: string;
  lastActiveAt: string;
  durationSec: number;
  dateKey: string;
  firstSeenDateKey: string;
  daysSinceFirstSeen: number;
  isReturningUser: boolean;
  screensVisited: string[];
  screenDwellSec: Record<string, number>;
  funnelMilestones: FunnelMilestoneKey[];
  dropOffStage: string;
  lastScreen: string;
  actionsCount: number;
  deviceType: string;
  viewport: string;
  crashCount: number;
  updatedAt: string;
  source?: 'cloud' | 'local';
}

export interface CrashReport {
  id: string;
  fingerprint: string;
  userId: string;
  userName?: string;
  sessionId: string;
  message: string;
  name: string;
  stack?: string;
  componentStack?: string;
  category: CrashCategory;
  severity: CrashSeverity;
  screen: string;
  breadcrumbs: BreadcrumbEntry[];
  userAgent?: string;
  viewport?: string;
  status: CrashStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  developerNotes?: string;
  createdAt: string;
  source?: 'cloud' | 'local';
}

export interface FunnelStepMetric {
  key: FunnelMilestoneKey;
  label: string;
  description: string;
  count: number;
  conversionPct: number;
  dropOffCount: number;
  dropOffPct: number;
}

export interface DropOffPointMetric {
  stage: string;
  label: string;
  count: number;
  sharePct: number;
}

export interface RetentionCohortBucket {
  label: string;
  retainedUsers: number;
  eligibleUsers: number;
  retentionPct: number;
}

export interface DailyEngagementPoint {
  dateKey: string;
  label: string;
  dau: number;
  sessions: number;
  returningUsers: number;
  crashes: number;
}

export interface ScreenEngagementMetric {
  screen: string;
  label: string;
  visits: number;
  avgDwellSec: number;
  exitCount: number;
}

export interface TelemetryAnalyticsSummary {
  totalSessions: number;
  dau: number;
  wau: number;
  mau: number;
  returningUserPct: number;
  avgSessionDurationSec: number;
  crashFreeSessionPct: number;
  overallFunnelConversionPct: number;
  highestDropOffStep: FunnelStepMetric | null;
  funnelSteps: FunnelStepMetric[];
  dropOffPoints: DropOffPointMetric[];
  retentionBuckets: RetentionCohortBucket[];
  dailyTrend: DailyEngagementPoint[];
  screenMetrics: ScreenEngagementMetric[];
}
