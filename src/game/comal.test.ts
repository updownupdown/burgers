import { describe, expect, it } from "vitest";
import { makeOrder, orderFromRecipe, seededRng } from "./menu";
import { EVENTS, fryerOf, middleOf, STOPS, townById, withEvent } from "./stops";
import { dishOrder, scorePlate } from "./scoring";
import { COOK_SCALE, friesQuality, fryPerfect, FRIES_PERFECT } from "./cooking";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { isSauce, newPiece, unfoldTortilla } from "./types";

/*
 * Red Rock's comal (DESIGN §24, phase 3): taco, quesadilla and tostada orders, and how they score.
 */

const ZIGZAG = [
  { x: -0.6, z: -0.45 },
  { x: 0.6, z: -0.3 },
  { x: -0.6, z: -0.05 },
  { x: 0.6, z: 0.15 },
  { x: -0.6, z: 0.4 },
];
const recipe = (town: string, name: string) => townById(town).menu.find((r) => r.name === name)!;

/** One piece made the way the comal (or the fryer) leaves it when it's done right. */
function good(kind: Kind, folded = false): Piece {
  const p = newPiece(kind);
  if (kind === "corn" || kind === "flour") {
    const t = COOK_SCALE[kind].perfect;
    // A quesadilla is crisped on both sides; a taco tortilla warms on the face that went down.
    p.cook = folded ? [t, t] : [t, 0];
    if (folded) Object.assign(p, { folded: true, flips: 1 });
  }
  if (kind === "tostada") p.cook = [COOK_SCALE.tostada.perfect, COOK_SCALE.tostada.perfect];
  if (kind === "pineapple") p.cook = [0.55, 0.3];
  if (kind === "egg") Object.assign(p, { cook: [0.4, 0.2], flips: 1 });
  if (kind === "jack") p.melt = 0.8;
  if (isSauce(kind)) p.stroke = ZIGZAG.map((s) => ({ ...s }));
  return p;
}

/** A plate built exactly to the order. */
function perfect(order: Order): Plate {
  const layers: Layer[] = [];
  for (const e of order.layers) for (let n = 0; n < (e.count ?? 1); n++) layers.push({ piece: good(e.kind, !!e.folded), offX: 0, offZ: 0 });
  return { layers, fries: null, drink: null };
}

