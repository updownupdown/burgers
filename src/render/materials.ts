import * as THREE from "three";

// Three bands; the shadow band sits a little lighter (90 -> 110) so shadows tint rather than grey out.
const gradient = new THREE.DataTexture(new Uint8Array([110, 180, 255]), 3, 1, THREE.RedFormat);
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

/**
 * Palette grade applied to every toon colour: 92% saturation, 8% toward white. Done in sRGB (the
 * space the colours are picked in): in linear space the 8% white lifted every dark to a mid grey,
 * so cooked meat, char and dark steel all went ash-grey (review of build #78, P1-1).
 */
export function grade(color: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
  out.set(color).getHSL(_hsl, THREE.SRGBColorSpace);
  out.setHSL(_hsl.h, _hsl.s * 0.92, _hsl.l, THREE.SRGBColorSpace);
  return out.convertLinearToSRGB().lerp(WHITE, 0.08).convertSRGBToLinear();
}

/**
 * Outline colour for an object of the given (graded) colour: darkened to ~38% lightness with a
 * touch more saturation and a cooler hue, then blended 55% toward ink. Objects that are already
 * dark get plain ink so their edge still shows.
 */
export function lineColor(color: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
  out.set(color).getHSL(_hsl, THREE.SRGBColorSpace);
  if (_hsl.l < 0.22) return out.copy(INK_COLOR);
  out.setHSL((_hsl.h - 0.025 + 1) % 1, Math.min(1, _hsl.s * 1.1 + 0.1), Math.max(0.12, _hsl.l * 0.38), THREE.SRGBColorSpace);
  return out.lerp(INK_COLOR, 0.55);
}

/*
 * Constant-width outlines (review of build #78, P2-1). A hull used to be the mesh scaled up 3%
 * about its origin, so the line was 3% of the object's size: chunky on a fountain, missing on a
 * pickle or a cheese slice. Now the hull is drawn at the mesh's own size and each vertex is pushed
 * out along a smoothed normal in screen space by a fixed number of CSS pixels, so every object
 * gets the same pencil weight, matching the map and the truck art.
 */

/** Outline width in CSS pixels, per quality tier. */
export const OUTLINE_PX = { high: 1.25, standard: 1.25, low: 1.0 };
/** NDC offset per outline: (2 * px / viewport width, 2 * px / viewport height), CSS px. */
const outlineUniform = { value: new THREE.Vector2(2 * 1.25 / 390, 2 * 1.25 / 300) };
let outlinePx = OUTLINE_PX.high;
/** Set the outline width (CSS px) for the quality tier. */
export function setOutlinePx(px: number): void {
  outlinePx = px;
}
/** Call before rendering into a viewport of w x h CSS pixels. */
export function setOutlineViewport(w: number, h: number): void {
  outlineUniform.value.set((2 * outlinePx) / Math.max(1, w), (2 * outlinePx) / Math.max(1, h));
}

/**
 * Per-vertex outline direction: the average of the normals of every vertex at the same position,
 * so a hard edge (a box corner, a cylinder rim, a faceted mesh) pushes out as one piece instead of
 * splitting into gaps. Recomputed if the geometry's positions change.
 */
export function outlineNormals(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const have = geo.attributes.outlineNormal as THREE.BufferAttribute | undefined;
  if (have && geo.userData.outlineVer === pos.version && have.count === pos.count) return;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const acc = new Map<string, [number, number, number]>();
  const keys: string[] = new Array(n);
  const q = (v: number) => Math.round(v * 1e4);
  for (let i = 0; i < n; i++) {
    const k = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    keys[i] = k;
    const a = acc.get(k);
    if (a) {
      a[0] += nrm.getX(i);
      a[1] += nrm.getY(i);
      a[2] += nrm.getZ(i);
    } else acc.set(k, [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]);
  }
  const out = have && have.count === n ? (have.array as Float32Array) : new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = acc.get(keys[i])!;
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  if (have && have.count === n) have.needsUpdate = true;
  else geo.setAttribute("outlineNormal", new THREE.BufferAttribute(out, 3));
  geo.userData.outlineVer = pos.version;
}

