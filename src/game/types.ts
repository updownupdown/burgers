import { setFolded } from "./cooking";
export type Kind =
  | "bun"
  | "patty"
  | "bacon"
  | "egg"
  | "cheese"
  | "lettuce"
  | "tomato"
  | "onion"
  | "pickle"
  | "pineapple"
  | "jalapeno"
  | "ketchup"
  | "mustard"
  // The Sunny Coast's panini press (DESIGN §24, phase 2).
  | "ciabatta"
  | "sourdough"
  | "chicken"
  | "veggie"
  | "mozzarella"
  | "basil"
  | "avocado"
  | "rocket"
  | "cheddar"
  | "redonion"
  | "tuna"
  | "pesto"
  | "aioli"
  // Red Rock's comal (DESIGN §24, phase 3).
  | "corn"
  | "flour"
  | "pork"
  | "beans"
  | "cilantro"
  | "lime"
  | "jack"
  | "tostada"
  | "redsalsa"
  | "greensalsa"
  | "crema"
  // Orchard Isle's hearth oven (DESIGN §24, phase 4).
  | "dough"
  | "redsauce"
  | "oil"
  | "honey"
  | "mushroom"
  | "ham"
  | "fig"
  | "pear"
  | "blue";

export type Doneness = "rare" | "medium" | "well";
export type DrinkId = "cola" | "water" | "tea" | "pine" | "pink" | "cucumber" | "hibiscus" | "lime" | "cider" | "bramble";
/** Every drink in the game. A town's fountain pours five of them (see fountainFor in stops.ts). */
export const DRINKS: DrinkId[] = ["cola", "water", "tea", "pine", "pink", "cucumber", "hibiscus", "lime", "cider", "bramble"];
/** On the fountain everywhere; the other two buttons are the area's own. */
export const HOUSE_DRINKS: DrinkId[] = ["cola", "water", "tea"];
export type SauceKind = "ketchup" | "mustard" | "pesto" | "aioli" | "redsalsa" | "greensalsa" | "crema" | "redsauce" | "oil" | "honey";
/**
 * What a fryer basket and a carton hold: plain fries, sweet potato fries (the coast), tortilla
 * chips (Red Rock, in place of fries), churros (Sun Valley), or on Orchard Isle battered zucchini
 * fritti and apple fritters (Larkvale).
 */
export type FryKind = "fries" | "sweet" | "chips" | "churros" | "zucchini" | "fritters";
export const FRY_LABEL: Record<FryKind, string> = { fries: "Fries", sweet: "Sweet fries", chips: "Chips", churros: "Churros", zucchini: "Zucchini fritti", fritters: "Apple fritters" };
/** Fry kinds that get sugar from the sugar shaker rather than salt. */
export const SUGARED: ReadonlySet<FryKind> = new Set<FryKind>(["churros", "fritters"]);
/** The fry kind on a carton or an order (missing means plain fries). */
export const fryOf = (x: { fry?: FryKind } | null | undefined): FryKind => x?.fry ?? "fries";

