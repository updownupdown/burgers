import * as THREE from "three";
import { cookLevel, isMelted } from "../game/cooking";
import type { Kind, Piece } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, grade, mesh, ramp, setLine, shareGeometry, toon } from "./materials";

/*
 * The Sunny Coast's panini parts (DESIGN §24, phase 2), in the same ingredient units as the burger
 * parts (a bun is 2 across): ciabatta and sourdough slices that go pale, golden with press lines,
 * then dark; a chicken breast (pink, white, dry) and a veggie patty (soft, crisp, burnt); and the
 * cold fillings, chunky and countable like the burger veg. makeFood() hands these kinds over here.
 */

/** Natural thickness of each panini piece, in ingredient units. */
export const PANINI_HEIGHT: Partial<Record<Kind, number>> = {
  ciabatta: 0.3,
  sourdough: 0.26,
  chicken: 0.2,
  veggie: 0.26,
  mozzarella: 0.11,
  basil: 0.06,
  avocado: 0.1,
  rocket: 0.12,
  cheddar: 0.05,
  redonion: 0.12,
  tuna: 0.18,
  pesto: 0.04,
  aioli: 0.04,
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Bread face: pale, golden, dark brown, burnt (on the bread's cook scale). */
const breadRamp = ramp([
  [0, "#f4e3bd"],
  [0.35, "#e8b867"],
  [0.6, "#d4954a"],
  [0.8, "#9c5e2a"],
  [1.0, "#3b2216"],
]);
/** Pink raw, white as it cooks through, then golden off the press plates; amber and brown once dry (DESIGN §45). */
const chickenRamp = ramp([
  [0, "#f5bfb2"],
  [0.25, "#f3cfc0"],
  [0.4, "#f6e6cc"],
  [0.6, "#eec27c"],
  [0.78, "#d99a52"],
  [0.92, "#a8692f"],
  [1.05, "#4a2c16"],
]);
const veggieRamp = ramp([
  [0, "#bccb8e"],
  [0.35, "#b1a65a"],
  [0.6, "#a7813e"],
  [0.85, "#7a5428"],
  [1.0, "#2e2214"],
]);

/** A shape in the (x, z) plane extruded up by h, with a small rounded bevel. */
function slab(shape: THREE.Shape, h: number, bevel = 0.04): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return faceted(g);
}
function flat(shape: THREE.Shape, y: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 10);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return faceted(g);
}
function roundRect(hw: number, hd: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}
/** A superellipse outline: squarish ovals for sourdough, the veggie patty and the like. */
function blob(hw: number, hd: number, n: number, k = 1, segs = 40, wobble = 0, seed = 0): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const w = 1 + wobble * Math.sin(a * 5 + seed) + wobble * 0.6 * Math.sin(a * 9 + seed * 2);
    // A teardrop when k != 1: the -x end narrows.
    const taper = c < 0 ? 1 - (1 - k) * -c : 1;
    pts.push(new THREE.Vector2(Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * hw * w, Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * hd * w * taper));
  }
  return new THREE.Shape(pts);
}

/**
 * A slice off a round loaf: a straight bottom crust and a domed top (the shape a child draws for
 * "bread"), in the (x, y) plane with the dome toward +y (the back, once laid flat).
 */
function tombstone(hw: number, hd: number, dome: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = 0.16;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - dome);
  s.absellipse(0, hd - dome, hw, dome, 0, Math.PI, false, 0);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

/**
 * Bread outlines (after build #76, so the two never look alike): ciabatta a wide, flat, floury
 * oblong with a thin pale crust and big holes; sourdough a tall slice off a round loaf, domed at
 * the top, with a thick dark crust all round and a close crumb. `inset` is how much of the slice
 * the crumb covers (the rest shows as crust).
 */
