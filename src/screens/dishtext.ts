/**
 * Dishes in words, for Prep, the pause card's Today's menu and the full menu: what's in each, how
 * it's made, and the sides a town serves. No DOM here, so it's tested on its own.
 */
import { DRINK_PRICE, FRIES_PRICE } from "../game/menu";
import { fountainFor, fryerOf, garnishOf, recipeCount, type Recipe, type Stop } from "../game/stops";
import { AFTER_OVEN, BREADS, COUNTED, KIND_LABEL, PROTEINS, SAUCES, SCOOPED, SUGARED, TORTILLAS, type DrinkId, type FryKind, type Garnish, type Kind } from "../game/types";

/**
 * What's in a dish, in one line, bottom to top: between the buns or slices of a closed burger or
 * panini; everything on an open toast, a flatbread or in the tortillas (a counted tortilla, as on
 * tacos, with its count). Counted toppings once, with their count.
 */
export function buildLine(r: Recipe): string {
  const closed = !r.open && !r.dish && !r.pie && r.layers.length > 2 && (r.layers[0] === "bun" || BREADS.has(r.layers[0]));
  const inner = closed ? r.layers.slice(1, -1) : r.layers.slice(r.dish ? (COUNTED.has(r.layers[0]) ? 0 : 1) : r.pie || r.open ? 1 : 0);
  return inner
    .filter((k, i) => !COUNTED.has(k) || inner.indexOf(k) === i)
    .map((k) => (COUNTED.has(k) && recipeCount(r, k) > 1 ? `${KIND_LABEL[k]} ×${recipeCount(r, k)}` : KIND_LABEL[k]))
    .join(" · ");
}

/** How a dish is made, in a few words: the ticket's own steps, per kind of dish. */
export function methodTags(r: Recipe): string[] {
  if (r.panini) return [r.open ? "Open-faced, bread pressed" : "Pressed", r.melt ? "Melted cheese" : ""].filter(Boolean);
  if (r.dish) return [r.dish === "quesadilla" ? "Folded, flipped once" : r.dish === "tostada" ? "Fried shell" : "Warm tortillas", r.melt ? "Melted cheese" : ""].filter(Boolean);
  if (r.pie) {
    const after = r.layers.filter((k) => AFTER_OVEN.has(k));
    return [r.pie === "calzone" ? "Folded, baked" : "Baked in the oven", after.length ? `${after.map((k) => KIND_LABEL[k]).join(", ")} after` : ""].filter(Boolean);
  }
  return [r.toasted ? "Toasted bun" : "", r.smash ? "Smashed patty" : "", r.melt ? "Melted cheese" : ""].filter(Boolean);
}

const FRY_NAME: Record<FryKind, string> = { fries: "Fries", sweet: "Sweet potato fries", chips: "Chips & salsa", churros: "Churros", zucchini: "Zucchini fritti", fritters: "Apple fritters" };

/** The town's sides by name, the usual one first (poutine or nachos last, where they're on). */
export function sidesOf(town: Stop): string[] {
  const fryer = fryerOf(town);
  const sides = fryer.map((f) => FRY_NAME[f]);
  if (town.poutine) sides.push(fryer.includes("chips") ? "Nachos" : "Poutine");
  return sides;
}

/** The sides and drinks in one line, as this town's fryer and fountain have them. */
export function sidesLine(town: Stop): string {
  return `${sidesOf(town).join(", ")} S, M, L · Drinks S, M, L, with ice and a lid unless asked.`;
}

const lower = (k: Kind) => KIND_LABEL[k].toLowerCase();
const list = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : (w[0] ?? ""));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const range = (p: Record<string, number>) => {
  const v = Object.values(p);
  return `$${Math.min(...v)} to $${Math.max(...v)}`;
};

/** One layer of a dish as it goes on, with how many pieces. */
export interface Ingredient {
  kind: Kind;
  label: string;
  count: number;
}

/** Every layer of a dish, bottom to top, buns and bread included; counted toppings with their count. */
export function ingredients(r: Recipe): Ingredient[] {
  return r.layers.map((k) => ({ kind: k, label: KIND_LABEL[k], count: COUNTED.has(k) ? recipeCount(r, k) : 1 }));
}

/**
 * Practical tips for a dish in the town it's made in, worked out from the recipe (how it's
 * cooked, what goes on after, whether it's cut here) rather than kept per dish. Simple dishes
 * have none; the busiest get at most three, the most useful first.
 */
