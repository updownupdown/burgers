import * as THREE from "three";
import { avgCook, bunToast, cookLevel, isFlipped, isMelted, MARKED } from "../game/cooking";
import type { Kind, Piece } from "../game/types";
import { BREADS, COUNTED, isSauce, SAUCE_RADIUS } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, grade, lineColor, lineMaterial, mesh, outline, ramp, shareGeometry, toon } from "./materials";
import { TOPPING_BOOST } from "./units";
import { makePaniniPiece, PANINI_HEIGHT } from "./panini";
import { makeTacoPiece, TACO_HEIGHT, FOLDED_HEIGHT } from "./tacos";
import { FLATBREAD_TOP, makeFlatbread, toppingMesh } from "./flatbread";

/*
 * Burger parts, from James's picks in the Kitchen Bench study: the sesame classic bun, a patty
 * that changes shape as well as colour, the slumping square of cheese, bold countable veg, and
 * crisp, lacy bacon and egg. Built in ingredient units (a patty is about 2 across); draw them
 * at SCALE.burger. Thin toppings are built TOPPING_BOOST bigger, so one scale covers them all.
 *
 * The assembled burger sits between the study's "True stack" and "Readable stack": every layer
 * but the bun is drawn THICK times its natural thickness, and stackBases() turns and steps each
 * layer back a little, so the rims below show from the steep camera.
 */

/** Layers other than buns and sauce are drawn this much thicker than life. */
const THICK = 1.12;
/** Thin toppings: drawn at x1.6 against x1.5 for burger parts. */
const VEG: ReadonlySet<Kind> = new Set<Kind>(["lettuce", "tomato", "onion", "pickle", "jalapeno", "basil", "avocado", "rocket", "redonion", "tuna", "mozzarella"]);
/** Outline width for baked food parts, in ingredient units (about 0.014 game units). */
const INK_W = 0.024;

/** Natural thickness of each piece, in ingredient units. */
const BASE_HEIGHT: Record<Kind, number> = {
  bun: 0.32,
  patty: 0.3,
  bacon: 0.12,
  egg: 0.15,
  cheese: 0.05,
  lettuce: 0.12,
  tomato: 0.13,
  onion: 0.12,
  pickle: 0.09,
  pineapple: 0.13,
  jalapeno: 0.1,
  ketchup: 0.04,
  mustard: 0.04,
  ...(PANINI_HEIGHT as Record<Exclude<Kind, "bun" | "patty" | "bacon" | "egg" | "cheese" | "lettuce" | "tomato" | "onion" | "pickle" | "pineapple" | "jalapeno" | "ketchup" | "mustard">, number>),
  ...(TACO_HEIGHT as Record<Exclude<Kind, "bun" | "patty" | "bacon" | "egg" | "cheese" | "lettuce" | "tomato" | "onion" | "pickle" | "pineapple" | "jalapeno" | "ketchup" | "mustard">, number>),
  // Orchard Isle's flatbread (drawn as one object, render/flatbread.ts) and what goes on it.
  dough: FLATBREAD_TOP,
  redsauce: 0.03,
  oil: 0.02,
  honey: 0.02,
  mushroom: 0.06,
  ham: 0.08,
  fig: 0.1,
  pear: 0.05,
  blue: 0.08,
};
/** Vertical and horizontal scale each kind is built at. */
const bodyScale = (k: Kind): [number, number] => {
  const w = VEG.has(k) ? TOPPING_BOOST : 1;
  return [w, k === "bun" || BREADS.has(k) || isSauce(k) ? 1 : w * THICK];
};

/** Thickness each piece adds to a stack, in ingredient units (a patty is ~2 units wide). */
export const LAYER_HEIGHT = Object.fromEntries((Object.keys(BASE_HEIGHT) as Kind[]).map((k) => [k, BASE_HEIGHT[k] * bodyScale(k)[1]])) as Record<Kind, number>;
export const TOP_BUN_HEIGHT = 0.74;

export type BunRole = "bottom" | "top";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

const pattyRamp = ramp([
  [0, "#d9737b"],
  [0.3, "#b5615a"],
  [0.55, "#8a4a33"],
  [0.78, "#5e3423"],
  [1.0, "#2c1b14"],
  [1.4, "#151010"],
]);
/** The seared crust on a patty's rim, a step darker than its face. */
const crustRamp = ramp([
  [0, "#c4686c"],
  [0.3, "#9c5440"],
  [0.55, "#6e3a24"],
  [0.8, "#4a2818"],
  [1.0, "#24150f"],
  [1.4, "#110c0b"],
]);
const toastRamp = ramp([
  [0, "#f4d79a"],
  [0.35, "#e3a453"],
  [0.7, "#b8702e"],
  [1.0, "#3b2216"],
]);
const baconMeat = ramp([
  [0, "#e26b78"],
  [0.5, "#b24a32"],
  [0.85, "#7a3018"],
  [1.2, "#2a1410"],
]);
const baconFat = ramp([
  [0, "#f8dcd6"],
  [0.5, "#eebb85"],
  [0.85, "#c98a4a"],
  [1.2, "#3a2418"],
]);
const eggWhite = ramp([
  [0, "#d9d2c8"],
  [0.4, "#fbfaf4"],
  [0.85, "#f4e6c8"],
  [1.2, "#a8743c"],
]);
const pineRamp = ramp([
  [0, "#f7dc4a"],
  [0.4, "#e8b03a"],
  [0.8, "#b9702a"],
  [1.1, "#4a2a16"],
]);

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const tmpC = new THREE.Color();
const tmpD = new THREE.Color();
const tmpE = new THREE.Color();

