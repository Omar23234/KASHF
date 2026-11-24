import AsyncStorage from '@react-native-async-storage/async-storage';

export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ChatReplyReference {
  replyToMessageId: string;
  replyToSenderName: string;
  replyToPreviewText: string;
  replyToType: 'text' | 'voice';
}

export interface LocalSinglePhoneChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: 'text' | 'voice';
  audioUrl?: string;
  audioDurationSec?: number;
  audioMimeType?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreviewText?: string;
  replyToType?: 'text' | 'voice';
  createdAtMs: number;
}

export interface SinglePhoneReactionEntry {
  emoji: ReactionEmoji;
  userName: string;
}

export interface SinglePhoneChatStoreState {
  messages: LocalSinglePhoneChatMessage[];
  // messageId -> playerId -> reaction
  reactions: Record<string, Record<string, SinglePhoneReactionEntry>>;
}

const SINGLE_CHAT_STORAGE_KEY = 'mgk_rn_single_phone_chat_v1';
const MAX_LOCAL_MESSAGES = 80;

export function createEmptySinglePhoneChatState(): SinglePhoneChatStoreState {
  return {
    messages: [],
    reactions: {},
  };
}

export async function loadSinglePhoneChatState(): Promise<SinglePhoneChatStoreState> {
  try {
    const raw = await AsyncStorage.getItem(SINGLE_CHAT_STORAGE_KEY);
    if (!raw) return createEmptySinglePhoneChatState();
    const parsed = JSON.parse(raw) as Partial<SinglePhoneChatStoreState>;
    const rawMsgs = Array.isArray(parsed.messages) ? parsed.messages : [];
    const safeMsgs = rawMsgs
      .filter((m) => m && (m.messageType === 'text' || m.messageType === 'voice'))
      .slice(-MAX_LOCAL_MESSAGES);
    return {
      messages: safeMsgs,
      reactions:
        parsed.reactions && typeof parsed.reactions === 'object' ? parsed.reactions : {},
    };
  } catch {
    return createEmptySinglePhoneChatState();
  }
}

export async function persistSinglePhoneChatState(state: SinglePhoneChatStoreState): Promise<void> {
  try {
    await AsyncStorage.setItem(SINGLE_CHAT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    try {
      await AsyncStorage.setItem(
        SINGLE_CHAT_STORAGE_KEY,
        JSON.stringify({
          messages: state.messages.slice(-25),
          reactions: state.reactions,
        })
      );
    } catch {
      // ignore
    }
  }
}

function buildReplyFields(reply?: ChatReplyReference | null) {
  if (!reply) return {};
  return {
    replyToMessageId: reply.replyToMessageId,
    replyToSenderName: reply.replyToSenderName.slice(0, 24),
    replyToPreviewText: reply.replyToPreviewText.slice(0, 160),
    replyToType: reply.replyToType,
  };
}

export function appendSinglePhoneTextMessage(
  state: SinglePhoneChatStoreState,
  senderId: string,
  senderName: string,
  text: string,
  replyTo?: ChatReplyReference | null
): SinglePhoneChatStoreState {
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) return state;
  const msg: LocalSinglePhoneChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    senderId,
    senderName,
    text: cleanText,
    messageType: 'text',
    ...buildReplyFields(replyTo),
    createdAtMs: Date.now(),
  };
  return {
    ...state,
    messages: [...state.messages, msg].slice(-MAX_LOCAL_MESSAGES),
  };
}

export function appendSinglePhoneVoiceMessage(
  state: SinglePhoneChatStoreState,
  params: {
    senderId: string;
    senderName: string;
    audioUrl: string;
    audioDurationSec: number;
    audioMimeType: string;
    replyTo?: ChatReplyReference | null;
  }
): SinglePhoneChatStoreState {
  const safeDuration = Math.min(180, Math.max(1, Math.round(params.audioDurationSec)));
  const msg: LocalSinglePhoneChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    senderId: params.senderId,
    senderName: params.senderName,
    text: `[Voice ${safeDuration}s]`,
    messageType: 'voice',
    audioUrl: params.audioUrl,
    audioDurationSec: safeDuration,
    audioMimeType: params.audioMimeType,
    ...buildReplyFields(params.replyTo),
    createdAtMs: Date.now(),
  };
  return {
    ...state,
    messages: [...state.messages, msg].slice(-MAX_LOCAL_MESSAGES),
  };
}

export function toggleSinglePhoneReaction(
  state: SinglePhoneChatStoreState,
  params: {
    messageId: string;
    userId: string;
    userName: string;
    emoji: ReactionEmoji;
  }
): SinglePhoneChatStoreState {
  const existingForMsg = state.reactions[params.messageId] ?? {};
  const prevMine = existingForMsg[params.userId];
  const nextForMsg = { ...existingForMsg };

  if (prevMine && prevMine.emoji === params.emoji) {
    delete nextForMsg[params.userId];
  } else {
    nextForMsg[params.userId] = {
      emoji: params.emoji,
      userName: params.userName,
    };
  }

  return {
    ...state,
    reactions: {
      ...state.reactions,
      [params.messageId]: nextForMsg,
    },
  };
}
