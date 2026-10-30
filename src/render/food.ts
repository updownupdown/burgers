import * as THREE from "three";
import { avgCook, bunToast, isMelted } from "../game/cooking";
import type { FriesSize, Kind, Piece } from "../game/types";
import { bakedMesh, bakeShared, Parts, rng, type Baked } from "./bake";
import { faceted, mesh, outline, ramp, shareGeometry, toon } from "./materials";

/** Thickness each piece adds to a stack, in ingredient units (a patty is ~2 units wide). */
export const LAYER_HEIGHT: Record<Kind, number> = {
  bun: 0.32,
  patty: 0.3,
  bacon: 0.09,
  egg: 0.13,
  cheese: 0.05,
  lettuce: 0.08,
  tomato: 0.1,
  onion: 0.09,
  pickle: 0.07,
  pineapple: 0.13,
  jalapeno: 0.06,
  ketchup: 0.04,
  mustard: 0.04,
};
export const TOP_BUN_HEIGHT = 0.74;

export type BunRole = "bottom" | "top";

const pattyRamp = ramp([
  [0, "#d9737b"],
  [0.3, "#b5615a"],
  [0.55, "#8a4a33"],
  [0.78, "#5e3423"],
  [1.0, "#2c1b14"],
  [1.4, "#151010"],
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
const friesRamp = ramp([
  [0, "#f6efc9"],
  [0.45, "#f3d36b"],
  [0.7, "#e9b23a"],
  [1.0, "#b36a1e"],
  [1.3, "#3e2510"],
]);

/** A square slice; `melt` slumps the corners over the patty edge and `drip` adds runs. */
function cheeseGeo(melt: number, drip: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1.9, 1.9, 14, 14);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI / 4 + 0.15);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const over = Math.max(0, Math.hypot(x, z) - 0.92 + drip * 0.04 * Math.sin(a * 7));
    const s = 1 - Math.min(melt, 0.4) * 0.12 * Math.min(1, over * 3);
    const sag = melt * (over * 1.1 + over * over * 1.4) * (1 + drip * 0.5 * Math.max(0, Math.sin(a * 5 + 1)));
    p.setXYZ(i, x * s, 0.025 - Math.min(sag, 0.5), z * s);
  }
  return faceted(g);
}

function lathe(points: [number, number][], segs = 26): THREE.BufferGeometry {
  return faceted(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs));
}

const GEO = {
  bottomBun: lathe([[0, 0], [0.92, 0], [1.0, 0.06], [1.03, 0.17], [0.99, 0.27], [0.9, 0.31], [0, 0.31]]),
  topBun: lathe([[0, 0], [0.98, 0], [1.05, 0.08], [1.03, 0.22], [0.9, 0.42], [0.66, 0.6], [0.36, 0.7], [0, 0.73]]),
  cutDisc: faceted(new THREE.CylinderGeometry(0.93, 0.93, 0.025, 26)),
  rimDisc: faceted(new THREE.CylinderGeometry(1.0, 1.0, 0.035, 26)),
  seed: faceted(new THREE.SphereGeometry(0.04, 6, 4)),
  lettuce: (() => {
    const g = new THREE.RingGeometry(0.0, 1.2, 48, 4);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z) / 1.2;
      const a = Math.atan2(z, x);
      p.setY(i, r * r * (0.1 * Math.sin(a * 9 + r * 3) - 0.04) + 0.04);
    }
    return faceted(g);
  })(),
  cheese: cheeseGeo(0.3, 0),
  cheeseMelted: cheeseGeo(0.95, 1),
  tomato: faceted(new THREE.CylinderGeometry(0.44, 0.44, 0.09, 14)),
  tomatoCore: faceted(new THREE.CylinderGeometry(0.27, 0.27, 0.095, 9)),
  onion: [0.32, 0.44].map((r) => faceted(new THREE.TorusGeometry(r, 0.045, 5, 20))),
  pickle: faceted(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12)),
  pickleCore: faceted(new THREE.CylinderGeometry(0.15, 0.15, 0.055, 8)),
  pineapple: lathe([[0.3, 0], [0.88, 0], [0.92, 0.06], [0.88, 0.12], [0.3, 0.12], [0.28, 0.06], [0.3, 0]], 18),
  jalapeno: faceted(new THREE.TorusGeometry(0.16, 0.05, 5, 12)),
  jalapenoCore: faceted(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8)),
  yolk: faceted(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
};