const cyl = (rt: number, rb: number, h: number, segs: number) => faceted(new THREE.CylinderGeometry(rt, rb, h, segs));
const tor = (r: number, t: number, rs: number, ts: number) => faceted(new THREE.TorusGeometry(r, t, rs, ts));
function lathe(points: [number, number][], segs = 32): THREE.BufferGeometry {
  return faceted(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs));
}
function warp(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...fn(p.getX(i), p.getY(i), p.getZ(i)));
  return faceted(g);
}
/** Paint every vertex of a non-indexed geometry with fn(i) -> colour. */
function paint(g: THREE.BufferGeometry, fn: (i: number) => THREE.Color): void {
  let col = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3);
    g.setAttribute("color", col);
  }
  for (let i = 0; i < col.count; i++) {
    const c = fn(i);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

/** A vertex-coloured toon mesh with an outline in a given colour. */
function vcMesh(geo: THREE.BufferGeometry, line: THREE.Color): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  outline(m, 1.03, line);
  return m;
}
function setLine(m: THREE.Mesh, c: THREE.Color): void {
  const hull = m.children.find((o) => o.name === "hull") as THREE.Mesh | undefined;
  if (hull) hull.material = lineMaterial(lineColor(c, tmpE));
}

// ---- bun: sesame classic --------------------------------------------------------

const HEEL: [number, number][] = [[0, 0], [0.92, 0], [1.0, 0.06], [1.03, 0.17], [0.99, 0.27], [0.9, 0.31], [0, 0.31]];
const CROWN: [number, number][] = [[0, 0], [0.98, 0], [1.05, 0.08], [1.03, 0.22], [0.9, 0.42], [0.66, 0.6], [0.36, 0.7], [0, 0.73]];

const GEO = {
  heel: shareGeometry(lathe(HEEL)),
  cutDisc: shareGeometry(cyl(0.93, 0.93, 0.025, 32)),
  rimDisc: shareGeometry(cyl(1.0, 1.0, 0.035, 32)),
  yolk: shareGeometry(faceted(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2))),
  spot: shareGeometry(faceted(new THREE.SphereGeometry(0.07, 8, 5))),
  eggMid: shareGeometry(cyl(0.6, 0.64, 0.02, 24)),
  pineapple: shareGeometry(lathe([[0.3, 0], [0.88, 0], [0.92, 0.06], [0.88, 0.12], [0.3, 0.12], [0.28, 0.06], [0.3, 0]], 18)),
};

/** The crown and its sesame seeds, baked into one mesh. Seeds sit on the dome's surface. */
let crownBaked: Baked | null = null;
function crown(): Baked {
  if (crownBaked) return crownBaked;
  const p = new Parts();
  p.add(lathe(CROWN), "#e3a03c", { ink: INK_W });
  const seed = faceted(new THREE.SphereGeometry(0.045, 6, 4));
  for (let i = 0; i < 30; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const r = Math.sqrt((i + 0.5) / 30) * 0.82;
    const y = 0.73 * Math.sqrt(Math.max(0, 1 - (r / 1.06) ** 2)) + 0.004;
    p.add(seed, "#fff3d8", { p: [Math.cos(a) * r, y, Math.sin(a) * r], s: [1.4, 0.5, 0.85], r: [Math.sin(a) * r * 0.5, a * 3, -Math.cos(a) * r * 0.5], ink: false });
  }
  crownBaked = bakeShared(p);
  return crownBaked;
}

// ---- patty: shape and colour ------------------------------------------------------

/** Template cylinder (unit radius, height 1, centred), non-indexed, that each patty warps. */
const PATTY_TEMPLATE = new THREE.CylinderGeometry(1, 1, 1, 36, 5).toNonIndexed().attributes.position.array as Float32Array;

/** Shape of a patty at a cook: it shrinks and domes as it cooks; a smashed one is thin and wide. */
function pattyShape(t: number, smashed: boolean): { r: number; h: number; dome: number } {
  if (smashed) return { r: 1.08, h: 0.12, dome: 0 };
  return { r: lerp(1.07, 0.93, clamp(t)), h: lerp(0.24, 0.32, clamp(t)), dome: lerp(0, 0.07, clamp(t)) };
}

