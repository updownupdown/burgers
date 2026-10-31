import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { mesh } from "../materials";
import { STUDY } from "../units";
import { box, C, cached, cyl, lathe, machine, rbox, tor } from "./kit";

/*
 * The Cold bar: a countertop soft-serve machine with two hoppers and two pull handles over a drip
 * tray, a spindle mixer for shakes, a cone dispenser and a stack of steel shake tins. Study units
 * (1 = 10 cm) below; game units out.
 */

type P3 = { x: number; y: number; z: number };

// ---- soft-serve machine ---------------------------------------------------------

const SW = 5.4;
/** The body stands at the back; the dispensing head juts forward over the drip tray. */
const BODY = { z0: -2.6, z1: 0.3, h: 4.6 };
const HEAD = { z1: 1.0, y0: 3.3, y1: 4.25 };
/**
 * The two nozzles (and the cone or tin under each), left and right of centre, on spouts that
 * reach out past the head so the swirl stands in full view of a camera looking down the line.
 */
const NOZ_X = 1.35;
const NOZ_Z = 1.95;
const NOZ_Y = 3.35;
const TRAY = { z0: 0.1, z1: 2.95, y: 0.22 };

const softServeBody = cached(() => {
  const p = new Parts();
  const z = (BODY.z0 + BODY.z1) / 2;
  const d = BODY.z1 - BODY.z0;
  p.add(rbox(SW, BODY.h, d, 0.18), "#eef0ee", { p: [0, BODY.h / 2, z] });
  // A coloured band low on the body, and vents.
  p.add(rbox(SW + 0.04, 0.5, d + 0.04, 0.08), "#7aa6b8", { p: [0, 0.9, z], ink: 0.01 });
  for (let i = 0; i < 6; i++) p.add(box(0.7, 0.06, 0.02), "#9aa6ab", { p: [-1.8 + i * 0.72, 1.6, BODY.z1 + 0.01], ink: false });
  // Hopper lids on top (their flavour discs are coloured per region, see makeSoftServe).
  for (const k of [-1, 1]) {
    p.add(cyl(1.05, 1.1, 0.25, 24), C.steelL, { p: [k * NOZ_X, BODY.h + 0.12, z - 0.2] });
    p.add(cyl(0.18, 0.18, 0.18, 12), C.rubber, { p: [k * NOZ_X, BODY.h + 0.33, z - 0.2] });
  }
  // The dispensing head: a steel block over the drip tray with a nozzle on each side.
  const hz = (BODY.z1 + HEAD.z1) / 2 - 0.15;
  p.add(rbox(SW - 0.6, HEAD.y1 - HEAD.y0, HEAD.z1 - BODY.z1 + 0.3, 0.12), C.steel, { p: [0, (HEAD.y0 + HEAD.y1) / 2, hz] });
  for (const k of [-1, 1]) {
    // The spout: an arm out of the head with the nozzle hanging from its end.
    p.add(rbox(0.5, 0.36, NOZ_Z - HEAD.z1 + 0.4, 0.1), C.steel, { p: [k * NOZ_X, NOZ_Y + 0.38, (NOZ_Z + HEAD.z1) / 2] });
    p.add(cyl(0.26, 0.2, 0.22, 16), C.steelD, { p: [k * NOZ_X, NOZ_Y + 0.1, NOZ_Z] });
    // A star nozzle: eight little teeth round the spout.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(box(0.06, 0.12, 0.06), C.steelD, { p: [k * NOZ_X + Math.cos(a) * 0.17, NOZ_Y - 0.04, NOZ_Z + Math.sin(a) * 0.17], ink: false });
    }
    // The handle's pivot block on the head's front.
    p.add(rbox(0.5, 0.36, 0.3, 0.06), C.steelD, { p: [k * NOZ_X, HEAD.y1 + 0.1, HEAD.z1 - 0.1] });
  }
  // Drip tray with a grate.
  p.add(rbox(SW - 0.3, TRAY.y, TRAY.z1 - TRAY.z0, 0.06), "#3a3f41", { p: [0, TRAY.y / 2, (TRAY.z0 + TRAY.z1) / 2] });
  for (let i = 0; i < 20; i++) p.add(box(0.06, 0.02, TRAY.z1 - TRAY.z0 - 0.3), "#5a6164", { p: [-SW / 2 + 0.45 + i * 0.24, TRAY.y + 0.01, (TRAY.z0 + TRAY.z1) / 2], ink: false });
  return p;
});

