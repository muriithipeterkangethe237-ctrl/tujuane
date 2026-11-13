import React from 'react';
import { Users, ShieldCheck, Heart, MessageSquare, Flame, Compass } from 'lucide-react';
import { AppLogoIcon } from './AppLogoIcon';

interface FooterProps {
  onSelectTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectTab }) => {
  return (
    <footer className="relative z-10 border-t tujuane-divider mt-16 pb-20 md:pb-8 transition-colors tujuane-surface-elevated">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand info */}
          <div className="md:col-span-2 space-y-3">
            <button
              onClick={() => onSelectTab('landing')}
              className="flex items-center gap-2.5 group text-left cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-950 p-0.5 border border-emerald-500/40 flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm overflow-hidden shrink-0">
                <AppLogoIcon className="w-full h-full" />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                TUJUANE
              </span>
            </button>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm">
              An open citizen social network connecting Kenyans across all 47 counties to share
              neighborhood stories, discuss local issues, collaborate on hustles, and chat one-on-one.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Civic community platform · Built with care for Kenyan digital inclusion</span>
            </div>
          </div>

          {/* Quick links */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Community Navigation
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={() => onSelectTab('landing')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  <span>Community Hub</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('community')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Discussions & Feed</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('chat')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>1-on-1 Direct Chat</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('members')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Members Directory (47 Counties)</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Emergency helplines summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Kenya Toll-Free Helplines
            </h4>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 font-mono">
              <div>Police / Emergency: <span className="font-bold text-slate-900 dark:text-slate-200">999 / 112</span></div>
              <div>Red Cross Ambulance: <span className="font-bold text-slate-900 dark:text-slate-200">1199</span></div>
              <div>Gender Violence (GBV): <span className="font-bold text-slate-900 dark:text-slate-200">1195</span></div>
              <div>Childline Kenya: <span className="font-bold text-slate-900 dark:text-slate-200">116</span></div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div>
            © {new Date().getFullYear()} TUJUANE. Citizen social & civic community network.
          </div>
          <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
            <span>Karibu TUJUANE · Jukwaa la Kujuana na Kusaidiana</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
