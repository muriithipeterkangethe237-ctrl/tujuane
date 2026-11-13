import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Volume2,
  VolumeX,
  Eye,
  Send,
  MapPin,
  Sparkles,
  AlertCircle,
  Pause,
  Play
} from 'lucide-react';
import { UserProfile } from '../../types/chat';
import { CitizenStory, UserStoryGroup } from '../../types/story';
import {
  recordStoryView,
  reactToCitizenStory,
  deleteCitizenStory,
  getRealStoryViewers
} from '../../services/storyService';
import { getOrCreateDirectChat, sendChatMessage } from '../../services/chatService';

interface StoryViewerModalProps {
  isOpen: boolean;
  storyGroups: UserStoryGroup[];
  initialAuthorId?: string;
  currentUser: any;
  userProfile: UserProfile | null;
  onClose: () => void;
  onStoryDeleted?: (storyId: string) => void;
  onViewUserProfile?: (user: UserProfile) => void;
}

const QUICK_STORY_REACTIONS = [
  { emoji: '🔥', label: 'Fire' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '👏', label: 'Applause' },
  { emoji: '🤝', label: 'Respect' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '💯', label: '100%' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '🙏', label: 'Shukrani' },
  { emoji: '🎉', label: 'Shangwe' },
  { emoji: '🦁', label: 'Simba' },
  { emoji: '🇰🇪', label: 'Kenya' }
];

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  storyGroups,
  initialAuthorId,
  currentUser,
  userProfile,
  onClose,
  onStoryDeleted,
  onViewUserProfile
}) => {
  const [activeAuthorId, setActiveAuthorId] = useState<string | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [mediaError, setMediaError] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Initialize author and reset playback state ONLY when modal opens (not on every snapshot update)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const targetAuthor =
        (initialAuthorId && storyGroups.some((g) => g.authorId === initialAuthorId)
          ? initialAuthorId
          : storyGroups[0]?.authorId) || null;
      setActiveAuthorId(targetAuthor);
      setCurrentStoryIndex(0);
      setProgress(0);
      setIsPaused(false);
      setMediaError(false);
      setConfirmDeleteOpen(false);
      setReplyText('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialAuthorId, storyGroups]);

  // If modal opened just as a new story is arriving via snapshot, sync target author once available
  useEffect(() => {
    if (!isOpen) return;
    if (!activeAuthorId && storyGroups.length > 0) {
      const targetAuthor =
        (initialAuthorId && storyGroups.some((g) => g.authorId === initialAuthorId)
          ? initialAuthorId
          : storyGroups[0]?.authorId) || null;
      setActiveAuthorId(targetAuthor);
      setCurrentStoryIndex(0);
      setProgress(0);
    }
  }, [isOpen, activeAuthorId, initialAuthorId, storyGroups]);

  const resolvedGroupIndex = activeAuthorId
    ? storyGroups.findIndex((g) => g.authorId === activeAuthorId)
    : 0;
  const currentGroupIndex = resolvedGroupIndex >= 0 ? resolvedGroupIndex : 0;
  const activeGroup = storyGroups[currentGroupIndex];
  const safeStoryIndex = activeGroup
    ? Math.min(currentStoryIndex, Math.max(0, activeGroup.stories.length - 1))
    : 0;
  const activeStory: CitizenStory | undefined = activeGroup?.stories[safeStoryIndex];

  // Record view only once per unique non-author citizen
  useEffect(() => {
    if (!isOpen || !activeStory || !currentUser?.uid) return;
    if (activeStory.authorId === currentUser.uid) return;
    const realViewers = getRealStoryViewers(activeStory);
    if (realViewers.includes(currentUser.uid)) return;

    recordStoryView(activeStory.id, currentUser.uid);
  }, [isOpen, activeStory?.id, activeStory?.authorId, currentUser?.uid]);

  // Reset media error & progress whenever the active story changes
  useEffect(() => {
    if (!isOpen || !activeStory?.id) return;
    setProgress(0);
    setMediaError(false);
    setConfirmDeleteOpen(false);
  }, [isOpen, activeStory?.id]);

  // Keep HTMLVideoElement playback synced with isPaused & activeStory
  useEffect(() => {
    if (!isOpen || !activeStory || activeStory.type !== 'video') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isPaused || confirmDeleteOpen) {
      videoEl.pause();
    } else {
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Fallback to muted playback if browser blocked unmuted autoplay
          if (videoEl) {
            videoEl.muted = true;
            setIsMuted(true);
            videoEl.play().catch(() => {});
          }
        });
      }
    }
  }, [isOpen, activeStory?.id, activeStory?.type, isPaused, confirmDeleteOpen]);

  // Navigate to next story or next author
  const handleNextStory = useCallback(() => {
    if (!activeGroup) {
      onClose();
      return;
    }

    if (safeStoryIndex < activeGroup.stories.length - 1) {
      setCurrentStoryIndex(safeStoryIndex + 1);
      setProgress(0);
    } else if (currentGroupIndex < storyGroups.length - 1) {
      const nextGroup = storyGroups[currentGroupIndex + 1];
      setActiveAuthorId(nextGroup.authorId);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [activeGroup, safeStoryIndex, currentGroupIndex, storyGroups, onClose]);

  // Navigate to previous story or previous author
  const handlePrevStory = useCallback(() => {
    if (safeStoryIndex > 0) {
      setCurrentStoryIndex(safeStoryIndex - 1);
      setProgress(0);
    } else if (currentGroupIndex > 0) {
      const prevGroup = storyGroups[currentGroupIndex - 1];
      setActiveAuthorId(prevGroup.authorId);
      setCurrentStoryIndex(Math.max(0, prevGroup.stories.length - 1));
      setProgress(0);
    }
  }, [safeStoryIndex, currentGroupIndex, storyGroups]);

  // Pure progress timer loop (never mutates external state inside setProgress updater)
  useEffect(() => {
    if (!isOpen || !activeStory || isPaused || confirmDeleteOpen || mediaError) return;

    const totalSeconds =
      activeStory.type === 'video' ? activeStory.duration || 15 : activeStory.duration || 6;
    const stepIntervalMs = 50;
    const progressStep = 100 / ((totalSeconds * 1000) / stepIntervalMs);

    const timer = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + progressStep));
    }, stepIntervalMs);

    return () => clearInterval(timer);
  }, [isOpen, activeStory?.id, activeStory?.type, activeStory?.duration, isPaused, confirmDeleteOpen, mediaError]);

  // Advance cleanly once progress reaches 100%
  useEffect(() => {
    if (isOpen && activeStory && progress >= 100) {
      handleNextStory();
    }
  }, [isOpen, activeStory, progress, handleNextStory]);

  // Keyboard navigation listener (ignored when typing inside inputs/textareas)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          onClose();
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNextStory();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevStory();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNextStory, handlePrevStory, onClose]);

  if (!isOpen) return null;

  if (!activeGroup || !activeStory) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl select-none"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-md mx-4 rounded-3xl bg-slate-950 border border-white/10 p-8 text-center text-white space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-white/70 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-bold">Loading story...</p>
          <p className="text-xs text-white/60">If this story expired or was removed, tap close.</p>
        </div>
      </div>
    );
  }

  const isOwnStory = Boolean(currentUser && currentUser.uid === activeStory.authorId);
  const isVideo = activeStory.type === 'video';
  const authorDisplayName = activeStory.authorName || 'Citizen Member';
  const realViewers = getRealStoryViewers(activeStory);
  const realViewsCount = realViewers.length;

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / (60 * 1000));
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    } catch {
      return '';
    }
  };

  const handleSendReaction = async (emoji: string) => {
    if (!currentUser) {
      setFeedbackToast('Sign in to react to stories');
      setTimeout(() => setFeedbackToast(null), 2000);
      return;
    }
    try {
      await reactToCitizenStory(activeStory.id, currentUser.uid, emoji);
      setFeedbackToast(`Reacted with ${emoji}`);
      setTimeout(() => setFeedbackToast(null), 2000);
    } catch (err) {
      console.error('Error reacting to story:', err);
      setFeedbackToast('Could not save reaction');
      setTimeout(() => setFeedbackToast(null), 2000);
    }
  };

  const handleSendReplyMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentUser || !userProfile || isOwnStory) return;

    setIsSendingReply(true);
    try {
      const targetUser: UserProfile = {
        uid: activeStory.authorId,
        displayName: authorDisplayName,
        email: '',
        photoURL: activeStory.authorPhotoUrl,
        county: activeStory.authorCounty || 'Kenya',
        createdAt: ''
      };
      const chatId = await getOrCreateDirectChat(userProfile, targetUser);
      const messageContent = `Replied to your story: "${replyText.trim()}"`;
      await sendChatMessage(
        chatId,
        userProfile,
        activeStory.authorId,
        messageContent,
        undefined,
        activeStory.type === 'image' ? activeStory.mediaUrl : undefined
      );

      setReplyText('');
      setFeedbackToast('Reply sent to direct inbox!');
      setTimeout(() => setFeedbackToast(null), 2500);
    } catch (err) {
      console.error('Error sending story reply:', err);
      setFeedbackToast('Could not send reply.');
      setTimeout(() => setFeedbackToast(null), 2500);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleConfirmDeleteStory = async () => {
    setIsDeleting(true);
    try {
      const deletedId = activeStory.id;
      await deleteCitizenStory(deletedId);
      setConfirmDeleteOpen(false);
      if (onStoryDeleted) onStoryDeleted(deletedId);
      if (activeGroup.stories.length <= 1) {
        if (currentGroupIndex < storyGroups.length - 1) {
          setActiveAuthorId(storyGroups[currentGroupIndex + 1].authorId);
          setCurrentStoryIndex(0);
          setProgress(0);
        } else {
          onClose();
        }
      } else {
        setCurrentStoryIndex((prev) => Math.max(0, Math.min(prev, activeGroup.stories.length - 2)));
        setProgress(0);
      }
    } catch (err) {
      console.error('Error deleting story:', err);
      setFeedbackToast('Could not delete story.');
      setTimeout(() => setFeedbackToast(null), 2500);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl select-none"
      onClick={onClose}
    >
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed top-6 inset-x-0 mx-auto w-max z-60 bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Main Story Container (9:16 mobile aspect ratio frame) */}
      <div
        className="relative w-full h-full max-w-md max-h-[100dvh] md:max-h-[92vh] md:rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP SEGMENTS PROGRESS BAR */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 pt-3.5 flex items-center gap-1.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {activeGroup.stories.map((story, idx) => {
            let fillWidth = '0%';
            if (idx < safeStoryIndex) {
              fillWidth = '100%';
            } else if (idx === safeStoryIndex) {
              fillWidth = `${progress}%`;
            }
            return (
              <div
                key={story.id}
                className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden cursor-pointer"
                onClick={() => {
                  setCurrentStoryIndex(idx);
                  setProgress(0);
                }}
              >
                <div
                  className="h-full bg-white rounded-full transition-all duration-75"
                  style={{ width: fillWidth }}
                />
              </div>
            );
          })}
        </div>

        {/* TOP AUTHOR HEADER & CONTROLS */}
        <div className="absolute top-6 inset-x-0 z-30 px-3.5 py-2 flex items-center justify-between text-white bg-gradient-to-b from-black/60 to-transparent">
          <div
            onClick={() => {
              if (onViewUserProfile) {
                onViewUserProfile({
                  uid: activeStory.authorId,
                  displayName: authorDisplayName,
                  email: '',
                  photoURL: activeStory.authorPhotoUrl,
                  county: activeStory.authorCounty || 'Kenya',
                  createdAt: ''
                });
              }
            }}
            className="flex items-center gap-2.5 cursor-pointer group min-w-0"
          >
            {activeStory.authorPhotoUrl ? (
              <img
                src={activeStory.authorPhotoUrl}
                alt={authorDisplayName}
                className="w-9 h-9 rounded-full object-cover border-2 border-emerald-400 group-hover:scale-105 transition-transform shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs border border-white/20 shrink-0">
                {authorDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 truncate">
                <span className="truncate group-hover:underline">{authorDisplayName}</span>
                <span className="text-[10px] text-white/70 font-normal shrink-0">
                  · {formatRelativeTime(activeStory.createdAt)}
                </span>
              </div>
              {activeStory.authorCounty && (
                <div className="text-[10px] text-emerald-300 font-medium flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>{activeStory.authorCounty} County</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="p-2 text-white/80 hover:text-white rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
              title={isPaused ? 'Resume story' : 'Pause story'}
              aria-label={isPaused ? 'Resume story' : 'Pause story'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>

            {isVideo && (
              <button
                type="button"
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMuted;
                  }
                }}
                className="p-2 text-white/80 hover:text-white rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {isOwnStory && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-2 text-rose-400 hover:text-rose-300 rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
                title="Delete this story"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MEDIA DISPLAY (PHOTO OR VIDEO) */}
        <div
          className="relative flex-1 w-full h-full flex items-center justify-center bg-black"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {mediaError ? (
            <div className="px-6 text-center text-white/80 space-y-2 z-10">
              <AlertCircle className="w-9 h-9 text-amber-400 mx-auto" />
              <p className="text-sm font-bold">Could not load this story media</p>
              <button
                type="button"
                onClick={handleNextStory}
                className="px-4 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
              >
                Skip to Next
              </button>
            </div>
          ) : isVideo ? (
            <video
              key={activeStory.id}
              ref={videoRef}
              src={activeStory.mediaUrl}
              autoPlay
              playsInline
              muted={isMuted}
              onEnded={handleNextStory}
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              key={activeStory.id}
              src={activeStory.mediaUrl}
              alt="Citizen story"
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain"
            />
          )}

          {/* TAP NAVIGATION ZONES (Left / Right, avoiding header & footer controls) */}
          <div
            className="absolute left-0 top-24 bottom-32 w-1/3 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevStory();
            }}
            title="Previous story"
          />
          <div
            className="absolute right-0 top-24 bottom-32 w-1/3 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleNextStory();
            }}
            title="Next story"
          />

          {/* Desktop Hover Navigation Buttons */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevStory();
            }}
            className="hidden md:flex absolute -left-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer shadow-lg"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNextStory();
            }}
            className="hidden md:flex absolute -right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer shadow-lg"
            title="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Inline Delete Confirmation Overlay */}
        {confirmDeleteOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="bg-slate-900 border border-white/15 rounded-2xl p-5 max-w-xs w-full text-center space-y-4 shadow-2xl">
              <h4 className="text-sm font-extrabold text-white">Delete this story?</h4>
              <p className="text-xs text-white/70">
                This story will be permanently removed from the 24h tray.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteStory}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM STORY OVERLAY: Caption, Real Views, Quick Reactions & Reply */}
        <div
          className="absolute bottom-0 inset-x-0 z-30 p-4 space-y-2.5 bg-gradient-to-t from-black/90 via-black/70 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Caption */}
          {activeStory.caption && (
            <div className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white text-xs sm:text-sm text-center font-medium border border-white/10 shadow-lg">
              {activeStory.caption}
            </div>
          )}

          {/* Real Unique Viewers & Reaction Pills */}
          <div className="flex items-center justify-between gap-2 text-xs text-white/80">
            {isOwnStory ? (
              <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 shrink-0">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold">
                  {realViewsCount} {realViewsCount === 1 ? 'view' : 'views'}
                </span>
              </div>
            ) : (
              <div />
            )}

            {/* Quick Reactions Bar */}
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 max-w-[230px] sm:max-w-xs overflow-x-auto scrollbar-none">
              {QUICK_STORY_REACTIONS.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => handleSendReaction(r.emoji)}
                  className="shrink-0 hover:scale-125 transition-transform p-0.5 cursor-pointer text-sm"
                  title={r.label}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Reply Form (only for stories authored by other citizens) */}
          {!isOwnStory && currentUser && (
            <form onSubmit={handleSendReplyMessage} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${authorDisplayName}...`}
                className="flex-1 px-4 py-2 bg-black/60 border border-white/20 rounded-full text-xs text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 backdrop-blur-md"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || isSendingReply}
                className="p-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold rounded-full transition-all cursor-pointer shadow-md"
                title="Send reply"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
