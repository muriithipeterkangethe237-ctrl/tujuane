import React from 'react';
import {
  Users,
  Plus,
  MessageSquare,
  UserCheck,
  Flame,
  Compass,
  ArrowLeft,
  Vote,
  ShieldAlert,
  ShieldCheck,
  Inbox,
  Bell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCreatePost?: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  pendingReportsCount?: number;
  pendingFriendRequestsCount?: number;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  onViewOwnProfile?: () => void;
}

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenCreatePost,
  canGoBack = false,
  onGoBack,
  pendingReportsCount = 0,
  pendingFriendRequestsCount = 0,
  unreadNotificationsCount = 0,
  onOpenNotifications,
  onViewOwnProfile
}) => {
  const { currentUser, userProfile, openAuthModal } = useAuth();
  const isDev = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Back Button & Wordmark */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {canGoBack && onGoBack && (
            <button
              onClick={onGoBack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-xs transition-all cursor-pointer border border-slate-200 shadow-xs group"
              title="Go Back"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-700 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline">Back</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('landing')}
            className="text-left flex items-center gap-2.5 group whitespace-nowrap shrink-0 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-bold transition-transform group-hover:scale-105 shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors">
                TUJUANE
              </span>
              <span className="hidden sm:block text-[10px] text-slate-500 font-semibold tracking-wide uppercase">
                Kenya Community Network
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation links */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('landing')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'landing'
                ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                : 'hover:text-slate-900'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Community Hub</span>
          </button>

          <button
            onClick={() => setActiveTab('community')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'community'
                ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                : 'hover:text-slate-900'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Discussions & Feed</span>
          </button>

          <button
            onClick={() => setActiveTab('polls')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'polls'
                ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                : 'hover:text-slate-900'
            }`}
          >
            <Vote className="w-4 h-4 text-emerald-600" />
            <span>Daily Polls</span>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              Live
            </span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                : 'hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>1-on-1 Chat</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              Live
            </span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 relative ${
              activeTab === 'members'
                ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                : 'hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-purple-600" />
            <span>Members & Friends</span>
            {pendingFriendRequestsCount > 0 && (
              <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded-full animate-pulse">
                {pendingFriendRequestsCount}
              </span>
            )}
          </button>

          {/* Dev Control Panel Button - ONLY visible to verified developer */}
          {isDev && (
            <button
              onClick={() => setActiveTab('dev-panel')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                activeTab === 'dev-panel'
                  ? 'bg-rose-900 text-rose-100 border-rose-700'
                  : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
              }`}
              title="Developer Control Panel: Safety & Content Monitoring"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Dev Panel</span>
              {pendingReportsCount > 0 && (
                <span className="bg-rose-600 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full animate-bounce">
                  {pendingReportsCount}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Zone 3: Actions & Google Sign-In */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Notification Channel Bell */}
          {currentUser && onOpenNotifications && (
            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-xl text-slate-700 hover:text-emerald-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer border border-slate-200 shadow-2xs"
              title="Notification Channel: Post Interactions & Account Standing"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-emerald-600 text-white font-black text-[10px] rounded-full flex items-center justify-center shadow-xs animate-pulse ring-2 ring-white">
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          {currentUser && onOpenCreatePost && (
            <button
              onClick={onOpenCreatePost}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Post Discussion</span>
            </button>
          )}

          {currentUser ? (
            <button
              onClick={() => {
                if (onViewOwnProfile) onViewOwnProfile();
                else setActiveTab('chat');
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
              title="View & Edit Your Citizen Profile"
            >
              {userProfile?.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <UserCheck className="w-4 h-4 text-emerald-600" />
              )}
              <span className="hidden sm:inline truncate max-w-[100px]">
                {userProfile?.displayName.split(' ')[0]}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                title="Sign in to your account"
              >
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                title="Register with secure password setup"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Register</span>
              </button>
            </div>
          )}

          {/* Mobile dev panel shortcut - ONLY visible to verified developer */}
          {isDev && (
            <button
              onClick={() => setActiveTab('dev-panel')}
              className="md:hidden p-2 text-rose-700 hover:text-rose-900 relative cursor-pointer"
              aria-label="Developer Control Panel"
              title="Dev Control Panel"
            >
              <ShieldAlert className="w-5 h-5" />
              {pendingReportsCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('chat')}
            className="md:hidden p-2 text-slate-700 hover:text-slate-900 relative"
            aria-label="Community Chat"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
          </button>
        </div>
      </div>
    </header>
  );
};
