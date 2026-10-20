// Web Audio synth: every sound is generated, no audio files.

const MUTE_KEY = "scesa-override:muted";

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

const listeners = new Set<() => void>();

export function subscribeMuted(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setMuted(v: boolean): void {
  muted = v;
  listeners.forEach((l) => l());
  try {
    window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

/** Create/resume the AudioContext lazily; call from a user gesture. */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  return unlockAudio();
}

function tone(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  start: number,
  dur: number,
  gain = 0.15,
): OscillatorNode {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
  return o;
}

export function keyClick(): void {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2400;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = 0.25;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export function beep(): void {
  const c = ac();
  if (!c) return;
  tone(c, "square", 880, c.currentTime, 0.08, 0.06);
}

export function errorBuzz(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  tone(c, "sawtooth", 110, t, 0.45, 0.12);
  tone(c, "square", 82, t, 0.45, 0.08);
}

export function alarm(durationSec = 1.4): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  const sweeps = 3;
  const per = durationSec / sweeps;
  for (let i = 0; i < sweeps; i++) {
    o.frequency.setValueAtTime(520, t + i * per);
    o.frequency.linearRampToValueAtTime(980, t + i * per + per * 0.6);
    o.frequency.linearRampToValueAtTime(520, t + (i + 1) * per);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
  g.gain.setValueAtTime(0.07, t + durationSec - 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + durationSec + 0.05);
}

export function victoryChime(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
    tone(c, "triangle", f, t + i * 0.12, 0.5, 0.14);
  });
}
