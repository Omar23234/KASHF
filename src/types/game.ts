import type { Timestamp } from 'firebase/firestore';
import type { Language } from '../i18n/translations';

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'exhausted' | 'closed';
export type GameLengthMode = 'rounds' | 'all_questions';
export type SpecialCardType = 'gold' | 'switch' | 'anti_switch';
export type SpecialCardId = 'gold_1' | 'gold_2' | 'switch_1' | 'switch_2' | 'anti_switch_1';
export type TurnMode = 'normal' | 'switch_pending' | 'anti_switch_forced';
export type CardEventType = 'awarded' | 'gold' | 'switch' | 'anti_switch';

export interface CardEvent {
  nonce: number;
  type: CardEventType;
  cardId: string;
  actorUid: string;
  actorName: string;
  targetUid: string | null;
  targetName: string | null;
}

export interface RoomDoc {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  gameNumber: number;
  gameMode: GameLengthMode;
  language: Language;
  roundsCount: number;
  randomFirstPlayer: boolean;
  soundEnabled: boolean;
  playerOrder: string[];
  playerCount: number;
  currentTurnIndex: number;
  currentRound: number;
  totalTurnsCompleted: number;
  completedQuestionsCount: number;
  skippedQuestionsCount: number;
  currentQuestionId: number | null;
  usedQuestionIds: number[];
  activePlayerId: string | null;
  turnNonce: number;
  turnQuestionsRemaining: number;
  turnMode: TurnMode;
  switchSourceId: string | null;
  switchTargetId: string | null;
  availableSpecialCards: SpecialCardId[];
  awardedCardIds: SpecialCardId[];
  lastCardEvent: CardEvent | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface RoomPlayerDoc {
  uid: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  score: number;
  skipsRemaining: number;
  skipsUsed: number;
  pendingDoubleTurn: boolean;
  doublePenaltyUsed: boolean;
  goldCards: number;
  switchCards: number;
  antiSwitchCards: number;
  voiceJoined: boolean;
  micMuted: boolean;
  connected: boolean;
  joinedAt: Timestamp;
  lastSeenAt: Timestamp;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  memberIds: string[];
  createdAt: Timestamp | null;
  messageType?: 'text' | 'sticker';
  stickerId?: string;
  stickerUrl?: string;
  stickerStoragePath?: string;
  stickerCreatorId?: string;
  stickerCreatorName?: string;
  stickerContentHash?: string;
}

export interface PersonalSticker {
  stickerId: string;
  ownerId: string;
  creatorUid: string;
  creatorName: string;
  imageUrl: string;
  storagePath: string;
  contentHash: string;
  isSavedFromOther: boolean;
  createdAt?: Timestamp | null;
  createdAtMs?: number;
}

export interface VoiceSignalDoc {
  id: string;
  fromUid: string;
  toUid: string;
  type: 'offer' | 'answer' | 'ice';
  payload: string;
  createdAt: Timestamp | null;
}

export interface SinglePhonePlayer {
  id: string;
  name: string;
  avatarColor: string;
  score?: number;
  goldCards?: number;
  switchCards?: number;
  antiSwitchCards?: number;
}

export type SinglePhonePhase = 'setup' | 'playing' | 'finished' | 'exhausted';

export interface SinglePhoneGameState {
  phase: SinglePhonePhase;
  gameMode: GameLengthMode;
  players: SinglePhonePlayer[];
  roundsCount: number;
  randomFirstPlayer: boolean;
  currentTurnIndex: number;
  currentRound: number;
  totalTurnsCompleted: number;
  completedQuestionsCount: number;
  currentQuestionId: number | null;
  usedQuestionIds: number[];
  turnNonce: number;
  turnMode: TurnMode;
  switchSourceId: string | null;
  switchTargetId: string | null;
  activePlayerId: string | null;
  availableSpecialCards: SpecialCardId[];
  awardedCardIds: SpecialCardId[];
  lastCardEvent: CardEvent | null;
}

export type AppScreen =
  | 'home'
  | 'online_entry'
  | 'online_lobby'
  | 'online_game'
  | 'single_setup'
  | 'single_game'
  | 'how_to_play'
  | 'settings';
