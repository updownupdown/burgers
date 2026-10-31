import { describe, expect, it } from "vitest";
import { defaultPlan } from "./business";
import { expectedCustomers, gearBlocker, GEAR, gearById, projectShift, rangeMiles, rangeUnits, runningCost, RUNNING_COST, sleep, solarSaving } from "./day";
import { distance, MILES_PER_UNIT } from "./travel";
import { STOPS, townById } from "./stops";

describe("running cost and solar", () => {
  it("costs ten a night, less what the panels cover", () => {
    expect(runningCost([])).toBe(RUNNING_COST);
    expect(solarSaving(["solar1"])).toBe(5);
    expect(runningCost(["solar1", "solar2"])).toBe(2);
  });

  it("is charged when the truck sleeps, which turns the day", () => {
    const s = { day: 4, time: "evening" as const, bank: 50, driven: 12, gear: ["solar1" as const] };
    const n = sleep(s);
    expect(n).toEqual({ charge: 10, saving: 5, paid: 5, waived: 0, day: 4 });
    expect(s).toEqual({ day: 5, time: "morning", bank: 45, driven: 0, gear: ["solar1"] });
  });

  it("waives what an empty tin can't pay, and never goes negative", () => {
    const s = { day: 1, time: "evening" as const, bank: 3, driven: 0, gear: [] };
    const n = sleep(s);
    expect(n.paid).toBe(3);
    expect(n.waived).toBe(7);
    expect(s.bank).toBe(0);
  });
});

describe("range", () => {
  it("grows with the engine and fits the roads it promises", () => {
    expect(rangeMiles([])).toBe(100);
    expect(rangeMiles(["range1"])).toBe(175);
    expect(rangeMiles(["range1", "range2"])).toBe(250);
    // Every town road fits the base range; the two highways need the tune-up.
    for (const t of STOPS) for (const r of t.roads) {
      const mi = distance(t.id, r) * MILES_PER_UNIT;
      const highway = townById(t.id).region !== townById(r).region;
      expect(distance(t.id, r) <= rangeUnits([])).toBe(!highway);
      if (highway) expect(distance(t.id, r) <= rangeUnits(["range1"])).toBe(true);
      expect(mi).toBeGreaterThan(40);
    }
  });
});

describe("the supply yard", () => {
  it("sells each part in one capital, in order, for cash", () => {
    const panel = gearById("solar1");
    expect(gearBlocker(panel, [], "summit", 100)).toBeNull();
    expect(gearBlocker(panel, [], "pinecrest", 100)).toBe("Not sold here");
    expect(gearBlocker(panel, [], "summit", 10)).toBe("$50 short");
    expect(gearBlocker(panel, ["solar1"], "summit", 100)).toBe("Fitted");
    expect(gearBlocker(gearById("solar2"), [], "harbor", 500)).toMatch(/Needs the roof solar panel/);
    expect(GEAR.every((g) => STOPS.some((t) => t.id === g.soldAt && t.capital))).toBe(true);
  });
});

describe("projecting a shift", () => {
  const stop = townById("pinecrest");
  const base = { stop, popularity: 10, ads: 0 as const, rep: 2, upgrades: [], gear: [] };

  it("expects a quiet first day for an unknown truck", () => {
    expect(expectedCustomers({ ...base, plan: null })).toBeLessThan(stop.customers);
    expect(expectedCustomers({ ...base, plan: null, popularity: 80 })).toBeGreaterThan(stop.customers);
  });

  it("nets takings and tips less costs, with a range around it", () => {
    const p = projectShift({ ...base, plan: null });
    expect(p.ingredients).toBe(0);
    expect(p.net).toBeCloseTo(p.takings + p.tips - p.running);
    expect(p.lo).toBeLessThan(p.net);
    expect(p.hi).toBeGreaterThan(p.net);
    const biz = projectShift({ ...base, plan: defaultPlan(stop) });
    expect(biz.ingredients).toBeGreaterThan(0);
    expect(biz.net).toBeLessThan(p.net);
    const premium = projectShift({ ...base, plan: { ...defaultPlan(stop), quality: "premium" } });
    expect(premium.perOrder).toBeGreaterThan(biz.perOrder);
    const solar = projectShift({ ...base, plan: null, gear: ["solar1"] });
    expect(solar.net).toBeCloseTo(p.net + 5);
  });
});
