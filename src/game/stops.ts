import type { CrowdId } from "./business";
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
  /** Road map: which region, where on the map (0..100 by 0..140), and the towns a pass opens up. */
  region: RegionId;
  x: number;
  y: number;
  roads: string[];
  /** The region's big city: passing it opens the next region. */
  capital?: boolean;
  /** Who turns up here (see CROWD in business.ts). */
  crowd: CrowdId;
}

export type RegionId = "mountains" | "coast" | "desert";

export interface Region {
  id: RegionId;
  name: string;
  /** Land colour on the map, and which top corner holds the region's name. */
  color: string;
  label: "left" | "right";
}

export const REGIONS: Region[] = [
  { id: "mountains", name: "The Pines", color: "#8fbf7a", label: "right" },
  { id: "coast", name: "Sunny Coast", color: "#e9d39a", label: "left" },
  { id: "desert", name: "Red Rock Desert", color: "#e2a77a", label: "right" },
];

const REGION_STARTS: Stop[] = [
  {
    id: "pinecrest",
    crowd: "families",
    name: "Pinecrest",
    blurb: "Pinecrest is a mountain town full of hungry hikers. Keep them fed until closing time.",
    backdrop: "mountains",
    region: "mountains",
    x: 22,
    y: 12,
    roads: ["elkpass", "cedarfalls"],
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
    crowd: "party",
    name: "Saltwater Bay",
    blurb: "Saltwater Bay is a beach town of surfers, lifeguards and one very bold crab.",
    backdrop: "beach",
    region: "coast",
    x: 80,
    y: 58,
    roads: ["gullpoint", "driftwood"],
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
    crowd: "families",
    name: "Red Mesa",
    blurb: "Red Mesa is a desert crossroads where the cowhands like it hot.",
    backdrop: "desert",
    region: "desert",
    x: 22,
    y: 97,
    roads: ["cactus", "dustbowl"],
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

const [PINES, COAST, DESERT] = REGION_STARTS;
const pick = (from: Stop, names: string[], extra: Recipe[] = []): Recipe[] => [...from.menu.filter((r) => names.includes(r.name)), ...extra];

const CAMPFIRE_MELT: Recipe = { name: "Campfire Melt", price: 11, layers: ["bun", "patty", "cheese", "onion", "bun"], toasted: true, melt: true };
const HARBOR_CLASSIC: Recipe = { name: "Harbor Classic", price: 12, layers: ["bun", "lettuce", "patty", "cheese", "tomato", "ketchup", "bun"], toasted: true, melt: true };
const SUN_VALLEY_SUPREME: Recipe = {
  name: "Sun Valley Supreme",
  price: 18,
  layers: ["bun", "patty", "cheese", "bacon", "jalapeno", "egg", "bun"],
  toasted: true,
  melt: true,
  from: 0.3,
};

/** Every town on the road map, region by region. Each region opens at its first town and ends at its capital. */
export const STOPS: Stop[] = [
  PINES,
  {
    ...PINES,
    id: "elkpass",
    crowd: "commuters",
    name: "Elk Pass",
    blurb: "Elk Pass is a highway rest stop. Drivers want food fast and back on the road.",
    newThing: undefined,
    x: 12,
    y: 30,
    roads: ["summit"],
    customers: 11,
    menu: pick(PINES, ["Plain Jane", "Trailhead Classic", "Cheesy Switchback", "Lumberjack Stack"]),
  },
  {
    ...PINES,
    id: "cedarfalls",
    crowd: "families",
    name: "Cedar Falls",
    blurb: "Cedar Falls is a lakeside campground. Families, fishing rods and very hungry kids.",
    newThing: "New here: the Campfire Melt. Melt the cheese on the patty while it's on the grill.",
    x: 44,
    y: 26,
    roads: ["summit"],
    customers: 10,
    menu: pick(PINES, ["Plain Jane", "Trailhead Classic", "Sunrise Summit"], [CAMPFIRE_MELT]),
  },
  {
    ...PINES,
    id: "summit",
    crowd: "foodies",
    name: "Summit City",
    blurb: "Summit City is the big town in the hills. Do well here and the coast road opens.",
    newThing: undefined,
    x: 30,
    y: 44,
    roads: ["saltwater"],
    capital: true,
    customers: 12,
    shiftLength: 200,
    menu: [...PINES.menu, CAMPFIRE_MELT],
  },
  COAST,
  {
    ...COAST,
    id: "gullpoint",
    crowd: "commuters",
    name: "Gull Point",
    blurb: "Gull Point is a fishing harbour. Early starts, big appetites, no patience for fuss.",
    newThing: undefined,
    x: 90,
    y: 74,
    roads: ["harbor"],
    customers: 11,
    menu: pick(COAST, ["Boardwalk Basic", "Low Tide", "Sandy Pickle", "Big Kahuna"]),
  },
  {
    ...COAST,
    id: "driftwood",
    crowd: "party",
    name: "Driftwood",
    blurb: "Driftwood is a surf camp. Everyone's sandy, sunburnt and starving.",
    newThing: undefined,
    x: 62,
    y: 70,
    roads: ["harbor"],
    customers: 12,
    menu: pick(COAST, ["Boardwalk Basic", "Luau Stack", "Sandy Pickle"]),
  },
  {
    ...COAST,
    id: "harbor",
    crowd: "foodies",
    name: "Harbor City",
    blurb: "Harbor City is the coast's big city. Do well here and the desert highway opens.",
    newThing: "New here: the Harbor Classic, with melted cheese.",
    x: 76,
    y: 86,
    roads: ["redmesa"],
    capital: true,
    customers: 13,
    shiftLength: 210,
    menu: [...COAST.menu, HARBOR_CLASSIC],
  },
  DESERT,
  {
    ...DESERT,
    id: "cactus",
    crowd: "commuters",
    name: "Cactus Junction",
    blurb: "Cactus Junction is a truck stop where three highways meet.",
    newThing: undefined,
    x: 15,
    y: 112,
    roads: ["sunvalley"],
    customers: 12,
    menu: pick(DESERT, ["Tumbleweed", "Mesa Smash", "Ranch Breakfast"]),
  },
  {
    ...DESERT,
    id: "dustbowl",
    crowd: "party",
    name: "Dust Bowl Flats",
    blurb: "Dust Bowl Flats is a rodeo town. They like their burgers big and their peppers hot.",
    newThing: undefined,
    x: 42,
    y: 111,
    roads: ["sunvalley"],
    customers: 11,
    menu: pick(DESERT, ["Rattlesnake", "Sunset Double", "Tumbleweed", "Ranch Breakfast"]),
  },
  {
    ...DESERT,
    id: "sunvalley",
    crowd: "foodies",
    name: "Sun Valley",
    blurb: "Sun Valley is the end of the road. Finish here and the trip is complete.",
    newThing: "New here: the Sun Valley Supreme.",
    x: 28,
    y: 125,
    roads: [],
    capital: true,
    customers: 14,
    shiftLength: 220,
    menu: [...DESERT.menu, SUN_VALLEY_SUPREME],
  },
];

export const START_TOWN = "pinecrest";
export const FINAL_TOWN = "sunvalley";

export function townById(id: string): Stop {
  return STOPS.find((t) => t.id === id) ?? STOPS[0];
}

/** First town of each region, in trip order. */
export const REGION_START_IDS = REGION_STARTS.map((t) => t.id);

/** A local event: on its days the town is busier, with its own crowd and sometimes a special. */
export interface TownEvent {
  id: string;
  name: string;
  town: string;
  /** First day it happens, then again every `every` days. */
  day: number;
  every: number;
  crowd: CrowdId;
  /** Customers multiplier and extra seconds of shift. */
  busy: number;
  longer: number;
  blurb: string;
  special?: Recipe;
}

export const EVENTS: TownEvent[] = [
  {
    id: "market",
    name: "Farmers' market",
    town: "cedarfalls",
    day: 3,
    every: 5,
    crowd: "foodies",
    busy: 1.3,
    longer: 30,
    blurb: "Locals with tote bags and opinions about bread.",
  },
  {
    id: "fair",
    name: "County fair",
    town: "summit",
    day: 5,
    every: 7,
    crowd: "families",
    busy: 1.5,
    longer: 40,
    blurb: "Rides, prize pigs and a very long queue for food.",
  },
  {
    id: "surf",
    name: "Surf contest",
    town: "driftwood",
    day: 6,
    every: 6,
    crowd: "party",
    busy: 1.6,
    longer: 40,
    blurb: "Half the coast turns up to watch. Nobody packed lunch.",
    special: { name: "Wipeout", price: 12, layers: ["bun", "patty", "pineapple", "cheese", "ketchup", "bun"], toasted: true, melt: false },
  },
  {
    id: "seafest",
    name: "Harbor festival",
    town: "harbor",
    day: 9,
    every: 7,
    crowd: "foodies",
    busy: 1.35,
    longer: 30,
    blurb: "Boat parade, brass band, and a lot of people who know their food.",
  },
  {
    id: "rodeo",
    name: "Rodeo",
    town: "dustbowl",
    day: 10,
    every: 6,
    crowd: "party",
    busy: 1.6,
    longer: 40,
    blurb: "Big appetites. Bigger hats.",
    special: { name: "Rodeo Double", price: 17, layers: ["bun", "patty", "cheese", "bacon", "patty", "onion", "bun"], toasted: true, melt: true },
  },
  {
    id: "chili",
    name: "Chili cook-off",
    town: "redmesa",
    day: 12,
    every: 7,
    crowd: "families",
    busy: 1.4,
    longer: 30,
    blurb: "Everyone's tasting chili all day and craving something else.",
  },
];

/** The event on in a town on a given day, if any. */
export function eventOn(town: string, day: number): TownEvent | null {
  return EVENTS.find((e) => e.town === town && day >= e.day && (day - e.day) % e.every === 0) ?? null;
}

/** Next day (from `day` on) that an event happens. */
export function nextDay(e: TownEvent, day: number): number {
  if (day <= e.day) return e.day;
  return e.day + Math.ceil((day - e.day) / e.every) * e.every;
}

/** A town as it plays on an event day: busier, longer, its event crowd, and any special added to the menu. */
export function withEvent(t: Stop, e: TownEvent | null): Stop {
  if (!e) return t;
  return {
    ...t,
    crowd: e.crowd,
    customers: Math.round(t.customers * e.busy),
    shiftLength: t.shiftLength + e.longer,
    menu: e.special ? [...t.menu, e.special] : t.menu,
  };
}
