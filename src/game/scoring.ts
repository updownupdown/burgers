import { CROOKED, cutFactor } from "./knife";
import { avgCook, bunToast, CHAR_FACE, cookLevel, COOK_SCALE, cookZone, friesQuality, friesZone, FRY_ZONE, isFlipped, isMelted, DRINK_FILL, MARKED, paleSide, darkSide, pattyDoneness, SALT } from "./cooking";
import type { Drink, ExpectedLayer, Fries, Kind, Layer, Order, Piece, Plate } from "./types";
import { BREADS, COUNTED, FRY_LABEL, fryOf, KIND_LABEL, SAUCE_RADIUS, sauceRadius, SIZE_LABEL, SUGARED, TORTILLAS, type FryKind } from "./types";

export interface ScoreResult {
  /** 0..100 */
  score: number;
  /** What the customer thinks of it, 1..5 (see starsFor). */
  stars: 1 | 2 | 3 | 4 | 5;
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

export function sauceCoverage(stroke: { x: number; z: number }[] | undefined, r = SAUCE_RADIUS): number {
  if (!stroke || !stroke.length) return 0;
  const grid = new Uint8Array(COV_N * COV_N);
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

/**
 * A quick squeeze (a tap on the bottle): a loose spiral that covers about a fifth of the top,
 * "a bit more" on the meter. Good enough; drawing it yourself is how you get Perfect.
 */
export function quickSauceStroke(target = 0.2): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  for (let k = 0; k <= 200; k++) {
    const t = k / 12;
    const r = 0.06 * t;
    if (r > 0.75) break;
    pts.push({ x: Math.cos(t) * r, z: Math.sin(t) * r });
    if (k % 4 === 0 && sauceCoverage(pts) >= target) break;
  }
  return pts;
}

/**
 * Dragging a bottle up from the caddy, the thumb crosses the near edge of the bun on its way in:
 * no sauce lands until the nozzle has come in over the middle of the bun (within SAUCE_GRACE of its
 * radius). After that the edge is fair game: going back out there is meant.
 */
export const SAUCE_GRACE = 0.7;
/** Whether the nozzle at `r` (bun radii from the middle) squeezes, and whether the grace is over. */
export function sauceGate(armed: boolean, r: number): { armed: boolean; squeeze: boolean } {
  const on = armed || r <= SAUCE_GRACE;
  return { armed: on, squeeze: on };
}

export type SauceWord = "stingy" | "light" | "perfect" | "heavy" | "drowning";
/**
 * Tomato sauce on a flatbread is spread with the ladle in a spiral: it should cover most of the
 * base (from `lo`), and can't really drown it.
 */
export const LADLE_BAND = { stingy: 0.3, lo: 0.55 };

/** How a coverage reads to the customer, 0..1, with a word for the live score. */
export function sauceVerdict(cov: number, kind?: string): { q: number; word: SauceWord } {
  if (kind === "redsauce") {
    const l = LADLE_BAND;
    if (cov < l.lo) return { q: 0.4 + (0.6 * cov) / l.lo, word: cov < l.stingy ? "stingy" : "light" };
    return { q: 1, word: "perfect" };
  }
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
      // One reading for the ring, whichever side went down (cookLevel).
      const t = cookLevel(piece);
      if (t >= COOK_SCALE.pineapple.burnt) return [0.2, "burnt pineapple"];
      if (t < COOK_SCALE.pineapple.done) return [0.5, "pineapple not grilled"];
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
    case "corn":
    case "flour": {
      // Taco tortillas: pale and stiff, soft and spotted (done), hard. A quesadilla's shell is
      // folded over its filling and crisped on both sides.
      if (exp.folded && !piece.folded) return [0.45, "wanted it folded"];
      const t = cookLevel(piece);
      const z = cookZone(exp.kind, t);
      if (z === "burnt") return [0.15, piece.folded ? "burnt quesadilla" : "burnt tortilla"];
      if (piece.folded && Math.max(...piece.cook) >= CHAR_FACE) return [0.6, "charred on one side"];
      if (z === "under") return [0.5, piece.folded ? "quesadilla's still pale" : "cold, stiff tortilla"];
      if (piece.folded && Math.min(...piece.cook) < 0.2) return [0.7, "only crisp on one side"];
      if (z === "over") return [0.85, piece.folded ? "quesadilla a bit dark" : "tortilla a bit hard"];
      return [1, null];
    }
    case "tostada": {
      const z = cookZone("tostada", cookLevel(piece));
      if (z === "burnt") return [0.15, "burnt tostada"];
      if (z === "under") return [0.45, "soggy tostada shell"];
      if (z === "over") return [0.85, "tostada a bit dark"];
      return [1, null];
    }
    case "jack":
      if (exp.melted && !isMelted(piece)) return [0.55, "cheese not melted"];
      return [1, null];
    case "dough": {
      // A flatbread: judged on its palest side (it has to be baked through) and its darkest (it
      // mustn't scorch); one baked on one side only is fine, just not as good as an even one. A
      // calzone has to be folded.
      if (exp.folded && !piece.folded) return [0.45, "wanted a calzone, folded"];
      if (!exp.folded && piece.folded) return [0.5, "didn't want it folded"];
      const t = paleSide(piece);
      const dark = darkSide(piece);
      const z = cookZone("dough", t);
      const word = piece.folded ? "calzone" : "crust";
      if (dark >= COOK_SCALE.dough.burnt) return [0.15, `burnt ${word}`];
      if (t < 0.12) return [0.1, "raw dough"];
      if (z === "under") return [0.5, dark >= COOK_SCALE.dough.done ? "pale on one side" : "pale, doughy crust"];
      if (z === "over") return [0.85, `${word} a bit dark`];
      if (dark >= COOK_SCALE.dough.over) return [0.7, "scorched on one side"];
      if (dark - t > UNEVEN) return [UNEVEN_Q, "baked on one side"];
      return [1, null];
    }
    case "redsauce":
    case "oil":
    case "honey": {
      const { q, word } = sauceVerdict(sauceCoverage(piece.stroke, sauceRadius(exp.kind)), exp.kind);
      const name = exp.kind === "redsauce" ? "sauce" : KIND_LABEL[exp.kind].toLowerCase();
      if (exp.after && (piece.cook[0] ?? 0) > 0.1) return [Math.min(q, 0.6), `${name} went in the oven`];
      if (word === "stingy") return [q, `stingy with the ${name}`];
      if (word === "drowning") return [q, `drowning in ${name}`];
      return [q, null];
    }
    case "basil":
    case "rocket":
      if (exp.after && (piece.cook[0] ?? 0) > 0.1) return [0.6, `wilted ${KIND_LABEL[exp.kind].toLowerCase()}`];
      return [1, null];
    case "ketchup":
    case "mustard":
    case "pesto":
    case "aioli":
    case "redsalsa":
    case "greensalsa":
    case "crema": {
      const { q, word } = sauceVerdict(sauceCoverage(piece.stroke));
      const name = KIND_LABEL[exp.kind].toLowerCase();
      if (word === "stingy") return [q, `stingy with the ${name}`];
      if (word === "drowning") return [q, `drowning in ${name}`];
      return [q, null];
    }
    case "cheese":
    case "mozzarella":
    case "cheddar":
    case "blue":
      if (exp.melted && !isMelted(piece)) return [0.55, "cheese not melted"];
      return [1, null];
    case "ciabatta":
    case "sourdough": {
      // Panini bread: pale, golden with press lines, dark, burnt.
      const z = cookZone(exp.kind, cookLevel(piece));
      if (z === "burnt") return [0.15, "burnt bread"];
      if (exp.toasted && z === "under") return [0.5, "bread not pressed"];
      if (z === "over") return [0.85, "bread a bit dark"];
      return [1, null];
    }
    case "chicken": {
      const z = cookZone("chicken", cookLevel(piece));
      if (z === "under") return [0.1, "pink chicken"];
      if (z === "burnt") return [0.1, "burnt chicken"];
      if (z === "over") return [0.8, "dry chicken"];
      return [1, null];
    }
    case "veggie": {
      const z = cookZone("veggie", cookLevel(piece));
      if (z === "under") return [0.45, "soggy veggie patty"];
      if (z === "burnt") return [0.1, "burnt veggie patty"];
      if (z === "over") return [0.85, "veggie patty a bit dark"];
      return [1, null];
    }
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

/**
 * Stars out of five for a score. A good order (70+) is 4★ and a great one (90+) 5★; what used to
 * be a 1★ order on the old three-star scale (45 to 69) splits into 2★ and 3★, and anything worse is 1★.
 */
export const STAR_AT = { 5: 90, 4: 70, 3: 57, 2: 45 } as const;
export function starsFor(score: number): ScoreResult["stars"] {
  return score >= STAR_AT[5] ? 5 : score >= STAR_AT[4] ? 4 : score >= STAR_AT[3] ? 3 : score >= STAR_AT[2] ? 2 : 1;
}

/**
 * Red Rock's dishes are judged by what's on them, not the order it went on in: tacos in the rack
 * show every topping, a quesadilla's filling is folded inside, a tostada is built flat. The base
 * (tortillas or the shell) stays first and the rest is sorted into the ticket's order, so a
 * scoop of pork after the onion still counts with the others.
 */
export function dishOrder(expected: ExpectedLayer[], layers: Layer[]): Layer[] {
  const base = expected[0]?.kind;
  if (!base || !(TORTILLAS.has(base) || base === "tostada" || base === "dough")) return layers;
  const rank = (k: Kind) => {
    const i = expected.findIndex((e) => e.kind === k);
    return i < 0 ? expected.length : i;
  };
  const head = layers.filter((l) => l.piece.kind === base);
  const rest = layers.filter((l) => l.piece.kind !== base);
  return [...head, ...rest.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.piece.kind) - rank(b.l.piece.kind) || a.i - b.i).map((x) => x.l)];
}

