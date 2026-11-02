import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { grade, INK_COLOR, lineColor, outlineNormals, outlineShader, shareGeometry, toon } from "./materials";

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
  /** Outline thickness in world units (after `s`), or false for none. Default 0.014. */
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
const _nm = new THREE.Matrix3();
const _lc = new THREE.Color();

/** Back-face material for baked hulls, coloured per vertex. */
const LINE_VC = outlineShader(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));

export class Parts {
  private list: Part[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, o: PartOpts = {}): this {
    const s = typeof o.s === "number" ? new THREE.Vector3(o.s, o.s, o.s) : new THREE.Vector3(...(o.s ?? [1, 1, 1]));
    const r = o.r ?? [0, 0, 0];
    _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    const matrix = new THREE.Matrix4().compose(_v.set(...(o.p ?? [0, 0, 0])), _q, s);
    this.list.push({ geo, matrix, color: color === null ? null : grade(color), scale: s, ink: o.ink ?? 0.014 });
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

  /** Merge into one geometry (position, normal, color) and its outline hull (position, color). */
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
      // Hull: the part itself, pushed out a fixed screen width along its smoothed normals by the
      // line material (materials.ts outlineShader).
      const h = new THREE.BufferGeometry();
      h.setAttribute("position", g.attributes.position.clone());
      const on = new THREE.BufferGeometry();
      on.setAttribute("position", src.attributes.position);
      if (src.attributes.normal) on.setAttribute("normal", src.attributes.normal);
      outlineNormals(on);
      const onAttr = (on.attributes.outlineNormal as THREE.BufferAttribute).clone();
      onAttr.applyNormalMatrix(_nm.getNormalMatrix(p.matrix));
      // Line weight from the part's ink (0.014 world units is the standard line): fine parts in a
      // dense heap (fries, ice, nested cartons) get a lighter line so the heap doesn't turn to ink.
      onAttr.normalized = false;
      const w = THREE.MathUtils.clamp(ink / 0.014, 0.55, 1.2);
      if (w !== 1) for (let i = 0; i < onAttr.count; i++) onAttr.setXYZ(i, onAttr.getX(i) * w, onAttr.getY(i) * w, onAttr.getZ(i) * w);
      h.setAttribute("outlineNormal", onAttr);
      // Each part's line is a dark shade of its own colour; vertex-coloured parts get ink.
      const lc = p.color ? lineColor(p.color, _lc) : INK_COLOR;
      const hcol = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i += 3) {
        hcol[i] = lc.r;
        hcol[i + 1] = lc.g;
        hcol[i + 2] = lc.b;
      }
      h.setAttribute("color", new THREE.BufferAttribute(hcol, 3));
      hulls.push(h);
    }
    const geo = mergeGeometries(solid, false);
    const hull = hulls.length ? mergeGeometries(hulls, false) : null;
    if (hull) hull.userData.outlineVer = (hull.attributes.position as THREE.BufferAttribute).version;
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
    const h = new THREE.Mesh(b.hull, LINE_VC);
    h.name = "hull";
    m.add(h);
  }
  return m;
}

/**
 * Bake every static toon mesh under `root` (and their outline hulls) into one vertex-coloured
 * mesh per material class: solids by side and shadow flags, plus one hull. A window full of
 * scenery built from hundreds of primitives then costs a handful of draw calls (review of build
 * #78, P1-3). Textured, transparent, multi-material and `userData.noBake` meshes are left alone,
 * as is anything under an object marked `userData.noBake`. The originals are removed and their
 * own (non-shared) geometry disposed. Returns how many meshes were merged.
 */
