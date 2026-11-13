import React, { useEffect } from 'react';
import {
  X,
  MessageSquare,
  Camera,
  Video,
  Palette,
  Briefcase,
  Compass,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Flame
} from 'lucide-react';
import { PostCategory, PostBackgroundColor } from '../types/community';

export type PostCreationType =
  | 'discussion'
  | 'photo'
  | 'video'
  | 'solid_bg'
  | 'story'
  | 'hustle'
  | 'news'
  | 'question';

export interface PostTypeOption {
  type: PostCreationType;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  category?: PostCategory;
  solidBg?: PostBackgroundColor;
  requiresImage?: boolean;
  requiresVideo?: boolean;
}

interface PostTypeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: PostCreationType, option?: PostTypeOption) => void;
}

export const POST_TYPE_OPTIONS: PostTypeOption[] = [
  {
    type: 'discussion',
    title: 'Community Discussion',
    badge: 'Chit-Chat',
    badgeColor: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    description: 'Start a topic, share thoughts, or debate community issues with citizens across all 47 counties.',
    icon: <MessageSquare className="w-5 h-5" />,
    iconBg: 'bg-emerald-100 dark:bg-emerald-950/60',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    category: 'general'
  },
  {
    type: 'photo',
    title: 'Photo & Media Post',
    badge: 'Picture / Camera',
    badgeColor: 'bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800',
    description: 'Post community photos, neighborhood views, market scenes, or hustle snapshots with quick client-side compression.',
    icon: <Camera className="w-5 h-5" />,
    iconBg: 'bg-sky-100 dark:bg-sky-950/60',
    iconColor: 'text-sky-600 dark:text-sky-400',
    category: 'general',
    requiresImage: true
  },
  {
    type: 'video',
    title: 'Short Video (Feed)',
    badge: 'Up to 60s · 12 MB',
    badgeColor: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    description: 'Post short community video clips (MP4, WebM, MOV), event moments, road updates, or hustle demos directly on the main feed.',
    icon: <Video className="w-5 h-5" />,
    iconBg: 'bg-indigo-100 dark:bg-indigo-950/60',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    category: 'general',
    requiresVideo: true
  },
  {
    type: 'solid_bg',
    title: 'Solid Color Text Card',
    badge: 'Vibrant Colors',
    badgeColor: 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    description: 'Publish high-contrast text on Kenya Emerald, Maasai Red, Midnight Navy, and other bold backgrounds.',
    icon: <Palette className="w-5 h-5" />,
    iconBg: 'bg-rose-100 dark:bg-rose-950/60',
    iconColor: 'text-rose-600 dark:text-rose-400',
    category: 'general',
    solidBg: 'emerald'
  },
  {
    type: 'story',
    title: '24h Citizen Story',
    badge: 'Video & Photo (24h)',
    badgeColor: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    description: 'Disappearing 24-hour visual status with short video clips or photos featured in the citizen stories tray.',
    icon: <Video className="w-5 h-5" />,
    iconBg: 'bg-amber-100 dark:bg-amber-950/60',
    iconColor: 'text-amber-600 dark:text-amber-400'
  },
  {
    type: 'hustle',
    title: 'Jobs & Hustle (Biashara)',
    badge: 'Commerce & Gigs',
    badgeColor: 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    description: 'Showcase your business, artisan work, freelance services, agricultural produce, or job opportunities.',
    icon: <Briefcase className="w-5 h-5" />,
    iconBg: 'bg-purple-100 dark:bg-purple-950/60',
    iconColor: 'text-purple-600 dark:text-purple-400',
    category: 'hustle'
  },
  {
    type: 'news',
    title: 'Local News & County Alert',
    badge: '47 Counties',
    badgeColor: 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800',
    description: 'Share breaking local occurrences, traffic situations, civic updates, weather, and neighborhood advisories.',
    icon: <Compass className="w-5 h-5" />,
    iconBg: 'bg-red-100 dark:bg-red-950/60',
    iconColor: 'text-red-600 dark:text-red-400',
    category: 'local_news'
  },
  {
    type: 'question',
    title: 'Ask Kenya / Question',
    badge: 'Q&A Community',
    badgeColor: 'bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800',
    description: 'Pose a question to citizens across Kenya for practical advice, recommendations, directions, or tips.',
    icon: <HelpCircle className="w-5 h-5" />,
    iconBg: 'bg-teal-100 dark:bg-teal-950/60',
    iconColor: 'text-teal-600 dark:text-teal-400',
    category: 'question'
  }
];

export const PostTypeSelectorModal: React.FC<PostTypeSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectType
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-type-selector-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 my-6 text-slate-900 dark:text-slate-100 transition-colors animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold shadow-xs">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3
                id="post-type-selector-title"
                className="font-black text-slate-900 dark:text-white text-base sm:text-lg tracking-tight"
              >
                Create New Post
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose the type of content you want to share
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[68vh] overflow-y-auto pr-1 scrollbar-thin">
          {POST_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelectType(opt.type, opt)}
              className="group text-left p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/60 dark:bg-slate-850 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-2xs hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${opt.iconBg} ${opt.iconColor} group-hover:scale-110 transition-transform`}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                      {opt.title}
                    </h4>
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded-md text-[10px] font-bold border mt-0.5 ${opt.badgeColor}`}
                    >
                      {opt.badge}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {opt.description}
              </p>
            </button>
          ))}
        </div>

        {/* Footer tip */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span>Real-time Kenya civic safety rules apply</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">All 47 Counties</span>
        </div>
      </div>
    </div>
  );
};
