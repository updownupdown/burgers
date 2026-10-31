import * as THREE from "three";
import { FRIES_PERFECT, FRIES_ZONE } from "../../game/cooking";
import { bakedMesh, Parts, rng } from "../bake";
import { faceted, shareGeometry, toon } from "../materials";
import { STUDY } from "../units";
import { box, C, cached, canvasTex, decal, FONT, machine, prism, rbox, sideProfile, studySpace, textDecal, topKnob } from "./kit";

/*
 * The twin-well fryer with a hang rail and panel (the study's fryer option b): one stainless
 * body with two wells, a sloped panel at the back carrying a long under / done / over meter per
 * basket with a white perfect line, and a rail behind each well where a lifted basket hangs
 * tilted to drain, which is what "up" means. Study units below; 5.0 x 5.5 x 4.6.
 */

const W = 5.0;
const D = 5.5;
/** Deck height. */
const H = 2.6;
const WELL_W = 1.95;
const WELL_D = 2.4;
const WZ = 0.55;
const XS = [-1.2, 1.2];
const OIL_Y = H - 0.45;
/** Fry basket size. */
const BW = 1.75;
const BD = 2.05;
const BH = 0.9;
/** Basket floor height while frying, and the hanging pose on the rail. */
const DOWN_Y = H - 1.1;
const HANG = { y: H + 0.22, dz: -0.15, tilt: -0.42 };
/** Meter range: fries cook from 0 to this along the meter. */
const METER_MAX = 1.5;
const SLOPE = Math.atan2(1.0, 1.5);

const body = cached(() => {
  const p = new Parts();
  const hd = (D - 0.2) / 2;
  p.add(box(W, 0.6, D - 0.2), C.steel, { p: [0, 0.3, 0] });
  // The deck around the wells: back and front blocks, and the two ends and the middle between wells.
  const z0 = WZ - WELL_D / 2;
  const z1 = WZ + WELL_D / 2;
  p.add(box(W, H - 0.6, z0 + hd), C.steel, { p: [0, 0.6 + (H - 0.6) / 2, (-hd + z0) / 2] });
  p.add(box(W, H - 0.6, hd - z1), C.steel, { p: [0, 0.6 + (H - 0.6) / 2, (z1 + hd) / 2] });
  for (const [x, w] of [[-W / 2 + 0.07, 0.14], [0, 0.45], [W / 2 - 0.07, 0.14]]) p.add(box(w, H - 0.6, WELL_D), C.steel, { p: [x, 0.6 + (H - 0.6) / 2, WZ], ink: false });
  for (const cx of XS) {
    // Inside of the well: deep oil-brown, so the translucent oil on top reads golden and deep.
    p.add(box(WELL_W, 0.02, WELL_D), "#5e3d15", { p: [cx, 0.61, WZ], ink: false });
    for (const [w, d, x, z] of [[WELL_W, 0.02, 0, z0 + 0.01], [WELL_W, 0.02, 0, z1 - 0.01], [0.02, WELL_D, -WELL_W / 2 + 0.01, WZ], [0.02, WELL_D, WELL_W / 2 - 0.01, WZ]]) {
      p.add(box(w, H - 0.6, d), "#7a5220", { p: [cx + x, 0.6 + (H - 0.6) / 2, z], ink: false });
    }
    for (const [w, d, x, z] of [[WELL_W + 0.12, 0.06, 0, z0 - 0.03], [WELL_W + 0.12, 0.06, 0, z1 + 0.03], [0.06, WELL_D, -WELL_W / 2 - 0.03, WZ], [0.06, WELL_D, WELL_W / 2 + 0.03, WZ]]) {
      p.add(box(w, 0.035, d), "#3a4043", { p: [cx + x, H + 0.018, z], ink: false });
    }
  }
  // The sloped control panel across the back.
  p.add(sideProfile([[-2.65, 0], [-1.15, 0], [-1.15, 0.25], [-2.65, 1.25]], W), "#aeb8b6", { p: [0, H, 0] });
  // Hang rails: a bar behind each well on two posts, so a lifted basket drains into its own oil.
  for (const cx of XS) {
    p.add(faceted(new THREE.CylinderGeometry(0.05, 0.05, WELL_W, 10)), C.steelD, { p: [cx, H + 0.42, z0 - 0.1], r: [0, 0, Math.PI / 2] });
    for (const sx of [-1, 1]) p.add(box(0.07, 0.42, 0.07), C.steelD, { p: [cx + sx * (WELL_W / 2 - 0.05), H + 0.21, z0 - 0.1] });
  }
  // Front: drain doors with red valve handles, and a knob per well on the front deck.
  for (const cx of XS) {
    p.add(box(1.5, H - 1.1, 0.03), "#b7c0be", { p: [cx, (H - 0.3) / 2, hd + 0.01], ink: 0.012 });
    p.add(rbox(0.5, 0.12, 0.14, 0.05), "#e5432b", { p: [cx, 0.9, hd + 0.08] });
    topKnob(p, cx - 0.75, H + 0.05, 1.95, 0.16, C.knob, 0.5);
  }
  return p;
});

