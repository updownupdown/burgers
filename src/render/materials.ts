import * as THREE from "three";

const gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = THREE.NearestFilter;
gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

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
  const key = `${new THREE.Color(color).getHexString()}|${opts.side ?? 0}|${opts.vertexColors ? 1 : 0}|${opts.opacity ?? 1}`;
  if (!opts.unique) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({
    color: opts.vertexColors ? 0xffffff : color,
    gradientMap: gradient,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
  });
  if (!opts.unique) cache.set(key, m);
  return m;
}

export const INK = new THREE.MeshBasicMaterial({ color: 0x1d1410, side: THREE.BackSide });

/** Inverted-hull outline: a slightly larger back-face copy drawn in ink. */
export function outline<T extends THREE.Mesh>(mesh: T, scale = 1.05): T {
  const hull = new THREE.Mesh(mesh.geometry, INK);
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
  if (opts.ink !== false) outline(m, typeof opts.ink === "number" ? opts.ink : 1.05);
  return m;
}

/** Multi-stop colour ramp for cooking. */
export function ramp(stops: [number, string][]): (t: number, out?: THREE.Color) => THREE.Color {
  const cols = stops.map(([t, c]) => [t, new THREE.Color(c)] as const);
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
