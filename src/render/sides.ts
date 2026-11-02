import * as THREE from "three";
import type { FriesSize, FryKind } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, grade, ramp, shareGeometry, toon } from "./materials";

/*
 * Fries and their paper boats (the study's "Paper boat" pick): a low open boat with a blue band
 * and a red-and-white checked liner peeking over each end, crinkle-cut fries piled in it. Sizes
 * differ in length. Built in carton units (1 = 15 cm real); draw them at SCALE.fries.
 */

const friesRamp = ramp([
  [0, "#f6efc9"],
  [0.45, "#f3d36b"],
  [0.7, "#e9b23a"],
  [1.0, "#b36a1e"],
  [1.3, "#3e2510"],
]);
/** Sweet potato fries: deep orange raw, caramel when done, dark fast after. */
const sweetRamp = ramp([
  [0, "#f2a35a"],
  [0.5, "#e8822e"],
  [0.7, "#c9631e"],
  [0.9, "#8a3e14"],
  [1.15, "#3a1c0c"],
]);
/** Tortilla chips: pale corn raw, golden when done, brown after. */
const chipsRamp = ramp([
  [0, "#f2e2a2"],
  [0.5, "#efc95a"],
  [0.68, "#e6b03c"],
  [0.9, "#b8782a"],
  [1.2, "#4a2c12"],
]);
/** Churros: pale dough raw, deep golden brown done, dark after. */
const churrosRamp = ramp([
  [0, "#f3dfb0"],
  [0.5, "#dca052"],
  [0.7, "#c9843a"],
  [0.95, "#8a4e1c"],
  [1.25, "#3a200c"],
]);
/** Zucchini fritti: a pale batter coat, golden when done, brown after. (Unbattered sticks are drawn green: see RAW_ZUCCHINI.) */
const zucchiniRamp = ramp([
  [0, "#f4ead0"],
  [0.5, "#ecd283"],
  [0.7, "#e2b75a"],
  [0.95, "#a8702e"],
  [1.2, "#3e2412"],
]);
/** Apple fritters: pale dough, deep gold done, dark after. */
const frittersRamp = ramp([
  [0, "#f2e0b4"],
  [0.5, "#e2aa58"],
  [0.7, "#cf8c3a"],
  [0.95, "#8f5220"],
  [1.25, "#3a200c"],
]);
const RAMPS: Record<FryKind, ReturnType<typeof ramp>> = { fries: friesRamp, sweet: sweetRamp, chips: chipsRamp, churros: churrosRamp, zucchini: zucchiniRamp, fritters: frittersRamp };
/** A cook below zero means zucchini sticks still waiting for their batter: plain green. */
const RAW_ZUCCHINI = "#7caf4e";
const fryColor = (fry: FryKind, t: number, out: THREE.Color) => (t < 0 ? out.set(RAW_ZUCCHINI) : RAMPS[fry](t, out));
const tmp = new THREE.Color();

export interface FriesObject extends THREE.Group {
  userData: {
    setCook: (t: number) => void;
    /** Extra scale callers multiply in; sizes are built into the boats, so this is always 1. */
    sizeScale: number;
    /** Piles made with `makeFryPile(…, own)`: show this share (0..1) of the sticks. */
    setAmount?: (a: number) => void;
    /** What's frying: plain or sweet potato fries, tortilla chips or churros (their colours, and their shapes where the object has them). */
    setFry: (fry: FryKind) => void;
  };
}

