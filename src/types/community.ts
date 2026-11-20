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

export type PostBackgroundColor =
  | 'default'
  | 'emerald'
  | 'crimson'
  | 'navy'
  | 'purple'
  | 'amber'
  | 'teal'
  | 'blue'
  | 'rose'
  | 'indigo';

export interface SolidColorOption {
  id: PostBackgroundColor;
  name: string;
  bgClass: string;
  previewBg: string;
}

export const SOLID_POST_BACKGROUNDS: SolidColorOption[] = [
  { id: 'default', name: 'Default', bgClass: '', previewBg: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'emerald', name: 'Kenya Emerald', bgClass: 'bg-emerald-600 dark:bg-emerald-700 text-white', previewBg: 'bg-emerald-600' },
  { id: 'crimson', name: 'Maasai Red', bgClass: 'bg-red-600 dark:bg-red-700 text-white', previewBg: 'bg-red-600' },
  { id: 'navy', name: 'Midnight Navy', bgClass: 'bg-slate-900 dark:bg-slate-950 text-white', previewBg: 'bg-slate-900' },
  { id: 'purple', name: 'Royal Purple', bgClass: 'bg-purple-700 dark:bg-purple-800 text-white', previewBg: 'bg-purple-700' },
  { id: 'amber', name: 'Sunset Amber', bgClass: 'bg-amber-600 dark:bg-amber-700 text-white', previewBg: 'bg-amber-600' },
  { id: 'teal', name: 'Coastal Teal', bgClass: 'bg-teal-600 dark:bg-teal-700 text-white', previewBg: 'bg-teal-600' },
  { id: 'blue', name: 'Civic Blue', bgClass: 'bg-blue-600 dark:bg-blue-700 text-white', previewBg: 'bg-blue-600' },
  { id: 'rose', name: 'Vibrant Rose', bgClass: 'bg-rose-600 dark:bg-rose-700 text-white', previewBg: 'bg-rose-600' },
  { id: 'indigo', name: 'Deep Indigo', bgClass: 'bg-indigo-700 dark:bg-indigo-800 text-white', previewBg: 'bg-indigo-700' }
];

export const REACTION_TYPES = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'fire', emoji: '🔥', label: 'Moto' },
  { key: 'clap', emoji: '👏', label: 'Makofi' },
  { key: 'respect', emoji: '🤝', label: 'Heshima' },
  { key: 'idea', emoji: '💡', label: 'Idea' },
  { key: 'facts', emoji: '💯', label: '100%' },
  { key: 'haha', emoji: '😂', label: 'Haha' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'pray', emoji: '🙏', label: 'Shukrani' },
  { key: 'celebrate', emoji: '🎉', label: 'Shangwe' },
  { key: 'sad', emoji: '😢', label: 'Pole' },
  { key: 'lion', emoji: '🦁', label: 'Simba' },
  { key: 'kenya', emoji: '🇰🇪', label: 'Kenya' }
] as const;

export type ReactionKey = typeof REACTION_TYPES[number]['key'];

export type PostMediaType = 'image' | 'video' | 'audio';

export type SoundMixMode = 'replace' | 'mix';

export interface PostedVideoSound {
  /** Post ID of the posted video whose audio stream we decode & reuse */
  postId: string;
  /** Original root sound post ID if this video reused another video's sound */
  sourceSoundPostId?: string;
  soundTitle: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  thumbnailDataUrl?: string;
  duration?: number;
  videoMimeType?: string;
  videoChunkCount?: number;
  mediaUrl?: string;
  resolvedPlayableUrl?: string;
}

export function buildSoundFromPost(post: CommunityPost, overrideAuthorName?: string): PostedVideoSound {
  const authorName = post.soundAuthorName || overrideAuthorName || post.authorName || 'Citizen Creator';
  const genericTitles = new Set([
    'Citizen Short Video',
    'Citizen Video Update',
    'Citizen Post',
    'Community Update'
  ]);
  const candidateTitle =
    post.soundTitle ||
    (post.title && !genericTitles.has(post.title) ? post.title : '') ||
    (post.mediaCaption || '') ||
    `Original sound · ${authorName}`;

  return {
    postId: post.id,
    sourceSoundPostId: post.soundSourcePostId || post.id,
    soundTitle: candidateTitle.trim().slice(0, 140),
    authorId: post.soundAuthorId || post.authorId,
    authorName: authorName.slice(0, 100),
    authorPhotoUrl: post.authorPhotoUrl,
    thumbnailDataUrl: post.videoThumbnail,
    duration: post.videoDuration,
    videoMimeType: post.videoMimeType,
    videoChunkCount: post.videoChunkCount,
    mediaUrl: post.mediaUrl
  };
}

export interface TaggedUserRef {
  uid: string;
  displayName: string;
}

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
  mediaUrl?: string; // base64 compressed data URI (image, audio, or small inline video)
  mediaType?: PostMediaType;
  mediaCaption?: string;
  videoThumbnail?: string;
  videoDuration?: number;
  videoSizeBytes?: number;
  videoChunkCount?: number;
  videoMimeType?: string;
  videoStatus?: 'ready' | 'uploading';
  audioDuration?: number;
  audioSizeBytes?: number;
  audioMimeType?: string;
  soundSourcePostId?: string;
  soundTitle?: string;
  soundAuthorId?: string;
  soundAuthorName?: string;
  hashtags?: string[];
  taggedUsers?: TaggedUserRef[];
  backgroundColor?: PostBackgroundColor | string;
  upvotes: number;
  upvoters: string[]; // list of user UIDs who upvoted
  reactions?: Record<string, ReactionKey | string>; // userId -> reactionKey (strictly one reaction per user)
  reactionsCount?: Record<string, number>; // reactionKey -> total count
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
  taggedUsers?: TaggedUserRef[];
  reactions?: Record<string, ReactionKey | string>; // userId -> reactionKey (strictly one reaction per user)
  reactionsCount?: Record<string, number>; // reactionKey -> total count
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
  mediaType?: PostMediaType;
  mediaCaption?: string;
  videoThumbnail?: string;
  videoDuration?: number;
  videoSizeBytes?: number;
  videoMimeType?: string;
  videoChunks?: string[];
  audioDuration?: number;
  audioSizeBytes?: number;
  audioMimeType?: string;
  soundSourcePostId?: string;
  soundTitle?: string;
  soundAuthorId?: string;
  soundAuthorName?: string;
  hashtags?: string[];
  taggedUsers?: TaggedUserRef[];
  backgroundColor?: PostBackgroundColor | string;
}
