import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import { faceted, mesh } from "./materials";

/*
 * Customer designs. Five looks are built here for the customer study (pick one with ?cust=a..e,
 * or the old look with ?cust=0). Each builder fills a group, about 2.2 units tall with the feet
 * at y = 0, and returns hooks to show a mood and glance sideways.
 */

export type Mood = "neutral" | "happy" | "sad" | "angry";
export type CustomerStyle = "0" | "a" | "b" | "c" | "d" | "e";
export const CUSTOMER_STYLES: CustomerStyle[] = ["a", "b", "c", "d", "e"];

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

const SKIN = ["#f3d2b6", "#ebbf9c", "#d9a682", "#bf8a62", "#9c6a48", "#7d5238"] as const;
const HAIR = ["#3a2a24", "#5e4030", "#8a5a35", "#c99a58", "#e0c48a", "#9a9590", "#2c2a33", "#a5523a"] as const;
const CLOTH = ["#e7766f", "#f2a46d", "#9fcf8a", "#7f9fe0", "#f2cf5b", "#b9a3e3", "#6fc5b8", "#e889a8", "#5f7fa8", "#c8b89a"] as const;
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

/** A smooth ball, for heads: faceting breaks skin into blotches at this size. */
const ball = (r: number, color: string) => mesh(new THREE.SphereGeometry(r, 28, 20), color);
const sph = (r: number, color: string, w = 12, h = 9, ink: boolean | number = true) => mesh(faceted(new THREE.SphereGeometry(r, w, h)), color, { ink });

/** A smooth turned shape from a profile of [radius, y] points. */
function lathe(profile: [number, number][], color: string, seg = 16, ink: boolean | number = true): THREE.Mesh {
  return mesh(faceted(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)), color, { ink });
}

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
  /** How far the mouth stands off the head, as a share of its radius (to sit on a snout). */
  mouthLift?: number;
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
    const mg = this.spot(0, o.mouthAy, o.mouthLift ?? 0);
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

/* ------------------------------------------------------------------ A · Bean */

/** A: the current one-piece bean, with small painted eyes, blush and a tuft instead of the goggle eyes. */
function bean(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const color = CLOTH[seed % CLOTH.length];
  const torso = sph(0.85, color, 16, 12);
  torso.scale.set(1, 1.15, 0.88);
  torso.position.y = 0.95;
  body.add(torso);
  const belly = sph(0.55, new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.5).getStyle(), 12, 8, false);
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
  return { body, setMood: (m) => face.setMood(m), look: (x) => face.look(x) };
}

/* ------------------------------------------------------------------ B · Townsfolk */

type HairStyle = "crop" | "bob" | "bun" | "curls" | "bald" | "swoop";

function addHair(head: THREE.Group, r: number, style: HairStyle, col: string, covered: boolean): void {
  if (style === "bald") return;
  const sc = covered ? 0.98 : 1.06;
  // A cap of hair over the crown and back.
  const capGeo = new THREE.SphereGeometry(r * sc, 16, 10, 0, Math.PI * 2, 0, style === "crop" ? 1.25 : 1.45);
  const cap = mesh(faceted(capGeo), col);
  cap.rotation.x = -0.35;
  cap.position.set(0, r * 0.03, -r * 0.05);
  head.add(cap);
  if (covered) return;
  if (style === "bob") {
    const back = sph(r * 1.08, col, 14, 10);
    back.scale.set(1.05, 0.95, 0.85);
    back.position.set(0, -r * 0.18, -r * 0.3);
    head.add(back);
  } else if (style === "bun") {
    const b = sph(r * 0.38, col, 10, 8);
    b.position.set(0, r * 0.95, -r * 0.35);
    head.add(b);
  } else if (style === "curls") {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const c = sph(r * 0.3, col, 8, 6);
      c.position.set(Math.cos(a) * r * 0.78, r * 0.62 + Math.sin(a * 2) * r * 0.08, Math.sin(a) * r * 0.62 - r * 0.15);
      head.add(c);
    }
  } else if (style === "swoop") {
    const f = sph(r * 0.45, col, 10, 8);
    f.scale.set(1.5, 0.6, 0.9);
    f.position.set(r * 0.25, r * 0.78, r * 0.38);
    f.rotation.z = -0.25;
    head.add(f);
  }
}

