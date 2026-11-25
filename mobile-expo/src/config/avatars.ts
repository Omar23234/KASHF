export const AVATAR_PALETTES = [
  { id: 'espresso', colors: ['#3A2B22', '#231A15'] as const, swatch: '#3A2B22' },
  { id: 'caramel', colors: ['#9A6840', '#744A2B'] as const, swatch: '#9A6840' },
  { id: 'walnut', colors: ['#6D5340', '#4E3A2C'] as const, swatch: '#6D5340' },
  { id: 'olive', colors: ['#686C4E', '#4D5038'] as const, swatch: '#686C4E' },
  { id: 'terracotta', colors: ['#9C5442', '#783D2F'] as const, swatch: '#9C5442' },
  { id: 'ochre', colors: ['#A5813C', '#7F6128'] as const, swatch: '#A5813C' },
  { id: 'taupe', colors: ['#7E6E60', '#5E5146'] as const, swatch: '#7E6E60' },
  { id: 'slatewarm', colors: ['#5B584E', '#413E37'] as const, swatch: '#5B584E' },
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

export function pickDefaultAvatar(seed: number | string): string {
  const h = hashSeed(seed);
  const selectable = AVATAR_CHARACTERS.filter((c) => c.id !== 'initials');
  const char = selectable[h % selectable.length].id;
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

export function getAvatarColors(raw?: string | null): readonly [string, string] {
  const parsed = parseAvatarSpec(raw);
  return AVATAR_PALETTES.find((p) => p.id === parsed.paletteId)?.colors ?? AVATAR_PALETTES[0].colors;
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
