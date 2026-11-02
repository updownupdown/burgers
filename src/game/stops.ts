import type { CrowdId } from "./business";
import type { DrinkId, FryKind, Kind } from "./types";
import { HOUSE_DRINKS, STANDARD_COUNT } from "./types";

export interface Recipe {
  name: string;
  price: number;
  /** Bottom to top. Patties get a random doneness per order. */
  layers: Kind[];
  toasted: boolean;
  /** Eggs: sunny side up (the default) or flipped once, over easy. */
  egg?: "sunny" | "over";
  /** Patties must be smashed flat on the grill. */
  smash?: boolean;
  /** Cheese sitting right on a patty should be melted on the grill. */
  melt?: boolean;
  /** Ordered more often once the shift has warmed up (0..1 of the way through); rarer, but possible, before. */
  from?: number;
  /** Pieces of counted toppings (pickles, onions...) when not the standard number (STANDARD_COUNT). */
  counts?: Partial<Record<Kind, number>>;
  /** Made on the panini press (the Sunny Coast): bread pressed golden, cheese inside melted. */
  panini?: boolean;
  /** Open-faced: only the bread goes in the press; what goes on top is never heated. */
  open?: boolean;
  /**
   * Made on the comal (Red Rock): tacos in the rack (warmed tortillas filled in the rack on the comal's warm end, then up to the tray),
   * a quesadilla (folded and crisped on the comal), or a tostada (a fried shell built flat).
   */
  dish?: "tacos" | "quesadilla" | "tostada";
  /**
   * Baked in the deck oven (Orchard Isle): a flatbread built on the peel and baked (turned round
   * for an even bake, if the cook likes), or a calzone, folded before the oven.
   */
  pie?: "flatbread" | "calzone";
}

/** How many pieces of a counted topping go in each of its layers in this recipe. */
export function recipeCount(recipe: Recipe, kind: Kind): number {
  return recipe.counts?.[kind] ?? STANDARD_COUNT[kind] ?? 1;
}

export type Backdrop = "mountains" | "beach" | "desert" | "orchard";

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
  /** Road map: which region, where on the map (map units, 120 by 170; about two miles each). */
  region: RegionId;
  x: number;
  y: number;
  /** Towns that three passed shifts here open up. */
  roads: string[];
  /** The region's big city: passing it opens the next region. */
  capital?: boolean;
  /** Who turns up here (see CROWD in business.ts). */
  crowd: CrowdId;
  /** Poutine is on the fryer menu here (the Pines bring it in at Cedar Falls). */
  poutine: boolean;
  /**
   * The middle counter is a panini press here instead of the grill (the Sunny Coast): how many
   * clamshell bays, and whether the cutting board is out for slicing (Harbor City).
   */
  press?: { bays: number; slice: boolean };
  /**
   * The middle counter is a comal here (Red Rock), and whether the tortilla press is out (Sun Valley).
   */
  comal?: { tpress: boolean };
  /**
   * The middle counter is a hearth oven here (Orchard Isle): how many pies it holds, and whether
   * the board is out for cutting them in four (Port Amber).
   */
  oven?: { spots: number; board: boolean };
  /**
   * What the fryer makes here, the usual side first: fries in the Pines, sweet potato fries too on
   * the coast from Driftwood, chips (and churros at Sun Valley) in Red Rock. Missing is just fries.
   */
  fryer?: FryKind[];
}

/** Which middle counter a town cooks on. */
export type MiddleCounter = "grill" | "press" | "comal" | "oven";
export const middleOf = (t: Pick<Stop, "press" | "comal" | "oven">): MiddleCounter => (t.press ? "press" : t.comal ? "comal" : t.oven ? "oven" : "grill");
/** The fryer's kinds in a town (fries unless it says otherwise). */
export const fryerOf = (t: Pick<Stop, "fryer">): FryKind[] => t.fryer ?? ["fries"];

export type RegionId = "mountains" | "coast" | "desert" | "orchard";

export interface Region {
  id: RegionId;
  name: string;
  /** Land colour on the map. */
  color: string;
}

export const REGIONS: Region[] = [
  { id: "mountains", name: "The Pines", color: "#8fbf7a" },
  { id: "coast", name: "Sunny Coast", color: "#e9d39a" },
  { id: "desert", name: "Red Rock", color: "#e2a77a" },
  { id: "orchard", name: "Orchard Isle", color: "#c9a3bd" },
];

