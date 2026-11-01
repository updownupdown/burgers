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

const COLOR: Record<SauceKind, string> = { ketchup: C.ketchup, mustard: C.mustard, pesto: "#5f9a3a", aioli: "#efe4c0", redsalsa: "#c8321f", greensalsa: "#6c9e2c", crema: "#f4efe2", redsauce: "#c8402a", oil: "#b7a83a", honey: "#e9a92a" };
const BASE_TINT: Record<SauceKind, string> = { ketchup: "#ffe1d8", mustard: "#fff2c0", pesto: "#d9ecc8", aioli: "#fffaf0", redsalsa: "#ffd8cc", greensalsa: "#e2f0c8", crema: "#ffffff", redsauce: "#ffd8cc", oil: "#eef0c0", honey: "#fff0c8" };

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
const BOTTLES: Record<SauceKind, ReturnType<typeof cached>> = {
  ketchup: cached(bottleParts("ketchup")),
  mustard: cached(bottleParts("mustard")),
  pesto: cached(bottleParts("pesto")),
  aioli: cached(bottleParts("aioli")),
  redsalsa: cached(bottleParts("redsalsa")),
  greensalsa: cached(bottleParts("greensalsa")),
  crema: cached(bottleParts("crema")),
  redsauce: cached(bottleParts("redsauce")),
  oil: cached(bottleParts("oil")),
  honey: cached(bottleParts("honey")),
};

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

const slotX = (n: number, i: number) => (i - (n - 1) / 2) * 2 * SLOT_X * (n > 2 ? 0.8 : 1);
const CADDIES = new Map<number, ReturnType<typeof cached>>();
/** The wire caddy for n bottles (two at the grill and the press, one to three at the comal). */
const caddy = (n: number) => {
  let c = CADDIES.get(n);
  if (!c) {
    c = cached(() => {
      const p = new Parts();
      const w = n === 2 ? BASE_W : Math.abs(slotX(n, 0)) * 2 + 0.82 + (n === 1 ? 0.2 : 0);
      p.add(rbox(w, 0.5, 1.1, 0.06), "#3a4043", { p: [0, 0.25, 0] });
      for (let i = 0; i < n; i++) {
        const x = slotX(n, i);
        p.add(tor(0.36, 0.04, 6, 24), "#8e9a98", { p: [x, 0.52, 0], r: [Math.PI / 2, 0, 0] });
        p.add(tor(0.36, 0.035, 6, 24), "#8e9a98", { p: [x, 1.4, 0], r: [Math.PI / 2, 0, 0] });
      }
      for (const x of [-w / 2 + 0.03, ...(n === 2 ? [0] : []), w / 2 - 0.03]) p.add(box(0.06, 1.0, 0.06), "#8e9a98", { p: [x, 0.95, 0] });
      p.add(box(w - 0.04, 0.05, 0.05), "#8e9a98", { p: [0, 1.4, 0] });
      return p;
    });
    CADDIES.set(n, c);
  }
  return c;
};

export interface SauceCaddyObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: { bottles: Partial<Record<SauceKind, { x: number; y: number; z: number }>> };
    /** The bottles standing in the caddy; hide one while it's lifted out. */
    bottles: Partial<Record<SauceKind, SauceBottleObject>>;
    kinds: SauceKind[];
  };
}

/**
 * The caddy with two bottles, one at each end (ketchup and mustard at the grill; pesto and aioli at
 * the panini press): about 1.7 x 0.73 game units, 1.53 tall.
 */
export function makeSauceCaddy(kinds: SauceKind[] = ["ketchup", "mustard"]): SauceCaddyObject {
  const g = new THREE.Group() as SauceCaddyObject;
  const n = Math.max(1, kinds.length);
  g.add(bakedMesh(caddy(n)()));
  const spots: Partial<Record<SauceKind, { x: number; y: number; z: number }>> = {};
  kinds.forEach((k, i) => (spots[k] = { x: slotX(n, i) * STUDY, y: SEAT_Y * STUDY, z: 0 }));
  const bottles: Partial<Record<SauceKind, SauceBottleObject>> = {};
  for (const k of kinds) {
    const b = makeSauceBottle(k);
    const sp = spots[k]!;
    b.position.set(sp.x, sp.y, sp.z);
    g.add(b);
    bottles[k] = b;
  }
  machine(g, n === 2 ? BASE_W : Math.abs(slotX(n, 0)) * 2 + 0.82, 1.1, SEAT_Y + NUB + 0.22 + BOTTLE_H, { bottles: spots });
  g.userData.bottles = bottles;
  g.userData.kinds = kinds;
  return g;
}
