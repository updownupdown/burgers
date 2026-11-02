import { describe, expect, it } from "vitest";
import { CROOKED, CUT_COVER, cutFactor, judgeCut, quarterQuality, type Pt } from "./knife";
import { sauceGate, SAUCE_GRACE, scorePlate } from "./scoring";
import { newPiece, type Order, type Plate } from "./types";

/*
 * The knife's cut view and the sauce's edge grace (DESIGN §30).
 */

const line = (a: Pt, b: Pt, n = 20, wobble = 0): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { x: a.x + (b.x - a.x) * t + Math.sin(t * Math.PI * 3) * wobble, z: a.z + (b.z - a.z) * t };
  });

describe("judging a cut", () => {
  it("a straight slice through the middle is clean", () => {
    const c = judgeCut(line({ x: -1.3, z: 0 }, { x: 1.3, z: 0 }), false)!;
    expect(c.cover).toBeGreaterThan(0.99);
    expect(c.offset).toBeLessThan(0.01);
    expect(c.q).toBeCloseTo(1, 5);
  });
  it("a diagonal through the middle counts as clean too", () => {
    const c = judgeCut(line({ x: -1.2, z: -1.2 }, { x: 1.2, z: 1.2 }), false)!;
    expect(c.cover).toBeGreaterThan(0.99);
    expect(c.q).toBeGreaterThan(0.95);
  });
  it("off-centre and wobbly cuts score lower", () => {
    const off = judgeCut(line({ x: -1.3, z: 0.6 }, { x: 1.3, z: 0.6 }), true)!;
    const wob = judgeCut(line({ x: -1.3, z: 0 }, { x: 1.3, z: 0 }, 40, 0.0), true)!;
    const wavy = judgeCut(line({ z: -1.3, x: 0 }, { z: 1.3, x: 0 }, 40, 0.3), true)!;
    expect(off.q).toBeLessThan(0.4);
    expect(off.q).toBeLessThan(CROOKED);
    expect(wob.q).toBeCloseTo(1, 5);
    expect(wavy.q).toBeLessThan(0.6);
  });
  it("a slice that stops halfway doesn't go through", () => {
    const c = judgeCut(line({ x: -1.3, z: 0 }, { x: 0, z: 0 }), false)!;
    expect(c.cover).toBeLessThan(CUT_COVER.tap);
    expect(c.cover).toBeLessThan(CUT_COVER.drag + 0.2);
  });
  it("a slice carried on from dragging the knife in (starting a little way in) still goes through", () => {
    const c = judgeCut(line({ x: 0.6, z: 0.05 }, { x: -1.4, z: -0.05 }), false)!;
    expect(c.cover).toBeGreaterThan(CUT_COVER.drag);
  });
  it("missing the food is no cut", () => {
    expect(judgeCut(line({ x: -2, z: 1.5 }, { x: 2, z: 1.5 }), true)).toBeNull();
  });
  it("quarters want two cuts roughly square", () => {
    const a = judgeCut(line({ x: -1.3, z: 0 }, { x: 1.3, z: 0 }), true)!;
    const b = judgeCut(line({ x: 0, z: -1.3 }, { x: 0, z: 1.3 }), true)!;
    const c = judgeCut(line({ x: -1.3, z: 0.15 }, { x: 1.3, z: -0.1 }), true)!;
    expect(quarterQuality(a, b)).toBeCloseTo(1, 5);
    expect(quarterQuality(a, c)).toBeLessThan(0.8);
  });
  it("costs at most 5% for a crooked cut", () => {
    expect(cutFactor(undefined)).toBe(1);
    expect(cutFactor(1)).toBe(1);
    expect(cutFactor(0)).toBeCloseTo(0.95, 5);
  });
  it("a crooked panini cut is noticed at the window", () => {
    const order: Order = { id: 1, name: "Caprese", layers: [{ kind: "ciabatta" }, { kind: "mozzarella" }, { kind: "ciabatta" }], fries: null, drink: null, slice: true } as unknown as Order;
    const plate = (q: number): Plate => {
      const [b, m, t] = [newPiece("ciabatta"), newPiece("mozzarella"), newPiece("ciabatta")];
      for (const p of [b, t]) Object.assign(p, { cut: true, cutQ: q, cook: [0.5, 0.5] });
      return { layers: [b, m, t].map((piece) => ({ piece, offX: 0, offZ: 0 })), fries: null, drink: null };
    };
    const clean = scorePlate(order, plate(1));
    const crooked = scorePlate(order, plate(0.1));
    expect(crooked.notes).toContain("cut a bit crooked");
    expect(clean.notes).not.toContain("cut a bit crooked");
    expect(crooked.quality).toBeLessThan(clean.quality);
  });
});

describe("sauce edge grace", () => {
  it("no sauce lands on the near edge while the bottle is still coming in", () => {
    let armed = false;
    const path = [1.1, 1.0, 0.92, 0.85, 0.75];
    for (const r of path) {
      const g = sauceGate(armed, r);
      expect(g.squeeze).toBe(false);
      armed = g.armed;
    }
  });
  it("once over the middle it squeezes, and going back to the edge is meant", () => {
    let armed = false;
    const out: boolean[] = [];
    for (const r of [0.9, SAUCE_GRACE - 0.05, 0.3, 0.8, 1.0, 1.05]) {
      const g = sauceGate(armed, r);
      out.push(g.squeeze);
      armed = g.armed;
    }
    expect(out).toEqual([false, true, true, true, true, true]);
  });
});
