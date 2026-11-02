import * as THREE from "three";
import type { Piece, Plate } from "../game/types";
import { fryOf } from "../game/types";
import { makeDish, stretchSauce, type DishObject } from "../render/dishes";
import { dressCup } from "../render/cup";
import { makeCup, makeFood, makeFries, stackBases, type BunRole, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { relScale } from "../render/units";
import { CABIN } from "../render/cabin";
import { wallColor, wallMaterial } from "../render/walls";

/**
 * One kraft serving tray per customer, lined with paper. A paper plate sits on it only when that
 * customer ordered a burger; the tray being worked on gets an outline in the accent colour.
 */
const TRAY_KRAFT = "#c99a62";
const TRAY_LINER = "#fbf6ea";
/** Tray size and where the plate and sides sit on it, in plate radii (tray-local units). */
const TRAY = { w: 3.15, d: 2.05 };
const DISH_AT = { x: -0.42, z: 0.08 };
/** The paper plate's radius, in tray units (the group's scale turns it into world units). */
export const DISH_R = 0.86;
const FRIES_AT = { x: 1.0, z: 0.42 };
const CUP_AT = { x: 1.02, z: -0.42 };
/** With no burger ordered the sides move to the middle of the tray. */
const FRIES_SOLO = { x: -0.45, z: 0.3 };
const CUP_SOLO = { x: 0.45, z: -0.25 };
/** The burger never draws smaller than this share of its full size to fit under the receipts. */
const MIN_FIT = 0.55;
/**
 * Sides on a plate draw at this share of their true size next to the burger. The low pass band is
 * short: a true-size cup's lid sits on the band's top edge and its straw leaves the picture, and
 * the lid and straw are what you check before serving.
 */
export const TRAY_SIDES = 0.6;
/** The "selected" outline: a cool blue that reads against the warm wood and the food. */
const ACTIVE_RING = "#3f7fd0";
export const TRAY_VIEW_HALF_H = 2.2;

/**
 * Tray looks, for James to pick from (the study screenshots each; `?tray=` or the bv-tray
 * setting chooses one): the kraft board with a paper liner (the look since build #41), a red
 * diner tray, a steel sheet pan with parchment, a wooden serving board, and a woven basket.
 * Every one keeps the same footprint (TRAY) and top height (0.13), so food sits the same.
 */
export type TrayStyle = "kraft" | "diner" | "sheet" | "board" | "basket";
export const TRAY_STYLES: TrayStyle[] = ["kraft", "diner", "sheet", "board", "basket"];
export function trayStyle(): TrayStyle {
  try {
    const q = new URLSearchParams(location.search).get("tray") ?? localStorage.getItem("bv-tray");
    if (q && (TRAY_STYLES as string[]).includes(q)) return q as TrayStyle;
  } catch {
    // No storage: the default look.
  }
  return "board";
}

/** A rounded rectangle centred on the origin (half sizes hw x hd, corner radius r). */
function roundRect<T extends THREE.Path>(p: T, hw: number, hd: number, r: number): T {
  p.moveTo(-hw + r, -hd);
  p.lineTo(hw - r, -hd);
  p.quadraticCurveTo(hw, -hd, hw, -hd + r);
  p.lineTo(hw, hd - r);
  p.quadraticCurveTo(hw, hd, hw - r, hd);
  p.lineTo(-hw + r, hd);
  p.quadraticCurveTo(-hw, hd, -hw, hd - r);
  p.lineTo(-hw, -hd + r);
  p.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return p;
}

function makeTrayBody(style: TrayStyle): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = TRAY;
  const rimmed = (color: string, rimH: number, rimT: number, radius: number, opts: { ink?: number } = {}) => {
    const base = mesh(faceted(new RoundedBoxGeometry(w, 0.12, d, 3, radius)), color);
    base.position.y = 0.06;
    g.add(base);
    const long = faceted(new RoundedBoxGeometry(w, rimH, rimT, 2, Math.min(rimT, rimH) / 2.2));
    const short = faceted(new RoundedBoxGeometry(rimT, rimH, d, 2, Math.min(rimT, rimH) / 2.2));
    for (const k of [-1, 1]) {
      const a = mesh(long, color, { ink: opts.ink ?? 0.012 });
      a.position.set(0, 0.06 + rimH / 2, k * (d / 2 - rimT / 2));
      const b = mesh(short, color, { ink: opts.ink ?? 0.012 });
      b.position.set(k * (w / 2 - rimT / 2), 0.06 + rimH / 2, 0);
      g.add(a, b);
    }
  };
  const liner = (color: string, inset: number, turn = 0.02, check?: string) => {
    const l = mesh(faceted(new THREE.BoxGeometry(w - inset, 0.01, d - inset * 0.95)), color, { ink: false });
    l.position.y = 0.125;
    l.rotation.y = turn;
    g.add(l);
    if (check) {
      // A printed checker band round the liner's edge.
      const n = 18;
      for (let i = 0; i < n; i++) {
        for (const k of [-1, 1]) {
          if (i % 2) continue;
          const sq = mesh(faceted(new THREE.BoxGeometry((w - inset) / n, 0.004, 0.09)), check, { ink: false });
          sq.position.set(-(w - inset) / 2 + ((i + 0.5) * (w - inset)) / n, 0.132, k * ((d - inset * 0.95) / 2 - 0.05));
          l.add(sq);
          sq.position.y -= 0.125;
        }
      }
    }
  };
  switch (style) {
    case "kraft":
      rimmed(TRAY_KRAFT, 0.1, 0.1, 0.1);
      liner(TRAY_LINER, 0.36);
      break;
    case "diner":
      // A moulded red fast-food tray: tall rounded rim, glossy, a checked paper sheet.
      rimmed("#c8402f", 0.16, 0.16, 0.18);
      liner("#fbf6ea", 0.42, -0.015, "#d8574a");
      break;
    case "sheet": {
      // A half sheet pan: rolled steel edge, a sheet of parchment.
      rimmed("#c7cfcd", 0.1, 0.07, 0.06, { ink: 0.01 });
      liner("#efe3c6", 0.3, 0.035);
      break;
    }
    case "board": {
      // A bare wooden serving board with well-rounded corners and a soft edge.
      const bevel = 0.04;
      const body = new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), w / 2 - bevel, d / 2 - bevel, 0.38), {
        depth: 0.16 - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 6,
      });
      body.rotateX(-Math.PI / 2);
      const b = mesh(faceted(body), "#b77b45");
      b.position.y = 0.05 - 0.08 + bevel;
      g.add(b);
      for (let i = 0; i < 5; i++) {
        const grain = mesh(faceted(new THREE.BoxGeometry(w - 0.9, 0.004, 0.02)), "#9c6534", { ink: false });
        grain.position.set(0, 0.131, -d / 2 + 0.2 + i * ((d - 0.4) / 4));
        g.add(grain);
      }
      break;
    }
    case "basket": {
      // A red woven basket: a shallow plastic weave, the classic burger-and-fries basket.
      rimmed("#d2473a", 0.2, 0.12, 0.3);
      for (let i = 0; i < 9; i++) {
        const slot = mesh(faceted(new THREE.BoxGeometry(0.05, 0.004, d - 0.5)), "#9e2e24", { ink: false });
        slot.position.set(-w / 2 + 0.35 + (i * (w - 0.7)) / 8, 0.122, 0);
        g.add(slot);
      }
      liner("#fbf6ea", 0.55, 0.05, "#d8574a");
      break;
    }
  }
  return g;
}

