/**
 * The ambient bed (DESIGN §52): a quiet, generated sound of the place, one per region, on the map
 * and in the kitchen under the cooking. Same kit as audio.ts: filtered noise and a few oscillators,
 * no files. No music.
 *
 *   The Pines     wind through the trees, and birds now and then
 *   Sunny Coast   surf rolling in and out, and gulls
 *   Red Rock      dry, gusty wind, and crickets
 *   Orchard Isle  a soft breeze, and bees drifting past
 *
 * Its own switch in Settings (Ambience), apart from Effects. It runs through its own bus to the
 * speakers, so muting the effects leaves it, and the other way round. Regions fade into each other.
 */
import type { RegionId } from "./game/stops";

interface Bed {
  /** The region's level: the bed and its calls go through it. */
  out: GainNode;
  /** When its next call (a bird, a gull...) is due, in context time. */
  next: number;
}

const BED_FADE = 1.6;
/** The whole bed's level: about -32 dB RMS on the map, well under the sizzle and the bell. */
const BUS_GAIN = 2.2;

export class Ambience {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private brown!: AudioBuffer;
  private beds = new Map<RegionId, Bed>();
  private region: RegionId | null = null;
  private level = 0;
  on = true;

  constructor(private audio: () => AudioContext | null) {}

  setOn(on: boolean): void {
    this.on = on;
    if (this.ctx) this.bus.gain.setTargetAtTime(on ? BUS_GAIN : 0, this.ctx.currentTime, 0.3);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.audio();
    if (!ctx) return null;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.on ? BUS_GAIN : 0;
    this.bus.connect(ctx.destination);
    // Brown noise (integrated white), 6 s: softer than white for wind and surf, long enough not to
    // be heard looping under the filters.
    const len = Math.floor(ctx.sampleRate * 6);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.brown.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = v * 3.5;
    }
    // Ease the loop's seam.
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
    }
    return ctx;
  }

  /**
   * Every frame: which region is around the truck (null for none) and how loud the bed should be,
   * 0..1 (full on the map, lower under the cooking, low behind the pause menu).
   */
  update(region: RegionId | null, level: number): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    if (region !== this.region || Math.abs(level - this.level) > 0.01) {
      this.region = region;
      this.level = level;
      if (region && !this.beds.has(region)) this.beds.set(region, this.makeBed(region));
      for (const [id, b] of this.beds) b.out.gain.setTargetAtTime(id === region ? level : 0, t, BED_FADE);
    }
    if (!region || level <= 0 || !this.on) return;
    const bed = this.beds.get(region)!;
    if (t >= bed.next) {
      if (bed.next > 0) this.call(region, bed.out);
      bed.next = t + CALL_GAP[region][0] + Math.random() * CALL_GAP[region][1];
    }
  }

  // ---- beds ------------------------------------------------------------

  private makeBed(region: RegionId): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.bus);
    const bed: Bed = { out, next: ctx.currentTime + 2 + Math.random() * 3 };
    switch (region) {
      case "mountains":
        // Wind in the pines: a low body and a breathy top that swell slowly, out of step.
        this.noiseLayer(out, "lowpass", 380, 0.7, 0.09, 0.11, 0.5);
        this.noiseLayer(out, "bandpass", 1500, 0.6, 0.025, 0.07, 0.8);
        break;
      case "coast":
        // Surf: a low roll and a hiss on the same slow swell, as waves come in and draw back.
      {
        const swell = this.lfo(0.085);
        this.noiseLayer(out, "lowpass", 420, 0.8, 0.12, 0.085, 0.85, swell);
        this.noiseLayer(out, "bandpass", 2600, 0.5, 0.03, 0.085, 0.95, swell);
      }
        break;
      case "desert":
        // Dry wind: thinner and higher, in gusts.
        this.noiseLayer(out, "bandpass", 900, 0.9, 0.13, 0.16, 0.7);
        this.noiseLayer(out, "highpass", 3200, 0.4, 0.03, 0.23, 0.9);
        break;
      case "orchard":
        // A soft breeze, lower and calmer than the Pines.
        this.noiseLayer(out, "lowpass", 300, 0.6, 0.08, 0.06, 0.4);
        break;
    }
    return bed;
  }

  private lfo(hz: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.frequency.value = hz;
    o.start();
    return o;
  }

  /**
   * A looping noise layer: filtered, at `vol`, its level swaying `depth` (0..1) at `hz`. Layers
   * that move together (the surf's roll and hiss) share one `sway`.
   */
  private noiseLayer(out: GainNode, type: BiquadFilterType, freq: number, q: number, vol: number, hz: number, depth: number, sway = this.lfo(hz)): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol * (1 - depth / 2);
    const lfo = sway;
    const amt = ctx.createGain();
    amt.gain.value = (vol * depth) / 2;
    lfo.connect(amt).connect(g.gain);
    // The filter breathes a little with the level, so a swell brightens as it rises.
    const fAmt = ctx.createGain();
    fAmt.gain.value = freq * 0.25 * depth;
    lfo.connect(fAmt).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start(ctx.currentTime, Math.random() * 5);
  }

  // ---- calls -----------------------------------------------------------

  private call(region: RegionId, out: GainNode): void {
    if (region === "mountains") this.birds(out);
    else if (region === "coast") this.gulls(out);
    else if (region === "desert") this.crickets(out);
    else this.bees(out);
  }

  /** A short voice: an oscillator through its own envelope, panned. */
  private voice(out: GainNode, type: OscillatorType, pan: number): { o: OscillatorNode; g: GainNode; end: (t: number) => void } {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    g.gain.value = 0;
    let node: AudioNode = g;
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(out);
    o.start();
    return { o, g, end: (t) => o.stop(t + 0.05) };
  }

  /** Two to four quick chirps, high and bright. */
  private birds(out: GainNode): void {
    const t0 = this.ctx!.currentTime;
    const { o, g, end } = this.voice(out, "sine", Math.random() * 1.4 - 0.7);
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 900;
    let t = t0;
    for (let i = 0; i < n; i++) {
      const d = 0.07 + Math.random() * 0.05;
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.15), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.2), t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.012);
      g.gain.linearRampToValueAtTime(0, t + d);
      t += d + 0.06 + Math.random() * 0.08;
    }
    end(t);
  }

  /** A gull or two, far off: a falling cry, two or three times. */
  private gulls(out: GainNode): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const { o, g, end } = this.voice(out, "triangle", Math.random() * 1.2 - 0.6);
    const n = 2 + Math.floor(Math.random() * 2);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const d = 0.28 + Math.random() * 0.12;
      const f = 1250 + Math.random() * 250;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.08, t + d * 0.2);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.04);
      g.gain.linearRampToValueAtTime(0, t + d);
      t += d + 0.12 + Math.random() * 0.1;
    }
    end(t);
  }

  /** Crickets: a high trill in short pulses for a few seconds. */
  private crickets(out: GainNode): void {
    const t0 = this.ctx!.currentTime;
    const { o, g, end } = this.voice(out, "sine", Math.random() * 1.2 - 0.6);
    o.frequency.value = 4300 + Math.random() * 700;
    const chirps = 4 + Math.floor(Math.random() * 5);
    let t = t0;
    for (let c = 0; c < chirps; c++) {
      for (let p = 0; p < 3; p++) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.007, t + 0.006);
        g.gain.linearRampToValueAtTime(0, t + 0.022);
        t += 0.035;
      }
      t += 0.35 + Math.random() * 0.1;
    }
    end(t);
  }

  /** A bee drifting past: a soft buzz that swells and moves across. */
  private bees(out: GainNode): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const dur = 3 + Math.random() * 2.5;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 190 + Math.random() * 40;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 3;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 7;
    vib.connect(vibAmt).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 650;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.009, t0 + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(f).connect(g);
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      const from = Math.random() < 0.5 ? -0.7 : 0.7;
      p.pan.setValueAtTime(from, t0);
      p.pan.linearRampToValueAtTime(-from, t0 + dur);
      g.connect(p).connect(out);
    } else g.connect(out);
    o.start(t0);
    vib.start(t0);
    o.stop(t0 + dur + 0.05);
    vib.stop(t0 + dur + 0.05);
  }
}

/** Seconds between calls in each region: at least the first, plus up to the second. */
const CALL_GAP: Record<RegionId, [number, number]> = {
  mountains: [4, 8],
  coast: [7, 10],
  desert: [3, 6],
  orchard: [5, 8],
};

/** How loud the bed is in each part of the game, 0..1. */
export const AMBIENCE_LEVEL = { map: 1, kitchen: 0.55, paused: 0.3 } as const;
