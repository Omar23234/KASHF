import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  AVATAR_CHARACTERS,
  AVATAR_PALETTES,
  formatAvatarSpec,
  parseAvatarSpec,
  type AvatarCharacterId,
  type AvatarPaletteId,
} from '../config/brand';
import { useApp } from '../context/AppContext';
import { soundFX } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';

interface AvatarPickerModalProps {
  open: boolean;
  playerName: string;
  initialAvatar: string;
  onClose: () => void;
  onSave: (nextAvatar: string) => void | Promise<void>;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  open,
  playerName,
  initialAvatar,
  onClose,
  onSave,
}) => {
  const { language, t, soundEnabled } = useApp();
  const initialParsed = parseAvatarSpec(initialAvatar);
  const [selectedChar, setSelectedChar] = useState<AvatarCharacterId>(initialParsed.characterId);
  const [selectedPalette, setSelectedPalette] = useState<AvatarPaletteId>(initialParsed.paletteId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parsed = parseAvatarSpec(initialAvatar);
    setSelectedChar(parsed.characterId);
    setSelectedPalette(parsed.paletteId);
  }, [open, initialAvatar]);

  if (!open) return null;

  const previewSpec = formatAvatarSpec(selectedChar, selectedPalette);

  const handleConfirm = async () => {
    soundFX.tap(soundEnabled);
    setSaving(true);
    try {
      await onSave(previewSpec);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#231A15]/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border border-[#DDD2C0] p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-[#231A15]">{t.chooseAvatarTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-9 h-9 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Preview */}
        <div className="flex flex-col items-center gap-2 py-2">
          <PlayerAvatar name={playerName || 'Player'} paletteId={previewSpec} size="xl" active />
          <span className="text-sm font-bold text-[#231A15]">
            {playerName.trim() || t.yourNamePlaceholder}
          </span>
        </div>

        {/* Characters Grid */}
        <div className="space-y-2">
          <span className="block text-xs font-bold text-[#6E5E50]">{t.avatarCharacterLabel}</span>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
            {AVATAR_CHARACTERS.map((ch) => {
              const active = selectedChar === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  title={language === 'ar' ? ch.labelAr : ch.labelEn}
                  onClick={() => {
                    soundFX.tap(soundEnabled);
                    setSelectedChar(ch.id);
                  }}
                  className={`min-h-[46px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                    active
                      ? 'bg-[#231A15] border-[#231A15] text-[#FFFDF9] shadow-sm scale-105'
                      : 'bg-[#FBF7F0] border-[#DDD2C0] text-[#231A15] hover:bg-[#F3EBDD]'
                  }`}
                >
                  <span className="text-xl leading-none">{ch.emoji}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Palettes */}
        <div className="space-y-2">
          <span className="block text-xs font-bold text-[#6E5E50]">{t.avatarColorLabel}</span>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
            {AVATAR_PALETTES.map((pal) => {
              const active = selectedPalette === pal.id;
              return (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => {
                    soundFX.tap(soundEnabled);
                    setSelectedPalette(pal.id);
                  }}
                  className={`h-10 rounded-xl bg-gradient-to-br ${pal.bg} flex items-center justify-center transition cursor-pointer ${
                    active
                      ? 'ring-2 ring-[#231A15] ring-offset-2 ring-offset-[#FFFDF9] scale-105'
                      : 'border border-[#231A15]/15 hover:scale-105'
                  }`}
                >
                  {active && <Check className="w-4 h-4 text-[#FFFDF9]" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[46px] rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15] font-bold text-sm cursor-pointer"
          >
            {t.close}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="flex-[2] min-h-[46px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{t.saveAvatarBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
