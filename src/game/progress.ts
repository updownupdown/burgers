import { migrateBonuses, validPicks, type BonusId } from "./bonus";
import { DEFAULT_LOOK, LOOKS, validLook, type Look } from "./looks";
import type { PressPiece } from "./press";
import { noReviews, toCounts, type StarCounts } from "./reviews";
import type { TimeOfDay } from "./day";
import { validShift, type ShiftWindow } from "./shift";
import { FINAL_TOWN, REGION_START_IDS, START_TOWN, STOPS, townById } from "./stops";
import { SHIFTS_TO_UNLOCK } from "./travel";

/** How well known a brand new truck is (10..100): enough for a few people to stop by. */
export const START_POPULARITY = 25;

/**
 * Bumped when stored data changes meaning. 2: ratings went from three stars to five and reviews
 * are kept as counts per star, so older ratings, reviews, press and town bests are wiped.
 */
export const SAVE_VERSION = 2;

export interface Save {
  /** Which shape of save this is (SAVE_VERSION). Saves from before versions count as 1. */
  version: number;
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
  /** Savings: every shift's takings go in; bonuses and looks are bought out of it (see garage.ts). */
  bank: number;
  /** Bonuses unlocked by a great shift in their town (see bonus.ts), bought or not. */
  found: BonusId[];
  /** Bonuses bought, in the order they came. */
  bonuses: BonusId[];
  /** The bonuses brought into the next shift, picked on Prep (up to MAX_PICKS). */
  picks: BonusId[];
  /** Recipe names hidden from the menu on Prep (by name, so it carries from town to town). */
  hidden: string[];
  /** When the window opens and closes, picked on Prep (see shift.ts). */
  shift: ShiftWindow;
  /**
   * Every review ever left, as a count per star (index 0 is 1★, index 4 is 5★). The rating is
   * their average (see reviews.ts); no review text is kept.
   */
  reviewCounts: StarCounts;
  /** Best average opinion (1..5★) of a shift, per stop id. */
  best: Record<string, number>;
  /** Best takings in one shift per stop id. */
  bestTakings: Record<string, number>;
  /** Looks bought in the Garage (free ones aren't listed), and what the truck wears. */
  looks: string[];
  look: Look;
  tutorialDone: boolean;
  /** Trips finished (all stops). */
  trips: number;
  /** Times each recipe was served well; familiar recipes get compact tickets. */
  known: Record<string, number>;
  /** How well known the truck is, 10..100. Word of mouth and the press move it. */
  popularity: number;
  /** Good visits from each town's regular, by town id (after build #78; game/regulars.ts). */
  regulars?: Record<string, number>;
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
  /** Every served customer's opinion, 1..5★, in order. */
  stars: number[];
  /** The reviews left today (some customers, every critic), 1..5★ each. */
  reviews: number[];
  /** What the orders paid, the tips on top, and what went out free or spilled. */
  earned: number;
  tips: number;
  comped: number;
  spills: number;
  /** Earned and tips less comped and spills: the shift's score in dollars. */
  takings: number;
  /** The town's best takings before today, if any. */
  bestBefore: number | null;
  /** The rating (average review) after today's reviews and before them; null with no reviews. */
  rating: number | null;
  ratingBefore: number | null;
  pop: [number, number];
  best: string | null;
  outcome: "passed" | "failed" | "trip";
  opened: string[];
  shiftsHere: number;
  press: PressPiece | null;
  /** A great shift (see bonus.ts), the bonus it unlocked here, and the bonus that was brought. */
  great: boolean;
  unlocked: BonusId | null;
  usedBonus: BonusId[];
  /** Savings after the takings went in. */
  bank: number;
  shift: ShiftWindow;
}

/**
 * The Orders line as the report card's ledger shows it. Takings are rounded once from the exact
 * sums, while each line shows its own rounding, so the lines could come to a dollar off the
 * total; the orders (the only line in cents) take up the difference. A day that floored at $0
 * can't add up, so its orders show as they were.
 */