/** Under / done / over / burnt bands, with the perfect line, along a dark rounded plate. */
let meterTexture: THREE.CanvasTexture | null = null;
function meterTex(): THREE.CanvasTexture {
  meterTexture ??= canvasTex(512, 96, (x, w, h) => {
    const f = (t: number) => t / METER_MAX;
    const zones: [number, number, string][] = [
      [0, f(FRIES_ZONE.done), "#f4ecc4"],
      [f(FRIES_ZONE.done), f(FRIES_ZONE.over), "#f2b632"],
      [f(FRIES_ZONE.over), f(FRIES_ZONE.burnt), "#a8622a"],
      [f(FRIES_ZONE.burnt), 1, "#3a2418"],
    ];
    x.fillStyle = "#2d3336";
    x.beginPath();
    x.roundRect(0, 0, w, h, 22);
    x.fill();
    const pad = 12;
    for (const [a, b, c] of zones) {
      x.fillStyle = c;
      x.fillRect(pad + a * (w - 2 * pad), pad, (b - a) * (w - 2 * pad), h - 2 * pad);
    }
    const pf = f(FRIES_PERFECT) * (w - 2 * pad) + pad;
    x.fillStyle = "#ffffff";
    x.fillRect(pf - 4, 4, 8, h - 8);
    x.font = `800 26px ${FONT}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "#6b5a2a";
    x.fillText("UNDER", pad + (f(FRIES_ZONE.done) / 2) * (w - 2 * pad), h / 2);
    x.fillStyle = "#fff7e0";
    x.fillText("OVER", pad + ((f(FRIES_ZONE.over) + f(FRIES_ZONE.burnt)) / 2) * (w - 2 * pad), h / 2);
  });
  return meterTexture;
}

const cursor = cached(() => new Parts().add(prism([[-0.07, -0.05], [0.07, -0.05], [0, 0.08]], 0.05), "#ffffff", { ink: 0.012 }));

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
      /** Panel meter centres. */
      meters: { x: number; y: number; z: number }[];
    };
    /** Bubbles on each well's oil; show them while a basket is down. */
    bubbles: THREE.Mesh[];
    /** Move the cursor on panel meter i to a fries cook value (0..1.5, FRIES_ZONE scale). */
    setMeter: (i: number, cook: number) => void;
  };
}

/** The fryer, in game units: 3.33 x 3.67, 3.07 tall, wells at x -0.8 and 0.8. */
export function makeFryer(): FryerObject {
  const g = new THREE.Group() as FryerObject;
  g.add(bakedMesh(body()));
  const st = studySpace();
  g.add(st);
  const sy = (z: number) => H + 0.25 + (-z - 1.15) / 1.5 + 0.012;
  const cursors: THREE.Object3D[] = [];
  const bubbles: THREE.Mesh[] = [];
  XS.forEach((cx, i) => {
    const m = decal(meterTex(), 1.85, 0.36);
    m.position.set(cx, sy(-1.9), -1.9);
    m.rotation.x = SLOPE;
    st.add(m);
    const cur = bakedMesh(cursor());
    cur.scale.setScalar(1.7 / STUDY);
    cur.rotation.x = SLOPE + Math.PI / 2 - 0.2;
    cur.position.set(cx, sy(-1.62), -1.62);
    st.add(cur);
    cursors.push(cur);
    const lbl = textDecal(`BASKET ${i + 1}`, 0.12, { bg: "rgba(0,0,0,0)", color: "#4b5558", fs: 54 });
    lbl.position.set(cx, sy(-2.25), -2.25);
    lbl.rotation.x = SLOPE;
    st.add(lbl);
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
  machine(g, W, D, 4.6, {
    wells: XS.map((x) => ({ x: x * STUDY, z: WZ * STUDY, oilY: OIL_Y * STUDY })),
    down: { y: DOWN_Y * STUDY },
    hang: XS.map((x) => ({ x: x * STUDY, y: HANG.y * STUDY, z: (WZ + HANG.dz) * STUDY, tilt: HANG.tilt })),
    meters: XS.map((x) => ({ x: x * STUDY, y: sy(-1.9) * STUDY, z: -1.9 * STUDY })),
  });
  g.userData.bubbles = bubbles;
  g.userData.setMeter = (i, cook) => {
    const c = cursors[i];
    if (!c) return;
    const f = Math.max(0, Math.min(1, cook / METER_MAX)) - 0.5;
    c.position.x = XS[i] + f * 1.66;
  };
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
