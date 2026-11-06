import { describe, expect, it } from "vitest";
import { ticketHtml } from "./ui";
import type { Kind, Order, Plate } from "./game/types";
import { DONENESS_TARGET, newPiece } from "./game/types";
import { orderFromRecipe } from "./game/menu";
import { townById } from "./game/stops";

const order: Order = {
  id: 1,
  name: "Trailhead Classic",
  price: 9,
  mods: [],
  layers: [{ kind: "bun", toasted: true }, { kind: "ketchup" }, { kind: "patty" }, { kind: "lettuce" }, { kind: "tomato", count: 2 }, { kind: "bun", toasted: true }],
  fries: false,
  drink: null,
  friesSize: "S",
  drinkSize: "M",
};
const plate = (...kinds: (Kind | [Kind, number])[]): Plate => ({
  layers: kinds.map((k) => {
    const p = newPiece(Array.isArray(k) ? k[0] : k);
    if (Array.isArray(k)) p.cook = [k[1], k[1]];
    return { piece: p, offX: 0, offZ: 0 };
  }),
  fries: null,
  drink: null,
});
/** Each row of the open ticket as "class|text", top of the burger first. */
function rows(p: Plate): string[] {
  return [...ticketHtml(order, p, 1, true).matchAll(/<li class="([^"]*)"[^>]*>.*?<span class="l">(.*?)<\/span>/g)].map((m) => `${m[1]}|${m[2].replace(/<b class="cnt">.*?<\/b>/g, "").replace(/<[^>]+>/g, "").trim()}`);
}

