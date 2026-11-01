import * as THREE from "three";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "../bake";
import { faceted, toon } from "../materials";
import { box, cyl, glow, sph, tor } from "./kit";

/*
 * Orchard Isle's hearth oven page (DESIGN §24, phase 4), modelled straight in game units
 * (page-local, like the counter's layout numbers) since it's one of a kind. A brick base with a
 * stone hearth across the back of the counter, the back half of a clay dome over it (the front is
 * left open so the pies show from the camera), a wood fire at the back left, and a short
 * chimney. In front: a wooden peel to build on, a stack of dough bases, a pot of tomato sauce
 * with its ladle and, on the fryer, a bowl of batter for the zucchini.
 */

/** Hearth top height and footprint (page-local). */
export const HEARTH = { x0: -1.8, x1: 4.45, z0: -3.35, z1: -0.3, y: 0.62 };
/** The dome: back half of an ellipsoid, its open front along z = DOME.z. */
/**
 * The dome: back half of an ellipsoid, its open front along z = DOME.z. It's drawn taller than
 * life: the camera looks down so steeply that a true-height dome would read as a flat band.
 */
export const DOME = { x: (HEARTH.x0 + HEARTH.x1) / 2, z: -1.75, rx: 3.0, ry: 3.0, rz: 1.55 };
/** Where the fire burns, page-local, on the hearth. */
export const FIRE = { x: DOME.x - 1.75, z: -2.6 };

const BRICK = "#c46e4e";
const MORTAR = "#e7c9a8";
const STONE = "#dcc8a4";
const CLAY = "#d99a6c";

const base = (() => {
  let b: Baked | null = null;
  return () => {
    if (b) return b;
    const p = new Parts();
    const { x0, x1, z0, z1, y } = HEARTH;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // Brick base with mortar courses along the front.
    p.add(box(w, y - 0.08, d), BRICK, { p: [cx, (y - 0.08) / 2, cz], ink: 0.02 });
    for (let i = 1; i < 3; i++) p.add(box(w + 0.01, 0.025, 0.01), MORTAR, { p: [cx, (i * (y - 0.08)) / 3, z1 + 0.003], ink: false });
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 11; i++) {
        const x = x0 + ((i + (r % 2 ? 0.5 : 0)) * w) / 10.5;
        if (x > x1 - 0.05) continue;
        p.add(box(0.025, (y - 0.08) / 3 - 0.02, 0.01), MORTAR, { p: [x, ((r + 0.5) * (y - 0.08)) / 3, z1 + 0.003], ink: false });
      }
    // The stone hearth slab, a lip proud of the bricks, and soot round the fire.
    p.add(box(w + 0.12, 0.1, d + 0.08), STONE, { p: [cx, y - 0.05, cz + 0.02], ink: 0.02 });
    for (let i = 1; i < 5; i++) p.add(box(0.02, 0.005, d), "#c7b18a", { p: [x0 + (i * w) / 5, y + 0.002, cz], ink: false });
    p.add(faceted(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2)), "#9c8160", { p: [FIRE.x, y + 0.004, FIRE.z], s: [0.85, 1, 0.6], ink: false });
    // Two split logs and a few smaller ones, the fire on them.
    const r = rng(5);
    const log = cyl(0.09, 0.1, 0.9, 7);
    for (let i = 0; i < 4; i++) {
      p.add(log, i % 2 ? "#6e4a2e" : "#5c3d26", { p: [FIRE.x + (i - 1.5) * 0.16, y + 0.1 + (i % 2) * 0.08, FIRE.z + (r() - 0.5) * 0.1], r: [Math.PI / 2, 0, 0.5 - i * 0.33], ink: 0.014 });
    }
    p.add(cyl(0.11, 0.12, 0.8, 7), "#7a5232", { p: [FIRE.x + 0.55, y + 0.11, FIRE.z + 0.15], r: [Math.PI / 2, 0, 1.3], ink: 0.014 });
    // A little stack of spare logs at the right end, against the dome.
    for (let i = 0; i < 3; i++) p.add(cyl(0.1, 0.1, 0.75, 7), i === 1 ? "#8a6040" : "#74512f", { p: [HEARTH.x1 - 0.35, y + 0.11 + (i === 2 ? 0.17 : 0), -3.05 + (i === 2 ? 0.1 : i * 0.2)], r: [0, 0, Math.PI / 2], ink: 0.014 });
    // The dome: clay outside, soot-dark inside, a brick arch round its mouth.
    const shell = faceted(new THREE.SphereGeometry(1, 28, 10, Math.PI, Math.PI, 0, Math.PI / 2));
    p.add(shell, CLAY, { p: [DOME.x, y, DOME.z], s: [DOME.rx, DOME.ry, DOME.rz], ink: 0.022 });
    const arch = new THREE.EllipseCurve(0, 0, DOME.rx + 0.02, DOME.ry + 0.02, 0, Math.PI, false);
    const pts = arch.getPoints(24).map((q) => new THREE.Vector3(q.x, q.y, 0));
    p.add(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.11, 6, false)), BRICK, { p: [DOME.x, y, DOME.z], s: [1, 1, 1.3], ink: 0.02 });
    // Brick joints round the arch.
    for (let i = 1; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      p.add(box(0.03, 0.24, 0.3), MORTAR, { p: [DOME.x + Math.cos(a) * (DOME.rx + 0.02), y + Math.sin(a) * (DOME.ry + 0.02), DOME.z], r: [0, 0, a - Math.PI / 2], ink: false });
    }
    // Patches of whitewash on the clay.
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.15 + 0.7 * r());
      const e = 0.3 + 0.5 * r();
      const v = new THREE.Vector3(-Math.cos(a) * Math.sin(e + 0.4), Math.cos(e + 0.4), -Math.sin(a) * Math.sin(e + 0.4));
      p.add(sph(0.2, 8, 5), "#e7b48a", { p: [DOME.x + v.x * DOME.rx * 0.99, y + v.y * DOME.ry * 0.99, DOME.z + v.z * DOME.rz * 0.99], s: [1.6, 0.25, 1.2], ink: false });
    }
    // A short chimney on the dome's back slope.
    p.add(cyl(0.26, 0.3, 0.7, 10), BRICK, { p: [DOME.x + 1.2, y + DOME.ry * 0.82, DOME.z - DOME.rz * 0.6], ink: 0.018 });
    p.add(cyl(0.32, 0.32, 0.1, 10), MORTAR, { p: [DOME.x + 1.2, y + DOME.ry * 0.82 + 0.38, DOME.z - DOME.rz * 0.6], ink: 0.014 });
    b = bakeShared(p);
    return b;
  };
})();

