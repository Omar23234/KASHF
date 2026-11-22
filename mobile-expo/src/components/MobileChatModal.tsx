import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
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
  deletePersonalSticker,
  saveStickerToMyCollection,
  sendRoomChatMessage,
  sendRoomStickerMessage,
  uploadPersonalSticker,
  type PersonalSticker,
  type RoomChatMessage,
} from '../services/multiplayerService';
import {
  addPersonalStickerToSinglePhoneState,
  appendSinglePhoneStickerMessage,
  appendSinglePhoneTextMessage,
  deleteSinglePhoneStickerFromState,
  persistSinglePhoneChatState,
  saveOtherStickerToSinglePhoneState,
  type SinglePhoneChatStoreState,
} from '../utils/singlePhoneChatStore';
import type { SinglePhonePlayer } from '../utils/specialCards';
import { compressMobileStickerAsset, StickerImageError } from '../utils/stickerImage';

type ChatTab = 'messages' | 'stickers' | 'emojis';

interface InspectStickerItem {
  stickerId: string;
  imageUrl: string;
  storagePath: string;
  contentHash: string;
  creatorUid: string;
  creatorName: string;
}

interface DisplayMessageItem {
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

interface MobileChatModalProps {
  visible: boolean;
  onClose: () => void;
  mode: 'online' | 'single_phone';
  language: Language;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: Record<string, any>;
  roomCode?: string;
  myUid: string;
  myName: string;
  memberIds: string[];
  singlePlayers?: SinglePhonePlayer[];
  spSenderId?: string;
  onChangeSpSender?: (id: string) => void;
  onlineMessages: RoomChatMessage[];
  onlineMyStickers: PersonalSticker[];
  spState: SinglePhoneChatStoreState;
  onUpdateSpState: (updater: (prev: SinglePhoneChatStoreState) => SinglePhoneChatStoreState) => void;
  onHapticTap: () => void;
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
  onlineMyStickers,
  spState,
  onUpdateSpState,
  onHapticTap,
}) => {
  const isSinglePhone = mode === 'single_phone';
  const isRTL = language === 'ar';
  const dirText = { writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const) };

  const [activeTab, setActiveTab] = useState<ChatTab>('messages');
  const [selectedEmojiCat, setSelectedEmojiCat] = useState<EmojiCategoryId>('smileys');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [inspectItem, setInspectItem] = useState<InspectStickerItem | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    loadRecentEmojis().then(setRecentEmojis);
  }, []);

  const currentActor = useMemo(() => {
    if (isSinglePhone) {
      const found =
        singlePlayers.find((p) => p.id === spSenderId) ?? singlePlayers[0];
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

  const myStickers: PersonalSticker[] = useMemo(() => {
    if (isSinglePhone) {
      return spState.stickersByPlayer[currentActor.uid] ?? [];
    }
    return onlineMyStickers;
  }, [isSinglePhone, spState.stickersByPlayer, currentActor.uid, onlineMyStickers]);

  const displayMessages: DisplayMessageItem[] = useMemo(() => {
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

  const roomOtherStickers = useMemo(() => {
    const seen = new Set<string>();
    const list: InspectStickerItem[] = [];
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
        list.push({
          stickerId: m.stickerId,
          imageUrl: m.stickerUrl,
          storagePath:
            m.stickerStoragePath ||
            `stickers/${m.stickerCreatorId || m.senderId}/${m.stickerId}`,
          contentHash: m.stickerContentHash || m.stickerId,
          creatorUid: m.stickerCreatorId || m.senderId,
          creatorName: m.stickerCreatorName || m.senderName,
        });
      }
    }
    return list;
  }, [displayMessages, currentActor.uid]);

  useEffect(() => {
    if (visible && activeTab === 'messages') {
      const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      return () => clearTimeout(id);
    }
  }, [visible, activeTab, displayMessages.length]);

  const showTimedFeedback = (type: 'error' | 'info' | 'success', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const isStickerSaved = (stickerId: string, contentHash?: string): boolean => {
    return myStickers.some(
      (s) => s.stickerId === stickerId || (contentHash ? s.contentHash === contentHash : false)
    );
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
    onHapticTap();
    setSending(true);
    setDraft('');
    try {
      if (isSinglePhone) {
        onUpdateSpState((prev) => {
          const next = appendSinglePhoneTextMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            clean
          );
          void persistSinglePhoneChatState(next);
          return next;
        });
      } else if (roomCode) {
        await sendRoomChatMessage(roomCode, currentActor.name, clean, memberIds);
      }
      setActiveTab('messages');
    } finally {
      setSending(false);
    }
  };

  const handlePickStickerFromGallery = async () => {
    if (uploading) return;
    onHapticTap();
    setFeedback(null);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showTimedFeedback('error', t.stickerGalleryPermissionDenied);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      setUploading(true);
      const compressed = await compressMobileStickerAsset({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
      });

      if (isSinglePhone) {
        const res = addPersonalStickerToSinglePhoneState(spState, {
          playerId: currentActor.uid,
          playerName: currentActor.name,
          dataUrl: compressed.dataUrl,
          contentHash: compressed.contentHash,
        });
        if (res.status === 'added') {
          onUpdateSpState(() => res.nextState);
          void persistSinglePhoneChatState(res.nextState);
        }
        showTimedFeedback(
          res.status === 'already_exists' ? 'info' : 'success',
          res.status === 'already_exists' ? t.stickerAlreadySavedBadge : t.stickerSavedBadge
        );
      } else {
        const res = await uploadPersonalSticker({
          uri: compressed.uri,
          mimeType: compressed.mimeType,
          extension: compressed.extension,
          contentHash: compressed.contentHash,
          creatorName: currentActor.name,
        });
        showTimedFeedback(
          res.status === 'already_exists' ? 'info' : 'success',
          res.status === 'already_exists' ? t.stickerAlreadySavedBadge : t.stickerSavedBadge
        );
      }
    } catch (err) {
      if (err instanceof StickerImageError) {
        if (err.code === 'UNSUPPORTED_FORMAT') showTimedFeedback('error', t.stickerFormatError);
        else if (err.code === 'FILE_TOO_LARGE') showTimedFeedback('error', t.stickerTooLargeError);
        else showTimedFeedback('error', t.stickerUploadError);
      } else if (err instanceof Error && err.message === 'STICKER_STORAGE_UNAVAILABLE') {
        showTimedFeedback('error', t.stickerStorageUnavailable);
      } else {
        showTimedFeedback('error', t.stickerUploadError);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSendSticker = async (sticker: PersonalSticker) => {
    if (sending) return;
    onHapticTap();
    setSending(true);
    try {
      if (isSinglePhone) {
        onUpdateSpState((prev) => {
          const next = appendSinglePhoneStickerMessage(
            prev,
            currentActor.uid,
            currentActor.name,
            sticker
          );
          void persistSinglePhoneChatState(next);
          return next;
        });
      } else if (roomCode) {
        await sendRoomStickerMessage(roomCode, currentActor.name, sticker, memberIds);
      }
      setInspectItem(null);
      setActiveTab('messages');
    } catch {
      showTimedFeedback('error', t.stickerUploadError);
    } finally {
      setSending(false);
    }
  };

  const handleSaveOtherSticker = async (item: InspectStickerItem) => {
    if (savingId) return;
    if (isStickerSaved(item.stickerId, item.contentHash)) {
      showTimedFeedback('info', t.stickerAlreadySavedBadge);
      return;
    }
    onHapticTap();
    setSavingId(item.stickerId);
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
          onUpdateSpState(() => res.nextState);
          void persistSinglePhoneChatState(res.nextState);
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
      setSavingId(null);
    }
  };

  const handleDeleteSticker = async (stickerId: string) => {
    onHapticTap();
    if (isSinglePhone) {
      onUpdateSpState((prev) => {
        const next = deleteSinglePhoneStickerFromState(prev, currentActor.uid, stickerId);
        void persistSinglePhoneChatState(next);
        return next;
      });
    } else {
      await deletePersonalSticker(stickerId);
    }
    setInspectItem(null);
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
            <Text style={[styles.title, dirText]}>
              {isSinglePhone ? t.offlineChatTitle : t.chatTitle}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setInspectItem(null);
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

          {/* 3 Clear Tabs: Messages | Stickers | Emojis */}
          <View style={styles.tabRow}>
            {(
              [
                { id: 'messages', label: t.chatTabMessages },
                {
                  id: 'stickers',
                  label:
                    myStickers.length > 0
                      ? `${t.chatTabStickers} (${myStickers.length})`
                      : t.chatTabStickers,
                },
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
            <ScrollView ref={scrollRef} style={styles.bodyScroll}>
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
                  const emojiOnly = m.messageType !== 'sticker' && isEmojiOnlyMessage(m.text);

                  return (
                    <View
                      key={m.id}
                      style={[
                        styles.bubbleWrap,
                        { alignItems: isMe ? 'flex-end' : 'flex-start' },
                      ]}
                    >
                      <Text style={styles.msgMeta}>
                        {m.senderName} · {timeStr}
                      </Text>

                      {m.messageType === 'sticker' && m.stickerUrl ? (
                        <TouchableOpacity
                          onPress={() => {
                            onHapticTap();
                            setInspectItem({
                              stickerId: m.stickerId || m.id,
                              imageUrl: m.stickerUrl!,
                              storagePath:
                                m.stickerStoragePath ||
                                `stickers/${m.stickerCreatorId || m.senderId}/${m.stickerId || m.id}`,
                              contentHash: m.stickerContentHash || m.stickerId || m.id,
                              creatorUid: m.stickerCreatorId || m.senderId,
                              creatorName: m.stickerCreatorName || m.senderName,
                            });
                          }}
                          style={styles.stickerMsgCard}
                        >
                          <Image
                            source={{ uri: m.stickerUrl }}
                            style={styles.stickerMsgImg}
                            resizeMode="contain"
                          />
                          <View style={styles.stickerMsgFooter}>
                            <Text style={styles.stickerCreatorLabel} numberOfLines={1}>
                              {t.stickerCreatedBy} {m.stickerCreatorName || m.senderName}
                            </Text>
                            {!isMe && (
                              <Text style={styles.stickerQuickPlus}>
                                {isStickerSaved(m.stickerId || m.id, m.stickerContentHash)
                                  ? '✓'
                                  : '+'}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ) : emojiOnly ? (
                        <Text style={styles.largeEmojiMsg}>{m.text}</Text>
                      ) : (
                        <View
                          style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleOther,
                          ]}
                        >
                          <Text style={isMe ? styles.bubbleTextMe : styles.bubbleTextOther}>
                            {m.text}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* TAB 2: STICKERS */}
          {activeTab === 'stickers' && (
            <ScrollView style={styles.bodyScroll}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, dirText]}>{t.myStickersTitle}</Text>
                  <Text style={[styles.sectionHint, dirText]}>{t.tapStickerToSaveHint}</Text>
                </View>
                <TouchableOpacity
                  disabled={uploading}
                  onPress={() => void handlePickStickerFromGallery()}
                  style={[styles.addStickerBtn, uploading && styles.disabledBtn]}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FBF7F0" />
                  ) : (
                    <Text style={styles.addStickerBtnText}>+ {t.addStickerBtn}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {myStickers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, dirText]}>{t.noMyStickersYet}</Text>
                </View>
              ) : (
                <View style={styles.stickerGrid}>
                  {myStickers.map((stk) => (
                    <View key={stk.stickerId} style={styles.stickerCell}>
                      <TouchableOpacity
                        onPress={() => void handleSendSticker(stk)}
                        style={styles.stickerCellImgWrap}
                      >
                        <Image
                          source={{ uri: stk.imageUrl }}
                          style={styles.stickerCellImg}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <View style={styles.stickerCellMetaRow}>
                        <Text style={styles.stickerCellCreator} numberOfLines={1}>
                          {stk.creatorName}
                        </Text>
                        <TouchableOpacity
                          onPress={() => void handleDeleteSticker(stk.stickerId)}
                          style={styles.trashBtn}
                        >
                          <Text style={styles.trashBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Room Stickers from Other Players */}
              <View style={styles.roomStickersDivider}>
                <Text style={[styles.sectionTitle, dirText]}>{t.roomStickersTitle}</Text>
                {roomOtherStickers.length === 0 ? (
                  <Text style={[styles.sectionHint, { marginTop: 6 }, dirText]}>
                    {t.noRoomStickersYet}
                  </Text>
                ) : (
                  <View style={[styles.stickerGrid, { marginTop: 10 }]}>
                    {roomOtherStickers.map((item) => {
                      const saved = isStickerSaved(item.stickerId, item.contentHash);
                      return (
                        <View key={item.stickerId} style={styles.stickerCell}>
                          <TouchableOpacity
                            onPress={() => setInspectItem(item)}
                            style={styles.stickerCellImgWrap}
                          >
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.stickerCellImg}
                              resizeMode="contain"
                            />
                          </TouchableOpacity>
                          <Text style={styles.stickerCellCreator} numberOfLines={1}>
                            {item.creatorName}
                          </Text>
                          <TouchableOpacity
                            disabled={saved || savingId === item.stickerId}
                            onPress={() => void handleSaveOtherSticker(item)}
                            style={[
                              styles.saveMiniBtn,
                              saved && styles.saveMiniBtnDone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.saveMiniBtnText,
                                saved && styles.saveMiniBtnTextDone,
                              ]}
                              numberOfLines={1}
                            >
                              {saved ? t.stickerAlreadySavedBadge : t.addToMyStickersBtn}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          )}

          {/* TAB 3: EMOJIS */}
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

          {/* Tap Sticker Detail / Save Overlay */}
          {inspectItem && (
            <View style={styles.inspectBackdrop}>
              <View style={styles.inspectCard}>
                <View style={styles.inspectImgBox}>
                  <Image
                    source={{ uri: inspectItem.imageUrl }}
                    style={styles.inspectImg}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.inspectCreator}>
                  {t.stickerCreatedBy}: {inspectItem.creatorName}
                </Text>

                {isStickerSaved(inspectItem.stickerId, inspectItem.contentHash) ? (
                  <View style={styles.savedBadgeBox}>
                    <Text style={styles.savedBadgeText}>{t.stickerAlreadySavedBadge}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    disabled={savingId === inspectItem.stickerId}
                    onPress={() => void handleSaveOtherSticker(inspectItem)}
                    style={styles.saveFullBtn}
                  >
                    <Text style={styles.saveFullBtnText}>{t.addToMyStickersBtn}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setInspectItem(null)}
                  style={styles.inspectCloseBtn}
                >
                  <Text style={styles.inspectCloseText}>{t.close}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Input Bar + Emoji Button */}
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
              placeholder={t.chatPlaceholder}
              placeholderTextColor="#9C8D7E"
              style={[styles.input, dirText]}
            />

            <TouchableOpacity
              disabled={!draft.trim() || sending}
              onPress={() => void handleSendText()}
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.disabledBtn]}
            >
              <Text style={styles.sendBtnText}>{t.sendMsgBtn}</Text>
            </TouchableOpacity>
          </View>
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
    height: '86%',
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
  bubbleWrap: { marginBottom: 10, gap: 3 },
  msgMeta: { fontSize: 11, color: '#7A6A5B', fontWeight: '600' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMe: { backgroundColor: '#231A15' },
  bubbleOther: { backgroundColor: '#EFE6D6', borderWidth: 1, borderColor: '#DDD2C0' },
  bubbleTextMe: { color: '#FBF7F0', fontSize: 14, lineHeight: 20 },
  bubbleTextOther: { color: '#231A15', fontSize: 14, lineHeight: 20 },
  largeEmojiMsg: { fontSize: 36, lineHeight: 44, paddingVertical: 2 },
  stickerMsgCard: {
    borderRadius: 16,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    padding: 6,
    width: 148,
  },
  stickerMsgImg: { width: 134, height: 134, borderRadius: 12 },
  stickerMsgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  stickerCreatorLabel: { fontSize: 10, fontWeight: '700', color: '#7A6A5B', flex: 1 },
  stickerQuickPlus: { fontSize: 12, fontWeight: '900', color: '#8B5E3C', marginStart: 6 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#231A15' },
  sectionHint: { fontSize: 11, fontWeight: '600', color: '#7A6A5B' },
  addStickerBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStickerBtnText: { color: '#FBF7F0', fontSize: 12, fontWeight: '800' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickerCell: {
    width: '31%',
    borderRadius: 14,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    padding: 6,
    alignItems: 'center',
    gap: 4,
  },
  stickerCellImgWrap: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  stickerCellImg: { width: '100%', height: '100%', borderRadius: 10 },
  stickerCellMetaRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stickerCellCreator: { fontSize: 10, fontWeight: '700', color: '#7A6A5B', flex: 1 },
  trashBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  trashBtnText: { fontSize: 11, fontWeight: '800', color: '#9B3B30' },
  roomStickersDivider: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E8DEC8',
  },
  saveMiniBtn: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
  },
  saveMiniBtnDone: { backgroundColor: '#EEF3EC' },
  saveMiniBtnText: { fontSize: 10, fontWeight: '800', color: '#231A15' },
  saveMiniBtnTextDone: { color: '#355432' },
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
  inspectBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(35,26,21,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  inspectCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 22,
    backgroundColor: '#FFFDF9',
    borderWidth: 2,
    borderColor: '#D5C7B2',
    padding: 18,
    alignItems: 'center',
    gap: 12,
  },
  inspectImgBox: {
    width: 140,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#E8DEC8',
    padding: 8,
  },
  inspectImg: { width: '100%', height: '100%' },
  inspectCreator: { fontSize: 12, fontWeight: '800', color: '#8B5E3C' },
  savedBadgeBox: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#EEF3EC',
    borderWidth: 1,
    borderColor: '#B9CEB3',
    alignItems: 'center',
  },
  savedBadgeText: { fontSize: 12, fontWeight: '800', color: '#355432' },
  saveFullBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  saveFullBtnText: { color: '#FBF7F0', fontSize: 13, fontWeight: '800' },
  inspectCloseBtn: {
    width: '100%',
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectCloseText: { color: '#231A15', fontSize: 12, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8DEC8',
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
  sendBtnText: { color: '#FBF7F0', fontSize: 13, fontWeight: '800' },
  disabledBtn: { opacity: 0.45 },
});
