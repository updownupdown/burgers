import type { Piece } from "./types";

/*
 * The peel at Orchard Isle's oven (DESIGN §24, after builds #69 and #71). The peel is the only
 * thing that moves a flatbread: it's dragged by its handle; pushed forward under a pie, or flicked
 * up with its blade under one, it scoops the pie onto it; a quick swipe down drops the pie off it
 * where it is; and pushing a pie in the oven sideways with the blade's tip spins it round, the way
 * a pizzaiolo turns a pie. These are the rules, kept apart from the input and drawing so they can
 * be tested.
 */

/** A point or a vector on the counter top (page-local x, z). */
export interface XZ {
  x: number;
  z: number;
}
/** A finger sample: screen pixels and a timestamp in ms. */
export interface Sample {
  x: number;
  y: number;
  t: number;
}

/**
 * A swipe counts when the finger travels at least `dist` px up or down the screen within `window`
 * ms, more up/down than sideways (`straight`), at `speed` px/ms on average and `peak` px/ms at its
 * quickest. Real thumbs are slow to start, curve a little and wobble, so the swipe up (which only
 * ever lifts a pie) is forgiving; the swipe down (which lets one go) asks a little more. Both have
 * to hold up on a busy phone that only reports the finger every 30 ms or so.
 */
export const FLICK = {
  window: 280,
  tremor: 2.5,
  up: { dist: 22, speed: 0.18, peak: 0.25, straight: 0.7 },
  down: { dist: 26, speed: 0.22, peak: 0.35, straight: 0.9 },
};

/** A swipe: which way, the sample it started from (where the peel was when it began) and the samples along it. */
export interface Flick {
  dir: "up" | "down";
  from: Sample;
  path: Sample[];
}

/** Quickest speed (px/ms) along `ys`, over spans of at least 24 ms so a single jittery sample can't fake it. */
function peakSpeed(path: readonly Sample[], sign: number): number {
  let best = 0;
  let j = 0;
  for (let i = 1; i < path.length; i++) {
    while (j + 1 < i && path[i].t - path[j + 1].t >= 24) j++;
    const dt = path[i].t - path[j].t;
    if (dt <= 0) continue;
    best = Math.max(best, (sign * (path[i].y - path[j].y)) / Math.max(dt, 24));
  }
  return best;
}

/** Up or down if the samples since `since` (ms) end in a quick vertical swipe, else null. */
export function flickOf(samples: readonly Sample[], since = -Infinity): Flick | null {
  const end = samples[samples.length - 1];
  if (!end) return null;
  const recent = samples.filter((s) => s.t >= since && end.t - s.t <= FLICK.window);
  if (recent.length < 2) return null;
  for (const dir of ["up", "down"] as const) {
    const sign = dir === "up" ? -1 : 1;
    const f = FLICK[dir];
    // Measure from the sample furthest the other way, so a swipe that starts mid-drag counts: the
    // last one within a finger's tremor of it, so a pause before the swipe isn't counted in it.
    let m = recent[0].y;
    for (const q of recent) if (sign * (q.y - m) < 0) m = q.y;
    let k = 0;
    for (let i = 0; i < recent.length; i++) if (sign * (recent[i].y - m) <= FLICK.tremor) k = i;
    const from = recent[k];
    const dy = sign * (end.y - from.y);
    const dx = Math.abs(end.x - from.x);
    const dt = Math.max(1, end.t - from.t);
    if (dy < f.dist || dy < dx * f.straight || dy / dt < f.speed) continue;
    const path = recent.slice(k);
    if (peakSpeed(path, sign) < f.peak) continue;
    return { dir, from, path };
  }
  return null;
}

/** The blade's half sizes. */
export interface Blade {
  rx: number;
  rz: number;
}
/**
 * How the blade has to sit under a pie (or a free spot) for a swipe up to scoop it (or a swipe down
 * to set one there): the pie's centre over the blade, at least `x` in from its sides, past its tip
 * by `tip` and not behind its back edge.
 */
export const UNDER = { x: 0.3, tip: 0.12, back: 0.12 };

/** The blade centred at `b` is under a pie (or a free spot) centred at `p`: a swipe up there scoops it. */
export function underPie(b: XZ, p: XZ, blade: Blade): boolean {
  const dz = p.z - b.z;
  return Math.abs(p.x - b.x) < blade.rx - UNDER.x && dz > -blade.rz + UNDER.tip && dz < blade.rz - UNDER.back;
}

/** How far a pie's centre at `p` is past the tip (the far edge) of the blade centred at `b`: positive once it's over the blade. */
export const tipDepth = (b: XZ, p: XZ, blade: Blade): number => p.z - (b.z - blade.rz);

/**
 * Sliding the blade under a pie scoops it, as with a real peel: push it forward until the pie's
 * centre is `take` past the tip. It only counts coming in from the front: the tip has to have been
 * in front of the pie (less than `arm` past it), level with it (`x`, as for a swipe), so a pie
 * just set down, or one the blade came at from the side, stays where it is.
 */
export const SLIDE = { arm: 0.25, take: 0.62, x: 0.3 };

