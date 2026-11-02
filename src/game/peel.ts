import { fireHalf } from "./cooking";
import type { Piece } from "./types";

/*
 * The peel at Orchard Isle's oven (DESIGN §24, after build #69). The peel is the only thing that
 * moves a flatbread: it's dragged by its handle, a quick swipe up with its blade under a pie
 * scoops the pie onto it, a quick swipe down drops the pie off it where it is, and nudging a pie
 * in the oven with the blade's edge or corner spins it round, the way a pizzaiolo turns a pie.
 * These are the rules, kept apart from the input and drawing so they can be tested.
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
 * ms, mostly vertically, at `speed` px/ms on average. Forgiving on a phone: a short, quick flick
 * of the thumb is plenty, while dragging the peel about at a normal pace never trips it.
 */
export const FLICK = { dist: 30, speed: 0.5, window: 160, straight: 1.1 };

/** A swipe: which way, and the sample it started from (where the peel was when it began). */
export interface Flick {
  dir: "up" | "down";
  from: Sample;
}
/** Up or down if the samples since `since` (ms) end in a quick vertical swipe, else null. */
export function flickOf(samples: readonly Sample[], since = -Infinity): Flick | null {
  const end = samples[samples.length - 1];
  if (!end) return null;
  const recent = samples.filter((s) => s.t >= since && end.t - s.t <= FLICK.window);
  if (recent.length < 2) return null;
  // Measure from the sample that's furthest the other way, so a swipe that starts mid-drag counts.
  let from = recent[0];
  for (const s of recent) if (Math.sign(end.y - s.y) === Math.sign(end.y - from.y) && Math.abs(end.y - s.y) > Math.abs(end.y - from.y)) from = s;
  const dy = end.y - from.y;
  const dx = end.x - from.x;
  const dt = Math.max(1, end.t - from.t);
  if (Math.abs(dy) < FLICK.dist || Math.abs(dy) < Math.abs(dx) * FLICK.straight || Math.abs(dy) / dt < FLICK.speed) return null;
  return { dir: dy < 0 ? "up" : "down", from };
}

/** The blade's half sizes, and how far a pie's centre may sit from the blade's centre for the blade to be under it. */
export interface Blade {
  rx: number;
  rz: number;
}
/** How far inside the blade's edge a pie's centre must be for a scoop (or a drop onto that spot). */
export const UNDER_MARGIN = { x: 0.42, z: 0.3 };

/** The blade centred at `b` is under a pie (or a free spot) centred at `p`: a swipe up there scoops it. */
export function underPie(b: XZ, p: XZ, blade: Blade): boolean {
  return Math.abs(p.x - b.x) < blade.rx - UNDER_MARGIN.x && Math.abs(p.z - b.z) < blade.rz - UNDER_MARGIN.z;
}

/** The point of the blade (a rectangle centred at `b`) nearest to `p`. */
export function nearestOnBlade(b: XZ, p: XZ, blade: Blade): XZ {
  return { x: Math.max(b.x - blade.rx, Math.min(b.x + blade.rx, p.x)), z: Math.max(b.z - blade.rz, Math.min(b.z + blade.rz, p.z)) };
}

/** Spin from a nudge is a little more than a rigid push would give, so a few short nudges turn a pie. */
export const NUDGE_GAIN = 1.3;

/**
 * How far (radians about y, three.js sense: positive swings a pie's right side toward the back) a
 * pie of radius `r` centred at `p` turns when the blade centred at `b` moves by `d` while its tip
 * (or a corner) touches the pie's rim: slide the tip sideways along the front of a pie and it
 * spins. Zero when the blade doesn't touch the pie, or is under or beside it, or pushes straight
 * at its middle.
 */
export function nudgeSpin(b: XZ, d: XZ, p: XZ, r: number, blade: Blade): number {
  // Only the blade's tip (its far edge and corners) or its back edge turns a pie: a pie beside the
  // blade, level with it, is a neighbour the blade brushes past on its way in or out.
  if (Math.abs(p.z - b.z) <= blade.rz) return 0;
  const c = nearestOnBlade(b, p, blade);
  const rx = c.x - p.x;
  const rz = c.z - p.z;
  const r2 = rx * rx + rz * rz;
  // The pie's centre is over the blade (part under it): no lever to turn it by.
  if (r2 < 0.04 || r2 > r * r) return 0;
  return (NUDGE_GAIN * (rz * d.x - rx * d.z)) / r2;
}

/**
 * Turn a pie by `dYaw` radians. Its half A (cook[0]) faces the back (the oven's hot wall) while
 * cos(yaw) > 0; each time the other half swings round to face it, that's a turn. A little
 * hysteresis either side of sideways keeps a pie nudged to and fro there from counting twice.
 * True if this nudge turned the other half to the heat.
 */
export function spinPie(d: Piece, dYaw: number): boolean {
  d.yaw = pieYawOf(d) + dYaw;
  const c = Math.cos(d.yaw);
  const want = c > 0.12 ? 0 : c < -0.12 ? 1 : fireHalf(d);
  if (want === fireHalf(d)) return false;
  d.turns = (d.turns ?? 0) + 1;
  return true;
}

/** A pie's yaw (radians about y): as nudged, or from its turns for one that was turned the old way. */
export const pieYawOf = (d: Piece): number => d.yaw ?? fireHalf(d) * Math.PI;
