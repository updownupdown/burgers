import { orderFromRecipe, pickMods, seededRng } from "./menu";
import { fountainFor, fryerOf, garnishFor, type Stop } from "./stops";
import type { Order } from "./types";

/**
 * Regulars (after build #78, review P3-9): every town has one named customer who comes back each
 * shift there with the same custom order, their name on the ticket. Serving them well (4★ or
 * better) REGULAR_GOAL times makes them a regular for good, and word of them adds REGULAR_POP to
 * popularity, once. Cheap storytelling that rewards coming back to a town.
 */
export const REGULAR_GOAL = 3;
export const REGULAR_POP = 5;
/** They're the shift's third customer (after the first two, so the shift has started). */
export const REGULAR_AT = 2;
/** Stars that count as a good serve. */
export const REGULAR_STARS = 4;

const NAMES = ["Doug", "Marta", "Wen", "Pip", "Rosa", "Ike", "Juno", "Bea", "Otis", "Lula", "Ned", "Ama", "Sol", "Tilly", "Hal", "Nell", "Rafa", "Kit"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The town's regular's name. */
export function regularName(townId: string): string {
  return NAMES[hash(townId) % NAMES.length];
}

/**
 * The regular's order: always the same at a town, from what's on today's menu (the first recipe it
 * would pick that's on it), with one or two changes of their own, a medium side and the first local drink.
 */
export function regularOrder(id: number, stop: Stop): Order {
  const rng = seededRng(hash(stop.id));
  const recipe = stop.menu[Math.floor(rng() * stop.menu.length)];
  let mods = pickMods(recipe, stop.pantry, rng, 1);
  // Always at least one change: that's what makes the order theirs.
  for (let n = 0; !mods.length && n < 6; n++) mods = pickMods(recipe, stop.pantry, rng, 1);
  const drink = fountainFor(stop.region)[0];
  const order = orderFromRecipe(id, recipe, true, drink, mods.slice(0, 2), "M", "M");
  const fry = fryerOf(stop)[0];
  if (fry !== "fries") order.fry = fry;
  if (recipe.panini && !recipe.open && stop.press?.slice) order.slice = true;
  if (recipe.pie === "flatbread" && stop.oven?.board) order.slice = true;
  order.ice = true;
  const garnish = garnishFor(stop.region, drink);
  if (garnish) order.garnish = garnish;
  order.regular = regularName(stop.id);
  return order;
}

/**
 * A served regular's order, counted: the new tally, and whether this serve made them a regular
 * (the moment the popularity bonus is paid).
 */
export function countRegular(tally: number, stars: number): { tally: number; won: boolean } {
  if (stars < REGULAR_STARS || tally >= REGULAR_GOAL) return { tally, won: false };
  return { tally: tally + 1, won: tally + 1 === REGULAR_GOAL };
}
