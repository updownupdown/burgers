import * as THREE from "three";
import type { DrinkId, Size } from "../../game/types";
import { bakedMesh, bakeShared, Parts, type Baked } from "../bake";
import { faceted, grade, lineColor, lineMaterial, mesh, shareGeometry, toon } from "../materials";

/*
 * Drinks-page models: cups (with liquid, ice and lid), the lid stack, the ice bin and the under-counter supplies cupboard. Everything here is built
 * from shared geometry; only the few parts that depend on flavour pick a material per cup,
 * and those come from the material cache, so cups are cheap to make and throw away.
 */

export interface CupObject extends THREE.Group {
  userData: {
    flavor: DrinkId;
    /** Liquid level 0..1; the ice rides on top of it. */
    setFill: (f: number) => void;
    setIce: (on: boolean) => void;
    setLid: (on: boolean) => void;
  };
}

// Cups in cup units: real paper-cup sizes in study units (10 cm). Draw them at SCALE.cup.
// Straight tapered walls (base 0.74 of the rim), a flavour band from 0.4 to 0.65 of the height.
/** Rim radius and height of each cup size, in cup units. */
export const CUP_DIMS: Record<Size, { r: number; h: number }> = { S: { r: 0.36, h: 1.1 }, M: { r: 0.44, h: 1.45 }, L: { r: 0.5, h: 1.75 } };
const TAPER = 0.74;
const FLOOR_Y = 0.05;
const SEG = 28;

/** Cup sizes as width and height factors on the large cup (kept for older call sites). */
export const CUP_SCALE: Record<Size, [number, number]> = {
  S: [CUP_DIMS.S.r / CUP_DIMS.L.r, CUP_DIMS.S.h / CUP_DIMS.L.h],
  M: [CUP_DIMS.M.r / CUP_DIMS.L.r, CUP_DIMS.M.h / CUP_DIMS.L.h],
  L: [1, 1],
};

/** Height of the drink's surface above the cup's base at a fill (0..1), in cup units. */
export function cupSurfaceY(size: Size, fill: number): number {
  return FLOOR_Y + Math.max(0, Math.min(1, fill)) * (CUP_DIMS[size].h - 0.08);
}

const ICE_CUBE = shareGeometry(faceted(new THREE.BoxGeometry(0.19, 0.17, 0.19)));
const LID = shareGeometry(faceted(new THREE.CylinderGeometry(0.47, 0.455, 0.08, 14)));
const LID_RIDGE = shareGeometry(faceted(new THREE.TorusGeometry(0.29, 0.035, 6, 14)));

const CUP_PAPER = "#f6f3ec";
const CUP_INSIDE = "#d9d4c6";
const ICE = "#e4f5fb";
/** Drink colours as the study painted them: the band on the cup and the liquid inside. */
const DRINK_PAINT: Record<DrinkId, string> = { pine: "#7dbd8a", pink: "#f3a3b8", cola: "#3b1d1b", water: "#cfe8f2", tea: "#c3731f" };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lathe = (pts: [number, number][]) => faceted(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), SEG));

/** The paper shell of a cup (wall, rolled rim, base, flavour band), baked once per size and band colour. */
const SHELLS = new Map<string, Baked>();
function shell(size: Size, flavor: DrinkId | null): Baked {
  const key = size + (flavor ?? "-");
  let b = SHELLS.get(key);
  if (b) return b;
  const { r: rT, h: H } = CUP_DIMS[size];
  const rB = rT * TAPER;
  const p = new Parts();
  // The thin wall carries no outline of its own (its inner face's hull would show through the
  // outer face); a bare outer skin with a base carries it instead.
  p.add(lathe([[rB, 0], [rT, H], [rT + 0.025, H + 0.01], [rT - 0.012, H + 0.01], [rB - 0.012, FLOOR_Y], [0, FLOOR_Y]]), CUP_PAPER, { ink: false });
  p.add(lathe([[0, 0], [rB, 0], [rT, H]]), CUP_PAPER, { ink: 0.016 });
  p.add(faceted(new THREE.TorusGeometry(rT + 0.008, 0.022, 4, SEG)), CUP_PAPER, { p: [0, H + 0.005, 0], r: [Math.PI / 2, 0, 0], ink: 0.012 });
  p.add(lathe([[lerp(rB, rT, 0.4) + 0.006, H * 0.4], [lerp(rB, rT, 0.65) + 0.006, H * 0.65]]), flavor ? DRINK_PAINT[flavor] : "#c9c4b8", { ink: false });
  p.add(new THREE.CylinderGeometry(rB - 0.012, rB - 0.012, 0.004, SEG), CUP_INSIDE, { p: [0, FLOOR_Y + 0.004, 0], ink: false });
  SHELLS.set(key, (b = bakeShared(p)));
  return b;
}

