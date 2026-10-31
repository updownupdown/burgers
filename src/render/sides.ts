import * as THREE from "three";
import type { FriesSize } from "../game/types";
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
const tmp = new THREE.Color();

export interface FriesObject extends THREE.Group {
  userData: {
    setCook: (t: number) => void;
    /** Extra scale callers multiply in; sizes are built into the boats, so this is always 1. */
    sizeScale: number;
    /** Piles made with `makeFryPile(…, own)`: show this share (0..1) of the sticks. */
    setAmount?: (a: number) => void;
  };
}

/** Boat length factor per size. */
const BOAT_K: Record<FriesSize, number> = { S: 0.78, M: 0.89, L: 1 };
/** Boat half-length (x), half-width (z), height and wall, in carton units, for a size. */
export function boatSize(size: FriesSize): { w: number; d: number; h: number } {
  const k = BOAT_K[size];
  return { w: 0.38 * k, d: 0.24 * (0.85 + k * 0.15), h: 0.17 };
}
/** Width and height of each size against the large boat (kept for older callers). */
export const CARTON_SIZE: Record<FriesSize, [number, number]> = { S: [BOAT_K.S, 1], M: [BOAT_K.M, 1], L: [1, 1] };
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
const FRY_VERTS = FRY_STICK.attributes.position.count;

/** `n` of a boat's fries lying in it, bottom layer first, so part-filled boats sit lower. */
const BOAT_FRIES = new Map<string, Baked>();
function boatFries(size: FriesSize, n: number): Baked {
  const key = `${size}${n}`;
  let b = BOAT_FRIES.get(key);
  if (b) return b;
  const { w, d } = boatSize(size);
  const pw = (w - 0.06) * 1.8;
  const pd = (d - 0.05) * 1.7;
  const total = FRY_COUNT[size];
  const r = rng(41 + size.charCodeAt(0));
  const parts = new Parts();
  for (let i = 0; i < n; i++) {
    const l = Math.floor((i / total) * 3);
    const k = 1 - (l / 3) * 0.5;
    parts.add(FRY_STICK, "#ffffff", {
      p: [(r() - 0.5) * pw * 0.86 * k, 0.045 + l * 0.06 + r() * 0.025, (r() - 0.5) * pd * 0.86 * k],
      r: [(r() - 0.5) * 0.3, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.3],
      s: [1, 0.35 + r() * 0.2, 1],
      ink: 0.009,
    });
  }
  b = bakeShared(parts);
  BOAT_FRIES.set(key, b);
  return b;
}

/** A loose handful of fries lying across each other (from the freezer or a basket), carton units. */
const HANDFULS = new Map<number, Baked>();
function handful(n: number): Baked {
  let b = HANDFULS.get(n);
  if (b) return b;
  const r = rng(31);
  const parts = new Parts();
  // A bigger handful spreads wider as well as heaping higher.
  const spread = Math.sqrt(Math.max(1, n) / FRIES_PER_SCOOP);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / n);
    parts.add(FRY_STICK, "#ffffff", {
      p: [Math.cos(a) * rr * 0.24 * spread, 0.06 + (1 - rr) * 0.16 * spread + (i % 3) * 0.03, Math.sin(a) * rr * 0.18 * spread],
      r: [(r() - 0.5) * 0.4, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.5],
      s: [1, 0.4 + r() * 0.2, 1],
      ink: 0.011,
    });
  }
  b = bakeShared(parts);
  HANDFULS.set(n, b);
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
  g.userData = { sizeScale: 1, setCook: (t) => void mat.color.copy(friesRamp(t, tmp)) };
  return g;
}

/**
 * Fries in a paper boat of `size`, or a loose handful without one. `fill` (0..1) shows part of
 * a boat's fries, or part of a basket's handful. Bottom at y = 0, carton units.
 */
export function makeFries(withCarton: boolean, size: FriesSize = "L", fill = 1, top?: { salt?: number; curds?: boolean; gravy?: boolean }): FriesObject {
  const f = Math.min(1, Math.max(0, fill));
  if (!withCarton) {
    // A loose handful: `fill` is the share of a full basket (three scoops).
    const n = Math.round(FRIES_PER_SCOOP * 3 * f);
    return friesGroup(n ? handful(n) : null);
  }
  const n = Math.round(FRY_COUNT[size] * f);
  const g = friesGroup(n ? boatFries(size, n) : null);
  g.add(makeCarton(size));
  if (n && top) {
    const { w, d } = boatSize(size);
    const t = friesToppings((w - 0.06) * 0.8, (d - 0.05) * 0.8, FRIES_TOP - (1 - f) * 0.1, top.salt ?? 0, !!top.curds, !!top.gravy);
    if (t) g.add(t);
  }
  return g;
}

