import type { Plan, Review } from "./business";
import type { PressPiece } from "./press";
import { REGION_START_IDS, START_TOWN, STOPS, townById } from "./stops";
import { SHIFTS_TO_UNLOCK, START_BANK } from "./travel";

export type UpgradeId = "bench" | "tipjar" | "turbo" | "autostop" | "steady";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  text: string;
}

export const UPGRADES: Upgrade[] = [
  { id: "bench", name: "Comfy bench", text: "Customers wait 25% longer before giving up." },
  { id: "tipjar", name: "Shiny tip jar", text: "Tips are 30% bigger." },
  { id: "turbo", name: "Turbo fryer", text: "Fries cook 35% faster." },
  { id: "autostop", name: "Smart fountain", text: "Drinks stop pouring at the line by themselves." },
  { id: "steady", name: "Steady hands", text: "Tossed ingredients land much more neatly." },
];

export interface Save {
  /** Old saves: index of the next region. Kept only to migrate into `town`. */
  stop?: number;
  /** Where the truck is parked on the road map. */
  town: string;
  /** Days on the road: every shift is a day. Events happen on set days. */
  day: number;
  /** Towns the truck can drive to, and towns whose shift has been passed. */
  unlocked: string[];
  passedTowns: string[];
  /** Passed shifts per town; SHIFTS_TO_UNLOCK of them open the town's roads (see travel.ts). */
  shiftsIn: Record<string, number>;
  /** The truck already drove one road tonight; another drive takes a day. Reset by a shift. */
  overnightUsed: boolean;
  upgrades: UpgradeId[];
  /** Gas money and savings. Starts at START_BANK; shifts add their profit, drives cost gas. */
  bank: number;
  /**
   * Lifetime rating: every served order's stars (0–3) in either mode, summed and counted, so
   * the home screen can show the truck's average with how many orders it rests on. Customers
   * who walk out don't rate. Business-mode reputation (`rep`) is separate and recency-weighted.
   */
  ratingCount: number;
  ratingSum: number;
  /** Best average stars per stop id. */
  best: Record<string, number>;
  tutorialDone: boolean;
  /** Trips finished (all stops). */
  trips: number;
  /** Upgrades on offer after a passed shift, until one is picked. */
  offer: UpgradeId[];
  /** Times each recipe was served well; familiar recipes get compact tickets. */
  known: Record<string, number>;
  /** Business mode: buy ingredients, set prices and pick the menu before each shift. */
  biz: boolean;
  /** Last shift's plan, reused as the starting point for the next one. */
  plan: Plan | null;
  /** Most recent reviews, newest first. */
  reviews: Review[];
  /** Average stars across recent reviews, and how many reviews it's built on. */
  rep: number;
  repWeight: number;
  /** How well known the truck is, 10..100. Critics' pieces move it. */
  popularity: number;
  /** Recent press, newest first. */
  press: PressPiece[];
  /** Cups and cartons left in each stack ("cupS", "cartonL"...), carried from shift to shift. */
  stock: Record<string, number>;
}

const KEY = "bv-save-v1";

export function freshSave(): Save {
  return {
    town: START_TOWN,
    day: 1,
    unlocked: [START_TOWN],
    passedTowns: [],
    shiftsIn: {},
    overnightUsed: false,
    upgrades: [],
    bank: START_BANK,
    ratingCount: 0,
    ratingSum: 0,
    best: {},
    tutorialDone: false,
    trips: 0,
    offer: [],
    known: {},
    biz: false,
    plan: null,
    reviews: [],
    rep: 2,
    repWeight: 6,
    popularity: 10,
    press: [],
    stock: {},
  };
}

/** A stored save brought up to date: missing fields filled in, old shapes converted. */
export function migrateSave(p: Partial<Save>): Save {
  const s: Save = { ...freshSave(), ...p };
  if (s.stop !== undefined && !p.town) {
    // Saves from before the map: start at the first town of the region they'd reached.
    const r = Math.max(0, Math.min(REGION_START_IDS.length - 1, s.stop | 0));
    s.town = REGION_START_IDS[r];
    s.unlocked = REGION_START_IDS.slice(0, r + 1);
    s.passedTowns = REGION_START_IDS.slice(0, r);
  }
  delete s.stop;
  if (!STOPS.some((t) => t.id === s.town)) s.town = START_TOWN;
  if (!s.unlocked.includes(s.town)) s.unlocked.push(s.town);
  if (!p.shiftsIn) {
    // Saves from before gas money and shift counts: towns already passed count as fully
    // worked (their roads are open anyway), and the truck gets its starting budget once.
    s.shiftsIn = {};
    for (const id of s.passedTowns) s.shiftsIn[id] = SHIFTS_TO_UNLOCK;
    s.bank = (p.bank ?? 0) + START_BANK;
  }
  return s;
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    return migrateSave(JSON.parse(raw) as Partial<Save>);
  } catch {
    return freshSave();
  }
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private browsing or full storage: progress just won't persist.
  }
}

/**
 * After passing a town's shift: count it, and once SHIFTS_TO_UNLOCK shifts have been passed
 * there, open its roads. Returns true when the town is the last of the trip.
 */
export function passTown(s: Save, id: string): boolean {
  s.shiftsIn[id] = (s.shiftsIn[id] ?? 0) + 1;
  if (!s.passedTowns.includes(id)) s.passedTowns.push(id);
  if (s.shiftsIn[id] >= SHIFTS_TO_UNLOCK) for (const next of townById(id).roads) if (!s.unlocked.includes(next)) s.unlocked.push(next);
  return townById(id).roads.length === 0;
}

/** A shift counts as passed with an average of at least one star and most customers served. */
export function passed(avgStars: number, served: number, total: number): boolean {
  return served > 0 && avgStars >= 1 && served >= Math.ceil(total * 0.5);
}

export function upgradeChoices(owned: UpgradeId[], rng: () => number, n = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => !owned.includes(u.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
