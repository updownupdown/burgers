import type { Doneness, DrinkId, ExpectedLayer, Kind, Order } from "./types";

export interface Recipe {
  name: string;
  price: number;
  /** Bottom to top. "patty" layers get a random doneness per order. */
  layers: Kind[];
  toasted: boolean;
}

/** Stop 1: Pinecrest, a mountain town. */
export const PINECREST_MENU: Recipe[] = [
  { name: "Trailhead Classic", price: 9, layers: ["bun", "ketchup", "patty", "lettuce", "tomato", "bun"], toasted: true },
  { name: "Cheesy Switchback", price: 10, layers: ["bun", "patty", "cheese", "pickle", "mustard", "bun"], toasted: false },
  { name: "Sunrise Summit", price: 11, layers: ["bun", "lettuce", "patty", "egg", "bun"], toasted: true },
  { name: "Lumberjack Stack", price: 15, layers: ["bun", "patty", "cheese", "bacon", "onion", "patty", "ketchup", "bun"], toasted: true },
  { name: "Plain Jane", price: 6, layers: ["bun", "patty", "bun"], toasted: false },
];

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

/**
 * `level` (0..1) ramps difficulty through the shift: early orders are simpler and rarely
 * come with sides.
 */
export function makeOrder(id: number, rng: Rng, level: number): Order {
  const pool = level < 0.25 ? PINECREST_MENU.filter((r) => r.layers.length <= 6) : PINECREST_MENU;
  const recipe = pool[Math.floor(rng() * pool.length)];
  const doneness = DONENESS[Math.floor(rng() * DONENESS.length)];
  const layers: ExpectedLayer[] = recipe.layers.map((kind) => {
    if (kind === "patty") return { kind, doneness };
    if (kind === "bun") return { kind, toasted: recipe.toasted };
    return { kind };
  });
  const fries = rng() < 0.25 + level * 0.4;
  const drink = rng() < 0.2 + level * 0.5 ? DRINKS[Math.floor(rng() * DRINKS.length)] : null;
  const price = recipe.price + (fries ? FRIES_PRICE : 0) + (drink ? DRINK_PRICE : 0);
  return { id, name: recipe.name, price, layers, fries, drink };
}
