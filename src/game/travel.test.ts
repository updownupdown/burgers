import { describe, expect, it } from "vitest";
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
    const hop = planTrip("pinecrest", "elkpass", ALL, false)!;
    expect(hop.hops).toBe(1);
    expect(hop.days).toBe(0);
    expect(hop.cost).toBeGreaterThanOrEqual(6);
    expect(hop.cost).toBeLessThanOrEqual(10);
    expect(hop.cost).toBeLessThan(START_BANK / 10);
  });
});

describe("planTrip", () => {
  it("returns null for the current town or a locked one", () => {
    expect(planTrip("pinecrest", "pinecrest", ALL, false)).toBeNull();
    expect(planTrip("pinecrest", "summit", ["pinecrest", "elkpass"], false)).toBeNull();
  });

  it("takes a day for two roads or more, costing by distance", () => {
    const t = planTrip("pinecrest", "summit", ALL, false)!;
    expect(t.path).toEqual(["pinecrest", "elkpass", "summit"]);
    expect(t.days).toBe(1);
    expect(t.distance).toBeCloseTo(distance("pinecrest", "elkpass") + distance("elkpass", "summit"));
    expect(t.cost).toBe(gasCost(t.distance));
  });

  it("takes a day for a second hop in the same night", () => {
    expect(planTrip("pinecrest", "elkpass", ALL, true)!.days).toBe(1);
  });

  it("crossing the whole map costs real money but less than the starting budget", () => {
    const t = planTrip("pinecrest", "sunvalley", ALL, false)!;
    expect(t.hops).toBeGreaterThanOrEqual(8);
    expect(t.cost).toBeGreaterThan(50);
    expect(t.cost).toBeLessThan(START_BANK);
  });
});

describe("applyTrip", () => {
  const traveller = () => ({ town: "pinecrest", bank: START_BANK, day: 3, overnightUsed: false });

  it("moves the truck overnight, pays gas and uses up the night", () => {
    const s = traveller();
    const hop = planTrip("pinecrest", "elkpass", ALL, false)!;
    expect(applyTrip(s, hop)).toBe(true);
    expect(s).toEqual({ town: "elkpass", bank: START_BANK - hop.cost, day: 3, overnightUsed: true });
    // The next drive, even one road, now takes a day and frees the night after.
    const next = planTrip("elkpass", "summit", ALL, s.overnightUsed)!;
    expect(next.days).toBe(1);
    applyTrip(s, next);
    expect(s.day).toBe(4);
    expect(s.overnightUsed).toBe(false);
  });

  it("refuses a drive the truck can't pay for", () => {
    const s = { ...traveller(), bank: 3 };
    const hop = planTrip("pinecrest", "elkpass", ALL, false)!;
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
    expect(s.overnightUsed).toBe(false);
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
