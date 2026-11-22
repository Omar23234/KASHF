import React from 'react';
import { BookOpen, Smartphone, Sparkles, Trophy, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { soundFX } from '../utils/sound';

export const HowToPlayScreen: React.FC = () => {
  const { t, setScreen, soundEnabled } = useApp();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col gap-6 max-w-3xl mx-auto w-full py-2"
    >
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#231A15]">{t.howToPlayTitle}</h1>
        <p className="text-sm text-[#6E5E50]">{t.appSubtitle}</p>
      </div>

      <div className="space-y-4">
        <article className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#231A15] flex items-center justify-center text-[#FBF7F0] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#231A15]">{t.ruleOnlineTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">{t.ruleOnlineBody}</p>
        </article>

        <article className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] flex items-center justify-center text-[#8B5E3C] shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#231A15]">{t.ruleSingleTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">{t.ruleSingleBody}</p>
        </article>

        <article className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF3EC] border border-[#C5D4BF] flex items-center justify-center text-[#4A6B46] shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#231A15]">{t.ruleScoringTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">{t.ruleScoringBody}</p>
        </article>

        <article className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FBF5E4] border border-[#D7BD7B] flex items-center justify-center text-[#8C6820] shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#231A15]">{t.ruleCardsTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">{t.ruleCardsBody}</p>
        </article>

        <article className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] flex items-center justify-center text-[#6F492E] shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#231A15]">{t.ruleQuestionsTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">{t.ruleQuestionsBody}</p>
        </article>
      </div>

      <button
        type="button"
        onClick={() => {
          soundFX.tap(soundEnabled);
          setScreen('home');
        }}
        className="min-h-[48px] px-6 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold self-start cursor-pointer transition"
      >
        {t.returnHome}
      </button>
    </motion.div>
  );
};
