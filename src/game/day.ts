import { CROWD, menuOf, PRICE, QUALITY, recipeCost, trafficMult, type CrowdId, type Plan } from "./business";
import { ADS, todayPopularity, type AdLevel } from "./line";
import { popularityTraffic } from "./press";
import type { UpgradeId } from "./progress";
import type { Stop } from "./stops";
import { MILES_PER_UNIT } from "./travel";

/**
 * The shape of one day on the road.
 *
 * A day has two halves the player can act in. In the **morning** the truck is parked on the
 * map in daylight: open the window (after the Prep screen), or set off. In the **evening**, after
 * the shift's Closing screen, the map is dark: see the results, hop to a town within tonight's
 * range, or sleep. Sleeping is the only thing that turns the day: it charges the running cost,
 * applies the solar saving and wakes the truck in the morning. A drive further than the range
 * takes the whole day, so it lands on the evening map without a shift.
 */
export type TimeOfDay = "morning" | "evening";

/** Generator fuel and propane: what a day on the road costs before any solar. */
export const RUNNING_COST = 10;

/** Parts bought for cash at a big city's supply yard. Kitchen upgrades stay the free pick after a good shift. */
export type GearId = "solar1" | "solar2" | "range1" | "range2";

export interface Gear {
  id: GearId;
  name: string;
  text: string;
  cost: number;
  /** The capital that sells it. */
  soldAt: string;
  requires?: GearId;
}

export const GEAR: Gear[] = [
  { id: "solar1", name: "Roof solar panel", text: "Runs the fridge by day. Saves $5 of the nightly running cost.", cost: 60, soldAt: "summit" },
  { id: "solar2", name: "Full solar roof", text: "Four panels and a battery. Saves $8 a night in all.", cost: 60, soldAt: "harbor", requires: "solar1" },
  { id: "range1", name: "Engine tune-up", text: "Overnight range 175 mi: both highways, or two roads in a night.", cost: 150, soldAt: "summit" },
  { id: "range2", name: "Long-haul kit", text: "Overnight range 250 mi: a highway and a road in the same night.", cost: 250, soldAt: "harbor", requires: "range1" },
];

export function gearById(id: GearId): Gear {
  return GEAR.find((g) => g.id === id)!;
}

/** Dollars of the running cost that solar covers each night. */
export function solarSaving(gear: readonly GearId[]): number {
  return gear.includes("solar2") ? 8 : gear.includes("solar1") ? 5 : 0;
}

/** What tonight will cost after solar. */
export function runningCost(gear: readonly GearId[]): number {
  return Math.max(0, RUNNING_COST - solarSaving(gear));
}

/** Overnight range in miles by engine. */
export const RANGE_MI = [100, 175, 250] as const;

export function rangeMiles(gear: readonly GearId[]): number {
  return RANGE_MI[gear.includes("range2") ? 2 : gear.includes("range1") ? 1 : 0];
}

/** Overnight range in map units, which is what roads are measured in. */
export function rangeUnits(gear: readonly GearId[]): number {
  return rangeMiles(gear) / MILES_PER_UNIT;
}

/** Can the truck buy this part here? Null when it can, otherwise why not. */
export function gearBlocker(g: Gear, owned: readonly GearId[], town: string, bank: number): string | null {
  if (owned.includes(g.id)) return "Fitted";
  if (g.requires && !owned.includes(g.requires)) return `Needs the ${gearById(g.requires).name.toLowerCase()} first`;
  if (town !== g.soldAt) return "Not sold here";
  if (bank < g.cost) return `$${g.cost - bank} short`;
  return null;
}

/** The part of a save that sleeping touches. */
export interface Sleeper {
  day: number;
  time: TimeOfDay;
  bank: number;
  /** Map units driven since the last shift or sleep; hops tonight add up against the range. */
  driven: number;
  gear: GearId[];
}

export interface Night {
  /** The running cost before solar. */
  charge: number;
  saving: number;
  /** What actually left the tin; the rest was waived because the tin couldn't cover it. */
  paid: number;
  waived: number;
  /** The day that just ended, and the town the truck wakes in. */
  day: number;
}

/**
 * Night falls: pay for the generator and propane (less solar), and wake up tomorrow morning.
 * The tin never goes below zero; a truck that can't pay just runs the generator on fumes.
 */
export function sleep(s: Sleeper): Night {
  const charge = RUNNING_COST;
  const saving = solarSaving(s.gear);
  const due = Math.max(0, charge - saving);
  const paid = Math.min(s.bank, due);
  s.bank -= paid;
  const day = s.day;
  s.day++;
  s.time = "morning";
  s.driven = 0;
  return { charge, saving, paid, waived: due - paid, day };
}

// ---------------------------------------------------------------------------
// Projecting a shift, for the Prep screen's ledger

export interface Projection {
  customers: number;
  /** Average menu price after the price level. */
  avgPrice: number;
  /** What an order is worth on average: the burger plus sides and a drink. */
  order: number;
  takings: number;
  tips: number;
  /** Ingredient cost per order, and in all (business mode only; zero otherwise). */
  perOrder: number;
  ingredients: number;
  adCost: number;
  running: number;
  solar: number;
  /** Net for the day, and the range the player should expect around it. */
  net: number;
  lo: number;
  hi: number;
}

/** Sides and a drink add about this much to a burger's price in an average order. */
const SIDES_VALUE = 1.5;
/** And cost about this much in ingredients at standard quality. */
const SIDES_COST = 0.9;
/** An average tip before crowd and tip jar. */
const BASE_TIP = 1.4;
/** Skill swings a shift this much either way. */
const SPREAD = 0.15;

export interface ProjectInput {
  stop: Stop;
  plan: Plan | null;
  popularity: number;
  ads: AdLevel;
  rep: number;
  upgrades: readonly UpgradeId[];
  gear: readonly GearId[];
}

/** Customers to expect: the town's trade scaled by crowd, fame and (in business mode) the plan. */
export function expectedCustomers(p: ProjectInput): number {
  const pop = popularityTraffic(todayPopularity(p.popularity, p.ads));
  if (p.plan) return Math.max(4, Math.round(p.stop.customers * trafficMult(p.plan, p.rep, menuOf(p.stop, p.plan).length, p.stop.crowd) * pop));
  return Math.max(3, Math.round(p.stop.customers * CROWD[p.stop.crowd].traffic * pop));
}

export function projectShift(p: ProjectInput): Projection {
  const crowd: CrowdId = p.stop.crowd;
  const menu = p.plan ? menuOf(p.stop, p.plan) : p.stop.menu;
  const mult = p.plan ? PRICE[p.plan.price].mult : 1;
  const customers = expectedCustomers(p);
  const avgPrice = (menu.reduce((s, r) => s + r.price, 0) / menu.length) * mult;
  const order = avgPrice + SIDES_VALUE * mult;
  const takings = customers * order;
  const tips = customers * BASE_TIP * CROWD[crowd].tips * (p.upgrades.includes("tipjar") ? 1.3 : 1);
  const perOrder = p.plan ? menu.reduce((s, r) => s + recipeCost(r, p.plan!.quality), 0) / menu.length + SIDES_COST * QUALITY[p.plan.quality].cost : 0;
  const ingredients = perOrder * customers;
  const adCost = ADS[p.ads].cost;
  const running = RUNNING_COST;
  const solar = solarSaving(p.gear);
  const net = takings + tips - ingredients - adCost - running + Math.min(running, solar);
  return { customers, avgPrice, order, takings, tips, perOrder, ingredients, adCost, running, solar, net, lo: Math.max(0, net * (1 - SPREAD)), hi: net * (1 + SPREAD) };
}