export function dishTips(r: Recipe, town: Pick<Stop, "press" | "comal" | "oven">): string[] {
  const t: string[] = [];
  const at = (set: ReadonlySet<Kind>) => r.layers.filter((k) => set.has(k));
  const atTray = at(SAUCES).filter((k) => k === "redsalsa" || k === "greensalsa" || k === "crema");
  if (r.panini) {
    for (const k of at(PROTEINS)) t.push(`Press the ${lower(k)} on its own first, until its meter says done.`);
    if (r.open) {
      t.push(`Press only the ${lower(r.layers[0])}, then top it cold: ${list(r.layers.slice(1).map(lower))}.`);
    } else {
      t.push("Build it on a tray, drag it down into a bay and press until golden.");
      if (town.press?.slice) t.push("Cut it in half on the board before it goes up.");
    }
  } else if (r.dish === "tacos") {
    const tort = r.layers.find((k) => TORTILLAS.has(k)) ?? "corn";
    const n = recipeCount(r, tort);
    t.push(n > 1 ? `Warm ${n} ${lower(tort)}s on the hot side, then drag each by its middle into the rack.` : `Warm the ${lower(tort)} on the hot side, then drag it by its middle into the rack.`);
    const scoop = at(SCOOPED)[0];
    if (r.layers.includes("egg")) t.push(`Crack the egg on the hot side${r.egg === "over" ? " and flip it once: over easy" : ": no flip"}.`);
    else if (r.layers.includes("pineapple")) t.push("Char the pineapple on the comal; flick it to flip.");
    else if (scoop && n > 1) t.push(`One scoop of ${lower(scoop)} per taco; the other toppings go in once, over all of them.`);
    if (atTray.length) t.push(`${cap(list(atTray.map(lower)))} ${atTray.length > 1 ? "go" : "goes"} on at the tray, not in the rack.`);
  } else if (r.dish === "quesadilla") {
    t.push(`${KIND_LABEL[r.layers[0]]} on the hot side, cheese on, then drag across the middle to fold it.`);
    t.push("Flip it once and take it up when the chip says Melted.");
  } else if (r.dish === "tostada") {
    t.push("Drop a corn tortilla in an empty fryer basket for the shell, then build it flat on the tray.");
    if (atTray.length) t.push(`${cap(list(atTray.map(lower)))} last, drawn on at the tray.`);
  } else if (r.pie) {
    const after = at(AFTER_OVEN);
    if (r.pie === "calzone") t.push("Fill it on the peel, then drag across to fold it before it goes in. It goes out whole.");
    else if (r.layers.includes("oil")) t.push("Olive oil, not sauce: drag it from the bottle.");
    t.push("Turn it with the peel's tip about halfway, for an even bake and leopard spots.");
    if (after.length) t.push(`${cap(list(after.map(lower)))} ${after.length > 1 ? "go" : "goes"} on at the tray, after the oven.`);
    if (r.pie === "flatbread" && town.oven?.board) t.push("Cut it in four on the board: one slice, then one the other way.");
  } else {
    const patties = r.layers.filter((k) => k === "patty").length;
    if (r.smash) t.push("Press and hold a fresh patty to smash it thin. It cooks fast.");
    if (patties > 1) t.push(`${patties === 2 ? "Two" : patties} patties: start them together, they take longest.`);
    if (r.melt) t.push(`Drop the cheese on ${patties > 1 ? "a patty" : "the patty"} on the grill; they come up together.`);
    if (r.layers.includes("egg")) t.push(r.egg === "over" ? "Crack the egg on the flat and flip it once: over easy." : "Crack the egg on the flat. Sunny side up: no flip.");
    if (r.toasted) t.push("Toast both buns, cut side down.");
  }
  if (r.layers.includes("corn") && town.comal?.tpress) t.push("Hand-pressed tortillas add to the tip.");
  return t.slice(0, 3);
}

const GARNISH: Record<Garnish, string> = { cucumber: "a cucumber wheel", lime: "a lime wedge", apple: "an apple slice" };

/** The town's sides for the pause card: what the fryer makes, the sizes and the prices. */
export function sidesInfo(town: Stop): { kind: FryKind; names: string[]; note: string } {
  const fryer = fryerOf(town);
  return {
    kind: fryer[0],
    names: sidesOf(town),
    note: `S, M, L · ${range(FRIES_PRICE)} · ${fryer.some((f) => SUGARED.has(f)) ? "salted, or sugared where sweet" : "salted"}`,
  };
}

/** Today's fountain for the pause card: the flavours, sizes and prices, and the local garnish. */
export function drinksInfo(town: Stop): { drinks: DrinkId[]; note: string } {
  const g = garnishOf(town.region);
  return {
    drinks: fountainFor(town.region),
    note: `S, M, L · ${range(DRINK_PRICE)} · ice and a lid unless asked${g ? `; ${GARNISH[g]} on the two local ones` : ""}`,
  };
}
