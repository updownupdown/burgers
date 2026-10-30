import type { Plan, Review } from "./business";
import { STOPS } from "./stops";

export type UpgradeId = "bench" | "tipjar" | "turbo" | "autostop" | "steady";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  text: string;
}

export const UPGRADES: Upgrade[] = [
  { id: "bench", name: "Comfy bench", text: "Customers wait 25% longer before giving up." },
  { id: "tipjar", name: "Shiny tip jar", text: "Tips are 30% bigger." },
  { id: "turbo", name: "Turbo fryer", text: "Fries cook 35% faster." },
  { id: "autostop", name: "Smart fountain", text: "Drinks stop pouring at the line by themselves." },
  { id: "steady", name: "Steady hands", text: "Tossed ingredients land much more neatly." },
];

export interface Save {
  /** Index into STOPS of the next shift to play. */
  stop: number;
  upgrades: UpgradeId[];
  bank: number;
  /** Best average stars per stop id. */
  best: Record<string, number>;
  tutorialDone: boolean;
  /** Trips finished (all stops). */
  trips: number;
  /** Upgrades on offer after a passed shift, until one is picked. */
  offer: UpgradeId[];
  /** Times each recipe was served well; familiar recipes get compact tickets. */
  known: Record<string, number>;
  /** Business mode: buy ingredients, set prices and pick the menu before each shift. */
  biz: boolean;
  /** Last shift's plan, reused as the starting point for the next one. */
  plan: Plan | null;
  /** Most recent reviews, newest first. */
  reviews: Review[];
  /** Average stars across recent reviews, and how many reviews it's built on. */
  rep: number;
  repWeight: number;
}

const KEY = "bv-save-v1";

export function freshSave(): Save {
  return { stop: 0, upgrades: [], bank: 0, best: {}, tutorialDone: false, trips: 0, offer: [], known: {}, biz: false, plan: null, reviews: [], rep: 2, repWeight: 6 };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const s = { ...freshSave(), ...(JSON.parse(raw) as Partial<Save>) };
    s.stop = Math.max(0, Math.min(STOPS.length - 1, s.stop | 0));
    return s;
  } catch {
    return freshSave();
  }
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private browsing or full storage: progress just won't persist.
  }
}

/** A shift counts as passed with an average of at least one star and most customers served. */
export function passed(avgStars: number, served: number, total: number): boolean {
  return served > 0 && avgStars >= 1 && served >= Math.ceil(total * 0.5);
}

export function upgradeChoices(owned: UpgradeId[], rng: () => number, n = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => !owned.includes(u.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