/** Boat length factor per size. */
// After build #78: 0.8 / 1 / 1.25, and the sizes differ in width and height too (they read the same at the fryer camera).
const BOAT_K: Record<FriesSize, number> = { S: 0.8, M: 1, L: 1.25 };
/** Boat half-length (x), half-width (z), height and wall, in carton units, for a size. */
export function boatSize(size: FriesSize): { w: number; d: number; h: number } {
  const k = BOAT_K[size];
  return { w: 0.33 * k, d: 0.24 * (0.55 + k * 0.45), h: 0.17 * (0.65 + k * 0.35) };
}
/** Width and height of each size against the large boat (kept for older callers). */
export const CARTON_SIZE: Record<FriesSize, [number, number]> = { S: [BOAT_K.S / BOAT_K.L, 1], M: [BOAT_K.M / BOAT_K.L, 1], L: [1, 1] };
/** Height each nested boat adds to a stack, in carton units. */
export const CARTON_NEST = 0.04;
const WALL = 0.018;
const FLOOR = 0.02;
/**
 * Sticks per scoop. A scoop from the freezer, a third of a basket and a small boat all show the
 * same number of fries, so the amount in hand, in the basket and in the boat match up.
 */
export const FRIES_PER_SCOOP = 17;
/** Sticks in a full boat: one, two or three scoops. */
const FRY_COUNT: Record<FriesSize, number> = { S: FRIES_PER_SCOOP, M: FRIES_PER_SCOOP * 2, L: FRIES_PER_SCOOP * 3 };
/** Where the top of a full boat's fries sits, for toppings. */
const FRIES_TOP = 0.22;

/** Rounded-rectangle ring (a squircle), `w` and `d` half-extents. */
function ring(n: number, w: number, d: number, inset: number, y: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push(new THREE.Vector3(Math.sign(c) * Math.abs(c) ** 0.4 * (w - inset), y, Math.sign(s) * Math.abs(s) ** 0.4 * (d - inset)));
  }
  return pts;
}

/** A thin-walled open boat, vertex coloured, bottom at y = 0. */
function boatShell(size: FriesSize): THREE.BufferGeometry {
  const { w, d, h } = boatSize(size);
  const N = 28;
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  const at = (f: number, inset: number, y: number) => ring(N, lerp(w * 0.8, w, f), lerp(d * 0.75, d, f), inset, y);
  const bands = [0, 0.6, 0.75, 1];
  const outer = bands.map((f) => at(f, 0, f * h));
  const bandCol = ["#f4ecd8", "#3f78c8", "#f4ecd8"].map((c) => grade(c));
  const innerTop = at(1, WALL, h);
  const innerBot = at(0, WALL, FLOOR);
  const rim = grade("#ffffff");
  const inside = grade("#f7f1e2");
  const floorCol = grade("#efe3c8");
  const pos: number[] = [];
  const col: number[] = [];
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, want: THREE.Vector3, c: THREE.Color) => {
    n.crossVectors(e1.subVectors(q, p), e2.subVectors(r, p));
    for (const v of n.dot(want) >= 0 ? [p, q, r] : [p, r, q]) {
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
  };
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3, want: THREE.Vector3, c: THREE.Color) => {
    tri(p, q, r, want, c);
    tri(p, r, s, want, c);
  };
  const out = new THREE.Vector3();
  const inward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const floorMid = new THREE.Vector3(0, FLOOR, 0);
  const bottomMid = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    out.set(outer[0][i].x + outer[0][j].x, 0, outer[0][i].z + outer[0][j].z).normalize();
    inward.copy(out).negate();
    for (let k = 0; k < bands.length - 1; k++) quad(outer[k][i], outer[k][j], outer[k + 1][j], outer[k + 1][i], out, bandCol[k]);
    quad(outer[bands.length - 1][i], outer[bands.length - 1][j], innerTop[j], innerTop[i], up, rim);
    quad(innerTop[i], innerTop[j], innerBot[j], innerBot[i], inward, inside);
    tri(floorMid, innerBot[i], innerBot[j], up, floorCol);
    tri(bottomMid, outer[0][i], outer[0][j], down, bandCol[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const CHECK = shareGeometry(faceted(new THREE.BoxGeometry(1, 1, 1)));

/** The checked paper liner sticking up over each end of the boat, tipped outward. */
function liner(p: Parts, size: FriesSize, y0: number): void {
  const { w, d, h } = boatSize(size);
  const cols = 6;
  const rows = 2;
  const cw = (d * 1.5) / cols;
  const ch = 0.07;
  for (const s of [-1, 1]) {
    const lean = 0.45 * s;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const z = (i - (cols - 1) / 2) * cw;
        const up = h - 0.03 + (j + 0.5) * ch;
        const x = s * (w - 0.05) + Math.sin(lean) * (j + 0.5) * ch;
        p.add(CHECK, (i + j) % 2 ? "#e6553f" : "#fbf4e6", { p: [x, y0 + up, z], r: [0, 0, -lean], s: [0.012, ch, cw], ink: i === 0 || i === cols - 1 ? 0.008 : false });
      }
    }
  }
}

