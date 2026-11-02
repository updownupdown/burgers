import * as THREE from "three";
import { cookLevel, isMelted } from "../game/cooking";
import type { Kind, Piece } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, grade, mesh, ramp, shareGeometry, toon } from "./materials";

/*
 * Red Rock's comal parts (DESIGN §24, phase 3), in ingredient units like the burger parts (a bun
 * is 2 across): corn and flour tortillas that go pale and stiff, soft with brown spots, then hard;
 * a flour tortilla folded over its filling into a quesadilla; a fried tostada shell; and the taco
 * fillings (pork, beans, cilantro, lime, shredded cheese) as small countable parts. makeFood()
 * hands these kinds over here; the taco rack on the tray is in dishes.ts.
 */

/** Natural thickness of each comal piece, in ingredient units. */
export const TACO_HEIGHT: Partial<Record<Kind, number>> = {
  corn: 0.06,
  flour: 0.06,
  pork: 0.18,
  beans: 0.12,
  cilantro: 0.05,
  lime: 0.14,
  jack: 0.06,
  tostada: 0.09,
  redsalsa: 0.04,
  greensalsa: 0.04,
  crema: 0.04,
};
/** Height of a folded tortilla (both halves and the filling between), ingredient units. */
export const FOLDED_HEIGHT: Record<"corn" | "flour", number> = { corn: 0.06 * 2 + 0.11, flour: 0.06 * 2 + 0.11 };
/** Tortilla radius: a street-taco corn tortilla, a bigger flour one. */
export const TORTILLA_R: Record<"corn" | "flour", number> = { corn: 1.0, flour: 1.3 };
/** How long the fold takes to swing over, seconds of game time. */
const FOLD_S = 0.32;
/** Game time, for the fold animation: the counter advances it (tickTacos), so a paused or stepped game holds it. */
let clock = 0;
export function tickTacos(dt: number): void {
  clock += dt;
}
/** How far a folded quesadilla's top half sits above its bottom: the room the filling has. */
const FOLD_GAP = 0.11;

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Corn: pale yellow, soft and warm, toasty, hard, burnt. Flour: cream, warm, golden, hard, burnt. */
const cornRamp = ramp([
  [0, "#f2dc8c"],
  [0.35, "#efcb63"],
  [0.6, "#e2ad48"],
  [0.85, "#bd7f34"],
  [1.05, "#4a2c14"],
]);
const flourRamp = ramp([
  [0, "#f7efdc"],
  [0.35, "#f3e2b8"],
  [0.6, "#ebc98a"],
  [0.85, "#cf9a54"],
  [1.05, "#4a2c14"],
]);
const shellRamp = ramp([
  [0, "#f1dd96"],
  [0.5, "#ebbb4f"],
  [0.7, "#e2a43c"],
  [0.95, "#a8662a"],
  [1.25, "#3e2412"],
]);
/** Brown spots the comal leaves on a tortilla: few and light at first, darker as it goes hard. */
const spotRamp = ramp([
  [0.2, "#d9a35a"],
  [0.5, "#b0702e"],
  [0.85, "#6a3a16"],
  [1.05, "#2a170a"],
]);

/** A wobbly disc outline (handmade tortillas wobble more). */
function discShape(r: number, wobble: number, seed: number): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 7 + seed * 2.3) * 0.4);
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k));
  }
  return new THREE.Shape(pts);
}
/** A shape in the (x, z) plane extruded up by h with a small bevel; bottom at y = 0. */
function slab(shape: THREE.Shape, h: number, bevel = 0.02): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.005, h - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return faceted(g);
}
/** A half disc (straight edge along x, round edge toward +z), extruded up by h. */
function halfDisc(r: number, h: number): THREE.BufferGeometry {
  // Shape y becomes world -z once laid flat, so the arc runs through negative y.
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.absarc(0, 0, r, 0, Math.PI, true);
  s.lineTo(r, 0);
  return slab(s, h, 0.018);
}

