import type { ChatReplyReference, ReactionEmoji } from '../types/game';

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

const SINGLE_CHAT_STORAGE_KEY = 'mgk_single_phone_chat_v1';
const MAX_LOCAL_MESSAGES = 80;

export function createEmptySinglePhoneChatState(): SinglePhoneChatStoreState {
  return {
    messages: [],
    reactions: {},
  };
}

export function loadSinglePhoneChatState(): SinglePhoneChatStoreState {
  try {
    const raw = localStorage.getItem(SINGLE_CHAT_STORAGE_KEY);
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

export function persistSinglePhoneChatState(state: SinglePhoneChatStoreState): boolean {
  try {
    localStorage.setItem(SINGLE_CHAT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    try {
      const trimmed: SinglePhoneChatStoreState = {
        messages: state.messages.slice(-25),
        reactions: state.reactions,
      };
      localStorage.setItem(SINGLE_CHAT_STORAGE_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      return false;
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
