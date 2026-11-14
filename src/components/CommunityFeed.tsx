import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  CommunityPost,
  CommunityComment,
  PostCategory,
  CreatePostParams,
  PostBackgroundColor,
  PostMediaType,
  SOLID_POST_BACKGROUNDS,
  REACTION_TYPES,
  ReactionKey
} from '../types/community';
import {
  createCommunityPost,
  subscribeToCommunityPosts,
  toggleUpvotePost,
  addCommunityComment,
  subscribeToPostComments,
  deleteCommunityPost,
  reactToCommunityPost,
  reactToCommunityComment
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
import { compressImage, formatFileSize } from '../utils/imageCompressor';
import {
  processFeedVideoFile,
  formatVideoDuration,
  ProcessedFeedVideo
} from '../utils/videoProcessor';
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
  Mic
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

  // Feed states
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCounty, setSelectedCounty] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDailyPoll, setShowDailyPoll] = useState(false);

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
  const [videoMeta, setVideoMeta] = useState<{ size: number; duration: number } | null>(null);
  const [modalVideoData, setModalVideoData] = useState<ProcessedFeedVideo | null>(null);
  const [modalAudioData, setModalAudioData] = useState<RecordedVoiceShout | null>(null);
  const [modalShowVoiceRecorder, setModalShowVoiceRecorder] = useState(false);
  const [modalUploadProgress, setModalUploadProgress] = useState<number | null>(null);
  const [modalHighlightVideo, setModalHighlightVideo] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalBgColor, setModalBgColor] = useState<PostBackgroundColor>('default');
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);

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
      if (externalCreateRequest.requiresVideo) {
        setTimeout(() => videoInputRef.current?.click(), 180);
      } else if (externalCreateRequest.requiresImage) {
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
  const [quickVideoMeta, setQuickVideoMeta] = useState<{ size: number; duration: number } | null>(null);
  const [quickVideoData, setQuickVideoData] = useState<ProcessedFeedVideo | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickUploadProgress, setQuickUploadProgress] = useState<number | null>(null);
  const [isQuickCompressing, setIsQuickCompressing] = useState(false);
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
  const [quickShowLocation, setQuickShowLocation] = useState(false);
  const [quickCounty, setQuickCounty] = useState('Nairobi');
  const [quickConstituency, setQuickConstituency] = useState('');
  const [quickBgColor, setQuickBgColor] = useState<PostBackgroundColor>('default');
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickVideoInputRef = useRef<HTMLInputElement | null>(null);

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

  // Handle ESC key to close any active dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateModalOpen) setIsCreateModalOpen(false);
        if (postToDelete) setPostToDelete(null);
        if (blockedSafetyResult) setBlockedSafetyResult(null);
        if (reportModalPost) setReportModalPost(null);
        if (lightboxImage) setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, postToDelete, blockedSafetyResult, reportModalPost, lightboxImage]);

  // Set default post county and constituency to user profile if available
  useEffect(() => {
    if (userProfile?.county) {
      setPostCounty(userProfile.county);
    }
    if (userProfile?.constituency) {
      setPostConstituency(userProfile.constituency);
    }
  }, [userProfile]);

  // Subscribe to real-time posts from Firestore with county & constituency filters
  useEffect(() => {
    const unsub = subscribeToCommunityPosts(
      {
        county: selectedCounty === 'All' ? undefined : selectedCounty,
        constituency: selectedConstituency === 'All' ? undefined : selectedConstituency,
        category:
          selectedCategory === 'all' || selectedCategory === 'videos' || selectedCategory === 'audio'
            ? undefined
            : selectedCategory,
        sortBy
      },
      (incomingPosts) => {
        setPosts(incomingPosts);
      }
    );
    return () => unsub();
  }, [selectedCounty, selectedConstituency, selectedCategory, sortBy]);

  // Handle image or short video upload in Create Modal
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideoFile =
      file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

    if (isVideoFile) {
      setIsCompressing(true);
      setFormError(null);
      setModalMediaType('video');
      try {
        const processed = await processFeedVideoFile(file);
        if (modalVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(modalVideoData.previewObjectUrl);
        }
        setModalVideoData(processed);
        setCompressedImage(processed.previewObjectUrl);
        setImageMeta(null);
        setVideoMeta({ size: processed.sizeBytes, duration: processed.duration });
      } catch (err: any) {
        setFormError(err?.message || 'Could not process selected short video.');
      } finally {
        setIsCompressing(false);
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image (JPG, PNG, WebP) or short video (MP4, WebM, MOV) file.');
      return;
    }

    setIsCompressing(true);
    setFormError(null);

    try {
      const result = await compressImage(file, 1200, 0.78);
      if (modalVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(modalVideoData.previewObjectUrl);
      }
      setModalVideoData(null);
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

  const handleRemoveImage = () => {
    if (modalVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(modalVideoData.previewObjectUrl);
    }
    setModalVideoData(null);
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

  // Handle quick post image or short video attachment
  const handleQuickImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideoFile =
      file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

    if (isVideoFile) {
      setIsQuickCompressing(true);
      setQuickError(null);
      setQuickMediaType('video');
      try {
        const processed = await processFeedVideoFile(file);
        if (quickVideoData?.previewObjectUrl) {
          URL.revokeObjectURL(quickVideoData.previewObjectUrl);
        }
        setQuickVideoData(processed);
        setQuickImage(processed.previewObjectUrl);
        setQuickImageMeta(null);
        setQuickVideoMeta({ size: processed.sizeBytes, duration: processed.duration });
      } catch (err: any) {
        const msg = err?.message || 'Could not load short video.';
        setQuickError(msg);
        triggerToast(msg);
      } finally {
        setIsQuickCompressing(false);
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image (JPG, PNG, WebP) or short video (MP4, WebM, MOV).';
      setQuickError(msg);
      triggerToast(msg);
      return;
    }

    setIsQuickCompressing(true);
    setQuickError(null);
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

  const handleRemoveQuickImage = () => {
    if (quickVideoData?.previewObjectUrl) {
      URL.revokeObjectURL(quickVideoData.previewObjectUrl);
    }
    setQuickVideoData(null);
    setQuickImage(null);
    setQuickMediaType('image');
    setQuickImageMeta(null);
    setQuickVideoMeta(null);
    setQuickError(null);
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
    if (quickVideoInputRef.current) quickVideoInputRef.current.value = '';
  };

  // Submit direct quick post (Caption, photo, or short video — no location required!)
  const handleDirectQuickPost = async () => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    const trimmedCaption = quickCaption.trim();
    if (!trimmedCaption && !quickImage && !quickVideoData) {
      setQuickError('Please write a caption or attach a photo / short video.');
      return;
    }

    // Safety pre-scan
    const safetyScan = analyzeContentSafety(trimmedCaption, '');
    if (safetyScan.severity === 'high') {
      setBlockedSafetyResult(safetyScan);
      return;
    }

    setIsQuickSubmitting(true);
    setQuickError(null);
    setQuickUploadProgress(quickVideoData ? 5 : null);
    try {
      const isVideo = quickMediaType === 'video' && (!!quickVideoData || !!quickImage);
      const autoTitle = trimmedCaption
        ? trimmedCaption.slice(0, 75) + (trimmedCaption.length > 75 ? '...' : '')
        : isVideo
        ? 'Citizen Short Video'
        : 'Citizen Photo Update';

      const params: any = {
        title: autoTitle,
        content:
          trimmedCaption ||
          (isVideo ? 'Shared a short video on the feed.' : quickImage ? 'Shared a citizen photo.' : ''),
        category: 'general',
        county: quickShowLocation ? quickCounty : '',
        constituency: quickShowLocation && quickConstituency ? quickConstituency : undefined,
        mediaType: isVideo ? 'video' : quickImage ? 'image' : undefined
      };

      if (isVideo && quickVideoData) {
        params.mediaUrl = quickVideoData.inlineDataUrl || undefined;
        params.videoChunks = quickVideoData.chunks;
        params.videoThumbnail = quickVideoData.thumbnailDataUrl;
        params.videoDuration = quickVideoData.duration;
        params.videoSizeBytes = quickVideoData.sizeBytes;
        params.videoMimeType = quickVideoData.mimeType;
      } else if (quickImage) {
        params.mediaUrl = quickImage;
      }

      if (quickBgColor && quickBgColor !== 'default' && !quickImage && !quickVideoData) {
        params.backgroundColor = quickBgColor;
      }

      if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
        params.isFlagged = true;
        params.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
        params.safetyReason = safetyScan.flagReason;
        params.moderationStatus = 'under_review';
      }

      await createCommunityPost(userProfile, params, (pct) => {
        if (quickVideoData) setQuickUploadProgress(pct);
      });

      if (quickVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(quickVideoData.previewObjectUrl);
      }
      setQuickCaption('');
      setQuickVideoData(null);
      setQuickImage(null);
      setQuickMediaType('image');
      setQuickImageMeta(null);
      setQuickVideoMeta(null);
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
    if (option?.requiresVideo) {
      setModalMediaType('video');
    } else if (option?.requiresAudio) {
      handleRemoveImage();
      setModalMediaType('audio');
    }
    setIsCreateModalOpen(true);

    if (option?.requiresVideo) {
      setTimeout(() => {
        videoInputRef.current?.click();
      }, 180);
    } else if (option?.requiresImage) {
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

    const trimmedContent = postContent.trim();
    if (!trimmedContent && !compressedImage && !modalVideoData && !modalAudioData) {
      setFormError('Please enter caption details or attach a photo, short video, or voice shout.');
      return;
    }

    // Real-time Content Safety Pre-screening
    const safetyScan = analyzeContentSafety(trimmedContent, postTitle.trim());
    if (safetyScan.severity === 'high') {
      setBlockedSafetyResult(safetyScan);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setModalUploadProgress(modalVideoData ? 5 : null);

    const isAudio = modalMediaType === 'audio' && !!modalAudioData;
    const isVideo = !isAudio && modalMediaType === 'video' && (!!modalVideoData || !!compressedImage);

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

    const params: CreatePostParams & Record<string, any> = {
      title: derivedTitle,
      content: safeContent,
      category: postCategory,
      county: modalIncludeLocation ? postCounty : '',
      constituency: modalIncludeLocation && postConstituency ? postConstituency : undefined,
      mediaType: isAudio ? 'audio' : isVideo ? 'video' : compressedImage ? 'image' : undefined,
      mediaCaption: mediaCaption.trim() || undefined
    };

    if (isAudio && modalAudioData) {
      params.mediaUrl = modalAudioData.dataUrl;
      params.audioDuration = modalAudioData.duration;
      params.audioSizeBytes = modalAudioData.sizeBytes;
      params.audioMimeType = modalAudioData.mimeType;
    } else if (isVideo && modalVideoData) {
      params.mediaUrl = modalVideoData.inlineDataUrl || undefined;
      params.videoChunks = modalVideoData.chunks;
      params.videoThumbnail = modalVideoData.thumbnailDataUrl;
      params.videoDuration = modalVideoData.duration;
      params.videoSizeBytes = modalVideoData.sizeBytes;
      params.videoMimeType = modalVideoData.mimeType;
    } else if (compressedImage) {
      params.mediaUrl = compressedImage;
    }

    if (modalBgColor && modalBgColor !== 'default' && !compressedImage && !modalVideoData && !modalAudioData) {
      params.backgroundColor = modalBgColor;
    }

    if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
      params.isFlagged = true;
      params.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
      params.safetyReason = safetyScan.flagReason;
      params.moderationStatus = 'under_review';
    }

    try {
      await createCommunityPost(userProfile, params, (pct) => {
        if (modalVideoData) setModalUploadProgress(pct);
      });
      if (modalVideoData?.previewObjectUrl) {
        URL.revokeObjectURL(modalVideoData.previewObjectUrl);
      }
      if (modalAudioData?.previewObjectUrl) {
        URL.revokeObjectURL(modalAudioData.previewObjectUrl);
      }
      setIsCreateModalOpen(false);
      // Reset form
      setPostTitle('');
      setPostContent('');
      setPostConstituency('');
      setModalVideoData(null);
      setModalAudioData(null);
      setModalShowVoiceRecorder(false);
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
      await addCommunityComment(
        postId,
        userProfile,
        commentText,
        mediaUrl,
        replyTo?.commentId,
        replyTo?.authorName
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
        setCommentInput('');
        setCommentImage(null);
        setReplyingToComment(null);
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

  // Search, Video, Audience and Block filter
  const filteredPosts = posts.filter((post) => {
    // Hide discussions from blocked users
    if (blockedUserIds && blockedUserIds.includes(post.authorId)) {
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
    }
    if (selectedCategory === 'audio') {
      const isAud =
        post.mediaType === 'audio' ||
        (post.mediaUrl?.startsWith('data:audio/') ?? false);
      if (!isAud) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = post.title.toLowerCase().includes(q);
    const contentMatch = post.content.toLowerCase().includes(q);
    const authorMatch = post.authorName.toLowerCase().includes(q);
    const countyMatch = post.county ? post.county.toLowerCase().includes(q) : false;
    return titleMatch || contentMatch || authorMatch || countyMatch;
  });

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
      <div className="tujuane-surface p-4 rounded-2xl space-y-3 transition-colors">
        {/* Audience Toggle: All Kenya vs Following & Friends */}
        <div className="flex items-center justify-between pb-2 border-b tujuane-divider flex-wrap gap-2">
          <div className="inline-flex rounded-xl p-0.5 tujuane-surface-soft text-xs font-semibold">
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
          <div className="flex-1">
            <textarea
              rows={quickBgColor !== 'default' && !quickImage ? 3 : 2}
              value={quickCaption}
              onChange={(e) => setQuickCaption(e.target.value)}
              placeholder={
                currentUser
                  ? quickMediaType === 'video' && quickImage
                    ? 'Add a caption for your short video (optional)...'
                    : "What's on your mind, Citizen? Share a thought, photo, or short video..."
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

        {/* Attached Photo or Short Video Preview */}
        {quickImage && (
          <div className="relative rounded-2xl overflow-hidden bg-slate-950/90 max-h-72 flex items-center justify-center">
            {quickMediaType === 'video' ? (
              <video
                src={quickImage}
                poster={quickVideoData?.thumbnailDataUrl}
                controls
                playsInline
                className="max-h-72 w-full object-contain bg-black"
              />
            ) : (
              <img src={quickImage} alt="Attachment" className="max-h-64 object-contain w-full" />
            )}
            <button
              type="button"
              onClick={handleRemoveQuickImage}
              disabled={isQuickSubmitting}
              className="absolute top-2 right-2 p-1.5 bg-black/65 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer z-10 disabled:opacity-40"
              title={`Remove attached ${quickMediaType}`}
            >
              <X className="w-4 h-4" />
            </button>
            {quickMediaType === 'image' && quickImageMeta && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded-md">
                Compressed to {formatFileSize(quickImageMeta.compSize)}
              </span>
            )}
            {quickMediaType === 'video' && quickVideoMeta && (
              <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 text-white text-[10px] font-semibold rounded-md flex items-center gap-1 backdrop-blur-xs">
                <Video className="w-3 h-3 text-indigo-400" />
                <span>
                  {formatVideoDuration(quickVideoMeta.duration)} · {formatFileSize(quickVideoMeta.size)}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Quick Video Upload Progress Bar */}
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
          <div className="flex items-center gap-1.5 sm:gap-2">
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
              title="Post a short video (MP4, WebM, MOV — up to 60s / 12 MB)"
            >
              <Video className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{isQuickCompressing && quickMediaType === 'video' ? 'Preparing...' : 'Short Video'}</span>
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
                disabled={isQuickSubmitting || isQuickCompressing || (!quickCaption.trim() && !quickImage)}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isQuickSubmitting
                    ? quickUploadProgress !== null
                      ? `Posting (${quickUploadProgress}%)`
                      : 'Posting...'
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
        {filteredPosts.length === 0 ? (
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
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Top: Author, Category Badge, County & Date */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
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
                            {post.title}
                          </h2>
                        )}
                      <p className="text-base sm:text-xl font-bold leading-relaxed whitespace-pre-line drop-shadow-xs">
                        {post.content}
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
                            {post.title}
                          </h2>
                        )}
                      <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                        {post.content}
                      </p>
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
                              {post.mediaCaption}
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

                        {post.mediaCaption && (
                          <div className="bg-slate-950/80 text-white text-[11px] px-3 py-1.5">
                            {post.mediaCaption}
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
                              <div className="flex items-center gap-1 ml-1.5">
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
                                {comment.content}
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

                        <div className="flex items-start gap-2">
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
                                : 'Write a reply to the community...'
                            }
                            className="flex-1 px-3 py-2 text-xs tujuane-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
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
          onClick={() => setIsCreateModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-5 my-8 text-slate-900 dark:text-slate-100 transition-colors"
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
                    setIsCreateModalOpen(false);
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
                  onClick={() => setIsCreateModalOpen(false)}
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
              {modalHighlightVideo && !compressedImage && (
                <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/35 border-2 border-dashed border-indigo-300 dark:border-indigo-700 text-center space-y-2.5 animate-in fade-in">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mx-auto">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200">
                      Select a Short Video for the Feed
                    </div>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                      MP4, WebM, or MOV · up to 60 seconds · max 12 MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isCompressing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>{isCompressing ? 'Preparing Video...' : 'Choose Short Video'}</span>
                  </button>
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
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Caption & Discussion Details {!compressedImage && !modalAudioData && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={4}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder={
                    modalShowVoiceRecorder || modalAudioData
                      ? 'Add an optional text note or context for your 30s voice shout...'
                      : 'Share your thoughts, caption, questions, or opportunities...'
                  }
                  maxLength={2000}
                  className={`w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl focus:outline-none resize-none leading-relaxed transition-all ${
                    modalBgColor !== 'default' && !compressedImage && !modalAudioData
                      ? `${SOLID_POST_BACKGROUNDS.find((c) => c.id === modalBgColor)?.bgClass || 'bg-emerald-600 text-white'} text-center font-bold text-sm sm:text-base p-4 placeholder:text-white/70 shadow-inner`
                      : 'bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
                  }`}
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  <span>Be respectful and adhere to community guidelines.</span>
                  <span>{postContent.length}/2000</span>
                </div>
              </div>

              {/* Media Photo, Short Video, or 30s Voice Shout Attachment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Photo, Short Video, or 30s Voice Shout (Optional)
                  </label>
                  {(modalShowVoiceRecorder || modalAudioData) && !isSubmitting && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClearModalAudio();
                        setModalShowVoiceRecorder(false);
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
                        <span>Upload Short Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalHighlightVideo(false);
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
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {isCompressing
                        ? 'Processing media...'
                        : 'Photos auto-compress · Short videos up to 60s · Voice shouts up to 30s'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 max-h-56 flex items-center justify-center">
                      {modalMediaType === 'video' ? (
                        <video
                          src={compressedImage}
                          poster={modalVideoData?.thumbnailDataUrl}
                          controls
                          playsInline
                          className="max-h-56 w-full object-contain bg-black"
                        />
                      ) : (
                        <img
                          src={compressedImage}
                          alt="Preview"
                          className="max-h-48 w-auto object-contain"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        disabled={isSubmitting}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer z-10 disabled:opacity-40"
                        title={`Remove ${modalMediaType}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
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
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                        <span>
                          Short Video: <strong>{formatVideoDuration(videoMeta.duration)}</strong> ({formatFileSize(videoMeta.size)})
                        </span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">✓ Ready for Feed</span>
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

              {/* Modal Video Upload Progress Bar */}
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
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isCompressing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>
                        {modalUploadProgress !== null ? `Publishing (${modalUploadProgress}%)` : 'Publishing...'}
                      </span>
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
                src={lightboxImage.url}
                controls
                autoPlay
                playsInline
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
    </div>
  );
};
