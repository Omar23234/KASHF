import React from 'react';
import { ArrowLeft, ArrowRight, Globe, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand';
import { useApp } from '../context/AppContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { soundFX } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';

interface LayoutShellProps {
  children: React.ReactNode;
  onBack?: () => void;
  title?: string;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({ children, onBack, title }) => {
  const { language, setLanguage, soundEnabled, setSoundEnabled, isRTL, t, screen, setScreen } = useApp();
  const isOnline = useOnlineStatus();

  const brandName = language === 'ar' ? BRAND_CONFIG.nameAr : BRAND_CONFIG.nameEn;

  return (
    <div className="relative min-h-dvh flex flex-col bg-[#060913] text-slate-100 overflow-x-hidden">
      {/* Atmospheric Layered Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img
          src={BRAND_CONFIG.backdropImage}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-25 mix-blend-screen"
        />
        <div className="absolute -top-32 -start-24 w-96 h-96 rounded-full bg-blue-600/20 blur-[120px] animate-ambient-1" />
        <div className="absolute -bottom-32 -end-24 w-[28rem] h-[28rem] rounded-full bg-violet-700/20 blur-[130px] animate-ambient-2" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060913]/70 via-[#060913]/85 to-[#060913]" />
      </div>

      {/* Compact Sticky Top Bar (<= 15% mobile height cap) */}
      <header className="sticky top-0 z-30 h-14 border-b border-white/8 bg-[#060913]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={() => {
                  soundFX.tap(soundEnabled);
                  onBack();
                }}
                className="min-h-[44px] min-w-[44px] -ms-2 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer shrink-0"
                aria-label={t.back}
              >
                {isRTL ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (screen !== 'home' && !onBack) {
                  setScreen('home');
                }
              }}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer"
            >
              <img
                src={BRAND_CONFIG.emblemImage}
                alt={brandName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover border border-white/15 shrink-0"
              />
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-white truncate">
                {title || brandName}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setSoundEnabled(!soundEnabled);
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer"
              aria-label={t.soundEffects}
              title={t.soundEffects}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setLanguage(language === 'ar' ? 'en' : 'ar');
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/6 hover:bg-white/12 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t.language}
            >
              <Globe className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Non-intrusive Offline Banner */}
      {!isOnline && (
        <div className="relative z-20 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs font-semibold text-amber-200 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>{t.offlineBanner}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 flex flex-col">
        {children}
      </main>
    </div>
  );
};
