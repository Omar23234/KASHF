import React from 'react';
import { CheckCircle2, Globe, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { soundFX } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';

export const SettingsScreen: React.FC = () => {
  const { language, setLanguage, soundEnabled, setSoundEnabled, t } = useApp();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col gap-6 max-w-2xl mx-auto w-full py-2"
    >
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#231A15]">{t.settingsTitle}</h1>
      </div>

      <div className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] divide-y divide-[#E8DEC8] shadow-[0_10px_28px_-14px_rgba(35,26,21,0.1)]">
        {/* Language Setting */}
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] flex items-center justify-center text-[#8B5E3C] shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-[#231A15]">{t.defaultLanguage}</h2>
              <p className="text-xs text-[#6E5E50]">RTL / LTR</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F3EBDD] border border-[#DDD2C0] shrink-0">
            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setLanguage('ar');
              }}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                language === 'ar'
                  ? 'bg-[#231A15] text-[#FBF7F0]'
                  : 'text-[#6E5E50] hover:text-[#231A15]'
              }`}
            >
              {t.arabic}
            </button>
            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setLanguage('en');
              }}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                language === 'en'
                  ? 'bg-[#231A15] text-[#FBF7F0]'
                  : 'text-[#6E5E50] hover:text-[#231A15]'
              }`}
            >
              {t.english}
            </button>
          </div>
        </div>

        {/* Sound Effects Setting */}
        <div className="p-5 sm:p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] flex items-center justify-center text-[#8B5E3C] shrink-0">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-[#231A15]">{t.soundEffectsLabel}</h2>
              <p className="text-xs text-[#6E5E50] leading-relaxed">{t.soundEffectsSub}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) soundFX.turnAlert(true);
            }}
            className={`min-h-[42px] px-5 rounded-xl text-xs font-bold border transition cursor-pointer shrink-0 ${
              soundEnabled
                ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#6E5E50]'
            }`}
          >
            {soundEnabled ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
          </button>
        </div>

        {/* Offline & PWA Status */}
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF3EC] border border-[#C5D4BF] flex items-center justify-center text-[#4A6B46] shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-[#231A15]">{t.offlineReadyLabel}</h2>
              <p className="text-xs text-[#6E5E50] leading-relaxed">{t.offlineReadySub}</p>
            </div>
          </div>

          <PWAInstallButton />
        </div>
      </div>
    </motion.div>
  );
};
