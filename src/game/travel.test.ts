import { describe, expect, it } from "vitest";
import { rangeUnits } from "./day";
import { freshSave, migrateSave, passTown, type Save } from "./progress";
import { STOPS } from "./stops";
import {
  applyTrip,
  distance,
  neighbours,
  openedBy,
  planTrip,
  SHIFTS_TO_UNLOCK,
  shortestPath,
  unlockProgress,
} from "./travel";

const ALL = STOPS.map((t) => t.id);
const BASE = rangeUnits();
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

describe("overnight hops", () => {
  it("make any single road, highways included, a hop tonight", () => {
    for (const t of STOPS)
      for (const r of t.roads) {
        const hop = planTrip(t.id, r, ALL, evening)!;
        expect(hop.hops).toBe(1);
        expect(hop.when).toBe("now");
      }
  });
});

describe("planTrip", () => {
  it("returns null for the current town or a locked one", () => {
    expect(planTrip("pinecrest", "pinecrest", ALL, morning)).toBeNull();
    expect(planTrip("pinecrest", "summit", ["pinecrest", "elkpass"], morning)).toBeNull();
  });

  it("takes the whole day for a long drive, and waits for morning in the evening", () => {
    const far = planTrip("pinecrest", "sunvalley", ALL, morning)!;
    expect(far.hops).toBeGreaterThanOrEqual(8);
    expect(far.when).toBe("day");
    expect(planTrip("pinecrest", "sunvalley", ALL, evening)!.when).toBe("tomorrow");
  });

  it("counts tonight's hops against the range", () => {
    const used = BASE - 1;
    expect(planTrip("elkpass", "summit", ALL, { ...evening, driven: used })!.when).toBe("tomorrow");
    expect(planTrip("elkpass", "summit", ALL, { ...evening, driven: 0 })!.when).toBe("now");
  });
});

describe("applyTrip", () => {
  const traveller = () => ({ town: "pinecrest", time: "evening" as const, driven: 0 });

  it("moves the truck tonight and uses up range", () => {
    const s = traveller();
    const hop = planTrip("pinecrest", "elkpass", ALL, evening)!;
    expect(applyTrip(s, hop)).toBe(true);
    expect(s).toEqual({ town: "elkpass", time: "evening", driven: hop.distance });
    // A drive that doesn't fit what's left of the night waits for the morning.
    const next = planTrip("elkpass", "sunvalley", ALL, { ...evening, driven: s.driven })!;
    expect(next.when).toBe("tomorrow");
    expect(applyTrip(s, next)).toBe(false);
    expect(s.town).toBe("elkpass");
  });

  it("spends the day on a long morning drive and lands in the evening", () => {
    const s = { ...traveller(), time: "morning" as const };
    const far = planTrip("pinecrest", "sunvalley", ALL, morning)!;
    expect(far.when).toBe("day");
    expect(applyTrip(s, far)).toBe(true);
    expect(s.town).toBe("sunvalley");
    expect(s.time).toBe("evening");
    expect(s.driven).toBe(0);
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
  it("starts a new truck with no ratings", () => {
    const s = migrateSave({});
    expect(s.shiftsIn).toEqual({});
    expect(s.ratingCount).toBe(0);
    expect(s.ratingSum).toBe(0);
    expect(s.time).toBe("morning");
    expect(s.bonuses).toEqual([]);
  });

  it("wakes an old save in the morning and drops its one-hop flag", () => {
    const s = migrateSave({ town: "elkpass", overnightUsed: true, day: 4 } as Partial<Save>);
    expect(s.time).toBe("morning");
    expect((s as unknown as Record<string, unknown>).overnightUsed).toBeUndefined();
    expect(s.day).toBe(4);
  });

  it("counts towns already passed as fully worked", () => {
    const old: Partial<Save> = { town: "saltwater", unlocked: ["pinecrest", "elkpass", "cedarfalls", "summit", "saltwater"], passedTowns: ["pinecrest", "summit"] };
    const s = migrateSave(old);
    expect(s.shiftsIn).toEqual({ pinecrest: SHIFTS_TO_UNLOCK, summit: SHIFTS_TO_UNLOCK });
    expect(s.town).toBe("saltwater");
    // A save that already has shift counts is left alone.
    const again = migrateSave({ ...s });
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
