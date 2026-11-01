import { describe, expect, it } from "vitest";
import { BONUSES, greatShift, migrateBonuses, townBonus } from "./bonus";
import { buyBonus, buyLook, readyToBuy, wearLook } from "./garage";
import { DEFAULT_LOOK, LOOKS, SLOTS } from "./looks";
import { roadOrder } from "./devmode";
import { expectedCustomers, RANGE_MI, rangeUnits, sleep } from "./day";
import { migrateSave, freshSave, START_POPULARITY } from "./progress";
import { arrivalGap, clockAt, crowdShare, DEFAULT_SHIFT, shiftSeconds, validShift } from "./shift";
import { distance } from "./travel";
import { STOPS, townById } from "./stops";

describe("sleeping", () => {
  it("turns the day and resets the night's driving", () => {
    const s = { day: 4, time: "evening" as const, driven: 12 };
    expect(sleep(s)).toEqual({ day: 4 });
    expect(s).toEqual({ day: 5, time: "morning", driven: 0 });
  });
});

describe("range", () => {
  it("fits any single road, highways included", () => {
    expect(RANGE_MI).toBe(175);
    for (const t of STOPS) for (const r of t.roads) expect(distance(t.id, r)).toBeLessThanOrEqual(rangeUnits());
  });
});

describe("who turns up", () => {
  const stop = townById("pinecrest");
  const base = { stop, popularity: START_POPULARITY, rep: 2, hidden: [] as string[] };

  it("expects a modest first day and a bigger crowd as the truck gets known", () => {
    const first = expectedCustomers(base);
    expect(first).toBeGreaterThanOrEqual(5);
    expect(first).toBeLessThan(stop.customers);
    expect(expectedCustomers({ ...base, popularity: 90, rep: 2.8 })).toBeGreaterThan(stop.customers);
  });

  it("brings fewer people to a short menu and more to a long window", () => {
    const all = expectedCustomers({ ...base, popularity: 70 });
    const two = expectedCustomers({ ...base, popularity: 70, hidden: stop.menu.slice(2).map((r) => r.name) });
    expect(two).toBeLessThan(all);
    expect(expectedCustomers({ ...base, popularity: 70, shift: { start: 9, end: 16 } })).toBeGreaterThan(all);
    expect(expectedCustomers({ ...base, popularity: 70, shift: { start: 12, end: 13 } })).toBeLessThan(all);
  });

  it("spaces people out on calmer pacing, and the sandwich board pulls more", () => {
    expect(expectedCustomers({ ...base, popularity: 70, pacing: "chill" })).toBeLessThan(expectedCustomers({ ...base, popularity: 70 }));
    expect(expectedCustomers({ ...base, popularity: 70, bonus: "board" })).toBeGreaterThan(expectedCustomers({ ...base, popularity: 70 }));
  });
});

