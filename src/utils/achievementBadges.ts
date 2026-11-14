import { UserProfile } from '../types/chat';
import { CommunityPost } from '../types/community';
import { getProfileCompleteness } from './profileUtils';

export type AchievementBadgeId =
  | 'verified_resident'
  | 'top_contributor'
  | 'daily_poll_hero'
  | 'conversation_catalyst'
  | 'voice_of_mtaa'
  | 'civic_scout';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'civic';

export interface UserActivityMetrics {
  postsCount: number;
  commentsAuthored: number;
  commentsReceived: number;
  reactionsReceived: number;
  reactionsGiven: number;
  audioShoutsCount: number;
  videoPostsCount: number;
  civicPostsCount: number;
  storiesCount: number;
  pollVotesCount: number;
  pollsCreatedCount: number;
  followersCount: number;
  isLoadingRemote?: boolean;
}

export interface AchievementBadge {
  id: AchievementBadgeId;
  title: string;
  subtitle: string;
  description: string;
  criteriaLabel: string;
  unlocked: boolean;
  tier: BadgeTier;
  tierLabel: string;
  progressCurrent: number;
  progressTarget: number;
  progressPercent: number;
  proofText: string;
}

/**
 * Computes fast synchronous feed metrics directly from the loaded CommunityFeed posts array
 * before or alongside async subcollection queries (comments, polls, stories).
 */
export function deriveFeedMetricsFromPosts(
  targetUid: string,
  allPosts: CommunityPost[],
  user?: Partial<UserProfile> | null,
  followersCount: number = 0
): UserActivityMetrics {
  let postsCount = 0;
  let commentsReceived = 0;
  let reactionsReceived = 0;
  let reactionsGiven = 0;
  let audioShoutsCount = 0;
  let videoPostsCount = 0;
  let civicPostsCount = 0;

  for (const post of allPosts) {
    if (post.authorId === targetUid) {
      postsCount += 1;
      commentsReceived += post.commentsCount || 0;

      const rxCount = post.reactions
        ? Object.keys(post.reactions).length
        : Object.values(post.reactionsCount || {}).reduce((acc, n) => acc + (n || 0), 0);
      reactionsReceived += Math.max(post.upvotes || 0, rxCount);

      if (post.mediaType === 'audio') {
        audioShoutsCount += 1;
      } else if (post.mediaType === 'video') {
        videoPostsCount += 1;
      }

      if (
        post.category === 'speed_report' ||
        post.category === 'hotspot_tip' ||
        post.category === 'outage_alert' ||
        post.category === 'local_news' ||
        post.category === 'discussion'
      ) {
        civicPostsCount += 1;
      }
    }

    const didReact =
      (Array.isArray(post.upvoters) && post.upvoters.includes(targetUid)) ||
      Boolean(post.reactions && post.reactions[targetUid]);
    if (didReact) {
      reactionsGiven += 1;
    }
  }

  return {
    postsCount,
    commentsAuthored: user?.feedCommentsCount || 0,
    commentsReceived,
    reactionsReceived,
    reactionsGiven,
    audioShoutsCount,
    videoPostsCount,
    civicPostsCount,
    storiesCount: 0,
    pollVotesCount: user?.pollVotesCount || 0,
    pollsCreatedCount: 0,
    followersCount,
    isLoadingRemote: true
  };
}

/**
 * Evaluates visual achievement badges earned by a citizen from their profile
 * verification and real CommunityFeed / Polls / Stories activity.
 */
