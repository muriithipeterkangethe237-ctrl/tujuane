import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  MapPin,
  Calendar,
  MessageSquare,
  UserCheck,
  UserPlus,
  Heart,
  Share2,
  Edit3,
  ShieldCheck,
  Check,
  Clock,
  Sparkles,
  FileText,
  Briefcase,
  Camera,
  Upload,
  Trash2,
  User,
  Info,
  Ban,
  VolumeX,
  Volume2,
  Flag,
  AlertTriangle,
  Mail,
  Building2,
  Compass,
  CheckCircle2,
  Users
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types/chat';
import { CommunityPost } from '../types/community';
import { FollowRelationship, FriendRequest } from '../types/social';
import { isUserOnline, formatLastSeen, subscribeToUserPresence } from '../services/chatService';
import {
  followUser,
  unfollowUser,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendshipOrRequest,
  subscribeToFollowing,
  subscribeToFollowers,
  subscribeToAllUserFriendRequests
} from '../services/socialService';
import { subscribeToCommunityPosts } from '../services/communityService';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../data/kenyaCounties';
import { compressImage } from '../utils/imageCompressor';
import { PRESET_AVATARS, getProfileCompleteness } from '../utils/profileUtils';
import {
  computeUserAchievementBadges,
  deriveFeedMetricsFromPosts,
  UserActivityMetrics
} from '../utils/achievementBadges';
import { fetchUserCommunityActivityMetrics } from '../services/activityMetricsService';
import { AchievementBadgesSection } from './AchievementBadgesSection';
import { ReportModal } from './ReportModal';

