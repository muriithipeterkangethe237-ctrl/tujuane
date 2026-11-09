import React, { useState, useEffect, useRef } from 'react';
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
  AlertTriangle
} from 'lucide-react';
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
import { ReportModal } from './ReportModal';

interface UserProfileModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onStartDirectChat: (targetUser: UserProfile) => void;
  onSelectPost?: (postId: string) => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

// Preset citizen avatar suggestions
const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=250&auto=format&fit=crop&q=80'
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onStartDirectChat,
  onSelectPost,
  onProfileUpdated
}) => {
  const {
    currentUser,
    userProfile,
    updateFullProfile,
    blockedUserIds,
    mutedUserIds,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser
  } = useAuth();
  const isOwnProfile = currentUser?.uid === user.uid;
  const currentTargetUser = isOwnProfile && userProfile ? userProfile : user;
  const [localUser, setLocalUser] = useState<UserProfile>(currentTargetUser);

  useEffect(() => {
    const fresh = isOwnProfile && userProfile ? userProfile : user;
    setLocalUser(fresh);
  }, [user, userProfile, isOwnProfile]);

  // Social states
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [followersList, setFollowersList] = useState<FollowRelationship[]>([]);
  const [allFriendRequests, setAllFriendRequests] = useState<FriendRequest[]>([]);
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Edit Mode state (only for own profile)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentTargetUser.displayName || '');
  const [editPhotoURL, setEditPhotoURL] = useState<string>(currentTargetUser.photoURL || '');
  const [editCounty, setEditCounty] = useState(currentTargetUser.county || 'Nairobi');
  const [editConstituency, setEditConstituency] = useState(currentTargetUser.constituency || '');
  const [editBio, setEditBio] = useState(currentTargetUser.bio || '');
  const [editOccupation, setEditOccupation] = useState(currentTargetUser.occupation || '');
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

  // Sync edit form with localUser changes only when switching users or entering edit mode
  useEffect(() => {
    if (isOpen) {
      setEditName(localUser.displayName || '');
      setEditPhotoURL(localUser.photoURL || '');
      setEditCounty(localUser.county || 'Nairobi');
      setEditConstituency(localUser.constituency || '');
      setEditBio(localUser.bio || '');
      setEditOccupation(localUser.occupation || '');
      setPhotoError(null);
    }
  }, [isOpen, localUser.uid]);

  // Available constituencies for selected county
  const availableConstituencies = getConstituenciesByCounty(editCounty);

  // Subscribe to social data for target user / current user
  useEffect(() => {
    if (!currentUser) return;

    const unsubFollowing = subscribeToFollowing(currentUser.uid, (data) => {
      setFollowingList(data);
    });

    const unsubFollowers = subscribeToFollowers(user.uid, (data) => {
      setFollowersList(data);
    });

    const unsubRequests = subscribeToAllUserFriendRequests(currentUser.uid, (data) => {
      setAllFriendRequests(data);
    });

    return () => {
      unsubFollowing();
      unsubFollowers();
      unsubRequests();
    };
  }, [currentUser, user.uid]);

  // Load recent posts by this author
  useEffect(() => {
    const unsub = subscribeToCommunityPosts({}, (posts) => {
      const authored = posts.filter((p) => p.authorId === user.uid);
      setUserPosts(authored);
      setIsLoadingPosts(false);
    });

    return () => unsub();
  }, [user.uid]);

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

  // Save full profile edits
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnProfile) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const finalName = editName.trim() || localUser.displayName;
      const finalPhoto = editPhotoURL;
      const finalCounty = editCounty;
      const finalConstituency = editConstituency;
      const finalBio = editBio.trim();
      const finalOccupation = editOccupation.trim();

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
        bio: finalBio || undefined,
        occupation: finalOccupation || undefined
      };

      setLocalUser(updatedUser);
      onProfileUpdated?.(updatedUser);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
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

        {/* Top Header Banner with Kenyan Gradient Theme */}
        <div className="h-32 sm:h-36 bg-gradient-to-r from-emerald-800 via-slate-900 to-emerald-950 relative p-4 flex items-start justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-semibold text-emerald-300 border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Verified Citizen of Kenya</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareProfile}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
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
              className="p-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full transition-colors cursor-pointer"
              title="Close modal (Esc)"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Avatar & Main Identity Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-16 sm:-mt-20">
            <div className="flex items-end gap-3.5">
              <div className="relative shrink-0 group">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt={localUser.displayName}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border-4 border-white dark:border-slate-850 shadow-md bg-white dark:bg-slate-900"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-extrabold flex items-center justify-center text-3xl border-4 border-white dark:border-slate-850 shadow-md">
                    {localUser.displayName.charAt(0).toUpperCase()}
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
                    className="absolute -bottom-1 -right-1 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl border-2 border-white dark:border-slate-800 shadow-md transition-transform group-hover:scale-105 cursor-pointer"
                    title="Change Profile Picture"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}

                {!isOwnProfile && (
                  livePresence.isOnline ? (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800 ring-2 ring-emerald-400/50 animate-pulse"
                      title="Active online now"
                    />
                  ) : (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-slate-400 rounded-full border-2 border-white dark:border-slate-800"
                      title={livePresence.lastSeenText}
                    />
                  )
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {isEditing ? editName || 'Citizen Member' : localUser.displayName}
                  </h2>
                  {isOwnProfile && (
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                      You
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>
                    {(isEditing ? editConstituency : localUser.constituency) ? `${isEditing ? editConstituency : localUser.constituency}, ` : ''}
                    {(isEditing ? editCounty : localUser.county) || 'National'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action or Edit Toggle */}
            <div className="flex items-center gap-2">
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

          {/* Social Stats Strip */}
          <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-center">
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                {userPosts.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Discussions</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                {followersList.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Followers</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                {localUser.county || 'All Kenya'}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">Home Base</div>
            </div>
          </div>

          {/* VIEW MODE: About & Details Display (When NOT Editing) */}
          {!isEditing && (
            <div className="space-y-5">
              {/* About Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      About Me
                    </span>
                  </div>
                  {isOwnProfile && !localUser.bio && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      + Add About Info
                    </button>
                  )}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 space-y-2.5">
                  {localUser.bio ? (
                    <p className="leading-relaxed font-normal whitespace-pre-line text-slate-800 dark:text-slate-200">
                      {localUser.bio}
                    </p>
                  ) : (
                    <p className="text-slate-400 italic">
                      {isOwnProfile
                        ? 'You haven\'t added an About section yet. Tell fellow citizens about your background, hustles, or community interests!'
                        : 'No about description provided yet.'}
                    </p>
                  )}

                  {localUser.occupation && (
                    <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-300 font-bold">
                      <Briefcase className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{localUser.occupation}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Citizen Details Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Joined TUJUANE</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {localUser.createdAt ? new Date(localUser.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' }) : 'Verified Member'}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Presence</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate text-xs sm:text-sm">
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
              </div>

              {/* Non-own profile: Social Interaction Bar (Follow & Friend) & Safety Controls */}
              {!isOwnProfile && currentUser && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Follow Button */}
                    <button
                      onClick={handleToggleFollow}
                      disabled={isActionPending}
                      className={`inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isFollowing
                          ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-700'
                          : isFollower
                          ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      } disabled:opacity-50 shadow-2xs`}
                    >
                      {isFollowing ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
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
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-50 text-emerald-800 hover:bg-rose-50 hover:text-rose-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Friends ✓</span>
                      </button>
                    ) : friendshipStatus === 'pending_sent' ? (
                      <button
                        onClick={handleRemoveFriend}
                        disabled={isActionPending}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-50 text-amber-800 hover:bg-rose-50 hover:text-rose-700 border border-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
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
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add Friend</span>
                      </button>
                    )}
                  </div>

                  {/* Citizen Safety & Moderation Controls (Block, Mute, Report) */}
                  <div className="pt-1 pb-1 space-y-2">
                    {isBlocked && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                        <Ban className="w-4 h-4 text-rose-600 shrink-0" />
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
                            ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={isMuted ? 'Unmute notifications from this citizen' : 'Silence notifications from this citizen'}
                      >
                        {isMuted ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-amber-600" />
                            <span>Muted (Click to Unmute)</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-slate-500" />
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
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl font-bold transition-all cursor-pointer text-[11px]"
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
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Recent Discussions by {localUser.displayName.split(' ')[0]} ({userPosts.length})</span>
                  </div>
                </div>

                {isLoadingPosts ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading discussions...</div>
                ) : userPosts.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
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
                        className="p-3 bg-slate-50 hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-200 transition-all cursor-pointer space-y-1"
                      >
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {post.title}
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2">
                          {post.content}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
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
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                  required
                />
              </div>

              {/* 3. About / Bio */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    About / Bio
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {editBio.length} / 500
                  </span>
                </div>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Share a short bio about yourself, your hustles, your community passions, or what you care about in your constituency..."
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white resize-none leading-relaxed"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  This description will appear on your public citizen card and discussions.
                </p>
              </div>

              {/* 4. Occupation / Hustle */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Occupation / Hustle / Community Role</label>
                <input
                  type="text"
                  value={editOccupation}
                  onChange={(e) => setEditOccupation(e.target.value)}
                  placeholder="e.g. Software Hustler, Dairy Farmer, Student, Youth Representative"
                  maxLength={80}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                />
              </div>

              {/* 5. County & Constituency Representation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Home County</label>
                  <select
                    value={editCounty}
                    onChange={(e) => {
                      setEditCounty(e.target.value);
                      setEditConstituency('');
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white cursor-pointer"
                  >
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c} County
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Constituency (Optional)</label>
                  <select
                    value={editConstituency}
                    onChange={(e) => setEditConstituency(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="">Select Constituency</option>
                    {availableConstituencies.map((con) => (
                      <option key={con} value={con}>
                        {con}
                      </option>
                    ))}
                  </select>
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
