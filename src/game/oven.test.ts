import { describe, expect, it } from "vitest";
import { makeOrder, orderFromRecipe, seededRng } from "./menu";
import { fryerOf, middleOf, STOPS, townById } from "./stops";
import { leopard, scorePlate } from "./scoring";
import { bakeStep, bakeTopping, COOK_SCALE, fireHalf, friesQuality, fryPerfect, paleSide } from "./cooking";
import { flickOf, nudgeSpin, spinPie, underPie, type Sample } from "./peel";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { AFTER_OVEN, isSauce, newPiece, OVEN_CHEESE } from "./types";

/*
 * Orchard Isle's oven (DESIGN §24, phase 4; the peel and deck oven after build #69): flatbread and
 * calzone orders, baking in the oven and nudging pies round with the peel, the peel's swipes, the
 * board at Port Amber, and the isle's fryer.
 */

/** A spiral from the middle out, as the ladle spreads tomato sauce over a base. */
const SPIRAL = Array.from({ length: 70 }, (_, i) => {
  const a = i * 0.45;
  const r = Math.min(0.95, 0.04 + i * 0.0135);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
});
/** A quick zigzag, as olive oil or honey is drizzled. */
const ZIGZAG = [
  { x: -0.6, z: -0.45 },
  { x: 0.6, z: -0.3 },
  { x: -0.6, z: -0.05 },
  { x: 0.6, z: 0.15 },
  { x: -0.6, z: 0.4 },
];
const recipe = (town: string, name: string) => townById(town).menu.find((r) => r.name === name)!;

/** The peel's blade and a pie's reach, game units, as on the oven page. */
const BLADE = { rx: 1.12, rz: 0.84 };
const PIE_R = 0.8;
/**
 * Nudge a pie (centred at the origin) round with the peel, as a player would: the blade's tip set
 * against the front of the pie and slid sideways along it, again and again, until it's spun `rad`.
 */
function nudgeRound(d: Piece, rad: number): number {
  let spun = 0;
  let b = { x: -1.0, z: 0.7 + BLADE.rz };
  for (let i = 0; i < 400 && spun < rad; i++) {
    const step = { x: 0.04, z: 0 };
    const s = nudgeSpin(b, step, { x: 0, z: 0 }, PIE_R, BLADE);
    spinPie(d, s);
    spun += s;
    b = { x: b.x + step.x, z: b.z };
    // Back round for another push once the blade has slid past.
    if (b.x > 1.0) b = { x: -1.0, z: b.z };
  }
  return spun;
}

/** Bake a pie's layers in the oven for `seconds`, nudging it half round with the peel at each of `turnAt` (seconds in). */
function bake(layers: Layer[], seconds: number, turnAt: number[] = []): void {
  const d = layers[0].piece;
  const dt = 1 / 30;
  const turns = [...turnAt];
  for (let t = 0; t < seconds; t += dt) {
    if (turns.length && t >= turns[0]) {
      turns.shift();
      nudgeRound(d, Math.PI);
    }
    bakeStep(d, dt);
    for (const l of layers.slice(1)) bakeTopping(l.piece, dt, OVEN_CHEESE.has(l.piece.kind));
  }
}

/** A pie built exactly to the order, unbaked: everything for the oven on it, the after-oven layers held back. */
function build(order: Order): { pie: Layer[]; after: Layer[] } {
  const pie: Layer[] = [];
  const after: Layer[] = [];
  for (const e of order.layers) {
    for (let n = 0; n < (e.count ?? 1); n++) {
      const p: Piece = newPiece(e.kind);
      if (e.kind === "dough" && e.folded) p.folded = true;
      if (isSauce(e.kind)) p.stroke = (e.kind === "redsauce" ? SPIRAL : ZIGZAG).map((q) => ({ ...q }));
      (e.after ? after : pie).push({ piece: p, offX: 0, offZ: 0 });
    }
  }
  return { pie, after };
}
const plateOf = (layers: Layer[]): Plate => ({ layers, fries: null, drink: null });

