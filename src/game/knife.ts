/**
 * The knife on the cutting board (DESIGN §30): Harbor City cuts its paninis in half, Port Amber
 * cuts its flatbreads in four. In the cut view the player draws the slice; a cut counts once the
 * stroke has gone right across the food and out the other side, and it's judged, modestly, on how
 * straight it is and how near the middle it runs (and, for quarters, how square the two cuts are).
 *
 * Points are in the food's unit square (a panini spans -1..1 along both axes) or unit circle (a
 * flatbread).
 */

export interface Pt {
  x: number;
  z: number;
}

export interface Cut {
  /** Where the slice went in and came out (the straight line it's judged against). */
  a: Pt;
  b: Pt;
  /** Share of the food's width the stroke actually went through, 0..1. */
  cover: number;
  /** How far the line runs from the middle (0 dead centre, 1 at the edge). */
  offset: number;
  /** The most the stroke strayed from a straight line. */
  wobble: number;
  /** 0..1: straight and through the middle is 1. */
  q: number;
}

/** A cut has to go this far across (a tap-then-slice; a slice carried on from dragging the knife in can start a little way in). */
export const CUT_COVER = { tap: 0.7, drag: 0.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function insideFood(p: Pt, round: boolean): boolean {
  return round ? p.x * p.x + p.z * p.z <= 1 : Math.abs(p.x) <= 1 && Math.abs(p.z) <= 1;
}

/** Where a line (point o, unit direction d) runs through the food: its t range, or null if it misses. */
function span(o: Pt, d: Pt, round: boolean): [number, number] | null {
  if (round) {
    // |o + t d|² = 1
    const b = o.x * d.x + o.z * d.z;
    const c = o.x * o.x + o.z * o.z - 1;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    return [-b - s, -b + s];
  }
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [oa, da] of [
    [o.x, d.x],
    [o.z, d.z],
  ]) {
    if (Math.abs(da) < 1e-9) {
      if (Math.abs(oa) > 1) return null;
      continue;
    }
    const a = (-1 - oa) / da;
    const b = (1 - oa) / da;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 > t0 ? [t0, t1] : null;
}

/**
 * Judge a slicing stroke. Null if it never went into the food (or barely moved there). The line is
 * taken from where the stroke went in to where it came out (or ends), including the points just
 * outside, so a slice that starts off the food and sweeps across is measured edge to edge.
 */
export function judgeCut(stroke: readonly Pt[], round: boolean): Cut | null {
  const first = stroke.findIndex((p) => insideFood(p, round));
  if (first < 0) return null;
  let last = first;
  for (let i = stroke.length - 1; i >= first; i--)
    if (insideFood(stroke[i], round)) {
      last = i;
      break;
    }
  const i0 = Math.max(0, first - 1);
  const i1 = Math.min(stroke.length - 1, last + 1);
  const a = stroke[i0];
  const b = stroke[i1];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.2) return null;
  const d = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  // Distance of the middle from the line, and of each point of the stroke from it.
  const perp = (p: Pt) => Math.abs((p.x - a.x) * d.z - (p.z - a.z) * d.x);
  const offset = perp({ x: 0, z: 0 });
  let wobble = 0;
  for (let i = i0; i <= i1; i++) wobble = Math.max(wobble, perp(stroke[i]));
  const sp = span(a, d, round);
  let cover = 0;
  if (sp) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i <= i1; i++) {
      const t = (stroke[i].x - a.x) * d.x + (stroke[i].z - a.z) * d.z;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    cover = clamp01((Math.min(hi, sp[1]) - Math.max(lo, sp[0])) / (sp[1] - sp[0]));
  }
  const q = clamp01(1 - Math.max(0, offset - 0.08) * 1.6 - Math.max(0, wobble - 0.06) * 2.5);
  return { a, b, cover, offset, wobble, q };
}

/** Two cuts for quarters: each judged as above, and the pair on how square they cross. */
export function quarterQuality(c1: Cut, c2: Cut): number {
  const dir = (c: Cut) => {
    const l = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z) || 1;
    return { x: (c.b.x - c.a.x) / l, z: (c.b.z - c.a.z) / l };
  };
  const d1 = dir(c1);
  const d2 = dir(c2);
  const cos = Math.abs(d1.x * d2.x + d1.z * d2.z);
  // Within about 80 degrees of square is fine; two cuts nearly the same way make thin wedges.
  const square = clamp01(1 - Math.max(0, cos - 0.17) * 1.6);
  return clamp01(((c1.q + c2.q) / 2) * (0.7 + 0.3 * square));
}

/** What a finished cut's quality does to the dish's score: at most 5% off for a crooked one. */
export function cutFactor(q: number | undefined): number {
  return 0.95 + 0.05 * clamp01(q ?? 1);
}
/** Below this a customer notices the cut. */
export const CROOKED = 0.45;
