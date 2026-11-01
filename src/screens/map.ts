import { mix } from "./ink";
import { truckGroup } from "./truckart";
import type { Look } from "../game/looks";
import { eventOn, REGIONS, STOPS, townById, type RegionId } from "../game/stops";
import { unlockProgress } from "../game/travel";
import "./map.css";

/**
 * The road map as a drawn paper map: an island on warm paper, the sea in a soft grey-blue with
 * the coast picked out by offset "bathymetric" rings, and the terrain told the way a
 * cartographer would rather than with cartoon scenery. Highlands get soft washes of green,
 * hachured ridges (short pencil strokes falling away from each crest, darker on the shadow
 * side), tiny tree symbols for forest and small peak marks for the summits. The coast is sand
 * coloured with a beach band, dune stipple and marsh marks at the river mouths. The desert is an
 * ochre wash with sand stipple, mesas drawn as cliff-edged plateaus and dry washes as dashed
 * blue lines. Towns get a few building blocks around them, fields a faint patchwork, and the
 * roads run as thin cased lines (highways a little wider, with a centre line). Locked regions
 * fade under a paper veil with a light survey hatch.
 *
 * Everything is in map units: towns live on a 0..100 by 0..140 grid (stops.ts) and the drawing
 * extends ten units past it on every side for sea.
 */

export const VIEW = { x: -10, y: -10, w: 120, h: 160 };

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Colour: warm paper, muted terrain tints, one pencil ink for every marking.

const INK = "#3f3630";
export const SEA = "#c2d5db";
const PAPER = "#f6efe1";
const LAND = "#eee5d2";
const WATER = "#9bb9c5";
const WATER_LINE = "#6f94a3";
const FOREST = "#c6d4ab";
const FOREST_DEEP = "#a9bf90";
const TREE = "#5f7d52";
const SAND = "#ebdcb3";
const SAND_DEEP = "#e2d1a4";
const DUNE = "#b99a63";
const DESERT = "#e9cba8";
const DESERT_DEEP = "#dbb38c";
const MESA = "#a9765a";
const RELIEF = "#6b5a4b";
const ROOF = "#8a5a48";
const CORAL = "#ff8a70";
const MUSTARD = "#f3c45a";
const REGION_WASH: Record<RegionId, [string, string]> = {
  mountains: [FOREST, FOREST_DEEP],
  coast: [SAND, SAND_DEEP],
  desert: [DESERT, DESERT_DEEP],
};

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

function lineDist(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
  return best;
}

/** Points every `step` units along a polyline, each with the unit tangent there. */
function resample(pts: Pt[], step: number): { p: Pt; tx: number; ty: number }[] {
  const out: { p: Pt; tx: number; ty: number }[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    let d = carry;
    while (d <= len) {
      out.push({ p: [ax + tx * d, ay + ty * d], tx, ty });
      d += step;
    }
    carry = d - len;
  }
  return out;
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

/** Ridge crests in the highlands and the desert, west to east, for the hachures. `reach` is how far the slopes fall. */
const RIDGES: { pts: Pt[]; reach: number; region: RegionId }[] = [
  { pts: [[29, -1.5], [34, 1], [38.5, 0.5], [43, -1.5], [48, -3]], reach: 4.2, region: "mountains" },
  { pts: [[32, 7], [36, 9], [40, 7.5]], reach: 2.6, region: "mountains" },
  { pts: [[3, 13], [5.5, 18.5], [7, 24.5]], reach: 3.2, region: "mountains" },
  { pts: [[3.5, 37.5], [7.5, 41.5], [12, 44.5]], reach: 3, region: "mountains" },
  { pts: [[39, 40.5], [44, 39], [49, 36]], reach: 2.8, region: "mountains" },
  { pts: [[3, 93], [7, 96.5], [12, 97.5]], reach: 2.2, region: "desert" },
  { pts: [[38, 138], [43, 136.5], [47, 133.5]], reach: 2.4, region: "desert" },
];
/** The highest summits get a peak mark. */
const PEAKS: Pt[] = [[36, -0.5], [43.5, -2.3], [5.5, 18], [8, 41.5]];
/** Mesas: flat plateaus with a cliff edge, drawn as a loop with ticks on the sunny side. */
const MESAS: { x: number; y: number; rx: number; ry: number; rot: number }[] = [
  { x: 36, y: 88.5, rx: 3.6, ry: 2.1, rot: -12 },
  { x: 8, y: 122.5, rx: 3, ry: 2.2, rot: 15 },
  { x: 49, y: 124, rx: 2.6, ry: 1.7, rot: -20 },
  { x: 15, y: 139, rx: 2.2, ry: 1.5, rot: 8 },
];
/** Dry washes: where water runs after a storm, drawn as dashed blue lines. */
const WASHES: Pt[][] = [
  [[3, 111], [5, 117.5], [4.5, 124], [7.5, 130.5]],
  [[49, 131], [46.5, 136.5], [43, 141.5]],
  [[27, 86], [31, 84], [37, 82.5]],
];
/** Marsh at the river mouth and in the shallows south of Harbor City. */
const MARSH: Pt[] = [[57, 46], [59.5, 48.5], [55.5, 49.5], [90.5, 91.5], [93.5, 89], [88, 93.5]];

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
  for (const [a, b] of ROADS) if (lineDist(p, roadPoints(a, b)) < pad) return true;
  return false;
}

