import { COOK_TIME, shiftStretch } from "./pace";
import { describe, expect, it } from "vitest";
import { askCounts, askFor, asksFor } from "./asks";
import { BONUSES } from "./bonus";
import { DISH_WORK, WINDOW_BASE, windowPatience } from "./line";
import { LOOKS } from "./looks";
import { orderFromRecipe } from "./menu";
import { pieceFor } from "./press";
import { FRIES_HOLD, friesHeldPenalty, payout, scorePlate, sideWeight, tipShare, touchTip } from "./scoring";
import { garnishFor, townById } from "./stops";
import { countRegular, REGULAR_GOAL, regularName, regularOrder } from "./regulars";
import { RUSH, rushAt } from "./line";
import { DONENESS_TARGET, newPiece, type Kind, type Layer, type Order, type Piece, type Plate } from "./types";
import { seededRng } from "./menu";
import { DIFFICULTY } from "./difficulty";
import { CROWD } from "./business";

// Scoring and balance after the build #78 review (DESIGN §33).

const piece = (kind: Kind, cook: [number, number] = [0, 0], extra: Partial<Piece> = {}): Piece => Object.assign(newPiece(kind), { cook }, extra);
const layer = (p: Piece): Layer => ({ piece: p, offX: 0, offZ: 0 });
const zig = [
  { x: -0.6, z: -0.45 },
  { x: 0.6, z: -0.3 },
  { x: -0.6, z: -0.05 },
  { x: 0.6, z: 0.15 },
  { x: -0.6, z: 0.4 },
];
const m = DONENESS_TARGET.medium;
const meal = (fries: boolean, drink: boolean): Order => ({
  id: 1,
  name: "Test",
  price: 9 + (fries ? 3 : 0) + (drink ? 2 : 0),
  mods: [],
  layers: [{ kind: "bun" }, { kind: "patty" }, { kind: "ketchup" }, { kind: "bun" }],
  fries,
  drink: drink ? "cola" : null,
  friesSize: "M",
  drinkSize: "M",
});
const burger = (marks = false): Layer[] => [piece("bun"), piece("patty", [m, m], marks ? { marks: [1, 0] } : {}), piece("ketchup", [0, 0], { stroke: zig }), piece("bun")].map(layer);

describe("sides weigh by their share of the price", () => {
  it("is 15% at least and 35% at most", () => {
    expect(sideWeight(meal(false, false))).toBe(0.15);
    expect(sideWeight(meal(true, true))).toBeCloseTo(0.35);
    expect(sideWeight(meal(false, true))).toBeCloseTo(2 / 11);
  });
  it("makes a wrong-size drink cost more than a few points on a full meal", () => {
    const o = meal(true, true);
    const good: Plate = { layers: burger(), fries: { cook: 0.72, size: "M", fill: 1, salt: 0.6 }, drink: { flavor: "cola", fill: 0.92, size: "M", ice: true, lid: true } };
    const wrong: Plate = { ...good, drink: { ...good.drink!, size: "S" } };
    expect(scorePlate(o, good).stars).toBe(5);
    // It cost about 4 points at the old flat 15%.
    expect(scorePlate(o, good).score - scorePlate(o, wrong).score).toBeGreaterThanOrEqual(8);
  });
});

describe("tips step down with the customer's mood", () => {
  it("is the whole tip while calm, half while sad, none while angry", () => {
    expect(tipShare(0.9)).toBe(1);
    expect(tipShare(0.5)).toBe(1);
    expect(tipShare(0.49)).toBe(0.5);
    expect(tipShare(0.2)).toBe(0.5);
    expect(tipShare(0.19)).toBe(0);
    const o = meal(false, false);
    expect(payout(o, 100, 0.6).tip).toBe(4);
    expect(payout(o, 100, 0.3).tip).toBe(2);
    expect(payout(o, 100, 0.1).tip).toBe(0);
  });
});