for (const g of Object.values(GEO)) for (const geo of Array.isArray(g) ? g : [g]) shareGeometry(geo);

function pattyGeo(): THREE.BufferGeometry {
  // Several rings up the edge so the seared crust can creep up from each face.
  const g = new THREE.CylinderGeometry(1, 1, 0.28, 26, 6);
  const p = g.attributes.position;
  const seed = Math.random() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    const k = 1.02 + 0.035 * Math.sin(5 * a + seed) + 0.025 * Math.sin(11 * a + 1.3 + seed);
    p.setXYZ(i, x * k, y + Math.sign(y) * 0.025 * Math.sin(6 * x + 4 * z + seed) * r, z * k);
  }
  const f = faceted(g);
  f.translate(0, 0.14, 0);
  f.setAttribute("color", new THREE.BufferAttribute(new Float32Array(f.attributes.position.count * 3), 3));
  return f;
}

function baconGeo(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.9, 0.05, 0.36, 18, 1, 2);
  const p = g.attributes.position;
  const seed = Math.random() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) + 0.05 * Math.sin(x * 5 + seed) + 0.03);
  }
  const f = faceted(g);
  f.setAttribute("color", new THREE.BufferAttribute(new Float32Array(f.attributes.position.count * 3), 3));
  return f;
}

function eggWhiteGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.95, 0.95, 0.07, 22, 1);
  const p = g.attributes.position;
  const seed = Math.random() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.sin(3 * a + seed) + 0.05 * Math.sin(7 * a + seed * 2);
    p.setXYZ(i, x * k, p.getY(i) + 0.035, z * k);
  }
  return faceted(g);
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const tmpC = new THREE.Color();
const tmpD = new THREE.Color();
const tmpE = new THREE.Color();

/**
 * Faces take their own doneness colour. On the edge, a crust band grows up from the bottom
 * (and down from the top) as each face cooks, so the underside reads from the angled camera.
 */
