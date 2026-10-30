import { describe, expect, it } from "vitest";
import { nextReputation, planFor, ratingBonus, trafficMult } from "./business";
import { pieceFor, popularityChange, willingnessToPay } from "./press";
import { applyMods, makeOrder, orderFromRecipe, seededRng } from "./menu";
import { EVENTS, eventOn, nextDay, STOPS, townById, withEvent } from "./stops";
import { passed, upgradeChoices } from "./progress";
import { alignLayers, payout, scorePlate } from "./scoring";
import { FRIES_PERFECT } from "./cooking";
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
  mods: [],
  layers: [
    { kind: "bun", toasted: true },
    { kind: "patty", doneness: "medium" },
    { kind: "ketchup" },
    { kind: "bun", toasted: true },
  ],
  fries: false,
  drink: null,
  friesSize: "S",
  drinkSize: "M",
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
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt: true };
    plate.drink = { flavor: "cola", fill: 0.9, size: "M" };
    expect(scorePlate(order, plate).notes).toContain("no lid");
    plate.drink = { flavor: "cola", fill: 0.9, size: "M", lid: true, straw: true };
    expect(scorePlate(order, plate).score).toBe(100);
    plate.drink = { flavor: "pine", fill: 0.9, size: "M" };
    expect(scorePlate(order, plate).notes).toContain("wrong drink");
  });

  it("scores fries by zone and by where in the zone", () => {
    const q = (cook: number) => {
      const plate = perfectPlate();
      plate.fries = { cook, size: "S", fill: 1, salt: true };
      return scorePlate({ ...classic, fries: true }, plate).sides;
    };
    expect(q(FRIES_PERFECT)).toBe(1);
    expect(q(0.55)).toBeLessThan(q(0.65));
    expect(q(0.55)).toBeGreaterThan(q(0.45));
    expect(q(1.0)).toBeLessThan(q(0.9));
    expect(q(1.2)).toBeLessThan(q(1.0));
    const plate = perfectPlate();
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1 };
    const r = scorePlate({ ...classic, fries: true }, plate);
    expect(r.notes).toContain("fries needed salt");
    expect(r.sides).toBeCloseTo(0.85);
  });

  it("scores a poutine meal on the poutine", () => {
    const order: Order = { ...classic, name: "Poutine", layers: [], mods: [], fries: true, friesSize: "L", poutine: true };
    const plate: Plate = { layers: [], fries: { cook: FRIES_PERFECT, size: "L", fill: 1, curds: true, gravy: true }, drink: null };
    expect(scorePlate(order, plate).score).toBe(100);
    plate.fries!.gravy = false;
    const r = scorePlate(order, plate);
    expect(r.notes).toContain("no gravy on the poutine");
    expect(r.score).toBe(50);
  });

  it("lets a free side soften a bad review", () => {
    const plate = perfectPlate();
    plate.layers[1].piece.cook = [0.98, 0.98];
    const before = scorePlate(classic, plate).score;
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt: true };
    const r = scorePlate(classic, plate);
    expect(r.perks).toEqual(["free fries"]);
    expect(r.score).toBeGreaterThan(before);
    plate.fries.cook = 1.4;
    expect(scorePlate(classic, plate).score).toBe(before);
  });

  it("checks side sizes and portions", () => {
    const order: Order = { ...classic, fries: true, drink: "cola", friesSize: "L", drinkSize: "S" };
    const plate = perfectPlate();
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1 };
    plate.drink = { flavor: "cola", fill: 0.9, size: "L" };
    const notes = scorePlate(order, plate).notes;
    expect(notes).toContain("wanted large fries");
    expect(notes).toContain("wanted a small drink");
    plate.fries = { cook: 0.7, size: "L", fill: 0.5 };
    expect(scorePlate(order, plate).notes).toContain("skimpy fries");
  });

  it("checks ice", () => {
    const plate = perfectPlate();
    const drink = { flavor: "cola" as const, fill: 0.9, size: "M" as const, lid: true, straw: true };
    plate.drink = { ...drink, ice: true };
    expect(scorePlate({ ...classic, drink: "cola", ice: false }, plate).notes).toContain("asked for no ice");
    expect(scorePlate({ ...classic, drink: "cola", ice: null }, plate).notes).toEqual([]);
    plate.drink = { ...drink, ice: false };
    expect(scorePlate({ ...classic, drink: "cola", ice: true }, plate).notes).toContain("forgot the ice");
  });
});

