import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CommunityPoll, PollCategory } from '../types/poll';
import {
  subscribeToCommunityPolls,
  subscribeToUserPollVote,
  castPollVote,
  createCommunityPoll
} from '../services/pollService';
import { ALL_47_COUNTIES } from '../data/kenyaCounties';
import {
  Vote,
  Flame,
  CheckCircle2,
  Users,
  Plus,
  Share2,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  MapPin,
  Lock,
  MessageSquare,
  X,
  Check
} from 'lucide-react';

interface DailyCommunityPollProps {
  onDiscussInFeed?: (pollTitle: string) => void;
  compact?: boolean;
}

export const DailyCommunityPoll: React.FC<DailyCommunityPollProps> = ({
  onDiscussInFeed,
  compact = false
}) => {
  const { currentUser, userProfile, loginWithGoogle } = useAuth();

  const [polls, setPolls] = useState<CommunityPoll[]>([]);
  const [isLoadingPolls, setIsLoadingPolls] = useState(true);
  const [selectedPollIndex, setSelectedPollIndex] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [userVoteOptionId, setUserVoteOptionId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState<boolean>(false);
  const [voteToast, setVoteToast] = useState<string | null>(null);

  // New poll modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<PollCategory>('culture');
  const [newCountyScope, setNewCountyScope] = useState('All Kenya (47 Counties)');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '']);
  const [isSubmittingPoll, setIsSubmittingPoll] = useState<boolean>(false);
  const [pollFormError, setPollFormError] = useState<string | null>(null);

  // Subscribe to all polls
  useEffect(() => {
    const unsubscribe = subscribeToCommunityPolls((loadedPolls) => {
      setPolls(loadedPolls);
      setIsLoadingPolls(false);
    });
    return () => unsubscribe();
  }, []);

  // Filtered polls
  const filteredPolls = polls.filter((p) => {
    if (selectedCategory === 'all') return true;
    return p.category === selectedCategory;
  });

  // Current active poll
  const activePoll = filteredPolls[selectedPollIndex] || filteredPolls[0];

  // Subscribe to user vote for active poll
  useEffect(() => {
    if (!activePoll?.id || !currentUser?.uid) {
      setUserVoteOptionId(null);
      return;
    }

    const unsubscribe = subscribeToUserPollVote(
      activePoll.id,
      currentUser.uid,
      (optId) => {
        setUserVoteOptionId(optId);
      }
    );

    return () => unsubscribe();
  }, [activePoll?.id, currentUser?.uid]);

  // Adjust index if out of range when category changes
  useEffect(() => {
    if (selectedPollIndex >= filteredPolls.length) {
      setSelectedPollIndex(0);
    }
  }, [selectedCategory, filteredPolls.length]);

  const handleCastVote = async (optionId: string) => {
    if (!currentUser) {
      loginWithGoogle();
      return;
    }

    if (!activePoll || isVoting) return;

    if (userVoteOptionId === optionId) {
      return; // Already voted for this option
    }

    setIsVoting(true);
    const prev = userVoteOptionId;
    try {
      await castPollVote(activePoll.id, currentUser.uid, optionId, prev);
      setVoteToast('Kura Yako Imerekodiwa! (Vote recorded successfully)');
      setTimeout(() => setVoteToast(null), 3000);
    } catch (err) {
      console.error('Failed to cast vote:', err);
      setVoteToast('Haikuweza kupiga kura. Please try again.');
      setTimeout(() => setVoteToast(null), 3500);
    } finally {
      setIsVoting(false);
    }
  };

  const handleNextPoll = () => {
    if (filteredPolls.length === 0) return;
    setSelectedPollIndex((prev) => (prev + 1) % filteredPolls.length);
  };

  const handlePrevPoll = () => {
    if (filteredPolls.length === 0) return;
    setSelectedPollIndex((prev) => (prev - 1 + filteredPolls.length) % filteredPolls.length);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      loginWithGoogle();
      return;
    }

    if (!newTitle.trim()) {
      setPollFormError('Tafadhali weka swali la kura (Please enter poll question).');
      return;
    }

    const validOptions = newOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (validOptions.length < 2) {
      setPollFormError('Tafadhali weka angalau machaguo mawili (At least 2 options required).');
      return;
    }

    setIsSubmittingPoll(true);
    setPollFormError(null);
    try {
      await createCommunityPoll(userProfile, {
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory,
        countyScope: newCountyScope,
        options: validOptions
      });

      setNewTitle('');
      setNewDescription('');
      setNewOptions(['', '', '']);
      setIsModalOpen(false);
      setVoteToast('Swali jipya la jamii limechapishwa! (Poll published!)');
      setTimeout(() => setVoteToast(null), 3500);
    } catch (err: any) {
      setPollFormError(err.message || 'Failed to create poll. Please try again.');
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  const handleAddOptionField = () => {
    if (newOptions.length < 6) {
      setNewOptions([...newOptions, '']);
    }
  };

  const handleRemoveOptionField = (idx: number) => {
    if (newOptions.length > 2) {
      setNewOptions(newOptions.filter((_, i) => i !== idx));
    }
  };

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...newOptions];
    updated[idx] = val;
    setNewOptions(updated);
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'culture':
        return { label: 'Utamaduni · Culture', bg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'community':
        return { label: 'Grassroots Community', bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'lifestyle':
        return { label: 'Matatu & Lifestyle', bg: 'bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      case 'governance':
        return { label: 'County Devolution', bg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'sports':
        return { label: 'Team Kenya · Sports', bg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
      default:
        return { label: 'General Voice', bg: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700' };
    }
  };

  if (isLoadingPolls) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xs text-center transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 animate-pulse">
          <Vote className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100">Inapakia Kura za Jamii...</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Loading real-time community polls across Kenya</p>
      </div>
    );
  }

  const categoryBadge = activePoll ? getCategoryBadge(activePoll.category) : null;
  const totalVotesSafe = Math.max(1, activePoll?.totalVotes ?? 0);

  return (
    <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-md overflow-hidden transition-all">
      {/* Toast message */}
      {voteToast && (
        <div className="absolute top-4 right-4 z-30 bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{voteToast}</span>
        </div>
      )}

      {activePoll ? (
      <>
      {/* Decorative Kenyan Flag Top Ribbon */}
      <div className="h-1.5 w-full flex">
        <div className="flex-1 bg-black" />
        <div className="w-1.5 bg-white" />
        <div className="flex-1 bg-red-600" />
        <div className="w-1.5 bg-white" />
        <div className="flex-1 bg-emerald-600" />
      </div>

      {/* Header section */}
      <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50/70 dark:from-slate-800/40 to-white dark:to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
              <Vote className="w-3.5 h-3.5" />
              <span>Daily Community Poll</span>
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-0.8 rounded-lg text-[11px] font-semibold border ${categoryBadge?.bg}`}>
              <Sparkles className="w-3 h-3" />
              <span>{categoryBadge?.label}</span>
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>{activePoll.countyScope || 'Kenya'}</span>
            </span>
          </div>

          {/* Carousel controls & create poll */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {filteredPolls.length > 1 && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={handlePrevPoll}
                  title="Previous Poll"
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {selectedPollIndex + 1} / {filteredPolls.length}
                </span>
                <button
                  onClick={handleNextPoll}
                  title="Next Poll"
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={() => {
                if (!currentUser) loginWithGoogle();
                else setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Propose Poll</span>
            </button>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 mt-4 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'all', label: 'All Polls' },
            { id: 'culture', label: 'Utamaduni (Culture)' },
            { id: 'lifestyle', label: 'Matatu & Lifestyle' },
            { id: 'community', label: 'County Devolution' },
            { id: 'sports', label: 'Team Kenya' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedPollIndex(0);
              }}
              className={`px-3 py-1 rounded-xl font-medium transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Poll Title & Description */}
        <div className="mt-4">
          <div className="flex items-start gap-2">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
              {activePoll.title}
            </h2>
          </div>
          {activePoll.description && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
              {activePoll.description}
            </p>
          )}
        </div>
      </div>

      {/* Options & Live Voting Body */}
      <div className="p-5 sm:p-6 space-y-3">
        {activePoll.options.map((option) => {
          const isSelected = userVoteOptionId === option.id;
          const voteCount = option.votesCount || 0;
          const percentage = activePoll.totalVotes > 0
            ? Math.round((voteCount / totalVotesSafe) * 100)
            : 0;

          return (
            <div
              key={option.id}
              onClick={() => handleCastVote(option.id)}
              className={`relative overflow-hidden rounded-2xl border-2 transition-all cursor-pointer group ${
                isSelected
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/70 hover:bg-slate-50/70 dark:hover:bg-slate-800'
              }`}
            >
              {/* Dynamic live percentage bar fill */}
              <div
                className={`absolute top-0 bottom-0 left-0 transition-all duration-700 ease-out pointer-events-none ${
                  isSelected
                    ? 'bg-emerald-500/20 dark:bg-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-700/50 group-hover:bg-slate-200/60 dark:group-hover:bg-slate-700/70'
                }`}
                style={{ width: `${percentage}%` }}
              />

              <div className="relative z-10 p-3.5 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Selection Radio / Check Indicator */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-600 group-hover:border-slate-400 dark:group-hover:border-slate-500 bg-white dark:bg-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 fill-emerald-600 text-white" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 group-hover:bg-slate-400 dark:group-hover:bg-slate-400" />
                    )}
                  </div>

                  {/* Option Text and Emoji */}
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 block break-words">
                      {option.emoji && <span className="mr-2 text-base">{option.emoji}</span>}
                      {option.text}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mt-0.5">
                        <Check className="w-3 h-3 stroke-[3]" /> Kura Yako (Your Vote)
                      </span>
                    )}
                  </div>
                </div>

                {/* Percentage & Vote Count */}
                <div className="text-right shrink-0">
                  <div className={`text-sm sm:text-base font-extrabold font-mono ${
                    isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
                  }`}>
                    {percentage}%
                  </div>
                  <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 font-mono">
                    {voteCount.toLocaleString()} {voteCount === 1 ? 'vote' : 'votes'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer Meta: Total votes, live pulse indicator & engagement */}
        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
              <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span>{activePoll.totalVotes.toLocaleString()} Citizens Voted</span>
            </span>

            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>Live Updates</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!currentUser ? (
              <button
                onClick={loginWithGoogle}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/80 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign in with Google to Vote</span>
              </button>
            ) : userVoteOptionId ? (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Tap another option anytime to change your ballot
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Click any option above to cast your vote
              </span>
            )}

            {onDiscussInFeed && (
              <button
                onClick={() => onDiscussInFeed(activePoll.title)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Discuss this topic in community feed"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span className="hidden sm:inline">Discuss</span>
              </button>
            )}
          </div>
        </div>
      </div>
      </>
      ) : (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <Vote className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100">No public polls right now</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Earlier polls are hidden. Propose a new poll for the community.
          </p>
          <button
            onClick={() => {
              if (!currentUser) loginWithGoogle();
              else setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Propose Poll</span>
          </button>
        </div>
      )}

      {/* Propose New Poll Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative my-8">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <Vote className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
                  Propose Daily Community Poll
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ask Kenyans on culture, music, matatu heritage, or devolution priorities.
                </p>
              </div>
            </div>

            {pollFormError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-800 dark:text-rose-300 text-xs font-medium">
                {pollFormError}
              </div>
            )}

            <form onSubmit={handleCreatePoll} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Poll Question / Topic *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Which Kenyan city has the best weekend social vibe?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Background Context (Optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Short context or why this matters to the community..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as PollCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="culture">Utamaduni (Culture)</option>
                    <option value="lifestyle">Matatu & Lifestyle</option>
                    <option value="community">Grassroots Community</option>
                    <option value="governance">County Devolution</option>
                    <option value="sports">Team Kenya (Sports)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Scope
                  </label>
                  <select
                    value={newCountyScope}
                    onChange={(e) => setNewCountyScope(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="All Kenya (47 Counties)">All Kenya (47 Counties)</option>
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={`${c} County`}>
                        {c} County
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Options inputs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Options (Minimum 2, Maximum 6) *
                </label>
                <div className="space-y-2">
                  {newOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-5 text-right">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        maxLength={100}
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {newOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOptionField(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {newOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={handleAddOptionField}
                    className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Option</span>
                  </button>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPoll}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPoll ? 'Publishing...' : 'Publish Poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
