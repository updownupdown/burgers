import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bakedMesh, Parts, type Baked } from "../bake";
import { faceted } from "../materials";
import { STUDY } from "../units";

/*
 * Shared pieces for the kitchen machines. Machines are modelled in study units (1 = 10 cm,
 * true size, as in the Kitchen Bench study) and scaled into game units by STUDY when baked,
 * so outlines keep the same world thickness as the rest of the game.
 *
 * Every machine is a Group whose origin is the centre of its footprint on the counter top,
 * front toward +z, with userData { footprint: {w, d}, h, spots } in game units.
 */

export type V3 = [number, number, number];

/** Shared palette for steel and trim. */
export const C = {
  steel: "#c9d1cf",
  steelL: "#e2e7e6",
  steelD: "#3a4043",
  dark: "#3d4245",
  plate: "#55595b",
  rubber: "#2d3336",
  knob: "#2d3336",
  red: "#d24c3f",
  cream: "#f3efe4",
  ketchup: "#d8261b",
  mustard: "#f0c419",
};

export const box = (w: number, h: number, d: number) => faceted(new THREE.BoxGeometry(w, h, d));
/** Rounded box; `r` is the corner radius. */
export const rbox = (w: number, h: number, d: number, r = 0.05) => faceted(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)));
export const cyl = (rt: number, rb: number, h: number, segs = 20, open = false) => faceted(new THREE.CylinderGeometry(rt, rb, h, segs, 1, open));
export const sph = (r: number, ws = 12, hs = 8) => faceted(new THREE.SphereGeometry(r, ws, hs));
export const tor = (r: number, t: number, rs = 6, ts = 20) => faceted(new THREE.TorusGeometry(r, t, rs, ts));
export const lathe = (pts: [number, number][], segs = 24) => faceted(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs));

/** A plate drawn in the side (z, y) profile, extruded `t` along x and centred on x. */
export function sideProfile(zy: [number, number][], t: number): THREE.BufferGeometry {
  const s = new THREE.Shape(zy.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(t / 2, 0, 0);
  return faceted(g);
}

/** Any outline in (x, z) extruded upward by h. */
export function prism(pts: [number, number][], h: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return faceted(g);
}

/** Control knob facing +z: a skirt, a grip and a white index line. */
export function knob(p: Parts, x: number, y: number, z: number, r = 0.2, col = C.knob, ang = 0.6): void {
  p.add(cyl(r * 1.25, r * 1.25, 0.03), "#e8e4da", { p: [x, y, z + 0.015], r: [Math.PI / 2, 0, 0], ink: false });
  p.add(cyl(r * 0.85, r, 0.16, 16), col, { p: [x, y, z + 0.1], r: [Math.PI / 2, 0, 0] });
  p.add(box(r * 0.25, r * 1.4, 0.08), col, { p: [x, y, z + 0.2], r: [0, 0, ang] });
  p.add(box(0.03, r * 0.7, 0.02), "#ffffff", { p: [x - Math.sin(ang) * r * 0.45, y + Math.cos(ang) * r * 0.45, z + 0.245], r: [0, 0, ang], ink: false });
}

/** Knob lying on a top deck, facing up. */
export function topKnob(p: Parts, x: number, y: number, z: number, r = 0.2, col = C.knob, ang = 0.6): void {
  p.add(cyl(r * 1.3, r * 1.3, 0.02), "#e8e4da", { p: [x, y + 0.01, z], ink: false });
  p.add(cyl(r * 0.85, r, 0.16, 16), col, { p: [x, y + 0.09, z] });
  p.add(box(r * 0.25, 0.08, r * 1.4), col, { p: [x, y + 0.2, z], r: [0, ang, 0] });
  p.add(box(0.03, 0.02, r * 0.7), "#ffffff", { p: [x + Math.sin(ang) * r * 0.45, y + 0.245, z + Math.cos(ang) * r * 0.45], r: [0, ang, 0], ink: false });
}

/** Bake study-unit parts into a game-unit list, keeping outline widths in world units. */
export function toGame(p: Parts): Parts {
  return new Parts().addParts(p, { s: STUDY });
}

/** One vertex-coloured mesh in game units from parts modelled in study units. */
export function studyMesh(p: Parts, opts: { shadow?: boolean } = {}): THREE.Mesh {
  return bakedMesh(toGame(p).bake(), opts);
}

/** Cache a study-unit model baked into shared game-unit geometry. */
export function cached(build: () => Parts): () => Baked {
  let b: Baked | null = null;
  return () => {
    if (!b) {
      b = toGame(build()).bake();
      b.geo.userData.shared = true;
      if (b.hull) b.hull.userData.shared = true;
    }
    return b;
  };
}

/** A group scaled into study units, for decals and glows placed with the study's numbers. */
export function studySpace(): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(STUDY);
  return g;
}

