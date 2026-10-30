import * as THREE from "three";
import { FRY_RATE, GRILL_RATE } from "../game/cooking";
import type { DrinkId, Kind, Piece, SauceKind } from "../game/types";
import { newPiece } from "../game/types";
import { bottle, makeCup, makeFood, makeFries, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { faceted, mesh, toon } from "../render/materials";

export const PAGES = ["Drinks", "Grill", "Fryer"] as const;
export const HOME_PAGE = 1;
const PAGE_GAP = 14;
const pageX = (i: number) => (i - HOME_PAGE) * PAGE_GAP;

/** Grill items are drawn a bit smaller than ingredient units. */
export const GRILL_SCALE = 0.72;
const GRILL_TOP = 0.26;
const GRILL_CX = -0.7;
const GRILL_W = 5.1;
const GRILL_BOUNDS = { x0: GRILL_CX - GRILL_W / 2 + 0.45, x1: GRILL_CX + GRILL_W / 2 - 0.45, z0: 0.2, z1: 2.65 };
const TRASH = { x: 2.55, z: 1.5, r: 0.75 };

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
}

export interface Basket {
  loaded: boolean;
  cook: number;
  down: boolean;
  goldenRung: boolean;
  obj: THREE.Group;
  fries: FriesObject;
  y: number;
}

export interface Tap {
  flavor: DrinkId;
  fill: number;
  pouring: boolean;
  cup: CupObject;
  stream: THREE.Mesh;
  spill: number;
}

export type Hit =
  | { type: "bin"; kind: Kind }
  | { type: "grillItem"; item: GrillItem }
  | { type: "bottle"; sauce: SauceKind }
  | { type: "friesBin" }
  | { type: "basket"; idx: number }
  | { type: "tap"; idx: number }
  | { type: "cup"; idx: number };

export interface CounterEvents {
  golden: () => void;
  spill: () => void;
  burning: () => void;
}

export const BIN_LAYOUT: { kind: Kind; x: number; z: number }[] = [
  { kind: "bun", x: -2.6, z: -2.35 },
  { kind: "patty", x: -1.3, z: -2.35 },
  { kind: "bacon", x: 0, z: -2.35 },
  { kind: "egg", x: 1.3, z: -2.35 },
  { kind: "cheese", x: 2.6, z: -2.35 },
  { kind: "lettuce", x: -2.6, z: -1.15 },
  { kind: "tomato", x: -1.3, z: -1.15 },
  { kind: "onion", x: 0, z: -1.15 },
  { kind: "pickle", x: 1.3, z: -1.15 },
];