/** A single physical food item. `cook[0]` is the face currently down on the grill. */
export interface Piece {
  uid: number;
  kind: Kind;
  cook: [number, number];
  /** Pressed flat on the grill (smash burger). */
  smashed?: boolean;
  /** Cheese only: 0 is a cold slice, 1 is fully melted over a hot patty. */
  melt?: number;
  /** Seconds a cooked piece has waited on a tray; long waits leave it cold and dry. */
  held?: number;
  /** Sauce stroke, in plate-local units (x, z), for ketchup/mustard layers. */
  stroke?: { x: number; z: number }[];
  /** Times it's been flipped on the grill (an egg flipped once is over easy). */
  flips?: number;
  /** Patties: grill marks seared into each face by the grille, 0..1 (`[down, up]`, like `cook`). */
  marks?: [number, number];
  /** Panini bread: the sandwich was sliced in half on the cutting board. */
  cut?: boolean;
  /** A flour tortilla folded in half over its filling on the comal (a quesadilla). */
  folded?: boolean;
  /** Which way a folded tortilla's open edge faces on the comal (radians about y). */
  foldYaw?: number;
  /** A tortilla on the comal: what's been laid on it (a quesadilla's cheese and fillings), in order. */
  fill?: Piece[];
  /** A corn tortilla flattened by hand in the tortilla press (Sun Valley). */
  handmade?: boolean;
  /**
   * A flatbread's crust (Orchard Isle), segment by segment round the rim (RIM_SEGS, see cooking.ts):
   * each bakes by how it faces the oven's hot back wall. `cook[0]` and `cook[1]` keep the averages of
   * half A (segments 0..3, the back half until it's turned) and half B.
   */
  rim?: number[];
  /** A flatbread's heading on the counter (radians about y), as the peel has nudged it round: half A faces the oven's back wall at 0. */
  yaw?: number;
  /** Seconds its darkest side spent past the band (it scorches). */
  scorch?: number;
  /** Cuts across a flatbread on the board (Port Amber cuts in four: two cuts). */
  cuts?: number;
  /** How well it was cut with the knife, 0..1 (straight, through the middle; see game/knife.ts). Missing counts as clean. */
  cutQ?: number;
  /** The order a flatbread was started for (its ticket ticks off as it's built on the peel). */
  forOrder?: number;
}

export interface Layer {
  piece: Piece;
  /** Horizontal offset from the plate centre caused by an imprecise toss. */
  offX: number;
  offZ: number;
}

export type Size = "S" | "M" | "L";
export type FriesSize = "S" | "M" | "L";
export const SIZE_LABEL: Record<Size, string> = { S: "Small", M: "Medium", L: "Large" };
/** Share of a fryer basket each carton holds. */
export const FRIES_PORTION: Record<FriesSize, number> = { S: 1 / 3, M: 2 / 3, L: 1 };
/** One scoop from the freezer fills a small carton; a full basket holds three. */
export const FRIES_SCOOP = 1 / 3;
/** Small cups fill faster than large ones. */
export const CUP_SPEED: Record<Size, number> = { S: 1.35, M: 1, L: 0.78 };

export interface Fries {
  cook: number;
  size: FriesSize;
  /** How full the carton is, 0..1. */
  fill: number;
  /** How much salt has been shaken on (see SALT in cooking.ts); 0 or missing is none. Plain fries want it; poutine doesn't need it. */
  salt?: number;
  /**
   * The two toppings of a loaded carton: on poutine, cheese curds then gravy; on nachos (Red Rock),
   * jalapeños (`curds`) and queso (`gravy`).
   */
  curds?: boolean;
  gravy?: boolean;
  /** What's in the carton, when it isn't plain fries: sweet potato fries, chips or churros. (`salt` is sugar on churros.) */
  fry?: FryKind;
  /** Seconds since these fries came out of the oil; they go soggy after a while (FRIES_HOLD in scoring.ts). */
  held?: number;
}

export interface Drink {
  flavor: DrinkId;
  fill: number;
  size: Size;
  ice?: boolean;
  lid?: boolean;
  /** A garnish dropped on (Order.garnish). */
  garnish?: Garnish;
}

export interface Plate {
  layers: Layer[];
  fries: Fries | null;
  drink: Drink | null;
}

export interface ExpectedLayer {
  kind: Kind;
  toasted?: boolean;
  smashed?: boolean;
  /** Cheese that should be melted onto the patty below it. */
  melted?: boolean;
  /** Counted toppings (COUNTED): how many pieces go in this layer. */
  count?: number;
  /** Eggs: flipped once on the grill (over easy). Unset is sunny side up. */
  flipped?: boolean;
  /** Avocado on an open-faced toast: it should never have been in the press. */
  cold?: boolean;
  /** A flour tortilla folded over its filling and crisped on both sides (a quesadilla), or a calzone. */
  folded?: boolean;
  /** Goes on a flatbread after the oven (basil, rocket, honey): it should never have been baked. */
  after?: boolean;
}

