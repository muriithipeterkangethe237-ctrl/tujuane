import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Video,
  Square,
  RefreshCw,
  Mic,
  MicOff,
  AlertCircle,
  Upload,
  X,
  Music,
  Play,
  Pause,
  Loader2,
  Trash2,
  Gauge
} from 'lucide-react';
import {
  DEFAULT_VIDEO_PLAYBACK_SPEED,
  MAX_FEED_VIDEO_DURATION_SEC,
  ProcessedFeedVideo,
  VIDEO_PLAYBACK_SPEED_OPTIONS,
  formatVideoDuration,
  normalizePlaybackSpeed,
  processFeedVideoFile
} from '../utils/videoProcessor';
import { PostedVideoSound, SoundMixMode } from '../types/community';
import { resolvePostVideoAudioSource } from '../services/communityService';
import { PostedSoundPickerModal } from './PostedSoundPickerModal';

export interface RecordedVideoSoundMeta {
  sound: PostedVideoSound | null;
  mixMode: SoundMixMode;
  soundAlreadyBaked: boolean;
  playbackSpeed: number;
  rawSourceFile?: File;
}

interface ShortVideoCameraRecorderProps {
  onVideoReady: (video: ProcessedFeedVideo, soundMeta?: RecordedVideoSoundMeta) => void;
  onCancel: () => void;
  onFallbackUploadClick?: () => void;
  disabled?: boolean;
  initialSound?: PostedVideoSound | null;
  initialMixMode?: SoundMixMode;
  onSoundChange?: (sound: PostedVideoSound | null, mode: SoundMixMode) => void;
}

interface SoundAudioGraph {
  ctx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  soundEl: HTMLVideoElement;
  soundSource: MediaElementAudioSourceNode;
  monitorGain: GainNode;
  recordSoundGain: GainNode;
  recordMicGain: GainNode;
}

function pickSupportedVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  // Prefer VP8/Opus first on Chromium/Firefox for even frame timestamps without hardware B-frame jitter,
  // with H.264/MP4 support for Safari/iOS.
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/mp4;codecs=avc1,mp4a',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function waitForMediaReady(el: HTMLVideoElement, timeoutMs: number = 6000): Promise<void> {
  if (el.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('error', onErr);
      if (err) reject(err);
      else resolve();
    };
    const onReady = () => finish();
    const onErr = () => finish(new Error('Could not decode selected sound audio.'));
    const timer = window.setTimeout(() => {
      if (el.readyState >= 1) finish();
      else finish(new Error('Timed out loading selected sound.'));
    }, timeoutMs);
    el.addEventListener('canplay', onReady);
    el.addEventListener('loadeddata', onReady);
    el.addEventListener('error', onErr);
  });
}