/** Near a town's node, or the name under it. */
function nearTown(p: Pt, pad: number): boolean {
  return towns.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) < pad || (Math.abs(p[0] - t[0]) < 9 && p[1] > t[1] && p[1] < t[1] + 8));
}

function inLake(p: Pt, pad: number): boolean {
  return Math.hypot((p[0] - LAKE.x) / (LAKE.rx + pad), (p[1] - LAKE.y) / (LAKE.ry + pad)) < 1;
}

function nearRiver(p: Pt, pad: number): boolean {
  return lineDist(p, RIVER) < pad || lineDist(p, RIVER_OUT) < pad;
}

function nearRidge(p: Pt, pad: number): boolean {
  return RIDGES.some((r) => lineDist(p, r.pts) < r.reach + pad) || MESAS.some((m) => Math.hypot(p[0] - m.x, p[1] - m.y) < m.rx + pad);
}

/** Spots for little marks: inside `poly` (and the island when `land`), clear of towns, roads and each other. */
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
      if (!inPoly(p, ISLAND) || polyDist(p, ISLAND) < 2.2) continue;
      if (nearTown(p, 6.5) || nearRoad(p, 2.2) || inLake(p, 1.6) || nearRiver(p, 1.6)) continue;
    } else if (inPoly(p, ISLAND) || polyDist(p, ISLAND) < 4) continue;
    if (extra && !extra(p)) continue;
    if (out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Marks

const g = (x: number, y: number, s: number, inner: string, cls = "") => `<g class="${cls}" transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">${inner}</g>`;

/** A soft patch of terrain colour: an ellipse that fades out at its edge. Several overlap into a region. */
const wash = (x: number, y: number, rx: number, ry: number, rot: number, grad: string) =>
  `<ellipse class="wash" cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" fill="url(#${grad})"/>`;

/**
 * Hachures: short strokes falling away from a crest on both sides, longer where the slope is
 * long and tapering toward the ends of the ridge. Light comes from the north-west, so strokes
 * pointing south-east are the shadow side and draw darker. A soft shade under the south-east
 * flank and a touch of light on the other give the hill some body.
 */
function ridge(pts: Pt[], reach: number, seed: number): string {
  const r = seeded(seed);
  const lit: string[] = [];
  const dark: string[] = [];
  const samples = resample(pts, 0.55);
  const n = samples.length;
  samples.forEach(({ p, tx, ty }, i) => {
    const nx = -ty;
    const ny = tx;
    const taper = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.55);
    for (const s of [1, -1]) {
      const len = reach * taper * (0.4 + r() * 0.55);
      const jit = (r() - 0.5) * 0.4;
      let dx = nx * s + tx * jit;
      let dy = ny * s + ty * jit;
      const m = Math.hypot(dx, dy);
      dx /= m;
      dy /= m;
      const x0 = p[0] + dx * 0.3;
      const y0 = p[1] + dy * 0.3;
      (dx + dy > 0 ? dark : lit).push(`M${f(x0)} ${f(y0)}l${f(dx * len)} ${f(dy * len)}`);
    }
  });
  const crest = smooth(pts, false);
  return `<g class="ridge">
    <path d="${crest}" fill="none" stroke="${RELIEF}" stroke-width="${f(reach * 1.5)}" stroke-linecap="round" opacity="0.06" transform="translate(${f(reach * 0.22)} ${f(reach * 0.3)})"/>
    <path d="${crest}" fill="none" stroke="#fff" stroke-width="${f(reach * 1)}" stroke-linecap="round" opacity="0.1" transform="translate(${f(-reach * 0.16)} ${f(-reach * 0.22)})"/>
    <path class="hach lit" d="${lit.join("")}"/><path class="hach dark" d="${dark.join("")}"/>
    <path d="${crest}" fill="none" stroke="${RELIEF}" stroke-width="0.28" stroke-linecap="round" opacity="0.5"/>
  </g>`;
}

