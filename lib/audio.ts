// Web Audio synth: every sound and the background music are generated, no audio files.

type Channel = "sfx" | "music";

const STORAGE_KEY: Record<Channel, string> = {
  sfx: "scesa-override:sfx",
  music: "scesa-override:music",
};
// SFX default on; music default off (browsers block autoplay, and a room of teams gets loud).
const DEFAULTS: Record<Channel, boolean> = { sfx: true, music: false };

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

function readSetting(ch: Channel): boolean {
  try {
    if (typeof window === "undefined") return DEFAULTS[ch];
    const v = window.localStorage.getItem(STORAGE_KEY[ch]);
    return v === null ? DEFAULTS[ch] : v === "1";
  } catch {
    return DEFAULTS[ch];
  }
}

const enabled: Record<Channel, boolean> = { sfx: readSetting("sfx"), music: readSetting("music") };
const listeners = new Set<() => void>();

export function isEnabled(ch: Channel): boolean {
  return enabled[ch];
}

export function subscribeAudio(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setEnabled(ch: Channel, v: boolean): void {
  enabled[ch] = v;
  try {
    window.localStorage.setItem(STORAGE_KEY[ch], v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  if (ch === "music") {
    if (v) startMusic();
    else stopMusic();
  }
  listeners.forEach((l) => l());
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
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(ctx.destination);
      // Music goes through a gentle low-pass for a warmer, "through the CRT speaker" tone.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.0001;
      musicBus.connect(lp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    if (enabled.music && !musicTimer) startMusic();
    return ctx;
  } catch {
    return null;
  }
}

function sfx(): { c: AudioContext; out: GainNode } | null {
  if (!enabled.sfx) return null;
  const c = unlockAudio();
  return c && sfxBus ? { c, out: sfxBus } : null;
}

function tone(
  c: AudioContext,
  out: AudioNode,
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
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.02);
  return o;
}

function noise(c: AudioContext, out: AudioNode, start: number, dur: number, freq: number, gain: number): void {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(start);
}

// ------------------------------------------------------------------ SFX

/** Mechanical key click (code boxes, call-sign and claim typing). */
export function keyClick(): void {
  const a = sfx();
  if (!a) return;
  // Slight pitch variation so fast typing doesn't sound robotic.
  noise(a.c, a.out, a.c.currentTime, 0.03, 2000 + Math.random() * 900, 0.25);
}

/** Soft backspace thunk. */
export function keyErase(): void {
  const a = sfx();
  if (!a) return;
  noise(a.c, a.out, a.c.currentTime, 0.04, 900, 0.22);
}

export function beep(): void {
  const a = sfx();
  if (!a) return;
  tone(a.c, a.out, "square", 880, a.c.currentTime, 0.08, 0.06);
}

/** Two-tone "system accepted" blip (call-sign accepted, claim recorded). */
export function confirmBlip(): void {
  const a = sfx();
  if (!a) return;
  const t = a.c.currentTime;
  tone(a.c, a.out, "square", 660, t, 0.07, 0.07);
  tone(a.c, a.out, "square", 990, t + 0.08, 0.1, 0.07);
}

/** Descending data-decrypt warble when a hint is revealed. */
export function hintReveal(): void {
  const a = sfx();
  if (!a) return;
  const t = a.c.currentTime;
  [1320, 1100, 880, 1175].forEach((f, i) => tone(a.c, a.out, "triangle", f, t + i * 0.06, 0.09, 0.08));
}

/** Short ping when the lockout or a timed hint becomes available. */
export function readyPing(): void {
  const a = sfx();
  if (!a) return;
  const t = a.c.currentTime;
  tone(a.c, a.out, "sine", 1568, t, 0.25, 0.08);
  tone(a.c, a.out, "sine", 2093, t + 0.09, 0.3, 0.06);
}

export function errorBuzz(): void {
  const a = sfx();
  if (!a) return;
  const t = a.c.currentTime;
  tone(a.c, a.out, "sawtooth", 110, t, 0.45, 0.12);
  tone(a.c, a.out, "square", 82, t, 0.45, 0.08);
}

export function alarm(durationSec = 1.4): void {
  const a = sfx();
  if (!a) return;
  const { c, out } = a;
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
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + durationSec + 0.05);
}

export function victoryChime(): void {
  const a = sfx();
  if (!a) return;
  const t = a.c.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
    tone(a.c, a.out, "triangle", f, t + i * 0.12, 0.5, 0.14);
  });
}