export const ShortVideoCameraRecorder: React.FC<ShortVideoCameraRecorderProps> = ({
  onVideoReady,
  onCancel,
  onFallbackUploadClick,
  disabled = false,
  initialSound = null,
  initialMixMode = 'replace',
  onSoundChange
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [withAudio, setWithAudio] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [resolvedFrontCamera, setResolvedFrontCamera] = useState(false);

  // Posted Video Sound state
  const [activeSound, setActiveSound] = useState<PostedVideoSound | null>(initialSound);
  const [mixMode, setMixMode] = useState<SoundMixMode>(initialMixMode);
  const [soundPlayableUrl, setSoundPlayableUrl] = useState<string | null>(
    initialSound?.resolvedPlayableUrl || null
  );
  const [isLoadingSound, setIsLoadingSound] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [isAuditioningSound, setIsAuditioningSound] = useState(false);
  const [isSoundPickerOpen, setIsSoundPickerOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(DEFAULT_VIDEO_PLAYBACK_SPEED);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Single-lifetime detached <video> + WebAudio graph refs
  const soundElRef = useRef<HTMLVideoElement | null>(null);
  const soundGraphRef = useRef<SoundAudioGraph | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const soundMixedInRecordingRef = useRef<boolean>(false);

  // Sync external initialSound/initialMixMode if changed before recording
  useEffect(() => {
    setActiveSound(initialSound ?? null);
  }, [initialSound?.postId]);

  useEffect(() => {
    setMixMode(initialMixMode);
  }, [initialMixMode]);

  const teardownSoundElementAndGraph = useCallback(() => {
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }
    if (soundGraphRef.current) {
      try {
        soundGraphRef.current.soundSource.disconnect();
        soundGraphRef.current.monitorGain.disconnect();
        soundGraphRef.current.recordSoundGain.disconnect();
        soundGraphRef.current.recordMicGain.disconnect();
        void soundGraphRef.current.ctx.close().catch(() => {});
      } catch {
        // ignore
      }
      soundGraphRef.current = null;
    }
    if (soundElRef.current) {
      try {
        soundElRef.current.pause();
        soundElRef.current.currentTime = 0;
        soundElRef.current.removeAttribute('src');
        soundElRef.current.load();
      } catch {
        // ignore
      }
      soundElRef.current = null;
    }
    setIsAuditioningSound(false);
  }, []);

  // Resolve playable URL for the active sound whenever activeSound changes
  useEffect(() => {
    let cancelled = false;
    setSoundError(null);
    teardownSoundElementAndGraph();

    if (!activeSound) {
      setSoundPlayableUrl(null);
      setIsLoadingSound(false);
      return;
    }

    if (activeSound.resolvedPlayableUrl) {
      setSoundPlayableUrl(activeSound.resolvedPlayableUrl);
      setIsLoadingSound(false);
      return;
    }

    setSoundPlayableUrl(null);
    setIsLoadingSound(true);
    resolvePostVideoAudioSource(activeSound)
      .then((url) => {
        if (cancelled || !isMountedRef.current) return;
        setSoundPlayableUrl(url);
      })
      .catch((err: any) => {
        if (cancelled || !isMountedRef.current) return;
        setSoundError(err?.message || 'Could not load audio from this posted video.');
      })
      .finally(() => {
        if (!cancelled && isMountedRef.current) {
          setIsLoadingSound(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSound?.postId, activeSound?.resolvedPlayableUrl, teardownSoundElementAndGraph]);

  // Create detached <video> once per resolved soundPlayableUrl
  useEffect(() => {
    teardownSoundElementAndGraph();
    if (!soundPlayableUrl) return;

    const el = document.createElement('video');
    el.playsInline = true;
    el.loop = true;
    el.muted = false;
    el.volume = 1;
    el.preload = 'auto';
    el.src = soundPlayableUrl;
    el.onpause = () => {
      if (isMountedRef.current) setIsAuditioningSound(false);
    };
    el.onplay = () => {
      if (isMountedRef.current) setIsAuditioningSound(true);
    };
    soundElRef.current = el;

    return () => {
      teardownSoundElementAndGraph();
    };
  }, [soundPlayableUrl, teardownSoundElementAndGraph]);

  // Keep gain nodes updated if user toggles mixMode
  useEffect(() => {
    const graph = soundGraphRef.current;
    if (!graph) return;
    graph.recordSoundGain.gain.value = mixMode === 'mix' ? 0.85 : 1.0;
    graph.recordMicGain.gain.value =
      activeSound && mixMode === 'replace' ? 0 : withAudio && audioAvailable ? 0.85 : 0;
  }, [mixMode, activeSound, withAudio, audioAvailable]);

  const ensureSoundAudioGraph = useCallback(async (): Promise<SoundAudioGraph | null> => {
    const soundEl = soundElRef.current;
    if (!soundEl) return null;

    if (soundGraphRef.current && soundGraphRef.current.soundEl === soundEl) {
      if (soundGraphRef.current.ctx.state === 'suspended') {
        await soundGraphRef.current.ctx.resume().catch(() => {});
      }
      return soundGraphRef.current;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const dest = ctx.createMediaStreamDestination();
    const soundSource = ctx.createMediaElementSource(soundEl);
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = 1.0;

    const recordSoundGain = ctx.createGain();
    recordSoundGain.gain.value = mixMode === 'mix' ? 0.85 : 1.0;

    const recordMicGain = ctx.createGain();
    recordMicGain.gain.value =
      activeSound && mixMode === 'replace' ? 0 : withAudio && audioAvailable ? 0.85 : 0;

    soundSource.connect(monitorGain);
    monitorGain.connect(ctx.destination);
    soundSource.connect(recordSoundGain);
    recordSoundGain.connect(dest);
    recordMicGain.connect(dest);

    const graph: SoundAudioGraph = {
      ctx,
      dest,
      soundEl,
      soundSource,
      monitorGain,
      recordSoundGain,
      recordMicGain
    };
    soundGraphRef.current = graph;
    return graph;
  }, [mixMode, activeSound, withAudio, audioAvailable]);

  const stopSoundPlayback = useCallback(() => {
    const el = soundElRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // ignore
      }
    }
    setIsAuditioningSound(false);
  }, []);

  const handleToggleAuditionSound = async () => {
    if (!soundElRef.current || isRecording || isProcessing || isLoadingSound) return;
    setSoundError(null);

    if (isAuditioningSound) {
      stopSoundPlayback();
      return;
    }

    try {
      await ensureSoundAudioGraph();
      await waitForMediaReady(soundElRef.current, 5000);
      soundElRef.current.currentTime = 0;
      await soundElRef.current.play();
      setIsAuditioningSound(true);
    } catch (err: any) {
      setSoundError(err?.message || 'Could not preview this sound.');
      stopSoundPlayback();
    }
  };

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const stopMediaStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user', enableAudio: boolean) => {
      if (!isSupported) {
        setIsInitializing(false);
        setCameraError(
          'In-browser camera recording is not supported on this browser. Use your device camera button or upload a video file.'
        );
        return;
      }

      stopMediaStream();
      setIsInitializing(true);
      setCameraError(null);

      const videoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: targetFacing },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1920 },
        frameRate: { ideal: 30 }
      };

      let stream: MediaStream | null = null;
      let micWorked = enableAudio;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: enableAudio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            : false
        });
      } catch (primaryErr: any) {
        if (enableAudio && primaryErr?.name !== 'NotAllowedError' && primaryErr?.name !== 'PermissionDeniedError') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false
            });
            micWorked = false;
          } catch (videoOnlyErr) {
            stream = null;
            handleGetUserMediaError(videoOnlyErr);
            return;
          }
        } else if (enableAudio) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false
            });
            micWorked = false;
          } catch (videoOnlyErr) {
            stream = null;
            handleGetUserMediaError(videoOnlyErr);
            return;
          }
        } else {
          handleGetUserMediaError(primaryErr);
          return;
        }
      }

      function handleGetUserMediaError(err: any) {
        if (!isMountedRef.current) return;
        setIsInitializing(false);
        setCameraReady(false);
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Camera access was denied. Allow camera permission in your browser settings or use Native Device Camera below.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError('No camera was detected on this device. You can upload a video file instead.');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraError('Your camera is currently in use by another app. Close it and retry.');
        } else {
          setCameraError('Could not open camera preview. Retry or use Native Device Camera below.');
        }
      }

      if (!stream) return;

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setAudioAvailable(micWorked && stream.getAudioTracks().length > 0);

      const videoTrack = stream.getVideoTracks()[0];
      const trackFacing = videoTrack?.getSettings?.()?.facingMode;
      setResolvedFrontCamera(trackFacing ? trackFacing === 'user' : targetFacing === 'user');

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      setIsInitializing(false);
      setCameraReady(true);
    },
    [isSupported, stopMediaStream]
  );

  useEffect(() => {
    isMountedRef.current = true;
    startCamera(facingMode, withAudio);

    return () => {
      isMountedRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopSoundPlayback();
      teardownSoundElementAndGraph();
      stopMediaStream();
    };
  }, [facingMode, withAudio, startCamera, stopMediaStream, stopSoundPlayback, teardownSoundElementAndGraph]);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopSoundPlayback();
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        setIsRecording(false);
        stoppingRef.current = false;
      }
    } else {
      setIsRecording(false);
      stoppingRef.current = false;
    }
  }, [stopSoundPlayback]);

  const handleStartRecording = async () => {
    if (disabled || isRecording || isProcessing || !streamRef.current) return;
    if (isLoadingSound) {
      setCameraError('Please wait a moment while the selected sound loads.');
      return;
    }

    setCameraError(null);
    setSoundError(null);
    stoppingRef.current = false;
    soundMixedInRecordingRef.current = false;

    const cameraStream = streamRef.current;
    let streamToRecord: MediaStream = cameraStream;
    const soundSnapshot = activeSound;
    const mixSnapshot = mixMode;
    const playableSnapshot = soundPlayableUrl;

    // If recording with a posted video sound, build a clean combined stream (Camera video + Web Audio mixed stream)
    if (soundSnapshot && soundElRef.current) {
      try {
        const graph = await ensureSoundAudioGraph();
        await waitForMediaReady(soundElRef.current, 6000);
        if (graph) {
          // Connect microphone ONLY to dest (via recordMicGain), never to speakers (monitorGain) -> zero echo
          if (micSourceRef.current) {
            try {
              micSourceRef.current.disconnect();
            } catch {
              // ignore
            }
            micSourceRef.current = null;
          }
          const micTracks = cameraStream.getAudioTracks();
          if (micTracks.length > 0 && withAudio && audioAvailable && mixSnapshot === 'mix') {
            const micOnlyStream = new MediaStream([micTracks[0]]);
            const micSrc = graph.ctx.createMediaStreamSource(micOnlyStream);
            micSrc.connect(graph.recordMicGain);
            graph.recordMicGain.gain.value = 0.85;
            micSourceRef.current = micSrc;
          } else {
            graph.recordMicGain.gain.value = 0;
          }

          graph.recordSoundGain.gain.value = mixSnapshot === 'mix' ? 0.85 : 1.0;

          const combinedTracks: MediaStreamTrack[] = [
            ...cameraStream.getVideoTracks(),
            ...graph.dest.stream.getAudioTracks()
          ];
          streamToRecord = new MediaStream(combinedTracks);
          soundMixedInRecordingRef.current = true;
        }
        soundElRef.current.currentTime = 0;
        await soundElRef.current.play();
      } catch (err: any) {
        soundMixedInRecordingRef.current = false;
        setSoundError(
          err?.message || 'Live sound mixing unavailable on this browser — sound will be applied right after recording.'
        );
      }
    }

    const preferredMime = pickSupportedVideoMimeType();
    const speedSnapshot = normalizePlaybackSpeed(playbackSpeed);

    let recorder: MediaRecorder;
    try {
      recorder = preferredMime
        ? new MediaRecorder(streamToRecord, {
            mimeType: preferredMime,
            videoBitsPerSecond: 1_800_000,
            audioBitsPerSecond: 96_000
          })
        : new MediaRecorder(streamToRecord, {
            videoBitsPerSecond: 1_800_000,
            audioBitsPerSecond: 96_000
          });
    } catch {
      try {
        recorder = preferredMime
          ? new MediaRecorder(streamToRecord, { mimeType: preferredMime })
          : new MediaRecorder(streamToRecord);
      } catch {
        stopSoundPlayback();
        setCameraError('Could not initialize video recorder on this browser.');
        return;
      }
    }

    chunksRef.current = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (evt: BlobEvent) => {
      if (evt.data && evt.data.size > 0) {
        chunksRef.current.push(evt.data);
      }
    };

    recorder.onerror = () => {
      if (!isMountedRef.current) return;
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stopSoundPlayback();
      setIsRecording(false);
      stoppingRef.current = false;
      setCameraError('Camera recording was interrupted. Please try again.');
    };

    recorder.onstop = async () => {
      stopSoundPlayback();
      const finalDuration = Math.min(
        MAX_FEED_VIDEO_DURATION_SEC,
        Math.max(0, Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)))
      );
      const actualMime = recorder.mimeType || preferredMime || 'video/webm';
      const recordedChunks = chunksRef.current;
      chunksRef.current = [];

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (!isMountedRef.current) return;
      setIsRecording(false);
      stoppingRef.current = false;

      if (recordedChunks.length === 0 || finalDuration < 0.8) {
        setElapsedSeconds(0);
        setCameraError('Recording was too short. Record for at least 1 second.');
        return;
      }

      setIsProcessing(true);
      try {
        const blob = new Blob(recordedChunks, { type: actualMime });
        const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
        const recordedFile = new File([blob], `tujuane-short-${Date.now()}.${ext}`, {
          type: actualMime
        });

        // If live WebAudio mixing wasn't active OR playback speed != 1x, process cleanly from raw 1x recording
        const needsPostMix = Boolean(soundSnapshot && playableSnapshot && !soundMixedInRecordingRef.current);
        const processed = await processFeedVideoFile(
          recordedFile,
          {
            overrideDurationSec: finalDuration,
            playbackSpeed: speedSnapshot,
            ...(needsPostMix && playableSnapshot
              ? { soundTrack: { url: playableSnapshot, mode: mixSnapshot } }
              : {})
          }
        );

        if (!isMountedRef.current) {
          URL.revokeObjectURL(processed.previewObjectUrl);
          return;
        }
        stopMediaStream();
        onVideoReady(processed, {
          sound: soundSnapshot,
          mixMode: mixSnapshot,
          soundAlreadyBaked: Boolean(soundSnapshot && soundMixedInRecordingRef.current),
          playbackSpeed: speedSnapshot,
          rawSourceFile: recordedFile
        });
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setCameraError(err?.message || 'Could not process recorded video. Please try a shorter clip.');
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
          setElapsedSeconds(0);
        }
      }
    };

    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setIsRecording(true);
    recorder.start(500);

    timerRef.current = window.setInterval(() => {
      const secs = (Date.now() - startTimeRef.current) / 1000;
      if (secs >= MAX_FEED_VIDEO_DURATION_SEC) {
        setElapsedSeconds(MAX_FEED_VIDEO_DURATION_SEC);
        stopRecording();
      } else {
        setElapsedSeconds(secs);
      }
    }, 100);
  };

  const handleNativeCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setCameraError(null);
    const soundSnapshot = activeSound;
    const mixSnapshot = mixMode;
    const speedSnapshot = normalizePlaybackSpeed(playbackSpeed);
    try {
      let resolvedUrl = soundPlayableUrl;
      if (soundSnapshot && !resolvedUrl) {
        resolvedUrl = await resolvePostVideoAudioSource(soundSnapshot).catch(() => null);
      }

      const processed = await processFeedVideoFile(
        file,
        {
          playbackSpeed: speedSnapshot,
          ...(soundSnapshot && resolvedUrl
            ? { soundTrack: { url: resolvedUrl, mode: mixSnapshot } }
            : {})
        }
      );
      if (!isMountedRef.current) {
        URL.revokeObjectURL(processed.previewObjectUrl);
        return;
      }
      stopMediaStream();
      onVideoReady(processed, {
        sound: soundSnapshot,
        mixMode: mixSnapshot,
        soundAlreadyBaked: false,
        playbackSpeed: speedSnapshot,
        rawSourceFile: file
      });
    } catch (err: any) {
      if (isMountedRef.current) {
        setCameraError(err?.message || 'Could not load video from device camera.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
      if (nativeCameraInputRef.current) {
        nativeCameraInputRef.current.value = '';
      }
    }
  };

  const handleSwitchCamera = () => {
    if (isRecording || isProcessing || isInitializing) return;
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleToggleAudio = () => {
    if (isRecording || isProcessing || isInitializing) return;
    setWithAudio((prev) => !prev);
  };

  const handleSelectPickerSound = (nextSound: PostedVideoSound, nextMode: SoundMixMode) => {
    setActiveSound(nextSound);
    setMixMode(nextMode);
    onSoundChange?.(nextSound, nextMode);
  };

  const handleClearActiveSound = () => {
    stopSoundPlayback();
    setActiveSound(null);
    setSoundError(null);
    onSoundChange?.(null, mixMode);
  };

  const handleToggleMixMode = (nextMode: SoundMixMode) => {
    if (isRecording || isProcessing) return;
    setMixMode(nextMode);
    onSoundChange?.(activeSound, nextMode);
  };

  const progressPct = Math.min(100, (elapsedSeconds / MAX_FEED_VIDEO_DURATION_SEC) * 100);
  const remainingSec = Math.max(0, Math.ceil(MAX_FEED_VIDEO_DURATION_SEC - elapsedSeconds));

  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-slate-950 text-white overflow-hidden shadow-lg space-y-0">
      {/* Hidden native mobile camera fallback */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleNativeCameraChange}
        className="hidden"
      />

      {/* Top Viewfinder Controls */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/95 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          {isRecording ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-extrabold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              REC {formatVideoDuration(Math.floor(elapsedSeconds))} / {formatVideoDuration(MAX_FEED_VIDEO_DURATION_SEC)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>Live Camera Recorder</span>
            </span>
          )}
          {cameraReady && !audioAvailable && !isRecording && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold truncate">
              Mic muted
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleAudio}
            disabled={isRecording || isProcessing || isInitializing || disabled}
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-40 ${
              withAudio && audioAvailable
                ? 'bg-white/10 hover:bg-white/20 text-white'
                : 'bg-rose-500/25 hover:bg-rose-500/35 text-rose-200'
            }`}
            title={withAudio ? 'Mute microphone' : 'Enable microphone'}
            aria-label={withAudio ? 'Mute microphone' : 'Enable microphone'}
          >
            {withAudio && audioAvailable ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleSwitchCamera}
            disabled={isRecording || isProcessing || isInitializing || disabled}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40"
            title="Switch front/rear camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Flip</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isRecording) stopRecording();
              stopSoundPlayback();
              stopMediaStream();
              onCancel();
            }}
            disabled={isProcessing || disabled}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer disabled:opacity-40"
            title="Close camera"
            aria-label="Close camera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sound Bar for Using Posted Video Sound while Recording */}
      <div className="px-3.5 py-2 bg-indigo-950/75 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        {activeSound ? (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleToggleAuditionSound}
                disabled={isRecording || isProcessing || isLoadingSound}
                className="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                title={isAuditioningSound ? 'Stop sound preview' : 'Preview selected sound'}
              >
                {isLoadingSound ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isAuditioningSound ? (
                  <Pause className="w-3.5 h-3.5 fill-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-200 truncate">
                  <Music className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="truncate">{activeSound.soundTitle}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {soundError ? (
                    <span className="text-amber-300">{soundError}</span>
                  ) : isLoadingSound ? (
                    'Loading audio...'
                  ) : (
                    `by ${activeSound.authorName} · plays live during recording`
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="inline-flex rounded-lg bg-black/40 p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  disabled={isRecording || isProcessing}
                  onClick={() => handleToggleMixMode('replace')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors disabled:opacity-50 ${
                    mixMode === 'replace' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sound Only
                </button>
                <button
                  type="button"
                  disabled={isRecording || isProcessing}
                  onClick={() => handleToggleMixMode('mix')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors disabled:opacity-50 ${
                    mixMode === 'mix' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Mix + Mic
                </button>
              </div>

              <button
                type="button"
                disabled={isRecording || isProcessing}
                onClick={() => setIsSoundPickerOpen(true)}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white cursor-pointer disabled:opacity-40"
              >
                Change
              </button>
              <button
                type="button"
                disabled={isRecording || isProcessing}
                onClick={handleClearActiveSound}
                className="p-1 rounded-lg bg-white/10 hover:bg-rose-600 text-slate-300 hover:text-white cursor-pointer disabled:opacity-40"
                title="Remove selected sound"
                aria-label="Remove selected sound"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
              <Music className="w-3.5 h-3.5 text-indigo-400" />
              <span>Optional: Record with a posted video sound</span>
            </span>
            <button
              type="button"
              disabled={isRecording || isProcessing || disabled}
              onClick={() => setIsSoundPickerOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40"
            >
              <Music className="w-3 h-3" />
              <span>Add Sound</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Camera Preview Area */}
      <div className="relative bg-black flex items-center justify-center min-h-[240px] max-h-[320px] overflow-hidden">
        <video
          ref={liveVideoRef}
          autoPlay
          muted
          playsInline
          className={`w-full max-h-[320px] object-cover ${
            resolvedFrontCamera ? 'scale-x-[-1]' : ''
          } ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
        />

        {isInitializing && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs">
            <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>Starting camera preview...</span>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2.5 text-white text-xs font-semibold z-20">
            <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>
              {activeSound
                ? 'Preparing recorded video with selected sound...'
                : 'Preparing recorded short video...'}
            </span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-3 bg-slate-950/95 z-10">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-200 max-w-sm leading-relaxed">{cameraError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => startCamera(facingMode, withAudio)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Device Camera</span>
              </button>
              {onFallbackUploadClick && (
                <button
                  type="button"
                  onClick={() => {
                    stopSoundPlayback();
                    stopMediaStream();
                    onFallbackUploadClick();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload File</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Recording Progress Overlay Bar */}
        {isRecording && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
            <div
              className="h-full bg-rose-500 transition-all duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Recording Playback Speed Selector */}
      {!isRecording && (
        <div className="px-3.5 py-2 bg-slate-900/95 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Gauge className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Output Speed</span>
          </span>
          <div className="inline-flex items-center rounded-lg bg-black/50 p-0.5 gap-0.5 overflow-x-auto max-w-full">
            {VIDEO_PLAYBACK_SPEED_OPTIONS.map((spd) => {
              const active = Math.abs(playbackSpeed - spd) < 0.01;
              return (
                <button
                  key={spd}
                  type="button"
                  disabled={isRecording || isProcessing || disabled}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Recording Action Bar */}
      <div className="px-3.5 py-3 bg-slate-900 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10">
        <div className="text-[11px] text-slate-300 font-mono tabular-nums">
          {isRecording
            ? `${formatVideoDuration(remainingSec)} left · auto-stops at ${formatVideoDuration(MAX_FEED_VIDEO_DURATION_SEC)}`
            : activeSound
            ? `Sound (${mixMode === 'mix' ? 'Sound + Mic' : 'Sound Only'}) · ${playbackSpeed}x speed`
            : `Up to 5 min · Full HD · ${playbackSpeed}x speed`}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {!isRecording && (
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              disabled={isProcessing || disabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40"
              title="Open your phone/device native camera app"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Device Cam</span>
            </button>
          )}

          {isRecording ? (
            <button
              type="button"
              onClick={stopRecording}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>Stop & Use Clip</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={!cameraReady || isProcessing || isInitializing || isLoadingSound || disabled}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-extrabold shadow-md transition-colors cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>{isLoadingSound ? 'Loading Sound...' : 'Start Recording'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sound Picker Modal */}
      <PostedSoundPickerModal
        isOpen={isSoundPickerOpen}
        selectedSound={activeSound}
        initialMixMode={mixMode}
        audioSourceLabel="Camera Mic"
        onSelectSound={handleSelectPickerSound}
        onClearSound={handleClearActiveSound}
        onClose={() => setIsSoundPickerOpen(false)}
      />
    </div>
  );
};