const DISC_GEO = new Map<string, THREE.BufferGeometry>();
function discGeo(kind: "corn" | "flour", handmade: boolean): THREE.BufferGeometry {
  const key = `${kind}${handmade ? "h" : ""}`;
  let g = DISC_GEO.get(key);
  if (!g) {
    g = shareGeometry(slab(discShape(TORTILLA_R[kind], handmade ? 0.045 : 0.012, kind === "corn" ? 1.7 : 0.4), TACO_HEIGHT[kind]!));
    DISC_GEO.set(key, g);
  }
  return g;
}
const HALF_GEO = new Map<string, THREE.BufferGeometry>();
function halfGeo(kind: "corn" | "flour", top: boolean): THREE.BufferGeometry {
  const key = `${kind}${top ? "t" : "b"}`;
  let g = HALF_GEO.get(key);
  if (!g) {
    g = shareGeometry(halfDisc(TORTILLA_R[kind] * (top ? 0.985 : 1), TACO_HEIGHT[kind]!));
    HALF_GEO.set(key, g);
  }
  return g;
}

/** The comal's brown spots, baked: a first few (from about soft) and more (as it goes on). */
function spotParts(r: number, count: number, seed: number, half = false): Parts {
  const p = new Parts();
  const rr = rng(seed);
  const dot = faceted(new THREE.CircleGeometry(0.06, 7).rotateX(-Math.PI / 2));
  for (let i = 0; i < count; i++) {
    const a = rr() * Math.PI * (half ? 1 : 2);
    const d = Math.sqrt(rr()) * r * 0.82;
    p.add(dot, "#ffffff", { p: [Math.cos(a) * d, 0, Math.sin(a) * d], s: [0.7 + rr() * 1.1, 1, 0.5 + rr() * 0.8], r: [0, rr() * 3, 0], ink: false });
  }
  return p;
}
const SPOTS = new Map<string, Baked>();
function spots(kind: "corn" | "flour", which: 0 | 1, half: boolean): Baked {
  const key = `${kind}${which}${half ? "h" : ""}`;
  let b = SPOTS.get(key);
  if (!b) {
    b = bakeShared(spotParts(TORTILLA_R[kind], which ? 12 : 7, which ? 23 : 11, half));
    SPOTS.set(key, b);
  }
  return b;
}

/* ---- fillings ------------------------------------------------------------------- */

const PORK = ["#a9532b", "#9a4826", "#b9622f"];
const chunkGeo = shareGeometry(faceted(new THREE.BoxGeometry(0.16, 0.11, 0.13)));
const crumbGeo = shareGeometry(faceted(new THREE.IcosahedronGeometry(0.07, 0)));
/**
 * A cilantro leaflet: small, flat and frilly, three rounded lobes with a scalloped edge (after
 * build #76: the old five-sided dots read as peas).
 */
const leafGeo = shareGeometry(
  faceted(
    new THREE.ShapeGeometry(
      new THREE.Shape(
        Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          const r = 0.085 * (0.62 + 0.38 * Math.abs(Math.cos(1.5 * a))) + 0.008 * Math.sin(12 * a);
          return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        }),
      ),
    ).rotateX(-Math.PI / 2),
  ),
);
const stemGeo = shareGeometry(faceted(new THREE.BoxGeometry(0.32, 0.014, 0.018)));
const shredGeo = shareGeometry(faceted(new THREE.BoxGeometry(0.34, 0.035, 0.05)));
/** A strand of shredded cheese: long, thin and a little bent, so it never reads as a chunk of pork. */
const strandGeo = shareGeometry(
  faceted(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0, 0.02, 0.07), new THREE.Vector3(0.22, 0, 0)), 5, 0.03, 4, false)),
);
const CHEESE = ["#f9de6e", "#f4cb4c", "#fbe896", "#efbb3e"];
const beanGeo = shareGeometry(faceted(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)));
const ringGeo = shareGeometry(faceted(new THREE.TorusGeometry(0.11, 0.035, 4, 10).rotateX(Math.PI / 2)));

