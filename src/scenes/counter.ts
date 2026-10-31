import * as THREE from "three";
import { FRIES_PERFECT, FRY_RATE, GRILL_RATE, MELT_RATE } from "../game/cooking";
import type { DrinkId, FriesSize, Kind, Layer, Piece, SauceKind, Size } from "../game/types";
import { CUP_SPEED, DRINKS } from "../game/types";
import { counterTop, wallPanels } from "../render/wear";
import { makePaperRoll, makeTowel, makeUtensilCrock } from "../render/props";
import { cupSurfaceY, makeCarton, makeCartonStack, makeCup, makeFood, makeFries, makeFryPile, stackHeight, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { dressCup } from "../render/cup";
import { FREEZER, makeCurdHandful, makeCurdTub, makeFreezer, makeGravyPot, makeLadle, makeShaker } from "../render/fryer";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { makeGriddle, type GriddleObject } from "../render/machines/griddle";
import { makePrepUnit } from "../render/machines/coldRail";
import { makeSauceBottle, makeSauceCaddy, type SauceCaddyObject } from "../render/machines/sauces";
import { makeWarmShelf } from "../render/machines/warmShelf";
import { makeDrinkTower, makeFountain, makeFryBasket, makeFryer, makeLidStrawCaddy, makePackPad, makeSleeve, makeTrashChute, makeWireRack, FRY_BASKET, type FryerObject } from "../render/machines";
import { applyKitchenLight, KITCHEN_BG, type KitchenLight } from "../render/lighting";
import { SCALE } from "../render/units";
import { PlateView } from "./tray";

export const PAGES = ["Drinks", "Grill", "Fryer", "Supplies"] as const;
export const HOME_PAGE = 1;
/**
 * The window line: drinks, grill and fryer run along the serving window, facing it, so the tray
 * above the counter really is the window ledge. Supplies sit on the back wall behind the fryer,
 * and the camera turns round to look at them. Page centres in world x:
 */
const PAGE_CX = [-14, 0, 15, 16.5];
export const pageX = (i: number) => PAGE_CX[i];
/** One zoom for every page: about 9 units (1.35 m) across the middle, which fits the grill page front to back. */
const VIEW_W = 9.0;
/**
 * Camera stops. Every counter gets one, except the long fryer line, which gets two half a page
 * apart so its ends aren't cut off (the same zoom everywhere keeps food one size).
 */
export const STOPS: readonly { page: number; x: number; turned?: boolean }[] = [
  { page: 0, x: pageX(0) },
  { page: 1, x: pageX(1) },
  { page: 2, x: pageX(2) - 1.5 },
  { page: 2, x: pageX(2) + 1.5 },
  { page: 3, x: pageX(3), turned: true },
];
/** Camera height and how far behind the look point it hangs. */
const CAM_H = 12.6;
const CAM_BACK = 5.3;
/** Where the camera looks on the window line; the back wall's counter is a turn round from there. */
const LOOK_Z = -0.1;
/**
 * The supplies counter is built facing the other way, centred here, so that turning on the spot
 * (about the camera) looks straight at it. Page-local z maps to world z as SUPPLY_Z - z.
 */
const SUPPLY_Z = 2 * (LOOK_Z + CAM_BACK);

/**
 * One scale for food on the counter, against ingredient units: on the grill, in the hand and on
 * the warm-shelf plates. Keeping it the same everywhere means nothing grows or shrinks as it
 * moves between them. It's the study's per-category rule (burger parts at 1.5 times life size).
 */
export const FOOD_SCALE = SCALE.burger;
/** Grill items are drawn at the counter food scale. */
export const GRILL_SCALE = FOOD_SCALE;

/**
 * The grill page, "prep unit and lamp shelf": a 3 x 3 cold prep unit against the wall on the
 * left with the sauce caddy in front of it, the griddle front right, and the three hold plates
 * on a warm shelf over the griddle's back edge, in a row like the tray's plates above.
 */
const GRIDDLE = { x: 1.95, z: 0.8 };
const PREP = { x: -2.05, z: -1.4 };
const CADDY = { x: -2.05, z: 1.75 };
/** The warm shelf stands on legs this tall, behind the griddle's splash guard. */
const SHELF = { x: 1.95, z: -2.35, y: 0.9 };
/** The griddle's cook surface, griddle-local (read once from the model). */
const GRIDDLE_SURFACE = makeGriddle().userData.spots.surface;
export const GRILL_TOP = GRIDDLE_SURFACE.y;
const GRILL_CX = GRIDDLE.x;
const GRILL_BOUNDS = {
  x0: GRIDDLE.x + GRIDDLE_SURFACE.x0 + 0.4,
  x1: GRIDDLE.x + GRIDDLE_SURFACE.x1 - 0.4,
  z0: GRIDDLE.z + GRIDDLE_SURFACE.z0 + 0.4,
  z1: GRIDDLE.z + GRIDDLE_SURFACE.z1 - 0.35,
};
/** The right end of the griddle can be turned down to a warm hold. */
export const WARM_X0 = GRIDDLE.x + GRIDDLE_SURFACE.warmX;
/** Trash slot running along the front edge of each counter. */
const TRASH = { z0: 3.05, z1: 3.5 };
/** Trash slot extent on each counter (page-local x): full width on the grill and fryer, right of the lid caddy on drinks. */
const TRASH_RAIL: Record<number, { x0: number; x1: number }> = { 0: { x0: -0.9, x1: 3.8 }, 1: { x0: -3.9, x1: 4.0 }, 2: { x0: -5.4, x1: 5.4 } };
/** Hold plates on the warm shelf, page-local, and the height of their tops. */
export const HOLD_SPOTS = [-1.3, 0, 1.3].map((dx) => ({ x: SHELF.x + dx, z: SHELF.z }));
const HOLD_Y = SHELF.y + 0.2;
/** Plate size on the warm shelf; the food on it is still drawn at FOOD_SCALE. */
const HOLD_SCALE = 0.6;

/**
 * Fryer page, "front pass", in page-local x and z. The fryer stands against the wall with the
 * freezer to its left and the poutine toppings to its right; the front strip by your thumb is
 * the pass: carton stacks on the left, packing pads on the right. Cooked fries always travel
 * down the screen, so lifting a basket (an upward flick) never looks like a carry. The line is
 * longer than one screen, so it has two camera stops.
 */
const FRYER = {
  fryer: { x: -0.4, z: -1.67 },
  freezer: { x: -4.1, z: -2.5 },
  stacks: [["S", -4.75], ["M", -3.6], ["L", -2.45]] as [FriesSize, number][],
  stackZ: 1.55,
  pads: { x: 2.1, z: 1.55 },
  // Salt, curds and gravy in a row along the wall, right of the fryer.
  shaker: { x: 2.2, z: -2.45 },
  curds: { x: 3.25, z: -2.45 },
  gravy: { x: 4.35, z: -2.45 },
};
/** One packing pad (the cream square inside its orange outline). */
const PAD = { w: 1.47, d: 1.07 };
/** A packing pad with nothing on it. */
export const EMPTY_PACK = { size: null, cook: 0, fill: 0, salt: false, curds: false, gravy: false } as const;
/** Cartons on the pads and in their stacks, against carton units. */
const PACK_SCALE = SCALE.fries;
const CARTON_STACK_SCALE = SCALE.fries;

/** A full stack of cups or cartons, and what a fresh sleeve from the Supplies counter refills it to. */
const STACK_START = 10;
export const SLEEVE = 10;

/**
 * Drinks page, "ice and drink tower": a slim tower at the left holds the cup tubes and the ice
 * lever, the fountain has the rest of the wall, and lids and straws share a caddy at the front.
 */
const TOWER = { x: -2.3, z: -2.35 };
const FOUNTAIN = { x: 1.95, z: -2.1 };
const LIDS = { x: -2.6, z: 1.9 };
const TOWER_SPOTS = makeDrinkTower().userData.spots;
const FOUNTAIN_SPOTS = makeFountain().userData.spots;
const LID_SPOTS = makeLidStrawCaddy().userData.spots;
/** Cups under the nozzles, against cup units. */
const CUP_AT_TAP = SCALE.cup;
export const CUP_IN_HAND = SCALE.cup;

/**
 * Supplies, on the back wall: a two-tier wire rack with a bay per size, cup sleeves on the low
 * front tier and paper-boat sleeves on the raised back tier. Nothing else, so every target on
 * the page has a job.
 */
const RACK = { x: 0, z: -0.6, w: 7.2 };
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
}

