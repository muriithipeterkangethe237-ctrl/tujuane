export const MAX_FEED_VIDEO_BYTES = 12 * 1024 * 1024; // 12 MB max source video file
export const MAX_FEED_VIDEO_DURATION_SEC = 60; // 60 seconds max short video
export const INLINE_VIDEO_DATA_URI_MAX_CHARS = 600_000; // Fits safely inside a single Firestore doc
export const VIDEO_CHUNK_CHAR_SIZE = 550_000; // ~550KB per chunk doc (< 1MiB Firestore limit)

export interface ProcessedFeedVideo {
  mimeType: string;
  sizeBytes: number;
  duration: number;
  width: number;
  height: number;
  thumbnailDataUrl?: string;
  /** Present when encoded video fits inside a single Firestore post document */
  inlineDataUrl?: string;
  /** Present when video is split into Base64 chunks for Firestore subcollection storage */
  chunks?: string[];
  chunkCount: number;
  previewObjectUrl: string;
}

/**
 * Format video duration in seconds as m:ss (e.g. 0:18, 1:00)
 */
export function formatVideoDuration(seconds?: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Capture a lightweight JPEG poster thumbnail from a video element at a given timestamp.
 */
async function captureVideoThumbnail(
  video: HTMLVideoElement,
  seekTime: number
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val?: string) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timeout = setTimeout(() => finish(undefined), 2500);

    const drawFrame = () => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const maxDim = 640;
        let width = vw;
        let height = vh;
        if (width >= height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          finish(undefined);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumb = canvas.toDataURL('image/jpeg', 0.72);
        clearTimeout(timeout);
        finish(thumb.length <= 180_000 ? thumb : canvas.toDataURL('image/jpeg', 0.5));
      } catch {
        clearTimeout(timeout);
        finish(undefined);
      }
    };

    video.onseeked = drawFrame;
    try {
      video.currentTime = seekTime;
    } catch {
      drawFrame();
    }
  });
}

/**
 * Validate a selected short video file, extract duration + dimensions + JPEG poster,
 * and prepare either an inline data URI or chunked Base64 slices for Firestore persistence.
 */
export async function processFeedVideoFile(file: File): Promise<ProcessedFeedVideo> {
  const mimeType = file.type || 'video/mp4';
  const isVideoExt = /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

  if (!mimeType.startsWith('video/') && !isVideoExt) {
    throw new Error('Please select a valid short video file (MP4, WebM, or MOV).');
  }

  if (file.size === 0) {
    throw new Error('Selected video file appears to be empty.');
  }

  if (file.size > MAX_FEED_VIDEO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Video is ${mb} MB. Short feed videos can be up to 12 MB and ${MAX_FEED_VIDEO_DURATION_SEC} seconds.`
    );
  }

  const previewObjectUrl = URL.createObjectURL(file);

  // Extract video duration, dimensions, and poster frame using an offscreen video element
  const metadata = await new Promise<{
    duration: number;
    width: number;
    height: number;
    thumbnailDataUrl?: string;
  }>((resolve, reject) => {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      tempVideo.onloadedmetadata = null;
      tempVideo.onerror = null;
      tempVideo.onseeked = null;
      tempVideo.removeAttribute('src');
      tempVideo.load();
    };

    tempVideo.onloadedmetadata = async () => {
      const rawDuration = tempVideo.duration;
      const duration =
        rawDuration && isFinite(rawDuration) ? Math.max(1, Math.round(rawDuration)) : 10;

      if (rawDuration && isFinite(rawDuration) && rawDuration > MAX_FEED_VIDEO_DURATION_SEC + 0.9) {
        cleanup();
        reject(
          new Error(
            `Video is ${Math.round(rawDuration)}s long. Short feed videos must be ${MAX_FEED_VIDEO_DURATION_SEC} seconds or less.`
          )
        );
        return;
      }

      const width = tempVideo.videoWidth || 720;
      const height = tempVideo.videoHeight || 1280;
      const seekTarget = rawDuration && isFinite(rawDuration) ? Math.min(0.4, rawDuration * 0.25) : 0.1;
      const thumbnailDataUrl = await captureVideoThumbnail(tempVideo, seekTarget);
      cleanup();
      resolve({ duration, width, height, thumbnailDataUrl });
    };

    tempVideo.onerror = () => {
      cleanup();
      reject(
        new Error(
          'Could not read this video format in your browser. Please try a standard MP4 or WebM short clip.'
        )
      );
    };

    tempVideo.src = previewObjectUrl;
  }).catch((err) => {
    URL.revokeObjectURL(previewObjectUrl);
    throw err;
  });

  // Read file into Data URL for persistence
  const fullDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read selected video file.'));
    reader.readAsDataURL(file);
  });

  if (fullDataUrl.length <= INLINE_VIDEO_DATA_URI_MAX_CHARS) {
    return {
      mimeType,
      sizeBytes: file.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      thumbnailDataUrl: metadata.thumbnailDataUrl,
      inlineDataUrl: fullDataUrl,
      chunkCount: 0,
      previewObjectUrl
    };
  }

  // Strip the `data:...;base64,` prefix so chunks contain pure Base64 slices
  const commaIdx = fullDataUrl.indexOf(',');
  const base64Body = commaIdx >= 0 ? fullDataUrl.slice(commaIdx + 1) : fullDataUrl;
  const chunks: string[] = [];
  for (let i = 0; i < base64Body.length; i += VIDEO_CHUNK_CHAR_SIZE) {
    chunks.push(base64Body.slice(i, i + VIDEO_CHUNK_CHAR_SIZE));
  }

  return {
    mimeType,
    sizeBytes: file.size,
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    chunks,
    chunkCount: chunks.length,
    previewObjectUrl
  };
}

/**
 * Convert raw Base64 string into a Blob and cacheable Object URL.
 */
export function base64ToBlobUrl(base64Body: string, mimeType: string = 'video/mp4'): string {
  const binaryStr = atob(base64Body);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
