import type { Doneness, FryKind, Kind, Piece } from "./types";


/** Seconds of grill time per unit of cook on one face. A side goes raw to medium in about 7s; patties cook at a third of that pace. */
export const GRILL_RATE = 0.08;
/**
 * Cook per second for fries in the oil. At this pace a basket turns golden after about 20s,
 * hits perfect at about 29s and goes over at about 38s: long enough to build a burger meanwhile.
 */
export const FRY_RATE = 0.025;

export function pattyLabel(t: number): string {
  return { raw: "Raw", rare: "Rare", medium: "Medium", well: "Well done", burnt: "Burnt" }[pattyDoneness(t)];
}

/** Patty doneness bands, from the patty's cook scale (medium is the wide middle band). */
export function pattyDoneness(t: number): Doneness | "raw" | "burnt" {
  const z = COOK_SCALE.patty;
  if (t < 0.18) return "raw";
  if (t < z.done) return "rare";
  if (t < z.over) return "medium";
  if (t < z.burnt) return "well";
  return "burnt";
}

/** Overall cook of a two-sided item: average of faces. */
export function avgCook(p: Piece): number {
  return (p.cook[0] + p.cook[1]) / 2;
}

/** Buns only toast on the cut face, which starts face down. Flipping gives the dome a tan instead. */
export function bunToast(p: Piece): number {
  return Math.max(p.cook[0], p.cook[1]);
}

export function isToasted(p: Piece): boolean {
  const t = bunToast(p);
  return t >= 0.35 && t < 0.95;
}

/** Cheese counts as melted once it slumps over the patty. */
export function isMelted(p: Piece): boolean {
  return (p.melt ?? 0) >= 0.5;
}

/**
 * Melt per second: on a hot patty a slice counts as melted after about 3.3 s and slumps right
 * over in 6.7 s (a third of the old pace, so there's time to see it go). It barely moves on the
 * warm zone.
 */
export const MELT_RATE = { hot: 0.15, warm: 0.04, lamp: 0.04 };

/**
 * Every cooked thing reads on one meter with three regions: not done enough, done, over-done
 * (the end of the meter is burnt). `perfect` is the line to aim for, in the middle of done.
 * Values are on each kind's own cook scale (see `cookLevel`).
 */
export interface CookScale {
  done: number;
  over: number;
  burnt: number;
  perfect: number;
}
export type Cookable = "patty" | "bacon" | "egg" | "bun" | "pineapple" | "fries" | "ciabatta" | "sourdough" | "chicken" | "veggie" | "sweet" | "corn" | "flour" | "tostada" | "chips" | "churros" | "dough" | "zucchini" | "fritters";
export const COOK_SCALE: Record<Cookable, CookScale> = {
  // Under: raw and rare. Done: medium. Over: well done, then burnt.
  // Medium is generous: about 50% longer than it used to be (0.43-0.67).
  patty: { done: 0.38, over: 0.74, burnt: 0.97, perfect: 0.56 },
  bacon: { done: 0.4, over: 0.85, burnt: 1.0, perfect: 0.6 },
  egg: { done: 0.35, over: 0.85, burnt: 1.0, perfect: 0.6 },
  bun: { done: 0.35, over: 0.8, burnt: 0.95, perfect: 0.55 },
  pineapple: { done: 0.35, over: 0.8, burnt: 1.0, perfect: 0.55 },
  fries: { done: 0.5, over: 0.95, burnt: 1.3, perfect: 0.725 },
  // The panini press (the Sunny Coast). Bread: pale, golden with press lines, dark. Chicken: pink,
  // white, dry. Veggie patty: soft, crisp, burnt.
  ciabatta: { done: 0.35, over: 0.78, burnt: 1.0, perfect: 0.56 },
  sourdough: { done: 0.35, over: 0.78, burnt: 1.0, perfect: 0.56 },
  chicken: { done: 0.4, over: 0.8, burnt: 1.05, perfect: 0.6 },
  veggie: { done: 0.35, over: 0.8, burnt: 1.0, perfect: 0.57 },
  // Sweet potato fries: the done band is narrower than plain fries' (and they cook faster, SWEET_FRY).
  sweet: { done: 0.5, over: 0.82, burnt: 1.12, perfect: 0.66 },
  // Red Rock's comal: a tortilla goes pale and stiff, soft and spotted (done), then hard. A folded
  // quesadilla reads the same scale on the average of its two sides.
  corn: { done: 0.35, over: 0.8, burnt: 1.02, perfect: 0.56 },
  flour: { done: 0.35, over: 0.8, burnt: 1.02, perfect: 0.56 },
  // A tostada shell in the fryer: pale, crisp and golden, then dark.
  tostada: { done: 0.5, over: 0.9, burnt: 1.2, perfect: 0.7 },
  // Chips fry fast with a narrower band; churros are like fries.
  chips: { done: 0.5, over: 0.85, burnt: 1.15, perfect: 0.675 },
  churros: { done: 0.5, over: 0.9, burnt: 1.25, perfect: 0.7 },
  // Orchard Isle's hearth oven: a flatbread's crust, read on its paler side. Pale and doughy, then
  // golden and blistered (done), then dark, then charred.
  dough: { done: 0.35, over: 0.8, burnt: 1.0, perfect: 0.56 },
  // The isle's fryer: battered zucchini fritti and apple fritters.
  zucchini: { done: 0.5, over: 0.9, burnt: 1.2, perfect: 0.7 },
  fritters: { done: 0.5, over: 0.9, burnt: 1.25, perfect: 0.7 },
};

