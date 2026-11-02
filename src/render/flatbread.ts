import * as THREE from "three";
import { COOK_SCALE, isMelted } from "../game/cooking";
import { pieYawOf } from "../game/peel";
import { leopard } from "../game/scoring";
import type { Kind, Piece } from "../game/types";
import { COUNTED, LADLE_RADIUS, SAUCE_RADIUS } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { disposeObject, faceted, mesh, ramp, shareGeometry, toon } from "./materials";
import { paniniParts } from "./panini";

/*
 * Orchard Isle's flatbreads (DESIGN §24, phase 4), in ingredient units like the burger parts (a
 * bun is 2 across): an oval, hand-shaped base with a raised crust, whose two halves bake on their
 * own (the half facing the oven's fire browns twice as fast), tomato sauce spread in a spiral or a
 * drizzle of olive oil, torn mozzarella that melts, and the toppings scattered over it: mushroom
 * slices, ham, fig quarters, pear slices, blue cheese crumbles, then basil, rocket and honey after
 * the oven. A calzone is the base folded over into a puffed half moon. Leopard spots show on the
 * crust of one turned right; cuts show as lines across. One object does the peel, the oven, the
 * board and the tray: makeFlatbread(pieces), with the dough first.
 */

/** Half sizes of the oval base, ingredient units: a flatbread is a little wider than two buns. */
export const PIE = { rx: 2.0, rz: 1.5 };
/** Thickness of the base and the extra height of its crust. */
const BASE_H = 0.1;
const RIM_R = 0.13;
/** The part of the base that takes sauce and toppings, as a share of the half sizes. */
const INNER = 0.8;
/** Half sizes of the area sauce and toppings go on, ingredient units. */
export const INNER_RX = PIE.rx * INNER;
export const INNER_RZ = PIE.rz * INNER;
/** Height of a flatbread's top (where the honey goes, and the tray's sauce is painted). */
export const FLATBREAD_TOP = BASE_H + RIM_R * 1.4;
/** A calzone's height. */
const CALZONE_H = 0.62;

/** Dough: raw cream, golden and blistered (done), dark brown, then charred. */
const doughRamp = ramp([
  [0, "#f4e8ce"],
  [0.25, "#f1dcaa"],
  [0.45, "#e8bd6c"],
  [0.62, "#d99a48"],
  [0.8, "#b8742e"],
  [1.0, "#4a2c14"],
]);
const CREAM = new THREE.Color("#f6ecd6");
const tmp = new THREE.Color();

/** The base's outline from angle a0 to a1: a slightly lopsided, hand-shaped oval (shape x, y = world x, -z). */
function outline(scale = 1, a0 = 0, a1 = Math.PI * 2, seed = 1.3): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (a1 - a0);
    const k = (1 + 0.035 * Math.sin(3 * a + seed) + 0.02 * Math.sin(7 * a + seed * 2)) * scale;
    pts.push(new THREE.Vector2(Math.cos(a) * PIE.rx * k, Math.sin(a) * PIE.rz * k));
  }
  return pts;
}

/** One half of the base (shape y >= 0 is the back half, world z < 0), as a slab. */
function halfSlab(back: boolean): THREE.BufferGeometry {
  const pts = back ? outline(1, 0, Math.PI) : outline(1, Math.PI, Math.PI * 2);
  const s = new THREE.Shape(pts);
  const g = new THREE.ExtrudeGeometry(s, { depth: BASE_H, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  return faceted(g);
}
/** The raised crust along one half of the edge: a round tube, squashed a little. */
function halfRim(back: boolean): THREE.BufferGeometry {
  const pts = (back ? outline(0.97, 0, Math.PI) : outline(0.97, Math.PI, Math.PI * 2)).map((p) => new THREE.Vector3(p.x, 0, -p.y));
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, RIM_R, 7, false);
  g.scale(1, 0.75, 1);
  g.translate(0, BASE_H + RIM_R * 0.45, 0);
  return faceted(g);
}
const GEO = {
  slabA: shareGeometry(halfSlab(true)),
  slabB: shareGeometry(halfSlab(false)),
  rimA: shareGeometry(halfRim(true)),
  rimB: shareGeometry(halfRim(false)),
  /** A calzone: a puffed dome over each half of a half moon (left, x < 0, and right), its straight crease along the back. */
  calA: shareGeometry(faceted(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI / 2, 0, Math.PI / 2))),
  calB: shareGeometry(faceted(new THREE.SphereGeometry(1, 14, 7, Math.PI / 2, Math.PI / 2, 0, Math.PI / 2))),
  disc: shareGeometry(faceted(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2))),
  blob: shareGeometry(faceted(new THREE.SphereGeometry(1, 9, 6))),
  crumb: shareGeometry(faceted(new THREE.IcosahedronGeometry(0.09, 0))),
  spot: shareGeometry(faceted(new THREE.CircleGeometry(0.07, 6).rotateX(-Math.PI / 2))),
};

