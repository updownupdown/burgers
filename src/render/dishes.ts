import * as THREE from "three";
import type { Piece } from "../game/types";
import { isSauce, TORTILLAS } from "../game/types";
import { bakedMesh, bakeShared, Parts } from "./bake";
import { makeFood, type FoodObject } from "./food";
import { faceted } from "./materials";
import { fillMesh, limeParts, SHELL_SIZE, tacoShell, TORTILLA_R } from "./tacos";
import { INNER_RX, INNER_RZ, makeFlatbread } from "./flatbread";

/*
 * Red Rock's dishes on the tray (DESIGN §24, phase 3). Tacos stand in a steel rack, one slot per
 * tortilla, each holding its share of the fillings; a quesadilla is drawn as the folded half moon
 * with its filling inside. A tostada is an ordinary stack (shell, beans, lettuce, cheese, crema).
 * Ingredient units, bottom at y = 0, like a burger stack.
 */

export type DishMode = "rack" | "quesadilla" | "flatbread" | null;
/** How a plate's layers are drawn: a taco rack, a quesadilla, a flatbread, or (null) as a stack. */
export function dishMode(layers: { piece: Piece }[]): DishMode {
  const base = layers[0]?.piece;
  if (base?.kind === "dough") return "flatbread";
  if (!base || !TORTILLAS.has(base.kind)) return null;
  return base.folded ? "quesadilla" : "rack";
}

export interface DishObject {
  group: THREE.Group;
  /** Height of the food's top, for sauce and the fit under the receipts. */
  top: number;
  /** Half sizes of the area sauce paints over, ingredient units. */
  rx: number;
  rz: number;
  /** Sauce layers, drawn over the dish: [layer index, object]. */
  sauces: [number, FoodObject][];
  /** Redraw from the plate's pieces (a flatbread draws its own honey as it's drizzled). */
  update?: (pieces: Piece[]) => void;
}

/** A flatbread on the tray is drawn a little smaller than on the peel, so the sides fit beside it. */
const FLATBREAD_ON_TRAY = 0.8;
/** Orchard Isle's flatbread or calzone on the tray (render/flatbread.ts), honey and all. */
export function makeFlatbreadDish(pieces: Piece[]): DishObject {
  const g = new THREE.Group();
  const fb = makeFlatbread(pieces);
  fb.scale.setScalar(FLATBREAD_ON_TRAY);
  g.add(fb);
  const k = FLATBREAD_ON_TRAY;
  return { group: g, top: fb.userData.top * k, rx: INNER_RX * k, rz: INNER_RZ * k, sauces: [], update: (ps) => fb.userData.update(ps) };
}

const RACK_PITCH = 1.0;
/** Widest a rack draws (ingredient units): a platter of four shrinks to fit beside the sides. */
const RACK_MAX_W = 3.9;
const LIME = (() => bakeShared(limeParts()))();

const RACKS = new Map<string, ReturnType<typeof bakeShared>>();
function rackBody(n: number, pitch: number, depth: number): THREE.Mesh {
  const key = `${n}|${pitch.toFixed(2)}|${depth.toFixed(2)}`;
  const hit = RACKS.get(key);
  if (hit) return bakedMesh(hit);
  const p = new Parts();
  const w = n * pitch + 0.2;
  const steel = "#c9d1cf";
  p.add(faceted(new THREE.BoxGeometry(w, 0.05, depth)), steel, { p: [0, 0.025, 0], ink: 0.02 });
  // Wavy wire dividers between the slots, so each taco stands up in its own bay.
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + 0.1 + i * pitch;
    for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12]) p.add(faceted(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6)), "#9aa3a6", { p: [x, 0.25, z], ink: 0.012 });
    p.add(faceted(new THREE.BoxGeometry(0.05, 0.05, depth - 0.2)), "#9aa3a6", { p: [x, 0.45, 0], ink: 0.012 });
  }
  const b = bakeShared(p);
  RACKS.set(key, b);
  return bakedMesh(b);
}

/** A sauce piece with its stroke stretched from the unit disc the sauce is painted in to the dish's half sizes. */
export function stretchSauce(p: Piece, rx: number, rz: number): Piece {
  return { ...p, stroke: p.stroke?.map((q) => ({ x: q.x * rx, z: q.z * rz })) };
}

