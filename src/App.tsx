/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { CommunityFeed } from './components/CommunityFeed';
import { DailyCommunityPoll } from './components/DailyCommunityPoll';
import { CommunityChatHub } from './components/Chat/CommunityChatHub';
import { CommunityMembersDirectory } from './components/CommunityMembersDirectory';
import { DeveloperControlPanel } from './components/DeveloperControlPanel';
import { UserProfileModal } from './components/UserProfileModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Footer } from './components/Footer';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { AuthModal } from './components/AuthModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UserProfile } from './types/chat';
import { UserNotification, AccountStandingSummary } from './types/notification';
import { CommunityPost } from './types/community';
import { PostTypeSelectorModal, PostCreationType, PostTypeOption } from './components/PostTypeSelectorModal';
import { CreateStoryModal } from './components/Stories/CreateStoryModal';
import { ExternalCreateRequest } from './components/CommunityFeed';
import { subscribeToSafetyReports } from './services/safetyService';
import { subscribeToIncomingFriendRequests } from './services/socialService';
import { subscribeToCommunityPosts } from './services/communityService';
import { subscribeToUserChats } from './services/chatService';
import {
  subscribeToUserNotifications,
  calculateAccountStanding
} from './services/userNotificationService';
import { Check, ArrowLeft, Home, Sparkles, ShieldAlert, Bell, Ban, Clock, AlertTriangle } from 'lucide-react';

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