/* ---- toppings ------------------------------------------------------------------- */

/** Mushroom slice: a cap and stem in profile, lying flat. */
export function mushroomParts(roasted: boolean): Parts {
  const p = new Parts();
  const cap = new THREE.Shape();
  cap.absarc(0, 0, 0.2, 0, Math.PI, false);
  cap.lineTo(-0.2, 0);
  const capG = new THREE.ExtrudeGeometry(cap, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
  capG.rotateX(-Math.PI / 2);
  p.add(faceted(capG), roasted ? "#a0764c" : "#d8c09a", { p: [0, 0, 0.02], ink: 0.016 });
  p.add(faceted(new THREE.BoxGeometry(0.1, 0.04, 0.18)), roasted ? "#c49a6a" : "#eadcc0", { p: [0, 0.02, 0.1], ink: 0.016 });
  p.add(faceted(new THREE.BoxGeometry(0.36, 0.01, 0.03)), roasted ? "#6a4a2c" : "#9a7a58", { p: [0, 0.045, -0.06], ink: false });
  return p;
}
/** A folded ribbon of ham. */
export function hamParts(seed: number): Parts {
  const p = new Parts();
  const r = rng(seed);
  p.add(faceted(new THREE.BoxGeometry(0.42, 0.05, 0.2)), "#e8a0a0", { p: [0, 0.03, 0], r: [0.25, r() * 0.6, 0.1], ink: 0.016 });
  p.add(faceted(new THREE.BoxGeometry(0.3, 0.05, 0.17)), "#e08c90", { p: [0.08, 0.07, 0.05], r: [-0.3, 0.5, -0.1], ink: 0.016 });
  p.add(faceted(new THREE.BoxGeometry(0.4, 0.052, 0.03)), "#f6dede", { p: [0, 0.035, -0.1], r: [0.25, 0, 0.1], ink: false });
  return p;
}
/** A fig quarter, cut face up: purple skin round a pink, seedy middle. */
export function figParts(): Parts {
  const p = new Parts();
  p.add(GEO.blob, "#6e2a52", { p: [0, 0.05, 0], s: [0.17, 0.07, 0.15], ink: 0.016 });
  p.add(GEO.disc, "#d8708a", { p: [0, 0.115, 0], s: [0.11, 1, 0.09], ink: false });
  p.add(GEO.disc, "#f2c2a2", { p: [0, 0.118, 0], s: [0.045, 1, 0.035], ink: false });
  return p;
}
/** A thin crescent of pear. */
export function pearParts(): Parts {
  const p = new Parts();
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.28, Math.PI * 0.15, Math.PI * 0.85, false);
  s.absarc(0, 0.1, 0.2, Math.PI * 0.83, Math.PI * 0.17, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0.12);
  p.add(faceted(g), "#f3ecd0", { ink: 0.016 });
  const rim = new THREE.Shape();
  rim.absarc(0, 0, 0.28, Math.PI * 0.15, Math.PI * 0.85, false);
  rim.absarc(0, 0, 0.25, Math.PI * 0.85, Math.PI * 0.15, true);
  const rg = new THREE.ExtrudeGeometry(rim, { depth: 0.038, bevelEnabled: false, curveSegments: 8 });
  rg.rotateX(-Math.PI / 2);
  rg.translate(0, 0.002, 0.12);
  p.add(faceted(rg), "#c8c25a", { ink: false });
  return p;
}
/** Blue cheese: a few crumbles, veined; melted, a soft flat puddle with the veins still showing. */
export function blueParts(melted: boolean, seed: number): Parts {
  const p = new Parts();
  const r = rng(seed);
  if (melted) {
    p.add(GEO.blob, "#eef0f2", { p: [0, 0.02, 0], s: [0.22, 0.04, 0.18], ink: 0.014 });
    for (let i = 0; i < 3; i++) p.add(GEO.disc, "#7d8aa6", { p: [(r() - 0.5) * 0.2, 0.062, (r() - 0.5) * 0.16], s: [0.03, 1, 0.02], ink: false });
    return p;
  }
  for (let i = 0; i < 3; i++) p.add(GEO.crumb, i % 2 ? "#e9ecf1" : "#dfe3ea", { p: [(r() - 0.5) * 0.2, 0.06 + r() * 0.03, (r() - 0.5) * 0.16], r: [r(), r(), r()], s: 1 + r() * 0.4, ink: 0.014 });
  p.add(GEO.crumb, "#6f7d9a", { p: [0, 0.1, 0], s: 0.35, ink: false });
  return p;
}
/** Torn mozzarella: a soft lump; melted, a flat round with a few golden blisters. */
export function mozzParts(melted: boolean, baked: number): Parts {
  const p = new Parts();
  if (melted) {
    p.add(GEO.blob, "#fbf6e6", { p: [0, 0.02, 0], s: [0.34, 0.05, 0.28], ink: 0.014 });
    if (baked > 0.4) for (const [x, z] of [[0.08, 0.04], [-0.1, -0.05]] as const) p.add(GEO.disc, "#e2b25a", { p: [x, 0.072, z], s: [0.05, 1, 0.04], ink: false });
    return p;
  }
  p.add(GEO.blob, "#fbfaf5", { p: [0, 0.08, 0], s: [0.22, 0.12, 0.19], ink: 0.016 });
  return p;
}

