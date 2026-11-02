import * as THREE from "three";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "../bake";
import { faceted } from "../materials";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COUNTER_FOOD } from "../units";
import { box, canvasTex, cyl, tor } from "./kit";

/*
 * Orchard Isle's oven page (DESIGN §24, phase 4; after build #69), modelled straight in game units
 * (page-local, like the counter's layout numbers) since it's one of a kind. A deck oven that fits
 * a food truck: a stone deck on a brick base across the back of the counter, a brick back wall and
 * two brick side walls, open at the front so the pies show from the camera. No fire and no smoke:
 * the heat is an electric element glowing along the foot of the back wall, so the half of a pie
 * facing the back bakes first. In front: the wooden peel (the only thing that moves a pie), a
 * stack of dough bases at the same size as a base on the peel, a marble bench to set a pie down,
 * a big pot of tomato sauce with its ladle and, on the fryer, a bowl of batter for the zucchini.
 */

/** The oven's footprint and deck height (page-local). */
export const HEARTH = { x0: -1.85, x1: 4.55, z0: -3.35, z1: -0.3, y: 0.4 };
/** Brick walls: thickness and height above the deck. */
export const WALLS = { t: 0.3, h: 1.35 };
/** The deck inside the walls, where pies bake and the peel can reach. */
export const DECK = { x0: HEARTH.x0 + WALLS.t, x1: HEARTH.x1 - WALLS.t, z0: HEARTH.z0 + WALLS.t, z1: HEARTH.z1 };

const BRICK = "#c46e4e";
const BRICK_D = "#b05e40";
const MORTAR = "#e7c9a8";
const STONE = "#dcc8a4";
/** The baking deck: a warmer, darker stone than the caps, sooted toward the back and corners. */
const DECK_STONE = "#c9ad86";

/** Mortar joints over a brick face, in a plane: `at(u, v)` maps face coordinates (u along, v up) to a point. */
function brickFace(p: Parts, w: number, h: number, at: (u: number, v: number) => [number, number, number], rot: [number, number, number], course = 0.22, brick = 0.52): void {
  const rows = Math.round(h / course);
  for (let r = 1; r < rows; r++) p.add(box(w, 0.022, 0.012), MORTAR, { p: at(w / 2, (r * h) / rows), r: rot, ink: false });
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? brick / 2 : 0;
    for (let u = off + brick; u < w - 0.08; u += brick) p.add(box(0.022, h / rows - 0.02, 0.012), MORTAR, { p: at(u, ((r + 0.5) * h) / rows), r: rot, ink: false });
  }
}

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
    // Brick base under the deck, mortar along its front.
    p.add(box(w, y - 0.08, d), BRICK, { p: [cx, (y - 0.08) / 2, cz], ink: 0.02 });
    brickFace(p, w, y - 0.08, (u, v) => [x0 + u, v, z1 + 0.004], [0, 0, 0], 0.16, 0.6);
    // The stone deck, a lip proud of the bricks, its slabs' joints.
    p.add(box(w + 0.1, 0.1, d + 0.08), DECK_STONE, { p: [cx, y - 0.05, cz + 0.02], ink: 0.02 });
    // Square stone slabs (three across, two deep), so the deck reads as stone, not planks.
    for (let i = 1; i < 3; i++) p.add(box(0.02, 0.005, DECK.z1 - DECK.z0), "#b39672", { p: [DECK.x0 + (i * (DECK.x1 - DECK.x0)) / 3, y + 0.002, (DECK.z0 + DECK.z1) / 2], ink: false });
    p.add(box(DECK.x1 - DECK.x0, 0.005, 0.02), "#b39672", { p: [cx, y + 0.002, (DECK.z0 + DECK.z1) / 2], ink: false });
    const H = WALLS.h;
    const T = WALLS.t;
    // The back wall, its inner face toward the camera in brick.
    p.add(box(w, H, T), BRICK, { p: [cx, y + H / 2, z0 + T / 2], ink: 0.022 });
    brickFace(p, DECK.x1 - DECK.x0, H, (u, v) => [DECK.x0 + u, y + v, DECK.z0 + 0.004], [0, 0, 0]);
    // Two side walls, the full depth of the deck, bricks on their inner faces and front ends.
    for (const sx of [x0 + T / 2, x1 - T / 2]) {
      p.add(box(T, H, d), BRICK_D, { p: [sx, y + H / 2, cz], ink: 0.022 });
      const inner = sx < cx ? sx + T / 2 + 0.004 : sx - T / 2 - 0.004;
      brickFace(p, d - T, H, (u, v) => [inner, y + v, DECK.z0 + u], [0, Math.PI / 2, 0]);
      brickFace(p, T, H, (u, v) => [sx - T / 2 + u, y + v, z1 + 0.004], [0, 0, 0], 0.22, 0.4);
    }
    // Stone caps along the tops of the walls.
    p.add(box(w + 0.08, 0.08, T + 0.1), STONE, { p: [cx, y + H + 0.04, z0 + T / 2], ink: 0.018 });
    for (const sx of [x0 + T / 2, x1 - T / 2]) p.add(box(T + 0.1, 0.08, d + 0.04), STONE, { p: [sx, y + H + 0.04, cz], ink: 0.018 });
    // The heating element: a steel rail along the foot of the back wall with a coiled bar in it.
    p.add(box(DECK.x1 - DECK.x0 - 0.1, 0.16, 0.2), "#4a4f52", { p: [cx, y + 0.08, DECK.z0 + 0.1], ink: 0.016 });
    for (let i = 0; i < 9; i++) p.add(box(0.05, 0.2, 0.22), "#3a3f42", { p: [DECK.x0 + 0.2 + (i * (DECK.x1 - DECK.x0 - 0.4)) / 8, y + 0.1, DECK.z0 + 0.11], ink: false });
    // A little dial on the right wall's front.
    p.add(cyl(0.11, 0.11, 0.05, 14), "#2d3336", { p: [x1 - T / 2, y + 0.42, z1 + 0.03], r: [Math.PI / 2, 0, 0], ink: 0.014 });
    p.add(box(0.025, 0.12, 0.02), "#ffffff", { p: [x1 - T / 2 + 0.03, y + 0.45, z1 + 0.06], r: [0, 0, -0.6], ink: false });
    b = bakeShared(p);
    return b;
  };
})();

