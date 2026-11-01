import { describe, expect, it } from "vitest";
import { makeOrder, orderFromRecipe, seededRng } from "./menu";
import { STOPS, townById } from "./stops";
import { scorePlate } from "./scoring";
import { COOK_SCALE, friesQuality, SWEET_PERFECT, FRIES_PERFECT } from "./cooking";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { BREADS, isSauce, newPiece, pressable } from "./types";

/*
 * The Sunny Coast's panini press (DESIGN §24, phase 2): order generation and scoring.
 */

const ZIGZAG = [
  { x: -0.6, z: -0.45 },
  { x: 0.6, z: -0.3 },
  { x: -0.6, z: -0.05 },
  { x: 0.6, z: 0.15 },
  { x: -0.6, z: 0.4 },
];
const coast = (id: string) => townById(id);
const recipe = (town: string, name: string) => coast(town).menu.find((r) => r.name === name)!;

/** One piece cooked the way the press leaves it when it's done right. */
function good(kind: Kind): Piece {
  const p = newPiece(kind);
  if (BREADS.has(kind) || kind === "chicken" || kind === "veggie") {
    const t = COOK_SCALE[kind as "ciabatta"].perfect;
    p.cook = [t, t];
  }
  if (kind === "mozzarella" || kind === "cheddar") p.melt = 0.8;
  if (isSauce(kind)) p.stroke = ZIGZAG.map((s) => ({ ...s }));
  return p;
}

/** A plate built exactly to the order, everything pressed right. */
function perfect(order: Order): Plate {
  const layers: Layer[] = [];
  for (const e of order.layers) for (let n = 0; n < (e.count ?? 1); n++) layers.push({ piece: good(e.kind), offX: 0, offZ: 0 });
  if (order.slice) for (const l of layers) if (BREADS.has(l.piece.kind)) l.piece.cut = true;
  return { layers, fries: null, drink: null };
}