/** A third of a pineapple ring (the ring on the grill, scaled to a taco), its middle at the origin. */
const PINE_ARC = shareGeometry(
  faceted(
    new THREE.LatheGeometry(
      ([[0.3, 0], [0.88, 0], [0.92, 0.06], [0.88, 0.12], [0.3, 0.12], [0.28, 0.06], [0.3, 0]] as const).map(([x, y]) => new THREE.Vector2(x * 0.24, y * 0.28)),
      6,
      0,
      (Math.PI * 2) / 3,
    ).translate(-Math.sin(Math.PI / 3) * 0.14, 0, -Math.cos(Math.PI / 3) * 0.14),
  ),
);
const charGeo = shareGeometry(faceted(new THREE.BoxGeometry(0.03, 0.006, 0.09)));
/**
 * A filling spread over an ellipse (half-sizes rx, rz) with its bottom at y = 0, in ingredient
 * units: chunks of pork, a mound of refried beans, cilantro leaves, onion bits, shredded cheese,
 * jalapeño rings, shredded lettuce or charred pineapple. `n` scales how much there is.
 */
export function fillParts(kind: Kind | "cilantroSprigs", rx: number, rz: number, seed = 1, n = 1, ink = 0.022): Parts {
  const p = new Parts();
  const r = rng(seed * 31 + kind.length);
  const spread = (count: number, put: (x: number, z: number, i: number, h: number) => void) => {
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + seed;
      const d = Math.sqrt((i + 0.5) / count);
      put(Math.cos(a) * d * rx, Math.sin(a) * d * rz, i, 1 - d);
    }
  };
  switch (kind) {
    case "pork":
      spread(Math.round(9 * n), (x, z, i, h) => p.add(chunkGeo, PORK[i % 3], { p: [x, 0.05 + h * 0.08 + r() * 0.03, z], r: [r() * 0.6, r() * 3, r() * 0.6], s: 0.9 + r() * 0.4, ink }));
      // A few charred edges.
      spread(Math.round(4 * n), (x, z) => p.add(crumbGeo, "#7a3418", { p: [x * 0.8, 0.12, z * 0.8], s: [1, 0.6, 1], ink: false }));
      break;
    case "beans":
      p.add(beanGeo, "#7a4a32", { p: [0, 0, 0], s: [rx, 0.12 * n + 0.02, rz], ink });
      spread(5, (x, z) => p.add(crumbGeo, "#9a6446", { p: [x * 0.6, 0.1 * n, z * 0.6], s: [0.8, 0.3, 0.8], ink: false }));
      break;
    case "cilantro":
      spread(Math.round(12 * n), (x, z, i) => p.add(leafGeo, i % 3 ? "#3f9a3a" : "#5fb24a", { p: [x, 0.02 + r() * 0.03, z], r: [r() * 0.5, r() * 6, r() * 0.5], s: 0.8 + r() * 0.5, ink: ink * 0.6 }));
      break;
    case "cilantroSprigs":
      // A few whole sprigs on top of the chopped heap in the pan: thin stems ending in leaflets.
      spread(Math.round(5 * n), (x, z, i) => {
        const yaw = r() * 6.3;
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        p.add(stemGeo, "#7cb85a", { p: [x, 0.05, z], r: [0, yaw, 0], ink: false });
        for (const [d, k] of [[0.17, 1.15], [0.08, 0.85], [0.12, 0.8]] as const) {
          const side = d === 0.17 ? 0 : d === 0.08 ? 0.09 : -0.09;
          p.add(leafGeo, i % 2 ? "#4fae45" : "#62bd52", { p: [x + c * d - sn * side, 0.06, z - sn * d - c * side], r: [0, r() * 6, 0], s: k, ink: ink * 0.6 });
        }
      });
      break;
    case "onion":
      spread(Math.round(12 * n), (x, z, i) => p.add(crumbGeo, i % 4 ? "#f6eff4" : "#e3cde6", { p: [x, 0.03 + r() * 0.02, z], s: [0.75, 0.55, 0.75], r: [r(), r(), r()], ink: ink * 0.6 }));
      break;
    case "jack":
      // Shredded cheese: long, thin, pale strands lying every which way, like a pinch of grated
      // jack or mozzarella (pork is chunky and brown).
      spread(Math.round(22 * n), (x, z, i) => p.add(strandGeo, CHEESE[i % 4], { p: [x, 0.03 + r() * 0.05, z], r: [(r() - 0.5) * 0.5, r() * 6.3, (r() - 0.5) * 0.5], s: [0.8 + r() * 0.45, 1, 1], ink: ink * 0.45 }));
      break;
    case "lettuce":
      spread(Math.round(12 * n), (x, z, i) => p.add(shredGeo, i % 2 ? "#7ccc55" : "#62b443", { p: [x, 0.02 + r() * 0.05, z], r: [r() * 0.5, r() * 6, r() * 0.5], s: [0.7, 1.4, 1.6], ink: ink * 0.6 }));
      break;
    case "jalapeno":
      spread(Math.round(4 * n), (x, z) => p.add(ringGeo, "#3f8f3a", { p: [x, 0.04, z], r: [r() * 0.4, 0, r() * 0.4], ink }));
      break;
    case "pineapple":
      // Pieces of the charred ring off the comal (after build #76: the same ring, cut in thirds,
      // grill stripes on top, never cubes).
      spread(Math.max(1, Math.round(3 * n)), (x, z, i) => {
        const yaw = r() * 6.3 + i;
        p.add(PINE_ARC, i % 2 ? "#f5c83a" : "#efbd2f", { p: [x, 0.03, z], r: [0, yaw, 0], ink });
        // Two char stripes across the arc, either side of its middle.
        for (const d of [-0.055, 0.055]) {
          const [vx, vz] = [0.5 * d, -0.866 * d];
          p.add(charGeo, "#9a5a1e", { p: [x + vx * Math.cos(yaw) + vz * Math.sin(yaw), 0.064, z - vx * Math.sin(yaw) + vz * Math.cos(yaw)], r: [0, yaw + Math.PI / 3, 0], ink: false });
        }
      });
      break;
  }
  return p;
}
const FILL_BAKED = new Map<string, Baked>();
/** A filling as one baked mesh, cached by its shape. */
export function fillMesh(kind: Kind, rx: number, rz: number, seed = 1, n = 1): THREE.Mesh {
  const key = `${kind}|${rx.toFixed(2)}|${rz.toFixed(2)}|${seed}|${n}`;
  let b = FILL_BAKED.get(key);
  if (!b) {
    b = bakeShared(fillParts(kind, rx, rz, seed, n));
    FILL_BAKED.set(key, b);
  }
  return bakedMesh(b);
}

