export type EmojiCategoryId =
  | 'recent'
  | 'smileys'
  | 'laughing'
  | 'hearts'
  | 'celebrations'
  | 'animals'
  | 'food'
  | 'sports'
  | 'symbols';

export interface EmojiCategoryMeta {
  id: Exclude<EmojiCategoryId, 'recent'>;
  icon: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategoryMeta[] = [
  {
    id: 'smileys',
    icon: '😊',
    emojis: [
      '😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😌',
      '😍', '🥰', '😘', '😋', '😜', '🤪', '🤨', '🧐',
      '🤓', '😎', '🥳', '🤩', '😏', '😒', '🙄', '😬',
      '😳', '🥺', '😢', '😭', '😤', '😡', '🤯', '😴',
    ],
  },
  {
    id: 'laughing',
    icon: '😂',
    emojis: [
      '😂', '🤣', '😅', '😆', '😹', '🤭', '🫢', '🫣',
      '😱', '🙀', '😵', '🤐', '🤫', '🤥', '🤡', '💀',
      '☠️', '👀', '🤦', '🤷', '🙃', '🫠', '🫡', '🤠',
      '🙌', '👏', '🤝', '👍', '👎', '👌', '✌️', '🤞',
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '🫶', '🫂', '💐', '🌹', '🥀',
    ],
  },
  {
    id: 'celebrations',
    icon: '🎉',
    emojis: [
      '🎉', '🎊', '🥳', '🎈', '🎁', '🎀', '🎂', '🍰',
      '🥂', '🍾', '✨', '🌟', '⭐', '💫', '🔥', '👑',
      '🏆', '🥇', '🥈', '🥉', '🎖️', '🎯', '🎭', '🎤',
    ],
  },
  {
    id: 'animals',
    icon: '🦁',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
      '🙉', '🙊', '🐔', '🐧', '🦆', '🦉', '🦄', '🐝',
      '🦋', '🐢', '🐍', '🐬', '🐳', '🦈', '🐙', '🐪',
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    emojis: [
      '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙',
      '🧆', '🍗', '🍖', '🍝', '🍜', '🍣', '🍤', '🥐',
      '🥨', '🧀', '🥞', '🧇', '🍦', '🍩', '🍪', '🍫',
      '🍿', '☕', '🍵', '🧃', '🥤', '🧋', '🍉', '🍓',
    ],
  },
  {
    id: 'sports',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱',
      '🏓', '🏸', '🥊', '🥋', '⛳', '🏹', '🎣', '🛹',
      '🚴', '🏊', '🏋️', '🤸', '🎮', '🕹️', '🎲', '♟️',
    ],
  },
  {
    id: 'symbols',
    icon: '🔥',
    emojis: [
      '💯', '💢', '💥', '💫', '💦', '💨', '💬', '💭',
      '❓', '❔', '❗', '❕', '⁉️', '‼️', '✅', '❌',
      '⭕', '🛑', '⚡', '💎', '🔔', '🔕', '🔒', '🔓',
      '♠️', '♥️', '♦️', '♣️', '🃏', '🎵', '🎶', '⚠️',
    ],
  },
];

const RECENT_EMOJIS_KEY = 'mgk_recent_emojis_v1';
const MAX_RECENT_EMOJIS = 18;

export function loadRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, MAX_RECENT_EMOJIS);
    }
  } catch {
    // ignore
  }
  return [];
}

export function recordRecentEmoji(emoji: string): string[] {
  const clean = emoji.trim();
  if (!clean) return loadRecentEmojis();
  const prev = loadRecentEmojis().filter((item) => item !== clean);
  const next = [clean, ...prev].slice(0, MAX_RECENT_EMOJIS);
  try {
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function recordRecentEmojisFromText(text: string): string[] {
  const tokens = extractKnownEmojis(text);
  let latest = loadRecentEmojis();
  for (let i = tokens.length - 1; i >= 0; i--) {
    latest = recordRecentEmoji(tokens[i]);
  }
  return latest;
}

const KNOWN_EMOJI_SET = new Set<string>(
  EMOJI_CATEGORIES.flatMap((c) => c.emojis)
);

export function extractKnownEmojis(text: string): string[] {
  const found: string[] = [];
  for (const emoji of KNOWN_EMOJI_SET) {
    if (text.includes(emoji)) {
      found.push(emoji);
    }
  }
  return found;
}

/**
 * Returns true if the message contains only emojis (and whitespace) so chat bubbles
 * can render emojis large and prominent on mobile and desktop screens.
 */
export function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Strip whitespace
  const compact = trimmed.replace(/\s+/g, '');
  if (!compact) return false;

  // Reject ASCII alphanumeric / Arabic letters / standard punctuation
  if (/[A-Za-z0-9\u0600-\u06FF.,/#!$%^&*;:{}=\-_`~()؟،]/.test(compact)) {
    return false;
  }

  // Match Extended_Pictographic sequences (including variation selectors & ZWJ)
  try {
    const emojiPattern = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3|\p{Emoji_Component})+$/u;
    if (!emojiPattern.test(compact)) return false;
    // Count clusters so absurdly long strings stay readable
    const clusters = compact.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu);
    return Boolean(clusters && clusters.length >= 1 && clusters.length <= 10);
  } catch {
    // Fallback for engines without Unicode property escapes
    return Array.from(compact).every((ch) => KNOWN_EMOJI_SET.has(ch));
  }
}