/**
 * Orchard Isle's hearth oven (DESIGN §24, phase 4). The fire is at the back: the half of a pie
 * facing it bakes at twice the pace of the half facing the mouth (OVEN_RATE per second, against
 * the dough's scale). Turned once near halfway, both halves are golden at about 21 s and stay in
 * the band until about 28 s. Left unturned, the fire side runs more than OVEN_LEAD ahead of the
 * pale side by about 17 s, before the pale side is done, and scorches. A folded calzone is
 * thicker: it bakes at OVEN_FOLDED of the pace and scorches with a smaller lead, so one turn can't
 * see it through: turned at about 6 s and again at about 16 s, it's done from about 19 s to 26 s.
 */
export const OVEN_RATE = 0.0176;
export const OVEN_FIRE = 2;
export const OVEN_FOLDED = 0.75;
export const OVEN_LEAD = { open: 0.3, folded: 0.08 };
/** Seconds a fire side can run over the lead before it counts as scorched. */
export const SCORCHED = 1;
/** On a pie in the oven: cheese melts (melted at 0.5, about 6 s); other toppings roast. Mushrooms want a long bake (roasted at 1, about 24 s). */
export const OVEN_MELT = 0.09;
export const OVEN_ROAST = 0.042;
/** A flatbread's paler side, and how far its fire side has run ahead (negative: the other half leads). */
export const paleSide = (p: Piece): number => Math.min(p.cook[0], p.cook[1]);
/** Which half of a pie faces the fire: 0 until it's turned, then 1, and so on. */
export const fireHalf = (p: Piece): 0 | 1 => ((p.turns ?? 0) % 2) as 0 | 1;
export const fireLead = (p: Piece): number => p.cook[fireHalf(p)] - p.cook[1 - fireHalf(p)];
export const ovenLead = (p: Piece): number => (p.folded ? OVEN_LEAD.folded : OVEN_LEAD.open);

/**
 * A second in the oven for a pie's dough (`boost` is the Hot plate upgrade): the fire half bakes at
 * OVEN_FIRE times the pace of the other, and while it runs more than its lead ahead it scorches.
 * True while it's scorching.
 */
export function bakeStep(d: Piece, dt: number, boost = 1): boolean {
  const r = OVEN_RATE * boost * (d.folded ? OVEN_FOLDED : 1) * dt;
  const f = fireHalf(d);
  d.cook[f] += r * OVEN_FIRE;
  d.cook[1 - f] += r;
  if (fireLead(d) <= ovenLead(d)) return false;
  d.scorch = (d.scorch ?? 0) + dt;
  return true;
}
/** What's on a pie in the oven: cheese melts, everything else warms and roasts (mushrooms want a long bake). */
export function bakeTopping(p: Piece, dt: number, cheese: boolean, boost = 1): void {
  if (cheese) p.melt = Math.min(1, (p.melt ?? 0) + OVEN_MELT * boost * dt);
  p.cook[0] = (p.cook[0] ?? 0) + OVEN_ROAST * boost * dt;
}

