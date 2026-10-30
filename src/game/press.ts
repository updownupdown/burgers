import type { CrowdId } from "./business";
import type { Stop, TownEvent } from "./stops";

/**
 * Food critics and the press. Now and then a critic orders; how they rate the burger becomes
 * a newspaper piece, a magazine article or a TV spot, which moves the truck's popularity.
 * Popularity brings more customers, and together with reputation it raises what people will pay.
 */

export type Outlet = "paper" | "magazine" | "tv";

export interface PressPiece {
  outlet: Outlet;
  source: string;
  headline: string;
  quote: string;
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

/** Popularity change from a critic's verdict, scaled by how many people the outlet reaches. */
export function popularityChange(stars: number, outlet: Outlet): number {
  const base = [-12, -6, 4, 12][stars] ?? 0;
  return Math.round(base * REACH[outlet]);
}

const HEADLINES: string[][] = [
  ["Skip the burger truck in {town}", "Bun Voyage runs out of road"],
  ["Bun Voyage stalls in {town}", "Burger truck needs a tune-up"],
  ["A solid stop in {town}", "Bun Voyage: good, not great"],
  ["Burgers worth a road trip", "Don't miss Bun Voyage while it's in {town}", "The best thing on wheels in {town}"],
];
const PRAISE = ["Every layer exactly right.", "I went back for seconds.", "Toasted, melted, perfect.", "This is what a burger should be."];

export function pieceFor(stars: number, notes: string[], town: Stop, event: TownEvent | null, rng: () => number): PressPiece {
  const { outlet, source } = outletFor(town, event, rng);
  const pick = (xs: string[]) => xs[Math.floor(rng() * xs.length)];
  const headline = pick(HEADLINES[stars]).replace("{town}", town.name);
  const note = notes[0] ? notes[0].charAt(0).toUpperCase() + notes[0].slice(1) + "." : "";
  const quote = stars === 3 ? pick(PRAISE) : stars === 0 && !note ? "I waited and waited, then gave up." : note || "Fine. Just fine.";
  return { outlet, source, headline, quote, stars, pop: popularityChange(stars, outlet) };
}

/** Popularity fades a little each day without news. */
export function fadePopularity(pop: number): number {
  return Math.max(10, pop - 1);
}

/** More people come to a truck they've heard of: 0.9x for an unknown truck, up to 1.3x for a famous one. */
export function popularityTraffic(pop: number): number {
  return 0.9 + 0.4 * Math.min(100, Math.max(0, pop)) / 100;
}

/**
 * How much above a fair price people will happily pay, in price steps: a famous, well-reviewed
 * truck can charge High prices without customers feeling ripped off.
 */
export function willingnessToPay(pop: number, rep: number): number {
  return Math.max(-0.5, Math.min(1, (rep - 2) * 0.5 + (pop / 100) * 0.8));
}
