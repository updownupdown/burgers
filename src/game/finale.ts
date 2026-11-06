import { BONUSES } from "./bonus";
import { freshSave, type Save } from "./progress";
import { REGULAR_GOAL } from "./regulars";
import { FINAL_TOWN, STOPS, townById } from "./stops";
import { tripState } from "./tripstate";

/**
 * The end of the trip and the lap after it (DESIGN §50, scope review rows 2 and 4).
 *
 * The first pass at Port Amber finishes the road; from the next morning Port Amber holds the last
 * night of the trip (the FINALE event in stops.ts) until it's worked. That shift ends on the trip
 * card, a drive-off and credits, then Keep touring or Start trip 2. A new trip keeps the looks,
 * the postcard book and town bests; savings, bonuses, popularity and reviews start again. A trip
 * after a finish is a lap with a twist: a known truck (popularity 40), a fifth more people
 * everywhere, and gold stamps.
 */

/** What a lap after a finish starts with. */
export const LAP = { popularity: 40, crowd: 1.2 };

/** Which trip this is (1 on the first). */
export const tripNo = (s: Pick<Save, "tripNo">): number => Math.max(1, Math.floor(s.tripNo ?? 1));

/** Make the rules that read tripState (eventOn, expectedCustomers) agree with this save. */
export function syncTrip(s: Pick<Save, "tripNo" | "finale">): void {
  tripState.finaleFrom = s.finale && !s.finale.done ? s.finale.from : null;
  tripState.crowd = tripNo(s) >= 2 ? LAP.crowd : 1;
}

/** The road is done: Port Amber's last night is on from tomorrow (once per trip). */
export function queueFinale(s: Save): void {
  if (!s.finale) s.finale = { from: s.day + 1, done: false };
  syncTrip(s);
}

/** The last night was worked: the festival is over and the trip has ended. */
export function finishFinale(s: Save): void {
  s.finale = { from: s.finale?.from ?? s.day, done: true };
  syncTrip(s);
}

/** True once this trip's last night has been worked. */
export const tripEnded = (s: Pick<Save, "finale">): boolean => !!s.finale?.done;

/** A shift ended: count it, and keep the trip's best order. */
export function noteShift(s: Save, best: { name: string; score: number } | null, town: string): void {
  s.worked = (s.worked ?? 0) + 1;
  if (best && (!s.tripBest || best.score > s.tripBest.score)) s.tripBest = { name: best.name, score: best.score, town };
}

export interface TripStats {
  days: number;
  shifts: number;
  best: { name: string; score: number; town: string } | null;
  /** Every town worked this trip, in road order, with its best shift (★, or null). */
  towns: { id: string; name: string; stars: number | null }[];
  regulars: number;
  regularsOf: number;
  bonuses: number;
  bonusesOf: number;
  savings: number;
}

/** The trip card's numbers. */
export function tripStats(s: Save): TripStats {
  const worked = STOPS.filter((t) => (s.shiftsIn[t.id] ?? 0) > 0 || s.passedTowns.includes(t.id) || t.id === s.town);
  return {
    days: s.day,
    shifts: s.worked ?? Object.values(s.shiftsIn).reduce((a, b) => a + b, 0),
    best: s.tripBest ?? null,
    towns: worked.map((t) => ({ id: t.id, name: t.name, stars: s.best[t.id] ?? null })),
    regulars: Object.values(s.regulars ?? {}).filter((n) => n >= REGULAR_GOAL).length,
    regularsOf: STOPS.length,
    bonuses: s.found.length,
    bonusesOf: BONUSES.length,
    savings: s.bank,
  };
}

/** The trip a new trip would be: the next lap once the road has been finished, else the same one again. */
export function nextTripNo(s: Save): number {
  return tripNo(s) + (s.passedTowns.includes(FINAL_TOWN) ? 1 : 0);
}

/**
 * Start a new trip. Kept: the looks (and what the truck wears), the postcard book, five-star dish
 * counts, town bests, trips finished and tutorial progress. Everything else starts again; a lap
 * after a finish starts better known.
 */
export function startNewTrip(s: Save): void {
  const keep = {
    tutorialDone: s.tutorialDone,
    trips: s.trips,
    best: s.best,
    looks: s.looks,
    look: s.look,
    stamps: s.stamps,
    fives: s.fives,
    tripNo: nextTripNo(s),
  };
  Object.assign(s, freshSave(), keep);
  // Trip-only fields freshSave doesn't list.
  s.finale = null;
  s.worked = 0;
  s.tripBest = null;
  if (keep.tripNo >= 2) s.popularity = LAP.popularity;
  syncTrip(s);
}

/** The town the trip ends in, for copy. */
export const finalTownName = (): string => townById(FINAL_TOWN).name;