describe("Red Rock orders", () => {
  it("come from the comal in every Red Rock town, and only there", () => {
    for (const s of STOPS) {
      const dishes = s.menu.filter((r) => r.dish);
      if (s.region === "desert") {
        expect(middleOf(s)).toBe("comal");
        expect(dishes.length).toBe(s.menu.length);
        expect(fryerOf(s)[0]).toBe("chips");
      } else {
        expect(dishes).toEqual([]);
        expect(middleOf(s)).not.toBe("comal");
      }
    }
  });

  it("scale up: Red Mesa two dishes and chips, Cactus Junction adds pastor, tostadas and nachos, Sun Valley the breakfast taco, eggs, the press and churros", () => {
    expect(townById("redmesa").menu.map((r) => r.name)).toEqual(["Street Tacos", "Quesadilla"]);
    expect(townById("redmesa").poutine).toBe(false);
    const cactus = townById("cactus");
    expect(cactus.menu.map((r) => r.name)).toEqual(["Street Tacos", "Quesadilla", "Pastor Tacos", "Bean Tostada"]);
    expect(cactus.poutine).toBe(true);
    expect(cactus.pantry).toEqual(expect.arrayContaining(["beans", "pineapple"]));
    expect(cactus.pantry).not.toContain("egg");
    const sun = townById("sunvalley");
    expect(sun.menu.map((r) => r.name)).toContain("Breakfast Taco");
    expect(sun.pantry).toContain("egg");
    expect(sun.comal).toEqual({ tpress: true });
    expect(cactus.comal).toEqual({ tpress: false });
    expect(fryerOf(sun)).toEqual(["chips", "churros"]);
  });

  it("count the tortillas and a scoop of pork for each taco", () => {
    const st = orderFromRecipe(1, recipe("redmesa", "Street Tacos"), false, null);
    expect(st.layers).toEqual([
      { kind: "corn", toasted: true, count: 3 },
      { kind: "pork", count: 3 },
      { kind: "onion", count: 1 },
      { kind: "cilantro" },
      { kind: "lime" },
    ]);
    const pastor = orderFromRecipe(2, recipe("cactus", "Pastor Tacos"), false, null);
    expect(pastor.layers[0]).toEqual({ kind: "corn", toasted: true, count: 2 });
    expect(pastor.layers.map((l) => l.kind)).toEqual(["corn", "pork", "pineapple", "onion", "greensalsa"]);
  });

  it("fold a quesadilla over melted cheese, and put an added filling inside", () => {
    const q = orderFromRecipe(1, recipe("redmesa", "Quesadilla"), false, null, [{ type: "add", kind: "pork" }, { type: "add", kind: "jalapeno" }]);
    expect(q.layers[0]).toEqual({ kind: "flour", toasted: true, folded: true });
    expect(q.layers[1]).toEqual({ kind: "jack", melted: true });
    expect(q.layers.slice(2)).toEqual([{ kind: "pork", count: 1 }, { kind: "jalapeno", count: 2 }]);
    expect(q.price).toBe(11);
  });

  it("keep an added topping ahead of the lime and the salsa", () => {
    const st = orderFromRecipe(1, recipe("redmesa", "Street Tacos"), false, null, [{ type: "add", kind: "jalapeno" }]);
    expect(st.layers.map((l) => l.kind).slice(-2)).toEqual(["jalapeno", "lime"]);
    const bt = orderFromRecipe(2, recipe("sunvalley", "Breakfast Taco"), false, null, [{ type: "add", kind: "jack" }]);
    expect(bt.layers.map((l) => l.kind)).toEqual(["flour", "beans", "egg", "jack", "redsalsa"]);
    expect(bt.layers[2]).toEqual({ kind: "egg", flipped: true });
  });

  it("often add pork or jalapeños to a quesadilla, and never take the tortillas, the pork on tacos or a quesadilla's cheese off", () => {
    const rng = seededRng(4);
    let qs = 0;
    let adds = 0;
    for (let i = 0; i < 600; i++) {
      const o = makeOrder(i, rng, 0.8, townById("sunvalley"));
      if (!o.layers.length) continue;
      for (const m of o.mods) {
        expect(["corn", "flour", "tostada"]).not.toContain(m.kind);
        if (m.type === "no") expect(m.kind).not.toBe("pork");
        if (o.name === "Quesadilla" && m.type === "no") expect(m.kind).not.toBe("jack");
      }
      if (o.name !== "Quesadilla") continue;
      qs++;
      if (o.mods.some((m) => m.type === "add" && (m.kind === "pork" || m.kind === "jalapeno"))) adds++;
    }
    expect(qs).toBeGreaterThan(40);
    expect(adds / qs).toBeGreaterThan(0.3);
  });

  it("want chips in Red Rock, nachos from Cactus Junction and churros only at Sun Valley", () => {
    const rng = seededRng(12);
    const tally = (id: string) => {
      const n = { chips: 0, churros: 0, nachos: 0, fries: 0 };
      for (let i = 0; i < 400; i++) {
        const o = makeOrder(i, rng, 0.8, townById(id));
        if (o.poutine) {
          expect(o.name).toBe("Nachos");
          expect(o.fry).toBe("chips");
          n.nachos++;
        } else if (o.fries) n[o.fry === "churros" ? "churros" : o.fry === "chips" ? "chips" : "fries"]++;
      }
      return n;
    };
    const mesa = tally("redmesa");
    expect(mesa.fries).toBe(0);
    expect(mesa.nachos).toBe(0);
    expect(mesa.churros).toBe(0);
    expect(mesa.chips).toBeGreaterThan(50);
    const cactus = tally("cactus");
    expect(cactus.nachos).toBeGreaterThan(5);
    expect(cactus.churros).toBe(0);
    expect(tally("sunvalley").churros).toBeGreaterThan(20);
  });

  it("bring a taco platter to the Rodeo at Cactus Junction", () => {
    const rodeo = EVENTS.find((e) => e.id === "rodeo")!;
    const platter = withEvent(townById("cactus"), rodeo).menu.find((r) => r.name === "Rodeo Platter")!;
    expect(platter.dish).toBe("tacos");
    expect(orderFromRecipe(1, platter, false, null).layers[0]).toEqual({ kind: "corn", toasted: true, count: 4 });
  });
});