/** Buns toast and eggs set more slowly than meat, so they're forgiving to leave on. */
const COOK_SPEED: Record<string, number> = { patty: 1, bacon: 1.1, egg: 0.75, bun: 0.6 };

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
  grillItems: GrillItem[] = [];
  baskets: Basket[] = [];
  taps: Tap[] = [];
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
    for (const b of BIN_LAYOUT) {
      const bin = mesh(faceted(new THREE.BoxGeometry(1.18, 0.3, 1.0)), "#d9e2df");
      bin.position.set(x0 + b.x, 0.15, b.z);
      this.scene.add(bin);
      const inner = mesh(faceted(new THREE.BoxGeometry(1.04, 0.05, 0.86)), "#8fa5a0", { ink: false });
      inner.position.set(x0 + b.x, 0.3, b.z);
      this.scene.add(inner);
      const n = b.kind === "bun" || b.kind === "patty" || b.kind === "egg" ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const p = newPiece(b.kind);
        const f = makeFood(p, "top");
        f.scale.setScalar(b.kind === "bun" ? 0.36 : 0.42);
        f.position.set(x0 + b.x + (n > 1 ? (i - 0.5) * 0.38 : 0), 0.33 + i * 0.05, b.z + (n > 1 ? (i - 0.5) * 0.12 : 0));
        if (b.kind === "bacon") f.rotation.y = 0.3;
        this.scene.add(f);
      }
      this.proxy(new THREE.BoxGeometry(1.25, 0.9, 1.15), new THREE.Vector3(x0 + b.x, 0.3, b.z), { type: "bin", kind: b.kind });
    }
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
    // Trash can beside the grill for burnt mistakes.
    const can = mesh(faceted(new THREE.CylinderGeometry(TRASH.r, TRASH.r * 0.85, 1.1, 14)), "#7d8d89", { ink: false });
    can.position.set(x0 + TRASH.x, 0.55, TRASH.z);
    const rim = mesh(faceted(new THREE.TorusGeometry(TRASH.r, 0.06, 5, 16)), "#4c5855", { ink: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x0 + TRASH.x, 1.1, TRASH.z);
    const hole = mesh(faceted(new THREE.CylinderGeometry(TRASH.r - 0.06, TRASH.r - 0.06, 0.02, 14)), "#222826", { ink: false, shadow: false });
    hole.position.set(x0 + TRASH.x, 1.09, TRASH.z);
    hole.receiveShadow = false;
    can.receiveShadow = false;
    this.scene.add(can, rim, hole);

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
    // Carton stack, decoration
    for (let i = 0; i < 3; i++) {
      const c = mesh(faceted(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 4, 1, true)), "#d8473a", { side: THREE.DoubleSide });
      c.rotation.y = Math.PI / 4;
      c.scale.z = 0.6;
      c.position.set(x0 + 1.8 + i * 0.12, 0.3 + i * 0.18, -2.3);
      this.scene.add(c);
    }
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
      const handle = mesh(faceted(new THREE.BoxGeometry(0.16, 0.12, 1.6)), "#23292b");
      handle.position.set(0, 0.55, 1.5);
      const grip = mesh(faceted(new THREE.BoxGeometry(0.22, 0.2, 0.6)), "#e5432b");
      grip.position.set(0, 0.6, 2.25);
      basket.add(wire, handle, grip);
      const fries = makeFries(false);
      fries.scale.set(1.9, 0.9, 1.7);
      fries.position.y = -0.25;
      fries.visible = false;
      basket.add(fries);
      basket.position.set(vx, 1.0, 0.45);
      this.scene.add(basket);
      this.baskets.push({ loaded: false, cook: 0, down: false, goldenRung: false, obj: basket, fries, y: 1.0 });
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
      const cup = makeCup(flavor, false);
      cup.scale.setScalar(0.8);
      cup.position.set(x, 0.1, -0.45);
      this.scene.add(cup);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(DRINK_LABEL_COLOR[flavor]));
      stream.visible = false;
      this.scene.add(stream);
      this.taps.push({ flavor, fill: 0, pouring: false, cup, stream, spill: 0 });
      this.proxy(new THREE.BoxGeometry(1.9, 1.0, 1.7), new THREE.Vector3(x, 1.2, -2.4), { type: "tap", idx: i });
      this.proxy(new THREE.BoxGeometry(1.7, 1.2, 1.6), new THREE.Vector3(x, 0.5, -0.3), { type: "cup", idx: i });
    });
  }

  /** World position under each drink cup, for the HTML flavour labels. */
  drinkLabelPoint(i: number): THREE.Vector3 {
    return new THREE.Vector3(pageX(0) + (i - 1) * 2.05, 0.1, 0.55);
  }

  layout(aspect: number): void {
    this.camera.aspect = aspect;
    // Fit about 7.2 world units across, whatever the band shape.
    const dist = 13.1;
    const hfov = 2 * Math.atan(3.65 / dist);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
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
    return Math.hypot(world.x - (pageX(1) + TRASH.x), world.z - TRASH.z) < TRASH.r + 0.35;
  }

  /** Grill-local position if the world point is over the grill plate. */
  overGrill(world: THREE.Vector3): { x: number; z: number } | null {
    const x = world.x - pageX(1);
    const { x0, x1, z0, z1 } = GRILL_BOUNDS;
    if (x < x0 - 0.3 || x > x1 + 0.3 || world.z < z0 - 0.5 || world.z > z1 + 0.4) return null;
    return { x: THREE.MathUtils.clamp(x, x0, x1), z: THREE.MathUtils.clamp(world.z, z0, z1) };
  }

  addGrillItem(piece: Piece, x: number, z: number): GrillItem {
    const obj = makeFood(piece, "top");
    obj.scale.setScalar(GRILL_SCALE);
    this.scene.add(obj);
    const item: GrillItem = { piece, obj, x, z, flipT: -1, squash: 0, squashV: 4, smoke: 0, held: false };
    this.grillItems.push(item);
    return item;
  }

  removeGrillItem(item: GrillItem): void {
    this.scene.remove(item.obj);
    this.grillItems = this.grillItems.filter((g) => g !== item);
  }

  flip(item: GrillItem): boolean {
    if (item.flipT >= 0 || item.held) return false;
    // Eggs and buns don't flip in this shop: eggs are sunny side up, buns toast cut side down.
    if (item.piece.kind === "egg") return false;
    item.flipT = 0;
    return true;
  }

  /** Show something following the player's finger in the counter scene. */
  setHeld(obj: THREE.Object3D | null): void {
    if (this.held && this.held !== obj) this.scene.remove(this.held);
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
    return this.grillItems.filter((g) => !g.held && g.flipT < 0).length * 0.35;
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
        const heat = (1.12 - 0.25 * Math.abs(it.x / 3)) * (COOK_SPEED[it.piece.kind] ?? 1);
        it.piece.cook[0] += GRILL_RATE * heat * dt;
        if (it.piece.kind === "egg") it.piece.cook[1] += GRILL_RATE * 0.35 * heat * dt;
        it.obj.position.set(gx + it.x, GRILL_TOP, it.z);
        if (it.piece.cook[0] > 0.9 && it.piece.cook[0] - GRILL_RATE * dt <= 0.9) anyBurning = true;
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
    const active = this.grillItems.filter((g) => !g.held && g.flipT < 0);
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
        b.cook += FRY_RATE * dt;
        if (!b.goldenRung && b.cook >= 0.55) {
          b.goldenRung = true;
          this.events.golden();
        }
      }
      if (b.loaded) b.fries.userData.setCook(b.cook);
    }

    // Drinks
    for (const t of this.taps) {
      if (t.pouring) {
        t.fill += dt * 0.42;
        if (t.fill > 1.1) {
          t.fill = 0;
          t.pouring = false;
          t.spill = 1;
          this.events.spill();
        }
      }
      t.cup.userData.setFill(t.fill);
      t.stream.visible = t.pouring;
      if (t.pouring) {
        const topY = 0.1 + 0.8 * Math.min(1, t.fill) * 0.94;
        const h = Math.max(0.05, 0.92 - topY);
        t.stream.scale.set(1, h, 1);
        t.stream.position.set(t.cup.position.x, topY + h / 2, -0.82);
      }
      t.spill = Math.max(0, t.spill - dt * 2);
      t.cup.rotation.z = Math.sin(this.time * 40) * 0.05 * t.spill;
    }
  }
}
