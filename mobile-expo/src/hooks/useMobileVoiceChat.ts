import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  deleteVoiceSignal,
  sendVoiceSignal,
  setPlayerVoiceState,
  subscribeToVoiceSignals,
  type RoomPlayerDoc,
  type VoiceSignalDoc,
} from '../services/multiplayerService';

export type VoiceErrorType = '' | 'permission_denied' | 'not_supported';

interface RNWebRTCTrack {
  enabled: boolean;
  stop: () => void;
}

interface RNWebRTCStream {
  getAudioTracks: () => RNWebRTCTrack[];
  getTracks: () => RNWebRTCTrack[];
}

interface RNWebRTCPeer {
  localDescription: { toJSON?: () => unknown } | null;
  remoteDescription: unknown;
  signalingState: string;
  connectionState?: string;
  onicecandidate: ((evt: { candidate?: { toJSON?: () => unknown } | null }) => void) | null;
  ontrack: ((evt: unknown) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack: (track: RNWebRTCTrack, stream: RNWebRTCStream) => void;
  createOffer: (options?: unknown) => Promise<unknown>;
  createAnswer: (options?: unknown) => Promise<unknown>;
  setLocalDescription: (desc: unknown) => Promise<void>;
  setRemoteDescription: (desc: unknown) => Promise<void>;
  addIceCandidate: (cand: unknown) => Promise<void>;
  getStats: () => Promise<Map<string, Record<string, unknown>> | Iterable<[string, Record<string, unknown>]>>;
  close: () => void;
}

interface RNWebRTCModule {
  RTCPeerConnection: new (config: { iceServers: Array<{ urls: string }> }) => RNWebRTCPeer;
  RTCSessionDescription: new (desc: unknown) => unknown;
  RTCIceCandidate: new (cand: unknown) => unknown;
  mediaDevices: {
    getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<RNWebRTCStream>;
  };
}

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

function loadWebRTC(): RNWebRTCModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webrtc') as Partial<RNWebRTCModule> | null;
    if (mod && mod.RTCPeerConnection && mod.mediaDevices?.getUserMedia) {
      return mod as RNWebRTCModule;
    }
    return null;
  } catch {
    return null;
  }
}

