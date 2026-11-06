import { describe, expect, it } from "vitest";
import { DIFFICULTY, verdict } from "./difficulty";

describe("difficulty", () => {
  it("gets calmer from stressful to chill", () => {
    expect(DIFFICULTY.chill.patience).toBeGreaterThan(DIFFICULTY.balanced.patience);
    expect(DIFFICULTY.balanced.patience).toBeGreaterThan(DIFFICULTY.stressful.patience);
    expect(DIFFICULTY.chill.crowd).toBeLessThan(DIFFICULTY.balanced.crowd);
    expect(DIFFICULTY.balanced.crowd).toBeLessThan(DIFFICULTY.stressful.crowd);
    expect(DIFFICULTY.chill.sendBack).toBeLessThan(DIFFICULTY.stressful.sendBack);
  });

  it("each tier changes something you notice (difficulty study)", () => {
    const { chill: r, balanced: s, stressful: b } = DIFFICULTY;
    expect([r.label, s.label, b.label]).toEqual(["Relaxed", "Steady", "Busy"]);
    // Three at the window everywhere: two made Relaxed serve fewer people than Steady.
    expect([r.window, s.window, b.window]).toEqual([3, 3, 3]);
    // Ready alerts on Relaxed and Steady (James), not on Busy.
    expect([r.alerts, s.alerts, b.alerts]).toEqual([true, true, false]);
    // The harder tier pays better.
    expect(b.tips).toBeGreaterThan(s.tips);
    expect(s.tips).toBeGreaterThan(r.tips);
    expect(r.small).toBeLessThan(1);
    expect(r.hold).toBeGreaterThan(1);
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
