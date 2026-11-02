import * as THREE from "three";
import type { Kind } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { TOMATO_VARIANTS, vegParts } from "./food";
import { basilSprig, loafParts, paniniParts, rawParts, ROCKET_GREENS, rocketLeaf } from "./panini";
import { fillParts, limeParts, tortillaStackParts } from "./tacos";
import { blueParts, figParts, hamParts, mushroomParts, pearHalfParts, wholeMushroomParts } from "./flatbread";
import { faceted } from "./materials";

/**
 * Ingredient bins on the grill counter: a deep steel pan holding a generous heap of one
 * ingredient. Each bin is one baked mesh (pan and heap together) plus its ink hull, built
 * once per kind and shared.
 *
 * Pieces in the heap are drawn so that, once the cold rail fits the heap to its pan (x0.86), they
 * come out at the counter food scale (COUNTER_FOOD): the piece you pull out is the size of the
 * ones left in the pan. HEAP_S is that scale for burger parts; thin toppings get TOPPING_BOOST more.
 */

/** Pan footprint: matches the old bin box. */
export const PAN = { w: 1.18, d: 1.0, h: 0.34, floor: 0.07 };

const lathe = (pts: [number, number][], segs: number) => faceted(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs));
const cyl = (rt: number, rb: number, h: number, segs: number) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs);
  g.translate(0, h / 2, 0);
  return faceted(g);
};
const box = (w: number, h: number, d: number) => faceted(new THREE.BoxGeometry(w, h, d));

/** Base shapes in ingredient units (a patty is about 2 wide), with the bottom at y = 0. */
const G = {
  heel: lathe([[0, 0], [0.92, 0], [1.0, 0.06], [1.03, 0.17], [0.99, 0.27], [0.9, 0.31], [0, 0.31]], 14),
  crown: lathe([[0, 0], [0.98, 0], [1.05, 0.08], [1.03, 0.22], [0.9, 0.42], [0.66, 0.6], [0.36, 0.7], [0, 0.73]], 14),
  seam: cyl(1.0, 1.0, 0.04, 14),
  seed: box(0.11, 0.04, 0.06),
  patty: (() => {
    const g = new THREE.CylinderGeometry(1, 1, 0.28, 14, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1.02 + 0.04 * Math.sin(5 * a) + 0.03 * Math.sin(11 * a + 1.3);
      p.setXYZ(i, x * k, p.getY(i) + 0.14 + (p.getY(i) > 0 ? 0.02 * Math.sin(3 * x + 2 * z) : 0), z * k);
    }
    return faceted(g);
  })(),
  paper: box(2.0, 0.02, 2.0),
  baconMeat: wavy(1.9, 0.05, 0.36),
  baconFat: wavy(1.9, 0.055, 0.09),
  slice: box(1.9, 0.045, 1.9),
  leaf: (() => {
    // A crumpled leaf: a lumpy, flattened ball.
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.22 * Math.sin(4 * x + 3 * z) + 0.12 * Math.sin(7 * y - 5 * x);
      p.setXYZ(i, x * k, y * k * 0.42, z * k);
    }
    return faceted(g);
  })(),
  ring: (r: number, tube: number, segs: number) => {
    const g = new THREE.TorusGeometry(r, tube, 4, segs);
    g.rotateX(Math.PI / 2);
    return faceted(g);
  },
  pineapple: lathe([[0.3, 0], [0.88, 0], [0.92, 0.06], [0.88, 0.12], [0.3, 0.12], [0.28, 0.06], [0.3, 0]], 12),
  egg: (() => {
    const g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(1, 1.3, 1);
    g.translate(0, 1.3, 0);
    return faceted(g);
  })(),
  cup: cyl(0.16, 0.11, 0.1, 6),
};

function wavy(len: number, h: number, w: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, h, w, 10, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.06 * Math.sin(p.getX(i) * 5) + h / 2);
  return faceted(g);
}

const ONION = [G.ring(0.32, 0.05, 12), G.ring(0.44, 0.05, 14)];

