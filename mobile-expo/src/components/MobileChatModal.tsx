import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  EMOJI_CATEGORIES,
  isEmojiOnlyMessage,
  loadRecentEmojis,
  mergeRecentEmoji,
  saveRecentEmojis,
  type EmojiCategoryId,
} from '../data/emojis';
import type { Language } from '../i18n/translations';
import {
  REACTION_EMOJIS,
  sendRoomChatMessage,
  setRoomChatPresence,
  toggleMessageReaction,
  uploadAndSendVoiceMessage,
  type ChatPresenceStatus,
  type ChatReplyReference,
  type MessageReactionDoc,
  type ReactionEmoji,
  type RoomChatMessage,
  type RoomChatPresenceDoc,
  type RoomPlayerDoc,
} from '../services/multiplayerService';
import { formatMultiplayerError, type TranslationDict } from '../utils/errorMessages';
import { PlayerAvatar } from './PlayerAvatar';
import {
  appendSinglePhoneTextMessage,
  appendSinglePhoneVoiceMessage,
  persistSinglePhoneChatState,
  toggleSinglePhoneReaction,
  type SinglePhoneChatStoreState,
} from '../utils/singlePhoneChatStore';
import type { SinglePhonePlayer } from '../utils/specialCards';

type ChatTab = 'messages' | 'emojis';

const MAX_VOICE_SECONDS = 90;

const VOICE_RECORDING_PRESET: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 24000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 24000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    bitsPerSecond: 20000,
  },
};

interface DisplayMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: 'text' | 'voice';
  audioUrl?: string;
  audioDurationSec?: number;
  audioMimeType?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreviewText?: string;
  replyToType?: 'text' | 'voice';
  createdAtMs: number | null;
}

interface AggregatedReaction {
  counts: Partial<Record<ReactionEmoji, number>>;
  myEmoji: ReactionEmoji | null;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface MobileVoiceBubbleProps {
  messageId: string;
  audioUrl: string;
  durationSec: number;
  isMe: boolean;
  isPlaying: boolean;
  progressRatio: number;
  positionSec: number;
  onTogglePlay: (messageId: string, audioUrl: string) => void;
}

const MobileVoiceBubble: React.FC<MobileVoiceBubbleProps> = ({
  messageId,
  audioUrl,
  durationSec,
  isMe,
  isPlaying,
  progressRatio,
  positionSec,
  onTogglePlay,
}) => {
  const pct = Math.min(100, Math.max(0, Math.round(progressRatio * 100)));
  const shownSec = isPlaying || positionSec > 0 ? positionSec : durationSec;

  return (
    <View style={styles.voiceBubbleRow}>
      <TouchableOpacity
        onPress={() => onTogglePlay(messageId, audioUrl)}
        style={[styles.voicePlayBtn, isMe ? styles.voicePlayBtnMe : styles.voicePlayBtnOther]}
      >
        <Text style={isMe ? styles.voicePlayGlyphMe : styles.voicePlayGlyphOther}>
          {isPlaying ? '❚❚' : '▶'}
        </Text>
      </TouchableOpacity>
      <View style={styles.voiceTrackWrap}>
        <View style={[styles.voiceTrackBg, isMe ? styles.voiceTrackBgMe : styles.voiceTrackBgOther]}>
          <View
            style={[
              styles.voiceTrackFill,
              isMe ? styles.voiceTrackFillMe : styles.voiceTrackFillOther,
              { width: `${pct}%` },
            ]}
          />
        </View>
        <Text style={isMe ? styles.voiceDurMe : styles.voiceDurOther}>
          🎤 {formatMmSs(shownSec)} / {formatMmSs(durationSec)}
        </Text>
      </View>
    </View>
  );
};

interface SwipeReplyRowProps {
  onTriggerReply: () => void;
  children: React.ReactNode;
}

const SwipeReplyRow: React.FC<SwipeReplyRowProps> = ({ onTriggerReply, children }) => {
  const triggeredRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          gs.dx > 16 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
        onPanResponderGrant: () => {
          triggeredRef.current = false;
        },
        onPanResponderMove: (_, gs) => {
          if (!triggeredRef.current && gs.dx > 44) {
            triggeredRef.current = true;
            onTriggerReply();
          }
        },
        onPanResponderRelease: () => {
          triggeredRef.current = false;
        },
        onPanResponderTerminate: () => {
          triggeredRef.current = false;
        },
      }),
    [onTriggerReply]
  );

  return <View {...panResponder.panHandlers}>{children}</View>;
};

interface MobileChatModalProps {
  visible: boolean;
  onClose: () => void;
  mode: 'online' | 'single_phone';
  language: Language;
  t: TranslationDict;
  roomCode?: string;
  myUid: string;
  myName: string;
  memberIds: string[];
  singlePlayers?: SinglePhonePlayer[];
  spSenderId?: string;
  onChangeSpSender?: (id: string) => void;
  onlineMessages: RoomChatMessage[];
  onlinePlayers?: Record<string, RoomPlayerDoc>;
  onlineReactions?: MessageReactionDoc[];
  chatPresence?: RoomChatPresenceDoc[];
  spState: SinglePhoneChatStoreState;
  onUpdateSpState: (updater: (prev: SinglePhoneChatStoreState) => SinglePhoneChatStoreState) => void;
  onHapticTap: () => void;
  voiceJoined?: boolean;
}