/** Warp a patty geometry's positions in place. A smashed patty gets a lacy, ragged rim. */
function shapePatty(g: THREE.BufferGeometry, t: number, smashed: boolean, seed: number): void {
  const { r: R0, h: H, dome } = pattyShape(t, smashed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const src = PATTY_TEMPLATE;
  for (let i = 0; i < pos.count; i++) {
    const x = src[i * 3];
    const y = src[i * 3 + 1];
    const z = src[i * 3 + 2];
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const yy = y + 0.5;
    let k = 1 + 0.03 * Math.sin(5 * a + seed) + 0.02 * Math.sin(9 * a + seed * 1.7);
    if (smashed) k += 0.07 * Math.sin(13 * a + seed) + 0.05 * Math.sin(23 * a + 2 * seed) + 0.03 * Math.sin(41 * a);
    // Softly rounded edge, and a dome on the top face.
    const round = 1 - 0.07 * Math.pow(Math.abs(yy - 0.5) * 2, 3) * (smashed ? 0.3 : 1);
    const top = yy > 0.99 ? dome * (1 - rr * rr) + 0.012 * Math.sin(7 * x + 5 * z + seed) : 0;
    pos.setXYZ(i, x * R0 * k * round, yy * H + top, z * R0 * k * round);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

/** Marbled fat specks on a raw patty's top, juice beads around medium, and cracks once burnt. Unit radius, y = 0. */
const PATTY_DETAIL = (() => {
  const r = rng(11);
  const fat = new Parts();
  const speck = faceted(new THREE.SphereGeometry(0.05, 6, 3));
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / 26) * 0.82;
    fat.add(speck, "#ffffff", { p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], s: [1 + r(), 0.15, 0.6 + r() * 0.6], r: [0, r() * 3, 0], ink: false });
  }
  const juice = new Parts();
  for (let i = 0; i < 7; i++) {
    const a = i * 2.2 + 0.4;
    const rr = 0.25 + (i % 3) * 0.2;
    const bs = 0.055;
    const bx = Math.cos(a) * rr;
    const bz = Math.sin(a) * rr;
    juice.add(faceted(new THREE.SphereGeometry(bs, 10, 6)), "#b8503c", { p: [bx, 0, bz], s: [1, 0.5, 1], ink: false });
    juice.add(faceted(new THREE.SphereGeometry(bs * 0.35, 6, 4)), "#ffe3cf", { p: [bx - bs * 0.3, bs * 0.18, bz - bs * 0.3], s: [1, 0.4, 1], ink: false });
  }
  const cracks = new Parts();
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + r();
    const rr = 0.3 + r() * 0.4;
    cracks.add(faceted(new THREE.BoxGeometry(0.36 + r() * 0.2, 0.012, 0.035)), "#0b0807", { p: [Math.cos(a) * rr, 0.004, Math.sin(a) * rr], r: [0, a + 1.3, 0], ink: false });
  }
  return { fat: bakeShared(fat), juice: bakeShared(juice), cracks: bakeShared(cracks) };
})();

/** Height of a patty at its cook, in ingredient units, before THICK. */
function pattyHeight(p: Pick<Piece, "smashed"> & { cook?: Piece["cook"] }): number {
  if (p.smashed) return 0.13;
  const t = p.cook ? (p.cook[0] + p.cook[1]) / 2 : 0.6;
  const s = pattyShape(t, false);
  return s.h + s.dome * 0.8;
}

