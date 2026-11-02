import * as THREE from "three";
import { box, rbox } from "./machines/kit";
import { mesh } from "./materials";

/**
 * The cutting board's knife (DESIGN §30): a broad steel chef's knife with a dark riveted handle,
 * lying blade toward the back. It's its own object now (it used to be baked into the board), so it
 * can be lifted, carried and drawn in the cut view. Origin at the middle of its length, on the
 * board's surface; it runs along z, tip at -z.
 */
export const KNIFE = { len: 1.36, blade: 0.84, w: 0.2 };

export function makeKnife(): THREE.Group {
  const g = new THREE.Group();
  const { len, blade, w } = KNIFE;
  const tipZ = -len / 2;
  // The blade: a flat steel slab, its edge side a shade lighter, tapering to the tip.
  const steel = mesh(box(w, 0.035, blade - 0.16), "#dfe5e4", { ink: 0.012 });
  steel.position.set(0, 0.02, tipZ + 0.16 + (blade - 0.16) / 2);
  const tip = mesh(box(w * 0.62, 0.035, 0.24), "#dfe5e4", { ink: 0.012 });
  tip.position.set(-w * 0.19, 0.02, tipZ + 0.12);
  tip.rotation.y = -0.38;
  const edge = mesh(box(0.035, 0.03, blade - 0.12), "#f6f9f8", { ink: false });
  edge.position.set(w / 2 - 0.01, 0.022, tipZ + 0.14 + (blade - 0.12) / 2);
  // Bolster and handle.
  const bolster = mesh(box(w * 0.7, 0.07, 0.06), "#9aa3a3", { ink: 0.012 });
  bolster.position.set(-0.02, 0.035, tipZ + blade + 0.02);
  const handle = mesh(rbox(0.13, 0.085, len - blade - 0.06, 0.035), "#3a2a22");
  handle.position.set(-0.03, 0.045, tipZ + blade + 0.05 + (len - blade - 0.06) / 2);
  g.add(steel, tip, edge, bolster, handle);
  for (const k of [0.25, 0.65]) {
    const rivet = mesh(box(0.05, 0.02, 0.05), "#c9cfcf", { ink: false, shadow: false });
    rivet.position.set(-0.03, 0.09, handle.position.z - (len - blade) / 2 + k * (len - blade));
    g.add(rivet);
  }
  return g;
}
