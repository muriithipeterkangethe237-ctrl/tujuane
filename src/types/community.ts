export type PostCategory =
  | 'general'
  | 'discussion'
  | 'hustle'
  | 'local_news'
  | 'meetup'
  | 'campus'
  | 'question'
  | 'speed_report'
  | 'hotspot_tip'
  | 'outage_alert';

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorCounty?: string;
  title: string;
  content: string;
  category: PostCategory;
  county?: string; // Optional: empty string or omitted if untagged
  constituency?: string;
  hotspotId?: string;
  hotspotName?: string;
  speedMbps?: number;
  mediaUrl?: string; // base64 compressed data URI
  mediaCaption?: string;
  upvotes: number;
  upvoters: string[]; // list of user UIDs who upvoted
  commentsCount: number;
  // Community Safety & Moderation fields
  isFlagged?: boolean;
  safetyCategory?: 'nudity' | 'misleading' | 'incitement' | 'dangerous' | 'spam';
  safetyReason?: string;
  safetyAdvisory?: string;
  moderationStatus?: 'approved' | 'under_review' | 'flagged' | 'removed';
  reportCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  content: string;
  mediaUrl?: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
  createdAt: string;
}

export interface CreatePostParams {
  title?: string; // Optional: auto-generated from content caption if omitted
  content: string;
  category?: PostCategory; // Optional: defaults to 'general'
  county?: string; // Optional: untagged if omitted
  constituency?: string;
  hotspotId?: string;
  hotspotName?: string;
  speedMbps?: number;
  mediaUrl?: string;
  mediaCaption?: string;
}
