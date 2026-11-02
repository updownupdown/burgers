import type { DrinkId, ExpectedLayer, FriesSize, FryKind, Kind, Modifier, Order, Size } from "./types";
import { AFTER_OVEN, BREADS, COUNTED, DRINK_LABEL, extraCount, FRY_LABEL, OVEN_CHEESE, PRESS_CHEESE, PROTEINS, SAUCES } from "./types";
import { fountainFor, fryerOf, recipeCount, type Recipe, type Stop } from "./stops";

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

/** Any of the drinks on this town's fountain. */
function anyDrink(drinks: readonly DrinkId[], rng: Rng): DrinkId {
  return drinks[Math.floor(rng() * drinks.length)];
}

/** A poutine meal, or where the fryer makes chips (Red Rock), nachos: chips, queso and jalapeños. */
function poutineOrder(id: number, rng: Rng, level: number, drinks: readonly DrinkId[], fry: FryKind = "fries"): Order {
  const drink = rng() < 0.2 + level * 0.4 ? anyDrink(drinks, rng) : null;
  const r = rng();
  const drinkSize: Size = r < 0.3 ? "S" : r < 0.7 ? "M" : "L";
  const nachos = fry === "chips";
  const order: Order = { id, name: nachos ? "Nachos" : "Poutine", price: POUTINE_PRICE + (drink ? DRINK_PRICE[drinkSize] : 0), mods: [], layers: [], fries: true, friesSize: "L", drink, drinkSize, poutine: true, ...(nachos ? { fry } : {}) };
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}

/** Share of orders on an untoasted burger that ask for a toasted bun anyway: rare, so toasting stays a treat. */
export const TOAST_CHANCE = 0.05;

/** Share of orders, once the shift is going, from someone who only wants a drink or fries: rare, but it happens. */
export const SIDES_ONLY_CHANCE = 0.06;

/** Share of fries orders that want the fryer's second kind, where it has one: sweet potato fries on the coast, churros at Sun Valley. */
export const SWEET_CHANCE = 0.4;

/** The side an order gets from a town's fryer: its usual kind, or now and then one of the others. */
function pickFry(fries: boolean, fryer: readonly FryKind[], rng: Rng): FryKind {
  const alt = fries && fryer.length > 1 && rng() < SWEET_CHANCE;
  if (!alt) return fryer[0] ?? "fries";
  // Orchard Isle fries two others (zucchini fritti, apple fritters): either one.
  return fryer.length > 2 ? fryer[1 + Math.floor(rng() * (fryer.length - 1))] : fryer[1];
}

