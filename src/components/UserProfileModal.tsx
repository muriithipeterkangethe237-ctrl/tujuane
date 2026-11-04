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
  Info
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

interface UserProfileModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onStartDirectChat: (targetUser: UserProfile) => void;
  onSelectPost?: (postId: string) => void;
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
  onSelectPost
}) => {
  const { currentUser, userProfile, updateFullProfile } = useAuth();
  const isOwnProfile = currentUser?.uid === user.uid;

  // Social states
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [followersList, setFollowersList] = useState<FollowRelationship[]>([]);
  const [allFriendRequests, setAllFriendRequests] = useState<FriendRequest[]>([]);
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Edit Mode state (only for own profile)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.displayName || '');
  const [editPhotoURL, setEditPhotoURL] = useState<string>(user.photoURL || '');
  const [editCounty, setEditCounty] = useState(user.county || 'Nairobi');
  const [editConstituency, setEditConstituency] = useState(user.constituency || '');
  const [editBio, setEditBio] = useState(user.bio || '');
  const [editOccupation, setEditOccupation] = useState(user.occupation || '');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Real-time live presence tracking
  const [livePresence, setLivePresence] = useState<{
    isOnline: boolean;
    lastSeen?: string;
    lastSeenText: string;
  }>({
    isOnline: isUserOnline(user.isOnline, user.lastSeen),
    lastSeen: user.lastSeen,
    lastSeenText: formatLastSeen(user.lastSeen, isUserOnline(user.isOnline, user.lastSeen))
  });

  useEffect(() => {
    if (!isOpen || !user?.uid) return;
    setLivePresence({
      isOnline: isUserOnline(user.isOnline, user.lastSeen),
      lastSeen: user.lastSeen,
      lastSeenText: formatLastSeen(user.lastSeen, isUserOnline(user.isOnline, user.lastSeen))
    });
    const unsub = subscribeToUserPresence(user.uid, (presence) => {
      setLivePresence(presence);
    });
    return () => unsub();
  }, [isOpen, user?.uid, user.isOnline, user.lastSeen]);

  // Social action progress
  const [isActionPending, setIsActionPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync edit form with user changes
  useEffect(() => {
    setEditName(user.displayName || '');
    setEditPhotoURL(user.photoURL || '');
    setEditCounty(user.county || 'Nairobi');
    setEditConstituency(user.constituency || '');
    setEditBio(user.bio || '');
    setEditOccupation(user.occupation || '');
    setPhotoError(null);
  }, [user]);

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

  // Save full profile edits
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnProfile) return;
    setIsSaving(true);
    try {
      await updateFullProfile({
        displayName: editName.trim() || user.displayName,
        photoURL: editPhotoURL,
        county: editCounty,
        constituency: editConstituency,
        bio: editBio.trim(),
        occupation: editOccupation.trim()
      });
      // also update user in parent viewing state
      user.displayName = editName.trim() || user.displayName;
      user.photoURL = editPhotoURL;
      user.county = editCounty;
      user.constituency = editConstituency;
      user.bio = editBio.trim();
      user.occupation = editOccupation.trim();

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const activePhoto = isEditing ? editPhotoURL : user.photoURL;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 relative flex flex-col max-h-[92vh]"
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
                    alt={user.displayName}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border-4 border-white shadow-md bg-white"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-3xl border-4 border-white shadow-md">
                    {user.displayName.charAt(0).toUpperCase()}
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
                    className="absolute -bottom-1 -right-1 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl border-2 border-white shadow-md transition-transform group-hover:scale-105 cursor-pointer"
                    title="Change Profile Picture"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}

                {!isOwnProfile && (
                  livePresence.isOnline ? (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white ring-2 ring-emerald-400/50 animate-pulse"
                      title="Active online now"
                    />
                  ) : (
                    <span
                      className="absolute bottom-1 right-1 w-4 h-4 bg-slate-400 rounded-full border-2 border-white"
                      title={livePresence.lastSeenText}
                    />
                  )
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {isEditing ? editName || 'Citizen Member' : user.displayName}
                  </h2>
                  {isOwnProfile && (
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                      You
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>
                    {(isEditing ? editConstituency : user.constituency) ? `${isEditing ? editConstituency : user.constituency}, ` : ''}
                    {(isEditing ? editCounty : user.county) || 'National'}
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
                      ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    onStartDirectChat(user);
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
          <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900">
                {userPosts.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">Discussions</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900">
                {followersList.length}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">Followers</div>
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-slate-900">
                {user.county || 'All Kenya'}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 truncate">Home Base</div>
            </div>
          </div>

          {/* VIEW MODE: About & Details Display (When NOT Editing) */}
          {!isEditing && (
            <div className="space-y-5">
              {/* About Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      About Me
                    </span>
                  </div>
                  {isOwnProfile && !user.bio && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                    >
                      + Add About Info
                    </button>
                  )}
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-2.5">
                  {user.bio ? (
                    <p className="leading-relaxed font-normal whitespace-pre-line text-slate-800">
                      {user.bio}
                    </p>
                  ) : (
                    <p className="text-slate-400 italic">
                      {isOwnProfile
                        ? 'You haven\'t added an About section yet. Tell fellow citizens about your background, hustles, or community interests!'
                        : 'No about description provided yet.'}
                    </p>
                  )}

                  {user.occupation && (
                    <div className="pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-emerald-800 font-bold">
                      <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{user.occupation}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Citizen Details Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Joined TUJUANE</div>
                    <div className="font-bold text-slate-800">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' }) : 'Verified Member'}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Presence</div>
                    <div className="font-bold text-slate-800 truncate text-xs sm:text-sm">
                      {livePresence.isOnline ? (
                        <span className="text-emerald-700 flex items-center gap-1 font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_6px_#10b981]" />
                          Online Now
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium">
                          {livePresence.lastSeenText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Non-own profile: Social Interaction Bar (Follow & Friend) */}
              {!isOwnProfile && currentUser && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
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
              )}

              {/* Authored Community Posts */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Recent Discussions by {user.displayName.split(' ')[0]} ({userPosts.length})</span>
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
              <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Profile Picture</span>
                  {isCompressingPhoto && (
                    <span className="text-[11px] text-emerald-600 font-semibold animate-pulse">
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
                      <div className="w-18 h-18 rounded-2xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-2xl border-2 border-slate-200">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-slate-300 hover:border-rose-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Supports JPG, PNG or WebP. Auto-compressed for rapid loading.
                    </p>
                  </div>
                </div>

                {/* Preset Avatars Bar */}
                <div className="pt-2 border-t border-slate-200/70">
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                    Or pick a preset avatar:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {PRESET_AVATARS.map((url, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setEditPhotoURL(url)}
                        className={`w-9 h-9 rounded-xl overflow-hidden shrink-0 border-2 transition-transform hover:scale-105 cursor-pointer ${
                          editPhotoURL === url ? 'border-emerald-600 ring-2 ring-emerald-300' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {photoError && (
                  <p className="text-xs text-rose-600 font-semibold">{photoError}</p>
                )}
              </div>

              {/* 2. Display Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Display Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  required
                />
              </div>

              {/* 3. About / Bio */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
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
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 resize-none leading-relaxed"
                />
                <p className="text-[11px] text-slate-500">
                  This description will appear on your public citizen card and discussions.
                </p>
              </div>

              {/* 4. Occupation / Hustle */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Occupation / Hustle / Community Role</label>
                <input
                  type="text"
                  value={editOccupation}
                  onChange={(e) => setEditOccupation(e.target.value)}
                  placeholder="e.g. Software Hustler, Dairy Farmer, Student, Youth Representative"
                  maxLength={80}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              {/* 5. County & Constituency Representation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Home County</label>
                  <select
                    value={editCounty}
                    onChange={(e) => {
                      setEditCounty(e.target.value);
                      setEditConstituency('');
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer"
                  >
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c} County
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Constituency (Optional)</label>
                  <select
                    value={editConstituency}
                    onChange={(e) => setEditConstituency(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer"
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
                <div className="p-3 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Profile updated successfully!</span>
                </div>
              )}

              {/* Submit Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
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
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 text-[11px]">
            Verified TUJUANE Citizen Profile
          </span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
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
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              title="Close profile dialog"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
