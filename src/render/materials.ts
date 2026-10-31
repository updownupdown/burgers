import * as THREE from "three";

const gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = THREE.NearestFilter;
gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

/*
 * "Pencil Line" look (chosen in the art study, 2026-10-30): three-band toon shading, thin
 * outlines in a dark, desaturated shade of each object's own colour rather than black, and
 * the Sorbet palette, which takes a little saturation out of every colour and lifts it.
 */

/** Near-black ink, used for dark objects and vertex-coloured meshes whose colour varies. */
export const INK_COLOR = new THREE.Color("#3b2a3a");
const WHITE = new THREE.Color("#ffffff");
const _hsl = { h: 0, s: 0, l: 0 };

/** Palette grade applied to every toon colour: 92% saturation, 8% toward white. */
export function grade(color: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
  out.set(color).getHSL(_hsl);
  out.setHSL(_hsl.h, _hsl.s * 0.92, _hsl.l);
  return out.lerp(WHITE, 0.08);
}

/**
 * Outline colour for an object of the given (graded) colour: darkened to ~38% lightness with a
 * touch more saturation and a cooler hue, then blended 55% toward ink. Objects that are already
 * dark get plain ink so their edge still shows.
 */
export function lineColor(color: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
  out.set(color).getHSL(_hsl);
  if (_hsl.l < 0.22) return out.copy(INK_COLOR);
  out.setHSL((_hsl.h - 0.025 + 1) % 1, Math.min(1, _hsl.s * 1.1 + 0.1), Math.max(0.12, _hsl.l * 0.38));
  return out.lerp(INK_COLOR, 0.55);
}

const lineCache = new Map<string, THREE.MeshBasicMaterial>();

/** Shared back-face material for an outline hull in the given line colour. */
export function lineMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const key = new THREE.Color(color).getHexString();
  let m = lineCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    lineCache.set(key, m);
  }
  return m;
}

export interface ToonOpts {
  side?: THREE.Side;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  /** Return a fresh material instead of a shared one (for colours that change per object). */
  unique?: boolean;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const graded = opts.vertexColors ? WHITE : grade(color);
  const key = `${graded.getHexString()}|${opts.side ?? 0}|${opts.vertexColors ? 1 : 0}|${opts.opacity ?? 1}`;
  if (!opts.unique) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({
    color: graded,
    gradientMap: gradient,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
  });
  if (!opts.unique) cache.set(key, m);
  else m.userData.disposable = true;
  return m;
}

/** Mark geometry that many objects share, so disposeObject leaves it alone. */
export function shareGeometry<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.shared = true;
  return geo;
}

/**
 * Free the GPU buffers of an object that's gone for good. Shared geometry and cached
 * materials are kept; everything else built for this object is released.
 */
export function disposeObject(obj: THREE.Object3D | null | undefined): void {
  obj?.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.userData.shared) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat.userData.disposable) mat.dispose();
  });
}

export const INK = lineMaterial(INK_COLOR);
/** Default hull scale: a thin line. */
export const LINE = 1.03;

/**
 * Inverted-hull outline: a slightly larger back-face copy drawn in the object's line colour
 * (ink for vertex-coloured meshes, whose colour changes as they cook).
 */
export function outline<T extends THREE.Mesh>(mesh: T, scale = LINE, color?: THREE.ColorRepresentation): T {
  const mat = mesh.material as THREE.MeshToonMaterial;
  const line = color !== undefined ? lineMaterial(color) : mat.vertexColors || !mat.color ? INK : lineMaterial(lineColor(mat.color));
  const hull = new THREE.Mesh(mesh.geometry, line);
  hull.scale.setScalar(scale);
  hull.name = "hull";
  mesh.add(hull);
  return mesh;
}

export function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export function mesh(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: ToonOpts & { ink?: boolean | number; shadow?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.castShadow = opts.shadow ?? true;
  m.receiveShadow = true;
  if (opts.ink !== false) outline(m, typeof opts.ink === "number" ? opts.ink : LINE);
  return m;
}

/** Multi-stop colour ramp for cooking. */
export function ramp(stops: [number, string][]): (t: number, out?: THREE.Color) => THREE.Color {
  const cols = stops.map(([t, c]) => [t, grade(c)] as const);
  return (t, out = new THREE.Color()) => {
    t = Math.min(stops[stops.length - 1][0], Math.max(0, t));
    for (let i = 1; i < cols.length; i++) {
      if (t <= cols[i][0]) {
        const [t0, c0] = cols[i - 1];
        const [t1, c1] = cols[i];
        return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0 || 1));
      }
    }
    return out.copy(cols[cols.length - 1][1]);
  };
}