/** The steel pan: floor, four walls and a rolled rim. */
function pan(parts: Parts): void {
  const { w, d, h, floor } = PAN;
  const t = 0.05;
  const wall = "#d3dcd9";
  parts.add(box(w - 0.04, floor, d - 0.04), "#8fa39e", { p: [0, floor / 2, 0], ink: 0.015 });
  parts.add(box(w, h, t), wall, { p: [0, h / 2, -d / 2 + t / 2], ink: 0.018 });
  parts.add(box(w, h, t), wall, { p: [0, h / 2, d / 2 - t / 2], ink: 0.018 });
  parts.add(box(t, h, d - 2 * t), wall, { p: [-w / 2 + t / 2, h / 2, 0], ink: 0.018 });
  parts.add(box(t, h, d - 2 * t), wall, { p: [w / 2 - t / 2, h / 2, 0], ink: 0.018 });
  // Inside shadow line just below the rim, so the pan reads as deep.
  parts.add(box(w - 2 * t, 0.012, d - 2 * t), "#6f817d", { p: [0, floor + 0.007, 0], ink: false });
}

type Builder = (parts: Parts, r: () => number) => void;

const jitter = (r: () => number, a: number) => (r() - 0.5) * 2 * a;

/** Heap scale for burger parts (see the note at the top), and for thin toppings. */
const HEAP_S = 0.514;
const VEG_S = 0.548;

/** A pan heaped with one of the flatbread toppings: `n` pieces in a mound, two layers deep. */
function mound(parts: Parts, r: () => number, piece: (i: number) => Parts, n: number, s: number, lift = 0.05): void {
  for (let i = 0; i < n; i++) {
    const a = i * 2.399;
    const rr = Math.sqrt((i + 0.5) / n);
    parts.addParts(piece(i), { p: [Math.cos(a) * rr * 0.36, PAN.floor + lift + (1 - rr) * 0.12 + r() * 0.03, Math.sin(a) * rr * 0.27], r: [jitter(r, 0.3), r() * 6, jitter(r, 0.3)], s });
  }
}

