import { bonusById, type BonusId } from "./bonus";
import { lookById, onSale, validLook } from "./looks";
import type { Save } from "./progress";

/**
 * The Garage: where savings are spent. Bonuses are on sale once a great shift in their town has
 * unlocked them; looks are on sale from the start (souvenirs once the truck has worked in their
 * town). Every purchase is kept; nothing here can be sold back.
 */

export type BonusState = "locked" | "forSale" | "owned";

export function bonusState(s: Save, id: BonusId): BonusState {
  return s.bonuses.includes(id) ? "owned" : s.found.includes(id) ? "forSale" : "locked";
}

/** Buy an unlocked bonus. False when it isn't for sale or savings fall short. */
export function buyBonus(s: Save, id: BonusId): boolean {
  const b = bonusById(id);
  if (!b || bonusState(s, id) !== "forSale" || s.bank < b.price) return false;
  s.bank -= b.price;
  s.bonuses.push(id);
  return true;
}

/** Towns the truck has worked a shift in (souvenirs are sold there). */
export function workedIn(s: Save): string[] {
  return Object.keys(s.shiftsIn).filter((id) => (s.shiftsIn[id] ?? 0) > 0).concat(s.passedTowns);
}

export function ownsLook(s: Save, id: string): boolean {
  const it = lookById(id);
  return !!it && (it.price === 0 || s.looks.includes(id));
}

/** Buy a look and put it on. False when it isn't on sale or savings fall short. */
export function buyLook(s: Save, id: string): boolean {
  const it = lookById(id);
  if (!it || ownsLook(s, id) || !onSale(it, workedIn(s)) || s.bank < it.price) return false;
  s.bank -= it.price;
  s.looks.push(id);
  wearLook(s, id);
  return true;
}

/** Put on an owned look (in its slot). */
export function wearLook(s: Save, id: string): boolean {
  const it = lookById(id);
  if (!it || !ownsLook(s, id)) return false;
  s.look = validLook({ ...s.look, [it.slot]: id }, s.looks);
  return true;
}

/** Bonuses unlocked, not yet bought, and affordable now: the Garage button shows a dot. */
export function readyToBuy(s: Save): number {
  return s.found.filter((id) => !s.bonuses.includes(id) && s.bank >= (bonusById(id)?.price ?? Infinity)).length;
}
