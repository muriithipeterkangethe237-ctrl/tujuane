import { UserProfile } from '../types/chat';
import { CommunityPost, TaggedUserRef } from '../types/community';

export interface TrendingHashtagItem {
  key: string; // normalized lowercase without #
  tag: string; // display tag without #
  postCount: number;
  engagementCount: number;
  score: number;
}

export type RichTextToken =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; key: string }
  | { type: 'mention'; value: string; uid?: string; displayName: string; user?: UserProfile };

const HASHTAG_REGEX = /(^|[\s.,!?;:()[\]{}"'])#([a-zA-Z0-9_]{2,40})\b/g;

/**
 * Extract unique hashtags (with display casing preserved) from text.
 */
export function extractHashtagsWithDisplay(text: string): Array<{ key: string; display: string }> {
  if (!text) return [];
  const seen = new Map<string, string>();
  let match: RegExpExecArray | null;
  HASHTAG_REGEX.lastIndex = 0;

  while ((match = HASHTAG_REGEX.exec(text)) !== null) {
    const raw = match[2];
    if (!raw || /^\d+$/.test(raw) && raw.length > 4) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, raw);
    }
    if (seen.size >= 20) break;
  }

  return Array.from(seen.entries()).map(([key, display]) => ({ key, display }));
}

/**
 * Extract normalized lowercase hashtag keys (without #) from text, capped at 20.
 */
export function extractHashtagKeys(text: string): string[] {
  return extractHashtagsWithDisplay(text).map((item) => item.key);
}

/**
 * Resolve all tagged/mentioned citizens from explicit tag selections plus @Name occurrences in text.
 */