// ------------------------------------------------------------------ music

// A looping 8-bar chiptune in A minor (Am – F – C – G, twice; lead varies on the repeat).
const BPM = 112;
const STEP = 60 / BPM / 4; // 16th note
const MUSIC_LEVEL = 0.05;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Chord roots (MIDI) and triads per bar.
const BARS: { root: number; triad: [number, number, number] }[] = [
  { root: 45, triad: [57, 60, 64] }, // Am
  { root: 41, triad: [53, 57, 60] }, // F
  { root: 48, triad: [55, 60, 64] }, // C
  { root: 43, triad: [55, 59, 62] }, // G
];
// Lead melody per 8-bar phrase: [step-in-phrase, midi, lengthInSteps]
const LEAD: [number, number, number][] = [
  [0, 76, 4], [6, 74, 2], [8, 72, 4], [12, 71, 4],
  [16, 72, 6], [24, 69, 8],
  [32, 67, 4], [36, 69, 2], [38, 72, 2], [40, 74, 8],
  [48, 71, 4], [52, 74, 4], [56, 76, 8],
  [64, 76, 4], [70, 79, 2], [72, 77, 4], [76, 76, 4],
  [80, 74, 6], [88, 72, 8],
  [96, 72, 4], [100, 74, 4], [104, 76, 8],
  [112, 74, 4], [116, 71, 4], [120, 69, 8],
];
const PHRASE_STEPS = 128;

let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextStepTime = 0;
let step = 0;

function scheduleStep(c: AudioContext, out: GainNode, s: number, t: number): void {
  const inPhrase = s % PHRASE_STEPS;
  const bar = BARS[Math.floor(inPhrase / 16) % BARS.length];
  const inBar = inPhrase % 16;

  // Bass: pulsing eighths, octave jump on the off-beat.
  if (inBar % 2 === 0) {
    const n = inBar % 4 === 2 ? bar.root + 12 : bar.root;
    tone(c, out, "square", midi(n), t, STEP * 1.6, 0.5);
  }
  // Arpeggio: fast 16th triad cycling, quiet.
  const arp = bar.triad[inBar % 3] + 12;
  tone(c, out, "square", midi(arp), t, STEP * 0.8, 0.16);
  // Hi-hat on every off-beat 8th, kick-ish thump on beats 1 and 3.
  if (inBar % 4 === 2) noise(c, out, t, 0.03, 7000, 0.35);
  if (inBar === 0 || inBar === 8) tone(c, out, "sine", 90, t, 0.12, 0.9);
  // Lead.
  for (const [at, n, len] of LEAD) {
    if (at === inPhrase) tone(c, out, "triangle", midi(n), t, STEP * len * 0.95, 0.45);
  }
}

function startMusic(): void {
  if (musicTimer || !enabled.music) return;
  const c = ctx;
  if (!c || !musicBus) return; // started on the next user gesture via unlockAudio()
  const out = musicBus;
  out.gain.cancelScheduledValues(c.currentTime);
  out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), c.currentTime);
  out.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, c.currentTime + 1.5);
  nextStepTime = c.currentTime + 0.1;
  // Lookahead scheduler: queue notes ~120 ms ahead so timers can jitter safely.
  musicTimer = setInterval(() => {
    while (nextStepTime < c.currentTime + 0.12) {
      scheduleStep(c, out, step, nextStepTime);
      nextStepTime += STEP;
      step++;
    }
  }, 25);
}

function stopMusic(): void {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(Math.max(musicBus.gain.value, 0.0001), ctx.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }
}
