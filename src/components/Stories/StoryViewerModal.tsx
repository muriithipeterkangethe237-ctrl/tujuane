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
  Play,
  Pause,
  Sparkles
} from 'lucide-react';
import { UserProfile } from '../../types/chat';
import { CitizenStory, UserStoryGroup } from '../../types/story';
import { recordStoryView, reactToCitizenStory, deleteCitizenStory } from '../../services/storyService';
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
  const [currentGroupIndex, setCurrentGroupIndex] = useState<number>(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressTimerRef = useRef<any>(null);

  // Initialize group index when opened
  useEffect(() => {
    if (initialAuthorId && storyGroups.length > 0) {
      const idx = storyGroups.findIndex((g) => g.authorId === initialAuthorId);
      if (idx !== -1) {
        setCurrentGroupIndex(idx);
        setCurrentStoryIndex(0);
      }
    }
  }, [initialAuthorId, storyGroups]);

  const activeGroup = storyGroups[currentGroupIndex];
  const activeStory: CitizenStory | undefined = activeGroup?.stories[currentStoryIndex];

  // Auto-record view when active story changes
  useEffect(() => {
    if (activeStory && currentUser) {
      recordStoryView(activeStory.id, currentUser.uid);
    }
  }, [activeStory?.id, currentUser?.uid]);

  // Navigate to next story or next author
  const handleNextStory = useCallback(() => {
    if (!activeGroup) return;

    if (currentStoryIndex < activeGroup.stories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      // Go to next author group if available
      if (currentGroupIndex < storyGroups.length - 1) {
        setCurrentGroupIndex((prev) => prev + 1);
        setCurrentStoryIndex(0);
        setProgress(0);
      } else {
        // Reached end of all stories
        onClose();
      }
    }
  }, [activeGroup, currentStoryIndex, currentGroupIndex, storyGroups.length, onClose]);

  // Navigate to previous story or previous author
  const handlePrevStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else {
      if (currentGroupIndex > 0) {
        const prevGroup = storyGroups[currentGroupIndex - 1];
        setCurrentGroupIndex((prev) => prev - 1);
        setCurrentStoryIndex(prevGroup.stories.length - 1);
        setProgress(0);
      }
    }
  }, [currentStoryIndex, currentGroupIndex, storyGroups]);

  // Timer loop for progress bar
  useEffect(() => {
    if (!isOpen || !activeStory || isPaused) return;

    const totalSeconds = activeStory.type === 'video' ? (activeStory.duration || 10) : (activeStory.duration || 6);
    const stepIntervalMs = 50;
    const progressStep = 100 / ((totalSeconds * 1000) / stepIntervalMs);

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimerRef.current);
          handleNextStory();
          return 0;
        }
        return prev + progressStep;
      });
    }, stepIntervalMs);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isOpen, activeStory?.id, isPaused, handleNextStory]);

  // Keyboard navigation listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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

  if (!isOpen || !activeGroup || !activeStory) return null;

  const isOwnStory = currentUser && currentUser.uid === activeStory.authorId;
  const isVideo = activeStory.type === 'video';

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
    if (!currentUser) return;
    try {
      await reactToCitizenStory(activeStory.id, currentUser.uid, emoji);
      setFeedbackToast(`Reacted with ${emoji}`);
      setTimeout(() => setFeedbackToast(null), 2000);
    } catch (err) {
      console.error('Error reacting to story:', err);
    }
  };

  const handleSendReplyMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentUser || !userProfile || isOwnStory) return;

    setIsSendingReply(true);
    try {
      // Send direct chat message referencing story
      const targetUser: UserProfile = {
        uid: activeStory.authorId,
        displayName: activeStory.authorName,
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

  const handleDeleteStory = async () => {
    if (!window.confirm('Delete this story? This action cannot be undone.')) return;
    try {
      await deleteCitizenStory(activeStory.id);
      if (onStoryDeleted) onStoryDeleted(activeStory.id);
      if (activeGroup.stories.length <= 1) {
        onClose();
      } else {
        handleNextStory();
      }
    } catch (err) {
      console.error('Error deleting story:', err);
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
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* TOP SEGMENTS PROGRESS BAR */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 pt-3.5 flex items-center gap-1.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {activeGroup.stories.map((story, idx) => {
            let fillWidth = '0%';
            if (idx < currentStoryIndex) {
              fillWidth = '100%';
            } else if (idx === currentStoryIndex) {
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
                  displayName: activeStory.authorName,
                  email: '',
                  photoURL: activeStory.authorPhotoUrl,
                  county: activeStory.authorCounty || 'Kenya',
                  createdAt: ''
                });
              }
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            {activeStory.authorPhotoUrl ? (
              <img
                src={activeStory.authorPhotoUrl}
                alt={activeStory.authorName}
                className="w-9 h-9 rounded-full object-cover border-2 border-emerald-400 group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs border border-white/20">
                {activeStory.authorName.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 truncate">
                <span className="truncate group-hover:underline">{activeStory.authorName}</span>
                <span className="text-[10px] text-white/70 font-normal">
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

          <div className="flex items-center gap-1">
            {isVideo && (
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
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
                onClick={handleDeleteStory}
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
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black">
          {isVideo ? (
            <video
              ref={videoRef}
              src={activeStory.mediaUrl}
              autoPlay
              playsInline
              muted={isMuted}
              onEnded={handleNextStory}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={activeStory.mediaUrl}
              alt="Citizen story"
              className="w-full h-full object-contain"
            />
          )}

          {/* TAP NAVIGATION ZONES (Left / Right) */}
          <div
            className="absolute left-0 top-16 bottom-24 w-1/3 z-20 cursor-pointer"
            onClick={handlePrevStory}
            title="Previous story"
          />
          <div
            className="absolute right-0 top-16 bottom-24 w-1/3 z-20 cursor-pointer"
            onClick={handleNextStory}
            title="Next story"
          />

          {/* Desktop Hover Navigation Buttons */}
          <button
            type="button"
            onClick={handlePrevStory}
            className="hidden md:flex absolute -left-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer shadow-lg"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={handleNextStory}
            className="hidden md:flex absolute -right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer shadow-lg"
            title="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* BOTTOM STORY OVERLAY: Caption, Viewers, Quick Reactions & Reply */}
        <div className="absolute bottom-0 inset-x-0 z-30 p-4 space-y-2.5 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
          {/* Caption */}
          {activeStory.caption && (
            <div className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white text-xs sm:text-sm text-center font-medium border border-white/10 shadow-lg">
              {activeStory.caption}
            </div>
          )}

          {/* Viewers & Reaction Pills */}
          <div className="flex items-center justify-between text-xs text-white/80">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold">{activeStory.viewsCount || 0} views</span>
            </div>

            {/* Quick Reactions Bar */}
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 max-w-[210px] sm:max-w-xs overflow-x-auto scrollbar-none">
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
                placeholder={`Reply to ${activeStory.authorName}...`}
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
