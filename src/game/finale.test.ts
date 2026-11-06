import { afterEach, describe, expect, it } from "vitest";
import { askFor, asksFor, townAsks } from "./asks";
import { townBonus } from "./bonus";
import { menuFor } from "./business";
import { expectedCustomers } from "./day";
import { LAP, finishFinale, nextTripNo, noteShift, queueFinale, startNewTrip, syncTrip, tripNo, tripStats } from "./finale";
import { SIGNATURE, SIGNATURE_WEIGHT, signatureFirst, TOWN_ASKS } from "./identity";
import { LOOKS } from "./looks";
import { pickRecipe, seededRng } from "./menu";
import { freshSave, migrateSave, START_POPULARITY, type Save } from "./progress";
import { REGULAR_GOAL } from "./regulars";
import { award, bookDishes, bookTotals, DISH_FIVES, FIVE_STAR_SHIFT, noteFive, seedStamps, stampShift, stampSlots } from "./stamps";
import { EVENTS, eventOn, FINAL_TOWN, FINALE, STOPS, townById, withEvent, withLearned } from "./stops";
import { SHIFTS_TO_UNLOCK } from "./travel";
import { tripState } from "./tripstate";

const raw = (s: Save) => JSON.parse(JSON.stringify(s)) as Parameters<typeof migrateSave>[0];

afterEach(() => syncTrip(freshSave()));

describe("town identity (DESIGN §50)", () => {
  it("gives every town a signature dish from its own menu", () => {
    for (const t of STOPS) expect(t.menu.map((r) => r.name)).toContain(SIGNATURE[t.id]);
  });

  it("puts the signature first and keeps the rest in order", () => {
    const t = townById("portamber");
    const m = signatureFirst(t.menu, t.id).map((r) => r.name);
    expect(m[0]).toBe("Calzone");
    expect(m.slice(1)).toEqual(t.menu.map((r) => r.name).filter((n) => n !== "Calzone"));
  });

  it("orders the signature dish more in its town", () => {
    const t = townById("cedarfalls");
    const count = (sig: string | null) => {
      const rng = seededRng(7);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (pickRecipe(t.menu, 1, rng, sig).name === "Campfire Melt") n++;
      return n / 4000;
    };
    const plain = count(null);
    const signed = count("Campfire Melt");
    expect(signed).toBeGreaterThan(plain * 1.4);
    // With three dishes, weight w gives the signature w / (w + 2) of the orders.
    expect(signed).toBeCloseTo(SIGNATURE_WEIGHT / (SIGNATURE_WEIGHT + 2), 1);
  });

  it("draws each town's local ask from its own shortlist", () => {
    for (const t of STOPS) {
      const stop = withLearned(t, {});
      const pool = townAsks(stop, stop.menu);
      expect(pool.length).toBeGreaterThan(0);
      for (const id of pool) expect(asksFor(stop, stop.menu)).toContain(id);
      const own = TOWN_ASKS[t.id].filter((id) => asksFor(stop, stop.menu).includes(id));
      if (own.length) expect(pool).toEqual(own);
      for (let d = 1; d < 30; d++) expect(pool).toContain(askFor(stop, menuFor(stop, []), d, 10).id);
    }
    expect(townAsks(townById("sunvalley"), townById("sunvalley").menu)).toContain("handmade");
    expect(townAsks(townById("elkpass"), townById("elkpass").menu)).not.toContain("five");
  });
});

