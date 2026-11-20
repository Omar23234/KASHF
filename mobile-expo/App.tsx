import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  drawRandomUnusedQuestionId,
  getQuestionById,
  shuffleArray,
  TOTAL_QUESTIONS_COUNT,
} from './src/data/questions';
import { auth, isFirebaseConfigured } from './src/firebase/config';
import { TRANSLATIONS, type Language } from './src/i18n/translations';
import {
  advanceTurnNextQuestion,
  claimDisconnectedHost,
  createMultiplayerRoom,
  ensureAnonymousAuth,
  getMaxRoundsForPlayers,
  getSavedActiveRoom,
  getSavedPlayerName,
  joinMultiplayerRoom,
  kickPlayerFromLobby,
  leaveMultiplayerRoom,
  saveActiveRoom,
  setPlayerConnectionState,
  skipTurnQuestion,
  startOrRestartMultiplayerGame,
  subscribeToRoomAndPlayers,
  updateLobbySettings,
  type GameLengthMode,
  type RoomDoc,
  type RoomPlayerDoc,
} from './src/services/multiplayerService';

type Screen =
  | 'home'
  | 'online_entry'
  | 'online_lobby'
  | 'online_game'
  | 'single_setup'
  | 'single_game'
  | 'how_to_play'
  | 'settings';

interface SinglePhonePlayer {
  id: string;
  name: string;
}

interface SinglePhoneGame {
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
}

const SINGLE_PLAYERS_STORAGE = 'kashf_rn_single_players';
const LANGUAGE_STORAGE = 'kashf_rn_language';
const SOUND_STORAGE = 'kashf_rn_sound';

