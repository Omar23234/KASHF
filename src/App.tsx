import React, { useEffect, useState } from 'react';
import { pickAvatarPalette } from './config/brand';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeScreen } from './components/HomeScreen';
import { HowToPlayScreen } from './components/HowToPlayScreen';
import { LayoutShell } from './components/LayoutShell';
import { OnlineEntryScreen } from './components/OnlineEntryScreen';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SinglePhoneGameScreen } from './components/SinglePhoneGameScreen';
import { SinglePhoneSetupScreen } from './components/SinglePhoneSetupScreen';
import { AppProvider, useApp } from './context/AppContext';
import { drawRandomUnusedQuestionId, shuffleArray, TOTAL_QUESTIONS_COUNT } from './data/questions';
import { getMaxRoundsForPlayers, leaveMultiplayerRoom } from './firebase/multiplayerService';
import type { GameLengthMode, SinglePhoneGameState, SinglePhonePlayer } from './types/game';
import { soundFX } from './utils/sound';

const SINGLE_PLAYERS_KEY = 'kashf_single_players';

function loadInitialSinglePlayers(): SinglePhonePlayer[] {
  try {
    const raw = localStorage.getItem(SINGLE_PLAYERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SinglePhonePlayer[];
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    }
  } catch {
    // ignore
  }
  return [
    { id: 'sp-1', name: 'أحمد', avatarColor: pickAvatarPalette(1) },
    { id: 'sp-2', name: 'محمد', avatarColor: pickAvatarPalette(2) },
    { id: 'sp-3', name: 'عمر', avatarColor: pickAvatarPalette(3) },
    { id: 'sp-4', name: 'علي', avatarColor: pickAvatarPalette(4) },
  ];
}

const AppContent: React.FC = () => {
  const { screen, setScreen, activeRoomCode, setActiveRoomCode, soundEnabled, t } = useApp();
  const [deepLinkRoomCode, setDeepLinkRoomCode] = useState<string>('');

  const [singlePlayers, setSinglePlayers] = useState<SinglePhonePlayer[]>(loadInitialSinglePlayers);
  const [singleGameMode, setSingleGameMode] = useState<GameLengthMode>('rounds');
  const [singleRoundsCount, setSingleRoundsCount] = useState(3);
  const [singleRandomFirst, setSingleRandomFirst] = useState(true);
  const [singleGame, setSingleGame] = useState<SinglePhoneGameState | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SINGLE_PLAYERS_KEY, JSON.stringify(singlePlayers));
    } catch {
      // ignore
    }
  }, [singlePlayers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && /^[A-Za-z0-9]{6}$/.test(roomParam.trim())) {
      setDeepLinkRoomCode(roomParam.trim().toUpperCase());
      setScreen('online_entry');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [setScreen]);

  const startSinglePhoneGame = () => {
    const orderedPlayers = singleRandomFirst ? shuffleArray(singlePlayers) : [...singlePlayers];
    const safeRounds = Math.min(getMaxRoundsForPlayers(orderedPlayers.length), singleRoundsCount);
    const firstQ = drawRandomUnusedQuestionId([]);
    setSingleGame({
      phase: firstQ === null ? 'exhausted' : 'playing',
      gameMode: singleGameMode,
      players: orderedPlayers,
      roundsCount: safeRounds,
      randomFirstPlayer: singleRandomFirst,
      currentTurnIndex: 0,
      currentRound: 1,
      totalTurnsCompleted: 0,
      completedQuestionsCount: 0,
      currentQuestionId: firstQ,
      usedQuestionIds: firstQ !== null ? [firstQ] : [],
    });
    setScreen('single_game');
  };

  const advanceSinglePhoneTurn = () => {
    setSingleGame((prev) => {
      if (!prev || prev.phase !== 'playing') return prev;
      let nextIdx = prev.currentTurnIndex + 1;
      let nextRound = prev.currentRound;
      if (nextIdx >= prev.players.length) {
        nextIdx = 0;
        nextRound += 1;
      }

      const nextTotalTurns = prev.totalTurnsCompleted + 1;
      const nextCompleted = prev.completedQuestionsCount + 1;

      const isComplete =
        prev.gameMode === 'rounds'
          ? nextRound > prev.roundsCount
          : nextTotalTurns >= TOTAL_QUESTIONS_COUNT;

      if (isComplete) {
        soundFX.complete(soundEnabled);
        return {
          ...prev,
          phase: 'finished',
          currentTurnIndex: 0,
          currentRound: prev.roundsCount,
          totalTurnsCompleted: nextTotalTurns,
          completedQuestionsCount: nextCompleted,
          currentQuestionId: null,
        };
      }

      const nextQ = drawRandomUnusedQuestionId(prev.usedQuestionIds);
      if (nextQ === null) {
        soundFX.complete(soundEnabled);
        return {
          ...prev,
          phase: 'exhausted',
          currentTurnIndex: nextIdx,
          currentRound: nextRound,
          totalTurnsCompleted: nextTotalTurns,
          completedQuestionsCount: nextCompleted,
          currentQuestionId: null,
        };
      }

      return {
        ...prev,
        phase: 'playing',
        currentTurnIndex: nextIdx,
        currentRound: nextRound,
        totalTurnsCompleted: nextTotalTurns,
        completedQuestionsCount: nextCompleted,
        currentQuestionId: nextQ,
        usedQuestionIds: [...prev.usedQuestionIds, nextQ],
      };
    });
  };

  const handleBack = () => {
    if (screen === 'online_lobby' || screen === 'online_game') {
      if (activeRoomCode) {
        void leaveMultiplayerRoom(activeRoomCode);
        setActiveRoomCode(null);
      }
      setScreen('home');
      return;
    }
    if (screen === 'single_game') {
      setScreen('single_setup');
      return;
    }
    setScreen('home');
  };

  const headerTitle =
    screen === 'online_lobby'
      ? `${t.lobbyTitle}${activeRoomCode ? ` · ${activeRoomCode}` : ''}`
      : undefined;

  return (
    <LayoutShell onBack={screen !== 'home' ? handleBack : undefined} title={headerTitle}>
      {screen === 'home' && <HomeScreen />}
      {screen === 'online_entry' && <OnlineEntryScreen initialRoomCode={deepLinkRoomCode} />}
      {screen === 'online_lobby' && <OnlineLobbyScreen />}
      {screen === 'online_game' && <OnlineGameScreen />}
      {screen === 'single_setup' && (
        <SinglePhoneSetupScreen
          players={singlePlayers}
          setPlayers={setSinglePlayers}
          gameMode={singleGameMode}
          setGameMode={setSingleGameMode}
          roundsCount={singleRoundsCount}
          setRoundsCount={setSingleRoundsCount}
          randomFirstPlayer={singleRandomFirst}
          setRandomFirstPlayer={setSingleRandomFirst}
          onStartGame={startSinglePhoneGame}
        />
      )}
      {screen === 'single_game' && singleGame && (
        <SinglePhoneGameScreen
          game={singleGame}
          onNextQuestion={advanceSinglePhoneTurn}
          onPlayAgain={startSinglePhoneGame}
          onReturnHome={() => setScreen('home')}
        />
      )}
      {screen === 'how_to_play' && <HowToPlayScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </LayoutShell>
  );
};

export default function App() {
  return (
    <ErrorBoundary onReset={() => window.location.assign('/')}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