/** A summit: a small peak mark with a snow tick, the way an old survey map shows a high point. */
const peak = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M-1.5 1.2L0 -1.3L1.5 1.2" fill="${PAPER}" stroke="${RELIEF}" stroke-width="0.32" stroke-linejoin="round" opacity="0.9"/><path d="M-0.55 -0.35L0 -1.3L0.55 -0.35" fill="none" stroke="${RELIEF}" stroke-width="0.22"/>`);

/** Forest symbols: a conifer (tiny triangle) or a broadleaf (tiny round), in a pencil line. */
const conifer = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M0 1.05V0.1" stroke="${TREE}" stroke-width="0.22"/><path d="M-0.72 0.35L0 -1.05L0.72 0.35Z" fill="${FOREST_DEEP}" stroke="${TREE}" stroke-width="0.2" stroke-linejoin="round"/>`);
const broadleaf = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M0 1V0.2" stroke="${TREE}" stroke-width="0.22"/><circle cy="-0.3" r="0.6" fill="${FOREST_DEEP}" stroke="${TREE}" stroke-width="0.2"/>`);

/** Desert cactus, a thin line glyph. */
const cactus = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M0 1V-1.1M-0.6 -0.15V-0.65M-0.6 -0.15H0M0.6 0.1V-0.4M0.6 0.1H0" fill="none" stroke="${TREE}" stroke-width="0.3" stroke-linecap="round"/>`);

/** Marsh: a waterline with a few reeds. */
const marsh = (x: number, y: number, s: number) =>
  g(x, y, s, `<path d="M-1.1 0.3h2.2M-0.5 0.3v-0.6M0 0.3v-0.95M0.5 0.3v-0.6" fill="none" stroke="${WATER_LINE}" stroke-width="0.2" stroke-linecap="round" opacity="0.8"/>`);

/** A mesa: a wobbly loop for the plateau rim with cliff ticks on the lit side. */
function mesa(m: { x: number; y: number; rx: number; ry: number; rot: number }, seed: number): string {
  const r = seeded(seed);
  const a = (m.rot * Math.PI) / 180;
  const pts: Pt[] = [];
  const ticks: string[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 0.9 + r() * 0.2;
    const ex = Math.cos(t) * m.rx * k;
    const ey = Math.sin(t) * m.ry * k;
    const x = m.x + ex * Math.cos(a) - ey * Math.sin(a);
    const y = m.y + ex * Math.sin(a) + ey * Math.cos(a);
    pts.push([x, y]);
    // Outward normal of the ellipse, turned with it.
    const ox = (Math.cos(t) / m.rx) * Math.cos(a) - (Math.sin(t) / m.ry) * Math.sin(a);
    const oy = (Math.cos(t) / m.rx) * Math.sin(a) + (Math.sin(t) / m.ry) * Math.cos(a);
    const om = Math.hypot(ox, oy);
    if (ox + oy > 0.1) {
      const len = 0.7 + r() * 0.6;
      ticks.push(`M${f(x)} ${f(y)}l${f((ox / om) * len)} ${f((oy / om) * len)}`);
    }
  }
  const rim = smooth(pts);
  return `<g class="mesa">
    <path d="${rim}" fill="${RELIEF}" opacity="0.1" transform="translate(0.5 0.7)"/>
    <path d="${rim}" fill="${DESERT_DEEP}" stroke="${MESA}" stroke-width="0.3" stroke-linejoin="round" opacity="0.9"/>
    <path d="${ticks.join("")}" fill="none" stroke="${MESA}" stroke-width="0.24" stroke-linecap="round" opacity="0.8"/>
  </g>`;
}