/** A change to a known recipe: "no pickles", "extra cheese", "add bacon", or a toasted bun on a burger that usually isn't. */
export interface Modifier {
  type: "no" | "extra" | "add" | "toast";
  kind: Kind;
}

export interface Order {
  id: number;
  name: string;
  price: number;
  /** Changes from the menu recipe; `layers` already includes them. */
  mods: Modifier[];
  /** Toppings asked to leave off, and where they would have gone: under `layers[at]`. */
  removed?: { kind: Kind; at: number }[];
  /** Bottom to top. */
  layers: ExpectedLayer[];
  fries: boolean;
  drink: DrinkId | null;
  friesSize: FriesSize;
  drinkSize: Size;
  /** Ice in the drink: asked for, asked to leave out, or (null) either is fine. */
  ice?: boolean | null;
  /** A food critic: their verdict goes in the paper. */
  critic?: boolean;
  /** The first time this dish is ordered on the trip: it comes plain, and they're half again as patient. */
  firstTime?: boolean;
  /** A poutine meal: a large carton of fries with curds and gravy, and no burger. (Nachos in Red Rock: chips, jalapeños and queso.) */
  poutine?: boolean;
  /** The side is sweet potato fries, chips or churros rather than plain fries. */
  fry?: FryKind;
  /** A panini to be sliced in half on the cutting board (Harbor City), or a flatbread cut in four (Port Amber). */
  slice?: boolean;
  /** The local drink's garnish, outside the Pines: "cucumber" (Coast), "lime" (Red Rock), "apple" (the isle). */
  garnish?: Garnish;
  /** A town's regular (after build #78): their name, shown on the ticket; they always order the same. */
  regular?: string;
}

/** The garnish on a region's local drinks (dropped on the cup from the dish by the fountain). */
export type Garnish = "cucumber" | "lime" | "apple";
export const GARNISH_LABEL: Record<Garnish, string> = { cucumber: "Cucumber", lime: "Lime", apple: "Apple" };

export const GRILLABLE: ReadonlySet<Kind> = new Set<Kind>(["bun", "patty", "bacon", "egg", "pineapple", "corn", "flour"]);
export const SAUCES: ReadonlySet<Kind> = new Set<Kind>(["ketchup", "mustard", "pesto", "aioli", "redsalsa", "greensalsa", "crema", "redsauce", "oil", "honey"]);
export const isSauce = (k: Kind): k is SauceKind => SAUCES.has(k);
/** Panini breads: a sandwich starts and (unless it's open-faced) ends with one. */
export const BREADS: ReadonlySet<Kind> = new Set<Kind>(["ciabatta", "sourdough"]);
/** Cooked in the panini press on their own before they go in a sandwich. */
export const PROTEINS: ReadonlySet<Kind> = new Set<Kind>(["chicken", "veggie"]);
/**
 * What a press bay can close on (bottom first): nothing, a bread or a protein on its own, or a
 * sandwich with bread top and bottom. Anything else can be built in an open bay, but the lid
 * won't come down on it.
 */
export function pressable(kinds: readonly Kind[]): boolean {
  if (kinds.length <= 1) return kinds.length === 0 || BREADS.has(kinds[0]) || PROTEINS.has(kinds[0]);
  return BREADS.has(kinds[0]) && BREADS.has(kinds[kinds.length - 1]);
}
/** Cheese that melts inside a closed panini. */
export const PRESS_CHEESE: ReadonlySet<Kind> = new Set<Kind>(["mozzarella", "cheddar"]);
/** Red Rock's tortillas: warmed on the comal for tacos; a flour one folds into a quesadilla. */
export const TORTILLAS: ReadonlySet<Kind> = new Set<Kind>(["corn", "flour"]);
/** Steam wells and the tuna well: a tap is one scoop onto the active tray. */
export const SCOOPED: ReadonlySet<Kind> = new Set<Kind>(["tuna", "pork", "beans"]);
/** What can be laid on a tortilla on the comal (a quesadilla's filling). */
export const COMAL_FILL: ReadonlySet<Kind> = new Set<Kind>(["jack", "pork", "beans", "jalapeno", "onion", "cilantro"]);
/**
 * Open a folded tortilla back out on the comal (a long press), so its filling can be fixed. The
 * filling stays, and so does the reading on its meter (setFolded). False if it wasn't folded.
 */
