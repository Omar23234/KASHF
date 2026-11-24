import React, { useEffect, useState } from 'react';
import { Check, Edit3, Layers, Play, Plus, Trash2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { pickDefaultAvatar } from '../config/brand';
import { useApp } from '../context/AppContext';
import { TOTAL_QUESTIONS_COUNT } from '../data/questions';
import { getMaxRoundsForPlayers } from '../firebase/multiplayerService';
import type { GameLengthMode, SinglePhonePlayer } from '../types/game';
import { soundFX } from '../utils/sound';
import { AvatarPickerModal } from './AvatarPickerModal';
import { PlayerAvatar } from './PlayerAvatar';

interface SinglePhoneSetupScreenProps {
  players: SinglePhonePlayer[];
  setPlayers: React.Dispatch<React.SetStateAction<SinglePhonePlayer[]>>;
  gameMode: GameLengthMode;
  setGameMode: (m: GameLengthMode) => void;
  roundsCount: number;
  setRoundsCount: (n: number) => void;
  randomFirstPlayer: boolean;
  setRandomFirstPlayer: (val: boolean) => void;
  onStartGame: () => void;
}

export const SinglePhoneSetupScreen: React.FC<SinglePhoneSetupScreenProps> = ({
  players,
  setPlayers,
  gameMode,
  setGameMode,
  roundsCount,
  setRoundsCount,
  randomFirstPlayer,
  setRandomFirstPlayer,
  onStartGame,
}) => {
  const { language, t, soundEnabled } = useApp();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [avatarEditingPlayerId, setAvatarEditingPlayerId] = useState<string | null>(null);

  const maxRounds = getMaxRoundsForPlayers(players.length);

  useEffect(() => {
    if (roundsCount > maxRounds) {
      setRoundsCount(maxRounds);
    }
  }, [maxRounds, roundsCount, setRoundsCount]);

  const handleSetCount = (targetCount: number) => {
    soundFX.tap(soundEnabled);
    const clamped = Math.max(2, Math.min(12, targetCount));
    setPlayers((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) {
        return prev.slice(0, clamped);
      }
      const next = [...prev];
      while (next.length < clamped) {
        const num = next.length + 1;
        const id = `sp-${Date.now()}-${num}-${Math.random().toString(36).slice(2, 6)}`;
        next.push({
          id,
          name: language === 'ar' ? `لاعب ${num}` : `Player ${num}`,
          avatarColor: pickDefaultAvatar(num + id),
        });
      }
      return next;
    });
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.tap(soundEnabled);
    const clean = newName.trim().slice(0, 24);
    if (!clean) {
      setErrorMsg(t.errEnterName);
      return;
    }
    if (players.length >= 12) {
      setErrorMsg(t.errPlayerMinMax);
      return;
    }
    const id = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setPlayers((prev) => [
      ...prev,
      {
        id,
        name: clean,
        avatarColor: pickDefaultAvatar(clean + prev.length),
      },
    ]);
    setNewName('');
    setErrorMsg('');
  };

  const handleRemovePlayer = (id: string) => {
    soundFX.tap(soundEnabled);
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const startEdit = (p: SinglePhonePlayer) => {
    soundFX.tap(soundEnabled);
    setEditingId(p.id);
    setEditingText(p.name);
  };

  const saveEdit = (id: string) => {
    soundFX.tap(soundEnabled);
    const clean = editingText.trim().slice(0, 24);
    if (clean) {
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name: clean } : p)));
    }
    setEditingId(null);
  };

  const canStart = players.length >= 2 && players.length <= 12;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col gap-6 pb-24"
    >
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#231A15]">{t.singlePhoneTitle}</h1>
        <p className="text-sm text-[#6E5E50]">{t.singlePhoneSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Players Setup */}
        <section className="lg:col-span-7 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 sm:p-6 space-y-5 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DEC8] pb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#8B5E3C]" />
              <span className="font-bold text-[#231A15]">{t.playerCountSetup}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSetCount(players.length - 1)}
                disabled={players.length <= 2}
                className="w-10 h-10 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
              >
                −
              </button>
              <span className="min-w-[3.5rem] text-center font-mono-tabular font-extrabold text-[#8B5E3C] text-lg">
                {players.length} / 12
              </span>
              <button
                type="button"
                onClick={() => handleSetCount(players.length + 1)}
                disabled={players.length >= 12}
                className="w-10 h-10 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <form onSubmit={handleAddPlayer} className="flex gap-2.5">
            <input
              type="text"
              maxLength={24}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.addPlayerPlaceholder}
              className="flex-1 min-h-[46px] px-4 rounded-2xl bg-[#FBF7F0] border border-[#D5C7B2] focus:border-[#8B5E3C] focus:outline-none text-[#231A15] placeholder:text-[#9C8D7E] text-sm sm:text-base"
            />
            <button
              type="submit"
              disabled={players.length >= 12}
              className="min-h-[46px] px-5 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addPlayerBtn}</span>
            </button>
          </form>

          {errorMsg && <p className="text-sm text-[#9B3B30] font-bold">{errorMsg}</p>}

          <ul className="divide-y divide-[#EFE6D6]">
            {players.map((p, idx) => {
              const isEditing = editingId === p.id;
              return (
                <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-6 text-xs font-mono-tabular text-[#8B5E3C] font-bold shrink-0">
                      {idx + 1}.
                    </span>
                    <PlayerAvatar
                      name={p.name}
                      paletteId={p.avatarColor}
                      size="sm"
                      editable
                      ariaLabel={t.chooseAvatarTitle}
                      onClick={() => {
                        soundFX.tap(soundEnabled);
                        setAvatarEditingPlayerId(p.id);
                      }}
                    />
                    {isEditing ? (
                      <input
                        type="text"
                        maxLength={24}
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit(p.id);
                          }
                        }}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#FBF7F0] border border-[#8B5E3C] text-[#231A15] text-sm focus:outline-none"
                      />
                    ) : (
                      <span className="font-bold text-[#231A15] truncate">{p.name}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => saveEdit(p.id)}
                        className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-[#EEF3EC] border border-[#B9CEB3] text-[#355432] text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t.saveName}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E5E50] hover:text-[#231A15] hover:bg-[#EFE6D6] cursor-pointer"
                        aria-label={t.editName}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={players.length <= 2}
                      onClick={() => handleRemovePlayer(p.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E5E50] hover:text-[#9B3B30] hover:bg-[#F9EAE6] disabled:opacity-25 cursor-pointer"
                      aria-label={t.removePlayer}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Game Length & Match Settings */}
        <section className="lg:col-span-5 rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 sm:p-6 space-y-5 shadow-[0_8px_24px_-14px_rgba(35,26,21,0.1)]">
          <div className="border-b border-[#E8DEC8] pb-3">
            <h2 className="text-lg font-bold text-[#231A15]">{t.gameSettingsTitle}</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#6E5E50]">{t.gameLengthLabel}</span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F3EBDD] border border-[#DDD2C0]">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.tap(soundEnabled);
                    setGameMode('rounds');
                  }}
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
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
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#231A15]">{t.roundsLabel}</span>
                  <span className="font-mono-tabular font-bold text-[#8B5E3C]">
                    {roundsCount} {t.roundUnit}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={roundsCount <= 1}
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setRoundsCount(Math.max(1, roundsCount - 1));
                    }}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={roundsCount >= maxRounds}
                    onClick={() => {
                      soundFX.tap(soundEnabled);
                      setRoundsCount(Math.min(maxRounds, roundsCount + 1));
                    }}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold disabled:opacity-35 cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-[#6E5E50] tabular-nums">
                  {t.turnsTotalHint} {players.length} × {roundsCount} = {players.length * roundsCount} /{' '}
                  {TOTAL_QUESTIONS_COUNT} {t.turnUnit} ({t.maxRoundsHint} {maxRounds})
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

            <div className="flex items-center justify-between gap-4 py-3 border-t border-[#E8DEC8]">
              <span className="text-sm font-bold text-[#231A15]">{t.randomFirstPlayer}</span>
              <button
                type="button"
                onClick={() => {
                  soundFX.tap(soundEnabled);
                  setRandomFirstPlayer(!randomFirstPlayer);
                }}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  randomFirstPlayer
                    ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                    : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#6E5E50]'
                }`}
              >
                {randomFirstPlayer ? (language === 'ar' ? 'مفعّل' : 'On') : (language === 'ar' ? 'مغلق' : 'Off')}
              </button>
            </div>

            <p className="text-xs text-[#6E5E50] leading-relaxed border-t border-[#E8DEC8] pt-3">
              {t.ruleSingleBody}
            </p>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#F6EFE3]/95 backdrop-blur-md border-t border-[#DDD2C0] p-3 pb-safe">
        <div className="max-w-5xl mx-auto">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => {
              soundFX.cardDeal(soundEnabled);
              onStartGame();
            }}
            className="w-full min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-base flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-45"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{t.startGame}</span>
          </button>
        </div>
      </div>

      {(() => {
        const editingTarget = players.find((pl) => pl.id === avatarEditingPlayerId) ?? null;
        return (
          <AvatarPickerModal
            open={Boolean(editingTarget)}
            playerName={editingTarget?.name ?? ''}
            initialAvatar={editingTarget?.avatarColor ?? 'fox:espresso'}
            onClose={() => setAvatarEditingPlayerId(null)}
            onSave={(nextAvatar) => {
              if (!editingTarget) return;
              setPlayers((prev) =>
                prev.map((pl) => (pl.id === editingTarget.id ? { ...pl, avatarColor: nextAvatar } : pl))
              );
            }}
          />
        );
      })()}
    </motion.div>
  );
};
