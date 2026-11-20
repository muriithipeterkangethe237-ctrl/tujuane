import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { UserProfile } from '../types/chat';
import { CreatePostParams, PostedVideoSound, SoundMixMode } from '../types/community';
import { createCommunityPost, resolvePostVideoAudioSource } from '../services/communityService';
import { publishCitizenStory } from '../services/storyService';
import {
  EncodedStoryVideoResult,
  MAX_FEED_VIDEO_DURATION_SEC,
  ProcessedFeedVideo,
  processFeedVideoFile,
  trimAndEncodeStoryVideo
} from '../utils/videoProcessor';
import { trackFunnelMilestone } from '../services/telemetryService';

export type BackgroundUploadJobStatus = 'compressing' | 'uploading' | 'completed' | 'failed';

export interface BackgroundUploadJob {
  id: string;
  kind: 'post' | 'story';
  title: string;
  status: BackgroundUploadJobStatus;
  progress: number;
  stageLabel: string;
  thumbnailDataUrl?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  wasCompressed?: boolean;
  wasAutoTrimmed?: boolean;
  error?: string;
  createdAt: number;
}

export interface EnqueuePostVideoUploadInput {
  title: string;
  author: UserProfile;
  basePostParams: CreatePostParams & Record<string, any>;
  processedVideo?: ProcessedFeedVideo | null;
  pendingVideoPromise?: Promise<ProcessedFeedVideo> | null;
  registerPendingProgress?: (cb: (pct: number, stage?: string) => void) => void;
  rawVideoFile?: File | null;
  trimRange?: { startTimeSec: number; endTimeSec: number } | null;
  playbackSpeed?: number;
  soundTrack?: { sound: PostedVideoSound; mode: SoundMixMode; url?: string } | null;
  initialProgress?: number;
  onCompleted?: (postId: string) => void;
  onFailed?: (errorMessage: string) => void;
}

export interface EnqueueStoryVideoUploadInput {
  author: UserProfile;
  county: string;
  caption?: string;
  encodedStory?: EncodedStoryVideoResult | null;
  pendingStoryPromise?: Promise<EncodedStoryVideoResult> | null;
  registerPendingProgress?: (cb: (pct: number, stage?: string) => void) => void;
  rawVideoFile?: File | null;
  soundTrack?: { sound: PostedVideoSound; mode: SoundMixMode; url?: string } | null;
  initialProgress?: number;
  onCompleted?: (storyId: string) => void;
  onFailed?: (errorMessage: string) => void;
}

interface StoredJobPayload {
  kind: 'post' | 'story';
  postInput?: EnqueuePostVideoUploadInput;
  storyInput?: EnqueueStoryVideoUploadInput;
}

interface BackgroundUploadContextValue {
  jobs: BackgroundUploadJob[];
  activeJobsCount: number;
  enqueuePostVideoUpload: (input: EnqueuePostVideoUploadInput) => string;
  enqueueStoryVideoUpload: (input: EnqueueStoryVideoUploadInput) => string;
  retryUploadJob: (jobId: string) => void;
  dismissUploadJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
}

const BackgroundUploadContext = createContext<BackgroundUploadContextValue | undefined>(undefined);

