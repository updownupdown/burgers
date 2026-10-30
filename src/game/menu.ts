import type { Doneness, DrinkId, ExpectedLayer, Order } from "./types";
import type { Recipe, Stop } from "./stops";

export const FRIES_PRICE = 3;
export const DRINK_PRICE = 2;

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const DONENESS: Doneness[] = ["rare", "medium", "well"];
const DRINKS: DrinkId[] = ["pine", "lemon", "cola"];

export function orderFromRecipe(id: number, recipe: Recipe, doneness: Doneness, fries: boolean, drink: DrinkId | null): Order {
  const layers: ExpectedLayer[] = recipe.layers.map((kind) => {
    if (kind === "patty") return recipe.smash ? { kind, doneness, smashed: true } : { kind, doneness };
    if (kind === "bun") return { kind, toasted: recipe.toasted };
    return { kind };
  });
  const price = recipe.price + (fries ? FRIES_PRICE : 0) + (drink ? DRINK_PRICE : 0);
  return { id, name: recipe.name, price, layers, fries, drink };
}

/**
 * `level` (0..1) ramps difficulty through the shift: early orders are simpler and rarely
 * come with sides.
 */
export function makeOrder(id: number, rng: Rng, level: number, stop: Stop): Order {
  let pool = stop.menu.filter((r) => (r.from ?? 0) <= level);
  if (level < 0.25) pool = pool.filter((r) => r.layers.length <= 6);
  if (!pool.length) pool = stop.menu;
  const recipe = pool[Math.floor(rng() * pool.length)];
  // Smashed patties are thin, so they're always cooked through.
  const doneness = recipe.smash ? "well" : DONENESS[Math.floor(rng() * DONENESS.length)];
  const fries = rng() < 0.25 + level * 0.4;
  const drink = rng() < 0.2 + level * 0.5 ? DRINKS[Math.floor(rng() * DRINKS.length)] : null;
  return orderFromRecipe(id, recipe, doneness, fries, drink);
}
