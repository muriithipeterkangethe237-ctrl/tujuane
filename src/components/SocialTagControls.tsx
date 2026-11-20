import React, { useMemo, useState } from 'react';
import { UserProfile } from '../types/chat';
import { TaggedUserRef } from '../types/community';
import { TrendingHashtagItem, detectActiveTagTrigger } from '../utils/tagParser';
import { Hash, AtSign, UserPlus, X, Flame, Search } from 'lucide-react';

const DEFAULT_SUGGESTED_HASHTAGS = [
  'KenyaVoices',
  'CivicAction',
  'CountyWatch',
  'YouthEmpowerment',
  'MtaaniUpdates',
  'AgriKenya',
  'CleanWater',
  'TechKenya'
];

interface InlineTagSuggestionsProps {
  text: string;
  users: UserProfile[];
  currentUserId?: string;
  trendingHashtags: TrendingHashtagItem[];
  onSelectMention: (user: UserProfile, startIndex: number, endIndex: number) => void;
  onSelectHashtag: (tag: string, startIndex: number, endIndex: number) => void;
  compact?: boolean;
}

export const InlineTagSuggestions: React.FC<InlineTagSuggestionsProps> = ({
  text,
  users,
  currentUserId,
  trendingHashtags,
  onSelectMention,
  onSelectHashtag,
  compact = false
}) => {
  const trigger = useMemo(() => detectActiveTagTrigger(text), [text]);

  const matchingUsers = useMemo(() => {
    if (!trigger || trigger.mode !== 'mention') return [];
    const q = trigger.query.trim().toLowerCase();
    return users
      .filter((u) => u?.uid && u.uid !== currentUserId && u.displayName?.trim())
      .filter((u) => {
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          (u.county || '').toLowerCase().includes(q)
        );
      })
      .slice(0, compact ? 4 : 6);
  }, [trigger, users, currentUserId, compact]);

  const matchingTags = useMemo(() => {
    if (!trigger || trigger.mode !== 'hashtag') return [];
    const q = trigger.query.trim().toLowerCase();
    const seen = new Map<string, { tag: string; postCount?: number }>();

    for (const item of trendingHashtags) {
      if (!q || item.key.includes(q) || item.tag.toLowerCase().includes(q)) {
        seen.set(item.key, { tag: item.tag, postCount: item.postCount });
      }
    }

    for (const preset of DEFAULT_SUGGESTED_HASHTAGS) {
      const key = preset.toLowerCase();
      if (!seen.has(key) && (!q || key.includes(q))) {
        seen.set(key, { tag: preset });
      }
    }

    return Array.from(seen.values()).slice(0, compact ? 5 : 7);
  }, [trigger, trendingHashtags, compact]);

  if (!trigger) return null;
  if (trigger.mode === 'mention' && matchingUsers.length === 0) return null;
  if (trigger.mode === 'hashtag' && matchingTags.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20">
      <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {trigger.mode === 'mention' ? (
          <>
            <AtSign className="w-3 h-3 text-sky-500" />
            <span>Tag Citizen Profile</span>
          </>
        ) : (
          <>
            <Hash className="w-3 h-3 text-emerald-500" />
            <span>Trending &amp; Suggested Hashtags</span>
          </>
        )}
      </div>

      {trigger.mode === 'mention' ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
          {matchingUsers.map((user) => (
            <button
              key={user.uid}
              type="button"
              onClick={() => onSelectMention(user, trigger.startIndex, trigger.endIndex)}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {user.displayName}
                </div>
                {user.county && (
                  <div className="text-[10px] text-slate-400 truncate">{user.county}</div>
                )}
              </div>
              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">Tag</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-2 flex flex-wrap gap-1.5">
          {matchingTags.map((item) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => onSelectHashtag(item.tag, trigger.startIndex, trigger.endIndex)}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>#{item.tag}</span>
              {item.postCount !== undefined && (
                <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                  · {item.postCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface ProfileTagBarProps {
  taggedUsers: TaggedUserRef[];
  onAddTaggedUser: (user: UserProfile) => void;
  onRemoveTaggedUser: (uid: string) => void;
  allUsers: UserProfile[];
  currentUserId?: string;
  showPicker: boolean;
  onTogglePicker: () => void;
  trendingHashtags?: TrendingHashtagItem[];
  onInsertHashtag?: (tag: string) => void;
}

export const ProfileTagBar: React.FC<ProfileTagBarProps> = ({
  taggedUsers,
  onAddTaggedUser,
  onRemoveTaggedUser,
  allUsers,
  currentUserId,
  showPicker,
  onTogglePicker,
  trendingHashtags = [],
  onInsertHashtag
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const availableUsers = useMemo(() => {
    const taggedIds = new Set(taggedUsers.map((t) => t.uid));
    const q = searchQuery.trim().toLowerCase();
    return allUsers
      .filter(
        (u) =>
          u?.uid &&
          u.uid !== currentUserId &&
          !taggedIds.has(u.uid) &&
          u.displayName?.trim()
      )
      .filter((u) => {
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          (u.county || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [allUsers, taggedUsers, currentUserId, searchQuery]);

  const quickTags = useMemo(() => {
    if (trendingHashtags.length > 0) {
      return trendingHashtags.slice(0, 5).map((t) => t.tag);
    }
    return DEFAULT_SUGGESTED_HASHTAGS.slice(0, 4);
  }, [trendingHashtags]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onTogglePicker}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
            showPicker || taggedUsers.length > 0
              ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Tag Profiles{taggedUsers.length > 0 ? ` (${taggedUsers.length})` : ''}</span>
        </button>

        {onInsertHashtag &&
          quickTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onInsertHashtag(tag)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/50 flex items-center gap-1 cursor-pointer transition-colors"
              title={`Insert #${tag}`}
            >
              <Flame className="w-2.5 h-2.5 text-amber-500" />
              <span>#{tag}</span>
            </button>
          ))}
      </div>

      {taggedUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {taggedUsers.map((t) => (
            <span
              key={t.uid}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-[11px] font-bold"
            >
              <span>@{t.displayName}</span>
              <button
                type="button"
                onClick={() => onRemoveTaggedUser(t.uid)}
                className="p-0.5 hover:bg-sky-200 dark:hover:bg-sky-800 rounded-full cursor-pointer"
                aria-label={`Remove tag ${t.displayName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {showPicker && (
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search citizens by name or county to tag..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {availableUsers.length === 0 ? (
            <div className="text-[11px] text-slate-400 text-center py-2">
              {searchQuery ? 'No matching citizen profiles found.' : 'All available citizens are already tagged.'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {availableUsers.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => onAddTaggedUser(u)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[9px] font-bold">
                    {u.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate max-w-[140px]">{u.displayName}</span>
                  {u.county && (
                    <span className="text-[9px] text-slate-400 hidden sm:inline">· {u.county}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
