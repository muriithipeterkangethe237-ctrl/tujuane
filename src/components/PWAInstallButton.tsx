import React, { useState } from 'react';
import { Download, Smartphone, X, Check, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppLogoIcon } from './AppLogoIcon';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already running in standalone mode on phone home screen, suppress button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // General instructions modal if browser doesn't expose beforeinstallprompt yet
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-700/10 hover:bg-emerald-700/20 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
          title="Install TUJUANE on your phone home screen with the official app icon"
        >
          <div className="w-4 h-4 shrink-0">
            <AppLogoIcon />
          </div>
          <span className="hidden sm:inline">Install App</span>
          <Download className="w-3.5 h-3.5 text-emerald-600 sm:hidden" />
        </button>
      )}

      {variant === 'compact' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center justify-between w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 shrink-0">
              <AppLogoIcon />
            </div>
            <span>Add TUJUANE to Home Screen</span>
          </div>
          <Download className="w-3.5 h-3.5 text-emerald-700" />
        </button>
      )}

      {/* Guided Install Modal for iOS & Mobile Browsers */}
      {showIOSGuide && (
        <div
          onClick={() => setShowIOSGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md shrink-0">
                  <AppLogoIcon />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Install TUJUANE App</h3>
                  <p className="text-xs text-slate-500">Official Kenyan Citizen Hub</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>New Official Maasai Shield Icon</span>
              </p>
              <p className="text-[11px] text-emerald-800">
                Installs directly to your phone's home screen. Fast, full-screen, and offline ready across all 47 counties.
              </p>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-xs text-slate-700 pt-1">
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="p-1.5 bg-white rounded-lg shadow-2xs text-blue-600 shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <span>1. Tap the <strong>Share</strong> button in Safari toolbar</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="p-1.5 bg-white rounded-lg shadow-2xs text-slate-700 shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <span>2. Scroll down & tap <strong>Add to Home Screen</strong></span>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-700 pt-1">
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="p-1.5 bg-white rounded-lg shadow-2xs text-emerald-700 shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <span>Tap <strong>Install</strong> or use browser menu &gt; <strong>Install App</strong></span>
                </div>
              </div>
            )}

            {isInstallable && (
              <button
                type="button"
                disabled={isInstalling}
                onClick={async () => {
                  await install();
                  setShowIOSGuide(false);
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isInstalling ? 'Installing...' : 'Install Now'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