export interface HearthOvenObject extends THREE.Group {
  userData: {
    /** Animate the fire (seconds). */
    tick: (t: number) => void;
  };
}

/** The hearth oven, origin at the page centre (page-local coordinates throughout). */
export function makeHearthOven(): HearthOvenObject {
  const g = new THREE.Group() as HearthOvenObject;
  g.add(bakedMesh(base()));
  // The inside of the dome: a dark shell drawn from inside, so the open front shows a sooty vault.
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, Math.PI, Math.PI, 0, Math.PI / 2), toon("#4a3326", { side: THREE.BackSide }));
  inner.scale.set(DOME.rx * 0.96, DOME.ry * 0.95, DOME.rz * 0.95);
  inner.position.set(DOME.x, HEARTH.y + 0.002, DOME.z);
  inner.receiveShadow = true;
  g.add(inner);
  // A warm glow on the hearth round the fire, and the flames: a few cones that flicker.
  const ember = glow(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), "#ff8a3a", 0.35);
  ember.scale.set(1.25, 1, 0.85);
  ember.position.set(FIRE.x + 0.15, HEARTH.y + 0.012, FIRE.z + 0.1);
  ember.renderOrder = 1;
  const wash = glow(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), "#ffb35a", 0.12);
  wash.scale.set(2.8, 1, 1.4);
  wash.position.set(FIRE.x + 0.9, HEARTH.y + 0.01, FIRE.z + 0.55);
  wash.renderOrder = 1;
  g.add(ember, wash);
  const cone = new THREE.ConeGeometry(0.16, 0.6, 6);
  cone.translate(0, 0.3, 0);
  const flames: { m: THREE.Mesh; ph: number; h: number }[] = [];
  const spots: [number, number, string, number, number][] = [
    [-0.25, 0, "#ff7a1a", 1.0, 1.0],
    [0.05, -0.05, "#ffa52a", 1.25, 1.1],
    [0.32, 0.05, "#ff7a1a", 0.9, 0.95],
    [0.12, 0.12, "#ffd15a", 0.7, 0.75],
    [-0.08, 0.1, "#ffe08a", 0.5, 0.6],
    [0.55, 0.1, "#ffa52a", 0.6, 0.7],
  ];
  for (const [dx, dz, col, h, w] of spots) {
    const m = glow(cone, col, col === "#ffe08a" ? 1 : 0.92);
    m.position.set(FIRE.x + dx, HEARTH.y + 0.15, FIRE.z + dz);
    m.scale.set(w, h, w);
    m.renderOrder = 2;
    g.add(m);
    flames.push({ m, ph: dx * 7 + dz * 13, h });
  }
  g.userData.tick = (t) => {
    for (const f of flames) {
      const k = 0.82 + 0.18 * Math.sin(t * 9 + f.ph) + 0.08 * Math.sin(t * 23 + f.ph * 2);
      f.m.scale.y = f.h * k;
      f.m.rotation.z = 0.08 * Math.sin(t * 5 + f.ph);
    }
    (ember.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.07 * Math.sin(t * 6.3);
  };
  return g;
}

