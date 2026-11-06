/**
 * Small teaching rules from the scope review (DESIGN §49): when a town's "New here" line applies,
 * whether a local ask still has roads to speed up, and the one-time nudge from Relaxed to Steady.
 */
import type { Difficulty } from "./difficulty";
import type { Stop } from "./stops";

/** A town's "New here" line, until a shift there has been passed. */
export function newHere(stop: Pick<Stop, "id" | "newThing">, shiftsIn: Readonly<Record<string, number>>): string | null {
  return stop.newThing && !(shiftsIn[stop.id] ?? 0) ? stop.newThing : null;
}

/** Passing shifts here can still open a road (so a local ask met, counting as two, speeds it up). */
export function roadsAhead(stop: Pick<Stop, "roads">, unlocked: readonly string[]): boolean {
  return stop.roads.some((id) => !unlocked.includes(id));
}

/** Great shifts in a row on Relaxed before the report card suggests Steady. */
export const NUDGE_AFTER = 3;

/** The run of great shifts on Relaxed after this one: a shift that isn't one ends it. */
export function relaxedStreak(before: number, pacing: Difficulty, great: boolean): number {
  return pacing === "chill" && great ? before + 1 : 0;
}

/** Offer Steady on this report card: the run just reached NUDGE_AFTER and it hasn't been offered before. */
export function offerSteady(streak: number, offered: boolean): boolean {
  return !offered && streak >= NUDGE_AFTER;
}