interface UserProfileModalProps {
  user: UserProfile;
  isOpen: boolean;
  initialEditMode?: boolean;
  onClose: () => void;
  onStartDirectChat: (targetUser: UserProfile) => void;
  onSelectPost?: (postId: string) => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  initialEditMode = false,
  onClose,
  onStartDirectChat,
  onSelectPost,
  onProfileUpdated
}) => {
  const {
    currentUser,
    userProfile,
    usersById,
    updateFullProfile,
    blockedUserIds,
    mutedUserIds,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser
  } = useAuth();
  const isOwnProfile = currentUser?.uid === user.uid;
  const cachedDirectoryUser = usersById?.[user.uid];
  const currentTargetUser = isOwnProfile && userProfile ? userProfile : (cachedDirectoryUser || user);
  const [localUser, setLocalUser] = useState<UserProfile>(currentTargetUser);

  // Subscribe directly to Firestore users/{uid} so all profile details (bio, occupation, constituency, email, joined) stay live
  useEffect(() => {
    if (!isOpen || !user?.uid) return;
    const base = isOwnProfile && userProfile ? userProfile : (usersById?.[user.uid] || user);
    setLocalUser(base);

    const userDocRef = doc(db, 'users', user.uid);
    const unsubDoc = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setLocalUser((prev) => ({
          ...prev,
          uid: user.uid,
          displayName: data.displayName || prev.displayName || 'Citizen Member',
          email: data.email || prev.email || '',
          photoURL: data.photoURL !== undefined ? (String(data.photoURL).trim() ? data.photoURL : undefined) : prev.photoURL,
          county: data.county || prev.county || 'Nairobi',
          constituency: data.constituency !== undefined ? (data.constituency || undefined) : prev.constituency,
          bio: data.bio !== undefined ? (data.bio || undefined) : prev.bio,
          occupation: data.occupation !== undefined ? (data.occupation || undefined) : prev.occupation,
          isOnline: data.isOnline !== undefined ? Boolean(data.isOnline) : prev.isOnline,
          lastSeen: data.lastSeen?.toDate
            ? data.lastSeen.toDate().toISOString()
            : typeof data.lastSeen === 'string'
            ? data.lastSeen
            : prev.lastSeen,
          isDeveloper: data.isDeveloper !== undefined ? Boolean(data.isDeveloper) : prev.isDeveloper,
          accountStatus: (data.accountStatus as 'active' | 'suspended' | 'banned') || prev.accountStatus || 'active',
          pollVotesCount: typeof data.pollVotesCount === 'number' ? data.pollVotesCount : prev.pollVotesCount,
          feedCommentsCount: typeof data.feedCommentsCount === 'number' ? data.feedCommentsCount : prev.feedCommentsCount,
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : typeof data.createdAt === 'string' && data.createdAt
            ? data.createdAt
            : prev.createdAt
        }));
      },
      () => {
        // ignore offline/guest permission notice
      }
    );

    return () => unsubDoc();
  }, [isOpen, user?.uid, isOwnProfile, userProfile]);

  // Social states
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [targetFollowingList, setTargetFollowingList] = useState<FollowRelationship[]>([]);
  const [followersList, setFollowersList] = useState<FollowRelationship[]>([]);
  const [allFriendRequests, setAllFriendRequests] = useState<FriendRequest[]>([]);
  const [allFeedPosts, setAllFeedPosts] = useState<CommunityPost[]>([]);
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);
  const [remoteActivityMetrics, setRemoteActivityMetrics] = useState<UserActivityMetrics | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Edit Mode state (only for own profile)
  const [isEditing, setIsEditing] = useState(isOwnProfile && initialEditMode);
  const [editName, setEditName] = useState(currentTargetUser.displayName || '');
  const [editPhotoURL, setEditPhotoURL] = useState<string>(currentTargetUser.photoURL || '');
  const [editCounty, setEditCounty] = useState(currentTargetUser.county || 'Nairobi');
  const [editConstituency, setEditConstituency] = useState(currentTargetUser.constituency || '');
  const [editBio, setEditBio] = useState(currentTargetUser.bio || '');
  const [editOccupation, setEditOccupation] = useState(currentTargetUser.occupation || '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Moderation & safety states
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isSafetyActionPending, setIsSafetyActionPending] = useState(false);
  const isBlocked = blockedUserIds.includes(localUser.uid);
  const isMuted = mutedUserIds.includes(localUser.uid);

  // Real-time live presence tracking
  const [livePresence, setLivePresence] = useState<{
    isOnline: boolean;
    lastSeen?: string;
    lastSeenText: string;
  }>({
    isOnline: isUserOnline(localUser.isOnline, localUser.lastSeen),
    lastSeen: localUser.lastSeen,
    lastSeenText: formatLastSeen(localUser.lastSeen, isUserOnline(localUser.isOnline, localUser.lastSeen))
  });

  useEffect(() => {
    if (!isOpen || !localUser?.uid) return;
    setLivePresence({
      isOnline: isUserOnline(localUser.isOnline, localUser.lastSeen),
      lastSeen: localUser.lastSeen,
      lastSeenText: formatLastSeen(localUser.lastSeen, isUserOnline(localUser.isOnline, localUser.lastSeen))
    });
    const unsub = subscribeToUserPresence(localUser.uid, (presence) => {
      setLivePresence(presence);
    });
    return () => unsub();
  }, [isOpen, localUser?.uid, localUser.isOnline, localUser.lastSeen]);

  // Social action progress
  const [isActionPending, setIsActionPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize edit mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsEditing(isOwnProfile && initialEditMode);
      setFieldErrors({});
      setSaveError(null);
      setSaveSuccess(false);
    }
  }, [isOpen, user.uid, isOwnProfile, initialEditMode]);

  // Keep edit form fields synchronized with localUser while not actively editing
  useEffect(() => {
    if (isOpen && !isEditing) {
      setEditName(localUser.displayName || '');
      setEditPhotoURL(localUser.photoURL || '');
      setEditCounty(localUser.county || 'Nairobi');
      setEditConstituency(localUser.constituency || '');
      setEditBio(localUser.bio || '');
      setEditOccupation(localUser.occupation || '');
      setPhotoError(null);
    }
  }, [isOpen, isEditing, localUser]);

  // Available constituencies for selected county
  const availableConstituencies = getConstituenciesByCounty(editCounty);
  const completeness = getProfileCompleteness(localUser);

  // Subscribe to social data for target user / current user
  useEffect(() => {
    if (!currentUser) return;

    const unsubFollowing = subscribeToFollowing(currentUser.uid, (data) => {
      setFollowingList(data);
    });

    const unsubTargetFollowing =
      user.uid === currentUser.uid
        ? () => {}
        : subscribeToFollowing(user.uid, (data) => {
            setTargetFollowingList(data);
          });

    const unsubFollowers = subscribeToFollowers(user.uid, (data) => {
      setFollowersList(data);
    });

    const unsubRequests = subscribeToAllUserFriendRequests(currentUser.uid, (data) => {
      setAllFriendRequests(data);
    });

    return () => {
      unsubFollowing();
      unsubTargetFollowing();
      unsubFollowers();
      unsubRequests();
    };
  }, [currentUser, user.uid]);

  // Load CommunityFeed posts and derive live author posts + feed activity
  useEffect(() => {
    const unsub = subscribeToCommunityPosts({}, (posts) => {
      setAllFeedPosts(posts);
      const authored = posts.filter((p) => p.authorId === user.uid);
      setUserPosts(authored);
      setIsLoadingPosts(false);
    });

    return () => unsub();
  }, [user.uid]);

  // Fetch deeper CommunityFeed comments, polls, and stories metrics when modal opens
  useEffect(() => {
    if (!isOpen || !user?.uid) return;
    let isCancelled = false;
    setRemoteActivityMetrics(null);

    void fetchUserCommunityActivityMetrics(
      user.uid,
      allFeedPosts,
      localUser,
      followersList.length,
      { isOwnProfile }
    ).then((metrics) => {
      if (!isCancelled) {
        setRemoteActivityMetrics(metrics);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, user?.uid, allFeedPosts.length, followersList.length, isOwnProfile]);

  const effectiveActivityMetrics = useMemo<UserActivityMetrics>(() => {
    const syncMetrics = deriveFeedMetricsFromPosts(
      user.uid,
      allFeedPosts,
      localUser,
      followersList.length
    );
    if (!remoteActivityMetrics) return syncMetrics;
    return {
      ...syncMetrics,
      storiesCount: remoteActivityMetrics.storiesCount,
      pollsCreatedCount: remoteActivityMetrics.pollsCreatedCount,
      pollVotesCount: Math.max(syncMetrics.pollVotesCount, remoteActivityMetrics.pollVotesCount),
      commentsAuthored: Math.max(syncMetrics.commentsAuthored, remoteActivityMetrics.commentsAuthored),
      isLoadingRemote: false
    };
  }, [user.uid, allFeedPosts, localUser, followersList.length, remoteActivityMetrics]);

  const achievementBadges = useMemo(
    () => computeUserAchievementBadges(localUser, effectiveActivityMetrics),
    [localUser, effectiveActivityMetrics]
  );

  // Handle ESC key to close modal reliably
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDeveloperUser = localUser?.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com' || localUser?.isDeveloper;
  const isViewingSelfDeveloper = currentUser?.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com';

  if (isDeveloperUser && !isViewingSelfDeveloper) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs animate-fade-in"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 text-center space-y-3 shadow-2xl border border-slate-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800 flex items-center justify-center mx-auto text-purple-700 dark:text-purple-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Protected System Profile</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            This account is reserved for system platform maintenance and administration, and is shielded from public citizen interactions.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Social status helpers
  const isFollowing = followingList.some((f) => f.followingId === user.uid);
  const isFollower = followersList.some((f) => f.followerId === currentUser?.uid);

  const friendReq = allFriendRequests.find(
    (r) =>
      (r.senderId === currentUser?.uid && r.receiverId === user.uid) ||
      (r.senderId === user.uid && r.receiverId === currentUser?.uid)
  );

  const friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' =
    !friendReq
      ? 'none'
      : friendReq.status === 'accepted'
      ? 'friends'
      : friendReq.senderId === currentUser?.uid
      ? 'pending_sent'
      : 'pending_received';

  // Toggle follow
  const handleToggleFollow = async () => {
    if (!currentUser || !userProfile) return;
    setIsActionPending(true);
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.uid, user.uid);
      } else {
        await followUser(userProfile, user);
      }
    } finally {
      setIsActionPending(false);
    }
  };

  // Friend actions
  const handleSendFriend = async () => {
    if (!currentUser || !userProfile) return;
    setIsActionPending(true);
    try {
      await sendFriendRequest(userProfile, user);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!friendReq) return;
    setIsActionPending(true);
    try {
      await acceptFriendRequest(friendReq.id);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!friendReq) return;
    setIsActionPending(true);
    try {
      await removeFriendshipOrRequest(friendReq.id);
    } finally {
      setIsActionPending(false);
    }
  };

  // Copy Profile Link
  const handleShareProfile = () => {
    const profileUrl = window.location.href;
    navigator.clipboard.writeText(`${user.displayName}'s Citizen Profile on TUJUANE: ${profileUrl}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Photo upload handling with compression
  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError(null);
    setIsCompressingPhoto(true);
    try {
      const res = await compressImage(file, 400, 0.82);
      setEditPhotoURL(res.dataUrl);
    } catch (err: any) {
      console.error('Photo upload compression error:', err);
      setPhotoError(err?.message || 'Failed to process selected picture. Please choose a JPG or PNG.');
    } finally {
      setIsCompressingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Block / Unblock citizen
  const handleToggleBlock = async () => {
    if (!currentUser || isOwnProfile) return;
    setIsSafetyActionPending(true);
    try {
      if (isBlocked) {
        await unblockUser(user.uid);
      } else {
        await blockUser(user.uid);
      }
    } finally {
      setIsSafetyActionPending(false);
    }
  };

  // Mute / Unmute citizen
  const handleToggleMute = async () => {
    if (!currentUser || isOwnProfile) return;
    setIsSafetyActionPending(true);
    try {
      if (isMuted) {
        await unmuteUser(user.uid);
      } else {
        await muteUser(user.uid);
      }
    } finally {
      setIsSafetyActionPending(false);
    }
  };

  // Validate and save full profile edits with enforced required fields
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnProfile) return;

    const finalName = editName.trim();
    const finalPhoto = editPhotoURL;
    const finalCounty = editCounty.trim();
    const finalConstituency = editConstituency.trim();
    const finalBio = editBio.trim();
    const finalOccupation = editOccupation.trim();

    const errors: Record<string, string> = {};
    if (finalName.length < 2) {
      errors.displayName = 'Enter your full name or citizen handle (at least 2 characters).';
    }
    if (!finalCounty) {
      errors.county = 'Please select your home county.';
    }
    if (availableConstituencies.length > 0 && !finalConstituency) {
      errors.constituency = `Please select your constituency in ${finalCounty}.`;
    }
    if (finalBio.length < 10) {
      errors.bio = 'Please write a short About / Bio (at least 10 characters) so citizens know who you are.';
    }
    if (finalOccupation.length < 2) {
      errors.occupation = 'Please enter your occupation, hustle, or community role.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError('Please complete all required citizen profile fields highlighted below.');
      return;
    }

    setFieldErrors({});
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateFullProfile({
        displayName: finalName,
        photoURL: finalPhoto,
        county: finalCounty,
        constituency: finalConstituency,
        bio: finalBio,
        occupation: finalOccupation
      });

      // Instantly update local state in modal
      const updatedUser: UserProfile = {
        ...localUser,
        displayName: finalName,
        photoURL: finalPhoto ? finalPhoto : undefined,
        county: finalCounty,
        constituency: finalConstituency || undefined,
        bio: finalBio,
        occupation: finalOccupation,
        profileCompleted: true
      };

      setLocalUser(updatedUser);
      onProfileUpdated?.(updatedUser);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
      setIsEditing(false);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setSaveError(err?.message || 'Failed to update profile. Please check your network and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const activePhoto = isEditing ? editPhotoURL : localUser.photoURL;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-6 relative flex flex-col max-h-[92vh] transition-colors"
      >
        {/* Hidden File Input for Profile Photo Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoFileChange}
          className="hidden"
        />

        {/* Pinned Top-Right Modal Controls */}
        <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-2">
          <button
            onClick={handleShareProfile}
            className="p-2 bg-slate-950/45 hover:bg-slate-950/70 backdrop-blur-md text-white rounded-full border border-white/15 transition-colors cursor-pointer shadow-sm"
            title="Share citizen profile"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 bg-slate-950/45 hover:bg-slate-950/70 active:bg-slate-950/85 backdrop-blur-md text-white rounded-full border border-white/15 transition-colors cursor-pointer shadow-sm"
            title="Close modal (Esc)"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Banner + Content Body (prevents negative-margin avatar/name clipping) */}
        <div className="overflow-y-auto flex-1">
          {/* Top Header Banner with Kenyan Gradient Theme */}
          <div className="h-28 sm:h-32 bg-gradient-to-r from-emerald-800 via-slate-900 to-emerald-950 relative p-4 pr-24 flex items-start">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-semibold text-emerald-300 border border-white/10">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified Citizen of Kenya</span>
            </div>
          </div>

          <div className="px-5 sm:px-6 pb-6 space-y-5">
            {/* Avatar & Primary Action Row */}
            <div className="flex items-end justify-between gap-3 -mt-11 sm:-mt-12 relative z-10">
              <div className="relative shrink-0 group">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt={localUser.displayName || 'Citizen Member'}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border-4 border-white dark:border-slate-900 shadow-lg bg-white dark:bg-slate-900"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 font-extrabold flex items-center justify-center text-3xl border-4 border-white dark:border-slate-900 shadow-lg">
                    {(localUser.displayName || 'C').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Edit Camera Overlay button for own profile */}
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isEditing) setIsEditing(true);
                      fileInputRef.current?.click();
                    }}
                    className="absolute -bottom-1 -right-1 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl border-2 border-white dark:border-slate-900 shadow-md transition-transform group-hover:scale-105 cursor-pointer"
                    title="Change Profile Picture"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}

                {!isOwnProfile && (
                  livePresence.isOnline ? (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 ring-2 ring-emerald-400/50 animate-pulse"
                      title="Active online now"
                    />
                  ) : (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-slate-400 rounded-full border-2 border-white dark:border-slate-900"
                      title={livePresence.lastSeenText}
                    />
                  )
                )}
              </div>

              {/* Quick Action or Edit Toggle */}
              <div className="flex items-center gap-2 pt-12 sm:pt-14 shrink-0">
                {isOwnProfile ? (
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-bold text-xs rounded-xl transition-all cursor-pointer border shadow-2xs ${
                      isEditing
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onStartDirectChat(localUser);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Direct Message</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dedicated Full-Width Citizen Name & Headline Identity */}
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl sm:text-[26px] font-black text-slate-950 dark:text-white tracking-tight leading-snug break-words">
                  {isEditing ? editName.trim() || 'Citizen Member' : localUser.displayName || 'Citizen Member'}
                </h2>
                {isOwnProfile && (
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    You
                  </span>
                )}
                {!isOwnProfile && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      livePresence.isOnline
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        livePresence.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span>{livePresence.isOnline ? 'Online' : livePresence.lastSeenText}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs text-slate-600 dark:text-slate-400 font-medium">
                <div className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>
                    {(isEditing ? editConstituency : localUser.constituency)
                      ? `${isEditing ? editConstituency : localUser.constituency}, `
                      : ''}
                    {(isEditing ? editCounty : localUser.county) || 'National'} County
                  </span>
                </div>

                {(isEditing ? editOccupation : localUser.occupation) && (
                  <div className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>{isEditing ? editOccupation : localUser.occupation}</span>
                  </div>
                )}
              </div>
            </div>

          {/* Social Stats Strip */}
          <div className="grid grid-cols-4 gap-2 py-3 px-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-center">
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tabular-nums">
                {userPosts.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Posts</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tabular-nums">
                {followersList.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Followers</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tabular-nums">
                {isOwnProfile ? followingList.length : targetFollowingList.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Following</div>
            </div>
            <div>
              <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate pt-0.5">
                {localUser.county || 'Kenya'}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">County</div>
            </div>
          </div>

          {/* Save Success Feedback Banner in View Mode */}
          {saveSuccess && !isEditing && (
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 text-xs font-bold rounded-2xl flex items-center gap-2 border border-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Profile saved & synced across your posts, stories, chats, and directory!</span>
            </div>
          )}

          {/* Profile Completion Enforcement Card on Own Profile */}
          {isOwnProfile && !isEditing && !completeness.isComplete && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Complete Your Citizen Profile ({completeness.percentage}%)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  Complete Now
                </button>
              </div>
              <div className="w-full h-2 bg-amber-200/70 dark:bg-amber-900/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-600 dark:bg-amber-400 transition-all duration-300"
                  style={{ width: `${completeness.percentage}%` }}
                />
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Missing required details:{' '}
                <span className="font-bold">
                  {completeness.missingRequired.map((f) => f.label).join(', ')}
                </span>
              </p>
            </div>
          )}

          {/* VIEW MODE: All Profile Details Clearly Visible */}
          {!isEditing && (
            <div className="space-y-5">
              {/* Visual Achievement Badges (CommunityFeed, Polls, Stories & Verified Residency) */}
              <AchievementBadgesSection
                badges={achievementBadges}
                metrics={effectiveActivityMetrics}
                isOwnProfile={isOwnProfile}
              />

              {/* About Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      About / Bio
                    </span>
                  </div>
                  {isOwnProfile && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      {localUser.bio ? 'Edit Bio' : '+ Add About Info'}
                    </button>
                  )}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 space-y-2.5">
                  {localUser.bio ? (
                    <p className="leading-relaxed font-normal whitespace-pre-line text-slate-800 dark:text-slate-200">
                      {localUser.bio}
                    </p>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 italic">
                      {isOwnProfile
                        ? 'Your About / Bio is not filled yet. Click "Edit Profile" to introduce yourself across all 47 counties.'
                        : 'No bio provided yet.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Complete Structured Citizen Details Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>All Profile Details</span>
                  </span>
                  {isOwnProfile && (
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {completeness.percentage}% Complete
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                  {/* Display Name */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Full Name</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {localUser.displayName || 'Not set'}
                      </div>
                    </div>
                  </div>

                  {/* Occupation / Role */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <Briefcase className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Occupation / Role</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {localUser.occupation ? (
                          localUser.occupation
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {isOwnProfile ? 'Required — Tap Edit' : 'Not specified'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Home County */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Home County</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {localUser.county ? `${localUser.county} County` : 'Not set'}
                      </div>
                    </div>
                  </div>

                  {/* Constituency */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Constituency</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {localUser.constituency ? (
                          localUser.constituency
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {isOwnProfile ? 'Required — Tap Edit' : 'Not specified'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Joined Date */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Joined TUJUANE</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {localUser.createdAt
                          ? new Date(localUser.createdAt).toLocaleDateString([], {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })
                          : 'Verified Member'}
                      </div>
                    </div>
                  </div>

                  {/* Presence */}
                  <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Presence</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate text-xs">
                        {livePresence.isOnline ? (
                          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_6px_#10b981]" />
                            Online Now
                          </span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400 font-medium">
                            {livePresence.lastSeenText}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Own Account Email & Standing */}
                  {isOwnProfile && (
                    <div className="sm:col-span-2 p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Account Email</div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {localUser.email || currentUser?.email || 'Authenticated Citizen'}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 capitalize">
                        {localUser.accountStatus || 'active'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Non-own profile: Social Interaction Bar (Follow & Friend) & Safety Controls */}
              {!isOwnProfile && currentUser && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Follow Button */}
                    <button
                      onClick={handleToggleFollow}
                      disabled={isActionPending}
                      className={`inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isFollowing
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700'
                          : isFollower
                          ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      } disabled:opacity-50 shadow-2xs`}
                    >
                      {isFollowing ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Following</span>
                        </>
                      ) : isFollower ? (
                        <>
                          <Heart className="w-3.5 h-3.5" />
                          <span>Follow Back</span>
                        </>
                      ) : (
                        <>
                          <Heart className="w-3.5 h-3.5" />
                          <span>Follow Citizen</span>
                        </>
                      )}
                    </button>

                    {/* Friend Request Button */}
                    {friendshipStatus === 'friends' ? (
                      <button
                        onClick={handleRemoveFriend}
                        disabled={isActionPending}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Friends ✓</span>
                      </button>
                    ) : friendshipStatus === 'pending_sent' ? (
                      <button
                        onClick={handleRemoveFriend}
                        disabled={isActionPending}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Request Sent</span>
                      </button>
                    ) : friendshipStatus === 'pending_received' ? (
                      <button
                        onClick={handleAcceptFriend}
                        disabled={isActionPending}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-all cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Friend Request</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleSendFriend}
                        disabled={isActionPending}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 hover:text-emerald-800 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add Friend</span>
                      </button>
                    )}
                  </div>

                  {/* Citizen Safety & Moderation Controls (Block, Mute, Report) */}
                  <div className="pt-1 pb-1 space-y-2">
                    {isBlocked && (
                      <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                        <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="font-medium">
                          You have blocked this citizen. Their direct messages and posts are hidden from your feed.
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-1">
                      {/* Mute/Unmute */}
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        disabled={isSafetyActionPending}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border text-[11px] ${
                          isMuted
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                        title={isMuted ? 'Unmute notifications from this citizen' : 'Silence notifications from this citizen'}
                      >
                        {isMuted ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Muted (Click to Unmute)</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Mute Citizen</span>
                          </>
                        )}
                      </button>

                      {/* Block/Unblock */}
                      <button
                        type="button"
                        onClick={handleToggleBlock}
                        disabled={isSafetyActionPending}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border text-[11px] ${
                          isBlocked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                        }`}
                        title={isBlocked ? 'Unblock this citizen' : 'Block this citizen from contacting you'}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{isBlocked ? 'Unblock Account' : 'Block Account'}</span>
                      </button>

                      {/* Report */}
                      <button
                        type="button"
                        onClick={() => setIsReportOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 hover:text-rose-700 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 rounded-xl font-bold transition-all cursor-pointer text-[11px]"
                        title="Report this citizen account to civic moderators"
                      >
                        <Flag className="w-3.5 h-3.5 text-rose-500" />
                        <span>Report Account</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Authored Community Posts */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>Recent Discussions by {localUser.displayName.split(' ')[0]} ({userPosts.length})</span>
                  </div>
                </div>

                {isLoadingPosts ? (
                  <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Loading discussions...</div>
                ) : userPosts.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-center text-xs text-slate-500 dark:text-slate-400">
                    No community discussions posted yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userPosts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        onClick={() => {
                          if (onSelectPost) onSelectPost(post.id);
                          onClose();
                        }}
                        className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl border border-slate-200 dark:border-slate-700/60 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all cursor-pointer space-y-1"
                      >
                        <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {post.title}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                          {post.content}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                          <span>{post.county ? `${post.county} County` : 'Kenya'}</span>
                          <span>·</span>
                          <span>{new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EDIT MODE: Profile Picture, About & Personal Details (When isEditing === true) */}
          {isEditing && isOwnProfile && (
            <form onSubmit={handleSaveProfile} className="space-y-5 pt-1">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <p>
                  Customize your citizen profile. Upload a custom profile picture and write an About bio to introduce yourself to Kenyans across all 47 counties!
                </p>
              </div>

              {/* 1. Profile Picture Editor */}
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Profile Picture</span>
                  {isCompressingPhoto && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                      Processing photo...
                    </span>
                  )}
                </label>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative shrink-0">
                    {editPhotoURL ? (
                      <img
                        src={editPhotoURL}
                        alt="Preview"
                        className="w-18 h-18 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm"
                      />
                    ) : (
                      <div className="w-18 h-18 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-2xl border-2 border-slate-200 dark:border-slate-700">
                        {editName.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isCompressingPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Photo</span>
                      </button>

                      {editPhotoURL && (
                        <button
                          type="button"
                          onClick={() => setEditPhotoURL('')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 hover:border-rose-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Supports JPG, PNG or WebP. Auto-compressed for rapid loading.
                    </p>
                  </div>
                </div>

                {/* Preset Avatars Bar */}
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                    Or pick a preset avatar:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {PRESET_AVATARS.map((url, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setEditPhotoURL(url)}
                        className={`w-9 h-9 rounded-xl overflow-hidden shrink-0 border-2 transition-transform hover:scale-105 cursor-pointer ${
                          editPhotoURL === url ? 'border-emerald-600 ring-2 ring-emerald-300 dark:ring-emerald-600' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {photoError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{photoError}</p>
                )}
              </div>

              {/* 2. Display Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Display Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (fieldErrors.displayName) setFieldErrors((p) => ({ ...p, displayName: '' }));
                  }}
                  maxLength={60}
                  className={`w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white ${
                    fieldErrors.displayName ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                  required
                />
                {fieldErrors.displayName && (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.displayName}</p>
                )}
              </div>

              {/* 3. About / Bio */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    About / Bio *
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {editBio.length} / 500
                  </span>
                </div>
                <textarea
                  value={editBio}
                  onChange={(e) => {
                    setEditBio(e.target.value);
                    if (fieldErrors.bio) setFieldErrors((p) => ({ ...p, bio: '' }));
                  }}
                  rows={4}
                  maxLength={500}
                  placeholder="Share a short bio about yourself, your hustles, your community passions, or what you care about in your constituency (min 10 characters)..."
                  className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white resize-none leading-relaxed ${
                    fieldErrors.bio ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                  required
                />
                {fieldErrors.bio ? (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.bio}</p>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    This description immediately updates on your public citizen card, feed posts, and chats.
                  </p>
                )}
              </div>

              {/* 4. Occupation / Hustle */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Occupation / Hustle / Community Role *</label>
                <input
                  type="text"
                  value={editOccupation}
                  onChange={(e) => {
                    setEditOccupation(e.target.value);
                    if (fieldErrors.occupation) setFieldErrors((p) => ({ ...p, occupation: '' }));
                  }}
                  placeholder="e.g. Software Hustler, Dairy Farmer, Student, Youth Representative"
                  maxLength={80}
                  className={`w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white ${
                    fieldErrors.occupation ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                  required
                />
                {fieldErrors.occupation && (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.occupation}</p>
                )}
              </div>

              {/* 5. County & Constituency Representation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Home County *</label>
                  <select
                    value={editCounty}
                    onChange={(e) => {
                      setEditCounty(e.target.value);
                      setEditConstituency('');
                      if (fieldErrors.county) setFieldErrors((p) => ({ ...p, county: '' }));
                    }}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white cursor-pointer ${
                      fieldErrors.county ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c} County
                      </option>
                    ))}
                  </select>
                  {fieldErrors.county && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.county}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Constituency {availableConstituencies.length > 0 ? '*' : ''}
                  </label>
                  <select
                    value={editConstituency}
                    onChange={(e) => {
                      setEditConstituency(e.target.value);
                      if (fieldErrors.constituency) setFieldErrors((p) => ({ ...p, constituency: '' }));
                    }}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white cursor-pointer ${
                      fieldErrors.constituency ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
                    }`}
                    required={availableConstituencies.length > 0}
                  >
                    <option value="">Select Constituency</option>
                    {availableConstituencies.map((con) => (
                      <option key={con} value={con}>
                        {con}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.constituency && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.constituency}</p>
                  )}
                </div>
              </div>

              {saveSuccess && (
                <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2 border border-emerald-300 dark:border-emerald-800">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Profile updated successfully!</span>
                </div>
              )}

              {saveError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-medium rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Could not save profile changes</p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">{saveError}</p>
                  </div>
                </div>
              )}

              {/* Submit Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setSaveError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isCompressingPhoto}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}
          </div>
        </div>

        {/* Modal Footer with Explicit Functional Close Button */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-850/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 dark:text-slate-500 text-[11px]">
            Verified TUJUANE Citizen Profile
          </span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setSaveError(null);
                }}
                className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="px-4 py-1.5 bg-slate-800 dark:bg-emerald-600 hover:bg-slate-900 dark:hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              title="Close profile dialog"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Reusable Report Modal for reporting citizen account */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        target={{
          type: 'user',
          authorId: user.uid,
          authorName: user.displayName,
          snippet: user.bio || `Citizen representing ${user.county || 'Kenya'}`
        }}
      />
    </div>
  );
};
