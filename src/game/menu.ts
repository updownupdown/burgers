import type { DrinkId, ExpectedLayer, FriesSize, Kind, Modifier, Order, Size } from "./types";
import { COUNTED, DRINK_LABEL, DRINKS, extraCount } from "./types";
import { recipeCount, type Recipe, type Stop } from "./stops";

export const FRIES_PRICE: Record<FriesSize, number> = { S: 2, M: 3, L: 4 };
export const DRINK_PRICE: Record<Size, number> = { S: 1, M: 2, L: 3 };
/** What an extra helping of a counted topping (pickles, onions, tomato, jalapeños) adds to the price. */
export const EXTRA_PRICE = 0.5;
/** What adding (or doubling) any other layer adds to the price, as orderFromRecipe charges it. */
export const ADD_PRICE = 1;
/** A poutine meal: a large carton of fries under cheese curds and gravy. */
export const POUTINE_PRICE = 8;
/** Share of orders, once the shift is going, that are a poutine instead of a burger. */
const POUTINE_CHANCE = 0.12;

function poutineOrder(id: number, rng: Rng, level: number): Order {
  const drink = rng() < 0.2 + level * 0.4 ? DRINKS[Math.floor(rng() * DRINKS.length)] : null;
  const r = rng();
  const drinkSize: Size = r < 0.3 ? "S" : r < 0.7 ? "M" : "L";
  const order: Order = { id, name: "Poutine", price: POUTINE_PRICE + (drink ? DRINK_PRICE[drinkSize] : 0), mods: [], layers: [], fries: true, friesSize: "L", drink, drinkSize, poutine: true };
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}

/** Share of orders, once the shift is going, from someone who only wants a drink or fries: rare, but it happens. */
export const SIDES_ONLY_CHANCE = 0.06;

/** Just a drink (most often), just fries, or both, and no burger. */
export function sidesOrder(id: number, rng: Rng): Order {
  const r = rng();
  const fries = r >= 0.55;
  const drink = r < 0.55 || r >= 0.85 ? DRINKS[Math.floor(rng() * DRINKS.length)] : null;
  const f = rng();
  const friesSize: FriesSize = f < 0.35 ? "S" : f < 0.75 ? "M" : "L";
  const d = rng();
  const drinkSize: Size = d < 0.3 ? "S" : d < 0.7 ? "M" : "L";
  const name = fries && drink ? "Fries & a drink" : fries ? "Fries" : DRINK_LABEL[drink!];
  const price = (fries ? FRIES_PRICE[friesSize] : 0) + (drink ? DRINK_PRICE[drinkSize] : 0);
  const order: Order = { id, name, price, mods: [], layers: [], fries, drink, friesSize, drinkSize };
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}

/** No burger on this order: a poutine, or just a drink and/or fries. */
export function noBurger(order: Order): boolean {
  return order.layers.length === 0;
}

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}


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
  fries: boolean,
  drink: DrinkId | null,
  mods: Modifier[] = [],
  friesSize: FriesSize = "S",
  drinkSize: Size = "M",
): Order {
  // "Extra pickles" means more pickles in the same layer, not a second layer of them.
  const more = new Set(mods.filter((m) => m.type === "extra" && COUNTED.has(m.kind)).map((m) => m.kind));
  // Leave-offs come out last, so the ticket can show "- Ketchup" where the ketchup would have gone.
  const full = applyMods(recipe.layers, mods.filter((m) => m.type !== "no" && !(m.type === "extra" && COUNTED.has(m.kind))));
  const nos = new Set(mods.filter((m) => m.type === "no").map((m) => m.kind));
  const removed: { kind: Kind; at: number }[] = [];
  const kinds: Kind[] = [];
  for (const k of full) {
    if (!nos.has(k)) kinds.push(k);
    else if (!removed.some((r) => r.kind === k && r.at === kinds.length)) removed.push({ kind: k, at: kinds.length });
  }
  const layers: ExpectedLayer[] = kinds.map((kind, i) => {
    if (kind === "patty") return recipe.smash ? { kind, smashed: true } : { kind };
    if (kind === "bun") return { kind, toasted: recipe.toasted };
    if (kind === "cheese" && recipe.melt && kinds[i - 1] === "patty") return { kind, melted: true };
    if (COUNTED.has(kind)) return { kind, count: recipeCount(recipe, kind) + (more.has(kind) ? extraCount(kind) : 0) };
    return { kind };
  });
  const extras = mods.filter((m) => m.type !== "no").reduce((n, m) => n + (m.type === "extra" && COUNTED.has(m.kind) ? EXTRA_PRICE : ADD_PRICE), 0);
  const price = recipe.price + extras + (fries ? FRIES_PRICE[friesSize] : 0) + (drink ? DRINK_PRICE[drinkSize] : 0);
  return { id, name: recipe.name, price, mods, ...(removed.length ? { removed } : {}), layers, fries, drink, friesSize, drinkSize };
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
  if (level >= 0.15 && rng() < POUTINE_CHANCE) return poutineOrder(id, rng, level);
  if (level >= 0.15 && rng() < SIDES_ONLY_CHANCE) return sidesOrder(id, rng);
  let pool = stop.menu.filter((r) => (r.from ?? 0) <= level);
  if (level < 0.25) pool = pool.filter((r) => r.layers.length <= 6);
  if (!pool.length) pool = stop.menu;
  const recipe = pool[Math.floor(rng() * pool.length)];
  const fries = rng() < 0.25 + level * 0.4;
  const drink = rng() < 0.2 + level * 0.5 ? DRINKS[Math.floor(rng() * DRINKS.length)] : null;
  // Modifiers keep tickets short: a known recipe plus "no pickles" rather than a new list.
  const mods = level < 0.1 ? [] : pickMods(recipe, stop.pantry, rng, level);
  const f = rng();
  const friesSize: FriesSize = f < 0.35 ? "S" : f < 0.75 ? "M" : "L";
  const r = rng();
  const drinkSize: Size = r < 0.3 ? "S" : r < 0.7 ? "M" : "L";
  const order = orderFromRecipe(id, recipe, fries, drink, mods, friesSize, drinkSize);
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}