/**
 * The soda fountain's five buttons, left to right: the area's two local drinks, then Road Cola,
 * Water and Iced Tea, which every town pours.
 */
const LOCAL_DRINKS: Record<RegionId, [DrinkId, DrinkId]> = {
  mountains: ["pine", "pink"],
  coast: ["pink", "cucumber"],
  desert: ["hibiscus", "lime"],
  orchard: ["cider", "bramble"],
};

export function fountainFor(region: RegionId): DrinkId[] {
  return [...LOCAL_DRINKS[region], ...HOUSE_DRINKS];
}

// ---------------------------------------------------------------------------
// The Pines: five burgers, one signature step each (plain, egg, melt, smash, double). The old
// Plain Jane lives on as a Classic with two NOs.

const CLASSIC: Recipe = { name: "Trailhead Classic", price: 9, layers: ["bun", "ketchup", "patty", "lettuce", "tomato", "bun"], toasted: false };
const SUNRISE: Recipe = { name: "Sunrise Summit", price: 11, layers: ["bun", "lettuce", "patty", "egg", "bun"], toasted: true, from: 0.15 };
const CAMPFIRE: Recipe = { name: "Campfire Melt", price: 11, layers: ["bun", "patty", "cheese", "onion", "bun"], toasted: false, melt: true };
const SMASH: Recipe = { name: "Summit Smash", price: 12, layers: ["bun", "patty", "cheese", "pickle", "mustard", "bun"], toasted: false, smash: true, melt: true };
const LUMBERJACK: Recipe = { name: "Lumberjack Stack", price: 15, layers: ["bun", "patty", "cheese", "bacon", "patty", "ketchup", "bun"], toasted: true, melt: true, from: 0.3 };