/**
 * Red Rock's comal. Tortillas warm on the face down against GRILL_RATE: about 6 s to soft and
 * spotted on the hot side, hard from about 13 s. A quesadilla's cheese melts while the tortilla is
 * on the hot side, faster once it's folded over (about 7 s folded); the warm side holds it.
 */
export const COMAL_SPEED: Partial<Record<Kind, number>> = { corn: 0.75, flour: 0.75 };
export const QUESO_MELT = { open: 0.04, folded: 0.075, warm: 0.015 };

/**
 * The panini press cooks both faces at once, so a piece's two faces stay equal; its cook level is
 * the face reading. Cook per second against PRESS_RATE, on a closed bay. At these speeds: ciabatta
 * goes golden at about 12 s and dark at 27 s; sourdough browns faster (about 9 s to 21 s); chicken
 * pressed on its own is cooked through at about 17 s and dry from 34 s; a veggie patty crisps from
 * about 12 s. Proteins inside a sandwich only warm through (PRESS_INSIDE).
 */
export const PRESS_RATE = 0.08;
export const PRESS_SPEED: Partial<Record<Kind, number>> = { ciabatta: 0.36, sourdough: 0.46, chicken: 0.29, veggie: 0.36 };
/** A protein already pressed, then pressed again inside its sandwich, cooks at this share of its pace. */
export const PRESS_INSIDE = 0.25;
/** Cheese inside a closed panini melts this much per second: melted (0.5) after about 5 s, an ooze at the seam. */
export const PRESS_MELT = 0.1;
/** Anything else inside a closed press warms by this much per second (avocado should never be warmed). */
export const PRESS_WARM = 0.12;
/** Sweet potato fries cook this much faster than plain ones. */
export const SWEET_FRY = 1.3;

/**
 * How cooked a piece is, on its kind's scale. Patties and bacon are the average of their two
 * faces (the face up only gets heat through the meat, so a flip evens them out); an egg is
 * the heat both faces have taken; a bun toasts on whichever face went down.
 */
export function cookLevel(p: Piece): number {
  switch (p.kind) {
    case "patty":
    case "bacon":
    case "chicken":
    case "veggie":
      return avgCook(p);
    case "egg":
      return p.cook[0] + p.cook[1];
    case "dough":
      // A flatbread reads on its paler half.
      return paleSide(p);
    case "corn":
    case "flour":
      // A taco tortilla warms on whichever face went down; a folded quesadilla is the average of its sides.
      return p.folded ? avgCook(p) : Math.max(p.cook[0], p.cook[1]);
    default:
      return Math.max(p.cook[0], p.cook[1]);
  }
}

export function cookZone(kind: Cookable, t: number): "under" | "done" | "over" | "burnt" {
  const z = COOK_SCALE[kind];
  return t < z.done ? "under" : t < z.over ? "done" : t < z.burnt ? "over" : "burnt";
}

/** An egg flipped an odd number of times is over easy; otherwise sunny side up. */
export const isFlipped = (p: Piece): boolean => (p.flips ?? 0) % 2 === 1;

/** A patty face seared this hard is charred: flip before the face down gets there. */
export const CHAR_FACE = 1.05;
/** Grill marks show (and count) once a face has spent 4 s down on a hot grille. */
export const MARKED = 0.3;
/** Grill marks per second on a hot grille. */
export const MARK_RATE = 0.075;

/**
 * Fries cook in three zones: underdone (pale and limp), done (golden) and overdone (dark and
 * hard), with burnt past the end. Perfect is the middle of the done zone.
 */
export const FRIES_ZONE = { done: 0.5, over: 0.95, burnt: 1.3 };
export const FRIES_PERFECT = (FRIES_ZONE.done + FRIES_ZONE.over) / 2;

