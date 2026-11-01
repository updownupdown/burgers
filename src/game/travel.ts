import type { TimeOfDay } from "./day";
import { STOPS, townById } from "./stops";

/**
 * Driving between towns on the road map.
 *
 * Roads join towns as nodes. The truck has an overnight
 * range (see day.ts): a drive that fits the range left tonight, or this morning, happens at once
 * and no time passes. In the morning a longer drive takes the whole day and lands on the evening
 * map, with no shift that day. In the evening a longer drive has to wait for the morning.
 *
 * Unlocking: working three passed shifts in a town opens the roads out of it. A region's big
 * city opens the next region the same way.
 */

/** Passed shifts in a town before its roads open. */
export const SHIFTS_TO_UNLOCK = 3;
/** For the map's distance labels only: one map unit is about three miles. */
export const MILES_PER_UNIT = 3;

let adjacency: Map<string, string[]> | null = null;

/** Towns joined to `id` by a road, in either direction. */
export function neighbours(id: string): string[] {
  if (!adjacency) {
    adjacency = new Map(STOPS.map((t) => [t.id, [] as string[]]));
    for (const t of STOPS)
      for (const r of t.roads) {
        adjacency.get(t.id)!.push(r);
        adjacency.get(r)?.push(t.id);
      }
  }
  return adjacency.get(id) ?? [];
}

/** Straight-line distance between two towns, in map units. */
export function distance(a: string, b: string): number {
  const ta = townById(a);
  const tb = townById(b);
  return Math.hypot(ta.x - tb.x, ta.y - tb.y);
}

export function miles(dist: number): number {
  return Math.round(dist * MILES_PER_UNIT);
}

/**
 * Shortest road route from one town to another, driving only through unlocked towns.
 * Returns every town on the way, `from` first and `to` last, or null when there is no route.
 */
export function shortestPath(from: string, to: string, unlocked: readonly string[]): string[] | null {
  if (from === to) return [from];
  const open = new Set(unlocked);
  if (!open.has(from) || !open.has(to)) return null;
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set<string>([from]);
  while (todo.size) {
    let cur = "";
    let best = Infinity;
    for (const id of todo) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    todo.delete(cur);
    if (cur === to) break;
    for (const n of neighbours(cur)) {
      if (!open.has(n)) continue;
      const d = best + distance(cur, n);
      if (d < (dist.get(n) ?? Infinity)) {
        dist.set(n, d);
        prev.set(n, cur);
        todo.add(n);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

/**
 * When a drive happens. `now`: it fits the range, so the truck arrives at once and the time of
 * day stays the same. `day`: too far for the range, so it takes the whole day (morning only) and
 * the truck arrives on the evening map. `tomorrow`: too far for tonight; set off in the morning.
 */
export type TripWhen = "now" | "day" | "tomorrow";

export interface Trip {
  from: string;
  to: string;
  /** Every town on the way, `from` first. */
  path: string[];
  hops: number;
  /** Road distance in map units. */
  distance: number;
  when: TripWhen;
}

/** The part of a save that driving touches. */
export interface Traveller {
  town: string;
  time: TimeOfDay;
  /** Map units driven since the last shift or sleep; today's hops add up against the range. */
  driven: number;
}

/** What the truck can do right now: the time of day and the range it has left. */
export interface Legs {
  time: TimeOfDay;
  /** Overnight range in map units (see day.ts). */
  range: number;
  driven: number;
}

/** Plan a drive, or null when the town can't be reached (locked, or the truck is already there). */
export function planTrip(from: string, to: string, unlocked: readonly string[], legs: Legs): Trip | null {
  if (from === to) return null;
  const path = shortestPath(from, to, unlocked);
  if (!path) return null;
  let dist = 0;
  for (let i = 1; i < path.length; i++) dist += distance(path[i - 1], path[i]);
  const hops = path.length - 1;
  const fits = dist + legs.driven <= legs.range + 1e-6;
  const when: TripWhen = fits ? "now" : legs.time === "morning" ? "day" : "tomorrow";
  return { from, to, path, hops, distance: dist, when };
}

/** Drive: move the truck; a day-long drive lands in the evening. False when it can't happen now. */
export function applyTrip(s: Traveller, trip: Trip): boolean {
  if (trip.when === "tomorrow") return false;
  s.town = trip.to;
  if (trip.when === "day") {
    s.time = "evening";
    s.driven = 0;
  } else s.driven += trip.distance;
  return true;
}

/** Towns whose roads lead to `id`: working three shifts in any of them opens it. */
export function openedBy(id: string): string[] {
  return STOPS.filter((t) => t.roads.includes(id)).map((t) => t.id);
}

/** Passed shifts in a town counted toward opening its roads. */
export function unlockProgress(shiftsIn: Record<string, number>, id: string): { done: number; need: number } {
  return { done: Math.min(SHIFTS_TO_UNLOCK, shiftsIn[id] ?? 0), need: SHIFTS_TO_UNLOCK };
}