describe("payout", () => {
  it("tips only good, fast orders", () => {
    expect(payout(classic, 100, 1)).toEqual({ pay: 10, tip: 4 });
    expect(payout(classic, 50, 1).tip).toBe(0);
  });
});

describe("makeOrder", () => {
  it("builds burgers that start and end with a bun at every stop", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 150; i++) {
      const stop = STOPS[i % STOPS.length];
      const o = makeOrder(i, rng, (i % 50) / 50, stop);
      if (o.poutine) {
        expect(o.layers).toEqual([]);
        expect(o.fries).toBe(true);
        continue;
      }
      for (const l of o.layers) if (l.kind !== "ketchup" && l.kind !== "mustard") expect(stop.pantry).toContain(l.kind);
      expect(o.layers[0].kind).toBe("bun");
      expect(o.layers[o.layers.length - 1].kind).toBe("bun");
      expect(o.price).toBeGreaterThan(0);
    }
  });
});

describe("counted toppings", () => {
  const withPickles = (n: number): Plate => {
    const p = perfectPlate();
    const pickles = Array.from({ length: n }, () => layer(piece("pickle")));
    p.layers.splice(2, 0, ...pickles);
    return p;
  };
  const order: Order = { ...classic, layers: [...classic.layers.slice(0, 2), { kind: "pickle", count: 3 }, ...classic.layers.slice(2)] };

  it("counts a run of pickles as one layer", () => {
    expect(scorePlate(order, withPickles(3)).score).toBe(100);
    expect(scorePlate(order, withPickles(3)).notes).toEqual([]);
  });

  it("marks down a skimpy burger and calls it out", () => {
    const r = scorePlate(order, withPickles(1));
    expect(r.notes).toContain("skimpy on the pickles");
    expect(r.score).toBeLessThan(90);
  });

  it("rewards a couple extra, not a pile", () => {
    const base = scorePlate(order, (() => { const p = withPickles(3); p.layers[1].piece.cook = [0.3, 0.3]; return p; })()).score;
    const generous = (() => { const p = withPickles(5); p.layers[1].piece.cook = [0.3, 0.3]; return p; })();
    expect(scorePlate(order, generous).score).toBeGreaterThan(base);
    expect(scorePlate(order, withPickles(7)).notes).toContain("way too many pickles");
  });

  it("orders extra pickles as more pieces, at a price", () => {
    const recipe = { name: "P", price: 6, layers: ["bun", "patty", "pickle", "bun"] as Kind[], toasted: false };
    const plain = orderFromRecipe(1, recipe, "medium", false, null);
    const extra = orderFromRecipe(1, recipe, "medium", false, null, [{ type: "extra", kind: "pickle" }]);
    expect(plain.layers.find((l) => l.kind === "pickle")?.count).toBe(3);
    expect(extra.layers.filter((l) => l.kind === "pickle")).toHaveLength(1);
    expect(extra.layers.find((l) => l.kind === "pickle")?.count).toBe(5);
    expect(extra.price).toBeGreaterThan(plain.price);
  });
});

describe("poutine", () => {
  it("turns up now and then once the shift is going, never in the first orders", () => {
    const rng = seededRng(5);
    const early = Array.from({ length: 200 }, (_, i) => makeOrder(i, rng, 0.1, STOPS[0]));
    expect(early.some((o) => o.poutine)).toBe(false);
    const later = Array.from({ length: 400 }, (_, i) => makeOrder(i, rng, 0.6, STOPS[0])).filter((o) => o.poutine).length;
    expect(later).toBeGreaterThan(20);
    expect(later).toBeLessThan(90);
  });
});