export function unfoldTortilla(p: Piece): boolean {
  if (!TORTILLAS.has(p.kind) || !p.folded) return false;
  setFolded(p, false);
  delete p.foldYaw;
  return true;
}
/** Orchard Isle: what goes on a flatbread after it comes out of the oven. */
export const AFTER_OVEN: ReadonlySet<Kind> = new Set<Kind>(["basil", "rocket", "honey"]);
/** Cheese that melts on a flatbread in the oven. */
export const OVEN_CHEESE: ReadonlySet<Kind> = new Set<Kind>(["mozzarella", "blue"]);
/** Sauces spread on a flatbread on the peel, before the oven: tomato with the ladle, olive oil from its bottle. */
export const PEEL_SAUCE: ReadonlySet<Kind> = new Set<Kind>(["redsauce", "oil"]);
/** Half the width of a squeezed line of sauce, in burger-local units (the bun has radius 1). */
export const SAUCE_RADIUS = 0.09;
/** Tomato sauce spread with the ladle on a flatbread: a wide spiral, in the pie's own unit oval. */
export const LADLE_RADIUS = 0.2;
/** How wide each sauce's line is, in the unit disc it's painted in. */
export const sauceRadius = (k: Kind): number => (k === "redsauce" ? LADLE_RADIUS : SAUCE_RADIUS);
/**
 * Toppings placed one piece at a time; a recipe asks for a number of them. Fewer saves money but
 * customers notice; a couple extra can win a better review.
 */
export const COUNTED: ReadonlySet<Kind> = new Set<Kind>(["pickle", "onion", "tomato", "jalapeno", "mozzarella", "avocado", "redonion", "tuna", "corn", "pork", "beans", "mushroom", "ham", "fig", "pear", "blue"]);
/**
 * Pieces of each counted topping in a standard recipe, unless the recipe says otherwise. A taco
 * order's corn tortillas are counted too (one per taco), and so are scoops from the steam wells.
 */
export const STANDARD_COUNT: Partial<Record<Kind, number>> = { pickle: 3, onion: 2, tomato: 2, jalapeno: 4, mozzarella: 3, avocado: 4, redonion: 2, tuna: 2, corn: 3, pork: 1, beans: 1, mushroom: 5, ham: 3, fig: 4, pear: 5, blue: 4 };
/** "Extra pickles" adds this many on top of the recipe's count. */
export function extraCount(kind: Kind): number {
  return Math.max(1, Math.round((STANDARD_COUNT[kind] ?? 1) * 0.67));
}

export const KIND_LABEL: Record<Kind, string> = {
  bun: "Bun",
  patty: "Patty",
  bacon: "Bacon",
  egg: "Egg",
  cheese: "Cheese",
  lettuce: "Lettuce",
  tomato: "Tomato",
  onion: "Onion",
  pickle: "Pickles",
  pineapple: "Pineapple",
  jalapeno: "Jalapeños",
  ketchup: "Ketchup",
  mustard: "Mustard",
  ciabatta: "Ciabatta",
  sourdough: "Sourdough",
  chicken: "Chicken",
  veggie: "Veggie patty",
  mozzarella: "Mozzarella",
  basil: "Basil",
  avocado: "Avocado",
  rocket: "Rocket",
  cheddar: "Cheddar",
  redonion: "Pickled onion",
  tuna: "Tuna",
  pesto: "Pesto",
  aioli: "Aioli",
  corn: "Corn tortilla",
  flour: "Flour tortilla",
  pork: "Pork",
  beans: "Beans",
  cilantro: "Cilantro",
  lime: "Lime",
  jack: "Cheese",
  tostada: "Tostada shell",
  redsalsa: "Red salsa",
  greensalsa: "Green salsa",
  crema: "Crema",
  dough: "Dough",
  redsauce: "Tomato sauce",
  oil: "Olive oil",
  honey: "Honey",
  mushroom: "Mushroom",
  ham: "Ham",
  fig: "Fig",
  pear: "Pear",
  blue: "Blue cheese",
};

