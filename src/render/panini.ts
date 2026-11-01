import * as THREE from "three";
import { cookLevel, isMelted } from "../game/cooking";
import type { Kind, Piece } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, grade, mesh, ramp, shareGeometry, toon } from "./materials";

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
const chickenRamp = ramp([
  [0, "#f2aaa4"],
  [0.25, "#f3c9bc"],
  [0.42, "#f5ead8"],
  [0.7, "#ecd3a6"],
  [0.85, "#c99257"],
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

/** Bread outlines: ciabatta a floury rounded oblong, sourdough a squarish slice. */
const BREAD = {
  ciabatta: { shape: roundRect(1.12, 0.74, 0.4), crust: "#cf9a5a", h: PANINI_HEIGHT.ciabatta! },
  sourdough: { shape: blob(1.02, 0.82, 3.2, 1, 44, 0.015, 1.3), crust: "#a8743c", h: PANINI_HEIGHT.sourdough! },
};
const breadGeo = new Map<string, { body: THREE.BufferGeometry; face: THREE.BufferGeometry }>();
function breadShapes(kind: "ciabatta" | "sourdough") {
  let g = breadGeo.get(kind);
  if (!g) {
    const b = BREAD[kind];
    const face = b.shape.clone();
    g = { body: shareGeometry(slab(b.shape, b.h)), face: shareGeometry(flat(new THREE.Shape(face.getPoints(10).map((p) => p.clone().multiplyScalar(0.9))), b.h + 0.004)) };
    breadGeo.set(kind, g);
  }
  return g;
}
/** Ciabatta's floury top and big holes; sourdough's ear of crust. */
const BREAD_DETAIL: Record<"ciabatta" | "sourdough", Baked> = {
  ciabatta: (() => {
    const p = new Parts();
    const r = rng(41);
    const dot = faceted(new THREE.CircleGeometry(0.07, 7).rotateX(-Math.PI / 2));
    for (let i = 0; i < 18; i++) p.add(dot, "#fbf6ea", { p: [(r() - 0.5) * 1.7, 0.006, (r() - 0.5) * 1.05], s: [1 + r(), 1, 0.7 + r() * 0.6], ink: false });
    for (let i = 0; i < 6; i++) p.add(dot, "#c99a5c", { p: [(r() - 0.5) * 1.5, 0.008, (r() - 0.5) * 0.9], s: [0.8 + r() * 0.6, 1, 0.6], ink: false });
    return bakeShared(p);
  })(),
  sourdough: (() => {
    const p = new Parts();
    const r = rng(17);
    const dot = faceted(new THREE.CircleGeometry(0.05, 6).rotateX(-Math.PI / 2));
    for (let i = 0; i < 14; i++) p.add(dot, "#bf9156", { p: [(r() - 0.5) * 1.4, 0.006, (r() - 0.5) * 1.1], s: [0.8 + r() * 0.8, 1, 0.6 + r() * 0.5], ink: false });
    return bakeShared(p);
  })(),
};
/** Press lines: dark ribs across the face once it's golden. */
const PRESS_LINES = (() => {
  const p = new Parts();
  for (let i = 0; i < 5; i++) p.add(faceted(new THREE.BoxGeometry(1.75, 0.006, 0.075)), "#ffffff", { p: [0, 0, -0.52 + i * 0.26], ink: false });
  return bakeShared(p);
})();
const CUT_GEO = shareGeometry(faceted(new THREE.BoxGeometry(0.16, 0.014, 1.9)));

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
  // The cut: a dark slit corner to corner, and the halves eased apart.
  const cut = mesh(CUT_GEO, "#3a2414", { ink: false, shadow: false });
  cut.position.y = b.h + 0.012;
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
  for (let i = 0; i < 4; i++) p.add(faceted(new THREE.BoxGeometry(1.35, 0.006, 0.07)), "#ffffff", { p: [0.05, 0, -0.36 + i * 0.24], ink: false });
  return bakeShared(p);
})();
function makeChicken(body: THREE.Group): (p: Piece) => void {
  const m = mesh(CHICKEN_GEO, "#f2aaa4", { unique: true, ink: 1.03 });
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
    lines.visible = t > 0.3;
    lineMat.color.copy(c).lerp(tmpB.set("#5a3014"), clamp(0.25 + t * 0.5));
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
    (m.material as THREE.MeshToonMaterial).color.copy(grade(veggieRamp(t, tmpA), tmpA));
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

/**
 * Parts for the cold panini fillings, in ingredient units (the bins' heaps use these too):
 * basil leaves, a fanned avocado slice, a tangle of rocket, a pickled red onion ring and a scoop of tuna.
 */
export function paniniParts(kind: Kind, ink = 0.03): Parts {
  const p = new Parts();
  switch (kind) {
    case "basil": {
      // A spray of five glossy leaves.
      const leaf = faceted(new THREE.SphereGeometry(1, 10, 6));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.3;
        p.add(leaf, i % 2 ? "#3f8a31" : "#4f9a3a", { p: [Math.cos(a) * 0.28, 0.03 + i * 0.006, Math.sin(a) * 0.28], r: [0, -a, 0], s: [0.36, 0.035, 0.17], ink });
      }
      p.add(faceted(new THREE.SphereGeometry(1, 8, 5)), "#6fb44f", { p: [0, 0.05, 0], s: [0.2, 0.03, 0.12], ink: false });
      break;
    }
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
      // Long, jagged dark leaves in a loose tangle.
      const r = rng(31);
      const leaf = (len: number) => {
        const g = new THREE.BoxGeometry(len, 0.02, 0.13, 8, 1, 1);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          pos.setZ(i, z * (1 + 0.6 * Math.abs(Math.sin(x * 18))) * (1 - Math.abs(x / len)));
          pos.setY(i, pos.getY(i) + 0.08 * Math.sin(x * 4));
        }
        return faceted(g);
      };
      for (let i = 0; i < 11; i++) {
        const a = i * 2.39996;
        const rr = Math.sqrt((i + 0.5) / 11) * 0.62;
        p.add(leaf(0.7 + r() * 0.3), ["#3f7f2e", "#5a9a3a", "#2f6a25", "#4c8c34"][i % 4], { p: [Math.cos(a) * rr, 0.05 + r() * 0.04, Math.sin(a) * rr], r: [0, r() * Math.PI * 2, (r() - 0.5) * 0.3], ink: ink * 0.8 });
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
      p.add(CHICKEN_GEO, "#f2aaa4", { ink: 0.03 });
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