describe("Red Rock scoring", () => {
  const street = orderFromRecipe(1, recipe("redmesa", "Street Tacos"), false, null);
  const ques = orderFromRecipe(2, recipe("redmesa", "Quesadilla"), false, null);
  const pastor = orderFromRecipe(3, recipe("cactus", "Pastor Tacos"), false, null);
  const tostada = orderFromRecipe(4, recipe("cactus", "Bean Tostada"), false, null);
  const breakfast = orderFromRecipe(5, recipe("sunvalley", "Breakfast Taco"), false, null);

  it("gives five stars to tacos, a quesadilla and a tostada made right", () => {
    for (const o of [street, ques, pastor, tostada, breakfast]) {
      const r = scorePlate(o, perfect(o));
      expect(r.notes).toEqual([]);
      expect(r.score).toBe(100);
      expect(r.stars).toBe(5);
    }
  });

  it("doesn't mind the order the toppings went on in", () => {
    const p = perfect(street);
    // Pork, onion, pork, cilantro, pork: still three scoops.
    const [corn1, corn2, corn3, pork1, pork2, pork3, onion, cilantro, lime] = p.layers;
    p.layers = [corn1, corn2, corn3, pork1, onion, pork2, cilantro, pork3, lime];
    expect(dishOrder(street.layers, p.layers).map((l) => l.piece.kind)).toEqual(["corn", "corn", "corn", "pork", "pork", "pork", "onion", "cilantro", "lime"]);
    expect(scorePlate(street, p).score).toBe(100);
  });

  it("wants every tortilla warmed: a cold one or a hard one is called out", () => {
    const cold = perfect(street);
    cold.layers[1].piece.cook = [0, 0];
    const r = scorePlate(street, cold);
    expect(r.notes).toContain("cold, stiff tortilla");
    expect(r.stars).toBeLessThan(5);
    const hard = perfect(street);
    hard.layers[0].piece.cook = [0.9, 0];
    expect(scorePlate(street, hard).notes).toContain("tortilla a bit hard");
    const burnt = perfect(street);
    burnt.layers[2].piece.cook = [1.1, 0];
    expect(scorePlate(street, burnt).notes).toContain("burnt tortilla");
  });

  it("counts the tacos: two tortillas for a three-taco order is short", () => {
    const p = perfect(street);
    p.layers.splice(0, 1);
    const r = scorePlate(street, p);
    expect(r.notes).toContain("a taco short");
    expect(r.score).toBeLessThan(90);
  });

  it("wants the quesadilla folded, crisped on both sides, the cheese melted first", () => {
    const open = perfect(ques);
    open.layers[0].piece.folded = false;
    expect(scorePlate(ques, open).notes).toContain("wanted it folded");
    const oneSide = perfect(ques);
    oneSide.layers[0].piece.cook = [0.9, 0.05];
    expect(scorePlate(ques, oneSide).notes).toContain("only crisp on one side");
    const charred = perfect(ques);
    charred.layers[0].piece.cook = [1.1, 0.3];
    expect(scorePlate(ques, charred).notes).toContain("charred on one side");
    const cold = perfect(ques);
    cold.layers[1].piece.melt = 0.2;
    const r = scorePlate(ques, cold);
    expect(r.notes).toContain("cheese not melted");
    expect(r.stars).toBeLessThan(5);
  });

  it("judges the pineapple, the egg and the tostada shell", () => {
    const p = perfect(pastor);
    p.layers.find((l) => l.piece.kind === "pineapple")!.piece.cook = [0, 0];
    expect(scorePlate(pastor, p).notes).toContain("pineapple not grilled");
    const b = perfect(breakfast);
    b.layers.find((l) => l.piece.kind === "egg")!.piece.flips = 0;
    expect(scorePlate(breakfast, b).notes).toContain("wanted the egg over easy");
    const t = perfect(tostada);
    t.layers[0].piece.cook = [0.2, 0.2];
    expect(scorePlate(tostada, t).notes).toContain("soggy tostada shell");
  });

  it("pays a little extra for hand-pressed tortillas", () => {
    const p = perfect(street);
    const cold = perfect(street);
    cold.layers[0].piece.cook = [0, 0];
    for (const pl of [p, cold]) for (const l of pl.layers) if (l.piece.kind === "corn") l.piece.handmade = true;
    expect(scorePlate(street, p).perks).toContain("hand-pressed tortillas");
    expect(scorePlate(street, cold).score).toBeGreaterThan(scorePlate(street, { ...cold, layers: cold.layers.map((l) => ({ ...l, piece: { ...l.piece, handmade: false } })) }).score);
  });

  it("scores chips, nachos and churros on their own bands", () => {
    expect(friesQuality(fryPerfect("chips"), "chips")).toBe(1);
    expect(friesQuality(FRIES_PERFECT + 0.15, "chips")).toBeLessThan(friesQuality(FRIES_PERFECT + 0.15, "fries"));
    const o: Order = { ...street, fries: true, fry: "chips", friesSize: "M" };
    const p = perfect(o);
    p.fries = { cook: fryPerfect("chips"), size: "M", fill: 1, salt: 0.6, fry: "chips" };
    expect(scorePlate(o, p).score).toBe(100);
    p.fries = { cook: FRIES_PERFECT, size: "M", fill: 1, salt: 0.6 };
    expect(scorePlate(o, p).notes).toContain("wanted chips");
    const nachos: Order = { id: 9, name: "Nachos", price: 8, mods: [], layers: [], fries: true, friesSize: "L", drink: null, drinkSize: "M", poutine: true, fry: "chips" };
    const n: Plate = { layers: [], fries: { cook: fryPerfect("chips"), size: "L", fill: 1, fry: "chips", curds: true, gravy: false }, drink: null };
    expect(scorePlate(nachos, n).notes).toContain("no queso on the nachos");
    const churros: Order = { ...o, fry: "churros" };
    const c: Plate = { ...perfect(churros), fries: { cook: fryPerfect("churros"), size: "M", fill: 1, fry: "churros" } };
    expect(scorePlate(churros, c).notes).toContain("churros needed sugar");
  });
});

describe("unfolding a quesadilla (after build #68)", () => {
  it("opens a folded tortilla back out, keeping its filling and the cook on its faces", () => {
    const q = newPiece("flour");
    const jack = newPiece("jack");
    jack.melt = 0.3;
    q.fill = [jack];
    q.folded = true;
    q.foldYaw = 1.2;
    q.cook = [0.3, 0.2];
    q.flips = 1;
    expect(unfoldTortilla(q)).toBe(true);
    expect(q.folded).toBe(false);
    expect(q.foldYaw).toBeUndefined();
    expect(q.fill).toEqual([jack]);
    expect(q.cook).toEqual([0.3, 0.2]);
    expect(q.flips).toBe(1);
  });
  it("leaves anything that isn't a folded tortilla alone", () => {
    const open = newPiece("flour");
    expect(unfoldTortilla(open)).toBe(false);
    const calzone = newPiece("dough");
    calzone.folded = true;
    expect(unfoldTortilla(calzone)).toBe(false);
    expect(calzone.folded).toBe(true);
  });
});
