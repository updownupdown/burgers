import * as THREE from "three";
import type { Kind } from "../../game/types";
import { bakedMesh, bakeShared, Parts, type Baked } from "../bake";
import { heapParts, PAN } from "../heaps";
import { STUDY } from "../units";
import { box, C, machine, rbox, toGame } from "./kit";

/*
 * The stepped cold rail (the study's topping-bin option b): a stainless refrigerated body with
 * the pans sunk flush, each row further back stepped up so it faces the steep camera, a cold
 * blue line under the pans. The 3 x 3 block is the grill page's
 * prep unit. Slots without a kind get a steel cover, which is where the sauce caddy can stand.
 * Study units below: a pan is a 1/6 hotel pan, 16 x 17.5 cm.
 */

const PW = 1.6;
const PD = 1.75;
const PX = 1.68;
const PZ = 1.9;
/** Front row rim height, how much each row further back steps up, and pan depth. */
const H = 0.9;
const STEP = 0.35;
const PH = 0.5;
const LID = 0.6;

export interface PanSpot {
  x: number;
  /** Rim height: the top of the heap, roughly. */
  y: number;
  z: number;
  /** Floor of the pan. */
  floor: number;
  kind: Kind | null;
}

export interface ColdRailObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Back row first, left to right. */
      pans: PanSpot[];
      /** Pan size in game units. */
      pan: { w: number; d: number };
      /** Where the sauce caddy stands: on the cover of the last empty slot, or null when every slot has a kind. */
      caddy: { x: number; y: number; z: number } | null;
    };
  };
}

function railBody(cols: number, rows: number, filled: boolean[]): Parts {
  const p = new Parts();
  const lastEmpty = filled.lastIndexOf(false);
  const W = cols * PX;
  const zOf = (j: number) => (j - (rows - 1) / 2) * PZ + LID / 2;
  const xOf = (i: number) => (i - (cols - 1) / 2) * PX;
  for (let j = 0; j < rows; j++) {
    const top = H + (rows - 1 - j) * STEP;
    const bh = top - PH + 0.04;
    const z = zOf(j);
    p.add(rbox(W + 0.3, bh, PZ, 0.04), C.steel, { p: [0, bh / 2, z] });
    p.add(box(W, 0.03, PZ - 0.1), "#7fb6d6", { p: [0, bh + 0.01, z], ink: false });
    // Surround at rim height: front and back lips and the two ends.
    p.add(box(W + 0.3, PH, 0.1), C.steel, { p: [0, bh + PH / 2 - 0.02, z + PZ / 2 - 0.05] });
    p.add(box(W + 0.3, PH, 0.1), C.steel, { p: [0, bh + PH / 2 - 0.02, z - PZ / 2 + 0.05] });
    for (const sx of [-1, 1]) p.add(box(0.15, PH, PZ), C.steel, { p: [sx * (W / 2 + 0.075), bh + PH / 2 - 0.02, z] });
    for (let i = 0; i < cols; i++) {
      const x = xOf(i);
      const y = top - PH + 0.06;
      if (!filled[j * cols + i]) {
        // A lidded pan in an unused slot: a brushed steel lid with a pressed panel and a handle (a
        // flat white cover read as an empty pan). The last one stays flat: the sauce caddy stands on it.
        p.add(box(PW, 0.08, PD), "#b9c1c2", { p: [x, top - 0.02, z], ink: 0.012 });
        p.add(box(PW - 0.3, 0.012, PD - 0.3), "#cbd2d2", { p: [x, top + 0.026, z], ink: false });
        if (j * cols + i !== lastEmpty) {
          p.add(box(0.7, 0.07, 0.14), "#8f989a", { p: [x, top + 0.06, z], ink: 0.012 });
          for (const sx of [-0.3, 0.3]) p.add(box(0.1, 0.06, 0.12), "#8f989a", { p: [x + sx, top + 0.03, z], ink: false });
        }
        continue;
      }
      const t = 0.06;
      p.add(box(PW - 0.04, 0.06, PD - 0.04), "#8fa39e", { p: [x, y + 0.03, z], ink: false });
      for (const [bw, bd, px, pz] of [[PW, t, 0, -PD / 2 + t / 2], [PW, t, 0, PD / 2 - t / 2], [t, PD - 2 * t, -PW / 2 + t / 2, 0], [t, PD - 2 * t, PW / 2 - t / 2, 0]]) {
        p.add(box(bw, PH, bd), "#d3dcd9", { p: [x + px, y + PH / 2, z + pz], ink: 0.012 });
      }
      p.add(box(PW + 0.06, 0.04, 0.1), "#e3e8e6", { p: [x, y + PH, z - PD / 2], ink: false });
      p.add(box(PW + 0.06, 0.04, 0.1), "#e3e8e6", { p: [x, y + PH, z + PD / 2], ink: false });
    }
  }
  // A bright front bevel. (No lid behind: James found the open lids read as clutter.)
  p.add(box(W + 0.3, 0.12, 0.08), "#e3e8e6", { p: [0, H + 0.06, zOf(rows - 1) + PZ / 2] });
  return p;
}

