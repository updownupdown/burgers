import type { Review } from "./business";
import { migrateBonuses, type BonusId } from "./bonus";
import type { PressPiece } from "./press";
import type { TimeOfDay } from "./day";
import { validShift, type ShiftWindow } from "./shift";
import { REGION_START_IDS, START_TOWN, STOPS, townById } from "./stops";
import { SHIFTS_TO_UNLOCK } from "./travel";

/** How well known a brand new truck is (10..100): enough for a few people to stop by. */
export const START_POPULARITY = 25;

export interface Save {
  /** Old saves: index of the next region. Kept only to migrate into `town`. */
  stop?: number;
  /** Where the truck is parked on the road map. */
  town: string;
  /** Days on the road. The day turns when the truck sleeps (see day.ts). Events happen on set days. */
  day: number;
  /** Morning (open or set off) or evening (results, a short hop, sleep). */
  time: TimeOfDay;
  /** Map units driven since the last shift or sleep; hops add up against the overnight range. */
  driven: number;
  /** Today's shift, for the Closing screen, until the truck sleeps. */
  last: Closing | null;
  /** Towns the truck can drive to, and towns whose shift has been passed. */
  unlocked: string[];
  passedTowns: string[];
  /** Passed shifts per town; SHIFTS_TO_UNLOCK of them open the town's roads (see travel.ts). */
  shiftsIn: Record<string, number>;
  /** Bonuses earned by great shifts (see bonus.ts), in the order they came. */
  bonuses: BonusId[];
  /** The one bonus brought into the next shift, picked on Prep; null for none. */
  bonus: BonusId | null;
  /** Recipe names hidden from the menu on Prep (by name, so it carries from town to town). */
  hidden: string[];
  /** When the window opens and closes, picked on Prep (see shift.ts). */
  shift: ShiftWindow;
  /**
   * Lifetime rating: every served order's stars (0–3), summed and counted. The recency-weighted
   * rating that pulls in customers is `rep`.
   */
  ratingCount: number;
  ratingSum: number;
  /** Best average stars per stop id. */
  best: Record<string, number>;
  /** Best takings in one shift per stop id. */
  bestTakings: Record<string, number>;
  /** Towns where a great shift came after every bonus was earned: a ribbon on the map. */
  ribbons: string[];
  tutorialDone: boolean;
  /** Trips finished (all stops). */
  trips: number;
  /** Times each recipe was served well; familiar recipes get compact tickets. */
  known: Record<string, number>;
  /** Most recent reviews, newest first. */
  reviews: Review[];
  /** Rating: average stars across recent reviews (0..3), and how many reviews it's built on. */
  rep: number;
  repWeight: number;
  /** How well known the truck is, 10..100. Word of mouth and the press move it. */
  popularity: number;
  /** Recent press, newest first. */
  press: PressPiece[];
}

/** Everything the Closing screen shows about today's shift, kept until the truck sleeps. */
export interface Closing {
  town: string;
  day: number;
  served: number;
  lost: number;
  leftLine: number;
  walkedPast: number;
  stars: number[];
  /** What the orders paid, the tips on top, and what went out free or spilled. */
  earned: number;
  tips: number;
  comped: number;
  spills: number;
  /** Earned and tips less comped and spills: the shift's score in dollars. */
  takings: number;
  /** The town's best takings before today, if any. */
  bestBefore: number | null;
  reviews: Review[];
  rep: number;
  repBefore: number;
  pop: [number, number];
  best: string | null;
  outcome: "passed" | "failed" | "trip";
  opened: string[];
  shiftsHere: number;
  press: PressPiece | null;
  /** A great shift (see bonus.ts), what it earned, and the bonus that was brought. */
  great: boolean;
  earnedBonus: BonusId | null;
  ribbon: boolean;
  usedBonus: BonusId | null;
  shift: ShiftWindow;
}

const KEY = "bv-save-v1";

export function freshSave(): Save {
  return {
    town: START_TOWN,
    day: 1,
    time: "morning",
    driven: 0,
    last: null,
    unlocked: [START_TOWN],
    passedTowns: [],
    shiftsIn: {},
    bonuses: [],
    bonus: null,
    hidden: [],
    shift: validShift(null),
    ratingCount: 0,
    ratingSum: 0,
    best: {},
    bestTakings: {},
    ribbons: [],
    tutorialDone: false,
    trips: 0,
    known: {},
    reviews: [],
    rep: 2,
    repWeight: 6,
    popularity: START_POPULARITY,
    press: [],
  };
}

/** Fields older saves carry that the game no longer uses (money, supplies, business mode). */
const RETIRED = ["bank", "gear", "simplePlan", "biz", "plan", "ads", "offer", "upgrades", "overnightUsed"] as const;

/** A stored save brought up to date: missing fields filled in, old shapes converted. */
export function migrateSave(p: Partial<Save> & Record<string, unknown>): Save {
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
    // Saves from before shift counts: towns already passed count as fully worked.
    s.shiftsIn = {};
    for (const id of s.passedTowns) s.shiftsIn[id] = SHIFTS_TO_UNLOCK;
  }
  // Kitchen upgrades from before bonuses are bonuses now.
  if (!p.bonuses && Array.isArray(p.upgrades)) s.bonuses = migrateBonuses(p.upgrades as string[]);
  s.bonuses = migrateBonuses(s.bonuses);
  if (s.bonus && !s.bonuses.includes(s.bonus)) s.bonus = null;
  // Business mode kept its menu as the dishes on it; Prep now keeps the ones taken off.
  const plan = p.plan as { menu?: string[] } | null | undefined;
  if (!p.hidden && plan?.menu) {
    const town = STOPS.find((t) => t.id === s.town);
    s.hidden = town ? town.menu.filter((r) => !plan.menu!.includes(r.name)).map((r) => r.name) : [];
  }
  if (!Array.isArray(s.hidden)) s.hidden = [];
  s.shift = validShift(s.shift);
  const bag = s as unknown as Record<string, unknown>;
  for (const k of RETIRED) delete bag[k];
  if (s.time !== "morning" && s.time !== "evening") s.time = "morning";
  // A Closing from before takings is dropped rather than half shown.
  if (s.last && (s.last.town !== s.town || typeof s.last.takings !== "number")) s.last = null;
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
