import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Video,
  Upload,
  Sparkles,
  MapPin,
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertCircle,
  Clock,
  RotateCcw
} from 'lucide-react';
import { UserProfile } from '../../types/chat';
import { StoryMediaType } from '../../types/story';
import { publishCitizenStory } from '../../services/storyService';
import { ALL_47_COUNTIES } from '../../data/kenyaCounties';

interface CreateStoryModalProps {
  isOpen: boolean;
  currentUser: any;
  userProfile: UserProfile | null;
  onClose: () => void;
  onStoryPublished: (storyId: string) => void;
}

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  isOpen,
  currentUser,
  userProfile,
  onClose,
  onStoryPublished
}) => {
  const [mediaType, setMediaType] = useState<StoryMediaType>('image');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [county, setCounty] = useState<string>(userProfile?.county || 'Nairobi');
  const [duration, setDuration] = useState<number>(6);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Video playback preview state
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (userProfile?.county) {
      setCounty(userProfile.county);
    }
  }, [userProfile]);

  if (!isOpen) return null;

  // Compress Image to High-Quality Data URL (max 1080px, ~150-250KB)
  const processImageFile = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1080;
        const MAX_HEIGHT = 1920;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setErrorMessage('Failed to initialize canvas for image processing.');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress to WebP or JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setMediaType('image');
        setMediaUrl(compressedDataUrl);
        setDuration(6);
      };
      img.onerror = () => {
        setErrorMessage('Failed to load selected image.');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Process Video File (Max ~1.2MB for base64 story clip, up to 30s)
  const processVideoFile = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith('video/')) {
      setErrorMessage('Please select a valid video file (MP4, WebM, MOV).');
      return;
    }

    // Limit video file size to ~1.2MB for responsive Firestore storage
    const MAX_VIDEO_BYTES = 1.3 * 1024 * 1024;
    if (file.size > MAX_VIDEO_BYTES) {
      setErrorMessage(
        `Video file size (${(file.size / (1024 * 1024)).toFixed(1)}MB) is too large. Please select a short clip under 1.2MB (5 to 15 seconds recommended).`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      // Create a temporary video element to check duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
        const vidDuration = Math.round(tempVideo.duration) || 10;
        if (vidDuration > 30) {
          setErrorMessage('Video duration exceeds 30 seconds. Please select a clip of 30 seconds or less.');
          return;
        }
        setMediaType('video');
        setMediaUrl(dataUrl);
        setDuration(Math.min(30, vidDuration));
        setIsVideoPlaying(true);
      };
      tempVideo.onerror = () => {
        setErrorMessage('Failed to decode video format. Please use standard MP4 or WebM.');
      };
      tempVideo.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      processVideoFile(file);
    } else if (file.type.startsWith('image/')) {
      processImageFile(file);
    } else {
      setErrorMessage('Unsupported file type. Please select a photo or video.');
    }
  };

  const handlePublish = async () => {
    if (!mediaUrl) {
      setErrorMessage('Please select a photo or video for your story.');
      return;
    }
    if (!currentUser || !userProfile) {
      setErrorMessage('You must be signed in as a citizen to post stories.');
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);

    try {
      const storyId = await publishCitizenStory(userProfile, {
        type: mediaType,
        mediaUrl,
        caption: caption.trim() || undefined,
        duration,
        authorCounty: county
      });

      onStoryPublished(storyId);
      onClose();
    } catch (err: any) {
      console.error('Error posting story:', err);
      setErrorMessage(err.message || 'Could not post story. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleResetMedia = () => {
    setMediaUrl('');
    setCaption('');
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>Add Citizen Story</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  24h Live
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Share a moment, photo, or short video with all 47 counties
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Scrollable Area */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Media Picker / Upload Box */}
          {!mediaUrl ? (
            <div className="space-y-3">
              {/* Tabs: Photo or Video */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setMediaType('image');
                    fileInputRef.current?.click();
                  }}
                  className={`py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    mediaType === 'image'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Photo Story</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaType('video');
                    fileInputRef.current?.click();
                  }}
                  className={`py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    mediaType === 'video'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Video className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Video Story</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 group"
              >
                <div className="w-14 h-14 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto shadow-xs group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-3.5 space-y-1">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Upload Photo or Video
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                    Choose an image (JPEG, PNG, WebP) or short video clip (MP4, WebM up to 30s)
                  </p>
                </div>
              </div>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            /* Media Preview and Editing Controls */
            <div className="space-y-4">
              <div className="relative rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[9/14] sm:aspect-[9/13] max-h-[380px] w-full flex items-center justify-center shadow-lg group">
                {mediaType === 'image' ? (
                  <img
                    src={mediaUrl}
                    alt="Story preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <video
                      ref={videoRef}
                      src={mediaUrl}
                      autoPlay
                      loop
                      playsInline
                      muted={isVideoMuted}
                      className="w-full h-full object-contain"
                    />
                    {/* Video Player Controls */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            if (isVideoPlaying) {
                              videoRef.current.pause();
                            } else {
                              videoRef.current.play();
                            }
                            setIsVideoPlaying(!isVideoPlaying);
                          }
                        }}
                        className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors cursor-pointer"
                        title={isVideoPlaying ? 'Pause video' : 'Play video'}
                      >
                        {isVideoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.muted = !isVideoMuted;
                            setIsVideoMuted(!isVideoMuted);
                          }
                        }}
                        className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors cursor-pointer"
                        title={isVideoMuted ? 'Unmute video' : 'Mute video'}
                      >
                        {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Change Media Button */}
                <button
                  type="button"
                  onClick={handleResetMedia}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white font-bold text-xs backdrop-blur-md flex items-center gap-1.5 transition-colors cursor-pointer border border-white/20"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Change</span>
                </button>

                {/* Type Badge & Duration */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white font-semibold text-[11px] backdrop-blur-md flex items-center gap-1.5 border border-white/10">
                  {mediaType === 'image' ? <Camera className="w-3 h-3 text-emerald-400" /> : <Video className="w-3 h-3 text-rose-400" />}
                  <span>{mediaType === 'image' ? 'Photo (6s)' : `Video (${duration}s)`}</span>
                </div>

                {/* Live Caption Overlay on Preview */}
                {caption && (
                  <div className="absolute bottom-4 inset-x-4 p-3 bg-black/70 backdrop-blur-md rounded-2xl text-white text-xs sm:text-sm text-center font-medium shadow-md">
                    {caption}
                  </div>
                )}
              </div>

              {/* Caption Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Story Caption <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a witty thought, hustle shoutout, or location note..."
                  maxLength={500}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>

              {/* Location Tag */}
              <div className="flex items-center gap-2 pt-1">
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <select
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
                >
                  {ALL_47_COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c} County
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Disappears automatically 24 hours after posting.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!mediaUrl || isPublishing}
            onClick={handlePublish}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md hover:shadow-emerald-600/25 flex items-center gap-2 cursor-pointer"
          >
            {isPublishing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Publishing Story...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Share Story (24h)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
