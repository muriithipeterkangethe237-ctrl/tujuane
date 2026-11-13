import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Trash2, AlertCircle, Volume2 } from 'lucide-react';
import { formatFileSize } from '../utils/imageCompressor';

export const MAX_AUDIO_SHOUT_SECONDS = 30;
const MAX_AUDIO_RAW_BYTES = 680 * 1024; // ~906 KB Base64, safely under Firestore 950KB limit
const WAVEFORM_BAR_COUNT = 22;

export interface RecordedVoiceShout {
  dataUrl: string;
  previewObjectUrl: string;
  duration: number;
  sizeBytes: number;
  mimeType: string;
}

interface VoiceShoutRecorderProps {
  recordedShout: RecordedVoiceShout | null;
  onRecorded: (shout: RecordedVoiceShout) => void;
  onClear: () => void;
  disabled?: boolean;
}

function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatShoutSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceShoutRecorder: React.FC<VoiceShoutRecorderProps> = ({
  recordedShout,
  onRecorded,
  onClear,
  disabled = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(WAVEFORM_BAR_COUNT).fill(18));

  // Preview playback states
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const cleanupRecordingResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore
      }
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    setLevels(Array(WAVEFORM_BAR_COUNT).fill(18));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources]);

  // Reset preview playback when recorded shout changes or clears
  useEffect(() => {
    setIsPlayingPreview(false);
    setPreviewCurrentTime(0);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
  }, [recordedShout?.previewObjectUrl]);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        cleanupRecordingResources();
        setIsRecording(false);
        stoppingRef.current = false;
      }
    } else {
      cleanupRecordingResources();
      setIsRecording(false);
      stoppingRef.current = false;
    }
  }, [cleanupRecordingResources]);

  const startVisualizerLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      if (!analyserRef.current || !isMountedRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const nextBars: number[] = [];
      for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
        const idx = Math.min(bufferLength - 1, Math.floor((i / WAVEFORM_BAR_COUNT) * bufferLength));
        const val = dataArray[idx] || 0;
        const pct = Math.max(14, Math.min(100, Math.round((val / 255) * 100)));
        nextBars.push(pct);
      }
      setLevels(nextBars);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const handleStartRecording = async () => {
    if (disabled || isRecording || isProcessing) return;
    if (!isSupported) {
      setRecorderError('Voice recording is not supported in this browser. Try Chrome, Edge, Firefox, or Safari.');
      return;
    }

    setRecorderError(null);
    stoppingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Setup live frequency analyzer for real-time audio meter bars
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          source.connect(analyser);
          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          startVisualizerLoop();
        }
      } catch {
        // Optional visualizer — recording still works cleanly without AudioContext
      }

      const preferredMime = pickSupportedAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      } catch {
        recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      }

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (evt: BlobEvent) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onerror = () => {
        if (!isMountedRef.current) return;
        setRecorderError('Microphone recording interrupted. Please try again.');
        cleanupRecordingResources();
        setIsRecording(false);
        stoppingRef.current = false;
      };

      recorder.onstop = () => {
        const finalDuration = Math.min(
          MAX_AUDIO_SHOUT_SECONDS,
          Math.max(0, Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)))
        );
        const actualMime = recorder.mimeType || preferredMime || 'audio/webm';
        const recordedChunks = chunksRef.current;
        chunksRef.current = [];

        cleanupRecordingResources();

        if (!isMountedRef.current) return;
        setIsRecording(false);
        stoppingRef.current = false;

        if (recordedChunks.length === 0 || finalDuration < 0.7) {
          setRecorderError('Voice shout was too short. Hold and speak for at least 1 second.');
          setElapsedSeconds(0);
          return;
        }

        const blob = new Blob(recordedChunks, { type: actualMime });
        if (blob.size > MAX_AUDIO_RAW_BYTES) {
          setRecorderError(
            `Recorded audio (${formatFileSize(blob.size)}) exceeds the 680 KB limit. Try a slightly shorter shout.`
          );
          setElapsedSeconds(0);
          return;
        }

        setIsProcessing(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result || !result.startsWith('data:')) {
            setRecorderError('Could not encode recorded audio. Please try again.');
            return;
          }
          const previewObjectUrl = URL.createObjectURL(blob);
          onRecorded({
            dataUrl: result,
            previewObjectUrl,
            duration: Math.max(1, Math.round(finalDuration)),
            sizeBytes: blob.size,
            mimeType: actualMime
          });
        };
        reader.onerror = () => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          setRecorderError('Failed to process audio clip. Please record again.');
        };
        reader.readAsDataURL(blob);
      };

      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startTimeRef.current) / 1000;
        if (secs >= MAX_AUDIO_SHOUT_SECONDS) {
          setElapsedSeconds(MAX_AUDIO_SHOUT_SECONDS);
          stopRecording();
        } else {
          setElapsedSeconds(secs);
        }
      }, 100);
    } catch (err: any) {
      cleanupRecordingResources();
      setIsRecording(false);
      stoppingRef.current = false;
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setRecorderError('Microphone access was denied. Please allow mic permission in your browser settings.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setRecorderError('No microphone detected on this device.');
      } else {
        setRecorderError('Could not start microphone recording. Check device permissions and try again.');
      }
    }
  };

  const handleTogglePreviewPlayback = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
    } else {
      audio
        .play()
        .then(() => setIsPlayingPreview(true))
        .catch(() => setRecorderError('Could not play recorded preview.'));
    }
  };

  const handleReRecord = () => {
    onClear();
    setElapsedSeconds(0);
    setRecorderError(null);
    setTimeout(() => {
      handleStartRecording();
    }, 80);
  };

  const remainingSeconds = Math.max(0, Math.ceil(MAX_AUDIO_SHOUT_SECONDS - elapsedSeconds));
  const recordProgressPct = Math.min(100, (elapsedSeconds / MAX_AUDIO_SHOUT_SECONDS) * 100);

  return (
    <div className="rounded-2xl tujuane-surface-soft p-4 space-y-3 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
              {isRecording ? 'Recording Voice Shout...' : recordedShout ? 'Voice Shout Ready' : '30-Second Voice Shout'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isRecording
                ? `${remainingSeconds}s remaining — auto-stops at 0:30`
                : recordedShout
                ? `${formatShoutSeconds(recordedShout.duration)} · ${formatFileSize(recordedShout.sizeBytes)}`
                : 'Tap mic to record up to 30 seconds of audio for the feed'}
            </div>
          </div>
        </div>

        <div className="text-xs font-mono font-bold tabular-nums px-2.5 py-1 rounded-lg bg-slate-900/5 dark:bg-white/10 text-slate-800 dark:text-slate-200 shrink-0">
          {isRecording
            ? `${formatShoutSeconds(Math.floor(elapsedSeconds))} / 0:${MAX_AUDIO_SHOUT_SECONDS}`
            : recordedShout
            ? `${formatShoutSeconds(previewCurrentTime)} / ${formatShoutSeconds(recordedShout.duration)}`
            : `0:00 / 0:${MAX_AUDIO_SHOUT_SECONDS}`}
        </div>
      </div>

      {recorderError && (
        <div className="p-2.5 rounded-xl bg-rose-500/12 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{recorderError}</span>
        </div>
      )}

      {/* Recording State */}
      {isRecording ? (
        <div className="space-y-3">
          {/* Live Equalizer Bars */}
          <div
            className="h-14 px-3 rounded-xl bg-slate-950/90 flex items-center justify-between gap-1"
            aria-label="Live microphone waveform"
          >
            {levels.map((heightPct, idx) => (
              <div
                key={idx}
                className="flex-1 rounded-full bg-gradient-to-t from-emerald-500 via-emerald-400 to-rose-400 transition-[height] duration-75"
                style={{ height: `${heightPct}%` }}
              />
            ))}
          </div>

          {/* 30s Progress Bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-rose-600 transition-all duration-100"
              style={{ width: `${recordProgressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              <span>MIC LIVE</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>Stop & Preview</span>
            </button>
          </div>
        </div>
      ) : isProcessing ? (
        <div className="py-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span>Finalizing voice shout...</span>
        </div>
      ) : recordedShout ? (
        /* Recorded Preview State */
        <div className="space-y-3">
          <audio
            ref={previewAudioRef}
            src={recordedShout.previewObjectUrl}
            preload="metadata"
            onTimeUpdate={() => {
              if (previewAudioRef.current) {
                setPreviewCurrentTime(previewAudioRef.current.currentTime);
              }
            }}
            onEnded={() => {
              setIsPlayingPreview(false);
              setPreviewCurrentTime(0);
            }}
            className="hidden"
          />

          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/70">
            <button
              type="button"
              onClick={handleTogglePreviewPlayback}
              disabled={disabled}
              className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer shadow-xs"
              aria-label={isPlayingPreview ? 'Pause voice preview' : 'Play voice preview'}
            >
              {isPlayingPreview ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            </button>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Preview Shout</span>
                </span>
                <span className="tabular-nums font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {formatShoutSeconds(previewCurrentTime)} / {formatShoutSeconds(recordedShout.duration)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-100"
                  style={{
                    width: `${
                      recordedShout.duration > 0
                        ? Math.min(100, (previewCurrentTime / recordedShout.duration) * 100)
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReRecord}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-record</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/12 transition-colors cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          </div>
        </div>
      ) : (
        /* Idle / Ready to Record State */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            Share a quick county update, matatu traffic shoutout, or community question with your voice.
          </div>
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={disabled || !isSupported}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Mic className="w-4 h-4" />
            <span>Start Recording (30s)</span>
          </button>
        </div>
      )}
    </div>
  );
};