/** Whether a slide under the pie at `p` is armed, after the blade moved to `b` (`was`: armed before). */
export function slideArmed(was: boolean, b: XZ, p: XZ, blade: Blade): boolean {
  const depth = tipDepth(b, p, blade);
  if (depth < SLIDE.arm) return true;
  if (Math.abs(p.x - b.x) >= blade.rx - SLIDE.x) return false;
  return was;
}
/** The blade at `b` has slid far enough under the pie at `p` to take it (the slide has to be armed). */
export function slidUnder(b: XZ, p: XZ, blade: Blade): boolean {
  const depth = tipDepth(b, p, blade);
  return Math.abs(p.x - b.x) < blade.rx - SLIDE.x && depth >= SLIDE.take && depth <= blade.rz * 2;
}

/** The point of the blade (a rectangle centred at `b`) nearest to `p`. */
export function nearestOnBlade(b: XZ, p: XZ, blade: Blade): XZ {
  return { x: Math.max(b.x - blade.rx, Math.min(b.x + blade.rx, p.x)), z: Math.max(b.z - blade.rz, Math.min(b.z + blade.rz, p.z)) };
}

/** A pie's footprint on the deck (game units, half sizes of its oval, crust included). */
export const PIE_FOOT = { rx: 0.92, rz: 0.7 };

/**
 * How far the blade centred at `b` reaches into the oval of a pie centred at `p`, turned `yaw`:
 * 1 at the rim, less inside it, more outside it (measured at the blade's point nearest the pie's centre).
 */
export function rimReach(b: XZ, p: XZ, yaw: number, blade: Blade): number {
  const c = nearestOnBlade(b, p, blade);
  const wx = c.x - p.x;
  const wz = c.z - p.z;
  const lx = wx * Math.cos(yaw) - wz * Math.sin(yaw);
  const lz = wx * Math.sin(yaw) + wz * Math.cos(yaw);
  return Math.hypot(lx / PIE_FOOT.rx, lz / PIE_FOOT.rz);
}
/** The blade overlaps a pie's footprint (it slips under its edge, so the pie rides up onto it). */
export const bladeUnder = (b: XZ, p: XZ, yaw: number, blade: Blade): boolean => rimReach(b, p, yaw, blade) < 1;

/**
 * Nudging. The tip has to be right at the pie's rim (`skin` outside it to `inside` under it),
 * the pie a little less than rigid to the push (`gain`), and it holds still (static friction)
 * until the tip has been against it `hold` seconds and a push would have turned it `breakaway`
 * radians: a deliberate shove turns it, a quick brush on the way past doesn't. Let go, it keeps only `coast` of its spin, which dies off at `friction` per second.
 */
export const NUDGE = { gain: 0.9, skin: 0.1, inside: 0.55, breakaway: 0.35, hold: 0.15, coast: 0.15, friction: 9 };

/** The blade's tip (or a corner) is at the rim of a pie centred at `p`, turned `yaw`: where a push sideways turns it. */
export function atRim(b: XZ, p: XZ, yaw: number, blade: Blade): boolean {
  if (p.z > b.z - blade.rz) return false;
  const e = rimReach(b, p, yaw, blade);
  return e <= 1 + NUDGE.skin && e >= NUDGE.inside;
}

/**
 * How far (radians about y, three.js sense: positive swings a pie's right side toward the back) a
 * pie turned `yaw` and centred at `p` would turn when the blade centred at `b` moves by `d` while its
 * tip (or a corner) is at the pie's rim: slide the tip sideways along the front of a pie and it
 * spins. Zero when the blade doesn't touch the pie, or is under or beside it, or pushes straight
 * at its middle. Friction is applied by `grip`.
 */
export function nudgeSpin(b: XZ, d: XZ, p: XZ, yaw: number, blade: Blade): number {
  // Only the blade's tip (its far edge and corners) turns a pie: a pie beside the blade, level
  // with it, is a neighbour the blade brushes past on its way in or out, and a pie whose centre
  // is over the blade is being scooped.
  if (!atRim(b, p, yaw, blade)) return 0;
  const c = nearestOnBlade(b, p, blade);
  const rx = c.x - p.x;
  const rz = c.z - p.z;
  const r2 = rx * rx + rz * rz;
  if (r2 < 0.04) return 0;
  return (NUDGE.gain * (rz * d.x - rx * d.z)) / r2;
}

/**
 * Static friction on a nudge: `strain` is how far the blade has pushed (in radians it would have
 * turned the pie) without the pie giving, and `touching` how long (s) the tip has been against it.
 * Returns the turn the pie actually makes and the new strain. Until the tip has been there `hold`
 * seconds the blade just slips along the crust; pushing back the other way takes up the slack first.
 */
export function grip(strain: number, dYaw: number, touching = Infinity): [number, number] {
  const s = strain + dYaw;
  const B = NUDGE.breakaway;
  if (touching < NUDGE.hold) return [0, Math.max(-B, Math.min(B, s))];
  if (Math.abs(s) <= B) return [0, s];
  return [s - Math.sign(s) * B, Math.sign(s) * B];
}

/** Turn a pie by `dYaw` radians (no count is kept: how evenly it bakes is what shows). */
export function spinPie(d: Piece, dYaw: number): void {
  d.yaw = pieYawOf(d) + dYaw;
}

/** A pie's yaw (radians about y): as nudged round, 0 with its half A to the back wall. */
export const pieYawOf = (d: Piece): number => d.yaw ?? 0;
