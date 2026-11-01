import * as THREE from "three";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { curdLumps, GRAVY, makeFryPile } from "./food";
import { faceted, shareGeometry, toon } from "./materials";

/**
 * Fryer-page equipment: the vats, wire baskets, the potato freezer and the packing station.
 * Everything is baked into a few shared meshes, built once.
 */

const box = (w: number, h: number, d: number) => faceted(new THREE.BoxGeometry(w, h, d));
const cyl = (r0: number, r1: number, h: number, segs: number) => faceted(new THREE.CylinderGeometry(r0, r1, h, segs));

/** Fryer sizes, in world units. */
export const VAT = { w: 1.6, d: 2.5, h: 0.9 };
/** Oil well inside a vat, relative to the vat centre. */
export const WELL = { w: 1.34, d: 1.62, z: 0.12, oilY: 0.8, floor: 0.28 };
export const BASKET = { w: 1.14, d: 1.4, h: 0.5 };

const STEEL = "#c9d1cf";
const STEEL_LIGHT = "#e2e7e6";
const STEEL_DARK = "#3a4043";

let vatBaked: Baked | null = null;
/** A fryer cabinet with its oil well, back control panel, dial and lamp. Origin on the floor. */
export function makeVat(): THREE.Mesh {
  if (!vatBaked) {
    const p = new Parts();
    const { w, d, h } = VAT;
    // Cabinet below the well, then four blocks around an open well so a lowered basket shows.
    const fy = WELL.floor;
    p.add(box(w, fy, d), STEEL, { p: [0, fy / 2, 0] });
    const wz0 = WELL.z - WELL.d / 2;
    const wz1 = WELL.z + WELL.d / 2;
    const side = (w - WELL.w) / 2;
    const bh = h - fy;
    p.add(box(w, bh, wz0 + d / 2), STEEL, { p: [0, fy + bh / 2, (-d / 2 + wz0) / 2] });
    p.add(box(w, bh, d / 2 - wz1), STEEL, { p: [0, fy + bh / 2, (wz1 + d / 2) / 2] });
    p.add(box(side, bh, WELL.d), STEEL, { p: [-w / 2 + side / 2, fy + bh / 2, WELL.z], ink: false });
    p.add(box(side, bh, WELL.d), STEEL, { p: [w / 2 - side / 2, fy + bh / 2, WELL.z], ink: false });
    // Deck: a lighter top plate around the opening, and a dark lip at its edge.
    const lip = 0.05;
    p.add(box(w, 0.02, wz0 + d / 2), STEEL_LIGHT, { p: [0, h + 0.01, (-d / 2 + wz0) / 2], ink: false });
    p.add(box(w, 0.02, d / 2 - wz1), STEEL_LIGHT, { p: [0, h + 0.01, (wz1 + d / 2) / 2], ink: false });
    p.add(box(WELL.w + 2 * lip, 0.03, lip), STEEL_DARK, { p: [0, h + 0.015, wz0 - lip / 2], ink: false });
    p.add(box(WELL.w + 2 * lip, 0.03, lip), STEEL_DARK, { p: [0, h + 0.015, wz1 + lip / 2], ink: false });
    p.add(box(lip, 0.03, WELL.d), STEEL_DARK, { p: [-WELL.w / 2 - lip / 2, h + 0.015, WELL.z], ink: false });
    p.add(box(lip, 0.03, WELL.d), STEEL_DARK, { p: [WELL.w / 2 + lip / 2, h + 0.015, WELL.z], ink: false });
    // Inside of the well: deep oil-brown, so the translucent oil on top reads golden and deep.
    const deep = "#7a5220";
    p.add(box(WELL.w, 0.02, WELL.d), "#5e3d15", { p: [0, fy + 0.01, WELL.z], ink: false });
    p.add(box(WELL.w, bh, 0.02), deep, { p: [0, fy + bh / 2, wz0 + 0.01], ink: false });
    p.add(box(WELL.w, bh, 0.02), deep, { p: [0, fy + bh / 2, wz1 - 0.01], ink: false });
    p.add(box(0.02, bh, WELL.d), deep, { p: [-WELL.w / 2 + 0.01, fy + bh / 2, WELL.z], ink: false });
    p.add(box(0.02, bh, WELL.d), deep, { p: [WELL.w / 2 - 0.01, fy + bh / 2, WELL.z], ink: false });
    // Control panel along the back.
    const pz = -d / 2 + 0.24;
    p.add(box(w - 0.1, 0.32, 0.4), "#aeb8b6", { p: [0, h + 0.16, pz], ink: 0.02 });
    p.add(box(w - 0.3, 0.02, 0.26), "#2d3336", { p: [0, h + 0.33, pz], ink: false });
    p.add(cyl(0.11, 0.12, 0.08, 10), "#1f2426", { p: [-0.3, h + 0.37, pz], ink: 0.012 });
    p.add(box(0.03, 0.02, 0.1), "#e8e2d2", { p: [-0.3, h + 0.42, pz - 0.04], r: [0, 0.6, 0], ink: false });
    p.add(cyl(0.06, 0.06, 0.05, 8), "#f2a33a", { p: [0.15, h + 0.36, pz], ink: false });
    p.add(cyl(0.06, 0.06, 0.05, 8), "#6fc36a", { p: [0.36, h + 0.36, pz], ink: false });
    // Drain door on the front face.
    p.add(box(w - 0.4, h - 0.36, 0.02), "#b7c0be", { p: [0, (h - 0.06) / 2 - 0.05, d / 2 + 0.005], ink: 0.012 });
    p.add(box(0.36, 0.05, 0.05), STEEL_DARK, { p: [0, h - 0.32, d / 2 + 0.03], ink: false });
    vatBaked = bakeShared(p);
  }
  return bakedMesh(vatBaked);
}