describe("smash burgers", () => {
  it("wants smashed patties when the recipe says so", () => {
    const order: Order = { ...classic, layers: classic.layers.map((l) => (l.kind === "patty" ? { ...l, doneness: "well", smashed: true } : l)) };
    const p = perfectPlate();
    const w = DONENESS_TARGET.well;
    p.layers[1].piece.cook = [w, w];
    expect(scorePlate(order, p).notes).toContain("wanted it smashed");
    p.layers[1].piece.smashed = true;
    expect(scorePlate(order, p).score).toBe(100);
  });
});

describe("melted cheese", () => {
  it("only asks for melting on cheese that sits right on a patty", () => {
    const recipe = STOPS.flatMap((s) => s.menu).find((r) => r.name === "Sunset Double")!;
    let seed = 3;
    let order: Order;
    do order = makeOrder(1, seededRng(seed++), 1, { ...STOPS[2], menu: [recipe] });
    while (order.poutine);
    const melted = order.layers.map((l, i) => (l.melted ? order.layers[i - 1].kind : null)).filter(Boolean);
    expect(melted.length).toBeGreaterThan(0);
    expect(melted.every((k) => k === "patty")).toBe(true);
  });

  it("marks down cold cheese when melted was ordered", () => {
    const order: Order = { ...classic, layers: [...classic.layers.slice(0, 2), { kind: "cheese", melted: true }, ...classic.layers.slice(2)] };
    const p = perfectPlate();
    p.layers.splice(2, 0, layer(piece("cheese")));
    expect(scorePlate(order, p).notes).toContain("cheese not melted");
    p.layers[2].piece.melt = 0.8;
    expect(scorePlate(order, p).score).toBe(100);
  });
});

describe("road trip progress", () => {
  it("needs most customers served at one star or better to move on", () => {
    expect(passed(1.2, 6, 9)).toBe(true);
    expect(passed(0.8, 9, 9)).toBe(false);
    expect(passed(3, 4, 9)).toBe(false);
  });

  it("only offers upgrades the truck doesn't have", () => {
    const offer = upgradeChoices(["bench", "tipjar"], seededRng(3));
    expect(offer).toHaveLength(3);
    expect(offer.some((u) => u.id === "bench" || u.id === "tipjar")).toBe(false);
  });
});

describe("feedback notes", () => {
  it("calls swapped layers out of order rather than missing", () => {
    const order: Order = { id: 1, name: "t", price: 10, mods: [], layers: [{ kind: "bun" }, { kind: "cheese" }, { kind: "pickle" }, { kind: "bun" }], fries: false, drink: null, friesSize: "S", drinkSize: "M" };
    const r = scorePlate(order, { layers: ["bun", "pickle", "cheese", "bun"].map((k) => ({ piece: piece(k as Kind), offX: 0, offZ: 0 })), fries: null, drink: null });
    expect(r.notes).toContain("layers out of order");
    expect(r.notes.join()).not.toMatch(/missing|extra/);
  });
});

describe("recipe modifiers", () => {
  const base: Kind[] = ["bun", "patty", "cheese", "pickle", "ketchup", "bun"];
  it("removes, doubles and adds toppings", () => {
    expect(applyMods(base, [{ type: "no", kind: "pickle" }])).toEqual(["bun", "patty", "cheese", "ketchup", "bun"]);
    expect(applyMods(base, [{ type: "extra", kind: "cheese" }])).toEqual(["bun", "patty", "cheese", "cheese", "pickle", "ketchup", "bun"]);
    expect(applyMods(base, [{ type: "add", kind: "bacon" }])).toEqual(["bun", "patty", "bacon", "cheese", "pickle", "ketchup", "bun"]);
  });

  it("never removes buns or patties and only adds what the stop stocks", () => {
    const rng = seededRng(11);
    for (const stop of STOPS) {
      for (let i = 0; i < 200; i++) {
        const o = makeOrder(i, rng, 1, stop);
        if (o.poutine) continue;
        for (const m of o.mods) {
          expect(["bun", "patty"]).not.toContain(m.kind);
          if (m.type === "add") expect(stop.pantry).toContain(m.kind);
        }
        expect(o.layers[0].kind).toBe("bun");
        expect(o.layers[o.layers.length - 1].kind).toBe("bun");
      }
    }
  });
});