/** A lime wedge lying on its side: pale green flesh up, a dark green rind round its curve. */
export function limeParts(ink = 0.024): Parts {
  const p = new Parts();
  p.add(halfDisc(0.27, 0.16), "#cfe58a", { p: [0, 0, 0.0], ink });
  const rind = new THREE.Shape();
  rind.moveTo(0.31, 0);
  rind.absarc(0, 0, 0.31, 0, Math.PI, true);
  rind.lineTo(-0.25, 0);
  rind.absarc(0, 0, 0.25, Math.PI, 0, false);
  rind.lineTo(0.31, 0);
  p.add(slab(rind, 0.15, 0.015), "#4f9a2a", { p: [0, 0.005, 0], ink });
  // Segment lines on the flesh.
  for (const a of [0.5, 1.05, 1.6, 2.15, 2.65]) p.add(faceted(new THREE.BoxGeometry(0.2, 0.004, 0.012)), "#a9c95e", { p: [Math.cos(a) * 0.12, 0.162, Math.sin(a) * 0.12], r: [0, -a, 0], ink: false });
  return p;
}
const LIME = (() => bakeShared(limeParts()))();

/* ---- pieces ----------------------------------------------------------------------- */

/** The kinds this module draws. */
const OURS: ReadonlySet<Kind> = new Set<Kind>(["corn", "flour", "pork", "beans", "cilantro", "lime", "jack", "tostada"]);

