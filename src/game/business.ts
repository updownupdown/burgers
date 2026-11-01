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

/** A well-rated truck draws a few more people: 0.9 at 1 star, 1.05 at 2, 1.2 at 3. */
export function ratingFactor(rep: number): number {
  return 0.75 + 0.15 * Math.max(0, Math.min(3, rep));
}

export interface Review {
  stars: number;
  text: string;
  stop: string;
}

const GREAT = ["Best burger on the road!", "Worth the detour.", "I'd drive back for this.", "Ten out of ten, would honk again."];
const OKAY = ["Pretty good.", "Solid lunch.", "Not bad at all.", "Would stop again."];
const MEH = ["Meh.", "Could be better.", "Not my favourite.", "Disappointing."];

/** A one-line review from a served (or abandoned) order. */
export function reviewFor(stars: number, notes: string[], rng: () => number, walkedOut = false): string {
  const pick = (xs: string[]) => xs[Math.floor(rng() * xs.length)];
  const note = notes[0] ? notes[0].charAt(0).toUpperCase() + notes[0].slice(1) : "";
  if (walkedOut) return "Waited forever and left hungry.";
  return stars === 3 ? pick(GREAT) : stars === 2 ? (note ? `${note}, but good.` : pick(OKAY)) : note ? `${pick(MEH)} ${note}.` : pick(MEH);
}

/** Rolling average: recent shifts count, but one bad day doesn't sink the truck. */
export function nextReputation(rep: number, weight: number, shiftStars: number[]): { rep: number; weight: number } {
  if (!shiftStars.length) return { rep, weight };
  const sum = shiftStars.reduce((a, b) => a + b, 0);
  const w = Math.min(weight, 40);
  const n = shiftStars.length;
  return { rep: (rep * w + sum) / (w + n), weight: w + n };
}