export interface Basket {
  loaded: boolean;
  cook: number;
  down: boolean;
  goldenRung: boolean;
  obj: THREE.Group;
  fries: FriesObject;
  /** 0 hanging on the rail, 1 down in the oil. */
  t: number;
  /** Share of a full batch still in the basket. */
  amount: number;
  /** Where the basket hangs on the rail (tilted to drain), and where it sits in the oil. */
  up: THREE.Vector3;
  downAt: THREE.Vector3;
  tilt: number;
}

/** A stack of empty cups or fries cartons. Once it runs out, a wrapped sleeve from the Supplies counter refills it. */
export interface Stack {
  kind: "cup" | "carton";
  size: Size;
  count: number;
  /** A wrapped sleeve is sitting here; `tear` counts the taps spent opening it. */
  sleeve: boolean;
  tear: number;
  obj: THREE.Group;
  x: number;
  z: number;
  /** Cups hang mouth down in the drink tower's tubes. */
  tube: boolean;
}

/** A spot at the front of the fryer where a carton waits to be filled. */
export interface Pack {
  size: FriesSize | null;
  cook: number;
  fill: number;
  salt: boolean;
  curds: boolean;
  gravy: boolean;
  obj: THREE.Object3D | null;
  x: number;
  z: number;
  /** Height of the pad's top. */
  y: number;
}

export interface Tap {
  flavor: DrinkId;
  fill: number;
  pouring: boolean;
  cup: CupObject | null;
  size: Size | null;
  stream: THREE.Mesh;
  spill: number;
  /** Soda on the drip tray from an overflow, 0..1. Has to be wiped before the next cup. */
  puddle: number;
  puddleObj: THREE.Mesh;
  x: number;
  /** Ice, lid and straw on the cup under this nozzle. */
  ice: boolean;
  lid: boolean;
  straw: boolean;
}

export type Hit =
  | { type: "bin"; kind: Kind }
  | { type: "grillItem"; item: GrillItem }
  | { type: "bottle"; sauce: SauceKind }
  | { type: "friesBin" }
  | { type: "basket"; idx: number }
  | { type: "tap"; idx: number }
  | { type: "cup"; idx: number }
  | { type: "ice" }
  | { type: "lids" }
  | { type: "straws" }
  | { type: "hold"; idx: number }
  | { type: "stack"; idx: number }
  | { type: "supplies"; kind: "cup" | "carton"; size: Size }
  | { type: "pack"; idx: number }
  | { type: "shaker" }
  | { type: "curds" }
  | { type: "gravy" };

/** A burger being put together (or food parked) on the warm shelf. */
export interface HoldSpot {
  layers: Layer[];
  view: PlateView;
  x: number;
  z: number;
}

export interface CounterEvents {
  golden: () => void;
  spill: () => void;
  burning: () => void;
}

/** Buns toast and eggs set more slowly than meat, so they're forgiving to leave on. */
/** Patties are slow on purpose: put them on, go do something else, come back to flip. */
const COOK_SPEED: Record<string, number> = { patty: 0.34, bacon: 1.1, egg: 0.75, bun: 0.6, pineapple: 0.7 };

/** Nozzle spacing on the soda fountain. */
export const TAP_GAP = FOUNTAIN_SPOTS.cups[1].x - FOUNTAIN_SPOTS.cups[0].x;
const tapX = (i: number) => pageX(0) + FOUNTAIN.x + FOUNTAIN_SPOTS.cups[i].x;
/** Cups sit on the drip tray under the nozzles; the pour falls from the spout tip. */
const CUP_Z = FOUNTAIN.z + FOUNTAIN_SPOTS.cups[0].z;
const CUP_Y = FOUNTAIN_SPOTS.cups[0].y;
const STREAM_Z = FOUNTAIN.z + FOUNTAIN_SPOTS.nozzles[0].z;
const STREAM_TOP = FOUNTAIN_SPOTS.nozzles[0].y;
/** Button, stream and puddle colours: a shade stronger than the drink itself so they read on the machine. */
const DRINK_LABEL_COLOR: Record<DrinkId, string> = { pine: "#6aa877", pink: "#ea8ea6", cola: "#4a2522", water: "#8ec6dc", tea: "#b4651e" };

