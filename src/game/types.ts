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
  | "mustard";

export type Doneness = "rare" | "medium" | "well";
export type DrinkId = "pine" | "pink" | "cola" | "water" | "tea";
export const DRINKS: DrinkId[] = ["pine", "pink", "cola", "water", "tea"];
export type SauceKind = "ketchup" | "mustard";

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
  /** Poutine toppings: cheese curds, then gravy. */
  curds?: boolean;
  gravy?: boolean;
}

export interface Drink {
  flavor: DrinkId;
  fill: number;
  size: Size;
  ice?: boolean;
  lid?: boolean;
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
}

/** A change to a known recipe: "no pickles", "extra cheese", "add bacon". */
export interface Modifier {
  type: "no" | "extra" | "add";
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
  /** A poutine meal: a large carton of fries with curds and gravy, and no burger. */
  poutine?: boolean;
}

export const GRILLABLE: ReadonlySet<Kind> = new Set<Kind>(["bun", "patty", "bacon", "egg", "pineapple"]);
export const SAUCES: ReadonlySet<Kind> = new Set<Kind>(["ketchup", "mustard"]);
/** Half the width of a squeezed line of sauce, in burger-local units (the bun has radius 1). */
export const SAUCE_RADIUS = 0.09;
/**
 * Toppings placed one piece at a time; a recipe asks for a number of them. Fewer saves money but
 * customers notice; a couple extra can win a better review.
 */
export const COUNTED: ReadonlySet<Kind> = new Set<Kind>(["pickle", "onion", "tomato", "jalapeno"]);
/** Pieces of each counted topping in a standard recipe, unless the recipe says otherwise. */
export const STANDARD_COUNT: Partial<Record<Kind, number>> = { pickle: 3, onion: 2, tomato: 2, jalapeno: 4 };
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
};

export const DRINK_LABEL: Record<DrinkId, string> = {
  pine: "Pine Fizz",
  pink: "Pink Lemonade",
  cola: "Road Cola",
  water: "Water",
  tea: "Iced Tea",
};

/** Short names for the fountain's push buttons. */
export const DRINK_SHORT: Record<DrinkId, string> = { pine: "Fizz", pink: "Pink", cola: "Cola", water: "Water", tea: "Tea" };

export const DRINK_COLOR: Record<DrinkId, string> = {
  pine: "#7dbd8a",
  pink: "#f3a3b8",
  cola: "#3b1d1b",
  water: "#cfe8f2",
  tea: "#c3731f",
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
