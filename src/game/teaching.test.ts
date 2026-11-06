import { describe, expect, it } from "vitest";
import { newHere, NUDGE_AFTER, offerSteady, relaxedStreak, roadsAhead } from "./teaching";
import { FINAL_TOWN, townById } from "./stops";

/* Teaching fixes after the scope review (DESIGN §49). */

describe("New here", () => {
  const coast = townById("saltwater");
  it("shows until a shift there has passed", () => {
    expect(coast.newThing).toBeTruthy();
    expect(newHere(coast, {})).toBe(coast.newThing);
    expect(newHere(coast, { saltwater: 0 })).toBe(coast.newThing);
    expect(newHere(coast, { saltwater: 1 })).toBe(null);
  });
  it("is nothing in a town with nothing new", () => {
    expect(newHere(townById("pinecrest"), {})).toBe(null);
  });
});

describe("local ask and roads", () => {
  it("Port Amber and Elk Pass open nothing", () => {
    expect(roadsAhead(townById(FINAL_TOWN), [])).toBe(false);
    expect(roadsAhead(townById("elkpass"), [])).toBe(false);
  });
  it("a town counts toward roads until they're all open", () => {
    const p = townById("pinecrest");
    expect(roadsAhead(p, ["pinecrest"])).toBe(true);
    expect(roadsAhead(p, ["pinecrest", ...p.roads])).toBe(false);
  });
});

describe("Relaxed to Steady nudge", () => {
  it("counts great shifts in a row on Relaxed only", () => {
    let n = 0;
    n = relaxedStreak(n, "chill", true);
    n = relaxedStreak(n, "chill", true);
    expect(n).toBe(2);
    expect(relaxedStreak(n, "chill", false)).toBe(0);
    expect(relaxedStreak(n, "balanced", true)).toBe(0);
    expect(relaxedStreak(n, "chill", true)).toBe(NUDGE_AFTER);
  });
  it("offers once", () => {
    expect(offerSteady(NUDGE_AFTER - 1, false)).toBe(false);
    expect(offerSteady(NUDGE_AFTER, false)).toBe(true);
    expect(offerSteady(NUDGE_AFTER + 2, true)).toBe(false);
  });
});
