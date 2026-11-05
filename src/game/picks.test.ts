import { describe, expect, it } from "vitest";
import { MAX_PICKS, togglePick, validPicks, type BonusId } from "./bonus";
import { freshSave, migrateSave } from "./progress";
import { townById, withLearned } from "./stops";

describe("up to three bonuses a shift (after build #87)", () => {
  it("toggles a pick on and off, and the oldest makes way past three", () => {
    let p: BonusId[] = [];
    p = togglePick(p, "bench");
    p = togglePick(p, "lamp");
    p = togglePick(p, "timer");
    expect(p).toEqual(["bench", "lamp", "timer"]);
    p = togglePick(p, "lamp");
    expect(p).toEqual(["bench", "timer"]);
    p = togglePick(p, "lamp");
    p = togglePick(p, "turbo");
    expect(p).toHaveLength(MAX_PICKS);
    expect(p).toEqual(["timer", "lamp", "turbo"]);
  });
  it("keeps only owned picks", () => {
    expect(validPicks(["bench", "lamp", "nope"], ["bench"])).toEqual(["bench"]);
  });
  it("carries an old save's single bonus over", () => {
    const old = { ...freshSave(), bonuses: ["bench", "lamp"], bonus: "lamp" } as unknown as Parameters<typeof migrateSave>[0];
    delete (old as { picks?: unknown }).picks;
    const s = migrateSave(old);
    expect(s.picks).toEqual(["lamp"]);
    expect((s as unknown as { bonus?: unknown }).bonus).toBeUndefined();
  });
});

describe("what's learned down the road carries back (after build #87)", () => {
  it("puts later recipes on an earlier town's menu, with their bins, once that town has been worked", () => {
    const salt = townById("saltwater");
    expect(withLearned(salt, {}).menu).toBe(salt.menu);
    const s = withLearned(salt, { harbor: 1 });
    expect(s.menu.map((r) => r.name)).toContain("Veggie Club");
    expect(s.pantry).toContain("veggie");
    expect(s.fryer).toBe(salt.fryer);
  });
  it("brings the tortilla press and Port Amber's third spot back", () => {
    expect(withLearned(townById("redmesa"), { sunvalley: 2 }).comal?.tpress).toBe(true);
    expect(withLearned(townById("applecross"), { portamber: 1 }).oven).toEqual({ spots: 3, board: true });
  });
  it("keeps other counters' recipes and tools out", () => {
    const pine = townById("pinecrest");
    const p = withLearned(pine, { harbor: 1, portamber: 1 });
    expect(p.menu).toBe(pine.menu);
    expect(p.press).toBeUndefined();
    expect(p.oven).toBeUndefined();
  });
  it("gives every press and oven town the board", () => {
    expect(townById("saltwater").press?.slice).toBe(true);
    expect(townById("applecross").oven?.board).toBe(true);
  });
});
