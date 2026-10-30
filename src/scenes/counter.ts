import * as THREE from "three";
import { FRY_RATE, GRILL_RATE, MELT_RATE } from "../game/cooking";
import type { DrinkId, FriesSize, Kind, Layer, Piece, SauceKind, Size } from "../game/types";
import { CUP_SPEED } from "../game/types";
import { bottle, CUP_SCALE, makeCarton, makeCartonStack, makeCup, makeFood, makeFries, makeFryPile, stackHeight, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { BASKET, BUBBLES_GEO, FREEZER, makeBasket, makeFreezer, makeOil, makePackStation, makePadMark, makeShaker, makeVat, PAD, VAT, WELL } from "../render/fryer";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { makeBin } from "../render/heaps";
import { PlateView } from "./tray";

export const PAGES = ["Drinks", "Grill", "Fryer"] as const;
export const HOME_PAGE = 1;
const PAGE_GAP = 14;
export const pageX = (i: number) => (i - HOME_PAGE) * PAGE_GAP;

/**
 * One scale for food on the counter, against ingredient units: on the grill, in the hand and on
 * the heat-lamp plates. Keeping it the same everywhere means nothing grows or shrinks as it
 * moves between them (the bins show their heaps a little smaller, and further away).
 */
export const FOOD_SCALE = 0.6;
/** Grill items are drawn at the counter food scale. */
export const GRILL_SCALE = FOOD_SCALE;
export const GRILL_TOP = 0.26;
const GRILL_CX = -0.7;
const GRILL_W = 5.1;
const GRILL_BOUNDS = { x0: GRILL_CX - GRILL_W / 2 + 0.45, x1: GRILL_CX + GRILL_W / 2 - 0.45, z0: 0.2, z1: 2.65 };
/** Trash slot running along the front edge of the grill counter. */
const TRASH = { z0: 3.05, z1: 3.5, x0: -3.4, x1: 3.4 };
/** Assembly spots under the heat lamp, beside the grill. */
export const HOLD_SPOTS = [-0.15, 1.1, 2.35].map((z) => ({ x: 2.62, z }));
/** Plate size under the heat lamp; the food on it is still drawn at FOOD_SCALE. */
const HOLD_SCALE = 0.62;
/** The right end of the grill can be turned down to a warm hold. */
export const WARM_X0 = 0.35;

/** Fryer page layout, in page-local x and z. */
const FRYER = {
  freezer: { x: -1.55, z: -2.45 },
  vatX: [-2.35, -0.65],
  vatZ: 0.0,
  stacks: [["S", 0.95], ["M", 2.05], ["L", 3.15]] as [FriesSize, number][],
  stackZ: -2.45,
  // Pads level with or below the baskets: dragging fries up from a basket is the lift flick.
  station: { x: 2.25, z: 1.04, w: 2.2, d: 3.04 },
  packZ: [0.3, 1.78],
  supplies: { x: 2.1, z: 3.02, w: 1.8, d: 0.8 },
  shaker: { x: 0.62, z: -1.0 },
};
/** Fryer basket heights: lifted out and resting in the oil. */
const BASKET_UP = 1.0;
const BASKET_DOWN = 0.34;
/** Cartons waiting on the packing pads, and in their stacks, against carton units. */
const PACK_SCALE = 1.2;
const CARTON_STACK_SCALE = 0.7;

/** Cups and cartons in each stack at the start of a shift, and in a fresh sleeve. */
const STACK_START = 3;
export const SLEEVE = 5;
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
  y: number;
  /** Share of a full batch still in the basket. */
  amount: number;
}

/** A stack of empty cups or fries cartons. Once it runs out, a wrapped sleeve from the supplies cabinet refills it. */
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
}

/** A spot at the front of the fryer where a carton waits to be filled. */
export interface Pack {
  size: FriesSize | null;
  cook: number;
  fill: number;
  obj: THREE.Object3D | null;
  x: number;
  z: number;
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
}

