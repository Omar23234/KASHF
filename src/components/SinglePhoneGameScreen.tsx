import React from 'react';
import { ArrowRight, CheckCircle2, Home, RotateCcw, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { BRAND_CONFIG } from '../config/brand';
import { useApp } from '../context/AppContext';
import { getQuestionById, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import type { SinglePhoneGameState } from '../types/game';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';

interface SinglePhoneGameScreenProps {
  game: SinglePhoneGameState;
  onNextQuestion: () => void;
  onPlayAgain: () => void;
  onReturnHome: () => void;
}

/**
 * Single Phone Mode Gameplay.
 * STRICT RULE: NO Skip button, NO skip counter, NO skip functionality anywhere in this mode.
 */
export const SinglePhoneGameScreen: React.FC<SinglePhoneGameScreenProps> = ({
  game,
  onNextQuestion,
  onPlayAgain,
  onReturnHome,
}) => {
  const { language, t, soundEnabled } = useApp();

  if (game.phase === 'finished' || game.phase === 'exhausted') {
    const isExhausted = game.phase === 'exhausted';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex-1 flex items-center justify-center py-6"
      >
        <div className="w-full max-w-xl rounded-3xl bg-[#0C1226]/95 border border-blue-400/25 p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/30">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-balance">
              {isExhausted ? t.questionsExhaustedTitle : t.gameCompletedTitle}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isExhausted ? t.questionsExhaustedDesc : t.gameCompletedDesc}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-2xl bg-[#070B18] border border-white/10 p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-white">
                {game.totalTurnsCompleted}
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.totalTurnsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#070B18] border border-white/10 p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-blue-400">
                {game.completedQuestionsCount}
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.completedQuestionsStat}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                soundFX.cardDeal(soundEnabled);
                onPlayAgain();
              }}
              className="flex-1 min-h-[50px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold flex items-center justify-center gap-2 hover:brightness-110 transition cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
              <span>{t.playAgain}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.tap(soundEnabled);
                onReturnHome();
              }}
              className="min-h-[50px] px-6 rounded-2xl bg-white/8 hover:bg-white/15 border border-white/12 text-slate-100 font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>{t.returnHome}</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const currentPlayer = game.players[game.currentTurnIndex];
  const currentQuestion = getQuestionById(game.currentQuestionId);
  const totalConfiguredTurns =
    game.gameMode === 'all_questions'
      ? TOTAL_QUESTIONS_COUNT
      : game.players.length * game.roundsCount;
  const currentTurnDisplay = Math.min(totalConfiguredTurns, game.totalTurnsCompleted + 1);
  const progressPct =
    totalConfiguredTurns > 0
      ? Math.min(100, Math.round((game.totalTurnsCompleted / totalConfiguredTurns) * 100))
      : 0;
  const remainingQuestions = Math.max(0, TOTAL_QUESTIONS_COUNT - game.usedQuestionIds.length);

  return (
    <div className="flex-1 flex flex-col gap-5 pb-28">
      {/* Unboxed HUD Telemetry Strip */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-slate-300">
          <div className="flex items-center gap-2 tabular-nums">
            <span className="text-white font-bold">
              {game.gameMode === 'all_questions'
                ? t.allQuestionsOption
                : `${t.roundLabel} ${game.currentRound} ${t.ofLabel} ${game.roundsCount}`}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>
              {t.turnLabel} {currentTurnDisplay} {t.ofLabel} {totalConfiguredTurns}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>
              {game.players.length} {t.playersShort}
            </span>
          </div>

          <div className="text-xs text-slate-400 tabular-nums">
            {t.remainingPool}: <strong className="text-blue-300">{remainingQuestions}</strong> / {TOTAL_QUESTIONS_COUNT}
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>
      </section>

      {/* Current Player Banner */}
      <section className="rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-blue-600/25 to-violet-600/25 border border-blue-400/45 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {currentPlayer && (
            <PlayerAvatar
              name={currentPlayer.name}
              paletteId={currentPlayer.avatarColor}
              size="lg"
              active
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-300">{t.passPhonePrompt}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white truncate">
              {currentPlayer?.name}
            </h2>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-300 shrink-0">
          <Smartphone className="w-4 h-4 text-violet-300" />
          <span>{t.singlePhoneNextRule}</span>
        </div>
      </section>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        {currentQuestion && (
          <motion.section
            key={`sp-q-${game.totalTurnsCompleted}-${currentQuestion.id}`}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="relative flex-1 min-h-[260px] sm:min-h-[340px] rounded-3xl overflow-hidden border border-blue-400/30 bg-[#0D142B] p-6 sm:p-10 flex flex-col justify-between shadow-2xl"
          >
            <img
              src={BRAND_CONFIG.cardTextureImage}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-15"
            />
            <div className="relative z-10 flex items-center justify-between text-xs font-semibold text-blue-300">
              <span>{t.questionCardLabel}</span>
              <span className="font-mono-tabular text-slate-400">#{currentQuestion.id}</span>
            </div>

            <div className="relative z-10 my-auto py-6 text-center">
              <p
                dir="rtl"
                className="text-2xl sm:text-4xl font-extrabold text-white leading-relaxed sm:leading-relaxed text-balance"
              >
                {currentQuestion.text}
              </p>
            </div>

            <div className="relative z-10 min-h-[24px] text-center">
              {currentQuestion.isGroupPrompt ? (
                <p className="text-xs sm:text-sm text-violet-300 font-medium">
                  {t.groupPromptNote}
                </p>
              ) : (
                <p className="text-xs text-slate-400 sm:hidden">{t.singlePhoneNextRule}</p>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Single Primary Action Bar — Next Question ONLY (Strictly No Skip) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#060913]/92 backdrop-blur-md border-t border-white/10 p-3 pb-safe">
        <div className="max-w-5xl mx-auto">
          <button
            type="button"
            onClick={() => {
              soundFX.cardDeal(soundEnabled);
              onNextQuestion();
            }}
            className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-extrabold text-base sm:text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-700/30 hover:brightness-110 active:scale-[0.99] transition cursor-pointer"
          >
            <span>{t.nextQuestion}</span>
            <ArrowRight className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
