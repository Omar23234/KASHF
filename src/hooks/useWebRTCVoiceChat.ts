import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearMyVoiceSignals,
  deleteVoiceSignal,
  sendVoiceSignal,
  setPlayerVoiceState,
  subscribeToVoiceSignals,
} from '../firebase/multiplayerService';
import type { RoomPlayerDoc, VoiceSignalDoc } from '../types/game';

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
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

  const customTurnUrl = import.meta.env.VITE_TURN_URL?.trim();
  if (customTurnUrl) {
    servers.unshift({
      urls: customTurnUrl,
      username: import.meta.env.VITE_TURN_USER?.trim() || undefined,
      credential: import.meta.env.VITE_TURN_PASS?.trim() || undefined,
    });
  }
  return servers;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 4,
};

export type VoiceErrorType =
  | ''
  | 'permission_denied'
  | 'iframe_permission_denied'
  | 'no_mic_device'
  | 'not_supported';

export type VoiceConnectionStatus =
  | 'idle'
  | 'joining'
  | 'waiting_peers'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export function useWebRTCVoiceChat(params: {
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
  const [localMicLevel, setLocalMicLevel] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [speakingUids, setSpeakingUids] = useState<Record<string, boolean>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerMissingSinceRef = useRef<Map<string, number>>(new Map());
  const disconnectTimersRef = useRef<Map<string, number>>(new Map());
  const failedPeersRef = useRef<Set<string>>(new Set());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const analysersRef = useRef<
    Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> }>
  >(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
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
        // count as failed unless others are active
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

  const ensureAudioContextResumed = useCallback(() => {
    try {
      if (typeof window === 'undefined') return null;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  }, []);

  const attachAnalyser = useCallback(
    (uid: string, stream: MediaStream) => {
      try {
        const ctx = ensureAudioContextResumed();
        if (!ctx) return;
        const existing = analysersRef.current.get(uid);
        if (existing) {
          try {
            existing.source.disconnect();
          } catch {
            // ignore
          }
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const buffer = new ArrayBuffer(analyser.fftSize);
        analysersRef.current.set(uid, {
          analyser,
          source,
          data: new Uint8Array(buffer),
        });
      } catch {
        // Ignore Web Audio analyser failure on restricted devices
      }
    },
    [ensureAudioContextResumed]
  );

  const detachAnalyser = useCallback((uid: string) => {
    const entry = analysersRef.current.get(uid);
    if (entry) {
      try {
        entry.source.disconnect();
      } catch {
        // ignore
      }
      analysersRef.current.delete(uid);
    }
    setSpeakingUids((prev) => {
      if (!prev[uid]) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  const tryPlayAudioElement = useCallback((audio: HTMLAudioElement) => {
    audio.muted = false;
    audio.volume = 1;
    audio
      .play()
      .then(() => {
        setAudioBlocked(false);
      })
      .catch(() => {
        setAudioBlocked(true);
      });
  }, []);

  const unlockAudio = useCallback(() => {
    ensureAudioContextResumed();
    let anyStillBlocked = false;
    for (const audio of audioElsRef.current.values()) {
      audio.muted = false;
      audio.volume = 1;
      audio.play().catch(() => {
        anyStillBlocked = true;
      });
    }
    if (!anyStillBlocked) {
      setAudioBlocked(false);
    }
  }, [ensureAudioContextResumed]);

  useEffect(() => {
    if (!audioBlocked || typeof window === 'undefined') return;
    const handleUnlock = () => {
      unlockAudio();
    };
    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, [audioBlocked, unlockAudio]);

  const closePeer = useCallback(
    (peerUid: string) => {
      makingOfferRef.current.delete(peerUid);
      peerMissingSinceRef.current.delete(peerUid);
      const discTimer = disconnectTimersRef.current.get(peerUid);
      if (discTimer !== undefined) {
        window.clearTimeout(discTimer);
        disconnectTimersRef.current.delete(peerUid);
      }
      const pc = peersRef.current.get(peerUid);
      if (pc) {
        try {
          pc.ontrack = null;
          pc.onicecandidate = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
        peersRef.current.delete(peerUid);
      }
      remoteStreamsRef.current.delete(peerUid);
      const audioEl = audioElsRef.current.get(peerUid);
      if (audioEl) {
        try {
          audioEl.pause();
          audioEl.srcObject = null;
          audioEl.remove();
        } catch {
          // ignore
        }
        audioElsRef.current.delete(peerUid);
      }
      pendingIceRef.current.delete(peerUid);
      detachAnalyser(peerUid);
      updateConnectionSummary();
    },
    [detachAnalyser, updateConnectionSummary]
  );

  const sendOfferToPeer = useCallback(
    async (peerUid: string, pc: RTCPeerConnection, iceRestart = false) => {
      if (!roomCode || makingOfferRef.current.has(peerUid)) return;
      makingOfferRef.current.add(peerUid);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          ...(iceRestart ? { iceRestart: true } : {}),
        });
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          await sendVoiceSignal(
            roomCode,
            peerUid,
            'offer',
            JSON.stringify(pc.localDescription.toJSON())
          );
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
    (peerUid: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerUid);
      if (existing && existing.connectionState !== 'closed') return existing;
      if (existing) closePeer(peerUid);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);
      peerMissingSinceRef.current.delete(peerUid);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      } else {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch {
          // ignore
        }
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate && evt.candidate.candidate && roomCode) {
          void sendVoiceSignal(
            roomCode,
            peerUid,
            'ice',
            JSON.stringify(evt.candidate.toJSON())
          );
        }
      };

      pc.ontrack = (evt) => {
        const remoteStream = evt.streams[0] || new MediaStream([evt.track]);
        remoteStreamsRef.current.set(peerUid, remoteStream);
        evt.track.enabled = true;

        let audio = audioElsRef.current.get(peerUid);
        if (!audio && typeof document !== 'undefined') {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.muted = false;
          audio.volume = 1;
          audio.setAttribute('playsinline', 'true');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audioElsRef.current.set(peerUid, audio);
        }
        if (audio) {
          audio.srcObject = remoteStream;
          tryPlayAudioElement(audio);
        }
        evt.track.onunmute = () => {
          const el = audioElsRef.current.get(peerUid);
          if (el) {
            tryPlayAudioElement(el);
          }
        };
        attachAnalyser(peerUid, remoteStream);
      };

      let iceRestartAttempted = false;
      const handleStateChange = () => {
        const cState = pc.connectionState;
        const iState = pc.iceConnectionState;

        if (cState === 'connected' || iState === 'connected' || iState === 'completed') {
          iceRestartAttempted = false;
          failedPeersRef.current.delete(peerUid);
          const timer = disconnectTimersRef.current.get(peerUid);
          if (timer !== undefined) {
            window.clearTimeout(timer);
            disconnectTimersRef.current.delete(peerUid);
          }
        } else if (iState === 'disconnected' || cState === 'disconnected') {
          if (!disconnectTimersRef.current.has(peerUid)) {
            const timer = window.setTimeout(() => {
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
    [attachAnalyser, closePeer, roomCode, sendOfferToPeer, tryPlayAudioElement, updateConnectionSummary]
  );

  const leaveVoice = useCallback(async () => {
    setVoiceJoined(false);
    setMicMuted(false);
    setAudioBlocked(false);
    setLocalMicLevel(0);
    setConnectedPeersCount(0);
    setVoiceStatus('idle');
    voiceJoinedRef.current = false;
    micMutedRef.current = false;
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
    if (myUid) {
      detachAnalyser(myUid);
    }
    if (roomCode) {
      await clearMyVoiceSignals(roomCode);
      await setPlayerVoiceState(roomCode, false, false);
    }
  }, [closePeer, detachAnalyser, myUid, roomCode]);

  const joinVoice = useCallback(async () => {
    if (!roomCode || !myUid) return;
    setVoiceError('');
    setAudioBlocked(false);
    setVoiceStatus('joining');
    failedPeersRef.current.clear();
    peerMissingSinceRef.current.clear();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setVoiceError('not_supported');
      setVoiceStatus('idle');
      return;
    }

    ensureAudioContextResumed();
    handledSignalsRef.current.clear();

    let stream: MediaStream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (firstErr: unknown) {
        const firstName = (firstErr as { name?: string })?.name ?? '';
        if (firstName === 'OverconstrainedError' || firstName === 'TypeError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } else {
          throw firstErr;
        }
      }
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      setVoiceStatus('idle');
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setVoiceError('no_mic_device');
      } else {
        const inIframe = typeof window !== 'undefined' && window.self !== window.top;
        setVoiceError(inIframe ? 'iframe_permission_denied' : 'permission_denied');
      }
      return;
    }

    localStreamRef.current = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = true;
    }
    attachAnalyser(myUid, stream);

    await clearMyVoiceSignals(roomCode);
    setMicMuted(false);
    setVoiceJoined(true);
    voiceJoinedRef.current = true;
    micMutedRef.current = false;
    await setPlayerVoiceState(roomCode, true, false);
    updateConnectionSummary();
  }, [attachAnalyser, ensureAudioContextResumed, myUid, roomCode, updateConnectionSummary]);

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
    if (nextMuted) {
      setLocalMicLevel(0);
    }
    await setPlayerVoiceState(roomCode, true, nextMuted);
  }, [roomCode]);

  const prevRoomCodeRef = useRef<string | null>(roomCode);
  useEffect(() => {
    const prev = prevRoomCodeRef.current;
    prevRoomCodeRef.current = roomCode;
    if (prev && prev !== roomCode && voiceJoinedRef.current) {
      setVoiceJoined(false);
      setMicMuted(false);
      setAudioBlocked(false);
      setLocalMicLevel(0);
      setConnectedPeersCount(0);
      setVoiceStatus('idle');
      voiceJoinedRef.current = false;
      micMutedRef.current = false;
      failedPeersRef.current.clear();
      peerMissingSinceRef.current.clear();
      for (const peerUid of Array.from(peersRef.current.keys())) {
        closePeer(peerUid);
      }
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
        localStreamRef.current = null;
      }
      if (myUid) detachAnalyser(myUid);
    }
  }, [closePeer, detachAnalyser, myUid, roomCode]);

  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const reconcileMesh = () => {
      const activeVoicePeers = new Set(
        playerOrder.filter((pid) => pid !== myUid && players[pid]?.voiceJoined)
      );

      for (const existingPeer of Array.from(peersRef.current.keys())) {
        if (!activeVoicePeers.has(existingPeer)) {
          failedPeersRef.current.delete(existingPeer);
          closePeer(existingPeer);
        }
      }

      const now = Date.now();
      for (const peerUid of activeVoicePeers) {
        if (!peersRef.current.has(peerUid)) {
          if (myUid < peerUid) {
            const pc = createPeerConnection(peerUid);
            void sendOfferToPeer(peerUid, pc);
          } else {
            // Polite peer recovery: if impolite peer hasn't connected within 5s, send a recovery offer
            const since = peerMissingSinceRef.current.get(peerUid) ?? now;
            if (!peerMissingSinceRef.current.has(peerUid)) {
              peerMissingSinceRef.current.set(peerUid, now);
            } else if (now - since >= 5000) {
              peerMissingSinceRef.current.set(peerUid, now);
              const pc = createPeerConnection(peerUid);
              void sendOfferToPeer(peerUid, pc);
            }
          }
        }
      }

      updateConnectionSummary();
    };

    reconcileMesh();
    const timer = window.setInterval(reconcileMesh, 2500);
    return () => window.clearInterval(timer);
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
            const desc = JSON.parse(sig.payload) as RTCSessionDescriptionInit;
            const offerCollision = makingOfferRef.current.has(peerUid) || pc.signalingState !== 'stable';
            if (offerCollision && !polite) {
              continue;
            }
            if (offerCollision && polite) {
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch {
                // fallback if browser skips explicit rollback
              }
              await pc.setRemoteDescription(new RTCSessionDescription(desc));
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(desc));
            }

            const queued = pendingIceRef.current.get(peerUid) ?? [];
            for (const cand of queued) {
              if (cand.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            }
            pendingIceRef.current.delete(peerUid);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              await sendVoiceSignal(
                roomCode,
                peerUid,
                'answer',
                JSON.stringify(pc.localDescription.toJSON())
              );
            }
          } else if (sig.type === 'answer') {
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.signalingState === 'have-local-offer') {
              const desc = JSON.parse(sig.payload) as RTCSessionDescriptionInit;
              await pc.setRemoteDescription(new RTCSessionDescription(desc));
              const queued = pendingIceRef.current.get(peerUid) ?? [];
              for (const cand of queued) {
                if (cand.candidate) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                }
              }
              pendingIceRef.current.delete(peerUid);
            }
          } else if (sig.type === 'ice') {
            const cand = JSON.parse(sig.payload) as RTCIceCandidateInit;
            if (!cand || !cand.candidate) continue;
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
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
    const timer = window.setInterval(() => {
      const nextSpeaking: Record<string, boolean> = {};
      let myRmsPct = 0;
      for (const [uid, entry] of analysersRef.current.entries()) {
        if (uid === myUid && micMutedRef.current) {
          nextSpeaking[uid] = false;
          continue;
        }
        if (uid !== myUid && playersRef.current[uid]?.micMuted) {
          nextSpeaking[uid] = false;
          continue;
        }
        entry.analyser.getByteTimeDomainData(entry.data);
        let sumSq = 0;
        for (let i = 0; i < entry.data.length; i++) {
          const centered = (entry.data[i] - 128) / 128;
          sumSq += centered * centered;
        }
        const rms = Math.sqrt(sumSq / entry.data.length);
        if (uid === myUid) {
          myRmsPct = Math.min(100, Math.round(rms * 420));
        }
        nextSpeaking[uid] = rms > 0.02;
      }
      setLocalMicLevel(micMutedRef.current ? 0 : myRmsPct);
      setSpeakingUids(nextSpeaking);
    }, 150);

    return () => window.clearInterval(timer);
  }, [myUid, voiceJoined]);

  useEffect(() => {
    return () => {
      for (const peerUid of Array.from(peersRef.current.keys())) {
        closePeer(peerUid);
      }
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
        localStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [closePeer]);

  return {
    voiceJoined,
    micMuted,
    voiceError,
    voiceStatus,
    connectedPeersCount,
    localMicLevel,
    audioBlocked,
    speakingUids,
    joinVoice,
    leaveVoice,
    toggleMute,
    reconnectVoice,
    unlockAudio,
  };
}
