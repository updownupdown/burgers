import { middleOf, fryerOf, type Recipe, type Stop } from "./stops";
import { isSauce, type Kind } from "./types";
import { TOWN_ASKS } from "./identity";

/**
 * The daily local ask (after build #78): one small optional goal per shift, picked from the town's
 * crowd, kitchen and menu, shown on Prep and pinned as a chip in the shift. Meeting it pays a little
 * extra and the shift counts as two toward opening the town's roads, like a great shift. It reuses
 * what scoring already knows (chef's touches, stars, the customer's mood at hand-over), so it asks
 * for nothing the kitchen can't already do; it just makes two shifts in one town feel different.
 */
export type AskId = "calm" | "five" | "marks" | "sauce" | "salt" | "cut" | "handmade" | "leopard" | "garnish";

export interface Ask {
  id: AskId;
  /** Short, plain, for the Prep row and the shift's chip ("Grill marks on 3 burgers"). */
  text: string;
  need: number;
  /** Dollars added to the takings when it's met. */
  reward: number;
}

/** What a served order did, as the ask sees it. */
export interface Served {
  stars: number;
  touches: readonly string[];
  /** Patience left at hand-over, 0..1. */
  patience: number;
}

/** Each ask's wording with the count filled in, and which served orders count. */
const ASKS: Record<AskId, { text: (n: number, s: Stop) => string; counts: (o: Served) => boolean; base: number }> = {
  calm: { text: (n) => `${n} orders handed over before anyone looks fed up`, counts: (o) => o.stars >= 4 && o.patience >= 0.5, base: 3 },
  five: { text: (n) => `${n} orders at five stars`, counts: (o) => o.stars >= 5, base: 4 },
  marks: { text: (n) => `Grill marks on ${n} burgers`, counts: (o) => o.touches.includes("Grill marks"), base: 3 },
  sauce: { text: (n) => `Perfect sauce on ${n} orders`, counts: (o) => o.touches.includes("Perfect sauce"), base: 3 },
  salt: { text: (n, s) => `${n} sides ${fryerOf(s).includes("churros") ? "shaken" : "salted"} to the Perfect line`, counts: (o) => o.touches.includes("Perfect salt"), base: 3 },
  cut: { text: (n) => `Clean cuts on ${n} orders`, counts: (o) => o.touches.includes("Clean cut"), base: 3 },
  handmade: { text: (n) => `Hand-pressed tortillas on ${n} orders`, counts: (o) => o.touches.includes("Hand-pressed"), base: 4 },
  leopard: { text: (n) => `Leopard spots on ${n} flatbreads`, counts: (o) => o.touches.includes("Leopard spots"), base: 3 },
  garnish: { text: (n) => `Garnish ${n} local drinks`, counts: (o) => o.touches.includes("Garnish"), base: 3 },
};

/** Drawn sauces on the menu (the ladled red sauce, oil and honey don't count). */
const drawnSauce = (menu: readonly Recipe[]) => menu.some((r) => r.layers.some((k: Kind) => isSauce(k) && k !== "redsauce" && k !== "oil" && k !== "honey"));

/** The asks this town can make today, by its crowd, kitchen and menu. */
export function asksFor(stop: Stop, menu: readonly Recipe[]): AskId[] {
  const mid = middleOf(stop);
  const out: AskId[] = ["five"];
  if (stop.crowd === "commuters" || stop.crowd === "party") out.push("calm");
  if (mid === "grill") out.push("marks");
  if (drawnSauce(menu)) out.push("sauce");
  if (fryerOf(stop)[0] !== "chips") out.push("salt");
  if (stop.press?.slice || stop.oven?.board) out.push("cut");
  if (stop.comal?.tpress) out.push("handmade");
  if (mid === "oven") out.push("leopard");
  if (stop.region !== "mountains") out.push("garnish");
  return out;
}

/**
 * The asks this town draws from (DESIGN §50): its own shortlist (identity.ts), kept to what it can
 * do today. A town whose shortlist it can't do at all falls back to everything it can.
 */
export function townAsks(stop: Stop, menu: readonly Recipe[]): AskId[] {
  const can = asksFor(stop, menu);
  const own = (TOWN_ASKS[stop.id] ?? []).filter((id) => can.includes(id));
  return own.length ? own : can;
}

/** A small stable hash, so the same town and day always ask the same thing. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Today's ask in this town: the same on Prep and in the shift. The count scales with the crowd
 * expected (about 40% of it, at least two, at most the ask's usual), and pays $10 to $20.
 * Each town draws from its own shortlist (townAsks): hand-pressed tortillas at Sun Valley, clean
 * cuts at Harbor City and Port Amber, speed in the commuter towns.
 */
export function askFor(stop: Stop, menu: readonly Recipe[], day: number, expected: number): Ask {
  const pool = townAsks(stop, menu);
  const id = pool[hash(`${stop.id}:${day}`) % pool.length];
  const a = ASKS[id];
  const need = Math.max(2, Math.min(a.base, Math.round(expected * 0.4)));
  return { id, text: a.text(need, stop), need, reward: Math.min(20, 8 + need * 3) };
}

/** Does this served order count toward the ask? */
export function askCounts(ask: Ask, o: Served): boolean {
  return ASKS[ask.id].counts(o);
}

/** A scored order (its stars and touches) as the ask sees it. */
export function served(r: { stars: number; touches: readonly string[] }, patience: number): Served {
  return { stars: r.stars, touches: r.touches, patience };
}
