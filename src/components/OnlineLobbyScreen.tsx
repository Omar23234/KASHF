import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Layers,
  Loader2,
  LogOut,
  Mic,
  MicOff,
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
  updateMyLobbyAvatar,
} from '../firebase/multiplayerService';
import { useVoiceChat } from '../context/VoiceContext';
import type { RoomDoc, RoomPlayerDoc } from '../types/game';
import { formatMultiplayerError } from '../utils/errorMessages';
import { soundFX } from '../utils/sound';
import { AvatarPickerModal } from './AvatarPickerModal';
import { PlayerAvatar } from './PlayerAvatar';
import { RoomChatVoicePanel } from './RoomChatVoicePanel';

export const OnlineLobbyScreen: React.FC = () => {
  const { language, t, soundEnabled, activeRoomCode, setActiveRoomCode, setScreen, authUser } =
    useApp();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Record<string, RoomPlayerDoc>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const lastClampedRef = useRef<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const voice = useVoiceChat();
  const { setVoiceRoomMeta, clearVoiceRoomMeta } = voice;

  useEffect(() => {
    setVoiceRoomMeta({
      roomCode: activeRoomCode,
      myUid: authUser?.uid ?? '',
      players,
      playerOrder: room?.playerOrder ?? [],
    });
  }, [activeRoomCode, authUser?.uid, players, room?.playerOrder, setVoiceRoomMeta]);

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
        setRoom(nextRoom);
        setPlayers(nextPlayers);

        if (nextRoom.status === 'playing' || nextRoom.status === 'finished' || nextRoom.status === 'exhausted') {
          setScreen('online_game');
        }
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

  // Auto-clamp host roundsCount whenever players join so players x rounds <= 63
  useEffect(() => {
    if (!room || !authUser || room.hostId !== authUser.uid || room.status !== 'waiting') return;
    const maxRounds = getMaxRoundsForPlayers(room.playerOrder.length);
    const clampKey = `${room.roomCode}:${maxRounds}`;
    if (room.gameMode === 'rounds' && room.roundsCount > maxRounds) {
      if (lastClampedRef.current === clampKey) return;
      lastClampedRef.current = clampKey;
      void updateLobbySettings(room.roomCode, { roundsCount: maxRounds }).catch((err) =>
        setErrorMsg(formatMultiplayerError(err, tRef.current))
      );
    } else {
      lastClampedRef.current = null;
    }
  }, [room, authUser]);

  if (loading || !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="w-8 h-8 text-[#8B5E3C] animate-spin" />
        <p className="text-sm font-medium text-[#6E5E50]">{t.connectingAuth}</p>
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
      setErrorMsg(formatMultiplayerError(err, t));
    } finally {
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    soundFX.tap(soundEnabled);
    try {
      await voice.leaveVoice();
      clearVoiceRoomMeta();
      await leaveMultiplayerRoom(room.roomCode);
    } catch {
      clearVoiceRoomMeta();
      // still exit room locally if disconnect already happened
    } finally {
      setActiveRoomCode(null);
      setScreen('home');
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 pb-24">
      {/* Room Code Hero Card */}
      <section className="rounded-3xl bg-[#FFFDF9] border-2 border-[#D5C7B2] p-6 sm:p-8 shadow-[0_12px_30px_-14px_rgba(35,26,21,0.14)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 text-center md:text-start">
            <p className="text-xs sm:text-sm font-bold text-[#8B5E3C]">
              {t.lobbyTitle} · {t.shareCodePrompt}
            </p>
            <div
              dir="ltr"
              className="text-4xl sm:text-5xl font-mono-tabular font-extrabold tracking-[0.25em] text-[#231A15] select-all"
            >
              {room.roomCode}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-sm font-bold text-[#231A15] flex items-center gap-2 transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-[#4A6B46]" /> : <Copy className="w-4 h-4 text-[#8B5E3C]" />}
              <span>{copied ? t.codeCopied : t.copyCode}</span>
            </button>

            <button
              type="button"
              onClick={handleShareRoom}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-sm font-bold text-[#FBF7F0] flex items-center gap-2 transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{t.shareRoom}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Live Voice & Text Chat Bar */}
      <RoomChatVoicePanel
        roomCode={room.roomCode}
        myUid={authUser?.uid ?? ''}
        myName={players[authUser?.uid ?? '']?.name ?? ''}
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

      {/* Two-Column Lobby Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Players List */}
        <section className="lg:col-span-7 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 sm:p-6 space-y-4 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex items-center justify-between gap-4 border-b border-[#E8DEC8] pb-3">
            <h2 className="text-lg font-bold text-[#231A15]">{t.playersCountLabel}</h2>
            <span className="text-sm font-mono-tabular font-extrabold text-[#8B5E3C]">
              {room.playerOrder.length} / 12
            </span>
          </div>

          <ul className="divide-y divide-[#EFE6D6]">
            {room.playerOrder.map((pid) => {
              const p = players[pid];
              if (!p) return null;
              const isMe = pid === authUser?.uid;
              const isSpeaking = Boolean(voice.speakingUids[pid]);
              return (
                <li key={pid} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar
                      name={p.name}
                      paletteId={p.avatarColor}
                      size="md"
                      active={p.isHost || isSpeaking}
                      editable={isMe}
                      ariaLabel={isMe ? t.chooseAvatarTitle : undefined}
                      onClick={
                        isMe
                          ? () => {
                              soundFX.tap(soundEnabled);
                              setAvatarPickerOpen(true);
                            }
                          : undefined
                      }
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#231A15] truncate">{p.name}</span>
                        {isMe && (
                          <span className="text-xs font-bold text-[#8B5E3C]">
                            ({t.youBadge})
                          </span>
                        )}
                        {p.voiceJoined && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                              p.micMuted
                                ? 'bg-[#F9EAE6] border-[#D9A79D] text-[#9B3B30]'
                                : isSpeaking
                                  ? 'bg-[#EEF3EC] border-[#96B590] text-[#355432]'
                                  : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#6E5E50]'
                            }`}
                          >
                            {p.micMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                            {p.micMuted ? t.micMutedLabel : isSpeaking ? t.speakingLabel : t.micLiveLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#6E5E50] mt-0.5">
                        {p.isHost && (
                          <span className="inline-flex items-center gap-1 text-[#8C6820] font-bold">
                            <Crown className="w-3.5 h-3.5" />
                            {t.hostBadge}
                          </span>
                        )}
                        {p.isHost && <span aria-hidden="true">·</span>}
                        <span
                          className={`inline-flex items-center gap-1 ${
                            p.connected ? 'text-[#4A6B46] font-semibold' : 'text-[#9C8D7E]'
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
                        setErrorMsg('');
                        void kickPlayerFromLobby(room.roomCode, pid).catch((err) =>
                          setErrorMsg(formatMultiplayerError(err, t))
                        );
                      }}
                      className="min-h-[40px] px-3 rounded-xl text-xs font-bold text-[#9B3B30] hover:bg-[#F9EAE6] border border-[#E2BDB5] flex items-center gap-1.5 transition cursor-pointer shrink-0"
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
            <p className="text-xs sm:text-sm text-[#8C6820] font-semibold pt-1">{t.minPlayersWarning}</p>
          )}
        </section>

        {/* Game Length & Match Settings */}
        <section className="lg:col-span-5 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 sm:p-6 space-y-5 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="border-b border-[#E8DEC8] pb-3">
            <h2 className="text-lg font-bold text-[#231A15]">{t.gameSettingsTitle}</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#6E5E50]">{t.gameLengthLabel}</span>
              {isHost ? (
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0]">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setErrorMsg('');
                      void updateLobbySettings(room.roomCode, {
                        gameMode: 'rounds',
                        roundsCount: effectiveRounds,
                      }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      room.gameMode === 'rounds'
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
                      setErrorMsg('');
                      void updateLobbySettings(room.roomCode, { gameMode: 'all_questions' }).catch(
                        (err) => setErrorMsg(formatMultiplayerError(err, t))
                      );
                    }}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      room.gameMode === 'all_questions'
                        ? 'bg-[#8B5E3C] text-[#FBF7F0]'
                        : 'text-[#6E5E50] hover:text-[#231A15]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.allQuestionsOption}</span>
                  </button>
                </div>
              ) : (
                <p className="text-sm font-bold text-[#8B5E3C]">
                  {room.gameMode === 'all_questions' ? t.allQuestionsOption : t.roundsModeOption}
                </p>
              )}
            </div>

            {room.gameMode === 'rounds' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#231A15]">{t.roundsLabel}</span>
                  <span className="font-mono-tabular font-bold text-[#8B5E3C]">
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
                        setErrorMsg('');
                        void updateLobbySettings(room.roomCode, {
                          roundsCount: Math.max(1, effectiveRounds - 1),
                        }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      disabled={effectiveRounds >= maxRounds}
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        setErrorMsg('');
                        void updateLobbySettings(room.roomCode, {
                          roundsCount: Math.min(maxRounds, effectiveRounds + 1),
                        }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                )}
                <p className="text-xs text-[#6E5E50] tabular-nums">
                  {t.turnsTotalHint} {Math.max(2, room.playerOrder.length)} × {effectiveRounds} ={' '}
                  {Math.max(2, room.playerOrder.length) * effectiveRounds} / {TOTAL_QUESTIONS_COUNT}{' '}
                  {t.turnUnit} ({t.maxRoundsHint} {maxRounds})
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] p-3.5 space-y-1">
                <p className="text-xs font-bold text-[#231A15]">
                  {t.allQuestionsOption} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                </p>
                <p className="text-xs text-[#5E4F43] leading-relaxed">{t.allQuestionsHint}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 py-2 border-t border-[#E8DEC8]">
              <span className="text-sm font-bold text-[#231A15]">{t.randomFirstPlayer}</span>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.tap(soundEnabled);
                    setErrorMsg('');
                    void updateLobbySettings(room.roomCode, {
                      randomFirstPlayer: !room.randomFirstPlayer,
                    }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                  }}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    room.randomFirstPlayer
                      ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                      : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#6E5E50]'
                  }`}
                >
                  {room.randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
                </button>
              ) : (
                <span className="text-xs font-bold text-[#6E5E50]">
                  {room.randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
                </span>
              )}
            </div>

            {!isHost && hostDisconnected && (
              <button
                type="button"
                onClick={() => {
                  soundFX.tap(soundEnabled);
                  setErrorMsg('');
                  void claimDisconnectedHost(room.roomCode).catch((err) =>
                    setErrorMsg(formatMultiplayerError(err, t))
                  );
                }}
                className="w-full min-h-[44px] px-4 rounded-2xl bg-[#FBF5E4] border border-[#D7BD7B] text-[#7D5D18] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{t.claimHost}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLeave}
              className="w-full min-h-[44px] px-4 rounded-2xl bg-[#EFE6D6] hover:bg-[#F9EAE6] border border-[#D5C7B2] hover:border-[#C88172] text-[#5E4F43] hover:text-[#9B3B30] text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.leaveRoom}</span>
            </button>
          </div>

          {errorMsg && <p className="text-sm text-[#9B3B30] font-bold">{errorMsg}</p>}
        </section>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#F6EFE3]/95 backdrop-blur-md border-t border-[#DDD2C0] p-3 pb-safe">
        <div className="max-w-5xl mx-auto">
          {isHost ? (
            <button
              type="button"
              disabled={!canStart || starting}
              onClick={handleStartGame}
              className="w-full min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-base flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {starting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              <span>{t.startGame}</span>
            </button>
          ) : (
            <div className="min-h-[46px] flex items-center justify-center text-sm font-bold text-[#6E5E50]">
              {t.waitingForHost}
            </div>
          )}
        </div>
      </div>

      <AvatarPickerModal
        open={avatarPickerOpen}
        playerName={players[authUser?.uid ?? '']?.name ?? ''}
        initialAvatar={players[authUser?.uid ?? '']?.avatarColor ?? 'fox:espresso'}
        onClose={() => setAvatarPickerOpen(false)}
        onSave={async (nextAvatar) => {
          setErrorMsg('');
          try {
            await updateMyLobbyAvatar(room.roomCode, nextAvatar);
          } catch (err) {
            setErrorMsg(formatMultiplayerError(err, t));
          }
        }}
      />
    </div>
  );
};
