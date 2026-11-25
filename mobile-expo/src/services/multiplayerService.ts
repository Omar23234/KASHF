import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { pickDefaultAvatar } from '../config/avatars';
import { drawRandomUnusedQuestionId, shuffleArray, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  auth,
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  storage,
  testConnection,
} from '../firebase/config';
import type { Language } from '../i18n/translations';
import {
  createShuffledCardDeck,
  maybeDrawSpecialCardFromPool,
  type CardEvent,
  type GameLengthMode,
  type SpecialCardId,
  type TurnMode,
} from '../utils/specialCards';

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'exhausted' | 'closed';
export type { GameLengthMode, TurnMode, CardEvent, SpecialCardId };

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

export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ChatReplyReference {
  replyToMessageId: string;
  replyToSenderName: string;
  replyToPreviewText: string;
  replyToType: 'text' | 'voice';
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  memberIds: string[];
  createdAt: Timestamp | null;
  messageType?: 'text' | 'voice';
  audioUrl?: string;
  audioStoragePath?: string;
  audioDurationSec?: number;
  audioMimeType?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreviewText?: string;
  replyToType?: 'text' | 'voice';
}

export interface MessageReactionDoc {
  id: string;
  reactionId: string;
  messageId: string;
  userId: string;
  userName: string;
  emoji: ReactionEmoji;
  memberIds: string[];
  updatedAt?: Timestamp | null;
}

export interface VoiceSignalDoc {
  id: string;
  fromUid: string;
  toUid: string;
  type: 'offer' | 'answer' | 'ice';
  payload: string;
  createdAt: Timestamp | null;
}

export type ChatPresenceStatus = 'idle' | 'typing' | 'recording';

export interface RoomChatPresenceDoc {
  id: string;
  uid: string;
  name: string;
  status: ChatPresenceStatus;
  memberIds: string[];
  expiresAtMs: number;
  updatedAt: Timestamp | null;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE_ROOM_KEY = 'kashf_active_room_code';
const PLAYER_NAME_KEY = 'kashf_player_name';
const PLAYER_AVATAR_KEY = 'kashf_player_avatar';

export function pickAvatarPalette(seed: string): string {
  return pickDefaultAvatar(seed);
}

export function getMaxRoundsForPlayers(playerCount: number): number {
  return Math.max(1, Math.floor(TOTAL_QUESTIONS_COUNT / Math.max(2, playerCount)));
}

export async function getSavedPlayerName(): Promise<string> {
  return (await AsyncStorage.getItem(PLAYER_NAME_KEY)) || '';
}

export async function getSavedPlayerAvatar(): Promise<string> {
  return (await AsyncStorage.getItem(PLAYER_AVATAR_KEY)) || '';
}

export async function savePlayerAvatar(avatar: string): Promise<void> {
  await AsyncStorage.setItem(PLAYER_AVATAR_KEY, avatar.slice(0, 24));
}

export async function saveActiveRoom(roomCode: string | null): Promise<void> {
  if (roomCode) await AsyncStorage.setItem(ACTIVE_ROOM_KEY, roomCode);
  else await AsyncStorage.removeItem(ACTIVE_ROOM_KEY);
}

export async function getSavedActiveRoom(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_ROOM_KEY);
}

function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function requireFirebase() {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  return { auth, db };
}

export async function ensureAnonymousAuth(): Promise<{
  uid: string | null;
  anonDisabledError: boolean;
  notConfigured: boolean;
}> {
  if (!isFirebaseConfigured || !auth || !db) {
    return { uid: null, anonDisabledError: false, notConfigured: true };
  }
  void testConnection();
  if (auth.currentUser) {
    return { uid: auth.currentUser.uid, anonDisabledError: false, notConfigured: false };
  }
  try {
    const cred = await signInAnonymously(auth);
    return { uid: cred.user.uid, anonDisabledError: false, notConfigured: false };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      return { uid: null, anonDisabledError: true, notConfigured: false };
    }
    throw err;
  }
}

async function generateUniqueRoomCode(): Promise<string> {
  const { db: firestore } = requireFirebase();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomRoomCode();
    try {
      const snap = await getDoc(doc(firestore, 'rooms', candidate));
      if (!snap.exists()) return candidate;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `rooms/${candidate}`);
    }
  }
  throw new Error('ROOM_CODE_GENERATION_FAILED');
}