/** B: chibi townsfolk. Big round heads in real skin tones, hair, shirts with a collar, dot eyes. */
function townsfolk(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const shirt = CLOTH[seed % CLOTH.length];
  const skin = pick(SKIN, seed, 1);
  const hairCol = pick(HAIR, seed, 2);
  const style = pick(["crop", "bob", "bun", "curls", "bald", "swoop", "crop", "bob"] as const, seed, 3);
  const torso = lathe([[0, 0.1], [0.5, 0.12], [0.6, 0.45], [0.6, 0.8], [0.52, 1.05], [0.28, 1.18], [0, 1.2]], shirt);
  torso.scale.z = 0.8;
  body.add(torso);
  const collar = mesh(faceted(new THREE.TorusGeometry(0.21, 0.06, 5, 14)), new THREE.Color(shirt).lerp(new THREE.Color("#ffffff"), 0.55).getStyle(), { ink: false });
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.16;
  body.add(collar);
  for (const s of [-1, 1]) {
    const arm = mesh(faceted(new THREE.CapsuleGeometry(0.15, 0.42, 3, 8)), shirt);
    arm.position.set(0.6 * s, 0.68, 0.05);
    arm.rotation.z = 0.18 * s;
    body.add(arm);
    const hand = sph(0.13, skin, 8, 6);
    hand.position.set(0.66 * s, 0.36, 0.08);
    body.add(hand);
  }
  const R = 0.56;
  const head = new THREE.Group();
  head.position.y = 1.2 + R * 0.9;
  body.add(head);
  head.add(ball(R, skin));
  for (const s of [-1, 1]) {
    const ear = sph(R * 0.2, skin, 8, 6);
    ear.scale.z = 0.6;
    ear.position.set(R * 0.97 * s, -R * 0.05, 0);
    head.add(ear);
  }
  const face = new Face(head, R, { eyeAx: 0.37, eyeAy: -0.02, eyeR: 0.068, eyeTall: 1.3, brow: hairCol, mouthAy: -0.38, mouthR: 0.085, cheek: "#ee8a80", nose: new THREE.Color(skin).multiplyScalar(0.9).getStyle(), noseR: 0.06, happyArcs: true });
  const hat = hatFor(seed, backdrop);
  const top = head.position.y + R;
  const covered = addHat(body, hat, { top: top + 0.06, r: R * 1.02, eyeY: head.position.y - 0.02, eyeX: R * 0.35, frontZ: R * 0.95, neckY: 1.12, neckR: 0.3 });
  addHair(head, R, style, hairCol, covered);
  return { body, setMood: (m) => face.setMood(m), look: (x) => face.look(x) };
}

/* ------------------------------------------------------------------ C · Storybook */