/** Stable key for what's on a tortilla, so its filling is only rebuilt when it changes. */
const fillKey = (fill: Piece[] | undefined) => (fill ?? []).map((f) => `${f.kind}${f.kind === "jack" ? (isMelted(f) ? "m" : "") : ""}`).join(",");

/** The filling showing on an open tortilla on the comal: each piece in its own spot near the middle. */
function openFill(kind: "corn" | "flour", fill: Piece[]): THREE.Group {
  const g = new THREE.Group();
  const R = TORTILLA_R[kind];
  let y = TACO_HEIGHT[kind]! + 0.005;
  fill.forEach((f, i) => {
    if (f.kind === "jack" && isMelted(f)) {
      // Melted: a glossy puddle with a few shreds left at its edge.
      const puddle = mesh(shareGeometry(slab(discShape(R * 0.55, 0.08, 2 + i), 0.035, 0.01)), "#f4c54a", { ink: 1.02, shadow: false });
      puddle.position.y = y;
      g.add(puddle);
      y += 0.03;
      return;
    }
    const m = fillMesh(f.kind, R * (f.kind === "pork" || f.kind === "beans" ? 0.38 : 0.5), R * (f.kind === "pork" || f.kind === "beans" ? 0.32 : 0.45), 3 + i, 1);
    m.position.y = y;
    g.add(m);
    y += f.kind === "pork" || f.kind === "beans" ? 0.08 : 0.025;
  });
  return g;
}

/**
 * A quesadilla on the comal or the tray: a half moon, the crease along the back (x), the open
 * round edge toward +z with the filling showing between the halves and, once the cheese has
 * melted, cheese oozing out.
 */
