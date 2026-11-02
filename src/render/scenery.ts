import * as THREE from "three";
import type { Backdrop } from "../game/stops";
import { bakeStatic } from "./bake";
import { faceted, grade, mesh, toon } from "./materials";

/*
 * The view out of the serving window ("Valley view", picked by James from the scenery study on
 * 2026-11-02, DESIGN.md §26). The truck is at a roadside pull-out: a fence, a signpost and a few
 * local plants close by, then the land rises behind so the view fills the window instead of
 * dropping out of it. Each area has its landmark: pine slopes under a snowy peak (The Pines), a
 * beach, sails and a lighthouse headland (Sunny Coast), banded mesas and an arch (Red Rock), and
 * orchard rows climbing a striped hill with a barn and a windmill (Orchard Isle).
 *
 * The window shows a strip from just above the horizon down to the customers' feet, so everything
 * is built to sit in that band: near props up to ~1.5 units, the land behind rising to ~3-6.
 */

/** Ground level: customers' feet. */
const G = 0.2;
/**
 * Where the near ground starts: just behind the cabin wall (its back face is at z 4.5, see
 * CustomersView.buildFrame), so no strip of ground shows in front of the painted wall.
 */
const NEAR_Z = 4.4;

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const rr = (a: number, b: number) => a + (b - a) * rnd();

export interface Built {
  /** Sky gradient for the scene background. */
  background: THREE.Texture;
  /** Haze toward the horizon colour. */
  fog: THREE.Fog;
}

/** A vertical sky gradient keyed to the band: horizon colour low, sky colour above the hem. */
function sky(top: string, horizon: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, `#${grade(top).getHexString()}`);
  g.addColorStop(0.3, `#${grade(top).getHexString()}`);
  g.addColorStop(0.47, `#${grade(horizon).getHexString()}`);
  g.addColorStop(1, `#${grade(horizon).getHexString()}`);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shade = (c: string, k: number) => `#${grade(c).multiplyScalar(k).getHexString()}`;

