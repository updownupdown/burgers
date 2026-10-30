import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { INK, shareGeometry, toon } from "./materials";

/**
 * Many small parts baked into one vertex-coloured mesh plus one ink hull, so a heap of food
 * or a stack of cartons costs two draw calls instead of two per part.
 */

type Vec3 = [number, number, number];

export interface PartOpts {
  p?: Vec3;
  /** Euler rotation in radians (XYZ). */
  r?: Vec3;
  s?: number | Vec3;
  /** Ink outline thickness in world units (after `s`), or false for none. Default 0.022. */
  ink?: number | false;
}

interface Part {
  geo: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  /** Null keeps the geometry's own vertex colours. */
  color: THREE.Color | null;
  scale: THREE.Vector3;
  ink: number | false;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();

export class Parts {
  private list: Part[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, o: PartOpts = {}): this {
    const s = typeof o.s === "number" ? new THREE.Vector3(o.s, o.s, o.s) : new THREE.Vector3(...(o.s ?? [1, 1, 1]));
    const r = o.r ?? [0, 0, 0];
    _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    const matrix = new THREE.Matrix4().compose(_v.set(...(o.p ?? [0, 0, 0])), _q, s);
    this.list.push({ geo, matrix, color: color === null ? null : new THREE.Color(color), scale: s, ink: o.ink ?? 0.022 });
    return this;
  }

  /** Add another part list under a transform (for reusing a built-up piece, like a whole bun). */
  addParts(other: Parts, o: PartOpts = {}): this {
    const s = typeof o.s === "number" ? new THREE.Vector3(o.s, o.s, o.s) : new THREE.Vector3(...(o.s ?? [1, 1, 1]));
    const r = o.r ?? [0, 0, 0];
    _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    const outer = new THREE.Matrix4().compose(_v.set(...(o.p ?? [0, 0, 0])), _q, s);
    for (const p of other.list) {
      this.list.push({ ...p, matrix: outer.clone().multiply(p.matrix), scale: p.scale.clone().multiply(s), ink: o.ink === false ? false : p.ink });
    }
    return this;
  }

  get count(): number {
    return this.list.length;
  }

  /** Merge into one geometry (position, normal, color) and its ink hull (position only). */
  bake(): { geo: THREE.BufferGeometry; hull: THREE.BufferGeometry | null } {
    const solid: THREE.BufferGeometry[] = [];
    const hulls: THREE.BufferGeometry[] = [];
    for (const p of this.list) {
      const src = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", src.attributes.position.clone());
      if (src.attributes.normal) g.setAttribute("normal", src.attributes.normal.clone());
      else g.computeVertexNormals();
      g.applyMatrix4(p.matrix);
      const n = g.attributes.position.count;
      if (!p.color && src.attributes.color) g.setAttribute("color", src.attributes.color.clone());
      else {
        const c = p.color ?? new THREE.Color(1, 1, 1);
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i += 3) {
          col[i] = c.r;
          col[i + 1] = c.g;
          col[i + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      }
      solid.push(g);
      const ink = p.ink;
      if (ink === false || ink <= 0) continue;
      // Hull: grow the part about its own centre by a fixed world thickness on every axis.
      const h = new THREE.BufferGeometry();
      h.setAttribute("position", src.attributes.position.clone());
      _box.setFromBufferAttribute(src.attributes.position as THREE.BufferAttribute);
      _box.getCenter(_c);
      _box.getSize(_size);
      const k = (i: 0 | 1 | 2) => {
        const size = Math.max(1e-3, _size.getComponent(i));
        return (size + (2 * ink) / Math.abs(p.scale.getComponent(i) || 1)) / size;
      };
      _m.makeTranslation(_c.x, _c.y, _c.z).multiply(_t.makeScale(k(0), k(1), k(2))).multiply(_t.makeTranslation(-_c.x, -_c.y, -_c.z));
      h.applyMatrix4(_t.copy(p.matrix).multiply(_m));
      hulls.push(h);
    }
    const geo = mergeGeometries(solid, false);
    const hull = hulls.length ? mergeGeometries(hulls, false) : null;
    for (const g of [...solid, ...hulls]) g.dispose();
    geo.computeBoundingSphere();
    return { geo, hull };
  }
}

export interface Baked {
  geo: THREE.BufferGeometry;
  hull: THREE.BufferGeometry | null;
}

/** Bake once and mark the result shared, for caches that live as long as the page. */
export function bakeShared(parts: Parts): Baked {
  const b = parts.bake();
  shareGeometry(b.geo);
  if (b.hull) shareGeometry(b.hull);
  return b;
}

/** A vertex-coloured toon mesh with its ink hull as a child. */
export function bakedMesh(b: Baked, opts: { shadow?: boolean; material?: THREE.Material } = {}): THREE.Mesh {
  const m = new THREE.Mesh(b.geo, opts.material ?? toon(0xffffff, { vertexColors: true }));
  m.castShadow = opts.shadow ?? true;
  m.receiveShadow = true;
  if (b.hull) {
    const h = new THREE.Mesh(b.hull, INK);
    h.name = "hull";
    m.add(h);
  }
  return m;
}

/** Small deterministic random source, so cached heaps look the same every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
