import { describe, expect, it } from "vitest";
import { BONUSES } from "./bonus";
import { DIFFICULTY, DIFFICULTIES } from "./difficulty";

describe("bonuses after the scope review (DESIGN §51)", () => {
  it("no bonus says a tier does its job anyway", () => {
    for (const b of BONUSES) expect(b.text).not.toMatch(/anyway/i);
  });

  it("give the early bonuses a job on every tier", () => {
    const text = (id: string) => BONUSES.find((b) => b.id === id)!.text;
    expect(text("bench")).toMatch(/bell/i);
    expect(text("autostop")).toMatch(/twice as fast/i);
    expect(text("steady")).toMatch(/sauce/i);
    expect(text("timer")).toMatch(/burn/i);
  });

  it("leave ready alerts and one-drag counts out of the tiers", () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY[d].blurb).not.toMatch(/alert|one drag/i);
      expect("alerts" in DIFFICULTY[d]).toBe(false);
    }
  });
});
