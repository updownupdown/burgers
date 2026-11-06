import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import { faceted, mesh } from "./materials";
import { bakeStatic } from "./bake";

/*
 * The customers: chunky one-piece beans with small painted eyes, blush and a sprout of hair,
 * dressed for the town (picked by James from the customer study, 2026-11-02). A figure is
 * about 2.2 units tall with the feet at y = 0, and comes with hooks to show a mood and glance sideways.
 */

export type Mood = "neutral" | "happy" | "sad" | "angry";

export interface Person {
  body: THREE.Group;
  setMood(m: Mood): void;
  look(x: number): void;
}

type Hat = "none" | "beanie" | "cap" | "ranger" | "antlers" | "sunhat" | "shades" | "cowboy" | "bandana";
const HATS: Record<Backdrop, Hat[]> = {
  mountains: ["none", "beanie", "cap", "ranger", "antlers"],
  beach: ["none", "sunhat", "shades", "cap", "shades"],
  desert: ["none", "cowboy", "cowboy", "shades", "bandana"],
  orchard: ["none", "sunhat", "cap", "beanie", "none"],
};
export function hatFor(seed: number, backdrop: Backdrop): Hat {
  const h = HATS[backdrop];
  return h[Math.floor(seed / 3) % h.length];
}

/** A stable 0..1 number for a seed and a salt. */
function rnd(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function pick<T>(list: readonly T[], seed: number, k: number): T {
  return list[Math.floor(rnd(seed, k) * list.length) % list.length];
}

const HAIR = ["#3a2a24", "#5e4030", "#8a5a35", "#c99a58", "#e0c48a", "#9a9590", "#2c2a33", "#a5523a"] as const;
const CLOTH = ["#e7766f", "#f2a46d", "#9fcf8a", "#7f9fe0", "#f2cf5b", "#b9a3e3", "#6fc5b8", "#e889a8", "#5f7fa8", "#f4b393"] as const;
const FEATURE = "#33262b";

const basic = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit flat colour for painted-on features (eyes, mouths, cheeks), so they never pick up the sky tint. */
function flat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = color + opacity;
  let m = basic.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    basic.set(key, m);
  }
  return m;
}

const sph = (r: number, color: string, w = 12, h = 9, ink: boolean | number = true) => mesh(faceted(new THREE.SphereGeometry(r, w, h)), color, { ink });
/** A smooth-shaded sphere, for the body and belly: clean toon bands instead of facet patches. */
const smoothSph = (r: number, color: string, w = 12, h = 9, ink: boolean | number = true) => mesh(new THREE.SphereGeometry(r, w, h), color, { ink });

interface FaceOpts {
  /** Horizontal angle of each eye from the front, radians. */
  eyeAx: number;
  /** Vertical angle of the eyes (up is positive). */
  eyeAy: number;
  eyeR: number;
  /** Eye height to width. */
  eyeTall?: number;
  brow?: string | null;
  mouthAy: number;
  mouthR: number;
  cheek?: string | null;
  nose?: string | null;
  noseR?: number;
  /** Eyes closed into arcs when happy. */
  happyArcs?: boolean;
}

/** Eyes, brows, mouth and cheeks laid onto the front of a sphere head. */
class Face {
  private eyes: THREE.Group[] = [];
  private eyeDots: THREE.Object3D[] = [];
  private arcs: THREE.Object3D[] = [];
  private brows: THREE.Object3D[] = [];
  private mouth: THREE.Mesh;
  private flatMouth: THREE.Mesh;
  private o: FaceOpts;