/** Liquid at each fill step, per size, so pouring reuses geometry. */
const FILL_STEPS = 40;
const LIQUID = new Map<string, THREE.BufferGeometry>();
function liquidGeo(size: Size, fill: number): THREE.BufferGeometry {
  const step = Math.max(1, Math.round(Math.min(1, fill) * FILL_STEPS));
  const key = size + step;
  let g = LIQUID.get(key);
  if (g) return g;
  const { r: rT, h: H } = CUP_DIMS[size];
  const rB = rT * TAPER;
  const top = cupSurfaceY(size, step / FILL_STEPS);
  const rr = lerp(rB, rT, top / H) - 0.02;
  g = shareGeometry(lathe([[0, FLOOR_Y], [rB - 0.02, FLOOR_Y], [rr, top], [0, top]]));
  LIQUID.set(key, g);
  return g;
}

/** The lid for a size, baked once. */
const TOPS = new Map<Size, { lid: Baked }>();
function tops(size: Size): { lid: Baked } {
  let t = TOPS.get(size);
  if (t) return t;
  const { r: rT, h: H } = CUP_DIMS[size];
  const lid = new Parts();
  lid.add(new THREE.CylinderGeometry(rT + 0.03, rT + 0.02, 0.07, SEG), "#f8f8f4", { p: [0, H + 0.04, 0], ink: 0.014 });
  lid.add(new THREE.TorusGeometry(rT * 0.62, 0.03, 5, SEG), "#f8f8f4", { p: [0, H + 0.08, 0], r: [Math.PI / 2, 0, 0], ink: 0.01 });
  TOPS.set(size, (t = { lid: bakeShared(lid) }));
  return t;
}

/** Where the ice cubes sit, as fractions of the surface radius, jittered so they read as a handful. */
const CUP_ICE: { a: number; q: number; r: number; dy: number }[] = [
  { a: 0.3, q: 0.25, r: 0.3, dy: 0 },
  { a: 2.7, q: 0.55, r: 1.1, dy: -0.03 },
  { a: 5.1, q: 0.6, r: 2.1, dy: 0.03 },
  { a: 1.4, q: 0.6, r: 0.7, dy: -0.05 },
  { a: 3.9, q: 0.4, r: 1.6, dy: 0.02 },
];

/**
 * A paper cup, in cup units (draw at SCALE.cup): the drink inside, and optional ice and lid.
 * With no flavour it's a plain empty cup for the stacks. `lid` is only the starting lid
 * state; `setLid` toggles it later.
 */
export function makeCup(flavor: DrinkId | null, lid: boolean, size: Size = "M"): CupObject {
  const g = new THREE.Group() as CupObject;
  const { r: rT, h: H } = CUP_DIMS[size];
  const rB = rT * TAPER;
  // The shell casts a shadow but takes none: its own rolled lip would stripe the wall.
  const paper = bakedMesh(shell(size, flavor));
  paper.receiveShadow = false;
  g.add(paper);

  const liquid = new THREE.Mesh(liquidGeo(size, 1), toon(flavor ? DRINK_PAINT[flavor] : "#ffffff", { opacity: flavor === "water" ? 0.7 : 1 }));
  liquid.receiveShadow = true;
  g.add(liquid);

  const ice = new THREE.Group();
  for (const c of CUP_ICE) {
    const cube = mesh(ICE_CUBE, ICE, { ink: 1.12, shadow: false });
    cube.position.set(Math.cos(c.a) * c.q, c.dy, Math.sin(c.a) * c.q);
    cube.rotation.set(c.r * 0.5, c.r, c.r * 0.3);
    ice.add(cube);
  }
  ice.visible = false;
  g.add(ice);

  const t = tops(size);
  const top = bakedMesh(t.lid);
  top.visible = lid;
  g.add(top);

  let fill = 0;
  let iceOn = false;
  const place = () => {
    liquid.visible = fill > 0.01;
    if (liquid.visible) liquid.geometry = liquidGeo(size, fill);
    // Ice floats at the surface, or sits on the floor of an empty cup.
    const y = fill > 0.01 ? cupSurfaceY(size, fill) - 0.04 : FLOOR_Y + 0.09;
    const r = lerp(rB, rT, y / H) - 0.1;
    // ...but never through the lid.
    ice.position.y = Math.min(H - 0.17, y);
    ice.scale.set(r, 1, r);
    for (const c of ice.children) c.scale.set(1 / r, 1, 1 / r);
  };
  g.userData = {
    flavor: flavor ?? "cola",
    setFill: (f) => {
      fill = f;
      place();
    },
    // The lid is opaque, so ice under it is hidden rather than left to poke through.
    setIce: (on) => {
      iceOn = on;
      ice.visible = iceOn && !top.visible;
    },
    setLid: (on) => {
      top.visible = on;
      ice.visible = iceOn && !on;
    },
  };
  place();
  return g;
}

