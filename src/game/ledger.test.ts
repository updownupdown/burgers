import { describe, expect, it } from "vitest";
import { ordersShown } from "./progress";

// The takings as main.ts works them out: once, from the exact sums.
const day = (earned: number, tips: number, comped: number, spills: number) => {
  const takings = Math.max(0, Math.round(earned + tips - comped - spills));
  return { earned, tips, comped: Math.round(comped), spills, takings };
};

describe("report card ledger", () => {
  it("adds up to the takings when each line rounds the other way", () => {
    // $10.40 of orders and $0.40 on the house: the total rounds to $10, the lines to $10 − $0.
    const c = day(10.4, 0, 0.4, 0);
    expect(ordersShown(c) + c.tips - c.comped - c.spills).toBe(c.takings);
    // $20.50 of orders with $3 tips and $0.50 comped: $23 total, lines $21 + $3 − $1.
    const d = day(20.5, 3, 0.5, 0);
    expect(ordersShown(d) + d.tips - d.comped - d.spills).toBe(d.takings);
  });

  it("stays within a dollar of what the orders paid", () => {
    for (const e of [0, 4.5, 12.49, 33.5, 101.75]) {
      const c = day(e, 2, 1.5, 1);
      expect(Math.abs(ordersShown(c) - e)).toBeLessThan(1);
    }
  });

  it("shows the orders as they were on a day that floored at $0", () => {
    expect(ordersShown(day(3, 0, 0, 9))).toBe(3);
  });
});