// The Sunny Coast: paninis on the press (DESIGN §24, phase 2). Built on the tray bottom to top,
// pressed closed until the bread is golden and the cheese oozes. Proteins are pressed on their own
// first. Avocado Toast is open-faced: only the bread goes in the press.
const CAPRESE: Recipe = { name: "Caprese", price: 10, layers: ["ciabatta", "pesto", "mozzarella", "tomato", "basil", "ciabatta"], toasted: true, panini: true, melt: true, counts: { mozzarella: 3, tomato: 3 } };
const AVO_TOAST: Recipe = { name: "Avocado Toast", price: 9, layers: ["sourdough", "avocado", "rocket"], toasted: true, panini: true, open: true, counts: { avocado: 4 } };
const TUNA_MELT: Recipe = { name: "Tuna Melt", price: 11, layers: ["sourdough", "tuna", "cheddar", "redonion", "sourdough"], toasted: true, panini: true, melt: true, counts: { tuna: 2, redonion: 2 } };
const CHICKEN_PESTO: Recipe = { name: "Chicken Pesto", price: 13, layers: ["ciabatta", "pesto", "chicken", "mozzarella", "tomato", "ciabatta"], toasted: true, panini: true, melt: true, counts: { mozzarella: 2, tomato: 2 }, from: 0.15 };
const VEGGIE_CLUB: Recipe = { name: "Veggie Club", price: 12, layers: ["ciabatta", "aioli", "veggie", "tomato", "rocket", "ciabatta"], toasted: true, panini: true, counts: { tomato: 2 }, from: 0.2 };
// Red Rock: tacos and quesadillas on the comal (DESIGN §24, phase 3). Taco tortillas are warmed on
// the comal and filled in the taco rack on its warm end (after build #73), one scoop of pork per
// taco; toppings sprinkle over the whole rack, which then goes up to the tray. A quesadilla is built, folded and flipped on the comal. The tostada's shell comes
// from the fryer and is built flat on the tray.
const STREET_TACOS: Recipe = { name: "Street Tacos", price: 10, layers: ["corn", "pork", "onion", "cilantro", "lime"], toasted: true, dish: "tacos", counts: { corn: 3, pork: 3, onion: 1 } };
const QUESADILLA: Recipe = { name: "Quesadilla", price: 9, layers: ["flour", "jack"], toasted: true, dish: "quesadilla", melt: true, counts: { jalapeno: 2, pork: 1 } };
const PASTOR_TACOS: Recipe = { name: "Pastor Tacos", price: 12, layers: ["corn", "pork", "pineapple", "onion", "greensalsa"], toasted: true, dish: "tacos", counts: { corn: 2, pork: 2, onion: 1 }, from: 0.15 };
const BEAN_TOSTADA: Recipe = { name: "Bean Tostada", price: 10, layers: ["tostada", "beans", "lettuce", "jack", "crema"], toasted: true, dish: "tostada", counts: { beans: 1 } };
const BREAKFAST_TACO: Recipe = { name: "Breakfast Taco", price: 11, layers: ["flour", "beans", "egg", "redsalsa"], toasted: true, dish: "tacos", egg: "over", counts: { beans: 1 }, from: 0.15 };
/** The Rodeo special at Cactus Junction: a platter of four street tacos. */
const RODEO_PLATTER: Recipe = { name: "Rodeo Platter", price: 15, layers: ["corn", "pork", "onion", "cilantro", "lime"], toasted: true, dish: "tacos", counts: { corn: 4, pork: 4, onion: 1 }, from: 0.1 };
// Orchard Isle: flatbreads from the hearth oven (DESIGN §24, phase 4). Built on the peel (dough,
// sauce or oil, then the toppings) and slid into the oven, turned round there if the cook wants
// an even bake; basil, rocket and honey go on at the tray after the oven. The calzone is folded on
// the peel.
const HARVEST_RED: Recipe = { name: "Harvest Red", price: 10, layers: ["dough", "redsauce", "mozzarella", "basil"], toasted: true, pie: "flatbread", melt: true, counts: { mozzarella: 4 } };
const MUSHROOM: Recipe = { name: "Mushroom", price: 11, layers: ["dough", "redsauce", "mozzarella", "mushroom"], toasted: true, pie: "flatbread", melt: true, counts: { mozzarella: 3, mushroom: 5 } };
const FIG_HAM: Recipe = { name: "Fig & Ham", price: 13, layers: ["dough", "oil", "mozzarella", "ham", "fig", "honey"], toasted: true, pie: "flatbread", melt: true, counts: { mozzarella: 3, ham: 3, fig: 4 }, from: 0.15 };
const PEAR_BLUE: Recipe = { name: "Pear & Blue", price: 12, layers: ["dough", "blue", "pear", "rocket"], toasted: true, pie: "flatbread", melt: true, counts: { blue: 4, pear: 5 } };
const CALZONE: Recipe = { name: "Calzone", price: 14, layers: ["dough", "redsauce", "mozzarella", "ham", "mushroom"], toasted: true, pie: "calzone", melt: true, counts: { mozzarella: 3, ham: 2, mushroom: 3 }, from: 0.2 };
/** The Harvest fair special at Larkvale: a loaded flatbread with everything from the fair. */
const HARVEST_FAIR: Recipe = { name: "Harvest Fair", price: 15, layers: ["dough", "redsauce", "mozzarella", "ham", "mushroom", "pear", "basil"], toasted: true, pie: "flatbread", melt: true, counts: { mozzarella: 3, ham: 3, mushroom: 3, pear: 3 }, from: 0.1 };

const PINES_PANTRY: Kind[] = ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", "pickle"];
/** The press counter's pans: breads, proteins and the tuna well behind the press, fillings in the cold rail. */
const COAST_FIRST: Kind[] = ["ciabatta", "sourdough", "mozzarella", "tomato", "basil", "avocado", "rocket"];
/** The comal counter's pans: tortillas and the steam wells behind the comal, the cold rail on the left, the salsas in the caddy. */
const DESERT_FIRST: Kind[] = ["corn", "flour", "pork", "onion", "cilantro", "jack", "jalapeno", "lime"];
const DESERT_MID: Kind[] = [...DESERT_FIRST, "beans", "pineapple", "lettuce", "greensalsa", "crema"];
/**
 * The oven counter's pans: dough, the sauce pot and the oil and honey bottles have their own spots;
 * the toppings go in the rail on the left.
 */
const ORCHARD_FIRST: Kind[] = ["dough", "redsauce", "mozzarella", "mushroom", "basil"];
const ORCHARD_MID: Kind[] = [...ORCHARD_FIRST, "oil", "honey", "ham", "fig", "blue", "pear", "rocket"];

