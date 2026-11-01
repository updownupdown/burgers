import * as THREE from "three";
import { cookLevel, COOK_SCALE, DRINK_FILL, FRIES_PERFECT, FRIES_ZONE, FRY_RATE, GRILL_RATE, MARK_RATE, MELT_RATE, type Cookable } from "../game/cooking";
import type { DrinkId, FriesSize, Kind, Piece, SauceKind, Size } from "../game/types";
import { CUP_SPEED, DRINKS, GRILLABLE } from "../game/types";
import { counterTop, wallPanels } from "../render/wear";
import { CUP_DIMS, cupSurfaceY, makeCarton, makeCartonStack, makeCup, makeFood, makeBasketFries, makeFries, stackHeight, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { dressCup } from "../render/cup";
import { CURD_TRAY, FREEZER, GRAVY_WELL, makeCurdHandful, makeCurdTray, makeFreezer, makeGravyWell, makeLadle, makeShaker } from "../render/fryer";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { makeGriddle, ZONE_HEATS, type GriddleObject, type ZoneHeat } from "../render/machines/griddle";
import { makeColdRail } from "../render/machines/coldRail";
import { makeSauceBottle, makeSauceCaddy, type SauceCaddyObject } from "../render/machines/sauces";
import { DRINK_TINT, makeCupStack, makeFountain, makeFryBasket, makeFryer, makeIceWell, makeLidStackSized, makePackPad, makeTrashChute, FRY_BASKET, type FryerObject } from "../render/machines";
import { applyKitchenLight, KITCHEN_BG, type KitchenLight } from "../render/lighting";
import { COUNTER_FOOD, SCALE } from "../render/units";

export const PAGES = ["Drinks", "Grill", "Fryer"] as const;
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
/** The griddle's cook surface, zones and buttons, griddle-local (read once from the model). */
const GRIDDLE_SPOTS = makeGriddle().userData.spots;
const GRIDDLE_SURFACE = GRIDDLE_SPOTS.surface;
export const GRILL_TOP = GRIDDLE_SURFACE.y;
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
const TRASH = { z0: 3.05, z1: 3.5 };
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
  fryer: { x: 0.25, z: -1.55 },
  freezer: { x: -3.35, z: -1.75 },
  stacks: [["S", -3.45], ["M", -2.35], ["L", -1.25]] as [FriesSize, number][],
  stackZ: 1.75,
  pads: { x: 1.45, z: 1.75 },
  gravy: { x: 3.42, z: -2.1 },
  curds: { x: -3.35, z: 0.25 },
  shaker: { x: 3.42, z: -0.2 },
};
/** The fryer (and its baskets) drawn this much bigger than the model, in the room a smaller potato freezer frees up. */
const FRYER_SCALE = 1.3;
/** The salt shaker is drawn bigger than life so it reads as a thing to pick up. */
const SHAKER_SCALE = 1.6;
/** One packing pad (the cream square inside its orange outline). */
const PAD = { w: 1.47, d: 1.07 };
/** A packing pad with nothing on it. */
export const EMPTY_PACK = { size: null, cook: 0, fill: 0, salt: 0, curds: false, gravy: false } as const;
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
const FOUNTAIN = { x: 1.1, z: -1.75 };
/** The ice bin is half the fountain model's width. */
const ICE_WIDTH = 0.5;
const ICE = { x: -3.25, z: -2.2 };
const CUP_STACKS: [Size, number][] = [["S", -3.5], ["M", -2.25], ["L", -1.0]];
const LID_STACKS: [Size, number][] = [["S", 1.0], ["M", 2.25], ["L", 3.5]];
const FRONT_Z = 1.95;
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
  cook: number;
  fill: number;
  /** Salt shaken on so far (SALT in cooking.ts). */
  salt: number;
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
  | { type: "shaker" }
  | { type: "curds" }
  | { type: "gravy" };

export interface CounterEvents {
  golden: () => void;
  /** The fryer's timer beeps while a basket is at perfect (or past it) until it's lifted. */
  beep: () => void;
  spill: () => void;
  burning: () => void;
}

/**
 * Cook speed per kind against GRILL_RATE, on the face down. Patties, bacon and eggs also cook a
 * little on the face up (UP_HEAT), through the meat. Patties, bacon and eggs take about as long
 * as fries: put them on, go do something else, come back. On a hot zone, without flipping:
 * patty medium from about 21 s to 33 s; bacon crisp from 18 s, dark from 38 s; egg set from
 * 18 s, overdone from 44 s. Buns toast in about 10 s.
 */
