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
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types/chat';
import { CommunityPost, CommunityComment, CreatePostParams } from '../types/community';

const POSTS_COLLECTION = 'community_posts';

/**
 * Create a new community post
 */
export async function createCommunityPost(
  author: UserProfile,
  params: CreatePostParams
): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const postRef = doc(db, POSTS_COLLECTION, postId);

  const trimmedContent = (params.content || '').trim().slice(0, 2000);
  const derivedTitle = params.title?.trim()
    ? params.title.trim().slice(0, 150)
    : (trimmedContent.slice(0, 75) + (trimmedContent.length > 75 ? '...' : '')) || 'Citizen Post';

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

  if (params.mediaUrl) {
    postData.mediaUrl = params.mediaUrl;
  }

  if (params.constituency) {
    postData.constituency = params.constituency;
  }

  if (params.mediaCaption) {
    postData.mediaCaption = params.mediaCaption.trim().slice(0, 200);
  }

  try {
    await setDoc(postRef, postData);
    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}`);
  }
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
          mediaCaption: d.mediaCaption || undefined,
          upvotes: typeof d.upvotes === 'number' ? d.upvotes : (d.upvoters?.length || 0),
          upvoters: Array.isArray(d.upvoters) ? d.upvoters : [],
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
      });

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
  mediaUrl?: string
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
    await deleteDoc(postRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}`);
  }
}
