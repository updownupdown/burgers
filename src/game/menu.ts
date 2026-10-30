import type { Doneness, DrinkId, ExpectedLayer, FriesSize, Kind, Modifier, Order, Size } from "./types";
import type { Recipe, Stop } from "./stops";

export const FRIES_PRICE: Record<FriesSize, number> = { S: 2, M: 3, L: 4 };
export const DRINK_PRICE: Record<Size, number> = { S: 1, M: 2, L: 3 };

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const DONENESS: Doneness[] = ["rare", "medium", "well"];
const DRINKS: DrinkId[] = ["pine", "lemon", "cola"];

/** Recipe layers with modifiers applied, bottom to top. */
export function applyMods(base: Kind[], mods: Modifier[]): Kind[] {
  let out = base.slice();
  for (const m of mods) {
    if (m.type === "no") out = out.filter((k) => k !== m.kind);
    else if (m.type === "extra") {
      const i = out.lastIndexOf(m.kind);
      if (i >= 0) out.splice(i + 1, 0, m.kind);
    } else {
      // Added toppings go on the top patty, under anything soft above it.
      const i = out.lastIndexOf("patty");
      out.splice(i >= 0 ? i + 1 : out.length - 1, 0, m.kind);
    }
  }
  return out;
}

export function orderFromRecipe(
  id: number,
  recipe: Recipe,
  doneness: Doneness,
  fries: boolean,
  drink: DrinkId | null,
  mods: Modifier[] = [],
  friesSize: FriesSize = "S",
  drinkSize: Size = "M",
): Order {
  const kinds = applyMods(recipe.layers, mods);
  const layers: ExpectedLayer[] = kinds.map((kind, i) => {
    if (kind === "patty") return recipe.smash ? { kind, doneness, smashed: true } : { kind, doneness };
    if (kind === "bun") return { kind, toasted: recipe.toasted };
    if (kind === "cheese" && recipe.melt && kinds[i - 1] === "patty") return { kind, melted: true };
    return { kind };
  });
  const extras = mods.filter((m) => m.type !== "no").length;
  const price = recipe.price + extras + (fries ? FRIES_PRICE[friesSize] : 0) + (drink ? DRINK_PRICE[drinkSize] : 0);
  return { id, name: recipe.name, price, mods, layers, fries, drink, friesSize, drinkSize };
}

/** Toppings a customer may ask to leave off or double up. Buns and patties are never optional. */
const OPTIONAL: ReadonlySet<Kind> = new Set<Kind>(["cheese", "lettuce", "tomato", "onion", "pickle", "jalapeno", "pineapple", "bacon", "ketchup", "mustard"]);
const EXTRA_OK: ReadonlySet<Kind> = new Set<Kind>(["cheese", "bacon", "pickle", "onion", "jalapeno", "tomato"]);
const ADD_OK: Kind[] = ["cheese", "bacon", "pickle", "onion", "jalapeno", "pineapple", "egg", "lettuce", "tomato"];

export function pickMods(recipe: Recipe, pantry: Kind[], rng: Rng, level: number): Modifier[] {
  const mods: Modifier[] = [];
  const count = rng() < 0.15 + 0.35 * level ? (rng() < 0.25 * level ? 2 : 1) : 0;
  for (let n = 0; n < count; n++) {
    const has = new Set(applyMods(recipe.layers, mods));
    const roll = rng();
    const pick = <T>(xs: T[]) => (xs.length ? xs[Math.floor(rng() * xs.length)] : null);
    let m: Modifier | null = null;
    if (roll < 0.45) {
      const k = pick([...has].filter((k) => OPTIONAL.has(k)));
      if (k) m = { type: "no", kind: k };
    } else if (roll < 0.75) {
      const k = pick([...has].filter((k) => EXTRA_OK.has(k)));
      if (k) m = { type: "extra", kind: k };
    } else {
      const k = pick(ADD_OK.filter((k) => pantry.includes(k) && !has.has(k)));
      if (k) m = { type: "add", kind: k };
    }
    if (m && !mods.some((o) => o.kind === m!.kind)) mods.push(m);
  }
  return mods;
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
  // Modifiers keep tickets short: a known recipe plus "no pickles" rather than a new list.
  const mods = level < 0.1 ? [] : pickMods(recipe, stop.pantry, rng, level);
  const f = rng();
  const friesSize: FriesSize = f < 0.35 ? "S" : f < 0.75 ? "M" : "L";
  const r = rng();
  const drinkSize: Size = r < 0.3 ? "S" : r < 0.7 ? "M" : "L";
  const order = orderFromRecipe(id, recipe, doneness, fries, drink, mods, friesSize, drinkSize);
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}
