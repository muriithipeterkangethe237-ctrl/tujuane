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
import { fetchAndAssemblePostVideo } from '../services/communityService';
import { formatVideoDuration } from '../utils/videoProcessor';
import { formatFileSize } from '../utils/imageCompressor';

interface FeedVideoPlayerProps {
  post: CommunityPost;
  onOpenTheatre: (resolvedUrl: string) => void;
}

const FULLSCREEN_VIDEO_OPEN_EVENT = 'tujuane:fullscreen-video-open';

export const FeedVideoPlayer: React.FC<FeedVideoPlayerProps> = ({ post, onOpenTheatre }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(post.mediaUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep resolvedUrl synced if post.mediaUrl arrives
  useEffect(() => {
    if (post.mediaUrl && !resolvedUrl) {
      setResolvedUrl(post.mediaUrl);
    }
  }, [post.mediaUrl, resolvedUrl]);

  const ensurePlayableUrl = useCallback(async (): Promise<string | null> => {
    if (resolvedUrl) return resolvedUrl;
    if (post.mediaUrl) {
      setResolvedUrl(post.mediaUrl);
      return post.mediaUrl;
    }
    if (!post.videoChunkCount || post.videoChunkCount <= 0) {
      setLoadError('Video media is unavailable.');
      return null;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const blobUrl = await fetchAndAssemblePostVideo(post.id, post.videoMimeType || 'video/mp4');
      if (isMountedRef.current) {
        setResolvedUrl(blobUrl);
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
  }, [resolvedUrl, post.mediaUrl, post.videoChunkCount, post.id, post.videoMimeType]);

  // Observe viewport visibility to auto-load and auto-play/pause smoothly
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.55;
        setIsInView(visible);
        if (visible && !resolvedUrl && !isLoading && !loadError && (post.videoChunkCount ?? 0) > 0) {
          ensurePlayableUrl();
        }
      },
      { threshold: [0.25, 0.55, 0.8] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [resolvedUrl, isLoading, loadError, post.videoChunkCount, ensurePlayableUrl]);

  // Auto-play / pause based on viewport visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedUrl) return;

    if (isInView && !userPaused) {
      video.muted = isMuted;
      video
        .play()
        .then(() => {
          if (isMountedRef.current) setIsPlaying(true);
        })
        .catch(() => {
          // If unmuted autoplay was blocked by browser policy, mute and retry cleanly
          if (!video.muted) {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          }
        });
    } else if (!isInView && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }
  }, [isInView, resolvedUrl, userPaused, isMuted]);

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

  const handleOpenFullScreen = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.dispatchEvent(new CustomEvent(FULLSCREEN_VIDEO_OPEN_EVENT));
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    const url = await ensurePlayableUrl();
    if (url) {
      onOpenTheatre(url);
    }
  };

  const handleTogglePlayInline = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
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
      {resolvedUrl ? (
        <video
          ref={videoRef}
          src={resolvedUrl}
          poster={post.videoThumbnail}
          muted={isMuted}
          loop
          playsInline
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="w-full max-h-[480px] object-contain bg-black"
        />
      ) : post.videoThumbnail ? (
        <img
          src={post.videoThumbnail}
          alt={post.mediaCaption || post.title || 'Short video thumbnail'}
          className="w-full max-h-[480px] object-contain opacity-90 group-hover:opacity-100 transition-opacity"
        />
      ) : (
        <div className="w-full h-60 bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-950 flex items-center justify-center">
          <Video className="w-12 h-12 text-indigo-400/50" />
        </div>
      )}

      {/* Center overlay when errored or paused */}
      {loadError ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            ensurePlayableUrl();
          }}
          className="absolute inset-0 bg-black/45 flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-950/90 text-rose-100 backdrop-blur-md">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">{loadError}</span>
          </div>
        </div>
      ) : !isPlaying && resolvedUrl ? (
        <div className="pointer-events-none absolute inset-0 bg-black/20 flex items-center justify-center">
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
      {resolvedUrl && (
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
          <button
            type="button"
            onClick={handleToggleMute}
            className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center transition-colors cursor-pointer backdrop-blur-xs"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
};
