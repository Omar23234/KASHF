import React from 'react';
import { getAvatarGradient, getInitials } from '../config/brand';

interface PlayerAvatarProps {
  name: string;
  paletteId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-2xl',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  paletteId,
  size = 'md',
  active = false,
}) => {
  const gradient = getAvatarGradient(paletteId);
  const initials = getInitials(name);

  return (
    <div
      className={`relative shrink-0 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-lg transition-transform duration-200 ${
        SIZE_CLASSES[size]
      } ${active ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-[#080C1B] scale-105' : 'border border-white/15'}`}
    >
      <span className="tracking-tight select-none">{initials}</span>
    </div>
  );
};
