import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  CommunityPost,
  CommunityComment,
  PostCategory,
  CreatePostParams
} from '../types/community';
import {
  createCommunityPost,
  subscribeToCommunityPosts,
  toggleUpvotePost,
  addCommunityComment,
  subscribeToPostComments,
  deleteCommunityPost
} from '../services/communityService';
import { DailyCommunityPoll } from './DailyCommunityPoll';
import { compressImage, formatFileSize } from '../utils/imageCompressor';
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
  Info
} from 'lucide-react';

interface CommunityFeedProps {
  onOpenDirectChatWithUser?: (authorId: string, authorName: string) => void;
  onViewUserProfile?: (user: UserProfile) => void;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({
  onOpenDirectChatWithUser,
  onViewUserProfile
}) => {
  const { currentUser, userProfile, openAuthModal } = useAuth();

  // Feed states
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCounty, setSelectedCounty] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDailyPoll, setShowDailyPoll] = useState(true);

  // Post creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory>('general');
  const [postCounty, setPostCounty] = useState('Nairobi');
  const [mediaCaption, setMediaCaption] = useState('');
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ origSize: number; compSize: number } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active expanded comments
  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommunityComment[]>>({});
  const [commentInput, setCommentInput] = useState('');
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; author: string } | null>(null);

  // Toast notice
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Direct Quick Post Composer State (Direct caption posting without tagging location)
  const [quickCaption, setQuickCaption] = useState('');
  const [quickImage, setQuickImage] = useState<string | null>(null);
  const [quickImageMeta, setQuickImageMeta] = useState<{ origSize: number; compSize: number } | null>(null);
  const [isQuickCompressing, setIsQuickCompressing] = useState(false);
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
  const [quickShowLocation, setQuickShowLocation] = useState(false);
  const [quickCounty, setQuickCounty] = useState('Nairobi');
  const [quickConstituency, setQuickConstituency] = useState('');
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);

  // Full Modal optional location toggle
  const [modalIncludeLocation, setModalIncludeLocation] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        sortBy
      },
      (incomingPosts) => {
        setPosts(incomingPosts);
      }
    );
    return () => unsub();
  }, [selectedCounty, selectedConstituency, selectedCategory, sortBy]);

  // Handle image upload and compression
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    setIsCompressing(true);
    setFormError(null);

    try {
      const result = await compressImage(file, 1200, 0.78);
      setCompressedImage(result.dataUrl);
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
    setCompressedImage(null);
    setImageMeta(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle quick post image attachment
  const handleQuickImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    setIsQuickCompressing(true);
    try {
      const res = await compressImage(file, 1200, 0.78);
      setQuickImage(res.dataUrl);
      setQuickImageMeta({
        origSize: res.originalSizeBytes,
        compSize: res.compressedSizeBytes
      });
    } catch (err) {
      console.error('Quick image error:', err);
      triggerToast('Could not process image.');
    } finally {
      setIsQuickCompressing(false);
    }
  };

  const handleRemoveQuickImage = () => {
    setQuickImage(null);
    setQuickImageMeta(null);
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
  };

  // Submit direct quick post (Caption only, no location required!)
  const handleDirectQuickPost = async () => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    const trimmedCaption = quickCaption.trim();
    if (!trimmedCaption && !quickImage) {
      triggerToast('Please write a caption or select a photo.');
      return;
    }

    // Safety pre-scan
    const safetyScan = analyzeContentSafety(trimmedCaption, '');
    if (safetyScan.severity === 'high') {
      setBlockedSafetyResult(safetyScan);
      return;
    }

    setIsQuickSubmitting(true);
    try {
      const autoTitle = trimmedCaption
        ? trimmedCaption.slice(0, 75) + (trimmedCaption.length > 75 ? '...' : '')
        : 'Citizen Photo Update';

      const params: any = {
        title: autoTitle,
        content: trimmedCaption || (quickImage ? 'Shared a citizen photo.' : ''),
        category: 'general',
        county: quickShowLocation ? quickCounty : '',
        constituency: quickShowLocation && quickConstituency ? quickConstituency : undefined,
        mediaUrl: quickImage || undefined
      };

      if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
        params.isFlagged = true;
        params.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
        params.safetyReason = safetyScan.flagReason;
        params.moderationStatus = 'under_review';
      }

      await createCommunityPost(userProfile, params);
      setQuickCaption('');
      setQuickImage(null);
      setQuickImageMeta(null);
      setQuickShowLocation(false);
      setQuickConstituency('');
      if (quickFileInputRef.current) quickFileInputRef.current.value = '';
      triggerToast('✓ Post published to TUJUANE Feed!');
    } catch (err: any) {
      console.error('Direct post error:', err);
      triggerToast(err.message || 'Failed to post caption.');
    } finally {
      setIsQuickSubmitting(false);
    }
  };

  // Submit new community post with Safety Filtering (Title and location now fully optional)
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    const trimmedContent = postContent.trim();
    if (!trimmedContent && !compressedImage) {
      setFormError('Please enter caption details or attach an image.');
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

    const derivedTitle = postTitle.trim()
      ? postTitle.trim()
      : trimmedContent.slice(0, 75) + (trimmedContent.length > 75 ? '...' : '') || 'Citizen Update';

    const params: any = {
      title: derivedTitle,
      content: trimmedContent,
      category: postCategory,
      county: modalIncludeLocation ? postCounty : '',
      constituency: modalIncludeLocation && postConstituency ? postConstituency : undefined,
      mediaUrl: compressedImage || undefined,
      mediaCaption: mediaCaption.trim() || undefined
    };

    if (safetyScan.severity === 'medium' || safetyScan.triggeredCategories.length > 0) {
      params.isFlagged = true;
      params.safetyCategory = safetyScan.triggeredCategories[0] || 'misleading';
      params.safetyReason = safetyScan.flagReason;
      params.moderationStatus = 'under_review';
    }

    try {
      await createCommunityPost(userProfile, params);
      setIsCreateModalOpen(false);
      // Reset form
      setPostTitle('');
      setPostContent('');
      setPostConstituency('');
      setCompressedImage(null);
      setImageMeta(null);
      setMediaCaption('');
      setModalIncludeLocation(false);
      triggerToast('✓ Post published to TUJUANE community!');
    } catch (err: any) {
      setFormError(err.message || 'Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle upvote
  const handleUpvote = async (post: CommunityPost) => {
    if (!currentUser) {
      openAuthModal();
      return;
    }

    try {
      const didUpvote = await toggleUpvotePost(post.id, currentUser.uid);
      if (didUpvote && post.authorId && post.authorId !== currentUser.uid) {
        // Send real-time notification to post author
        sendUserNotification({
          userId: post.authorId,
          category: 'post_interaction',
          type: 'post_like',
          title: 'New Like on your Discussion',
          message: `${userProfile?.displayName || 'A citizen'} liked your post "${post.title.slice(0, 45)}"`,
          postId: post.id,
          postTitle: post.title,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName,
          actorPhoto: userProfile?.photoURL,
          actorCounty: userProfile?.county
        });
      }
    } catch (err) {
      console.error('Error toggling upvote:', err);
      triggerToast('Could not record your like. Please check your connection.');
    }
  };

  // Expand / collapse comments
  const handleToggleComments = (postId: string) => {
    if (expandedCommentsPostId === postId) {
      setExpandedCommentsPostId(null);
      return;
    }

    setExpandedCommentsPostId(postId);

    if (!commentsMap[postId]) {
      subscribeToPostComments(postId, (comments) => {
        setCommentsMap((prev) => ({ ...prev, [postId]: comments }));
      });
    }
  };

  // Submit comment with Safety Screening
  const handleSubmitComment = async (postId: string) => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    if (!commentInput.trim() && !commentImage) return;

    // Safety pre-validation on comments
    const commentSafety = analyzeContentSafety(commentInput.trim());
    if (commentSafety.severity === 'high') {
      setBlockedSafetyResult(commentSafety);
      return;
    }

    setIsSubmittingComment(true);
    const commentText = commentInput.trim();
    try {
      await addCommunityComment(postId, userProfile, commentText, commentImage || undefined);
      
      // Notify post author
      const targetPost = posts.find((p) => p.id === postId);
      if (targetPost && targetPost.authorId && targetPost.authorId !== currentUser.uid) {
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
        });
      }

      setCommentInput('');
      setCommentImage(null);
      if (commentFileInputRef.current) commentFileInputRef.current.value = '';
    } catch (err) {
      console.error('Error posting comment:', err);
      triggerToast('Failed to post reply.');
    } finally {
      setIsSubmittingComment(false);
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

  // Search and Audience filter
  const filteredPosts = posts.filter((post) => {
    if (feedAudience === 'following' && !followingIds.includes(post.authorId) && post.authorId !== currentUser?.uid) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = post.title.toLowerCase().includes(q);
    const contentMatch = post.content.toLowerCase().includes(q);
    const authorMatch = post.authorName.toLowerCase().includes(q);
    const countyMatch = post.county ? post.county.toLowerCase().includes(q) : false;
    return titleMatch || contentMatch || authorMatch || countyMatch;
  });

  // Category visual styles helper
  const getCategoryMeta = (cat: PostCategory) => {
    switch (cat) {
      case 'hustle':
        return {
          label: 'Jobs & Hustle',
          icon: Briefcase,
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-500'
        };
      case 'local_news':
        return {
          label: 'Local Happenings',
          icon: Compass,
          bg: 'bg-amber-100 text-amber-900 border-amber-200',
          dot: 'bg-amber-500'
        };
      case 'meetup':
        return {
          label: 'Meetups & Events',
          icon: Users,
          bg: 'bg-purple-100 text-purple-800 border-purple-200',
          dot: 'bg-purple-500'
        };
      case 'campus':
        return {
          label: 'Campus Life',
          icon: GraduationCap,
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          dot: 'bg-indigo-500'
        };
      case 'question':
        return {
          label: 'Questions & Advice',
          icon: HelpCircle,
          bg: 'bg-teal-100 text-teal-800 border-teal-200',
          dot: 'bg-teal-500'
        };
      case 'discussion':
        return {
          label: 'Civic Discussion',
          icon: Sparkles,
          bg: 'bg-cyan-100 text-cyan-800 border-cyan-200',
          dot: 'bg-cyan-500'
        };
      default:
        return {
          label: 'General Chit-Chat',
          icon: MessageSquare,
          bg: 'bg-sky-100 text-sky-800 border-sky-200',
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

      {/* Hero Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-emerald-300 border border-white/10">
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>TUJUANE Citizen Feed · 47 Counties</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Community Stories, Discussions & Hustles
            </h1>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Share neighborhood happenings, post job & hustle opportunities, upload photos,
              and connect with Kenyans across all 47 counties.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {currentUser ? (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Start Discussion</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Statistics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-700/60 text-xs">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px]">Total Discussions</div>
            <div className="text-xl font-bold font-mono text-white mt-0.5">{posts.length}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px]">Hustle & Jobs</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {posts.filter((p) => p.category === 'hustle').length}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px]">Local Happenings</div>
            <div className="text-xl font-bold font-mono text-amber-300 mt-0.5">
              {posts.filter((p) => p.category === 'local_news').length}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px]">Media Photos Shared</div>
            <div className="text-xl font-bold font-mono text-purple-300 mt-0.5">
              {posts.filter((p) => !!p.mediaUrl).length}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Community Poll Interactive Feature */}
      <section aria-label="Daily Community Poll" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span>Today's Featured Citizen Poll</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                Live Voting
              </span>
            </h2>
          </div>
          <button
            onClick={() => setShowDailyPoll(!showDailyPoll)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            <span>{showDailyPoll ? 'Hide Poll' : 'Show Poll'}</span>
            {showDailyPoll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showDailyPoll && (
          <DailyCommunityPoll
            onDiscussInFeed={(topicTitle) => {
              setSearchQuery(topicTitle.slice(0, 25));
              window.scrollTo({ top: 600, behavior: 'smooth' });
            }}
          />
        )}
      </section>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        {/* Audience Toggle: All Kenya vs Following & Friends */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 text-xs font-semibold border border-slate-200">
            <button
              onClick={() => setFeedAudience('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                feedAudience === 'all'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All Kenya (47 Counties)</span>
            </button>
            <button
              onClick={() => setFeedAudience('following')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                feedAudience === 'following'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Following</span>
              {followingIds.length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                  {followingIds.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
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
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Topics
            </button>
            <button
              onClick={() => setSelectedCategory('general')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedCategory === 'general'
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
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
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
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
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
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
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
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
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
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
                  : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Questions</span>
            </button>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 font-medium">Sort:</span>
            <div className="inline-flex rounded-xl p-0.5 bg-slate-100 text-xs font-medium border border-slate-200">
              <button
                onClick={() => setSortBy('latest')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === 'latest' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600'
                }`}
              >
                Latest
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === 'popular' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600'
                }`}
              >
                Most Upvoted
              </button>
            </div>
          </div>
        </div>

        {/* Search bar & County / Constituency dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-slate-100">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations, authors, or topics..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
            />
          </div>

          <div className="sm:col-span-4 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <select
              value={selectedCounty}
              onChange={(e) => {
                setSelectedCounty(e.target.value);
                setSelectedConstituency('All');
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer font-medium"
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
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer font-medium disabled:opacity-50"
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

      {/* DIRECT QUICK POST COMPOSER - Post directly without tagging location, caption only */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
        {/* Hidden file input for quick image */}
        <input
          ref={quickFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleQuickImageFileChange}
          className="hidden"
        />

        <div className="flex items-start gap-3">
          {/* User Avatar */}
          <div className="shrink-0 mt-0.5">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-10 h-10 rounded-2xl object-cover border border-slate-200"
              />
            ) : currentUser ? (
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-sm border border-slate-200">
                {(userProfile?.displayName || currentUser.displayName || 'C').charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Caption Input */}
          <div className="flex-1">
            <textarea
              rows={2}
              value={quickCaption}
              onChange={(e) => setQuickCaption(e.target.value)}
              placeholder={
                currentUser
                  ? "What's on your mind, Citizen? Share a caption, update, or thought (no location required)..."
                  : "Sign in to post quick captions and updates..."
              }
              disabled={!currentUser}
              maxLength={2000}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-900 resize-none leading-relaxed transition-all placeholder:text-slate-400 disabled:opacity-60"
            />
          </div>
        </div>

        {/* Attached Photo Preview (if any) */}
        {quickImage && (
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 max-h-64 flex items-center justify-center">
            <img src={quickImage} alt="Attachment" className="max-h-64 object-contain w-full" />
            <button
              type="button"
              onClick={handleRemoveQuickImage}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors cursor-pointer"
              title="Remove attached photo"
            >
              <X className="w-4 h-4" />
            </button>
            {quickImageMeta && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded-md">
                Compressed to {formatFileSize(quickImageMeta.compSize)}
              </span>
            )}
          </div>
        )}

        {/* Optional Location Selector (Collapsed by default, only shown if toggled) */}
        {quickShowLocation && (
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                <span>Tag Location (Optional)</span>
              </span>
              <button
                type="button"
                onClick={() => setQuickShowLocation(false)}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
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
                className="px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
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
                className="px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
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
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Add Photo Button */}
            <button
              type="button"
              onClick={() => {
                if (!currentUser) openAuthModal();
                else quickFileInputRef.current?.click();
              }}
              disabled={isQuickCompressing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Attach a photo to this caption"
            >
              <ImageIcon className="w-4 h-4 text-emerald-600" />
              <span>{isQuickCompressing ? 'Compressing...' : 'Photo'}</span>
            </button>

            {/* Optional Location Toggle */}
            <button
              type="button"
              onClick={() => setQuickShowLocation(!quickShowLocation)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                quickShowLocation
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
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
                disabled={isQuickSubmitting || (!quickCaption.trim() && !quickImage)}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isQuickSubmitting ? 'Posting...' : 'Direct Post'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Posts Stream */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">No discussions found in this section</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Be the first to start a conversation, share a local update, or post an opportunity for{' '}
              {selectedCounty === 'All' ? 'Kenya' : `${selectedCounty} County`}!
            </p>
            {currentUser && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start Discussion</span>
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

            return (
              <article
                key={post.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
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
                              displayName: post.authorName,
                              email: '',
                              photoURL: post.authorPhotoUrl,
                              county: post.authorCounty || post.county || 'Nairobi',
                              constituency: post.constituency,
                              createdAt: ''
                            });
                          }
                        }}
                        className="cursor-pointer group relative shrink-0"
                        title={`View ${post.authorName}'s Profile`}
                      >
                        {post.authorPhotoUrl ? (
                          <img
                            src={post.authorPhotoUrl}
                            alt={post.authorName}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 group-hover:ring-2 group-hover:ring-emerald-500 transition-all"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm group-hover:bg-emerald-200 transition-colors">
                            {post.authorName.charAt(0).toUpperCase()}
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
                                  displayName: post.authorName,
                                  email: '',
                                  photoURL: post.authorPhotoUrl,
                                  county: post.authorCounty || post.county || 'Nairobi',
                                  constituency: post.constituency,
                                  createdAt: ''
                                });
                              }
                            }}
                            className="font-bold text-sm text-slate-900 truncate hover:text-emerald-700 hover:underline cursor-pointer text-left"
                            title={`View ${post.authorName}'s Profile`}
                          >
                            {post.authorName}
                          </button>

                          {/* Follow / Following / Follow Back button */}
                          {currentUser && !isAuthor && (
                            <button
                              onClick={() =>
                                handleToggleFollow(
                                  post.authorId,
                                  post.authorName,
                                  post.authorCounty,
                                  post.authorPhotoUrl
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                followingIds.includes(post.authorId)
                                  ? 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600 border border-slate-200'
                                  : followerIds.includes(post.authorId)
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                              title={followingIds.includes(post.authorId) ? 'Click to unfollow' : 'Follow this citizen'}
                            >
                              {followingIds.includes(post.authorId) ? (
                                <>
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
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
                              onClick={() => onOpenDirectChatWithUser(post.authorId, post.authorName)}
                              className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                              title={`Start 1-on-1 chat with ${post.authorName}`}
                            >
                              <MessageSquare className="w-3 h-3 text-emerald-600" />
                              <span>Chat</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          {post.county ? (
                            <>
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{post.county}</span>
                              </span>
                              {post.constituency && (
                                <>
                                  <span>·</span>
                                  <span className="text-slate-500">{post.constituency}</span>
                                </>
                              )}
                              <span>·</span>
                            </>
                          ) : null}
                          <span className="text-[11px] text-slate-400">
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${catMeta.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${catMeta.dot}`} />
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{catMeta.label}</span>
                      </span>

                      {/* Community Report Flag Button */}
                      {currentUser && !isAuthor && (
                        <button
                          onClick={() => handleOpenReportModal(post)}
                          className="p-1 text-slate-400 hover:text-amber-600 transition-colors rounded-lg cursor-pointer"
                          title="Report content to community safety moderators"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete Post Button (Author OR Developer) */}
                      {(isAuthor || isDeveloper) && (
                        <button
                          onClick={() => handleOpenDeleteModal(post)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded-lg cursor-pointer"
                          title={isDeveloper && !isAuthor ? 'Developer: Remove post' : 'Delete my post'}
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Safety Advisory Banner if attached by developer/moderators */}
                  {post.safetyAdvisory && (
                    <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl text-xs text-amber-900 flex items-start gap-2 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[11px] uppercase tracking-wider text-amber-800">
                          Community Safety Advisory
                        </div>
                        <p className="mt-0.5 leading-relaxed">{post.safetyAdvisory}</p>
                      </div>
                    </div>
                  )}

                  {/* Under review notice if flagged */}
                  {!post.safetyAdvisory && post.isFlagged && (
                    <div className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 flex items-center gap-1.5 w-fit">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>This discussion is currently under civic safety review.</span>
                    </div>
                  )}

                  {/* Post Content */}
                  <div className="space-y-1.5">
                    {post.title &&
                      post.title !== post.content &&
                      !post.content.startsWith(post.title) &&
                      post.title !== 'Citizen Post' &&
                      post.title !== 'Citizen Photo Update' && (
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                          {post.title}
                        </h2>
                      )}
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                      {post.content}
                    </p>
                  </div>

                  {/* Media Photo Attachment (If present) */}
                  {post.mediaUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative group max-h-96">
                      <img
                        src={post.mediaUrl}
                        alt={post.mediaCaption || post.title}
                        className="w-full h-auto max-h-96 object-contain cursor-pointer"
                        onClick={() =>
                          setLightboxImage({
                            url: post.mediaUrl!,
                            title: post.title,
                            author: post.authorName
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
                              author: post.authorName
                            });
                          }}
                          className="pointer-events-auto p-2 bg-white/90 hover:bg-white text-slate-900 rounded-xl shadow-lg transition-transform hover:scale-105"
                          title="View full-screen"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>

                      {post.mediaCaption && (
                        <div className="bg-slate-900/90 text-white text-[11px] px-3 py-1.5 border-t border-slate-800">
                          {post.mediaCaption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Action Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-4">
                      {/* Upvote Button */}
                      <button
                        onClick={() => handleUpvote(post)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                          hasUpvoted
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${hasUpvoted ? 'fill-rose-500 text-rose-500' : 'text-slate-500'}`}
                        />
                        <span>{post.upvotes || 0}</span>
                        <span className="hidden sm:inline">Likes</span>
                      </button>

                      {/* Comments Toggle Button */}
                      <button
                        onClick={() => handleToggleComments(post.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
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
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({
                            title: post.title,
                            text: `${post.title}: ${post.content} (via TUJUANE)`,
                            url: window.location.href
                          });
                        } else {
                          navigator.clipboard.writeText(
                            `${post.title}: ${post.content} - TUJUANE Community Hub`
                          );
                          triggerToast('Post copied to clipboard!');
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Share post"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Comments Thread */}
                {isExpanded && (
                  <div className="bg-slate-50/70 p-4 sm:p-6 border-t border-slate-100 space-y-4">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                      Replies ({comments.length})
                    </h3>

                    {/* Comment list */}
                    <div className="space-y-3">
                      {comments.length === 0 ? (
                        <div className="text-xs text-slate-500 py-3 text-center">
                          No replies yet. Be the first to share your thoughts!
                        </div>
                      ) : (
                        comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {comment.authorPhotoUrl ? (
                                  <img
                                    src={comment.authorPhotoUrl}
                                    alt={comment.authorName}
                                    className="w-6 h-6 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                                    {comment.authorName.charAt(0)}
                                  </div>
                                )}
                                <span className="font-bold text-xs text-slate-900">
                                  {comment.authorName}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {comment.createdAt
                                  ? new Date(comment.createdAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : ''}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed pl-8">
                              {comment.content}
                            </p>

                            {comment.mediaUrl && (
                              <div className="pl-8 pt-1">
                                <img
                                  src={comment.mediaUrl}
                                  alt="Comment attachment"
                                  className="max-h-48 rounded-lg border border-slate-200 object-cover cursor-pointer"
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
                          </div>
                        ))
                      )}
                    </div>

                    {/* Comment input form */}
                    {currentUser ? (
                      <div className="pt-2">
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
                            placeholder="Write a reply to the community..."
                            className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                          />

                          <button
                            type="button"
                            onClick={() => commentFileInputRef.current?.click()}
                            className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-600 transition-colors cursor-pointer"
                            title="Attach photo to reply"
                          >
                            <ImageIcon className="w-4 h-4" />
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
                          <div className="flex items-center gap-2 mt-2 p-1.5 bg-white rounded-lg border border-slate-200 w-fit">
                            <img src={commentImage} alt="Preview" className="w-8 h-8 rounded object-cover" />
                            <span className="text-[10px] text-slate-600 font-medium">Photo attached</span>
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
                      <div className="text-center p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600">
                        <button
                          type="button"
                          onClick={() => openAuthModal('signin')}
                          className="text-emerald-700 font-bold hover:underline cursor-pointer"
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
            className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Flame className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Start a Discussion</h3>
                  <p className="text-[11px] text-slate-500">Share with the Kenyan community</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close dialog (Esc)"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreatePost} className="space-y-4">
              {/* Category Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostCategory('general')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      postCategory === 'general'
                        ? 'bg-sky-50 border-sky-500 text-sky-900 ring-2 ring-sky-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                        ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                        ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                  <label className="text-xs font-bold text-slate-800">
                    Title <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Leave blank to post caption-only</span>
                </div>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Optional title or headline..."
                  maxLength={150}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              {/* Optional Location Tagging */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Tag Location (Optional)</div>
                      <div className="text-[11px] text-slate-500">Untagged by default — post directly or specify your county</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalIncludeLocation}
                      onChange={(e) => setModalIncludeLocation(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {modalIncludeLocation && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-in fade-in">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        County Location
                      </label>
                      <select
                        value={postCounty}
                        onChange={(e) => {
                          setPostCounty(e.target.value);
                          setPostConstituency('');
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer font-medium"
                      >
                        {ALL_47_COUNTIES.map((c) => (
                          <option key={c} value={c}>
                            {c} County
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Constituency (Optional)
                      </label>
                      <select
                        value={postConstituency}
                        onChange={(e) => setPostConstituency(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer font-medium"
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

              {/* Content Body */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Caption & Discussion Details <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Share your thoughts, caption, questions, or opportunities..."
                  maxLength={2000}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 resize-none"
                  required
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                  <span>Be respectful and adhere to community guidelines.</span>
                  <span>{postContent.length}/2000</span>
                </div>
              </div>

              {/* Media Photo Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Photo / Image Attachment (Optional)
                </label>

                {!compressedImage ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-emerald-50/20"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-1.5" />
                    <p className="text-xs font-semibold text-slate-700">
                      {isCompressing ? 'Compressing image...' : 'Click to upload a photo'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Auto-compressed to under 600KB for rapid loading across Kenya
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 max-h-48 flex items-center justify-center">
                      <img
                        src={compressedImage}
                        alt="Preview"
                        className="max-h-48 w-auto object-contain"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {imageMeta && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                        <span>
                          Compressed: <strong>{formatFileSize(imageMeta.compSize)}</strong> (saved{' '}
                          {Math.round(((imageMeta.origSize - imageMeta.compSize) / imageMeta.origSize) * 100)}
                          %)
                        </span>
                        <span className="text-emerald-600 font-semibold">✓ Optimized for 3G/4G</span>
                      </div>
                    )}

                    <input
                      type="text"
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      placeholder="Add a photo caption (optional)..."
                      maxLength={200}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
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
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Discussion</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between text-white pb-3 px-2">
              <div>
                <h4 className="font-bold text-sm sm:text-base">{lightboxImage.title}</h4>
                <p className="text-xs text-slate-400">Shared by {lightboxImage.author}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={lightboxImage.url}
                  download="tujuane-community-photo.png"
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
                  title="Download original image"
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

            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* MODAL 1: IN-APP POST DELETION CONFIRMATION */}
      {postToDelete && (
        <div
          onClick={() => setPostToDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 text-rose-600 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Delete Discussion Post?</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPostToDelete(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
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
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
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
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Community Safety Notice
                  </h3>
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
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
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Violation: {blockedSafetyResult.flagReason}</span>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Your message or discussion title matched restricted content rules for:{' '}
                  <strong>{blockedSafetyResult.triggeredCategories.join(', ')}</strong>.
                </p>
              </div>

              {blockedSafetyResult.triggeredCategories.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div className="font-bold text-slate-900">
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).title}
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).desc}
                  </p>
                  <div className="text-[11px] font-semibold text-emerald-800 pt-1">
                    Guideline:{' '}
                    {getSafetyExplanation(blockedSafetyResult.triggeredCategories[0]).advice}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockedSafetyResult(null);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
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
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Flag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Report to Safety Moderators</h3>
                  <span className="text-[10px] text-slate-500">
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
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Reporting: <strong>"{reportModalPost.title}"</strong> by {reportModalPost.authorName}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Safety Report *
                </label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as SafetyCategory)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Additional Context (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  maxLength={300}
                  placeholder="Provide any specific details to assist civic safety moderators..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingReport}
                onClick={(e) => {
                  e.stopPropagation();
                  setReportModalPost(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
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
    </div>
  );
};
