export const MAX_FEED_VIDEO_BYTES = 12 * 1024 * 1024; // 12 MB hard stored limit for feed videos
export const AUTO_COMPRESS_FEED_THRESHOLD_BYTES = Math.round(1.2 * 1024 * 1024); // Auto-compress videos > 1.2 MB
export const TARGET_COMPRESSED_FEED_VIDEO_BYTES = Math.round(4.5 * 1024 * 1024); // Target compressed budget (~4.5 MB max)
export const MAX_RAW_VIDEO_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB raw browser input guard before trimming/compression
export const MAX_FEED_VIDEO_DURATION_SEC = 60; // 60 seconds max short feed video
export const MAX_STORY_VIDEO_DURATION_SEC = 30; // 30 seconds max citizen story video
export const MAX_STORY_VIDEO_BYTES = 680 * 1024; // ~680KB binary so Base64 stays under Firestore 1MiB limit
export const AUTO_COMPRESS_STORY_THRESHOLD_BYTES = 350 * 1024; // Auto-compress story clips > 350 KB
export const INLINE_VIDEO_DATA_URI_MAX_CHARS = 600_000; // Fits safely inside a single Firestore doc
export const VIDEO_CHUNK_CHAR_SIZE = 550_000; // ~550KB per chunk doc (< 1MiB Firestore limit)

export interface ProcessedFeedVideo {
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes?: number;
  wasCompressed?: boolean;
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
  /** True when the video exceeded limits and was automatically trimmed/compressed */
  wasAutoTrimmed?: boolean;
  /** Original duration (in seconds) before auto-trimming */
  originalDuration?: number;
}

export interface ProcessVideoOptions {
  overrideDurationSec?: number;
  maxDurationSec?: number;
  maxBytes?: number;
  maxDimension?: number;
  autoTrim?: boolean;
  autoCompress?: boolean;
  onProgress?: (percent: number, stage?: string) => void;
}

export interface TrimmedVideoResult {
  file: File;
  duration: number;
  originalDuration: number;
  originalSizeBytes: number;
  width: number;
  height: number;
  wasTrimmed: boolean;
  wasCompressed: boolean;
}

export interface EncodedStoryVideoResult {
  dataUrl: string;
  mimeType: string;
  duration: number;
  originalDuration: number;
  sizeBytes: number;
  originalSizeBytes: number;
  wasAutoTrimmed: boolean;
  wasCompressed: boolean;
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

function getSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // Ignore probe error
    }
  }
  return '';
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read video file.'));
    reader.readAsDataURL(file);
  });
}

async function probeVideoMetadata(
  objectUrl: string
): Promise<{ rawDuration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
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
      tempVideo.removeAttribute('src');
      tempVideo.load();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while reading video metadata.'));
    }, 10000);

    tempVideo.onloadedmetadata = () => {
      clearTimeout(timeout);
      const rawDuration = tempVideo.duration;
      const width = tempVideo.videoWidth || 720;
      const height = tempVideo.videoHeight || 1280;
      cleanup();
      resolve({ rawDuration, width, height });
    };

    tempVideo.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(
        new Error(
          'Could not read this video format in your browser. Please try a standard MP4 or WebM short clip.'
        )
      );
    };

    tempVideo.src = objectUrl;
  });
}

/**
 * Automatically trim and/or re-encode a video clip in the browser so its duration stays within
 * `targetDurationSec` and its file size fits within `maxBytes`.
 */