/** Extra score (out of 1) when a taco's corn tortillas were pressed by hand (Sun Valley); it also adds to the tip. */
export const HANDMADE_BONUS = 0.04;

/** Extra score (out of 1) for a flatbread baked evenly all round: leopard spots on the crust. */
export const LEOPARD_BONUS = 0.04;
/** Crust this even all round at the end counts as evenly baked (leopard spots). */
export const LEOPARD_EVEN = 0.15;
/** A crust more uneven than this (its dark side ahead of its pale side) was baked on one side: done, but marked down a little. */
export const UNEVEN = 0.2;
export const UNEVEN_Q = 0.7;
/** A flatbread's crust came out with leopard spots: golden and even all round, never past the band. */
export function leopard(piece: Piece): boolean {
  const sc = COOK_SCALE.dough;
  const pale = paleSide(piece);
  const dark = darkSide(piece);
  return pale >= sc.done && dark < sc.over && dark - pale <= LEOPARD_EVEN;
}
/** Mushrooms on a flatbread want a long bake: roasted from here (OVEN_ROAST, about 24 s in the oven). */
export const MUSHROOM_ROAST = 1;

export function scorePlate(order: Order, plate: Plate): ScoreResult {
  const notes: string[] = [];
  const exp = order.layers;
  const act = collapseCounted(dishOrder(exp, plate.layers));
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
        // Counted cheese still has to melt; the avocado on an open toast must never be heated.
        if (exp[i].melted && !isMelted(act[j].piece)) [q0, note] = [Math.min(q0, 0.55), "cheese not melted"];
        // Taco tortillas are counted, and the warmth of the run is judged on its worst one. A taco
        // short is a lot worse than a pickle short.
        if (TORTILLAS.has(exp[i].kind)) {
          if (act[j].count < want) [q0, note] = [Math.max(0.2, act[j].count / want - 0.15), want - act[j].count > 1 ? "tacos short" : "a taco short"];
          const run = plate.layers.filter((l) => l.piece.kind === exp[i].kind).map((l) => layerQuality(exp[i], l.piece));
          const worst = run.reduce((a, b) => (b[0] < a[0] ? b : a), [1, null] as [number, string | null]);
          if (worst[0] < q0) [q0, note] = worst;
        }
        if (exp[i].cold && (act[j].piece.cook[0] ?? 0) > 0.15) [q0, note] = [Math.min(q0, 0.55), "warm avocado"];
        // On a flatbread: mushrooms want the long bake (sealed in a calzone they steam); basil and the rest that go on after shouldn't have been baked.
        if (exp[i].kind === "mushroom" && exp[0]?.kind === "dough" && !exp[0].folded && !exp[i].after) {
          const pale = plate.layers.filter((l) => l.piece.kind === "mushroom").some((l) => (l.piece.cook[0] ?? 0) < MUSHROOM_ROAST);
          if (pale) [q0, note] = [Math.min(q0, 0.8), "mushrooms a bit pale"];
        }
        if (exp[i].after && plate.layers.some((l) => l.piece.kind === exp[i].kind && (l.piece.cook[0] ?? 0) > 0.1)) [q0, note] = [Math.min(q0, 0.6), `${KIND_LABEL[exp[i].kind].toLowerCase()} went in the oven`];
        // A piece or two more than the recipe reads as generous.
        generous += Math.min(2, Math.max(0, act[j].count - want));
      }
      const dry = heldPenalty(act[j].piece);
      const q = q0 * (1 - dry);
      if (dry > 0.15 && !notes.includes("been sitting a while")) notes.push("been sitting a while");
      // The main part weighs most: a patty, a pressed protein, a quesadilla's shell or a taco's tortillas.
      const w = exp[i].kind === "patty" || exp[i].kind === "chicken" || exp[i].kind === "veggie" || exp[i].kind === "dough" || (exp[i].kind === "flour" && exp[i].folded) ? 3 : exp[i].kind === "corn" ? 2 : 1;
      sum += q * w;
      weights += w;
      worst = Math.min(worst, q);
      worstLayer = Math.min(worstLayer, q);
      if (note && !notes.includes(note)) notes.push(note);
    }
    quality = 0.5 * (sum / weights) + 0.5 * worst;
  }

  // Harbor City cuts its paninis in half on the board; Port Amber cuts its flatbreads in four.
  if (order.slice && exp.length) {
    const top = plate.layers[plate.layers.length - 1]?.piece;
    const base = plate.layers[0]?.piece;
    if (base?.kind === "dough") {
      const cuts = base.cuts ?? 0;
      if (cuts < 2) {
        quality *= cuts ? 0.94 : 0.88;
        notes.push(cuts ? "only cut in half" : "wanted it cut in four");
      } else {
        // The knife (DESIGN §30): a crooked cut costs a little.
        quality *= cutFactor(base.cutQ);
        if ((base.cutQ ?? 1) < CROOKED) notes.push("cut a bit crooked");
      }
    } else if (top && BREADS.has(top.kind) && !top.cut) {
      quality *= 0.88;
      notes.push("wanted it cut in half");
    } else if (top && BREADS.has(top.kind)) {
      quality *= cutFactor(top.cutQ);
      if ((top.cutQ ?? 1) < CROOKED) notes.push("cut a bit crooked");
    }
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
    if (!plate.fries) notes.push(`forgot the ${sideName(order)}`);
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

  // A flatbread baked evenly comes out with leopard spots on its crust: a little extra, like grill marks.
  const dough = exp[0]?.kind === "dough" ? plate.layers.find((l) => l.piece.kind === "dough")?.piece : null;
  if (dough && total > 0 && leopard(dough) && layerQuality(exp[0], dough)[0] >= 1) {
    total = Math.min(1, total + LEOPARD_BONUS);
    perks.push("leopard spots");
  }

  // Tortillas pressed by hand at Sun Valley: a little extra, and a better tip.
  if (total > 0.5 && plate.layers.some((l) => l.piece.handmade)) {
    total = Math.min(1, total + HANDMADE_BONUS);
    perks.push("hand-pressed tortillas");
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
  if (!order.fries && plate.fries && plate.fries.fill > 0.5) {
    const f = plate.fries;
    const nachos = fryOf(f) === "chips";
    freebie(friesScore({ ...order, poutine: !!f.curds, fry: fryOf(f) }, f, []), f.curds ? (nachos ? "free nachos" : "free poutine") : `free ${sideWord(fryOf(f))}`);
  }
  if (!order.drink && plate.drink && plate.drink.fill > 0.6) freebie(Math.min(1, plate.drink.fill), "free drink");

  const score = Math.round(clamp01(total) * 100);
  const sideMissing = (order.fries && (!plate.fries || friesQ < 0.35)) || (!!order.drink && (!plate.drink || drinkQ < 0.35));
  const faulty = (exp.length > 0 && (pairs.length < exp.length || worstLayer < 0.35)) || sideMissing;
  const main = !exp.length ? "burger" : TORTILLAS.has(exp[0].kind) ? (exp[0].folded ? "quesadilla" : "tacos") : exp[0].kind === "tostada" ? "tostada" : BREADS.has(exp[0].kind) ? "panini" : exp[0].kind === "dough" ? (exp[0].folded ? "calzone" : "flatbread") : "burger";
  const missing = order.drink && !plate.drink ? "forgot the drink" : order.fries && !plate.fries ? `forgot the ${sideName(order)}` : exp.length > 0 && plate.layers.length === 0 ? `forgot the ${main}` : null;
  return { score, stars: starsFor(score), structure, quality, presentation, sides, notes, perks, faulty, missing };
}

/** What a customer calls a fried side: fries, sweet fries, chips, churros, fritti or fritters. */
function sideWord(fry: FryKind): string {
  return fry === "sweet" ? "sweet fries" : fry === "zucchini" ? "fritti" : fry === "fritters" ? "fritters" : fry;
}

/** What the customer calls their side: fries, sweet fries, chips, churros, fritti, fritters, poutine or nachos. */
function sideName(order: Order): string {
  const fry = fryOf(order);
  if (order.poutine) return fry === "chips" ? "nachos" : "poutine";
  return sideWord(fry);
}

/** Fries (or chips, churros) and poutine (or nachos) against the order, 0..1. */
function friesScore(order: Order, fries: Fries, notes: string[]): number {
  const c = fries.cook;
  const fry = fryOf(fries);
  const word = fry === "sweet" ? "fries" : sideWord(fry);
  let q = friesQuality(c, fry);
  const zone = friesZone(c, fry);
  if (zone === "under") notes.push(fry === "chips" ? "chewy chips" : fry === "churros" ? "doughy churros" : fry === "fritters" ? "doughy fritters" : fry === "zucchini" ? "soggy fritti" : "soggy fries");
  else if (zone === "over") notes.push(c >= FRY_ZONE[fry].burnt ? `burnt ${word}` : `overdone ${word}`);
  if (fry !== fryOf(order)) {
    q *= 0.6;
    notes.push(`wanted ${fryOf(order) === "fries" ? "regular fries" : fryOf(order) === "sweet" ? "sweet potato fries" : FRY_LABEL[fryOf(order)].toLowerCase()}`);
  }
  if (fries.size !== order.friesSize) {
    q *= 0.5;
    notes.push(`wanted ${SIZE_LABEL[order.friesSize].toLowerCase()} ${word}`);
  } else if (fries.fill < 0.95) {
    q *= 0.6;
    notes.push(`skimpy ${order.poutine ? sideName(order) : word}`);
  }
  if (order.poutine) {
    const nachos = fry === "chips";
    if (!fries.curds) {
      q *= 0.5;
      notes.push(nachos ? "where are the jalapeños?" : "where are the curds?");
    }
    if (!fries.gravy) {
      q *= 0.5;
      notes.push(nachos ? "no queso on the nachos" : "no gravy on the poutine");
    }
  } else {
    // Salt (sugar on churros) is optional but they taste flat without it, and too much is worse;
    // poutine or nacho toppings on a plain side are a surprise.
    const salt = fries.salt ?? 0;
    const what = SUGARED.has(fry) ? "sugar" : "salt";
    if (salt <= 0) {
      q *= 0.85;
      notes.push(`${word} needed ${what}`);
    } else if (salt < SALT.low) {
      q *= 0.93;
      notes.push(`${word} could use more ${what}`);
    } else if (salt > SALT.high) {
      q *= 0.8;
      notes.push(SUGARED.has(fry) ? `${word} too sugary` : `${word} too salty`);
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
