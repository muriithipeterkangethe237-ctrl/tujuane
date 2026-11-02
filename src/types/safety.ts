export type SafetyCategory =
  | 'nudity'
  | 'misleading'
  | 'incitement'
  | 'dangerous'
  | 'spam'
  | 'harassment';

export type SafetySeverity = 'clean' | 'low' | 'medium' | 'high';

export interface SafetyScanResult {
  isSafe: boolean;
  severity: SafetySeverity;
  triggeredCategories: SafetyCategory[];
  flagReason?: string;
  matchedKeywords: string[];
  confidence: number;
  recommendation: 'allow' | 'warn' | 'block';
}

export interface SafetyReport {
  id: string;
  postId: string;
  postTitle: string;
  postSnippet?: string;
  authorId: string;
  authorName: string;
  reporterId: string;
  reporterName: string;
  category: SafetyCategory;
  details?: string;
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  actionTaken?: string;
}

export interface ModeratorActionLog {
  id: string;
  moderatorEmail: string;
  actionType: 'delete_post' | 'approve_post' | 'attach_advisory' | 'warn_user' | 'dismiss_report';
  targetId: string;
  targetType: 'post' | 'user' | 'report';
  details?: string;
  timestamp: string;
}
