import React from 'react';

interface FeedPostSkeletonListProps {
  count?: number;
}

export const FeedPostSkeletonList: React.FC<FeedPostSkeletonListProps> = ({ count = 3 }) => {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-label="Loading community discussions"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="tujuane-surface rounded-2xl p-4 sm:p-6 space-y-4 animate-pulse"
        >
          {/* Author header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="space-y-2 flex-1 max-w-xs">
                <div className="h-3.5 w-36 rounded-md bg-slate-200 dark:bg-slate-800" />
                <div className="h-2.5 w-48 rounded-md bg-slate-100 dark:bg-slate-800/70" />
              </div>
            </div>
            <div className="h-6 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70 shrink-0" />
          </div>

          {/* Title & Body lines */}
          <div className="space-y-2.5">
            <div className="h-4 w-3/4 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-full rounded-md bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-3 w-11/12 rounded-md bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-3 w-2/3 rounded-md bg-slate-100 dark:bg-slate-800/70" />
          </div>

          {/* Media placeholder on first card for realistic visual rhythm */}
          {index === 0 && (
            <div className="w-full h-48 sm:h-60 rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
          )}

          {/* Action footer */}
          <div className="pt-3 border-t tujuane-divider flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
              <div className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
              <div className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
            </div>
            <div className="h-7 w-20 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface ChatInboxSkeletonListProps {
  count?: number;
}

export const ChatInboxSkeletonList: React.FC<ChatInboxSkeletonListProps> = ({ count = 6 }) => {
  return (
    <div
      className="space-y-1.5 px-1 py-1 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Loading conversations"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="p-2.5 rounded-2xl flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`h-3 rounded-md bg-slate-200 dark:bg-slate-800 ${
                  index % 2 === 0 ? 'w-28' : 'w-36'
                }`}
              />
              <div className="h-2.5 w-10 rounded-md bg-slate-100 dark:bg-slate-800/70 shrink-0" />
            </div>
            <div
              className={`h-2.5 rounded-md bg-slate-100 dark:bg-slate-800/70 ${
                index % 3 === 0 ? 'w-4/5' : 'w-3/5'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export const ChatThreadSkeleton: React.FC = () => {
  const bubbles: Array<{ isMe: boolean; width: string; lines: number }> = [
    { isMe: false, width: 'w-56 sm:w-72', lines: 2 },
    { isMe: true, width: 'w-48 sm:w-64', lines: 1 },
    { isMe: false, width: 'w-64 sm:w-80', lines: 3 },
    { isMe: true, width: 'w-52 sm:w-60', lines: 2 },
    { isMe: false, width: 'w-40 sm:w-52', lines: 1 },
  ];

  return (
    <div
      className="space-y-3.5 py-2 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Loading messages"
    >
      {bubbles.map((b, idx) => (
        <div
          key={idx}
          className={`flex flex-col ${b.isMe ? 'items-end' : 'items-start'}`}
        >
          <div
            className={`rounded-2xl p-3.5 space-y-2 ${b.width} ${
              b.isMe
                ? 'bg-emerald-600/20 dark:bg-emerald-900/30 rounded-br-xs'
                : 'bg-white/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs'
            }`}
          >
            {Array.from({ length: b.lines }).map((__, lineIdx) => (
              <div
                key={lineIdx}
                className={`h-3 rounded-md ${
                  b.isMe
                    ? 'bg-emerald-700/25 dark:bg-emerald-400/20'
                    : 'bg-slate-200 dark:bg-slate-700'
                } ${lineIdx === b.lines - 1 && b.lines > 1 ? 'w-3/4' : 'w-full'}`}
              />
            ))}
            <div className="flex justify-end pt-0.5">
              <div
                className={`h-2 w-10 rounded-sm ${
                  b.isMe
                    ? 'bg-emerald-700/20 dark:bg-emerald-400/15'
                    : 'bg-slate-100 dark:bg-slate-700/70'
                }`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

interface StoriesRowSkeletonProps {
  count?: number;
}

export const StoriesRowSkeleton: React.FC<StoriesRowSkeletonProps> = ({ count = 5 }) => {
  return (
    <div
      className="flex items-center gap-3 sm:gap-4 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Loading stories"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col items-center shrink-0 w-16 sm:w-18 space-y-1.5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-2.5 w-12 rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-2 w-9 rounded-md bg-slate-100 dark:bg-slate-800/70" />
        </div>
      ))}
    </div>
  );
};

