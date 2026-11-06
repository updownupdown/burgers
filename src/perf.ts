/**
 * Graphics level on first start, and the one automatic step down (DESIGN §52).
 *
 * A new install starts on Standard. During a shift, if frames keep taking longer than SLOW_MS for
 * SLOW_FOR seconds, the level drops one step (High to Standard, Standard to Low), once per install,
 * with a toast. Never in the guided first order, and not in the first seconds of a shift, while
 * shaders are still compiling.
 */
export type Gfx = "high" | "standard" | "low";

export const DEFAULT_GFX: Gfx = "standard";
const GFX_KEY = "bv-gfx";
const AUTO_KEY = "bv-gfx-auto";

/** The level saved in Settings, or the default. */
export function storedGfx(): Gfx {
  try {
    const saved = localStorage.getItem(GFX_KEY);
    if (saved === "high" || saved === "standard" || saved === "low") return saved;
  } catch {
    // ignore
  }
  return DEFAULT_GFX;
}

export const SLOW_MS = 25;
export const SLOW_FOR = 4;
/** Seconds at the start of each shift that don't count. */
export const WARMUP = 3;

export function stepDown(g: Gfx): Gfx | null {
  return g === "high" ? "standard" : g === "standard" ? "low" : null;
}

/**
 * Watches frame times. `sample` takes the real time between two frames (ms) and whether this frame
 * counts (a shift running, nothing guided); it returns true once, when the step down is due.
 */
export class FrameWatch {
  /** Smoothed frame time, ms. */
  avg = 16.7;
  slowFor = 0;
  counted = 0;
  done: boolean;

  constructor(done = false) {
    this.done = done;
  }

  /** A new shift: the warm-up starts again. */
  reset(): void {
    this.counted = 0;
    this.slowFor = 0;
    this.avg = 16.7;
  }

  sample(ms: number, counts: boolean): boolean {
    if (this.done || !counts) return false;
    // A frame over 250 ms is a hitch (a tab switch, a GC, a modal); it says nothing about the GPU.
    if (!(ms > 0) || ms > 250) return false;
    const s = ms / 1000;
    this.counted += s;
    this.avg += (ms - this.avg) * 0.08;
    if (this.counted < WARMUP) return false;
    this.slowFor = this.avg > SLOW_MS ? this.slowFor + s : 0;
    if (this.slowFor >= SLOW_FOR) {
      this.done = true;
      return true;
    }
    return false;
  }
}

/** Has the automatic step down already happened on this install? */
export function autoStepped(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAutoStepped(): void {
  try {
    localStorage.setItem(AUTO_KEY, "1");
  } catch {
    // ignore
  }
}