describe("chef's touches", () => {
  it("pays for drawn perfect sauce and grill marks, on 4★ and up", () => {
    const r = scorePlate(meal(false, false), { layers: burger(true), fries: null, drink: null });
    expect(r.touches).toEqual(["Perfect sauce", "Grill marks"]);
    expect(touchTip(r.touches, r.stars)).toBe(2);
    expect(touchTip(r.touches, 3)).toBe(0);
  });
  it("doesn't pay for the quick squeeze", () => {
    const layers = burger();
    layers[2] = layer(piece("ketchup", [0, 0], { stroke: [{ x: 0, z: 0 }, { x: 0.15, z: 0 }] }));
    expect(scorePlate(meal(false, false), { layers, fries: null, drink: null }).touches).toEqual([]);
  });
  it("pays for salt near the Perfect line", () => {
    const o = meal(true, false);
    const at = (salt: number) => scorePlate(o, { layers: burger(), fries: { cook: 0.72, size: "M", fill: 1, salt }, drink: null }).touches.includes("Perfect salt");
    expect(at(0.6)).toBe(true);
    expect(at(0.7)).toBe(true);
    expect(at(0.4)).toBe(false);
  });
});

describe("fries go soggy out of the oil", () => {
  it("is free for 25 s, then up to 15% off by 60 s", () => {
    expect(friesHeldPenalty(0)).toBe(0);
    expect(friesHeldPenalty(FRIES_HOLD.grace)).toBe(0);
    expect(friesHeldPenalty(60)).toBeCloseTo(0.15);
    expect(friesHeldPenalty(200)).toBeCloseTo(0.15);
    const o = meal(true, false);
    const fresh = scorePlate(o, { layers: burger(), fries: { cook: 0.72, size: "M", fill: 1, salt: 0.6, held: 5 }, drink: null });
    const cold = scorePlate(o, { layers: burger(), fries: { cook: 0.72, size: "M", fill: 1, salt: 0.6, held: 70 }, drink: null });
    expect(cold.score).toBeLessThan(fresh.score);
    expect(cold.notes).toContain("fries went cold");
  });
});

describe("window patience follows the work", () => {
  const recipe = (town: string, name: string) => townById(town).menu.find((r) => r.name === name)!;
  it("gives a quesadilla room to be folded, melted and flipped", () => {
    const q = orderFromRecipe(1, recipe("redmesa", "Quesadilla"), false, null);
    const c = orderFromRecipe(2, recipe("pinecrest", "Trailhead Classic"), false, null);
    expect(windowPatience(q)).toBeGreaterThanOrEqual(WINDOW_BASE + DISH_WORK.quesadilla);
    // Balanced: a quesadilla no longer gets half what a classic does.
    const bal = DIFFICULTY.balanced.patience;
    expect(windowPatience(q) * bal * CROWD.families.patience).toBeGreaterThan(110);
    expect(windowPatience(q) / windowPatience(c)).toBeGreaterThan(0.8);
  });
  it("leaves a plain classic short of the whole shift", () => {
    const c = orderFromRecipe(2, recipe("pinecrest", "Trailhead Classic"), false, null);
    expect(windowPatience(c, 1) * DIFFICULTY.balanced.patience).toBeLessThan(150);
    // The slower kitchen (pace.ts) stretches the shift by more than it stretches this order.
    expect(windowPatience(c, COOK_TIME) * DIFFICULTY.balanced.patience).toBeLessThan(150 * shiftStretch(COOK_TIME));
  });
});

describe("the daily local ask", () => {
  it("is the same for a town and day, and fits the town", () => {
    const pc = townById("pinecrest");
    const a = askFor(pc, pc.menu, 4, 6);
    expect(askFor(pc, pc.menu, 4, 6)).toEqual(a);
    expect(asksFor(pc, pc.menu)).toContain(a.id);
    expect(a.reward).toBeGreaterThanOrEqual(10);
    expect(a.reward).toBeLessThanOrEqual(20);
    expect(asksFor(townById("sunvalley"), townById("sunvalley").menu)).toContain("handmade");
    expect(asksFor(townById("portamber"), townById("portamber").menu)).toContain("cut");
    expect(asksFor(pc, pc.menu)).not.toContain("garnish");
  });
  it("varies from day to day", () => {
    const t = townById("harbor");
    const ids = new Set(Array.from({ length: 12 }, (_, d) => askFor(t, t.menu, d, 10).id));
    expect(ids.size).toBeGreaterThan(1);
  });
  it("counts the orders it asks for", () => {
    const pc = townById("pinecrest");
    const day = Array.from({ length: 40 }, (_, d) => d).find((d) => askFor(pc, pc.menu, d, 8).id === "marks")!;
    const a = askFor(pc, pc.menu, day, 8);
    expect(askCounts(a, { stars: 5, touches: ["Grill marks"], patience: 0.3 })).toBe(true);
    expect(askCounts(a, { stars: 5, touches: [], patience: 0.9 })).toBe(false);
  });
});

