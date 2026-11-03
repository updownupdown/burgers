import * as THREE from "three";
import { SAUCE_RADIUS } from "../game/types";
import { bakedMesh, Parts, rng } from "./bake";
import { faceted } from "./materials";

/*
 * Pesto as a hand-spread sauce (after build #82: "looks too symmetrical"). Where the squeezy
 * sauces draw an even tube along the finger's line, pesto is laid down as overlapping dabs along
 * that line: each a lumpy, wobbly-edged disc of its own size, stretch, thickness and shade, some
 * pushed off to one side so the edge goes in and out, the whole spread nudged a little off the
 * line, with flecks of basil, pine nut and oil on top. Everything is seeded by the piece and by
 * how far along the line a dab is, so a spread stays put as it grows and on every redraw, and no
 * two pieces match. One merged mesh, no outline (like the other sauces).
 */

/** Dab outlines: a few lumpy discs, each 1 across and 1 tall (domed), shared by every spread. */
const DABS: THREE.BufferGeometry[] = [0, 1, 2, 3].map((v) => {
  const r = rng(71 + v * 13);
  const ph = [r() * 6, r() * 6, r() * 6];
  const g = new THREE.CylinderGeometry(1, 1, 1, 11, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.16 * Math.sin(2 * a + ph[0]) + 0.1 * Math.sin(3 * a + ph[1]) + 0.07 * Math.sin(5 * a + ph[2]);
    const rr = Math.hypot(x, z);
    // A soft dome: the top is highest a little off centre, the rim low.
    const top = y > 0 ? 0.5 + 0.3 * (1 - rr * rr) + 0.1 * Math.sin(a + ph[0]) * rr : -0.5;
    pos.setXYZ(i, x * k, top + 0.5, z * k);
  }
  // Smooth normals (not faceted): a sauce is glossy, and facets on dozens of dabs read as leaves.
  g.computeVertexNormals();
  return g.toNonIndexed();
});
const FLECK = faceted(new THREE.IcosahedronGeometry(1, 0));
const SHEEN = faceted(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));

/** Each spread is one of these greens, its dabs a shade either side. */
const GREENS = ["#4d8a2c", "#548f30", "#4a8530"];
const SHADE = 0.025;
/** Spacing of dabs along the line, in ingredient units. */
const STEP = 0.055;

/** The spread for a pesto piece's stroke (x, z in the piece's own units), seeded by `seed`. */
export function pestoSpread(pts: readonly { x: number; z: number }[], seed: number): THREE.Mesh {
  const p = new Parts();
  const base = rng(seed * 2654435761);
  const ox = (base() - 0.5) * 0.08;
  const oz = (base() - 0.5) * 0.08;
  const green = new THREE.Color(GREENS[Math.floor(base() * GREENS.length)]);
  const hsl = green.getHSL({ h: 0, s: 0, l: 0 });
  // Walk the line at even steps so a dab's place (and its seed) never changes as the line grows.
  const at: { x: number; z: number; dx: number; dz: number }[] = [];
  if (pts.length === 1) at.push({ x: pts[0].x, z: pts[0].z, dx: 1, dz: 0 });
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    for (let d = carry; d <= len; d += STEP) at.push({ x: a.x + dx * d, z: a.z + dz * d, dx, dz });
    carry = (((carry - len) % STEP) + STEP) % STEP;
  }
  if (!at.length && pts.length) at.push({ x: pts[0].x, z: pts[0].z, dx: 1, dz: 0 });
  at.forEach((q, i) => {
    const r = rng((seed * 7919 + i * 104729) >>> 0);
    const dab = (off: number, size: number) => {
      const w = SAUCE_RADIUS * (1.15 + r() * 0.6) * size;
      const stretch = 1.1 + r() * 0.5;
      const h = 0.018 + r() * 0.03;
      const yaw = Math.atan2(-q.dz, q.dx) + (r() - 0.5) * 0.7;
      const x = q.x + ox - q.dz * off;
      const z = q.z + oz + q.dx * off;
      const col = new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.02, hsl.s, hsl.l + (r() - 0.5) * SHADE);
      p.add(DABS[Math.floor(r() * DABS.length)], col, { p: [x, 0.012 + r() * 0.006, z], r: [0, yaw, 0], s: [w * stretch, h, w], ink: false });
      return h;
    };
    const h = dab((r() - 0.5) * 0.05, 1);
    // Now and then a smear pushed out to one side: the edge of a knife-spread goes in and out.
    if (r() < 0.38) dab((r() < 0.5 ? -1 : 1) * SAUCE_RADIUS * (0.7 + r() * 0.6), 0.55 + r() * 0.3);
    // Flecks on top: dark basil, a pale crumb of pine nut or cheese, a glint of oil.
    const f = r();
    const fx = q.x + ox + (r() - 0.5) * SAUCE_RADIUS * 1.4;
    const fz = q.z + oz + (r() - 0.5) * SAUCE_RADIUS * 1.4;
    // The dab tops out at about 1.4 of its height (DABS are domed).
    const fy = 0.012 + h * 1.4 + 0.002;
    if (f < 0.5) p.add(FLECK, f < 0.35 ? "#24461a" : "#2f5a1f", { p: [fx, fy, fz], r: [0, r() * 3, 0], s: [0.022 + r() * 0.012, 0.006, 0.015], ink: false });
    else if (f < 0.66) p.add(FLECK, "#f1e6bc", { p: [fx, fy, fz], r: [0, r() * 3, 0], s: [0.018, 0.007, 0.013], ink: false });
    else if (f < 0.75) p.add(SHEEN, "#a9c45a", { p: [fx, fy - 0.002, fz], r: [0, r() * 3, 0], s: [0.03 + r() * 0.02, 1, 0.02], ink: false });
  });
  // No shadow: a sauce this thin only speckles itself.
  return bakedMesh(p.bake(), { shadow: false });
}
