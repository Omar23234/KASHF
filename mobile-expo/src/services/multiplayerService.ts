import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInAnonymously } from 'firebase/auth';
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
import { drawRandomUnusedQuestionId, shuffleArray, TOTAL_QUESTIONS_COUNT } from '../data/questions';
import {
  auth,
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  testConnection,
} from '../firebase/config';
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

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE_ROOM_KEY = 'kashf_active_room_code';
const PLAYER_NAME_KEY = 'kashf_player_name';
const PALETTE_IDS = ['electric', 'violet', 'cobalt', 'magenta', 'cyan', 'emerald', 'amber', 'rose'];

export function pickAvatarPalette(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE_IDS[hash % PALETTE_IDS.length];
}

export function getMaxRoundsForPlayers(playerCount: number): number {
  return Math.max(1, Math.floor(TOTAL_QUESTIONS_COUNT / Math.max(2, playerCount)));
}

export async function getSavedPlayerName(): Promise<string> {
  return (await AsyncStorage.getItem(PLAYER_NAME_KEY)) || '';
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
  await AsyncStorage.setItem(PLAYER_NAME_KEY, cleanName);

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
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
  await saveActiveRoom(roomCode);
  return roomCode;
}

export async function joinMultiplayerRoom(params: {
  rawCode: string;
  playerName: string;
}): Promise<{ roomCode: string; reconnected: boolean }> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomCode = params.rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error('INVALID_CODE');
  const cleanName = params.playerName.trim().slice(0, 24);
  if (!cleanName) throw new Error('INVALID_NAME');
  await AsyncStorage.setItem(PLAYER_NAME_KEY, cleanName);

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
        updatedAt: serverTimestamp(),
      });

      if (isRestart) {
        for (const pid of nextOrder) {
          tx.update(doc(firestore, 'rooms', roomCode, 'players', pid), { skipsRemaining: 3, skipsUsed: 0 });
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
      if (room.status !== 'playing') return;
      if (room.activePlayerId !== user.uid && room.hostId !== user.uid) throw new Error('NOT_YOUR_TURN');

      let nextIndex = room.currentTurnIndex + 1;
      let nextRound = room.currentRound;
      if (nextIndex >= room.playerOrder.length) {
        nextIndex = 0;
        nextRound += 1;
      }

      const nextTotalTurns = room.totalTurnsCompleted + 1;
      const isComplete =
        room.gameMode === 'rounds' ? nextRound > room.roundsCount : nextTotalTurns >= TOTAL_QUESTIONS_COUNT;

      if (isComplete) {
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
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const roomRef = doc(firestore, 'rooms', roomCode);
  const playerRef = doc(firestore, 'rooms', roomCode, 'players', user.uid);

  try {
    await runTransaction(firestore, async (tx) => {
      const [roomSnap, playerSnap] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
      if (!roomSnap.exists() || !playerSnap.exists()) throw new Error('ROOM_NOT_FOUND');
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
      const isComplete =
        room.gameMode === 'rounds' ? nextRound > room.roundsCount : nextTotalTurns >= TOTAL_QUESTIONS_COUNT;

      tx.update(playerRef, {
        skipsRemaining: player.skipsRemaining - 1,
        skipsUsed: player.skipsUsed + 1,
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
    if (error instanceof Error && ['ROOM_NOT_FOUND', 'NOT_YOUR_TURN', 'NO_SKIPS_LEFT'].includes(error.message)) {
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
      const nextActive = nextStatus === 'playing' ? nextOrder[nextIndex] : null;
      const nextQ = tooFew ? null : room.currentQuestionId;

      if (isLeavingHost) tx.update(nextHostRef, { isHost: true });
      tx.update(roomRef, {
        ...(isLeavingHost ? { hostId: nextHostId } : {}),
        playerOrder: nextOrder,
        playerCount: nextOrder.length,
        currentTurnIndex: nextIndex,
        activePlayerId: nextActive,
        currentQuestionId: nextQ,
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