export function bakeStatic(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const solids = new Map<string, { list: THREE.BufferGeometry[]; side: THREE.Side; cast: boolean; recv: boolean }>();
  const hulls: THREE.BufferGeometry[] = [];
  const gone: THREE.Mesh[] = [];
  const m4 = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const bakeable = (o: THREE.Mesh): o is THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> => {
    const mat = o.material as THREE.Material;
    if (!o.isMesh || Array.isArray(o.material) || o.name === "hull" || (o as unknown as THREE.InstancedMesh).isInstancedMesh) return false;
    if (!(mat as THREE.MeshToonMaterial).isMeshToonMaterial || mat.transparent || (mat as THREE.MeshToonMaterial).map) return false;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.noBake || !p.visible) return false;
    // Only meshes whose children are their hulls (nothing else hangs off them).
    return o.children.every((c) => c.name === "hull");
  };
  const colourise = (src: THREE.BufferGeometry, colour: THREE.Color, useVc: boolean): THREE.BufferAttribute => {
    const n = src.attributes.position.count;
    const out = new Float32Array(n * 3);
    const vc = useVc ? (src.attributes.color as THREE.BufferAttribute | undefined) : undefined;
    for (let i = 0; i < n; i++) {
      out[i * 3] = colour.r * (vc ? vc.getX(i) : 1);
      out[i * 3 + 1] = colour.g * (vc ? vc.getY(i) : 1);
      out[i * 3 + 2] = colour.b * (vc ? vc.getZ(i) : 1);
    }
    return new THREE.BufferAttribute(out, 3);
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!bakeable(mesh)) return;
    const mat = mesh.material;
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (!src.attributes.normal) src.computeVertexNormals();
    m4.multiplyMatrices(inv, mesh.matrixWorld);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", src.attributes.position.clone().applyMatrix4(m4));
    g.setAttribute("normal", src.attributes.normal.clone().applyNormalMatrix(nm.getNormalMatrix(m4)));
    g.setAttribute("color", colourise(src, mat.color, mat.vertexColors));
    // Mirrored transforms flip the winding; put it back so the faces still face out.
    if (m4.determinant() < 0) flipWinding(g);
    const key = `${mat.side}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
    let b = solids.get(key);
    if (!b) solids.set(key, (b = { list: [], side: mat.side, cast: mesh.castShadow, recv: mesh.receiveShadow }));
    b.list.push(g);
    for (const c of mesh.children) {
      const hull = c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      if (!hull.isMesh || !hull.visible) continue;
      const hs = hull.geometry.index ? hull.geometry.toNonIndexed() : hull.geometry;
      outlineNormals(hs);
      m4.multiplyMatrices(inv, hull.matrixWorld);
      const h = new THREE.BufferGeometry();
      h.setAttribute("position", hs.attributes.position.clone().applyMatrix4(m4));
      const hon = (hs.attributes.outlineNormal as THREE.BufferAttribute).clone().applyNormalMatrix(nm.getNormalMatrix(m4));
      const hw = (hull.material.userData.outlineWeight as number | undefined) ?? 1;
      if (hw !== 1) for (let i = 0; i < hon.count; i++) hon.setXYZ(i, hon.getX(i) * hw, hon.getY(i) * hw, hon.getZ(i) * hw);
      h.setAttribute("outlineNormal", hon);
      h.setAttribute("color", colourise(hs, hull.material.color, hull.material.vertexColors));
      if (m4.determinant() < 0) flipWinding(h);
      hulls.push(h);
    }
    gone.push(mesh);
  });
  if (!gone.length) return 0;
  for (const m of gone) {
    m.removeFromParent();
    if (!m.geometry.userData.shared) m.geometry.dispose();
  }
  for (const b of solids.values()) {
    const geo = mergeGeometries(b.list, false);
    geo.computeBoundingSphere();
    for (const g of b.list) g.dispose();
    const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, side: b.side }));
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.name = "baked";
    root.add(m);
  }
  if (hulls.length) {
    const geo = mergeGeometries(hulls, false);
    geo.userData.outlineVer = (geo.attributes.position as THREE.BufferAttribute).version;
    geo.computeBoundingSphere();
    for (const g of hulls) g.dispose();
    const h = new THREE.Mesh(geo, LINE_VC);
    h.name = "hull";
    root.add(h);
  }
  return gone.length;
}

function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    const s = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = arr[(i + 1) * s + k];
        arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
        arr[(i + 2) * s + k] = t;
      }
    }
  }
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
