import type { Doneness, Piece } from "./types";

/** Seconds of grill time per unit of cook on one face. A side goes raw to medium in about 7s; patties cook at a third of that pace. */
export const GRILL_RATE = 0.08;
export const FRY_RATE = 0.075;

export function pattyLabel(t: number): string {
  if (t < 0.18) return "Raw";
  if (t < 0.43) return "Rare";
  if (t < 0.67) return "Medium";
  if (t < 0.92) return "Well done";
  return "Burnt";
}

export function pattyDoneness(t: number): Doneness | "raw" | "burnt" {
  if (t < 0.18) return "raw";
  if (t < 0.43) return "rare";
  if (t < 0.67) return "medium";
  if (t < 0.92) return "well";
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

/** Melt per second: fast on a hot patty, slow on the warm end or under the heat lamp. */
export const MELT_RATE = { hot: 0.45, warm: 0.14, lamp: 0.12 };

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