function foldedBody(kind: "corn" | "flour", fill: Piece[], melted: boolean): { group: THREE.Group; faces: THREE.Mesh[]; spots: THREE.Mesh[]; hinge: THREE.Group; seam: THREE.Object3D[] } {
  const g = new THREE.Group();
  const R = TORTILLA_R[kind];
  const h = TACO_HEIGHT[kind]!;
  const bottom = mesh(halfGeo(kind, false), "#f3e2b8", { unique: true, ink: 1.03 });
  const top = mesh(halfGeo(kind, true), "#f3e2b8", { unique: true, ink: 1.03 });
  // The top half swings over on a hinge along the crease (the fold animation opens it out flat).
  const hinge = new THREE.Group();
  const hingeY = h + FOLD_GAP / 2;
  hinge.position.y = hingeY;
  top.position.y = h + FOLD_GAP - hingeY;
  hinge.add(top);
  // The crease: a rounded fold along the back edge joining the two halves.
  const crease = mesh(new THREE.CylinderGeometry((FOLD_GAP + 2 * h) / 2, (FOLD_GAP + 2 * h) / 2, R * 1.96, 10, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), "#f3e2b8", { unique: true, ink: 1.03 });
  crease.position.set(0, (FOLD_GAP + 2 * h) / 2, 0.01);
  g.add(bottom, hinge, crease);
  // The filling at the open edge: a band between the halves in the main filling's colour.
  const main = fill.find((f) => f.kind !== "jack")?.kind ?? "jack";
  const bandCol = melted ? "#f4c54a" : main === "pork" ? "#c0622e" : main === "beans" ? "#7a4a32" : main === "jalapeno" ? "#3f8f3a" : "#f6d77a";
  const band = new THREE.Mesh(shareGeometry(faceted(new THREE.CylinderGeometry(R * 0.94, R * 0.94, FOLD_GAP, 20, 1, true, -1.45, 2.9))), toon(bandCol, { side: THREE.DoubleSide }));
  band.position.y = h + FOLD_GAP / 2;
  g.add(band);
  // Bits of each filling poking out along the edge.
  const r = rng(fill.length + 3);
  fill.forEach((f, i) => {
    if (f.kind === "jack") return;
    const col = f.kind === "pork" ? "#c0622e" : f.kind === "beans" ? "#7a4a32" : f.kind === "jalapeno" ? "#3f8f3a" : f.kind === "onion" ? "#f3eaf3" : "#3f9a3a";
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k - 1) * 0.75 + (i - 1) * 0.25 + (r() - 0.5) * 0.2;
      const bit = mesh(crumbGeo, col, { ink: 1.04, shadow: false });
      bit.position.set(Math.cos(a) * R * 0.95, h + FOLD_GAP / 2, Math.sin(a) * R * 0.95);
      bit.scale.setScalar(1.2);
      g.add(bit);
    }
  });
  if (melted) {
    // Cheese oozing out over the open edge.
    for (const a of [Math.PI * 0.32, Math.PI * 0.52, Math.PI * 0.7]) {
      const ooze = mesh(beanGeo, "#f4c54a", { ink: 1.04, shadow: false });
      ooze.scale.set(0.16, 0.07, 0.12);
      ooze.position.set(Math.cos(a) * R * 1.0, h * 0.6, Math.sin(a) * R * 1.0);
      g.add(ooze);
    }
  }
  const sp = [0, 1].map((w) => {
    const m = new THREE.Mesh(spots(kind, w as 0 | 1, true).geo, toon("#b0702e", { unique: true }));
    m.position.y = h * 2 + FOLD_GAP + 0.004 - hingeY;
    m.castShadow = false;
    hinge.add(m);
    return m;
  });
  // The whole half moon sits over the middle of where the tortilla was.
  g.position.z = -R * 0.42;
  return { group: g, faces: [bottom, top, crease], spots: sp, hinge, seam: [crease, band] };
}

/**
 * A tortilla (open, with whatever's been laid on it, or folded into a quesadilla) into `body`.
 * Returns its update: colour and spots follow the cook, the filling and fold follow the piece.
 */
