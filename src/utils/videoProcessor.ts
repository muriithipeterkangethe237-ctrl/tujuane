export const MAX_FEED_VIDEO_BYTES = 45 * 1024 * 1024; // 45 MB hard stored limit for up to 5-min Full HD feed videos
export const AUTO_COMPRESS_FEED_THRESHOLD_BYTES = 10 * 1024 * 1024; // Keep crisp native Full HD clips <= 10 MB untouched; auto-compress larger files
export const TARGET_COMPRESSED_FEED_VIDEO_BYTES = 32 * 1024 * 1024; // Target compressed budget (~32 MB max for 5-min 1080p clips)
export const MAX_RAW_VIDEO_INPUT_BYTES = 500 * 1024 * 1024; // 500 MB raw browser input guard before trimming/compression
export const MAX_FEED_VIDEO_DURATION_SEC = 300; // 5 minutes (300 seconds) max feed video
export const MAX_FEED_VIDEO_DIMENSION = 1920; // Full HD 1080p (1920x1080 landscape or 1080x1920 portrait)
export const MAX_STORY_VIDEO_DURATION_SEC = 30; // 30 seconds max citizen story video
export const MAX_STORY_VIDEO_BYTES = 680 * 1024; // ~680KB binary so Base64 stays under Firestore 1MiB limit
export const AUTO_COMPRESS_STORY_THRESHOLD_BYTES = 350 * 1024; // Auto-compress story clips > 350 KB
export const INLINE_VIDEO_DATA_URI_MAX_CHARS = 600_000; // Fits safely inside a single Firestore doc
export const VIDEO_CHUNK_CHAR_SIZE = 550_000; // ~550KB per chunk doc (< 1MiB Firestore limit)

export const VIDEO_PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type VideoPlaybackSpeed = number;
export const DEFAULT_VIDEO_PLAYBACK_SPEED = 1;

export function normalizePlaybackSpeed(speed?: number): number {
  if (typeof speed !== 'number' || !isFinite(speed) || speed <= 0) {
    return DEFAULT_VIDEO_PLAYBACK_SPEED;
  }
  return Math.min(4, Math.max(0.25, Number(speed.toFixed(2))));
}

export interface ProcessedFeedVideo {
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes?: number;
  wasCompressed?: boolean;
  duration: number;
  width: number;
  height: number;
  playbackSpeed?: number;
  thumbnailDataUrl?: string;
  /** Present when encoded video fits inside a single Firestore post document */
  inlineDataUrl?: string;
  /** Present when video is split into Base64 chunks for Firestore subcollection storage */
  chunks?: string[];
  chunkCount: number;
  previewObjectUrl: string;
  /** In-memory working video File for non-destructive trimming, speed changes & sound re-mixing before posting */
  sourceFile?: File;
  /** True when the video exceeded limits and was automatically trimmed/compressed */
  wasAutoTrimmed?: boolean;
  /** Original duration (in seconds) before auto-trimming */
  originalDuration?: number;
}

export interface VideoSoundTrackOption {
  url: string;
  mode?: 'replace' | 'mix';
}

export interface ProcessVideoOptions {
  overrideDurationSec?: number;
  maxDurationSec?: number;
  maxBytes?: number;
  maxDimension?: number;
  autoTrim?: boolean;
  autoCompress?: boolean;
  startTimeSec?: number;
  endTimeSec?: number;
  playbackSpeed?: number;
  soundTrack?: VideoSoundTrackOption;
  signal?: AbortSignal;
  onProgress?: (percent: number, stage?: string) => void;
}

export interface TrimmedVideoResult {
  file: File;
  duration: number;
  originalDuration: number;
  originalSizeBytes: number;
  width: number;
  height: number;
  playbackSpeed: number;
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

function getSupportedRecorderMimeTypes(): string[] {
  if (typeof MediaRecorder === 'undefined') return [];
  // Prefer VP8/Opus or VP9/Opus WebM first on Chromium/Firefox for rock-solid constant-cadence
  // encoding without H.264 B-frame PTS jitter, with MP4/AVC fallback for Safari/iOS.
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4'
  ];
  const supported: string[] = [];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        supported.push(type);
      }
    } catch {
      // Ignore probe error
    }
  }
  return supported;
}