export type Hit =
  | { type: "bin"; kind: Kind }
  | { type: "grillItem"; item: GrillItem }
  | { type: "bottle"; sauce: SauceKind }
  | { type: "friesBin" }
  | { type: "basket"; idx: number }
  | { type: "tap"; idx: number }
  | { type: "cup"; idx: number }
  | { type: "hold"; idx: number }
  | { type: "stack"; idx: number }
  | { type: "supplies"; kind: "cup" | "carton" }
  | { type: "pack"; idx: number };

/** A burger being put together (or food parked) under the heat lamp. */
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

/** Bin slots on the grill counter: two rows of five, the last slot of row two holds the sauces. */
const BIN_SLOTS: { x: number; z: number }[] = [
  ...[-2.6, -1.3, 0, 1.3, 2.6].map((x) => ({ x, z: -2.35 })),
  ...[-2.6, -1.3, 0, 1.3].map((x) => ({ x, z: -1.15 })),
];

/** Buns toast and eggs set more slowly than meat, so they're forgiving to leave on. */
const COOK_SPEED: Record<string, number> = { patty: 1, bacon: 1.1, egg: 0.75, bun: 0.6, pineapple: 0.7 };

const DRINKS: DrinkId[] = ["pine", "lemon", "cola"];
const DRINK_LABEL_COLOR: Record<DrinkId, string> = { pine: "#4fae5c", lemon: "#e8c43a", cola: "#7a3b26" };