const BREAD = {
  ciabatta: { shape: roundRect(1.2, 0.6, 0.24), crust: "#d9b27a", h: PANINI_HEIGHT.ciabatta!, inset: 0.92 },
  sourdough: { shape: tombstone(0.92, 0.86, 0.5), crust: "#7e4a22", h: PANINI_HEIGHT.sourdough!, inset: 0.8 },
};
const breadGeo = new Map<string, { body: THREE.BufferGeometry; face: THREE.BufferGeometry }>();
function breadShapes(kind: "ciabatta" | "sourdough") {
  let g = breadGeo.get(kind);
  if (!g) {
    const b = BREAD[kind];
    const face = b.shape.clone();
    g = { body: shareGeometry(slab(b.shape, b.h)), face: shareGeometry(flat(new THREE.Shape(face.getPoints(10).map((p) => p.clone().multiplyScalar(b.inset))), b.h + 0.004)) };
    breadGeo.set(kind, g);
  }
  return g;
}
/** Ciabatta's big, open holes and a dusting of flour at the edge; sourdough's fine, close crumb. */
const BREAD_DETAIL: Record<"ciabatta" | "sourdough", Baked> = {
  ciabatta: (() => {
    const p = new Parts();
    const r = rng(41);
    const dot = faceted(new THREE.CircleGeometry(0.07, 7).rotateX(-Math.PI / 2));
    // Big irregular holes, the ciabatta mark.
    for (let i = 0; i < 11; i++) p.add(dot, i % 3 ? "#c6965a" : "#b27e45", { p: [(r() - 0.5) * 1.75, 0.008, (r() - 0.5) * 0.78], s: [1.3 + r() * 1.1, 1, 0.8 + r() * 0.7], ink: false });
    // Flour caught along the crust.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3;
      p.add(dot, "#fdfaf2", { p: [Math.cos(a) * 1.02, 0.006, Math.sin(a) * 0.5], s: [0.9 + r() * 0.8, 1, 0.6 + r() * 0.5], ink: false });
    }
    return bakeShared(p);
  })(),
  sourdough: (() => {
    const p = new Parts();
    const r = rng(17);
    const dot = faceted(new THREE.CircleGeometry(0.035, 6).rotateX(-Math.PI / 2));
    for (let i = 0; i < 26; i++) p.add(dot, "#c99a62", { p: [(r() - 0.5) * 1.2, 0.006, (r() - 0.5) * 1.0 - 0.05], s: [0.8 + r() * 0.8, 1, 0.6 + r() * 0.5], ink: false });
    return bakeShared(p);
  })(),
};
/** Press lines: dark ribs across the face once it's golden. */
const PRESS_LINES = (() => {
  const p = new Parts();
  for (let i = 0; i < 5; i++) p.add(faceted(new THREE.BoxGeometry(1.75, 0.006, 0.075)), "#ffffff", { p: [0, 0, -0.52 + i * 0.26], ink: false });
  return bakeShared(p);
})();
const CUT_GEO = shareGeometry(faceted(new THREE.BoxGeometry(0.055, 0.01, 1.9)));

function makeBread(kind: "ciabatta" | "sourdough", body: THREE.Group): (p: Piece) => void {
  const { body: bg, face: fg } = breadShapes(kind);
  const b = BREAD[kind];
  const crust = mesh(bg, b.crust, { unique: true, ink: 1.03 });
  const face = mesh(fg, "#f4e3bd", { unique: true, ink: false, shadow: false });
  const detail = new THREE.Mesh(BREAD_DETAIL[kind].geo, toon(0xffffff, { vertexColors: true }));
  detail.position.y = b.h + 0.004;
  detail.castShadow = false;
  const lineMat = toon("#7a4520", { unique: true });
  const lines = new THREE.Mesh(PRESS_LINES.geo, lineMat);
  lines.position.y = b.h + 0.009;
  lines.castShadow = false;
  // The cut (after build #82): corner to corner, a narrow dark slit sunk into the face, so it
  // reads as bread taken away (the shadow down into the gap), not a strip laid on top.
  const cut = mesh(CUT_GEO, "#4a2c16", { ink: false, shadow: false });
  cut.position.y = b.h + 0.001;
  cut.rotation.y = 0.62;
  body.add(crust, face, detail, lines, cut);
  let key = "";
  return (p) => {
    const t = cookLevel(p);
    const k = `${Math.round(t * 40)}|${p.cut ? 1 : 0}`;
    if (k === key) return;
    key = k;
    const c = grade(breadRamp(t, tmpA), tmpA);
    (face.material as THREE.MeshToonMaterial).color.copy(c);
    (crust.material as THREE.MeshToonMaterial).color.copy(grade(b.crust, tmpB)).lerp(c, 0.25).multiplyScalar(1 - 0.35 * clamp((t - 0.6) / 0.4));
    // Press lines show once the bread starts to colour, darkest when golden and past.
    lines.visible = t > 0.22;
    lineMat.color.copy(c).lerp(tmpB.set("#4a2410"), clamp(0.3 + t * 0.6));
    detail.visible = t < 0.85;
    cut.visible = !!p.cut;
  };
}