export async function trimVideoToLength(
  file: File,
  targetDurationSec: number,
  options: {
    maxBytes?: number;
    targetCompressBytes?: number;
    compressThresholdBytes?: number;
    autoCompress?: boolean;
    maxDimension?: number;
    onProgress?: (percent: number, stage?: string) => void;
  } = {}
): Promise<TrimmedVideoResult> {
  const maxBytes = options.maxBytes ?? MAX_FEED_VIDEO_BYTES;
  const targetCompressBytes = options.targetCompressBytes ?? Math.min(maxBytes, TARGET_COMPRESSED_FEED_VIDEO_BYTES);
  const compressThresholdBytes = options.compressThresholdBytes ?? AUTO_COMPRESS_FEED_THRESHOLD_BYTES;
  const autoCompress = options.autoCompress ?? true;
  const maxDimension = options.maxDimension ?? 720;
  const onProgress = options.onProgress;

  const sourceUrl = URL.createObjectURL(file);

  try {
    const meta = await probeVideoMetadata(sourceUrl);
    const hasFiniteDuration = Boolean(meta.rawDuration && isFinite(meta.rawDuration) && meta.rawDuration > 0);
    const originalDuration = hasFiniteDuration ? Math.max(1, Math.round(meta.rawDuration)) : targetDurationSec;

    const needsDurationTrim = hasFiniteDuration && meta.rawDuration > targetDurationSec + 0.5;
    const needsDimensionScale = meta.width > maxDimension || meta.height > maxDimension;
    const needsSizeCompress =
      file.size > maxBytes ||
      (autoCompress && (file.size > compressThresholdBytes || needsDimensionScale));

    if (!needsDurationTrim && !needsSizeCompress) {
      return {
        file,
        duration: hasFiniteDuration ? Math.max(1, Math.min(targetDurationSec, Math.round(meta.rawDuration))) : targetDurationSec,
        originalDuration,
        originalSizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        wasTrimmed: false,
        wasCompressed: false
      };
    }

    if (typeof MediaRecorder === 'undefined') {
      if (file.size <= maxBytes && !needsDurationTrim) {
        return {
          file,
          duration: originalDuration,
          originalDuration,
          originalSizeBytes: file.size,
          width: meta.width,
          height: meta.height,
          wasTrimmed: false,
          wasCompressed: false
        };
      }
      throw new Error(
        `Your browser does not support automatic video compression/trimming. Please select a clip under ${targetDurationSec}s.`
      );
    }

    const mimeType = getSupportedRecorderMimeType();
    if (!mimeType) {
      if (file.size <= maxBytes && !needsDurationTrim) {
        return {
          file,
          duration: originalDuration,
          originalDuration,
          originalSizeBytes: file.size,
          width: meta.width,
          height: meta.height,
          wasTrimmed: false,
          wasCompressed: false
        };
      }
      throw new Error(
        `Automatic video compression is unavailable in this browser. Please trim your video to ${targetDurationSec}s or less.`
      );
    }

    const clipDuration = hasFiniteDuration
      ? Math.max(1, Math.min(meta.rawDuration, targetDurationSec))
      : targetDurationSec;

    // Scale dimensions cleanly while preserving aspect ratio (even pixel sizes for video codecs)
    let outW = meta.width;
    let outH = meta.height;
    if (outW >= outH && outW > maxDimension) {
      outH = Math.round((outH * maxDimension) / outW);
      outW = maxDimension;
    } else if (outH > outW && outH > maxDimension) {
      outW = Math.round((outW * maxDimension) / outH);
      outH = maxDimension;
    }
    outW = Math.max(2, outW & ~1);
    outH = Math.max(2, outH & ~1);

    // Target a mobile-friendly bitrate so compressed clips upload quickly and stay compact
    const proportionalBudgetBytes = Math.min(
      targetCompressBytes,
      Math.max(Math.round(clipDuration * 82_000), 320 * 1024)
    );
    const effectiveBudgetBytes = Math.min(maxBytes, proportionalBudgetBytes);
    const targetBitsPerSec = Math.floor((effectiveBudgetBytes * 8 * 0.76) / Math.max(1, clipDuration));
    const videoBitsPerSecond = Math.max(120_000, Math.min(680_000, targetBitsPerSec));

    onProgress?.(
      2,
      needsDurationTrim
        ? `Auto-trimming & compressing video to ${formatVideoDuration(clipDuration)}...`
        : 'Auto-compressing video file size...'
    );

    const trimmedBlob = await new Promise<Blob>((resolve, reject) => {
      const video = document.createElement('video');
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.src = sourceUrl;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not initialize video canvas for auto-compression.'));
        return;
      }

      let rafId: number | null = null;
      let fallbackFrameTimer: ReturnType<typeof setTimeout> | null = null;
      let recorder: MediaRecorder | null = null;
      let audioCtx: AudioContext | null = null;
      let combinedStream: MediaStream | null = null;
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      let finished = false;
      const chunks: BlobPart[] = [];

      const clearScheduledFrame = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (fallbackFrameTimer !== null) {
          clearTimeout(fallbackFrameTimer);
          fallbackFrameTimer = null;
        }
      };

      const cleanup = () => {
        clearScheduledFrame();
        if (safetyTimer) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        }
        try {
          video.pause();
        } catch {
          // ignore
        }
        video.onloadeddata = null;
        video.onended = null;
        video.onerror = null;
        video.ontimeupdate = null;
        video.removeAttribute('src');
        video.load();

        if (combinedStream) {
          combinedStream.getTracks().forEach((t) => t.stop());
          combinedStream = null;
        }
        if (audioCtx) {
          audioCtx.close().catch(() => {});
          audioCtx = null;
        }
      };

      const stopRecording = () => {
        if (finished) return;
        finished = true;
        clearScheduledFrame();
        try {
          video.pause();
        } catch {
          // ignore
        }
        if (recorder && recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      };

      const startCapture = async () => {
        try {
          // Draw initial frame
          ctx.drawImage(video, 0, 0, outW, outH);

          const canvasStream = canvas.captureStream(24);
          const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

          // Attach audio silently via Web Audio API so user does not hear playback while compressing
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              audioCtx = new AudioCtx();
              if (audioCtx.state === 'suspended') {
                await audioCtx.resume().catch(() => {});
              }
              const srcNode = audioCtx.createMediaElementSource(video);
              const destNode = audioCtx.createMediaStreamDestination();
              srcNode.connect(destNode);
              const audioTracks = destNode.stream.getAudioTracks();
              if (audioTracks.length > 0) {
                tracks.push(...audioTracks);
              }
              video.muted = false;
            } else {
              video.muted = true;
            }
          } catch {
            // Fallback to silent capture if audio routing is blocked
            video.muted = true;
          }

          combinedStream = new MediaStream(tracks);
          try {
            recorder = new MediaRecorder(combinedStream, {
              mimeType,
              videoBitsPerSecond,
              audioBitsPerSecond: 64_000
            });
          } catch {
            recorder = new MediaRecorder(combinedStream, {
              mimeType,
              videoBitsPerSecond
            });
          }

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              chunks.push(ev.data);
            }
          };

          recorder.onerror = () => {
            cleanup();
            reject(new Error('Video auto-compression failed in your browser.'));
          };

          recorder.onstop = () => {
            const outType = recorder?.mimeType || mimeType.split(';')[0] || 'video/webm';
            const blob = new Blob(chunks, { type: outType });
            cleanup();
            onProgress?.(100);
            resolve(blob);
          };

          const scheduleNextFrame = () => {
            if (finished) return;
            if (typeof document !== 'undefined' && document.hidden) {
              // Use timer fallback when tab is backgrounded so compression continues smoothly
              fallbackFrameTimer = setTimeout(drawLoop, 42);
            } else {
              rafId = requestAnimationFrame(drawLoop);
            }
          };

          const drawLoop = () => {
            if (finished) return;
            try {
              ctx.drawImage(video, 0, 0, outW, outH);
            } catch {
              // ignore frame error
            }
            const pct = Math.min(99, Math.max(2, Math.round((video.currentTime / clipDuration) * 98)));
            onProgress?.(pct);

            if (video.currentTime >= clipDuration || video.ended) {
              stopRecording();
              return;
            }
            scheduleNextFrame();
          };

          video.currentTime = 0;
          recorder.start(250);
          await video.play();
          scheduleNextFrame();

          video.onended = () => stopRecording();
          safetyTimer = setTimeout(() => stopRecording(), (clipDuration + 2.5) * 1000);
        } catch (err) {
          cleanup();
          reject(
            err instanceof Error
              ? err
              : new Error('Unable to start automatic video compression in this browser.')
          );
        }
      };

      video.onloadeddata = () => {
        video.onloadeddata = null;
        startCapture();
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Could not decode selected video for auto-compression.'));
      };
    });

    const outMime = trimmedBlob.type || mimeType.split(';')[0] || 'video/webm';
    const ext = outMime.includes('mp4') ? 'mp4' : 'webm';
    const baseName = (file.name || 'short-video').replace(/\.[^.]+$/, '');
    const compressedFile = new File([trimmedBlob], `${baseName}-compressed.${ext}`, {
      type: outMime
    });

    // If trimming wasn't required and original is already within maxBytes and smaller, keep original file
    if (!needsDurationTrim && file.size <= maxBytes && compressedFile.size >= file.size) {
      return {
        file,
        duration: Math.max(1, Math.round(clipDuration)),
        originalDuration,
        originalSizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        wasTrimmed: false,
        wasCompressed: false
      };
    }

    if (compressedFile.size > maxBytes) {
      const mbLimit = (maxBytes / (1024 * 1024)).toFixed(1);
      throw new Error(
        maxBytes < 1024 * 1024
          ? `Even after compressing & trimming to ${Math.round(clipDuration)}s, this video is ${(compressedFile.size / 1024).toFixed(0)}KB. Story videos must stay under ${Math.round(maxBytes / 1024)}KB.`
          : `Even after compressing & trimming to ${Math.round(clipDuration)}s, this video is ${(compressedFile.size / (1024 * 1024)).toFixed(1)} MB (limit ${mbLimit} MB).`
      );
    }

    return {
      file: compressedFile,
      duration: Math.max(1, Math.round(clipDuration)),
      originalDuration,
      originalSizeBytes: file.size,
      width: outW,
      height: outH,
      wasTrimmed: needsDurationTrim,
      wasCompressed: compressedFile.size < file.size
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
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
 * Validate a selected short video file (auto-trimming longer videos to maxDurationSec),
 * extract duration + dimensions + JPEG poster, and prepare either an inline data URI
 * or chunked Base64 slices for Firestore persistence.
 */
export async function processFeedVideoFile(
  file: File,
  optionsOrDuration?: number | ProcessVideoOptions
): Promise<ProcessedFeedVideo> {
  const opts: ProcessVideoOptions =
    typeof optionsOrDuration === 'number'
      ? { overrideDurationSec: optionsOrDuration }
      : optionsOrDuration || {};

  const maxDurationSec = opts.maxDurationSec ?? MAX_FEED_VIDEO_DURATION_SEC;
  const maxBytes = opts.maxBytes ?? MAX_FEED_VIDEO_BYTES;
  const autoTrim = opts.autoTrim ?? true;
  const autoCompress = opts.autoCompress ?? true;

  const mimeType = file.type || 'video/mp4';
  const isVideoExt = /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

  if (!mimeType.startsWith('video/') && !isVideoExt) {
    throw new Error('Please select a valid short video file (MP4, WebM, or MOV).');
  }

  if (file.size === 0) {
    throw new Error('Selected video file appears to be empty.');
  }

  if (file.size > MAX_RAW_VIDEO_INPUT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(0);
    throw new Error(`Video is ${mb} MB. Please choose a video under 200 MB so it can be compressed safely.`);
  }

  let workingFile = file;
  let wasAutoTrimmed = false;
  let wasCompressed = false;
  let originalDuration: number | undefined;
  const originalSizeBytes = file.size;

  if (autoTrim || autoCompress) {
    const trimRes = await trimVideoToLength(file, autoTrim ? maxDurationSec : 3600, {
      maxBytes,
      targetCompressBytes: TARGET_COMPRESSED_FEED_VIDEO_BYTES,
      compressThresholdBytes: AUTO_COMPRESS_FEED_THRESHOLD_BYTES,
      autoCompress,
      maxDimension: opts.maxDimension ?? 720,
      onProgress: opts.onProgress
    });
    workingFile = trimRes.file;
    wasAutoTrimmed = trimRes.wasTrimmed;
    wasCompressed = trimRes.wasCompressed;
    originalDuration = trimRes.originalDuration;
  } else if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Video is ${mb} MB. Short feed videos can be up to ${(maxBytes / (1024 * 1024)).toFixed(0)} MB and ${maxDurationSec} seconds.`
    );
  }

  const finalMimeType = workingFile.type || mimeType;
  const previewObjectUrl = URL.createObjectURL(workingFile);

  // Extract final video duration, dimensions, and poster frame
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
      const validOverride =
        typeof opts.overrideDurationSec === 'number' &&
        isFinite(opts.overrideDurationSec) &&
        opts.overrideDurationSec > 0
          ? Math.max(1, Math.min(maxDurationSec, Math.round(opts.overrideDurationSec)))
          : undefined;

      const duration =
        rawDuration && isFinite(rawDuration)
          ? Math.max(1, Math.min(maxDurationSec, Math.round(rawDuration)))
          : validOverride ?? (wasAutoTrimmed ? maxDurationSec : 10);

      if (!autoTrim && rawDuration && isFinite(rawDuration) && rawDuration > maxDurationSec + 0.9) {
        cleanup();
        reject(
          new Error(
            `Video is ${Math.round(rawDuration)}s long. Short feed videos must be ${maxDurationSec} seconds or less.`
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
  const fullDataUrl = await fileToDataUrl(workingFile);

  if (fullDataUrl.length <= INLINE_VIDEO_DATA_URI_MAX_CHARS) {
    return {
      mimeType: finalMimeType,
      sizeBytes: workingFile.size,
      originalSizeBytes,
      wasCompressed,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      thumbnailDataUrl: metadata.thumbnailDataUrl,
      inlineDataUrl: fullDataUrl,
      chunkCount: 0,
      previewObjectUrl,
      wasAutoTrimmed,
      originalDuration
    };
  }

  // Strip the `data:...;base64,` prefix cleanly (handles MIME types with codec commas like `codecs=vp9,opus`)
  const { base64Body } = extractBase64FromDataUrl(fullDataUrl);
  const alignedChunkSize = VIDEO_CHUNK_CHAR_SIZE - (VIDEO_CHUNK_CHAR_SIZE % 4);
  const chunks: string[] = [];
  for (let i = 0; i < base64Body.length; i += alignedChunkSize) {
    chunks.push(base64Body.slice(i, i + alignedChunkSize));
  }

  return {
    mimeType: finalMimeType,
    sizeBytes: workingFile.size,
    originalSizeBytes,
    wasCompressed,
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    chunks,
    chunkCount: chunks.length,
    previewObjectUrl,
    wasAutoTrimmed,
    originalDuration
  };
}

/**
 * Automatically trim, compress & encode a Citizen Story video (up to 30 seconds, fits inside Firestore 1MiB doc).
 */
export async function trimAndEncodeStoryVideo(
  file: File,
  onProgress?: (percent: number, stage?: string) => void
): Promise<EncodedStoryVideoResult> {
  const mimeType = file.type || 'video/mp4';
  const isVideoExt = /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

  if (!mimeType.startsWith('video/') && !isVideoExt) {
    throw new Error('Please select a valid video file (MP4, WebM, MOV).');
  }

  if (file.size === 0) {
    throw new Error('Selected video file appears to be empty.');
  }

  if (file.size > MAX_RAW_VIDEO_INPUT_BYTES) {
    throw new Error('Video file is over 200 MB. Please choose a smaller clip for stories.');
  }

  const trimmed = await trimVideoToLength(file, MAX_STORY_VIDEO_DURATION_SEC, {
    maxBytes: MAX_STORY_VIDEO_BYTES,
    targetCompressBytes: Math.round(MAX_STORY_VIDEO_BYTES * 0.85),
    compressThresholdBytes: AUTO_COMPRESS_STORY_THRESHOLD_BYTES,
    autoCompress: true,
    maxDimension: 480,
    onProgress
  });

  const dataUrl = await fileToDataUrl(trimmed.file);
  if (dataUrl.length > 950_000) {
    throw new Error(
      'Encoded story video is slightly too large for 24h story storage. Please choose a shorter clip.'
    );
  }

  return {
    dataUrl,
    mimeType: trimmed.file.type || mimeType,
    duration: trimmed.duration,
    originalDuration: trimmed.originalDuration,
    sizeBytes: trimmed.file.size,
    originalSizeBytes: trimmed.originalSizeBytes,
    wasAutoTrimmed: trimmed.wasTrimmed,
    wasCompressed: trimmed.wasCompressed
  };
}

const resolvedDataUrlCache = new Map<string, string>();
const MAX_RESOLVED_DATA_URLS = 40;

function extractBase64FromDataUrl(
  dataUrl: string,
  fallbackMimeType: string = 'video/mp4'
): { mimeType: string; base64Body: string } {
  const trimmed = dataUrl.trim();
  const base64Tag = ';base64,';
  const tagIdx = trimmed.indexOf(base64Tag);

  if (trimmed.startsWith('data:') && tagIdx >= 5 && tagIdx < 256) {
    const header = trimmed.slice(5, tagIdx);
    const mimeType = header.split(';')[0]?.trim() || fallbackMimeType;
    return {
      mimeType,
      base64Body: trimmed.slice(tagIdx + base64Tag.length)
    };
  }

  const commaIdx = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIdx >= 5 && commaIdx < 256) {
    const header = trimmed.slice(5, commaIdx);
    const mimeType = header.split(';')[0]?.trim() || fallbackMimeType;
    return {
      mimeType,
      base64Body: trimmed.slice(commaIdx + 1)
    };
  }

  return {
    mimeType: fallbackMimeType,
    base64Body: trimmed
  };
}

function sanitizeBase64Chunk(rawChunk: string, isFirstChunk: boolean): string {
  if (!rawChunk) return '';
  let str = rawChunk;

  // Heal legacy chunks accidentally prefixed with `opus;base64,` or `data:...;base64,`
  if (isFirstChunk) {
    const headWindow = str.slice(0, 256);
    const b64Idx = headWindow.indexOf('base64,');
    if (b64Idx >= 0) {
      str = str.slice(b64Idx + 'base64,'.length);
    }
  }

  // Normalize whitespace & URL-safe Base64 characters
  str = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  return str;
}

function decodeBase64GroupToUint8Array(base64Group: string): Uint8Array {
  let normalized = base64Group;
  let binaryStr: string;
  try {
    binaryStr = atob(normalized);
  } catch {
    // Strip any stray non-base64 characters and re-align mod-4 before retrying
    normalized = normalized.replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
    const rem = normalized.length % 4;
    if (rem === 1) {
      normalized = normalized.slice(0, -1);
    } else if (rem === 2) {
      normalized += '==';
    } else if (rem === 3) {
      normalized += '=';
    }
    if (!normalized) return new Uint8Array(0);
    binaryStr = atob(normalized);
  }

  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Assemble an array of Base64 slices directly into a Blob without giant string concatenation,
 * carrying over any non-4-aligned remainder across chunk boundaries and healing legacy header prefixes.
 */
export function base64ChunksToBlob(
  base64Chunks: string[],
  mimeType: string = 'video/mp4'
): Blob {
  const parts: BlobPart[] = [];
  let carry = '';

  for (let i = 0; i < base64Chunks.length; i++) {
    const cleaned = sanitizeBase64Chunk(base64Chunks[i] || '', i === 0);
    let combined = carry + cleaned;
    carry = '';

    const isLast = i === base64Chunks.length - 1;
    if (!isLast) {
      const alignedLen = combined.length - (combined.length % 4);
      if (alignedLen < combined.length) {
        carry = combined.slice(alignedLen);
        combined = combined.slice(0, alignedLen);
      }
    } else {
      const cleanBody = combined.replace(/=+$/, '');
      const rem = cleanBody.length % 4;
      if (rem === 1) {
        combined = cleanBody.slice(0, -1);
      } else if (rem === 2) {
        combined = `${cleanBody}==`;
      } else if (rem === 3) {
        combined = `${cleanBody}=`;
      } else {
        combined = cleanBody;
      }
    }

    if (combined.length > 0) {
      const bytes = decodeBase64GroupToUint8Array(combined);
      if (bytes.byteLength > 0) {
        parts.push(bytes as unknown as BlobPart);
      }
    }
  }

  const cleanMimeType = mimeType.split(';')[0]?.trim() || mimeType || 'video/mp4';
  return new Blob(parts, { type: cleanMimeType });
}

/**
 * Convert raw Base64 string into a Blob and cacheable Object URL.
 */
export function base64ToBlobUrl(base64Body: string, mimeType: string = 'video/mp4'): string {
  const blob = base64ChunksToBlob([base64Body], mimeType);
  return URL.createObjectURL(blob);
}

/**
 * Convert a `data:` video URI into a cached `blob:` Object URL so `<video>` starts, loops,
 * and seeks immediately without re-decoding inline Base64 on every mount.
 */
export function resolvePlayableVideoUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('data:')) return url;

  const cacheKey = `${url.length}:${url.slice(0, 64)}:${url.slice(-48)}`;
  const cached = resolvedDataUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { mimeType, base64Body } = extractBase64FromDataUrl(url, 'video/mp4');
    if (!base64Body) return url;
    const objectUrl = base64ToBlobUrl(base64Body, mimeType);

    if (resolvedDataUrlCache.size >= MAX_RESOLVED_DATA_URLS) {
      const oldestKey = resolvedDataUrlCache.keys().next().value;
      if (oldestKey) {
        const oldestUrl = resolvedDataUrlCache.get(oldestKey);
        if (oldestUrl) URL.revokeObjectURL(oldestUrl);
        resolvedDataUrlCache.delete(oldestKey);
      }
    }
    resolvedDataUrlCache.set(cacheKey, objectUrl);
    return objectUrl;
  } catch {
    return url;
  }
}
