import * as THREE from "three";
import { softDot, starTex } from "../render/sprites";
import { bakeStep, bakeTopping, COMAL_SPEED, cookLevel, darkSide, slowPastOver, slowPastOverValue, COOK_SCALE, DRINK_FILL, flipFaces, FRY_RATE, FRY_SPEED, FRY_ZONE, fryPerfect, grillStep, MARK_RATE, MELT_RATE, PRESS_INSIDE, PRESS_MELT, PRESS_RATE, PRESS_SPEED, PRESS_WARM, QUESO_MELT, rimAngle, rimOf, type Cookable } from "../game/cooking";
import type { DrinkId, FriesSize, Garnish, FryKind, Kind, Layer, Piece, SauceKind, Size } from "../game/types";
import { BREADS, CUP_SPEED, GRILLABLE, isSauce, OVEN_CHEESE, PRESS_CHEESE, PROTEINS, SCOOPED, TORTILLAS } from "../game/types";
import { fountainFor, type MiddleCounter } from "../game/stops";
import { BAY, BOARD, CLOSED_GAP, makeCuttingBoard, makePressBay, PLATE, type PressBayObject } from "../render/machines/press";
import { makeFryTray, makeJalapenoHandful, makeJalapenoTray, makeSugarShaker, SWEET_TRAY } from "../render/fryer";
import { makeComal, makeTortillaPress, type TortillaPressObject } from "../render/machines/comal";
import { BATTER, BENCH, DECK, DOUGH, HEARTH, makeBatterBowl, makeBench, makeDoughStack, makeHearthOven, makePeel, makeSaucePot, PEEL, PEEL_REACH, POT, type HearthOvenObject } from "../render/machines/oven";
import { atRim, bladeUnder, grip, NUDGE, nudgeSpin, pieYawOf, spinPie, underPie, type XZ } from "../game/peel";
import { INNER_RX, INNER_RZ, makeFlatbread, PIE, pieYaw, type FlatbreadObject } from "../render/flatbread";
import { QUESO } from "../render/sides";
import { tickTacos } from "../render/tacos";
import { makeTacoRack } from "../render/dishes";
import { ageLayers, goesStale, RACK_SLOTS, WARM_AGE } from "../game/hold";
import { brushedSteel, counterTop } from "../render/wear";
import { CUP_DIMS, cupSurfaceY, makeCarton, makeCartonStack, makeCup, makeFood, makeBasketFries, makeFries, stackBases, stackHeight, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { makeGarnishDish } from "../render/models/garnish";
import { dressCup } from "../render/cup";
import { CURD_TRAY, FREEZER, GRAVY_WELL, makeCurdHandful, makeCurdTray, makeFreezer, makeGravyWell, makeLadle, makeShaker } from "../render/fryer";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { makeGriddle, ZONE_HEATS, type GriddleObject, type ZoneHeat } from "../render/machines/griddle";
import { makeColdRail } from "../render/machines/coldRail";
import { makeSauceBottle, makeSauceCaddy, type SauceCaddyObject } from "../render/machines/sauces";
import { DRINK_TINT, makeCupStack, makeFountain, type FountainObject, makeFryBasket, makeFryer, makeIceWell, makeLidStackSized, makePackPad, makeTrashChute, FRY_BASKET, type FryerObject } from "../render/machines";
import { CABIN } from "../render/cabin";
import { makeKnife } from "../render/knife";
import { wallMaterial } from "../render/walls";
import { applyKitchenLight, KITCHEN_BG, type KitchenLight } from "../render/lighting";
import { COUNTER_FOOD, SCALE } from "../render/units";

export const PAGES = ["Drinks", "Grill", "Fryer"] as const;
/** True when an object and everything it sits in are shown (no object counts as shown). */
const shown = (o: THREE.Object3D | undefined): boolean => {
  for (let x: THREE.Object3D | null | undefined = o; x; x = x.parent) if (!x.visible) return false;
  return true;
};
export const HOME_PAGE = 1;
/**
 * The window line: drinks, grill and fryer run along the serving window, facing it, so
 * the tray above the counter really is the window ledge. (The truck is drawn wider than it could
 * be so every counter gets the window.) Page centres in world x:
 */
const PAGE_CX = [-14, 0, 15];
export const pageX = (i: number) => PAGE_CX[i];
/** One zoom for every page: about 9 units (1.35 m) across the middle, which fits the grill page front to back. */
const VIEW_W = 9.0;
/** Camera stops: one per counter, at the same zoom everywhere so food stays one size. */
export const STOPS: readonly { page: number; x: number }[] = PAGE_CX.map((x, page) => ({ page, x }));
/** Camera height and how far behind the look point it hangs. */
const CAM_H = 12.6;
const CAM_BACK = 5.3;
/** Where the camera looks on the window line. */
const LOOK_Z = -0.1;

/**
 * One scale for food on the counter, against ingredient units: on the grill and in the hand.
 * Keeping it the same everywhere means nothing grows or shrinks as it moves between them. It's
 * the study's per-category rule (burger parts at 1.5 times life size).
 */
export const FOOD_SCALE = COUNTER_FOOD;
/** Grill items are drawn at the counter food scale. */
export const GRILL_SCALE = FOOD_SCALE;

/**
 * The grill page after build #36: a wide griddle in three identical zones front right, the
 * grillable pans in a row behind it, the cold toppings (cheese included) in a rail down the left
 * and the sauce caddy in the front left corner. Burgers are built on the trays above.
 */
const GRIDDLE = { x: 1.2, z: 0.62 };
/** The row of grillable pans behind the griddle, and the cold rail of everything else. */
const GRILL_PANS = { x: 1.2, z: -2.45 };
const SIDE_PANS = { x: -3.0, z: -1.05 };
const CADDY = { x: -2.82, z: 2.2 };

/**
 * The press page (the Sunny Coast), in the grill page's place: breads, proteins and the tuna well
 * in the row of pans at the back, the cold fillings in a rail down the left (two pans across, as
 * many rows as it needs), the clamshell bays in a row in the middle with a meter under each, the
 * pesto and aioli caddy at the front, and at Harbor City a cutting board front right.
 */
const PRESS = { x: 1.2, z: 0.3, gap: 0.12 };
const PRESS_CADDY = { x: -0.62, z: 2.22 };
const PRESS_BOARD = { x: 2.5, z: 1.98 };
/**
 * The comal page (Red Rock), in the grill page's place: the comal on the griddle's footprint
 * (hot left two thirds, warm right third), tortillas, pork, beans and pineapple in the row of pans
 * at the back, the cold toppings in the left rail, the salsa and crema caddy at the front and, at
 * Sun Valley, the tortilla press front right.
 */
const COMAL_CADDY = { x: -0.45, z: 2.42 };
const TPRESS = { x: 2.45, z: 2.5 };
/** The tortilla press is drawn a little smaller than life, so it fits the front corner. */
const TPRESS_SCALE = 0.85;
/**
 * The taco rack on the comal's warm end (after build #73), page-local half sizes of its footprint
 * (a four-slot rack drawn as on a tray, at the counter food scale) and how far right of the warm
 * end's middle it stands.
 */
const RACK_HALF = { x: 0.8, z: 0.37 };
const RACK_DX = -0.04;
/** The rack is drawn a little bigger than a platter's on a tray, so its four tacos read on the plate. */
export const RACK_SCALE = 1.08;
/** Kinds that go in the row of pans behind the comal. */
const COMAL_BACK = (k: Kind) => TORTILLAS.has(k) || SCOOPED.has(k) || k === "pineapple";
/** The left rail's back edge stays put whatever its row count, so the pans line up with the grill page's. */
const SIDE_BACK_Z = SIDE_PANS.z - 2.1;
/** How long a refused lid takes to settle back open. */
const SHAKE_S = 0.42;
/** Most bays a press has (Harbor City); fewer are hidden. */
export const MAX_BAYS = 3;
/** Kinds that go in the row of pans behind the press. */
const PRESS_BACK = (k: Kind) => BREADS.has(k) || PROTEINS.has(k) || k === "tuna";
/**
 * The oven page (Orchard Isle), in the grill page's place (DESIGN §24, after build #69): the deck
 * oven across the back, its pies in a row on the deck with a meter under each, the cold rail down
 * the left as at the press, and the front strip in three columns: the dough bases over the marble
 * bench (Port Amber's cutting board in its place) on the left, the peel lying in the middle with
 * its handle toward the front, and the sauce pot over the oil and honey caddy on the right.
 */
const OVEN_Z = -1.6;
const OVEN_XS: Record<number, number[]> = { 1: [1.35], 2: [0.4, 2.5], 3: [-0.4, 1.45, 3.3] };
export const MAX_OVEN = 3;
/** Where the peel lies when it's put down (its blade's centre): the spot a pie is built on. */
const PEEL_HOME = { x: 1.3, z: 1.0 };
const DOUGH_AT = { x: -0.8, z: 0.55 };
const BENCH_AT = { x: -0.8, z: 2.15 };
const POT_AT = { x: 3.3, z: 0.62 };
const OVEN_CADDY = { x: 3.02, z: 2.2 };
/** The board at Port Amber, in the bench's place and a little smaller so it fits. */
const OVEN_BOARD = { x: BENCH_AT.x, z: BENCH_AT.z, scale: 0.88 };
/**
 * Where the board's knife lies (DESIGN §31), from the board's middle. At the press it lies along
 * the board's right edge; at the oven a flatbread fills the board and the peel stands right beside
 * it, so it lies on the counter at the front, past the peel's handle (narrower to tap there, so it
 * never takes a grab meant for the handle).
 */
const KNIFE_AT = { press: { x: 0.86, y: BOARD.h, z: 0.02, tap: 1 }, oven: { x: 2.95, y: 0, z: 0.34, tap: 0.65 } };
/** How high the peel rides over the front of the counter while it's carried. */
const PEEL_HOVER = 0.28;
/** The fryer's batter bowl (Orchard Isle), at the gravy well's spot. */
const BATTER_AT = { x: 3.42, z: -2.05 };

/** The griddle's cook surface, zones and buttons, griddle-local (read once from the model). */
const GRIDDLE_SPOTS = makeGriddle().userData.spots;
const GRIDDLE_SURFACE = GRIDDLE_SPOTS.surface;
export const GRILL_TOP = GRIDDLE_SURFACE.y;
/** How far food on the grille sits above GRILL_TOP: on its bars (see grillTopAt). */
const GRILLE_LIFT = GRIDDLE_SPOTS.grille;
/** Heights of the oven's hearth and the peel's blade, for drops and painting. */
export const HEARTH_Y = HEARTH.y;
export const PEEL_Y = PEEL.y;
const GRILL_BOUNDS = {
  x0: GRIDDLE.x + GRIDDLE_SURFACE.x0 + 0.32,
  x1: GRIDDLE.x + GRIDDLE_SURFACE.x1 - 0.32,
  z0: GRIDDLE.z + GRIDDLE_SURFACE.z0 + 0.32,
  // Kept back from the front edge, so a front patty's meter clears the zone buttons.
  z1: GRIDDLE.z + GRIDDLE_SURFACE.z1 - 0.38,
};
/** The three grill zones, page-local x, left to right. */
export const GRILL_ZONES = GRIDDLE_SPOTS.zones.map((z) => ({ x0: GRIDDLE.x + z.x0, x1: GRIDDLE.x + z.x1 }));
/**
 * The left zone is a ridged grille (patties come off it with grill marks; an egg cracked on it is
 * a mess), the middle is the flat plate (the only place for eggs), the right is the warming end.
 * Each zone starts a shift hot, hot, warm.
 */
export const ZONE_START: ZoneHeat[] = ["hot", "hot", "warm"];
export const GRILLE_ZONE = 0;
export const FLAT_ZONE = 1;
/** How fast each setting cooks, against full heat. Warm doesn't cook at all; it just keeps food hot (nothing goes stale there). */
const ZONE_RATE: Record<ZoneHeat, number> = { off: 0, warm: 0, hot: 1 };
/** Pieces of one kind can be stacked on the grill this high (buns and patties held for later). */
export const GRILL_STACK_MAX = 6;
/** Kinds that stack on the grill. */
const STACKS: ReadonlySet<Kind> = new Set<Kind>(["bun", "patty", "bacon"]);
/** Trash slot running along the front edge of every counter, page-local z. */
const TRASH = { z0: 3.05, z1: 3.75 };
/** The counter's front edge: just past the trash chute's rim, so the chute is the last thing on the counter. */
const COUNTER_FRONT = TRASH.z1 + 0.22;
const mixHex = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
/** The slot runs the full width of every counter (page-local x), and on between them. */
const TRASH_HALF = 4.4;
/** The chute's two ends (world x): just inside the left edge of the first view and the right edge of the last. */
const TRASH_END_GAP = 1.05;
const TRASH_X0 = () => pageX(0) - VIEW_W / 2 + TRASH_END_GAP;
const TRASH_X1 = () => pageX(PAGES.length - 1) + VIEW_W / 2 - TRASH_END_GAP;

/**
 * Fryer page, "front pass", in page-local x and z, on one screen. The big potato freezer is at
 * the back left with the drop-in fryer right beside it and the cheese curds in a cooled tray in
 * front of the freezer. Gravy is in a heated well at the back right, the salt below it. The front strip by your thumb is the pass:
 * carton stacks on the left, packing pads in the middle. Cooked fries always travel down the
 * screen, so lifting a basket (an upward flick) never looks like a carry.
 */
const FRYER = {
  fryer: { x: 0.25, z: -1.3 },
  freezer: { x: -3.35, z: -1.75 },
  stacks: [["S", -3.45], ["M", -2.35], ["L", -1.25]] as [FriesSize, number][],
  stackZ: 1.75,
  pads: { x: 1.45, z: 1.75 },
  gravy: { x: 3.42, z: -2.1 },
  curds: { x: -3.35, z: 0.25 },
  shaker: { x: 3.42, z: -0.2 },
  sugar: { x: 3.42, z: 0.85 },
};
/** The fryer counter's pan of corn tortillas (tostada towns): under the chips, where Sun Valley's churros were. */
const FRYER_CORN = { x: -3.35, z: -0.95, s: 0.85 };
/** The fryer (and its baskets) drawn this much bigger than the model, in the room a smaller potato freezer frees up. */
const FRYER_SCALE = 1.3;
/** The salt shaker is drawn bigger than life so it reads as a thing to pick up. */
const SHAKER_SCALE = 1.6;
/** One packing pad (the cream square inside its orange outline). */
const PAD = { w: 1.47, d: 1.07 };
/** A packing pad with nothing on it. */
export const EMPTY_PACK = { size: null, cook: 0, fill: 0, salt: 0, curds: false, gravy: false, fry: "fries" as FryKind, held: 0 } as const;
/** Cartons on the pads and in their stacks, against carton units. */
const PACK_SCALE = SCALE.fries;
const CARTON_STACK_SCALE = SCALE.fries;

/** Cup and carton stacks never run out: this is just how many are drawn. */
const STACK_SHOWN = 10;

/**
 * Drinks page: a small ice bin and a big fountain share the back wall, the middle of the counter
 * is free for cups to stand anywhere, and the front row holds the cup stacks on the left and a
 * lid stack per cup size on the right, spread out along the whole counter.
 */
/** The fountain is drawn this much bigger than its model, so its buttons are easy to hit. */
const FOUNTAIN_SCALE = 1.22;
/** Forward of the back wall, so the fountain's buttons clear the slim backsplash at the top of the view. */
const FOUNTAIN = { x: 1.1, z: -0.85 };
/** The oven's commonest toppings, kept in the cold rail's front row. */
const OVEN_NEAR: Kind[] = ["mozzarella", "basil"];

/** The ice bin is half the fountain model's width. */
const ICE_WIDTH = 0.5;
const ICE = { x: -3.25, z: -2.2 };
const CUP_STACKS: [Size, number][] = [["S", -3.5], ["M", -2.25], ["L", -1.0]];
const LID_STACKS: [Size, number][] = [["S", 1.0], ["M", 2.25], ["L", 3.5]];
const FRONT_Z = 1.95;
/** The garnish dish (after build #78): in the gap between the ice well and the small cups. */
const GARNISH_DISH = { x: -3.05, z: 0.05 };
type P3 = { x: number; y: number; z: number };
const scaleP = (p: P3, k: number): P3 => ({ x: p.x * k, y: p.y * k, z: p.z * k });
const FOUNTAIN_SPOTS = (() => {
  const s = makeFountain().userData.spots;
  const k = FOUNTAIN_SCALE;
  return { cups: s.cups.map((p) => scaleP(p, k)), nozzles: s.nozzles.map((p) => scaleP(p, k)), buttons: s.buttons.map((p) => scaleP(p, k)) };
})();
/** Cups on the counter and in the hand, against cup units. */
const CUP_AT_TAP = SCALE.cup;
export const CUP_IN_HAND = SCALE.cup;
/** A cup takes this much room on the counter (it can't stand closer than this to another). */
const CUP_ROOM = 0.72;

/** Dollars of soda lost per second of overflow. */
const SPILL_COST = 1.5;

export interface GrillItem {
  piece: Piece;
  obj: FoodObject;
  x: number;
  z: number;
  flipT: number; // -1 when not flipping
  squash: number;
  squashV: number;
  smoke: number;
  held: boolean;
  /** A cheese slice melting on top of a patty. */
  topping: { piece: Piece; obj: FoodObject } | null;
  /** The item this one is stacked on (only the bottom of a stack touches the grill and cooks). */
  below: GrillItem | null;
}

/** Egg stuck to the grille: rub it off before anything else goes there. */
export interface Mess {
  x: number;
  z: number;
  /** 1 fresh, 0 clean. */
  amount: number;
  obj: THREE.Object3D;
}

export interface Basket {
  loaded: boolean;
  /** What's in this basket (a basket holds one kind at a time). */
  fry: FryKind;
  /** A tostada shell frying in this basket in place of fries (Red Rock), or null. */
  shell: Piece | null;
  shellObj: FoodObject | null;
  cook: number;
  down: boolean;
  goldenRung: boolean;
  /** Seconds to the next beep while the basket sits in the oil at perfect or past it. */
  beepT: number;
  obj: THREE.Group;
  fries: FriesObject;
  /** 0 hanging on the rail, 1 down in the oil. */
  t: number;
  /** Share of a full batch still in the basket. */
  amount: number;
  /** Seconds the fries have hung out of the oil (they go soggy; FRIES_HOLD in scoring.ts). Back in the oil resets it. */
  held: number;
  /** Where the basket hangs on the rail (tilted to drain), and where it sits in the oil. */
  up: THREE.Vector3;
  downAt: THREE.Vector3;
  tilt: number;
}

/** A stack of empty cups or fries cartons. It never runs out. */
export interface Stack {
  kind: "cup" | "carton";
  size: Size;
  obj: THREE.Group;
  x: number;
  z: number;
}

/** A spot at the front of the fryer where a carton waits to be filled. */
export interface Pack {
  size: FriesSize | null;
  /** What's in this carton: plain or sweet potato fries, chips or churros. */
  fry: FryKind;
  cook: number;
  fill: number;
  /** Salt shaken on so far (SALT in cooking.ts). */
  salt: number;
  /** Seconds the fries in it have been out of the oil. */
  held: number;
  curds: boolean;
  gravy: boolean;
  obj: THREE.Object3D | null;
  x: number;
  z: number;
  /** Height of the pad's top. */
  y: number;
}

/** A cup standing on the drinks counter: anywhere on it, or under a nozzle (`tap`). */
export interface DrinkCup {
  obj: CupObject;
  size: Size;
  /** Set by the first pour; null while it's empty. */
  flavor: DrinkId | null;
  fill: number;
  ice: boolean;
  lid: boolean;
  /** World position on the counter. */
  x: number;
  z: number;
  /** The nozzle it stands under, or -1. */
  tap: number;
}

export interface Tap {
  flavor: DrinkId;
  pouring: boolean;
  stream: THREE.Mesh;
  spill: number;
  /** Soda on the drip tray from an overflow, 0..1. Has to be wiped before the next cup. */
  puddle: number;
  puddleObj: THREE.Mesh;
  x: number;
  /** The cup under this nozzle, if any. */
  cup: DrinkCup | null;
}

export type Hit =
  | { type: "bin"; kind: Kind }
  | { type: "garnish" }
  | { type: "grillItem"; item: GrillItem }
  | { type: "mess"; idx: number }
  | { type: "bottle"; sauce: SauceKind }
  | { type: "friesBin" }
  | { type: "basket"; idx: number }
  | { type: "tap"; idx: number }
  | { type: "cup"; idx: number }
  | { type: "spill"; idx: number }
  | { type: "ice" }
  | { type: "lids"; size: Size }
  | { type: "zone"; idx: number }
  | { type: "stack"; idx: number }
  | { type: "pack"; idx: number }
  | { type: "shaker"; sugar?: boolean }
  | { type: "curds" }
  | { type: "gravy" }
  | { type: "fryBin"; fry: FryKind }
  | { type: "tpress" }
  | { type: "bay"; idx: number }
  | { type: "handle"; idx: number }
  | { type: "board" }
  | { type: "dough" }
  | { type: "pot" }
  | { type: "peel" }
  | { type: "bench" }
  | { type: "spot"; idx: number }
  | { type: "batter" }
  | { type: "rack" }
  | { type: "knife" };

/** Something a pie sits on: the peel, a spot in the oven, the bench or the board. */
export interface PieHolder {
  layers: Layer[];
  food: THREE.Group | null;
  foodKey: string;
}
/** A pie holder with a fixed place on the counter (page-local centre). */
export interface PiePlace extends PieHolder {
  x: number;
  z: number;
}
/** Where the peel can put a pie down, or take one from. */
export type PeelTarget = { kind: "spot"; idx: number } | { kind: "rest" } | { kind: "trash" };
/** One spot on the oven's deck: page-local centre, and how fast a nudged pie is still spinning (rad/s). */
export interface OvenSpot extends PiePlace {
  spin: number;
  /** How hard the blade's tip is pushing a pie that hasn't given yet, and for how long (s) it's been against it (static friction, see `grip`). */
  strain: number;
  touch: number;
  /** How far the pie is lifted (riding up on the peel's blade, 0..1). */
  lift: number;
  marker: THREE.Object3D;
  /** The fire side has run too far ahead (so the warning only sounds once per run). */
  warned?: boolean;
}

/** One clamshell bay of the panini press and what's in it (a lone protein or bread, or a built sandwich). */
export interface PressBay {
  obj: PressBayObject;
  /** Page-local centre of the bay. */
  x: number;
  z: number;
  layers: Layer[];
  /** The food drawn in the bay. */
  food: THREE.Group | null;
  foodKey: string;
  closed: boolean;
  /** Lid opening, 1 open .. 0 shut (animated toward `closed`). */
  open: number;
  handleProxy: THREE.Mesh;
  /** Seconds since the lid last moved, for its thunk. */
  moved: number;
  /** Seconds left of a refused close (the lid dips and bounces back up), 0 when still. */
  shake?: number;
  /** What the lamp and the ooze show now (so materials only change when they need to). */
  lit?: boolean;
  oozing?: boolean;
}

export interface CounterEvents {
  golden: () => void;
  /** The fryer's timer beeps while a basket is at perfect (or past it) until it's lifted. */
  beep: () => void;
  spill: () => void;
  burning: () => void;
  /** Something cooking just reached its done zone (the Kitchen timer bonus ticks). */
  /** Something on counter `page` (1 the middle, 2 the fryer) just reached done. */
  done: (page: number) => void;
  /** The peel is nudging a pie round (for a soft scrape, at most every so often). */
  nudge: () => void;
}

/**
 * Cook speed per kind against GRILL_RATE, on the face down. Patties, bacon and eggs also cook a
 * little on the face up (UP_HEAT), through the meat. Patties, bacon and eggs take about as long
 * as fries: put them on, go do something else, come back. On a hot zone, without flipping:
 * patty medium from about 21 s to 33 s; bacon crisp from 18 s, dark from 38 s; egg set from
 * 18 s, overdone from 44 s. Buns toast in about 10 s.
 */
const COOK_SPEED: Record<string, number> = { patty: 0.377, bacon: 0.41, egg: 0.18, bun: 0.45, pineapple: 0.4, ...COMAL_SPEED };

/** Nozzle spacing on the soda fountain. */
export const TAP_GAP = FOUNTAIN_SPOTS.cups[1].x - FOUNTAIN_SPOTS.cups[0].x;
const tapX = (i: number) => pageX(0) + FOUNTAIN.x + FOUNTAIN_SPOTS.cups[i].x;
/** Cups sit on the drip tray under the nozzles; the pour falls from the spout tip. */
const CUP_Z = FOUNTAIN.z + FOUNTAIN_SPOTS.cups[0].z;
const CUP_Y = FOUNTAIN_SPOTS.cups[0].y;
const STREAM_Z = FOUNTAIN.z + FOUNTAIN_SPOTS.nozzles[0].z;
const STREAM_TOP = FOUNTAIN_SPOTS.nozzles[0].y;
/** How high something carried hovers over the counter. */
const HELD_LIFT = 0.9;
/** Overflow puddles grow to this many times their old size. */
const PUDDLE_GROW = 2;

/**
 * A sauce bottle's touch box: as wide as the gap between bottles (they're thin, and fingers
 * aren't), a bit deeper and taller than the bottle, so any press on the caddy finds one.
 */
function bottleBox(caddy: THREE.Object3D): THREE.BoxGeometry {
  const xs = Object.values(caddy.userData.spots.bottles as Record<string, { x: number }>).map((b) => b.x).sort((a, b) => a - b);
  let pitch = Infinity;
  for (let i = 1; i < xs.length; i++) pitch = Math.min(pitch, xs[i] - xs[i - 1]);
  const w = Number.isFinite(pitch) ? Math.max(0.55, pitch * 0.98) : 0.8;
  return new THREE.BoxGeometry(w, 1.9, 1.15);
}

export class CounterView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 0.9, 0.1, 80);
  page = HOME_PAGE;
  /** Which camera stop (see STOPS) the counter band is at. */
  stop = HOME_PAGE;
  /** Camera x offset while the player drags between counters. */
  dragOffset = 0;
  private camX = 0;
  private raycaster = new THREE.Raycaster();
  private hitMeshes: THREE.Mesh[] = [];
  private pantry: THREE.Group | null = null;
  bins: { kind: Kind; x: number; z: number; y: number }[] = [];
  /** Upgrade multipliers. */
  fryBoost = 1;
  /** The searing plate bonus: everything on the grill cooks faster. */
  grillBoost = 1;
  /** Tostadas are on the menu: a pan of corn tortillas stands on the fryer counter too (set before setPantry). */
  fryerCorn = false;
  /** The oven's pace (sear and the cook time, set by main). */
  ovenBoost = 1;
  /** Warm holding's pace (0.5 with the heat lamp): the warm end, the taco rack, lifted fries and cartons. */
  holdRate = 1;
  autoStopPour = false;
  /** The Smart fountain bonus (after build #78): a pour it stops at the line also gets its lid. */
  autoLid = false;
  /** Relaxed (after build #82): cooking past over-done runs at this share of its pace (1 = normal). */
  burnPace = 1;
  grillItems: GrillItem[] = [];
  /** Each grill zone's setting, left to right; the buttons on the griddle's front ledge cycle them. */
  zones: ZoneHeat[] = [...ZONE_START];
  private zonesShown: string = "";
  /** Seconds since each zone's button was pushed, for its press-in animation. */
  private zonePush = [9, 9, 9];
  private griddle!: GriddleObject;
  private caddy!: SauceCaddyObject;
  private light: KitchenLight;
  baskets: Basket[] = [];
  /** Where to grab frozen fries from (the middle of the potato freezer), in world units. */
  friesBinAt = new THREE.Vector3();
  /** ...and the other things to fry (their trays), where a town has them. */
  fryBinAt: Partial<Record<FryKind, THREE.Vector3>> = {};
  taps: Tap[] = [];
  private fountain: FountainObject | null = null;
  /** Cups standing on the drinks counter. */
  cups: DrinkCup[] = [];
  stacks: Stack[] = [];
  packs: Pack[] = [];
  /** Running cost of soda poured onto the drip tray this shift. */
  spillCost = 0;
  /** The bottles standing in the caddies (hidden while one is in hand): ketchup and mustard at the grill, pesto and aioli at the press. */
  bottles: Partial<Record<SauceKind, THREE.Object3D>> = {};
  /** Which middle counter is out: the grill (the Pines) or the panini press (the Sunny Coast). */
  middle: MiddleCounter = "grill";
  private grillGroup = new THREE.Group();
  private pressGroup = new THREE.Group();
  private pressCaddy!: SauceCaddyObject;
  /** The press's clamshell bays (MAX_BAYS built; `bayCount` of them out). */
  bays: PressBay[] = [];
  bayCount = 2;
  /** The cutting board (Harbor City), and the sandwich on it. */
  board: { obj: THREE.Object3D; x: number; z: number; layers: Layer[]; food: THREE.Group | null; foodKey: string; on: boolean } | null = null;
  private fryTrays: Partial<Record<FryKind, THREE.Object3D>> = {};
  private freezer!: THREE.Object3D;
  private jalTray!: THREE.Object3D;
  private quesoWell!: THREE.Object3D;
  sugarShaker!: THREE.Object3D;
  /** Red Rock's fryer kit (chips, nachos, churros) is out. */
  redRock = false;
  private comalGroup = new THREE.Group();
  private comalCaddy: SauceCaddyObject | null = null;
  /**
   * The taco rack standing on the comal's warm end (after build #73): warm tortillas go in it and
   * tacos are filled there, where nothing cools or cooks on; then the whole rack goes up to a tray.
   * Its layers are a tray's taco layers (tortillas, then fillings in the order they went in).
   */
  rack: { layers: Layer[]; food: THREE.Group | null; foodKey: string; x: number; z: number } = { layers: [], food: null, foodKey: "", x: 0, z: 0 };
  private rackObj = new THREE.Group();
  /** The tortilla press (Sun Valley), how far its lever is down (0..1), and whether it's out. */
  tpress!: TortillaPressObject;
  tpressT = 0;
  tpressOn = false;
  private ovenGroup = new THREE.Group();
  private oven!: HearthOvenObject;
  private ovenCaddy: SauceCaddyObject | null = null;
  /** The pie on the peel, and the deck's spots (MAX_OVEN built; `ovenCount` of them out). */
  peel: PieHolder = { layers: [], food: null, foodKey: "" };
  ovenSpots: OvenSpot[] = [];
  ovenCount = 2;
  /** The marble bench, where a pie can be set down (Port Amber's board stands in for it). */
  bench: PiePlace = { x: BENCH_AT.x, z: BENCH_AT.z, layers: [], food: null, foodKey: "" };
  private benchObj!: THREE.Object3D;
  /** The peel's blade centre (page-local) and height; whether it's in hand, and where the finger holds it. */
  peelAt = { x: PEEL_HOME.x, z: PEEL_HOME.z, y: 0 };
  peelHeld = false;
  private peelObj!: THREE.Object3D;
  private peelProxy!: THREE.Mesh;
  private peelGrab = { dx: 0, dz: 0 };
  private peelNdc: THREE.Vector2 | null = null;
  private peelLast: XZ | null = null;
  private nudgeSound = 0;
  private boardProxy: THREE.Mesh | null = null;
  batterBowl!: THREE.Object3D;
  /** Zucchini sitting battered in the bowl (a share of a basket, 0 when empty), and its drawing. */
  batter = 0;
  private batterFood: FriesObject | null = null;
  /** Orchard Isle's fryer kit (zucchini fritti, apple fritters) is out. */
  orchard = false;
  private curdTray!: THREE.Object3D;
  private gravyWell!: THREE.Object3D;
  private puffs: THREE.Sprite[] = [];
  /** Grease spits: tiny bright dots that pop off meat on a hot zone (the sizzle you can see). */
  private spits: THREE.Sprite[] = [];
  /** A four-point star that pops over food the moment it reaches perfect (review #78, P3-5). */
  private sparkles: THREE.Sprite[] = [];
  /** Little rings that open and fade on idle fryer oil, so the oil looks hot before a basket goes in. */
  private oilRings: THREE.Mesh[] = [];
  private held: THREE.Object3D | null = null;
  private time = 0;
  events: CounterEvents = { golden: () => {}, beep: () => {}, spill: () => {}, burning: () => {}, done: (_page: number) => {}, nudge: () => {} };
  /** The shadow-casting light, so the graphics setting can soften or disable it. */
  sun: THREE.DirectionalLight;

  constructor() {
    this.scene.background = KITCHEN_BG.clone();
    this.light = applyKitchenLight(this.scene, { shadowBox: { left: -9, right: 9, top: 7, bottom: -7 } });
    this.sun = this.light.sun;

    // The window line's counter top. Its front edge runs just past the trash chute; below it the
    // counter's steel front drops away, catching less light toward the floor.
    const counter = counterTop(90, COUNTER_FRONT + 6.0, CABIN.counter.color, CABIN.counter.streaks);
    counter.position.set(7, 0, (COUNTER_FRONT - 6.0) / 2);
    this.scene.add(counter);
    // The camera hangs almost over the counter's front, so a truly vertical front would be edge on.
    // It's drawn leaning out toward the camera instead, so it fills the bottom of the view as the
    // counter's front panel would to someone standing at it.
    const front = new THREE.Mesh(new THREE.PlaneGeometry(90, 4), brushedSteel(mixHex(CABIN.counter.color, "#5f6867", 0.72), { n: 500, seed: 4 }));
    front.rotation.x = -0.75;
    front.position.set(7, -0.3 - 2 * Math.cos(0.75), COUNTER_FRONT + 2 * Math.sin(0.75));
    front.receiveShadow = true;
    // The counter's rolled front edge, bright where it catches the light.
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 90, 10), toon("#eef2f1"));
    nose.rotation.z = Math.PI / 2;
    nose.position.set(7, -0.08, COUNTER_FRONT);
    this.scene.add(front, nose);
    // The truck's painted inside wall: only a strip of it shows above the counter (see cropFor).
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 6, 0.06), toon(CABIN.wall));
    wall.position.set(7, 2.6, -3.43);
    this.scene.add(wall);
    this.wall = wall;
    // The pass shelf above (out of view) shades the strip of wall under it and the back of the
    // counter: a soft gradient, darkest at the top of the view.
    {
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 64;
      const x = c.getContext("2d")!;
      const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, `rgba(30,25,35,${CABIN.shadow})`);
      g.addColorStop(1, "rgba(30,25,35,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 64);
      const t = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
      const onWall = new THREE.Mesh(new THREE.PlaneGeometry(90, CABIN.splash + 0.2), mat);
      onWall.position.set(7, (CABIN.splash + 0.2) / 2, -3.38);
      const onTop = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.6), mat.clone());
      (onTop.material as THREE.MeshBasicMaterial).opacity = 0.45;
      onTop.rotation.x = -Math.PI / 2;
      onTop.position.set(7, 0.005, -3.4 + 0.3);
      this.scene.add(onWall, onTop);
    }
    // A small rolled steel cove where the counter meets the wall.
    const cove = new THREE.Mesh(new THREE.BoxGeometry(90, 0.12, 0.14), toon(CABIN.counter.color));
    cove.position.set(7, 0.06, -3.33);
    this.scene.add(cove);

    this.scene.add(this.grillGroup, this.pressGroup, this.comalGroup, this.ovenGroup);
    this.pressGroup.visible = false;
    this.comalGroup.visible = false;
    this.ovenGroup.visible = false;
    this.buildGrill();
    this.buildPress();
    this.buildComal();
    this.buildOven();
    this.buildFryer();
    this.buildDrinks();
    this.buildTrash();
  }

  /** An invisible hit box. With an `owner`, it only counts while that object (and everything it sits in) is shown. */
  private proxy(geo: THREE.BufferGeometry, pos: THREE.Vector3, hit: Hit, owner?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(pos);
    m.userData.hit = hit;
    if (owner) m.userData.owner = owner;
    this.scene.add(m);
    this.hitMeshes.push(m);
    return m;
  }

  private buildGrill(): void {
    const at = (x: number, y: number, z: number) => this.world(1, x, y, z);
    const G = this.grillGroup;
    const griddle = makeGriddle();
    griddle.position.copy(at(GRIDDLE.x, 0, GRIDDLE.z));
    G.add(griddle);
    this.griddle = griddle;
    // A push button per zone on the front ledge: tap to cycle off, warm, hot.
    griddle.userData.spots.buttons.forEach((b, i) => {
      this.proxy(new THREE.BoxGeometry(1.05, 0.5, 0.75), griddle.position.clone().add(new THREE.Vector3(b.x, b.y - 0.1, b.z)), { type: "zone", idx: i }, G);
    });

    // The sauce caddy in the front left corner, bottles upside down and ready to lift.
    const caddy = makeSauceCaddy();
    caddy.position.copy(at(CADDY.x, 0, CADDY.z));
    G.add(caddy);
    this.caddy = caddy;
    Object.assign(this.bottles, caddy.userData.bottles);
    for (const k of ["ketchup", "mustard"] as SauceKind[]) {
      const b = caddy.userData.spots.bottles[k]!;
      this.proxy(bottleBox(caddy), caddy.position.clone().add(new THREE.Vector3(b.x, 0.8, b.z)), { type: "bottle", sauce: k }, G);
    }

    // Smoke and steam: soft camera-facing puffs (a flat core with a soft edge), and grease spits.
    const puffTex = softDot();
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: "#fff6e8", transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.userData = { t: Math.random(), item: -1 };
      this.scene.add(m);
      this.puffs.push(m);
    }
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: "#fff1c4", transparent: true, depthWrite: false }));
      m.visible = false;
      m.userData = { life: 0, v: new THREE.Vector3() };
      m.scale.setScalar(0.07);
      this.scene.add(m);
      this.spits.push(m);
    }
    const star = starTex();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, color: "#fff6d0", transparent: true, depthWrite: false, depthTest: false }));
      m.visible = false;
      m.renderOrder = 6;
      m.userData = { life: 0 };
      this.scene.add(m);
      this.sparkles.push(m);
    }
  }

  /** Pop the perfect-star over a point (scene coordinates). */
  private sparkle(at: THREE.Vector3): void {
    const m = this.sparkles.find((s) => s.userData.life <= 0) ?? this.sparkles[0];
    m.userData.life = 0.3;
    m.position.copy(at);
    m.position.y += 0.45;
    m.visible = true;
  }

  /** The panini press page (the Sunny Coast): see PRESS. Built once, shown in place of the grill. */
  private buildPress(): void {
    const P = this.pressGroup;
    const at = (x: number, y: number, z: number) => this.world(1, x, y, z);
    for (let i = 0; i < MAX_BAYS; i++) {
      const obj = makePressBay();
      P.add(obj);
      const bay: PressBay = { obj, x: 0, z: PRESS.z, layers: [], food: null, foodKey: "", closed: false, open: 1, handleProxy: null!, moved: 9 };
      // The bay's plate (drop food in, lift it out), and the handle wherever the lid has it.
      this.proxy(new THREE.BoxGeometry(BAY.w - 0.1, 0.9, PLATE.d + 0.15), new THREE.Vector3(), { type: "bay", idx: i }, obj);
      bay.handleProxy = this.proxy(new THREE.BoxGeometry(BAY.w - 0.1, 0.55, 0.6), new THREE.Vector3(), { type: "handle", idx: i }, obj);
      this.bays.push(bay);
    }
    this.layoutBays();
    const caddy = makeSauceCaddy(["pesto", "aioli"]);
    caddy.position.copy(at(PRESS_CADDY.x, 0, PRESS_CADDY.z));
    P.add(caddy);
    this.pressCaddy = caddy;
    Object.assign(this.bottles, caddy.userData.bottles);
    for (const k of ["pesto", "aioli"] as SauceKind[]) {
      const b = caddy.userData.spots.bottles[k]!;
      this.proxy(bottleBox(caddy), caddy.position.clone().add(new THREE.Vector3(b.x, 0.8, b.z)), { type: "bottle", sauce: k }, P);
    }
    const board = makeCuttingBoard();
    board.position.copy(at(PRESS_BOARD.x, 0, PRESS_BOARD.z));
    P.add(board);
    this.board = { obj: board, x: PRESS_BOARD.x, z: PRESS_BOARD.z, layers: [], food: null, foodKey: "", on: false };
    this.boardProxy = this.proxy(new THREE.BoxGeometry(BOARD.w, 0.7, BOARD.d), at(PRESS_BOARD.x, 0.3, PRESS_BOARD.z), { type: "board" }, board);
    // The knife: its own object, so it can be picked up (DESIGN §31). Its hit box stands taller than
    // the board's so a press on it is the knife's.
    const knife = makeKnife();
    knife.scale.setScalar(0.9);
    P.add(knife);
    this.knifeObj = knife;
    this.knifeProxy = this.proxy(new THREE.BoxGeometry(0.62, 1.0, 1.3), at(PRESS_BOARD.x, 0.4, PRESS_BOARD.z), { type: "knife" }, knife);
  }

  /** The board's knife, and its hit box (DESIGN §31). */
  knifeObj: THREE.Group | null = null;
  private knifeProxy: THREE.Mesh | null = null;
  /** Where the knife rests, world space. */
  private knifeRest = new THREE.Vector3();
  private knifeState: "rest" | "lifted" | "away" = "rest";
  private knifeLift = 0;
  /** Lay the knife on the board, lift it up (tapped: waiting for a tap on the food), or take it away (in hand). */
  setKnife(state: "rest" | "lifted" | "away"): void {
    this.knifeState = state;
    if (this.knifeObj) this.knifeObj.visible = state !== "away" && !!this.board?.on;
  }
  /** Where the knife lies, world space (the playtest bot and hints). */
  knifePoint(): THREE.Vector3 {
    return this.knifeRest.clone().setY(this.knifeRest.y + 0.05);
  }
  private placeKnife(dt: number): void {
    const k = this.knifeObj;
    if (!k || !k.visible) return;
    this.knifeLift += ((this.knifeState === "lifted" ? 1 : 0) - this.knifeLift) * Math.min(1, dt * 14);
    const t = this.knifeLift;
    k.position.copy(this.knifeRest).add(new THREE.Vector3(0, 0.55 * t + 0.04 * Math.sin(performance.now() / 160) * t, 0));
    k.rotation.set(0.25 * t, 0, -0.35 * t);
  }

  /** The oven page (Orchard Isle): see OVEN_Z. Built once, shown in place of the grill. */
  private buildOven(): void {
    const O = this.ovenGroup;
    const at = (x: number, y: number, z: number) => this.world(1, x, y, z);
    const oven = makeHearthOven();
    oven.position.copy(at(0, 0, 0));
    O.add(oven);
    this.oven = oven;
    for (let i = 0; i < MAX_OVEN; i++) {
      const marker = new THREE.Object3D();
      O.add(marker);
      const s: OvenSpot = { x: 0, z: OVEN_Z, spin: 0, strain: 0, touch: 0, lift: 0, marker, layers: [], food: null, foodKey: "" };
      this.proxy(new THREE.BoxGeometry(PIE.rx * 2 * GRILL_SCALE + 0.1, 0.8, PIE.rz * 2 * GRILL_SCALE + 0.3), new THREE.Vector3(), { type: "spot", idx: i }, marker);
      this.ovenSpots.push(s);
    }
    this.layoutOven();
    const dough = makeDoughStack();
    dough.position.copy(at(DOUGH_AT.x, 0, DOUGH_AT.z));
    O.add(dough);
    this.proxy(new THREE.BoxGeometry(DOUGH.w, 0.8, DOUGH.d), at(DOUGH_AT.x, 0.3, DOUGH_AT.z), { type: "dough" }, O);
    const bench = makeBench();
    bench.position.copy(at(BENCH_AT.x, 0, BENCH_AT.z));
    O.add(bench);
    this.benchObj = bench;
    this.proxy(new THREE.BoxGeometry(BENCH.w, 0.7, BENCH.d), at(BENCH_AT.x, 0.3, BENCH_AT.z), { type: "bench" }, bench);
    const pot = makeSaucePot();
    pot.position.copy(at(POT_AT.x, 0, POT_AT.z));
    O.add(pot);
    this.proxy(new THREE.BoxGeometry(POT.r * 2 + 0.4, 1.2, POT.r * 2 + 0.4), at(POT_AT.x, 0.5, POT_AT.z), { type: "pot" }, pot);
    const peel = makePeel();
    O.add(peel);
    this.peelObj = peel;
    // The whole peel takes a press, the handle most generously: it's what the finger holds.
    const len = PEEL.rz * 2 + PEEL_REACH - PEEL.rz + 0.5;
    this.peelProxy = this.proxy(new THREE.BoxGeometry(PEEL.rx * 2 + 0.1, 0.7, len), new THREE.Vector3(), { type: "peel" }, O);
    this.placePeel();
  }

  /** Draw the peel (and the pie on it) where it is now. */
  private placePeel(): void {
    const { x, y, z } = this.peelAt;
    this.peelObj.position.copy(this.world(1, x, y, z));
    const len = PEEL.rz * 2 + PEEL_REACH - PEEL.rz + 0.5;
    this.peelProxy.position.copy(this.world(1, x, y + 0.25, z - PEEL.rz + len / 2));
    const f = this.peel.food;
    if (f) {
      f.position.copy(this.world(1, x, y + PEEL.y + 0.005, z));
      f.visible = this.peelObj.visible;
    }
  }

  /** Spread the oven spots that are out across the deck, and hide the rest. */
  private layoutOven(): void {
    const xs = OVEN_XS[this.ovenCount] ?? OVEN_XS[2];
    this.ovenSpots.forEach((s, i) => {
      s.marker.visible = i < this.ovenCount;
      s.x = xs[i] ?? xs[0];
      const m = this.hitMeshes.find((h) => (h.userData.hit as Hit).type === "spot" && (h.userData.hit as { idx: number }).idx === i);
      m?.position.copy(this.world(1, s.x, HEARTH.y + 0.25, s.z));
    });
  }

  /** The oven's caddy: olive oil and honey, where the town's menu uses them. */
  private setOvenCaddy(sauces: SauceKind[]): void {
    if (this.ovenCaddy) {
      for (const k of this.ovenCaddy.userData.kinds) delete this.bottles[k];
      const old = this.ovenCaddy;
      this.ovenGroup.remove(old);
      disposeObject(old);
      this.ovenCaddy = null;
      this.hitMeshes = this.hitMeshes.filter((m) => {
        const keep = m.userData.owner !== old;
        if (!keep) this.scene.remove(m);
        return keep;
      });
    }
    if (!sauces.length) return;
    const caddy = makeSauceCaddy(sauces.slice(0, 2));
    caddy.position.copy(this.world(1, OVEN_CADDY.x, 0, OVEN_CADDY.z));
    this.ovenGroup.add(caddy);
    this.ovenCaddy = caddy;
    Object.assign(this.bottles, caddy.userData.bottles);
    for (const k of caddy.userData.kinds) {
      const b = caddy.userData.spots.bottles[k]!;
      this.proxy(bottleBox(caddy), caddy.position.clone().add(new THREE.Vector3(b.x, 0.8, b.z)), { type: "bottle", sauce: k }, caddy);
    }
  }

  /** Put a pie on the peel (or clear it). */
  setPeel(layers: Layer[]): void {
    this.peel.layers = layers;
    const { x, y, z } = this.peelAt;
    this.syncFood(this.peel, this.world(1, x, y + PEEL.y + 0.005, z));
    this.placePeel();
  }
  /** Put a pie in an oven spot (or empty it). */
  setSpot(i: number, layers: Layer[]): void {
    const s = this.ovenSpots[i];
    s.layers = layers;
    s.spin = 0;
    s.strain = 0;
    s.touch = 0;
    s.warned = false;
    this.syncFood(s, this.world(1, s.x, HEARTH.y, s.z));
  }
  /** Where a pie can be set down on the counter: the bench, or Port Amber's board in its place. */
  get rest(): PiePlace {
    return this.board?.on && this.middle === "oven" ? this.board : this.bench;
  }
  /** Put a pie on the bench or board (or clear it). */
  setRest(layers: Layer[]): void {
    if (this.rest === this.board) return this.setBoard(layers);
    this.bench.layers = layers;
    this.syncFood(this.bench, this.world(1, this.bench.x, BENCH.h, this.bench.z));
  }
  /** Top of the bench or board (page-local height). */
  private get restTop(): number {
    return this.rest === this.board ? BOARD.h : BENCH.h;
  }

  /* ---- the peel ---- */

  /** The peel lies at home (or is sliding back there), not in hand: a pie on it is on the build spot. */
  get peelHome(): boolean {
    return !this.peelHeld;
  }
  /** Take the peel in hand at the finger (grabbing wherever it was pressed; the handle, usually). */
  grabPeel(ndc: THREE.Vector2): void {
    const g = this.groundPoint(ndc, this.peelAt.y + PEEL.y);
    this.peelGrab = { dx: this.peelAt.x - (g.x - pageX(1)), dz: this.peelAt.z - g.z };
    this.peelHeld = true;
    this.peelNdc = ndc.clone();
    this.peelLast = null;
    this.peelGrabHome = null;
  }
  /** Move the peel with the finger (null: the finger is up over the trays, so it's out of view). */
  movePeel(ndc: THREE.Vector2 | null): void {
    this.peelNdc = ndc ? ndc.clone() : null;
    if (ndc) this.followFinger();
  }
  /**
   * A swipe up or down scoops or drops right where the peel was when the swipe began, so the
   * swipe itself doesn't carry it along: the blade goes back there, and the finger's hold on it
   * eases back to where it grabbed over the next moment.
   */
  anchorPeel(from: THREE.Vector2, now: THREE.Vector2): void {
    const a = this.groundPoint(from, this.peelAt.y + PEEL.y);
    const b = this.groundPoint(now, this.peelAt.y + PEEL.y);
    this.peelGrabHome ??= { ...this.peelGrab };
    this.peelGrab.dx += a.x - b.x;
    this.peelGrab.dz += a.z - b.z;
    this.followFinger();
    this.peelLast = null;
  }
  private peelGrabHome: { dx: number; dz: number } | null = null;
  /** Let go of the peel: it goes back to lie at home with whatever is on it. */
  releasePeel(): void {
    this.peelHeld = false;
    this.peelNdc = null;
    this.peelLast = null;
  }
  /** The peel's blade, page-local, while it's held over the counter (null when it's away over the trays). */
  peelBlade(): XZ | null {
    return this.peelHeld && !this.peelNdc ? null : { x: this.peelAt.x, z: this.peelAt.z };
  }
  /** Height of whatever is under the blade's centre: the deck, the bench, or a hover over the counter. */
  private surfaceUnder(x: number, z: number): number {
    // Once the blade's far half is over the deck, it rides on the deck (the tip reaches in to nudge).
    if (z - PEEL.rz * 0.5 < HEARTH.z1 && x > HEARTH.x0 - 0.3 && x < HEARTH.x1 + 0.3) return HEARTH.y + 0.004;
    const r = this.rest;
    if (Math.abs(x - r.x) < BENCH.w / 2 + 0.3 && Math.abs(z - r.z) < BENCH.d / 2 + 0.3) return this.restTop + 0.004;
    return PEEL_HOVER;
  }
  /** Where the blade would be with the finger at `ndc`, at the height it's riding at, kept out of the oven's walls. */
  bladeAt(ndc: THREE.Vector2): XZ {
    const g = this.groundPoint(ndc, this.peelAt.y + PEEL.y);
    let x = g.x - pageX(1) + this.peelGrab.dx;
    let z = g.z + this.peelGrab.dz;
    // Inside the mouth, the walls keep the blade on the deck.
    if (z - PEEL.rz < DECK.z1 - 0.1 && x > HEARTH.x0 - PEEL.rx && x < HEARTH.x1 + PEEL.rx) {
      x = THREE.MathUtils.clamp(x, DECK.x0 + PEEL.rx - 0.05, DECK.x1 - PEEL.rx + 0.05);
      z = Math.max(z, DECK.z0 + 0.24 + PEEL.rz);
    }
    return { x, z };
  }
  /** Put the blade under the finger. */
  private followFinger(): void {
    if (!this.peelNdc) return;
    const b = this.bladeAt(this.peelNdc);
    this.peelAt.x = b.x;
    this.peelAt.z = b.z;
  }
  /** What the blade (where it is, or at `b`) is over: an oven spot, the bench/board, the trash chute, or nothing. */
  peelTarget(b: XZ | null = this.peelBlade()): PeelTarget | null {
    if (!b || this.middle !== "oven") return null;
    for (let i = 0; i < this.ovenCount; i++) if (underPie(b, this.ovenSpots[i], PEEL)) return { kind: "spot", idx: i };
    if (underPie(b, this.rest, { rx: PEEL.rx + 0.15, rz: PEEL.rz + 0.15 })) return { kind: "rest" };
    // The handle end over the chute (the blade itself never reaches it).
    if (this.overTrash(this.world(1, b.x, 0, b.z + PEEL_REACH - 0.3))) return { kind: "trash" };
    return null;
  }
  /** The free oven spot nearest the blade (where it is, or at `b`), if it's over the deck at all (forgiving drops). */
  nearFreeSpot(b: XZ | null = this.peelBlade()): number {
    // Over the deck, and near the row of pies (not on the way out of the mouth).
    if (!b || b.z - PEEL.rz > DECK.z1 + 0.3 || b.z > OVEN_Z + 1.0) return -1;
    let best = -1;
    let bestD = PEEL.rx + 0.4;
    for (let i = 0; i < this.ovenCount; i++) {
      const s = this.ovenSpots[i];
      const d = Math.abs(s.x - b.x);
      if (!s.layers.length && d < bestD) [best, bestD] = [i, d];
    }
    return best;
  }
  /**
   * The peel's blade under any part of a pie that sits on the deck or the bench lifts it onto the
   * blade (the blade slides under its edge), so a slow approach never shows the blade cutting
   * through the crust.
   */
  private peelOver(p: PiePlace): number {
    const d = p.layers[0]?.piece;
    if (!d || !this.peelBlade() || !this.peelObj.visible || this.peel.layers.length) return 0;
    if (Math.abs(this.peelAt.y - (p === this.rest ? this.restTop : HEARTH.y)) > 0.12) return 0;
    return bladeUnder(this.peelAt, p, pieYawOf(d), PEEL) ? 1 : 0;
  }
  /** The peel's frame: it follows the finger or slides home, eases to the height under it, and nudges pies it touches round. */
  private updatePeel(dt: number): void {
    const home = !this.peelHeld;
    if (home) {
      const k = 1 - Math.exp(-dt * 12);
      this.peelAt.x += (PEEL_HOME.x - this.peelAt.x) * k;
      this.peelAt.z += (PEEL_HOME.z - this.peelAt.z) * k;
      this.peelAt.y += (0 - this.peelAt.y) * k;
      if (Math.hypot(this.peelAt.x - PEEL_HOME.x, this.peelAt.z - PEEL_HOME.z) < 0.04) Object.assign(this.peelAt, { x: PEEL_HOME.x, z: PEEL_HOME.z });
      if (this.peelAt.y < 0.004) this.peelAt.y = 0;
    } else if (this.peelNdc) {
      const g0 = this.peelGrabHome;
      if (g0) {
        const k = 1 - Math.exp(-dt * 6);
        this.peelGrab.dx += (g0.dx - this.peelGrab.dx) * k;
        this.peelGrab.dz += (g0.dz - this.peelGrab.dz) * k;
        if (Math.hypot(g0.dx - this.peelGrab.dx, g0.dz - this.peelGrab.dz) < 0.02) this.peelGrabHome = null;
      }
      const want = this.surfaceUnder(this.peelAt.x, this.peelAt.z);
      this.peelAt.y += (want - this.peelAt.y) * (1 - Math.exp(-dt * 16));
      this.followFinger();
    }
    this.peelObj.visible = home || !!this.peelNdc;
    // Nudges: the blade's tip or corner pushed sideways against a pie on the deck spins it round,
    // once the push is firm enough to overcome the pie's grip on the deck.
    const b = this.peelBlade();
    const onDeck = this.peelHeld && b && this.peelAt.y > HEARTH.y - 0.2;
    const last = this.peelLast;
    for (let i = 0; i < this.ovenCount; i++) {
      const s = this.ovenSpots[i];
      const d = s.layers[0]?.piece;
      if (!d) continue;
      let dYaw = 0;
      const touching = !!(onDeck && b && atRim(b, s, pieYawOf(d), PEEL));
      s.touch = touching ? s.touch + dt : 0;
      const push = touching && b && last && dt > 0 ? nudgeSpin(b, { x: b.x - last.x, z: b.z - last.z }, s, pieYawOf(d), PEEL) : 0;
      if (push) {
        // In contact: the pie holds until it gives, then turns with the blade.
        [dYaw, s.strain] = grip(s.strain, push, s.touch);
        if (dYaw) s.spin = THREE.MathUtils.clamp(s.spin * 0.5 + (dYaw / Math.max(dt, 1 / 120)) * NUDGE.coast, -5, 5);
        this.nudgeSound += Math.abs(dYaw);
      } else {
        // Let go: the slack comes back out and what little spin it kept dies off on the deck.
        s.strain *= Math.exp(-dt * 12);
        dYaw = s.spin * dt;
        s.spin *= Math.exp(-dt * NUDGE.friction);
        if (Math.abs(s.spin) < 0.05) s.spin = 0;
      }
      if (dYaw) spinPie(d, dYaw);
    }
    if (this.nudgeSound > 0.35) {
      this.nudgeSound = 0;
      this.events.nudge();
    }
    this.peelLast = b && this.peelHeld ? { ...b } : null;
    this.placePeel();
  }

  /** A world point over a pie being built (on the peel at home, or on the bench or board), in the pie's unit oval, or null if it's off the pie. */
  buildPoint(world: THREE.Vector3, reach = 1.15, only?: PieHolder): { holder: PieHolder; x: number; z: number } | null {
    let places: [PieHolder, XZ][] = [];
    if (this.peelHome) places.push([this.peel, PEEL_HOME]);
    places.push([this.rest, this.rest]);
    if (only) places = places.filter(([h]) => h === only);
    let best: { holder: PieHolder; x: number; z: number } | null = null;
    let bestR = reach;
    for (const [h, c] of places) {
      const d = h.layers[0]?.piece;
      if (!d) continue;
      // Into the pie's own frame, however it's been turned.
      const yaw = pieYawOf(d);
      const wx = world.x - pageX(1) - c.x;
      const wz = world.z - c.z;
      const lx = wx * Math.cos(yaw) - wz * Math.sin(yaw);
      const lz = wx * Math.sin(yaw) + wz * Math.cos(yaw);
      const x = lx / (INNER_RX * GRILL_SCALE);
      const z = lz / (INNER_RZ * GRILL_SCALE);
      const r = Math.hypot(x, z);
      if (r < bestR) [best, bestR] = [{ holder: h, x, z }, r];
    }
    return best;
  }
  /** The peel at home or the bench/board under a world point (empty or not), for a base dropped there. */
  overBuild(world: THREE.Vector3): PieHolder | null {
    const x = world.x - pageX(1);
    if (this.peelHome && Math.abs(x - PEEL_HOME.x) < PEEL.rx + 0.1 && Math.abs(world.z - PEEL_HOME.z) < PEEL.rz + 0.2) return this.peel;
    const r = this.rest;
    if (Math.abs(x - r.x) < BENCH.w / 2 + 0.1 && Math.abs(world.z - r.z) < BENCH.d / 2 + 0.1) return r;
    return null;
  }
  /** World points, for hints, tags and the playtest bot. */
  peelPointWorld(): THREE.Vector3 {
    return this.world(1, this.peelAt.x, this.peelAt.y + PEEL.y, this.peelAt.z);
  }
  /** Where the middle of the peel's handle grip is (world), for the bot and hints. */
  peelHandleWorld(): THREE.Vector3 {
    return this.world(1, this.peelAt.x, this.peelAt.y + PEEL.y, this.peelAt.z + PEEL_REACH - 0.3);
  }
  restPoint(): THREE.Vector3 {
    return this.world(1, this.rest.x, this.restTop, this.rest.z);
  }
  spotPoint(i: number): THREE.Vector3 {
    const s = this.ovenSpots[i];
    return this.world(1, s.x, HEARTH.y, s.z);
  }
  /**
   * World point on the crust of the pie in oven spot i, over its palest segment (the side that
   * wants turning to the back wall), for the uneven-bake cue. Null if there's no pie.
   */
  paleEdgePoint(i: number): THREE.Vector3 | null {
    const s = this.ovenSpots[i];
    const d = s.layers[0]?.piece;
    if (!d || d.kind !== "dough") return null;
    const rim = rimOf(d);
    const k = rim.indexOf(Math.min(...rim));
    const a = rimAngle(k);
    const yaw = d.yaw ?? 0;
    const lx = PIE.rx * Math.cos(a) * 0.7;
    const lz = -PIE.rz * Math.sin(a) * 0.7;
    const x = (lx * Math.cos(yaw) + lz * Math.sin(yaw)) * GRILL_SCALE;
    const z = (-lx * Math.sin(yaw) + lz * Math.cos(yaw)) * GRILL_SCALE;
    return this.world(1, s.x + x, HEARTH.y + 0.1, s.z + z);
  }
  spotTagPoint(i: number): THREE.Vector3 {
    const s = this.ovenSpots[i];
    return this.world(1, s.x, HEARTH.y, s.z + PIE.rz * GRILL_SCALE + 0.12);
  }
  doughPoint(): THREE.Vector3 {
    return this.world(1, DOUGH_AT.x, 0.4, DOUGH_AT.z);
  }
  potPoint(): THREE.Vector3 {
    return this.world(1, POT_AT.x, 0.5, POT_AT.z);
  }
  batterPoint(): THREE.Vector3 {
    return this.world(2, BATTER_AT.x, 0.4, BATTER_AT.z);
  }
  /** Put this much zucchini in the batter bowl (0 empties it): it sits there battered until it's picked up. */
  setBatter(amount: number): void {
    this.batter = amount;
    if (this.batterFood) {
      this.batterBowl.remove(this.batterFood);
      disposeObject(this.batterFood);
      this.batterFood = null;
    }
    if (amount <= 0) return;
    const f = makeFries(false, "L", amount, { fry: "zucchini" });
    f.userData.setCook(0);
    // Sunk in the batter, so only their coated backs show over the rim.
    f.scale.setScalar(SCALE.fries * 0.62);
    f.position.y = BATTER.h - 0.16;
    this.batterBowl.add(f);
    this.batterFood = f;
  }
  /** True when a world point (fryer page) is over the batter bowl. */
  overBatter(world: THREE.Vector3): boolean {
    return this.orchard && Math.hypot(world.x - pageX(2) - BATTER_AT.x, world.z - BATTER_AT.z) < BATTER.r + 0.35;
  }

  /** The comal page (Red Rock): see COMAL. Built once, shown in place of the grill. */
  private buildComal(): void {
    const C = this.comalGroup;
    const at = (x: number, y: number, z: number) => this.world(1, x, y, z);
    const comal = makeComal();
    comal.position.copy(at(GRIDDLE.x, 0, GRIDDLE.z));
    C.add(comal);
    const tp = makeTortillaPress();
    tp.position.copy(at(TPRESS.x, 0, TPRESS.z));
    tp.scale.setScalar(TPRESS_SCALE);
    C.add(tp);
    this.tpress = tp;
    this.proxy(new THREE.BoxGeometry(1.7, 1.0, 1.3), at(TPRESS.x, 0.4, TPRESS.z), { type: "tpress" }, tp);
    // The taco rack, at the back of the warm end: the front of the warm end stays free to park on.
    const warm = GRILL_ZONES[GRILL_ZONES.length - 1];
    this.rack.x = (warm.x0 + warm.x1) / 2 + RACK_DX;
    this.rack.z = GRILL_BOUNDS.z0 + RACK_HALF.z - 0.05;
    this.rackObj.position.copy(at(this.rack.x, GRILL_TOP, this.rack.z));
    C.add(this.rackObj);
    this.proxy(new THREE.BoxGeometry(RACK_HALF.x * 2 + 0.2, 0.6, RACK_HALF.z * 2 + 0.3), at(this.rack.x, GRILL_TOP + 0.25, this.rack.z), { type: "rack" }, this.rackObj);
    this.setRack([]);
  }

  /** Put these tacos in the comal's rack (or empty it with []). */
  setRack(layers: Layer[]): void {
    const r = this.rack;
    r.layers = layers;
    const key = layers.map((l) => l.piece.uid).join(",") || "empty";
    if (key === r.foodKey && r.food) return;
    r.foodKey = key;
    if (r.food) {
      this.rackObj.remove(r.food);
      disposeObject(r.food);
    }
    const dish = makeTacoRack(layers.map((l) => l.piece), RACK_SLOTS);
    dish.group.scale.setScalar(GRILL_SCALE * RACK_SCALE);
    r.food = dish.group;
    this.rackObj.add(dish.group);
  }

  /** True when a world point is over the taco rack on the comal. */
  overRack(world: THREE.Vector3): boolean {
    if (this.middle !== "comal") return false;
    const x = world.x - pageX(1);
    return Math.abs(x - this.rack.x) < RACK_HALF.x + 0.12 && Math.abs(world.z - this.rack.z) < RACK_HALF.z + 0.2;
  }

  /** The rack's middle, world space (the playtest bot, and where a drop is aimed). */
  rackPoint(): THREE.Vector3 {
    return this.world(1, this.rack.x, GRILL_TOP + 0.2, this.rack.z);
  }

  /** The comal's sauce caddy: whatever squeeze bottles this town's menu uses (none at Red Mesa). */
  private setComalCaddy(sauces: SauceKind[]): void {
    if (this.comalCaddy) {
      for (const k of this.comalCaddy.userData.kinds) delete this.bottles[k];
      this.comalGroup.remove(this.comalCaddy);
      disposeObject(this.comalCaddy);
      this.comalCaddy = null;
      this.hitMeshes = this.hitMeshes.filter((m) => {
        const keep = m.userData.owner !== this.comalCaddyOwner;
        if (!keep) this.scene.remove(m);
        return keep;
      });
    }
    if (!sauces.length) return;
    const caddy = makeSauceCaddy(sauces.slice(0, 3));
    caddy.position.copy(this.world(1, COMAL_CADDY.x - (sauces.length < 3 ? 0.3 : 0), 0, COMAL_CADDY.z));
    this.comalGroup.add(caddy);
    this.comalCaddy = caddy;
    this.comalCaddyOwner = caddy;
    Object.assign(this.bottles, caddy.userData.bottles);
    for (const k of caddy.userData.kinds) {
      const b = caddy.userData.spots.bottles[k]!;
      this.proxy(bottleBox(caddy), caddy.position.clone().add(new THREE.Vector3(b.x, 0.8, b.z)), { type: "bottle", sauce: k }, caddy);
    }
  }
  private comalCaddyOwner: THREE.Object3D | null = null;

  /** Where the tortilla press's plate is, world space. */
  tpressPoint(): THREE.Vector3 {
    const sp = this.tpress.userData.spots.plate;
    return this.tpress.position.clone().add(new THREE.Vector3(sp.x, sp.y, sp.z).multiplyScalar(TPRESS_SCALE));
  }

  /** Spread the bays that are out evenly about the press's centre, and hide the rest. */
  private layoutBays(): void {
    const n = this.bayCount;
    const step = BAY.w + PRESS.gap;
    this.bays.forEach((b, i) => {
      b.obj.visible = i < n;
      // Three bays sit a little left so the third stays clear of the screen edge.
      b.x = PRESS.x - (n - 2) * 0.3 + (i - (n - 1) / 2) * step;
      b.obj.position.copy(this.world(1, b.x, 0, b.z));
      b.handleProxy.parent?.updateMatrixWorld();
      const plate = this.hitMeshes.find((m) => (m.userData.hit as Hit).type === "bay" && (m.userData.hit as { idx: number }).idx === i);
      plate?.position.copy(this.world(1, b.x, PLATE.y + 0.3, b.z + PLATE.z));
      this.placeHandle(b);
    });
  }
  private placeHandle(b: PressBay): void {
    b.handleProxy.position.copy(b.obj.position).add(b.obj.userData.handle());
  }

  /**
   * Put out this town's middle counter: the grill, or the panini press with its bays and (at
   * Harbor City) the cutting board. Empties the press.
   */
  setMiddle(mode: MiddleCounter, bays = 2, board = false, tpress = false, oven = 2): void {
    this.middle = mode;
    this.grillGroup.visible = mode === "grill";
    this.pressGroup.visible = mode === "press";
    this.comalGroup.visible = mode === "comal";
    this.ovenGroup.visible = mode === "oven";
    this.ovenCount = Math.max(1, Math.min(MAX_OVEN, oven));
    this.layoutOven();
    this.releasePeel();
    Object.assign(this.peelAt, { x: PEEL_HOME.x, z: PEEL_HOME.z, y: 0 });
    this.setPeel([]);
    for (let i = 0; i < MAX_OVEN; i++) this.setSpot(i, []);
    this.bench.layers = [];
    this.syncFood(this.bench, this.world(1, BENCH_AT.x, BENCH.h, BENCH_AT.z));
    // The comal has no buttons: hot under the left two thirds, warm at the right end.
    if (mode === "comal") this.zones = ["hot", "hot", "warm"];
    this.tpressOn = mode === "comal" && tpress;
    this.setRack([]);
    this.tpress.visible = this.tpressOn;
    this.tpressT = 0;
    this.tpress.userData.setPress(0);
    this.bayCount = Math.max(1, Math.min(MAX_BAYS, bays));
    for (const b of this.bays) this.setBay(b, []);
    for (const b of this.bays) Object.assign(b, { closed: false, open: 1 });
    this.layoutBays();
    if (this.board) {
      // The one board moves to the oven page at Port Amber.
      const bd = this.board;
      const spot = mode === "oven" ? OVEN_BOARD : PRESS_BOARD;
      (mode === "oven" ? this.ovenGroup : this.pressGroup).add(bd.obj);
      bd.x = spot.x;
      bd.z = spot.z;
      const k = mode === "oven" ? OVEN_BOARD.scale : 1;
      bd.obj.position.copy(this.world(1, spot.x, 0, spot.z));
      bd.obj.scale.setScalar(k);
      this.boardProxy?.position.copy(this.world(1, spot.x, 0.3, spot.z));
      this.boardProxy?.scale.set(k, 1, k);
      bd.on = board;
      bd.obj.visible = board;
      if (this.knifeObj) {
        const ka = mode === "oven" ? KNIFE_AT.oven : KNIFE_AT.press;
        (mode === "oven" ? this.ovenGroup : this.pressGroup).add(this.knifeObj);
        this.knifeRest.copy(this.world(1, spot.x + ka.x * k, ka.y, spot.z + ka.z * k));
        this.knifeObj.position.copy(this.knifeRest);
        this.knifeProxy?.position.copy(this.knifeRest).setY(0.4);
        this.knifeProxy?.scale.set(ka.tap, 1, 1);
        this.knifeLift = 0;
        this.setKnife("rest");
      }
      this.setBoard([]);
    }
    // Port Amber's board stands where the bench is.
    this.benchObj.visible = !(mode === "oven" && board);
  }

  /**
   * The fryer's extras for a town: curds and gravy where poutine is served (and in the Pines), the
   * sweet potato tray at the coast from Driftwood. In Red Rock the potato freezer gives way to
   * trays of tortilla wedges (chips) and churro dough, jalapeños and a queso well stand where the
   * curds and gravy do once nachos are on, and churros get a sugar shaker.
   */
  setFryerSides(poutine: boolean, fryer: readonly FryKind[]): void {
    const red = fryer.includes("chips");
    const isle = fryer.includes("zucchini");
    this.redRock = red;
    this.orchard = isle;
    this.batterBowl.visible = isle;
    this.setBatter(0);
    // On the isle the frozen fries come from a tray, so the fritter dough can share the freezer's spot.
    this.freezer.visible = fryer.includes("fries") && !isle;
    this.curdTray.visible = this.gravyWell.visible = poutine && !red;
    this.jalTray.visible = this.quesoWell.visible = poutine && red;
    this.sugarShaker.visible = fryer.includes("churros") || fryer.includes("fritters");
    for (const [k, t] of Object.entries(this.fryTrays)) t!.visible = fryer.includes(k as FryKind) && (k !== "fries" || isle);
    // Two trays share the freezer's spot when both are out.
    const both = fryer.includes("chips") && fryer.includes("churros");
    const F = FRYER;
    const place = (k: FryKind, z: number, x: number = F.freezer.x) => {
      const t = this.fryTrays[k];
      if (!t) return;
      t.position.copy(this.world(2, x, 0, z));
      this.fryBinAt[k] = this.world(2, x, 0.4, z);
      const m = this.hitMeshes.find((h) => (h.userData.hit as Hit).type === "fryBin" && (h.userData.hit as { fry: FryKind }).fry === k);
      m?.position.copy(this.world(2, x, 0.3, z));
    };
    if (red) {
      // Where tostadas are on, the corn tortillas (setPantry) take the lower half of this spot.
      place("chips", both || this.fryerCorn ? F.freezer.z - 0.65 : F.freezer.z);
      place("churros", F.freezer.z + 0.6);
    } else if (isle) {
      // Orchard Isle: fries (and from Larkvale the apple fritter dough) in trays at the freezer's
      // spot, zucchini where the curds go, the batter bowl at the gravy well's spot.
      const fritters = fryer.includes("fritters");
      place("fries", fritters ? F.freezer.z - 0.65 : F.freezer.z);
      place("fritters", F.freezer.z + 0.6);
      place("zucchini", F.curds.z);
    } else place("sweet", F.curds.z);
  }

  /** Build the food drawn for a stack of layers (bottom first), at the counter food scale. */
  private stackObject(layers: Layer[]): THREE.Group {
    const g = new THREE.Group();
    if (layers[0]?.piece.kind === "dough") {
      // A flatbread or calzone is one object, turned to face the way it's been turned.
      const fb = makeFlatbread(layers.map((l) => l.piece));
      fb.rotation.y = pieYaw(layers[0].piece);
      g.add(fb);
      g.userData.pie = fb;
      g.scale.setScalar(GRILL_SCALE);
      return g;
    }
    const { bases, yaw, back } = stackBases(layers.map((l) => l.piece));
    layers.forEach((l, i) => {
      const o = makeFood(l.piece, i === 0 ? "bottom" : "top");
      o.position.set(l.offX * 0.5, bases[i], l.offZ * 0.5 - back[i]);
      o.rotation.y = yaw[i];
      g.add(o);
    });
    g.scale.setScalar(GRILL_SCALE);
    return g;
  }

  /** Put this stack in a bay (or empty it with []). */
  setBay(b: PressBay, layers: Layer[]): void {
    b.layers = layers;
    this.syncFood(b, b.obj.position.clone().add(b.obj.userData.food));
  }
  /** Put this stack on the cutting board (or clear it). */
  setBoard(layers: Layer[]): void {
    const bd = this.board;
    if (!bd) return;
    bd.layers = layers;
    const pie = layers[0]?.piece.kind === "dough";
    this.syncFood(bd, this.world(1, bd.x - (pie ? 0 : 0.12), BOARD.h, bd.z));
  }
  /** Redraw what sits in a bay or on the board when its pieces change. */
  syncFood(holder: { layers: Layer[]; food: THREE.Group | null; foodKey: string }, at: THREE.Vector3): void {
    // A pie redraws its own sauce and colour as they change (FlatbreadObject.update), so only its pieces and shape are keyed.
    const pie = holder.layers[0]?.piece.kind === "dough";
    const key = pie
      ? holder.layers.map((l) => l.piece.uid).join(",") + `|${holder.layers[0].piece.folded ? "f" : ""}`
      : holder.layers.map((l) => `${l.piece.uid}${l.piece.cut ? "c" : ""}${l.piece.stroke?.length ?? ""}`).join(",");
    if (key === holder.foodKey && holder.food) return;
    holder.foodKey = key;
    if (holder.food) {
      this.scene.remove(holder.food);
      disposeObject(holder.food);
      holder.food = null;
    }
    if (!holder.layers.length) return;
    holder.food = this.stackObject(holder.layers);
    holder.food.position.copy(at);
    holder.food.userData.h = new THREE.Box3().setFromObject(holder.food).getSize(new THREE.Vector3()).y;
    holder.food.userData.y0 = at.y;
    this.scene.add(holder.food);
  }

  /** Redraw a pie's crust colour, sauce and cuts (call every frame for pies that change). */
  updatePie(holder: PieHolder): void {
    const fb = holder.food?.userData.pie as FlatbreadObject | undefined;
    if (fb) fb.userData.update(holder.layers.map((l) => l.piece));
  }

  /** The bay under a world point on the press (at plate height), or -1. */
  overBay(world: THREE.Vector3): number {
    return this.bays.findIndex((b, i) => i < this.bayCount && Math.abs(world.x - pageX(1) - b.x) < BAY.w / 2 + 0.05 && Math.abs(world.z - b.z - PLATE.z) < BAY.d / 2 + 0.1);
  }
  /** True when a world point is over the cutting board. */
  overBoard(world: THREE.Vector3): boolean {
    const bd = this.board;
    return !!bd && bd.on && Math.abs(world.x - pageX(1) - bd.x) < BOARD.w / 2 + 0.1 && Math.abs(world.z - bd.z) < BOARD.d / 2 + 0.15;
  }
  /** Put a tortilla in an empty fryer basket to fry into a tostada shell, or take it out (null). */
  setBasketShell(i: number, piece: Piece | null): void {
    const b = this.baskets[i];
    if (b.shellObj) {
      b.obj.remove(b.shellObj);
      disposeObject(b.shellObj);
      b.shellObj = null;
    }
    b.shell = piece;
    if (!piece) return;
    const o = makeFood(piece, "top");
    o.scale.setScalar(GRILL_SCALE / FRYER_SCALE);
    o.position.y = 0.08;
    b.obj.add(o);
    b.shellObj = o;
  }

  /** Bring the tortilla press's lever down (0 open .. 1 pressed flat). */
  setTpress(t: number): void {
    if (Math.abs(t - this.tpressT) < 0.001) return;
    this.tpressT = t;
    this.tpress.userData.setPress(t);
  }

  /** Close or lift a bay's lid. */
  setLid(i: number, closed: boolean): void {
    const b = this.bays[i];
    if (!b || b.closed === closed) return;
    b.closed = closed;
    b.moved = 0;
  }
  /** The lid won't come down on what's in this bay: it dips and springs back up. */
  refuseLid(i: number): void {
    const b = this.bays[i];
    if (b && !b.closed) b.shake = SHAKE_S;
  }
  /** What a bay's meter reads: its bread if a sandwich, else the lone piece. */
  bayReading(b: PressBay): Piece | null {
    return b.layers.find((l) => BREADS.has(l.piece.kind))?.piece ?? b.layers[0]?.piece ?? null;
  }
  /**
   * Where a bay's meter sits: on the shut lid, over the food it hides (well clear of the sauce
   * caddy and the board in front); with the lid up, on the front lip just in front of the food.
   */
  bayTagPoint(i: number): THREE.Vector3 {
    const b = this.bays[i];
    return b.open < 0.5 ? this.world(1, b.x, PLATE.y + CLOSED_GAP + 0.3, b.z + 0.3) : this.world(1, b.x, PLATE.y, b.z + PLATE.z + PLATE.d / 2 + 0.1);
  }
  /** The middle of a bay's handle grip, world space (for hints and the playtest bot). */
  handlePoint(i: number): THREE.Vector3 {
    return this.bays[i].handleProxy.position.clone();
  }
  /** The middle of a bay's plate, world space. */
  bayPoint(i: number): THREE.Vector3 {
    const b = this.bays[i];
    return b.obj.position.clone().add(b.obj.userData.food);
  }
  boardPoint(): THREE.Vector3 {
    return this.world(1, this.board?.x ?? 0, BOARD.h, this.board?.z ?? 0);
  }

  /** Fryer page: see FRYER. */
  private buildFryer(): void {
    const F = FRYER;
    const at = (x: number, y: number, z: number) => this.world(2, x, y, z);
    // Potato freezer, heaped with frozen fries.
    const freezer = makeFreezer();
    freezer.position.copy(at(F.freezer.x, 0, F.freezer.z));
    this.scene.add(freezer);
    this.freezer = freezer;
    this.friesBinAt.copy(at(F.freezer.x, 0.6, F.freezer.z));
    this.proxy(new THREE.BoxGeometry(FREEZER.w + 0.1, 1.4, FREEZER.d + 0.2), this.friesBinAt.clone(), { type: "friesBin" }, freezer);

    // Carton stacks along the front on the left, small to large.
    F.stacks.forEach(([size, x]) => this.addStack("carton", size, at(x, 0, F.stackZ)));

    // The packing pads at the front on the right.
    const pads = makePackPad();
    pads.position.copy(at(F.pads.x, 0, F.pads.z));
    this.scene.add(pads);
    for (const sp of pads.userData.spots.pads) {
      const c = pads.position.clone().add(new THREE.Vector3(sp.x, sp.y, sp.z));
      this.packs.push({ ...EMPTY_PACK, obj: null, x: c.x, z: c.z, y: c.y });
      this.proxy(new THREE.BoxGeometry(PAD.w + 0.1, 1.6, PAD.d + 0.3), c.clone().setY(0.6), { type: "pack", idx: this.packs.length - 1 });
    }
    // Toppings in a column down the right edge, each with a generous target.
    const shaker = makeShaker();
    shaker.scale.setScalar(SHAKER_SCALE);
    shaker.position.copy(at(F.shaker.x, 0, F.shaker.z));
    this.scene.add(shaker);
    this.shakerObj = shaker;
    this.proxy(new THREE.BoxGeometry(1.3, 1.2, 1.25), at(F.shaker.x, 0.4, F.shaker.z), { type: "shaker" });
    // Churros' sugar, in its own shaker below the salt (Sun Valley).
    const sugar = makeSugarShaker();
    sugar.scale.setScalar(SHAKER_SCALE);
    sugar.position.copy(at(F.sugar.x, 0, F.sugar.z));
    sugar.visible = false;
    this.scene.add(sugar);
    this.sugarShaker = sugar;
    this.proxy(new THREE.BoxGeometry(1.1, 1.2, 0.9), at(F.sugar.x, 0.4, F.sugar.z), { type: "shaker", sugar: true }, sugar);
    const tray = makeCurdTray();
    tray.position.copy(at(F.curds.x, 0, F.curds.z));
    this.scene.add(tray);
    this.curdTray = tray;
    this.proxy(new THREE.BoxGeometry(CURD_TRAY.w + 0.1, 0.9, CURD_TRAY.d + 0.2), at(F.curds.x, 0.3, F.curds.z), { type: "curds" }, tray);
    const well = makeGravyWell();
    well.position.copy(at(F.gravy.x, 0, F.gravy.z));
    this.scene.add(well);
    this.gravyWell = well;
    this.proxy(new THREE.BoxGeometry(GRAVY_WELL.w + 0.1, 1.2, GRAVY_WELL.d + 0.2), at(F.gravy.x, 0.5, F.gravy.z), { type: "gravy" }, well);
    // Orchard Isle's batter bowl, at the gravy well's spot: zucchini is dipped in it before it fries.
    const bowl = makeBatterBowl();
    bowl.position.copy(at(BATTER_AT.x, 0, BATTER_AT.z));
    bowl.visible = false;
    this.scene.add(bowl);
    this.batterBowl = bowl;
    this.proxy(new THREE.BoxGeometry(BATTER.r * 2 + 0.3, 1.0, BATTER.r * 2 + 0.3), at(BATTER_AT.x, 0.4, BATTER_AT.z), { type: "batter" }, bowl);
    // Red Rock's nacho toppings in the same spots: jalapeños for curds, queso for gravy.
    const jal = makeJalapenoTray();
    jal.position.copy(at(F.curds.x, 0, F.curds.z));
    jal.visible = false;
    this.scene.add(jal);
    this.jalTray = jal;
    this.proxy(new THREE.BoxGeometry(CURD_TRAY.w + 0.1, 0.9, CURD_TRAY.d + 0.2), at(F.curds.x, 0.3, F.curds.z), { type: "curds" }, jal);
    const queso = makeGravyWell(QUESO);
    queso.position.copy(at(F.gravy.x, 0, F.gravy.z));
    queso.visible = false;
    this.scene.add(queso);
    this.quesoWell = queso;
    this.proxy(new THREE.BoxGeometry(GRAVY_WELL.w + 0.1, 1.2, GRAVY_WELL.d + 0.2), at(F.gravy.x, 0.5, F.gravy.z), { type: "gravy" }, queso);
    // Trays of other things to fry: sweet potato fries (the coast, from Driftwood) where the curds
    // are in the Pines; tortilla wedges and churro dough at the freezer's spot in Red Rock.
    for (const fry of ["sweet", "chips", "churros", "zucchini", "fritters", "fries"] as FryKind[]) {
      const tray = makeFryTray(fry);
      tray.visible = false;
      this.scene.add(tray);
      this.fryTrays[fry] = tray;
      this.proxy(new THREE.BoxGeometry(SWEET_TRAY.w + 0.1, 0.9, SWEET_TRAY.d + 0.2), new THREE.Vector3(), { type: "fryBin", fry }, tray);
    }

    // The hang-rail fryer: a basket per well, hanging tilted on the rail until it's lowered.
    const fryer = makeFryer();
    fryer.scale.setScalar(FRYER_SCALE);
    fryer.position.copy(at(F.fryer.x, 0, F.fryer.z));
    this.scene.add(fryer);
    this.fryer = fryer;
    const ringGeo = new THREE.RingGeometry(0.05, 0.075, 12).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const w = fryer.userData.spots.wells[i % 2];
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#fff1c4", transparent: true, opacity: 0, depthWrite: false }));
      m.position.set(w.x, w.oilY + 0.035, w.z);
      m.renderOrder = 3;
      m.visible = false;
      m.userData = { life: 0, well: i % 2 };
      fryer.add(m);
      this.oilRings.push(m);
    }
    const k = FRYER_SCALE;
    const raw = fryer.userData.spots;
    const sp = {
      wells: raw.wells.map((w) => ({ x: w.x * k, z: w.z * k, oilY: w.oilY * k })),
      down: { y: raw.down.y * k },
      hang: raw.hang.map((h) => ({ ...scaleP(h, k), tilt: h.tilt })),
      meters: raw.meters.map((m) => scaleP(m, k)),
    };
    this.fryerSpots = sp;
    sp.wells.forEach((w, i) => {
      const basket = makeFryBasket();
      basket.scale.setScalar(k);
      const fries = makeBasketFries(FRY_BASKET.w - 0.1, FRY_BASKET.d - 0.1, 21 + i);
      fries.position.y = 0.02;
      fries.visible = false;
      basket.add(fries);
      this.scene.add(basket);
      const hang = sp.hang[i];
      const up = fryer.position.clone().add(new THREE.Vector3(hang.x, hang.y, hang.z));
      const down = fryer.position.clone().add(new THREE.Vector3(w.x, sp.down.y, w.z));
      this.baskets.push({ loaded: false, fry: "fries", shell: null, shellObj: null, cook: 0, down: false, goldenRung: false, beepT: 0, obj: basket, fries, t: 0, amount: 0, held: 0, up, downAt: down, tilt: hang.tilt });
      this.proxy(new THREE.BoxGeometry(1.5 * k, 1.4, 2.6 * k), fryer.position.clone().add(new THREE.Vector3(w.x, 0.8, w.z + 0.5 * k)), { type: "basket", idx: i });
    });
  }

  private buildDrinks(): void {
    const at = (x: number, y: number, z: number) => this.world(0, x, y, z);
    const fountain = makeFountain();
    fountain.scale.setScalar(FOUNTAIN_SCALE);
    fountain.position.copy(at(FOUNTAIN.x, 0, FOUNTAIN.z));
    this.scene.add(fountain);
    this.fountain = fountain;
    const sp = FOUNTAIN_SPOTS;
    const start = fountainFor("mountains");
    fountain.userData.setDrinks(start);
    start.forEach((flavor, i) => {
      const x = tapX(i);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), toon(DRINK_TINT[flavor]));
      // Drawn after the cup so the see-through cup wall never hides it.
      stream.renderOrder = 2;
      stream.visible = false;
      this.scene.add(stream);
      const puddleObj = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ color: DRINK_TINT[flavor], transparent: true, opacity: 0.7 }));
      puddleObj.rotation.x = -Math.PI / 2;
      puddleObj.position.set(x, CUP_Y + 0.02, CUP_Z + 0.1);
      puddleObj.visible = false;
      this.scene.add(puddleObj);
      this.taps.push({ flavor, pouring: false, stream, spill: 0, puddle: 0, puddleObj, x, cup: null });
      // The push button on top pours; the drip tray under the nozzle is where a spill gets wiped.
      const b = sp.buttons[i];
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.04, 1.0, 1.2), at(FOUNTAIN.x + b.x, b.y, FOUNTAIN.z + b.z), { type: "tap", idx: i });
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.04, 0.6, 1.3), new THREE.Vector3(x, 0.3, CUP_Z + 0.15), { type: "spill", idx: i });
    });

    // The ice bin: grab a scoop from anywhere on it.
    const ice = makeIceWell(ICE_WIDTH);
    ice.position.copy(at(ICE.x, 0, ICE.z));
    this.scene.add(ice);
    const fp = ice.userData.footprint as { w: number; d: number };
    this.proxy(new THREE.BoxGeometry(fp.w, 1.0, fp.d), at(ICE.x, 0.5, ICE.z), { type: "ice" });

    // The front row: cups by size on the left, a stack of lids for each cup size on the right.
    for (const [size, x] of CUP_STACKS) this.addStack("cup", size, at(x, 0, FRONT_Z));
    for (const [size, x] of LID_STACKS) {
      const lids = makeLidStackSized(size, 8);
      lids.position.copy(at(x, 0, FRONT_Z));
      this.scene.add(lids);
      this.lidAt.push({ size, at: lids.position.clone() });
      this.proxy(new THREE.BoxGeometry(0.95, 1.0, 1.2), at(x, 0.4, FRONT_Z), { type: "lids", size });
    }
  }

  /** Where each lid stack stands, for its size tag and the playtest bot. */
  lidAt: { size: Size; at: THREE.Vector3 }[] = [];

  /**
   * The local drink's garnish (after build #78): a dish of it between the ice and the cups,
   * outside the Pines. Null where the local drinks go without.
   */
  garnish: Garnish | null = null;
  private garnishDish = new THREE.Group();
  setGarnish(kind: Garnish | null): void {
    if (kind === this.garnish) return;
    this.garnish = kind;
    for (const c of [...this.garnishDish.children]) {
      this.garnishDish.remove(c);
      disposeObject(c);
    }
    if (!this.garnishDish.parent) {
      this.garnishDish.position.copy(this.world(0, GARNISH_DISH.x, 0, GARNISH_DISH.z));
      this.scene.add(this.garnishDish);
      this.proxy(new THREE.BoxGeometry(1.4, 0.8, 1.3), this.world(0, GARNISH_DISH.x, 0.3, GARNISH_DISH.z), { type: "garnish" }, this.garnishDish);
    }
    this.garnishDish.visible = !!kind;
    if (kind) this.garnishDish.add(makeGarnishDish(kind));
  }
  /** Where the garnish dish stands, world space (for the playtest bot). */
  garnishPoint(): THREE.Vector3 {
    return this.world(0, GARNISH_DISH.x, 0.2, GARNISH_DISH.z);
  }

  private fryer!: FryerObject;
  /** The fryer's spots, scaled with it. */
  private fryerSpots!: FryerObject["userData"]["spots"];
  /** The shaker standing in the topping column (hidden while it's in hand). */
  shakerObj!: THREE.Object3D;

  /**
   * The trash chute along the front edge: one slot the whole length of the window line, so every
   * counter has it in the same place. It stops just short of the outer edges of the drinks and
   * fryer views, so its ends bookend the three counters. Each counter's stretch lights up on its own.
   */
  private buildTrash(): void {
    const x0 = TRASH_X0();
    const x1 = TRASH_X1();
    const chute = makeTrashChute(x1 - x0, TRASH.z1 - TRASH.z0);
    chute.position.set((x0 + x1) / 2, 0, (TRASH.z0 + TRASH.z1) / 2);
    this.scene.add(chute);
    PAGES.forEach((_, page) => {
      // Lights up while something held is over it, so you know a drop will bin it.
      const gx0 = Math.max(x0, pageX(page) - TRASH_HALF - 0.1);
      const gx1 = Math.min(x1, pageX(page) + TRASH_HALF + 0.1);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - gx0, TRASH.z1 - TRASH.z0 + 0.25), new THREE.MeshBasicMaterial({ color: "#e0523f", transparent: true, opacity: 0.55, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.copy(this.world(page, 0, 0.1, (TRASH.z0 + TRASH.z1) / 2));
      glow.position.x = (gx0 + gx1) / 2;
      glow.visible = false;
      glow.renderOrder = 3;
      this.scene.add(glow);
      this.trashGlow[page] = glow;
    });
  }

  /** What you carry from the fryer's topping column. */
  fryTopMesh(what: "salt" | "curds" | "gravy" | "sugar"): THREE.Object3D {
    if (what === "salt" || what === "sugar") {
      const m = what === "sugar" ? makeSugarShaker() : makeShaker();
      // Tipped over, ready to shake.
      m.rotation.z = 2.3;
      m.position.y = 0.4;
      const g = new THREE.Group();
      g.add(m);
      return g;
    }
    if (this.redRock && what === "curds") {
      const j = makeJalapenoHandful();
      return j;
    }
    return what === "curds" ? makeCurdHandful() : makeLadle(this.redRock ? QUESO : undefined);
  }

  /** Packing pad with fries under a world point, or -1. */
  friedPackAt(g: THREE.Vector3): number {
    const i = this.overPack(g);
    return i >= 0 && this.packs[i].size && this.packs[i].fill > 0 ? i : -1;
  }

  /** A scoop of ice or one lid (for a cup size): on the counter and in hand. */
  extraMesh(what: "ice" | "lid", size: Size = "M"): THREE.Object3D {
    if (what === "ice") {
      // The steel scoop with its load (after build #86; it used to be loose cubes in the air): a
      // round bowl heaped with cubes, the black handle running back toward the finger.
      const g = new THREE.Group();
      const R = 0.34;
      const bowl = mesh(faceted(new THREE.CylinderGeometry(R, R * 0.86, 0.3, 16, 1, true)), "#d7dedd", { side: THREE.DoubleSide });
      bowl.position.y = 0.15;
      g.add(bowl);
      const floor = mesh(faceted(new THREE.CircleGeometry(R * 0.86, 16).rotateX(-Math.PI / 2)), "#c3cbca");
      floor.position.y = 0.01;
      g.add(floor);
      const handle = mesh(faceted(new THREE.CylinderGeometry(0.055, 0.065, 0.62, 8).rotateX(Math.PI / 2)), "#3a3633");
      handle.position.set(0, 0.2, R + 0.28);
      handle.rotation.x = -0.25;
      g.add(handle);
      const spots: [number, number, number][] = [[-0.12, 0.3, -0.08], [0.13, 0.28, -0.04], [0, 0.33, 0.12], [-0.05, 0.42, -0.02], [0.14, 0.4, 0.13]];
      spots.forEach(([x, y, z], i) => {
        const c = mesh(faceted(new THREE.BoxGeometry(0.17, 0.15, 0.17)), i % 2 ? "#cfeaf4" : "#e8f6fb", { opacity: 0.9 });
        c.position.set(x, y, z);
        c.rotation.set(i * 0.7, i * 1.3, i * 0.4);
        g.add(c);
      });
      // Held by the handle: the bowl sits just ahead of the finger.
      g.children.forEach((c) => (c.position.z -= 0.3));
      return g;
    }
    const r = (CUP_DIMS[size].r + 0.03) * CUP_IN_HAND;
    return mesh(faceted(new THREE.CylinderGeometry(r, r + 0.02, 0.06, 18)), "#f4f2ec");
  }

  /** A stack of cups or cartons standing at a world point. */
  private addStack(kind: Stack["kind"], size: Size, at: THREE.Vector3): void {
    const base = mesh(faceted(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16)), "#e9e2d2", { ink: false });
    base.position.set(at.x, 0.02, at.z);
    this.scene.add(base);
    const obj = new THREE.Group();
    obj.position.copy(at).setY(at.y + 0.04);
    this.scene.add(obj);
    const s: Stack = { kind, size, obj, x: at.x, z: at.z };
    this.stacks.push(s);
    this.syncStack(s);
    this.proxy(new THREE.BoxGeometry(1.0, 1.6, 1.2), at.clone().setY(at.y + 0.6), { type: "stack", idx: this.stacks.length - 1 });
  }

  /** Draw a cup or carton stack. */
  syncStack(s: Stack): void {
    for (const c of [...s.obj.children]) {
      s.obj.remove(c);
      disposeObject(c);
    }
    // Nested cups and cartons are baked into one mesh per size and count.
    if (s.kind === "cup") return void s.obj.add(makeCupStack(s.size, STACK_SHOWN));
    const o = makeCartonStack(s.size as FriesSize, STACK_SHOWN);
    o.scale.setScalar(CARTON_STACK_SCALE);
    s.obj.add(o);
  }

  /**
   * Stand a cup on the drinks counter at a world point: under a nozzle if it's over one's drip
   * tray, otherwise right where it was dropped. Returns null (and why) if there's no room.
   */
  /** `back`: the cup is going back where it was just picked up from (a spill there doesn't stop it). */
  placeCup(c: Omit<DrinkCup, "obj" | "x" | "z" | "tap">, world: THREE.Vector3, back = false): { cup: DrinkCup | null; why?: string } {
    const ti = this.overTap(world);
    let x = world.x;
    let z = world.z;
    if (ti >= 0) {
      const t = this.taps[ti];
      if (t.cup) return { cup: null, why: "There's already a cup there." };
      if (t.puddle > 0.05 && !back) return { cup: null, why: "Wipe up the spill first: scrub it with your finger." };
      [x, z] = [t.x, CUP_Z];
    } else {
      // Anywhere on the counter between the machines and the front row.
      const lx = x - pageX(0);
      if (Math.abs(lx) > 4.2 || z < CUP_Z + 0.75 || z > FRONT_Z - 0.6) return { cup: null, why: "Stand it on the open counter, or under a nozzle." };
      if (this.cups.some((o) => Math.hypot(o.x - x, o.z - z) < CUP_ROOM)) return { cup: null, why: "No room there: another cup's in the way." };
    }
    const cup: DrinkCup = { ...c, obj: makeCup(c.flavor, c.lid, c.size), x, z, tap: ti };
    cup.obj.scale.setScalar(CUP_AT_TAP);
    cup.obj.position.set(x, ti >= 0 ? CUP_Y : 0, z);
    cup.obj.userData.setFill(cup.fill);
    dressCup(cup.obj, cup);
    this.scene.add(cup.obj);
    this.cups.push(cup);
    if (ti >= 0) this.taps[ti].cup = cup;
    return { cup };
  }

  /** Put the area's drinks on the fountain's five buttons (left to right): the strips, streams and spills. */
  setDrinks(drinks: readonly DrinkId[]): void {
    this.fountain?.userData.setDrinks(drinks);
    this.taps.forEach((t, i) => {
      const flavor = drinks[i];
      if (!flavor || t.flavor === flavor) return;
      t.flavor = flavor;
      t.stream.material = toon(DRINK_TINT[flavor]);
      (t.puddleObj.material as THREE.MeshBasicMaterial).color.set(DRINK_TINT[flavor]);
    });
  }

  /** The first pour into an empty cup gives it its flavour (and the band on the paper). */
  setCupFlavor(cup: DrinkCup, flavor: DrinkId): void {
    cup.flavor = flavor;
    const obj = makeCup(flavor, cup.lid, cup.size);
    obj.scale.copy(cup.obj.scale);
    obj.position.copy(cup.obj.position);
    obj.userData.setFill(cup.fill);
    dressCup(obj, cup);
    this.scene.remove(cup.obj);
    disposeObject(cup.obj);
    cup.obj = obj;
    this.scene.add(obj);
  }

  /** Add ice or a lid to a cup on the counter. */
  dressCupAt(cup: DrinkCup, what: "ice" | "lid"): void {
    cup[what] = true;
    if (what === "lid" && cup.tap >= 0) this.taps[cup.tap].pouring = false;
    dressCup(cup.obj, cup);
  }

  /** Take a cup off the counter (picked up, binned or a new shift). */
  removeCup(cup: DrinkCup): void {
    this.scene.remove(cup.obj);
    disposeObject(cup.obj);
    this.cups = this.cups.filter((c) => c !== cup);
    if (cup.tap >= 0) {
      const t = this.taps[cup.tap];
      t.cup = null;
      t.pouring = false;
    }
  }

  /** The cup under a world point on the drinks counter, or null. */
  cupAt(world: THREE.Vector3): DrinkCup | null {
    let best: DrinkCup | null = null;
    let bestD = 0.6;
    for (const c of this.cups) {
      const d = Math.hypot(c.x - world.x, c.z - world.z);
      if (d < bestD) [best, bestD] = [c, d];
    }
    return best;
  }

  /** Redraw a packing spot: an empty carton, a part-filled one, or nothing. */
  syncPack(i: number): void {
    const p = this.packs[i];
    if (p.obj) {
      this.scene.remove(p.obj);
      disposeObject(p.obj);
      p.obj = null;
    }
    if (!p.size) return;
    let o: THREE.Object3D;
    if (p.fill > 0) {
      const f = makeFries(true, p.size, p.fill, p);
      f.userData.setCook(p.cook);
      f.scale.setScalar(PACK_SCALE * f.userData.sizeScale);
      o = f;
    } else {
      o = makeCarton(p.size);
      o.scale.multiplyScalar(PACK_SCALE);
    }
    o.position.set(p.x, p.y, p.z);
    this.scene.add(o);
    p.obj = o;
  }

  /** Clean stations for a new shift. */
  resetStations(): void {
    for (const c of [...this.cups]) this.removeCup(c);
    while (this.messes.length) this.rubMess(0, 1);
    for (const t of this.taps) t.puddle = 0;
    this.packs.forEach((p, i) => {
      Object.assign(p, EMPTY_PACK);
      this.syncPack(i);
    });
    for (const b of this.bays) {
      this.setBay(b, []);
      Object.assign(b, { closed: false, open: 1 });
    }
    this.setBoard([]);
    this.setRack([]);
    this.spillCost = 0;
  }

  /** Packing spot under a world point, or -1. */
  overPack(world: THREE.Vector3): number {
    // The pads are big on purpose: anywhere over one counts.
    return this.packs.findIndex((p) => Math.abs(world.x - p.x) < PAD.w / 2 + 0.12 && Math.abs(world.z - p.z) < PAD.d / 2 + 0.3);
  }

  /** Nozzle slot under a world point, or -1. */
  overTap(world: THREE.Vector3): number {
    return this.taps.findIndex((t) => Math.abs(world.x - t.x) < TAP_GAP / 2 && world.z > CUP_Z - 0.6 && world.z < CUP_Z + 1.4);
  }

  /** Where each drink's push button sits on the fountain (its cap and name are drawn there as UI). */
  drinkButtonPoint(i: number): THREE.Vector3 {
    const b = FOUNTAIN_SPOTS.buttons[i];
    return this.world(0, FOUNTAIN.x + b.x, b.y, FOUNTAIN.z + b.z);
  }

  /**
   * Fill the pans for the current stop: the grillables in a row behind the griddle, everything
   * else (cheese too: it only sometimes goes on the grill) in the cold rail on the left.
   */
  setPantry(kinds: Kind[]): void {
    if (this.pantry) {
      this.scene.remove(this.pantry);
      disposeObject(this.pantry);
    }
    this.hitMeshes = this.hitMeshes.filter((m) => {
      const keep = (m.userData.hit as Hit).type !== "bin";
      if (!keep) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      return keep;
    });
    const press = this.middle === "press";
    const comal = this.middle === "comal" || this.middle === "oven";
    const oven = this.middle === "oven";
    // At the press the back rail holds what goes in the press first (breads, proteins) and the
    // tuna well; the side rail the cold fillings. Sauces are in the caddy, never in a pan. At the
    // comal the back rail holds the tortillas, pork, beans and pineapple.
    // At the oven the dough and the tomato pot have their own spots and nothing goes in a back rail.
    const back = (k: Kind) => (oven ? false : press ? PRESS_BACK(k) : comal ? COMAL_BACK(k) : GRILLABLE.has(k));
    const usable = kinds.filter((k) => !((press || comal) && isSauce(k)) && k !== "dough");
    if (oven) {
      this.setOvenCaddy(kinds.filter((k) => k === "oil" || k === "honey") as SauceKind[]);
      this.setComalCaddy([]);
    } else if (comal) this.setComalCaddy(kinds.filter(isSauce) as SauceKind[]);
    const hot = usable.filter(back).slice(0, 5);
    let cold = usable.filter((k) => !back(k)).slice(0, press || comal ? 8 : 6);
    // At the oven (after build #84) the cheese and basil every pie wants sit in the front row, nearest
    // the thumb and the bench, so the commonest drags are the shortest.
    if (oven) cold = [...cold.filter((k) => !OVEN_NEAR.includes(k)), ...OVEN_NEAR.filter((k) => cold.includes(k))];
    const group = new THREE.Group();
    this.bins = [];
    const fill = (rail: ReturnType<typeof makeColdRail>, at: { x: number; z: number }) => {
      rail.position.copy(this.world(1, at.x, 0, at.z));
      group.add(rail);
      const { pans, pan } = rail.userData.spots;
      for (const p of pans) {
        if (!p.kind) continue;
        const b = { kind: p.kind, x: at.x + p.x, z: at.z + p.z, y: p.y };
        this.bins.push(b);
        this.proxy(new THREE.BoxGeometry(pan.w, 0.9, pan.d), this.world(1, b.x, b.y - 0.2, b.z), { type: "bin", kind: b.kind });
      }
    };
    if (!oven) fill(makeColdRail({ cols: Math.max(press || comal ? 2 : 3, hot.length), rows: 1, kinds: hot }), GRILL_PANS);
    // Down from the same back edge, as many rows as it takes. At the grill (after build #78) only
    // as many as the pantry fills, so a small first menu no longer shows a row of empty pans.
    const rows = Math.max(press || comal ? 3 : 1, Math.ceil(cold.length / 2));
    fill(makeColdRail({ cols: 2, rows, kinds: cold }), { x: SIDE_PANS.x, z: SIDE_BACK_Z + (rows * 1.27 + 0.4) / 2 });
    // Where tostadas are on (after build #84), a pan of corn tortillas stands on the fryer counter
    // too, under the chips, so a shell no longer has to be fetched from the comal.
    if (comal && this.fryerCorn && kinds.includes("corn")) {
      const rail = makeColdRail({ cols: 1, rows: 1, kinds: ["corn"] });
      rail.scale.setScalar(FRYER_CORN.s);
      rail.position.copy(this.world(2, FRYER_CORN.x, 0, FRYER_CORN.z));
      group.add(rail);
      const { pans, pan } = rail.userData.spots;
      const p = pans[0];
      this.proxy(new THREE.BoxGeometry(pan.w * FRYER_CORN.s + 0.1, 0.9, pan.d * FRYER_CORN.s + 0.1), this.world(2, FRYER_CORN.x + p.x * FRYER_CORN.s, p.y * FRYER_CORN.s - 0.2, FRYER_CORN.z + p.z * FRYER_CORN.s), { type: "bin", kind: "corn" });
    }
    this.pantry = group;
    this.scene.add(group);
  }

  private wall!: THREE.Mesh;
  /**
   * How many px off the top of a counter band `fullH` px tall to leave out so only CABIN.splash
   * units of wall show above the counter (the space goes to the window and the trays). Also sizes
   * the wall's paint texture to the screen, so it matches the wall in the other bands.
   */
  cropFor(fullW: number, fullH: number): number {
    const cam = this.camera.clone();
    cam.clearViewOffset();
    cam.position.set(0, CAM_H, LOOK_Z + CAM_BACK);
    cam.lookAt(0, 0, LOOK_Z);
    cam.updateMatrixWorld();
    const y = new THREE.Vector3(0, CABIN.splash, -3.4).project(cam).y;
    const crop = Math.max(0, Math.round(((1 - y) / 2) * fullH));
    const a = new THREE.Vector3(0, 0.5, -3.4).project(cam);
    const b = new THREE.Vector3(1, 0.5, -3.4).project(cam);
    const c = new THREE.Vector3(0, 1.5, -3.4).project(cam);
    const uppX = 1 / (((b.x - a.x) / 2) * fullW);
    const uppY = 1 / (((c.y - a.y) / 2) * fullH);
    const old = this.wall.material as THREE.Material;
    this.wall.material = wallMaterial(CABIN.wallTex, CABIN.wall, 90, 6, uppX, uppY);
    if (old.userData.disposable) old.dispose();
    return crop;
  }

  /** Draw only the bottom `fullH - crop` px of a `fullW` x `fullH` view (taps map through the same camera). */
  setCrop(fullW: number, fullH: number, crop: number): void {
    if (crop > 0) this.camera.setViewOffset(fullW, fullH, 0, crop, fullW, fullH - crop);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  layout(aspect: number): void {
    this.camera.aspect = aspect;
    // Fit VIEW_W across, and on short, wide bands enough depth to reach the trash slot along the
    // front edge.
    const dist = Math.hypot(CAM_H, CAM_BACK);
    const hfov = 2 * Math.atan(VIEW_W / 2 / dist);
    const fitWidth = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    const fitDepth = 2 * Math.atan(3.75 / dist);
    this.camera.fov = THREE.MathUtils.radToDeg(Math.max(fitWidth, fitDepth));
    this.camera.updateProjectionMatrix();
  }

  /** Go to a counter. */
  setPage(i: number): void {
    this.setStop(this.stopsOf(THREE.MathUtils.clamp(i, 0, PAGES.length - 1))[0]);
  }

  /** Move to a camera stop. Swipes along the trash chute step one stop at a time. */
  setStop(s: number): void {
    this.stop = THREE.MathUtils.clamp(s, 0, STOPS.length - 1);
    this.page = STOPS[this.stop].page;
  }

  /**
   * Where the camera is right now as a fractional counter index (1.5 = halfway from the grill to
   * the fryer). The counter buttons track it, so they move with the view.
   */
  get viewPage(): number {
    const xs = STOPS.map((s) => s.x);
    if (this.camX <= xs[0]) return STOPS[0].page;
    for (let i = 1; i < xs.length; i++) {
      if (this.camX <= xs[i]) return STOPS[i - 1].page + ((this.camX - xs[i - 1]) / (xs[i] - xs[i - 1])) * (STOPS[i].page - STOPS[i - 1].page);
    }
    return STOPS[xs.length - 1].page;
  }

  /** The camera stops on a counter, left to right. */
  stopsOf(page: number): number[] {
    return STOPS.flatMap((s, i) => (s.page === page ? [i] : []));
  }

  /** The camera has arrived at its stop (labels over the counter wait for it). */
  get settled(): boolean {
    return Math.abs(this.camX - STOPS[this.stop].x) < 0.05 && this.dragOffset === 0;
  }

  /** A counter-local point (as the build code lays pages out) in world space. */
  world(page: number, x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(pageX(page) + x, y, z);
  }

  hit(ndc: THREE.Vector2): Hit | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    // Grill items before anything else but the zone buttons: they sit on top of everything.
    const items = this.grillItems.filter((g) => !g.held && !this.above(g));
    const p = this.grillPoint(ndc, 0.15);
    let best: GrillItem | null = null;
    let bestD = 0.62;
    for (const it of items) {
      const d = Math.hypot(p.x - (pageX(1) + it.x), p.z - it.z);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    // Cups on the drinks counter are picked by where they stand, like grill items.
    if (this.page === 0) {
      const c = this.cupAt(this.groundPoint(ndc, 0.5));
      if (c) return { type: "cup", idx: this.cups.indexOf(c) };
    }
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false).filter((h) => shown(h.object.userData.owner));
    const first = hits.length ? (hits[0].object.userData.hit as Hit) : null;
    // The zone buttons sit right in front of the plate: a tap on one is never a grab.
    if (first?.type === "zone") return first;
    // An open lid's handle stands up in front of the back rail: the pans behind it come first.
    if (first?.type === "handle" && !this.bays[first.idx].closed) {
      const pan = hits.find((h) => (h.object.userData.hit as Hit).type === "bin");
      if (pan) return pan.object.userData.hit as Hit;
    }
    if (best) return { type: "grillItem", item: best };
    if (this.page === 1) {
      const m = this.messAt(p.x - pageX(1), p.z);
      if (m >= 0) return { type: "mess", idx: m };
    }
    return first;
  }

  groundPoint(ndc: THREE.Vector2, y = 0): THREE.Vector3 {
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out);
    return out;
  }

  /** Light up this counter's trash slot (or turn every slot's light off). */
  highlightTrash(on: boolean): void {
    this.trashGlow.forEach((g, i) => {
      if (g) g.visible = on && i === this.page;
    });
  }
  private trashGlow: (THREE.Mesh | undefined)[] = [];

  /**
   * Where the first shown hit box matching `match` sits, world space: the tutorial's thumb points
   * at stations through these, so it follows them wherever the layout puts them.
   */
  proxyPoint(match: (h: Hit) => boolean): THREE.Vector3 | null {
    const m = this.hitMeshes.find((h) => match(h.userData.hit as Hit) && shown(h.userData.owner));
    return m ? m.getWorldPosition(new THREE.Vector3()) : null;
  }

  /** Where a cup stands under nozzle i, world space (the tutorial's thumb). */
  tapCupPoint(i: number): THREE.Vector3 {
    return new THREE.Vector3(this.taps[i].x, CUP_Y + 0.5, CUP_Z);
  }

  /** The middle of the trash slot on the current counter, world space (for the playtest bot). */
  trashPoint(): THREE.Vector3 {
    return this.world(this.page, 0, 0, (TRASH.z0 + TRASH.z1) / 2);
  }

  /** True when a dropped item at this world point lands in the trash slot. */
  overTrash(world: THREE.Vector3): boolean {
    return world.z > TRASH.z0 - 0.05 && Math.abs(world.x - pageX(this.page)) < TRASH_HALF + 0.6 && world.x > TRASH_X0() - 0.3 && world.x < TRASH_X1() + 0.3;
  }

  /** Grill-local position if the world point is over the grill plate. */
  overGrill(world: THREE.Vector3): { x: number; z: number } | null {
    if (this.middle === "press" || this.middle === "oven") return null;
    const x = world.x - pageX(1);
    const { x0, x1, z0, z1 } = GRILL_BOUNDS;
    if (x < x0 - 0.3 || x > x1 + 0.3 || world.z < z0 - 0.5 || world.z > z1 + 0.4) return null;
    return { x: THREE.MathUtils.clamp(x, x0, x1), z: THREE.MathUtils.clamp(world.z, z0, z1) };
  }

  addGrillItem(piece: Piece, x: number, z: number, topping?: Piece, onto: GrillItem | null = null): GrillItem {
    const obj = makeFood(piece, "top");
    obj.scale.setScalar(GRILL_SCALE);
    this.scene.add(obj);
    if (onto) [x, z] = [onto.x, onto.z];
    const item: GrillItem = { piece, obj, x, z, flipT: -1, squash: 0, squashV: 4, smoke: 0, held: false, topping: null, below: onto };
    this.grillItems.push(item);
    if (topping) this.addTopping(item, topping);
    this.placeItem(item);
    return item;
  }

  /** Where an item sits: on the grill top, or on the item it's stacked on. */
  private baseY(it: GrillItem): number {
    if (it.below) return this.baseY(it.below) + (it.below.obj.userData.height as number) * GRILL_SCALE;
    return this.grillTopAt(it.x);
  }
  /**
   * The height food rests at on the grill at page-local x: the plate, or on the grille (the grill's
   * left zone) the tops of its bars, so a rasher or a bun isn't cut through by them. Drops and hit
   * tests on the grill use the same height.
   */
  grillTopAt(x: number): number {
    const z = GRILL_ZONES[GRILLE_ZONE];
    return this.middle === "grill" && x >= z.x0 && x <= z.x1 ? GRILL_TOP + GRILLE_LIFT : GRILL_TOP;
  }
  /** Where a pointer meets the grill's cook surface (at the grille's bar tops over the grille), plus `dy`. */
  grillPoint(ndc: THREE.Vector2, dy = 0): THREE.Vector3 {
    const p = this.groundPoint(ndc, GRILL_TOP + dy);
    const y = this.grillTopAt(p.x - pageX(1));
    return y === GRILL_TOP ? p : this.groundPoint(ndc, y + dy);
  }
  private placeItem(it: GrillItem): void {
    it.obj.position.set(pageX(1) + it.x, this.baseY(it), it.z);
  }

  /** The item stacked on this one, if any. */
  above(it: GrillItem): GrillItem | null {
    return this.grillItems.find((g) => g.below === it) ?? null;
  }

  /** How many pieces are in the stack this item is the top of. */
  stackSize(it: GrillItem): number {
    let n = 1;
    for (let b = it.below; b; b = b.below) n++;
    return n;
  }

  /** Can this piece go on top of that grill item? Buns on buns, patties on patties, up to GRILL_STACK_MAX. */
  canStack(onto: GrillItem, piece: Piece): boolean {
    return STACKS.has(piece.kind) && onto.piece.kind === piece.kind && !onto.topping && onto.flipT < 0 && !this.above(onto) && this.stackSize(onto) < GRILL_STACK_MAX;
  }

  /** Grill item under a world point (the top of a stack), if any. */
  grillItemAt(world: THREE.Vector3): GrillItem | null {
    const x = world.x - pageX(1);
    let best: GrillItem | null = null;
    let bestD = 0.5;
    for (const it of this.grillItems) {
      if (it.held || this.above(it)) continue;
      const d = Math.hypot(it.x - x, it.z - world.z);
      if (d < bestD) [best, bestD] = [it, d];
    }
    return best;
  }

  /** Lay a cheese slice on a patty so it melts. Only one slice per patty, and not mid-flip. */
  addTopping(item: GrillItem, piece: Piece): boolean {
    if (item.piece.kind !== "patty" || item.topping || item.flipT >= 0 || piece.kind !== "cheese") return false;
    const obj = makeFood(piece, "top");
    obj.position.y = stackHeight(item.piece, "top");
    item.obj.add(obj);
    item.topping = { piece, obj };
    return true;
  }

  /** Press a patty flat. Only fresh patties can be smashed. */
  smash(item: GrillItem): boolean {
    const p = item.piece;
    if (p.kind !== "patty" || p.smashed || item.topping || item.flipT >= 0 || p.cook[0] > 0.35) return false;
    p.smashed = true;
    this.scene.remove(item.obj);
    disposeObject(item.obj);
    const obj = makeFood(p, "top");
    obj.scale.setScalar(GRILL_SCALE);
    obj.position.copy(item.obj.position);
    this.scene.add(obj);
    item.obj = obj;
    item.squash = 0;
    item.squashV = 12;
    return true;
  }

  /** Take the cheese slice off a patty (undo). */
  removeTopping(item: GrillItem): void {
    if (!item.topping) return;
    item.obj.remove(item.topping.obj);
    disposeObject(item.topping.obj);
    item.topping = null;
  }

  removeGrillItem(item: GrillItem): void {
    this.scene.remove(item.obj);
    disposeObject(item.obj);
    // Anything stacked on it drops down onto what it stood on.
    const up = this.above(item);
    if (up) up.below = item.below;
    this.grillItems = this.grillItems.filter((g) => g !== item);
  }

  /**
   * Flip an item over: patties and bacon to cook evenly (and show the grill marks), eggs to make
   * them over easy. Buns toast cut side down and don't flip; nothing under a stack or a cheese
   * slice flips.
   */
  flip(item: GrillItem): boolean {
    if (item.flipT >= 0 || item.held || item.topping || this.above(item)) return false;
    if (item.piece.kind === "bun") return false;
    // An open tortilla with something on it would spill: fold it first.
    if (TORTILLAS.has(item.piece.kind) && item.piece.fill?.length && !item.piece.folded) return false;
    item.flipT = 0;
    return true;
  }

  /** Egg left on the grille: a mess to rub off. */
  messes: Mess[] = [];
  addMess(x: number, z: number): void {
    const g = new THREE.Group();
    const white = mesh(faceted(new THREE.CircleGeometry(0.36, 9)), "#f3efe2", { ink: false, shadow: false });
    white.rotation.x = -Math.PI / 2;
    white.scale.set(1.2, 0.85, 1);
    const yolk = mesh(faceted(new THREE.CircleGeometry(0.17, 8)), "#f2a51e", { ink: false, shadow: false });
    yolk.rotation.x = -Math.PI / 2;
    yolk.position.set(0.12, 0.004, 0.05);
    yolk.scale.set(1.5, 0.8, 1);
    const smear = mesh(faceted(new THREE.CircleGeometry(0.2, 7)), "#e9c869", { ink: false, shadow: false });
    smear.rotation.x = -Math.PI / 2;
    smear.position.set(-0.3, 0.002, -0.12);
    g.add(white, yolk, smear);
    g.position.set(pageX(1) + x, GRILL_TOP + 0.03, z);
    g.rotation.y = Math.random() * 6;
    this.scene.add(g);
    this.messes.push({ x, z, amount: 1, obj: g });
  }
  /** Rub a mess: it fades and shrinks; gone at 0. Returns true when it's just been cleaned. */
  rubMess(i: number, by: number): boolean {
    const m = this.messes[i];
    if (!m) return false;
    m.amount = Math.max(0, m.amount - by);
    m.obj.scale.setScalar(0.4 + 0.6 * m.amount);
    if (m.amount > 0) return false;
    this.scene.remove(m.obj);
    disposeObject(m.obj);
    this.messes.splice(i, 1);
    return true;
  }
  /** The mess under a page-local grill point, or -1. */
  messAt(x: number, z: number): number {
    return this.messes.findIndex((m) => Math.hypot(m.x - x, m.z - z) < 0.55);
  }

  /** Show something following the player's finger in the counter scene. */
  setHeld(obj: THREE.Object3D | null): void {
    if (this.held && this.held !== obj) {
      this.scene.remove(this.held);
      disposeObject(this.held);
    }
    this.held = obj;
    if (obj && !obj.parent) this.scene.add(obj);
  }

  /**
   * Hold the carried thing under the finger. It hovers HELD_LIFT above the counter, at the point of
   * that height under the finger (not lifted straight up from the drop point), so on screen it sits
   * exactly where it will land and doesn't jump when it's let go.
   */
  moveHeld(ndc: THREE.Vector2 | null): void {
    if (!this.held) return;
    this.held.visible = !!ndc;
    if (ndc) this.held.position.copy(this.groundPoint(ndc, HELD_LIFT));
  }

  /**
   * Lift a sauce out of the caddy (or put it back with null). Only one is in hand at a time; it
   * stays out until it's put back, so the bottle can be squeezed over any burger.
   */
  liftSauce(kind: SauceKind | null): void {
    this.inHand = kind;
    for (const [k, b] of Object.entries(this.bottles)) b.visible = k !== kind;
    this.pointSauce(null);
  }
  inHand: SauceKind | null = null;
  private handBottle: THREE.Object3D | null = null;

  /** The bottle in hand over a world point on the counter (while it's dragged up to the trays), or out of view. */
  pointSauce(world: THREE.Vector3 | null): void {
    if (this.handBottle && (!world || this.handBottle.userData.kind !== this.inHand)) {
      this.scene.remove(this.handBottle);
      disposeObject(this.handBottle);
      this.handBottle = null;
    }
    if (!world || !this.inHand) return;
    if (!this.handBottle) {
      this.handBottle = this.sauceBottle(this.inHand);
      this.handBottle.userData.kind = this.inHand;
      this.scene.add(this.handBottle);
    }
    this.handBottle.position.copy(world);
  }

  /** A sauce bottle hanging nozzle down, its origin at the nozzle tip. */
  sauceBottle(kind: SauceKind): THREE.Object3D {
    return makeSauceBottle(kind);
  }

  /** Where the sauce caddy stands, for the in-hand mask. */
  caddyPoint(): THREE.Vector3 {
    const c = this.middle === "press" ? this.pressCaddy : this.middle === "comal" ? this.comalCaddy ?? this.caddy : this.middle === "oven" ? this.ovenCaddy ?? this.caddy : this.caddy;
    return c.position.clone().setY(0.8);
  }

  /** Where a basket's fry meter sits: in its window on the fryer's back panel. */
  fryTagPoint(i: number): THREE.Vector3 {
    const m = this.fryerSpots.meters[i];
    return this.fryer.position.clone().add(new THREE.Vector3(m.x, m.y, m.z));
  }

  get pageCount(): number {
    return PAGES.length;
  }

  sizzleLevel(): number {
    const on = this.grillItems.filter((g) => !g.held && !g.below && g.flipT < 0);
    const pressing = this.middle === "press" ? this.bays.filter((b) => b.closed && b.layers.length).length : 0;
    // Pies in the oven don't sizzle (playtest #84: a grill's hiss over the oven was grating); see ovenLevel.
    return on.filter((g) => this.heatOf(g) === "hot").length * 0.35 + on.filter((g) => this.heatOf(g) === "warm").length * 0.08 + pressing * 0.3;
  }

  /** The deck oven's faint roar and crackle, 0..1: a little for a lit oven, more with pies in it. */
  ovenLevel(): number {
    if (this.middle !== "oven") return 0;
    const baking = this.ovenSpots.filter((s, i) => i < this.ovenCount && s.layers.length).length;
    return Math.min(1, 0.25 + baking * 0.25);
  }

  /** Which grill zone a page-local x is over (nearest at the ends). */
  zoneAt(x: number): number {
    const i = GRILL_ZONES.findIndex((z) => x < z.x1);
    return i < 0 ? GRILL_ZONES.length - 1 : i;
  }

  /** The setting of the zone a grill item sits in. */
  heatOf(g: GrillItem): ZoneHeat {
    return this.zones[this.zoneAt(g.x)];
  }

  /** Push a zone's button: off, warm, hot, then off again. Returns the new setting. */
  cycleZone(i: number): ZoneHeat {
    this.zones[i] = ZONE_HEATS[(ZONE_HEATS.indexOf(this.zones[i]) + 1) % ZONE_HEATS.length];
    this.zonePush[i] = 0;
    return this.zones[i];
  }

  /** A grill item's tag hangs below it, but never further forward than this (world z), so it clears the zone buttons. */
  readonly grillTagZ = GRIDDLE.z + GRIDDLE_SURFACE.z1 - 0.45;

  /** Places for a patty down the middle of a zone, back to front, page-local (for the playtest bot). */
  zoneSpots(i: number): { x: number; z: number }[] {
    const z = GRILL_ZONES[i];
    const { z0, z1 } = GRILL_BOUNDS;
    return [0, 1, 2].map((k) => ({ x: (z.x0 + z.x1) / 2, z: z0 + 0.1 + ((z1 - z0 - 0.2) * k) / 2 }));
  }

  /** The middle of a zone's cook surface, world space, for hints and the playtest bot. */
  zonePoint(i: number): THREE.Vector3 {
    const z = GRILL_ZONES[i];
    return this.world(1, (z.x0 + z.x1) / 2, GRILL_TOP, GRIDDLE.z + (GRIDDLE_SURFACE.z0 + GRIDDLE_SURFACE.z1) / 2);
  }

  bubbleLevel(): number {
    return this.baskets.filter((b) => b.loaded && b.down).length * 0.6;
  }

  pouring(): number {
    return this.taps.some((t) => t.pouring) ? 1 : 0;
  }

  update(dt: number): void {
    this.time += dt;
    tickTacos(dt);
    this.placeKnife(dt);
    // Camera glides between stops along the window line.
    const stop = STOPS[this.stop];
    this.camX += (stop.x + this.dragOffset - this.camX) * Math.min(1, dt * 10);
    this.camera.position.set(this.camX, CAM_H, LOOK_Z + CAM_BACK);
    this.camera.lookAt(this.camX, 0, LOOK_Z);
    // The sun follows the camera so shadows stay sharp on whichever counter is in view.
    this.light.aim(this.camX, LOOK_Z);

    // Grill
    const gx = pageX(1);
    let anyBurning = false;
    let anyDone = false;
    for (const it of this.grillItems) {
      if (it.held) continue;
      const y0 = this.baseY(it);
      if (it.flipT >= 0) {
        it.flipT += dt / 0.55;
        const t = Math.min(1, it.flipT);
        it.obj.position.set(gx + it.x, y0 + 1.5 * Math.sin(Math.PI * t), it.z);
        it.obj.rotation.set(Math.PI * t, 0, 0);
        if (it.flipT >= 1) {
          it.flipT = -1;
          it.obj.rotation.set(0, 0, 0);
          flipFaces(it.piece);
          it.squashV = 6;
        }
      } else {
        // Each zone cooks at its own setting: hot cooks, warm holds without cooking, off stops.
        // Only the bottom of a stack touches the grill.
        const zi = this.zoneAt(it.x);
        const zone = this.zones[zi];
        // Warm holding (after build #78): cooked food parked on the warm end ages at half the tray's
        // pace (WARM_AGE), food left on a cold zone at the tray's; the heat lamp halves both.
        if (zone !== "hot" && goesStale(it.piece)) it.piece.held = (it.piece.held ?? 0) + dt * (zone === "warm" ? WARM_AGE : 1) * this.holdRate;
        const touching = !it.below;
        const heat = touching ? ZONE_RATE[zone] * (COOK_SPEED[it.piece.kind] ?? 1) * (it.piece.smashed ? 1.6 : 1) * this.grillBoost : 0;
        const before = cookLevel(it.piece);
        // What's on a tortilla: cheese melts while it's on the heat, faster once it's folded over.
        if (it.piece.fill?.length) {
          const rate = zone === "hot" ? (it.piece.folded ? QUESO_MELT.folded : QUESO_MELT.open) : zone === "warm" ? QUESO_MELT.warm : 0;
          for (const f of it.piece.fill) if (f.kind === "jack") f.melt = Math.min(1, (f.melt ?? 0) + rate * this.grillBoost * dt);
        }
        if (it.topping) {
          const c = it.topping.piece;
          c.melt = Math.min(1, (c.melt ?? 0) + (zone === "hot" ? MELT_RATE.hot : zone === "warm" ? MELT_RATE.warm : 0) * dt);
          it.topping.obj.userData.update(c);
        }
        const was: [number, number] = [it.piece.cook[0], it.piece.cook[1]];
        grillStep(it.piece, heat, dt);
        slowPastOver(it.piece, was, this.burnPace);
        // The ridged grille sears marks into the face down.
        if (touching && this.middle === "grill" && zi === GRILLE_ZONE && zone === "hot" && it.piece.kind === "patty") {
          const m = (it.piece.marks ??= [0, 0]);
          m[0] = Math.min(1, m[0] + MARK_RATE * dt);
        }
        it.obj.position.set(gx + it.x, y0, it.z);
        const k = it.piece.kind as Cookable;
        if (COOK_SCALE[k] && cookLevel(it.piece) > COOK_SCALE[k].burnt - 0.05 && before <= COOK_SCALE[k].burnt - 0.05) anyBurning = true;
        if (COOK_SCALE[k] && cookLevel(it.piece) >= COOK_SCALE[k].done && before < COOK_SCALE[k].done) anyDone = true;
        if (COOK_SCALE[k] && cookLevel(it.piece) >= COOK_SCALE[k].perfect - 0.04 && before < COOK_SCALE[k].perfect - 0.04) this.sparkle(it.obj.getWorldPosition(new THREE.Vector3()));
      }
      it.squashV += (-160 * it.squash - 12 * it.squashV) * dt;
      it.squash += it.squashV * dt;
      const s = THREE.MathUtils.clamp(it.squash * 0.07, -0.3, 0.3);
      it.obj.scale.set(GRILL_SCALE * (1 + s * 0.4), GRILL_SCALE * (1 - s), GRILL_SCALE * (1 + s * 0.4));
      it.obj.userData.update(it.piece);
    }
    // Press: a closed bay cooks everything in it, both faces at once.
    const smokes: { x: number; z: number; y: number; cook: number; light?: boolean }[] = [];
    if (this.middle === "press") {
      for (let i = 0; i < this.bayCount; i++) {
        const b = this.bays[i];
        b.moved += dt;
        b.open += ((b.closed ? 0 : 1) - b.open) * Math.min(1, dt * 11);
        if (Math.abs(b.open - (b.closed ? 0 : 1)) < 0.002) b.open = b.closed ? 0 : 1;
        // A refused close: the lid starts down, then bounces back up twice.
        let dip = 0;
        if (b.shake) {
          b.shake = Math.max(0, b.shake - dt);
          const k = b.shake / SHAKE_S;
          dip = 0.16 * k * Math.abs(Math.sin((1 - k) * Math.PI * 3));
        }
        b.obj.userData.setOpen(b.open - dip);
        this.placeHandle(b);
        const pressing = b.closed && b.open < 0.2 && b.layers.length > 0;
        let melted = false;
        if (pressing) {
          const sandwich = b.layers.length > 1;
          for (const l of b.layers) {
            const p = l.piece;
            const k = p.kind;
            const before = cookLevel(p);
            if (BREADS.has(k) || PROTEINS.has(k)) {
              const was: [number, number] = [p.cook[0], p.cook[1]];
              const r = PRESS_RATE * (PRESS_SPEED[k] ?? 0.3) * (PROTEINS.has(k) && sandwich ? PRESS_INSIDE : 1) * this.grillBoost * dt;
              p.cook[0] += r;
              p.cook[1] += r;
              slowPastOver(p, was, this.burnPace);
              const sc = COOK_SCALE[k as Cookable];
              if (sc && before < sc.done && cookLevel(p) >= sc.done) anyDone = true;
              if (sc && before <= sc.burnt - 0.05 && cookLevel(p) > sc.burnt - 0.05) anyBurning = true;
            } else if (PRESS_CHEESE.has(k)) {
              p.melt = Math.min(1, (p.melt ?? 0) + PRESS_MELT * this.grillBoost * dt);
              if (p.melt >= 0.5) melted = true;
            } else p.cook[0] = Math.min(1, p.cook[0] + PRESS_WARM * dt);
          }
          const r = this.bayReading(b);
          smokes.push({ x: pageX(1) + b.x, z: b.z + PLATE.z, y: PLATE.y + CLOSED_GAP + 0.3, cook: r ? cookLevel(r) : 0 });
        }
        if (b.lit !== pressing) b.obj.userData.setLamp((b.lit = pressing));
        const ooze = melted && b.open < 0.05;
        if (b.oozing !== ooze) b.obj.userData.setOoze((b.oozing = ooze));
        // Redraw what's in the bay as it cooks, squeezed flat under a closing lid.
        this.syncFood(b, b.obj.position.clone().add(b.obj.userData.food));
        if (b.food) {
          b.food.children.forEach((c, j) => (c as FoodObject).userData.update?.(b.layers[j].piece));
          const h = (b.food.userData.h as number) || 0.1;
          const fit = Math.min(1, (CLOSED_GAP - 0.03) / h);
          const lidDown = 1 - Math.min(1, b.open * 2.2);
          b.food.scale.set(GRILL_SCALE, GRILL_SCALE * (1 - (1 - fit) * lidDown), GRILL_SCALE);
        }
      }
    }
    // Oven: each pie bakes, the half facing the hot back wall at twice the pace; the peel nudges it round.
    if (this.middle === "oven") {
      this.oven.userData.tick(this.time);
      this.updatePeel(dt);
      for (let i = 0; i < this.ovenCount; i++) {
        const s = this.ovenSpots[i];
        const d = s.layers[0]?.piece;
        if (!d) continue;
        if (d.kind === "dough") {
          const before = cookLevel(d);
          const top = Math.max(...d.cook);
          // The hot side running too far ahead of the other scorches it (warned once per run).
          const scorching = bakeStep(d, dt, this.ovenBoost * (darkSide(d) >= COOK_SCALE.dough.over ? this.burnPace : 1));
          if (scorching && !s.warned) {
            s.warned = true;
            anyBurning = true;
          }
          for (const l of s.layers.slice(1)) bakeTopping(l.piece, dt, OVEN_CHEESE.has(l.piece.kind), this.ovenBoost);
          const sc = COOK_SCALE.dough;
          if (before < sc.done && cookLevel(d) >= sc.done) anyDone = true;
          if (top <= sc.burnt - 0.05 && Math.max(...d.cook) > sc.burnt - 0.05) anyBurning = true;
          // No fire, no smoke: only a pie that's scorching or going too far gives off a wisp.
          if (scorching || Math.max(...d.cook) > sc.over) smokes.push({ x: pageX(1) + s.x, z: s.z, y: HEARTH.y + 0.25, cook: Math.max(...d.cook), light: Math.max(...d.cook) < sc.burnt });
        }
        this.syncFood(s, this.world(1, s.x, HEARTH.y, s.z));
        if (s.food) {
          this.updatePie(s);
          const fb = s.food.userData.pie as FlatbreadObject | undefined;
          if (fb) fb.rotation.y = pieYaw(d);
          s.lift += (this.peelOver(s) - s.lift) * (1 - Math.exp(-dt * 20));
          s.food.position.y = HEARTH.y + s.lift * (PEEL.y + 0.01);
        }
      }
      const r = this.rest;
      if (r.food) {
        const fb = r.food.userData.pie as FlatbreadObject | undefined;
        const d = r.layers[0]?.piece;
        if (fb && d) fb.rotation.y = pieYaw(d);
        r.food.position.y = this.restTop + this.peelOver(r) * (PEEL.y + 0.01);
      }
      if (this.peel.food) {
        const fb = this.peel.food.userData.pie as FlatbreadObject | undefined;
        const d = this.peel.layers[0]?.piece;
        if (fb && d) fb.rotation.y = pieYaw(d);
      }
      this.updatePie(this.peel);
      this.updatePie(r);
    }
    if (anyBurning) this.events.burning();
    if (anyDone) this.events.done(1);

    // Smoke: puffs drift up from cooking items (and closed press bays); darker when burning.
    const active = this.grillItems.filter((g) => !g.held && !g.below && g.flipT < 0 && this.heatOf(g) === "hot");
    // A warming tortilla only gives off a thin wisp; meat and a burning anything smoke properly.
    for (const it of active) smokes.push({ x: gx + it.x, z: it.z, y: GRILL_TOP + 0.3, cook: it.piece.cook[0], light: it.piece.kind === "corn" || it.piece.kind === "flour" });
    const shown = this.zones.join();
    if (this.zonesShown !== shown) {
      this.zones.forEach((z, i) => this.griddle.userData.setZone(i, z));
      this.zonesShown = shown;
    }
    // A pushed button dips in and springs back.
    this.zonePush.forEach((t, i) => {
      if (t > 0.3) return;
      this.zonePush[i] = t + dt;
      this.griddle.userData.pressButton(i, Math.sin(Math.PI * Math.min(1, this.zonePush[i] / 0.22)));
    });
    this.puffs.forEach((m, i) => {
      const it = smokes[i % Math.max(1, smokes.length)];
      m.userData.t += dt * 0.5;
      if (!it) {
        m.visible = false;
        return;
      }
      if (m.userData.t > 1) {
        m.userData.t -= 1;
        m.userData.ox = (Math.random() - 0.5) * 0.9;
        m.userData.oz = (Math.random() - 0.5) * 0.7;
      }
      const t = m.userData.t;
      const burnt = it.cook > 0.95;
      m.visible = true;
      // Rise about 2.2 units, growing 0.6 -> 2.4 times, drifting side to side as it goes.
      m.position.set(it.x + (m.userData.ox ?? 0) + Math.sin(t * 5 + i) * 0.12 * (0.3 + t), it.y + t * 2.2, it.z + (m.userData.oz ?? 0));
      m.scale.setScalar(0.24 * (0.6 + t * 1.8));
      const mat = m.material;
      mat.color.set(burnt ? "#6b5d55" : "#fff6e8");
      mat.opacity = (burnt ? 0.4 : it.light ? 0.1 : 0.22) * Math.sin(Math.PI * t) * Math.min(1, it.cook * 4);
    });
    // Grease spits off meat on a hot zone: a dot pops out and fades within a quarter second.
    const sizzling = active.filter((g) => (g.piece.kind === "patty" || g.piece.kind === "bacon") && g.piece.cook[0] < 0.95).map((g) => ({ x: gx + g.x, z: g.z, y: GRILL_TOP + 0.3 }));
    for (const m of this.spits) {
      const u = m.userData as { life: number; v: THREE.Vector3 };
      if (u.life > 0) {
        u.life -= dt;
        m.position.addScaledVector(u.v, dt);
        u.v.y -= 9 * dt;
        m.material.opacity = Math.max(0, u.life / 0.25);
        m.visible = u.life > 0;
      } else if (sizzling.length && Math.random() < dt * 2.2) {
        const it = sizzling[Math.floor(Math.random() * sizzling.length)];
        const a = Math.random() * Math.PI * 2;
        u.life = 0.25;
        u.v.set(Math.cos(a) * 1.4, 2.2 + Math.random() * 1.2, Math.sin(a) * 1.0);
        m.position.set(it.x + Math.cos(a) * 0.35, it.y - 0.15, it.z + Math.sin(a) * 0.3);
        m.visible = true;
      } else m.visible = false;
    }

    // The perfect-star: pops up to full size and back in 0.3 s, turning a little.
    for (const m of this.sparkles) {
      if (m.userData.life <= 0) continue;
      m.userData.life -= dt;
      const k = 1 - Math.max(0, m.userData.life) / 0.3;
      m.scale.setScalar(0.55 * Math.sin(Math.PI * Math.min(1, k)));
      m.material.rotation = k * 0.9;
      m.visible = m.userData.life > 0;
    }
    // Idle oil: little rings open and fade on a well with no basket down.
    for (const m of this.oilRings) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const b = this.baskets[m.userData.well];
      const idle = !!b && !(b.down && b.loaded);
      if (m.userData.life > 0) {
        m.userData.life -= dt;
        const k = 1 - Math.max(0, m.userData.life) / 0.7;
        m.scale.setScalar(0.6 + k * 1.4);
        mat.opacity = 0.55 * (1 - k);
        m.visible = m.userData.life > 0;
      } else if (idle && this.fryer.visible && Math.random() < dt * 1.2) {
        const w = this.fryer.userData.spots.wells[m.userData.well];
        m.userData.life = 0.7;
        m.position.x = w.x + (Math.random() - 0.5) * 1.0;
        m.position.z = w.z + (Math.random() - 0.5) * 1.2;
        m.visible = true;
      } else m.visible = false;
    }

    // Warm holding: tacos in the rack age at half the tray's pace; fries in a carton go soggy.
    if (this.middle === "comal") ageLayers(this.rack.layers, dt, WARM_AGE * this.holdRate);
    for (const pk of this.packs) if (pk.size && pk.fill > 0) pk.held += dt * this.holdRate;

    // Fryer
    for (let i = 0; i < this.baskets.length; i++) {
      const b = this.baskets[i];
      const inOil = b.down && b.loaded;
      // Lowered baskets sit level in the oil; lifted ones hang tilted on the rail to drain.
      b.t += ((inOil ? 1 : 0) - b.t) * Math.min(1, dt * 8);
      b.obj.position.lerpVectors(b.up, b.downAt, b.t);
      b.obj.position.y += inOil ? Math.sin(this.time * 18) * 0.015 : 0;
      b.obj.rotation.x = b.tilt * (1 - b.t);
      b.fries.visible = b.loaded && !b.shell;
      const bub = this.fryer.userData.bubbles[i];
      bub.visible = inOil && b.t > 0.85;
      if (bub.visible) {
        bub.scale.set(1, 0.6 + 0.4 * Math.abs(Math.sin(this.time * 9 + i)), 1);
        bub.rotation.y = Math.sin(this.time * 2.3 + i) * 0.12;
      }
      if (b.shell) {
        // A tostada shell: fries flat in the basket, both sides at once.
        const sh = b.shell;
        if (inOil) {
          const before = cookLevel(sh);
          const r = FRY_RATE * this.fryBoost * FRY_SPEED.tostada * dt;
          const was: [number, number] = [sh.cook[0], sh.cook[1]];
          sh.cook[0] += r;
          sh.cook[1] += r;
          slowPastOver(sh, was, this.burnPace);
          const sc = COOK_SCALE.tostada;
          if (before < sc.done && cookLevel(sh) >= sc.done) this.events.done(2);
          if (before < sc.perfect - 0.04 && cookLevel(sh) >= sc.perfect - 0.04) {
            this.events.golden();
            this.sparkle(b.obj.getWorldPosition(new THREE.Vector3()));
          }
          if (cookLevel(sh) >= sc.perfect - 0.04) {
            b.beepT -= dt;
            if (b.beepT <= 0) {
              this.events.beep();
              b.beepT = cookLevel(sh) >= sc.over ? 0.4 : 0.75;
            }
          }
        } else b.beepT = 0;
        if (b.shellObj) b.shellObj.userData.update(sh);
        continue;
      }
      // Fries hanging out of the oil go soggy (warm holding); back in the oil they crisp up again.
      if (inOil) b.held = 0;
      else if (b.loaded && b.cook > 0.15) b.held += dt * this.holdRate;
      if (inOil) {
        const before = b.cook;
        const zone = FRY_ZONE[b.fry];
        const perfect = fryPerfect(b.fry);
        b.cook = slowPastOverValue(before, b.cook + FRY_RATE * this.fryBoost * FRY_SPEED[b.fry] * dt, zone.over, this.burnPace);
        if (before < zone.done && b.cook >= zone.done) this.events.done(2);
        if (!b.goldenRung && b.cook >= perfect - 0.04) {
          b.goldenRung = true;
          this.events.golden();
          this.sparkle(b.obj.getWorldPosition(new THREE.Vector3()));
        }
        // Beep from perfect on, quicker once they're overdone, until the basket comes up.
        if (b.cook >= perfect - 0.04) {
          b.beepT -= dt;
          if (b.beepT <= 0) {
            this.events.beep();
            b.beepT = b.cook >= zone.over ? 0.4 : 0.75;
          }
        }
      } else b.beepT = 0;
      if (b.loaded) {
        b.fries.userData.setFry(b.fry);
        b.fries.userData.setCook(b.cook);
        b.fries.userData.setAmount?.(b.amount);
      }
    }

    // Drinks
    for (const t of this.taps) {
      const c = t.cup;
      if (t.pouring && c) {
        c.fill += dt * 0.42 * CUP_SPEED[c.size];
        if (this.autoStopPour && c.fill >= DRINK_FILL.perfect) {
          t.pouring = false;
          if (this.autoLid && !c.lid) {
            this.dressCupAt(c, "lid");
          }
        }
        if (c.fill > 1) {
          // Overflow: the cup stays full, the rest goes on the drip tray and costs money.
          if (t.spill <= 0) this.events.spill();
          c.fill = 1;
          t.spill = 1;
          t.puddle = Math.min(1, t.puddle + dt * 0.7);
          this.spillCost += dt * SPILL_COST;
        }
        c.obj.userData.setFill(c.fill);
      }
      t.stream.visible = t.pouring && !!c;
      if (c && t.stream.visible) {
        const topY = CUP_Y + cupSurfaceY(c.size, Math.min(1, c.fill)) * CUP_AT_TAP;
        const h = Math.max(0.05, STREAM_TOP - topY);
        t.stream.scale.set(1, h, 1);
        t.stream.position.set(t.x, topY + h / 2, STREAM_Z);
      }
      t.spill = Math.max(0, t.spill - dt * 2);
      if (c) c.obj.rotation.z = Math.sin(this.time * 40) * 0.05 * t.spill;
      t.puddleObj.visible = t.puddle > 0.01;
      t.puddleObj.scale.setScalar((0.35 + 0.75 * t.puddle) * (1 + (PUDDLE_GROW - 1) * t.puddle));
    }
  }
}