function getSupportedRecorderMimeType(): string {
  return getSupportedRecorderMimeTypes()[0] || '';
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
      tempVideo.ondurationchange = null;
      tempVideo.onseeked = null;
      tempVideo.onerror = null;
      tempVideo.removeAttribute('src');
      tempVideo.load();
    };

    const timeout = setTimeout(() => {
      const fallbackDur = tempVideo.duration;
      const w = tempVideo.videoWidth || 720;
      const h = tempVideo.videoHeight || 1280;
      cleanup();
      if (fallbackDur && isFinite(fallbackDur) && fallbackDur > 0) {
        resolve({ rawDuration: fallbackDur, width: w, height: h });
      } else {
        reject(new Error('Timed out while reading video metadata.'));
      }
    }, 10000);

    const finalizeMeta = (dur: number) => {
      clearTimeout(timeout);
      const width = tempVideo.videoWidth || 720;
      const height = tempVideo.videoHeight || 1280;
      cleanup();
      resolve({ rawDuration: dur, width, height });
    };

    tempVideo.onloadedmetadata = () => {
      const rawDuration = tempVideo.duration;
      // MediaRecorder WebM blobs often report Infinity until seeked past the end
      if (rawDuration === Infinity || !isFinite(rawDuration) || rawDuration <= 0) {
        let seekTimer: ReturnType<typeof setTimeout> | null = null;
        const finishInfinityProbe = () => {
          if (seekTimer) clearTimeout(seekTimer);
          const resolvedDur =
            tempVideo.duration && isFinite(tempVideo.duration) && tempVideo.duration > 0
              ? tempVideo.duration
              : rawDuration;
          finalizeMeta(resolvedDur);
        };
        tempVideo.ondurationchange = () => {
          if (tempVideo.duration && isFinite(tempVideo.duration) && tempVideo.duration > 0) {
            finishInfinityProbe();
          }
        };
        tempVideo.onseeked = finishInfinityProbe;
        seekTimer = setTimeout(finishInfinityProbe, 1200);
        try {
          tempVideo.currentTime = 1e10;
        } catch {
          finishInfinityProbe();
        }
        return;
      }
      finalizeMeta(rawDuration);
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
 * Quickly inspect a local video File's duration and dimensions before full processing/trimming.
 */
export async function probeVideoFileMetadata(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const meta = await probeVideoMetadata(url);
    return {
      duration:
        meta.rawDuration && isFinite(meta.rawDuration) && meta.rawDuration > 0
          ? meta.rawDuration
          : 0,
      width: meta.width,
      height: meta.height
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Automatically trim, apply playback speed, and/or re-encode a video clip in the browser so its duration stays within
 * `targetDurationSec` (or optional [startTimeSec, endTimeSec] crop) and its file size fits within `maxBytes`.
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
    startTimeSec?: number;
    endTimeSec?: number;
    playbackSpeed?: number;
    overrideDurationSec?: number;
    soundTrack?: VideoSoundTrackOption;
    signal?: AbortSignal;
    onProgress?: (percent: number, stage?: string) => void;
  } = {}
): Promise<TrimmedVideoResult> {
  const maxBytes = options.maxBytes ?? MAX_FEED_VIDEO_BYTES;
  const targetCompressBytes = options.targetCompressBytes ?? Math.min(maxBytes, TARGET_COMPRESSED_FEED_VIDEO_BYTES);
  const compressThresholdBytes = options.compressThresholdBytes ?? AUTO_COMPRESS_FEED_THRESHOLD_BYTES;
  const autoCompress = options.autoCompress ?? true;
  const maxDimension = options.maxDimension ?? MAX_FEED_VIDEO_DIMENSION;
  const playbackSpeed = normalizePlaybackSpeed(options.playbackSpeed);
  const hasSpeedChange = Math.abs(playbackSpeed - 1) > 0.02;
  const soundTrack = options.soundTrack;
  const hasSoundOverlay = Boolean(soundTrack?.url);
  const signal = options.signal;
  const onProgress = options.onProgress;

  if (signal?.aborted) {
    throw new Error('Video processing cancelled.');
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const meta = await probeVideoMetadata(sourceUrl);
    const hasFiniteDuration = Boolean(meta.rawDuration && isFinite(meta.rawDuration) && meta.rawDuration > 0);
    const fallbackDur =
      typeof options.overrideDurationSec === 'number' &&
      isFinite(options.overrideDurationSec) &&
      options.overrideDurationSec > 0
        ? options.overrideDurationSec
        : targetDurationSec;
    const rawDur = hasFiniteDuration ? meta.rawDuration : fallbackDur;
    const originalDuration = Math.max(1, Math.round(rawDur));

    const safeStart = Math.max(0, Math.min(options.startTimeSec ?? 0, Math.max(0, rawDur - 0.5)));
    const requestedEnd =
      typeof options.endTimeSec === 'number' &&
      isFinite(options.endTimeSec) &&
      options.endTimeSec > safeStart + 0.5
        ? Math.min(rawDur, options.endTimeSec)
        : rawDur;
    const rawSpan = Math.max(0.5, requestedEnd - safeStart);

    // Output duration is input span divided by playbackSpeed; keep output <= targetDurationSec
    const maxInputSpanSec = targetDurationSec * playbackSpeed;
    const hasExplicitCrop =
      safeStart > 0.15 ||
      (hasFiniteDuration && typeof options.endTimeSec === 'number' && requestedEnd < rawDur - 0.25);
    const needsDurationTrim =
      hasExplicitCrop || (hasFiniteDuration && rawDur > maxInputSpanSec + 0.5);
    const needsDimensionScale = meta.width > Math.max(maxDimension, 1920) || meta.height > Math.max(maxDimension, 1920);
    const needsSizeCompress =
      file.size > maxBytes ||
      (autoCompress && (file.size > compressThresholdBytes || needsDimensionScale));

    if (!needsDurationTrim && !needsSizeCompress && !hasSoundOverlay && !hasSpeedChange) {
      return {
        file,
        duration: Math.max(1, Math.min(targetDurationSec, originalDuration)),
        originalDuration,
        originalSizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        playbackSpeed: 1,
        wasTrimmed: false,
        wasCompressed: false
      };
    }

    if (typeof MediaRecorder === 'undefined') {
      if (file.size <= maxBytes && !needsDurationTrim && !hasSpeedChange) {
        return {
          file,
          duration: originalDuration,
          originalDuration,
          originalSizeBytes: file.size,
          width: meta.width,
          height: meta.height,
          playbackSpeed: 1,
          wasTrimmed: false,
          wasCompressed: false
        };
      }
      throw new Error(
        `Your browser does not support in-browser video editing. Please select a clip under ${formatVideoDuration(targetDurationSec)}.`
      );
    }

    const supportedMimeTypes = getSupportedRecorderMimeTypes();
    if (supportedMimeTypes.length === 0) {
      if (file.size <= maxBytes && !needsDurationTrim && !hasSpeedChange) {
        return {
          file,
          duration: originalDuration,
          originalDuration,
          originalSizeBytes: file.size,
          width: meta.width,
          height: meta.height,
          playbackSpeed: 1,
          wasTrimmed: false,
          wasCompressed: false
        };
      }
      throw new Error(
        `Automatic video processing is unavailable in this browser. Please select a clip of ${formatVideoDuration(targetDurationSec)} or less.`
      );
    }

    // rawDur already incorporates fallbackDur when container duration is Infinity
    const clipInputSpan = Math.max(0.5, Math.min(rawSpan, maxInputSpanSec));
    const effectiveEnd = safeStart + clipInputSpan;
    const outputDurationSec = Math.max(
      1,
      Math.min(targetDurationSec, Math.round(clipInputSpan / playbackSpeed))
    );
    const expectedWallDurationSec = Math.max(0.5, clipInputSpan / playbackSpeed);

    // Scale dimensions cleanly while preserving aspect ratio (allows up to Full HD 1080p: 1920x1080 / 1080x1920)
    // Align dimensions to multiples of 4 to avoid hardware encoder macroblock stride artifacts / bumpy edges
    let outW = meta.width;
    let outH = meta.height;
    if (outW >= outH && outW > maxDimension) {
      outH = Math.round((outH * maxDimension) / outW);
      outW = maxDimension;
    } else if (outH > outW && outH > maxDimension) {
      outW = Math.round((outW * maxDimension) / outH);
      outH = maxDimension;
    }
    outW = Math.max(4, outW & ~3);
    outH = Math.max(4, outH & ~3);

    // Target adaptive bitrate keyed to output duration so Full HD 1080p clips stay smooth and crisp
    const isFullHdFeed = maxDimension >= 1280;
    const bytesPerSecBudget = isFullHdFeed ? 165_000 : 88_000;
    const proportionalBudgetBytes = Math.min(
      targetCompressBytes,
      Math.max(Math.round(outputDurationSec * bytesPerSecBudget), 340 * 1024)
    );
    const effectiveBudgetBytes = Math.min(maxBytes, proportionalBudgetBytes);
    const targetBitsPerSec = Math.floor((effectiveBudgetBytes * 8 * 0.78) / Math.max(1, outputDurationSec));
    const maxVideoBitrate = isFullHdFeed ? 2_400_000 : 960_000;
    const videoBitsPerSecond = Math.max(280_000, Math.min(maxVideoBitrate, targetBitsPerSec));

    onProgress?.(
      2,
      hasSoundOverlay
        ? hasSpeedChange
          ? `Applying ${playbackSpeed}x speed & posted sound...`
          : needsDurationTrim
          ? `Applying sound & trimming video to ${formatVideoDuration(outputDurationSec)}...`
          : 'Applying posted sound & compressing video...'
        : hasSpeedChange
        ? hasExplicitCrop
          ? `Applying ${playbackSpeed}x speed & trim (${formatVideoDuration(outputDurationSec)})...`
          : `Applying ${playbackSpeed}x playback speed...`
        : hasExplicitCrop
        ? `Trimming video (${formatVideoDuration(safeStart)} – ${formatVideoDuration(effectiveEnd)})...`
        : needsDurationTrim
        ? `Auto-trimming & compressing video to ${formatVideoDuration(outputDurationSec)}...`
        : 'Auto-compressing video file size...'
    );

    // Prefer WebM VP8/VP9 first on Chromium/Firefox to avoid experimental Chromium MP4 fMP4/B-frame PTS jumps,
    // while retaining MP4/AVC first-class fallback for Safari/iOS where WebM isn't supported.
    const orderedCandidates = (() => {
      const webmTypes = supportedMimeTypes.filter((m) => m.includes('webm'));
      const mp4Types = supportedMimeTypes.filter((m) => !m.includes('webm'));
      return [...webmTypes, ...mp4Types];
    })();

    const encodeWithMime = (mimeType: string) =>
      new Promise<Blob>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Video processing cancelled.'));
          return;
        }

        const video = document.createElement('video');
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.defaultPlaybackRate = playbackSpeed;
        video.playbackRate = playbackSpeed;
        (video as any).preservesPitch = true;
        (video as any).mozPreservesPitch = true;
        (video as any).webkitPreservesPitch = true;
        // Keep element unoccluded & above 1/255 alpha so Chromium never throttles hardware video decoding
        video.style.cssText =
          'position:fixed;right:0;bottom:0;width:8px;height:8px;opacity:0.02;pointer-events:none;z-index:1;';
        if (typeof document !== 'undefined' && document.body) {
          document.body.appendChild(video);
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx =
          canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
          canvas.getContext('2d', { alpha: false }) ||
          canvas.getContext('2d');

        if (!ctx) {
          if (video.parentNode) video.parentNode.removeChild(video);
          reject(new Error('Could not initialize video canvas for processing.'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        let rafId: number | null = null;
        let vfcId: number | null = null;
        let fallbackFrameTimer: ReturnType<typeof setTimeout> | null = null;
        let recorder: MediaRecorder | null = null;
        let audioCtx: AudioContext | null = null;
        let silentKeepaliveOsc: OscillatorNode | null = null;
        let combinedStream: MediaStream | null = null;
        let soundVideoEl: HTMLVideoElement | null = null;
        let safetyTimer: ReturnType<typeof setTimeout> | null = null;
        let finished = false;
        let aborted = false;
        const chunks: BlobPart[] = [];

        const clearScheduledFrame = () => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (vfcId !== null && typeof (video as any).cancelVideoFrameCallback === 'function') {
            try {
              (video as any).cancelVideoFrameCallback(vfcId);
            } catch {
              // ignore
            }
            vfcId = null;
          }
          if (fallbackFrameTimer !== null) {
            clearTimeout(fallbackFrameTimer);
            fallbackFrameTimer = null;
          }
        };

        const cleanup = () => {
          clearScheduledFrame();
          if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort);
          }
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
          video.onseeked = null;
          video.removeAttribute('src');
          video.load();
          if (video.parentNode) {
            video.parentNode.removeChild(video);
          }

          if (soundVideoEl) {
            try {
              soundVideoEl.pause();
            } catch {
              // ignore
            }
            soundVideoEl.removeAttribute('src');
            soundVideoEl.load();
            soundVideoEl = null;
          }

          if (silentKeepaliveOsc) {
            try {
              silentKeepaliveOsc.stop();
              silentKeepaliveOsc.disconnect();
            } catch {
              // ignore
            }
            silentKeepaliveOsc = null;
          }

          if (combinedStream) {
            combinedStream.getTracks().forEach((t) => t.stop());
            combinedStream = null;
          }
          if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
          }
        };

        const onAbort = () => {
          if (aborted || finished) return;
          aborted = true;
          finished = true;
          if (recorder && recorder.state !== 'inactive') {
            try {
              recorder.onstop = null;
              recorder.onerror = null;
              recorder.stop();
            } catch {
              // ignore
            }
          }
          cleanup();
          reject(new Error('Video processing cancelled.'));
        };
        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        const stopRecording = () => {
          if (finished) return;
          finished = true;
          clearScheduledFrame();
          try {
            video.pause();
            soundVideoEl?.pause();
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
            if (safeStart > 0.05) {
              await new Promise<void>((resSeek) => {
                let settled = false;
                const finishSeek = () => {
                  if (settled) return;
                  settled = true;
                  video.onseeked = null;
                  resSeek();
                };
                const timer = setTimeout(finishSeek, 2500);
                video.onseeked = () => {
                  clearTimeout(timer);
                  finishSeek();
                };
                try {
                  video.currentTime = safeStart;
                } catch {
                  clearTimeout(timer);
                  finishSeek();
                }
              });
            } else {
              video.currentTime = 0;
            }

            // Ensure playbackRate is enforced after seek
            video.defaultPlaybackRate = playbackSpeed;
            video.playbackRate = playbackSpeed;
            (video as any).preservesPitch = true;

            // Draw initial frame before creating steady 30fps stream (prevents jittery manual PTS timestamps)
            ctx.drawImage(video, 0, 0, outW, outH);

            const canvasStream = canvas.captureStream(30);
            const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

            // Prepare posted sound element if soundTrack overlay is requested
            if (hasSoundOverlay && soundTrack?.url) {
              soundVideoEl = document.createElement('video');
              soundVideoEl.playsInline = true;
              soundVideoEl.crossOrigin = 'anonymous';
              soundVideoEl.preload = 'auto';
              soundVideoEl.loop = true;
              await new Promise<void>((res) => {
                if (!soundVideoEl) {
                  res();
                  return;
                }
                const timer = setTimeout(res, 3500);
                const done = () => {
                  clearTimeout(timer);
                  res();
                };
                soundVideoEl.onloadeddata = done;
                soundVideoEl.onerror = done;
                soundVideoEl.src = soundTrack.url;
                if (soundVideoEl.readyState >= 2) done();
              });
            }

            // Attach audio silently via Web Audio API + silent keepalive so muxers always get steady clock-synced audio frames
            try {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioCtx) {
                audioCtx = new AudioCtx();
                if (audioCtx.state === 'suspended') {
                  await audioCtx.resume().catch(() => {});
                }
                const destNode = audioCtx.createMediaStreamDestination();

                // Silent continuous keepalive prevents Opus/AAC muxer timestamp stalls on silent video clips
                silentKeepaliveOsc = audioCtx.createOscillator();
                const keepaliveGain = audioCtx.createGain();
                keepaliveGain.gain.value = 0;
                silentKeepaliveOsc.connect(keepaliveGain);
                keepaliveGain.connect(destNode);
                silentKeepaliveOsc.start();

                const srcNode = audioCtx.createMediaElementSource(video);
                const origGain = audioCtx.createGain();
                origGain.gain.value = hasSoundOverlay
                  ? soundTrack?.mode === 'mix'
                    ? 0.45
                    : 0
                  : 1;
                srcNode.connect(origGain);
                origGain.connect(destNode);
                video.muted = false;

                if (soundVideoEl) {
                  const soundNode = audioCtx.createMediaElementSource(soundVideoEl);
                  const soundGain = audioCtx.createGain();
                  soundGain.gain.value = soundTrack?.mode === 'mix' ? 0.85 : 1.0;
                  soundNode.connect(soundGain);
                  soundGain.connect(destNode);
                  soundVideoEl.muted = false;
                }

                const audioTracks = destNode.stream.getAudioTracks();
                if (audioTracks.length > 0) {
                  tracks.push(...audioTracks);
                }
              } else {
                video.muted = true;
              }
            } catch {
              video.muted = true;
            }

            combinedStream = new MediaStream(tracks);
            try {
              recorder = new MediaRecorder(combinedStream, {
                mimeType,
                videoBitsPerSecond,
                audioBitsPerSecond: 96_000
              });
            } catch {
              try {
                recorder = new MediaRecorder(combinedStream, {
                  mimeType,
                  videoBitsPerSecond
                });
              } catch {
                recorder = new MediaRecorder(combinedStream, { mimeType });
              }
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
              if (blob.size === 0) {
                reject(new Error('Encoded video output was empty.'));
                return;
              }
              onProgress?.(100);
              resolve(blob);
            };

            let lastDrawTs = 0;
            let lastProgressTs = 0;
            let lastReportedPct = -1;
            const supportsRVFC = typeof (video as any).requestVideoFrameCallback === 'function';

            const emitProgress = (now: number) => {
              const elapsed = Math.max(0, video.currentTime - safeStart);
              const pct = Math.min(99, Math.max(2, Math.round((elapsed / clipInputSpan) * 98)));
              if (
                pct !== lastReportedPct &&
                (Math.abs(pct - lastReportedPct) >= 2 || now - lastProgressTs >= 250 || pct >= 99)
              ) {
                lastReportedPct = pct;
                lastProgressTs = now;
                onProgress?.(pct);
              }
            };

            const drawFrame = (now: number) => {
              try {
                ctx.drawImage(video, 0, 0, outW, outH);
              } catch {
                // ignore frame error
              }
              emitProgress(now);
            };

            const scheduleNextFrame = () => {
              if (finished) return;
              if (typeof document !== 'undefined' && document.hidden) {
                // Timer fallback when tab is backgrounded so encoding continues smoothly
                fallbackFrameTimer = setTimeout(drawLoop, 33);
              } else if (supportsRVFC) {
                vfcId = (video as any).requestVideoFrameCallback(() => {
                  if (finished) return;
                  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                  // Paint every decoded frame cleanly onto the 30Hz captureStream canvas without dropping 1x/1.25x/1.5x frames
                  if (now - lastDrawTs >= 14 || video.ended) {
                    lastDrawTs = now;
                    drawFrame(now);
                  } else {
                    emitProgress(now);
                  }
                  if (video.currentTime >= effectiveEnd - 0.02 || video.ended) {
                    stopRecording();
                    return;
                  }
                  scheduleNextFrame();
                });
              } else {
                rafId = requestAnimationFrame(drawLoop);
              }
            };

            const drawLoop = () => {
              if (finished) return;
              const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (now - lastDrawTs >= 30 || video.ended) {
                lastDrawTs = now;
                drawFrame(now);
              }

              if (video.currentTime >= effectiveEnd - 0.02 || video.ended) {
                stopRecording();
                return;
              }
              scheduleNextFrame();
            };

            // Start playback FIRST and emit initial frame right as playback runs to prevent 0:00 freeze bumps
            if (soundVideoEl) {
              soundVideoEl.currentTime = 0;
              void soundVideoEl.play().catch(() => {});
            }
            await video.play();
            video.playbackRate = playbackSpeed;

            recorder.start(500);
            drawFrame(typeof performance !== 'undefined' ? performance.now() : Date.now());
            scheduleNextFrame();

            video.onended = () => stopRecording();
            safetyTimer = setTimeout(() => stopRecording(), (expectedWallDurationSec + 6) * 1000);
          } catch (err) {
            cleanup();
            reject(
              err instanceof Error
                ? err
                : new Error('Unable to start automatic video processing in this browser.')
            );
          }
        };

        // Attach event handlers BEFORE assigning `src` so cached blob loads never miss `loadeddata`
        video.onloadeddata = () => {
          video.onloadeddata = null;
          if (!aborted) startCapture();
        };

        video.onerror = () => {
          cleanup();
          reject(new Error('Could not decode selected video for processing.'));
        };

        video.src = sourceUrl;
        if (video.readyState >= 2) {
          video.onloadeddata = null;
          startCapture();
        }
      });

    let trimmedBlob: Blob | null = null;
    let usedMimeType = orderedCandidates[0];
    let lastEncodeError: unknown = null;

    for (const candidateMime of orderedCandidates) {
      if (signal?.aborted) {
        throw new Error('Video processing cancelled.');
      }
      try {
        usedMimeType = candidateMime;
        trimmedBlob = await encodeWithMime(candidateMime);
        if (trimmedBlob && trimmedBlob.size > 0) {
          break;
        }
      } catch (err) {
        if (signal?.aborted) {
          throw err;
        }
        lastEncodeError = err;
        trimmedBlob = null;
      }
    }

    if (!trimmedBlob) {
      throw lastEncodeError instanceof Error
        ? lastEncodeError
        : new Error('Video processing failed in your browser.');
    }

    const outMime = trimmedBlob.type || usedMimeType.split(';')[0] || 'video/webm';
    const ext = outMime.includes('mp4') ? 'mp4' : 'webm';
    const baseName = (file.name || 'short-video').replace(/\.[^.]+$/, '');
    const compressedFile = new File([trimmedBlob], `${baseName}-processed.${ext}`, {
      type: outMime
    });

    // If trimming/speed wasn't required and no sound overlay applied and original is smaller, keep original file
    if (
      !needsDurationTrim &&
      !hasSpeedChange &&
      !hasSoundOverlay &&
      file.size <= maxBytes &&
      compressedFile.size >= file.size
    ) {
      return {
        file,
        duration: outputDurationSec,
        originalDuration,
        originalSizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        playbackSpeed: 1,
        wasTrimmed: false,
        wasCompressed: false
      };
    }

    if (compressedFile.size > maxBytes) {
      const mbLimit = (maxBytes / (1024 * 1024)).toFixed(1);
      throw new Error(
        maxBytes < 1024 * 1024
          ? `Even after compressing & trimming to ${Math.round(outputDurationSec)}s, this video is ${(compressedFile.size / 1024).toFixed(0)}KB. Story videos must stay under ${Math.round(maxBytes / 1024)}KB.`
          : `Even after compressing & trimming to ${Math.round(outputDurationSec)}s, this video is ${(compressedFile.size / (1024 * 1024)).toFixed(1)} MB (limit ${mbLimit} MB).`
      );
    }

    return {
      file: compressedFile,
      duration: outputDurationSec,
      originalDuration,
      originalSizeBytes: file.size,
      width: outW,
      height: outH,
      playbackSpeed,
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
      video.onseeked = null;
      video.onloadeddata = null;
      resolve(val);
    };

    const timeout = setTimeout(() => {
      // Attempt drawing whatever frame is currently decoded before giving up
      if (video.readyState >= 2) {
        drawFrame();
      } else {
        finish(undefined);
      }
    }, 2500);

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
        const thumb = canvas.toDataURL('image/jpeg', 0.75);
        clearTimeout(timeout);
        finish(thumb.length <= 180_000 ? thumb : canvas.toDataURL('image/jpeg', 0.55));
      } catch {
        clearTimeout(timeout);
        finish(undefined);
      }
    };

    video.onseeked = drawFrame;
    try {
      if (seekTime <= 0.05 && video.readyState >= 2) {
        drawFrame();
        return;
      }
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
    throw new Error(`Video is ${mb} MB. Please choose a video under 500 MB so it can be processed safely.`);
  }

  let workingFile = file;
  let wasAutoTrimmed = false;
  let wasCompressed = false;
  let originalDuration: number | undefined;
  let encodedDurationOverride: number | undefined;
  let appliedPlaybackSpeed = normalizePlaybackSpeed(opts.playbackSpeed);
  const hasSpeedChange = Math.abs(appliedPlaybackSpeed - 1) > 0.02;
  const originalSizeBytes = file.size;

  if (
    autoTrim ||
    autoCompress ||
    opts.soundTrack?.url ||
    opts.startTimeSec !== undefined ||
    opts.endTimeSec !== undefined ||
    hasSpeedChange
  ) {
    const trimRes = await trimVideoToLength(file, autoTrim ? maxDurationSec : 3600, {
      maxBytes,
      targetCompressBytes: TARGET_COMPRESSED_FEED_VIDEO_BYTES,
      compressThresholdBytes: AUTO_COMPRESS_FEED_THRESHOLD_BYTES,
      autoCompress,
      maxDimension: opts.maxDimension ?? MAX_FEED_VIDEO_DIMENSION,
      startTimeSec: opts.startTimeSec,
      endTimeSec: opts.endTimeSec,
      playbackSpeed: appliedPlaybackSpeed,
      overrideDurationSec: opts.overrideDurationSec,
      soundTrack: opts.soundTrack,
      signal: opts.signal,
      onProgress: opts.onProgress
    });
    workingFile = trimRes.file;
    wasAutoTrimmed = trimRes.wasTrimmed;
    wasCompressed = trimRes.wasCompressed;
    originalDuration = trimRes.originalDuration;
    encodedDurationOverride = trimRes.duration;
    appliedPlaybackSpeed = trimRes.playbackSpeed;
  } else if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Video is ${mb} MB. Feed videos can be up to ${(maxBytes / (1024 * 1024)).toFixed(0)} MB and ${formatVideoDuration(maxDurationSec)}.`
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
        typeof encodedDurationOverride === 'number' &&
        isFinite(encodedDurationOverride) &&
        encodedDurationOverride > 0
          ? Math.max(1, Math.min(maxDurationSec, Math.round(encodedDurationOverride)))
          : typeof opts.overrideDurationSec === 'number' &&
            isFinite(opts.overrideDurationSec) &&
            opts.overrideDurationSec > 0
          ? Math.max(1, Math.min(maxDurationSec, Math.round(opts.overrideDurationSec / appliedPlaybackSpeed)))
          : undefined;

      const duration =
        rawDuration && isFinite(rawDuration)
          ? Math.max(1, Math.min(maxDurationSec, Math.round(rawDuration)))
          : validOverride ?? (wasAutoTrimmed ? maxDurationSec : 10);

      if (!autoTrim && rawDuration && isFinite(rawDuration) && rawDuration > maxDurationSec + 0.9) {
        cleanup();
        reject(
          new Error(
            `Video is ${formatVideoDuration(Math.round(rawDuration))} long. Feed videos must be ${formatVideoDuration(maxDurationSec)} or less.`
          )
        );
        return;
      }

      const width = tempVideo.videoWidth || 720;
      const height = tempVideo.videoHeight || 1280;
      const seekTarget = rawDuration && isFinite(rawDuration) ? Math.min(0.4, rawDuration * 0.25) : 0;
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
      playbackSpeed: appliedPlaybackSpeed,
      thumbnailDataUrl: metadata.thumbnailDataUrl,
      inlineDataUrl: fullDataUrl,
      chunkCount: 0,
      previewObjectUrl,
      sourceFile: workingFile,
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
    playbackSpeed: appliedPlaybackSpeed,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    chunks,
    chunkCount: chunks.length,
    previewObjectUrl,
    sourceFile: workingFile,
    wasAutoTrimmed,
    originalDuration
  };
}

/**
 * Automatically trim, compress & encode a Citizen Story video (up to 30 seconds, fits inside Firestore 1MiB doc).
 */
export async function trimAndEncodeStoryVideo(
  file: File,
  onProgressOrOptions?:
    | ((percent: number, stage?: string) => void)
    | {
        soundTrack?: VideoSoundTrackOption;
        onProgress?: (percent: number, stage?: string) => void;
      }
): Promise<EncodedStoryVideoResult> {
  const onProgress =
    typeof onProgressOrOptions === 'function'
      ? onProgressOrOptions
      : onProgressOrOptions?.onProgress;
  const soundTrack =
    typeof onProgressOrOptions === 'object' ? onProgressOrOptions?.soundTrack : undefined;

  const mimeType = file.type || 'video/mp4';
  const isVideoExt = /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || '');

  if (!mimeType.startsWith('video/') && !isVideoExt) {
    throw new Error('Please select a valid video file (MP4, WebM, MOV).');
  }

  if (file.size === 0) {
    throw new Error('Selected video file appears to be empty.');
  }

  if (file.size > MAX_RAW_VIDEO_INPUT_BYTES) {
    throw new Error('Video file is over 500 MB. Please choose a smaller clip for stories.');
  }

  const trimmed = await trimVideoToLength(file, MAX_STORY_VIDEO_DURATION_SEC, {
    maxBytes: MAX_STORY_VIDEO_BYTES,
    targetCompressBytes: Math.round(MAX_STORY_VIDEO_BYTES * 0.85),
    compressThresholdBytes: AUTO_COMPRESS_STORY_THRESHOLD_BYTES,
    autoCompress: true,
    maxDimension: 480,
    soundTrack,
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

function prepareAlignedBase64Chunks(base64Chunks: string[]): string[] {
  const prepared: string[] = [];
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
      prepared.push(combined);
    }
  }

  return prepared;
}

/**
 * Assemble an array of Base64 slices directly into a Blob without giant string concatenation,
 * carrying over any non-4-aligned remainder across chunk boundaries and healing legacy header prefixes.
 */
export function base64ChunksToBlob(
  base64Chunks: string[],
  mimeType: string = 'video/mp4'
): Blob {
  const prepared = prepareAlignedBase64Chunks(base64Chunks);
  const parts: BlobPart[] = [];
  for (const combined of prepared) {
    const bytes = decodeBase64GroupToUint8Array(combined);
    if (bytes.byteLength > 0) {
      parts.push(bytes as unknown as BlobPart);
    }
  }
  const cleanMimeType = mimeType.split(';')[0]?.trim() || mimeType || 'video/mp4';
  return new Blob(parts, { type: cleanMimeType });
}

/**
 * Non-blocking variant of base64ChunksToBlob that uses native browser Base64 decoding
 * off the JavaScript main thread so active video playback stays smooth.
 */
export async function base64ChunksToBlobAsync(
  base64Chunks: string[],
  mimeType: string = 'video/mp4'
): Promise<Blob> {
  const prepared = prepareAlignedBase64Chunks(base64Chunks);
  const parts: BlobPart[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const chunk = prepared[i];
    let decoded = false;
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`data:application/octet-stream;base64,${chunk}`);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) {
            parts.push(buf);
          }
          decoded = true;
        }
      } catch {
        decoded = false;
      }
    }
    if (!decoded) {
      const bytes = decodeBase64GroupToUint8Array(chunk);
      if (bytes.byteLength > 0) {
        parts.push(bytes as unknown as BlobPart);
      }
      if (i < prepared.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
