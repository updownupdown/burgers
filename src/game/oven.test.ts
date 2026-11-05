import { describe, expect, it } from "vitest";
import { makeOrder, orderFromRecipe, seededRng } from "./menu";
import { fryerOf, middleOf, STOPS, townById } from "./stops";
import { leopard, scorePlate } from "./scoring";
import { bakeStep, bakeTopping, COOK_SCALE, darkSide, friesQuality, fryPerfect, paleSide } from "./cooking";
import { bladeUnder, flickOf, grip, NUDGE, nudgeSpin, slideArmed, slidUnder, spinPie, underPie, type Sample, type XZ } from "./peel";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { AFTER_OVEN, isSauce, newPiece, OVEN_CHEESE } from "./types";

/*
 * Orchard Isle's oven (DESIGN §24, phase 4; the peel and deck oven after builds #69 and #71):
 * flatbread and calzone orders, baking in the oven segment by segment and turning pies round with
 * the peel, the peel's scoops and swipes, the board at Port Amber, and the isle's fryer.
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

/** The peel's blade, game units, as on the oven page. */
const BLADE = { rx: 1.12, rz: 0.84 };
/**
 * Push a pie (centred at the origin) round with the peel, as a player would: the blade's tip set
 * against the front of the pie and slid firmly sideways along it, again and again, until it's
 * spun `rad`. Friction holds it until each push has taken up the slack.
 */
function nudgeRound(d: Piece, rad: number): number {
  let spun = 0;
  const z = 0.66 + BLADE.rz;
  let b = { x: -0.9, z };
  let strain = 0;
  for (let i = 0; i < 2000 && spun < rad; i++) {
    const step = { x: 0.04, z: 0 };
    const push = nudgeSpin(b, step, { x: 0, z: 0 }, d.yaw ?? 0, BLADE);
    let turn = 0;
    if (push) [turn, strain] = grip(strain, push);
    else strain = 0;
    spinPie(d, turn);
    spun += turn;
    b = { x: b.x + step.x, z };
    // Back round for another push once the blade has slid past.
    if (b.x > 0.9) [b, strain] = [{ x: -0.9, z }, 0];
  }
  return spun;
}

/** Bake a pie's layers in the oven for `seconds`, turning it half round with the peel at each of `turnAt` (seconds in). */
function bake(layers: Layer[], seconds: number, turnAt: number[] = []): void {
  const d = layers[0].piece;
  const dt = 1 / 30;
  const turns = [...turnAt];
  for (let t = 0; t < seconds; t += dt) {
    if (turns.length && t >= turns[0]) {
      turns.shift();
      spinPie(d, Math.PI);
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
    expect(townById("applecross").oven).toEqual({ spots: 2, board: true });
    expect(townById("portamber").oven).toEqual({ spots: 3, board: true });
    expect(fryerOf(townById("applecross"))).not.toContain("fritters");
    expect(fryerOf(townById("larkvale"))).toContain("fritters");
  });

  it("start with the dough, baked (a calzone folded; turning is up to the cook), with basil, rocket and honey after the oven", () => {
    const red = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    expect(red.layers[0]).toEqual({ kind: "dough", toasted: true });
    expect(red.layers.find((l) => l.kind === "mozzarella")).toMatchObject({ count: 4, melted: true });
    expect(red.layers.find((l) => l.kind === "basil")).toMatchObject({ after: true });
    const fig = orderFromRecipe(2, recipe("larkvale", "Fig & Ham"), false, null);
    expect(fig.layers.map((l) => l.kind)).toEqual(["dough", "oil", "mozzarella", "ham", "fig", "honey"]);
    expect(fig.layers.find((l) => l.kind === "honey")!.after).toBe(true);
    expect(fig.layers.find((l) => l.kind === "oil")!.after).toBeUndefined();
    const cal = orderFromRecipe(3, recipe("portamber", "Calzone"), false, null);
    expect(cal.layers[0]).toEqual({ kind: "dough", toasted: true, folded: true });
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
        // Every oven town has the board: a flatbread may be cut in four (never a calzone).
        expect(!!o.slice).toBe(!o.layers[0].folded);
      }
    }
  });
});