function paintPatty(m: THREE.Mesh, downCook: number, upCook: number, down: THREE.Color, up: THREE.Color, mid: THREE.Color) {
  const g = m.geometry;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = g.attributes.color;
  const bandDown = 0.06 + 0.4 * Math.min(1, downCook);
  const bandUp = 0.06 + 0.4 * Math.min(1, upCook);
  // Heat from the grill greys the outer ring of the top face first, like a real patty.
  tmpD.copy(up).lerp(down, downCook > upCook ? 0.7 : 0);
  tmpE.copy(down).lerp(up, upCook > downCook ? 0.7 : 0);
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const f = pos.getY(i) / 0.28;
    const rim = Math.hypot(pos.getX(i), pos.getZ(i)) > 0.5;
    const c = ny > 0.6 ? (rim ? tmpD : up) : ny < -0.6 ? (rim ? tmpE : down) : f < bandDown ? down : f > 1 - bandUp ? up : mid;
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

export interface FoodObject extends THREE.Group {
  userData: {
    kind: Kind;
    update: (p: Piece) => void;
    height: number;
  };
}

function group(kind: Kind, height: number, update: (p: Piece) => void = () => {}): FoodObject {
  const g = new THREE.Group() as FoodObject;
  g.userData = { kind, update, height };
  return g;
}

/** Build the 3D object for a piece. `role` picks the bun shape when stacked. */
export function makeFood(piece: Piece, role: BunRole = "top"): FoodObject {
  switch (piece.kind) {
    case "bun": {
      if (role === "bottom") {
        const disc = mesh(GEO.cutDisc, "#f4d79a", { unique: true, ink: false });
        const g = group("bun", LAYER_HEIGHT.bun, (p) => (disc.material as THREE.MeshToonMaterial).color.copy(toastRamp(bunToast(p), tmpA)));
        g.add(mesh(GEO.bottomBun, "#df9a3e"));
        disc.position.y = 0.31;
        g.add(disc);
        g.userData.update(piece);
        return g;
      }
      const rim = mesh(GEO.rimDisc, "#f4d79a", { unique: true, ink: false });
      const dome = mesh(GEO.topBun, "#e3a03c", { unique: true });
      const g = group("bun", TOP_BUN_HEIGHT, (p) => {
        (rim.material as THREE.MeshToonMaterial).color.copy(toastRamp(p.cook[0], tmpA));
        (dome.material as THREE.MeshToonMaterial).color.set("#e3a03c").lerp(tmpB.set("#3b2216"), Math.max(0, Math.min(1, p.cook[1] - 0.3)));
      });
      rim.position.y = 0.02;
      g.add(dome, rim);
      for (let i = 0; i < 30; i++) {
        const a = (i * 2.399) % (Math.PI * 2);
        const r = Math.sqrt((i + 0.5) / 30) * 0.82;
        const s = mesh(GEO.seed, "#fff3d8", { ink: false, shadow: false });
        s.position.set(Math.cos(a) * r, 0.73 * Math.sqrt(Math.max(0, 1 - (r / 1.06) ** 2)) + 0.004, Math.sin(a) * r);
        s.scale.set(1.5, 0.55, 0.9);
        s.rotation.set(Math.sin(a) * r * 0.5, a * 3, -Math.cos(a) * r * 0.5);
        g.add(s);
      }
      g.userData.update(piece);
      return g;
    }
    case "patty": {
      const m = new THREE.Mesh(pattyGeo(), toon(0xffffff, { vertexColors: true }));
      m.castShadow = m.receiveShadow = true;
      outline(m, 1.045);
      const g = group("patty", LAYER_HEIGHT.patty, (p) => {
        if (p.smashed) m.scale.set(1.22, 0.5, 1.22);
        pattyRamp(p.cook[0], tmpA);
        pattyRamp(p.cook[1], tmpB);
        pattyRamp(avgCook(p) * 0.85, tmpC);
        paintPatty(m, p.cook[0], p.cook[1], tmpA, tmpB, tmpC);
      });
      g.add(m);
      g.userData.update(piece);
      return g;
    }
    case "bacon": {
      const strips = [baconGeo(), baconGeo()].map((geo, i) => {
        const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
        m.castShadow = m.receiveShadow = true;
        outline(m, 1.04);
        m.position.z = i ? 0.22 : -0.22;
        m.rotation.y = i ? 0.08 : -0.05;
        return m;
      });
      const g = group("bacon", LAYER_HEIGHT.bacon, (p) => {
        const t = avgCook(p);
        baconMeat(t, tmpA);
        baconFat(t, tmpB);
        for (const s of strips) {
          const pos = s.geometry.attributes.position;
          const col = s.geometry.attributes.color;
          for (let i = 0; i < pos.count; i++) {
            const c = Math.abs(pos.getZ(i)) < 0.07 ? tmpB : tmpA;
            col.setXYZ(i, c.r, c.g, c.b);
          }
          col.needsUpdate = true;
        }
      });
      g.add(...strips);
      g.userData.update(piece);
      return g;
    }
    case "egg": {
      const white = mesh(eggWhiteGeo(), "#d9d2c8", { unique: true, ink: 1.03 });
      const yolk = mesh(GEO.yolk, "#ffb21c", { unique: true, ink: false });
      yolk.position.set(0.1, 0.07, -0.05);
      yolk.scale.y = 0.75;
      const g = group("egg", LAYER_HEIGHT.egg, (p) => {
        const t = Math.max(p.cook[0], p.cook[1]);
        (white.material as THREE.MeshToonMaterial).color.copy(eggWhite(t, tmpA));
        (yolk.material as THREE.MeshToonMaterial).color.set("#ffb21c").lerp(tmpB.set("#f0c860"), Math.min(1, Math.max(0, t - 0.5) * 2));
      });
      g.add(white, yolk);
      g.userData.update(piece);
      return g;
    }
    case "pineapple": {
      const ring = mesh(GEO.pineapple, "#f5d33f", { unique: true });
      const g = group("pineapple", LAYER_HEIGHT.pineapple, (p) => {
        const t = Math.max(p.cook[0], p.cook[1]);
        (ring.material as THREE.MeshToonMaterial).color.copy(pineRamp(t, tmpA));
      });
      g.add(ring);
      g.userData.update(piece);
      return g;
    }
    case "jalapeno": {
      const g = group("jalapeno", LAYER_HEIGHT.jalapeno);
      const spots = [
        [0.45, 0.15],
        [-0.4, 0.3],
        [-0.15, -0.5],
        [0.2, 0.55],
        [0.05, -0.05],
      ];
      spots.forEach(([x, z], i) => {
        // One ripe red slice makes the pile read as "hot peppers" rather than pickles.
        const r = mesh(GEO.jalapeno, i === 2 ? "#d8392b" : "#2fa83a", { ink: 1.15 });
        r.rotation.x = Math.PI / 2;
        r.position.set(x, 0.03 + i * 0.004, z);
        const c = mesh(GEO.jalapenoCore, "#fff4b8", { ink: false, shadow: false });
        c.position.set(x, 0.03, z);
        g.add(r, c);
      });
      return g;
    }
    case "cheese": {
      // Swaps to a slumped, deeper-orange slice once it melts.
      let melted = false;
      const slice = mesh(GEO.cheese, "#f7c531", { side: THREE.DoubleSide, ink: 1.02 });
      const g = group("cheese", LAYER_HEIGHT.cheese, (p) => {
        if (isMelted(p) === melted) return;
        melted = !melted;
        slice.geometry = melted ? GEO.cheeseMelted : GEO.cheese;
        (slice.children[0] as THREE.Mesh).geometry = slice.geometry;
        slice.material = toon(melted ? "#f6ad25" : "#f7c531", { side: THREE.DoubleSide });
      });
      g.add(slice);
      g.userData.update(piece);
      return g;
    }
    case "lettuce": {
      const g = group("lettuce", LAYER_HEIGHT.lettuce);
      g.add(mesh(GEO.lettuce, "#68bf45", { side: THREE.DoubleSide, ink: 1.02 }));
      return g;
    }
    case "tomato": {
      const g = group("tomato", LAYER_HEIGHT.tomato);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.4;
        const t = mesh(GEO.tomato, "#e5432b");
        t.position.set(Math.cos(a) * 0.46, 0.045 + i * 0.01, Math.sin(a) * 0.46);
        const core = mesh(GEO.tomatoCore, "#f2765d", { ink: false, shadow: false });
        t.add(core);
        g.add(t);
      }
      return g;
    }
    case "onion": {
      const g = group("onion", LAYER_HEIGHT.onion);
      GEO.onion.forEach((geo, i) => {
        const ring = mesh(geo, "#ecd5f0");
        ring.rotation.x = Math.PI / 2;
        ring.position.set(i ? -0.25 : 0.3, 0.05, i ? 0.15 : -0.1);
        g.add(ring);
      });
      return g;
    }
    case "pickle": {
      const g = group("pickle", LAYER_HEIGHT.pickle);
      const spots = [
        [0.45, 0.1],
        [-0.35, 0.35],
        [-0.2, -0.45],
        [0.15, 0.55],
      ];
      spots.forEach(([x, z], i) => {
        const p = mesh(GEO.pickle, "#6f9a3c");
        p.position.set(x, 0.03 + i * 0.006, z);
        p.add(mesh(GEO.pickleCore, "#b9d27a", { ink: false, shadow: false }));
        g.add(p);
      });
      return g;
    }
    case "ketchup":
    case "mustard": {
      const color = piece.kind === "ketchup" ? "#d8261b" : "#f0c419";
      const g = group(piece.kind, LAYER_HEIGHT.ketchup);
      const holder = new THREE.Group();
      g.add(holder);
      let lastLen = -1;
      g.userData.update = (p) => {
        const pts = p.stroke ?? [];
        if (pts.length === lastLen) return;
        lastLen = pts.length;
        for (const c of holder.children) (c as THREE.Mesh).geometry.dispose();
        holder.clear();
        if (pts.length < 2) {
          if (pts.length === 1) {
            const blob = mesh(new THREE.SphereGeometry(0.08, 8, 5), color, { ink: false });
            blob.position.set(pts[0].x, 0.03, pts[0].z);
            blob.scale.y = 0.5;
            holder.add(blob);
          }
          return;
        }
        const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q.x, 0.035, q.z)));
        const tube = new THREE.TubeGeometry(curve, Math.min(200, pts.length * 3), 0.065, 6, false);
        const m = new THREE.Mesh(tube, toon(color));
        m.scale.y = 0.6;
        m.castShadow = true;
        holder.add(m);
      };
      g.userData.update(piece);
      return g;
    }
  }
}

