import React, { useState } from 'react';
import { Flag, X, ShieldAlert, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { submitSafetyReport } from '../services/safetyService';
import { SafetyCategory } from '../types/safety';

export interface ReportTarget {
  type: 'post' | 'user' | 'message';
  id?: string;
  title?: string;
  authorId: string;
  authorName: string;
  snippet?: string;
}

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: ReportTarget | null;
  onSuccess?: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  target,
  onSuccess
}) => {
  const { currentUser, userProfile, openAuthModal } = useAuth();
  const [category, setCategory] = useState<SafetyCategory>('harassment');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      openAuthModal();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitSafetyReport({
        targetType: target.type,
        postId: target.type === 'post' ? target.id : undefined,
        postTitle: target.title || (target.type === 'user' ? `Account: ${target.authorName}` : 'Reported Content'),
        postSnippet: target.snippet,
        targetUserId: target.authorId,
        targetUserName: target.authorName,
        authorId: target.authorId,
        authorName: target.authorName,
        reporterId: currentUser.uid,
        reporterName: userProfile.displayName || 'Citizen Reporter',
        category,
        details: details.trim() || undefined
      });

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Safety report error:', err);
      setError(err?.message || 'Could not submit report. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetDescription = () => {
    if (target.type === 'user') {
      return `Reporting citizen account: ${target.authorName}`;
    }
    if (target.type === 'post') {
      return `Reporting post "${target.title || 'Discussion'}" by ${target.authorName}`;
    }
    return `Reporting message from ${target.authorName}`;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Flag className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {target.type === 'user' ? 'Report Account' : 'Report Content'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Civic safety moderation for all 47 counties
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-6 text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="font-bold text-sm text-slate-900">Report Submitted</h4>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              Thank you for keeping TUJUANE safe. Community safety moderators have received your report.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="font-semibold">{getTargetDescription()}</span>
              {target.snippet && (
                <p className="text-[11px] text-slate-500 italic mt-1 line-clamp-2">
                  "{target.snippet}"
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Reason for Safety Report *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SafetyCategory)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-900 cursor-pointer"
              >
                <option value="harassment">📢 Harassment / Bullying / Abusive Behavior</option>
                <option value="incitement">⚡ Ethnic Hate Speech / Tribal Incitement / Calls to Violence</option>
                <option value="misleading">⚠️ Misleading Information / M-Pesa Fraud / Fake Job Scam</option>
                <option value="nudity">🔞 Explicit Sexual Content / Nudity / Pornography</option>
                <option value="dangerous">🛑 Dangerous Content / Weapons / Threats of Harm</option>
                <option value="spam">📦 Spam / Fake Account / Unsolicited Promotion</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Additional Details (Optional)
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={400}
                placeholder="Describe what occurred to assist civic moderators in taking appropriate action..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none text-slate-900 placeholder:text-slate-400"
              />
              <div className="text-right text-[10px] text-slate-400">
                {details.length}/400
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
