export const BRAND_CONFIG = {
  nameAr: 'من غير كلام',
  nameEn: 'Men Gheir Kalam',
  taglineAr: 'قعدة صراحة وأسئلة من القلب',
  taglineEn: 'Real talk. No filters.',
  iconUrl: '/app-icon.png',
} as const;

export const AVATAR_PALETTES = [
  { id: 'espresso', bg: 'from-[#3A2B22] to-[#231A15]', ring: 'ring-[#8B5E3C]/40', swatch: '#3A2B22' },
  { id: 'caramel', bg: 'from-[#9A6840] to-[#744A2B]', ring: 'ring-[#9A6840]/40', swatch: '#9A6840' },
  { id: 'walnut', bg: 'from-[#6D5340] to-[#4E3A2C]', ring: 'ring-[#6D5340]/40', swatch: '#6D5340' },
  { id: 'olive', bg: 'from-[#686C4E] to-[#4D5038]', ring: 'ring-[#686C4E]/40', swatch: '#686C4E' },
  { id: 'terracotta', bg: 'from-[#9C5442] to-[#783D2F]', ring: 'ring-[#9C5442]/40', swatch: '#9C5442' },
  { id: 'ochre', bg: 'from-[#A5813C] to-[#7F6128]', ring: 'ring-[#A5813C]/40', swatch: '#A5813C' },
  { id: 'taupe', bg: 'from-[#7E6E60] to-[#5E5146]', ring: 'ring-[#7E6E60]/40', swatch: '#7E6E60' },
  { id: 'slatewarm', bg: 'from-[#5B584E] to-[#413E37]', ring: 'ring-[#5B584E]/40', swatch: '#5B584E' },
] as const;

export const AVATAR_CHARACTERS = [
  { id: 'fox', emoji: '🦊', labelAr: 'ثعلب', labelEn: 'Fox' },
  { id: 'lion', emoji: '🦁', labelAr: 'أسد', labelEn: 'Lion' },
  { id: 'cat', emoji: '🐱', labelAr: 'قط', labelEn: 'Cat' },
  { id: 'owl', emoji: '🦉', labelAr: 'بومة', labelEn: 'Owl' },
  { id: 'panda', emoji: '🐼', labelAr: 'باندا', labelEn: 'Panda' },
  { id: 'bear', emoji: '🐻', labelAr: 'دب', labelEn: 'Bear' },
  { id: 'wolf', emoji: '🐺', labelAr: 'ذئب', labelEn: 'Wolf' },
  { id: 'tiger', emoji: '🐯', labelAr: 'نمر', labelEn: 'Tiger' },
  { id: 'dog', emoji: '🐶', labelAr: 'كلب', labelEn: 'Dog' },
  { id: 'rabbit', emoji: '🐰', labelAr: 'أرنب', labelEn: 'Rabbit' },
  { id: 'koala', emoji: '🐨', labelAr: 'كوالا', labelEn: 'Koala' },
  { id: 'monkey', emoji: '🐵', labelAr: 'قرد', labelEn: 'Monkey' },
  { id: 'frog', emoji: '🐸', labelAr: 'ضفدع', labelEn: 'Frog' },
  { id: 'duck', emoji: '🦆', labelAr: 'بطة', labelEn: 'Duck' },
  { id: 'penguin', emoji: '🐧', labelAr: 'بطريق', labelEn: 'Penguin' },
  { id: 'eagle', emoji: '🦅', labelAr: 'نسر', labelEn: 'Eagle' },
  { id: 'unicorn', emoji: '🦄', labelAr: 'يونيكورن', labelEn: 'Unicorn' },
  { id: 'dragon', emoji: '🐉', labelAr: 'تنين', labelEn: 'Dragon' },
  { id: 'shark', emoji: '🦈', labelAr: 'قرش', labelEn: 'Shark' },
  { id: 'dolphin', emoji: '🐬', labelAr: 'دولفين', labelEn: 'Dolphin' },
  { id: 'octopus', emoji: '🐙', labelAr: 'أخطبوط', labelEn: 'Octopus' },
  { id: 'deer', emoji: '🦌', labelAr: 'غزال', labelEn: 'Deer' },
  { id: 'camel', emoji: '🐪', labelAr: 'جمل', labelEn: 'Camel' },
  { id: 'butterfly', emoji: '🦋', labelAr: 'فراشة', labelEn: 'Butterfly' },
  { id: 'crown', emoji: '👑', labelAr: 'تاج', labelEn: 'Crown' },
  { id: 'cool', emoji: '😎', labelAr: 'رايق', labelEn: 'Cool' },
  { id: 'bot', emoji: '🤖', labelAr: 'روبوت', labelEn: 'Robot' },
  { id: 'alien', emoji: '👽', labelAr: 'فضائي', labelEn: 'Alien' },
  { id: 'wizard', emoji: '🧙', labelAr: 'ساحر', labelEn: 'Wizard' },
  { id: 'sleuth', emoji: '🕵️', labelAr: 'محقق', labelEn: 'Sleuth' },
  { id: 'initials', emoji: '🔤', labelAr: 'الحروف', labelEn: 'Initials' },
] as const;