/** Height of a stacked piece, accounting for bun shape and smashed patties. */
export function stackHeight(piece: Pick<Piece, "kind" | "smashed">, role: BunRole): number {
  if (piece.kind === "bun") return role === "bottom" ? LAYER_HEIGHT.bun : TOP_BUN_HEIGHT;
  if (piece.smashed) return LAYER_HEIGHT.patty * 0.55;
  return LAYER_HEIGHT[piece.kind];
}

// ---- sides -----------------------------------------------------------------

export interface FriesObject extends THREE.Group {
  userData: {
    setCook: (t: number) => void;
    /**
     * Extra scale callers multiply in. Sizes are built into the carton models now, so this is
     * 1 for every size; it stays so existing call sites keep working.
     */
    sizeScale: number;
    /** Piles made with `makeFryPile(…, own)`: show this share (0..1) of the sticks. */
    setAmount?: (a: number) => void;
  };
}

/** Carton proportions per size, [width and depth, height], against the large one. */
export const CARTON_SIZE: Record<FriesSize, [number, number]> = { S: [0.84, 0.74], M: [0.92, 0.87], L: [1, 1] };
/** Large carton: bottom and top half-width (x) and half-depth (z), height, scooped front, wall. */
const CART = { a0: 0.2, b0: 0.12, a1: 0.3, b1: 0.18, h: 0.62, scoop: 0.11, wall: 0.022, floor: 0.035 };
/** Sticks in a full carton. */
const FRY_COUNT: Record<FriesSize, number> = { S: 20, M: 26, L: 32 };
/** Height each nested carton adds to a stack, in carton units. */
export const CARTON_NEST = 0.075;

