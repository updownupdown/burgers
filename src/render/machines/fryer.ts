import * as THREE from "three";
import { bakedMesh, Parts, rng } from "../bake";
import { faceted, shareGeometry, toon } from "../materials";
import { STUDY } from "../units";
import { box, C, cached, machine, rbox, sideProfile } from "./kit";

/*
 * The twin-well fryer, dropped into the counter: only its deck shows, a hand's width proud of
 * the counter top, with two oil wells, a low sloped panel at the back (the fry meter for each
 * basket is drawn over it as UI, so there's one meter, not two) and a rail behind each well
 * where a lifted basket hangs tilted to drain, which is what "up" means. Study units below;
 * 5.0 x 5.5, 0.5 tall (the panel 1.1).
 */

const W = 5.0;
const D = 5.5;
/** Deck height above the counter: the cabinet and the depth of the wells are under it. */
const H = 0.5;
const WELL_W = 1.95;
const WELL_D = 2.4;
const WZ = 0.55;
const XS = [-1.2, 1.2];
/** The wells show down to the counter top; the oil sits just under the deck. */
const OIL_Y = H - 0.14;
/** Fry basket size. */
const BW = 1.75;
const BD = 2.05;
const BH = 0.9;
/** Basket floor height while frying, and the hanging pose on the rail. */
const DOWN_Y = 0.04;
const HANG = { y: H + 0.62, dz: -0.15, tilt: -0.42 };
/** The back panel: where it starts and ends (z) and how high its back edge stands. */
const PANEL = { z0: -2.65, z1: -1.15, lo: 0.15, hi: 0.6 };
const SLOPE = Math.atan2(PANEL.hi - PANEL.lo, PANEL.z1 - PANEL.z0);

const body = cached(() => {
  const p = new Parts();
  const hd = (D - 0.2) / 2;
  // The deck around the wells: back and front blocks, and the two ends and the middle between wells.
  const z0 = WZ - WELL_D / 2;
  const z1 = WZ + WELL_D / 2;
  p.add(box(W, H, z0 + hd), C.steel, { p: [0, H / 2, (-hd + z0) / 2] });
  p.add(box(W, H, hd - z1), C.steel, { p: [0, H / 2, (z1 + hd) / 2] });
  for (const [x, w] of [[-W / 2 + 0.07, 0.14], [0, 0.45], [W / 2 - 0.07, 0.14]]) p.add(box(w, H, WELL_D), C.steel, { p: [x, H / 2, WZ], ink: false });
  for (const cx of XS) {
    // Inside of the well: deep oil-brown, so the translucent oil on top reads golden and deep.
    p.add(box(WELL_W, 0.02, WELL_D), "#5e3d15", { p: [cx, 0.01, WZ], ink: false });
    for (const [w, d, x, z] of [[WELL_W, 0.02, 0, z0 + 0.01], [WELL_W, 0.02, 0, z1 - 0.01], [0.02, WELL_D, -WELL_W / 2 + 0.01, WZ], [0.02, WELL_D, WELL_W / 2 - 0.01, WZ]]) {
      p.add(box(w, H, d), "#7a5220", { p: [cx + x, H / 2, z], ink: false });
    }
    for (const [w, d, x, z] of [[WELL_W + 0.12, 0.06, 0, z0 - 0.03], [WELL_W + 0.12, 0.06, 0, z1 + 0.03], [0.06, WELL_D, -WELL_W / 2 - 0.03, WZ], [0.06, WELL_D, WELL_W / 2 + 0.03, WZ]]) {
      p.add(box(w, 0.035, d), "#3a4043", { p: [cx + x, H + 0.018, z], ink: false });
    }
  }
  // A low sloped panel across the back, dark where each basket's meter sits.
  p.add(sideProfile([[PANEL.z0, 0], [PANEL.z1, 0], [PANEL.z1, PANEL.lo], [PANEL.z0, PANEL.hi]], W), "#aeb8b6", { p: [0, H, 0] });
  // Hang rails: a bar behind each well on two posts, so a lifted basket drains into its own oil.
  for (const cx of XS) {
    p.add(faceted(new THREE.CylinderGeometry(0.05, 0.05, WELL_W, 10)), C.steelD, { p: [cx, H + 0.42, z0 - 0.1], r: [0, 0, Math.PI / 2] });
    for (const sx of [-1, 1]) p.add(box(0.07, 0.42, 0.07), C.steelD, { p: [cx + sx * (WELL_W / 2 - 0.05), H + 0.21, z0 - 0.1] });
    // A dark meter window on the panel.
    const mz = (PANEL.z0 + PANEL.z1) / 2;
    p.add(box(WELL_W - 0.1, 0.03, 0.5), C.rubber, { p: [cx, H + PANEL.lo + ((PANEL.hi - PANEL.lo) * (PANEL.z1 - mz)) / (PANEL.z1 - PANEL.z0) + 0.01, mz], r: [SLOPE, 0, 0], ink: false });
  }
  return p;
});

const OIL_GEO = shareGeometry(box(WELL_W * STUDY, 0.03 * STUDY, WELL_D * STUDY));
const bubbleGeo = cached(() => {
  const p = new Parts();
  const r = rng(5);
  const g = faceted(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let i = 0; i < 16; i++) {
    const s = 0.6 + r() * 0.9;
    p.add(g, "#fff1c4", { p: [(r() - 0.5) * (WELL_W - 0.3), 0, (r() - 0.5) * (WELL_D - 0.3)], s: [s, s * 0.6, s], ink: false });
  }
  return p;
});

