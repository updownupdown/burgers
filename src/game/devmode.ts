/**
 * Dev mode: a switch at the bottom of Settings that unlocks "Simulate progress", which swaps the
 * trip for a made-up one at 0%, 50% or 100% of the road so the menus and the map can be tried at
 * each stage. The real trip is kept aside in storage and comes back when the simulation is
 * turned off (or dev mode is).
 */
import type { Review } from "./business";
import { BONUSES } from "./bonus";
import { freshSave, START_POPULARITY, type Save } from "./progress";
import { START_TOWN, STOPS, townById } from "./stops";
import { SHIFTS_TO_UNLOCK } from "./travel";

export type SimLevel = 0 | 50 | 100;
export const SIM_LEVELS: SimLevel[] = [0, 50, 100];

const DEV_KEY = "bv-dev";
const SIM_KEY = "bv-dev-sim";
const REAL_KEY = "bv-save-real";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    // Storage can be unavailable (private mode); dev mode just won't stick.
  }
}

export const devOn = (): boolean => get(DEV_KEY) === "1";
export function setDevOn(on: boolean): void {
  set(DEV_KEY, on ? "1" : null);
}

/** The simulated progress in play, or null when the real trip is. */
export function simLevel(): SimLevel | null {
  const v = Number(get(SIM_KEY));
  return get(SIM_KEY) !== null && SIM_LEVELS.includes(v as SimLevel) ? (v as SimLevel) : null;
}

/**
 * Swap the save for a simulated one (or back to the real one with null). Mutates `save` in
 * place, since the game holds on to that object.
 */
export function simulate(save: Save, level: SimLevel | null): void {
  if (level === null) {
    const real = get(REAL_KEY);
    if (real !== null) {
      for (const k of Object.keys(save)) delete (save as unknown as Record<string, unknown>)[k];
      Object.assign(save, { ...freshSave(), ...(JSON.parse(real) as Partial<Save>) });
    }
    set(REAL_KEY, null);
    set(SIM_KEY, null);
    return;
  }
  if (get(REAL_KEY) === null) set(REAL_KEY, JSON.stringify(save));
  set(SIM_KEY, String(level));
  for (const k of Object.keys(save)) delete (save as unknown as Record<string, unknown>)[k];
  Object.assign(save, simulatedSave(level));
}

/** Towns in the order a trip reaches them: breadth first along the roads from the start. */
export function roadOrder(): string[] {
  const order = [START_TOWN];
  for (let i = 0; i < order.length; i++) for (const r of townById(order[i]).roads) if (!order.includes(r)) order.push(r);
  for (const t of STOPS) if (!order.includes(t.id)) order.push(t.id);
  return order;
}

const SAMPLE_REVIEWS: [number, string][] = [
  [3, "Best burger I've had on this road. Worth the wait."],
  [3, "Crisp fries, cold drink, perfect patty. We'll be back."],
  [2, "Solid lunch. Fries could've been hotter."],
  [2, "Good burger, a bit of a wait at the window."],
  [1, "My order came out wrong the first time."],
  [3, "The kids still talk about it."],
  [0, "Waited too long and walked off."],
];

/** A made-up trip `level`% of the way down the road, with matching fame, ratings and upgrades. */
export function simulatedSave(level: SimLevel): Save {
  const s = freshSave();
  s.tutorialDone = true;
  if (level === 0) return s;
  const order = roadOrder();
  const worked = order.slice(0, Math.max(1, Math.round((order.length * level) / 100)));
  const k = level / 100;
  for (const id of worked) {
    s.shiftsIn[id] = SHIFTS_TO_UNLOCK;
    s.passedTowns.push(id);
    s.best[id] = Number((1.8 + k * 0.9 - (worked.indexOf(id) % 3) * 0.15).toFixed(1));
  }
  const unlocked = new Set(worked);
  for (const id of worked) for (const r of townById(id).roads) unlocked.add(r);
  s.unlocked = order.filter((id) => unlocked.has(id));
  // Park at the frontier: the last town worked, or the end of the road at 100%.
  s.town = worked[worked.length - 1];
  s.day = 1 + worked.length * (SHIFTS_TO_UNLOCK + 1);
  s.popularity = Math.round(START_POPULARITY + (95 - START_POPULARITY) * k);
  const orders = worked.length * SHIFTS_TO_UNLOCK * 9;
  s.ratingCount = orders;
  s.ratingSum = Math.round(orders * (1.9 + 0.7 * k));
  s.rep = Number((1.9 + 0.7 * k).toFixed(2));
  s.repWeight = 30;
  s.bonuses = BONUSES.slice(0, level === 100 ? BONUSES.length : 4).map((b) => b.id);
  s.reviews = worked
    .flatMap((id, i) => SAMPLE_REVIEWS.slice(0, 2 + (i % 3)).map(([stars, text]): Review => ({ stars: Math.min(3, stars + (level === 100 && stars < 3 ? 1 : 0)), text, stop: townById(id).name })))
    .reverse()
    .slice(0, 40);
  for (const id of worked) s.known[townById(id).menu[0].name] = 5;
  return s;
}
