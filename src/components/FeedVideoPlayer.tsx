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

export const FeedVideoPlayer: React.FC<FeedVideoPlayerProps> = ({
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
  const [progressPct, setProgressPct] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef(true);
  const prevSrcRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<{ time: number; shouldPlay: boolean } | null>(null);

  const activeSrc = fullUrl || (!isHeadFailed ? headUrl : null);
  const isPartialHeadOnly = Boolean(
    !fullUrl && headUrl && !isHeadFailed && (post.videoChunkCount ?? 0) > 1
  );

  // Lazy-mount the native <video> element ONLY when active, adjacent, or near the viewport
  const shouldMountVideoElement = Boolean(
    activeSrc &&
      (isInView || isNearViewport || preloadHint === 'adjacent' || preloadHint === 'active')
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
        setIsNearViewport(near);
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

  // Observe active viewport visibility to auto-play/pause smoothly and trigger full download when active
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.4;
        setIsInView(visible);
        onActiveInView?.(post.id, visible);
      },
      { threshold: [0.2, 0.4, 0.65] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      onActiveInView?.(post.id, false);
    };
  }, [post.id, onActiveInView]);

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

  // Capture playback timestamp & playing state cleanly before swapping headUrl -> fullUrl
  useEffect(() => {
    const prevSrc = prevSrcRef.current;
    if (prevSrc && activeSrc && prevSrc !== activeSrc && videoRef.current) {
      const v = videoRef.current;
      pendingRestoreRef.current = {
        time: v.currentTime || 0,
        shouldPlay: !v.paused || (isInView && !userPaused)
      };
    }
    prevSrcRef.current = activeSrc || null;
  }, [activeSrc, isInView, userPaused]);

  const tryStartPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeSrc || !isInView || userPaused) return;
    video.loop = !isPartialHeadOnly;
    video.muted = isMuted;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          if (isMountedRef.current) {
            setIsPlaying(true);
            setIsBuffering(false);
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
                  setIsBuffering(false);
                }
              })
              .catch(() => {});
          }
        });
    }
  }, [activeSrc, isInView, isPartialHeadOnly, userPaused, isMuted]);

  // Keep native DOM `.loop` property synced when full video replaces head preview
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = !isPartialHeadOnly;
  }, [shouldMountVideoElement, activeSrc, isPartialHeadOnly]);

  // Auto-play / pause based on viewport visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSrc || !shouldMountVideoElement) {
      if (!shouldMountVideoElement) setIsPlaying(false);
      return;
    }

    if (isInView && !userPaused) {
      tryStartPlayback();
    } else if (!isInView && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }
  }, [isInView, activeSrc, shouldMountVideoElement, userPaused, tryStartPlayback]);

  // Pause inline feed playback whenever full-screen short video viewer opens
  useEffect(() => {
    const handleFullScreenOpen = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener(FULLSCREEN_VIDEO_OPEN_EVENT, handleFullScreenOpen);
    return () => window.removeEventListener(FULLSCREEN_VIDEO_OPEN_EVENT, handleFullScreenOpen);
  }, []);

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
    if (!activeSrc) {
      await ensureFullPlayableUrl();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.muted = isMuted;
      video.play().then(() => setIsPlaying(true)).catch(() => {});
      if (!fullUrl) void ensureFullPlayableUrl();
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
          preload="auto"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            const pending = pendingRestoreRef.current;
            if (v && pending) {
              if (pending.time > 0 && isFinite(v.duration) && pending.time < v.duration) {
                v.currentTime = pending.time;
              }
              if (pending.shouldPlay && isInView && !userPaused) {
                tryStartPlayback();
              }
              pendingRestoreRef.current = null;
            }
          }}
          onLoadedData={() => {
            // Keep adjacent preloaded videos paused on frame 0 until scrolled into view
            const v = videoRef.current;
            if (v && !isInView && !v.paused) {
              v.pause();
            }
          }}
          onCanPlay={() => {
            setIsBuffering(false);
            if (isInView && !userPaused) {
              tryStartPlayback();
            }
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsPlaying(true);
            setIsBuffering(false);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (isPartialHeadOnly) {
              setIsBuffering(true);
              void ensureFullPlayableUrl();
              return;
            }
            const v = videoRef.current;
            if (v && !userPaused) {
              v.currentTime = 0;
              v.muted = isMuted;
              v.play()
                .then(() => {
                  if (isMountedRef.current) setIsPlaying(true);
                })
                .catch(() => {});
            }
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            const denom =
              post.videoDuration && post.videoDuration > 0
                ? post.videoDuration
                : v?.duration || 0;
            if (v && denom > 0 && isFinite(denom)) {
              setProgressPct(Math.min(100, (v.currentTime / denom) * 100));
            }
          }}
          onError={() => {
            setIsBuffering(false);
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
          className="w-full max-h-[480px] object-contain bg-black"
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
          className="absolute inset-0 bg-black/45 flex items-center justify-center z-10"
        >
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-950/90 text-rose-100 backdrop-blur-md">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">{loadError}</span>
          </div>
        </div>
      ) : !isPlaying && (!isInView || userPaused || !activeSrc) ? (
        <div className="pointer-events-none absolute inset-0 bg-black/15 flex items-center justify-center">
          <div className="w-13 h-13 rounded-full bg-black/65 text-white flex items-center justify-center shadow-xl backdrop-blur-xs">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      ) : null}

      {/* Top Left Badges */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold tabular-nums flex items-center gap-1 backdrop-blur-xs">
          <Video className="w-3 h-3 text-indigo-400" />
          <span>{post.videoDuration ? durationText : 'Short Video'}</span>
        </span>
        {sizeText && (
          <span className="px-2 py-0.5 rounded-md bg-black/55 text-slate-200 text-[10px] font-medium tabular-nums backdrop-blur-xs">
            {sizeText}
          </span>
        )}
      </div>

      {/* Top Right Full Screen Expand Button */}
      <button
        type="button"
        onClick={handleOpenFullScreen}
        className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-black/65 hover:bg-black/85 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs z-10"
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
          className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center transition-colors cursor-pointer backdrop-blur-xs"
          title={isPlaying ? 'Pause video' : 'Play video'}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>
        {activeSrc && (
          <button
            type="button"
            onClick={handleToggleMute}
            className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center transition-colors cursor-pointer backdrop-blur-xs"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Bottom thin playback progress bar */}
      {activeSrc && progressPct > 0 && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-0.5 bg-white/15">
          <div
            className="h-full bg-emerald-400 transition-[width] duration-150"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
};
