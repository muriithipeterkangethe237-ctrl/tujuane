import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBackgroundUploads } from '../context/BackgroundUploadContext';
import {
  CommunityPost,
  CommunityComment,
  PostCategory,
  CreatePostParams,
  PostBackgroundColor,
  PostMediaType,
  SOLID_POST_BACKGROUNDS,
  REACTION_TYPES,
  ReactionKey,
  PostedVideoSound,
  SoundMixMode,
  buildSoundFromPost,
  TaggedUserRef
} from '../types/community';
import {
  createCommunityPost,
  subscribeToCommunityPosts,
  toggleUpvotePost,
  addCommunityComment,
  subscribeToPostComments,
  deleteCommunityPost,
  reactToCommunityPost,
  reactToCommunityComment,
  prefetchVideoHeadFrames,
  resolvePostVideoAudioSource,
  getCachedPostVideoUrl
} from '../services/communityService';
import { DailyCommunityPoll } from './DailyCommunityPoll';
import { CitizenStoriesBar } from './Stories/CitizenStoriesBar';
import { PostTypeSelectorModal, PostCreationType, PostTypeOption } from './PostTypeSelectorModal';
import { CreateStoryModal } from './Stories/CreateStoryModal';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { ShortVideoTheatreModal } from './ShortVideoTheatreModal';
import { FeedAudioPlayer } from './FeedAudioPlayer';
import {
  VoiceShoutRecorder,
  RecordedVoiceShout,
  formatShoutSeconds
} from './VoiceShoutRecorder';
import { ShortVideoCameraRecorder, RecordedVideoSoundMeta } from './ShortVideoCameraRecorder';
import { PostedSoundPickerModal } from './PostedSoundPickerModal';
import { VideoTrimmerPanel } from './VideoTrimmerPanel';
import { compressImage, formatFileSize } from '../utils/imageCompressor';
import {
  processFeedVideoFile,
  probeVideoFileMetadata,
  formatVideoDuration,
  normalizePlaybackSpeed,
  ProcessedFeedVideo,
  DEFAULT_VIDEO_PLAYBACK_SPEED,
  MAX_FEED_VIDEO_DURATION_SEC,
  MAX_RAW_VIDEO_INPUT_BYTES,
  VIDEO_PLAYBACK_SPEED_OPTIONS,
  resolvePlayableVideoUrl
} from '../utils/videoProcessor';
import { FeedPostSkeletonList } from './Skeletons';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../data/kenyaCounties';
import { analyzeContentSafety, getSafetyExplanation } from '../utils/safetyFilter';
import { SafetyCategory, SafetyScanResult } from '../types/safety';
import { submitSafetyReport } from '../services/safetyService';
import {
  followUser,
  unfollowUser,
  subscribeToFollowing,
  subscribeToFollowers
} from '../services/socialService';
import { sendUserNotification } from '../services/userNotificationService';
import { UserProfile } from '../types/chat';
import { resolveLiveAuthor } from '../utils/profileUtils';
import { trackFunnelMilestone, trackDropOffPoint } from '../services/telemetryService';
import { RichSocialText } from './RichSocialText';
import { InlineTagSuggestions, ProfileTagBar } from './SocialTagControls';
import {
  extractHashtagKeys,
  resolveMentionedUsers,
  computeTrendingHashtags,
  postMatchesHashtag
} from '../utils/tagParser';
import {
  MessageSquare,
  Sparkles,
  Briefcase,
  Users,
  Compass,
  GraduationCap,
  HelpCircle,
  Send,
  Heart,
  Share2,
  Image as ImageIcon,
  X,
  MapPin,
  Search,
  Filter,
  Trash2,
  Download,
  Plus,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Flame,
  Check,
  Clock,
  Layers,
  ArrowRight,
  UserCheck,
  UserPlus,
  Flag,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Info,
  Ban,
  VolumeX,
  Volume2,
  MoreVertical,
  CornerUpLeft,
  Palette,
  Smile,
  Vote,
  Video,
  Mic,
  Camera,
  RotateCcw,
  UploadCloud,
  Music,
  Hash,
  AtSign,
  Scissors,
  Gauge
} from 'lucide-react';

export interface ExternalCreateRequest {
  category?: PostCategory;
  solidBg?: PostBackgroundColor;
  requiresImage?: boolean;
  requiresVideo?: boolean;
  requiresAudio?: boolean;
  openSelector?: boolean;
  timestamp: number;
}

