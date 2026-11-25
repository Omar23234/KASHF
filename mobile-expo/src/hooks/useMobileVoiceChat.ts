import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  clearMyVoiceSignals,
  deleteVoiceSignal,
  sendVoiceSignal,
  setPlayerVoiceState,
  subscribeToVoiceSignals,
  type RoomPlayerDoc,
  type VoiceSignalDoc,
} from '../services/multiplayerService';

export type VoiceErrorType = '' | 'permission_denied' | 'not_supported' | 'no_mic_device';

export type VoiceConnectionStatus =
  | 'idle'
  | 'joining'
  | 'waiting_peers'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

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
  iceConnectionState?: string;
  onicecandidate: ((evt: { candidate?: { candidate?: string; toJSON?: () => unknown } | null }) => void) | null;
  ontrack: ((evt: { track?: RNWebRTCTrack; streams?: RNWebRTCStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange?: (() => void) | null;
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
  RTCPeerConnection: new (config: {
    iceServers: Array<{ urls: string; username?: string; credential?: string }>;
    iceCandidatePoolSize?: number;
  }) => RNWebRTCPeer;
  RTCSessionDescription: new (desc: unknown) => unknown;
  RTCIceCandidate: new (cand: unknown) => unknown;
  MediaStream?: new (tracks?: RNWebRTCTrack[]) => RNWebRTCStream;
  registerGlobals?: () => void;
  mediaDevices: {
    getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<RNWebRTCStream>;
  };
}

function buildIceServers() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  const customUrl = process.env.EXPO_PUBLIC_TURN_URL?.trim();
  if (customUrl) {
    servers.unshift({
      urls: customUrl,
      username: process.env.EXPO_PUBLIC_TURN_USER?.trim() || undefined,
      credential: process.env.EXPO_PUBLIC_TURN_PASS?.trim() || undefined,
    });
  }
  return servers;
}

const RTC_CONFIG = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 4,
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceConnectionStatus>('idle');
  const [connectedPeersCount, setConnectedPeersCount] = useState(0);
  const [speakingUids, setSpeakingUids] = useState<Record<string, boolean>>({});

  const webrtcRef = useRef<RNWebRTCModule | null>(null);
  const localStreamRef = useRef<RNWebRTCStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, RNWebRTCStream>>(new Map());
  const webAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peersRef = useRef<Map<string, RNWebRTCPeer>>(new Map());
  const peerMissingSinceRef = useRef<Map<string, number>>(new Map());
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const failedPeersRef = useRef<Set<string>>(new Set());
  const pendingIceRef = useRef<Map<string, unknown[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const voiceJoinedRef = useRef(false);
  const micMutedRef = useRef(false);
  const playersRef = useRef(players);
  const playerOrderRef = useRef(playerOrder);

  voiceJoinedRef.current = voiceJoined;
  micMutedRef.current = micMuted;
  playersRef.current = players;
  playerOrderRef.current = playerOrder;

  const updateConnectionSummary = useCallback(() => {
    if (!voiceJoinedRef.current) {
      setConnectedPeersCount(0);
      setVoiceStatus('idle');
      return;
    }

    const activeVoicePeers = playerOrderRef.current.filter(
      (pid) => pid !== myUid && playersRef.current[pid]?.voiceJoined
    );
    if (activeVoicePeers.length === 0) {
      setConnectedPeersCount(0);
      setVoiceStatus('waiting_peers');
      return;
    }

    let connected = 0;
    let reconnecting = 0;
    let anyConnecting = false;
    let allFailed = true;

    for (const pid of activeVoicePeers) {
      const pc = peersRef.current.get(pid);
      if (!pc) {
        if (!failedPeersRef.current.has(pid)) {
          anyConnecting = true;
          allFailed = false;
        }
        continue;
      }
      const cState = pc.connectionState;
      const iState = pc.iceConnectionState;
      if (cState === 'connected' || iState === 'connected' || iState === 'completed') {
        connected += 1;
        allFailed = false;
        failedPeersRef.current.delete(pid);
      } else if (cState === 'disconnected' || iState === 'disconnected') {
        reconnecting += 1;
        allFailed = false;
      } else if (cState === 'failed' || iState === 'failed') {
        // handled via restart
      } else {
        anyConnecting = true;
        allFailed = false;
      }
    }

    setConnectedPeersCount(connected);
    if (connected > 0) {
      setVoiceStatus('connected');
    } else if (reconnecting > 0) {
      setVoiceStatus('reconnecting');
    } else if (anyConnecting) {
      setVoiceStatus('connecting');
    } else if (allFailed) {
      setVoiceStatus('failed');
    } else {
      setVoiceStatus('connecting');
    }
  }, [myUid]);

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

  const closePeer = useCallback(
    (peerUid: string) => {
      makingOfferRef.current.delete(peerUid);
      peerMissingSinceRef.current.delete(peerUid);
      const discTimer = disconnectTimersRef.current.get(peerUid);
      if (discTimer) {
        clearTimeout(discTimer);
        disconnectTimersRef.current.delete(peerUid);
      }
      const pc = peersRef.current.get(peerUid);
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
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
      updateConnectionSummary();
    },
    [updateConnectionSummary]
  );

  const sendOfferToPeer = useCallback(
    async (peerUid: string, pc: RNWebRTCPeer, iceRestart = false) => {
      if (!roomCode || makingOfferRef.current.has(peerUid)) return;
      makingOfferRef.current.add(peerUid);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          ...(iceRestart ? { iceRestart: true } : {}),
        });
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

  const createPeerConnection = useCallback(
    (peerUid: string): RNWebRTCPeer | null => {
      const existing = peersRef.current.get(peerUid);
      if (existing && existing.connectionState !== 'closed') return existing;
      if (existing) closePeer(peerUid);

      const mod = webrtcRef.current;
      if (!mod) return null;

      const pc = new mod.RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);
      peerMissingSinceRef.current.delete(peerUid);

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
          const candStr = (payload as { candidate?: string } | null)?.candidate;
          if (candStr !== '') {
            void sendVoiceSignal(roomCode, peerUid, 'ice', JSON.stringify(payload));
          }
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
      const handleStateChange = () => {
        const cState = pc.connectionState;
        const iState = pc.iceConnectionState;

        if (cState === 'connected' || iState === 'connected' || iState === 'completed') {
          iceRestartAttempted = false;
          failedPeersRef.current.delete(peerUid);
          const timer = disconnectTimersRef.current.get(peerUid);
          if (timer) {
            clearTimeout(timer);
            disconnectTimersRef.current.delete(peerUid);
          }
        } else if (iState === 'disconnected' || cState === 'disconnected') {
          if (!disconnectTimersRef.current.has(peerUid)) {
            const timer = setTimeout(() => {
              disconnectTimersRef.current.delete(peerUid);
              const curr = peersRef.current.get(peerUid);
              if (
                curr === pc &&
                (curr.iceConnectionState === 'disconnected' || curr.connectionState === 'disconnected')
              ) {
                if (!iceRestartAttempted) {
                  iceRestartAttempted = true;
                  try {
                    pc.restartIce?.();
                  } catch {
                    // ignore
                  }
                  void sendOfferToPeer(peerUid, pc, true);
                } else {
                  failedPeersRef.current.add(peerUid);
                  closePeer(peerUid);
                }
              }
            }, 4000);
            disconnectTimersRef.current.set(peerUid, timer);
          }
        } else if (cState === 'failed' || iState === 'failed') {
          if (!iceRestartAttempted) {
            iceRestartAttempted = true;
            try {
              pc.restartIce?.();
            } catch {
              // ignore
            }
            void sendOfferToPeer(peerUid, pc, true);
          } else {
            failedPeersRef.current.add(peerUid);
            closePeer(peerUid);
          }
        } else if (cState === 'closed') {
          closePeer(peerUid);
        }

        updateConnectionSummary();
      };

      pc.onconnectionstatechange = handleStateChange;
      pc.oniceconnectionstatechange = handleStateChange;
      updateConnectionSummary();

      return pc;
    },
    [closePeer, roomCode, sendOfferToPeer, updateConnectionSummary]
  );

  const leaveVoice = useCallback(async () => {
    setVoiceJoined(false);
    setMicMuted(false);
    setConnectedPeersCount(0);
    setVoiceStatus('idle');
    voiceJoinedRef.current = false;
    micMutedRef.current = false;
    setSpeakingUids({});
    failedPeersRef.current.clear();
    peerMissingSinceRef.current.clear();

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
      await clearMyVoiceSignals(roomCode);
      await setPlayerVoiceState(roomCode, false, false);
    }
  }, [closePeer, configureSpeakerVoiceAudioMode, roomCode]);

  const joinVoice = useCallback(async () => {
    if (!roomCode || !myUid) return;
    setVoiceError('');
    setVoiceStatus('joining');
    failedPeersRef.current.clear();
    peerMissingSinceRef.current.clear();

    const mod = webrtcRef.current ?? loadWebRTC();
    if (!mod) {
      setVoiceError('not_supported');
      setVoiceStatus('idle');
      return;
    }
    webrtcRef.current = mod;

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setVoiceError('permission_denied');
        setVoiceStatus('idle');
        return;
      }
    } else if (Platform.OS === 'ios') {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setVoiceError('permission_denied');
        setVoiceStatus('idle');
        return;
      }
    }

    await configureSpeakerVoiceAudioMode(true);
    handledSignalsRef.current.clear();

    try {
      const stream = await mod.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      await clearMyVoiceSignals(roomCode);
      setMicMuted(false);
      setVoiceJoined(true);
      voiceJoinedRef.current = true;
      micMutedRef.current = false;
      await setPlayerVoiceState(roomCode, true, false);
      updateConnectionSummary();
    } catch (err: unknown) {
      await configureSpeakerVoiceAudioMode(false);
      setVoiceStatus('idle');
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
  }, [configureSpeakerVoiceAudioMode, myUid, roomCode, updateConnectionSummary]);

  const reconnectVoice = useCallback(async () => {
    if (!voiceJoinedRef.current || !roomCode) return;
    failedPeersRef.current.clear();
    peerMissingSinceRef.current.clear();
    handledSignalsRef.current.clear();
    for (const peerUid of Array.from(peersRef.current.keys())) {
      closePeer(peerUid);
    }
    await clearMyVoiceSignals(roomCode);
    await setPlayerVoiceState(roomCode, true, micMutedRef.current);
    updateConnectionSummary();
  }, [closePeer, roomCode, updateConnectionSummary]);

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

    const reconcileMesh = () => {
      const activePeers = new Set(
        playerOrder.filter((pid) => pid !== myUid && players[pid]?.voiceJoined)
      );

      for (const existingPeer of Array.from(peersRef.current.keys())) {
        if (!activePeers.has(existingPeer)) {
          failedPeersRef.current.delete(existingPeer);
          closePeer(existingPeer);
        }
      }

      const now = Date.now();
      for (const peerUid of activePeers) {
        if (!peersRef.current.has(peerUid)) {
          if (myUid < peerUid) {
            const pc = createPeerConnection(peerUid);
            if (pc) {
              void sendOfferToPeer(peerUid, pc);
            }
          } else {
            const since = peerMissingSinceRef.current.get(peerUid) ?? now;
            if (!peerMissingSinceRef.current.has(peerUid)) {
              peerMissingSinceRef.current.set(peerUid, now);
            } else if (now - since >= 5000) {
              peerMissingSinceRef.current.set(peerUid, now);
              const pc = createPeerConnection(peerUid);
              if (pc) {
                void sendOfferToPeer(peerUid, pc);
              }
            }
          }
        }
      }

      updateConnectionSummary();
    };

    reconcileMesh();
    const timer = setInterval(reconcileMesh, 2500);
    return () => clearInterval(timer);
  }, [
    closePeer,
    createPeerConnection,
    myUid,
    playerOrder,
    players,
    roomCode,
    sendOfferToPeer,
    updateConnectionSummary,
    voiceJoined,
  ]);

  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const handleSignals = async (signals: VoiceSignalDoc[]) => {
      const mod = webrtcRef.current;
      if (!mod) return;

      for (const sig of signals) {
        if (handledSignalsRef.current.has(sig.id)) continue;
        handledSignalsRef.current.add(sig.id);

        const peerUid = sig.fromUid;
        if (!playersRef.current[peerUid]?.voiceJoined) {
          void deleteVoiceSignal(roomCode, sig.id);
          continue;
        }
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
            const cand = JSON.parse(sig.payload) as { candidate?: string };
            if (!cand || cand.candidate === '') continue;
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
                if (!playersRef.current[peerUid]?.micMuted) next[peerUid] = true;
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
  }, [myUid, voiceJoined]);

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
    voiceStatus,
    connectedPeersCount,
    speakingUids,
    joinVoice,
    leaveVoice,
    toggleMute,
    reconnectVoice,
  };
}