export interface SoftServeObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Where a cone or tin stands under each nozzle (its base), left then right. */
      cups: P3[];
      /** The nozzle tips, where soft serve comes out. */
      nozzles: P3[];
      /** The pull handles, for their tap targets. */
      handles: P3[];
    };
    /** Colour the hopper disc and handle knob of each side for today's flavours. */
    setFlavors(colors: [string, string]): void;
    /** Pull a handle down (0 up to 1 fully down). */
    pull(i: number, t: number): void;
  };
}

/** The soft-serve machine, in game units: 3.6 wide, about 3.1 tall, nozzles 1.8 apart. */
export function makeSoftServe(): SoftServeObject {
  const g = new THREE.Group() as SoftServeObject;
  g.add(bakedMesh(softServeBody()));
  const S = STUDY;
  const bz = (BODY.z0 + BODY.z1) / 2 - 0.2;
  const discs: THREE.Mesh[] = [];
  const knobs: THREE.Mesh[] = [];
  const arms: THREE.Group[] = [];
  for (const k of [-1, 1]) {
    // Own materials: each side is recoloured on its own.
    const disc = mesh(new THREE.CylinderGeometry(0.75 * S, 0.75 * S, 0.04 * S, 24), "#f4ead2", { ink: false });
    disc.material = (disc.material as THREE.Material).clone();
    disc.position.set(k * NOZ_X * S, (BODY.h + 0.26) * S, bz * S);
    g.add(disc);
    discs.push(disc);
    // The pull handle: an arm from the pivot up and out, with a round knob in the flavour's colour.
    const arm = new THREE.Group();
    arm.position.set(k * NOZ_X * S, (HEAD.y1 + 0.1) * S, (HEAD.z1 + 0.05) * S);
    const bar = mesh(new THREE.BoxGeometry(0.16 * S, 1.3 * S, 0.16 * S), C.steelD);
    bar.position.set(0, 0.6 * S, 0.12 * S);
    bar.rotation.x = 0.35;
    const knob = mesh(new THREE.SphereGeometry(0.32 * S, 14, 10), "#f4ead2");
    knob.material = (knob.material as THREE.Material).clone();
    knob.position.set(0, 1.25 * S, 0.36 * S);
    arm.add(bar, knob);
    g.add(arm);
    arms.push(arm);
    knobs.push(knob);
  }
  machine(g, SW, TRAY.z1 - BODY.z0, BODY.h + 0.4, {
    cups: [-1, 1].map((k) => ({ x: k * NOZ_X * S, y: TRAY.y * S, z: NOZ_Z * S })),
    nozzles: [-1, 1].map((k) => ({ x: k * NOZ_X * S, y: (NOZ_Y - 0.1) * S, z: NOZ_Z * S })),
    handles: [-1, 1].map((k) => ({ x: k * NOZ_X * S, y: (HEAD.y1 + 0.8) * S, z: (HEAD.z1 + 0.3) * S })),
  });
  g.userData.setFlavors = (colors) =>
    colors.forEach((c, i) => {
      for (const m of [discs[i], knobs[i]]) (m.material as THREE.MeshToonMaterial).color.set(c);
    });
  g.userData.pull = (i, t) => {
    arms[i].rotation.x = 0.9 * t;
  };
  return g;
}

// ---- spindle mixer -------------------------------------------------------------------

const MX = { base: [2.0, 0.35, 2.4] as const, colH: 4.4, armZ: 0.55, tinZ: 0.45, ringY: 1.25 };