/** Translucent oil, so the fries' colour shows through while they cook. */
export function makeOil(): THREE.Mesh {
  const m = new THREE.Mesh(OIL_GEO, toon("#e9b23f", { opacity: 0.62 }));
  m.renderOrder = 2;
  return m;
}
const OIL_GEO = shareGeometry(box(WELL.w, 0.02, WELL.d));

/** A few bubbles for the oil surface while a basket is down. */
export const BUBBLES_GEO = (() => {
  const p = new Parts();
  const r = rng(5);
  const g = faceted(new THREE.SphereGeometry(0.05, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let i = 0; i < 14; i++) {
    const s = 0.6 + r() * 0.9;
    p.add(g, "#fff1c4", { p: [(r() - 0.5) * BASKET.w * 1.05, 0, (r() - 0.5) * BASKET.d * 1.05], s: [s, s * 0.6, s], ink: false });
  }
  return bakeShared(p);
})();

let basketBaked: Baked | null = null;
let basketMeshGeo: THREE.BufferGeometry | null = null;
/**
 * A wire fry basket with a long handle and red grip toward the front (+z). Origin at the
 * basket's floor centre.
 */
export function makeBasket(): THREE.Group {
  const { w, d, h } = BASKET;
  if (!basketBaked) {
    const p = new Parts();
    const t = 0.035;
    const wire = "#6f7b80";
    const bar = (len: number, axis: "x" | "y" | "z", at: [number, number, number], th = t) =>
      p.add(box(axis === "x" ? len : th, axis === "y" ? len : th, axis === "z" ? len : th), wire, { p: at, ink: false });
    // Top rim (thicker) and floor frame.
    for (const y of [0, h]) {
      const th = y ? 0.05 : t;
      bar(w, "x", [0, y, -d / 2], th);
      bar(w, "x", [0, y, d / 2], th);
      bar(d, "z", [-w / 2, y, 0], th);
      bar(d, "z", [w / 2, y, 0], th);
    }
    // Middle hoop.
    bar(w, "x", [0, h / 2, -d / 2]);
    bar(w, "x", [0, h / 2, d / 2]);
    bar(d, "z", [-w / 2, h / 2, 0]);
    bar(d, "z", [w / 2, h / 2, 0]);
    // Uprights.
    for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) bar(h, "y", [x, h / 2, z]);
    for (const z of [-d / 6, d / 6]) for (const x of [-w / 2, w / 2]) bar(h, "y", [x, h / 2, z]);
    // Floor grid.
    for (const x of [-w / 4, 0, w / 4]) bar(d, "z", [x, 0, 0]);
    for (const z of [-d / 4, 0, d / 4]) bar(w, "x", [0, 0, z]);
    // Handle: a rod up and forward from the front rim, ending in a red grip.
    const rod = "#2b3134";
    p.add(box(0.07, 0.07, 0.62), rod, { p: [0, h + 0.12, d / 2 + 0.28], r: [0.38, 0, 0], ink: 0.014 });
    p.add(box(0.07, 0.07, 0.5), rod, { p: [0, h + 0.24, d / 2 + 0.78], ink: 0.014 });
    p.add(box(0.17, 0.16, 0.5), "#e5432b", { p: [0, h + 0.25, d / 2 + 1.2], ink: 0.02 });
    p.add(box(0.18, 0.05, 0.06), "#b8321f", { p: [0, h + 0.33, d / 2 + 1.0], ink: false });
    // Hanging hook at the back.
    p.add(box(0.24, 0.05, 0.05), rod, { p: [0, h + 0.08, -d / 2 - 0.04], ink: 0.012 });
    basketBaked = bakeShared(p);
    // The fine mesh between the wires: faint panels on the sides and floor.
    const panels: THREE.BufferGeometry[] = [];
    const side = (pw: number, ph: number, at: [number, number, number], ry: number) => {
      const g = new THREE.PlaneGeometry(pw, ph);
      g.rotateY(ry);
      g.translate(...at);
      panels.push(g);
    };
    side(w, h, [0, h / 2, d / 2], 0);
    side(w, h, [0, h / 2, -d / 2], Math.PI);
    side(d, h, [w / 2, h / 2, 0], Math.PI / 2);
    side(d, h, [-w / 2, h / 2, 0], -Math.PI / 2);
    const floor = new THREE.PlaneGeometry(w, d);
    floor.rotateX(-Math.PI / 2);
    panels.push(floor);
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const g of panels) {
      const n = g.index ? g.toNonIndexed() : g;
      pos.push(...(n.attributes.position.array as Float32Array));
    }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    merged.computeVertexNormals();
    basketMeshGeo = shareGeometry(merged);
  }
  const g = new THREE.Group();
  g.add(bakedMesh(basketBaked, { shadow: true }));
  const mesh = new THREE.Mesh(basketMeshGeo!, toon("#8e9a9e", { opacity: 0.3, side: THREE.DoubleSide }));
  mesh.renderOrder = 3;
  g.add(mesh);
  return g;
}