describe("the last night of the trip", () => {
  it("is on at Port Amber from the day after the road is done, until it's worked", () => {
    const s: Save = { ...freshSave(), day: 20 };
    expect(eventOn(FINAL_TOWN, 21)).toBeNull();
    queueFinale(s);
    expect(eventOn(FINAL_TOWN, 20)).toBeNull();
    expect(eventOn(FINAL_TOWN, 21)).toBe(FINALE);
    expect(eventOn(FINAL_TOWN, 25)).toBe(FINALE);
    expect(eventOn("larkvale", 21)?.id ?? null).not.toBe("finale");
    // It brings a crowd and a special, like the other events.
    const night = withEvent(townById(FINAL_TOWN), FINALE);
    expect(night.customers).toBeGreaterThan(townById(FINAL_TOWN).customers);
    expect(night.menu.at(-1)?.name).toBe("Harbor Lights");
    finishFinale(s);
    expect(eventOn(FINAL_TOWN, 25)).toBeNull();
    expect(s.finale?.done).toBe(true);
  });

  it("counts the trip's shifts and keeps its best order", () => {
    const s = freshSave();
    noteShift(s, { name: "Trailhead Classic", score: 80 }, "pinecrest");
    noteShift(s, { name: "Summit Smash", score: 92 }, "elkpass");
    noteShift(s, { name: "Campfire Melt", score: 85 }, "cedarfalls");
    noteShift(s, null, "cedarfalls");
    const st = tripStats(s);
    expect(st.shifts).toBe(4);
    expect(st.best).toEqual({ name: "Summit Smash", score: 92, town: "elkpass" });
  });
});

describe("a new trip", () => {
  const finished = (): Save => {
    const s = freshSave();
    s.passedTowns = STOPS.map((t) => t.id);
    s.bank = 4000;
    s.bonuses = ["bench"];
    s.found = ["bench"];
    s.looks = ["sage"];
    s.look = { ...s.look, paint: "sage" };
    s.popularity = 90;
    s.best = { pinecrest: 4.6 };
    s.trips = 1;
    s.stamps = { pinecrest: { road: 1 } };
    s.fives = { "Trailhead Classic": 3 };
    queueFinale(s);
    finishFinale(s);
    return s;
  };

  it("keeps the looks, the book and town bests, and resets the rest", () => {
    const s = finished();
    startNewTrip(s);
    expect(s.looks).toEqual(["sage"]);
    expect(s.look.paint).toBe("sage");
    expect(s.stamps).toEqual({ pinecrest: { road: 1 } });
    expect(s.fives).toEqual({ "Trailhead Classic": 3 });
    expect(s.best).toEqual({ pinecrest: 4.6 });
    expect(s.bank).toBe(0);
    expect(s.bonuses).toEqual([]);
    expect(s.found).toEqual([]);
    expect(s.finale).toBeNull();
    expect(s.worked).toBe(0);
  });

  it("after a finish is the next lap: known truck, busier towns, gold stamps", () => {
    const s = finished();
    expect(nextTripNo(s)).toBe(2);
    startNewTrip(s);
    expect(tripNo(s)).toBe(2);
    expect(s.popularity).toBe(LAP.popularity);
    expect(tripState.crowd).toBe(LAP.crowd);
    const input = { stop: townById("pinecrest"), popularity: 40, rating: 3, hidden: [] };
    const lap = expectedCustomers(input);
    syncTrip(freshSave());
    expect(lap).toBeGreaterThan(expectedCustomers(input));
    // A road opened again on the lap turns its stamp gold.
    s.shiftsIn.pinecrest = SHIFTS_TO_UNLOCK;
    expect(stampShift(s, { town: "pinecrest", ok: true, event: false, avg: 4 })).toEqual(["road"]);
    expect(s.stamps!.pinecrest.road).toBe(2);
  });

  it("before a finish is the same trip again", () => {
    const s = freshSave();
    s.popularity = 70;
    startNewTrip(s);
    expect(tripNo(s)).toBe(1);
    expect(s.popularity).toBe(START_POPULARITY);
    expect(tripState.crowd).toBe(1);
  });
});