function makePatty(piece: Piece, body: THREE.Group): (p: Piece) => void {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PATTY_TEMPLATE.length), 3));
  const m = vcMesh(geo, grade("#b5615a"));
  const seed = (piece.uid * 1.618) % 6;
  const detail = (b: Baked, unique = false) => {
    const d = new THREE.Mesh(b.geo, unique ? toon(0xffffff, { vertexColors: true, unique: true }) : toon(0xffffff, { vertexColors: true }));
    d.castShadow = false;
    body.add(d);
    return d;
  };
  const fat = detail(PATTY_DETAIL.fat, true);
  const juice = detail(PATTY_DETAIL.juice);
  const cracks = detail(PATTY_DETAIL.cracks);
  // Grill marks from the grille: dark diagonal bars on each face that spent long enough (MARKED)
  // face down on the grille, and only on that face.
  const marks = new THREE.Group();
  const markMat = toon("#2a170e", { unique: true });
  for (let i = 0; i < 5; i++) {
    const len = 2 * Math.sqrt(Math.max(0.1, 0.8 - ((i - 2) * 0.36) ** 2));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.11), markMat);
    bar.position.z = (i - 2) * 0.36;
    bar.castShadow = false;
    marks.add(bar);
  }
  marks.rotation.y = Math.PI / 4 + seed * 0.1;
  marks.visible = false;
  const marksDown = marks.clone();
  const markDownMat = toon("#2a170e", { unique: true });
  marksDown.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = markDownMat;
  });
  body.add(marks, marksDown);
  body.add(m);
  let key = "";
  return (p) => {
    const down = p.cook[0];
    const up = p.cook[1];
    const mkDown = p.marks?.[0] ?? 0;
    const mk = p.marks?.[1] ?? 0;
    const k = `${Math.round(down * 40)}|${Math.round(up * 40)}|${p.smashed ? 1 : 0}|${Math.round(mk * 10)}|${Math.round(mkDown * 10)}`;
    if (k === key) return;
    key = k;
    const t = (down + up) / 2;
    const sm = !!p.smashed;
    shapePatty(geo, t, sm, seed);
    const { r: R0, h: H, dome } = pattyShape(t, sm);
    // Faces take their own doneness colour; a dark crust lip forms on the top rim, and the
    // edge shows a crust band creeping up from whichever face is down.
    const cu = grade(pattyRamp(up, tmpA), tmpA);
    const cd = grade(pattyRamp(down, tmpB), tmpB);
    const lip = grade(crustRamp(Math.max(up, down) * 1.05 + 0.08, tmpC), tmpC);
    const mid = grade(pattyRamp(t * 0.8, tmpD), tmpD);
    const lace = grade(crustRamp(1.05));
    const rimTop = cu.clone().lerp(lip, smooth(0.15, 0.6, up));
    const bandD = cd.clone().lerp(lip, 0.3);
    const bandU = cu.clone().lerp(lip, 0.3);
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    paint(geo, (i) => {
      const ny = nrm.getY(i);
      const yy = pos.getY(i) / H;
      const rr = Math.hypot(pos.getX(i), pos.getZ(i)) / R0;
      if (ny > 0.5) return rr > (sm ? 0.82 : 0.86) && up > 0.15 ? (sm ? lace : rimTop) : cu;
      if (ny < -0.5) return cd;
      return yy < 0.1 + 0.45 * Math.min(1, down) ? bandD : yy > 0.9 - 0.45 * Math.min(1, up) ? bandU : mid;
    });
    setLine(m, cu);
    const top = H + dome * 0.6;
    const fatK = clamp(1 - up * 2.2);
    fat.visible = fatK > 0.05;
    (fat.material as THREE.MeshToonMaterial).color.set("#f6c9c6").lerp(pattyRamp(up, tmpE), 1 - fatK);
    fat.position.y = H + 0.003;
    fat.scale.set(R0, 1, R0);
    const j = smooth(0.3, 0.45, up) * (1 - smooth(0.7, 0.85, up));
    juice.visible = j > 0.25 && !sm;
    juice.position.y = top - 0.01;
    juice.scale.set(R0, 1, R0);
    cracks.visible = up > 0.95;
    cracks.position.y = top;
    cracks.scale.set(R0, 1, R0);
    marks.visible = mk >= MARKED;
    marks.position.y = top + 0.004;
    marks.scale.set(R0, 1, R0);
    markMat.color.copy(cu).lerp(tmpE.set("#1d100a"), clamp(0.35 + mk * 0.65));
    marksDown.visible = mkDown >= MARKED;
    marksDown.position.y = -0.004;
    marksDown.scale.set(R0, 1, R0);
    markDownMat.color.copy(cd).lerp(tmpE.set("#1d100a"), clamp(0.35 + mkDown * 0.65));
  };
}

// ---- cheese: slumping square ------------------------------------------------------

/** A square slice turned to a diamond; as it melts the corners slump over the patty edge. */
function cheeseGeo(melt: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1.9, 1.9, 16, 16);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI / 4 + 0.15);
  // A cold slice only just bends at the corners (so it still reads square on the counter); melting slumps it.
  const m = lerp(0.12, 0.95, melt);
  const drip = melt;
  return warp(g, (x, _y, z) => {
    const a = Math.atan2(z, x);
    const over = Math.max(0, Math.hypot(x, z) - 0.92 + drip * 0.04 * Math.sin(a * 7));
    const s = 1 - Math.min(m, 0.4) * 0.12 * Math.min(1, over * 3);
    const sag = m * (over * 1.1 + over * over * 1.4) * (1 + drip * 0.5 * Math.max(0, Math.sin(a * 5 + 1)));
    return [x * s, 0.025 - Math.min(sag, 0.5), z * s];
  });
}
const CHEESE_STEPS = 10;
const CHEESE: THREE.BufferGeometry[] = [];
const cheeseAt = (melt: number) => (CHEESE[Math.round(clamp(melt) * CHEESE_STEPS)] ??= shareGeometry(cheeseGeo(Math.round(clamp(melt) * CHEESE_STEPS) / CHEESE_STEPS)));

// ---- bacon and egg: crisp and lacy ---------------------------------------------------

const BACON_TEMPLATE = new THREE.BoxGeometry(1, 0.05, 1, 22, 1, 4).toNonIndexed().attributes.position.array as Float32Array;
const BACON_FAT: [number, number][] = [[-0.22, 0.09], [0.12, 0.07], [0.36, 0.05]];

