import AsyncStorage from '@react-native-async-storage/async-storage';

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

const RECENT_EMOJIS_KEY = 'mgk_rn_recent_emojis_v1';
const MAX_RECENT_EMOJIS = 18;

export async function loadRecentEmojis(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_EMOJIS_KEY);
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

export async function saveRecentEmojis(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_EMOJIS)));
  } catch {
    // ignore
  }
}

export function mergeRecentEmoji(prev: string[], emoji: string): string[] {
  const clean = emoji.trim();
  if (!clean) return prev;
  return [clean, ...prev.filter((item) => item !== clean)].slice(0, MAX_RECENT_EMOJIS);
}

export function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/\s+/g, '');
  if (!compact) return false;
  if (/[A-Za-z0-9\u0600-\u06FF.,/#!$%^&*;:{}=\-_`~()؟،]/.test(compact)) {
    return false;
  }
  try {
    const emojiPattern = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3|\p{Emoji_Component})+$/u;
    if (!emojiPattern.test(compact)) return false;
    const clusters = compact.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu);
    return Boolean(clusters && clusters.length >= 1 && clusters.length <= 10);
  } catch {
    return compact.length <= 16;
  }
}
