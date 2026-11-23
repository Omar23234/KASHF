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
import { signInAnonymously } from 'firebase/auth';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, handleFirestoreError, OperationType, storage } from './config';
import { pickAvatarPalette } from '../config/brand';
import { drawRandomUnusedQuestionId, shuffleArray, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import type { Language } from '../i18n/translations';
import type {
  ChatReplyReference,
  GameLengthMode,
  MessageReactionDoc,
  PersonalSticker,
  ReactionEmoji,
  RoomChatMessage,
  RoomDoc,
  RoomPlayerDoc,
  VoiceSignalDoc,
} from '../types/game';
import {
  createShuffledCardDeck,
  maybeDrawSpecialCardFromPool,
} from '../utils/specialCards';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE_ROOM_STORAGE_KEY = 'kashf_active_room_code';
const PLAYER_NAME_STORAGE_KEY = 'kashf_player_name';

export function getMaxRoundsForPlayers(playerCount: number): number {
  const safePlayers = Math.max(2, playerCount);
  return Math.max(1, Math.floor(TOTAL_QUESTIONS_COUNT / safePlayers));
}

export function getSavedActiveRoom(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveRoom(roomCode: string | null): void {
  try {
    if (roomCode) {
      localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, roomCode);
    } else {
      localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  } catch {
    // ignore
  }
}

function randomRoomCode(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

export async function ensureAnonymousAuth(): Promise<{
  uid: string | null;
  anonDisabledError: boolean;
}> {
  if (auth.currentUser) {
    return { uid: auth.currentUser.uid, anonDisabledError: false };
  }
  try {
    const cred = await signInAnonymously(auth);
    return { uid: cred.user.uid, anonDisabledError: false };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/admin-restricted-operation'
    ) {
      return { uid: null, anonDisabledError: true };
    }
    throw err;
  }
}

async function generateUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomRoomCode();
    const ref = doc(db, 'rooms', candidate);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return candidate;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `rooms/${candidate}`);
    }
  }
  throw new Error('ROOM_CODE_GENERATION_FAILED');
}

