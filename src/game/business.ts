import type { Recipe, Stop } from "./stops";

/**
 * Who comes to the window, and what they think of it. There is no money to run: the menu is
 * the one business choice. Popularity (press.ts) and rating (here) are earned by cooking well;
 * the menu and the shift window (shift.ts) are chosen on the Prep screen.
 */

export type CrowdId = "commuters" | "families" | "foodies" | "party";

/** Who turns up in a town: how many, how patient, how well they tip. */
export const CROWD: Record<CrowdId, { label: string; blurb: string; traffic: number; patience: number; tips: number }> = {
  commuters: { label: "Commuters", blurb: "Lots of them, in a hurry.", traffic: 1.2, patience: 0.8, tips: 0.8 },
  families: { label: "Families", blurb: "A steady stream, patient, love their sides.", traffic: 1, patience: 1.15, tips: 1 },
  foodies: { label: "Foodies", blurb: "Fewer people, and generous when it's good.", traffic: 0.8, patience: 1, tips: 1.5 },
  party: { label: "Party crowd", blurb: "Huge, hungry and not fussy.", traffic: 1.35, patience: 0.9, tips: 0.7 },
};

/** The fewest recipes a menu can show. */
export const MIN_MENU = 2;

/** Today's menu: the town's recipes less the ones the player hid, never fewer than MIN_MENU. */
export function menuFor(stop: Stop, hidden: readonly string[]): Recipe[] {
  const m = stop.menu.filter((r) => !hidden.includes(r.name));
  return m.length >= Math.min(MIN_MENU, stop.menu.length) ? m : stop.menu;
}

/** A longer menu brings more people: 0.8 with two recipes, 1.0 with four, 1.1 from six. */
export function menuFactor(size: number): number {
  return Math.max(0.8, Math.min(1.1, 0.8 + 0.1 * (size - 2) - (size > 4 ? 0.05 * (size - 4) : 0)));
}

/**
 * A well-rated truck draws a few more people: 0.75 at 2★ or below, 0.9 at 3★, 1.05 at 4★ and 1.2
 * at 5★. Takes the rating passers-by see (`ratingPull` in reviews.ts), 1..5.
 */
export function ratingFactor(rating: number): number {
  return 0.75 + 0.15 * Math.max(0, Math.min(3, rating - 2));
}
