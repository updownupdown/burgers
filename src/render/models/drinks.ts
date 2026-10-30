import * as THREE from "three";
import type { DrinkId, Size } from "../../game/types";
import { DRINK_COLOR } from "../../game/types";
import { faceted, INK, mesh, shareGeometry, toon } from "../materials";

/*
 * Drinks-page models: cups (with liquid, ice, lid and straw), the lid stack, the straw
 * holder, the ice bin and the under-counter supplies cupboard. Everything here is built
 * from shared geometry; only the few parts that depend on flavour pick a material per cup,
 * and those come from the material cache, so cups are cheap to make and throw away.
 */

export interface CupObject extends THREE.Group {
  userData: {
    flavor: DrinkId;
    /** Liquid level 0..1; the ice rides on top of it. */
    setFill: (f: number) => void;
    setIce: (on: boolean) => void;
    setLid: (on: boolean) => void;
    setStraw: (on: boolean) => void;
  };
}

// A large cup, before CUP_SCALE: 0.88 wide at the rim, 1.05 tall (a patty is ~2 wide).
const CUP_R_TOP = 0.44;
const CUP_R_BOT = 0.33;
const CUP_H = 1.05;
const FLOOR_Y = 0.07;
const CUP_WALL = shareGeometry(faceted(new THREE.CylinderGeometry(CUP_R_TOP, CUP_R_BOT, CUP_H, 14, 1, true)));
const CUP_BASE = shareGeometry(faceted(new THREE.CylinderGeometry(CUP_R_BOT + 0.01, CUP_R_BOT - 0.02, 0.07, 14)));
const CUP_FLOOR = shareGeometry(new THREE.CircleGeometry(CUP_R_BOT + 0.005, 14));
const CUP_RIM = shareGeometry(faceted(new THREE.TorusGeometry(CUP_R_TOP, 0.035, 6, 14)));
const CUP_STRIPE = shareGeometry(faceted(new THREE.CylinderGeometry(0.425, 0.395, 0.26, 14, 1, true)));
const CUP_LIQUID = shareGeometry(faceted(new THREE.CylinderGeometry(0.42, 0.3, 1, 14)));
const ICE_CUBE = shareGeometry(faceted(new THREE.BoxGeometry(0.17, 0.15, 0.17)));
const LID = shareGeometry(faceted(new THREE.CylinderGeometry(0.47, 0.455, 0.08, 14)));
const LID_RIDGE = shareGeometry(faceted(new THREE.TorusGeometry(0.29, 0.035, 6, 14)));
const LID_HOLE = shareGeometry(new THREE.CircleGeometry(0.065, 8));
const STRAW = shareGeometry(faceted(new THREE.CylinderGeometry(0.042, 0.042, 0.78, 6)));
const STRAW_TIP = shareGeometry(faceted(new THREE.CylinderGeometry(0.042, 0.042, 0.3, 6)));
const STRAW_BAND = shareGeometry(faceted(new THREE.CylinderGeometry(0.047, 0.047, 0.07, 6)));

const CUP_PAPER = "#f3f1ea";
const CUP_INSIDE = "#d9d4c6";
const ICE = "#e4f5fb";
const STRAW_RED = "#e5432b";

/** Cup sizes: width and height factors on the large cup. They read as three different cups, and still nest. */
export const CUP_SCALE: Record<Size, [number, number]> = { S: [0.72, 0.66], M: [0.86, 0.84], L: [1, 1] };

/** Where the ice cubes sit in a cup, around the centre, jittered so they read as a handful. */
const CUP_ICE: { x: number; z: number; r: number; dy: number }[] = [
  { x: 0.12, z: -0.1, r: 0.3, dy: 0 },
  { x: -0.15, z: 0.12, r: 1.1, dy: -0.03 },
  { x: -0.05, z: -0.2, r: 2.1, dy: 0.04 },
  { x: 0.18, z: 0.16, r: 0.7, dy: -0.06 },
  { x: -0.2, z: -0.06, r: 1.6, dy: 0.02 },
];

/**
 * A cup: paper wall with a visible floor and rim, the drink inside, and optional ice,
 * lid and straw. With no flavour it's a plain empty cup for the stacks. `lid` is only
 * the starting lid state; `setLid` toggles it later.
 */