export const MobileChatModal: React.FC<MobileChatModalProps> = ({
  visible,
  onClose,
  mode,
  language,
  t,
  roomCode,
  myUid,
  myName,
  memberIds,
  singlePlayers = [],
  spSenderId,
  onChangeSpSender,
  onlineMessages,
  onlinePlayers = {},
  onlineReactions = [],
  chatPresence = [],
  spState,
  onUpdateSpState,
  onHapticTap,
  voiceJoined = false,
}) => {
  const isSinglePhone = mode === 'single_phone';
  const isRTL = language === 'ar';
  const dirText = { writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const) };

  const [activeTab, setActiveTab] = useState<ChatTab>('messages');
  const [selectedEmojiCat, setSelectedEmojiCat] = useState<EmojiCategoryId>('smileys');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);

  // Reply + Reaction state
  const [replyingTo, setReplyingTo] = useState<ChatReplyReference | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Voice recording & playback state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voicePlaybackPosSec, setVoicePlaybackPosSec] = useState(0);
  const [voicePlaybackRatio, setVoicePlaybackRatio] = useState(0);

  const scrollRef = useRef<ScrollView | null>(null);
  const msgYRef = useRef<Record<string, number>>({});
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSendingRef = useRef<boolean>(false);
  const sendVoiceFnRef = useRef<() => Promise<void>>(async () => {});
  const activeSoundRef = useRef<Audio.Sound | null>(null);
  const activeSoundMsgIdRef = useRef<string | null>(null);
  const [presenceNowMs, setPresenceNowMs] = useState<number>(() => Date.now());
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishedPresenceRef = useRef<{ status: ChatPresenceStatus; atMs: number }>({
    status: 'idle',
    atMs: 0,
  });

  useEffect(() => {
    loadRecentEmojis().then(setRecentEmojis);
  }, []);

  const stopActiveSound = useCallback(async () => {
    const sound = activeSoundRef.current;
    activeSoundRef.current = null;
    activeSoundMsgIdRef.current = null;
    setPlayingVoiceId(null);
    setVoicePlaybackPosSec(0);
    setVoicePlaybackRatio(0);
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {
        // ignore
      }
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
  }, []);

  const cleanupRecording = useCallback(async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingSec(0);
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        // ignore
      }
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      void stopActiveSound();
      void cleanupRecording();
      setActiveReactionMsgId(null);
    }
  }, [visible, stopActiveSound, cleanupRecording]);

  useEffect(() => {
    return () => {
      void stopActiveSound();
      void cleanupRecording();
    };
  }, [stopActiveSound, cleanupRecording]);

  const currentActor = useMemo(() => {
    if (isSinglePhone) {
      const found = singlePlayers.find((p) => p.id === spSenderId) ?? singlePlayers[0];
      return {
        uid: found?.id ?? 'sp-1',
        name: found?.name ?? 'Player',
      };
    }
    return {
      uid: myUid,
      name: myName || 'Player',
    };
  }, [isSinglePhone, singlePlayers, spSenderId, myUid, myName]);

  const publishPresence = useCallback(
    (nextStatus: ChatPresenceStatus, force = false) => {
      if (isSinglePhone || !roomCode || !myUid) return;
      if (!memberIds.includes(myUid)) return;
      const now = Date.now();
      const prev = lastPublishedPresenceRef.current;
      if (!force && prev.status === nextStatus) {
        if (nextStatus === 'idle') return;
        if (now - prev.atMs < 2400) return;
      }
      lastPublishedPresenceRef.current = { status: nextStatus, atMs: now };
      void setRoomChatPresence({
        roomCode,
        senderName: myName || 'Player',
        status: nextStatus,
        memberIds,
      }).catch(() => {});
    },
    [isSinglePhone, roomCode, myUid, myName, memberIds]
  );

  useEffect(() => {
    if (isSinglePhone) return;
    const hasRemote = chatPresence.some((p) => p.uid !== myUid && p.status !== 'idle');
    if (!hasRemote) return;
    setPresenceNowMs(Date.now());
    const id = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [isSinglePhone, chatPresence, myUid]);

  useEffect(() => {
    if (isSinglePhone || !roomCode || !myUid) return;
    if (isRecording) {
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      publishPresence('recording', true);
      const id = setInterval(() => {
        publishPresence('recording', true);
      }, 3200);
      return () => clearInterval(id);
    }
    if (lastPublishedPresenceRef.current.status === 'recording') {
      publishPresence('idle', true);
    }
  }, [isSinglePhone, roomCode, myUid, isRecording, publishPresence]);

  useEffect(() => {
    if (isSinglePhone || !roomCode || !myUid) return;
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }

    if (!visible) {
      if (lastPublishedPresenceRef.current.status !== 'idle') {
        publishPresence('idle', true);
      }
      return;
    }

    if (isRecording) return;

    if (draft.trim().length > 0) {
      publishPresence('typing');
      typingIdleTimerRef.current = setTimeout(() => {
        publishPresence('idle', true);
      }, 3000);
    } else if (lastPublishedPresenceRef.current.status === 'typing') {
      publishPresence('idle', true);
    }

    return () => {
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
    };
  }, [isSinglePhone, roomCode, myUid, visible, isRecording, draft, publishPresence]);

  useEffect(() => {
    return () => {
      if (lastPublishedPresenceRef.current.status !== 'idle') {
        publishPresence('idle', true);
      }
    };
  }, [publishPresence]);

  const remotePresenceInfo = useMemo(() => {
    if (isSinglePhone) {
      return { kind: null as null | 'typing' | 'recording', label: '' };
    }
    const active = chatPresence.filter(
      (p) => p.uid !== myUid && p.status !== 'idle' && p.expiresAtMs > presenceNowMs
    );
    if (active.length === 0) {
      return { kind: null as null | 'typing' | 'recording', label: '' };
    }
    const recorders = active.filter((p) => p.status === 'recording');
    const typers = active.filter((p) => p.status === 'typing');
    const isRec = recorders.length > 0;
    const list = isRec ? recorders : typers;
    const names = list.map((p) => p.name).filter(Boolean);
    const label =
      names.length === 1
        ? `${names[0]} ${isRec ? t.chatRecordingSingle : t.chatTypingSingle}`
        : `${names.slice(0, 2).join(language === 'ar' ? ' و' : ' & ')} ${isRec ? t.chatRecordingMany : t.chatTypingMany}`;
    return { kind: isRec ? ('recording' as const) : ('typing' as const), label };
  }, [
    isSinglePhone,
    chatPresence,
    myUid,
    presenceNowMs,
    language,
    t.chatRecordingSingle,
    t.chatTypingSingle,
    t.chatRecordingMany,
    t.chatTypingMany,
  ]);

  const displayMessages: DisplayMessageItem[] = useMemo(() => {
    if (isSinglePhone) {
      return spState.messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        messageType: m.messageType === 'voice' ? 'voice' : 'text',
        audioUrl: m.audioUrl,
        audioDurationSec: m.audioDurationSec,
        audioMimeType: m.audioMimeType,
        replyToMessageId: m.replyToMessageId,
        replyToSenderName: m.replyToSenderName,
        replyToPreviewText: m.replyToPreviewText,
        replyToType: m.replyToType === 'voice' ? 'voice' : 'text',
        createdAtMs: m.createdAtMs,
      }));
    }
    return onlineMessages
      .filter((m) => !m.messageType || m.messageType === 'text' || m.messageType === 'voice')
      .map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        messageType: m.messageType === 'voice' ? 'voice' : 'text',
        audioUrl: m.audioUrl,
        audioDurationSec: m.audioDurationSec,
        audioMimeType: m.audioMimeType,
        replyToMessageId: m.replyToMessageId,
        replyToSenderName: m.replyToSenderName,
        replyToPreviewText: m.replyToPreviewText,
        replyToType: m.replyToType === 'voice' ? 'voice' : 'text',
        createdAtMs: m.createdAt?.toMillis?.() ?? null,
      }));
  }, [isSinglePhone, spState.messages, onlineMessages]);

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, AggregatedReaction> = {};
    if (isSinglePhone) {
      for (const [msgId, userMap] of Object.entries(spState.reactions ?? {})) {
        const agg: AggregatedReaction = { counts: {}, myEmoji: null };
        for (const [uid, entry] of Object.entries(userMap)) {
          agg.counts[entry.emoji] = (agg.counts[entry.emoji] ?? 0) + 1;
          if (uid === currentActor.uid) agg.myEmoji = entry.emoji;
        }
        map[msgId] = agg;
      }
      return map;
    }

    for (const r of onlineReactions) {
      if (!map[r.messageId]) {
        map[r.messageId] = { counts: {}, myEmoji: null };
      }
      map[r.messageId].counts[r.emoji] = (map[r.messageId].counts[r.emoji] ?? 0) + 1;
      if (r.userId === currentActor.uid) {
        map[r.messageId].myEmoji = r.emoji;
      }
    }
    return map;
  }, [isSinglePhone, spState.reactions, onlineReactions, currentActor.uid]);

  useEffect(() => {
    if (visible && activeTab === 'messages') {
      const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      return () => clearTimeout(id);
    }
  }, [visible, activeTab, displayMessages.length, remotePresenceInfo.label]);

  const showTimedFeedback = useCallback((type: 'error' | 'info' | 'success', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const buildReplyRef = (m: DisplayMessageItem): ChatReplyReference => {
    let previewText = m.text;
    if (m.messageType === 'voice') {
      previewText = `🎤 ${t.replyVoicePreview} (${formatMmSs(m.audioDurationSec ?? 1)})`;
    }
    return {
      replyToMessageId: m.id,
      replyToSenderName: Array.from(m.senderName.trim()).slice(0, 24).join('') || 'Player',
      replyToPreviewText: Array.from(previewText.trim()).slice(0, 140).join('') || '...',
      replyToType: m.messageType,
    };
  };

  const handleStartReply = (m: DisplayMessageItem) => {
    onHapticTap();
    setActiveReactionMsgId(null);
    setReplyingTo(buildReplyRef(m));
    setActiveTab('messages');
  };

  const handleScrollToMessage = (messageId: string) => {
    onHapticTap();
    const exists = displayMessages.some((m) => m.id === messageId);
    const y = msgYRef.current[messageId];
    if (!exists || y === undefined) {
      showTimedFeedback('info', t.originalMsgNotFound);
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    setHighlightedMsgId(messageId);
    setTimeout(() => {
      setHighlightedMsgId((curr) => (curr === messageId ? null : curr));
    }, 1550);
  };

  const handleToggleReaction = async (messageId: string, emoji: ReactionEmoji) => {
    onHapticTap();
    setActiveReactionMsgId(null);
    const currentMyEmoji = reactionsByMessage[messageId]?.myEmoji ?? null;

    if (isSinglePhone) {
      onUpdateSpState((prev) => {
        const next = toggleSinglePhoneReaction(prev, {
          messageId,
          userId: currentActor.uid,
          userName: currentActor.name,
          emoji,
        });
        void persistSinglePhoneChatState(next);
        return next;
      });
      return;
    }

    if (!roomCode) return;
    try {
      await toggleMessageReaction({
        roomCode,
        messageId,
        userName: currentActor.name,
        emoji,
        memberIds,
        currentMyEmoji,
      });
    } catch (err) {
      showTimedFeedback('error', formatMultiplayerError(err, t));
    }
  };

  const handleToggleVoicePlay = async (messageId: string, audioUrl: string) => {
    onHapticTap();
    if (playingVoiceId === messageId && activeSoundRef.current) {
      await stopActiveSound();
      return;
    }
    await stopActiveSound();

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      activeSoundMsgIdRef.current = messageId;
      setPlayingVoiceId(messageId);
      setVoicePlaybackPosSec(0);
      setVoicePlaybackRatio(0);

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (!status.isLoaded || activeSoundMsgIdRef.current !== messageId) return;
          const durMs = status.durationMillis ?? 0;
          const posMs = status.positionMillis ?? 0;
          setVoicePlaybackPosSec(Math.floor(posMs / 1000));
          setVoicePlaybackRatio(durMs > 0 ? Math.min(1, posMs / durMs) : 0);
          if (status.didJustFinish) {
            void stopActiveSound();
          }
        }
      );

      if (activeSoundMsgIdRef.current !== messageId) {
        await sound.unloadAsync();
        return;
      }
      activeSoundRef.current = sound;
    } catch {
      await stopActiveSound();
      showTimedFeedback('error', t.errGeneric);
    }
  };

  const handleStartVoiceRecord = async () => {
    if (isRecording || sendingVoice || voiceSendingRef.current) return;
    onHapticTap();
    setFeedback(null);
    if (voiceJoined && Platform.OS !== 'web') {
      showTimedFeedback('info', t.voiceBusyWithCallHint);
      return;
    }
    await stopActiveSound();

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        showTimedFeedback('error', t.voiceMicDenied);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      const { recording } = await Audio.Recording.createAsync(VOICE_RECORDING_PRESET);

      recordingRef.current = recording;
      recordStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSec(0);

      recordTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartedAtRef.current) / 1000);
        setRecordingSec(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) {
          void sendVoiceFnRef.current();
        }
      }, 250);
    } catch {
      await cleanupRecording();
      showTimedFeedback('error', t.voiceMicUnsupported);
    }
  };

  const handleCancelVoiceRecording = async () => {
    onHapticTap();
    await cleanupRecording();
  };

  const handleSendVoiceRecording = async () => {
    const rec = recordingRef.current;
    if (!rec || sendingVoice || voiceSendingRef.current) return;
    onHapticTap();

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    recordingRef.current = null;
    voiceSendingRef.current = true;
    const elapsedMs = Date.now() - recordStartedAtRef.current;
    setIsRecording(false);
    setRecordingSec(0);
    setSendingVoice(true);

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      if (!uri || elapsedMs < 450) {
        showTimedFeedback('info', t.voiceTooShort);
        return;
      }

      const durationSec = Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round(elapsedMs / 1000)));
      const activeReply = replyingTo;

      if (isSinglePhone) {
        onUpdateSpState((prev) => {
          const next = appendSinglePhoneVoiceMessage(prev, {
            senderId: currentActor.uid,
            senderName: currentActor.name,
            audioUrl: uri,
            audioDurationSec: durationSec,
            audioMimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
            replyTo: activeReply,
          });
          void persistSinglePhoneChatState(next);
          return next;
        });
        setReplyingTo(null);
        setActiveTab('messages');
        return;
      }

      if (roomCode) {
        await uploadAndSendVoiceMessage({
          roomCode,
          senderName: currentActor.name,
          uri,
          mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
          durationSec,
          memberIds,
          replyTo: activeReply,
        });
        setReplyingTo(null);
        setActiveTab('messages');
      }
    } catch (err) {
      showTimedFeedback('error', formatMultiplayerError(err, t));
    } finally {
      voiceSendingRef.current = false;
      setSendingVoice(false);
    }
  };
  sendVoiceFnRef.current = handleSendVoiceRecording;

  const getCategoryLabel = (id: EmojiCategoryId): string => {
    switch (id) {
      case 'recent':
        return t.emojiCatRecent;
      case 'smileys':
        return t.emojiCatSmileys;
      case 'laughing':
        return t.emojiCatLaughing;
      case 'hearts':
        return t.emojiCatHearts;
      case 'celebrations':
        return t.emojiCatCelebrations;
      case 'animals':
        return t.emojiCatAnimals;
      case 'food':
        return t.emojiCatFood;
      case 'sports':
        return t.emojiCatSports;
      case 'symbols':
        return t.emojiCatSymbols;
    }
  };

  const activeEmojiList = useMemo(() => {
    if (selectedEmojiCat === 'recent') return recentEmojis;
    return EMOJI_CATEGORIES.find((c) => c.id === selectedEmojiCat)?.emojis ?? [];
  }, [selectedEmojiCat, recentEmojis]);

  const handlePickEmoji = (emoji: string) => {
    onHapticTap();
    setDraft((prev) => ((prev + emoji).length <= 500 ? prev + emoji : prev));
    setRecentEmojis((prev) => {
      const next = mergeRecentEmoji(prev, emoji);
      void saveRecentEmojis(next);
      return next;
    });
  };

  const handleSendText = async () => {
    const clean = draft.trim();
    if (!clean || sending) return;
    if (!isSinglePhone && (!roomCode || !myUid)) {
      showTimedFeedback('error', t.anonAuthRequiredTitle);
      return;
    }
    onHapticTap();
    setSending(true);
    const prevDraft = draft;
    const activeReply = replyingTo;
    setDraft('');
    try {
      if (isSinglePhone) {
        onUpdateSpState((prev) => {
          const next = appendSinglePhoneTextMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            clean,
            activeReply
          );
          void persistSinglePhoneChatState(next);
          return next;
        });
      } else if (roomCode) {
        await sendRoomChatMessage(roomCode, currentActor.name, clean, memberIds, activeReply);
      }
      setReplyingTo(null);
      setActiveTab('messages');
    } catch (err) {
      setDraft(prevDraft);
      showTimedFeedback('error', formatMultiplayerError(err, t));
    } finally {
      setSending(false);
    }
  };

  const renderQuotedReplyBlock = (m: DisplayMessageItem, isMe: boolean) => {
    if (!m.replyToMessageId) return null;
    return (
      <TouchableOpacity
        onPress={() => handleScrollToMessage(m.replyToMessageId!)}
        style={[
          styles.quotedReplyBox,
          isMe ? styles.quotedReplyBoxMe : styles.quotedReplyBoxOther,
        ]}
      >
        <Text
          style={[styles.quotedReplySender, isMe ? styles.quotedReplySenderMe : styles.quotedReplySenderOther, dirText]}
          numberOfLines={1}
        >
          {m.replyToSenderName || ''}
        </Text>
        <Text
          style={[styles.quotedReplyPreview, isMe ? styles.quotedReplyPreviewMe : styles.quotedReplyPreviewOther, dirText]}
          numberOfLines={2}
        >
          {m.replyToPreviewText || '...'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingEnd: 8 }}>
              <Text style={[styles.title, dirText]}>
                {isSinglePhone ? t.offlineChatTitle : t.chatTitle}
              </Text>
              {!!remotePresenceInfo.kind && (
                <Text
                  style={[
                    styles.headerPresenceText,
                    remotePresenceInfo.kind === 'recording' && styles.headerPresenceRecText,
                    dirText,
                  ]}
                  numberOfLines={1}
                >
                  {remotePresenceInfo.kind === 'recording' ? '🎤 ' : '••• '}
                  {remotePresenceInfo.label}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setActiveReactionMsgId(null);
                onClose();
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </TouchableOpacity>
          </View>

          {/* Single Phone Active Sender Switcher */}
          {isSinglePhone && singlePlayers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.senderStrip}
              contentContainerStyle={styles.senderStripContent}
            >
              <Text style={styles.senderPrefix}>{t.chattingAsLabel}:</Text>
              {singlePlayers.map((p) => {
                const selected = p.id === currentActor.uid;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      onHapticTap();
                      onChangeSpSender?.(p.id);
                    }}
                    style={[styles.senderChip, selected && styles.senderChipActive]}
                  >
                    <Text
                      style={[
                        styles.senderChipText,
                        selected && styles.senderChipTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* 2 Clear Tabs: Messages | Emojis */}
          <View style={styles.tabRow}>
            {(
              [
                { id: 'messages', label: t.chatTabMessages },
                { id: 'emojis', label: t.chatTabEmojis },
              ] as Array<{ id: ChatTab; label: string }>
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    onHapticTap();
                    setActiveTab(tab.id);
                  }}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Status Banner */}
          {feedback && (
            <View
              style={[
                styles.feedbackBanner,
                feedback.type === 'error'
                  ? styles.feedbackError
                  : feedback.type === 'success'
                    ? styles.feedbackSuccess
                    : styles.feedbackInfo,
              ]}
            >
              <Text
                style={[
                  styles.feedbackText,
                  feedback.type === 'error'
                    ? styles.feedbackTextError
                    : feedback.type === 'success'
                      ? styles.feedbackTextSuccess
                      : styles.feedbackTextInfo,
                  dirText,
                ]}
              >
                {feedback.text}
              </Text>
            </View>
          )}

          {/* TAB 1: MESSAGES */}
          {activeTab === 'messages' && (
            <ScrollView
              ref={scrollRef}
              style={styles.bodyScroll}
              onTouchStart={() => {
                if (activeReactionMsgId) setActiveReactionMsgId(null);
              }}
            >
              {displayMessages.length === 0 ? (
                <Text style={styles.emptyText}>{t.noMessagesYet}</Text>
              ) : (
                displayMessages.map((m) => {
                  const isMe = m.senderId === currentActor.uid;
                  const timeStr = m.createdAtMs
                    ? new Date(m.createdAtMs).toLocaleTimeString(
                        language === 'ar' ? 'ar-EG' : 'en-US',
                        { hour: '2-digit', minute: '2-digit' }
                      )
                    : '...';
                  const emojiOnly =
                    m.messageType === 'text' && isEmojiOnlyMessage(m.text) && !m.replyToMessageId;
                  const reactionSummary = reactionsByMessage[m.id];
                  const reactionEntries = reactionSummary
                    ? (Object.entries(reactionSummary.counts) as Array<[ReactionEmoji, number]>).filter(
                        ([, cnt]) => cnt > 0
                      )
                    : [];
                  const isHighlighted = highlightedMsgId === m.id;
                  const pickerOpen = activeReactionMsgId === m.id;

                  return (
                    <View
                      key={m.id}
                      onLayout={(e) => {
                        msgYRef.current[m.id] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.bubbleWrap,
                        { alignItems: isMe ? 'flex-end' : 'flex-start' },
                        isHighlighted && styles.highlightedMsgWrap,
                      ]}
                    >
                      <SwipeReplyRow onTriggerReply={() => handleStartReply(m)}>
                        <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                          <View
                            style={[
                              styles.metaActionRow,
                              { flexDirection: isMe ? 'row-reverse' : 'row' },
                            ]}
                          >
                            <PlayerAvatar
                              name={m.senderName}
                              paletteId={
                                isSinglePhone
                                  ? singlePlayers.find((p) => p.id === m.senderId)?.avatarColor ??
                                    'fox:espresso'
                                  : onlinePlayers[m.senderId]?.avatarColor ?? 'fox:espresso'
                              }
                              size="xs"
                            />
                            <Text style={styles.msgMeta}>
                              {m.senderName} · {timeStr}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleStartReply(m)}
                              style={styles.microActionBtn}
                            >
                              <Text style={styles.microActionText}>↩ {t.replyBtn}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                onHapticTap();
                                setActiveReactionMsgId((curr) => (curr === m.id ? null : m.id));
                              }}
                              style={styles.microActionBtn}
                            >
                              <Text style={styles.microActionText}>😊+</Text>
                            </TouchableOpacity>
                          </View>

                          {pickerOpen && (
                            <View style={styles.reactionBar}>
                              {REACTION_EMOJIS.map((em) => {
                                const selected = reactionSummary?.myEmoji === em;
                                return (
                                  <TouchableOpacity
                                    key={em}
                                    onPress={() => void handleToggleReaction(m.id, em)}
                                    style={[
                                      styles.reactionBarBtn,
                                      selected && styles.reactionBarBtnSelected,
                                    ]}
                                  >
                                    <Text style={styles.reactionBarEmoji}>{em}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}

                          {m.messageType === 'voice' && m.audioUrl ? (
                            <TouchableOpacity
                              activeOpacity={0.92}
                              onLongPress={() => {
                                onHapticTap();
                                setActiveReactionMsgId(m.id);
                              }}
                              style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}
                            >
                              {renderQuotedReplyBlock(m, isMe)}
                              <MobileVoiceBubble
                                messageId={m.id}
                                audioUrl={m.audioUrl}
                                durationSec={m.audioDurationSec ?? 1}
                                isMe={isMe}
                                isPlaying={playingVoiceId === m.id}
                                positionSec={playingVoiceId === m.id ? voicePlaybackPosSec : 0}
                                progressRatio={playingVoiceId === m.id ? voicePlaybackRatio : 0}
                                onTogglePlay={(id, url) => void handleToggleVoicePlay(id, url)}
                              />
                            </TouchableOpacity>
                          ) : emojiOnly ? (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onLongPress={() => {
                                onHapticTap();
                                setActiveReactionMsgId(m.id);
                              }}
                            >
                              <Text style={styles.largeEmojiMsg}>{m.text}</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              activeOpacity={0.92}
                              onLongPress={() => {
                                onHapticTap();
                                setActiveReactionMsgId(m.id);
                              }}
                              style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}
                            >
                              {renderQuotedReplyBlock(m, isMe)}
                              <Text style={[isMe ? styles.bubbleTextMe : styles.bubbleTextOther, dirText]}>
                                {m.text}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {reactionEntries.length > 0 && (
                            <View style={styles.reactionPillsRow}>
                              {reactionEntries.map(([em, count]) => {
                                const mine = reactionSummary?.myEmoji === em;
                                return (
                                  <TouchableOpacity
                                    key={em}
                                    onPress={() => void handleToggleReaction(m.id, em)}
                                    style={[styles.reactionPill, mine && styles.reactionPillMine]}
                                  >
                                    <Text style={styles.reactionPillText}>
                                      {em} {count}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      </SwipeReplyRow>
                    </View>
                  );
                })
              )}
              {remotePresenceInfo.kind && (
                <View style={styles.presenceBubbleRow}>
                  <View style={styles.presenceBubble}>
                    <Text
                      style={[
                        styles.presenceBubbleText,
                        remotePresenceInfo.kind === 'recording' && styles.presenceBubbleRecText,
                        dirText,
                      ]}
                    >
                      {remotePresenceInfo.kind === 'recording' ? '🎤 ' : '••• '}
                      {remotePresenceInfo.label}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          )}

          {/* TAB 2: EMOJIS */}
          {activeTab === 'emojis' && (
            <View style={{ flex: 1 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.emojiCatBar}
                contentContainerStyle={styles.emojiCatBarContent}
              >
                <TouchableOpacity
                  onPress={() => setSelectedEmojiCat('recent')}
                  style={[
                    styles.emojiCatPill,
                    selectedEmojiCat === 'recent' && styles.emojiCatPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.emojiCatText,
                      selectedEmojiCat === 'recent' && styles.emojiCatTextActive,
                    ]}
                  >
                    🕒 {t.emojiCatRecent}
                  </Text>
                </TouchableOpacity>

                {EMOJI_CATEGORIES.map((cat) => {
                  const active = selectedEmojiCat === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedEmojiCat(cat.id)}
                      style={[styles.emojiCatPill, active && styles.emojiCatPillActive]}
                    >
                      <Text
                        style={[
                          styles.emojiCatText,
                          active && styles.emojiCatTextActive,
                        ]}
                      >
                        {cat.icon} {getCategoryLabel(cat.id)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView style={styles.bodyScroll}>
                <Text style={[styles.sectionHint, { marginBottom: 8 }, dirText]}>
                  {getCategoryLabel(selectedEmojiCat)}
                </Text>
                {activeEmojiList.length === 0 ? (
                  <Text style={styles.emptyText}>{t.noRecentEmojis}</Text>
                ) : (
                  <View style={styles.emojiGrid}>
                    {activeEmojiList.map((emoji, idx) => (
                      <TouchableOpacity
                        key={`${selectedEmojiCat}-${emoji}-${idx}`}
                        onPress={() => handlePickEmoji(emoji)}
                        style={styles.emojiCell}
                      >
                        <Text style={styles.emojiGlyph}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* Active Reply Preview Banner */}
          {replyingTo && (
            <View style={styles.replyBanner}>
              <View style={styles.replyBannerBar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.replyBannerTitle, dirText]} numberOfLines={1}>
                  {t.replyingToLabel} {replyingTo.replyToSenderName}
                </Text>
                <Text style={[styles.replyBannerPreview, dirText]} numberOfLines={1}>
                  {replyingTo.replyToPreviewText}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyingTo(null)}
                style={styles.replyCancelBtn}
                accessibilityLabel={t.cancelReplyLabel}
              >
                <Text style={styles.replyCancelText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Input Bar + Emoji Button + Recorded Voice Composer */}
          {isRecording ? (
            <View style={styles.recordingBar}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTimerText}>
                {t.recordingVoiceLabel} {formatMmSs(recordingSec)} / {formatMmSs(MAX_VOICE_SECONDS)}
              </Text>
              <TouchableOpacity
                onPress={() => void handleCancelVoiceRecording()}
                style={styles.recordCancelBtn}
              >
                <Text style={styles.recordCancelText}>{t.cancelVoiceRecordBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSendVoiceRecording()}
                style={styles.recordSendBtn}
              >
                <Text style={styles.sendBtnText}>{t.sendVoiceRecordBtn}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TouchableOpacity
                onPress={() => {
                  onHapticTap();
                  setActiveTab((prev) => (prev === 'emojis' ? 'messages' : 'emojis'));
                }}
                style={[
                  styles.emojiToggleBtn,
                  activeTab === 'emojis' && styles.emojiToggleBtnActive,
                ]}
              >
                <Text style={{ fontSize: 20 }}>😊</Text>
              </TouchableOpacity>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (draft.trim()) void handleSendText();
                }}
                placeholder={t.chatPlaceholder}
                placeholderTextColor="#9C8D7E"
                style={[styles.input, dirText]}
              />

              {draft.trim() ? (
                <TouchableOpacity
                  disabled={sending}
                  onPress={() => void handleSendText()}
                  style={[styles.sendBtn, sending && styles.disabledBtn]}
                >
                  <Text style={styles.sendBtnText}>{t.sendMsgBtn}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  disabled={sendingVoice}
                  onPress={() => void handleStartVoiceRecord()}
                  style={[styles.micRecordBtn, sendingVoice && styles.disabledBtn]}
                  accessibilityLabel={t.recordVoiceBtn}
                >
                  {sendingVoice ? (
                    <ActivityIndicator size="small" color="#FBF7F0" />
                  ) : (
                    <Text style={{ fontSize: 18 }}>🎤</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(35,26,21,0.58)',
    justifyContent: 'center',
    padding: 12,
  },
  card: {
    height: '88%',
    borderRadius: 24,
    padding: 14,
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: '#D5C7B2',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DEC8',
  },
  title: { color: '#231A15', fontSize: 16, fontWeight: '800' },
  headerPresenceText: { color: '#355432', fontSize: 11, fontWeight: '800', marginTop: 2 },
  headerPresenceRecText: { color: '#B91C1C' },
  presenceBubbleRow: {
    alignItems: 'flex-start',
    marginTop: 2,
    marginBottom: 10,
  },
  presenceBubble: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#EFE6D6',
    borderWidth: 1,
    borderColor: '#DDD2C0',
  },
  presenceBubbleText: { color: '#355432', fontSize: 12, fontWeight: '800' },
  presenceBubbleRecText: { color: '#B91C1C' },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
  },
  closeBtnText: { color: '#231A15', fontSize: 12, fontWeight: '700' },
  senderStrip: {
    maxHeight: 42,
    backgroundColor: '#FBF7F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E8DEC8',
  },
  senderStripContent: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  senderPrefix: { fontSize: 11, fontWeight: '700', color: '#7A6A5B', marginEnd: 4 },
  senderChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#EFE6D6',
  },
  senderChipActive: { backgroundColor: '#231A15' },
  senderChipText: { fontSize: 12, fontWeight: '700', color: '#5E4F43' },
  senderChipTextActive: { color: '#FBF7F0' },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DEC8',
  },
  tabBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: '#F6EFE3',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBtnActive: { backgroundColor: '#231A15', borderColor: '#231A15' },
  tabBtnText: { color: '#5E4F43', fontSize: 12, fontWeight: '800' },
  tabBtnTextActive: { color: '#FBF7F0' },
  feedbackBanner: {
    marginTop: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  feedbackError: { backgroundColor: '#F9EAE6', borderColor: '#C88172' },
  feedbackSuccess: { backgroundColor: '#EEF3EC', borderColor: '#B9CEB3' },
  feedbackInfo: { backgroundColor: '#F3EBDD', borderColor: '#D5C7B2' },
  feedbackText: { fontSize: 12, fontWeight: '700' },
  feedbackTextError: { color: '#9B3B30' },
  feedbackTextSuccess: { color: '#355432' },
  feedbackTextInfo: { color: '#5E4F43' },
  bodyScroll: { flex: 1, marginVertical: 8 },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D5C7B2',
    padding: 20,
    backgroundColor: '#FBF7F0',
  },
  emptyText: { textAlign: 'center', color: '#7A6A5B', fontSize: 13, fontWeight: '600', marginTop: 12 },
  bubbleWrap: { marginBottom: 12, paddingVertical: 2, borderRadius: 14 },
  highlightedMsgWrap: {
    backgroundColor: '#FBF5E4',
    borderWidth: 1,
    borderColor: '#C7A355',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  metaActionRow: {
    alignItems: 'center',
    gap: 6,
  },
  msgMeta: { fontSize: 11, color: '#7A6A5B', fontWeight: '600' },
  microActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#F3EBDD',
    borderWidth: 1,
    borderColor: '#E5DAC8',
  },
  microActionText: { fontSize: 10, fontWeight: '800', color: '#5E4F43' },
  reactionBar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: '#D5C7B2',
    elevation: 3,
  },
  reactionBarBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBarBtnSelected: {
    backgroundColor: '#EFE6D6',
  },
  reactionBarEmoji: { fontSize: 17 },
  reactionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  reactionPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F6EFE3',
    borderWidth: 1,
    borderColor: '#DDD2C0',
  },
  reactionPillMine: {
    backgroundColor: '#FBF5E4',
    borderColor: '#8B5E3C',
  },
  reactionPillText: { fontSize: 11, fontWeight: '700', color: '#231A15' },
  quotedReplyBox: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    borderStartWidth: 3,
    minWidth: 130,
  },
  quotedReplyBoxMe: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderStartColor: '#D7BD7B',
  },
  quotedReplyBoxOther: {
    backgroundColor: '#FBF7F0',
    borderStartColor: '#8B5E3C',
  },
  quotedReplySender: { fontSize: 10, fontWeight: '800' },
  quotedReplySenderMe: { color: '#F3EBDD' },
  quotedReplySenderOther: { color: '#8B5E3C' },
  quotedReplyPreview: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  quotedReplyPreviewMe: { color: '#E5DAC8' },
  quotedReplyPreviewOther: { color: '#5E4F43' },
  bubble: { maxWidth: '84%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMe: { backgroundColor: '#231A15' },
  bubbleOther: { backgroundColor: '#EFE6D6', borderWidth: 1, borderColor: '#DDD2C0' },
  bubbleTextMe: { color: '#FBF7F0', fontSize: 14, lineHeight: 20 },
  bubbleTextOther: { color: '#231A15', fontSize: 14, lineHeight: 20 },
  largeEmojiMsg: { fontSize: 36, lineHeight: 44, paddingVertical: 2 },
  voiceBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 185,
  },
  voicePlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMe: { backgroundColor: '#FBF7F0' },
  voicePlayBtnOther: { backgroundColor: '#231A15' },
  voicePlayGlyphMe: { color: '#231A15', fontSize: 12, fontWeight: '900' },
  voicePlayGlyphOther: { color: '#FBF7F0', fontSize: 12, fontWeight: '900' },
  voiceTrackWrap: { flex: 1, gap: 4 },
  voiceTrackBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  voiceTrackBgMe: { backgroundColor: 'rgba(255,255,255,0.25)' },
  voiceTrackBgOther: { backgroundColor: '#D5C7B2' },
  voiceTrackFill: { height: '100%', borderRadius: 3 },
  voiceTrackFillMe: { backgroundColor: '#D7BD7B' },
  voiceTrackFillOther: { backgroundColor: '#8B5E3C' },
  voiceDurMe: { color: '#EFE6D6', fontSize: 11, fontWeight: '700' },
  voiceDurOther: { color: '#5E4F43', fontSize: 11, fontWeight: '700' },
  sectionHint: { fontSize: 11, fontWeight: '600', color: '#7A6A5B' },
  emojiCatBar: {
    maxHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DEC8',
  },
  emojiCatBarContent: { alignItems: 'center', gap: 6, paddingVertical: 6 },
  emojiCatPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
  },
  emojiCatPillActive: { backgroundColor: '#231A15' },
  emojiCatText: { fontSize: 12, fontWeight: '700', color: '#5E4F43' },
  emojiCatTextActive: { color: '#FBF7F0' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiCell: {
    width: '14.5%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#E8DEC8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: { fontSize: 24 },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: '#F6EFE3',
    borderWidth: 1,
    borderColor: '#D5C7B2',
  },
  replyBannerBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#8B5E3C',
  },
  replyBannerTitle: { fontSize: 11, fontWeight: '800', color: '#8B5E3C' },
  replyBannerPreview: { fontSize: 12, fontWeight: '600', color: '#5E4F43' },
  replyCancelBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCancelText: { fontSize: 12, fontWeight: '800', color: '#231A15' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8DEC8',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8DEC8',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#9B3B30',
  },
  recordingTimerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#9B3B30',
  },
  recordCancelBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCancelText: { fontSize: 12, fontWeight: '800', color: '#5E4F43' },
  recordSendBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F6EFE3',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiToggleBtnActive: { backgroundColor: '#231A15', borderColor: '#231A15' },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#D5C7B2',
    color: '#231A15',
    fontSize: 14,
  },
  sendBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRecordBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#FBF7F0', fontSize: 13, fontWeight: '800' },
  disabledBtn: { opacity: 0.45 },
});
