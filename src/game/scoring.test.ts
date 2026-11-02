import { describe, expect, it } from "vitest";
import { menuFactor, menuFor, ratingFactor } from "./business";
import { pieceFor, popularityChange } from "./press";
import { applyMods, makeOrder, orderFromRecipe, seededRng, sidesOrder } from "./menu";
import { EVENTS, eventOn, nextDay, STOPS, townById, withEvent } from "./stops";
import { passed } from "./progress";
import { alignLayers, layerQuality, payout, quickSauceStroke, SAUCE_BAND, sauceCoverage, sauceVerdict, scorePlate } from "./scoring";
import { FRIES_PERFECT, FRIES_ZONE, FRY_RATE } from "./cooking";
import type { Kind, Layer, Order, Piece, Plate } from "./types";
import { BREADS, DONENESS_TARGET, isSauce, newPiece, PROTEINS } from "./types";

function piece(kind: Kind, cook: [number, number] = [0, 0]): Piece {
  const p = newPiece(kind);
  p.cook = cook;
  if (kind === "ketchup" || kind === "mustard") {
    p.stroke = [
      { x: -0.6, z: -0.45 },
      { x: 0.6, z: -0.3 },
      { x: -0.6, z: -0.05 },
      { x: 0.6, z: 0.15 },
      { x: -0.6, z: 0.4 },
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
    { kind: "patty" },
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

describe("sauce coverage", () => {
  it("scores a zigzag across the patty as perfect", async () => {
    const { sauceCoverage, sauceVerdict } = await import("./scoring");
    const cov = sauceCoverage(piece("ketchup").stroke);
    expect(sauceVerdict(cov).word).toBe("perfect");
  });
  it("calls a dab stingy and a flood drowning", async () => {
    const { sauceCoverage, sauceVerdict } = await import("./scoring");
    expect(sauceVerdict(sauceCoverage([{ x: 0, z: 0 }, { x: 0.2, z: 0 }])).word).toBe("stingy");
    const flood: { x: number; z: number }[] = [];
    for (let z = -0.9; z <= 0.9; z += 0.12) flood.push({ x: -0.9, z }, { x: 0.9, z });
    expect(sauceVerdict(sauceCoverage(flood)).word).toBe("drowning");
  });
});

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
  it("gives five stars to a perfect burger", () => {
    const r = scorePlate(classic, perfectPlate());
    expect(r.score).toBe(100);
    expect(r.stars).toBe(5);
    expect(r.notes).toEqual([]);
  });

  it("scores an empty plate as zero-ish", () => {
    const r = scorePlate(classic, { layers: [], fries: null, drink: null });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
  });

  it("penalises a burnt patty and says so", () => {
    const p = perfectPlate();
    p.layers[1].piece.cook = [1.2, 1.2];
    const r = scorePlate(classic, p);
    expect(r.score).toBeLessThan(90);
    expect(r.notes).toContain("burnt patty");
  });

  it("notices a missing top bun", () => {
    const p = perfectPlate();
    p.layers.pop();
    const r = scorePlate(classic, p);
    expect(r.notes.some((n) => n.includes("missing bun"))).toBe(true);
    expect(r.stars).toBeLessThan(5);
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
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt: 0.6 };
    plate.drink = { flavor: "cola", fill: 0.9, size: "M" };
    expect(scorePlate(order, plate).notes).toContain("no lid");
    plate.drink = { flavor: "cola", fill: 0.9, size: "M", lid: true };
    expect(scorePlate(order, plate).score).toBe(100);
    plate.drink = { flavor: "pine", fill: 0.9, size: "M" };
    expect(scorePlate(order, plate).notes).toContain("wrong drink");
  });

  it("takes about half a minute in the oil to cook fries perfectly", () => {
    // Seconds in the oil at the base fry rate (no upgrades).
    expect(FRIES_ZONE.done / FRY_RATE).toBeCloseTo(20, 0);
    expect(FRIES_PERFECT / FRY_RATE).toBeCloseTo(29, 0);
    expect(FRIES_ZONE.over / FRY_RATE).toBeCloseTo(38, 0);
  });

  it("scores fries by zone and by where in the zone", () => {
    const q = (cook: number) => {
      const plate = perfectPlate();
      plate.fries = { cook, size: "S", fill: 1, salt: 0.6 };
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

  it("scores the salt level: a little short, on the line, too salty", () => {
    const salted = (salt: number) => {
      const plate = perfectPlate();
      plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt };
      return scorePlate({ ...classic, fries: true }, plate);
    };
    expect(salted(0.6).sides).toBe(1);
    expect(salted(0.2).notes).toContain("fries could use more salt");
    expect(salted(1.1).notes).toContain("fries too salty");
    expect(salted(1.1).sides).toBeLessThan(salted(0.2).sides);
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
    plate.fries = { cook: FRIES_PERFECT, size: "S", fill: 1, salt: 0.6 };
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
    const drink = { flavor: "cola" as const, fill: 0.9, size: "M" as const, lid: true };
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
      if (!o.layers.length) {
        expect(o.fries || !!o.drink).toBe(true);
        continue;
      }
      // (A tostada's shell is a corn tortilla fried at the fryer.)
      for (const l of o.layers) if (!isSauce(l.kind) && l.kind !== "tostada") expect(stop.pantry).toContain(l.kind);
      // The coast's paninis start and end with bread (an open-faced toast only starts with it);
      // Red Rock's dishes start with a tortilla or a tostada shell.
      if (stop.comal) {
        expect(["corn", "flour", "tostada"]).toContain(o.layers[0].kind);
        continue;
      }
      // Orchard Isle's flatbreads and calzones start with the dough.
      if (stop.oven) {
        expect(o.layers[0].kind).toBe("dough");
        continue;
      }
      const bread = stop.press ? [...BREADS] : ["bun"];
      expect(bread).toContain(o.layers[0].kind);
      if (o.name !== "Avocado Toast") expect(bread).toContain(o.layers[o.layers.length - 1].kind);
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
    const plain = orderFromRecipe(1, recipe, false, null);
    const extra = orderFromRecipe(1, recipe, false, null, [{ type: "extra", kind: "pickle" }]);
    expect(plain.layers.find((l) => l.kind === "pickle")?.count).toBe(3);
    expect(extra.layers.filter((l) => l.kind === "pickle")).toHaveLength(1);
    expect(extra.layers.find((l) => l.kind === "pickle")?.count).toBe(5);
    expect(extra.price).toBeGreaterThan(plain.price);
  });
});

describe("poutine", () => {
  it("turns up now and then once the shift is going, never in the first orders", () => {
    const rng = seededRng(5);
    const cedar = townById("cedarfalls");
    const early = Array.from({ length: 200 }, (_, i) => makeOrder(i, rng, 0.1, cedar));
    expect(early.some((o) => o.poutine)).toBe(false);
    const later = Array.from({ length: 400 }, (_, i) => makeOrder(i, rng, 0.6, cedar)).filter((o) => o.poutine).length;
    expect(later).toBeGreaterThan(20);
    expect(later).toBeLessThan(90);
  });

  it("isn't on the menu in the first towns, before the curds are on the counter", () => {
    const rng = seededRng(5);
    for (const id of ["pinecrest", "elkpass"]) expect(Array.from({ length: 300 }, (_, i) => makeOrder(i, rng, 0.8, townById(id))).some((o) => o.poutine)).toBe(false);
  });
});

describe("local drinks", () => {
  it("pours each area's own drinks beside the house three", () => {
    const rng = seededRng(9);
    const drinks = (id: string) => new Set(Array.from({ length: 400 }, (_, i) => makeOrder(i, rng, 0.8, townById(id)).drink).filter((d) => d));
    expect([...drinks("pinecrest")].sort()).toEqual(["cola", "pine", "pink", "tea", "water"]);
    expect(drinks("saltwater").has("cucumber")).toBe(true);
    expect(drinks("saltwater").has("pine")).toBe(false);
    expect(drinks("cactus").has("hibiscus")).toBe(true);
    expect(drinks("larkvale").has("cider")).toBe(true);
  });
});

describe("patties", () => {
  it("are always wanted medium; rare and well done are acceptable but not ideal", () => {
    const at = (t: number) => {
      const p = perfectPlate();
      p.layers[1].piece.cook = [t, t];
      return scorePlate(classic, p);
    };
    expect(at(DONENESS_TARGET.medium).score).toBe(100);
    for (const t of [DONENESS_TARGET.rare, DONENESS_TARGET.well]) {
      const r = at(t);
      expect(r.score).toBeLessThan(100);
      expect(r.score).toBeGreaterThan(80);
    }
    expect(at(DONENESS_TARGET.rare).notes).toContain("patty a bit rare");
    expect(at(DONENESS_TARGET.well).notes).toContain("patty a bit well done");
    expect(at(0.05).notes).toContain("raw patty");
    expect(at(0.97).notes).toContain("burnt patty");
    expect(at(0.97).score).toBeLessThan(at(DONENESS_TARGET.well).score);
  });
  it("never come with a doneness on the order", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 200; i++) for (const l of makeOrder(i, rng, 0.7, STOPS[0]).layers) expect(Object.keys(l)).not.toContain("doneness");
  });
});

