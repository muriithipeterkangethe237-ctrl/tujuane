import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Maximize2,
  Video,
  AlertCircle,
  Volume2,
  VolumeX
} from 'lucide-react';
import { CommunityPost } from '../types/community';
import {
  fetchAndAssemblePostVideo,
  fetchPostVideoHeadSegment,
  getCachedPostVideoHeadUrl,
  getCachedPostVideoUrl
} from '../services/communityService';
import { formatVideoDuration, resolvePlayableVideoUrl } from '../utils/videoProcessor';
import { formatFileSize } from '../utils/imageCompressor';
import { reportAppCrash } from '../services/telemetryService';

interface FeedVideoPlayerProps {
  post: CommunityPost;
  preloadHint?: 'active' | 'adjacent' | 'idle';
  onActiveInView?: (postId: string, isVisible: boolean) => void;
  onOpenTheatre: (resolvedUrl: string) => void;
}

const FULLSCREEN_VIDEO_OPEN_EVENT = 'tujuane:fullscreen-video-open';
const FEED_VIDEO_PLAYING_EVENT = 'tujuane:feed-video-playing';

const FeedVideoPlayerInner: React.FC<FeedVideoPlayerProps> = ({
  post,
  preloadHint = 'idle',
  onActiveInView,
  onOpenTheatre
}) => {
  const [fullUrl, setFullUrl] = useState<string | null>(() => {
    const cachedFull = getCachedPostVideoUrl(post.id);
    if (cachedFull) return cachedFull;
    return post.mediaUrl ? resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl : null;
  });
  const [headUrl, setHeadUrl] = useState<string | null>(() => {
    if (getCachedPostVideoUrl(post.id) || post.mediaUrl) return null;
    return getCachedPostVideoHeadUrl(post.id);
  });
  const [isHeadLoading, setIsHeadLoading] = useState(false);
  const [isHeadFailed, setIsHeadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const onActiveInViewRef = useRef(onActiveInView);
  onActiveInViewRef.current = onActiveInView;

  const clearBufferingTimer = useCallback(() => {
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
  }, []);

  const scheduleBufferingIndicator = useCallback(() => {
    if (bufferingTimerRef.current) return;
    bufferingTimerRef.current = setTimeout(() => {
      bufferingTimerRef.current = null;
      if (isMountedRef.current) setIsBuffering(true);
    }, 250);
  }, []);

  const stopBufferingIndicator = useCallback(() => {
    clearBufferingTimer();
    setIsBuffering(false);
  }, [clearBufferingTimer]);

  const activeSrc = fullUrl || (!isHeadFailed ? headUrl : null);
  const isPartialHeadOnly = Boolean(
    !fullUrl && headUrl && !isHeadFailed && (post.videoChunkCount ?? 0) > 1
  );
  const canPlayCurrentSrc = Boolean(activeSrc && !isPartialHeadOnly);

  // Mount the native <video> decoder ONLY when a full playable video URL is ready AND the card is
  // actively focused/visible so off-screen cards don't hold competing hardware video decoders.
  const shouldMountVideoElement = Boolean(
    activeSrc &&
      canPlayCurrentSrc &&
      (isInView || preloadHint === 'active')
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearBufferingTimer();
    };
  }, [clearBufferingTimer]);

  // Sync if post.mediaUrl or cached full/head URL becomes available
  useEffect(() => {
    if (!fullUrl) {
      const cachedFull = getCachedPostVideoUrl(post.id);
      if (cachedFull) {
        setFullUrl(cachedFull);
        return;
      }
      if (post.mediaUrl) {
        setFullUrl(resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl);
        return;
      }
    }
    if (!fullUrl && !headUrl && !isHeadFailed) {
      const cachedHead = getCachedPostVideoHeadUrl(post.id);
      if (cachedHead) setHeadUrl(cachedHead);
    }
  }, [post.id, post.mediaUrl, fullUrl, headUrl, isHeadFailed]);

  // Tier-1: Preload ONLY chunk_0 (first few frames) for adjacent / approaching videos
  const ensureHeadPreloaded = useCallback(async (): Promise<string | null> => {
    if (fullUrl) return fullUrl;
    const cachedFull = getCachedPostVideoUrl(post.id);
    if (cachedFull) {
      if (isMountedRef.current) setFullUrl(cachedFull);
      return cachedFull;
    }
    if (post.mediaUrl) {
      const fastUrl = resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl;
      if (isMountedRef.current) setFullUrl(fastUrl);
      return fastUrl;
    }
    if (headUrl && !isHeadFailed) return headUrl;
    if (isHeadLoading || isHeadFailed || !post.videoChunkCount || post.videoChunkCount <= 0) {
      return null;
    }

    setIsHeadLoading(true);
    try {
      const segmentUrl = await fetchPostVideoHeadSegment(
        post.id,
        post.videoMimeType || 'video/mp4',
        post.videoChunkCount
      );
      if (!isMountedRef.current) return segmentUrl;
      const promotedFull = getCachedPostVideoUrl(post.id);
      if (promotedFull) {
        setFullUrl(promotedFull);
        return promotedFull;
      }
      if (segmentUrl) {
        setHeadUrl(segmentUrl);
      } else {
        setIsHeadFailed(true);
      }
      return segmentUrl;
    } catch {
      if (isMountedRef.current) {
        setIsHeadFailed(true);
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsHeadLoading(false);
      }
    }
  }, [
    fullUrl,
    headUrl,
    isHeadFailed,
    isHeadLoading,
    post.id,
    post.mediaUrl,
    post.videoChunkCount,
    post.videoMimeType
  ]);

  // Tier-2: Load full assembled Blob only when video is actively viewed or tapped
  const ensureFullPlayableUrl = useCallback(async (): Promise<string | null> => {
    if (fullUrl) return fullUrl;
    const cachedFull = getCachedPostVideoUrl(post.id);
    if (cachedFull) {
      if (isMountedRef.current) setFullUrl(cachedFull);
      return cachedFull;
    }
    if (post.mediaUrl) {
      const fastUrl = resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl;
      if (isMountedRef.current) setFullUrl(fastUrl);
      return fastUrl;
    }
    if (!post.videoChunkCount || post.videoChunkCount <= 0) {
      setLoadError('Video media is unavailable.');
      return null;
    }
    if (isLoading) return null;

    setIsLoading(true);
    setLoadError(null);
    try {
      const blobUrl = await fetchAndAssemblePostVideo(
        post.id,
        post.videoMimeType || 'video/mp4',
        post.videoChunkCount
      );
      if (isMountedRef.current) {
        setFullUrl(blobUrl);
      }
      return blobUrl;
    } catch (err) {
      console.error('Failed to load feed video:', err);
      if (isMountedRef.current) {
        setLoadError('Could not load video clip. Tap to retry.');
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fullUrl, isLoading, post.id, post.mediaUrl, post.videoChunkCount, post.videoMimeType]);

  // Lazy proximity observer: detect when video card enters adjacent zone (only preloads first frames)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const nearObserver = new IntersectionObserver(
      (entries) => {
        const near = entries.some((e) => e.isIntersecting);
        setIsNearViewport((prev) => (prev === near ? prev : near));
      },
      { rootMargin: '450px 0px', threshold: 0.01 }
    );

    nearObserver.observe(el);
    return () => nearObserver.disconnect();
  }, []);

  // Trigger opening-frame preload ONLY when adjacent/near viewport (never downloads full chunks eagerly)
  useEffect(() => {
    if (
      (isNearViewport || preloadHint === 'adjacent') &&
      !fullUrl &&
      !headUrl &&
      !isHeadFailed &&
      !isHeadLoading &&
      (post.videoChunkCount ?? 0) > 0
    ) {
      void ensureHeadPreloaded();
    }
  }, [
    isNearViewport,
    preloadHint,
    fullUrl,
    headUrl,
    isHeadFailed,
    isHeadLoading,
    post.videoChunkCount,
    ensureHeadPreloaded
  ]);

  // Observe active viewport visibility with hysteresis (>= 0.42 enter, < 0.18 exit) so
  // minor scroll bounce never unmounts or stutters active playback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const ratio = entry.intersectionRatio;
        setIsInView((prev) => {
          const next = prev ? entry.isIntersecting && ratio >= 0.18 : entry.isIntersecting && ratio >= 0.42;
          if (next !== prev) {
            onActiveInViewRef.current?.(post.id, next);
          }
          return next;
        });
      },
      { threshold: [0.1, 0.18, 0.42, 0.65] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      onActiveInViewRef.current?.(post.id, false);
    };
  }, [post.id]);

  // Upgrade from head frames to full video when actively in viewport
  useEffect(() => {
    if (
      (isInView || preloadHint === 'active') &&
      !fullUrl &&
      !isLoading &&
      !loadError &&
      (post.videoChunkCount ?? 0) > 0
    ) {
      void ensureFullPlayableUrl();
    }
  }, [
    isInView,
    preloadHint,
    fullUrl,
    isLoading,
    loadError,
    post.videoChunkCount,
    ensureFullPlayableUrl
  ]);

  const tryStartPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !canPlayCurrentSrc || !isInView || userPaused) return;
    video.loop = true;
    video.muted = isMuted;
    if (!video.paused) return;
    window.dispatchEvent(new CustomEvent(FEED_VIDEO_PLAYING_EVENT, { detail: { postId: post.id } }));
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          if (isMountedRef.current) {
            setIsPlaying(true);
            stopBufferingIndicator();
          }
        })
        .catch(() => {
          if (!video.muted) {
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                if (isMountedRef.current) {
                  setIsPlaying(true);
                  stopBufferingIndicator();
                }
              })
              .catch(() => {});
          }
        });
    }
  }, [canPlayCurrentSrc, isInView, userPaused, isMuted, post.id, stopBufferingIndicator]);

  // Keep native DOM `.loop` property synced when full video replaces head preview
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = canPlayCurrentSrc;
  }, [shouldMountVideoElement, activeSrc, canPlayCurrentSrc]);

  // Auto-play / pause based on viewport visibility (only auto-play full clip to avoid mid-playback src swap stutter)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlayCurrentSrc || !shouldMountVideoElement) {
      if (!shouldMountVideoElement) setIsPlaying(false);
      return;
    }

    if (isInView && !userPaused) {
      tryStartPlayback();
    } else if (!isInView && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }
  }, [isInView, canPlayCurrentSrc, shouldMountVideoElement, userPaused, tryStartPlayback]);

  // Drive playback progress bar at 60fps with requestAnimationFrame instead of coarse 4Hz timeupdate events
  useEffect(() => {
    if (!isPlaying || !canPlayCurrentSrc) return;
    let rafId = 0;
    const tick = () => {
      const v = videoRef.current;
      const bar = progressBarRef.current;
      if (v && bar) {
        const denom =
          v.duration && isFinite(v.duration) && v.duration > 0
            ? v.duration
            : post.videoDuration && post.videoDuration > 0
            ? post.videoDuration
            : 0;
        if (denom > 0 && isFinite(denom)) {
          const ratio = Math.min(1, Math.max(0, v.currentTime / denom));
          bar.style.transform = `scaleX(${ratio})`;
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, canPlayCurrentSrc, post.videoDuration]);

  // Pause inline feed playback whenever full-screen viewer opens OR another feed card takes active focus
  useEffect(() => {
    const handleFullScreenOpen = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };
    const handleOtherVideoPlaying = (evt: Event) => {
      const otherId = (evt as CustomEvent<{ postId?: string }>).detail?.postId;
      if (otherId && otherId !== post.id && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener(FULLSCREEN_VIDEO_OPEN_EVENT, handleFullScreenOpen);
    window.addEventListener(FEED_VIDEO_PLAYING_EVENT, handleOtherVideoPlaying);
    return () => {
      window.removeEventListener(FULLSCREEN_VIDEO_OPEN_EVENT, handleFullScreenOpen);
      window.removeEventListener(FEED_VIDEO_PLAYING_EVENT, handleOtherVideoPlaying);
    };
  }, [post.id]);

  // Open full-screen Reels viewer immediately on tap without blocking on chunk download
  const handleOpenFullScreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.dispatchEvent(new CustomEvent(FULLSCREEN_VIDEO_OPEN_EVENT));
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    const immediateFullUrl =
      fullUrl ||
      getCachedPostVideoUrl(post.id) ||
      (post.mediaUrl ? resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl : '');
    onOpenTheatre(immediateFullUrl || '');
  };

  const handleTogglePlayInline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setUserPaused(false);
    if (!canPlayCurrentSrc) {
      await ensureFullPlayableUrl();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.muted = isMuted;
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      setUserPaused(true);
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (video) {
      video.muted = nextMuted;
      if (!nextMuted && video.paused) {
        setUserPaused(false);
        video.play().catch(() => {});
      }
    }
  };

  const durationText = formatVideoDuration(post.videoDuration);
  const sizeText = post.videoSizeBytes ? formatFileSize(post.videoSizeBytes) : null;

  return (
    <div
      ref={containerRef}
      onClick={handleOpenFullScreen}
      className="relative bg-black flex items-center justify-center min-h-[240px] max-h-[480px] cursor-pointer select-none overflow-hidden group"
      title="Tap to watch in full-screen Short Video Reels"
    >
      {shouldMountVideoElement && activeSrc ? (
        <video
          ref={videoRef}
          src={activeSrc}
          poster={post.videoThumbnail}
          muted={isMuted}
          loop={!isPartialHeadOnly}
          playsInline
          preload={canPlayCurrentSrc && isInView ? 'auto' : 'metadata'}
          onLoadedData={() => {
            // Keep adjacent preloaded videos paused on frame 0 until active full playback
            const v = videoRef.current;
            if (v && (!isInView || isPartialHeadOnly) && !v.paused) {
              v.pause();
            }
          }}
          onCanPlay={() => {
            stopBufferingIndicator();
            if (canPlayCurrentSrc && isInView && !userPaused) {
              tryStartPlayback();
            }
          }}
          onWaiting={scheduleBufferingIndicator}
          onPlaying={() => {
            setIsPlaying(true);
            stopBufferingIndicator();
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (isPartialHeadOnly) {
              void ensureFullPlayableUrl();
              return;
            }
            const v = videoRef.current;
            if (v && !v.loop && !userPaused) {
              v.currentTime = 0;
              v.muted = isMuted;
              v.play()
                .then(() => {
                  if (isMountedRef.current) setIsPlaying(true);
                })
                .catch(() => {});
            }
          }}
          onError={() => {
            stopBufferingIndicator();
            if (isPartialHeadOnly) {
              // Partial chunk_0 may lack faststart moov atom; silently fallback to full video load
              setIsHeadFailed(true);
              void ensureFullPlayableUrl();
              return;
            }
            void reportAppCrash({
              error: new Error('Feed video playback error'),
              category: 'media_playback',
              severity: 'warning',
              context: `post:${post.id}`
            });
            setLoadError('Could not play this video clip. Tap to retry.');
          }}
          className="w-full max-h-[480px] object-contain bg-black transform-gpu will-change-transform"
        />
      ) : post.videoThumbnail ? (
        <img
          src={post.videoThumbnail}
          alt={post.mediaCaption || post.title || 'Short video thumbnail'}
          loading="lazy"
          decoding="async"
          className="w-full max-h-[480px] object-contain opacity-95 group-hover:opacity-100 transition-opacity"
        />
      ) : (
        <div className="w-full h-60 bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-950 flex items-center justify-center">
          <Video className="w-12 h-12 text-indigo-400/50" />
        </div>
      )}

      {/* Sleek subtle top progress bar while downloading or buffering (no noisy center toggle) */}
      {(isLoading || isBuffering) && !loadError && (
        <div className="pointer-events-none absolute top-0 inset-x-0 h-0.5 bg-white/15 overflow-hidden z-20">
          <div className="h-full w-1/3 bg-indigo-400 animate-pulse rounded-full" />
        </div>
      )}

      {/* Center overlay when errored or explicitly paused/ready */}
      {loadError ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setLoadError(null);
            void ensureFullPlayableUrl();
          }}
          className="absolute inset-0 bg-black/55 flex items-center justify-center z-10"
        >
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-950/95 text-rose-100 shadow-lg">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">{loadError}</span>
          </div>
        </div>
      ) : !isPlaying && (!isInView || userPaused || !canPlayCurrentSrc) ? (
        <div className="pointer-events-none absolute inset-0 bg-black/15 flex items-center justify-center">
          <div className="w-13 h-13 rounded-full bg-black/75 text-white flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      ) : null}

      {/* Top Left Badges */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold tabular-nums flex items-center gap-1">
          <Video className="w-3 h-3 text-indigo-400" />
          <span>{post.videoDuration ? durationText : 'Short Video'}</span>
        </span>
        {sizeText && (
          <span className="px-2 py-0.5 rounded-md bg-black/65 text-slate-200 text-[10px] font-medium tabular-nums">
            {sizeText}
          </span>
        )}
      </div>

      {/* Top Right Full Screen Expand Button */}
      <button
        type="button"
        onClick={handleOpenFullScreen}
        className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-black/75 hover:bg-black/90 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer z-10"
        title="Watch in full-screen Reels view"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Full Screen</span>
      </button>

      {/* Bottom Right Quick Play/Pause & Mute Controls */}
      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10">
        <button
          type="button"
          onClick={handleTogglePlayInline}
          className="w-9 h-9 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center transition-colors cursor-pointer"
          title={isPlaying ? 'Pause video' : 'Play video'}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>
        {activeSrc && (
          <button
            type="button"
            onClick={handleToggleMute}
            className="w-9 h-9 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center transition-colors cursor-pointer"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Bottom thin playback progress bar (updated via GPU scaleX without layout reflow or React re-renders) */}
      {canPlayCurrentSrc && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-0.5 bg-white/15 overflow-hidden">
          <div
            ref={progressBarRef}
            className="w-full h-full bg-emerald-400 origin-left transform-gpu will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      )}
    </div>
  );
};

export const FeedVideoPlayer = React.memo(
  FeedVideoPlayerInner,
  (prev, next) =>
    prev.preloadHint === next.preloadHint &&
    prev.post.id === next.post.id &&
    prev.post.mediaUrl === next.post.mediaUrl &&
    prev.post.videoChunkCount === next.post.videoChunkCount &&
    prev.post.videoThumbnail === next.post.videoThumbnail &&
    prev.post.videoDuration === next.post.videoDuration &&
    prev.post.videoSizeBytes === next.post.videoSizeBytes &&
    prev.post.videoMimeType === next.post.videoMimeType
);
