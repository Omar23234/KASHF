import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Layers, Loader2, PlusCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  createMultiplayerRoom,
  ensureAnonymousAuth,
  getMaxRoundsForPlayers,
  getSavedActiveRoom,
  getSavedPlayerName,
  joinMultiplayerRoom,
  saveActiveRoom,
} from '../firebase/multiplayerService';
import type { GameLengthMode } from '../types/game';
import { soundFX } from '../utils/sound';

interface OnlineEntryScreenProps {
  initialRoomCode?: string;
}

export const OnlineEntryScreen: React.FC<OnlineEntryScreenProps> = ({ initialRoomCode = '' }) => {
  const { language, t, soundEnabled, setScreen, setActiveRoomCode, authUser } = useApp();
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [name, setName] = useState(() => getSavedPlayerName());
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode.toUpperCase());
  const [gameMode, setGameMode] = useState<GameLengthMode>('rounds');
  const [roundsCount, setRoundsCount] = useState(3);
  const [randomFirstPlayer, setRandomFirstPlayer] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [anonDisabledError, setAnonDisabledError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedRoom, setSavedRoom] = useState<string | null>(() => getSavedActiveRoom());

  const runSilentAuth = async () => {
    setAuthLoading(true);
    setErrorMsg('');
    try {
      const res = await ensureAnonymousAuth();
      setAnonDisabledError(res.anonDisabledError);
    } catch {
      setErrorMsg(t.errGeneric);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void runSilentAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.tap(soundEnabled);
    setErrorMsg('');
    if (!name.trim()) {
      setErrorMsg(t.errEnterName);
      return;
    }
    setSubmitting(true);
    try {
      const code = await createMultiplayerRoom({
        hostName: name,
        language,
        gameMode,
        roundsCount,
        randomFirstPlayer,
        soundEnabled,
      });
      setActiveRoomCode(code);
      setScreen('online_lobby');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setErrorMsg(msg === 'INVALID_NAME' ? t.errEnterName : t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.tap(soundEnabled);
    setErrorMsg('');
    const normalized = roomCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      setErrorMsg(t.errInvalidCode);
      return;
    }
    if (!name.trim()) {
      setErrorMsg(t.errEnterName);
      return;
    }
    setSubmitting(true);
    try {
      const res = await joinMultiplayerRoom({
        rawCode: normalized,
        playerName: name,
      });
      setActiveRoomCode(res.roomCode);
      setScreen('online_lobby');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ROOM_NOT_FOUND') setErrorMsg(t.errRoomNotFound);
      else if (msg === 'ROOM_STARTED') setErrorMsg(t.errRoomStarted);
      else if (msg === 'ROOM_FULL') setErrorMsg(t.errRoomFull);
      else if (msg === 'ROOM_CLOSED') setErrorMsg(t.errRoomClosed);
      else if (msg === 'INVALID_CODE') setErrorMsg(t.errInvalidCode);
      else setErrorMsg(t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconnectSaved = async () => {
    if (!savedRoom) return;
    soundFX.tap(soundEnabled);
    setErrorMsg('');
    setSubmitting(true);
    try {
      await joinMultiplayerRoom({
        rawCode: savedRoom,
        playerName: name.trim() || getSavedPlayerName() || 'Player',
      });
      setActiveRoomCode(savedRoom);
      setScreen('online_lobby');
    } catch {
      saveActiveRoom(null);
      setSavedRoom(null);
      setErrorMsg(t.errRoomNotFound);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-300">{t.connectingAuth}</p>
      </div>
    );
  }

  if (anonDisabledError && !authUser) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md rounded-3xl bg-[#0D1326] border border-amber-400/30 p-6 sm:p-8 space-y-5 text-center shadow-2xl">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">{t.anonAuthRequiredTitle}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{t.anonAuthRequiredDesc}</p>
          </div>
          <button
            type="button"
            onClick={() => void runSilentAuth()}
            className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold flex items-center justify-center gap-2 hover:brightness-110 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t.retryConnection}</span>
          </button>
        </div>
      </div>
    );
  }

  const maxInitialRounds = getMaxRoundsForPlayers(2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col items-center justify-center py-4 gap-6"
    >
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{t.onlineModeTitle}</h1>
          <p className="text-sm text-slate-400">{t.playOnlineDesc}</p>
        </div>

        {savedRoom && (
          <div className="rounded-2xl bg-blue-600/15 border border-blue-400/30 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-blue-300 font-semibold">
                {language === 'ar' ? 'غرفة نشطة سابقة' : 'Previous Active Room'}
              </p>
              <p className="text-base font-mono-tabular font-bold text-white tracking-wider">
                {savedRoom}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  saveActiveRoom(null);
                  setSavedRoom(null);
                }}
                className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                {t.close}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleReconnectSaved}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'رجوع للغرفة' : 'Reconnect'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Create / Join Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#0C1226] border border-white/10">
          <button
            type="button"
            onClick={() => {
              soundFX.tap(soundEnabled);
              setTab('create');
              setErrorMsg('');
            }}
            className={`min-h-[46px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              tab === 'create'
                ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.createRoom}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.tap(soundEnabled);
              setTab('join');
              setErrorMsg('');
            }}
            className={`min-h-[46px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              tab === 'join'
                ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.joinRoom}</span>
          </button>
        </div>

        {/* Form Card */}
        <div className="rounded-3xl bg-[#0C1226]/95 border border-white/12 p-6 sm:p-8 shadow-2xl">
          {tab === 'create' ? (
            <form onSubmit={handleCreateRoom} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-200">{t.yourName}</label>
                <input
                  type="text"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.yourNamePlaceholder}
                  className="w-full min-h-[48px] px-4 rounded-2xl bg-[#070B18] border border-white/15 focus:border-blue-500 focus:outline-none text-white placeholder:text-slate-500 text-base"
                />
              </div>

              {/* Game Length Selection: Rounds vs Play All Questions */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-400">
                  {t.gameLengthLabel}
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#070B18] border border-white/12">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setGameMode('rounds');
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                      gameMode === 'rounds'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.roundsModeOption}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setGameMode('all_questions');
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      gameMode === 'all_questions'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.allQuestionsOption}</span>
                  </button>
                </div>
              </div>

              {gameMode === 'rounds' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">{t.roundsLabel}</label>
                    <div className="flex items-center justify-between h-12 px-3 rounded-2xl bg-[#070B18] border border-white/12">
                      <button
                        type="button"
                        onClick={() => setRoundsCount((r) => Math.max(1, r - 1))}
                        className="w-9 h-9 rounded-xl bg-white/8 hover:bg-white/15 text-white font-bold cursor-pointer"
                      >
                        −
                      </button>
                      <span className="font-mono-tabular font-bold text-white">
                        {roundsCount} {t.roundUnit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRoundsCount((r) => Math.min(maxInitialRounds, r + 1))}
                        className="w-9 h-9 rounded-xl bg-white/8 hover:bg-white/15 text-white font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">
                      {t.randomFirstPlayer}
                    </label>
                    <button
                      type="button"
                      onClick={() => setRandomFirstPlayer((v) => !v)}
                      className={`w-full h-12 px-4 rounded-2xl border text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                        randomFirstPlayer
                          ? 'bg-blue-600/20 border-blue-400/40 text-blue-200'
                          : 'bg-[#070B18] border-white/12 text-slate-400'
                      }`}
                    >
                      <span>{randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}</span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${randomFirstPlayer ? 'bg-blue-500 text-white' : 'bg-white/10'}`}>
                        {randomFirstPlayer ? '✓' : ''}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-violet-200/90 leading-relaxed rounded-2xl bg-violet-600/10 border border-violet-400/25 p-3.5">
                    {t.allQuestionsHint} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                  </p>
                  <button
                    type="button"
                    onClick={() => setRandomFirstPlayer((v) => !v)}
                    className={`w-full h-12 px-4 rounded-2xl border text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                      randomFirstPlayer
                        ? 'bg-blue-600/20 border-blue-400/40 text-blue-200'
                        : 'bg-[#070B18] border-white/12 text-slate-400'
                    }`}
                  >
                    <span>{t.randomFirstPlayer}</span>
                    <span>{randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}</span>
                  </button>
                </div>
              )}

              {errorMsg && (
                <p className="text-sm text-rose-400 font-semibold">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-700/25 hover:brightness-110 active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t.creatingRoom}</span>
                  </>
                ) : (
                  <>
                    <span>{t.createRoomBtn}</span>
                    <ArrowRight className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-200">{t.roomCode}</label>
                <input
                  type="text"
                  maxLength={6}
                  dir="ltr"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder={t.roomCodePlaceholder}
                  className="w-full min-h-[54px] px-4 rounded-2xl bg-[#070B18] border border-white/15 focus:border-blue-500 focus:outline-none text-white placeholder:text-slate-600 font-mono-tabular text-2xl font-bold text-center tracking-[0.35em] uppercase"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-200">{t.yourName}</label>
                <input
                  type="text"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.yourNamePlaceholder}
                  className="w-full min-h-[48px] px-4 rounded-2xl bg-[#070B18] border border-white/15 focus:border-blue-500 focus:outline-none text-white placeholder:text-slate-500 text-base"
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-rose-400 font-semibold">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-700/25 hover:brightness-110 active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t.joiningRoom}</span>
                  </>
                ) : (
                  <>
                    <span>{t.joinRoomBtn}</span>
                    <ArrowRight className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
};