export default function App() {
  const [language, setLanguage] = useState<Language>('ar');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);

  // Online Entry state
  const [entryTab, setEntryTab] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [entryGameMode, setEntryGameMode] = useState<GameLengthMode>('rounds');
  const [entryRounds, setEntryRounds] = useState(3);
  const [entryRandomFirst, setEntryRandomFirst] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [firebaseMissing, setFirebaseMissing] = useState(!isFirebaseConfigured);
  const [anonDisabled, setAnonDisabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedRoom, setSavedRoom] = useState<string | null>(null);

  // Live Multiplayer room state
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Record<string, RoomPlayerDoc>>({});
  const [copied, setCopied] = useState(false);

  // Single Phone offline state (strictly zero skip)
  const [singlePlayers, setSinglePlayers] = useState<SinglePhonePlayer[]>([
    { id: 'sp-1', name: 'أحمد' },
    { id: 'sp-2', name: 'محمد' },
    { id: 'sp-3', name: 'عمر' },
    { id: 'sp-4', name: 'علي' },
  ]);
  const [newSingleName, setNewSingleName] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');
  const [singleGameMode, setSingleGameMode] = useState<GameLengthMode>('rounds');
  const [singleRounds, setSingleRounds] = useState(3);
  const [singleRandomFirst, setSingleRandomFirst] = useState(true);
  const [singleGame, setSingleGame] = useState<SinglePhoneGame | null>(null);

  const t = TRANSLATIONS[language];
  const isRTL = language === 'ar';
  const dirText = { writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const) };

  useEffect(() => {
    const unsub = auth ? onAuthStateChanged(auth, (u) => setAuthUser(u)) : () => {};
    getSavedPlayerName().then((n) => n && setDisplayName(n));
    getSavedActiveRoom().then((r) => r && setSavedRoom(r));
    AsyncStorage.getItem(LANGUAGE_STORAGE).then((l) => {
      if (l === 'ar' || l === 'en') setLanguage(l);
    });
    AsyncStorage.getItem(SOUND_STORAGE).then((s) => {
      if (s === 'false') setSoundEnabled(false);
    });
    AsyncStorage.getItem(SINGLE_PLAYERS_STORAGE).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SinglePhonePlayer[];
          if (Array.isArray(parsed) && parsed.length >= 2) setSinglePlayers(parsed);
        } catch {
          // ignore
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SINGLE_PLAYERS_STORAGE, JSON.stringify(singlePlayers)).catch(() => {});
    const maxR = getMaxRoundsForPlayers(singlePlayers.length);
    if (singleRounds > maxR) setSingleRounds(maxR);
  }, [singlePlayers, singleRounds]);

  useEffect(() => {
    AsyncStorage.setItem(LANGUAGE_STORAGE, language).catch(() => {});
  }, [language]);

  useEffect(() => {
    AsyncStorage.setItem(SOUND_STORAGE, String(soundEnabled)).catch(() => {});
  }, [soundEnabled]);

  // Background Anonymous Auth on entering Online Mode (zero login UI)
  const initOnlineAuth = async () => {
    setAuthLoading(true);
    setErrorMsg('');
    try {
      const res = await ensureAnonymousAuth();
      setFirebaseMissing(res.notConfigured);
      setAnonDisabled(res.anonDisabledError);
    } catch {
      setErrorMsg(t.errGeneric);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (screen === 'online_entry') {
      void initOnlineAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Real-time Firestore Room & Players Listener
  useEffect(() => {
    if (!activeRoomCode) return;
    const unsub = subscribeToRoomAndPlayers(
      activeRoomCode,
      (nextRoom, nextPlayers) => {
        if (!nextRoom || nextRoom.status === 'closed') {
          void saveActiveRoom(null);
          setActiveRoomCode(null);
          setRoom(null);
          setScreen('home');
          return;
        }
        if (authUser && !nextRoom.playerOrder.includes(authUser.uid)) {
          void saveActiveRoom(null);
          setActiveRoomCode(null);
          setRoom(null);
          setScreen('online_entry');
          return;
        }
        setRoom(nextRoom);
        setPlayers(nextPlayers);
        if (nextRoom.status === 'waiting') setScreen('online_lobby');
        else setScreen('online_game');
      },
      (err) => setErrorMsg(err.message)
    );

    void setPlayerConnectionState(activeRoomCode, true);
    const timer = setInterval(() => {
      void setPlayerConnectionState(activeRoomCode, true);
    }, 20000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [activeRoomCode, authUser]);

  const hapticTap = () => {
    if (soundEnabled) Haptics.selectionAsync().catch(() => {});
  };

  const handleCreateRoom = async () => {
    hapticTap();
    setErrorMsg('');
    if (!displayName.trim()) {
      setErrorMsg(t.errEnterName);
      return;
    }
    setSubmitting(true);
    try {
      const code = await createMultiplayerRoom({
        hostName: displayName,
        language,
        gameMode: entryGameMode,
        roundsCount: entryRounds,
        randomFirstPlayer: entryRandomFirst,
        soundEnabled,
      });
      setActiveRoomCode(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'FIREBASE_NOT_CONFIGURED') setFirebaseMissing(true);
      else setErrorMsg(t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinRoom = async () => {
    hapticTap();
    setErrorMsg('');
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
      setErrorMsg(t.errInvalidCode);
      return;
    }
    if (!displayName.trim()) {
      setErrorMsg(t.errEnterName);
      return;
    }
    setSubmitting(true);
    try {
      const res = await joinMultiplayerRoom({ rawCode: cleanCode, playerName: displayName });
      setActiveRoomCode(res.roomCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'FIREBASE_NOT_CONFIGURED') setFirebaseMissing(true);
      else if (msg === 'ROOM_NOT_FOUND') setErrorMsg(t.errRoomNotFound);
      else if (msg === 'ROOM_STARTED') setErrorMsg(t.errRoomStarted);
      else if (msg === 'ROOM_FULL') setErrorMsg(t.errRoomFull);
      else if (msg === 'ROOM_CLOSED') setErrorMsg(t.errRoomClosed);
      else setErrorMsg(t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetSinglePlayerCount = (targetCount: number) => {
    hapticTap();
    const clamped = Math.max(2, Math.min(12, targetCount));
    setSinglePlayers((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      const next = [...prev];
      while (next.length < clamped) {
        const num = next.length + 1;
        next.push({
          id: `sp-${Date.now()}-${num}`,
          name: language === 'ar' ? `لاعب ${num}` : `Player ${num}`,
        });
      }
      return next;
    });
  };

  const startSinglePhone = () => {
    hapticTap();
    const ordered = singleRandomFirst ? shuffleArray(singlePlayers) : [...singlePlayers];
    const safeRounds = Math.min(getMaxRoundsForPlayers(ordered.length), singleRounds);
    const firstQ = drawRandomUnusedQuestionId([]);
    setSingleGame({
      phase: firstQ === null ? 'exhausted' : 'playing',
      gameMode: singleGameMode,
      players: ordered,
      roundsCount: safeRounds,
      currentTurnIndex: 0,
      currentRound: 1,
      totalTurnsCompleted: 0,
      completedQuestionsCount: 0,
      currentQuestionId: firstQ,
      usedQuestionIds: firstQ !== null ? [firstQ] : [],
    });
    setScreen('single_game');
  };

  const advanceSinglePhone = () => {
    hapticTap();
    setSingleGame((prev) => {
      if (!prev || prev.phase !== 'playing') return prev;
      let nextIdx = prev.currentTurnIndex + 1;
      let nextRound = prev.currentRound;
      if (nextIdx >= prev.players.length) {
        nextIdx = 0;
        nextRound += 1;
      }
      const nextTotal = prev.totalTurnsCompleted + 1;
      const nextCompleted = prev.completedQuestionsCount + 1;
      const isComplete =
        prev.gameMode === 'rounds' ? nextRound > prev.roundsCount : nextTotal >= TOTAL_QUESTIONS_COUNT;
      if (isComplete) {
        return {
          ...prev,
          phase: 'finished',
          currentTurnIndex: 0,
          currentRound: prev.roundsCount,
          totalTurnsCompleted: nextTotal,
          completedQuestionsCount: nextCompleted,
          currentQuestionId: null,
        };
      }
      const nextQ = drawRandomUnusedQuestionId(prev.usedQuestionIds);
      if (nextQ === null) {
        return {
          ...prev,
          phase: 'exhausted',
          currentTurnIndex: nextIdx,
          currentRound: nextRound,
          totalTurnsCompleted: nextTotal,
          completedQuestionsCount: nextCompleted,
          currentQuestionId: null,
        };
      }
      return {
        ...prev,
        currentTurnIndex: nextIdx,
        currentRound: nextRound,
        totalTurnsCompleted: nextTotal,
        completedQuestionsCount: nextCompleted,
        currentQuestionId: nextQ,
        usedQuestionIds: [...prev.usedQuestionIds, nextQ],
      };
    });
  };

  const renderHeader = () => (
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.headerLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {screen !== 'home' && (
          <TouchableOpacity
            onPress={() => {
              hapticTap();
              if (screen === 'online_lobby' || screen === 'online_game') {
                if (activeRoomCode) void leaveMultiplayerRoom(activeRoomCode);
                setActiveRoomCode(null);
                setRoom(null);
              }
              setScreen('home');
            }}
            style={styles.iconBtn}
          >
            <Text style={styles.iconBtnText}>{isRTL ? '→' : '←'}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.brandTitle}>{t.appTitle}</Text>
      </View>

      <TouchableOpacity
        onPress={() => {
          hapticTap();
          setLanguage(language === 'ar' ? 'en' : 'ar');
        }}
        style={styles.langBtn}
      >
        <Text style={styles.langBtnText}>{language === 'ar' ? 'EN' : 'عربي'}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={['#060913', '#0B1026', '#060913']} style={StyleSheet.absoluteFill} />
        {renderHeader()}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {screen === 'home' && (
          <View style={styles.sectionGap}>
            <View style={styles.heroBox}>
              <Image source={require('./assets/icon.png')} style={styles.heroLogo} />
              <Text style={styles.heroTitle}>{t.appTitle}</Text>
              <Text style={[styles.heroSub, dirText]}>{t.appSubtitle}</Text>
              <Text style={styles.metaText}>
                {TOTAL_QUESTIONS_COUNT} {language === 'ar' ? 'سؤالاً رسمياً · 2–12 لاعب' : 'Official Questions · 2–12 Players'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                hapticTap();
                setScreen('online_entry');
              }}
              style={[styles.modeCard, styles.modeCardOnline]}
            >
              <Text style={[styles.modeTitle, dirText]}>{t.playOnline}</Text>
              <Text style={[styles.modeDesc, dirText]}>{t.playOnlineDesc}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                hapticTap();
                setScreen('single_setup');
              }}
              style={styles.modeCard}
            >
              <Text style={[styles.modeTitle, dirText]}>{t.playSinglePhone}</Text>
              <Text style={[styles.modeDesc, dirText]}>{t.playSinglePhoneDesc}</Text>
            </TouchableOpacity>

            <View style={styles.rowGap}>
              <TouchableOpacity
                onPress={() => {
                  hapticTap();
                  setScreen('how_to_play');
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>{t.howToPlay}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  hapticTap();
                  setScreen('settings');
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>{t.settings}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {screen === 'online_entry' && (
          <View style={styles.sectionGap}>
            <Text style={[styles.pageTitle, dirText]}>{t.onlineModeTitle}</Text>

            {authLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.mutedText}>{t.connectingAuth}</Text>
              </View>
            ) : firebaseMissing ? (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, dirText]}>{t.firebaseNotConfiguredTitle}</Text>
                <Text style={[styles.mutedText, dirText]}>{t.firebaseNotConfiguredDesc}</Text>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setScreen('single_setup');
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{t.playSinglePhone}</Text>
                </TouchableOpacity>
              </View>
            ) : anonDisabled && !authUser ? (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, dirText]}>{t.anonAuthRequiredTitle}</Text>
                <Text style={[styles.mutedText, dirText]}>{t.anonAuthRequiredDesc}</Text>
                <TouchableOpacity onPress={initOnlineAuth} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>{t.retryConnection}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {savedRoom && (
                  <View style={styles.reconnectBox}>
                    <Text style={styles.reconnectText}>
                      {language === 'ar' ? `غرفة سابقة: ${savedRoom}` : `Active Room: ${savedRoom}`}
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        setSubmitting(true);
                        try {
                          const res = await joinMultiplayerRoom({
                            rawCode: savedRoom,
                            playerName: displayName || 'Player',
                          });
                          setActiveRoomCode(res.roomCode);
                        } catch {
                          await saveActiveRoom(null);
                          setSavedRoom(null);
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      style={styles.smallPrimaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>
                        {language === 'ar' ? 'رجوع' : 'Reconnect'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      setEntryTab('create');
                      setErrorMsg('');
                    }}
                    style={[styles.segmentBtn, entryTab === 'create' && styles.segmentActive]}
                  >
                    <Text style={styles.segmentText}>{t.createRoom}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      setEntryTab('join');
                      setErrorMsg('');
                    }}
                    style={[styles.segmentBtn, entryTab === 'join' && styles.segmentActive]}
                  >
                    <Text style={styles.segmentText}>{t.joinRoom}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.card}>
                  {entryTab === 'join' && (
                    <>
                      <Text style={[styles.label, dirText]}>{t.roomCode}</Text>
                      <TextInput
                        value={roomCodeInput}
                        onChangeText={(v) => setRoomCodeInput(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        maxLength={6}
                        autoCapitalize="characters"
                        placeholder={t.roomCodePlaceholder}
                        placeholderTextColor="#64748B"
                        style={[styles.input, styles.codeInput]}
                      />
                    </>
                  )}

                  <Text style={[styles.label, dirText]}>{t.yourName}</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    maxLength={24}
                    placeholder={t.yourNamePlaceholder}
                    placeholderTextColor="#64748B"
                    style={[styles.input, dirText]}
                  />

                  {entryTab === 'create' && (
                    <View style={styles.sectionGap}>
                      <Text style={[styles.label, dirText]}>{t.gameLengthLabel}</Text>
                      <View style={styles.segmentRow}>
                        <TouchableOpacity
                          onPress={() => {
                            hapticTap();
                            setEntryGameMode('rounds');
                          }}
                          style={[styles.segmentBtn, entryGameMode === 'rounds' && styles.segmentActive]}
                        >
                          <Text style={styles.segmentText}>{t.roundsModeOption}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            hapticTap();
                            setEntryGameMode('all_questions');
                          }}
                          style={[styles.segmentBtn, entryGameMode === 'all_questions' && styles.segmentActive]}
                        >
                          <Text style={styles.segmentText}>{t.allQuestionsOption}</Text>
                        </TouchableOpacity>
                      </View>

                      {entryGameMode === 'rounds' ? (
                        <View style={styles.stepperRow}>
                          <TouchableOpacity
                            onPress={() => setEntryRounds((r) => Math.max(1, r - 1))}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepValue}>
                            {entryRounds} {t.roundUnit}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              setEntryRounds((r) => Math.min(getMaxRoundsForPlayers(2), r + 1))
                            }
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={[styles.mutedText, dirText]}>
                          {t.allQuestionsHint} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                        </Text>
                      )}

                      <View style={styles.playerRow}>
                        <Text style={[styles.playerName, dirText]}>{t.randomFirstPlayer}</Text>
                        <Switch value={entryRandomFirst} onValueChange={setEntryRandomFirst} />
                      </View>
                    </View>
                  )}

                  {!!errorMsg && <Text style={[styles.errorText, dirText]}>{errorMsg}</Text>}

                  <TouchableOpacity
                    disabled={submitting}
                    onPress={entryTab === 'create' ? handleCreateRoom : handleJoinRoom}
                    style={[styles.primaryBtn, submitting && styles.disabledBtn]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {submitting
                        ? entryTab === 'create'
                          ? t.creatingRoom
                          : t.joiningRoom
                        : entryTab === 'create'
                        ? t.createRoomBtn
                        : t.joinRoomBtn}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {screen === 'online_lobby' && room && (
          <View style={styles.sectionGap}>
            <View style={styles.card}>
              <Text style={[styles.label, dirText]}>{t.shareCodePrompt}</Text>
              <Text style={styles.bigRoomCode}>{room.roomCode}</Text>
              <View style={styles.rowGap}>
                <TouchableOpacity
                  onPress={async () => {
                    hapticTap();
                    await Clipboard.setStringAsync(room.roomCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>{copied ? t.codeCopied : t.copyCode}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    void Share.share({ message: `${t.shareMessage} ${room.roomCode}` });
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>{t.shareRoom}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>
                {t.playersCountLabel} ({room.playerOrder.length}/12)
              </Text>
              {room.playerOrder.map((pid) => {
                const p = players[pid];
                if (!p) return null;
                const isHost = authUser?.uid === room.hostId;
                return (
                  <View key={pid} style={styles.playerRow}>
                    <View>
                      <Text style={styles.playerName}>
                        {p.name} {p.isHost ? `(${t.hostBadge})` : ''}
                      </Text>
                      <Text style={styles.mutedSmall}>
                        {p.connected ? t.connected : t.disconnected}
                      </Text>
                    </View>
                    {isHost && pid !== authUser?.uid && (
                      <TouchableOpacity
                        onPress={() => {
                          hapticTap();
                          void kickPlayerFromLobby(room.roomCode, pid);
                        }}
                        style={styles.kickBtn}
                      >
                        <Text style={styles.kickBtnText}>{t.removePlayer}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {room.playerOrder.length < 2 && (
                <Text style={[styles.warnText, dirText]}>{t.minPlayersWarning}</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.gameSettingsTitle}</Text>
              {authUser?.uid === room.hostId ? (
                <>
                  <View style={styles.segmentRow}>
                    <TouchableOpacity
                      onPress={() => {
                        hapticTap();
                        void updateLobbySettings(room.roomCode, {
                          gameMode: 'rounds',
                          roundsCount: Math.min(getMaxRoundsForPlayers(room.playerOrder.length), room.roundsCount),
                        });
                      }}
                      style={[styles.segmentBtn, room.gameMode === 'rounds' && styles.segmentActive]}
                    >
                      <Text style={styles.segmentText}>{t.roundsModeOption}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        hapticTap();
                        void updateLobbySettings(room.roomCode, { gameMode: 'all_questions' });
                      }}
                      style={[styles.segmentBtn, room.gameMode === 'all_questions' && styles.segmentActive]}
                    >
                      <Text style={styles.segmentText}>{t.allQuestionsOption}</Text>
                    </TouchableOpacity>
                  </View>

                  {room.gameMode === 'rounds' ? (
                    <View style={styles.sectionGap}>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity
                          onPress={() =>
                            void updateLobbySettings(room.roomCode, {
                              roundsCount: Math.max(1, room.roundsCount - 1),
                            })
                          }
                          style={styles.stepBtn}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepValue}>
                          {Math.min(getMaxRoundsForPlayers(room.playerOrder.length), room.roundsCount)}{' '}
                          {t.roundUnit}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            void updateLobbySettings(room.roomCode, {
                              roundsCount: Math.min(
                                getMaxRoundsForPlayers(room.playerOrder.length),
                                room.roundsCount + 1
                              ),
                            })
                          }
                          style={styles.stepBtn}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.mutedSmall, dirText]}>
                        {t.turnsTotalHint}{' '}
                        {Math.max(2, room.playerOrder.length) *
                          Math.min(getMaxRoundsForPlayers(room.playerOrder.length), room.roundsCount)}{' '}
                        / {TOTAL_QUESTIONS_COUNT} {t.turnUnit} ({t.maxRoundsHint}{' '}
                        {getMaxRoundsForPlayers(room.playerOrder.length)})
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.mutedText, dirText]}>
                      {t.allQuestionsHint} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                    </Text>
                  )}

                  <View style={styles.playerRow}>
                    <Text style={[styles.playerName, dirText]}>{t.randomFirstPlayer}</Text>
                    <Switch
                      value={room.randomFirstPlayer}
                      onValueChange={(val) =>
                        void updateLobbySettings(room.roomCode, { randomFirstPlayer: val })
                      }
                    />
                  </View>

                  <TouchableOpacity
                    disabled={room.playerOrder.length < 2}
                    onPress={() => {
                      hapticTap();
                      void startOrRestartMultiplayerGame(room.roomCode);
                    }}
                    style={[styles.primaryBtn, room.playerOrder.length < 2 && styles.disabledBtn]}
                  >
                    <Text style={styles.primaryBtnText}>{t.startGame}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.mutedText, dirText]}>{t.waitingForHost}</Text>
                  {players[room.hostId] && !players[room.hostId].connected && (
                    <TouchableOpacity
                      onPress={() => void claimDisconnectedHost(room.roomCode)}
                      style={styles.secondaryBtn}
                    >
                      <Text style={styles.secondaryBtnText}>{t.claimHost}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {screen === 'online_game' && room && (
          <View style={styles.sectionGap}>
            {room.status === 'finished' || room.status === 'exhausted' ? (
              <View style={styles.card}>
                <Text style={[styles.pageTitle, dirText]}>
                  {room.status === 'exhausted' ? t.questionsExhaustedTitle : t.gameCompletedTitle}
                </Text>
                <Text style={[styles.mutedText, dirText]}>
                  {t.totalTurnsStat}: {room.totalTurnsCompleted} · {t.completedQuestionsStat}:{' '}
                  {room.completedQuestionsCount} · {t.skippedQuestionsStat}: {room.skippedQuestionsCount}
                </Text>
                {authUser?.uid === room.hostId ? (
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      void startOrRestartMultiplayerGame(room.roomCode);
                    }}
                    style={styles.primaryBtn}
                  >
                    <Text style={styles.primaryBtnText}>{t.playAgain}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.mutedText, dirText]}>{t.waitingHostRestart}</Text>
                )}
                <TouchableOpacity
                  onPress={async () => {
                    hapticTap();
                    await leaveMultiplayerRoom(room.roomCode);
                    setActiveRoomCode(null);
                    setRoom(null);
                    setScreen('home');
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>{t.returnHome}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              (() => {
                const myUid = authUser?.uid ?? '';
                const isMyTurn = room.activePlayerId === myUid;
                const myPlayer = players[myUid];
                const activePlayer = room.activePlayerId ? players[room.activePlayerId] : undefined;
                const hostPlayer = players[room.hostId];
                const q = getQuestionById(room.currentQuestionId);
                const skipsLeft = myPlayer?.skipsRemaining ?? 0;
                const totalConfiguredTurns =
                  room.gameMode === 'all_questions'
                    ? TOTAL_QUESTIONS_COUNT
                    : room.playerOrder.length * room.roundsCount;
                const remainingPool = Math.max(0, TOTAL_QUESTIONS_COUNT - room.usedQuestionIds.length);

                return (
                  <View style={styles.sectionGap}>
                    <Text style={styles.metaText}>
                      {room.gameMode === 'all_questions'
                        ? `${t.allQuestionsOption} · ${t.turnLabel} ${Math.min(
                            totalConfiguredTurns,
                            room.totalTurnsCompleted + 1
                          )}/${TOTAL_QUESTIONS_COUNT} · ${t.remainingPool}: ${remainingPool}`
                        : `${t.roundLabel} ${room.currentRound}/${room.roundsCount} · ${t.turnLabel} ${Math.min(
                            totalConfiguredTurns,
                            room.totalTurnsCompleted + 1
                          )}/${totalConfiguredTurns} · ${t.remainingPool}: ${remainingPool}`}
                    </Text>

                    <View style={styles.card}>
                      <Text style={[styles.label, dirText]}>
                        {isMyTurn ? t.yourTurnTitle : t.activePlayerTurn}
                      </Text>
                      <Text style={[styles.activePlayerName, dirText]}>{activePlayer?.name ?? '...'}</Text>
                      <Text style={[styles.mutedSmall, dirText]}>
                        {t.skipsRemainingLabel}: {skipsLeft}/3
                      </Text>
                    </View>

                    <View style={styles.questionCard}>
                      {isMyTurn && q ? (
                        <View style={{ gap: 12, alignItems: 'center' }}>
                          <Text style={[styles.questionText, dirText]}>{q.text}</Text>
                          {q.isGroupPrompt && (
                            <Text style={[styles.groupNoteText, dirText]}>{t.groupPromptNote}</Text>
                          )}
                        </View>
                      ) : (
                        <Text style={[styles.waitingText, dirText]}>{t.waitingTurnDesc}</Text>
                      )}
                    </View>

                    {isMyTurn && (
                      <View style={styles.rowGap}>
                        <TouchableOpacity
                          disabled={skipsLeft < 1}
                          onPress={() => {
                            hapticTap();
                            void skipTurnQuestion(room.roomCode);
                          }}
                          style={[styles.secondaryBtn, skipsLeft < 1 && styles.disabledBtn]}
                        >
                          <Text style={styles.secondaryBtnText}>
                            {skipsLeft > 0 ? `${t.skipQuestion} (${skipsLeft})` : t.noSkipsLeft}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            hapticTap();
                            void advanceTurnNextQuestion(room.roomCode);
                          }}
                          style={[styles.primaryBtn, { flex: 1 }]}
                        >
                          <Text style={styles.primaryBtnText}>{t.nextQuestion}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {authUser?.uid === room.hostId && !isMyTurn && (
                      <TouchableOpacity
                        onPress={() => {
                          hapticTap();
                          void advanceTurnNextQuestion(room.roomCode);
                        }}
                        style={styles.secondaryBtn}
                      >
                        <Text style={styles.secondaryBtnText}>{t.hostForceNext}</Text>
                      </TouchableOpacity>
                    )}

                    {authUser?.uid !== room.hostId && hostPlayer && !hostPlayer.connected && (
                      <TouchableOpacity
                        onPress={() => void claimDisconnectedHost(room.roomCode)}
                        style={styles.secondaryBtn}
                      >
                        <Text style={styles.secondaryBtnText}>{t.claimHost}</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.card}>
                      <Text style={[styles.cardTitle, dirText]}>{t.playersCountLabel}</Text>
                      {room.playerOrder.map((pid) => {
                        const p = players[pid];
                        if (!p) return null;
                        const isTurn = pid === room.activePlayerId;
                        return (
                          <View key={pid} style={styles.playerRow}>
                            <Text style={styles.playerName}>
                              {isTurn ? '▶ ' : ''}
                              {p.name} {p.isHost ? `(${t.hostBadge})` : ''}
                            </Text>
                            <Text style={styles.mutedSmall}>
                              {t.skipsRemainingLabel}: {p.skipsRemaining}/3
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()
            )}
          </View>
        )}

        {screen === 'single_setup' && (
          <View style={styles.sectionGap}>
            <Text style={[styles.pageTitle, dirText]}>{t.singlePhoneTitle}</Text>
            <View style={styles.card}>
              <View style={styles.stepperRow}>
                <Text style={[styles.cardTitle, dirText]}>
                  {t.playerCountSetup} ({singlePlayers.length}/12)
                </Text>
                <View style={styles.rowGap}>
                  <TouchableOpacity
                    disabled={singlePlayers.length <= 2}
                    onPress={() => handleSetSinglePlayerCount(singlePlayers.length - 1)}
                    style={[styles.stepBtn, singlePlayers.length <= 2 && styles.disabledBtn]}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={singlePlayers.length >= 12}
                    onPress={() => handleSetSinglePlayerCount(singlePlayers.length + 1)}
                    style={[styles.stepBtn, singlePlayers.length >= 12 && styles.disabledBtn]}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.rowGap}>
                <TextInput
                  value={newSingleName}
                  onChangeText={setNewSingleName}
                  maxLength={24}
                  placeholder={t.addPlayerPlaceholder}
                  placeholderTextColor="#64748B"
                  style={[styles.input, { flex: 1 }, dirText]}
                />
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    const clean = newSingleName.trim().slice(0, 24);
                    if (!clean || singlePlayers.length >= 12) return;
                    setSinglePlayers((prev) => [...prev, { id: `sp-${Date.now()}`, name: clean }]);
                    setNewSingleName('');
                  }}
                  style={styles.smallPrimaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{t.addPlayerBtn}</Text>
                </TouchableOpacity>
              </View>

              {singlePlayers.map((p, idx) => {
                const isEditing = editingPlayerId === p.id;
                return (
                  <View key={p.id} style={styles.playerRow}>
                    {isEditing ? (
                      <TextInput
                        value={editingPlayerName}
                        onChangeText={setEditingPlayerName}
                        maxLength={24}
                        autoFocus
                        style={[styles.input, { flex: 1, marginRight: 8 }, dirText]}
                      />
                    ) : (
                      <Text style={styles.playerName}>
                        {idx + 1}. {p.name}
                      </Text>
                    )}

                    <View style={styles.rowGap}>
                      {isEditing ? (
                        <TouchableOpacity
                          onPress={() => {
                            const clean = editingPlayerName.trim().slice(0, 24);
                            if (clean) {
                              setSinglePlayers((prev) =>
                                prev.map((x) => (x.id === p.id ? { ...x, name: clean } : x))
                              );
                            }
                            setEditingPlayerId(null);
                          }}
                          style={styles.smallPrimaryBtn}
                        >
                          <Text style={styles.primaryBtnText}>{t.saveName}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            setEditingPlayerId(p.id);
                            setEditingPlayerName(p.name);
                          }}
                          style={styles.editBtn}
                        >
                          <Text style={styles.editBtnText}>{t.editName}</Text>
                        </TouchableOpacity>
                      )}

                      {singlePlayers.length > 2 && (
                        <TouchableOpacity
                          onPress={() => setSinglePlayers((prev) => prev.filter((x) => x.id !== p.id))}
                          style={styles.kickBtn}
                        >
                          <Text style={styles.kickBtnText}>{t.removePlayer}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.gameLengthLabel}</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setSingleGameMode('rounds');
                  }}
                  style={[styles.segmentBtn, singleGameMode === 'rounds' && styles.segmentActive]}
                >
                  <Text style={styles.segmentText}>{t.roundsModeOption}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setSingleGameMode('all_questions');
                  }}
                  style={[styles.segmentBtn, singleGameMode === 'all_questions' && styles.segmentActive]}
                >
                  <Text style={styles.segmentText}>{t.allQuestionsOption}</Text>
                </TouchableOpacity>
              </View>

              {singleGameMode === 'rounds' ? (
                <View style={styles.sectionGap}>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      onPress={() => setSingleRounds((r) => Math.max(1, r - 1))}
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepValue}>
                      {singleRounds} {t.roundUnit} ({singlePlayers.length * singleRounds}/{TOTAL_QUESTIONS_COUNT})
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setSingleRounds((r) => Math.min(getMaxRoundsForPlayers(singlePlayers.length), r + 1))
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.mutedSmall, dirText]}>
                    {t.maxRoundsHint} {getMaxRoundsForPlayers(singlePlayers.length)} {t.roundUnit}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.mutedText, dirText]}>
                  {t.allQuestionsHint} ({TOTAL_QUESTIONS_COUNT} {t.turnUnit})
                </Text>
              )}

              <View style={styles.playerRow}>
                <Text style={[styles.playerName, dirText]}>{t.randomFirstPlayer}</Text>
                <Switch value={singleRandomFirst} onValueChange={setSingleRandomFirst} />
              </View>

              <TouchableOpacity onPress={startSinglePhone} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t.startGame}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {screen === 'single_game' && singleGame && (
          <View style={styles.sectionGap}>
            {singleGame.phase === 'finished' || singleGame.phase === 'exhausted' ? (
              <View style={styles.card}>
                <Text style={[styles.pageTitle, dirText]}>
                  {singleGame.phase === 'exhausted'
                    ? t.questionsExhaustedTitle
                    : t.gameCompletedTitle}
                </Text>
                <Text style={[styles.mutedText, dirText]}>
                  {t.totalTurnsStat}: {singleGame.totalTurnsCompleted} · {t.completedQuestionsStat}:{' '}
                  {singleGame.completedQuestionsCount}
                </Text>
                <TouchableOpacity onPress={startSinglePhone} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>{t.playAgain}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setScreen('home')} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{t.returnHome}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              (() => {
                const q = getQuestionById(singleGame.currentQuestionId);
                const totalTurns =
                  singleGame.gameMode === 'all_questions'
                    ? TOTAL_QUESTIONS_COUNT
                    : singleGame.players.length * singleGame.roundsCount;
                const remainingPool = Math.max(
                  0,
                  TOTAL_QUESTIONS_COUNT - singleGame.usedQuestionIds.length
                );

                return (
                  <View style={styles.sectionGap}>
                    <Text style={styles.metaText}>
                      {singleGame.gameMode === 'all_questions'
                        ? `${t.allQuestionsOption} · ${t.turnLabel} ${Math.min(
                            totalTurns,
                            singleGame.totalTurnsCompleted + 1
                          )}/${TOTAL_QUESTIONS_COUNT} · ${t.remainingPool}: ${remainingPool}`
                        : `${t.roundLabel} ${singleGame.currentRound}/${singleGame.roundsCount} · ${t.turnLabel} ${Math.min(
                            totalTurns,
                            singleGame.totalTurnsCompleted + 1
                          )}/${totalTurns} · ${t.remainingPool}: ${remainingPool}`}
                    </Text>
                    <View style={styles.card}>
                      <Text style={[styles.label, dirText]}>{t.passPhonePrompt}</Text>
                      <Text style={[styles.activePlayerName, dirText]}>
                        {singleGame.players[singleGame.currentTurnIndex]?.name}
                      </Text>
                    </View>
                    <View style={styles.questionCard}>
                      <View style={{ gap: 12, alignItems: 'center' }}>
                        <Text style={[styles.questionText, dirText]}>{q?.text ?? ''}</Text>
                        {q?.isGroupPrompt && (
                          <Text style={[styles.groupNoteText, dirText]}>{t.groupPromptNote}</Text>
                        )}
                      </View>
                    </View>
                    {/* STRICTLY NO SKIP IN SINGLE PHONE MODE */}
                    <TouchableOpacity onPress={advanceSinglePhone} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>{t.nextQuestion}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()
            )}
          </View>
        )}

        {screen === 'how_to_play' && (
          <View style={styles.sectionGap}>
            <Text style={[styles.pageTitle, dirText]}>{t.howToPlayTitle}</Text>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.ruleOnlineTitle}</Text>
              <Text style={[styles.mutedText, dirText]}>{t.ruleOnlineBody}</Text>
            </View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.ruleSingleTitle}</Text>
              <Text style={[styles.mutedText, dirText]}>{t.ruleSingleBody}</Text>
            </View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.ruleQuestionsTitle}</Text>
              <Text style={[styles.mutedText, dirText]}>{t.ruleQuestionsBody}</Text>
            </View>
          </View>
        )}

        {screen === 'settings' && (
          <View style={styles.sectionGap}>
            <Text style={[styles.pageTitle, dirText]}>{t.settingsTitle}</Text>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.defaultLanguage}</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setLanguage('ar');
                  }}
                  style={[styles.segmentBtn, language === 'ar' && styles.segmentActive]}
                >
                  <Text style={styles.segmentText}>{t.arabic}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setLanguage('en');
                  }}
                  style={[styles.segmentBtn, language === 'en' && styles.segmentActive]}
                >
                  <Text style={styles.segmentText}>{t.english}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.playerRow}>
                <Text style={[styles.playerName, dirText]}>{t.soundEffectsLabel}</Text>
                <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
              </View>
            </View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, dirText]}>{t.offlineReadyLabel}</Text>
              <Text style={[styles.mutedText, dirText]}>{t.offlineReadySub}</Text>
            </View>
          </View>
        )}
      </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#060913' },
  header: {
    height: 56,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: { alignItems: 'center', gap: 10 },
  brandTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  langBtnText: { color: '#E2E8F0', fontSize: 13, fontWeight: '700' },
  scrollContent: { padding: 18, paddingBottom: 40 },
  sectionGap: { gap: 14 },
  rowGap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  heroBox: { alignItems: 'center', paddingVertical: 14, gap: 8 },
  heroLogo: { width: 84, height: 84, borderRadius: 22, marginBottom: 4 },
  heroTitle: { color: '#FFFFFF', fontSize: 40, fontWeight: '800' },
  heroSub: { color: '#CBD5E1', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  metaText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modeCard: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: '#0C1226',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 8,
  },
  modeCardOnline: {
    borderColor: 'rgba(96,165,250,0.45)',
    backgroundColor: '#101A3B',
  },
  modeTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  modeDesc: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },
  pageTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#0C1226',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  label: { color: '#93C5FD', fontSize: 13, fontWeight: '700' },
  mutedText: { color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  mutedSmall: { color: '#94A3B8', fontSize: 12 },
  warnText: { color: '#FCD34D', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#FB7185', fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#070B18',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
  bigRoomCode: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    paddingVertical: 6,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  smallPrimaryBtn: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryBtnText: { color: '#E2E8F0', fontSize: 14, fontWeight: '700' },
  disabledBtn: { opacity: 0.4 },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#070B18',
    borderRadius: 16,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: { backgroundColor: '#2563EB' },
  segmentText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  stepValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  playerName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editBtnText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  kickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(244,63,94,0.15)',
  },
  kickBtnText: { color: '#FDA4AF', fontSize: 12, fontWeight: '700' },
  activePlayerName: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  questionCard: {
    minHeight: 240,
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#0D142B',
    borderWidth: 1.5,
    borderColor: 'rgba(96,165,250,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
  },
  groupNoteText: {
    color: '#C4B5FD',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  waitingText: { color: '#CBD5E1', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  centerBox: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  reconnectBox: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reconnectText: { color: '#DBEAFE', fontSize: 14, fontWeight: '700' },
});
