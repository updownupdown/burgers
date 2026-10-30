import * as THREE from "three";
import { avgCook, bunToast } from "../game/cooking";
import type { DrinkId, Kind, Piece } from "../game/types";
import { DRINK_COLOR } from "../game/types";
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
  cheese: (() => {
    const melt = 0.4;
    const g = new THREE.PlaneGeometry(1.9, 1.9, 12, 12);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI / 4 + 0.15);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const over = Math.max(0, Math.hypot(x, z) - 0.92);
      const s = 1 - melt * 0.12 * Math.min(1, over * 3);
      p.setXYZ(i, x * s, 0.025 - melt * (over * 1.1 + over * over * 1.4), z * s);
    }
    return faceted(g);
  })(),
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
  const g = new THREE.CylinderGeometry(1, 1, 0.28, 26, 2);
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

function paintTwoSided(m: THREE.Mesh, down: THREE.Color, up: THREE.Color, side: THREE.Color, split: number) {
  const g = m.geometry;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y > split + 0.1 ? up : y < split - 0.1 ? down : side;
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
        paintTwoSided(m, tmpA, tmpB, tmpC, 0.14);
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
      const g = group("cheese", LAYER_HEIGHT.cheese);
      g.add(mesh(GEO.cheese, "#f7c531", { side: THREE.DoubleSide, ink: 1.02 }));
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
  userData: { setCook: (t: number) => void };
}

export function makeFries(withCarton: boolean): FriesObject {
  const g = new THREE.Group() as FriesObject;
  const mat = toon("#f6efc9", { unique: true });
  const stick = faceted(new THREE.BoxGeometry(0.09, 0.75, 0.09));
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(stick, mat);
    const a = i * 2.4;
    const r = 0.08 + (i % 4) * 0.07;
    m.position.set(Math.cos(a) * r * 1.4, 0.55 + (i % 3) * 0.07, Math.sin(a) * r * 0.8);
    m.rotation.set(Math.sin(a) * 0.25, a, Math.cos(a) * 0.25);
    m.castShadow = true;
    outline(m, 1.25);
    g.add(m);
  }
  if (withCarton) {
    const carton = mesh(faceted(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 4, 1, true)), "#d8473a", { side: THREE.DoubleSide });
    carton.rotation.y = Math.PI / 4;
    carton.scale.z = 0.6;
    carton.position.y = 0.3;
    g.add(carton);
    const band = mesh(faceted(new THREE.CylinderGeometry(0.405, 0.37, 0.12, 4, 1, true)), "#f6e7c8", { side: THREE.DoubleSide, ink: false });
    band.rotation.y = Math.PI / 4;
    band.scale.z = 0.62;
    band.position.y = 0.38;
    g.add(band);
  }
  g.userData = { setCook: (t) => mat.color.copy(friesRamp(t, tmpA)) };
  return g;
}

export interface CupObject extends THREE.Group {
  userData: { setFill: (f: number) => void; flavor: DrinkId };
}

export function makeCup(flavor: DrinkId, lid: boolean): CupObject {
  const g = new THREE.Group() as CupObject;
  const cup = mesh(faceted(new THREE.CylinderGeometry(0.4, 0.3, 1.0, 14, 1, true)), "#f3f1ea", { side: THREE.DoubleSide });
  cup.position.y = 0.5;
  g.add(cup);
  const stripe = mesh(faceted(new THREE.CylinderGeometry(0.385, 0.35, 0.18, 14, 1, true)), DRINK_COLOR[flavor], { side: THREE.DoubleSide, ink: false });
  stripe.position.y = 0.45;
  g.add(stripe);
  const liquid = mesh(faceted(new THREE.CylinderGeometry(0.37, 0.3, 1, 14)), DRINK_COLOR[flavor], { ink: false, shadow: false });
  g.add(liquid);
  if (lid) {
    const top = mesh(faceted(new THREE.CylinderGeometry(0.43, 0.43, 0.06, 14)), "#f8f8f4");
    top.position.y = 1.02;
    const straw = mesh(faceted(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6)), "#e5432b", { ink: 1.2 });
    straw.position.set(0.1, 1.25, 0);
    straw.rotation.z = -0.15;
    g.add(top, straw);
  }
  g.userData = {
    flavor,
    setFill: (f) => {
      const h = Math.max(0.001, Math.min(1, f) * 0.94);
      liquid.visible = f > 0.01;
      liquid.scale.set(0.96 * (0.82 + 0.18 * h), h, 0.96 * (0.82 + 0.18 * h));
      liquid.position.y = 0.03 + h / 2;
    },
  };
  g.userData.setFill(0);
  return g;
}

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