/** The chicken breast: a flattened teardrop that goes white, then dry, with press lines. */
const CHICKEN_SHAPE = blob(0.95, 0.6, 2.2, 0.62, 40, 0.02, 0.7);
const CHICKEN_GEO = shareGeometry(slab(CHICKEN_SHAPE, PANINI_HEIGHT.chicken!, 0.06));
const CHICKEN_LINES = (() => {
  const p = new Parts();
  for (let i = 0; i < 4; i++) p.add(faceted(new THREE.BoxGeometry(1.35, 0.006, 0.1)), "#ffffff", { p: [0.05, 0, -0.36 + i * 0.24], ink: false });
  return bakeShared(p);
})();
function makeChicken(body: THREE.Group): (p: Piece) => void {
  const m = mesh(CHICKEN_GEO, "#f5bfb2", { unique: true, ink: 1.03 });
  const lineMat = toon("#a9683a", { unique: true });
  const lines = new THREE.Mesh(CHICKEN_LINES.geo, lineMat);
  lines.position.y = PANINI_HEIGHT.chicken! + 0.006;
  lines.castShadow = false;
  body.add(m, lines);
  let key = -1;
  return (p) => {
    const t = cookLevel(p);
    const k = Math.round(t * 40);
    if (k === key) return;
    key = k;
    const c = grade(chickenRamp(t, tmpA), tmpA);
    (m.material as THREE.MeshToonMaterial).color.copy(c);
    // The outline follows the meat's colour (it used to keep the raw pink's crimson to the end).
    setLine(m, c);
    lines.visible = t > 0.3;
    lineMat.color.copy(c).lerp(tmpB.set("#4a2410"), clamp(0.2 + t * 0.9));
  };
}

/** The veggie patty: a thick round with peas and carrot flecks that crisps brown. */
const VEGGIE_GEO = shareGeometry(slab(blob(0.92, 0.92, 2, 1, 30, 0.03, 2.1), PANINI_HEIGHT.veggie!, 0.07));
const VEGGIE_FLECKS = (() => {
  const p = new Parts();
  const r = rng(77);
  const pea = faceted(new THREE.SphereGeometry(0.06, 6, 4));
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / 22) * 0.75;
    p.add(pea, i % 3 === 0 ? "#f08a3c" : i % 3 === 1 ? "#5f9a45" : "#e9d27a", { p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], s: [1 + r() * 0.5, 0.35, 1 + r() * 0.3], ink: false });
  }
  return bakeShared(p);
})();
function makeVeggie(body: THREE.Group): (p: Piece) => void {
  const m = mesh(VEGGIE_GEO, "#bccb8e", { unique: true, ink: 1.03 });
  const flecks = new THREE.Mesh(VEGGIE_FLECKS.geo, toon(0xffffff, { vertexColors: true }));
  flecks.position.y = PANINI_HEIGHT.veggie! + 0.004;
  flecks.castShadow = false;
  body.add(m, flecks);
  let key = -1;
  return (p) => {
    const t = cookLevel(p);
    const k = Math.round(t * 40);
    if (k === key) return;
    key = k;
    const c = grade(veggieRamp(t, tmpA), tmpA);
    (m.material as THREE.MeshToonMaterial).color.copy(c);
    // Its outline browns with it, rather than staying the raw patty's green.
    setLine(m, c);
    flecks.visible = t < 0.9;
  };
}

