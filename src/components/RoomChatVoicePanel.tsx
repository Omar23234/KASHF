import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookmarkCheck,
  BookmarkPlus,
  Clock,
  ImagePlus,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Radio,
  Reply,
  Send,
  Smile,
  SmilePlus,
  Sparkles,
  Sticker,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import {
  EMOJI_CATEGORIES,
  isEmojiOnlyMessage,
  loadRecentEmojis,
  recordRecentEmoji,
  recordRecentEmojisFromText,
  type EmojiCategoryId,
} from '../data/emojis';
import {
  deletePersonalSticker,
  saveStickerToMyCollection,
  sendRoomChatMessage,
  sendRoomStickerMessage,
  subscribeToMyStickers,
  subscribeToRoomMessages,
  subscribeToRoomReactions,
  toggleMessageReaction,
  uploadAndSendVoiceMessage,
  uploadPersonalSticker,
} from '../firebase/multiplayerService';
import type { VoiceErrorType } from '../hooks/useWebRTCVoiceChat';
import {
  REACTION_EMOJIS,
  type ChatReplyReference,
  type MessageReactionDoc,
  type PersonalSticker,
  type ReactionEmoji,
  type RoomChatMessage,
  type RoomPlayerDoc,
  type SinglePhonePlayer,
} from '../types/game';
import {
  getWebNotificationPermissionState,
  requestChatNotificationPermission,
  showIncomingChatNotification,
  type WebNotificationPermissionState,
} from '../utils/chatNotifications';
import {
  addPersonalStickerToSinglePhoneState,
  appendSinglePhoneStickerMessage,
  appendSinglePhoneTextMessage,
  appendSinglePhoneVoiceMessage,
  deleteSinglePhoneStickerFromState,
  loadSinglePhoneChatState,
  persistSinglePhoneChatState,
  saveOtherStickerToSinglePhoneState,
  toggleSinglePhoneReaction,
  type SinglePhoneChatStoreState,
} from '../utils/singlePhoneChatStore';
import { compressStickerFile, StickerImageError } from '../utils/stickerImage';

type ChatTab = 'messages' | 'stickers' | 'emojis';

const MAX_VOICE_SECONDS = 180;
const MAX_ONLINE_VOICE_BYTES = 5 * 1024 * 1024;
const MAX_LOCAL_VOICE_BYTES = 1.5 * 1024 * 1024;

interface InspectStickerItem {
  stickerId: string;
  imageUrl: string;
  storagePath: string;
  contentHash: string;
  creatorUid: string;
  creatorName: string;
  fromMyCollection: boolean;
}

interface UnifiedDisplayMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: 'text' | 'sticker' | 'voice';
  stickerId?: string;
  stickerUrl?: string;
  stickerStoragePath?: string;
  stickerCreatorId?: string;
  stickerCreatorName?: string;
  stickerContentHash?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  audioMimeType?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreviewText?: string;
  replyToType?: 'text' | 'sticker' | 'voice';
  createdAtMs: number | null;
}

interface AggregatedReaction {
  counts: Partial<Record<ReactionEmoji, number>>;
  myEmoji: ReactionEmoji | null;
}

interface OnlineRoomChatProps {
  mode?: 'online';
  roomCode: string;
  myUid: string;
  myName: string;
  memberIds: string[];
  players: Record<string, RoomPlayerDoc>;
  voiceJoined: boolean;
  micMuted: boolean;
  voiceError: VoiceErrorType;
  speakingUids: Record<string, boolean>;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
}

interface SinglePhoneChatProps {
  mode: 'single_phone';
  singlePlayers: SinglePhonePlayer[];
  activeSinglePlayerId: string;
}

export type RoomChatVoicePanelProps = OnlineRoomChatProps | SinglePhoneChatProps;

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('READER_FAILED'));
      }
    };
    reader.onerror = () => reject(new Error('READER_FAILED'));
    reader.readAsDataURL(blob);
  });
}

interface VoiceMessageBubbleProps {
  messageId: string;
  audioUrl: string;
  durationSec: number;
  isMe: boolean;
  playingId: string | null;
  onStartPlay: (id: string, audio: HTMLAudioElement) => void;
  onStopPlay: (id: string) => void;
  voiceMsgLabel: string;
}

