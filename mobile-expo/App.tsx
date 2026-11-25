import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { AvatarPickerModal } from './src/components/AvatarPickerModal';
import { MobileChatModal } from './src/components/MobileChatModal';
import { PlayerAvatar } from './src/components/PlayerAvatar';
import { pickDefaultAvatar } from './src/config/avatars';
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
  getSavedPlayerAvatar,
  getSavedPlayerName,
  joinMultiplayerRoom,
  kickPlayerFromLobby,
  leaveMultiplayerRoom,
  saveActiveRoom,
  savePlayerAvatar,
  setPlayerConnectionState,
  skipTurnQuestion,
  startOrRestartMultiplayerGame,
  subscribeToRoomAndPlayers,
  subscribeToRoomChatPresence,
  subscribeToRoomMessages,
  subscribeToRoomReactions,
  updateLobbySettings,
  updateMyLobbyAvatar,
  useAntiSwitchCard,
  useGoldCard,
  useSwitchCard,
  type GameLengthMode,
  type MessageReactionDoc,
  type RoomChatMessage,
  type RoomChatPresenceDoc,
  type RoomDoc,
  type RoomPlayerDoc,
} from './src/services/multiplayerService';
import {
  configureMobileNotificationHandler,
  getMobileNotificationPermissionState,
  loadChatNotificationsEnabled,
  requestMobileChatNotificationPermission,
  saveChatNotificationsEnabled,
  scheduleIncomingChatNotification,
  type MobileNotificationPermissionState,
} from './src/utils/chatNotifications';
import { formatMultiplayerError } from './src/utils/errorMessages';
import {
  createEmptySinglePhoneChatState,
  loadSinglePhoneChatState,
  type SinglePhoneChatStoreState,
} from './src/utils/singlePhoneChatStore';
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