const SHELLS: Partial<Record<FriesSize, THREE.BufferGeometry>> = {};
const shell = (size: FriesSize) => (SHELLS[size] ??= shareGeometry(boatShell(size)));
const BOATS = new Map<string, Baked>();

/** `count` boats nested into each other, baked into one mesh (count 1 is a single boat). */
function boatBaked(size: FriesSize, count: number): Baked {
  const key = `${size}${count}`;
  let b = BOATS.get(key);
  if (!b) {
    const parts = new Parts();
    for (let i = 0; i < count; i++) parts.add(shell(size), null, { p: [0, i * CARTON_NEST, 0], ink: 0.014 });
    liner(parts, size, (count - 1) * CARTON_NEST);
    b = bakeShared(parts);
    BOATS.set(key, b);
  }
  return b;
}

/** An empty paper boat, for stacks and the packing pads. Bottom at y = 0, in carton units. */
export function makeCarton(size: FriesSize): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(boatBaked(size, 1)));
  return g;
}

/** A stack of `count` empty boats nested into each other, as one mesh. */
export function makeCartonStack(size: FriesSize, count: number): THREE.Group {
  const g = new THREE.Group();
  if (count > 0) g.add(bakedMesh(boatBaked(size, count)));
  return g;
}

/**
 * A crinkle-cut stick, 1 long: the sides zigzag between rows so the cut shows in outline.
 * Vertex colours are white; the fries material carries the cook colour.
 */
const FRY_STICK = (() => {
  const g = new THREE.BoxGeometry(0.06, 1, 0.05, 1, 8, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const row = Math.round((p.getY(i) + 0.5) * 8);
    p.setX(i, p.getX(i) * (row % 2 ? 1.35 : 0.8));
  }
  return shareGeometry(faceted(g));
})();
/**
 * A tortilla chip lying the way a stick does once placed (see FRY_STICK): a thin wedge whose
 * length runs along the stick's axis, so the same placement code piles chips.
 */