/**
 * Fries lying in a layered mound about `w` × `d` game units (a fryer basket, the freezer),
 * bottom layer first. With `own`, the geometry belongs to this object and `setAmount` hides
 * the top layers; otherwise it's cached and shared by seed.
 */
const PILES = new Map<string, Baked>();
export function makeFryPile(w: number, d: number, layers: number, seed: number, own = false): FriesObject {
  const key = `${w}|${d}|${layers}|${seed}`;
  let baked = own ? null : PILES.get(key) ?? null;
  const parts = new Parts();
  if (!baked) {
    const r = rng(seed);
    const per = Math.max(3, Math.round((w * d) / 0.05));
    for (let l = 0; l < layers; l++) {
      // Upper layers cover less ground, so the pile mounds up in the middle.
      const k = 1 - (l / Math.max(1, layers)) * 0.5;
      for (let i = 0; i < per * k; i++) {
        parts.add(FRY_STICK, "#ffffff", {
          p: [(r() - 0.5) * w * 0.86 * k, 0.045 + l * 0.07 + r() * 0.025, (r() - 0.5) * d * 0.86 * k],
          r: [(r() - 0.5) * 0.3, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.3],
          s: [1.25, 0.5 + r() * 0.25, 1.25],
          ink: 0.009,
        });
      }
    }
    baked = own ? parts.bake() : bakeShared(parts);
    if (!own) PILES.set(key, baked);
  }
  const g = friesGroup(baked);
  if (own) {
    const b = baked;
    const total = parts.count;
    g.userData.setAmount = (a) => {
      const count = Math.ceil(total * Math.min(1, Math.max(0, a))) * FRY_VERTS;
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
  const r = rng(seed);
  const parts = new Parts();
  const total = FRIES_PER_SCOOP * 3;
  for (let i = 0; i < total; i++) {
    const a = i * 2.39996 + r() * 0.3;
    const rr = Math.sqrt((i + 0.5) / total);
    parts.add(FRY_STICK, "#ffffff", {
      p: [Math.cos(a) * rr * w * 0.36, 0.05 + (1 - rr) * 0.22 + r() * 0.05, Math.sin(a) * rr * d * 0.36],
      r: [(r() - 0.5) * 0.4, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.4],
      s: [1.25, 0.5 + r() * 0.25, 1.25],
      ink: 0.009,
    });
  }
  const baked = parts.bake();
  const g = friesGroup(baked);
  g.userData.setAmount = (amt) => {
    const count = Math.round(total * Math.min(1, Math.max(0, amt))) * FRY_VERTS;
    baked.geo.setDrawRange(0, count);
    baked.hull?.setDrawRange(0, count);
  };
  return g;
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
export function friesToppings(rx: number, rz: number, top: number, saltLevel: number, curds: boolean, gravy: boolean): THREE.Mesh | null {
  // Grains in steps of five, so a carton being shaken reuses a few baked meshes.
  const grains = Math.min(60, Math.round((saltLevel * 50) / 5) * 5);
  const salt = grains > 0;
  if (!salt && !curds && !gravy) return null;
  const key = `${rx.toFixed(2)}|${rz.toFixed(2)}|${top.toFixed(2)}|${grains}${+curds}${+gravy}`;
  let b = TOPPED.get(key);
  if (!b) {
    const p = new Parts();
    const r = rng(17);
    if (gravy) {
      p.add(new THREE.SphereGeometry(1, 14, 7), GRAVY, { p: [0, top - 0.02, 0], s: [rx * 1.15, 0.08, rz * 1.25], ink: 0.012 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        p.add(new THREE.SphereGeometry(1, 8, 5), GRAVY, { p: [Math.cos(a) * rx * 0.85, top - 0.08, Math.sin(a) * rz * 0.85], s: [0.05, 0.1, 0.05], ink: false });
      }
    }
    if (curds) curdLumps(p, 9, rx * 0.9, rz * 1.1, top + 0.02, 23, 0.75);
    if (salt) {
      const grain = new THREE.BoxGeometry(0.018, 0.018, 0.018);
      for (let i = 0; i < grains; i++) p.add(grain, "#ffffff", { p: [(r() - 0.5) * rx * 1.7, top + 0.03 + r() * 0.05, (r() - 0.5) * rz * 1.7], ink: false });
    }
    b = bakeShared(p);
    TOPPED.set(key, b);
  }
  return bakedMesh(b);
}
