/** Tiny synthesized sound kit. Every sound is generated, so there are no audio files to load. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private sizzle: { gain: GainNode } | null = null;
  private bubble: { gain: GainNode } | null = null;
  private pourLoop: { gain: GainNode } | null = null;
  muted = false;

  /** Silence everything while the page is hidden; the next tap resumes it. */
  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      // iOS can leave the context "interrupted" after a call or a trip to the home screen.
      if (this.ctx.state !== "running") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.sizzle = this.loop("bandpass", 4200, 0.6);
    this.bubble = this.loop("lowpass", 500, 1, 7);
    this.pourLoop = this.loop("bandpass", 900, 2);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  private loop(type: BiquadFilterType, freq: number, q: number, wobbleHz = 0): { gain: GainNode } {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain);
    if (wobbleHz) {
      // Amplitude wobble makes filtered noise read as bubbling oil.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = wobbleHz;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      const wob = ctx.createGain();
      wob.gain.value = 0.5;
      lfo.connect(depth).connect(wob.gain);
      gain.connect(wob).connect(this.master);
      lfo.start();
    } else {
      gain.connect(this.master);
    }
    src.start();
    return { gain };
  }

  /** Continuous levels, 0..1, updated every frame. */
  setLoops(sizzle: number, bubble: number, pour: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sizzle?.gain.gain.setTargetAtTime(Math.min(1, sizzle) * 0.22, t, 0.1);
    this.bubble?.gain.gain.setTargetAtTime(Math.min(1, bubble) * 0.35, t, 0.15);
    this.pourLoop?.gain.gain.setTargetAtTime(pour * 0.3, t, 0.04);
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number, delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, dur: number, vol = 0.3, type: BiquadFilterType = "bandpass", slideTo?: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  plop(): void {
    this.tone(320 + Math.random() * 60, 0.12, "sine", 0.35, 120);
  }
  thud(): void {
    this.tone(160, 0.15, "triangle", 0.3, 70);
  }
  flip(): void {
    this.burst(600, 0.25, 0.25, "bandpass", 2400);
  }
  sizzleHit(): void {
    this.burst(5000, 0.5, 0.25, "highpass");
  }
  ding(): void {
    this.tone(1318, 0.9, "sine", 0.3);
    this.tone(2637, 0.6, "sine", 0.1);
    this.tone(3951, 0.3, "sine", 0.04);
  }
  /**
   * The service bell on the counter: a struck steel dome. A click of the striker, then a few
   * inharmonic partials that die away at different rates, the fundamental doubled a few hertz
   * apart so it shimmers as it rings out. `call` (the second tap, which calls someone up) rings
   * a touch brighter.
   */
  bell(call = false): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f0 = 2093 * (1 + (Math.random() - 0.5) * 0.012);
    const partials: [ratio: number, vol: number, decay: number][] = [
      [1, 0.22, 1.9],
      [1.0016, 0.12, 2.2],
      [2.32, 0.07, 0.9],
      [4.25, call ? 0.05 : 0.03, 0.45],
      [6.63, 0.015, 0.22],
    ];
    for (const [ratio, vol, decay] of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f0 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    // The striker's tick.
    this.burst(7500, 0.025, 0.12, "highpass");
  }
  squirt(): void {
    this.burst(1400 + Math.random() * 400, 0.08, 0.12, "bandpass", 700);
  }
  splash(): void {
    this.burst(1200, 0.5, 0.35, "lowpass", 200);
  }
  coin(): void {
    this.tone(988, 0.08, "square", 0.08);
    this.tone(1319, 0.25, "square", 0.08, undefined, 0.08);
  }
  chime(): void {
    this.tone(784, 0.25, "triangle", 0.15);
    this.tone(1175, 0.35, "triangle", 0.12, undefined, 0.1);
  }
  grumble(): void {
    this.tone(110, 0.4, "sawtooth", 0.08, 80);
  }
  pop(): void {
    this.tone(700, 0.08, "sine", 0.2, 1400);
  }
  whoosh(): void {
    this.burst(300, 0.3, 0.15, "bandpass", 1500);
  }
  /** The fryer's timer: a short double beep, repeated while a basket sits at perfect. */
  beep(): void {
    this.tone(1760, 0.07, "square", 0.06);
    this.tone(1760, 0.07, "square", 0.06, undefined, 0.12);
  }
  /** One shake of the salt shaker. */
  shake(): void {
    this.burst(6000 + Math.random() * 1500, 0.07, 0.08, "highpass");
  }
}

/** Vibration on/off, from the game menu. Remembered on this device. */
let haptics = (() => {
  try {
    return localStorage.getItem("bv-haptics") !== "0";
  } catch {
    return true;
  }
})();
export const hapticsSupported = (): boolean => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
export const hapticsOn = (): boolean => haptics;
export function setHaptics(on: boolean): void {
  haptics = on;
  try {
    localStorage.setItem("bv-haptics", on ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); the setting just won't stick.
  }
}

export function buzz(ms: number | number[]): void {
  if (!haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers throw when vibration is blocked; haptics are optional.
  }
}