export function makeCup(flavor: DrinkId | null, lid: boolean, size: Size = "M"): CupObject {
  const g = new THREE.Group() as CupObject;
  const body = new THREE.Group();
  const [sw, sh] = CUP_SCALE[size];
  body.scale.set(sw, sh, sw);
  g.add(body);

  const wall = mesh(CUP_WALL, CUP_PAPER, { side: THREE.DoubleSide });
  wall.position.y = CUP_H / 2;
  const base = mesh(CUP_BASE, CUP_PAPER);
  base.position.y = 0.035;
  const floor = mesh(CUP_FLOOR, CUP_INSIDE, { ink: false, shadow: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  const rim = mesh(CUP_RIM, CUP_PAPER, { ink: 1.12 });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CUP_H;
  const stripe = mesh(CUP_STRIPE, flavor ? DRINK_COLOR[flavor] : "#c9c4b8", { side: THREE.DoubleSide, ink: false });
  stripe.position.y = 0.56;
  body.add(wall, base, floor, rim, stripe);

  const liquidColor = flavor ? DRINK_COLOR[flavor] : "#ffffff";
  const liquid = mesh(CUP_LIQUID, liquidColor, { ink: false, shadow: false, opacity: flavor === "water" ? 0.62 : 1 });
  body.add(liquid);

  const ice = new THREE.Group();
  for (const c of CUP_ICE) {
    const cube = mesh(ICE_CUBE, ICE, { ink: 1.12, shadow: false });
    cube.position.set(c.x, c.dy, c.z);
    cube.rotation.set(c.r * 0.5, c.r, c.r * 0.3);
    ice.add(cube);
  }
  ice.visible = false;
  body.add(ice);

  const top = new THREE.Group();
  const cap = mesh(LID, "#f8f8f4");
  cap.position.y = CUP_H + 0.04;
  const ridge = mesh(LID_RIDGE, "#f8f8f4", { ink: 1.1 });
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = CUP_H + 0.085;
  const hole = mesh(LID_HOLE, "#3a3633", { ink: false, shadow: false });
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0.13, CUP_H + 0.085, 0.02);
  top.add(cap, ridge, hole);
  top.visible = lid;
  body.add(top);

  // The straw leans back from the hole and bends over at the top, so it reads from above.
  const straw = new THREE.Group();
  straw.position.set(0.13, CUP_H - 0.1, 0.02);
  straw.rotation.z = -0.14;
  straw.rotation.x = 0.1;
  const tube = mesh(STRAW, STRAW_RED, { ink: 1.18, shadow: false });
  tube.position.y = 0.39;
  const band = mesh(STRAW_BAND, "#fbe9e4", { ink: false, shadow: false });
  band.position.y = 0.6;
  const tip = mesh(STRAW_TIP, STRAW_RED, { ink: 1.18, shadow: false });
  tip.position.set(0.11, 0.86, 0);
  tip.rotation.z = -0.95;
  straw.add(tube, band, tip);
  straw.visible = false;
  body.add(straw);

  let fill = 0;
  const place = () => {
    const h = Math.max(0.001, Math.min(1, fill)) * (CUP_H - FLOOR_Y - 0.03);
    liquid.visible = fill > 0.01;
    const r = (CUP_R_BOT + 0.11 * (FLOOR_Y + h) / CUP_H - 0.015) / 0.42;
    liquid.scale.set(r, h, r);
    liquid.position.y = FLOOR_Y + h / 2;
    // Ice floats at the surface, or sits on the floor of an empty cup.
    ice.position.y = Math.min(CUP_H - 0.12, FLOOR_Y + h + (fill > 0.01 ? -0.03 : 0.07));
  };
  g.userData = {
    flavor: flavor ?? "cola",
    setFill: (f) => {
      fill = f;
      place();
    },
    setIce: (on) => {
      ice.visible = on;
    },
    setLid: (on) => {
      top.visible = on;
    },
    setStraw: (on) => {
      straw.visible = on;
    },
  };
  place();
  return g;
}

/** Many copies of one outlined shape in two draw calls. */
function instanced(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: THREE.Matrix4[], ink = 1.1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.InstancedMesh(geo, toon(color), xf.length);
  const hull = new THREE.InstancedMesh(geo, INK, xf.length);
  const m = new THREE.Matrix4();
  const s = new THREE.Matrix4().makeScale(ink, ink, ink);
  xf.forEach((x, i) => {
    body.setMatrixAt(i, x);
    hull.setMatrixAt(i, m.multiplyMatrices(x, s));
  });
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body, hull);
  return g;
}

const compose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

/** Deterministic jitter so the models look the same every build. */
function jitter(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const LID_TRAY = shareGeometry(faceted(new THREE.BoxGeometry(1.1, 0.1, 1.1)));
const LID_POST = shareGeometry(faceted(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6)));