describe("Orchard Isle orders", () => {
  it("come from the hearth oven in every isle town, and only there", () => {
    for (const s of STOPS) {
      const pies = s.menu.filter((r) => r.pie);
      if (s.region === "orchard") {
        expect(middleOf(s)).toBe("oven");
        expect(pies.length).toBe(s.menu.length);
        expect(fryerOf(s)).toContain("zucchini");
        expect(s.poutine).toBe(false);
      } else {
        expect(pies).toEqual([]);
        expect(middleOf(s)).not.toBe("oven");
      }
    }
  });

  it("grow town by town: two flatbreads, then white bases, then the calzone, a third spot and the board", () => {
    const names = (id: string) => townById(id).menu.map((r) => r.name);
    expect(names("applecross")).toEqual(["Harvest Red", "Mushroom"]);
    expect(names("larkvale")).toEqual(["Harvest Red", "Mushroom", "Fig & Ham", "Pear & Blue"]);
    expect(names("portamber")).toContain("Calzone");
    expect(townById("applecross").oven).toEqual({ spots: 2, board: false });
    expect(townById("portamber").oven).toEqual({ spots: 3, board: true });
    expect(fryerOf(townById("applecross"))).not.toContain("fritters");
    expect(fryerOf(townById("larkvale"))).toContain("fritters");
  });

  it("start with the dough, turned once (a calzone folded and turned twice), with basil, rocket and honey after the oven", () => {
    const red = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    expect(red.layers[0]).toMatchObject({ kind: "dough", turns: 1 });
    expect(red.layers.find((l) => l.kind === "mozzarella")).toMatchObject({ count: 4, melted: true });
    expect(red.layers.find((l) => l.kind === "basil")).toMatchObject({ after: true });
    const fig = orderFromRecipe(2, recipe("larkvale", "Fig & Ham"), false, null);
    expect(fig.layers.map((l) => l.kind)).toEqual(["dough", "oil", "mozzarella", "ham", "fig", "honey"]);
    expect(fig.layers.find((l) => l.kind === "honey")!.after).toBe(true);
    expect(fig.layers.find((l) => l.kind === "oil")!.after).toBeUndefined();
    const cal = orderFromRecipe(3, recipe("portamber", "Calzone"), false, null);
    expect(cal.layers[0]).toMatchObject({ kind: "dough", folded: true, turns: 2 });
    expect(cal.layers.some((l) => l.after)).toBe(false);
  });

  it("only ask for toppings the town stocks, and add new ones before the after-oven layers", () => {
    const rng = seededRng(5);
    for (const id of ["applecross", "larkvale", "portamber"]) {
      const stop = townById(id);
      for (let i = 0; i < 300; i++) {
        const o = makeOrder(i, rng, 1, stop);
        if (!o.layers.length) continue;
        expect(o.layers[0].kind).toBe("dough");
        for (const l of o.layers) if (!isSauce(l.kind)) expect(stop.pantry).toContain(l.kind);
        // Nothing that goes in the oven comes after something that goes on after it.
        const firstAfter = o.layers.findIndex((l) => l.after);
        if (firstAfter >= 0) expect(o.layers.slice(firstAfter).every((l) => AFTER_OVEN.has(l.kind))).toBe(true);
        // Port Amber cuts its flatbreads in four (never a calzone).
        expect(!!o.slice).toBe(id === "portamber" && !o.layers[0].folded);
      }
    }
  });
});

