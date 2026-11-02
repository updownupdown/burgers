import * as THREE from "three";
import type { Garnish } from "../../game/types";
import { faceted, mesh, shareGeometry } from "../materials";

/**
 * The local drink's garnish (after build #78): a cucumber wheel (Coast), a lime wedge (Red Rock) or
 * an apple slice (the isle), sat on a cup's rim, and a little dish of them by the fountain.
 * Sizes are in counter units, about a third of a cup across.
 */
const WHEEL = shareGeometry(faceted(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14)));
const WHEEL_IN = shareGeometry(faceted(new THREE.CylinderGeometry(0.16, 0.16, 0.052, 14)));
const WEDGE = shareGeometry(faceted(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10, 1, false, 0, Math.PI)));
const WEDGE_IN = shareGeometry(faceted(new THREE.CylinderGeometry(0.18, 0.18, 0.122, 10, 1, false, 0, Math.PI)));
const SEEDS = shareGeometry(new THREE.SphereGeometry(0.025, 6, 4));

const LOOK: Record<Garnish, { skin: string; flesh: string }> = {
  cucumber: { skin: "#3f7a3a", flesh: "#d9ecb4" },
  lime: { skin: "#4f9a2e", flesh: "#c4e27a" },
  apple: { skin: "#c8352e", flesh: "#f6ecc8" },
};

/** One piece, standing on edge (so it reads from above as a wheel or wedge hooked on a rim). */
export function makeGarnish(kind: Garnish): THREE.Group {
  const g = new THREE.Group();
  const { skin, flesh } = LOOK[kind];
  const piece = new THREE.Group();
  if (kind === "cucumber") {
    piece.add(mesh(WHEEL, skin, { ink: 0.012 }), mesh(WHEEL_IN, flesh, { ink: false }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = mesh(SEEDS, "#b9d38c", { ink: false, shadow: false });
      s.position.set(Math.cos(a) * 0.07, 0.03, Math.sin(a) * 0.07);
      piece.add(s);
    }
    piece.rotation.x = Math.PI / 2 - 0.35;
  } else {
    // A wedge: a half-disc on its flat side, skin round the curve.
    piece.add(mesh(WEDGE, skin, { ink: 0.012 }), mesh(WEDGE_IN, flesh, { ink: false }));
    piece.rotation.set(Math.PI / 2 - 0.35, 0, 0);
    if (kind === "apple") piece.scale.set(1, 0.6, 1);
  }
  g.add(piece);
  return g;
}

/** A shallow dish of garnish for the drinks counter. */
export function makeGarnishDish(kind: Garnish): THREE.Group {
  const g = new THREE.Group();
  const dish = mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.16, 20), "#f3efe6", { ink: 0.014 });
  dish.position.y = 0.08;
  g.add(dish);
  const spots: [number, number, number][] = [
    [-0.22, -0.12, 0.3],
    [0.2, -0.16, -0.5],
    [0.02, 0.2, 1.4],
    [-0.28, 0.2, 2.2],
    [0.3, 0.16, 0.9],
  ];
  for (const [x, z, r] of spots) {
    const p = makeGarnish(kind);
    p.rotation.set(-Math.PI / 2 + 0.35, r, 0);
    p.position.set(x, 0.2, z);
    g.add(p);
  }
  return g;
}