configureMobileNotificationHandler();

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
  const [displayAvatar, setDisplayAvatar] = useState(() => pickDefaultAvatar('player'));
  const [avatarPickerTarget, setAvatarPickerTarget] = useState<
    | null
    | { kind: 'online_entry' }
    | { kind: 'online_lobby' }
    | { kind: 'single_player'; playerId: string }
  >(null);
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
  const [completedOnlineRound, setCompletedOnlineRound] = useState<number | null>(null);
  const prevOnlineRoundRef = useRef<number | null>(null);
  const prevOnlineGameNumRef = useRef<number | null>(null);

  // Collapsible Room Text Chat, Voice Notes, Emojis & Reactions state (Online & Single Phone)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'online' | 'single_phone'>('online');
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [onlineReactions, setOnlineReactions] = useState<MessageReactionDoc[]>([]);
  const [chatPresence, setChatPresence] = useState<RoomChatPresenceDoc[]>([]);
  const [presenceNowMs, setPresenceNowMs] = useState<number>(() => Date.now());
  const [spChatState, setSpChatState] = useState<SinglePhoneChatStoreState>(() =>
    createEmptySinglePhoneChatState()
  );
  const [spChatSenderId, setSpChatSenderId] = useState('sp-1');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [notifPermission, setNotifPermission] =
    useState<MobileNotificationPermissionState>('undetermined');
  const initialMsgsLoadedRef = useRef(false);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const chatOpenRef = useRef(false);
  const chatNotificationsEnabledRef = useRef(true);
  const activeRoomCodeRef = useRef<string | null>(null);
  chatOpenRef.current = chatOpen;
  chatNotificationsEnabledRef.current = chatNotificationsEnabled;
  activeRoomCodeRef.current = activeRoomCode;

  // Special Card confirmation modal state (shared cleanly between active mode)
  const [cardModal, setCardModal] = useState<{
    mode: 'online' | 'single';
    kind: 'gold' | 'switch' | 'anti_switch';
  } | null>(null);
  const [switchTargetUid, setSwitchTargetUid] = useState('');

  // Single Phone offline state (strictly zero normal skip)
  const [singlePlayers, setSinglePlayers] = useState<SinglePhonePlayer[]>([
    { id: 'sp-1', name: 'أحمد', avatarColor: pickDefaultAvatar(1) },
    { id: 'sp-2', name: 'محمد', avatarColor: pickDefaultAvatar(2) },
    { id: 'sp-3', name: 'عمر', avatarColor: pickDefaultAvatar(3) },
    { id: 'sp-4', name: 'علي', avatarColor: pickDefaultAvatar(4) },
  ]);
  const [newSingleName, setNewSingleName] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');
  const [singleGameMode, setSingleGameMode] = useState<GameLengthMode>('rounds');
  const [singleRounds, setSingleRounds] = useState(3);
  const [singleRandomFirst, setSingleRandomFirst] = useState(true);
  const [singleGame, setSingleGame] = useState<SinglePhoneGame | null>(null);
  const [dismissedSingleAwardNonce, setDismissedSingleAwardNonce] = useState(0);
  const [completedSingleRound, setCompletedSingleRound] = useState<number | null>(null);
  const prevSingleRoundRef = useRef<number | null>(null);
  const prevSinglePhaseRef = useRef<SinglePhoneGame['phase'] | null>(null);
  const [spCardsRevealed, setSpCardsRevealed] = useState(false);
  const [singleRewardRevealed, setSingleRewardRevealed] = useState(false);

  const rewardScaleAnim = useRef(new Animated.Value(0.65)).current;
  const rewardFlipAnim = useRef(new Animated.Value(0)).current;
  const rewardGlowAnim = useRef(new Animated.Value(0)).current;
  const rewardBurstAnim = useRef(new Animated.Value(0)).current;

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
    getSavedPlayerAvatar().then((av) => av && setDisplayAvatar(av));
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
          if (Array.isArray(parsed) && parsed.length >= 2) {
            setSinglePlayers(
              parsed.map((p, idx) => ({
                ...p,
                avatarColor: p.avatarColor || pickDefaultAvatar(idx + 1),
              }))
            );
          }
        } catch {
          // ignore
        }
      }
    });
    loadSinglePhoneChatState().then(setSpChatState).catch(() => {});
    loadChatNotificationsEnabled().then(setChatNotificationsEnabled).catch(() => {});
    getMobileNotificationPermissionState().then(setNotifPermission).catch(() => {});

    let tapSub: Notifications.EventSubscription | null = null;
    try {
      tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | { roomCode?: string; openChat?: boolean }
          | undefined;
        if (data?.openChat && activeRoomCodeRef.current) {
          setChatMode('online');
          setChatOpen(true);
        }
      });
    } catch {
      // ignore if notifications listener unavailable
    }

    return () => {
      unsub();
      try {
        tapSub?.remove();
      } catch {
        // ignore
      }
    };
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
    } catch (err) {
      setErrorMsg(formatMultiplayerError(err, t));
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
  const tRef = useRef(t);
  tRef.current = t;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    if (!activeRoomCode) return;
    const unsub = subscribeToRoomAndPlayers(
      activeRoomCode,
      (nextRoom, nextPlayers) => {
        const dict = tRef.current;
        if (!nextRoom || nextRoom.status === 'closed') {
          void saveActiveRoom(null);
          setActiveRoomCode(null);
          setRoom(null);
          setErrorMsg(dict.errRoomClosed);
          setScreen('online_entry');
          return;
        }
        if (authUser && !nextRoom.playerOrder.includes(authUser.uid)) {
          void saveActiveRoom(null);
          setActiveRoomCode(null);
          setRoom(null);
          setErrorMsg(dict.errKickedFromRoom);
          setScreen('online_entry');
          return;
        }
        if (
          nextRoom.status === 'playing' &&
          prevOnlineGameNumRef.current === nextRoom.gameNumber &&
          prevOnlineRoundRef.current !== null &&
          nextRoom.currentRound > prevOnlineRoundRef.current
        ) {
          setCompletedOnlineRound(prevOnlineRoundRef.current);
          if (soundEnabledRef.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        if (nextRoom.status !== 'playing' || prevOnlineGameNumRef.current !== nextRoom.gameNumber) {
          setCompletedOnlineRound(null);
        }
        prevOnlineGameNumRef.current = nextRoom.gameNumber;
        prevOnlineRoundRef.current = nextRoom.status === 'playing' ? nextRoom.currentRound : null;

        setRoom(nextRoom);
        setPlayers(nextPlayers);
        if (nextRoom.status === 'waiting') setScreen('online_lobby');
        else setScreen('online_game');
      },
      (err) => setErrorMsg(formatMultiplayerError(err, tRef.current))
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

  // Track Single Phone round transitions for Round Results summary
  useEffect(() => {
    if (!singleGame || singleGame.phase !== 'playing') {
      setCompletedSingleRound(null);
      prevSingleRoundRef.current = null;
      prevSinglePhaseRef.current = singleGame?.phase ?? null;
      return;
    }
    if (
      prevSinglePhaseRef.current === 'playing' &&
      prevSingleRoundRef.current !== null &&
      singleGame.currentRound > prevSingleRoundRef.current
    ) {
      setCompletedSingleRound(prevSingleRoundRef.current);
      if (soundEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    prevSingleRoundRef.current = singleGame.currentRound;
    prevSinglePhaseRef.current = singleGame.phase;
  }, [singleGame?.phase, singleGame?.currentRound, soundEnabled]);

  // Auto-hide Single Phone secret card bar when passing phone / changing turns
  useEffect(() => {
    setSpCardsRevealed(false);
  }, [singleGame?.activePlayerId, singleGame?.turnNonce]);

  // Real-time Room Text Chat, Reactions, Typing/Recording Presence & Notifications Listener
  useEffect(() => {
    if (!activeRoomCode || !myUid) {
      setChatMessages([]);
      setOnlineReactions([]);
      setChatPresence([]);
      setUnreadChatCount(0);
      initialMsgsLoadedRef.current = false;
      knownMsgIdsRef.current = new Set();
      return;
    }

    initialMsgsLoadedRef.current = false;
    knownMsgIdsRef.current = new Set();

    const unsubMsgs = subscribeToRoomMessages(
      activeRoomCode,
      myUid,
      (msgs) => {
        setChatMessages(msgs);

        if (!initialMsgsLoadedRef.current) {
          initialMsgsLoadedRef.current = true;
          knownMsgIdsRef.current = new Set(msgs.map((m) => m.id));
          return;
        }

        const newlyArrived = msgs.filter((m) => !knownMsgIdsRef.current.has(m.id));
        knownMsgIdsRef.current = new Set(msgs.map((m) => m.id));

        if (chatOpenRef.current) {
          setUnreadChatCount(0);
          return;
        }

        const fromOthers = newlyArrived.filter((m) => m.senderId !== myUid);
        if (fromOthers.length > 0) {
          setUnreadChatCount((c) => c + fromOthers.length);
          if (chatNotificationsEnabledRef.current) {
            const latest = fromOthers[fromOthers.length - 1];
            const dict = tRef.current;
            const previewBody =
              latest.messageType === 'voice'
                ? `🎤 ${dict.replyVoicePreview}`
                : latest.text;
            void scheduleIncomingChatNotification({
              roomCode: activeRoomCode,
              title: `${latest.senderName} · ${dict.newMessageNotifTitle}`,
              body: previewBody.slice(0, 120),
            });
          }
        }
      },
      (err) => setErrorMsg(formatMultiplayerError(err, tRef.current))
    );

    const unsubReacts = subscribeToRoomReactions(
      activeRoomCode,
      myUid,
      setOnlineReactions,
      (err) => setErrorMsg(formatMultiplayerError(err, tRef.current))
    );

    const unsubPresence = subscribeToRoomChatPresence(
      activeRoomCode,
      myUid,
      (items) => {
        setChatPresence(items);
        setPresenceNowMs(Date.now());
      },
      (err) => setErrorMsg(formatMultiplayerError(err, tRef.current))
    );

    return () => {
      unsubMsgs();
      unsubReacts();
      unsubPresence();
    };
  }, [activeRoomCode, myUid]);

  useEffect(() => {
    const hasRemote = chatPresence.some((p) => p.uid !== myUid && p.status !== 'idle');
    if (!hasRemote) return;
    setPresenceNowMs(Date.now());
    const id = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [chatPresence, myUid]);

  useEffect(() => {
    if (chatOpen && chatMode === 'online') {
      setUnreadChatCount(0);
    }
  }, [chatOpen, chatMode, chatMessages.length]);

  const hapticTap = () => {
    if (soundEnabled) Haptics.selectionAsync().catch(() => {});
  };

  const handleLeaveOnlineRoom = async () => {
    hapticTap();
    setChatOpen(false);
    setCardModal(null);
    setDoubleSkipNotice(false);
    setDismissedOnlineAwardNonce(0);
    setCompletedOnlineRound(null);
    prevOnlineRoundRef.current = null;
    prevOnlineGameNumRef.current = null;
    setErrorMsg('');
    await voice.leaveVoice();
    if (activeRoomCode) await leaveMultiplayerRoom(activeRoomCode);
    setActiveRoomCode(null);
    setRoom(null);
    setOnlineReactions([]);
    setChatPresence([]);
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
        avatarColor: displayAvatar,
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
      else setErrorMsg(formatMultiplayerError(err, t));
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
      const res = await joinMultiplayerRoom({
        rawCode: cleanCode,
        playerName: displayName,
        avatarColor: displayAvatar,
      });
      setActiveRoomCode(res.roomCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'FIREBASE_NOT_CONFIGURED') setFirebaseMissing(true);
      else setErrorMsg(formatMultiplayerError(err, t));
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
          avatarColor: pickDefaultAvatar(num + Date.now()),
        });
      }
      return next;
    });
  };

  const startSinglePhone = () => {
    hapticTap();
    setDismissedSingleAwardNonce(0);
    setCompletedSingleRound(null);
    prevSingleRoundRef.current = null;
    prevSinglePhaseRef.current = null;
    setSpCardsRevealed(false);
    setSingleRewardRevealed(false);
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
    // STRICT PRIVACY: never expose card awards publicly to other players
    if (!evt || evt.type === 'awarded') return '';
    if (evt.type === 'gold') return `${evt.actorName} ${t.cardEventGold}`;
    if (evt.type === 'switch') return `${evt.actorName} ${t.cardEventSwitch} ${evt.targetName ?? ''}`;
    return `${evt.actorName} ${t.cardEventAntiSwitch} ${evt.targetName ?? ''}`;
  };

  const getClosedChatActivityLabel = (): { kind: 'typing' | 'recording'; text: string } | null => {
    const active = chatPresence.filter(
      (p) => p.uid !== myUid && p.status !== 'idle' && p.expiresAtMs > presenceNowMs
    );
    if (active.length === 0) return null;
    const isRec = active.some((p) => p.status === 'recording');
    const first = (isRec ? active.find((p) => p.status === 'recording') : active[0])?.name;
    const label = first
      ? `${first}: ${isRec ? t.chatSomeoneRecordingShort : t.chatSomeoneTypingShort}`
      : isRec
        ? t.chatSomeoneRecordingShort
        : t.chatSomeoneTypingShort;
    return { kind: isRec ? 'recording' : 'typing', text: label };
  };

  const renderVoiceAndChatBar = (currentRoom: RoomDoc) => {
    const joinedVoiceCount = currentRoom.playerOrder.filter((id) => players[id]?.voiceJoined).length;
    const chatActivity = getClosedChatActivityLabel();
    const statusLabel =
      voice.voiceStatus === 'connected'
        ? `${t.voiceStatusConnected} (${voice.connectedPeersCount})`
        : voice.voiceStatus === 'connecting'
          ? t.voiceStatusConnecting
          : voice.voiceStatus === 'reconnecting'
            ? t.voiceStatusReconnecting
            : voice.voiceStatus === 'failed'
              ? t.voiceStatusFailed
              : voice.voiceStatus === 'joining'
                ? t.voiceStatusJoining
                : voice.voiceStatus === 'waiting_peers'
                  ? t.voiceStatusWaitingPeers
                  : '';

    return (
      <View style={styles.cardCompact}>
        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.rowGap, { flexWrap: 'wrap', flex: 1 }]}>
            <Text style={styles.voiceTitle}>
              {t.voiceChatTitle} {joinedVoiceCount > 0 ? `(${joinedVoiceCount})` : ''}
            </Text>
            {!voice.voiceJoined ? (
              <TouchableOpacity
                disabled={voice.voiceStatus === 'joining'}
                onPress={() => {
                  hapticTap();
                  void voice.joinVoice();
                }}
                style={[styles.voiceJoinBtn, voice.voiceStatus === 'joining' && styles.disabledBtn]}
              >
                <Text style={styles.voiceJoinBtnText}>
                  {voice.voiceStatus === 'joining' ? t.voiceStatusJoining : t.joinVoiceBtn}
                </Text>
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
                {(voice.voiceStatus === 'failed' || voice.voiceStatus === 'reconnecting') && (
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      void voice.reconnectVoice();
                    }}
                    style={styles.voiceReconnectBtn}
                  >
                    <Text style={styles.voiceReconnectBtnText}>{t.voiceReconnectBtn}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            onPress={() => {
              hapticTap();
              setChatMode('online');
              setChatOpen(true);
            }}
            style={styles.chatToggleBtn}
          >
            <Text style={styles.chatToggleText}>{t.chatTitle}</Text>
            {chatActivity && (
              <View
                style={[
                  styles.chatActivityBadge,
                  chatActivity.kind === 'recording' && styles.chatActivityRecBadge,
                ]}
              >
                <Text
                  style={[
                    styles.chatActivityText,
                    chatActivity.kind === 'recording' && styles.chatActivityRecText,
                  ]}
                >
                  {chatActivity.text}
                </Text>
              </View>
            )}
            {unreadChatCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {voice.voiceJoined && !!statusLabel && (
          <Text
            style={[
              styles.voiceStatusText,
              voice.voiceStatus === 'connected'
                ? styles.voiceStatusConnectedText
                : voice.voiceStatus === 'failed'
                  ? styles.voiceStatusFailedText
                  : styles.voiceStatusPendingText,
              dirText,
            ]}
          >
            {statusLabel}
          </Text>
        )}

        {!!voice.voiceError && (
          <Text style={[styles.errorText, dirText]}>
            {voice.voiceError === 'permission_denied'
              ? t.voicePermissionDenied
              : voice.voiceError === 'no_mic_device'
                ? t.voiceMicNotFound
                : t.voiceNotSupported}
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
    privateToggleMode?: boolean;
    isRevealed?: boolean;
    onToggleReveal?: () => void;
  }) => (
    <View style={styles.cardCompact}>
      <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.inventoryHeader}>{t.inventoryTitle}</Text>
        {opts.privateToggleMode && opts.isRevealed && opts.onToggleReveal && (
          <TouchableOpacity onPress={opts.onToggleReveal} style={styles.privacyToggleBtn}>
            <Text style={styles.privacyToggleText}>{t.hideSecretCardsBtn}</Text>
          </TouchableOpacity>
        )}
      </View>

      {opts.privateToggleMode && !opts.isRevealed ? (
        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.mutedSmall, { flex: 1 }, dirText]}>
            {t.singlePhoneCardsLockedHint}
          </Text>
          <TouchableOpacity onPress={opts.onToggleReveal} style={styles.privacyRevealBtn}>
            <Text style={styles.privacyRevealText}>👁 {t.showSecretCardsBtn}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
          <TouchableOpacity
            disabled={actionBusy || opts.goldCards < 1 || !opts.canUseGoldOrSwitch}
            onPress={() => {
              hapticTap();
              setCardModal({ mode: opts.mode, kind: 'gold' });
            }}
            style={[
              styles.cardChip,
              opts.goldCards > 0 && opts.canUseGoldOrSwitch
                ? styles.goldChipActive
                : opts.goldCards > 0
                  ? styles.goldChipPassive
                  : styles.chipIdle,
              opts.goldCards < 1 && styles.disabledChip,
            ]}
          >
            <Text style={[styles.cardChipText, opts.goldCards > 0 && styles.goldChipText]}>
              👑 {t.goldCardName} ({opts.goldCards})
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
                : opts.switchCards > 0
                  ? styles.switchChipPassive
                  : styles.chipIdle,
              opts.switchCards < 1 && styles.disabledChip,
            ]}
          >
            <Text style={[styles.cardChipText, opts.switchCards > 0 && styles.switchChipText]}>
              ⇄ {t.switchCardName} ({opts.switchCards})
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
                : opts.antiSwitchCards > 0
                  ? styles.antiChipPassive
                  : styles.chipIdle,
              opts.antiSwitchCards < 1 && styles.disabledChip,
            ]}
          >
            <Text style={[styles.cardChipText, opts.antiSwitchCards > 0 && styles.antiChipText]}>
              🛡️ {t.antiSwitchCardName} ({opts.antiSwitchCards})
            </Text>
          </TouchableOpacity>
        </View>
      )}
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

  // Determine Reward Overlay visibility (sequenced AFTER Round Results summary)
  const onlineAwardVisible = Boolean(
    screen === 'online_game' &&
      completedOnlineRound === null &&
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
      completedSingleRound === null &&
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

  useEffect(() => {
    setSingleRewardRevealed(false);
  }, [activeRewardEvent?.nonce, activeRewardEvent?.cardId]);

  useEffect(() => {
    const shouldAnimate =
      Boolean(activeRewardEvent) && (!singleAwardVisible || singleRewardRevealed);
    if (!shouldAnimate) return;

    if (soundEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    rewardScaleAnim.setValue(0.55);
    rewardFlipAnim.setValue(0);
    rewardGlowAnim.setValue(0.6);
    rewardBurstAnim.setValue(0);

    Animated.parallel([
      Animated.spring(rewardScaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 110,
        useNativeDriver: true,
      }),
      Animated.timing(rewardFlipAnim, {
        toValue: 1,
        duration: 540,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      Animated.timing(rewardBurstAnim, {
        toValue: 1,
        duration: 780,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rewardGlowAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rewardGlowAnim, {
          toValue: 0.6,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [
    activeRewardEvent?.nonce,
    activeRewardEvent?.cardId,
    singleAwardVisible,
    singleRewardRevealed,
    soundEnabled,
    rewardScaleAnim,
    rewardFlipAnim,
    rewardGlowAnim,
    rewardBurstAnim,
  ]);

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
                        disabled={submitting}
                        onPress={async () => {
                          setErrorMsg('');
                          setSubmitting(true);
                          try {
                            const res = await joinMultiplayerRoom({
                              rawCode: savedRoom,
                              playerName: displayName || 'Player',
                              avatarColor: displayAvatar,
                            });
                            setActiveRoomCode(res.roomCode);
                          } catch (err) {
                            const raw = err instanceof Error ? err.message : '';
                            if (
                              raw === 'ROOM_NOT_FOUND' ||
                              raw === 'ROOM_CLOSED' ||
                              raw === 'ROOM_STARTED' ||
                              raw === 'ROOM_FULL'
                            ) {
                              await saveActiveRoom(null);
                              setSavedRoom(null);
                            }
                            setErrorMsg(formatMultiplayerError(err, t));
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
                    <View style={styles.rowGap}>
                      <PlayerAvatar
                        name={displayName || 'Player'}
                        paletteId={displayAvatar}
                        size="lg"
                        editable
                        onPress={() => {
                          hapticTap();
                          setAvatarPickerTarget({ kind: 'online_entry' });
                        }}
                      />
                      <View style={{ flex: 1, gap: 4 }}>
                        <TextInput
                          value={displayName}
                          onChangeText={setDisplayName}
                          maxLength={24}
                          placeholder={t.yourNamePlaceholder}
                          placeholderTextColor="#9C8D7E"
                          style={[styles.input, dirText]}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            hapticTap();
                            setAvatarPickerTarget({ kind: 'online_entry' });
                          }}
                        >
                          <Text style={[styles.avatarLinkText, dirText]}>
                            {t.chooseAvatarTitle} · {t.tapAvatarHint}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

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
              {!!errorMsg && (
                <TouchableOpacity onPress={() => setErrorMsg('')} style={styles.errorBanner}>
                  <Text style={[styles.errorText, dirText]}>{errorMsg}</Text>
                </TouchableOpacity>
              )}

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
                      <View style={[styles.rowGap, { flex: 1 }]}>
                        <PlayerAvatar
                          name={p.name}
                          paletteId={p.avatarColor}
                          size="md"
                          active={p.isHost || isSpeaking}
                          editable={pid === myUid}
                          onPress={
                            pid === myUid
                              ? () => {
                                  hapticTap();
                                  setAvatarPickerTarget({ kind: 'online_lobby' });
                                }
                              : undefined
                          }
                        />
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
                      </View>
                      {isHost && pid !== myUid && (
                        <TouchableOpacity
                          onPress={() => {
                            hapticTap();
                            setErrorMsg('');
                            void kickPlayerFromLobby(room.roomCode, pid).catch((err) =>
                              setErrorMsg(formatMultiplayerError(err, t))
                            );
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
                          setErrorMsg('');
                          void updateLobbySettings(room.roomCode, {
                            gameMode: 'rounds',
                            roundsCount: Math.min(
                              getMaxRoundsForPlayers(room.playerOrder.length),
                              room.roundsCount
                            ),
                          }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
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
                          setErrorMsg('');
                          void updateLobbySettings(room.roomCode, {
                            gameMode: 'all_questions',
                          }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
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
                            onPress={() => {
                              setErrorMsg('');
                              void updateLobbySettings(room.roomCode, {
                                roundsCount: Math.max(1, room.roundsCount - 1),
                              }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                            }}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepValue}>
                            {Math.min(getMaxRoundsForPlayers(room.playerOrder.length), room.roundsCount)}{' '}
                            {t.roundUnit}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              setErrorMsg('');
                              void updateLobbySettings(room.roomCode, {
                                roundsCount: Math.min(
                                  getMaxRoundsForPlayers(room.playerOrder.length),
                                  room.roundsCount + 1
                                ),
                              }).catch((err) => setErrorMsg(formatMultiplayerError(err, t)));
                            }}
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
                        onValueChange={(val) => {
                          setErrorMsg('');
                          void updateLobbySettings(room.roomCode, { randomFirstPlayer: val }).catch(
                            (err) => setErrorMsg(formatMultiplayerError(err, t))
                          );
                        }}
                        trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                        thumbColor={room.randomFirstPlayer ? '#231A15' : '#FFFDF9'}
                      />
                    </View>

                    <TouchableOpacity
                      disabled={actionBusy || room.playerOrder.length < 2}
                      onPress={() => {
                        hapticTap();
                        setErrorMsg('');
                        setDoubleSkipNotice(false);
                        setDismissedOnlineAwardNonce(0);
                        setActionBusy(true);
                        void startOrRestartMultiplayerGame(room.roomCode)
                          .catch((err) => setErrorMsg(formatMultiplayerError(err, t)))
                          .finally(() => setActionBusy(false));
                      }}
                      style={[
                        styles.primaryBtn,
                        (actionBusy || room.playerOrder.length < 2) && styles.disabledBtn,
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>{t.startGame}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[styles.mutedText, dirText]}>{t.waitingForHost}</Text>
                    {players[room.hostId] && !players[room.hostId].connected && (
                      <TouchableOpacity
                        onPress={() => {
                          setErrorMsg('');
                          void claimDisconnectedHost(room.roomCode).catch((err) =>
                            setErrorMsg(formatMultiplayerError(err, t))
                          );
                        }}
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
              {!!errorMsg && (
                <TouchableOpacity onPress={() => setErrorMsg('')} style={styles.errorBanner}>
                  <Text style={[styles.errorText, dirText]}>{errorMsg}</Text>
                </TouchableOpacity>
              )}

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
                          <View style={[styles.rowGap, { flex: 1 }]}>
                            <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="sm" active={idx === 0} />
                            <Text style={styles.playerName}>
                              #{idx + 1} {p.name}
                            </Text>
                          </View>
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
                      disabled={actionBusy}
                      onPress={() => {
                        hapticTap();
                        setErrorMsg('');
                        setDoubleSkipNotice(false);
                        setDismissedOnlineAwardNonce(0);
                        setActionBusy(true);
                        void startOrRestartMultiplayerGame(room.roomCode)
                          .catch((err) => setErrorMsg(formatMultiplayerError(err, t)))
                          .finally(() => setActionBusy(false));
                      }}
                      style={[styles.primaryBtn, actionBusy && styles.disabledBtn]}
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
                        })}

                      {!!room.lastCardEvent && room.lastCardEvent.type !== 'awarded' && (
                        <View
                          style={[
                            styles.eventBanner,
                            room.lastCardEvent.type === 'gold'
                              ? styles.goldChipActive
                              : room.lastCardEvent.type === 'switch'
                                ? styles.switchChipActive
                                : styles.antiChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.eventBannerText,
                              room.lastCardEvent.type === 'gold'
                                ? styles.goldChipText
                                : room.lastCardEvent.type === 'switch'
                                  ? styles.switchChipText
                                  : styles.antiChipText,
                              dirText,
                            ]}
                          >
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
                          <View style={[styles.rowGap, { flex: 1 }]}>
                            <PlayerAvatar
                              name={activePlayer?.name ?? '...'}
                              paletteId={activePlayer?.avatarColor}
                              size="md"
                              active
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.label, dirText]}>
                                {isMyTurn ? t.yourTurnTitle : t.activePlayerTurn}
                              </Text>
                              <Text style={[styles.activePlayerName, dirText]} numberOfLines={1}>
                                {activePlayer?.name ?? '...'}
                              </Text>
                            </View>
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
                                setErrorMsg('');
                                setActionBusy(true);
                                void useAntiSwitchCard(room.roomCode)
                                  .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
                                  .finally(() => setActionBusy(false));
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
                                setErrorMsg('');
                                const isThird = (myPlayer?.skipsUsed ?? 0) === 2 && !myPlayer?.doublePenaltyUsed;
                                setActionBusy(true);
                                void skipTurnQuestion(room.roomCode)
                                  .then(() => {
                                    if (isThird) setDoubleSkipNotice(true);
                                  })
                                  .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
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
                              setErrorMsg('');
                              setDoubleSkipNotice(false);
                              setActionBusy(true);
                              void advanceTurnNextQuestion(room.roomCode)
                                .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
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
                            setErrorMsg('');
                            setActionBusy(true);
                            void advanceTurnNextQuestion(room.roomCode)
                              .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
                              .finally(() => setActionBusy(false));
                          }}
                          style={styles.secondaryBtn}
                        >
                          <Text style={styles.secondaryBtnText}>{t.hostForceNext}</Text>
                        </TouchableOpacity>
                      )}

                      {myUid !== room.hostId && hostPlayer && !hostPlayer.connected && (
                        <TouchableOpacity
                          onPress={() => {
                            setErrorMsg('');
                            void claimDisconnectedHost(room.roomCode).catch((e) =>
                              setErrorMsg(formatMultiplayerError(e, t))
                            );
                          }}
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
                              <View style={[styles.rowGap, { flex: 1 }]}>
                                <PlayerAvatar
                                  name={p.name}
                                  paletteId={p.avatarColor}
                                  size="sm"
                                  active={isTurn || isSpeaking}
                                />
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
                      setSinglePlayers((prev) => [
                        ...prev,
                        {
                          id: `sp-${Date.now()}`,
                          name: clean,
                          avatarColor: pickDefaultAvatar(clean + prev.length),
                        },
                      ]);
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
                      <View style={[styles.rowGap, { flex: 1 }]}>
                        <PlayerAvatar
                          name={p.name}
                          paletteId={p.avatarColor}
                          size="sm"
                          editable
                          onPress={() => {
                            hapticTap();
                            setAvatarPickerTarget({ kind: 'single_player', playerId: p.id });
                          }}
                        />
                        {isEditing ? (
                          <TextInput
                            value={editingPlayerName}
                            onChangeText={setEditingPlayerName}
                            maxLength={24}
                            autoFocus
                            style={[styles.input, { flex: 1, marginRight: 8 }, dirText]}
                          />
                        ) : (
                          <Text style={[styles.playerName, { flex: 1 }]} numberOfLines={1}>
                            {idx + 1}. {p.name}
                          </Text>
                        )}
                      </View>

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
                          <View style={[styles.rowGap, { flex: 1 }]}>
                            <PlayerAvatar
                              name={p.name}
                              paletteId={p.avatarColor}
                              size="sm"
                              active={idx === 0}
                            />
                            <Text style={styles.playerName}>
                              #{idx + 1} {p.name}
                            </Text>
                          </View>
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
                          privateToggleMode: true,
                          isRevealed: spCardsRevealed,
                          onToggleReveal: () => setSpCardsRevealed((v) => !v),
                        })}

                      {!!singleGame.lastCardEvent && singleGame.lastCardEvent.type !== 'awarded' && (
                        <View
                          style={[
                            styles.eventBanner,
                            singleGame.lastCardEvent.type === 'gold'
                              ? styles.goldChipActive
                              : singleGame.lastCardEvent.type === 'switch'
                                ? styles.switchChipActive
                                : styles.antiChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.eventBannerText,
                              singleGame.lastCardEvent.type === 'gold'
                                ? styles.goldChipText
                                : singleGame.lastCardEvent.type === 'switch'
                                  ? styles.switchChipText
                                  : styles.antiChipText,
                              dirText,
                            ]}
                          >
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

                      <View style={styles.cardCompact}>
                        <View
                          style={[
                            styles.rowBetweenWrap,
                            { flexDirection: isRTL ? 'row-reverse' : 'row' },
                          ]}
                        >
                          <Text style={[styles.voiceTitle, dirText]}>{t.offlineChatTitle}</Text>
                          <TouchableOpacity
                            onPress={() => {
                              hapticTap();
                              setSpChatSenderId(
                                activePlayer?.id ?? singleGame.players[0]?.id ?? 'sp-1'
                              );
                              setChatMode('single_phone');
                              setChatOpen(true);
                            }}
                            style={styles.chatToggleBtn}
                          >
                            <Text style={styles.chatToggleText}>{t.chatTitle}</Text>
                            {spChatState.messages.length > 0 && (
                              <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>
                                  {spChatState.messages.length > 99
                                    ? '99+'
                                    : spChatState.messages.length}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.card}>
                        <View style={[styles.rowBetweenWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <View style={[styles.rowGap, { flex: 1 }]}>
                            <PlayerAvatar
                              name={activePlayer?.name ?? ''}
                              paletteId={activePlayer?.avatarColor}
                              size="md"
                              active
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.label, dirText]}>{t.passPhonePrompt}</Text>
                              <Text style={[styles.activePlayerName, dirText]} numberOfLines={1}>
                                {activePlayer?.name}
                              </Text>
                            </View>
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
                              <View style={[styles.rowGap, { flex: 1 }]}>
                                <PlayerAvatar
                                  name={p.name}
                                  paletteId={p.avatarColor}
                                  size="sm"
                                  active={isTurn}
                                />
                                <Text style={styles.playerName}>
                                  {isTurn ? '▶ ' : ''}
                                  {p.name}
                                </Text>
                              </View>
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
                <View style={styles.playerRow}>
                  <View style={{ flex: 1, paddingEnd: 8 }}>
                    <Text style={[styles.cardTitle, dirText]}>{t.chatNotificationsLabel}</Text>
                    <Text style={[styles.mutedSmall, dirText]}>{t.chatNotificationsSub}</Text>
                  </View>
                  <Switch
                    value={chatNotificationsEnabled}
                    onValueChange={(nextVal) => {
                      hapticTap();
                      setChatNotificationsEnabled(nextVal);
                      void saveChatNotificationsEnabled(nextVal);
                      if (nextVal && notifPermission !== 'granted') {
                        void requestMobileChatNotificationPermission().then(setNotifPermission);
                      }
                    }}
                    trackColor={{ false: '#D5C7B2', true: '#8B5E3C' }}
                    thumbColor={chatNotificationsEnabled ? '#231A15' : '#FFFDF9'}
                  />
                </View>
                <Text style={[styles.mutedText, dirText]}>
                  {notifPermission === 'granted'
                    ? t.chatNotificationsGranted
                    : notifPermission === 'denied'
                      ? t.chatNotificationsDenied
                      : t.chatNotificationsDefault}
                </Text>
                {notifPermission !== 'granted' && (
                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      void requestMobileChatNotificationPermission().then(setNotifPermission);
                    }}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>{t.enableNotificationsBtn}</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.mutedSmall, dirText]}>{t.chatPushScopeNote}</Text>
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
                          <View style={styles.rowGap}>
                            <PlayerAvatar
                              name={target.name}
                              paletteId={
                                cardModal.mode === 'online'
                                  ? players[target.uid]?.avatarColor
                                  : singleGame?.players.find((pl) => pl.id === target.uid)?.avatarColor
                              }
                              size="sm"
                            />
                            <Text style={styles.playerName}>{target.name}</Text>
                          </View>
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
                      setErrorMsg('');
                      setActionBusy(true);
                      if (modal.kind === 'gold') {
                        void useGoldCard(room.roomCode)
                          .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
                          .finally(() => setActionBusy(false));
                      } else if (modal.kind === 'switch' && chosenTarget) {
                        void useSwitchCard(room.roomCode, chosenTarget)
                          .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
                          .finally(() => setActionBusy(false));
                      } else if (modal.kind === 'anti_switch') {
                        void useAntiSwitchCard(room.roomCode)
                          .catch((e) => setErrorMsg(formatMultiplayerError(e, t)))
                          .finally(() => setActionBusy(false));
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

        {/* Round-End Results Summary Modal */}
        {(() => {
          const isOnlineSummary =
            screen === 'online_game' && completedOnlineRound !== null && room?.status === 'playing';
          const isSingleSummary =
            screen === 'single_game' &&
            completedSingleRound !== null &&
            singleGame?.phase === 'playing';
          const summaryRound = isOnlineSummary
            ? completedOnlineRound
            : isSingleSummary
              ? completedSingleRound
              : null;
          const summaryPlayers: Array<{
            uid: string;
            name: string;
            avatarColor?: string;
            score: number;
            skipsRemaining?: number;
          }> = isOnlineSummary && room
            ? room.playerOrder
                .map((pid) => players[pid])
                .filter((p): p is RoomPlayerDoc => Boolean(p))
                .map((p) => ({
                  uid: p.uid,
                  name: p.name,
                  avatarColor: p.avatarColor,
                  score: p.score ?? 0,
                  skipsRemaining: p.skipsRemaining,
                }))
            : isSingleSummary && singleGame
              ? singleGame.players.map((p) => ({
                  uid: p.id,
                  name: p.name,
                  avatarColor: p.avatarColor,
                  score: p.score ?? 0,
                }))
              : [];
          const sortedSummary = [...summaryPlayers].sort((a, b) => b.score - a.score);
          const totalRounds = isOnlineSummary && room ? room.roundsCount : singleGame?.roundsCount ?? 1;
          const gMode = isOnlineSummary && room ? room.gameMode : singleGame?.gameMode ?? 'rounds';

          return (
            <Modal
              visible={Boolean(summaryRound)}
              transparent
              animationType="fade"
              onRequestClose={() => {
                if (isOnlineSummary) setCompletedOnlineRound(null);
                if (isSingleSummary) setCompletedSingleRound(null);
              }}
            >
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <View style={styles.rowGap}>
                    <View style={styles.roundTrophyBox}>
                      <Text style={{ fontSize: 24 }}>🏆</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, dirText]}>
                        {t.roundSummaryTitle} {summaryRound}
                      </Text>
                      <Text style={[styles.mutedSmall, dirText]}>
                        {gMode === 'all_questions'
                          ? t.roundSummaryAllQuestionsSub
                          : `${t.roundSummaryNextLabel}: ${t.roundLabel} ${(summaryRound ?? 0) + 1} ${t.ofLabel} ${totalRounds}`}
                      </Text>
                    </View>
                  </View>

                  <ScrollView style={{ maxHeight: 290 }}>
                    {sortedSummary.map((p, idx) => (
                      <View key={p.uid} style={styles.playerRow}>
                        <View style={[styles.rowGap, { flex: 1 }]}>
                          <Text
                            style={[
                              styles.rankNum,
                              idx === 0 && { color: '#B45309' },
                            ]}
                          >
                            #{idx + 1}
                          </Text>
                          <PlayerAvatar
                            name={p.name}
                            paletteId={p.avatarColor}
                            size="sm"
                            active={idx === 0}
                          />
                          <Text style={styles.playerName} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </View>
                        <View style={styles.rowGap}>
                          <Text
                            style={[
                              styles.scoreValue,
                              p.score < 0 ? styles.scoreNegative : styles.scorePositive,
                            ]}
                          >
                            {p.score} {t.pointsUnit}
                          </Text>
                          {isOnlineSummary && typeof p.skipsRemaining === 'number' && (
                            <Text style={styles.mutedSmall}>{p.skipsRemaining}/3</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    onPress={() => {
                      hapticTap();
                      if (isOnlineSummary) setCompletedOnlineRound(null);
                      if (isSingleSummary) setCompletedSingleRound(null);
                    }}
                    style={styles.primaryBtn}
                  >
                    <Text style={styles.primaryBtnText}>{t.continueNextRoundBtn}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          );
        })()}

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
          <View style={styles.rewardBackdrop}>
            {singleAwardVisible && !singleRewardRevealed ? (
              <View style={[styles.modalCard, styles.privacyVaultCard]}>
                <View style={styles.privacyVaultIconBox}>
                  <Text style={{ fontSize: 30 }}>🔒</Text>
                </View>
                <Text style={[styles.privacyVaultBadge, { textAlign: 'center' }]}>
                  {t.secretCardPrivateBadge}
                </Text>
                <Text style={[styles.privacyVaultTitle, { textAlign: 'center' }]}>
                  {t.secretCardTapToRevealTitle} {activeRewardEvent?.actorName}
                </Text>
                <Text style={[styles.privacyVaultDesc, { textAlign: 'center' }, dirText]}>
                  {t.secretCardPrivacyHint}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    hapticTap();
                    setSingleRewardRevealed(true);
                  }}
                  style={styles.privacyVaultBtn}
                >
                  <Text style={styles.privacyVaultBtnText}>👁 {t.secretCardRevealBtn}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              (() => {
                const cType = activeRewardCardType ?? 'gold';
                const theme =
                  cType === 'gold'
                    ? {
                        grad: ['#FFFBEB', '#FEF3C7', '#FDE68A'] as const,
                        border: '#D97706',
                        glow: 'rgba(245, 158, 11, 0.52)',
                        icon: '👑',
                        titleColor: '#78350F',
                        accentColor: '#B45309',
                        btnBg: '#B45309',
                      }
                    : cType === 'switch'
                      ? {
                          grad: ['#EFF6FF', '#DBEAFE', '#BFDBFE'] as const,
                          border: '#2563EB',
                          glow: 'rgba(37, 99, 235, 0.52)',
                          icon: '⇄',
                          titleColor: '#1E3A8A',
                          accentColor: '#1D4ED8',
                          btnBg: '#1D4ED8',
                        }
                      : {
                          grad: ['#FEF2F2', '#FEE2E2', '#FECACA'] as const,
                          border: '#DC2626',
                          glow: 'rgba(220, 38, 38, 0.52)',
                          icon: '🛡️',
                          titleColor: '#7F1D1D',
                          accentColor: '#B91C1C',
                          btnBg: '#B91C1C',
                        };

                const spinY = rewardFlipAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['160deg', '0deg'],
                });

                const sparkOffsets = [
                  { x: -120, y: -110 },
                  { x: 120, y: -110 },
                  { x: -145, y: 0 },
                  { x: 145, y: 0 },
                  { x: -115, y: 115 },
                  { x: 115, y: 115 },
                  { x: 0, y: -145 },
                  { x: 0, y: 145 },
                ];

                return (
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.rewardAuraCircle,
                        {
                          backgroundColor: theme.glow,
                          opacity: rewardGlowAnim,
                          transform: [{ scale: rewardGlowAnim }],
                        },
                      ]}
                    />

                    {sparkOffsets.map((sp, i) => (
                      <Animated.View
                        key={`sp-${i}`}
                        pointerEvents="none"
                        style={[
                          styles.rewardSparkParticle,
                          {
                            backgroundColor: i % 2 === 0 ? theme.accentColor : '#FDE047',
                            opacity: rewardBurstAnim.interpolate({
                              inputRange: [0, 0.7, 1],
                              outputRange: [1, 1, 0],
                            }),
                            transform: [
                              {
                                translateX: rewardBurstAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, sp.x],
                                }),
                              },
                              {
                                translateY: rewardBurstAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, sp.y],
                                }),
                              },
                              {
                                scale: rewardBurstAnim.interpolate({
                                  inputRange: [0, 0.4, 1],
                                  outputRange: [0.3, 1.3, 0.2],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    ))}

                    <Animated.View
                      style={{
                        width: '100%',
                        transform: [
                          { perspective: 1000 },
                          { scale: rewardScaleAnim },
                          { rotateY: spinY },
                        ],
                      }}
                    >
                      <LinearGradient
                        colors={theme.grad}
                        style={[styles.modalCard, { borderColor: theme.border, borderWidth: 2.5, alignItems: 'center' }]}
                      >
                        <View style={styles.secretBadgeBox}>
                          <Text style={styles.secretBadgeText}>🔒 {t.secretCardPrivateBadge}</Text>
                        </View>

                        <View style={[styles.rewardIconTile, { backgroundColor: theme.btnBg }]}>
                          <Text style={{ fontSize: 34, color: '#FFFDF9' }}>{theme.icon}</Text>
                        </View>

                        <Text style={[styles.label, { color: theme.accentColor, textAlign: 'center' }]}>
                          {activeRewardEvent?.actorName} · {t.specialCardRewardTitle}
                        </Text>
                        <Text style={[styles.pageTitle, { color: theme.titleColor, textAlign: 'center' }]}>
                          {cType === 'gold'
                            ? t.goldCardName
                            : cType === 'switch'
                              ? t.switchCardName
                              : t.antiSwitchCardName}
                        </Text>
                        <Text style={[styles.mutedText, { textAlign: 'center', color: '#3A2C24' }, dirText]}>
                          {cType === 'gold'
                            ? t.goldCardDesc
                            : cType === 'switch'
                              ? t.switchCardDesc
                              : t.antiSwitchCardDesc}
                        </Text>
                        <Text style={[styles.mutedSmall, { textAlign: 'center', color: '#5E4F43' }, dirText]}>
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
                          style={[styles.primaryBtn, { width: '100%', backgroundColor: theme.btnBg }]}
                        >
                          <Text style={styles.primaryBtnText}>{t.collectAndContinue}</Text>
                        </TouchableOpacity>
                      </LinearGradient>
                    </Animated.View>
                  </View>
                );
              })()
            )}
          </View>
        </Modal>

        {/* Room & Single Phone Chat, Voice Notes, Replies & Reactions Modal */}
        <MobileChatModal
          visible={chatOpen}
          onClose={() => setChatOpen(false)}
          mode={chatMode}
          language={language}
          t={t}
          roomCode={room?.roomCode}
          myUid={myUid}
          myName={players[myUid]?.name || displayName || 'Player'}
          memberIds={room?.playerOrder ?? []}
          singlePlayers={singleGame?.players ?? singlePlayers}
          spSenderId={spChatSenderId}
          onChangeSpSender={setSpChatSenderId}
          onlineMessages={chatMessages}
          onlinePlayers={players}
          onlineReactions={onlineReactions}
          chatPresence={chatPresence}
          spState={spChatState}
          onUpdateSpState={(updater) => setSpChatState((prev) => updater(prev))}
          onHapticTap={hapticTap}
          voiceJoined={voice.voiceJoined}
        />

        {(() => {
          let pickerName = displayName || 'Player';
          let pickerInitial = displayAvatar;
          if (avatarPickerTarget?.kind === 'online_lobby') {
            pickerName = players[myUid]?.name ?? displayName ?? 'Player';
            pickerInitial = players[myUid]?.avatarColor ?? displayAvatar;
          } else if (avatarPickerTarget?.kind === 'single_player') {
            const targetSp = singlePlayers.find((pl) => pl.id === avatarPickerTarget.playerId);
            pickerName = targetSp?.name ?? 'Player';
            pickerInitial = targetSp?.avatarColor ?? pickDefaultAvatar(1);
          }

          return (
            <AvatarPickerModal
              visible={Boolean(avatarPickerTarget)}
              playerName={pickerName}
              initialAvatar={pickerInitial}
              t={t}
              isRTL={isRTL}
              onClose={() => setAvatarPickerTarget(null)}
              onHapticTap={hapticTap}
              onSave={async (nextAvatar) => {
                if (!avatarPickerTarget) return;
                if (avatarPickerTarget.kind === 'online_entry') {
                  setDisplayAvatar(nextAvatar);
                  await savePlayerAvatar(nextAvatar);
                } else if (avatarPickerTarget.kind === 'online_lobby' && room) {
                  setDisplayAvatar(nextAvatar);
                  try {
                    await updateMyLobbyAvatar(room.roomCode, nextAvatar);
                  } catch (err) {
                    setErrorMsg(formatMultiplayerError(err, t));
                  }
                } else if (avatarPickerTarget.kind === 'single_player') {
                  const targetId = avatarPickerTarget.playerId;
                  setSinglePlayers((prev) =>
                    prev.map((pl) => (pl.id === targetId ? { ...pl, avatarColor: nextAvatar } : pl))
                  );
                }
              }}
            />
          );
        })()}
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
  avatarLinkText: { color: '#8B5E3C', fontSize: 12, fontWeight: '700' },
  mutedText: { color: '#5E4F43', fontSize: 14, lineHeight: 21 },
  mutedSmall: { color: '#7A6A5B', fontSize: 12 },
  warnText: { color: '#8C6820', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#9B3B30', fontSize: 13, fontWeight: '700' },
  errorBanner: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#F9EAE6',
    borderWidth: 1,
    borderColor: '#C88172',
  },
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
  privacyRevealBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#231A15',
  },
  privacyRevealText: { color: '#FBF7F0', fontSize: 12, fontWeight: '800' },
  privacyToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  privacyToggleText: { color: '#231A15', fontSize: 11, fontWeight: '800' },
  cardChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  chipIdle: {
    backgroundColor: '#F6EFE3',
    borderColor: '#E5DAC8',
  },
  goldChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  goldChipPassive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  goldChipText: { color: '#78350F' },
  switchChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  switchChipPassive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  switchChipText: { color: '#1E3A8A' },
  antiChipActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  antiChipPassive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  antiChipText: { color: '#7F1D1D' },
  disabledChip: { opacity: 0.5 },
  cardChipText: { color: '#231A15', fontSize: 12, fontWeight: '800' },
  eventBanner: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#F3EBDD',
    borderWidth: 1.5,
    borderColor: '#D5C7B2',
  },
  eventBannerText: { color: '#231A15', fontSize: 13, fontWeight: '800' },
  warnBanner: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  warnBannerText: { color: '#78350F', fontSize: 13, fontWeight: '700' },
  switchNotice: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#DBEAFE',
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  switchNoticeText: { color: '#1E3A8A', fontSize: 13, fontWeight: '800' },
  forcedNotice: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  forcedNoticeText: { color: '#7F1D1D', fontSize: 13, fontWeight: '800' },
  antiDefendBtn: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  antiDefendBtnText: { color: '#7F1D1D', fontSize: 13, fontWeight: '800' },
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
  voiceReconnectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FBF5E4',
    borderWidth: 1,
    borderColor: '#D7BD7B',
  },
  voiceReconnectBtnText: { color: '#7D5D18', fontSize: 12, fontWeight: '800' },
  voiceStatusText: { fontSize: 11, fontWeight: '700' },
  voiceStatusConnectedText: { color: '#355432' },
  voiceStatusPendingText: { color: '#7D5D18' },
  voiceStatusFailedText: { color: '#9B3B30' },
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
  chatActivityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#EEF3EC',
    borderWidth: 1,
    borderColor: '#B9CEB3',
  },
  chatActivityRecBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  chatActivityText: { color: '#355432', fontSize: 10, fontWeight: '800' },
  chatActivityRecText: { color: '#B91C1C' },
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
  rewardBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(25,18,14,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
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
  roundTrophyBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    width: 28,
    fontSize: 13,
    fontWeight: '800',
    color: '#8B5E3C',
  },
  privacyVaultCard: {
    backgroundColor: '#231A15',
    borderColor: '#D7BD7B',
    alignItems: 'center',
    width: '100%',
  },
  privacyVaultIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#3A2C24',
    borderWidth: 1.5,
    borderColor: '#D7BD7B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyVaultBadge: { color: '#D7BD7B', fontSize: 12, fontWeight: '800' },
  privacyVaultTitle: { color: '#FFFDF9', fontSize: 22, fontWeight: '800' },
  privacyVaultDesc: { color: '#DDD2C0', fontSize: 14, lineHeight: 20 },
  privacyVaultBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  privacyVaultBtnText: { color: '#231A15', fontSize: 15, fontWeight: '800' },
  rewardAuraCircle: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  rewardSparkParticle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  secretBadgeBox: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  secretBadgeText: { color: '#231A15', fontSize: 11, fontWeight: '800' },
  rewardIconTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