const CHIP = (() => {
  const sh = new THREE.Shape([new THREE.Vector2(-0.16, -0.32), new THREE.Vector2(0.16, -0.32), new THREE.Vector2(0.02, 0.34)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false });
  g.translate(0, 0, -0.011);
  g.rotateY(Math.PI / 2);
  // A little curl, so a pile of chips doesn't read as flat paper.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.05 * p.getZ(i) ** 2 * 8);
  return shareGeometry(faceted(g));
})();
/** A churro: a ridged star-section stick, thicker than a fry. */
const CHURRO = (() => {
  const g = new THREE.CylinderGeometry(0.055, 0.055, 1, 12, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = Math.round(((a + Math.PI) / (Math.PI * 2)) * 12) % 2 ? 1.15 : 0.72;
    if (Math.hypot(x, z) > 0.01) {
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  return shareGeometry(faceted(g));
})();
/** A battered zucchini stick: a round, knobbly stick a little thicker than a fry. */
const ZUCCHINI = (() => {
  const g = new THREE.CylinderGeometry(0.06, 0.06, 1, 7, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(p.getY(i) * 23 + Math.atan2(z, x) * 3);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  return shareGeometry(faceted(g));
})();
/** An apple fritter: a lumpy round of dough (the stick's length is its height, so it's laid as a squat ball). */
const FRITTER = (() => {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(7 * x + 5 * z) + 0.1 * Math.sin(9 * y - 4 * x);
    p.setXYZ(i, x * k * 0.36, y * k, z * k * 0.36);
  }
  return shareGeometry(faceted(g));
})();
const STICK: Record<FryKind, THREE.BufferGeometry> = { fries: FRY_STICK, sweet: FRY_STICK, chips: CHIP, churros: CHURRO, zucchini: ZUCCHINI, fritters: FRITTER };
/** Stick shape and how many to draw per fry, by kind: chips are a few more, churros fewer and longer, fritters fewer and round. */
const stickOf = (fry: FryKind) => STICK[fry];
const COUNT_K: Record<FryKind, number> = { fries: 1, sweet: 1, chips: 1.1, churros: 0.4, zucchini: 0.6, fritters: 0.32 };
const LEN_K: Record<FryKind, number> = { fries: 1, sweet: 1, chips: 1, churros: 1.25, zucchini: 1.05, fritters: 0.75 };
const shaped = (fry: FryKind) => fry === "chips" || fry === "churros" || fry === "zucchini" || fry === "fritters";

/** `n` of a boat's fries lying in it, bottom layer first, so part-filled boats sit lower. */
const BOAT_FRIES = new Map<string, Baked>();
function boatFries(size: FriesSize, n: number, fry: FryKind = "fries"): Baked {
  const key = `${size}${n}${shaped(fry) ? fry : ""}`;
  let b = BOAT_FRIES.get(key);
  if (b) return b;
  const { w, d } = boatSize(size);
  const pw = (w - 0.06) * 1.8;
  const pd = (d - 0.05) * 1.7;
  const total = FRY_COUNT[size];
  const r = rng(41 + size.charCodeAt(0));
  const parts = new Parts();
  const m = Math.max(n ? 1 : 0, Math.round(n * COUNT_K[fry]));
  const tot = Math.max(1, Math.round(total * COUNT_K[fry]));
  for (let i = 0; i < m; i++) {
    const l = Math.floor((i / tot) * 3);
    const k = 1 - (l / 3) * 0.5;
    const chip = fry === "chips";
    parts.add(stickOf(fry), "#ffffff", {
      p: [(r() - 0.5) * pw * 0.86 * k, 0.045 + l * 0.06 + r() * 0.025, (r() - 0.5) * pd * 0.86 * k],
      r: [(r() - 0.5) * (chip ? 1.2 : 0.3), r() * Math.PI, Math.PI / 2 + (r() - 0.5) * (chip ? 0.9 : 0.3)],
      s: [1, (0.35 + r() * 0.2) * LEN_K[fry], 1],
      ink: 0.009,
    });
  }
  b = bakeShared(parts);
  BOAT_FRIES.set(key, b);
  return b;
}

/** A loose handful of fries lying across each other (from the freezer or a basket), carton units. */
const HANDFULS = new Map<string, Baked>();
function handful(n0: number, fry: FryKind = "fries"): Baked {
  const key = `${n0}${shaped(fry) ? fry : ""}`;
  let b = HANDFULS.get(key);
  const n = Math.max(1, Math.round(n0 * COUNT_K[fry]));
  if (b) return b;
  const r = rng(31);
  const parts = new Parts();
  // A bigger handful spreads wider as well as heaping higher.
  const spread = Math.sqrt(Math.max(1, n0) / FRIES_PER_SCOOP);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / n);
    parts.add(stickOf(fry), "#ffffff", {
      p: [Math.cos(a) * rr * 0.24 * spread, 0.06 + (1 - rr) * 0.16 * spread + (i % 3) * 0.03, Math.sin(a) * rr * 0.18 * spread],
      r: [(r() - 0.5) * (fry === "chips" ? 1.2 : 0.4), r() * Math.PI, Math.PI / 2 + (r() - 0.5) * (fry === "chips" ? 1 : 0.5)],
      s: [1, (0.4 + r() * 0.2) * LEN_K[fry], 1],
      ink: 0.011,
    });
  }
  b = bakeShared(parts);
  HANDFULS.set(key, b);
  return b;
}

