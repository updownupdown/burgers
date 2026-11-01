import type { Doneness, Piece } from "./types";


/** Seconds of grill time per unit of cook on one face. A side goes raw to medium in about 7s; patties cook at a third of that pace. */
export const GRILL_RATE = 0.08;
/**
 * Cook per second for fries in the oil. At this pace a basket turns golden after about 20s,
 * hits perfect at about 29s and goes over at about 38s: long enough to build a burger meanwhile.
 */
export const FRY_RATE = 0.025;

export function pattyLabel(t: number): string {
  return { raw: "Raw", rare: "Rare", medium: "Medium", well: "Well done", burnt: "Burnt" }[pattyDoneness(t)];
}

/** Patty doneness bands, from the patty's cook scale (medium is the wide middle band). */
export function pattyDoneness(t: number): Doneness | "raw" | "burnt" {
  const z = COOK_SCALE.patty;
  if (t < 0.18) return "raw";
  if (t < z.done) return "rare";
  if (t < z.over) return "medium";
  if (t < z.burnt) return "well";
  return "burnt";
}

/** Overall cook of a two-sided item: average of faces. */
export function avgCook(p: Piece): number {
  return (p.cook[0] + p.cook[1]) / 2;
}

/** Buns only toast on the cut face, which starts face down. Flipping gives the dome a tan instead. */
export function bunToast(p: Piece): number {
  return Math.max(p.cook[0], p.cook[1]);
}

export function isToasted(p: Piece): boolean {
  const t = bunToast(p);
  return t >= 0.35 && t < 0.95;
}

/** Cheese counts as melted once it slumps over the patty. */
export function isMelted(p: Piece): boolean {
  return (p.melt ?? 0) >= 0.5;
}

/**
 * Melt per second: on a hot patty a slice counts as melted after about 3.3 s and slumps right
 * over in 6.7 s (a third of the old pace, so there's time to see it go). It barely moves on the
 * warm zone.
 */
export const MELT_RATE = { hot: 0.15, warm: 0.04, lamp: 0.04 };

/**
 * Every cooked thing reads on one meter with three regions: not done enough, done, over-done
 * (the end of the meter is burnt). `perfect` is the line to aim for, in the middle of done.
 * Values are on each kind's own cook scale (see `cookLevel`).
 */
export interface CookScale {
  done: number;
  over: number;
  burnt: number;
  perfect: number;
}
export type Cookable = "patty" | "bacon" | "egg" | "bun" | "pineapple" | "fries";
export const COOK_SCALE: Record<Cookable, CookScale> = {
  // Under: raw and rare. Done: medium. Over: well done, then burnt.
  // Medium is generous: about 50% longer than it used to be (0.43-0.67).
  patty: { done: 0.38, over: 0.74, burnt: 0.97, perfect: 0.56 },
  bacon: { done: 0.4, over: 0.85, burnt: 1.0, perfect: 0.6 },
  egg: { done: 0.35, over: 0.85, burnt: 1.0, perfect: 0.6 },
  bun: { done: 0.35, over: 0.8, burnt: 0.95, perfect: 0.55 },
  pineapple: { done: 0.35, over: 0.8, burnt: 1.0, perfect: 0.55 },
  fries: { done: 0.5, over: 0.95, burnt: 1.3, perfect: 0.725 },
};

/**
 * How cooked a piece is, on its kind's scale. Patties and bacon are the average of their two
 * faces (the face up only gets heat through the meat, so a flip evens them out); an egg is
 * the heat both faces have taken; a bun toasts on whichever face went down.
 */
export function cookLevel(p: Piece): number {
  switch (p.kind) {
    case "patty":
    case "bacon":
      return avgCook(p);
    case "egg":
      return p.cook[0] + p.cook[1];
    default:
      return Math.max(p.cook[0], p.cook[1]);
  }
}

export function cookZone(kind: Cookable, t: number): "under" | "done" | "over" | "burnt" {
  const z = COOK_SCALE[kind];
  return t < z.done ? "under" : t < z.over ? "done" : t < z.burnt ? "over" : "burnt";
}

/** An egg flipped an odd number of times is over easy; otherwise sunny side up. */
export const isFlipped = (p: Piece): boolean => (p.flips ?? 0) % 2 === 1;

/** A patty face seared this hard is charred: flip before the face down gets there. */
export const CHAR_FACE = 1.05;
/** Grill marks show (and count) once a face has spent 4 s down on a hot grille. */
export const MARKED = 0.3;
/** Grill marks per second on a hot grille. */
export const MARK_RATE = 0.075;

/**
 * Fries cook in three zones: underdone (pale and limp), done (golden) and overdone (dark and
 * hard), with burnt past the end. Perfect is the middle of the done zone.
 */
export const FRIES_ZONE = { done: 0.5, over: 0.95, burnt: 1.3 };
export const FRIES_PERFECT = (FRIES_ZONE.done + FRIES_ZONE.over) / 2;

export function friesZone(t: number): "under" | "done" | "over" {
  return t < FRIES_ZONE.done ? "under" : t < FRIES_ZONE.over ? "done" : "over";
}

/**
 * How happy fries make a customer, 0..1. It depends on the zone and on where in it: anywhere
 * in the done zone is good and dead centre is best; underdone gets better towards done, and
 * overdone gets worse the longer they stay in.
 */
export function friesQuality(t: number): number {
  const { done, over, burnt } = FRIES_ZONE;
  if (t < done) return 0.15 + 0.4 * Math.max(0, t / done);
  if (t < over) return 1 - (0.25 * Math.abs(t - FRIES_PERFECT)) / (FRIES_PERFECT - done);
  if (t < burnt) return 0.6 - (0.45 * (t - over)) / (burnt - over);
  return 0.1;
}

/**
 * How full a drink should be: from `full` it counts as a full cup, and `perfect` is the line the
 * pour bar marks to aim for. Past 1 it overflows.
 */
export const DRINK_FILL = { full: 0.78, perfect: 0.9 };

/**
 * Salt on fries, shaken on a little at a time: each shake adds SALT.shake. Under `low` they taste
 * flat, `perfect` is the line to aim for, over `high` is too salty, and it can't go past `max`.
 */
export const SALT = { shake: 0.1, low: 0.35, perfect: 0.6, high: 0.9, max: 1.2 };

export function friesLabel(t: number): string {
  if (t < 0.25) return "Frozen";
  if (t < FRIES_ZONE.done) return "Soggy";
  if (t < FRIES_ZONE.over) return "Golden";
  if (t < FRIES_ZONE.burnt) return "Overdone";
  return "Burnt";
}

export function fillLabel(f: number): string {
  if (f < 0.6) return "Half empty";
  if (f < 0.78) return "A bit low";
  if (f <= 1.0) return "Just right";
  return "Overflowing";
}
