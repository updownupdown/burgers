import { describe, expect, it } from "vitest";
import { COOK_TIME, shiftStretch, TYPICAL } from "./pace";

describe("kitchen pace", () => {
  it("leaves the old game at 1x", () => {
    expect(shiftStretch(1)).toBe(1);
  });
  it("stretches the shift by less than the cooking", () => {
    const f = shiftStretch(COOK_TIME);
    expect(f).toBeGreaterThan(1.3);
    expect(f).toBeLessThan(COOK_TIME);
    // A typical order's patience grows exactly as the shift does.
    expect((TYPICAL.hands + TYPICAL.cook * COOK_TIME) / (TYPICAL.hands + TYPICAL.cook)).toBeCloseTo(f);
  });
});