/** Sweet potato fries: a narrower done band (COOK_SCALE.sweet). */
export const SWEET_ZONE = { done: COOK_SCALE.sweet.done, over: COOK_SCALE.sweet.over, burnt: COOK_SCALE.sweet.burnt };
export const SWEET_PERFECT = (SWEET_ZONE.done + SWEET_ZONE.over) / 2;
/** Each fry kind's zones: fries, sweet potato fries, chips and churros. */
export const FRY_ZONE: Record<FryKind, { done: number; over: number; burnt: number }> = {
  fries: FRIES_ZONE,
  sweet: SWEET_ZONE,
  chips: { done: COOK_SCALE.chips.done, over: COOK_SCALE.chips.over, burnt: COOK_SCALE.chips.burnt },
  churros: { done: COOK_SCALE.churros.done, over: COOK_SCALE.churros.over, burnt: COOK_SCALE.churros.burnt },
  zucchini: { done: COOK_SCALE.zucchini.done, over: COOK_SCALE.zucchini.over, burnt: COOK_SCALE.zucchini.burnt },
  fritters: { done: COOK_SCALE.fritters.done, over: COOK_SCALE.fritters.over, burnt: COOK_SCALE.fritters.burnt },
};
export const fryPerfect = (fry: FryKind): number => (FRY_ZONE[fry].done + FRY_ZONE[fry].over) / 2;
/**
 * How fast each kind fries against plain fries: sweet potato fries 1.3x; chips (tortilla wedges)
 * golden in about 8 s; churros a little quicker than fries. A tostada shell crisps in about 10 s.
 * Battered zucchini fritti are golden in about 11 s; apple fritters take about 15 s.
 */
export const FRY_SPEED: Record<FryKind | "tostada", number> = { fries: 1, sweet: 1.3, chips: 2.5, churros: 1.4, tostada: 2, zucchini: 1.8, fritters: 1.3 };
const zoneOf = (fry: FryKind | boolean) => FRY_ZONE[fry === true ? "sweet" : fry === false ? "fries" : fry];

export function friesZone(t: number, fry: FryKind | boolean = "fries"): "under" | "done" | "over" {
  const z = zoneOf(fry);
  return t < z.done ? "under" : t < z.over ? "done" : "over";
}

/**
 * How happy fries make a customer, 0..1. It depends on the zone and on where in it: anywhere
 * in the done zone is good and dead centre is best; underdone gets better towards done, and
 * overdone gets worse the longer they stay in.
 */
export function friesQuality(t: number, fry: FryKind | boolean = "fries"): number {
  const { done, over, burnt } = zoneOf(fry);
  const perfect = (done + over) / 2;
  if (t < done) return 0.15 + 0.4 * Math.max(0, t / done);
  if (t < over) return 1 - (0.25 * Math.abs(t - perfect)) / (perfect - done);
  if (t < burnt) return 0.6 - (0.45 * (t - over)) / (burnt - over);
  return 0.1;
}

/**
 * How full a drink should be: from `full` it counts as a full cup, and `perfect` is the line the
 * pour bar marks to aim for. Past 1 it overflows.
 */
export const DRINK_FILL = { full: 0.78, perfect: 0.9 };

/**
 * Salt on fries, shaken on a little at a time: each shake adds SALT.shake. Under `low` they taste
 * flat, `perfect` is the line to aim for, over `high` is too salty, and it can't go past `max`.
 */
export const SALT = { shake: 0.1, low: 0.35, perfect: 0.6, high: 0.9, max: 1.2 };

export function friesLabel(t: number): string {
  if (t < 0.25) return "Frozen";
  if (t < FRIES_ZONE.done) return "Soggy";
  if (t < FRIES_ZONE.over) return "Golden";
  if (t < FRIES_ZONE.burnt) return "Overdone";
  return "Burnt";
}

export function fillLabel(f: number): string {
  if (f < 0.6) return "Half empty";
  if (f < 0.78) return "A bit low";
  if (f <= 1.0) return "Just right";
  return "Overflowing";
}
