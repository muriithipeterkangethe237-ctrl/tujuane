import React, { useState, useRef } from 'react';
import { Play, Maximize2, Video, Loader2, AlertCircle } from 'lucide-react';
import { CommunityPost } from '../types/community';
import { fetchAndAssemblePostVideo } from '../services/communityService';
import { formatVideoDuration } from '../utils/videoProcessor';
import { formatFileSize } from '../utils/imageCompressor';

interface FeedVideoPlayerProps {
  post: CommunityPost;
  onOpenTheatre: (resolvedUrl: string) => void;
}

export const FeedVideoPlayer: React.FC<FeedVideoPlayerProps> = ({ post, onOpenTheatre }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(post.mediaUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ensurePlayableUrl = async (): Promise<string | null> => {
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
      setResolvedUrl(blobUrl);
      return blobUrl;
    } catch (err: any) {
      console.error('Failed to load feed video:', err);
      setLoadError('Could not load video clip. Tap to retry.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPosterClick = async () => {
    setShouldAutoPlay(true);
    const url = await ensurePlayableUrl();
    if (url) {
      setTimeout(() => {
        videoRef.current?.play().catch(() => {});
      }, 60);
    }
  };

  const handleTheatreClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    const url = await ensurePlayableUrl();
    if (url) {
      onOpenTheatre(url);
    }
  };

  const durationText = formatVideoDuration(post.videoDuration);
  const sizeText = post.videoSizeBytes ? formatFileSize(post.videoSizeBytes) : null;

  if (resolvedUrl) {
    return (
      <div className="relative bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          src={resolvedUrl}
          poster={post.videoThumbnail}
          controls
          autoPlay={shouldAutoPlay}
          playsInline
          preload="metadata"
          className="w-full max-h-[460px] object-contain bg-black"
        />
        {post.videoDuration ? (
          <div className="pointer-events-none absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold flex items-center gap-1 backdrop-blur-xs">
            <Video className="w-3 h-3 text-indigo-400" />
            <span>{durationText}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleTheatreClick}
          className="absolute top-2.5 right-2.5 p-1.5 bg-black/65 hover:bg-black/85 text-white rounded-lg opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
          title="Open video in theatre mode"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handlePlayPosterClick}
      className="relative bg-slate-950 flex items-center justify-center min-h-[220px] max-h-[460px] cursor-pointer select-none overflow-hidden"
    >
      {post.videoThumbnail ? (
        <img
          src={post.videoThumbnail}
          alt={post.mediaCaption || post.title || 'Short video thumbnail'}
          className="w-full max-h-[460px] object-contain opacity-90 group-hover:opacity-100 transition-opacity"
        />
      ) : (
        <div className="w-full h-56 bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-950 flex items-center justify-center">
          <Video className="w-12 h-12 text-indigo-400/50" />
        </div>
      )}

      {/* Play / Loading overlay */}
      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors flex flex-col items-center justify-center gap-2">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-black/75 text-white backdrop-blur-md">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
            <span className="text-xs font-bold">Loading short video...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-950/85 text-rose-100 border border-rose-700/60 backdrop-blur-md">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">{loadError}</span>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-indigo-600/95 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl ring-4 ring-white/25 group-hover:scale-110 transition-transform">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        )}
      </div>

      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold flex items-center gap-1 backdrop-blur-xs">
          <Video className="w-3 h-3 text-indigo-400" />
          <span>{post.videoDuration ? durationText : 'Short Video'}</span>
        </span>
        {sizeText && (
          <span className="px-2 py-0.5 rounded-md bg-black/60 text-slate-200 text-[10px] font-medium backdrop-blur-xs">
            {sizeText}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleTheatreClick}
        className="absolute top-2.5 right-2.5 p-1.5 bg-black/65 hover:bg-black/85 text-white rounded-lg transition-colors cursor-pointer z-10"
        title="Open video in theatre mode"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
};
