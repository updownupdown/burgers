import { describe, expect, it } from "vitest";
import { cookLevel, flipFaces, grillStep, setFolded } from "./cooking";
import { newPiece, type Kind, type Piece } from "./types";
import { scorePlate } from "./scoring";

/*
 * One progress per piece (after build #76): whatever face is down, a piece on the heat reads on
 * its meter as cooking on at the same pace, and a flip never makes the meter stall or jump.
 */

/** Every kind that can be turned over on the grill or the comal. */
const FLIPPABLE: Kind[] = ["patty", "bacon", "egg", "pineapple", "corn", "flour"];
const HEAT = 0.5;

/** Cook a piece for `secs` in steps of `dt`, flipping it at the given times; returns each step's reading. */
function cookWith(p: Piece, secs: number, flips: number[], dt = 0.05): number[] {
  const out: number[] = [];
  const at = [...flips];
  for (let t = 0; t < secs - 1e-9; t += dt) {
    if (at.length && t >= at[0]) {
      at.shift();
      const before = cookLevel(p);
      flipFaces(p);
      expect(cookLevel(p)).toBeCloseTo(before, 9);
    }
    grillStep(p, HEAT, dt);
    out.push(cookLevel(p));
  }
  return out;
}

describe("one progress per piece", () => {
  for (const kind of FLIPPABLE) {
    it(`${kind}: the meter never stalls or jumps back, whichever face is down`, () => {
      const steady = cookWith(newPiece(kind), 30, []);
      // Flipped early, flipped back late, flipped often: the same reading at every moment.
      for (const flips of [[3], [3, 4], [10, 10.5, 11, 20], [0.5, 1, 1.5, 2, 2.5, 3, 25]]) {
        const read = cookWith(newPiece(kind), 30, flips);
        for (let i = 1; i < read.length; i++) expect(read[i]).toBeGreaterThan(read[i - 1]);
        read.forEach((v, i) => expect(v).toBeCloseTo(steady[i], 9));
      }
    });
  }

  it("a folded quesadilla keeps cooking on whichever side is down", () => {
    const q = newPiece("flour");
    setFolded(q, true);
    const read = cookWith(q, 20, [4, 9, 9.5]);
    for (let i = 1; i < read.length; i++) expect(read[i]).toBeGreaterThan(read[i - 1]);
  });

  it("folding a tortilla or opening it back out leaves its meter where it was", () => {
    for (const flips of [[], [2], [1, 3]]) {
      const q = newPiece("flour");
      cookWith(q, 4, flips);
      const open = cookLevel(q);
      setFolded(q, true);
      expect(cookLevel(q)).toBeCloseTo(open, 9);
      cookWith(q, 3, [1]);
      const folded = cookLevel(q);
      setFolded(q, false);
      expect(cookLevel(q)).toBeCloseTo(folded, 9);
    }
  });

  it("scores a pineapple ring on the same reading its meter shows, flipped or not", () => {
    const order = { id: 1, name: "Pastor", price: 1, mods: [], layers: [{ kind: "pineapple" as Kind }], fries: false, drink: null, friesSize: "S" as const, drinkSize: "M" as const };
    const plateOf = (p: Piece) => ({ layers: [{ piece: p, offX: 0, offZ: 0 }], fries: null, drink: null });
    // Charred halfway on one side, then turned over: as grilled as one left on its first side.
    const flipped = newPiece("pineapple");
    cookWith(flipped, 12, [6]);
    const steady = newPiece("pineapple");
    cookWith(steady, 12, []);
    expect(cookLevel(flipped)).toBeCloseTo(cookLevel(steady), 9);
    expect(scorePlate(order, plateOf(flipped)).notes).toEqual(scorePlate(order, plateOf(steady)).notes);
    expect(scorePlate(order, plateOf(flipped)).notes).not.toContain("pineapple not grilled");
  });
});
