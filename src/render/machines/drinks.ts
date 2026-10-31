import * as THREE from "three";
import { DRINK_LABEL, DRINKS, type DrinkId, type Size } from "../../game/types";
import { bakedMesh, Parts, rng } from "../bake";
import { toon } from "../materials";
import { STUDY } from "../units";
import { box, C, cached, canvasTex, cyl, decal, FONT, lathe, machine, rbox, studySpace, textDecal } from "./kit";

/*
 * Drinks counter machines from the study: the low fountain (option a, at true height), the
 * ice and cup tower from the "Ice and drink tower" layout, and a lid and straw caddy.
 * Study units below.
 */

/** Button, label and stream colours: a shade stronger than the drink itself so they read on the machine. */
export const DRINK_TINT: Record<DrinkId, string> = { pine: "#6aa877", pink: "#ea8ea6", cola: "#4a2522", water: "#8ec6dc", tea: "#b4651e" };

/** Real cup sizes at x1.1, in study units (the cup models use the same numbers). */
const CUP_R: Record<Size, number> = { S: 0.4, M: 0.5, L: 0.55 };
const CUP_H: Record<Size, number> = { S: 1.21, M: 1.6, L: 1.93 };

// ---- low fountain -------------------------------------------------------------

const FW = 7.0;
/** Cabinet height: raised from the study's 2.6 so a large cup at x1.1 clears the nozzles. */
const FH = 2.75;
const PITCH = 1.3;
/** Everything sits 0.5 forward of the study's model so the footprint is centred. */
const FZ = 0.5;
const fx = (i: number) => (i - (DRINKS.length - 1) / 2) * PITCH;

const fountainBody = cached(() => {
  const p = new Parts();
  p.add(rbox(FW, FH, 2.0, 0.08), C.red, { p: [0, FH / 2, -1.6 + FZ] });
  p.add(rbox(FW + 0.1, 0.16, 2.1, 0.05), C.cream, { p: [0, FH + 0.08, -1.6 + FZ] });
  p.add(box(FW - 0.4, 0.5, 0.04), "#b63c31", { p: [0, 0.6, -0.59 + FZ], ink: false });
  // Drip tray with its grate.
  const tw = FW - 0.2;
  p.add(rbox(tw, 0.16, 2.1, 0.05), "#3a3f41", { p: [0, 0.08, 0.55 + FZ] });
  for (let i = 0; i < Math.round(tw / 0.22); i++) p.add(box(0.06, 0.02, 2.1 - 0.25), "#5a6164", { p: [-tw / 2 + 0.2 + i * 0.22, 0.17, 0.55 + FZ], ink: false });
  DRINKS.forEach((f, i) => {
    const x = fx(i);
    p.add(rbox(PITCH - 0.16, 0.06, 1.5, 0.04), "#f8f6ef", { p: [x, FH + 0.19, -1.7 + FZ], ink: false });
    p.add(cyl(0.42, 0.46, 0.22, 24), DRINK_TINT[f], { p: [x, FH + 0.32, -1.8 + FZ] });
    p.add(cyl(0.22, 0.22, 0.02, 14), "#ffffff", { p: [x - 0.1, FH + 0.44, -1.92 + FZ], ink: false });
    p.add(rbox(0.36, 0.24, 1.2, 0.05), "#8c9496", { p: [x, FH - 0.25, -0.2 + FZ] });
    p.add(cyl(0.09, 0.07, 0.16, 10), "#6f7779", { p: [x, FH - 0.44, 0.0 + FZ] });
  });
  return p;
});

const flavorTex = new Map<DrinkId, THREE.CanvasTexture>();
function nameplate(f: DrinkId): THREE.CanvasTexture {
  let t = flavorTex.get(f);
  if (!t) {
    const name = DRINK_LABEL[f];
    t = canvasTex(256, 96, (x, w, h) => {
      x.fillStyle = "#fbf7ee";
      x.beginPath();
      x.roundRect(2, 2, w - 4, h - 4, 14);
      x.fill();
      x.fillStyle = DRINK_TINT[f];
      x.fillRect(2, 2, w - 4, 16);
      x.fillStyle = "#3b2a3a";
      x.font = `800 ${name.length > 10 ? 30 : 38}px ${FONT}`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(name, w / 2, h / 2 + 8);
    });
    flavorTex.set(f, t);
  }
  return t;
}

