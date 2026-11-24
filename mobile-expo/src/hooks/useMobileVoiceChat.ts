import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  deleteVoiceSignal,
  sendVoiceSignal,
  setPlayerVoiceState,
  subscribeToVoiceSignals,
  type RoomPlayerDoc,
  type VoiceSignalDoc,
} from '../services/multiplayerService';

export type VoiceErrorType = '' | 'permission_denied' | 'not_supported' | 'no_mic_device';

interface RNWebRTCTrack {
  enabled: boolean;
  onunmute?: (() => void) | null;
  _setVolume?: (volume: number) => void;
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
  ontrack: ((evt: { track?: RNWebRTCTrack; streams?: RNWebRTCStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack: (track: RNWebRTCTrack, stream: RNWebRTCStream) => void;
  addTransceiver?: (kind: string, init?: { direction?: string }) => void;
  createOffer: (options?: unknown) => Promise<unknown>;
  createAnswer: (options?: unknown) => Promise<unknown>;
  setLocalDescription: (desc: unknown) => Promise<void>;
  setRemoteDescription: (desc: unknown) => Promise<void>;
  addIceCandidate: (cand: unknown) => Promise<void>;
  restartIce?: () => void;
  getStats: () => Promise<Map<string, Record<string, unknown>> | Iterable<[string, Record<string, unknown>]>>;
  close: () => void;
}

interface RNWebRTCModule {
  RTCPeerConnection: new (config: { iceServers: Array<{ urls: string }> }) => RNWebRTCPeer;
  RTCSessionDescription: new (desc: unknown) => unknown;
  RTCIceCandidate: new (cand: unknown) => unknown;
  MediaStream?: new (tracks?: RNWebRTCTrack[]) => RNWebRTCStream;
  registerGlobals?: () => void;
  mediaDevices: {
    getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<RNWebRTCStream>;
  };
}

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

function loadWebRTC(): RNWebRTCModule | null {
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      typeof RTCPeerConnection !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    ) {
      return {
        RTCPeerConnection: RTCPeerConnection as unknown as RNWebRTCModule['RTCPeerConnection'],
        RTCSessionDescription: RTCSessionDescription as unknown as RNWebRTCModule['RTCSessionDescription'],
        RTCIceCandidate: RTCIceCandidate as unknown as RNWebRTCModule['RTCIceCandidate'],
        MediaStream: MediaStream as unknown as RNWebRTCModule['MediaStream'],
        mediaDevices: navigator.mediaDevices as unknown as RNWebRTCModule['mediaDevices'],
      };
    }
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webrtc') as Partial<RNWebRTCModule> | null;
    if (mod && mod.RTCPeerConnection && mod.mediaDevices?.getUserMedia) {
      try {
        mod.registerGlobals?.();
      } catch {
        // ignore if globals already registered
      }
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
  const remoteStreamsRef = useRef<Map<string, RNWebRTCStream>>(new Map());
  const webAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peersRef = useRef<Map<string, RNWebRTCPeer>>(new Map());
  const pendingIceRef = useRef<Map<string, unknown[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const joinTimestampMsRef = useRef<number>(0);
  const voiceJoinedRef = useRef(false);
  const micMutedRef = useRef(false);

  voiceJoinedRef.current = voiceJoined;
  micMutedRef.current = micMuted;

  const configureSpeakerVoiceAudioMode = useCallback(async (inCall: boolean) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: inCall,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: !inCall,
        staysActiveInBackground: false,
      });
    } catch {
      // Ignore on unsupported web/simulator environments
    }
  }, []);

  const closePeer = useCallback((peerUid: string) => {
    makingOfferRef.current.delete(peerUid);
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
    remoteStreamsRef.current.delete(peerUid);
    const webAudio = webAudioElsRef.current.get(peerUid);
    if (webAudio) {
      try {
        webAudio.pause();
        webAudio.srcObject = null;
        webAudio.remove();
      } catch {
        // ignore
      }
      webAudioElsRef.current.delete(peerUid);
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
      if (existing && existing.connectionState !== 'closed') return existing;
      if (existing) closePeer(peerUid);

      const mod = webrtcRef.current;
      if (!mod) return null;

      const pc = new mod.RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      } else {
        try {
          pc.addTransceiver?.('audio', { direction: 'recvonly' });
        } catch {
          // ignore
        }
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate && roomCode) {
          const payload = evt.candidate.toJSON ? evt.candidate.toJSON() : evt.candidate;
          void sendVoiceSignal(roomCode, peerUid, 'ice', JSON.stringify(payload));
        }
      };

      pc.ontrack = (evt) => {
        const track = evt.track;
        let remoteStream = evt.streams?.[0];
        if (!remoteStream && track && mod.MediaStream) {
          try {
            remoteStream = new mod.MediaStream([track]);
          } catch {
            // ignore
          }
        }
        if (remoteStream) {
          remoteStreamsRef.current.set(peerUid, remoteStream);
        }
        if (track) {
          track.enabled = true;
          try {
            track._setVolume?.(1.5);
          } catch {
            // ignore
          }
          track.onunmute = () => {
            track.enabled = true;
            try {
              track._setVolume?.(1.5);
            } catch {
              // ignore
            }
          };
        }

        if (Platform.OS === 'web' && remoteStream && typeof document !== 'undefined') {
          let audio = webAudioElsRef.current.get(peerUid);
          if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.muted = false;
            audio.volume = 1;
            audio.setAttribute('playsinline', 'true');
            audio.style.display = 'none';
            document.body.appendChild(audio);
            webAudioElsRef.current.set(peerUid, audio);
          }
          audio.srcObject = remoteStream as unknown as MediaStream;
          audio.play().catch(() => {});
        }
      };

