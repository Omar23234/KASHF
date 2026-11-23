import type { ChatReplyReference, PersonalSticker, ReactionEmoji } from '../types/game';

export interface LocalSinglePhoneChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: 'text' | 'sticker' | 'voice';
  stickerId?: string;
  stickerUrl?: string;
  stickerCreatorId?: string;
  stickerCreatorName?: string;
  stickerContentHash?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  audioMimeType?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreviewText?: string;
  replyToType?: 'text' | 'sticker' | 'voice';
  createdAtMs: number;
}

export interface SinglePhoneReactionEntry {
  emoji: ReactionEmoji;
  userName: string;
}

export interface SinglePhoneChatStoreState {
  messages: LocalSinglePhoneChatMessage[];
  stickersByPlayer: Record<string, PersonalSticker[]>;
  // messageId -> playerId -> reaction
  reactions: Record<string, Record<string, SinglePhoneReactionEntry>>;
}

const SINGLE_CHAT_STORAGE_KEY = 'mgk_single_phone_chat_v1';
const MAX_LOCAL_MESSAGES = 80;

export function createEmptySinglePhoneChatState(): SinglePhoneChatStoreState {
  return {
    messages: [],
    stickersByPlayer: {},
    reactions: {},
  };
}

export function loadSinglePhoneChatState(): SinglePhoneChatStoreState {
  try {
    const raw = localStorage.getItem(SINGLE_CHAT_STORAGE_KEY);
    if (!raw) return createEmptySinglePhoneChatState();
    const parsed = JSON.parse(raw) as Partial<SinglePhoneChatStoreState>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_LOCAL_MESSAGES) : [],
      stickersByPlayer:
        parsed.stickersByPlayer && typeof parsed.stickersByPlayer === 'object'
          ? parsed.stickersByPlayer
          : {},
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
        stickersByPlayer: state.stickersByPlayer,
        reactions: state.reactions,
      };
      localStorage.setItem(SINGLE_CHAT_STORAGE_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      return false;
    }
  }
}

export function isDuplicateStickerInList(
  list: PersonalSticker[],
  candidate: { stickerId: string; contentHash: string }
): boolean {
  return list.some(
    (s) => s.stickerId === candidate.stickerId || s.contentHash === candidate.contentHash
  );
}

export function addPersonalStickerToSinglePhoneState(
  state: SinglePhoneChatStoreState,
  params: {
    playerId: string;
    playerName: string;
    dataUrl: string;
    contentHash: string;
  }
): { nextState: SinglePhoneChatStoreState; status: 'added' | 'already_exists'; sticker: PersonalSticker } {
  const existingList = state.stickersByPlayer[params.playerId] ?? [];
  const existing = existingList.find((s) => s.contentHash === params.contentHash);
  if (existing) {
    return { nextState: state, status: 'already_exists', sticker: existing };
  }

  const stickerId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sticker: PersonalSticker = {
    stickerId,
    ownerId: params.playerId,
    creatorUid: params.playerId,
    creatorName: params.playerName,
    imageUrl: params.dataUrl,
    storagePath: `local/${params.playerId}/${stickerId}`,
    contentHash: params.contentHash,
    isSavedFromOther: false,
    createdAtMs: Date.now(),
  };

  const nextState: SinglePhoneChatStoreState = {
    ...state,
    stickersByPlayer: {
      ...state.stickersByPlayer,
      [params.playerId]: [sticker, ...existingList],
    },
  };
  return { nextState, status: 'added', sticker };
}

export function saveOtherStickerToSinglePhoneState(
  state: SinglePhoneChatStoreState,
  params: {
    targetPlayerId: string;
    stickerId: string;
    imageUrl: string;
    contentHash: string;
    creatorUid: string;
    creatorName: string;
  }
): { nextState: SinglePhoneChatStoreState; status: 'saved' | 'already_exists' } {
  const existingList = state.stickersByPlayer[params.targetPlayerId] ?? [];
  if (
    isDuplicateStickerInList(existingList, {
      stickerId: params.stickerId,
      contentHash: params.contentHash,
    })
  ) {
    return { nextState: state, status: 'already_exists' };
  }

  const savedCopy: PersonalSticker = {
    stickerId: params.stickerId,
    ownerId: params.targetPlayerId,
    creatorUid: params.creatorUid,
    creatorName: params.creatorName,
    imageUrl: params.imageUrl,
    storagePath: `local/${params.targetPlayerId}/${params.stickerId}`,
    contentHash: params.contentHash,
    isSavedFromOther: params.creatorUid !== params.targetPlayerId,
    createdAtMs: Date.now(),
  };

  const nextState: SinglePhoneChatStoreState = {
    ...state,
    stickersByPlayer: {
      ...state.stickersByPlayer,
      [params.targetPlayerId]: [savedCopy, ...existingList],
    },
  };
  return { nextState, status: 'saved' };
}

export function deleteSinglePhoneStickerFromState(
  state: SinglePhoneChatStoreState,
  playerId: string,
  stickerId: string
): SinglePhoneChatStoreState {
  const existingList = state.stickersByPlayer[playerId] ?? [];
  return {
    ...state,
    stickersByPlayer: {
      ...state.stickersByPlayer,
      [playerId]: existingList.filter((s) => s.stickerId !== stickerId),
    },
  };
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

export function appendSinglePhoneStickerMessage(
  state: SinglePhoneChatStoreState,
  senderId: string,
  senderName: string,
  sticker: PersonalSticker,
  replyTo?: ChatReplyReference | null
): SinglePhoneChatStoreState {
  const msg: LocalSinglePhoneChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    senderId,
    senderName,
    text: '[Sticker]',
    messageType: 'sticker',
    stickerId: sticker.stickerId,
    stickerUrl: sticker.imageUrl,
    stickerCreatorId: sticker.creatorUid,
    stickerCreatorName: sticker.creatorName,
    stickerContentHash: sticker.contentHash,
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
  const safeDuration = Math.min(300, Math.max(1, Math.round(params.audioDurationSec)));
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
