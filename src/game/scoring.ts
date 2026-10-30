import { avgCook, bunToast } from "./cooking";
import type { ExpectedLayer, Layer, Order, Piece, Plate } from "./types";
import { DONENESS_TARGET } from "./types";

export interface ScoreResult {
  /** 0..100 */
  score: number;
  stars: 0 | 1 | 2 | 3;
  structure: number;
  quality: number;
  presentation: number;
  sides: number;
  notes: string[];
}

/** Longest common subsequence of layer kinds, returned as index pairs (expected, actual). */
export function alignLayers(expected: ExpectedLayer[], actual: Layer[]): [number, number][] {
  const n = expected.length;
  const m = actual.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        expected[i].kind === actual[j].piece.kind
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i].kind === actual[j].piece.kind) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export function strokeLength(p: Piece): number {
  const s = p.stroke;
  if (!s || s.length < 2) return 0;
  let len = 0;
  for (let k = 1; k < s.length; k++) len += Math.hypot(s[k].x - s[k - 1].x, s[k].z - s[k - 1].z);
  return len;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How well a piece meets its ticket line, 0..1, plus an optional complaint. */
export function layerQuality(exp: ExpectedLayer, piece: Piece): [number, string | null] {
  switch (exp.kind) {
    case "patty": {
      const target = DONENESS_TARGET[exp.doneness ?? "medium"];
      const [a, b] = piece.cook;
      if (Math.max(a, b) >= 0.95) return [0.05, "burnt patty"];
      if (Math.min(a, b) < 0.15) return [0.15, "raw patty"];
      const off = Math.abs(avgCook(piece) - target);
      const uneven = Math.abs(a - b);
      // Anywhere inside the doneness band is fine; beyond it the score drops quickly.
      const q = clamp01(1 - Math.max(0, off - 0.06) * 4 - Math.max(0, uneven - 0.2) * 1.6);
      let note: string | null = null;
      if (off > 0.12) note = avgCook(piece) > target ? "patty overcooked" : "patty undercooked";
      else if (uneven > 0.3) note = "patty cooked on one side";
      return [q, note];
    }
    case "bun": {
      const t = bunToast(piece);
      if (t >= 0.95) return [0.2, "burnt bun"];
      const toasted = t >= 0.35;
      if (exp.toasted && !toasted) return [0.5, "bun not toasted"];
      if (!exp.toasted && toasted) return [0.75, null];
      return [1, null];
    }
    case "bacon": {
      const t = avgCook(piece);
      if (t >= 1) return [0.2, "burnt bacon"];
      if (t < 0.4) return [0.35, "floppy bacon"];
      return [1, null];
    }
    case "egg": {
      const t = Math.max(piece.cook[0], piece.cook[1]);
      if (t >= 1) return [0.3, "rubbery egg"];
      if (t < 0.35) return [0.3, "runny egg white"];
      return [1, null];
    }
    case "ketchup":
    case "mustard": {
      const len = strokeLength(piece);
      if (len >= 1.1) return [1, null];
      if (len >= 0.5) return [0.65, `stingy ${exp.kind}`];
      return [0.35, `barely any ${exp.kind}`];
    }
    default:
      return [1, null];
  }
}

export function scorePlate(order: Order, plate: Plate): ScoreResult {
  const notes: string[] = [];
  const exp = order.layers;
  const act = plate.layers;
  const pairs = alignLayers(exp, act);

  const structure = act.length === 0 ? 0 : pairs.length / Math.max(exp.length, act.length);
  if (pairs.length < exp.length) {
    const matched = new Set(pairs.map(([i]) => i));
    const missing = exp.filter((_, i) => !matched.has(i)).map((l) => l.kind);
    notes.push(`missing ${[...new Set(missing)].join(", ")}`);
  }
  if (act.length > pairs.length) notes.push("extra stuff in there");
  else if (pairs.length === exp.length && !pairs.every(([i, j], k) => i === k && j === k)) {
    notes.push("layers out of order");
  }

  // Patties matter most, and one ruined layer spoils the whole bite: blend the weighted
  // average with the worst layer.
  let quality = 0;
  if (pairs.length) {
    let sum = 0;
    let weights = 0;
    let worst = 1;
    for (const [i, j] of pairs) {
      const [q, note] = layerQuality(exp[i], act[j].piece);
      const w = exp[i].kind === "patty" ? 3 : 1;
      sum += q * w;
      weights += w;
      worst = Math.min(worst, q);
      if (note && !notes.includes(note)) notes.push(note);
    }
    quality = 0.5 * (sum / weights) + 0.5 * worst;
  }

  let presentation = 0;
  if (act.length) {
    const avgOff = act.reduce((s, l) => s + Math.hypot(l.offX, l.offZ), 0) / act.length;
    presentation = clamp01(1 - avgOff / 0.3);
    if (presentation < 0.4) notes.push("messy stack");
  }

  let sideParts = 0;
  let sideScore = 0;
  if (order.fries) {
    sideParts++;
    if (!plate.fries) notes.push("forgot the fries");
    else {
      const c = plate.fries.cook;
      const q = c >= 1.05 ? 0.2 : c < 0.5 ? 0.4 : 1;
      if (q < 1) notes.push(c >= 1.05 ? "burnt fries" : "soggy fries");
      sideScore += q;
    }
  }
  if (order.drink) {
    sideParts++;
    if (!plate.drink) notes.push("forgot the drink");
    else if (plate.drink.flavor !== order.drink) {
      notes.push("wrong drink");
      sideScore += 0.3;
    } else {
      const f = plate.drink.fill;
      const q = f < 0.6 ? 0.4 : f < 0.78 ? 0.75 : 1;
      if (q < 1) notes.push("drink not full");
      sideScore += q;
    }
  }
  const sides = sideParts ? sideScore / sideParts : act.length ? 1 : 0;

  const burger = structure * (0.25 + 0.75 * quality) * (0.85 + 0.15 * presentation);
  const score = Math.round(clamp01(burger * 0.85 + sides * 0.15) * 100);
  const stars: ScoreResult["stars"] = score >= 90 ? 3 : score >= 70 ? 2 : score >= 45 ? 1 : 0;
  return { score, stars, structure, quality, presentation, sides, notes };
}

/** Money earned: part of the price is always paid, the rest scales with score; tips need speed too. */
export function payout(order: Order, score: number, patienceLeft: number): { pay: number; tip: number } {
  const s = score / 100;
  const pay = Math.round(order.price * (0.3 + 0.7 * s));
  const tip = s >= 0.7 ? Math.round(order.price * 0.4 * s * clamp01(patienceLeft)) : 0;
  return { pay, tip };
}
