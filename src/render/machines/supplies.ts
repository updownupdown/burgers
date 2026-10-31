import * as THREE from "three";
import type { Size } from "../../game/types";
import { bakedMesh, Parts } from "../bake";
import { STUDY } from "../units";
import { box, cached, cyl, machine, rbox, studySpace, textDecal } from "./kit";

/*
 * Supplies and pass pieces from the study: the stepped wire rack (supplies option b, with only
 * the sleeves the game uses, no decorative stock boxes), wrapped sleeves, the fryer's packing
 * pads and the trash chute. Study units below.
 */

export type SleeveKind = "cup" | "carton";
const SIZE_K: Record<Size, number> = { S: 0.82, M: 0.92, L: 1 };
const SLEEVE_LEN = 1.25;

const sleeveParts = (kind: SleeveKind, size: Size) => {
  const p = new Parts();
  const k = SIZE_K[size];
  const len = SLEEVE_LEN;
  if (kind === "cup") {
    const r = 0.42 * k;
    p.add(cyl(r, r * 0.9, len, 20), "#f6f3ec", { r: [0, 0, Math.PI / 2], p: [0, r, 0] });
    for (let i = 0; i < 4; i++) p.add(cyl(r + 0.012, r + 0.012, 0.04, 20), "#ddd6c8", { r: [0, 0, Math.PI / 2], p: [-len / 2 + 0.2 + (i * (len - 0.4)) / 3, r, 0], ink: false });
    p.add(cyl(r * 0.92, r * 0.92, 0.02, 20), "#e5573f", { r: [0, 0, Math.PI / 2], p: [len / 2 + 0.005, r, 0], ink: false });
  } else {
    const w = 0.62 * k;
    const h = 0.55 * k;
    p.add(rbox(len, h, w, 0.06), "#3f78c8", { p: [0, h / 2, 0] });
    for (let i = 0; i < 4; i++) p.add(box(0.05, h + 0.01, w + 0.01), "#f4ecd8", { p: [-len / 2 + 0.2 + (i * (len - 0.4)) / 3, h / 2, 0], ink: false });
  }
  // Plastic wrap sheen.
  p.add(box(len * 0.8, 0.01, 0.08), "#ffffff", { p: [0, (kind === "cup" ? 0.84 : 0.56) * k, -0.08], ink: false });
  return p;
};
const SLEEVES = new Map<string, ReturnType<typeof cached>>();
const sleeveBaked = (kind: SleeveKind, size: Size) => {
  const key = kind + size;
  let b = SLEEVES.get(key);
  if (!b) SLEEVES.set(key, (b = cached(() => sleeveParts(kind, size))));
  return b();
};

/** A wrapped sleeve of cups or paper boats lying along z, its size letter on top. Game units, about 0.83 long. */
export function makeSleeve(kind: SleeveKind, size: Size): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  inner.add(bakedMesh(sleeveBaked(kind, size)));
  const st = studySpace();
  const t = textDecal(size, 0.32, { bg: "#3b2a3a", color: "#ffffff", fs: 64, w: 90, h: 90 });
  t.position.set(0, (kind === "cup" ? 0.85 : 0.56) * SIZE_K[size] + 0.01, 0);
  st.add(t);
  inner.add(st);
  g.add(inner);
  return g;
}

// ---- wire rack ------------------------------------------------------------------

const TD = 1.35;
const TIERS = [
  { y: 0.25, z: 0.72 },
  { y: 1.35, z: -0.72 },
];

type Bay = { kind: SleeveKind; size: Size; x: number; y: number; z: number };

export interface WireRackObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Cup S, M, L on the low front tier, then carton S, M, L on the raised back tier. */
      bays: Bay[];
      /** Width of one bay. */
      bayW: number;
    };
    /** Show 0 to 2 sleeves in bay i. */
    setBay: (i: number, count: number) => void;
  };
}

