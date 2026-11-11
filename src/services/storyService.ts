import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  increment,
  query,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types/chat';
import { CitizenStory, CreateStoryParams, UserStoryGroup } from '../types/story';

const STORIES_COLLECTION = 'stories';

/**
 * Publish a new photo or video story
 */
export async function publishCitizenStory(
  author: UserProfile,
  params: CreateStoryParams
): Promise<string> {
  const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const storyRef = doc(db, STORIES_COLLECTION, storyId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour expiration

  const storyData: Record<string, any> = {
    id: storyId,
    authorId: author.uid,
    authorName: author.displayName || 'Citizen Member',
    type: params.type,
    mediaUrl: params.mediaUrl,
    viewers: [],
    viewsCount: 0,
    reactions: {},
    expiresAt,
    createdAt: now.toISOString()
  };

  if (author.photoURL) {
    storyData.authorPhotoUrl = author.photoURL;
  }
  if (params.authorCounty || author.county) {
    storyData.authorCounty = params.authorCounty || author.county;
  }
  if (params.caption && params.caption.trim()) {
    storyData.caption = params.caption.trim().slice(0, 500);
  }
  if (params.duration) {
    storyData.duration = Math.min(60, Math.max(1, Math.round(params.duration)));
  } else {
    storyData.duration = params.type === 'video' ? 15 : 6;
  }

  try {
    await setDoc(storyRef, storyData);
    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stories/${storyId}`);
    throw error;
  }
}

/**
 * Real-time listener for active stories across the community
 */
export function subscribeToActiveStories(
  callback: (stories: CitizenStory[]) => void
): () => void {
  const storiesQuery = query(
    collection(db, STORIES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    storiesQuery,
    (snapshot) => {
      const nowMs = Date.now();
      const activeStories: CitizenStory[] = [];

      snapshot.forEach((d) => {
        const data = d.data() as CitizenStory;
        // Verify 24h expiration
        const expiresMs = data.expiresAt ? new Date(data.expiresAt).getTime() : 0;
        if (!expiresMs || expiresMs > nowMs) {
          activeStories.push({
            ...data,
            id: d.id,
            viewers: Array.isArray(data.viewers) ? data.viewers : [],
            viewsCount: typeof data.viewsCount === 'number' ? data.viewsCount : 0,
            reactions: data.reactions || {}
          });
        }
      });

      callback(activeStories);
    },
    (error) => {
      console.warn('Stories listener warning:', error);
      callback([]);
    }
  );
}

/**
 * Record that a user viewed a story (idempotent, only increments once per user)
 */
export async function recordStoryView(storyId: string, userId: string): Promise<void> {
  if (!storyId || !userId) return;
  const storyRef = doc(db, STORIES_COLLECTION, storyId);

  try {
    await updateDoc(storyRef, {
      viewers: arrayUnion(userId),
      viewsCount: increment(1)
    });
  } catch (error) {
    console.warn('Error recording story view:', error);
  }
}

/**
 * React to a citizen story with an emoji
 */
export async function reactToCitizenStory(
  storyId: string,
  userId: string,
  emoji: string
): Promise<void> {
  if (!storyId || !userId || !emoji) return;
  const storyRef = doc(db, STORIES_COLLECTION, storyId);

  try {
    await updateDoc(storyRef, {
      [`reactions.${userId}`]: emoji
    });
  } catch (error) {
    console.warn('Error reacting to story:', error);
  }
}

/**
 * Delete a story (by author or developer)
 */
export async function deleteCitizenStory(storyId: string): Promise<void> {
  const storyRef = doc(db, STORIES_COLLECTION, storyId);
  try {
    await deleteDoc(storyRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
    throw error;
  }
}

/**
 * Helper to group active stories by author for the Stories Tray carousel
 */
export function groupStoriesByAuthor(
  stories: CitizenStory[],
  currentUserId?: string
): UserStoryGroup[] {
  const groupMap: Record<string, UserStoryGroup> = {};

  for (const story of stories) {
    if (!groupMap[story.authorId]) {
      groupMap[story.authorId] = {
        authorId: story.authorId,
        authorName: story.authorName,
        authorPhotoUrl: story.authorPhotoUrl,
        authorCounty: story.authorCounty,
        hasUnviewed: false,
        stories: [],
        lastStoryTime: story.createdAt
      };
    }

    groupMap[story.authorId].stories.push(story);
  }

  // Sort each author's stories chronologically (oldest to newest for viewing playback)
  Object.values(groupMap).forEach((group) => {
    group.stories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    group.lastStoryTime = group.stories[group.stories.length - 1].createdAt;
    group.hasUnviewed = currentUserId
      ? group.stories.some((s) => !s.viewers?.includes(currentUserId))
      : true;
  });

  const groups = Object.values(groupMap);

  // Sort groups:
  // 1. Current user's group first (if any)
  // 2. Unviewed stories next
  // 3. Fully viewed stories last, sorted by lastStoryTime desc
  return groups.sort((a, b) => {
    if (currentUserId) {
      if (a.authorId === currentUserId) return -1;
      if (b.authorId === currentUserId) return 1;
    }
    if (a.hasUnviewed && !b.hasUnviewed) return -1;
    if (!a.hasUnviewed && b.hasUnviewed) return 1;
    return new Date(b.lastStoryTime).getTime() - new Date(a.lastStoryTime).getTime();
  });
}
