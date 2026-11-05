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

describe("tools learned down the road carry back (after build #87)", () => {
  it("brings Harbor City's board back to Saltwater Bay once Harbor City has been worked", () => {
    const salt = townById("saltwater");
    expect(withLearned(salt, {}).press?.slice).toBe(false);
    expect(withLearned(salt, { harbor: 1 }).press?.slice).toBe(true);
  });
  it("brings the tortilla press and Port Amber's third spot and board back", () => {
    expect(withLearned(townById("redmesa"), { sunvalley: 2 }).comal?.tpress).toBe(true);
    expect(withLearned(townById("applecross"), { portamber: 1 }).oven).toEqual({ spots: 3, board: true });
  });
  it("leaves the menu and fryer alone, and other counters' tools out", () => {
    const salt = townById("saltwater");
    const s = withLearned(salt, { harbor: 1, driftwood: 1, portamber: 1 });
    expect(s.menu).toBe(salt.menu);
    expect(s.fryer).toBe(salt.fryer);
    expect(s.oven).toBeUndefined();
  });
});