/** Mozzarella: a fat white round that slumps and spreads as it melts. */
const MOZZ_GEO = shareGeometry(faceted(new THREE.CylinderGeometry(0.42, 0.44, PANINI_HEIGHT.mozzarella!, 20).translate(0, PANINI_HEIGHT.mozzarella! / 2, 0)));
function makeMozzarella(body: THREE.Group): (p: Piece) => void {
  const m = mesh(MOZZ_GEO, "#fbfaf5", { unique: true, ink: 1.04 });
  body.add(m);
  let key = -1;
  return (p) => {
    const melt = clamp(p.melt ?? 0);
    const k = Math.round(melt * 20);
    if (k === key) return;
    key = k;
    m.scale.set(1 + 0.4 * melt, 1 - 0.5 * melt, 1 + 0.4 * melt);
    (m.material as THREE.MeshToonMaterial).color.set(isMelted(p) ? "#fbf1d8" : "#fbfaf5");
  };
}

/** A flat leaf outline along +y from (0, 0): half-width `w(t)` at each step t of its length. */
function leafOutline(len: number, w: (t: number) => number, steps = 14): THREE.Shape {
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    right.push(new THREE.Vector2(w(t), t * len));
  }
  const pts = [new THREE.Vector2(0, 0), ...right, ...right.slice(0, -1).reverse().map((v) => new THREE.Vector2(-v.x, v.y))];
  return new THREE.Shape(pts);
}
/** A leaf laid flat pointing along +x, cupped a little (its edges lift), `h` thick. */
function leafGeo(shape: THREE.Shape, h: number, cup: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + cup * pos.getZ(i) ** 2);
  return faceted(g);
}
const BASIL_LEAF = leafGeo(leafOutline(1, (t) => 0.42 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.25 * t)), 0.025, 0.9);
const RIB = faceted(new THREE.BoxGeometry(1, 0.012, 0.03));
/** A basil sprig lying flat: a stem along +x with two pairs of broad leaves and a small tip. */
export function basilSprig(ink = 0.03): Parts {
  const p = new Parts();
  const stem = faceted(new THREE.CylinderGeometry(0.022, 0.028, 0.9, 6).rotateZ(Math.PI / 2));
  p.add(stem, "#5d9a3c", { p: [0, 0.035, 0], ink: ink * 0.7 });
  const leaf = (x: number, side: number, len: number, col: string, lift: number) => {
    // Out from the stem, angled toward the tip.
    const yaw = side * (Math.PI / 2 - 0.62);
    p.add(BASIL_LEAF, col, { p: [x, 0.04 + lift, 0], r: [0, yaw, 0], s: [len, 1, len], ink });
    p.add(RIB, "#6cb853", { p: [x + Math.cos(yaw) * len * 0.42, 0.07 + lift, -Math.sin(yaw) * len * 0.42], r: [0, yaw, 0], s: [len * 0.7, 1, 1], ink: false });
  };
  leaf(-0.22, 1, 0.46, "#3f9a35", 0);
  leaf(-0.22, -1, 0.44, "#47a23c", 0.004);
  leaf(0.12, 1, 0.36, "#4aa83f", 0.012);
  leaf(0.12, -1, 0.38, "#3f9a35", 0.016);
  // The tip: two little leaves either side of a bud.
  leaf(0.4, 1, 0.22, "#5bb84a", 0.022);
  leaf(0.4, -1, 0.2, "#5bb84a", 0.024);
  p.add(BASIL_LEAF, "#62bd50", { p: [0.42, 0.07, 0], s: [0.2, 1, 0.2], ink });
  return p;
}
/**
 * Rocket leaves (after build #82: "not quite recognisable"): the dandelion-like rocket shape, a
 * bare pale stalk, then a narrow midrib with separate side lobes down each edge (not mirrored:
 * the two sides alternate and differ in size), cut by deep notches nearly to the rib, the lobes
 * swept toward the tip, and a big rounded end lobe. Each one curls: the edges cup, the tip lifts
 * and the blade twists a little. A few cuts, built once; 1 long, pointing along +x.
 */