const mixerBody = cached(() => {
  const p = new Parts();
  const [bw, bh, bd] = MX.base;
  p.add(rbox(bw, bh, bd, 0.1), "#d24c3f", { p: [0, bh / 2, 0] });
  // The column at the back and the motor head on top, over the tin.
  p.add(rbox(0.8, MX.colH, 0.8, 0.12), "#d24c3f", { p: [0, MX.colH / 2, -0.75] });
  p.add(rbox(1.0, 1.0, 1.9, 0.2), "#d24c3f", { p: [0, MX.colH + 0.2, -0.15] });
  p.add(cyl(0.38, 0.38, 0.1, 18), C.cream, { p: [0, MX.colH + 0.75, -0.15], ink: 0.01 });
  // Chrome trim and the rest that steadies the tin.
  p.add(box(1.02, 0.12, 1.92), C.steelL, { p: [0, MX.colH - 0.25, -0.15], ink: 0.01 });
  p.add(tor(0.55, 0.06, 6, 22), C.steelL, { p: [0, MX.ringY, MX.tinZ], r: [Math.PI / 2, 0, 0] });
  p.add(box(0.1, 0.1, 1.0), C.steelL, { p: [0, MX.ringY, -0.15] });
  p.add(cyl(0.6, 0.6, 0.06, 20), "#3a3f41", { p: [0, bh + 0.03, MX.tinZ] });
  // The switch on the base's front: the tap target (hold to blend).
  p.add(rbox(0.6, 0.22, 0.3, 0.06), C.cream, { p: [0, bh + 0.05, bd / 2 - 0.25] });
  return p;
});

export interface MixerObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: { tin: P3; spindleTop: P3 };
    /** Turn the spindle (radians) and show whether it's running. */
    spin(a: number, running: boolean): void;
  };
}

/** The spindle mixer, in game units: 1.33 x 1.6, about 3.4 tall. */
export function makeMixer(): MixerObject {
  const g = new THREE.Group() as MixerObject;
  g.add(bakedMesh(mixerBody()));
  const S = STUDY;
  const spindle = new THREE.Group();
  spindle.position.set(0, (MX.colH - 0.3) * S, MX.tinZ * S);
  const rod = mesh(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, 2.6 * S, 8), C.steelL, { ink: 0.008 });
  rod.position.y = -1.3 * S;
  const blade = mesh(new THREE.BoxGeometry(0.4 * S, 0.06 * S, 0.12 * S), C.steelL, { ink: 0.008 });
  blade.position.y = -2.55 * S;
  spindle.add(rod, blade);
  g.add(spindle);
  machine(g, MX.base[0], MX.base[2], MX.colH + 0.9, {
    tin: { x: 0, y: (MX.base[1] + 0.06) * S, z: MX.tinZ * S },
    spindleTop: { x: 0, y: (MX.colH - 0.3) * S, z: MX.tinZ * S },
  });
  g.userData.spin = (a, running) => {
    spindle.rotation.y = a;
    spindle.position.x = running ? Math.sin(a * 3) * 0.01 : 0;
  };
  return g;
}

// ---- cone dispenser and tin stack -----------------------------------------------

/** A clear tube of cones, point down, on a little steel foot, with the top cone poking out. */
const coneTube = cached(() => {
  const p = new Parts();
  p.add(rbox(1.3, 0.16, 1.3, 0.06), C.steelL, { p: [0, 0.08, 0] });
  p.add(cyl(0.12, 0.12, 0.6, 10), C.steel, { p: [0, 0.45, 0] });
  for (let i = 0; i < 6; i++) {
    const y = 0.8 + i * 0.32;
    p.add(lathe([[0.02, 0], [0.48, 1.4], [0.5, 1.45]], 16), i % 2 ? "#d9a35a" : "#cf9750", { p: [0, y, 0], ink: i === 5 ? 0.012 : 0.006 });
  }
  return p;
});

const tinStack = cached(() => {
  const p = new Parts();
  p.add(rbox(1.25, 0.08, 1.25, 0.04), C.steelL, { p: [0, 0.04, 0] });
  // Three tins upside down, nested.
  for (let i = 0; i < 3; i++) p.add(lathe([[0.48, 0], [0.38, 1.8], [0, 1.8]], 20), i % 2 ? "#d6dcdc" : "#c4cbcc", { p: [0, 0.08 + i * 0.16, 0], ink: i === 2 ? 0.012 : 0.006 });
  return p;
});

/** The cone dispenser, in game units: about 0.9 across and 1.9 tall. */
export function makeConeTube(): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(coneTube()));
  // The tube itself, see-through.
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.56 * STUDY, 0.56 * STUDY, 2.2 * STUDY, 20, 1, true), new THREE.MeshBasicMaterial({ color: "#e8f4f8", transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  tube.position.y = 1.85 * STUDY;
  g.add(tube);
  machine(g, 1.3, 1.3, 3.0, {});
  return g;
}

/** Steel shake tins, upside down: about 0.83 across and 1.5 tall. */
export function makeTinStack(): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(tinStack()));
  machine(g, 1.25, 1.25, 2.3, {});
  return g;
}
