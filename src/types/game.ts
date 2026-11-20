import type { Timestamp } from 'firebase/firestore';
import type { Language } from '../i18n/translations';

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'exhausted' | 'closed';
export type GameLengthMode = 'rounds' | 'all_questions';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface RoomPlayerDoc {
  uid: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  skipsRemaining: number;
  skipsUsed: number;
  connected: boolean;
  joinedAt: Timestamp;
  lastSeenAt: Timestamp;
}

export interface SinglePhonePlayer {
  id: string;
  name: string;
  avatarColor: string;
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