function makeTortilla(piece: Piece, body: THREE.Group): (p: Piece) => void {
  const kind = piece.kind as "corn" | "flour";
  const rampOf = kind === "corn" ? cornRamp : flourRamp;
  const holder = new THREE.Group();
  body.add(holder);
  let faces: THREE.Mesh[] = [];
  let spotMeshes: THREE.Mesh[] = [];
  let shapeKey = "";
  let colorKey = -1;
  /** The fold, animated: the flap swings over in FOLD_MS from the moment it's folded. */
  let hinge: THREE.Group | null = null;
  let seam: THREE.Object3D[] = [];
  let foldAt = -1;
  let wasOpen: boolean | null = null;
  const build = (p: Piece) => {
    for (const c of [...holder.children]) {
      holder.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
    }
    const fill = p.fill ?? [];
    if (p.folded) {
      const melted = fill.some((f) => f.kind === "jack" && isMelted(f));
      const f = foldedBody(kind, fill, melted);
      f.group.rotation.y = 0;
      const pivot = new THREE.Group();
      pivot.add(f.group);
      pivot.rotation.y = p.foldYaw ?? 0;
      holder.add(pivot);
      faces = f.faces;
      spotMeshes = f.spots;
      hinge = f.hinge;
      seam = f.seam;
      if (wasOpen) foldAt = clock;
      wasOpen = false;
    } else {
      const disc = mesh(discGeo(kind, !!p.handmade), "#f3e2b8", { unique: true, ink: 1.03 });
      holder.add(disc);
      faces = [disc];
      spotMeshes = [0, 1].map((w) => {
        const m = new THREE.Mesh(spots(kind, w as 0 | 1, false).geo, toon("#b0702e", { unique: true }));
        m.position.y = TACO_HEIGHT[kind]! + 0.003;
        m.castShadow = false;
        holder.add(m);
        return m;
      });
      if (fill.length) holder.add(openFill(kind, fill));
      hinge = null;
      wasOpen = true;
    }
    colorKey = -1;
  };
  return (p) => {
    const key = `${p.folded ? `f${(p.foldYaw ?? 0).toFixed(2)}` : "o"}|${fillKey(p.fill)}|${p.handmade ? 1 : 0}`;
    if (key !== shapeKey) {
      shapeKey = key;
      build(p);
    }
    if (hinge && foldAt >= 0) {
      const t = Math.min(1, (clock - foldAt) / FOLD_S);
      const e = 1 - (1 - t) ** 3;
      hinge.rotation.x = -Math.PI * (1 - e);
      for (const o of seam) o.visible = t > 0.75;
      if (t >= 1) foldAt = -1;
    }
    const t = cookLevel(p);
    const k = Math.round(t * 40);
    if (k === colorKey) return;
    colorKey = k;
    const c = grade(rampOf(t, tmpA), tmpA);
    for (const f of faces) (f.material as THREE.MeshToonMaterial).color.copy(c);
    spotMeshes[0].visible = t > 0.18;
    spotMeshes[1].visible = t > 0.45;
    const sc = grade(spotRamp(Math.max(0.2, t), tmpB), tmpB);
    for (const s of spotMeshes) (s.material as THREE.MeshToonMaterial).color.copy(sc);
  };
}

