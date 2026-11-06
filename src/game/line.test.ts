import { describe, expect, it } from "vitest";
import { joinChance, lineDrain, linePatience, MAX_LINE, SIDES_FLOOR, WINDOW, WINDOW_BASE, windowPatience, wordOfMouth } from "./line";
import { makeOrder, orderFromRecipe, seededRng } from "./menu";
import { townById } from "./stops";
import { popularityTraffic } from "./press";

describe("the line", () => {
  it("is always joined when empty and never past the cap", () => {
    expect(joinChance(0, 10)).toBe(1);
    expect(joinChance(MAX_LINE, 100)).toBe(0);
  });

  it("puts off an unknown truck's customers more than a famous one's", () => {
    expect(joinChance(1, 10)).toBe(0.75);
    expect(joinChance(2, 10)).toBeLessThan(0.25);
    expect(joinChance(2, 100)).toBe(1);
    expect(joinChance(1, 80)).toBeGreaterThan(joinChance(1, 10));
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
    expect(WINDOW.chill).toBe(3);
    expect(WINDOW.balanced).toBe(3);
  });
});

describe("fame", () => {
  it("brings about half the crowd to an unknown truck and more to a famous one", () => {
    expect(popularityTraffic(10)).toBeLessThan(0.6);
    expect(popularityTraffic(100)).toBeCloseTo(1.15, 5);
    expect(popularityTraffic(50)).toBeGreaterThan(popularityTraffic(10));
  });


  it("grows by word of mouth and shrinks when people give up", () => {
    expect(wordOfMouth([5, 5, 4, 4, 5, 4], 0, 0)).toBe(2);
    expect(wordOfMouth([5, 5, 5], 2, 0)).toBe(0);
    expect(wordOfMouth([3, 1], 4, 3)).toBe(-3);
    expect(wordOfMouth(new Array(40).fill(5), 0, 0)).toBe(6);
  });

  it("with the Guest book doubles the good word, not the day's net", () => {
    // Six happy, two walk-outs: +2 -1 plain; the book makes the happy +4, so +3 (it used to give +2).
    expect(wordOfMouth([5, 5, 4, 4, 5, 4], 2, 0, 100, 2)).toBe(3);
    // A bad day still gets the happy customers' word doubled (it used to give nothing extra).
    expect(wordOfMouth([5, 5, 5], 4, 0, 100, 2)).toBe(0);
    expect(wordOfMouth([5, 5, 5], 4, 0, 100)).toBe(-1);
  });

  it("counts the heat that tacos, tostadas and sides-only orders need (difficulty study)", () => {
    const tacos = makeOrder(1, seededRng(1), 0, townById("cactus"));
    const plain = { ...tacos, layers: [], fries: false, drink: null, poutine: false } as typeof tacos;
    expect(windowPatience({ ...plain, fries: true }, 2)).toBeGreaterThanOrEqual(WINDOW_BASE + SIDES_FLOOR + 60);
    const breakfast = orderFromRecipe(2, townById("sunvalley").menu.find((r) => r.name === "Breakfast Taco")!, false, null);
    // An ideal player needed about 61 s for a bare Breakfast Taco; at Busy's 0.8 it now gets well over that.
    expect(windowPatience(breakfast, 2) * 0.8).toBeGreaterThan(90);
  });
});