export function computeUserAchievementBadges(
  user: Partial<UserProfile> | null | undefined,
  metrics: UserActivityMetrics
): AchievementBadge[] {
  const completeness = getProfileCompleteness(user);
  const isStandingActive = user?.accountStatus !== 'suspended' && user?.accountStatus !== 'banned';
  const verifiedUnlocked = completeness.isComplete && isStandingActive;
  const countyDisplay = (user?.county || 'Kenya').trim() || 'Kenya';

  // 1. Verified Resident
  const verifiedBadge: AchievementBadge = {
    id: 'verified_resident',
    title: 'Verified Resident',
    subtitle: verifiedUnlocked ? `${countyDisplay} Verified` : 'Complete Citizen Profile',
    description:
      'Awarded to active citizens who complete their full identity (name, county, constituency, occupation, and bio) with good standing.',
    criteriaLabel: 'Complete 100% of required profile fields in good standing',
    unlocked: verifiedUnlocked,
    tier: 'civic',
    tierLabel: verifiedUnlocked ? 'Verified' : `${completeness.percentage}%`,
    progressCurrent: completeness.percentage,
    progressTarget: 100,
    progressPercent: completeness.percentage,
    proofText: verifiedUnlocked
      ? `${user?.constituency ? `${user.constituency}, ` : ''}${countyDisplay}`
      : `${completeness.missingRequired.length} detail${completeness.missingRequired.length === 1 ? '' : 's'} remaining`
  };

  // 2. Top Contributor (Posts * 4 + Comments * 2 + Reactions Received)
  const contributionPoints =
    metrics.postsCount * 4 + metrics.commentsAuthored * 2 + metrics.reactionsReceived;
  const topUnlocked = metrics.postsCount >= 3 || contributionPoints >= 12;
  const isGoldContributor = metrics.postsCount >= 6 || contributionPoints >= 30;
  const topTarget = topUnlocked ? (isGoldContributor ? 30 : 30) : 12;
  const topProgressPct = topUnlocked
    ? 100
    : Math.min(99, Math.round((Math.max(contributionPoints, metrics.postsCount * 4) / 12) * 100));

  const topContributorBadge: AchievementBadge = {
    id: 'top_contributor',
    title: 'Top Contributor',
    subtitle: isGoldContributor
      ? 'Gold Feed Leader'
      : topUnlocked
      ? 'Active Feed Creator'
      : 'Share 3+ posts or 12+ impact pts',
    description:
      'Recognizes citizens energizing the Community Feed through regular posts, helpful replies, and community reactions.',
    criteriaLabel: 'Author 3+ feed posts or earn 12+ community impact points (posts, replies & reactions)',
    unlocked: topUnlocked,
    tier: isGoldContributor ? 'gold' : topUnlocked ? 'silver' : 'bronze',
    tierLabel: isGoldContributor ? 'Gold' : topUnlocked ? 'Unlocked' : `${Math.min(contributionPoints, 12)}/12 pts`,
    progressCurrent: Math.min(contributionPoints, topTarget),
    progressTarget: topTarget,
    progressPercent: topProgressPct,
    proofText: `${metrics.postsCount} post${metrics.postsCount === 1 ? '' : 's'} · ${metrics.reactionsReceived} reaction${metrics.reactionsReceived === 1 ? '' : 's'}`
  };

  // 3. Daily Poll Hero
  const totalPollActions = metrics.pollVotesCount + metrics.pollsCreatedCount;
  const pollUnlocked = totalPollActions >= 1;
  const isPollChampion = totalPollActions >= 3;
  const pollBadge: AchievementBadge = {
    id: 'daily_poll_hero',
    title: 'Daily Poll Hero',
    subtitle: isPollChampion
      ? 'Civic Voice Champion'
      : pollUnlocked
      ? 'Active Voter'
      : 'Vote or launch a poll',
    description:
      'Earned by citizens shaping national and county conversations in Daily Community Polls.',
    criteriaLabel: 'Vote in or publish 1+ Daily Community Poll (3+ actions for Gold status)',
    unlocked: pollUnlocked,
    tier: isPollChampion ? 'gold' : pollUnlocked ? 'silver' : 'bronze',
    tierLabel: isPollChampion ? 'Champion' : pollUnlocked ? 'Voter' : '0/1 Poll',
    progressCurrent: Math.min(totalPollActions, isPollChampion ? 3 : 1),
    progressTarget: isPollChampion ? 3 : 1,
    progressPercent: pollUnlocked ? 100 : 0,
    proofText:
      metrics.pollsCreatedCount > 0
        ? `${metrics.pollVotesCount} voted · ${metrics.pollsCreatedCount} created`
        : `${metrics.pollVotesCount} poll${metrics.pollVotesCount === 1 ? '' : 's'} voted`
  };

  // 4. Conversation Catalyst (Comments authored or replies sparked)
  const dialogueScore = metrics.commentsAuthored + metrics.commentsReceived;
  const dialogueUnlocked = metrics.commentsAuthored >= 2 || dialogueScore >= 3;
  const dialogueProgressPct = dialogueUnlocked
    ? 100
    : Math.min(99, Math.round((dialogueScore / 3) * 100));

  const catalystBadge: AchievementBadge = {
    id: 'conversation_catalyst',
    title: 'Dialogue Builder',
    subtitle: dialogueUnlocked ? 'Community Discussant' : 'Join 3+ feed discussions',
    description:
      'Celebrates citizens who spark respectful, lively discussions through comments and replies in Community Feed threads.',
    criteriaLabel: 'Write 2+ comments or spark 3+ total thread interactions in Community Feed',
    unlocked: dialogueUnlocked,
    tier: dialogueScore >= 10 ? 'gold' : dialogueUnlocked ? 'silver' : 'bronze',
    tierLabel: dialogueScore >= 10 ? 'Gold' : dialogueUnlocked ? 'Active' : `${dialogueScore}/3`,
    progressCurrent: Math.min(dialogueScore, 3),
    progressTarget: 3,
    progressPercent: dialogueProgressPct,
    proofText: `${metrics.commentsAuthored} comment${metrics.commentsAuthored === 1 ? '' : 's'} · ${metrics.commentsReceived} replies`
  };

  // 5. Voice & Storyteller (30s audio shouts, short videos, or citizen stories)
  const mediaTotal = metrics.audioShoutsCount + metrics.videoPostsCount + metrics.storiesCount;
  const voiceUnlocked = mediaTotal >= 1;
  const isMediaStar = mediaTotal >= 3;
  const voiceBadge: AchievementBadge = {
    id: 'voice_of_mtaa',
    title: 'Voice of Mtaa',
    subtitle: isMediaStar
      ? 'Rich Media Creator'
      : voiceUnlocked
      ? 'Audio & Video Poster'
      : 'Post an audio shout or reel',
    description:
      'Awarded for sharing 30-second audio shouts, short community videos, or live 24-hour Citizen Stories.',
    criteriaLabel: 'Publish 1+ audio shout, short video, or Citizen Story in Community Feed',
    unlocked: voiceUnlocked,
    tier: isMediaStar ? 'gold' : voiceUnlocked ? 'silver' : 'bronze',
    tierLabel: isMediaStar ? 'Creator' : voiceUnlocked ? 'Unlocked' : '0/1 Media',
    progressCurrent: Math.min(mediaTotal, 1),
    progressTarget: 1,
    progressPercent: voiceUnlocked ? 100 : 0,
    proofText:
      mediaTotal > 0
        ? `${metrics.audioShoutsCount} shouts · ${metrics.videoPostsCount} videos · ${metrics.storiesCount} stories`
        : 'Audio shout, short video, or story'
  };

  // 6. Civic Scout (Local county reports, hotspot tips, or amplifying 5+ neighbors)
  const civicUnlocked = metrics.civicPostsCount >= 1 || metrics.reactionsGiven >= 5;
  const civicProgress = metrics.civicPostsCount >= 1 ? 5 : Math.min(metrics.reactionsGiven, 5);
  const civicBadge: AchievementBadge = {
    id: 'civic_scout',
    title: 'County Trailblazer',
    subtitle: civicUnlocked ? 'Local Intel & Ally' : 'Share local news or 5 reactions',
    description:
      'Honors citizens who report county updates, Wi-Fi hotspot tips, speed reports, or consistently uplift neighbors with reactions.',
    criteriaLabel: 'Share 1+ local news/civic tip post OR give 5+ reactions across Community Feed',
    unlocked: civicUnlocked,
    tier: metrics.civicPostsCount >= 2 && metrics.reactionsGiven >= 5 ? 'gold' : civicUnlocked ? 'silver' : 'bronze',
    tierLabel: civicUnlocked ? 'Unlocked' : `${civicProgress}/5`,
    progressCurrent: civicProgress,
    progressTarget: 5,
    progressPercent: civicUnlocked ? 100 : Math.min(99, Math.round((civicProgress / 5) * 100)),
    proofText: `${metrics.civicPostsCount} civic post${metrics.civicPostsCount === 1 ? '' : 's'} · ${metrics.reactionsGiven} given`
  };

  return [
    verifiedBadge,
    topContributorBadge,
    daily_poll_hero_order(pollBadge),
    catalystBadge,
    voiceBadge,
    civicBadge
  ];
}

function daily_poll_hero_order(badge: AchievementBadge): AchievementBadge {
  return badge;
}
