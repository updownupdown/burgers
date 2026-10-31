import * as THREE from "three";
import type { SauceKind } from "../../game/types";
import { bakedMesh, Parts } from "../bake";
import { STUDY } from "../units";
import { box, C, cached, cyl, lathe, machine, rbox, tor } from "./kit";

/*
 * The inverted sauce caddy (the study's sauce option b): squeeze bottles stand upside down in
 * a dark wire caddy, valve down, so their coloured bases face the camera. A bottle lifted out
 * keeps that orientation: nozzle down, ready to hold over a burger and squeeze. Study units below.
 */

const BOTTLE_H = 1.7;
const BOTTLE_R = 0.32;
/** The nozzle tip sits this far below the valve cap. */
const NUB = 0.14;
/** Bottles sit well apart, so a quick grab doesn't take the wrong sauce. */
const SLOT_X = 0.8;
const BASE_W = 2 * SLOT_X + 0.82;
/** Height of the nozzle tip in the caddy (hidden inside the base). */
const SEAT_Y = 0.22;

const COLOR: Record<SauceKind, string> = { ketchup: C.ketchup, mustard: C.mustard };
const BASE_TINT: Record<SauceKind, string> = { ketchup: "#ffe1d8", mustard: "#fff2c0" };

const bottleParts = (kind: SauceKind) => () => {
  const p = new Parts();
  const col = COLOR[kind];
  const r = BOTTLE_R;
  // Valve cap and nozzle at the bottom, the body above it, the flat base on top.
  p.add(cyl(0.035, 0.07, NUB, 10), "#f4f1e8", { p: [0, NUB / 2, 0], ink: 0.01 });
  p.add(cyl(0.22, 0.2, 0.25, 16), "#f4f1e8", { p: [0, NUB + 0.125, 0] });
  const y0 = NUB + 0.22;
  p.add(lathe([[0, 0], [r * 0.75, 0.05], [r, 0.3], [r + 0.02, BOTTLE_H - 0.1], [r, BOTTLE_H], [0, BOTTLE_H]], 20), col, { p: [0, y0, 0] });
  p.add(cyl(r + 0.025, r + 0.025, 0.4, 20), "#fbf7ee", { p: [0, y0 + 0.75, 0], ink: false });
  // A light disc on the base, so the two read apart from above.
  p.add(cyl(0.2, 0.2, 0.01, 20), BASE_TINT[kind], { p: [0, y0 + BOTTLE_H + 0.006, 0], ink: false });
  return p;
};
const BOTTLES: Record<SauceKind, ReturnType<typeof cached>> = { ketchup: cached(bottleParts("ketchup")), mustard: cached(bottleParts("mustard")) };

export interface SauceBottleObject extends THREE.Group {
  userData: {
    kind: SauceKind;
    /** Overall height in game units. */
    h: number;
    /** Pinch the bottle as it's squeezed, 0..1. */
    squeeze: (t: number) => void;
  };
}

/** A squeeze bottle hanging nozzle down. Origin at the nozzle tip; 0.44 across, 1.38 tall in game units. */
export function makeSauceBottle(kind: SauceKind): SauceBottleObject {
  const g = new THREE.Group() as SauceBottleObject;
  const body = bakedMesh(BOTTLES[kind]());
  g.add(body);
  g.userData = {
    kind,
    h: (NUB + 0.22 + BOTTLE_H) * STUDY,
    squeeze: (t) => {
      const k = Math.max(0, Math.min(1, t));
      body.scale.set(1 - 0.12 * k, 1 + 0.02 * k, 1 - 0.12 * k);
    },
  };
  return g;
}

const caddy = cached(() => {
  const p = new Parts();
  p.add(rbox(BASE_W, 0.5, 1.1, 0.06), "#3a4043", { p: [0, 0.25, 0] });
  for (const x of [-SLOT_X, SLOT_X]) {
    p.add(tor(0.36, 0.04, 6, 24), "#8e9a98", { p: [x, 0.52, 0], r: [Math.PI / 2, 0, 0] });
    p.add(tor(0.36, 0.035, 6, 24), "#8e9a98", { p: [x, 1.4, 0], r: [Math.PI / 2, 0, 0] });
  }
  for (const x of [-BASE_W / 2 + 0.03, 0, BASE_W / 2 - 0.03]) p.add(box(0.06, 1.0, 0.06), "#8e9a98", { p: [x, 0.95, 0] });
  p.add(box(BASE_W - 0.04, 0.05, 0.05), "#8e9a98", { p: [0, 1.4, 0] });
  return p;
});

export interface SauceCaddyObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: { bottles: Record<SauceKind, { x: number; y: number; z: number }> };
    /** The bottles standing in the caddy; hide one while it's lifted out. */
    bottles: Record<SauceKind, SauceBottleObject>;
  };
}

/** The caddy with both bottles, one at each end: about 1.7 x 0.73 game units, 1.53 tall. */
export function makeSauceCaddy(): SauceCaddyObject {
  const g = new THREE.Group() as SauceCaddyObject;
  g.add(bakedMesh(caddy()));
  const spots = {
    ketchup: { x: -SLOT_X * STUDY, y: SEAT_Y * STUDY, z: 0 },
    mustard: { x: SLOT_X * STUDY, y: SEAT_Y * STUDY, z: 0 },
  };
  const bottles = {} as Record<SauceKind, SauceBottleObject>;
  for (const k of ["ketchup", "mustard"] as SauceKind[]) {
    const b = makeSauceBottle(k);
    b.position.set(spots[k].x, spots[k].y, spots[k].z);
    g.add(b);
    bottles[k] = b;
  }
  machine(g, BASE_W, 1.1, SEAT_Y + NUB + 0.22 + BOTTLE_H, { bottles: spots });
  g.userData.bottles = bottles;
  return g;
}
