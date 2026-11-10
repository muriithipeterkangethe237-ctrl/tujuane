import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Circle,
  Clock,
  UserCheck,
  UserPlus,
  UserMinus,
  Check,
  X,
  Heart,
  UserX,
  Inbox,
  Filter,
  CheckCircle2,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types/chat';
import { FollowRelationship, FriendRequest } from '../types/social';
import { subscribeToCommunityUsers, isUserOnline, formatLastSeen } from '../services/chatService';
import {
  followUser,
  unfollowUser,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendshipOrRequest,
  subscribeToFollowing,
  subscribeToFollowers,
  subscribeToIncomingFriendRequests,
  subscribeToAllUserFriendRequests
} from '../services/socialService';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../data/kenyaCounties';

interface CommunityMembersDirectoryProps {
  onStartChatWithUser: (user: UserProfile) => void;
  onViewUserProfile?: (user: UserProfile) => void;
}

type DirectorySubTab = 'all' | 'friends' | 'following' | 'followers' | 'requests';

export const CommunityMembersDirectory: React.FC<CommunityMembersDirectoryProps> = ({
  onStartChatWithUser,
  onViewUserProfile
}) => {
  const { currentUser, userProfile, openAuthModal } = useAuth();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('All');
  const [selectedConstituency, setSelectedConstituency] = useState('All');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Social states
  const [activeSubTab, setActiveSubTab] = useState<DirectorySubTab>('all');
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [followersList, setFollowersList] = useState<FollowRelationship[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [allFriendRequests, setAllFriendRequests] = useState<FriendRequest[]>([]);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  // Confirmation modal state for Unfriend / Cancel
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Close confirmation modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmModal?.isOpen) {
        setConfirmModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal]);

  // Available constituencies for currently selected county
  const availableConstituencies = useMemo(() => {
    return getConstituenciesByCounty(selectedCounty);
  }, [selectedCounty]);

  // Load all community members
  useEffect(() => {
    if (!currentUser) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const unsub = subscribeToCommunityUsers(currentUser.uid, (users) => {
      setMembers(users);
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  // Social real-time subscriptions
  useEffect(() => {
    if (!currentUser) {
      setFollowingList([]);
      setFollowersList([]);
      setIncomingRequests([]);
      setAllFriendRequests([]);
      return;
    }

    const unsubFollowing = subscribeToFollowing(currentUser.uid, (data) => {
      setFollowingList(data);
    });

    const unsubFollowers = subscribeToFollowers(currentUser.uid, (data) => {
      setFollowersList(data);
    });

    const unsubIncoming = subscribeToIncomingFriendRequests(currentUser.uid, (data) => {
      setIncomingRequests(data);
    });

    const unsubAllFriendRequests = subscribeToAllUserFriendRequests(currentUser.uid, (data) => {
      setAllFriendRequests(data);
    });

    return () => {
      unsubFollowing();
      unsubFollowers();
      unsubIncoming();
      unsubAllFriendRequests();
    };
  }, [currentUser]);

  // Sets for fast lookup
  const followingIds = useMemo(() => {
    return new Set(followingList.map((f) => f.followingId));
  }, [followingList]);

  const followerIds = useMemo(() => {
    return new Set(followersList.map((f) => f.followerId));
  }, [followersList]);

  // Helper to get friendship status with a member
  const getFriendshipInfo = (otherUid: string) => {
    if (!currentUser) return { status: 'none' as const };
    const req = allFriendRequests.find(
      (r) =>
        (r.senderId === currentUser.uid && r.receiverId === otherUid) ||
        (r.senderId === otherUid && r.receiverId === currentUser.uid)
    );

    if (!req) return { status: 'none' as const };
    if (req.status === 'accepted') return { status: 'friends' as const, request: req };
    if (req.status === 'pending') {
      if (req.senderId === currentUser.uid) {
        return { status: 'request_sent' as const, request: req };
      } else {
        return { status: 'request_received' as const, request: req };
      }
    }
    return { status: 'none' as const, request: req };
  };

  // Accepted friends user profiles
  const acceptedFriendIds = useMemo(() => {
    const set = new Set<string>();
    if (!currentUser) return set;
    allFriendRequests.forEach((r) => {
      if (r.status === 'accepted') {
        if (r.senderId === currentUser.uid) set.add(r.receiverId);
        else if (r.receiverId === currentUser.uid) set.add(r.senderId);
      }
    });
    return set;
  }, [allFriendRequests, currentUser]);

  // Handle county change
  const handleCountyChange = (county: string) => {
    setSelectedCounty(county);
    setSelectedConstituency('All');
  };

  // Follow / Unfollow Handler
  const handleToggleFollow = async (targetUser: UserProfile) => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }
    const isFollowing = followingIds.has(targetUser.uid);
    const key = `follow_${targetUser.uid}`;
    setActionInProgress((prev) => ({ ...prev, [key]: true }));

    try {
      if (isFollowing) {
        await unfollowUser(currentUser.uid, targetUser.uid);
      } else {
        await followUser(userProfile, targetUser);
      }
    } finally {
      setActionInProgress((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Send Friend Request Handler
  const handleSendFriendRequest = async (targetUser: UserProfile) => {
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }
    const key = `friend_${targetUser.uid}`;
    setActionInProgress((prev) => ({ ...prev, [key]: true }));
    try {
      await sendFriendRequest(userProfile, targetUser);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Accept Friend Request
  const handleAcceptRequest = async (requestId: string) => {
    const key = `req_${requestId}`;
    setActionInProgress((prev) => ({ ...prev, [key]: true }));
    try {
      await acceptFriendRequest(requestId);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Decline Friend Request
  const handleDeclineRequest = async (requestId: string) => {
    const key = `req_${requestId}`;
    setActionInProgress((prev) => ({ ...prev, [key]: true }));
    try {
      await declineFriendRequest(requestId);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Open confirmation for unfriending
  const openUnfriendModal = (targetUser: UserProfile, requestId: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Remove ${targetUser.displayName} from friends?`,
      description: 'You can add them back as a friend anytime.',
      actionLabel: 'Unfriend',
      onConfirm: async () => {
        try {
          await removeFriendshipOrRequest(requestId);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  // Open confirmation for canceling sent request
  const openCancelRequestModal = (targetUser: UserProfile, requestId: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Cancel friend request to ${targetUser.displayName}?`,
      description: 'They will no longer see this request.',
      actionLabel: 'Cancel Request',
      onConfirm: async () => {
        try {
          await removeFriendshipOrRequest(requestId);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  // Filter members based on selected sub-tab and search/county/constituency
  const displayedMembers = useMemo(() => {
    return members.filter((m) => {
      if (currentUser && m.uid === currentUser.uid) return false;

      // Hide platform developer account from other citizens
      if (m.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com' || m.isDeveloper) {
        return false;
      }

      // Sub-tab filter
      if (activeSubTab === 'friends' && !acceptedFriendIds.has(m.uid)) {
        return false;
      }
      if (activeSubTab === 'following' && !followingIds.has(m.uid)) {
        return false;
      }
      if (activeSubTab === 'followers' && !followerIds.has(m.uid)) {
        return false;
      }

      // Query filter
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchesName = m.displayName.toLowerCase().includes(query);
        const matchesCounty = m.county && m.county.toLowerCase().includes(query);
        const matchesConstituency = m.constituency && m.constituency.toLowerCase().includes(query);
        if (!matchesName && !matchesCounty && !matchesConstituency) return false;
      }

      // County filter
      if (selectedCounty !== 'All' && m.county !== selectedCounty) return false;

      // Constituency filter
      if (selectedConstituency !== 'All' && m.constituency !== selectedConstituency) return false;

      // Online filter
      if (onlyOnline && !m.isOnline) return false;

      return true;
    });
  }, [
    members,
    currentUser,
    activeSubTab,
    acceptedFriendIds,
    followingIds,
    followerIds,
    searchQuery,
    selectedCounty,
    selectedConstituency,
    onlyOnline
  ]);

  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-10 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-emerald-300 border border-white/10">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Community Directory · All 47 Counties & 290 Constituencies</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Connect With Fellow Kenyans
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Discover peers, leaders, neighborhood champions, and friends across all 47 counties and 290 constituencies. Follow creators, send friend requests, and collaborate freely on civic and local matters.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span><strong>{onlineCount}</strong> Online Active</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified Citizen Profiles</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Follow & Friend Requests Enabled</span>
            </div>
          </div>
        </div>
      </section>

      {/* Social Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveSubTab('all')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'all'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>All Citizens</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
            activeSubTab === 'all' ? 'bg-emerald-800 dark:bg-emerald-800 text-emerald-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}>
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('friends')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'friends'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-300" />
          <span>My Friends</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
            activeSubTab === 'friends' ? 'bg-emerald-800 dark:bg-emerald-800 text-emerald-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}>
            {acceptedFriendIds.size}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap relative ${
            activeSubTab === 'requests'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Inbox className="w-4 h-4 text-amber-300" />
          <span>Friend Requests</span>
          {incomingRequests.length > 0 && (
            <span className="bg-amber-500 text-slate-950 font-black text-[11px] px-2 py-0.5 rounded-full animate-pulse">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('following')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'following'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Heart className="w-4 h-4 text-rose-300" />
          <span>Following</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
            activeSubTab === 'following' ? 'bg-emerald-800 dark:bg-emerald-800 text-emerald-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}>
            {followingIds.size}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('followers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'followers'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4 text-blue-300" />
          <span>Followers</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
            activeSubTab === 'followers' ? 'bg-emerald-800 dark:bg-emerald-800 text-emerald-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}>
            {followerIds.size}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar (Visible for All, Friends, Following, Followers) */}
      {activeSubTab !== 'requests' && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-4 relative">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, county, constituency..."
                className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* All 47 Counties Filter */}
            <div className="md:col-span-3">
              <select
                value={selectedCounty}
                onChange={(e) => handleCountyChange(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="All">All 47 Counties</option>
                {ALL_47_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c} County
                  </option>
                ))}
              </select>
            </div>

            {/* Constituency Filter (Cascading) */}
            <div className="md:col-span-3">
              <select
                value={selectedConstituency}
                onChange={(e) => setSelectedConstituency(e.target.value)}
                disabled={selectedCounty === 'All' || availableConstituencies.length === 0}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer disabled:opacity-50"
              >
                <option value="All">
                  {selectedCounty === 'All' ? 'All Constituencies' : `All ${selectedCounty} Constituencies`}
                </option>
                {availableConstituencies.map((con) => (
                  <option key={con} value={con}>
                    {con} Constituency
                  </option>
                ))}
              </select>
            </div>

            {/* Online Only Toggle */}
            <div className="md:col-span-2 flex items-center justify-between sm:justify-end gap-2">
              <button
                onClick={() => setOnlyOnline(!onlyOnline)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                  onlyOnline
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Circle className={`w-2.5 h-2.5 ${onlyOnline ? 'fill-emerald-500 text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="truncate">Online Only</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Requests View */}
      {activeSubTab === 'requests' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Inbox className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <span>Incoming Friend Requests ({incomingRequests.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Citizens who want to connect and build a closer civic network with you.
            </p>
          </div>

          {incomingRequests.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 dark:text-slate-500">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">No pending friend requests</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                When fellow citizens send you friend requests from any of Kenya's 47 counties, you'll see them here to accept or decline.
              </p>
              <button
                onClick={() => setActiveSubTab('all')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Explore Kenyan Citizens
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-700 transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3.5">
                    {req.senderPhoto ? (
                      <img
                        src={req.senderPhoto}
                        alt={req.senderName}
                        className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-base">
                        {req.senderName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {req.senderName}
                      </h4>
                      <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {req.senderConstituency ? `${req.senderConstituency}, ` : ''}
                          {req.senderCounty || 'Nairobi'} County
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        Requested {new Date(req.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* Accept / Decline Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      disabled={actionInProgress[`req_${req.id}`]}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => handleDeclineRequest(req.id)}
                      disabled={actionInProgress[`req_${req.id}`]}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Directory Grid for All / Friends / Following / Followers */}
      {activeSubTab !== 'requests' && (
        <>
          {!currentUser ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4 max-w-lg mx-auto shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sign in to Connect & Follow</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Join the TUJUANE network to view profiles, follow voices across all 47 counties, send friend requests, and start 1-on-1 chats.
              </p>
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>Register / Sign In</span>
              </button>
            </div>
          ) : loading ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold">Loading Kenyan community members across 47 counties...</p>
            </div>
          ) : displayedMembers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 dark:text-slate-500">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                {activeSubTab === 'friends'
                  ? 'No friends yet'
                  : activeSubTab === 'following'
                  ? 'Not following anyone yet'
                  : activeSubTab === 'followers'
                  ? 'No followers yet'
                  : 'No citizens found'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {activeSubTab === 'friends'
                  ? 'Send friend requests to community members in the All Citizens tab to build your circle.'
                  : activeSubTab === 'following'
                  ? 'Tap "Follow" on active citizens to easily see their updates and stay connected.'
                  : selectedCounty !== 'All'
                  ? `No members found matching your search in ${selectedCounty} County.`
                  : 'Try clearing your search query or removing the filters.'}
              </p>
              <button
                onClick={() => {
                  setActiveSubTab('all');
                  setSearchQuery('');
                  setSelectedCounty('All');
                  setSelectedConstituency('All');
                  setOnlyOnline(false);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                View All Citizens
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedMembers.map((member) => {
                const isFollowing = followingIds.has(member.uid);
                const isFollower = followerIds.has(member.uid);
                const friendship = getFriendshipInfo(member.uid);
                const isFollowBusy = actionInProgress[`follow_${member.uid}`];
                const isFriendBusy = actionInProgress[`friend_${member.uid}`] || (friendship.request && actionInProgress[`req_${friendship.request.id}`]);

                return (
                  <div
                    key={member.uid}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Member Info Header */}
                      <div className="flex items-start gap-3.5">
                        <div
                          onClick={() => {
                            if (onViewUserProfile) onViewUserProfile(member);
                          }}
                          className="relative shrink-0 cursor-pointer group"
                          title={`View ${member.displayName}'s Profile`}
                        >
                          {member.photoURL ? (
                            <img
                              src={member.photoURL}
                              alt={member.displayName}
                              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 group-hover:ring-2 group-hover:ring-emerald-500 transition-all"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-base group-hover:bg-emerald-200 transition-colors">
                              {member.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isUserOnline(member.isOnline, member.lastSeen) ? (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 ring-1 ring-emerald-400"
                              title="Online now"
                            />
                          ) : (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-slate-400 rounded-full border-2 border-white dark:border-slate-900"
                              title={formatLastSeen(member.lastSeen, false)}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => {
                                if (onViewUserProfile) onViewUserProfile(member);
                              }}
                              className="font-bold text-sm text-slate-900 dark:text-white truncate hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                              title={`View ${member.displayName}'s Profile`}
                            >
                              {member.displayName}
                            </button>
                            {isFollower && !isFollowing && (
                              <span className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                                Follows you
                              </span>
                            )}
                            {friendship.status === 'friends' && (
                              <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                Friends
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="truncate font-medium">
                              {member.constituency ? `${member.constituency}, ` : ''}
                              {member.county || 'Nairobi'} County
                            </span>
                          </div>

                          {onViewUserProfile && (
                            <button
                              onClick={() => onViewUserProfile(member)}
                              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 hover:underline cursor-pointer mt-0.5 inline-block"
                            >
                              View Citizen Profile →
                            </button>
                          )}

                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span>
                              {formatLastSeen(member.lastSeen, isUserOnline(member.isOnline, member.lastSeen))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Social Interaction Buttons: Follow / Friend / Chat */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Follow Button */}
                        <button
                          onClick={() => handleToggleFollow(member)}
                          disabled={isFollowBusy}
                          className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            isFollowing
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800'
                              : isFollower
                              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-2xs'
                              : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-2xs'
                          } disabled:opacity-50`}
                          title={isFollowing ? 'Click to Unfollow' : isFollower ? 'Follow Back' : 'Follow'}
                        >
                          {isFollowing ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Following</span>
                            </>
                          ) : isFollower ? (
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

                        {/* Friend Request Button */}
                        {friendship.status === 'friends' && friendship.request ? (
                          <button
                            onClick={() => openUnfriendModal(member, friendship.request!.id)}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 transition-all cursor-pointer"
                            title="Friends. Click to unfriend."
                          >
                            <UserCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Friends ✓</span>
                          </button>
                        ) : friendship.status === 'request_sent' && friendship.request ? (
                          <button
                            onClick={() => openCancelRequestModal(member, friendship.request!.id)}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 transition-all cursor-pointer"
                            title="Request sent. Click to cancel."
                          >
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Requested</span>
                          </button>
                        ) : friendship.status === 'request_received' && friendship.request ? (
                          <button
                            onClick={() => handleAcceptRequest(friendship.request!.id)}
                            disabled={isFriendBusy}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-all cursor-pointer shadow-2xs"
                            title="Click to accept friend request"
                          >
                            <Check className="w-3 h-3" />
                            <span>Accept Req</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSendFriendRequest(member)}
                            disabled={isFriendBusy}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-800 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all cursor-pointer"
                            title="Send Friend Request"
                          >
                            <UserPlus className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                            <span>Add Friend</span>
                          </button>
                        )}
                      </div>

                      {/* Send Direct Message Action */}
                      <button
                        onClick={() => onStartChatWithUser(member)}
                        className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-slate-700 dark:text-slate-200 hover:text-white dark:hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer group border border-slate-200 dark:border-slate-700 hover:border-emerald-700 shadow-2xs"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 group-hover:text-white transition-colors" />
                        <span>Send Direct Message</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* In-App Confirmation Modal (Never window.confirm) */}
      {confirmModal && confirmModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {confirmModal.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmModal(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
