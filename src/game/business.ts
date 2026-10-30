import type { Recipe, Stop } from "./stops";
import type { FriesSize, Kind, Size } from "./types";

/**
 * Optional business mode: the player runs the truck's books. Before each shift they pick
 * ingredient quality, menu prices and which recipes to offer. Quality makes food taste
 * better but costs more; prices set how far each sale goes and how many people stop by.
 * Ratings feed a reputation that carries across shifts and brings in (or keeps away) traffic.
 */

export type Quality = "budget" | "standard" | "premium";
export type PriceLevel = "low" | "fair" | "high";

export interface Plan {
  quality: Quality;
  price: PriceLevel;
  /** Recipe names on today's menu. */
  menu: string[];
}

export const QUALITY: Record<Quality, { label: string; cost: number; taste: number; blurb: string }> = {
  budget: { label: "Budget", cost: 0.6, taste: -1, blurb: "Frozen patties, plain buns. Cheap, and it shows." },
  standard: { label: "Standard", cost: 1, taste: 0, blurb: "Good fresh ingredients." },
  premium: { label: "Premium", cost: 1.7, taste: 1, blurb: "Local beef, bakery buns. Customers notice." },
};

export const PRICE: Record<PriceLevel, { label: string; mult: number; value: number; traffic: number; blurb: string }> = {
  low: { label: "Low", mult: 0.8, value: 1, traffic: 1.3, blurb: "Crowds, and they're forgiving." },
  fair: { label: "Fair", mult: 1, value: 0, traffic: 1, blurb: "What people expect to pay." },
  high: { label: "High", mult: 1.3, value: -1, traffic: 0.72, blurb: "Fewer, pickier customers." },
};

export type CrowdId = "commuters" | "families" | "foodies" | "party";

/**
 * Who turns up in a town. Traffic, patience and tips apply in every mode; how much prices
 * and ingredient quality sway them only matters in business mode.
 */
export const CROWD: Record<
  CrowdId,
  { label: string; blurb: string; traffic: number; patience: number; tips: number; priceSensitivity: number; qualityWeight: number }
> = {
  commuters: { label: "Commuters", blurb: "Lots of them, in a hurry, watching their wallets.", traffic: 1.2, patience: 0.8, tips: 0.8, priceSensitivity: 1.3, qualityWeight: 0.6 },
  families: { label: "Families", blurb: "A steady stream, patient, love their sides.", traffic: 1, patience: 1.15, tips: 1, priceSensitivity: 1, qualityWeight: 1 },
  foodies: { label: "Foodies", blurb: "Fewer people with deeper pockets. They notice good ingredients.", traffic: 0.8, patience: 1, tips: 1.5, priceSensitivity: 0.5, qualityWeight: 1.6 },
  party: { label: "Party crowd", blurb: "Huge, hungry and not fussy, but every cent counts.", traffic: 1.35, patience: 0.9, tips: 0.7, priceSensitivity: 1.4, qualityWeight: 0.5 },
};

/** Rating points (out of 100) each step of taste or value is worth. */
const STEP = 8;

/** Standard-quality cost of each ingredient as it comes out of the bin. */
export const KIND_COST: Record<Kind, number> = {
  bun: 0.35,
  patty: 1.3,
  bacon: 0.55,
  egg: 0.3,
  cheese: 0.3,
  lettuce: 0.12,
  tomato: 0.18,
  onion: 0.1,
  pickle: 0.1,
  pineapple: 0.35,
  jalapeno: 0.15,
  ketchup: 0.06,
  mustard: 0.06,
};
/** Frozen fries for a full basket (three scoops). */
export const FRIES_BATCH_COST = 1.0;
export const CARTON_COST: Record<FriesSize, number> = { S: 0.08, M: 0.1, L: 0.12 };
export const CUP_COST: Record<Size, number> = { S: 0.08, M: 0.1, L: 0.12 };
/** Soda in a full cup. */
export const SODA_COST: Record<Size, number> = { S: 0.2, M: 0.3, L: 0.4 };

export function defaultPlan(stop: Stop): Plan {
  return { quality: "standard", price: "fair", menu: stop.menu.map((r) => r.name) };
}

/** Keep a saved plan valid for this stop: known recipes only, at least two of them. */
export function planFor(stop: Stop, saved: Plan | null): Plan {
  const plan = saved ? { ...saved } : defaultPlan(stop);
  plan.menu = plan.menu.filter((n) => stop.menu.some((r) => r.name === n));
  if (plan.menu.length < 2) plan.menu = stop.menu.map((r) => r.name);
  return plan;
}

export function menuOf(stop: Stop, plan: Plan): Recipe[] {
  const m = stop.menu.filter((r) => plan.menu.includes(r.name));
  return m.length ? m : stop.menu;
}

/** Points added to (or taken from) every order's score. Premium food at high prices nets out to zero. */
export function ratingBonus(plan: Plan, crowd: CrowdId = "families", wtp = 0): number {
  const c = CROWD[crowd];
  // Willingness to pay (from fame and reviews) makes the same price feel like better value, up to a point.
  const value = Math.min(1, PRICE[plan.price].value + wtp);
  return Math.round(STEP * (QUALITY[plan.quality].taste * c.qualityWeight + value * c.priceSensitivity));
}

/** A bigger menu and a better reputation both bring more people to the window. */
export function trafficMult(plan: Plan, reputation: number, menuSize: number, crowd: CrowdId = "families"): number {
  const variety = Math.min(1.12, 0.78 + 0.08 * menuSize);
  const rep = 0.75 + 0.15 * reputation;
  // Price-sensitive crowds react more strongly to cheap or dear menus.
  const price = Math.pow(PRICE[plan.price].traffic, CROWD[crowd].priceSensitivity);
  return price * variety * rep;
}

/** Ingredient cost of one burger as ordered, for the planning screen. */
export function recipeCost(recipe: Recipe, quality: Quality): number {
  return recipe.layers.reduce((s, k) => s + KIND_COST[k], 0) * QUALITY[quality].cost;
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
export function reviewFor(stars: number, notes: string[], plan: Plan, rng: () => number, walkedOut = false): string {
  const pick = (xs: string[]) => xs[Math.floor(rng() * xs.length)];
  const note = notes[0] ? notes[0].charAt(0).toUpperCase() + notes[0].slice(1) : "";
  if (walkedOut) return plan.price === "high" ? "Waited forever at those prices. Left hungry." : "Waited forever and left hungry.";
  const extras: string[] = [];
  if (plan.quality === "premium" && stars >= 2) extras.push("You can taste the quality.");
  if (plan.quality === "budget" && stars <= 1) extras.push("Tasted cheap.");
  if (plan.price === "low" && stars >= 2) extras.push("Great value!");
  if (plan.price === "high" && stars <= 1) extras.push("Not worth the price.");
  const head = stars === 3 ? pick(GREAT) : stars === 2 ? (note ? `${note}, but good.` : pick(OKAY)) : note ? `${pick(MEH)} ${note}.` : pick(MEH);
  return [head, ...extras.slice(0, 1)].join(" ");
}

/** Rolling average: recent shifts count, but one bad day doesn't sink the truck. */
export function nextReputation(rep: number, weight: number, shiftStars: number[]): { rep: number; weight: number } {
  if (!shiftStars.length) return { rep, weight };
  const sum = shiftStars.reduce((a, b) => a + b, 0);
  const w = Math.min(weight, 40);
  const n = shiftStars.length;
  return { rep: (rep * w + sum) / (w + n), weight: w + n };
}