describe("baking and turning round", () => {
  it("a Harvest Red turned round once near halfway bakes evenly and scores full marks, with leopard spots", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const { pie, after } = build(order);
    bake(pie, 21, [10]);
    const d = pie[0].piece;
    expect(paleSide(d)).toBeGreaterThanOrEqual(COOK_SCALE.dough.done);
    expect(darkSide(d) - paleSide(d)).toBeLessThan(0.05);
    expect(d.scorch ?? 0).toBe(0);
    expect(leopard(d)).toBe(true);
    const r = scorePlate(order, plateOf([...pie, ...after]));
    expect(r.score).toBe(100);
    expect(r.perks).toContain("leopard spots");
  });

  it("left unturned it's done but uneven: fine to serve, a little lower, no leopard spots; left too long it scorches", () => {
    const order = orderFromRecipe(1, recipe("applecross", "Harvest Red"), false, null);
    const even = build(order);
    bake(even.pie, 21, [10]);
    const evenScore = scorePlate(order, plateOf([...even.pie, ...even.after])).score;
    // Its pale side is done before its dark side goes too far: a window of several seconds.
    for (const secs of [19, 21, 23.5]) {
      const one = build(order);
      bake(one.pie, secs);
      const d = one.pie[0].piece;
      expect(paleSide(d)).toBeGreaterThanOrEqual(COOK_SCALE.dough.done);
      expect(darkSide(d)).toBeLessThan(COOK_SCALE.dough.over);
      expect(d.scorch ?? 0).toBe(0);
      expect(leopard(d)).toBe(false);
      const r = scorePlate(order, plateOf([...one.pie, ...one.after]));
      expect(r.notes).toContain("baked on one side");
      expect(r.perks).not.toContain("leopard spots");
      expect(r.faulty).toBe(false);
      expect(r.score).toBeGreaterThanOrEqual(85);
      expect(r.score).toBeLessThan(evenScore);
    }
    // The back of the crust is darker than the front.
    const one = build(order);
    bake(one.pie, 21);
    const rim = one.pie[0].piece.rim!;
    expect(rim[2]).toBeGreaterThan(rim[6] + 0.2);
    // Left far too long, the hot side scorches.
    const long = build(order);
    bake(long.pie, 28);
    expect(scorePlate(order, plateOf([...long.pie, ...long.after])).notes).toContain("scorched on one side");
  });

  it("a quarter turn evens out the sides that were front and back, and leaves the others to catch up", () => {
    const d = newPiece("dough");
    for (let t = 0; t < 8; t += 1 / 30) bakeStep(d, 1 / 30);
    spinPie(d, Math.PI / 2);
    for (let t = 0; t < 8; t += 1 / 30) bakeStep(d, 1 / 30);
    const rim = d.rim!;
    // Segments 2 (back) and 6 (front) now match; 0 and 4 (the sides at first) don't.
    expect(Math.abs(rim[2] - rim[6])).toBeLessThan(0.08);
    expect(Math.abs(rim[0] - rim[4])).toBeGreaterThan(0.08);
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
  const pie = { x: 0, z: 0 };
  it("pushing the blade's tip sideways against a pie's front spins it; pushing at its middle, from under it, beside it or from afar doesn't", () => {
    const tip = { x: 0.2, z: 0.66 + BLADE.rz };
    // The tip against the front of the pie, slid right: the front swings right, the right side back (positive yaw).
    expect(nudgeSpin(tip, { x: 0.1, z: 0 }, pie, 0, BLADE)).toBeGreaterThan(0.1);
    // ...and slid left, the other way.
    expect(nudgeSpin(tip, { x: -0.1, z: 0 }, pie, 0, BLADE)).toBeLessThan(-0.1);
    // Straight at its middle: no turn.
    expect(nudgeSpin({ x: 0, z: 0.6 + BLADE.rz }, { x: 0, z: -0.1 }, pie, 0, BLADE)).toBeCloseTo(0, 6);
    // Right under it (a scoop), level beside it (a neighbour brushed past), or well clear of it: no turn.
    expect(nudgeSpin({ x: 0.1, z: 0.1 }, { x: 0.2, z: 0 }, pie, 0, BLADE)).toBe(0);
    expect(nudgeSpin({ x: 0.7 + BLADE.rx, z: 0.2 }, { x: 0, z: 0.2 }, pie, 0, BLADE)).toBe(0);
    expect(nudgeSpin({ x: 3, z: 0 }, { x: 0, z: -0.2 }, pie, 0, BLADE)).toBe(0);
    // The tip a little way in front of the crust (not touching it) doesn't turn it either.
    expect(nudgeSpin({ x: 0.2, z: 0.95 + BLADE.rz }, { x: 0.1, z: 0 }, pie, 0, BLADE)).toBe(0);
  });

  it("a pie holds still until a push is firm enough, then follows it; brushing past doesn't turn it", () => {
    // A touch along its front: taken up by the pie's light grip on the deck (lighter after build #82).
    let strain = 0;
    let turned = 0;
    for (let i = 0; i < 1; i++) {
      const [t, s] = grip(strain, nudgeSpin({ x: -0.1 + i * 0.04, z: 0.66 + BLADE.rz }, { x: 0.04, z: 0 }, pie, 0, BLADE));
      [turned, strain] = [turned + t, s];
    }
    expect(turned).toBe(0);
    // A firm push: once it gives, it turns with the blade.
    for (let i = 1; i < 25; i++) {
      const [t, s] = grip(strain, nudgeSpin({ x: -0.1 + i * 0.04, z: 0.66 + BLADE.rz }, { x: 0.04, z: 0 }, pie, 0, BLADE));
      [turned, strain] = [turned + t, s];
    }
    expect(turned).toBeGreaterThan(0.5);
    // Pushing back the other way has to take up the slack first.
    expect(grip(NUDGE.breakaway, -NUDGE.breakaway * 1.5)[0]).toBe(0);
    // A quick brush (the tip against it only a moment) slips along the crust, however hard.
    expect(grip(0, 1.2, NUDGE.hold / 2)).toEqual([0, NUDGE.breakaway]);
    expect(grip(NUDGE.breakaway, 0.5, NUDGE.hold)[0]).toBeCloseTo(0.5, 6);
  });

  it("a few firm sideways pushes with the peel's tip turn a pie half round", () => {
    const d = newPiece("dough");
    nudgeRound(d, Math.PI);
    expect(Math.cos(d.yaw!)).toBeLessThan(-0.9);
  });

  it("scoops with the blade generously under a pie, not beside it or short of it", () => {
    expect(underPie({ x: 0.2, z: -0.1 }, pie, BLADE)).toBe(true);
    // The pie on the front half of the blade (pushed in a way) or off to one side a little: still a scoop.
    expect(underPie({ x: 0.5, z: 0.6 }, pie, BLADE)).toBe(true);
    expect(underPie({ x: 0.9, z: 0 }, pie, BLADE)).toBe(false);
    expect(underPie({ x: 0, z: 0.8 }, pie, BLADE)).toBe(false);
    // The blade under its edge lifts it onto the blade (no clipping), a blade short of it doesn't.
    expect(bladeUnder({ x: 0, z: 0.66 + BLADE.rz - 0.05 }, pie, 0, BLADE)).toBe(true);
    expect(bladeUnder({ x: 0, z: 0.66 + BLADE.rz + 0.15 }, pie, 0, BLADE)).toBe(false);
  });

  it("pushing the empty blade forward in under a pie scoops it, but not one it came at from the side or was already under", () => {
    // Forward from in front: armed while the tip is short of it, takes it once well under.
    const path = (from: XZ, to: XZ, n = 30) => Array.from({ length: n + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / n, z: from.z + ((to.z - from.z) * i) / n }));
    const run = (pts: XZ[], armed = false) => {
      for (const b of pts) {
        armed = slideArmed(armed, b, pie, BLADE);
        if (armed && slidUnder(b, pie, BLADE)) return true;
      }
      return false;
    };
    expect(run(path({ x: 0.1, z: 2.2 }, { x: 0.1, z: 0.1 }))).toBe(true);
    // A little off to one side, slowly: still.
    expect(run(path({ x: -0.6, z: 2.2 }, { x: -0.5, z: 0.1 }, 200))).toBe(true);
    // From the side, level with it: no (that's a neighbour being passed).
    expect(run(path({ x: 2.4, z: 0.2 }, { x: 0, z: 0.2 }))).toBe(false);
    // Already under it (a pie just set down), wiggled: no.
    expect(run(path({ x: 0, z: 0.3 }, { x: 0.1, z: 0.1 }))).toBe(false);
    // Stopping short (the tip just under the crust, as for a nudge): no.
    expect(run(path({ x: 0, z: 2.2 }, { x: 0, z: 0.66 + BLADE.rz - 0.3 }))).toBe(false);
  });

  it("reads a quick thumb swipe up or down, even mid-drag, but not a slow drag or a sideways one", () => {
    const run = (pts: [number, number, number][]): Sample[] => pts.map(([x, y, t]) => ({ x, y, t }));
    const move = (dx: number, dy: number, ms: number, n = 8, x0 = 200, y0 = 500, t0 = 0): [number, number, number][] => Array.from({ length: n + 1 }, (_, i) => [x0 + (dx * i) / n, y0 + (dy * i) / n, t0 + (ms * i) / n]);
    expect(flickOf(run(move(0, -50, 80)))?.dir).toBe("up");
    expect(flickOf(run(move(4, 45, 70)))?.dir).toBe("down");
    expect(flickOf(run(move(0, -50, 400)))).toBeNull();
    expect(flickOf(run(move(60, -20, 80)))).toBeNull();
    expect(flickOf(run(move(0, -15, 40)))).toBeNull();
    // A real thumb: a short flick up, a bit diagonal, slow to start and easing off, with a wobble.
    const human: [number, number, number][] = [[200, 500, 0], [200, 499, 16], [201, 496, 33], [203, 489, 50], [206, 479, 66], [208, 470, 83], [209, 466, 100], [210, 465, 116]];
    expect(flickOf(run(human))?.dir).toBe("up");
    // After a pause with the finger trembling, a 40 px flick down reported every 33 ms or so on a busy phone: counts.
    expect(flickOf(run([[180, 451, 0], [181, 449.4, 60], [182, 450.3, 115], [182, 450, 120], [182, 453, 152], [182, 470, 186], [182, 490, 253]]))?.dir).toBe("down");
    // After a pause, a 30 px flick in 120 ms: counts.
    expect(flickOf(run([[200, 500, 0], [200, 500, 200], [201, 501, 300], ...move(8, -30, 120, 6, 201, 501, 316)]))?.dir).toBe("up");
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
  it("a calzone bakes slower: turned once it's even, left as it is it's done but uneven", () => {
    const order = orderFromRecipe(1, recipe("portamber", "Calzone"), false, null);
    const even = build(order);
    expect(even.pie[0].piece.folded).toBe(true);
    bake(even.pie, 26, [13]);
    const d = even.pie[0].piece;
    expect(d.scorch ?? 0).toBe(0);
    expect(leopard(d)).toBe(true);
    const r = scorePlate(order, plateOf(even.pie));
    expect(r.score).toBe(100);
    expect(r.perks).toContain("leopard spots");
    const one = build(order);
    bake(one.pie, 26);
    const u = scorePlate(order, plateOf(one.pie));
    expect(u.notes).toContain("baked on one side");
    expect(u.faulty).toBe(false);
    expect(u.score).toBeLessThan(r.score);
    // At a flatbread's time it isn't through yet.
    const quick = build(order);
    bake(quick.pie, 14, [7]);
    expect(scorePlate(order, plateOf(quick.pie)).notes.join()).toMatch(/pale/);
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

  it("cutting a flatbread in four is optional", () => {
    const order = { ...orderFromRecipe(1, recipe("portamber", "Harvest Red"), false, null), slice: true };
    const { pie, after } = build(order);
    bake(pie, 21, [10]);
    const plate = plateOf([...pie, ...after]);
    expect(scorePlate(order, plate).score).toBe(100);
    expect(scorePlate(order, plate).touches).not.toContain("Clean cut");
    pie[0].piece.cuts = 2;
    expect(scorePlate(order, plate).score).toBe(100);
    expect(scorePlate(order, plate).touches).toContain("Clean cut");
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