/** Many copies of one outlined shape in two draw calls. */
function instanced(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: THREE.Matrix4[], ink = 1.1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.InstancedMesh(geo, toon(color), xf.length);
  const hull = new THREE.InstancedMesh(geo, lineMaterial(lineColor(grade(color))), xf.length);
  const m = new THREE.Matrix4();
  const s = new THREE.Matrix4().makeScale(ink, ink, ink);
  xf.forEach((x, i) => {
    body.setMatrixAt(i, x);
    hull.setMatrixAt(i, m.multiplyMatrices(x, s));
  });
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body, hull);
  return g;
}

const compose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

/** Deterministic jitter so the models look the same every build. */
function jitter(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const LID_TRAY = shareGeometry(faceted(new THREE.BoxGeometry(1.1, 0.1, 1.1)));
const LID_POST = shareGeometry(faceted(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6)));

/** Lids stacked on a little four-post holder. */
export function makeLidStack(count: number): THREE.Group {
  const g = new THREE.Group();
  const tray = mesh(LID_TRAY, "#5b6366");
  tray.position.y = 0.05;
  g.add(tray);
  for (const [x, z] of [
    [-0.43, -0.43],
    [0.43, -0.43],
    [-0.43, 0.43],
    [0.43, 0.43],
  ]) {
    const post = mesh(LID_POST, "#8c9496", { ink: 1.25 });
    post.position.set(x, 0.5, z);
    g.add(post);
  }
  const xf: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i++) xf.push(compose(0, 0.14 + i * 0.055, 0, 0, (i % 3) * 0.3, 0, 0.9));
  if (count > 0) {
    g.add(instanced(LID, "#f8f8f4", xf, 1.06));
    // Ridges only on the top lid, so the stack reads as lids without the extra draw calls.
    const ridge = mesh(LID_RIDGE, "#f8f8f4", { ink: 1.1 });
    ridge.rotation.x = Math.PI / 2;
    ridge.scale.setScalar(0.9);
    ridge.position.y = 0.14 + (count - 1) * 0.055 + 0.05;
    g.add(ridge);
  }
  return g;
}

const ICE_BIN = shareGeometry(faceted(new THREE.BoxGeometry(1.9, 0.62, 1.35)));
const ICE_BIN_WELL = shareGeometry(faceted(new THREE.BoxGeometry(1.7, 0.5, 1.15)));
const SCOOP_BOWL = shareGeometry(faceted(new THREE.CylinderGeometry(0.17, 0.14, 0.26, 8, 1, true)));
const SCOOP_HANDLE = shareGeometry(faceted(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6)));

/** A steel ice well heaped with cubes, with a scoop resting on top. */
export function makeIceBin(): THREE.Group {
  const g = new THREE.Group();
  const bin = mesh(ICE_BIN, "#b9c4c1");
  bin.position.y = 0.31;
  const well = mesh(ICE_BIN_WELL, "#6f7a7c", { ink: false, shadow: false });
  well.position.y = 0.4;
  g.add(bin, well);
  const rnd = jitter(3);
  const xf: THREE.Matrix4[] = [];
  for (let i = 0; i < 48; i++) {
    const x = -0.72 + rnd() * 1.44;
    const z = -0.45 + rnd() * 0.9;
    // Heaped: taller toward the middle.
    const heap = 1 - Math.hypot(x / 0.8, z / 0.5) * 0.45;
    const y = 0.5 + rnd() * 0.22 * heap + (i < 24 ? 0 : 0.11);
    xf.push(compose(x, y, z, rnd() * 1.2, rnd() * 3.1, rnd() * 1.2, 0.85 + rnd() * 0.35));
  }
  g.add(instanced(ICE_CUBE, ICE, xf, 1.12));
  const scoop = new THREE.Group();
  const bowl = mesh(SCOOP_BOWL, "#d7dedd", { side: THREE.DoubleSide });
  bowl.rotation.z = Math.PI / 2;
  const handle = mesh(SCOOP_HANDLE, "#3a3633", { ink: 1.2 });
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.38;
  scoop.add(bowl, handle);
  scoop.position.set(0.45, 0.82, 0.3);
  scoop.rotation.y = -0.5;
  g.add(scoop);
  return g;
}