/** Just a drink (most often), just fries (or chips), or both, and no burger. Drinks come from the town's fountain. */
export function sidesOrder(id: number, rng: Rng, drinks: readonly DrinkId[] = fountainFor("mountains"), fryer: readonly FryKind[] = ["fries"]): Order {
  const r = rng();
  const fries = r >= 0.55;
  const drink = r < 0.55 || r >= 0.85 ? anyDrink(drinks, rng) : null;
  const f = rng();
  const friesSize: FriesSize = f < 0.35 ? "S" : f < 0.75 ? "M" : "L";
  const d = rng();
  const drinkSize: Size = d < 0.3 ? "S" : d < 0.7 ? "M" : "L";
  const fry = fries ? pickFry(fries, fryer, rng) : "fries";
  const friesName = fry === "chips" ? "Chips & salsa" : FRY_LABEL[fry];
  const name = fries && drink ? `${friesName} & a drink` : fries ? friesName : DRINK_LABEL[drink!];
  const price = (fries ? FRIES_PRICE[friesSize] : 0) + (drink ? DRINK_PRICE[drinkSize] : 0);
  const order: Order = { id, name, price, mods: [], layers: [], fries, drink, friesSize, drinkSize, ...(fries && fry !== "fries" ? { fry } : {}) };
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


/**
 * Recipe layers with modifiers applied, bottom to top. On a panini an added filling goes on the
 * protein if there is one, else just under the top slice; on an open-faced toast it goes on top.
 */
export function applyMods(base: Kind[], mods: Modifier[], open = false, dish = false, pie = false): Kind[] {
  let out = base.slice();
  for (const m of mods) {
    if (m.type === "toast") continue;
    if (m.type === "no") out = out.filter((k) => k !== m.kind);
    else if (m.type === "extra") {
      const i = out.lastIndexOf(m.kind);
      if (i >= 0) out.splice(i + 1, 0, m.kind);
    } else if (pie) {
      // A flatbread: an added topping goes on before the oven, under basil, rocket and honey; an
      // added basil or rocket goes on after with them.
      let i = out.length;
      if (!AFTER_OVEN.has(m.kind)) while (i > 1 && AFTER_OVEN.has(out[i - 1])) i--;
      out.splice(i, 0, m.kind);
    } else if (dish) {
      // Tacos, a quesadilla or a tostada: an added filling goes with the others, before the lime and the salsa.
      let i = out.length - 1;
      while (i > 0 && (SAUCES.has(out[i]) || out[i] === "lime")) i--;
      out.splice(i + 1, 0, m.kind);
    } else if (BREADS.has(out[0])) {
      const i = Math.max(out.lastIndexOf("chicken"), out.lastIndexOf("veggie"));
      out.splice(open ? out.length : i >= 0 ? i + 1 : out.length - 1, 0, m.kind);
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
  const full = applyMods(recipe.layers, mods.filter((m) => m.type !== "no" && !(m.type === "extra" && COUNTED.has(m.kind))), !!recipe.open, !!recipe.dish, !!recipe.pie);
  const nos = new Set(mods.filter((m) => m.type === "no").map((m) => m.kind));
  const removed: { kind: Kind; at: number }[] = [];
  const kinds: Kind[] = [];
  for (const k of full) {
    if (!nos.has(k)) kinds.push(k);
    else if (!removed.some((r) => r.kind === k && r.at === kinds.length)) removed.push({ kind: k, at: kinds.length });
  }
  const counted = (kind: Kind) => recipeCount(recipe, kind) + (more.has(kind) ? extraCount(kind) : 0);
  const layers: ExpectedLayer[] = kinds.map((kind, i) => {
    if (recipe.pie) {
      // Orchard Isle: the dough is baked (a calzone folded first; turning it round is up to the cook,
      // for an even bake), the cheese melts in the oven, and basil, rocket and honey go on after.
      const calzone = recipe.pie === "calzone";
      if (kind === "dough") return calzone ? { kind, toasted: true, folded: true } : { kind, toasted: true };
      const exp: ExpectedLayer = { kind };
      if (COUNTED.has(kind)) exp.count = counted(kind);
      if (OVEN_CHEESE.has(kind)) exp.melted = true;
      if (AFTER_OVEN.has(kind)) exp.after = true;
      return exp;
    }
    if (recipe.dish) {
      // Red Rock: tortillas warmed on the comal (a quesadilla's folded and crisped on both sides),
      // its cheese melted inside; the over-easy egg flipped once.
      if (kind === "corn") return { kind, toasted: true, count: counted(kind) };
      if (kind === "flour") return recipe.dish === "quesadilla" ? { kind, toasted: true, folded: true } : { kind, toasted: true };
      if (kind === "jack" && recipe.dish === "quesadilla") return { kind, melted: true };
      if (kind === "egg") return recipe.egg === "over" ? { kind, flipped: true } : { kind };
      if (COUNTED.has(kind)) return { kind, count: counted(kind) };
      return { kind };
    }
    if (recipe.panini) {
      // Panini bread is always pressed golden; cheese inside a closed panini melts; the avocado on
      // an open-faced toast stays cold.
      if (BREADS.has(kind)) return { kind, toasted: true };
      if (PRESS_CHEESE.has(kind) && !recipe.open) return COUNTED.has(kind) ? { kind, melted: true, count: recipeCount(recipe, kind) + (more.has(kind) ? extraCount(kind) : 0) } : { kind, melted: true };
      if (kind === "avocado" && recipe.open) return { kind, cold: true, count: recipeCount(recipe, kind) + (more.has(kind) ? extraCount(kind) : 0) };
    }
    if (kind === "patty") return recipe.smash ? { kind, smashed: true } : { kind };
    if (kind === "bun") return { kind, toasted: recipe.toasted || mods.some((m) => m.type === "toast") };
    if (kind === "egg") return recipe.egg === "over" ? { kind, flipped: true } : { kind };
    if (kind === "cheese" && recipe.melt && kinds[i - 1] === "patty") return { kind, melted: true };
    if (COUNTED.has(kind)) return { kind, count: recipeCount(recipe, kind) + (more.has(kind) ? extraCount(kind) : 0) };
    return { kind };
  });
  const extras = mods.filter((m) => m.type !== "no" && m.type !== "toast").reduce((n, m) => n + (m.type === "extra" && COUNTED.has(m.kind) ? EXTRA_PRICE : ADD_PRICE), 0);
  const price = recipe.price + extras + (fries ? FRIES_PRICE[friesSize] : 0) + (drink ? DRINK_PRICE[drinkSize] : 0);
  return { id, name: recipe.name, price, mods, ...(removed.length ? { removed } : {}), layers, fries, drink, friesSize, drinkSize };
}

/** Toppings a customer may ask to leave off or double up. Buns, breads, patties and other proteins are never optional. */
const OPTIONAL: ReadonlySet<Kind> = new Set<Kind>(["cheese", "lettuce", "tomato", "onion", "pickle", "jalapeno", "pineapple", "bacon", "ketchup", "mustard", "basil", "rocket", "redonion", "pesto", "aioli", "cheddar"]);
const EXTRA_OK: ReadonlySet<Kind> = new Set<Kind>(["cheese", "bacon", "pickle", "onion", "jalapeno", "tomato", "mozzarella", "avocado", "redonion", "tuna"]);
const ADD_OK: Kind[] = ["cheese", "bacon", "pickle", "onion", "jalapeno", "pineapple", "egg", "lettuce", "tomato"];
/** On a panini: avocado is the usual add (and the Veggie Club's favourite), then the cold fillings. */
const PANINI_ADD: Kind[] = ["avocado", "avocado", "rocket", "tomato", "redonion", "basil"];
/** Red Rock: toppings to leave off, to double, and to add. A tortilla, the pork on tacos and a quesadilla's cheese never come off. */
const DISH_OPTIONAL: ReadonlySet<Kind> = new Set<Kind>(["onion", "cilantro", "lettuce", "lime", "pineapple", "greensalsa", "redsalsa", "crema", "jalapeno"]);
const DISH_EXTRA: ReadonlySet<Kind> = new Set<Kind>(["pork", "beans", "onion", "jalapeno", "jack", "cilantro"]);
const DISH_ADD: Kind[] = ["jalapeno", "jalapeno", "jack", "cilantro", "onion"];
/** Orchard Isle: flatbread toppings to leave off, to double, and to add. The dough, its sauce and a calzone's cheese stay. */
const PIE_OPTIONAL: ReadonlySet<Kind> = new Set<Kind>(["basil", "rocket", "honey", "mushroom", "fig", "pear"]);
const PIE_EXTRA: ReadonlySet<Kind> = new Set<Kind>(["mozzarella", "mushroom", "ham", "fig", "pear", "blue"]);
const PIE_ADD: Kind[] = ["mushroom", "ham", "ham", "rocket", "basil"];

export function pickMods(recipe: Recipe, pantry: Kind[], rng: Rng, level: number): Modifier[] {
  const mods: Modifier[] = [];
  const count = rng() < 0.15 + 0.35 * level ? (rng() < 0.25 * level ? 2 : 1) : 0;
  // The Veggie Club's common change: ADD avocado.
  if (recipe.name === "Veggie Club" && pantry.includes("avocado") && rng() < 0.3 + 0.3 * level) mods.push({ type: "add", kind: "avocado" });
  // A quesadilla's: ADD pork or ADD jalapeños (laid on the cheese before it's folded).
  if (recipe.dish === "quesadilla" && rng() < 0.3 + 0.3 * level) {
    const k: Kind = rng() < 0.55 ? "pork" : "jalapeno";
    if (pantry.includes(k)) mods.push({ type: "add", kind: k });
  }
  const dish = !!recipe.dish;
  const pie = !!recipe.pie;
  for (let n = mods.length; n < count; n++) {
    const has = new Set(applyMods(recipe.layers, mods, !!recipe.open, dish, pie));
    const roll = rng();
    const pick = <T>(xs: T[]) => (xs.length ? xs[Math.floor(rng() * xs.length)] : null);
    let m: Modifier | null = null;
    if (pie) {
      // Flatbreads keep to their own lists too; nothing is added to a calzone once it's folded but more of what's in it.
      if (roll < 0.4) {
        const k = pick([...has].filter((k) => PIE_OPTIONAL.has(k) && !(recipe.pie === "calzone")));
        if (k) m = { type: "no", kind: k };
      } else if (roll < 0.75 || recipe.pie === "calzone") {
        const k = pick([...has].filter((k) => PIE_EXTRA.has(k)));
        if (k) m = { type: "extra", kind: k };
      } else {
        const k = pick(PIE_ADD.filter((k) => pantry.includes(k) && !has.has(k)));
        if (k) m = { type: "add", kind: k };
      }
    } else if (dish) {
      // Tacos, quesadillas and tostadas keep to their own lists.
      if (roll < 0.45) {
        const k = pick([...has].filter((k) => DISH_OPTIONAL.has(k)));
        if (k) m = { type: "no", kind: k };
      } else if (roll < 0.75) {
        const k = pick([...has].filter((k) => DISH_EXTRA.has(k)));
        if (k) m = { type: "extra", kind: k };
      } else {
        const k = pick(DISH_ADD.filter((k) => pantry.includes(k) && !has.has(k)));
        if (k) m = { type: "add", kind: k };
      }
    } else if (roll < 0.45) {
      const k = pick([...has].filter((k) => OPTIONAL.has(k)));
      if (k) m = { type: "no", kind: k };
    } else if (roll < 0.75) {
      const k = pick([...has].filter((k) => EXTRA_OK.has(k)));
      if (k) m = { type: "extra", kind: k };
    } else {
      // An open-faced toast takes nothing that would need pressing.
      const k = pick((recipe.panini ? PANINI_ADD : ADD_OK).filter((k) => pantry.includes(k) && !has.has(k) && !(recipe.open && (PROTEINS.has(k) || PRESS_CHEESE.has(k)))));
      if (k) m = { type: "add", kind: k };
    }
    if (m && !mods.some((o) => o.kind === m!.kind)) mods.push(m);
  }
  return mods;
}

/**
 * Every burger on the menu can be ordered all day. Tall ones, and the ones marked `from`, are
 * just rarer early on and come up more as the shift goes on.
 */
export function recipeWeight(r: Recipe, level: number): number {
  let w = 1;
  if (r.from) w *= level >= r.from ? 1.2 : 0.3 + 0.7 * (level / r.from);
  if (r.layers.length > 6) w *= 0.5 + Math.min(1, level / 0.4) * 0.5;
  return w;
}

export function pickRecipe(menu: readonly Recipe[], level: number, rng: Rng): Recipe {
  const ws = menu.map((r) => recipeWeight(r, level));
  let t = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < menu.length; i++) {
    t -= ws[i];
    if (t < 0) return menu[i];
  }
  return menu[menu.length - 1];
}

/**
 * `level` (0..1) ramps difficulty through the shift: early orders are simpler and rarely
 * come with sides.
 */
export function makeOrder(id: number, rng: Rng, level: number, stop: Stop): Order {
  const drinks = fountainFor(stop.region);
  const fryer = fryerOf(stop);
  // Towns without poutine still roll for it, so the rest of the order stream stays the same.
  if (level >= 0.15 && rng() < POUTINE_CHANCE && stop.poutine) return poutineOrder(id, rng, level, drinks, fryer[0]);
  if (level >= 0.15 && rng() < SIDES_ONLY_CHANCE) return sidesOrder(id, rng, drinks, fryer);
  const recipe = pickRecipe(stop.menu, level, rng);
  const fries = rng() < 0.25 + level * 0.4;
  const drink = rng() < 0.2 + level * 0.5 ? anyDrink(drinks, rng) : null;
  // Modifiers keep tickets short: a known recipe plus "no pickles" rather than a new list.
  const mods = level < 0.1 ? [] : pickMods(recipe, stop.pantry, rng, level);
  // Now and then someone wants their bun toasted on a burger that doesn't usually come that way.
  if (!recipe.toasted && level >= 0.2 && rng() < TOAST_CHANCE) mods.push({ type: "toast", kind: "bun" });
  const fry = pickFry(fries, fryer, rng);
  const f = rng();
  const friesSize: FriesSize = f < 0.35 ? "S" : f < 0.75 ? "M" : "L";
  const r = rng();
  const drinkSize: Size = r < 0.3 ? "S" : r < 0.7 ? "M" : "L";
  const order = orderFromRecipe(id, recipe, fries, drink, mods, friesSize, drinkSize);
  if (fries && fry !== "fries") order.fry = fry;
  // At Harbor City a closed panini goes out cut in half; at Port Amber a flatbread is cut in four.
  if (recipe.panini && !recipe.open && stop.press?.slice) order.slice = true;
  if (recipe.pie === "flatbread" && stop.oven?.board) order.slice = true;
  if (drink) {
    const i = rng();
    order.ice = i < 0.45 ? true : i < 0.7 ? false : null;
  }
  return order;
}