class Kit {
  constructor(public g: THREE.Group) {}
  /** A toon mesh with a tinted outline (near things) or none (far things). */
  put(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ink: boolean | number = true): THREE.Mesh {
    const m = mesh(faceted(geo), color, { ink, shadow: false });
    m.position.set(x, y, z);
    this.g.add(m);
    return m;
  }
  box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, ink: boolean | number = true) {
    return this.put(new THREE.BoxGeometry(w, h, d), c, x, y, z, ink);
  }

  cyl(rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 8, ink: boolean | number = true) {
    return this.put(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, ink);
  }
  cone(r: number, h: number, c: string, x: number, y: number, z: number, seg = 7, ink: boolean | number = true) {
    return this.put(new THREE.ConeGeometry(r, h, seg), c, x, y, z, ink);
  }
  ball(r: number, c: string, x: number, y: number, z: number, ink: boolean | number = true, seg = 9) {
    return this.put(new THREE.IcosahedronGeometry(r, seg > 8 ? 1 : 0), c, x, y, z, ink);
  }
  /** A flat ground plane at height y, from z0 to z1 (z0 nearer). */
  ground(c: string, y: number, z0: number, z1: number, w = 80): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(w, z0 - z1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, toon(c));
    m.position.set(0, y, (z0 + z1) / 2);
    this.g.add(m);
    return m;
  }

  // ---- trees and plants
  pine(x: number, z: number, h: number, c = "#3b7d5a", ink: boolean | number = true, y = G): void {
    this.cyl(h * 0.05, h * 0.07, h * 0.25, "#7a5434", x, y + h * 0.12, z, 6, ink);
    for (let i = 0; i < 3; i++) {
      const r = h * (0.36 - i * 0.08);
      const ch = h * (0.42 - i * 0.05);
      this.cone(r, ch, i % 2 ? c : shade(c, 1.08), x, y + h * 0.22 + i * h * 0.22 + ch / 2, z, 7, ink);
    }
  }
  palm(x: number, z: number, h: number, lean: number, ink: boolean | number = true): void {
    const segs = 5;
    let px = x;
    let py = G;
    for (let i = 0; i < segs; i++) {
      const s = this.cyl(0.13 - i * 0.012, 0.16 - i * 0.012, h / segs + 0.05, i % 2 ? "#a77748" : "#93683f", px, py + h / segs / 2, z, 6, ink);
      s.rotation.z = -lean * (0.4 + i * 0.15);
      px += Math.sin(lean * (0.4 + i * 0.15)) * (h / segs);
      py += Math.cos(lean * (0.4 + i * 0.15)) * (h / segs);
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const leaf = this.put(new THREE.ConeGeometry(0.22, 1.9, 4), k % 2 ? "#3c9a52" : "#4aa95c", px + Math.cos(a) * 0.8, py - 0.15, z + Math.sin(a) * 0.8, ink);
      leaf.scale.z = 0.35;
      leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2 - 0.0);
      leaf.lookAt(px + Math.cos(a) * 3, py - 1.4, z + Math.sin(a) * 3);
      leaf.rotateX(Math.PI / 2);
    }
    this.ball(0.22, "#6b4a2c", px, py - 0.05, z, ink);
  }
  saguaro(x: number, z: number, h: number, ink: boolean | number = true): void {
    const c = "#5f9a58";
    this.cyl(0.26, 0.3, h, c, x, G + h / 2, z, 8, ink);
    this.ball(0.26, c, x, G + h, z, ink);
    for (const [s, at, up] of [[-1, 0.45, 0.35], [1, 0.6, 0.28]] as const) {
      const ax = x + s * 0.55;
      this.cyl(0.16, 0.16, 0.5, c, x + s * 0.3, G + h * at, z, 6, ink).rotation.z = Math.PI / 2;
      this.cyl(0.17, 0.17, h * up, c, ax, G + h * at + (h * up) / 2, z, 7, ink);
      this.ball(0.17, c, ax, G + h * at + h * up, z, ink);
    }
  }
  appleTree(x: number, z: number, h: number, fruit = "#d9443a", ink: boolean | number = true, y = G): void {
    this.cyl(0.12 * h, 0.16 * h, h * 0.5, "#7a5434", x, y + h * 0.25, z, 6, ink);
    const crown = this.ball(h * 0.48, "#5a9a4c", x, y + h * 0.78, z, ink);
    crown.scale.set(1.15, 0.9, 1);
    if (fruit) for (let k = 0; k < 6; k++) this.ball(0.09 * h, fruit, x + Math.cos(k * 1.9) * h * 0.42, y + h * 0.7 + Math.sin(k * 2.3) * h * 0.25, z + h * 0.32, false, 0);
  }
  bush(x: number, z: number, r: number, c = "#5f9a58", ink: boolean | number = true): void {
    for (let k = 0; k < 3; k++) this.ball(r * (0.8 + 0.2 * (k % 2)), shade(c, 1 - k * 0.05), x + (k - 1) * r * 0.8, G + r * 0.6, z, ink);
  }
  agave(x: number, z: number, s: number): void {
    for (let k = 0; k < 7; k++) {
      const leaf = this.cone(0.12 * s, 0.9 * s, "#7fa58a", x, G + 0.35 * s, z, 4);
      leaf.rotation.set(Math.sin(k * 0.9) * 0.7, 0, Math.cos(k * 0.9) * 0.7);
    }
  }
  rock(x: number, z: number, s: number, c: string): void {
    const r = this.put(new THREE.DodecahedronGeometry(s, 0), c, x, G + s * 0.3, z);
    r.scale.y = 0.6;
    r.rotation.y = x;
  }

  // ---- street furniture



  crate(x: number, z: number, fruit: string, wood = "#c79a62"): void {
    this.box(0.7, 0.35, 0.5, wood, x, G + 0.95, z);
    for (let i = 0; i < 6; i++) this.ball(0.1, fruit, x - 0.22 + (i % 3) * 0.22, G + 1.15, z - 0.1 + Math.floor(i / 3) * 0.2, false, 0);
  }
  fence(z: number, x0: number, x1: number, c: string, kind: "rail" | "rope" | "picket" | "guard"): void {
    for (let x = x0; x <= x1; x += 2) {
      if (kind === "picket") {
        for (let k = 0; k < 8; k++) {
          const px = x + k * 0.25;
          this.box(0.14, 0.95, 0.06, c, px, G + 0.47, z, 1.05);
          this.cone(0.1, 0.16, c, px, G + 1.02, z, 4, false).rotation.y = Math.PI / 4;
        }
        this.box(2, 0.08, 0.05, c, x + 0.9, G + 0.7, z - 0.05, false);
        continue;
      }
      if (kind === "guard") {
        this.box(0.14, 0.75, 0.14, "#8a6a4a", x, G + 0.37, z);
        continue;
      }
      this.cyl(0.07, 0.08, kind === "rope" ? 0.9 : 1.05, c, x, G + (kind === "rope" ? 0.45 : 0.52), z, 6);
    }
    if (kind === "rail") {
      for (const y of [0.45, 0.85]) this.cyl(0.045, 0.045, x1 - x0, c, (x0 + x1) / 2, G + y, z, 6).rotation.z = Math.PI / 2;
    } else if (kind === "rope") {
      for (let x = x0; x < x1; x += 2) {
        const pts: THREE.Vector3[] = [];
        for (let t = 0; t <= 1.001; t += 0.1) pts.push(new THREE.Vector3(x + t * 2, G + 0.78 - Math.sin(t * Math.PI) * 0.18, z));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5), toon("#c9ab7a"));
        this.g.add(tube);
      }
    } else if (kind === "guard") {
      this.box(x1 - x0, 0.26, 0.06, "#c9ced2", (x0 + x1) / 2, G + 0.6, z + 0.09);
    }
  }
  signpost(x: number, z: number, c: string): void {
    this.cyl(0.06, 0.07, 2, "#8a6a4a", x, G + 1, z, 6);
    this.box(1.1, 0.34, 0.06, c, x + 0.35, G + 1.65, z + 0.04).rotation.z = 0.04;
    this.box(0.9, 0.3, 0.06, shade(c, 0.85), x - 0.25, G + 1.25, z + 0.04).rotation.z = -0.05;
  }
  picnic(x: number, z: number, wood: string): void {
    this.box(1.8, 0.08, 0.75, wood, x, G + 0.75, z);
    for (const s of [-0.62, 0.62]) this.box(1.8, 0.06, 0.28, wood, x, G + 0.44, z + s);
    for (const s of [-0.7, 0.7]) {
      const l = this.box(0.08, 0.9, 0.08, shade(wood, 0.85), x + s, G + 0.4, z);
      l.rotation.x = 0.0;
    }
  }

}

