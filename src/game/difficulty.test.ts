import { describe, expect, it } from "vitest";
import { DIFFICULTY, verdict } from "./difficulty";

describe("difficulty", () => {
  it("gets calmer from stressful to chill", () => {
    expect(DIFFICULTY.chill.patience).toBeGreaterThan(DIFFICULTY.balanced.patience);
    expect(DIFFICULTY.balanced.patience).toBeGreaterThan(DIFFICULTY.stressful.patience);
    expect(DIFFICULTY.chill.spawnGap).toBeGreaterThan(DIFFICULTY.stressful.spawnGap);
    expect(DIFFICULTY.chill.sendBack).toBeLessThan(DIFFICULTY.stressful.sendBack);
  });

  it("sends back once, then accepts unless it's still really wrong", () => {
    expect(verdict(90, "balanced", false)).toBe("accept");
    expect(verdict(40, "balanced", false)).toBe("sendBack");
    expect(verdict(40, "balanced", true)).toBe("accept");
    expect(verdict(10, "balanced", false)).toBe("refuse");
    expect(verdict(10, "balanced", true)).toBe("refuse");
    expect(verdict(40, "chill", false)).toBe("accept");
    expect(verdict(80, "balanced", false, true)).toBe("sendBack");
    expect(verdict(80, "balanced", true, true)).toBe("accept");
    expect(verdict(80, "chill", false, true)).toBe("accept");
  });
  it("sends back a missing drink once, even on Chill", () => {
    expect(verdict(85, "chill", false, true, true)).toBe("sendBack");
    expect(verdict(85, "chill", true, true, true)).toBe("accept");
  });
});