export async function createMultiplayerRoom(params: {
  hostName: string;
  avatarColor?: string;
  language: Language;
  gameMode: GameLengthMode;
  roundsCount: number;
  randomFirstPlayer: boolean;
  soundEnabled: boolean;
}): Promise<string> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const cleanName = params.hostName.trim().slice(0, 24);
  if (!cleanName) throw new Error('INVALID_NAME');
  const chosenAvatar = (
    params.avatarColor ||
    (await getSavedPlayerAvatar()) ||
    pickDefaultAvatar(user.uid)
  )
    .trim()
    .slice(0, 24);
  await AsyncStorage.setItem(PLAYER_NAME_KEY, cleanName);
  await savePlayerAvatar(chosenAvatar);

  const roomCode = await generateUniqueRoomCode();
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);
  const safeRounds = Math.min(getMaxRoundsForPlayers(2), Math.max(1, params.roundsCount));

  const batch = writeBatch(firestore);
  batch.set(roomRef, {
    roomCode,
    hostId: user.uid,
    status: 'waiting',
    gameNumber: 1,
    gameMode: params.gameMode,
    language: params.language,
    roundsCount: safeRounds,
    randomFirstPlayer: params.randomFirstPlayer,
    soundEnabled: params.soundEnabled,
    playerOrder: [user.uid],
    playerCount: 1,
    currentTurnIndex: 0,
    currentRound: 1,
    totalTurnsCompleted: 0,
    completedQuestionsCount: 0,
    skippedQuestionsCount: 0,
    currentQuestionId: null,
    usedQuestionIds: [],
    activePlayerId: null,
    turnNonce: 0,
    turnQuestionsRemaining: 1,
    turnMode: 'normal',
    switchSourceId: null,
    switchTargetId: null,
    availableSpecialCards: [],
    awardedCardIds: [],
    lastCardEvent: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
  });

  batch.set(playerRef, {
    uid: user.uid,
    name: cleanName,
    avatarColor: chosenAvatar,
    isHost: true,
    score: 0,
    skipsRemaining: 3,
    skipsUsed: 0,
    pendingDoubleTurn: false,
    doublePenaltyUsed: false,
    goldCards: 0,
    switchCards: 0,
    antiSwitchCards: 0,
    voiceJoined: false,
    micMuted: false,
    connected: true,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomCode}`);
  }
  await saveActiveRoom(roomCode);
  return roomCode;
}

export async function joinMultiplayerRoom(params: {
  rawCode: string;
  playerName: string;
  avatarColor?: string;
}): Promise<{ roomCode: string; reconnected: boolean }> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomCode = params.rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error('INVALID_CODE');
  const cleanName = params.playerName.trim().slice(0, 24);
  if (!cleanName) throw new Error('INVALID_NAME');
  const chosenAvatar = (
    params.avatarColor ||
    (await getSavedPlayerAvatar()) ||
    pickDefaultAvatar(user.uid)
  )
    .trim()
    .slice(0, 24);
  await AsyncStorage.setItem(PLAYER_NAME_KEY, cleanName);
  await savePlayerAvatar(chosenAvatar);

  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);
  let reconnected = false;

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status === 'closed') throw new Error('ROOM_CLOSED');
      if (room.expiresAt && room.expiresAt.toMillis() < Date.now()) throw new Error('ROOM_NOT_FOUND');

      if (room.playerOrder.includes(user.uid)) {
        const pSnap = await tx.get(playerRef);
        if (pSnap.exists()) {
          tx.update(playerRef, { connected: true, lastSeenAt: serverTimestamp() });
          reconnected = true;
          return;
        }
      }

      if (room.status !== 'waiting') throw new Error('ROOM_STARTED');
      if (room.playerOrder.length >= 12) throw new Error('ROOM_FULL');

      const nextOrder = [...room.playerOrder, user.uid];
      tx.update(roomRef, {
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        updatedAt: serverTimestamp(),
      });
      tx.set(playerRef, {
        uid: user.uid,
        name: cleanName,
        avatarColor: chosenAvatar,
        isHost: false,
        score: 0,
        skipsRemaining: 3,
        skipsUsed: 0,
        pendingDoubleTurn: false,
        doublePenaltyUsed: false,
        goldCards: 0,
        switchCards: 0,
        antiSwitchCards: 0,
        voiceJoined: false,
        micMuted: false,
        connected: true,
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'ROOM_CLOSED', 'ROOM_STARTED', 'ROOM_FULL', 'INVALID_CODE'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }

  await saveActiveRoom(roomCode);
  return { roomCode, reconnected };
}

export async function updateLobbySettings(
  roomCode: string,
  settings: Partial<Pick<RoomDoc, 'gameMode' | 'roundsCount' | 'randomFirstPlayer' | 'language' | 'soundEnabled'>>
): Promise<void> {
  const { db: firestore } = requireFirebase();
  try {
    await updateDoc(doc(firestore, 'rooms', roomCode), { ...settings, updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function updateMyLobbyAvatar(roomCode: string, avatarColor: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const cleanAvatar = avatarColor.trim().slice(0, 24);
  if (!cleanAvatar) return;
  await savePlayerAvatar(cleanAvatar);
  try {
    await updateDoc(doc(firestore, 'rooms', roomCode, 'players', user.uid), {
      avatarColor: cleanAvatar,
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}/players/${user.uid}`);
  }
}