export interface FryerObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Well centres, with the oil surface height. */
      wells: { x: number; z: number; oilY: number }[];
      /** Basket floor height while frying. */
      down: { y: number };
      /** Lifted basket hanging on the rail: position, and rotation.x = tilt. */
      hang: { x: number; y: number; z: number; tilt: number }[];
      /** Where each basket's meter goes: on the rim just in front of its well, below the fries. */
      meters: { x: number; y: number; z: number }[];
    };
    /** Bubbles on each well's oil; show them while a basket is down. */
    bubbles: THREE.Mesh[];
  };
}

/** The fryer, in game units: 3.33 x 3.67, 0.33 tall (the back panel 0.73), wells at x -0.8 and 0.8. */
export function makeFryer(): FryerObject {
  const g = new THREE.Group() as FryerObject;
  g.add(bakedMesh(body()));
  const bubbles: THREE.Mesh[] = [];
  XS.forEach((cx) => {
    const oil = new THREE.Mesh(OIL_GEO, toon("#e9b23f", { opacity: 0.62 }));
    oil.renderOrder = 2;
    oil.castShadow = false;
    oil.position.set(cx * STUDY, OIL_Y * STUDY, WZ * STUDY);
    g.add(oil);
    const b = new THREE.Mesh(bubbleGeo().geo, toon("#fff1c4"));
    b.position.set(cx * STUDY, (OIL_Y + 0.02) * STUDY, WZ * STUDY);
    b.visible = false;
    g.add(b);
    bubbles.push(b);
  });
  machine(g, W, D, H + PANEL.hi, {
    wells: XS.map((x) => ({ x: x * STUDY, z: WZ * STUDY, oilY: OIL_Y * STUDY })),
    down: { y: DOWN_Y * STUDY },
    hang: XS.map((x) => ({ x: x * STUDY, y: HANG.y * STUDY, z: (WZ + HANG.dz) * STUDY, tilt: HANG.tilt })),
    // Meters sit just in front of each well, below the fries, like every other meter in the kitchen.
    meters: XS.map((x) => ({ x: x * STUDY, y: H * STUDY, z: (WZ + WELL_D / 2 + 0.45) * STUDY })),
  });
  g.userData.bubbles = bubbles;
  return g;
}

const basket = cached(() => {
  const p = new Parts();
  const t = 0.04;
  const wire = "#6f7b80";
  const bar = (len: number, axis: "x" | "y" | "z", at: [number, number, number], th = t) =>
    p.add(box(axis === "x" ? len : th, axis === "y" ? len : th, axis === "z" ? len : th), wire, { p: at, ink: false });
  for (const y of [0, BH]) {
    const th = y ? 0.06 : t;
    bar(BW, "x", [0, y, -BD / 2], th);
    bar(BW, "x", [0, y, BD / 2], th);
    bar(BD, "z", [-BW / 2, y, 0], th);
    bar(BD, "z", [BW / 2, y, 0], th);
  }
  for (const x of [-BW / 2, -BW / 6, BW / 6, BW / 2]) for (const z of [-BD / 2, BD / 2]) bar(BH, "y", [x, BH / 2, z]);
  for (const z of [-BD / 6, BD / 6]) for (const x of [-BW / 2, BW / 2]) bar(BH, "y", [x, BH / 2, z]);
  for (const x of [-BW / 4, 0, BW / 4]) bar(BD, "z", [x, 0, 0]);
  // Handle forward to a red grip, and a hook at the back for the rail.
  p.add(box(0.08, 0.08, 0.7), "#2b3134", { p: [0, BH + 0.14, BD / 2 + 0.3], r: [0.4, 0, 0], ink: 0.012 });
  p.add(box(0.08, 0.08, 0.6), "#2b3134", { p: [0, BH + 0.28, BD / 2 + 0.88], ink: 0.012 });
  p.add(rbox(0.22, 0.2, 0.62, 0.06), "#e5432b", { p: [0, BH + 0.3, BD / 2 + 1.4], ink: 0.016 });
  p.add(box(0.3, 0.06, 0.24), "#2b3134", { p: [0, BH + 0.1, -BD / 2 - 0.1], ink: 0.012 });
  return p;
});

const MESH_GEO = (() => {
  const gs: THREE.BufferGeometry[] = [];
  const side = (pw: number, ph: number, at: [number, number, number], ry: number) => {
    const q = new THREE.PlaneGeometry(pw * STUDY, ph * STUDY);
    q.rotateY(ry);
    q.translate(at[0] * STUDY, at[1] * STUDY, at[2] * STUDY);
    gs.push(q);
  };
  side(BW, BH, [0, BH / 2, BD / 2], 0);
  side(BW, BH, [0, BH / 2, -BD / 2], Math.PI);
  side(BD, BH, [BW / 2, BH / 2, 0], Math.PI / 2);
  side(BD, BH, [-BW / 2, BH / 2, 0], -Math.PI / 2);
  const f = new THREE.PlaneGeometry(BW * STUDY, BD * STUDY);
  f.rotateX(-Math.PI / 2);
  gs.push(f);
  const pos: number[] = [];
  for (const q of gs) pos.push(...((q.index ? q.toNonIndexed() : q).attributes.position.array as Float32Array));
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  m.computeVertexNormals();
  return shareGeometry(m);
})();

/** Basket size in game units. */
export const FRY_BASKET = { w: BW * STUDY, d: BD * STUDY, h: BH * STUDY };

/**
 * A wire fry basket for the hang-rail fryer: origin at the basket floor centre, handle toward
 * +z, hook at the back. Game units 1.17 x 1.37 x 0.6. Put fries in it with
 * makeFryPile(FRY_BASKET.w - 0.1, FRY_BASKET.d - 0.1, 4, seed, true) at y 0.02.
 */
export function makeFryBasket(): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(basket()));
  const mesh = new THREE.Mesh(MESH_GEO, toon("#8e9a9e", { opacity: 0.28, side: THREE.DoubleSide }));
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  g.add(mesh);
  return g;
}