      let iceRestartAttempted = false;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          if (!iceRestartAttempted && typeof pc.restartIce === 'function') {
            iceRestartAttempted = true;
            try {
              pc.restartIce();
              return;
            } catch {
              // fall through
            }
          }
          closePeer(peerUid);
        } else if (pc.connectionState === 'closed') {
          closePeer(peerUid);
        }
      };

      return pc;
    },
    [closePeer, roomCode]
  );

  const sendOfferToPeer = useCallback(
    async (peerUid: string, pc: RNWebRTCPeer) => {
      if (!roomCode || makingOfferRef.current.has(peerUid)) return;
      makingOfferRef.current.add(peerUid);
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          const payload = pc.localDescription.toJSON
            ? pc.localDescription.toJSON()
            : pc.localDescription;
          await sendVoiceSignal(roomCode, peerUid, 'offer', JSON.stringify(payload));
        }
      } catch {
        // ignore transient offer error; reconciliation loop retries
      } finally {
        makingOfferRef.current.delete(peerUid);
      }
    },
    [roomCode]
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
    await configureSpeakerVoiceAudioMode(false);
    if (roomCode) {
      await setPlayerVoiceState(roomCode, false, false);
    }
  }, [closePeer, configureSpeakerVoiceAudioMode, roomCode]);

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

    await configureSpeakerVoiceAudioMode(true);
    joinTimestampMsRef.current = Date.now();
    handledSignalsRef.current.clear();

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
    } catch (err: unknown) {
      await configureSpeakerVoiceAudioMode(false);
      const errName = (err as { name?: string })?.name ?? '';
      const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.includes('permission') ||
        errMsg.includes('denied')
      ) {
        setVoiceError('permission_denied');
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.includes('not found') ||
        errMsg.includes('no audio')
      ) {
        setVoiceError('no_mic_device');
      } else {
        setVoiceError('not_supported');
      }
    }
  }, [configureSpeakerVoiceAudioMode, myUid, roomCode]);

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

  // Mesh maintenance + 3-second recovery check
  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const reconcileMesh = () => {
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
          if (pc) {
            void sendOfferToPeer(peerUid, pc);
          }
        }
      }
    };

    reconcileMesh();
    const timer = setInterval(reconcileMesh, 3000);
    return () => clearInterval(timer);
  }, [closePeer, createPeerConnection, myUid, playerOrder, players, roomCode, sendOfferToPeer, voiceJoined]);

  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const handleSignals = async (signals: VoiceSignalDoc[]) => {
      const mod = webrtcRef.current;
      if (!mod) return;

      for (const sig of signals) {
        if (handledSignalsRef.current.has(sig.id)) continue;
        handledSignalsRef.current.add(sig.id);

        const sigMs = sig.createdAt?.toMillis?.();
        if (sigMs && joinTimestampMsRef.current && sigMs < joinTimestampMsRef.current - 12000) {
          void deleteVoiceSignal(roomCode, sig.id);
          continue;
        }

        const peerUid = sig.fromUid;
        const polite = myUid > peerUid;

        try {
          if (sig.type === 'offer') {
            const pc = createPeerConnection(peerUid);
            if (!pc) continue;
            const desc = JSON.parse(sig.payload);
            const offerCollision = makingOfferRef.current.has(peerUid) || pc.signalingState !== 'stable';
            if (offerCollision && !polite) {
              continue;
            }
            if (offerCollision && polite) {
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch {
                // fallback if rollback is unsupported by native wrapper
              }
            }
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
              if (report.type === 'inbound-rtp' && report.kind === 'audio' && level > 0.008) {
                if (!players[peerUid]?.micMuted) next[peerUid] = true;
              }
              if (report.type === 'media-source' && report.kind === 'audio' && level > 0.008) {
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
      void configureSpeakerVoiceAudioMode(false);
    };
  }, [closePeer, configureSpeakerVoiceAudioMode]);

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