/** Swatch colours used by tickets (CSS). */
export const KIND_COLOR: Record<Kind, string> = {
  bun: "#e3a03c",
  patty: "#7a4330",
  bacon: "#c8584a",
  egg: "#fff6dc",
  cheese: "#f7c531",
  lettuce: "#68bf45",
  tomato: "#e5432b",
  onion: "#d9b8e2",
  pickle: "#7fa34a",
  pineapple: "#f5d33f",
  jalapeno: "#3f8f3a",
  ketchup: "#d8261b",
  mustard: "#f0c419",
  ciabatta: "#e8c38a",
  sourdough: "#d9b27a",
  chicken: "#f2d9c4",
  veggie: "#8fa865",
  mozzarella: "#fbfaf5",
  basil: "#4e8a3a",
  avocado: "#9bc25a",
  rocket: "#4f8f3a",
  cheddar: "#f39a1e",
  redonion: "#d36aa8",
  tuna: "#e8d5b5",
  pesto: "#5f9a3a",
  aioli: "#f1e6c2",
  corn: "#f0cf6a",
  flour: "#f6ecd2",
  pork: "#c0622e",
  beans: "#7a4a32",
  cilantro: "#3f9a3a",
  lime: "#8cc63f",
  jack: "#f6d77a",
  tostada: "#e8b04a",
  redsalsa: "#c8321f",
  greensalsa: "#6c9e2c",
  crema: "#f7f1e1",
  dough: "#efcf8e",
  redsauce: "#c8402a",
  oil: "#c9b84a",
  honey: "#e9a92a",
  mushroom: "#b9946a",
  ham: "#e79a9a",
  fig: "#7a2f5a",
  pear: "#e6dc8a",
  blue: "#d9dde6",
};

export const DRINK_LABEL: Record<DrinkId, string> = {
  pine: "Pine Fizz",
  pink: "Pink Lemonade",
  cola: "Road Cola",
  water: "Water",
  tea: "Iced Tea",
  cucumber: "Cucumber Cooler",
  hibiscus: "Hibiscus Cooler",
  lime: "Lime Agua",
  cider: "Sparkling Cider",
  bramble: "Bramble Soda",
};

/** Short names for the fountain's push buttons. */
export const DRINK_SHORT: Record<DrinkId, string> = {
  pine: "Fizz",
  pink: "Pink",
  cola: "Cola",
  water: "Water",
  tea: "Tea",
  cucumber: "Cucumber",
  hibiscus: "Hibiscus",
  lime: "Lime",
  cider: "Cider",
  bramble: "Bramble",
};

/** The drink itself, for tickets, swatches and the liquid in the cup. Local pairs are kept apart in hue. */
export const DRINK_COLOR: Record<DrinkId, string> = {
  pine: "#7dbd8a",
  pink: "#f3a3b8",
  cola: "#3b1d1b",
  water: "#cfe8f2",
  tea: "#c3731f",
  cucumber: "#c4e3a6",
  hibiscus: "#b8324f",
  lime: "#d9ea8c",
  cider: "#e6b04a",
  bramble: "#6e2f63",
};

/** Middle of each patty doneness band (every order wants medium; see pattyDoneness). */
export const DONENESS_TARGET: Record<Doneness, number> = {
  rare: 0.32,
  medium: 0.55,
  well: 0.78,
};

let nextUid = 1;
export function newPiece(kind: Kind): Piece {
  return { uid: nextUid++, kind, cook: [0, 0] };
}
