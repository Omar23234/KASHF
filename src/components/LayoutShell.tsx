import React from 'react';
import { ArrowLeft, ArrowRight, Globe, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand';
import { useApp } from '../context/AppContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { soundFX } from '../utils/sound';
import { BrandEmblem } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface LayoutShellProps {
  children: React.ReactNode;
  onBack?: () => void;
  title?: string;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({ children, onBack, title }) => {
  const { language, setLanguage, soundEnabled, setSoundEnabled, isRTL, t, screen, setScreen } =
    useApp();
  const isOnline = useOnlineStatus();

  const brandName = language === 'ar' ? BRAND_CONFIG.nameAr : BRAND_CONFIG.nameEn;

  return (
    <div className="relative min-h-dvh flex flex-col bg-[#FBF7F0] text-[#231A15] overflow-x-hidden paper-grain">
      {/* Subtle Hand-Drawn Warm Paper Doodle Layer */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          fill="none"
          className="hidden sm:block absolute top-20 start-8 w-24 h-24 text-[#8B5E3C] opacity-[0.09] animate-ambient-1"
        >
          <rect
            x="22"
            y="18"
            width="64"
            height="84"
            rx="12"
            transform="rotate(-8 54 60)"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M48 49 C48 41 60 40 61 48 C62 54 54 57 54 62"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="54" cy="70" r="2.2" fill="currentColor" />
        </svg>

        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          fill="none"
          className="hidden sm:block absolute bottom-24 end-10 w-28 h-28 text-[#231A15] opacity-[0.06] animate-ambient-2"
        >
          <rect
            x="26"
            y="18"
            width="64"
            height="84"
            rx="12"
            transform="rotate(9 58 60)"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M60 40 C61 48 64 51 72 52 C64 53 61 56 60 64 C59 56 56 53 48 52 C56 51 59 48 60 40 Z"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 h-14 border-b border-[#DDD2C0] bg-[#F6EFE3]/92 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={() => {
                  soundFX.tap(soundEnabled);
                  onBack();
                }}
                className="min-h-[44px] min-w-[44px] -ms-2 flex items-center justify-center rounded-xl text-[#6E5E50] hover:text-[#231A15] hover:bg-[#EAE0CE] transition cursor-pointer shrink-0"
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
              <BrandEmblem className="w-9 h-9 rounded-xl border border-[#D5C7B2] shadow-xs shrink-0" />
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-[#231A15] truncate">
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
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E5E50] hover:text-[#231A15] hover:bg-[#EAE0CE] transition cursor-pointer"
              aria-label={t.soundEffects}
              title={t.soundEffects}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#8B5E3C]" />
              ) : (
                <VolumeX className="w-4 h-4 text-[#9C8D7E]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setLanguage(language === 'ar' ? 'en' : 'ar');
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-xs font-bold text-[#231A15] flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t.language}
            >
              <Globe className="w-3.5 h-3.5 text-[#8B5E3C] shrink-0" />
              <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Non-intrusive Offline Banner */}
      {!isOnline && (
        <div className="relative z-20 bg-[#EFE4CC] border-b border-[#D6C39E] px-4 py-2 text-center text-xs font-bold text-[#6B4E1B] flex items-center justify-center gap-2">
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
