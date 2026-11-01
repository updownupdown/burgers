import * as THREE from "three";
import type { Kind } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { vegParts } from "./food";
import { faceted } from "./materials";

/**
 * Ingredient bins on the grill counter: a deep steel pan holding a generous heap of one
 * ingredient. Each bin is one baked mesh (pan and heap together) plus its ink hull, built
 * once per kind and shared.
 *
 * Pieces in the heap are drawn at about BIN_PIECE times ingredient units, a little under the
 * counter food scale, so grabbing one reads as taking some from a large supply.
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

const HEAPS: Partial<Record<Kind, Builder>> = {
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
    // Bigger buns stacked three high, each a little off the one below, like a bakery bag tipped out.
    const s = 0.52;
    for (let i = 0; i < 3; i++) {
      const y = PAN.floor + i * 0.5;
      parts.addParts(buns[i % 2], { p: [jitter(r, 0.04), y, 0.04 - i * 0.03], r: [jitter(r, 0.08) - 0.06, r() * 6, jitter(r, 0.08)], s });
    }
  },
  patty: (parts, r) => {
    // A stack of raw patties with paper between them, one more slid off the top.
    const s = 0.5;
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
    const s = 0.5;
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
    const s = 0.43;
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
    // Shingled rows of slices leaning on each other.
    const s = 0.5;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const x = -0.3 + i * 0.2 + (row % 2) * 0.04;
        const z = -0.24 + row * 0.24;
        const tilt = -0.6;
        const p: [number, number, number] = [x, PAN.floor + 0.12, z];
        const rot: [number, number, number] = [jitter(r, 0.08), jitter(r, 0.12), tilt];
        parts.addParts(vegParts("tomato", false, 0.012), { p, r: rot, s: s * 0.92 });
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
    const s = 0.62;
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 34);
      const p: [number, number, number] = [Math.cos(a) * rr * 0.42, PAN.floor + 0.03 + (1 - rr) * 0.2 + r() * 0.025, Math.sin(a) * rr * 0.34];
      const rot: [number, number, number] = [jitter(r, 0.5), r() * 6, jitter(r, 0.5)];
      parts.addParts(vegParts("pickle", false, 0.012), { p, r: rot, s: s * 0.73 });
    }
  },
  pineapple: (parts, r) => {
    // Rings fanned like fallen dominoes, two rows.
    const s = 0.4;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const x = row ? 0.2 : -0.2;
        const z = -0.27 + i * 0.17 + row * 0.06;
        parts.add(G.pineapple, i % 2 ? "#f5d33f" : "#efc935", { p: [x, PAN.floor + 0.12 + row * 0.04, z], r: [-0.95 + jitter(r, 0.08), jitter(r, 0.15), jitter(r, 0.08)], s, ink: 0.016 });
      }
    }
  },
  jalapeno: (parts, r) => {
    const s = 0.62;
    for (let i = 0; i < 40; i++) {
      const a = i * 2.399;
      const rr = Math.sqrt((i + 0.5) / 40);
      const p: [number, number, number] = [Math.cos(a) * rr * 0.42, PAN.floor + 0.03 + (1 - rr) * 0.18 + r() * 0.02, Math.sin(a) * rr * 0.34];
      const rot: [number, number, number] = [jitter(r, 0.5), r() * 6, jitter(r, 0.5)];
      parts.addParts(vegParts("jalapeno", i % 9 === 4, 0.01), { p, r: rot, s: s * 0.8 });
    }
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
};

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