export interface CupboardObject extends THREE.Group {
  userData: {
    /** 0 = doors shut, 1 = swung open. */
    setOpen: (t: number) => void;
    /** Where a sleeve can sit, in the cupboard's local space: top shelf left to right, then the bottom shelf. */
    shelves: THREE.Vector3[];
  };
}

const CB_W = 5.2;
const CB_H = 2.7;
const CB_D = 2.0;
const CB_TOP = -0.2;
const CB_WOOD = "#8a5a37";
const CB_DOOR = "#a8703f";
const CB_PANEL = shareGeometry(faceted(new THREE.BoxGeometry(1, 1, 1)));
const CB_HANDLE = shareGeometry(faceted(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8)));
const CB_KNOB = shareGeometry(faceted(new THREE.SphereGeometry(0.07, 8, 6)));

function panel(w: number, h: number, d: number, x: number, y: number, z: number, color: string, ink?: number | false): THREE.Mesh {
  const m = mesh(CB_PANEL, color, { ink });
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

/**
 * The cupboard under the counter's front edge, where sleeves of cups and cartons live.
 * Its origin is the counter top at the cupboard's front face: it hangs from y −0.2 down
 * to −2.9 and goes back 2 units from z 0. Two doors hinged at the outer edges swing out
 * toward the player with `setOpen`.
 */
export function makeCupboard(): CupboardObject {
  const g = new THREE.Group() as CupboardObject;
  const cy = CB_TOP - CB_H / 2;
  const cz = -CB_D / 2;
  const t = 0.14;
  // Carcass: back, floor, top, sides. Built as panels so the inside is a real cavity.
  g.add(
    panel(CB_W, CB_H, t, 0, cy, -CB_D + t / 2, "#5c3a22", false),
    panel(CB_W, t, CB_D, 0, CB_TOP - CB_H + t / 2, cz, CB_WOOD),
    panel(CB_W, t, CB_D, 0, CB_TOP - t / 2, cz, CB_WOOD),
    panel(t, CB_H, CB_D, -CB_W / 2 + t / 2, cy, cz, CB_WOOD),
    panel(t, CB_H, CB_D, CB_W / 2 - t / 2, cy, cz, CB_WOOD),
    // Shelf and the inner back wall shading.
    panel(CB_W - 2 * t, 0.1, CB_D - t - 0.2, 0, CB_TOP - CB_H * 0.5, cz - 0.05, "#a06a40"),
    panel(CB_W - 2 * t, CB_H - 2 * t, 0.02, 0, cy, -CB_D + t + 0.02, "#3a2314", false),
  );
  const shelfY = CB_TOP - CB_H * 0.5 + 0.05;
  const floorY = CB_TOP - CB_H + t;
  const shelves: THREE.Vector3[] = [];
  for (const y of [shelfY, floorY]) for (const x of [-1.65, 0, 1.65]) shelves.push(new THREE.Vector3(x, y, cz + 0.1));

  // Doors on pivots at the outer edges.
  const doorW = CB_W / 2 - 0.05;
  const pivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set((side * CB_W) / 2, 0, 0.05);
    const door = panel(doorW, CB_H - 0.1, 0.1, (-side * doorW) / 2 - side * 0.02, cy, 0, CB_DOOR);
    const inset = panel(doorW - 0.5, CB_H - 0.7, 0.03, (-side * doorW) / 2 - side * 0.02, cy, 0.06, "#b57a46", false);
    const handle = mesh(CB_HANDLE, "#e2b654", { ink: 1.15 });
    handle.position.set(-side * (doorW - 0.3), cy + 0.05, 0.14);
    const knobA = mesh(CB_KNOB, "#e2b654", { ink: false });
    knobA.position.set(-side * (doorW - 0.3), cy + 0.25, 0.1);
    const knobB = knobA.clone();
    knobB.position.y = cy - 0.15;
    pivot.add(door, inset, handle, knobA, knobB);
    pivots.push(pivot);
    g.add(pivot);
  }
  g.userData = {
    shelves,
    setOpen: (open) => {
      const a = Math.max(0, Math.min(1, open)) * 1.85;
      pivots[0].rotation.y = -a;
      pivots[1].rotation.y = a;
    },
  };
  g.userData.setOpen(0);
  return g;
}

