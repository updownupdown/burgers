import type { AskId } from "./asks";
import type { Recipe } from "./stops";

/**
 * What makes a town itself once learned recipes travel (DESIGN §50, scope review row 13): a
 * signature dish, shown first on Prep, named on the town sheet and ordered more there; and a short
 * list of the local asks that suit the place. Nothing here adds a dish, an ask or art.
 */

/** Each town's signature dish, by recipe name: usually the dish the town brings to the road. */
export const SIGNATURE: Record<string, string> = {
  pinecrest: "Trailhead Classic",
  elkpass: "Summit Smash",
  cedarfalls: "Campfire Melt",
  summit: "Lumberjack Stack",
  saltwater: "Caprese",
  gullpoint: "Tuna Melt",
  driftwood: "Chicken Pesto",
  harbor: "Veggie Club",
  redmesa: "Street Tacos",
  cactus: "Pastor Tacos",
  sunvalley: "Breakfast Taco",
  applecross: "Harvest Red",
  larkvale: "Fig & Ham",
  portamber: "Calzone",
};

/** How much more often the signature dish is ordered in its town than any other dish. */
export const SIGNATURE_WEIGHT = 1.8;

export function signatureOf(town: string): string | null {
  return SIGNATURE[town] ?? null;
}

/** The menu with the town's signature dish first; the rest keep their order. */
export function signatureFirst<T extends Pick<Recipe, "name">>(menu: readonly T[], town: string): T[] {
  const sig = signatureOf(town);
  const i = menu.findIndex((r) => r.name === sig);
  return i <= 0 ? [...menu] : [menu[i], ...menu.slice(0, i), ...menu.slice(i + 1)];
}

/**
 * The local asks each town picks from (asks.ts keeps only those its kitchen and menu can do that
 * day). Commuter and party towns want speed, foodie towns care about the finish, families about
 * the basics; each kitchen's own touch turns up where it is made best.
 */
export const TOWN_ASKS: Record<string, AskId[]> = {
  pinecrest: ["five", "marks", "salt"],
  elkpass: ["calm", "marks", "salt"],
  cedarfalls: ["five", "sauce", "salt"],
  summit: ["five", "marks", "sauce"],
  saltwater: ["calm", "garnish", "salt"],
  gullpoint: ["calm", "sauce", "salt"],
  driftwood: ["calm", "garnish", "sauce"],
  harbor: ["cut", "five", "sauce"],
  redmesa: ["five", "garnish", "sauce"],
  cactus: ["calm", "sauce", "garnish"],
  sunvalley: ["handmade", "five", "garnish"],
  applecross: ["leopard", "five", "salt"],
  larkvale: ["calm", "leopard", "garnish"],
  portamber: ["cut", "leopard", "five"],
};