export function resolveMentionedUsers(
  text: string,
  allUsers: UserProfile[],
  explicitTagged: TaggedUserRef[] = [],
  excludeUid?: string
): TaggedUserRef[] {
  const byUid = new Map<string, TaggedUserRef>();

  for (const ref of explicitTagged) {
    if (!ref?.uid || !ref?.displayName) continue;
    if (excludeUid && ref.uid === excludeUid) continue;
    byUid.set(ref.uid, {
      uid: ref.uid.slice(0, 128),
      displayName: ref.displayName.trim().slice(0, 100)
    });
  }

  if (text && allUsers.length > 0) {
    const lowerText = text.toLowerCase();
    // Sort by displayName length descending so longer names match cleanly first
    const sortedUsers = [...allUsers]
      .filter((u) => u?.uid && u?.displayName && (!excludeUid || u.uid !== excludeUid))
      .sort((a, b) => b.displayName.length - a.displayName.length);

    for (const u of sortedUsers) {
      const needle = `@${u.displayName.trim().toLowerCase()}`;
      if (needle.length < 2) continue;
      let searchIdx = 0;
      while (searchIdx < lowerText.length) {
        const found = lowerText.indexOf(needle, searchIdx);
        if (found === -1) break;
        const charBefore = found > 0 ? lowerText[found - 1] : ' ';
        const afterIdx = found + needle.length;
        const charAfter = afterIdx < lowerText.length ? lowerText[afterIdx] : ' ';
        const validBefore = /[\s.,!?;:()[\]{}"']/.test(charBefore);
        const validAfter = /[\s.,!?;:()[\]{}"']/.test(charAfter);
        if (validBefore && validAfter) {
          byUid.set(u.uid, {
            uid: u.uid.slice(0, 128),
            displayName: u.displayName.trim().slice(0, 100)
          });
          break;
        }
        searchIdx = found + 1;
      }
      if (byUid.size >= 15) break;
    }
  }

  return Array.from(byUid.values()).slice(0, 15);
}

/**
 * Compute trending hashtags across community posts, weighted by post frequency, engagement, and recency.
 */
export function computeTrendingHashtags(
  posts: CommunityPost[],
  maxTags: number = 12
): TrendingHashtagItem[] {
  const stats = new Map<
    string,
    {
      displayCounts: Map<string, number>;
      postIds: Set<string>;
      engagementCount: number;
      score: number;
    }
  >();

  const nowMs = Date.now();

  for (const post of posts) {
    const combinedText = `${post.title || ''} ${post.content || ''} ${post.mediaCaption || ''}`;
    const extracted = extractHashtagsWithDisplay(combinedText);

    // Include any stored hashtags that weren't in combinedText
    const storedKeys = Array.isArray(post.hashtags) ? post.hashtags : [];
    const mergedMap = new Map<string, string>();
    for (const item of extracted) {
      mergedMap.set(item.key, item.display);
    }
    for (const key of storedKeys) {
      const clean = String(key || '').replace(/^#/, '').trim().toLowerCase();
      if (clean && !mergedMap.has(clean)) {
        mergedMap.set(clean, clean);
      }
    }

    if (mergedMap.size === 0) continue;

    const createdMs = post.createdAt ? Date.parse(post.createdAt) : nowMs;
    const ageHours = Number.isFinite(createdMs) ? Math.max(0, (nowMs - createdMs) / 3600000) : 24;
    const recencyWeight = ageHours <= 24 ? 2.5 : ageHours <= 72 ? 1.6 : 1.0;

    const engagement = (post.upvotes || 0) + (post.commentsCount || 0);
    const postScore = (3 + (post.upvotes || 0) * 1.2 + (post.commentsCount || 0) * 1.8) * recencyWeight;

    for (const [key, display] of mergedMap.entries()) {
      let bucket = stats.get(key);
      if (!bucket) {
        bucket = {
          displayCounts: new Map(),
          postIds: new Set(),
          engagementCount: 0,
          score: 0
        };
        stats.set(key, bucket);
      }
      if (!bucket.postIds.has(post.id)) {
        bucket.postIds.add(post.id);
        bucket.engagementCount += engagement;
        bucket.score += postScore;
      }
      bucket.displayCounts.set(display, (bucket.displayCounts.get(display) || 0) + 1);
    }
  }

  const results: TrendingHashtagItem[] = [];
  for (const [key, bucket] of stats.entries()) {
    let bestDisplay = key;
    let bestCount = -1;
    for (const [disp, cnt] of bucket.displayCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        bestDisplay = disp;
      }
    }
    results.push({
      key,
      tag: bestDisplay,
      postCount: bucket.postIds.size,
      engagementCount: bucket.engagementCount,
      score: bucket.score
    });
  }

  return results
    .sort((a, b) => b.score - a.score || b.postCount - a.postCount || b.engagementCount - a.engagementCount)
    .slice(0, maxTags);
}

/**
 * Check if a post contains a given normalized hashtag key.
 */
export function postMatchesHashtag(post: CommunityPost, hashtagKey: string): boolean {
  const cleanKey = hashtagKey.replace(/^#/, '').trim().toLowerCase();
  if (!cleanKey) return true;
  if (Array.isArray(post.hashtags) && post.hashtags.some((h) => h.toLowerCase() === cleanKey)) {
    return true;
  }
  const combinedText = `${post.title || ''} ${post.content || ''} ${post.mediaCaption || ''}`;
  return extractHashtagKeys(combinedText).includes(cleanKey);
}

/**
 * Tokenize post/comment text into plain text, #hashtag links, and @Profile mention links.
 */
export function tokenizeRichPostText(
  text: string,
  taggedUsers: TaggedUserRef[] = [],
  usersById: Record<string, UserProfile> = {}
): RichTextToken[] {
  if (!text) return [];

  // Build candidate mention lookup sorted longest displayName first
  const candidates = new Map<string, { uid?: string; displayName: string; user?: UserProfile }>();
  for (const u of Object.values(usersById)) {
    if (u?.uid && u?.displayName?.trim()) {
      candidates.set(u.displayName.trim().toLowerCase(), {
        uid: u.uid,
        displayName: u.displayName.trim(),
        user: u
      });
    }
  }
  for (const t of taggedUsers) {
    if (t?.displayName?.trim()) {
      const lower = t.displayName.trim().toLowerCase();
      const existing = candidates.get(lower);
      candidates.set(lower, {
        uid: t.uid || existing?.uid,
        displayName: t.displayName.trim(),
        user: existing?.user || (t.uid ? usersById[t.uid] : undefined)
      });
    }
  }

  const sortedNames = Array.from(candidates.keys()).sort((a, b) => b.length - a.length);
  const tokens: RichTextToken[] = [];
  let cursor = 0;
  let plainBuffer = '';
  const lower = text.toLowerCase();

  const flushPlain = () => {
    if (plainBuffer) {
      tokens.push({ type: 'text', value: plainBuffer });
      plainBuffer = '';
    }
  };

  while (cursor < text.length) {
    const ch = text[cursor];
    const prevCh = cursor > 0 ? text[cursor - 1] : ' ';
    const atBoundary = cursor === 0 || /[\s.,!?;:()[\]{}"']/.test(prevCh);

    if (ch === '#' && atBoundary) {
      const slice = text.slice(cursor);
      const m = /^#([a-zA-Z0-9_]{2,40})\b/.exec(slice);
      if (m && !(/^\d+$/.test(m[1]) && m[1].length > 4)) {
        flushPlain();
        tokens.push({
          type: 'hashtag',
          value: `#${m[1]}`,
          key: m[1].toLowerCase()
        });
        cursor += m[0].length;
        continue;
      }
    }

    if (ch === '@' && atBoundary) {
      let matchedName: string | null = null;
      for (const nameLower of sortedNames) {
        if (lower.startsWith(nameLower, cursor + 1)) {
          const endIdx = cursor + 1 + nameLower.length;
          const nextCh = endIdx < text.length ? text[endIdx] : ' ';
          if (/[\s.,!?;:()[\]{}"']/.test(nextCh)) {
            matchedName = nameLower;
            break;
          }
        }
      }

      if (matchedName) {
        const meta = candidates.get(matchedName)!;
        const rawSlice = text.slice(cursor, cursor + 1 + matchedName.length);
        flushPlain();
        tokens.push({
          type: 'mention',
          value: rawSlice,
          uid: meta.uid,
          displayName: meta.displayName,
          user: meta.user
        });
        cursor += 1 + matchedName.length;
        continue;
      }

      // Fallback single-token @handle highlight if not in directory
      const m = /^@([a-zA-Z0-9_.-]{2,40})\b/.exec(text.slice(cursor));
      if (m) {
        flushPlain();
        tokens.push({
          type: 'mention',
          value: `@${m[1]}`,
          displayName: m[1]
        });
        cursor += m[0].length;
        continue;
      }
    }

    plainBuffer += ch;
    cursor += 1;
  }

  flushPlain();
  return tokens;
}

/**
 * Inspect text before caret/end to detect an active `@mention` or `#hashtag` trigger query.
 */
export function detectActiveTagTrigger(
  text: string,
  caretIndex?: number
): { mode: 'mention' | 'hashtag'; query: string; startIndex: number; endIndex: number } | null {
  const pos = caretIndex !== undefined && caretIndex >= 0 ? caretIndex : text.length;
  const before = text.slice(0, pos);
  const match = /(^|[\s(])([@#])([^\s@#]{0,32})$/.exec(before);
  if (!match) return null;

  const prefixLen = match[1].length;
  const symbol = match[2];
  const query = match[3] || '';
  const startIndex = before.length - match[0].length + prefixLen;

  return {
    mode: symbol === '@' ? 'mention' : 'hashtag',
    query,
    startIndex,
    endIndex: pos
  };
}
