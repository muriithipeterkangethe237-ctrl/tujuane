import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Play,
  Pause,
  MessageSquare,
  Share2,
  Download,
  MapPin,
  Send,
  Image as ImageIcon,
  CornerUpLeft,
  UserPlus,
  UserCheck,
  AlertCircle,
  Video
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  CommunityPost,
  CommunityComment,
  REACTION_TYPES
} from '../types/community';
import { UserProfile } from '../types/chat';
import { fetchAndAssemblePostVideo } from '../services/communityService';
import { compressImage } from '../utils/imageCompressor';
import { formatVideoDuration } from '../utils/videoProcessor';
import { useAuth } from '../context/AuthContext';
import { resolveLiveAuthor } from '../utils/profileUtils';

interface ShortVideoTheatreModalProps {
  isOpen: boolean;
  videoPosts: CommunityPost[];
  initialPostId: string;
  initialResolvedUrls?: Record<string, string>;
  currentUser: User | null;
  userProfile: UserProfile | null;
  followingIds: string[];
  followerIds: string[];
  commentsMap: Record<string, CommunityComment[]>;
  onEnsureCommentsLoaded: (postId: string) => void;
  onReactToPost: (post: CommunityPost, reactionKey: string) => Promise<void> | void;
  onReactToComment: (postId: string, comment: CommunityComment, reactionKey: string) => Promise<void> | void;
  onSubmitComment: (
    postId: string,
    content: string,
    mediaUrl?: string,
    replyTo?: { commentId: string; authorName: string; authorId: string } | null
  ) => Promise<boolean>;
  onToggleFollow: (authorId: string, authorName: string, authorCounty?: string, authorPhoto?: string) => void;
  onSharePost: (post: CommunityPost) => void;
  onViewUserProfile?: (user: UserProfile) => void;
  onOpenDirectChatWithUser?: (authorId: string, authorName: string) => void;
  onOpenAuthModal: (mode?: 'signin' | 'register') => void;
  onClose: () => void;
}

interface TheatreVideoSlideProps {
  post: CommunityPost;
  resolvedUrl?: string;
  hasError: boolean;
  isActive: boolean;
  isMuted: boolean;
  liveAuthorName?: string;
  liveAuthorCounty?: string;
  onRetryLoad: () => void;
  onForceMute: () => void;
}

const TheatreVideoSlide: React.FC<TheatreVideoSlideProps> = ({
  post,
  resolvedUrl,
  hasError,
  isActive,
  isMuted,
  liveAuthorName,
  liveAuthorCounty,
  onRetryLoad,
  onForceMute
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  // Reset userPaused whenever this slide becomes active again
  useEffect(() => {
    if (isActive) {
      setUserPaused(false);
    }
  }, [isActive]);

  // Auto-play active slide and pause inactive slides
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedUrl) return;

    if (isActive && !userPaused) {
      video.muted = isMuted;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // If browser blocked unmuted autoplay on scroll, mute and retry immediately
          if (!video.muted) {
            video.muted = true;
            onForceMute();
            video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => {});
          }
        });
    } else {
      if (!video.paused) {
        video.pause();
      }
      if (!isActive) {
        video.currentTime = 0;
      }
      setIsPlaying(false);
    }
  }, [isActive, resolvedUrl, isMuted, userPaused, onForceMute]);

  const handleTapVideo = () => {
    const video = videoRef.current;
    if (!video || !resolvedUrl) return;
    if (video.paused) {
      setUserPaused(false);
      video.muted = isMuted;
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      setUserPaused(true);
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      onClick={handleTapVideo}
      className="relative w-full h-full flex items-center justify-center bg-black select-none cursor-pointer overflow-hidden"
    >
      {resolvedUrl ? (
        <video
          ref={videoRef}
          src={resolvedUrl}
          poster={post.videoThumbnail}
          muted={isMuted}
          loop
          playsInline
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="max-h-full max-w-full w-full h-full object-contain bg-black"
        />
      ) : post.videoThumbnail ? (
        <img
          src={post.videoThumbnail}
          alt={post.title}
          className="max-h-full max-w-full w-full h-full object-contain opacity-85"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-950 via-indigo-950/40 to-black flex items-center justify-center">
          <Video className="w-16 h-16 text-indigo-400/40" />
        </div>
      )}

      {/* Error / Paused Indicator */}
      {hasError ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onRetryLoad();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/60"
        >
          <div className="flex flex-col items-center gap-2 px-5 py-3.5 rounded-2xl bg-rose-950/90 text-rose-100 backdrop-blur-md">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">Failed to load video. Tap to retry.</span>
          </div>
        </div>
      ) : !isPlaying && resolvedUrl ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-16 h-16 rounded-full bg-black/65 text-white flex items-center justify-center backdrop-blur-sm shadow-2xl">
            <Play className="w-7 h-7 fill-white ml-1" />
          </div>
        </div>
      ) : null}

      {/* Bottom contrast scrim with caption preview on mobile (desktop displays full info in side panel) */}
      <div className="md:hidden pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
      <div className="md:hidden pointer-events-none absolute bottom-5 left-4 right-20 text-white space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-200/90">
          <span className="font-bold text-white">{liveAuthorName || post.authorName}</span>
          {(liveAuthorCounty || post.county) && (
            <>
              <span aria-hidden="true">·</span>
              <span>{liveAuthorCounty || post.county}</span>
            </>
          )}
          {post.videoDuration ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-mono text-[11px]">{formatVideoDuration(post.videoDuration)}</span>
            </>
          ) : null}
        </div>
        {post.title &&
          post.title !== 'Citizen Short Video' &&
          post.title !== 'Citizen Video Update' &&
          post.title !== post.content && (
            <h4 className="font-bold text-sm leading-snug line-clamp-1">{post.title}</h4>
          )}
        <p className="text-xs text-slate-200/95 line-clamp-2 leading-relaxed">
          {post.mediaCaption || post.content}
        </p>
      </div>
    </div>
  );
};

