import { STOPS, townById } from "./stops";

/**
 * Driving between towns on the road map.
 *
 * Roads join towns as nodes. Driving one road costs a little gas and happens overnight, so it
 * takes no day; but only one such hop fits in a night. Driving further (two roads or more, or a
 * second drive in the same night) takes a whole day and costs gas in proportion to the distance.
 * Days otherwise only pass with shifts.
 *
 * Unlocking: working three passed shifts in a town opens the roads out of it. A region's big
 * city opens the next region the same way.
 */

/** What a new truck starts with. */
export const START_BANK = 120;
/** Gas per map unit driven (towns on a road are 17–55 units apart). */
export const GAS_PER_UNIT = 0.4;
/** The least a drive costs. */
export const MIN_GAS = 4;
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

export function gasCost(dist: number): number {
  return Math.max(MIN_GAS, Math.round(dist * GAS_PER_UNIT));
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

export interface Trip {
  from: string;
  to: string;
  /** Every town on the way, `from` first. */
  path: string[];
  hops: number;
  /** Road distance in map units. */
  distance: number;
  /** Gas money. */
  cost: number;
  /** 0 for an overnight hop, 1 for a day on the road. */
  days: 0 | 1;
}

/** The part of a save that driving touches. */
export interface Traveller {
  town: string;
  bank: number;
  day: number;
  /** The truck already moved tonight, so another drive takes a day. */
  overnightUsed: boolean;
}

/** Plan a drive, or null when the town can't be reached (locked, or the truck is already there). */
export function planTrip(from: string, to: string, unlocked: readonly string[], overnightUsed: boolean): Trip | null {
  if (from === to) return null;
  const path = shortestPath(from, to, unlocked);
  if (!path) return null;
  let dist = 0;
  for (let i = 1; i < path.length; i++) dist += distance(path[i - 1], path[i]);
  const hops = path.length - 1;
  return { from, to, path, hops, distance: dist, cost: gasCost(dist), days: hops === 1 && !overnightUsed ? 0 : 1 };
}

export function canAfford(trip: Trip, bank: number): boolean {
  return bank >= trip.cost;
}

/** Drive: pay the gas, move the truck, and let the day pass for a long trip. False when it can't be paid for. */
export function applyTrip(s: Traveller, trip: Trip): boolean {
  if (!canAfford(trip, s.bank)) return false;
  s.bank -= trip.cost;
  s.town = trip.to;
  s.day += trip.days;
  // A hop uses up the night; a day's drive ends with a fresh night.
  s.overnightUsed = trip.days === 0;
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
