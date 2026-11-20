import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Heart,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  UserPlus,
  UserCheck,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Shield,
  Award,
  AlertCircle,
  ThumbsUp,
  Flame,
  Check,
  Volume2,
  VolumeX,
  Send,
  Settings,
  Sliders,
  CheckCircle2,
  Info,
  Radio,
  Wifi,
  RefreshCw,
  AtSign
} from 'lucide-react';
import {
  UserNotification,
  AccountStandingSummary,
  NotificationFilterType,
  NotificationPreferences,
  NotificationType
} from '../types/notification';
import {
  markNotificationAsRead,
  markAllUserNotificationsAsRead,
  deleteUserNotification,
  clearAllUserNotifications
} from '../services/userNotificationService';
import { notificationService } from '../services/notificationService';
import {
  registerBackgroundNotificationTasks,
  triggerImmediateSWNotificationCheck,
  BackgroundSyncCapabilities
} from '../services/backgroundNotificationSync';
import { acceptFriendRequest } from '../services/socialService';
import { useAuth } from '../context/AuthContext';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: UserNotification[];
  accountStanding?: AccountStandingSummary | null;
  onSelectPost?: (postId: string) => void;
  onViewUserProfile?: (userId: string, userName: string) => void;
  onStartDirectChat?: (userId: string, userName: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications = [],
  accountStanding,
  onSelectPost,
  onViewUserProfile,
  onStartDirectChat
}) => {
  const { currentUser, updateFullProfile } = useAuth();
  const [activeFilter, setActiveFilter] = useState<NotificationFilterType>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(() =>
    notificationService.getNotificationPreferences()
  );
  const [showPreferences, setShowPreferences] = useState(false);
  const [testNotificationFeedback, setTestNotificationFeedback] = useState<string | null>(null);
  const [acceptedRequests, setAcceptedRequests] = useState<Record<string, boolean>>({});
  const [bgCapabilities, setBgCapabilities] = useState<BackgroundSyncCapabilities | null>(null);

  // Initialize permission and audio preferences
  useEffect(() => {
    if (isOpen) {
      setPermissionStatus(notificationService.getPermissionStatus());
      const currentPrefs = notificationService.getNotificationPreferences();
      setPreferences(currentPrefs);
      setSoundEnabled(currentPrefs.soundEnabled);
      void registerBackgroundNotificationTasks().then(setBgCapabilities);
    }
  }, [isOpen]);

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

  const effectiveStanding: AccountStandingSummary = accountStanding || {
    status: 'good',
    title: 'Kenya Citizen in Good Standing',
    description: 'Your account is in full compliance with TUJUANE Community Guidelines.',
    verifiedCitizen: true,
    score: 100,
    warningCount: 0,
    advisoryCount: 0,
    totalPosts: 0,
    totalUpvotes: 0
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Granular counts for filter tabs
  const countByType = useMemo(() => {
    const counts = {
      all: notifications.length,
      post_like: 0,
      post_comment: 0,
      profile_tag: 0,
      direct_message: 0,
      friend_request: 0,
      new_follower: 0,
      account_status: 0,
      safety: 0
    };

    notifications.forEach((n) => {
      if (n.type === 'post_like') counts.post_like++;
      else if (n.type === 'post_comment') counts.post_comment++;
      else if (n.type === 'profile_tag') counts.profile_tag++;
      else if (n.type === 'direct_message') counts.direct_message++;
      else if (n.type === 'friend_request' || n.type === 'friend_request_accepted') counts.friend_request++;
      else if (n.type === 'new_follower') counts.new_follower++;
      else if (n.type === 'account_status' || n.type === 'account_verified' || n.type === 'account_good_standing') {
        counts.account_status++;
      } else if (
        n.type === 'post_advisory' ||
        n.type === 'account_warning' ||
        n.type === 'post_removed' ||
        n.type === 'post_approved'
      ) {
        counts.safety++;
      }
    });

    return counts;
  }, [notifications]);

  // Filtered list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (unreadOnly && n.read) return false;

      switch (activeFilter) {
        case 'post_like':
          return n.type === 'post_like';
        case 'post_comment':
          return n.type === 'post_comment';
        case 'profile_tag':
          return n.type === 'profile_tag';
        case 'direct_message':
          return n.type === 'direct_message';
        case 'friend_request':
          return n.type === 'friend_request' || n.type === 'friend_request_accepted';
        case 'new_follower':
          return n.type === 'new_follower';
        case 'account_status':
          return (
            n.type === 'account_status' ||
            n.type === 'account_verified' ||
            n.type === 'account_good_standing'
          );
        case 'safety':
          return (
            n.type === 'post_advisory' ||
            n.type === 'account_warning' ||
            n.type === 'post_removed' ||
            n.type === 'post_approved'
          );
        case 'all':
        default:
          return true;
      }
    });
  }, [notifications, activeFilter, unreadOnly]);

  const handleRequestPushPermission = async () => {
    const status = await notificationService.requestDesktopPermission();
    setPermissionStatus(status);
    if (status === 'granted') {
      const caps = await notificationService.enableAlwaysOnBackgroundAlerts();
      setBgCapabilities(caps);
      const updated = notificationService.saveNotificationPreferences({
        pushEnabled: true,
        backgroundAlertsEnabled: true
      });
      setPreferences(updated);
      if (currentUser) {
        void updateFullProfile({ backgroundAlertsEnabled: true }).catch(() => {});
      }
      setTestNotificationFeedback('Always-on background notifications activated!');
      setTimeout(() => setTestNotificationFeedback(null), 4000);
    }
  };

  const handleToggleAlwaysOnAlerts = async () => {
    const next = !preferences.backgroundAlertsEnabled;
    if (next) {
      const caps = await notificationService.enableAlwaysOnBackgroundAlerts();
      setBgCapabilities(caps);
      setPermissionStatus(caps.permission);
      const updated = notificationService.saveNotificationPreferences({
        backgroundAlertsEnabled: true,
        pushEnabled: caps.permission === 'granted' ? true : preferences.pushEnabled
      });
      setPreferences(updated);
      if (currentUser) {
        void updateFullProfile({ backgroundAlertsEnabled: true }).catch(() => {});
      }
      setTestNotificationFeedback(
        caps.permission === 'granted'
          ? 'Always-on online alerts armed! You will receive alerts even when the app is closed.'
          : 'Grant browser notification permission above to receive alerts when app is closed.'
      );
    } else {
      const updated = notificationService.saveNotificationPreferences({
        backgroundAlertsEnabled: false
      });
      setPreferences(updated);
      if (currentUser) {
        void updateFullProfile({ backgroundAlertsEnabled: false }).catch(() => {});
      }
      setTestNotificationFeedback('Background online alerts paused while app is closed.');
    }
    setTimeout(() => setTestNotificationFeedback(null), 4500);
  };

  const handleToggleSound = () => {
    const nextState = notificationService.toggleSound();
    setSoundEnabled(nextState);
    const updated = notificationService.getNotificationPreferences();
    setPreferences(updated);
  };

  const handleToggleTypePreference = (typeKey: keyof NotificationPreferences['typePreferences']) => {
    const currentVal = preferences.typePreferences[typeKey];
    const updated = notificationService.saveNotificationPreferences({
      typePreferences: {
        ...preferences.typePreferences,
        [typeKey]: !currentVal
      }
    });
    setPreferences(updated);
  };

  const handleTestNotification = async () => {
    const res = await notificationService.testPushNotification();
    setPermissionStatus(res.permission);
    await triggerImmediateSWNotificationCheck();
    if (res.permission === 'granted') {
      setTestNotificationFeedback('Chime sounded, desktop push alert dispatched & SW background sync verified!');
    } else {
      setTestNotificationFeedback('Audio chime played! Enable push above for background & desktop banners.');
    }
    setTimeout(() => setTestNotificationFeedback(null), 4000);
  };

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    setIsProcessing(true);
    try {
      await markAllUserNotificationsAsRead(currentUser.uid);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = async () => {
    if (!currentUser) return;
    if (window.confirm('Clear all notifications in this channel?')) {
      setIsProcessing(true);
      try {
        await clearAllUserNotifications(currentUser.uid);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleNotificationClick = async (notif: UserNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }

    if (notif.type === 'direct_message' && notif.actorId && onStartDirectChat) {
      onStartDirectChat(notif.actorId, notif.actorName || 'Citizen');
      onClose();
    } else if (notif.postId && onSelectPost) {
      onSelectPost(notif.postId);
      onClose();
    } else if (notif.actorId && onViewUserProfile) {
      onViewUserProfile(notif.actorId, notif.actorName || 'Citizen');
      onClose();
    }
  };

  const handleAcceptConnection = async (e: React.MouseEvent, notif: UserNotification) => {
    e.stopPropagation();
    if (!notif.details) return;
    try {
      await acceptFriendRequest(notif.details);
      setAcceptedRequests((prev) => ({ ...prev, [notif.id]: true }));
      if (!notif.read) {
        await markNotificationAsRead(notif.id);
      }
    } catch (err) {
      console.warn('Failed to accept request:', err);
    }
  };

  const formatTimeAgo = (isoString: string) => {
    try {
      const now = new Date();
      const past = new Date(isoString);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  };

  // Distinct type pill badge with color, icon and label
  const renderNotificationTypeBadge = (type: NotificationType) => {
    switch (type) {
      case 'direct_message':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
            <Send className="w-3 h-3 text-sky-600" />
            <span>Direct Message</span>
          </span>
        );
      case 'post_like':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
            <span>Post Upvote</span>
          </span>
        );
      case 'post_comment':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <MessageSquare className="w-3 h-3 text-blue-600" />
            <span>Discussion Reply</span>
          </span>
        );
      case 'friend_request':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <UserPlus className="w-3 h-3 text-indigo-600" />
            <span>Friend Request</span>
          </span>
        );
      case 'friend_request_accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <UserCheck className="w-3 h-3 text-emerald-600" />
            <span>Connected</span>
          </span>
        );
      case 'new_follower':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <ThumbsUp className="w-3 h-3 text-teal-600" />
            <span>New Follower</span>
          </span>
        );
      case 'profile_tag':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
            <AtSign className="w-3 h-3 text-violet-600" />
            <span>Tagged You</span>
          </span>
        );
      case 'account_verified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>Verified Citizen</span>
          </span>
        );
      case 'account_good_standing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Good Standing</span>
          </span>
        );
      case 'account_warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>Account Notice</span>
          </span>
        );
      case 'post_advisory':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <ShieldAlert className="w-3 h-3 text-amber-600" />
            <span>Safety Advisory</span>
          </span>
        );
      case 'post_removed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Post Removed</span>
          </span>
        );
      case 'post_approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Post Approved</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            <Bell className="w-3 h-3 text-slate-500" />
            <span>Alert</span>
          </span>
        );
    }
  };

  const getNotificationIcon = (notif: UserNotification) => {
    switch (notif.type) {
      case 'direct_message':
        return (
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 shadow-xs border border-sky-200">
            <Send className="w-4 h-4" />
          </div>
        );
      case 'post_like':
        return (
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-xs border border-rose-200">
            <Heart className="w-4 h-4 fill-rose-500" />
          </div>
        );
      case 'post_comment':
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-xs border border-blue-200">
            <MessageSquare className="w-4 h-4" />
          </div>
        );
      case 'friend_request':
        return (
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs border border-indigo-200">
            <UserPlus className="w-4 h-4" />
          </div>
        );
      case 'friend_request_accepted':
        return (
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs border border-emerald-200">
            <UserCheck className="w-4 h-4" />
          </div>
        );
      case 'new_follower':
        return (
          <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 shadow-xs border border-teal-200">
            <ThumbsUp className="w-4 h-4" />
          </div>
        );
      case 'profile_tag':
        return (
          <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 shadow-xs border border-violet-200">
            <AtSign className="w-4 h-4" />
          </div>
        );
      case 'account_verified':
        return (
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-xs border border-purple-200">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      case 'account_good_standing':
        return (
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs border border-emerald-200">
            <Shield className="w-4 h-4" />
          </div>
        );
      case 'post_advisory':
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs border border-amber-200">
            <ShieldAlert className="w-4 h-4" />
          </div>
        );
      case 'account_warning':
      case 'post_removed':
        return (
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-xs border border-rose-200">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
            <Bell className="w-4 h-4" />
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Modal Top Header - ONLY NOTIFICATIONS */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <h2 className="text-base sm:text-lg font-black tracking-wide text-slate-900 dark:text-white uppercase">
            NOTIFICATIONS
          </h2>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
            title="Close notifications (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Single-Row Filter Strip */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold no-scrollbar py-0.5 max-w-full">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'all'
                  ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>All</span>
              <span className="text-[10px] opacity-80 font-mono">({countByType.all})</span>
            </button>

            <button
              onClick={() => setActiveFilter('profile_tag')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'profile_tag'
                  ? 'bg-violet-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <AtSign className="w-3 h-3 text-violet-500" />
              <span>Tags</span>
              {countByType.profile_tag > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-violet-200/40 dark:bg-violet-900/60">
                  {countByType.profile_tag}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('direct_message')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'direct_message'
                  ? 'bg-sky-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Send className="w-3 h-3 text-sky-500" />
              <span>Chats</span>
              {countByType.direct_message > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-sky-200/40 dark:bg-sky-900/60">
                  {countByType.direct_message}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('post_like')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'post_like'
                  ? 'bg-rose-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
              <span>Likes</span>
              {countByType.post_like > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-rose-200/40 dark:bg-rose-900/60">
                  {countByType.post_like}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('post_comment')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'post_comment'
                  ? 'bg-blue-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <MessageSquare className="w-3 h-3 text-blue-500" />
              <span>Replies</span>
              {countByType.post_comment > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-blue-200/40 dark:bg-blue-900/60">
                  {countByType.post_comment}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('friend_request')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'friend_request'
                  ? 'bg-indigo-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <UserPlus className="w-3 h-3 text-indigo-500" />
              <span>Requests</span>
              {countByType.friend_request > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-indigo-200/40 dark:bg-indigo-900/60">
                  {countByType.friend_request}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('new_follower')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'new_follower'
                  ? 'bg-teal-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <ThumbsUp className="w-3 h-3 text-teal-500" />
              <span>Followers</span>
              {countByType.new_follower > 0 && (
                <span className="text-[10px] font-mono px-1 rounded-full bg-teal-200/40 dark:bg-teal-900/60">
                  {countByType.new_follower}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('account_status')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'account_status'
                  ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Trust</span>
            </button>

            <button
              onClick={() => setActiveFilter('safety')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'safety'
                  ? 'bg-amber-700 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Safety</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-xs shrink-0">
            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Unread only</span>
            </label>

            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                title="Clear all notifications"
                aria-label="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Notifications Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No notifications in this filter
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {unreadOnly
                  ? 'No unread alerts in this category. You are fully up to date!'
                  : 'Start a discussion, chat with citizens, or share local county updates to see real-time activity here.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 transition-colors flex items-start gap-3.5 cursor-pointer relative group ${
                  notif.read ? 'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60' : 'bg-emerald-50/40 dark:bg-emerald-950/30 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/50'
                }`}
              >
                {/* Unread indicator bar */}
                {!notif.read && (
                  <span className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-600 rounded-r" />
                )}

                {/* Leading icon */}
                {getNotificationIcon(notif)}

                {/* Content body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {/* Granular notification type badge */}
                      {renderNotificationTypeBadge(notif.type)}

                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {notif.title}
                      </span>

                      {notif.actorCounty && (
                        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-md">
                          {notif.actorCounty}
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {notif.category === 'direct_chat' || notif.type === 'direct_message'
                      ? 'Sent you a new private message. Tap below to open chat.'
                      : notif.message}
                  </p>

                  {/* Context snippet if attached */}
                  {notif.postTitle && (
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 max-w-full truncate border border-slate-200 dark:border-slate-700">
                      <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">{notif.postTitle}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </div>
                  )}

                  {/* Type-Specific Action Row */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Direct Message Action */}
                      {notif.type === 'direct_message' && notif.actorId && onStartDirectChat && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartDirectChat(notif.actorId!, notif.actorName || 'Citizen');
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Reply in Chat</span>
                        </button>
                      )}

                      {/* Friend Request Actions */}
                      {notif.type === 'friend_request' && notif.details && (
                        <>
                          {acceptedRequests[notif.id] ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                              <Check className="w-3.5 h-3.5" />
                              <span>Connected</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleAcceptConnection(e, notif)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Accept Connection</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* View Profile Action */}
                      {notif.actorId && notif.type !== 'post_like' && notif.type !== 'post_comment' && onViewUserProfile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewUserProfile(notif.actorId!, notif.actorName || 'Citizen');
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
                        >
                          <span>View Profile</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* View Post Discussion Action */}
                      {notif.postId && (
                        <span className="font-semibold text-emerald-700 flex items-center gap-0.5 group-hover:underline">
                          <span>View Discussion</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Secondary Actions: Mark Read & Delete */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markNotificationAsRead(notif.id);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 transition-colors"
                          title="Mark read"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteUserNotification(notif.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Delete notification"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read ({unreadCount})</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 text-white font-bold transition-all cursor-pointer shadow-xs"
            title="Close notifications"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
