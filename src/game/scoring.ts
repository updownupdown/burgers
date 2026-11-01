import { avgCook, bunToast, CHAR_FACE, cookLevel, COOK_SCALE, friesQuality, friesZone, FRIES_ZONE, isFlipped, isMelted, DRINK_FILL, MARKED, pattyDoneness, SALT } from "./cooking";
import type { Drink, ExpectedLayer, Fries, Layer, Order, Piece, Plate } from "./types";
import { COUNTED, KIND_LABEL, SAUCE_RADIUS, SIZE_LABEL } from "./types";

export interface ScoreResult {
  /** 0..100 */
  score: number;
  stars: 0 | 1 | 2 | 3;
  structure: number;
  quality: number;
  presentation: number;
  sides: number;
  notes: string[];
  /** Nice things that softened the review: a free side they didn't order. */
  perks: string[];
  /** Something a customer would hand back whatever the score: a raw or burnt layer, a missing layer, a forgotten or wrong side. */
  faulty: boolean;
  /** A whole ordered item left off the tray (the burger, the fries or the drink), as its note. Always sent back once, even on Chill. */
  missing: string | null;
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

/**
 * Counted toppings go on one piece at a time; a run of the same one in a row is a single layer
 * of `count` pieces. Everything else is one layer per piece.
 */
export function collapseCounted(layers: Layer[]): (Layer & { count: number })[] {
  const out: (Layer & { count: number })[] = [];
  for (const l of layers) {
    const last = out[out.length - 1];
    if (last && COUNTED.has(l.piece.kind) && last.piece.kind === l.piece.kind) last.count++;
    else out.push({ ...l, count: 1 });
  }
  return out;
}

/** A counted layer against what was ordered: short is skimpy; one or two over is generous; more is a mess. */
export function countQuality(want: number, got: number, kind: string): [number, string | null] {
  const label = KIND_LABEL[kind as keyof typeof KIND_LABEL].toLowerCase();
  if (got < want) return [Math.max(0.3, 1 - (0.5 * (want - got)) / want), `skimpy on the ${label}`];
  if (got > want + 2) return [0.8, `way too many ${label}`];
  return [1, null];
}

/**
 * Sauce is judged by how much of the patty it covers: the share of the middle of the bun (out to
 * 85% of its radius) that lies under the line. A quarter to a half is just right.
 */
export const SAUCE_BAND = { stingy: 0.12, lo: 0.25, hi: 0.5, drown: 0.66 };
const COV_N = 40;
const COV_INNER = 0.85;
const COV_CELL = 2 / COV_N;
const covInner: number[] = [];
for (let j = 0; j < COV_N; j++)
  for (let i = 0; i < COV_N; i++) {
    const x = -1 + (i + 0.5) * COV_CELL;
    const z = -1 + (j + 0.5) * COV_CELL;
    if (x * x + z * z <= COV_INNER * COV_INNER) covInner.push(j * COV_N + i);
  }

export function sauceCoverage(stroke: { x: number; z: number }[] | undefined): number {
  if (!stroke || !stroke.length) return 0;
  const grid = new Uint8Array(COV_N * COV_N);
  const r = SAUCE_RADIUS;
  const dab = (x: number, z: number) => {
    const i0 = Math.max(0, Math.floor((x - r + 1) / COV_CELL));
    const i1 = Math.min(COV_N - 1, Math.floor((x + r + 1) / COV_CELL));
    const j0 = Math.max(0, Math.floor((z - r + 1) / COV_CELL));
    const j1 = Math.min(COV_N - 1, Math.floor((z + r + 1) / COV_CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cx = -1 + (i + 0.5) * COV_CELL - x;
        const cz = -1 + (j + 0.5) * COV_CELL - z;
        if (cx * cx + cz * cz <= r * r) grid[j * COV_N + i] = 1;
      }
  };
  dab(stroke[0].x, stroke[0].z);
  for (let k = 1; k < stroke.length; k++) {
    const a = stroke[k - 1];
    const b = stroke[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (r * 0.5)));
    for (let t = 1; t <= n; t++) dab(a.x + ((b.x - a.x) * t) / n, a.z + ((b.z - a.z) * t) / n);
  }
  let hit = 0;
  for (const c of covInner) hit += grid[c];
  return hit / covInner.length;
}

export type SauceWord = "stingy" | "light" | "perfect" | "heavy" | "drowning";
/** How a coverage reads to the customer, 0..1, with a word for the live score. */
export function sauceVerdict(cov: number): { q: number; word: SauceWord } {
  const b = SAUCE_BAND;
  if (cov < b.lo) return { q: 0.35 + (0.65 * cov) / b.lo, word: cov < b.stingy ? "stingy" : "light" };
  if (cov <= b.hi) return { q: 1, word: "perfect" };
  return { q: Math.max(0.4, 1 - (cov - b.hi) * 2.2), word: cov > b.drown ? "drowning" : "heavy" };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Extra score (out of 1) for each patty with grill marks, up to two. */
export const GRILL_MARK_BONUS = 0.04;

/** A rare or well-done patty: acceptable, not ideal. */
export const PATTY_OFF = 0.8;

/** How well a piece meets its ticket line, 0..1, plus an optional complaint. */
export function layerQuality(exp: ExpectedLayer, piece: Piece): [number, string | null] {
  switch (exp.kind) {
    case "patty": {
      // Every patty goes out medium. Rare and well done are acceptable but not ideal; raw and
      // burnt are not.
      // Doneness is the middle of the patty (the average of its faces). A face left down too
      // long chars even when the middle is fine: flip it to cook evenly.
      const level = pattyDoneness(avgCook(piece));
      let [q, note]: [number, string | null] =
        level === "burnt" ? [0.05, "burnt patty"] : level === "raw" ? [0.15, "raw patty"] : level === "medium" ? [1, null] : [PATTY_OFF, level === "rare" ? "patty a bit rare" : "patty a bit well done"];
      if (level !== "burnt" && Math.max(...piece.cook) >= CHAR_FACE) [q, note] = [Math.min(q, 0.6), "charred on one side"];
      if (exp.smashed && !piece.smashed) return [q * 0.6, "wanted it smashed"];
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
      const t = cookLevel(piece);
      if (t >= COOK_SCALE.bacon.burnt) return [0.2, "burnt bacon"];
      if (t < COOK_SCALE.bacon.done) return [0.35, "floppy bacon"];
      if (t >= COOK_SCALE.bacon.over) return [0.85, "bacon a bit dark"];
      return [1, null];
    }
    case "pineapple": {
      const t = Math.max(piece.cook[0], piece.cook[1]);
      if (t >= 1) return [0.2, "burnt pineapple"];
      if (t < 0.35) return [0.5, "pineapple not grilled"];
      return [1, null];
    }
    case "egg": {
      const t = cookLevel(piece);
      if (t >= COOK_SCALE.egg.burnt) return [0.3, "rubbery egg"];
      if (t < COOK_SCALE.egg.done) return [0.3, "runny egg white"];
      // Sunny side up or flipped once (over easy), as the menu says.
      if (isFlipped(piece) !== !!exp.flipped) return [0.75, exp.flipped ? "wanted the egg over easy" : "wanted the egg sunny side up"];
      if (t >= COOK_SCALE.egg.over) return [0.85, "egg a bit overdone"];
      return [1, null];
    }
    case "ketchup":
    case "mustard": {
      const { q, word } = sauceVerdict(sauceCoverage(piece.stroke));
      if (word === "stingy") return [q, `stingy with the ${exp.kind}`];
      if (word === "drowning") return [q, `drowning in ${exp.kind}`];
      return [q, null];
    }
    case "cheese":
      if (exp.melted && !isMelted(piece)) return [0.55, "cheese not melted"];
      return [1, null];
    default:
      return [1, null];
  }
}

/**
 * Cooked food waiting on a tray keeps well for about 40 seconds, then goes cold and dry over the
 * next minute. (`Piece.held` counts the seconds; the warm grill zone is where to park food instead.)
 */
export const HOLD_GRACE = 40;
export const HOLD_RUIN = 100;
export function heldPenalty(piece: Piece): number {
  return clamp01(((piece.held ?? 0) - HOLD_GRACE) / (HOLD_RUIN - HOLD_GRACE)) * 0.45;
}

export function starsFor(score: number): ScoreResult["stars"] {
  return score >= 90 ? 3 : score >= 70 ? 2 : score >= 45 ? 1 : 0;
}

export function scorePlate(order: Order, plate: Plate): ScoreResult {
  const notes: string[] = [];
  const exp = order.layers;
  const act = collapseCounted(plate.layers);
  const pairs = alignLayers(exp, act);

  const structure = act.length === 0 ? 0 : pairs.length / Math.max(exp.length, act.length);
  const kinds = (ls: { kind: string }[]) => ls.map((l) => l.kind).sort().join();
  if (pairs.length < exp.length && kinds(exp) === kinds(act.map((l) => l.piece))) {
    // Everything's there, just stacked in the wrong order.
    notes.push("layers out of order");
  } else {
    if (pairs.length < exp.length) {
      const matched = new Set(pairs.map(([i]) => i));
      const missing = exp.filter((_, i) => !matched.has(i)).map((l) => l.kind);
      notes.push(`missing ${[...new Set(missing)].join(", ")}`);
    }
    if (act.length > pairs.length) {
      const used = new Set(pairs.map(([, j]) => j));
      const extras = act.filter((_, j) => !used.has(j)).map((l) => l.piece.kind);
      const unwanted = order.mods.find((m) => m.type === "no" && extras.includes(m.kind));
      notes.push(unwanted ? `I said no ${KIND_LABEL[unwanted.kind].toLowerCase()}` : "extra stuff in there");
    }
  }

  // Patties matter most, and one ruined layer spoils the whole bite: blend the weighted
  // average with the worst layer.
  let quality = 0;
  let generous = 0;
  let worstLayer = 1;
  if (pairs.length) {
    let sum = 0;
    let weights = 0;
    let worst = 1;
    for (const [i, j] of pairs) {
      let [q0, note] = layerQuality(exp[i], act[j].piece);
      if (COUNTED.has(exp[i].kind)) {
        const want = exp[i].count ?? 1;
        [q0, note] = countQuality(want, act[j].count, exp[i].kind);
        // A piece or two more than the recipe reads as generous.
        generous += Math.min(2, Math.max(0, act[j].count - want));
      }
      const dry = heldPenalty(act[j].piece);
      const q = q0 * (1 - dry);
      if (dry > 0.15 && !notes.includes("been sitting a while")) notes.push("been sitting a while");
      const w = exp[i].kind === "patty" ? 3 : 1;
      sum += q * w;
      weights += w;
      worst = Math.min(worst, q);
      worstLayer = Math.min(worstLayer, q);
      if (note && !notes.includes(note)) notes.push(note);
    }
    quality = 0.5 * (sum / weights) + 0.5 * worst;
  }

  let presentation = 0;
  // Counted toppings are spread around the burger on purpose; the rest should sit straight.
  const centred = plate.layers.filter((l) => !COUNTED.has(l.piece.kind));
  if (centred.length) {
    const avgOff = centred.reduce((s, l) => s + Math.hypot(l.offX, l.offZ), 0) / centred.length;
    presentation = clamp01(1 - avgOff / 0.3);
    if (presentation < 0.4) notes.push("messy stack");
  }

  let sideParts = 0;
  let sideScore = 0;
  let friesQ = 0;
  let drinkQ = 0;
  if (order.fries) {
    sideParts++;
    if (!plate.fries) notes.push(order.poutine ? "forgot the poutine" : "forgot the fries");
    else friesQ = friesScore(order, plate.fries, notes);
    sideScore += friesQ;
  }
  if (order.drink) {
    sideParts++;
    if (!plate.drink) notes.push("forgot the drink");
    else drinkQ = drinkScore(order, plate.drink, notes);
    sideScore += drinkQ;
  }
  const sides = sideParts ? sideScore / sideParts : act.length ? 1 : 0;

  let total: number;
  if (exp.length === 0) {
    // No burger ordered. A poutine is the meal with a drink on the side; otherwise it's just a
    // drink and/or fries, each counting the same. A burger nobody asked for is a mild surprise.
    if (act.length) notes.push("didn't order a burger");
    const sidesQ = order.poutine ? (order.drink ? 0.75 * friesQ + 0.25 * drinkQ : friesQ) : sideParts ? sideScore / sideParts : 0;
    total = sidesQ * (act.length ? 0.8 : 1);
  } else {
    const burger = structure * (0.25 + 0.75 * quality) * (0.85 + 0.15 * presentation);
    total = burger * 0.85 + sides * 0.15;
  }

  // Patties seared on the grille come out with grill marks: a little extra for each one.
  const marked = pairs.filter(([i, j]) => exp[i].kind === "patty" && Math.max(...(act[j].piece.marks ?? [0, 0])) >= MARKED && layerQuality(exp[i], act[j].piece)[0] >= PATTY_OFF).length;
  const perks: string[] = [];
  if (marked > 0 && total > 0) {
    total = Math.min(1, total + GRILL_MARK_BONUS * Math.min(2, marked));
    perks.push("grill marks");
  }

  // A side they didn't order, made well, softens a bad review: the worse it was going, the more
  // a freebie helps. It never lifts a great meal much, and a bad freebie doesn't count.
  if (generous > 0 && total < 1) {
    total = Math.min(1, total + 0.025 * Math.min(3, generous));
    perks.push("extra toppings");
  }
  const freebie = (q: number, what: string) => {
    if (q < 0.5) return;
    total += Math.min(0.12, (1 - total) * 0.35) * q;
    perks.push(what);
  };
  if (!order.fries && plate.fries && plate.fries.fill > 0.5) freebie(friesScore({ ...order, poutine: !!plate.fries.curds }, plate.fries, []), plate.fries.curds ? "free poutine" : "free fries");
  if (!order.drink && plate.drink && plate.drink.fill > 0.6) freebie(Math.min(1, plate.drink.fill), "free drink");

  const score = Math.round(clamp01(total) * 100);
  const sideMissing = (order.fries && (!plate.fries || friesQ < 0.35)) || (!!order.drink && (!plate.drink || drinkQ < 0.35));
  const faulty = (exp.length > 0 && (pairs.length < exp.length || worstLayer < 0.35)) || sideMissing;
  const missing = order.drink && !plate.drink ? "forgot the drink" : order.fries && !plate.fries ? (order.poutine ? "forgot the poutine" : "forgot the fries") : exp.length > 0 && plate.layers.length === 0 ? "forgot the burger" : null;
  return { score, stars: starsFor(score), structure, quality, presentation, sides, notes, perks, faulty, missing };
}

/** Fries or poutine against the order, 0..1. */
function friesScore(order: Order, fries: Fries, notes: string[]): number {
  const c = fries.cook;
  let q = friesQuality(c);
  const zone = friesZone(c);
  if (zone === "under") notes.push("soggy fries");
  else if (zone === "over") notes.push(c >= FRIES_ZONE.burnt ? "burnt fries" : "overdone fries");
  if (fries.size !== order.friesSize) {
    q *= 0.5;
    notes.push(`wanted ${SIZE_LABEL[order.friesSize].toLowerCase()} fries`);
  } else if (fries.fill < 0.95) {
    q *= 0.6;
    notes.push(order.poutine ? "skimpy poutine" : "skimpy fries");
  }
  if (order.poutine) {
    if (!fries.curds) {
      q *= 0.5;
      notes.push("where are the curds?");
    }
    if (!fries.gravy) {
      q *= 0.5;
      notes.push("no gravy on the poutine");
    }
  } else {
    // Salt is optional but plain fries without it taste flat, and too much is worse; poutine toppings on plain fries are a surprise.
    const salt = fries.salt ?? 0;
    if (salt <= 0) {
      q *= 0.85;
      notes.push("fries needed salt");
    } else if (salt < SALT.low) {
      q *= 0.93;
      notes.push("fries could use more salt");
    } else if (salt > SALT.high) {
      q *= 0.8;
      notes.push("fries too salty");
    }
    if (fries.curds || fries.gravy) q *= 0.8;
  }
  return q;
}

/** A drink against the order, 0..1. */
function drinkScore(order: Order, d: Drink, notes: string[]): number {
  if (d.flavor !== order.drink) {
    notes.push("wrong drink");
    return 0.3;
  }
  const f = d.fill;
  let q = f < 0.6 ? 0.4 : f < DRINK_FILL.full ? 0.75 : 1;
  if (q < 1) notes.push("drink not full");
  if (d.size !== order.drinkSize) {
    q *= 0.5;
    notes.push(`wanted a ${SIZE_LABEL[order.drinkSize].toLowerCase()} drink`);
  }
  if (order.ice === true && !d.ice) {
    q *= 0.7;
    notes.push("forgot the ice");
  } else if (order.ice === false && d.ice) {
    q *= 0.6;
    notes.push("asked for no ice");
  }
  // A drink handed over without a lid is a drink about to be spilled.
  if (!d.lid) {
    q *= 0.8;
    notes.push("no lid");
  }
  return q;
}

/** Money earned: part of the price is always paid, the rest scales with score; tips need speed too. */
export function payout(order: Order, score: number, patienceLeft: number): { pay: number; tip: number } {
  const s = score / 100;
  const pay = Math.round(order.price * (0.3 + 0.7 * s));
  const tip = s >= 0.7 ? Math.round(order.price * 0.4 * s * clamp01(patienceLeft)) : 0;
  return { pay, tip };
}