const cache = new Map<string, Baked>();

/**
 * A cold rail of `cols` x `rows` pans. `kinds` fill the slots back row first, left to right;
 * null or missing entries get a steel cover. Game units: (cols * 1.12 + 0.2) x (rows * 1.27 + 0.4).
 */
export function makeColdRail(o: { cols?: number; rows?: number; kinds?: (Kind | null)[] } = {}): ColdRailObject {
  const cols = o.cols ?? 3;
  const rows = o.rows ?? 3;
  const kinds = Array.from({ length: cols * rows }, (_, i) => o.kinds?.[i] ?? null);
  const key = `${cols}x${rows}:${kinds.join(",")}`;
  const zOf = (j: number) => (j - (rows - 1) / 2) * PZ + LID / 2;
  const xOf = (i: number) => (i - (cols - 1) / 2) * PX;
  const pans: PanSpot[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const top = H + (rows - 1 - j) * STEP;
      pans.push({ x: xOf(i) * STUDY, y: top * STUDY, z: zOf(j) * STUDY, floor: (top - PH + 0.12) * STUDY, kind: kinds[j * cols + i] });
    }
  }
  let b = cache.get(key);
  if (!b) {
    const all = toGame(railBody(cols, rows, kinds.map((k) => !!k)));
    // Heaps from the bins, fitted to the 1/6 pans: their pan is 1.18 x 1.0, these are 1.07 x 1.17.
    const sx = (PW * STUDY) / PAN.w;
    const sz = (PD * STUDY) / PAN.d;
    // Fitted evenly (no squash), so a piece in the pan is the size of the one you pull out.
    const fit = Math.min(sx, sz) * 0.95;
    for (const s of pans) if (s.kind) all.addParts(heapParts(s.kind), { p: [s.x, s.floor - PAN.floor, s.z], s: fit });
    b = bakeShared(all);
    cache.set(key, b);
  }
  const g = new THREE.Group() as ColdRailObject;
  g.add(bakedMesh(b));
  let caddy: ColdRailObject["userData"]["spots"]["caddy"] = null;
  for (const s of pans) if (!s.kind) caddy = { x: s.x, y: s.y + 0.02 * STUDY, z: s.z };
  machine(g, cols * PX + 0.3, rows * PZ + LID, H + (rows - 1) * STEP + 0.9, { pans, pan: { w: PW * STUDY, d: PD * STUDY }, caddy });
  return g;
}

/** The grill page's prep unit: a 3 x 3 cold rail. Game units 3.56 x 4.2. */
export function makePrepUnit(o: { kinds?: (Kind | null)[] } = {}): ColdRailObject {
  return makeColdRail({ cols: 3, rows: 3, kinds: o.kinds });
}