describe("the press speaks of the region's food", () => {
  it("never calls a taco a burger", () => {
    for (let s = 0; s < 30; s++) {
      const p = pieceFor(5, [], townById("redmesa"), null, seededRng(s));
      expect(`${p.headline} ${p.quote}`).not.toMatch(/burger/i);
      const q = pieceFor(2, [], townById("portamber"), null, seededRng(s));
      expect(q.headline).not.toMatch(/burger/i);
    }
  });
});

describe("bonuses and looks", () => {
  it("reworks the heat lamp, smart fountain and kitchen timer", () => {
    expect(BONUSES.find((b) => b.id === "lamp")!.text).toMatch(/warm/i);
    expect(BONUSES.find((b) => b.id === "autostop")!.text).toMatch(/lid/i);
    expect(BONUSES.find((b) => b.id === "timer")!.text).toMatch(/ring/i);
  });
  it("prices the grand looks within a trip's reach", () => {
    for (const l of LOOKS.filter((x) => x.grand)) expect(l.price).toBeLessThanOrEqual(20000);
    expect(LOOKS.find((l) => l.id === "airship")!.price).toBe(15000);
  });
});

describe("the regional touches (P3-8, P3-9, P3-10)", () => {
  it("garnishes the local drinks outside the Pines only", () => {
    expect(garnishFor("mountains", "pine")).toBeUndefined();
    expect(garnishFor("coast", "cucumber")).toBe("cucumber");
    expect(garnishFor("desert", "hibiscus")).toBe("lime");
    expect(garnishFor("orchard", "cider")).toBe("apple");
    // House drinks go without.
    expect(garnishFor("coast", "cola")).toBeUndefined();
  });

  it("costs a little when the garnish is missing, and counts as a touch when it's there", () => {
    const st = townById("saltwater");
    const o = { ...regularOrder(1, st), layers: [], fries: false };
    expect(o.garnish).toBe("cucumber");
    expect(o.regular).toBe(regularName("saltwater"));
    const drink = { flavor: o.drink!, fill: 0.86, size: o.drinkSize, ice: true, lid: true };
    const plain: Plate = { layers: [], fries: null, drink };
    const dressed: Plate = { layers: [], fries: null, drink: { ...drink, garnish: "cucumber" } };
    expect(scorePlate(o, dressed).touches).toContain("Garnish");
    expect(scorePlate(o, plain).notes.join(" ")).toContain("no cucumber");
  });

  it("gives every town a regular with the same order every visit, with a change of their own", () => {
    for (const id of ["pinecrest", "summit", "harbor", "sunvalley", "portamber"]) {
      const a = regularOrder(1, townById(id));
      const b = regularOrder(2, townById(id));
      expect(a.name).toBe(b.name);
      expect(a.mods).toEqual(b.mods);
      expect(a.regular).toBe(regularName(id));
      expect(a.fries).toBe(true);
    }
  });

  it("makes them a regular on the third good visit, once", () => {
    let t = 0;
    const wins: boolean[] = [];
    for (const stars of [5, 3, 4, 5, 5]) {
      const r = countRegular(t, stars);
      t = r.tally;
      wins.push(r.won);
    }
    expect(t).toBe(REGULAR_GOAL);
    expect(wins).toEqual([false, false, false, true, false]);
  });

  it("rushes once mid-shift at capitals and on event days only", () => {
    expect(rushAt(false, false, 3, 300)).toBeNull();
    for (let day = 1; day < 30; day++) {
      const t = rushAt(true, false, day, 300)!;
      expect(t).toBeGreaterThanOrEqual(300 * RUSH.from);
      expect(t).toBeLessThanOrEqual(300 * (RUSH.from + RUSH.span));
    }
    expect(rushAt(false, true, 4, 300)).toBe(rushAt(true, false, 4, 300));
  });
});