describe("stamps", () => {
  it("come from the trip's progress and the shift itself", () => {
    const s = freshSave();
    s.shiftsIn = { summit: SHIFTS_TO_UNLOCK };
    s.found = [townBonus("summit")!.id];
    s.regulars = { summit: REGULAR_GOAL };
    const got = stampShift(s, { town: "summit", ok: true, event: true, avg: FIVE_STAR_SHIFT });
    expect(got.sort()).toEqual(["event", "five", "great", "regular", "road"]);
    expect(stampShift(s, { town: "summit", ok: true, event: true, avg: 5 })).toEqual([]);
    // A shift that didn't count earns neither the event nor the five stars.
    expect(stampShift(s, { town: "pinecrest", ok: false, event: false, avg: 5 })).toEqual([]);
  });

  it("only towns with an event (or Port Amber's last night) have the event stamp", () => {
    expect(stampSlots("summit")).toContain("event");
    expect(stampSlots(FINAL_TOWN)).toContain("event");
    expect(stampSlots("pinecrest")).not.toContain("event");
    expect(stampSlots("pinecrest")).toHaveLength(4);
    const withEvents = new Set([...EVENTS.map((e) => e.town), FINAL_TOWN]);
    expect(bookTotals({}).slots).toBe(STOPS.length * 4 + withEvents.size);
  });

  it("never lose gold", () => {
    const book = { harbor: { road: 2 as const } };
    expect(award(book, "harbor", ["road", "five"], 1)).toEqual(["five"]);
    expect(book.harbor.road).toBe(2);
  });

  it("count dishes served at five stars", () => {
    const s = freshSave();
    for (let i = 0; i < DISH_FIVES; i++) noteFive(s, "Caprese", 5);
    noteFive(s, "Caprese", 4);
    noteFive(s, "Tuna Melt", 5);
    expect(s.fives).toEqual({ Caprese: DISH_FIVES, "Tuna Melt": 1 });
    expect(bookTotals(s).dishes).toBe(1);
    expect(bookDishes().map((r) => r.name)).toContain("Harbor Lights");
  });
});

describe("saves from before the trip's end", () => {
  it("still on the trip that reached Port Amber: trip 1, and the last night is offered", () => {
    const old = raw({ ...freshSave(), trips: 1, day: 30, passedTowns: ["pinecrest", FINAL_TOWN], shiftsIn: { pinecrest: 3, [FINAL_TOWN]: 1 } });
    for (const k of ["tripNo", "finale", "stamps", "fives"]) delete (old as Record<string, unknown>)[k];
    const s = migrateSave(old);
    expect(s.version).toBe(2);
    expect(tripNo(s)).toBe(1);
    expect(s.finale).toEqual({ from: 30, done: false });
    expect(s.stamps?.pinecrest?.road).toBe(1);
  });

  it("started over after reaching it: the next trip", () => {
    const old = raw({ ...freshSave(), trips: 1 });
    for (const k of ["tripNo", "finale", "stamps", "fives"]) delete (old as Record<string, unknown>)[k];
    const s = migrateSave(old);
    expect(tripNo(s)).toBe(2);
    expect(s.finale).toBeNull();
  });

  it("seeds the book from town bests too", () => {
    const book = seedStamps({ ...freshSave(), best: { harbor: 4.9, summit: 4.5 } });
    expect(book.harbor?.five).toBe(1);
    expect(book.summit?.five).toBeUndefined();
  });

  it("round-trips the new fields", () => {
    const s = freshSave();
    s.tripNo = 2;
    s.finale = { from: 3, done: true };
    s.stamps = { harbor: { cut: 1 } as never };
    s.fives = { Caprese: 2 };
    const back = migrateSave(raw(s));
    expect(back.tripNo).toBe(2);
    expect(back.finale).toEqual({ from: 3, done: true });
    expect(back.fives).toEqual({ Caprese: 2 });
  });
});

describe("the Garage, priced for a trip", () => {
  const paid = LOOKS.filter((l) => l.price > 0);
  it("asks about $15,000 for all but the absurd items", () => {
    const most = paid.filter((l) => !l.absurd).reduce((n, l) => n + l.price, 0);
    expect(most).toBeGreaterThan(13500);
    expect(most).toBeLessThan(16500);
  });
  it("keeps everyday looks under $1,500, grand ones $3,000 to $8,000, and two or three absurd ones for the next lap", () => {
    for (const l of paid.filter((x) => !x.grand)) expect(l.price).toBeLessThan(1500);
    for (const l of paid.filter((x) => x.grand && !x.absurd)) {
      expect(l.price).toBeGreaterThanOrEqual(3000);
      expect(l.price).toBeLessThanOrEqual(8000);
    }
    const absurd = paid.filter((x) => x.absurd);
    expect(absurd.length).toBeGreaterThanOrEqual(2);
    expect(absurd.length).toBeLessThanOrEqual(3);
    for (const l of absurd) {
      expect(l.grand).toBe(true);
      expect(l.price).toBeGreaterThanOrEqual(10000);
      expect(l.price).toBeLessThanOrEqual(15000);
    }
  });
});
