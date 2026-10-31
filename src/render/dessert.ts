import * as THREE from "three";
import { FLAVOR_COLOR, type FlavorId } from "../game/types";
import { disposeObject, faceted, mesh } from "./materials";

/*
 * Cold bar food: a waffle cone, a steel shake tin and the paper shake cup it's served in, each
 * with soft serve laid ring by ring. Modelled in cup units (study units, 1 = 10 cm, drawn a little
 * bigger than life like the cups), so the counter and the trays scale them the same way as cups.
 */

export type VesselKind = "cone" | "tin" | "shake";

export interface VesselState {
  vessel: VesselKind;
  flavor: FlavorId | null;
  /** Rings of soft serve, fractional while one is being laid. */
  swirl: number;
  /** Where each ring sits off centre, -1..1 (the rings drift with the finger). */
  offs: { x: number; z: number }[];
  /** Shakes: blending so far (see BLEND in game/dessert.ts). */
  blend: number;
  /** Melting, 0 fresh to 1 a puddle. */
  melt: number;
}

const WAFFLE = "#d9a35a";
const WAFFLE_D = "#b9813c";
const TIN = "#c9d1d2";
const PAPER = "#f7f3ea";

/** The cone: tip at the origin, its rim at CONE.h. */
export const CONE = { r: 0.44, h: 1.5 };
/** The tin: base at the origin. */
export const TIN_DIMS = { r: 0.5, h: 1.8 };
const RING = { r: 0.42, t: 0.15, step: 0.2, shrink: 0.16 };

const lathe = (pts: [number, number][], segs = 22) => faceted(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs));

/** Soft serve laid as rings from y0 up, each a little narrower, the last one part-drawn, with a curl on top. */
function swirlGroup(s: VesselState, y0: number, r0: number): THREE.Group {
  const g = new THREE.Group();
  if (!s.flavor || s.swirl <= 0.02) return g;
  const col = FLAVOR_COLOR[s.flavor];
  const n = Math.ceil(s.swirl);
  let ox = 0;
  let oz = 0;
  let top = y0;
  for (let k = 0; k < n; k++) {
    const part = Math.min(1, s.swirl - k);
    const off = s.offs[k] ?? { x: 0, z: 0 };
    // Each ring sits on the one below it, shifted by where the finger drifted: lean builds up.
    ox += off.x * 0.16;
    oz += off.z * 0.16;
    const r = Math.max(0.1, r0 * (1 - RING.shrink * k));
    const t = RING.t * (1 - 0.08 * k);
    const ring = mesh(faceted(new THREE.TorusGeometry(r, t, 7, 22, Math.PI * 2 * part)), col, { ink: 0.01 });
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = k * 1.3;
    top = y0 + t + k * RING.step;
    ring.position.set(ox, top, oz);
    g.add(ring);
    // Fill the middle so it never looks hollow from above.
    if (part > 0.6) {
      const core = mesh(faceted(new THREE.CylinderGeometry(r * 0.85, r * 0.9, RING.step + 0.02, 14)), col, { ink: false });
      core.position.set(ox, top - 0.02, oz);
      g.add(core);
    }
  }
  if (s.swirl >= 1) {
    const tip = mesh(lathe([[0.16, 0], [0.12, 0.12], [0.02, 0.3], [0, 0.31]], 12), col, { ink: 0.01 });
    tip.position.set(ox, top + 0.06, oz);
    tip.rotation.z = 0.35;
    g.add(tip);
  }
  // Melting: the swirl slumps and spreads.
  g.scale.set(1 + 0.15 * s.melt, 1 - 0.3 * s.melt, 1 + 0.15 * s.melt);
  g.position.y = y0 * 0.3 * s.melt;
  return g;
}