export async function kickPlayerFromLobby(roomCode: string, targetUid: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) return;
  const roomRef = doc(firestore, 'rooms', roomCode);
  const targetRef = doc(firestore, 'rooms', roomCode, 'players', targetUid);
  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;
      if (room.hostId !== user.uid || room.status !== 'waiting' || targetUid === user.uid) return;
      const nextOrder = room.playerOrder.filter((id) => id !== targetUid);
      tx.update(roomRef, { playerOrder: nextOrder, playerCount: nextOrder.length, updatedAt: serverTimestamp() });
      tx.delete(targetRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function startOrRestartMultiplayerGame(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.hostId !== user.uid) throw new Error('HOST_ONLY');
      if (room.playerOrder.length < 2) throw new Error('MIN_PLAYERS_REQUIRED');
      if (!['waiting', 'finished', 'exhausted'].includes(room.status)) return;

      const isRestart = room.status === 'finished' || room.status === 'exhausted';
      if (isRestart) {
        for (const pid of room.playerOrder) {
          await tx.get(doc(firestore, 'rooms', roomCode, 'players', pid));
        }
      }

      const safeRounds = Math.min(getMaxRoundsForPlayers(room.playerOrder.length), Math.max(1, room.roundsCount));
      const nextOrder = room.randomFirstPlayer ? shuffleArray(room.playerOrder) : [...room.playerOrder];
      const firstQ = drawRandomUnusedQuestionId([]);
      if (firstQ === null) throw new Error('NO_QUESTIONS');

      tx.update(roomRef, {
        status: 'playing',
        gameNumber: isRestart ? room.gameNumber + 1 : room.gameNumber,
        gameMode: room.gameMode,
        roundsCount: safeRounds,
        playerOrder: nextOrder,
        currentTurnIndex: 0,
        currentRound: 1,
        totalTurnsCompleted: 0,
        completedQuestionsCount: 0,
        skippedQuestionsCount: 0,
        currentQuestionId: firstQ,
        usedQuestionIds: [firstQ],
        activePlayerId: nextOrder[0],
        turnNonce: room.turnNonce + 1,
        turnQuestionsRemaining: 1,
        turnMode: 'normal',
        switchSourceId: null,
        switchTargetId: null,
        availableSpecialCards: createShuffledCardDeck(),
        awardedCardIds: [],
        lastCardEvent: null,
        updatedAt: serverTimestamp(),
      });

      if (isRestart) {
        for (const pid of nextOrder) {
          tx.update(doc(firestore, 'rooms', roomCode, 'players', pid), {
            score: 0,
            skipsRemaining: 3,
            skipsUsed: 0,
            pendingDoubleTurn: false,
            doublePenaltyUsed: false,
            goldCards: 0,
            switchCards: 0,
            antiSwitchCards: 0,
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && ['ROOM_NOT_FOUND', 'HOST_ONLY', 'MIN_PLAYERS_REQUIRED'].includes(error.message)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function advanceTurnNextQuestion(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status !== 'playing' || !room.activePlayerId) return;
      if (room.activePlayerId !== user.uid && room.hostId !== user.uid) throw new Error('NOT_YOUR_TURN');

      const activeUid = room.activePlayerId;
      const activePlayerRef = doc(firestore, 'rooms', roomCode, 'players', activeUid);

      const stayForSecondPenaltyQuestion = (room.turnQuestionsRemaining ?? 1) === 2;
      let nextIndex = room.currentTurnIndex;
      let nextRound = room.currentRound;
      if (!stayForSecondPenaltyQuestion) {
        nextIndex = room.currentTurnIndex + 1;
        if (nextIndex >= room.playerOrder.length) {
          nextIndex = 0;
          nextRound += 1;
        }
      }

      const nextActiveUid = room.playerOrder[nextIndex];
      const nextPlayerRef =
        nextActiveUid && nextActiveUid !== activeUid
          ? doc(firestore, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [activeSnap, nextSnap] = await Promise.all([
        tx.get(activePlayerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);
      if (!activeSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const activePlayer = activeSnap.data() as RoomPlayerDoc;
      const incomingPlayer = nextSnap?.exists()
        ? (nextSnap.data() as RoomPlayerDoc)
        : nextActiveUid === activeUid
          ? activePlayer
          : null;

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const isComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;

      const activeScoreUpdate: Record<string, unknown> = {
        score: (activePlayer.score ?? 0) + 1,
        lastSeenAt: serverTimestamp(),
      };

      if (isComplete) {
        tx.update(activePlayerRef, activeScoreUpdate);
        tx.update(roomRef, {
          status: 'finished',
          currentTurnIndex: 0,
          currentRound: Math.min(room.currentRound, room.roundsCount),
          totalTurnsCompleted: nextTotalTurns,
          completedQuestionsCount: room.completedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
          turnQuestionsRemaining: 1,
          turnMode: 'normal',
          switchSourceId: null,
          switchTargetId: null,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextQ = drawRandomUnusedQuestionId(room.usedQuestionIds);
      if (nextQ === null) {
        tx.update(activePlayerRef, activeScoreUpdate);
        tx.update(roomRef, {
          status: 'exhausted',
          currentTurnIndex: nextIndex,
          currentRound: Math.min(nextRound, 31),
          totalTurnsCompleted: nextTotalTurns,
          completedQuestionsCount: room.completedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
          turnQuestionsRemaining: 1,
          turnMode: 'normal',
          switchSourceId: null,
          switchTargetId: null,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextTurnNonce = room.turnNonce + 1;
      const totalConfiguredTurns =
        room.gameMode === 'all_questions'
          ? TOTAL_QUESTIONS_COUNT
          : room.playerOrder.length * room.roundsCount;

      let nextTurnQuestionsRemaining = 1;
      const nextPlayerUpdate: Record<string, unknown> = {};

      if (!stayForSecondPenaltyQuestion && incomingPlayer?.pendingDoubleTurn && !incomingPlayer?.doublePenaltyUsed) {
        nextTurnQuestionsRemaining = 2;
        if (nextPlayerRef) {
          nextPlayerUpdate.pendingDoubleTurn = false;
          nextPlayerUpdate.doublePenaltyUsed = true;
        }
      }

      const availableCards = room.availableSpecialCards ?? [];
      const awardedIds = room.awardedCardIds ?? [];
      const cardRoll = maybeDrawSpecialCardFromPool({
        availableSpecialCards: availableCards,
        awardedCardIds: awardedIds,
        totalTurnsCompleted: nextTotalTurns,
        totalConfiguredTurns,
      });

      let nextAvailableCards = availableCards;
      let nextAwardedIds = awardedIds;
      let nextCardEvent: CardEvent | null = null;

      if (cardRoll && incomingPlayer) {
        nextAvailableCards = cardRoll.nextAvailableCards;
        nextAwardedIds = cardRoll.nextAwardedCardIds;
        const field =
          cardRoll.drawnType === 'gold'
            ? 'goldCards'
            : cardRoll.drawnType === 'switch'
              ? 'switchCards'
              : 'antiSwitchCards';
        if (nextActiveUid === activeUid) {
          activeScoreUpdate[field] = (activePlayer[field] ?? 0) + 1;
        } else if (nextPlayerRef) {
          nextPlayerUpdate[field] = (incomingPlayer[field] ?? 0) + 1;
        }
        nextCardEvent = {
          nonce: nextTurnNonce,
          type: 'awarded',
          cardId: cardRoll.drawnCardId,
          actorUid: incomingPlayer.uid,
          actorName: incomingPlayer.name,
          targetUid: null,
          targetName: null,
        };
      }

      tx.update(activePlayerRef, activeScoreUpdate);
      if (nextPlayerRef && Object.keys(nextPlayerUpdate).length > 0) {
        tx.update(nextPlayerRef, nextPlayerUpdate);
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        completedQuestionsCount: room.completedQuestionsCount + 1,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: nextActiveUid,
        turnNonce: nextTurnNonce,
        turnQuestionsRemaining: nextTurnQuestionsRemaining,
        turnMode: 'normal',
        switchSourceId: null,
        switchTargetId: null,
        availableSpecialCards: nextAvailableCards,
        awardedCardIds: nextAwardedIds,
        lastCardEvent: nextCardEvent,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && ['ROOM_NOT_FOUND', 'NOT_YOUR_TURN', 'PLAYER_NOT_FOUND'].includes(error.message)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function skipTurnQuestion(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status !== 'playing') return;
      if (room.turnMode !== 'normal') throw new Error('CANNOT_REFUSE_FORCED_TURN');
      if (room.activePlayerId !== user.uid) throw new Error('NOT_YOUR_TURN');

      const stayForSecondPenaltyQuestion = (room.turnQuestionsRemaining ?? 1) === 2;
      let nextIndex = room.currentTurnIndex;
      let nextRound = room.currentRound;
      if (!stayForSecondPenaltyQuestion) {
        nextIndex = room.currentTurnIndex + 1;
        if (nextIndex >= room.playerOrder.length) {
          nextIndex = 0;
          nextRound += 1;
        }
      }

      const nextActiveUid = room.playerOrder[nextIndex];
      const nextPlayerRef =
        nextActiveUid && nextActiveUid !== user.uid
          ? doc(firestore, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [playerSnap, nextSnap] = await Promise.all([
        tx.get(playerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);
      if (!playerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const player = playerSnap.data() as RoomPlayerDoc;
      if (player.skipsRemaining < 1) throw new Error('NO_SKIPS_LEFT');

      const nextSkipsUsed = player.skipsUsed + 1;
      const shouldArmDouble =
        nextSkipsUsed === 3 && !player.doublePenaltyUsed ? true : Boolean(player.pendingDoubleTurn);

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const isComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;

      tx.update(playerRef, {
        skipsRemaining: player.skipsRemaining - 1,
        skipsUsed: nextSkipsUsed,
        score: (player.score ?? 0) - 3,
        pendingDoubleTurn: shouldArmDouble,
        lastSeenAt: serverTimestamp(),
      });

      if (isComplete) {
        tx.update(roomRef, {
          status: 'finished',
          currentTurnIndex: 0,
          currentRound: Math.min(room.currentRound, room.roundsCount),
          totalTurnsCompleted: nextTotalTurns,
          skippedQuestionsCount: room.skippedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
          turnQuestionsRemaining: 1,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextQ = drawRandomUnusedQuestionId(room.usedQuestionIds);
      if (nextQ === null) {
        tx.update(roomRef, {
          status: 'exhausted',
          currentTurnIndex: nextIndex,
          currentRound: Math.min(nextRound, 31),
          totalTurnsCompleted: nextTotalTurns,
          skippedQuestionsCount: room.skippedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
          turnQuestionsRemaining: 1,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextTurnNonce = room.turnNonce + 1;
      const incomingPlayer = nextSnap?.exists() ? (nextSnap.data() as RoomPlayerDoc) : null;
      let nextTurnQuestionsRemaining = 1;
      const nextPlayerUpdate: Record<string, unknown> = {};

      if (!stayForSecondPenaltyQuestion && incomingPlayer?.pendingDoubleTurn && !incomingPlayer?.doublePenaltyUsed) {
        nextTurnQuestionsRemaining = 2;
        nextPlayerUpdate.pendingDoubleTurn = false;
        nextPlayerUpdate.doublePenaltyUsed = true;
      }

      const totalConfiguredTurns =
        room.gameMode === 'all_questions'
          ? TOTAL_QUESTIONS_COUNT
          : room.playerOrder.length * room.roundsCount;
      const cardRoll = maybeDrawSpecialCardFromPool({
        availableSpecialCards: room.availableSpecialCards ?? [],
        awardedCardIds: room.awardedCardIds ?? [],
        totalTurnsCompleted: nextTotalTurns,
        totalConfiguredTurns,
      });

      let nextAvailableCards = room.availableSpecialCards ?? [];
      let nextAwardedIds = room.awardedCardIds ?? [];
      let nextCardEvent: CardEvent | null = null;

      if (cardRoll && incomingPlayer && nextPlayerRef) {
        nextAvailableCards = cardRoll.nextAvailableCards;
        nextAwardedIds = cardRoll.nextAwardedCardIds;
        const field =
          cardRoll.drawnType === 'gold'
            ? 'goldCards'
            : cardRoll.drawnType === 'switch'
              ? 'switchCards'
              : 'antiSwitchCards';
        nextPlayerUpdate[field] = (incomingPlayer[field] ?? 0) + 1;
        nextCardEvent = {
          nonce: nextTurnNonce,
          type: 'awarded',
          cardId: cardRoll.drawnCardId,
          actorUid: incomingPlayer.uid,
          actorName: incomingPlayer.name,
          targetUid: null,
          targetName: null,
        };
      }

      if (nextPlayerRef && Object.keys(nextPlayerUpdate).length > 0) {
        tx.update(nextPlayerRef, nextPlayerUpdate);
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        skippedQuestionsCount: room.skippedQuestionsCount + 1,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: nextActiveUid,
        turnNonce: nextTurnNonce,
        turnQuestionsRemaining: nextTurnQuestionsRemaining,
        availableSpecialCards: nextAvailableCards,
        awardedCardIds: nextAwardedIds,
        lastCardEvent: nextCardEvent,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'NO_SKIPS_LEFT', 'CANNOT_REFUSE_FORCED_TURN'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function useGoldCard(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status !== 'playing') return;
      if (room.turnMode !== 'normal') throw new Error('CANNOT_REFUSE_FORCED_TURN');
      if (room.activePlayerId !== user.uid) throw new Error('NOT_YOUR_TURN');

      const stayForSecond = (room.turnQuestionsRemaining ?? 1) === 2;
      let nextIndex = room.currentTurnIndex;
      let nextRound = room.currentRound;
      if (!stayForSecond) {
        nextIndex = room.currentTurnIndex + 1;
        if (nextIndex >= room.playerOrder.length) {
          nextIndex = 0;
          nextRound += 1;
        }
      }

      const nextActiveUid = room.playerOrder[nextIndex];
      const nextPlayerRef =
        nextActiveUid && nextActiveUid !== user.uid
          ? doc(firestore, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [playerSnap, nextSnap] = await Promise.all([
        tx.get(playerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);
      if (!playerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const player = playerSnap.data() as RoomPlayerDoc;
      if ((player.goldCards ?? 0) < 1) throw new Error('NO_GOLD_CARD');

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const isComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;
      const nextNonce = room.turnNonce + 1;
      const goldEvent: CardEvent = {
        nonce: nextNonce,
        type: 'gold',
        cardId: 'gold',
        actorUid: player.uid,
        actorName: player.name,
        targetUid: null,
        targetName: null,
      };

      tx.update(playerRef, {
        goldCards: player.goldCards - 1,
        lastSeenAt: serverTimestamp(),
      });

      if (isComplete) {
        tx.update(roomRef, {
          status: 'finished',
          currentTurnIndex: 0,
          currentRound: Math.min(room.currentRound, room.roundsCount),
          totalTurnsCompleted: nextTotalTurns,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: nextNonce,
          turnQuestionsRemaining: 1,
          lastCardEvent: goldEvent,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextQ = drawRandomUnusedQuestionId(room.usedQuestionIds);
      if (nextQ === null) {
        tx.update(roomRef, {
          status: 'exhausted',
          currentTurnIndex: nextIndex,
          currentRound: Math.min(nextRound, 31),
          totalTurnsCompleted: nextTotalTurns,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: nextNonce,
          turnQuestionsRemaining: 1,
          lastCardEvent: goldEvent,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const incomingPlayer = nextSnap?.exists() ? (nextSnap.data() as RoomPlayerDoc) : null;
      let nextTurnQuestionsRemaining = 1;
      if (!stayForSecond && incomingPlayer?.pendingDoubleTurn && !incomingPlayer?.doublePenaltyUsed && nextPlayerRef) {
        nextTurnQuestionsRemaining = 2;
        tx.update(nextPlayerRef, { pendingDoubleTurn: false, doublePenaltyUsed: true });
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: nextActiveUid,
        turnNonce: nextNonce,
        turnQuestionsRemaining: nextTurnQuestionsRemaining,
        lastCardEvent: goldEvent,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'CANNOT_REFUSE_FORCED_TURN', 'NO_GOLD_CARD'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function useSwitchCard(roomCode: string, targetUid: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (targetUid === user.uid) return;
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);
  const targetRef = doc(firestore, 'rooms', roomCode, 'players', targetUid);

  try {
    await runTransaction(firestore, async (tx) => {
      const [roomSnap, playerSnap, targetSnap] = await Promise.all([
        tx.get(roomRef),
        tx.get(playerRef),
        tx.get(targetRef),
      ]);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      if (!playerSnap.exists() || !targetSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      const player = playerSnap.data() as RoomPlayerDoc;
      const target = targetSnap.data() as RoomPlayerDoc;
      if (room.status !== 'playing') return;
      if (room.turnMode !== 'normal') throw new Error('CANNOT_REFUSE_FORCED_TURN');
      if (room.activePlayerId !== user.uid) throw new Error('NOT_YOUR_TURN');
      if ((player.switchCards ?? 0) < 1) throw new Error('NO_SWITCH_CARD');

      const nextNonce = room.turnNonce + 1;
      tx.update(playerRef, { switchCards: player.switchCards - 1, lastSeenAt: serverTimestamp() });
      tx.update(roomRef, {
        turnMode: 'switch_pending',
        switchSourceId: user.uid,
        switchTargetId: targetUid,
        activePlayerId: targetUid,
        turnNonce: nextNonce,
        lastCardEvent: {
          nonce: nextNonce,
          type: 'switch',
          cardId: 'switch',
          actorUid: player.uid,
          actorName: player.name,
          targetUid: target.uid,
          targetName: target.name,
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'CANNOT_REFUSE_FORCED_TURN', 'NO_SWITCH_CARD'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function useAntiSwitchCard(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);
  const myRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status !== 'playing' || room.turnMode !== 'switch_pending' || !room.switchSourceId) {
        throw new Error('NO_ACTIVE_SWITCH');
      }
      if (room.switchTargetId !== user.uid) throw new Error('NOT_SWITCH_TARGET');
      const sourceRef = doc(firestore, 'rooms', roomCode, 'players', room.switchSourceId);
      const [mySnap, sourceSnap] = await Promise.all([tx.get(myRef), tx.get(sourceRef)]);
      if (!mySnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const myPlayer = mySnap.data() as RoomPlayerDoc;
      if ((myPlayer.antiSwitchCards ?? 0) < 1) throw new Error('NO_ANTI_SWITCH_CARD');
      const sourceName = sourceSnap.exists() ? (sourceSnap.data() as RoomPlayerDoc).name : '';

      const nextNonce = room.turnNonce + 1;
      tx.update(myRef, { antiSwitchCards: myPlayer.antiSwitchCards - 1, lastSeenAt: serverTimestamp() });
      tx.update(roomRef, {
        turnMode: 'anti_switch_forced',
        switchTargetId: null,
        activePlayerId: room.switchSourceId,
        turnNonce: nextNonce,
        lastCardEvent: {
          nonce: nextNonce,
          type: 'anti_switch',
          cardId: 'anti_switch',
          actorUid: myPlayer.uid,
          actorName: myPlayer.name,
          targetUid: room.switchSourceId,
          targetName: sourceName,
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NO_ACTIVE_SWITCH', 'NOT_SWITCH_TARGET', 'NO_ANTI_SWITCH_CARD'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function leaveMultiplayerRoom(roomCode: string): Promise<void> {
  await saveActiveRoom(null);
  if (!isFirebaseConfigured || !auth || !db) return;
  const user = auth.currentUser;
  if (!user) return;
  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;
      if (room.status === 'closed' || !room.playerOrder.includes(user.uid)) return;

      const nextOrder = room.playerOrder.filter((id) => id !== user.uid);
      if (nextOrder.length === 0) {
        if (room.hostId === user.uid) {
          tx.update(roomRef, { status: 'closed', updatedAt: serverTimestamp() });
        }
        return;
      }

      const isLeavingHost = room.hostId === user.uid;
      const nextHostId = isLeavingHost ? nextOrder[0] : room.hostId;
      const nextHostRef = doc(db!, 'rooms', roomCode, 'players', nextHostId);
      if (isLeavingHost) await tx.get(nextHostRef);

      const tooFew = room.status === 'playing' && nextOrder.length < 2;
      const nextIndex = room.currentTurnIndex >= nextOrder.length ? 0 : room.currentTurnIndex;
      const nextStatus = tooFew ? 'finished' : room.status;
      const clearSwitch =
        tooFew ||
        room.switchSourceId === user.uid ||
        room.switchTargetId === user.uid ||
        room.activePlayerId === user.uid;
      const nextActive = nextStatus === 'playing' ? (clearSwitch ? nextOrder[nextIndex] : room.activePlayerId) : null;
      const nextQ = tooFew ? null : room.currentQuestionId;

      if (isLeavingHost) tx.update(nextHostRef, { isHost: true });
      tx.update(roomRef, {
        ...(isLeavingHost ? { hostId: nextHostId } : {}),
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        currentTurnIndex: nextIndex,
        activePlayerId: nextActive,
        currentQuestionId: nextQ,
        turnQuestionsRemaining: clearSwitch ? 1 : (room.turnQuestionsRemaining ?? 1),
        turnMode: clearSwitch ? 'normal' : room.turnMode,
        switchSourceId: clearSwitch ? null : room.switchSourceId,
        switchTargetId: clearSwitch ? null : room.switchTargetId,
        turnNonce: room.turnNonce + 1,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      tx.delete(playerRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function claimDisconnectedHost(roomCode: string): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) return;
  const roomRef = doc(firestore, 'rooms', roomCode);
  const myRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;
      if (room.hostId === user.uid || !room.playerOrder.includes(user.uid)) return;

      const oldHostRef = doc(firestore, 'rooms', roomCode, 'players', room.hostId);
      const [oldHostSnap] = await Promise.all([tx.get(oldHostRef), tx.get(myRef)]);
      if (oldHostSnap.exists() && (oldHostSnap.data() as RoomPlayerDoc).connected) return;

      tx.update(roomRef, { hostId: user.uid, updatedAt: serverTimestamp() });
      if (oldHostSnap.exists()) tx.update(oldHostRef, { isHost: false });
      tx.update(myRef, { isHost: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function setPlayerConnectionState(roomCode: string, connected: boolean): Promise<void> {
  if (!isFirebaseConfigured || !auth || !db) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), {
      connected,
      lastSeenAt: serverTimestamp(),
    });
  } catch {
    // ignore transient errors
  }
}

export async function setPlayerVoiceState(
  roomCode: string,
  voiceJoined: boolean,
  micMuted: boolean
): Promise<boolean> {
  if (!isFirebaseConfigured || !auth || !db) return false;
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), {
      voiceJoined,
      micMuted,
      lastSeenAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

function safeTrimSlice(input: string, maxChars: number): string {
  return Array.from(input.trim()).slice(0, maxChars).join('');
}

function buildReplyPayload(replyTo?: ChatReplyReference | null): Partial<ChatReplyReference> {
  if (!replyTo) return {};
  const preview = safeTrimSlice(replyTo.replyToPreviewText, 160) || '...';
  const sender = safeTrimSlice(replyTo.replyToSenderName, 24) || 'Player';
  return {
    replyToMessageId: replyTo.replyToMessageId,
    replyToSenderName: sender,
    replyToPreviewText: preview,
    replyToType: replyTo.replyToType,
  };
}

export async function sendRoomChatMessage(
  roomCode: string,
  senderName: string,
  text: string,
  memberIds: string[],
  replyTo?: ChatReplyReference | null
): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!roomCode) throw new Error('ROOM_NOT_FOUND');
  const cleanText = safeTrimSlice(text, 500);
  if (!cleanText) return;
  const cleanName = safeTrimSlice(senderName || 'Player', 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...memberIds])).slice(0, 12);
  try {
    await addDoc(collection(firestore, 'rooms', roomCode, 'messages'), {
      senderId: user.uid,
      senderName: cleanName,
      text: cleanText,
      messageType: 'text',
      memberIds: safeMembers,
      ...buildReplyPayload(replyTo),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomCode}/messages`);
  }
}

export function subscribeToRoomMessages(
  roomCode: string,
  myUid: string,
  onMessages: (messages: RoomChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !myUid) return () => {};
  const q = query(
    collection(db, 'rooms', roomCode, 'messages'),
    where('memberIds', 'array-contains', myUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: RoomChatMessage[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RoomChatMessage, 'id'>),
      }));
      list.sort(
        (a, b) =>
          (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) -
          (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER)
      );
      onMessages(list.slice(-100));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

const MAX_STORAGE_VOICE_BYTES = 4.5 * 1024 * 1024;
const MAX_INLINE_VOICE_BYTES = 480 * 1024;
const MAX_INLINE_VOICE_DATA_URI_CHARS = 700000;

function readLocalAudioBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', uri, true);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
          resolve(xhr.response as Blob);
        } else {
          reject(new Error(`XHR_STATUS_${xhr.status}`));
        }
      };
      xhr.onerror = () => {
        fetch(uri)
          .then((r) => r.blob())
          .then(resolve)
          .catch(reject);
      };
      xhr.send(null);
    } catch {
      fetch(uri)
        .then((r) => r.blob())
        .then(resolve)
        .catch(reject);
    }
  });
}

function blobToBase64Body(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      if (commaIdx !== -1) {
        resolve(res.slice(commaIdx + 1).replace(/\s+/g, ''));
      } else {
        reject(new Error('READER_EMPTY'));
      }
    };
    reader.onerror = () => reject(new Error('READER_FAILED'));
    reader.readAsDataURL(blob);
  });
}

function extensionFromAudioMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

async function tryUploadVoiceToStorage(
  roomCode: string,
  senderUid: string,
  blob: Blob,
  safeMime: string
): Promise<{ url: string; path: string } | null> {
  if (!storage) return null;
  try {
    const ext = extensionFromAudioMime(safeMime);
    const rand = Math.random().toString(36).slice(2, 8);
    const storagePath = `voiceMessages/${roomCode}/${senderUid}/${Date.now()}_${rand}.${ext}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = (async () => {
      await uploadBytes(storageRef, blob, { contentType: safeMime });
      return await getDownloadURL(storageRef);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('STORAGE_TIMEOUT')), 6500);
    });

    const url = await Promise.race([uploadTask, timeoutPromise]);
    if (typeof url === 'string' && url.startsWith('https://') && url.length <= 2048) {
      return { url, path: storagePath };
    }
    return null;
  } catch {
    return null;
  }
}

export async function uploadAndSendVoiceMessage(params: {
  roomCode: string;
  senderName: string;
  uri: string;
  mimeType: string;
  durationSec: number;
  memberIds: string[];
  replyTo?: ChatReplyReference | null;
}): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const rawMime = (params.mimeType || 'audio/mp4').split(';')[0].trim().toLowerCase();
  const safeMime = rawMime.startsWith('audio/') ? rawMime : 'audio/mp4';

  let audioBlob: Blob;
  try {
    audioBlob = await readLocalAudioBlob(params.uri);
  } catch {
    throw new Error('VOICE_UPLOAD_FAILED');
  }

  if (audioBlob.size < 64) {
    throw new Error('VOICE_EMPTY');
  }
  if (audioBlob.size > MAX_STORAGE_VOICE_BYTES) {
    throw new Error('VOICE_TOO_LARGE');
  }

  let audioUrl = '';
  let audioStoragePath = 'inline';

  const uploaded = await tryUploadVoiceToStorage(params.roomCode, user.uid, audioBlob, safeMime);
  if (uploaded) {
    audioUrl = uploaded.url;
    audioStoragePath = uploaded.path;
  } else {
    if (audioBlob.size > MAX_INLINE_VOICE_BYTES) {
      throw new Error('VOICE_TOO_LARGE');
    }

    let base64Body = '';
    try {
      base64Body = await blobToBase64Body(audioBlob);
    } catch {
      throw new Error('VOICE_UPLOAD_FAILED');
    }

    audioUrl = `data:${safeMime};base64,${base64Body}`;
    if (audioUrl.length < 30 || audioUrl.length > MAX_INLINE_VOICE_DATA_URI_CHARS) {
      throw new Error('VOICE_TOO_LARGE');
    }
  }

  const safeDuration = Math.min(180, Math.max(1, Math.round(params.durationSec)));
  const cleanName = (params.senderName || 'Player').trim().slice(0, 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...params.memberIds])).slice(0, 12);

  try {
    await addDoc(collection(firestore, 'rooms', params.roomCode, 'messages'), {
      senderId: user.uid,
      senderName: cleanName,
      text: `[Voice ${safeDuration}s]`,
      memberIds: safeMembers,
      messageType: 'voice',
      audioUrl,
      audioStoragePath,
      audioDurationSec: safeDuration,
      audioMimeType: safeMime,
      ...buildReplyPayload(params.replyTo),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${params.roomCode}/messages`);
  }
}

export async function toggleMessageReaction(params: {
  roomCode: string;
  messageId: string;
  userName: string;
  emoji: ReactionEmoji;
  memberIds: string[];
  currentMyEmoji?: ReactionEmoji | null;
}): Promise<void> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const reactionId = `${params.messageId}_${user.uid}`;
  const ref = doc(firestore, 'rooms', params.roomCode, 'messageReactions', reactionId);

  try {
    if (params.currentMyEmoji === params.emoji) {
      await deleteDoc(ref);
      return;
    }

    const cleanName = (params.userName || 'Player').trim().slice(0, 24) || 'Player';
    const safeMembers = Array.from(new Set([user.uid, ...params.memberIds])).slice(0, 12);

    await setDoc(ref, {
      reactionId,
      messageId: params.messageId,
      userId: user.uid,
      userName: cleanName,
      emoji: params.emoji,
      memberIds: safeMembers,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `rooms/${params.roomCode}/messageReactions/${reactionId}`
    );
  }
}

export function subscribeToRoomReactions(
  roomCode: string,
  myUid: string,
  onReactions: (reactions: MessageReactionDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !myUid) return () => {};
  const q = query(
    collection(db, 'rooms', roomCode, 'messageReactions'),
    where('memberIds', 'array-contains', myUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: MessageReactionDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MessageReactionDoc, 'id'>),
      }));
      onReactions(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function setRoomChatPresence(params: {
  roomCode: string;
  senderName: string;
  status: ChatPresenceStatus;
  memberIds: string[];
}): Promise<void> {
  if (!isFirebaseConfigured || !auth || !db || !params.roomCode) return;
  const user = auth.currentUser;
  if (!user) return;

  const cleanName = (params.senderName || 'Player').trim().slice(0, 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...params.memberIds])).slice(0, 12);
  const ref = doc(db, 'rooms', params.roomCode, 'chatPresence', user.uid);

  try {
    await setDoc(ref, {
      uid: user.uid,
      name: cleanName,
      status: params.status,
      memberIds: safeMembers,
      expiresAtMs: params.status === 'idle' ? 0 : Date.now() + 6500,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ephemeral typing/recording status is best-effort
  }
}

export function subscribeToRoomChatPresence(
  roomCode: string,
  myUid: string,
  onPresence: (items: RoomChatPresenceDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !myUid || !roomCode) return () => {};
  const q = query(
    collection(db, 'rooms', roomCode, 'chatPresence'),
    where('memberIds', 'array-contains', myUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: RoomChatPresenceDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RoomChatPresenceDoc, 'id'>),
      }));
      onPresence(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}



export async function sendVoiceSignal(
  roomCode: string,
  toUid: string,
  type: 'offer' | 'answer' | 'ice',
  payload: string
): Promise<void> {
  if (!isFirebaseConfigured || !auth || !db) return;
  const user = auth.currentUser;
  if (!user || !toUid || toUid === user.uid) return;
  try {
    await addDoc(collection(db, 'rooms', roomCode, 'voiceSignals'), {
      fromUid: user.uid,
      toUid,
      type,
      payload: payload.slice(0, 16384),
      createdAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

export async function clearMyVoiceSignals(roomCode: string): Promise<void> {
  if (!isFirebaseConfigured || !auth || !db || !roomCode) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    const q = query(
      collection(db, 'rooms', roomCode, 'voiceSignals'),
      where('toUid', '==', user.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch {
    // ignore cleanup errors
  }
}

export async function deleteVoiceSignal(roomCode: string, signalId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  try {
    await deleteDoc(doc(db, 'rooms', roomCode, 'voiceSignals', signalId));
  } catch {
    // ignore
  }
}

export function subscribeToVoiceSignals(
  roomCode: string,
  myUid: string,
  onSignals: (signals: VoiceSignalDoc[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !myUid) return () => {};
  const q = query(
    collection(db, 'rooms', roomCode, 'voiceSignals'),
    where('toUid', '==', myUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: VoiceSignalDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<VoiceSignalDoc, 'id'>),
      }));
      items.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      onSignals(items);
    },
    () => {}
  );
}

export function subscribeToRoomAndPlayers(
  roomCode: string,
  onData: (room: RoomDoc | null, players: Record<string, RoomPlayerDoc>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db) {
    onError(new Error('FIREBASE_NOT_CONFIGURED'));
    return () => {};
  }
  const firestore = db;
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerUnsubs = new Map<string, Unsubscribe>();
  let latestRoom: RoomDoc | null = null;
  const latestPlayers: Record<string, RoomPlayerDoc> = {};
  const emit = () => onData(latestRoom, { ...latestPlayers });

  const unsubRoom = onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        latestRoom = null;
        emit();
        return;
      }
      const room = snap.data() as RoomDoc;
      latestRoom = room;
      const desired = new Set(room.playerOrder);
      for (const [pid, unsub] of playerUnsubs.entries()) {
        if (!desired.has(pid)) {
          unsub();
          playerUnsubs.delete(pid);
          delete latestPlayers[pid];
        }
      }
      for (const pid of room.playerOrder) {
        if (!playerUnsubs.has(pid)) {
          const u = onSnapshot(
            doc(firestore, 'rooms', roomCode, 'players', pid),
            (pSnap) => {
              if (pSnap.exists()) latestPlayers[pid] = pSnap.data() as RoomPlayerDoc;
              else delete latestPlayers[pid];
              emit();
            },
            (err) => {
              try {
                handleFirestoreError(err, OperationType.GET, `rooms/${roomCode}/players/${pid}`);
              } catch (wrapped) {
                onError(wrapped as Error);
              }
            }
          );
          playerUnsubs.set(pid, u);
        }
      }
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `rooms/${roomCode}`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubRoom();
    for (const u of playerUnsubs.values()) u();
    playerUnsubs.clear();
  };
}
