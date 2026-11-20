import React, { useState } from 'react';
import { BookOpen, Globe, Settings, Smartphone, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { BRAND_CONFIG } from '../config/brand';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import { soundFX } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';

export const HomeScreen: React.FC = () => {
  const { language, setLanguage, t, soundEnabled, setScreen } = useApp();
  const [imgError, setImgError] = useState(false);

  const brandTitle = language === 'ar' ? BRAND_CONFIG.nameAr : BRAND_CONFIG.nameEn;

  return (
    <div className="flex-1 flex flex-col justify-center gap-8 py-2 sm:py-6">
      {/* Hero Brand Showcase */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center text-center gap-4 max-w-2xl mx-auto"
      >
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border border-white/15 shadow-2xl shadow-blue-950/60 bg-[#0B1021] flex items-center justify-center">
          {!imgError ? (
            <img
              src={BRAND_CONFIG.emblemImage}
              alt={brandTitle}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-violet-700 flex items-center justify-center text-3xl font-extrabold text-white">
              {brandTitle.charAt(0)}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white text-balance">
            {brandTitle}
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
            {t.appSubtitle}
          </p>
        </div>

        {/* Unboxed metadata with typographic separators */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm font-medium text-slate-400">
          <span className="tabular-nums">
            {TOTAL_QUESTIONS_COUNT} {language === 'ar' ? 'سؤالاً رسمياً' : 'Official Questions'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{language === 'ar' ? 'من 2 إلى 12 لاعب' : '2–12 Players'}</span>
          <span aria-hidden="true">·</span>
          <span>{language === 'ar' ? 'مزامنة لحظية أو بدون نت' : 'Real-Time or Offline'}</span>
        </div>
      </motion.section>

      {/* Primary Mode Selection Cards (2-Column Responsive Grid) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          onClick={() => {
            soundFX.tap(soundEnabled);
            setScreen('online_entry');
          }}
          className="group relative text-start rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-blue-600/25 via-[#111936] to-violet-700/25 border border-blue-400/30 hover:border-blue-400/60 shadow-xl shadow-blue-950/30 transition duration-200 flex flex-col justify-between gap-6 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30 shrink-0">
              <Users className="w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-blue-300 tabular-nums">
              {language === 'ar' ? '3 تخطيات لكل لاعب' : '3 Skips / Player'}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white group-hover:text-blue-200 transition-colors">
              {t.playOnline}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {t.playOnlineDesc}
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-white/10 text-sm font-bold text-blue-300">
            <span>{language === 'ar' ? 'إنشاء أو دخول غرفة' : 'Create or Join Room'}</span>
            <span className="text-lg transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
              {language === 'ar' ? '←' : '→'}
            </span>
          </div>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          onClick={() => {
            soundFX.tap(soundEnabled);
            setScreen('single_setup');
          }}
          className="group relative text-start rounded-3xl p-6 sm:p-8 bg-[#0C1226]/95 border border-white/12 hover:border-violet-400/50 shadow-xl transition duration-200 flex flex-col justify-between gap-6 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#162042] border border-white/10 flex items-center justify-center text-violet-300 shrink-0">
              <Smartphone className="w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {language === 'ar' ? 'بدون إنترنت · بدون تخطي' : 'Offline · No Skips'}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white group-hover:text-violet-200 transition-colors">
              {t.playSinglePhone}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {t.playSinglePhoneDesc}
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-white/10 text-sm font-bold text-violet-300">
            <span>{language === 'ar' ? 'إعداد اللاعبين والبدء' : 'Set Up Players & Play'}</span>
            <span className="text-lg transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
              {language === 'ar' ? '←' : '→'}
            </span>
          </div>
        </motion.button>
      </section>

      {/* Prominent Phone App Install Banner */}
      <PWAInstallButton variant="banner" />

      {/* Secondary Actions Row */}
      <section className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            soundFX.tap(soundEnabled);
            setScreen('how_to_play');
          }}
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{t.howToPlay}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundFX.tap(soundEnabled);
            setScreen('settings');
          }}
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Settings className="w-4 h-4 text-violet-400 shrink-0" />
          <span>{t.settings}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundFX.tap(soundEnabled);
            setLanguage(language === 'ar' ? 'en' : 'ar');
          }}
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{language === 'ar' ? t.english : t.arabic}</span>
        </button>
      </section>
    </div>
  );
};
