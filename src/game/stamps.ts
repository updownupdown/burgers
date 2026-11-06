import { townBonus } from "./bonus";
import type { Save } from "./progress";
import { REGULAR_GOAL } from "./regulars";
import { EVENTS, FINAL_TOWN, FINALE, STOPS, type Recipe } from "./stops";
import { SHIFTS_TO_UNLOCK } from "./travel";

/**
 * The postcard book (DESIGN §50, scope review row 3): up to five stamps per town, earned from what
 * the trip already tracks, and a row per dish for serving it at five stars five times. Stamps are
 * kept by a new trip; one earned again on a later trip turns gold.
 */
export type StampId = "road" | "great" | "regular" | "event" | "five";

/** 1: earned; 2: earned again on a later trip (gold). */
export type StampTier = 1 | 2;
export type StampBook = Record<string, Partial<Record<StampId, StampTier>>>;

export interface StampDef {
  id: StampId;
  /** Short, for the stamp itself. */
  label: string;
  /** How it is earned, for the postcard. */
  how: string;
  icon: string;
}

export const STAMPS: StampDef[] = [
  { id: "road", label: "Road", how: `${SHIFTS_TO_UNLOCK} good shifts here`, icon: "road" },
  { id: "great", label: "Great", how: "A great shift, which finds the town's bonus", icon: "sparkle" },
  { id: "regular", label: "Regular", how: `The town's regular served well ${REGULAR_GOAL} times`, icon: "person" },
  { id: "event", label: "Event", how: "A good shift on the town's event day", icon: "flag" },
  { id: "five", label: "5 stars", how: "A shift that averages 4.8★ or more", icon: "star" },
];

/** A shift's average opinion that earns the five-star stamp. */
export const FIVE_STAR_SHIFT = 4.8;
/** Five-star serves of a dish that tick its row in the book. */
export const DISH_FIVES = 5;

/** Towns with an event (Port Amber's is the last night of the trip) have five stamps; the rest four. */
export function hasEvent(town: string): boolean {
  return town === FINAL_TOWN || EVENTS.some((e) => e.town === town);
}

export function stampSlots(town: string): StampId[] {
  return STAMPS.map((s) => s.id).filter((id) => id !== "event" || hasEvent(town));
}

/** The tier a stamp earned now gets: gold from the second trip on. */
export function tierNow(s: Pick<Save, "tripNo">): StampTier {
  return (s.tripNo ?? 1) >= 2 ? 2 : 1;
}

/** Stamps this trip's progress shows for a town (road, great, regular; the others are earned at a shift's end). */
export function standing(s: Pick<Save, "shiftsIn" | "found" | "regulars">, town: string): StampId[] {
  const out: StampId[] = [];
  if ((s.shiftsIn[town] ?? 0) >= SHIFTS_TO_UNLOCK) out.push("road");
  const b = townBonus(town);
  if (b && s.found.includes(b.id)) out.push("great");
  if ((s.regulars?.[town] ?? 0) >= REGULAR_GOAL) out.push("regular");
  return out;
}

/** Put stamps in the book at `tier` (never lowering one). Returns those that were new or turned gold. */
export function award(book: StampBook, town: string, ids: readonly StampId[], tier: StampTier): StampId[] {
  const page = { ...(book[town] ?? {}) };
  const got: StampId[] = [];
  for (const id of ids) {
    if (!stampSlots(town).includes(id)) continue;
    if ((page[id] ?? 0) >= tier) continue;
    page[id] = tier;
    got.push(id);
  }
  if (got.length) book[town] = page;
  return got;
}

/** What one shift earned, as endShift knows it. */
export interface ShiftStamps {
  town: string;
  /** The shift counted (passed). */
  ok: boolean;
  /** It was the town's event day. */
  event: boolean;
  /** Average opinion of the shift (0 with nobody served). */
  avg: number;
}

/**
 * After a shift: stamp the book from this trip's progress everywhere (a regular won or a bonus
 * found shows up wherever it happened), plus the shift's own event and five-star stamps. Returns
 * the stamps this shift added or turned gold in its town.
 */
export function stampShift(s: Save, sh: ShiftStamps): StampId[] {
  const book: StampBook = { ...(s.stamps ?? {}) };
  const tier = tierNow(s);
  let here: StampId[] = [];
  for (const t of STOPS) {
    const ids = standing(s, t.id);
    if (t.id === sh.town) {
      if (sh.ok && sh.event) ids.push("event");
      if (sh.ok && sh.avg >= FIVE_STAR_SHIFT) ids.push("five");
    }
    const got = award(book, t.id, ids, tier);
    if (t.id === sh.town) here = got;
  }
  s.stamps = book;
  return here;
}

/** An old save's book, from what it already shows (first-trip stamps; event days were never kept). */
export function seedStamps(s: Pick<Save, "shiftsIn" | "found" | "regulars" | "best">): StampBook {
  const book: StampBook = {};
  for (const t of STOPS) {
    const ids = standing(s, t.id);
    if ((s.best[t.id] ?? 0) >= FIVE_STAR_SHIFT) ids.push("five");
    award(book, t.id, ids, 1);
  }
  return book;
}

/** Count a served dish: five-star serves go toward its row in the book. */
export function noteFive(s: Pick<Save, "fives">, dish: string, stars: number): void {
  if (stars < 5) return;
  s.fives = { ...(s.fives ?? {}), [dish]: (s.fives?.[dish] ?? 0) + 1 };
}

/** Every dish the book lists: each town's, in road order, then the event specials. */
export function bookDishes(): Recipe[] {
  const seen = new Map<string, Recipe>();
  for (const t of STOPS) for (const r of t.menu) if (!seen.has(r.name)) seen.set(r.name, r);
  for (const e of [...EVENTS, FINALE]) if (e.special && !seen.has(e.special.name)) seen.set(e.special.name, e.special);
  return [...seen.values()];
}

/** How full the book is: stamps (gold ones too) out of every slot, and dishes ticked. */
export function bookTotals(s: Pick<Save, "stamps" | "fives">): { stamps: number; gold: number; slots: number; dishes: number; dishSlots: number } {
  let stamps = 0;
  let gold = 0;
  let slots = 0;
  for (const t of STOPS) {
    for (const id of stampSlots(t.id)) {
      slots++;
      const v = s.stamps?.[t.id]?.[id] ?? 0;
      if (v >= 1) stamps++;
      if (v >= 2) gold++;
    }
  }
  const dishes = bookDishes();
  return { stamps, gold, slots, dishes: dishes.filter((r) => (s.fives?.[r.name] ?? 0) >= DISH_FIVES).length, dishSlots: dishes.length };
}