const HEAPS: Partial<Record<Kind, Builder>> = {
  // Orchard Isle's toppings (DESIGN §24, phase 4), drawn with the flatbread's own pieces.
  mushroom: (parts, r) => {
    // Sliced mushrooms with whole caps on top, so they never read as onion or pear (after build #76).
    mound(parts, r, () => mushroomParts(false), 9, 1.25);
    for (const [x, z] of [[-0.24, -0.16], [0.2, -0.17], [0, 0.17]] as const) parts.addParts(wholeMushroomParts(), { p: [x + jitter(r, 0.03), PAN.floor + 0.12, z + jitter(r, 0.03)], r: [jitter(r, 0.15), r() * 6, jitter(r, 0.15)], s: 1.05 });
  },
  ham: (parts, r) => mound(parts, r, (i) => hamParts(i + 1), 9, 1.15),
  fig: (parts, r) => mound(parts, r, () => figParts(), 11, 1.35),
  pear: (parts, r) => {
    // Pear halves, cut face up (after build #76: a heap of thin slices read as beans).
    for (const [x, z, yaw] of [[-0.27, -0.1, 0.25], [0.02, -0.14, -0.1], [0.3, -0.08, 0.35], [-0.12, 0.2, -0.3], [0.18, 0.22, 0.15]] as const)
      parts.addParts(pearHalfParts(), { p: [x + jitter(r, 0.02), PAN.floor + 0.03 + (z > 0 ? 0.04 : 0), z], r: [z > 0 ? -0.12 : 0.04, yaw, 0], s: 0.85 });
  },
  blue: (parts, r) => {
    // A big ivory wedge of blue cheese, marbled with blue veins, and its crumbles in front (after
    // build #76: creamy and veined, never the clean white of mozzarella).
    const wedge = new Parts().add(faceted(new THREE.CylinderGeometry(0.52, 0.52, 0.28, 3, 1, false, 0, Math.PI * 0.5)), "#efe6cc", { ink: 0.016 });
    for (let i = 0; i < 12; i++) {
      const th = 0.12 + r() * (Math.PI * 0.5 - 0.24);
      const d = 0.1 + r() * 0.34;
      wedge.add(box(0.07 + r() * 0.07, 0.01, 0.024), i % 3 ? "#56699a" : "#3f527e", { p: [Math.sin(th) * d, 0.142, Math.cos(th) * d], r: [0, r() * 3, 0], ink: false });
    }
    parts.addParts(wedge, { p: [-0.36, PAN.floor + 0.14, -0.34], r: [0, 0.15, 0] });
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 6);
      parts.addParts(blueParts(false, i + 2), { p: [0.18 + Math.cos(a) * rr * 0.2, PAN.floor + 0.02, 0.18 + Math.sin(a) * rr * 0.15], r: [0, r() * 6, 0], s: 1.3 });
    }
  },
  bun: (parts, r) => {
    const bun = (crown: string) => {
      const b = new Parts()
        .add(G.heel, "#df9a3e")
        .add(G.seam, "#f4d79a", { p: [0, 0.29, 0], ink: false })
        .add(G.crown, crown, { p: [0, 0.32, 0] });
      for (let i = 0; i < 9; i++) {
        const a = i * 2.399;
        const rr = Math.sqrt((i + 0.5) / 9) * 0.75;
        const y = 0.32 + 0.73 * Math.sqrt(Math.max(0, 1 - (rr / 1.06) ** 2));
        b.add(G.seed, "#fff3d8", { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [0, a, 0], ink: false });
      }
      return b;
    };
    // Slightly different bakes, so neighbouring buns separate.
    const buns = [bun("#e3a03c"), bun("#d48f30")];
    // Buns stacked three high, each a little off the one below, like a bakery bag tipped out.
    const s = HEAP_S;
    for (let i = 0; i < 3; i++) {
      const y = PAN.floor + i * 0.5;
      parts.addParts(buns[i % 2], { p: [jitter(r, 0.04), y, 0.04 - i * 0.03], r: [jitter(r, 0.08) - 0.06, r() * 6, jitter(r, 0.08)], s });
    }
  },
  patty: (parts, r) => {
    // A stack of raw patties with paper between them, one more slid off the top.
    const s = HEAP_S;
    let y = PAN.floor;
    for (let i = 0; i < 4; i++) {
      parts.add(G.paper, "#f4f1ea", { p: [jitter(r, 0.02), y, jitter(r, 0.02)], r: [0, 0.1 + jitter(r, 0.12), 0], s, ink: 0.01 });
      y += 0.012;
      parts.add(G.patty, i % 2 ? "#d9737b" : "#d36a74", { p: [jitter(r, 0.03), y, jitter(r, 0.03)], r: [0, r() * 6, 0], s });
      y += 0.28 * s + 0.004;
    }
    parts.add(G.paper, "#f4f1ea", { p: [0, y, 0], r: [0, 0.25, 0], s, ink: 0.01 });
    parts.add(G.patty, "#dc7680", { p: [0.04, y + 0.03, -0.05], r: [0.1, 1.3, -0.08], s });
  },
  bacon: (parts, r) => {
    const s = HEAP_S;
    for (let i = 0; i < 9; i++) {
      const z = -0.3 + (i % 5) * 0.15 + (i > 4 ? 0.07 : 0);
      const y = PAN.floor + (i > 4 ? 0.07 : 0) + (i % 5) * 0.012;
      const rot: [number, number, number] = [jitter(r, 0.06), jitter(r, 0.14), jitter(r, 0.04)];
      parts.add(G.baconMeat, i % 3 ? "#d9616f" : "#e26b78", { p: [jitter(r, 0.04), y, z], r: rot, s });
      parts.add(G.baconFat, "#f8dcd6", { p: [jitter(r, 0.0), y + 0.004, z], r: rot, s, ink: false });
    }
  },
  cheese: (parts, r) => {
    // A deli stack of slices, edges slightly fanned so the layers show.
    const s = HEAP_S;
    for (let i = 0; i < 9; i++) {
      const y = PAN.floor + i * 0.022;
      parts.add(G.slice, i % 2 ? "#f7c531" : "#efb827", { p: [jitter(r, 0.025) - 0.03 + i * 0.006, y, jitter(r, 0.025)], r: [0, jitter(r, 0.07), 0], s, ink: i === 8 ? 0.02 : 0.012 });
    }
    parts.add(G.slice, "#f9cc3c", { p: [0.04, PAN.floor + 0.23, 0.02], r: [0.06, 0.22, -0.08], s, ink: 0.018 });
  },
  lettuce: (parts, r) => {
    const greens = ["#68bf45", "#7ccc55", "#57aa3a", "#8fd468"];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 16);
      const x = Math.cos(a) * rr * 0.36;
      const z = Math.sin(a) * rr * 0.26;
      const y = PAN.floor + 0.06 + (1 - rr) * 0.22 + r() * 0.04;
      const k = 0.17 + r() * 0.07;
      parts.add(G.leaf, greens[i % greens.length], { p: [x, y, z], r: [jitter(r, 0.4), r() * 6, jitter(r, 0.4)], s: [k * 1.2, k, k], ink: 0.016 });
    }
  },
  tomato: (parts, r) => {
    // Shingled rows of slices leaning on each other, every one a little different and out of line.
    const s = VEG_S / 0.92;
    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const x = -0.3 + i * 0.2 + (row % 2) * 0.04 + jitter(r, 0.025);
        const z = -0.24 + row * 0.24 + jitter(r, 0.02);
        const tilt = -0.6 + jitter(r, 0.12);
        const p: [number, number, number] = [x, PAN.floor + 0.12, z];
        const rot: [number, number, number] = [jitter(r, 0.1), jitter(r, 0.25), tilt];
        parts.addParts(vegParts("tomato", false, 0.012, n++ % TOMATO_VARIANTS), { p, r: rot, s: s * (0.86 + r() * 0.12) });
      }
    }
  },
  onion: (parts, r) => {
    const s = 0.62;
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 16);
      const big = i % 3 !== 0;
      parts.add(ONION[big ? 1 : 0], i % 4 ? "#ecd5f0" : "#dcbde3", {
        p: [Math.cos(a) * rr * 0.32, PAN.floor + 0.05 + (1 - rr) * 0.16 + r() * 0.03, Math.sin(a) * rr * 0.24],
        r: [jitter(r, 0.45), r() * 6, jitter(r, 0.45)],
        s,
        ink: 0.012,
      });
    }
  },
  pickle: (parts, r) => {
    const s = VEG_S / 0.73;
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 34);
      const p: [number, number, number] = [Math.cos(a) * rr * 0.42, PAN.floor + 0.03 + (1 - rr) * 0.2 + r() * 0.025, Math.sin(a) * rr * 0.34];
      const rot: [number, number, number] = [jitter(r, 0.5), r() * 6, jitter(r, 0.5)];
      parts.addParts(vegParts("pickle", false, 0.012), { p, r: rot, s: s * 0.73 });
    }
  },
  pineapple: (parts, r) => {
    // Rings lying nearly flat and shingled, the hole in each showing, so they read as the same ring
    // that goes on the grill (after build #76: tipped up on edge they looked like sticks).
    const s = 0.3;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 3; i++) {
        const x = -0.3 + i * 0.29 + row * 0.04;
        const z = -0.17 + row * 0.32;
        parts.add(G.pineapple, (i + row) % 2 ? "#f5d33f" : "#efc935", { p: [x, PAN.floor + 0.03 + i * 0.03 + row * 0.03, z], r: [-0.12 + jitter(r, 0.05), jitter(r, 0.3), -0.2 + jitter(r, 0.05)], s, ink: 0.014 });
      }
    }
  },
  jalapeno: (parts, r) => {
    const s = VEG_S / 0.8;
    for (let i = 0; i < 40; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 40);
      const p: [number, number, number] = [Math.cos(a) * rr * 0.42, PAN.floor + 0.03 + (1 - rr) * 0.18 + r() * 0.02, Math.sin(a) * rr * 0.34];
      const rot: [number, number, number] = [jitter(r, 0.5), r() * 6, jitter(r, 0.5)];
      parts.addParts(vegParts("jalapeno", i % 9 === 4, 0.01), { p, r: rot, s: s * 0.8 });
    }
  },
  // ---- the panini press's pans (the Sunny Coast) ----
  ciabatta: (parts) => breadBin(parts, "ciabatta"),
  sourdough: (parts) => breadBin(parts, "sourdough"),
  chicken: (parts, r) => {
    // Raw breasts on paper, fanned so each reads.
    const s = HEAP_S;
    parts.add(G.paper, "#f4f1ea", { p: [0, PAN.floor, 0], r: [0, 0.1, 0], s, ink: 0.01 });
    // Plump and peachy, thicker than a slice of ham (after build #76), each breast's narrow end the same way.
    for (let i = 0; i < 4; i++) parts.addParts(rawParts("chicken"), { p: [jitter(r, 0.04), PAN.floor + 0.02 + i * 0.08, -0.2 + i * 0.13], r: [-0.22 + jitter(r, 0.05), (i % 2 ? 0.25 : -0.2) + jitter(r, 0.1), jitter(r, 0.05)], s: [s * 0.92, s * 1.4, s * 0.92] });
  },
  veggie: (parts, r) => {
    const s = HEAP_S;
    let y = PAN.floor;
    for (let i = 0; i < 4; i++) {
      parts.add(G.paper, "#f4f1ea", { p: [jitter(r, 0.02), y, jitter(r, 0.02)], r: [0, 0.1 + jitter(r, 0.12), 0], s, ink: 0.01 });
      y += 0.012;
      parts.addParts(rawParts("veggie"), { p: [jitter(r, 0.03), y, jitter(r, 0.03)], r: [0, r() * 6, 0], s });
      y += 0.26 * s + 0.004;
    }
  },
  mozzarella: (parts, r) => {
    // Fresh mozzarella: five round, shiny balls sitting apart in their whey (after build #76), so
    // they read as balls, not as a heap of white like the blue cheese.
    parts.add(box(1.06, 0.02, 0.9), "#dce7e4", { p: [0, PAN.floor + 0.03, 0], ink: false });
    const ball = faceted(new THREE.SphereGeometry(1, 14, 10));
    const shine = faceted(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2));
    for (const [x, z] of [[-0.29, -0.17], [0, -0.2], [0.28, -0.15], [-0.15, 0.17], [0.16, 0.18]] as const) {
      const k = 0.15 + r() * 0.025;
      const at: [number, number, number] = [x + jitter(r, 0.02), PAN.floor + 0.03 + k * 0.8, z + jitter(r, 0.02)];
      parts.add(ball, "#fdfcf6", { p: at, s: [k, k * 0.88, k], ink: 0.016 });
      parts.add(shine, "#ffffff", { p: [at[0] - k * 0.3, at[1] + k * 0.85, at[2] - k * 0.3], s: [k * 0.28, 1, k * 0.2], ink: false });
    }
  },
  basil: (parts, r) => {
    // A bunch of sprigs fanned out from their stems at the front, the way a bunch of basil lies (after build #76).
    const s = 0.84;
    for (let i = 0; i < 3; i++) {
      const yaw = 2.05 + i * 0.4 + jitter(r, 0.05);
      const half = 0.45 * s;
      parts.addParts(basilSprig(0.022), { p: [0.36 + Math.cos(yaw) * half, PAN.floor + 0.05 + i * 0.025, 0.33 - Math.sin(yaw) * half], r: [jitter(r, 0.06), yaw, jitter(r, 0.06)], s });
    }
  },
  avocado: (parts, r) => {
    // Avocado halves, flesh up, pits in two of them.
    const half = faceted(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 0.2 : -0.2;
      const z = i < 2 ? -0.18 : 0.2;
      const yaw = r() * 6;
      parts.add(half, "#3f6a24", { p: [x, PAN.floor + 0.2, z], r: [Math.PI, yaw, 0], s: [0.21, 0.16, 0.28], ink: 0.016 });
      parts.add(faceted(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2)), "#d6e48e", { p: [x, PAN.floor + 0.205, z], r: [0, yaw, 0], s: [0.19, 1, 0.26], ink: false });
      parts.add(faceted(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2)), "#f1edb0", { p: [x, PAN.floor + 0.208, z], r: [0, yaw, 0], s: [0.12, 1, 0.17], ink: false });
      if (i % 2 === 0) parts.add(faceted(new THREE.SphereGeometry(0.08, 8, 6)), "#7a4a26", { p: [x, PAN.floor + 0.22, z], s: [1, 0.7, 1], ink: 0.012 });
    }
  },
  rocket: (parts, r) => {
    // A loose tangle of lobed leaves, dropped at random (no spiral), the middle piled higher.
    for (let i = 0; i < 18; i++) {
      const x = jitter(r, 0.3);
      const z = jitter(r, 0.22);
      const yaw = r() * Math.PI * 2;
      const len = 0.62 + r() * 0.2;
      const c = 1 - Math.min(1, Math.hypot(x / 0.3, z / 0.22));
      const at: [number, number, number] = [x - Math.cos(yaw) * len * 0.31, PAN.floor + 0.04 + c * 0.12 + r() * 0.04, z + Math.sin(yaw) * len * 0.31];
      parts.addParts(rocketLeaf(len, ROCKET_GREENS[i % 4], 0.016, i), { p: at, r: [jitter(r, 0.35), yaw, jitter(r, 0.25)], s: 0.62 });
    }
  },
  cheddar: (parts, r) => {
    const s = HEAP_S;
    for (let i = 0; i < 9; i++) {
      const y = PAN.floor + i * 0.022;
      parts.add(G.slice, i % 2 ? "#f39a1e" : "#e88c16", { p: [jitter(r, 0.025) - 0.03 + i * 0.006, y, jitter(r, 0.025)], r: [0, jitter(r, 0.07), 0], s, ink: i === 8 ? 0.02 : 0.012 });
    }
    parts.add(G.slice, "#f5a42a", { p: [0.04, PAN.floor + 0.23, 0.02], r: [0.06, 0.22, -0.08], s, ink: 0.018 });
  },
  redonion: (parts, r) => {
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 16);
      parts.addParts(paniniParts("redonion", 0.012), { p: [Math.cos(a) * rr * 0.32, PAN.floor + 0.04 + (1 - rr) * 0.14 + r() * 0.03, Math.sin(a) * rr * 0.24], r: [jitter(r, 0.45), r() * 6, jitter(r, 0.45)], s: 0.6 });
    }
  },
  tuna: (parts, r) => {
    // The tuna well: a smooth mound with a steel scoop resting in it.
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 6);
      parts.addParts(paniniParts("tuna", 0.014), { p: [Math.cos(a) * rr * 0.3, PAN.floor + 0.04 + (1 - rr) * 0.06, Math.sin(a) * rr * 0.22], r: [0, r() * 6, 0], s: 0.75 });
    }
    parts.add(faceted(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#c9d1cf", { p: [0.18, PAN.floor + 0.22, 0.08], r: [Math.PI, 0, 0], s: [1, 0.6, 1], ink: 0.014 });
    parts.add(box(0.5, 0.035, 0.05), "#8e9a98", { p: [0.4, PAN.floor + 0.3, -0.08], r: [0, 0.5, 0.35], ink: 0.012 });
  },
  egg: (parts, r) => {
    // A cardboard flat of six big whole eggs, at the same scale as the egg in your hand.
    parts.add(box(1.1, 0.06, 0.9), "#cdbb9b", { p: [0, PAN.floor + 0.03, 0], ink: 0.012 });
    for (let ix = 0; ix < 3; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const x = -0.36 + ix * 0.36;
        const z = -0.2 + iz * 0.4;
        parts.add(G.cup, "#bfac8b", { p: [x, PAN.floor + 0.05, z], s: [1.2, 1, 1.2], ink: false });
        parts.add(G.egg, (ix + iz) % 3 ? "#f6efe2" : "#efe2cc", { p: [x, PAN.floor + 0.04, z], r: [jitter(r, 0.15), 0, jitter(r, 0.15)], s: 0.165, ink: 0.014 });
      }
    }
  },
  corn: (parts) => {
    // A stack of corn tortillas in a cloth-lined pan.
    parts.add(box(1.08, 0.03, 0.92), "#e9e0cc", { p: [0, PAN.floor + 0.015, 0], ink: false });
    parts.addParts(tortillaStackParts("corn", 9, 1), { p: [0, PAN.floor + 0.03, 0], s: HEAP_S });
  },
  flour: (parts) => {
    parts.add(box(1.08, 0.03, 0.92), "#e9e0cc", { p: [0, PAN.floor + 0.015, 0], ink: false });
    parts.addParts(tortillaStackParts("flour", 8, 1), { p: [0, PAN.floor + 0.03, 0], s: 0.42 });
  },
  pork: (parts) => {
    parts.addParts(fillParts("pork", 0.95, 0.8, 3, 3.2, 0.03), { p: [0, PAN.floor, 0], s: 0.55 });
    parts.addParts(fillParts("pork", 0.7, 0.55, 5, 2, 0.03), { p: [0, PAN.floor + 0.07, 0], s: 0.55 });
    scoop(parts);
  },
  beans: (parts) => {
    parts.addParts(fillParts("beans", 0.98, 0.84, 2, 1.6, 0.03), { p: [0, PAN.floor, 0], s: 0.55 });
    scoop(parts);
  },
  cilantro: (parts) => {
    // Chopped leaflets heaped up, a few whole sprigs on top.
    parts.addParts(fillParts("cilantro", 0.68, 0.56, 1, 2.6, 0.026), { p: [0, PAN.floor + 0.02, 0], s: 0.8 });
    parts.addParts(fillParts("cilantro", 0.48, 0.38, 4, 1.6, 0.026), { p: [0, PAN.floor + 0.06, 0], s: 0.8 });
    parts.addParts(fillParts("cilantroSprigs", 0.42, 0.3, 2, 1, 0.026), { p: [0, PAN.floor + 0.09, 0], s: 0.9 });
  },
  lime: (parts, r) => {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 7);
      parts.addParts(limeParts(0.03), { p: [Math.cos(a) * rr * 0.36, PAN.floor + 0.05 + (1 - rr) * 0.06, Math.sin(a) * rr * 0.28], r: [0, r() * 6, 0], s: VEG_S });
    }
  },
  jack: (parts) => {
    parts.addParts(fillParts("jack", 0.95, 0.8, 1, 4, 0.03), { p: [0, PAN.floor + 0.02, 0], s: 0.55 });
    parts.addParts(fillParts("jack", 0.75, 0.6, 3, 3, 0.03), { p: [0, PAN.floor + 0.07, 0], s: 0.55 });
  },
};