export class CounterView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 0.9, 0.1, 80);
  page = HOME_PAGE;
  /** Which camera stop (see STOPS) the counter band is at. */
  stop = HOME_PAGE;
  /** Camera x offset while the player drags between counters. */
  dragOffset = 0;
  private camX = 0;
  /** Camera turn about the vertical: 0 faces the window line, PI the back wall. */
  private camYaw = 0;
  private raycaster = new THREE.Raycaster();
  private hitMeshes: THREE.Mesh[] = [];
  private pantry: THREE.Group | null = null;
  bins: { kind: Kind; x: number; z: number; y: number }[] = [];
  /** Upgrade multipliers. */
  fryBoost = 1;
  autoStopPour = false;
  grillItems: GrillItem[] = [];
  holds: HoldSpot[] = [];
  /** Right end of the grill turned down to keep food warm without cooking it much. */
  warm = false;
  private griddle!: GriddleObject;
  private warmShown: boolean | null = null;
  private caddy!: SauceCaddyObject;
  private light: KitchenLight;
  baskets: Basket[] = [];
  /** Where to grab frozen fries from (the middle of the potato freezer), in world units. */
  friesBinAt = new THREE.Vector3();
  taps: Tap[] = [];
  stacks: Stack[] = [];
  packs: Pack[] = [];
  /** Running cost of soda poured onto the drip tray this shift. */
  spillCost = 0;
  /** The bottles standing in the caddy (hidden while one is in hand). */
  bottles!: Record<SauceKind, THREE.Object3D>;
  private puffs: THREE.Mesh[] = [];
  private held: THREE.Object3D | null = null;
  private time = 0;
  events: CounterEvents = { golden: () => {}, spill: () => {}, burning: () => {} };
  /** The shadow-casting light, so the graphics setting can soften or disable it. */
  sun: THREE.DirectionalLight;

  constructor() {
    this.scene.background = KITCHEN_BG.clone();
    this.light = applyKitchenLight(this.scene, { shadowBox: { left: -9, right: 9, top: 7, bottom: -7 } });
    this.sun = this.light.sun;

    // The window line's counter top and the steel wall panels under the window.
    const counter = counterTop(90, 10.6);
    counter.position.set(7, 0, -0.7);
    this.scene.add(counter);
    const wall = wallPanels(90, 6);
    wall.position.set(7, -0.4, -3.4);
    this.scene.add(wall);
    // A steel backsplash strip where the counter meets the truck wall.
    const splash = new THREE.Mesh(new THREE.BoxGeometry(90, 0.5, 0.1), toon("#b9d6a2"));
    splash.position.set(7, 0.25, -3.35);
    this.scene.add(splash);

    this.buildGrill();
    this.buildFryer();
    this.buildDrinks();
    this.buildSupplies();
  }

  private proxy(geo: THREE.BufferGeometry, pos: THREE.Vector3, hit: Hit): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(pos);
    m.userData.hit = hit;
    this.scene.add(m);
    this.hitMeshes.push(m);
    return m;
  }

  private buildGrill(): void {
    const at = (x: number, y: number, z: number) => this.world(1, x, y, z);
    const griddle = makeGriddle();
    griddle.position.copy(at(GRIDDLE.x, 0, GRIDDLE.z));
    this.scene.add(griddle);
    this.griddle = griddle;
    // Trash slot along the front edge: drop anything past the grill to throw it away.
    this.addTrash(1, TRASH_RAIL[1]);

    // The warm shelf over the back of the griddle: heat from underneath, so no bulbs or glow.
    const shelf = makeWarmShelf({ plates: false, legs: SHELF.y });
    shelf.position.copy(at(SHELF.x, SHELF.y, SHELF.z));
    this.scene.add(shelf);
    for (const h of HOLD_SPOTS) {
      const view = new PlateView();
      view.ring.visible = false;
      view.group.scale.setScalar(HOLD_SCALE);
      view.s = FOOD_SCALE / HOLD_SCALE;
      view.group.position.copy(at(h.x, HOLD_Y - 0.1 * HOLD_SCALE, h.z));
      this.scene.add(view.group);
      this.holds.push({ layers: [], view, x: h.x, z: h.z });
    }

    // The sauce caddy in front of the prep unit, bottles upside down and ready to lift.
    const caddy = makeSauceCaddy();
    caddy.position.copy(at(CADDY.x, 0, CADDY.z));
    this.scene.add(caddy);
    // Working kit, clear of every target: a utensil crock in the free front corner.
    const crock = makeUtensilCrock();
    crock.position.copy(at(-3.3, 0, 2.5));
    this.scene.add(crock);
    this.caddy = caddy;
    this.bottles = caddy.userData.bottles;
    for (const k of ["ketchup", "mustard"] as SauceKind[]) {
      const b = caddy.userData.spots.bottles[k];
      this.proxy(new THREE.BoxGeometry(0.55, 1.6, 0.85), caddy.position.clone().add(new THREE.Vector3(b.x, 0.8, b.z)), { type: "bottle", sauce: k });
    }

    const puffMat = new THREE.MeshBasicMaterial({ color: "#f2f2f2", transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), puffMat.clone());
      m.visible = false;
      m.userData = { t: Math.random(), item: -1 };
      this.scene.add(m);
      this.puffs.push(m);
    }
  }

  /** Fryer page: see FRYER. Carton sleeves come from the Supplies counter. */
  private buildFryer(): void {
    const F = FRYER;
    const at = (x: number, y: number, z: number) => this.world(2, x, y, z);
    // Potato freezer, heaped with frozen fries.
    const freezer = makeFreezer();
    freezer.position.copy(at(F.freezer.x, 0, F.freezer.z));
    this.scene.add(freezer);
    this.friesBinAt.copy(at(F.freezer.x, 0.6, F.freezer.z));
    this.proxy(new THREE.BoxGeometry(FREEZER.w + 0.1, 1.4, FREEZER.d + 0.2), this.friesBinAt.clone(), { type: "friesBin" });

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
    const shaker = makeShaker();
    shaker.position.copy(at(F.shaker.x, 0, F.shaker.z));
    this.scene.add(shaker);
    this.proxy(new THREE.BoxGeometry(0.9, 1.2, 0.9), at(F.shaker.x, 0.4, F.shaker.z), { type: "shaker" });
    const tub = makeCurdTub();
    tub.position.copy(at(F.curds.x, 0, F.curds.z));
    this.scene.add(tub);
    this.proxy(new THREE.BoxGeometry(1.0, 1.2, 1.0), at(F.curds.x, 0.4, F.curds.z), { type: "curds" });
    const pot = makeGravyPot();
    pot.position.copy(at(F.gravy.x, 0, F.gravy.z));
    this.scene.add(pot);
    this.proxy(new THREE.BoxGeometry(1.0, 1.4, 1.1), at(F.gravy.x, 0.5, F.gravy.z), { type: "gravy" });
    this.addTrash(2, TRASH_RAIL[2]);

    // The hang-rail fryer: a basket per well, hanging tilted on the rail until it's lowered.
    const fryer = makeFryer();
    fryer.position.copy(at(F.fryer.x, 0, F.fryer.z));
    this.scene.add(fryer);
    // A paper towel roll on the wall over the toppings, out of the way of the baskets.
    const roll = makePaperRoll();
    roll.position.copy(at(3.3, 2.6, -3.4));
    this.scene.add(roll);
    this.fryer = fryer;
    const sp = fryer.userData.spots;
    sp.wells.forEach((w, i) => {
      const basket = makeFryBasket();
      const fries = makeFryPile(FRY_BASKET.w - 0.1, FRY_BASKET.d - 0.1, 4, 21 + i, true);
      fries.position.y = 0.02;
      fries.visible = false;
      basket.add(fries);
      this.scene.add(basket);
      const hang = sp.hang[i];
      const up = fryer.position.clone().add(new THREE.Vector3(hang.x, hang.y, hang.z));
      const down = fryer.position.clone().add(new THREE.Vector3(w.x, sp.down.y, w.z));
      this.baskets.push({ loaded: false, cook: 0, down: false, goldenRung: false, obj: basket, fries, t: 0, amount: 0, up, downAt: down, tilt: hang.tilt });
      this.proxy(new THREE.BoxGeometry(1.5, 1.8, 2.4), fryer.position.clone().add(new THREE.Vector3(w.x, 1.6, w.z + 0.6)), { type: "basket", idx: i });
    });
  }

  private buildDrinks(): void {
    const at = (x: number, y: number, z: number) => this.world(0, x, y, z);
    const fountain = makeFountain();
    fountain.position.copy(at(FOUNTAIN.x, 0, FOUNTAIN.z));
    this.scene.add(fountain);
    const sp = fountain.userData.spots;
    DRINKS.forEach((flavor, i) => {
      const x = tapX(i);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), toon(DRINK_LABEL_COLOR[flavor]));
      // Drawn after the cup so the see-through cup wall never hides it.
      stream.renderOrder = 2;
      stream.visible = false;
      this.scene.add(stream);
      const puddleObj = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ color: DRINK_LABEL_COLOR[flavor], transparent: true, opacity: 0.7 }));
      puddleObj.rotation.x = -Math.PI / 2;
      puddleObj.position.set(x, CUP_Y + 0.02, CUP_Z + 0.1);
      puddleObj.visible = false;
      this.scene.add(puddleObj);
      this.taps.push({ flavor, fill: 0, pouring: false, cup: null, size: null, stream, spill: 0, puddle: 0, puddleObj, x, ice: false, lid: false, straw: false });
      // The big button on top pours; the cup on the drip tray is picked up.
      const b = sp.buttons[i];
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.04, 1.0, 1.5), at(FOUNTAIN.x + b.x, b.y, FOUNTAIN.z + b.z + 0.3), { type: "tap", idx: i });
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.04, 1.4, 1.3), new THREE.Vector3(x, 0.6, CUP_Z + 0.15), { type: "cup", idx: i });
    });

    // The tower: cup tubes on top (pull a cup down), the ice lever on its front.
    const tower = makeDrinkTower();
    tower.position.copy(at(TOWER.x, 0, TOWER.z));
    this.scene.add(tower);
    (["S", "M", "L"] as Size[]).forEach((size) => {
      const t = TOWER_SPOTS.tubes[size];
      this.addStack("cup", size, at(TOWER.x + t.x, t.y, TOWER.z + t.z), true);
    });
    const lv = TOWER_SPOTS.lever;
    this.proxy(new THREE.BoxGeometry(1.4, 1.6, 1.4), at(TOWER.x + lv.x, 0.9, TOWER.z + lv.z + 0.2), { type: "ice" });

    // Lids and straws in one caddy at the front left.
    const caddy = makeLidStrawCaddy();
    caddy.position.copy(at(LIDS.x, 0, LIDS.z));
    this.scene.add(caddy);
    this.proxy(new THREE.BoxGeometry(1.0, 1.2, 1.1), at(LIDS.x + LID_SPOTS.lids.x, 0.5, LIDS.z), { type: "lids" });
    this.proxy(new THREE.BoxGeometry(0.9, 1.6, 1.1), at(LIDS.x + LID_SPOTS.straws.x, 0.7, LIDS.z), { type: "straws" });
    this.addTrash(0, TRASH_RAIL[0]);
  }

  /**
   * The Supplies counter on the back wall: the wire rack, a bay of wrapped sleeves per size. Tap
   * a bay for a sleeve and carry it to that stack over its counter's tab.
   */
  private buildSupplies(): void {
    // Its own counter top and wall, facing the window line across the aisle.
    const top = counterTop(20, 7.6);
    top.position.copy(this.world(3, 0, 0, 0));
    top.rotation.y = Math.PI;
    const wall = wallPanels(20, 6);
    wall.position.copy(this.world(3, 0, -0.4, -3.6));
    wall.rotation.y = Math.PI;
    const splash = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 0.1), toon("#b9d6a2"));
    splash.position.copy(this.world(3, 0, 0.25, -3.55));
    this.scene.add(top, wall, splash);

    const rack = makeWireRack({ w: RACK.w });
    rack.position.copy(this.world(3, RACK.x, 0, RACK.z));
    rack.rotation.y = Math.PI;
    this.scene.add(rack);
    // A towel over the front edge of the supplies counter.
    const towel = makeTowel();
    towel.position.copy(this.world(3, 2.6, 0, 3.8));
    towel.rotation.y = Math.PI;
    this.scene.add(towel);
    const { bays, bayW } = rack.userData.spots;
    bays.forEach((b, i) => {
      rack.userData.setBay(i, 2);
      const c = this.world(3, RACK.x + b.x, b.y, RACK.z + b.z);
      this.supplyAt.push({ kind: b.kind, size: b.size, at: c });
      this.proxy(new THREE.BoxGeometry(bayW - 0.1, 0.9, 1.25), c.clone().setY(b.y + 0.35), { type: "supplies", kind: b.kind, size: b.size });
    });
  }

  /** Where each bay of the wire rack is, for labels and the playtest bot. */
  supplyAt: { kind: Stack["kind"]; size: Size; at: THREE.Vector3 }[] = [];
  private fryer!: FryerObject;

  /** A trash chute along a counter's front edge, between page-local x0 and x1. */
  private addTrash(page: number, r: { x0: number; x1: number }): void {
    const w = r.x1 - r.x0;
    const c = this.world(page, (r.x0 + r.x1) / 2, 0, (TRASH.z0 + TRASH.z1) / 2);
    const chute = makeTrashChute(w);
    chute.position.copy(c);
    this.scene.add(chute);
    // Lights up while something held is over it, so you know a drop will bin it.
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, TRASH.z1 - TRASH.z0 + 0.25), new THREE.MeshBasicMaterial({ color: "#e0523f", transparent: true, opacity: 0.55, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(c).setY(0.1);
    glow.visible = false;
    glow.renderOrder = 3;
    this.scene.add(glow);
    this.trashGlow[page] = glow;
  }

  /** What you carry from the fryer's topping column. */
  fryTopMesh(what: "salt" | "curds" | "gravy"): THREE.Object3D {
    if (what === "salt") {
      const m = makeShaker();
      // Tipped over, ready to shake.
      m.rotation.z = 2.3;
      m.position.y = 0.4;
      const g = new THREE.Group();
      g.add(m);
      return g;
    }
    return what === "curds" ? makeCurdHandful() : makeLadle();
  }

  /** Packing pad with fries under a world point, or -1. */
  friedPackAt(g: THREE.Vector3): number {
    const i = this.overPack(g);
    return i >= 0 && this.packs[i].size && this.packs[i].fill > 0 ? i : -1;
  }

  /** A scoop of ice, one lid or one straw: on the counter and in hand. */
  extraMesh(what: "ice" | "lid" | "straw"): THREE.Object3D {
    if (what === "ice") {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const c = mesh(faceted(new THREE.BoxGeometry(0.22, 0.2, 0.22)), "#e8f6fb", { opacity: 0.85 });
        c.position.set((i - 1) * 0.2, (i % 2) * 0.12, (i % 2) * 0.1);
        c.rotation.set(i * 0.7, i, 0);
        g.add(c);
      }
      return g;
    }
    if (what === "lid") return mesh(faceted(new THREE.CylinderGeometry(0.5, 0.52, 0.06, 18)), "#f4f2ec");
    return mesh(faceted(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6)), "#d24c3f");
  }

  /** A stack of cups or cartons standing at a world point; cups in the tower hang mouth down in a tube. */
  private addStack(kind: Stack["kind"], size: Size, at: THREE.Vector3, tube = false): void {
    if (!tube) {
      const base = mesh(faceted(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16)), "#e9e2d2", { ink: false });
      base.position.set(at.x, 0.02, at.z);
      this.scene.add(base);
    }
    const obj = new THREE.Group();
    obj.position.copy(at).setY(at.y + (tube ? 0 : 0.04));
    this.scene.add(obj);
    const s: Stack = { kind, size, count: STACK_START, sleeve: false, tear: 0, obj, x: at.x, z: at.z, tube };
    this.stacks.push(s);
    this.syncStack(s);
    this.proxy(new THREE.BoxGeometry(tube ? 0.75 : 1.1, 1.6, tube ? 1.0 : 1.2), at.clone().setY(at.y + (tube ? 0.5 : 0.6)), { type: "stack", idx: this.stacks.length - 1 });
  }

  /** A plastic-wrapped sleeve of cups or paper boats of one size. */
  sleeveMesh(kind: Stack["kind"], size: Size): THREE.Object3D {
    return makeSleeve(kind, size);
  }

  /** Redraw a cup or carton stack after its count changes. */
  syncStack(s: Stack): void {
    for (const c of [...s.obj.children]) {
      s.obj.remove(c);
      disposeObject(c);
    }
    if (s.sleeve) {
      const sleeve = this.sleeveMesh(s.kind, s.size);
      // Under a tube the sleeve is held up to its mouth; a torn one sags open a little.
      sleeve.position.y = s.tube ? -0.35 : 0.05;
      sleeve.rotation.y = 0.3;
      sleeve.scale.set(1 + s.tear * 0.15, 1 - s.tear * 0.25, 1 + s.tear * 0.15);
      s.obj.add(sleeve);
      return;
    }
    // The tower draws the cups in its tubes; its labels say how many are left.
    if (s.tube) return;
    // Nested cartons are baked into one mesh per size and count.
    const o = makeCartonStack(s.size as FriesSize, s.count);
    o.scale.setScalar(CARTON_STACK_SCALE);
    s.obj.add(o);
  }

  /** Put an empty cup under a nozzle. */
  placeCup(i: number, size: Size): void {
    const t = this.taps[i];
    this.removeCup(i);
    const cup = makeCup(t.flavor, false, size);
    cup.scale.setScalar(CUP_AT_TAP);
    cup.position.set(t.x, CUP_Y, CUP_Z);
    this.scene.add(cup);
    t.cup = cup;
    t.size = size;
    t.fill = 0;
    Object.assign(t, { ice: false, lid: false, straw: false });
  }

  /** Add ice, a lid or a straw to the cup under a nozzle. */
  dressTap(i: number, what: "ice" | "lid" | "straw"): void {
    const t = this.taps[i];
    t[what] = true;
    if (what === "lid") t.pouring = false;
    if (t.cup) dressCup(t.cup, t);
  }

  removeCup(i: number): void {
    const t = this.taps[i];
    if (t.cup) {
      this.scene.remove(t.cup);
      disposeObject(t.cup);
    }
    t.cup = null;
    t.size = null;
    t.fill = 0;
    t.pouring = false;
    Object.assign(t, { ice: false, lid: false, straw: false });
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

  /** Cups and cartons left in each stack, counting an unopened sleeve as a full refill. */
  stock(): Record<string, number> {
    return Object.fromEntries(this.stacks.map((s) => [s.kind + s.size, s.count + (s.sleeve ? SLEEVE : 0)]));
  }

  /** Clean stations for a new shift. Stacks pick up where the last shift left them. */
  resetStations(stock: Record<string, number> = {}): void {
    for (const s of this.stacks) Object.assign(s, { count: Math.min(STACK_START, stock[s.kind + s.size] ?? STACK_START), sleeve: false, tear: 0 });
    this.stacks.forEach((s) => this.syncStack(s));
    this.taps.forEach((t, i) => {
      this.removeCup(i);
      t.puddle = 0;
    });
    this.packs.forEach((p, i) => {
      Object.assign(p, EMPTY_PACK);
      this.syncPack(i);
    });
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

  /** Stack under the pointer, or -1. Picked by its hit box, since the tower's tubes stand well above the counter. */
  overStack(ndc: THREE.Vector2): number {
    const h = this.hit(ndc);
    return h?.type === "stack" ? h.idx : -1;
  }

  /** World position under each drink cup, for the HTML flavour labels; alternate rows so five fit. */
  /** Each drink's label sits in a row along the front lip of the machine, over its nozzle. */
  drinkLabelPoint(i: number): THREE.Vector3 {
    const l = FOUNTAIN_SPOTS.labels[i];
    return this.world(0, FOUNTAIN.x + l.x, l.y, FOUNTAIN.z + l.z);
  }

  /** Fill the prep unit's pans for the current stop: nine kinds, back row first. */
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
    const prep = makePrepUnit({ kinds: kinds.slice(0, 9) });
    prep.position.copy(this.world(1, PREP.x, 0, PREP.z));
    const { pans, pan } = prep.userData.spots;
    this.bins = pans.flatMap((p) => (p.kind ? [{ kind: p.kind, x: PREP.x + p.x, z: PREP.z + p.z, y: p.y }] : []));
    for (const b of this.bins) this.proxy(new THREE.BoxGeometry(pan.w, 0.9, pan.d), this.world(1, b.x, b.y - 0.2, b.z), { type: "bin", kind: b.kind });
    this.pantry = prep;
    this.scene.add(prep);
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

  /** Go to a counter. On the counter you're already at, a second tap moves to its other stop. */
  setPage(i: number): void {
    const page = THREE.MathUtils.clamp(i, 0, PAGES.length - 1);
    const stops = this.stopsOf(page);
    this.setStop(page === this.page && stops.length > 1 ? stops[(stops.indexOf(this.stop) + 1) % stops.length] : stops[0]);
  }

  /** Move to a camera stop. Swipes along the tab bar step one stop at a time. */
  setStop(s: number): void {
    this.stop = THREE.MathUtils.clamp(s, 0, STOPS.length - 1);
    this.page = STOPS[this.stop].page;
  }

  /** The camera stops on a counter, left to right. */
  stopsOf(page: number): number[] {
    return STOPS.flatMap((s, i) => (s.page === page ? [i] : []));
  }

  /** The camera has arrived at its stop (labels over the counter wait for it). */
  get settled(): boolean {
    const s = STOPS[this.stop];
    return Math.abs(this.camX - s.x) < 0.05 && Math.abs(this.camYaw - (s.turned ? Math.PI : 0)) < 0.02 && this.dragOffset === 0;
  }

  /** A counter-local point (as the build code lays pages out) in world space. Supplies faces the other way. */
  world(page: number, x: number, y: number, z: number): THREE.Vector3 {
    return page === 3 ? new THREE.Vector3(pageX(3) - x, y, SUPPLY_Z - z) : new THREE.Vector3(pageX(page) + x, y, z);
  }

  hit(ndc: THREE.Vector2): Hit | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    // Grill items first: they sit on top of everything else.
    const items = this.grillItems.filter((g) => !g.held);
    const p = this.groundPoint(ndc, GRILL_TOP + 0.15);
    let best: GrillItem | null = null;
    let bestD = 0.85;
    for (const it of items) {
      const d = Math.hypot(p.x - (pageX(1) + it.x), p.z - it.z);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (best) return { type: "grillItem", item: best };
    const hold = this.page === HOME_PAGE ? this.overHold(ndc) : -1;
    if (hold >= 0) return { type: "hold", idx: hold };
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    return hits.length ? (hits[0].object.userData.hit as Hit) : null;
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

  /** True when a dropped item at this world point lands in the trash can. */
  overTrash(world: THREE.Vector3): boolean {
    const r = TRASH_RAIL[this.page];
    if (!r) return false;
    const x = world.x - pageX(this.page);
    return world.z > TRASH.z0 - 0.05 && x > r.x0 - 0.3 && x < r.x1 + 0.3;
  }

  /** Grill-local position if the world point is over the grill plate. */
  overGrill(world: THREE.Vector3): { x: number; z: number } | null {
    const x = world.x - pageX(1);
    const { x0, x1, z0, z1 } = GRILL_BOUNDS;
    if (x < x0 - 0.3 || x > x1 + 0.3 || world.z < z0 - 0.5 || world.z > z1 + 0.4) return null;
    return { x: THREE.MathUtils.clamp(x, x0, x1), z: THREE.MathUtils.clamp(world.z, z0, z1) };
  }

  /** Assembly spot under the world point, or -1. */
  overHold(ndc: THREE.Vector2): number {
    // The plates sit up on the shelf, so the finger is matched at their height.
    const p = this.groundPoint(ndc, HOLD_Y);
    return this.holds.findIndex((h) => Math.hypot(p.x - (pageX(1) + h.x), p.z - h.z) < 0.62);
  }


  /** Redraw an assembly spot after its layers change. */
  syncHold(i: number, animate: boolean): void {
    this.holds[i].view.sync({ layers: this.holds[i].layers, fries: null, drink: null }, animate, () => {});
  }

  addGrillItem(piece: Piece, x: number, z: number, topping?: Piece): GrillItem {
    const obj = makeFood(piece, "top");
    obj.scale.setScalar(GRILL_SCALE);
    this.scene.add(obj);
    const item: GrillItem = { piece, obj, x, z, flipT: -1, squash: 0, squashV: 4, smoke: 0, held: false, topping: null };
    this.grillItems.push(item);
    if (topping) this.addTopping(item, topping);
    return item;
  }

  /** Grill item under a world point, if any. */
  grillItemAt(world: THREE.Vector3): GrillItem | null {
    const x = world.x - pageX(1);
    let best: GrillItem | null = null;
    let bestD = 0.75;
    for (const it of this.grillItems) {
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

  removeGrillItem(item: GrillItem): void {
    this.scene.remove(item.obj);
    disposeObject(item.obj);
    this.grillItems = this.grillItems.filter((g) => g !== item);
  }

  flip(item: GrillItem): boolean {
    if (item.flipT >= 0 || item.held || item.topping) return false;
    // Eggs and buns don't flip in this shop: eggs are sunny side up, buns toast cut side down.
    if (item.piece.kind === "egg") return false;
    item.flipT = 0;
    return true;
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

  moveHeld(world: THREE.Vector3, visible: boolean): void {
    if (!this.held) return;
    this.held.visible = visible;
    this.held.position.set(world.x, world.y + 0.7, world.z);
  }

  /**
   * Lift a sauce out of the caddy (or put it back with null). Only one is in hand at a time; it
   * stays out until it's put back, so the bottle can be squeezed over any burger.
   */
  liftSauce(kind: SauceKind | null): void {
    this.inHand = kind;
    for (const k of ["ketchup", "mustard"] as SauceKind[]) this.bottles[k].visible = k !== kind;
    this.pointSauce(null);
  }
  inHand: SauceKind | null = null;
  private handBottle: THREE.Object3D | null = null;

  /** The bottle in hand over a world point on the counter (squeezing over a hold plate), or out of view. */
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

  /** The bottle in hand over a burger-local point of a hold plate's stack. */
  pointSauceAt(i: number, q: { x: number; z: number }): void {
    const v = this.holds[i].view;
    v.group.updateMatrixWorld(true);
    this.pointSauce(v.burger.localToWorld(new THREE.Vector3(q.x, v.stackTop(), q.z)));
  }

  /** A sauce bottle hanging nozzle down, its origin at the nozzle tip. */
  sauceBottle(kind: SauceKind): THREE.Object3D {
    return makeSauceBottle(kind);
  }

  /** Where the sauce caddy stands, for the in-hand mask. */
  caddyPoint(): THREE.Vector3 {
    return this.caddy.position.clone().setY(0.8);
  }

  /** Where a hold plate's staleness bar stands: just off the plate's right edge, at its rim. */
  holdBarPoint(i: number): THREE.Vector3 {
    return this.holdPoint(i).add(new THREE.Vector3(HOLD_SCALE + 0.12, 0.05, 0.25) /* plate radius is 1 at HOLD_SCALE */);
  }

  /** Where the warm-zone switch sits: on the griddle's front lip, under the warm zone. */
  warmSwitchPoint(): THREE.Vector3 {
    return this.world(1, (WARM_X0 + GRIDDLE.x + GRIDDLE_SURFACE.x1) / 2, GRILL_TOP, GRIDDLE.z + GRIDDLE_SURFACE.z1 + 0.55);
  }

  /**
   * Where a basket's fry meter sits: on the counter just in front of the fryer, under its well, so
   * it never covers the basket (the panel meters on the fryer read too small at phone width).
   */
  fryTagPoint(i: number): THREE.Vector3 {
    const f = this.fryer;
    return new THREE.Vector3(this.baskets[i].obj.position.x, 0.1, f.position.z + f.userData.footprint.d / 2 + 0.45);
  }

  /** A hold plate's centre in world space. */
  holdPoint(i: number): THREE.Vector3 {
    return this.holds[i].view.group.position.clone();
  }

  /** Pointer position over a hold plate's stack, in burger-local units, for drawing sauce there. */
  holdDrawPoint(ndc: THREE.Vector2, i: number): { x: number; z: number } {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.holds[i].view.drawPoint(this.raycaster.ray);
  }

  get pageCount(): number {
    return PAGES.length;
  }

  sizzleLevel(): number {
    return this.grillItems.filter((g) => !g.held && g.flipT < 0 && !this.isWarm(g)).length * 0.35 + this.grillItems.filter((g) => this.isWarm(g)).length * 0.08;
  }

  /** Sitting in the turned-down section of the grill. */
  isWarm(g: GrillItem): boolean {
    return this.warm && g.x > WARM_X0;
  }

  bubbleLevel(): number {
    return this.baskets.filter((b) => b.loaded && b.down).length * 0.6;
  }

  pouring(): number {
    return this.taps.some((t) => t.pouring) ? 1 : 0;
  }

  update(dt: number): void {
    this.time += dt;
    // Camera glides between stops; for the back wall it turns round on the spot.
    const stop = STOPS[this.stop];
    const k = Math.min(1, dt * 10);
    this.camX += (stop.x + this.dragOffset - this.camX) * k;
    this.camYaw += ((stop.turned ? Math.PI : 0) - this.camYaw) * k;
    const camZ = LOOK_Z + CAM_BACK;
    this.camera.position.set(this.camX, CAM_H, camZ);
    const lookX = this.camX + Math.sin(this.camYaw) * CAM_BACK;
    const lookZ = camZ - Math.cos(this.camYaw) * CAM_BACK;
    this.camera.lookAt(lookX, 0, lookZ);
    // The sun follows the camera so shadows stay sharp on whichever counter is in view.
    this.light.aim(lookX, lookZ);

    // Grill
    const gx = pageX(1);
    let anyBurning = false;
    for (const it of this.grillItems) {
      if (it.held) continue;
      if (it.flipT >= 0) {
        it.flipT += dt / 0.55;
        const t = Math.min(1, it.flipT);
        it.obj.position.set(gx + it.x, GRILL_TOP + 1.5 * Math.sin(Math.PI * t), it.z);
        it.obj.rotation.set(Math.PI * t, 0, 0);
        if (it.flipT >= 1) {
          it.flipT = -1;
          it.obj.rotation.set(0, 0, 0);
          it.piece.cook = [it.piece.cook[1], it.piece.cook[0]];
          it.squashV = 6;
        }
      } else {
        // The middle of the grill runs a little hotter than the edges.
        // The middle of the grill runs a little hotter than the edges; the warm section barely cooks.
        const zone = this.isWarm(it) ? 0.07 : 1.12 - 0.25 * Math.abs((it.x - GRILL_CX) / 2.5);
        const heat = zone * (COOK_SPEED[it.piece.kind] ?? 1) * (it.piece.smashed ? 1.6 : 1);
        const before = it.piece.cook[0];
        if (it.topping) {
          const c = it.topping.piece;
          c.melt = Math.min(1, (c.melt ?? 0) + (this.isWarm(it) ? MELT_RATE.warm : MELT_RATE.hot) * dt);
          it.topping.obj.userData.update(c);
        }
        it.piece.cook[0] += GRILL_RATE * heat * dt;
        if (it.piece.kind === "egg") it.piece.cook[1] += GRILL_RATE * 0.35 * heat * dt;
        it.obj.position.set(gx + it.x, GRILL_TOP, it.z);
        if (it.piece.cook[0] > 0.9 && before <= 0.9) anyBurning = true;
      }
      it.squashV += (-160 * it.squash - 12 * it.squashV) * dt;
      it.squash += it.squashV * dt;
      const s = THREE.MathUtils.clamp(it.squash * 0.07, -0.3, 0.3);
      it.obj.scale.set(GRILL_SCALE * (1 + s * 0.4), GRILL_SCALE * (1 - s), GRILL_SCALE * (1 + s * 0.4));
      it.obj.userData.update(it.piece);
    }
    if (anyBurning) this.events.burning();

    // Smoke: puffs drift up from cooking items; darker when burning.
    const active = this.grillItems.filter((g) => !g.held && g.flipT < 0 && !this.isWarm(g));
    for (const h of this.holds) h.view.update(dt);
    if (this.warmShown !== this.warm) {
      this.griddle.userData.setWarm(this.warm);
      this.warmShown = this.warm;
    }
    this.puffs.forEach((m, i) => {
      const it = active[i % Math.max(1, active.length)];
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
      const burnt = it.piece.cook[0] > 0.92;
      m.visible = true;
      m.position.set(gx + it.x + (m.userData.ox ?? 0) + Math.sin(t * 5 + i) * 0.08, GRILL_TOP + 0.3 + t * 1.6, it.z + (m.userData.oz ?? 0));
      m.scale.setScalar(0.6 + t * 1.5);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(burnt ? "#3a3532" : "#f2f2f2");
      mat.opacity = (burnt ? 0.55 : 0.28) * Math.sin(Math.PI * t) * Math.min(1, it.piece.cook[0] * 4);
    });

    // Fryer
    for (let i = 0; i < this.baskets.length; i++) {
      const b = this.baskets[i];
      const inOil = b.down && b.loaded;
      // Lowered baskets sit level in the oil; lifted ones hang tilted on the rail to drain.
      b.t += ((inOil ? 1 : 0) - b.t) * Math.min(1, dt * 8);
      b.obj.position.lerpVectors(b.up, b.downAt, b.t);
      b.obj.position.y += inOil ? Math.sin(this.time * 18) * 0.015 : 0;
      b.obj.rotation.x = b.tilt * (1 - b.t);
      b.fries.visible = b.loaded;
      if (b.loaded) this.fryer.userData.setMeter(i, b.cook);
      const bub = this.fryer.userData.bubbles[i];
      bub.visible = inOil && b.t > 0.85;
      if (bub.visible) {
        bub.scale.set(1, 0.6 + 0.4 * Math.abs(Math.sin(this.time * 9 + i)), 1);
        bub.rotation.y = Math.sin(this.time * 2.3 + i) * 0.12;
      }
      if (inOil) {
        b.cook += FRY_RATE * this.fryBoost * dt;
        if (!b.goldenRung && b.cook >= FRIES_PERFECT - 0.04) {
          b.goldenRung = true;
          this.events.golden();
        }
      }
      if (b.loaded) {
        b.fries.userData.setCook(b.cook);
        b.fries.userData.setAmount?.(b.amount);
      }
    }

    // Drinks
    for (const t of this.taps) {
      if (t.pouring && t.size) {
        t.fill += dt * 0.42 * CUP_SPEED[t.size];
        if (this.autoStopPour && t.fill >= 0.9) t.pouring = false;
        if (t.fill > 1) {
          // Overflow: the cup stays full, the rest goes on the drip tray and costs money.
          if (t.spill <= 0) this.events.spill();
          t.fill = 1;
          t.spill = 1;
          t.puddle = Math.min(1, t.puddle + dt * 0.7);
          this.spillCost += dt * SPILL_COST;
        }
      }
      t.cup?.userData.setFill(t.fill);
      t.stream.visible = t.pouring && !!t.cup;
      if (t.stream.visible) {
        const topY = CUP_Y + cupSurfaceY(t.size ?? "L", Math.min(1, t.fill)) * CUP_AT_TAP;
        const h = Math.max(0.05, STREAM_TOP - topY);
        t.stream.scale.set(1, h, 1);
        t.stream.position.set(t.x, topY + h / 2, STREAM_Z);
      }
      t.spill = Math.max(0, t.spill - dt * 2);
      if (t.cup) t.cup.rotation.z = Math.sin(this.time * 40) * 0.05 * t.spill;
      t.puddleObj.visible = t.puddle > 0.01;
      t.puddleObj.scale.setScalar(0.35 + 0.75 * t.puddle);
    }
  }
}
