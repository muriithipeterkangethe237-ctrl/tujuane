export type StoryMediaType = 'image' | 'video';

export interface CitizenStory {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorCounty?: string;
  type: StoryMediaType;
  mediaUrl: string; // compressed data URI (photo or video)
  caption?: string;
  duration?: number; // duration in seconds (e.g. 6s for image, up to 30s for video)
  viewers: string[]; // UIDs of users who viewed this story
  viewsCount: number;
  reactions?: Record<string, string>; // userId -> emoji (e.g. 🔥, ❤️, 👏, 🇰🇪)
  expiresAt: string; // ISO string 24h from creation
  createdAt: string; // ISO string
}

export interface UserStoryGroup {
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorCounty?: string;
  hasUnviewed: boolean;
  stories: CitizenStory[];
  lastStoryTime: string;
}

export interface CreateStoryParams {
  type: StoryMediaType;
  mediaUrl: string;
  caption?: string;
  duration?: number;
  authorCounty?: string;
}
