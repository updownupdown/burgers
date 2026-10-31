import { eventOn, REGIONS, STOPS, townById, type RegionId } from "../game/stops";
import { unlockProgress } from "../game/travel";

/**
 * The road map as an illustrated SVG: an island in the Sorbet palette with "Pencil Line"
 * outlines (each shape's own colour pulled toward ink), soft region shapes clipped to the
 * coastline, little pines, peaks, cacti, mesas and palms scattered where they don't get in the
 * way, a river and lake in the hills, farm fields in the open country, a few houses around each
 * town, winding roads between town nodes (heavier highways between regions), and the truck
 * parked on the current town. Locked regions are greyed and cross-hatched like fog on a paper map.
 *
 * Everything is in map units: towns live on a 0..100 by 0..140 grid (stops.ts) and the drawing
 * extends ten units past it on every side for sea.
 */

export const VIEW = { x: -10, y: -10, w: 120, h: 160 };

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Colour: the Sorbet palette, and the Pencil Line rule for outlines (see render/materials.ts)

const INK = "#3b2a3a";
export const SEA = "#a9cfe0";
const LAND = "#efe6d8";
const CREAM = "#faf3e6";
const REGION_FILL: Record<RegionId, string> = { mountains: "#bcd8a6", coast: "#f3dba8", desert: "#f2b793" };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Outline colour for a fill: darkened, a touch more saturated and cooler, then 55% toward ink. */
export function line(fill: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(fill));
  if (l < 0.22) return INK;
  const [r, g, b] = hslToRgb((h - 0.025 + 1) % 1, Math.min(1, s * 1.1 + 0.1), Math.max(0.12, l * 0.38));
  return mix(rgbToHex(r, g, b), INK, 0.55);
}

// ---------------------------------------------------------------------------
// Geometry helpers

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** A closed (or open) Catmull-Rom curve through the points, as a path. */
function smooth(pts: Pt[], closed = true, k = 1): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + " Z" : d;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hand-placed outlines get a little wobble: a jittered midpoint between every pair of points. */
function wobble(pts: Pt[], amount: number, seed: number): Pt[] {
  const r = seeded(seed);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a, [(a[0] + b[0]) / 2 + (r() - 0.5) * amount * 2, (a[1] + b[1]) / 2 + (r() - 0.5) * amount * 2]);
  }
  return out;
}

function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

