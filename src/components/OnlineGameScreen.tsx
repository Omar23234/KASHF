import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Home,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Users,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { BRAND_CONFIG } from '../config/brand';
import { useApp } from '../context/AppContext';
import { getQuestionById, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  advanceTurnNextQuestion,
  claimDisconnectedHost,
  leaveMultiplayerRoom,
  saveActiveRoom,
  setPlayerConnectionState,
  skipTurnQuestion,
  startOrRestartMultiplayerGame,
  subscribeToRoomAndPlayers,
} from '../firebase/multiplayerService';
import type { RoomDoc, RoomPlayerDoc } from '../types/game';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';

export const OnlineGameScreen: React.FC = () => {
  const { language, t, soundEnabled, activeRoomCode, setActiveRoomCode, setScreen, authUser } =
    useApp();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Record<string, RoomPlayerDoc>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const prevTurnNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeRoomCode) {
      setScreen('online_entry');
      return;
    }

    const unsub = subscribeToRoomAndPlayers(
      activeRoomCode,
      (nextRoom, nextPlayers) => {
        setLoading(false);
        if (!nextRoom || nextRoom.status === 'closed') {
          saveActiveRoom(null);
          setActiveRoomCode(null);
          setScreen('home');
          return;
        }
        if (nextRoom.status === 'waiting') {
          setRoom(nextRoom);
          setPlayers(nextPlayers);
          setScreen('online_lobby');
          return;
        }
        setRoom(nextRoom);
        setPlayers(nextPlayers);

        if (prevTurnNonceRef.current !== null && nextRoom.turnNonce !== prevTurnNonceRef.current) {
          if (nextRoom.status === 'finished' || nextRoom.status === 'exhausted') {
            soundFX.complete(soundEnabled);
          } else if (nextRoom.activePlayerId === authUser?.uid) {
            soundFX.turnAlert(soundEnabled);
          } else {
            soundFX.cardDeal(soundEnabled);
          }
        }
        prevTurnNonceRef.current = nextRoom.turnNonce;
      },
      (err) => {
        setLoading(false);
        setErrorMsg(err.message);
      }
    );

    void setPlayerConnectionState(activeRoomCode, true);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void setPlayerConnectionState(activeRoomCode, true);
      }
    }, 20000);

    const handleVis = () => {
      void setPlayerConnectionState(activeRoomCode, document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      unsub();
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [activeRoomCode, authUser?.uid, setActiveRoomCode, setScreen, soundEnabled]);

  if (loading || !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-300">{t.connectingAuth}</p>
      </div>
    );
  }

  const myUid = authUser?.uid ?? '';
  const isHost = myUid === room.hostId;
  const myPlayer = players[myUid];
  const activePlayer = room.activePlayerId ? players[room.activePlayerId] : undefined;
  const hostPlayer = players[room.hostId];
  const isMyTurn = room.status === 'playing' && room.activePlayerId === myUid;

  const totalConfiguredTurns =
    room.gameMode === 'all_questions'
      ? TOTAL_QUESTIONS_COUNT
      : room.playerOrder.length * room.roundsCount;
  const currentTurnDisplay = Math.min(totalConfiguredTurns, room.totalTurnsCompleted + 1);
  const progressPct =
    totalConfiguredTurns > 0
      ? Math.min(100, Math.round((room.totalTurnsCompleted / totalConfiguredTurns) * 100))
      : 0;
  const remainingQuestions = Math.max(0, TOTAL_QUESTIONS_COUNT - room.usedQuestionIds.length);
  const currentQuestion = getQuestionById(room.currentQuestionId);

  const handleNext = async () => {
    if (busy) return;
    soundFX.tap(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await advanceTurnNextQuestion(room.roomCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (busy || !myPlayer || myPlayer.skipsRemaining < 1) return;
    soundFX.skip(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await skipTurnQuestion(room.roomCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  const handlePlayAgain = async () => {
    if (busy) return;
    soundFX.cardDeal(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await startOrRestartMultiplayerGame(room.roomCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  const handleReturnHome = async () => {
    soundFX.tap(soundEnabled);
    await leaveMultiplayerRoom(room.roomCode);
    setActiveRoomCode(null);
    setScreen('home');
  };

  // Game Completed or All 63 Questions Exhausted
  if (room.status === 'finished' || room.status === 'exhausted') {
    const isExhausted = room.status === 'exhausted';
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

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-2xl bg-[#070B18] border border-white/10 p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-white">
                {room.totalTurnsCompleted}
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.totalTurnsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#070B18] border border-white/10 p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-blue-400">
                {room.completedQuestionsCount}
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.completedQuestionsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#070B18] border border-white/10 p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-violet-400">
                {room.skippedQuestionsCount}
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.skippedQuestionsStat}</div>
            </div>
          </div>

          {errorMsg && <p className="text-sm text-rose-400">{errorMsg}</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {isHost ? (
              <button
                type="button"
                disabled={busy}
                onClick={handlePlayAgain}
                className="flex-1 min-h-[50px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold flex items-center justify-center gap-2 hover:brightness-110 transition cursor-pointer disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                <span>{t.playAgain}</span>
              </button>
            ) : (
              <div className="flex-1 min-h-[50px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sm text-slate-300 px-4">
                {t.waitingHostRestart}
              </div>
            )}

            <button
              type="button"
              onClick={handleReturnHome}
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

  // Active Gameplay View
  const mySkipsLeft = myPlayer?.skipsRemaining ?? 0;

  return (
    <div className="flex-1 flex flex-col gap-5 pb-32">
      {/* Unboxed HUD Telemetry Strip */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-slate-300">
          <div className="flex items-center gap-2 tabular-nums">
            <span className="text-white font-bold">
              {t.roundLabel} {room.currentRound} {t.ofLabel} {room.roundsCount}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>
              {t.turnLabel} {currentTurnDisplay} {t.ofLabel} {totalConfiguredTurns}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>
              {room.playerOrder.length} {t.playersShort}
            </span>
          </div>

          <div className="text-xs text-slate-400 tabular-nums">
            {t.remainingPool}: <strong className="text-blue-300">{remainingQuestions}</strong> / {TOTAL_QUESTIONS_COUNT}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>
      </section>

      {/* Main Responsive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-1">
        {/* Left/Center Primary Stage: Turn + Question OR Waiting View */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {/* Active Turn Header */}
          <div
            className={`rounded-3xl p-4 sm:p-5 border flex items-center justify-between gap-4 transition-colors ${
              isMyTurn
                ? 'bg-gradient-to-r from-blue-600/25 to-violet-600/25 border-blue-400/50'
                : 'bg-[#0C1226]/90 border-white/10'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {activePlayer && (
                <PlayerAvatar
                  name={activePlayer.name}
                  paletteId={activePlayer.avatarColor}
                  size="lg"
                  active
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-300">
                  {isMyTurn ? t.yourTurnTitle : t.activePlayerTurn}
                </p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate">
                  {activePlayer?.name ?? '...'}
                </h2>
              </div>
            </div>

            {myPlayer && (
              <div className="text-end shrink-0">
                <p className="text-[11px] font-semibold text-slate-400">{t.skipsRemainingLabel}</p>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  {[0, 1, 2].map((idx) => (
                    <span
                      key={idx}
                      className={`w-3 h-3 rotate-45 rounded-[2px] transition-colors ${
                        idx < mySkipsLeft
                          ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]'
                          : 'bg-white/12'
                      }`}
                    />
                  ))}
                  <span className="ms-1.5 font-mono-tabular text-sm font-bold text-white">
                    {mySkipsLeft}/3
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Question Card (Active Player) OR Waiting Screen (Other Players) */}
          <AnimatePresence mode="wait">
            {isMyTurn && currentQuestion ? (
              <motion.div
                key={`q-${room.turnNonce}-${currentQuestion.id}`}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22 }}
                className="relative flex-1 min-h-[260px] sm:min-h-[320px] rounded-3xl overflow-hidden border border-blue-400/35 bg-[#0D142B] p-6 sm:p-10 flex flex-col justify-between shadow-2xl"
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
                  {currentQuestion.isGroupPrompt && (
                    <p className="text-xs sm:text-sm text-violet-300 font-medium">
                      {t.groupPromptNote}
                    </p>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`wait-${room.turnNonce}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative flex-1 min-h-[260px] sm:min-h-[320px] rounded-3xl overflow-hidden border border-white/10 bg-[#0B1021] p-6 sm:p-10 flex flex-col items-center justify-center text-center gap-5 shadow-xl"
              >
                <img
                  src={BRAND_CONFIG.cardTextureImage}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-20"
                />
                <div className="relative z-10 flex flex-col items-center gap-4 max-w-md">
                  {activePlayer && (
                    <PlayerAvatar
                      name={activePlayer.name}
                      paletteId={activePlayer.avatarColor}
                      size="xl"
                      active
                    />
                  )}
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-blue-300">{t.activePlayerTurn}</p>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                      {activePlayer?.name ?? '...'}
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed pt-1">
                      {t.waitingTurnDesc}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Host Controls for Inactive/Disconnected Active Player or Disconnected Host */}
          {isHost && !isMyTurn && (
            <button
              type="button"
              disabled={busy}
              onClick={handleNext}
              className="min-h-[44px] px-4 rounded-2xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{t.hostForceNext}</span>
            </button>
          )}

          {!isHost && hostPlayer && !hostPlayer.connected && (
            <button
              type="button"
              onClick={() => void claimDisconnectedHost(room.roomCode)}
              className="min-h-[44px] px-4 rounded-2xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{t.claimHost}</span>
            </button>
          )}

          {errorMsg && <p className="text-sm text-rose-400 font-semibold text-center">{errorMsg}</p>}
        </section>

        {/* Right Side Panel: Live Player Order & Independent Skip Counts */}
        <aside className="lg:col-span-4 rounded-3xl bg-[#0C1226]/95 border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-white/8 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span>{t.playersCountLabel}</span>
            </h3>
            <span className="text-xs text-slate-400">{t.skipsRemainingLabel}</span>
          </div>

          <ul className="divide-y divide-white/8">
            {room.playerOrder.map((pid) => {
              const p = players[pid];
              if (!p) return null;
              const isTurn = pid === room.activePlayerId;
              return (
                <li
                  key={pid}
                  className={`py-2.5 px-2 -mx-2 rounded-xl flex items-center justify-between gap-2 ${
                    isTurn ? 'bg-blue-600/15' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar
                      name={p.name}
                      paletteId={p.avatarColor}
                      size="sm"
                      active={isTurn}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">{p.name}</span>
                        {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {!p.connected && <WifiOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                      </div>
                      {isTurn && (
                        <span className="text-[11px] font-semibold text-blue-300">
                          {t.activePlayerTurn}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 font-mono-tabular text-xs font-bold">
                    <span className={p.skipsRemaining > 0 ? 'text-violet-300' : 'text-slate-500'}>
                      {p.skipsRemaining}/3
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* Bottom Thumb-Zone Action Controls (Active Player Only) */}
      {isMyTurn && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-[#060913]/92 backdrop-blur-md border-t border-white/10 p-3 pb-safe">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button
              type="button"
              disabled={busy || mySkipsLeft < 1}
              onClick={handleSkip}
              title={t.skipLimitTooltip}
              className="min-h-[50px] px-4 sm:px-6 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/15 text-slate-100 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <SkipForward className="w-4 h-4 text-violet-400 shrink-0" />
              <span>
                {mySkipsLeft > 0
                  ? `${t.skipQuestion} (${mySkipsLeft})`
                  : t.noSkipsLeft}
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleNext}
              className="flex-1 min-h-[50px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-700/30 hover:brightness-110 active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{t.nextQuestion}</span>
                  <ArrowRight className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
