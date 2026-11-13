import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  getDoc,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types/chat';
import { CommunityPost, CommunityComment, CreatePostParams } from '../types/community';
import { base64ToBlobUrl } from '../utils/videoProcessor';

const videoBlobUrlCache = new Map<string, string>();
const inFlightVideoLoads = new Map<string, Promise<string>>();

const POSTS_COLLECTION = 'community_posts';

/**
 * Create a new community post
 */
export async function createCommunityPost(
  author: UserProfile,
  params: CreatePostParams,
  onProgress?: (percent: number) => void
): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const postRef = doc(db, POSTS_COLLECTION, postId);

  const trimmedContent = (params.content || '').trim().slice(0, 2000);
  const derivedTitle = params.title?.trim()
    ? params.title.trim().slice(0, 150)
    : (trimmedContent.slice(0, 75) + (trimmedContent.length > 75 ? '...' : '')) || 'Citizen Post';

  const hasChunkedVideo = Array.isArray(params.videoChunks) && params.videoChunks.length > 0;

  const postData: any = {
    id: postId,
    authorId: author.uid,
    authorName: author.displayName,
    authorPhotoUrl: author.photoURL || '',
    authorCounty: author.county || '',
    title: derivedTitle,
    content: trimmedContent,
    category: params.category || 'general',
    county: params.county !== undefined ? params.county : '',
    upvotes: 0,
    upvoters: [],
    commentsCount: 0,
    createdAt: serverTimestamp(),
  };

  if (params.hotspotId && params.hotspotName) {
    postData.hotspotId = params.hotspotId;
    postData.hotspotName = params.hotspotName;
  }

  if (params.speedMbps !== undefined && !isNaN(params.speedMbps)) {
    postData.speedMbps = Number(params.speedMbps);
  }

  if (hasChunkedVideo) {
    postData.mediaType = 'video';
    postData.videoChunkCount = params.videoChunks!.length;
    postData.videoStatus = 'uploading';
    if (params.videoThumbnail) postData.videoThumbnail = params.videoThumbnail;
    if (params.videoDuration !== undefined) postData.videoDuration = Number(params.videoDuration);
    if (params.videoSizeBytes !== undefined) postData.videoSizeBytes = Math.round(params.videoSizeBytes);
    if (params.videoMimeType) postData.videoMimeType = params.videoMimeType.slice(0, 100);
  } else if (params.mediaUrl) {
    postData.mediaUrl = params.mediaUrl;
    postData.mediaType =
      params.mediaType || (params.mediaUrl.startsWith('data:video/') ? 'video' : 'image');
    if (postData.mediaType === 'video') {
      postData.videoStatus = 'ready';
      if (params.videoThumbnail) postData.videoThumbnail = params.videoThumbnail;
      if (params.videoDuration !== undefined) postData.videoDuration = Number(params.videoDuration);
      if (params.videoSizeBytes !== undefined) postData.videoSizeBytes = Math.round(params.videoSizeBytes);
      if (params.videoMimeType) postData.videoMimeType = params.videoMimeType.slice(0, 100);
    }
  }

  if (params.constituency) {
    postData.constituency = params.constituency;
  }

  if (params.mediaCaption) {
    postData.mediaCaption = params.mediaCaption.trim().slice(0, 200);
  }

  if (params.backgroundColor && params.backgroundColor !== 'default') {
    postData.backgroundColor = params.backgroundColor;
  }

  try {
    onProgress?.(hasChunkedVideo ? 5 : 50);
    await setDoc(postRef, postData);

    if (hasChunkedVideo && params.videoChunks) {
      const total = params.videoChunks.length;
      const uploadedChunkIds: string[] = [];
      const BATCH_CONCURRENCY = 4;

      try {
        for (let i = 0; i < total; i += BATCH_CONCURRENCY) {
          const slice = params.videoChunks.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            slice.map(async (chunkData, offset) => {
              const index = i + offset;
              const chunkId = `chunk_${index}`;
              const chunkRef = doc(db, POSTS_COLLECTION, postId, 'video_chunks', chunkId);
              await setDoc(chunkRef, {
                id: chunkId,
                postId,
                authorId: author.uid,
                index,
                data: chunkData,
                createdAt: serverTimestamp(),
              });
              uploadedChunkIds.push(chunkId);
            })
          );
          const pct = Math.min(95, Math.round(10 + ((i + slice.length) / total) * 85));
          onProgress?.(pct);
        }

        await updateDoc(postRef, { videoStatus: 'ready' });
        onProgress?.(100);
      } catch (chunkErr) {
        // Rollback partial chunks & post document cleanly
        await Promise.allSettled([
          ...uploadedChunkIds.map((cid) => deleteDoc(doc(db, POSTS_COLLECTION, postId, 'video_chunks', cid))),
          deleteDoc(postRef),
        ]);
        handleFirestoreError(chunkErr, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}/video_chunks`);
      }
    } else {
      onProgress?.(100);
    }

    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Fetch and assemble chunked video segments from Firestore into a cached Blob Object URL
 */
export async function fetchAndAssemblePostVideo(
  postId: string,
  mimeType: string = 'video/mp4'
): Promise<string> {
  const cached = videoBlobUrlCache.get(postId);
  if (cached) return cached;

  const existingPromise = inFlightVideoLoads.get(postId);
  if (existingPromise) return existingPromise;

  const loadPromise = (async () => {
    const chunksPath = `${POSTS_COLLECTION}/${postId}/video_chunks`;
    try {
      const chunksRef = collection(db, POSTS_COLLECTION, postId, 'video_chunks');
      const snap = await getDocs(chunksRef);
      if (snap.empty) {
        throw new Error('Video data is unavailable.');
      }
      const ordered = snap.docs
        .map((d) => d.data() as { index: number; data: string })
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      const fullBase64 = ordered.map((c) => c.data).join('');
      const objectUrl = base64ToBlobUrl(fullBase64, mimeType);
      videoBlobUrlCache.set(postId, objectUrl);
      return objectUrl;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, chunksPath);
    } finally {
      inFlightVideoLoads.delete(postId);
    }
  })();

  inFlightVideoLoads.set(postId, loadPromise);
  return loadPromise;
}

/**
 * Real-time listener for community posts with optional county, constituency and category filtering
 */
export function subscribeToCommunityPosts(
  filters: { county?: string; constituency?: string; category?: string; sortBy?: 'latest' | 'popular' },
  callback: (posts: CommunityPost[]) => void
): () => void {
  const postsRef = collection(db, POSTS_COLLECTION);
  let q = query(postsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      let posts: CommunityPost[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          authorId: d.authorId,
          authorName: d.authorName || 'Kenya Community Member',
          authorPhotoUrl: d.authorPhotoUrl || undefined,
          authorCounty: d.authorCounty || 'Kenya',
          title: d.title || 'Community Update',
          content: d.content || '',
          category: d.category || 'general',
          county: d.county || '',
          constituency: d.constituency || undefined,
          hotspotId: d.hotspotId,
          hotspotName: d.hotspotName,
          speedMbps: d.speedMbps !== undefined ? Number(d.speedMbps) : undefined,
          mediaUrl: d.mediaUrl || undefined,
          mediaType:
            d.mediaType === 'video' || d.mediaType === 'image'
              ? d.mediaType
              : typeof d.mediaUrl === 'string' && d.mediaUrl.startsWith('data:video/')
              ? 'video'
              : (d.videoChunkCount ?? 0) > 0
              ? 'video'
              : d.mediaUrl
              ? 'image'
              : undefined,
          mediaCaption: d.mediaCaption || undefined,
          videoThumbnail: d.videoThumbnail || undefined,
          videoDuration: typeof d.videoDuration === 'number' ? d.videoDuration : undefined,
          videoSizeBytes: typeof d.videoSizeBytes === 'number' ? d.videoSizeBytes : undefined,
          videoChunkCount: typeof d.videoChunkCount === 'number' ? d.videoChunkCount : undefined,
          videoMimeType: d.videoMimeType || undefined,
          videoStatus: d.videoStatus || undefined,
          backgroundColor: d.backgroundColor || undefined,
          upvotes: typeof d.upvotes === 'number' ? d.upvotes : (d.upvoters?.length || 0),
          upvoters: Array.isArray(d.upvoters) ? d.upvoters : [],
          reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
          reactionsCount: d.reactionsCount && typeof d.reactionsCount === 'object' ? d.reactionsCount : {},
          commentsCount: typeof d.commentsCount === 'number' ? d.commentsCount : 0,
          isFlagged: !!d.isFlagged,
          safetyCategory: d.safetyCategory,
          safetyReason: d.safetyReason,
          safetyAdvisory: d.safetyAdvisory,
          moderationStatus: d.moderationStatus || 'approved',
          reportCount: typeof d.reportCount === 'number' ? d.reportCount : 0,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : undefined,
        };
      }).filter((p) => p.videoStatus !== 'uploading');

      // Filter in-memory for flexible combination
      if (filters.county && filters.county !== 'All') {
        posts = posts.filter(
          (p) => (p.county || '').toLowerCase() === filters.county!.toLowerCase()
        );
      }

      if (filters.constituency && filters.constituency !== 'All') {
        posts = posts.filter(
          (p) => (p.constituency || '').toLowerCase() === filters.constituency!.toLowerCase()
        );
      }

      if (filters.category && filters.category !== 'all') {
        posts = posts.filter((p) => p.category === filters.category);
      }

      if (filters.sortBy === 'popular') {
        posts.sort((a, b) => b.upvotes - a.upvotes);
      }

      callback(posts);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, POSTS_COLLECTION);
    }
  );
}

/**
 * Toggle upvote for a community post
 */
export async function toggleUpvotePost(postId: string, userId: string): Promise<boolean> {
  const postRef = doc(db, POSTS_COLLECTION, postId);

  try {
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return false;

    const data = postSnap.data();
    const upvoters: string[] = data.upvoters || [];
    const hasUpvoted = upvoters.includes(userId);

    if (hasUpvoted) {
      await updateDoc(postRef, {
        upvoters: arrayRemove(userId),
        upvotes: increment(-1),
      });
      return false;
    } else {
      await updateDoc(postRef, {
        upvoters: arrayUnion(userId),
        upvotes: increment(1),
      });
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Add a comment to a post
 */
export async function addCommunityComment(
  postId: string,
  author: UserProfile,
  content: string,
  mediaUrl?: string,
  replyToCommentId?: string,
  replyToAuthorName?: string
): Promise<string> {
  const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
  const postRef = doc(db, POSTS_COLLECTION, postId);

  const commentPayload: any = {
    id: commentId,
    postId,
    authorId: author.uid,
    authorName: author.displayName,
    authorPhotoUrl: author.photoURL || '',
    content: content.trim().slice(0, 1000),
    createdAt: serverTimestamp(),
  };

  if (mediaUrl) {
    commentPayload.mediaUrl = mediaUrl;
  }

  if (replyToCommentId) {
    commentPayload.replyToCommentId = replyToCommentId;
  }

  if (replyToAuthorName) {
    commentPayload.replyToAuthorName = replyToAuthorName;
  }

  try {
    await setDoc(commentRef, commentPayload);
    // Increment comment count on the post
    await updateDoc(postRef, {
      commentsCount: increment(1),
    });
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}/comments/${commentId}`);
  }
}

