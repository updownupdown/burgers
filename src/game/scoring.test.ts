import { describe, expect, it } from "vitest";
import { makeOrder, seededRng } from "./menu";
import { alignLayers, payout, scorePlate } from "./scoring";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { DONENESS_TARGET, newPiece } from "./types";

function piece(kind: Kind, cook: [number, number] = [0, 0]): Piece {
  const p = newPiece(kind);
  p.cook = cook;
  if (kind === "ketchup" || kind === "mustard") {
    p.stroke = [
      { x: -0.5, z: 0 },
      { x: 0.5, z: 0.1 },
      { x: -0.5, z: 0.2 },
    ];
  }
  return p;
}
const layer = (p: Piece): Layer => ({ piece: p, offX: 0, offZ: 0 });

const classic: Order = {
  id: 1,
  name: "Test",
  price: 10,
  layers: [
    { kind: "bun", toasted: true },
    { kind: "patty", doneness: "medium" },
    { kind: "ketchup" },
    { kind: "bun", toasted: true },
  ],
  fries: false,
  drink: null,
};

function perfectPlate(): Plate {
  const m = DONENESS_TARGET.medium;
  return {
    layers: [piece("bun", [0.5, 0]), piece("patty", [m, m]), piece("ketchup"), piece("bun", [0.5, 0])].map(layer),
    fries: null,
    drink: null,
  };
}

describe("alignLayers", () => {
  it("matches identical stacks one to one", () => {
    const pairs = alignLayers(classic.layers, perfectPlate().layers);
    expect(pairs).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("skips extra layers", () => {
    const p = perfectPlate();
    p.layers.splice(2, 0, layer(piece("onion")));
    expect(alignLayers(classic.layers, p.layers)).toHaveLength(4);
  });
});

describe("scorePlate", () => {
  it("gives three stars to a perfect burger", () => {
    const r = scorePlate(classic, perfectPlate());
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.notes).toEqual([]);
  });

  it("scores an empty plate as zero-ish", () => {
    const r = scorePlate(classic, { layers: [], fries: null, drink: null });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });

  it("penalises a burnt patty and says so", () => {
    const p = perfectPlate();
    p.layers[1].piece.cook = [1.2, 0.6];
    const r = scorePlate(classic, p);
    expect(r.score).toBeLessThan(90);
    expect(r.notes).toContain("burnt patty");
  });

  it("notices a missing top bun", () => {
    const p = perfectPlate();
    p.layers.pop();
    const r = scorePlate(classic, p);
    expect(r.notes.some((n) => n.includes("missing bun"))).toBe(true);
    expect(r.stars).toBeLessThan(3);
  });

  it("penalises a messy stack", () => {
    const p = perfectPlate();
    for (const l of p.layers) l.offX = 0.35;
    expect(scorePlate(classic, p).notes).toContain("messy stack");
  });

  it("checks sides", () => {
    const order: Order = { ...classic, fries: true, drink: "cola" };
    const plate = perfectPlate();
    expect(scorePlate(order, plate).notes).toEqual(["forgot the fries", "forgot the drink"]);
    plate.fries = { cook: 0.7 };
    plate.drink = { flavor: "cola", fill: 0.9 };
    expect(scorePlate(order, plate).score).toBe(100);
    plate.drink = { flavor: "pine", fill: 0.9 };
    expect(scorePlate(order, plate).notes).toContain("wrong drink");
  });
});

describe("payout", () => {
  it("tips only good, fast orders", () => {
    expect(payout(classic, 100, 1)).toEqual({ pay: 10, tip: 4 });
    expect(payout(classic, 50, 1).tip).toBe(0);
  });
});

describe("makeOrder", () => {
  it("builds burgers that start and end with a bun", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 50; i++) {
      const o = makeOrder(i, rng, i / 50);
      expect(o.layers[0].kind).toBe("bun");
      expect(o.layers[o.layers.length - 1].kind).toBe("bun");
      expect(o.price).toBeGreaterThan(0);
    }
  });
});