/* ---- the front strip --------------------------------------------------------------- */

/** The peel's blade (half sizes) and how far its handle runs toward the front. */
export const PEEL = { rx: 1.12, rz: 0.84, handle: 1.25, y: 0.07 };

/** The wooden peel, blade centre at the origin, its handle toward the front. */
export const makePeel = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      const s = new THREE.Shape();
      const { rx, rz } = PEEL;
      const r = 0.35;
      s.moveTo(-rx + r, -rz);
      s.lineTo(rx - r, -rz);
      s.quadraticCurveTo(rx, -rz, rx, -rz + r);
      s.lineTo(rx, rz - r);
      s.quadraticCurveTo(rx, rz, rx - r, rz);
      s.lineTo(0.3, rz + 0.15);
      s.lineTo(-0.3, rz + 0.15);
      s.lineTo(-rx + r, rz);
      s.quadraticCurveTo(-rx, rz, -rx, rz - r);
      s.lineTo(-rx, -rz + r);
      s.quadraticCurveTo(-rx, -rz, -rx + r, -rz);
      const blade = new THREE.ExtrudeGeometry(s, { depth: PEEL.y - 0.01, bevelEnabled: false, curveSegments: 5 });
      blade.rotateX(Math.PI / 2);
      blade.translate(0, PEEL.y, 0);
      p.add(faceted(blade), "#d9ad74", { ink: 0.02 });
      for (let i = 0; i < 4; i++) p.add(box(0.012, 0.004, PEEL.rz * 1.9), "#c8995e", { p: [-PEEL.rx * 0.6 + i * PEEL.rx * 0.4, PEEL.y + 0.003, 0], ink: false });
      // A dusting of flour on the blade.
      const fr = rng(9);
      for (let i = 0; i < 14; i++) p.add(faceted(new THREE.CircleGeometry(0.06 + fr() * 0.08, 6).rotateX(-Math.PI / 2)), "#f3ead8", { p: [(fr() - 0.5) * PEEL.rx * 1.7, PEEL.y + 0.004, (fr() - 0.5) * PEEL.rz * 1.7], ink: false });
      p.add(cyl(0.07, 0.07, PEEL.handle, 8), "#b98a54", { p: [0, PEEL.y + 0.02, PEEL.rz + 0.12 + PEEL.handle / 2], r: [Math.PI / 2, 0, 0], ink: 0.016 });
      p.add(cyl(0.085, 0.085, 0.08, 8), "#8a6238", { p: [0, PEEL.y + 0.02, PEEL.rz + 0.12 + PEEL.handle], r: [Math.PI / 2, 0, 0], ink: 0.014 });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** The dough bases: a floured board with a stack of hand-shaped ovals. Origin at the board's centre. */