function friesGroup(baked: Baked | null): FriesObject {
  const g = new THREE.Group() as FriesObject;
  const mat = toon("#f6efc9", { unique: true });
  if (baked) {
    const m = bakedMesh(baked, { material: mat });
    // Thin sticks only cast shadows: receiving them just speckles the faces.
    m.receiveShadow = false;
    g.add(m);
  }
  let fry: FryKind = "fries";
  let last = 0;
  g.userData = {
    sizeScale: 1,
    setCook: (t) => {
      last = t;
      mat.color.copy(fryColor(fry, t, tmp));
    },
    setFry: (f) => {
      fry = f;
      g.userData.setCook(last);
    },
  };
  return g;
}

/**
 * Fries in a paper boat of `size`, or a loose handful without one. `fill` (0..1) shows part of
 * a boat's fries, or part of a basket's handful. Bottom at y = 0, carton units.
 */
export function makeFries(withCarton: boolean, size: FriesSize = "L", fill = 1, top?: { salt?: number; curds?: boolean; gravy?: boolean; fry?: FryKind }): FriesObject {
  const f = Math.min(1, Math.max(0, fill));
  const fry = top?.fry ?? "fries";
  if (!withCarton) {
    // A loose handful: `fill` is the share of a full basket (three scoops).
    const n = Math.round(FRIES_PER_SCOOP * 3 * f);
    const h = friesGroup(n ? handful(n, fry) : null);
    h.userData.setFry(fry);
    return h;
  }
  const n = Math.round(FRY_COUNT[size] * f);
  const g = friesGroup(n ? boatFries(size, n, fry) : null);
  g.userData.setFry(fry);
  g.add(makeCarton(size));
  if (n && top) {
    const { w, d } = boatSize(size);
    const t = friesToppings((w - 0.06) * 0.8, (d - 0.05) * 0.8, FRIES_TOP - (1 - f) * 0.1, top.salt ?? 0, !!top.curds, !!top.gravy, fry);
    if (t) g.add(t);
  }
  // Chips come with a little cup of salsa tucked in at one end (not on nachos: they're covered).
  if (fry === "chips" && n && !top?.curds && !top?.gravy) {
    const { w } = boatSize(size);
    const cup = bakedMesh(salsaCup());
    cup.position.set(w * 0.62, FRIES_TOP - 0.04, 0);
    g.add(cup);
  }
  return g;
}

/**
 * Fries lying in a layered mound about `w` × `d` game units (a fryer basket, the freezer),
 * bottom layer first. With `own`, the geometry belongs to this object and `setAmount` hides
 * the top layers; otherwise it's cached and shared by seed.
 */
const PILES = new Map<string, Baked>();
export function makeFryPile(w: number, d: number, layers: number, seed: number, own = false, fry: FryKind = "fries"): FriesObject {
  const key = `${w}|${d}|${layers}|${seed}|${fry}`;
  let baked = own ? null : PILES.get(key) ?? null;
  const parts = new Parts();
  if (!baked) {
    const r = rng(seed);
    const per = Math.max(3, Math.round(((w * d) / 0.05) * COUNT_K[fry]));
    for (let l = 0; l < layers; l++) {
      // Upper layers cover less ground, so the pile mounds up in the middle.
      const k = 1 - (l / Math.max(1, layers)) * 0.5;
      for (let i = 0; i < per * k; i++) {
        parts.add(stickOf(fry), "#ffffff", {
          p: [(r() - 0.5) * w * 0.86 * k, 0.045 + l * 0.07 + r() * 0.025, (r() - 0.5) * d * 0.86 * k],
          r: [(r() - 0.5) * (fry === "chips" ? 1.2 : 0.3), r() * Math.PI, Math.PI / 2 + (r() - 0.5) * (fry === "chips" ? 1 : 0.3)],
          s: [1.25, (0.5 + r() * 0.25) * LEN_K[fry], 1.25],
          ink: 0.009,
        });
      }
    }
    baked = own ? parts.bake() : bakeShared(parts);
    if (!own) PILES.set(key, baked);
  }
  const g = friesGroup(baked);
  g.userData.setFry(fry);
  if (own) {
    const b = baked;
    const total = parts.count;
    const verts = stickOf(fry).attributes.position.count;
    g.userData.setAmount = (a) => {
      const count = Math.ceil(total * Math.min(1, Math.max(0, a))) * verts;
      b.geo.setDrawRange(0, count);
      b.hull?.setDrawRange(0, count);
    };
  }
  return g;
}

