import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Mic, AlertCircle } from 'lucide-react';
import { VoiceNoteData } from '../../types/chat';

interface VoiceNotePlayerProps {
  messageId: string;
  voiceNote: VoiceNoteData;
  isMe: boolean;
}

const CHAT_AUDIO_PLAY_EVENT = 'tujuane:chat-audio-play';
const DEFAULT_BAR_COUNT = 26;

export function formatVoiceNoteSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  messageId,
  voiceNote,
  isMe
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(voiceNote.duration || 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const waveformBars = useMemo(() => {
    if (Array.isArray(voiceNote.waveform) && voiceNote.waveform.length >= 8) {
      return voiceNote.waveform.map((n) => Math.max(18, Math.min(100, Math.round(n))));
    }
    let seed = 0;
    for (let i = 0; i < messageId.length; i++) {
      seed = (seed * 31 + messageId.charCodeAt(i)) % 9973;
    }
    const bars: number[] = [];
    for (let i = 0; i < DEFAULT_BAR_COUNT; i++) {
      seed = (seed * 48271 + 17) % 2147483647;
      bars.push((seed % 68) + 24);
    }
    return bars;
  }, [voiceNote.waveform, messageId]);

  // Pause automatically when another voice note starts playing
  useEffect(() => {
    const handleOtherPlay = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ messageId: string }>;
      if (customEvt.detail?.messageId !== messageId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener(CHAT_AUDIO_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(CHAT_AUDIO_PLAY_EVENT, handleOtherPlay);
  }, [messageId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleTogglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !voiceNote.dataUrl) return;
    setAudioError(null);

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      window.dispatchEvent(new CustomEvent(CHAT_AUDIO_PLAY_EVENT, { detail: { messageId } }));
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setAudioError('Audio unavailable on this device.');
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const effectiveDuration = duration || voiceNote.duration || 0;
    if (!audio || effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * effectiveDuration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleCycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaybackRate((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const effectiveDuration = duration || voiceNote.duration || 0;
  const progressRatio = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="min-w-[220px] sm:min-w-[250px] max-w-full space-y-1.5 select-none"
    >
      <audio
        ref={audioRef}
        src={voiceNote.dataUrl}
        preload="metadata"
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (el && isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsPlaying(false);
          setAudioError('Voice note format unsupported.');
        }}
        className="hidden"
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
            isMe
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 dark:bg-white dark:hover:bg-emerald-50 dark:text-emerald-800'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Interactive Waveform Bars */}
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Voice note progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            className="h-7 flex items-center gap-[2.5px] cursor-pointer"
          >
            {waveformBars.map((barHeight, idx) => {
              const barRatio = (idx + 1) / waveformBars.length;
              const isPlayed = barRatio <= progressRatio;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-full transition-colors duration-100 ${
                    isMe
                      ? isPlayed
                        ? 'bg-emerald-400 dark:bg-white'
                        : 'bg-white/30 dark:bg-emerald-200/35 hover:bg-white/55'
                      : isPlayed
                      ? 'bg-emerald-600 dark:bg-emerald-400'
                      : 'bg-slate-300 dark:bg-slate-600 hover:bg-emerald-400/70'
                  }`}
                  style={{ height: `${barHeight}%` }}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span
              className={`inline-flex items-center gap-1 font-mono tabular-nums font-semibold ${
                isMe ? 'text-slate-300 dark:text-emerald-100' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Mic className={`w-3 h-3 ${isPlaying ? 'animate-pulse text-rose-400' : ''}`} />
              <span>
                {isPlaying || currentTime > 0
                  ? `${formatVoiceNoteSeconds(currentTime)} / ${formatVoiceNoteSeconds(effectiveDuration)}`
                  : formatVoiceNoteSeconds(effectiveDuration)}
              </span>
            </span>

            <button
              type="button"
              onClick={handleCycleSpeed}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums transition-colors cursor-pointer ${
                isMe
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
              }`}
              title="Change playback speed"
            >
              {playbackRate}×
            </button>
          </div>
        </div>
      </div>

      {audioError && (
        <div className="text-[10px] text-rose-300 dark:text-rose-200 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{audioError}</span>
        </div>
      )}
    </div>
  );
};