/** C: storybook grown-ups. Taller, smaller oval heads, shoulders and clothes with lapels or an apron. */
function storybook(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const coat = CLOTH[seed % CLOTH.length];
  const skin = pick(SKIN, seed, 1);
  const hairCol = pick(HAIR, seed, 2);
  const style = pick(["crop", "bob", "bun", "swoop", "bald", "crop"] as const, seed, 3);
  const garment = pick(["jacket", "apron", "sweater", "dress"] as const, seed, 4);
  const torso = lathe([[0, 0], [0.5, 0.02], [0.52, 0.5], [0.58, 1.0], [0.62, 1.3], [0.48, 1.45], [0.14, 1.52], [0, 1.52]], coat, 18);
  torso.scale.z = 0.68;
  body.add(torso);
  const light = new THREE.Color(coat).lerp(new THREE.Color("#fffaf0"), 0.7).getStyle();
  if (garment === "jacket") {
    // A shirt showing down the front between lapels.
    const shirt = mesh(faceted(new THREE.ConeGeometry(0.18, 0.55, 3)), "#f6f0e4", { ink: false });
    shirt.rotation.x = Math.PI;
    shirt.position.set(0, 1.25, 0.37);
    shirt.scale.z = 0.3;
    body.add(shirt);
  } else if (garment === "apron") {
    const ap = mesh(faceted(new THREE.BoxGeometry(0.62, 0.9, 0.04)), light, { ink: false });
    ap.position.set(0, 0.75, 0.37);
    ap.rotation.x = -0.05;
    body.add(ap);
    for (const s of [-1, 1]) {
      const strap = mesh(faceted(new THREE.BoxGeometry(0.06, 0.4, 0.04)), light, { ink: false });
      strap.position.set(0.22 * s, 1.33, 0.32);
      strap.rotation.z = 0.25 * s;
      body.add(strap);
    }
  } else if (garment === "sweater") {
    const band = mesh(faceted(new THREE.TorusGeometry(0.17, 0.07, 5, 14)), light, { ink: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.5;
    body.add(band);
    const stripe = mesh(faceted(new THREE.CylinderGeometry(0.585, 0.565, 0.1, 18)), light, { ink: false });
    stripe.scale.z = 0.69;
    stripe.position.y = 1.0;
    body.add(stripe);
  } else {
    const col = mesh(faceted(new THREE.CircleGeometry(0.2, 14, 0, Math.PI)), "#fffaf0", { ink: false });
    col.rotation.z = Math.PI;
    col.position.set(0, 1.47, 0.18);
    col.rotation.x = -1.0;
    body.add(col);
  }
  for (const s of [-1, 1]) {
    const arm = mesh(faceted(new THREE.CapsuleGeometry(0.12, 0.75, 3, 8)), coat);
    arm.position.set(0.64 * s, 0.86, 0);
    arm.rotation.z = 0.08 * s;
    body.add(arm);
    const hand = sph(0.11, skin, 8, 6);
    hand.position.set(0.68 * s, 0.38, 0.03);
    body.add(hand);
  }
  const neck = mesh(faceted(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 10)), skin, { ink: false });
  neck.position.y = 1.58;
  body.add(neck);
  const R = 0.42;
  const head = new THREE.Group();
  head.position.y = 1.62 + R * 1.05;
  head.scale.set(1, 1.15, 1);
  body.add(head);
  head.add(ball(R, skin));
  for (const s of [-1, 1]) {
    const ear = sph(R * 0.2, skin, 8, 6);
    ear.scale.z = 0.6;
    ear.position.set(R * 0.97 * s, -R * 0.02, 0);
    head.add(ear);
  }
  const face = new Face(head, R, { eyeAx: 0.36, eyeAy: 0.02, eyeR: 0.045, eyeTall: 1.7, brow: hairCol, mouthAy: -0.42, mouthR: 0.06, cheek: "#e88a80", nose: new THREE.Color(skin).multiplyScalar(0.88).getStyle(), noseR: 0.05 });
  const hat = hatFor(seed, backdrop);
  const top = head.position.y + R * 1.15;
  const covered = addHat(body, hat, { top: top + 0.03, r: R * 1.05, eyeY: head.position.y + 0.01, eyeX: R * 0.36, frontZ: R * 0.95, neckY: 1.56, neckR: 0.2 });
  addHair(head, R, style, hairCol, covered);
  return { body, setMood: (m) => face.setMood(m), look: (x) => face.look(x) };
}

/* ------------------------------------------------------------------ D · Animal locals */

type Species = "bear" | "fox" | "deer" | "otter" | "dog" | "cat" | "coyote" | "hare" | "tortoise" | "rabbit" | "sheep" | "hedgehog";
const SPECIES: Record<Backdrop, Species[]> = {
  mountains: ["bear", "fox", "deer"],
  beach: ["otter", "dog", "cat"],
  desert: ["coyote", "hare", "tortoise"],
  orchard: ["rabbit", "sheep", "hedgehog"],
};
const FUR: Record<Species, { fur: string; muzzle: string; ear: "round" | "point" | "long" | "flop" | "none" | "small"; inner?: string }> = {
  bear: { fur: "#9a6a45", muzzle: "#e2c39e", ear: "round" },
  fox: { fur: "#e58a4e", muzzle: "#fbf1e2", ear: "point", inner: "#5a3b33" },
  deer: { fur: "#c99566", muzzle: "#f3e2c8", ear: "long", inner: "#f0c4b0" },
  otter: { fur: "#8d6448", muzzle: "#e8d2b4", ear: "small" },
  dog: { fur: "#e8c48c", muzzle: "#fff5e6", ear: "flop" },
  cat: { fur: "#9aa0ad", muzzle: "#f4f0ea", ear: "point", inner: "#f0b8b0" },
  coyote: { fur: "#c9a178", muzzle: "#f3e6d0", ear: "point", inner: "#e8c8a8" },
  hare: { fur: "#d6b48a", muzzle: "#fbf3e6", ear: "long", inner: "#f0c0b0" },
  tortoise: { fur: "#a5b27a", muzzle: "#d9e0b8", ear: "none" },
  rabbit: { fur: "#efe8e0", muzzle: "#ffffff", ear: "long", inner: "#f3b8b8" },
  sheep: { fur: "#5a4a48", muzzle: "#7a6866", ear: "flop" },
  hedgehog: { fur: "#d8b894", muzzle: "#f6e8d6", ear: "small" },
};

/** D: animal locals, a different set in each region, in town clothes. */
function animals(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const sp = SPECIES[backdrop][seed % 3];
  const f = FUR[sp];
  const shirt = CLOTH[(seed * 7 + 3) % CLOTH.length];
  const torso = lathe([[0, 0.1], [0.52, 0.12], [0.64, 0.5], [0.6, 0.85], [0.48, 1.08], [0.22, 1.18], [0, 1.2]], shirt);
  torso.scale.z = 0.82;
  body.add(torso);
  for (const s of [-1, 1]) {
    const arm = mesh(faceted(new THREE.CapsuleGeometry(0.15, 0.4, 3, 8)), shirt);
    arm.position.set(0.62 * s, 0.7, 0.05);
    arm.rotation.z = 0.2 * s;
    body.add(arm);
    const paw = sph(0.14, f.fur, 8, 6);
    paw.position.set(0.68 * s, 0.4, 0.08);
    body.add(paw);
  }
  const R = 0.56;
  const head = new THREE.Group();
  head.position.y = 1.2 + R * 0.85;
  body.add(head);
  const skull = ball(R, f.fur);
  if (sp === "fox" || sp === "coyote") skull.scale.set(1.08, 0.95, 1);
  head.add(skull);
  // Muzzle: a pale snout with a dark nose.
  const snoutLong = sp === "fox" || sp === "coyote" || sp === "dog" || sp === "bear" || sp === "deer";
  const mz = sph(R * (snoutLong ? 0.42 : 0.36), f.muzzle, 12, 8, false);
  mz.scale.set(1.15, 0.8, snoutLong ? 0.9 : 0.6);
  mz.position.set(0, -R * 0.3, R * 0.78);
  head.add(mz);
  const nose = sph(R * 0.11, sp === "rabbit" || sp === "hare" ? "#e48a8a" : "#3a2c2c", 8, 6, false);
  nose.scale.set(1.3, 0.85, 0.9);
  nose.position.set(0, -R * 0.18, R * (snoutLong ? 1.12 : 0.98));
  head.add(nose);
  if (sp === "sheep") {
    // A cream fleece over a dark face.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const c = sph(R * 0.32, "#f4efe4", 8, 6);
      c.position.set(Math.cos(a) * R * 0.8, R * 0.55 + Math.sin(a * 3) * R * 0.08, Math.sin(a) * R * 0.6 - R * 0.1);
      head.add(c);
    }
  }
  if (sp === "hedgehog") {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sp2 = mesh(faceted(new THREE.ConeGeometry(R * 0.16, R * 0.5, 5)), "#6b4c38");
      const dir = new THREE.Vector3(Math.cos(a) * 0.9, 0.55 + (i % 2) * 0.25, Math.sin(a) * 0.9 - 0.45).normalize();
      sp2.position.copy(dir).multiplyScalar(R * 0.95);
      sp2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      head.add(sp2);
    }
  }
  if (sp === "tortoise") {
    const shell = sph(0.75, "#7d6a45", 14, 8);
    shell.scale.set(1, 0.75, 0.7);
    shell.position.set(0, 0.85, -0.42);
    body.add(shell);
  }
  const hat = hatFor(seed, backdrop);
  const top = head.position.y + R;
  const covered = addHat(body, hat, { top: top + 0.04, r: R, eyeY: head.position.y + R * 0.12, eyeX: R * 0.38, frontZ: R * 0.92, neckY: 1.12, neckR: 0.3 });
  for (const s of [-1, 1]) {
    if (f.ear === "none") break;
    let ear: THREE.Mesh;
    if (f.ear === "round" || f.ear === "small") {
      ear = sph(R * (f.ear === "round" ? 0.28 : 0.18), f.fur, 10, 8);
      ear.scale.z = 0.55;
      ear.position.set(R * 0.68 * s, R * 0.72, -R * 0.05);
    } else if (f.ear === "point") {
      ear = mesh(faceted(new THREE.ConeGeometry(R * 0.26, R * 0.6, 4)), f.fur);
      ear.scale.z = 0.5;
      ear.position.set(R * 0.58 * s, R * 0.92, 0);
      ear.rotation.z = -0.32 * s;
    } else if (f.ear === "long") {
      ear = mesh(faceted(new THREE.CapsuleGeometry(R * 0.15, R * 0.9, 3, 8)), f.fur);
      ear.scale.z = 0.5;
      ear.position.set(R * 0.36 * s, R * 1.3, -R * 0.05);
      ear.rotation.z = -0.2 * s;
      if (sp === "deer") {
        ear.rotation.z = -1.1 * s;
        ear.position.set(R * 0.95 * s, R * 0.5, 0);
      }
    } else {
      ear = mesh(faceted(new THREE.CapsuleGeometry(R * 0.17, R * 0.5, 3, 8)), new THREE.Color(f.fur).multiplyScalar(0.8).getStyle());
      ear.scale.z = 0.5;
      ear.position.set(R * 0.92 * s, R * 0.1, 0);
      ear.rotation.z = 0.25 * s;
    }
    // Pointed and long ears stick up through hats; round ones hide under.
    if (covered && (f.ear === "round" || f.ear === "small")) continue;
    if (covered && f.ear === "long" && sp !== "deer") ear.position.y += R * 0.25;
    head.add(ear);
  }
  if (sp === "deer" && hat !== "antlers") {
    for (const s of [-1, 1]) {
      const a = mesh(faceted(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 6)), "#d9c3a0");
      a.position.set(R * 0.35 * s, R * 1.1, -R * 0.1);
      a.rotation.z = -0.3 * s;
      head.add(a);
    }
  }
  const face = new Face(head, R, { eyeAx: 0.42, eyeAy: 0.2, eyeR: 0.072, eyeTall: 1.25, brow: null, mouthAy: -0.5, mouthLift: 0.2, mouthR: 0.07, cheek: sp === "sheep" ? null : "#ef8f8f", happyArcs: true });
  return { body, setMood: (m) => face.setMood(m), look: (x) => face.look(x) };
}

