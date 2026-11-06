import { CROWD, menuFactor, menuFor, ratingFactor } from "./business";
import { bonusCrowd, type BonusId } from "./bonus";
import { DIFFICULTY, type Difficulty } from "./difficulty";
import { popularityTraffic } from "./press";
import { tripState } from "./tripstate";
import { crowdShare, DEFAULT_SHIFT, type ShiftWindow } from "./shift";
import { STOPS, type Stop } from "./stops";

/**
 * The shape of one day on the road.
 *
 * A day has two halves the player can act in. In the **morning** the truck is parked on the
 * map in daylight: open the window (after the Prep screen), or set off. In the **evening**, after
 * the shift's Closing screen, the map is dark: see the results, drive to any open town, or sleep.
 * Sleeping is the only thing that turns the day; a drive never costs one (DESIGN §51).
 */
export type TimeOfDay = "morning" | "evening";

/** The part of a save that sleeping touches. */
export interface Sleeper {
  day: number;
  time: TimeOfDay;
  /** Kept in the save from the days of the overnight range; always 0 after a sleep. */
  driven: number;
}

export interface Night {
  /** The day that just ended. */
  day: number;
}

/** Night falls: wake up tomorrow morning. */
export function sleep(s: Sleeper): Night {
  const day = s.day;
  s.day++;
  s.time = "morning";
  s.driven = 0;
  return { day };
}

export interface CrowdInput {
  /** The town as it plays today (event applied). */
  stop: Stop;
  popularity: number;
  /** The rating passers-by see, 1..5 (`ratingPull` in reviews.ts). */
  rating: number;
  /** Recipe names hidden from the menu. */
  hidden: readonly string[];
  shift?: ShiftWindow;
  bonuses?: readonly BonusId[];
  /** Relaxed brings fewer people, Busy more (DifficultySpec.crowd). */
  pacing?: Difficulty;
  /** Shifts already passed in this town's region (regionShifts): word takes a few days to reach a new region. */
  regionShifts?: number;
}

/**
 * A new region's first shifts bring fewer people (difficulty study): popularity carries over from
 * the last region, so without this a region's first town met a brand-new kitchen with about 1.75x
 * Pinecrest's first crowd. The first passed shift there brings 0.6 of the crowd, then 0.75, then 0.9.
 */
export const NEW_REGION = [0.6, 0.75, 0.9];
export function newRegionCrowd(regionShifts: number): number {
  return NEW_REGION[Math.max(0, Math.floor(regionShifts))] ?? 1;
}

/** Shifts passed in any town of `stop`'s region (the first region never counts as new: the truck is new there anyway). */
export function regionShifts(shiftsIn: Record<string, number>, stop: Stop): number {
  if (stop.region === STOPS[0].region) return 99;
  return STOPS.filter((t) => t.region === stop.region).reduce((n, t) => n + (shiftsIn[t.id] ?? 0), 0);
}

/**
 * Customers to expect: the town's trade, scaled by its crowd, by popularity and rating (earned),
 * and by the menu and shift window (chosen on Prep).
 */
export function expectedCustomers(p: CrowdInput): number {
  const menu = menuFor(p.stop, p.hidden).length;
  const n =
    p.stop.customers *
    CROWD[p.stop.crowd].traffic *
    popularityTraffic(p.popularity) *
    ratingFactor(p.rating) *
    menuFactor(menu) *
    crowdShare(p.shift ?? DEFAULT_SHIFT) *
    bonusCrowd(p.bonuses ?? []) *
    newRegionCrowd(p.regionShifts ?? 99) *
    // A lap after finishing the road brings more people everywhere (finale.ts).
    tripState.crowd;
  // Relaxed brings fewer, but never fewer than six where six or more would come (after build #78 a
  // new truck on the easy tier saw only four and wondered where everyone was).
  const k = DIFFICULTY[p.pacing ?? "balanced"].crowd;
  return Math.max(3, Math.round(k < 1 ? Math.max(Math.min(n, 6), n * k) : n * k));
}