export function useMobileVoiceChat(params: {
  roomCode: string | null;
  myUid: string;
  players: Record<string, RoomPlayerDoc>;
  playerOrder: string[];
}) {
  const { roomCode, myUid, players, playerOrder } = params;
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<VoiceErrorType>('');
  const [speakingUids, setSpeakingUids] = useState<Record<string, boolean>>({});

  const webrtcRef = useRef<RNWebRTCModule | null>(null);
  const localStreamRef = useRef<RNWebRTCStream | null>(null);
  const peersRef = useRef<Map<string, RNWebRTCPeer>>(new Map());
  const pendingIceRef = useRef<Map<string, unknown[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const voiceJoinedRef = useRef(false);
  const micMutedRef = useRef(false);

  voiceJoinedRef.current = voiceJoined;
  micMutedRef.current = micMuted;

  const closePeer = useCallback((peerUid: string) => {
    const pc = peersRef.current.get(peerUid);
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
      peersRef.current.delete(peerUid);
    }
    pendingIceRef.current.delete(peerUid);
    setSpeakingUids((prev) => {
      if (!prev[peerUid]) return prev;
      const next = { ...prev };
      delete next[peerUid];
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (peerUid: string): RNWebRTCPeer | null => {
      const existing = peersRef.current.get(peerUid);
      if (existing) return existing;
      const mod = webrtcRef.current;
      if (!mod) return null;

      const pc = new mod.RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate && roomCode) {
          const payload = evt.candidate.toJSON ? evt.candidate.toJSON() : evt.candidate;
          void sendVoiceSignal(roomCode, peerUid, 'ice', JSON.stringify(payload));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(peerUid);
        }
      };

      return pc;
    },
    [closePeer, roomCode]
  );

  const leaveVoice = useCallback(async () => {
    setVoiceJoined(false);
    setMicMuted(false);
    voiceJoinedRef.current = false;
    micMutedRef.current = false;
    setSpeakingUids({});

    for (const peerUid of Array.from(peersRef.current.keys())) {
      closePeer(peerUid);
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    if (roomCode) {
      await setPlayerVoiceState(roomCode, false, false);
    }
  }, [closePeer, roomCode]);

  const joinVoice = useCallback(async () => {
    if (!roomCode || !myUid) return;
    setVoiceError('');

    const mod = webrtcRef.current ?? loadWebRTC();
    if (!mod) {
      setVoiceError('not_supported');
      return;
    }
    webrtcRef.current = mod;

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setVoiceError('permission_denied');
        return;
      }
    }

    try {
      const stream = await mod.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      setMicMuted(false);
      setVoiceJoined(true);
      voiceJoinedRef.current = true;
      micMutedRef.current = false;
      await setPlayerVoiceState(roomCode, true, false);
    } catch {
      setVoiceError('not_supported');
    }
  }, [myUid, roomCode]);

  const toggleMute = useCallback(async () => {
    if (!voiceJoinedRef.current || !roomCode) return;
    const nextMuted = !micMutedRef.current;
    micMutedRef.current = nextMuted;
    setMicMuted(nextMuted);
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.enabled = !nextMuted;
      }
    }
    await setPlayerVoiceState(roomCode, true, nextMuted);
  }, [roomCode]);

  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const activePeers = new Set(
      playerOrder.filter((pid) => pid !== myUid && players[pid]?.voiceJoined)
    );

    for (const existingPeer of Array.from(peersRef.current.keys())) {
      if (!activePeers.has(existingPeer)) {
        closePeer(existingPeer);
      }
    }

    for (const peerUid of activePeers) {
      if (!peersRef.current.has(peerUid) && myUid < peerUid) {
        const pc = createPeerConnection(peerUid);
        if (!pc) continue;
        void (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.localDescription) {
              const payload = pc.localDescription.toJSON
                ? pc.localDescription.toJSON()
                : pc.localDescription;
              await sendVoiceSignal(roomCode, peerUid, 'offer', JSON.stringify(payload));
            }
          } catch {
            // ignore transient offer error
          }
        })();
      }
    }
  }, [closePeer, createPeerConnection, myUid, playerOrder, players, roomCode, voiceJoined]);

  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const handleSignals = async (signals: VoiceSignalDoc[]) => {
      const mod = webrtcRef.current;
      if (!mod) return;

      for (const sig of signals) {
        if (handledSignalsRef.current.has(sig.id)) continue;
        handledSignalsRef.current.add(sig.id);
        const peerUid = sig.fromUid;

        try {
          if (sig.type === 'offer') {
            const pc = createPeerConnection(peerUid);
            if (!pc) continue;
            const desc = JSON.parse(sig.payload);
            await pc.setRemoteDescription(new mod.RTCSessionDescription(desc));
            const queued = pendingIceRef.current.get(peerUid) ?? [];
            for (const cand of queued) {
              await pc.addIceCandidate(new mod.RTCIceCandidate(cand));
            }
            pendingIceRef.current.delete(peerUid);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              const payload = pc.localDescription.toJSON
                ? pc.localDescription.toJSON()
                : pc.localDescription;
              await sendVoiceSignal(roomCode, peerUid, 'answer', JSON.stringify(payload));
            }
          } else if (sig.type === 'answer') {
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.signalingState === 'have-local-offer') {
              const desc = JSON.parse(sig.payload);
              await pc.setRemoteDescription(new mod.RTCSessionDescription(desc));
              const queued = pendingIceRef.current.get(peerUid) ?? [];
              for (const cand of queued) {
                await pc.addIceCandidate(new mod.RTCIceCandidate(cand));
              }
              pendingIceRef.current.delete(peerUid);
            }
          } else if (sig.type === 'ice') {
            const cand = JSON.parse(sig.payload);
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new mod.RTCIceCandidate(cand));
            } else {
              const q = pendingIceRef.current.get(peerUid) ?? [];
              q.push(cand);
              pendingIceRef.current.set(peerUid, q);
            }
          }
        } catch {
          // ignore malformed/stale signal
        } finally {
          void deleteVoiceSignal(roomCode, sig.id);
        }
      }
    };

    const unsub = subscribeToVoiceSignals(roomCode, myUid, (sigs) => {
      void handleSignals(sigs);
    });
    return () => unsub();
  }, [createPeerConnection, myUid, roomCode, voiceJoined]);

  // Poll WebRTC peer stats for live speaking detection without Firestore writes
  useEffect(() => {
    if (!voiceJoined) return;
    const timer = setInterval(() => {
      void (async () => {
        const next: Record<string, boolean> = {};
        let anyLocalSpeaking = false;
        for (const [peerUid, pc] of peersRef.current.entries()) {
          try {
            const stats = await pc.getStats();
            const entries = Array.from(stats as Iterable<[string, Record<string, unknown>]>);
            for (const [, report] of entries) {
              const level = typeof report.audioLevel === 'number' ? report.audioLevel : 0;
              if (report.type === 'inbound-rtp' && report.kind === 'audio' && level > 0.02) {
                if (!players[peerUid]?.micMuted) next[peerUid] = true;
              }
              if (report.type === 'media-source' && report.kind === 'audio' && level > 0.02) {
                if (!micMutedRef.current) anyLocalSpeaking = true;
              }
            }
          } catch {
            // ignore stats error
          }
        }
        if (myUid && anyLocalSpeaking) {
          next[myUid] = true;
        }
        setSpeakingUids(next);
      })();
    }, 300);

    return () => clearInterval(timer);
  }, [myUid, players, voiceJoined]);

  useEffect(() => {
    return () => {
      for (const peerUid of Array.from(peersRef.current.keys())) {
        closePeer(peerUid);
      }
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) track.stop();
        localStreamRef.current = null;
      }
    };
  }, [closePeer]);

  return {
    voiceJoined,
    micMuted,
    voiceError,
    speakingUids,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
