import React from 'react';
import { UserProfile } from '../types/chat';
import { TaggedUserRef } from '../types/community';
import { tokenizeRichPostText } from '../utils/tagParser';

interface RichSocialTextProps {
  text: string;
  taggedUsers?: TaggedUserRef[];
  usersById?: Record<string, UserProfile>;
  onHashtagClick?: (hashtagKey: string) => void;
  onMentionClick?: (user: UserProfile) => void;
  inverted?: boolean;
  className?: string;
}

export const RichSocialText: React.FC<RichSocialTextProps> = ({
  text,
  taggedUsers = [],
  usersById = {},
  onHashtagClick,
  onMentionClick,
  inverted = false,
  className = ''
}) => {
  if (!text) return null;

  const tokens = tokenizeRichPostText(text, taggedUsers, usersById);

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.type === 'hashtag') {
          return (
            <button
              key={`tag-${idx}-${token.key}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHashtagClick?.(token.key);
              }}
              className={`inline font-bold hover:underline cursor-pointer transition-colors ${
                inverted
                  ? 'text-emerald-200 hover:text-white'
                  : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
              }`}
              title={`Filter posts by ${token.value}`}
            >
              {token.value}
            </button>
          );
        }

        if (token.type === 'mention') {
          const targetUser: UserProfile | null = token.user
            ? token.user
            : token.uid
            ? ({
                uid: token.uid,
                displayName: token.displayName,
                email: ''
              } as UserProfile)
            : null;

          if (targetUser && onMentionClick) {
            return (
              <button
                key={`mention-${idx}-${token.uid || token.displayName}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMentionClick(targetUser);
                }}
                className={`inline font-bold hover:underline cursor-pointer rounded px-0.5 transition-colors ${
                  inverted
                    ? 'bg-white/15 text-white hover:bg-white/25'
                    : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/70'
                }`}
                title={`View ${token.displayName}'s profile`}
              >
                {token.value}
              </button>
            );
          }

          return (
            <span
              key={`mention-plain-${idx}`}
              className={`font-semibold ${
                inverted ? 'text-sky-200' : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {token.value}
            </span>
          );
        }

        return <React.Fragment key={`txt-${idx}`}>{token.value}</React.Fragment>;
      })}
    </span>
  );
};
