/**
 * Undo (DESIGN §31): the kitchen keeps a short history of the moves the player made with their
 * hands, so the Undo button in the header can put the last one back. A move is something carried
 * from one place to another: an ingredient taken from its pan, a patty moved from the grill to a
 * tray, a sandwich lifted into the press, a pie on the peel, a cup put under a nozzle, a squeeze of
 * sauce. Undoing it carries the thing back where it came from (back into its pan, bin or stack if
 * it came from there: the supply never runs out). Whatever cooked, melted, poured or burned since
 * stays as it is: undo moves things, it never turns back the clock.
 *
 * Never undone: serving (or a send-back: that tray's moves are forgotten), cooking and burning,
 * and the verbs on food in place (flips, folds, smashing, cracking an egg, pressing). A cut can be
 * undone (after build #82): the knife's one tap is easy to give by mistake.
 *
 * This file holds the rules only; main.ts finds where things are and moves them.
 */

/** Where something was or went. Grill points are counter-local, as GrillItem keeps them. */
export type Place =
  | { at: "supply" }
  | { at: "tray"; slot: number }
  | { at: "grill"; x: number; z: number }
  | { at: "bay"; i: number }
  | { at: "board" }
  | { at: "bench" }
  | { at: "rack" }
  | { at: "peel" }
  | { at: "spot"; i: number }
  | { at: "basket"; i: number }
  | { at: "pack"; i: number }
  | { at: "cup"; x: number; z: number }
  | { at: "batter" }
  | { at: "trash" }
  /** A cut was made with the knife (its undo flies the knife back). */
  | { at: "knife" };

export interface Move<T> {
  what: T;
  from: Place;
  to: Place;
}

/** How many moves the button can go back. */
export const HISTORY_MAX = 24;

/** Two places are the same spot (a grill spot within a few centimetres). */
export function samePlace(a: Place, b: Place): boolean {
  if (a.at !== b.at) return false;
  if ((a.at === "grill" && b.at === "grill") || (a.at === "cup" && b.at === "cup")) return Math.hypot(a.x - b.x, a.z - b.z) < 0.06;
  if (a.at === "tray" && b.at === "tray") return a.slot === b.slot;
  if ("i" in a && "i" in b) return a.i === b.i;
  return true;
}

/**
 * Whether a finished move belongs in the history. Something set straight back where it came from
 * isn't a move, and something fresh from its pan dropped straight in the trash has nothing to give
 * back (the pan is full again either way).
 */
export function worthUndoing(from: Place, to: Place): boolean {
  if (samePlace(from, to)) return false;
  if (from.at === "supply" && to.at === "trash") return false;
  return true;
}

/** The move touches this tray (taken from it or put on it). */
export function mentionsTray(m: Move<unknown>, slot: number): boolean {
  return (m.from.at === "tray" && m.from.slot === slot) || (m.to.at === "tray" && m.to.slot === slot);
}

/**
 * The history: newest last. `ok` (from main.ts) says whether a move can still be undone: its thing
 * is still where the move put it, and its old place can take it back. A move that can't be is
 * dropped, and so is every older move of the same things (`keys`: the pieces, cups or cartons a
 * move carried): those things have moved on in a way undo doesn't follow, so carrying them back
 * by an older move would split them up (a sandwich undone layer by layer, sauce left alone on a
 * tray). The button always offers the newest move that works, or nothing.
 *
 * The caller must not ask while something is in the hand or flying back (main.ts: canUndo), as
 * every move of a thing that's in the air looks stale.
 */
export class History<T> {
  private moves: Move<T>[] = [];

  constructor(private keys: (m: Move<T>) => readonly object[] = () => []) {}

  get size(): number {
    return this.moves.length;
  }

  /** Note a finished move. False when it isn't one worth keeping (see worthUndoing). */
  push(m: Move<T>): boolean {
    if (!worthUndoing(m.from, m.to)) return false;
    this.moves.push(m);
    if (this.moves.length > HISTORY_MAX) this.moves.shift();
    return true;
  }

  /** Drop the newest move, and every older one that carried any of the same things. */
  private dropTop(): void {
    const m = this.moves.pop()!;
    const gone = new Set(this.keys(m));
    if (gone.size) this.moves = this.moves.filter((o) => !this.keys(o).some((k) => gone.has(k)));
  }

  /** The newest move that can be undone, dropping any above it that no longer can (with their things' older moves). */
  top(ok: (m: Move<T>) => boolean): Move<T> | null {
    while (this.moves.length) {
      const m = this.moves[this.moves.length - 1];
      if (ok(m)) return m;
      this.dropTop();
    }
    return null;
  }

  /** Take the newest move that can be undone off the history (to undo it). */
  pop(ok: (m: Move<T>) => boolean): Move<T> | null {
    const m = this.top(ok);
    if (m) this.moves.pop();
    return m;
  }

  /** A tray was served (or sent back): its moves can't be undone any more, nor older moves of what was on it. */
  forgetTray(slot: number): void {
    const gone = new Set(this.moves.filter((m) => mentionsTray(m, slot)).flatMap((m) => [...this.keys(m)]));
    this.moves = this.moves.filter((m) => !mentionsTray(m, slot) && !this.keys(m).some((k) => gone.has(k)));
  }

  clear(): void {
    this.moves = [];
  }
}
