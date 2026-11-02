import { describe, expect, it } from "vitest";
import { orderFromRecipe } from "./menu";
import { EVENTS, townById, withEvent } from "./stops";
import { HOLD_GRACE, scorePlate } from "./scoring";
import { COOK_SCALE } from "./cooking";
import { ageLayers, freshen, goesStale, isTacoRun, joinTacos } from "./hold";
import type { Kind, Layer, Piece } from "./types";
import { newPiece } from "./types";

/*
 * Food waiting on a tray, and Red Rock's tacos (DESIGN §24, after build #73): tacos built in the
 * rack on the comal's warm end don't age there, and on a tray a run of tacos goes cold from the
 * last taco placed, not the first.
 */

const lay = (piece: Piece): Layer => ({ piece, offX: 0, offZ: 0 });
/** A tortilla warmed to perfect on the comal, or any other piece as it comes. */
function piece(kind: Kind, held = 0): Piece {
  const p = newPiece(kind);
  if (kind === "corn" || kind === "flour") p.cook = [COOK_SCALE[kind].perfect, 0];
  if (held) p.held = held;
  return p;
}
const kinds = (ls: Layer[]) => ls.map((l) => l.piece.kind).join(",");

const rodeo = orderFromRecipe(1, withEvent(townById("cactus"), EVENTS.find((e) => e.id === "rodeo")!).menu.find((r) => r.name === "Rodeo Platter")!, false, null);

describe("holding food on a tray", () => {
  it("ages cooked food only, at half pace under the heat lamp", () => {
    const ls = [lay(piece("corn")), lay(piece("pork")), lay(piece("onion"))];
    expect(ls.map((l) => goesStale(l.piece))).toEqual([true, false, false]);
    ageLayers(ls, 10);
    ageLayers(ls, 10, 0.5);
    expect(ls.map((l) => l.piece.held ?? 0)).toEqual([15, 0, 0]);
    // A cold tortilla straight from the stack isn't food going cold.
    const cold = [lay(newPiece("corn"))];
    ageLayers(cold, 10);
    expect(cold[0].piece.held).toBeUndefined();
  });

  it("knows a run of tacos from a quesadilla", () => {
    expect(isTacoRun([lay(piece("corn")), lay(piece("pork"))])).toBe(true);
    const q = piece("flour");
    q.folded = true;
    expect(isTacoRun([lay(q)])).toBe(false);
    expect(isTacoRun([])).toBe(false);
  });
});

describe("tacos joining a run", () => {
  it("land on an empty tray whole, rack and all", () => {
    const rack = [piece("corn"), piece("corn"), piece("pork"), piece("pork"), piece("onion"), piece("cilantro"), piece("lime")].map(lay);
    expect(kinds(joinTacos([], rack))).toBe("corn,corn,pork,pork,onion,cilantro,lime");
  });

  it("don't double a sprinkle the rack already has, but scoops and single pinches count", () => {
    const rack = [piece("corn"), piece("pork"), piece("onion")].map(lay);
    // A tortilla filled on the comal joins: its pork counts, its onion is already over every taco.
    const joined = joinTacos(rack, [piece("corn"), piece("pork"), piece("onion"), piece("jalapeno")].map(lay));
    expect(kinds(joined)).toBe("corn,pork,onion,corn,pork,jalapeno");
    // A second pinch of onion dropped in on its own is extra onion.
    expect(kinds(joinTacos(joined, [lay(piece("onion"))]))).toBe("corn,pork,onion,corn,pork,jalapeno,onion");
  });

  it("go cold from the last taco placed", () => {
    const tray = [lay(piece("corn", 70)), lay(piece("corn", 50)), lay(piece("pork"))];
    const joined = joinTacos(tray, [lay(piece("corn", 0)), lay(piece("pork"))]);
    expect(joined.map((l) => l.piece.held ?? 0)).toEqual([0, 0, 0, 0, 0]);
    // Fillings on their own don't freshen anything.
    const old = [lay(piece("corn", 30))];
    freshen(old, [lay(piece("pork"))]);
    expect(old[0].piece.held).toBe(30);
  });
});

describe("a Rodeo Platter", () => {
  /** Four tacos, the tortillas placed `gap` seconds apart on the tray and the platter served `wait` s after the last. */
  function platter(gap: number, wait: number, joinRule: boolean) {
    let ls: Layer[] = [];
    for (let i = 0; i < 4; i++) {
      const t = [lay(piece("corn"))];
      if (joinRule) ls = joinTacos(ls, t);
      else ls.push(...t);
      ageLayers(ls, gap);
    }
    ls.push(...[piece("pork"), piece("pork"), piece("pork"), piece("pork"), piece("onion"), piece("cilantro"), piece("lime")].map(lay));
    ageLayers(ls, wait - gap);
    return scorePlate(rodeo, { layers: ls, fries: null, drink: null });
  }

  it("built in the rack and served straight away is a perfect platter", () => {
    // In the rack on the warm end nothing ages, so the tacos land on the tray at zero.
    const r = platter(0, 5, true);
    expect(r.stars).toBe(5);
    expect(r.notes).toEqual([]);
  });

  it("built taco by taco on the tray isn't marked down for the first taco's wait", () => {
    // 25 s between tortillas: the first has waited 75 s more than the last by the time it's served.
    const fair = platter(25, 30, true);
    expect(fair.notes).not.toContain("been sitting a while");
    expect(fair.stars).toBe(5);
    // Counted from the first taco (the old rule), the same platter had gone cold.
    const old = platter(25, 30, false);
    expect(old.notes).toContain("been sitting a while");
    expect(old.score).toBeLessThan(fair.score);
  });

  it("still goes cold if the finished platter is left on the tray", () => {
    const r = platter(0, HOLD_GRACE + 50, true);
    expect(r.notes).toContain("been sitting a while");
  });
});
