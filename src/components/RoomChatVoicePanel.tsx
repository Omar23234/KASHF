import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import {
  sendRoomChatMessage,
  subscribeToRoomMessages,
} from '../firebase/multiplayerService';
import type { RoomChatMessage, RoomPlayerDoc } from '../types/game';
import type { VoiceErrorType } from '../hooks/useWebRTCVoiceChat';

interface RoomChatVoiceBarProps {
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

export const RoomChatVoicePanel: React.FC<RoomChatVoiceBarProps> = ({
  roomCode,
  myUid,
  myName,
  memberIds,
  players,
  voiceJoined,
  micMuted,
  voiceError,
  speakingUids,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
}) => {
  const { language, t } = useApp();
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const seenCountRef = useRef<number>(0);
  const chatOpenRef = useRef(chatOpen);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  chatOpenRef.current = chatOpen;

  useEffect(() => {
    if (!roomCode || !myUid) return;
    const unsub = subscribeToRoomMessages(roomCode, myUid, (msgs) => {
      setMessages(msgs);
      if (chatOpenRef.current) {
        seenCountRef.current = msgs.length;
        setUnreadCount(0);
      } else {
        const diff = Math.max(0, msgs.length - seenCountRef.current);
        if (diff > 0) {
          const newOthers = msgs
            .slice(seenCountRef.current)
            .filter((m) => m.senderId !== myUid).length;
          if (newOthers > 0) {
            setUnreadCount((prev) => prev + newOthers);
          }
          seenCountRef.current = msgs.length;
        }
      }
    });
    return () => unsub();
  }, [myUid, roomCode]);

  useEffect(() => {
    if (chatOpen) {
      seenCountRef.current = messages.length;
      setUnreadCount(0);
      scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatOpen, messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await sendRoomChatMessage(roomCode, myName, text, memberIds);
    } finally {
      setSending(false);
    }
  };

  const voiceParticipantsCount = memberIds.filter((id) => players[id]?.voiceJoined).length;

  return (
    <>
      <div className="rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-[0_6px_18px_-12px_rgba(35,26,21,0.1)]">
        {/* Voice Chat Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#5E4F43] me-1">
            <Radio className={`w-4 h-4 ${voiceJoined ? 'text-[#4A6B46]' : 'text-[#8B5E3C]'}`} />
            <span>{t.voiceChatTitle}</span>
            {voiceParticipantsCount > 0 && (
              <span className="font-mono-tabular text-[11px] font-extrabold text-[#4A6B46]">
                ({voiceParticipantsCount})
              </span>
            )}
          </div>

          {!voiceJoined ? (
            <button
              type="button"
              onClick={onJoinVoice}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#EEF3EC] hover:bg-[#E1EBDD] border border-[#B9CEB3] text-[#355432] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{t.joinVoiceBtn}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  micMuted
                    ? 'bg-[#F9EAE6] border-[#C88172] text-[#9B3B30]'
                    : speakingUids[myUid]
                      ? 'bg-[#355432] border-[#355432] text-[#FBF7F0] shadow-xs'
                      : 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                }`}
              >
                {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{micMuted ? t.unmuteMicBtn : t.muteMicBtn}</span>
              </button>

              <button
                type="button"
                onClick={onLeaveVoice}
                className="min-h-[38px] px-3 rounded-xl bg-[#EFE6D6] hover:bg-[#F9EAE6] border border-[#D5C7B2] hover:border-[#C88172] text-[#5E4F43] hover:text-[#9B3B30] text-xs font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>{t.leaveVoiceBtn}</span>
              </button>
            </>
          )}
        </div>

        {/* Text Chat Toggle Button with Unread Badge */}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="relative min-h-[38px] px-3.5 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#8B5E3C]" />
          <span>{t.chatTitle}</span>
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#9B3B30] text-[#FFFDF9] font-mono-tabular text-[10px] font-extrabold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {voiceError && (
          <p className="w-full text-xs text-[#9B3B30] font-bold pt-1">
            {voiceError === 'permission_denied' ? t.voicePermissionDenied : t.voiceNotSupported}
          </p>
        )}
      </div>

      {/* Collapsible Text Chat Modal / Drawer */}
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
              className="w-full sm:max-w-lg h-[78vh] sm:h-[560px] rounded-t-3xl sm:rounded-3xl bg-[#FFFDF9] border border-[#D5C7B2] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="px-5 py-4 border-b border-[#E8DEC8] bg-[#F6EFE3] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#8B5E3C]" />
                  <h3 className="text-base font-extrabold text-[#231A15]">{t.chatTitle}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="p-2 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] text-[#5E4F43] hover:text-[#231A15] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBF7F0]">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-[#7A6A5B] py-12">{t.noMessagesYet}</p>
                ) : (
                  messages.map((m) => {
                    const isMe = m.senderId === myUid;
                    const timeStr = m.createdAt?.toDate
                      ? m.createdAt.toDate().toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '...';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-[#7A6A5B] mb-1 px-1">
                          <span className="font-bold text-[#5E4F43]">{m.senderName}</span>
                          <span>{timeStr}</span>
                        </div>
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                            isMe
                              ? 'bg-[#231A15] text-[#FBF7F0] rounded-te-sm'
                              : 'bg-[#EFE6D6] border border-[#DDD2C0] text-[#231A15] rounded-ts-sm'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={scrollBottomRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="p-3 border-t border-[#E8DEC8] bg-[#F6EFE3] flex items-center gap-2"
              >
                <input
                  type="text"
                  maxLength={500}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t.chatPlaceholder}
                  className="flex-1 min-h-[44px] px-4 rounded-2xl bg-[#FFFDF9] border border-[#D5C7B2] text-sm text-[#231A15] placeholder:text-[#9C8D7E] focus:outline-none focus:border-[#8B5E3C]"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="min-h-[44px] px-4 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
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
