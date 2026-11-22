import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  Clock,
  ImagePlus,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Smile,
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
  uploadPersonalSticker,
} from '../firebase/multiplayerService';
import type { VoiceErrorType } from '../hooks/useWebRTCVoiceChat';
import type {
  PersonalSticker,
  RoomChatMessage,
  RoomPlayerDoc,
  SinglePhonePlayer,
} from '../types/game';
import {
  addPersonalStickerToSinglePhoneState,
  appendSinglePhoneStickerMessage,
  appendSinglePhoneTextMessage,
  deleteSinglePhoneStickerFromState,
  loadSinglePhoneChatState,
  persistSinglePhoneChatState,
  saveOtherStickerToSinglePhoneState,
  type SinglePhoneChatStoreState,
} from '../utils/singlePhoneChatStore';
import { compressStickerFile, StickerImageError } from '../utils/stickerImage';

type ChatTab = 'messages' | 'stickers' | 'emojis';

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
  messageType: 'text' | 'sticker';
  stickerId?: string;
  stickerUrl?: string;
  stickerStoragePath?: string;
  stickerCreatorId?: string;
  stickerCreatorName?: string;
  stickerContentHash?: string;
  createdAtMs: number | null;
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

export const RoomChatVoicePanel: React.FC<RoomChatVoicePanelProps> = (props) => {
  const { language, t } = useApp();
  const isSinglePhone = props.mode === 'single_phone';

  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTab>('messages');
  const [selectedEmojiCat, setSelectedEmojiCat] = useState<EmojiCategoryId>('smileys');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => loadRecentEmojis());

  // Online states
  const [onlineMessages, setOnlineMessages] = useState<RoomChatMessage[]>([]);
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

  const seenCountRef = useRef<number>(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Sync active Single Phone sender cleanly when turn changes and user has modal closed
  useEffect(() => {
    if (isSinglePhone && !chatOpen && props.activeSinglePlayerId) {
      setSpSenderId(props.activeSinglePlayerId);
    }
  }, [isSinglePhone, chatOpen, isSinglePhone ? props.activeSinglePlayerId : '']);

  // Online subscriptions
  const onlineRoomCode = !isSinglePhone ? props.roomCode : '';
  const onlineMyUid = !isSinglePhone ? props.myUid : '';

  useEffect(() => {
    if (isSinglePhone || !onlineRoomCode || !onlineMyUid) return;
    const unsubMsgs = subscribeToRoomMessages(onlineRoomCode, onlineMyUid, (msgs) => {
      setOnlineMessages(msgs);
      if (chatOpenRef.current) {
        seenCountRef.current = msgs.length;
        setUnreadCount(0);
      } else {
        const diff = Math.max(0, msgs.length - seenCountRef.current);
        if (diff > 0) {
          const newOthers = msgs
            .slice(seenCountRef.current)
            .filter((m) => m.senderId !== onlineMyUid).length;
          if (newOthers > 0) {
            setUnreadCount((prev) => prev + newOthers);
          }
          seenCountRef.current = msgs.length;
        }
      }
    });
    const unsubStickers = subscribeToMyStickers(onlineMyUid, (stickers) => {
      setOnlineMyStickers(stickers);
    });
    return () => {
      unsubMsgs();
      unsubStickers();
    };
  }, [isSinglePhone, onlineRoomCode, onlineMyUid]);

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
        createdAtMs: m.createdAtMs,
      }));
    }
    return onlineMessages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      text: m.text,
      messageType: m.messageType === 'sticker' ? 'sticker' : 'text',
      stickerId: m.stickerId,
      stickerUrl: m.stickerUrl,
      stickerStoragePath: m.stickerStoragePath,
      stickerCreatorId: m.stickerCreatorId,
      stickerCreatorName: m.stickerCreatorName,
      stickerContentHash: m.stickerContentHash,
      createdAtMs: m.createdAt?.toMillis?.() ?? null,
    }));
  }, [isSinglePhone, spState.messages, onlineMessages]);

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
          storagePath: m.stickerStoragePath || `stickers/${m.stickerCreatorId || m.senderId}/${m.stickerId}`,
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
      seenCountRef.current = displayMessages.length;
      setUnreadCount(0);
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

  const showTimedFeedback = (type: 'error' | 'info' | 'success', text: string) => {
    setStickerFeedback({ type, text });
    window.setTimeout(() => {
      setStickerFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    setRecentEmojis(recordRecentEmojisFromText(text));
    try {
      if (isSinglePhone) {
        setSpState((prev) => {
          const next = appendSinglePhoneTextMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            text
          );
          persistSinglePhoneChatState(next);
          return next;
        });
      } else {
        await sendRoomChatMessage(props.roomCode, props.myName, text, props.memberIds);
      }
      setActiveTab('messages');
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
          creatorName: props.myName,
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
    setSending(true);
    try {
      if (isSinglePhone) {
        setSpState((prev) => {
          const next = appendSinglePhoneStickerMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            sticker
          );
          persistSinglePhoneChatState(next);
          return next;
        });
      } else {
        await sendRoomStickerMessage(props.roomCode, props.myName, sticker, props.memberIds);
      }
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
              className="relative w-full sm:max-w-lg h-[84vh] sm:h-[640px] rounded-t-3xl sm:rounded-3xl bg-[#FFFDF9] border border-[#D5C7B2] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Modal Header */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DEC8] bg-[#F6EFE3] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-5 h-5 text-[#8B5E3C] shrink-0" />
                  <h3 className="text-base font-extrabold text-[#231A15] truncate">
                    {isSinglePhone ? t.offlineChatTitle : t.chatTitle}
                  </h3>
                </div>
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

              {/* Single Phone Active Sender Switcher (so different friends can send & save each other's stickers offline) */}
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
                        m.messageType !== 'sticker' && isEmojiOnlyMessage(m.text);

                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-2 text-[11px] text-[#7A6A5B] mb-1 px-1">
                            <span className="font-bold text-[#5E4F43]">{m.senderName}</span>
                            <span>{timeStr}</span>
                          </div>

                          {m.messageType === 'sticker' && m.stickerUrl ? (
                            <button
                              type="button"
                              onClick={() =>
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
                                })
                              }
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
                              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                                isMe
                                  ? 'bg-[#231A15] text-[#FBF7F0] rounded-te-sm'
                                  : 'bg-[#EFE6D6] border border-[#DDD2C0] text-[#231A15] rounded-ts-sm'
                              }`}
                            >
                              {m.text}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={scrollBottomRef} />
                </div>
              )}

              {/* TAB 2: STICKERS (MY STICKERS + ADD STICKER + ROOM STICKERS FROM OTHERS) */}
              {activeTab === 'stickers' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#FBF7F0]">
                  {/* My Stickers Header + Add Sticker CTA */}
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

                  {/* Room Stickers sent by other players (easy browse & save) */}
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

              {/* TAB 3: EMOJI PICKER (RECENT + 8 CATEGORIES, MULTI-EMOJI COMPOSITION) */}
              {activeTab === 'emojis' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#FBF7F0]">
                  {/* Category Tabs */}
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

                  {/* Emoji Grid */}
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

              {/* Tap-Sticker Popover ("Add to My Stickers" + Creator Name + Duplicate Protection) */}
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

              {/* Message Input Bar + Emoji Toggle Button (next to chat input field) */}
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

                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="min-h-[44px] px-4 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-45 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.sendMsgBtn}</span>
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