describe("business mode", () => {
  it("premium food at high prices rates the same as standard at fair prices", () => {
    expect(ratingBonus({ quality: "premium", price: "high", menu: [] })).toBe(0);
    expect(ratingBonus({ quality: "budget", price: "fair", menu: [] })).toBeLessThan(0);
    expect(ratingBonus({ quality: "standard", price: "low", menu: [] })).toBeGreaterThan(0);
  });

  it("low prices and a good reputation bring more customers", () => {
    const plan = (price: "low" | "high") => ({ quality: "standard" as const, price, menu: [] });
    expect(trafficMult(plan("low"), 2, 4)).toBeGreaterThan(trafficMult(plan("high"), 2, 4));
    expect(trafficMult(plan("low"), 3, 4)).toBeGreaterThan(trafficMult(plan("low"), 1, 4));
  });

  it("keeps saved menus valid for the stop", () => {
    const plan = planFor(STOPS[0], { quality: "budget", price: "low", menu: ["Mesa Smash"] });
    expect(plan.menu.length).toBe(STOPS[0].menu.length);
    expect(plan.quality).toBe("budget");
  });

  it("moves reputation gradually", () => {
    const r = nextReputation(2, 6, [3, 3, 3]);
    expect(r.rep).toBeGreaterThan(2);
    expect(r.rep).toBeLessThan(3);
  });
});

describe("crowds", () => {
  it("foodies reward premium ingredients more than commuters do", () => {
    const plan = { quality: "premium" as const, price: "fair" as const, menu: [] };
    expect(ratingBonus(plan, "foodies")).toBeGreaterThan(ratingBonus(plan, "commuters"));
  });

  it("price-sensitive crowds thin out more at high prices", () => {
    const high = { quality: "standard" as const, price: "high" as const, menu: [] };
    expect(trafficMult(high, 2, 4, "party")).toBeLessThan(trafficMult(high, 2, 4, "foodies"));
  });

  it("gives every town a crowd", () => {
    for (const t of STOPS) expect(t.crowd).toBeTruthy();
  });
});

describe("events", () => {
  it("happen on their day and repeat", () => {
    const surf = EVENTS.find((e) => e.id === "surf")!;
    expect(eventOn(surf.town, surf.day)?.id).toBe("surf");
    expect(eventOn(surf.town, surf.day + 1)).toBeNull();
    expect(eventOn(surf.town, surf.day + surf.every)?.id).toBe("surf");
    expect(nextDay(surf, surf.day + 1)).toBe(surf.day + surf.every);
  });

  it("make a town busier with the event crowd and special", () => {
    const rodeo = EVENTS.find((e) => e.id === "rodeo")!;
    const t = townById(rodeo.town);
    const on = withEvent(t, rodeo);
    expect(on.customers).toBeGreaterThan(t.customers);
    expect(on.crowd).toBe(rodeo.crowd);
    expect(on.menu.some((r) => r.name === rodeo.special!.name)).toBe(true);
  });
});

describe("critics and popularity", () => {
  it("a great TV spot moves popularity more than a newspaper piece", () => {
    expect(popularityChange(3, "tv")).toBeGreaterThan(popularityChange(3, "paper"));
    expect(popularityChange(0, "paper")).toBeLessThan(0);
  });

  it("fame and good reviews raise what people will pay", () => {
    expect(willingnessToPay(80, 2.8)).toBeGreaterThan(willingnessToPay(10, 2));
    const high = { quality: "standard" as const, price: "high" as const, menu: [] };
    expect(ratingBonus(high, "families", willingnessToPay(90, 3))).toBeGreaterThan(ratingBonus(high, "families", 0));
  });

  it("writes a piece with a headline and quote", () => {
    const p = pieceFor(3, [], townById("summit"), null, seededRng(1));
    expect(p.headline.length).toBeGreaterThan(5);
    expect(p.pop).toBeGreaterThan(0);
  });
});
