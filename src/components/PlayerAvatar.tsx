import React from 'react';
import { Pencil } from 'lucide-react';
import {
  getAvatarCharacterEmoji,
  getAvatarGradient,
  getInitials,
  parseAvatarSpec,
} from '../config/brand';

interface PlayerAvatarProps {
  name: string;
  paletteId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
  onClick?: () => void;
  editable?: boolean;
  ariaLabel?: string;
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 rounded-xl text-[11px]',
  sm: 'w-9 h-9 rounded-2xl text-xs',
  md: 'w-11 h-11 rounded-2xl text-sm',
  lg: 'w-14 h-14 rounded-2xl text-base',
  xl: 'w-20 h-20 rounded-3xl text-2xl',
};

const EMOJI_SIZE_CLASSES = {
  xs: 'text-sm leading-none',
  sm: 'text-lg leading-none',
  md: 'text-2xl leading-none',
  lg: 'text-3xl leading-none',
  xl: 'text-4xl leading-none',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  paletteId,
  size = 'md',
  active = false,
  onClick,
  editable = false,
  ariaLabel,
}) => {
  const { characterId } = parseAvatarSpec(paletteId);
  const emoji = getAvatarCharacterEmoji(characterId);
  const gradient = getAvatarGradient(paletteId);
  const initials = getInitials(name);

  const classes = `relative shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-[#FFFDF9] shadow-sm transition-transform duration-200 ${
    SIZE_CLASSES[size]
  } ${
    active
      ? 'ring-2 ring-[#8B5E3C] ring-offset-2 ring-offset-[#FBF7F0] scale-105'
      : 'border border-[#231A15]/15'
  } ${onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : ''}`;

  const content = (
    <>
      {emoji ? (
        <span className={`select-none ${EMOJI_SIZE_CLASSES[size]}`} aria-hidden="true">
          {emoji}
        </span>
      ) : (
        <span className="tracking-tight select-none">{initials}</span>
      )}
      {editable && (
        <span className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-[#231A15] text-[#FFFDF9] border border-[#FFFDF9] flex items-center justify-center shadow-xs">
          <Pencil className="w-2.5 h-2.5" />
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
};
