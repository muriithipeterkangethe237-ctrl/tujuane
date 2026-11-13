import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  User,
  LogOut,
  RefreshCw,
  MapPin,
  Bell,
  Volume2,
  VolumeX,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Database,
  Check,
  ChevronRight,
  HelpCircle,
  AlertTriangle,
  UserX,
  Eye,
  Info,
  Lock,
  Sparkles,
  ExternalLink,
  Trash2,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { KenyanFlagWave } from './KenyanFlagTheme';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../data/kenyaCounties';
import { notificationService } from '../services/notificationService';
import { NotificationPreferences } from '../types/notification';
import { usePWAInstall } from '../hooks/usePWAInstall';

export type SettingsModalTab = 'account' | 'appearance' | 'location' | 'notifications' | 'privacy' | 'storage' | 'about';

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProfile?: () => void;
  onNavigateToDevPanel?: () => void;
  initialTab?: SettingsModalTab;
}

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenProfile,
  onNavigateToDevPanel,
  initialTab = 'account'
}) => {
  const {
    currentUser,
    userProfile,
    logout,
    switchAccount,
    openAuthModal,
    updateUserLocation,
    blockedUserIds,
    mutedUserIds,
    unblockUser,
    unmuteUser
  } = useAuth();

  const { theme, setTheme, isDark, isKenyaTheme, toggleTheme } = useTheme();
  const { isInstallable, isInstalled, install: installApp } = usePWAInstall();

  // Active settings section
  const [activeTab, setActiveTab] = useState<SettingsModalTab>(initialTab);

  // Switch account confirmation modal / picker
  const [showSwitchPicker, setShowSwitchPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Location settings
  const [selectedCounty, setSelectedCounty] = useState(userProfile?.county || 'Nairobi');
  const [selectedConstituency, setSelectedConstituency] = useState(userProfile?.constituency || '');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [locationSavedToast, setLocationSavedToast] = useState(false);

  // Notification settings
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    notificationService.getNotificationPreferences()
  );
  const [notifSoundEnabled, setNotifSoundEnabled] = useState<boolean>(
    notificationService.getNotificationPreferences().soundEnabled
  );

  // Data saver setting (persisted locally)
  const [dataSaverEnabled, setDataSaverEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tujuane_data_saver') === 'true';
    }
    return false;
  });

  // Feed preference: default to my county vs all counties
  const [feedCountyOnly, setFeedCountyOnly] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tujuane_feed_county_only') === 'true';
    }
    return false;
  });

  const [cacheCleared, setCacheCleared] = useState(false);
  const isDev = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  // Update form states when userProfile changes
  useEffect(() => {
    if (userProfile) {
      if (userProfile.county) setSelectedCounty(userProfile.county);
      if (userProfile.constituency) setSelectedConstituency(userProfile.constituency);
    }
  }, [userProfile]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setNotifPrefs(notificationService.getNotificationPreferences());
      setNotifSoundEnabled(notificationService.getNotificationPreferences().soundEnabled);
    }
  }, [isOpen, initialTab]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showSwitchPicker) {
          setShowSwitchPicker(false);
        } else if (showLogoutConfirm) {
          setShowLogoutConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSwitchPicker, showLogoutConfirm, onClose]);

  if (!isOpen) return null;

  const availableConstituencies = getConstituenciesByCounty(selectedCounty);

  // Location handler
  const handleSaveLocation = async () => {
    if (!currentUser) return;
    setIsSavingLocation(true);
    try {
      await updateUserLocation(selectedCounty, selectedConstituency);
      setLocationSavedToast(true);
      setTimeout(() => setLocationSavedToast(false), 3000);
    } catch (err) {
      console.error('Failed to update location:', err);
    } finally {
      setIsSavingLocation(false);
    }
  };

  // Notification sound toggle
  const handleToggleSound = () => {
    const next = notificationService.toggleSound();
    setNotifSoundEnabled(next);
    setNotifPrefs(notificationService.getNotificationPreferences());
  };

  // Notification type toggle
  const handleToggleNotifType = (key: keyof NotificationPreferences['typePreferences']) => {
    const current = notifPrefs.typePreferences[key] ?? true;
    const updated = notificationService.saveNotificationPreferences({
      typePreferences: {
        ...notifPrefs.typePreferences,
        [key]: !current
      }
    });
    setNotifPrefs(updated);
  };

  // Switch account action
  const handleExecuteSwitch = async (mode: 'google' | 'email') => {
    setIsSwitching(true);
    try {
      await switchAccount(mode);
      setShowSwitchPicker(false);
      onClose();
    } catch (err) {
      console.error('Error switching account:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Logout action
  const handleExecuteLogout = async () => {
    try {
      await logout();
      setShowLogoutConfirm(false);
      onClose();
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  // Data saver toggle
  const handleToggleDataSaver = () => {
    const next = !dataSaverEnabled;
    setDataSaverEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tujuane_data_saver', String(next));
    }
  };

  // Feed scope toggle
  const handleToggleFeedCountyOnly = () => {
    const next = !feedCountyOnly;
    setFeedCountyOnly(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tujuane_feed_county_only', String(next));
    }
  };

  // Clear local cache
  const handleClearCache = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tujuane_posts_cache');
        localStorage.removeItem('tujuane_in_app_notifications');
        sessionStorage.clear();
      }
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    } catch (err) {
      console.warn('Cache clear error:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full h-[90vh] max-h-[720px] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Settings className="w-4 h-4 text-emerald-400 dark:text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>App Settings & Preferences</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure theme, account standing, devolution preferences, and security</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close settings"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with Sidebar Tabs */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Navigation Sidebar */}
          <nav className="sm:w-52 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 p-2 sm:p-3 bg-slate-50/50 dark:bg-slate-900/60 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto shrink-0">
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-4 h-4 shrink-0" />
              <span>Account & Login</span>
            </button>

            {/* DISPLAY & NIGHT-TIME THEME TAB */}
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'appearance'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {isDark ? (
                  <Moon className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span>Display & Theme</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-black uppercase ${
                activeTab === 'appearance'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {theme}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('location')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'location'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span>County & Devolution</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>Alerts & Sounds</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Safety & Blocklist</span>
              {blockedUserIds.length > 0 && (
                <span className="ml-auto bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {blockedUserIds.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'storage'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span>Storage & Data</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                activeTab === 'about'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Info className="w-4 h-4 shrink-0" />
              <span>About TUJUANE</span>
            </button>

            {/* Quick dev panel entry if developer */}
            {isDev && onNavigateToDevPanel && (
              <div className="pt-2 mt-auto hidden sm:block border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToDevPanel();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Developer Panel</span>
                </button>
              </div>
            )}
          </nav>

          {/* Active Tab Content Area */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
            {/* TAB 1: ACCOUNT & IDENTITY */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Citizen Identity & Session Management</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Manage your authenticated citizen session, switch between Google or email profiles, or sign out.
                  </p>
                </div>

                {currentUser ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3.5">
                      {userProfile?.photoURL ? (
                        <img
                          src={userProfile.photoURL}
                          alt={userProfile.displayName}
                          className="w-14 h-14 rounded-2xl object-cover ring-2 ring-emerald-500/30 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 font-black text-xl flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800">
                          {userProfile?.displayName?.charAt(0) || currentUser.displayName?.charAt(0) || 'C'}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                            {userProfile?.displayName || currentUser.displayName || 'Citizen Member'}
                          </h4>
                          {isDev && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              Developer
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {currentUser.email || 'Authenticated Citizen'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          County: <span className="text-slate-700 dark:text-slate-300 font-semibold">{userProfile?.county || 'Nairobi'}</span>
                          {userProfile?.constituency ? ` • ${userProfile.constituency}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                      {onOpenProfile && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenProfile();
                          }}
                          className="py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Edit Full Profile</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowSwitchPicker(true)}
                        className="py-2.5 px-3 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-900 dark:text-sky-300 font-bold text-xs rounded-xl border border-sky-200 dark:border-sky-800 shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <span>Switch Account</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(true)}
                        className="sm:col-span-2 py-2.5 px-3 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-800 dark:text-rose-300 font-bold text-xs rounded-xl border border-rose-200 dark:border-rose-800 shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Log Out of TUJUANE</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 flex items-center justify-center mx-auto border border-emerald-300 dark:border-emerald-800">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">You are browsing as Guest Citizen</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                        Sign in to publish discussions, cast your daily poll votes, send direct messages, and personalize your county hub.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openAuthModal('signin');
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        Sign In Existing Account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openAuthModal('register');
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        Register New Citizen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DISPLAY & NIGHT-TIME THEME */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    {isDark ? (
                      <Moon className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-500" />
                    )}
                    <span>Display & Night-Time Themes</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Switch between light and dark themes for better night-time usage, AMOLED battery conservation, and reduced eye fatigue.
                  </p>
                </div>

                {/* Quick Toggle Master Switch */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden ${
                      isKenyaTheme
                        ? 'bg-slate-950 border-emerald-500/40'
                        : isDark
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                      {isKenyaTheme ? (
                        <KenyanFlagWave className="w-full h-full" />
                      ) : isDark ? (
                        <Moon className="w-5 h-5" />
                      ) : (
                        <Sun className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Night Mode Quick Switch</span>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                          isDark
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {isKenyaTheme ? 'Kenyan Flag Active' : isDark ? 'Dark Active' : 'Light Active'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isKenyaTheme
                          ? 'Animated Kenyan flag heritage backdrop paired with high-contrast dark surfaces.'
                          : isDark
                            ? 'Deep contrast dark theme active — comfortable for bedtime reading and night shifts.'
                            : 'Bright daylight theme active — high contrast for outdoor and sunlight readability.'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDark ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    title="Toggle Dark Mode"
                    aria-label="Toggle dark mode"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isDark ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 4 Selectable Theme Cards */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                    Select Theme Preference
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* OPTION 1: LIGHT THEME */}
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full group ${
                        theme === 'light'
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div>
                        {/* Theme Preview Box */}
                        <div className="w-full h-16 rounded-xl bg-slate-50 border border-slate-200 p-2 mb-3 flex flex-col justify-between overflow-hidden shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="w-12 h-2 rounded bg-slate-300" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="w-3/4 h-1.5 rounded bg-slate-300" />
                            <div className="w-1/2 h-1.5 rounded bg-slate-200" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900 dark:text-white">
                            <Sun className="w-3.5 h-3.5 text-amber-500" />
                            <span>Light Mode</span>
                          </div>
                          {theme === 'light' && (
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          Daylight clarity, high contrast text, and vibrant Kenya green highlights.
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        Best for bright daytime
                      </div>
                    </button>

                    {/* OPTION 2: DARK THEME */}
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full group ${
                        theme === 'dark'
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div>
                        {/* Theme Preview Box */}
                        <div className="w-full h-16 rounded-xl bg-slate-950 border border-slate-800 p-2 mb-3 flex flex-col justify-between overflow-hidden shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="w-12 h-2 rounded bg-slate-700" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="w-3/4 h-1.5 rounded bg-slate-700" />
                            <div className="w-1/2 h-1.5 rounded bg-slate-800" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900 dark:text-white">
                            <Moon className="w-3.5 h-3.5 text-amber-400" />
                            <span>Dark Mode</span>
                          </div>
                          {theme === 'dark' && (
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          Deep OLED slate, eliminates glare, prevents eye fatigue in dark rooms.
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        Recommended for night
                      </div>
                    </button>

                    {/* OPTION 3: SYSTEM AUTO */}
                    <button
                      type="button"
                      onClick={() => setTheme('system')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full group ${
                        theme === 'system'
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div>
                        {/* Theme Preview Box (Split) */}
                        <div className="w-full h-16 rounded-xl border border-slate-300 dark:border-slate-700 mb-3 flex overflow-hidden shadow-2xs">
                          <div className="w-1/2 h-full bg-slate-50 p-1.5 flex flex-col justify-between">
                            <div className="w-8 h-1.5 rounded bg-slate-300" />
                            <div className="w-6 h-1 rounded bg-slate-200" />
                          </div>
                          <div className="w-1/2 h-full bg-slate-950 p-1.5 flex flex-col justify-between">
                            <div className="w-8 h-1.5 rounded bg-slate-700 ml-auto" />
                            <div className="w-6 h-1 rounded bg-slate-800 ml-auto" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900 dark:text-white">
                            <Monitor className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>System Auto</span>
                          </div>
                          {theme === 'system' && (
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          Automatically synchronizes with your device's operating system schedule.
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        Follows device OS
                      </div>
                    </button>

                    {/* OPTION 4: KENYAN FLAG (ANIMATED) */}
                    <button
                      type="button"
                      onClick={() => setTheme('kenya')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full group ${
                        theme === 'kenya'
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/50 border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div>
                        {/* Animated Kenyan Flag Preview Box */}
                        <div className="w-full h-16 rounded-xl border border-slate-300 dark:border-white/15 mb-3 overflow-hidden shadow-2xs relative">
                          <KenyanFlagWave className="w-full h-full" animated={true} showSheen={true} />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900 dark:text-white">
                            <span
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm overflow-hidden border border-white/20 shrink-0"
                              aria-hidden="true"
                            >
                              <KenyanFlagWave className="w-full h-full" animated={false} showSheen={false} />
                            </span>
                            <span>Kenyan Flag</span>
                          </div>
                          {theme === 'kenya' && (
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          Animated waving Kenyan flag backdrop in obsidian black, crimson & Maasai green.
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        Animated heritage theme
                      </div>
                    </button>
                  </div>
                </div>

                {/* Night-time Usage Tips Box */}
                <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Night-Time Browsing & Battery Optimization</span>
                  </div>
                  <ul className="text-[11px] text-emerald-900/90 dark:text-emerald-300/90 space-y-1 list-disc list-inside leading-relaxed">
                    <li><strong>Less Blue Glare</strong>: Softens community posts, replies, and polls when reading in dim lighting.</li>
                    <li><strong>Battery Conservation</strong>: True dark backgrounds consume significantly less power on smartphone AMOLED screens.</li>
                    <li><strong>Instant Persistence</strong>: Your theme preference is preserved permanently on this device.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 3: COUNTY & DEVOLUTION */}
            {activeTab === 'location' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Home County & Devolution Scope</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Set your permanent county and constituency so local community discussions, speed alerts, and polls automatically tailor to your locality.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Home County (47 Counties of Kenya)
                    </label>
                    <select
                      value={selectedCounty}
                      onChange={(e) => {
                        setSelectedCounty(e.target.value);
                        setSelectedConstituency('');
                      }}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                      Local Constituency
                    </label>
                    <select
                      value={selectedConstituency}
                      onChange={(e) => setSelectedConstituency(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">All Constituencies in {selectedCounty}</option>
                      {availableConstituencies.map((constituency) => (
                        <option key={constituency} value={constituency}>
                          {constituency}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Devolution Feed Preference */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Auto-Filter Feed to Home County</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Automatically focus discussion feeds on {selectedCounty} County first.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={feedCountyOnly}
                        onChange={handleToggleFeedCountyOnly}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  {currentUser ? (
                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                        {locationSavedToast && '✓ Saved to your citizen profile!'}
                      </span>
                      <button
                        type="button"
                        disabled={isSavingLocation}
                        onClick={handleSaveLocation}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingLocation ? 'Updating...' : 'Save County Preference'}</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      Note: Sign in to synchronize your county permanently across devices.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: NOTIFICATIONS & SOUNDS */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Notification & Audio Preferences</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Customize sound chimes, in-app badges, and event triggers for social engagement.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Master Sound Chime Toggle */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        notifSoundEnabled ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {notifSoundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">Audio Chimes & Message Sounds</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Play pleasant audio chime when new direct messages or replies arrive.</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleSound}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        notifSoundEnabled
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {notifSoundEnabled ? 'Sound On' : 'Muted'}
                    </button>
                  </div>

                  {/* Individual Notification Triggers */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-3">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                      Notification Channel Triggers
                    </div>

                    <label className="flex items-center justify-between cursor-pointer py-1">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">1-on-1 Direct Messages</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Alerts when community citizens send private direct messages.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.typePreferences.direct_message ?? true}
                        onChange={() => handleToggleNotifType('direct_message')}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Post Comments & Replies</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Notify when citizens reply to your discussion posts.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.typePreferences.post_comment ?? true}
                        onChange={() => handleToggleNotifType('post_comment')}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Likes & Civic Recommendations</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Notify when citizens like your updates or tips.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.typePreferences.post_like ?? true}
                        onChange={() => handleToggleNotifType('post_like')}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Friend Requests & New Followers</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Alerts for inbound connection requests.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.typePreferences.friend_request ?? true}
                        onChange={() => handleToggleNotifType('friend_request')}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Safety Advisories & Account Standing</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Important safety notices and verified badge awards.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.typePreferences.account_status ?? true}
                        onChange={() => handleToggleNotifType('account_status')}
                        className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: SAFETY & BLOCKLIST */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Safety, Privacy & Blocked Accounts</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Review accounts you have blocked or muted, and verify privacy boundaries.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Blocked Accounts Section */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Blocked Citizens</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {blockedUserIds.length} Blocked
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Blocked users cannot send you 1-on-1 direct messages, and their posts are filtered out from your community feed.
                    </p>

                    {blockedUserIds.length === 0 ? (
                      <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-center text-xs text-slate-400">
                        You have not blocked any citizen accounts.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {blockedUserIds.map((uid) => (
                          <div key={uid} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                            <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                              ID: {uid.slice(0, 16)}...
                            </span>
                            <button
                              type="button"
                              onClick={() => unblockUser(uid)}
                              className="px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer transition-colors"
                            >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Muted Accounts Section */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <VolumeX className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Muted Notification Accounts</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {mutedUserIds.length} Muted
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Muted users can still participate, but their notifications will not ring or trigger banners.
                    </p>

                    {mutedUserIds.length === 0 ? (
                      <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-center text-xs text-slate-400">
                        You have no muted accounts.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {mutedUserIds.map((uid) => (
                          <div key={uid} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                            <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                              ID: {uid.slice(0, 16)}...
                            </span>
                            <button
                              type="button"
                              onClick={() => unmuteUser(uid)}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-colors"
                            >
                              Unmute
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Kenya Community Standards Card */}
                  <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl flex items-start gap-3">
                    <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-emerald-900 dark:text-emerald-300 leading-relaxed">
                      <strong>TUJUANE Civic Standards</strong>: National cohesion, anti-hate speech, zero fraud/M-Pesa scam tolerance, and respect for all 47 county communities. Offending accounts are subject to timed suspensions or permanent bans.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: STORAGE & DATA SAVER */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Storage, Cache & PWA Offline Status</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Manage progressive web app offline availability, mobile data compression, and local cache.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* PWA Status */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">Phone & Desktop Web App (PWA)</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isInstalled
                            ? '✓ TUJUANE is installed on this device with offline caching active.'
                            : isInstallable
                            ? 'Install as a dedicated mobile web app on your home screen.'
                            : 'App is running in web browser with v4 ServiceWorker offline caching enabled.'}
                        </div>
                      </div>
                    </div>

                    {!isInstalled && isInstallable && (
                      <button
                        type="button"
                        onClick={installApp}
                        className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        Install App
                      </button>
                    )}
                  </div>

                  {/* Data Saver Mode Toggle */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Mobile Data Saver Mode</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Compress community feed media and hotspot photos to load ultra-fast on 2G/3G Safaricom, Airtel, and Telkom connections.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleDataSaver}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        dataSaverEnabled
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {dataSaverEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* Clear Local Cache */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Local Cache & Cached Messages</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Clear temporary browser session data and local feed snapshots without affecting your account.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearCache}
                      className="px-3.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>{cacheCleared ? 'Cleared ✓' : 'Clear Cache'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: ABOUT TUJUANE */}
            {activeTab === 'about' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>About TUJUANE — Kenya Community Network</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Empowering 47 counties through civic engagement, verified community speed reports, and real-time connectivity.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 p-1 border border-emerald-500/40 flex items-center justify-center shadow-md">
                      <div className="w-full h-full rounded-xl bg-linear-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white font-black text-sm">
                        TJ
                      </div>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">TUJUANE Kenya Platform</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Version 2.4.0 • Progressive Web Application</p>
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">Harambee ya Kidijitali na Ugatuzi</p>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <p>
                      TUJUANE is Kenya's national civic connection platform uniting Kenyans across all 47 counties. Share speed reports, explore daily cultural polls, engage in respectful community discussions, and build verified civic networks.
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Built for resilience on mobile networks, with multi-vector Kenyan safety filters to ensure respectful, troll-free civic conversations.
                    </p>
                  </div>

                  {isDev && onNavigateToDevPanel && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl flex items-center justify-between">
                      <div className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                        <span>Platform Administrator Mode Active</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToDevPanel();
                        }}
                        className="px-2.5 py-1 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        Open Dev Panel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <span>TUJUANE Kenya v2.4</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>

      {/* SUB-MODAL: SWITCH ACCOUNT PICKER */}
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
              <RefreshCw className="w-6 h-6 animate-spin-once" />
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

      {/* SUB-MODAL: LOGOUT CONFIRMATION */}
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
    </div>
  );
};
