export const BRAND_CONFIG = {
  nameAr: 'من غير كلام',
  nameEn: 'Men Gheir Kalam',
  taglineAr: 'قعدة صراحة وأسئلة من القلب',
  taglineEn: 'Real talk. No filters.',
  iconUrl: '/app-icon.png',
} as const;

export const AVATAR_PALETTES = [
  { id: 'espresso', bg: 'from-[#3A2B22] to-[#231A15]', ring: 'ring-[#8B5E3C]/40' },
  { id: 'caramel', bg: 'from-[#9A6840] to-[#744A2B]', ring: 'ring-[#9A6840]/40' },
  { id: 'walnut', bg: 'from-[#6D5340] to-[#4E3A2C]', ring: 'ring-[#6D5340]/40' },
  { id: 'olive', bg: 'from-[#686C4E] to-[#4D5038]', ring: 'ring-[#686C4E]/40' },
  { id: 'terracotta', bg: 'from-[#9C5442] to-[#783D2F]', ring: 'ring-[#9C5442]/40' },
  { id: 'ochre', bg: 'from-[#A5813C] to-[#7F6128]', ring: 'ring-[#A5813C]/40' },
  { id: 'taupe', bg: 'from-[#7E6E60] to-[#5E5146]', ring: 'ring-[#7E6E60]/40' },
  { id: 'slatewarm', bg: 'from-[#5B584E] to-[#413E37]', ring: 'ring-[#5B584E]/40' },
] as const;

export function pickAvatarPalette(seed: number | string): string {
  if (typeof seed === 'number') {
    return AVATAR_PALETTES[Math.abs(seed) % AVATAR_PALETTES.length].id;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length].id;
}

export function getAvatarGradient(paletteId: string): string {
  return AVATAR_PALETTES.find((p) => p.id === paletteId)?.bg ?? AVATAR_PALETTES[0].bg;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