/** Turn a back-face basic material into a constant screen-width outline. */
export function outlineShader<T extends THREE.Material>(m: T, weight = 1): T {
  m.userData.outlineWeight = weight;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = outlineUniform;
    sh.uniforms.uWeight = { value: weight };
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "attribute vec3 outlineNormal;\nuniform vec2 uOutline;\nuniform float uWeight;\nvoid main() {")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec3 on = outlineNormal;
          #ifdef USE_INSTANCING
            on = mat3( instanceMatrix ) * on;
          #endif
          vec4 cn = projectionMatrix * vec4( normalMatrix * on, 0.0 );
          vec2 dp = cn.xy / uOutline;
          float l = length( dp );
          // The outline normal is unit length, or shorter / longer for a thinner / bolder line.
          if ( l > 1e-6 ) gl_Position.xy += ( dp / l ) * uOutline * uWeight * length( outlineNormal ) * gl_Position.w;
        }`,
      );
  };
  m.customProgramCacheKey = () => "bv-outline";
  (m as unknown as { onBeforeRender: (...a: unknown[]) => void }).onBeforeRender = (...a) => outlineNormals(a[3] as THREE.BufferGeometry);
  return m;
}

const lineCache = new Map<string, THREE.MeshBasicMaterial>();

/** Shared back-face material for an outline hull in the given line colour (weight 1 = OUTLINE_PX). */
export function lineMaterial(color: THREE.ColorRepresentation, weight = 1): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${weight}`;
  let m = lineCache.get(key);
  if (!m) {
    m = outlineShader(new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }), weight);
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

/**
 * A three-band toon material over a texture (canvas textures are painted in graded colours
 * already, so the material colour stays white). Cached per texture unless `unique`.
 */
const mapCache = new Map<THREE.Texture, THREE.MeshToonMaterial>();
export function texturedToon(map: THREE.Texture, opts: { unique?: boolean } = {}): THREE.MeshToonMaterial {
  const hit = !opts.unique && mapCache.get(map);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color: WHITE, map, gradientMap: gradient });
  if (opts.unique) m.userData.disposable = true;
  else mapCache.set(map, m);
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
/** Legacy hull scale. Outlines are now a constant screen width (OUTLINE_PX); kept for callers. */
export const LINE = 1.03;

/**
 * Inverted-hull outline: a back-face copy drawn in the object's line colour (ink for
 * vertex-coloured meshes, whose colour changes as they cook), pushed out a fixed number of screen
 * pixels by its material (see outlineShader). `_scale` is ignored: every line has one weight.
 */
export function outline<T extends THREE.Mesh>(mesh: T, _scale = LINE, color?: THREE.ColorRepresentation, weight = 1): T {
  const mat = mesh.material as THREE.MeshToonMaterial;
  const line = color !== undefined ? lineMaterial(color, weight) : mat.vertexColors || !mat.color ? (weight === 1 ? INK : lineMaterial(INK_COLOR, weight)) : lineMaterial(lineColor(mat.color), weight);
  outlineNormals(mesh.geometry);
  const hull = new THREE.Mesh(mesh.geometry, line);
  hull.name = "hull";
  mesh.add(hull);
  return mesh;
}

const _line = new THREE.Color();
/** Retint an outlined mesh's line to follow its colour as it changes (food as it cooks). */
export function setLine(m: THREE.Mesh, c: THREE.Color): void {
  const hull = m.children.find((o) => o.name === "hull") as THREE.Mesh | undefined;
  if (hull) hull.material = lineMaterial(lineColor(c, _line));
}

export function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export function mesh(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: ToonOpts & { ink?: boolean | number; shadow?: boolean; /** Outline weight (1 = OUTLINE_PX). */ line?: number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.castShadow = opts.shadow ?? true;
  m.receiveShadow = true;
  if (opts.ink !== false) outline(m, typeof opts.ink === "number" ? opts.ink : LINE, undefined, opts.line ?? 1);
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

const _sp = new THREE.Sphere();
/**
 * Low quality: hide the outline of anything smaller than `minPx` CSS pixels across on screen
 * (about the line's own width, so the line was most of what showed), and show every outline
 * again when `on` is false. Saves a draw call per small object.
 */
export function cullSmallHulls(scene: THREE.Object3D, cam: THREE.PerspectiveCamera, viewH: number, on: boolean, minPx = 6): void {
  const k = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  scene.traverse((o) => {
    if (o.name !== "hull") return;
    const parent = o.parent as THREE.Mesh | null;
    if (!parent?.isMesh) return;
    if (!on) {
      if (o.userData.culled) {
        o.visible = true;
        o.userData.culled = false;
      }
      return;
    }
    const geo = parent.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    _sp.copy(geo.boundingSphere!).applyMatrix4(parent.matrixWorld);
    const d = Math.max(0.01, _sp.center.distanceTo(cam.position));
    const small = (2 * _sp.radius * k) / d < minPx;
    if (small && o.visible) {
      o.visible = false;
      o.userData.culled = true;
    } else if (!small && o.userData.culled) {
      o.visible = true;
      o.userData.culled = false;
    }
  });
}