  constructor(
    private head: THREE.Object3D,
    private r: number,
    o: FaceOpts,
  ) {
    this.o = o;
    for (const s of [-1, 1]) {
      const g = this.spot(s * o.eyeAx, o.eyeAy, 0);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(o.eyeR, 10, 8), flat(FEATURE));
      dot.scale.set(1, o.eyeTall ?? 1.25, 0.45);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(o.eyeR * 0.32, 6, 5), flat("#ffffff"));
      shine.position.set(o.eyeR * 0.35, o.eyeR * 0.45, o.eyeR * 0.4);
      dot.add(shine);
      g.add(dot);
      this.eyeDots.push(dot);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(o.eyeR * 0.95, o.eyeR * 0.28, 4, 10, Math.PI), flat(FEATURE));
      arc.position.y = -o.eyeR * 0.3;
      arc.visible = false;
      g.add(arc);
      this.arcs.push(arc);
      this.eyes.push(g);
      if (o.brow) {
        const bg = this.spot(s * o.eyeAx * 1.05, o.eyeAy + o.eyeR * 2.6 / r, 0.01);
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(o.eyeR * 0.28, o.eyeR * 1.5, 3, 6), flat(o.brow));
        b.rotation.z = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(b);
        bg.add(holder);
        this.brows.push(holder);
      }
      if (o.cheek) {
        const c = this.spot(s * o.eyeAx * 1.45, o.eyeAy - (o.eyeR * 2.2) / r, -0.01);
        const d = new THREE.Mesh(new THREE.CircleGeometry(o.eyeR * 1.25, 14), flat(o.cheek, 0.55));
        d.scale.y = 0.62;
        c.add(d);
      }
    }
    if (o.nose) {
      const n = this.spot(0, (o.eyeAy + o.mouthAy) / 2, 0);
      n.add(sph(o.noseR ?? r * 0.1, o.nose, 8, 6, false));
    }
    const mg = this.spot(0, o.mouthAy, 0);
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(o.mouthR, o.mouthR * 0.22, 4, 12, Math.PI), flat(FEATURE));
    this.flatMouth = new THREE.Mesh(new THREE.CapsuleGeometry(o.mouthR * 0.2, o.mouthR * 0.9, 3, 6), flat(FEATURE));
    this.flatMouth.rotation.z = Math.PI / 2;
    mg.add(this.mouth, this.flatMouth);
  }

  /** A holder on the head's surface at the given angles, facing out. */
  private spot(ax: number, ay: number, lift: number): THREE.Group {
    const g = new THREE.Group();
    const dir = new THREE.Vector3(Math.sin(ax) * Math.cos(ay), Math.sin(ay), Math.cos(ax) * Math.cos(ay));
    g.position.copy(dir).multiplyScalar(this.r * (1.0 + lift));
    g.lookAt(dir.multiplyScalar(this.r * 3));
    this.head.add(g);
    return g;
  }

  setMood(m: Mood): void {
    const o = this.o;
    const happy = m === "happy";
    this.eyeDots.forEach((d, i) => {
      d.visible = !(happy && o.happyArcs);
      this.arcs[i].visible = happy && !!o.happyArcs;
      d.scale.y = (o.eyeTall ?? 1.25) * (m === "angry" ? 0.75 : 1);
    });
    this.brows.forEach((b, i) => {
      const s = i ? 1 : -1;
      b.rotation.z = m === "angry" ? -0.5 * s : m === "sad" ? 0.4 * s : happy ? 0.08 * s : 0;
      b.position.y = happy ? o.eyeR * 0.5 : m === "angry" ? -o.eyeR * 0.35 : 0;
    });
    this.flatMouth.visible = m === "neutral";
    this.mouth.visible = m !== "neutral";
    this.mouth.rotation.z = happy ? Math.PI : 0;
    this.mouth.position.y = happy ? o.mouthR * 0.35 : -o.mouthR * 0.6;
    this.mouth.scale.set(1, m === "angry" ? 0.55 : 1, 1);
  }

  look(x: number): void {
    for (const e of this.eyes) {
      e.children.forEach((c) => (c.position.x = x * this.o.eyeR * 4));
    }
  }
}

interface HatCtx {
  /** Top of the head and its radius. */
  top: number;
  r: number;
  /** Eye height and spread, and the front of the face, for shades. */
  eyeY: number;
  eyeX: number;
  frontZ: number;
  /** Neck height and radius, for a bandana. */
  neckY: number;
  neckR: number;
}