describe("smash burgers", () => {
  it("wants smashed patties when the recipe says so", () => {
    const order: Order = { ...classic, layers: classic.layers.map((l) => (l.kind === "patty" ? { ...l, smashed: true } : l)) };
    const p = perfectPlate();
    expect(scorePlate(order, p).notes).toContain("wanted it smashed");
    p.layers[1].piece.smashed = true;
    expect(scorePlate(order, p).score).toBe(100);
  });
});

describe("melted cheese", () => {
  it("only asks for melting on cheese that sits right on a patty", () => {
    const recipe = STOPS.flatMap((s) => s.menu).find((r) => r.name === "Lumberjack Stack")!;
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
  it("needs most customers served at two and a half stars or better to move on", () => {
    expect(passed(2.8, 6, 9)).toBe(true);
    expect(passed(2.5, 5, 9)).toBe(true);
    expect(passed(2.2, 9, 9)).toBe(false);
    expect(passed(5, 4, 9)).toBe(false);
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
        if (!o.layers.length) continue;
        for (const m of o.mods) {
          if (m.type !== "toast") expect(["bun", "patty", ...BREADS, ...PROTEINS, "corn", "flour", "tostada", "dough"]).not.toContain(m.kind);
          if (m.type === "add") expect(stop.pantry).toContain(m.kind);
        }
        if (stop.comal) {
          expect(["corn", "flour", "tostada"]).toContain(o.layers[0].kind);
          continue;
        }
        if (stop.oven) {
          expect(o.layers[0].kind).toBe("dough");
          continue;
        }
        const bread = stop.press ? [...BREADS] : ["bun"];
        expect(bread).toContain(o.layers[0].kind);
        if (o.name !== "Avocado Toast") expect(bread).toContain(o.layers[o.layers.length - 1].kind);
      }
    }
  });
});