/** Rounded-rectangle ring of a carton wall. `y(u, v)` gives the height at each point. */
function cartonRing(n: number, w: number, d: number, inset: number, y: (u: number, v: number) => number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const u = Math.sign(c) * Math.abs(c) ** 0.4;
    const v = Math.sign(s) * Math.abs(s) ** 0.4;
    pts.push(new THREE.Vector3(u * (w - inset), y(u, v), v * (d - inset)));
  }
  return pts;
}

/**
 * A closed, thin-walled fries carton: red outside with a cream and yellow band, darker inside,
 * its front and back scooped low so the fries show. Vertex coloured, bottom at y = 0.
 */
function cartonShell(size: FriesSize): THREE.BufferGeometry {
  const [sw, sh] = CARTON_SIZE[size];
  const { a0, b0, a1, b1, wall, floor } = CART;
  const h = CART.h * sh;
  const scoop = CART.scoop * sh;
  const N = 24;
  const top = (u: number, v: number) => h - scoop * (1 - u * u) * v * v;
  const ring = (f: number, inset: number, y0: number) =>
    cartonRing(N, (a0 + (a1 - a0) * f) * sw, (b0 + (b1 - b0) * f) * sw, inset, (u, v) => y0 + (top(u, v) - y0) * f);
  const bands = [0, 0.48, 0.54, 0.7, 0.76, 1];
  const bandCol = ["#d8473a", "#f6e7c8", "#f3c642", "#f6e7c8", "#d8473a"].map((c) => new THREE.Color(c));
  const outer = bands.map((f) => ring(f, 0, 0));
  const innerTop = ring(1, wall, 0);
  const innerBot = ring(0, wall, floor).map((p) => p.setY(floor));
  const inside = new THREE.Color("#a8342b");
  const floorCol = new THREE.Color("#8e2a23");
  const rim = new THREE.Color("#ec6a58");
  const pos: number[] = [];
  const col: number[] = [];
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, want: THREE.Vector3, c: THREE.Color) => {
    n.crossVectors(e1.subVectors(q, p), e2.subVectors(r, p));
    for (const v of n.dot(want) >= 0 ? [p, q, r] : [p, r, q]) {
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
  };
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3, want: THREE.Vector3, c: THREE.Color) => {
    tri(p, q, r, want, c);
    tri(p, r, s, want, c);
  };
  const out = new THREE.Vector3();
  const inward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const floorMid = new THREE.Vector3(0, floor, 0);
  const bottomMid = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    out.set(outer[0][i].x + outer[0][j].x, 0, outer[0][i].z + outer[0][j].z).normalize();
    inward.copy(out).negate();
    for (let k = 0; k < bands.length - 1; k++) quad(outer[k][i], outer[k][j], outer[k + 1][j], outer[k + 1][i], out, bandCol[k]);
    quad(outer[bands.length - 1][i], outer[bands.length - 1][j], innerTop[j], innerTop[i], up, rim);
    quad(innerTop[i], innerTop[j], innerBot[j], innerBot[i], inward, inside);
    tri(floorMid, innerBot[i], innerBot[j], up, floorCol);
    tri(bottomMid, outer[0][i], outer[0][j], down, bandCol[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const SHELLS: Partial<Record<FriesSize, THREE.BufferGeometry>> = {};
const shell = (size: FriesSize) => (SHELLS[size] ??= shareGeometry(cartonShell(size)));
const CARTONS = new Map<string, Baked>();

/** `count` cartons nested into each other, baked into one mesh (count 1 is a single carton). */
function cartonBaked(size: FriesSize, count: number): Baked {
  const key = `${size}${count}`;
  let b = CARTONS.get(key);
  if (!b) {
    const parts = new Parts();
    for (let i = 0; i < count; i++) parts.add(shell(size), null, { p: [0, i * CARTON_NEST * CARTON_SIZE[size][1], 0], ink: 0.016 });
    b = bakeShared(parts);
    CARTONS.set(key, b);
  }
  return b;
}

/** An empty fries carton, for stacks and the packing spots. Bottom at y = 0, sized for `size`. */
export function makeCarton(size: FriesSize): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(cartonBaked(size, 1)));
  return g;
}

