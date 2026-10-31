import * as THREE from "three";
import type { Piece, Plate } from "../game/types";
import { dressCup } from "../render/cup";
import { makeCup, makeFood, makeFries, stackBases, type BunRole, type CupObject, type FoodObject, type FriesObject } from "../render/food";
import { disposeObject, faceted, mesh, toon } from "../render/materials";

export const SLOT_COLORS = ["#6a8fd8", "#9ccf8a", "#b48ad8"];
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

  constructor(color: string) {
    const plate = mesh(faceted(new THREE.CylinderGeometry(1.0, 0.86, 0.1, 28)), "#f7f4ec");
    plate.position.y = 0.05;
    const rim = mesh(faceted(new THREE.TorusGeometry(0.93, 0.05, 4, 28)), color, { ink: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.22, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.burger.position.y = 0.1;
    this.group.add(plate, rim, this.ring, this.burger);
  }

  stackTop(): number {
    return stackBases(this.entries.map((e) => e.piece)).top;
  }

  sync(p: Plate, animate: boolean, onLand: () => void): void {
    const want = p.layers.map((l, i) => ({ l, role: (i === 0 ? "bottom" : "top") as BunRole }));
    let same = 0;
    while (same < this.entries.length && same < want.length && this.entries[same].uid === want[same].l.piece.uid && this.entries[same].role === want[same].role) same++;
    for (const e of this.entries.splice(same)) {
      this.burger.remove(e.obj);
      disposeObject(e.obj);
    }
    const { bases } = stackBases(want.map((w) => w.l.piece));
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
        onLand,
      };
      this.entries.push(e);
    }
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
        this.fries.scale.setScalar(0.62 * this.fries.userData.sizeScale);
        this.fries.position.set(-0.78, 0.1, -0.72);
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
        this.cup.scale.setScalar(0.62);
        this.cup.position.set(0.8, 0.1, -0.72);
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
      e.obj.position.set(e.offX + this.wobble * 0.05 * h * h, e.y, e.offZ);
      e.obj.rotation.z = -this.wobble * 0.04 * h;
    }
  }
}

export class TrayView {
  scene = new THREE.Scene();
  /**
   * Orthographic, so the three plates look identical. The band is very wide (about 3.4:1), and a
   * perspective camera wide enough to see all three plates skews the outer two badly.
   */
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  plates: PlateView[] = [];
  /** The shadow-casting light, so the graphics setting can soften or disable it. */
  sun: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private ghost: THREE.Object3D | null = null;
  private ghostSlot = -1;
  private ghostT = 0;
  constructor() {
    this.scene.background = new THREE.Color("#efe6d8");
    this.scene.add(new THREE.HemisphereLight("#fff4dc", "#7a6a9a", 1.3));
    const sun = new THREE.DirectionalLight("#fff1d6", 1.9);
    this.sun = sun;
    sun.position.set(2, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 512);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 4, bottom: -4, near: 1, far: 25 });
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 12), toon("#efe6d8"));
    counter.position.set(0, -0.32, 0);
    counter.receiveShadow = true;
    this.scene.add(counter);
    const tray = mesh(faceted(new THREE.BoxGeometry(30, 0.12, 3.1)), "#ff8a70", { ink: false });
    tray.position.y = -0.06;
    tray.receiveShadow = true;
    this.scene.add(tray);

    for (let i = 0; i < 3; i++) {
      const pv = new PlateView(SLOT_COLORS[i]);
      this.plates.push(pv);
      this.scene.add(pv.group);
    }
    this.camera.position.set(0, 7.6, 6.4);
    this.camera.lookAt(0, 0.5, -0.15);

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
      p.group.position.set(pts[i].x, 0, pts[i].z);
      p.group.scale.setScalar(r);
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
    const pv = this.plates[slot];
    const scale = pv.group.scale.x * pv.s;
    const topY = pv.group.scale.x * 0.1 + pv.stackTop() * scale;
    const p = this.groundAt(ndc, topY);
    const lx = (p.x - pv.group.position.x) / scale;
    const lz = (p.z - pv.group.position.z) / scale;
    const r = Math.hypot(lx, lz);
    const k = r > 1.05 ? 1.05 / r : 1;
    return { x: lx * k, z: lz * k };
  }

  setActive(slot: number, occupied: boolean[]): void {
    this.plates.forEach((p, i) => {
      p.ring.visible = occupied[i];
      (p.ring.material as THREE.MeshBasicMaterial).opacity = i === slot ? 0.95 : 0.25;
      p.ring.scale.setScalar(i === slot ? 1.06 : 1);
    });
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
      this.ghost.position.set(pv.group.position.x, s * (0.1 + pv.stackTop() * pv.s) + 0.9 + Math.sin(this.ghostT * 6) * 0.08, pv.group.position.z);
      this.ghost.scale.setScalar(s * pv.s);
    }
  }
}
