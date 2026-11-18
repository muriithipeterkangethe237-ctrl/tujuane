import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Music,
  Search,
  Play,
  Pause,
  Check,
  X,
  Volume2,
  Loader2,
  Video,
  SlidersHorizontal
} from 'lucide-react';
import { PostedVideoSound, SoundMixMode } from '../types/community';
import {
  fetchAvailablePostedVideoSounds,
  getAvailablePostedVideoSounds,
  resolvePostVideoAudioSource
} from '../services/communityService';
import { formatVideoDuration } from '../utils/videoProcessor';

interface PostedSoundPickerModalProps {
  isOpen: boolean;
  selectedSound?: PostedVideoSound | null;
  initialMixMode?: SoundMixMode;
  availableSounds?: PostedVideoSound[];
  audioSourceLabel?: string;
  onSelectSound: (sound: PostedVideoSound, mixMode: SoundMixMode) => void;
  onClearSound?: () => void;
  onClose: () => void;
}

export const PostedSoundPickerModal: React.FC<PostedSoundPickerModalProps> = ({
  isOpen,
  selectedSound,
  initialMixMode = 'replace',
  availableSounds,
  audioSourceLabel = 'Original / Mic Audio',
  onSelectSound,
  onClearSound,
  onClose
}) => {
  const [sounds, setSounds] = useState<PostedVideoSound[]>(() => {
    if (availableSounds && availableSounds.length > 0) return availableSounds;
    return getAvailablePostedVideoSounds();
  });
  const [isLoadingSounds, setIsLoadingSounds] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mixMode, setMixMode] = useState<SoundMixMode>(initialMixMode);

  const [playingPostId, setPlayingPostId] = useState<string | null>(null);
  const [loadingAudioPostId, setLoadingAudioPostId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewElRef = useRef<HTMLVideoElement | null>(null);
  const resolvedUrlMapRef = useRef<Map<string, string>>(new Map());
  const activePreviewIdRef = useRef<string | null>(null);

  const stopPreviewAudio = () => {
    activePreviewIdRef.current = null;
    if (previewElRef.current) {
      try {
        previewElRef.current.pause();
        previewElRef.current.currentTime = 0;
        previewElRef.current.removeAttribute('src');
        previewElRef.current.load();
      } catch {
        // ignore
      }
      previewElRef.current = null;
    }
    setPlayingPostId(null);
    setLoadingAudioPostId(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopPreviewAudio();
      return;
    }
    setMixMode(initialMixMode);
    setPreviewError(null);

    if (availableSounds && availableSounds.length > 0) {
      setSounds(availableSounds);
      return;
    }

    const immediate = getAvailablePostedVideoSounds();
    if (immediate.length > 0) {
      setSounds(immediate);
    }

    let cancelled = false;
    setIsLoadingSounds(immediate.length === 0);
    fetchAvailablePostedVideoSounds(36)
      .then((list) => {
        if (!cancelled && list.length > 0) {
          setSounds(list);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSounds(false);
      });

    return () => {
      cancelled = true;
      stopPreviewAudio();
    };
  }, [isOpen, initialMixMode, availableSounds]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopPreviewAudio();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredSounds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sounds;
    return sounds.filter(
      (s) =>
        s.soundTitle.toLowerCase().includes(q) ||
        s.authorName.toLowerCase().includes(q)
    );
  }, [sounds, searchQuery]);

  const handleTogglePreview = async (sound: PostedVideoSound) => {
    setPreviewError(null);
    if (playingPostId === sound.postId) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();
    activePreviewIdRef.current = sound.postId;
    setLoadingAudioPostId(sound.postId);

    try {
      let playable =
        sound.resolvedPlayableUrl || resolvedUrlMapRef.current.get(sound.postId);
      if (!playable) {
        playable = await resolvePostVideoAudioSource(sound);
        resolvedUrlMapRef.current.set(sound.postId, playable);
      }

      if (activePreviewIdRef.current !== sound.postId) return;

      const el = document.createElement('video');
      el.playsInline = true;
      el.loop = true;
      el.muted = false;
      el.volume = 1;
      el.preload = 'auto';
      el.src = playable;

      el.onended = () => {
        if (activePreviewIdRef.current === sound.postId) {
          setPlayingPostId(null);
        }
      };
      el.onerror = () => {
        if (activePreviewIdRef.current === sound.postId) {
          setPreviewError(`Could not preview audio from "${sound.soundTitle}".`);
          stopPreviewAudio();
        }
      };

      previewElRef.current = el;
      await el.play();
      if (activePreviewIdRef.current !== sound.postId) {
        el.pause();
        return;
      }
      setLoadingAudioPostId(null);
      setPlayingPostId(sound.postId);
    } catch (err: any) {
      if (activePreviewIdRef.current === sound.postId) {
        setPreviewError(err?.message || 'Unable to load sound preview.');
        stopPreviewAudio();
      }
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={() => {
        stopPreviewAudio();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a Posted Video Sound"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl text-slate-900 dark:text-slate-100 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">
                Use Posted Video Sound
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Pick audio from any posted community video
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopPreviewAudio();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close sound picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Audio Mix Mode */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sound title or creator name..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-100 dark:bg-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Audio Mix:</span>
            </span>
            <div className="grid grid-cols-2 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold flex-1 min-w-[220px]">
              <button
                type="button"
                onClick={() => setMixMode('replace')}
                className={`py-1.5 px-2.5 rounded-lg transition-all cursor-pointer ${
                  mixMode === 'replace'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sound Only
              </button>
              <button
                type="button"
                onClick={() => setMixMode('mix')}
                className={`py-1.5 px-2.5 rounded-lg transition-all cursor-pointer truncate ${
                  mixMode === 'mix'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Mix posted sound with ${audioSourceLabel}`}
              >
                Mix + {audioSourceLabel.includes('Mic') ? 'Mic' : 'Original'}
              </button>
            </div>
          </div>

          {previewError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300">
              {previewError}
            </div>
          )}
        </div>

        {/* Sound List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {isLoadingSounds ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span>Loading posted video sounds...</span>
            </div>
          ) : filteredSounds.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Video className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {searchQuery ? 'No matching video sounds found' : 'No posted video sounds yet'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {searchQuery
                  ? 'Try another keyword or clear your search filter.'
                  : 'Once community short videos are posted, their sounds will appear here for reuse.'}
              </p>
            </div>
          ) : (
            filteredSounds.map((sound) => {
              const isSelected = selectedSound?.postId === sound.postId;
              const isPlaying = playingPostId === sound.postId;
              const isFetching = loadingAudioPostId === sound.postId;
              const cachedUrl = resolvedUrlMapRef.current.get(sound.postId);
              const resolvedSound: PostedVideoSound = cachedUrl
                ? { ...sound, resolvedPlayableUrl: cachedUrl }
                : sound;

              return (
                <div
                  key={sound.postId}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-400 dark:border-indigo-700'
                      : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/70 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                >
                  {/* Thumbnail + Audition Button */}
                  <button
                    type="button"
                    onClick={() => handleTogglePreview(sound)}
                    className="relative w-12 h-14 rounded-xl overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center group cursor-pointer"
                    title={isPlaying ? 'Pause sound preview' : 'Play sound preview'}
                  >
                    {sound.thumbnailDataUrl ? (
                      <img
                        src={sound.thumbnailDataUrl}
                        alt={sound.soundTitle}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
                      />
                    ) : (
                      <Music className="w-5 h-5 text-indigo-400" />
                    )}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      {isFetching ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-4 h-4 text-white fill-white" />
                      ) : (
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </button>

                  {/* Sound Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isPlaying && (
                        <Volume2 className="w-3.5 h-3.5 text-indigo-500 animate-pulse shrink-0" />
                      )}
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {sound.soundTitle}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      <span className="truncate">{sound.authorName}</span>
                      {sound.duration ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums shrink-0">
                            {formatVideoDuration(sound.duration)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Select Action */}
                  <button
                    type="button"
                    onClick={() => {
                      stopPreviewAudio();
                      onSelectSound(resolvedSound, mixMode);
                      onClose();
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    <span>{isSelected ? 'Selected' : 'Use Sound'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70 shrink-0">
          {selectedSound && onClearSound ? (
            <button
              type="button"
              onClick={() => {
                stopPreviewAudio();
                onClearSound();
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            >
              Remove Selected Sound
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {filteredSounds.length} sound{filteredSounds.length === 1 ? '' : 's'} available
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              stopPreviewAudio();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};
