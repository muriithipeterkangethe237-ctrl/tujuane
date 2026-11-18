import React, { useState } from 'react';
import {
  Video,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  UploadCloud
} from 'lucide-react';
import { useBackgroundUploads } from '../context/BackgroundUploadContext';
import { formatFileSize } from '../utils/imageCompressor';

export const BackgroundUploadDock: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { jobs, activeJobsCount, retryUploadJob, dismissUploadJob, clearCompletedJobs } =
    useBackgroundUploads();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (hidden || jobs.length === 0) return null;

  const primaryJob = jobs[0];
  const hasFailures = jobs.some((j) => j.status === 'failed');

  if (isCollapsed) {
    return (
      <div className="fixed bottom-20 md:bottom-5 right-3 sm:right-5 z-40 animate-in fade-in">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white border border-white/15 shadow-2xl backdrop-blur-md hover:bg-slate-800 transition-all cursor-pointer"
        >
          {activeJobsCount > 0 ? (
            <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
          ) : hasFailures ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <div className="text-left">
            <div className="text-xs font-extrabold leading-tight">
              {activeJobsCount > 0
                ? `${primaryJob.status === 'compressing' ? 'Compressing' : 'Uploading'} (${primaryJob.progress}%)`
                : hasFailures
                ? 'Upload needs attention'
                : 'Video upload complete'}
            </div>
            {jobs.length > 1 && (
              <div className="text-[10px] text-slate-300">{jobs.length} background tasks</div>
            )}
          </div>
          <ChevronUp className="w-4 h-4 text-slate-300 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-5 right-3 sm:right-5 z-40 w-[calc(100vw-1.5rem)] sm:w-88 max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UploadCloud className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
            {activeJobsCount > 0
              ? `Background Video Upload (${activeJobsCount})`
              : hasFailures
              ? 'Video Upload Notice'
              : 'Video Published'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {jobs.some((j) => j.status === 'completed' || j.status === 'failed') && (
            <button
              type="button"
              onClick={clearCompletedJobs}
              className="px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            title="Minimize"
            aria-label="Minimize background upload panel"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Job Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
        {jobs.map((job) => {
          const isWorking = job.status === 'compressing' || job.status === 'uploading';
          const savedPct =
            job.wasCompressed &&
            job.originalSizeBytes &&
            job.compressedSizeBytes &&
            job.originalSizeBytes > job.compressedSizeBytes
              ? Math.round(
                  ((job.originalSizeBytes - job.compressedSizeBytes) / job.originalSizeBytes) * 100
                )
              : 0;

          return (
            <div key={job.id} className="p-3 space-y-2">
              <div className="flex items-start gap-2.5">
                {job.thumbnailDataUrl ? (
                  <img
                    src={job.thumbnailDataUrl}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                    <Video className="w-4 h-4" />
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {job.title}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold shrink-0 ${
                        job.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : job.status === 'failed'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {job.status === 'completed'
                        ? 'Done'
                        : job.status === 'failed'
                        ? 'Error'
                        : `${job.progress}%`}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {job.status === 'failed' ? job.error || job.stageLabel : job.stageLabel}
                  </p>

                  {job.compressedSizeBytes && (
                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {savedPct > 0 && job.originalSizeBytes
                        ? `Compressed ${formatFileSize(job.originalSizeBytes)} → ${formatFileSize(
                            job.compressedSizeBytes
                          )} (-${savedPct}%)`
                        : `Size: ${formatFileSize(job.compressedSizeBytes)}`}
                    </div>
                  )}
                </div>

                {!isWorking && (
                  <button
                    type="button"
                    onClick={() => dismissUploadJob(job.id)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer shrink-0"
                    title="Dismiss"
                    aria-label="Dismiss upload item"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isWorking && (
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      job.status === 'compressing' ? 'bg-amber-500' : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.max(4, job.progress)}%` }}
                  />
                </div>
              )}

              {job.status === 'failed' && (
                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => dismissUploadJob(job.id)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => retryUploadJob(job.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Upload</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