describe("baking and nudging round", () => {
  it("a Harvest Red nudged round once near halfway scores full marks, with leopard spots", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const { pie, after } = build(order);
    bake(pie, 21, [10]);
    const d = pie[0].piece;
    expect(paleSide(d)).toBeGreaterThanOrEqual(COOK_SCALE.dough.done);
    expect(d.scorch ?? 0).toBe(0);
    expect(leopard(d)).toBe(true);
    const r = scorePlate(order, plateOf([...pie, ...after]));
    expect(r.score).toBe(100);
    expect(r.perks).toContain("leopard spots");
  });

  it("left unturned, the hot side scorches before the pale side is done", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const { pie, after } = build(order);
    bake(pie, 22);
    const d = pie[0].piece;
    expect(d.scorch).toBeGreaterThan(1);
    const r = scorePlate(order, plateOf([...pie, ...after]));
    expect(r.notes).toContain("scorched on one side");
    expect(r.score).toBeLessThan(85);
  });

  it("pulled too soon it's pale; left far too long it burns", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const a = build(order);
    bake(a.pie, 9, [4.5]);
    expect(scorePlate(order, plateOf([...a.pie, ...a.after])).notes.join()).toMatch(/pale/);
    const b = build(order);
    bake(b.pie, 40, [10]);
    expect(scorePlate(order, plateOf([...b.pie, ...b.after])).notes).toContain("burnt crust");
  });

  it("basil baked in the oven wilts", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const { pie, after } = build(order);
    const all = [...pie, ...after];
    bake(all, 21, [10]);
    const r = scorePlate(order, plateOf(all));
    expect(r.notes).toContain("wilted basil");
    expect(r.score).toBeLessThan(100);
  });

  it("a Mushroom flatbread wants the longer bake for its mushrooms", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Mushroom"), false, null);
    const short = build(order);
    bake(short.pie, 17, [8]);
    expect(scorePlate(order, plateOf(short.pie)).notes).toContain("mushrooms a bit pale");
    const long = build(order);
    bake(long.pie, 25, [12]);
    const r = scorePlate(order, plateOf(long.pie));
    expect(r.notes).not.toContain("mushrooms a bit pale");
    expect(r.score).toBe(100);
  });

  it("a Fig & Ham with olive oil before the oven and honey after scores full marks", () => {
    const order = orderFromRecipe(1, recipe("larkvale", "Fig & Ham"), false, null);
    const { pie, after } = build(order);
    expect(after.map((l) => l.piece.kind)).toEqual(["honey"]);
    bake(pie, 21, [10]);
    expect(scorePlate(order, plateOf([...pie, ...after])).score).toBe(100);
    // Without the cheese melting (straight to the tray) it's marked down.
    const raw = build(order);
    expect(scorePlate(order, plateOf([...raw.pie, ...raw.after])).score).toBeLessThan(70);
  });

  it("a thin smear of tomato sauce is stingy", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const { pie, after } = build(order);
    pie[1].piece.stroke = SPIRAL.slice(0, 8);
    bake(pie, 21, [10]);
    expect(scorePlate(order, plateOf([...pie, ...after])).notes).toContain("stingy with the sauce");
  });
});

describe("the peel", () => {
  it("sliding the blade's tip sideways along a pie's front spins it; pushing at its middle, from under it, beside it or from afar doesn't", () => {
    const pie = { x: 0, z: 0 };
    const tip = { x: 0.2, z: 0.7 + BLADE.rz };
    // The tip against the front of the pie, slid right: the front swings right, the right side back (positive yaw).
    expect(nudgeSpin(tip, { x: 0.1, z: 0 }, pie, PIE_R, BLADE)).toBeGreaterThan(0.1);
    // ...and slid left, the other way.
    expect(nudgeSpin(tip, { x: -0.1, z: 0 }, pie, PIE_R, BLADE)).toBeLessThan(-0.1);
    // Straight at its middle: no turn.
    expect(nudgeSpin({ x: 0, z: 0.6 + BLADE.rz }, { x: 0, z: -0.1 }, pie, PIE_R, BLADE)).toBeCloseTo(0, 6);
    // Right under it (a scoop), level beside it (a neighbour brushed past), or well clear of it: no turn.
    expect(nudgeSpin({ x: 0.1, z: 0.1 }, { x: 0.2, z: 0 }, pie, PIE_R, BLADE)).toBe(0);
    expect(nudgeSpin({ x: 0.7 + BLADE.rx, z: 0.2 }, { x: 0, z: 0.2 }, pie, PIE_R, BLADE)).toBe(0);
    expect(nudgeSpin({ x: 3, z: 0 }, { x: 0, z: -0.2 }, pie, PIE_R, BLADE)).toBe(0);
  });

  it("a pie is turned once its other half swings round to the back, and wobbling about sideways doesn't count twice", () => {
    const d = newPiece("dough");
    expect(fireHalf(d)).toBe(0);
    expect(spinPie(d, 1.3)).toBe(false);
    expect(spinPie(d, 0.5)).toBe(true);
    expect(d.turns).toBe(1);
    expect(fireHalf(d)).toBe(1);
    // Rocking either side of sideways: still one turn.
    for (let i = 0; i < 6; i++) spinPie(d, i % 2 ? 0.1 : -0.1);
    expect(d.turns).toBe(1);
    // All the way round again: two turns, half A back at the hot wall.
    spinPie(d, Math.PI);
    expect(d.turns).toBe(2);
    expect(fireHalf(d)).toBe(0);
    expect(Math.cos(d.yaw!)).toBeGreaterThan(0);
  });

  it("a couple of sideways nudges with the peel's tip turn a pie half round", () => {
    const d = newPiece("dough");
    nudgeRound(d, Math.PI);
    expect(d.turns).toBe(1);
    expect(Math.cos(d.yaw!)).toBeLessThan(-0.9);
  });

  it("scoops only with the blade right under a pie", () => {
    expect(underPie({ x: 0.2, z: -0.1 }, { x: 0, z: 0 }, BLADE)).toBe(true);
    expect(underPie({ x: 0.9, z: 0 }, { x: 0, z: 0 }, BLADE)).toBe(false);
    expect(underPie({ x: 0, z: 0.7 }, { x: 0, z: 0 }, BLADE)).toBe(false);
  });

  it("reads a quick thumb swipe up or down, even mid-drag, but not a slow drag or a sideways one", () => {
    const run = (pts: [number, number, number][]): Sample[] => pts.map(([x, y, t]) => ({ x, y, t }));
    const move = (dx: number, dy: number, ms: number, n = 8, x0 = 200, y0 = 500, t0 = 0): [number, number, number][] => Array.from({ length: n + 1 }, (_, i) => [x0 + (dx * i) / n, y0 + (dy * i) / n, t0 + (ms * i) / n]);
    expect(flickOf(run(move(0, -50, 80)))?.dir).toBe("up");
    expect(flickOf(run(move(4, 45, 70)))?.dir).toBe("down");
    expect(flickOf(run(move(0, -50, 400)))).toBeNull();
    expect(flickOf(run(move(60, -20, 80)))).toBeNull();
    expect(flickOf(run(move(0, -18, 40)))).toBeNull();
    // A slow carry, then a flick down at the end: the flick counts, measured from where it began.
    const carry = [...move(-80, -200, 900, 20), ...move(0, 50, 70, 6, 120, 300, 920)];
    const f = flickOf(run(carry));
    expect(f?.dir).toBe("down");
    expect(f?.from.y).toBeLessThanOrEqual(305);
    // Once a swipe has been counted, the same samples don't count again.
    expect(flickOf(run(carry), 991)).toBeNull();
  });
});