/** Lids stacked on a little four-post holder. */
export function makeLidStack(count: number): THREE.Group {
  const g = new THREE.Group();
  const tray = mesh(LID_TRAY, "#5b6366");
  tray.position.y = 0.05;
  g.add(tray);
  for (const [x, z] of [
    [-0.43, -0.43],
    [0.43, -0.43],
    [-0.43, 0.43],
    [0.43, 0.43],
  ]) {
    const post = mesh(LID_POST, "#8c9496", { ink: 1.25 });
    post.position.set(x, 0.5, z);
    g.add(post);
  }
  const xf: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i++) xf.push(compose(0, 0.14 + i * 0.055, 0, 0, (i % 3) * 0.3, 0, 0.9));
  if (count > 0) {
    g.add(instanced(LID, "#f8f8f4", xf, 1.06));
    // Ridges only on the top lid, so the stack reads as lids without the extra draw calls.
    const ridge = mesh(LID_RIDGE, "#f8f8f4", { ink: 1.1 });
    ridge.rotation.x = Math.PI / 2;
    ridge.scale.setScalar(0.9);
    ridge.position.y = 0.14 + (count - 1) * 0.055 + 0.05;
    g.add(ridge);
  }
  return g;
}

const STRAW_CUP = shareGeometry(faceted(new THREE.CylinderGeometry(0.36, 0.3, 0.8, 12)));
const STRAW_CUP_MOUTH = shareGeometry(new THREE.CircleGeometry(0.33, 12));
const STRAW_LONG = shareGeometry(faceted(new THREE.CylinderGeometry(0.042, 0.042, 1.25, 6)));

/** A steel pot of straws, red and white, leaning every which way. */
export function makeStrawHolder(): THREE.Group {
  const g = new THREE.Group();
  const pot = mesh(STRAW_CUP, "#9aa3a6");
  pot.position.y = 0.4;
  const mouth = mesh(STRAW_CUP_MOUTH, "#4a5255", { ink: false, shadow: false });
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.805;
  g.add(pot, mouth);
  const rnd = jitter(7);
  const red: THREE.Matrix4[] = [];
  const white: THREE.Matrix4[] = [];
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.2;
    const lean = 0.08 + rnd() * 0.22;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Lean outward from the centre so the bunch fans out of the pot.
    (i % 2 ? red : white).push(compose(x, 0.55 + rnd() * 0.08, z, lean * Math.sin(a), 0, -lean * Math.cos(a)));
  }
  g.add(instanced(STRAW_LONG, STRAW_RED, red, 1.18), instanced(STRAW_LONG, "#fbe9e4", white, 1.18));
  return g;
}

const ICE_BIN = shareGeometry(faceted(new THREE.BoxGeometry(1.9, 0.62, 1.35)));
const ICE_BIN_WELL = shareGeometry(faceted(new THREE.BoxGeometry(1.7, 0.5, 1.15)));
const SCOOP_BOWL = shareGeometry(faceted(new THREE.CylinderGeometry(0.17, 0.14, 0.26, 8, 1, true)));
const SCOOP_HANDLE = shareGeometry(faceted(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6)));

/** A steel ice well heaped with cubes, with a scoop resting on top. */
export function makeIceBin(): THREE.Group {
  const g = new THREE.Group();
  const bin = mesh(ICE_BIN, "#b9c4c1");
  bin.position.y = 0.31;
  const well = mesh(ICE_BIN_WELL, "#6f7a7c", { ink: false, shadow: false });
  well.position.y = 0.4;
  g.add(bin, well);
  const rnd = jitter(3);
  const xf: THREE.Matrix4[] = [];
  for (let i = 0; i < 48; i++) {
    const x = -0.72 + rnd() * 1.44;
    const z = -0.45 + rnd() * 0.9;
    // Heaped: taller toward the middle.
    const heap = 1 - Math.hypot(x / 0.8, z / 0.5) * 0.45;
    const y = 0.5 + rnd() * 0.22 * heap + (i < 24 ? 0 : 0.11);
    xf.push(compose(x, y, z, rnd() * 1.2, rnd() * 3.1, rnd() * 1.2, 0.85 + rnd() * 0.35));
  }
  g.add(instanced(ICE_CUBE, ICE, xf, 1.12));
  const scoop = new THREE.Group();
  const bowl = mesh(SCOOP_BOWL, "#d7dedd", { side: THREE.DoubleSide });
  bowl.rotation.z = Math.PI / 2;
  const handle = mesh(SCOOP_HANDLE, "#3a3633", { ink: 1.2 });
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.38;
  scoop.add(bowl, handle);
  scoop.position.set(0.45, 0.82, 0.3);
  scoop.rotation.y = -0.5;
  g.add(scoop);
  return g;
}