/** A low-poly heightfield: y = f(x, z), from z0 (near) to z1 (far), `w` wide. */
function terrain(k: Kit, color: string, f: (x: number, z: number) => number, z0: number, z1: number, w = 90, nx = 46, nz = 24): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, z0 - z1, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + (z0 + z1) / 2;
    pos.setXYZ(i, x + rr(-0.2, 0.2), f(x, z), z);
  }
  const m = new THREE.Mesh(faceted(geo), toon(color));
  m.position.z = 0;
  k.g.add(m);
  return m;
}
const smooth = (a: number, b: number, t: number) => {
  const u = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

function buildRaw(g: THREE.Group, kind: Backdrop): Built {
  const k = new Kit(g);
  seed = 11;
  const edge = -8;
  if (kind === "mountains") {
    k.ground("#9cc77a", G, NEAR_Z, edge - 1);
    k.fence(edge + 0.3, -15, 15, "#8a6a4a", "rail");
    k.signpost(-5.4, edge + 0.9, "#5b7f5a");
    k.picnic(5.6, edge + 1.4, "#a87b4f");
    // Behind: forested slopes rising out of the meadow, a notch between them, a peak beyond.
    const f = (x: number, z: number) => G - 0.1 + smooth(-10, -40, z) * (3.2 + Math.sin(x * 0.12 + 0.6) * 2.2 + Math.sin(x * 0.35) * 0.5) + smooth(-30, -60, z) * 3;
    terrain(k, "#7fae63", f, edge - 0.5, -70);
    for (let i = 0; i < 150; i++) {
      const z = rr(-12, -46);
      const x = rr(-1, 1) * (12 - z * 0.45);
      const y = f(x, z);
      if (y < G + 0.2 && rnd() < 0.6) continue;
      k.pine(x, z, rr(1.6, 2.6) * (1 + -z * 0.01), rnd() < 0.5 ? "#2f6b4f" : "#3b7d5a", z > -20 ? 1.02 : false, y - 0.1);
    }
    for (const [x, h, w] of [[-4, 9, 9], [12, 7, 7]] as const) {
      k.cone(w, h, "#8aa0b4", x, f(x, -66) + h / 2 - 1, -66, 6, false);
      k.cone(w * 0.33, h * 0.33, "#f4f7f8", x, f(x, -66) + h - 1 - h * 0.16, -65.6, 6, false);
    }
    return { background: sky("#9fd3e8", "#dcecf2"), fog: new THREE.Fog(grade("#dcecf2"), 38, 162) };
  }
  if (kind === "beach") {
    k.ground("#e9d6a2", G, NEAR_Z, edge - 1);
    k.fence(edge + 0.3, -15, 15, "#a98a5a", "rope");
    for (let i = 0; i < 14; i++) {
      const x = rr(-12, 12);
      for (let j = 0; j < 4; j++) k.cone(0.05, rr(0.5, 0.8), "#9cae6a", x + j * 0.08, G + 0.3, edge + rr(0.4, 1.4), 3, false).rotation.z = (j - 1.5) * 0.25;
    }
    k.palm(-7.2, edge + 1, 4.4, 0.25);
    k.signpost(5.6, edge + 0.9, "#3fa7a0");
    // Beach down to the sea, a headland on the right with the lighthouse, an island, sails.
    const f = (x: number, z: number) => G - 0.2 - smooth(-9, -16, z) * 0.6 + smooth(4, 14, x) * smooth(-14, -26, z) * smooth(-60, -34, z) * 3.6;
    terrain(k, "#ecd9a8", f, edge - 0.5, -60, 90, 60, 30);
    k.ground("#4eb0d0", G - 0.55, -15, -200, 300);
    k.ground("#8ad0e4", G - 0.5, -15, -17);
    // Scrub on the headland.
    for (let i = 0; i < 22; i++) {
      const x = rr(9, 26), z = rr(-24, -46);
      const y = f(x, z);
      if (y > G + 0.3) k.ball(rr(0.3, 0.55), rnd() < 0.5 ? "#8fb86a" : "#7aa65a", x, y + 0.15, z, false, 0);
    }
    const lx = 10, lz = -44, ly = f(lx, lz);
    k.cyl(0.7, 0.95, 5, "#faf6ee", lx, ly + 2.5, lz, 10, 1.02);
    for (const y of [1, 2.6, 4.1]) k.cyl(0.78, 0.92 - y * 0.035, 0.6, "#e5604f", lx, ly + y, lz, 10, false);
    k.cyl(0.5, 0.5, 0.6, "#fff1c2", lx, ly + 5.3, lz, 8, false);
    k.cone(0.75, 0.6, "#e5604f", lx, ly + 5.9, lz, 8);
    k.box(1.2, 1.1, 1.2, "#faf6ee", lx - 1.3, ly + 0.55, lz, 1.02);
    for (const [x, z, c] of [[-6, -30, "#faf6ee"], [-1, -48, "#f3a33d"], [-14, -42, "#faf6ee"]] as const) {
      k.box(1.4, 0.35, 0.45, "#faf6ee", x, G - 0.4, z, false);
      const sail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, 0), new THREE.Vector3(1.1, 0, 0)]);
      const m = k.put(sail, c, x - 0.2, G - 0.2, z, false);
      (m.material as THREE.Material).side = THREE.DoubleSide;
    }
    k.put(new THREE.SphereGeometry(7, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), "#9fb7a8", -22, G - 0.6, -90, false).scale.y = 0.4;
    return { background: sky("#8fd6f0", "#e6f4f4"), fog: new THREE.Fog(grade("#e6f4f4"), 42, 288) };
  }
  if (kind === "desert") {
    // A step darker than the haze, so the customers stand out against it.
    k.ground("#d49a62", G, NEAR_Z, edge - 1);
    k.fence(edge + 0.3, -15, 15, "#8a6a4a", "rail");
    k.saguaro(-7, edge + 1.2, 3.2);
    k.agave(6, edge + 1, 1);
    k.rock(8.5, edge + 1.3, 0.5, "#c4623a");
    k.signpost(4.2, edge + 0.9, "#b8483a");
    // Sparse sage scrub along the fence line.
    const scrub: [number, number, number][] = [[-11.5, 1.1, 0.3], [-3.2, 1.5, 0.22], [2.1, 0.8, 0.26], [10.8, 1.6, 0.32], [13.2, 0.9, 0.24]];
    for (const [x, dz, r] of scrub) k.bush(x, edge + dz, r, "#8fa37a");
    // Desert floor running to cliffs: mesas in red bands, buttes in the gaps, an arch.
    terrain(k, "#dca476", (x, z) => G - 0.1 + smooth(-12, -40, z) * Math.sin(x * 0.4) * 0.3, edge - 0.5, -120, 120, 40, 20);
    const strata = ["#b8553a", "#d98a5f", "#c4623a", "#e0a070"];
    const mesa = (x: number, z: number, w: number, h: number, d: number) => {
      for (let s = 0; s < 4; s++) {
        const y0 = G - 0.2 + (s * h) / 4;
        const taper = 1 - s * 0.05;
        k.box(w * taper, h / 4 + 0.02, d * taper, strata[s], x, y0 + h / 8, z, z > -30 ? 1.01 : false);
      }
      k.box(w * 0.82 + 0.4, 0.4, d * 0.82 + 0.4, "#a94f2e", x, G - 0.2 + h, z, false);
      // Scree at the foot.
      k.put(new THREE.CylinderGeometry(w * 0.55, w * 0.62, 0.9, 6), "#d98a5f", x, G + 0.25, z + d * 0.1, false).scale.z = 0.5;
    };
    mesa(-16, -26, 10, 6, 5);
    mesa(13, -30, 12, 7, 6);
    mesa(-2, -52, 9, 9, 6);
    mesa(30, -60, 10, 10, 6);
    mesa(-34, -58, 12, 9, 6);
    const arch = k.put(new THREE.TorusGeometry(2.2, 0.75, 6, 14, Math.PI), "#c4623a", 3.5, G + 2.2, -36, 1.01);
    arch.scale.set(1, 1.25, 1);
    k.box(1.5, 2.6, 1.5, "#c4623a", 1.3, G + 1.1, -36, 1.01);
    k.box(1.5, 2.6, 1.5, "#c4623a", 5.7, G + 1.1, -36, 1.01);
    for (let i = 0; i < 10; i++) k.bush(rr(-14, 14), rr(-12, -22), rr(0.2, 0.35), "#9aa86a", false);
    // A clear desert blue above a warm horizon, so the mesas stand against blue rather than peach,
    // and the haze starts further back so the near mesas keep their red.
    return { background: sky("#8ec3dc", "#f3dcc0"), fog: new THREE.Fog(grade("#f3dcc0"), 70, 234) };
  }
  // Orchard Isle
  k.ground("#a8c97a", G, NEAR_Z, edge - 1);
  k.fence(edge + 0.3, -15, 15, "#f2ede2", "picket");
  k.signpost(5.4, edge + 0.9, "#6f9a6a");
  k.crate(7.6, edge + 1, "#d9443a");
  k.box(0.9, 0.85, 0.7, "#c79a62", 7.6, G + 0.42, edge + 1, false);
  // A hillside of orchard rows rising behind, a barn and a windmill on it, fields in strips.
  const f = (x: number, z: number) => G - 0.1 + smooth(-10, -36, z) * (2.4 + Math.sin(x * 0.15 - 0.4) * 1.4) + smooth(-36, -70, z) * 2.5;
  const hill = terrain(k, "#9cc36a", f, edge - 0.5, -80, 100, 50, 30);
  // Strips of crop colour on the hill: vertex colours by row.
  {
    const geo = hill.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    const cols: number[] = [];
    const pal = ["#9cc36a", "#b9d27a", "#d8c97a", "#a8c97a", "#c9b0c4"].map((c) => grade(c));
    for (let i = 0; i < pos.count; i += 3) {
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const c = pal[Math.abs(Math.floor(z / 5) * 3 + Math.floor((x + 100) / 13)) % pal.length];
      for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    hill.material = toon("#ffffff", { vertexColors: true });
  }
  for (let r = 0; r < 7; r++) for (let i = -10; i <= 10; i++) {
    const z = -11 - r * 2.4;
    const x = (i * 1.7 + (r % 2) * 0.85) * (1 + r * 0.1);
    if (x > 6 && x < 14 && r > 3) continue;
    k.appleTree(x, z, 1.4, r < 4 ? "#d9443a" : "", r < 2 ? 1.02 : false, f(x, z) - 0.05);
  }
  const bx = 10, bz = -32, by = f(bx, bz);
  k.box(3.2, 2.4, 2.4, "#b8483a", bx, by + 1.2, bz, 1.01);
  const roof = k.cyl(1.9, 1.9, 2.6, "#7a3a32", bx, by + 2.4, bz, 3, false);
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  roof.scale.set(1, 1, 0.6);
  k.box(1, 1.5, 0.1, "#f2ede2", bx, by + 0.75, bz + 1.22, false);
  const mx = -9, mz = -34, my = f(mx, mz);
  k.cyl(0.45, 0.8, 4.4, "#f2ede2", mx, my + 2.2, mz, 8, 1.01);
  k.cone(0.7, 0.9, "#7a3a32", mx, my + 4.8, mz, 8, false);
  for (let b = 0; b < 4; b++) {
    const geo = new THREE.BoxGeometry(0.4, 3, 0.06);
    geo.translate(0, 1.5, 0);
    const bl = k.put(geo, "#e8dccb", mx, my + 4.1, mz + 0.85, false);
    bl.rotation.z = b * (Math.PI / 2) + 0.4;
  }
  return { background: sky("#a9d8e6", "#e6f1ea"), fog: new THREE.Fog(grade("#e6f1ea"), 38, 216) };
}

/**
 * Build the view for an area into `g`, then bake it: everything out there is static, so its
 * hundreds of primitives merge into a few vertex-coloured meshes and one outline (a handful of
 * draw calls instead of 500-600; review of build #78, P1-3).
 */
export function buildScenery(g: THREE.Group, kind: Backdrop): Built {
  const b = buildRaw(g, kind);
  bakeStatic(g);
  return b;
}

