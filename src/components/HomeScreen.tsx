import React from 'react';
import { BookOpen, Globe, Settings, Smartphone, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import { soundFX } from '../utils/sound';
import { BrandEmblem, BrandWordmark } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

export const HomeScreen: React.FC = () => {
  const { language, setLanguage, t, soundEnabled, setScreen } = useApp();

  return (
    <div className="flex-1 flex flex-col justify-center gap-7 py-2 sm:py-4">
      {/* Hero Brand Showcase with Hand-Drawn Playing Card & Mirrored Calligraphy */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center text-center gap-3 max-w-2xl mx-auto"
      >
        <div className="relative flex flex-col items-center gap-2">
          <BrandEmblem className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl border border-[#DDD2C0] shadow-[0_14px_34px_-12px_rgba(35,26,21,0.16)]" />
          <BrandWordmark className="w-60 sm:w-72 h-auto mt-1" />
        </div>

        <h1 className="sr-only">{t.appTitle}</h1>

        <p className="text-base sm:text-lg text-[#5E4F43] font-medium max-w-xl leading-relaxed">
          {t.appSubtitle}
        </p>

        {/* Unboxed metadata with typographic separators */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-[#7A6A5B]">
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
          className="group relative text-start rounded-3xl p-6 sm:p-8 bg-[#231A15] text-[#FBF7F0] border border-[#231A15] hover:bg-[#2E221B] shadow-[0_16px_36px_-14px_rgba(35,26,21,0.35)] transition duration-200 flex flex-col justify-between gap-6 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#3A2C24] border border-[#564336] flex items-center justify-center text-[#F3EBDD] shrink-0">
              <Users className="w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-[#D5C7B2] tabular-nums">
              {language === 'ar' ? '3 تخطيات لكل لاعب' : '3 Skips / Player'}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFDF9]">
              {t.playOnline}
            </h2>
            <p className="text-sm sm:text-base text-[#DDD2C0] leading-relaxed">
              {t.playOnlineDesc}
            </p>
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-white/15 text-sm font-bold text-[#EDE3D2]">
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
          className="group relative text-start rounded-3xl p-6 sm:p-8 bg-[#FFFDF9] border border-[#D5C7B2] hover:border-[#8B5E3C] shadow-[0_12px_30px_-14px_rgba(35,26,21,0.12)] transition duration-200 flex flex-col justify-between gap-6 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] flex items-center justify-center text-[#8B5E3C] shrink-0">
              <Smartphone className="w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-[#7A6A5B]">
              {language === 'ar' ? 'بدون إنترنت · بدون تخطي' : 'Offline · No Skips'}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#231A15] group-hover:text-[#6F492E] transition-colors">
              {t.playSinglePhone}
            </h2>
            <p className="text-sm sm:text-base text-[#6E5E50] leading-relaxed">
              {t.playSinglePhoneDesc}
            </p>
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-[#E5DAC8] text-sm font-bold text-[#8B5E3C]">
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
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-sm font-bold text-[#231A15] flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BookOpen className="w-4 h-4 text-[#8B5E3C] shrink-0" />
          <span>{t.howToPlay}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundFX.tap(soundEnabled);
            setScreen('settings');
          }}
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-sm font-bold text-[#231A15] flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Settings className="w-4 h-4 text-[#8B5E3C] shrink-0" />
          <span>{t.settings}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundFX.tap(soundEnabled);
            setLanguage(language === 'ar' ? 'en' : 'ar');
          }}
          className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-sm font-bold text-[#231A15] flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-[#8B5E3C] shrink-0" />
          <span>{language === 'ar' ? t.english : t.arabic}</span>
        </button>
      </section>
    </div>
  );
};