export const BackgroundUploadProvider: React.FC<{
  children: React.ReactNode;
  onNotify?: (message: string) => void;
}> = ({ children, onNotify }) => {
  const [jobs, setJobs] = useState<BackgroundUploadJob[]>([]);
  const payloadMapRef = useRef<Map<string, StoredJobPayload>>(new Map());
  const dismissTimersRef = useRef<Map<string, number>>(new Map());
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const activeJobsCount = jobs.filter(
    (j) => j.status === 'compressing' || j.status === 'uploading'
  ).length;

  // Warn user before closing tab while a background compression/upload is still running
  useEffect(() => {
    if (activeJobsCount === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeJobsCount]);

  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      dismissTimersRef.current.clear();
    };
  }, []);

  const updateJob = useCallback((jobId: string, patch: Partial<BackgroundUploadJob>) => {
    setJobs((prev) => {
      let didChange = false;
      const next = prev.map((j) => {
        if (j.id !== jobId) return j;
        for (const key of Object.keys(patch) as Array<keyof BackgroundUploadJob>) {
          if (j[key] !== patch[key]) {
            didChange = true;
            return { ...j, ...patch };
          }
        }
        return j;
      });
      return didChange ? next : prev;
    });
  }, []);

  const dismissUploadJob = useCallback((jobId: string) => {
    const existingTimer = dismissTimersRef.current.get(jobId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      dismissTimersRef.current.delete(jobId);
    }
    payloadMapRef.current.delete(jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const scheduleAutoDismiss = useCallback(
    (jobId: string, delayMs: number = 6500) => {
      const existingTimer = dismissTimersRef.current.get(jobId);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timerId = window.setTimeout(() => {
        dismissTimersRef.current.delete(jobId);
        dismissUploadJob(jobId);
      }, delayMs);
      dismissTimersRef.current.set(jobId, timerId);
    },
    [dismissUploadJob]
  );

  const runPostVideoJob = useCallback(
    async (jobId: string, input: EnqueuePostVideoUploadInput, forceReprocess: boolean = false) => {
      try {
        let processed = !forceReprocess ? input.processedVideo || null : null;

        if (!processed) {
          updateJob(jobId, {
            status: 'compressing',
            progress: Math.max(4, input.initialProgress ?? 5),
            stageLabel: 'Auto-compressing video file...',
            error: undefined
          });

          if (!forceReprocess && input.pendingVideoPromise) {
            input.registerPendingProgress?.((pct, stage) => {
              updateJob(jobId, {
                status: 'compressing',
                progress: pct,
                stageLabel: stage || 'Auto-compressing video file...'
              });
            });
            processed = await input.pendingVideoPromise;
          } else if (input.rawVideoFile) {
            let soundTrackOption: { url: string; mode: SoundMixMode } | undefined;
            if (input.soundTrack?.sound) {
              const resolvedSoundUrl =
                input.soundTrack.url ||
                (await resolvePostVideoAudioSource(input.soundTrack.sound));
              soundTrackOption = {
                url: resolvedSoundUrl,
                mode: input.soundTrack.mode
              };
            }
            processed = await processFeedVideoFile(input.rawVideoFile, {
              maxDurationSec: MAX_FEED_VIDEO_DURATION_SEC,
              autoTrim: true,
              autoCompress: true,
              startTimeSec: input.trimRange?.startTimeSec,
              endTimeSec: input.trimRange?.endTimeSec,
              playbackSpeed: input.playbackSpeed,
              soundTrack: soundTrackOption,
              onProgress: (pct, stage) => {
                updateJob(jobId, {
                  status: 'compressing',
                  progress: pct,
                  stageLabel: stage || 'Auto-compressing video file...'
                });
              }
            });
          } else {
            throw new Error('Video source is unavailable for upload.');
          }

          // Cache processed result on stored payload so a retry skips compression if upload failed
          const stored = payloadMapRef.current.get(jobId);
          if (stored?.postInput) {
            stored.postInput.processedVideo = processed;
            stored.postInput.pendingVideoPromise = null;
          }
        }

        updateJob(jobId, {
          status: 'uploading',
          progress: 5,
          stageLabel: 'Uploading video in background...',
          thumbnailDataUrl: processed.thumbnailDataUrl || input.basePostParams.videoThumbnail,
          originalSizeBytes: processed.originalSizeBytes,
          compressedSizeBytes: processed.sizeBytes,
          wasCompressed: processed.wasCompressed,
          wasAutoTrimmed: processed.wasAutoTrimmed,
          error: undefined
        });

        const selectedSound = input.soundTrack?.sound;
        const finalParams: CreatePostParams & Record<string, any> = {
          ...input.basePostParams,
          mediaType: 'video',
          mediaUrl: processed.inlineDataUrl || undefined,
          videoChunks: processed.chunks,
          videoThumbnail: processed.thumbnailDataUrl,
          videoDuration: processed.duration,
          videoSizeBytes: processed.sizeBytes,
          videoMimeType: processed.mimeType,
          ...(selectedSound
            ? {
                soundSourcePostId:
                  input.basePostParams.soundSourcePostId ||
                  selectedSound.sourceSoundPostId ||
                  selectedSound.postId,
                soundTitle: input.basePostParams.soundTitle || selectedSound.soundTitle,
                soundAuthorId: input.basePostParams.soundAuthorId || selectedSound.authorId,
                soundAuthorName: input.basePostParams.soundAuthorName || selectedSound.authorName
              }
            : {})
        };

        const postId = await createCommunityPost(input.author, finalParams, (pct) => {
          updateJob(jobId, {
            status: 'uploading',
            progress: pct,
            stageLabel:
              pct >= 96
                ? 'Finalizing video post...'
                : `Uploading in background (${pct}%)...`
          });
        });

        if (processed.previewObjectUrl) {
          try {
            URL.revokeObjectURL(processed.previewObjectUrl);
          } catch {
            // ignore
          }
        }

        updateJob(jobId, {
          status: 'completed',
          progress: 100,
          stageLabel: 'Published to TUJUANE Feed!'
        });

        trackFunnelMilestone('engaged_action', 'Published short video (background)');
        const savedNote =
          processed.wasCompressed && processed.originalSizeBytes && processed.originalSizeBytes > processed.sizeBytes
            ? ` (compressed ${Math.round(
                ((processed.originalSizeBytes - processed.sizeBytes) / processed.originalSizeBytes) * 100
              )}% smaller)`
            : '';
        onNotifyRef.current?.(`✓ Short video published to TUJUANE Feed${savedNote}!`);
        input.onCompleted?.(postId);
        scheduleAutoDismiss(jobId);
      } catch (err: any) {
        const message = err?.message || 'Background video upload failed. Tap Retry to try again.';
        updateJob(jobId, {
          status: 'failed',
          stageLabel: 'Upload failed',
          error: message
        });
        onNotifyRef.current?.(`⚠️ Background video upload failed: ${message}`);
        input.onFailed?.(message);
      }
    },
    [scheduleAutoDismiss, updateJob]
  );

  const runStoryVideoJob = useCallback(
    async (jobId: string, input: EnqueueStoryVideoUploadInput, forceReprocess: boolean = false) => {
      try {
        let encoded = !forceReprocess ? input.encodedStory || null : null;

        if (!encoded) {
          updateJob(jobId, {
            status: 'compressing',
            progress: Math.max(4, input.initialProgress ?? 5),
            stageLabel: 'Auto-compressing story video...',
            error: undefined
          });

          if (!forceReprocess && input.pendingStoryPromise) {
            input.registerPendingProgress?.((pct, stage) => {
              updateJob(jobId, {
                status: 'compressing',
                progress: pct,
                stageLabel: stage || 'Auto-compressing story video...'
              });
            });
            encoded = await input.pendingStoryPromise;
          } else if (input.rawVideoFile) {
            let soundTrackOption: { url: string; mode: SoundMixMode } | undefined;
            if (input.soundTrack?.sound) {
              const resolvedSoundUrl =
                input.soundTrack.url ||
                (await resolvePostVideoAudioSource(input.soundTrack.sound));
              soundTrackOption = {
                url: resolvedSoundUrl,
                mode: input.soundTrack.mode
              };
            }
            encoded = await trimAndEncodeStoryVideo(input.rawVideoFile, {
              soundTrack: soundTrackOption,
              onProgress: (pct, stage) => {
                updateJob(jobId, {
                  status: 'compressing',
                  progress: pct,
                  stageLabel: stage || 'Auto-compressing story video...'
                });
              }
            });
          } else {
            throw new Error('Story video source is unavailable.');
          }

          const stored = payloadMapRef.current.get(jobId);
          if (stored?.storyInput) {
            stored.storyInput.encodedStory = encoded;
            stored.storyInput.pendingStoryPromise = null;
          }
        }

        updateJob(jobId, {
          status: 'uploading',
          progress: 35,
          stageLabel: 'Uploading Citizen Story in background...',
          originalSizeBytes: encoded.originalSizeBytes,
          compressedSizeBytes: encoded.sizeBytes,
          wasCompressed: encoded.wasCompressed,
          wasAutoTrimmed: encoded.wasAutoTrimmed,
          error: undefined
        });

        const storySound = input.soundTrack?.sound;
        const storyId = await publishCitizenStory(input.author, {
          type: 'video',
          mediaUrl: encoded.dataUrl,
          caption: input.caption?.trim() || undefined,
          duration: encoded.duration,
          authorCounty: input.county,
          ...(storySound
            ? {
                soundSourcePostId: storySound.sourceSoundPostId || storySound.postId,
                soundTitle: storySound.soundTitle,
                soundAuthorId: storySound.authorId,
                soundAuthorName: storySound.authorName
              }
            : {})
        });

        updateJob(jobId, {
          status: 'completed',
          progress: 100,
          stageLabel: 'Story live for 24 hours!'
        });

        trackFunnelMilestone('engaged_action', 'Published citizen story (background)');
        onNotifyRef.current?.('✓ Video story published to Citizen Stories tray!');
        input.onCompleted?.(storyId);
        scheduleAutoDismiss(jobId);
      } catch (err: any) {
        const message = err?.message || 'Background story upload failed.';
        updateJob(jobId, {
          status: 'failed',
          stageLabel: 'Story upload failed',
          error: message
        });
        onNotifyRef.current?.(`⚠️ Story upload failed: ${message}`);
        input.onFailed?.(message);
      }
    },
    [scheduleAutoDismiss, updateJob]
  );

  const enqueuePostVideoUpload = useCallback(
    (input: EnqueuePostVideoUploadInput): string => {
      const jobId = `bg_post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const hasProcessed = Boolean(input.processedVideo);
      const job: BackgroundUploadJob = {
        id: jobId,
        kind: 'post',
        title: input.title || 'Short Video Post',
        status: hasProcessed ? 'uploading' : 'compressing',
        progress: hasProcessed ? 5 : input.initialProgress ?? 5,
        stageLabel: hasProcessed
          ? 'Uploading video in background...'
          : 'Auto-compressing video file...',
        thumbnailDataUrl: input.processedVideo?.thumbnailDataUrl,
        originalSizeBytes: input.processedVideo?.originalSizeBytes ?? input.rawVideoFile?.size,
        compressedSizeBytes: input.processedVideo?.sizeBytes,
        wasCompressed: input.processedVideo?.wasCompressed,
        wasAutoTrimmed: input.processedVideo?.wasAutoTrimmed,
        createdAt: Date.now()
      };

      payloadMapRef.current.set(jobId, { kind: 'post', postInput: { ...input } });
      setJobs((prev) => [job, ...prev.slice(0, 5)]);
      void runPostVideoJob(jobId, input, false);
      return jobId;
    },
    [runPostVideoJob]
  );

  const enqueueStoryVideoUpload = useCallback(
    (input: EnqueueStoryVideoUploadInput): string => {
      const jobId = `bg_story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const hasEncoded = Boolean(input.encodedStory);
      const job: BackgroundUploadJob = {
        id: jobId,
        kind: 'story',
        title: input.caption?.trim() || '24h Video Story',
        status: hasEncoded ? 'uploading' : 'compressing',
        progress: hasEncoded ? 30 : input.initialProgress ?? 5,
        stageLabel: hasEncoded
          ? 'Uploading story in background...'
          : 'Auto-compressing story video...',
        originalSizeBytes: input.encodedStory?.originalSizeBytes ?? input.rawVideoFile?.size,
        compressedSizeBytes: input.encodedStory?.sizeBytes,
        wasCompressed: input.encodedStory?.wasCompressed,
        wasAutoTrimmed: input.encodedStory?.wasAutoTrimmed,
        createdAt: Date.now()
      };

      payloadMapRef.current.set(jobId, { kind: 'story', storyInput: { ...input } });
      setJobs((prev) => [job, ...prev.slice(0, 5)]);
      void runStoryVideoJob(jobId, input, false);
      return jobId;
    },
    [runStoryVideoJob]
  );

  const retryUploadJob = useCallback(
    (jobId: string) => {
      const stored = payloadMapRef.current.get(jobId);
      if (!stored) return;
      if (stored.kind === 'post' && stored.postInput) {
        void runPostVideoJob(jobId, stored.postInput, !stored.postInput.processedVideo);
      } else if (stored.kind === 'story' && stored.storyInput) {
        void runStoryVideoJob(jobId, stored.storyInput, !stored.storyInput.encodedStory);
      }
    },
    [runPostVideoJob, runStoryVideoJob]
  );

  const clearCompletedJobs = useCallback(() => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.status === 'compressing' || j.status === 'uploading');
      const keepIds = new Set(next.map((j) => j.id));
      Array.from(payloadMapRef.current.keys()).forEach((id) => {
        if (!keepIds.has(id)) {
          payloadMapRef.current.delete(id);
        }
      });
      return next;
    });
  }, []);

  return (
    <BackgroundUploadContext.Provider
      value={{
        jobs,
        activeJobsCount,
        enqueuePostVideoUpload,
        enqueueStoryVideoUpload,
        retryUploadJob,
        dismissUploadJob,
        clearCompletedJobs
      }}
    >
      {children}
    </BackgroundUploadContext.Provider>
  );
};

export function useBackgroundUploads() {
  const ctx = useContext(BackgroundUploadContext);
  if (!ctx) {
    throw new Error('useBackgroundUploads must be used within a BackgroundUploadProvider');
  }
  return ctx;
}
