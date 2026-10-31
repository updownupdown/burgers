import { describe, expect, it } from "vitest";
import { makeOrder, seededRng } from "./menu";
import { STOPS } from "./stops";
import { scorePlate } from "./scoring";
import { BLEND, LOCAL_FLAVOR, MELT, dessertScore } from "./dessert";
import type { Dessert, Order } from "./types";

const cone: Order = { id: 1, name: "Vanilla Cone", price: 3, mods: [], layers: [], fries: false, drink: null, friesSize: "S", drinkSize: "M", dessert: { kind: "cone", flavor: "vanilla" } };
const goodCone: Dessert = { kind: "cone", flavor: "vanilla", swirl: 3, lean: 0.05, blend: 0, melt: 0 };
const shake: Order = { ...cone, name: "Vanilla Shake", price: 5, dessert: { kind: "shake", flavor: "vanilla" } };
const goodShake: Dessert = { kind: "shake", flavor: "vanilla", swirl: 2.5, lean: 0, blend: BLEND.perfect, melt: 0 };

describe("Cold bar orders", () => {
  it("are mostly on their own: a dessert with a main is rare", () => {
    const rng = seededRng(7);
    const orders = Array.from({ length: 4000 }, (_, i) => makeOrder(i, rng, 0.6, STOPS[0]));
    const alone = orders.filter((o) => o.dessert && !o.layers.length);
    const withMain = orders.filter((o) => o.dessert && o.layers.length);
    expect(alone.length).toBeGreaterThan(250);
    expect(alone.length).toBeLessThan(600);
    expect(withMain.length).toBeLessThan(alone.length / 4);
    // Never with fries, never with a poutine.
    expect(orders.some((o) => o.dessert && (o.poutine || (!o.layers.length && o.fries)))).toBe(false);
  });

  it("never come in the first orders of a shift", () => {
    const rng = seededRng(3);
    expect(Array.from({ length: 300 }, (_, i) => makeOrder(i, rng, 0.05, STOPS[0])).some((o) => o.dessert)).toBe(false);
  });

  it("use vanilla or the region's flavour", () => {
    const rng = seededRng(5);
    for (const stop of STOPS) {
      const flavors = new Set(Array.from({ length: 1500 }, (_, i) => makeOrder(i, rng, 0.6, stop)).flatMap((o) => (o.dessert ? [o.dessert.flavor] : [])));
      expect([...flavors].sort()).toEqual(["vanilla", LOCAL_FLAVOR[stop.region]].sort());
    }
  });
});

describe("dessert scoring", () => {
  it("rates a three-ring straight cone perfect", () => {
    const r = scorePlate(cone, { layers: [], fries: null, drink: null, dessert: goodCone });
    expect(r.score).toBe(100);
    expect(r.missing).toBeNull();
  });

  it("marks down a skimpy, leaning or melted cone", () => {
    const q = (d: Partial<Dessert>) => dessertScore(cone.dessert!, { ...goodCone, ...d }, []);
    expect(q({ swirl: 1 })).toBeLessThan(0.5);
    expect(q({ lean: 0.7 })).toBeLessThan(0.8);
    expect(q({ melt: MELT.cone.ruin })).toBeCloseTo(1 - MELT.cone.cost);
    expect(q({ melt: MELT.cone.grace - 1 })).toBe(1);
  });

  it("wants a shake blended into its band", () => {
    const q = (d: Partial<Dessert>) => dessertScore(shake.dessert!, { ...goodShake, ...d }, []);
    expect(q({})).toBe(1);
    expect(q({ blend: 0 })).toBeLessThan(0.6);
    expect(q({ blend: BLEND.max })).toBeLessThan(0.7);
    expect(q({ swirl: 1 })).toBeLessThan(0.7);
  });

  it("sends back a tray missing the dessert, on any difficulty", () => {
    const r = scorePlate({ ...cone, drink: "cola", ice: null }, { layers: [], fries: null, drink: { flavor: "cola", fill: 0.9, size: "M", lid: true, straw: true }, dessert: null });
    expect(r.missing).toBe("forgot the cone");
    expect(r.faulty).toBe(true);
  });

  it("takes the wrong kind or flavour badly", () => {
    expect(scorePlate(cone, { layers: [], fries: null, drink: null, dessert: { ...goodShake } }).stars).toBe(0);
    expect(scorePlate(cone, { layers: [], fries: null, drink: null, dessert: { ...goodCone, flavor: "huckleberry" } }).stars).toBeLessThan(2);
  });
});
