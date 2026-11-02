/**
 * Dishes in words, for Prep, the pause card's Today's menu and the full menu: what's in each, how
 * it's made, and the sides a town serves. No DOM here, so it's tested on its own.
 */
import { fryerOf, recipeCount, type Recipe, type Stop } from "../game/stops";
import { AFTER_OVEN, BREADS, COUNTED, KIND_LABEL, type FryKind } from "../game/types";

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

/** The sides and drinks in one line, as this town's fryer and fountain have them. */
export function sidesLine(town: Stop): string {
  const fryer = fryerOf(town);
  const sides = fryer.map((f) => FRY_NAME[f]);
  if (town.poutine) sides.push(fryer.includes("chips") ? "Nachos" : "Poutine");
  return `${sides.join(", ")} S, M, L · Drinks S, M, L, with ice and a lid unless asked.`;
}
