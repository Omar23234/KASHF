import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  useWebRTCVoiceChat,
  type VoiceConnectionStatus,
  type VoiceErrorType,
} from '../hooks/useWebRTCVoiceChat';
import type { RoomPlayerDoc } from '../types/game';

export interface VoiceRoomMeta {
  roomCode: string | null;
  myUid: string;
  players: Record<string, RoomPlayerDoc>;
  playerOrder: string[];
}

export interface VoiceContextValue {
  voiceJoined: boolean;
  micMuted: boolean;
  voiceError: VoiceErrorType;
  voiceStatus: VoiceConnectionStatus;
  connectedPeersCount: number;
  localMicLevel: number;
  audioBlocked: boolean;
  speakingUids: Record<string, boolean>;
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  reconnectVoice: () => Promise<void>;
  unlockAudio: () => void;
  setVoiceRoomMeta: (meta: VoiceRoomMeta) => void;
  clearVoiceRoomMeta: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const EMPTY_META: VoiceRoomMeta = {
  roomCode: null,
  myUid: '',
  players: {},
  playerOrder: [],
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<VoiceRoomMeta>(EMPTY_META);

  const setVoiceRoomMeta = useCallback((next: VoiceRoomMeta) => {
    setMeta(next);
  }, []);

  const clearVoiceRoomMeta = useCallback(() => {
    setMeta(EMPTY_META);
  }, []);

  const voice = useWebRTCVoiceChat(meta);

  return (
    <VoiceContext.Provider
      value={{
        ...voice,
        setVoiceRoomMeta,
        clearVoiceRoomMeta,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoiceChat(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoiceChat must be used inside VoiceProvider');
  }
  return ctx;
}
