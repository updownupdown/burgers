import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { STUDY } from "../units";
import { box, cached, cyl, machine, rbox } from "./kit";

/*
 * Pass pieces: the fryer's packing pads and the trash chute along each counter's front edge.
 * Study units below unless noted. (The supply shelf and its sleeves went with Supplies, and this
 * file kept the two pieces still in the kitchen; DESIGN §52.)
 */

const PAD = { w: 2.2, d: 1.6, gap: 1.9 };

export interface PackPadObject extends THREE.Group {
  userData: { footprint: { w: number; d: number }; h: number; spots: { pads: { x: number; y: number; z: number }[] } };
}

const padBody = cached(() => {
  const p = new Parts();
  const w = PAD.w * 2 + 0.4;
  // A small steel dump station (DESIGN §45): a rolled rim, a dark warming plate, and a sheet of
  // greaseproof paper on each pad, a little askew, in the same vocabulary as the trays and fryer.
  p.add(rbox(w, 0.16, PAD.d + 0.4, 0.04), "#c9d1cf", { p: [0, 0.08, 0] });
  p.add(rbox(w - 0.16, 0.05, PAD.d + 0.24, 0.03), "#3a4043", { p: [0, 0.165, 0], ink: false });
  for (const [i, x] of [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15].entries()) {
    p.add(box(PAD.w - 0.1, 0.01, PAD.d - 0.1), "#f3e9d3", { p: [x, 0.195, 0], r: [0, i ? -0.05 : 0.04, 0], ink: 0.01 });
  }
  // A row of small vent dots along the front lip.
  for (let i = 0; i < 9; i++) p.add(cyl(0.025, 0.025, 0.01, 6), "#8a9290", { p: [-w / 2 + 0.3 + (i * (w - 0.6)) / 8, 0.165, PAD.d / 2 + 0.16], ink: false });
  return p;
});

/** Two packing pads side by side along x, in game units 3.2 x 1.33. No heat glow: the heat is assumed to come from below. */
export function makePackPad(): PackPadObject {
  const g = new THREE.Group() as PackPadObject;
  g.add(bakedMesh(padBody()));
  const xs = [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15];
  machine(g, PAD.w * 2 + 0.4, PAD.d + 0.4, 0.2, { pads: xs.map((x) => ({ x: x * STUDY, y: 0.2 * STUDY, z: 0 })) });
  return g;
}

/**
 * A trash chute along a counter's front edge, `w` game units long and `d` deep: a dark slot in a
 * steel lip, closed by two rows of black rubber flaps that meet in the middle (they part as trash
 * drops through), with rounded steel end caps.
 */
export function makeTrashChute(w: number, d = 0.45): THREE.Group {
  const sw = w / STUDY;
  const sd = d / STUDY;
  const lip = 0.16;
  const p = new Parts();
  p.add(box(sw, 0.03, sd), "#2a2329", { p: [0, 0.01, 0], ink: false });
  for (const k of [-1, 1]) {
    p.add(box(sw + 0.04, 0.1, lip), "#d3d7d4", { p: [0, 0.05, k * (sd / 2 + lip / 2)], ink: false });
    p.add(box(sw + 0.04, 0.09, 0.045), "#6b716e", { p: [0, 0.045, k * (sd / 2 + lip + 0.022)], ink: false });
  }
  // Two rows of rubber flaps, back row a shade lighter, with hairline splits between them.
  const n = Math.max(1, Math.round(sw / 0.36));
  const fw = sw / n;
  const fd = sd / 2 - 0.025;
  for (let i = 0; i < n; i++) {
    const x = -sw / 2 + fw * (i + 0.5);
    p.add(box(fw - 0.06, 0.03, fd), "#4a4148", { p: [x, 0.045, -sd / 4 - 0.012], ink: false });
    p.add(box(fw - 0.06, 0.03, fd), "#3d353b", { p: [x, 0.04, sd / 4 + 0.012], ink: false });
  }
  // Rounded steel end caps: the chute stops just inside the outer counters, bookending the line.
  const r = sd / 2 + lip;
  for (const k of [-1, 1]) {
    const arc = (rr: number, h: number) => new THREE.CylinderGeometry(rr, rr, h, 24, 1, false, k < 0 ? Math.PI : 0, Math.PI);
    p.add(arc(r + 0.045, 0.09), "#6b716e", { p: [k * (sw / 2 + 0.02), 0.045, 0], ink: false });
    p.add(arc(r, 0.1), "#d3d7d4", { p: [k * (sw / 2 + 0.02), 0.05, 0], ink: false });
  }
  const g = new THREE.Group();
  // Unlit, so the slot stays properly dark and the steel lip bright under the kitchen's soft light.
  const m = bakedMesh(new Parts().addParts(p, { s: STUDY }).bake(), { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true }) });
  g.add(m);
  machine(g, sw, sd + lip * 2, 0.1, {});
  return g;
}
