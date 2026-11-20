import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Layers,
  Loader2,
  LogOut,
  Play,
  Share2,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  claimDisconnectedHost,
  getMaxRoundsForPlayers,
  kickPlayerFromLobby,
  leaveMultiplayerRoom,
  saveActiveRoom,
  setPlayerConnectionState,
  startOrRestartMultiplayerGame,
  subscribeToRoomAndPlayers,
  updateLobbySettings,
} from '../firebase/multiplayerService';
import type { RoomDoc, RoomPlayerDoc } from '../types/game';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';

export const OnlineLobbyScreen: React.FC = () => {
  const { language, t, soundEnabled, activeRoomCode, setActiveRoomCode, setScreen, authUser } =
    useApp();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Record<string, RoomPlayerDoc>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
        if (authUser && !nextRoom.playerOrder.includes(authUser.uid)) {
          saveActiveRoom(null);
          setActiveRoomCode(null);
          setScreen('online_entry');
          return;
        }
        setRoom(nextRoom);
        setPlayers(nextPlayers);

        if (nextRoom.status === 'playing' || nextRoom.status === 'finished' || nextRoom.status === 'exhausted') {
          setScreen('online_game');
        }
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
  }, [activeRoomCode, authUser, setActiveRoomCode, setScreen]);

  // Auto-clamp host roundsCount whenever players join so players x rounds <= 63
  useEffect(() => {
    if (!room || !authUser || room.hostId !== authUser.uid || room.status !== 'waiting') return;
    const maxRounds = getMaxRoundsForPlayers(room.playerOrder.length);
    if (room.gameMode === 'rounds' && room.roundsCount > maxRounds) {
      void updateLobbySettings(room.roomCode, { roundsCount: maxRounds });
    }
  }, [room, authUser]);

  if (loading || !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-300">{t.connectingAuth}</p>
      </div>
    );
  }

  const isHost = authUser?.uid === room.hostId;
  const hostPlayer = players[room.hostId];
  const hostDisconnected = hostPlayer ? !hostPlayer.connected : false;
  const canStart = room.playerOrder.length >= 2 && room.playerOrder.length <= 12;
  const maxRounds = getMaxRoundsForPlayers(room.playerOrder.length);
  const effectiveRounds = Math.min(maxRounds, room.roundsCount);

  const shareUrl = `${window.location.origin}/?room=${room.roomCode}`;

  const handleCopyCode = async () => {
    soundFX.tap(soundEnabled);
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShareRoom = async () => {
    soundFX.tap(soundEnabled);
    const text = `${t.shareMessage} ${room.roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: t.appTitle,
          text,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleStartGame = async () => {
    soundFX.cardDeal(soundEnabled);
    setStarting(true);
    setErrorMsg('');
    try {
      await startOrRestartMultiplayerGame(room.roomCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errGeneric);
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    soundFX.tap(soundEnabled);
    await leaveMultiplayerRoom(room.roomCode);
    setActiveRoomCode(null);
    setScreen('home');
  };

  return (
    <div className="flex-1 flex flex-col gap-6 pb-24">
      {/* Room Code Hero Card */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0F1734] via-[#0B1022] to-[#13112E] border border-blue-400/25 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 text-center md:text-start">
            <p className="text-xs sm:text-sm font-semibold text-blue-300">
              {t.lobbyTitle} · {t.shareCodePrompt}
            </p>
            <div
              dir="ltr"
              className="text-4xl sm:text-5xl font-mono-tabular font-extrabold tracking-[0.25em] text-white select-all"
            >
              {room.roomCode}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/8 hover:bg-white/15 border border-white/15 text-sm font-bold text-white flex items-center gap-2 transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-400" />}
              <span>{copied ? t.codeCopied : t.copyCode}</span>
            </button>

            <button
              type="button"
              onClick={handleShareRoom}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-blue-600/25 hover:bg-blue-600/35 border border-blue-400/35 text-sm font-bold text-blue-100 flex items-center gap-2 transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{t.shareRoom}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Two-Column Lobby Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Players List */}
        <section className="lg:col-span-7 rounded-3xl bg-[#0C1226]/95 border border-white/10 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
            <h2 className="text-lg font-bold text-white">{t.playersCountLabel}</h2>
            <span className="text-sm font-mono-tabular font-bold text-blue-300">
              {room.playerOrder.length} / 12
            </span>
          </div>

          <ul className="divide-y divide-white/8">
            {room.playerOrder.map((pid) => {
              const p = players[pid];
              if (!p) return null;
              const isMe = pid === authUser?.uid;
              return (
                <li key={pid} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="md" active={p.isHost} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">{p.name}</span>
                        {isMe && (
                          <span className="text-xs font-semibold text-blue-300">
                            ({t.youBadge})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        {p.isHost && (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                            <Crown className="w-3.5 h-3.5" />
                            {t.hostBadge}
                          </span>
                        )}
                        {p.isHost && <span aria-hidden="true">·</span>}
                        <span
                          className={`inline-flex items-center gap-1 ${
                            p.connected ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {p.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                          {p.connected ? t.connected : t.disconnected}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isHost && !isMe && (
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        void kickPlayerFromLobby(room.roomCode, pid);
                      }}
                      className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/15 border border-rose-500/20 flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.removePlayer}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {room.playerOrder.length < 2 && (
            <p className="text-xs sm:text-sm text-amber-300/90 pt-1">{t.minPlayersWarning}</p>
          )}
        </section>

        {/* Game Length & Match Settings */}
        <section className="lg:col-span-5 rounded-3xl bg-[#0C1226]/95 border border-white/10 p-5 sm:p-6 space-y-5">
          <div className="border-b border-white/8 pb-3">
            <h2 className="text-lg font-bold text-white">{t.gameSettingsTitle}</h2>
          </div>

          <div className="space-y-4">
            {/* Option A vs Option B */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">{t.gameLengthLabel}</span>
              {isHost ? (
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#070B18] border border-white/12">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      void updateLobbySettings(room.roomCode, {
                        gameMode: 'rounds',
                        roundsCount: effectiveRounds,
                      });
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      room.gameMode === 'rounds'
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
                      void updateLobbySettings(room.roomCode, { gameMode: 'all_questions' });
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      room.gameMode === 'all_questions'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.allQuestionsOption}</span>
                  </button>
                </div>
              ) : (
                <p className="text-sm font-bold text-blue-300">
                  {room.gameMode === 'all_questions' ? t.allQuestionsOption : t.roundsModeOption}
                </p>
              )}
            </div>

            {room.gameMode === 'rounds' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-200">{t.roundsLabel}</span>
                  <span className="font-mono-tabular font-bold text-blue-300">
                    {effectiveRounds} {t.roundUnit}
                  </span>
                </div>
                {isHost && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={effectiveRounds <= 1}
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        void updateLobbySettings(room.roomCode, {
                          roundsCount: Math.max(1, effectiveRounds - 1),
                        });
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-white/8 hover:bg-white/15 text-white font-bold disabled:opacity-35 cursor-pointer"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      disabled={effectiveRounds >= maxRounds}
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        void updateLobbySettings(room.roomCode, {
                          roundsCount: Math.min(maxRounds, effectiveRounds + 1),
                        });
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-white/8 hover:bg-white/15 text-white font-bold disabled:opacity-35 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400 tabular-nums">
                  {t.turnsTotalHint} {Math.max(2, room.playerOrder.length)} × {effectiveRounds} ={' '}
                  {Math.max(2, room.playerOrder.length) * effectiveRounds} / {TOTAL_QUESTIONS_COUNT}{' '}
                  {t.turnUnit} ({t.maxRoundsHint} {maxRounds})
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-violet-600/12 border border-violet-400/25 p-3.5 space-y-1">
                <p className="text-xs font-bold text-violet-200">
                  {t.allQuestionsOption} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">{t.allQuestionsHint}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 py-2 border-t border-white/8">
              <span className="text-sm font-semibold text-slate-200">{t.randomFirstPlayer}</span>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.tap(soundEnabled);
                    void updateLobbySettings(room.roomCode, {
                      randomFirstPlayer: !room.randomFirstPlayer,
                    });
                  }}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    room.randomFirstPlayer
                      ? 'bg-blue-600/25 border-blue-400/40 text-blue-200'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  {room.randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-400">
                  {room.randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
                </span>
              )}
            </div>

            {!isHost && hostDisconnected && (
              <button
                type="button"
                onClick={() => {
                  soundFX.tap(soundEnabled);
                  void claimDisconnectedHost(room.roomCode);
                }}
                className="w-full min-h-[44px] px-4 rounded-2xl bg-amber-500/15 border border-amber-400/35 text-amber-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{t.claimHost}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLeave}
              className="w-full min-h-[44px] px-4 rounded-2xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-200 text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.leaveRoom}</span>
            </button>
          </div>

          {errorMsg && <p className="text-sm text-rose-400 font-semibold">{errorMsg}</p>}
        </section>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#060913]/92 backdrop-blur-md border-t border-white/10 p-3 pb-safe">
        <div className="max-w-5xl mx-auto">
          {isHost ? (
            <button
              type="button"
              disabled={!canStart || starting}
              onClick={handleStartGame}
              className="w-full min-h-[50px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-700/30 hover:brightness-110 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {starting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              <span>{t.startGame}</span>
            </button>
          ) : (
            <div className="min-h-[46px] flex items-center justify-center text-sm font-semibold text-slate-300">
              {t.waitingForHost}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