/** A dashed outline on the board where something goes: a circle for the cup or the burger, a boat for the fries. */
function sideMark(kind: "cup" | "fries" | "burger"): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#cdb994", transparent: true, opacity: 0.95 });
  const n = kind === "cup" ? 14 : kind === "burger" ? 28 : 18;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let x: number, z: number, a: number;
    if (kind !== "fries") {
      const r = kind === "cup" ? 0.36 : DISH_R * 0.82;
      a = t * Math.PI * 2;
      [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      a += Math.PI / 2;
    } else {
      // Round a rounded rectangle 0.86 x 0.62.
      const w = 0.43;
      const d = 0.31;
      const per = 2 * (2 * w + 2 * d);
      let u = t * per;
      if (u < 2 * w) [x, z, a] = [-w + u, -d, 0];
      else if ((u -= 2 * w) < 2 * d) [x, z, a] = [w, -d + u, Math.PI / 2];
      else if ((u -= 2 * d) < 2 * w) [x, z, a] = [w - u, d, 0];
      else [x, z, a] = [-w, d - (u - 2 * w), Math.PI / 2];
    }
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.035), mat);
    dash.rotation.set(-Math.PI / 2, 0, -a);
    dash.position.set(x, 0, z);
    g.add(dash);
  }
  g.visible = false;
  return g;
}

