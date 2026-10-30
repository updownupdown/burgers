import * as THREE from "three";
import { FRY_RATE, GRILL_RATE, MELT_RATE } from "../game/cooking";
import type { DrinkId, FriesSize, Kind, Layer, Piece, SauceKind, Size } from "../game/types";
import { CUP_SPEED, DRINKS, newPiece } from "../game/types";
import { bottle, CUP_SCALE, makeCarton, makeCup, makeFood, makeFries, stackHeight, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { dressCup } from "../render/cup";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { makeCupboard, makeIceBin, makeLidStack, makeStrawHolder, type CupboardObject } from "../render/models/drinks";
import { PlateView } from "./tray";

export const PAGES = ["Drinks", "Grill", "Fryer"] as const;
export const HOME_PAGE = 1;
const PAGE_GAP = 14;
export const pageX = (i: number) => (i - HOME_PAGE) * PAGE_GAP;

/** Grill items are drawn a bit smaller than ingredient units. */
export const GRILL_SCALE = 0.72;
export const GRILL_TOP = 0.26;
const GRILL_CX = -0.7;
const GRILL_W = 5.1;
const GRILL_BOUNDS = { x0: GRILL_CX - GRILL_W / 2 + 0.45, x1: GRILL_CX + GRILL_W / 2 - 0.45, z0: 0.2, z1: 2.65 };
/** Trash slot running along the front edge of the grill counter. */
const TRASH = { z0: 3.05, z1: 3.5, x0: -3.4, x1: 3.4 };
/** Assembly spots under the heat lamp, beside the grill. */
export const HOLD_SPOTS = [0.05, 1.15, 2.25].map((z) => ({ x: 2.62, z }));
const HOLD_SCALE = 0.52;
/** The right end of the grill can be turned down to a warm hold. */
export const WARM_X0 = 0.35;

/** Cups and cartons in each stack at the start of a shift, and in a fresh sleeve. */
/** A full stack of cups or cartons, and what a fresh sleeve from the cupboard refills it to. */
const STACK_START = 10;
/** Ice bin, lid stack and straw holder on the drinks page, relative to its centre. */
const DRINK_EXTRAS = { ice: { x: 1.9, z: 3.05 }, lids: { x: 1.15, z: 1.7 }, straws: { x: 2.65, z: 1.75 } };
/** Camera position and aim when looking into the cupboard under the counter. */
const CUPBOARD_CAM = { y: -0.9, z: 16 };
const CUPBOARD_LOOK = { y: -1.8, z: 3.6 };
export const SLEEVE = 10;
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
/** Patties are slow on purpose: put them on, go do something else, come back to flip. */
const COOK_SPEED: Record<string, number> = { patty: 0.34, bacon: 1.1, egg: 0.75, bun: 0.6, pineapple: 0.7 };

/** Nozzle spacing on the soda fountain: five across the ~7-unit page. */
export const TAP_GAP = 1.4;
const tapX = (i: number) => pageX(0) + (i - (DRINKS.length - 1) / 2) * TAP_GAP;
/** Button, stream and puddle colours: a shade stronger than the drink itself so they read on the machine. */
const DRINK_LABEL_COLOR: Record<DrinkId, string> = { pine: "#6aa877", pink: "#ea8ea6", cola: "#4a2522", water: "#8ec6dc", tea: "#b4651e" };

export class CounterView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 0.9, 0.1, 80);
  page = HOME_PAGE;
  /** Camera x offset while the player drags between counters. */
  dragOffset = 0;
  private camX = 0;
  /** Supplies cupboard: whether it's open, and how far the camera has moved down to it (0..1). */
  cupboardOpen = false;
  cupboardT = 0;
  cupboards: CupboardObject[] = [];
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

    // The slab stops just past the visible front edge, so the cupboard under it can be seen.
    const counter = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 10.6), new THREE.MeshToonMaterial({ color: "#c98f55" }));
    counter.position.set(0, -0.2, -0.7);
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
    const shelf = mesh(faceted(new THREE.BoxGeometry(1.3, 0.3, 3.35)), "#b8c2c0");
    shelf.position.set(x0 + HOLD_SPOTS[0].x, 0.15, 1.15);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 3.2), new THREE.MeshBasicMaterial({ color: "#ffb15c", transparent: true, opacity: 0.45 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x0 + HOLD_SPOTS[0].x, 0.305, 1.15);
    this.scene.add(shelf, bed);
    const bulbGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: "#ff8a3d" });
    for (const h of HOLD_SPOTS) {
      const view = new PlateView("#e0782f");
      view.ring.visible = false;
      view.group.scale.setScalar(HOLD_SCALE);
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

  private buildFryer(): void {
    const x0 = pageX(2);
    // Frozen fries box
    const box = mesh(faceted(new THREE.BoxGeometry(2.0, 0.6, 1.3)), "#b9d6e6");
    box.position.set(x0 - 1.7, 0.3, -2.2);
    this.scene.add(box);
    const pile = makeFries(false);
    pile.userData.setCook(0);
    pile.scale.setScalar(0.9);
    pile.position.set(x0 - 1.7, -0.05, -2.2);
    pile.rotation.y = 0.4;
    this.scene.add(pile);
    this.proxy(new THREE.BoxGeometry(2.1, 1.4, 1.5), new THREE.Vector3(x0 - 1.7, 0.6, -2.2), { type: "friesBin" });
    // Carton stacks at the back, packing spots and the supplies cabinet along the front.
    (["S", "M", "L"] as Size[]).forEach((size, i) => this.addStack("carton", size, x0 + 0.8 + i * 1.1, -2.2));
    for (const px of [-2.45, -0.75]) {
      const mat = mesh(faceted(new THREE.BoxGeometry(1.3, 0.04, 0.95)), "#f1e6cf", { ink: false });
      mat.position.set(x0 + px, 0.02, 3.1);
      this.scene.add(mat);
      this.packs.push({ size: null, cook: 0, fill: 0, obj: null, x: x0 + px, z: 3.1 });
      this.proxy(new THREE.BoxGeometry(1.4, 1.2, 1.0), new THREE.Vector3(x0 + px, 0.5, 3.1), { type: "pack", idx: this.packs.length - 1 });
    }
    this.addSupplies("carton", x0 + 2.1, 3.15, 1.8, 0.85);
    for (let i = 0; i < 2; i++) {
      const vx = x0 + (i ? 1.55 : -1.55);
      const vat = mesh(faceted(new THREE.BoxGeometry(2.6, 0.9, 2.5)), "#c7cfcd");
      vat.position.set(vx, 0.45, 0.55);
      this.scene.add(vat);
      const oil = mesh(faceted(new THREE.BoxGeometry(2.25, 0.04, 2.15)), "#e7b443", { ink: false, shadow: false });
      oil.position.set(vx, 0.86, 0.55);
      this.scene.add(oil);
      const basket = new THREE.Group();
      const wire = mesh(faceted(new THREE.BoxGeometry(1.7, 0.55, 1.6, 4, 1, 4)), "#9aa3a5", { opacity: 0.28, unique: true, ink: false });
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 0.55, 1.6)), new THREE.LineBasicMaterial({ color: "#2a2e30" }));
      frame.position.y = 0.27;
      basket.add(frame);
      wire.position.y = 0.27;
      const handle = mesh(faceted(new THREE.BoxGeometry(0.16, 0.12, 1.2)), "#23292b");
      handle.position.set(0, 0.55, 1.3);
      const grip = mesh(faceted(new THREE.BoxGeometry(0.22, 0.2, 0.5)), "#e5432b");
      grip.position.set(0, 0.6, 1.9);
      basket.add(wire, handle, grip);
      const fries = makeFries(false);
      fries.scale.set(1.9, 0.9, 1.7);
      fries.position.y = -0.25;
      fries.visible = false;
      basket.add(fries);
      basket.position.set(vx, 1.0, 0.45);
      this.scene.add(basket);
      this.baskets.push({ loaded: false, cook: 0, down: false, goldenRung: false, obj: basket, fries, y: 1.0, amount: 0 });
      this.proxy(new THREE.BoxGeometry(2.4, 1.6, 3.4), new THREE.Vector3(vx, 1.0, 0.9), { type: "basket", idx: i });
    }
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
    const plateGeo = faceted(new THREE.BoxGeometry(TAP_GAP - 0.2, 0.06, 1.5));
    const buttonGeo = faceted(new THREE.CylinderGeometry(0.46, 0.5, 0.2, 20));
    const shineGeo = faceted(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 14));
    const nozzleGeo = faceted(new THREE.BoxGeometry(0.4, 0.22, 0.9));
    DRINKS.forEach((flavor, i) => {
      const x = tapX(i);
      const plate = mesh(plateGeo, "#f8f6ef", { ink: false });
      plate.position.set(x, 1.24, -2.4);
      this.scene.add(plate);
      const button = mesh(buttonGeo, DRINK_LABEL_COLOR[flavor]);
      button.position.set(x, 1.36, -2.5);
      this.scene.add(button);
      const shine = mesh(shineGeo, "#ffffff", { opacity: 0.35, ink: false });
      shine.position.set(x - 0.1, 1.47, -2.62);
      this.scene.add(shine);
      const nozzle = mesh(nozzleGeo, "#8c9496");
      nozzle.position.set(x, 1.0, -1.25);
      this.scene.add(nozzle);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(DRINK_LABEL_COLOR[flavor]));
      stream.visible = false;
      this.scene.add(stream);
      const puddleObj = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), new THREE.MeshBasicMaterial({ color: DRINK_LABEL_COLOR[flavor], transparent: true, opacity: 0.7 }));
      puddleObj.rotation.x = -Math.PI / 2;
      puddleObj.position.set(x, 0.11, -0.4);
      puddleObj.visible = false;
      this.scene.add(puddleObj);
      this.taps.push({ flavor, fill: 0, pouring: false, cup: null, size: null, stream, spill: 0, puddle: 0, puddleObj, x, ice: false, lid: false, straw: false });
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.05, 1.0, 1.7), new THREE.Vector3(x, 1.2, -2.4), { type: "tap", idx: i });
      this.proxy(new THREE.BoxGeometry(TAP_GAP - 0.05, 1.2, 1.6), new THREE.Vector3(x, 0.5, -0.3), { type: "cup", idx: i });
    });
    (["S", "M", "L"] as Size[]).forEach((size, i) => this.addStack("cup", size, x0 - 2.6 + i * 1.15, 1.7));
    // Lids and straws beside the cup stacks; the ice bin in front of them.
    const at = DRINK_EXTRAS;
    const ice = makeIceBin();
    ice.position.set(x0 + at.ice.x, 0, at.ice.z);
    const lids = makeLidStack(10);
    lids.position.set(x0 + at.lids.x, 0, at.lids.z);
    const straws = makeStrawHolder();
    straws.position.set(x0 + at.straws.x, 0, at.straws.z);
    this.scene.add(ice, lids, straws);
    this.proxy(new THREE.BoxGeometry(2.0, 1.0, 1.5), new THREE.Vector3(x0 + at.ice.x, 0.4, at.ice.z), { type: "ice" });
    this.proxy(new THREE.BoxGeometry(1.3, 1.2, 1.3), new THREE.Vector3(x0 + at.lids.x, 0.4, at.lids.z), { type: "lids" });
    this.proxy(new THREE.BoxGeometry(1.1, 1.6, 1.3), new THREE.Vector3(x0 + at.straws.x, 0.6, at.straws.z), { type: "straws" });
    this.addCupboard(x0, "cup");
  }

  /** The supplies cupboard under a counter's front edge; sleeves sit on its shelves and are picked up from there. */
  private addCupboard(x0: number, kind: Stack["kind"]): void {
    const cb = makeCupboard();
    cb.position.set(x0, 0, 3.6);
    cb.userData.shelves.forEach((p) => {
      const sleeve = this.sleeveMesh(kind);
      sleeve.position.copy(p).add(new THREE.Vector3(0, 0.42, 0));
      cb.add(sleeve);
      const proxy = this.proxy(new THREE.BoxGeometry(0.9, 1.0, 0.9), p.clone().add(cb.position).add(new THREE.Vector3(0, 0.42, 0)), { type: "supplies", kind });
      proxy.userData.cupboard = true;
    });
    // Under the slab everything is in the sun's shadow; skip it so the open cupboard reads.
    cb.traverse((o) => void ((o as THREE.Mesh).receiveShadow = false));
    this.scene.add(cb);
    this.cupboards.push(cb);
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
    for (let i = 0; i < s.count; i++) {
      const o = s.kind === "cup" ? makeCup(null, false, s.size) : makeCarton(s.size as FriesSize);
      o.scale.multiplyScalar(0.7);
      o.position.y = i * (s.kind === "cup" ? 0.09 : 0.07);
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
      const f = makeFries(true, p.size, p.fill);
      f.userData.setCook(p.cook);
      f.scale.setScalar(1.2 * f.userData.sizeScale);
      o = f;
    } else {
      o = makeCarton(p.size);
      o.scale.multiplyScalar(1.2);
    }
    o.position.set(p.x, 0.04, p.z);
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
      Object.assign(p, { size: null, cook: 0, fill: 0 });
      this.syncPack(i);
    });
    this.spillCost = 0;
  }

  /** Packing spot under a world point, or -1. */
  overPack(world: THREE.Vector3): number {
    return this.packs.findIndex((p) => Math.abs(world.x - p.x) < 0.85 && Math.abs(world.z - p.z) < 0.95);
  }

  /** Nozzle slot under a world point, or -1. */
  overTap(world: THREE.Vector3): number {
    return this.taps.findIndex((t) => Math.abs(world.x - t.x) < TAP_GAP / 2 && world.z > -1.3 && world.z < 0.5);
  }

  /** Stack under a world point, or -1. */
  overStack(world: THREE.Vector3): number {
    return this.stacks.findIndex((s) => Math.hypot(world.x - s.x, world.z - s.z) < 0.7);
  }

  /** World position under each drink cup, for the HTML flavour labels; alternate rows so five fit. */
  drinkLabelPoint(i: number): THREE.Vector3 {
    return new THREE.Vector3(tapX(i), 0.1, i % 2 ? 0.9 : 0.45);
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
      const bin = mesh(faceted(new THREE.BoxGeometry(1.18, 0.3, 1.0)), "#d9e2df");
      bin.position.set(x0 + b.x, 0.15, b.z);
      const inner = mesh(faceted(new THREE.BoxGeometry(1.04, 0.05, 0.86)), "#8fa5a0", { ink: false });
      inner.position.set(x0 + b.x, 0.3, b.z);
      g.add(bin, inner);
      const n = b.kind === "bun" || b.kind === "patty" || b.kind === "egg" || b.kind === "pineapple" ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const f = makeFood(newPiece(b.kind), "top");
        f.scale.setScalar(b.kind === "bun" ? 0.36 : 0.42);
        f.position.set(x0 + b.x + (n > 1 ? (i - 0.5) * 0.38 : 0), 0.33 + i * 0.05, b.z + (n > 1 ? (i - 0.5) * 0.12 : 0));
        if (b.kind === "bacon") f.rotation.y = 0.3;
        g.add(f);
      }
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
    this.cupboardOpen = false;
  }

  /** Whether this page has a supplies cupboard under the counter. */
  hasCupboard(): boolean {
    return this.cupboards.some((c) => Math.abs(c.position.x - pageX(this.page)) < 1);
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
    const hold = this.holds.findIndex((h) => Math.hypot(hp.x - (pageX(1) + h.x), hp.z - h.z) < 0.55);
    if (hold >= 0) return { type: "hold", idx: hold };
    // Looking into the cupboard only its shelves can be reached; from above, they're hidden under the counter.
    const inCupboard = this.cupboardT > 0.5;
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false).filter((h) => !!h.object.userData.cupboard === inCupboard);
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
    return this.holds.findIndex((h) => Math.hypot(world.x - (pageX(1) + h.x), world.z - h.z) < 0.6);
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
    // Opening the cupboard: the view slides down the front of the counter and the doors swing open.
    this.cupboardT += ((this.cupboardOpen ? 1 : 0) - this.cupboardT) * Math.min(1, dt * 7);
    const e = this.cupboardT * this.cupboardT * (3 - 2 * this.cupboardT);
    this.camera.position.set(this.camX, THREE.MathUtils.lerp(12.6, CUPBOARD_CAM.y, e), THREE.MathUtils.lerp(5.2, CUPBOARD_CAM.z, e));
    this.camera.lookAt(this.camX, THREE.MathUtils.lerp(0, CUPBOARD_LOOK.y, e), THREE.MathUtils.lerp(-0.1, CUPBOARD_LOOK.z, e));
    for (const c of this.cupboards) c.userData.setOpen(THREE.MathUtils.clamp(this.cupboardT * 1.4 - 0.3, 0, 1));

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
    for (const b of this.baskets) {
      const targetY = b.down && b.loaded ? 0.42 : 1.0;
      b.y += (targetY - b.y) * Math.min(1, dt * 8);
      b.obj.position.y = b.y + (b.down && b.loaded ? Math.sin(this.time * 18) * 0.015 : 0);
      b.fries.visible = b.loaded;
      if (b.loaded && b.down) {
        b.cook += FRY_RATE * this.fryBoost * dt;
        if (!b.goldenRung && b.cook >= 0.55) {
          b.goldenRung = true;
          this.events.golden();
        }
      }
      if (b.loaded) {
        b.fries.userData.setCook(b.cook);
        const k = 0.55 + 0.45 * b.amount;
        b.fries.scale.set(1.9 * k, 0.9, 1.7 * k);
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
        const topY = 0.1 + 0.8 * CUP_SCALE[t.size ?? "M"][1] * (0.07 + Math.min(1, t.fill) * 0.95);
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
