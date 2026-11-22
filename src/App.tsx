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
import { getMaxRoundsForPlayers, leaveMultiplayerRoom } from './firebase/multiplayerService';
import type { GameLengthMode, SinglePhoneGameState, SinglePhonePlayer } from './types/game';
import { soundFX } from './utils/sound';
import {
  answerSinglePhoneQuestion,
  createSinglePhoneGame,
  useSinglePhoneAntiSwitchCard,
  useSinglePhoneGoldCard,
  useSinglePhoneSwitchCard,
} from './utils/specialCards';

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
    setSingleGame(
      createSinglePhoneGame({
        players: singlePlayers,
        gameMode: singleGameMode,
        roundsCount: singleRoundsCount,
        randomFirstPlayer: singleRandomFirst,
      })
    );
    setScreen('single_game');
  };

  const advanceSinglePhoneTurn = () => {
    setSingleGame((prev) => {
      if (!prev) return prev;
      const next = answerSinglePhoneQuestion(prev);
      if (next.phase === 'finished' || next.phase === 'exhausted') {
        soundFX.complete(soundEnabled);
      } else if (next.lastCardEvent?.type === 'awarded') {
        soundFX.turnAlert(soundEnabled);
      }
      return next;
    });
  };

  const handleSingleGoldCard = () => {
    setSingleGame((prev) => {
      if (!prev) return prev;
      const next = useSinglePhoneGoldCard(prev);
      if (next.phase === 'finished' || next.phase === 'exhausted') {
        soundFX.complete(soundEnabled);
      }
      return next;
    });
  };

  const handleSingleSwitchCard = (targetPlayerId: string) => {
    setSingleGame((prev) => (prev ? useSinglePhoneSwitchCard(prev, targetPlayerId) : prev));
  };

  const handleSingleAntiSwitchCard = () => {
    setSingleGame((prev) => (prev ? useSinglePhoneAntiSwitchCard(prev) : prev));
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
          onUseGoldCard={handleSingleGoldCard}
          onUseSwitchCard={handleSingleSwitchCard}
          onUseAntiSwitchCard={handleSingleAntiSwitchCard}
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