export const ROCKET_VARIANTS = 4;
function rocketBlade(variant: number): { blade: THREE.BufferGeometry; rib: THREE.BufferGeometry } {
  const r = rng(301 + variant * 29);
  const STALK = 0.2;
  const END = 0.7 + r() * 0.06;
  const rib = (t: number) => (t < STALK ? 0.016 : 0.024 + 0.02 * ((t - STALK) / (1 - STALK)));
  // Lobes for one side: n bumps between `from` and END, each a lopsided arch (its peak toward the
  // tip), sizes growing toward the tip, with a notch back to the rib between each.
  const side = (from: number, n: number) => {
    const edges: number[] = [from];
    for (let j = 1; j <= n; j++) edges.push(from + ((END - from) * (j + (j < n ? (r() - 0.5) * 0.35 : 0))) / n);
    const lobes = edges.slice(0, -1).map((e, j) => ({ s: e + 0.012, e: edges[j + 1] - 0.012, h: (0.075 + 0.075 * ((j + 1) / n)) * (0.8 + r() * 0.4) }));
    const endH = 0.15 + r() * 0.04;
    const endPh = r() * 6;
    return (t: number): number => {
      let w = rib(t);
      for (const l of lobes) if (t > l.s && t < l.e) w += l.h * Math.sin(Math.PI * Math.pow((t - l.s) / (l.e - l.s), 1.6));
      if (t >= END) {
        const u = (t - END) / (1 - END);
        w = Math.max(w * (1 - u), endH * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 + 0.08 * Math.sin(u * 14 + endPh)));
      }
      return w;
    };
  };
  const nTop = 3 + (variant % 2);
  const nBot = 3 + ((variant >> 1) % 2);
  const top = side(STALK + 0.02, nTop);
  const bot = side(STALK + 0.06 + r() * 0.04, nBot);
  const steps = 40;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(t, -(i === steps ? 0 : bot(t))));
  }
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps;
    pts.push(new THREE.Vector2(t, top(t)));
  }
  const cup = 1.6 + r() * 1.2;
  const lift = 0.1 + r() * 0.12;
  const twist = (r() - 0.5) * 0.5;
  const curl = (g: THREE.BufferGeometry) => {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, pos.getY(i) + cup * z * z + lift * x * x + twist * x * z);
    }
    return faceted(g);
  };
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.02, bevelEnabled: false, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  const ribGeo = new THREE.BoxGeometry(END + 0.1, 0.008, 0.014, 12, 1, 1).translate((END + 0.1) / 2, 0.024, 0);
  return { blade: shareGeometry(curl(g)), rib: shareGeometry(curl(ribGeo)) };
}
const ROCKET = Array.from({ length: ROCKET_VARIANTS }, (_, v) => rocketBlade(v));
/** A rocket leaf lying along +x, `len` long: one of ROCKET_VARIANTS cuts, with its pale stalk and rib. */
export function rocketLeaf(len: number, col: string, ink = 0.024, variant = 0): Parts {
  const v = ROCKET[((variant % ROCKET_VARIANTS) + ROCKET_VARIANTS) % ROCKET_VARIANTS];
  const p = new Parts();
  p.add(v.blade, col, { s: [len, 1, len], ink });
  p.add(v.rib, "#9cc27a", { s: [len, 1, len], ink: false });
  return p;
}
/** Rocket's dark, slightly blue-green leaf colours (basil is brighter and yellower). */
export const ROCKET_GREENS = ["#33682a", "#3d7330", "#2b5d23", "#467c34"];

/**
 * Parts for the cold panini fillings, in ingredient units (the bins' heaps use these too):
 * basil leaves, a fanned avocado slice, a tangle of rocket, a pickled red onion ring and a scoop of tuna.
 */
