import React from 'react';
import { BookOpen, Smartphone, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';

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
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{t.howToPlayTitle}</h1>
        <p className="text-sm text-slate-400">{t.appSubtitle}</p>
      </div>

      <div className="space-y-4">
        <article className="rounded-3xl bg-[#0C1226]/95 border border-blue-400/25 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">{t.ruleOnlineTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{t.ruleOnlineBody}</p>
        </article>

        <article className="rounded-3xl bg-[#0C1226]/95 border border-violet-400/25 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-600/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">{t.ruleSingleTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{t.ruleSingleBody}</p>
        </article>

        <article className="rounded-3xl bg-[#0C1226]/95 border border-white/12 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-center text-sky-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">{t.ruleQuestionsTitle}</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{t.ruleQuestionsBody}</p>
        </article>
      </div>

      <button
        type="button"
        onClick={() => {
          void soundEnabled;
          setScreen('home');
        }}
        className="min-h-[48px] px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold self-start cursor-pointer"
      >
        {t.returnHome}
      </button>
    </motion.div>
  );
};