export const DOUGH = { w: 1.5, d: 1.15 };
export const makeDoughStack = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      p.add(box(DOUGH.w, 0.1, DOUGH.d), "#c98a52", { p: [0, 0.05, 0], ink: 0.018 });
      const oval = faceted(new THREE.CylinderGeometry(1, 1, 0.07, 18));
      const r = rng(3);
      for (let i = 0; i < 4; i++) p.add(oval, i % 2 ? "#f1dfb6" : "#f4e6c4", { p: [(r() - 0.5) * 0.06, 0.135 + i * 0.075, (r() - 0.5) * 0.05], s: [0.6, 1, 0.45], r: [0, (r() - 0.5) * 0.3, 0], ink: 0.014 });
      for (let i = 0; i < 9; i++) p.add(faceted(new THREE.CircleGeometry(0.05 + r() * 0.05, 6).rotateX(-Math.PI / 2)), "#f7f0e2", { p: [(r() - 0.5) * DOUGH.w * 0.85, 0.104, (r() - 0.5) * DOUGH.d * 0.85], ink: false });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** The pot of tomato sauce with its ladle standing in it. Origin at the pot's base. */
export const POT = { r: 0.5, h: 0.5 };
export const makeSaucePot = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      // Open at the top, so the sauce shows from above.
      p.add(cyl(POT.r, POT.r * 0.92, POT.h, 18, true), "#c9d1cf", { p: [0, POT.h / 2, 0], ink: 0.02 });
      p.add(tor(POT.r, 0.035, 5, 20), "#e2e7e6", { p: [0, POT.h, 0], r: [Math.PI / 2, 0, 0], ink: 0.012 });
      p.add(cyl(POT.r - 0.01, POT.r - 0.03, 0.04, 18), "#c8402a", { p: [0, POT.h - 0.06, 0], ink: false });
      p.add(cyl(POT.r * 0.4, POT.r * 0.4, 0.022, 10), "#d65a3a", { p: [-0.12, POT.h - 0.035, 0.08], ink: false });
      for (const s of [-1, 1]) p.add(box(0.16, 0.06, 0.1), "#9aa3a6", { p: [s * (POT.r + 0.06), POT.h - 0.1, 0], ink: 0.012 });
      // The ladle, its bowl in the sauce, the handle leaning out over the front.
      p.add(cyl(0.03, 0.03, 0.85, 6), "#9aa3a6", { p: [0.12, POT.h + 0.22, 0.24], r: [0.75, 0, -0.25], ink: 0.012 });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** The ladle in hand, a little tomato in its bowl. */
export function makeSauceLadle(): THREE.Mesh {
  const p = new Parts();
  p.add(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "#c9d1cf", { p: [0, 0.2, 0] });
  p.add(cyl(0.18, 0.18, 0.02, 10), "#c8402a", { p: [0, 0.19, 0], ink: 0 });
  p.add(cyl(0.03, 0.03, 0.95, 6), "#9aa3a6", { p: [0.06, 0.6, 0.32], r: [0.75, 0, 0], ink: 0.012 });
  return bakedMesh(p.bake());
}

/** The fryer's batter bowl (Orchard Isle): pale batter and a whisk. Origin at its base. */
export const BATTER = { r: 0.62, h: 0.42 };
export const makeBatterBowl = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      p.add(faceted(new THREE.LatheGeometry([new THREE.Vector2(0.3, 0), new THREE.Vector2(BATTER.r * 0.85, 0.12), new THREE.Vector2(BATTER.r, BATTER.h), new THREE.Vector2(BATTER.r - 0.04, BATTER.h)], 18)), "#e9e3d6", { ink: 0.02 });
      p.add(cyl(BATTER.r - 0.06, BATTER.r - 0.06, 0.02, 18), "#f2dc9a", { p: [0, BATTER.h - 0.07, 0], ink: false });
      p.add(cyl(0.12, 0.12, 0.022, 10), "#f8eac0", { p: [0.15, BATTER.h - 0.065, -0.1], ink: false });
      // A whisk resting across the rim.
      p.add(cyl(0.035, 0.035, 0.7, 6), "#8a6238", { p: [0.45, BATTER.h + 0.12, 0.2], r: [0, 0, 1.25], ink: 0.012 });
      for (let i = 0; i < 3; i++) p.add(tor(0.09, 0.012, 4, 10), "#c9d1cf", { p: [0.0, BATTER.h + 0.0, 0.2], r: [0, (i * Math.PI) / 3, 1.25], s: [1, 1.8, 1], ink: false });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();
