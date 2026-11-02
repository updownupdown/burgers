import { describe, expect, it } from "vitest";
import { History, HISTORY_MAX, mentionsTray, samePlace, worthUndoing, type Move, type Place } from "./undo";

/*
 * Undo (DESIGN §30): which moves the header's Undo button keeps, and how stale ones drop away.
 */

const supply: Place = { at: "supply" };
const tray = (slot: number): Place => ({ at: "tray", slot });
const grill = (x: number, z: number): Place => ({ at: "grill", x, z });
const mv = (what: string, from: Place, to: Place): Move<string> => ({ what, from, to });

describe("which moves are kept", () => {
  it("keeps placing and moving things", () => {
    expect(worthUndoing(supply, tray(0))).toBe(true);
    expect(worthUndoing(grill(0, 0), tray(1))).toBe(true);
    expect(worthUndoing(tray(0), { at: "bay", i: 1 })).toBe(true);
    expect(worthUndoing(grill(0, 0), grill(1, 0))).toBe(true);
    expect(worthUndoing({ at: "peel" }, { at: "spot", i: 0 })).toBe(true);
  });
  it("keeps binning a thing that was somewhere, so it can come back", () => {
    expect(worthUndoing(grill(0, 0), { at: "trash" })).toBe(true);
    expect(worthUndoing(tray(2), { at: "trash" })).toBe(true);
  });
  it("skips fresh from the pan straight into the bin, and putting a thing back where it was", () => {
    expect(worthUndoing(supply, { at: "trash" })).toBe(false);
    expect(worthUndoing(grill(1, 0.5), grill(1.02, 0.5))).toBe(false);
    expect(worthUndoing(tray(1), tray(1))).toBe(false);
    expect(worthUndoing({ at: "bay", i: 0 }, { at: "bay", i: 0 })).toBe(false);
  });
  it("tells places apart", () => {
    expect(samePlace({ at: "bay", i: 0 }, { at: "bay", i: 1 })).toBe(false);
    expect(samePlace({ at: "board" }, { at: "bench" })).toBe(false);
    expect(samePlace({ at: "cup", x: 1, z: 1 }, { at: "cup", x: 2, z: 1 })).toBe(false);
  });
});

describe("the history", () => {
  it("undoes newest first", () => {
    const h = new History<string>();
    h.push(mv("bun", supply, tray(0)));
    h.push(mv("patty", grill(0, 0), tray(0)));
    expect(h.pop(() => true)?.what).toBe("patty");
    expect(h.pop(() => true)?.what).toBe("bun");
    expect(h.pop(() => true)).toBeNull();
  });
  it("drops moves that can't be undone any more and offers the next one", () => {
    const h = new History<string>();
    h.push(mv("bun", supply, tray(0)));
    h.push(mv("cheese", supply, grill(0, 0)));
    // The cheese melted into a patty that's since gone up whole: it isn't where it was put.
    const ok = (m: Move<string>) => m.what !== "cheese";
    expect(h.top(ok)?.what).toBe("bun");
    expect(h.size).toBe(1);
  });
  it("doesn't keep moves that aren't worth it", () => {
    const h = new History<string>();
    expect(h.push(mv("pickle", supply, { at: "trash" }))).toBe(false);
    expect(h.size).toBe(0);
  });
  it("forgets a tray's moves once it's served, never anyone else's", () => {
    const h = new History<string>();
    h.push(mv("bun", supply, tray(0)));
    h.push(mv("patty", tray(0), grill(1, 0)));
    h.push(mv("drink", { at: "cup", x: 0, z: 2 }, tray(1)));
    h.push(mv("egg", grill(0, 0), grill(1, 1)));
    h.forgetTray(0);
    expect(h.size).toBe(2);
    expect(h.pop(() => true)?.what).toBe("egg");
    expect(h.pop(() => true)?.what).toBe("drink");
  });
  it("only goes back so far", () => {
    const h = new History<number>();
    for (let i = 0; i < HISTORY_MAX + 5; i++) h.push({ what: i, from: supply, to: tray(i % 3) });
    expect(h.size).toBe(HISTORY_MAX);
    let last = -1;
    for (let m = h.pop(() => true); m; m = h.pop(() => true)) last = m.what;
    expect(last).toBe(5);
  });
  it("knows which moves touch a tray", () => {
    expect(mentionsTray(mv("x", tray(2), grill(0, 0)), 2)).toBe(true);
    expect(mentionsTray(mv("x", supply, tray(1)), 1)).toBe(true);
    expect(mentionsTray(mv("x", supply, tray(1)), 2)).toBe(false);
  });
});
