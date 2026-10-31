/*
 * Game units against the real world, and how big food is drawn next to machines.
 *
 * One game unit is 15 cm. The Kitchen Bench study modelled every machine at true size in
 * 10 cm units, so its numbers port over times STUDY. At this mapping today's camera (about
 * 7 to 8 units across) frames a 1.1 to 1.2 m counter, as the study's base zoom does.
 *
 * Food follows the study's "Per category" rule against true-size machines: burger parts are
 * drawn 1.5 times life size, thin toppings 1.6, fries and cartons 1.25, cups 1.1.
 */

/** Game units per study unit (10 cm). */
export const STUDY = 2 / 3;

/**
 * Game units per model unit, by food category:
 * - burger: makeFood() ingredient units (a patty is about 2 across, 11.5 cm real) at x1.5.
 *   Thin toppings carry their extra 1.6/1.5 inside makeFood, so this one number covers
 *   everything makeFood returns, on the grill, in the hand and on plates.
 * - topping: the effective scale of thin toppings, for reference.
 * - fries: carton units (a large carton or boat is 0.6 to 0.76 across, 1 unit = 15 cm real) at x1.25.
 * - cup: cup units, which are study units at real size (a large cup is 10 cm across), at x1.1.
 */
export const SCALE = {
  burger: 0.575 * 1.5 * STUDY,
  topping: 0.575 * 1.6 * STUDY,
  fries: 1.5 * 1.25 * STUDY,
  cup: 1.1 * STUDY,
} as const;

export type FoodCategory = keyof typeof SCALE;

/**
 * A category's scale against burger parts. A view that zooms food (the tray plates) draws a
 * burger at s and keeps everything consistent by drawing fries at s * relScale("fries").
 */
export function relScale(cat: FoodCategory): number {
  return SCALE[cat] / SCALE.burger;
}

/** Thin toppings are built this much bigger than burger parts inside makeFood. */
export const TOPPING_BOOST = SCALE.topping / SCALE.burger;