describe("the shift window", () => {
  it("defaults to the lunch rush and stays inside the day", () => {
    expect(validShift(null)).toEqual(DEFAULT_SHIFT);
    expect(validShift({ start: 5, end: 30 })).toEqual({ start: 9, end: 17 });
    expect(validShift({ start: 14, end: 12 })).toEqual({ start: 13, end: 17 });
    expect(validShift({ start: 11, end: 13 })).toEqual({ start: 11, end: 15 });
    expect(crowdShare(DEFAULT_SHIFT)).toBeCloseTo(1);
  });

  it("plays a quarter of the town's shift per hour and runs the clock across it", () => {
    expect(shiftSeconds(DEFAULT_SHIFT, 180)).toBe(180);
    expect(shiftSeconds({ start: 9, end: 15 }, 180)).toBe(270);
    expect(clockAt(0, DEFAULT_SHIFT, 180)).toBe(11);
    expect(clockAt(90, DEFAULT_SHIFT, 180)).toBe(13);
  });

  it("brings people closer together at the noon peak", () => {
    expect(arrivalGap(12.5, DEFAULT_SHIFT, 180, 12)).toBeLessThan(arrivalGap(11.2, DEFAULT_SHIFT, 180, 12));
    // Over the window, the gaps add up to roughly the planned crowd.
    let t = 0;
    let n = 0;
    while (t < 180) {
      t += arrivalGap(clockAt(t, DEFAULT_SHIFT, 180), DEFAULT_SHIFT, 180, 12);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(14);
  });
});

describe("bonuses", () => {
  it("one per town, in road order, getting dearer down the road", () => {
    expect(new Set(BONUSES.map((b) => b.town)).size).toBe(STOPS.length);
    for (const t of STOPS) expect(townBonus(t.id)).toBeDefined();
    const order = roadOrder();
    const byRoad = [...BONUSES].sort((a, b) => order.indexOf(a.town) - order.indexOf(b.town));
    for (let i = 1; i < byRoad.length; i++) expect(byRoad[i].price).toBeGreaterThanOrEqual(byRoad[i - 1].price);
    expect(townBonus("pinecrest")!.id).toBe("bench");
  });

  it("great shifts ask for stars and most orders served", () => {
    expect(greatShift([3, 3, 2, 3, 2, 3], 6, 6)).toBe(true);
    expect(greatShift([3, 3, 2, 3, 2, 3], 6, 8)).toBe(false);
    expect(greatShift([2, 2, 2, 2, 2, 3], 6, 6)).toBe(false);
    expect(greatShift([3, 3, 3], 3, 3)).toBe(false);
  });

  it("are bought only once unlocked, and only with enough savings", () => {
    const s = freshSave();
    s.bank = 1000;
    expect(buyBonus(s, "bench")).toBe(false);
    s.found.push("bench");
    s.bank = 10;
    expect(buyBonus(s, "bench")).toBe(false);
    expect(readyToBuy(s)).toBe(0);
    s.bank = 100;
    expect(readyToBuy(s)).toBe(1);
    expect(buyBonus(s, "bench")).toBe(true);
    expect(s.bank).toBe(100 - townBonus("pinecrest")!.price);
    expect(s.bonuses).toEqual(["bench"]);
    expect(buyBonus(s, "bench")).toBe(false);
  });

  it("keeps old kitchen upgrades as bonuses", () => {
    expect(migrateBonuses(["bench", "tipjar", "nonsense", "bench"])).toEqual(["bench", "tipjar"]);
  });
});

describe("looks", () => {
  it("every slot has a free default and items unique by id", () => {
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    for (const s of SLOTS) expect(LOOKS.find((l) => l.id === DEFAULT_LOOK[s.id])!.price).toBe(0);
  });

  it("are bought with savings, worn on purchase, and souvenirs wait for their town", () => {
    const s = freshSave();
    s.bank = 500;
    expect(buyLook(s, "sage")).toBe(true);
    expect(s.look.paint).toBe("sage");
    expect(s.bank).toBe(350);
    expect(wearLook(s, "coral")).toBe(true);
    expect(s.look.paint).toBe("coral");
    expect(wearLook(s, "dusk")).toBe(false);
    expect(buyLook(s, "canoe")).toBe(false);
    s.shiftsIn.cedarfalls = 1;
    s.bank = 500;
    expect(buyLook(s, "canoe")).toBe(true);
    expect(buyLook(s, "airship")).toBe(false);
  });
});

describe("old saves", () => {
  it("drop business mode, keep their money as savings, and keep upgrades and the menu", () => {
    const old = { ...freshSave(), bank: 300, gear: ["solar1"], biz: true, simplePlan: true, ads: 1, offer: ["tipjar"], upgrades: ["bench", "turbo"], plan: { quality: "premium", price: "high", menu: ["Pine Classic"] } } as unknown as Parameters<typeof migrateSave>[0];
    delete (old as Record<string, unknown>).bonuses;
    delete (old as Record<string, unknown>).hidden;
    const s = migrateSave(old) as unknown as Record<string, unknown>;
    for (const k of ["gear", "biz", "simplePlan", "ads", "offer", "upgrades", "plan"]) expect(s[k]).toBeUndefined();
    expect(s.bank).toBe(300);
    expect(s.bonuses).toEqual(["bench", "turbo"]);
    expect(s.found).toEqual(["bench", "turbo"]);
    expect(s.look).toEqual(DEFAULT_LOOK);
    expect(s.shift).toEqual(DEFAULT_SHIFT);
    expect((s.hidden as string[]).length).toBeGreaterThan(0);
  });
});

describe("the menu through the day", () => {
  it("lets every burger be ordered from opening, the later ones just less often", async () => {
    const { pickRecipe, recipeWeight } = await import("./menu");
    const { STOPS } = await import("./stops");
    const desert = STOPS.find((s) => s.menu.some((r) => r.from))!;
    const late = desert.menu.find((r) => r.from)!;
    expect(recipeWeight(late, 0)).toBeGreaterThan(0);
    expect(recipeWeight(late, 0)).toBeLessThan(recipeWeight(late, 0.9));
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickRecipe(desert.menu, 0, rng).name);
    expect(seen.size).toBe(desert.menu.length);
  });
});
