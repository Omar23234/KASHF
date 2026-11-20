// Synthesized Web Audio API Sound Effects (100% offline, zero external files)

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.08,
  delaySec = 0,
  freqEnd?: number
) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export const soundFX = {
  tap(enabled: boolean) {
    if (!enabled) return;
    playTone(520, 0.06, 'triangle', 0.05, 0, 380);
  },
  cardDeal(enabled: boolean) {
    if (!enabled) return;
    playTone(340, 0.12, 'sine', 0.07, 0, 580);
    playTone(620, 0.14, 'triangle', 0.04, 0.05, 760);
  },
  skip(enabled: boolean) {
    if (!enabled) return;
    playTone(460, 0.14, 'sawtooth', 0.035, 0, 220);
    playTone(280, 0.12, 'sine', 0.04, 0.06, 180);
  },
  turnAlert(enabled: boolean) {
    if (!enabled) return;
    playTone(523.25, 0.14, 'sine', 0.07, 0);
    playTone(659.25, 0.18, 'sine', 0.07, 0.09);
  },
  complete(enabled: boolean) {
    if (!enabled) return;
    playTone(523.25, 0.16, 'triangle', 0.07, 0);
    playTone(659.25, 0.16, 'triangle', 0.07, 0.1);
    playTone(783.99, 0.18, 'triangle', 0.08, 0.2);
    playTone(1046.5, 0.35, 'sine', 0.09, 0.3);
  },
};
