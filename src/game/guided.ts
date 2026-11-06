/**
 * The guided first order at each new kitchen (DESIGN §48). The grill has its guided first shift
 * (tutorial/lessons.ts); the panini press, the comal and the deck oven each get one coach-guided
 * order the first time the truck cooks on them: the clock waits until it's served, and the coach
 * shows one move at a time. Only with tutorial mode on, and once per kitchen per device.
 */
import { middleOf, STOPS, type MiddleCounter, type Recipe } from "./stops";

export type NewKitchen = Exclude<MiddleCounter, "grill">;

/** The dish each kitchen's guided order makes: the first town's simplest dish there. */
export const GUIDED_DISH: Record<NewKitchen, string> = { press: "Caprese", comal: "Street Tacos", oven: "Harvest Red" };

/** The coach's learned-lesson id for a kitchen's guided order (kept in `bv-coach`). */
export const guidedKey = (m: NewKitchen): string => `guided-${m}`;

/** Shifts worked so far in towns that cook on this middle counter. */
export function counterShifts(shiftsIn: Record<string, number>, m: MiddleCounter): number {
  return STOPS.filter((t) => middleOf(t) === m).reduce((n, t) => n + (shiftsIn[t.id] ?? 0), 0);
}

export interface GuideCheck {
  /** The town's middle counter today. */
  middle: MiddleCounter;
  /** Tutorial mode is on. */
  coach: boolean;
  /** The coach has this lesson down as learned. */
  learned: (id: string) => boolean;
  shiftsIn: Record<string, number>;
  /**
   * The grill's guided shift is still to come (a new trip, or tutorial mode just switched back on,
   * which replays every lesson): then a kitchen already worked is taught again too.
   */
  replay: boolean;
}

/** Which kitchen this shift's first order is guided at, or null. */
export function guidedKitchen(c: GuideCheck): NewKitchen | null {
  if (c.middle === "grill" || !c.coach || c.learned(guidedKey(c.middle))) return null;
  if (counterShifts(c.shiftsIn, c.middle) > 0 && !c.replay) return null;
  return c.middle;
}

/** The recipe the guided order makes: the kitchen's dish if it's on today's menu, else the menu's first. */
export function guidedRecipe(menu: readonly Recipe[], m: NewKitchen): Recipe | null {
  return menu.find((r) => r.name === GUIDED_DISH[m]) ?? menu[0] ?? null;
}