describe("panini orders", () => {
  it("only come from the coast's menus, and every coast town has a press", () => {
    for (const s of STOPS) {
      const paninis = s.menu.filter((r) => r.panini);
      if (s.region === "coast") {
        expect(s.press).toBeTruthy();
        expect(paninis.length).toBe(s.menu.length);
        expect(s.poutine).toBe(false);
      } else {
        expect(paninis).toEqual([]);
        expect(s.press).toBeFalsy();
      }
    }
  });

  it("scale up the coast: Saltwater two, Gull Point adds the Tuna Melt, Driftwood the Chicken Pesto, Harbor City the Veggie Club", () => {
    expect(coast("saltwater").menu.map((r) => r.name)).toEqual(["Caprese", "Avocado Toast"]);
    expect(coast("gullpoint").menu.map((r) => r.name)).toContain("Tuna Melt");
    expect(coast("driftwood").menu.map((r) => r.name)).toContain("Chicken Pesto");
    expect(coast("harbor").menu.map((r) => r.name)).toContain("Veggie Club");
    expect(coast("saltwater").press).toEqual({ bays: 2, slice: false });
    expect(coast("harbor").press).toEqual({ bays: 3, slice: true });
    expect(coast("saltwater").fryer).toBeUndefined();
    expect(coast("driftwood").fryer).toEqual(["fries", "sweet"]);
  });

  it("press the bread, melt the cheese, and keep an open toast's avocado cold", () => {
    const cap = orderFromRecipe(1, recipe("saltwater", "Caprese"), false, null);
    expect(cap.layers[0]).toEqual({ kind: "ciabatta", toasted: true });
    expect(cap.layers.find((l) => l.kind === "mozzarella")).toEqual({ kind: "mozzarella", melted: true, count: 3 });
    const toast = orderFromRecipe(2, recipe("saltwater", "Avocado Toast"), false, null);
    expect(toast.layers.map((l) => l.kind)).toEqual(["sourdough", "avocado", "rocket"]);
    expect(toast.layers[1]).toEqual({ kind: "avocado", cold: true, count: 4 });
    const tuna = orderFromRecipe(3, recipe("gullpoint", "Tuna Melt"), false, null);
    expect(tuna.layers.find((l) => l.kind === "cheddar")?.melted).toBe(true);
    expect(tuna.layers.find((l) => l.kind === "tuna")?.count).toBe(2);
  });

  it("put an added avocado on the veggie patty, and on top of an open toast", () => {
    const club = orderFromRecipe(1, recipe("harbor", "Veggie Club"), false, null, [{ type: "add", kind: "avocado" }]);
    const kinds = club.layers.map((l) => l.kind);
    expect(kinds[kinds.indexOf("veggie") + 1]).toBe("avocado");
    expect(kinds[kinds.length - 1]).toBe("ciabatta");
    const cap = orderFromRecipe(2, recipe("saltwater", "Caprese"), false, null, [{ type: "add", kind: "rocket" }]);
    expect(cap.layers.map((l) => l.kind).slice(-2)).toEqual(["rocket", "ciabatta"]);
    const toast = orderFromRecipe(3, recipe("saltwater", "Avocado Toast"), false, null, [{ type: "add", kind: "redonion" }]);
    expect(toast.layers[toast.layers.length - 1].kind).toBe("redonion");
  });

  it("go out cut in half at Harbor City only, never the open-faced toast", () => {
    const rng = seededRng(5);
    let cut = 0;
    for (let i = 0; i < 200; i++) {
      const o = makeOrder(i, rng, 0.6, coast("harbor"));
      if (!o.layers.length) continue;
      expect(!!o.slice).toBe(o.name !== "Avocado Toast");
      if (o.slice) cut++;
      const g = makeOrder(i, rng, 0.6, coast("gullpoint"));
      expect(g.slice).toBeFalsy();
    }
    expect(cut).toBeGreaterThan(50);
  });

  it("ask for sweet potato fries only where the fryer has them, and never poutine at the coast", () => {
    const rng = seededRng(9);
    const count = (id: string) => {
      let sweet = 0;
      for (let i = 0; i < 300; i++) {
        const o = makeOrder(i, rng, 0.8, coast(id));
        expect(o.poutine).toBeFalsy();
        if (o.fry === "sweet") {
          expect(o.fries).toBe(true);
          sweet++;
        }
      }
      return sweet;
    };
    expect(count("saltwater")).toBe(0);
    expect(count("driftwood")).toBeGreaterThan(20);
  });

  it("often add avocado to a Veggie Club", () => {
    const rng = seededRng(3);
    let adds = 0;
    let clubs = 0;
    for (let i = 0; i < 400; i++) {
      const o = makeOrder(i, rng, 0.7, coast("harbor"));
      if (o.name !== "Veggie Club") continue;
      clubs++;
      if (o.mods.some((m) => m.type === "add" && m.kind === "avocado")) adds++;
    }
    expect(clubs).toBeGreaterThan(20);
    expect(adds / clubs).toBeGreaterThan(0.3);
  });
});

