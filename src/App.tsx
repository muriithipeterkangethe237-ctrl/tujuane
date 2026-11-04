/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserProfile } from './types/chat';
import { UserNotification, AccountStandingSummary } from './types/notification';
import { CommunityPost } from './types/community';
import { subscribeToSafetyReports } from './services/safetyService';
import { subscribeToIncomingFriendRequests } from './services/socialService';
import { subscribeToCommunityPosts } from './services/communityService';
import {
  subscribeToUserNotifications,
  calculateAccountStanding
} from './services/userNotificationService';
import { Check, ArrowLeft, Home, Sparkles, ShieldAlert, Bell } from 'lucide-react';

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

function AppContent() {
  const {
    currentUser,
    userProfile,
    isAuthModalOpen,
    closeAuthModal,
    authModalInitialMode
  } = useAuth();
  const [activeTab, setActiveTabState] = useState<string>('landing');
  const [historyStack, setHistoryStack] = useState<string[]>(['landing']);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isDeveloper = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  // Profile Viewing state
  const [viewingProfileUser, setViewingProfileUser] = useState<UserProfile | null>(null);

  // Badge counters for safety reports and friend requests
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState<number>(0);

  // Direct chat target user when clicking "Chat" from Feed or Members Directory
  const [directChatTargetUser, setDirectChatTargetUser] = useState<UserProfile | null>(null);

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

  // Calculate real-time account standing based on posts and notifications
  useEffect(() => {
    if (!currentUser) return;

    const unsub = subscribeToCommunityPosts({}, (posts) => {
      const standing = calculateAccountStanding(currentUser.uid, posts, userNotifications);
      setAccountStanding(standing);
    });
    return () => unsub();
  }, [currentUser, userNotifications]);

  const unreadNotificationsCount = userNotifications.filter((n) => !n.read).length;

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

  const setActiveTab = (tab: string) => {
    if (tab === activeTab) return;
    setHistoryStack((prev) => [...prev, tab]);
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoBack = () => {
    // If in 1-on-1 direct chat view, reset target user first if needed
    if (activeTab === 'chat' && directChatTargetUser) {
      setDirectChatTargetUser(null);
      return;
    }

    if (historyStack.length > 1) {
      const nextStack = [...historyStack];
      nextStack.pop(); // Pop current view
      const prevTab = nextStack[nextStack.length - 1] || 'landing';
      setHistoryStack(nextStack);
      setActiveTabState(prevTab);
    } else {
      setActiveTabState('landing');
      setHistoryStack(['landing']);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canGoBack = activeTab !== 'landing' || historyStack.length > 1 || !!directChatTargetUser;

  const handleStartChatWithUser = (user: UserProfile) => {
    setDirectChatTargetUser(user);
    setActiveTab('chat');
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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header with Back Button, Dev Panel and Notification Center */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canGoBack={canGoBack}
        onGoBack={handleGoBack}
        pendingReportsCount={pendingReportsCount}
        pendingFriendRequestsCount={pendingFriendRequestsCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onViewOwnProfile={() => {
          if (userProfile) {
            setViewingProfileUser(userProfile);
          } else if (currentUser) {
            setViewingProfileUser({
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
          setActiveTab('community');
        }}
      />

      {/* Contextual Top Back Bar for non-landing pages */}
      {activeTab !== 'landing' && (
        <div className="bg-slate-100/90 border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2 sticky top-16 z-30 backdrop-blur-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                aria-label="Back to previous screen"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
                <span>Back</span>
              </button>

              <div className="flex items-center gap-1.5 text-slate-500 truncate">
                <button
                  onClick={() => setActiveTab('landing')}
                  className="hover:text-emerald-700 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Home className="w-3 h-3 text-slate-400" />
                  <span className="hidden sm:inline">Hub</span>
                </button>
                <span>/</span>
                <span className="font-semibold text-slate-800 truncate">
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
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
            onViewUserProfile={(user) => setViewingProfileUser(user)}
          />
        )}

        {/* 1-on-1 Real-time Chat Hub */}
        {activeTab === 'chat' && (
          <CommunityChatHub
            directChatTargetUser={directChatTargetUser}
            onClearDirectChatTargetUser={() => setDirectChatTargetUser(null)}
            onViewUserProfile={(user) => setViewingProfileUser(user)}
          />
        )}

        {/* Community Members Directory with Follow & Friend Requests */}
        {activeTab === 'members' && (
          <CommunityMembersDirectory
            onStartChatWithUser={handleStartChatWithUser}
            onViewUserProfile={(user) => setViewingProfileUser(user)}
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
          user={viewingProfileUser}
          isOpen={!!viewingProfileUser}
          onClose={() => setViewingProfileUser(null)}
          onStartDirectChat={handleStartChatWithUser}
          onSelectPost={(_postId) => {
            setActiveTab('community');
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
          setViewingProfileUser({
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

      {/* Desktop & Mobile Footer */}
      <Footer
        onSelectTab={(tab) => {
          setActiveTab(tab);
        }}
      />

      {/* Mobile-First Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        pendingFriendRequestsCount={pendingFriendRequestsCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