/** A stack of `count` empty cartons nested into each other, as one mesh. */
export function makeCartonStack(size: FriesSize, count: number): THREE.Group {
  const g = new THREE.Group();
  if (count > 0) g.add(bakedMesh(cartonBaked(size, count)));
  return g;
}

const FRY_STICK = shareGeometry(faceted(new THREE.BoxGeometry(0.075, 1, 0.075)));
const FRY_VERTS = FRY_STICK.attributes.position.count;

/** `n` sticks standing in a carton of this size (a full carton holds FRY_COUNT[size]). */
const CARTON_FRIES = new Map<string, Baked>();
function cartonFries(size: FriesSize, n: number): Baked {
  const key = `${size}${n}`;
  let b = CARTON_FRIES.get(key);
  if (b) return b;
  const [sw, sh] = CARTON_SIZE[size];
  const total = FRY_COUNT[size];
  const r = rng(7 + total);
  const hw = (CART.a1 - CART.wall) * sw - 0.06;
  const hd = (CART.b1 - CART.wall) * sw - 0.05;
  const slots = Array.from({ length: total }, (_, i) => {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / total);
    const u = Math.cos(a) * rr;
    const v = Math.sin(a) * rr;
    return {
      p: [u * hw, v * hd] as const,
      // Longer in the middle, so the top of the fries domes like a real carton; outer ones fan out.
      len: (0.56 + 0.3 * (1 - rr * rr) + r() * 0.12) * (0.55 + 0.45 * sh),
      r: [v * 0.34 + (r() - 0.5) * 0.14, (r() - 0.5) * 0.9, -u * 0.42 + (r() - 0.5) * 0.14] as [number, number, number],
    };
  });
  // A part-filled carton keeps an even spread: take slots in a golden-ratio order.
  const order = slots.map((_, i) => i).sort((p, q) => ((p * 0.618034) % 1) - ((q * 0.618034) % 1));
  // ...and sits lower in the carton.
  const sink = (1 - n / total) * 0.3 * sh;
  const parts = new Parts();
  for (const i of order.slice(0, n)) {
    const s = slots[i];
    parts.add(FRY_STICK, "#ffffff", { p: [s.p[0], 0.1 * sh - sink + s.len / 2, s.p[1]], r: s.r, s: [1, s.len, 1], ink: 0.013 });
  }
  b = bakeShared(parts);
  CARTON_FRIES.set(key, b);
  return b;
}