function AppContent() {
  const {
    currentUser,
    userProfile,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    authModalInitialMode
  } = useAuth();
  const [activeTab, setActiveTabState] = useState<string>('landing');
  const [historyStack, setHistoryStack] = useState<string[]>(['landing']);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isDeveloper = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  const isBanned = userProfile?.accountStatus === 'banned';
  const isSuspended =
    userProfile?.accountStatus === 'suspended' &&
    (!userProfile.suspendedUntil || new Date(userProfile.suspendedUntil).getTime() > Date.now());
  const isRestricted = isBanned || isSuspended;

  // Profile Viewing state
  const [viewingProfileUser, setViewingProfileUser] = useState<UserProfile | null>(null);

  // Badge counters for safety reports, friend requests, and unread chat messages
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState<number>(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);

  // Direct chat target user when clicking "Chat" from Feed or Members Directory
  const [directChatTargetUser, setDirectChatTargetUser] = useState<UserProfile | null>(null);
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);

  // Notification Channel states
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [accountStanding, setAccountStanding] = useState<AccountStandingSummary | null>(null);

  // Subscribe to real-time pending safety reports only for verified developer
  useEffect(() => {
    if (isDeveloper) {
      const unsub = subscribeToSafetyReports((reports) => {
        const pending = reports.filter((r) => r.status === 'pending').length;
        setPendingReportsCount(pending);
      });
      return () => unsub();
    } else {
      setPendingReportsCount(0);
    }
  }, [isDeveloper]);

  // Subscribe to real-time user notification channel
  useEffect(() => {
    if (!currentUser) {
      setUserNotifications([]);
      setAccountStanding(null);
      return;
    }

    const unsub = subscribeToUserNotifications(currentUser.uid, (notifs) => {
      setUserNotifications(notifs);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to real-time user direct chats to display unread badge on Chat icon
  useEffect(() => {
    if (!currentUser) {
      setUnreadMessagesCount(0);
      return;
    }

    const unsub = subscribeToUserChats(currentUser.uid, (chats) => {
      const unreadCount = chats.filter(
        (c) => Array.isArray(c.unreadBy) && c.unreadBy.includes(currentUser.uid)
      ).length;
      setUnreadMessagesCount(unreadCount);
    });
    return () => unsub();
  }, [currentUser]);

  // Notifications count for bell (message notifications appear as badge on the chats icon)
  const unreadNotificationsCount = userNotifications.filter(
    (n) => !n.read && n.category !== 'direct_chat'
  ).length;

  // Keep viewingProfileUser in sync if own profile was updated
  useEffect(() => {
    if (viewingProfileUser && currentUser && viewingProfileUser.uid === currentUser.uid && userProfile) {
      setViewingProfileUser(userProfile);
    }
  }, [userProfile]);

  // Subscribe to real-time incoming friend requests for current user
  useEffect(() => {
    if (!currentUser) {
      setPendingFriendRequestsCount(0);
      return;
    }

    const unsub = subscribeToIncomingFriendRequests(currentUser.uid, (requests) => {
      setPendingFriendRequestsCount(requests.length);
    });
    return () => unsub();
  }, [currentUser]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Post type selector and story creation modals from top Header
  const [isPostTypeSelectorOpen, setIsPostTypeSelectorOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [feedCreateRequest, setFeedCreateRequest] = useState<ExternalCreateRequest | null>(null);

  const handleSelectPostTypeFromApp = (type: PostCreationType, option?: PostTypeOption) => {
    setIsPostTypeSelectorOpen(false);
    if (!currentUser) {
      openAuthModal('register');
      return;
    }
    if (isBanned) {
      showToast(`⛔ Account permanently banned: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    if (isSuspended) {
      showToast(`⚠️ Account suspended: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }

    if (type === 'story') {
      setIsStoryModalOpen(true);
      return;
    }

    setActiveTab('community');
    setFeedCreateRequest({
      category: option?.category || 'general',
      solidBg: option?.solidBg || (type === 'solid_bg' ? 'emerald' : 'default'),
      requiresImage: !!option?.requiresImage,
      timestamp: Date.now()
    });
  };

  const handleDirectPostFromBottomNav = () => {
    if (!currentUser) {
      openAuthModal('register');
      return;
    }
    if (isBanned) {
      showToast(`⛔ Account permanently banned: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }
    if (isSuspended) {
      showToast(`⚠️ Account suspended: ${userProfile?.banReason || 'Policy violation'}`);
      return;
    }

    // Direct Post action: bypasses post type selector and opens post creator directly
    setActiveTab('community');
    setFeedCreateRequest({
      category: 'general',
      solidBg: 'default',
      requiresImage: false,
      timestamp: Date.now()
    });
  };

  // Refs to always have current values in window popstate event without stale closure
  const viewingProfileUserRef = useRef(viewingProfileUser);
  const isNotificationsOpenRef = useRef(isNotificationsOpen);
  const isAuthModalOpenRef = useRef(isAuthModalOpen);
  const directChatTargetUserRef = useRef(directChatTargetUser);
  const isChatThreadOpenRef = useRef(isChatThreadOpen);
  const activeTabRef = useRef(activeTab);
  const historyStackRef = useRef(historyStack);

  useEffect(() => { viewingProfileUserRef.current = viewingProfileUser; }, [viewingProfileUser]);
  useEffect(() => { isNotificationsOpenRef.current = isNotificationsOpen; }, [isNotificationsOpen]);
  useEffect(() => { isAuthModalOpenRef.current = isAuthModalOpen; }, [isAuthModalOpen]);
  useEffect(() => { directChatTargetUserRef.current = directChatTargetUser; }, [directChatTargetUser]);
  useEffect(() => { isChatThreadOpenRef.current = isChatThreadOpen; }, [isChatThreadOpen]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { historyStackRef.current = historyStack; }, [historyStack]);

  // Handle phone hardware/gesture back button navigation via window popstate
  useEffect(() => {
    // Ensure base entry in history exists
    if (typeof window !== 'undefined') {
      try {
        if (!window.history.state) {
          window.history.replaceState({ type: 'tab', tab: 'landing' }, '');
        }
      } catch {}
    }

    const handlePopState = (event: PopStateEvent) => {
      // 1. If viewing user profile modal is open, close modal first
      if (viewingProfileUserRef.current) {
        setViewingProfileUser(null);
        return;
      }

      // 2. If notification center modal is open, close it
      if (isNotificationsOpenRef.current) {
        setIsNotificationsOpen(false);
        return;
      }

      // 3. If authentication modal is open, close it
      if (isAuthModalOpenRef.current) {
        closeAuthModal();
        return;
      }

      // 4. If in direct 1-on-1 chat or thread inside Chat Hub, return to the chat conversations list
      if (activeTabRef.current === 'chat' && (directChatTargetUserRef.current || isChatThreadOpenRef.current)) {
        setDirectChatTargetUser(null);
        setIsChatThreadOpen(false);
        return;
      }

      // 5. If browser history state specifies a tab, switch to it
      if (event.state && typeof event.state.tab === 'string') {
        const targetTab = event.state.tab;
        setActiveTabState(targetTab);
        setHistoryStack((prev) => {
          const next = [...prev];
          if (next.length > 1) next.pop();
          return next.length > 0 ? next : [targetTab];
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // 6. Otherwise pop internal stack or return to landing
      const currentStack = historyStackRef.current;
      if (currentStack.length > 1) {
        const nextStack = [...currentStack];
        nextStack.pop();
        const prevTab = nextStack[nextStack.length - 1] || 'landing';
        setHistoryStack(nextStack);
        setActiveTabState(prevTab);
      } else {
        setActiveTabState('landing');
        setHistoryStack(['landing']);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeAuthModal]);

  const setActiveTab = (tab: string, pushToHistory = true) => {
    if (tab === activeTab) return;
    if (pushToHistory && typeof window !== 'undefined') {
      try {
        window.history.pushState({ type: 'tab', tab }, '');
      } catch {}
    }
    setHistoryStack((prev) => [...prev, tab]);
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openUserProfileModal = (user: UserProfile) => {
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ type: 'modal', modal: 'profile', uid: user.uid }, '');
      } catch {}
    }
    setViewingProfileUser(user);
  };

  const openNotificationsModal = () => {
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ type: 'modal', modal: 'notifications' }, '');
      } catch {}
    }
    setIsNotificationsOpen(true);
  };

  const handleGoBack = () => {
    // If a modal or direct chat is active, prefer history.back()
    if (viewingProfileUser) {
      setViewingProfileUser(null);
      if (window.history.length > 1) window.history.back();
      return;
    }

    if (isNotificationsOpen) {
      setIsNotificationsOpen(false);
      if (window.history.length > 1) window.history.back();
      return;
    }

    if (activeTab === 'chat' && (directChatTargetUser || isChatThreadOpen)) {
      setDirectChatTargetUser(null);
      setIsChatThreadOpen(false);
      if (window.history.length > 1) window.history.back();
      return;
    }

    if (window.history.length > 1 && activeTab !== 'landing') {
      window.history.back();
    } else {
      setActiveTab('landing', false);
      setHistoryStack(['landing']);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canGoBack = activeTab !== 'landing' || historyStack.length > 1 || !!directChatTargetUser || isChatThreadOpen || !!viewingProfileUser || isNotificationsOpen;


  const handleStartChatWithUser = (user: UserProfile) => {
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ type: 'chat_target', targetId: user.uid }, '');
      } catch {}
    }
    setDirectChatTargetUser(user);
    if (activeTab !== 'chat') {
      setActiveTab('chat', false);
    }
  };

  const handleOpenDirectChatWithPostAuthor = (authorId: string, authorName: string) => {
    const targetUser: UserProfile = {
      uid: authorId,
      displayName: authorName,
      email: '',
      county: 'Nairobi',
      createdAt: ''
    };
    handleStartChatWithUser(targetUser);
  };


  const handleLandingNavigate = (tab: string, _countyFilter?: string) => {
    setActiveTab(tab);
  };

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'community':
        return 'Discussions & Citizen Feed';
      case 'polls':
        return 'Daily Community Polls';
      case 'chat':
        return directChatTargetUser ? `Chat with ${directChatTargetUser.displayName}` : '1-on-1 Community Chat';
      case 'members':
        return 'Kenyan Citizen Directory';
      case 'dev-panel':
        return 'Developer Safety & Moderation Control Panel';
      default:
        return 'TUJUANE Community Hub';
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors ${activeTab === 'chat' ? 'h-screen h-dvh overflow-hidden' : ''}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 animate-bounce border border-slate-700">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header with Back Button, Dev Panel and Notification Center (hidden in chat for true full-screen inboxes) */}
      {activeTab !== 'chat' && (
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          canGoBack={canGoBack}
          onGoBack={handleGoBack}
          pendingReportsCount={pendingReportsCount}
          pendingFriendRequestsCount={pendingFriendRequestsCount}
          unreadNotificationsCount={unreadNotificationsCount}
          unreadMessagesCount={unreadMessagesCount}
          onOpenNotifications={openNotificationsModal}
          onViewOwnProfile={() => {
            if (userProfile) {
              openUserProfileModal(userProfile);
            } else if (currentUser) {
              openUserProfileModal({
                uid: currentUser.uid,
                displayName: currentUser.displayName || 'Citizen Member',
                email: currentUser.email || '',
                photoURL: currentUser.photoURL || undefined,
                county: 'Nairobi',
                createdAt: new Date().toISOString()
              });
            }
          }}
          onOpenCreatePost={() => {
            setIsPostTypeSelectorOpen(true);
          }}
        />
      )}

      {/* Contextual Top Back Bar for non-landing pages (omitted on chat for full-screen experience) */}
      {activeTab !== 'landing' && activeTab !== 'chat' && (
        <div className="bg-slate-100/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-2 sticky top-16 z-30 backdrop-blur-xs transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold border border-slate-300 dark:border-slate-700 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                aria-label="Back to previous screen"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
                <span>Back</span>
              </button>

              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 truncate">
                <button
                  onClick={() => setActiveTab('landing')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Home className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <span className="hidden sm:inline">Hub</span>
                </button>
                <span>/</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {getPageTitle(activeTab)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTab !== 'dev-panel' && isDeveloper && (
                <button
                  onClick={() => setActiveTab('dev-panel')}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                  title="Open Developer Safety Control Panel"
                >
                  <ShieldAlert className="w-3 h-3 text-rose-600" />
                  <span>Dev Panel</span>
                  {pendingReportsCount > 0 && (
                    <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                      {pendingReportsCount}
                    </span>
                  )}
                </button>
              )}

              {activeTab !== 'polls' && (
                <button
                  onClick={() => setActiveTab('polls')}
                  className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Vote in Today's Poll</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - Full screen edge-to-edge for messaging panel */}
      <main
        className={
          activeTab === 'chat'
            ? 'flex-1 w-full p-0 flex flex-col h-full h-dvh max-w-full overflow-hidden'
            : 'flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full'
        }
      >
        {/* Account Restriction Status Alert */}
        {isRestricted && (
          <div className="mb-6 p-4 rounded-2xl border shadow-sm animate-fade-in transition-all bg-white overflow-hidden">
            {isBanned ? (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-200/80 p-4 rounded-xl text-rose-900">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Ban className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black flex items-center gap-2">
                    <span>⛔ Account Permanently Banned</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 text-rose-900">Restricted</span>
                  </div>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Your citizen account has been permanently restricted from TUJUANE due to safety violations:
                    <span className="font-bold underline ml-1">{userProfile?.banReason || 'Violation of community safety standards'}</span>.
                    You cannot publish discussions, participate in direct chats, or post comments.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/80 p-4 rounded-xl text-amber-900">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black flex items-center gap-2">
                    <span>⚠️ Account Temporarily Suspended</span>
                    {userProfile?.suspendedUntil && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                        Until {new Date(userProfile.suspendedUntil).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Your citizen account is currently suspended.
                    Reason: <span className="font-bold ml-1">{userProfile?.banReason || 'Community policy infraction'}</span>.
                    During this suspension window, creating posts, replying with comments, and sending messages are disabled.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Landing / Community Hub View */}
        {activeTab === 'landing' && (
          <LandingPage onNavigate={handleLandingNavigate} />
        )}

        {/* Daily Community Polls Dedicated View */}
        {activeTab === 'polls' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Daily Community Polls
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Kura Yako, Sauti Yako — Live voice on Kenyan culture, Matatu heritage, lifestyle, and county devolution issues.
                </p>
              </div>
              <button
                onClick={handleGoBack}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-700" />
                <span>Back to Hub</span>
              </button>
            </div>

            <DailyCommunityPoll
              onDiscussInFeed={(_pollTitle) => {
                setActiveTab('community');
              }}
            />
          </div>
        )}

        {/* Community Discussions, Media Sharing, Safety Pre-scan & Post Management Feed */}
        {activeTab === 'community' && (
          <CommunityFeed
            onOpenDirectChatWithUser={handleOpenDirectChatWithPostAuthor}
            onViewUserProfile={(user) => openUserProfileModal(user)}
            externalCreateRequest={feedCreateRequest}
            onClearExternalCreateRequest={() => setFeedCreateRequest(null)}
          />
        )}

        {/* 1-on-1 Real-time Chat Hub */}
        {activeTab === 'chat' && (
          <CommunityChatHub
            directChatTargetUser={directChatTargetUser}
            onClearDirectChatTargetUser={() => setDirectChatTargetUser(null)}
            onViewUserProfile={(user) => openUserProfileModal(user)}
            onThreadStateChange={(isOpen) => setIsChatThreadOpen(isOpen)}
            onGoBack={handleGoBack}
          />
        )}


        {/* Community Members Directory with Follow & Friend Requests */}
        {activeTab === 'members' && (
          <CommunityMembersDirectory
            onStartChatWithUser={handleStartChatWithUser}
            onViewUserProfile={(user) => openUserProfileModal(user)}
          />
        )}

        {/* Developer Control Panel & Safety Monitor - Strictly visible only to verified developer */}
        {activeTab === 'dev-panel' && (
          isDeveloper ? (
            <DeveloperControlPanel
              onGoBack={handleGoBack}
              onNavigateToPost={(_postId) => {
                setActiveTab('community');
              }}
            />
          ) : (
            <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-5 text-center">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-extrabold text-slate-900">Access Restricted</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The Developer Safety & Moderation Control Panel is accessible strictly to the system developer ({DEVELOPER_EMAIL}).
                </p>
              </div>
              <button
                onClick={() => setActiveTab('landing')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
              >
                Return to Community Hub
              </button>
            </div>
          )
        )}
      </main>

      {/* Citizen Profile Viewing & Editing Modal */}
      {viewingProfileUser && (
        <UserProfileModal
          user={viewingProfileUser.uid === userProfile?.uid && userProfile ? userProfile : viewingProfileUser}
          isOpen={!!viewingProfileUser}
          onClose={() => setViewingProfileUser(null)}
          onStartDirectChat={handleStartChatWithUser}
          onSelectPost={(_postId) => {
            setActiveTab('community');
          }}
          onProfileUpdated={(updatedProfile) => {
            setViewingProfileUser(updatedProfile);
          }}
        />
      )}

      {/* Real-Time Notification Center Modal */}
      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={userNotifications}
        accountStanding={accountStanding}
        onSelectPost={(_postId: string) => {
          setActiveTab('community');
        }}
        onStartDirectChat={(userId: string, userName: string) => {
          handleOpenDirectChatWithPostAuthor(userId, userName);
        }}
        onViewUserProfile={(userId: string, userName: string) => {
          openUserProfileModal({
            uid: userId,
            displayName: userName,
            email: '',
            county: 'Kenya Citizen',
            createdAt: ''
          });
        }}
      />

      {/* Citizen Authentication & Password Security Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalInitialMode}
      />

      {/* Desktop & Mobile Footer - Completely hidden in chat and feed for true distraction-free browsing */}
      {activeTab !== 'chat' && activeTab !== 'community' && (
        <Footer
          onSelectTab={(tab) => {
            setActiveTab(tab);
          }}
        />
      )}

      {/* Mobile-First Bottom Navigation Bar (Hidden when in chat so messaging inboxes are true full screen) */}
      {activeTab !== 'chat' && (
        <MobileBottomNav
          activeTab={activeTab}
          pendingFriendRequestsCount={pendingFriendRequestsCount}
          unreadNotificationsCount={unreadNotificationsCount}
          unreadMessagesCount={unreadMessagesCount}
          onOpenNotifications={openNotificationsModal}
          onDirectPost={handleDirectPostFromBottomNav}
          setActiveTab={(tab) => {
            setActiveTab(tab);
          }}
        />
      )}

      {/* Offline Status Badge for PWA Resilience */}
      <OfflineIndicator />

      {/* Post Type Selector Modal (triggered from top Header Plus button) */}
      {isPostTypeSelectorOpen && (
        <PostTypeSelectorModal
          isOpen={isPostTypeSelectorOpen}
          onClose={() => setIsPostTypeSelectorOpen(false)}
          onSelectType={handleSelectPostTypeFromApp}
        />
      )}

      {/* 24h Citizen Story Creator Modal (triggered from top Header Plus button) */}
      {isStoryModalOpen && (
        <CreateStoryModal
          isOpen={isStoryModalOpen}
          currentUser={currentUser}
          userProfile={userProfile}
          onClose={() => setIsStoryModalOpen(false)}
          onStoryPublished={(_storyId) => {
            setIsStoryModalOpen(false);
            showToast('✓ Story published to Citizen Stories tray!');
            setActiveTab('community');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
