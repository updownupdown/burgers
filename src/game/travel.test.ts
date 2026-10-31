import { describe, expect, it } from "vitest";
import { rangeUnits } from "./day";
import { freshSave, migrateSave, passTown, type Save } from "./progress";
import { STOPS } from "./stops";
import {
  applyTrip,
  canAfford,
  distance,
  gasCost,
  GAS_PER_UNIT,
  MIN_GAS,
  neighbours,
  openedBy,
  planTrip,
  SHIFTS_TO_UNLOCK,
  shortestPath,
  START_BANK,
  unlockProgress,
} from "./travel";

const ALL = STOPS.map((t) => t.id);
const BASE = rangeUnits([]);
const morning = { time: "morning" as const, range: BASE, driven: 0 };
const evening = { time: "evening" as const, range: BASE, driven: 0 };

describe("roads", () => {
  it("run both ways", () => {
    expect(neighbours("pinecrest")).toEqual(["elkpass", "cedarfalls"]);
    expect(neighbours("elkpass")).toContain("pinecrest");
    expect(neighbours("summit")).toEqual(expect.arrayContaining(["elkpass", "cedarfalls", "saltwater"]));
    expect(neighbours("sunvalley")).toEqual(expect.arrayContaining(["cactus", "dustbowl"]));
  });

  it("measure distance symmetrically in map units", () => {
    expect(distance("pinecrest", "elkpass")).toBeCloseTo(Math.hypot(10, 18));
    expect(distance("elkpass", "pinecrest")).toBe(distance("pinecrest", "elkpass"));
  });

  it("find the shortest route through unlocked towns only", () => {
    expect(shortestPath("pinecrest", "summit", ALL)).toEqual(["pinecrest", "elkpass", "summit"]);
    expect(shortestPath("pinecrest", "summit", ["pinecrest", "cedarfalls", "summit"])).toEqual(["pinecrest", "cedarfalls", "summit"]);
    expect(shortestPath("pinecrest", "summit", ["pinecrest", "elkpass", "cedarfalls"])).toBeNull();
    expect(shortestPath("elkpass", "cedarfalls", ["pinecrest", "elkpass", "cedarfalls"])).toEqual(["elkpass", "pinecrest", "cedarfalls"]);
    expect(shortestPath("pinecrest", "pinecrest", ALL)).toEqual(["pinecrest"]);
  });
});

describe("gas", () => {
  it("is proportional to distance with a floor", () => {
    expect(gasCost(0)).toBe(MIN_GAS);
    expect(gasCost(50)).toBe(Math.round(50 * GAS_PER_UNIT));
  });

  it("makes a single road an affordable overnight hop", () => {
    const hop = planTrip("pinecrest", "elkpass", ALL, evening)!;
    expect(hop.hops).toBe(1);
    expect(hop.when).toBe("now");
    expect(hop.cost).toBeGreaterThanOrEqual(6);
    expect(hop.cost).toBeLessThanOrEqual(10);
    expect(hop.cost).toBeLessThan(START_BANK / 10);
  });
});

describe("planTrip", () => {
  it("returns null for the current town or a locked one", () => {
    expect(planTrip("pinecrest", "pinecrest", ALL, morning)).toBeNull();
    expect(planTrip("pinecrest", "summit", ["pinecrest", "elkpass"], morning)).toBeNull();
  });

  it("fits any one town road in the base range, but not two", () => {
    for (const t of STOPS) for (const r of t.roads) {
      const hop = planTrip(t.id, r, ALL, evening)!;
      if (distance(t.id, r) < 40) expect(hop.when).toBe("now");
    }
    const two = planTrip("pinecrest", "summit", ALL, morning)!;
    expect(two.path).toEqual(["pinecrest", "elkpass", "summit"]);
    expect(two.when).toBe("day");
    expect(two.distance).toBeCloseTo(distance("pinecrest", "elkpass") + distance("elkpass", "summit"));
    expect(two.cost).toBe(gasCost(two.distance));
    expect(planTrip("pinecrest", "summit", ALL, evening)!.when).toBe("tomorrow");
  });

  it("needs the tune-up for a highway, and counts tonight's hops against the range", () => {
    expect(planTrip("summit", "saltwater", ALL, evening)!.when).toBe("tomorrow");
    expect(planTrip("summit", "saltwater", ALL, { ...evening, range: rangeUnits(["range1"]) })!.when).toBe("now");
    const used = distance("pinecrest", "elkpass");
    expect(planTrip("elkpass", "summit", ALL, { ...evening, driven: used })!.when).toBe("tomorrow");
    expect(planTrip("elkpass", "summit", ALL, { ...evening, driven: used, range: rangeUnits(["range1"]) })!.when).toBe("now");
  });

  it("crossing the whole map costs real money but less than the starting budget", () => {
    const t = planTrip("pinecrest", "sunvalley", ALL, morning)!;
    expect(t.hops).toBeGreaterThanOrEqual(8);
    expect(t.cost).toBeGreaterThan(50);
    expect(t.cost).toBeLessThan(START_BANK);
  });
});

