/**
 * Bonuses: things for the truck that a town gives you after a great shift. They're earned one
 * at a time, shown big on the Closing screen, and kept for good; before each shift the player
 * brings at most one of them (picked on the Prep screen). Each is built to suit some towns and
 * menus more than others, so which one to bring is a real choice.
 */

export type BonusId = "bench" | "steady" | "lamp" | "board" | "turbo" | "autostop" | "press" | "guestbook" | "tipjar" | "cookies";

export interface Bonus {
  id: BonusId;
  name: string;
  text: string;
  /** When it shines, for the Prep screen. */
  best: string;
  icon: string;
}

/** In the order they're earned. */
export const BONUSES: Bonus[] = [
  { id: "bench", name: "Comfy bench", text: "Customers wait 30% longer, in line and at the window.", best: "Impatient crowds", icon: "people" },
  { id: "steady", name: "Steady hands", text: "Tossed toppings land neatly.", best: "Tall burgers", icon: "burger" },
  { id: "lamp", name: "Heat lamp", text: "Food on a tray stays fresh twice as long.", best: "Cooking ahead", icon: "flame" },
  { id: "board", name: "Sandwich board", text: "15% more people stop by today.", best: "Growing popular", icon: "flag" },
  { id: "turbo", name: "Turbo fryer", text: "Fries cook 35% faster.", best: "Fries and poutine", icon: "fries" },
  { id: "autostop", name: "Smart fountain", text: "Drinks stop pouring at the line by themselves.", best: "Thirsty crowds", icon: "drink" },
  { id: "press", name: "Press pass", text: "A food critic is sure to stop by today.", best: "A big, risky boost", icon: "critic" },
  { id: "guestbook", name: "Guest book", text: "Happy customers spread twice the word.", best: "Building popularity", icon: "review" },
  { id: "tipjar", name: "Shiny tip jar", text: "Tips are 30% bigger.", best: "Beating a town best", icon: "coin" },
  { id: "cookies", name: "Apology cookies", text: "Walk-outs don't cost popularity today.", best: "Stressful pacing", icon: "heart" },
];

export function bonusById(id: string): Bonus | undefined {
  return BONUSES.find((b) => b.id === id);
}

/** The next bonus a great shift earns, or null once the truck has them all. */
export function nextBonus(owned: readonly string[]): Bonus | null {
  return BONUSES.find((b) => !owned.includes(b.id)) ?? null;
}

/** What a great shift asks: a 2.4★ average, 85% of the people who ordered served, and at least six of them. */
export const GREAT = { stars: 2.4, served: 0.85, min: 6 };

/** A great shift earns the next bonus. `ordered` is everyone who placed an order (served or not). */
export function greatShift(stars: readonly number[], served: number, ordered: number): boolean {
  if (served < GREAT.min || !stars.length) return false;
  const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
  return avg >= GREAT.stars && served >= Math.ceil(ordered * GREAT.served);
}

/** The sandwich board's pull on the crowd. */
export function bonusCrowd(id: BonusId | null): number {
  return id === "board" ? 1.15 : 1;
}

/** Old saves' kitchen upgrades are bonuses already; anything unknown is dropped. */
export function migrateBonuses(ids: readonly string[]): BonusId[] {
  return ids.filter((id): id is BonusId => !!bonusById(id));
}
