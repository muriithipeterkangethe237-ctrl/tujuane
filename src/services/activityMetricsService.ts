import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import {
  db,
  isFirestoreQuotaError,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded
} from '../firebase';
import { UserProfile } from '../types/chat';
import { CommunityPost } from '../types/community';
import { deriveFeedMetricsFromPosts, UserActivityMetrics } from '../utils/achievementBadges';

const METRICS_CACHE_TTL_MS = 120_000;
const metricsCache = new Map<string, { metrics: UserActivityMetrics; cachedAtMs: number }>();

/**
 * Fetches rich CommunityFeed, Polls, Stories, and Comments activity metrics
 * for a citizen profile without blocking modal render or burning quota.
 */
export async function fetchUserCommunityActivityMetrics(
  targetUid: string,
  allPosts: CommunityPost[],
  user?: Partial<UserProfile> | null,
  followersCount: number = 0,
  options?: { isOwnProfile?: boolean }
): Promise<UserActivityMetrics> {
  const base = deriveFeedMetricsFromPosts(targetUid, allPosts, user, followersCount);

  if (!targetUid || isFirestoreQuotaExceeded()) {
    return { ...base, isLoadingRemote: false };
  }

  const cacheKey = `${targetUid}:${options?.isOwnProfile ? 'self' : 'other'}`;
  const cachedEntry = metricsCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.cachedAtMs < METRICS_CACHE_TTL_MS) {
    return {
      ...base,
      storiesCount: Math.max(base.storiesCount, cachedEntry.metrics.storiesCount),
      pollsCreatedCount: Math.max(base.pollsCreatedCount, cachedEntry.metrics.pollsCreatedCount),
      pollVotesCount: Math.max(base.pollVotesCount, cachedEntry.metrics.pollVotesCount),
      commentsAuthored: Math.max(base.commentsAuthored, cachedEntry.metrics.commentsAuthored),
      isLoadingRemote: false
    };
  }

  // Only inspect posts that actually have comments (tightly capped for lean reads)
  const postsWithComments = allPosts
    .filter((p) => (p.commentsCount || 0) > 0)
    .slice(0, 8);

  const [storiesResult, pollsResult, commentCountsResult] = await Promise.allSettled([
    // 1. Stories authored by target citizen
    getDocs(query(collection(db, 'stories'), where('authorId', '==', targetUid), limit(25))),
    // 2. Community polls collection (capped for lean reads)
    getDocs(query(collection(db, 'community_polls'), limit(20))),
    // 3. Comments authored on active CommunityFeed posts
    Promise.allSettled(
      postsWithComments.map((post) =>
        getDocs(
          query(
            collection(db, 'community_posts', post.id, 'comments'),
            where('authorId', '==', targetUid),
            limit(10)
          )
        )
      )
    )
  ]);

  if (
    (storiesResult.status === 'rejected' && isFirestoreQuotaError(storiesResult.reason)) ||
    (pollsResult.status === 'rejected' && isFirestoreQuotaError(pollsResult.reason))
  ) {
    markFirestoreQuotaExceeded();
    return { ...base, isLoadingRemote: false };
  }

  let storiesCount = base.storiesCount;
  if (storiesResult.status === 'fulfilled') {
    storiesCount = storiesResult.value.size;
  }

  let pollsCreatedCount = base.pollsCreatedCount;
  let pollVotesCount = base.pollVotesCount;

  if (pollsResult.status === 'fulfilled') {
    const pollDocs = pollsResult.value.docs;
    pollsCreatedCount = pollDocs.filter((d) => d.data()?.authorId === targetUid).length;

    // Exact ballot vote lookup is permitted by Firestore rules for the signed-in user's own profile
    if (options?.isOwnProfile && pollDocs.length > 0 && !isFirestoreQuotaExceeded()) {
      const voteChecks = await Promise.allSettled(
        pollDocs.slice(0, 12).map((pollDoc) =>
          getDoc(doc(db, 'community_polls', pollDoc.id, 'votes', targetUid))
        )
      );
      const hasQuotaRejection = voteChecks.some(
        (res) => res.status === 'rejected' && isFirestoreQuotaError(res.reason)
      );
      if (hasQuotaRejection) {
        markFirestoreQuotaExceeded();
      }
      const exactVotedCount = voteChecks.reduce(
        (acc, res) => (res.status === 'fulfilled' && res.value.exists() ? acc + 1 : acc),
        0
      );
      pollVotesCount = Math.max(pollVotesCount, exactVotedCount);
    }
  }

  let commentsAuthored = base.commentsAuthored;
  if (commentCountsResult.status === 'fulfilled') {
    const queriedComments = commentCountsResult.value.reduce((acc, res) => {
      if (res.status === 'fulfilled') {
        return acc + res.value.size;
      }
      if (res.status === 'rejected' && isFirestoreQuotaError(res.reason)) {
        markFirestoreQuotaExceeded();
      }
      return acc;
    }, 0);
    commentsAuthored = Math.max(commentsAuthored, queriedComments);
  }

  const finalMetrics: UserActivityMetrics = {
    ...base,
    storiesCount,
    pollsCreatedCount,
    pollVotesCount,
    commentsAuthored,
    isLoadingRemote: false
  };

  metricsCache.set(cacheKey, { metrics: finalMetrics, cachedAtMs: Date.now() });
  return finalMetrics;
}
