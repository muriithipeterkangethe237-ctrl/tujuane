export type NotificationCategory = 'post_interaction' | 'account_status' | 'social' | 'direct_chat';

export type NotificationType =
  // Post Interactions
  | 'post_like'
  | 'post_comment'
  | 'post_advisory'
  | 'post_removed'
  | 'post_approved'
  // Account Status & Trust
  | 'account_status'
  | 'account_verified'
  | 'account_warning'
  | 'account_good_standing'
  // Social & Community
  | 'friend_request'
  | 'friend_request_accepted'
  | 'new_follower'
  // Direct Messages
  | 'direct_message';

export type NotificationFilterType =
  | 'all'
  | 'post_like'
  | 'post_comment'
  | 'direct_message'
  | 'friend_request'
  | 'new_follower'
  | 'account_status'
  | 'safety';

export interface NotificationPreferences {
  pushEnabled: boolean;
  soundEnabled: boolean;
  inAppBannerEnabled: boolean;
  typePreferences: {
    post_like: boolean;
    post_comment: boolean;
    direct_message: boolean;
    friend_request: boolean;
    friend_request_accepted: boolean;
    new_follower: boolean;
    account_status: boolean;
    post_advisory: boolean;
  };
}

export interface UserNotification {
  id: string;
  userId: string; // The recipient user UID
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO string
  postId?: string;
  postTitle?: string;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string;
  actorCounty?: string;
  accountStatus?: 'good' | 'warning' | 'restricted' | 'verified';
  badgeAwarded?: string;
  details?: string;
}

export interface AccountStandingSummary {
  status: 'good' | 'warning' | 'restricted' | 'verified';
  title: string;
  description: string;
  verifiedCitizen: boolean;
  score: number; // 0 - 100 trust score
  warningCount: number;
  advisoryCount: number;
  totalPosts: number;
  totalUpvotes: number;
}

