import * as THREE from "three";
import type { DrinkId, Size } from "../../game/types";
import { bakedMesh, Parts, rng } from "../bake";
import { toon } from "../materials";
import { STUDY } from "../units";
import { box, C, cached, cyl, lathe, machine, rbox, studySpace, tor } from "./kit";

/*
 * Drinks counter machines: the low fountain from the study (option a, at true height) with a
 * push button per drink, an ice bin as big as the fountain, counter stacks of cups and of lids
 * for each size, and the older lid and straw caddy. Study units below.
 */

/** Button, label and stream colours: a shade stronger than the drink itself so they read on the machine. */
export const DRINK_TINT: Record<DrinkId, string> = {
  pine: "#6aa877",
  pink: "#ea8ea6",
  cola: "#4a2522",
  water: "#8ec6dc",
  tea: "#b4651e",
  cucumber: "#8fc477",
  hibiscus: "#a8243f",
  lime: "#a7cc45",
  cider: "#d49a2c",
  bramble: "#5e2454",
};

/** Push buttons on the fountain: the three house drinks and the area's two. */
const TAPS = 5;

/** Real cup sizes at x1.1, in study units (the cup models use the same numbers). */
const CUP_R: Record<Size, number> = { S: 0.4, M: 0.5, L: 0.55 };
const CUP_H: Record<Size, number> = { S: 1.21, M: 1.6, L: 1.93 };

// ---- low fountain -------------------------------------------------------------

const PITCH = 1.2;
const FW = TAPS * PITCH + 0.4;
/** Cabinet height: raised from the study's 2.6 so a large cup at x1.1 clears the nozzles. */
const FH = 2.75;
/** Everything sits 0.5 forward of the study's model so the footprint is centred. */
const FZ = 0.5;
const fx = (i: number) => (i - (TAPS - 1) / 2) * PITCH;
const TAP_LIST = Array.from({ length: TAPS }, (_, i) => i);
/** The push buttons stand along the front of the top, one over each nozzle. */
const BTN = { z: -0.95, w: PITCH - 0.14, d: 0.9 };

const fountainBody = cached(() => {
  const p = new Parts();
  p.add(rbox(FW, FH, 2.0, 0.08), C.red, { p: [0, FH / 2, -1.6 + FZ] });
  p.add(rbox(FW + 0.1, 0.16, 2.1, 0.05), C.cream, { p: [0, FH + 0.08, -1.6 + FZ] });
  p.add(box(FW - 0.4, 0.5, 0.04), "#b63c31", { p: [0, 0.6, -0.59 + FZ], ink: false });
  // Drip tray with its grate.
  const tw = FW - 0.2;
  p.add(rbox(tw, 0.16, 2.1, 0.05), "#3a3f41", { p: [0, 0.08, 0.55 + FZ] });
  for (let i = 0; i < Math.round(tw / 0.22); i++) p.add(box(0.06, 0.02, 2.1 - 0.25), "#5a6164", { p: [-tw / 2 + 0.2 + i * 0.22, 0.17, 0.55 + FZ], ink: false });
  TAP_LIST.forEach((i) => {
    const x = fx(i);
    // A dark well for each push button (the button cap with its name is drawn over it as UI),
    // then the valve and nozzle over the drip tray. The tint strip behind the button is its
    // own mesh (see makeFountain), since the drinks change with the area.
    p.add(rbox(BTN.w, 0.12, BTN.d, 0.05), "#2d3336", { p: [x, FH + 0.18, BTN.z + FZ] });
    p.add(rbox(0.36, 0.24, 1.2, 0.05), "#8c9496", { p: [x, FH - 0.25, -0.2 + FZ] });
    p.add(cyl(0.09, 0.07, 0.16, 10), "#6f7779", { p: [x, FH - 0.44, 0.0 + FZ] });
  });
  return p;
});

type P3 = { x: number; y: number; z: number };

export interface FountainObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    /** Paint the tint strips behind the buttons for these drinks, left to right. */
    setDrinks: (drinks: readonly DrinkId[]) => void;
    spots: {
      /** Cup base under each nozzle, left to right. */
      cups: P3[];
      /** Where each pour stream starts (the spout tip). */
      nozzles: P3[];
      /** The push buttons along the front of the top (their caps are UI drawn here). */
      buttons: P3[];
    };
  };
}

/** The low fountain, in game units: 4.27 x 2.8, 1.95 tall, nozzles 0.8 apart. */
export function makeFountain(): FountainObject {
  const g = new THREE.Group() as FountainObject;
  g.add(bakedMesh(fountainBody()));
  const strips = studySpace();
  const stripGeo = rbox(BTN.w - 0.1, 0.05, 0.4, 0.03);
  const meshes = TAP_LIST.map((i) => {
    const m = new THREE.Mesh(stripGeo, toon("#888888"));
    m.position.set(fx(i), FH + 0.19, BTN.z - 0.75 + FZ);
    strips.add(m);
    return m;
  });
  g.add(strips);
  const S = STUDY;
  machine(g, FW, 4.2, FH + 0.3, {
    cups: TAP_LIST.map((i) => ({ x: fx(i) * S, y: 0.18 * S, z: (0.15 + FZ) * S })),
    nozzles: TAP_LIST.map((i) => ({ x: fx(i) * S, y: (FH - 0.52) * S, z: FZ * S })),
    buttons: TAP_LIST.map((i) => ({ x: fx(i) * S, y: (FH + 0.24) * S, z: (BTN.z + FZ) * S })),
  });
  g.userData.setDrinks = (drinks) => meshes.forEach((m, i) => (m.material = toon(DRINK_TINT[drinks[i]] ?? "#888888")));
  return g;
}

// ---- ice bin ----------------------------------------------------------------------