interface StackEntry {
  uid: number;
  piece: Piece;
  role: BunRole;
  obj: FoodObject;
  baseY: number;
  y: number;
  vy: number;
  landed: boolean;
  squash: number;
  squashV: number;
  offX: number;
  offZ: number;
  /** The readable stack: each layer turned a little and set back so the rims below show. */
  yaw: number;
  back: number;
  onLand?: () => void;
}

export class PlateView {
  group = new THREE.Group();
  burger = new THREE.Group();
  /** The accent outline round the tray being worked on. */
  ring: THREE.Mesh;
  /** The paper plate: only there when the customer at this tray ordered a burger. */
  dish = new THREE.Group();
  entries: StackEntry[] = [];
  fries: FriesObject | null = null;
  friesKey = "";
  cup: CupObject | null = null;
  cupKey = "";
  wobble = 0;
  wobbleV = 0;
  /** Whole-stack squish when the top bun is pressed on. */
  private squish = 0;
  private squishV = 0;
  /** Stack scale relative to ingredient units: its full size, and what it's drawn at to fit the band. */
  s = 0.6;
  full = 0.6;
  /** Tallest stack (tray-local units above the tray) that stays clear of the receipts. */
  headroom = Infinity;

  constructor() {
    const trayBody = makeTrayBody(trayStyle());
    // No plate: a dashed ring on the board shows where the burger goes until it's started.
    this.dish.add(sideMark("burger"));
    this.dish.children[0].visible = true;
    this.dish.position.set(DISH_AT.x, 0.132, DISH_AT.z);
    // The active outline: a frame just outside the tray, flat on the shelf.
    const frame = roundRect(new THREE.Shape(), TRAY.w / 2 + 0.2, TRAY.d / 2 + 0.2, 0.55);
    const hole = roundRect(new THREE.Path(), TRAY.w / 2 + 0.06, TRAY.d / 2 + 0.06, 0.44);
    frame.holes.push(hole);
    this.ring = new THREE.Mesh(new THREE.ShapeGeometry(frame, 8), new THREE.MeshBasicMaterial({ color: ACTIVE_RING, transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.burger.position.set(DISH_AT.x, 0.13, DISH_AT.z);
    this.group.add(trayBody, this.dish, this.ring, this.burger, this.friesMark, this.cupMark);
  }

  /** A burger was ordered: mark its spot (until it's started) and keep the sides beside it. */
  private hasDish = false;
  setDish(on: boolean): void {
    this.hasDish = on;
    this.placeSides();
  }

  /** Where the fries or the cup stand on this tray (tray units). */
  sideSpot(kind: "cup" | "fries"): { x: number; z: number } {
    const solo = !this.hasDish && !this.entries.length;
    return kind === "cup" ? (solo ? CUP_SOLO : CUP_AT) : solo ? FRIES_SOLO : FRIES_AT;
  }

  /** Fries and cup beside the plate, or in the middle of a tray with no burger on it. */
  private placeSides(): void {
    const f = this.sideSpot("fries");
    const c = this.sideSpot("cup");
    this.fries?.position.set(f.x, 0.13, f.z);
    this.cup?.position.set(c.x, 0.13, c.z);
    // Outlines where an ordered side still has to go, like the plate for the burger.
    this.friesMark.position.set(f.x, 0.132, f.z);
    this.cupMark.position.set(c.x, 0.132, c.z);
    this.friesMark.visible = this.wants.fries && !this.fries;
    this.cupMark.visible = this.wants.drink && !this.cup;
    this.dish.visible = this.hasDish && !this.entries.length && !this.dishObj;
  }

  /** Which sides this tray's order wants (their outlines show until they're on). */
  private wants = { fries: false, drink: false };
  setWants(fries: boolean, drink: boolean): void {
    this.wants = { fries, drink };
    this.placeSides();
  }
  private friesMark = sideMark("fries");
  private cupMark = sideMark("cup");

  stackTop(): number {
    if (this.dishObj) return this.dishObj.top;
    return stackBases(this.entries.map((e) => e.piece)).top;
  }

  /** Red Rock's tacos and quesadillas are drawn as one dish (render/dishes.ts) rather than a stack. */
  private dishObj: DishObject | null = null;
  private dishKey = "";
  /** The half sizes sauce paints over on the dish (burger-local units), or null for a round stack. */
  dishExtent(): { rx: number; rz: number } | null {
    return this.dishObj ? { rx: this.dishObj.rx, rz: this.dishObj.rz } : null;
  }
  private clearDish(): void {
    if (!this.dishObj) return;
    this.burger.remove(this.dishObj.group);
    disposeObject(this.dishObj.group);
    this.dishObj = null;
    this.dishKey = "";
  }
  /** Draw the plate as a dish if it is one; true when it was. */
  private syncDish(p: Plate, animate: boolean, onLand: () => void): boolean {
    const dish = p.layers.length > 0 && p.layers[0] && (p.layers[0].piece.kind === "corn" || p.layers[0].piece.kind === "flour" || p.layers[0].piece.kind === "dough");
    if (!dish) {
      this.clearDish();
      return false;
    }
    for (const e of this.entries.splice(0)) {
      this.burger.remove(e.obj);
      disposeObject(e.obj);
    }
    const key = p.layers.map((l) => `${l.piece.uid}${l.piece.folded ? "f" : ""}`).join(",");
    if (key !== this.dishKey) {
      const grew = !!this.dishObj && key.startsWith(this.dishKey);
      this.clearDish();
      const d = makeDish(p.layers.map((l) => l.piece));
      if (!d) return false;
      this.dishObj = d;
      this.dishKey = key;
      this.burger.add(d.group);
      if (animate) {
        this.kick(grew ? 0.15 : 0.3);
        onLand();
      }
    }
    this.dishObj!.update?.(p.layers.map((l) => l.piece));
    // Sauce being squeezed on: redraw its line as it grows.
    for (const [i, o] of this.dishObj!.sauces) {
      const piece = p.layers[i]?.piece;
      if (piece?.stroke) o.userData.update(stretchSauce(piece, this.dishObj!.rx, this.dishObj!.rz));
    }
    return true;
  }

  /** The scale a stack of this height draws at so its top stays under the headroom line. */
  private fitScale(): number {
    const top = this.stackTop() + 0.15;
    const room = this.headroom - this.burger.position.y;
    return Math.max(this.full * MIN_FIT, Math.min(this.full, room / top));
  }

  /**
   * Where a ray meets the top of the stack, in burger-local units (a bun has radius 1), kept within
   * `reach` of the middle (pass Infinity for the raw point).
   */
  drawPoint(ray: THREE.Ray, reach = 1.05): { x: number; z: number } {
    this.burger.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(this.burger.matrixWorld);
    const g = new THREE.Vector3().setFromMatrixScale(this.group.matrixWorld).x;
    const scale = g * this.s;
    const topY = pos.y + this.stackTop() * scale;
    const p = new THREE.Vector3();
    ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY), p);
    const lx = (p.x - pos.x) / scale;
    const lz = (p.z - pos.z) / scale;
    const r = Math.hypot(lx, lz);
    const k = r > reach ? reach / r : 1;
    return { x: lx * k, z: lz * k };
  }

  sync(p: Plate, animate: boolean, onLand: () => void): void {
    if (this.syncDish(p, animate, onLand)) {
      this.syncSides(p);
      return;
    }
    const want = p.layers.map((l, i) => ({ l, role: (i === 0 ? "bottom" : "top") as BunRole }));
    let same = 0;
    while (same < this.entries.length && same < want.length && this.entries[same].uid === want[same].l.piece.uid && this.entries[same].role === want[same].role) same++;
    for (const e of this.entries.splice(same)) {
      this.burger.remove(e.obj);
      disposeObject(e.obj);
    }
    const { bases, yaw, back } = stackBases(want.map((w) => w.l.piece));
    for (let i = same; i < want.length; i++) {
      const y = bases[i];
      const { l, role } = want[i];
      const obj = makeFood(l.piece, role);
      this.burger.add(obj);
      const e: StackEntry = {
        uid: l.piece.uid,
        piece: l.piece,
        role,
        obj,
        baseY: y,
        y: animate ? y + 3.5 : y,
        vy: 0,
        landed: !animate,
        squash: 0,
        squashV: 0,
        offX: l.offX,
        offZ: l.offZ,
        yaw: 0,
        back: 0,
        onLand,
      };
      this.entries.push(e);
    }
    this.entries.forEach((e, i) => {
      e.yaw = yaw[i];
      e.back = back[i];
      e.obj.rotation.y = e.yaw;
    });
    // Sauce layers grow while being drawn.
    p.layers.forEach((l, i) => {
      if (l.piece.stroke) this.entries[i]?.obj.userData.update(l.piece);
    });
    this.syncSides(p);
  }

  /** The fries and the drink beside the main. */
  private syncSides(p: Plate): void {
    const fk = p.fries ? `f${fryOf(p.fries)}${p.fries.cook.toFixed(2)}${p.fries.size}${p.fries.fill.toFixed(2)}${Math.round((p.fries.salt ?? 0) * 10)}${+!!p.fries.curds}${+!!p.fries.gravy}` : "";
    if (fk !== this.friesKey) {
      if (this.fries) {
        this.group.remove(this.fries);
        disposeObject(this.fries);
      }
      this.fries = null;
      if (p.fries) {
        this.fries = makeFries(true, p.fries.size, p.fries.fill, p.fries);
        this.fries.userData.setCook(p.fries.cook);
        this.fries.scale.setScalar(relScale("fries") * TRAY_SIDES * this.fries.userData.sizeScale);

        this.group.add(this.fries);
      }
      this.friesKey = fk;
    }
    const ck = p.drink ? `${p.drink.flavor}${p.drink.fill.toFixed(2)}${p.drink.size}${+!!p.drink.ice}${+!!p.drink.lid}` : "";
    if (ck !== this.cupKey) {
      if (this.cup) {
        this.group.remove(this.cup);
        disposeObject(this.cup);
      }
      this.cup = null;
      if (p.drink) {
        this.cup = makeCup(p.drink.flavor, !!p.drink.lid, p.drink.size);
        this.cup.userData.setFill(p.drink.fill);
        dressCup(this.cup, p.drink);
        this.cup.scale.setScalar(relScale("cup") * TRAY_SIDES);
        this.group.add(this.cup);
      }
      this.cupKey = ck;
    }
    this.placeSides();
  }

  kick(strength: number): void {
    this.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 2.4 * strength;
  }

  update(dt: number): void {
    // A tall burger shrinks a little, all at once, so its top stays clear of the receipts.
    this.s += (this.fitScale() - this.s) * Math.min(1, dt * 8);
    for (const e of this.entries) {
      if (e.piece.kind === "cheese") e.obj.userData.update(e.piece);
      if (!e.landed) {
        e.vy -= 30 * dt;
        e.y += e.vy * dt;
        if (e.y <= e.baseY) {
          e.y = e.baseY;
          e.squashV = -e.vy * 0.9;
          e.vy = 0;
          e.landed = true;
          this.kick(0.3);
          if (e.piece.kind === "bun" && e.role === "top" && this.entries.length > 2) this.squishV += 3.2;
          e.onLand?.();
        }
      }
      e.squashV += (-150 * e.squash - 12 * e.squashV) * dt;
      e.squash += e.squashV * dt;
    }
    this.wobbleV += (-60 * this.wobble - 5 * this.wobbleV) * dt;
    this.wobble += this.wobbleV * dt;
    this.squishV += (-120 * this.squish - 9 * this.squishV) * dt;
    this.squish += this.squishV * dt;
    const q = THREE.MathUtils.clamp(this.squish, -0.15, 0.25);
    this.burger.scale.set(this.s * (1 + q * 0.45), this.s * (1 - q), this.s * (1 + q * 0.45));
    for (const e of this.entries) {
      const h = e.baseY + 0.15;
      const sq = THREE.MathUtils.clamp(e.squash * 0.05, -0.3, 0.3);
      e.obj.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      e.obj.position.set(e.offX + this.wobble * 0.05 * h * h, e.y, e.offZ - e.back);
      e.obj.rotation.z = -this.wobble * 0.04 * h;
    }
  }
}

/**
 * The pass shelf is seen from a little above eye level: high enough that the trays read as trays
 * (not slivers) and the plate as round, low enough that a burger's layers are counted from the side.
 */
export const TRAY_PITCH = THREE.MathUtils.degToRad(44);
/** Height the camera centres on: about the middle of a tall burger. */
const TRAY_LOOK_Y = 0.85;
/** The receipts hang over the back of the band down to here (a fraction of its height from the top); burgers fit under it. */
const RECEIPT_LINE = 0.3;
/** Where the trays' front edges sit, as a fraction of the band's height from its top. */
const TRAY_FRONT = 0.86;

export class TrayView {
  scene = new THREE.Scene();
  /**
   * The tray is the window ledge: a steel pass shelf under a heat lamp, seen almost side on
   * through a long lens. Orthographic is the long-lens limit, so the three plates look identical
   * across the very wide band (about 3.4:1).
   */
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  plates: PlateView[] = [];
  /** A coloured tab on the shelf lip under each plate; the active plate's is lit. */
  private flags: THREE.Mesh[] = [];
  /** The shadow-casting light, so the graphics setting can soften or disable it. */
  sun: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private ghost: THREE.Object3D | null = null;
  private ghostSlot = -1;
  private ghostT = 0;
  /** While a sauce is being drawn, the held bottle sits over this point instead of bobbing over the stack. */
  private ghostAt: { x: number; z: number } | null = null;
  constructor() {
    this.scene.background = wallColor(CABIN.wall);
    this.scene.add(new THREE.HemisphereLight("#fff4dc", "#7a6a9a", 1.3));
    const sun = new THREE.DirectionalLight("#fff1d6", 1.9);
    this.sun = sun;
    sun.position.set(3, 9, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 512);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 5, bottom: -5, near: 1, far: 30 });
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    // The truck's painted wall behind the pass shelf (see fitRoom), the steel shelf with its front
    // face and bright rolled nose, and the heat-lamp bar along the top of the band.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 0.4), toon(CABIN.wall));
    wall.position.set(0, 2, -3.2);
    const shelf = mesh(faceted(new THREE.BoxGeometry(30, 0.35, 9)), CABIN.shelf.top);
    shelf.position.set(0, -0.18, 1.5);
    shelf.receiveShadow = true;
    this.face = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 0.06), new THREE.MeshBasicMaterial({ color: CABIN.shelf.face, toneMapped: false }));
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 30, 10), new THREE.MeshBasicMaterial({ color: CABIN.shelf.nose, toneMapped: false }));
    lip.rotation.z = Math.PI / 2;
    const lamp = mesh(faceted(new THREE.BoxGeometry(30, 0.4, 0.8)), "#6f7775");
    lamp.position.set(0, 3.6, -1.4);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.5), new THREE.MeshBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.7 }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, 3.39, -1.4);
    this.scene.add(wall, shelf, this.face, lip, lamp, glow);
    this.parts = { wall, shelf, lip };

    const flagGeo = faceted(new THREE.BoxGeometry(0.9, 0.22, 0.06));
    for (let i = 0; i < 3; i++) {
      const pv = new PlateView();
      this.plates.push(pv);
      this.scene.add(pv.group);
      const flag = mesh(flagGeo, "#ffffff", { ink: false });
      (flag.material as THREE.MeshToonMaterial).color.set("#a9b2af");
      this.flags.push(flag);
      this.scene.add(flag);
    }
    const d = 20;
    this.camera.position.set(0, TRAY_LOOK_Y + d * Math.sin(TRAY_PITCH), d * Math.cos(TRAY_PITCH));
    this.camera.lookAt(0, TRAY_LOOK_Y, 0);
  }

  private face: THREE.Mesh;
  private parts!: { wall: THREE.Mesh; shelf: THREE.Mesh; lip: THREE.Mesh };
  /**
   * Fit the room to the band: the painted wall behind the trays (the same wall as round the
   * window and under the shelf, its texture sized to the screen), and the pass shelf, its front
   * face and rolled nose right at the band's bottom edge, so the seam into the counter is the
   * shelf's own edge.
   */
  fitRoom(bandPx: number): void {
    const v = CABIN;
    const { wall, shelf, lip } = this.parts;
    const hh = TRAY_VIEW_HALF_H;
    const upp = (2 * hh) / bandPx;
    const old = wall.material as THREE.Material;
    wall.material = wallMaterial(v.wallTex, v.wall, 40, 8, upp, upp / Math.cos(TRAY_PITCH));
    if (old.userData.disposable) old.dispose();
    // Shelf: from the wall to where its nose sits just above the band's bottom edge.
    const faceH = v.shelf.faceH;
    const facePx = (faceH * Math.cos(TRAY_PITCH)) / upp;
    const want = -1 + (2 * (facePx + 1)) / bandPx;
    // Screen y of a point on the shelf top moves by sin(pitch) per unit of z.
    const y0 = new THREE.Vector3(0, 0, 0).project(this.camera).y;
    const front = ((y0 - want) * hh) / Math.sin(TRAY_PITCH);
    // A shelf a little deeper than the trays, the wall straight behind it.
    const pg = this.plates[0].group;
    const back = pg.position.z - (TRAY.d * pg.scale.z) / 2 - 0.45;
    wall.position.z = back - 0.25;
    shelf.geometry.dispose();
    shelf.geometry = faceted(new THREE.BoxGeometry(30, faceH, front - back));
    shelf.position.set(0, -faceH / 2, (front + back) / 2);
    this.face.scale.y = faceH;
    this.face.position.set(0, -faceH / 2, front + 0.03);
    lip.position.set(0, -0.01, front + 0.02);
  }

  /** Place plates under the three customer slots for the band's aspect ratio. */
  layout(aspect: number): void {
    // Half the visible height at the look-at point, in world units: the same framing the old
    // 26° perspective camera had down the middle.
    const hh = TRAY_VIEW_HALF_H;
    Object.assign(this.camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // One tray under each customer, nearly edge to edge; swipe a tray up to hand it over.
    const pts = [0, 1, 2].map((i) => this.groundAt(new THREE.Vector2(((i + 0.5) / 3) * 2 - 1, 0)));
    const spacing = pts[1].x - pts[0].x;
    const r = Math.min(1.45, (spacing * 0.9) / TRAY.w);
    // Slide the trays toward the camera until their front edges sit near the bottom of the band.
    const ndcY = (z: number) => new THREE.Vector3(0, 0.13, z).project(this.camera).y;
    const front = (r * TRAY.d) / 2;
    const want = 1 - 2 * TRAY_FRONT;
    const z = ((ndcY(front) - want) * hh) / Math.sin(TRAY_PITCH);
    // Burgers fit under the receipts (see fitUnder).
    this.fitBase = new THREE.Vector3(0, 0, z + DISH_AT.z * r).project(this.camera).y;
    this.fitPerUnit = (Math.cos(TRAY_PITCH) * r) / hh;
    this.plates.forEach((p, i) => {
      p.group.position.set(pts[i].x, 0, z);
      p.group.scale.setScalar(r);
      this.fitUnder(i, RECEIPT_LINE);
      this.flags[i].position.set(pts[i].x, -0.1, 1.68);
    });
    this.flags.forEach((f) => (f.visible = false));
  }

  private fitBase = 0;
  private fitPerUnit = 1;
  /**
   * Fit a tray's burger under a line `frac` of the band's height from its top (the bottom of the
   * receipt hanging over it, or 0 when none does): a tall stack shrinks so every layer shows.
   */
  fitUnder(i: number, frac: number): void {
    const line = 1 - 2 * Math.min(RECEIPT_LINE, Math.max(0.04, frac));
    this.plates[i].headroom = (line - this.fitBase) / this.fitPerUnit;
  }

  /** Where the receipts may hang down to, as a fraction of the band's height from its top. Burgers are fitted under it. */
  rimTop(): number {
    return RECEIPT_LINE;
  }

  /** Where a tray's staleness bar sits: along its front lip, under the plate. */
  staleBarPoint(i: number): THREE.Vector3 {
    const pv = this.plates[i];
    const r = pv.group.scale.x;
    return pv.group.position.clone().add(new THREE.Vector3(DISH_AT.x * r, 0.2 * r, (TRAY.d / 2) * r));
  }

  private groundAt(ndc: THREE.Vector2, y = 0): THREE.Vector3 {
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out);
    return out;
  }

  /** Which plate a pointer is over (nearest within reach), or -1. */
  pick(ndc: THREE.Vector2): number {
    const p = this.groundAt(ndc, 0.3);
    let best = -1;
    let bestD = Infinity;
    this.plates.forEach((pv, i) => {
      const d = Math.abs(p.x - pv.group.position.x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const spacing = this.plates[1].group.position.x - this.plates[0].group.position.x;
    return bestD < spacing * 0.6 ? best : -1;
  }

  /** Pointer position in a plate's burger-local coordinates, on top of the current stack. */
  drawPoint(ndc: THREE.Vector2, slot: number): { x: number; z: number } {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.plates[slot].drawPoint(this.raycaster.ray);
  }

  setActive(slot: number, occupied: boolean[]): void {
    this.plates.forEach((p, i) => {
      const on = occupied[i] && i === slot;
      p.ring.visible = on;
      (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
      (this.flags[i].material as THREE.MeshToonMaterial).color.set(on ? ACTIVE_RING : "#a9b2af");
    });
  }

  /** World height of the top of a plate's stack. */
  stackTopY(slot: number): number {
    const pv = this.plates[slot];
    const s = pv.group.scale.x;
    return pv.group.position.y + s * (pv.burger.position.y + pv.stackTop() * pv.s);
  }

  /** Light the ring of every plate that can take sauce, pulsing; the aimed-at one solid. Null restores. */
  aim(ok: boolean[] | null, target: number, t: number): void {
    if (!ok) return;
    this.plates.forEach((p, i) => {
      p.ring.visible = ok[i];
      (p.ring.material as THREE.MeshBasicMaterial).opacity = i === target ? 0.95 : 0.35 + 0.3 * Math.sin(t * 7) ** 2;
    });
  }

  /** Hold the ghost (a sauce bottle) over a burger-local point of its plate, or let it bob over the stack again. */
  ghostOver(at: { x: number; z: number } | null): void {
    this.ghostAt = at;
  }

  /**
   * Show what's being carried over a tray: a burger part bobs over the stack; a cup or a carton of
   * fries sits right where it will land, at the size it will be (see PlateView.sideSpot).
   */
  showGhost(slot: number, obj: THREE.Object3D | null, kind: "burger" | "cup" | "fries" = "burger"): void {
    if (this.ghost && (obj !== this.ghost || slot < 0)) {
      this.ghost.parent?.remove(this.ghost);
      this.ghost = null;
    }
    if (!obj || slot < 0) return;
    this.ghost = obj;
    this.ghostSlot = slot;
    this.ghostKind = kind;
    this.scene.add(obj);
  }
  private ghostKind: "burger" | "cup" | "fries" = "burger";

  update(dt: number): void {
    for (const p of this.plates) p.update(dt);
    if (this.ghost) {
      this.ghostT += dt;
      const pv = this.plates[this.ghostSlot];
      const s = pv.group.scale.x;
      if (this.ghostKind !== "burger") {
        const at = pv.sideSpot(this.ghostKind);
        this.ghost.position.copy(pv.group.position).add(new THREE.Vector3(at.x * s, 0.13 * s + Math.abs(Math.sin(this.ghostT * 5)) * 0.04, at.z * s));
        this.ghost.scale.setScalar(s * relScale(this.ghostKind === "cup" ? "cup" : "fries") * TRAY_SIDES * ((this.ghost.userData.sizeScale as number | undefined) ?? 1));
        return;
      }
      const b = pv.group.position.clone().addScaledVector(pv.burger.position, s);
      const top = b.y + s * pv.stackTop() * pv.s;
      if (this.ghostAt) this.ghost.position.set(b.x + this.ghostAt.x * s * pv.s, top + 0.12, b.z + this.ghostAt.z * s * pv.s);
      else this.ghost.position.set(b.x, top + 0.9 + Math.sin(this.ghostT * 6) * 0.08, b.z);
      this.ghost.scale.setScalar(s * pv.s);
    }
  }
}
