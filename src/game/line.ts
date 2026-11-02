import type { CrowdId } from "./business";
import { CROWD } from "./business";
import { DIFFICULTY, type Difficulty } from "./difficulty";
import { BREADS, PROTEINS, TORTILLAS, type Order } from "./types";

/**
 * The line outside the truck. People arrive over the shift and join the line (or walk past it
 * when it's long and they've never heard of the truck). They only step up to the window when
 * the player rings the bell, or on their own when the window is empty, so the player sets how
 * many orders they juggle. Waiting in line has its own patience; an order's patience starts
 * when they order. Fame (`popularity` in the save) decides how many people turn up and how
 * willing they are to wait.
 */

/** How many customers the bell may bring to the window at once. */
export const WINDOW: Record<Difficulty, number> = { chill: 2, balanced: 3, stressful: 3 };

/** Nobody joins a line longer than this. */
export const MAX_LINE = 6;

/**
 * Chance a passer-by joins a line already `lineLen` long, given how well known the truck is.
 * An empty line is always joined. Each person already waiting puts off an unknown truck's
 * customers (about 40% join behind one person, 17% behind two), while a famous truck's line
 * is part of the attraction.
 */
export function joinChance(lineLen: number, popularity: number): number {
  if (lineLen <= 0) return 1;
  if (lineLen >= MAX_LINE) return 0;
  const known = 0.35 + 0.65 * clamp01(popularity / 100);
  return Math.pow(known, lineLen);
}

/** Seconds someone will wait in line before ordering, before difficulty and crowd scale it. */
export const LINE_PATIENCE = 45;

export function linePatience(d: Difficulty, crowd: CrowdId): number {
  return LINE_PATIENCE * DIFFICULTY[d].patience * CROWD[crowd].patience;
}

/**
 * How fast line patience drains by place in line. Those about to order have waited longest
 * and are nearly there, so they almost never give up; the back of the line is fickle.
 */
export function lineDrain(position: number): number {
  return position === 0 ? 0.3 : position === 1 ? 0.65 : 1;
}

/**
 * Fame earned (or lost) by a shift's service alone, before the press has its say: happy
 * customers (a 4★ or 5★ opinion, reviewed or not) tell their friends; walk-outs and people who
 * gave up in line tell theirs. A truck few have heard of (under EARLY_WORD popularity) gets +1 per
 * two happy customers rather than three, so cooking well grows a small crowd past the daily fade.
 */
export const EARLY_WORD = 40;
export function wordOfMouth(stars: number[], walkedOut: number, leftLine: number, popularity = 100): number {
  const happy = stars.filter((s) => s >= 4).length;
  const gained = Math.min(6, Math.floor(happy / (popularity < EARLY_WORD ? 2 : 3)));
  const lost = Math.min(4, Math.floor(walkedOut / 2) + Math.floor(leftLine / 3));
  return gained - lost;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Work a dish takes beyond its layers, in seconds of window patience (after build #78): a folded
 * quesadilla is warmed, filled, folded, melted and flipped; a flatbread bakes; a calzone folds and
 * bakes slower; a panini is pressed. Burgers (smash included) need nothing extra.
 */
export const DISH_WORK = { quesadilla: 45, flatbread: 30, calzone: 40, panini: 20, cut: 8, garnish: 4 };

/** Base window patience, before layers, sides and the dish's work (was 50 for every dish). */
export const WINDOW_BASE = 40;

/**
 * How long a customer at the window waits for their order (seconds, before the bench, crowd and
 * pacing scale it): a base, then each layer, extra counted piece, protein and side, and the
 * dish's own work, so the regions feel about equally tight.
 */
export function windowPatience(order: Order): number {
  const slices = order.layers.reduce((n, l) => n + Math.max(0, (l.count ?? 1) - 1), 0);
  const proteins = order.layers.filter((l) => l.kind === "patty" || PROTEINS.has(l.kind)).length;
  const base = order.layers[0];
  const work = !base
    ? 0
    : TORTILLAS.has(base.kind) && base.folded
      ? DISH_WORK.quesadilla
      : base.kind === "dough"
        ? base.folded
          ? DISH_WORK.calzone
          : DISH_WORK.flatbread
        : BREADS.has(base.kind)
          ? DISH_WORK.panini
          : 0;
  return (
    WINDOW_BASE +
    order.layers.length * 7 +
    slices * 2 +
    proteins * 22 +
    work +
    (order.slice ? DISH_WORK.cut : 0) +
    (order.garnish ? DISH_WORK.garnish : 0) +
    (order.fries ? 30 : 0) +
    (order.poutine ? 10 : 0) +
    (order.drink ? 9 : 0)
  );
}