export async function createMultiplayerRoom(params: {
  hostName: string;
  language: Language;
  gameMode: GameLengthMode;
  roundsCount: number;
  randomFirstPlayer: boolean;
  soundEnabled: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const cleanName = params.hostName.trim().slice(0, 24);
  if (!cleanName) throw new Error('INVALID_NAME');

  savePlayerName(cleanName);
  const roomCode = await generateUniqueRoomCode();
  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  const safeRounds = Math.min(getMaxRoundsForPlayers(2), Math.max(1, params.roundsCount));
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  const batch = writeBatch(db);

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
    expiresAt,
  });

  batch.set(playerRef, {
    uid: user.uid,
    name: cleanName,
    avatarColor: pickAvatarPalette(user.uid),
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

  saveActiveRoom(roomCode);
  return roomCode;
}

export async function joinMultiplayerRoom(params: {
  rawCode: string;
  playerName: string;
}): Promise<{ roomCode: string; reconnected: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomCode = params.rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    throw new Error('INVALID_CODE');
  }

  const cleanName = params.playerName.trim().slice(0, 24);
  if (!cleanName) throw new Error('INVALID_NAME');
  savePlayerName(cleanName);

  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  let reconnected = false;
  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) {
        throw new Error('ROOM_NOT_FOUND');
      }
      const room = roomSnap.data() as RoomDoc;

      if (room.status === 'closed') {
        throw new Error('ROOM_CLOSED');
      }
      if (room.expiresAt && room.expiresAt.toMillis() < Date.now()) {
        throw new Error('ROOM_NOT_FOUND');
      }

      if (room.playerOrder.includes(user.uid)) {
        const playerSnap = await tx.get(playerRef);
        if (playerSnap.exists()) {
          tx.update(playerRef, {
            connected: true,
            lastSeenAt: serverTimestamp(),
          });
          reconnected = true;
          return;
        }
      }

      if (room.status !== 'waiting') {
        throw new Error('ROOM_STARTED');
      }
      if (room.playerOrder.length >= 12) {
        throw new Error('ROOM_FULL');
      }

      const nextOrder = [...room.playerOrder, user.uid];
      tx.update(roomRef, {
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        updatedAt: serverTimestamp(),
      });

      tx.set(playerRef, {
        uid: user.uid,
        name: cleanName,
        avatarColor: pickAvatarPalette(user.uid),
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

  saveActiveRoom(roomCode);
  return { roomCode, reconnected };
}

export async function updateLobbySettings(
  roomCode: string,
  settings: {
    gameMode?: GameLengthMode;
    roundsCount?: number;
    randomFirstPlayer?: boolean;
    language?: Language;
    soundEnabled?: boolean;
  }
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await updateDoc(roomRef, {
      ...settings,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function kickPlayerFromLobby(roomCode: string, targetUid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const roomRef = doc(db, 'rooms', roomCode);
  const targetRef = doc(db, 'rooms', roomCode, 'players', targetUid);

  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;
      if (room.hostId !== user.uid || room.status !== 'waiting' || targetUid === user.uid) {
        return;
      }
      const nextOrder = room.playerOrder.filter((id) => id !== targetUid);
      tx.update(roomRef, {
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        updatedAt: serverTimestamp(),
      });
      tx.delete(targetRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function startOrRestartMultiplayerGame(roomCode: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;

      if (room.hostId !== user.uid) throw new Error('HOST_ONLY');
      if (room.playerOrder.length < 2) throw new Error('MIN_PLAYERS_REQUIRED');
      if (!['waiting', 'finished', 'exhausted'].includes(room.status)) return;

      const isRestart = room.status === 'finished' || room.status === 'exhausted';
      if (isRestart) {
        for (const pid of room.playerOrder) {
          await tx.get(doc(db, 'rooms', roomCode, 'players', pid));
        }
      }

      const maxRounds = getMaxRoundsForPlayers(room.playerOrder.length);
      const safeRounds = Math.min(maxRounds, Math.max(1, room.roundsCount));

      const nextOrder = room.randomFirstPlayer
        ? shuffleArray(room.playerOrder)
        : [...room.playerOrder];
      const firstQuestionId = drawRandomUnusedQuestionId([]);
      if (firstQuestionId === null) throw new Error('NO_QUESTIONS');

      const nextGameNumber = isRestart ? room.gameNumber + 1 : room.gameNumber;

      tx.update(roomRef, {
        status: 'playing',
        gameNumber: nextGameNumber,
        gameMode: room.gameMode,
        roundsCount: safeRounds,
        playerOrder: nextOrder,
        currentTurnIndex: 0,
        currentRound: 1,
        totalTurnsCompleted: 0,
        completedQuestionsCount: 0,
        skippedQuestionsCount: 0,
        currentQuestionId: firstQuestionId,
        usedQuestionIds: [firstQuestionId],
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
          tx.update(doc(db, 'rooms', roomCode, 'players', pid), {
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
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;
      if (room.status !== 'playing' || !room.activePlayerId) return;
      if (room.activePlayerId !== user.uid && room.hostId !== user.uid) {
        throw new Error('NOT_YOUR_TURN');
      }

      const activeUid = room.activePlayerId;
      const activePlayerRef = doc(db, 'rooms', roomCode, 'players', activeUid);

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
          ? doc(db, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [activePlayerSnap, nextPlayerSnap] = await Promise.all([
        tx.get(activePlayerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);

      if (!activePlayerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const activePlayer = activePlayerSnap.data() as RoomPlayerDoc;
      const incomingPlayer = nextPlayerSnap?.exists()
        ? (nextPlayerSnap.data() as RoomPlayerDoc)
        : nextActiveUid === activeUid
          ? activePlayer
          : null;

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const roundsComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;

      // Award +1 to answering player
      const activeScoreUpdate: Record<string, unknown> = {
        score: (activePlayer.score ?? 0) + 1,
        lastSeenAt: serverTimestamp(),
      };

      if (roundsComplete) {
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
      let nextCardEvent = null;

      if (cardRoll && incomingPlayer) {
        nextAvailableCards = cardRoll.nextAvailableCards;
        nextAwardedIds = cardRoll.nextAwardedCardIds;
        const cardField =
          cardRoll.drawnType === 'gold'
            ? 'goldCards'
            : cardRoll.drawnType === 'switch'
              ? 'switchCards'
              : 'antiSwitchCards';

        if (nextActiveUid === activeUid) {
          activeScoreUpdate[cardField] = (activePlayer[cardField] ?? 0) + 1;
        } else if (nextPlayerRef) {
          nextPlayerUpdate[cardField] = (incomingPlayer[cardField] ?? 0) + 1;
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
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(db, async (tx) => {
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
          ? doc(db, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [playerSnap, nextPlayerSnap] = await Promise.all([
        tx.get(playerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);

      if (!playerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const player = playerSnap.data() as RoomPlayerDoc;
      if (player.skipsRemaining < 1) throw new Error('NO_SKIPS_LEFT');

      const nextSkipsUsed = player.skipsUsed + 1;
      const shouldArmDoubleTurn =
        nextSkipsUsed === 3 && !player.doublePenaltyUsed ? true : Boolean(player.pendingDoubleTurn);

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const roundsComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;

      tx.update(playerRef, {
        skipsRemaining: player.skipsRemaining - 1,
        skipsUsed: nextSkipsUsed,
        score: (player.score ?? 0) - 3,
        pendingDoubleTurn: shouldArmDoubleTurn,
        lastSeenAt: serverTimestamp(),
      });

      if (roundsComplete) {
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
      const incomingPlayer = nextPlayerSnap?.exists() ? (nextPlayerSnap.data() as RoomPlayerDoc) : null;
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
      let nextCardEvent = null;

      if (cardRoll && incomingPlayer && nextPlayerRef) {
        nextAvailableCards = cardRoll.nextAvailableCards;
        nextAwardedIds = cardRoll.nextAwardedCardIds;
        const cardField =
          cardRoll.drawnType === 'gold'
            ? 'goldCards'
            : cardRoll.drawnType === 'switch'
              ? 'switchCards'
              : 'antiSwitchCards';
        nextPlayerUpdate[cardField] = (incomingPlayer[cardField] ?? 0) + 1;
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
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(db, async (tx) => {
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
          ? doc(db, 'rooms', roomCode, 'players', nextActiveUid)
          : null;

      const [playerSnap, nextPlayerSnap] = await Promise.all([
        tx.get(playerRef),
        nextPlayerRef ? tx.get(nextPlayerRef) : Promise.resolve(null),
      ]);

      if (!playerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');
      const player = playerSnap.data() as RoomPlayerDoc;
      if ((player.goldCards ?? 0) < 1) throw new Error('NO_GOLD_CARD');

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const roundsComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : room.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;
      const nextTurnNonce = room.turnNonce + 1;

      const goldEvent = {
        nonce: nextTurnNonce,
        type: 'gold' as const,
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

      if (roundsComplete) {
        tx.update(roomRef, {
          status: 'finished',
          currentTurnIndex: 0,
          currentRound: Math.min(room.currentRound, room.roundsCount),
          totalTurnsCompleted: nextTotalTurns,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: nextTurnNonce,
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
          turnNonce: nextTurnNonce,
          turnQuestionsRemaining: 1,
          lastCardEvent: goldEvent,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const incomingPlayer = nextPlayerSnap?.exists() ? (nextPlayerSnap.data() as RoomPlayerDoc) : null;
      let nextTurnQuestionsRemaining = 1;
      if (!stayForSecondPenaltyQuestion && incomingPlayer?.pendingDoubleTurn && !incomingPlayer?.doublePenaltyUsed && nextPlayerRef) {
        nextTurnQuestionsRemaining = 2;
        tx.update(nextPlayerRef, {
          pendingDoubleTurn: false,
          doublePenaltyUsed: true,
        });
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: nextActiveUid,
        turnNonce: nextTurnNonce,
        turnQuestionsRemaining: nextTurnQuestionsRemaining,
        lastCardEvent: goldEvent,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'NO_GOLD_CARD', 'CANNOT_REFUSE_FORCED_TURN'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function useSwitchCard(roomCode: string, targetUid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (targetUid === user.uid) throw new Error('CANNOT_SWITCH_SELF');

  const roomRef = doc(db, 'rooms', roomCode);
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);
  const targetRef = doc(db, 'rooms', roomCode, 'players', targetUid);

  try {
    await runTransaction(db, async (tx) => {
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
      if (room.turnMode !== 'normal') throw new Error('SWITCH_ALREADY_ACTIVE');
      if (room.activePlayerId !== user.uid) throw new Error('NOT_YOUR_TURN');
      if ((player.switchCards ?? 0) < 1) throw new Error('NO_SWITCH_CARD');

      const nextNonce = room.turnNonce + 1;
      tx.update(playerRef, {
        switchCards: player.switchCards - 1,
        lastSeenAt: serverTimestamp(),
      });

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
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'NO_SWITCH_CARD', 'SWITCH_ALREADY_ACTIVE', 'CANNOT_SWITCH_SELF'].includes(
        error.message
      )
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function useAntiSwitchCard(roomCode: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const roomRef = doc(db, 'rooms', roomCode);
  const myRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = roomSnap.data() as RoomDoc;

      if (room.status !== 'playing' || room.turnMode !== 'switch_pending' || !room.switchSourceId) {
        throw new Error('NO_ACTIVE_SWITCH');
      }
      if (room.switchTargetId !== user.uid) throw new Error('NOT_SWITCH_TARGET');

      const sourceRef = doc(db, 'rooms', roomCode, 'players', room.switchSourceId);
      const [mySnap, sourceSnap] = await Promise.all([tx.get(myRef), tx.get(sourceRef)]);
      if (!mySnap.exists()) throw new Error('PLAYER_NOT_FOUND');

      const myPlayer = mySnap.data() as RoomPlayerDoc;
      if ((myPlayer.antiSwitchCards ?? 0) < 1) throw new Error('NO_ANTI_SWITCH_CARD');
      const sourceName = sourceSnap.exists() ? (sourceSnap.data() as RoomPlayerDoc).name : '';

      const nextNonce = room.turnNonce + 1;
      tx.update(myRef, {
        antiSwitchCards: myPlayer.antiSwitchCards - 1,
        lastSeenAt: serverTimestamp(),
      });

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
  const user = auth.currentUser;
  saveActiveRoom(null);
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
          tx.update(roomRef, {
            status: 'closed',
            updatedAt: serverTimestamp(),
          });
        }
        return;
      }

      const isLeavingHost = room.hostId === user.uid;
      const nextHostId = isLeavingHost ? nextOrder[0] : room.hostId;
      const nextHostRef = doc(db, 'rooms', roomCode, 'players', nextHostId);
      if (isLeavingHost) {
        await tx.get(nextHostRef);
      }

      const wasPlaying = room.status === 'playing';
      const tooFewPlayers = wasPlaying && nextOrder.length < 2;

      let nextIndex = room.currentTurnIndex;
      if (nextIndex >= nextOrder.length) {
        nextIndex = 0;
      }
      const nextStatus = tooFewPlayers ? 'finished' : room.status;
      const clearSwitch =
        tooFewPlayers ||
        room.switchSourceId === user.uid ||
        room.switchTargetId === user.uid ||
        room.activePlayerId === user.uid;

      const nextActivePlayerId =
        nextStatus === 'playing'
          ? clearSwitch
            ? nextOrder[nextIndex]
            : room.activePlayerId
          : null;
      const nextQuestionId = tooFewPlayers ? null : room.currentQuestionId;

      const roomUpdate: Record<string, unknown> = {
        ...(isLeavingHost ? { hostId: nextHostId } : {}),
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        currentTurnIndex: nextIndex,
        activePlayerId: nextActivePlayerId,
        currentQuestionId: nextQuestionId,
        turnQuestionsRemaining: clearSwitch ? 1 : (room.turnQuestionsRemaining ?? 1),
        turnMode: clearSwitch ? 'normal' : room.turnMode,
        switchSourceId: clearSwitch ? null : room.switchSourceId,
        switchTargetId: clearSwitch ? null : room.switchTargetId,
        turnNonce: room.turnNonce + 1,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };

      if (isLeavingHost) {
        tx.update(nextHostRef, { isHost: true });
      }
      tx.update(roomRef, roomUpdate);
      tx.delete(playerRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function claimDisconnectedHost(roomCode: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const roomRef = doc(db, 'rooms', roomCode);
  const myRef = doc(db, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;
      if (room.hostId === user.uid || !room.playerOrder.includes(user.uid)) return;

      const oldHostRef = doc(db, 'rooms', roomCode, 'players', room.hostId);
      const [oldHostSnap] = await Promise.all([tx.get(oldHostRef), tx.get(myRef)]);
      if (oldHostSnap.exists() && (oldHostSnap.data() as RoomPlayerDoc).connected) {
        return;
      }

      tx.update(roomRef, {
        hostId: user.uid,
        updatedAt: serverTimestamp(),
      });
      if (oldHostSnap.exists()) {
        tx.update(oldHostRef, { isHost: false });
      }
      tx.update(myRef, { isHost: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomCode}`);
  }
}

export async function setPlayerConnectionState(
  roomCode: string,
  connected: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);
  try {
    await updateDoc(playerRef, {
      connected,
      lastSeenAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient disconnect heartbeat errors
  }
}

export async function setPlayerVoiceState(
  roomCode: string,
  voiceJoined: boolean,
  micMuted: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const playerRef = doc(db, 'rooms', roomCode, 'players', user.uid);
  try {
    await updateDoc(playerRef, {
      voiceJoined,
      micMuted,
      lastSeenAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient voice state sync errors
  }
}

function buildReplyPayload(replyTo?: ChatReplyReference | null): Partial<ChatReplyReference> {
  if (!replyTo) return {};
  const preview = replyTo.replyToPreviewText.trim().slice(0, 160) || '...';
  const sender = replyTo.replyToSenderName.trim().slice(0, 24) || 'Player';
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
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) return;

  const cleanName = (senderName || 'Player').trim().slice(0, 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...memberIds])).slice(0, 12);

  try {
    await addDoc(collection(db, 'rooms', roomCode, 'messages'), {
      senderId: user.uid,
      senderName: cleanName,
      text: cleanText,
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
  if (!myUid) return () => {};
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
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const tb = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      onMessages(list.slice(-100));
    },
    (err) => {
      if (onError) {
        onError(err);
      }
    }
  );
}

export async function sendRoomStickerMessage(
  roomCode: string,
  senderName: string,
  sticker: PersonalSticker,
  memberIds: string[],
  replyTo?: ChatReplyReference | null
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!sticker.imageUrl.startsWith('https://')) {
    throw new Error('INVALID_STICKER_URL');
  }

  const cleanName = (senderName || 'Player').trim().slice(0, 24) || 'Player';
  const cleanCreatorName = (sticker.creatorName || cleanName).trim().slice(0, 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...memberIds])).slice(0, 12);

  try {
    await addDoc(collection(db, 'rooms', roomCode, 'messages'), {
      senderId: user.uid,
      senderName: cleanName,
      text: '[Sticker]',
      memberIds: safeMembers,
      messageType: 'sticker',
      stickerId: sticker.stickerId,
      stickerUrl: sticker.imageUrl,
      stickerStoragePath: sticker.storagePath,
      stickerCreatorId: sticker.creatorUid,
      stickerCreatorName: cleanCreatorName,
      stickerContentHash: sticker.contentHash,
      ...buildReplyPayload(replyTo),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomCode}/messages`);
  }
}

function getAudioExtensionFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
}

export async function uploadAndSendVoiceMessage(params: {
  roomCode: string;
  senderName: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
  memberIds: string[];
  replyTo?: ChatReplyReference | null;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const safeMime = (params.mimeType || params.blob.type || 'audio/webm').split(';')[0].trim();
  if (!safeMime.startsWith('audio/')) {
    throw new Error('VOICE_INVALID_FORMAT');
  }
  if (params.blob.size > 5 * 1024 * 1024) {
    throw new Error('VOICE_TOO_LARGE');
  }

  const safeDuration = Math.min(300, Math.max(1, Math.round(params.durationSec)));
  const ext = getAudioExtensionFromMime(safeMime);
  const voiceId = `voc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `voiceMessages/${params.roomCode}/${user.uid}/${voiceId}.${ext}`;
  const fileRef = storageRef(storage, path);

  let downloadUrl = '';
  try {
    await uploadBytes(fileRef, params.blob, {
      contentType: safeMime,
      cacheControl: 'public,max-age=604800',
    });
    downloadUrl = await getDownloadURL(fileRef);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    if (
      code === 'storage/bucket-not-found' ||
      code === 'storage/project-not-found' ||
      code === 'storage/unauthorized' ||
      code === 'storage/unknown' ||
      msg.includes('404') ||
      msg.includes('Not Found')
    ) {
      throw new Error('VOICE_STORAGE_UNAVAILABLE');
    }
    throw new Error('VOICE_UPLOAD_FAILED');
  }

  const cleanName = (params.senderName || 'Player').trim().slice(0, 24) || 'Player';
  const safeMembers = Array.from(new Set([user.uid, ...params.memberIds])).slice(0, 12);

  try {
    await addDoc(collection(db, 'rooms', params.roomCode, 'messages'), {
      senderId: user.uid,
      senderName: cleanName,
      text: `[Voice ${safeDuration}s]`,
      memberIds: safeMembers,
      messageType: 'voice',
      audioUrl: downloadUrl,
      audioStoragePath: path,
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
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const reactionId = `${params.messageId}_${user.uid}`;
  const ref = doc(db, 'rooms', params.roomCode, 'messageReactions', reactionId);

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
  if (!myUid) return () => {};
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

export function subscribeToMyStickers(
  myUid: string,
  onStickers: (stickers: PersonalSticker[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!myUid) {
    onStickers([]);
    return () => {};
  }
  const q = query(
    collection(db, 'playerStickers', myUid, 'items'),
    where('ownerId', '==', myUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: PersonalSticker[] = snap.docs.map((d) => d.data() as PersonalSticker);
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onStickers(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function uploadPersonalSticker(params: {
  blob: Blob;
  mimeType: string;
  extension: 'png' | 'webp' | 'jpg';
  contentHash: string;
  creatorName: string;
}): Promise<{ status: 'added' | 'already_exists'; sticker: PersonalSticker }> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const itemsCol = collection(db, 'playerStickers', user.uid, 'items');
  try {
    const dupSnap = await getDocs(
      query(itemsCol, where('ownerId', '==', user.uid), where('contentHash', '==', params.contentHash))
    );
    if (!dupSnap.empty) {
      return {
        status: 'already_exists',
        sticker: dupSnap.docs[0].data() as PersonalSticker,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `playerStickers/${user.uid}/items`);
  }

  const stickerId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `stickers/${user.uid}/${stickerId}.${params.extension}`;
  const fileRef = storageRef(storage, path);

  let downloadUrl = '';
  try {
    await uploadBytes(fileRef, params.blob, {
      contentType: params.mimeType,
      cacheControl: 'public,max-age=31536000',
    });
    downloadUrl = await getDownloadURL(fileRef);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    if (
      code === 'storage/bucket-not-found' ||
      code === 'storage/project-not-found' ||
      code === 'storage/unauthorized' ||
      code === 'storage/unknown' ||
      msg.includes('404') ||
      msg.includes('Not Found')
    ) {
      throw new Error('STICKER_STORAGE_UNAVAILABLE');
    }
    throw new Error('STICKER_UPLOAD_FAILED');
  }

  const cleanCreatorName = (params.creatorName || 'Player').trim().slice(0, 24) || 'Player';
  const record: PersonalSticker = {
    stickerId,
    ownerId: user.uid,
    creatorUid: user.uid,
    creatorName: cleanCreatorName,
    imageUrl: downloadUrl,
    storagePath: path,
    contentHash: params.contentHash,
    isSavedFromOther: false,
    createdAt: null,
  };

  try {
    await setDoc(doc(db, 'playerStickers', user.uid, 'items', stickerId), {
      ...record,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `playerStickers/${user.uid}/items/${stickerId}`);
  }

  return { status: 'added', sticker: record };
}

export async function saveStickerToMyCollection(params: {
  stickerId: string;
  imageUrl: string;
  storagePath: string;
  contentHash: string;
  creatorUid: string;
  creatorName: string;
}): Promise<'saved' | 'already_exists'> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!params.imageUrl.startsWith('https://')) {
    throw new Error('INVALID_STICKER_URL');
  }

  const targetRef = doc(db, 'playerStickers', user.uid, 'items', params.stickerId);
  try {
    const existingIdSnap = await getDoc(targetRef);
    if (existingIdSnap.exists()) {
      return 'already_exists';
    }
    const dupHashSnap = await getDocs(
      query(
        collection(db, 'playerStickers', user.uid, 'items'),
        where('ownerId', '==', user.uid),
        where('contentHash', '==', params.contentHash)
      )
    );
    if (!dupHashSnap.empty) {
      return 'already_exists';
    }

    const cleanCreatorName = (params.creatorName || 'Player').trim().slice(0, 24) || 'Player';
    await setDoc(targetRef, {
      stickerId: params.stickerId,
      ownerId: user.uid,
      creatorUid: params.creatorUid,
      creatorName: cleanCreatorName,
      imageUrl: params.imageUrl,
      storagePath: params.storagePath,
      contentHash: params.contentHash,
      isSavedFromOther: params.creatorUid !== user.uid,
      createdAt: serverTimestamp(),
    });
    return 'saved';
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `playerStickers/${user.uid}/items/${params.stickerId}`);
  }
}

export async function deletePersonalSticker(stickerId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'playerStickers', user.uid, 'items', stickerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `playerStickers/${user.uid}/items/${stickerId}`);
  }
}

export async function sendVoiceSignal(
  roomCode: string,
  toUid: string,
  type: 'offer' | 'answer' | 'ice',
  payload: string
): Promise<void> {
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
    // Ephemeral signaling packet best-effort
  }
}

export async function deleteVoiceSignal(roomCode: string, signalId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rooms', roomCode, 'voiceSignals', signalId));
  } catch {
    // Ignore already deleted signal
  }
}

export function subscribeToVoiceSignals(
  roomCode: string,
  myUid: string,
  onSignals: (signals: VoiceSignalDoc[]) => void
): Unsubscribe {
  if (!myUid) return () => {};
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
    () => {
      // ignore transient listener error during room exit
    }
  );
}

export function subscribeToRoomAndPlayers(
  roomCode: string,
  onData: (room: RoomDoc | null, players: Record<string, RoomPlayerDoc>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const roomRef = doc(db, 'rooms', roomCode);
  const playerUnsubs = new Map<string, Unsubscribe>();
  let latestRoom: RoomDoc | null = null;
  const latestPlayers: Record<string, RoomPlayerDoc> = {};

  const emit = () => {
    onData(latestRoom, { ...latestPlayers });
  };

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

      const desiredIds = new Set(room.playerOrder);
      for (const [pid, unsub] of playerUnsubs.entries()) {
        if (!desiredIds.has(pid)) {
          unsub();
          playerUnsubs.delete(pid);
          delete latestPlayers[pid];
        }
      }
      for (const pid of room.playerOrder) {
        if (!playerUnsubs.has(pid)) {
          const pRef = doc(db, 'rooms', roomCode, 'players', pid);
          const unsubP = onSnapshot(
            pRef,
            (pSnap) => {
              if (pSnap.exists()) {
                latestPlayers[pid] = pSnap.data() as RoomPlayerDoc;
              } else {
                delete latestPlayers[pid];
              }
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
          playerUnsubs.set(pid, unsubP);
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
    for (const unsub of playerUnsubs.values()) {
      unsub();
    }
    playerUnsubs.clear();
  };
}