/**
 * Subscribe to comments for a specific post
 */
export function subscribeToPostComments(
  postId: string,
  callback: (comments: CommunityComment[]) => void
): () => void {
  const path = `${POSTS_COLLECTION}/${postId}/comments`;
  const commentsRef = collection(db, POSTS_COLLECTION, postId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const comments: CommunityComment[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          postId,
          authorId: d.authorId,
          authorName: d.authorName || 'Kenya Community Member',
          authorPhotoUrl: d.authorPhotoUrl || undefined,
          content: d.content || '',
          mediaUrl: d.mediaUrl || undefined,
          replyToCommentId: d.replyToCommentId || undefined,
          replyToAuthorName: d.replyToAuthorName || undefined,
          reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
          reactionsCount: d.reactionsCount && typeof d.reactionsCount === 'object' ? d.reactionsCount : {},
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
        };
      });
      callback(comments);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Toggle or set a reaction on a community post (strictly one reaction per user)
 */
export async function reactToCommunityPost(
  postId: string,
  userId: string,
  reactionKey: string
): Promise<{ reaction: string | null; reactionsCount: Record<string, number> }> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const data = postSnap.data();
    const currentReactions: Record<string, string> = { ...(data.reactions || {}) };
    const currentCounts: Record<string, number> = { ...(data.reactionsCount || {}) };
    const previousReaction = currentReactions[userId];

    let newReaction: string | null = reactionKey;

    if (previousReaction === reactionKey) {
      // User tapped the same active reaction -> un-react
      delete currentReactions[userId];
      currentCounts[reactionKey] = Math.max(0, (currentCounts[reactionKey] || 1) - 1);
      if (currentCounts[reactionKey] === 0) {
        delete currentCounts[reactionKey];
      }
      newReaction = null;
    } else {
      // User is changing reaction or adding a new one
      if (previousReaction && currentCounts[previousReaction]) {
        currentCounts[previousReaction] = Math.max(0, currentCounts[previousReaction] - 1);
        if (currentCounts[previousReaction] === 0) {
          delete currentCounts[previousReaction];
        }
      }
      currentReactions[userId] = reactionKey;
      currentCounts[reactionKey] = (currentCounts[reactionKey] || 0) + 1;
    }

    // Maintain upvotes & upvoters array for backward compatibility
    let upvoters: string[] = Array.isArray(data.upvoters) ? [...data.upvoters] : [];
    if (newReaction) {
      if (!upvoters.includes(userId)) upvoters.push(userId);
    } else {
      upvoters = upvoters.filter((id) => id !== userId);
    }
    const totalReactions = Object.values(currentCounts).reduce((acc, c) => acc + c, 0);

    await updateDoc(postRef, {
      reactions: currentReactions,
      reactionsCount: currentCounts,
      upvotes: totalReactions,
      upvoters
    });

    return { reaction: newReaction, reactionsCount: currentCounts };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Toggle or set a reaction on a comment (strictly one reaction per user)
 */
