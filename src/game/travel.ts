import { LINKS, STOPS, townById } from "./stops";

/**
 * Driving between towns on the road map.
 *
 * Roads join towns as nodes. Since DESIGN §51 there is no range: any open town is one drive away,
 * in the morning or the evening, and the drive happens at once with no time passing. Days pass
 * only by sleeping, so events still fall on their fixed days.
 *
 * Unlocking: working three passed shifts in a town opens the roads out of it. A region's big
 * city opens the next region the same way. The late links (the Old Pass road and the ferry,
 * LINKS in stops.ts) open nothing: they can be driven once both their towns are open.
 */

/** Passed shifts in a town before its roads open. */
export const SHIFTS_TO_UNLOCK = 3;
/** One map unit is about two miles (the map is 120 by 170 units). */
export const MILES_PER_UNIT = 2;

let adjacency: Map<string, string[]> | null = null;

/** Towns joined to `id` by a road or a late link, in either direction. */
export function neighbours(id: string): string[] {
  if (!adjacency) {
    adjacency = new Map(STOPS.map((t) => [t.id, [] as string[]]));
    const join = (a: string, b: string) => {
      adjacency!.get(a)?.push(b);
      adjacency!.get(b)?.push(a);
    };
    for (const t of STOPS) for (const r of t.roads) join(t.id, r);
    for (const l of LINKS) join(l.a, l.b);
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

export interface Trip {
  from: string;
  to: string;
  /** Every town on the way, `from` first. */
  path: string[];
  hops: number;
  /** Road distance in map units. */
  distance: number;
}

/** The part of a save that driving touches. */
export interface Traveller {
  town: string;
}

/**
 * Plan a drive, or null when the town can't be reached (locked, or the truck is already there).
 * Any open town is one drive away, morning or evening, and no time passes (DESIGN §51).
 */
export function planTrip(from: string, to: string, unlocked: readonly string[]): Trip | null {
  if (from === to) return null;
  const path = shortestPath(from, to, unlocked);
  if (!path) return null;
  let dist = 0;
  for (let i = 1; i < path.length; i++) dist += distance(path[i - 1], path[i]);
  return { from, to, path, hops: path.length - 1, distance: dist };
}

/** Drive: move the truck. The time of day stays as it was. */
export function applyTrip(s: Traveller, trip: Trip): void {
  s.town = trip.to;
}

/** Towns whose roads lead to `id`: working three shifts in any of them opens it. */
export function openedBy(id: string): string[] {
  return STOPS.filter((t) => t.roads.includes(id)).map((t) => t.id);
}

/** Passed shifts in a town counted toward opening its roads. */
export function unlockProgress(shiftsIn: Record<string, number>, id: string): { done: number; need: number } {
  return { done: Math.min(SHIFTS_TO_UNLOCK, shiftsIn[id] ?? 0), need: SHIFTS_TO_UNLOCK };
}