const PARTS = new Map<string, Baked>();
function part(key: string, build: () => Parts): THREE.Mesh {
  let b = PARTS.get(key);
  if (!b) PARTS.set(key, (b = bakeShared(build())));
  return bakedMesh(b);
}

/** A topping piece on its own, as carried from the rail (makeFood hands these kinds over here). */
export function toppingMesh(kind: Kind): THREE.Mesh | null {
  switch (kind) {
    case "mushroom":
      return part("mushroom", () => {
        const p = new Parts();
        p.addParts(mushroomParts(false), { s: 1.6 });
        return p;
      });
    case "ham":
      return part("ham", () => new Parts().addParts(hamParts(3), { s: 1.5 }));
    case "fig":
      return part("fig", () => new Parts().addParts(figParts(), { s: 1.6 }));
    case "pear":
      return part("pear", () => new Parts().addParts(pearParts(), { s: 1.5 }));
    case "blue":
      return part("blue", () => new Parts().addParts(blueParts(false, 4), { s: 1.6 }));
    case "dough":
      return null;
  }
  return null;
}

/** Spots for the `k`th piece of a counted topping, over the pie (unit oval), each kind turned so the kinds interleave. */
const KIND_TURN: Partial<Record<Kind, number>> = { mozzarella: 0.3, mushroom: 1.4, ham: 2.6, fig: 3.7, pear: 4.9, blue: 0.9 };
function spot(kind: Kind, k: number): [number, number] {
  const a = (KIND_TURN[kind] ?? 0) + k * 2.39996;
  const r = 0.2 + 0.55 * Math.sqrt(((k * 0.618 + (KIND_TURN[kind] ?? 0) * 0.1) % 1) * 0.85 + 0.12);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Painted sauce: tomato in wide dabs along the ladle's path, kept inside the crust. */
function sauceParts(stroke: { x: number; z: number }[], color: string, radius: number): Parts {
  const p = new Parts();
  const rx = PIE.rx * INNER;
  const rz = PIE.rz * INNER;
  let last: { x: number; z: number } | null = null;
  const put = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const k = r > 0.82 ? 0.82 / r : 1;
    p.add(GEO.disc, color, { p: [x * k * rx, 0, z * k * rz], s: [radius * rx, 1, radius * rz], ink: false });
  };
  for (const q of stroke) {
    if (last) {
      const d = Math.hypot(q.x - last.x, q.z - last.z);
      const n = Math.max(1, Math.ceil(d / (radius * 0.6)));
      for (let i = 1; i <= n; i++) put(last.x + ((q.x - last.x) * i) / n, last.z + ((q.z - last.z) * i) / n);
    } else put(q.x, q.z);
    last = q;
  }
  return p;
}
/** A thin drizzle (olive oil, honey) along a stroke, as a tube. */
function drizzle(stroke: { x: number; z: number }[], color: string, y: number, opacity = 1): THREE.Mesh | null {
  const rx = PIE.rx * INNER;
  const rz = PIE.rz * INNER;
  const pts = stroke.map((q) => {
    const r = Math.hypot(q.x, q.z);
    const k = r > 0.95 ? 0.95 / r : 1;
    return new THREE.Vector3(q.x * k * rx, y, q.z * k * rz);
  });
  if (pts.length < 2) return null;
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(200, pts.length * 3), SAUCE_RADIUS * 0.75, 5, false);
  tube.scale(1, 0.5, 1);
  const m = new THREE.Mesh(tube, toon(color, opacity < 1 ? { opacity } : {}));
  m.castShadow = false;
  return m;
}

