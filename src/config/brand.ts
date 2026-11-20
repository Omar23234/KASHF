export const BRAND_CONFIG = {
  nameAr: 'كَشْف',
  nameEn: 'KASHF',
  taglineAr: 'قعدة صراحة وأسئلة من القلب',
  taglineEn: 'Real talk. No filters.',
  emblemImage: '/src/assets/images/kashf_app_emblem_1795176439493.jpg',
  backdropImage: '/src/assets/images/kashf_party_backdrop_1795176440755.jpg',
  cardTextureImage: '/src/assets/images/kashf_card_texture_1795176440153.jpg',
} as const;

export const AVATAR_PALETTES = [
  { id: 'electric', bg: 'from-blue-600 to-indigo-600', ring: 'ring-blue-400/40' },
  { id: 'violet', bg: 'from-violet-600 to-purple-700', ring: 'ring-violet-400/40' },
  { id: 'cobalt', bg: 'from-sky-500 to-blue-700', ring: 'ring-sky-400/40' },
  { id: 'magenta', bg: 'from-fuchsia-600 to-purple-700', ring: 'ring-fuchsia-400/40' },
  { id: 'cyan', bg: 'from-cyan-500 to-blue-600', ring: 'ring-cyan-400/40' },
  { id: 'emerald', bg: 'from-emerald-500 to-teal-700', ring: 'ring-emerald-400/40' },
  { id: 'amber', bg: 'from-amber-500 to-orange-600', ring: 'ring-amber-400/40' },
  { id: 'rose', bg: 'from-rose-500 to-pink-700', ring: 'ring-rose-400/40' },
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