describe("forgiving ticket", () => {
  it("counts a piece stacked out of order and lists a stray one in red", () => {
    // Mustard went on by mistake, then the ketchup on top of it.
    const r = rows(plate("bun", "mustard", "ketchup"));
    expect(r.filter((x) => x.endsWith("|Ketchup"))).toEqual(["done|Ketchup"]);
    expect(r).toContain("wrong|Mustard");
    expect(r.find((x) => x.includes("next"))).toBe("next|Patty");
  });
  it("counts a well-done patty as fine, but marks a burnt one red", () => {
    expect(rows(plate("bun", "ketchup", ["patty", DONENESS_TARGET.well])).filter((x) => x.endsWith("|Patty"))).toEqual(["done|Patty"]);
    const r = rows(plate("bun", "ketchup", ["patty", 0.97]));
    expect(r.filter((x) => x.endsWith("|Patty"))).toEqual(["wrong|Patty"]);
    expect(r.find((x) => x.includes("next"))).toBe("next|Lettuce");
  });
  it("leaves a short count on top as the next thing to finish", () => {
    const r = rows(plate("bun", "ketchup", ["patty", DONENESS_TARGET.medium], "lettuce", "tomato"));
    expect(r.find((x) => x.includes("next"))).toBe("next|Tomato");
  });
  it("says NO and ADD, with the count right after the name", () => {
    const o: Order = { ...order, mods: [{ type: "no", kind: "lettuce" }, { type: "add", kind: "onion" }], layers: [{ kind: "bun" }, { kind: "patty" }, { kind: "onion", count: 2 }, { kind: "tomato", count: 2 }, { kind: "bun" }], removed: [{ kind: "lettuce", at: 2 }] };
    const html = ticketHtml(o, plate(), 1, true);
    expect(html).toContain('<b class="kw">NO</b> Lettuce');
    expect(html).toContain('<span class="l"><b class="kw">ADD</b> Onion</span><span class="ct">×2</span>');
    const stub = ticketHtml(o, plate(), 1, false);
    expect(stub).toContain('<b class="kw">NO</b> Lettuce');
    expect(stub).not.toContain("left");
  });
  it("puts each side's size, flavour and ice on the small ticket, and each side once on the open one", () => {
    const o: Order = { ...order, fries: true, friesSize: "L", drink: "cola", drinkSize: "S", ice: false };
    const stub = ticketHtml(o, plate(), 1, false, 0, 90);
    expect(stub).toMatch(/<i class="sz">L<\/i><span class="sn">Fries<\/span>/);
    expect(stub).toMatch(/<i class="sz">S<\/i><span class="sn">[^<]+<\/span><span class="sm"><span class="mb noice"/);
    const open = ticketHtml(o, plate(), 1, true);
    expect(open.match(/<svg class="ic"[^>]*style="--c:[^"]*"[^>]*>/g)!.length).toBe(o.layers.length + 2);
    expect(open).not.toContain("Rosa");
  });
});

describe("method line and step chips (after build #76)", () => {
  const recipe = (town: string, name: string) => townById(town).menu.find((r) => r.name === name)!;
  const html = (o: Order) => ticketHtml(o, plate(), 1, true);
  const how = (o: Order) => (html(o).match(/<div class="how">(.*?)<\/div>/)?.[1] ?? "").replace(/<[^>]+>/g, "");
  /** The chips on the line for one kind, as text. */
  const chips = (o: Order, label: string) => {
    const li = html(o).split("<li").slice(1).find((x) => x.includes(`<span class="l">${label}`)) ?? "";
    return [...li.matchAll(/class="mb [^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  };
  it("presses a panini whole, and cuts it where there's a board; only a protein is pressed first", () => {
    const o = orderFromRecipe(1, recipe("harbor", "Chicken Pesto"), false, null);
    o.slice = true;
    expect(how(o)).toBe("Press›Cut?");
    expect(chips(o, "Ciabatta")).toEqual([]);
    expect(chips(o, "Chicken")).toEqual(["Press first"]);
    expect(html(o)).not.toContain(">Melt<");
    const toast = orderFromRecipe(2, recipe("saltwater", "Avocado Toast"), false, null);
    expect(how(toast)).toBe("");
    expect(chips(toast, "Sourdough")).toEqual(["Press"]);
  });
  it("folds and flips a quesadilla, warms each taco tortilla, and fries a tostada's corn", () => {
    expect(how(orderFromRecipe(1, recipe("redmesa", "Quesadilla"), false, null))).toBe("Fold›Flip");
    const tacos = orderFromRecipe(2, recipe("redmesa", "Street Tacos"), false, null);
    expect(how(tacos)).toBe("");
    expect(chips(tacos, "Corn")).toEqual(["Warm"]);
    expect(chips(orderFromRecipe(3, recipe("cactus", "Bean Tostada"), false, null), "Tostada")).toEqual(["Fry corn"]);
  });
  it("bakes a flatbread (cut in four at Port Amber) and folds a calzone first", () => {
    const fb = orderFromRecipe(1, recipe("portamber", "Harvest Red"), false, null);
    fb.slice = true;
    expect(how(fb)).toBe("Bake›Cut 4?");
    expect(how(orderFromRecipe(2, recipe("portamber", "Calzone"), false, null))).toBe("Fold›Bake");
  });
  it("keeps a burger's steps on its own lines: Melt on the cheese over the patty", () => {
    const o = orderFromRecipe(1, recipe("cedarfalls", "Campfire Melt"), false, null);
    expect(how(o)).toBe("");
    expect(chips(o, "Cheese")).toContain("Melt");
  });
});

describe("counts on the ticket (review #78 B10)", () => {
  it("doesn't mark a single onion on tacos with x1, but keeps x3 on the pork", () => {
    const tacos = orderFromRecipe(1, townById("redmesa").menu.find((r) => r.name === "Street Tacos")!, false, null);
    const html = ticketHtml(tacos, plate(), 1, true);
    const line = (label: string) => html.split("<li").slice(1).find((x) => x.includes(`<span class="l">${label}`)) ?? "";
    expect(line("Onion")).not.toContain("×1");
    expect(line("Pork")).toContain("×3");
  });
});