/** Building blocks for a town's outskirts: tiny rotated squares, the way a survey map marks houses. */
function blocks(): Record<RegionId, string> {
  const out: Record<RegionId, string> = { mountains: "", coast: "", desert: "" };
  for (const t of STOPS) {
    const r = seeded(t.x * 131 + t.y * 7);
    const want = t.capital ? 9 : 4;
    const placed: Pt[] = [];
    for (let tries = 0; tries < 240 && placed.length < want; tries++) {
      const ang = r() * Math.PI * 2;
      const dist = (t.capital ? 4.4 : 3.9) + r() * (t.capital ? 3.6 : 2.2);
      const p: Pt = [t.x + Math.cos(ang) * dist, t.y + Math.sin(ang) * dist * 0.85];
      // Keep the name (below the node) and the flag/lock (above) clear.
      if (Math.abs(p[0] - t.x) < 8 && p[1] > t.y + 1.5 && p[1] < t.y + 9.5) continue;
      if (Math.abs(p[0] - t.x) < 4 && p[1] < t.y - 2 && p[1] > t.y - 8) continue;
      if (!inPoly(p, ISLAND) || polyDist(p, ISLAND) < 1.8 || inLake(p, 0.8) || nearRiver(p, 1.2) || nearRoad(p, 1.5)) continue;
      if (towns.some((o) => (o[0] !== t.x || o[1] !== t.y) && Math.hypot(o[0] - p[0], o[1] - p[1]) < 9)) continue;
      if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.5)) continue;
      placed.push(p);
    }
    out[t.region] += placed
      .map((p, i) => {
        const w = 0.75 + ((i * 7) % 3) * 0.15;
        const h = 0.5 + ((i * 5) % 2) * 0.15;
        return `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" fill="${ROOF}" opacity="0.7" transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(((i * 41 + t.x) % 60) - 30)})"/>`;
      })
      .join("");
  }
  return out;
}