export function ordersShown(c: Pick<Closing, "earned" | "tips" | "comped" | "spills" | "takings">): number {
  const fit = c.takings - Math.round(c.tips) + Math.round(c.comped) + Math.round(c.spills);
  return Math.abs(fit - c.earned) < 1 ? fit : Math.round(c.earned);
}

const KEY = "bv-save-v1";

export function freshSave(): Save {
  return {
    version: SAVE_VERSION,
    town: START_TOWN,
    day: 1,
    time: "morning",
    driven: 0,
    last: null,
    unlocked: [START_TOWN],
    passedTowns: [],
    shiftsIn: {},
    bank: 0,
    found: [],
    bonuses: [],
    picks: [],
    hidden: [],
    shift: validShift(null),
    reviewCounts: noReviews(),
    best: {},
    bestTakings: {},
    looks: [],
    look: { ...DEFAULT_LOOK },
    tutorialDone: false,
    trips: 0,
    known: {},
    popularity: START_POPULARITY,
    // Listed so a new trip (Object.assign over the save) clears the regulars' tallies too.
    regulars: {},
    press: [],
  };
}

/** Fields older saves carry that the game no longer uses (money, supplies, business mode). */
const RETIRED = ["ribbons", "gear", "simplePlan", "biz", "plan", "ads", "offer", "upgrades", "overnightUsed", "ratingCount", "ratingSum", "reviews", "rep", "repWeight"] as const;

/**
 * Towns that left the map, and the town that took their place: progress there (shifts, bests,
 * an unlock) folds into it, and a truck parked there wakes up in it. Dust Bowl Flats went with
 * the four-region map (DESIGN.md §24); its rodeo moved to Cactus Junction.
 */
const RETIRED_TOWNS: Record<string, string> = { dustbowl: "cactus" };

/** Old town ids in a save made current, keeping the best of what each town had. */
function foldTowns(s: Save): void {
  const to = (id: string) => RETIRED_TOWNS[id] ?? id;
  const known = (id: string) => STOPS.some((t) => t.id === id);
  s.town = to(s.town);
  s.unlocked = [...new Set(s.unlocked.map(to))].filter(known);
  s.passedTowns = [...new Set(s.passedTowns.map(to))].filter(known);
  const fold = (rec: Record<string, number>, pick: (a: number, b: number) => number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(rec ?? {})) {
      const k = to(id);
      out[k] = k in out ? pick(out[k], v) : v;
    }
    return out;
  };
  // Shifts add up (both towns were worked); bests keep the better one.
  s.shiftsIn = fold(s.shiftsIn, (a, b) => a + b);
  s.best = fold(s.best, Math.max);
  s.bestTakings = fold(s.bestTakings, Math.max);
}