export interface CupboardObject extends THREE.Group {
  userData: {
    /** 0 = doors shut, 1 = swung open. */
    setOpen: (t: number) => void;
    /** Where a sleeve can sit, in the cupboard's local space: top shelf left to right, then the bottom shelf. */
    shelves: THREE.Vector3[];
  };
}

const CB_W = 5.2;
const CB_H = 2.7;
const CB_D = 2.0;
const CB_TOP = -0.2;
const CB_WOOD = "#8a5a37";
const CB_DOOR = "#a8703f";
const CB_PANEL = shareGeometry(faceted(new THREE.BoxGeometry(1, 1, 1)));
const CB_HANDLE = shareGeometry(faceted(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8)));
const CB_KNOB = shareGeometry(faceted(new THREE.SphereGeometry(0.07, 8, 6)));

function panel(w: number, h: number, d: number, x: number, y: number, z: number, color: string, ink?: number | false): THREE.Mesh {
  const m = mesh(CB_PANEL, color, { ink });
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

/**
 * The cupboard under the counter's front edge, where sleeves of cups and cartons live.
 * Its origin is the counter top at the cupboard's front face: it hangs from y −0.2 down
 * to −2.9 and goes back 2 units from z 0. Two doors hinged at the outer edges swing out
 * toward the player with `setOpen`.
 */
export function makeCupboard(): CupboardObject {
  const g = new THREE.Group() as CupboardObject;
  const cy = CB_TOP - CB_H / 2;
  const cz = -CB_D / 2;
  const t = 0.14;
  // Carcass: back, floor, top, sides. Built as panels so the inside is a real cavity.
  g.add(
    panel(CB_W, CB_H, t, 0, cy, -CB_D + t / 2, "#5c3a22", false),
    panel(CB_W, t, CB_D, 0, CB_TOP - CB_H + t / 2, cz, CB_WOOD),
    panel(CB_W, t, CB_D, 0, CB_TOP - t / 2, cz, CB_WOOD),
    panel(t, CB_H, CB_D, -CB_W / 2 + t / 2, cy, cz, CB_WOOD),
    panel(t, CB_H, CB_D, CB_W / 2 - t / 2, cy, cz, CB_WOOD),
    // Shelf and the inner back wall shading.
    panel(CB_W - 2 * t, 0.1, CB_D - t - 0.2, 0, CB_TOP - CB_H * 0.5, cz - 0.05, "#a06a40"),
    panel(CB_W - 2 * t, CB_H - 2 * t, 0.02, 0, cy, -CB_D + t + 0.02, "#3a2314", false),
  );
  const shelfY = CB_TOP - CB_H * 0.5 + 0.05;
  const floorY = CB_TOP - CB_H + t;
  const shelves: THREE.Vector3[] = [];
  for (const y of [shelfY, floorY]) for (const x of [-1.65, 0, 1.65]) shelves.push(new THREE.Vector3(x, y, cz + 0.1));

  // Doors on pivots at the outer edges.
  const doorW = CB_W / 2 - 0.05;
  const pivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set((side * CB_W) / 2, 0, 0.05);
    const door = panel(doorW, CB_H - 0.1, 0.1, (-side * doorW) / 2 - side * 0.02, cy, 0, CB_DOOR);
    const inset = panel(doorW - 0.5, CB_H - 0.7, 0.03, (-side * doorW) / 2 - side * 0.02, cy, 0.06, "#b57a46", false);
    const handle = mesh(CB_HANDLE, "#e2b654", { ink: 1.15 });
    handle.position.set(-side * (doorW - 0.3), cy + 0.05, 0.14);
    const knobA = mesh(CB_KNOB, "#e2b654", { ink: false });
    knobA.position.set(-side * (doorW - 0.3), cy + 0.25, 0.1);
    const knobB = knobA.clone();
    knobB.position.y = cy - 0.15;
    pivot.add(door, inset, handle, knobA, knobB);
    pivots.push(pivot);
    g.add(pivot);
  }
  g.userData = {
    shelves,
    setOpen: (open) => {
      const a = Math.max(0, Math.min(1, open)) * 1.85;
      pivots[0].rotation.y = -a;
      pivots[1].rotation.y = a;
    },
  };
  g.userData.setOpen(0);
  return g;
}