/** Potato freezer: a narrow chest freezer, lid propped open against the wall, heaped with frozen fries. */
export const FREEZER = { w: 1.6, d: 2.4, h: 0.55 };
const LID_TILT = -1.62;
let freezerBaked: Baked | null = null;
export function makeFreezer(): THREE.Group {
  const { w, d, h } = FREEZER;
  if (!freezerBaked) {
    const p = new Parts();
    p.add(box(w, h, d), "#eef3f4", { p: [0, h / 2, 0] });
    // Frosty blue stripe along the front.
    p.add(box(w + 0.01, 0.1, 0.02), "#7fb6d6", { p: [0, h * 0.55, d / 2 + 0.005], ink: false });
    // The well: a frosted inner floor just below the rim, and a rim frame.
    p.add(box(w - 0.24, 0.02, d - 0.24), "#b7d8e6", { p: [0, h - 0.04, 0], ink: false });
    const rim = "#d9e6ea";
    p.add(box(w, 0.05, 0.12), rim, { p: [0, h + 0.02, -d / 2 + 0.06], ink: 0.014 });
    p.add(box(w, 0.05, 0.12), rim, { p: [0, h + 0.02, d / 2 - 0.06], ink: 0.014 });
    p.add(box(0.12, 0.05, d - 0.24), rim, { p: [-w / 2 + 0.06, h + 0.02, 0], ink: 0.014 });
    p.add(box(0.12, 0.05, d - 0.24), rim, { p: [w / 2 - 0.06, h + 0.02, 0], ink: 0.014 });
    // Lid frame, swung up and leaning back against the wall.
    const lz = -d / 2 - 0.02;
    const tilt = LID_TILT;
    const lid = new Parts();
    lid.add(box(w - 0.02, 0.06, 0.1), "#dfe9ec", { p: [0, 0, 0.05] });
    lid.add(box(w - 0.02, 0.06, 0.1), "#dfe9ec", { p: [0, 0, d - 0.15] });
    lid.add(box(0.1, 0.06, d - 0.2), "#dfe9ec", { p: [-w / 2 + 0.06, 0, d / 2 - 0.05] });
    lid.add(box(0.1, 0.06, d - 0.2), "#dfe9ec", { p: [w / 2 - 0.06, 0, d / 2 - 0.05] });
    p.addParts(lid, { p: [0, h + 0.05, lz], r: [tilt, 0, 0] });
    freezerBaked = bakeShared(p);
  }
  const g = new THREE.Group();
  g.add(bakedMesh(freezerBaked));
  // Glass in the lid.
  const glass = new THREE.Mesh(FREEZER_GLASS, toon("#cfe9f5", { opacity: 0.45 }));
  glass.position.set(0, h + 0.05, -d / 2 - 0.02);
  glass.rotation.x = LID_TILT;
  g.add(glass);
  // Heaped frozen fries, well above the rim.
  const pile = makeFryPile(w - 0.3, d - 0.3, 5, 11);
  pile.userData.setCook(0);
  pile.position.y = h - 0.05;
  g.add(pile);
  return g;
}
const FREEZER_GLASS = (() => {
  const g = new THREE.PlaneGeometry(FREEZER.w - 0.2, FREEZER.d - 0.2);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.01, FREEZER.d / 2 - 0.05);
  return shareGeometry(g);
})();

/**
 * The packing station: a low steel shelf under a heat lamp with a big pad for each carton.
 * `spots` are pad centres relative to the shelf centre (z only). Origin on the floor.
 */
