import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Home,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Shield,
  ShieldAlert,
  SkipForward,
  Trophy,
  Users,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  useAntiSwitchCard,
  useGoldCard,
  useSwitchCard,
} from '../firebase/multiplayerService';
import { useVoiceChat } from '../context/VoiceContext';
import type { RoomDoc, RoomPlayerDoc } from '../types/game';
import { formatMultiplayerError } from '../utils/errorMessages';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';
import { RoomChatVoicePanel } from './RoomChatVoicePanel';
import {
  CardEventBanner,
  CardInventoryBar,
  CardRewardOverlay,
  RoundResultsModal,
  TurnModeNotice,
} from './SpecialCardModals';

export const OnlineGameScreen: React.FC = () => {
  const { language, t, soundEnabled, activeRoomCode, setActiveRoomCode, setScreen, authUser } =
    useApp();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Record<string, RoomPlayerDoc>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissedAwardNonce, setDismissedAwardNonce] = useState<number>(0);
  const [completedRoundSummary, setCompletedRoundSummary] = useState<number | null>(null);
  const [doubleSkipNotice, setDoubleSkipNotice] = useState(false);
  const prevTurnNonceRef = useRef<number | null>(null);
  const prevRoundRef = useRef<number | null>(null);
  const prevGameNumberRef = useRef<number | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const myUid = authUser?.uid ?? '';
  const voice = useVoiceChat();
  const { setVoiceRoomMeta, clearVoiceRoomMeta } = voice;

  useEffect(() => {
    setVoiceRoomMeta({
      roomCode: activeRoomCode,
      myUid,
      players,
      playerOrder: room?.playerOrder ?? [],
    });
  }, [activeRoomCode, myUid, players, room?.playerOrder, setVoiceRoomMeta]);

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
          clearVoiceRoomMeta();
          saveActiveRoom(null);
          setActiveRoomCode(null);
          setScreen('home');
          return;
        }
        if (authUser && !nextRoom.playerOrder.includes(authUser.uid)) {
          clearVoiceRoomMeta();
          saveActiveRoom(null);
          setActiveRoomCode(null);
          setScreen('online_entry');
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

        if (
          nextRoom.status === 'playing' &&
          prevGameNumberRef.current === nextRoom.gameNumber &&
          prevRoundRef.current !== null &&
          nextRoom.currentRound > prevRoundRef.current
        ) {
          setCompletedRoundSummary(prevRoundRef.current);
          soundFX.roundComplete(soundEnabledRef.current);
        }
        if (nextRoom.status !== 'playing' || prevGameNumberRef.current !== nextRoom.gameNumber) {
          setCompletedRoundSummary(null);
        }
        prevGameNumberRef.current = nextRoom.gameNumber;
        prevRoundRef.current = nextRoom.status === 'playing' ? nextRoom.currentRound : null;

        if (prevTurnNonceRef.current !== null && nextRoom.turnNonce !== prevTurnNonceRef.current) {
          const snd = soundEnabledRef.current;
          if (nextRoom.status === 'finished' || nextRoom.status === 'exhausted') {
            soundFX.complete(snd);
          } else if (nextRoom.lastCardEvent?.nonce === nextRoom.turnNonce) {
            if (nextRoom.lastCardEvent.type === 'awarded') {
              if (nextRoom.lastCardEvent.actorUid === authUser?.uid) {
                soundFX.secretCardFanfare(snd);
              } else if (nextRoom.activePlayerId === authUser?.uid) {
                soundFX.turnAlert(snd);
              } else {
                soundFX.cardDeal(snd);
              }
            } else {
              soundFX.turnAlert(snd);
            }
          } else if (nextRoom.activePlayerId === authUser?.uid) {
            soundFX.turnAlert(snd);
          } else {
            soundFX.cardDeal(snd);
          }
        }
        prevTurnNonceRef.current = nextRoom.turnNonce;
      },
      (err) => {
        setLoading(false);
        setErrorMsg(formatMultiplayerError(err, tRef.current));
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
    const handleUnload = () => {
      void setPlayerConnectionState(activeRoomCode, false);
    };
    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      unsub();
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [activeRoomCode, authUser, clearVoiceRoomMeta, setActiveRoomCode, setScreen]);

  if (loading || !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="w-8 h-8 text-[#8B5E3C] animate-spin" />
        <p className="text-sm font-medium text-[#6E5E50]">{t.connectingAuth}</p>
      </div>
    );
  }

  const isHost = myUid === room.hostId;
  const myPlayer = players[myUid];
  const activePlayer = room.activePlayerId ? players[room.activePlayerId] : undefined;
  const hostPlayer = players[room.hostId];
  const isMyTurn = room.status === 'playing' && room.activePlayerId === myUid;
  const turnMode = room.turnMode ?? 'normal';
  const turnQuestionsRemaining = room.turnQuestionsRemaining ?? 1;

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

  const showRewardModal = Boolean(
    completedRoundSummary === null &&
      isMyTurn &&
      room.lastCardEvent?.type === 'awarded' &&
      room.lastCardEvent.actorUid === myUid &&
      room.lastCardEvent.nonce === room.turnNonce &&
      dismissedAwardNonce !== room.turnNonce
  );

  const handleNext = async () => {
    if (busy) return;
    soundFX.tap(soundEnabled);
    setDoubleSkipNotice(false);
    setBusy(true);
    setErrorMsg('');
    try {
      await advanceTurnNextQuestion(room.roomCode);
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (busy || !myPlayer || myPlayer.skipsRemaining < 1 || turnMode !== 'normal') return;
    const isThirdSkip = myPlayer.skipsUsed === 2 && !myPlayer.doublePenaltyUsed;
    soundFX.skip(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await skipTurnQuestion(room.roomCode);
      if (isThirdSkip) {
        setDoubleSkipNotice(true);
      }
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleGoldCard = async () => {
    if (busy || !myPlayer || (myPlayer.goldCards ?? 0) < 1 || turnMode !== 'normal') return;
    soundFX.turnAlert(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await useGoldCard(room.roomCode);
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchCard = async (targetUid: string) => {
    if (busy || !myPlayer || (myPlayer.switchCards ?? 0) < 1 || turnMode !== 'normal') return;
    soundFX.turnAlert(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await useSwitchCard(room.roomCode, targetUid);
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleAntiSwitchCard = async () => {
    if (
      busy ||
      !myPlayer ||
      (myPlayer.antiSwitchCards ?? 0) < 1 ||
      turnMode !== 'switch_pending' ||
      room.switchTargetId !== myUid
    ) {
      return;
    }
    soundFX.turnAlert(soundEnabled);
    setBusy(true);
    setErrorMsg('');
    try {
      await useAntiSwitchCard(room.roomCode);
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handlePlayAgain = async () => {
    if (busy) return;
    soundFX.cardDeal(soundEnabled);
    setDoubleSkipNotice(false);
    setDismissedAwardNonce(0);
    setCompletedRoundSummary(null);
    setBusy(true);
    setErrorMsg('');
    try {
      await startOrRestartMultiplayerGame(room.roomCode);
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleReturnHome = async () => {
    soundFX.tap(soundEnabled);
    try {
      await voice.leaveVoice();
      clearVoiceRoomMeta();
      await leaveMultiplayerRoom(room.roomCode);
    } catch {
      clearVoiceRoomMeta();
      // still navigate home if network dropped
    } finally {
      setActiveRoomCode(null);
      setScreen('home');
    }
  };

  const sortedByScore = room.playerOrder
    .map((pid) => players[pid])
    .filter((p): p is RoomPlayerDoc => Boolean(p))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Game Completed or All 63 Questions Exhausted
  if (room.status === 'finished' || room.status === 'exhausted') {
    const isExhausted = room.status === 'exhausted';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex-1 flex flex-col items-center justify-center py-4 gap-4"
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

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-[#231A15]">
                {room.totalTurnsCompleted}
              </div>
              <div className="text-xs text-[#6E5E50] font-semibold mt-1">{t.totalTurnsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-[#4A6B46]">
                {room.completedQuestionsCount}
              </div>
              <div className="text-xs text-[#6E5E50] font-semibold mt-1">{t.completedQuestionsStat}</div>
            </div>
            <div className="rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0] p-4">
              <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold text-[#8B5E3C]">
                {room.skippedQuestionsCount}
              </div>
              <div className="text-xs text-[#6E5E50] font-semibold mt-1">{t.skippedQuestionsStat}</div>
            </div>
          </div>

          {/* Final Leaderboard */}
          <div className="rounded-2xl bg-[#FBF7F0] border border-[#DDD2C0] p-4 text-start space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#8C6820]">
              <Trophy className="w-4 h-4" />
              <span>{t.leaderboardTitle}</span>
            </div>
            <ul className="divide-y divide-[#E8DEC8]">
              {sortedByScore.map((p, idx) => (
                <li key={p.uid} className="py-2 flex items-center justify-between gap-3">
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

          {errorMsg && <p className="text-sm text-[#9B3B30] font-bold">{errorMsg}</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            {isHost ? (
              <button
                type="button"
                disabled={busy}
                onClick={handlePlayAgain}
                className="flex-1 min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                <span>{t.playAgain}</span>
              </button>
            ) : (
              <div className="flex-1 min-h-[50px] rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] flex items-center justify-center text-sm font-bold text-[#5E4F43] px-4">
                {t.waitingHostRestart}
              </div>
            )}

            <button
              type="button"
              onClick={handleReturnHome}
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

  // Active Gameplay View
  const mySkipsLeft = myPlayer?.skipsRemaining ?? 0;
  const canUseGoldOrSwitch = isMyTurn && turnMode === 'normal';
  const canUseAntiSwitch =
    isMyTurn && turnMode === 'switch_pending' && room.switchTargetId === myUid;
  const canNormalSkip = canUseGoldOrSwitch && mySkipsLeft > 0;

  const otherSelectablePlayers = room.playerOrder
    .filter((pid) => pid !== myUid && Boolean(players[pid]))
    .map((pid) => ({
      uid: pid,
      name: players[pid].name,
      avatarColor: players[pid].avatarColor,
    }));

  const switchSourceName = room.switchSourceId ? players[room.switchSourceId]?.name : undefined;

  return (
    <div className="flex-1 flex flex-col gap-4 pb-32">
      {/* Unboxed HUD Telemetry Strip */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-[#6E5E50]">
          <div className="flex items-center gap-2 tabular-nums">
            <span className="text-[#231A15] font-extrabold">
              {t.roundLabel} {room.currentRound} {t.ofLabel} {room.roundsCount}
            </span>
            <span aria-hidden="true" className="text-[#C8B9A3]">·</span>
            <span>
              {t.turnLabel} {currentTurnDisplay} {t.ofLabel} {totalConfiguredTurns}
            </span>
            <span aria-hidden="true" className="text-[#C8B9A3]">·</span>
            <span>
              {room.playerOrder.length} {t.playersShort}
            </span>
          </div>

          <div className="text-xs text-[#6E5E50] tabular-nums">
            {t.remainingPool}: <strong className="text-[#8B5E3C]">{remainingQuestions}</strong> / {TOTAL_QUESTIONS_COUNT}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full rounded-full bg-[#E8DEC8] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#231A15] transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>
      </section>

      {/* Real-time Voice & Text Chat Controls */}
      <RoomChatVoicePanel
        roomCode={room.roomCode}
        myUid={myUid}
        myName={myPlayer?.name ?? ''}
        memberIds={room.playerOrder}
        players={players}
        voiceJoined={voice.voiceJoined}
        micMuted={voice.micMuted}
        voiceError={voice.voiceError}
        voiceStatus={voice.voiceStatus}
        connectedPeersCount={voice.connectedPeersCount}
        localMicLevel={voice.localMicLevel}
        voiceAudioBlocked={voice.audioBlocked}
        speakingUids={voice.speakingUids}
        onJoinVoice={() => void voice.joinVoice()}
        onLeaveVoice={() => void voice.leaveVoice()}
        onToggleMute={() => void voice.toggleMute()}
        onReconnectVoice={() => void voice.reconnectVoice()}
        onUnlockVoiceAudio={voice.unlockAudio}
      />

      {/* Personal Card Inventory Bar */}
      {myPlayer && (
        <CardInventoryBar
          goldCards={myPlayer.goldCards ?? 0}
          switchCards={myPlayer.switchCards ?? 0}
          antiSwitchCards={myPlayer.antiSwitchCards ?? 0}
          canUseGoldOrSwitch={canUseGoldOrSwitch}
          canUseAntiSwitch={canUseAntiSwitch}
          busy={busy}
          onUseGold={() => void handleGoldCard()}
          onUseSwitch={(targetUid) => void handleSwitchCard(targetUid)}
          onUseAntiSwitch={() => void handleAntiSwitchCard()}
          otherPlayers={otherSelectablePlayers}
        />
      )}

      {/* Real-time Card Event Broadcast */}
      <CardEventBanner event={room.lastCardEvent ?? null} />

      {/* 3rd-Skip Double Penalty Armed Notice */}
      {doubleSkipNotice && (
        <div className="rounded-2xl bg-[#FBF5E4] border border-[#C7A355] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#7D5D18]">
          {t.doublePenaltyArmedAlert}
        </div>
      )}

      {/* Main Responsive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-1">
        {/* Left/Center Primary Stage: Turn + Paper Question Card OR Waiting View */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {/* Active Turn Header */}
          <div
            className={`rounded-3xl p-4 sm:p-5 border flex flex-wrap items-center justify-between gap-4 transition-colors ${
              isMyTurn
                ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0] shadow-md'
                : 'bg-[#FFFDF9] border-[#DDD2C0] text-[#231A15]'
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
                <p className={`text-xs font-bold ${isMyTurn ? 'text-[#D5C7B2]' : 'text-[#8B5E3C]'}`}>
                  {isMyTurn ? t.yourTurnTitle : t.activePlayerTurn}
                </p>
                <h2 className={`text-xl sm:text-2xl font-extrabold truncate ${isMyTurn ? 'text-[#FFFDF9]' : 'text-[#231A15]'}`}>
                  {activePlayer?.name ?? '...'}
                </h2>
              </div>
            </div>

            {myPlayer && (
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-end">
                  <p className={`text-[11px] font-semibold ${isMyTurn ? 'text-[#D5C7B2]' : 'text-[#6E5E50]'}`}>
                    {t.scoreLabel}
                  </p>
                  <p
                    dir="ltr"
                    className={`font-mono-tabular text-lg font-extrabold ${
                      (myPlayer.score ?? 0) < 0
                        ? isMyTurn
                          ? 'text-[#F2A79E]'
                          : 'text-[#9B3B30]'
                        : isMyTurn
                          ? 'text-[#B5D3AF]'
                          : 'text-[#4A6B46]'
                    }`}
                  >
                    {myPlayer.score ?? 0} {t.pointsUnit}
                  </p>
                </div>

                <div className="text-end">
                  <p className={`text-[11px] font-semibold ${isMyTurn ? 'text-[#D5C7B2]' : 'text-[#6E5E50]'}`}>
                    {t.skipsRemainingLabel}
                  </p>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    {[0, 1, 2].map((idx) => (
                      <span
                        key={idx}
                        className={`w-2.5 h-2.5 rotate-45 rounded-[2px] transition-colors ${
                          idx < mySkipsLeft
                            ? isMyTurn
                              ? 'bg-[#D7BD7B]'
                              : 'bg-[#8B5E3C]'
                            : isMyTurn
                              ? 'bg-white/20'
                              : 'bg-[#DDD2C0]'
                        }`}
                      />
                    ))}
                    <span className={`ms-1.5 font-mono-tabular text-sm font-bold ${isMyTurn ? 'text-[#FFFDF9]' : 'text-[#231A15]'}`}>
                      {mySkipsLeft}/3
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Switch / Anti-Switch / Double-Turn Notice */}
          <TurnModeNotice
            turnMode={turnMode}
            turnQuestionsRemaining={turnQuestionsRemaining}
            switchSourceName={switchSourceName}
          />

          {/* Paper-Style Question Card (Visible to ALL Players in the Online Room) */}
          <AnimatePresence mode="wait">
            {currentQuestion ? (
              <motion.div
                key={`q-${room.turnNonce}-${currentQuestion.id}`}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22 }}
                className="relative flex-1 min-h-[270px] sm:min-h-[340px] rounded-3xl border-2 border-[#C8B9A3] bg-[#FFFDF9] p-4 sm:p-5 flex flex-col shadow-[0_18px_38px_-14px_rgba(35,26,21,0.16)]"
              >
                {/* Inner Dashed Card Playing Frame */}
                <div className="relative flex-1 rounded-2xl border border-dashed border-[#D5C7B2] p-5 sm:p-8 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8B5E3C]">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">✦</span>
                      <span>{t.questionCardLabel}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {isMyTurn ? (
                        <span className="text-[#4A6B46] font-extrabold">{t.answerBonusBadge}</span>
                      ) : (
                        <span className="text-[#8B5E3C] font-bold">
                          {t.activePlayerTurn}: {activePlayer?.name ?? '...'}
                        </span>
                      )}
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

                  <div className="min-h-[24px] flex flex-col items-center justify-center gap-2 text-xs text-[#8B5E3C]">
                    <div className="w-full flex items-center justify-between gap-2">
                      <span aria-hidden="true" className="font-extrabold text-base opacity-60">؟</span>
                      {currentQuestion.isGroupPrompt ? (
                        <p className="text-xs sm:text-sm text-[#6F492E] font-bold text-center">
                          {t.groupPromptNote}
                        </p>
                      ) : !isMyTurn ? (
                        <p className="text-xs sm:text-sm text-[#6E5E50] font-semibold text-center">
                          {t.waitingTurnDesc}
                        </p>
                      ) : (
                        <span />
                      )}
                      <span aria-hidden="true" className="font-extrabold text-base opacity-60">✦</span>
                    </div>
                    {currentQuestion.isGroupPrompt && !isMyTurn && (
                      <p className="text-xs text-[#6E5E50] font-medium text-center">
                        {t.waitingTurnDesc}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`wait-${room.turnNonce}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative flex-1 min-h-[270px] sm:min-h-[340px] rounded-3xl border-2 border-[#DDD2C0] bg-[#F3EBDD]/85 p-4 sm:p-5 flex flex-col shadow-[0_12px_28px_-14px_rgba(35,26,21,0.1)]"
              >
                <div className="flex-1 rounded-2xl border border-dashed border-[#C8B9A3] p-6 sm:p-8 flex flex-col items-center justify-center text-center gap-4">
                  <Loader2 className="w-7 h-7 text-[#8B5E3C] animate-spin" />
                  <p className="text-sm text-[#5E4F43] font-semibold">{t.waitingTurnDesc}</p>
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
              className="min-h-[44px] px-4 rounded-2xl bg-[#FBF5E4] hover:bg-[#F5E9C6] border border-[#D7BD7B] text-[#7D5D18] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{t.hostForceNext}</span>
            </button>
          )}

          {!isHost && hostPlayer && !hostPlayer.connected && (
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                void claimDisconnectedHost(room.roomCode).catch((err) =>
                  setErrorMsg(formatMultiplayerError(err, t))
                );
              }}
              className="min-h-[44px] px-4 rounded-2xl bg-[#FBF5E4] hover:bg-[#F5E9C6] border border-[#D7BD7B] text-[#7D5D18] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{t.claimHost}</span>
            </button>
          )}

          {errorMsg && <p className="text-sm text-[#9B3B30] font-bold text-center">{errorMsg}</p>}
        </section>

        {/* Right Side Panel: Live Scoreboard, Voice Mic Status & Independent Skip Counts */}
        <aside className="lg:col-span-4 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 space-y-3 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center justify-between border-b border-[#E8DEC8] pb-3">
            <h3 className="text-sm font-bold text-[#231A15] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#8B5E3C]" />
              <span>{t.playersCountLabel}</span>
            </h3>
            <span className="text-xs font-semibold text-[#6E5E50]">{t.scoreLabel} · {t.skipsRemainingLabel}</span>
          </div>

          <ul className="divide-y divide-[#EFE6D6]">
            {room.playerOrder.map((pid) => {
              const p = players[pid];
              if (!p) return null;
              const isTurn = pid === room.activePlayerId;
              const isSpeaking = Boolean(voice.speakingUids[pid]);
              const score = p.score ?? 0;
              return (
                <li
                  key={pid}
                  className={`py-2.5 px-2 -mx-2 rounded-xl flex items-center justify-between gap-2 ${
                    isTurn ? 'bg-[#F3EBDD]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar
                      name={p.name}
                      paletteId={p.avatarColor}
                      size="sm"
                      active={isTurn || isSpeaking}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#231A15] truncate">{p.name}</span>
                        {p.isHost && <Crown className="w-3.5 h-3.5 text-[#9A7426] shrink-0" />}
                        {!p.connected && <WifiOff className="w-3.5 h-3.5 text-[#9C8D7E] shrink-0" />}
                        {p.voiceJoined && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              p.micMuted
                                ? 'bg-[#F9EAE6] border-[#D9A79D] text-[#9B3B30]'
                                : isSpeaking
                                  ? 'bg-[#EEF3EC] border-[#96B590] text-[#355432]'
                                  : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#6E5E50]'
                            }`}
                          >
                            {p.micMuted ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        {isTurn && <span className="font-bold text-[#8B5E3C]">{t.activePlayerTurn}</span>}
                        {p.pendingDoubleTurn && !p.doublePenaltyUsed && (
                          <span className="font-bold text-[#9A7426]">2×</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 font-mono-tabular text-xs font-extrabold">
                    <span dir="ltr" className={score < 0 ? 'text-[#9B3B30]' : 'text-[#4A6B46]'}>
                      {score}
                    </span>
                    <span className={p.skipsRemaining > 0 ? 'text-[#8B5E3C]' : 'text-[#B5A594]'}>
                      {p.skipsRemaining}/3
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* Round-End Results Summary Modal */}
      <RoundResultsModal
        visible={completedRoundSummary !== null && room.status === 'playing'}
        completedRound={completedRoundSummary}
        totalRounds={room.roundsCount}
        gameMode={room.gameMode}
        players={room.playerOrder
          .map((pid) => players[pid])
          .filter((p): p is RoomPlayerDoc => Boolean(p))
          .map((p) => ({
            uid: p.uid,
            name: p.name,
            avatarColor: p.avatarColor,
            score: p.score ?? 0,
            skipsRemaining: p.skipsRemaining,
          }))}
        showSkips
        onContinue={() => setCompletedRoundSummary(null)}
      />

      {/* Special Card Reward Celebration Overlay */}
      <CardRewardOverlay
        visible={showRewardModal}
        cardId={room.lastCardEvent?.cardId ?? null}
        recipientName={myPlayer?.name ?? ''}
        onContinue={() => setDismissedAwardNonce(room.turnNonce)}
      />

      {/* Bottom Thumb-Zone Action Controls (Active Player Only) */}
      {isMyTurn && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-[#F6EFE3]/95 backdrop-blur-md border-t border-[#DDD2C0] p-3 pb-safe">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            {canUseAntiSwitch ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAntiSwitchCard()}
                className="min-h-[50px] px-4 sm:px-5 rounded-2xl bg-[#FEE2E2] hover:bg-[#FECACA] border-2 border-[#DC2626] text-[#7F1D1D] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-sm"
              >
                <Shield className="w-4 h-4 text-[#B91C1C] shrink-0" />
                <span>{t.defendWithAntiSwitchBtn}</span>
              </button>
            ) : turnMode === 'normal' ? (
              <button
                type="button"
                disabled={busy || !canNormalSkip}
                onClick={handleSkip}
                title={t.skipLimitTooltip}
                className="min-h-[50px] px-4 sm:px-5 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <SkipForward className="w-4 h-4 text-[#8B5E3C] shrink-0" />
                <span>
                  {mySkipsLeft > 0
                    ? `${t.skipCostBadge} (${mySkipsLeft})`
                    : t.noSkipsLeft}
                </span>
              </button>
            ) : (
              <div className="px-3 text-xs font-bold text-[#843B2E] hidden sm:block">
                {t.cannotRefuseHint}
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleNext}
              className="flex-1 min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{t.nextQuestion} (+1)</span>
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