/**
 * Every town on the road map, area by area. Each area opens at its first town and ends at its
 * capital; the menus grow town by town (first town two dishes, a middle town adds one, the
 * capital has them all). Positions follow the region study's sketch (map space 120 by 170).
 */
export const STOPS: Stop[] = [
  // ---- The Pines: a Y, the valley road up to Summit City and a spur up the pass to Elk Pass.
  {
    id: "pinecrest",
    crowd: "families",
    name: "Pinecrest",
    blurb: "Pinecrest is a valley town full of hungry hikers. Keep them fed until closing time.",
    backdrop: "mountains",
    region: "mountains",
    x: 30,
    y: 24,
    roads: ["elkpass", "cedarfalls"],
    // The first town: the grill, the egg and the fryer, with a short cold rail.
    pantry: ["bun", "patty", "egg", "cheese", "lettuce", "tomato"],
    poutine: false,
    customers: 9,
    shiftLength: 180,
    menu: [CLASSIC, SUNRISE],
  },
  {
    id: "elkpass",
    crowd: "commuters",
    name: "Elk Pass",
    blurb: "Elk Pass is a rest stop up the switchbacks. Drivers want food fast and back on the road.",
    backdrop: "mountains",
    region: "mountains",
    x: 17,
    y: 43,
    // A spur: the Old Pass road on to Cactus Junction is shut by rockfall until the desert is reached (LINKS).
    roads: [],
    pantry: ["bun", "patty", "egg", "cheese", "lettuce", "tomato", "pickle"],
    poutine: false,
    customers: 11,
    shiftLength: 180,
    newThing: "New here: the Summit Smash. Press and hold a fresh patty on the grill to smash it flat. Smashed patties cook fast!",
    menu: [CLASSIC, SUNRISE, SMASH],
  },
  {
    id: "cedarfalls",
    crowd: "families",
    name: "Cedar Falls",
    blurb: "Cedar Falls is a lakeside campground. Families, fishing rods and very hungry kids.",
    backdrop: "mountains",
    region: "mountains",
    x: 46,
    y: 22.5,
    roads: ["summit"],
    pantry: ["bun", "patty", "egg", "cheese", "lettuce", "tomato", "onion"],
    poutine: true,
    customers: 10,
    shiftLength: 180,
    newThing: "New here: the Campfire Melt, and poutine. Melt the cheese on the patty while it's on the grill.",
    menu: [CLASSIC, SUNRISE, CAMPFIRE],
  },
  {
    id: "summit",
    crowd: "foodies",
    name: "Summit City",
    blurb: "Summit City is the market town where the valley opens. Do well here and the Coast Highway opens.",
    backdrop: "mountains",
    region: "mountains",
    x: 38,
    y: 52,
    roads: ["saltwater"],
    capital: true,
    pantry: PINES_PANTRY,
    poutine: true,
    customers: 12,
    shiftLength: 200,
    newThing: "New here: the Lumberjack Stack, two patties and bacon. It comes up more later in the day.",
    menu: [CLASSIC, SUNRISE, CAMPFIRE, SMASH, LUMBERJACK],
  },
  // ---- Sunny Coast: a string of towns along the shore.
  {
    id: "saltwater",
    crowd: "party",
    name: "Saltwater Bay",
    blurb: "Saltwater Bay is a beach town at the head of the bay: surfers, lifeguards and one very bold crab.",
    backdrop: "beach",
    region: "coast",
    x: 72,
    y: 54,
    roads: ["gullpoint"],
    pantry: COAST_FIRST,
    poutine: false,
    press: { bays: 2, slice: false },
    customers: 10,
    shiftLength: 190,
    newThing: "New here: the panini press. Build the sandwich in a bay (or on the tray), pull the handle down, and swipe it up to lift the lid when the meter is golden.",
    menu: [CAPRESE, AVO_TOAST],
  },
  {
    id: "gullpoint",
    crowd: "commuters",
    name: "Gull Point",
    blurb: "Gull Point is a fishing harbour out on the headland. Early starts, big appetites, no patience for fuss.",
    backdrop: "beach",
    region: "coast",
    x: 99,
    y: 59,
    roads: ["driftwood"],
    pantry: [...COAST_FIRST, "tuna", "cheddar", "redonion"],
    poutine: false,
    press: { bays: 2, slice: false },
    newThing: "New here: the Tuna Melt. Tap the tuna well for a scoop. Sourdough browns faster than ciabatta, so it comes out sooner.",
    customers: 11,
    shiftLength: 190,
    menu: [CAPRESE, AVO_TOAST, TUNA_MELT],
  },
  {
    id: "driftwood",
    crowd: "party",
    name: "Driftwood",
    blurb: "Driftwood is a surf camp a short hop down the shore. Everyone's sandy, sunburnt and starving.",
    backdrop: "beach",
    region: "coast",
    x: 95,
    y: 77,
    roads: ["harbor"],
    pantry: [...COAST_FIRST, "tuna", "cheddar", "redonion", "chicken"],
    poutine: false,
    press: { bays: 2, slice: false },
    fryer: ["fries", "sweet"],
    newThing: "New here: Chicken Pesto (press the chicken on its own first, then the whole sandwich) and sweet potato fries, which cook fast.",
    customers: 12,
    shiftLength: 190,
    menu: [CAPRESE, AVO_TOAST, TUNA_MELT, CHICKEN_PESTO],
  },
  {
    id: "harbor",
    crowd: "foodies",
    name: "Harbor City",
    blurb: "Harbor City is the coast's city on a sheltered harbour. Do well here and the Desert Highway opens.",
    backdrop: "beach",
    region: "coast",
    x: 85,
    y: 100,
    roads: ["redmesa"],
    capital: true,
    pantry: [...COAST_FIRST, "tuna", "cheddar", "redonion", "chicken", "veggie"],
    poutine: false,
    press: { bays: 3, slice: true },
    fryer: ["fries", "sweet"],
    newThing: "New here: the Veggie Club, a third press bay and the cutting board. Swipe across a pressed panini on the board to cut it in half.",
    customers: 13,
    shiftLength: 210,
    menu: [CAPRESE, AVO_TOAST, TUNA_MELT, CHICKEN_PESTO, VEGGIE_CLUB],
  },
  // ---- Red Rock: a long triangle, with 64 empty miles between Red Mesa and Cactus Junction.
  {
    id: "redmesa",
    crowd: "families",
    name: "Red Mesa",
    blurb: "Red Mesa is a ranch town where the Desert Highway comes down off the coast. The cowhands like it hot.",
    backdrop: "desert",
    region: "desert",
    x: 52,
    y: 95,
    roads: ["cactus"],
    pantry: DESERT_FIRST,
    poutine: false,
    comal: { tpress: false },
    fryer: ["chips"],
    customers: 11,
    shiftLength: 200,
    newThing: "New here: the comal, hot on the left and warm on the right. Warm tortillas until they're soft and spotted, then stand them in the taco rack on the warm end, fill them there and drag the rack up to the tray. For a quesadilla, lay cheese on a flour tortilla, drag its edge across to fold it, and flip it once.",
    menu: [STREET_TACOS, QUESADILLA],
  },
  {
    id: "cactus",
    crowd: "commuters",
    name: "Cactus Junction",
    blurb: "Cactus Junction is a truck stop where three highways meet. Reaching it clears the Old Pass road home.",
    backdrop: "desert",
    region: "desert",
    x: 21,
    y: 103,
    roads: ["sunvalley"],
    pantry: DESERT_MID,
    poutine: true,
    comal: { tpress: false },
    fryer: ["chips"],
    customers: 12,
    shiftLength: 200,
    newThing: "New here: Pastor Tacos (char the pineapple on the comal), the Bean Tostada (fry a corn tortilla into a shell) and nachos.",
    menu: [STREET_TACOS, QUESADILLA, PASTOR_TACOS, BEAN_TOSTADA],
  },
  {
    id: "sunvalley",
    crowd: "foodies",
    name: "Sun Valley",
    blurb: "Sun Valley is the oasis town in the only green valley. Do well here and the causeway to Orchard Isle opens.",
    backdrop: "desert",
    region: "desert",
    x: 33,
    y: 137,
    roads: ["applecross"],
    capital: true,
    pantry: [...DESERT_MID, "egg", "redsalsa"],
    poutine: true,
    comal: { tpress: true },
    fryer: ["chips", "churros"],
    customers: 14,
    shiftLength: 220,
    newThing: "New here: the Breakfast Taco (crack the egg on the comal, flip it once), churros, and the tortilla press: hold it to flatten a fresh tortilla. Customers pay extra for hand-pressed ones.",
    menu: [STREET_TACOS, QUESADILLA, PASTOR_TACOS, BEAN_TOSTADA, BREAKFAST_TACO],
  },
  // ---- Orchard Isle: a short chain across the causeway.
  {
    id: "applecross",
    crowd: "families",
    name: "Applecross",
    blurb: "Applecross is a farm village at the island end of the causeway. Orchards, hay carts and big lunches.",
    backdrop: "orchard",
    region: "orchard",
    x: 80,
    y: 145,
    roads: ["larkvale"],
    pantry: ORCHARD_FIRST,
    poutine: false,
    oven: { spots: 2, board: false },
    fryer: ["fries", "zucchini"],
    customers: 11,
    shiftLength: 200,
    newThing: "New here: the deck oven. Build a flatbread on the peel, drag the peel by its handle into the oven and swipe down. The side facing the hot wall browns faster: turn the pie round with the peel's tip for an even bake. Push the peel in under it to lift it out, and swipe down over a tray. Basil goes on after.",
    menu: [HARVEST_RED, MUSHROOM],
  },
  {
    id: "larkvale",
    crowd: "party",
    name: "Larkvale",
    blurb: "Larkvale is a vineyard valley with a weekly harvest fair. Long tables, loud songs, empty plates.",
    backdrop: "orchard",
    region: "orchard",
    x: 93,
    y: 152,
    roads: ["portamber"],
    pantry: ORCHARD_MID,
    poutine: false,
    oven: { spots: 2, board: false },
    fryer: ["fries", "zucchini", "fritters"],
    customers: 12,
    shiftLength: 210,
    newThing: "New here: white bases. Fig & Ham gets olive oil before the oven and honey after; Pear & Blue gets rocket after. And apple fritters, with cinnamon sugar.",
    menu: [HARVEST_RED, MUSHROOM, FIG_HAM, PEAR_BLUE],
  },
  {
    id: "portamber",
    crowd: "foodies",
    name: "Port Amber",
    blurb: "Port Amber is an old stone harbour, the last town of the trip. The ferry to Harbor City runs from here.",
    backdrop: "orchard",
    region: "orchard",
    x: 98,
    y: 127,
    roads: [],
    capital: true,
    pantry: ORCHARD_MID,
    poutine: false,
    oven: { spots: 3, board: true },
    fryer: ["fries", "zucchini", "fritters"],
    customers: 14,
    shiftLength: 220,
    newThing: "New here: the Calzone (fold it on the peel; it bakes slower), a third oven spot and the board: set a flatbread on it with the peel and swipe across it twice to cut it in four.",
    menu: [HARVEST_RED, MUSHROOM, FIG_HAM, PEAR_BLUE, CALZONE],
  },
];