/** The ice bin: one open steel well heaped with cubes, full width as wide as the fountain. */
const IW_FULL = FW - 0.2;
const ID = 3.6;
const IH = 0.75;

const ICE_BODIES = new Map<number, ReturnType<ReturnType<typeof cached>>>();
function iceBody(widthK: number) {
  let b = ICE_BODIES.get(widthK);
  if (!b) ICE_BODIES.set(widthK, (b = cached(() => buildIce(IW_FULL * widthK))()));
  return b;
}
function buildIce(IW: number): Parts {
  const p = new Parts();
  const r = rng(12);
  const t = 0.14;
  p.add(rbox(IW, 0.12, ID, 0.05), C.steel, { p: [0, 0.06, 0] });
  for (const z of [-ID / 2 + t / 2, ID / 2 - t / 2]) p.add(rbox(IW, IH, t, 0.04), C.steel, { p: [0, IH / 2, z] });
  for (const x of [-IW / 2 + t / 2, IW / 2 - t / 2]) p.add(rbox(t, IH, ID - 2 * t, 0.04), C.steel, { p: [x, IH / 2, 0] });
  p.add(box(IW - 2 * t, 0.02, ID - 2 * t), "#9fb6bd", { p: [0, 0.3, 0], ink: false });
  // Cubes heaped higher in the middle, a little over the rim.
  const cube = box(0.32, 0.28, 0.32);
  for (let i = 0; i < Math.round((170 * IW) / IW_FULL); i++) {
    const x = (r() - 0.5) * (IW - 0.5);
    const z = (r() - 0.5) * (ID - 0.5);
    const heap = 1 - Math.hypot(x / (IW / 2), z / (ID / 2)) * 0.6;
    p.add(cube, i % 5 ? "#e4f5fb" : "#cfeaf4", { p: [x, 0.42 + r() * 0.35 * heap + (i > 90 ? 0.18 * heap : 0), z], r: [r() * 1.2, r() * 3.1, r() * 1.2], ink: 0.01 });
  }
  // The scoop resting in the corner.
  p.add(cyl(0.28, 0.22, 0.42, 12, true), "#d7dedd", { p: [IW / 2 - 0.7, 0.95, ID / 2 - 0.75], r: [0, 0, Math.PI / 2 - 0.25] });
  p.add(cyl(0.06, 0.06, 0.8, 8), "#3a3633", { p: [IW / 2 - 1.3, 1.02, ID / 2 - 0.75], r: [0, 0, Math.PI / 2 - 0.1] });
  return p;
}

/** The ice bin, in game units: 4.13 x 2.4 at full width (`widthK` narrows it), 0.5 tall. Grab a scoop from anywhere on it. */
export function makeIceWell(widthK = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(iceBody(widthK)));
  machine(g, IW_FULL * widthK, ID, IH, {});
  return g;
}

// ---- cup and lid stacks ------------------------------------------------------------

/** How much each nested cup or lid adds to a stack, study units. */
const CUP_NEST = 0.1;
const LID_NEST = 0.07;
const STACKS = new Map<string, ReturnType<ReturnType<typeof cached>>>();
const stacked = (key: string, build: () => Parts) => {
  let b = STACKS.get(key);
  if (!b) STACKS.set(key, (b = cached(build)()));
  return b;
};

/**
 * Empty cups nested mouth up, as a counter stack: you see the rims step up the side and the
 * top cup's mouth. Study units match the cup models at real size; game units out.
 */
export function makeCupStack(size: Size, count: number): THREE.Group {
  const g = new THREE.Group();
  if (count <= 0) return g;
  const n = Math.min(count, 12);
  g.add(
    bakedMesh(
      stacked(`c${size}${n}`, () => {
        const p = new Parts();
        const r = CUP_R[size] * 0.9;
        const h = CUP_H[size] * 0.9;
        for (let k = 0; k < n; k++) {
          const y = k * CUP_NEST;
          const top = k === n - 1;
          // Each cup's outer skin carries the outline; the top one is a whole cup, open to look into
          // (the shell runs up the outside, over the rolled rim and down the inside to its floor).
          p.add(lathe([[0, 0], [r * 0.74, 0], [r, h]], 22), k % 2 ? "#f6f3ec" : "#ece8de", { p: [0, y, 0], ink: top ? 0.014 : 0.006 });
          if (top) p.add(lathe([[r * 0.74, 0], [r, h], [r + 0.025, h + 0.01], [r - 0.012, h + 0.01], [r * 0.74 - 0.012, 0.05], [0, 0.05]], 22), "#e9e4d8", { p: [0, y, 0], ink: false });
        }
        return p;
      }),
    ),
  );
  return g;
}

/** Lids for one cup size stacked on a small steel plate. */
export function makeLidStackSized(size: Size, count: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(0, Math.min(count, 12));
  g.add(
    bakedMesh(
      stacked(`l${size}${n}`, () => {
        const p = new Parts();
        const r = CUP_R[size] * 0.9 + 0.04;
        p.add(rbox(r * 2 + 0.3, 0.08, r * 2 + 0.3, 0.04), C.steelL, { p: [0, 0.04, 0] });
        for (let k = 0; k < n; k++) p.add(cyl(r, r - 0.02, 0.06, 22), "#f8f8f4", { p: [0, 0.11 + k * LID_NEST, 0], ink: k === n - 1 ? 0.012 : 0.005 });
        if (n) p.add(tor(r * 0.62, 0.035, 5, 22), "#f8f8f4", { p: [0, 0.15 + (n - 1) * LID_NEST, 0], r: [Math.PI / 2, 0, 0], ink: 0.008 });
        return p;
      }),
    ),
  );
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
    /** Paint the tint strips behind the buttons for these drinks, left to right. */
    setDrinks: (drinks: readonly DrinkId[]) => void;
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