/** Tacos in a rack: one slot per tortilla, the fillings shared out between them. */
export function makeTacoRack(pieces: Piece[]): DishObject {
  const g = new THREE.Group();
  const tortillas = pieces.filter((p) => TORTILLAS.has(p.kind));
  const n = Math.max(1, tortillas.length);
  const kind = (tortillas[0]?.kind ?? "corn") as "corn" | "flour";
  const shell = SHELL_SIZE[kind];
  const pitch = Math.max(RACK_PITCH, shell.w + 0.2);
  const depth = TORTILLA_R[kind] * 2 - 0.1;
  const width = n * pitch;
  const k = Math.min(1, RACK_MAX_W / (width + 0.9));
  const inner = new THREE.Group();
  inner.scale.setScalar(k);
  g.add(inner);
  inner.add(rackBody(n, pitch, depth));
  const xs = Array.from({ length: n }, (_, i) => -width / 2 + pitch * (i + 0.5));
  tortillas.forEach((t, i) => {
    const s = tacoShell(t);
    s.position.set(xs[i], 0.06, 0);
    inner.add(s);
  });
  // The fillings: a scoop of a counted one goes in the next taco along; a sprinkle goes on every taco.
  const level = xs.map(() => 0.1);
  const per = new Map<string, number>();
  const fillW = shell.w * 0.32;
  const fillD = TORTILLA_R[kind] * 0.78;
  const sauces: [number, FoodObject][] = [];
  let limes = 0;
  pieces.forEach((p, idx) => {
    if (TORTILLAS.has(p.kind)) return;
    if (isSauce(p.kind)) {
      sauces.push([idx, null as unknown as FoodObject]);
      return;
    }
    if (p.kind === "lime") {
      const l = bakedMesh(LIME);
      l.position.set(width / 2 + 0.45, 0.02, -0.5 + limes * 0.55);
      l.rotation.y = 0.6 + limes;
      inner.add(l);
      limes++;
      return;
    }
    // Scoops (pork, beans) and an egg go one per taco; onion, cilantro and the rest are sprinkled on every one.
    const scoop = p.kind === "pork" || p.kind === "beans" || p.kind === "egg";
    const slots = scoop ? [(per.get(p.kind) ?? 0) % n] : xs.map((_, i) => i);
    per.set(p.kind, (per.get(p.kind) ?? 0) + 1);
    for (const i of slots) {
      let o: THREE.Object3D;
      if (p.kind === "egg") {
        // A fried egg folded into the taco.
        const e = makeFood(p, "top");
        e.scale.set(0.45, 0.8, 0.75);
        o = e;
      } else {
        const big = p.kind === "pork" || p.kind === "beans";
        o = fillMesh(p.kind, fillW * (big ? 1 : 1.1), fillD, 2 + i + idx, big ? 0.7 : 0.55);
      }
      o.position.set(xs[i], level[i], 0);
      inner.add(o);
      level[i] += p.kind === "pork" || p.kind === "beans" ? 0.07 : p.kind === "egg" ? 0.08 : 0.025;
    }
  });
  const top = (Math.max(shell.h * 0.75, ...level) + 0.12) * k;
  const rx = (width / 2) * k;
  const rz = (depth / 2) * k * 0.7;
  for (const sc of sauces) {
    const o = makeFood(stretchSauce(pieces[sc[0]], rx, rz), "top");
    o.position.y = top;
    g.add(o);
    sc[1] = o;
  }
  return { group: g, top, rx, rz, sauces };
}

/** A quesadilla on the tray: the folded tortilla with its filling, any sauce over it. */
export function makeQuesadillaDish(pieces: Piece[]): DishObject {
  const g = new THREE.Group();
  const [base, ...rest] = pieces;
  const shown: Piece = { ...base, fill: rest.filter((p) => !isSauce(p.kind)), foldYaw: 0 };
  const q = makeFood(shown, "top");
  // The half moon is drawn set back over where the tortilla was; centre it on the plate.
  q.position.z = TORTILLA_R[base.kind as "corn" | "flour"] * 0.42;
  g.add(q);
  const top = (q.userData.height as number) + 0.02;
  const sauces: [number, FoodObject][] = [];
  const R = TORTILLA_R[base.kind as "corn" | "flour"];
  pieces.forEach((p, i) => {
    if (!isSauce(p.kind)) return;
    const o = makeFood(stretchSauce(p, R * 0.9, R * 0.4), "top");
    o.position.set(0, top, 0);
    g.add(o);
    sauces.push([i, o]);
  });
  return { group: g, top, rx: R * 0.9, rz: R * 0.4, sauces };
}

/** Build the dish for a plate's pieces, or null if they're drawn as a stack. */
export function makeDish(pieces: Piece[]): DishObject | null {
  const mode = dishMode(pieces.map((piece) => ({ piece })));
  if (mode === "rack") return makeTacoRack(pieces);
  if (mode === "quesadilla") return makeQuesadillaDish(pieces);
  if (mode === "flatbread") return makeFlatbreadDish(pieces);
  return null;
}