interface CommunityFeedProps {
  onOpenDirectChatWithUser?: (authorId: string, authorName: string) => void;
  onViewUserProfile?: (user: UserProfile) => void;
  externalCreateRequest?: ExternalCreateRequest | null;
  onClearExternalCreateRequest?: () => void;
  onFullScreenVideoChange?: (isOpen: boolean) => void;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({
  onOpenDirectChatWithUser,
  onViewUserProfile,
  externalCreateRequest,
  onClearExternalCreateRequest,
  onFullScreenVideoChange
}) => {
  const {
    currentUser,
    userProfile,
    usersById,
    openAuthModal,
    blockedUserIds,
    mutedUserIds,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser
  } = useAuth();

  const { enqueuePostVideoUpload } = useBackgroundUploads();

  // Feed states
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCounty, setSelectedCounty] = useState<string>('All');
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDailyPoll, setShowDailyPoll] = useState(false);
  const feedTopRef = useRef<HTMLDivElement>(null);

  // Profile tagging state across composers
  const [quickTaggedUsers, setQuickTaggedUsers] = useState<TaggedUserRef[]>([]);
  const [showQuickTagPicker, setShowQuickTagPicker] = useState(false);
  const [modalTaggedUsers, setModalTaggedUsers] = useState<TaggedUserRef[]>([]);
  const [showModalTagPicker, setShowModalTagPicker] = useState(false);
  const [commentTaggedUsers, setCommentTaggedUsers] = useState<TaggedUserRef[]>([]);

  // Post creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory>('general');
  const [postCounty, setPostCounty] = useState('Nairobi');
  const [mediaCaption, setMediaCaption] = useState('');
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [modalMediaType, setModalMediaType] = useState<PostMediaType>('image');
  const [imageMeta, setImageMeta] = useState<{ origSize: number; compSize: number } | null>(null);
  const [videoMeta, setVideoMeta] = useState<{
    size: number;
    originalSize?: number;
    wasCompressed?: boolean;
    duration: number;
    wasAutoTrimmed?: boolean;
    originalDuration?: number;
  } | null>(null);
  const [modalVideoData, setModalVideoData] = useState<ProcessedFeedVideo | null>(null);
  const [modalAudioData, setModalAudioData] = useState<RecordedVoiceShout | null>(null);
  const [modalShowVoiceRecorder, setModalShowVoiceRecorder] = useState(false);
  const [modalShowVideoRecorder, setModalShowVideoRecorder] = useState(false);
  const [modalUploadProgress, setModalUploadProgress] = useState<number | null>(null);
  const [modalTrimProgress, setModalTrimProgress] = useState<number | null>(null);
  const [modalTrimStage, setModalTrimStage] = useState<string>('Auto-compressing video file size...');
  const [modalBackgroundUpload, setModalBackgroundUpload] = useState<boolean>(true);
  const [modalHighlightVideo, setModalHighlightVideo] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalBgColor, setModalBgColor] = useState<PostBackgroundColor>('default');
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [modalSound, setModalSound] = useState<PostedVideoSound | null>(null);
  const [modalSoundMixMode, setModalSoundMixMode] = useState<SoundMixMode>('replace');
  const [modalShowVideoTrimmer, setModalShowVideoTrimmer] = useState(false);
  const [modalTrimmerMeta, setModalTrimmerMeta] = useState<{ duration: number; notice?: string } | null>(null);
  const [modalPlaybackSpeed, setModalPlaybackSpeed] = useState<number>(DEFAULT_VIDEO_PLAYBACK_SPEED);
  const [soundPickerTarget, setSoundPickerTarget] = useState<'quick' | 'modal' | null>(null);
  const modalVideoFileRef = useRef<File | null>(null);
  const modalUnbakedFileRef = useRef<File | null>(null);
  const modalSoundBakedInRecorderRef = useRef<boolean>(false);
  const modalTrimRangeRef = useRef<{ startTimeSec: number; endTimeSec: number } | null>(null);
  const modalPlaybackSpeedRef = useRef<number>(DEFAULT_VIDEO_PLAYBACK_SPEED);
  const modalPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoPromiseRef = useRef<Promise<ProcessedFeedVideo> | null>(null);
  const modalVideoAbortRef = useRef<AbortController | null>(null);
  const modalBgProgressRef = useRef<((pct: number, stage?: string) => void) | null>(null);
  const modalVideoGenerationRef = useRef<number>(0);

  // Handle external create request from Header or App level
  useEffect(() => {
    if (!externalCreateRequest) return;
    if (externalCreateRequest.openSelector) {
      setIsTypeSelectorOpen(true);
    } else {
      if (externalCreateRequest.category) {
        setPostCategory(externalCreateRequest.category);
      }
      if (externalCreateRequest.solidBg) {
        setModalBgColor(externalCreateRequest.solidBg);
      } else {
        setModalBgColor('default');
      }
      setFormError(null);
      setModalUploadProgress(null);
      setModalHighlightVideo(!!externalCreateRequest.requiresVideo);
      setModalShowVoiceRecorder(!!externalCreateRequest.requiresAudio);
      setModalShowVideoRecorder(false);
      if (externalCreateRequest.requiresVideo) {
        setModalMediaType('video');
      } else if (externalCreateRequest.requiresAudio) {
        if (modalVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(modalVideoData.previewObjectUrl);
        }
        setModalVideoData(null);
        setCompressedImage(null);
        setImageMeta(null);
        setVideoMeta(null);
        setModalMediaType('audio');
      }
      setIsCreateModalOpen(true);
      if (externalCreateRequest.requiresImage) {
        setTimeout(() => fileInputRef.current?.click(), 180);
      }
    }
    if (onClearExternalCreateRequest) {
      onClearExternalCreateRequest();
    }
  }, [externalCreateRequest]);

  // Active expanded comments
  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommunityComment[]>>({});
  const [commentInput, setCommentInput] = useState('');
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<{
    commentId: string;
    authorName: string;
    authorId: string;
  } | null>(null);

  // Reaction pickers state
  const [activeReactionPickerPostId, setActiveReactionPickerPostId] = useState<string | null>(null);
  const [activeReactionPickerCommentId, setActiveReactionPickerCommentId] = useState<string | null>(null);

  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    author: string;
    mediaType?: PostMediaType;
    mimeType?: string;
  } | null>(null);

  // Full-Screen Short Video Reels Scroller Modal state
  const [videoTheatreState, setVideoTheatreState] = useState<{
    postId: string;
    resolvedUrls: Record<string, string>;
  } | null>(null);
  const commentUnsubsRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    onFullScreenVideoChange?.(!!videoTheatreState);
    return () => {
      onFullScreenVideoChange?.(false);
    };
  }, [videoTheatreState, onFullScreenVideoChange]);

  // Toast notice
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Direct Quick Post Composer State (Direct caption, photo, or short video posting without tagging location)
  const [quickCaption, setQuickCaption] = useState('');
  const [quickImage, setQuickImage] = useState<string | null>(null);
  const [quickMediaType, setQuickMediaType] = useState<PostMediaType>('image');
  const [quickImageMeta, setQuickImageMeta] = useState<{ origSize: number; compSize: number } | null>(null);
  const [quickVideoMeta, setQuickVideoMeta] = useState<{
    size: number;
    originalSize?: number;
    wasCompressed?: boolean;
    duration: number;
    wasAutoTrimmed?: boolean;
    originalDuration?: number;
  } | null>(null);
  const [quickVideoData, setQuickVideoData] = useState<ProcessedFeedVideo | null>(null);
  const [quickShowVideoRecorder, setQuickShowVideoRecorder] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickUploadProgress, setQuickUploadProgress] = useState<number | null>(null);
  const [quickTrimProgress, setQuickTrimProgress] = useState<number | null>(null);
  const [quickTrimStage, setQuickTrimStage] = useState<string>('Auto-compressing video file size...');
  const [quickBackgroundUpload, setQuickBackgroundUpload] = useState<boolean>(true);
  const [isQuickCompressing, setIsQuickCompressing] = useState(false);
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
  const [quickShowLocation, setQuickShowLocation] = useState(false);
  const [quickCounty, setQuickCounty] = useState('Nairobi');
  const [quickConstituency, setQuickConstituency] = useState('');
  const [quickBgColor, setQuickBgColor] = useState<PostBackgroundColor>('default');
  const [quickSound, setQuickSound] = useState<PostedVideoSound | null>(null);
  const [quickSoundMixMode, setQuickSoundMixMode] = useState<SoundMixMode>('replace');
  const [quickShowVideoTrimmer, setQuickShowVideoTrimmer] = useState(false);
  const [quickTrimmerMeta, setQuickTrimmerMeta] = useState<{ duration: number; notice?: string } | null>(null);
  const [quickPlaybackSpeed, setQuickPlaybackSpeed] = useState<number>(DEFAULT_VIDEO_PLAYBACK_SPEED);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickVideoInputRef = useRef<HTMLInputElement | null>(null);
  const quickVideoFileRef = useRef<File | null>(null);
  const quickUnbakedFileRef = useRef<File | null>(null);
  const quickSoundBakedInRecorderRef = useRef<boolean>(false);
  const quickTrimRangeRef = useRef<{ startTimeSec: number; endTimeSec: number } | null>(null);
  const quickPlaybackSpeedRef = useRef<number>(DEFAULT_VIDEO_PLAYBACK_SPEED);
  const quickPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const quickVideoPromiseRef = useRef<Promise<ProcessedFeedVideo> | null>(null);
  const quickVideoAbortRef = useRef<AbortController | null>(null);
  const quickBgProgressRef = useRef<((pct: number, stage?: string) => void) | null>(null);
  const quickVideoGenerationRef = useRef<number>(0);

  // Sync live preview playbackRate accurately without double-applying speed on already-baked clips
  useEffect(() => {
    const v = quickPreviewVideoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v || !quickImage || quickMediaType !== 'video') return;
    const encodedSpeed = quickVideoData?.playbackSpeed || 1;
    const ratio = Math.min(4, Math.max(0.25, quickPlaybackSpeed / encodedSpeed));
    try {
      v.playbackRate = ratio;
      if ('preservesPitch' in v) v.preservesPitch = true;
      if ('webkitPreservesPitch' in v) v.webkitPreservesPitch = true;
    } catch {
      // ignore unsupported rate
    }
  }, [quickImage, quickMediaType, quickPlaybackSpeed, quickVideoData]);

  useEffect(() => {
    const v = modalPreviewVideoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v || !compressedImage || modalMediaType !== 'video') return;
    const encodedSpeed = modalVideoData?.playbackSpeed || 1;
    const ratio = Math.min(4, Math.max(0.25, modalPlaybackSpeed / encodedSpeed));
    try {
      v.playbackRate = ratio;
      if ('preservesPitch' in v) v.preservesPitch = true;
      if ('webkitPreservesPitch' in v) v.webkitPreservesPitch = true;
    } catch {
      // ignore unsupported rate
    }
  }, [compressedImage, modalMediaType, modalPlaybackSpeed, modalVideoData]);

  // Full Modal optional location toggle
  const [modalIncludeLocation, setModalIncludeLocation] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedConstituency, setSelectedConstituency] = useState('All');
  const [postConstituency, setPostConstituency] = useState('');

  // Social & Follow states
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [feedAudience, setFeedAudience] = useState<'all' | 'following'>('all');

  // Deletion modal state
  const [postToDelete, setPostToDelete] = useState<CommunityPost | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // Safety Reporting & Blocked Content modal states
  const [reportModalPost, setReportModalPost] = useState<CommunityPost | null>(null);
  const [reportCategory, setReportCategory] = useState<SafetyCategory>('misleading');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [blockedSafetyResult, setBlockedSafetyResult] = useState<SafetyScanResult | null>(null);

  // Block & Mute user states from Feed
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [userToBlock, setUserToBlock] = useState<{ id: string; name: string } | null>(null);
  const [isBlockingInProgress, setIsBlockingInProgress] = useState(false);

  const isDeveloper = !!currentUser?.email && currentUser.email.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com';

  const availableFilterConstituencies = useMemo(() => {
    return getConstituenciesByCounty(selectedCounty);
  }, [selectedCounty]);

  const availablePostConstituencies = useMemo(() => {
    return getConstituenciesByCounty(postCounty);
  }, [postCounty]);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Subscribe to social follows
  useEffect(() => {
    if (!currentUser) {
      setFollowingIds([]);
      setFollowerIds([]);
      return;
    }
    const unsubFollowing = subscribeToFollowing(currentUser.uid, (list) => {
      setFollowingIds(list.map((f) => f.followingId));
    });
    const unsubFollowers = subscribeToFollowers(currentUser.uid, (list) => {
      setFollowerIds(list.map((f) => f.followerId));
    });
    return () => {
      unsubFollowing();
      unsubFollowers();
      Object.values(commentUnsubsRef.current).forEach((unsub) => {
        try {
          unsub();
        } catch {
          // ignore
        }
      });
      commentUnsubsRef.current = {};
    };
  }, [currentUser]);

  const closeCreateModal = useCallback(() => {
    const hasDraft =
      Boolean(postTitle.trim()) ||
      Boolean(postContent.trim()) ||
      Boolean(compressedImage) ||
      Boolean(modalVideoData) ||
      Boolean(modalAudioData);
    if (hasDraft && !isSubmitting) {
      trackDropOffPoint('abandoned_post_composer', 'Closed post composer with unsent draft');
    }
    setIsCreateModalOpen(false);
    setModalShowVideoRecorder(false);
    setModalShowVideoTrimmer(false);
  }, [postTitle, postContent, compressedImage, modalVideoData, modalAudioData, isSubmitting]);

  // Handle ESC key to close any active dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateModalOpen) closeCreateModal();
        if (postToDelete) setPostToDelete(null);
        if (blockedSafetyResult) setBlockedSafetyResult(null);
        if (reportModalPost) setReportModalPost(null);
        if (lightboxImage) setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, closeCreateModal, postToDelete, blockedSafetyResult, reportModalPost, lightboxImage]);

  // Set default post county and constituency to user profile if available
  useEffect(() => {
    if (userProfile?.county) {
      setPostCounty(userProfile.county);
    }
    if (userProfile?.constituency) {
      setPostConstituency(userProfile.constituency);
    }
  }, [userProfile]);

  // Subscribe once to real-time posts from Firestore and apply filters in-memory (saves 40 reads per filter click)
  useEffect(() => {
    setIsLoadingPosts(true);
    const unsub = subscribeToCommunityPosts({}, (incomingPosts) => {
      setPosts(incomingPosts);
      setIsLoadingPosts(false);
      const topVideos = incomingPosts
        .filter(
          (p) =>
            p.mediaType === 'video' ||
            (p.mediaUrl?.startsWith('data:video/') ?? false) ||
            (p.videoChunkCount ?? 0) > 0
        )
        .slice(0, 2);
      topVideos.forEach((vp) => {
        void prefetchVideoHeadFrames(vp);
      });
    });
    return () => unsub();
  }, []);

  // Re-mix or clear a posted video sound onto an already chosen/recorded video clip
  const applySoundToExistingVideo = async (
    target: 'quick' | 'modal',
    nextSound: PostedVideoSound | null,
    nextMode: SoundMixMode
  ) => {
    if (target === 'modal') {
      setModalSound(nextSound);
      setModalSoundMixMode(nextMode);
      const sourceFile = modalUnbakedFileRef.current;
      if (modalMediaType !== 'video' || !sourceFile) return;

      // If sound was baked during live camera recording and user clears it, keep clip playable and note re-record option
      if (!nextSound && modalSoundBakedInRecorderRef.current) {
        triggerToast('Sound attribution removed. Tap Re-record to record fresh audio without the beat.');
        return;
      }

      modalVideoAbortRef.current?.abort();
      const abortCtrl = new AbortController();
      modalVideoAbortRef.current = abortCtrl;
      modalBgProgressRef.current = null;
      const gen = ++modalVideoGenerationRef.current;
      modalVideoFileRef.current = sourceFile;
      setIsCompressing(true);
      setModalTrimProgress(5);
      setModalTrimStage(
        nextSound
          ? 'Applying posted video sound & compressing...'
          : 'Restoring original video audio...'
      );
      setFormError(null);

      const promise = (async () => {
        let soundTrack: { url: string; mode: SoundMixMode } | undefined;
        if (nextSound) {
          const url =
            nextSound.resolvedPlayableUrl || (await resolvePostVideoAudioSource(nextSound));
          soundTrack = { url, mode: nextMode };
        }
        return processFeedVideoFile(sourceFile, {
          maxDurationSec: MAX_FEED_VIDEO_DURATION_SEC,
          autoTrim: true,
          autoCompress: true,
          overrideDurationSec: modalTrimmerMeta?.duration,
          startTimeSec: modalTrimRangeRef.current?.startTimeSec,
          endTimeSec: modalTrimRangeRef.current?.endTimeSec,
          playbackSpeed: modalPlaybackSpeedRef.current,
          soundTrack,
          signal: abortCtrl.signal,
          onProgress: (pct, stage) => {
            modalBgProgressRef.current?.(pct, stage);
            if (modalVideoGenerationRef.current !== gen) return;
            setModalTrimProgress(pct);
            if (stage) setModalTrimStage(stage);
          }
        });
      })();

      modalVideoPromiseRef.current = promise;

      try {
        const processed = await promise;
        if (modalVideoGenerationRef.current !== gen) return;
        modalVideoPromiseRef.current = null;
        if (modalVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(modalVideoData.previewObjectUrl);
        }
        setModalVideoData(processed);
        setCompressedImage(processed.previewObjectUrl);
        setVideoMeta({
          size: processed.sizeBytes,
          originalSize: processed.originalSizeBytes,
          wasCompressed: processed.wasCompressed,
          duration: processed.duration,
          wasAutoTrimmed: processed.wasAutoTrimmed,
          originalDuration: processed.originalDuration
        });
        if (nextSound) {
          triggerToast(`🎵 Applied "${nextSound.soundTitle}"!`);
        }
      } catch (err: any) {
        if (abortCtrl.signal.aborted || modalVideoGenerationRef.current !== gen) return;
        modalVideoPromiseRef.current = null;
        setFormError(err?.message || 'Could not apply selected sound to this video.');
      } finally {
        if (modalVideoGenerationRef.current === gen) {
          setIsCompressing(false);
          setModalTrimProgress(null);
        }
      }
      return;
    }

    // Quick composer target
    setQuickSound(nextSound);
    setQuickSoundMixMode(nextMode);
    const sourceFile = quickUnbakedFileRef.current;
    if (quickMediaType !== 'video' || !sourceFile) return;

    if (!nextSound && quickSoundBakedInRecorderRef.current) {
      triggerToast('Sound attribution removed. Tap Re-record to record fresh audio without the beat.');
      return;
    }

    quickVideoAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    quickVideoAbortRef.current = abortCtrl;
    quickBgProgressRef.current = null;
    const gen = ++quickVideoGenerationRef.current;
    quickVideoFileRef.current = sourceFile;
    setIsQuickCompressing(true);
    setQuickTrimProgress(5);
    setQuickTrimStage(
      nextSound
        ? 'Applying posted video sound & compressing...'
        : 'Restoring original video audio...'
    );
    setQuickError(null);

    const promise = (async () => {
      let soundTrack: { url: string; mode: SoundMixMode } | undefined;
      if (nextSound) {
        const url =
          nextSound.resolvedPlayableUrl || (await resolvePostVideoAudioSource(nextSound));
        soundTrack = { url, mode: nextMode };
      }
      return processFeedVideoFile(sourceFile, {
        maxDurationSec: MAX_FEED_VIDEO_DURATION_SEC,
        autoTrim: true,
        autoCompress: true,
        overrideDurationSec: quickTrimmerMeta?.duration,
        startTimeSec: quickTrimRangeRef.current?.startTimeSec,
        endTimeSec: quickTrimRangeRef.current?.endTimeSec,
        playbackSpeed: quickPlaybackSpeedRef.current,
        soundTrack,
        signal: abortCtrl.signal,
        onProgress: (pct, stage) => {
          quickBgProgressRef.current?.(pct, stage);
          if (quickVideoGenerationRef.current !== gen) return;
          setQuickTrimProgress(pct);
          if (stage) setQuickTrimStage(stage);
        }
      });
    })();

    quickVideoPromiseRef.current = promise;

    try {
      const processed = await promise;
      if (quickVideoGenerationRef.current !== gen) return;
      quickVideoPromiseRef.current = null;
      if (quickVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(quickVideoData.previewObjectUrl);
      }
      setQuickVideoData(processed);
      setQuickImage(processed.previewObjectUrl);
      setQuickVideoMeta({
        size: processed.sizeBytes,
        originalSize: processed.originalSizeBytes,
        wasCompressed: processed.wasCompressed,
        duration: processed.duration,
        wasAutoTrimmed: processed.wasAutoTrimmed,
        originalDuration: processed.originalDuration
      });
      if (nextSound) {
        triggerToast(`🎵 Applied "${nextSound.soundTitle}"!`);
      }
    } catch (err: any) {
      if (abortCtrl.signal.aborted || quickVideoGenerationRef.current !== gen) return;
      quickVideoPromiseRef.current = null;
      const msg = err?.message || 'Could not apply selected sound to this video.';
      setQuickError(msg);
      triggerToast(msg);
    } finally {
      if (quickVideoGenerationRef.current === gen) {
        setIsQuickCompressing(false);
        setQuickTrimProgress(null);
      }
    }
  };

  const runModalVideoProcessing = async (
    file: File,
    trimRange?: { startTimeSec: number; endTimeSec: number },
    overrideSpeed?: number
  ) => {
    modalVideoAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    modalVideoAbortRef.current = abortCtrl;
    modalBgProgressRef.current = null;
    const gen = ++modalVideoGenerationRef.current;
    const activeSound = modalSoundBakedInRecorderRef.current ? null : modalSound;
    const activeMode = modalSoundMixMode;
    const appliedSpeed = normalizePlaybackSpeed(overrideSpeed ?? modalPlaybackSpeedRef.current);
    modalPlaybackSpeedRef.current = appliedSpeed;
    setModalPlaybackSpeed(appliedSpeed);
    modalVideoFileRef.current = file;
    modalTrimRangeRef.current = trimRange ?? null;
    setIsCompressing(true);
    setModalTrimProgress(5);
    setModalTrimStage(
      trimRange
        ? `Processing clip (${formatVideoDuration(trimRange.startTimeSec)} – ${formatVideoDuration(trimRange.endTimeSec)}${appliedSpeed !== 1 ? ` @ ${appliedSpeed}x` : ''})...`
        : appliedSpeed !== 1
        ? `Applying ${appliedSpeed}x playback speed...`
        : activeSound
        ? 'Mixing selected sound & auto-compressing video...'
        : 'Auto-compressing video file size...'
    );
    setFormError(null);
    setModalShowVideoRecorder(false);
    setModalShowVideoTrimmer(false);
    setModalMediaType('video');

    const promise = (async () => {
      let soundTrack: { url: string; mode: SoundMixMode } | undefined;
      if (activeSound) {
        const url =
          activeSound.resolvedPlayableUrl || (await resolvePostVideoAudioSource(activeSound));
        soundTrack = { url, mode: activeMode };
      }
      return processFeedVideoFile(file, {
        maxDurationSec: MAX_FEED_VIDEO_DURATION_SEC,
        autoTrim: true,
        autoCompress: true,
        overrideDurationSec: modalTrimmerMeta?.duration,
        startTimeSec: trimRange?.startTimeSec,
        endTimeSec: trimRange?.endTimeSec,
        playbackSpeed: appliedSpeed,
        soundTrack,
        signal: abortCtrl.signal,
        onProgress: (pct, stage) => {
          modalBgProgressRef.current?.(pct, stage);
          if (modalVideoGenerationRef.current !== gen) return;
          setModalTrimProgress(pct);
          if (stage) setModalTrimStage(stage);
        }
      });
    })();
    modalVideoPromiseRef.current = promise;

    try {
      const processed = await promise;
      if (modalVideoGenerationRef.current !== gen) return;
      modalVideoPromiseRef.current = null;

      if (modalVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(modalVideoData.previewObjectUrl);
      }
      setModalVideoData(processed);
      setCompressedImage(processed.previewObjectUrl);
      setImageMeta(null);
      setVideoMeta({
        size: processed.sizeBytes,
        originalSize: processed.originalSizeBytes,
        wasCompressed: processed.wasCompressed,
        duration: processed.duration,
        wasAutoTrimmed: processed.wasAutoTrimmed,
        originalDuration: processed.originalDuration
      });
      if (trimRange) {
        triggerToast(
          `Clip updated: ${formatVideoDuration(processed.duration)}${appliedSpeed !== 1 ? ` at ${appliedSpeed}x` : ''} (${formatFileSize(processed.sizeBytes)}).`
        );
      } else if (appliedSpeed !== 1) {
        triggerToast(`Playback speed set to ${appliedSpeed}x (${formatVideoDuration(processed.duration)}).`);
      } else if (processed.wasAutoTrimmed) {
        triggerToast(
          `Video auto-trimmed from ${formatVideoDuration(processed.originalDuration)} to ${formatVideoDuration(processed.duration)}.`
        );
      } else if (processed.wasCompressed && processed.originalSizeBytes) {
        const savedPct = Math.round(
          ((processed.originalSizeBytes - processed.sizeBytes) / processed.originalSizeBytes) * 100
        );
        triggerToast(
          `Video auto-compressed: ${formatFileSize(processed.originalSizeBytes)} → ${formatFileSize(processed.sizeBytes)} (-${savedPct}%).`
        );
      }
    } catch (err: any) {
      if (abortCtrl.signal.aborted || modalVideoGenerationRef.current !== gen) return;
      modalVideoPromiseRef.current = null;
      setFormError(err?.message || 'Could not process selected video.');
    } finally {
      if (modalVideoGenerationRef.current === gen) {
        setIsCompressing(false);
        setModalTrimProgress(null);
      }
    }
  };

  const handleModalPlaybackSpeedChange = (nextRaw: number) => {
    const nextSpeed = normalizePlaybackSpeed(nextRaw);
    modalPlaybackSpeedRef.current = nextSpeed;
    setModalPlaybackSpeed(nextSpeed);
    const sourceFile = modalUnbakedFileRef.current;
    if (!sourceFile || modalMediaType !== 'video') return;
    void runModalVideoProcessing(sourceFile, modalTrimRangeRef.current ?? undefined, nextSpeed);
  };

  // Handle image or short video upload in Create Modal
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideoFile =
      file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

    if (isVideoFile) {
      if (file.size === 0) {
        setFormError('Selected video file appears to be empty.');
        return;
      }
      if (file.size > MAX_RAW_VIDEO_INPUT_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(0);
        setFormError(`Video is ${mb} MB. Please choose a video under 500 MB so it can be processed safely.`);
        return;
      }

      modalVideoFileRef.current = file;
      modalUnbakedFileRef.current = file;
      modalSoundBakedInRecorderRef.current = false;
      modalTrimRangeRef.current = null;
      modalPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      setModalPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setFormError(null);

      const probed = await probeVideoFileMetadata(file).catch(() => null);
      if (probed && probed.duration > MAX_FEED_VIDEO_DURATION_SEC + 0.5) {
        modalVideoGenerationRef.current += 1;
        modalVideoPromiseRef.current = null;
        if (modalVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(modalVideoData.previewObjectUrl);
        }
        setModalVideoData(null);
        setCompressedImage(null);
        setImageMeta(null);
        setVideoMeta(null);
        setIsCompressing(false);
        setModalTrimProgress(null);
        setModalShowVideoRecorder(false);
        setModalMediaType('video');
        setModalTrimmerMeta({
          duration: probed.duration,
          notice: `This video is ${formatVideoDuration(probed.duration)} long. Crop any segment up to ${formatVideoDuration(MAX_FEED_VIDEO_DURATION_SEC)} and tap Apply Trim.`
        });
        setModalShowVideoTrimmer(true);
        return;
      }

      setModalTrimmerMeta(probed ? { duration: probed.duration } : null);
      await runModalVideoProcessing(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image (JPG, PNG, WebP) or video (MP4, WebM, MOV) file.');
      return;
    }

    modalVideoGenerationRef.current += 1;
    modalVideoFileRef.current = null;
    modalUnbakedFileRef.current = null;
    modalSoundBakedInRecorderRef.current = false;
    modalTrimRangeRef.current = null;
    modalVideoPromiseRef.current = null;
    setModalShowVideoTrimmer(false);
    setModalTrimmerMeta(null);
    setModalSound(null);
    setIsCompressing(true);
    setFormError(null);

    try {
      const result = await compressImage(file, 1200, 0.78);
      if (modalVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(modalVideoData.previewObjectUrl);
      }
      setModalVideoData(null);
      setModalShowVideoRecorder(false);
      setModalMediaType('image');
      setCompressedImage(result.dataUrl);
      setVideoMeta(null);
      setImageMeta({
        origSize: result.originalSizeBytes,
        compSize: result.compressedSizeBytes
      });
    } catch (err) {
      console.error('Image compression failed:', err);
      setFormError('Could not process this image. Please choose another one.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleModalRecordedVideo = (
    processed: ProcessedFeedVideo,
    soundMeta?: RecordedVideoSoundMeta
  ) => {
    const rawFile = soundMeta?.rawSourceFile || processed.sourceFile || null;
    const speedUsed = normalizePlaybackSpeed(soundMeta?.playbackSpeed ?? processed.playbackSpeed);
    modalVideoGenerationRef.current += 1;
    modalVideoFileRef.current = rawFile;
    modalUnbakedFileRef.current = rawFile;
    modalSoundBakedInRecorderRef.current = Boolean(soundMeta?.soundAlreadyBaked);
    modalTrimRangeRef.current = null;
    modalPlaybackSpeedRef.current = speedUsed;
    modalVideoPromiseRef.current = null;
    setModalPlaybackSpeed(speedUsed);
    setModalShowVideoTrimmer(false);
    setModalTrimmerMeta({ duration: processed.duration * speedUsed });
    if (soundMeta) {
      setModalSound(soundMeta.sound);
      setModalSoundMixMode(soundMeta.mixMode);
    }
    if (modalVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(modalVideoData.previewObjectUrl);
    }
    if (modalAudioData?.previewObjectUrl) {
      URL.revokeObjectURL(modalAudioData.previewObjectUrl);
    }
    setModalAudioData(null);
    setModalShowVoiceRecorder(false);
    setModalShowVideoRecorder(false);
    setModalMediaType('video');
    setModalVideoData(processed);
    setCompressedImage(processed.previewObjectUrl);
    setImageMeta(null);
    setVideoMeta({
      size: processed.sizeBytes,
      originalSize: processed.originalSizeBytes,
      wasCompressed: processed.wasCompressed,
      duration: processed.duration
    });
    setFormError(null);
  };

  const handleRemoveImage = () => {
    modalVideoAbortRef.current?.abort();
    modalVideoAbortRef.current = null;
    modalBgProgressRef.current = null;
    modalVideoGenerationRef.current += 1;
    modalVideoFileRef.current = null;
    modalUnbakedFileRef.current = null;
    modalSoundBakedInRecorderRef.current = false;
    modalTrimRangeRef.current = null;
    modalPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
    modalVideoPromiseRef.current = null;
    setModalPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
    setModalShowVideoTrimmer(false);
    setModalTrimmerMeta(null);
    if (modalVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(modalVideoData.previewObjectUrl);
    }
    setModalVideoData(null);
    setModalShowVideoRecorder(false);
    setCompressedImage(null);
    setModalMediaType('image');
    setImageMeta(null);
    setVideoMeta(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleClearModalAudio = () => {
    if (modalAudioData?.previewObjectUrl) {
      URL.revokeObjectURL(modalAudioData.previewObjectUrl);
    }
    setModalAudioData(null);
    if (modalMediaType === 'audio') {
      setModalMediaType('image');
    }
  };

  const runQuickVideoProcessing = async (
    file: File,
    trimRange?: { startTimeSec: number; endTimeSec: number },
    overrideSpeed?: number
  ) => {
    quickVideoAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    quickVideoAbortRef.current = abortCtrl;
    quickBgProgressRef.current = null;
    const gen = ++quickVideoGenerationRef.current;
    const activeSound = quickSoundBakedInRecorderRef.current ? null : quickSound;
    const activeMode = quickSoundMixMode;
    const appliedSpeed = normalizePlaybackSpeed(overrideSpeed ?? quickPlaybackSpeedRef.current);
    quickPlaybackSpeedRef.current = appliedSpeed;
    setQuickPlaybackSpeed(appliedSpeed);
    quickVideoFileRef.current = file;
    quickTrimRangeRef.current = trimRange ?? null;
    setIsQuickCompressing(true);
    setQuickTrimProgress(5);
    setQuickTrimStage(
      trimRange
        ? `Processing clip (${formatVideoDuration(trimRange.startTimeSec)} – ${formatVideoDuration(trimRange.endTimeSec)}${appliedSpeed !== 1 ? ` @ ${appliedSpeed}x` : ''})...`
        : appliedSpeed !== 1
        ? `Applying ${appliedSpeed}x playback speed...`
        : activeSound
        ? 'Mixing selected sound & auto-compressing video...'
        : 'Auto-compressing video file size...'
    );
    setQuickError(null);
    setQuickShowVideoRecorder(false);
    setQuickShowVideoTrimmer(false);
    setQuickMediaType('video');

    const promise = (async () => {
      let soundTrack: { url: string; mode: SoundMixMode } | undefined;
      if (activeSound) {
        const url =
          activeSound.resolvedPlayableUrl || (await resolvePostVideoAudioSource(activeSound));
        soundTrack = { url, mode: activeMode };
      }
      return processFeedVideoFile(file, {
        maxDurationSec: MAX_FEED_VIDEO_DURATION_SEC,
        autoTrim: true,
        autoCompress: true,
        overrideDurationSec: quickTrimmerMeta?.duration,
        startTimeSec: trimRange?.startTimeSec,
        endTimeSec: trimRange?.endTimeSec,
        playbackSpeed: appliedSpeed,
        soundTrack,
        signal: abortCtrl.signal,
        onProgress: (pct, stage) => {
          quickBgProgressRef.current?.(pct, stage);
          if (quickVideoGenerationRef.current !== gen) return;
          setQuickTrimProgress(pct);
          if (stage) setQuickTrimStage(stage);
        }
      });
    })();
    quickVideoPromiseRef.current = promise;

    try {
      const processed = await promise;
      if (quickVideoGenerationRef.current !== gen) return;
      quickVideoPromiseRef.current = null;

      if (quickVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(quickVideoData.previewObjectUrl);
      }
      setQuickVideoData(processed);
      setQuickImage(processed.previewObjectUrl);
      setQuickImageMeta(null);
      setQuickVideoMeta({
        size: processed.sizeBytes,
        originalSize: processed.originalSizeBytes,
        wasCompressed: processed.wasCompressed,
        duration: processed.duration,
        wasAutoTrimmed: processed.wasAutoTrimmed,
        originalDuration: processed.originalDuration
      });
      if (trimRange) {
        triggerToast(
          `Clip updated: ${formatVideoDuration(processed.duration)}${appliedSpeed !== 1 ? ` at ${appliedSpeed}x` : ''} (${formatFileSize(processed.sizeBytes)}).`
        );
      } else if (appliedSpeed !== 1) {
        triggerToast(`Playback speed set to ${appliedSpeed}x (${formatVideoDuration(processed.duration)}).`);
      } else if (processed.wasAutoTrimmed) {
        triggerToast(
          `Video auto-trimmed from ${formatVideoDuration(processed.originalDuration)} to ${formatVideoDuration(processed.duration)}.`
        );
      } else if (processed.wasCompressed && processed.originalSizeBytes) {
        const savedPct = Math.round(
          ((processed.originalSizeBytes - processed.sizeBytes) / processed.originalSizeBytes) * 100
        );
        triggerToast(
          `Video auto-compressed: ${formatFileSize(processed.originalSizeBytes)} → ${formatFileSize(processed.sizeBytes)} (-${savedPct}%).`
        );
      }
    } catch (err: any) {
      if (abortCtrl.signal.aborted || quickVideoGenerationRef.current !== gen) return;
      quickVideoPromiseRef.current = null;
      const msg = err?.message || 'Could not load video.';
      setQuickError(msg);
      triggerToast(msg);
    } finally {
      if (quickVideoGenerationRef.current === gen) {
        setIsQuickCompressing(false);
        setQuickTrimProgress(null);
      }
    }
  };

  const handleQuickPlaybackSpeedChange = (nextRaw: number) => {
    const nextSpeed = normalizePlaybackSpeed(nextRaw);
    quickPlaybackSpeedRef.current = nextSpeed;
    setQuickPlaybackSpeed(nextSpeed);
    const sourceFile = quickUnbakedFileRef.current;
    if (!sourceFile || quickMediaType !== 'video') return;
    void runQuickVideoProcessing(sourceFile, quickTrimRangeRef.current ?? undefined, nextSpeed);
  };

  // Handle quick post image or video attachment
  const handleQuickImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideoFile =
      file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

    if (isVideoFile) {
      if (file.size === 0) {
        setQuickError('Selected video file appears to be empty.');
        return;
      }
      if (file.size > MAX_RAW_VIDEO_INPUT_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(0);
        const msg = `Video is ${mb} MB. Please choose a video under 500 MB so it can be processed safely.`;
        setQuickError(msg);
        triggerToast(msg);
        return;
      }

      quickVideoFileRef.current = file;
      quickUnbakedFileRef.current = file;
      quickSoundBakedInRecorderRef.current = false;
      quickTrimRangeRef.current = null;
      quickPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      setQuickPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setQuickError(null);

      const probed = await probeVideoFileMetadata(file).catch(() => null);
      if (probed && probed.duration > MAX_FEED_VIDEO_DURATION_SEC + 0.5) {
        quickVideoGenerationRef.current += 1;
        quickVideoPromiseRef.current = null;
        if (quickVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(quickVideoData.previewObjectUrl);
        }
        setQuickVideoData(null);
        setQuickImage(null);
        setQuickImageMeta(null);
        setQuickVideoMeta(null);
        setIsQuickCompressing(false);
        setQuickTrimProgress(null);
        setQuickShowVideoRecorder(false);
        setQuickMediaType('video');
        setQuickTrimmerMeta({
          duration: probed.duration,
          notice: `This video is ${formatVideoDuration(probed.duration)} long. Crop any segment up to ${formatVideoDuration(MAX_FEED_VIDEO_DURATION_SEC)} and tap Apply Trim.`
        });
        setQuickShowVideoTrimmer(true);
        return;
      }

      setQuickTrimmerMeta(probed ? { duration: probed.duration } : null);
      await runQuickVideoProcessing(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image (JPG, PNG, WebP) or video (MP4, WebM, MOV).';
      setQuickError(msg);
      triggerToast(msg);
      return;
    }

    quickVideoGenerationRef.current += 1;
    quickVideoFileRef.current = null;
    quickUnbakedFileRef.current = null;
    quickSoundBakedInRecorderRef.current = false;
    quickTrimRangeRef.current = null;
    quickVideoPromiseRef.current = null;
    setQuickShowVideoTrimmer(false);
    setQuickTrimmerMeta(null);
    setQuickSound(null);
    setIsQuickCompressing(true);
    setQuickError(null);
    setQuickShowVideoRecorder(false);
    try {
      const res = await compressImage(file, 1200, 0.78);
      if (quickVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(quickVideoData.previewObjectUrl);
      }
      setQuickVideoData(null);
      setQuickMediaType('image');
      setQuickImage(res.dataUrl);
      setQuickVideoMeta(null);
      setQuickImageMeta({
        origSize: res.originalSizeBytes,
        compSize: res.compressedSizeBytes
      });
    } catch (err) {
      console.error('Quick image error:', err);
      setQuickError('Could not process image.');
    } finally {
      setIsQuickCompressing(false);
    }
  };

  const handleQuickRecordedVideo = (
    processed: ProcessedFeedVideo,
    soundMeta?: RecordedVideoSoundMeta
  ) => {
    const rawFile = soundMeta?.rawSourceFile || processed.sourceFile || null;
    const speedUsed = normalizePlaybackSpeed(soundMeta?.playbackSpeed ?? processed.playbackSpeed);
    quickVideoGenerationRef.current += 1;
    quickVideoFileRef.current = rawFile;
    quickUnbakedFileRef.current = rawFile;
    quickSoundBakedInRecorderRef.current = Boolean(soundMeta?.soundAlreadyBaked);
    quickTrimRangeRef.current = null;
    quickPlaybackSpeedRef.current = speedUsed;
    quickVideoPromiseRef.current = null;
    setQuickPlaybackSpeed(speedUsed);
    setQuickShowVideoTrimmer(false);
    setQuickTrimmerMeta({ duration: processed.duration * speedUsed });
    if (soundMeta) {
      setQuickSound(soundMeta.sound);
      setQuickSoundMixMode(soundMeta.mixMode);
    }
    if (quickVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(quickVideoData.previewObjectUrl);
    }
    setQuickShowVideoRecorder(false);
    setQuickMediaType('video');
    setQuickVideoData(processed);
    setQuickImage(processed.previewObjectUrl);
    setQuickImageMeta(null);
    setQuickVideoMeta({
      size: processed.sizeBytes,
      originalSize: processed.originalSizeBytes,
      wasCompressed: processed.wasCompressed,
      duration: processed.duration
    });
    setQuickError(null);
  };

  const handleRemoveQuickImage = () => {
    quickVideoAbortRef.current?.abort();
    quickVideoAbortRef.current = null;
    quickBgProgressRef.current = null;
    quickVideoGenerationRef.current += 1;
    quickVideoFileRef.current = null;
    quickUnbakedFileRef.current = null;
    quickSoundBakedInRecorderRef.current = false;
    quickTrimRangeRef.current = null;
    quickPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
    quickVideoPromiseRef.current = null;
    setQuickPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
    setQuickShowVideoTrimmer(false);
    setQuickTrimmerMeta(null);
    if (quickVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(quickVideoData.previewObjectUrl);
    }
    setQuickVideoData(null);
    setQuickShowVideoRecorder(false);
    setQuickImage(null);
    setQuickMediaType('image');
    setQuickImageMeta(null);
    setQuickVideoMeta(null);
    setQuickError(null);
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
    if (quickVideoInputRef.current) quickVideoInputRef.current.value = '';
  };

  const allDirectoryUsers = useMemo(() => Object.values(usersById || {}), [usersById]);

  const trendingHashtags = useMemo(() => computeTrendingHashtags(posts, 12), [posts]);

  const replaceActiveTagRange = (
    currentText: string,
    startIndex: number,
    endIndex: number,
    replacement: string
  ) => {
    const before = currentText.slice(0, startIndex);
    const after = currentText.slice(endIndex);
    const spacer = after.startsWith(' ') ? '' : ' ';
    return `${before}${replacement}${spacer}${after}`;
  };

  const addUniqueTaggedUser = (
    setter: React.Dispatch<React.SetStateAction<TaggedUserRef[]>>,
    user: UserProfile
  ) => {
    if (!user?.uid || user.uid === currentUser?.uid) return;
    setter((prev) =>
      prev.some((t) => t.uid === user.uid)
        ? prev
        : [...prev, { uid: user.uid, displayName: user.displayName }]
    );
  };

  const handleFilterByHashtag = (hashtagKey: string) => {
    const clean = hashtagKey.replace(/^#/, '').trim().toLowerCase();
    setSelectedHashtag((prev) => (prev === clean ? null : clean));
    feedTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const notifyTaggedUsers = (
    tagged: TaggedUserRef[],
    snippet: string,
    postId?: string,
    postTitle?: string,
    excludeIds: string[] = []
  ) => {
    if (!currentUser || !userProfile || tagged.length === 0) return;
    const excluded = new Set([currentUser.uid, ...excludeIds]);
    for (const ref of tagged) {
      if (!ref.uid || excluded.has(ref.uid)) continue;
      sendUserNotification({
        userId: ref.uid,
        category: 'post_interaction',
        type: 'profile_tag',
        title: `${userProfile.displayName} tagged you`,
        message: `${userProfile.displayName} tagged your profile: "${snippet.slice(0, 75)}${snippet.length > 75 ? '...' : ''}"`,
        postId,
        postTitle,
        actorId: currentUser.uid,
        actorName: userProfile.displayName,
        actorPhoto: userProfile.photoURL,
        actorCounty: userProfile.county
      }).catch(() => {});
    }
  };

  // Submit direct quick post (Caption, photo, or short video — supports background compression & upload)
  const handleDirectQuickPost = async () => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    if (quickShowVideoTrimmer) {
      setQuickError('Please tap Apply Trim or Cancel in the video trimmer before posting.');
      return;
    }

    const trimmedCaption = quickCaption.trim();
    const hasPendingQuickVideo =
      isQuickCompressing && quickMediaType === 'video' && !!quickVideoFileRef.current;

    if (!trimmedCaption && !quickImage && !quickVideoData && !hasPendingQuickVideo) {
      setQuickError('Please write a caption or attach a photo / video.');
      return;
    }

    // Safety pre-scan
    const safetyScan = analyzeContentSafety(trimmedCaption, '');
    if (safetyScan.severity === 'high') {
      setBlockedSafetyResult(safetyScan);
      return;
    }

    const isVideo =
      quickMediaType === 'video' && (!!quickVideoData || !!quickImage || hasPendingQuickVideo);
    const autoTitle = trimmedCaption
      ? trimmedCaption.slice(0, 75) + (trimmedCaption.length > 75 ? '...' : '')
      : isVideo
      ? 'Citizen Short Video'
      : 'Citizen Photo Update';

    const resolvedHashtags = extractHashtagKeys(trimmedCaption);
    const resolvedTaggedUsers = resolveMentionedUsers(
      trimmedCaption,
      allDirectoryUsers,
      quickTaggedUsers,
      currentUser.uid
    );

    const baseParams: any = {
      title: autoTitle,
      content:
        trimmedCaption ||
        (isVideo ? 'Shared a short video on the feed.' : quickImage ? 'Shared a citizen photo.' : ''),
      category: 'general',
      county: quickShowLocation ? quickCounty : '',
      constituency: quickShowLocation && quickConstituency ? quickConstituency : undefined,
      mediaType: isVideo ? 'video' : quickImage ? 'image' : undefined,
      hashtags: resolvedHashtags,
      taggedUsers: resolvedTaggedUsers
    };

    if (isVideo && quickSound) {
      baseParams.soundSourcePostId = quickSound.sourceSoundPostId || quickSound.postId;
      baseParams.soundTitle = quickSound.soundTitle;
      baseParams.soundAuthorId = quickSound.authorId;
      baseParams.soundAuthorName = quickSound.authorName;
    }

    if (quickBgColor && quickBgColor !== 'default' && !quickImage && !quickVideoData && !hasPendingQuickVideo) {
      baseParams.backgroundColor = quickBgColor;
    }

    if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
      baseParams.isFlagged = true;
      baseParams.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
      baseParams.safetyReason = safetyScan.flagReason;
      baseParams.moderationStatus = 'under_review';
    }

    // Queue video upload into background manager so user can immediately keep browsing
    if (isVideo && quickBackgroundUpload && (quickVideoData || hasPendingQuickVideo)) {
      const promiseSnap = quickVideoPromiseRef.current;
      const processedSnap = promiseSnap ? null : quickVideoData;
      const fileSnap = quickUnbakedFileRef.current || quickVideoFileRef.current;
      const trimRangeSnap = quickTrimRangeRef.current;
      const speedSnap = quickPlaybackSpeedRef.current;
      const soundSnap = quickSound && !quickSoundBakedInRecorderRef.current
        ? { sound: quickSound, mode: quickSoundMixMode, url: quickSound.resolvedPlayableUrl }
        : null;
      const initialPct = quickTrimProgress ?? 5;
      const taggedSnap = [...resolvedTaggedUsers];

      quickVideoGenerationRef.current += 1;
      quickVideoFileRef.current = null;
      quickUnbakedFileRef.current = null;
      quickSoundBakedInRecorderRef.current = false;
      quickTrimRangeRef.current = null;
      quickPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      quickVideoPromiseRef.current = null;

      enqueuePostVideoUpload({
        title: autoTitle,
        author: userProfile,
        basePostParams: baseParams,
        processedVideo: processedSnap,
        pendingVideoPromise: promiseSnap,
        registerPendingProgress: promiseSnap
          ? (cb) => {
              quickBgProgressRef.current = cb;
            }
          : undefined,
        rawVideoFile: fileSnap,
        trimRange: trimRangeSnap,
        playbackSpeed: speedSnap,
        soundTrack: soundSnap,
        initialProgress: initialPct,
        onCompleted: (publishedPostId) => {
          quickBgProgressRef.current = null;
          notifyTaggedUsers(taggedSnap, baseParams.content, publishedPostId, autoTitle);
        },
        onFailed: () => {
          quickBgProgressRef.current = null;
        }
      });

      setQuickCaption('');
      setQuickTaggedUsers([]);
      setShowQuickTagPicker(false);
      setQuickShowVideoTrimmer(false);
      setQuickTrimmerMeta(null);
      setQuickPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setQuickVideoData(null);
      setQuickImage(null);
      setQuickMediaType('image');
      setQuickImageMeta(null);
      setQuickVideoMeta(null);
      setQuickSound(null);
      setQuickShowLocation(false);
      setQuickConstituency('');
      setQuickBgColor('default');
      setIsQuickCompressing(false);
      setQuickTrimProgress(null);
      setQuickError(null);
      if (quickFileInputRef.current) quickFileInputRef.current.value = '';
      if (quickVideoInputRef.current) quickVideoInputRef.current.value = '';
      triggerToast(
        processedSnap
          ? '🚀 Video uploading in background — keep browsing!'
          : '🚀 Video auto-compressing & uploading in background!'
      );
      return;
    }

    setIsQuickSubmitting(true);
    setQuickError(null);
    setQuickUploadProgress(quickVideoData || hasPendingQuickVideo ? 5 : null);
    try {
      const params: any = { ...baseParams };
      let resolvedQuickVideo = quickVideoData;
      if (isVideo && quickVideoPromiseRef.current) {
        resolvedQuickVideo = await quickVideoPromiseRef.current;
        quickVideoPromiseRef.current = null;
      }

      if (isVideo && resolvedQuickVideo) {
        params.mediaUrl = resolvedQuickVideo.inlineDataUrl || undefined;
        params.videoChunks = resolvedQuickVideo.chunks;
        params.videoThumbnail = resolvedQuickVideo.thumbnailDataUrl;
        params.videoDuration = resolvedQuickVideo.duration;
        params.videoSizeBytes = resolvedQuickVideo.sizeBytes;
        params.videoMimeType = resolvedQuickVideo.mimeType;
      } else if (quickImage) {
        params.mediaUrl = quickImage;
      }

      const newPostId = await createCommunityPost(userProfile, params, (pct) => {
        if (resolvedQuickVideo) setQuickUploadProgress(pct);
      });
      notifyTaggedUsers(resolvedTaggedUsers, params.content, newPostId, autoTitle);

      if (resolvedQuickVideo?.previewObjectUrl) {
        URL.revokeObjectURL(resolvedQuickVideo.previewObjectUrl);
      }
      if (
        quickVideoData?.previewObjectUrl &&
        quickVideoData.previewObjectUrl !== resolvedQuickVideo?.previewObjectUrl
      ) {
        URL.revokeObjectURL(quickVideoData.previewObjectUrl);
      }
      quickVideoFileRef.current = null;
      quickUnbakedFileRef.current = null;
      quickSoundBakedInRecorderRef.current = false;
      quickTrimRangeRef.current = null;
      quickPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      quickVideoPromiseRef.current = null;
      setQuickPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setQuickShowVideoTrimmer(false);
      setQuickTrimmerMeta(null);
      setQuickCaption('');
      setQuickTaggedUsers([]);
      setShowQuickTagPicker(false);
      setQuickVideoData(null);
      setQuickImage(null);
      setQuickMediaType('image');
      setQuickImageMeta(null);
      setQuickVideoMeta(null);
      setQuickSound(null);
      setQuickShowLocation(false);
      setQuickConstituency('');
      setQuickBgColor('default');
      if (quickFileInputRef.current) quickFileInputRef.current.value = '';
      if (quickVideoInputRef.current) quickVideoInputRef.current.value = '';
      triggerToast(isVideo ? '✓ Short video published to TUJUANE Feed!' : '✓ Post published to TUJUANE Feed!');
    } catch (err: any) {
      console.error('Direct post error:', err);
      const errMsg = 'Failed to publish post. Please try again.';
      setQuickError(errMsg);
      triggerToast(errMsg);
    } finally {
      setIsQuickSubmitting(false);
      setQuickUploadProgress(null);
    }
  };

  const isBanned = userProfile?.accountStatus === 'banned';
  const isSuspended =
    userProfile?.accountStatus === 'suspended' &&
    (!userProfile.suspendedUntil || new Date(userProfile.suspendedUntil).getTime() > Date.now());
  const isRestricted = isBanned || isSuspended;

  const handleOpenCreateModal = () => {
    if (!currentUser) {
      openAuthModal('register');
      return;
    }
    if (isBanned) {
      triggerToast(`⛔ Account permanently banned: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    if (isSuspended) {
      const untilStr = userProfile?.suspendedUntil ? new Date(userProfile.suspendedUntil).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'temporary duration';
      triggerToast(`⚠️ Account suspended until ${untilStr}: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    setIsTypeSelectorOpen(true);
  };

  const handleUseSoundFromPost = (post: CommunityPost) => {
    if (!currentUser) {
      openAuthModal('register');
      return;
    }
    if (isBanned) {
      triggerToast(`⛔ Account permanently banned: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    if (isSuspended) {
      triggerToast(`⚠️ Account suspended: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }

    const liveAuthor = resolveLiveAuthor(
      post.authorId,
      { displayName: post.authorName },
      usersById
    );
    const picked = buildSoundFromPost(post, liveAuthor.displayName);
    const cachedUrl = getCachedPostVideoUrl(post.id);
    if (cachedUrl) {
      picked.resolvedPlayableUrl = cachedUrl;
    }

    handleRemoveImage();
    handleClearModalAudio();
    setPostCategory('general');
    setModalBgColor('default');
    setFormError(null);
    setModalUploadProgress(null);
    setModalHighlightVideo(true);
    setModalShowVoiceRecorder(false);
    setModalShowVideoRecorder(false);
    setModalMediaType('video');
    setModalSound(picked);
    setModalSoundMixMode('replace');
    setIsCreateModalOpen(true);
  };

  const handleSelectPostType = (type: PostCreationType, option?: PostTypeOption) => {
    setIsTypeSelectorOpen(false);
    if (!currentUser) {
      openAuthModal('register');
      return;
    }
    if (isBanned) {
      triggerToast(`⛔ Account permanently banned: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    if (isSuspended) {
      triggerToast(`⚠️ Account suspended: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }

    if (type === 'story') {
      setIsStoryModalOpen(true);
      return;
    }

    setPostCategory(option?.category || 'general');
    setModalBgColor(option?.solidBg || (type === 'solid_bg' ? 'emerald' : 'default'));
    setFormError(null);
    setModalUploadProgress(null);
    setModalHighlightVideo(!!option?.requiresVideo);
    setModalShowVoiceRecorder(!!option?.requiresAudio);
    setModalShowVideoRecorder(false);
    if (option?.requiresVideo) {
      setModalMediaType('video');
    } else if (option?.requiresAudio) {
      handleRemoveImage();
      setModalSound(null);
      setModalMediaType('audio');
    }
    setIsCreateModalOpen(true);

    if (option?.requiresImage) {
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 180);
    }
  };

  // Submit new community post with Safety Filtering (Title and location now fully optional)
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    if (isBanned) {
      setFormError(`Your account is permanently banned (${userProfile.banReason || 'Policy violation'}). You cannot publish posts.`);
      return;
    }
    if (isSuspended) {
      const untilStr = userProfile.suspendedUntil ? new Date(userProfile.suspendedUntil).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'temporary duration';
      setFormError(`Your account is suspended until ${untilStr} (${userProfile.banReason || 'Policy violation'}). You cannot publish posts.`);
      return;
    }

    if (modalShowVideoTrimmer) {
      setFormError('Please tap Apply Trim or Cancel in the video trimmer before publishing.');
      return;
    }

    const trimmedContent = postContent.trim();
    const hasPendingModalVideo =
      isCompressing && modalMediaType === 'video' && !!modalVideoFileRef.current;

    if (!trimmedContent && !compressedImage && !modalVideoData && !modalAudioData && !hasPendingModalVideo) {
      setFormError('Please enter caption details or attach a photo, video, or voice shout.');
      return;
    }

    // Real-time Content Safety Pre-screening
    const safetyScan = analyzeContentSafety(trimmedContent, postTitle.trim());
    if (safetyScan.severity === 'high') {
      setBlockedSafetyResult(safetyScan);
      return;
    }

    const isAudio = modalMediaType === 'audio' && !!modalAudioData;
    const isVideo =
      !isAudio &&
      modalMediaType === 'video' &&
      (!!modalVideoData || !!compressedImage || hasPendingModalVideo);

    const derivedTitle = postTitle.trim()
      ? postTitle.trim()
      : trimmedContent.slice(0, 75) + (trimmedContent.length > 75 ? '...' : '') ||
        (isAudio ? 'Citizen Voice Shout' : isVideo ? 'Citizen Short Video' : 'Citizen Update');

    const safeContent =
      trimmedContent ||
      (isAudio
        ? `Shared a ${formatShoutSeconds(modalAudioData!.duration)} voice shout.`
        : isVideo
        ? 'Shared a short video on the feed.'
        : compressedImage
        ? 'Shared a community photo.'
        : '');

    const combinedTagText = `${postTitle.trim()} ${safeContent} ${mediaCaption.trim()}`;
    const resolvedModalHashtags = extractHashtagKeys(combinedTagText);
    const resolvedModalTaggedUsers = resolveMentionedUsers(
      combinedTagText,
      allDirectoryUsers,
      modalTaggedUsers,
      currentUser.uid
    );

    const baseParams: CreatePostParams & Record<string, any> = {
      title: derivedTitle,
      content: safeContent,
      category: postCategory,
      county: modalIncludeLocation ? postCounty : '',
      constituency: modalIncludeLocation && postConstituency ? postConstituency : undefined,
      mediaType: isAudio ? 'audio' : isVideo ? 'video' : compressedImage ? 'image' : undefined,
      mediaCaption: mediaCaption.trim() || undefined,
      hashtags: resolvedModalHashtags,
      taggedUsers: resolvedModalTaggedUsers
    };

    if (isVideo && modalSound) {
      baseParams.soundSourcePostId = modalSound.sourceSoundPostId || modalSound.postId;
      baseParams.soundTitle = modalSound.soundTitle;
      baseParams.soundAuthorId = modalSound.authorId;
      baseParams.soundAuthorName = modalSound.authorName;
    }

    if (modalBgColor && modalBgColor !== 'default' && !compressedImage && !modalVideoData && !modalAudioData && !hasPendingModalVideo) {
      baseParams.backgroundColor = modalBgColor;
    }

    if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
      baseParams.isFlagged = true;
      baseParams.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
      baseParams.safetyReason = safetyScan.flagReason;
      baseParams.moderationStatus = 'under_review';
    }

    // Queue video upload into background manager and close modal immediately
    if (isVideo && modalBackgroundUpload && (modalVideoData || hasPendingModalVideo)) {
      const promiseSnap = modalVideoPromiseRef.current;
      const processedSnap = promiseSnap ? null : modalVideoData;
      const fileSnap = modalUnbakedFileRef.current || modalVideoFileRef.current;
      const trimRangeSnap = modalTrimRangeRef.current;
      const speedSnap = modalPlaybackSpeedRef.current;
      const soundSnap = modalSound && !modalSoundBakedInRecorderRef.current
        ? { sound: modalSound, mode: modalSoundMixMode, url: modalSound.resolvedPlayableUrl }
        : null;
      const initialPct = modalTrimProgress ?? 5;
      const modalTaggedSnap = [...resolvedModalTaggedUsers];

      modalVideoGenerationRef.current += 1;
      modalVideoFileRef.current = null;
      modalUnbakedFileRef.current = null;
      modalSoundBakedInRecorderRef.current = false;
      modalTrimRangeRef.current = null;
      modalPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      modalVideoPromiseRef.current = null;

      enqueuePostVideoUpload({
        title: derivedTitle,
        author: userProfile,
        basePostParams: baseParams,
        processedVideo: processedSnap,
        pendingVideoPromise: promiseSnap,
        registerPendingProgress: promiseSnap
          ? (cb) => {
              modalBgProgressRef.current = cb;
            }
          : undefined,
        rawVideoFile: fileSnap,
        trimRange: trimRangeSnap,
        playbackSpeed: speedSnap,
        soundTrack: soundSnap,
        initialProgress: initialPct,
        onCompleted: (publishedPostId) => {
          modalBgProgressRef.current = null;
          notifyTaggedUsers(modalTaggedSnap, safeContent, publishedPostId, derivedTitle);
        },
        onFailed: () => {
          modalBgProgressRef.current = null;
        }
      });

      setIsCreateModalOpen(false);
      setPostTitle('');
      setPostContent('');
      setModalTaggedUsers([]);
      setShowModalTagPicker(false);
      setPostConstituency('');
      setModalShowVideoTrimmer(false);
      setModalTrimmerMeta(null);
      setModalPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setModalVideoData(null);
      setModalAudioData(null);
      setModalSound(null);
      setModalShowVoiceRecorder(false);
      setModalShowVideoRecorder(false);
      setCompressedImage(null);
      setModalMediaType('image');
      setImageMeta(null);
      setVideoMeta(null);
      setMediaCaption('');
      setModalIncludeLocation(false);
      setModalHighlightVideo(false);
      setModalBgColor('default');
      setIsCompressing(false);
      setModalTrimProgress(null);
      setFormError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
      triggerToast(
        processedSnap
          ? '🚀 Uploading video in background — keep browsing!'
          : '🚀 Video auto-compressing & uploading in background!'
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setModalUploadProgress(modalVideoData || hasPendingModalVideo ? 5 : null);

    try {
      const params: CreatePostParams & Record<string, any> = { ...baseParams };
      let resolvedModalVideo = modalVideoData;
      if (isVideo && modalVideoPromiseRef.current) {
        resolvedModalVideo = await modalVideoPromiseRef.current;
        modalVideoPromiseRef.current = null;
      }

      if (isAudio && modalAudioData) {
        params.mediaUrl = modalAudioData.dataUrl;
        params.audioDuration = modalAudioData.duration;
        params.audioSizeBytes = modalAudioData.sizeBytes;
        params.audioMimeType = modalAudioData.mimeType;
      } else if (isVideo && resolvedModalVideo) {
        params.mediaUrl = resolvedModalVideo.inlineDataUrl || undefined;
        params.videoChunks = resolvedModalVideo.chunks;
        params.videoThumbnail = resolvedModalVideo.thumbnailDataUrl;
        params.videoDuration = resolvedModalVideo.duration;
        params.videoSizeBytes = resolvedModalVideo.sizeBytes;
        params.videoMimeType = resolvedModalVideo.mimeType;
      } else if (compressedImage) {
        params.mediaUrl = compressedImage;
      }

      const createdPostId = await createCommunityPost(userProfile, params, (pct) => {
        if (resolvedModalVideo) setModalUploadProgress(pct);
      });
      notifyTaggedUsers(resolvedModalTaggedUsers, safeContent, createdPostId, derivedTitle);
      if (resolvedModalVideo?.previewObjectUrl) {
        URL.revokeObjectURL(resolvedModalVideo.previewObjectUrl);
      }
      if (
        modalVideoData?.previewObjectUrl &&
        modalVideoData.previewObjectUrl !== resolvedModalVideo?.previewObjectUrl
      ) {
        URL.revokeObjectURL(modalVideoData.previewObjectUrl);
      }
      if (modalAudioData?.previewObjectUrl) {
        URL.revokeObjectURL(modalAudioData.previewObjectUrl);
      }
      modalVideoFileRef.current = null;
      modalUnbakedFileRef.current = null;
      modalSoundBakedInRecorderRef.current = false;
      modalTrimRangeRef.current = null;
      modalPlaybackSpeedRef.current = DEFAULT_VIDEO_PLAYBACK_SPEED;
      modalVideoPromiseRef.current = null;
      setModalPlaybackSpeed(DEFAULT_VIDEO_PLAYBACK_SPEED);
      setModalShowVideoTrimmer(false);
      setModalTrimmerMeta(null);
      setIsCreateModalOpen(false);
      // Reset form
      setPostTitle('');
      setPostContent('');
      setModalTaggedUsers([]);
      setShowModalTagPicker(false);
      setPostConstituency('');
      setModalVideoData(null);
      setModalAudioData(null);
      setModalSound(null);
      setModalShowVoiceRecorder(false);
      setModalShowVideoRecorder(false);
      setCompressedImage(null);
      setModalMediaType('image');
      setImageMeta(null);
      setVideoMeta(null);
      setMediaCaption('');
      setModalIncludeLocation(false);
      setModalHighlightVideo(false);
      setModalBgColor('default');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
      trackFunnelMilestone(
        'engaged_action',
        isAudio ? 'Published voice shout' : isVideo ? 'Published short video' : 'Published community post'
      );
      triggerToast(
        isAudio
          ? '✓ Voice shout published to TUJUANE feed!'
          : isVideo
          ? '✓ Short video published to TUJUANE feed!'
          : '✓ Post published to TUJUANE community!'
      );
    } catch (err: any) {
      setFormError(err?.message || 'Failed to publish post. Please try again.');
    } finally {
      setIsSubmitting(false);
      setModalUploadProgress(null);
    }
  };

  // React to post (strictly one reaction per user)
  const handleReactToPost = async (post: CommunityPost, reactionKey: string) => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    try {
      const res = await reactToCommunityPost(post.id, currentUser.uid, reactionKey);
      setActiveReactionPickerPostId(null);
      if (res?.reaction) {
        trackFunnelMilestone('engaged_action', `Reacted (${res.reaction}) on community post`);
      }

      if (res?.reaction && post.authorId && post.authorId !== currentUser.uid) {
        const reactionMeta = REACTION_TYPES.find((r) => r.key === res.reaction);
        sendUserNotification({
          userId: post.authorId,
          category: 'post_interaction',
          type: 'post_like',
          title: `${reactionMeta?.emoji || '👍'} New reaction on your discussion`,
          message: `${userProfile?.displayName || 'A citizen'} reacted with ${reactionMeta?.label || 'reaction'} on "${post.title.slice(0, 45)}"`,
          postId: post.id,
          postTitle: post.title,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName,
          actorPhoto: userProfile?.photoURL,
          actorCounty: userProfile?.county
        });
      }
    } catch (err) {
      console.error('Error reacting to post:', err);
      triggerToast('Could not record reaction.');
    }
  };

  // React to comment (strictly one reaction per user)
  const handleReactToComment = async (postId: string, comment: CommunityComment, reactionKey: string) => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    try {
      const res = await reactToCommunityComment(postId, comment.id, currentUser.uid, reactionKey);
      setActiveReactionPickerCommentId(null);

      if (res?.reaction && comment.authorId && comment.authorId !== currentUser.uid) {
        const reactionMeta = REACTION_TYPES.find((r) => r.key === res.reaction);
        sendUserNotification({
          userId: comment.authorId,
          category: 'post_interaction',
          type: 'post_like',
          title: `${reactionMeta?.emoji || '👍'} Reaction on your reply`,
          message: `${userProfile?.displayName || 'A citizen'} reacted with ${reactionMeta?.label || 'reaction'} to your reply`,
          postId,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName,
          actorPhoto: userProfile?.photoURL,
          actorCounty: userProfile?.county
        });
      }
    } catch (err) {
      console.error('Error reacting to comment:', err);
      triggerToast('Could not record comment reaction.');
    }
  };

  // Toggle upvote (delegates to 'like' reaction)
  const handleUpvote = async (post: CommunityPost) => {
    handleReactToPost(post, 'like');
  };

  const ensureCommentsLoaded = useCallback((postId: string) => {
    if (commentUnsubsRef.current[postId]) return;
    commentUnsubsRef.current[postId] = subscribeToPostComments(postId, (comments) => {
      setCommentsMap((prev) => ({ ...prev, [postId]: comments }));
    });
  }, []);

  // Expand / collapse comments
  const handleToggleComments = (postId: string) => {
    if (expandedCommentsPostId === postId) {
      setExpandedCommentsPostId(null);
      return;
    }

    setExpandedCommentsPostId(postId);
    ensureCommentsLoaded(postId);
  };

  // Reusable comment submit with Safety Screening (used by both inline comments and Full-Screen Video Modal)
  const submitCommentForPost = async (
    postId: string,
    rawContent: string,
    mediaUrl?: string,
    replyTo?: { commentId: string; authorName: string; authorId: string } | null
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return false;
    }

    if (isBanned) {
      triggerToast(`⛔ Account permanently banned: ${userProfile.banReason || 'Policy violation'}`);
      return false;
    }
    if (isSuspended) {
      const untilStr = userProfile.suspendedUntil
        ? new Date(userProfile.suspendedUntil).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
        : 'temporary duration';
      triggerToast(`⚠️ Account suspended until ${untilStr}: ${userProfile.banReason || 'Policy violation'}`);
      return false;
    }

    const commentText = rawContent.trim();
    if (!commentText && !mediaUrl) return false;

    const commentSafety = analyzeContentSafety(commentText);
    if (commentSafety.severity === 'high') {
      setBlockedSafetyResult(commentSafety);
      return false;
    }

    try {
      const resolvedCommentTagged = resolveMentionedUsers(
        commentText,
        allDirectoryUsers,
        commentTaggedUsers,
        currentUser.uid
      );

      await addCommunityComment(
        postId,
        userProfile,
        commentText,
        mediaUrl,
        replyTo?.commentId,
        replyTo?.authorName,
        resolvedCommentTagged
      );

      if (replyTo && replyTo.authorId && replyTo.authorId !== currentUser.uid) {
        sendUserNotification({
          userId: replyTo.authorId,
          category: 'post_interaction',
          type: 'post_comment',
          title: 'Reply to your Comment',
          message: `${userProfile.displayName} replied: "${commentText.slice(0, 60)}${commentText.length > 60 ? '...' : ''}"`,
          postId,
          actorId: currentUser.uid,
          actorName: userProfile.displayName,
          actorPhoto: userProfile.photoURL,
          actorCounty: userProfile.county
        }).catch(() => {});
      }

      const targetPost = posts.find((p) => p.id === postId);
      if (
        targetPost &&
        targetPost.authorId &&
        targetPost.authorId !== currentUser.uid &&
        (!replyTo || replyTo.authorId !== targetPost.authorId)
      ) {
        sendUserNotification({
          userId: targetPost.authorId,
          category: 'post_interaction',
          type: 'post_comment',
          title: 'New Reply on your Discussion',
          message: `${userProfile.displayName} replied: "${commentText.slice(0, 60)}${commentText.length > 60 ? '...' : ''}"`,
          postId: targetPost.id,
          postTitle: targetPost.title,
          actorId: currentUser.uid,
          actorName: userProfile.displayName,
          actorPhoto: userProfile.photoURL,
          actorCounty: userProfile.county
        }).catch(() => {});
      }

      notifyTaggedUsers(
        resolvedCommentTagged,
        commentText,
        postId,
        targetPost?.title,
        replyTo?.authorId ? [replyTo.authorId] : []
      );
      return true;
    } catch (err) {
      console.error('Error posting comment:', err);
      triggerToast('Failed to post reply.');
      return false;
    }
  };

  // Submit inline feed comment
  const handleSubmitComment = async (postId: string) => {
    if (!commentInput.trim() && !commentImage) return;
    setIsSubmittingComment(true);
    try {
      const ok = await submitCommentForPost(
        postId,
        commentInput,
        commentImage || undefined,
        replyingToComment
      );
      if (ok) {
        trackFunnelMilestone('engaged_action', 'Submitted feed comment');
        setCommentInput('');
        setCommentImage(null);
        setReplyingToComment(null);
        setCommentTaggedUsers([]);
        if (commentFileInputRef.current) commentFileInputRef.current.value = '';
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSharePost = (post: CommunityPost) => {
    if (navigator.share) {
      navigator
        .share({
          title: post.title,
          text: `${post.title}: ${post.content} (via TUJUANE)`,
          url: window.location.href
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(`${post.title}: ${post.content} - TUJUANE Community Hub`);
      triggerToast('Post copied to clipboard!');
    }
  };

  // Delete post via In-App confirmation modal
  const handleOpenDeleteModal = (post: CommunityPost) => {
    setPostToDelete(post);
  };

  const handleConfirmDelete = async () => {
    if (!postToDelete || !currentUser) return;
    setIsDeletingPost(true);
    try {
      await deleteCommunityPost(postToDelete.id, currentUser.uid, isDeveloper);
      triggerToast('Post deleted successfully.');
      setPostToDelete(null);
    } catch (err) {
      console.error('Delete post error:', err);
      triggerToast('Could not delete post.');
    } finally {
      setIsDeletingPost(false);
    }
  };

  // Follow / Unfollow user
  const handleToggleFollow = async (
    authorId: string,
    authorName: string,
    authorCounty?: string,
    authorPhoto?: string
  ) => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    const isFollowing = followingIds.includes(authorId);
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.uid, authorId);
        triggerToast(`Unfollowed ${authorName}`);
      } else {
        const target: UserProfile = {
          uid: authorId,
          displayName: authorName,
          email: '',
          county: authorCounty || 'Nairobi',
          photoURL: authorPhoto,
          createdAt: ''
        };
        await followUser(userProfile, target);
        triggerToast(`Now following ${authorName}!`);
      }
    } catch (err) {
      console.error('Follow error:', err);
      triggerToast('Failed to update follow status.');
    }
  };

  // Report post to community moderators
  const handleOpenReportModal = (post: CommunityPost) => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    setReportModalPost(post);
    setReportCategory('misleading');
    setReportDetails('');
  };

  const handleSubmitReport = async () => {
    if (!reportModalPost || !currentUser || !userProfile) return;
    setIsSubmittingReport(true);
    try {
      await submitSafetyReport({
        postId: reportModalPost.id,
        postTitle: reportModalPost.title,
        postSnippet: reportModalPost.content.slice(0, 150),
        authorId: reportModalPost.authorId,
        authorName: reportModalPost.authorName,
        reporterId: currentUser.uid,
        reporterName: userProfile.displayName,
        category: reportCategory,
        details: reportDetails.trim()
      });
      triggerToast('Thank you. Content reported for safety review.');
      setReportModalPost(null);
    } catch (err) {
      console.error('Report error:', err);
      triggerToast('Could not submit report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Block & Mute actions
  const handleConfirmBlockAuthor = async () => {
    if (!userToBlock) return;
    setIsBlockingInProgress(true);
    try {
      await blockUser(userToBlock.id);
      triggerToast(`Blocked @${userToBlock.name}. Their posts and messages are now hidden.`);
      setUserToBlock(null);
      setOpenPostMenuId(null);
    } catch (err) {
      console.error('Failed to block author:', err);
      triggerToast('Could not block author. Please try again.');
    } finally {
      setIsBlockingInProgress(false);
    }
  };

  const handleToggleMuteAuthor = async (authorId: string, authorName: string) => {
    try {
      if (mutedUserIds.includes(authorId)) {
        await unmuteUser(authorId);
        triggerToast(`Unmuted notifications from ${authorName}`);
      } else {
        await muteUser(authorId);
        triggerToast(`Muted notifications from ${authorName}`);
      }
      setOpenPostMenuId(null);
    } catch (err) {
      console.error('Failed to mute/unmute author:', err);
      triggerToast('Failed to update mute setting.');
    }
  };

  // Count posts hidden because of blocked users
  const blockedPostsCount = useMemo(() => {
    if (!blockedUserIds || blockedUserIds.length === 0) return 0;
    return posts.filter((p) => blockedUserIds.includes(p.authorId)).length;
  }, [posts, blockedUserIds]);

  // Search, County, Constituency, Category, Video, Audience, Sort and Block filter
  const filteredPosts = useMemo(() => {
    const list = posts.filter((post) => {
      // Hide discussions from blocked users
      if (blockedUserIds && blockedUserIds.includes(post.authorId)) {
        return false;
      }
      if (selectedCounty !== 'All' && (post.county || '').toLowerCase() !== selectedCounty.toLowerCase()) {
        return false;
      }
      if (
        selectedConstituency !== 'All' &&
        (post.constituency || '').toLowerCase() !== selectedConstituency.toLowerCase()
      ) {
        return false;
      }
      if (feedAudience === 'following' && !followingIds.includes(post.authorId) && post.authorId !== currentUser?.uid) {
        return false;
      }
      if (selectedCategory === 'videos') {
        const isVid =
          post.mediaType === 'video' ||
          (post.mediaUrl?.startsWith('data:video/') ?? false) ||
          (post.videoChunkCount ?? 0) > 0;
        if (!isVid) return false;
      } else if (selectedCategory === 'audio') {
        const isAud =
          post.mediaType === 'audio' ||
          (post.mediaUrl?.startsWith('data:audio/') ?? false);
        if (!isAud) return false;
      } else if (selectedCategory !== 'all' && post.category !== selectedCategory) {
        return false;
      }
      if (selectedHashtag && !postMatchesHashtag(post, selectedHashtag)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const titleMatch = post.title.toLowerCase().includes(q);
      const contentMatch = post.content.toLowerCase().includes(q);
      const authorMatch = post.authorName.toLowerCase().includes(q);
      const countyMatch = (post.county || '').toLowerCase().includes(q);
      const tagMatch = (post.hashtags || []).some((h) => h.toLowerCase().includes(q.replace(/^#/, '')));
      const mentionMatch = (post.taggedUsers || []).some((t) => t.displayName.toLowerCase().includes(q.replace(/^@/, '')));
      return titleMatch || contentMatch || authorMatch || countyMatch || tagMatch || mentionMatch;
    });

    if (sortBy === 'popular') {
      return [...list].sort((a, b) => b.upvotes - a.upvotes);
    }
    return list;
  }, [
    posts,
    blockedUserIds,
    selectedCounty,
    selectedConstituency,
    feedAudience,
    followingIds,
    currentUser?.uid,
    selectedCategory,
    selectedHashtag,
    searchQuery,
    sortBy
  ]);

  const videoPosts = useMemo(
    () =>
      filteredPosts.filter(
        (post) =>
          post.mediaType === 'video' ||
          (post.mediaUrl?.startsWith('data:video/') ?? false) ||
          (post.videoChunkCount ?? 0) > 0
      ),
    [filteredPosts]
  );

  const availablePostedSounds = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            (p.mediaType === 'video' ||
              (p.mediaUrl?.startsWith('data:video/') ?? false) ||
              (p.videoChunkCount ?? 0) > 0) &&
            p.videoStatus !== 'uploading'
        )
        .map((p) => {
          const live = resolveLiveAuthor(
            p.authorId,
            { displayName: p.authorName },
            usersById
          );
          return buildSoundFromPost(p, live.displayName);
        }),
    [posts, usersById]
  );

  // Category visual styles helper
  const getCategoryMeta = (cat: PostCategory) => {
    switch (cat) {
      case 'hustle':
        return {
          label: 'Jobs & Hustle',
          icon: Briefcase,
          bg: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
          dot: 'bg-emerald-500'
        };
      case 'local_news':
        return {
          label: 'Local Happenings',
          icon: Compass,
          bg: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
          dot: 'bg-amber-500'
        };
      case 'meetup':
        return {
          label: 'Meetups & Events',
          icon: Users,
          bg: 'bg-purple-500/12 text-purple-800 dark:text-purple-300',
          dot: 'bg-purple-500'
        };
      case 'campus':
        return {
          label: 'Campus Life',
          icon: GraduationCap,
          bg: 'bg-indigo-500/12 text-indigo-800 dark:text-indigo-300',
          dot: 'bg-indigo-500'
        };
      case 'question':
        return {
          label: 'Questions & Advice',
          icon: HelpCircle,
          bg: 'bg-teal-500/12 text-teal-800 dark:text-teal-300',
          dot: 'bg-teal-500'
        };
      case 'discussion':
        return {
          label: 'Civic Discussion',
          icon: Sparkles,
          bg: 'bg-cyan-500/12 text-cyan-800 dark:text-cyan-300',
          dot: 'bg-cyan-500'
        };
      default:
        return {
          label: 'General Chit-Chat',
          icon: MessageSquare,
          bg: 'bg-sky-500/12 text-sky-800 dark:text-sky-300',
          dot: 'bg-sky-500'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}


      {/* Citizen 24h Stories Bar (Pictures & Videos) */}
      <CitizenStoriesBar
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenAuthModal={(mode) => openAuthModal(mode === 'register' ? 'register' : 'signin')}
        onViewUserProfile={onViewUserProfile}
      />

      {/* Daily Community Poll Interactive Feature (Minimized slim bar by default) */}
      <section aria-label="Daily Community Poll" className="space-y-2">
        <button
          type="button"
          onClick={() => setShowDailyPoll((prev) => !prev)}
          aria-expanded={showDailyPoll}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl tujuane-surface hover:opacity-95 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <Vote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              Daily Citizen Polls
            </span>
            <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
              Live
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
            <span>{showDailyPoll ? 'Minimize' : 'Expand'}</span>
            {showDailyPoll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        {showDailyPoll && (
          <DailyCommunityPoll
            compact
            onDiscussInFeed={(topicTitle) => {
              setSearchQuery(topicTitle.slice(0, 25));
              window.scrollTo({ top: 600, behavior: 'smooth' });
            }}
          />
        )}
      </section>

      {/* Filter and Search Controls */}
      <div className="tujuane-surface p-3 sm:p-4 rounded-2xl space-y-3 transition-colors">
        {/* Audience Toggle: All Kenya vs Following & Friends */}
        <div className="flex items-center justify-between pb-2 border-b tujuane-divider flex-wrap gap-2">
          <div className="inline-flex flex-wrap rounded-xl p-0.5 tujuane-surface-soft text-xs font-semibold">
            <button
              onClick={() => setFeedAudience('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                feedAudience === 'all'
                  ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>All Kenya (47 Counties)</span>
            </button>
            <button
              onClick={() => setFeedAudience('following')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                feedAudience === 'following'
                  ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Following</span>
              {followingIds.length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 rounded-full text-[10px] font-bold">
                  {followingIds.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Community Safety Filter Active</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Topics
            </button>
            <button
              onClick={() => setSelectedCategory('videos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'videos'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Short Videos</span>
            </button>
            <button
              onClick={() => setSelectedCategory('audio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'audio'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Shouts</span>
            </button>
            <button
              onClick={() => setSelectedCategory('general')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'general'
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chit-Chat</span>
            </button>
            <button
              onClick={() => setSelectedCategory('hustle')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'hustle'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Jobs & Hustle</span>
            </button>
            <button
              onClick={() => setSelectedCategory('local_news')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'local_news'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Local News</span>
            </button>
            <button
              onClick={() => setSelectedCategory('meetup')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'meetup'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Meetups</span>
            </button>
            <button
              onClick={() => setSelectedCategory('campus')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'campus'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Campus Life</span>
            </button>
            <button
              onClick={() => setSelectedCategory('question')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'question'
                  ? 'bg-teal-600 text-white'
                  : 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Questions</span>
            </button>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Sort:</span>
            <div className="inline-flex rounded-xl p-0.5 tujuane-surface-soft text-xs font-medium">
              <button
                onClick={() => setSortBy('latest')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === 'latest' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Latest
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === 'popular' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Most Upvoted
              </button>
            </div>
          </div>
        </div>

        {/* Search bar & County / Constituency dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t tujuane-divider">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations, authors, or topics..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs tujuane-surface-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="sm:col-span-4 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <select
              value={selectedCounty}
              onChange={(e) => {
                setSelectedCounty(e.target.value);
                setSelectedConstituency('All');
              }}
              className="w-full px-2.5 py-1.5 text-xs tujuane-surface-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
            >
              <option value="All">All 47 Kenya Counties</option>
              {ALL_47_COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c} County
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedConstituency}
              onChange={(e) => setSelectedConstituency(e.target.value)}
              disabled={selectedCounty === 'All' || availableFilterConstituencies.length === 0}
              className="w-full px-2.5 py-1.5 text-xs tujuane-surface-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium disabled:opacity-50"
            >
              <option value="All">
                {selectedCounty === 'All' ? 'All Constituencies' : `All ${selectedCounty} Constituencies`}
              </option>
              {availableFilterConstituencies.map((con) => (
                <option key={con} value={con}>
                  {con}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trending # Tags Discovery Bar */}
        <div ref={feedTopRef} className="pt-2.5 border-t tujuane-divider flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Trending</span>
          </div>

          {selectedHashtag && (
            <button
              type="button"
              onClick={() => setSelectedHashtag(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shadow-xs cursor-pointer hover:bg-emerald-700 transition-colors"
              title="Clear #tag filter"
            >
              <span>#{selectedHashtag}</span>
              <X className="w-3 h-3" />
            </button>
          )}

          {trendingHashtags.length > 0 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 flex-1">
              {trendingHashtags.map((item) => {
                const isActive = selectedHashtag === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedHashtag(isActive ? null : item.key)}
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    }`}
                  >
                    <Hash className="w-3 h-3 opacity-80" />
                    <span>{item.tag}</span>
                    <span className={`text-[10px] ${isActive ? 'text-emerald-100' : 'text-emerald-600/75 dark:text-emerald-400/75'}`}>
                      · {item.postCount}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 flex-1">
              {['KenyaVoices', 'CivicAction', 'CountyWatch', 'MtaaniUpdates'].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    if (currentUser) {
                      setQuickCaption((prev) =>
                        prev ? `${prev.trimEnd()} #${starter} ` : `#${starter} `
                      );
                    }
                  }}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold tujuane-surface-soft text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer transition-colors"
                  title={`Add #${starter} to your post`}
                >
                  <Hash className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{starter}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DIRECT QUICK POST COMPOSER - Post caption, photo, or short video directly */}
      <div className="tujuane-surface rounded-3xl p-4 sm:p-5 space-y-3.5 transition-colors">
        {/* Hidden file inputs for quick photo and short video */}
        <input
          ref={quickFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleQuickImageFileChange}
          className="hidden"
        />
        <input
          ref={quickVideoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          onChange={handleQuickImageFileChange}
          className="hidden"
        />

        {quickError && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
            <span>{quickError}</span>
            <button
              type="button"
              onClick={() => setQuickError(null)}
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg cursor-pointer"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-start gap-3">
          {/* User Avatar */}
          <div className="shrink-0 mt-0.5">
              {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-10 h-10 rounded-2xl object-cover"
              />
            ) : currentUser ? (
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold flex items-center justify-center text-sm">
                {(userProfile?.displayName || currentUser.displayName || 'C').charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl tujuane-surface-soft text-slate-400 dark:text-slate-500 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Caption Input */}
          <div className="flex-1 space-y-2">
            <textarea
              rows={quickBgColor !== 'default' && !quickImage ? 3 : 2}
              value={quickCaption}
              onChange={(e) => setQuickCaption(e.target.value)}
              placeholder={
                currentUser
                  ? quickMediaType === 'video' && quickImage
                    ? 'Add a caption, #hashtag, or @tag someone...'
                    : "What's on your mind? Add #hashtags or @tag citizen profiles..."
                  : "Sign in to post captions, photos, or short videos..."
              }
              disabled={!currentUser}
              maxLength={2000}
              className={`w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-2xl focus:outline-none transition-all resize-none leading-relaxed disabled:opacity-60 ${
                quickBgColor !== 'default' && !quickImage
                  ? `${SOLID_POST_BACKGROUNDS.find((c) => c.id === quickBgColor)?.bgClass || 'bg-emerald-600 text-white'} text-center font-bold text-sm sm:text-base p-4 placeholder:text-white/70 shadow-inner`
                  : 'tujuane-surface-soft focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
              }`}
            />

            {currentUser && (
              <>
                <InlineTagSuggestions
                  compact
                  text={quickCaption}
                  users={allDirectoryUsers}
                  currentUserId={currentUser.uid}
                  trendingHashtags={trendingHashtags}
                  onSelectMention={(user, start, end) => {
                    setQuickCaption((prev) =>
                      replaceActiveTagRange(prev, start, end, `@${user.displayName}`)
                    );
                    addUniqueTaggedUser(setQuickTaggedUsers, user);
                  }}
                  onSelectHashtag={(tag, start, end) => {
                    setQuickCaption((prev) =>
                      replaceActiveTagRange(prev, start, end, `#${tag}`)
                    );
                  }}
                />

                <ProfileTagBar
                  taggedUsers={quickTaggedUsers}
                  onAddTaggedUser={(user) => addUniqueTaggedUser(setQuickTaggedUsers, user)}
                  onRemoveTaggedUser={(uid) =>
                    setQuickTaggedUsers((prev) => prev.filter((t) => t.uid !== uid))
                  }
                  allUsers={allDirectoryUsers}
                  currentUserId={currentUser.uid}
                  showPicker={showQuickTagPicker}
                  onTogglePicker={() => setShowQuickTagPicker((prev) => !prev)}
                  trendingHashtags={trendingHashtags}
                  onInsertHashtag={(tag) =>
                    setQuickCaption((prev) =>
                      prev.trim() ? `${prev.trimEnd()} #${tag} ` : `#${tag} `
                    )
                  }
                />
              </>
            )}
          </div>
        </div>

        {/* Solid Background Color Palette Selector (when no media attached) */}
        {!quickImage && currentUser && (
          <div className="pt-2 border-t tujuane-divider flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <Palette className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Background Color:</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {SOLID_POST_BACKGROUNDS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setQuickBgColor(col.id)}
                  title={col.name}
                  className={`w-6 h-6 rounded-full shrink-0 transition-transform cursor-pointer relative flex items-center justify-center border ${
                    quickBgColor === col.id
                      ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 scale-110 border-white dark:border-slate-900 shadow-xs'
                      : 'border-slate-300 dark:border-slate-600 hover:scale-105'
                  } ${col.previewBg}`}
                >
                  {quickBgColor === col.id && (
                    <Check className={`w-3 h-3 ${col.id === 'default' ? 'text-slate-900 dark:text-slate-100' : 'text-white'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Composer Live Camera Video Recorder */}
        {quickShowVideoRecorder && !quickImage && !quickShowVideoTrimmer && (
          <div className="animate-in fade-in">
            <ShortVideoCameraRecorder
              initialSound={quickSound}
              initialMixMode={quickSoundMixMode}
              onSoundChange={(sound, mode) => {
                setQuickSound(sound);
                setQuickSoundMixMode(mode);
              }}
              onVideoReady={handleQuickRecordedVideo}
              onCancel={() => setQuickShowVideoRecorder(false)}
              onFallbackUploadClick={() => {
                setQuickShowVideoRecorder(false);
                quickVideoInputRef.current?.click();
              }}
              disabled={isQuickSubmitting}
            />
          </div>
        )}

        {/* Quick Composer Client-Side Video Trimmer */}
        {quickShowVideoTrimmer && quickUnbakedFileRef.current && (
          <div className="animate-in fade-in">
            <VideoTrimmerPanel
              sourceFile={quickUnbakedFileRef.current}
              totalDurationSec={quickTrimmerMeta?.duration}
              maxClipDurationSec={MAX_FEED_VIDEO_DURATION_SEC}
              initialStartSec={quickTrimRangeRef.current?.startTimeSec ?? 0}
              initialEndSec={quickTrimRangeRef.current?.endTimeSec}
              initialPlaybackSpeed={quickPlaybackSpeed}
              noticeText={quickTrimmerMeta?.notice}
              onApplyTrim={(startSec, endSec, nextSpeed) => {
                const file = quickUnbakedFileRef.current;
                if (file) {
                  void runQuickVideoProcessing(file, {
                    startTimeSec: startSec,
                    endTimeSec: endSec
                  }, nextSpeed);
                }
              }}
              onCancel={() => {
                setQuickShowVideoTrimmer(false);
                setQuickTrimmerMeta(null);
                if (!quickImage && !isQuickCompressing && quickUnbakedFileRef.current) {
                  // Video exceeded 5m and user cancelled initial prompt -> clear attachment cleanly
                  handleRemoveQuickImage();
                }
              }}
              disabled={isQuickSubmitting}
            />
          </div>
        )}

        {/* Attached Photo or Video Preview */}
        {quickImage && !quickShowVideoTrimmer && (
          <div className="relative rounded-2xl overflow-hidden bg-slate-950/90 max-h-72 flex items-center justify-center">
            {quickMediaType === 'video' ? (
              <video
                ref={quickPreviewVideoRef}
                src={quickImage}
                poster={quickVideoData?.thumbnailDataUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                onLoadedMetadata={() => {
                  const v = quickPreviewVideoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
                  if (!v) return;
                  const encodedSpeed = quickVideoData?.playbackSpeed || 1;
                  try {
                    v.playbackRate = Math.min(4, Math.max(0.25, quickPlaybackSpeed / encodedSpeed));
                    if ('preservesPitch' in v) v.preservesPitch = true;
                  } catch {
                    // ignore
                  }
                }}
                className="max-h-72 w-full object-contain bg-black"
              />
            ) : (
              <img src={quickImage} alt="Attachment" className="max-h-64 object-contain w-full" />
            )}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              {quickMediaType === 'video' && quickUnbakedFileRef.current && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickTrimmerMeta((prev) => prev || (quickVideoMeta ? { duration: quickVideoMeta.originalDuration || quickVideoMeta.duration } : null));
                    setQuickShowVideoTrimmer(true);
                  }}
                  disabled={isQuickSubmitting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black/75 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-full transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                  title="Crop start and end of this video"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Trim</span>
                </button>
              )}
              {quickMediaType === 'video' && (
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveQuickImage();
                    setQuickShowVideoRecorder(true);
                  }}
                  disabled={isQuickSubmitting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black/70 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-full transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                  title="Re-record with camera"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-record</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleRemoveQuickImage}
                disabled={isQuickSubmitting}
                className="p-1.5 bg-black/65 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer disabled:opacity-40"
                title={`Remove attached ${quickMediaType}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {quickMediaType === 'image' && quickImageMeta && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded-md">
                Compressed to {formatFileSize(quickImageMeta.compSize)}
              </span>
            )}
            {quickMediaType === 'video' && quickVideoMeta && (
              <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 text-white text-[10px] font-semibold font-mono tabular-nums rounded-md flex items-center gap-1 backdrop-blur-xs">
                <Video className="w-3 h-3 text-indigo-400" />
                <span>
                  {quickVideoMeta.wasAutoTrimmed
                    ? `Trimmed ${formatVideoDuration(quickVideoMeta.originalDuration)} → ${formatVideoDuration(quickVideoMeta.duration)}`
                    : formatVideoDuration(quickVideoMeta.duration)}
                  {quickPlaybackSpeed !== 1 ? ` · ${quickPlaybackSpeed}x` : ''}
                  {' · '}
                  {formatFileSize(quickVideoMeta.size)}
                  {quickVideoMeta.wasCompressed && quickVideoMeta.originalSize && quickVideoMeta.originalSize > quickVideoMeta.size
                    ? ` (-${Math.round(((quickVideoMeta.originalSize - quickVideoMeta.size) / quickVideoMeta.originalSize) * 100)}%)`
                    : ''}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Quick Composer Playback Speed Controls */}
        {quickMediaType === 'video' && (quickImage || isQuickCompressing) && !quickShowVideoTrimmer && quickUnbakedFileRef.current && (
          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              <Gauge className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Playback Speed</span>
            </div>
            <div className="inline-flex items-center rounded-lg bg-slate-200/80 dark:bg-slate-900 p-0.5 gap-0.5 overflow-x-auto max-w-full">
              {VIDEO_PLAYBACK_SPEED_OPTIONS.map((spd) => {
                const active = Math.abs(quickPlaybackSpeed - spd) < 0.01;
                return (
                  <button
                    key={spd}
                    type="button"
                    disabled={isQuickSubmitting}
                    onClick={() => handleQuickPlaybackSpeedChange(spd)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                      active
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {spd}x
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Video Auto-Compression & Trimming Progress Bar */}
        {isQuickCompressing && quickTrimProgress !== null && !quickShowVideoTrimmer && (
          <div className="space-y-1.5 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50">
            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 gap-2">
              <span className="truncate">{quickTrimStage}</span>
              <span className="font-mono tabular-nums shrink-0">{quickTrimProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${quickTrimProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {quickBackgroundUpload && (
                <p className="text-[10px] text-slate-600 dark:text-slate-300">
                  Tap <strong>Post in Background</strong> anytime to queue & keep browsing.
                </p>
              )}
              {quickUnbakedFileRef.current && (
                <button
                  type="button"
                  onClick={() => {
                    quickVideoAbortRef.current?.abort();
                    quickVideoAbortRef.current = null;
                    quickVideoGenerationRef.current += 1;
                    quickVideoPromiseRef.current = null;
                    setIsQuickCompressing(false);
                    setQuickTrimProgress(null);
                    setQuickShowVideoTrimmer(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer ml-auto"
                >
                  <Scissors className="w-3 h-3" />
                  <span>Trim Start/End Instead</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick Video Sound Selector Strip (when sound pre-selected or video attached) */}
        {(quickSound || (quickMediaType === 'video' && quickImage)) && (
          <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-2">
            {quickSound ? (
              <>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Music className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 truncate">
                      {quickSound.soundTitle}
                    </div>
                    <div className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">
                      Sound by {quickSound.authorName} · {quickSoundMixMode === 'mix' ? 'Mix + Original' : 'Sound Only'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {quickMediaType === 'video' && quickImage && !quickSoundBakedInRecorderRef.current && (
                    <div className="inline-flex rounded-lg bg-white dark:bg-slate-800 p-0.5 text-[10px] font-bold border border-indigo-200 dark:border-indigo-700">
                      <button
                        type="button"
                        disabled={isQuickSubmitting || isQuickCompressing}
                        onClick={() => applySoundToExistingVideo('quick', quickSound, 'replace')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          quickSoundMixMode === 'replace'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Sound Only
                      </button>
                      <button
                        type="button"
                        disabled={isQuickSubmitting || isQuickCompressing}
                        onClick={() => applySoundToExistingVideo('quick', quickSound, 'mix')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          quickSoundMixMode === 'mix'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Mix + Orig
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={isQuickSubmitting || isQuickCompressing}
                    onClick={() => setSoundPickerTarget('quick')}
                    className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-40"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    disabled={isQuickSubmitting || isQuickCompressing}
                    onClick={() => applySoundToExistingVideo('quick', null, quickSoundMixMode)}
                    className="p-1 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 cursor-pointer disabled:opacity-40"
                    title="Remove selected sound"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  <Music className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Add a posted video sound to this clip</span>
                </div>
                <button
                  type="button"
                  disabled={isQuickSubmitting || isQuickCompressing}
                  onClick={() => setSoundPickerTarget('quick')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-40"
                >
                  <Music className="w-3 h-3" />
                  <span>Use Posted Sound</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Quick Video Background Upload Toggle */}
        {quickMediaType === 'video' && (quickVideoData || (isQuickCompressing && !!quickVideoFileRef.current)) && (
          <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 cursor-pointer">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              <UploadCloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Auto-upload video in background</span>
            </div>
            <input
              type="checkbox"
              checked={quickBackgroundUpload}
              onChange={(e) => setQuickBackgroundUpload(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
            />
          </label>
        )}

        {/* Quick Video Upload Progress Bar (when synchronous mode selected) */}
        {isQuickSubmitting && quickUploadProgress !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              <span>Publishing short video...</span>
              <span>{quickUploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${quickUploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Optional Location Selector */}
        {quickShowLocation && (
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800 rounded-2xl space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Tag Location (Optional)</span>
              </span>
              <button
                type="button"
                onClick={() => setQuickShowLocation(false)}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
              >
                Clear Location
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={quickCounty}
                onChange={(e) => {
                  setQuickCounty(e.target.value);
                  setQuickConstituency('');
                }}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 font-medium"
              >
                {ALL_47_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c} County
                  </option>
                ))}
              </select>
              <select
                value={quickConstituency}
                onChange={(e) => setQuickConstituency(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="">All Constituencies</option>
                {getConstituenciesByCounty(quickCounty).map((con) => (
                  <option key={con} value={con}>
                    {con}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Composer Actions Bottom Row */}
        <div className="flex items-center justify-between pt-2 border-t tujuane-divider gap-2 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {/* Add Photo Button */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) openAuthModal();
                else quickFileInputRef.current?.click();
              }}
              disabled={isQuickCompressing || isQuickSubmitting}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-100/70 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Attach a photo to this post"
            >
              <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isQuickCompressing && quickMediaType === 'image' ? 'Processing...' : 'Photo'}</span>
            </button>

            {/* Add Short Video Button */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) openAuthModal();
                else quickVideoInputRef.current?.click();
              }}
              disabled={isQuickCompressing || isQuickSubmitting}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 hover:bg-slate-100/70 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Upload a video file (MP4, WebM, MOV — up to 5 min · Full HD 1080p)"
            >
              <Video className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{isQuickCompressing && quickMediaType === 'video' ? 'Preparing...' : 'Video'}</span>
            </button>

            {/* Record Live Camera Short Video Button */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  openAuthModal();
                  return;
                }
                if (isBanned || isSuspended) {
                  handleOpenCreateModal();
                  return;
                }
                if (quickImage) {
                  handleRemoveQuickImage();
                }
                setQuickError(null);
                setQuickShowVideoRecorder((prev) => !prev);
              }}
              disabled={isQuickCompressing || isQuickSubmitting}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                quickShowVideoRecorder
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-slate-100/70 dark:hover:bg-white/10'
              }`}
              title="Record a live Full HD video with your camera (up to 5 min)"
            >
              <Camera className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>Record Video</span>
            </button>

            {/* Pick Posted Video Sound Button */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  openAuthModal();
                  return;
                }
                setSoundPickerTarget('quick');
              }}
              disabled={isQuickCompressing || isQuickSubmitting}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                quickSound
                  ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 hover:bg-slate-100/70 dark:hover:bg-white/10'
              }`}
              title="Use sound from any posted video for recording or posting"
            >
              <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{quickSound ? 'Sound Selected' : 'Use Sound'}</span>
            </button>

            {/* Record 30s Voice Shout Button (opens post modal directly in Voice Recorder mode) */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  openAuthModal();
                  return;
                }
                if (isBanned || isSuspended) {
                  handleOpenCreateModal();
                  return;
                }
                handleRemoveImage();
                setPostCategory('general');
                setModalBgColor('default');
                setModalHighlightVideo(false);
                setModalShowVoiceRecorder(true);
                setModalMediaType('audio');
                setFormError(null);
                setIsCreateModalOpen(true);
              }}
              disabled={isQuickCompressing || isQuickSubmitting}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-slate-100/70 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Record and share a 30-second audio shout"
            >
              <Mic className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>Voice Shout</span>
            </button>

            {/* Optional Location Toggle */}
            <button
              type="button"
              onClick={() => setQuickShowLocation(!quickShowLocation)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                quickShowLocation
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/10'
              }`}
              title="Optionally tag county location"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{quickShowLocation ? `${quickCounty}` : 'Add Location'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Sign In to Post
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDirectQuickPost}
                disabled={
                  isQuickSubmitting ||
                  quickShowVideoTrimmer ||
                  (isQuickCompressing && !(quickMediaType === 'video' && quickBackgroundUpload && !!quickVideoFileRef.current)) ||
                  (!quickCaption.trim() && !quickImage && !(isQuickCompressing && quickMediaType === 'video' && quickBackgroundUpload && !!quickVideoFileRef.current))
                }
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {quickMediaType === 'video' && quickBackgroundUpload && (quickVideoData || (isQuickCompressing && !!quickVideoFileRef.current)) ? (
                  <UploadCloud className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>
                  {isQuickSubmitting
                    ? quickUploadProgress !== null
                      ? `Posting (${quickUploadProgress}%)`
                      : 'Posting...'
                    : quickMediaType === 'video' && quickBackgroundUpload && (quickVideoData || (isQuickCompressing && !!quickVideoFileRef.current))
                    ? 'Post in Background'
                    : 'Direct Post'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Blocked Accounts Notice */}
      {blockedPostsCount > 0 && (
        <div className="p-3 tujuane-surface-soft rounded-2xl text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              <strong>{blockedPostsCount}</strong> discussion{blockedPostsCount > 1 ? 's' : ''} from blocked citizen accounts are hidden from your feed.
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold">Feed Protected</span>
        </div>
      )}

      {/* Posts Stream */}
      <div className="space-y-4">
        {isLoadingPosts && filteredPosts.length === 0 ? (
          <FeedPostSkeletonList count={3} />
        ) : filteredPosts.length === 0 ? (
          <div className="tujuane-surface rounded-2xl p-12 text-center space-y-4 transition-colors">
            <div className="w-12 h-12 rounded-2xl tujuane-surface-soft text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">No discussions found in this section</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Be the first to start a conversation, share a local update, or post an opportunity for{' '}
              {selectedCounty === 'All' ? 'Kenya' : `${selectedCounty} County`}!
            </p>
            {currentUser && (
              <button
                onClick={handleOpenCreateModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Discussion</span>
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => {
            const catMeta = getCategoryMeta(post.category);
            const Icon = catMeta.icon;
            const hasUpvoted = currentUser ? post.upvoters?.includes(currentUser.uid) : false;
            const isAuthor = currentUser?.uid === post.authorId;
            const isExpanded = expandedCommentsPostId === post.id;
            const comments = commentsMap[post.id] || [];
            const liveAuthor = resolveLiveAuthor(
              post.authorId,
              {
                displayName: post.authorName,
                photoURL: post.authorPhotoUrl,
                county: post.authorCounty || post.county || 'Nairobi',
                constituency: post.constituency
              },
              usersById
            );
            const resolvedPostAuthorCounty = liveAuthor.county || post.county;
            const resolvedPostAuthorConstituency = liveAuthor.constituency || post.constituency;

            return (
              <article
                key={post.id}
                className="tujuane-surface rounded-2xl transition-all overflow-hidden"
              >
                <div className="p-3.5 sm:p-6 space-y-3.5 sm:space-y-4">
                  {/* Top: Author, Category Badge, County & Date */}
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div
                        onClick={() => {
                          if (onViewUserProfile) {
                            onViewUserProfile({
                              uid: post.authorId,
                              displayName: liveAuthor.displayName,
                              email: '',
                              photoURL: liveAuthor.photoURL,
                              county: resolvedPostAuthorCounty || 'Nairobi',
                              constituency: resolvedPostAuthorConstituency,
                              bio: liveAuthor.bio,
                              occupation: liveAuthor.occupation,
                              isOnline: liveAuthor.isOnline,
                              lastSeen: liveAuthor.lastSeen,
                              createdAt: ''
                            });
                          }
                        }}
                        className="cursor-pointer group relative shrink-0"
                        title={`View ${liveAuthor.displayName}'s Profile`}
                      >
                        {liveAuthor.photoURL ? (
                          <img
                            src={liveAuthor.photoURL}
                            alt={liveAuthor.displayName}
                            className="w-10 h-10 rounded-full object-cover group-hover:ring-2 group-hover:ring-emerald-500 transition-all"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-sm group-hover:bg-emerald-200 transition-colors">
                            {liveAuthor.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              if (onViewUserProfile) {
                                onViewUserProfile({
                                  uid: post.authorId,
                                  displayName: liveAuthor.displayName,
                                  email: '',
                                  photoURL: liveAuthor.photoURL,
                                  county: resolvedPostAuthorCounty || 'Nairobi',
                                  constituency: resolvedPostAuthorConstituency,
                                  bio: liveAuthor.bio,
                                  occupation: liveAuthor.occupation,
                                  isOnline: liveAuthor.isOnline,
                                  lastSeen: liveAuthor.lastSeen,
                                  createdAt: ''
                                });
                              }
                            }}
                            className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                            title={`View ${liveAuthor.displayName}'s Profile`}
                          >
                            {liveAuthor.displayName}
                          </button>

                          {liveAuthor.occupation && (
                            <span className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md tujuane-surface-soft text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                              {liveAuthor.occupation}
                            </span>
                          )}

                          {/* Follow / Following / Follow Back button */}
                          {currentUser && !isAuthor && (
                            <button
                              onClick={() =>
                                handleToggleFollow(
                                  post.authorId,
                                  liveAuthor.displayName,
                                  resolvedPostAuthorCounty,
                                  liveAuthor.photoURL
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                followingIds.includes(post.authorId)
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 dark:border-slate-700'
                                  : followerIds.includes(post.authorId)
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700'
                              }`}
                              title={followingIds.includes(post.authorId) ? 'Click to unfollow' : 'Follow this citizen'}
                            >
                              {followingIds.includes(post.authorId) ? (
                                <>
                                  <UserCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span>Following</span>
                                </>
                              ) : followerIds.includes(post.authorId) ? (
                                <>
                                  <UserPlus className="w-3 h-3" />
                                  <span>Follow Back</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3" />
                                  <span>Follow</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Direct message button */}
                          {currentUser && !isAuthor && onOpenDirectChatWithUser && (
                            <button
                              onClick={() => onOpenDirectChatWithUser(post.authorId, liveAuthor.displayName)}
                              className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                              title={`Start 1-on-1 chat with ${liveAuthor.displayName}`}
                            >
                              <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Chat</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {resolvedPostAuthorCounty ? (
                            <>
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{resolvedPostAuthorCounty}</span>
                              </span>
                              {resolvedPostAuthorConstituency && (
                                <>
                                  <span>·</span>
                                  <span className="text-slate-500 dark:text-slate-400">{resolvedPostAuthorConstituency}</span>
                                </>
                              )}
                              <span>·</span>
                            </>
                          ) : null}
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {post.createdAt ? new Date(post.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'Just now'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 relative">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${catMeta.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${catMeta.dot}`} />
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{catMeta.label}</span>
                      </span>

                      {/* Quick Community Report Flag Button */}
                      {currentUser && !isAuthor && (
                        <button
                          onClick={() => handleOpenReportModal(post)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Report discussion to civic moderators"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 3-Dots Action Dropdown Menu */}
                      {currentUser && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenPostMenuId(openPostMenuId === post.id ? null : post.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="More options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {openPostMenuId === post.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30 animate-in fade-in zoom-in-95 text-xs text-slate-700 dark:text-slate-200 space-y-0.5"
                            >
                              {!isAuthor && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleMuteAuthor(post.authorId, post.authorName)}
                                    className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    {mutedUserIds.includes(post.authorId) ? (
                                      <>
                                        <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Unmute @{post.authorName}</span>
                                      </>
                                    ) : (
                                      <>
                                        <VolumeX className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                        <span>Mute @{post.authorName}</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPostMenuId(null);
                                      setUserToBlock({ id: post.authorId, name: post.authorName });
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Block @{post.authorName}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPostMenuId(null);
                                      handleOpenReportModal(post);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    <Flag className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Report Post</span>
                                  </button>
                                </>
                              )}

                              {(isAuthor || isDeveloper) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenPostMenuId(null);
                                    handleOpenDeleteModal(post);
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-medium cursor-pointer border-t border-slate-100 dark:border-slate-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>{isDeveloper && !isAuthor ? 'Dev: Delete Post' : 'Delete My Post'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Safety Advisory Banner if attached by developer/moderators */}
                  {post.safetyAdvisory && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 rounded-r-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[11px] uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          Community Safety Advisory
                        </div>
                        <p className="mt-0.5 leading-relaxed">{post.safetyAdvisory}</p>
                      </div>
                    </div>
                  )}

                  {/* Under review notice if flagged */}
                  {!post.safetyAdvisory && post.isFlagged && (
                    <div className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1.5 w-fit">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>This discussion is currently under civic safety review.</span>
                    </div>
                  )}

                  {/* Post Content - Solid Background Color Card (for text posts) or standard text */}
                  {post.backgroundColor && post.backgroundColor !== 'default' && !post.mediaUrl && !(post.videoChunkCount && post.videoChunkCount > 0) ? (
                    <div
                      className={`p-6 sm:p-8 rounded-2xl min-h-[140px] sm:min-h-[170px] flex flex-col items-center justify-center text-center shadow-inner ${
                        SOLID_POST_BACKGROUNDS.find((c) => c.id === post.backgroundColor)?.bgClass || 'bg-emerald-600 text-white'
                      }`}
                    >
                      {post.title &&
                        post.title !== post.content &&
                        !post.content.startsWith(post.title) &&
                        post.title !== 'Citizen Post' &&
                        post.title !== 'Citizen Photo Update' && (
                          <h2 className="text-base sm:text-xl font-black leading-snug drop-shadow-xs mb-2">
                            <RichSocialText
                              text={post.title}
                              taggedUsers={post.taggedUsers}
                              usersById={usersById}
                              onHashtagClick={handleFilterByHashtag}
                              onMentionClick={onViewUserProfile}
                              inverted
                            />
                          </h2>
                        )}
                      <p className="text-base sm:text-xl font-bold leading-relaxed whitespace-pre-line drop-shadow-xs">
                        <RichSocialText
                          text={post.content}
                          taggedUsers={post.taggedUsers}
                          usersById={usersById}
                          onHashtagClick={handleFilterByHashtag}
                          onMentionClick={onViewUserProfile}
                          inverted
                        />
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {post.title &&
                        post.title !== post.content &&
                        !post.content.startsWith(post.title) &&
                        post.title !== 'Citizen Post' &&
                        post.title !== 'Citizen Photo Update' &&
                        post.title !== 'Citizen Video Update' &&
                        post.title !== 'Citizen Short Video' &&
                        post.title !== 'Citizen Voice Shout' && (
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                            <RichSocialText
                              text={post.title}
                              taggedUsers={post.taggedUsers}
                              usersById={usersById}
                              onHashtagClick={handleFilterByHashtag}
                              onMentionClick={onViewUserProfile}
                            />
                          </h2>
                        )}
                      <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                        <RichSocialText
                          text={post.content}
                          taggedUsers={post.taggedUsers}
                          usersById={usersById}
                          onHashtagClick={handleFilterByHashtag}
                          onMentionClick={onViewUserProfile}
                        />
                      </p>
                    </div>
                  )}

                  {/* Tagged Citizen Profiles & #Hashtag Chips */}
                  {((post.taggedUsers && post.taggedUsers.length > 0) ||
                    (post.hashtags && post.hashtags.length > 0)) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {post.taggedUsers && post.taggedUsers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 inline-flex items-center gap-0.5">
                            <AtSign className="w-3 h-3 text-sky-500" />
                            <span>with</span>
                          </span>
                          {post.taggedUsers.map((tagged) => {
                            const fullUser = usersById[tagged.uid] || ({
                              uid: tagged.uid,
                              displayName: tagged.displayName,
                              email: ''
                            } as UserProfile);
                            return (
                              <button
                                key={tagged.uid}
                                type="button"
                                onClick={() => onViewUserProfile?.(fullUser)}
                                className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/60 text-[11px] font-bold cursor-pointer transition-colors"
                              >
                                @{fullUser.displayName || tagged.displayName}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {post.hashtags && post.hashtags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {post.hashtags.slice(0, 6).map((tagKey) => (
                            <button
                              key={tagKey}
                              type="button"
                              onClick={() => handleFilterByHashtag(tagKey)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                                selectedHashtag === tagKey.toLowerCase()
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                              }`}
                            >
                              #{tagKey}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Media Photo, Short Video, or 30s Voice Shout Attachment */}
                  {(post.mediaUrl || (post.videoChunkCount ?? 0) > 0) && (() => {
                    const isAudioPost =
                      post.mediaType === 'audio' ||
                      (post.mediaUrl?.startsWith('data:audio/') ?? false);
                    const isVideoPost =
                      !isAudioPost &&
                      (post.mediaType === 'video' ||
                        (post.mediaUrl?.startsWith('data:video/') ?? false) ||
                        (post.videoChunkCount ?? 0) > 0);

                    if (isAudioPost) {
                      return (
                        <div className="space-y-1.5">
                          <FeedAudioPlayer post={post} />
                          {post.mediaCaption && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 px-1">
                              <RichSocialText
                                text={post.mediaCaption}
                                taggedUsers={post.taggedUsers}
                                usersById={usersById}
                                onHashtagClick={handleFilterByHashtag}
                                onMentionClick={onViewUserProfile}
                              />
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="rounded-xl overflow-hidden bg-slate-950/90 relative group">
                        {isVideoPost ? (
                          <FeedVideoPlayer
                            post={post}
                            onOpenTheatre={(resolvedUrl) =>
                              setVideoTheatreState({
                                postId: post.id,
                                resolvedUrls: resolvedUrl ? { [post.id]: resolvedUrl } : {}
                              })
                            }
                          />
                        ) : (
                          <>
                            <img
                              src={post.mediaUrl}
                              alt={post.mediaCaption || post.title}
                              className="w-full h-auto max-h-96 object-contain cursor-pointer"
                              onClick={() =>
                                setLightboxImage({
                                  url: post.mediaUrl!,
                                  title: post.title,
                                  author: post.authorName,
                                  mediaType: 'image'
                                })
                              }
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImage({
                                    url: post.mediaUrl!,
                                    title: post.title,
                                    author: post.authorName,
                                    mediaType: 'image'
                                  });
                                }}
                                className="pointer-events-auto p-2 bg-white/90 hover:bg-white text-slate-900 rounded-xl shadow-lg transition-transform hover:scale-105"
                                title="View full-screen"
                              >
                                <Maximize2 className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}

                        {isVideoPost && (() => {
                          const postSound = buildSoundFromPost(post, liveAuthor.displayName);
                          return (
                            <div className="bg-slate-900/95 border-t border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-white">
                              <div className="flex items-center gap-2 min-w-0">
                                <Music className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-[11px] font-semibold text-slate-200 truncate">
                                  {postSound.soundTitle}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUseSoundFromPost(post)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                                title="Record or upload a video using this video's sound"
                              >
                                <Music className="w-3 h-3" />
                                <span>Use Sound</span>
                              </button>
                            </div>
                          );
                        })()}

                        {post.mediaCaption && (
                          <div className="bg-slate-950/80 text-white text-[11px] px-3 py-1.5">
                            <RichSocialText
                              text={post.mediaCaption}
                              taggedUsers={post.taggedUsers}
                              usersById={usersById}
                              onHashtagClick={handleFilterByHashtag}
                              onMentionClick={onViewUserProfile}
                              inverted
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Bottom Action Bar: Reactions & Replies (strictly one reaction per user) */}
                  <div className="flex items-center justify-between pt-3 border-t tujuane-divider text-xs">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      {/* Interactive Reactions Button & Popover */}
                      {(() => {
                        const userPostReaction = currentUser ? post.reactions?.[currentUser.uid] : null;
                        const userReactionMeta = REACTION_TYPES.find((r) => r.key === userPostReaction);
                        const isPickerOpen = activeReactionPickerPostId === post.id;

                        return (
                          <div className="relative inline-flex items-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser) {
                                  openAuthModal();
                                  return;
                                }
                                setActiveReactionPickerPostId(isPickerOpen ? null : post.id);
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                                userPostReaction
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : 'tujuane-surface-soft text-slate-600 dark:text-slate-300 hover:opacity-90'
                              }`}
                              title={userPostReaction ? `Your reaction: ${userReactionMeta?.label} (click to change or remove)` : 'Add a reaction'}
                            >
                              <span>{userReactionMeta ? userReactionMeta.emoji : '👍'}</span>
                              <span>{userReactionMeta ? userReactionMeta.label : 'React'}</span>
                            </button>

                            {/* Floating Reaction Bar (Animated) */}
                            {isPickerOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 bottom-full mb-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 flex items-center gap-1 z-40 animate-in fade-in zoom-in-95 max-w-[calc(100vw-2.5rem)] overflow-x-auto scrollbar-none"
                              >
                                {REACTION_TYPES.map((r) => (
                                  <button
                                    key={r.key}
                                    type="button"
                                    onClick={() => handleReactToPost(post, r.key)}
                                    className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-base sm:text-lg rounded-xl hover:scale-125 transition-transform cursor-pointer ${
                                      userPostReaction === r.key
                                        ? 'bg-emerald-100 dark:bg-emerald-900/60 ring-2 ring-emerald-500'
                                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                                    title={`${r.label} - ${userPostReaction === r.key ? 'Click to remove' : 'React'}`}
                                  >
                                    {r.emoji}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Reaction Count Summary Chips */}
                            {post.reactionsCount && (
                              <div className="flex items-center flex-wrap gap-1 ml-1">
                                {Object.entries(post.reactionsCount).map(([rKey, count]) => {
                                  if (!count || count <= 0) return null;
                                  const rMeta = REACTION_TYPES.find((r) => r.key === rKey);
                                  if (!rMeta) return null;
                                  const isMine = userPostReaction === rKey;
                                  return (
                                    <button
                                      key={rKey}
                                      type="button"
                                      onClick={() => handleReactToPost(post, rKey)}
                                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                                        isMine
                                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                          : 'tujuane-surface-soft text-slate-700 dark:text-slate-300 hover:opacity-85'
                                      }`}
                                      title={`${rMeta.label} (${count}) - Click to toggle reaction`}
                                    >
                                      <span>{rMeta.emoji}</span>
                                      <span>{count}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Comments Toggle Button */}
                      <button
                        onClick={() => handleToggleComments(post.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold tujuane-surface-soft text-slate-600 dark:text-slate-300 hover:opacity-90 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span>{post.commentsCount || 0}</span>
                        <span className="hidden sm:inline">Replies</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>
                    </div>

                    {/* Share button */}
                    <button
                      onClick={() => handleSharePost(post)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      title="Share post"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Comments Thread - Clean flat theme-blended thread items */}
                {isExpanded && (
                  <div className="tujuane-surface-soft p-4 sm:p-6 border-t tujuane-divider space-y-4">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Replies ({comments.length})
                    </h3>

                    {/* Comment list - flat, subtle theme-blended divider without bubbles */}
                    <div className="space-y-0 divide-y divide-slate-900/5 dark:divide-white/5">
                      {comments.length === 0 ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                          No replies yet. Be the first to share your thoughts!
                        </div>
                      ) : (
                        comments.map((comment) => {
                          const userCommentReaction = currentUser ? comment.reactions?.[currentUser.uid] : null;
                          const userCommentReactionMeta = REACTION_TYPES.find((r) => r.key === userCommentReaction);
                          const isCommentPickerOpen = activeReactionPickerCommentId === comment.id;
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
                            <div
                              key={comment.id}
                              className="py-3 px-1 space-y-2 transition-colors first:pt-0 last:pb-0"
                            >
                              <div className="flex items-center justify-between gap-2">
                                {/* Comment Author - Click to view profile */}
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
                                  className="flex items-center gap-2 hover:opacity-85 transition-opacity text-left cursor-pointer group"
                                  title={`View ${liveCommentAuthor.displayName}'s citizen profile`}
                                >
                                  {liveCommentAuthor.photoURL ? (
                                    <img
                                      src={liveCommentAuthor.photoURL}
                                      alt={liveCommentAuthor.displayName}
                                      className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-[10px]">
                                      {liveCommentAuthor.displayName.charAt(0)}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                                      {liveCommentAuthor.displayName}
                                    </span>
                                    {comment.replyToAuthorName && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-md font-medium">
                                        <CornerUpLeft className="w-2.5 h-2.5" />
                                        <span>@{comment.replyToAuthorName}</span>
                                      </span>
                                    )}
                                  </div>
                                </button>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {comment.createdAt
                                      ? new Date(comment.createdAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })
                                      : ''}
                                  </span>

                                  {/* Reply to this specific comment */}
                                  {currentUser && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplyingToComment({
                                          commentId: comment.id,
                                          authorName: liveCommentAuthor.displayName,
                                          authorId: comment.authorId
                                        });
                                        setCommentInput(`@${liveCommentAuthor.displayName} `);
                                      }}
                                      className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 hover:underline cursor-pointer flex items-center gap-0.5"
                                      title={`Reply to ${liveCommentAuthor.displayName}`}
                                    >
                                      <CornerUpLeft className="w-3 h-3" />
                                      <span>Reply</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed pl-8">
                                <RichSocialText
                                  text={comment.content}
                                  taggedUsers={comment.taggedUsers}
                                  usersById={usersById}
                                  onHashtagClick={handleFilterByHashtag}
                                  onMentionClick={onViewUserProfile}
                                />
                              </p>

                              {comment.mediaUrl && (
                                <div className="pl-8 pt-1">
                                  <img
                                    src={comment.mediaUrl}
                                    alt="Comment attachment"
                                    className="max-h-48 rounded-lg object-cover cursor-pointer"
                                    onClick={() =>
                                      setLightboxImage({
                                        url: comment.mediaUrl!,
                                        title: 'Reply Photo',
                                        author: comment.authorName
                                      })
                                    }
                                  />
                                </div>
                              )}

                              {/* Comment Reactions Row (strictly one reaction per user) */}
                              <div className="flex items-center gap-1.5 pl-8 pt-1 relative">
                                <div className="relative inline-flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!currentUser) {
                                        openAuthModal();
                                        return;
                                      }
                                      setActiveReactionPickerCommentId(isCommentPickerOpen ? null : comment.id);
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                                      userCommentReaction
                                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                    title="React to comment"
                                  >
                                    <span>{userCommentReactionMeta ? userCommentReactionMeta.emoji : '👍'}</span>
                                    <span>{userCommentReactionMeta ? userCommentReactionMeta.label : 'React'}</span>
                                  </button>

                                  {/* Floating Comment Reaction Picker */}
                                  {isCommentPickerOpen && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute left-0 bottom-full mb-1 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-1 flex items-center gap-1 z-30 animate-in fade-in zoom-in-95 max-w-[calc(100vw-2.5rem)] overflow-x-auto scrollbar-none"
                                    >
                                      {REACTION_TYPES.map((r) => (
                                        <button
                                          key={r.key}
                                          type="button"
                                          onClick={() => handleReactToComment(post.id, comment, r.key)}
                                          className={`w-7 h-7 shrink-0 flex items-center justify-center text-sm rounded-xl hover:scale-125 transition-transform cursor-pointer ${
                                            userCommentReaction === r.key
                                              ? 'bg-emerald-100 dark:bg-emerald-900/60 ring-1 ring-emerald-500'
                                              : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                                          }`}
                                          title={r.label}
                                        >
                                          {r.emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Comment Reaction Tally Chips */}
                                {comment.reactionsCount && (
                                  <div className="flex items-center gap-1">
                                    {Object.entries(comment.reactionsCount).map(([rKey, count]) => {
                                      if (!count || count <= 0) return null;
                                      const rMeta = REACTION_TYPES.find((r) => r.key === rKey);
                                      if (!rMeta) return null;
                                      const isMine = userCommentReaction === rKey;
                                      return (
                                        <button
                                          key={rKey}
                                          type="button"
                                          onClick={() => handleReactToComment(post.id, comment, rKey)}
                                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                                            isMine
                                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                          }`}
                                          title={`${rMeta.label} (${count}) - Click to toggle`}
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
                          );
                        })
                      )}
                    </div>

                    {/* Comment input form */}
                    {currentUser ? (
                      <div className="pt-2 space-y-1.5">
                        {/* Replying-To Banner */}
                        {replyingToComment && (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-300 animate-in fade-in">
                            <div className="flex items-center gap-1.5">
                              <CornerUpLeft className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                              <span>Replying to <strong>@{replyingToComment.authorName}</strong></span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingToComment(null);
                                setCommentInput('');
                              }}
                              className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 p-0.5 rounded cursor-pointer"
                              title="Cancel reply"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-start gap-1.5 sm:gap-2">
                            <input
                              type="text"
                              value={commentInput}
                              onChange={(e) => setCommentInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSubmitComment(post.id);
                                }
                              }}
                              placeholder={
                                replyingToComment
                                  ? `Reply to @${replyingToComment.authorName}...`
                                  : 'Write a reply (#tag or @mention a citizen)...'
                              }
                              className="flex-1 min-w-0 px-3 py-2 text-xs tujuane-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                            />

                            <button
                              type="button"
                              onClick={() => commentFileInputRef.current?.click()}
                              className="p-2 tujuane-surface hover:opacity-90 rounded-xl text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Attach photo to reply"
                            >
                              <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSubmitComment(post.id)}
                              disabled={isSubmittingComment || (!commentInput.trim() && !commentImage)}
                              className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
                              title="Send reply"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>

                          <InlineTagSuggestions
                            compact
                            text={commentInput}
                            users={allDirectoryUsers}
                            currentUserId={currentUser.uid}
                            trendingHashtags={trendingHashtags}
                            onSelectMention={(user, start, end) => {
                              setCommentInput((prev) =>
                                replaceActiveTagRange(prev, start, end, `@${user.displayName}`)
                              );
                              addUniqueTaggedUser(setCommentTaggedUsers, user);
                            }}
                            onSelectHashtag={(tag, start, end) => {
                              setCommentInput((prev) =>
                                replaceActiveTagRange(prev, start, end, `#${tag}`)
                              );
                            }}
                          />
                        </div>

                        {/* Hidden comment file input */}
                        <input
                          type="file"
                          ref={commentFileInputRef}
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const result = await compressImage(file, 800, 0.7);
                              setCommentImage(result.dataUrl);
                            } catch (err) {
                              console.error('Comment image failed:', err);
                            }
                          }}
                        />

                        {/* Comment Image preview */}
                        {commentImage && (
                          <div className="flex items-center gap-2 mt-2 p-1.5 tujuane-surface rounded-lg w-fit">
                            <img src={commentImage} alt="Preview" className="w-8 h-8 rounded object-cover" />
                            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">Photo attached</span>
                            <button
                              onClick={() => setCommentImage(null)}
                              className="text-slate-400 hover:text-rose-500 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center p-3 tujuane-surface rounded-xl text-xs text-slate-600 dark:text-slate-300">
                        <button
                          type="button"
                          onClick={() => openAuthModal('signin')}
                          className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                        >
                          Sign in or register
                        </button>{' '}
                        to reply to this discussion.
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Create Post Modal */}
      {isCreateModalOpen && (
        <div
          onClick={closeCreateModal}
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 my-4 sm:my-8 max-h-[92dvh] overflow-y-auto text-slate-900 dark:text-slate-100 transition-colors"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <Flame className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Create Post</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Share with Kenyans across 47 counties</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    closeCreateModal();
                    setIsTypeSelectorOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
                  title="Switch to another post format or 24h story"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Choose Type</span>
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close dialog (Esc)"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreatePost} className="space-y-4">
              {/* Category Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostCategory('general')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'general'
                        ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500 text-sky-900 dark:text-sky-300 ring-2 ring-sky-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-sky-600" />
                    <span>Chit-Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostCategory('hustle')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'hustle'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 text-emerald-600" />
                    <span>Jobs & Hustle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostCategory('local_news')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'local_news'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-300 ring-2 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Compass className="w-4 h-4 text-amber-600" />
                    <span>Local News</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostCategory('meetup')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'meetup'
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-900 dark:text-purple-300 ring-2 ring-purple-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Users className="w-4 h-4 text-purple-600" />
                    <span>Meetups</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostCategory('campus')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'campus'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-900 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    <span>Campus Life</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostCategory('question')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'question'
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-300 ring-2 ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 text-teal-600" />
                    <span>Questions</span>
                  </button>
                </div>
              </div>

              {/* Title Input (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Title <span className="text-slate-400 dark:text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Leave blank to post caption-only</span>
                </div>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Optional title or headline..."
                  maxLength={150}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Optional Location Tagging */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Tag Location (Optional)</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Untagged by default — post directly or specify your county</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalIncludeLocation}
                      onChange={(e) => setModalIncludeLocation(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {modalIncludeLocation && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 animate-in fade-in">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        County Location
                      </label>
                      <select
                        value={postCounty}
                        onChange={(e) => {
                          setPostCounty(e.target.value);
                          setPostConstituency('');
                        }}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
                      >
                        {ALL_47_COUNTIES.map((c) => (
                          <option key={c} value={c}>
                            {c} County
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Constituency (Optional)
                      </label>
                      <select
                        value={postConstituency}
                        onChange={(e) => setPostConstituency(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
                      >
                        <option value="">Select Constituency</option>
                        {availablePostConstituencies.map((con) => (
                          <option key={con} value={con}>
                            {con}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Highlighted Short Video Picker when opened via Short Video option */}
              {modalHighlightVideo && !compressedImage && !modalShowVideoRecorder && (
                <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/35 border-2 border-dashed border-indigo-300 dark:border-indigo-700 text-center space-y-2.5 animate-in fade-in">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mx-auto">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200">
                      Record or Upload a Feed Video
                    </div>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                      Use your live camera or pick MP4, WebM, MOV · up to 5 min · Full HD 1080p
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModalMediaType('video');
                        setModalShowVoiceRecorder(false);
                        setModalShowVideoRecorder(true);
                      }}
                      disabled={isCompressing}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Record Live Video</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isCompressing}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Video className="w-4 h-4" />
                      <span>{isCompressing ? 'Preparing Video...' : 'Choose Video File'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoundPickerTarget('modal')}
                      disabled={isCompressing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 hover:border-indigo-500 text-indigo-700 dark:text-indigo-300 text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Music className="w-4 h-4" />
                      <span>{modalSound ? 'Change Sound' : 'Pick Posted Sound'}</span>
                    </button>
                  </div>
                  {modalSound && (
                    <div className="pt-2 border-t border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between gap-2 text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-indigo-950 dark:text-indigo-100 truncate">
                            Sound: {modalSound.soundTitle}
                          </div>
                          <div className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">
                            by {modalSound.authorName} · {modalSoundMixMode === 'mix' ? 'Mix + Original' : 'Sound Only'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalSound(null)}
                        className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Solid Background Color Palette for text posts */}
              {!compressedImage && !modalHighlightVideo && !modalShowVoiceRecorder && !modalAudioData && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Solid Background Color:</span>
                    </label>
                    {modalBgColor !== 'default' && (
                      <button
                        type="button"
                        onClick={() => setModalBgColor('default')}
                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
                    {SOLID_POST_BACKGROUNDS.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setModalBgColor(col.id)}
                        title={col.name}
                        className={`w-7 h-7 rounded-full shrink-0 transition-transform cursor-pointer relative flex items-center justify-center border ${
                          modalBgColor === col.id
                            ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 scale-110 border-white dark:border-slate-900 shadow-xs'
                            : 'border-slate-300 dark:border-slate-600 hover:scale-105'
                        } ${col.previewBg}`}
                      >
                        {modalBgColor === col.id && (
                          <Check className={`w-3.5 h-3.5 ${col.id === 'default' ? 'text-slate-900 dark:text-slate-100' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Body */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Caption & Discussion Details {!compressedImage && !modalAudioData && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={4}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder={
                    modalShowVoiceRecorder || modalAudioData
                      ? 'Add an optional text note, #hashtag, or @mention for your 30s voice shout...'
                      : 'Share your thoughts, #hashtags, or @tag citizen profiles...'
                  }
                  maxLength={2000}
                  className={`w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl focus:outline-none resize-none leading-relaxed transition-all ${
                    modalBgColor !== 'default' && !compressedImage && !modalAudioData
                      ? `${SOLID_POST_BACKGROUNDS.find((c) => c.id === modalBgColor)?.bgClass || 'bg-emerald-600 text-white'} text-center font-bold text-sm sm:text-base p-4 placeholder:text-white/70 shadow-inner`
                      : 'bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
                  }`}
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500">
                  <span>Type # for trending tags or @ to tag a citizen profile.</span>
                  <span>{postContent.length}/2000</span>
                </div>

                <InlineTagSuggestions
                  text={postContent}
                  users={allDirectoryUsers}
                  currentUserId={currentUser?.uid}
                  trendingHashtags={trendingHashtags}
                  onSelectMention={(user, start, end) => {
                    setPostContent((prev) =>
                      replaceActiveTagRange(prev, start, end, `@${user.displayName}`)
                    );
                    addUniqueTaggedUser(setModalTaggedUsers, user);
                  }}
                  onSelectHashtag={(tag, start, end) => {
                    setPostContent((prev) =>
                      replaceActiveTagRange(prev, start, end, `#${tag}`)
                    );
                  }}
                />

                <ProfileTagBar
                  taggedUsers={modalTaggedUsers}
                  onAddTaggedUser={(user) => addUniqueTaggedUser(setModalTaggedUsers, user)}
                  onRemoveTaggedUser={(uid) =>
                    setModalTaggedUsers((prev) => prev.filter((t) => t.uid !== uid))
                  }
                  allUsers={allDirectoryUsers}
                  currentUserId={currentUser?.uid}
                  showPicker={showModalTagPicker}
                  onTogglePicker={() => setShowModalTagPicker((prev) => !prev)}
                  trendingHashtags={trendingHashtags}
                  onInsertHashtag={(tag) =>
                    setPostContent((prev) =>
                      prev.trim() ? `${prev.trimEnd()} #${tag} ` : `#${tag} `
                    )
                  }
                />
              </div>

              {/* Media Photo, Short Video, or 30s Voice Shout Attachment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Photo, Full HD Video (up to 5m), or 30s Voice Shout (Optional)
                  </label>
                  {(modalShowVoiceRecorder || modalAudioData || modalShowVideoRecorder) && !isSubmitting && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClearModalAudio();
                        setModalShowVoiceRecorder(false);
                        setModalShowVideoRecorder(false);
                      }}
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Other media
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <input
                  type="file"
                  ref={videoInputRef}
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {modalShowVoiceRecorder || modalAudioData ? (
                  <div className="space-y-2.5">
                    <VoiceShoutRecorder
                      recordedShout={modalAudioData}
                      onRecorded={(shout) => {
                        handleRemoveImage();
                        setModalHighlightVideo(false);
                        setModalMediaType('audio');
                        setModalAudioData(shout);
                        setFormError(null);
                      }}
                      onClear={() => {
                        handleClearModalAudio();
                      }}
                      disabled={isSubmitting}
                    />
                    {modalAudioData && (
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder="Add an optional caption for this voice shout..."
                        maxLength={200}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                      />
                    )}
                  </div>
                ) : modalShowVideoTrimmer && modalUnbakedFileRef.current ? (
                  <VideoTrimmerPanel
                    sourceFile={modalUnbakedFileRef.current}
                    totalDurationSec={modalTrimmerMeta?.duration}
                    maxClipDurationSec={MAX_FEED_VIDEO_DURATION_SEC}
                    initialStartSec={modalTrimRangeRef.current?.startTimeSec ?? 0}
                    initialEndSec={modalTrimRangeRef.current?.endTimeSec}
                    initialPlaybackSpeed={modalPlaybackSpeed}
                    noticeText={modalTrimmerMeta?.notice}
                    onApplyTrim={(startSec, endSec, nextSpeed) => {
                      const file = modalUnbakedFileRef.current;
                      if (file) {
                        void runModalVideoProcessing(file, {
                          startTimeSec: startSec,
                          endTimeSec: endSec
                        }, nextSpeed);
                      }
                    }}
                    onCancel={() => {
                      setModalShowVideoTrimmer(false);
                      setModalTrimmerMeta(null);
                      if (!compressedImage && !isCompressing && modalUnbakedFileRef.current) {
                        handleRemoveImage();
                      }
                    }}
                    disabled={isSubmitting}
                  />
                ) : modalShowVideoRecorder && !compressedImage ? (
                  <ShortVideoCameraRecorder
                    initialSound={modalSound}
                    initialMixMode={modalSoundMixMode}
                    onSoundChange={(sound, mode) => {
                      setModalSound(sound);
                      setModalSoundMixMode(mode);
                    }}
                    onVideoReady={handleModalRecordedVideo}
                    onCancel={() => setModalShowVideoRecorder(false)}
                    onFallbackUploadClick={() => {
                      setModalShowVideoRecorder(false);
                      videoInputRef.current?.click();
                    }}
                    disabled={isSubmitting}
                  />
                ) : !compressedImage ? (
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 text-center bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isCompressing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Upload Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={isCompressing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Video className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Upload Video (1080p)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalShowVoiceRecorder(false);
                          setModalMediaType('video');
                          setModalShowVideoRecorder(true);
                        }}
                        disabled={isCompressing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Record Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalMediaType('video');
                          setSoundPickerTarget('modal');
                        }}
                        disabled={isCompressing}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold shadow-2xs transition-colors cursor-pointer ${
                          modalSound
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>{modalSound ? 'Sound Selected' : 'Use Video Sound'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalHighlightVideo(false);
                          setModalShowVideoRecorder(false);
                          setModalMediaType('audio');
                          setModalShowVoiceRecorder(true);
                        }}
                        disabled={isCompressing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Mic className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Record Voice Shout (30s)</span>
                      </button>
                    </div>
                    {isCompressing && modalTrimProgress !== null ? (
                      <div className="max-w-xs mx-auto space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 gap-2">
                          <span className="truncate">{modalTrimStage}</span>
                          <span className="font-mono tabular-nums shrink-0">{modalTrimProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 transition-all duration-200"
                            style={{ width: `${modalTrimProgress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                          {modalMediaType === 'video' && modalBackgroundUpload && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Tap <strong>Publish in Background</strong> anytime to keep browsing.
                            </p>
                          )}
                          {modalMediaType === 'video' && modalUnbakedFileRef.current && (
                            <button
                              type="button"
                              onClick={() => {
                                modalVideoAbortRef.current?.abort();
                                modalVideoAbortRef.current = null;
                                modalVideoGenerationRef.current += 1;
                                modalVideoPromiseRef.current = null;
                                setIsCompressing(false);
                                setModalTrimProgress(null);
                                setModalShowVideoTrimmer(true);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              <Scissors className="w-3 h-3" />
                              <span>Trim Start/End Instead</span>
                            </button>
                          )}
                        </div>
                        {modalMediaType === 'video' && modalUnbakedFileRef.current && (
                          <div className="pt-1.5 flex items-center justify-center gap-1 flex-wrap">
                            {VIDEO_PLAYBACK_SPEED_OPTIONS.map((spd) => {
                              const active = Math.abs(modalPlaybackSpeed - spd) < 0.01;
                              return (
                                <button
                                  key={spd}
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleModalPlaybackSpeedChange(spd)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                                    active
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {spd}x
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {isCompressing
                          ? 'Auto-compressing media...'
                          : 'Full HD 1080p videos up to 5 min supported · Larger files auto-compress in background'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 max-h-56 flex items-center justify-center">
                      {modalMediaType === 'video' ? (
                        <video
                          ref={modalPreviewVideoRef}
                          src={compressedImage}
                          poster={modalVideoData?.thumbnailDataUrl}
                          controls
                          autoPlay
                          muted
                          loop
                          playsInline
                          onLoadedMetadata={() => {
                            const v = modalPreviewVideoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
                            if (!v) return;
                            const encodedSpeed = modalVideoData?.playbackSpeed || 1;
                            try {
                              v.playbackRate = Math.min(4, Math.max(0.25, modalPlaybackSpeed / encodedSpeed));
                              if ('preservesPitch' in v) v.preservesPitch = true;
                            } catch {
                              // ignore
                            }
                          }}
                          className="max-h-56 w-full object-contain bg-black"
                        />
                      ) : (
                        <img
                          src={compressedImage}
                          alt="Preview"
                          className="max-h-48 w-auto object-contain"
                        />
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                        {modalMediaType === 'video' && modalUnbakedFileRef.current && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalTrimmerMeta((prev) => prev || (videoMeta ? { duration: videoMeta.originalDuration || videoMeta.duration } : null));
                              setModalShowVideoTrimmer(true);
                            }}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black/75 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                            title="Crop start and end of this video"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>Trim</span>
                          </button>
                        )}
                        {modalMediaType === 'video' && (
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveImage();
                              setModalMediaType('video');
                              setModalShowVideoRecorder(true);
                            }}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black/75 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                            title="Re-record video with camera"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Re-record</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          disabled={isSubmitting}
                          className="p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                          title={`Remove ${modalMediaType}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {modalMediaType === 'image' && imageMeta && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                        <span>
                          Compressed: <strong>{formatFileSize(imageMeta.compSize)}</strong> (saved{' '}
                          {Math.round(((imageMeta.origSize - imageMeta.compSize) / imageMeta.origSize) * 100)}
                          %)
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Optimized for 3G/4G</span>
                      </div>
                    )}

                    {modalMediaType === 'video' && videoMeta && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 gap-2 flex-wrap font-mono tabular-nums">
                        <span>
                          Video: <strong>{formatVideoDuration(videoMeta.duration)}</strong>
                          {modalPlaybackSpeed !== 1 ? ` · ${modalPlaybackSpeed}x` : ''} ({formatFileSize(videoMeta.size)}
                          {videoMeta.wasCompressed && videoMeta.originalSize && videoMeta.originalSize > videoMeta.size
                            ? ` · compressed from ${formatFileSize(videoMeta.originalSize)}`
                            : ''}
                          )
                        </span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold font-sans">
                          {isCompressing && modalTrimProgress !== null
                            ? `${modalTrimStage} (${modalTrimProgress}%)`
                            : videoMeta.wasAutoTrimmed
                            ? `✓ Trimmed from ${formatVideoDuration(videoMeta.originalDuration)}`
                            : videoMeta.wasCompressed
                            ? '✓ Auto-compressed'
                            : '✓ Ready for Feed'}
                        </span>
                      </div>
                    )}

                    {modalMediaType === 'video' && modalUnbakedFileRef.current && (
                      <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          <Gauge className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Playback Speed</span>
                        </div>
                        <div className="inline-flex items-center rounded-lg bg-slate-200/80 dark:bg-slate-900 p-0.5 gap-0.5 overflow-x-auto max-w-full">
                          {VIDEO_PLAYBACK_SPEED_OPTIONS.map((spd) => {
                            const active = Math.abs(modalPlaybackSpeed - spd) < 0.01;
                            return (
                              <button
                                key={spd}
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleModalPlaybackSpeedChange(spd)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                                  active
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                                }`}
                              >
                                {spd}x
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {modalMediaType === 'video' && (
                      <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 flex flex-wrap items-center justify-between gap-2">
                        {modalSound ? (
                          <>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200 truncate">
                                  {modalSound.soundTitle}
                                </div>
                                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">
                                  Sound by {modalSound.authorName}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                              {!modalSoundBakedInRecorderRef.current && (
                                <div className="inline-flex rounded-lg bg-white dark:bg-slate-800 p-0.5 text-[10px] font-bold border border-indigo-200 dark:border-indigo-700">
                                  <button
                                    type="button"
                                    disabled={isSubmitting || isCompressing}
                                    onClick={() => applySoundToExistingVideo('modal', modalSound, 'replace')}
                                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                                      modalSoundMixMode === 'replace'
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    Sound Only
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSubmitting || isCompressing}
                                    onClick={() => applySoundToExistingVideo('modal', modalSound, 'mix')}
                                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                                      modalSoundMixMode === 'mix'
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    Mix + Orig
                                  </button>
                                </div>
                              )}
                              <button
                                type="button"
                                disabled={isSubmitting || isCompressing}
                                onClick={() => setSoundPickerTarget('modal')}
                                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-40"
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                disabled={isSubmitting || isCompressing}
                                onClick={() => applySoundToExistingVideo('modal', null, modalSoundMixMode)}
                                className="p-1 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 cursor-pointer disabled:opacity-40"
                                title="Remove sound"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              <span>Use audio from a posted video</span>
                            </div>
                            <button
                              type="button"
                              disabled={isSubmitting || isCompressing}
                              onClick={() => setSoundPickerTarget('modal')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-40"
                            >
                              <Music className="w-3 h-3" />
                              <span>Use Posted Sound</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <input
                      type="text"
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      placeholder={`Add a ${modalMediaType} caption (optional)...`}
                      maxLength={200}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Background Upload Option when Video is attached or compressing */}
              {modalMediaType === 'video' && (modalVideoData || (isCompressing && !!modalVideoFileRef.current)) && (
                <label className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 cursor-pointer">
                  <div className="flex items-center gap-2 min-w-0">
                    <UploadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      Auto-upload in background (close modal & keep browsing)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalBackgroundUpload}
                    onChange={(e) => setModalBackgroundUpload(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
                  />
                </label>
              )}

              {/* Modal Video Upload Progress Bar (when synchronous mode selected) */}
              {isSubmitting && modalUploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                    <span>Uploading short video to feed...</span>
                    <span>{modalUploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${modalUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    modalShowVideoTrimmer ||
                    (isCompressing && !(modalMediaType === 'video' && modalBackgroundUpload && !!modalVideoFileRef.current))
                  }
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>
                        {modalUploadProgress !== null ? `Publishing (${modalUploadProgress}%)` : 'Publishing...'}
                      </span>
                    </>
                  ) : modalMediaType === 'video' && modalBackgroundUpload && (modalVideoData || (isCompressing && !!modalVideoFileRef.current)) ? (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Publish in Background</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        Publish{' '}
                        {modalMediaType === 'audio' && modalAudioData
                          ? 'Voice Shout'
                          : modalMediaType === 'video' && compressedImage
                          ? 'Video'
                          : 'Post'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal (Images & Videos) */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between text-white pb-3 px-2">
              <div className="min-w-0 pr-3">
                <h4 className="font-bold text-sm sm:text-base truncate">{lightboxImage.title}</h4>
                <p className="text-xs text-slate-400">Shared by {lightboxImage.author}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={lightboxImage.url}
                  download={
                    lightboxImage.mediaType === 'video'
                      ? `tujuane-short-video.${lightboxImage.mimeType?.includes('webm') ? 'webm' : 'mp4'}`
                      : 'tujuane-community-photo.png'
                  }
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
                  title={lightboxImage.mediaType === 'video' ? 'Download video' : 'Download original image'}
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setLightboxImage(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {lightboxImage.mediaType === 'video' || lightboxImage.url.startsWith('data:video/') || lightboxImage.url.startsWith('blob:') ? (
              <video
                src={resolvePlayableVideoUrl(lightboxImage.url) || lightboxImage.url}
                controls
                autoPlay
                loop
                playsInline
                preload="auto"
                className="max-h-[80vh] w-full max-w-3xl rounded-xl bg-black shadow-2xl"
              />
            ) : (
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

      {/* Full-Screen Short Video Reels Scroller with Side Interaction Panel */}
      {videoTheatreState && videoPosts.length > 0 && (
        <ShortVideoTheatreModal
          isOpen={!!videoTheatreState}
          videoPosts={videoPosts}
          initialPostId={videoTheatreState.postId}
          initialResolvedUrls={videoTheatreState.resolvedUrls}
          currentUser={currentUser}
          userProfile={userProfile}
          followingIds={followingIds}
          followerIds={followerIds}
          commentsMap={commentsMap}
          onEnsureCommentsLoaded={ensureCommentsLoaded}
          onReactToPost={handleReactToPost}
          onReactToComment={handleReactToComment}
          onSubmitComment={submitCommentForPost}
          onToggleFollow={handleToggleFollow}
          onSharePost={handleSharePost}
          onViewUserProfile={(user) => {
            setVideoTheatreState(null);
            onViewUserProfile?.(user);
          }}
          onOpenDirectChatWithUser={onOpenDirectChatWithUser}
          onOpenAuthModal={(mode) => {
            setVideoTheatreState(null);
            openAuthModal(mode);
          }}
          onUseVideoSound={(post) => {
            setVideoTheatreState(null);
            handleUseSoundFromPost(post);
          }}
          onClose={() => setVideoTheatreState(null)}
        />
      )}

      {/* MODAL 1: IN-APP POST DELETION CONFIRMATION */}
      {postToDelete && (
        <div
          onClick={() => setPostToDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Delete Discussion Post?</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPostToDelete(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong>"{postToDelete.title}"</strong>?
              This will remove the discussion and all its community replies from TUJUANE.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={(e) => {
                  e.stopPropagation();
                  setPostToDelete(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingPost ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Post</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: COMMUNITY SAFETY POLICY VIOLATION MODAL */}
      {blockedSafetyResult && (
        <div
          onClick={() => setBlockedSafetyResult(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200 dark:border-rose-900 animate-in zoom-in-95 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between pb-3 border-b border-rose-100 dark:border-rose-950">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Community Safety Notice
                  </h3>
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    Content Blocked by Safety Filter
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockedSafetyResult(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Violation: {blockedSafetyResult.flagReason}</span>
                </div>
                <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                  Your message or discussion title matched restricted content rules for:{' '}
                  <strong>{blockedSafetyResult.triggeredCategories.join(', ')}</strong>.
                </p>
              </div>

              {blockedSafetyResult.triggeredCategories.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).title}
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).desc}
                  </p>
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 pt-1">
                    Guideline:{' '}
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).advice}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockedSafetyResult(null);
                }}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SUBMIT COMMUNITY SAFETY REPORT */}
      {reportModalPost && (
        <div
          onClick={() => setReportModalPost(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold">
                  <Flag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Report to Safety Moderators</h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Help keep TUJUANE safe for all 47 counties
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReportModalPost(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Reporting: <strong>"{reportModalPost.title}"</strong> by {reportModalPost.authorName}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Safety Report *
                </label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as SafetyCategory)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-900 dark:text-slate-100"
                >
                  <option value="incitement">⚡ Ethnic Hate Speech / Tribal Incitement / Calls to Violence</option>
                  <option value="misleading">⚠️ Misleading Information / M-Pesa Fraud / Fake Job Scam</option>
                  <option value="nudity">🔞 Explicit Sexual Content / Nudity / Pornography</option>
                  <option value="dangerous">🛑 Dangerous Content / Weapons / Threats of Harm</option>
                  <option value="harassment">📢 Harassment / Bullying / Abusive Behavior</option>
                  <option value="spam">📦 Spam / Unsolicited Promotion</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Additional Context (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  maxLength={300}
                  placeholder="Provide any specific details to assist civic safety moderators..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isSubmittingReport}
                onClick={(e) => {
                  e.stopPropagation();
                  setReportModalPost(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingReport}
                onClick={handleSubmitReport}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM BLOCK AUTHOR */}
      {userToBlock && (
        <div
          onClick={() => setUserToBlock(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-rose-200 dark:border-rose-900 animate-in zoom-in-95 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-rose-100 dark:border-rose-950">
              <h3 className="font-bold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Ban className="w-4 h-4" />
                <span>Block @{userToBlock.name}?</span>
              </h3>
              <button
                type="button"
                onClick={() => setUserToBlock(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to block <strong>@{userToBlock.name}</strong>? Their discussions, comments, and messages will no longer appear on your feed or in your inbox.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isBlockingInProgress}
                onClick={() => setUserToBlock(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBlockingInProgress}
                onClick={handleConfirmBlockAuthor}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                {isBlockingInProgress ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Blocking...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Yes, Block Citizen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Type Selector Modal */}
      {isTypeSelectorOpen && (
        <PostTypeSelectorModal
          isOpen={isTypeSelectorOpen}
          onClose={() => setIsTypeSelectorOpen(false)}
          onSelectType={handleSelectPostType}
        />
      )}

      {/* 24h Citizen Story Creator Modal */}
      {isStoryModalOpen && (
        <CreateStoryModal
          isOpen={isStoryModalOpen}
          currentUser={currentUser}
          userProfile={userProfile}
          onClose={() => setIsStoryModalOpen(false)}
          onStoryPublished={(_storyId) => {
            setIsStoryModalOpen(false);
            triggerToast('✓ Story published to Citizen Stories tray!');
          }}
        />
      )}

      {/* Posted Video Sound Picker Modal (for Quick Post or Create Post Modal) */}
      <PostedSoundPickerModal
        isOpen={soundPickerTarget !== null}
        selectedSound={soundPickerTarget === 'quick' ? quickSound : modalSound}
        initialMixMode={soundPickerTarget === 'quick' ? quickSoundMixMode : modalSoundMixMode}
        availableSounds={availablePostedSounds}
        audioSourceLabel={
          (soundPickerTarget === 'quick' && quickShowVideoRecorder) ||
          (soundPickerTarget === 'modal' && modalShowVideoRecorder)
            ? 'Camera Mic'
            : 'Original Video Audio'
        }
        onSelectSound={(sound, mode) => {
          const target = soundPickerTarget;
          if (!target) return;
          void applySoundToExistingVideo(target, sound, mode);
        }}
        onClearSound={() => {
          const target = soundPickerTarget;
          if (!target) return;
          void applySoundToExistingVideo(
            target,
            null,
            target === 'quick' ? quickSoundMixMode : modalSoundMixMode
          );
        }}
        onClose={() => setSoundPickerTarget(null)}
      />
    </div>
  );
};
