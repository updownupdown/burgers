import { describe, expect, it } from "vitest";
import { joinChance, lineDrain, linePatience, MAX_LINE, WINDOW, wordOfMouth } from "./line";
import { popularityTraffic } from "./press";

describe("the line", () => {
  it("is always joined when empty and never past the cap", () => {
    expect(joinChance(0, 10)).toBe(1);
    expect(joinChance(MAX_LINE, 100)).toBe(0);
  });

  it("puts off an unknown truck's customers more than a famous one's", () => {
    expect(joinChance(1, 10)).toBeLessThan(0.5);
    expect(joinChance(2, 10)).toBeLessThan(0.25);
    expect(joinChance(2, 100)).toBe(1);
    expect(joinChance(1, 50)).toBeGreaterThan(joinChance(1, 10));
    expect(joinChance(2, 50)).toBeLessThan(joinChance(1, 50));
  });

  it("drains patience slowest at the front", () => {
    expect(lineDrain(0)).toBeLessThan(lineDrain(1));
    expect(lineDrain(1)).toBeLessThan(lineDrain(2));
    expect(lineDrain(5)).toBe(1);
  });

  it("waits longer on chill with a patient crowd", () => {
    expect(linePatience("chill", "families")).toBeGreaterThan(linePatience("balanced", "families"));
    expect(linePatience("balanced", "families")).toBeGreaterThan(linePatience("balanced", "commuters"));
  });

  it("keeps chill to two at the window", () => {
    expect(WINDOW.chill).toBe(2);
    expect(WINDOW.balanced).toBe(3);
  });
});

describe("fame", () => {
  it("brings about half the crowd to an unknown truck and more to a famous one", () => {
    expect(popularityTraffic(10)).toBeLessThan(0.6);
    expect(popularityTraffic(100)).toBeGreaterThan(1.2);
    expect(popularityTraffic(50)).toBeGreaterThan(popularityTraffic(10));
  });


  it("grows by word of mouth and shrinks when people give up", () => {
    expect(wordOfMouth([5, 5, 4, 4, 5, 4], 0, 0)).toBe(2);
    expect(wordOfMouth([5, 5, 5], 2, 0)).toBe(0);
    expect(wordOfMouth([3, 1], 4, 3)).toBe(-3);
    expect(wordOfMouth(new Array(40).fill(5), 0, 0)).toBe(6);
  });
});