/** Regional headwear, scaled to the head. Returns true when it covers the top of the head. */
function addHat(g: THREE.Group, hat: Hat, c: HatCtx): boolean {
  const s = c.r / 0.6;
  const at = (m: THREE.Mesh, x: number, y: number, z = 0) => {
    m.position.set(x * s, c.top + y * s, z * s);
    g.add(m);
    return m;
  };
  if (hat === "beanie") {
    const b = mesh(faceted(new THREE.SphereGeometry(0.64 * s, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), "#c9584a");
    at(b, 0, -0.24);
    b.scale.y = 1.05;
    const cuff = mesh(faceted(new THREE.CylinderGeometry(0.66 * s, 0.66 * s, 0.16 * s, 16)), "#b14b3f");
    at(cuff, 0, -0.22);
    at(sph(0.16 * s, "#f6efe0", 8, 6), 0, 0.42);
    return true;
  }
  if (hat === "cap") {
    const col = "#3f6a96";
    at(mesh(faceted(new THREE.SphereGeometry(0.62 * s, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), col), 0, -0.18);
    const brim = mesh(faceted(new THREE.CylinderGeometry(0.46 * s, 0.46 * s, 0.05 * s, 12, 1, false, -Math.PI / 2, Math.PI)), col);
    at(brim, 0, -0.16, 0.36);
    brim.rotation.x = 0.12;
    return true;
  }
  if (hat === "ranger") {
    at(mesh(faceted(new THREE.CylinderGeometry(0.98 * s, 0.98 * s, 0.06 * s, 18)), "#9c7a45"), 0, -0.1);
    at(mesh(faceted(new THREE.CylinderGeometry(0.42 * s, 0.54 * s, 0.45 * s, 12)), "#9c7a45"), 0, 0.14);
    at(mesh(faceted(new THREE.CylinderGeometry(0.545 * s, 0.545 * s, 0.1 * s, 12)), "#5d4a32", { ink: false }), 0, -0.02);
    return true;
  }
  if (hat === "antlers") {
    for (const k of [-1, 1]) {
      const a = at(mesh(faceted(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.6 * s, 6)), "#d9c3a0"), 0.35 * k, 0.12);
      a.rotation.z = -0.5 * k;
      const t = at(mesh(faceted(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.3 * s, 6)), "#d9c3a0"), 0.55 * k, 0.32);
      t.rotation.z = 0.4 * k;
    }
    // A headband to hold them.
    const band = at(mesh(faceted(new THREE.TorusGeometry(0.56 * s, 0.05 * s, 5, 18, Math.PI)), "#7a5a3a"), 0, -0.26);
    band.rotation.y = 0;
    return false;
  }
  if (hat === "sunhat") {
    at(mesh(faceted(new THREE.CylinderGeometry(1.1 * s, 1.1 * s, 0.05 * s, 20)), "#ecd38e"), 0, -0.12);
    at(mesh(faceted(new THREE.SphereGeometry(0.52 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#ecd38e"), 0, -0.14);
    at(mesh(faceted(new THREE.CylinderGeometry(0.53 * s, 0.53 * s, 0.1 * s, 14)), "#d9584a", { ink: false }), 0, -0.07);
    return true;
  }
  if (hat === "cowboy") {
    const brim = at(mesh(faceted(new THREE.CylinderGeometry(1.05 * s, 1.05 * s, 0.06 * s, 18)), "#8a5a32"), 0, -0.08);
    brim.scale.z = 0.8;
    at(mesh(faceted(new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.5 * s, 12)), "#8a5a32"), 0, 0.18);
    at(mesh(faceted(new THREE.BoxGeometry(0.1 * s, 0.12 * s, 0.7 * s)), "#6e4524", { ink: false }), 0, 0.42);
    return true;
  }
  if (hat === "shades") {
    for (const k of [-1, 1]) {
      const lens = mesh(faceted(new THREE.CylinderGeometry(c.r * 0.27, c.r * 0.24, 0.04, 12)), "#2a2226", { ink: false });
      lens.rotation.x = Math.PI / 2;
      lens.position.set(c.eyeX * k, c.eyeY, c.frontZ + 0.04);
      g.add(lens);
    }
    const bridge = mesh(faceted(new THREE.BoxGeometry(c.eyeX * 0.8, 0.035, 0.035)), "#2a2226", { ink: false });
    bridge.position.set(0, c.eyeY + c.r * 0.06, c.frontZ + 0.05);
    g.add(bridge);
    return false;
  }
  if (hat === "bandana") {
    const b = mesh(faceted(new THREE.CylinderGeometry(c.neckR * 1.05, c.neckR * 1.2, 0.26, 14)), "#c8463a");
    b.position.y = c.neckY;
    b.scale.z = 0.88;
    g.add(b);
    const knot = mesh(faceted(new THREE.ConeGeometry(0.16, 0.3, 4)), "#c8463a");
    knot.rotation.x = Math.PI;
    knot.position.set(0, c.neckY - 0.2, c.neckR * 1.02);
    g.add(knot);
    return false;
  }
  return false;
}

/** A customer: a bean in one of the shirt colours, with a painted face and the town's headwear. */
export function buildPerson(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const color = CLOTH[seed % CLOTH.length];
  const torso = smoothSph(0.85, color, 20, 14);
  torso.scale.set(1, 1.15, 0.88);
  torso.position.y = 0.95;
  body.add(torso);
  const belly = smoothSph(0.55, new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.5).getStyle(), 16, 10, false);
  belly.scale.set(1, 1.0, 0.5);
  belly.position.set(0, 0.62, 0.5);
  body.add(belly);
  for (const s of [-1, 1]) {
    const arm = sph(0.2, color, 8, 6);
    arm.scale.set(0.8, 1.3, 0.8);
    arm.position.set(0.84 * s, 0.7, 0.18);
    arm.rotation.z = 0.35 * s;
    body.add(arm);
  }
  // The face sits on a sphere that matches the front of the bean.
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  body.add(head);
  const face = new Face(head, 0.76, { eyeAx: 0.36, eyeAy: 0.32, eyeR: 0.07, eyeTall: 1.35, brow: "#4a3530", mouthAy: 0.02, mouthR: 0.11, cheek: "#f08a8a", happyArcs: true });
  const hat = hatFor(seed, backdrop);
  const covered = addHat(body, hat, { top: 1.9, r: 0.62, eyeY: 1.12 + 0.76 * Math.sin(0.32), eyeX: 0.26, frontZ: 0.66, neckY: 0.95, neckR: 0.66 });
  if (!covered) {
    // A little sprout of hair.
    const hc = pick(HAIR, seed, 2);
    for (let i = 0; i < 3; i++) {
      const t = sph(0.12 - i * 0.02, hc, 8, 6, false);
      t.scale.set(0.7, 1.4, 0.7);
      t.position.set((i - 1) * 0.1, 1.98 + (i === 1 ? 0.04 : 0), 0.05);
      t.rotation.z = (1 - i) * 0.5;
      body.add(t);
    }
  }
  // The body, arms, hat and hair never change, so they bake into one vertex-coloured mesh and one
  // hull (DESIGN §45: a bean drops from about 22 draw calls to 11). Only the painted face, which
  // moves and changes with mood, stays live.
  head.userData.noBake = true;
  bakeStatic(body);
  return { body, setMood: (m) => face.setMood(m), look: (x) => face.look(x) };
}