/**
 * Fries in a fryer basket, `w` × `d` game units: a full basket is three scoops of sticks. They
 * heap from the middle out, so `setAmount(a)` shows a third of a basket as a small mound in the
 * middle rather than a thin layer over the whole floor. Each basket owns its geometry.
 */
export function makeBasketFries(w: number, d: number, seed: number): FriesObject {
  const g = new THREE.Group() as FriesObject;
  const mat = toon("#f6efc9", { unique: true });
  const shapes = new Map<THREE.BufferGeometry, { mesh: THREE.Mesh; baked: Baked; total: number; verts: number }>();
  const build = (fry: FryKind) => {
    const geo = stickOf(fry);
    let e = shapes.get(geo);
    if (e) return e;
    const r = rng(seed);
    const parts = new Parts();
    const total = Math.max(3, Math.round(FRIES_PER_SCOOP * 3 * COUNT_K[fry]));
    for (let i = 0; i < total; i++) {
      const a = i * 2.39996 + r() * 0.3;
      const rr = Math.sqrt((i + 0.5) / total);
      parts.add(geo, "#ffffff", {
        p: [Math.cos(a) * rr * w * 0.36, 0.05 + (1 - rr) * 0.22 + r() * 0.05, Math.sin(a) * rr * d * 0.36],
        r: [(r() - 0.5) * (fry === "chips" ? 1.2 : 0.4), r() * Math.PI, Math.PI / 2 + (r() - 0.5) * (fry === "chips" ? 1 : 0.4)],
        s: [1.25, (0.5 + r() * 0.25) * LEN_K[fry], 1.25],
        ink: 0.009,
      });
    }
    const baked = parts.bake();
    const m = bakedMesh(baked, { material: mat });
    m.receiveShadow = false;
    g.add(m);
    e = { mesh: m, baked, total, verts: geo.attributes.position.count };
    shapes.set(geo, e);
    return e;
  };
  let fry: FryKind = "fries";
  let cur = build(fry);
  let last = 0;
  let amount = 1;
  const apply = () => {
    const count = Math.round(cur.total * Math.min(1, Math.max(0, amount))) * cur.verts;
    cur.baked.geo.setDrawRange(0, count);
    cur.baked.hull?.setDrawRange(0, count);
  };
  g.userData = {
    sizeScale: 1,
    setCook: (t) => {
      last = t;
      mat.color.copy(fryColor(fry, t, tmp));
    },
    setFry: (f) => {
      if (f === fry) return;
      fry = f;
      cur = build(f);
      for (const e of shapes.values()) e.mesh.visible = e === cur;
      apply();
      g.userData.setCook(last);
    },
    setAmount: (a) => {
      amount = a;
      apply();
    },
  };
  return g;
}

/** A little paper cup of red salsa, carton units, bottom at y = 0. */
let SALSA_CUP: Baked | null = null;
function salsaCup(): Baked {
  if (!SALSA_CUP) {
    const p = new Parts();
    p.add(faceted(new THREE.CylinderGeometry(0.075, 0.06, 0.07, 12)), "#f7f3ea", { p: [0, 0.035, 0], ink: 0.009 });
    p.add(faceted(new THREE.CylinderGeometry(0.066, 0.066, 0.012, 12)), "#c8321f", { p: [0, 0.064, 0], ink: false });
    p.add(faceted(new THREE.IcosahedronGeometry(0.012, 0)), "#f2e8d2", { p: [0.02, 0.072, 0.01], ink: false });
    p.add(faceted(new THREE.IcosahedronGeometry(0.012, 0)), "#4f8f2e", { p: [-0.025, 0.072, -0.012], ink: false });
    SALSA_CUP = bakeShared(p);
  }
  return SALSA_CUP;
}

