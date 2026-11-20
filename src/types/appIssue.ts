export type AppIssueCategory =
  | 'bug'
  | 'ui_glitch'
  | 'video_audio'
  | 'performance'
  | 'account_auth'
  | 'notifications'
  | 'feature_request'
  | 'other';

export type AppIssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AppIssueStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export interface AppIssueReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reporterEmail?: string;
  reporterCounty?: string;
  category: AppIssueCategory;
  severity: AppIssueSeverity;
  title: string;
  description: string;
  currentScreen?: string;
  deviceInfo?: string;
  status: AppIssueStatus;
  developerNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface SubmitAppIssueParams {
  category: AppIssueCategory;
  severity: AppIssueSeverity;
  title: string;
  description: string;
  currentScreen?: string;
}