type P3 = { x: number; y: number; z: number };

export interface FountainObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Cup base under each nozzle, in DRINKS order. */
      cups: P3[];
      /** Where each pour stream starts (the spout tip). */
      nozzles: P3[];
      /** Name plates, and the big buttons on top. */
      labels: P3[];
      buttons: P3[];
    };
  };
}

/** The low fountain, in game units: 4.67 x 2.8, 2.17 tall, nozzles 0.87 apart. */
export function makeFountain(): FountainObject {
  const g = new THREE.Group() as FountainObject;
  g.add(bakedMesh(fountainBody()));
  const st = studySpace();
  g.add(st);
  DRINKS.forEach((f, i) => {
    const d = decal(nameplate(f), 1.15, 0.43);
    d.position.set(fx(i), FH + 0.23, -0.82 + FZ);
    st.add(d);
  });
  const S = STUDY;
  machine(g, FW, 4.2, FH + 0.5, {
    cups: DRINKS.map((_, i) => ({ x: fx(i) * S, y: 0.18 * S, z: (0.15 + FZ) * S })),
    nozzles: DRINKS.map((_, i) => ({ x: fx(i) * S, y: (FH - 0.52) * S, z: FZ * S })),
    labels: DRINKS.map((_, i) => ({ x: fx(i) * S, y: (FH + 0.23) * S, z: (-0.82 + FZ) * S })),
    buttons: DRINKS.map((_, i) => ({ x: fx(i) * S, y: (FH + 0.43) * S, z: (-1.8 + FZ) * S })),
  });
  return g;
}

// ---- ice and cup tower ----------------------------------------------------------

const TW = 3.6;
const TH = 3.2;
/** Tower body runs from z -1.7 to 0.3; the ice tray sits in front of it. */
const TZ = -0.7;
const TUBE_X: Record<Size, number> = { S: -1.05, M: 0, L: 1.2 };
const TUBE_Z = -1.2;
const LEVER = { y: 1.6, z: 0.42 };
const ICE_CUP = { y: 0.08, z: 1.05 };

const towerBody = cached(() => {
  const p = new Parts();
  p.add(rbox(TW, TH, 2.0, 0.08), "#e3e8e6", { p: [0, TH / 2, TZ] });
  // Ice chute head, the lever (a big blueberry paddle) and the ice tray under it.
  p.add(rbox(1.6, 0.7, 0.5, 0.06), C.steelD, { p: [0, TH - 1.1, 0.45] });
  p.add(rbox(0.5, 1.2, 0.18, 0.08), "#6a8fd8", { p: [0, LEVER.y, LEVER.z], r: [-0.35, 0, 0] });
  p.add(rbox(2.6, 0.08, 1.3, 0.03), "#3a3f41", { p: [0, 0.04, ICE_CUP.z] });
  for (let i = 0; i < 11; i++) p.add(box(0.05, 0.02, 1.1), "#5a6164", { p: [-1.1 + i * 0.22, 0.09, ICE_CUP.z], ink: false });
  // A cup tube per size on top: a steel collar, a clear tube, and a nested stack of cups mouth down.
  for (const s of ["S", "M", "L"] as Size[]) {
    const x = TUBE_X[s];
    const r = CUP_R[s];
    const h = CUP_H[s];
    p.add(cyl(r + 0.06, r + 0.06, 0.12, 22), C.steelD, { p: [x, TH + 0.06, TUBE_Z] });
    for (let k = 0; k < 7; k++) {
      // Each cup upside down: rim at the bottom, base on top, nested 0.07 apart.
      const y = TH + 0.14 + k * 0.07;
      p.add(lathe([[r, 0], [r * 0.74, h], [0, h]], 22), k % 2 ? "#f3f1ea" : "#ebe7dc", { p: [x, y, TUBE_Z], ink: k === 0 ? 0.012 : false });
    }
  }
  return p;
});

