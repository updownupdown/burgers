import { describe, expect, it } from "vitest";
import { buildLine, methodTags, sidesLine } from "./dishtext";
import { extrasOn } from "../game/menu";
import { townById } from "../game/stops";

const recipe = (town: string, name: string) => townById(town).menu.find((r) => r.name === name)!;

describe("today's menu in brief (review #78 M4)", () => {
  it("keeps every layer of a dish that isn't between two buns", () => {
    expect(buildLine(recipe("redmesa", "Street Tacos"))).toBe("Corn tortilla ×3 · Pork ×3 · Onion · Cilantro · Lime");
    expect(buildLine(recipe("redmesa", "Quesadilla"))).not.toBe("");
    expect(buildLine(recipe("portamber", "Calzone"))).toContain("Mushroom");
    expect(buildLine(recipe("saltwater", "Avocado Toast"))).toContain("Avocado");
  });
  it("still leaves the buns off a burger", () => {
    const line = buildLine(townById("pinecrest").menu[0]);
    expect(line).not.toMatch(/Bun/);
    expect(line).toContain("Patty");
  });
  it("names how each kind of dish is made, not 'toasted' for all", () => {
    expect(methodTags(recipe("redmesa", "Quesadilla"))).toContain("Folded, flipped once");
    expect(methodTags(recipe("portamber", "Calzone"))[0]).toBe("Folded, baked");
  });
  it("lists the town's own sides", () => {
    expect(sidesLine(townById("redmesa"))).toMatch(/^Chips/);
    expect(sidesLine(townById("pinecrest"))).toMatch(/^Fries S, M, L/);
  });
});

describe("the menu's extras (review #78 M13)", () => {
  it("only offers what the town's dishes can carry", () => {
    const pines = extrasOn(townById("pinecrest"));
    expect(pines.add).not.toContain("jack");
    const mesa = extrasOn(townById("redmesa"));
    expect(mesa.add).not.toContain("bacon");
    expect(mesa.add).not.toContain("egg");
  });
});