const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({
  messageId,
  audioUrl,
  durationSec,
  isMe,
  playingId,
  onStartPlay,
  onStopPlay,
  voiceMsgLabel,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSec);
  const [playbackError, setPlaybackError] = useState(false);

  const isPlaying = playingId === messageId;

  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || playbackError) return;
    if (isPlaying) {
      el.pause();
      onStopPlay(messageId);
    } else {
      onStartPlay(messageId, el);
      try {
        await el.play();
      } catch {
        onStopPlay(messageId);
        setPlaybackError(true);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    const dur = totalDuration > 0 ? totalDuration : durationSec;
    if (!el || dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const targetSec = ratio * dur;
    el.currentTime = targetSec;
    setCurrentTime(targetSec);
  };

  const effectiveTotal = totalDuration > 0 ? totalDuration : durationSec;
  const pct =
    effectiveTotal > 0 ? Math.min(100, Math.round((currentTime / effectiveTotal) * 100)) : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[205px] sm:min-w-[235px]">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setTotalDuration(Math.round(d));
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setCurrentTime(0);
          onStopPlay(messageId);
        }}
        onError={() => {
          onStopPlay(messageId);
          setPlaybackError(true);
        }}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={voiceMsgLabel}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
          isMe
            ? 'bg-[#D7BD7B] text-[#231A15] hover:bg-[#E5CE94]'
            : 'bg-[#231A15] text-[#FBF7F0] hover:bg-[#3A2C24]'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ms-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          dir="ltr"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          onClick={handleSeek}
          className={`h-2 w-full rounded-full overflow-hidden cursor-pointer ${
            isMe ? 'bg-white/20' : 'bg-[#D5C7B2]'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              isMe ? 'bg-[#D7BD7B]' : 'bg-[#8B5E3C]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className={`flex items-center justify-between text-[10px] font-mono-tabular font-bold ${
            isMe ? 'text-[#D5C7B2]' : 'text-[#6E5E50]'
          }`}
        >
          <span>{formatMmSs(isPlaying || currentTime > 0 ? currentTime : effectiveTotal)}</span>
          <span>{voiceMsgLabel}</span>
        </div>
      </div>
    </div>
  );
};

export const RoomChatVoicePanel: React.FC<RoomChatVoicePanelProps> = (props) => {
  const { language, t, chatNotificationsEnabled } = useApp();
  const isSinglePhone = props.mode === 'single_phone';

  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTab>('messages');
  const [selectedEmojiCat, setSelectedEmojiCat] = useState<EmojiCategoryId>('smileys');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => loadRecentEmojis());
  const [notifPerm, setNotifPerm] = useState<WebNotificationPermissionState>(() =>
    getWebNotificationPermissionState()
  );

  // Online states
  const [onlineMessages, setOnlineMessages] = useState<RoomChatMessage[]>([]);
  const [onlineReactions, setOnlineReactions] = useState<MessageReactionDoc[]>([]);
  const [onlineMyStickers, setOnlineMyStickers] = useState<PersonalSticker[]>([]);

  // Single phone offline states
  const [spState, setSpState] = useState<SinglePhoneChatStoreState>(() =>
    loadSinglePhoneChatState()
  );
  const [spSenderId, setSpSenderId] = useState<string>(
    isSinglePhone ? props.activeSinglePlayerId : ''
  );

  // Shared UI states
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [stickerFeedback, setStickerFeedback] = useState<{
    type: 'error' | 'info' | 'success';
    text: string;
  } | null>(null);
  const [inspectSticker, setInspectSticker] = useState<InspectStickerItem | null>(null);
  const [savingStickerId, setSavingStickerId] = useState<string | null>(null);

  // Reply & Reactions UI states
  const [replyTo, setReplyTo] = useState<ChatReplyReference | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});

  // Voice Note Recording & Playback states
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const notifEnabledRef = useRef(chatNotificationsEnabled);
  notifEnabledRef.current = chatNotificationsEnabled;
  const initialMsgsLoadedRef = useRef(false);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());

  const scrollBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const messageNodeMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const touchSwipeRef = useRef<{ id: string; startX: number; startY: number; triggered: boolean } | null>(null);

  // Voice recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartMsRef = useRef<number>(0);
  const recordMimeRef = useRef<string>('audio/webm');
  const cancelledRecordRef = useRef<boolean>(false);
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const replyToRef = useRef<ChatReplyReference | null>(null);
  replyToRef.current = replyTo;

  const showTimedFeedback = useCallback((type: 'error' | 'info' | 'success', text: string) => {
    setStickerFeedback({ type, text });
    window.setTimeout(() => {
      setStickerFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  // Sync active Single Phone sender cleanly when turn changes and user has modal closed
  useEffect(() => {
    if (isSinglePhone && !chatOpen && props.activeSinglePlayerId) {
      setSpSenderId(props.activeSinglePlayerId);
    }
  }, [isSinglePhone, chatOpen, isSinglePhone ? props.activeSinglePlayerId : '']);

  const onlineRoomCode = !isSinglePhone ? props.roomCode : '';
  const onlineMyUid = !isSinglePhone ? props.myUid : '';
  const onlineMyName = !isSinglePhone ? props.myName : '';
  const onlineMemberIds = !isSinglePhone ? props.memberIds : [];

  const cleanupRecordingResources = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recordStreamRef.current) {
      for (const track of recordStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      recordStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
  }, []);

  // Cleanup recording & audio on unmount or modal close
  useEffect(() => {
    if (!chatOpen) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        cancelledRecordRef.current = true;
        try {
          mediaRecorderRef.current.stop();
        } catch {
          cleanupRecordingResources();
        }
        setRecordingState('idle');
        setRecordSeconds(0);
      }
      if (activeAudioElRef.current) {
        try {
          activeAudioElRef.current.pause();
        } catch {
          // ignore
        }
        activeAudioElRef.current = null;
      }
      setPlayingAudioId(null);
      setReactionTargetId(null);
    }
  }, [chatOpen, cleanupRecordingResources]);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, [cleanupRecordingResources]);

  // Online subscriptions (messages, reactions, personal stickers)
  useEffect(() => {
    if (isSinglePhone || !onlineRoomCode || !onlineMyUid) return;

    initialMsgsLoadedRef.current = false;
    knownMsgIdsRef.current = new Set();

    const unsubMsgs = subscribeToRoomMessages(onlineRoomCode, onlineMyUid, (msgs) => {
      setOnlineMessages(msgs);

      if (!initialMsgsLoadedRef.current) {
        initialMsgsLoadedRef.current = true;
        knownMsgIdsRef.current = new Set(msgs.map((m) => m.id));
        if (chatOpenRef.current) {
          setUnreadCount(0);
        }
        return;
      }

      const newlyArrived = msgs.filter((m) => !knownMsgIdsRef.current.has(m.id));
      for (const m of msgs) {
        knownMsgIdsRef.current.add(m.id);
      }

      if (chatOpenRef.current) {
        setUnreadCount(0);
        return;
      }

      const fromOthers = newlyArrived.filter((m) => m.senderId !== onlineMyUid);
      if (fromOthers.length > 0) {
        setUnreadCount((prev) => prev + fromOthers.length);
        if (notifEnabledRef.current) {
          const latest = fromOthers[fromOthers.length - 1];
          const bodyPreview =
            latest.messageType === 'sticker'
              ? t.replyStickerPreview
              : latest.messageType === 'voice'
                ? `${t.replyVoicePreview} (${formatMmSs(latest.audioDurationSec ?? 1)})`
                : latest.text;
          void showIncomingChatNotification({
            roomCode: onlineRoomCode,
            title: `${latest.senderName} · ${t.newMessageNotifTitle}`,
            body: bodyPreview,
            onOpenChat: () => {
              setActiveTab('messages');
              setChatOpen(true);
            },
          });
        }
      }
    });

    const unsubReactions = subscribeToRoomReactions(onlineRoomCode, onlineMyUid, (rxns) => {
      setOnlineReactions(rxns);
    });

    const unsubStickers = subscribeToMyStickers(onlineMyUid, (stickers) => {
      setOnlineMyStickers(stickers);
    });

    return () => {
      unsubMsgs();
      unsubReactions();
      unsubStickers();
    };
  }, [
    isSinglePhone,
    onlineRoomCode,
    onlineMyUid,
    t.newMessageNotifTitle,
    t.replyStickerPreview,
    t.replyVoicePreview,
  ]);

  const currentActor = useMemo(() => {
    if (isSinglePhone) {
      const found =
        props.singlePlayers.find((p) => p.id === spSenderId) ??
        props.singlePlayers.find((p) => p.id === props.activeSinglePlayerId) ??
        props.singlePlayers[0];
      return {
        uid: found?.id ?? 'sp-1',
        name: found?.name ?? 'Player',
      };
    }
    return {
      uid: props.myUid,
      name: props.myName,
    };
  }, [isSinglePhone, props, spSenderId]);

  const myStickers: PersonalSticker[] = useMemo(() => {
    if (isSinglePhone) {
      return spState.stickersByPlayer[currentActor.uid] ?? [];
    }
    return onlineMyStickers;
  }, [isSinglePhone, spState.stickersByPlayer, currentActor.uid, onlineMyStickers]);

  const displayMessages: UnifiedDisplayMessage[] = useMemo(() => {
    if (isSinglePhone) {
      return spState.messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        messageType: m.messageType,
        stickerId: m.stickerId,
        stickerUrl: m.stickerUrl,
        stickerStoragePath: `local/${m.stickerCreatorId ?? m.senderId}/${m.stickerId ?? 'stk'}`,
        stickerCreatorId: m.stickerCreatorId,
        stickerCreatorName: m.stickerCreatorName,
        stickerContentHash: m.stickerContentHash,
        audioUrl: m.audioUrl,
        audioDurationSec: m.audioDurationSec,
        audioMimeType: m.audioMimeType,
        replyToMessageId: m.replyToMessageId,
        replyToSenderName: m.replyToSenderName,
        replyToPreviewText: m.replyToPreviewText,
        replyToType: m.replyToType,
        createdAtMs: m.createdAtMs,
      }));
    }
    return onlineMessages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      text: m.text,
      messageType:
        m.messageType === 'sticker'
          ? 'sticker'
          : m.messageType === 'voice'
            ? 'voice'
            : 'text',
      stickerId: m.stickerId,
      stickerUrl: m.stickerUrl,
      stickerStoragePath: m.stickerStoragePath,
      stickerCreatorId: m.stickerCreatorId,
      stickerCreatorName: m.stickerCreatorName,
      stickerContentHash: m.stickerContentHash,
      audioUrl: m.audioUrl,
      audioDurationSec: m.audioDurationSec,
      audioMimeType: m.audioMimeType,
      replyToMessageId: m.replyToMessageId,
      replyToSenderName: m.replyToSenderName,
      replyToPreviewText: m.replyToPreviewText,
      replyToType: m.replyToType,
      createdAtMs: m.createdAt?.toMillis?.() ?? null,
    }));
  }, [isSinglePhone, spState.messages, onlineMessages]);

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, AggregatedReaction> = {};
    if (isSinglePhone) {
      for (const [msgId, userMap] of Object.entries(spState.reactions)) {
        const agg: AggregatedReaction = { counts: {}, myEmoji: null };
        for (const [uid, entry] of Object.entries(userMap)) {
          agg.counts[entry.emoji] = (agg.counts[entry.emoji] ?? 0) + 1;
          if (uid === currentActor.uid) {
            agg.myEmoji = entry.emoji;
          }
        }
        map[msgId] = agg;
      }
      return map;
    }
    for (const rxn of onlineReactions) {
      if (!map[rxn.messageId]) {
        map[rxn.messageId] = { counts: {}, myEmoji: null };
      }
      map[rxn.messageId].counts[rxn.emoji] =
        (map[rxn.messageId].counts[rxn.emoji] ?? 0) + 1;
      if (rxn.userId === currentActor.uid) {
        map[rxn.messageId].myEmoji = rxn.emoji;
      }
    }
    return map;
  }, [isSinglePhone, spState.reactions, onlineReactions, currentActor.uid]);

  // Unique stickers shared by other players in the room chat
  const roomOtherStickers = useMemo(() => {
    const seen = new Set<string>();
    const result: InspectStickerItem[] = [];
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const m = displayMessages[i];
      if (
        m.messageType === 'sticker' &&
        m.stickerId &&
        m.stickerUrl &&
        m.senderId !== currentActor.uid
      ) {
        const key = m.stickerContentHash || m.stickerId;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          stickerId: m.stickerId,
          imageUrl: m.stickerUrl,
          storagePath:
            m.stickerStoragePath || `stickers/${m.stickerCreatorId || m.senderId}/${m.stickerId}`,
          contentHash: m.stickerContentHash || m.stickerId,
          creatorUid: m.stickerCreatorId || m.senderId,
          creatorName: m.stickerCreatorName || m.senderName,
          fromMyCollection: false,
        });
      }
    }
    return result;
  }, [displayMessages, currentActor.uid]);

  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0);
      setNotifPerm(getWebNotificationPermissionState());
      if (activeTab === 'messages') {
        scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [chatOpen, displayMessages.length, activeTab]);

  const isStickerAlreadySaved = (stickerId: string, contentHash?: string): boolean => {
    return myStickers.some(
      (s) => s.stickerId === stickerId || (contentHash ? s.contentHash === contentHash : false)
    );
  };

  const buildReplyReference = (m: UnifiedDisplayMessage): ChatReplyReference => {
    let previewText = m.text;
    if (m.messageType === 'sticker') {
      previewText = m.stickerCreatorName
        ? `${t.replyStickerPreview} · ${m.stickerCreatorName}`
        : t.replyStickerPreview;
    } else if (m.messageType === 'voice') {
      previewText = `${t.replyVoicePreview} (${formatMmSs(m.audioDurationSec ?? 1)})`;
    }
    return {
      replyToMessageId: m.id,
      replyToSenderName: m.senderName,
      replyToPreviewText: previewText.slice(0, 160),
      replyToType: m.messageType,
    };
  };

  const selectReplyTarget = (m: UnifiedDisplayMessage) => {
    setReplyTo(buildReplyReference(m));
    setReactionTargetId(null);
    setActiveTab('messages');
    window.setTimeout(() => textInputRef.current?.focus(), 60);
  };

  const jumpToOriginalMessage = (messageId: string) => {
    const node = messageNodeMapRef.current.get(messageId);
    if (!node) {
      showTimedFeedback('info', t.originalMsgNotFound);
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(messageId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMsgId((curr) => (curr === messageId ? null : curr));
    }, 1550);
  };

  const handleToggleReaction = async (messageId: string, emoji: ReactionEmoji) => {
    setReactionTargetId(null);
    const currentMyEmoji = reactionsByMessage[messageId]?.myEmoji ?? null;
    try {
      if (isSinglePhone) {
        setSpState((prev) => {
          const next = toggleSinglePhoneReaction(prev, {
            messageId,
            userId: currentActor.uid,
            userName: currentActor.name,
            emoji,
          });
          persistSinglePhoneChatState(next);
          return next;
        });
      } else {
        await toggleMessageReaction({
          roomCode: onlineRoomCode,
          messageId,
          userName: onlineMyName,
          emoji,
          memberIds: onlineMemberIds,
          currentMyEmoji,
        });
      }
    } catch {
      showTimedFeedback('error', t.errPermissionDenied);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const activeReply = replyTo;
    setSending(true);
    setDraft('');
    setReplyTo(null);
    setRecentEmojis(recordRecentEmojisFromText(text));
    try {
      if (isSinglePhone) {
        setSpState((prev) => {
          const next = appendSinglePhoneTextMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            text,
            activeReply
          );
          persistSinglePhoneChatState(next);
          return next;
        });
      } else {
        await sendRoomChatMessage(
          onlineRoomCode,
          onlineMyName,
          text,
          onlineMemberIds,
          activeReply
        );
      }
      setActiveTab('messages');
    } catch {
      setDraft(text);
      setReplyTo(activeReply);
      showTimedFeedback('error', t.errNetwork);
    } finally {
      setSending(false);
    }
  };

  const handlePickEmoji = (emoji: string) => {
    setDraft((prev) => {
      if ((prev + emoji).length > 500) return prev;
      return prev + emoji;
    });
    setRecentEmojis(recordRecentEmoji(emoji));
    textInputRef.current?.focus();
  };

  const handleStickerFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingSticker) return;

    setUploadingSticker(true);
    setStickerFeedback(null);

    try {
      const compressed = await compressStickerFile(file);

      if (isSinglePhone) {
        const res = addPersonalStickerToSinglePhoneState(spState, {
          playerId: currentActor.uid,
          playerName: currentActor.name,
          dataUrl: compressed.dataUrl,
          contentHash: compressed.contentHash,
        });
        if (res.status === 'added') {
          setSpState(res.nextState);
          persistSinglePhoneChatState(res.nextState);
        }
        showTimedFeedback(
          res.status === 'already_exists' ? 'info' : 'success',
          res.status === 'already_exists'
            ? t.stickerAlreadySavedBadge
            : t.stickerSavedBadge
        );
      } else {
        const res = await uploadPersonalSticker({
          blob: compressed.blob,
          mimeType: compressed.mimeType,
          extension: compressed.extension,
          contentHash: compressed.contentHash,
          creatorName: onlineMyName,
        });
        showTimedFeedback(
          res.status === 'already_exists' ? 'info' : 'success',
          res.status === 'already_exists' ? t.stickerAlreadySavedBadge : t.stickerSavedBadge
        );
      }
    } catch (err) {
      if (err instanceof StickerImageError) {
        if (err.code === 'UNSUPPORTED_FORMAT') {
          showTimedFeedback('error', t.stickerFormatError);
        } else if (err.code === 'FILE_TOO_LARGE') {
          showTimedFeedback('error', t.stickerTooLargeError);
        } else {
          showTimedFeedback('error', t.stickerUploadError);
        }
      } else if (err instanceof Error && err.message === 'STICKER_STORAGE_UNAVAILABLE') {
        showTimedFeedback('error', t.stickerStorageUnavailable);
      } else {
        showTimedFeedback('error', t.stickerUploadError);
      }
    } finally {
      setUploadingSticker(false);
    }
  };

  const handleSendSticker = async (sticker: PersonalSticker) => {
    if (sending) return;
    const activeReply = replyTo;
    setSending(true);
    try {
      if (isSinglePhone) {
        setSpState((prev) => {
          const next = appendSinglePhoneStickerMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            sticker,
            activeReply
          );
          persistSinglePhoneChatState(next);
          return next;
        });
      } else {
        await sendRoomStickerMessage(
          onlineRoomCode,
          onlineMyName,
          sticker,
          onlineMemberIds,
          activeReply
        );
      }
      setReplyTo(null);
      setInspectSticker(null);
      setActiveTab('messages');
    } catch {
      showTimedFeedback('error', t.stickerUploadError);
    } finally {
      setSending(false);
    }
  };

  const handleSaveOtherSticker = async (item: InspectStickerItem) => {
    if (savingStickerId) return;
    if (isStickerAlreadySaved(item.stickerId, item.contentHash)) {
      showTimedFeedback('info', t.stickerAlreadySavedBadge);
      return;
    }

    setSavingStickerId(item.stickerId);
    try {
      if (isSinglePhone) {
        const res = saveOtherStickerToSinglePhoneState(spState, {
          targetPlayerId: currentActor.uid,
          stickerId: item.stickerId,
          imageUrl: item.imageUrl,
          contentHash: item.contentHash,
          creatorUid: item.creatorUid,
          creatorName: item.creatorName,
        });
        if (res.status === 'saved') {
          setSpState(res.nextState);
          persistSinglePhoneChatState(res.nextState);
        }
        showTimedFeedback(
          res.status === 'already_exists' ? 'info' : 'success',
          res.status === 'already_exists' ? t.stickerAlreadySavedBadge : t.stickerSavedBadge
        );
      } else {
        const res = await saveStickerToMyCollection({
          stickerId: item.stickerId,
          imageUrl: item.imageUrl,
          storagePath: item.storagePath,
          contentHash: item.contentHash,
          creatorUid: item.creatorUid,
          creatorName: item.creatorName,
        });
        showTimedFeedback(
          res === 'already_exists' ? 'info' : 'success',
          res === 'already_exists' ? t.stickerAlreadySavedBadge : t.stickerSavedBadge
        );
      }
    } catch {
      showTimedFeedback('error', t.stickerUploadError);
    } finally {
      setSavingStickerId(null);
    }
  };

  const handleDeleteMySticker = async (stickerId: string) => {
    if (isSinglePhone) {
      setSpState((prev) => {
        const next = deleteSinglePhoneStickerFromState(prev, currentActor.uid, stickerId);
        persistSinglePhoneChatState(next);
        return next;
      });
    } else {
      await deletePersonalSticker(stickerId);
    }
    setInspectSticker(null);
  };

  const finishAndUploadRecordedAudio = async (
    blob: Blob,
    mimeType: string,
    durationSec: number
  ) => {
    if (durationSec < 1 || blob.size < 256) {
      showTimedFeedback('info', t.voiceTooShort);
      setRecordingState('idle');
      return;
    }

    const activeReply = replyToRef.current;

    if (isSinglePhone) {
      if (blob.size > MAX_LOCAL_VOICE_BYTES) {
        showTimedFeedback('error', t.voiceTooLong);
        setRecordingState('idle');
        return;
      }
      setRecordingState('uploading');
      try {
        const dataUrl = await blobToDataUrl(blob);
        setSpState((prev) => {
          const next = appendSinglePhoneVoiceMessage(prev, {
            senderId: currentActor.uid,
            senderName: currentActor.name,
            audioUrl: dataUrl,
            audioDurationSec: durationSec,
            audioMimeType: mimeType || 'audio/webm',
            replyTo: activeReply,
          });
          persistSinglePhoneChatState(next);
          return next;
        });
        setReplyTo(null);
        setActiveTab('messages');
      } catch {
        showTimedFeedback('error', t.voiceUploadFailed);
      } finally {
        setRecordingState('idle');
      }
      return;
    }

    if (blob.size > MAX_ONLINE_VOICE_BYTES) {
      showTimedFeedback('error', t.voiceTooLong);
      setRecordingState('idle');
      return;
    }

    setRecordingState('uploading');
    try {
      await uploadAndSendVoiceMessage({
        roomCode: onlineRoomCode,
        senderName: onlineMyName,
        blob,
        mimeType: mimeType || 'audio/webm',
        durationSec,
        memberIds: onlineMemberIds,
        replyTo: activeReply,
      });
      setReplyTo(null);
      setActiveTab('messages');
    } catch (err) {
      if (err instanceof Error && err.message === 'VOICE_STORAGE_UNAVAILABLE') {
        showTimedFeedback('error', t.voiceStorageUnavailable);
      } else if (err instanceof Error && err.message === 'VOICE_TOO_LARGE') {
        showTimedFeedback('error', t.voiceTooLong);
      } else {
        showTimedFeedback('error', t.voiceUploadFailed);
      }
    } finally {
      setRecordingState('idle');
    }
  };

  const startVoiceRecording = async () => {
    if (recordingState !== 'idle' || sending) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      showTimedFeedback('error', t.voiceMicUnsupported);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        showTimedFeedback('error', t.voiceMicNotFound);
      } else {
        showTimedFeedback('error', t.voiceMicDenied);
      }
      return;
    }

    try {
      const preferredMime = pickSupportedRecorderMime();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];
      recordMimeRef.current = (recorder.mimeType || preferredMime || 'audio/webm').split(';')[0];
      cancelledRecordRef.current = false;
      recordStartMsRef.current = Date.now();
      setRecordSeconds(0);
      setRecordingState('recording');

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordChunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const wasCancelled = cancelledRecordRef.current;
        const mime = recordMimeRef.current || 'audio/webm';
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const elapsedSec = Math.round((Date.now() - recordStartMsRef.current) / 1000);
        cleanupRecordingResources();
        setRecordSeconds(0);
        if (wasCancelled) {
          setRecordingState('idle');
          return;
        }
        void finishAndUploadRecordedAudio(blob, mime, elapsedSec);
      };

      recorder.start(250);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartMsRef.current) / 1000);
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 250);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      cleanupRecordingResources();
      setRecordingState('idle');
      showTimedFeedback('error', t.voiceMicUnsupported);
    }
  };

  const cancelVoiceRecording = () => {
    cancelledRecordRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch {
        cleanupRecordingResources();
        setRecordingState('idle');
      }
    } else {
      cleanupRecordingResources();
      setRecordingState('idle');
    }
    setRecordSeconds(0);
  };

  const sendVoiceRecording = () => {
    cancelledRecordRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  };

  const handleStartAudioPlay = (id: string, audioEl: HTMLAudioElement) => {
    if (activeAudioElRef.current && activeAudioElRef.current !== audioEl) {
      try {
        activeAudioElRef.current.pause();
      } catch {
        // ignore
      }
    }
    activeAudioElRef.current = audioEl;
    setPlayingAudioId(id);
  };

  const handleStopAudioPlay = (id: string) => {
    setPlayingAudioId((curr) => (curr === id ? null : curr));
  };

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

  const voiceParticipantsCount = !isSinglePhone
    ? props.memberIds.filter((id) => props.players[id]?.voiceJoined).length
    : 0;

  return (
    <>
      {/* Trigger Bar */}
      <div className="rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-[0_6px_18px_-12px_rgba(35,26,21,0.1)]">
        {!isSinglePhone ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#5E4F43] me-1">
              <Radio
                className={`w-4 h-4 ${props.voiceJoined ? 'text-[#4A6B46]' : 'text-[#8B5E3C]'}`}
              />
              <span>{t.voiceChatTitle}</span>
              {voiceParticipantsCount > 0 && (
                <span className="font-mono-tabular text-[11px] font-extrabold text-[#4A6B46]">
                  ({voiceParticipantsCount})
                </span>
              )}
            </div>

            {!props.voiceJoined ? (
              <button
                type="button"
                onClick={props.onJoinVoice}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#EEF3EC] hover:bg-[#E1EBDD] border border-[#B9CEB3] text-[#355432] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{t.joinVoiceBtn}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={props.onToggleMute}
                  className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    props.micMuted
                      ? 'bg-[#F9EAE6] border-[#C88172] text-[#9B3B30]'
                      : props.speakingUids[props.myUid]
                        ? 'bg-[#355432] border-[#355432] text-[#FBF7F0] shadow-xs'
                        : 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                  }`}
                >
                  {props.micMuted ? (
                    <MicOff className="w-3.5 h-3.5" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                  <span>{props.micMuted ? t.unmuteMicBtn : t.muteMicBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={props.onLeaveVoice}
                  className="min-h-[38px] px-3 rounded-xl bg-[#EFE6D6] hover:bg-[#F9EAE6] border border-[#D5C7B2] hover:border-[#C88172] text-[#5E4F43] hover:text-[#9B3B30] text-xs font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>{t.leaveVoiceBtn}</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-bold text-[#5E4F43]">
            <Sparkles className="w-4 h-4 text-[#8B5E3C]" />
            <span>{t.offlineChatTitle}</span>
            {displayMessages.length > 0 && (
              <span className="font-mono-tabular text-[11px] font-extrabold text-[#8B5E3C]">
                ({displayMessages.length})
              </span>
            )}
          </div>
        )}

        {/* Chat + Stickers + Emojis Button */}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="relative min-h-[38px] px-3.5 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#8B5E3C]" />
          <span>{isSinglePhone ? t.chatTabMessages + ' · ' + t.chatTabStickers : t.chatTitle}</span>
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#9B3B30] text-[#FFFDF9] font-mono-tabular text-[10px] font-extrabold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {!isSinglePhone && props.voiceError && (
          <p className="w-full text-xs text-[#9B3B30] font-bold pt-1">
            {props.voiceError === 'permission_denied'
              ? t.voicePermissionDenied
              : props.voiceError === 'no_mic_device'
                ? t.voiceMicNotFound
                : t.voiceNotSupported}
          </p>
        )}
      </div>

      {/* Hidden Gallery Input for Personal Stickers (PNG, WebP, JPEG) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        onChange={handleStickerFileSelected}
        className="hidden"
      />

      {/* Chat Modal / Drawer */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#231A15]/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={() => setReactionTargetId(null)}
              className="relative w-full sm:max-w-lg h-[86vh] sm:h-[660px] rounded-t-3xl sm:rounded-3xl bg-[#FFFDF9] border border-[#D5C7B2] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Modal Header */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DEC8] bg-[#F6EFE3] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-5 h-5 text-[#8B5E3C] shrink-0" />
                  <h3 className="text-base font-extrabold text-[#231A15] truncate">
                    {isSinglePhone ? t.offlineChatTitle : t.chatTitle}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isSinglePhone && chatNotificationsEnabled && notifPerm === 'default' && (
                    <button
                      type="button"
                      onClick={() => {
                        void requestChatNotificationPermission().then((next) => setNotifPerm(next));
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FBF5E4] hover:bg-[#F5E9C6] border border-[#D7BD7B] text-[#7D5D18] text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t.enableNotificationsBtn}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInspectSticker(null);
                      setChatOpen(false);
                    }}
                    aria-label={t.close}
                    className="p-2 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#5E4F43] hover:text-[#231A15] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Single Phone Active Sender Switcher */}
              {isSinglePhone && props.singlePlayers.length > 0 && (
                <div className="px-4 py-2 bg-[#FBF7F0] border-b border-[#E8DEC8] flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="text-[11px] font-bold text-[#7A6A5B] shrink-0 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#8B5E3C]" />
                    {t.chattingAsLabel}:
                  </span>
                  {props.singlePlayers.map((p) => {
                    const selected = p.id === currentActor.uid;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSpSenderId(p.id)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                          selected
                            ? 'bg-[#231A15] text-[#FBF7F0]'
                            : 'bg-[#EFE6D6] text-[#5E4F43] hover:bg-[#E5DAC5]'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 3 Clear Tabs: Messages | Stickers | Emojis */}
              <div className="px-3 pt-2.5 pb-2 bg-[#F6EFE3] border-b border-[#E8DEC8] grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('messages')}
                  className={`min-h-[38px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'messages'
                      ? 'bg-[#231A15] text-[#FBF7F0] shadow-xs'
                      : 'bg-[#FFFDF9] border border-[#DDD2C0] text-[#5E4F43] hover:bg-[#EFE6D6]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t.chatTabMessages}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('stickers')}
                  className={`min-h-[38px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'stickers'
                      ? 'bg-[#231A15] text-[#FBF7F0] shadow-xs'
                      : 'bg-[#FFFDF9] border border-[#DDD2C0] text-[#5E4F43] hover:bg-[#EFE6D6]'
                  }`}
                >
                  <Sticker className="w-3.5 h-3.5" />
                  <span>{t.chatTabStickers}</span>
                  {myStickers.length > 0 && (
                    <span className="font-mono-tabular text-[10px] opacity-80">
                      ({myStickers.length})
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('emojis')}
                  className={`min-h-[38px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'emojis'
                      ? 'bg-[#231A15] text-[#FBF7F0] shadow-xs'
                      : 'bg-[#FFFDF9] border border-[#DDD2C0] text-[#5E4F43] hover:bg-[#EFE6D6]'
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>{t.chatTabEmojis}</span>
                </button>
              </div>

              {/* Status / Upload Feedback Toast */}
              {stickerFeedback && (
                <div
                  className={`mx-4 mt-2.5 px-3 py-2 rounded-xl text-xs font-bold border ${
                    stickerFeedback.type === 'error'
                      ? 'bg-[#F9EAE6] border-[#C88172] text-[#9B3B30]'
                      : stickerFeedback.type === 'success'
                        ? 'bg-[#EEF3EC] border-[#B9CEB3] text-[#355432]'
                        : 'bg-[#F3EBDD] border-[#D5C7B2] text-[#5E4F43]'
                  }`}
                >
                  {stickerFeedback.text}
                </div>
              )}

              {/* TAB 1: MESSAGES FEED */}
              {activeTab === 'messages' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBF7F0]">
                  {displayMessages.length === 0 ? (
                    <p className="text-center text-sm text-[#7A6A5B] py-12">{t.noMessagesYet}</p>
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
                        m.messageType === 'text' && !m.replyToMessageId && isEmojiOnlyMessage(m.text);
                      const agg = reactionsByMessage[m.id];
                      const activeReactionEntries = agg
                        ? REACTION_EMOJIS.filter((em) => (agg.counts[em] ?? 0) > 0).map((em) => ({
                            emoji: em,
                            count: agg.counts[em] ?? 0,
                            mine: agg.myEmoji === em,
                          }))
                        : [];
                      const isPickerOpen = reactionTargetId === m.id;
                      const isHighlighted = highlightedMsgId === m.id;
                      const swipeX = swipeOffsets[m.id] ?? 0;

                      return (
                        <div
                          key={m.id}
                          data-message-id={m.id}
                          ref={(el) => {
                            if (el) messageNodeMapRef.current.set(m.id, el);
                            else messageNodeMapRef.current.delete(m.id);
                          }}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            if (!touch) return;
                            touchSwipeRef.current = {
                              id: m.id,
                              startX: touch.clientX,
                              startY: touch.clientY,
                              triggered: false,
                            };
                          }}
                          onTouchMove={(e) => {
                            const sw = touchSwipeRef.current;
                            const touch = e.touches[0];
                            if (!sw || sw.id !== m.id || !touch) return;
                            const dx = touch.clientX - sw.startX;
                            const dy = Math.abs(touch.clientY - sw.startY);
                            if (dx > 10 && dx > dy * 1.25) {
                              const clamped = Math.min(54, dx);
                              setSwipeOffsets((prev) =>
                                prev[m.id] === clamped ? prev : { ...prev, [m.id]: clamped }
                              );
                              if (dx >= 46 && !sw.triggered) {
                                sw.triggered = true;
                                selectReplyTarget(m);
                              }
                            }
                          }}
                          onTouchEnd={() => {
                            touchSwipeRef.current = null;
                            setSwipeOffsets((prev) => {
                              if (!(m.id in prev)) return prev;
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            });
                          }}
                          onPointerDown={(e) => {
                            if (e.button !== 0 && e.pointerType === 'mouse') return;
                            pressOriginRef.current = { x: e.clientX, y: e.clientY };
                            if (longPressTimerRef.current !== null) {
                              window.clearTimeout(longPressTimerRef.current);
                            }
                            longPressTimerRef.current = window.setTimeout(() => {
                              setReactionTargetId(m.id);
                            }, 420);
                          }}
                          onPointerMove={(e) => {
                            const orig = pressOriginRef.current;
                            if (!orig || longPressTimerRef.current === null) return;
                            if (
                              Math.abs(e.clientX - orig.x) > 8 ||
                              Math.abs(e.clientY - orig.y) > 8
                            ) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onPointerUp={() => {
                            if (longPressTimerRef.current !== null) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onPointerCancel={() => {
                            if (longPressTimerRef.current !== null) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          style={
                            swipeX > 0
                              ? { transform: `translateX(${swipeX}px)`, transition: 'none' }
                              : undefined
                          }
                          className={`group/msg relative flex flex-col rounded-2xl px-1 py-0.5 transition-all ${
                            isMe ? 'items-end' : 'items-start'
                          } ${isHighlighted ? 'ring-2 ring-[#C7A355] bg-[#FBF5E4]/80' : ''}`}
                        >
                          {/* Header row: sender, time, quick Reply & React actions */}
                          <div className="flex items-center gap-2 text-[11px] text-[#7A6A5B] mb-1 px-1">
                            <span className="font-bold text-[#5E4F43]">{m.senderName}</span>
                            <span>{timeStr}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectReplyTarget(m);
                              }}
                              aria-label={t.replyBtn}
                              title={t.replyBtn}
                              className="p-0.5 rounded text-[#8B5E3C] hover:text-[#231A15] hover:bg-[#EFE6D6] cursor-pointer"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionTargetId((curr) => (curr === m.id ? null : m.id));
                              }}
                              aria-label={t.reactBtnLabel}
                              title={t.reactBtnLabel}
                              className="p-0.5 rounded text-[#8B5E3C] hover:text-[#231A15] hover:bg-[#EFE6D6] cursor-pointer"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Floating Reaction Bar */}
                          {isPickerOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="z-20 mb-1.5 inline-flex items-center gap-1 rounded-full bg-[#FFFDF9] border border-[#D5C7B2] px-2 py-1 shadow-lg"
                            >
                              {REACTION_EMOJIS.map((em) => {
                                const selected = agg?.myEmoji === em;
                                return (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => void handleToggleReaction(m.id, em)}
                                    className={`w-8 h-8 rounded-full text-lg flex items-center justify-center transition hover:scale-115 cursor-pointer ${
                                      selected ? 'bg-[#F3EBDD] ring-1 ring-[#8B5E3C]' : ''
                                    }`}
                                  >
                                    {em}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Quoted Reply Block helper rendered inside bubble */}
                          {m.messageType === 'sticker' && m.stickerUrl ? (
                            <div className="max-w-[82%] flex flex-col gap-1">
                              {m.replyToMessageId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToOriginalMessage(m.replyToMessageId!);
                                  }}
                                  className="rounded-xl bg-[#EFE6D6] border-s-4 border-[#8B5E3C] px-2.5 py-1.5 text-start text-[11px] hover:bg-[#E5DAC5] transition cursor-pointer"
                                >
                                  <p className="font-extrabold text-[#8B5E3C] truncate">
                                    {m.replyToSenderName}
                                  </p>
                                  <p className="text-[#5E4F43] truncate">{m.replyToPreviewText}</p>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectSticker({
                                    stickerId: m.stickerId || m.id,
                                    imageUrl: m.stickerUrl!,
                                    storagePath:
                                      m.stickerStoragePath ||
                                      `stickers/${m.stickerCreatorId || m.senderId}/${m.stickerId || m.id}`,
                                    contentHash: m.stickerContentHash || m.stickerId || m.id,
                                    creatorUid: m.stickerCreatorId || m.senderId,
                                    creatorName: m.stickerCreatorName || m.senderName,
                                    fromMyCollection: isStickerAlreadySaved(
                                      m.stickerId || m.id,
                                      m.stickerContentHash
                                    ),
                                  });
                                }}
                                className="group relative rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] hover:border-[#8B5E3C] p-2 shadow-xs transition cursor-pointer text-start"
                              >
                                <img
                                  src={m.stickerUrl}
                                  alt={m.stickerCreatorName || 'Sticker'}
                                  className="w-32 h-32 sm:w-36 sm:h-36 object-contain rounded-xl"
                                  loading="lazy"
                                />
                                <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
                                  <span className="text-[10px] font-bold text-[#7A6A5B] truncate max-w-[100px]">
                                    {t.stickerCreatedBy} {m.stickerCreatorName || m.senderName}
                                  </span>
                                  {!isMe && (
                                    <span className="text-[10px] font-extrabold text-[#8B5E3C]">
                                      {isStickerAlreadySaved(
                                        m.stickerId || m.id,
                                        m.stickerContentHash
                                      )
                                        ? '✓'
                                        : '+'}
                                    </span>
                                  )}
                                </div>
                              </button>
                            </div>
                          ) : m.messageType === 'voice' && m.audioUrl ? (
                            <div
                              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 space-y-2 ${
                                isMe
                                  ? 'bg-[#231A15] text-[#FBF7F0] rounded-te-sm'
                                  : 'bg-[#EFE6D6] border border-[#DDD2C0] text-[#231A15] rounded-ts-sm'
                              }`}
                            >
                              {m.replyToMessageId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToOriginalMessage(m.replyToMessageId!);
                                  }}
                                  className={`w-full rounded-xl border-s-4 border-[#D7BD7B] px-2.5 py-1.5 text-start text-[11px] cursor-pointer ${
                                    isMe
                                      ? 'bg-white/10 hover:bg-white/15'
                                      : 'bg-[#FFFDF9] hover:bg-[#F3EBDD]'
                                  }`}
                                >
                                  <p className={`font-extrabold truncate ${isMe ? 'text-[#D7BD7B]' : 'text-[#8B5E3C]'}`}>
                                    {m.replyToSenderName}
                                  </p>
                                  <p className={`truncate ${isMe ? 'text-[#E5DAC5]' : 'text-[#5E4F43]'}`}>
                                    {m.replyToPreviewText}
                                  </p>
                                </button>
                              )}
                              <VoiceMessageBubble
                                messageId={m.id}
                                audioUrl={m.audioUrl}
                                durationSec={m.audioDurationSec ?? 1}
                                isMe={isMe}
                                playingId={playingAudioId}
                                onStartPlay={handleStartAudioPlay}
                                onStopPlay={handleStopAudioPlay}
                                voiceMsgLabel={t.voiceMsgLabel}
                              />
                            </div>
                          ) : emojiOnly ? (
                            <div
                              className={`px-2 py-1 text-4xl sm:text-5xl leading-tight tracking-wide select-text ${
                                isMe ? 'text-end' : 'text-start'
                              }`}
                            >
                              {m.text}
                            </div>
                          ) : (
                            <div
                              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words space-y-2 ${
                                isMe
                                  ? 'bg-[#231A15] text-[#FBF7F0] rounded-te-sm'
                                  : 'bg-[#EFE6D6] border border-[#DDD2C0] text-[#231A15] rounded-ts-sm'
                              }`}
                            >
                              {m.replyToMessageId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToOriginalMessage(m.replyToMessageId!);
                                  }}
                                  className={`w-full rounded-xl border-s-4 border-[#D7BD7B] px-2.5 py-1.5 text-start text-[11px] cursor-pointer ${
                                    isMe
                                      ? 'bg-white/10 hover:bg-white/15'
                                      : 'bg-[#FFFDF9] hover:bg-[#F3EBDD]'
                                  }`}
                                >
                                  <p className={`font-extrabold truncate ${isMe ? 'text-[#D7BD7B]' : 'text-[#8B5E3C]'}`}>
                                    {m.replyToSenderName}
                                  </p>
                                  <p className={`truncate ${isMe ? 'text-[#E5DAC5]' : 'text-[#5E4F43]'}`}>
                                    {m.replyToPreviewText}
                                  </p>
                                </button>
                              )}
                              <p className="whitespace-pre-wrap">{m.text}</p>
                            </div>
                          )}

                          {/* Aggregated Reaction Pills */}
                          {activeReactionEntries.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1 px-1">
                              {activeReactionEntries.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleToggleReaction(m.id, r.emoji);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                                    r.mine
                                      ? 'bg-[#FBF5E4] border-[#8B5E3C] text-[#231A15]'
                                      : 'bg-[#FFFDF9] border-[#DDD2C0] text-[#5E4F43] hover:bg-[#F3EBDD]'
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="font-mono-tabular text-[10px]">{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={scrollBottomRef} />
                </div>
              )}

              {/* TAB 2: STICKERS */}
              {activeTab === 'stickers' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#FBF7F0]">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-extrabold text-[#231A15]">
                          {t.myStickersTitle}
                        </h4>
                        <p className="text-[11px] text-[#7A6A5B]">{t.tapStickerToSaveHint}</p>
                      </div>
                      <button
                        type="button"
                        disabled={uploadingSticker}
                        onClick={() => fileInputRef.current?.click()}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span>{uploadingSticker ? t.uploadingSticker : t.addStickerBtn}</span>
                      </button>
                    </div>

                    {myStickers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#D5C7B2] bg-[#FFFDF9] p-6 text-center space-y-2">
                        <Sticker className="w-8 h-8 text-[#8B5E3C] mx-auto opacity-75" />
                        <p className="text-xs font-bold text-[#6E5E50]">{t.noMyStickersYet}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {myStickers.map((stk) => (
                          <div
                            key={stk.stickerId}
                            className="group relative rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] hover:border-[#8B5E3C] p-2 flex flex-col items-center gap-1 shadow-xs"
                          >
                            <button
                              type="button"
                              onClick={() => void handleSendSticker(stk)}
                              className="w-full aspect-square flex items-center justify-center cursor-pointer"
                              title={t.sendStickerBtn}
                            >
                              <img
                                src={stk.imageUrl}
                                alt={stk.creatorName}
                                className="w-full h-full object-contain rounded-xl"
                                loading="lazy"
                              />
                            </button>
                            <div className="w-full flex items-center justify-between gap-1 px-0.5">
                              <span className="text-[10px] font-semibold text-[#7A6A5B] truncate">
                                {stk.creatorName}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMySticker(stk.stickerId)}
                                aria-label={t.deleteStickerBtn}
                                className="p-1 rounded-lg text-[#9C8D7E] hover:text-[#9B3B30] hover:bg-[#F9EAE6] cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2.5 pt-2 border-t border-[#E8DEC8]">
                    <h4 className="text-sm font-extrabold text-[#231A15]">
                      {t.roomStickersTitle}
                    </h4>

                    {roomOtherStickers.length === 0 ? (
                      <p className="text-xs text-[#7A6A5B] py-3">{t.noRoomStickersYet}</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {roomOtherStickers.map((item) => {
                          const alreadySaved = isStickerAlreadySaved(
                            item.stickerId,
                            item.contentHash
                          );
                          return (
                            <div
                              key={item.stickerId}
                              className="rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] p-2 flex flex-col items-center gap-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => setInspectSticker(item)}
                                className="w-full aspect-square flex items-center justify-center cursor-pointer"
                              >
                                <img
                                  src={item.imageUrl}
                                  alt={item.creatorName}
                                  className="w-full h-full object-contain rounded-xl"
                                  loading="lazy"
                                />
                              </button>
                              <span className="text-[10px] font-bold text-[#7A6A5B] truncate w-full text-center">
                                {item.creatorName}
                              </span>
                              <button
                                type="button"
                                disabled={alreadySaved || savingStickerId === item.stickerId}
                                onClick={() => void handleSaveOtherSticker(item)}
                                className={`w-full py-1 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer ${
                                  alreadySaved
                                    ? 'bg-[#EEF3EC] text-[#355432] cursor-default'
                                    : 'bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15]'
                                }`}
                              >
                                {alreadySaved ? (
                                  <>
                                    <BookmarkCheck className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{t.stickerAlreadySavedBadge}</span>
                                  </>
                                ) : (
                                  <>
                                    <BookmarkPlus className="w-3 h-3 shrink-0 text-[#8B5E3C]" />
                                    <span className="truncate">{t.addToMyStickersBtn}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 3: EMOJI PICKER */}
              {activeTab === 'emojis' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#FBF7F0]">
                  <div className="px-3 py-2.5 border-b border-[#E8DEC8] bg-[#FFFDF9] flex items-center gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedEmojiCat('recent')}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                        selectedEmojiCat === 'recent'
                          ? 'bg-[#231A15] text-[#FBF7F0]'
                          : 'bg-[#EFE6D6] text-[#5E4F43] hover:bg-[#E5DAC5]'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t.emojiCatRecent}</span>
                    </button>

                    {EMOJI_CATEGORIES.map((cat) => {
                      const active = selectedEmojiCat === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedEmojiCat(cat.id)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-[#231A15] text-[#FBF7F0]'
                              : 'bg-[#EFE6D6] text-[#5E4F43] hover:bg-[#E5DAC5]'
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{getCategoryLabel(cat.id)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex-1 overflow-y-auto p-3.5">
                    <p className="text-xs font-extrabold text-[#6E5E50] mb-2.5 px-1">
                      {getCategoryLabel(selectedEmojiCat)}
                    </p>
                    {activeEmojiList.length === 0 ? (
                      <p className="text-xs text-[#7A6A5B] text-center py-10">
                        {t.noRecentEmojis}
                      </p>
                    ) : (
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                        {activeEmojiList.map((emoji, idx) => (
                          <button
                            key={`${selectedEmojiCat}-${emoji}-${idx}`}
                            type="button"
                            onClick={() => handlePickEmoji(emoji)}
                            className="h-11 rounded-xl bg-[#FFFDF9] hover:bg-[#EFE6D6] border border-[#E8DEC8] text-2xl sm:text-3xl flex items-center justify-center active:scale-90 transition cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tap-Sticker Popover */}
              <AnimatePresence>
                {inspectSticker && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-[#231A15]/60 backdrop-blur-[2px] flex items-center justify-center p-4"
                    onClick={() => setInspectSticker(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.94, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.94, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-xs rounded-3xl bg-[#FFFDF9] border-2 border-[#D5C7B2] p-5 space-y-4 text-center shadow-2xl"
                    >
                      <div className="mx-auto w-36 h-36 rounded-2xl bg-[#FBF7F0] border border-[#E8DEC8] p-2 flex items-center justify-center">
                        <img
                          src={inspectSticker.imageUrl}
                          alt={inspectSticker.creatorName}
                          className="w-full h-full object-contain rounded-xl"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-[#8B5E3C]">
                          {t.stickerCreatedBy}: {inspectSticker.creatorName}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {isStickerAlreadySaved(
                          inspectSticker.stickerId,
                          inspectSticker.contentHash
                        ) ? (
                          <div className="w-full py-2.5 px-4 rounded-2xl bg-[#EEF3EC] border border-[#B9CEB3] text-[#355432] text-xs font-extrabold flex items-center justify-center gap-1.5">
                            <BookmarkCheck className="w-4 h-4" />
                            <span>{t.stickerAlreadySavedBadge}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={savingStickerId === inspectSticker.stickerId}
                            onClick={() => void handleSaveOtherSticker(inspectSticker)}
                            className="w-full min-h-[44px] px-4 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <BookmarkPlus className="w-4 h-4 text-[#D7BD7B]" />
                            <span>{t.addToMyStickersBtn}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setInspectSticker(null)}
                          className="w-full min-h-[40px] px-4 rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#231A15] text-xs font-bold cursor-pointer"
                        >
                          {t.close}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* WhatsApp-Style Reply Preview Banner Above Composer */}
              {replyTo && (
                <div className="px-3.5 py-2 bg-[#F3EBDD] border-t border-[#E8DEC8] flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 border-s-4 border-[#8B5E3C] ps-2.5">
                    <p className="text-[11px] font-extrabold text-[#8B5E3C] truncate">
                      {t.replyingToLabel} {replyTo.replyToSenderName}
                    </p>
                    <p className="text-xs text-[#5E4F43] truncate">{replyTo.replyToPreviewText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label={t.cancelReplyLabel}
                    className="p-1.5 rounded-lg bg-[#FFFDF9] border border-[#D5C7B2] text-[#5E4F43] hover:text-[#231A15] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Message Input Bar + Voice Recorder + Emoji Toggle */}
              {recordingState === 'recording' ? (
                <div className="p-3 border-t border-[#E8DEC8] bg-[#F6EFE3] flex items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="min-h-[44px] px-3.5 rounded-2xl bg-[#F9EAE6] hover:bg-[#F3DDD7] border border-[#C88172] text-[#9B3B30] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t.cancelVoiceRecordBtn}</span>
                  </button>

                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#231A15]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#9B3B30] animate-pulse" />
                    <span>{t.recordingVoiceLabel}</span>
                    <span dir="ltr" className="font-mono-tabular text-[#8B5E3C]">
                      {formatMmSs(recordSeconds)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={sendVoiceRecording}
                    className="min-h-[44px] px-4 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{t.sendVoiceRecordBtn}</span>
                  </button>
                </div>
              ) : recordingState === 'uploading' ? (
                <div className="p-3 border-t border-[#E8DEC8] bg-[#F6EFE3] flex items-center justify-center gap-2 text-sm font-bold text-[#5E4F43] min-h-[68px]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#8B5E3C]" />
                  <span>{t.sendVoiceRecordBtn}...</span>
                </div>
              ) : (
                <form
                  onSubmit={handleSendText}
                  className="p-3 border-t border-[#E8DEC8] bg-[#F6EFE3] flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTab((prev) => (prev === 'emojis' ? 'messages' : 'emojis'))
                    }
                    aria-label={t.emojiPickerBtnLabel}
                    title={t.emojiPickerBtnLabel}
                    className={`min-h-[44px] w-11 rounded-2xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
                      activeTab === 'emojis'
                        ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                        : 'bg-[#FFFDF9] border-[#D5C7B2] text-[#8B5E3C] hover:bg-[#EFE6D6]'
                    }`}
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <input
                    ref={textInputRef}
                    type="text"
                    maxLength={500}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t.chatPlaceholder}
                    className="flex-1 min-h-[44px] px-3.5 rounded-2xl bg-[#FFFDF9] border border-[#D5C7B2] text-sm text-[#231A15] placeholder:text-[#9C8D7E] focus:outline-none focus:border-[#8B5E3C]"
                  />

                  {draft.trim() ? (
                    <button
                      type="submit"
                      disabled={sending}
                      className="min-h-[44px] px-4 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-45 shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">{t.sendMsgBtn}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startVoiceRecording()}
                      aria-label={t.recordVoiceBtn}
                      title={t.recordVoiceBtn}
                      className="min-h-[44px] w-11 sm:w-auto sm:px-3.5 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