/** Two-tier chrome wire rack with a labelled bay per size. Game units: w (default 6.0) x 1.93, 1.47 tall. */
export function makeWireRack(o: { w?: number } = {}): WireRackObject {
  const W = (o.w ?? 6.0) / STUDY;
  const bayW = W / 3;
  const g = new THREE.Group() as WireRackObject;
  const p = new Parts();
  for (const x of [-W / 2, W / 2]) {
    p.add(cyl(0.05, 0.05, 0.3, 8), "#b7c0c2", { p: [x, 0.15, 1.38] });
    p.add(cyl(0.05, 0.05, 2.0, 8), "#b7c0c2", { p: [x, 1.0, 0.02] });
    p.add(cyl(0.05, 0.05, 2.0, 8), "#b7c0c2", { p: [x, 1.0, -1.38] });
  }
  for (const t of TIERS) {
    p.add(box(W, 0.05, TD), "#cfd6d8", { p: [0, t.y, t.z], ink: 0.01 });
    const n = Math.round(W / 0.5);
    for (let i = 0; i <= n; i++) p.add(box(0.025, 0.03, TD), "#9aa5a8", { p: [-W / 2 + (i * W) / n, t.y + 0.03, t.z], ink: false });
    p.add(box(W, 0.2, 0.04), "#cfd6d8", { p: [0, t.y + 0.08, t.z + TD / 2], ink: 0.01 });
    // Wire dividers between bays.
    for (const x of [-bayW / 2, bayW / 2]) p.add(box(0.04, 0.45, TD), "#b7c0c2", { p: [x, t.y + 0.22, t.z], ink: false });
  }
  g.add(bakedMesh(new Parts().addParts(p, { s: STUDY }).bake()));
  const st = studySpace();
  g.add(st);
  const bays: Bay[] = [];
  const sleeves: THREE.Object3D[][] = [];
  (["cup", "carton"] as SleeveKind[]).forEach((kind, j) => {
    const t = TIERS[j];
    (["S", "M", "L"] as Size[]).forEach((size, i) => {
      const x = (i - 1) * bayW;
      bays.push({ kind, size, x: x * STUDY, y: (t.y + 0.05) * STUDY, z: (t.z - 0.05) * STUDY });
      const list: THREE.Object3D[] = [];
      for (const dx of [-0.21, 0.21]) {
        const s = makeSleeve(kind, size);
        s.position.set((x + dx * bayW) * STUDY, (t.y + 0.05) * STUDY, (t.z - 0.05) * STUDY);
        g.add(s);
        list.push(s);
      }
      sleeves.push(list);
      // Label on the shelf lip, tipped back toward the steep camera.
      const d = textDecal(`${kind === "cup" ? "CUP" : "BOAT"} ${size}`, 0.3, { up: false, bg: kind === "cup" ? "#e4f1f6" : "#dfe8f7", color: "#3b2a3a", fs: 52 });
      d.position.set(x, t.y + 0.12, t.z + TD / 2 + 0.04);
      d.rotation.x = -0.9;
      st.add(d);
    });
  });
  machine(g, W, 2.9, 2.2, { bays, bayW: bayW * STUDY });
  g.userData.setBay = (i, count) => sleeves[i]?.forEach((s, k) => (s.visible = k < count));
  return g;
}

// ---- packing pads, trash chute --------------------------------------------------

const PAD = { w: 2.2, d: 1.6, gap: 1.9 };

export interface PackPadObject extends THREE.Group {
  userData: { footprint: { w: number; d: number }; h: number; spots: { pads: { x: number; y: number; z: number }[] } };
}

const padBody = cached(() => {
  const p = new Parts();
  const w = PAD.w * 2 + 0.4;
  p.add(rbox(w, 0.16, PAD.d + 0.4, 0.04), "#b8c2c0", { p: [0, 0.08, 0] });
  for (const x of [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15]) {
    p.add(box(PAD.w, 0.02, PAD.d), "#f3e9d3", { p: [x, 0.17, 0], ink: false });
    for (const [bw, bd, dx, dz] of [[PAD.w, 0.06, 0, -PAD.d / 2 + 0.03], [PAD.w, 0.06, 0, PAD.d / 2 - 0.03], [0.06, PAD.d, -PAD.w / 2 + 0.03, 0], [0.06, PAD.d, PAD.w / 2 - 0.03, 0]]) {
      p.add(box(bw, 0.025, bd), "#e07a3a", { p: [x + dx, 0.18, dz], ink: false });
    }
  }
  return p;
});

/** Two packing pads side by side along x, in game units 3.2 x 1.33. No heat glow: the heat is assumed to come from below. */
export function makePackPad(): PackPadObject {
  const g = new THREE.Group() as PackPadObject;
  g.add(bakedMesh(padBody()));
  const xs = [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15];
  machine(g, PAD.w * 2 + 0.4, PAD.d + 0.4, 0.2, { pads: xs.map((x) => ({ x: x * STUDY, y: 0.19 * STUDY, z: 0 })) });
  return g;
}

/** A trash chute along a counter's front edge, `w` game units long and 0.4 deep, with a steel lip and grate bars. */
export function makeTrashChute(w: number): THREE.Group {
  const sw = w / STUDY;
  const p = new Parts();
  p.add(box(sw, 0.04, 0.5), "#1e2422", { p: [0, 0.02, 0], ink: false });
  p.add(box(sw + 0.1, 0.06, 0.08), "#8d9a97", { p: [0, 0.04, -0.27], ink: false });
  p.add(box(sw + 0.1, 0.06, 0.08), "#8d9a97", { p: [0, 0.04, 0.27], ink: false });
  for (let i = 1; i < Math.round(sw / 1.2); i++) p.add(box(0.05, 0.05, 0.5), "#8d9a97", { p: [-sw / 2 + i * 1.2, 0.04, 0], ink: false });
  const g = new THREE.Group();
  const m = bakedMesh(new Parts().addParts(p, { s: STUDY }).bake(), { shadow: false });
  g.add(m);
  machine(g, sw, 0.6, 0.1, {});
  return g;
}
