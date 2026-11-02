/**
 * Undo (DESIGN §30): the kitchen keeps a short history of the moves the player made with their
 * hands, so the Undo button in the header can put the last one back. A move is something carried
 * from one place to another: an ingredient taken from its pan, a patty moved from the grill to a
 * tray, a sandwich lifted into the press, a pie on the peel, a cup put under a nozzle, a squeeze of
 * sauce. Undoing it carries the thing back where it came from (back into its pan, bin or stack if
 * it came from there: the supply never runs out). Whatever cooked, melted, poured or burned since
 * stays as it is: undo moves things, it never turns back the clock.
 *
 * Never undone: serving (or a send-back: that tray's moves are forgotten), cooking and burning,
 * and the verbs on food in place (flips, folds, smashing, cracking an egg, cutting, pressing).
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
  | { at: "trash" };

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
 * dropped (whatever came after it already moved the thing on in a way that isn't undone), so the
 * button always offers the newest move that works, or nothing.
 */
export class History<T> {
  private moves: Move<T>[] = [];

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

  /** The newest move that can be undone, dropping any above it that no longer can. */
  top(ok: (m: Move<T>) => boolean): Move<T> | null {
    while (this.moves.length) {
      const m = this.moves[this.moves.length - 1];
      if (ok(m)) return m;
      this.moves.pop();
    }
    return null;
  }

  /** Take the newest move that can be undone off the history (to undo it). */
  pop(ok: (m: Move<T>) => boolean): Move<T> | null {
    const m = this.top(ok);
    if (m) this.moves.pop();
    return m;
  }

  /** A tray was served (or sent back): its moves can't be undone any more. */
  forgetTray(slot: number): void {
    this.moves = this.moves.filter((m) => !mentionsTray(m, slot));
  }

  clear(): void {
    this.moves = [];
  }
}