/** A stored save brought up to date: missing fields filled in, old shapes converted. */
export function migrateSave(p: Partial<Save> & Record<string, unknown>): Save {
  const s: Save = { ...freshSave(), ...p };
  if (!(Number(p.version) >= 2)) {
    // Three-star days (DESIGN.md §26): ratings, reviews, critics' clippings and town bests were
    // all out of three, so they start again. Savings, bonuses, looks and the road are kept.
    s.reviewCounts = noReviews();
    s.press = [];
    s.best = {};
    s.last = null;
  }
  s.version = SAVE_VERSION;
  s.reviewCounts = toCounts(s.reviewCounts);
  if (s.stop !== undefined && !p.town) {
    // Saves from before the map: start at the first town of the region they'd reached.
    const r = Math.max(0, Math.min(REGION_START_IDS.length - 1, s.stop | 0));
    s.town = REGION_START_IDS[r];
    s.unlocked = REGION_START_IDS.slice(0, r + 1);
    s.passedTowns = REGION_START_IDS.slice(0, r);
  }
  delete s.stop;
  foldTowns(s);
  if (!STOPS.some((t) => t.id === s.town)) s.town = START_TOWN;
  if (!s.unlocked.includes(s.town)) s.unlocked.push(s.town);
  if (!p.shiftsIn) {
    // Saves from before shift counts: towns already passed count as fully worked.
    s.shiftsIn = {};
    for (const id of s.passedTowns) s.shiftsIn[id] = SHIFTS_TO_UNLOCK;
  }
  // The roads changed with the map (§24): whatever a fully worked town opens today is open.
  for (const t of STOPS) if ((s.shiftsIn[t.id] ?? 0) >= SHIFTS_TO_UNLOCK) for (const next of t.roads) if (!s.unlocked.includes(next)) s.unlocked.push(next);
  // Kitchen upgrades from before bonuses are bonuses now.
  if (!p.bonuses && Array.isArray(p.upgrades)) s.bonuses = migrateBonuses(p.upgrades as string[]);
  s.bonuses = migrateBonuses(s.bonuses);
  // Whatever is owned was found; an owned bonus never needs unlocking again.
  s.found = migrateBonuses([...(Array.isArray(s.found) ? s.found : []), ...s.bonuses]);
  // Old saves kept their gas money; it carries over as savings.
  s.bank = Math.max(0, Math.round(Number(s.bank) || 0));
  // The shop dog was retired: whoever bought it gets the $350 back.
  if (Array.isArray(s.looks) && s.looks.includes("dog")) {
    s.bank += 350;
    s.looks = s.looks.filter((id) => id !== "dog");
  }
  s.looks = Array.isArray(s.looks) ? s.looks.filter((id) => LOOKS.some((l) => l.id === id && l.price > 0)) : [];
  s.look = validLook(s.look, s.looks);
  // One bonus per shift became up to three: the old single pick carries over.
  const oldPick = (p as { bonus?: unknown }).bonus;
  s.picks = validPicks(Array.isArray(p.picks) ? p.picks : typeof oldPick === "string" ? [oldPick] : [], s.bonuses);
  delete (s as { bonus?: unknown }).bonus;
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
  // A shift with nobody served once recorded a best of 0.0★; it never was one.
  for (const [id, v] of Object.entries(s.best)) if (!(Number(v) > 0)) delete s.best[id];
  // Today's Closing outlives an evening hop to another town; only a stale or partial one goes.
  if (s.last && (!todaysClosing(s) || typeof s.last.takings !== "number" || typeof s.last.bank !== "number")) s.last = null;
  return s;
}

/**
 * Today's Closing, for the evening's Results and the night card. It stays wherever the truck hops
 * to in the evening; a new day (sleep clears it anyway) or a morning drop it.
 */
export function todaysClosing(s: Pick<Save, "last" | "day" | "time">): Closing | null {
  return s.last && s.last.day === s.day && s.time === "evening" ? s.last : null;
}

export function loadSave(): Save {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    return migrateSave(JSON.parse(raw) as Partial<Save>);
  } catch (err) {
    // A save that can't be read starts a fresh trip, but the old one is kept aside first: the next
    // write would otherwise overwrite it for good.
    if (raw) keepBrokenSave(raw, err);
    return freshSave();
  }
}

/** Copy an unreadable save to its own key (bv-save-broken-<time>) so it can still be recovered. */
export function keepBrokenSave(raw: string, err: unknown): string | null {
  const key = `bv-save-broken-${Date.now()}`;
  try {
    localStorage.setItem(key, raw);
    console.warn(`Bun Voyage: the save couldn't be read and was kept as ${key}.`, err);
    return key;
  } catch {
    return null;
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
  return id === FINAL_TOWN;
}

/** The average opinion a shift needs to count (the old 1 of three). */
export const PASS_STARS = 2.5;

/** A shift counts as passed with an average opinion of PASS_STARS or more and at least half the customers served. */
export function passed(avgStars: number, served: number, total: number): boolean {
  return served > 0 && avgStars >= PASS_STARS && served >= Math.ceil(total * 0.5);
}
