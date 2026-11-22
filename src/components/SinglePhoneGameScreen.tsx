import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Home, RotateCcw, Shield, Smartphone, Trophy, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { getQuestionById, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import type { SinglePhoneGameState } from '../types/game';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';
import {
  CardEventBanner,
  CardInventoryBar,
  CardRewardOverlay,
  TurnModeNotice,
} from './SpecialCardModals';

interface SinglePhoneGameScreenProps {
  game: SinglePhoneGameState;
  onNextQuestion: () => void;
  onUseGoldCard: () => void;
  onUseSwitchCard: (targetPlayerId: string) => void;
  onUseAntiSwitchCard: () => void;
  onPlayAgain: () => void;
  onReturnHome: () => void;
}

/**
 * Single Phone Mode Gameplay.
 * STRICT RULE: NO normal Skip button, NO normal skip counter, NO normal skip functionality in this mode.
 * Includes +1 scoring on answering and the shared 5-card Special Cards system.
 */
export const SinglePhoneGameScreen: React.FC<SinglePhoneGameScreenProps> = ({
  game,
  onNextQuestion,
  onUseGoldCard,
  onUseSwitchCard,
  onUseAntiSwitchCard,
  onPlayAgain,
  onReturnHome,
}) => {
  const { language, t, soundEnabled } = useApp();
  const [dismissedAwardNonce, setDismissedAwardNonce] = useState<number>(0);

  if (game.phase === 'finished' || game.phase === 'exhausted') {
    const isExhausted = game.phase === 'exhausted';
    const sortedPlayers = [...game.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex-1 flex items-center justify-center py-6"
      >
        <div className="w-full max-w-xl rounded-3xl bg-[#FFFDF9] border-2 border-[#C8B9A3] p-6 sm:p-8 text-center space-y-6 shadow-[0_18px_40px_-14px_rgba(35,26,21,0.16)]">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-[#231A15] flex items-center justify-center text-[#FBF7F0] shadow-md">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#231A15] text-balance">
              {isExhausted ? t.questionsExhaustedTitle : t.gameCompletedTitle}
            </h1>
            <p className="text-sm sm:text-base text-[#5E4F43] leading-relaxed">
              {isExhausted ? t.questionsExhaustedDesc : t.gameCompletedDesc}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-[#231A15]">
                {game.totalTurnsCompleted}
              </div>
              <div className="text-xs text-[#6E5E50] font-semibold mt-1">{t.totalTurnsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-[#4A6B46]">
                {game.completedQuestionsCount}
              </div>
              <div className="text-xs text-[#6E5E50] font-semibold mt-1">{t.completedQuestionsStat}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#FBF7F0] border border-[#DDD2C0] p-4 text-start space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#8C6820]">
              <Trophy className="w-4 h-4" />
              <span>{t.leaderboardTitle}</span>
            </div>
            <ul className="divide-y divide-[#E8DEC8]">
              {sortedPlayers.map((p, idx) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 text-xs font-mono-tabular font-bold text-[#8B5E3C]">
                      #{idx + 1}
                    </span>
                    <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="sm" active={idx === 0} />
                    <span className="text-sm font-bold text-[#231A15] truncate">{p.name}</span>
                  </div>
                  <span
                    dir="ltr"
                    className={`font-mono-tabular text-sm font-extrabold ${
                      (p.score ?? 0) < 0 ? 'text-[#9B3B30]' : 'text-[#4A6B46]'
                    }`}
                  >
                    {p.score ?? 0} {t.pointsUnit}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                soundFX.cardDeal(soundEnabled);
                setDismissedAwardNonce(0);
                onPlayAgain();
              }}
              className="flex-1 min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold flex items-center justify-center gap-2 transition cursor-pointer"
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
              className="min-h-[50px] px-6 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>{t.returnHome}</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const activePlayer =
    (game.activePlayerId
      ? game.players.find((p) => p.id === game.activePlayerId)
      : undefined) ?? game.players[game.currentTurnIndex];

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

  const showRewardModal = Boolean(
    game.lastCardEvent?.type === 'awarded' &&
      game.lastCardEvent.nonce === game.turnNonce &&
      dismissedAwardNonce !== game.turnNonce
  );

  const canUseGoldOrSwitch = game.turnMode === 'normal';
  const canUseAntiSwitch =
    game.turnMode === 'switch_pending' &&
    Boolean(activePlayer && (activePlayer.antiSwitchCards ?? 0) >= 1);

  const otherPlayers = game.players
    .filter((p) => p.id !== activePlayer?.id)
    .map((p) => ({ uid: p.id, name: p.name, avatarColor: p.avatarColor }));

  const switchSourceName = game.switchSourceId
    ? game.players.find((p) => p.id === game.switchSourceId)?.name
    : undefined;

  return (
    <div className="flex-1 flex flex-col gap-4 pb-28">
      {/* Unboxed HUD Telemetry Strip */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-[#6E5E50]">
          <div className="flex items-center gap-2 tabular-nums">
            <span className="text-[#231A15] font-extrabold">
              {game.gameMode === 'all_questions'
                ? t.allQuestionsOption
                : `${t.roundLabel} ${game.currentRound} ${t.ofLabel} ${game.roundsCount}`}
            </span>
            <span aria-hidden="true" className="text-[#C8B9A3]">·</span>
            <span>
              {t.turnLabel} {currentTurnDisplay} {t.ofLabel} {totalConfiguredTurns}
            </span>
            <span aria-hidden="true" className="text-[#C8B9A3]">·</span>
            <span>
              {game.players.length} {t.playersShort}
            </span>
          </div>

          <div className="text-xs text-[#6E5E50] tabular-nums">
            {t.remainingPool}: <strong className="text-[#8B5E3C]">{remainingQuestions}</strong> / {TOTAL_QUESTIONS_COUNT}
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-[#E8DEC8] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#231A15] transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>
      </section>

      {/* Active Player Card Inventory */}
      {activePlayer && (
        <CardInventoryBar
          goldCards={activePlayer.goldCards ?? 0}
          switchCards={activePlayer.switchCards ?? 0}
          antiSwitchCards={activePlayer.antiSwitchCards ?? 0}
          canUseGoldOrSwitch={canUseGoldOrSwitch}
          canUseAntiSwitch={canUseAntiSwitch}
          onUseGold={() => {
            soundFX.turnAlert(soundEnabled);
            onUseGoldCard();
          }}
          onUseSwitch={(targetId) => {
            soundFX.turnAlert(soundEnabled);
            onUseSwitchCard(targetId);
          }}
          onUseAntiSwitch={() => {
            soundFX.turnAlert(soundEnabled);
            onUseAntiSwitchCard();
          }}
          otherPlayers={otherPlayers}
          remainingDeckCards={game.availableSpecialCards.length}
        />
      )}

      {/* Special Card Event Notification */}
      <CardEventBanner event={game.lastCardEvent} />

      {/* Current Player Banner */}
      <section className="rounded-3xl p-4 sm:p-5 bg-[#231A15] border border-[#231A15] text-[#FBF7F0] flex items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-4 min-w-0">
          {activePlayer && (
            <PlayerAvatar
              name={activePlayer.name}
              paletteId={activePlayer.avatarColor}
              size="lg"
              active
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#D5C7B2]">{t.passPhonePrompt}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFDF9] truncate">
              {activePlayer?.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-end">
            <p className="text-[11px] font-semibold text-[#D5C7B2]">{t.scoreLabel}</p>
            <p
              dir="ltr"
              className={`font-mono-tabular text-lg font-extrabold ${
                (activePlayer?.score ?? 0) < 0 ? 'text-[#F2A79E]' : 'text-[#B5D3AF]'
              }`}
            >
              {activePlayer?.score ?? 0} {t.pointsUnit}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-[#DDD2C0]">
            <Smartphone className="w-4 h-4 text-[#D7BD7B]" />
            <span>{t.singlePhoneNextRule}</span>
          </div>
        </div>
      </section>

      <TurnModeNotice
        turnMode={game.turnMode}
        turnQuestionsRemaining={1}
        switchSourceName={switchSourceName}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-1">
        {/* Paper-Style Question Card */}
        <div className="lg:col-span-8 flex flex-col">
          <AnimatePresence mode="wait">
            {currentQuestion && (
              <motion.section
                key={`sp-q-${game.turnNonce}-${currentQuestion.id}`}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22 }}
                className="relative flex-1 min-h-[270px] sm:min-h-[340px] rounded-3xl border-2 border-[#C8B9A3] bg-[#FFFDF9] p-4 sm:p-5 flex flex-col shadow-[0_18px_38px_-14px_rgba(35,26,21,0.16)]"
              >
                <div className="relative flex-1 rounded-2xl border border-dashed border-[#D5C7B2] p-5 sm:p-8 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8B5E3C]">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">✦</span>
                      <span>{t.questionCardLabel}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#4A6B46] font-extrabold">{t.answerBonusBadge}</span>
                      <span className="font-mono-tabular text-[#9C8D7E]">#{currentQuestion.id}</span>
                    </div>
                  </div>

                  <div className="my-auto py-6 text-center">
                    <p
                      dir="rtl"
                      className="text-2xl sm:text-4xl font-extrabold text-[#231A15] leading-relaxed sm:leading-relaxed text-balance"
                    >
                      {currentQuestion.text}
                    </p>
                  </div>

                  <div className="min-h-[24px] flex items-center justify-between gap-2 text-xs text-[#8B5E3C]">
                    <span aria-hidden="true" className="font-extrabold text-base opacity-60">؟</span>
                    {currentQuestion.isGroupPrompt ? (
                      <p className="text-xs sm:text-sm text-[#6F492E] font-bold text-center">
                        {t.groupPromptNote}
                      </p>
                    ) : (
                      <p className="text-xs text-[#7A6A5B] sm:hidden text-center">{t.singlePhoneNextRule}</p>
                    )}
                    <span aria-hidden="true" className="font-extrabold text-base opacity-60">✦</span>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Live Single Phone Scoreboard & Card Badges */}
        <aside className="lg:col-span-4 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center justify-between border-b border-[#E8DEC8] pb-3">
            <h3 className="text-sm font-bold text-[#231A15] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#8B5E3C]" />
              <span>{t.leaderboardTitle}</span>
            </h3>
            <span className="text-xs font-semibold text-[#6E5E50]">{t.scoreLabel}</span>
          </div>
          <ul className="divide-y divide-[#EFE6D6]">
            {game.players.map((p) => {
              const isTurn = p.id === activePlayer?.id;
              const score = p.score ?? 0;
              return (
                <li
                  key={p.id}
                  className={`py-2.5 px-2 -mx-2 rounded-xl flex items-center justify-between gap-2 ${
                    isTurn ? 'bg-[#F3EBDD]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="sm" active={isTurn} />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-[#231A15] truncate block">{p.name}</span>
                      {((p.goldCards ?? 0) > 0 || (p.switchCards ?? 0) > 0 || (p.antiSwitchCards ?? 0) > 0) && (
                        <span className="text-[10px] font-bold text-[#8B5E3C]">
                          {p.goldCards ? `G:${p.goldCards} ` : ''}
                          {p.switchCards ? `S:${p.switchCards} ` : ''}
                          {p.antiSwitchCards ? `A:${p.antiSwitchCards}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    dir="ltr"
                    className={`font-mono-tabular text-xs font-extrabold ${
                      score < 0 ? 'text-[#9B3B30]' : 'text-[#4A6B46]'
                    }`}
                  >
                    {score} {t.pointsUnit}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* Special Card Reward Celebration Overlay */}
      <CardRewardOverlay
        visible={showRewardModal}
        cardId={game.lastCardEvent?.cardId ?? null}
        recipientName={game.lastCardEvent?.actorName ?? ''}
        onContinue={() => setDismissedAwardNonce(game.turnNonce)}
      />

      {/* Primary Action Bar — Answer Next Question ONLY (Strictly NO Normal Skip) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#F6EFE3]/95 backdrop-blur-md border-t border-[#DDD2C0] p-3 pb-safe">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {canUseAntiSwitch && (
            <button
              type="button"
              onClick={() => {
                soundFX.turnAlert(soundEnabled);
                onUseAntiSwitchCard();
              }}
              className="min-h-[52px] px-4 sm:px-5 rounded-2xl bg-[#F9EAE6] hover:bg-[#F3DDD7] border-2 border-[#B45E4D] text-[#843B2E] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
            >
              <Shield className="w-4 h-4 text-[#8F4A3B] shrink-0" />
              <span>{t.defendWithAntiSwitchBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundFX.cardDeal(soundEnabled);
              onNextQuestion();
            }}
            className="flex-1 min-h-[52px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-base sm:text-lg flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition cursor-pointer"
          >
            <span>{t.nextQuestion} (+1)</span>
            <ArrowRight className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
