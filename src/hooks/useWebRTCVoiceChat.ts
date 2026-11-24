import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteVoiceSignal,
  sendVoiceSignal,
  setPlayerVoiceState,
  subscribeToVoiceSignals,
} from '../firebase/multiplayerService';
import type { RoomPlayerDoc, VoiceSignalDoc } from '../types/game';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export type VoiceErrorType = '' | 'permission_denied' | 'no_mic_device' | 'not_supported';

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
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [speakingUids, setSpeakingUids] = useState<Record<string, boolean>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const joinTimestampMsRef = useRef<number>(0);
  const analysersRef = useRef<
    Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> }>
  >(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceJoinedRef = useRef(false);
  const micMutedRef = useRef(false);

  voiceJoinedRef.current = voiceJoined;
  micMutedRef.current = micMuted;

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
    audio.play()
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

  // Automatically unlock blocked remote audio on the next user gesture
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
    },
    [detachAnalyser]
  );

  const createPeerConnection = useCallback(
    (peerUid: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerUid);
      if (existing && existing.connectionState !== 'closed') return existing;
      if (existing) closePeer(peerUid);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);

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
        if (evt.candidate && roomCode) {
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
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          if (!iceRestartAttempted && typeof pc.restartIce === 'function') {
            iceRestartAttempted = true;
            try {
              pc.restartIce();
              return;
            } catch {
              // fall through to close
            }
          }
          closePeer(peerUid);
        } else if (pc.connectionState === 'closed') {
          closePeer(peerUid);
        }
      };

      return pc;
    },
    [attachAnalyser, closePeer, roomCode, tryPlayAudioElement]
  );

  const sendOfferToPeer = useCallback(
    async (peerUid: string, pc: RTCPeerConnection) => {
      if (!roomCode || makingOfferRef.current.has(peerUid)) return;
      makingOfferRef.current.add(peerUid);
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
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
        // ignore transient offer error; reconciliation loop will retry
      } finally {
        makingOfferRef.current.delete(peerUid);
      }
    },
    [roomCode]
  );

  const leaveVoice = useCallback(async () => {
    setVoiceJoined(false);
    setMicMuted(false);
    setAudioBlocked(false);
    voiceJoinedRef.current = false;
    micMutedRef.current = false;

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
      await setPlayerVoiceState(roomCode, false, false);
    }
  }, [closePeer, detachAnalyser, myUid, roomCode]);

  const joinVoice = useCallback(async () => {
    if (!roomCode || !myUid) return;
    setVoiceError('');
    setAudioBlocked(false);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setVoiceError('not_supported');
      return;
    }

    // Unlock audio context synchronously within the click user-gesture
    ensureAudioContextResumed();
    joinTimestampMsRef.current = Date.now();
    handledSignalsRef.current.clear();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      attachAnalyser(myUid, stream);
      setMicMuted(false);
      setVoiceJoined(true);
      voiceJoinedRef.current = true;
      micMutedRef.current = false;
      await setPlayerVoiceState(roomCode, true, false);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setVoiceError('no_mic_device');
      } else {
        setVoiceError('permission_denied');
      }
    }
  }, [attachAnalyser, ensureAudioContextResumed, myUid, roomCode]);

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

  // If room changes/leaves while voice is still marked joined, clean up stale session
  const prevRoomCodeRef = useRef<string | null>(roomCode);
  useEffect(() => {
    const prev = prevRoomCodeRef.current;
    prevRoomCodeRef.current = roomCode;
    if (prev && prev !== roomCode && voiceJoinedRef.current) {
      setVoiceJoined(false);
      setMicMuted(false);
      setAudioBlocked(false);
      voiceJoinedRef.current = false;
      micMutedRef.current = false;
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

  // Maintain peer mesh with voiceJoined peers + periodic recovery check
  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const reconcileMesh = () => {
      const activeVoicePeers = new Set(
        playerOrder.filter((pid) => pid !== myUid && players[pid]?.voiceJoined)
      );

      for (const existingPeer of Array.from(peersRef.current.keys())) {
        if (!activeVoicePeers.has(existingPeer)) {
          closePeer(existingPeer);
        }
      }

      for (const peerUid of activeVoicePeers) {
        if (!peersRef.current.has(peerUid) && myUid < peerUid) {
          const pc = createPeerConnection(peerUid);
          void sendOfferToPeer(peerUid, pc);
        }
      }
    };

    reconcileMesh();
    const timer = window.setInterval(reconcileMesh, 3000);
    return () => window.clearInterval(timer);
  }, [
    closePeer,
    createPeerConnection,
    myUid,
    playerOrder,
    players,
    roomCode,
    sendOfferToPeer,
    voiceJoined,
  ]);

  // Listen for incoming WebRTC signaling packets with glare & stale-signal handling
  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const handleSignals = async (signals: VoiceSignalDoc[]) => {
      for (const sig of signals) {
        if (handledSignalsRef.current.has(sig.id)) continue;
        handledSignalsRef.current.add(sig.id);

        // Ignore & clean up leftover signaling packets from prior sessions
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
            const desc = JSON.parse(sig.payload) as RTCSessionDescriptionInit;
            const offerCollision = makingOfferRef.current.has(peerUid) || pc.signalingState !== 'stable';
            if (offerCollision && !polite) {
              continue;
            }
            if (offerCollision && polite) {
              await Promise.all([
                pc.setLocalDescription({ type: 'rollback' }),
                pc.setRemoteDescription(new RTCSessionDescription(desc)),
              ]);
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(desc));
            }

            const queued = pendingIceRef.current.get(peerUid) ?? [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
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
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
              pendingIceRef.current.delete(peerUid);
            }
          } else if (sig.type === 'ice') {
            const cand = JSON.parse(sig.payload) as RTCIceCandidateInit;
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

  // Speaking level detection timer using time-domain RMS (zero Firestore writes)
  useEffect(() => {
    if (!voiceJoined) return;
    const timer = window.setInterval(() => {
      const nextSpeaking: Record<string, boolean> = {};
      for (const [uid, entry] of analysersRef.current.entries()) {
        if (uid === myUid && micMutedRef.current) {
          nextSpeaking[uid] = false;
          continue;
        }
        if (uid !== myUid && players[uid]?.micMuted) {
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
        nextSpeaking[uid] = rms > 0.025;
      }
      setSpeakingUids(nextSpeaking);
    }, 150);

    return () => window.clearInterval(timer);
  }, [myUid, players, voiceJoined]);

  // Cleanup on unmount
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
    audioBlocked,
    speakingUids,
    joinVoice,
    leaveVoice,
    toggleMute,
    unlockAudio,
  };
}