/** A fried tostada shell: a flat, crisp disc with a few blisters. */
const TOSTADA_GEO = shareGeometry(slab(discShape(1.0, 0.01, 0.8), TACO_HEIGHT.tostada!, 0.03));
const BLISTERS = (() => {
  const p = new Parts();
  const r = rng(9);
  const b = faceted(new THREE.SphereGeometry(0.07, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.8;
    p.add(b, "#ffffff", { p: [Math.cos(a) * d, 0, Math.sin(a) * d], s: [1 + r(), 0.5, 1 + r() * 0.6], ink: false });
  }
  return bakeShared(p);
})();
function makeTostada(body: THREE.Group): (p: Piece) => void {
  const disc = mesh(TOSTADA_GEO, "#f1dd96", { unique: true, ink: 1.03 });
  const blisters = new THREE.Mesh(BLISTERS.geo, toon("#f6e3a8", { unique: true }));
  blisters.position.y = TACO_HEIGHT.tostada!;
  blisters.castShadow = false;
  body.add(disc, blisters);
  let key = -1;
  return (p) => {
    const t = cookLevel(p);
    const k = Math.round(t * 40);
    if (k === key) return;
    key = k;
    const c = grade(shellRamp(t, tmpA), tmpA);
    (disc.material as THREE.MeshToonMaterial).color.copy(c);
    (blisters.material as THREE.MeshToonMaterial).color.copy(c).lerp(tmpB.set("#fff4cf"), 0.35);
  };
}

/**
 * Build a comal piece into `body`. Returns its update function, or null when the kind isn't one
 * of Red Rock's (or has nothing that changes: those are added with a no-op).
 */
export function makeTacoPiece(piece: Piece, body: THREE.Group): ((p: Piece) => void) | null {
  if (!OURS.has(piece.kind)) return null;
  switch (piece.kind) {
    case "corn":
    case "flour":
      return makeTortilla(piece, body);
    case "tostada":
      return makeTostada(body);
    case "lime":
      body.add(bakedMesh(LIME));
      return () => {};
    case "jack": {
      // Shredded cheese in hand or on a tostada; it slumps into a puddle once melted.
      const shreds = fillMesh("jack", 0.55, 0.5, 2);
      body.add(shreds);
      const puddle = mesh(shareGeometry(slab(discShape(0.5, 0.08, 4), 0.035, 0.01)), "#f4c54a", { ink: 1.02, shadow: false });
      body.add(puddle);
      return (p) => {
        const m = isMelted(p);
        puddle.visible = m;
        shreds.scale.setScalar(m ? 0.7 : 1);
      };
    }
    default: {
      // A scoop of pork or beans, or a pinch of cilantro: a small heap.
      const big = piece.kind === "pork" || piece.kind === "beans";
      body.add(fillMesh(piece.kind, big ? 0.36 : 0.42, big ? 0.3 : 0.36, 1, big ? 1 : 1.2));
      return () => {};
    }
  }
}

/** A stack of tortillas for the pan (a dozen, slightly fanned), as parts. */
export function tortillaStackParts(kind: "corn" | "flour", count: number, s: number): Parts {
  const p = new Parts();
  const r = rng(kind === "corn" ? 5 : 8);
  const col = kind === "corn" ? ["#f2dc8c", "#ecd27c"] : ["#f7efdc", "#efe4c8"];
  const geo = discGeo(kind, false);
  for (let i = 0; i < count; i++) p.add(geo, col[i % 2], { p: [(r() - 0.5) * 0.06, i * 0.065 * s, (r() - 0.5) * 0.06], r: [0, r() * 6, 0], s, ink: i === count - 1 ? 0.02 : 0.012 });
  return p;
}

/* ---- served ----------------------------------------------------------------------- */

const SHELL_GEO = new Map<string, THREE.BufferGeometry>();
/**
 * A tortilla bent up into a taco: the disc curled over a line along z (the taco's length points
 * at the camera on the tray), so its two sides rise either side of the filling. Bottom at y = 0.
 */
function shellGeo(kind: "corn" | "flour", handmade: boolean): THREE.BufferGeometry {
  const key = `${kind}${handmade ? "h" : ""}`;
  let g = SHELL_GEO.get(key);
  if (!g) {
    const R = TORTILLA_R[kind];
    const rb = R * 0.44;
    const ring = new THREE.RingGeometry(0.02, R, 30, 6);
    ring.rotateX(-Math.PI / 2);
    const p = ring.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = handmade ? 1 + 0.045 * Math.sin(a * 3 + 1.7) : 1;
      const t = (x * k) / rb;
      p.setXYZ(i, rb * Math.sin(t), rb * (1 - Math.cos(t)), z * k);
    }
    g = shareGeometry(faceted(ring));
    SHELL_GEO.set(key, g);
  }
  return g;
}

/** A served taco shell, coloured by how warm the tortilla got. */
export function tacoShell(piece: Piece): THREE.Mesh {
  const kind = piece.kind as "corn" | "flour";
  const t = cookLevel(piece);
  const c = grade((kind === "corn" ? cornRamp : flourRamp)(t, tmpA), tmpA);
  const m = mesh(shellGeo(kind, !!piece.handmade), c, { side: THREE.DoubleSide, ink: 1.025 });
  return m;
}
/** How wide a served taco is across (x) and how high its sides rise, ingredient units. */
export const SHELL_SIZE: Record<"corn" | "flour", { w: number; h: number }> = {
  corn: { w: 2 * TORTILLA_R.corn * 0.44 * Math.sin(1 / 0.44), h: TORTILLA_R.corn * 0.44 * (1 - Math.cos(1 / 0.44)) },
  flour: { w: 2 * TORTILLA_R.flour * 0.44 * Math.sin(1 / 0.44), h: TORTILLA_R.flour * 0.44 * (1 - Math.cos(1 / 0.44)) },
};
