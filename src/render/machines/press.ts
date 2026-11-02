import * as THREE from "three";
import { bakedMesh, bakeShared, Parts, type Baked } from "../bake";
import { box, C, cyl, glowMat, rbox } from "./kit";
import { faceted, mesh } from "../materials";

/*
 * The Sunny Coast's panini press (DESIGN §24, phase 2): a row of clamshell bays where the griddle
 * stands on the Pines counter. Each bay is a steel body with a ribbed cast-iron plate, and a lid
 * on a back hinge with its own ribbed plate underneath and a long coral handle across the front.
 * Pull the handle down and the lid closes over the food (both faces cook at once); tap it and the
 * lid lifts. Modelled in game units; origin at the centre of the bay's footprint on the counter.
 */

/** One bay's size, in game units. */
export const BAY = { w: 1.62, d: 1.86 };
/** The cook plate: top height and extent (bay-local). */
export const PLATE = { y: 0.52, w: 1.36, d: 1.3, z: 0.02 };
/** The lid's hinge (bay-local), the lid's depth from hinge to front edge, and how far it opens. */
const HINGE = { y: 0.92, z: -0.78 };
const LID_D = 1.68;
const LID_H = 0.22;
/** The closed lid rests this far above the lower plate: the room the food has inside. */
export const CLOSED_GAP = 0.34;
const OPEN_ANGLE = 1.22;
/** The handle bar sticks out this far in front of the lid's front edge. */
const HANDLE_OUT = 0.2;

const ribs = (p: Parts, w: number, d: number, y: number, z: number, n: number, col: string) => {
  for (let i = 0; i < n; i++) p.add(box(w - 0.12, 0.035, 0.05), col, { p: [0, y, z - d / 2 + 0.1 + (i * (d - 0.2)) / (n - 1)], ink: false });
};

let baseBaked: Baked | null = null;
function base(): Baked {
  if (baseBaked) return baseBaked;
  const p = new Parts();
  const { w, d } = BAY;
  // Feet, the steel body and a darker skirt line.
  for (const x of [-w / 2 + 0.16, w / 2 - 0.16]) for (const z of [-d / 2 + 0.16, d / 2 - 0.2]) p.add(cyl(0.06, 0.07, 0.08, 8), C.rubber, { p: [x, 0.04, z] });
  p.add(rbox(w, PLATE.y - 0.1, d, 0.06), C.steel, { p: [0, 0.08 + (PLATE.y - 0.1) / 2, 0] });
  p.add(box(w - 0.06, 0.03, 0.02), "#9aa5a3", { p: [0, 0.18, d / 2 + 0.002], ink: false });
  // The lower plate: dark cast iron with raised ribs (press lines) and a drip lip at the front.
  p.add(box(PLATE.w, 0.06, PLATE.d), "#2f3336", { p: [0, PLATE.y - 0.03, PLATE.z] });
  ribs(p, PLATE.w, PLATE.d, PLATE.y + 0.005, PLATE.z, 9, "#4a5054");
  p.add(box(PLATE.w + 0.08, 0.05, 0.12), "#25292b", { p: [0, PLATE.y - 0.06, PLATE.z + PLATE.d / 2 + 0.06], ink: false });
  // Hinge blocks at the back.
  for (const x of [-w / 2 + 0.24, w / 2 - 0.24]) p.add(rbox(0.22, 0.5, 0.26, 0.04), C.steelL, { p: [x, PLATE.y + 0.16, HINGE.z - 0.04] });
  p.add(cyl(0.05, 0.05, w - 0.36, 10), C.steelD, { p: [0, HINGE.y, HINGE.z], r: [0, 0, Math.PI / 2], ink: 0.012 });
  // A lamp well on the front face.
  p.add(cyl(0.085, 0.085, 0.02, 14), "#2a2f31", { p: [w / 2 - 0.26, 0.34, d / 2 + 0.006], r: [Math.PI / 2, 0, 0], ink: false });
  baseBaked = bakeShared(p);
  return baseBaked;
}

let lidBaked: Baked | null = null;
/** The lid, built closed in hinge space: its back edge on the hinge axis, front toward +z. */
function lid(): Baked {
  if (lidBaked) return lidBaked;
  const p = new Parts();
  const { w } = BAY;
  const zc = LID_D / 2;
  // Housing: a slightly domed steel shell, the ribbed plate underneath.
  p.add(rbox(w - 0.06, LID_H, LID_D, 0.07), C.steelL, { p: [0, LID_H / 2 - 0.08, zc] });
  p.add(rbox(w - 0.3, 0.06, LID_D - 0.3, 0.05), C.steel, { p: [0, LID_H - 0.06, zc] });
  // Vent slots across the back of the lid and a little heat dial at the front corner.
  for (let i = 0; i < 4; i++) p.add(box(w - 0.6, 0.02, 0.05), "#5a6164", { p: [0, LID_H - 0.02, 0.3 + i * 0.12], ink: false });
  p.add(cyl(0.11, 0.11, 0.06, 14), "#2f3336", { p: [w / 2 - 0.3, LID_H - 0.01, LID_D - 0.3] });
  p.add(box(0.025, 0.02, 0.1), "#f4efe6", { p: [w / 2 - 0.3, LID_H + 0.03, LID_D - 0.33], ink: false });
  p.add(box(PLATE.w, 0.05, PLATE.d), "#2f3336", { p: [0, -0.1, zc + 0.04] });
  ribs(p, PLATE.w, PLATE.d, -0.13, zc + 0.04, 9, "#4a5054");
  // The handle: two arms forward from the lid's front and a long coral grip across.
  for (const x of [-w / 2 + 0.22, w / 2 - 0.22]) p.add(box(0.07, 0.07, HANDLE_OUT + 0.08), C.steelD, { p: [x, 0.02, LID_D + HANDLE_OUT / 2 - 0.02] });
  p.add(cyl(0.075, 0.075, w - 0.26, 14), "#d8573a", { p: [0, 0.02, LID_D + HANDLE_OUT], r: [0, 0, Math.PI / 2], ink: 0.016 });
  p.add(box(w - 0.5, 0.012, 0.03), "#f08a6a", { p: [0, 0.09, LID_D + HANDLE_OUT - 0.03], ink: false });
  lidBaked = bakeShared(p);
  return lidBaked;
}

