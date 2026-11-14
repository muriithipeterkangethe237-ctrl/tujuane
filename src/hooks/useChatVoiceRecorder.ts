import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceNoteData } from '../types/chat';
import { formatFileSize } from '../utils/imageCompressor';

export const MAX_CHAT_VOICE_SECONDS = 60;
const MAX_CHAT_VOICE_RAW_BYTES = 500 * 1024; // ~667 KB Base64, safely inside 700 KB rule & 1 MB Firestore doc cap
const LIVE_BAR_COUNT = 24;

export interface RecordedChatVoiceNote extends VoiceNoteData {
  previewObjectUrl: string;
}

function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function downsampleWaveform(samples: number[], targetLength: number): number[] {
  if (samples.length === 0) {
    return Array(targetLength).fill(36);
  }
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor((i / targetLength) * samples.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / targetLength) * samples.length));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      sum += samples[j];
      count++;
    }
    const avg = count > 0 ? sum / count : 32;
    result.push(Math.max(16, Math.min(100, Math.round(avg))));
  }
  return result;
}

export function useChatVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>(() => Array(LIVE_BAR_COUNT).fill(18));
  const [recordedVoiceNote, setRecordedVoiceNote] = useState<RecordedChatVoiceNote | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const discardedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const waveformSamplesRef = useRef<number[]>([]);
  const pendingAutoSendCallbackRef = useRef<((note: VoiceNoteData) => void) | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const cleanupRecordingResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore
      }
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    setLiveLevels(Array(LIVE_BAR_COUNT).fill(18));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
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
      cleanupRecordingResources();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [cleanupRecordingResources]);

  const startVisualizerLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let lastSampleAt = 0;

    const tick = () => {
      if (!analyserRef.current || !isMountedRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);

      const nextBars: number[] = [];
      let totalEnergy = 0;
      for (let i = 0; i < LIVE_BAR_COUNT; i++) {
        const idx = Math.min(bufferLength - 1, Math.floor((i / LIVE_BAR_COUNT) * bufferLength));
        const val = dataArray[idx] || 0;
        totalEnergy += val;
        const pct = Math.max(14, Math.min(100, Math.round((val / 255) * 100)));
        nextBars.push(pct);
      }
      setLiveLevels(nextBars);

      const now = performance.now();
      if (now - lastSampleAt >= 120) {
        lastSampleAt = now;
        const avgEnergy = totalEnergy / LIVE_BAR_COUNT;
        const normalized = Math.max(18, Math.min(100, Math.round((avgEnergy / 180) * 100)));
        waveformSamplesRef.current.push(normalized);
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopRecorderInternal = useCallback(() => {
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
        cleanupRecordingResources();
        setIsRecording(false);
        stoppingRef.current = false;
      }
    } else {
      cleanupRecordingResources();
      setIsRecording(false);
      stoppingRef.current = false;
    }
  }, [cleanupRecordingResources]);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;
    if (!isSupported) {
      setVoiceError('Voice notes are not supported in this browser. Try Chrome, Edge, Firefox, or Safari.');
      return;
    }

    setVoiceError(null);
    stoppingRef.current = false;
    discardedRef.current = false;
    pendingAutoSendCallbackRef.current = null;
    waveformSamplesRef.current = [];

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setRecordedVoiceNote(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          source.connect(analyser);
          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          startVisualizerLoop();
        }
      } catch {
        // Optional frequency analyzer
      }

      const preferredMime = pickSupportedAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      } catch {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);
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
        setVoiceError('Microphone recording was interrupted. Please try again.');
        cleanupRecordingResources();
        setIsRecording(false);
        stoppingRef.current = false;
        pendingAutoSendCallbackRef.current = null;
      };

      recorder.onstop = () => {
        const finalDuration = Math.min(
          MAX_CHAT_VOICE_SECONDS,
          Math.max(0, Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)))
        );
        const actualMime = recorder.mimeType || preferredMime || 'audio/webm';
        const recordedChunks = chunksRef.current;
        const wasDiscarded = discardedRef.current;
        const sendCallback = pendingAutoSendCallbackRef.current;
        const capturedWaveform = downsampleWaveform(waveformSamplesRef.current, LIVE_BAR_COUNT);

        chunksRef.current = [];
        pendingAutoSendCallbackRef.current = null;
        cleanupRecordingResources();

        if (!isMountedRef.current) return;
        setIsRecording(false);
        stoppingRef.current = false;
        setElapsedSeconds(0);

        if (wasDiscarded) {
          discardedRef.current = false;
          return;
        }

        if (recordedChunks.length === 0 || finalDuration < 0.6) {
          setVoiceError('Voice note was too short. Speak for at least 1 second.');
          return;
        }

        const blob = new Blob(recordedChunks, { type: actualMime });
        if (blob.size > MAX_CHAT_VOICE_RAW_BYTES) {
          setVoiceError(
            `Voice note (${formatFileSize(blob.size)}) exceeds the 500 KB limit. Try a slightly shorter clip.`
          );
          return;
        }

        setIsProcessing(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result || !result.startsWith('data:')) {
            setVoiceError('Could not encode voice note. Please try again.');
            return;
          }
          if (result.length > 700000) {
            setVoiceError('Encoded voice note is too large for chat storage. Please record a slightly shorter clip.');
            return;
          }

          const notePayload: VoiceNoteData = {
            dataUrl: result,
            duration: Math.max(1, Math.round(finalDuration)),
            sizeBytes: blob.size,
            mimeType: actualMime,
            waveform: capturedWaveform
          };

          if (sendCallback) {
            sendCallback(notePayload);
          } else {
            const objectUrl = URL.createObjectURL(blob);
            previewUrlRef.current = objectUrl;
            setRecordedVoiceNote({
              ...notePayload,
              previewObjectUrl: objectUrl
            });
          }
        };
        reader.onerror = () => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          setVoiceError('Failed to process voice note. Please try again.');
        };
        reader.readAsDataURL(blob);
      };

      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startTimeRef.current) / 1000;
        if (secs >= MAX_CHAT_VOICE_SECONDS) {
          setElapsedSeconds(MAX_CHAT_VOICE_SECONDS);
          stopRecorderInternal();
        } else {
          setElapsedSeconds(secs);
        }
      }, 100);
    } catch (err: any) {
      cleanupRecordingResources();
      setIsRecording(false);
      stoppingRef.current = false;
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setVoiceError('Microphone access denied. Allow microphone permissions in your browser settings.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setVoiceError('No microphone detected on this device.');
      } else {
        setVoiceError('Could not access microphone. Check browser permissions and try again.');
      }
    }
  }, [isRecording, isProcessing, isSupported, cleanupRecordingResources, startVisualizerLoop, stopRecorderInternal]);

  const stopAndPreview = useCallback(() => {
    pendingAutoSendCallbackRef.current = null;
    stopRecorderInternal();
  }, [stopRecorderInternal]);

  const stopAndSend = useCallback(
    (onReady: (note: VoiceNoteData) => void) => {
      pendingAutoSendCallbackRef.current = onReady;
      stopRecorderInternal();
    },
    [stopRecorderInternal]
  );

  const discardVoiceNote = useCallback(() => {
    if (isRecording) {
      discardedRef.current = true;
      pendingAutoSendCallbackRef.current = null;
      stopRecorderInternal();
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setRecordedVoiceNote(null);
    setElapsedSeconds(0);
    setVoiceError(null);
  }, [isRecording, stopRecorderInternal]);

  const clearRecordedVoiceNote = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setRecordedVoiceNote(null);
  }, []);

  return {
    isSupported,
    isRecording,
    isProcessing,
    elapsedSeconds,
    liveLevels,
    recordedVoiceNote,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    startRecording,
    stopAndPreview,
    stopAndSend,
    discardVoiceNote,
    clearRecordedVoiceNote
  };
}