describe("applyTrip", () => {
  const traveller = () => ({ town: "pinecrest", bank: START_BANK, time: "evening" as const, driven: 0 });

  it("moves the truck tonight, pays gas and uses up range", () => {
    const s = traveller();
    const hop = planTrip("pinecrest", "elkpass", ALL, evening)!;
    expect(applyTrip(s, hop)).toBe(true);
    expect(s).toEqual({ town: "elkpass", bank: START_BANK - hop.cost, time: "evening", driven: hop.distance });
    // The next road doesn't fit what's left of the night, so it waits for the morning.
    const next = planTrip("elkpass", "summit", ALL, { ...evening, driven: s.driven })!;
    expect(next.when).toBe("tomorrow");
    expect(applyTrip(s, next)).toBe(false);
    expect(s.town).toBe("elkpass");
  });

  it("spends the day on a long morning drive and lands in the evening", () => {
    const s = { ...traveller(), time: "morning" as const };
    const far = planTrip("pinecrest", "summit", ALL, morning)!;
    expect(far.when).toBe("day");
    expect(applyTrip(s, far)).toBe(true);
    expect(s.town).toBe("summit");
    expect(s.time).toBe("evening");
    expect(s.driven).toBe(0);
  });

  it("refuses a drive the truck can't pay for", () => {
    const s = { ...traveller(), bank: 3 };
    const hop = planTrip("pinecrest", "elkpass", ALL, evening)!;
    expect(canAfford(hop, s.bank)).toBe(false);
    expect(applyTrip(s, hop)).toBe(false);
    expect(s.town).toBe("pinecrest");
    expect(s.bank).toBe(3);
  });
});

describe("unlocking", () => {
  it("opens a town's roads after three passed shifts there", () => {
    const s = freshSave();
    expect(passTown(s, "pinecrest")).toBe(false);
    expect(s.unlocked).toEqual(["pinecrest"]);
    expect(s.passedTowns).toEqual(["pinecrest"]);
    passTown(s, "pinecrest");
    expect(unlockProgress(s.shiftsIn, "pinecrest")).toEqual({ done: 2, need: SHIFTS_TO_UNLOCK });
    expect(s.unlocked).toEqual(["pinecrest"]);
    passTown(s, "pinecrest");
    expect(s.unlocked).toEqual(["pinecrest", "elkpass", "cedarfalls"]);
    expect(s.shiftsIn.pinecrest).toBe(3);
    passTown(s, "pinecrest");
    expect(s.shiftsIn.pinecrest).toBe(4);
    expect(unlockProgress(s.shiftsIn, "pinecrest").done).toBe(3);
  });

  it("knows the last town of the trip and what opens each town", () => {
    const s = freshSave();
    expect(passTown(s, "sunvalley")).toBe(true);
    expect(openedBy("summit").sort()).toEqual(["cedarfalls", "elkpass"]);
    expect(openedBy("saltwater")).toEqual(["summit"]);
    expect(openedBy("pinecrest")).toEqual([]);
  });
});

describe("save migration", () => {
  it("starts a new truck with the full budget and no ratings", () => {
    const s = migrateSave({});
    expect(s.bank).toBe(START_BANK);
    expect(s.shiftsIn).toEqual({});
    expect(s.ratingCount).toBe(0);
    expect(s.ratingSum).toBe(0);
    expect(s.time).toBe("morning");
    expect(s.gear).toEqual([]);
    expect(s.overnightUsed).toBeUndefined();
  });

  it("wakes an old save in the morning and drops its one-hop flag", () => {
    const s = migrateSave({ town: "elkpass", overnightUsed: true, day: 4 } as Partial<Save>);
    expect(s.time).toBe("morning");
    expect(s.overnightUsed).toBeUndefined();
    expect(s.day).toBe(4);
  });

  it("counts towns already passed as fully worked and grants the starting budget once", () => {
    const old: Partial<Save> = { town: "saltwater", unlocked: ["pinecrest", "elkpass", "cedarfalls", "summit", "saltwater"], passedTowns: ["pinecrest", "summit"], bank: 40 };
    const s = migrateSave(old);
    expect(s.shiftsIn).toEqual({ pinecrest: SHIFTS_TO_UNLOCK, summit: SHIFTS_TO_UNLOCK });
    expect(s.bank).toBe(40 + START_BANK);
    expect(s.town).toBe("saltwater");
    // A save that already has shift counts is left alone.
    const again = migrateSave({ ...s });
    expect(again.bank).toBe(s.bank);
    expect(again.shiftsIn).toEqual(s.shiftsIn);
  });

  it("still migrates saves from before the map", () => {
    const s = migrateSave({ stop: 1, tutorialDone: true });
    expect(s.town).toBe("saltwater");
    expect(s.unlocked).toEqual(["pinecrest", "saltwater"]);
    expect(s.passedTowns).toEqual(["pinecrest"]);
    expect(s.shiftsIn.pinecrest).toBe(SHIFTS_TO_UNLOCK);
    expect(s.stop).toBeUndefined();
  });
});
