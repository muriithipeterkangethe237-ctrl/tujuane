import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  EyeOff,
  Flame,
  Layers,
  Monitor,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react';
import {
  CrashCategory,
  CrashReport,
  CrashStatus,
  TelemetryAnalyticsSummary,
  TelemetrySession
} from '../types/telemetry';
import {
  deleteCrashReportRecord,
  reportAppCrash,
  updateCrashReportStatus
} from '../services/telemetryService';

function formatDurationShort(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec || 0));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins < 60) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

interface DeveloperAnalyticsTabProps {
  analytics: TelemetryAnalyticsSummary;
  sessions: TelemetrySession[];
  crashes: CrashReport[];
  onNotify: (message: string) => void;
}

export const DeveloperAnalyticsTab: React.FC<DeveloperAnalyticsTabProps> = ({
  analytics,
  sessions,
  crashes,
  onNotify
}) => {
  const handleExportSnapshot = () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        summary: analytics,
        sessionsCount: sessions.length,
        crashesCount: crashes.length,
        sessions: sessions.slice(0, 150),
        crashes: crashes.slice(0, 100)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tujuane-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify('Exported analytics & crash telemetry JSON snapshot.');
    } catch (err) {
      console.error('Export failed:', err);
      onNotify('Could not export telemetry JSON snapshot.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Action */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>User Funnel, Retention & Drop-Off Telemetry</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Silent behind-the-scenes tracking across user journeys, retention cohorts, and screen dwell times.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportSnapshot}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Snapshot</span>
          </button>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Active Citizens (DAU)</span>
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {analytics.dau}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{analytics.wau}</span> WAU ·{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{analytics.mau}</span> MAU
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Returning Session Rate</span>
              <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {analytics.returningUserPct}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Across <span className="font-semibold text-slate-700 dark:text-slate-200">{analytics.totalSessions}</span> captured sessions
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Avg Session Duration</span>
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {formatDurationShort(analytics.avgSessionDurationSec)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Core Funnel Conversion:{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {analytics.overallFunnelConversionPct}%
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Crash-Free Sessions</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
              {analytics.crashFreeSessionPct}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Open Issues:{' '}
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {crashes.filter((c) => c.status === 'open').length}
              </span>
            </div>
          </div>
        </div>

        {/* Highlighted Drop-off Bottleneck Callout */}
        {analytics.highestDropOffStep && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-extrabold text-amber-950 dark:text-amber-200">
                Primary Drop-Off Bottleneck: {analytics.highestDropOffStep.label}
              </div>
              <p className="text-amber-800 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                <strong>{analytics.highestDropOffStep.dropOffPct}%</strong> of users ({analytics.highestDropOffStep.dropOffCount} sessions) dropped off before reaching{' '}
                <span className="font-semibold">{analytics.highestDropOffStep.description}</span>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Funnel Progression & Exit Reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Conversion Funnel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Citizen Journey Conversion Funnel</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Progression from first visit through registration, profile setup, engagement, and D1+ return.
            </p>
          </div>

          {analytics.totalSessions === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              Collecting live session funnel events. Navigate across tabs or refresh to inspect progression.
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.funnelSteps.map((step, index) => (
                <div
                  key={step.key}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-extrabold text-slate-900 dark:text-white">{step.label}</span>
                      <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-400 ml-2">
                        {step.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono">
                      {index > 0 && step.dropOffCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                          -{step.dropOffPct}% ({step.dropOffCount})
                        </span>
                      )}
                      <span className="font-black text-slate-900 dark:text-white">
                        {step.count}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 w-10 text-right">
                        {step.conversionPct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                      style={{ width: `${Math.max(step.count > 0 ? 4 : 0, step.conversionPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Top Drop-off & Abandonment Points */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <span>Exact Drop-Off & Exit Stages</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Where users stopped or abandoned modals before completing a core action.
            </p>
          </div>

          {analytics.dropOffPoints.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              No drop-off stages recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {analytics.dropOffPoints.map((point) => {
                const isCompleted = point.stage === 'completed_core_journey';
                return (
                  <div
                    key={point.stage}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {point.label}
                      </span>
                      <span className="font-mono text-[11px] font-extrabold text-slate-700 dark:text-slate-300 shrink-0">
                        {point.count} ({point.sharePct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isCompleted ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.max(4, point.sharePct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 7-Day Activity Chart + Retention Cohort Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>7-Day Engagement & Error Trend</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Daily active users vs total captured sessions and crash occurrences.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.dailyTrend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#f8fafc'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  name="Sessions"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#sessGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="dau"
                  name="Active Citizens"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#dauGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="crashes"
                  name="Crashes"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={0.12}
                  fill="#f43f5e"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" />
              <span>Retention Cohorts</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Share of eligible citizens returning on Day 1, Day 3, Day 7, and Day 14+.
            </p>
          </div>

          <div className="space-y-3">
            {analytics.retentionBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{bucket.label}</span>
                  <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {bucket.retainedUsers}/{bucket.eligibleUsers} ·{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400">{bucket.retentionPct}%</strong>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${Math.max(bucket.retainedUsers > 0 ? 4 : 0, bucket.retentionPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Screen Engagement & Exit Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-indigo-500" />
            <span>Screen Dwell Time & Exit Matrix</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Visits, average time spent, and final session exits per app view.
          </p>
        </div>

        {analytics.screenMetrics.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            No screen engagement metrics captured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-bold">Screen</th>
                  <th className="py-2.5 px-4 font-bold">Session Visits</th>
                  <th className="py-2.5 px-4 font-bold">Avg Dwell Time</th>
                  <th className="py-2.5 pl-4 font-bold text-right">Final Exits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.screenMetrics.map((row) => (
                  <tr key={row.screen} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 pr-4 font-bold text-slate-900 dark:text-white">{row.label}</td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">{row.visits}</td>
                    <td className="py-3 px-4 font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      {formatDurationShort(row.avgDwellSec)}
                    </td>
                    <td className="py-3 pl-4 font-mono text-right text-rose-600 dark:text-rose-400 font-semibold">
                      {row.exitCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

interface DeveloperCrashReportsTabProps {
  crashes: CrashReport[];
  crashFreeSessionPct: number;
  developerEmail: string;
  onRefreshLocal: () => void;
  onNotify: (message: string) => void;
}

export const DeveloperCrashReportsTab: React.FC<DeveloperCrashReportsTabProps> = ({
  crashes,
  crashFreeSessionPct,
  developerEmail,
  onRefreshLocal,
  onNotify
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | CrashStatus>('open');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CrashCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCrashIds, setExpandedCrashIds] = useState<Record<string, boolean>>({});
  const [isTriggeringTest, setIsTriggeringTest] = useState(false);

  const stats = useMemo(() => {
    const open = crashes.filter((c) => c.status === 'open').length;
    const fatal = crashes.filter((c) => c.severity === 'fatal' && c.status === 'open').length;
    const resolved = crashes.filter((c) => c.status === 'resolved').length;
    return { open, fatal, resolved, total: crashes.length };
  }, [crashes]);

  const filteredCrashes = useMemo(() => {
    return crashes.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.message.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.screen.toLowerCase().includes(q) ||
          (c.userName || '').toLowerCase().includes(q) ||
          c.fingerprint.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [crashes, statusFilter, categoryFilter, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedCrashIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSimulateCrash = async () => {
    setIsTriggeringTest(true);
    try {
      await reportAppCrash({
        error: new Error('Diagnostic verification test crash triggered from Developer Panel'),
        category: 'manual_test',
        severity: 'warning',
        context: 'dev-panel diagnostic self-test',
        forceBypassDedupe: true
      });
      onRefreshLocal();
      setStatusFilter('open');
      onNotify('Diagnostic test error captured with stack trace and breadcrumbs.');
    } finally {
      setIsTriggeringTest(false);
    }
  };

  const handleStatusChange = async (crashId: string, nextStatus: CrashStatus) => {
    await updateCrashReportStatus(crashId, nextStatus, developerEmail);
    onRefreshLocal();
    onNotify(
      nextStatus === 'resolved'
        ? 'Crash report marked as resolved.'
        : nextStatus === 'ignored'
        ? 'Crash report muted / ignored.'
        : 'Crash report reopened.'
    );
  };

  const handleDeleteCrash = async (crashId: string) => {
    await deleteCrashReportRecord(crashId);
    onRefreshLocal();
    onNotify('Crash report deleted.');
  };

  return (
    <div className="space-y-5">
      {/* Stability Summary Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span>Real-Time Crash & Error Monitoring</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatic capture of React boundaries, uncaught runtime exceptions, unhandled promises, and media failures with user breadcrumbs.
            </p>
          </div>

          <button
            type="button"
            disabled={isTriggeringTest}
            onClick={handleSimulateCrash}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isTriggeringTest ? 'Logging Test...' : 'Simulate Test Error'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Crash-Free Rate</div>
            <div className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
              {crashFreeSessionPct}%
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70">
            <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-300">Open Errors</div>
            <div className="text-2xl font-black font-mono text-rose-700 dark:text-rose-400">{stats.open}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/70">
            <div className="text-[11px] font-semibold text-red-800 dark:text-red-300">Open Fatal Crashes</div>
            <div className="text-2xl font-black font-mono text-red-700 dark:text-red-400">{stats.fatal}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Resolved Reports</div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">{stats.resolved}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(['open', 'resolved', 'ignored', 'all'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl capitalize font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter stack, screen, user..."
                className="w-full sm:w-52 pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-900 dark:text-white"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | CrashCategory)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              <option value="react_boundary">React Boundary</option>
              <option value="runtime">Runtime Error</option>
              <option value="promise_rejection">Unhandled Promise</option>
              <option value="media_playback">Media Playback</option>
              <option value="network_api">Network / API</option>
              <option value="firestore">Firestore</option>
              <option value="manual_test">Manual Test</option>
            </select>
          </div>
        </div>
      </div>

      {/* Crash List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        {filteredCrashes.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 stroke-[1.5]" />
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              No Crash Reports Matching Filter
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              All monitored views are running cleanly. You can trigger a non-destructive diagnostic check via "Simulate Test Error" above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCrashes.map((crash) => {
              const isExpanded = !!expandedCrashIds[crash.id];
              const severityStyles =
                crash.severity === 'fatal'
                  ? 'bg-red-600 text-white'
                  : crash.severity === 'error'
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-500 text-white';

              return (
                <div
                  key={crash.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    crash.status === 'open'
                      ? 'bg-rose-50/35 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/70'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-85'
                  }`}
                >
                  {/* Top Metadata Strip */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${severityStyles}`}>
                        {crash.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        {crash.category}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        #{crash.fingerprint}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Screen: <strong className="text-slate-800 dark:text-slate-200">{crash.screen}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{new Date(crash.createdAt).toLocaleString()}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                          crash.status === 'open'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : crash.status === 'resolved'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {crash.status}
                      </span>
                    </div>
                  </div>

                  {/* Error Title & Message */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                      <span>{crash.name}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-800 dark:text-slate-200 break-words">
                      {crash.message}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex flex-wrap items-center gap-3">
                      <span>
                        Citizen: <strong className="text-slate-700 dark:text-slate-300">{crash.userName || 'Visitor'}</strong>
                      </span>
                      {crash.viewport && <span>Viewport: {crash.viewport}</span>}
                      <span>Source: {crash.source || 'cloud'}</span>
                    </div>
                  </div>

                  {/* Expanded Trace & Breadcrumbs */}
                  {isExpanded && (
                    <div className="space-y-3 pt-1">
                      {crash.breadcrumbs && crash.breadcrumbs.length > 0 && (
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            User Breadcrumb Trail (Last {crash.breadcrumbs.length} Events)
                          </div>
                          <div className="space-y-1.5">
                            {crash.breadcrumbs.map((bc, idx) => (
                              <div
                                key={`${bc.at}-${idx}`}
                                className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300"
                              >
                                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                                  {new Date(bc.at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                                    bc.type === 'error'
                                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                      : bc.type === 'drop_off'
                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {bc.type}
                                </span>
                                <span className="font-medium break-words">{bc.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {crash.stack && (
                        <div className="p-3 rounded-xl bg-slate-950 text-slate-200 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Stack Trace
                          </div>
                          <pre className="text-[10px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-words leading-relaxed">
                            {crash.stack}
                          </pre>
                        </div>
                      )}

                      {crash.componentStack && (
                        <div className="p-3 rounded-xl bg-slate-950 text-amber-200 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            React Component Stack
                          </div>
                          <pre className="text-[10px] font-mono overflow-x-auto max-h-40 whitespace-pre-wrap break-words leading-relaxed">
                            {crash.componentStack}
                          </pre>
                        </div>
                      )}

                      {crash.userAgent && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all">
                          UA: {crash.userAgent}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(crash.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{isExpanded ? 'Hide Diagnostics' : 'Inspect Trace & Breadcrumbs'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {crash.status === 'open' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(crash.id, 'resolved')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-2xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Resolved</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(crash.id, 'ignored')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Ignore</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(crash.id, 'open')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteCrash(crash.id)}
                        className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                        title="Delete crash record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