/** A steel serving spoon resting in a pan (the pork and bean wells). */
function scoop(parts: Parts): void {
  parts.add(faceted(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), "#c9d1cf", { p: [0.2, PAN.floor + 0.2, 0.1], r: [Math.PI, 0, 0], s: [1, 0.6, 1], ink: 0.014 });
  parts.add(box(0.5, 0.035, 0.05), "#8e9a98", { p: [0.42, PAN.floor + 0.28, -0.06], r: [0, 0.5, 0.35], ink: 0.012 });
}

/**
 * Bread in the bin, so the two breads read apart at a glance (after build #76): ciabatta is two
 * flat, floury loaves lying side by side with a split half in front showing its holes; sourdough is
 * a round dark boule, scored, with domed slices in front.
 */
function breadBin(parts: Parts, kind: "ciabatta" | "sourdough"): void {
  parts.add(box(1.04, 0.05, 0.88), "#c58a52", { p: [0, PAN.floor + 0.025, 0], ink: 0.012 });
  const s = HEAP_S * 0.92;
  const y = PAN.floor + 0.05;
  if (kind === "ciabatta") {
    // A whole loaf at the back, two halves shingled in front, holes up.
    parts.addParts(loafParts("ciabatta"), { p: [0, y, -0.2], r: [0, 0.04, 0], s: s * 0.78 });
    parts.addParts(rawParts("ciabatta"), { p: [-0.02, y + 0.02, 0.12], r: [-0.12, -0.06, 0], s: s * 0.8 });
    parts.addParts(rawParts("ciabatta"), { p: [0.03, y + 0.06, 0.27], r: [-0.18, 0.08, 0], s: s * 0.8 });
    return;
  }
  // The boule at the back, two domed slices shingled in front, crumb up.
  parts.addParts(loafParts("sourdough"), { p: [0, y, -0.17], r: [0, 0.3, 0], s: s * 0.62 });
  parts.addParts(rawParts("sourdough"), { p: [-0.13, y + 0.02, 0.17], r: [-0.14, 0.18, 0], s: s * 0.66 });
  parts.addParts(rawParts("sourdough"), { p: [0.14, y + 0.06, 0.22], r: [-0.18, -0.12, 0], s: s * 0.66 });
}

/** The heap for one kind on its own, without the pan, in game units with the pan's base at y = 0. */
export function heapParts(kind: Kind): Parts {
  const parts = new Parts();
  HEAPS[kind]?.(parts, rng(kind.length * 977 + kind.charCodeAt(0)));
  return parts;
}

const cache = new Map<Kind, Baked>();

function heapGeometry(kind: Kind): Baked {
  let b = cache.get(kind);
  if (!b) {
    const parts = new Parts();
    pan(parts);
    HEAPS[kind]?.(parts, rng(kind.length * 977 + kind.charCodeAt(0)));
    b = bakeShared(parts);
    cache.set(kind, b);
  }
  return b;
}

/** A bin for one ingredient: the pan and its heap, origin at the pan's base centre. */
export function makeBin(kind: Kind): THREE.Mesh {
  return bakedMesh(heapGeometry(kind));
}