/* ------------------------------------------------------------------ E · Sketch faces */

const faceTex = new Map<string, THREE.CanvasTexture>();
/** A face drawn in pencil on a transparent canvas, one per mood. */
function sketchFace(m: Mood): THREE.CanvasTexture {
  let t = faceTex.get(m);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = FEATURE;
  g.fillStyle = FEATURE;
  const ex = 64;
  const ey = 118;
  // Cheeks: three hatched strokes each.
  g.strokeStyle = "rgba(226,110,104,0.75)";
  g.lineWidth = 5;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = 128 + s * 86 + (i - 1) * 11;
    g.beginPath();
    g.moveTo(x - 5, 160);
    g.lineTo(x + 5, 146);
    g.stroke();
  }
  g.strokeStyle = FEATURE;
  g.lineWidth = 10;
  for (const s of [-1, 1]) {
    const x = 128 + s * ex * 0.75;
    if (m === "happy") {
      g.beginPath();
      g.arc(x, ey + 8, 17, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else {
      g.beginPath();
      g.ellipse(x, ey, 11, m === "angry" ? 12 : 17, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Brows.
    g.beginPath();
    const by = ey - 34;
    if (m === "angry") {
      g.moveTo(x - 16 * s * -1, by - 8);
      g.lineTo(x + 14 * s * -1, by + 6);
    } else if (m === "sad") {
      g.moveTo(x - 16 * s * -1, by + 6);
      g.lineTo(x + 14 * s * -1, by - 6);
    } else {
      g.moveTo(x - 15, by + (m === "happy" ? -2 : 2));
      g.quadraticCurveTo(x, by - 6, x + 15, by + (m === "happy" ? -2 : 2));
    }
    g.stroke();
  }
  // Mouth.
  g.beginPath();
  const my = 172;
  if (m === "happy") {
    g.moveTo(104, my - 6);
    g.quadraticCurveTo(128, my + 30, 152, my - 6);
    g.closePath();
    g.fillStyle = "#8e3b3e";
    g.fill();
    g.stroke();
  } else if (m === "neutral") {
    g.moveTo(112, my);
    g.quadraticCurveTo(128, my + 7, 144, my);
    g.stroke();
  } else if (m === "sad") {
    g.moveTo(110, my + 8);
    g.quadraticCurveTo(128, my - 10, 146, my + 8);
    g.stroke();
  } else {
    g.moveTo(108, my + 4);
    g.lineTo(118, my - 2);
    g.lineTo(128, my + 3);
    g.lineTo(138, my - 2);
    g.lineTo(148, my + 4);
    g.stroke();
  }
  // Nose: a small hook.
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(130, 128);
  g.quadraticCurveTo(138, 146, 126, 148);
  g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faceTex.set(m, t);
  return t;
}

/** E: hand-drawn faces. Round heads with pencil-drawn features, on simple coats and hoods. */
function sketch(seed: number, backdrop: Backdrop): Person {
  const body = new THREE.Group();
  const coat = CLOTH[seed % CLOTH.length];
  const skin = pick(SKIN, seed, 1);
  const hairCol = pick(HAIR, seed, 2);
  const style = pick(["crop", "bob", "bun", "curls", "swoop", "bald"] as const, seed, 3);
  // A bell-shaped coat with a turned-down collar.
  const torso = lathe([[0, 0.05], [0.66, 0.08], [0.62, 0.4], [0.55, 0.8], [0.46, 1.05], [0.24, 1.2], [0, 1.22]], coat, 18);
  torso.scale.z = 0.8;
  body.add(torso);
  const collar = mesh(faceted(new THREE.CylinderGeometry(0.3, 0.42, 0.14, 14)), new THREE.Color(coat).multiplyScalar(0.85).getStyle());
  collar.position.y = 1.14;
  collar.scale.z = 0.85;
  body.add(collar);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), flat("#3b2f33"));
    b.position.set(0, 0.95 - i * 0.24, 0.53 - i * 0.02 + (i === 0 ? -0.05 : 0.0));
    b.lookAt(0, b.position.y, 3);
    body.add(b);
  }
  const R = 0.58;
  const head = new THREE.Group();
  head.position.y = 1.2 + R * 0.88;
  body.add(head);
  head.add(ball(R, skin));
  const w = 1.7;
  const h = 1.5;
  const capGeo = new THREE.SphereGeometry(R * 1.008, 24, 18, Math.PI / 2 - w / 2, w, Math.PI / 2 - h / 2, h);
  const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ map: sketchFace("neutral"), transparent: true, depthWrite: false }));
  cap.material.userData.disposable = true;
  head.add(cap);
  const hat = hatFor(seed, backdrop);
  const top = head.position.y + R;
  const covered = addHat(body, hat, { top: top + 0.05, r: R * 1.02, eyeY: head.position.y + R * 0.12, eyeX: R * 0.32, frontZ: R * 0.95, neckY: 1.14, neckR: 0.32 });
  addHair(head, R, style, hairCol, covered);
  const mat = cap.material;
  return {
    body,
    setMood: (m) => {
      mat.map = sketchFace(m);
      mat.needsUpdate = true;
    },
    look: (x) => (cap.rotation.y = x * 1.2),
  };
}

