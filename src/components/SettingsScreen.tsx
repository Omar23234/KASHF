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
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{t.settingsTitle}</h1>
      </div>

      <div className="rounded-3xl bg-[#0C1226]/95 border border-white/10 divide-y divide-white/8">
        {/* Language Setting */}
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">{t.defaultLanguage}</h2>
              <p className="text-xs text-slate-400">RTL / LTR</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#070B18] border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                setLanguage('ar');
              }}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition cursor-pointer ${
                language === 'ar' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
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
              className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition cursor-pointer ${
                language === 'en' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.english}
            </button>
          </div>
        </div>

        {/* Sound Effects Setting */}
        <div className="p-5 sm:p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-violet-600/20 border border-violet-400/30 flex items-center justify-center text-violet-300 shrink-0">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-white">{t.soundEffectsLabel}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{t.soundEffectsSub}</p>
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
                ? 'bg-blue-600/25 border-blue-400/40 text-blue-200'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
          >
            {soundEnabled ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
          </button>
        </div>

        {/* Offline & PWA Status */}
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">{t.offlineReadyLabel}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{t.offlineReadySub}</p>
            </div>
          </div>

          <PWAInstallButton />
        </div>
      </div>
    </motion.div>
  );
};