const COOK_SPEED: Record<string, number> = { patty: 0.377, bacon: 0.41, egg: 0.18, bun: 0.45, pineapple: 0.4 };
/** Heat reaching the face up, against the face down. */
const UP_HEAT: Partial<Record<Kind, number>> = { patty: 0.35, bacon: 0.35, egg: 0.35 };

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
  autoStopPour = false;
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
  taps: Tap[] = [];
  /** Cups standing on the drinks counter. */
  cups: DrinkCup[] = [];
  stacks: Stack[] = [];
  packs: Pack[] = [];
  /** Running cost of soda poured onto the drip tray this shift. */
  spillCost = 0;
  /** The bottles standing in the caddy (hidden while one is in hand). */
  bottles!: Record<SauceKind, THREE.Object3D>;
  private puffs: THREE.Mesh[] = [];
  private held: THREE.Object3D | null = null;
  private time = 0;
  events: CounterEvents = { golden: () => {}, beep: () => {}, spill: () => {}, burning: () => {} };
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
    this.buildTrash();
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
    // A push button per zone on the front ledge: tap to cycle off, warm, hot.
    griddle.userData.spots.buttons.forEach((b, i) => {
      this.proxy(new THREE.BoxGeometry(1.05, 0.5, 0.75), griddle.position.clone().add(new THREE.Vector3(b.x, b.y - 0.1, b.z)), { type: "zone", idx: i });
    });

    // The sauce caddy in the front left corner, bottles upside down and ready to lift.
    const caddy = makeSauceCaddy();
    caddy.position.copy(at(CADDY.x, 0, CADDY.z));
    this.scene.add(caddy);
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

  /** Fryer page: see FRYER. */
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
    // Toppings in a column down the right edge, each with a generous target.
    const shaker = makeShaker();
    shaker.scale.setScalar(SHAKER_SCALE);
    shaker.position.copy(at(F.shaker.x, 0, F.shaker.z));
    this.scene.add(shaker);
    this.shakerObj = shaker;
    this.proxy(new THREE.BoxGeometry(1.3, 1.2, 1.25), at(F.shaker.x, 0.4, F.shaker.z), { type: "shaker" });
    const tray = makeCurdTray();
    tray.position.copy(at(F.curds.x, 0, F.curds.z));
    this.scene.add(tray);
    this.proxy(new THREE.BoxGeometry(CURD_TRAY.w + 0.1, 0.9, CURD_TRAY.d + 0.2), at(F.curds.x, 0.3, F.curds.z), { type: "curds" });
    const well = makeGravyWell();
    well.position.copy(at(F.gravy.x, 0, F.gravy.z));
    this.scene.add(well);
    this.proxy(new THREE.BoxGeometry(GRAVY_WELL.w + 0.1, 1.2, GRAVY_WELL.d + 0.2), at(F.gravy.x, 0.5, F.gravy.z), { type: "gravy" });

    // The hang-rail fryer: a basket per well, hanging tilted on the rail until it's lowered.
    const fryer = makeFryer();
    fryer.scale.setScalar(FRYER_SCALE);
    fryer.position.copy(at(F.fryer.x, 0, F.fryer.z));
    this.scene.add(fryer);
    this.fryer = fryer;
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
      this.baskets.push({ loaded: false, cook: 0, down: false, goldenRung: false, beepT: 0, obj: basket, fries, t: 0, amount: 0, up, downAt: down, tilt: hang.tilt });
      this.proxy(new THREE.BoxGeometry(1.5 * k, 1.4, 2.6 * k), fryer.position.clone().add(new THREE.Vector3(w.x, 0.8, w.z + 0.5 * k)), { type: "basket", idx: i });
    });
  }

  private buildDrinks(): void {
    const at = (x: number, y: number, z: number) => this.world(0, x, y, z);
    const fountain = makeFountain();
    fountain.scale.setScalar(FOUNTAIN_SCALE);
    fountain.position.copy(at(FOUNTAIN.x, 0, FOUNTAIN.z));
    this.scene.add(fountain);
    const sp = FOUNTAIN_SPOTS;
    DRINKS.forEach((flavor, i) => {
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
    const chute = makeTrashChute(x1 - x0);
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

  /** A scoop of ice or one lid (for a cup size): on the counter and in hand. */
  extraMesh(what: "ice" | "lid", size: Size = "M"): THREE.Object3D {
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
  placeCup(c: Omit<DrinkCup, "obj" | "x" | "z" | "tap">, world: THREE.Vector3): { cup: DrinkCup | null; why?: string } {
    const ti = this.overTap(world);
    let x = world.x;
    let z = world.z;
    if (ti >= 0) {
      const t = this.taps[ti];
      if (t.cup) return { cup: null, why: "There's already a cup there." };
      if (t.puddle > 0.05) return { cup: null, why: "Wipe up the spill first: scrub it with your finger." };
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
    const hot = kinds.filter((k) => GRILLABLE.has(k)).slice(0, 5);
    const cold = kinds.filter((k) => !GRILLABLE.has(k)).slice(0, 6);
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
    fill(makeColdRail({ cols: Math.max(3, hot.length), rows: 1, kinds: hot }), GRILL_PANS);
    fill(makeColdRail({ cols: 2, rows: 3, kinds: cold }), SIDE_PANS);
    this.pantry = group;
    this.scene.add(group);
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
    const p = this.groundPoint(ndc, GRILL_TOP + 0.15);
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
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    const first = hits.length ? (hits[0].object.userData.hit as Hit) : null;
    // The zone buttons sit right in front of the plate: a tap on one is never a grab.
    if (first?.type === "zone") return first;
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
    return it.below ? this.baseY(it.below) + (it.below.obj.userData.height as number) * GRILL_SCALE : GRILL_TOP;
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
    for (const k of ["ketchup", "mustard"] as SauceKind[]) this.bottles[k].visible = k !== kind;
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
    return this.caddy.position.clone().setY(0.8);
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
    return on.filter((g) => this.heatOf(g) === "hot").length * 0.35 + on.filter((g) => this.heatOf(g) === "warm").length * 0.08;
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
          const p = it.piece;
          p.cook = [p.cook[1], p.cook[0]];
          if (p.marks) p.marks = [p.marks[1], p.marks[0]];
          p.flips = (p.flips ?? 0) + 1;
          it.squashV = 6;
        }
      } else {
        // Each zone cooks at its own setting: hot cooks, warm holds without cooking, off stops.
        // Only the bottom of a stack touches the grill.
        const zi = this.zoneAt(it.x);
        const zone = this.zones[zi];
        const touching = !it.below;
        const heat = touching ? ZONE_RATE[zone] * (COOK_SPEED[it.piece.kind] ?? 1) * (it.piece.smashed ? 1.6 : 1) * this.grillBoost : 0;
        const before = cookLevel(it.piece);
        if (it.topping) {
          const c = it.topping.piece;
          c.melt = Math.min(1, (c.melt ?? 0) + (zone === "hot" ? MELT_RATE.hot : zone === "warm" ? MELT_RATE.warm : 0) * dt);
          it.topping.obj.userData.update(c);
        }
        it.piece.cook[0] += GRILL_RATE * heat * dt;
        it.piece.cook[1] += GRILL_RATE * heat * (UP_HEAT[it.piece.kind] ?? 0) * dt;
        // The ridged grille sears marks into the face down.
        if (touching && zi === GRILLE_ZONE && zone === "hot" && it.piece.kind === "patty") {
          const m = (it.piece.marks ??= [0, 0]);
          m[0] = Math.min(1, m[0] + MARK_RATE * dt);
        }
        it.obj.position.set(gx + it.x, y0, it.z);
        const k = it.piece.kind as Cookable;
        if (COOK_SCALE[k] && cookLevel(it.piece) > COOK_SCALE[k].burnt - 0.05 && before <= COOK_SCALE[k].burnt - 0.05) anyBurning = true;
      }
      it.squashV += (-160 * it.squash - 12 * it.squashV) * dt;
      it.squash += it.squashV * dt;
      const s = THREE.MathUtils.clamp(it.squash * 0.07, -0.3, 0.3);
      it.obj.scale.set(GRILL_SCALE * (1 + s * 0.4), GRILL_SCALE * (1 - s), GRILL_SCALE * (1 + s * 0.4));
      it.obj.userData.update(it.piece);
    }
    if (anyBurning) this.events.burning();

    // Smoke: puffs drift up from cooking items; darker when burning.
    const active = this.grillItems.filter((g) => !g.held && !g.below && g.flipT < 0 && this.heatOf(g) === "hot");
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
      const burnt = it.piece.cook[0] > 0.95;
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
        // Beep from perfect on, quicker once they're overdone, until the basket comes up.
        if (b.cook >= FRIES_PERFECT - 0.04) {
          b.beepT -= dt;
          if (b.beepT <= 0) {
            this.events.beep();
            b.beepT = b.cook >= FRIES_ZONE.over ? 0.4 : 0.75;
          }
        }
      } else b.beepT = 0;
      if (b.loaded) {
        b.fries.userData.setCook(b.cook);
        b.fries.userData.setAmount?.(b.amount);
      }
    }

    // Drinks
    for (const t of this.taps) {
      const c = t.cup;
      if (t.pouring && c) {
        c.fill += dt * 0.42 * CUP_SPEED[c.size];
        if (this.autoStopPour && c.fill >= DRINK_FILL.perfect) t.pouring = false;
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