describe("the crowd", () => {
  it("draws more people to a longer menu and a better rating", () => {
    expect(menuFactor(2)).toBeCloseTo(0.8);
    expect(menuFactor(4)).toBeCloseTo(1);
    expect(menuFactor(6)).toBeCloseTo(1.1);
    expect(menuFactor(9)).toBeCloseTo(1.1);
    expect(ratingFactor(5)).toBeGreaterThan(ratingFactor(4));
    expect(ratingFactor(4)).toBeCloseTo(1.05);
    expect(ratingFactor(3)).toBeLessThan(1);
    expect(ratingFactor(1)).toBeCloseTo(ratingFactor(2));
  });

  it("never lets the menu drop below two recipes", () => {
    const t = townById("summit");
    expect(menuFor(t, []).length).toBe(t.menu.length);
    expect(menuFor(t, [t.menu[0].name]).length).toBe(t.menu.length - 1);
    expect(menuFor(t, t.menu.map((r) => r.name)).length).toBe(t.menu.length);
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

  it("make a town busier with the event crowd", () => {
    const rodeo = EVENTS.find((e) => e.id === "rodeo")!;
    expect(rodeo.town).toBe("cactus");
    const t = townById(rodeo.town);
    const on = withEvent(t, rodeo);
    expect(on.customers).toBeGreaterThan(t.customers);
    expect(on.crowd).toBe(rodeo.crowd);
    // The rodeo's special, a platter of street tacos, joins the menu for the day.
    expect(on.menu.slice(0, t.menu.length)).toEqual(t.menu);
    expect(on.menu[on.menu.length - 1].name).toBe("Rodeo Platter");
  });

  it("hold a harvest fair at Larkvale", () => {
    const fair = EVENTS.find((e) => e.id === "harvest")!;
    expect(fair.town).toBe("larkvale");
    expect(eventOn("larkvale", fair.day)?.id).toBe("harvest");
  });
});

describe("critics and popularity", () => {
  it("a great TV spot moves popularity more than a newspaper piece", () => {
    expect(popularityChange(5, "tv")).toBeGreaterThan(popularityChange(5, "paper"));
    expect(popularityChange(4, "paper")).toBeGreaterThan(0);
    expect(popularityChange(3, "paper")).toBeLessThan(0);
    expect(popularityChange(1, "paper")).toBeLessThan(popularityChange(2, "paper"));
  });

  it("writes a piece with a headline and quote", () => {
    const p = pieceFor(5, [], townById("summit"), null, seededRng(1));
    expect(p.headline.length).toBeGreaterThan(5);
    expect(p.pop).toBeGreaterThan(0);
  });
});

describe("drinks-only and fries-only customers", () => {
  const drinkOnly: Order = { ...classic, name: "Road Cola", price: 2, layers: [], fries: false, drink: "cola", drinkSize: "M", ice: null };
  const goodDrink = { flavor: "cola" as const, fill: 0.9, size: "M" as const, lid: true };
  const friesOnly: Order = { ...classic, name: "Fries", price: 3, layers: [], fries: true, friesSize: "M", drink: null };
  const goodFries = { cook: FRIES_PERFECT, size: "M" as const, fill: 1, salt: 0.6 };

  it("turn up rarely once the shift is going, never in the first orders", () => {
    const rng = seededRng(11);
    const sidesOnly = (o: Order) => !o.layers.length && !o.poutine;
    const early = Array.from({ length: 200 }, (_, i) => makeOrder(i, rng, 0.1, STOPS[0]));
    expect(early.some(sidesOnly)).toBe(false);
    const later = Array.from({ length: 1000 }, (_, i) => makeOrder(i, rng, 0.6, STOPS[0])).filter(sidesOnly);
    expect(later.length).toBeGreaterThan(20);
    expect(later.length).toBeLessThan(110);
    for (const o of later) {
      expect(o.fries || !!o.drink).toBe(true);
      expect(o.price).toBeGreaterThan(0);
    }
  });

  it("names and prices the order after what's in it", () => {
    const rng = seededRng(3);
    const orders = Array.from({ length: 60 }, (_, i) => sidesOrder(i, rng));
    expect(orders.some((o) => o.drink && !o.fries)).toBe(true);
    expect(orders.some((o) => o.fries && !o.drink)).toBe(true);
    for (const o of orders) expect(o.name).toBe(o.fries && o.drink ? "Fries & a drink" : o.fries ? "Fries" : o.name);
  });

  it("scores the drink or the fries as the whole order", () => {
    expect(scorePlate(drinkOnly, { layers: [], fries: null, drink: goodDrink }).stars).toBe(5);
    expect(scorePlate(friesOnly, { layers: [], fries: goodFries, drink: null }).stars).toBe(5);
    const missing = scorePlate(drinkOnly, { layers: [], fries: goodFries, drink: null });
    expect(missing.notes).toContain("forgot the drink");
    expect(missing.faulty).toBe(true);
  });

  it("calls out a burger nobody ordered", () => {
    const r = scorePlate(drinkOnly, { ...perfectPlate(), drink: goodDrink });
    expect(r.notes).toContain("didn't order a burger");
    expect(r.score).toBeLessThan(90);
    expect(r.faulty).toBe(false);
  });
});

describe("grill marks, flips and eggs", () => {
  const ord = (layers: Order["layers"]): Order => ({ id: 1, name: "T", price: 9, mods: [], layers, fries: false, drink: null, friesSize: "S", drinkSize: "M" });
  const lay = (p: Piece) => ({ piece: p, offX: 0, offZ: 0 });
  const bun = () => newPiece("bun");
  it("adds a little for a patty with grill marks", () => {
    const o = ord([{ kind: "bun" }, { kind: "patty" }, { kind: "bun" }]);
    const plain = newPiece("patty");
    plain.cook = [0.55, 0.55];
    const marked = newPiece("patty");
    marked.cook = [0.55, 0.55];
    marked.marks = [0.8, 0];
    const a = scorePlate(o, { layers: [lay(bun()), lay(plain), lay(bun())], fries: null, drink: null });
    const b = scorePlate(o, { layers: [lay(bun()), lay(marked), lay(bun())], fries: null, drink: null });
    expect(b.score).toBeGreaterThanOrEqual(a.score);
    expect(b.perks).toContain("grill marks");
  });
  it("chars a patty face left down too long, even when the middle is fine", () => {
    const p = newPiece("patty");
    p.cook = [1.1, 0.1];
    expect(layerQuality({ kind: "patty" }, p)[1]).toBe("charred on one side");
  });
  it("wants eggs sunny side up or over easy, as the menu says", () => {
    const e = newPiece("egg");
    e.cook = [0.45, 0.15];
    expect(layerQuality({ kind: "egg" }, e)[0]).toBe(1);
    expect(layerQuality({ kind: "egg", flipped: true }, e)[1]).toBe("wanted the egg over easy");
    e.flips = 1;
    expect(layerQuality({ kind: "egg", flipped: true }, e)[0]).toBe(1);
  });
});

describe("quick squeeze", () => {
  it("covers enough for 'a bit more', never Perfect", () => {
    const cov = sauceCoverage(quickSauceStroke());
    expect(cov).toBeGreaterThanOrEqual(SAUCE_BAND.stingy);
    expect(cov).toBeLessThan(SAUCE_BAND.lo);
    expect(sauceVerdict(cov).word).toBe("light");
  });
});
