/**
 * Bonuses: kitchen helpers, one per town. A great shift in a town unlocks its bonus; then it is
 * bought with savings in the Garage and kept for good. Before each shift the player brings up
 * to MAX_PICKS owned bonuses (picked on Prep).
 *
 * They're laid out along the road so the early towns teach and forgive (patience, neat toppings,
 * drinks that stop themselves) and the late ones reward a tuned run (a faster main counter,
 * bigger tips, a sure critic, the next ticket early, full-meal tips). Prices climb with them, so
 * savings matter all the way down. The ids stay put when a bonus is renamed ("sear" is the Hot
 * plate), so saves keep what they bought.
 */

export type BonusId =
  | "bench"
  | "autostop"
  | "steady"
  | "lamp"
  | "cookies"
  | "timer"
  | "turbo"
  | "board"
  | "guestbook"
  | "sear"
  | "tipjar"
  | "press"
  | "rail"
  | "combo";

export interface Bonus {
  id: BonusId;
  name: string;
  text: string;
  /** When it shines, for the Prep screen and the Garage. */
  best: string;
  icon: string;
  /** The town whose great shift unlocks it. */
  town: string;
  price: number;
}

/** In road order: the town that unlocks each, and its price. */
export const BONUSES: Bonus[] = [
  { id: "bench", town: "pinecrest", price: 40, name: "Comfy bench", text: "Customers wait 30% longer, in line and at the window.", best: "Learning the ropes", icon: "people" },
  { id: "autostop", town: "elkpass", price: 70, name: "Smart fountain", text: "Drinks stop pouring at the line and get their lid by themselves.", best: "Thirsty crowds", icon: "drink" },
  { id: "steady", town: "cedarfalls", price: 90, name: "Steady hands", text: "Tossed toppings land neatly.", best: "Tall burgers", icon: "burger" },
  { id: "lamp", town: "summit", price: 140, name: "Heat lamp", text: "Warm holding: the warm end, the taco rack, lifted fries and the trays keep food fresh twice as long.", best: "Cooking ahead", icon: "flame" },
  { id: "cookies", town: "saltwater", price: 180, name: "Apology cookies", text: "Walk-outs don't cost popularity today.", best: "Busy, stressful days", icon: "heart" },
  { id: "timer", town: "gullpoint", price: 210, name: "Kitchen timer", text: "A soft tick when anything reaches done, and a countdown ring on the counter buttons.", best: "A full grill and fryer", icon: "timer" },
  { id: "turbo", town: "driftwood", price: 240, name: "Turbo fryer", text: "Fries cook 35% faster.", best: "Fries and poutine", icon: "fries" },
  { id: "guestbook", town: "harbor", price: 290, name: "Guest book", text: "Happy customers spread twice the word.", best: "Building popularity", icon: "review" },
  { id: "board", town: "redmesa", price: 340, name: "Sandwich board", text: "15% more people stop by today.", best: "Growing popular", icon: "flag" },
  { id: "sear", town: "cactus", price: 400, name: "Hot plate", text: "The main counter cooks 25% faster.", best: "A packed grill", icon: "grill" },
  { id: "tipjar", town: "sunvalley", price: 460, name: "Shiny tip jar", text: "Tips are 30% bigger.", best: "Beating a town best", icon: "coin" },
  { id: "press", town: "applecross", price: 520, name: "Press pass", text: "A food critic is sure to stop by today.", best: "A big, risky boost", icon: "critic" },
  { id: "rail", town: "larkvale", price: 580, name: "Ticket rail", text: "The next customer's ticket shows early, while they wait in line.", best: "Planning ahead", icon: "receipt" },
  { id: "combo", town: "portamber", price: 650, name: "Meal deal sign", text: "Orders with a main, fries and a drink tip 50% more.", best: "Fast, full trays", icon: "tray" },
];

/** Bonuses brought into one shift, at most. */
export const MAX_PICKS = 3;

/** Owned picks, in order, capped at MAX_PICKS. */
export function validPicks(picks: readonly string[] | null | undefined, owned: readonly BonusId[]): BonusId[] {
  return migrateBonuses(picks ?? []).filter((id) => owned.includes(id)).slice(0, MAX_PICKS);
}

/**
 * Tap a bonus on Prep: on if it was off, off if it was on. With MAX_PICKS already on, the oldest
 * pick makes way, so a tap always does what it shows.
 */
export function togglePick(picks: readonly BonusId[], id: BonusId): BonusId[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id);
  return [...picks, id].slice(-MAX_PICKS);
}

export function bonusById(id: string): Bonus | undefined {
  return BONUSES.find((b) => b.id === id);
}

/** The bonus a town unlocks. */
export function townBonus(town: string): Bonus | undefined {
  return BONUSES.find((b) => b.town === town);
}

/**
 * What a great shift asks: a 4.4★ average opinion (the old 2.4 of three, now that a good order is
 * 4★ and a great one 5★), 85% of the people who ordered served, and at least six of them, or 80%
 * of the crowd expected when fewer are coming (a new truck in a small town sees four or five).
 */
export const GREAT = { stars: 4.4, served: 0.85, min: 6, share: 0.8 };

/** Served orders a great shift needs, given the crowd expected today. */
export function greatMin(expected: number): number {
  return Math.max(1, Math.min(GREAT.min, Math.ceil(GREAT.share * expected)));
}

/**
 * A great shift unlocks the town's bonus. `ordered` is everyone who placed an order (served or not);
 * `expected` the crowd expected today (left out, the minimum is GREAT.min).
 */
export function greatShift(stars: readonly number[], served: number, ordered: number, expected = Infinity): boolean {
  if (served < greatMin(expected) || !stars.length) return false;
  const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
  return avg >= GREAT.stars && served >= Math.ceil(ordered * GREAT.served);
}

/** The sandwich board's pull on the crowd. */
export function bonusCrowd(ids: readonly BonusId[]): number {
  return ids.includes("board") ? 1.15 : 1;
}

/** Old saves' ids made current; anything unknown is dropped. */
export function migrateBonuses(ids: readonly string[]): BonusId[] {
  return [...new Set(ids)].filter((id): id is BonusId => !!bonusById(id));
}