function makeCone(s: VesselState): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0.02, 0], [CONE.r, CONE.h], [CONE.r + 0.04, CONE.h + 0.04], [CONE.r - 0.06, CONE.h + 0.06]], 18), WAFFLE, { ink: 0.012 }));
  // A darker rolled rim and a criss-cross of waffle lines.
  const rim = mesh(faceted(new THREE.TorusGeometry(CONE.r, 0.05, 5, 20)), WAFFLE_D, { ink: false });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CONE.h;
  g.add(rim);
  for (let i = 0; i < 4; i++) {
    const y = 0.35 + i * 0.3;
    const band = mesh(faceted(new THREE.TorusGeometry((CONE.r * y) / CONE.h + 0.01, 0.015, 3, 18)), WAFFLE_D, { ink: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  g.add(swirlGroup(s, CONE.h + 0.02, RING.r));
  if (s.melt > 0.2 && s.flavor) {
    // Drips running down the cone.
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      const len = 0.15 + 0.45 * s.melt * (1 - i * 0.2);
      const drip = mesh(faceted(new THREE.CapsuleGeometry(0.06, len, 3, 6)), FLAVOR_COLOR[s.flavor], { ink: false });
      drip.position.set(Math.cos(a) * (CONE.r - 0.05), CONE.h - len / 2, Math.sin(a) * (CONE.r - 0.05));
      g.add(drip);
    }
  }
  return g;
}

function makeTin(s: VesselState): THREE.Group {
  const g = new THREE.Group();
  const { r, h } = TIN_DIMS;
  g.add(mesh(lathe([[0, 0], [r * 0.78, 0], [r, h], [r + 0.03, h + 0.02]], 22), TIN, { ink: 0.012 }));
  // The inside of the tin, seen from above.
  g.add(mesh(lathe([[r - 0.02, h + 0.02], [r * 0.78 - 0.03, 0.06], [0, 0.06]], 22), "#a9b2b4", { ink: false }));
  if (s.flavor && s.swirl > 0.02) {
    const col = new THREE.Color(FLAVOR_COLOR[s.flavor]);
    // Blending turns it smooth and a touch paler (milk going in).
    if (s.blend > 0) col.lerp(new THREE.Color("#ffffff"), Math.min(0.25, s.blend * 0.2));
    const fill = Math.min(h - 0.12, 0.2 + s.swirl * 0.42);
    const rr = r * 0.78 + (r - r * 0.78) * (fill / h) - 0.04;
    const body = mesh(lathe([[0, 0.06], [r * 0.78 - 0.04, 0.06], [rr, fill], [0, fill]], 20), `#${col.getHexString()}`, { ink: false });
    g.add(body);
    if (s.blend < 0.3) {
      // Unblended: the last rings show on top, poking over the rim when it's heaped.
      const top = swirlGroup({ ...s, swirl: Math.min(2, s.swirl), melt: 0 }, fill - 0.05, rr * 0.9);
      g.add(top);
    } else {
      const dome = mesh(faceted(new THREE.SphereGeometry(rr, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2)), `#${col.getHexString()}`, { ink: false });
      dome.scale.y = 0.18;
      dome.position.y = fill;
      g.add(dome);
    }
  }
  return g;
}

function makeShakeCup(s: VesselState): THREE.Group {
  const g = new THREE.Group();
  const col = s.flavor ? FLAVOR_COLOR[s.flavor] : "#ffffff";
  g.add(mesh(lathe([[0, 0], [0.36, 0], [0.5, 1.7], [0.53, 1.74]], 22), PAPER, { ink: 0.012 }));
  // A band in the shake's colour so it reads on the tray.
  g.add(mesh(lathe([[0.425, 0.55], [0.46, 0.95], [0.465, 1.0]], 22), col, { ink: false }));
  const g2 = mesh(lathe([[0.452, 0.92], [0.476, 1.08]], 22), col, { ink: false });
  g.add(g2);
  // The dome lid, with the shake showing through it, and a straw.
  const fill = mesh(faceted(new THREE.SphereGeometry(0.5, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2)), col, { ink: false });
  fill.scale.y = 0.35 * (1 - 0.5 * s.melt);
  fill.position.y = 1.72;
  g.add(fill);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.53, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#f4fbff", transparent: true, opacity: 0.35, depthWrite: false }));
  lid.scale.y = 0.7;
  lid.position.y = 1.72;
  g.add(lid);
  const straw = mesh(faceted(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6)), "#d24c3f", { ink: 0.008 });
  straw.position.set(0.12, 2.3, 0);
  straw.rotation.z = -0.25;
  g.add(straw);
  return g;
}

export interface VesselObject extends THREE.Group {
  userData: { set(s: VesselState): void; state: VesselState | null };
}

const keyOf = (s: VesselState) =>
  `${s.vessel}|${s.flavor}|${Math.round(s.swirl * 12)}|${s.offs.map((o) => `${o.x.toFixed(1)},${o.z.toFixed(1)}`).join(";")}|${s.blend < 0.3 ? 0 : 1}|${Math.round(s.blend * 5)}|${Math.round(s.melt * 8)}`;

/** A cone, tin or shake cup with its soft serve, redrawn (only) when what it holds changes. */
export function makeVessel(s: VesselState): VesselObject {
  const g = new THREE.Group() as VesselObject;
  let key = "";
  let inner: THREE.Object3D | null = null;
  g.userData.state = null;
  g.userData.set = (st) => {
    g.userData.state = st;
    const k = keyOf(st);
    if (k === key) return;
    key = k;
    if (inner) {
      g.remove(inner);
      disposeObject(inner);
    }
    inner = st.vessel === "cone" ? makeCone(st) : st.vessel === "tin" ? makeTin(st) : makeShakeCup(st);
    g.add(inner);
  };
  g.userData.set(s);
  return g;
}

/** A little wire stand that holds a cone upright under a nozzle (the cone's tip sits at CONE_STAND). */
export const CONE_STAND = 0.35;
export function makeConeStand(): THREE.Group {
  const g = new THREE.Group();
  const ring = mesh(faceted(new THREE.TorusGeometry(CONE.r * 0.62, 0.04, 4, 18)), "#9aa3a6", { ink: 0.008 });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = CONE_STAND + CONE.h * 0.6;
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(faceted(new THREE.CylinderGeometry(0.03, 0.03, CONE_STAND + CONE.h * 0.6, 5)), "#9aa3a6", { ink: false });
    leg.position.set(Math.cos(a) * CONE.r * 0.62, (CONE_STAND + CONE.h * 0.6) / 2, Math.sin(a) * CONE.r * 0.62);
    g.add(leg);
  }
  return g;
}

/** A paper sleeve round the bottom of a cone, as it's handed over on a tray. */
export function makeConeSleeve(): THREE.Object3D {
  const s = mesh(lathe([[CONE.r * 0.1, 0.05], [CONE.r * 0.62, CONE.h * 0.62], [CONE.r * 0.66, CONE.h * 0.64]], 16), "#f7f3ea", { ink: 0.01 });
  return s;
}