export function paniniParts(kind: Kind, ink = 0.03): Parts {
  const p = new Parts();
  switch (kind) {
    case "basil":
      // A sprig on its stem (after build #76): pairs of broad, glossy, cupped leaves, the way basil
      // comes off the plant, so it never reads as lettuce or rocket.
      p.addParts(basilSprig(ink));
      break;
    case "avocado": {
      // A crescent slice: pale green flesh, a dark skin edge.
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.5, Math.PI * 0.12, Math.PI * 0.88, false);
      s.absarc(0, 0.12, 0.36, Math.PI * 0.86, Math.PI * 0.14, true);
      const flesh = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 10 });
      flesh.rotateX(-Math.PI / 2);
      flesh.translate(0, 0, 0.18);
      p.add(faceted(flesh), "#cfe08a", { ink });
      const rim = new THREE.Shape();
      rim.absarc(0, 0, 0.5, Math.PI * 0.12, Math.PI * 0.88, false);
      rim.absarc(0, 0, 0.44, Math.PI * 0.88, Math.PI * 0.12, true);
      const skin = new THREE.ExtrudeGeometry(rim, { depth: 0.09, bevelEnabled: false, curveSegments: 10 });
      skin.rotateX(-Math.PI / 2);
      skin.translate(0, 0.002, 0.18);
      p.add(faceted(skin), "#3f6a24", { ink: false });
      break;
    }
    case "rocket": {
      // A loose handful of rocket: six lobed leaves dropped every which way, overlapping, some
      // rolled onto an edge, none lined up.
      const r = rng(37);
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        const rr = 0.04 + r() * 0.22;
        const len = 0.62 + r() * 0.26;
        const yaw = r() * Math.PI * 2;
        // Centre each leaf on its spot (it's built from its stalk end).
        const x = Math.cos(a) * rr - Math.cos(yaw) * len * 0.5;
        const z = Math.sin(a) * rr + Math.sin(yaw) * len * 0.5;
        p.addParts(rocketLeaf(len, ROCKET_GREENS[i % 4], ink * 0.8, i), { p: [x, 0.02 + i * 0.016 + r() * 0.012, z], r: [(r() - 0.5) * 0.6, yaw, (r() - 0.5) * 0.2] });
      }
      break;
    }
    case "redonion":
      // A pickled red onion ring: pink and glossy.
      p.add(faceted(new THREE.TorusGeometry(0.34, 0.07, 6, 24)), "#f2c2dc", { p: [0, 0.07, 0], r: [Math.PI / 2, 0, 0], ink });
      p.add(faceted(new THREE.TorusGeometry(0.4, 0.03, 4, 24)), "#c0408a", { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0], ink: false });
      break;
    case "tuna": {
      // A scoop of tuna mayo: a lumpy mound with a few herb flecks.
      const g = new THREE.IcosahedronGeometry(0.42, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const k = 1 + 0.12 * Math.sin(9 * x + 4 * z) + 0.08 * Math.sin(7 * z - 3 * y);
        pos.setXYZ(i, x * k, Math.max(0, y) * 0.45 * k, z * k);
      }
      p.add(faceted(g), "#e8d5b5", { ink });
      const r = rng(5);
      for (let i = 0; i < 7; i++) p.add(faceted(new THREE.SphereGeometry(0.035, 5, 3)), i % 2 ? "#5f9a45" : "#c79a7a", { p: [(r() - 0.5) * 0.5, 0.15 + r() * 0.03, (r() - 0.5) * 0.5], s: [1, 0.5, 1], ink: false });
      break;
    }
  }
  return p;
}
const PARTS_BAKED = new Map<Kind, Baked>();
function bakedPart(kind: Kind): THREE.Mesh {
  let b = PARTS_BAKED.get(kind);
  if (!b) PARTS_BAKED.set(kind, (b = bakeShared(paniniParts(kind))));
  return bakedMesh(b);
}

