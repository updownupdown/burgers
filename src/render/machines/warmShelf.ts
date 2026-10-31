import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { box, C, cached, cyl, machine, rbox, studyMesh, tor } from "./kit";
import { STUDY } from "../units";

/*
 * The warm shelf (the study's heat-lamp option a): a low steel shelf heated from underneath,
 * with three hold plates in a row along x so they line up under the tray plates. James asked
 * for no orange heat dots or glow: the heat is assumed to come from below, and staleness
 * shows in the UI. Study units below.
 */

const W = 6.0;
const D = 2.1;
const TOP = 0.3;
const PITCH = 1.95;
const PLATE_R = 0.9;

const shelf = cached(() => {
  const p = new Parts();
  p.add(rbox(W, TOP, D, 0.05), "#b8c2c0", { p: [0, TOP / 2, 0] });
  // A slightly darker heated deck inset in the top, and a bright front bevel.
  p.add(box(W - 0.24, 0.01, D - 0.24), "#a9b2b0", { p: [0, TOP + 0.005, 0], ink: false });
  p.add(box(W, 0.04, 0.04), "#eef2f1", { p: [0, TOP - 0.02, D / 2 + 0.01], ink: false });
  // A small rocker switch and pilot on the front edge, so it reads as a heated unit.
  p.add(rbox(0.36, 0.16, 0.06, 0.03), C.steelD, { p: [W / 2 - 0.45, TOP / 2, D / 2 + 0.02], ink: 0.01 });
  p.add(cyl(0.035, 0.035, 0.02, 8), "#f2a33a", { p: [W / 2 - 0.8, TOP / 2, D / 2 + 0.02], r: [Math.PI / 2, 0, 0], ink: false });
  return p;
});

const plates = cached(() => {
  const p = new Parts();
  for (const x of [-PITCH, 0, PITCH]) {
    p.add(cyl(PLATE_R, PLATE_R - 0.12, 0.08, 30), "#f7f4ec", { p: [x, TOP + 0.04, 0] });
    p.add(tor(PLATE_R - 0.07, 0.03, 4, 30), "#e4dccb", { p: [x, TOP + 0.085, 0], r: [Math.PI / 2, 0, 0], ink: false });
  }
  return p;
});

export interface WarmShelfObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Plate centres, left to right, at the plate's top. */
      plates: { x: number; y: number; z: number }[];
      /** Plate radius. */
      plateR: number;
    };
  };
}

/**
 * The warm shelf, in game units: 4.0 x 1.4, 0.2 tall, plates 1.3 apart. `plates: false` leaves
 * the plates off for callers that draw their own. `legs` (game units) hangs two posts below it,
 * for a shelf mounted that high over the back of the griddle: place the shelf at y = legs.
 */
export function makeWarmShelf(o: { plates?: boolean; legs?: number } = {}): WarmShelfObject {
  const g = new THREE.Group() as WarmShelfObject;
  g.add(bakedMesh(shelf()));
  if (o.plates !== false) g.add(bakedMesh(plates()));
  if (o.legs) {
    const legs = o.legs / STUDY;
    const p = new Parts();
    for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) {
      p.add(box(0.2, legs, 0.2), C.steelD, { p: [x, -legs / 2, -D / 2 + 0.15] });
      p.add(box(0.5, 0.06, 0.5), C.steelD, { p: [x, -legs + 0.03, -D / 2 + 0.25] });
    }
    g.add(studyMesh(p));
  }
  const y = (TOP + 0.09) * STUDY;
  machine(g, W, D, TOP + (o.plates === false ? 0 : 0.09), {
    plates: [-PITCH, 0, PITCH].map((x) => ({ x: x * STUDY, y, z: 0 })),
    plateR: PLATE_R * STUDY,
  });
  return g;
}
