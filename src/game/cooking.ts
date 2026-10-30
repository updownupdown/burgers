import type { Doneness, Piece } from "./types";

/** Seconds of grill time per unit of cook on one face. A side goes raw to medium in about 7s. */
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

export function friesLabel(t: number): string {
  if (t < 0.3) return "Frozen";
  if (t < 0.5) return "Soggy";
  if (t < 0.85) return "Golden";
  if (t < 1.05) return "Extra crispy";
  return "Burnt";
}

export function fillLabel(f: number): string {
  if (f < 0.6) return "Half empty";
  if (f < 0.78) return "A bit low";
  if (f <= 1.0) return "Just right";
  return "Overflowing";
}