/** A dab of melted cheese squeezing out at the closed seam. */
const OOZE_GEO = faceted(new THREE.SphereGeometry(0.11, 10, 6));

export interface PressBayObject extends THREE.Group {
  userData: {
    /** Open the lid: 0 closed, 1 fully open. */
    setOpen: (t: number) => void;
    /** The heat lamp on the front: lit while the lid is closed on food. */
    setLamp: (on: boolean) => void;
    /** Show the cheese ooze at the seam (only while closed). */
    setOoze: (on: boolean) => void;
    /** Where the food sits (bay-local): the middle of the lower plate. */
    food: THREE.Vector3;
    /** The handle grip's middle, bay-local, at the current opening. */
    handle: () => THREE.Vector3;
  };
}

export function makePressBay(): PressBayObject {
  const g = new THREE.Group() as PressBayObject;
  g.add(bakedMesh(base()));
  const pivot = new THREE.Group();
  pivot.position.set(0, HINGE.y, HINGE.z);
  // Closed, the lid's plate sits CLOSED_GAP over the lower plate.
  const lidMesh = bakedMesh(lid());
  lidMesh.position.y = PLATE.y + CLOSED_GAP + 0.13 - HINGE.y;
  pivot.add(lidMesh);
  g.add(pivot);
  const lamp = mesh(faceted(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#4a5155", { ink: false, shadow: false, unique: true });
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(BAY.w / 2 - 0.26, 0.34, BAY.d / 2 + 0.01);
  g.add(lamp);
  // From above only the counter in front of the bay shows, so the cheese runs down the front and
  // pools there.
  const ooze = mesh(OOZE_GEO, "#f7dd86", { ink: 1.04, shadow: false });
  ooze.scale.set(2.4, 0.35, 1.25);
  ooze.position.set(-0.32, 0.03, BAY.d / 2 + 0.12);
  const ooze2 = mesh(OOZE_GEO, "#f7dd86", { ink: 1.04, shadow: false });
  ooze2.scale.set(0.7, 2.4, 0.5);
  ooze2.position.set(-0.4, 0.24, BAY.d / 2 + 0.03);
  ooze.visible = ooze2.visible = false;
  g.add(ooze, ooze2);
  let open = 1;
  g.userData = {
    setOpen: (t) => {
      open = Math.max(0, Math.min(1, t));
      // Ease the swing so the lid seems to have weight.
      const e = open * open * (3 - 2 * open);
      pivot.rotation.x = -OPEN_ANGLE * e;
    },
    setLamp: (on) => {
      lamp.material = glowMat(on ? "#ff9a2a" : "#4a5155");
    },
    setOoze: (on) => {
      ooze.visible = ooze2.visible = on;
    },
    food: new THREE.Vector3(0, PLATE.y + 0.04, PLATE.z),
    handle: () => {
      const local = new THREE.Vector3(0, lidMesh.position.y + 0.02, LID_D + HANDLE_OUT);
      local.applyEuler(pivot.rotation);
      return local.add(pivot.position);
    },
  };
  g.userData.setOpen(1);
  return g;
}

/** The cutting board (Harbor City, and Port Amber's oven): end-grain wood. Its knife is separate (render/knife.ts). */
export const BOARD = { w: 2.1, d: 1.3, h: 0.12 };
let boardBaked: Baked | null = null;
export function makeCuttingBoard(): THREE.Mesh {
  if (!boardBaked) {
    const p = new Parts();
    const { w, d, h } = BOARD;
    p.add(rbox(w, h, d, 0.06), "#c98a52", { p: [0, h / 2, 0] });
    for (let i = 0; i < 5; i++) p.add(box(w - 0.14, 0.004, 0.025), "#b07440", { p: [0, h + 0.002, -d / 2 + 0.2 + i * 0.26], ink: false });
    p.add(cyl(0.07, 0.07, 0.02, 12), "#8a5a30", { p: [w / 2 - 0.18, h + 0.005, -d / 2 + 0.18], ink: false });
    // The knife lies along its right edge, but it's its own object now (render/knife.ts) so it can be picked up.
    boardBaked = bakeShared(p);
  }
  return bakedMesh(boardBaked);
}