/** Warp a bacon strip in place: it shrinks and ripples as it crisps. Colours by the marbled fat bands. */
function shapeBacon(g: THREE.BufferGeometry, cook: number, seed: number): void {
  const c = clamp(cook);
  const len = 2.0 * lerp(1, 0.8, c);
  const wid = 0.38;
  const wave = lerp(0.03, 0.09, c);
  const ripple = lerp(0.004, 0.02, c);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const src = BACON_TEMPLATE;
  for (let i = 0; i < pos.count; i++) {
    const x = src[i * 3] * len;
    const y = src[i * 3 + 1];
    const z = src[i * 3 + 2] * wid;
    pos.setXYZ(i, x, y + wave * (1 + Math.sin(x * 5 + seed)) + ripple * (1 + Math.sin(z * 18 + x * 3) * Math.sin(x * 9 + seed)) + 0.025, z + ripple * 0.6 * Math.sin(x * 7 + seed));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const meat = grade(baconMeat(cook, tmpA), tmpA);
  const fat = grade(baconFat(cook, tmpB), tmpB);
  paint(g, (i) => {
    const zz = src[i * 3 + 2];
    const xx = src[i * 3] * len;
    for (const [b, w] of BACON_FAT) if (Math.abs(zz - b - 0.04 * Math.sin(xx * 6 + seed)) < w) return fat;
    return meat;
  });
}

/** Fried egg white, with a wavy outline; colours paint a lacy brown edge in as it cooks. */
function eggWhiteGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1.0, 1.0, 0.07, 30, 1);
  return warp(g, (x, y, z) => {
    const a = Math.atan2(z, x);
    const k = 1 + 0.1 * Math.sin(3 * a + seed) + 0.06 * Math.sin(7 * a + seed * 2) + 0.04 * Math.sin(19 * a);
    return [x * k, y + 0.035, z * k];
  });
}

// ---- veg: bold and countable ---------------------------------------------------------

/**
 * One piece of a sliced topping as parts, in ingredient units before TOPPING_BOOST: chunky
 * silhouettes made to be counted at phone size, one strong tell each. `red` picks the ripe
 * jalapeño; `ink` is the outline width after any later scale. The bins' heaps use these too.
 */
export function vegParts(kind: Kind, red = false, ink = INK_W * 1.3): Parts {
  const p = new Parts();
  switch (kind) {
    case "lettuce": {
      // Shredded iceberg: a pale mound with wide curled shreds on top.
      const r = rng(21);
      const base = warp(new THREE.CylinderGeometry(0.95, 1.0, 0.07, 28, 1), (x, y, z) => {
        const a = Math.atan2(z, x);
        const k = 1 + 0.07 * Math.sin(a * 9) + 0.04 * Math.sin(a * 17 + 1);
        return [x * k, y + 0.035 + (y > 0 ? 0.03 * (1 - Math.hypot(x, z)) : 0), z * k];
      });
      p.add(base, "#a9dc7c", { ink: ink * 1.1 });
      for (let i = 0; i < 22; i++) {
        const a = i * 2.39996;
        const rr = Math.sqrt((i + 0.5) / 22) * 0.8;
        const g = warp(new THREE.BoxGeometry(0.34 + r() * 0.16, 0.025, 0.16, 6, 1, 2), (x, y, z) => [x, y + 0.9 * x * x - 0.5 * z * z, z + 0.25 * x * x]);
        p.add(g, ["#8fd067", "#c5ea96", "#73c24f", "#e0f4b8"][i % 4], { p: [Math.cos(a) * rr, 0.09 + r() * 0.03, Math.sin(a) * rr], r: [0, r() * Math.PI * 2, (r() - 0.5) * 0.3], ink: false });
      }
      break;
    }
    case "tomato": {
      const h = 0.13;
      p.add(cyl(0.48, 0.48, h, 20), "#e0402a", { p: [0, h / 2, 0], ink });
      p.add(cyl(0.4, 0.4, h + 0.006, 20), "#f26a4f", { p: [0, h / 2, 0], ink: false });
      const star: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI * 2) / 10;
        const rr = i % 2 ? 0.12 : 0.3;
        star.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      const s = new THREE.Shape(star.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(s, { depth: h + 0.012, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      p.add(faceted(g), "#ffd2bf", { ink: false });
      break;
    }
    case "onion":
      // A single fat white ring with a purple edge.
      p.add(tor(0.36, 0.075, 6, 26), "#f4e8f4", { p: [0, 0.075, 0], r: [Math.PI / 2, 0, 0], ink });
      p.add(tor(0.41, 0.03, 4, 26), "#b47bb6", { p: [0, 0.11, 0], r: [Math.PI / 2, 0, 0], ink: false });
      break;
    case "pickle": {
      // An oval crinkle-cut chip.
      const g = warp(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 30), (x, y, z) => {
        const a = Math.atan2(z, x);
        const k = Math.hypot(x, z) > 0.28 ? 1 + 0.08 * Math.sign(Math.sin(a * 12)) : 1;
        return [x * k, y, z * k * 0.7];
      });
      p.add(g, "#4f8a26", { p: [0, 0.04, 0], ink });
      p.add(cyl(0.25, 0.25, 0.076, 20), "#b5d46a", { p: [0, 0.04, 0], s: [1, 1, 0.7], ink: false });
      p.add(cyl(0.1, 0.1, 0.08, 10), "#e6efb0", { p: [0, 0.04, 0], s: [1.6, 1, 0.7], ink: false });
      break;
    }
    case "jalapeno":
      p.add(tor(0.19, 0.07, 6, 16), red ? "#d8392b" : "#1f9a35", { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], ink });
      p.add(cyl(0.13, 0.13, 0.05, 12), "#fff1a8", { p: [0, 0.05, 0], ink: false });
      p.add(cyl(0.05, 0.05, 0.06, 6), "#f5c64a", { p: [0, 0.05, 0], ink: false });
      break;
  }
  return p;
}
const VEG_BAKED = new Map<string, Baked>();
function veg(kind: Kind, red: boolean): THREE.Mesh {
  const key = kind + (red ? "r" : "");
  let b = VEG_BAKED.get(key);
  if (!b) VEG_BAKED.set(key, (b = bakeShared(vegParts(kind, red))));
  return bakedMesh(b);
}

