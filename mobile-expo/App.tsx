import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  Modal,
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
  getQuestionById,
  TOTAL_QUESTIONS_COUNT,
} from './src/data/questions';
import { auth, isFirebaseConfigured } from './src/firebase/config';
import { useMobileVoiceChat } from './src/hooks/useMobileVoiceChat';
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
  sendRoomChatMessage,
  setPlayerConnectionState,
  skipTurnQuestion,
  startOrRestartMultiplayerGame,
  subscribeToRoomAndPlayers,
  subscribeToRoomMessages,
  updateLobbySettings,
  useAntiSwitchCard,
  useGoldCard,
  useSwitchCard,
  type GameLengthMode,
  type RoomChatMessage,
  type RoomDoc,
  type RoomPlayerDoc,
} from './src/services/multiplayerService';
import {
  answerSinglePhoneQuestion,
  createSinglePhoneGame,
  getCardTypeFromId,
  useSinglePhoneAntiSwitchCard,
  useSinglePhoneGoldCard,
  useSinglePhoneSwitchCard,
  type CardEvent,
  type SinglePhoneGame,
  type SinglePhonePlayer,
} from './src/utils/specialCards';

type Screen =
  | 'home'
  | 'online_entry'
  | 'online_lobby'
  | 'online_game'
  | 'single_setup'
  | 'single_game'
  | 'how_to_play'
  | 'settings';

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
  const [actionBusy, setActionBusy] = useState(false);
  const [doubleSkipNotice, setDoubleSkipNotice] = useState(false);
  const [dismissedOnlineAwardNonce, setDismissedOnlineAwardNonce] = useState(0);

  // Collapsible Room Text Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const seenMsgCountRef = useRef(0);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  // Special Card confirmation modal state (shared cleanly between active mode)
  const [cardModal, setCardModal] = useState<{
    mode: 'online' | 'single';
    kind: 'gold' | 'switch' | 'anti_switch';
  } | null>(null);
  const [switchTargetUid, setSwitchTargetUid] = useState('');

  // Single Phone offline state (strictly zero normal skip)
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
  const [dismissedSingleAwardNonce, setDismissedSingleAwardNonce] = useState(0);

  const t = TRANSLATIONS[language];
  const isRTL = language === 'ar';
  const dirText = { writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const) };
  const myUid = authUser?.uid ?? '';

  const voice = useMobileVoiceChat({
    roomCode: activeRoomCode,
    myUid,
    players,
    playerOrder: room?.playerOrder ?? [],
  });

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

  // Real-time Room Text Chat Listener
  useEffect(() => {
    if (!activeRoomCode || !myUid) {
      setChatMessages([]);
      setUnreadChatCount(0);
      seenMsgCountRef.current = 0;
      return;
    }
    const unsub = subscribeToRoomMessages(activeRoomCode, myUid, (msgs) => {
      setChatMessages(msgs);
      if (chatOpenRef.current) {
        seenMsgCountRef.current = msgs.length;
        setUnreadChatCount(0);
      } else {
        const prevSeen = seenMsgCountRef.current;
        if (msgs.length > prevSeen) {
          const newOthers = msgs.slice(prevSeen).filter((m) => m.senderId !== myUid).length;
          if (newOthers > 0) setUnreadChatCount((c) => c + newOthers);
          seenMsgCountRef.current = msgs.length;
        }
      }
    });
    return () => unsub();
  }, [activeRoomCode, myUid]);

  useEffect(() => {
    if (chatOpen) {
      seenMsgCountRef.current = chatMessages.length;
      setUnreadChatCount(0);
    }
  }, [chatOpen, chatMessages.length]);

  const hapticTap = () => {
    if (soundEnabled) Haptics.selectionAsync().catch(() => {});
  };

  const handleLeaveOnlineRoom = async () => {
    hapticTap();
    setChatOpen(false);
    setCardModal(null);
    setDoubleSkipNotice(false);
    setDismissedOnlineAwardNonce(0);
    await voice.leaveVoice();
    if (activeRoomCode) await leaveMultiplayerRoom(activeRoomCode);
    setActiveRoomCode(null);
    setRoom(null);
    setScreen('home');
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

  const handleSendChat = async () => {
    if (!room || !chatDraft.trim() || chatSending) return;
    const text = chatDraft.trim();
    setChatSending(true);
    setChatDraft('');
    try {
      const myName = players[myUid]?.name || displayName || 'Player';
      await sendRoomChatMessage(room.roomCode, myName, text, room.playerOrder);
    } finally {
      setChatSending(false);
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
    setDismissedSingleAwardNonce(0);
    setCardModal(null);
    setSingleGame(
      createSinglePhoneGame({
        players: singlePlayers,
        gameMode: singleGameMode,
        roundsCount: singleRounds,
        randomFirstPlayer: singleRandomFirst,
      })
    );
    setScreen('single_game');
  };

  const advanceSinglePhone = () => {
    hapticTap();
    setSingleGame((prev) => (prev ? answerSinglePhoneQuestion(prev) : prev));
  };

  const formatCardEventText = (evt: CardEvent | null): string => {
    if (!evt) return '';
    if (evt.type === 'awarded') {
      const cardType = getCardTypeFromId(evt.cardId);
      const label =
        cardType === 'gold'
          ? t.goldCardName
          : cardType === 'switch'
            ? t.switchCardName
            : t.antiSwitchCardName;
      return `${evt.actorName}: ${t.cardEventAwarded} (${label})`;
    }
    if (evt.type === 'gold') return `${evt.actorName} ${t.cardEventGold}`;
    if (evt.type === 'switch') return `${evt.actorName} ${t.cardEventSwitch} ${evt.targetName ?? ''}`;
    return `${evt.actorName} ${t.cardEventAntiSwitch} ${evt.targetName ?? ''}`;
  };

  const renderVoiceAndChatBar = (currentRoom: RoomDoc) => {
    const joinedVoiceCount = currentRoom.playerOrder.filter((id) => players[id]?.voiceJoined).length;
    return (
      <View style={styles.cardCompact}>
        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.rowGap, { flexWrap: 'wrap', flex: 1 }]}>
            <Text style={styles.voiceTitle}>
              {t.voiceChatTitle} {joinedVoiceCount > 0 ? `(${joinedVoiceCount})` : ''}
            </Text>
            {!voice.voiceJoined ? (
              <TouchableOpacity
                onPress={() => {
                  hapticTap();
                  void voice.joinVoice();
                }}
                style={styles.voiceJoinBtn}
              >
                <Text style={styles.voiceJoinBtnText}>{t.joinVoiceBtn}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    void voice.toggleMute();
                  }}
                  style={[
                    styles.voiceToggleBtn,
                    voice.micMuted ? styles.voiceMutedBtn : styles.voiceLiveBtn,
                  ]}
                >
                  <Text style={styles.voiceBtnText}>
                    {voice.micMuted ? t.unmuteMicBtn : t.muteMicBtn}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    void voice.leaveVoice();
                  }}
                  style={styles.voiceLeaveBtn}
                >
                  <Text style={styles.voiceLeaveBtnText}>{t.leaveVoiceBtn}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity
            onPress={() => {
              hapticTap();
              setChatOpen(true);
            }}
            style={styles.chatToggleBtn}
          >
            <Text style={styles.chatToggleText}>{t.chatTitle}</Text>
            {unreadChatCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {!!voice.voiceError && (
          <Text style={[styles.errorText, dirText]}>
            {voice.voiceError === 'permission_denied' ? t.voicePermissionDenied : t.voiceNotSupported}
          </Text>
        )}
      </View>
    );
  };

  const renderInventoryBar = (opts: {
    mode: 'online' | 'single';
    goldCards: number;
    switchCards: number;
    antiSwitchCards: number;
    canUseGoldOrSwitch: boolean;
    canUseAntiSwitch: boolean;
    otherTargets: Array<{ uid: string; name: string }>;
    remainingDeckCards: number;
  }) => (
    <View style={styles.cardCompact}>
      <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.inventoryHeader}>{t.inventoryTitle}</Text>
        <Text style={styles.mutedSmall}>
          {t.cardsRemainingDeck}: {opts.remainingDeckCards}/5
        </Text>
      </View>

      <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
        <TouchableOpacity
          disabled={actionBusy || opts.goldCards < 1 || !opts.canUseGoldOrSwitch}
          onPress={() => {
            hapticTap();
            setCardModal({ mode: opts.mode, kind: 'gold' });
          }}
          style={[
            styles.cardChip,
            opts.goldCards > 0 && opts.canUseGoldOrSwitch ? styles.goldChipActive : styles.chipIdle,
            (opts.goldCards < 1 || !opts.canUseGoldOrSwitch) && styles.disabledChip,
          ]}
        >
          <Text style={styles.cardChipText}>
            {t.goldCardName} ({opts.goldCards})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={
            actionBusy ||
            opts.switchCards < 1 ||
            !opts.canUseGoldOrSwitch ||
            opts.otherTargets.length === 0
          }
          onPress={() => {
            hapticTap();
            setSwitchTargetUid(opts.otherTargets[0]?.uid ?? '');
            setCardModal({ mode: opts.mode, kind: 'switch' });
          }}
          style={[
            styles.cardChip,
            opts.switchCards > 0 && opts.canUseGoldOrSwitch && opts.otherTargets.length > 0
              ? styles.switchChipActive
              : styles.chipIdle,
            (opts.switchCards < 1 || !opts.canUseGoldOrSwitch || opts.otherTargets.length === 0) &&
              styles.disabledChip,
          ]}
        >
          <Text style={styles.cardChipText}>
            {t.switchCardName} ({opts.switchCards})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={actionBusy || opts.antiSwitchCards < 1 || !opts.canUseAntiSwitch}
          onPress={() => {
            hapticTap();
            setCardModal({ mode: opts.mode, kind: 'anti_switch' });
          }}
          style={[
            styles.cardChip,
            opts.antiSwitchCards > 0 && opts.canUseAntiSwitch
              ? styles.antiChipActive
              : styles.chipIdle,
            (opts.antiSwitchCards < 1 || !opts.canUseAntiSwitch) && styles.disabledChip,
          ]}
        >
          <Text style={styles.cardChipText}>
            {t.antiSwitchCardName} ({opts.antiSwitchCards})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.headerLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {screen !== 'home' && (
          <TouchableOpacity
            onPress={() => {
              if (screen === 'online_lobby' || screen === 'online_game') {
                void handleLeaveOnlineRoom();
              } else {
                hapticTap();
                setScreen('home');
              }
            }}
            style={styles.iconBtn}
          >
            <Text style={styles.iconBtnText}>{isRTL ? '→' : '←'}</Text>
          </TouchableOpacity>
        )}
        <Image source={require('./assets/icon.png')} style={styles.headerMiniLogo} />
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

  // Determine active confirmation modal target list
  const switchCandidateList: Array<{ uid: string; name: string }> =
    cardModal?.mode === 'online' && room
      ? room.playerOrder
          .filter((pid) => pid !== myUid && Boolean(players[pid]))
          .map((pid) => ({ uid: pid, name: players[pid].name }))
      : cardModal?.mode === 'single' && singleGame
        ? singleGame.players
            .filter((p) => p.id !== (singleGame.activePlayerId ?? singleGame.players[singleGame.currentTurnIndex]?.id))
            .map((p) => ({ uid: p.id, name: p.name }))
        : [];

  // Determine Reward Overlay visibility
  const onlineAwardVisible = Boolean(
    screen === 'online_game' &&
      room &&
      room.status === 'playing' &&
      room.activePlayerId === myUid &&
      room.lastCardEvent?.type === 'awarded' &&
      room.lastCardEvent.actorUid === myUid &&
      room.lastCardEvent.nonce === room.turnNonce &&
      dismissedOnlineAwardNonce !== room.turnNonce
  );

  const singleAwardVisible = Boolean(
    screen === 'single_game' &&
      singleGame &&
      singleGame.phase === 'playing' &&
      singleGame.lastCardEvent?.type === 'awarded' &&
      singleGame.lastCardEvent.nonce === singleGame.turnNonce &&
      dismissedSingleAwardNonce !== singleGame.turnNonce
  );

  const activeRewardEvent = onlineAwardVisible
    ? room?.lastCardEvent ?? null
    : singleAwardVisible
      ? singleGame?.lastCardEvent ?? null
      : null;

  const activeRewardCardType = activeRewardEvent ? getCardTypeFromId(activeRewardEvent.cardId) : null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <LinearGradient colors={['#FBF7F0', '#F5EDE0', '#FBF7F0']} style={StyleSheet.absoluteFill} />
        {renderHeader()}

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {screen === 'home' && (
            <View style={styles.sectionGap}>
              <View style={styles.heroBox}>
                <Image source={require('./assets/icon.png')} style={styles.heroLogo} />
                <Image
                  source={require('./assets/brand-wordmark.png')}
                  style={styles.heroWordmark}
                  resizeMode="contain"
                />
                <Text style={[styles.heroSub, dirText]}>{t.appSubtitle}</Text>
                <Text style={styles.metaText}>
                  {TOTAL_QUESTIONS_COUNT}{' '}
                  {language === 'ar' ? 'سؤالاً رسمياً · 2–12 لاعب' : 'Official Questions · 2–12 Players'}
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
                <Text style={[styles.modeTitleLight, dirText]}>{t.playOnline}</Text>
                <Text style={[styles.modeDescLight, dirText]}>{t.playOnlineDesc}</Text>
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
                  <ActivityIndicator size="large" color="#8B5E3C" />
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
                      <Text
                        style={[
                          styles.segmentText,
                          entryTab === 'create' && styles.segmentTextActive,
                        ]}
                      >
                        {t.createRoom}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        hapticTap();
                        setEntryTab('join');
                        setErrorMsg('');
                      }}
                      style={[styles.segmentBtn, entryTab === 'join' && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          entryTab === 'join' && styles.segmentTextActive,
                        ]}
                      >
                        {t.joinRoom}
                      </Text>
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
                          placeholderTextColor="#9C8D7E"
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
                      placeholderTextColor="#9C8D7E"
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
                            <Text
                              style={[
                                styles.segmentText,
                                entryGameMode === 'rounds' && styles.segmentTextActive,
                              ]}
                            >
                              {t.roundsModeOption}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              hapticTap();
                              setEntryGameMode('all_questions');
                            }}
                            style={[
                              styles.segmentBtn,
                              entryGameMode === 'all_questions' && styles.segmentActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.segmentText,
                                entryGameMode === 'all_questions' && styles.segmentTextActive,
                              ]}
                            >
                              {t.allQuestionsOption}
                            </Text>
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
                          <Switch
                            value={entryRandomFirst}
                            onValueChange={setEntryRandomFirst}
                            trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                            thumbColor={entryRandomFirst ? '#231A15' : '#FFFDF9'}
                          />
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

              {renderVoiceAndChatBar(room)}

              <View style={styles.card}>
                <Text style={[styles.cardTitle, dirText]}>
                  {t.playersCountLabel} ({room.playerOrder.length}/12)
                </Text>
                {room.playerOrder.map((pid) => {
                  const p = players[pid];
                  if (!p) return null;
                  const isHost = myUid === room.hostId;
                  const isSpeaking = Boolean(voice.speakingUids[pid]);
                  return (
                    <View key={pid} style={styles.playerRow}>
                      <View style={{ flex: 1 }}>
                        <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
                          <Text style={styles.playerName}>
                            {p.name} {p.isHost ? `(${t.hostBadge})` : ''}
                          </Text>
                          {p.voiceJoined && (
                            <Text
                              style={[
                                styles.micBadge,
                                p.micMuted
                                  ? styles.micMutedBadge
                                  : isSpeaking
                                    ? styles.micSpeakingBadge
                                    : styles.micLiveBadge,
                              ]}
                            >
                              {p.micMuted
                                ? t.micMutedLabel
                                : isSpeaking
                                  ? t.speakingLabel
                                  : t.micLiveLabel}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.mutedSmall}>
                          {p.connected ? t.connected : t.disconnected}
                        </Text>
                      </View>
                      {isHost && pid !== myUid && (
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
                {myUid === room.hostId ? (
                  <>
                    <View style={styles.segmentRow}>
                      <TouchableOpacity
                        onPress={() => {
                          hapticTap();
                          void updateLobbySettings(room.roomCode, {
                            gameMode: 'rounds',
                            roundsCount: Math.min(
                              getMaxRoundsForPlayers(room.playerOrder.length),
                              room.roundsCount
                            ),
                          });
                        }}
                        style={[styles.segmentBtn, room.gameMode === 'rounds' && styles.segmentActive]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            room.gameMode === 'rounds' && styles.segmentTextActive,
                          ]}
                        >
                          {t.roundsModeOption}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          hapticTap();
                          void updateLobbySettings(room.roomCode, { gameMode: 'all_questions' });
                        }}
                        style={[
                          styles.segmentBtn,
                          room.gameMode === 'all_questions' && styles.segmentActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            room.gameMode === 'all_questions' && styles.segmentTextActive,
                          ]}
                        >
                          {t.allQuestionsOption}
                        </Text>
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
                        trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                        thumbColor={room.randomFirstPlayer ? '#231A15' : '#FFFDF9'}
                      />
                    </View>

                    <TouchableOpacity
                      disabled={room.playerOrder.length < 2}
                      onPress={() => {
                        hapticTap();
                        setDoubleSkipNotice(false);
                        setDismissedOnlineAwardNonce(0);
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

                  <View style={styles.leaderboardBox}>
                    <Text style={[styles.label, dirText]}>{t.leaderboardTitle}</Text>
                    {[...room.playerOrder]
                      .map((pid) => players[pid])
                      .filter((p): p is RoomPlayerDoc => Boolean(p))
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .map((p, idx) => (
                        <View key={p.uid} style={styles.playerRow}>
                          <Text style={styles.playerName}>
                            #{idx + 1} {p.name}
                          </Text>
                          <Text
                            style={[
                              styles.scoreValue,
                              (p.score ?? 0) < 0 ? styles.scoreNegative : styles.scorePositive,
                            ]}
                          >
                            {p.score ?? 0} {t.pointsUnit}
                          </Text>
                        </View>
                      ))}
                  </View>

                  {myUid === room.hostId ? (
                    <TouchableOpacity
                      onPress={() => {
                        hapticTap();
                        setDoubleSkipNotice(false);
                        setDismissedOnlineAwardNonce(0);
                        void startOrRestartMultiplayerGame(room.roomCode);
                      }}
                      style={styles.primaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>{t.playAgain}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.mutedText, dirText]}>{t.waitingHostRestart}</Text>
                  )}
                  <TouchableOpacity onPress={handleLeaveOnlineRoom} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>{t.returnHome}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                (() => {
                  const isMyTurn = room.activePlayerId === myUid;
                  const myPlayer = players[myUid];
                  const activePlayer = room.activePlayerId ? players[room.activePlayerId] : undefined;
                  const hostPlayer = players[room.hostId];
                  const q = getQuestionById(room.currentQuestionId);
                  const skipsLeft = myPlayer?.skipsRemaining ?? 0;
                  const turnMode = room.turnMode ?? 'normal';
                  const turnQuestionsRemaining = room.turnQuestionsRemaining ?? 1;
                  const canUseGoldOrSwitch = isMyTurn && turnMode === 'normal';
                  const canUseAntiSwitch =
                    isMyTurn && turnMode === 'switch_pending' && room.switchTargetId === myUid;
                  const canNormalSkip = canUseGoldOrSwitch && skipsLeft > 0;
                  const otherTargets = room.playerOrder
                    .filter((pid) => pid !== myUid && Boolean(players[pid]))
                    .map((pid) => ({ uid: pid, name: players[pid].name }));
                  const switchSourceName = room.switchSourceId
                    ? players[room.switchSourceId]?.name
                    : undefined;
                  const totalConfiguredTurns =
                    room.gameMode === 'all_questions'
                      ? TOTAL_QUESTIONS_COUNT
                      : room.playerOrder.length * room.roundsCount;
                  const remainingPool = Math.max(
                    0,
                    TOTAL_QUESTIONS_COUNT - room.usedQuestionIds.length
                  );

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

                      {renderVoiceAndChatBar(room)}

                      {myPlayer &&
                        renderInventoryBar({
                          mode: 'online',
                          goldCards: myPlayer.goldCards ?? 0,
                          switchCards: myPlayer.switchCards ?? 0,
                          antiSwitchCards: myPlayer.antiSwitchCards ?? 0,
                          canUseGoldOrSwitch,
                          canUseAntiSwitch,
                          otherTargets,
                          remainingDeckCards: room.availableSpecialCards?.length ?? 0,
                        })}

                      {!!room.lastCardEvent && (
                        <View style={styles.eventBanner}>
                          <Text style={[styles.eventBannerText, dirText]}>
                            {formatCardEventText(room.lastCardEvent)}
                          </Text>
                        </View>
                      )}

                      {doubleSkipNotice && (
                        <View style={styles.warnBanner}>
                          <Text style={[styles.warnBannerText, dirText]}>
                            {t.doublePenaltyArmedAlert}
                          </Text>
                        </View>
                      )}

                      {turnMode === 'switch_pending' && (
                        <View style={styles.switchNotice}>
                          <Text style={[styles.switchNoticeText, dirText]}>
                            {t.switchedToYouBadge}: {switchSourceName ?? '...'}
                          </Text>
                        </View>
                      )}

                      {turnMode === 'anti_switch_forced' && (
                        <View style={styles.forcedNotice}>
                          <Text style={[styles.forcedNoticeText, dirText]}>
                            {t.antiSwitchForcedBadge} · {t.cannotRefuseHint}
                          </Text>
                        </View>
                      )}

                      {turnQuestionsRemaining === 2 && (
                        <View style={styles.warnBanner}>
                          <Text style={[styles.warnBannerText, dirText]}>
                            {t.doublePenaltyActiveBadge} · {t.questionOneOfTwo}
                          </Text>
                        </View>
                      )}

                      <View style={styles.card}>
                        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <View>
                            <Text style={[styles.label, dirText]}>
                              {isMyTurn ? t.yourTurnTitle : t.activePlayerTurn}
                            </Text>
                            <Text style={[styles.activePlayerName, dirText]}>
                              {activePlayer?.name ?? '...'}
                            </Text>
                          </View>
                          <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
                            <Text style={styles.mutedSmall}>{t.scoreLabel}</Text>
                            <Text
                              style={[
                                styles.scoreValueLarge,
                                (myPlayer?.score ?? 0) < 0 ? styles.scoreNegative : styles.scorePositive,
                              ]}
                            >
                              {myPlayer?.score ?? 0} {t.pointsUnit}
                            </Text>
                            <Text style={styles.mutedSmall}>
                              {t.skipsRemainingLabel}: {skipsLeft}/3
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.questionCard}>
                        <View style={styles.questionCardInner}>
                          <View style={[styles.rowBetweenWrap, { width: '100%' }]}>
                            <Text style={styles.cardCornerMark}>✦</Text>
                            <Text style={styles.cardCornerLabel}>{t.questionCardLabel}</Text>
                            <Text style={styles.cardCornerMark}>؟</Text>
                          </View>
                          {q ? (
                            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 14 }}>
                              {isMyTurn ? (
                                <Text style={styles.bonusPill}>{t.answerBonusBadge}</Text>
                              ) : (
                                <Text style={styles.bonusPill}>
                                  {t.activePlayerTurn}: {activePlayer?.name ?? '...'}
                                </Text>
                              )}
                              <Text style={[styles.questionText, dirText]}>{q.text}</Text>
                              {q.isGroupPrompt && (
                                <Text style={[styles.groupNoteText, dirText]}>{t.groupPromptNote}</Text>
                              )}
                              {!isMyTurn && (
                                <Text style={[styles.waitingText, dirText]}>{t.waitingTurnDesc}</Text>
                              )}
                            </View>
                          ) : (
                            <View style={{ paddingVertical: 24 }}>
                              <Text style={[styles.waitingText, dirText]}>{t.waitingTurnDesc}</Text>
                            </View>
                          )}
                          <View style={[styles.rowBetweenWrap, { width: '100%' }]}>
                            <Text style={styles.cardCornerMark}>؟</Text>
                            <Text style={styles.cardCornerMark}>✦</Text>
                          </View>
                        </View>
                      </View>

                      {isMyTurn && (
                        <View style={styles.rowGap}>
                          {canUseAntiSwitch ? (
                            <TouchableOpacity
                              disabled={actionBusy}
                              onPress={() => {
                                hapticTap();
                                setActionBusy(true);
                                void useAntiSwitchCard(room.roomCode).finally(() => setActionBusy(false));
                              }}
                              style={[styles.antiDefendBtn, actionBusy && styles.disabledBtn]}
                            >
                              <Text style={styles.antiDefendBtnText}>{t.defendWithAntiSwitchBtn}</Text>
                            </TouchableOpacity>
                          ) : turnMode === 'normal' ? (
                            <TouchableOpacity
                              disabled={actionBusy || !canNormalSkip}
                              onPress={() => {
                                hapticTap();
                                const isThird = (myPlayer?.skipsUsed ?? 0) === 2 && !myPlayer?.doublePenaltyUsed;
                                setActionBusy(true);
                                void skipTurnQuestion(room.roomCode)
                                  .then(() => {
                                    if (isThird) setDoubleSkipNotice(true);
                                  })
                                  .catch((e) => setErrorMsg(e instanceof Error ? e.message : t.errGeneric))
                                  .finally(() => setActionBusy(false));
                              }}
                              style={[
                                styles.secondaryBtn,
                                (actionBusy || !canNormalSkip) && styles.disabledBtn,
                              ]}
                            >
                              <Text style={styles.secondaryBtnText}>
                                {skipsLeft > 0 ? `${t.skipCostBadge} (${skipsLeft})` : t.noSkipsLeft}
                              </Text>
                            </TouchableOpacity>
                          ) : null}

                          <TouchableOpacity
                            disabled={actionBusy}
                            onPress={() => {
                              hapticTap();
                              setDoubleSkipNotice(false);
                              setActionBusy(true);
                              void advanceTurnNextQuestion(room.roomCode)
                                .catch((e) => setErrorMsg(e instanceof Error ? e.message : t.errGeneric))
                                .finally(() => setActionBusy(false));
                            }}
                            style={[styles.primaryBtn, { flex: 1 }, actionBusy && styles.disabledBtn]}
                          >
                            <Text style={styles.primaryBtnText}>{t.nextQuestion} (+1)</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {myUid === room.hostId && !isMyTurn && (
                        <TouchableOpacity
                          disabled={actionBusy}
                          onPress={() => {
                            hapticTap();
                            setActionBusy(true);
                            void advanceTurnNextQuestion(room.roomCode).finally(() =>
                              setActionBusy(false)
                            );
                          }}
                          style={styles.secondaryBtn}
                        >
                          <Text style={styles.secondaryBtnText}>{t.hostForceNext}</Text>
                        </TouchableOpacity>
                      )}

                      {myUid !== room.hostId && hostPlayer && !hostPlayer.connected && (
                        <TouchableOpacity
                          onPress={() => void claimDisconnectedHost(room.roomCode)}
                          style={styles.secondaryBtn}
                        >
                          <Text style={styles.secondaryBtnText}>{t.claimHost}</Text>
                        </TouchableOpacity>
                      )}

                      <View style={styles.card}>
                        <Text style={[styles.cardTitle, dirText]}>
                          {t.playersCountLabel} · {t.scoreLabel}
                        </Text>
                        {room.playerOrder.map((pid) => {
                          const p = players[pid];
                          if (!p) return null;
                          const isTurn = pid === room.activePlayerId;
                          const isSpeaking = Boolean(voice.speakingUids[pid]);
                          return (
                            <View key={pid} style={styles.playerRow}>
                              <View style={{ flex: 1 }}>
                                <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
                                  <Text style={styles.playerName}>
                                    {isTurn ? '▶ ' : ''}
                                    {p.name} {p.isHost ? `(${t.hostBadge})` : ''}
                                  </Text>
                                  {p.pendingDoubleTurn && !p.doublePenaltyUsed && (
                                    <Text style={styles.doubleBadge}>2×</Text>
                                  )}
                                  {p.voiceJoined && (
                                    <Text
                                      style={[
                                        styles.micBadge,
                                        p.micMuted
                                          ? styles.micMutedBadge
                                          : isSpeaking
                                            ? styles.micSpeakingBadge
                                            : styles.micLiveBadge,
                                      ]}
                                    >
                                      {p.micMuted
                                        ? t.micMutedLabel
                                        : isSpeaking
                                          ? t.speakingLabel
                                          : t.micLiveLabel}
                                    </Text>
                                  )}
                                </View>
                              </View>
                              <View style={[styles.rowGap, { gap: 12 }]}>
                                <Text
                                  style={[
                                    styles.scoreValue,
                                    (p.score ?? 0) < 0 ? styles.scoreNegative : styles.scorePositive,
                                  ]}
                                >
                                  {p.score ?? 0}
                                </Text>
                                <Text style={styles.mutedSmall}>{p.skipsRemaining}/3</Text>
                              </View>
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
                    placeholderTextColor="#9C8D7E"
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
                    <Text
                      style={[
                        styles.segmentText,
                        singleGameMode === 'rounds' && styles.segmentTextActive,
                      ]}
                    >
                      {t.roundsModeOption}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      setSingleGameMode('all_questions');
                    }}
                    style={[
                      styles.segmentBtn,
                      singleGameMode === 'all_questions' && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        singleGameMode === 'all_questions' && styles.segmentTextActive,
                      ]}
                    >
                      {t.allQuestionsOption}
                    </Text>
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
                        {singleRounds} {t.roundUnit} ({singlePlayers.length * singleRounds}/
                        {TOTAL_QUESTIONS_COUNT})
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
                  <Switch
                    value={singleRandomFirst}
                    onValueChange={setSingleRandomFirst}
                    trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                    thumbColor={singleRandomFirst ? '#231A15' : '#FFFDF9'}
                  />
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

                  <View style={styles.leaderboardBox}>
                    <Text style={[styles.label, dirText]}>{t.leaderboardTitle}</Text>
                    {[...singleGame.players]
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .map((p, idx) => (
                        <View key={p.id} style={styles.playerRow}>
                          <Text style={styles.playerName}>
                            #{idx + 1} {p.name}
                          </Text>
                          <Text
                            style={[
                              styles.scoreValue,
                              (p.score ?? 0) < 0 ? styles.scoreNegative : styles.scorePositive,
                            ]}
                          >
                            {p.score ?? 0} {t.pointsUnit}
                          </Text>
                        </View>
                      ))}
                  </View>

                  <TouchableOpacity onPress={startSinglePhone} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>{t.playAgain}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setScreen('home')} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>{t.returnHome}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                (() => {
                  const activePlayer =
                    (singleGame.activePlayerId
                      ? singleGame.players.find((p) => p.id === singleGame.activePlayerId)
                      : undefined) ?? singleGame.players[singleGame.currentTurnIndex];
                  const q = getQuestionById(singleGame.currentQuestionId);
                  const totalTurns =
                    singleGame.gameMode === 'all_questions'
                      ? TOTAL_QUESTIONS_COUNT
                      : singleGame.players.length * singleGame.roundsCount;
                  const remainingPool = Math.max(
                    0,
                    TOTAL_QUESTIONS_COUNT - singleGame.usedQuestionIds.length
                  );
                  const canUseGoldOrSwitch = singleGame.turnMode === 'normal';
                  const canUseAntiSwitch =
                    singleGame.turnMode === 'switch_pending' &&
                    Boolean(activePlayer && (activePlayer.antiSwitchCards ?? 0) >= 1);
                  const otherTargets = singleGame.players
                    .filter((p) => p.id !== activePlayer?.id)
                    .map((p) => ({ uid: p.id, name: p.name }));
                  const switchSourceName = singleGame.switchSourceId
                    ? singleGame.players.find((p) => p.id === singleGame.switchSourceId)?.name
                    : undefined;

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

                      {activePlayer &&
                        renderInventoryBar({
                          mode: 'single',
                          goldCards: activePlayer.goldCards ?? 0,
                          switchCards: activePlayer.switchCards ?? 0,
                          antiSwitchCards: activePlayer.antiSwitchCards ?? 0,
                          canUseGoldOrSwitch,
                          canUseAntiSwitch,
                          otherTargets,
                          remainingDeckCards: singleGame.availableSpecialCards.length,
                        })}

                      {!!singleGame.lastCardEvent && (
                        <View style={styles.eventBanner}>
                          <Text style={[styles.eventBannerText, dirText]}>
                            {formatCardEventText(singleGame.lastCardEvent)}
                          </Text>
                        </View>
                      )}

                      {singleGame.turnMode === 'switch_pending' && (
                        <View style={styles.switchNotice}>
                          <Text style={[styles.switchNoticeText, dirText]}>
                            {t.switchedToYouBadge}: {switchSourceName ?? '...'}
                          </Text>
                        </View>
                      )}

                      {singleGame.turnMode === 'anti_switch_forced' && (
                        <View style={styles.forcedNotice}>
                          <Text style={[styles.forcedNoticeText, dirText]}>
                            {t.antiSwitchForcedBadge} · {t.cannotRefuseHint}
                          </Text>
                        </View>
                      )}

                      <View style={styles.card}>
                        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <View>
                            <Text style={[styles.label, dirText]}>{t.passPhonePrompt}</Text>
                            <Text style={[styles.activePlayerName, dirText]}>
                              {activePlayer?.name}
                            </Text>
                          </View>
                          <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
                            <Text style={styles.mutedSmall}>{t.scoreLabel}</Text>
                            <Text
                              style={[
                                styles.scoreValueLarge,
                                (activePlayer?.score ?? 0) < 0
                                  ? styles.scoreNegative
                                  : styles.scorePositive,
                              ]}
                            >
                              {activePlayer?.score ?? 0} {t.pointsUnit}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.questionCard}>
                        <View style={styles.questionCardInner}>
                          <View style={[styles.rowBetweenWrap, { width: '100%' }]}>
                            <Text style={styles.cardCornerMark}>✦</Text>
                            <Text style={styles.cardCornerLabel}>{t.questionCardLabel}</Text>
                            <Text style={styles.cardCornerMark}>؟</Text>
                          </View>
                          <View style={{ gap: 12, alignItems: 'center', paddingVertical: 14 }}>
                            <Text style={styles.bonusPill}>{t.answerBonusBadge}</Text>
                            <Text style={[styles.questionText, dirText]}>{q?.text ?? ''}</Text>
                            {q?.isGroupPrompt && (
                              <Text style={[styles.groupNoteText, dirText]}>{t.groupPromptNote}</Text>
                            )}
                          </View>
                          <View style={[styles.rowBetweenWrap, { width: '100%' }]}>
                            <Text style={styles.cardCornerMark}>؟</Text>
                            <Text style={styles.cardCornerMark}>✦</Text>
                          </View>
                        </View>
                      </View>

                      {/* STRICTLY NO NORMAL SKIP IN SINGLE PHONE MODE */}
                      <View style={styles.rowGap}>
                        {canUseAntiSwitch && (
                          <TouchableOpacity
                            onPress={() => {
                              hapticTap();
                              setSingleGame((prev) =>
                                prev ? useSinglePhoneAntiSwitchCard(prev) : prev
                              );
                            }}
                            style={styles.antiDefendBtn}
                          >
                            <Text style={styles.antiDefendBtnText}>{t.defendWithAntiSwitchBtn}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={advanceSinglePhone}
                          style={[styles.primaryBtn, { flex: 1 }]}
                        >
                          <Text style={styles.primaryBtnText}>{t.nextQuestion} (+1)</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.card}>
                        <Text style={[styles.cardTitle, dirText]}>{t.leaderboardTitle}</Text>
                        {singleGame.players.map((p) => {
                          const isTurn = p.id === activePlayer?.id;
                          return (
                            <View key={p.id} style={styles.playerRow}>
                              <Text style={styles.playerName}>
                                {isTurn ? '▶ ' : ''}
                                {p.name}
                              </Text>
                              <Text
                                style={[
                                  styles.scoreValue,
                                  (p.score ?? 0) < 0 ? styles.scoreNegative : styles.scorePositive,
                                ]}
                              >
                                {p.score ?? 0} {t.pointsUnit}
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
                <Text style={[styles.cardTitle, dirText]}>{t.ruleScoringTitle}</Text>
                <Text style={[styles.mutedText, dirText]}>{t.ruleScoringBody}</Text>
              </View>
              <View style={styles.card}>
                <Text style={[styles.cardTitle, dirText]}>{t.ruleCardsTitle}</Text>
                <Text style={[styles.mutedText, dirText]}>{t.ruleCardsBody}</Text>
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
                    <Text
                      style={[
                        styles.segmentText,
                        language === 'ar' && styles.segmentTextActive,
                      ]}
                    >
                      {t.arabic}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      setLanguage('en');
                    }}
                    style={[styles.segmentBtn, language === 'en' && styles.segmentActive]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        language === 'en' && styles.segmentTextActive,
                      ]}
                    >
                      {t.english}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.playerRow}>
                  <Text style={[styles.playerName, dirText]}>{t.soundEffectsLabel}</Text>
                  <Switch
                    value={soundEnabled}
                    onValueChange={setSoundEnabled}
                    trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                    thumbColor={soundEnabled ? '#231A15' : '#FFFDF9'}
                  />
                </View>
              </View>
              <View style={styles.card}>
                <Text style={[styles.cardTitle, dirText]}>{t.offlineReadyLabel}</Text>
                <Text style={[styles.mutedText, dirText]}>{t.offlineReadySub}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Special Card Confirmation Modal */}
        <Modal
          visible={Boolean(cardModal)}
          transparent
          animationType="fade"
          onRequestClose={() => setCardModal(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={[styles.cardTitle, dirText]}>
                {cardModal?.kind === 'gold'
                  ? t.goldCardName
                  : cardModal?.kind === 'switch'
                    ? t.selectSwitchTargetTitle
                    : t.confirmUseAntiSwitchTitle}
              </Text>

              {cardModal?.kind === 'gold' && (
                <Text style={[styles.mutedText, dirText]}>{t.confirmUseGoldDesc}</Text>
              )}

              {cardModal?.kind === 'anti_switch' && (
                <Text style={[styles.mutedText, dirText]}>{t.confirmUseAntiSwitchDesc}</Text>
              )}

              {cardModal?.kind === 'switch' && (
                <View style={{ gap: 8, maxHeight: 240 }}>
                  <Text style={[styles.mutedText, dirText]}>{t.selectSwitchTargetDesc}</Text>
                  <ScrollView style={{ maxHeight: 190 }}>
                    {switchCandidateList.map((target) => {
                      const selected = switchTargetUid === target.uid;
                      return (
                        <TouchableOpacity
                          key={target.uid}
                          onPress={() => setSwitchTargetUid(target.uid)}
                          style={[
                            styles.targetRow,
                            selected && styles.targetRowSelected,
                          ]}
                        >
                          <Text style={styles.playerName}>{target.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.rowGap}>
                <TouchableOpacity onPress={() => setCardModal(null)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{t.cancelBtn}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={cardModal?.kind === 'switch' && !switchTargetUid}
                  onPress={() => {
                    const modal = cardModal;
                    const chosenTarget = switchTargetUid;
                    setCardModal(null);
                    if (!modal) return;
                    hapticTap();
                    if (modal.mode === 'online' && room) {
                      setActionBusy(true);
                      if (modal.kind === 'gold') {
                        void useGoldCard(room.roomCode).finally(() => setActionBusy(false));
                      } else if (modal.kind === 'switch' && chosenTarget) {
                        void useSwitchCard(room.roomCode, chosenTarget).finally(() =>
                          setActionBusy(false)
                        );
                      } else if (modal.kind === 'anti_switch') {
                        void useAntiSwitchCard(room.roomCode).finally(() => setActionBusy(false));
                      }
                    } else if (modal.mode === 'single') {
                      if (modal.kind === 'gold') {
                        setSingleGame((prev) => (prev ? useSinglePhoneGoldCard(prev) : prev));
                      } else if (modal.kind === 'switch' && chosenTarget) {
                        setSingleGame((prev) =>
                          prev ? useSinglePhoneSwitchCard(prev, chosenTarget) : prev
                        );
                      } else if (modal.kind === 'anti_switch') {
                        setSingleGame((prev) =>
                          prev ? useSinglePhoneAntiSwitchCard(prev) : prev
                        );
                      }
                    }
                  }}
                  style={[styles.primaryBtn, { flex: 1 }]}
                >
                  <Text style={styles.primaryBtnText}>{t.confirmBtn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Special Card Reward Celebration Modal */}
        <Modal
          visible={Boolean(activeRewardEvent)}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (onlineAwardVisible && room) setDismissedOnlineAwardNonce(room.turnNonce);
            if (singleAwardVisible && singleGame) setDismissedSingleAwardNonce(singleGame.turnNonce);
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, styles.rewardCard]}>
              <Text style={[styles.label, { textAlign: 'center' }]}>
                {activeRewardEvent?.actorName} · {t.specialCardRewardTitle}
              </Text>
              <Text style={[styles.pageTitle, { textAlign: 'center' }]}>
                {activeRewardCardType === 'gold'
                  ? t.goldCardName
                  : activeRewardCardType === 'switch'
                    ? t.switchCardName
                    : t.antiSwitchCardName}
              </Text>
              <Text style={[styles.mutedText, { textAlign: 'center' }, dirText]}>
                {activeRewardCardType === 'gold'
                  ? t.goldCardDesc
                  : activeRewardCardType === 'switch'
                    ? t.switchCardDesc
                    : t.antiSwitchCardDesc}
              </Text>
              <Text style={[styles.mutedSmall, { textAlign: 'center' }, dirText]}>
                {t.specialCardRewardSub}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  hapticTap();
                  if (onlineAwardVisible && room) setDismissedOnlineAwardNonce(room.turnNonce);
                  if (singleAwardVisible && singleGame) {
                    setDismissedSingleAwardNonce(singleGame.turnNonce);
                  }
                }}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>{t.collectAndContinue}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Collapsible Room Text Chat Modal */}
        <Modal
          visible={chatOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setChatOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.chatModalCard}>
              <View style={[styles.rowBetweenWrap, { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E8DEC8' }]}>
                <Text style={styles.cardTitle}>{t.chatTitle}</Text>
                <TouchableOpacity onPress={() => setChatOpen(false)} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>{t.close}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, marginVertical: 10 }}>
                {chatMessages.length === 0 ? (
                  <Text style={[styles.mutedText, { textAlign: 'center', marginTop: 24 }]}>
                    {t.noMessagesYet}
                  </Text>
                ) : (
                  chatMessages.map((m) => {
                    const isMe = m.senderId === myUid;
                    const timeStr = m.createdAt?.toDate
                      ? m.createdAt.toDate().toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '...';
                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.chatBubbleWrap,
                          { alignItems: isMe ? 'flex-end' : 'flex-start' },
                        ]}
                      >
                        <Text style={styles.mutedSmall}>
                          {m.senderName} · {timeStr}
                        </Text>
                        <View style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
                          <Text
                            style={isMe ? styles.chatBubbleTextMe : styles.chatBubbleTextOther}
                          >
                            {m.text}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.rowGap}>
                <TextInput
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  maxLength={500}
                  placeholder={t.chatPlaceholder}
                  placeholderTextColor="#9C8D7E"
                  style={[styles.input, { flex: 1 }, dirText]}
                />
                <TouchableOpacity
                  disabled={!chatDraft.trim() || chatSending}
                  onPress={() => void handleSendChat()}
                  style={[styles.smallPrimaryBtn, (!chatDraft.trim() || chatSending) && styles.disabledBtn]}
                >
                  <Text style={styles.primaryBtnText}>{t.sendMsgBtn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBF7F0' },
  header: {
    height: 58,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F6EFE3',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD2C0',
  },
  headerLeft: { alignItems: 'center', gap: 10 },
  headerMiniLogo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  brandTitle: { color: '#231A15', fontSize: 18, fontWeight: '800' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: '#231A15', fontSize: 18, fontWeight: '700' },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  langBtnText: { color: '#231A15', fontSize: 13, fontWeight: '700' },
  scrollContent: { padding: 18, paddingBottom: 42 },
  sectionGap: { gap: 14 },
  rowGap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  rowBetweenWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroBox: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  heroLogo: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D5C7B2',
    marginBottom: 4,
  },
  heroWordmark: { width: 248, height: 82 },
  heroTitle: { color: '#231A15', fontSize: 36, fontWeight: '800' },
  heroSub: { color: '#5E4F43', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  metaText: { color: '#7A6A5B', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modeCard: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: '#D5C7B2',
    shadowColor: '#231A15',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
    gap: 8,
  },
  modeCardOnline: {
    borderColor: '#231A15',
    backgroundColor: '#231A15',
    shadowOpacity: 0.18,
  },
  modeTitle: { color: '#231A15', fontSize: 22, fontWeight: '800' },
  modeDesc: { color: '#6E5E50', fontSize: 14, lineHeight: 20 },
  modeTitleLight: { color: '#FFFDF9', fontSize: 22, fontWeight: '800' },
  modeDescLight: { color: '#DDD2C0', fontSize: 14, lineHeight: 20 },
  pageTitle: { color: '#231A15', fontSize: 24, fontWeight: '800' },
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    shadowColor: '#231A15',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 1,
    gap: 12,
  },
  cardCompact: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    gap: 8,
  },
  cardTitle: { color: '#231A15', fontSize: 17, fontWeight: '700' },
  label: { color: '#8B5E3C', fontSize: 13, fontWeight: '700' },
  mutedText: { color: '#5E4F43', fontSize: 14, lineHeight: 21 },
  mutedSmall: { color: '#7A6A5B', fontSize: 12 },
  warnText: { color: '#8C6820', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#9B3B30', fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    paddingHorizontal: 14,
    color: '#231A15',
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
  bigRoomCode: {
    color: '#231A15',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    paddingVertical: 6,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  smallPrimaryBtn: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryBtnText: { color: '#FBF7F0', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryBtnText: { color: '#231A15', fontSize: 14, fontWeight: '700' },
  disabledBtn: { opacity: 0.42 },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#F3EBDD',
    borderWidth: 1,
    borderColor: '#DDD2C0',
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
  segmentActive: { backgroundColor: '#231A15' },
  segmentText: { color: '#6E5E50', fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: '#FBF7F0' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#231A15', fontSize: 20, fontWeight: '800' },
  stepValue: { color: '#231A15', fontSize: 15, fontWeight: '700' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFE6D6',
  },
  playerName: { color: '#231A15', fontSize: 15, fontWeight: '700' },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  editBtnText: { color: '#231A15', fontSize: 12, fontWeight: '700' },
  kickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F9EAE6',
    borderWidth: 1,
    borderColor: '#D9A79D',
  },
  kickBtnText: { color: '#9B3B30', fontSize: 12, fontWeight: '700' },
  activePlayerName: { color: '#231A15', fontSize: 26, fontWeight: '800' },
  questionCard: {
    minHeight: 250,
    borderRadius: 28,
    padding: 12,
    backgroundColor: '#FFFDF9',
    borderWidth: 2,
    borderColor: '#C8B9A3',
    shadowColor: '#231A15',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  questionCardInner: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D5C7B2',
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCornerMark: { color: '#8B5E3C', fontSize: 16, fontWeight: '800', opacity: 0.7 },
  cardCornerLabel: { color: '#8B5E3C', fontSize: 12, fontWeight: '700' },
  questionText: {
    color: '#231A15',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 38,
  },
  groupNoteText: {
    color: '#6F492E',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingText: { color: '#5E4F43', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  centerBox: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  reconnectBox: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#F3EBDD',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reconnectText: { color: '#231A15', fontSize: 14, fontWeight: '700' },
  scoreValue: { fontSize: 14, fontWeight: '800' },
  scoreValueLarge: { fontSize: 18, fontWeight: '800' },
  scorePositive: { color: '#4A6B46' },
  scoreNegative: { color: '#9B3B30' },
  doubleBadge: {
    color: '#7D5D18',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: '#FBF5E4',
    borderWidth: 1,
    borderColor: '#D7BD7B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bonusPill: {
    color: '#355432',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: '#EEF3EC',
    borderWidth: 1,
    borderColor: '#B9CEB3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  leaderboardBox: {
    borderRadius: 16,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    padding: 12,
    gap: 6,
  },
  inventoryHeader: { color: '#8B5E3C', fontSize: 13, fontWeight: '800' },
  cardChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: '#F6EFE3',
    borderColor: '#E5DAC8',
  },
  goldChipActive: {
    backgroundColor: '#FBF5E4',
    borderColor: '#C7A355',
  },
  switchChipActive: {
    backgroundColor: '#EFECE4',
    borderColor: '#8D8879',
  },
  antiChipActive: {
    backgroundColor: '#F9EAE6',
    borderColor: '#B45E4D',
  },
  disabledChip: { opacity: 0.55 },
  cardChipText: { color: '#231A15', fontSize: 12, fontWeight: '700' },
  eventBanner: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#F3EBDD',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  eventBannerText: { color: '#231A15', fontSize: 13, fontWeight: '700' },
  warnBanner: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#FBF5E4',
    borderWidth: 1,
    borderColor: '#C7A355',
  },
  warnBannerText: { color: '#7D5D18', fontSize: 13, fontWeight: '700' },
  switchNotice: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#EFECE4',
    borderWidth: 1,
    borderColor: '#A8A294',
  },
  switchNoticeText: { color: '#4A463B', fontSize: 13, fontWeight: '700' },
  forcedNotice: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#F9EAE6',
    borderWidth: 1,
    borderColor: '#C88172',
  },
  forcedNoticeText: { color: '#843B2E', fontSize: 13, fontWeight: '700' },
  antiDefendBtn: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: '#F9EAE6',
    borderWidth: 1.5,
    borderColor: '#B45E4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  antiDefendBtnText: { color: '#843B2E', fontSize: 13, fontWeight: '800' },
  voiceTitle: { color: '#5E4F43', fontSize: 13, fontWeight: '700' },
  voiceJoinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EEF3EC',
    borderWidth: 1,
    borderColor: '#B9CEB3',
  },
  voiceJoinBtnText: { color: '#355432', fontSize: 12, fontWeight: '700' },
  voiceToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  voiceLiveBtn: {
    backgroundColor: '#231A15',
    borderColor: '#231A15',
  },
  voiceMutedBtn: {
    backgroundColor: '#9B3B30',
    borderColor: '#9B3B30',
  },
  voiceBtnText: { color: '#FBF7F0', fontSize: 12, fontWeight: '700' },
  voiceLeaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  voiceLeaveBtnText: { color: '#5E4F43', fontSize: 12, fontWeight: '700' },
  chatToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  chatToggleText: { color: '#231A15', fontSize: 12, fontWeight: '700' },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#9B3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { color: '#FFFDF9', fontSize: 10, fontWeight: '800' },
  micBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  micLiveBadge: { backgroundColor: '#EFE6D6', color: '#5E4F43' },
  micMutedBadge: { backgroundColor: '#F9EAE6', color: '#9B3B30' },
  micSpeakingBadge: { backgroundColor: '#EEF3EC', color: '#355432' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(35,26,21,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#FFFDF9',
    borderWidth: 2,
    borderColor: '#D5C7B2',
    gap: 14,
  },
  rewardCard: {
    borderColor: '#C7A355',
    backgroundColor: '#FBF5E4',
  },
  targetRow: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    marginBottom: 8,
  },
  targetRowSelected: {
    backgroundColor: '#EFE6D6',
    borderColor: '#8B5E3C',
  },
  chatModalCard: {
    height: '78%',
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: '#D5C7B2',
  },
  chatBubbleWrap: { marginBottom: 10, gap: 3 },
  chatBubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  chatBubbleMe: { backgroundColor: '#231A15' },
  chatBubbleOther: { backgroundColor: '#EFE6D6', borderWidth: 1, borderColor: '#DDD2C0' },
  chatBubbleTextMe: { color: '#FBF7F0', fontSize: 14, lineHeight: 20 },
  chatBubbleTextOther: { color: '#231A15', fontSize: 14, lineHeight: 20 },
});
