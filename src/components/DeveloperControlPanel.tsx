import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { CommunityPost } from '../types/community';
import { SafetyReport, SafetyCategory } from '../types/safety';
import { UserProfile } from '../types/chat';
import {
  subscribeToCommunityPosts,
  deleteCommunityPost
} from '../services/communityService';
import {
  subscribeToSafetyReports,
  resolveSafetyReport,
  attachSafetyAdvisoryToPost,
  approvePostSafety,
  removePostByModerator
} from '../services/safetyService';
import {
  subscribeToCommunityUsers,
  updateCitizenAccountStatus,
  isDeveloperAccount
} from '../services/chatService';
import { sendUserNotification } from '../services/userNotificationService';
import { analyzeContentSafety, getSafetyExplanation } from '../utils/safetyFilter';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Trash2,
  CheckCircle2,
  XCircle,
  Flag,
  Users,
  MessageSquare,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Terminal,
  Activity,
  Sparkles,
  Lock,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Info,
  Check,
  X,
  Ban,
  Clock,
  UserX,
  UserCheck,
  Calendar,
  AlertOctagon,
  Shield
} from 'lucide-react';

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

interface DeveloperControlPanelProps {
  onNavigateToPost?: (postId: string) => void;
  onGoBack?: () => void;
}

export const DeveloperControlPanel: React.FC<DeveloperControlPanelProps> = ({
  onNavigateToPost,
  onGoBack
}) => {
  const { currentUser, userProfile, loginWithGoogle } = useAuth();

  // Active section tab
  const [activeTab, setActiveTab] = useState<'reports' | 'posts' | 'users' | 'tester'>('reports');

  // Real-time data streams
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Search & filter states
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'flagged' | 'clean'>('all');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'actioned' | 'dismissed'>('pending');
  const [userSearch, setUserSearch] = useState('');

  // Modals & Action dialogs
  const [selectedPostForAdvisory, setSelectedPostForAdvisory] = useState<CommunityPost | null>(null);
  const [advisoryText, setAdvisoryText] = useState('');
  const [selectedPostForDelete, setSelectedPostForDelete] = useState<CommunityPost | null>(null);
  const [deleteReason, setDeleteReason] = useState('Violation of community safety standards');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User Account Status Notification Modal
  const [selectedUserForStatus, setSelectedUserForStatus] = useState<UserProfile | null>(null);
  const [statusType, setStatusType] = useState<'account_verified' | 'account_good_standing' | 'account_warning'>('account_verified');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSendingStatus, setIsSendingStatus] = useState(false);

  const handleSendStatusNotification = async () => {
    if (!selectedUserForStatus) return;
    setIsSendingStatus(true);
    try {
      let title = 'Account Status Update';
      let msg = statusMessage.trim();
      let accStatus: 'good' | 'warning' | 'restricted' | 'verified' = 'good';

      if (statusType === 'account_verified') {
        title = '🎖️ Verified Citizen Badge Awarded';
        accStatus = 'verified';
        if (!msg) msg = 'Congratulations! You have been awarded the official TUJUANE Verified Citizen Badge for valuable civic contributions.';
      } else if (statusType === 'account_warning') {
        title = '⚠️ Account Safety Policy Warning';
        accStatus = 'warning';
        if (!msg) msg = 'Please ensure your posts adhere to national unity and community safety policies to maintain your account in good standing.';
      } else {
        title = '🟢 Account in Good Standing';
        accStatus = 'good';
        if (!msg) msg = 'Your citizen account is verified and adhering to community guidelines.';
      }

      await sendUserNotification({
        userId: selectedUserForStatus.uid,
        category: 'account_status',
        type: statusType,
        title,
        message: msg,
        accountStatus: accStatus
      });

      showToast(`✓ Account status notification sent to ${selectedUserForStatus.displayName}`);
      setSelectedUserForStatus(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Failed to send status notification:', err);
      showToast('Error sending account status notice.');
    } finally {
      setIsSendingStatus(false);
    }
  };

  // Safety Tester Playground
  const [testText, setTestText] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [testResult, setTestResult] = useState<any | null>(null);

  // User status filter
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>('all');

  // Suspension Modal State
  const [selectedUserForSuspend, setSelectedUserForSuspend] = useState<UserProfile | null>(null);
  const [suspendDuration, setSuspendDuration] = useState<'24h' | '3d' | '7d' | '30d' | 'custom'>('24h');
  const [customSuspendDate, setCustomSuspendDate] = useState<string>('');
  const [suspendReasonPreset, setSuspendReasonPreset] = useState<string>('Violation of community civility & safety guidelines');
  const [suspendReasonCustom, setSuspendReasonCustom] = useState<string>('');
  const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

  // Permanent Ban Modal State
  const [selectedUserForBan, setSelectedUserForBan] = useState<UserProfile | null>(null);
  const [banReasonPreset, setBanReasonPreset] = useState<string>('Severe or repeated violations of community safety rules');
  const [banReasonCustom, setBanReasonCustom] = useState<string>('');
  const [isSubmittingBan, setIsSubmittingBan] = useState(false);

  // Reactivate Modal State
  const [selectedUserForReactivate, setSelectedUserForReactivate] = useState<UserProfile | null>(null);
  const [isSubmittingReactivate, setIsSubmittingReactivate] = useState(false);

  const handleConfirmSuspend = async () => {
    if (!selectedUserForSuspend) return;
    setIsSubmittingSuspend(true);
    try {
      let durationMs = 24 * 60 * 60 * 1000;
      if (suspendDuration === '3d') durationMs = 3 * 24 * 60 * 60 * 1000;
      else if (suspendDuration === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;
      else if (suspendDuration === '30d') durationMs = 30 * 24 * 60 * 60 * 1000;

      let untilIso = new Date(Date.now() + durationMs).toISOString();
      if (suspendDuration === 'custom' && customSuspendDate) {
        untilIso = new Date(customSuspendDate).toISOString();
      }

      const reason = suspendReasonCustom.trim() || suspendReasonPreset;
      await updateCitizenAccountStatus(
        selectedUserForSuspend.uid,
        'suspended',
        reason,
        untilIso,
        currentUser?.email || DEVELOPER_EMAIL
      );

      showToast(`⚠️ Account for ${selectedUserForSuspend.displayName} suspended.`);
      setSelectedUserForSuspend(null);
      setSuspendReasonCustom('');
    } catch (err) {
      console.error('Failed to suspend citizen:', err);
      showToast('Error updating account suspension status.');
    } finally {
      setIsSubmittingSuspend(false);
    }
  };

  const handleConfirmBan = async () => {
    if (!selectedUserForBan) return;
    setIsSubmittingBan(true);
    try {
      const reason = banReasonCustom.trim() || banReasonPreset;
      await updateCitizenAccountStatus(
        selectedUserForBan.uid,
        'banned',
        reason,
        undefined,
        currentUser?.email || DEVELOPER_EMAIL
      );

      showToast(`⛔ Account for ${selectedUserForBan.displayName} permanently banned.`);
      setSelectedUserForBan(null);
      setBanReasonCustom('');
    } catch (err) {
      console.error('Failed to ban citizen:', err);
      showToast('Error updating account ban status.');
    } finally {
      setIsSubmittingBan(false);
    }
  };

  const handleConfirmReactivate = async () => {
    if (!selectedUserForReactivate) return;
    setIsSubmittingReactivate(true);
    try {
      await updateCitizenAccountStatus(
        selectedUserForReactivate.uid,
        'active',
        '',
        undefined,
        currentUser?.email || DEVELOPER_EMAIL
      );

      showToast(`✅ Citizen ${selectedUserForReactivate.displayName} reactivated to active status.`);
      setSelectedUserForReactivate(null);
    } catch (err) {
      console.error('Failed to reactivate citizen:', err);
      showToast('Error reactivating account.');
    } finally {
      setIsSubmittingReactivate(false);
    }
  };

  const isDeveloperUser = !!currentUser?.email && currentUser.email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase();

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedPostForAdvisory) setSelectedPostForAdvisory(null);
        if (selectedPostForDelete) setSelectedPostForDelete(null);
        if (selectedUserForStatus) setSelectedUserForStatus(null);
        if (selectedUserForSuspend) setSelectedUserForSuspend(null);
        if (selectedUserForBan) setSelectedUserForBan(null);
        if (selectedUserForReactivate) setSelectedUserForReactivate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPostForAdvisory, selectedPostForDelete, selectedUserForStatus, selectedUserForSuspend, selectedUserForBan, selectedUserForReactivate]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Subscribe to real-time streams ONLY if verified developer
  useEffect(() => {
    if (!isDeveloperUser) return;

    const unsubPosts = subscribeToCommunityPosts({}, (loaded) => {
      setPosts(loaded);
    });

    const unsubReports = subscribeToSafetyReports((loaded) => {
      setReports(loaded);
    });

    let unsubUsers = () => {};
    if (currentUser) {
      unsubUsers = subscribeToCommunityUsers(
        currentUser.uid,
        (loadedUsers) => {
          setUsers(loadedUsers);
        },
        true // includeDeveloper = true so developer sees all users in this panel
      );
    }

    return () => {
      unsubPosts();
      unsubReports();
      unsubUsers();
    };
  }, [isDeveloperUser, currentUser]);

  // Compute live safety metrics
  const pendingReports = useMemo(() => {
    return reports.filter((r) => r.status === 'pending');
  }, [reports]);

  const flaggedPosts = useMemo(() => {
    return posts.filter((p) => p.isFlagged || p.moderationStatus === 'under_review' || p.moderationStatus === 'flagged');
  }, [posts]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<SafetyCategory, number> = {
      nudity: 0,
      misleading: 0,
      incitement: 0,
      dangerous: 0,
      spam: 0,
      harassment: 0
    };
    reports.forEach((r) => {
      if (counts[r.category] !== undefined) {
        counts[r.category]++;
      }
    });
    return counts;
  }, [reports]);

  const cleanScore = useMemo(() => {
    if (posts.length === 0) return 100;
    const cleanCount = posts.filter((p) => !p.isFlagged).length;
    return Math.round((cleanCount / posts.length) * 100);
  }, [posts]);

  // Filtered posts for monitor
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const matchesSearch =
        !postSearch.trim() ||
        p.title.toLowerCase().includes(postSearch.toLowerCase()) ||
        p.content.toLowerCase().includes(postSearch.toLowerCase()) ||
        p.authorName.toLowerCase().includes(postSearch.toLowerCase()) ||
        (p.county ? p.county.toLowerCase().includes(postSearch.toLowerCase()) : false);

      if (!matchesSearch) return false;

      if (postFilter === 'flagged') {
        return p.isFlagged || p.moderationStatus === 'under_review' || p.moderationStatus === 'flagged';
      }
      if (postFilter === 'clean') {
        return !p.isFlagged && p.moderationStatus !== 'flagged';
      }
      return true;
    });
  }, [posts, postSearch, postFilter]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (reportFilter === 'all') return true;
      return r.status === reportFilter;
    });
  }, [reports, reportFilter]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Status filter
      if (userStatusFilter === 'active') {
        if (u.accountStatus && u.accountStatus !== 'active') return false;
      } else if (userStatusFilter === 'suspended') {
        if (u.accountStatus !== 'suspended') return false;
      } else if (userStatusFilter === 'banned') {
        if (u.accountStatus !== 'banned') return false;
      }

      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.county || '').toLowerCase().includes(q) ||
        (u.constituency || '').toLowerCase().includes(q) ||
        (u.banReason || '').toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userStatusFilter]);

  // Citizen account status metrics
  const userMetrics = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => !u.accountStatus || u.accountStatus === 'active').length;
    const suspended = users.filter((u) => u.accountStatus === 'suspended').length;
    const banned = users.filter((u) => u.accountStatus === 'banned').length;
    return { total, active, suspended, banned };
  }, [users]);

  // Moderation actions
  const handleApprovePost = async (post: CommunityPost) => {
    try {
      await approvePostSafety(post.id, currentUser?.email || DEVELOPER_EMAIL);
      showToast('Post verified and marked safe.');
    } catch (err) {
      console.error(err);
      showToast('Failed to approve post.');
    }
  };

  const handleOpenAdvisoryModal = (post: CommunityPost) => {
    setSelectedPostForAdvisory(post);
    setAdvisoryText(post.safetyAdvisory || '⚠️ Community Notice: Content under civic review.');
  };

  const handleSaveAdvisory = async () => {
    if (!selectedPostForAdvisory || !advisoryText.trim()) return;
    try {
      await attachSafetyAdvisoryToPost(
        selectedPostForAdvisory.id,
        advisoryText.trim(),
        currentUser?.email || DEVELOPER_EMAIL
      );
      showToast('Safety advisory attached to post.');
      setSelectedPostForAdvisory(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to attach advisory.');
    }
  };

  const handleConfirmDeletePost = async () => {
    if (!selectedPostForDelete) return;
    try {
      await removePostByModerator(
        selectedPostForDelete.id,
        deleteReason,
        currentUser?.email || DEVELOPER_EMAIL
      );
      showToast('Post removed permanently for community safety.');
      setSelectedPostForDelete(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to delete post.');
    }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await resolveSafetyReport(reportId, 'dismissed', currentUser?.email || DEVELOPER_EMAIL, 'Dismissed by developer');
      showToast('Report marked as dismissed.');
    } catch (err) {
      console.error(err);
      showToast('Failed to dismiss report.');
    }
  };

  const handleActionReportAndTakeDown = async (report: SafetyReport) => {
    try {
      if (report.postId) {
        await removePostByModerator(
          report.postId,
          `Takedown via Report #${report.id}: ${report.category}`,
          currentUser?.email || DEVELOPER_EMAIL
        );
      }
      await resolveSafetyReport(
        report.id,
        'actioned',
        currentUser?.email || DEVELOPER_EMAIL,
        report.postId ? `Post taken down for ${report.category}` : `Target actioned for ${report.category}`
      );
      showToast(`Report #${report.id.slice(0, 8)} actioned and resolved.`);
    } catch (err) {
      console.error(err);
      showToast('Failed to resolve safety report.');
    }
  };

  const handleRunSafetyTest = () => {
    const res = analyzeContentSafety(testText, testTitle);
    setTestResult(res);
  };

  const handleLoadTestPreset = (preset: 'hate' | 'scam' | 'nudity' | 'danger' | 'clean') => {
    if (preset === 'hate') {
      setTestTitle('County Boundary Alert');
      setTestText('Watu wa kwekwe lazima watolewe hapa choma hawa watu na nyumba zao');
    } else if (preset === 'scam') {
      setTestTitle('KDF Recruitment Letters 2026');
      setTestText('Guaranteed direct placement into KDF. Send registration fee 3500 via Mpesa to 0712345678 immediately.');
    } else if (preset === 'nudity') {
      setTestTitle('Exclusive private photo drop');
      setTestText('Check out my leaked porn video and send nudes on WhatsApp right now');
    } else if (preset === 'danger') {
      setTestTitle('Urgent');
      setTestText('Instructions to build a pipe bomb and molotov cocktail for the protest');
    } else {
      setTestTitle('Nairobi Tech Freelancers Meetup');
      setTestText('We are hosting a free Saturday session in Westlands on building AI Studio apps for Kenyan developers!');
    }
    setTimeout(() => {
      const res = analyzeContentSafety(
        preset === 'clean'
          ? 'We are hosting a free Saturday session in Westlands on building AI Studio apps for Kenyan developers!'
          : 'sample text',
        testTitle
      );
      setTestResult(res);
    }, 50);
  };

  // If user is not the developer, restrict access completely
  if (!isDeveloperUser) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900">Developer Access Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The Safety & Moderation Control Panel is exclusively reserved for the verified developer account.
          </p>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 text-left space-y-1">
          <div className="font-bold text-slate-900">Developer Owner:</div>
          <div className="font-mono text-[11px] text-emerald-800 font-semibold">{DEVELOPER_EMAIL}</div>
          {currentUser && (
            <p className="text-[11px] text-slate-500 pt-1">
              Currently signed in as: <span className="font-mono text-slate-700">{currentUser.email || 'Citizen'}</span>
            </p>
          )}
        </div>

        {onGoBack && (
          <button
            type="button"
            onClick={onGoBack}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
          >
            Return to Previous Screen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-50">
      {/* Toast message */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Developer Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <Terminal className="w-3.5 h-3.5" />
              <span>TUJUANE Developer & Safety Operations</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Community Governance & Content Monitor
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Real-time monitoring of community posts, citizen engagement, and multi-vector safety filtering
              against nudity, scams/misleading information, dangerous materials, and ethnic incitement across all 47 counties.
            </p>

            <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1 font-mono">
              <span>Admin:</span>
              <span className="text-emerald-300">{currentUser?.email || DEVELOPER_EMAIL}</span>
              <span>·</span>
              <span>Database: ai-studio-kenyanetfreekeny</span>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-center">
              <div className="text-2xl font-black font-mono text-emerald-400">{posts.length}</div>
              <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wider">Posts</div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-center">
              <div className="text-2xl font-black font-mono text-amber-400">{pendingReports.length}</div>
              <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wider">Pending Flags</div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-center">
              <div className="text-2xl font-black font-mono text-rose-400">{flaggedPosts.length}</div>
              <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wider">Under Review</div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-center">
              <div className="text-2xl font-black font-mono text-sky-400">{cleanScore}%</div>
              <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wider">Safe Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Threat Vector Status Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
            ⚡
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold">Incitement & Hate</div>
            <div className="text-sm font-extrabold text-slate-900">{categoryBreakdown.incitement} Reports</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            ⚠️
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold">Misleading & Scams</div>
            <div className="text-sm font-extrabold text-slate-900">{categoryBreakdown.misleading} Reports</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            🔞
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold">Nudity & Adult Content</div>
            <div className="text-sm font-extrabold text-slate-900">{categoryBreakdown.nudity} Reports</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-bold">
            🛑
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold">Dangerous Threats</div>
            <div className="text-sm font-extrabold text-slate-900">{categoryBreakdown.dangerous} Reports</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-xs flex flex-wrap gap-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-slate-900 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flag className="w-4 h-4 text-rose-500" />
          <span>Safety Reports Queue</span>
          {pendingReports.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">
              {pendingReports.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'posts'
              ? 'bg-slate-900 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>All Posts Monitor</span>
          <span className="text-[11px] text-slate-400">({posts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4 text-sky-600" />
          <span>Citizen Activity</span>
          <span className="text-[11px] text-slate-400">({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tester')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'tester'
              ? 'bg-slate-900 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Live Safety Filter Sandbox</span>
        </button>
      </div>

      {/* TAB 1: SAFETY REPORTS QUEUE */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <span>Citizen Reports & Content Flags</span>
              </h2>
              <p className="text-xs text-slate-500">
                Action user-filed reports or automated threat trigger reviews.
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              {(['all', 'pending', 'actioned', 'dismissed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setReportFilter(st)}
                  className={`px-3 py-1 rounded-lg capitalize font-semibold transition-all cursor-pointer ${
                    reportFilter === st
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 stroke-[1.5]" />
              <div className="text-sm font-bold text-slate-800">Safety Queue Clear</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No reports matching filter "{reportFilter}". The community is currently operating cleanly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => {
                const targetPost = posts.find((p) => p.id === report.postId);

                return (
                  <div
                    key={report.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      report.status === 'pending'
                        ? 'bg-rose-50/40 border-rose-200 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 opacity-80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-600 text-white">
                          {report.category}
                        </span>

                        <span className="font-bold text-xs text-slate-900">
                          Report #{report.id.slice(0, 10)}
                        </span>

                        <span className="text-[11px] text-slate-500">
                          Filed by <strong>{report.reporterName}</strong>
                        </span>

                        <span className="text-[10px] text-slate-400">
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md self-start sm:self-auto ${
                          report.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : report.status === 'actioned'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        Status: {report.status}
                      </span>
                    </div>

                    {/* Reported Target Summary */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                      <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>
                          {report.postTitle
                            ? `Target Post: "${report.postTitle}"`
                            : `Target ${report.targetType === 'user' ? 'Account' : 'Citizen'}: "${report.targetUserName || report.targetUserId || 'Profile'}"`}
                        </span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {report.authorName ? `Author: ${report.authorName}` : `Reported User: ${report.targetUserName || 'Citizen'}`}
                        </span>
                      </div>
                      {report.details && (
                        <div className="text-xs text-rose-700 italic">
                          Reporter Note: "{report.details}"
                        </div>
                      )}
                      {targetPost && (
                        <div className="text-xs text-slate-600 pt-1 line-clamp-2 bg-slate-50 p-2 rounded-lg font-mono text-[11px]">
                          {targetPost.content}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleDismissReport(report.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            Dismiss (False Alarm)
                          </button>

                          {targetPost && (
                            <button
                              onClick={() => handleOpenAdvisoryModal(targetPost)}
                              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Attach Warning</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleActionReportAndTakeDown(report)}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Take Down Content</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL POSTS MONITOR */}
      {activeTab === 'posts' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <span>Live Community Posts Monitor</span>
              </h2>
              <p className="text-xs text-slate-500">
                Inspect, review, edit advisories, or delete posts across all 47 counties.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  placeholder="Search posts..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <select
                value={postFilter}
                onChange={(e) => setPostFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Posts ({posts.length})</option>
                <option value="flagged">Flagged ({flaggedPosts.length})</option>
                <option value="clean">Clean Only</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredPosts.map((post) => (
              <div key={post.id} className="py-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900 truncate">
                        {post.title}
                      </span>

                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold">
                        {post.county} County
                      </span>

                      {post.constituency && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px]">
                          {post.constituency}
                        </span>
                      )}

                      {post.isFlagged && (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md text-[10px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Flagged: {post.safetyCategory || 'Under Review'}</span>
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 line-clamp-2">
                      {post.content}
                    </div>

                    {post.safetyAdvisory && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Advisory: {post.safetyAdvisory}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>By <strong>{post.authorName}</strong></span>
                      <span>·</span>
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                      <span>·</span>
                      <span>👍 {post.upvotes} upvotes</span>
                      <span>·</span>
                      <span>💬 {post.commentsCount} replies</span>
                    </div>
                  </div>

                  {/* Moderator Quick Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {post.isFlagged && (
                      <button
                        onClick={() => handleApprovePost(post)}
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer transition-colors"
                        title="Mark post as safe"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenAdvisoryModal(post)}
                      className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg cursor-pointer transition-colors"
                      title="Attach or edit safety advisory"
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setSelectedPostForDelete(post)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition-colors"
                      title="Delete post permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CITIZEN ACTIVITY & ACCOUNT MODERATION */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-600" />
                <span>Citizen Account Moderation & Standing Directory</span>
              </h2>
              <p className="text-xs text-slate-500">
                Manage registered citizen access, suspend accounts with preset durations, permanently ban offenders, or restore standing.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email, county, or ban reason..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full sm:w-64"
              />
            </div>
          </div>

          {/* Account Standing Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setUserStatusFilter('all')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                userStatusFilter === 'all'
                  ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-400/30'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Citizens</div>
              <div className="text-xl font-black text-slate-900 mt-1">{userMetrics.total}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">All registered</div>
            </button>

            <button
              onClick={() => setUserStatusFilter('active')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                userStatusFilter === 'active'
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-400/30'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Active
              </div>
              <div className="text-xl font-black text-emerald-900 mt-1">{userMetrics.active}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Full platform access</div>
            </button>

            <button
              onClick={() => setUserStatusFilter('suspended')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                userStatusFilter === 'suspended'
                  ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/30'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-500" />
                Suspended
              </div>
              <div className="text-xl font-black text-amber-900 mt-1">{userMetrics.suspended}</div>
              <div className="text-[10px] text-amber-600 mt-0.5">Timed restrictions</div>
            </button>

            <button
              onClick={() => setUserStatusFilter('banned')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                userStatusFilter === 'banned'
                  ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-400/30'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <Ban className="w-3 h-3 text-rose-500" />
                Permanently Banned
              </div>
              <div className="text-xl font-black text-rose-900 mt-1">{userMetrics.banned}</div>
              <div className="text-[10px] text-rose-600 mt-0.5">Barred indefinitely</div>
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-slate-500 text-[11px]">Filter by Status:</span>
            {(['all', 'active', 'suspended', 'banned'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setUserStatusFilter(st)}
                className={`px-3 py-1 rounded-xl font-bold capitalize transition-colors cursor-pointer ${
                  userStatusFilter === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st} {st === 'all' ? `(${userMetrics.total})` : `(${userMetrics[st]})`}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Citizen</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Account Standing</th>
                  <th className="py-2.5 px-3 text-right">Moderator Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400">
                      No citizens matching current filter or search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isDev = isDeveloperAccount(u.email, u.isDeveloper);
                    const isBanned = u.accountStatus === 'banned';
                    const isSuspended = u.accountStatus === 'suspended';
                    const isUntilFuture = isSuspended && u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now();

                    return (
                      <tr key={u.uid} className={`hover:bg-slate-50/80 ${isBanned ? 'bg-rose-50/30' : isSuspended ? 'bg-amber-50/30' : ''}`}>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-200" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                                {u.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{u.displayName}</span>
                                {isDev && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                                    <Shield className="w-2.5 h-2.5 text-purple-600" />
                                    Developer
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
                                {u.email || 'Google Auth Citizen'}
                              </div>
                              <div className="text-[9px] text-slate-400 font-mono">UID: {u.uid.slice(0, 10)}...</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{u.county || 'Nairobi'}</div>
                          {u.constituency ? (
                            <div className="text-[11px] text-slate-500">{u.constituency}</div>
                          ) : (
                            <div className="text-[10px] text-slate-400">All Constituencies</div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          {isDev ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              <Shield className="w-3 h-3 text-purple-600" />
                              Platform Developer (Protected)
                            </span>
                          ) : isBanned ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                <Ban className="w-3 h-3 text-rose-600" />
                                Permanently Banned
                              </span>
                              {u.banReason && (
                                <div className="text-[10px] text-rose-700 italic max-w-xs truncate" title={u.banReason}>
                                  Reason: {u.banReason}
                                </div>
                              )}
                            </div>
                          ) : isSuspended ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Suspended {u.suspendedUntil ? `until ${new Date(u.suspendedUntil).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                              </span>
                              {u.banReason && (
                                <div className="text-[10px] text-amber-700 italic max-w-xs truncate" title={u.banReason}>
                                  Reason: {u.banReason}
                                </div>
                              )}
                              {!isUntilFuture && u.suspendedUntil && (
                                <div className="text-[9px] text-slate-400 font-semibold">(Suspension window elapsed)</div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Citizen
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {isDev ? (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 bg-slate-100 select-none">
                              Super Admin
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Reinstatement button for suspended or banned users */}
                              {(isBanned || isSuspended) && (
                                <button
                                  onClick={() => setSelectedUserForReactivate(u)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Restore citizen to good standing"
                                >
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Reactivate</span>
                                </button>
                              )}

                              {/* Suspend button for active citizens */}
                              {!isBanned && (
                                <button
                                  onClick={() => {
                                    setSelectedUserForSuspend(u);
                                    setSuspendDuration('24h');
                                    setSuspendReasonCustom('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Temporarily suspend account with custom duration"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>{isSuspended ? 'Extend' : 'Suspend'}</span>
                                </button>
                              )}

                              {/* Permanent Ban button */}
                              {!isBanned && (
                                <button
                                  onClick={() => {
                                    setSelectedUserForBan(u);
                                    setBanReasonCustom('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Permanently ban citizen from TUJUANE"
                                >
                                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Ban</span>
                                </button>
                              )}

                              {/* Standard status notification */}
                              <button
                                onClick={() => setSelectedUserForStatus(u)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                title="Send Account Status Notification or Verified Badge"
                              >
                                Notice
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE SAFETY FILTER SANDBOX / TESTER */}
      {activeTab === 'tester' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>Multi-Vector Safety Scanner Playground</span>
            </h2>
            <p className="text-xs text-slate-500">
              Test content in real-time against TUJUANE's Kenyan civic safety rules for Nudity, Incitement/Hate Speech, Misleading/Scams, and Dangerous materials.
            </p>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-600">Quick Test Presets:</span>
            <button
              onClick={() => handleLoadTestPreset('hate')}
              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
            >
              Ethnic Incitement
            </button>
            <button
              onClick={() => handleLoadTestPreset('scam')}
              className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
            >
              M-Pesa / Job Scam
            </button>
            <button
              onClick={() => handleLoadTestPreset('nudity')}
              className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-semibold hover:bg-purple-100 cursor-pointer"
            >
              Adult / Nudity
            </button>
            <button
              onClick={() => handleLoadTestPreset('danger')}
              className="px-2.5 py-1 rounded-lg bg-red-50 text-red-800 text-xs font-semibold hover:bg-red-100 cursor-pointer"
            >
              Dangerous Weapons
            </button>
            <button
              onClick={() => handleLoadTestPreset('clean')}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              Clean Community Hustle
            </button>
          </div>

          {/* Tester Form */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Test Post Title</label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="e.g. Breaking news or discussion topic"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Test Body Content</label>
                <textarea
                  rows={4}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="Paste or write text in English, Swahili, or Sheng..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleRunSafetyTest}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Evaluate Content Safety</span>
              </button>
            </div>

            {/* Test Analysis Result */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>Scanner Analysis Result</span>
                {testResult && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      testResult.severity === 'high'
                        ? 'bg-rose-600 text-white'
                        : testResult.severity === 'medium'
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    Recommendation: {testResult.recommendation.toUpperCase()}
                  </span>
                )}
              </h3>

              {testResult ? (
                <div className="space-y-3">
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      testResult.isSafe
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.isSafe ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-xs">{testResult.flagReason}</div>
                        <div className="text-[11px] opacity-80">
                          Severity: <strong>{testResult.severity.toUpperCase()}</strong> · Confidence: {Math.round(testResult.confidence * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {testResult.triggeredCategories.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-700 mb-1">
                        Triggered Threat Categories:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {testResult.triggeredCategories.map((c: SafetyCategory) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md text-[10px] font-bold uppercase"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testResult.matchedKeywords.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-700 mb-1">
                        Matched Sensitive Keywords / Tokens:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {testResult.matchedKeywords.map((kw: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[10px]"
                          >
                            "{kw}"
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testResult.triggeredCategories.length > 0 && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                      <div className="font-bold text-slate-800">
                        {getSafetyExplanation(testResult.triggeredCategories[0]).title}
                      </div>
                      <p className="text-[11px]">
                        {getSafetyExplanation(testResult.triggeredCategories[0]).desc}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Type text or pick a test preset above and click "Evaluate Content Safety".
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ATTACH SAFETY ADVISORY */}
      {selectedPostForAdvisory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedPostForAdvisory(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Attach Community Safety Advisory</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPostForAdvisory(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Target Post: <strong>"{selectedPostForAdvisory.title}"</strong>
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Advisory Message</label>
              <textarea
                rows={3}
                value={advisoryText}
                onChange={(e) => setAdvisoryText(e.target.value)}
                maxLength={300}
                placeholder="e.g. ⚠️ Community Advisory: This post mentions an unverified job offer requiring payment. Do not send funds."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPostForAdvisory(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdvisory}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Save Advisory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM PERMANENT DELETE POST */}
      {selectedPostForDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedPostForDelete(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 text-rose-600 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Delete Post Permanently</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPostForDelete(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to remove <strong>"{selectedPostForDelete.title}"</strong> by {selectedPostForDelete.authorName}?
              This action cannot be undone.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason for removal</label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPostForDelete(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePost}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SEND ACCOUNT STATUS NOTIFICATION */}
      {selectedUserForStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedUserForStatus(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Send Account Status Notice</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedUserForStatus(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              {selectedUserForStatus.photoURL ? (
                <img
                  src={selectedUserForStatus.photoURL}
                  alt={selectedUserForStatus.displayName}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                  {selectedUserForStatus.displayName.charAt(0)}
                </div>
              )}
              <div>
                <div className="font-bold text-xs text-slate-900">
                  {selectedUserForStatus.displayName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {selectedUserForStatus.county || 'Nairobi'} • {selectedUserForStatus.email || 'Citizen'}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Notice Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusType('account_verified')}
                    className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                      statusType === 'account_verified'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🎖️ Award Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusType('account_good_standing')}
                    className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                      statusType === 'account_good_standing'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🟢 Good Standing
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusType('account_warning')}
                    className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                      statusType === 'account_warning'
                        ? 'border-rose-600 bg-rose-50 text-rose-900 ring-1 ring-rose-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ⚠️ Caution/Warning
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Custom Message (Optional)
                </label>
                <textarea
                  rows={3}
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  placeholder="Leave blank to use default standing text or provide specific details..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForStatus(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingStatus}
                onClick={handleSendStatusNotification}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSendingStatus ? 'Sending...' : 'Send Channel Notification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUSPEND CITIZEN ACCOUNT */}
      {selectedUserForSuspend && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedUserForSuspend(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <span>Suspend Citizen Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForSuspend(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Citizen Header */}
            <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80 flex items-center gap-3">
              {selectedUserForSuspend.photoURL ? (
                <img
                  src={selectedUserForSuspend.photoURL}
                  alt={selectedUserForSuspend.displayName}
                  className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-amber-300"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-200 text-amber-900 font-black flex items-center justify-center text-sm shrink-0">
                  {selectedUserForSuspend.displayName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-black text-xs text-slate-900 truncate">
                  {selectedUserForSuspend.displayName}
                </div>
                <div className="text-[11px] text-slate-600 truncate">
                  {selectedUserForSuspend.email || 'Citizen'} • {selectedUserForSuspend.county || 'Nairobi'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">UID: {selectedUserForSuspend.uid}</div>
              </div>
            </div>

            {/* Duration Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Suspension Duration
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                {(['24h', '3d', '7d', '30d'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setSuspendDuration(dur)}
                    className={`py-2 px-1 text-center font-bold rounded-xl border transition-all cursor-pointer ${
                      suspendDuration === dur
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {dur === '24h' ? '24 Hours' : dur === '3d' ? '3 Days' : dur === '7d' ? '7 Days' : '30 Days'}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSuspendDuration('custom')}
                  className={`w-full py-1.5 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    suspendDuration === 'custom'
                      ? 'bg-amber-50 text-amber-900 border-amber-500 ring-1 ring-amber-400'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Custom Expiration Date & Time</span>
                </button>

                {suspendDuration === 'custom' && (
                  <div className="mt-2">
                    <input
                      type="datetime-local"
                      value={customSuspendDate}
                      onChange={(e) => setCustomSuspendDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Violation Reason */}
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                Reason for Suspension
              </label>
              <select
                value={suspendReasonPreset}
                onChange={(e) => setSuspendReasonPreset(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="Violation of community civility & safety guidelines">Civic & Safety Policy Violation</option>
                <option value="Posting scam offers, fraudulent hustle or false job requests">Fraud / Scam / M-Pesa Request</option>
                <option value="Incitement, tribal slurs or derogatory attacks">Ethnic Incitement / Hate Speech</option>
                <option value="Harassment, unwanted bullying or repeated targeting of citizens">Harassment / Bullying</option>
                <option value="Posting adult, explicit or distressing uncensored media">Adult / Inappropriate Media</option>
                <option value="Spamming commercial promotions or unsolicited mass messages">Spamming / Flooding</option>
                <option value="Other / Specific disciplinary action">Custom Infraction Details</option>
              </select>

              <textarea
                rows={2}
                value={suspendReasonCustom}
                onChange={(e) => setSuspendReasonCustom(e.target.value)}
                placeholder="Optional notes or additional context for the citizen..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] text-slate-500 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>The citizen will be unable to publish posts, send chats, or leave comments until the suspension duration ends. An account alert will notify them.</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForSuspend(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingSuspend || (suspendDuration === 'custom' && !customSuspendDate)}
                onClick={handleConfirmSuspend}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isSubmittingSuspend ? 'Suspending...' : 'Confirm Suspension'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PERMANENTLY BAN CITIZEN ACCOUNT */}
      {selectedUserForBan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedUserForBan(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-rose-100">
              <h3 className="font-bold text-sm text-rose-700 flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <span>Permanently Ban Citizen</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForBan(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Irrevocable Restriction Warning</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                This will permanently bar <strong>{selectedUserForBan.displayName}</strong> from posting in discussions, participating in community chats, and commenting across TUJUANE.
              </p>
            </div>

            {/* Target Citizen Info */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
              {selectedUserForBan.photoURL ? (
                <img
                  src={selectedUserForBan.photoURL}
                  alt={selectedUserForBan.displayName}
                  className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-rose-300"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-800 font-black flex items-center justify-center text-sm shrink-0">
                  {selectedUserForBan.displayName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-black text-xs text-slate-900 truncate">
                  {selectedUserForBan.displayName}
                </div>
                <div className="text-[11px] text-slate-600 truncate">
                  {selectedUserForBan.email || 'Citizen'} • {selectedUserForBan.county || 'Nairobi'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">UID: {selectedUserForBan.uid}</div>
              </div>
            </div>

            {/* Reason for Ban */}
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                Violation Classification
              </label>
              <select
                value={banReasonPreset}
                onChange={(e) => setBanReasonPreset(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              >
                <option value="Severe or repeated violations of community safety rules">Severe Civic Safety Violation</option>
                <option value="Severe fraud, monetary scam, or criminal impersonation">Severe Fraud / Financial Scam</option>
                <option value="Repeated ethnic hatred, incitement to violence, or illegal material">Hate Speech / Violence Incitement</option>
                <option value="Persistent harassment and coordinated malicious targeting">Severe Harassment / Doxxing</option>
                <option value="Explicit adult material or dangerous contraband">Explicit Adult / Unlawful Media</option>
                <option value="Persistent malicious bot or disruptive account">Malicious Automated Bot / Sybil Attack</option>
                <option value="Other permanent bar">Custom Reason</option>
              </select>

              <textarea
                rows={2}
                value={banReasonCustom}
                onChange={(e) => setBanReasonCustom(e.target.value)}
                placeholder="Specific justification details for permanently barring this account..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForBan(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingBan}
                onClick={handleConfirmBan}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isSubmittingBan ? 'Banning...' : 'Confirm Permanent Ban'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REACTIVATE / RESTORE CITIZEN ACCOUNT */}
      {selectedUserForReactivate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedUserForReactivate(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-emerald-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <h3 className="font-bold text-sm text-emerald-800 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <span>Restore Citizen Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForReactivate(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to restore <strong>{selectedUserForReactivate.displayName}</strong> to Active Standing?
              This will lift all suspension or ban restrictions and enable them to post, comment, and chat normally again.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForReactivate(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingReactivate}
                onClick={handleConfirmReactivate}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isSubmittingReactivate ? 'Restoring...' : 'Restore Citizen Standing'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
