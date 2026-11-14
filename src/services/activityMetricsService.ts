import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types/chat';
import { CommunityPost } from '../types/community';
import { deriveFeedMetricsFromPosts, UserActivityMetrics } from '../utils/achievementBadges';

/**
 * Fetches rich CommunityFeed, Polls, Stories, and Comments activity metrics
 * for a citizen profile without blocking modal render.
 */
export async function fetchUserCommunityActivityMetrics(
  targetUid: string,
  allPosts: CommunityPost[],
  user?: Partial<UserProfile> | null,
  followersCount: number = 0,
  options?: { isOwnProfile?: boolean }
): Promise<UserActivityMetrics> {
  const base = deriveFeedMetricsFromPosts(targetUid, allPosts, user, followersCount);

  if (!targetUid) {
    return { ...base, isLoadingRemote: false };
  }

  // Only inspect posts that actually have comments (capped for lean reads)
  const postsWithComments = allPosts
    .filter((p) => (p.commentsCount || 0) > 0)
    .slice(0, 20);

  const [storiesResult, pollsResult, commentCountsResult] = await Promise.allSettled([
    // 1. Stories authored by target citizen
    getDocs(query(collection(db, 'stories'), where('authorId', '==', targetUid))),
    // 2. Community polls collection (publicly readable)
    getDocs(collection(db, 'community_polls')),
    // 3. Comments authored on active CommunityFeed posts
    Promise.allSettled(
      postsWithComments.map((post) =>
        getDocs(
          query(
            collection(db, 'community_posts', post.id, 'comments'),
            where('authorId', '==', targetUid)
          )
        )
      )
    )
  ]);

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
    if (options?.isOwnProfile && pollDocs.length > 0) {
      const voteChecks = await Promise.allSettled(
        pollDocs.map((pollDoc) =>
          getDoc(doc(db, 'community_polls', pollDoc.id, 'votes', targetUid))
        )
      );
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
      return acc;
    }, 0);
    commentsAuthored = Math.max(commentsAuthored, queriedComments);
  }

  return {
    ...base,
    storiesCount,
    pollsCreatedCount,
    pollVotesCount,
    commentsAuthored,
    isLoadingRemote: false
  };
}