/* ------------------------------------------------------------------ 0 · Original */

/** The build #72 figure, kept for comparison in the study. */
function original(seed: number, backdrop: Backdrop): Person {
  const BODY = ["#7fb7e6", "#f29e6d", "#9fd27a", "#e889b8", "#f2cf5b", "#a99be8", "#6fd1c4", "#e7766f"];
  const color = BODY[seed % BODY.length];
  const body = new THREE.Group();
  const torso = sph(0.85, color, 14, 10);
  torso.scale.set(1, 1.15, 0.85);
  torso.position.y = 0.95;
  body.add(torso);
  const belly = sph(0.55, new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45).getStyle(), 12, 8, false);
  belly.scale.set(1, 1.05, 0.5);
  belly.position.set(0, 0.75, 0.48);
  body.add(belly);
  const pupils: THREE.Mesh[] = [];
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = sph(0.2, "#ffffff", 10, 8, 1.12);
    eye.position.set(0.28 * s, 1.35, 0.62);
    eye.scale.z = 0.6;
    const pupil = sph(0.09, "#1d1410", 8, 6, false);
    pupil.position.set(0, 0, 0.16);
    eye.add(pupil);
    pupils.push(pupil);
    body.add(eye);
    const brow = mesh(faceted(new THREE.BoxGeometry(0.28, 0.06, 0.06)), "#2a1d17", { ink: false });
    brow.position.set(0.28 * s, 1.62, 0.66);
    brows.push(brow);
    body.add(brow);
    const arm = sph(0.22, color, 8, 6);
    arm.scale.set(0.8, 1.3, 0.8);
    arm.position.set(0.85 * s, 0.75, 0.15);
    arm.rotation.z = 0.4 * s;
    body.add(arm);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.16, 0.04, 5, 12, Math.PI), "#2a1d17", { ink: false });
  mouth.position.set(0, 1.08, 0.72);
  body.add(mouth);
  addHat(body, hatFor(seed, backdrop), { top: 1.93, r: 0.6, eyeY: 1.37, eyeX: 0.28, frontZ: 0.74, neckY: 0.95, neckR: 0.62 });
  return {
    body,
    setMood: (m) => {
      const happy = m === "happy";
      mouth.rotation.z = happy || m === "neutral" ? Math.PI : 0;
      mouth.scale.set(m === "neutral" ? 0.7 : 1, m === "neutral" ? 0.4 : 1, 1);
      mouth.position.y = happy ? 1.12 : m === "neutral" ? 1.1 : 1.0;
      brows.forEach((b, i) => {
        const s = i ? 1 : -1;
        b.rotation.z = m === "angry" ? -0.45 * s : m === "sad" ? 0.35 * s : 0;
        b.position.y = happy ? 1.66 : 1.62;
      });
    },
    look: (x) => pupils.forEach((p) => (p.position.x = THREE.MathUtils.clamp(x, -0.06, 0.06))),
  };
}

const BUILDERS: Record<CustomerStyle, (seed: number, backdrop: Backdrop) => Person> = {
  "0": original,
  a: bean,
  b: townsfolk,
  c: storybook,
  d: animals,
  e: sketch,
};

/** Which design to draw: ?cust=x in the address, else the saved choice, else the original. */
export function customerStyle(): CustomerStyle {
  try {
    const q = new URLSearchParams(location.search).get("cust");
    if (q && q in BUILDERS) {
      localStorage.setItem("bv-cust", q);
      return q as CustomerStyle;
    }
    const s = localStorage.getItem("bv-cust");
    if (s && s in BUILDERS) return s as CustomerStyle;
  } catch {
    // No storage or no location: use the default.
  }
  return "0";
}

export function buildPerson(seed: number, backdrop: Backdrop, style: CustomerStyle = customerStyle()): Person {
  return BUILDERS[style](seed, backdrop);
}