/**
 * Build a panini piece into `body`. Returns its update function, or null when the kind isn't a
 * panini part (or has no moving parts: those are added and get a no-op).
 */
export function makePaniniPiece(piece: Piece, body: THREE.Group): ((p: Piece) => void) | null {
  switch (piece.kind) {
    case "ciabatta":
    case "sourdough":
      return makeBread(piece.kind, body);
    case "chicken":
      return makeChicken(body);
    case "veggie":
      return makeVeggie(body);
    case "mozzarella":
      return makeMozzarella(body);
    case "basil":
    case "avocado":
    case "rocket":
    case "redonion":
    case "tuna":
      body.add(bakedPart(piece.kind));
      return () => {};
  }
  return null;
}

/**
 * A whole loaf for the bread pan, in the same units as a slice: a flat ciabatta, floured on top,
 * or a round, dark sourdough boule with a pale cross scored in it.
 */
export function loafParts(kind: "ciabatta" | "sourdough"): Parts {
  const p = new Parts();
  const r = rng(kind === "ciabatta" ? 5 : 9);
  const dust = faceted(new THREE.CircleGeometry(0.1, 7).rotateX(-Math.PI / 2));
  if (kind === "ciabatta") {
    const h = 0.4;
    p.add(slab(roundRect(1.2, 0.6, 0.3), h, 0.1), BREAD.ciabatta.crust, { ink: 0.03 });
    // A thick dusting of flour over the top: the ciabatta's tell.
    for (let i = 0; i < 22; i++) p.add(dust, i % 4 ? "#fbf7ee" : "#efe4cf", { p: [(r() - 0.5) * 2.0, h + 0.004, (r() - 0.5) * 0.95], r: [0, r() * 3, 0], s: [1.2 + r() * 1.6, 1, 0.9 + r() * 1.1], ink: false });
    return p;
  }
  const dome = faceted(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  p.add(dome, BREAD.sourdough.crust, { s: [0.95, 0.66, 0.95], ink: 0.03 });
  // The score: a pale cross where the crust opened in the oven, and a little flour.
  for (const a of [0.5, 0.5 + Math.PI / 2]) p.add(faceted(new THREE.BoxGeometry(0.7, 0.06, 0.12)), "#e6c48c", { p: [0, 0.625, 0], r: [0, a, 0], ink: false });
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.3 + r() * 0.35;
    p.add(dust, "#efe2c8", { p: [Math.cos(a) * d, 0.66 * Math.sqrt(Math.max(0, 1 - (d / 0.95) ** 2)) + 0.01, Math.sin(a) * d], s: [0.7, 1, 0.5], ink: false });
  }
  return p;
}

/** One raw piece as parts (for the pans' heaps): a bread slice, a chicken breast, a veggie patty, a mozzarella round. */
export function rawParts(kind: Kind): Parts {
  const p = new Parts();
  switch (kind) {
    case "ciabatta":
    case "sourdough": {
      const { body, face } = breadShapes(kind);
      p.add(body, BREAD[kind].crust, { ink: 0.03 });
      p.add(face, "#f4e3bd", { ink: false });
      break;
    }
    case "chicken":
      p.add(CHICKEN_GEO, "#f5bfb2", { ink: 0.03 });
      break;
    case "veggie":
      p.add(VEGGIE_GEO, "#bccb8e", { ink: 0.03 });
      p.addParts(new Parts().add(faceted(new THREE.SphereGeometry(0.07, 6, 4)), "#5f9a45", { p: [0.3, PANINI_HEIGHT.veggie!, 0.2], s: [1, 0.4, 1], ink: false }).add(faceted(new THREE.SphereGeometry(0.07, 6, 4)), "#f08a3c", { p: [-0.3, PANINI_HEIGHT.veggie!, -0.1], s: [1, 0.4, 1], ink: false }));
      break;
    case "mozzarella":
      p.add(faceted(new THREE.SphereGeometry(0.42, 12, 8)), "#fbfaf5", { s: [1, 0.8, 1], p: [0, 0.3, 0], ink: 0.03 });
      break;
  }
  return p;
}