/** A loose handful of fries lying across each other (from the freezer or a basket). */
const HANDFULS = new Map<number, Baked>();
function handful(n: number): Baked {
  let b = HANDFULS.get(n);
  if (b) return b;
  const r = rng(31);
  const parts = new Parts();
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / 16);
    parts.add(FRY_STICK, "#ffffff", {
      p: [Math.cos(a) * rr * 0.24, 0.06 + (1 - rr) * 0.16 + (i % 3) * 0.03, Math.sin(a) * rr * 0.18],
      r: [(r() - 0.5) * 0.4, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.5],
      s: [1, 0.55 + r() * 0.25, 1],
      ink: 0.013,
    });
  }
  b = bakeShared(parts);
  HANDFULS.set(n, b);
  return b;
}

function friesGroup(baked: Baked | null): FriesObject {
  const g = new THREE.Group() as FriesObject;
  const mat = toon("#f6efc9", { unique: true });
  if (baked) {
    const m = bakedMesh(baked, { material: mat });
    // Thin sticks only cast shadows: receiving them just speckles the faces.
    m.receiveShadow = false;
    g.add(m);
  }
  g.userData = { sizeScale: 1, setCook: (t) => void mat.color.copy(friesRamp(t, tmpA)) };
  return g;
}

/**
 * Fries in a carton of `size`, or a loose handful without one. `fill` (0..1) hides sticks for
 * a part-filled carton or a part-emptied basket. Bottom at y = 0.
 */
export function makeFries(withCarton: boolean, size: FriesSize = "L", fill = 1): FriesObject {
  const f = Math.min(1, Math.max(0, fill));
  if (!withCarton) {
    const n = Math.round(16 * f);
    return friesGroup(n ? handful(n) : null);
  }
  const n = Math.round(FRY_COUNT[size] * f);
  const g = friesGroup(n ? cartonFries(size, n) : null);
  g.add(makeCarton(size));
  return g;
}

/**
 * Fries lying in a layered mound about `w` × `d` (a fryer basket, the freezer), bottom layer
 * first. With `own`, the geometry belongs to this object and `setAmount` hides the top layers;
 * otherwise it's cached and shared by seed.
 */
const PILES = new Map<string, Baked>();
export function makeFryPile(w: number, d: number, layers: number, seed: number, own = false): FriesObject {
  const key = `${w}|${d}|${layers}|${seed}`;
  let baked = own ? null : PILES.get(key) ?? null;
  const parts = new Parts();
  if (!baked) {
    const r = rng(seed);
    const per = Math.max(3, Math.round((w * d) / 0.045));
    for (let l = 0; l < layers; l++) {
      // Upper layers cover less ground, so the pile mounds up in the middle.
      const k = 1 - (l / Math.max(1, layers)) * 0.5;
      for (let i = 0; i < per * k; i++) {
        parts.add(FRY_STICK, "#ffffff", {
          p: [(r() - 0.5) * w * 0.86 * k, 0.045 + l * 0.07 + r() * 0.025, (r() - 0.5) * d * 0.86 * k],
          r: [(r() - 0.5) * 0.3, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.3],
          s: [1, 0.5 + r() * 0.3, 1],
          ink: 0.009,
        });
      }
    }
    baked = own ? parts.bake() : bakeShared(parts);
    if (!own) PILES.set(key, baked);
  }
  const g = friesGroup(baked);
  if (own) {
    const b = baked;
    const total = parts.count;
    g.userData.setAmount = (a) => {
      const count = Math.ceil(total * Math.min(1, Math.max(0, a))) * FRY_VERTS;
      b.geo.setDrawRange(0, count);
      b.hull?.setDrawRange(0, count);
    };
  }
  return g;
}

// Cups moved to models/drinks.ts; re-exported so existing imports keep working.
export { CUP_SCALE, makeCup, type CupObject } from "./models/drinks";

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
