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
  Check
} from 'lucide-react';
import { UserNotification, AccountStandingSummary } from '../types/notification';
import {
  markNotificationAsRead,
  markAllUserNotificationsAsRead,
  deleteUserNotification,
  clearAllUserNotifications
} from '../services/userNotificationService';
import { useAuth } from '../context/AuthContext';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: UserNotification[];
  accountStanding?: AccountStandingSummary | null;
  onSelectPost?: (postId: string) => void;
  onViewUserProfile?: (userId: string, userName: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  accountStanding,
  onSelectPost,
  onViewUserProfile
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'posts' | 'account' | 'social'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (unreadOnly && n.read) return false;

      if (activeTab === 'posts') {
        return n.category === 'post_interaction';
      }
      if (activeTab === 'account') {
        return n.category === 'account_status';
      }
      if (activeTab === 'social') {
        return n.category === 'social';
      }
      return true;
    });
  }, [notifications, activeTab, unreadOnly]);

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

    if (notif.postId && onSelectPost) {
      onSelectPost(notif.postId);
      onClose();
    } else if (notif.actorId && onViewUserProfile) {
      onViewUserProfile(notif.actorId, notif.actorName || 'Citizen');
      onClose();
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

  const getNotificationIcon = (notif: UserNotification) => {
    switch (notif.type) {
      case 'post_like':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
            <Heart className="w-4 h-4 fill-rose-500" />
          </div>
        );
      case 'post_comment':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
            <MessageSquare className="w-4 h-4" />
          </div>
        );
      case 'post_advisory':
        return (
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-4 h-4" />
          </div>
        );
      case 'post_approved':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
        );
      case 'post_removed':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      case 'account_verified':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      case 'account_warning':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-xs">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      case 'account_good_standing':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-4 h-4" />
          </div>
        );
      case 'friend_request':
        return (
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs">
            <UserPlus className="w-4 h-4" />
          </div>
        );
      case 'friend_request_accepted':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
            <UserCheck className="w-4 h-4" />
          </div>
        );
      case 'new_follower':
        return (
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 shadow-xs">
            <ThumbsUp className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Notification Channel
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white animate-pulse">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Real-time updates on your posts, account standing, and interactions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isProcessing}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer border border-emerald-200"
                title="Mark all notifications as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              aria-label="Close"
              title="Close notifications (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Account Standing Summary Dashboard Card */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white border-b border-slate-800 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md ${
                  effectiveStanding.status === 'warning'
                    ? 'bg-rose-600 ring-2 ring-rose-400'
                    : effectiveStanding.status === 'verified'
                    ? 'bg-purple-600 ring-2 ring-purple-400'
                    : 'bg-emerald-600 ring-2 ring-emerald-400'
                }`}
              >
                {effectiveStanding.status === 'warning' ? (
                  <AlertCircle className="w-5 h-5" />
                ) : effectiveStanding.status === 'verified' ? (
                  <Award className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight">
                    {effectiveStanding.title}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      effectiveStanding.status === 'warning'
                        ? 'bg-rose-500/30 text-rose-200 border border-rose-500/50'
                        : effectiveStanding.status === 'verified'
                        ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50'
                        : 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/50'
                    }`}
                  >
                    {effectiveStanding.status === 'warning'
                      ? 'Caution'
                      : effectiveStanding.status === 'verified'
                      ? 'Verified Citizen'
                      : 'Active & Safe'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-1 mt-0.5">
                  {effectiveStanding.description}
                </p>
              </div>
            </div>

            {/* Metric pill counter */}
            <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-semibold bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <div className="flex items-center gap-1 text-emerald-300">
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>{effectiveStanding.totalUpvotes} Likes</span>
              </div>
              <span className="text-white/30">•</span>
              <div className="flex items-center gap-1 text-slate-200">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>{effectiveStanding.totalPosts} Posts</span>
              </div>
              <span className="text-white/30">•</span>
              <div className="flex items-center gap-1 text-emerald-200">
                <span>Trust {effectiveStanding.score}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold no-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>All</span>
              <span className="text-[10px] opacity-80">({notifications.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('posts')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'posts'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>Post Interactions</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'account'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Account Status</span>
            </button>

            <button
              onClick={() => setActiveTab('social')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'social'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>Friends & Social</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer font-medium select-none">
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

        {/* Notifications Scrollable Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                You're all caught up!
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {unreadOnly
                  ? 'No unread notifications right now. Check back when peers react to your discussions or your account status updates.'
                  : 'No notifications in this channel yet. Connect with fellow citizens across all 47 counties!'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 transition-colors flex items-start gap-3.5 cursor-pointer relative group ${
                  notif.read ? 'bg-white hover:bg-slate-50/80' : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                }`}
              >
                {/* Unread indicator bar */}
                {!notif.read && (
                  <span className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-600 rounded-r" />
                )}

                {/* Leading icon */}
                {getNotificationIcon(notif)}

                {/* Notification Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {notif.title}
                      </span>
                      {notif.actorCounty && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md truncate">
                          {notif.actorCounty}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 mt-0.5 line-clamp-2 leading-relaxed">
                    {notif.message}
                  </p>

                  {/* Context snippet if attached */}
                  {notif.postTitle && (
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-700 max-w-full truncate border border-slate-200">
                      <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">{notif.postTitle}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </div>
                  )}

                  {/* Action row */}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      {notif.postId && (
                        <span className="font-semibold text-emerald-700 flex items-center gap-0.5 group-hover:underline">
                          <span>View Discussion</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                      {notif.actorId && !notif.postId && (
                        <span className="font-semibold text-purple-700 flex items-center gap-0.5 group-hover:underline">
                          <span>View Profile</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>

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
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>TUJUANE Citizen Alerts</span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleMarkAllRead}
              className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer sm:hidden"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold transition-all cursor-pointer shadow-xs"
              title="Close notifications"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