// ---- assembling a piece --------------------------------------------------------------

export interface FoodObject extends THREE.Group {
  userData: {
    kind: Kind;
    update: (p: Piece) => void;
    height: number;
  };
}

/** Build the 3D object for a piece. `role` picks the bun shape when stacked. */
export function makeFood(piece: Piece, role: BunRole = "top"): FoodObject {
  const g = new THREE.Group() as FoodObject;
  // The piece's shapes go in `body`, which carries the topping boost and the stack thickening.
  const body = new THREE.Group();
  const [w, h] = bodyScale(piece.kind);
  body.scale.set(w, h, w);
  g.add(body);
  const height = piece.kind === "bun" ? (role === "bottom" ? LAYER_HEIGHT.bun : TOP_BUN_HEIGHT) : piece.kind === "patty" ? pattyHeight(piece) * THICK : LAYER_HEIGHT[piece.kind];
  g.userData = { kind: piece.kind, update: () => {}, height };
  const set = (update: (p: Piece) => void) => {
    g.userData.update = update;
    update(piece);
  };
  switch (piece.kind) {
    case "bun": {
      if (role === "bottom") {
        const disc = mesh(GEO.cutDisc, "#f4d79a", { unique: true, ink: false });
        body.add(mesh(GEO.heel, "#df9a3e", { ink: 1.025 }));
        disc.position.y = 0.31;
        body.add(disc);
        set((p) => (disc.material as THREE.MeshToonMaterial).color.copy(toastRamp(bunToast(p), tmpA)));
        break;
      }
      const rim = mesh(GEO.rimDisc, "#f4d79a", { unique: true, ink: false });
      const dome = bakedMesh(crown(), { material: toon(0xffffff, { vertexColors: true, unique: true }) });
      rim.position.y = 0.02;
      body.add(dome, rim);
      set((p) => {
        (rim.material as THREE.MeshToonMaterial).color.copy(toastRamp(p.cook[0], tmpA));
        // A dome left face down on the grill browns, seeds and all.
        (dome.material as THREE.MeshToonMaterial).color.set("#ffffff").lerp(tmpB.set("#5a3a26"), clamp(p.cook[1] - 0.3));
      });
      break;
    }
    case "patty": {
      const update = makePatty(piece, body);
      set((p) => {
        update(p);
        g.userData.height = pattyHeight(p) * THICK;
      });
      break;
    }
    case "bacon": {
      const strips = [0, 1].map((i) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BACON_TEMPLATE.length), 3));
        const m = vcMesh(geo, grade("#b24a32"));
        m.position.z = i ? 0.24 : -0.24;
        m.rotation.y = i ? 0.1 : -0.07;
        body.add(m);
        return { m, geo, seed: i * 2.7 + 1 + (piece.uid % 5) * 0.4 };
      });
      let key = -1;
      set((p) => {
        const t = avgCook(p);
        const k = Math.round(t * 30);
        if (k === key) return;
        key = k;
        for (const s of strips) {
          shapeBacon(s.geo, t, s.seed);
          setLine(s.m, grade(baconMeat(t, tmpC), tmpC));
        }
      });
      break;
    }
    case "egg": {
      const white = vcMesh(eggWhiteGeo(2 + (piece.uid % 3)), grade("#d9d2c8"));
      const midW = mesh(GEO.eggMid, "#ffffff", { unique: true, ink: false, shadow: false });
      midW.position.set(0.1, 0.075, -0.06);
      const yolk = mesh(GEO.yolk, "#ffa412", { unique: true, ink: 1.04, shadow: false });
      yolk.position.set(0.1, 0.07, -0.06);
      const shine = mesh(GEO.spot, "#ffe7a6", { ink: false, shadow: false });
      shine.position.set(0.02, 0.07, -0.14);
      shine.scale.set(1.3, 0.35, 0.8);
      body.add(white, midW, yolk, shine);
      let key = -1;
      set((p) => {
        const cook = cookLevel(p);
        const over = isFlipped(p);
        const k = Math.round(cook * 30) * 2 + (over ? 1 : 0);
        if (k === key) return;
        key = k;
        // Flipped (over easy): the yolk is under a veil of cooked white, and the shine is gone.
        midW.visible = !over;
        // A crisp, lacy brown edge creeps in as it cooks; the glossy yolk dulls as it sets.
        const lace = smooth(0.25, 0.8, cook);
        const W = grade(eggWhite(Math.min(cook, 0.8), tmpA), tmpA);
        const B = grade(tmpB.set("#e2b46e").lerp(tmpC.set("#6a3c16"), smooth(0.8, 1.2, cook)), tmpB);
        const edgeCol = W.clone().lerp(B, lace);
        const pos = white.geometry.attributes.position;
        paint(white.geometry, (i) => {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const a = Math.atan2(z, x);
          const edge = 0.98 - lace * (0.22 + 0.06 * Math.sin(a * 5 + 1) + 0.05 * Math.sin(a * 11) + 0.03 * Math.sin(a * 23 + 2));
          return Math.hypot(x, z) > edge ? edgeCol : W;
        });
        setLine(white, edgeCol.clone().lerp(tmpD.set("#8a6a40"), lace));
        (midW.material as THREE.MeshToonMaterial).color.set("#ffffff").lerp(eggWhite(cook, tmpD), 0.5);
        (yolk.material as THREE.MeshToonMaterial).color.set("#ffa412").lerp(tmpD.set("#f2c457"), clamp((cook - 0.55) * 2.2));
        if (over) (yolk.material as THREE.MeshToonMaterial).color.lerp(tmpD.set("#fbf3df"), 0.72);
        const yh = lerp(0.85, 0.6, clamp(cook)) * (over ? 0.55 : 1);
        yolk.scale.set(over ? 1.15 : 1, yh, over ? 1.15 : 1);
        shine.position.y = 0.07 + 0.32 * yh * 0.85;
        shine.visible = cook < 0.7 && !over;
      });
      break;
    }
    case "pineapple": {
      const ring = mesh(GEO.pineapple, "#f5d33f", { unique: true });
      body.add(ring);
      set((p) => (ring.material as THREE.MeshToonMaterial).color.copy(pineRamp(Math.max(p.cook[0], p.cook[1]), tmpA)));
      break;
    }
    case "cheese":
    case "cheddar": {
      // The corners slump as it melts; it turns a deeper orange once it counts as melted.
      const [cold, hot] = piece.kind === "cheddar" ? ["#f39a1e", "#e57a12"] : ["#f7c531", "#f6ad25"];
      const slice = mesh(cheeseAt(piece.melt ?? 0), cold, { side: THREE.DoubleSide, ink: 1.02 });
      body.add(slice);
      let melted: boolean | null = null;
      set((p) => {
        const geo = cheeseAt(p.melt ?? 0);
        if (slice.geometry !== geo) {
          slice.geometry = geo;
          (slice.children[0] as THREE.Mesh).geometry = geo;
        }
        if (isMelted(p) === melted) return;
        melted = isMelted(p);
        slice.material = toon(melted ? hot : cold, { side: THREE.DoubleSide });
        (slice.children[0] as THREE.Mesh).material = lineMaterial(lineColor(grade(melted ? hot : cold)));
      });
      break;
    }
    case "lettuce":
    case "tomato":
    case "onion":
    case "pickle":
    case "jalapeno":
      // A ripe red jalapeño now and then makes a pile read as "hot peppers" rather than pickles.
      body.add(veg(piece.kind, piece.kind === "jalapeno" && piece.uid % 4 === 2));
      break;
    case "ketchup":
    case "mustard":
    case "pesto":
    case "aioli":
    case "redsalsa":
    case "greensalsa":
    case "crema":
    case "redsauce":
    case "oil":
    case "honey": {
      const color = SAUCE_COLOR[piece.kind];
      const holder = new THREE.Group();
      body.add(holder);
      let lastLen = -1;
      set((p) => {
        const pts = p.stroke ?? [];
        if (pts.length === lastLen) return;
        lastLen = pts.length;
        for (const c of holder.children) (c as THREE.Mesh).geometry.dispose();
        holder.clear();
        if (pts.length < 2) {
          if (pts.length === 1) {
            const blob = mesh(new THREE.SphereGeometry(SAUCE_RADIUS * 1.3, 8, 5), color, { ink: false });
            blob.position.set(pts[0].x, 0.03, pts[0].z);
            blob.scale.y = 0.5;
            holder.add(blob);
          }
          return;
        }
        const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q.x, 0.035, q.z)));
        const tube = new THREE.TubeGeometry(curve, Math.min(240, pts.length * 3), SAUCE_RADIUS, 6, false);
        const m = new THREE.Mesh(tube, toon(color));
        m.scale.y = 0.6;
        m.castShadow = true;
        holder.add(m);
      });
      break;
    }
    case "dough": {
      // A flatbread base on its own (in hand, off the dough stack).
      const fb = makeFlatbread([piece]);
      body.add(fb);
      set((p) => fb.userData.update([p]));
      break;
    }
    case "mushroom":
    case "ham":
    case "fig":
    case "pear":
    case "blue": {
      const m = toppingMesh(piece.kind);
      if (m) body.add(m);
      break;
    }
    default: {
      // The panini press's breads, proteins and fillings (render/panini.ts), and the comal's
      // tortillas and taco fillings (render/tacos.ts).
      const update = makePaniniPiece(piece, body);
      if (update) set(update);
      else {
        const taco = makeTacoPiece(piece, body);
        if (taco)
          set((p) => {
            taco(p);
            if (p.kind === "corn" || p.kind === "flour") g.userData.height = (p.folded ? FOLDED_HEIGHT[p.kind] : TACO_HEIGHT[p.kind]!) * h;
          });
      }
    }
  }
  return g;
}