/** Soot over the deck: clear in the front middle, darkening toward the back wall and the corners. */
const sootTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () =>
    (t ??= canvasTex(64, 32, (c, w, h) => {
      // Texture v runs front (bottom) to back (top) once laid on the deck.
      const g = c.createRadialGradient(w / 2, h * 1.05, h * 0.25, w / 2, h * 0.9, w * 0.62);
      g.addColorStop(0, "rgba(138,106,76,0)");
      g.addColorStop(0.55, "rgba(138,106,76,0.18)");
      g.addColorStop(1, "rgba(118,88,62,0.6)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const b = c.createLinearGradient(0, 0, 0, h);
      b.addColorStop(0, "rgba(110,80,56,0.45)");
      b.addColorStop(0.35, "rgba(110,80,56,0)");
      c.fillStyle = b;
      c.fillRect(0, 0, w, h);
    }));
})();

/** Wavy vertical strands, fading at both ends, for the heat shimmer (repeats upward). */
const shimmerTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    t = canvasTex(32, 64, (c, w, h) => {
      c.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        for (let y = 0; y <= h; y += 2) {
          const x = w * (0.2 + 0.3 * k) + Math.sin((y / h) * Math.PI * 4 + k) * 3;
          if (y === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.9)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.strokeStyle = g;
        c.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
})();

/** A soft vertical fade (opaque at the bottom of the texture), for the heat's glow. */
const fadeTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () =>
    (t ??= canvasTex(4, 64, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }));
})();

export interface HearthOvenObject extends THREE.Group {
  userData: {
    /** Let the element's glow breathe (seconds). */
    tick: (t: number) => void;
  };
}