export class CounterView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 0.9, 0.1, 80);
  page = HOME_PAGE;
  /** Camera x offset while the player drags between counters. */
  dragOffset = 0;
  private camX = 0;
  private raycaster = new THREE.Raycaster();
  private hitMeshes: THREE.Mesh[] = [];
  private pantry: THREE.Group | null = null;
  bins: { kind: Kind; x: number; z: number }[] = [];
  /** Upgrade multipliers. */
  fryBoost = 1;
  autoStopPour = false;
  grillItems: GrillItem[] = [];
  holds: HoldSpot[] = [];
  /** Right end of the grill turned down to keep food warm without cooking it much. */
  warm = false;
  private warmGlow!: THREE.Mesh;
  baskets: Basket[] = [];
  /** Where to grab frozen fries from (the middle of the potato freezer), in world units. */
  friesBinAt = new THREE.Vector3();
  /** Middle of the fryer page's supplies box (wrapped carton sleeves), for its label. */
  cartonSuppliesAt = new THREE.Vector3();
  private bubbles: THREE.Mesh[] = [];
  private padMarks: THREE.Mesh[] = [];
  taps: Tap[] = [];
  stacks: Stack[] = [];
  packs: Pack[] = [];
  /** Running cost of soda poured onto the drip tray this shift. */
  spillCost = 0;
  bottles: Record<SauceKind, THREE.Group>;
  private bottleHome: Record<SauceKind, THREE.Vector3>;
  private puffs: THREE.Mesh[] = [];
  private grillGlow: THREE.Mesh;
  private held: THREE.Object3D | null = null;
  private time = 0;
  events: CounterEvents = { golden: () => {}, spill: () => {}, burning: () => {} };

  constructor() {
    this.scene.background = new THREE.Color("#355650");
    this.scene.add(new THREE.HemisphereLight("#fff4dc", "#4a5a55", 1.15));
    const sun = new THREE.DirectionalLight("#fff1d6", 1.9);
    sun.position.set(3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 8, bottom: -8, near: 1, far: 40 });
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 12), new THREE.MeshToonMaterial({ color: "#c98f55" }));
    counter.position.y = -0.2;
    counter.receiveShadow = true;
    this.scene.add(counter);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 6, 0.4), toon("#3f6a62"));
    wall.position.set(0, 2.6, -3.6);
    this.scene.add(wall);
    // A steel backsplash strip where the counter meets the truck wall.
    const splash = new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 0.1), toon("#b9c4c1"));
    splash.position.set(0, 0.25, -3.35);
    this.scene.add(splash);

    const { glow } = this.buildGrill();
    this.grillGlow = glow;
    this.bottles = { ketchup: bottle("#d8261b", "ketchup"), mustard: bottle("#f0c419", "mustard") };
    this.bottleHome = { ketchup: new THREE.Vector3(2.35, 0, -1.2), mustard: new THREE.Vector3(3.0, 0, -1.2) };
    for (const s of ["ketchup", "mustard"] as SauceKind[]) {
      const b = this.bottles[s];
      b.position.copy(this.bottleHome[s]);
      b.scale.setScalar(0.85);
      this.scene.add(b);
      this.proxy(new THREE.BoxGeometry(0.62, 1.6, 0.9), b.position.clone().add(new THREE.Vector3(0, 0.6, 0)), { type: "bottle", sauce: s });
    }
    this.buildFryer();
    this.buildDrinks();
  }

  private proxy(geo: THREE.BufferGeometry, pos: THREE.Vector3, hit: Hit): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(pos);
    m.userData.hit = hit;
    this.scene.add(m);
    this.hitMeshes.push(m);
    return m;
  }

  private buildGrill(): { glow: THREE.Mesh } {
    const x0 = pageX(1);
    const grill = mesh(faceted(new THREE.BoxGeometry(GRILL_W, GRILL_TOP, 3.05)), "#3d4245", { ink: false });
    grill.position.set(x0 + GRILL_CX, GRILL_TOP / 2, 1.42);
    this.scene.add(grill);
    const plate = mesh(faceted(new THREE.BoxGeometry(GRILL_W - 0.3, 0.02, 2.75)), "#55595b", { ink: false, shadow: false });
    plate.position.set(x0 + GRILL_CX, GRILL_TOP + 0.005, 1.42);
    this.scene.add(plate);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(GRILL_W - 0.4, 2.6), new THREE.MeshBasicMaterial({ color: "#ff6a2b", transparent: true, opacity: 0.12 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x0 + GRILL_CX, GRILL_TOP + 0.02, 1.42);
    this.scene.add(glow);
    const lip = mesh(faceted(new THREE.BoxGeometry(GRILL_W, 0.3, 0.12)), "#2a2e30", { ink: false });
    lip.position.set(x0 + GRILL_CX, GRILL_TOP + 0.1, 2.92);
    this.scene.add(lip);
    // Trash slot along the front edge: drop anything past the grill to throw it away.
    const slot = mesh(faceted(new THREE.BoxGeometry(TRASH.x1 - TRASH.x0, 0.06, TRASH.z1 - TRASH.z0)), "#1e2422", { ink: false, shadow: false });
    slot.position.set(x0 + (TRASH.x0 + TRASH.x1) / 2, 0.02, (TRASH.z0 + TRASH.z1) / 2);
    slot.receiveShadow = false;
    const slotLip = mesh(faceted(new THREE.BoxGeometry(TRASH.x1 - TRASH.x0 + 0.1, 0.08, 0.08)), "#8d9a97", { ink: false });
    slotLip.position.set(x0 + (TRASH.x0 + TRASH.x1) / 2, 0.05, TRASH.z0 - 0.02);
    this.scene.add(slot, slotLip);
    for (let i = 0; i < 9; i++) {
      // Hazard stripes so it reads as "not a shelf".
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.16, TRASH.z1 - TRASH.z0 - 0.06), new THREE.MeshBasicMaterial({ color: "#d9a92b" }));
      stripe.rotation.set(-Math.PI / 2, 0, 0.5);
      stripe.position.set(x0 + TRASH.x0 + 0.4 + i * 0.75, 0.06, (TRASH.z0 + TRASH.z1) / 2);
      this.scene.add(stripe);
    }

    // Assembly spots under a heat lamp: a warm shelf with three small plates.
    const shelf = mesh(faceted(new THREE.BoxGeometry(1.36, 0.3, 3.9)), "#b8c2c0");
    shelf.position.set(x0 + HOLD_SPOTS[0].x, 0.15, 1.1);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.75), new THREE.MeshBasicMaterial({ color: "#ffb15c", transparent: true, opacity: 0.45 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x0 + HOLD_SPOTS[0].x, 0.305, 1.1);
    this.scene.add(shelf, bed);
    const bulbGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: "#ff8a3d" });
    for (const h of HOLD_SPOTS) {
      const view = new PlateView("#e0782f");
      view.ring.visible = false;
      view.group.scale.setScalar(HOLD_SCALE);
      view.s = FOOD_SCALE / HOLD_SCALE;
      view.group.position.set(x0 + h.x, 0.3, h.z);
      this.scene.add(view.group);
      this.holds.push({ layers: [], view, x: h.x, z: h.z });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x0 + h.x + 0.6, 0.42, h.z - 0.38);
      this.scene.add(bulb);
    }

    // Warm section of the grill: a dimmer glow over the right end when it's turned down.
    const warmGlow = new THREE.Mesh(new THREE.PlaneGeometry(GRILL_CX + GRILL_W / 2 - WARM_X0 - 0.2, 2.6), new THREE.MeshBasicMaterial({ color: "#6fb7d6", transparent: true, opacity: 0 }));
    warmGlow.rotation.x = -Math.PI / 2;
    warmGlow.position.set(x0 + (WARM_X0 + GRILL_CX + GRILL_W / 2 - 0.2) / 2, GRILL_TOP + 0.025, 1.42);
    this.scene.add(warmGlow);
    this.warmGlow = warmGlow;
    const divider = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 2.6), new THREE.MeshBasicMaterial({ color: "#2a2e30" }));
    divider.rotation.x = -Math.PI / 2;
    divider.position.set(x0 + WARM_X0, GRILL_TOP + 0.03, 1.42);
    this.scene.add(divider);

    const puffMat = new THREE.MeshBasicMaterial({ color: "#f2f2f2", transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), puffMat.clone());
      m.visible = false;
      m.userData = { t: Math.random(), item: -1 };
      this.scene.add(m);
      this.puffs.push(m);
    }
    return { glow };
  }

  /**
   * Fryer page, laid out like the grill page: the potato freezer at the back, two narrow vats
   * on the left, and the staging area on the right (carton stacks along the back, two big
   * packing pads under a heat lamp, the supplies box at the front).
   */
  private buildFryer(): void {
    const x0 = pageX(2);
    const F = FRYER;
    // Potato freezer, heaped with frozen fries.
    const freezer = makeFreezer();
    freezer.position.set(x0 + F.freezer.x, 0, F.freezer.z);
    this.scene.add(freezer);
    this.friesBinAt.set(x0 + F.freezer.x, 0.6, F.freezer.z);
    this.proxy(new THREE.BoxGeometry(FREEZER.w + 0.1, 1.4, FREEZER.d + 0.2), this.friesBinAt.clone(), { type: "friesBin" });

    // Carton stacks along the back on the right, small to large.
    F.stacks.forEach(([size, x]) => this.addStack("carton", size, x0 + x, F.stackZ));

    // Packing station: a heat-lamp shelf with a big pad per carton.
    const st = F.station;
    const station = makePackStation(st.w, st.d, F.packZ.map((z) => z - st.z));
    station.position.set(x0 + st.x, 0, st.z);
    this.scene.add(station);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(st.w - 0.16, st.d - 0.16), new THREE.MeshBasicMaterial({ color: "#ffb15c", transparent: true, opacity: 0.22, depthWrite: false }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x0 + st.x, 0.16, st.z);
    this.scene.add(bed);
    const bulbGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: "#ff8a3d" });
    for (const z of F.packZ) {
      this.packs.push({ size: null, cook: 0, fill: 0, obj: null, x: x0 + st.x, z });
      this.proxy(new THREE.BoxGeometry(PAD.w + 0.1, 1.6, PAD.d + 0.1), new THREE.Vector3(x0 + st.x, 0.6, z), { type: "pack", idx: this.packs.length - 1 });
      const mark = makePadMark();
      mark.position.x = x0 + st.x;
      mark.position.z = z + 0.05;
      this.scene.add(mark);
      this.padMarks.push(mark);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x0 + st.x + st.w / 2 - 0.12, 0.3, z - PAD.d / 2 + 0.1);
      this.scene.add(bulb);
    }
    const shaker = makeShaker();
    shaker.position.set(x0 + F.shaker.x, 0, F.shaker.z);
    this.scene.add(shaker);
    this.addSupplies("carton", x0 + F.supplies.x, F.supplies.z, F.supplies.w, F.supplies.d);
    this.cartonSuppliesAt.set(x0 + F.supplies.x, 0.3, F.supplies.z);

    // The vats, each with a wire basket and a pile of fries that empties from the top.
    F.vatX.forEach((x, i) => {
      const vx = x0 + x;
      const vat = makeVat();
      vat.position.set(vx, 0, F.vatZ);
      this.scene.add(vat);
      const oil = makeOil();
      oil.position.set(vx, WELL.oilY, F.vatZ + WELL.z);
      this.scene.add(oil);
      const bubbles = new THREE.Mesh(BUBBLES_GEO.geo, toon("#fff1c4"));
      bubbles.position.set(vx, WELL.oilY + 0.01, F.vatZ + WELL.z);
      bubbles.visible = false;
      this.scene.add(bubbles);
      this.bubbles.push(bubbles);
      const basket = makeBasket();
      const fries = makeFryPile(BASKET.w - 0.1, BASKET.d - 0.1, 4, 21 + i, true);
      fries.position.y = 0.02;
      fries.visible = false;
      basket.add(fries);
      basket.position.set(vx, BASKET_UP, F.vatZ + WELL.z);
      this.scene.add(basket);
      this.baskets.push({ loaded: false, cook: 0, down: false, goldenRung: false, obj: basket, fries, y: BASKET_UP, amount: 0 });
      this.proxy(new THREE.BoxGeometry(VAT.w, 1.6, VAT.d + 0.9), new THREE.Vector3(vx, 1.0, F.vatZ + 0.45), { type: "basket", idx: i });
    });
  }

  private buildDrinks(): void {
    const x0 = pageX(0);
    // A low soda fountain seen from above: big buttons on top, nozzles over the cups.
    const machine = mesh(faceted(new THREE.BoxGeometry(6.4, 1.1, 2.0)), "#d24c3f");
    machine.position.set(x0, 0.55, -2.35);
    this.scene.add(machine);
    const lid = mesh(faceted(new THREE.BoxGeometry(6.5, 0.12, 2.1)), "#f3efe4");
    lid.position.set(x0, 1.16, -2.35);
    this.scene.add(lid);
    const drip = mesh(faceted(new THREE.BoxGeometry(6.2, 0.1, 1.5)), "#3a3f41", { ink: false });
    drip.position.set(x0, 0.05, -0.5);
    this.scene.add(drip);
    DRINKS.forEach((flavor, i) => {
      const x = x0 + (i - 1) * 2.05;
      const plate = mesh(faceted(new THREE.BoxGeometry(1.6, 0.06, 1.5)), "#f8f6ef", { ink: false });
      plate.position.set(x, 1.24, -2.4);
      this.scene.add(plate);
      const button = mesh(faceted(new THREE.CylinderGeometry(0.52, 0.56, 0.2, 20)), DRINK_LABEL_COLOR[flavor]);
      button.position.set(x, 1.36, -2.5);
      this.scene.add(button);
      const shine = mesh(faceted(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14)), "#ffffff", { opacity: 0.35, ink: false });
      shine.position.set(x - 0.12, 1.47, -2.62);
      this.scene.add(shine);
      const nozzle = mesh(faceted(new THREE.BoxGeometry(0.42, 0.22, 0.9)), "#8c9496");
      nozzle.position.set(x, 1.0, -1.25);
      this.scene.add(nozzle);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(DRINK_LABEL_COLOR[flavor]));
      stream.visible = false;
      this.scene.add(stream);
      const puddleObj = new THREE.Mesh(new THREE.CircleGeometry(1, 18), new THREE.MeshBasicMaterial({ color: DRINK_LABEL_COLOR[flavor], transparent: true, opacity: 0.7 }));
      puddleObj.rotation.x = -Math.PI / 2;
      puddleObj.position.set(x, 0.11, -0.4);
      puddleObj.visible = false;
      this.scene.add(puddleObj);
      this.taps.push({ flavor, fill: 0, pouring: false, cup: null, size: null, stream, spill: 0, puddle: 0, puddleObj, x });
      this.proxy(new THREE.BoxGeometry(1.9, 1.0, 1.7), new THREE.Vector3(x, 1.2, -2.4), { type: "tap", idx: i });
      this.proxy(new THREE.BoxGeometry(1.7, 1.2, 1.6), new THREE.Vector3(x, 0.5, -0.3), { type: "cup", idx: i });
    });
    (["S", "M", "L"] as Size[]).forEach((size, i) => this.addStack("cup", size, x0 - 2.4 + i * 1.3, 1.75));
    this.addSupplies("cup", x0 + 2.0, 2.0, 2.3, 1.2);
  }

  private addStack(kind: Stack["kind"], size: Size, x: number, z: number): void {
    const base = mesh(faceted(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16)), "#e9e2d2", { ink: false });
    base.position.set(x, 0.02, z);
    this.scene.add(base);
    const obj = new THREE.Group();
    obj.position.set(x, 0.04, z);
    this.scene.add(obj);
    const s: Stack = { kind, size, count: STACK_START, sleeve: false, tear: 0, obj, x, z };
    this.stacks.push(s);
    this.syncStack(s);
    this.proxy(new THREE.BoxGeometry(1.2, 1.6, 1.2), new THREE.Vector3(x, 0.6, z), { type: "stack", idx: this.stacks.length - 1 });
  }

  /** The cabinet under the counter where wrapped sleeves of cups and cartons are kept. */
  private addSupplies(kind: Stack["kind"], x: number, z: number, w: number, d: number): void {
    const box = mesh(faceted(new THREE.BoxGeometry(w, 0.22, d)), "#8a5a37");
    box.position.set(x, 0.11, z);
    const lid = mesh(faceted(new THREE.BoxGeometry(w - 0.2, 0.03, d - 0.2)), "#6b4329", { ink: false });
    lid.position.set(x, 0.23, z);
    this.scene.add(box, lid);
    for (let i = 0; i < 2; i++) {
      const sleeve = this.sleeveMesh(kind);
      sleeve.rotation.z = Math.PI / 2;
      sleeve.position.set(x + (i - 0.5) * w * 0.4, 0.5, z + (i ? 0.1 : -0.1) * d);
      this.scene.add(sleeve);
    }
    this.proxy(new THREE.BoxGeometry(w + 0.1, 1.2, d + 0.2), new THREE.Vector3(x, 0.4, z), { type: "supplies", kind });
  }

  /** A plastic-wrapped tube of cups or cartons. */
  sleeveMesh(kind: Stack["kind"]): THREE.Object3D {
    const g = new THREE.Group();
    const inner = mesh(faceted(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12)), kind === "cup" ? "#f3f1ea" : "#d8473a");
    const wrap = mesh(faceted(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 12)), "#bfe3f2", { opacity: 0.55, ink: false });
    g.add(inner, wrap);
    g.scale.setScalar(0.85);
    return g;
  }

  /** Redraw a cup or carton stack after its count changes. */
  syncStack(s: Stack): void {
    for (const c of [...s.obj.children]) {
      s.obj.remove(c);
      disposeObject(c);
    }
    if (s.sleeve) {
      const sleeve = this.sleeveMesh(s.kind);
      sleeve.position.y = 0.45;
      // A torn sleeve sags open a little.
      sleeve.children[1].scale.set(1 + s.tear * 0.3, 1 - s.tear * 0.4, 1 + s.tear * 0.3);
      s.obj.add(sleeve);
      return;
    }
    if (s.kind === "carton") {
      // Nested cartons are baked into one mesh per size and count.
      const o = makeCartonStack(s.size as FriesSize, s.count);
      o.scale.setScalar(CARTON_STACK_SCALE);
      s.obj.add(o);
      return;
    }
    for (let i = 0; i < s.count; i++) {
      const o = makeCup(null, false, s.size);
      o.scale.multiplyScalar(0.7);
      o.position.y = i * 0.09;
      s.obj.add(o);
    }
  }

  /** Put an empty cup under a nozzle. */
  placeCup(i: number, size: Size): void {
    const t = this.taps[i];
    this.removeCup(i);
    const cup = makeCup(t.flavor, false, size);
    cup.scale.setScalar(0.8);
    cup.position.set(t.x, 0.1, -0.45);
    this.scene.add(cup);
    t.cup = cup;
    t.size = size;
    t.fill = 0;
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
  }

  /** Redraw a packing spot: an empty carton, a part-filled one, or nothing. */
  syncPack(i: number): void {
    const p = this.packs[i];
    if (p.obj) {
      this.scene.remove(p.obj);
      disposeObject(p.obj);
      p.obj = null;
    }
    this.padMarks[i].visible = !p.size;
    if (!p.size) return;
    let o: THREE.Object3D;
    if (p.fill > 0) {
      const f = makeFries(true, p.size, p.fill);
      f.userData.setCook(p.cook);
      f.scale.setScalar(PACK_SCALE * f.userData.sizeScale);
      o = f;
    } else {
      o = makeCarton(p.size);
      o.scale.multiplyScalar(PACK_SCALE);
    }
    // On the pad, a little forward of centre so the carton's silhouette sits on the outline.
    o.position.set(p.x, 0.15, p.z + 0.05);
    this.scene.add(o);
    p.obj = o;
  }

  /** Fresh supplies for a new shift. */
  resetStations(): void {
    for (const s of this.stacks) Object.assign(s, { count: STACK_START, sleeve: false, tear: 0 });
    this.stacks.forEach((s) => this.syncStack(s));
    this.taps.forEach((t, i) => {
      this.removeCup(i);
      t.puddle = 0;
    });
    this.packs.forEach((p, i) => {
      Object.assign(p, { size: null, cook: 0, fill: 0 });
      this.syncPack(i);
    });
    this.spillCost = 0;
  }

  /** Packing spot under a world point, or -1. */
  overPack(world: THREE.Vector3): number {
    // The pads are big on purpose: anywhere over one counts.
    return this.packs.findIndex((p) => Math.abs(world.x - p.x) < PAD.w / 2 + 0.15 && Math.abs(world.z - p.z) < PAD.d / 2 + 0.05);
  }

  /** Nozzle slot under a world point, or -1. */
  overTap(world: THREE.Vector3): number {
    return this.taps.findIndex((t) => Math.abs(world.x - t.x) < 0.85 && world.z > -1.3 && world.z < 0.5);
  }

  /** Stack under a world point, or -1. */
  overStack(world: THREE.Vector3): number {
    return this.stacks.findIndex((s) => Math.hypot(world.x - s.x, world.z - s.z) < 0.7);
  }

  /** World position under each drink cup, for the HTML flavour labels. */
  drinkLabelPoint(i: number): THREE.Vector3 {
    return new THREE.Vector3(pageX(0) + (i - 1) * 2.05, 0.1, 0.55);
  }

  /** Fill the grill counter's bins for the current stop. */
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
    const g = new THREE.Group();
    const x0 = pageX(1);
    this.bins = kinds.slice(0, BIN_SLOTS.length).map((kind, i) => ({ kind, ...BIN_SLOTS[i] }));
    for (const b of this.bins) {
      const bin = makeBin(b.kind);
      bin.position.set(x0 + b.x, 0, b.z);
      g.add(bin);
      this.proxy(new THREE.BoxGeometry(1.25, 0.9, 1.15), new THREE.Vector3(x0 + b.x, 0.3, b.z), { type: "bin", kind: b.kind });
    }
    this.pantry = g;
    this.scene.add(g);
  }

  layout(aspect: number): void {
    this.camera.aspect = aspect;
    // Fit about 7.2 world units across, and on short, wide bands enough depth to reach the
    // trash slot along the front edge.
    const dist = 13.1;
    const hfov = 2 * Math.atan(3.65 / dist);
    const fitWidth = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    const fitDepth = 2 * Math.atan(3.55 / dist);
    this.camera.fov = THREE.MathUtils.radToDeg(Math.max(fitWidth, fitDepth));
    this.camera.updateProjectionMatrix();
  }

  setPage(i: number): void {
    this.page = THREE.MathUtils.clamp(i, 0, PAGES.length - 1);
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
    const hp = this.groundPoint(ndc, 0.35);
    const hold = this.holds.findIndex((h) => Math.hypot(hp.x - (pageX(1) + h.x), hp.z - h.z) < 0.6);
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

  /** True when a dropped item at this world point lands in the trash can. */
  overTrash(world: THREE.Vector3): boolean {
    const x = world.x - pageX(1);
    return world.z > TRASH.z0 - 0.05 && x > TRASH.x0 - 0.3 && x < TRASH.x1 + 0.3;
  }

  /** Grill-local position if the world point is over the grill plate. */
  overGrill(world: THREE.Vector3): { x: number; z: number } | null {
    const x = world.x - pageX(1);
    const { x0, x1, z0, z1 } = GRILL_BOUNDS;
    if (x < x0 - 0.3 || x > x1 + 0.3 || world.z < z0 - 0.5 || world.z > z1 + 0.4) return null;
    return { x: THREE.MathUtils.clamp(x, x0, x1), z: THREE.MathUtils.clamp(world.z, z0, z1) };
  }

  /** Assembly spot under the world point, or -1. */
  overHold(world: THREE.Vector3): number {
    return this.holds.findIndex((h) => Math.hypot(world.x - (pageX(1) + h.x), world.z - h.z) < 0.62);
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

  liftBottle(s: SauceKind, world: THREE.Vector3 | null): void {
    const b = this.bottles[s];
    if (world) {
      b.position.set(world.x, 0.9, world.z - 0.3);
      b.rotation.x = -0.6;
    } else {
      b.position.copy(this.bottleHome[s]);
      b.rotation.x = 0;
    }
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
    // Camera glides between counters and follows the swipe.
    const target = pageX(this.page) + this.dragOffset;
    this.camX += (target - this.camX) * Math.min(1, dt * 10);
    this.camera.position.set(this.camX, 12.6, 5.2);
    this.camera.lookAt(this.camX, 0, -0.1);

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
    this.grillGlow.material instanceof THREE.MeshBasicMaterial && (this.grillGlow.material.opacity = 0.1 + 0.04 * Math.sin(this.time * 3));

    // Smoke: puffs drift up from cooking items; darker when burning.
    const active = this.grillItems.filter((g) => !g.held && g.flipT < 0 && !this.isWarm(g));
    for (const h of this.holds) h.view.update(dt);
    (this.warmGlow.material as THREE.MeshBasicMaterial).opacity += ((this.warm ? 0.22 : 0) - (this.warmGlow.material as THREE.MeshBasicMaterial).opacity) * Math.min(1, dt * 8);
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
      const targetY = inOil ? BASKET_DOWN : BASKET_UP;
      b.y += (targetY - b.y) * Math.min(1, dt * 8);
      b.obj.position.y = b.y + (inOil ? Math.sin(this.time * 18) * 0.015 : 0);
      b.fries.visible = b.loaded;
      const bub = this.bubbles[i];
      bub.visible = inOil && b.y < BASKET_DOWN + 0.2;
      if (bub.visible) {
        bub.scale.set(1, 0.6 + 0.4 * Math.abs(Math.sin(this.time * 9 + i)), 1);
        bub.rotation.y = Math.sin(this.time * 2.3 + i) * 0.12;
      }
      if (inOil) {
        b.cook += FRY_RATE * this.fryBoost * dt;
        if (!b.goldenRung && b.cook >= 0.55) {
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
        const topY = 0.1 + 0.8 * CUP_SCALE[t.size ?? "M"][1] * Math.min(1, t.fill) * 0.94;
        const h = Math.max(0.05, 0.92 - topY);
        t.stream.scale.set(1, h, 1);
        t.stream.position.set(t.x, topY + h / 2, -0.82);
      }
      t.spill = Math.max(0, t.spill - dt * 2);
      if (t.cup) t.cup.rotation.z = Math.sin(this.time * 40) * 0.05 * t.spill;
      t.puddleObj.visible = t.puddle > 0.01;
      t.puddleObj.scale.setScalar(0.35 + 0.75 * t.puddle);
    }
  }
}
