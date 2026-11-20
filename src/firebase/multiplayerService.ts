import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './config';
import { pickAvatarPalette } from '../config/brand';
import { drawRandomUnusedQuestionId, shuffleArray, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import type { Language } from '../i18n/translations';
import type { GameLengthMode, RoomDoc, RoomPlayerDoc } from '../types/game';

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt,
  });

  batch.set(playerRef, {
    uid: user.uid,
    name: cleanName,
    avatarColor: pickAvatarPalette(user.uid),
    isHost: true,
    skipsRemaining: 3,
    skipsUsed: 0,
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
        skipsRemaining: 3,
        skipsUsed: 0,
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
        updatedAt: serverTimestamp(),
      });

      if (isRestart) {
        for (const pid of nextOrder) {
          tx.update(doc(db, 'rooms', roomCode, 'players', pid), {
            skipsRemaining: 3,
            skipsUsed: 0,
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
      if (room.status !== 'playing') return;
      if (room.activePlayerId !== user.uid && room.hostId !== user.uid) {
        throw new Error('NOT_YOUR_TURN');
      }

      let nextIndex = room.currentTurnIndex + 1;
      let nextRound = room.currentRound;
      if (nextIndex >= room.playerOrder.length) {
        nextIndex = 0;
        nextRound += 1;
      }

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const roundsComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : nextTotalTurns >= TOTAL_QUESTIONS_COUNT;

      if (roundsComplete) {
        tx.update(roomRef, {
          status: 'finished',
          currentTurnIndex: 0,
          currentRound: Math.min(room.currentRound, room.roundsCount),
          totalTurnsCompleted: nextTotalTurns,
          completedQuestionsCount: room.completedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
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
          completedQuestionsCount: room.completedQuestionsCount + 1,
          currentQuestionId: null,
          activePlayerId: null,
          turnNonce: room.turnNonce + 1,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        completedQuestionsCount: room.completedQuestionsCount + 1,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: room.playerOrder[nextIndex],
        turnNonce: room.turnNonce + 1,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && ['ROOM_NOT_FOUND', 'NOT_YOUR_TURN'].includes(error.message)) {
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
      const [roomSnap, playerSnap] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
      if (!roomSnap.exists()) throw new Error('ROOM_NOT_FOUND');
      if (!playerSnap.exists()) throw new Error('PLAYER_NOT_FOUND');

      const room = roomSnap.data() as RoomDoc;
      const player = playerSnap.data() as RoomPlayerDoc;

      if (room.status !== 'playing') return;
      if (room.activePlayerId !== user.uid) throw new Error('NOT_YOUR_TURN');
      if (player.skipsRemaining < 1) throw new Error('NO_SKIPS_LEFT');

      let nextIndex = room.currentTurnIndex + 1;
      let nextRound = room.currentRound;
      if (nextIndex >= room.playerOrder.length) {
        nextIndex = 0;
        nextRound += 1;
      }

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const roundsComplete =
        room.gameMode === 'rounds'
          ? nextRound > room.roundsCount
          : nextTotalTurns >= TOTAL_QUESTIONS_COUNT;

      tx.update(playerRef, {
        skipsRemaining: player.skipsRemaining - 1,
        skipsUsed: player.skipsUsed + 1,
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
          updatedAt: serverTimestamp(),
        });
        return;
      }

      tx.update(roomRef, {
        status: 'playing',
        currentTurnIndex: nextIndex,
        currentRound: Math.min(nextRound, 31),
        totalTurnsCompleted: nextTotalTurns,
        skippedQuestionsCount: room.skippedQuestionsCount + 1,
        currentQuestionId: nextQ,
        usedQuestionIds: [...room.usedQuestionIds, nextQ],
        activePlayerId: room.playerOrder[nextIndex],
        turnNonce: room.turnNonce + 1,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['ROOM_NOT_FOUND', 'PLAYER_NOT_FOUND', 'NOT_YOUR_TURN', 'NO_SKIPS_LEFT'].includes(error.message)
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
      const nextActivePlayerId =
        nextStatus === 'playing' ? nextOrder[nextIndex] : null;
      const nextQuestionId = tooFewPlayers ? null : room.currentQuestionId;

      if (isLeavingHost) {
        tx.update(nextHostRef, { isHost: true });
        tx.update(roomRef, {
          hostId: nextHostId,
          playerOrder: nextOrder,
          playerCount: nextOrder.length,
          currentTurnIndex: nextIndex,
          activePlayerId: nextActivePlayerId,
          currentQuestionId: nextQuestionId,
          turnNonce: room.turnNonce + 1,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(roomRef, {
          playerOrder: nextOrder,
          playerCount: nextOrder.length,
          currentTurnIndex: nextIndex,
          activePlayerId: nextActivePlayerId,
          currentQuestionId: nextQuestionId,
          turnNonce: room.turnNonce + 1,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
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