/**
 * Late links: roads that open nothing new, they only shorten the way back. Each can be driven
 * once both its towns are open: the Old Pass road clears when Cactus Junction is reached, and
 * the ferry runs once Port Amber is.
 */
export interface Link {
  a: string;
  b: string;
  name: string;
  ferry?: boolean;
}
export const LINKS: Link[] = [
  { a: "elkpass", b: "cactus", name: "Old Pass road" },
  { a: "portamber", b: "harbor", name: "Ferry", ferry: true },
];

export const START_TOWN = "pinecrest";
export const FINAL_TOWN = "portamber";

export function townById(id: string): Stop {
  return STOPS.find((t) => t.id === id) ?? STOPS[0];
}

/** First town of each region, in trip order. */
export const REGION_START_IDS = REGIONS.map((r) => STOPS.find((t) => t.region === r.id)!.id);

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
    town: "cactus",
    day: 10,
    every: 6,
    crowd: "party",
    busy: 1.6,
    longer: 40,
    blurb: "Big appetites. Bigger hats.",
    special: RODEO_PLATTER,
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
  {
    id: "harvest",
    name: "Harvest fair",
    town: "larkvale",
    day: 15,
    every: 7,
    crowd: "families",
    busy: 1.5,
    longer: 40,
    blurb: "Grape stomping, apple bobbing and a very long table under the vines.",
    special: HARVEST_FAIR,
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