const tubeGeo = (s: Size) => cyl(CUP_R[s] + 0.05, CUP_R[s] + 0.05, 2.4, 20, true);

export interface DrinkTowerObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Mouth of each inverted cup tube: pull a cup down from here. */
      tubes: Record<Size, P3>;
      /** Cup base under the ice chute. */
      ice: P3;
      /** The ice lever. */
      lever: P3;
    };
  };
}

/** The ice and cup tower, in game units: 2.4 x 2.27, 3.8 tall with the cup tubes. */
export function makeDrinkTower(): DrinkTowerObject {
  const g = new THREE.Group() as DrinkTowerObject;
  g.add(bakedMesh(towerBody()));
  const st = studySpace();
  g.add(st);
  const glass = toon("#e9eef0", { opacity: 0.4, side: THREE.DoubleSide });
  for (const s of ["S", "M", "L"] as Size[]) {
    const tube = new THREE.Mesh(tubeGeo(s), glass);
    tube.position.set(TUBE_X[s], TH + 1.3, TUBE_Z);
    tube.renderOrder = 3;
    tube.castShadow = false;
    st.add(tube);
    const lbl = textDecal(s, 0.34, { bg: "#3b2a3a", color: "#ffffff", fs: 64, w: 90, h: 90 });
    lbl.position.set(TUBE_X[s], TH + 0.005, -0.1);
    st.add(lbl);
  }
  const S = STUDY;
  machine(g, TW, 3.4, TH + 2.5, {
    tubes: Object.fromEntries((["S", "M", "L"] as Size[]).map((s) => [s, { x: TUBE_X[s] * S, y: TH * S, z: TUBE_Z * S }])) as Record<Size, P3>,
    ice: { x: 0, y: ICE_CUP.y * S, z: ICE_CUP.z * S },
    lever: { x: 0, y: LEVER.y * S, z: LEVER.z * S },
  });
  return g;
}

// ---- lid and straw caddy --------------------------------------------------------

const LID_R = 0.58;

const caddyBody = cached(() => {
  const p = new Parts();
  const r = rng(4);
  p.add(rbox(2.6, 0.4, 1.0, 0.08), C.steelL, { p: [0, 0.2, 0] });
  for (let i = 0; i < 8; i++) p.add(cyl(LID_R, LID_R - 0.02, 0.06, 22), "#f8f8f4", { p: [-0.6, 0.43 + i * 0.065, 0], ink: i === 7 ? 0.012 : false });
  // Straws standing in a steel pot, red and white, fanning out.
  p.add(cyl(0.3, 0.26, 0.7, 14), "#9aa3a6", { p: [0.75, 0.75, 0] });
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * 0.16;
    const lean = 0.06 + r() * 0.16;
    p.add(cyl(0.035, 0.035, 1.6, 6), i % 2 ? "#e5432b" : "#f6efe6", { p: [0.75 + Math.cos(a) * rr, 1.3, Math.sin(a) * rr], r: [lean * Math.sin(a), 0, -lean * Math.cos(a)], ink: 0.008 });
  }
  return p;
});

export interface LidStrawCaddyObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: { lids: P3; straws: P3 };
  };
}

/** Lids and straws in one slim caddy, in game units: 1.73 x 0.67, 1.4 tall. */
export function makeLidStrawCaddy(): LidStrawCaddyObject {
  const g = new THREE.Group() as LidStrawCaddyObject;
  g.add(bakedMesh(caddyBody()));
  const S = STUDY;
  machine(g, 2.6, 1.0, 2.1, { lids: { x: -0.6 * S, y: 0.95 * S, z: 0 }, straws: { x: 0.75 * S, y: 1.1 * S, z: 0 } });
  return g;
}
