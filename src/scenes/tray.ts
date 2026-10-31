import * as THREE from "three";
import type { Piece, Plate } from "../game/types";
import { dressCup } from "../render/cup";
import { makeCup, makeFood, makeFries, stackBases, type BunRole, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { disposeObject, faceted, mesh, toon } from "../render/materials";
import { relScale } from "../render/units";

/** Plain paper plates; only the one being worked on gets a ring, in the accent colour. */
const PLATE_PAPER = "#f7f4ec";
const PLATE_RIM = "#e4dccb";
const ACTIVE_RING = "#c8472e";
const TRAY_VIEW_HALF_H = 2.2;

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
  ring: THREE.Mesh;
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
  /** Stack scale relative to ingredient units. */
  s = 0.6;

  constructor(rimColor = PLATE_RIM) {
    const plate = mesh(faceted(new THREE.CylinderGeometry(1.0, 0.86, 0.1, 28)), PLATE_PAPER);
    plate.position.y = 0.05;
    const rim = mesh(faceted(new THREE.TorusGeometry(0.93, 0.05, 4, 28)), rimColor, { ink: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.22, 40),
      new THREE.MeshBasicMaterial({ color: ACTIVE_RING, transparent: true, opacity: 0.9 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.burger.position.y = 0.1;
    this.group.add(plate, rim, this.ring, this.burger);
  }

  stackTop(): number {
    return stackBases(this.entries.map((e) => e.piece)).top;
  }

  /** Where a ray meets the top of the stack, in burger-local units (a bun has radius 1), kept on the bun. */
  drawPoint(ray: THREE.Ray): { x: number; z: number } {
    this.group.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(this.group.matrixWorld);
    const g = new THREE.Vector3().setFromMatrixScale(this.group.matrixWorld).x;
    const scale = g * this.s;
    const topY = pos.y + g * 0.1 + this.stackTop() * scale;
    const p = new THREE.Vector3();
    ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY), p);
    const lx = (p.x - pos.x) / scale;
    const lz = (p.z - pos.z) / scale;
    const r = Math.hypot(lx, lz);
    const k = r > 1.05 ? 1.05 / r : 1;
    return { x: lx * k, z: lz * k };
  }

  sync(p: Plate, animate: boolean, onLand: () => void): void {
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

    const fk = p.fries ? `f${p.fries.cook.toFixed(2)}${p.fries.size}${p.fries.fill.toFixed(2)}${+!!p.fries.salt}${+!!p.fries.curds}${+!!p.fries.gravy}` : "";
    if (fk !== this.friesKey) {
      if (this.fries) {
        this.group.remove(this.fries);
        disposeObject(this.fries);
      }
      this.fries = null;
      if (p.fries) {
        this.fries = makeFries(true, p.fries.size, p.fries.fill, p.fries);
        this.fries.userData.setCook(p.fries.cook);
        this.fries.scale.setScalar(relScale("fries") * this.fries.userData.sizeScale);
        this.fries.position.set(-0.6, 0.1, -0.85);
        this.group.add(this.fries);
      }
      this.friesKey = fk;
    }
    const ck = p.drink ? `${p.drink.flavor}${p.drink.fill.toFixed(2)}${p.drink.size}${+!!p.drink.ice}${+!!p.drink.lid}${+!!p.drink.straw}` : "";
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
        this.cup.scale.setScalar(relScale("cup"));
        this.cup.position.set(0.75, 0.1, -0.9);
        this.group.add(this.cup);
      }
      this.cupKey = ck;
    }
  }

  kick(strength: number): void {
    this.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 2.4 * strength;
  }

  update(dt: number): void {
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

/** The pass shelf is seen nearly side on, so a burger's layers can be counted from the side. */
const TRAY_PITCH = THREE.MathUtils.degToRad(24);
/** Height the camera centres on: about the middle of a tall burger. */
const TRAY_LOOK_Y = 0.85;
const STEEL = "#c9d0ce";

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
    this.scene.background = new THREE.Color("#d6cdbf");
    this.scene.add(new THREE.HemisphereLight("#fff4dc", "#7a6a9a", 1.3));
    const sun = new THREE.DirectionalLight("#fff1d6", 1.9);
    this.sun = sun;
    sun.position.set(3, 9, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 512);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 5, bottom: -5, near: 1, far: 30 });
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    // The window frame behind the ledge, in the truck's wall colour, with the splash line.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 0.4), toon("#d6cdbf"));
    wall.position.set(0, 2, -3.2);
    const splash = mesh(faceted(new THREE.BoxGeometry(40, 0.5, 0.15)), "#b9d6a2", { ink: false });
    splash.position.set(0, 0.2, -3.0);
    // The steel pass shelf, its dark front lip, and the heat-lamp bar along the top of the band.
    const shelf = mesh(faceted(new THREE.BoxGeometry(30, 0.35, 4.4)), STEEL);
    shelf.position.set(0, -0.18, -0.6);
    shelf.receiveShadow = true;
    const lip = mesh(faceted(new THREE.BoxGeometry(30, 0.1, 0.12)), "#7d8784", { ink: false });
    lip.position.set(0, -0.03, 1.62);
    const lamp = mesh(faceted(new THREE.BoxGeometry(30, 0.4, 0.8)), "#6f7775");
    lamp.position.set(0, 3.6, -1.4);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.5), new THREE.MeshBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.7 }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, 3.39, -1.4);
    this.scene.add(wall, splash, shelf, lip, lamp, glow);

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

  /** Place plates under the three customer slots for the band's aspect ratio. */
  layout(aspect: number): void {
    // Half the visible height at the look-at point, in world units: the same framing the old
    // 26° perspective camera had down the middle.
    const hh = TRAY_VIEW_HALF_H;
    Object.assign(this.camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // One plate under each customer; swipe a plate up to hand it over.
    const pts = [0, 1, 2].map((i) => this.groundAt(new THREE.Vector2(((i + 0.5) / 3) * 2 - 1, -0.25)));
    const spacing = pts[1].x - pts[0].x;
    const r = Math.min(1.4, spacing * 0.39);
    this.plates.forEach((p, i) => {
      p.group.position.set(pts[i].x, 0, 0);
      p.group.scale.setScalar(r);
      this.flags[i].position.set(pts[i].x, -0.1, 1.68);
    });
  }

  /** Where the far edge of the plates' rings sits, as a fraction of the band's height from its top. */
  rimTop(): number {
    const pv = this.plates[1];
    const r = 1.22 * pv.group.scale.x;
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(pv.group.position.x, 0.02, pv.group.position.z - r).project(this.camera);
    return (1 - v.y) / 2;
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
      (this.flags[i].material as THREE.MeshToonMaterial).color.set(on ? ACTIVE_RING : "#a9b2af");
    });
  }

  /** Hold the ghost (a sauce bottle) over a burger-local point of its plate, or let it bob over the stack again. */
  ghostOver(at: { x: number; z: number } | null): void {
    this.ghostAt = at;
  }

  showGhost(slot: number, obj: THREE.Object3D | null): void {
    if (this.ghost && (obj !== this.ghost || slot < 0)) {
      this.ghost.parent?.remove(this.ghost);
      this.ghost = null;
    }
    if (!obj || slot < 0) return;
    this.ghost = obj;
    this.ghostSlot = slot;
    this.scene.add(obj);
  }

  update(dt: number): void {
    for (const p of this.plates) p.update(dt);
    if (this.ghost) {
      this.ghostT += dt;
      const pv = this.plates[this.ghostSlot];
      const s = pv.group.scale.x;
      const top = s * (0.1 + pv.stackTop() * pv.s);
      if (this.ghostAt) this.ghost.position.set(pv.group.position.x + this.ghostAt.x * s * pv.s, top + 0.12, pv.group.position.z + this.ghostAt.z * s * pv.s);
      else this.ghost.position.set(pv.group.position.x, top + 0.9 + Math.sin(this.ghostT * 6) * 0.08, pv.group.position.z);
      this.ghost.scale.setScalar(s * pv.s);
    }
  }
}
