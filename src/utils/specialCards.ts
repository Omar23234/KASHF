import {
  drawRandomUnusedQuestionId,
  shuffleArray,
  TOTAL_QUESTIONS_COUNT,
} from '../data/questions';
import type {
  CardEvent,
  GameLengthMode,
  SinglePhoneGameState,
  SinglePhonePlayer,
  SpecialCardId,
  SpecialCardType,
} from '../types/game';

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

export function applyScoreDelta(currentScore: number, delta: number): number {
  return currentScore + delta;
}

/**
 * Decides randomly whether the incoming turn also awards a Special Card reward
 * from the fixed 5-card game pool (2 Gold, 2 Switch, 1 Anti-Switch).
 * Never awards cards before play begins (totalTurnsCompleted === 0) and never
 * consumes any of the 63 original questions.
 */
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
  if (totalTurnsCompleted < 1) return null;
  if (!availableSpecialCards.length) return null;

  const remainingPool = availableSpecialCards.filter((id) => !awardedCardIds.includes(id));
  if (remainingPool.length === 0) return null;

  const remainingTurns = Math.max(1, totalConfiguredTurns - totalTurnsCompleted);
  const baseRate = remainingPool.length / remainingTurns;
  const probability =
    remainingTurns <= remainingPool.length
      ? 0.95
      : Math.min(0.55, Math.max(0.18, baseRate * 1.45));

  const roll = params.randomValue ?? Math.random();
  if (roll >= probability) {
    return null;
  }

  const drawnCardId = remainingPool[0];
  const nextAvailableCards = remainingPool.slice(1);
  const nextAwardedCardIds = [...awardedCardIds, drawnCardId];

  return {
    drawnCardId,
    drawnType: getCardTypeFromId(drawnCardId),
    nextAvailableCards,
    nextAwardedCardIds,
  };
}

export function createSinglePhoneGame(params: {
  players: SinglePhonePlayer[];
  gameMode: GameLengthMode;
  roundsCount: number;
  randomFirstPlayer: boolean;
}): SinglePhoneGameState {
  const orderedPlayers = (params.randomFirstPlayer
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
    Math.max(1, Math.floor(TOTAL_QUESTIONS_COUNT / Math.max(2, orderedPlayers.length))),
    Math.max(1, params.roundsCount)
  );
  const firstQ = drawRandomUnusedQuestionId([]);
  const firstPlayerId = orderedPlayers[0]?.id ?? null;

  return {
    phase: firstQ === null ? 'exhausted' : 'playing',
    gameMode: params.gameMode,
    players: orderedPlayers,
    roundsCount: safeRounds,
    randomFirstPlayer: params.randomFirstPlayer,
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
    activePlayerId: firstQ !== null ? firstPlayerId : null,
    availableSpecialCards: createShuffledCardDeck(),
    awardedCardIds: [],
    lastCardEvent: null,
  };
}

