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
  ],
};

export type VoiceErrorType = '' | 'permission_denied' | 'not_supported';

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
  const [speakingUids, setSpeakingUids] = useState<Record<string, boolean>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handledSignalsRef = useRef<Set<string>>(new Set());
  const analysersRef = useRef<
    Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> }>
  >(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceJoinedRef = useRef(false);
  const micMutedRef = useRef(false);

  voiceJoinedRef.current = voiceJoined;
  micMutedRef.current = micMuted;

  const attachAnalyser = useCallback((uid: string, stream: MediaStream) => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
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
      const buffer = new ArrayBuffer(analyser.frequencyBinCount);
      analysersRef.current.set(uid, {
        analyser,
        source,
        data: new Uint8Array(buffer),
      });
    } catch {
      // Ignore Web Audio analyser failure on restricted devices
    }
  }, []);

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

  const closePeer = useCallback(
    (peerUid: string) => {
      const pc = peersRef.current.get(peerUid);
      if (pc) {
        try {
          pc.ontrack = null;
          pc.onicecandidate = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
        peersRef.current.delete(peerUid);
      }
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
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
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
        let audio = audioElsRef.current.get(peerUid);
        if (!audio && typeof document !== 'undefined') {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', 'true');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audioElsRef.current.set(peerUid, audio);
        }
        if (audio) {
          audio.srcObject = remoteStream;
          audio.play().catch(() => {});
        }
        attachAnalyser(peerUid, remoteStream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(peerUid);
        }
      };

      return pc;
    },
    [attachAnalyser, closePeer, roomCode]
  );

  const leaveVoice = useCallback(async () => {
    setVoiceJoined(false);
    setMicMuted(false);
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
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setVoiceError('not_supported');
      return;
    }

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
    } catch {
      setVoiceError('permission_denied');
    }
  }, [attachAnalyser, myUid, roomCode]);

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

  // Maintain peer mesh with voiceJoined peers
  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

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
        void (async () => {
          try {
            const offer = await pc.createOffer();
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
            // ignore transient offer error
          }
        })();
      }
    }
  }, [closePeer, createPeerConnection, myUid, playerOrder, players, roomCode, voiceJoined]);

  // Listen for incoming WebRTC signaling packets
  useEffect(() => {
    if (!voiceJoined || !roomCode || !myUid) return;

    const handleSignals = async (signals: VoiceSignalDoc[]) => {
      for (const sig of signals) {
        if (handledSignalsRef.current.has(sig.id)) continue;
        handledSignalsRef.current.add(sig.id);

        const peerUid = sig.fromUid;
        try {
          if (sig.type === 'offer') {
            const pc = createPeerConnection(peerUid);
            const desc = JSON.parse(sig.payload) as RTCSessionDescriptionInit;
            await pc.setRemoteDescription(new RTCSessionDescription(desc));
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

  // Speaking level detection timer (local & remote streams, zero Firestore writes)
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
        entry.analyser.getByteFrequencyData(entry.data);
        let sum = 0;
        for (let i = 0; i < entry.data.length; i++) {
          sum += entry.data[i];
        }
        const avg = sum / entry.data.length;
        nextSpeaking[uid] = avg > 14;
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
    speakingUids,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
