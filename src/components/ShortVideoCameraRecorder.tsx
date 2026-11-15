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
  X
} from 'lucide-react';
import {
  MAX_FEED_VIDEO_DURATION_SEC,
  ProcessedFeedVideo,
  formatVideoDuration,
  processFeedVideoFile
} from '../utils/videoProcessor';

interface ShortVideoCameraRecorderProps {
  onVideoReady: (video: ProcessedFeedVideo) => void;
  onCancel: () => void;
  onFallbackUploadClick?: () => void;
  disabled?: boolean;
}

function pickSupportedVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export const ShortVideoCameraRecorder: React.FC<ShortVideoCameraRecorderProps> = ({
  onVideoReady,
  onCancel,
  onFallbackUploadClick,
  disabled = false
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

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

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
        width: { ideal: 720 },
        height: { ideal: 1280 }
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
        // Fallback to video-only if audio permission/device caused the failure
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
          // Even if audio permission was denied, still check if video-only is allowed
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
      stopMediaStream();
    };
  }, [facingMode, withAudio, startCamera, stopMediaStream]);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
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
  }, []);

  const handleStartRecording = () => {
    if (disabled || isRecording || isProcessing || !streamRef.current) return;
    setCameraError(null);
    stoppingRef.current = false;

    const stream = streamRef.current;
    const preferredMime = pickSupportedVideoMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = preferredMime
        ? new MediaRecorder(stream, {
            mimeType: preferredMime,
            videoBitsPerSecond: 900_000,
            audioBitsPerSecond: 64_000
          })
        : new MediaRecorder(stream, {
            videoBitsPerSecond: 900_000,
            audioBitsPerSecond: 64_000
          });
    } catch {
      try {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);
      } catch {
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
      setIsRecording(false);
      stoppingRef.current = false;
      setCameraError('Camera recording was interrupted. Please try again.');
    };

    recorder.onstop = async () => {
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
        const processed = await processFeedVideoFile(recordedFile, finalDuration);
        if (!isMountedRef.current) {
          URL.revokeObjectURL(processed.previewObjectUrl);
          return;
        }
        stopMediaStream();
        onVideoReady(processed);
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
    recorder.start(350);

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
    try {
      const processed = await processFeedVideoFile(file);
      if (!isMountedRef.current) {
        URL.revokeObjectURL(processed.previewObjectUrl);
        return;
      }
      stopMediaStream();
      onVideoReady(processed);
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
              REC {formatVideoDuration(Math.floor(elapsedSeconds))} / 1:00
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-white text-xs font-semibold z-20">
            <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>Preparing recorded short video...</span>
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

      {/* Bottom Recording Action Bar */}
      <div className="px-3.5 py-3 bg-slate-900 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10">
        <div className="text-[11px] text-slate-300">
          {isRecording
            ? `${remainingSec}s left · auto-stops at 1:00`
            : 'Record up to 60s · keeps size friendly for 3G/4G'}
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
              disabled={!cameraReady || isProcessing || isInitializing || disabled}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-extrabold shadow-md transition-colors cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>Start Recording</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
