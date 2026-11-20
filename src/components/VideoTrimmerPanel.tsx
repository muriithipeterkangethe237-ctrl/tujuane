import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Scissors,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Volume2,
  VolumeX,
  Gauge
} from 'lucide-react';
import {
  DEFAULT_VIDEO_PLAYBACK_SPEED,
  MAX_FEED_VIDEO_DURATION_SEC,
  VIDEO_PLAYBACK_SPEED_OPTIONS,
  formatVideoDuration,
  normalizePlaybackSpeed
} from '../utils/videoProcessor';

interface VideoTrimmerPanelProps {
  sourceFile: File;
  totalDurationSec?: number;
  maxClipDurationSec?: number;
  initialStartSec?: number;
  initialEndSec?: number;
  initialPlaybackSpeed?: number;
  noticeText?: string;
  onApplyTrim: (startTimeSec: number, endTimeSec: number, playbackSpeed: number) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const MIN_CLIP_SECONDS = 1;

export const VideoTrimmerPanel: React.FC<VideoTrimmerPanelProps> = ({
  sourceFile,
  totalDurationSec,
  maxClipDurationSec = MAX_FEED_VIDEO_DURATION_SEC,
  initialStartSec = 0,
  initialEndSec,
  initialPlaybackSpeed = DEFAULT_VIDEO_PLAYBACK_SPEED,
  noticeText,
  onApplyTrim,
  onCancel,
  disabled = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<'start' | 'end' | 'playhead' | null>(null);

  const sourceUrl = useMemo(() => URL.createObjectURL(sourceFile), [sourceFile]);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() =>
    normalizePlaybackSpeed(initialPlaybackSpeed)
  );
  const maxInputSpanSec = useMemo(
    () => maxClipDurationSec * playbackSpeed,
    [maxClipDurationSec, playbackSpeed]
  );

  const [duration, setDuration] = useState<number>(
    totalDurationSec && isFinite(totalDurationSec) && totalDurationSec > 0
      ? totalDurationSec
      : 0
  );
  const [startSec, setStartSec] = useState<number>(Math.max(0, initialStartSec));
  const [endSec, setEndSec] = useState<number>(() => {
    const initialSpanLimit = maxClipDurationSec * normalizePlaybackSpeed(initialPlaybackSpeed);
    const baseDur =
      totalDurationSec && isFinite(totalDurationSec) && totalDurationSec > 0
        ? totalDurationSec
        : initialSpanLimit;
    const rawEnd =
      typeof initialEndSec === 'number' && isFinite(initialEndSec)
        ? initialEndSec
        : Math.min(baseDur, initialStartSec + initialSpanLimit);
    return Math.max(Math.min(baseDur, rawEnd), Math.min(baseDur, initialStartSec + MIN_CLIP_SECONDS));
  });
  const [currentTime, setCurrentTime] = useState<number>(Math.max(0, initialStartSec));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setPlaybackSpeed(normalizePlaybackSpeed(initialPlaybackSpeed));
  }, [initialPlaybackSpeed]);

  useEffect(() => {
    return () => {
      try {
        URL.revokeObjectURL(sourceUrl);
      } catch {
        // ignore revoke error
      }
    };
  }, [sourceUrl]);

  // Apply playbackRate live to trimmer preview player
  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v) return;
    try {
      v.playbackRate = playbackSpeed;
      if ('preservesPitch' in v) v.preservesPitch = true;
      if ('webkitPreservesPitch' in v) v.webkitPreservesPitch = true;
    } catch {
      // ignore unsupported rate
    }
  }, [playbackSpeed, sourceUrl]);

  const effectiveDuration = duration > 0 ? duration : Math.max(endSec, MIN_CLIP_SECONDS);

  const handleLoadedMetadata = () => {
    const v = videoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v) return;
    try {
      v.playbackRate = playbackSpeed;
      if ('preservesPitch' in v) v.preservesPitch = true;
      if ('webkitPreservesPitch' in v) v.webkitPreservesPitch = true;
    } catch {
      // ignore
    }
    const d = v.duration;
    if (d && isFinite(d) && d > 0) {
      setDuration(d);
      setStartSec((prevStart) => {
        const clampedStart = Math.max(0, Math.min(prevStart, Math.max(0, d - MIN_CLIP_SECONDS)));
        setEndSec((prevEnd) => {
          const targetEnd =
            typeof initialEndSec === 'number' && isFinite(initialEndSec)
              ? Math.min(d, initialEndSec)
              : prevEnd > 0
              ? Math.min(d, prevEnd)
              : Math.min(d, clampedStart + maxInputSpanSec);
          const bounded = Math.max(
            Math.min(d, clampedStart + MIN_CLIP_SECONDS),
            Math.min(targetEnd, clampedStart + maxInputSpanSec)
          );
          return bounded;
        });
        return clampedStart;
      });
      if (v.currentTime < startSec || v.currentTime > startSec + 0.5) {
        try {
          v.currentTime = startSec;
        } catch {
          // ignore
        }
      }
    }
  };

  const seekVideoTo = useCallback((sec: number) => {
    const v = videoRef.current;
    setCurrentTime(sec);
    if (!v) return;
    try {
      v.currentTime = sec;
    } catch {
      // ignore seek failure before ready
    }
  }, []);

  const updateStart = useCallback(
    (nextRaw: number) => {
      const clampedMaxStart = Math.max(0, effectiveDuration - MIN_CLIP_SECONDS);
      const nextStart = Math.max(0, Math.min(nextRaw, clampedMaxStart));
      let nextEnd = Math.max(endSec, nextStart + MIN_CLIP_SECONDS);
      if (nextEnd > effectiveDuration) {
        nextEnd = effectiveDuration;
      }
      if (nextEnd - nextStart > maxInputSpanSec) {
        nextEnd = Math.min(effectiveDuration, nextStart + maxInputSpanSec);
      }
      if (nextEnd - nextStart < MIN_CLIP_SECONDS) {
        nextEnd = Math.min(effectiveDuration, nextStart + MIN_CLIP_SECONDS);
      }
      setStartSec(nextStart);
      setEndSec(nextEnd);
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      seekVideoTo(nextStart);
    },
    [effectiveDuration, endSec, maxInputSpanSec, seekVideoTo]
  );

  const updateEnd = useCallback(
    (nextRaw: number) => {
      const nextEnd = Math.max(MIN_CLIP_SECONDS, Math.min(nextRaw, effectiveDuration));
      let nextStart = Math.min(startSec, nextEnd - MIN_CLIP_SECONDS);
      if (nextStart < 0) nextStart = 0;
      if (nextEnd - nextStart > maxInputSpanSec) {
        nextStart = Math.max(0, nextEnd - maxInputSpanSec);
      }
      setStartSec(nextStart);
      setEndSec(nextEnd);
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      seekVideoTo(nextEnd);
    },
    [effectiveDuration, maxInputSpanSec, seekVideoTo, startSec]
  );

  const handleSelectSpeed = (nextRaw: number) => {
    const nextSpeed = normalizePlaybackSpeed(nextRaw);
    setPlaybackSpeed(nextSpeed);
    const nextMaxSpan = maxClipDurationSec * nextSpeed;
    setEndSec((prevEnd) => {
      const clampedEnd = Math.min(effectiveDuration, Math.max(startSec + MIN_CLIP_SECONDS, prevEnd));
      return Math.min(clampedEnd, startSec + nextMaxSpan);
    });
  };

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || effectiveDuration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * effectiveDuration;
    },
    [effectiveDuration]
  );

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || effectiveDuration <= 0) return;
    const t = timeFromClientX(e.clientX);
    draggingRef.current = 'playhead';
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const clamped = Math.max(startSec, Math.min(endSec, t));
    seekVideoTo(clamped);
  };

  const handleHandlePointerDown = (
    handle: 'start' | 'end',
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    if (disabled || effectiveDuration <= 0) return;
    draggingRef.current = handle;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const mode = draggingRef.current;
    if (!mode) return;
    const t = timeFromClientX(e.clientX);
    if (mode === 'start') {
      updateStart(t);
    } else if (mode === 'end') {
      updateEnd(t);
    } else if (mode === 'playhead') {
      const clamped = Math.max(startSec, Math.min(endSec, t));
      seekVideoTo(clamped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleTogglePlay = async () => {
    const v = videoRef.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      setIsPlaying(false);
      return;
    }
    if (v.currentTime < startSec || v.currentTime >= endSec - 0.1) {
      try {
        v.currentTime = startSec;
      } catch {
        // ignore
      }
    }
    try {
      v.playbackRate = playbackSpeed;
      if ('preservesPitch' in v) v.preservesPitch = true;
      await v.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setCurrentTime(t);
    if (!v.paused && t >= endSec) {
      try {
        v.currentTime = startSec;
      } catch {
        v.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleReset = () => {
    const resetSpeed = DEFAULT_VIDEO_PLAYBACK_SPEED;
    setPlaybackSpeed(resetSpeed);
    const defaultEnd = Math.min(effectiveDuration, maxClipDurationSec * resetSpeed);
    setStartSec(0);
    setEndSec(defaultEnd);
    seekVideoTo(0);
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const startPct = effectiveDuration > 0 ? (startSec / effectiveDuration) * 100 : 0;
  const endPct = effectiveDuration > 0 ? (endSec / effectiveDuration) * 100 : 100;
  const playheadPct =
    effectiveDuration > 0
      ? Math.max(0, Math.min(100, (currentTime / effectiveDuration) * 100))
      : 0;
  const selectedSpan = Math.max(0, endSec - startSec);
  const outputSpan = Math.min(maxClipDurationSec, selectedSpan / playbackSpeed);
  const stepJump = effectiveDuration > 120 ? 5 : 1;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/95 overflow-hidden space-y-0">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <Scissors className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            Trim & Speed
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            · Max {formatVideoDuration(maxClipDurationSec)} output
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
          title="Close trimmer"
          aria-label="Close trimmer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {noticeText && (
        <div className="px-3.5 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-800/50">
          {noticeText}
        </div>
      )}

      {/* Video Preview Frame */}
      <div className="relative bg-black flex items-center justify-center max-h-60 overflow-hidden">
        <video
          ref={videoRef}
          src={sourceUrl}
          playsInline
          muted={isMuted}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onClick={handleTogglePlay}
          className="max-h-60 w-full object-contain cursor-pointer"
        />

        {/* Bottom scrim play & mute bar */}
        <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : `Preview ${playbackSpeed}x`}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums text-white/90">
              {formatVideoDuration(currentTime)} / {formatVideoDuration(effectiveDuration)}
            </span>
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
              title={isMuted ? 'Unmute preview' : 'Mute preview'}
              aria-label={isMuted ? 'Unmute preview' : 'Mute preview'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Scrubber, Speed & Nudge Controls */}
      <div className="p-3.5 space-y-3">
        {/* Dual-handle Interactive Timeline */}
        <div className="px-2">
          <div
            ref={trackRef}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative h-10 rounded-lg bg-slate-200 dark:bg-slate-800 select-none touch-none cursor-pointer"
          >
            {/* Left trimmed-out region */}
            <div
              className="absolute inset-y-0 left-0 rounded-l-lg bg-slate-900/35 dark:bg-black/50 pointer-events-none"
              style={{ width: `${startPct}%` }}
            />

            {/* Right trimmed-out region */}
            <div
              className="absolute inset-y-0 right-0 rounded-r-lg bg-slate-900/35 dark:bg-black/50 pointer-events-none"
              style={{ width: `${Math.max(0, 100 - endPct)}%` }}
            />

            {/* Selected active clip window */}
            <div
              className="absolute inset-y-0 bg-emerald-500/20 border-y-2 border-emerald-500 pointer-events-none"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`
              }}
            />

            {/* Playhead indicator */}
            <div
              className="absolute inset-y-0.5 w-0.5 bg-white shadow-xs pointer-events-none z-10"
              style={{ left: `${playheadPct}%` }}
            />

            {/* Start crop handle */}
            <button
              type="button"
              onPointerDown={(e) => handleHandlePointerDown('start', e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label="Adjust trim start time"
              title="Drag to crop video start"
              className="absolute top-0 bottom-0 -ml-2.5 w-5 rounded-l-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-sm cursor-ew-resize z-20 touch-none focus-visible:outline-2 focus-visible:outline-emerald-400"
              style={{ left: `${startPct}%` }}
            >
              <span className="w-0.5 h-4 bg-white/90 rounded-full" />
            </button>

            {/* End crop handle */}
            <button
              type="button"
              onPointerDown={(e) => handleHandlePointerDown('end', e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label="Adjust trim end time"
              title="Drag to crop video end"
              className="absolute top-0 bottom-0 -ml-2.5 w-5 rounded-r-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-sm cursor-ew-resize z-20 touch-none focus-visible:outline-2 focus-visible:outline-emerald-400"
              style={{ left: `${endPct}%` }}
            >
              <span className="w-0.5 h-4 bg-white/90 rounded-full" />
            </button>
          </div>
        </div>

        {/* Fine-tune step controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Start</span>
            <button
              type="button"
              onClick={() => updateStart(startSec - stepJump)}
              disabled={disabled || startSec <= 0}
              className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              -{stepJump}s
            </button>
            <span className="px-1.5 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
              {formatVideoDuration(startSec)}
            </span>
            <button
              type="button"
              onClick={() => updateStart(startSec + stepJump)}
              disabled={disabled || startSec + MIN_CLIP_SECONDS >= endSec}
              className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              +{stepJump}s
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">End</span>
            <button
              type="button"
              onClick={() => updateEnd(endSec - stepJump)}
              disabled={disabled || endSec - MIN_CLIP_SECONDS <= startSec}
              className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              -{stepJump}s
            </button>
            <span className="px-1.5 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
              {formatVideoDuration(endSec)}
            </span>
            <button
              type="button"
              onClick={() => updateEnd(endSec + stepJump)}
              disabled={disabled || endSec >= effectiveDuration}
              className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              +{stepJump}s
            </button>
          </div>
        </div>

        {/* Segmented Playback Speed Controls */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <Gauge className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Playback Speed</span>
          </div>
          <div className="inline-flex items-center rounded-lg bg-slate-200/75 dark:bg-slate-800 p-0.5 gap-0.5 overflow-x-auto max-w-full">
            {VIDEO_PLAYBACK_SPEED_OPTIONS.map((spd) => {
              const active = Math.abs(playbackSpeed - spd) < 0.01;
              return (
                <button
                  key={spd}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectSpeed(spd)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>
        </div>

        {/* Unboxed summary + Actions */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            Output <strong>{formatVideoDuration(outputSpan)}</strong>
            {playbackSpeed !== 1 ? ` @ ${playbackSpeed}x` : ''} · Max {formatVideoDuration(maxClipDurationSec)}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleReset}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onApplyTrim(
                  Number(startSec.toFixed(2)),
                  Number(endSec.toFixed(2)),
                  playbackSpeed
                )
              }
              disabled={disabled || selectedSpan < MIN_CLIP_SECONDS}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Clip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
