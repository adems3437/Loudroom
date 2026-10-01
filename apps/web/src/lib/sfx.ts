import { useSyncExternalStore } from 'react';

/**
 * Sound effects synthesized with WebAudio: no audio files, so nothing to license (SPEC §12).
 * Browsers only allow audio after a user gesture, so `unlockAudio` runs on a click first.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function unlockAudio(): void {
  audio();
}

function tone(
  frequency: number,
  durationMs: number,
  {
    type = 'sine',
    gain = 0.12,
    delayMs = 0,
    slideTo,
  }: {
    type?: OscillatorType;
    gain?: number;
    delayMs?: number;
    slideTo?: number;
  } = {},
): void {
  if (!soundEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, end);
  volume.gain.setValueAtTime(gain, start);
  volume.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

export const sfx = {
  /** Last seconds of the clock. */
  tick: () => {
    tone(880, 70, { type: 'square', gain: 0.05 });
  },
  /** A player locked in an answer. */
  answer: () => {
    tone(660, 90, { type: 'triangle', gain: 0.08 });
  },
  /** A new question appears. */
  whoosh: () => {
    tone(220, 260, { type: 'sawtooth', gain: 0.05, slideTo: 880 });
  },
  /** The answer is revealed. */
  reveal: () => {
    [523, 659, 784].forEach((frequency, index) => {
      tone(frequency, 220, { type: 'triangle', delayMs: index * 90 });
    });
  },
  /** The final podium. */
  fanfare: () => {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone(frequency, index === 3 ? 600 : 180, {
        type: 'square',
        gain: 0.06,
        delayMs: index * 150,
      });
    });
  },
};

// ── On/off switch, remembered per browser ────────────────────────────────────

const KEY = 'loudroom:sound';
const CHANGE = 'loudroom:sound-change';

function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // not remembered
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, soundEnabled, () => true);
}
