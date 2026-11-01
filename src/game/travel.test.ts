import { describe, expect, it } from "vitest";
import { rangeUnits } from "./day";
import { freshSave, migrateSave, passTown, type Save } from "./progress";
import { LINKS, STOPS, townById } from "./stops";
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

describe("the map", () => {
  it("has fourteen towns in four regions, and the Pines' five burgers by Summit", () => {
    expect(STOPS).toHaveLength(14);
    expect(new Set(STOPS.map((t) => t.region)).size).toBe(4);
    expect(townById("pinecrest").menu.map((r) => r.name)).toHaveLength(2);
    expect(townById("summit").menu).toHaveLength(5);
  });
});

describe("roads", () => {
  it("run both ways", () => {
    expect(neighbours("pinecrest")).toEqual(["elkpass", "cedarfalls"]);
    expect(neighbours("elkpass")).toContain("pinecrest");
    expect(neighbours("summit")).toEqual(["cedarfalls", "saltwater"]);
    expect(neighbours("sunvalley")).toEqual(["cactus", "applecross"]);
  });

  it("add the late links: the Old Pass road and the ferry", () => {
    expect(neighbours("elkpass")).toEqual(["pinecrest", "cactus"]);
    expect(neighbours("cactus")).toContain("elkpass");
    expect(neighbours("harbor")).toContain("portamber");
    expect(neighbours("portamber")).toEqual(["larkvale", "harbor"]);
  });

  it("measure distance symmetrically in map units", () => {
    expect(distance("pinecrest", "elkpass")).toBeCloseTo(Math.hypot(13, 19));
    expect(distance("elkpass", "pinecrest")).toBe(distance("pinecrest", "elkpass"));
  });

  it("find the shortest route through unlocked towns only", () => {
    expect(shortestPath("pinecrest", "summit", ALL)).toEqual(["pinecrest", "cedarfalls", "summit"]);
    expect(shortestPath("pinecrest", "summit", ["pinecrest", "elkpass", "cedarfalls"])).toBeNull();
    // The Old Pass road is a shortcut once both ends are open, and isn't there until then.
    expect(shortestPath("pinecrest", "sunvalley", ALL)).toEqual(["pinecrest", "elkpass", "cactus", "sunvalley"]);
    expect(shortestPath("elkpass", "cactus", ALL.filter((id) => id !== "cactus"))).toBeNull();
    expect(shortestPath("larkvale", "harbor", ALL)).toEqual(["larkvale", "portamber", "harbor"]);
    expect(shortestPath("elkpass", "cedarfalls", ["pinecrest", "elkpass", "cedarfalls"])).toEqual(["elkpass", "pinecrest", "cedarfalls"]);
    expect(shortestPath("pinecrest", "pinecrest", ALL)).toEqual(["pinecrest"]);
  });
});

describe("overnight hops", () => {
  it("make any single road, highways and late links included, a hop tonight", () => {
    const pairs = [...STOPS.flatMap((t) => t.roads.map((r) => [t.id, r])), ...LINKS.map((l) => [l.a, l.b])];
    for (const [a, b] of pairs) {
      const hop = planTrip(a, b, ALL, evening)!;
      expect(hop.hops).toBe(1);
      expect(hop.when).toBe("now");
    }
  });
});

describe("planTrip", () => {
  it("returns null for the current town or a locked one", () => {
    expect(planTrip("pinecrest", "pinecrest", ALL, morning)).toBeNull();
    expect(planTrip("pinecrest", "summit", ["pinecrest", "elkpass"], morning)).toBeNull();
    expect(planTrip("elkpass", "cactus", ["pinecrest", "elkpass"], morning)).toBeNull();
  });

  it("takes the whole day for a long drive, and waits for morning in the evening", () => {
    const far = planTrip("pinecrest", "portamber", ALL, morning)!;
    expect(far.hops).toBeGreaterThanOrEqual(5);
    expect(far.when).toBe("day");
    expect(planTrip("pinecrest", "portamber", ALL, evening)!.when).toBe("tomorrow");
  });

  it("counts tonight's hops against the range", () => {
    const used = BASE - 1;
    expect(planTrip("cedarfalls", "summit", ALL, { ...evening, driven: used })!.when).toBe("tomorrow");
    expect(planTrip("cedarfalls", "summit", ALL, { ...evening, driven: 0 })!.when).toBe("now");
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
    const next = planTrip("elkpass", "portamber", ALL, { ...evening, driven: s.driven })!;
    expect(next.when).toBe("tomorrow");
    expect(applyTrip(s, next)).toBe(false);
    expect(s.town).toBe("elkpass");
  });

  it("spends the day on a long morning drive and lands in the evening", () => {
    const s = { ...traveller(), time: "morning" as const };
    const far = planTrip("pinecrest", "portamber", ALL, morning)!;
    expect(far.when).toBe("day");
    expect(applyTrip(s, far)).toBe(true);
    expect(s.town).toBe("portamber");
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
    expect(passTown(s, "portamber")).toBe(true);
    expect(passTown(s, "elkpass")).toBe(false);
    expect(openedBy("summit")).toEqual(["cedarfalls"]);
    expect(openedBy("portamber")).toEqual(["larkvale"]);
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
    // Pinecrest counts as worked, so its roads open too.
    expect(s.unlocked).toEqual(["pinecrest", "saltwater", "elkpass", "cedarfalls"]);
    expect(s.passedTowns).toEqual(["pinecrest"]);
    expect(s.shiftsIn.pinecrest).toBe(SHIFTS_TO_UNLOCK);
    expect(s.stop).toBeUndefined();
  });

  it("folds Dust Bowl into Cactus Junction", () => {
    const s = migrateSave({
      town: "dustbowl",
      unlocked: ["pinecrest", "cactus", "dustbowl"],
      passedTowns: ["cactus", "dustbowl"],
      shiftsIn: { pinecrest: 3, cactus: 1, dustbowl: 2 },
      best: { cactus: 1.8, dustbowl: 2.4 },
      bank: 321,
      bonuses: ["bench", "sear"],
      looks: ["teal"],
    } as Partial<Save>);
    expect(s.town).toBe("cactus");
    expect(s.unlocked).not.toContain("dustbowl");
    expect(s.unlocked.filter((id) => id === "cactus")).toHaveLength(1);
    expect(s.passedTowns).toEqual(["cactus"]);
    expect(s.shiftsIn.cactus).toBe(3);
    expect(s.shiftsIn.dustbowl).toBeUndefined();
    expect(s.best.cactus).toBe(2.4);
    expect(s.bank).toBe(321);
    expect(s.bonuses).toEqual(["bench", "sear"]);
    expect(s.looks).toContain("teal");
    // Three shifts there now count, so Cactus Junction's road is open.
    expect(s.unlocked).toContain("sunvalley");
  });
});