/** The deck oven, origin at the page centre (page-local coordinates throughout). */
export function makeHearthOven(): HearthOvenObject {
  const g = new THREE.Group() as HearthOvenObject;
  g.add(bakedMesh(base()));
  const w = DECK.x1 - DECK.x0;
  const cx = (DECK.x0 + DECK.x1) / 2;
  // The element's bar, glowing orange in its rail.
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w - 0.3, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ff8a3a" }));
  bar.position.set(cx, HEARTH.y + 0.18, DECK.z0 + 0.1);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, w - 0.24, 10).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffb36a", transparent: true, opacity: 0.35, depthWrite: false }));
  halo.position.copy(bar.position);
  halo.renderOrder = 2;
  for (const m of [bar, halo]) {
    m.castShadow = false;
    m.raycast = () => {};
    g.add(m);
  }
  // Heat washing up the back wall's bricks and forward over the deck: the hot side.
  const mats: THREE.MeshBasicMaterial[] = [];
  const fade = (color: string, opacity: number) => {
    const m = new THREE.MeshBasicMaterial({ color, map: fadeTex(), transparent: true, opacity, depthWrite: false });
    mats.push(m);
    return m;
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, WALLS.h), fade("#ff7a2a", 0.72));
  wall.position.set(cx, HEARTH.y + WALLS.h / 2, DECK.z0 + 0.012);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.5).rotateX(-Math.PI / 2), fade("#ff8f3f", 0.55));
  // The texture's opaque edge lies along the back wall.
  deck.geometry.rotateY(Math.PI);
  deck.position.set(cx, HEARTH.y + 0.008, DECK.z0 + 0.75);
  for (const m of [wall, deck]) {
    m.renderOrder = 1;
    m.raycast = () => {};
    m.castShadow = false;
    g.add(m);
  }
  // Soot: the deck darkens toward the back wall and the corners, where years of heat have been.
  const soot = new THREE.Mesh(
    new THREE.PlaneGeometry(w, DECK.z1 - DECK.z0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: sootTex(), transparent: true, depthWrite: false }),
  );
  soot.position.set(cx, HEARTH.y + 0.005, (DECK.z0 + DECK.z1) / 2);
  soot.renderOrder = 0;
  // Embers: specks along the element that flicker.
  const r = rng(17);
  const specks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) specks.push(new THREE.SphereGeometry(0.022 + r() * 0.02, 5, 4).translate(DECK.x0 + 0.25 + r() * (w - 0.5), HEARTH.y + 0.03 + r() * 0.05, DECK.z0 + 0.22 + r() * 0.12));
  const embers = new THREE.Mesh(mergeGeometries(specks), new THREE.MeshBasicMaterial({ color: "#ffb14a", transparent: true, opacity: 0.9, depthWrite: false }));
  for (const x of specks) x.dispose();
  // Heat shimmer: faint wavy strips rising over the back half, drifting up.
  const shimmerMat = new THREE.MeshBasicMaterial({ map: shimmerTex(), color: "#fff2dc", transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const shimmer = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.22, 0.9), shimmerMat);
    m.position.set(DECK.x0 + (i + 0.5) * (w / 4) + (r() - 0.5) * 0.3, HEARTH.y + 0.55, DECK.z0 + 0.35 + r() * 0.5);
    shimmer.add(m);
  }
  for (const m of [soot, embers, ...shimmer.children]) {
    m.raycast = () => {};
    m.castShadow = false;
  }
  embers.renderOrder = 3;
  shimmer.children.forEach((m) => (m.renderOrder = 3));
  g.add(soot, embers, shimmer);
  const base0 = mats.map((m) => m.opacity);
  const shimmerMap = shimmerMat.map!;
  g.userData.tick = (t) => {
    const k = 0.9 + 0.1 * Math.sin(t * 1.7);
    mats.forEach((m, i) => (m.opacity = base0[i] * k));
    (bar.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.5 + 0.06 * Math.sin(t * 1.7), 0.2);
    (embers.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1));
    shimmerMap.offset.y = -t * 0.35;
    shimmerMap.offset.x = Math.sin(t * 0.9) * 0.05;
  };
  return g;
}

/* ---- the front strip --------------------------------------------------------------- */

