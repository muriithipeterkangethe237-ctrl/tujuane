import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Mic, AlertCircle } from 'lucide-react';
import { CommunityPost } from '../types/community';
import { formatShoutSeconds } from './VoiceShoutRecorder';

interface FeedAudioPlayerProps {
  post: CommunityPost;
}

const WAVE_BAR_COUNT = 30;
const AUDIO_PLAY_EVENT = 'tujuane:feed-audio-play';

export const FeedAudioPlayer: React.FC<FeedAudioPlayerProps> = ({ post }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(post.audioDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5>(1);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Deterministic bar heights seeded from post.id so each shout has a unique natural waveform
  const waveformBars = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < post.id.length; i++) {
      seed = (seed * 31 + post.id.charCodeAt(i)) % 9973;
    }
    const bars: number[] = [];
    for (let i = 0; i < WAVE_BAR_COUNT; i++) {
      seed = (seed * 48271 + 17) % 2147483647;
      const normalized = (seed % 70) + 25; // 25% to 94% height
      bars.push(normalized);
    }
    return bars;
  }, [post.id]);

  // Pause automatically when another Voice Shout starts playing in the feed
  useEffect(() => {
    const handleOtherPlay = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ postId: string }>;
      if (customEvt.detail?.postId !== post.id && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
  }, [post.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleTogglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !post.mediaUrl) return;
    setAudioError(null);

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: { postId: post.id } }));
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setAudioError('Could not play this audio shout.');
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const effectiveDuration = duration || post.audioDuration || 0;
    if (!audio || effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * effectiveDuration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleCycleSpeed = () => {
    setPlaybackRate((prev) => (prev === 1 ? 1.5 : 1));
  };

  const effectiveDuration = duration || post.audioDuration || 0;
  const progressRatio = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  return (
    <div className="rounded-2xl tujuane-surface-soft p-3.5 sm:p-4 space-y-2.5 transition-colors">
      <audio
        ref={audioRef}
        src={post.mediaUrl}
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
          setAudioError('Audio format is unavailable on this browser.');
        }}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        {/* Play / Pause Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shrink-0 shadow-xs transition-all cursor-pointer"
          aria-label={isPlaying ? 'Pause voice shout' : 'Play voice shout'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        {/* Interactive Waveform & Timer */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300">
              <Mic className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse text-rose-500' : ''}`} />
              <span>Voice Shout</span>
            </span>

            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {formatShoutSeconds(currentTime)} / {formatShoutSeconds(effectiveDuration)}
              </span>
              <button
                type="button"
                onClick={handleCycleSpeed}
                className="px-1.5 py-0.5 rounded-md bg-slate-900/10 dark:bg-white/10 hover:bg-slate-900/20 dark:hover:bg-white/20 text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                title="Toggle playback speed"
              >
                {playbackRate}×
              </button>
            </div>
          </div>

          {/* Clickable Waveform Progress Bar */}
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Audio playback progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            className="h-9 flex items-center gap-[3px] cursor-pointer select-none"
          >
            {waveformBars.map((barHeight, idx) => {
              const barRatio = (idx + 1) / waveformBars.length;
              const isPlayed = barRatio <= progressRatio;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-full transition-colors duration-150 ${
                    isPlayed
                      ? 'bg-emerald-600 dark:bg-emerald-400'
                      : 'bg-slate-300 dark:bg-slate-600 hover:bg-emerald-400/70'
                  }`}
                  style={{ height: `${barHeight}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {audioError && (
        <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{audioError}</span>
        </div>
      )}
    </div>
  );
};