export const PAD = { w: 1.9, d: 1.38 };
export function makePackStation(w: number, d: number, spots: number[]): THREE.Mesh {
  const p = new Parts();
  p.add(box(w, 0.12, d), "#b8c2c0", { p: [0, 0.06, 0] });
  for (const z of spots) {
    p.add(box(PAD.w, 0.02, PAD.d), "#f3e9d3", { p: [0, 0.13, z], ink: false });
    // Border, so each pad reads as a target.
    const bw = 0.06;
    const col = "#e07a3a";
    p.add(box(PAD.w, 0.025, bw), col, { p: [0, 0.135, z - PAD.d / 2 + bw / 2], ink: false });
    p.add(box(PAD.w, 0.025, bw), col, { p: [0, 0.135, z + PAD.d / 2 - bw / 2], ink: false });
    p.add(box(bw, 0.025, PAD.d), col, { p: [-PAD.w / 2 + bw / 2, 0.135, z], ink: false });
    p.add(box(bw, 0.025, PAD.d), col, { p: [PAD.w / 2 - bw / 2, 0.135, z], ink: false });
  }
  return bakedMesh(p.bake());
}

/** A flat carton outline on an empty pad: "a carton goes here". Hidden once one does. */
const PAD_MARK = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.2, -0.28);
  s.lineTo(0.2, -0.28);
  s.lineTo(0.3, 0.28);
  s.quadraticCurveTo(0, 0.14, -0.3, 0.28);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  g.scale(1.25, 1, 1.25);
  return shareGeometry(g);
})();
export function makePadMark(): THREE.Mesh {
  const m = new THREE.Mesh(PAD_MARK, new THREE.MeshBasicMaterial({ color: "#eab9a0" }));
  m.position.y = 0.142;
  return m;
}

/** A salt shaker, for the fry station. */
export function makeShaker(): THREE.Mesh {
  const p = new Parts();
  p.add(cyl(0.15, 0.17, 0.42, 10), "#f2f4f3", { p: [0, 0.21, 0] });
  p.add(cyl(0.12, 0.16, 0.14, 10), "#aab4b6", { p: [0, 0.49, 0] });
  return bakedMesh(bakeShared(p));
}

/** A tub of cheese curds for poutine. */
export const CURD_TUB = { r: 0.38, h: 0.42 };
export function makeCurdTub(): THREE.Mesh {
  const p = new Parts();
  p.add(cyl(CURD_TUB.r, CURD_TUB.r * 0.88, CURD_TUB.h, 14), "#f3f6f6", { p: [0, CURD_TUB.h / 2, 0] });
  p.add(cyl(CURD_TUB.r + 0.02, CURD_TUB.r + 0.02, 0.07, 14), "#5e8fb8", { p: [0, CURD_TUB.h - 0.06, 0], ink: 0 });
  curdLumps(p, 16, CURD_TUB.r * 0.8, CURD_TUB.r * 0.8, CURD_TUB.h - 0.02, 5, 1.3);
  return bakedMesh(bakeShared(p));
}

/** A pot of hot gravy with a ladle resting in it. */
export const GRAVY_POT = { r: 0.4, h: 0.46 };
export function makeGravyPot(): THREE.Mesh {
  const p = new Parts();
  p.add(cyl(GRAVY_POT.r, GRAVY_POT.r * 0.95, GRAVY_POT.h, 14), STEEL, { p: [0, GRAVY_POT.h / 2, 0] });
  p.add(cyl(GRAVY_POT.r - 0.04, GRAVY_POT.r - 0.04, 0.02, 14), GRAVY, { p: [0, GRAVY_POT.h + 0.005, 0], ink: 0 });
  for (const s of [-1, 1]) p.add(box(0.12, 0.05, 0.1), "#3a3a3a", { p: [s * (GRAVY_POT.r + 0.05), GRAVY_POT.h - 0.08, 0] });
  // Ladle handle leaning on the rim.
  p.add(cyl(0.025, 0.025, 0.7, 6), "#9aa3a6", { p: [0.12, GRAVY_POT.h + 0.2, -0.12], r: [0.5, 0, -0.45] });
  return bakedMesh(bakeShared(p));
}

/** What you carry from the tub: a pinch of curds. */
export function makeCurdHandful(): THREE.Mesh {
  const p = new Parts();
  curdLumps(p, 7, 0.14, 0.12, 0.05, 9, 1.2);
  return bakedMesh(bakeShared(p));
}

/** A ladle of gravy, to pour over a carton. */
export function makeLadle(): THREE.Mesh {
  const p = new Parts();
  p.add(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "#c9d1cf", { p: [0, 0.17, 0] });
  p.add(cyl(0.15, 0.15, 0.02, 10), GRAVY, { p: [0, 0.16, 0], ink: 0 });
  p.add(cyl(0.025, 0.025, 0.8, 6), "#9aa3a6", { p: [0.3, 0.45, 0], r: [0, 0, 0.9] });
  return bakedMesh(bakeShared(p));
}