export interface FlatbreadObject extends THREE.Group {
  userData: {
    /** Recolour the crust halves and redraw the toppings when they change. */
    update: (pieces: Piece[]) => void;
    /** Height of the top (for the tray's sauce and the stack's fit). */
    top: number;
    rx: number;
    rz: number;
  };
}

/**
 * A flatbread (or a calzone), dough first then everything on it. The base's half A is the back
 * half (where the fire is) until it's turned; `rotation.y` is left to the caller (the oven turns it).
 */
export function makeFlatbread(pieces: Piece[]): FlatbreadObject {
  const g = new THREE.Group() as FlatbreadObject;
  const dough = pieces[0];
  const folded = !!dough?.folded;
  const halves: THREE.Mesh[] = [];
  const rims: THREE.Mesh[] = [];
  if (folded) {
    // A puffed half moon, its straight crease along the back, crimped round the front.
    for (const geo of [GEO.calA, GEO.calB]) {
      const m = mesh(geo, "#f1dcaa", { unique: true, ink: 1.025 });
      m.scale.set(PIE.rx * 0.95, CALZONE_H, PIE.rz * 1.25);
      m.position.z = -PIE.rz * 0.55;
      g.add(m);
      halves.push(m);
    }
    const crimp = new Parts();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      crimp.add(GEO.blob, "#ffffff", { p: [Math.cos(a) * PIE.rx * 0.97, 0.05, -PIE.rz * 0.55 + Math.sin(a) * PIE.rz * 1.27], s: [0.14, 0.07, 0.1], r: [0, -a, 0], ink: 0.014 });
    }
    const cm = bakedMesh(crimp.bake(), { material: toon("#e8bd6c", { unique: true }) });
    g.add(cm);
    rims.push(cm);
    // Two little steam slits on top.
    for (const x of [-0.25, 0.25]) {
      const s = mesh(faceted(new THREE.BoxGeometry(0.22, 0.02, 0.04)), "#7a4a22", { ink: false, shadow: false });
      s.position.set(x, CALZONE_H * 0.98, -PIE.rz * 0.1);
      s.rotation.set(0, 0.3 * Math.sign(x), 0);
      g.add(s);
    }
  } else {
    for (const [slab, rim] of [[GEO.slabA, GEO.rimA], [GEO.slabB, GEO.rimB]] as const) {
      const s = mesh(slab, "#f4e8ce", { unique: true, ink: 1.02 });
      const r = mesh(rim, "#f4e8ce", { unique: true, ink: 1.04 });
      g.add(s, r);
      halves.push(s);
      rims.push(r);
    }
  }
  // Leopard spots on the crust, shown once it's baked right.
  const spots = new Parts();
  const sr = rng(7);
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const k = 0.97 + (sr() - 0.5) * 0.04;
    const y = folded ? 0.12 + sr() * 0.3 : BASE_H + RIM_R * 1.25;
    const zr = folded ? Math.abs(Math.sin(a)) : Math.sin(a);
    const pos: [number, number, number] = folded ? [Math.cos(a) * PIE.rx * 0.82 * k, y + 0.2, -PIE.rz * 0.55 + zr * PIE.rz * 0.9] : [Math.cos(a) * PIE.rx * k, y, zr * PIE.rz * k];
    spots.add(GEO.spot, "#3a2412", { p: pos, s: 0.8 + sr() * 0.8, r: [0, sr() * 3, 0], ink: false });
  }
  const leo = bakedMesh(spots.bake(), { shadow: false });
  leo.visible = false;
  g.add(leo);
  // Cut lines across (the board at Port Amber).
  const cutMat = toon("#5a3a20");
  const cuts = [new THREE.Mesh(new THREE.BoxGeometry(PIE.rx * 2.02, 0.012, 0.035), cutMat), new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, PIE.rz * 2.02), cutMat)];
  for (const c of cuts) {
    c.position.y = FLATBREAD_TOP - 0.02;
    c.visible = false;
    g.add(c);
  }
  const tops = new THREE.Group();
  g.add(tops);
  let key = "";
  const build = (ps: Piece[]) => {
    for (const c of tops.children) disposeObject(c);
    tops.clear();
    if (folded) return;
    const seen = new Map<Kind, number>();
    let after = 0;
    ps.slice(1).forEach((p, idx) => {
      const k = seen.get(p.kind) ?? 0;
      seen.set(p.kind, k + 1);
      const y0 = BASE_H + 0.005;
      if (p.kind === "redsauce") {
        if (p.stroke?.length) {
          const m = bakedMesh(sauceParts(p.stroke, "#c8402a", LADLE_RADIUS).bake(), { shadow: false });
          m.position.y = y0 + 0.004 * idx;
          tops.add(m);
        }
        return;
      }
      if (p.kind === "oil" || p.kind === "honey") {
        const m = p.stroke ? drizzle(p.stroke, p.kind === "oil" ? "#d6c64a" : "#eaa22a", p.kind === "oil" ? y0 + 0.02 : FLATBREAD_TOP - 0.02, p.kind === "oil" ? 0.75 : 1) : null;
        if (m) tops.add(m);
        return;
      }
      if (p.kind === "basil" || p.kind === "rocket") {
        // A few leaves scattered over the top.
        for (let i = 0; i < 3; i++) {
          const a = 0.8 + i * 2.1 + after;
          const m = part(p.kind, () => paniniParts(p.kind, 0.02));
          m.scale.setScalar(p.kind === "basil" ? 0.55 : 0.5);
          m.position.set(Math.cos(a) * PIE.rx * 0.38, y0 + 0.06, Math.sin(a) * PIE.rz * 0.38);
          m.rotation.y = a;
          tops.add(m);
        }
        after += 1;
        return;
      }
      const [ux, uz] = COUNTED.has(p.kind) ? spot(p.kind, k) : [0, 0];
      let m: THREE.Mesh | null = null;
      const roasted = (p.cook[0] ?? 0) >= 1;
      if (p.kind === "mozzarella") m = part(`mozz${isMelted(p) ? "m" : ""}${(dough.cook[0] + dough.cook[1]) / 2 > 0.4 ? "b" : ""}`, () => mozzParts(isMelted(p), (dough.cook[0] + dough.cook[1]) / 2));
      else if (p.kind === "blue") m = part(`blue${isMelted(p) ? "m" : ""}${k % 3}`, () => blueParts(isMelted(p), k + 2));
      else if (p.kind === "mushroom") m = part(`mush${roasted ? "r" : ""}`, () => mushroomParts(roasted));
      else if (p.kind === "ham") m = part(`ham${k % 3}`, () => hamParts(k + 1));
      else if (p.kind === "fig") m = part("figq", figParts);
      else if (p.kind === "pear") m = part("pears", pearParts);
      if (!m) return;
      m.position.set(ux * PIE.rx * INNER, y0 + (p.kind === "mozzarella" || p.kind === "blue" ? 0.01 : 0.03), uz * PIE.rz * INNER);
      m.rotation.y = k * 1.7 + idx;
      tops.add(m);
    });
  };
  g.userData = {
    top: folded ? CALZONE_H : FLATBREAD_TOP,
    rx: PIE.rx * INNER,
    rz: PIE.rz * INNER,
    update: (ps) => {
      const d = ps[0];
      if (!d) return;
      // Each half of the crust browns on its own; the middle under the toppings stays paler.
      halves.forEach((h, i) => (h.material as THREE.MeshToonMaterial).color.copy(doughRamp(d.cook[i], tmp)).lerp(CREAM, folded ? 0 : 0.15));
      if (folded) (rims[0].material as THREE.MeshToonMaterial).color.copy(doughRamp((d.cook[0] + d.cook[1]) / 2 + 0.05, tmp));
      else rims.forEach((r, i) => (r.material as THREE.MeshToonMaterial).color.copy(doughRamp(d.cook[i] + 0.05, tmp)));
      leo.visible = leopard(d, d.folded ? 2 : 1) || ((d.turns ?? 0) > 0 && Math.min(...d.cook) >= COOK_SCALE.dough.done + 0.1 && Math.abs(d.cook[0] - d.cook[1]) < 0.2);
      cuts[0].visible = (d.cuts ?? 0) >= 1;
      cuts[1].visible = (d.cuts ?? 0) >= 2;
      const k = ps
        .slice(1)
        .map((p) => `${p.kind}${p.stroke?.length ?? ""}${isMelted(p) ? "m" : ""}${(p.cook[0] ?? 0) >= 1 ? "r" : ""}`)
        .join(",") + ((d.cook[0] + d.cook[1]) / 2 > 0.4 ? "b" : "");
      if (k !== key) {
        key = k;
        build(ps);
      }
    },
  };
  g.userData.update(pieces);
  return g;
}

/**
 * Which way a flatbread faces on the counter: as the peel has nudged it round, half A to the back
 * (the oven's hot wall) at 0. A calzone's halves are its left and right, so it's drawn a quarter
 * turn round: its half A to the back too, the crease down its right side.
 */
export const pieYaw = (p: Piece): number => pieYawOf(p) + (p.folded ? -Math.PI / 2 : 0);