/** The peel's blade (half sizes), how far its handle runs toward the front, and the blade's thickness. */
export const PEEL = { rx: 1.12, rz: 0.84, handle: 0.95, y: 0.06 };
/** From the blade's centre to the end of the handle (toward the front). */
export const PEEL_REACH = PEEL.rz + 0.12 + PEEL.handle;

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
      // Many small irregular specks, toned toward the wood, so it reads as dusting rather than holes.
      for (let i = 0; i < 16; i++) p.add(faceted(new THREE.CircleGeometry(0.025 + fr() * 0.045, 10).rotateX(-Math.PI / 2)), i % 3 ? "#ecd3a6" : "#f1e2c4", { p: [(fr() - 0.5) * PEEL.rx * 1.6, PEEL.y + 0.004, (fr() - 0.5) * PEEL.rz * 1.6], s: [1, 1, 0.55 + fr() * 0.45], r: [0, fr() * 3, 0], ink: false });
      // The handle: thick enough to read as the thing to hold, with a dark grip at the end.
      p.add(cyl(0.09, 0.09, PEEL.handle, 8), "#b98a54", { p: [0, PEEL.y + 0.03, PEEL.rz + 0.12 + PEEL.handle / 2], r: [Math.PI / 2, 0, 0], ink: 0.016 });
      p.add(cyl(0.105, 0.105, 0.34, 8), "#7a5232", { p: [0, PEEL.y + 0.03, PEEL_REACH - 0.17], r: [Math.PI / 2, 0, 0], ink: 0.014 });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** Half sizes of a raw base, game units (a flatbread's oval at the counter food scale). */
const BASE = { rx: 2.0 * COUNTER_FOOD, rz: 1.5 * COUNTER_FOOD };
/** The dough bases: a floured board with a stack of hand-shaped bases the size of one on the peel. Origin at the board's centre. */
export const DOUGH = { w: BASE.rx * 2 + 0.16, d: BASE.rz * 2 + 0.2 };
export const makeDoughStack = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      p.add(box(DOUGH.w, 0.08, DOUGH.d), "#c98a52", { p: [0, 0.04, 0], ink: 0.018 });
      const oval = faceted(new THREE.CylinderGeometry(1, 1, 0.05, 22));
      const r = rng(3);
      const n = 5;
      for (let i = 0; i < n; i++) p.add(oval, i % 2 ? "#f1dfb6" : "#f4e6c4", { p: [(r() - 0.5) * 0.06, 0.105 + i * 0.052, (r() - 0.5) * 0.05], s: [BASE.rx * 0.97, 1, BASE.rz * 0.97], r: [0, (r() - 0.5) * 0.2, 0], ink: 0.014 });
      // The top base's raised edge, as on the peel.
      p.add(faceted(new THREE.TorusGeometry(1, 0.06, 5, 26).rotateX(Math.PI / 2)), "#f4e8ce", { p: [0, 0.105 + (n - 1) * 0.052 + 0.035, 0], s: [BASE.rx * 0.92, 0.8, BASE.rz * 0.9], ink: 0.012 });
      for (let i = 0; i < 12; i++) p.add(faceted(new THREE.CircleGeometry(0.025 + r() * 0.035, 10).rotateX(-Math.PI / 2)), "#e7c79c", { p: [(r() - 0.5) * DOUGH.w * 0.9, 0.084, (r() > 0.5 ? 1 : -1) * DOUGH.d * (0.4 + r() * 0.05)], s: [1, 1, 0.55 + r() * 0.45], ink: false });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** The marble bench where a pie can be set down (Applecross and Larkvale; Port Amber's board takes its place). */
export const BENCH = { w: DOUGH.w + 0.1, d: DOUGH.d + 0.1, h: 0.1 };
export const makeBench = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      p.add(box(BENCH.w, BENCH.h, BENCH.d), "#ece9e3", { p: [0, BENCH.h / 2, 0], ink: 0.018 });
      // Grey veins and a dusting of flour.
      const r = rng(21);
      for (let i = 0; i < 5; i++) p.add(box(0.5 + r() * 0.6, 0.004, 0.018), "#bdb8b0", { p: [(r() - 0.5) * BENCH.w * 0.7, BENCH.h + 0.002, (r() - 0.5) * BENCH.d * 0.8], r: [0, (r() - 0.5) * 1.4, 0], ink: false });
      for (let i = 0; i < 14; i++) p.add(faceted(new THREE.CircleGeometry(0.025 + r() * 0.04, 10).rotateX(-Math.PI / 2)), "#f6f3ed", { p: [(r() - 0.5) * BENCH.w * 0.85, BENCH.h + 0.004, (r() - 0.5) * BENCH.d * 0.85], s: [1, 1, 0.55 + r() * 0.45], ink: false });
      b = bakeShared(p);
    }
    return bakedMesh(b);
  };
})();

/** The pot of tomato sauce with its ladle standing in it. Origin at the pot's base. */
export const POT = { r: 0.66, h: 0.58 };
export const makeSaucePot = (() => {
  let b: Baked | null = null;
  return (): THREE.Mesh => {
    if (!b) {
      const p = new Parts();
      // Open at the top, so the sauce shows from above.
      p.add(cyl(POT.r, POT.r * 0.92, POT.h, 20, true), "#c9d1cf", { p: [0, POT.h / 2, 0], ink: 0.02 });
      p.add(tor(POT.r, 0.04, 5, 22), "#e2e7e6", { p: [0, POT.h, 0], r: [Math.PI / 2, 0, 0], ink: 0.012 });
      p.add(cyl(POT.r - 0.01, POT.r - 0.03, 0.04, 20), "#c8402a", { p: [0, POT.h - 0.06, 0], ink: false });
      p.add(cyl(POT.r * 0.4, POT.r * 0.4, 0.022, 10), "#d65a3a", { p: [-0.16, POT.h - 0.035, 0.1], ink: false });
      for (const s of [-1, 1]) p.add(box(0.18, 0.07, 0.12), "#9aa3a6", { p: [s * (POT.r + 0.07), POT.h - 0.1, 0], ink: 0.012 });
      // The ladle, its bowl in the sauce, the handle leaning out over the front.
      p.add(cyl(0.035, 0.035, 0.95, 6), "#9aa3a6", { p: [0.14, POT.h + 0.24, 0.28], r: [0.75, 0, -0.25], ink: 0.012 });
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