describe("panini scoring", () => {
  const caprese = orderFromRecipe(1, recipe("saltwater", "Caprese"), false, null);
  const chicken = orderFromRecipe(2, recipe("driftwood", "Chicken Pesto"), false, null);
  const toast = orderFromRecipe(3, recipe("saltwater", "Avocado Toast"), false, null);

  it("gives three stars to a well-pressed panini", () => {
    for (const o of [caprese, chicken, toast]) {
      const r = scorePlate(o, perfect(o));
      expect(r.notes).toEqual([]);
      expect(r.score).toBe(100);
      expect(r.stars).toBe(3);
    }
  });

  it("marks down bread that never went in the press, and burnt bread", () => {
    const p = perfect(caprese);
    p.layers[0].piece.cook = [0, 0];
    p.layers[p.layers.length - 1].piece.cook = [0, 0];
    const r = scorePlate(caprese, p);
    expect(r.notes).toContain("bread not pressed");
    expect(r.stars).toBeLessThan(3);
    const b = perfect(caprese);
    b.layers[0].piece.cook = [1.2, 1.2];
    expect(scorePlate(caprese, b).notes).toContain("burnt bread");
  });

  it("calls out chicken that was only warmed in the sandwich, not pressed on its own first", () => {
    const p = perfect(chicken);
    p.layers.find((l) => l.piece.kind === "chicken")!.piece.cook = [0.15, 0.15];
    const r = scorePlate(chicken, p);
    expect(r.notes).toContain("pink chicken");
    expect(r.stars).toBeLessThanOrEqual(1);
  });

  it("wants the cheese melted", () => {
    const p = perfect(caprese);
    for (const l of p.layers) if (l.piece.kind === "mozzarella") l.piece.melt = 0;
    expect(scorePlate(caprese, p).notes).toContain("cheese not melted");
  });

  it("calls out a warmed avocado on an open toast", () => {
    const p = perfect(toast);
    for (const l of p.layers) if (l.piece.kind === "avocado") l.piece.cook = [0.6, 0];
    const r = scorePlate(toast, p);
    expect(r.notes).toContain("warm avocado");
    expect(r.score).toBeLessThan(90);
  });

  it("wants it cut in half at Harbor City", () => {
    const o = { ...caprese, slice: true };
    const p = perfect(o);
    expect(scorePlate(o, p).score).toBe(100);
    for (const l of p.layers) l.piece.cut = false;
    const r = scorePlate(o, p);
    expect(r.notes).toContain("wanted it cut in half");
    expect(r.score).toBeLessThan(100);
  });

  it("scores sweet potato fries on their own, narrower band, and notices a mix-up", () => {
    expect(friesQuality(SWEET_PERFECT, true)).toBe(1);
    expect(friesQuality(FRIES_PERFECT + 0.12, true)).toBeLessThan(friesQuality(FRIES_PERFECT + 0.12, false));
    const o: Order = { ...caprese, fries: true, fry: "sweet", friesSize: "S" };
    const p = perfect(o);
    p.fries = { cook: SWEET_PERFECT, size: "S", fill: 1, salt: 0.6, fry: "sweet" };
    expect(scorePlate(o, p).score).toBe(100);
    p.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt: 0.6 };
    expect(scorePlate(o, p).notes).toContain("wanted sweet potato fries");
  });
});

describe("what the press closes on (after build #68)", () => {
  it("closes empty, on a bread or a protein on its own, and on a sandwich with bread top and bottom", () => {
    expect(pressable([])).toBe(true);
    expect(pressable(["ciabatta"])).toBe(true);
    expect(pressable(["sourdough"])).toBe(true);
    expect(pressable(["chicken"])).toBe(true);
    expect(pressable(["veggie"])).toBe(true);
    expect(pressable(["ciabatta", "pesto", "mozzarella", "tomato", "basil", "ciabatta"])).toBe(true);
    expect(pressable(["sourdough", "tuna", "cheddar", "sourdough"])).toBe(true);
    expect(pressable(["ciabatta", "ciabatta"])).toBe(true);
  });
  it("won't close on a sandwich missing its top bread, a lone filling, or a protein under other things", () => {
    expect(pressable(["ciabatta", "mozzarella", "tomato"])).toBe(false);
    expect(pressable(["sourdough", "avocado"])).toBe(false);
    expect(pressable(["tomato"])).toBe(false);
    expect(pressable(["mozzarella"])).toBe(false);
    expect(pressable(["chicken", "mozzarella"])).toBe(false);
    expect(pressable(["tomato", "ciabatta"])).toBe(false);
  });
  it("every coast recipe can be pressed the way its ticket asks", () => {
    for (const t of ["saltwater", "gullpoint", "driftwood", "harbor"]) {
      for (const r of coast(t).menu) {
        const o = orderFromRecipe(1, r, false, null);
        const ks = o.layers.flatMap((l) => Array(l.count ?? 1).fill(l.kind) as Kind[]);
        // Open toasts press only their bread; the rest press whole, with any protein first on its own.
        const pressed = BREADS.has(ks[ks.length - 1]) ? ks : [ks[0]];
        expect(pressable(pressed), `${t} ${r.name}`).toBe(true);
        for (const k of ks) if (k === "chicken" || k === "veggie") expect(pressable([k])).toBe(true);
      }
    }
  });
});