describe("calzones and the board", () => {
  it("a calzone turned twice is baked through; turned once it scorches", () => {
    const order = orderFromRecipe(1, recipe("portamber", "Calzone"), false, null);
    const two = build(order);
    expect(two.pie[0].piece.folded).toBe(true);
    bake(two.pie, 22, [6, 16]);
    const d = two.pie[0].piece;
    expect(d.scorch ?? 0).toBe(0);
    expect(leopard(d, 2)).toBe(true);
    const r = scorePlate(order, plateOf(two.pie));
    expect(r.score).toBe(100);
    expect(r.perks).toContain("leopard spots");
    const once = build(order);
    bake(once.pie, 22, [7]);
    expect(scorePlate(order, plateOf(once.pie)).notes.join()).toMatch(/scorched|pale/);
  });

  it("a calzone has to be folded, and a flatbread mustn't be", () => {
    const cal = orderFromRecipe(1, recipe("portamber", "Calzone"), false, null);
    const open = build(cal);
    open.pie[0].piece.folded = false;
    bake(open.pie, 21, [10]);
    expect(scorePlate(cal, plateOf(open.pie)).notes).toContain("wanted a calzone, folded");
    const red = orderFromRecipe(2, recipe("applecross", "Harvest Red"), false, null);
    const shut = build(red);
    shut.pie[0].piece.folded = true;
    bake(shut.pie, 26, [6, 16]);
    expect(scorePlate(red, plateOf([...shut.pie, ...shut.after])).notes).toContain("didn't want it folded");
  });

  it("Port Amber wants its flatbreads cut in four", () => {
    const order = { ...orderFromRecipe(1, recipe("portamber", "Harvest Red"), false, null), slice: true };
    const { pie, after } = build(order);
    bake(pie, 21, [10]);
    const plate = plateOf([...pie, ...after]);
    expect(scorePlate(order, plate).notes).toContain("wanted it cut in four");
    pie[0].piece.cuts = 1;
    expect(scorePlate(order, plate).notes).toContain("only cut in half");
    pie[0].piece.cuts = 2;
    expect(scorePlate(order, plate).score).toBe(100);
  });
});

describe("the isle's fryer", () => {
  it("fries zucchini fritti and apple fritters, and sugars the fritters", () => {
    for (const fry of ["zucchini", "fritters"] as const) {
      expect(friesQuality(fryPerfect(fry), fry)).toBeGreaterThan(0.95);
      expect(friesQuality(0.2, fry)).toBeLessThan(0.6);
    }
    const kinds: Kind[] = ["mushroom", "ham", "fig", "pear", "blue"];
    for (const k of kinds) expect(townById("larkvale").pantry).toContain(k);
  });
});
