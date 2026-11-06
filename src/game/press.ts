import type { CrowdId } from "./business";
import { middleOf, type MiddleCounter, type Stop, type TownEvent } from "./stops";

/**
 * Food critics and the press. Now and then a critic orders; how they rate the burger becomes
 * a newspaper piece, a magazine article or a TV spot, which moves the truck's popularity.
 * Popularity brings more customers.
 */

export type Outlet = "paper" | "magazine" | "tv";

export interface PressPiece {
  outlet: Outlet;
  source: string;
  headline: string;
  quote: string;
  /** The critic's verdict, 1..5. */
  stars: number;
  /** Popularity change it caused. */
  pop: number;
}

const CRITIC_CHANCE: Record<CrowdId, number> = { commuters: 0.15, families: 0.25, foodies: 0.6, party: 0.2 };

/** Chance a critic turns up this shift. */
export function criticChance(crowd: CrowdId, event: TownEvent | null): number {
  return Math.min(0.9, CRITIC_CHANCE[crowd] + (event ? 0.2 : 0));
}

/** Big cities and events get TV crews; foodie towns get the magazines; everywhere has a paper. */
export function outletFor(town: Stop, event: TownEvent | null, rng: () => number): { outlet: Outlet; source: string } {
  if ((town.capital || event) && rng() < 0.5) return { outlet: "tv", source: `${town.name} Morning Show` };
  if (town.crowd === "foodies" && rng() < 0.6) return { outlet: "magazine", source: "Open Road Eats" };
  return { outlet: "paper", source: `The ${town.name} ${["Gazette", "Herald", "Courier"][Math.floor(rng() * 3)]}` };
}

const REACH: Record<Outlet, number> = { paper: 1, magazine: 1.4, tv: 1.9 };

/** Popularity change from a critic's verdict (1..5★), scaled by how many people the outlet reaches. */
export function popularityChange(stars: number, outlet: Outlet): number {
  const base = [-12, -8, -3, 4, 12][stars - 1] ?? 0;
  return Math.round(base * REACH[outlet]);
}

/** What the press calls the food, by the middle counter the town cooks on: one, many. */
export const DISH_WORD: Record<MiddleCounter, [string, string]> = { grill: ["burger", "burgers"], press: ["panini", "paninis"], comal: ["taco", "tacos"], oven: ["flatbread", "flatbreads"] };

/** Headlines by the critic's stars, 1★ first; {dish} and {Dishes} are the region's food. */
const HEADLINES: string[][] = [
  ["Skip the {dish} truck in {town}", "Bun Voyage runs out of road"],
  ["Bun Voyage stalls in {town}", "{Dish} truck needs a tune-up"],
  ["Bun Voyage: fine, if you're passing", "A so-so stop in {town}"],
  ["A solid stop in {town}", "Bun Voyage: good, not great"],
  ["{Dishes} worth a road trip", "Don't miss Bun Voyage while it's in {town}", "The best thing on wheels in {town}"],
];
/** Praise by region; the first two fit anywhere. */
const PRAISE_ANY = ["Every layer exactly right.", "I went back for seconds."];
const PRAISE: Record<MiddleCounter, string[]> = {
  grill: ["Toasted, melted, perfect.", "This is what a burger should be."],
  press: ["Pressed crisp, melted through.", "This is what a panini should be."],
  comal: ["Warm tortillas, generous filling.", "These are what tacos should be."],
  oven: ["A crust with real char.", "This is what a flatbread should be."],
};

export function pieceFor(stars: number, notes: string[], town: Stop, event: TownEvent | null, rng: () => number): PressPiece {
  const { outlet, source } = outletFor(town, event, rng);
  const pick = (xs: string[]) => xs[Math.floor(rng() * xs.length)];
  const mid = middleOf(town);
  const [one, many] = DISH_WORD[mid];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const headline = pick(HEADLINES[Math.max(1, Math.min(5, stars)) - 1])
    .replace("{town}", town.name)
    .replace("{dish}", one)
    .replace("{Dish}", cap(one))
    .replace("{Dishes}", cap(many));
  const note = notes[0] ? notes[0].charAt(0).toUpperCase() + notes[0].slice(1) + "." : "";
  const quote = stars === 5 ? pick([...PRAISE_ANY, ...PRAISE[mid]]) : stars === 1 && !note ? "I waited and waited, then gave up." : note || "Fine. Just fine.";
  return { outlet, source, headline, quote, stars, pop: popularityChange(stars, outlet) };
}

/** Popularity fades a little each day without news. */
export function fadePopularity(pop: number): number {
  return Math.max(10, pop - 1);
}

/**
 * More people come to a truck they've heard of: about half the town's trade for a truck nobody
 * knows (popularity 10), the usual trade around 75, and 1.15x for a famous one (flatter at the
 * top since the difficulty study, so success brings a bigger line, not a wall; it was 1.3x). A new
 * truck starts quiet on purpose, so the first shifts teach the kitchen before the line gets long.
 */
export function popularityTraffic(pop: number): number {
  return 0.5 + 0.65 * Math.min(100, Math.max(0, pop)) / 100;
}