/** Sauce lines on the stack. */
const SAUCE_COLOR: Record<"ketchup" | "mustard" | "pesto" | "aioli" | "redsalsa" | "greensalsa" | "crema" | "redsauce" | "oil" | "honey", string> = { ketchup: "#d8261b", mustard: "#f0c419", pesto: "#4f8f2e", aioli: "#f1e4b8", redsalsa: "#c8321f", greensalsa: "#6c9e2c", crema: "#f7f1e1", redsauce: "#c8402a", oil: "#d6c64a", honey: "#eaa22a" };

/** How far from the middle of the burger each counted topping's slices sit. */
const SLICE_RING: Partial<Record<Kind, number>> = { tomato: 0.42, onion: 0.28, pickle: 0.45, jalapeno: 0.46, mozzarella: 0.44, avocado: 0.2, redonion: 0.36, tuna: 0.36 };

/** Where the `k`th slice of a counted topping goes (x, z), spread around the burger so they don't pile up. */
export function sliceSpot(kind: Kind, k: number): [number, number] {
  const r = (SLICE_RING[kind] ?? 0.4) * (k % 3 === 2 ? 0.45 : 1);
  const a = 0.6 + k * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

type StackPiece = Pick<Piece, "kind" | "smashed"> & { cook?: Piece["cook"] };

/** Each layer turns this much more than the one below, so its edge shapes don't line up. */
const STACK_YAW = 0.35;
/** ...and sits this much further back (ingredient units), so the rims below face the camera. */
const STACK_BACK = 0.0225;

/**
 * Base height of each piece in a stack, bottom first, plus the height of the top. A run of the
 * same counted topping lies side by side at one level. `yaw` and `back` are the readable-stack
 * pose: turn entry i by yaw[i] about y and move it back by back[i] along -z.
 */
export function stackBases(pieces: StackPiece[]): { bases: number[]; top: number; yaw: number[]; back: number[] } {
  const bases: number[] = [];
  const yaw: number[] = [];
  const back: number[] = [];
  let next = 0;
  let runBase = 0;
  pieces.forEach((p, i) => {
    const joins = i > 0 && COUNTED.has(p.kind) && pieces[i - 1].kind === p.kind;
    if (joins) bases.push(bases[i - 1] + 0.004);
    else {
      runBase = next;
      bases.push(next);
    }
    // Buns stay square on; counted slices keep their own spread.
    // Panini bread stays square on too (a turned slab hides the fillings), and so does what's in it.
    yaw.push(p.kind === "bun" || BREADS.has(p.kind) || BREADS.has(pieces[0].kind) || COUNTED.has(p.kind) || isSauce(p.kind) ? 0 : i * STACK_YAW);
    back.push(i * STACK_BACK);
    next = Math.max(next, runBase + stackHeight(p, i === 0 ? "bottom" : "top"));
  });
  return { bases, top: next, yaw, back };
}

/** Height of a stacked piece, accounting for bun shape, a patty's cook and smashed patties. */
export function stackHeight(piece: StackPiece, role: BunRole): number {
  if (piece.kind === "bun") return role === "bottom" ? LAYER_HEIGHT.bun : TOP_BUN_HEIGHT;
  if (piece.kind === "patty") return pattyHeight(piece) * THICK;
  return LAYER_HEIGHT[piece.kind];
}

// ---- sides -------------------------------------------------------------------------

// Fries and paper boats live in sides.ts, cups in models/drinks.ts; re-exported so existing imports keep working.
export { CARTON_NEST, CARTON_SIZE, CURD, curdLumps, FRIES_PER_SCOOP, friesToppings, GRAVY, makeBasketFries, makeCarton, makeCartonStack, makeFries, makeFryPile, type FriesObject } from "./sides";
export { CUP_DIMS, CUP_SCALE, cupSurfaceY, makeCup, type CupObject } from "./models/drinks";

export function bottle(color: string, label: string): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(faceted(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 12)), color);
  body.position.y = 0.45;
  const cap = mesh(faceted(new THREE.CylinderGeometry(0.2, 0.28, 0.18, 12)), "#f4f1e8");
  cap.position.y = 0.99;
  const tip = mesh(faceted(new THREE.ConeGeometry(0.08, 0.28, 8)), "#f4f1e8");
  tip.position.y = 1.22;
  g.add(body, cap, tip);
  g.name = label;
  return g;
}
