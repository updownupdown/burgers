import { describe, expect, it } from "vitest";
import { buildLine, dishTips, drinksInfo, ingredients, methodTags, sidesInfo, sidesLine } from "./dishtext";
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

describe("the pause card's Today's menu (build #82)", () => {
  it("lists every ingredient, buns and counts included", () => {
    const lj = ingredients(recipe("summit", "Lumberjack Stack"));
    expect(lj.map((g) => g.kind)).toEqual(recipe("summit", "Lumberjack Stack").layers);
    expect(lj[0].label).toBe("Bun");
    expect(ingredients(recipe("redmesa", "Street Tacos"))[0]).toMatchObject({ label: "Corn tortilla", count: 3 });
  });
  it("gives the simple dishes no tips and the fussy ones a few, from the recipe and the town", () => {
    expect(dishTips(recipe("pinecrest", "Trailhead Classic"), townById("pinecrest"))).toEqual([]);
    expect(dishTips(recipe("summit", "Summit Smash"), townById("summit")).join(" ")).toMatch(/smash/i);
    // Cut in half only where the board is out.
    expect(dishTips(recipe("harbor", "Caprese"), townById("harbor")).join(" ")).toMatch(/half/);
    expect(dishTips(recipe("saltwater", "Caprese"), townById("saltwater")).join(" ")).not.toMatch(/half/);
    expect(dishTips(recipe("saltwater", "Avocado Toast"), townById("saltwater"))[0]).toMatch(/cold: avocado and rocket/);
    expect(dishTips(recipe("redmesa", "Quesadilla"), townById("redmesa")).join(" ")).toMatch(/fold/);
    expect(dishTips(recipe("portamber", "Harvest Red"), townById("portamber")).join(" ")).toMatch(/four/);
    expect(dishTips(recipe("portamber", "Calzone"), townById("portamber")).join(" ")).toMatch(/whole/);
    for (const t of ["summit", "harbor", "sunvalley", "portamber"]) for (const r of townById(t).menu) expect(dishTips(r, townById(t)).length).toBeLessThanOrEqual(3);
  });
  it("names the town's sides and drinks without a row per size", () => {
    expect(sidesInfo(townById("cedarfalls")).names).toEqual(["Fries", "Poutine"]);
    expect(sidesInfo(townById("redmesa")).kind).toBe("chips");
    expect(drinksInfo(townById("harbor")).note).toMatch(/cucumber/);
    expect(drinksInfo(townById("pinecrest")).drinks).toHaveLength(5);
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
