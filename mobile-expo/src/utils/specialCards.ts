import {
  drawRandomUnusedQuestionId,
  shuffleArray,
  TOTAL_QUESTIONS_COUNT,
} from '../data/questions';

export type SpecialCardType = 'gold' | 'switch' | 'anti_switch';
export type SpecialCardId = 'gold_1' | 'gold_2' | 'switch_1' | 'switch_2' | 'anti_switch_1';
export type TurnMode = 'normal' | 'switch_pending' | 'anti_switch_forced';
export type CardEventType = 'awarded' | 'gold' | 'switch' | 'anti_switch';
export type GameLengthMode = 'rounds' | 'all_questions';

export interface CardEvent {
  nonce: number;
  type: CardEventType;
  cardId: string;
  actorUid: string;
  actorName: string;
  targetUid: string | null;
  targetName: string | null;
}

export interface SinglePhonePlayer {
  id: string;
  name: string;
  score?: number;
  goldCards?: number;
  switchCards?: number;
  antiSwitchCards?: number;
}

export interface SinglePhoneGame {
  phase: 'playing' | 'finished' | 'exhausted';
  gameMode: GameLengthMode;
  players: SinglePhonePlayer[];
  roundsCount: number;
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

export const INITIAL_SPECIAL_CARDS: readonly SpecialCardId[] = [
  'gold_1',
  'gold_2',
  'switch_1',
  'switch_2',
  'anti_switch_1',
];

export function getCardTypeFromId(cardId: string): SpecialCardType {
  if (cardId.startsWith('gold')) return 'gold';
  if (cardId.startsWith('switch')) return 'switch';
  return 'anti_switch';
}

export function createShuffledCardDeck(): SpecialCardId[] {
  return shuffleArray([...INITIAL_SPECIAL_CARDS]);
}

export function maybeDrawSpecialCardFromPool(params: {
  availableSpecialCards: SpecialCardId[];
  awardedCardIds: SpecialCardId[];
  totalTurnsCompleted: number;
  totalConfiguredTurns: number;
  randomValue?: number;
}): {
  drawnCardId: SpecialCardId;
  drawnType: SpecialCardType;
  nextAvailableCards: SpecialCardId[];
  nextAwardedCardIds: SpecialCardId[];
} | null {
  const { availableSpecialCards, awardedCardIds, totalTurnsCompleted, totalConfiguredTurns } = params;
  if (totalTurnsCompleted < 1 || !availableSpecialCards.length) return null;

  const remainingPool = availableSpecialCards.filter((id) => !awardedCardIds.includes(id));
  if (remainingPool.length === 0) return null;

  const remainingTurns = Math.max(1, totalConfiguredTurns - totalTurnsCompleted);
  const baseRate = remainingPool.length / remainingTurns;
  const probability =
    remainingTurns <= remainingPool.length
      ? 0.95
      : Math.min(0.55, Math.max(0.18, baseRate * 1.45));

  const roll = params.randomValue ?? Math.random();
  if (roll >= probability) return null;

  const drawnCardId = remainingPool[0];
  return {
    drawnCardId,
    drawnType: getCardTypeFromId(drawnCardId),
    nextAvailableCards: remainingPool.slice(1),
    nextAwardedCardIds: [...awardedCardIds, drawnCardId],
  };
}

export function createSinglePhoneGame(params: {
  players: SinglePhonePlayer[];
  gameMode: GameLengthMode;
  roundsCount: number;
  randomFirstPlayer: boolean;
}): SinglePhoneGame {
  const ordered = (params.randomFirstPlayer
    ? shuffleArray(params.players)
    : [...params.players]
  ).map((p) => ({
    ...p,
    score: 0,
    goldCards: 0,
    switchCards: 0,
    antiSwitchCards: 0,
  }));

  const safeRounds = Math.min(
    Math.max(1, Math.floor(TOTAL_QUESTIONS_COUNT / Math.max(2, ordered.length))),
    Math.max(1, params.roundsCount)
  );
  const firstQ = drawRandomUnusedQuestionId([]);
  return {
    phase: firstQ === null ? 'exhausted' : 'playing',
    gameMode: params.gameMode,
    players: ordered,
    roundsCount: safeRounds,
    currentTurnIndex: 0,
    currentRound: 1,
    totalTurnsCompleted: 0,
    completedQuestionsCount: 0,
    currentQuestionId: firstQ,
    usedQuestionIds: firstQ !== null ? [firstQ] : [],
    turnNonce: 1,
    turnMode: 'normal',
    switchSourceId: null,
    switchTargetId: null,
    activePlayerId: firstQ !== null ? ordered[0]?.id ?? null : null,
    availableSpecialCards: createShuffledCardDeck(),
    awardedCardIds: [],
    lastCardEvent: null,
  };
}

function advanceSingleInternal(
  prev: SinglePhoneGame,
  options: { scoreActivePlayer: boolean; usedGoldCard: boolean }
): SinglePhoneGame {
  if (prev.phase !== 'playing') return prev;
  const updatedPlayers = prev.players.map((p) => ({ ...p }));
  const responderId = prev.activePlayerId ?? updatedPlayers[prev.currentTurnIndex]?.id;

  if (options.scoreActivePlayer && responderId) {
    const p = updatedPlayers.find((x) => x.id === responderId);
    if (p) p.score = (p.score ?? 0) + 1;
  }

  if (options.usedGoldCard && responderId) {
    const p = updatedPlayers.find((x) => x.id === responderId);
    if (!p || (p.goldCards ?? 0) < 1) return prev;
    p.goldCards = (p.goldCards ?? 0) - 1;
  }

  let nextIdx = prev.currentTurnIndex + 1;
  let nextRound = prev.currentRound;
  if (nextIdx >= updatedPlayers.length) {
    nextIdx = 0;
    nextRound += 1;
  }

  const nextTotal = prev.totalTurnsCompleted + 1;
  const nextCompleted = options.scoreActivePlayer
    ? prev.completedQuestionsCount + 1
    : prev.completedQuestionsCount;
  const isComplete =
    prev.gameMode === 'rounds'
      ? nextRound > prev.roundsCount
      : prev.usedQuestionIds.length >= TOTAL_QUESTIONS_COUNT;
  const nextNonce = prev.turnNonce + 1;

  if (isComplete) {
    return {
      ...prev,
      phase: 'finished',
      players: updatedPlayers,
      currentTurnIndex: 0,
      currentRound: prev.roundsCount,
      totalTurnsCompleted: nextTotal,
      completedQuestionsCount: nextCompleted,
      currentQuestionId: null,
      turnNonce: nextNonce,
      turnMode: 'normal',
      switchSourceId: null,
      switchTargetId: null,
      activePlayerId: null,
      lastCardEvent: null,
    };
  }

  const nextQ = drawRandomUnusedQuestionId(prev.usedQuestionIds);
  if (nextQ === null) {
    return {
      ...prev,
      phase: 'exhausted',
      players: updatedPlayers,
      currentTurnIndex: nextIdx,
      currentRound: nextRound,
      totalTurnsCompleted: nextTotal,
      completedQuestionsCount: nextCompleted,
      currentQuestionId: null,
      turnNonce: nextNonce,
      turnMode: 'normal',
      switchSourceId: null,
      switchTargetId: null,
      activePlayerId: null,
      lastCardEvent: null,
    };
  }

  const totalTurns =
    prev.gameMode === 'all_questions'
      ? TOTAL_QUESTIONS_COUNT
      : updatedPlayers.length * prev.roundsCount;
  const incomingPlayer = updatedPlayers[nextIdx];
  const roll = maybeDrawSpecialCardFromPool({
    availableSpecialCards: prev.availableSpecialCards,
    awardedCardIds: prev.awardedCardIds,
    totalTurnsCompleted: nextTotal,
    totalConfiguredTurns: totalTurns,
  });

  let nextAvail = prev.availableSpecialCards;
  let nextAwarded = prev.awardedCardIds;
  let evt: CardEvent | null =
    options.usedGoldCard && responderId
      ? {
          nonce: nextNonce,
          type: 'gold',
          cardId: 'gold',
          actorUid: responderId,
          actorName: updatedPlayers.find((x) => x.id === responderId)?.name ?? '',
          targetUid: null,
          targetName: null,
        }
      : null;

  if (roll && incomingPlayer) {
    nextAvail = roll.nextAvailableCards;
    nextAwarded = roll.nextAwardedCardIds;
    if (roll.drawnType === 'gold') incomingPlayer.goldCards = (incomingPlayer.goldCards ?? 0) + 1;
    else if (roll.drawnType === 'switch')
      incomingPlayer.switchCards = (incomingPlayer.switchCards ?? 0) + 1;
    else incomingPlayer.antiSwitchCards = (incomingPlayer.antiSwitchCards ?? 0) + 1;

    evt = {
      nonce: nextNonce,
      type: 'awarded',
      cardId: roll.drawnCardId,
      actorUid: incomingPlayer.id,
      actorName: incomingPlayer.name,
      targetUid: null,
      targetName: null,
    };
  }

  return {
    ...prev,
    phase: 'playing',
    players: updatedPlayers,
    currentTurnIndex: nextIdx,
    currentRound: nextRound,
    totalTurnsCompleted: nextTotal,
    completedQuestionsCount: nextCompleted,
    currentQuestionId: nextQ,
    usedQuestionIds: [...prev.usedQuestionIds, nextQ],
    turnNonce: nextNonce,
    turnMode: 'normal',
    switchSourceId: null,
    switchTargetId: null,
    activePlayerId: incomingPlayer?.id ?? null,
    availableSpecialCards: nextAvail,
    awardedCardIds: nextAwarded,
    lastCardEvent: evt,
  };
}

export function answerSinglePhoneQuestion(prev: SinglePhoneGame): SinglePhoneGame {
  return advanceSingleInternal(prev, { scoreActivePlayer: true, usedGoldCard: false });
}

export function useSinglePhoneGoldCard(prev: SinglePhoneGame): SinglePhoneGame {
  if (prev.turnMode !== 'normal') return prev;
  return advanceSingleInternal(prev, { scoreActivePlayer: false, usedGoldCard: true });
}

export function useSinglePhoneSwitchCard(
  prev: SinglePhoneGame,
  targetPlayerId: string
): SinglePhoneGame {
  if (prev.phase !== 'playing' || prev.turnMode !== 'normal') return prev;
  const activeId = prev.activePlayerId ?? prev.players[prev.currentTurnIndex]?.id;
  if (!activeId || targetPlayerId === activeId) return prev;
  const updated = prev.players.map((p) => ({ ...p }));
  const actor = updated.find((p) => p.id === activeId);
  const target = updated.find((p) => p.id === targetPlayerId);
  if (!actor || !target || (actor.switchCards ?? 0) < 1) return prev;
  actor.switchCards = (actor.switchCards ?? 0) - 1;
  const nextNonce = prev.turnNonce + 1;
  return {
    ...prev,
    players: updated,
    turnNonce: nextNonce,
    turnMode: 'switch_pending',
    switchSourceId: actor.id,
    switchTargetId: target.id,
    activePlayerId: target.id,
    lastCardEvent: {
      nonce: nextNonce,
      type: 'switch',
      cardId: 'switch',
      actorUid: actor.id,
      actorName: actor.name,
      targetUid: target.id,
      targetName: target.name,
    },
  };
}

export function useSinglePhoneAntiSwitchCard(prev: SinglePhoneGame): SinglePhoneGame {
  if (prev.phase !== 'playing' || prev.turnMode !== 'switch_pending' || !prev.switchSourceId || !prev.switchTargetId) {
    return prev;
  }
  const updated = prev.players.map((p) => ({ ...p }));
  const target = updated.find((p) => p.id === prev.switchTargetId);
  const source = updated.find((p) => p.id === prev.switchSourceId);
  if (!target || !source || (target.antiSwitchCards ?? 0) < 1) return prev;
  target.antiSwitchCards = (target.antiSwitchCards ?? 0) - 1;
  const nextNonce = prev.turnNonce + 1;
  return {
    ...prev,
    players: updated,
    turnNonce: nextNonce,
    turnMode: 'anti_switch_forced',
    switchTargetId: null,
    activePlayerId: source.id,
    lastCardEvent: {
      nonce: nextNonce,
      type: 'anti_switch',
      cardId: 'anti_switch',
      actorUid: target.id,
      actorName: target.name,
      targetUid: source.id,
      targetName: source.name,
    },
  };
}
