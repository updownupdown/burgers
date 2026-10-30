import type { Kind } from "./types";

export interface Recipe {
  name: string;
  price: number;
  /** Bottom to top. Patties get a random doneness per order. */
  layers: Kind[];
  toasted: boolean;
  /** Patties must be smashed flat on the grill. */
  smash?: boolean;
  /** Cheese sitting right on a patty should be melted on the grill. */
  melt?: boolean;
  /** Only ordered once the shift has warmed up (0..1 of the way through). */
  from?: number;
}

export type Backdrop = "mountains" | "beach" | "desert";

export interface Stop {
  id: string;
  name: string;
  /** Who lives there, for the title card. */
  blurb: string;
  backdrop: Backdrop;
  /** Bins on the grill counter, in order (up to 10). */
  pantry: Kind[];
  menu: Recipe[];
  customers: number;
  shiftLength: number;
  /** Short line shown when a new mechanic or ingredient appears here. */
  newThing?: string;
}

export const STOPS: Stop[] = [
  {
    id: "pinecrest",
    name: "Pinecrest",
    blurb: "Pinecrest is a mountain town full of hungry hikers. Keep them fed until closing time.",
    backdrop: "mountains",
    pantry: ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", "pickle"],
    customers: 9,
    shiftLength: 180,
    menu: [
      { name: "Plain Jane", price: 6, layers: ["bun", "patty", "bun"], toasted: false },
      { name: "Trailhead Classic", price: 9, layers: ["bun", "ketchup", "patty", "lettuce", "tomato", "bun"], toasted: true },
      { name: "Cheesy Switchback", price: 10, layers: ["bun", "patty", "cheese", "pickle", "mustard", "bun"], toasted: false },
      { name: "Sunrise Summit", price: 11, layers: ["bun", "lettuce", "patty", "egg", "bun"], toasted: true, from: 0.15 },
      { name: "Lumberjack Stack", price: 15, layers: ["bun", "patty", "cheese", "bacon", "onion", "patty", "ketchup", "bun"], toasted: true, melt: true, from: 0.3 },
    ],
  },
  {
    id: "saltwater",
    name: "Saltwater Bay",
    blurb: "Saltwater Bay is a beach town of surfers, lifeguards and one very bold crab.",
    backdrop: "beach",
    pantry: ["bun", "patty", "bacon", "pineapple", "cheese", "lettuce", "tomato", "onion", "pickle"],
    customers: 10,
    shiftLength: 190,
    newThing: "New here: grilled pineapple. Grill one side until it's golden.",
    menu: [
      { name: "Boardwalk Basic", price: 8, layers: ["bun", "patty", "lettuce", "ketchup", "bun"], toasted: false },
      { name: "Luau Stack", price: 13, layers: ["bun", "patty", "pineapple", "bacon", "mustard", "bun"], toasted: true },
      { name: "Low Tide", price: 11, layers: ["bun", "lettuce", "tomato", "patty", "cheese", "onion", "bun"], toasted: true, melt: true },
      { name: "Big Kahuna", price: 17, layers: ["bun", "patty", "cheese", "pineapple", "patty", "bacon", "ketchup", "bun"], toasted: true, melt: true, from: 0.3 },
      { name: "Sandy Pickle", price: 10, layers: ["bun", "pickle", "patty", "cheese", "pickle", "bun"], toasted: false },
    ],
  },
  {
    id: "redmesa",
    name: "Red Mesa",
    blurb: "Red Mesa is a desert crossroads where the cowhands like it hot.",
    backdrop: "desert",
    pantry: ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", "jalapeno"],
    customers: 11,
    shiftLength: 200,
    newThing: "New here: smash burgers. Press and hold a fresh patty on the grill to smash it flat. Smashed patties cook fast!",
    menu: [
      { name: "Tumbleweed", price: 8, layers: ["bun", "patty", "onion", "ketchup", "bun"], toasted: false },
      { name: "Mesa Smash", price: 12, layers: ["bun", "patty", "cheese", "onion", "mustard", "bun"], toasted: true, smash: true, melt: true },
      { name: "Rattlesnake", price: 13, layers: ["bun", "patty", "jalapeno", "cheese", "jalapeno", "ketchup", "bun"], toasted: true },
      { name: "Sunset Double", price: 16, layers: ["bun", "patty", "cheese", "patty", "cheese", "jalapeno", "bun"], toasted: true, smash: true, melt: true, from: 0.25 },
      { name: "Ranch Breakfast", price: 14, layers: ["bun", "patty", "bacon", "egg", "bun"], toasted: true, from: 0.15 },
    ],
  },
];
