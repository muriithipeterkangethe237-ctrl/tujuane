import React, { useState, useEffect } from 'react';
import {
  Bug,
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Video,
  Bell,
  Gauge,
  Layout,
  HelpCircle,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AppIssueCategory,
  AppIssueSeverity,
  AppIssueReport
} from '../types/appIssue';
import {
  submitAppIssueReport,
  subscribeToMyAppIssues
} from '../services/appIssueService';

interface ReportAppIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeScreen?: string;
}

const ISSUE_CATEGORIES: Array<{
  id: AppIssueCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'bug', label: 'Bug / Crash', icon: Bug },
  { id: 'video_audio', label: 'Video & Audio', icon: Video },
  { id: 'ui_glitch', label: 'UI / Display', icon: Layout },
  { id: 'performance', label: 'Slow / Lagging', icon: Gauge },
  { id: 'account_auth', label: 'Account / Login', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'feature_request', label: 'Suggestion', icon: Sparkles },
  { id: 'other', label: 'Other', icon: HelpCircle }
];

const SEVERITIES: Array<{
  id: AppIssueSeverity;
  label: string;
  hint: string;
  badgeClass: string;
}> = [
  {
    id: 'low',
    label: 'Low',
    hint: 'Minor visual issue',
    badgeClass: 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
  },
  {
    id: 'medium',
    label: 'Medium',
    hint: 'Feature partially broken',
    badgeClass: 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
  },
  {
    id: 'high',
    label: 'High',
    hint: 'Major task blocked',
    badgeClass: 'border-orange-400 dark:border-orange-700 text-orange-800 dark:text-orange-300'
  },
  {
    id: 'critical',
    label: 'Critical',
    hint: 'App unusable / crash',
    badgeClass: 'border-rose-400 dark:border-rose-700 text-rose-800 dark:text-rose-300'
  }
];

export const ReportAppIssueModal: React.FC<ReportAppIssueModalProps> = ({
  isOpen,
  onClose,
  activeScreen = 'app'
}) => {
  const { currentUser, userProfile, openAuthModal } = useAuth();
  const [category, setCategory] = useState<AppIssueCategory>('bug');
  const [severity, setSeverity] = useState<AppIssueSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedIssue, setSubmittedIssue] = useState<AppIssueReport | null>(null);
  const [myIssues, setMyIssues] = useState<AppIssueReport[]>([]);
  const [viewMode, setViewMode] = useState<'form' | 'history'>('form');

  useEffect(() => {
    if (!isOpen || !currentUser) {
      setMyIssues([]);
      return;
    }
    const unsub = subscribeToMyAppIssues(currentUser.uid, (list) => {
      setMyIssues(list);
    });
    return () => unsub();
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      onClose();
      openAuthModal('signin');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Please enter a short summary of the issue.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please describe what happened so our team can fix it.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const saved = await submitAppIssueReport(userProfile, {
        category,
        severity,
        title,
        description,
        currentScreen: activeScreen
      });
      setSubmittedIssue(saved);
      setTitle('');
      setDescription('');
      setCategory('bug');
      setSeverity('medium');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not submit issue report right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: AppIssueReport['status']) => {
    switch (status) {
      case 'resolved':
        return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'in_progress':
        return 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      case 'dismissed':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
      default:
        return 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-800">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Report an App Issue
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Help improve TUJUANE by reporting bugs or glitches
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toggle Tabs if signed in */}
        {currentUser && (
          <div className="px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('form');
                setSubmittedIssue(null);
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                viewMode === 'form'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Submit Report
            </button>
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'history'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>My Reports</span>
              {myIssues.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  {myIssues.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {viewMode === 'history' ? (
            <div className="space-y-3">
              {myIssues.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-800 dark:text-white">
                    You haven't reported any issues yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    If you ever spot a glitch or playback bug, let us know here.
                  </p>
                </div>
              ) : (
                myIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        {issue.title}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${getStatusBadge(
                          issue.status
                        )}`}
                      >
                        {issue.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {issue.description}
                    </p>
                    {issue.developerNotes && (
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200">
                        <span className="font-bold">Developer Note: </span>
                        {issue.developerNotes}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span className="capitalize">{issue.category.replace('_', ' ')} · {issue.severity}</span>
                      <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : submittedIssue ? (
            <div className="py-6 text-center space-y-4 animate-in fade-in">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Issue Report Sent
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Asante! Your report <strong>"{submittedIssue.title}"</strong> has been logged for our developer team to investigate.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedIssue(null);
                    setViewMode('history');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
                >
                  View My Reports
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : !currentUser ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Sign in to report an issue
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Signing in lets you track updates when the developer resolves your report.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAuthModal('signin');
                }}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Sign In Now
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Issue Category */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Issue Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ISSUE_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const active = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-2 rounded-xl border text-[11px] font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="truncate max-w-full">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  How severe is it?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev.id}
                      type="button"
                      onClick={() => setSeverity(sev.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        severity === sev.id
                          ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-emerald-500 ring-1 ring-emerald-500/40'
                          : `bg-white dark:bg-slate-900 ${sev.badgeClass}`
                      }`}
                    >
                      <div className="text-[11px] font-extrabold">{sev.label}</div>
                      <div className="text-[9px] opacity-80 truncate">{sev.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Summary Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="e.g., Video fails to play on feed or button unresponsive"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  What happened? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1500}
                  placeholder="Describe the steps before the issue happened and what you expected to see..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white resize-none"
                  required
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    Screen: {activeScreen}
                  </span>
                  <span>{description.length}/1500</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Submitting...' : 'Submit Issue Report'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
