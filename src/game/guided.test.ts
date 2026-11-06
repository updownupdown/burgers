import { describe, expect, it } from "vitest";
import { counterShifts, GUIDED_DISH, guidedKey, guidedKitchen, guidedRecipe } from "./guided";
import { middleOf, STOPS, townById } from "./stops";

const base = { coach: true, learned: () => false, shiftsIn: {} as Record<string, number>, replay: false };

describe("the guided first order at a new kitchen (DESIGN §48)", () => {
  it("runs at the press, comal and oven, never at the grill", () => {
    expect(guidedKitchen({ ...base, middle: "press" })).toBe("press");
    expect(guidedKitchen({ ...base, middle: "comal" })).toBe("comal");
    expect(guidedKitchen({ ...base, middle: "oven" })).toBe("oven");
    expect(guidedKitchen({ ...base, middle: "grill" })).toBeNull();
  });
  it("only with tutorial mode on", () => {
    expect(guidedKitchen({ ...base, middle: "press", coach: false })).toBeNull();
  });
  it("once per kitchen: not after its lesson is learned", () => {
    const learned = (id: string) => id === guidedKey("press");
    expect(guidedKitchen({ ...base, middle: "press", learned })).toBeNull();
    expect(guidedKitchen({ ...base, middle: "comal", learned })).toBe("comal");
  });
  it("only on the first shift at that kitchen, unless the lessons are replaying", () => {
    const shiftsIn = { pinecrest: 3, saltwater: 1 };
    expect(counterShifts(shiftsIn, "press")).toBe(1);
    expect(counterShifts(shiftsIn, "grill")).toBe(3);
    expect(guidedKitchen({ ...base, middle: "press", shiftsIn })).toBeNull();
    expect(guidedKitchen({ ...base, middle: "press", shiftsIn, replay: true })).toBe("press");
    // Shifts on the grill don't count against the press.
    expect(guidedKitchen({ ...base, middle: "press", shiftsIn: { pinecrest: 9, summit: 4 } })).toBe("press");
  });
  it("makes each region's first dish, from its first town's menu", () => {
    for (const [m, town] of [["press", "saltwater"], ["comal", "redmesa"], ["oven", "applecross"]] as const) {
      const t = townById(town);
      expect(middleOf(t)).toBe(m);
      expect(guidedRecipe(t.menu, m)?.name).toBe(GUIDED_DISH[m]);
    }
    expect(guidedRecipe([], "oven")).toBeNull();
    // Falls back to the menu's first dish if the dish was taken off.
    const harbor = STOPS.find((t) => t.id === "harbor")!;
    expect(guidedRecipe(harbor.menu.filter((r) => r.name !== "Caprese"), "press")?.name).toBe(harbor.menu.find((r) => r.name !== "Caprese")!.name);
  });
});