export async function reactToCommunityComment(
  postId: string,
  commentId: string,
  userId: string,
  reactionKey: string
): Promise<{ reaction: string | null; reactionsCount: Record<string, number> }> {
  const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
  try {
    const commentSnap = await getDoc(commentRef);
    if (!commentSnap.exists()) {
      throw new Error('Comment not found');
    }

    const data = commentSnap.data();
    const currentReactions: Record<string, string> = { ...(data.reactions || {}) };
    const currentCounts: Record<string, number> = { ...(data.reactionsCount || {}) };
    const previousReaction = currentReactions[userId];

    let newReaction: string | null = reactionKey;

    if (previousReaction === reactionKey) {
      // User tapped the same active reaction -> un-react
      delete currentReactions[userId];
      currentCounts[reactionKey] = Math.max(0, (currentCounts[reactionKey] || 1) - 1);
      if (currentCounts[reactionKey] === 0) {
        delete currentCounts[reactionKey];
      }
      newReaction = null;
    } else {
      // User is changing reaction or adding a new one
      if (previousReaction && currentCounts[previousReaction]) {
        currentCounts[previousReaction] = Math.max(0, currentCounts[previousReaction] - 1);
        if (currentCounts[previousReaction] === 0) {
          delete currentCounts[previousReaction];
        }
      }
      currentReactions[userId] = reactionKey;
      currentCounts[reactionKey] = (currentCounts[reactionKey] || 0) + 1;
    }

    await updateDoc(commentRef, {
      reactions: currentReactions,
      reactionsCount: currentCounts
    });

    return { reaction: newReaction, reactionsCount: currentCounts };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}/comments/${commentId}`);
  }
}

/**
 * Delete a post (allowed if author or developer/moderator)
 */
export async function deleteCommunityPost(
  postId: string,
  userId: string,
  isDeveloper: boolean = false
): Promise<void> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    const snap = await getDoc(postRef);
    if (!snap.exists()) return;
    const authorId = snap.data().authorId;
    if (authorId !== userId && !isDeveloper) {
      throw new Error('Unauthorized: You can only delete your own posts.');
    }

    // Clean up any video_chunks subcollection documents
    const chunksSnap = await getDocs(collection(db, POSTS_COLLECTION, postId, 'video_chunks'));
    if (!chunksSnap.empty) {
      await Promise.allSettled(chunksSnap.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));
    }

    const cachedUrl = videoBlobUrlCache.get(postId);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      videoBlobUrlCache.delete(postId);
    }

    await deleteDoc(postRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}`);
  }
}