function polyDist(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

// ---------------------------------------------------------------------------
// The land

/**
 * Coastline, clockwise from the north-west. Hand placed so it reads like real country: a
 * river mouth between the hills and the coast, Saltwater Bay biting into the north shore, the
 * Gull Point headland, a little harbour notch under Harbor City, and the desert's cape.
 */
const ISLAND: Pt[] = [
  [17, -4], [29, -6.5], [41, -5], [51, -1.5], [57, 5], [59.5, 14], [58, 23], [59.5, 31], [57, 37], [53, 39.5],
  [55.5, 43.5], [61, 44.5], [67, 43], [72.5, 44.5], [77, 47.5], [81.5, 48.5], [86, 46.5], [90, 43], [96, 43.5], [101, 48.5],
  [103.5, 56], [104, 62], [108, 64.5], [111, 68.5], [108.5, 73.5], [104.5, 76], [103.5, 83], [99.5, 89.5], [94, 94],
  [88.5, 97], [85, 95], [81.5, 97.5], [75, 96.5], [67, 98.5], [61, 102.5], [57.5, 110], [55.5, 119], [54, 128],
  [50, 135.5], [43, 140.5], [37.5, 146.5], [31, 145], [24.5, 147], [17, 144.5], [11, 139], [6.5, 131], [3, 122],
  [1.5, 113], [2.5, 104], [5.5, 96], [6.5, 89], [3.5, 81], [1.5, 71], [3, 62], [0.5, 54], [3.5, 48.5], [1, 41],
  [0, 31], [1.5, 20], [4, 10], [9.5, 1.5],
];
const REGION_SHAPE: Record<RegionId, Pt[]> = {
  mountains: [[-12, -12], [66, -12], [66, 32], [60, 40], [48, 54], [30, 61], [10, 58], [-12, 52]],
  coast: [[57, 46], [80, 40], [114, 48], [116, 82], [106, 102], [84, 106], [64, 104], [53, 90], [51, 64]],
  desert: [[-12, 83], [14, 79], [36, 83], [52, 95], [61, 112], [58, 136], [40, 152], [8, 152], [-12, 132]],
};
/** Where each region's name sits, out in the sea like a cartographer would. */
const REGION_LABEL: Record<RegionId, { x: number; y: number; anchor: "start" | "end" }> = {
  mountains: { x: 63, y: 30, anchor: "start" },
  coast: { x: 104, y: 110, anchor: "end" },
  desert: { x: 60, y: 128, anchor: "start" },
};

/** The river that feeds Cedar Falls' lake and runs out to sea at the inlet. */
const RIVER: Pt[] = [[46.5, 1.5], [47.5, 6], [49.8, 10.5], [50.2, 15], [51.4, 18]];
const RIVER_OUT: Pt[] = [[52.6, 22.6], [54.2, 27], [53.6, 31.5], [54.8, 35.5], [54, 39.6]];
const LAKE = { x: 51.6, y: 20.2, rx: 3.9, ry: 2.7, rot: -18 };

const towns = STOPS.map((t) => [t.x, t.y] as Pt);
/** Towns whose event flag goes on the left, clear of the lake. */
const FLAG_LEFT = new Set(["cedarfalls"]);

// ---------------------------------------------------------------------------
// Roads: each road is a smooth curve through a few points that bow and sway off the straight
// line, seeded by the pair of towns so the map is the same every time and a road looks the same
// whichever way it's driven. Roads between regions are highways, drawn a little heavier.

const ROADS: [string, string][] = STOPS.flatMap((t) => t.roads.map((r) => [t.id, r] as [string, string]));
const roadKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Hand-tuned bends (fractions of the road's length): `bow` swings the middle, `s` makes an S. */
const ROAD_TUNE: Record<string, { bow: number; s: number }> = {
  [roadKey("summit", "saltwater")]: { bow: 0.07, s: -0.05 },
  [roadKey("harbor", "redmesa")]: { bow: -0.1, s: 0.04 },
  [roadKey("pinecrest", "cedarfalls")]: { bow: -0.12, s: 0.03 },
  [roadKey("pinecrest", "elkpass")]: { bow: 0.08, s: -0.06 },
  [roadKey("elkpass", "summit")]: { bow: 0.1, s: 0.05 },
  [roadKey("cedarfalls", "summit")]: { bow: -0.07, s: -0.06 },
  [roadKey("saltwater", "gullpoint")]: { bow: -0.11, s: 0.03 },
  [roadKey("saltwater", "driftwood")]: { bow: 0.1, s: -0.04 },
  [roadKey("gullpoint", "harbor")]: { bow: -0.09, s: -0.05 },
  [roadKey("driftwood", "harbor")]: { bow: 0.06, s: 0.07 },
  [roadKey("redmesa", "cactus")]: { bow: 0.12, s: 0.02 },
  [roadKey("redmesa", "dustbowl")]: { bow: -0.08, s: 0.06 },
  [roadKey("cactus", "sunvalley")]: { bow: 0.11, s: -0.05 },
  [roadKey("dustbowl", "sunvalley")]: { bow: -0.1, s: 0.04 },
};

const roadCache = new Map<string, Pt[]>();

/** Points along the road from `a` to `b`, in map units, both ends on the towns. */
export function roadPoints(a: string, b: string): Pt[] {
  const key = roadKey(a, b);
  let pts = roadCache.get(key);
  if (!pts) {
    const [p, q] = key.split("|").map(townById);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const r = seeded(key.split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
    const tune = ROAD_TUNE[key] ?? { bow: (r() - 0.5) * 0.22, s: (r() - 0.5) * 0.1 };
    const n = Math.max(3, Math.round(len / 6));
    pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // A gentle bow and S, plus a small hand-drawn sway that fades out at the towns.
      const sway = i === 0 || i === n ? 0 : (r() - 0.5) * 0.9 * Math.sin(Math.PI * t);
      const off = len * (tune.bow * Math.sin(Math.PI * t) + tune.s * Math.sin(2 * Math.PI * t)) + sway;
      pts.push([p.x + dx * t + nx * off, p.y + dy * t + ny * off]);
    }
    roadCache.set(key, pts);
  }
  return key.startsWith(a + "|") ? pts : [...pts].reverse();
}

/** Points along a whole route (towns in order), following the drawn curves closely enough to animate along. */
export function routePoints(path: readonly string[]): Pt[] {
  const out: Pt[] = [];
  for (let h = 1; h < path.length; h++) {
    const pts = roadPoints(path[h - 1], path[h]);
    const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let k = h > 1 && i === 0 ? 1 : 0; k < 4; k++) {
        // Uniform Catmull-Rom, the same curve smooth() draws.
        const t = k / 4;
        const t2 = t * t;
        const t3 = t2 * t;
        const c = (a: number, b: number, c2: number, d: number) => 0.5 * (2 * b + (c2 - a) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (3 * b - a - 3 * c2 + d) * t3);
        out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
  }
  return out;
}

/** Road between two towns as path data, in map units. */
export function roadPath(a: string, b: string): string {
  return smooth(roadPoints(a, b), false);
}

/** Roads between regions: the highways. */
const isHighway = (a: string, b: string) => townById(a).region !== townById(b).region;

function nearRoad(p: Pt, pad: number): boolean {
  for (const [a, b] of ROADS) {
    const pts = roadPoints(a, b);
    for (let i = 1; i < pts.length; i++) if (segDist(p, pts[i - 1], pts[i]) < pad) return true;
  }
  return false;
}

function nearTown(p: Pt, pad: number): boolean {
  return towns.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1] + 2) < pad);
}