export const ShortVideoTheatreModal: React.FC<ShortVideoTheatreModalProps> = ({
  isOpen,
  videoPosts,
  initialPostId,
  initialResolvedUrls = {},
  currentUser,
  followingIds,
  followerIds,
  commentsMap,
  onEnsureCommentsLoaded,
  onReactToPost,
  onReactToComment,
  onSubmitComment,
  onToggleFollow,
  onSharePost,
  onViewUserProfile,
  onOpenDirectChatWithUser,
  onOpenAuthModal,
  onClose
}) => {
  const { usersById } = useAuth();
  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = videoPosts.findIndex((p) => p.id === initialPostId);
    return idx >= 0 ? idx : 0;
  });
  const [urlMap, setUrlMap] = useState<Record<string, string>>(initialResolvedUrls);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = useState(false);

  // Side panel & mobile bottom-sheet interaction states
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [activeCommentPickerId, setActiveCommentPickerId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    authorName: string;
    authorId: string;
  } | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const urlMapRef = useRef(urlMap);
  urlMapRef.current = urlMap;
  const loadingMapRef = useRef(loadingMap);
  loadingMapRef.current = loadingMap;

  const activePost = videoPosts[activeIndex] || videoPosts[0];

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Seed initial resolved URLs and scroll immediately to initialPostId when opened
  useEffect(() => {
    if (!isOpen) return;
    setUrlMap((prev) => ({ ...initialResolvedUrls, ...prev }));
    const idx = videoPosts.findIndex((p) => p.id === initialPostId);
    const targetIdx = idx >= 0 ? idx : 0;
    setActiveIndex(targetIdx);
    const targetPost = videoPosts[targetIdx];
    if (targetPost) {
      requestAnimationFrame(() => {
        const el = slideRefs.current[targetPost.id];
        el?.scrollIntoView({ behavior: 'auto' });
      });
    }
  }, [isOpen, initialPostId]);

  const loadVideoUrl = useCallback(async (post: CommunityPost) => {
    if (!post) return;
    if (urlMapRef.current[post.id] || loadingMapRef.current[post.id]) return;
    if (post.mediaUrl) {
      setUrlMap((prev) => ({ ...prev, [post.id]: post.mediaUrl! }));
      return;
    }
    if (!post.videoChunkCount || post.videoChunkCount <= 0) {
      setErrorMap((prev) => ({ ...prev, [post.id]: true }));
      return;
    }

    setLoadingMap((prev) => ({ ...prev, [post.id]: true }));
    setErrorMap((prev) => ({ ...prev, [post.id]: false }));
    try {
      const assembled = await fetchAndAssemblePostVideo(post.id, post.videoMimeType || 'video/mp4');
      setUrlMap((prev) => ({ ...prev, [post.id]: assembled }));
    } catch {
      setErrorMap((prev) => ({ ...prev, [post.id]: true }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [post.id]: false }));
    }
  }, []);

  // Load active video, adjacent videos, and comments whenever activePost changes
  useEffect(() => {
    if (!isOpen || !activePost) return;
    loadVideoUrl(activePost);
    if (activeIndex > 0) loadVideoUrl(videoPosts[activeIndex - 1]);
    if (activeIndex < videoPosts.length - 1) loadVideoUrl(videoPosts[activeIndex + 1]);
    onEnsureCommentsLoaded(activePost.id);
    setIsReactionPickerOpen(false);
    setActiveCommentPickerId(null);
    setReplyingTo(null);
  }, [isOpen, activeIndex, activePost?.id, videoPosts, loadVideoUrl, onEnsureCommentsLoaded]);

  // IntersectionObserver on snap slides to keep activeIndex synced on scroll/swipe
  useEffect(() => {
    if (!isOpen) return;
    const rootEl = scrollerRef.current;
    if (!rootEl || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting && (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio)) {
            bestEntry = entry;
          }
        }
        if (bestEntry) {
          const idxAttr = bestEntry.target.getAttribute('data-slide-index');
          if (idxAttr !== null) {
            const parsed = Number(idxAttr);
            if (!Number.isNaN(parsed)) {
              setActiveIndex(parsed);
            }
          }
        }
      },
      { root: rootEl, threshold: [0.6, 0.85] }
    );

    videoPosts.forEach((p) => {
      const node = slideRefs.current[p.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [isOpen, videoPosts]);

  const scrollToIndex = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(videoPosts.length - 1, nextIdx));
      const targetPost = videoPosts[clamped];
      if (!targetPost) return;
      const el = slideRefs.current[targetPost.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setActiveIndex(clamped);
      }
    },
    [videoPosts]
  );

  // Keyboard navigation (Esc, ArrowDown, ArrowUp)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') {
        if (isMobileDrawerOpen) {
          setIsMobileDrawerOpen(false);
        } else {
          onClose();
        }
        return;
      }
      if (isTyping) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, isMobileDrawerOpen, onClose, scrollToIndex]);

  const handleForceMute = useCallback(() => {
    setIsMuted(true);
  }, []);

  if (!isOpen || !activePost) return null;

  const activeComments = commentsMap[activePost.id] || [];
  const isAuthor = currentUser?.uid === activePost.authorId;
  const isFollowing = followingIds.includes(activePost.authorId);
  const isFollower = followerIds.includes(activePost.authorId);
  const userPostReaction = currentUser ? activePost.reactions?.[currentUser.uid] : null;
  const userReactionMeta = REACTION_TYPES.find((r) => r.key === userPostReaction);
  const activeUrl = urlMap[activePost.id] || activePost.mediaUrl || '';
  const totalReactionsCount = Object.values(activePost.reactionsCount || {}).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0
  );

  const handleSendComment = async () => {
    if (!currentUser) {
      onOpenAuthModal('signin');
      return;
    }
    if (!commentInput.trim() && !commentImage) return;
    setIsSubmittingComment(true);
    try {
      const ok = await onSubmitComment(
        activePost.id,
        commentInput.trim(),
        commentImage || undefined,
        replyingTo
      );
      if (ok) {
        setCommentInput('');
        setCommentImage(null);
        setReplyingTo(null);
        if (commentFileInputRef.current) commentFileInputRef.current.value = '';
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const liveActiveAuthor = resolveLiveAuthor(
    activePost.authorId,
    {
      displayName: activePost.authorName,
      photoURL: activePost.authorPhotoUrl,
      county: activePost.authorCounty || activePost.county || 'Nairobi',
      constituency: activePost.constituency
    },
    usersById
  );

  const handleAuthorProfileClick = () => {
    if (!onViewUserProfile) return;
    onViewUserProfile({
      uid: activePost.authorId,
      displayName: liveActiveAuthor.displayName,
      email: '',
      photoURL: liveActiveAuthor.photoURL,
      county: liveActiveAuthor.county || 'Nairobi',
      constituency: liveActiveAuthor.constituency,
      bio: liveActiveAuthor.bio,
      occupation: liveActiveAuthor.occupation,
      isOnline: liveActiveAuthor.isOnline,
      lastSeen: liveActiveAuthor.lastSeen,
      createdAt: ''
    });
  };

  const renderSidePanelContent = () => (
    <>
      {/* 1. Author Profile Header */}
      <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleAuthorProfileClick}
              className="shrink-0 cursor-pointer group"
              title={`View ${liveActiveAuthor.displayName}'s profile`}
            >
              {liveActiveAuthor.photoURL ? (
                <img
                  src={liveActiveAuthor.photoURL}
                  alt={liveActiveAuthor.displayName}
                  className="w-11 h-11 rounded-full object-cover ring-2 ring-emerald-500/40 group-hover:ring-emerald-400 transition-all"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-emerald-900/70 text-emerald-200 font-bold flex items-center justify-center text-sm">
                  {liveActiveAuthor.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </button>

            <div className="min-w-0">
              <button
                type="button"
                onClick={handleAuthorProfileClick}
                className="font-bold text-sm text-white hover:text-emerald-400 truncate block text-left cursor-pointer transition-colors"
              >
                {liveActiveAuthor.displayName}
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                {liveActiveAuthor.county && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{liveActiveAuthor.county}</span>
                  </span>
                )}
                {liveActiveAuthor.county && <span aria-hidden="true">·</span>}
                <span className="tabular-nums">
                  {activePost.createdAt
                    ? new Date(activePost.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'Just now'}
                </span>
              </div>
              {liveActiveAuthor.occupation && (
                <div className="text-[10px] text-emerald-300/90 font-semibold truncate mt-0.5">
                  {liveActiveAuthor.occupation}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentUser && !isAuthor && (
              <button
                type="button"
                onClick={() =>
                  onToggleFollow(
                    activePost.authorId,
                    liveActiveAuthor.displayName,
                    liveActiveAuthor.county,
                    liveActiveAuthor.photoURL
                  )
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer min-h-[36px] ${
                  isFollowing
                    ? 'bg-white/10 text-slate-200 hover:bg-rose-500/20 hover:text-rose-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isFollower ? 'Follow Back' : 'Follow'}</span>
                  </>
                )}
              </button>
            )}

            {currentUser && !isAuthor && onOpenDirectChatWithUser && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDirectChatWithUser(activePost.authorId, liveActiveAuthor.displayName);
                }}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-300 transition-colors cursor-pointer"
                title={`Chat with ${liveActiveAuthor.displayName}`}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}

            {isMobileDrawerOpen && (
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="md:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
                aria-label="Close details panel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Title & Caption */}
        <div className="space-y-1">
          {activePost.title &&
            activePost.title !== 'Citizen Short Video' &&
            activePost.title !== 'Citizen Video Update' &&
            activePost.title !== activePost.content && (
              <h3 className="text-sm font-bold text-white leading-snug">{activePost.title}</h3>
            )}
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            {activePost.content}
          </p>
          {activePost.mediaCaption && (
            <p className="text-[11px] text-slate-400 italic">{activePost.mediaCaption}</p>
          )}
        </div>

        {/* 2. Reactions, Comment Count & Share Bar */}
        <div className="pt-2 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onOpenAuthModal('signin');
                    return;
                  }
                  setIsReactionPickerOpen((prev) => !prev);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[40px] ${
                  userPostReaction
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-white/10 hover:bg-white/15 text-slate-100'
                }`}
              >
                <span>{userReactionMeta ? userReactionMeta.emoji : '👍'}</span>
                <span>{userReactionMeta ? userReactionMeta.label : 'React'}</span>
                {totalReactionsCount > 0 && (
                  <span className="tabular-nums text-[11px] text-slate-300/90 ml-0.5">
                    · {totalReactionsCount}
                  </span>
                )}
              </button>

              {isReactionPickerOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-2 bg-slate-900 rounded-2xl shadow-2xl border border-white/15 p-1.5 flex items-center gap-1 z-50 max-w-[300px] sm:max-w-[340px] overflow-x-auto scrollbar-none"
                >
                  {REACTION_TYPES.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        onReactToPost(activePost, r.key);
                        setIsReactionPickerOpen(false);
                      }}
                      className={`w-8 h-8 shrink-0 flex items-center justify-center text-base rounded-xl hover:scale-125 transition-transform cursor-pointer ${
                        userPostReaction === r.key
                          ? 'bg-emerald-500/30 ring-2 ring-emerald-400'
                          : 'hover:bg-white/10'
                      }`}
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => commentInputRef.current?.focus()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-200 transition-colors cursor-pointer min-h-[40px]"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
                <span className="tabular-nums">{activePost.commentsCount || activeComments.length}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSharePost(activePost)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer min-h-[40px]"
                title="Share short video"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
              {activeUrl && (
                <a
                  href={activeUrl}
                  download={`tujuane-short-video.${activePost.videoMimeType?.includes('webm') ? 'webm' : 'mp4'}`}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                  title="Download video"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Reaction Tally Summary */}
          {activePost.reactionsCount && totalReactionsCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(activePost.reactionsCount).map(([rKey, count]) => {
                if (!count || count <= 0) return null;
                const rMeta = REACTION_TYPES.find((r) => r.key === rKey);
                if (!rMeta) return null;
                const isMine = userPostReaction === rKey;
                return (
                  <button
                    key={rKey}
                    type="button"
                    onClick={() => onReactToPost(activePost, rKey)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer tabular-nums ${
                      isMine
                        ? 'bg-rose-500/25 text-rose-200'
                        : 'bg-white/10 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    <span>{rMeta.emoji}</span>
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Real-Time Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Comments ({activeComments.length})
        </div>

        {activeComments.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No comments yet. Be the first to reply!
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {activeComments.map((comment) => {
              const userCommentReaction = currentUser ? comment.reactions?.[currentUser.uid] : null;
              const userCommentMeta = REACTION_TYPES.find((r) => r.key === userCommentReaction);
              const isPickerOpen = activeCommentPickerId === comment.id;
              const liveCommentAuthor = resolveLiveAuthor(
                comment.authorId,
                {
                  displayName: comment.authorName,
                  photoURL: comment.authorPhotoUrl,
                  county: 'Kenya Citizen'
                },
                usersById
              );

              return (
                <div key={comment.id} className="py-3 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onViewUserProfile?.({
                          uid: comment.authorId,
                          displayName: liveCommentAuthor.displayName,
                          photoURL: liveCommentAuthor.photoURL,
                          email: '',
                          county: liveCommentAuthor.county || 'Kenya Citizen',
                          constituency: liveCommentAuthor.constituency,
                          bio: liveCommentAuthor.bio,
                          occupation: liveCommentAuthor.occupation,
                          isOnline: liveCommentAuthor.isOnline,
                          lastSeen: liveCommentAuthor.lastSeen,
                          createdAt: ''
                        })
                      }
                      className="flex items-center gap-2 text-left cursor-pointer group min-w-0"
                    >
                      {liveCommentAuthor.photoURL ? (
                        <img
                          src={liveCommentAuthor.photoURL}
                          alt={liveCommentAuthor.displayName}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-emerald-900/70 text-emerald-200 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {liveCommentAuthor.displayName.charAt(0)}
                        </div>
                      )}
                      <span className="font-bold text-xs text-white group-hover:text-emerald-400 truncate">
                        {liveCommentAuthor.displayName}
                      </span>
                      {comment.replyToAuthorName && (
                        <span className="text-[10px] text-emerald-400 font-medium shrink-0">
                          @{comment.replyToAuthorName}
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {comment.createdAt
                          ? new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : ''}
                      </span>
                      {currentUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo({
                              commentId: comment.id,
                              authorName: liveCommentAuthor.displayName,
                              authorId: comment.authorId
                            });
                            setCommentInput(`@${liveCommentAuthor.displayName} `);
                            commentInputRef.current?.focus();
                          }}
                          className="text-[11px] font-semibold text-emerald-400 hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          <CornerUpLeft className="w-3 h-3" />
                          <span>Reply</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed pl-8">{comment.content}</p>

                  {comment.mediaUrl && (
                    <div className="pl-8 pt-1">
                      <img
                        src={comment.mediaUrl}
                        alt="Comment attachment"
                        className="max-h-36 rounded-lg object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pl-8 pt-0.5 relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!currentUser) {
                          onOpenAuthModal('signin');
                          return;
                        }
                        setActiveCommentPickerId(isPickerOpen ? null : comment.id);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                        userCommentReaction
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <span>{userCommentMeta ? userCommentMeta.emoji : '👍'}</span>
                      <span>{userCommentMeta ? userCommentMeta.label : 'React'}</span>
                    </button>

                    {isPickerOpen && (
                      <div className="absolute left-8 bottom-full mb-1 bg-slate-900 rounded-2xl shadow-xl border border-white/15 p-1 flex items-center gap-1 z-40 max-w-[260px] overflow-x-auto scrollbar-none">
                        {REACTION_TYPES.map((r) => (
                          <button
                            key={r.key}
                            type="button"
                            onClick={() => {
                              onReactToComment(activePost.id, comment, r.key);
                              setActiveCommentPickerId(null);
                            }}
                            className="w-7 h-7 shrink-0 flex items-center justify-center text-sm rounded-lg hover:bg-white/10 cursor-pointer"
                            title={r.label}
                          >
                            {r.emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {comment.reactionsCount &&
                      Object.entries(comment.reactionsCount).map(([rKey, count]) => {
                        if (!count || count <= 0) return null;
                        const rMeta = REACTION_TYPES.find((r) => r.key === rKey);
                        if (!rMeta) return null;
                        return (
                          <button
                            key={rKey}
                            type="button"
                            onClick={() => onReactToComment(activePost.id, comment, rKey)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-300 cursor-pointer tabular-nums"
                          >
                            <span>{rMeta.emoji}</span>
                            <span>{count}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Comment Composer */}
      <div className="p-3.5 border-t border-white/10 bg-slate-950 shrink-0 space-y-2">
        {currentUser ? (
          <>
            {replyingTo && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 text-[11px]">
                <span>Replying to @{replyingTo.authorName}</span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {commentImage && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/10 w-fit">
                <img src={commentImage} alt="Preview" className="w-7 h-7 rounded object-cover" />
                <span className="text-[11px] text-slate-300">Photo attached</span>
                <button
                  type="button"
                  onClick={() => setCommentImage(null)}
                  className="text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={commentInputRef}
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                placeholder={
                  replyingTo ? `Reply to @${replyingTo.authorName}...` : 'Add a comment...'
                }
                className="flex-1 px-3.5 py-2.5 text-xs bg-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder:text-slate-400"
              />

              <input
                type="file"
                ref={commentFileInputRef}
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const compressed = await compressImage(file, 800, 0.7);
                    setCommentImage(compressed.dataUrl);
                  } catch {
                    // ignore
                  }
                }}
              />

              <button
                type="button"
                onClick={() => commentFileInputRef.current?.click()}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 cursor-pointer"
                title="Attach photo"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={handleSendComment}
                disabled={isSubmittingComment || (!commentInput.trim() && !commentImage)}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white cursor-pointer transition-colors"
                title="Send comment"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="text-center text-xs text-slate-400 py-1">
            <button
              type="button"
              onClick={() => onOpenAuthModal('signin')}
              className="text-emerald-400 font-bold hover:underline cursor-pointer"
            >
              Sign in
            </button>{' '}
            to react or leave a comment.
          </div>
        )}
      </div>
    </>
  );

  const modalContent = (
    <div
      className="fixed inset-0 z-[120] w-screen h-screen h-dvh bg-black text-slate-100 flex flex-col md:flex-row overflow-hidden animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen Short Video Reels Viewer"
    >
      {/* LEFT / MAIN STAGE: Vertical Snap-Scrollable Short Videos */}
      <div className="relative flex-1 h-full bg-black overflow-hidden">
        {/* Scrollable Video Slides */}
        <div
          ref={scrollerRef}
          className="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
        >
          {videoPosts.map((post, idx) => {
            const slideAuthor = resolveLiveAuthor(
              post.authorId,
              {
                displayName: post.authorName,
                county: post.authorCounty || post.county
              },
              usersById
            );
            return (
              <div
                key={post.id}
                data-slide-index={idx}
                ref={(el) => {
                  slideRefs.current[post.id] = el;
                }}
                className="h-full w-full snap-start snap-always relative"
              >
                <TheatreVideoSlide
                  post={post}
                  resolvedUrl={urlMap[post.id] || post.mediaUrl}
                  hasError={!!errorMap[post.id]}
                  isActive={idx === activeIndex}
                  isMuted={isMuted}
                  liveAuthorName={slideAuthor.displayName}
                  liveAuthorCounty={slideAuthor.county}
                  onRetryLoad={() => loadVideoUrl(post)}
                  onForceMute={handleForceMute}
                />
              </div>
            );
          })}
        </div>

        {/* Top Left: Close */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
            title="Close full-screen viewer (Esc)"
            aria-label="Close full-screen viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Right: Audio Mute Toggle & Desktop Up/Down Video Stepper */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className="w-11 h-11 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
            title={isMuted ? 'Unmute video' : 'Mute video'}
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {videoPosts.length > 1 && (
            <div className="hidden md:flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => scrollToIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
                className="w-10 h-10 rounded-full bg-black/65 hover:bg-black/85 disabled:opacity-30 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Previous short video (Arrow Up)"
                aria-label="Previous short video"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollToIndex(activeIndex + 1)}
                disabled={activeIndex >= videoPosts.length - 1}
                className="w-10 h-10 rounded-full bg-black/65 hover:bg-black/85 disabled:opacity-30 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Next short video (Arrow Down)"
                aria-label="Next short video"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* MOBILE RIGHT-SIDE ACTION RAIL (User Profile, React, Comments, Share on right edge of video) */}
        <div className="md:hidden absolute right-3 bottom-6 z-20 flex flex-col items-center gap-3.5">
          {/* Profile Avatar */}
          <button
            type="button"
            onClick={handleAuthorProfileClick}
            className="relative flex flex-col items-center cursor-pointer"
            title={`View ${liveActiveAuthor.displayName}'s profile`}
          >
            {liveActiveAuthor.photoURL ? (
              <img
                src={liveActiveAuthor.photoURL}
                alt={liveActiveAuthor.displayName}
                className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-lg"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm ring-2 ring-white shadow-lg">
                {liveActiveAuthor.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          {/* React Button */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md ${
                userPostReaction ? 'bg-rose-600/90' : 'bg-black/60'
              }`}
            >
              <span className="text-lg">{userReactionMeta ? userReactionMeta.emoji : '👍'}</span>
            </div>
            <span className="text-[11px] font-bold tabular-nums drop-shadow">{totalReactionsCount}</span>
          </button>

          {/* Comment Section Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-md">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold tabular-nums drop-shadow">
              {activePost.commentsCount || activeComments.length}
            </span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={() => onSharePost(activePost)}
            className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-md">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold drop-shadow">Share</span>
          </button>
        </div>
      </div>

      {/* DESKTOP & TABLET RIGHT SIDE PANEL (Always visible on one side of the video in full screen) */}
      <aside className="hidden md:flex md:w-[380px] lg:w-[420px] xl:w-[450px] h-full flex-col bg-slate-950 border-l border-white/10 shrink-0">
        {renderSidePanelContent()}
      </aside>

      {/* MOBILE SLIDE-UP SHEET FOR PROFILE, REACTIONS, SHARE & COMMENTS */}
      {isMobileDrawerOpen && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-xs flex items-end"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-[76dvh] bg-slate-950 rounded-t-3xl flex flex-col overflow-hidden border-t border-white/15 animate-in slide-in-from-bottom duration-200"
          >
            <div className="w-10 h-1 rounded-full bg-white/25 mx-auto my-2.5 shrink-0" />
            {renderSidePanelContent()}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
};