export type AvatarPaletteId = (typeof AVATAR_PALETTES)[number]['id'];
export type AvatarCharacterId = (typeof AVATAR_CHARACTERS)[number]['id'];

const LEGACY_PALETTE_MAP: Record<string, AvatarPaletteId> = {
  electric: 'espresso',
  violet: 'terracotta',
  cobalt: 'slatewarm',
  magenta: 'caramel',
  cyan: 'olive',
  emerald: 'olive',
  amber: 'ochre',
  rose: 'terracotta',
};

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return Math.abs(seed);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickAvatarPalette(seed: number | string): AvatarPaletteId {
  return AVATAR_PALETTES[hashSeed(seed) % AVATAR_PALETTES.length].id;
}

export function pickDefaultAvatar(seed: number | string): string {
  const h = hashSeed(seed);
  const selectableChars = AVATAR_CHARACTERS.filter((c) => c.id !== 'initials');
  const char = selectableChars[h % selectableChars.length].id;
  const palette = AVATAR_PALETTES[Math.floor(h / 3) % AVATAR_PALETTES.length].id;
  return `${char}:${palette}`;
}

export function formatAvatarSpec(characterId: AvatarCharacterId, paletteId: AvatarPaletteId): string {
  const candidate = `${characterId}:${paletteId}`;
  return candidate.length <= 24 ? candidate : `${characterId}:espresso`.slice(0, 24);
}

export function parseAvatarSpec(raw?: string | null): {
  characterId: AvatarCharacterId;
  paletteId: AvatarPaletteId;
} {
  const clean = (raw ?? '').trim();
  const [partA, partB] = clean.includes(':') ? clean.split(':', 2) : ['initials', clean];
  const validChar = AVATAR_CHARACTERS.find((c) => c.id === partA)?.id ?? 'initials';
  const mappedPalette = LEGACY_PALETTE_MAP[partB] ?? partB;
  const validPalette = AVATAR_PALETTES.find((p) => p.id === mappedPalette)?.id ?? AVATAR_PALETTES[0].id;
  return { characterId: validChar, paletteId: validPalette };
}

export function getAvatarCharacterEmoji(characterId: AvatarCharacterId): string | null {
  if (characterId === 'initials') return null;
  return AVATAR_CHARACTERS.find((c) => c.id === characterId)?.emoji ?? null;
}

export function getAvatarGradient(paletteId: string): string {
  const parsed = parseAvatarSpec(paletteId);
  return AVATAR_PALETTES.find((p) => p.id === parsed.paletteId)?.bg ?? AVATAR_PALETTES[0].bg;
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