/** Cheese curds: squeaky off-white lumps. */
export const CURD = "#f5edcf";
export const GRAVY = "#6e4020";
const lump = shareGeometry(faceted(new THREE.IcosahedronGeometry(0.07, 0)));

export function curdLumps(p: Parts, n: number, rx: number, rz: number, y: number, seed: number, s = 1): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / n);
    p.add(lump, CURD, {
      p: [Math.cos(a) * rr * rx, y + r() * 0.05 * s, Math.sin(a) * rr * rz],
      r: [r() * 3, r() * 3, r() * 3],
      s: [s * (0.9 + r() * 0.5), s * (0.7 + r() * 0.4), s * (0.9 + r() * 0.4)],
      ink: 0.01,
    });
  }
}

/**
 * Toppings on fries: a sprinkle of salt (more grains the more it's been shaken), curds and a pour
 * of gravy, in carton units around the top of the fries at height `top` (half-width `rx`, half-depth `rz`).
 */
const TOPPED = new Map<string, Baked>();
export const QUESO = "#f2b632";
export const NACHO_JALAPENO = "#3f8f3a";
const jalRing = shareGeometry(faceted(new THREE.TorusGeometry(0.035, 0.012, 4, 9).rotateX(Math.PI / 2)));
export function friesToppings(rx: number, rz: number, top: number, saltLevel: number, curds: boolean, gravy: boolean, fry: FryKind = "fries"): THREE.Mesh | null {
  // Nachos: queso where the gravy goes, jalapeño rings where the curds go; churros get sugar for salt.
  const nachos = fry === "chips";
  // Grains in steps of five, so a carton being shaken reuses a few baked meshes.
  const grains = Math.min(60, Math.round((saltLevel * 50) / 5) * 5);
  const salt = grains > 0;
  if (!salt && !curds && !gravy) return null;
  const key = `${rx.toFixed(2)}|${rz.toFixed(2)}|${top.toFixed(2)}|${grains}${+curds}${+gravy}${fry}`;
  let b = TOPPED.get(key);
  if (!b) {
    const p = new Parts();
    const r = rng(17);
    const sauce = nachos ? QUESO : GRAVY;
    if (gravy) {
      p.add(new THREE.SphereGeometry(1, 14, 7), sauce, { p: [0, top - 0.02, 0], s: [rx * (nachos ? 0.95 : 1.15), 0.08, rz * (nachos ? 1.05 : 1.25)], ink: 0.012 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        p.add(new THREE.SphereGeometry(1, 8, 5), sauce, { p: [Math.cos(a) * rx * 0.85, top - 0.08, Math.sin(a) * rz * 0.85], s: [0.05, 0.1, 0.05], ink: false });
      }
    }
    if (curds && nachos) {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996;
        const rr = Math.sqrt((i + 0.5) / 9);
        p.add(jalRing, NACHO_JALAPENO, { p: [Math.cos(a) * rr * rx * 0.9, top + 0.05 + r() * 0.02, Math.sin(a) * rr * rz * 1.05], r: [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5], ink: 0.008 });
      }
    } else if (curds) curdLumps(p, 9, rx * 0.9, rz * 1.1, top + 0.02, 23, 0.75);
    if (salt) {
      const grain = new THREE.BoxGeometry(0.018, 0.018, 0.018);
      for (let i = 0; i < grains; i++) p.add(grain, fry === "fritters" ? (i % 3 ? "#f6e7c8" : "#b9773a") : fry === "churros" ? "#fbf3e0" : "#ffffff", { p: [(r() - 0.5) * rx * 1.7, top + 0.03 + r() * 0.05, (r() - 0.5) * rz * 1.7], ink: false });
    }
    b = bakeShared(p);
    TOPPED.set(key, b);
  }
  return bakedMesh(b);
}
