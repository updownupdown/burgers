import * as THREE from "three";
import { faceted, mesh, shareGeometry } from "./materials";

/*
 * A whole egg in the hand, in game units with its base at y = 0: about 0.44 wide and 0.57 tall,
 * so it reads at the same exaggerated scale as the fried egg it turns into on the grill.
 * Stages: whole, cracked (a dark crack round its waist), and the two empty half shells.
 */
export type EggStage = "whole" | "cracked" | "shells";

/** Egg radius at its widest, game units. */
export const EGG_R = 0.22;
const SHELL = "#f3e7d3";
const INSIDE = "#e9dcc2";

const WHOLE = shareGeometry(
  (() => {
    const g = new THREE.SphereGeometry(1, 12, 10);
    // Pointier at the top, like a real egg.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = y > 0 ? 1 - 0.18 * y : 1;
      p.setXYZ(i, p.getX(i) * k * EGG_R, (y * 1.3 + 1.3) * EGG_R, p.getZ(i) * k * EGG_R);
    }
    return faceted(g);
  })(),
);

/** A zigzag crack round the egg's waist. */
const CRACK = shareGeometry(
  (() => {
    const pts: THREE.Vector3[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const y = (1.3 + (i % 2 ? 0.16 : -0.1)) * EGG_R;
      pts.push(new THREE.Vector3(Math.cos(a) * EGG_R * 1.01, y, Math.sin(a) * EGG_R * 1.01));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0), 54, 0.02, 4, true);
  })(),
);

/** Half a shell: a cup with a ragged rim, open side up. */
const HALF = shareGeometry(
  (() => {
    const g = new THREE.SphereGeometry(EGG_R, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > -0.01) {
        // Ragged rim.
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, y - (Math.sin(a * 7) > 0 ? 0.035 : 0));
      }
      p.setY(i, p.getY(i) * 1.15 + EGG_R * 1.15);
    }
    return faceted(g);
  })(),
);

export function makeEgg(stage: EggStage): THREE.Group {
  const g = new THREE.Group();
  if (stage !== "shells") {
    g.add(mesh(WHOLE, SHELL, { ink: 0.014 }));
    if (stage === "cracked") g.add(mesh(CRACK, "#6e5a40", { ink: false, shadow: false }));
    return g;
  }
  // Two halves, pulled apart and tipped open.
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.add(mesh(HALF, SHELL, { ink: 0.014 }), mesh(HALF, INSIDE, { ink: false, shadow: false, side: THREE.BackSide }));
    h.position.x = s * EGG_R * 1.25;
    h.rotation.z = s * 0.95;
    g.add(h);
  }
  return g;
}