function inLake(p: Pt, pad: number): boolean {
  return Math.hypot((p[0] - LAKE.x) / (LAKE.rx + pad), (p[1] - LAKE.y) / (LAKE.ry + pad)) < 1;
}

function nearRiver(p: Pt, pad: number): boolean {
  for (const line of [RIVER, RIVER_OUT]) for (let i = 1; i < line.length; i++) if (segDist(p, line[i - 1], line[i]) < pad) return true;
  return false;
}

/** Spots for little drawings: inside `poly` (and the island when `land`), clear of towns, roads and each other. */
function scatter(poly: Pt[], n: number, seed: number, land: boolean, gap: number, extra?: (p: Pt) => boolean): Pt[] {
  const r = seeded(seed);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(VIEW.x + 3, Math.min(...xs));
  const x1 = Math.min(VIEW.x + VIEW.w - 3, Math.max(...xs));
  const y0 = Math.max(VIEW.y + 3, Math.min(...ys));
  const y1 = Math.min(VIEW.y + VIEW.h - 3, Math.max(...ys));
  const out: Pt[] = [];
  for (let tries = 0; tries < n * 60 && out.length < n; tries++) {
    const p: Pt = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (!inPoly(p, poly)) continue;
    if (land) {
      if (!inPoly(p, ISLAND) || polyDist(p, ISLAND) < 3.5) continue;
      if (nearTown(p, 9) || nearRoad(p, 4.2) || inLake(p, 2.5) || nearRiver(p, 2.6)) continue;
    } else if (inPoly(p, ISLAND) || polyDist(p, ISLAND) < 4) continue;
    if (extra && !extra(p)) continue;
    if (out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
    out.push(p);
  }
  return out;
}

/**
 * Outlying houses around each town, so places read as settlements rather than dots: a few
 * for a town, more for a big city, tucked off the roads and clear of the town's name.
 */
function hamlets(): Record<RegionId, string> {
  const out: Record<RegionId, string> = { mountains: "", coast: "", desert: "" };
  for (const t of STOPS) {
    const r = seeded(t.x * 131 + t.y * 7);
    const want = t.capital ? 6 : 3;
    const placed: Pt[] = [];
    for (let tries = 0; tries < 200 && placed.length < want; tries++) {
      const ang = r() * Math.PI * 2;
      const dist = (t.capital ? 4.6 : 4.2) + r() * (t.capital ? 3.8 : 2.6);
      const p: Pt = [t.x + Math.cos(ang) * dist, t.y + Math.sin(ang) * dist * 0.85];
      // Keep the name (below the node) and the flag/lock (above) clear.
      if (Math.abs(p[0] - t.x) < 8 && p[1] > t.y + 1.5 && p[1] < t.y + 9.5) continue;
      if (Math.abs(p[0] - t.x) < 4 && p[1] < t.y - 2 && p[1] > t.y - 8) continue;
      if (!inPoly(p, ISLAND) || polyDist(p, ISLAND) < 2.2 || inLake(p, 0.8) || nearRiver(p, 1.4) || nearRoad(p, 2.4)) continue;
      if (towns.some((o) => (o[0] !== t.x || o[1] !== t.y) && Math.hypot(o[0] - p[0], o[1] - p[1]) < 9)) continue;
      if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2.1)) continue;
      placed.push(p);
    }
    out[t.region] += placed.map((p, i) => house(p[0], p[1], 0.8 + ((i * 37) % 5) * 0.06, (i + t.x) % 2 === 0)).join("");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Little drawings

const PINE = "#8fbf7a";
const PEAK = "#d6cfe3";
const CACTUS = "#7aa86a";
const PALM = "#7fb36e";
const TRUNK = "#b8865a";
const MESA = "#e2a77a";
const CORAL = "#ff8a70";
const MUSTARD = "#f3c45a";
const ROOF = "#c8735a";

const g = (x: number, y: number, s: number, inner: string, cls = "") => `<g class="${cls}" transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">${inner}</g>`;

const pine = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M0 3v1.3" stroke="${TRUNK}" stroke-width="0.6"/><path d="M0 -3.4 L2.1 0.1 L1 0.1 L2.7 3 L-2.7 3 L-1 0.1 L-2.1 0.1 Z" fill="${PINE}" stroke="${line(PINE)}" stroke-width="0.35"/>`);
const peak = (x: number, y: number, s: number) =>
  g(
    x,
    y,
    s,
    `<path d="M-4.8 3.2 L-1.3 -3.6 L0.3 -1.4 L1.7 -3.8 L4.9 3.2 Z" fill="${PEAK}" stroke="${line(PEAK)}" stroke-width="0.4"/><path d="M-1.3 -3.6 L-0.5 -2 L0.3 -1.4 L1 -2.4 L1.7 -3.8 L2.5 -2 L1.5 -1.5 L0.6 -0.2 L-0.5 -0.9 L-1.6 -1.6 L-2.1 -2.3 Z" fill="${CREAM}"/>`,
  );
const cactus = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M0 3V-3.4M-2 -0.6V-2M-2 -0.6H0M2 0.6V-1M2 0.6H0" fill="none" stroke="${CACTUS}" stroke-width="1.15"/><path d="M-1.6 3.2h3.2" stroke="${line(MESA)}" stroke-width="0.3" opacity="0.5"/>`);
const palm = (x: number, y: number, s: number) =>
  g(
    x,
    y,
    s,
    `<path d="M0 3Q0.7 0.2 -0.3 -2.5" fill="none" stroke="${TRUNK}" stroke-width="0.55"/><path d="M-0.3 -2.5q-2.5 -0.5 -3.5 1.3M-0.3 -2.5q2.3 -0.9 3.5 0.9M-0.3 -2.5q-1.1 -2.1 -2.9 -2.3M-0.3 -2.5q1.2 -2.1 2.7 -2" fill="none" stroke="${PALM}" stroke-width="0.6"/>`,
  );
const mesa = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M-4.4 3 L-2.8 -1.6 H2.6 L4.4 3 Z" fill="${MESA}" stroke="${line(MESA)}" stroke-width="0.4"/><path d="M-3.2 0.6h6.2M-3.8 1.9h7.4" stroke="${line(MESA)}" stroke-width="0.25" opacity="0.5"/>`);
const wave = (x: number, y: number, s: number) => g(x, y, s, `<path d="M-3 0q1.5 -1.7 3 0t3 0" fill="none" stroke="${line(SEA)}" stroke-width="0.45" opacity="0.5"/>`);
const boat = (x: number, y: number, s: number, flip = false) =>
  g(
    x,
    y,
    s,
    `<g${flip ? ' transform="scale(-1 1)"' : ""}><path d="M-2.6 0.6H2.6L1.7 2.1H-1.7Z" fill="${CORAL}" stroke="${line(CORAL)}" stroke-width="0.35"/><path d="M0 0.6V-3.2" stroke="${line(CREAM)}" stroke-width="0.35"/><path d="M0.25 -3.1 L2.7 0.3 H0.25 Z" fill="${CREAM}" stroke="${line(CREAM)}" stroke-width="0.3"/><path d="M-0.25 -2.6 L-2 0.3 H-0.25 Z" fill="${MUSTARD}" stroke="${line(MUSTARD)}" stroke-width="0.3"/></g>`,
  );

/** A little house for the outskirts of a town, roof one way or the other. */
const house = (x: number, y: number, s: number, flip: boolean) =>
  g(
    x,
    y,
    s,
    `<path d="M-0.9 0.9V-0.2L${flip ? "-0.2" : "0.2"} -1.1L0.9 -0.2V0.9Z" fill="${CREAM}" stroke="${line(LAND)}" stroke-width="0.28" stroke-linejoin="round"/><path d="M-1.1 -0.1L${flip ? "-0.2" : "0.2"} -1.25L1.1 -0.1" fill="none" stroke="${ROOF}" stroke-width="0.42" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
/** A patch of farmland in the open country between the regions, furrows and all. */
const field = (x: number, y: number, rot: number, fill: string, w: number, h: number) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"><rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="0.3" fill="${fill}" stroke="${line(LAND)}" stroke-width="0.2" stroke-opacity="0.5"/>${[-1, 1]
    .map((i) => `<path d="M${f(-w / 2 + 0.6)} ${f((i * h) / 6)}H${f(w / 2 - 0.6)}" stroke="${line(fill)}" stroke-width="0.16" opacity="0.35"/>`)
    .join("")}</g>`;
const lighthouse = (x: number, y: number) =>
  g(
    x,
    y,
    1,
    `<path d="M-0.9 2.4L-0.55 -1.6H0.55L0.9 2.4Z" fill="${CREAM}" stroke="${line(CREAM)}" stroke-width="0.3"/><path d="M-0.75 0.6H0.75M-0.65 -0.5H0.65" stroke="${CORAL}" stroke-width="0.5"/><path d="M-0.7 -1.6H0.7L0 -2.6Z" fill="${CORAL}" stroke="${line(CORAL)}" stroke-width="0.25"/><path d="M0.7 -1.9L3 -2.6M0.7 -1.7L3 -1.1" stroke="${MUSTARD}" stroke-width="0.3" opacity="0.8"/>`,
  );

function compassRose(x: number, y: number): string {
  const ink = line(CREAM);
  return g(
    x,
    y,
    1,
    `<circle r="6.4" fill="${CREAM}" stroke="${ink}" stroke-width="0.4" opacity="0.9"/><circle r="4.6" fill="none" stroke="${ink}" stroke-width="0.25" stroke-dasharray="0.6 0.6"/>
    <path d="M0 -5.6 L1.1 0 L0 5.6 L-1.1 0 Z" fill="${INK}"/><path d="M-5.6 0 L0 -1.1 L5.6 0 L0 1.1 Z" fill="${CREAM}" stroke="${ink}" stroke-width="0.3"/><path d="M0 -5.6 L1.1 0 L0 0 Z" fill="${CORAL}"/>
    <text y="-6.6" class="compass">N</text>`,
    "home-compass",
  );
}

function scaleBar(x: number, y: number): string {
  const ink = line(CREAM);
  return g(
    x,
    y,
    1,
    `<path d="M0 0h20" stroke="${ink}" stroke-width="0.5"/><path d="M0 -1v2M10 -0.8v1.6M20 -1v2" stroke="${ink}" stroke-width="0.4"/><rect x="0" y="-0.5" width="10" height="1" fill="${ink}" opacity="0.7"/><text x="10" y="3.6" class="scale">60 mi</text>`,
    "home-scale",
  );
}

// ---------------------------------------------------------------------------
// Static scene (built once per page load)

let staticScene: string | null = null;

function river(): string {
  const ink = line(SEA);
  const inflow = smooth(RIVER, false);
  const outflow = smooth(RIVER_OUT, false);
  return `<g class="home-water">
    <path d="${inflow}" fill="none" stroke="${ink}" stroke-width="1.15" stroke-linecap="round" opacity="0.7"/>
    <path d="${outflow}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
    <path d="${inflow}" fill="none" stroke="${SEA}" stroke-width="0.6" stroke-linecap="round"/>
    <path d="${outflow}" fill="none" stroke="${SEA}" stroke-width="1" stroke-linecap="round"/>
    <ellipse cx="${LAKE.x}" cy="${LAKE.y}" rx="${LAKE.rx}" ry="${LAKE.ry}" transform="rotate(${LAKE.rot} ${LAKE.x} ${LAKE.y})" fill="${SEA}" stroke="${ink}" stroke-width="0.4"/>
    <path d="M${f(LAKE.x - 1.8)} ${f(LAKE.y + 0.2)}q0.9 -0.8 1.8 0t1.8 0" fill="none" stroke="${ink}" stroke-width="0.25" opacity="0.5"/>
  </g>`;
}

function buildStatic(): string {
  const island = smooth(wobble(ISLAND, 0.6, 7));
  const regions = REGIONS.map((r) => {
    const shape = smooth(wobble(REGION_SHAPE[r.id], 1.2, 11 + r.id.length));
    return `<g class="home-region" data-region="${r.id}"><path class="fill" d="${shape}" fill="${REGION_FILL[r.id]}"/><path class="fog" d="${shape}"/><path class="edge" d="${shape}" fill="none" stroke="${line(REGION_FILL[r.id])}" stroke-width="0.4" stroke-dasharray="1.6 1.3" opacity="0.5"/></g>`;
  }).join("");

  // Drawings per region, kept off the towns, roads and water.
  const deco: Record<RegionId, string> = { mountains: river(), coast: "", desert: "" };
  const houses = hamlets();
  for (const r of REGIONS) deco[r.id] += houses[r.id];
  const peaks: [number, number, number][] = [[36, 4.5, 1.05], [43, 1.5, 1.25], [5.5, 18, 0.8], [6.5, 41, 0.75], [11.5, 44, 0.6]];
  deco.mountains += peaks.map(([x, y, s]) => peak(x, y, s)).join("");
  const clearOf = (spots: [number, number, number][], pad: number) => (p: Pt) => spots.every(([x, y, s]) => Math.hypot(p[0] - x, p[1] - y) > pad * s);
  deco.mountains += scatter(REGION_SHAPE.mountains, 24, 3, true, 4, clearOf(peaks, 6.2))
    .map((p, i) => pine(p[0], p[1], 0.72 + (i % 3) * 0.12))
    .join("");
  deco.coast += lighthouse(108, 68.6);
  deco.coast += scatter(REGION_SHAPE.coast, 10, 5, true, 6, (p) => polyDist(p, ISLAND) < 9 && Math.hypot(p[0] - 108, p[1] - 68) > 5)
    .map((p, i) => palm(p[0], p[1], 0.85 + (i % 2) * 0.15))
    .join("");
  const mesas: [number, number, number][] = [[35, 91.5, 1], [7.5, 124, 0.85], [49, 125, 0.75]];
  deco.desert += mesas.map(([x, y, s]) => mesa(x, y, s)).join("");
  deco.desert += scatter(REGION_SHAPE.desert, 12, 9, true, 5, clearOf(mesas, 6.5))
    .map((p, i) => cactus(p[0], p[1], 0.7 + (i % 3) * 0.12))
    .join("");

  // Farmland in the open country between the regions, with the odd tree.
  // Each farm is a few fields side by side, turned to its own angle.
  const open = (p: Pt) => REGIONS.every((r) => !inPoly(p, REGION_SHAPE[r.id]) && polyDist(p, REGION_SHAPE[r.id]) > 4.5) && polyDist(p, ISLAND) > 6;
  const farms = [mix(LAND, PINE, 0.3), mix(LAND, MUSTARD, 0.32), mix(LAND, PINE, 0.16), mix(LAND, MESA, 0.2)];
  const fields = scatter(ISLAND, 4, 17, true, 12, open)
    .map((p, i) => {
      // A small patchwork: two or three plots in a row and sometimes a second row, a little uneven.
      const rot = ((i * 53) % 44) - 22;
      const a = (rot * Math.PI) / 180;
      const cols = 2 + (i % 2);
      const rows = i % 3 === 1 ? 1 : 2;
      const plots: string[] = [];
      for (let c = 0; c < cols; c++)
        for (let rr = 0; rr < rows; rr++) {
          const u = (c - (cols - 1) / 2) * 4.2;
          const v = (rr - (rows - 1) / 2) * 3.2;
          plots.push(field(p[0] + Math.cos(a) * u - Math.sin(a) * v, p[1] + Math.sin(a) * u + Math.cos(a) * v, rot, farms[(i + c * 2 + rr) % farms.length], 4.2, 3.2));
        }
      return plots.join("");
    })
    .join("");

  const waves = scatter([[VIEW.x, VIEW.y], [VIEW.x + VIEW.w, VIEW.y], [VIEW.x + VIEW.w, VIEW.y + VIEW.h], [VIEW.x, VIEW.y + VIEW.h]], 26, 21, false, 9, (p) => polyDist(p, ISLAND) < 34)
    .map((p, i) => wave(p[0], p[1], 0.8 + (i % 3) * 0.2))
    .join("");

  const labels = REGIONS.map((r) => {
    const l = REGION_LABEL[r.id];
    return `<text class="rname" data-region="${r.id}" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${r.name}</text>`;
  }).join("");

  return `
    <g class="home-sea">${waves}${boat(94, 24, 1)}${boat(70, 136, 0.9, true)}${boat(90, 104, 0.7)}${compassRose(94, 138)}${scaleBar(70, 146)}</g>
    <path d="${island}" fill="none" stroke="${mix(SEA, CREAM, 0.45)}" stroke-width="3.2" stroke-linejoin="round"/>
    <path class="home-land" d="${island}" fill="${LAND}" stroke="${line(LAND)}" stroke-width="0.7" stroke-linejoin="round"/>
    <g clip-path="url(#home-island)">${regions}</g>
    <path d="${island}" fill="none" stroke="${line(LAND)}" stroke-width="0.7" stroke-linejoin="round"/>
    <g class="home-fields">${fields}</g>
    ${REGIONS.map((r) => `<g class="home-deco" data-region="${r.id}">${deco[r.id]}</g>`).join("")}
    ${labels}`;
}

// ---------------------------------------------------------------------------
// The live map

export interface MapState {
  /** Where the truck is. */
  town: string;
  unlocked: readonly string[];
  shiftsIn: Record<string, number>;
  day: number;
  selected: string | null;
  /** Evening: the map goes dark and the roads the truck can still drive tonight are lit. */
  night: boolean;
  /** Towns a drive can reach right now without the day passing, with the road there. */
  reach: readonly { id: string; path: readonly string[] }[];
}

export function townPoint(id: string): Pt {
  const t = townById(id);
  return [t.x, t.y];
}

/** Whole map as an <svg> in map units; the pan/zoom layer scales it. */
export function renderMap(st: MapState): string {
  staticScene ??= buildStatic();
  const open = (id: string) => st.unlocked.includes(id);
  const regionOpen = (r: RegionId) => STOPS.some((t) => t.region === r && open(t.id));
  const lockedRegions = REGIONS.filter((r) => !regionOpen(r.id)).map((r) => r.id);

  // Casings first, so where roads meet at a town they join cleanly.
  const lit = ROADS.filter(([a, b]) => open(a) && open(b));
  const dark = ROADS.filter(([a, b]) => !(open(a) && open(b)));
  const cls = (a: string, b: string) => (isHighway(a, b) ? " hw" : "");
  const roads =
    dark.map(([a, b]) => `<path class="road locked${cls(a, b)}" d="${roadPath(a, b)}"/>`).join("") +
    lit.map(([a, b]) => `<path class="road-case${cls(a, b)}" d="${roadPath(a, b)}"/>`).join("") +
    lit.map(([a, b]) => `<path class="road${cls(a, b)}" d="${roadPath(a, b)}"/><path class="road-dash${cls(a, b)}" d="${roadPath(a, b)}"/>`).join("");

  const townsSvg = STOPS.map((t) => {
    const isOpen = open(t.id);
    const here = t.id === st.town;
    const { done, need } = unlockProgress(st.shiftsIn, t.id);
    const r = t.capital ? 3.1 : 2.5;
    const lit = st.night && st.reach.some((r) => r.id === t.id);
    const classes = ["home-town", isOpen ? "open" : "locked", here ? "here" : "", t.id === st.selected ? "sel" : "", t.capital ? "capital" : "", lit ? "lit" : ""].filter(Boolean).join(" ");
    const ev = eventOn(t.id, st.day);
    const soon = !ev && [1, 2].some((d) => eventOn(t.id, st.day + d));
    // The event flag flies to the upper right, or the upper left where water is in the way.
    const side = FLAG_LEFT.has(t.id) ? -1 : 1;
    const flag = ev || soon ? `<path class="flag ${ev ? "today" : "soon"}" transform="translate(${f(side * (r + 0.6))} ${f(-r - 0.2)}) scale(${side} 1)" d="M0 0.6V-4.2M0 -4.2h3.2l-0.9 1.2 0.9 1.2H0"/>` : "";
    const lock = !isOpen ? `<path class="lock" transform="translate(0 ${f(-r - 2.4)})" d="M-1.3 -0.2h2.6v2.4h-2.6zM-0.75 -0.2v-0.9a0.75 0.75 0 0 1 1.5 0v0.9"/>` : "";
    // Pips show the shifts worked toward opening this town's roads.
    const pips =
      isOpen && t.roads.length && done < need
        ? `<g class="pips" transform="translate(0 ${f(r + 6.1)})">${[0, 1, 2].map((i) => `<circle class="pip ${i < done ? "on" : ""}" cx="${f((i - 1) * 1.7)}" r="0.55"/>`).join("")}</g>`
        : "";
    const label = t.capital ? t.name.toUpperCase() : t.name;
    // The marker and its name keep a readable size on screen as the map zooms (see --mk in home.css).
    return `<g class="${classes}" data-town="${t.id}" transform="translate(${t.x} ${t.y})">
      <circle class="hit" r="7.5"/>
      <g class="mk">
        <circle class="halo" r="${f(r + 1.6)}"/>
        ${t.capital ? `<circle class="ring" r="${f(r + 1.2)}"/>` : ""}
        <circle class="node" r="${r}"/>
        ${t.capital ? `<circle class="core" r="1.1"/>` : ""}
        <text class="tname" y="${f(r + 3.7)}">${label}</text>
        ${pips}${flag}${lock}
      </g>
    </g>`;
  }).join("");

  const litRoads = st.night
    ? `<g class="home-reach">${st.reach.map((r) => `<path class="road reach" d="${r.path.slice(1).map((b, i) => roadPath(r.path[i], b)).join(" ")}"/>`).join("")}</g>`
    : "";
  const here = townById(st.town);
  const truck = `<g class="home-truck" style="transform:translate(${here.x}px, ${here.y}px)"><g class="mk">${truckSvg()}</g></g>`;

  return `<svg class="home-svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Road map">
    <defs>
      <clipPath id="home-island"><path d="${smooth(wobble(ISLAND, 0.9, 7))}"/></clipPath>
      <pattern id="home-hatch" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.1h2.2" stroke="${INK}" stroke-width="0.35" opacity="0.16"/></pattern>
    </defs>
    <g class="home-static ${lockedRegions.map((r) => `lock-${r}`).join(" ")}">${staticScene}</g>
    <g class="home-roads">${roads}</g>
    <rect class="home-night" x="${VIEW.x - 50}" y="${VIEW.y - 50}" width="${VIEW.w + 100}" height="${VIEW.h + 100}"/>
    ${litRoads}
    <path class="home-route" d=""/>
    <g class="home-towns">${townsSvg}</g>
    ${truck}
  </svg>`;
}

/** The truck, drawn above its town, facing right. */
function truckSvg(): string {
  const body = CORAL;
  const ink = line(body);
  return `<ellipse class="shadow" cx="0.3" cy="0.4" rx="4.8" ry="1.2"/>
  <g class="truck-body" transform="translate(0 -4.6)">
    <rect x="-5.4" y="-3.6" width="7.4" height="5.6" rx="0.9" fill="${body}" stroke="${ink}" stroke-width="0.45"/>
    <rect x="-5.7" y="-4.3" width="8" height="1.3" rx="0.4" fill="${MUSTARD}" stroke="${line(MUSTARD)}" stroke-width="0.35"/>
    <path d="M2 -2.6h2.4l1.9 2.2V2h-4.3z" fill="${mix(body, CREAM, 0.25)}" stroke="${ink}" stroke-width="0.45"/>
    <path d="M2.6 -2v1.7h2.9" fill="#bfe3f2" stroke="${ink}" stroke-width="0.3"/>
    <rect x="-4.4" y="-2.4" width="4" height="2" rx="0.3" fill="${CREAM}" stroke="${ink}" stroke-width="0.3"/>
    <circle cx="-3.2" cy="2.1" r="1.2" fill="${INK}"/><circle cx="-3.2" cy="2.1" r="0.45" fill="${CREAM}"/>
    <circle cx="3.6" cy="2.1" r="1.2" fill="${INK}"/><circle cx="3.6" cy="2.1" r="0.45" fill="${CREAM}"/>
  </g>`;
}