/** Scale a study-unit point into game units. */
export const gu = (v: V3): { x: number; y: number; z: number } => ({ x: v[0] * STUDY, y: v[1] * STUDY, z: v[2] * STUDY });

export interface MachineData {
  footprint: { w: number; d: number };
  h: number;
  spots: Record<string, unknown>;
}

/** Tag a machine group with its footprint and height, given in study units, and its spots in game units. */
export function machine<T extends THREE.Group>(g: T, w: number, d: number, h: number, spots: Record<string, unknown>): T {
  Object.assign(g.userData, { footprint: { w: w * STUDY, d: d * STUDY }, h: h * STUDY, spots });
  return g;
}

// ---- unlit bits: lamps, LEDs, decals -----------------------------------------

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit material for lamps, LEDs and heat; shared per colour and opacity. */
export function glowMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    glowCache.set(key, m);
  }
  return m;
}

export function glow(geo: THREE.BufferGeometry, color: string, opacity = 1): THREE.Mesh {
  const m = new THREE.Mesh(geo, glowMat(color, opacity));
  m.castShadow = false;
  m.raycast = () => {};
  return m;
}

export const FONT = `"Manrope", system-ui, sans-serif`;

export function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat textured plane facing +y (or +z with up: false). */
export function decal(tex: THREE.Texture, w: number, h: number, o: { up?: boolean } = {}): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  if (o.up !== false) g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
  const me = new THREE.Mesh(g, m);
  me.raycast = () => {};
  me.castShadow = false;
  return me;
}

const texCache = new Map<string, THREE.CanvasTexture>();
/** A rounded label plate texture, cached by its text and style. */
export function plateTex(text: string, o: { fs?: number; pad?: number; bg?: string; color?: string; w?: number; h?: number; r?: number; weight?: number } = {}): THREE.CanvasTexture {
  const key = JSON.stringify([text, o]);
  const hit = texCache.get(key);
  if (hit) return hit;
  const fs = o.fs ?? 64;
  const pad = o.pad ?? 22;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `${o.weight ?? 800} ${fs}px ${FONT}`;
  const w = o.w ?? Math.ceil(m.measureText(text).width + pad * 2);
  const h = o.h ?? Math.round(fs + pad * 1.4);
  const t = canvasTex(w, h, (x) => {
    x.fillStyle = o.bg ?? "#fbf7ee";
    x.beginPath();
    x.roundRect(2, 2, w - 4, h - 4, o.r ?? h * 0.3);
    x.fill();
    x.fillStyle = o.color ?? "#3b2a3a";
    x.font = `${o.weight ?? 800} ${fs}px ${FONT}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2 + fs * 0.05);
  });
  t.userData = { aspect: w / h };
  texCache.set(key, t);
  return t;
}

/** A text label `height` tall, as wide as its text needs. */
export function textDecal(text: string, height: number, o: Parameters<typeof plateTex>[1] & { up?: boolean } = {}): THREE.Mesh {
  const t = plateTex(text, o);
  return decal(t, height * (t.userData.aspect as number), height, o);
}
