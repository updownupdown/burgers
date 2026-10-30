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
export type DrinkId = "pine" | "lemon" | "cola";
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
  /** Seconds spent under the heat lamp; long waits dry food out. */
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

export interface Fries {
  cook: number;
}

export interface Drink {
  flavor: DrinkId;
  fill: number;
}

export interface Plate {
  layers: Layer[];
  fries: Fries | null;
  drink: Drink | null;
}

export interface ExpectedLayer {
  kind: Kind;
  doneness?: Doneness;
  toasted?: boolean;
  smashed?: boolean;
  /** Cheese that should be melted onto the patty below it. */
  melted?: boolean;
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
  /** Bottom to top. */
  layers: ExpectedLayer[];
  fries: boolean;
  drink: DrinkId | null;
}

export const GRILLABLE: ReadonlySet<Kind> = new Set<Kind>(["bun", "patty", "bacon", "egg", "pineapple"]);
export const SAUCES: ReadonlySet<Kind> = new Set<Kind>(["ketchup", "mustard"]);

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
  lemon: "Lemon Zip",
  cola: "Road Cola",
};

export const DRINK_COLOR: Record<DrinkId, string> = {
  pine: "#5fc46d",
  lemon: "#f2d64b",
  cola: "#6b3524",
};

export const DONENESS_TARGET: Record<Doneness, number> = {
  rare: 0.32,
  medium: 0.55,
  well: 0.78,
};

let nextUid = 1;
export function newPiece(kind: Kind): Piece {
  return { uid: nextUid++, kind, cook: [0, 0] };
}
