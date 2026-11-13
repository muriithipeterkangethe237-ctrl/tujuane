import React, { useState, useRef, useEffect } from 'react';
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
  Bell,
  MoreVertical,
  Settings,
  LogOut,
  RefreshCw,
  MapPin,
  User,
  Database,
  ChevronRight,
  Info,
  Lock,
  X,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AppLogoIcon } from './AppLogoIcon';
import { PWAInstallButton } from './PWAInstallButton';
import { AppSettingsModal } from './AppSettingsModal';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCreatePost?: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  pendingReportsCount?: number;
  pendingFriendRequestsCount?: number;
  unreadNotificationsCount?: number;
  unreadMessagesCount?: number;
  onOpenNotifications?: () => void;
  onViewOwnProfile?: () => void;
  onOpenSettings?: () => void;
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
  unreadMessagesCount = 0,
  onOpenNotifications,
  onViewOwnProfile,
  onOpenSettings
}) => {
  const { currentUser, userProfile, openAuthModal, logout, switchAccount, blockedUserIds } = useAuth();
  const { theme, setTheme, isDark, toggleTheme } = useTheme();
  const isDev = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  // 3-dots dropdown menu and settings modal states
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'appearance' | 'location' | 'notifications' | 'privacy' | 'storage' | 'about'>('account');
  const [showSwitchPicker, setShowSwitchPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        setShowSwitchPicker(false);
        setShowLogoutConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openSettingsTab = (tab: 'account' | 'appearance' | 'location' | 'notifications' | 'privacy' | 'storage' | 'about') => {
    setSettingsInitialTab(tab);
    setIsSettingsModalOpen(true);
    setIsMenuOpen(false);
    if (onOpenSettings) onOpenSettings();
  };

  const handleExecuteLogout = async () => {
    try {
      await logout();
      setShowLogoutConfirm(false);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleExecuteSwitch = async (mode: 'google' | 'email') => {
    setIsSwitching(true);
    try {
      await switchAccount(mode);
      setShowSwitchPicker(false);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Switch account error:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Zone 1: Back Button & Wordmark */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {canGoBack && onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shadow-xs group"
                title="Go Back"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-700 dark:text-emerald-400 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-bold hidden sm:inline">Back</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('landing')}
              className={`group whitespace-nowrap shrink-0 cursor-pointer flex items-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded-xl ${
                activeTab === 'landing' ? 'gap-2.5 text-left' : 'justify-center'
              }`}
              title="Home - Kenya Community Hub"
              aria-label="Home"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-950 p-0.5 border border-emerald-500/40 flex items-center justify-center transition-transform group-hover:scale-105 shadow-md overflow-hidden relative shrink-0">
                <AppLogoIcon className="w-full h-full" />
              </div>
              {/* Return the name TUJUANE on the hub surface alongside the app icon */}
              {activeTab === 'landing' && (
                <div>
                  <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    TUJUANE
                  </span>
                  <span className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-wide uppercase">
                    Kenya Community Network
                  </span>
                </div>
              )}
            </button>
          </div>

          {/* Zone 2: Navigation links */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              onClick={() => setActiveTab('landing')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'landing'
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 dark:border-emerald-500 pb-0.5'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Community Hub</span>
            </button>

            <button
              onClick={() => setActiveTab('community')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'community'
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 dark:border-emerald-500 pb-0.5'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Discussions & Feed</span>
            </button>

            <button
              onClick={() => setActiveTab('polls')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'polls'
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 dark:border-emerald-500 pb-0.5'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Vote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Daily Polls</span>
              <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300 dark:border-amber-800">
                Live
              </span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 dark:border-emerald-500 pb-0.5'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="relative">
                <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-600 animate-ping ring-2 ring-white dark:ring-slate-900" />
                )}
              </div>
              <span>1-on-1 Chat</span>
              {unreadMessagesCount > 0 ? (
                <span className="bg-emerald-600 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full animate-pulse shadow-xs">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              ) : (
                <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-300 dark:border-emerald-800">
                  Live
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 relative ${
                activeTab === 'members'
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 dark:border-emerald-500 pb-0.5'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
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
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                }`}
                title="Developer Control Panel: Safety & Content Monitoring"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Dev Panel</span>
                {pendingReportsCount > 0 && (
                  <span className="bg-rose-600 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full animate-bounce">
                    {pendingReportsCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Zone 3: Actions & 3-Dots Settings Menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* PWA In-App Install Prompt */}
            <PWAInstallButton variant="header" />

            {/* Notification Channel Bell */}
            {currentUser && onOpenNotifications && (
              <button
                onClick={onOpenNotifications}
                className="relative p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
                title="Notification Channel: Post Interactions & Account Standing"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-emerald-600 text-white font-black text-[10px] rounded-full flex items-center justify-center shadow-xs animate-pulse ring-2 ring-white dark:ring-slate-900">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Plus (+) Create Post Button (hidden on hub surface per user request) */}
            {activeTab !== 'landing' && onOpenCreatePost && (
              <button
                onClick={() => {
                  if (currentUser) {
                    onOpenCreatePost();
                  } else {
                    openAuthModal('register');
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-emerald-600/30 border border-emerald-500/50 shrink-0"
                title="Create a post, story, or discussion"
                aria-label="Create new post"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="hidden sm:inline font-bold">Create</span>
              </button>
            )}

            {/* User Profile Pill (if logged in) */}
            {currentUser ? (
              <button
                onClick={() => {
                  if (onViewOwnProfile) onViewOwnProfile();
                  else setActiveTab('chat');
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                title="View & Edit Your Citizen Profile"
              >
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="hidden sm:inline truncate max-w-[90px]">
                  {userProfile?.displayName.split(' ')[0]}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openAuthModal('signin')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
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
                  <span className="hidden sm:inline">Register</span>
                </button>
              </div>
            )}

            {/* 3-DOTS MENU BUTTON WHERE USERS ACCESS ALL APP SETTINGS */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                  isMenuOpen
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-950 dark:text-white border-slate-300 dark:border-slate-600 ring-2 ring-emerald-500/40 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-xs'
                }`}
                title="App Settings, Account Switching, Theme & Options"
                aria-label="App Settings and Options"
                aria-expanded={isMenuOpen}
              >
                <MoreVertical className="w-5 h-5 stroke-[2.3]" />
              </button>

              {/* Elevated Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Account Summary Header */}
                  <div className="p-2.5 pb-3">
                    {currentUser ? (
                      <div className="flex items-center gap-3">
                        {userProfile?.photoURL ? (
                          <img
                            src={userProfile.photoURL}
                            alt={userProfile.displayName}
                            className="w-10 h-10 rounded-xl object-cover ring-1 ring-emerald-500/30 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 font-black text-sm flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800">
                            {userProfile?.displayName?.charAt(0) || currentUser.displayName?.charAt(0) || 'C'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                              {userProfile?.displayName || currentUser.displayName || 'Citizen Member'}
                            </span>
                            {isDev && (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                Dev
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {currentUser.email || 'Citizen Member'}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-md border border-emerald-200 dark:border-emerald-800/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {userProfile?.county || 'Nairobi'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-1">
                        <div className="font-extrabold text-xs text-slate-900 dark:text-white">Guest Citizen</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Sign in to unlock all community features</div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              openAuthModal('signin');
                            }}
                            className="flex-1 py-1.5 px-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer text-center shadow-xs"
                          >
                            Sign In
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              openAuthModal('register');
                            }}
                            className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer text-center shadow-xs"
                          >
                            Register
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* QUICK DARK MODE TOGGLE WIDGET */}
                  <div className="py-2 px-1">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                            isDark ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-500/20 text-amber-600'
                          }`}>
                            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {isDark ? 'Night Theme' : 'Light Theme'}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {theme === 'system' ? 'Synced with OS' : isDark ? 'Comfortable in the dark' : 'Daylight high contrast'}
                            </div>
                          </div>
                        </div>

                        {/* Quick toggle pill */}
                        <button
                          type="button"
                          onClick={toggleTheme}
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-slate-300 dark:bg-emerald-600"
                          title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
                          aria-label="Toggle dark mode"
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              isDark ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 3-way segmented buttons: Light / Dark / Auto */}
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/80 dark:bg-slate-900/90 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setTheme('light')}
                          className={`py-1 rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            theme === 'light'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                          title="Set Light mode"
                        >
                          <Sun className="w-3 h-3 text-amber-500" />
                          <span>Light</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={`py-1 rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            theme === 'dark'
                              ? 'bg-slate-800 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                          title="Set Dark mode"
                        >
                          <Moon className="w-3 h-3 text-amber-400" />
                          <span>Dark</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme('system')}
                          className={`py-1 rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            theme === 'system'
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                          title="Sync with System OS"
                        >
                          <Monitor className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Auto</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Primary Settings Actions */}
                  <div className="py-1.5 space-y-0.5">
                    {/* ALL APP SETTINGS - PRIMARY ACTION */}
                    <button
                      type="button"
                      onClick={() => openSettingsTab('account')}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors text-left cursor-pointer group border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <Settings className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>All App Settings</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    {/* APPEARANCE & THEME DIRECT SHORTCUT */}
                    <button
                      type="button"
                      onClick={() => openSettingsTab('appearance')}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        {isDark ? (
                          <Moon className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Sun className="w-4 h-4 text-amber-500" />
                        )}
                        <span>Display & Theme</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 capitalize bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-md">
                        {theme}
                      </span>
                    </button>

                    {currentUser && onViewOwnProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onViewOwnProfile();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          <span>View & Edit Profile</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}

                    {/* SWITCH ACCOUNT ACTION */}
                    {currentUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setShowSwitchPicker(true);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:text-sky-900 dark:hover:text-sky-300 transition-colors text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <RefreshCw className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          <span className="font-bold">Switch Account</span>
                        </div>
                        <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/80 px-1.5 py-0.2 rounded-md border border-sky-200 dark:border-sky-800">
                          Google / Email
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openSettingsTab('location')}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>County & Devolution</span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[100px]">
                        {userProfile?.county || 'Nairobi'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openSettingsTab('notifications')}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Bell className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span>Alerts & Sound Chimes</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={() => openSettingsTab('privacy')}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Safety & Blocklist</span>
                      </div>
                      {blockedUserIds.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-md">
                          {blockedUserIds.length} blocked
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => openSettingsTab('storage')}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span>Storage & Data Saver</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    {/* Developer Control Panel shortcut if verified developer */}
                    {isDev && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setActiveTab('dev-panel');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>Developer Control Panel</span>
                        </div>
                        {pendingReportsCount > 0 && (
                          <span className="bg-rose-600 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full">
                            {pendingReportsCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Log Out Action */}
                  {currentUser && (
                    <div className="pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setShowLogoutConfirm(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* COMPREHENSIVE APP SETTINGS MODAL */}
      <AppSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
        onOpenProfile={onViewOwnProfile}
        onNavigateToDevPanel={() => setActiveTab('dev-panel')}
      />

      {/* QUICK SUB-MODAL: SWITCH ACCOUNT PICKER */}
      {showSwitchPicker && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowSwitchPicker(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 flex items-center justify-center mx-auto border border-sky-200 dark:border-sky-800">
              <RefreshCw className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Switch Citizen Account</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Choose how you would like to sign in to your other account.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => handleExecuteSwitch('google')}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Switch with Google Account</span>
              </button>

              <button
                type="button"
                disabled={isSwitching}
                onClick={() => handleExecuteSwitch('email')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>Switch with Email & Password</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSwitchPicker(false)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK SUB-MODAL: LOGOUT CONFIRMATION */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-rose-200 dark:border-rose-900/60 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800">
              <LogOut className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Log Out of TUJUANE?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your online citizen status will be marked offline. You can sign back in anytime.
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Stay Logged In
              </button>

              <button
                type="button"
                onClick={handleExecuteLogout}
                className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
