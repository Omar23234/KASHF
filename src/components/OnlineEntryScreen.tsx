import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Layers, Loader2, PlusCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { pickDefaultAvatar } from '../config/brand';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  createMultiplayerRoom,
  ensureAnonymousAuth,
  getMaxRoundsForPlayers,
  getSavedActiveRoom,
  getSavedPlayerAvatar,
  getSavedPlayerName,
  joinMultiplayerRoom,
  saveActiveRoom,
  savePlayerAvatar,
} from '../firebase/multiplayerService';
import type { GameLengthMode } from '../types/game';
import { formatMultiplayerError } from '../utils/errorMessages';
import { soundFX } from '../utils/sound';
import { AvatarPickerModal } from './AvatarPickerModal';
import { PlayerAvatar } from './PlayerAvatar';

interface OnlineEntryScreenProps {
  initialRoomCode?: string;
}

export const OnlineEntryScreen: React.FC<OnlineEntryScreenProps> = ({ initialRoomCode = '' }) => {
  const { language, t, soundEnabled, setScreen, setActiveRoomCode, authUser } = useApp();
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [name, setName] = useState(() => getSavedPlayerName());
  const [avatarColor, setAvatarColor] = useState(
    () => getSavedPlayerAvatar() || pickDefaultAvatar(getSavedPlayerName() || 'player')
  );
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
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
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
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
        avatarColor,
        language,
        gameMode,
        roundsCount,
        randomFirstPlayer,
        soundEnabled,
      });
      setActiveRoomCode(code);
      setScreen('online_lobby');
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
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
        avatarColor,
      });
      setActiveRoomCode(res.roomCode);
      setScreen('online_lobby');
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
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
        avatarColor,
      });
      setActiveRoomCode(savedRoom);
      setScreen('online_lobby');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      if (raw === 'ROOM_NOT_FOUND' || raw === 'ROOM_CLOSED' || raw === 'ROOM_STARTED' || raw === 'ROOM_FULL') {
        saveActiveRoom(null);
        setSavedRoom(null);
      }
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="w-8 h-8 text-[#8B5E3C] animate-spin" />
        <p className="text-sm font-medium text-[#6E5E50]">{t.connectingAuth}</p>
      </div>
    );
  }

  if (anonDisabledError && !authUser) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border border-[#D7BD7B] p-6 sm:p-8 space-y-5 text-center shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#FBF5E4] border border-[#D7BD7B] flex items-center justify-center text-[#8C6820]">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#231A15]">{t.anonAuthRequiredTitle}</h2>
            <p className="text-sm text-[#5E4F43] leading-relaxed">{t.anonAuthRequiredDesc}</p>
          </div>
          <button
            type="button"
            onClick={() => void runSilentAuth()}
            className="w-full min-h-[48px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold flex items-center justify-center gap-2 transition cursor-pointer"
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#231A15]">{t.onlineModeTitle}</h1>
          <p className="text-sm text-[#6E5E50]">{t.playOnlineDesc}</p>
        </div>

        {savedRoom && (
          <div className="rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[#8B5E3C] font-bold">
                {language === 'ar' ? 'غرفة نشطة سابقة' : 'Previous Active Room'}
              </p>
              <p className="text-base font-mono-tabular font-extrabold text-[#231A15] tracking-wider">
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
                className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-[#6E5E50] hover:text-[#231A15] cursor-pointer"
              >
                {t.close}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleReconnectSaved}
                className="min-h-[40px] px-4 rounded-xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'رجوع للغرفة' : 'Reconnect'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Create / Join Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0]">
          <button
            type="button"
            onClick={() => {
              soundFX.tap(soundEnabled);
              setTab('create');
              setErrorMsg('');
            }}
            className={`min-h-[46px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              tab === 'create'
                ? 'bg-[#231A15] text-[#FBF7F0] shadow-xs'
                : 'text-[#6E5E50] hover:text-[#231A15]'
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
                ? 'bg-[#231A15] text-[#FBF7F0] shadow-xs'
                : 'text-[#6E5E50] hover:text-[#231A15]'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.joinRoom}</span>
          </button>
        </div>

        {/* Form Card */}
        <div className="rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-6 sm:p-8 shadow-[0_14px_32px_-16px_rgba(35,26,21,0.14)]">
          {tab === 'create' ? (
            <form onSubmit={handleCreateRoom} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#231A15]">{t.yourName}</label>
                <div className="flex items-center gap-3">
                  <PlayerAvatar
                    name={name || 'Player'}
                    paletteId={avatarColor}
                    size="lg"
                    editable
                    ariaLabel={t.chooseAvatarTitle}
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setAvatarModalOpen(true);
                    }}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      maxLength={24}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.yourNamePlaceholder}
                      className="w-full min-h-[48px] px-4 rounded-2xl bg-[#FBF7F0] border border-[#D5C7B2] focus:border-[#8B5E3C] focus:outline-none text-[#231A15] placeholder:text-[#9C8D7E] text-base"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        setAvatarModalOpen(true);
                      }}
                      className="text-xs font-bold text-[#8B5E3C] hover:text-[#231A15] cursor-pointer"
                    >
                      {t.chooseAvatarTitle} · {t.tapAvatarHint}
                    </button>
                  </div>
                </div>
              </div>

              {/* Game Length Selection: Rounds vs Play All Questions */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-[#6E5E50]">
                  {t.gameLengthLabel}
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0]">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setGameMode('rounds');
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                      gameMode === 'rounds'
                        ? 'bg-[#231A15] text-[#FBF7F0]'
                        : 'text-[#6E5E50] hover:text-[#231A15]'
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
                        ? 'bg-[#8B5E3C] text-[#FBF7F0]'
                        : 'text-[#6E5E50] hover:text-[#231A15]'
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
                    <label className="block text-xs font-bold text-[#6E5E50]">{t.roundsLabel}</label>
                    <div className="flex items-center justify-between h-12 px-3 rounded-2xl bg-[#FBF7F0] border border-[#D5C7B2]">
                      <button
                        type="button"
                        onClick={() => setRoundsCount((r) => Math.max(1, r - 1))}
                        className="w-9 h-9 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15] font-bold cursor-pointer"
                      >
                        −
                      </button>
                      <span className="font-mono-tabular font-bold text-[#231A15]">
                        {roundsCount} {t.roundUnit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRoundsCount((r) => Math.min(maxInitialRounds, r + 1))}
                        className="w-9 h-9 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15] font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#6E5E50]">
                      {t.randomFirstPlayer}
                    </label>
                    <button
                      type="button"
                      onClick={() => setRandomFirstPlayer((v) => !v)}
                      className={`w-full h-12 px-4 rounded-2xl border text-sm font-bold flex items-center justify-between transition cursor-pointer ${
                        randomFirstPlayer
                          ? 'bg-[#F3EBDD] border-[#8B5E3C] text-[#231A15]'
                          : 'bg-[#FBF7F0] border-[#D5C7B2] text-[#6E5E50]'
                      }`}
                    >
                      <span>{randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}</span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${randomFirstPlayer ? 'bg-[#231A15] text-[#FBF7F0]' : 'bg-[#DDD2C0]'}`}>
                        {randomFirstPlayer ? '✓' : ''}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-[#5E4F43] leading-relaxed rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] p-3.5">
                    {t.allQuestionsHint} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                  </p>
                  <button
                    type="button"
                    onClick={() => setRandomFirstPlayer((v) => !v)}
                    className={`w-full h-12 px-4 rounded-2xl border text-sm font-bold flex items-center justify-between transition cursor-pointer ${
                      randomFirstPlayer
                        ? 'bg-[#F3EBDD] border-[#8B5E3C] text-[#231A15]'
                        : 'bg-[#FBF7F0] border-[#D5C7B2] text-[#6E5E50]'
                    }`}
                  >
                    <span>{t.randomFirstPlayer}</span>
                    <span>{randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}</span>
                  </button>
                </div>
              )}

              {errorMsg && (
                <p className="text-sm text-[#9B3B30] font-bold">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
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
                <label className="block text-sm font-bold text-[#231A15]">{t.roomCode}</label>
                <input
                  type="text"
                  maxLength={6}
                  dir="ltr"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder={t.roomCodePlaceholder}
                  className="w-full min-h-[54px] px-4 rounded-2xl bg-[#FBF7F0] border border-[#D5C7B2] focus:border-[#8B5E3C] focus:outline-none text-[#231A15] placeholder:text-[#B5A594] font-mono-tabular text-2xl font-bold text-center tracking-[0.35em] uppercase"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#231A15]">{t.yourName}</label>
                <div className="flex items-center gap-3">
                  <PlayerAvatar
                    name={name || 'Player'}
                    paletteId={avatarColor}
                    size="lg"
                    editable
                    ariaLabel={t.chooseAvatarTitle}
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setAvatarModalOpen(true);
                    }}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      maxLength={24}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.yourNamePlaceholder}
                      className="w-full min-h-[48px] px-4 rounded-2xl bg-[#FBF7F0] border border-[#D5C7B2] focus:border-[#8B5E3C] focus:outline-none text-[#231A15] placeholder:text-[#9C8D7E] text-base"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        setAvatarModalOpen(true);
                      }}
                      className="text-xs font-bold text-[#8B5E3C] hover:text-[#231A15] cursor-pointer"
                    >
                      {t.chooseAvatarTitle} · {t.tapAvatarHint}
                    </button>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <p className="text-sm text-[#9B3B30] font-bold">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
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

      <AvatarPickerModal
        open={avatarModalOpen}
        playerName={name}
        initialAvatar={avatarColor}
        onClose={() => setAvatarModalOpen(false)}
        onSave={(nextAvatar) => {
          setAvatarColor(nextAvatar);
          savePlayerAvatar(nextAvatar);
        }}
      />
    </motion.div>
  );
};
