import type { Dessert, DessertKind, DessertOrder, FlavorId } from "./types";
import { FLAVOR_LABEL } from "./types";
import type { RegionId } from "./stops";

/*
 * The Cold bar: a two-handle soft-serve machine and a spindle mixer. Press a handle and circle
 * your finger round the cone or tin under it: one loop lays one ring of soft serve. Three neat
 * rings is a perfect cone; drifting off centre makes it lean. A shake is two or three rings in a
 * steel tin, spun on the mixer until the bar sits in its band.
 */

/** The machine's second handle pours the region's flavour; the first is always vanilla. */
export const LOCAL_FLAVOR: Record<RegionId, FlavorId> = { mountains: "huckleberry", coast: "mango", desert: "pear" };
export const flavorsFor = (region: RegionId): [FlavorId, FlavorId] => ["vanilla", LOCAL_FLAVOR[region]];

export const DESSERT_PRICE: Record<DessertKind, number> = { cone: 3, shake: 5 };
export const dessertName = (d: DessertOrder) => `${FLAVOR_LABEL[d.flavor]} ${d.kind === "cone" ? "Cone" : "Shake"}`;

/** Rings of soft serve: three is perfect, the good band runs a little either side, six is the most a cone holds. */
export const SWIRL = { perfect: 3, lo: 2.6, hi: 3.5, max: 6 } as const;
/** A shake wants two to three and a half rings in the tin before it's blended. */
export const SHAKE_SWIRL = { lo: 1.8, hi: 3.6 } as const;
/** Blending on the mixer, 0..BLEND.max: lumpy below `lo`, perfect at `perfect`, thin and runny past `hi`. */
export const BLEND = { lo: 0.55, perfect: 0.75, hi: 0.95, max: 1.3, rate: 0.32 } as const;
/** Seconds on a tray before soft serve starts to melt, when it's a puddle, and the most it can cost. */
export const MELT: Record<DessertKind, { grace: number; ruin: number; cost: number }> = {
  cone: { grace: 25, ruin: 75, cost: 0.5 },
  shake: { grace: 50, ruin: 130, cost: 0.3 },
};
/** Seconds of patience a customer adds for a dessert on their order. */
export const DESSERT_PATIENCE: Record<DessertKind, number> = { cone: 16, shake: 26 };

/** Melting so far, 0 (fresh) to 1 (as bad as it gets). */
export function meltLevel(d: Pick<Dessert, "kind" | "melt">): number {
  const m = MELT[d.kind];
  return Math.min(1, Math.max(0, (d.melt - m.grace) / (m.ruin - m.grace)));
}

/**
 * Share of orders, once the shift is going, that are just a dessert (now and then with a drink).
 * Customers rarely want a dessert and a main, so the Cold bar is usually a separate stop for them.
 */
export const DESSERT_ONLY_CHANCE = 0.12;
/** Share of burger orders that add a dessert too, later in a shift. */
export const DESSERT_WITH_MAIN_CHANCE = 0.03;

export function pickDessert(rng: () => number, region: RegionId): DessertOrder {
  const kind: DessertKind = rng() < 0.6 ? "cone" : "shake";
  const flavor = rng() < 0.5 ? "vanilla" : LOCAL_FLAVOR[region];
  return { kind, flavor };
}

/** A dessert against the order, 0..1, with what the customer would say about it. */
export function dessertScore(want: DessertOrder, d: Dessert, notes: string[]): number {
  if (d.kind !== want.kind) {
    notes.push(want.kind === "cone" ? "wanted a cone" : "wanted a shake");
    return 0.3;
  }
  let q = 1;
  const cut = (f: number, note?: string) => {
    q *= f;
    if (note) notes.push(note);
  };
  if (d.flavor !== want.flavor) cut(0.5, `wanted ${FLAVOR_LABEL[want.flavor].toLowerCase()}`);
  const s = d.swirl;
  if (d.kind === "cone") {
    if (s < 1.5) cut(0.45, "skimpy cone");
    else if (s < SWIRL.lo) cut(0.8, "cone could be fuller");
    else if (s > 4.6) cut(0.7, "ice cream everywhere");
    else if (s > SWIRL.hi) cut(0.92);
    if (d.lean > 0.5) cut(0.75, "leaning cone");
    else if (d.lean > 0.3) cut(0.92);
  } else {
    if (s < SHAKE_SWIRL.lo) cut(0.6, "thin shake");
    else if (s > SHAKE_SWIRL.hi + 1) cut(0.85);
    const b = d.blend;
    if (b < 0.3) cut(0.5, "shake not blended");
    else if (b < BLEND.lo) cut(0.8, "lumpy shake");
    else if (b > BLEND.max - 0.05) cut(0.6, "shake's gone runny");
    else if (b > BLEND.hi) cut(0.85, "shake a bit runny");
  }
  const m = meltLevel(d);
  if (m > 0) cut(1 - MELT[d.kind].cost * m, m > 0.25 ? (d.kind === "cone" ? "cone's melting" : "shake's gone warm") : undefined);
  return q;
}