/** A patch of farmland in the open country, a few plots and their furrows, drawn faintly. */
const field = (x: number, y: number, rot: number, fill: string, w: number, h: number) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"><rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" fill="${fill}" stroke="${INK}" stroke-width="0.14" stroke-opacity="0.3"/>${[-1, 0, 1]
    .map((i) => `<path d="M${f(-w / 2 + 0.4)} ${f((i * h) / 4)}H${f(w / 2 - 0.4)}" stroke="${INK}" stroke-width="0.1" opacity="0.2"/>`)
    .join("")}</g>`;

const lighthouse = (x: number, y: number) =>
  g(x, y, 1, `<path d="M-0.55 1.6L-0.32 -1.1H0.32L0.55 1.6Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.24" stroke-linejoin="round"/><path d="M-0.42 -1.1h0.84M-0.3 0.4h0.6" stroke="${INK}" stroke-width="0.24"/><circle cy="-1.45" r="0.3" fill="${MUSTARD}" stroke="${INK}" stroke-width="0.2"/><path d="M0.6 -1.75L2.6 -2.5M0.6 -1.2L2.6 -0.6" stroke="${MUSTARD}" stroke-width="0.26" opacity="0.7"/>`);

/** A small sailing boat in pencil line, for the sea. */
const boat = (x: number, y: number, s: number, flip = false) =>
  g(x, y, s, `<g${flip ? ' transform="scale(-1 1)"' : ""} opacity="0.75"><path d="M-1.3 0.4h2.6l-0.45 0.7h-1.7z" fill="${PAPER}" stroke="${INK}" stroke-width="0.22" stroke-linejoin="round"/><path d="M0 0.4V-1.7" stroke="${INK}" stroke-width="0.2"/><path d="M0.12 -1.55L1.35 0.2H0.12Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.2" stroke-linejoin="round"/><path d="M-0.12 -1.2L-1 0.2H-0.12Z" fill="${CORAL}" stroke="${INK}" stroke-width="0.18" stroke-linejoin="round"/></g>`);

function compassRose(x: number, y: number): string {
  return g(
    x,
    y,
    1,
    `<circle r="5.4" fill="${PAPER}" stroke="${INK}" stroke-width="0.26" opacity="0.85"/><circle r="4.1" fill="none" stroke="${INK}" stroke-width="0.18" stroke-dasharray="0.35 0.55" opacity="0.8"/>
    <path d="M-5 0L0 -0.8L5 0L0 0.8Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.22" stroke-linejoin="round"/><path d="M0 -5L0.8 0L0 5L-0.8 0Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.24" stroke-linejoin="round"/><path d="M0 -5L0.8 0H0Z" fill="${INK}"/><path d="M0 5L-0.8 0H0Z" fill="${INK}"/>
    <text y="-6.2" class="compass">N</text>`,
    "home-compass",
  );
}

function scaleBar(x: number, y: number): string {
  return g(
    x,
    y,
    1,
    `<path d="M0 0h20" stroke="${INK}" stroke-width="0.3"/><path d="M0 -0.9v1.8M5 -0.6v1.2M10 -0.9v1.8M15 -0.6v1.2M20 -0.9v1.8" stroke="${INK}" stroke-width="0.26"/><rect x="0" y="-0.45" width="5" height="0.9" fill="${INK}" opacity="0.75"/><rect x="10" y="-0.45" width="5" height="0.9" fill="${INK}" opacity="0.75"/><text x="10" y="3.4" class="scale">60 mi</text>`,
    "home-scale",
  );
}

// ---------------------------------------------------------------------------
// Static scene (built once per page load)

let staticScene: string | null = null;

function water(): string {
  const inflow = smooth(RIVER, false);
  const outflow = smooth(RIVER_OUT, false);
  const lake = `cx="${LAKE.x}" cy="${LAKE.y}" rx="${LAKE.rx}" ry="${LAKE.ry}" transform="rotate(${LAKE.rot} ${LAKE.x} ${LAKE.y})"`;
  return `<g class="home-water">
    <path d="${inflow}" fill="none" stroke="${WATER_LINE}" stroke-width="0.95" stroke-linecap="round" opacity="0.55"/>
    <path d="${outflow}" fill="none" stroke="${WATER_LINE}" stroke-width="1.35" stroke-linecap="round" opacity="0.55"/>
    <path d="${inflow}" fill="none" stroke="${WATER}" stroke-width="0.5" stroke-linecap="round"/>
    <path d="${outflow}" fill="none" stroke="${WATER}" stroke-width="0.85" stroke-linecap="round"/>
    <ellipse ${lake} fill="${WATER}" stroke="${WATER_LINE}" stroke-width="0.3" opacity="0.95"/>
    <ellipse cx="${LAKE.x}" cy="${LAKE.y}" rx="${f(LAKE.rx - 1)}" ry="${f(LAKE.ry - 0.8)}" transform="rotate(${LAKE.rot} ${LAKE.x} ${LAKE.y})" fill="none" stroke="${WATER_LINE}" stroke-width="0.16" opacity="0.5"/>
    <ellipse cx="${LAKE.x}" cy="${LAKE.y}" rx="${f(LAKE.rx - 2)}" ry="${f(LAKE.ry - 1.5)}" transform="rotate(${LAKE.rot} ${LAKE.x} ${LAKE.y})" fill="none" stroke="${WATER_LINE}" stroke-width="0.14" opacity="0.35"/>
  </g>`;
}

/** Offset rings in the sea along the coast, the way old charts shade the shallows: nearer rings darker. */
function shallows(island: string): string {
  const rings: [number, number][] = [[8.6, 0.1], [6, 0.16], [3.8, 0.24], [2, 0.36]];
  return rings
    .map(([d, o]) => `<path d="${island}" fill="none" stroke="${WATER_LINE}" stroke-width="${f(d * 2)}" stroke-linejoin="round" opacity="${o}"/><path d="${island}" fill="none" stroke="${SEA}" stroke-width="${f(d * 2 - 0.32)}" stroke-linejoin="round"/>`)
    .join("");
}

function buildStatic(): string {
  const island = smooth(wobble(ISLAND, 0.6, 7));

  // Terrain washes: soft overlapping patches, so the regions blend into the open country
  // instead of meeting at a border. Deeper tints sit where the forest, dunes or badlands are thickest.
  const washes: Record<RegionId, string> = {
    mountains:
      wash(26, 16, 22, 15, -8, "home-w-mountains") + wash(12, 33, 15, 13, 10, "home-w-mountains") + wash(37, 35, 17, 12, 22, "home-w-mountains") + wash(42, 5, 17, 11, 0, "home-w-mountains") +
      wash(31, 27, 10, 7, -15, "home-w-mountains-deep") + wash(16, 15, 9, 6, 20, "home-w-mountains-deep") + wash(44, 41, 7, 5, 0, "home-w-mountains-deep"),
    coast:
      wash(82, 60, 25, 15, 10, "home-w-coast") + wash(72, 80, 21, 17, 0, "home-w-coast") + wash(96, 78, 15, 19, 0, "home-w-coast") +
      wash(99, 60, 7, 5, 20, "home-w-coast-deep") + wash(88, 91, 7, 4, -10, "home-w-coast-deep") + wash(60, 70, 5, 7, 0, "home-w-coast-deep"),
    desert:
      wash(22, 112, 27, 21, 0, "home-w-desert") + wash(40, 128, 19, 15, 0, "home-w-desert") + wash(12, 96, 13, 11, 0, "home-w-desert") +
      wash(10, 123, 11, 9, 0, "home-w-desert-deep") + wash(46, 123, 9, 7, 0, "home-w-desert-deep") + wash(33, 91, 8, 5, -10, "home-w-desert-deep"),
  };
  const regions = REGIONS.map((r) => {
    const shape = smooth(wobble(REGION_SHAPE[r.id], 1.2, 11 + r.id.length));
    return `<g class="home-region" data-region="${r.id}">${washes[r.id]}<path class="veil" d="${shape}"/><path class="fog" d="${shape}"/><path class="bound" d="${shape}"/></g>`;
  }).join("");

  // Marks per region, kept off the towns, roads and water.
  const deco: Record<RegionId, string> = { mountains: "", coast: "", desert: "" };
  for (const rd of RIDGES) deco[rd.region] += ridge(rd.pts, rd.reach, rd.pts[0][0] * 31 + rd.pts[0][1]);
  deco.mountains += PEAKS.map(([x, y], i) => peak(x, y, 0.9 + (i % 2) * 0.2)).join("");
  // Forest: thick in the deep green, thinning out toward the open country.
  const forest = scatter(REGION_SHAPE.mountains, 118, 3, true, 2.4, (p) => !nearRidge(p, 1.2) && PEAKS.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 3));
  deco.mountains += forest.map((p, i) => (i % 5 === 2 ? broadleaf(p[0], p[1], 1 + (i % 3) * 0.15) : conifer(p[0], p[1], 1 + (i % 4) * 0.15))).join("");
  deco.mountains += water();

  // Coast: dune stipple near the shore, marsh in the shallows, the lighthouse and a few palms' worth of scrub.
  const dunes = scatter(REGION_SHAPE.coast, 150, 5, true, 1.25, (p) => polyDist(p, ISLAND) < 8 && !MARSH.some((m) => Math.hypot(p[0] - m[0], p[1] - m[1]) < 3));
  deco.coast += `<g class="stipple" fill="${DUNE}" stroke="${DUNE}">${dunes
    .map((p, i) => (i % 7 === 0 ? `<path d="M${f(p[0] - 0.9)} ${f(p[1])}q0.9 -0.35 1.8 0" fill="none" stroke-width="0.16"/>` : `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.13" stroke="none"/>`))
    .join("")}</g>`;
  deco.coast += MARSH.map(([x, y], i) => marsh(x, y, 0.9 + (i % 2) * 0.2)).join("");
  deco.coast += lighthouse(108, 68.6);
  const scrub = scatter(REGION_SHAPE.coast, 18, 6, true, 4.5, (p) => polyDist(p, ISLAND) > 5 && Math.hypot(p[0] - 108, p[1] - 68) > 6);
  deco.coast += scrub.map((p, i) => (i % 2 ? broadleaf(p[0], p[1], 1.1) : conifer(p[0], p[1], 1.05))).join("");

  // Desert: sand stipple everywhere, mesas, dry washes and a few cacti.
  const sand = scatter(REGION_SHAPE.desert, 150, 9, true, 1.7, (p) => !nearRidge(p, 0.8) && WASHES.every((w) => lineDist(p, w) > 1.6));
  deco.desert += `<g class="stipple" fill="${MESA}">${sand.map((p) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.12"/>`).join("")}</g>`;
  deco.desert += MESAS.map((m, i) => mesa(m, 40 + i)).join("");
  deco.desert += WASHES.map((w) => `<path d="${smooth(w, false)}" fill="none" stroke="${WATER_LINE}" stroke-width="0.3" stroke-dasharray="0.9 0.6" stroke-linecap="round" opacity="0.7"/>`).join("");
  const cacti = scatter(REGION_SHAPE.desert, 12, 10, true, 5, (p) => !nearRidge(p, 1.5) && WASHES.every((w) => lineDist(p, w) > 2.5));
  deco.desert += cacti.map((p, i) => cactus(p[0], p[1], 0.9 + (i % 3) * 0.12)).join("");

  // Building blocks around each town.
  const houses = blocks();
  for (const r of REGIONS) deco[r.id] += houses[r.id];

  // Farmland in the open country between the regions: a few small patchworks.
  const open = (p: Pt) => REGIONS.every((r) => !inPoly(p, REGION_SHAPE[r.id]) && polyDist(p, REGION_SHAPE[r.id]) > 4) && polyDist(p, ISLAND) > 6;
  const farms = [mix(LAND, FOREST_DEEP, 0.3), mix(LAND, MUSTARD, 0.22), mix(LAND, FOREST, 0.35), mix(LAND, DESERT_DEEP, 0.22)];
  const fields = scatter(ISLAND, 4, 17, true, 12, open)
    .map((p, i) => {
      const rot = ((i * 53) % 44) - 22;
      const a = (rot * Math.PI) / 180;
      const cols = 2 + (i % 2);
      const rows = i % 3 === 1 ? 1 : 2;
      const plots: string[] = [];
      for (let c = 0; c < cols; c++)
        for (let rr = 0; rr < rows; rr++) {
          const u = (c - (cols - 1) / 2) * 3.7;
          const v = (rr - (rows - 1) / 2) * 2.8;
          plots.push(field(p[0] + Math.cos(a) * u - Math.sin(a) * v, p[1] + Math.sin(a) * u + Math.cos(a) * v, rot, farms[(i + c * 2 + rr) % farms.length], 3.7, 2.8));
        }
      return plots.join("");
    })
    .join("");

  // Sea: faint water lines, two boats, the compass and the scale.
  const seaBox: Pt[] = [[VIEW.x, VIEW.y], [VIEW.x + VIEW.w, VIEW.y], [VIEW.x + VIEW.w, VIEW.y + VIEW.h], [VIEW.x, VIEW.y + VIEW.h]];
  const ripples = scatter(seaBox, 34, 21, false, 7, (p) => polyDist(p, ISLAND) > 9 && polyDist(p, ISLAND) < 40 && Math.hypot(p[0] - 94, p[1] - 138) > 9)
    .map((p, i) => `<path d="M${f(p[0] - 1.4 - (i % 3) * 0.3)} ${f(p[1])}q0.7 -0.3 1.4 0t1.4 0t1.4 0" fill="none" stroke="${WATER_LINE}" stroke-width="0.2" opacity="0.3"/>`)
    .join("");

  const labels = REGIONS.map((r) => {
    const l = REGION_LABEL[r.id];
    return `<text class="rname" data-region="${r.id}" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${r.name}</text>`;
  }).join("");

  return `
    <g class="home-sea">${ripples}${shallows(island)}${boat(94, 24, 1)}${boat(68, 136, 0.9, true)}${compassRose(94, 138)}${scaleBar(70, 146)}</g>
    <path class="home-land" d="${island}" fill="${LAND}"/>
    <g clip-path="url(#home-island)">
      ${regions}
      <g clip-path="url(#home-coast)"><path d="${island}" fill="none" stroke="${PAPER}" stroke-width="2.2" stroke-linejoin="round" opacity="0.8"/><path d="${island}" fill="none" stroke="${DUNE}" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="0.25 0.7" opacity="0.28"/></g>
      <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="url(#home-grain)"/>
    </g>
    <path d="${island}" fill="none" stroke="${INK}" stroke-width="0.42" stroke-linejoin="round" opacity="0.75"/>
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
  /** What the truck wears (see game/looks.ts). */
  look: Look;
  /** Open towns whose bonus a great shift would still unlock: a small gold mark by the name. */
  bonusHere: readonly string[];
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
    const prize = isOpen && st.bonusHere.includes(t.id) ? `<path class="prize" transform="translate(${f(-r - 1.3)} ${f(-r - 0.6)})" d="M0 -1.25L1 0L0 1.25L-1 0Z"/>` : "";
    // The marker and its name keep a readable size on screen as the map zooms (see --mk in home.css).
    return `<g class="${classes}" data-town="${t.id}" transform="translate(${t.x} ${t.y})">
      <circle class="hit" r="7.5"/>
      <g class="mk">
        <circle class="halo" r="${f(r + 1.6)}"/>
        ${t.capital ? `<circle class="ring" r="${f(r + 1.2)}"/>` : ""}
        <circle class="node" r="${r}"/>
        ${t.capital ? `<circle class="core" r="1.1"/>` : ""}
        <text class="tname" y="${f(r + 3.7)}">${label}</text>
        ${pips}${flag}${lock}${prize}
      </g>
    </g>`;
  }).join("");

  const litRoads = st.night
    ? `<g class="home-reach">${st.reach.map((r) => `<path class="road reach" d="${r.path.slice(1).map((b, i) => roadPath(r.path[i], b)).join(" ")}"/>`).join("")}</g>`
    : "";
  const here = townById(st.town);
  const truck = `<g class="home-truck" style="transform:translate(${here.x}px, ${here.y}px)"><g class="mk">${truckSvg(st.look, st.night)}</g></g>`;

  const grad = (id: string, c: string, peak = 1) =>
    `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${peak}"/><stop offset="0.35" stop-color="${c}" stop-opacity="${f(peak * 0.8)}"/><stop offset="0.7" stop-color="${c}" stop-opacity="${f(peak * 0.3)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  return `<svg class="home-svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Road map">
    <defs>
      <clipPath id="home-island"><path d="${smooth(wobble(ISLAND, 0.6, 7))}"/></clipPath>
      <clipPath id="home-coast"><path d="${smooth(REGION_SHAPE.coast)}"/></clipPath>
      ${REGIONS.map((r) => grad(`home-w-${r.id}`, REGION_WASH[r.id][0]) + grad(`home-w-${r.id}-deep`, REGION_WASH[r.id][1], 0.5)).join("")}
      <pattern id="home-grain" width="7" height="7" patternUnits="userSpaceOnUse" fill="${INK}" opacity="0.07"><circle cx="4.31" cy="5.10" r="0.07"/><circle cx="6.42" cy="5.08" r="0.08"/><circle cx="0.39" cy="3.27" r="0.08"/><circle cx="4.48" cy="6.15" r="0.04"/><circle cx="3.30" cy="1.83" r="0.06"/><circle cx="3.99" cy="0.29" r="0.04"/><circle cx="2.04" cy="6.25" r="0.07"/><circle cx="1.25" cy="5.46" r="0.04"/><circle cx="4.28" cy="1.04" r="0.04"/><circle cx="5.95" cy="1.58" r="0.04"/><circle cx="6.68" cy="5.96" r="0.04"/><circle cx="6.55" cy="3.76" r="0.06"/><circle cx="1.55" cy="6.41" r="0.06"/><circle cx="6.58" cy="6.10" r="0.04"/></pattern>
      <pattern id="home-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.2h2.4" stroke="${INK}" stroke-width="0.3" opacity="0.1"/></pattern>
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

/** The truck, drawn above its town, facing right, in whatever it wears (truckart.ts, drawn small). */
function truckSvg(look: Look, night: boolean): string {
  return `<ellipse class="shadow" cx="0.3" cy="-0.6" rx="5.6" ry="0.9"/>
  <g class="truck-body"><g transform="translate(0 -1) scale(0.056) translate(-108 -116)">${truckGroup(look, { mini: true, night })}</g></g>`;
}
