import React, { useState } from 'react';
import {
  Award,
  ShieldCheck,
  Trophy,
  Vote,
  MessagesSquare,
  Mic,
  Compass,
  Lock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import {
  AchievementBadge,
  AchievementBadgeId,
  UserActivityMetrics
} from '../utils/achievementBadges';

interface AchievementBadgesSectionProps {
  badges: AchievementBadge[];
  metrics: UserActivityMetrics;
  isOwnProfile: boolean;
}

function getBadgeVisuals(id: AchievementBadgeId, unlocked: boolean) {
  if (!unlocked) {
    return {
      cardBg:
        'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/90 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600',
      medallionBg: 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ring-slate-300/60 dark:ring-slate-700/80',
      titleColor: 'text-slate-600 dark:text-slate-400',
      tierColor: 'text-slate-500 dark:text-slate-400',
      progressBar: 'bg-slate-400 dark:bg-slate-500',
      Icon: getBadgeIcon(id)
    };
  }

  switch (id) {
    case 'verified_resident':
      return {
        cardBg:
          'bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 dark:from-emerald-950/55 dark:via-slate-900 dark:to-teal-950/40 border-emerald-300/80 dark:border-emerald-700/70 hover:border-emerald-400 dark:hover:border-emerald-500',
        medallionBg:
          'bg-gradient-to-br from-emerald-500 to-teal-700 text-white ring-emerald-300/70 dark:ring-emerald-500/40 shadow-sm shadow-emerald-600/25',
        titleColor: 'text-emerald-950 dark:text-emerald-100',
        tierColor: 'text-emerald-700 dark:text-emerald-400',
        progressBar: 'bg-emerald-500',
        Icon: ShieldCheck
      };
    case 'top_contributor':
      return {
        cardBg:
          'bg-gradient-to-br from-amber-50 via-white to-orange-50/80 dark:from-amber-950/50 dark:via-slate-900 dark:to-orange-950/35 border-amber-300/80 dark:border-amber-700/70 hover:border-amber-400 dark:hover:border-amber-500',
        medallionBg:
          'bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-600 text-slate-950 ring-amber-300/80 dark:ring-amber-500/40 shadow-sm shadow-amber-500/30',
        titleColor: 'text-amber-950 dark:text-amber-100',
        tierColor: 'text-amber-700 dark:text-amber-400',
        progressBar: 'bg-amber-500',
        Icon: Trophy
      };
    case 'daily_poll_hero':
      return {
        cardBg:
          'bg-gradient-to-br from-indigo-50 via-white to-sky-50/80 dark:from-indigo-950/50 dark:via-slate-900 dark:to-sky-950/35 border-indigo-300/80 dark:border-indigo-700/70 hover:border-indigo-400 dark:hover:border-indigo-500',
        medallionBg:
          'bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-600 text-white ring-indigo-300/75 dark:ring-indigo-500/40 shadow-sm shadow-indigo-600/25',
        titleColor: 'text-indigo-950 dark:text-indigo-100',
        tierColor: 'text-indigo-700 dark:text-indigo-400',
        progressBar: 'bg-indigo-500',
        Icon: Vote
      };
    case 'conversation_catalyst':
      return {
        cardBg:
          'bg-gradient-to-br from-rose-50 via-white to-pink-50/80 dark:from-rose-950/45 dark:via-slate-900 dark:to-pink-950/35 border-rose-300/80 dark:border-rose-700/70 hover:border-rose-400 dark:hover:border-rose-500',
        medallionBg:
          'bg-gradient-to-br from-rose-500 to-pink-600 text-white ring-rose-300/75 dark:ring-rose-500/40 shadow-sm shadow-rose-600/25',
        titleColor: 'text-rose-950 dark:text-rose-100',
        tierColor: 'text-rose-700 dark:text-rose-400',
        progressBar: 'bg-rose-500',
        Icon: MessagesSquare
      };
    case 'voice_of_mtaa':
      return {
        cardBg:
          'bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/80 dark:from-purple-950/50 dark:via-slate-900 dark:to-fuchsia-950/35 border-purple-300/80 dark:border-purple-700/70 hover:border-purple-400 dark:hover:border-purple-500',
        medallionBg:
          'bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600 text-white ring-purple-300/75 dark:ring-purple-500/40 shadow-sm shadow-purple-600/25',
        titleColor: 'text-purple-950 dark:text-purple-100',
        tierColor: 'text-purple-700 dark:text-purple-400',
        progressBar: 'bg-purple-500',
        Icon: Mic
      };
    case 'civic_scout':
    default:
      return {
        cardBg:
          'bg-gradient-to-br from-teal-50 via-white to-cyan-50/80 dark:from-teal-950/50 dark:via-slate-900 dark:to-cyan-950/35 border-teal-300/80 dark:border-teal-700/70 hover:border-teal-400 dark:hover:border-teal-500',
        medallionBg:
          'bg-gradient-to-br from-teal-500 to-cyan-700 text-white ring-teal-300/75 dark:ring-teal-500/40 shadow-sm shadow-teal-600/25',
        titleColor: 'text-teal-950 dark:text-teal-100',
        tierColor: 'text-teal-700 dark:text-teal-400',
        progressBar: 'bg-teal-500',
        Icon: Compass
      };
  }
}

function getBadgeIcon(id: AchievementBadgeId) {
  switch (id) {
    case 'verified_resident':
      return ShieldCheck;
    case 'top_contributor':
      return Trophy;
    case 'daily_poll_hero':
      return Vote;
    case 'conversation_catalyst':
      return MessagesSquare;
    case 'voice_of_mtaa':
      return Mic;
    case 'civic_scout':
    default:
      return Compass;
  }
}

export const AchievementBadgesSection: React.FC<AchievementBadgesSectionProps> = ({
  badges,
  metrics,
  isOwnProfile
}) => {
  const earnedBadges = badges.filter((b) => b.unlocked);
  const [showAllBadges, setShowAllBadges] = useState<boolean>(false);
  const [selectedBadgeId, setSelectedBadgeId] = useState<AchievementBadgeId | null>(null);

  // If zero badges are unlocked yet, show all locked milestones automatically so progress is clear
  const visibleBadges = showAllBadges || earnedBadges.length === 0 ? badges : earnedBadges;
  const selectedBadge = badges.find((b) => b.id === selectedBadgeId) || null;

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            Citizen Achievements
          </span>
          <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {earnedBadges.length}/{badges.length} Earned
          </span>
        </div>

        {earnedBadges.length > 0 && earnedBadges.length < badges.length && (
          <button
            type="button"
            onClick={() => setShowAllBadges((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            <span>{showAllBadges ? 'Earned Only' : `View All (${badges.length})`}</span>
            {showAllBadges ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Empty earned hint when viewing someone or own profile with 0 unlocked */}
      {earnedBadges.length === 0 && (
        <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>
            {isOwnProfile
              ? 'Post in the Community Feed, vote in Daily Polls, or complete your profile to unlock your first badge!'
              : 'No badges unlocked yet — milestones update live as this citizen participates in Community Feed & Polls.'}
          </span>
        </div>
      )}

      {/* Visual Achievement Medallion Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {visibleBadges.map((badge) => {
          const visuals = getBadgeVisuals(badge.id, badge.unlocked);
          const IconComponent = visuals.Icon;
          const isSelected = selectedBadgeId === badge.id;

          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => setSelectedBadgeId((prev) => (prev === badge.id ? null : badge.id))}
              className={`group relative text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                visuals.cardBg
              } ${
                isSelected
                  ? 'ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-md scale-[1.01]'
                  : 'hover:shadow-sm'
              }`}
              title={`${badge.title}: ${badge.criteriaLabel}`}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Sculpted Emblem Medallion */}
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ring-2 transition-transform group-hover:scale-105 shrink-0 ${visuals.medallionBg}`}
                >
                  <IconComponent className="w-5 h-5 stroke-[2.2]" />
                </div>

                {/* Status Corner Indicator */}
                {badge.unlocked ? (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold ${visuals.tierColor}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{badge.tierLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>{badge.tierLabel}</span>
                  </span>
                )}
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className={`text-xs font-extrabold leading-tight truncate ${visuals.titleColor}`}>
                  {badge.title}
                </div>
                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {badge.proofText}
                </div>
              </div>

              {/* Subtle progress track for locked badges */}
              {!badge.unlocked && (
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-auto">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${visuals.progressBar}`}
                    style={{ width: `${badge.progressPercent}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Interactive Selected Badge Criteria & Live Feed Activity Breakdown */}
      {selectedBadge && (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-slate-900 dark:text-white">
                  {selectedBadge.title}
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    selectedBadge.unlocked
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  · {selectedBadge.unlocked ? 'Unlocked' : `${selectedBadge.progressPercent}% Progress`}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {selectedBadge.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedBadgeId(null)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
            >
              Hide
            </button>
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium pt-1 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2 flex-wrap">
            <span>How to earn: {selectedBadge.criteriaLabel}</span>
            {metrics.isLoadingRemote && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Syncing activity...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