function advanceSinglePhoneInternal(
  prev: SinglePhoneGameState,
  options: { scoreActivePlayer: boolean; usedGoldCard: boolean; randomValue?: number }
): SinglePhoneGameState {
  if (prev.phase !== 'playing') return prev;

  const updatedPlayers = prev.players.map((p) => ({ ...p }));
  const currentResponderId = prev.activePlayerId ?? updatedPlayers[prev.currentTurnIndex]?.id;

  if (options.scoreActivePlayer && currentResponderId) {
    const responder = updatedPlayers.find((p) => p.id === currentResponderId);
    if (responder) {
      responder.score = applyScoreDelta(responder.score ?? 0, 1);
    }
  }

  if (options.usedGoldCard && currentResponderId) {
    const cardUser = updatedPlayers.find((p) => p.id === currentResponderId);
    if (!cardUser || (cardUser.goldCards ?? 0) < 1) return prev;
    cardUser.goldCards = (cardUser.goldCards ?? 0) - 1;
  }

  let nextIdx = prev.currentTurnIndex + 1;
  let nextRound = prev.currentRound;
  if (nextIdx >= updatedPlayers.length) {
    nextIdx = 0;
    nextRound += 1;
  }

  const nextTotalTurns = prev.totalTurnsCompleted + 1;
  const nextCompleted = options.scoreActivePlayer
    ? prev.completedQuestionsCount + 1
    : prev.completedQuestionsCount;

  const totalConfiguredTurns =
    prev.gameMode === 'all_questions'
      ? TOTAL_QUESTIONS_COUNT
      : updatedPlayers.length * prev.roundsCount;

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
      totalTurnsCompleted: nextTotalTurns,
      completedQuestionsCount: nextCompleted,
      currentQuestionId: null,
      turnNonce: nextNonce,
      turnMode: 'normal',
      switchSourceId: null,
      switchTargetId: null,
      activePlayerId: null,
      lastCardEvent: options.usedGoldCard && currentResponderId
        ? {
            nonce: nextNonce,
            type: 'gold',
            cardId: 'gold',
            actorUid: currentResponderId,
            actorName: updatedPlayers.find((p) => p.id === currentResponderId)?.name ?? '',
            targetUid: null,
            targetName: null,
          }
        : null,
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
      totalTurnsCompleted: nextTotalTurns,
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

  const nextActivePlayer = updatedPlayers[nextIdx];
  const cardRoll = maybeDrawSpecialCardFromPool({
    availableSpecialCards: prev.availableSpecialCards,
    awardedCardIds: prev.awardedCardIds,
    totalTurnsCompleted: nextTotalTurns,
    totalConfiguredTurns,
    randomValue: options.randomValue,
  });

  let nextAvailableCards = prev.availableSpecialCards;
  let nextAwardedIds = prev.awardedCardIds;
  let event: CardEvent | null =
    options.usedGoldCard && currentResponderId
      ? {
          nonce: nextNonce,
          type: 'gold',
          cardId: 'gold',
          actorUid: currentResponderId,
          actorName: updatedPlayers.find((p) => p.id === currentResponderId)?.name ?? '',
          targetUid: null,
          targetName: null,
        }
      : null;

  if (cardRoll && nextActivePlayer) {
    nextAvailableCards = cardRoll.nextAvailableCards;
    nextAwardedIds = cardRoll.nextAwardedCardIds;
    if (cardRoll.drawnType === 'gold') {
      nextActivePlayer.goldCards = (nextActivePlayer.goldCards ?? 0) + 1;
    } else if (cardRoll.drawnType === 'switch') {
      nextActivePlayer.switchCards = (nextActivePlayer.switchCards ?? 0) + 1;
    } else {
      nextActivePlayer.antiSwitchCards = (nextActivePlayer.antiSwitchCards ?? 0) + 1;
    }
    event = {
      nonce: nextNonce,
      type: 'awarded',
      cardId: cardRoll.drawnCardId,
      actorUid: nextActivePlayer.id,
      actorName: nextActivePlayer.name,
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
    totalTurnsCompleted: nextTotalTurns,
    completedQuestionsCount: nextCompleted,
    currentQuestionId: nextQ,
    usedQuestionIds: [...prev.usedQuestionIds, nextQ],
    turnNonce: nextNonce,
    turnMode: 'normal',
    switchSourceId: null,
    switchTargetId: null,
    activePlayerId: nextActivePlayer?.id ?? null,
    availableSpecialCards: nextAvailableCards,
    awardedCardIds: nextAwardedIds,
    lastCardEvent: event,
  };
}

export function answerSinglePhoneQuestion(
  prev: SinglePhoneGameState,
  randomValue?: number
): SinglePhoneGameState {
  return advanceSinglePhoneInternal(prev, {
    scoreActivePlayer: true,
    usedGoldCard: false,
    randomValue,
  });
}

export function useSinglePhoneGoldCard(
  prev: SinglePhoneGameState,
  randomValue?: number
): SinglePhoneGameState {
  if (prev.turnMode !== 'normal') return prev;
  return advanceSinglePhoneInternal(prev, {
    scoreActivePlayer: false,
    usedGoldCard: true,
    randomValue,
  });
}

export function useSinglePhoneSwitchCard(
  prev: SinglePhoneGameState,
  targetPlayerId: string
): SinglePhoneGameState {
  if (prev.phase !== 'playing' || prev.turnMode !== 'normal') return prev;
  const activeId = prev.activePlayerId ?? prev.players[prev.currentTurnIndex]?.id;
  if (!activeId || targetPlayerId === activeId) return prev;

  const updatedPlayers = prev.players.map((p) => ({ ...p }));
  const actor = updatedPlayers.find((p) => p.id === activeId);
  const target = updatedPlayers.find((p) => p.id === targetPlayerId);
  if (!actor || !target || (actor.switchCards ?? 0) < 1) return prev;

  actor.switchCards = (actor.switchCards ?? 0) - 1;
  const nextNonce = prev.turnNonce + 1;

  return {
    ...prev,
    players: updatedPlayers,
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

export function useSinglePhoneAntiSwitchCard(
  prev: SinglePhoneGameState
): SinglePhoneGameState {
  if (
    prev.phase !== 'playing' ||
    prev.turnMode !== 'switch_pending' ||
    !prev.switchSourceId ||
    !prev.switchTargetId
  ) {
    return prev;
  }

  const updatedPlayers = prev.players.map((p) => ({ ...p }));
  const target = updatedPlayers.find((p) => p.id === prev.switchTargetId);
  const source = updatedPlayers.find((p) => p.id === prev.switchSourceId);
  if (!target || !source || (target.antiSwitchCards ?? 0) < 1) return prev;

  target.antiSwitchCards = (target.antiSwitchCards ?? 0) - 1;
  const nextNonce = prev.turnNonce + 1;

  return {
    ...prev,
    players: updatedPlayers,
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
