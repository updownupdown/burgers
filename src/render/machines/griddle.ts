import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { box, C, cached, cyl, glow, glowMat, knob, machine, rbox, sideProfile, studySpace, textDecal } from "./kit";
import { STUDY } from "../units";

/*
 * The stainless countertop griddle (the study's grill option b): splash guards at the back and
 * sides, a grease trough along the front, a knob per zone with a pilot light, a warm zone on
 * the right behind a raised steel rail, and a red-handled smash press resting at the back left.
 * Study units below; 6.0 x 5.5 x 2.6 (60 x 55 cm).
 */

const W = 6.0;
const D = 5.5;
/** Cook surface height. */
const TOP = 1.3;
/** Warm zone: everything right of this x, behind the rail. */
const WARM_X = 1.1;
const PRESS_AT: [number, number] = [-2.15, -1.85];

const body = cached(() => {
  const p = new Parts();
  for (const x of [-2.7, 2.7]) for (const z of [-2.2, 2.0]) p.add(cyl(0.12, 0.14, 0.22, 10), C.rubber, { p: [x, 0.11, z] });
  p.add(rbox(W, 1.05, D - 0.5, 0.05), C.steel, { p: [0, 0.74, -0.1] });
  p.add(box(W - 0.3, 0.62, 0.05), "#aeb8b6", { p: [0, 0.68, 2.41], ink: 0.01 });
  // The plate, with faint brushed bands so it reads as steel from above.
  p.add(box(W - 0.2, 0.12, D - 1.0), "#43484b", { p: [0, TOP - 0.06, -0.3] });
  for (let i = 0; i < 7; i++) p.add(box(W - 0.5, 0.004, 0.08), "#53595c", { p: [0, TOP + 0.002, -2.3 + i * 0.62], ink: false });
  // Warm zone: the right 30%, a cooler grey, behind a low steel rail.
  p.add(box(1.75, 0.006, D - 1.1), "#56636b", { p: [2.0, TOP + 0.003, -0.3], ink: false });
  p.add(rbox(0.1, 0.1, D - 1.1, 0.03), C.steelL, { p: [WARM_X - 0.02, TOP + 0.05, -0.3] });
  // Grease trough along the front, and its drawer handle.
  p.add(box(W - 0.2, 0.1, 0.4), "#2a2e30", { p: [0, TOP - 0.08, 1.98], ink: false });
  p.add(box(W - 0.1, 0.16, 0.06), C.steelL, { p: [0, TOP - 0.04, 2.2] });
  p.add(rbox(0.8, 0.1, 0.12, 0.04), "#2b3134", { p: [2.3, 0.3, 2.25] });
  // Splash guards: the back, and tapered sides.
  p.add(box(W, 1.2, 0.08), C.steelL, { p: [0, TOP + 0.6, -2.62] });
  p.add(box(W, 0.06, 0.18), C.steel, { p: [0, TOP + 1.21, -2.58] });
  for (const x of [-2.96, 2.96]) p.add(sideProfile([[-2.66, 0], [1.7, 0], [1.7, 0.18], [-2.66, 1.2]], 0.07), C.steelL, { p: [x, TOP, 0] });
  // Knobs and pilot lights: two for the hot zone, one for the warm zone.
  for (const [x, col] of [[-2.1, "#ff6a2b"], [-0.5, "#ff6a2b"], [2.0, "#6fb7d6"]] as const) {
    knob(p, x, 0.66, 2.43, 0.2, C.knob, 0.8);
    p.add(cyl(0.06, 0.06, 0.03, 10), col, { p: [x + 0.42, 0.84, 2.45], r: [Math.PI / 2, 0, 0], ink: false });
  }
  return p;
});

const press = cached(() => {
  const p = new Parts();
  p.add(cyl(0.62, 0.62, 0.1, 28), "#555b5e", { p: [0, 0.05, 0] });
  p.add(cyl(0.5, 0.56, 0.06, 28), "#6d7477", { p: [0, 0.13, 0], ink: false });
  p.add(cyl(0.08, 0.1, 0.32, 10), "#2b3134", { p: [0, 0.3, 0] });
  p.add(rbox(0.95, 0.16, 0.2, 0.08), "#e5432b", { p: [0, 0.5, 0] });
  return p;
});

/** The smash press on its own (origin at its flat base), to carry onto a patty. */
export function makeSmashPress(): THREE.Mesh {
  return bakedMesh(press());
}

const LED_HOT = "#ff6a3a";
const LED_WARM = "#7cc7e6";

export interface GriddleObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Cook surface in local game units; the warm zone is x > warmX. */
      surface: { y: number; x0: number; x1: number; z0: number; z1: number; warmX: number };
      /** Where the smash press rests. */
      press: { x: number; y: number; z: number };
    };
    /** The resting smash press; lift or hide it while it's in use. */
    press: THREE.Object3D;
    /** Light the warm zone's LED blue (turned down) or red like the rest of the plate. */
    setWarm: (on: boolean) => void;
  };
}

/** The stainless griddle, in game units: 4.0 x 3.67, 1.73 tall, cook surface at y 0.87. */
export function makeGriddle(): GriddleObject {
  const g = new THREE.Group() as GriddleObject;
  g.add(bakedMesh(body()));
  const st = studySpace();
  g.add(st);
  // Front-lip LED strips: red over the hot zone, the warm zone's strip follows setWarm.
  const led = (x0: number, x1: number, c: string) => {
    const m = glow(box(x1 - x0, 0.05, 0.02), c);
    m.position.set((x0 + x1) / 2, TOP + 0.02, 2.24);
    st.add(m);
    return m;
  };
  led(-2.8, 1.0, LED_HOT);
  const warmLed = led(1.15, 2.8, LED_WARM);
  const lbl = textDecal("WARM", 0.2, { bg: "rgba(0,0,0,0)", color: "#dbe8ee", fs: 64 });
  lbl.position.set(2.0, TOP + 0.012, 1.55);
  st.add(lbl);
  const pr = bakedMesh(press());
  pr.position.set(PRESS_AT[0] * STUDY, TOP * STUDY, PRESS_AT[1] * STUDY);
  g.add(pr);
  machine(g, W, D, 2.6, {
    surface: { y: TOP * STUDY, x0: -2.8 * STUDY, x1: 2.8 * STUDY, z0: -2.4 * STUDY, z1: 1.6 * STUDY, warmX: WARM_X * STUDY },
    press: { x: PRESS_AT[0] * STUDY, y: TOP * STUDY, z: PRESS_AT[1] * STUDY },
  });
  g.userData.press = pr;
  g.userData.setWarm = (on) => {
    warmLed.material = glowMat(on ? LED_WARM : LED_HOT);
    lbl.visible = on;
  };
  return g;
}

