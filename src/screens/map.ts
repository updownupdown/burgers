import { mix } from "./ink";
import { truckGroup } from "./truckart";
import type { Look } from "../game/looks";
import { eventOn, LINKS, REGIONS, STOPS, townById, type RegionId } from "../game/stops";
import { MILES_PER_UNIT, unlockProgress } from "../game/travel";
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
 * roads run as thin cased lines (highways a little wider, with a centre line). Orchard Isle,
 * across the causeway, is orchards in rows of dots, vineyards and hedged fields. Area names sit
 * on the land in spaced small caps; seas, sounds and the lake are named in italics on the water.
 * Shut highways are dashed with a barrier and a short note. Locked areas fade under a paper
 * veil with a light survey hatch.
 *
 * Everything is in map units: the whole sheet, sea included, is 120 by 170 (about two miles a
 * unit), and towns sit on it where the region study's sketch put them (stops.ts).
 */

export const VIEW = { x: 0, y: 0, w: 120, h: 170 };

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
/** Orchard Isle: a dusty plum wash with greener patches, fruit trees and vines. */
const ORCH = "#dcc8d3";
const ORCH_GREEN = "#cdd5a8";
const ORCH_TREE = "#c9d4a4";
const VINE = "#7d5a78";
const REGION_WASH: Record<RegionId, [string, string]> = {
  mountains: [FOREST, FOREST_DEEP],
  coast: [SAND, SAND_DEEP],
  desert: [DESERT, DESERT_DEEP],
  orchard: [ORCH, ORCH_GREEN],
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
 * Coastlines, clockwise, traced from the region study's sketch. The main island: the Pines'
 * peninsula in the north-east with Saltwater Bay under it, the Gull Point headland, Harbor
 * City's harbour notch, the long south shore where the causeway leaves. Orchard Isle sits off
 * the south-east across Lantern Sound.
 */
const ISLAND: Pt[] = [
  [14, 16], [20, 10.5], [27, 8.5], [35, 9.5], [43, 7], [51, 8], [57, 11], [63, 9.5], [68.5, 13.5], [71.5, 19.5], [76.5, 24.5],
  [80, 30.5], [77.5, 34.5], [72, 35.5], [67, 38.5], [64, 43.5], [66, 48], [71, 50], [77, 49], [83, 50.5], [89, 52], [95, 52.5],
  [101, 54.5], [105.5, 57.5], [103.5, 62], [98.5, 63], [97.5, 67], [100.5, 72], [101.5, 78], [99.5, 84], [97.5, 90], [94.5, 95],
  [92, 100], [88.5, 103], [86, 106.5], [82.5, 107.5], [79.5, 105.5], [77, 108.5], [72.5, 111], [68.5, 114.5], [66, 119.5],
  [64.5, 126], [63.5, 133], [62.5, 140], [60.5, 145], [55.5, 148.5], [50, 151], [44, 153], [37, 152], [30, 154.5], [23, 152.5],
  [17, 148.5], [13, 142], [11.5, 135], [12.5, 128], [10, 121], [11.5, 114], [17, 110.5], [13.5, 105], [9.5, 98], [10.5, 90],
  [12.5, 84], [10, 77], [11, 70], [9, 63], [10.5, 56], [8, 49], [10, 42], [9, 35], [11, 28], [11.5, 21],
];
const ISLE: Pt[] = [
  [76, 127], [83, 123], [91.5, 121], [96, 122.5], [99.5, 122], [103.5, 124], [108, 128], [111.5, 134.5], [113, 142.5],
  [110.5, 150.5], [104.5, 156.5], [96.5, 160.5], [87.5, 161.5], [80.5, 158.5], [75.5, 153], [73.5, 146.5], [74.5, 139.5], [74, 132.5],
];
const LANDS = [ISLAND, ISLE];
/** The land's bounding box (x0, y0, x1, y1): the farthest the map zooms out is this across. */
export const LAND_BOX = (() => {
  const all = LANDS.flat();
  return [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))] as const;
})();
const onLand = (p: Pt) => LANDS.some((l) => inPoly(p, l));
const coastDist = (p: Pt) => Math.min(...LANDS.map((l) => polyDist(p, l)));

/** Rough extent of each area, for its veil while locked and for scattering its marks. */
const REGION_SHAPE: Record<RegionId, Pt[]> = {
  mountains: [[0, 0], [88, 0], [84, 36], [68, 40], [62, 50], [52, 60], [34, 64], [22, 72], [0, 76]],
  coast: [[62, 42], [82, 44], [114, 48], [114, 104], [96, 112], [80, 114], [68, 108], [63, 92], [64, 72], [58, 60]],
  desert: [[0, 80], [22, 76], [44, 84], [62, 92], [68, 112], [68, 166], [0, 166]],
  orchard: [[70, 116], [118, 116], [118, 166], [70, 166]],
};

/** Area names sit on the land, in spaced small caps over each wash. */
const AREA_LABEL: Record<RegionId, { x: number; y: number; rot: number; size: number }> = {
  mountains: { x: 35.5, y: 35.6, rot: -7, size: 3.3 },
  coast: { x: 75, y: 78.4, rot: 70, size: 2.9 },
  desert: { x: 44, y: 117.6, rot: -4, size: 3.3 },
  orchard: { x: 90, y: 136.6, rot: -9, size: 2.4 },
};

/** Water bodies, named in italics on the water (Mirror Lake beside its lake). */
const WATER_LABEL: { name: string; x: number; y: number; rot: number; size: number; halo?: boolean }[] = [
  { name: "Westering Sea", x: 5, y: 84, rot: -90, size: 2.9 },
  { name: "Morning Sea", x: 113.5, y: 88, rot: 90, size: 2.9 },
  // Out on the open bay, clear of the town of the same name and the truck parked there.
  { name: "Saltwater Bay", x: 90, y: 37.5, rot: -18, size: 1.9 },
  { name: "Lantern Sound", x: 69.2, y: 129, rot: -81, size: 2.1 },
  { name: "the Shallows", x: 65.4, y: 152.4, rot: 0, size: 1.7 },
  { name: "Mirror Lake", x: 59.6, y: 16, rot: 0, size: 1.6, halo: true },
];

/** The river that feeds Mirror Lake by Cedar Falls and runs out into Saltwater Bay. */
const RIVER: Pt[] = [[49.5, 9], [51.6, 13], [52.4, 16.4], [53.2, 18.6]];
const RIVER_OUT: Pt[] = [[57.6, 21.8], [59.4, 27], [60.4, 32.5], [62.2, 38], [64.6, 43.6]];
const LAKE = { x: 54.6, y: 20.4, rx: 4.3, ry: 2.5, rot: -18 };
/** Sun Valley's creek: a spring by the oasis, out to the south shore. */
const CREEK: Pt[] = [[26, 133], [28, 138], [29.6, 144], [29.8, 149], [29.6, 154.6]];

/** Ridge crests, for the hachures. `reach` is how far the slopes fall. */
const RIDGES: { pts: Pt[]; reach: number; region: RegionId }[] = [
  { pts: [[18, 14.2], [24, 13.2], [30, 15.2], [36, 13.6], [41, 12.4]], reach: 3.2, region: "mountains" },
  { pts: [[11.8, 28], [13.2, 32.5], [14.6, 36.4]], reach: 2.2, region: "mountains" },
  { pts: [[51.5, 29.5], [54, 33.5], [55.6, 37.6]], reach: 2.3, region: "mountains" },
  { pts: [[11.2, 58], [11.6, 63.5], [11.3, 68.5]], reach: 1.5, region: "mountains" },
];
/** The highest summits get a peak mark. */
const PEAKS: Pt[] = [[29.8, 14.4], [36.2, 13], [13.2, 31.6]];
/** Mesas: flat plateaus with a cliff edge, drawn as a loop with ticks on the sunny side. */
const MESAS: { x: number; y: number; rx: number; ry: number; rot: number }[] = [
  { x: 46, y: 109.5, rx: 3.6, ry: 2, rot: -10 },
  { x: 28, y: 90.5, rx: 2.6, ry: 1.6, rot: 12 },
  { x: 51, y: 125, rx: 2.8, ry: 1.7, rot: -22 },
  { x: 16.5, y: 127, rx: 2.2, ry: 1.4, rot: 8 },
  { x: 38.5, y: 113.5, rx: 1.6, ry: 1, rot: 0 },
];
/** Dry washes: where water runs after a storm, drawn as dashed blue lines. */
const WASHES: Pt[][] = [
  [[30, 105.5], [32, 110], [31, 114.2]],
  [[56.5, 128], [54.6, 133], [56, 138.5]],
  [[58, 106], [55, 111.5]],
];
/** Marsh at the river mouth on Saltwater Bay and in Harbor City's notch. */
const MARSH: Pt[] = [[62.6, 45.6], [65.6, 47.2], [80.2, 104.2], [77.8, 105.6]];
/** Orchard Isle: blocks of fruit trees in rows, vineyards, and hedged fields (centre, size, turn). */
const ORCHARDS: { x: number; y: number; w: number; h: number; rot: number }[] = [
  { x: 85.5, y: 130.8, w: 6, h: 3.2, rot: -14 },
  { x: 89.6, y: 143.2, w: 5, h: 2.8, rot: -12 },
  { x: 84.5, y: 154.2, w: 5.5, h: 2.8, rot: 10 },
  { x: 107.4, y: 146.4, w: 4, h: 3.2, rot: 30 },
];
const VINEYARDS: { x: number; y: number; w: number; h: number; rot: number }[] = [
  { x: 106.8, y: 136.6, w: 4.5, h: 6, rot: 10 },
  { x: 102.6, y: 152, w: 6, h: 3.4, rot: -25 },
  { x: 79.6, y: 133.4, w: 3.8, h: 3.6, rot: 0 },
];
const HEDGED: { x: number; y: number; rot: number }[] = [
  { x: 96, y: 141.2, rot: -6 },
  { x: 78.4, y: 152.2, rot: 14 },
];

const towns = STOPS.map((t) => [t.x, t.y] as Pt);
/** Towns whose event flag goes on the left, clear of the lake. */
const FLAG_LEFT = new Set(["cedarfalls"]);

/**
 * Where each town's name sits: under the node unless a road, the coast or a flag is in the way.
 * `left`/`right` put it beside the node; `at` is a hand offset (map units, text anchor).
 */
type LabelAt = "below" | "above" | "left" | "right" | { dx: number; dy: number; anchor: "start" | "middle" | "end" };
const LABEL_AT: Record<string, LabelAt> = {
  pinecrest: "left",
  elkpass: "right",
  summit: "left",
  gullpoint: "above",
  driftwood: "left",
  harbor: { dx: -2.6, dy: 5, anchor: "end" },
  cactus: { dx: 2, dy: 5, anchor: "start" },
  sunvalley: "left",
  portamber: "left",
};

/**
 * What each town cooks on, drawn in the node in thin ink (about 1.4 units): a burger (the grill),
 * a pressed sandwich (the press), a taco (the comal) and a pie in quarters (the oven).
 */
const KITCHEN_GLYPH: Record<RegionId, string> = {
  mountains: "M-0.78 -0.12a0.78 0.62 0 0 1 1.56 0zM-0.86 0.2h1.72M-0.74 0.5a0.12 0.12 0 0 0 0.12 0.12h1.24a0.12 0.12 0 0 0 0.12 -0.12z",
  coast: "M-0.82 -0.5h1.64v1h-1.64zM-0.5 0.5l0.5 -1M0 0.5l0.5 -1M-0.82 0h1.64",
  desert: "M-0.85 -0.05a0.85 0.75 0 0 0 1.7 0M-0.85 -0.05q0.2 -0.3 0.42 -0.05q0.22 -0.28 0.43 0q0.22 -0.28 0.43 0q0.2 -0.26 0.42 0.05",
  orchard: "M0 -0.82a0.82 0.82 0 1 1 0 1.64a0.82 0.82 0 1 1 0 -1.64zM0 -0.82v1.64M-0.82 0h1.64",
};

/** The name's offset from the node and its anchor, for a node of radius `r`. */
function labelPlace(id: string, r: number): { dx: number; dy: number; anchor: "start" | "middle" | "end"; side: string } {
  const at = LABEL_AT[id] ?? "below";
  if (typeof at === "object") return { ...at, side: "custom" };
  if (at === "above") return { dx: 0, dy: -r - 1.6, anchor: "middle", side: at };
  // Beside the node, clear of the selection halo (r + 1.6) as it pulses.
  if (at === "left") return { dx: -r - 2.1, dy: 1, anchor: "end", side: at };
  if (at === "right") return { dx: r + 2.1, dy: 1, anchor: "start", side: at };
  return { dx: 0, dy: r + 3.7, anchor: "middle", side: at };
}

/** The box a town's name covers on the map at natural marker size (x0, y0, x1, y1). */
function labelBox(t: { id: string; name: string; x: number; y: number; capital?: boolean }): [number, number, number, number] {
  const r = t.capital ? 3.1 : 2.5;
  const p = labelPlace(t.id, r);
  const w = t.name.length * (t.capital ? 1.75 : 1.55);
  const x0 = p.anchor === "start" ? t.x + p.dx : p.anchor === "end" ? t.x + p.dx - w : t.x + p.dx - w / 2;
  return [x0 - 0.6, t.y + p.dy - 2.6, x0 + w + 0.6, t.y + p.dy + 0.8];
}
const LABEL_BOXES = STOPS.map(labelBox);

/** On an area's name (a rotated box along its baseline), so trees and stipple leave it clear. */
function onAreaName(p: Pt): boolean {
  return REGIONS.some((r) => {
    const l = AREA_LABEL[r.id];
    const a = (l.rot * Math.PI) / 180;
    const dx = p[0] - l.x;
    const dy = p[1] - l.y;
    const u = dx * Math.cos(a) + dy * Math.sin(a);
    const v = -dx * Math.sin(a) + dy * Math.cos(a);
    const half = (r.name.length * l.size * 1.1) / 2;
    // Glyphs rise above the baseline; marks drawn upward from their foot need room below it too.
    return Math.abs(u) < half && v > -l.size * 1.2 && v < l.size * 0.9;
  });
}
const inLabel = (p: Pt, pad = 0) => LABEL_BOXES.some(([x0, y0, x1, y1]) => p[0] > x0 - pad && p[0] < x1 + pad && p[1] > y0 - pad && p[1] < y1 + pad);

// ---------------------------------------------------------------------------
// Roads: each road follows a hand-drawn line through a few points (traced from the region
// study's sketch), drawn as a smooth curve. Roads between areas are highways, drawn a little
// heavier; the three gated highways, the Old Pass road and the ferry show a barrier and a note
// until they open.

interface RoadDef {
  a: string;
  b: string;
  /** Late link (the Old Pass road, the ferry): drivable once both towns are open, opens nothing. */
  link?: boolean;
  ferry?: boolean;
}
const ROADS: RoadDef[] = [
  ...STOPS.flatMap((t) => t.roads.map((r): RoadDef => ({ a: t.id, b: r }))),
  ...LINKS.map((l): RoadDef => ({ a: l.a, b: l.b, link: true, ferry: l.ferry })),
];
const roadKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The line each road takes, from the first town to the second (by roadKey order is not needed). */
const ROUTE: Record<string, Pt[]> = {
  [roadKey("pinecrest", "cedarfalls")]: [[30, 24], [35, 21.6], [41, 22.8], [46, 22.5]],
  [roadKey("pinecrest", "elkpass")]: [[30, 24], [27.5, 27], [25.6, 30.6], [22.2, 32], [23.4, 35.2], [19.6, 38.2], [17, 43]],
  [roadKey("cedarfalls", "summit")]: [[46, 22.5], [47.4, 28], [45.6, 34], [43.2, 40], [41, 46], [38, 52]],
  [roadKey("summit", "saltwater")]: [[38, 52], [45, 55.2], [52, 56.6], [60, 56.2], [66, 55.2], [72, 54]],
  [roadKey("saltwater", "gullpoint")]: [[72, 54], [78, 56], [85, 56.6], [92, 57.6], [99, 59]],
  [roadKey("gullpoint", "driftwood")]: [[99, 59], [97.2, 64.2], [96, 70.5], [95, 77]],
  [roadKey("driftwood", "harbor")]: [[95, 77], [95.2, 84], [93.2, 90.5], [89.4, 96], [85, 100]],
  [roadKey("harbor", "redmesa")]: [[85, 100], [78, 99.2], [70, 99.6], [62, 98.2], [56, 96.2], [52, 95]],
  [roadKey("redmesa", "cactus")]: [[52, 95], [41, 97.8], [30, 100.6], [21, 103]],
  [roadKey("cactus", "sunvalley")]: [[21, 103], [21, 112], [23.4, 121], [27.4, 129.4], [33, 137]],
  [roadKey("sunvalley", "applecross")]: [[33, 137], [40, 141], [48, 143.4], [55.5, 144.8], [61, 145.4], [67.5, 145.9], [74, 146], [77, 145.5], [80, 145]],
  [roadKey("applecross", "larkvale")]: [[80, 145], [85, 147.2], [89, 151], [93, 152]],
  [roadKey("larkvale", "portamber")]: [[93, 152], [98.6, 148], [102, 141.5], [101.8, 134.5], [100.2, 130], [98, 127]],
  [roadKey("elkpass", "cactus")]: [[17, 43], [14.2, 49], [15.4, 56], [13.6, 63], [15.4, 71], [14.6, 80], [17, 89], [19.2, 96], [21, 103]],
  [roadKey("portamber", "harbor")]: [[98, 127], [97.6, 123.6], [94, 117.5], [88.5, 111.5], [84.4, 107.6], [84.6, 103], [85, 100]],
};

/**
 * Gates: a barrier `t` of the way along the road from `a`, and a short note at `at` while the
 * road is shut. The note only shows once one end of the road is open, so it reads as the next
 * thing to aim for rather than clutter.
 */
const GATES: { a: string; b: string; t: number; note: string[]; at: Pt; anchor?: "start" | "middle" | "end" }[] = [
  { a: "summit", b: "saltwater", t: 0.36, note: ["Coast Highway", "opens after Summit City"], at: [52.6, 60.6] },
  { a: "harbor", b: "redmesa", t: 0.45, note: ["Desert Highway", "opens after Harbor City"], at: [70, 94.6] },
  { a: "elkpass", b: "cactus", t: 0.33, note: ["Rockfall on the Old Pass:", "clears when you reach", "Cactus Junction"], at: [17.6, 60.6], anchor: "start" },
  { a: "sunvalley", b: "applecross", t: 0.58, note: ["Causeway works:", "opens after Sun Valley"], at: [52, 138.4] },
  { a: "portamber", b: "harbor", t: 0.5, note: ["Ferry runs once", "you reach Port Amber"], at: [99.4, 112.6] },
];

const roadCache = new Map<string, Pt[]>();

/** Points along the road from `a` to `b`, in map units, both ends on the towns. */
export function roadPoints(a: string, b: string): Pt[] {
  const key = roadKey(a, b);
  let pts = roadCache.get(key);
  if (!pts) {
    const [p, q] = key.split("|").map(townById);
    const drawn = ROUTE[key];
    // Hand-drawn lines may run either way; store them from the key's first town.
    pts = drawn ? (Math.hypot(drawn[0][0] - p.x, drawn[0][1] - p.y) < 1 ? drawn : [...drawn].reverse()) : [[p.x, p.y], [q.x, q.y]];
    roadCache.set(key, pts);
  }
  return key.startsWith(a + "|") ? pts : [...pts].reverse();
}

/** Points along a whole route (towns in order), following the drawn curves closely enough to animate along. */
export function routePoints(path: readonly string[]): Pt[] {
  const out: Pt[] = [];
  for (let h = 1; h < path.length; h++) {
    const pts = curvePoints(roadPoints(path[h - 1], path[h]));
    out.push(...(h > 1 ? pts.slice(1) : pts));
  }
  return out;
}

/** The Catmull-Rom curve smooth() draws through `pts`, as points (four per span). */
function curvePoints(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c2: number, d: number) => 0.5 * (2 * b + (c2 - a) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (3 * b - a - 3 * c2 + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Road between two towns as path data, in map units. */
export function roadPath(a: string, b: string): string {
  return smooth(roadPoints(a, b), false);
}

/** Roads between areas: the highways. */
const isHighway = (a: string, b: string) => townById(a).region !== townById(b).region;

/** The point `t` of the way along a polyline, with the direction there in degrees. */
function along(pts: Pt[], t: number): { p: Pt; deg: number } {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = lens.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = Math.min(1, d / (lens[i] || 1));
      const [a, b] = [pts[i], pts[i + 1]];
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    }
    d -= lens[i];
  }
  return { p: pts[0], deg: 0 };
}

/** Stretches of a road that run over water (not the ferry), as point runs: drawn as bridges. */
function bridgeRuns(pts: Pt[]): Pt[][] {
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const s of resample(curvePoints(pts), 0.4)) {
    if (!onLand(s.p)) cur.push(s.p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  // A run gets a little landfall at each end, so the bridge sits on the shore.
  return runs.filter((r) => r.length > 1);
}

function nearRoad(p: Pt, pad: number): boolean {
  for (const r of ROADS) if (lineDist(p, roadPoints(r.a, r.b)) < pad) return true;
  return false;
}

/** Near a town's node, or its name. */
function nearTown(p: Pt, pad: number): boolean {
  return towns.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) < pad) || inLabel(p, 0.8);
}

function inLake(p: Pt, pad: number): boolean {
  return Math.hypot((p[0] - LAKE.x) / (LAKE.rx + pad), (p[1] - LAKE.y) / (LAKE.ry + pad)) < 1;
}

function nearRiver(p: Pt, pad: number): boolean {
  return lineDist(p, RIVER) < pad || lineDist(p, RIVER_OUT) < pad || lineDist(p, CREEK) < pad;
}

function nearRidge(p: Pt, pad: number): boolean {
  return RIDGES.some((r) => lineDist(p, r.pts) < r.reach + pad) || MESAS.some((m) => Math.hypot(p[0] - m.x, p[1] - m.y) < m.rx + pad);
}

/** Inside one of the isle's planted plots. */
function inPlot(p: Pt, pad: number): boolean {
  return [...ORCHARDS, ...VINEYARDS].some((o) => Math.hypot(p[0] - o.x, p[1] - o.y) < Math.max(o.w, o.h) / 2 + pad) || HEDGED.some((h) => Math.hypot(p[0] - h.x, p[1] - h.y) < 4 + pad);
}

/** Spots for little marks: inside `poly` (and on land when `land`), clear of towns, roads and each other. */
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
      if (!onLand(p) || coastDist(p) < 2.2) continue;
      if (nearTown(p, 6.5) || nearRoad(p, 2.2) || inLake(p, 1.6) || nearRiver(p, 1.6) || onAreaName(p)) continue;
    } else if (onLand(p) || coastDist(p) < 4) continue;
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

/**
 * A mesa drawn as a plateau: a light flat top with a wobbly rim, its cliff face showing below it
 * as a darker skirt, hachured with short vertical strokes falling from the rim along the south
 * side, and a strata line or two in the face. (The ticks used to point outward round the lower
 * right and read as legs.)
 */
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
    // Cliff hachure: on the south half of the rim (the face we see), short strokes straight down.
    const oy = (Math.cos(t) / m.rx) * Math.sin(a) + (Math.sin(t) / m.ry) * Math.cos(a);
    if (oy > 0.02) {
      const len = 0.6 + r() * 0.3;
      ticks.push(`M${f(x)} ${f(y + 0.15)}v${f(len)}`);
      // A second, shorter stroke between rim points keeps the face evenly shaded.
      ticks.push(`M${f(x + 0.35)} ${f(y + 0.3)}v${f(len * 0.6)}`);
    }
  }
  const rim = smooth(pts);
  return `<g class="mesa">
    <path d="${rim}" fill="${RELIEF}" opacity="0.1" transform="translate(0.7 1.3)"/>
    <path d="${rim}" fill="${MESA}" opacity="0.55" transform="translate(0.35 0.9)"/>
    <path d="${rim}" fill="none" stroke="${MESA}" stroke-width="0.16" stroke-dasharray="0.9 0.6" opacity="0.6" transform="translate(0.2 0.5)"/>
    <path d="${ticks.join("")}" fill="none" stroke="${MESA}" stroke-width="0.2" stroke-linecap="round" opacity="0.85"/>
    <path d="${rim}" fill="#edd2b0" stroke="${MESA}" stroke-width="0.3" stroke-linejoin="round"/>
  </g>`;
}

/** Building blocks for a town's outskirts: tiny rotated squares, the way a survey map marks houses. */
/** Building blocks for a town's outskirts: tiny rotated squares, the way a survey map marks houses. */
function blocks(): Record<RegionId, string> {
  const out: Record<RegionId, string> = { mountains: "", coast: "", desert: "", orchard: "" };
  for (const t of STOPS) {
    const r = seeded(t.x * 131 + t.y * 7);
    const want = t.capital ? 9 : 4;
    const placed: Pt[] = [];
    for (let tries = 0; tries < 300 && placed.length < want; tries++) {
      const ang = r() * Math.PI * 2;
      const dist = (t.capital ? 4.4 : 3.9) + r() * (t.capital ? 3.6 : 2.2);
      const p: Pt = [t.x + Math.cos(ang) * dist, t.y + Math.sin(ang) * dist * 0.85];
      // Keep the name and the flag/lock (above the node) clear.
      if (inLabel(p, 0.6)) continue;
      if (Math.abs(p[0] - t.x) < 4 && p[1] < t.y - 2 && p[1] > t.y - 8) continue;
      if (!onLand(p) || coastDist(p) < 1.8 || inLake(p, 0.8) || nearRiver(p, 1.2) || nearRoad(p, 1.5)) continue;
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

/** An orchard: fruit trees in straight rows, each a small round crown on a pencil dot. */
function orchard(o: { x: number; y: number; w: number; h: number; rot: number }): string {
  const trees: string[] = [];
  for (let y = -o.h / 2 + 0.5; y <= o.h / 2 - 0.4; y += 1.05)
    for (let x = -o.w / 2 + 0.5; x <= o.w / 2 - 0.4; x += 1.2) trees.push(`M${f(x + 0.34)} ${f(y)}a0.34 0.34 0 1 0 -0.68 0a0.34 0.34 0 1 0 0.68 0`);
  return `<g transform="translate(${f(o.x)} ${f(o.y)}) rotate(${f(o.rot)})"><path d="${trees.join("")}" fill="${ORCH_TREE}" stroke="${TREE}" stroke-width="0.12"/></g>`;
}

/** A vineyard: close rows of short dashes, the way a survey map marks vines. */
function vineyard(o: { x: number; y: number; w: number; h: number; rot: number }): string {
  const rows: string[] = [];
  for (let x = -o.w / 2; x <= o.w / 2 + 0.01; x += 0.72) rows.push(`M${f(x)} ${f(-o.h / 2)}v${f(o.h)}`);
  return `<g transform="translate(${f(o.x)} ${f(o.y)}) rotate(${f(o.rot)})"><path d="${rows.join("")}" stroke="${VINE}" stroke-width="0.14" stroke-dasharray="0.5 0.24" opacity="0.85"/></g>`;
}

/** Hedged fields: a little patchwork with dotted hedgerows between the plots. */
function hedged(h: { x: number; y: number; rot: number }, i: number): string {
  const fills = [mix(LAND, ORCH_GREEN, 0.55), mix(LAND, MUSTARD, 0.2), mix(LAND, ORCH, 0.45), mix(LAND, ORCH_GREEN, 0.3)];
  const plots = [[-2, -1.4, 3.6, 2.6], [1.8, -1.6, 3.8, 3], [-1.8, 1.4, 4, 2.8], [2, 1.6, 3.4, 2.4]]
    .map(([x, y, w, hh], k) => `<rect x="${f(x - w / 2)}" y="${f(y - hh / 2)}" width="${f(w)}" height="${f(hh)}" fill="${fills[(k + i) % fills.length]}"/>`)
    .join("");
  const hedges = `<path d="M-4 -3H4M-4 0H4M-4 3H4M0 -3V3M-4 -3V3M4 -3V3" fill="none" stroke="${TREE}" stroke-width="0.32" stroke-dasharray="0.05 0.42" stroke-linecap="round" opacity="0.75"/>`;
  return `<g transform="translate(${f(h.x)} ${f(h.y)}) rotate(${f(h.rot)})">${plots}${hedges}</g>`;
}

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
    `<path d="M0 0h20" stroke="${INK}" stroke-width="0.3"/><path d="M0 -0.9v1.8M5 -0.6v1.2M10 -0.9v1.8M15 -0.6v1.2M20 -0.9v1.8" stroke="${INK}" stroke-width="0.26"/><rect x="0" y="-0.45" width="5" height="0.9" fill="${INK}" opacity="0.75"/><rect x="10" y="-0.45" width="5" height="0.9" fill="${INK}" opacity="0.75"/><text x="10" y="3.4" class="scale">${20 * MILES_PER_UNIT} mi</text>`,
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

/** Sun Valley's creek, a thin blue line out to the south shore. */
function creek(): string {
  const d = smooth(CREEK, false);
  return `<path d="${d}" fill="none" stroke="${WATER_LINE}" stroke-width="0.8" stroke-linecap="round" opacity="0.5"/><path d="${d}" fill="none" stroke="${WATER}" stroke-width="0.42" stroke-linecap="round"/>`;
}

/** Offset rings in the sea along the coast, the way old charts shade the shallows: nearer rings darker. */
function shallows(coasts: string): string {
  const rings: [number, number][] = [[8.6, 0.1], [6, 0.16], [3.8, 0.24], [2, 0.36]];
  return rings
    .map(([d, o]) => `<path d="${coasts}" fill="none" stroke="${WATER_LINE}" stroke-width="${f(d * 2)}" stroke-linejoin="round" opacity="${o}"/><path d="${coasts}" fill="none" stroke="${SEA}" stroke-width="${f(d * 2 - 0.32)}" stroke-linejoin="round"/>`)
    .join("");
}

/** Both coastlines as one path (the main island, then Orchard Isle). */
const coastPath = () => smooth(wobble(ISLAND, 0.4, 7)) + " " + smooth(wobble(ISLE, 0.35, 13));

/** A town or area label's text, bent to a rotation. */
const rotText = (x: number, y: number, rot: number, cls: string, body: string, attrs = "") =>
  `<text class="${cls}" x="${f(x)}" y="${f(y)}"${rot ? ` transform="rotate(${f(rot)} ${f(x)} ${f(y)})"` : ""}${attrs}>${body}</text>`;

function buildStatic(): string {
  const coasts = coastPath();

  // Terrain washes: soft overlapping patches, so the areas blend into the open country instead
  // of meeting at a border. Deeper tints sit where the forest, dunes or badlands are thickest.
  const washes: Record<RegionId, string> = {
    mountains:
      wash(30, 28, 34, 26, -10, "home-w-mountains") + wash(20, 52, 18, 12, 20, "home-w-mountains") + wash(14, 66, 8, 12, 0, "home-w-mountains") +
      wash(30, 14, 18, 7, -5, "home-w-mountains-deep") + wash(16, 36, 9, 12, 10, "home-w-mountains-deep") + wash(52, 36, 8, 10, 15, "home-w-mountains-deep"),
    coast:
      wash(90, 66, 18, 14, 30, "home-w-coast") + wash(94, 88, 12, 16, 10, "home-w-coast") + wash(76, 50, 12, 5, 0, "home-w-coast") + wash(80, 104, 12, 6, 0, "home-w-coast") +
      wash(99, 60, 6, 4, 20, "home-w-coast-deep") + wash(88, 95, 6, 4, -10, "home-w-coast-deep"),
    desert:
      wash(34, 118, 30, 34, 0, "home-w-desert") +
      wash(40, 108, 14, 8, -10, "home-w-desert-deep") + wash(20, 126, 9, 12, 10, "home-w-desert-deep") + wash(50, 126, 9, 7, -20, "home-w-desert-deep") +
      // Sun Valley: the only green valley in the desert.
      wash(31, 143, 9, 8, 0, "home-w-oasis"),
    orchard: wash(93, 141, 22, 21, 0, "home-w-orchard") + wash(84, 134, 9, 7, 0, "home-w-orchard-deep") + wash(102, 148, 8, 6, 0, "home-w-orchard-deep"),
  };
  const regions = REGIONS.map((r) => {
    const shape = smooth(wobble(REGION_SHAPE[r.id], 1.2, 11 + r.id.length));
    return `<g class="home-region" data-region="${r.id}">${washes[r.id]}<path class="veil" d="${shape}"/><path class="fog" d="${shape}"/><path class="bound" d="${shape}"/></g>`;
  }).join("");

  // Marks per area, kept off the towns, roads and water.
  const deco: Record<RegionId, string> = { mountains: "", coast: "", desert: "", orchard: "" };
  for (const rd of RIDGES) deco[rd.region] += ridge(rd.pts, rd.reach, rd.pts[0][0] * 31 + rd.pts[0][1]);
  deco.mountains += PEAKS.map(([x, y], i) => peak(x, y, 0.9 + (i % 2) * 0.2)).join("");
  // Forest: thick in the deep green, thinning out toward the open country.
  const forest = scatter(REGION_SHAPE.mountains, 120, 3, true, 2.4, (p) => !nearRidge(p, 1.2) && PEAKS.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 3));
  deco.mountains += forest.map((p, i) => (i % 5 === 2 ? broadleaf(p[0], p[1], 1 + (i % 3) * 0.15) : conifer(p[0], p[1], 1 + (i % 4) * 0.15))).join("");
  deco.mountains += water();

  // Coast: dune stipple near the shore, marsh at the river mouth, the lighthouse and a little scrub.
  const dunes = scatter(REGION_SHAPE.coast, 150, 5, true, 1.25, (p) => coastDist(p) < 8 && !MARSH.some((m) => Math.hypot(p[0] - m[0], p[1] - m[1]) < 3));
  deco.coast += `<g class="stipple" fill="${DUNE}" stroke="${DUNE}">${dunes
    .map((p, i) => (i % 7 === 0 ? `<path d="M${f(p[0] - 0.9)} ${f(p[1])}q0.9 -0.35 1.8 0" fill="none" stroke-width="0.16"/>` : `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.13" stroke="none"/>`))
    .join("")}</g>`;
  deco.coast += MARSH.map(([x, y], i) => marsh(x, y, 0.9 + (i % 2) * 0.2)).join("");
  deco.coast += lighthouse(104, 57.4);
  const scrub = scatter(REGION_SHAPE.coast, 16, 6, true, 4.5, (p) => coastDist(p) > 5 && Math.hypot(p[0] - 104, p[1] - 57) > 6 && !nearRidge(p, 1));
  deco.coast += scrub.map((p, i) => (i % 2 ? broadleaf(p[0], p[1], 1.1) : conifer(p[0], p[1], 1.05))).join("");

  // Red Rock: sand stipple everywhere, mesas, dry washes and a few cacti; trees round the oasis.
  const oasis = (p: Pt) => Math.hypot(p[0] - 31, p[1] - 143) < 8 || Math.hypot(p[0] - 27, p[1] - 146.6) < 5;
  const sand = scatter(REGION_SHAPE.desert, 150, 9, true, 1.7, (p) => !nearRidge(p, 0.8) && WASHES.every((w) => lineDist(p, w) > 1.6) && !oasis(p));
  deco.desert += `<g class="stipple" fill="${MESA}">${sand.map((p) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.12"/>`).join("")}</g>`;
  deco.desert += MESAS.map((m, i) => mesa(m, 40 + i)).join("");
  deco.desert += WASHES.map((w) => `<path d="${smooth(w, false)}" fill="none" stroke="${WATER_LINE}" stroke-width="0.3" stroke-dasharray="0.9 0.6" stroke-linecap="round" opacity="0.7"/>`).join("");
  const cacti = scatter(REGION_SHAPE.desert, 12, 10, true, 5, (p) => !nearRidge(p, 1.5) && WASHES.every((w) => lineDist(p, w) > 2.5) && !oasis(p));
  deco.desert += cacti.map((p, i) => cactus(p[0], p[1], 0.9 + (i % 3) * 0.12)).join("");
  deco.desert += creek();
  const palms = scatter(REGION_SHAPE.desert, 9, 12, true, 2.2, (p) => oasis(p));
  deco.desert += palms.map((p, i) => broadleaf(p[0], p[1], 0.95 + (i % 2) * 0.15)).join("");

  // Orchard Isle: orchards in rows, vineyards, hedged fields, and a few stray trees.
  deco.orchard += HEDGED.map(hedged).join("") + ORCHARDS.map(orchard).join("") + VINEYARDS.map(vineyard).join("");
  const isleTrees = scatter(REGION_SHAPE.orchard, 14, 14, true, 3, (p) => !inPlot(p, 1));
  deco.orchard += isleTrees.map((p, i) => broadleaf(p[0], p[1], 0.9 + (i % 3) * 0.12)).join("");

  // Building blocks around each town.
  const houses = blocks();
  for (const r of REGIONS) deco[r.id] += houses[r.id];

  // Farmland in the open country between the areas: small hand-placed patchworks, with any plot
  // that would sit on a road, a town or the coast left out.
  const farms = [mix(LAND, FOREST_DEEP, 0.3), mix(LAND, MUSTARD, 0.22), mix(LAND, FOREST, 0.35), mix(LAND, DESERT_DEEP, 0.22)];
  const FIELDS: [number, number, number][] = [[60, 70, -12], [65, 83, 8], [28.5, 64.5, -20], [46, 70.5, 14], [52.5, 80, -4], [37.5, 77.6, 22], [27, 146.6, 6]];
  const fields = FIELDS.map(([x, y, rot], i) => {
    const a = (rot * Math.PI) / 180;
    const cols = 2 + (i % 2);
    const rows = i % 3 === 1 ? 1 : 2;
    const plots: string[] = [];
    for (let c = 0; c < cols; c++)
      for (let rr = 0; rr < rows; rr++) {
        const u = (c - (cols - 1) / 2) * 3.4;
        const v = (rr - (rows - 1) / 2) * 2.6;
        const p: Pt = [x + Math.cos(a) * u - Math.sin(a) * v, y + Math.sin(a) * u + Math.cos(a) * v];
        if (!onLand(p) || coastDist(p) < 2.5 || nearRoad(p, 2.4) || nearTown(p, 5) || nearRiver(p, 2)) continue;
        plots.push(field(p[0], p[1], rot, farms[(i + c * 2 + rr) % farms.length], 3.4, 2.6));
      }
    return plots.join("");
  }).join("");

  // Sea: faint water lines, two boats, the shoal the causeway crosses, the compass and the scale.
  const seaBox: Pt[] = [[VIEW.x, VIEW.y], [VIEW.x + VIEW.w, VIEW.y], [VIEW.x + VIEW.w, VIEW.y + VIEW.h], [VIEW.x, VIEW.y + VIEW.h]];
  const quiet = (p: Pt) => WATER_LABEL.every((w) => Math.hypot(p[0] - w.x, p[1] - w.y) > 10) && Math.hypot(p[0] - 110, p[1] - 14) > 8;
  const ripples = scatter(seaBox, 34, 21, false, 7, (p) => coastDist(p) > 7 && coastDist(p) < 40 && quiet(p))
    .map((p, i) => `<path d="M${f(p[0] - 1.4 - (i % 3) * 0.3)} ${f(p[1])}q0.7 -0.3 1.4 0t1.4 0t1.4 0" fill="none" stroke="${WATER_LINE}" stroke-width="0.2" opacity="0.3"/>`)
    .join("");
  const shoal = `<path d="M60 146.6C64 148.8 70 148.6 75 147.4" fill="none" stroke="#d3e2e6" stroke-width="4" stroke-linecap="round" opacity="0.9"/>`;

  const areaNames = REGIONS.map((r) => {
    const l = AREA_LABEL[r.id];
    return rotText(l.x, l.y, l.rot, "rname", r.name.toUpperCase(), ` data-region="${r.id}" style="font-size:${l.size}px"`);
  }).join("");
  // Seas are named on the sea, under the land; the lake's name sits on the land beside it.
  const waterName = (w: (typeof WATER_LABEL)[number]) => rotText(w.x, w.y, w.rot, `wname${w.halo ? " halo" : ""}`, w.name, ` style="font-size:${w.size}px"`);

  return `
    <g class="home-sea">${ripples}${shallows(coasts)}${shoal}${boat(94, 24, 1)}${boat(44, 163, 0.9, true)}${compassRose(104, 14)}${scaleBar(10, 160)}</g>
    ${WATER_LABEL.filter((w) => !w.halo).map(waterName).join("")}
    <path class="home-land" d="${coasts}" fill="${LAND}"/>
    <g clip-path="url(#home-island)">
      ${regions}
      <g clip-path="url(#home-coast)"><path d="${coasts}" fill="none" stroke="${PAPER}" stroke-width="2.2" stroke-linejoin="round" opacity="0.8"/><path d="${coasts}" fill="none" stroke="${DUNE}" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="0.25 0.7" opacity="0.28"/></g>
      <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="url(#home-grain)"/>
    </g>
    <path d="${coasts}" fill="none" stroke="${INK}" stroke-width="0.42" stroke-linejoin="round" opacity="0.75"/>
    <g class="home-fields">${fields}</g>
    ${REGIONS.map((r) => `<g class="home-deco" data-region="${r.id}">${deco[r.id]}</g>`).join("")}
    ${areaNames}
    ${WATER_LABEL.filter((w) => w.halo).map(waterName).join("")}`;
}

/** A road barrier: a striped board on two posts, set across the road. */
const barrier = (p: Pt, deg: number) =>
  `<g class="barrier" transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(deg + 90)})"><path class="post" d="M-1.5 0.55v0.8M1.5 0.55v0.8"/><rect x="-1.9" y="-0.55" width="3.8" height="1.1" rx="0.2"/><path class="stripe" d="M-1.4 0.5l0.9 -1M-0.3 0.5l0.9 -1M0.8 0.5l0.9 -1"/></g>`;

/** Bridges are part of the drawing: where a road crosses water it runs on a cased deck with ticks. */
let bridgeSvg: string | null = null;
function bridges(): string {
  const out: string[] = [];
  for (const r of ROADS) {
    if (r.ferry) continue;
    for (const run of bridgeRuns(roadPoints(r.a, r.b))) {
      // Run the deck a little onto each shore.
      const [a, b] = [run[0], run[1]];
      const [c, d] = [run[run.length - 2], run[run.length - 1]];
      const ext = (p: Pt, q: Pt): Pt => {
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        return [p[0] + ((p[0] - q[0]) / l) * 0.8, p[1] + ((p[1] - q[1]) / l) * 0.8];
      };
      const deck = [ext(a, b), ...run, ext(d, c)];
      const line = `M${deck.map((p) => `${f(p[0])} ${f(p[1])}`).join("L")}`;
      const ticks = resample(deck, 1.8)
        .slice(1)
        .map(({ p, tx, ty }) => `M${f(p[0] - ty * 1.05)} ${f(p[1] + tx * 1.05)}l${f(-ty * 0.55)} ${f(tx * 0.55)}M${f(p[0] + ty * 1.05)} ${f(p[1] - tx * 1.05)}l${f(ty * 0.55)} ${f(-tx * 0.55)}`)
        .join("");
      out.push(`<path class="bridge-case" d="${line}"/><path class="bridge-deck" d="${line}"/><path class="bridge-tick" d="${ticks}"/>`);
    }
  }
  return out.join("");
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
  /**
   * Screen px per map unit at scale 1 (the home screen's fit). The SVG is drawn at that size, so
   * a redrawn map is never left unsized: an <svg> with only a viewBox lays out as 0 x 0 inside the
   * absolutely positioned pan/zoom layer, and the map turns to empty sea until the next resize.
   */
  px?: number;
}

export function townPoint(id: string): Pt {
  const t = townById(id);
  return [t.x, t.y];
}

/** Whole map as an <svg> in map units; the pan/zoom layer scales it. */
export function renderMap(st: MapState): string {
  staticScene ??= buildStatic();
  bridgeSvg ??= bridges();
  const open = (id: string) => st.unlocked.includes(id);
  const regionOpen = (r: RegionId) => STOPS.some((t) => t.region === r && open(t.id));
  const lockedRegions = REGIONS.filter((r) => !regionOpen(r.id)).map((r) => r.id);

  // Casings first, so where roads meet at a town they join cleanly. A shut road that has a gate
  // is drawn dashed with its barrier; other shut roads are a faint dotted line.
  const isOpen = (r: RoadDef) => open(r.a) && open(r.b);
  const gateOf = (r: RoadDef) => GATES.find((g) => roadKey(g.a, g.b) === roadKey(r.a, r.b));
  const land = ROADS.filter((r) => !r.ferry);
  const lit = land.filter(isOpen);
  const dark = land.filter((r) => !isOpen(r));
  const cls = (r: RoadDef) => (isHighway(r.a, r.b) ? " hw" : "");
  const roads =
    dark.map((r) => `<path class="road ${gateOf(r) ? "gated" : "locked"}${cls(r)}" d="${roadPath(r.a, r.b)}"/>`).join("") +
    lit.map((r) => `<path class="road-case${cls(r)}" d="${roadPath(r.a, r.b)}"/>`).join("") +
    lit.map((r) => `<path class="road${cls(r)}" d="${roadPath(r.a, r.b)}"/><path class="road-dash${cls(r)}" d="${roadPath(r.a, r.b)}"/>`).join("");
  // The ferry: a dashed line across the water, with a little boat once it runs.
  const ferries = ROADS.filter((r) => r.ferry)
    .map((r) => {
      const pts = roadPoints(r.a, r.b);
      const mid = along(pts, 0.5);
      const runs = isOpen(r);
      const flip = Math.cos((mid.deg * Math.PI) / 180) < 0;
      return `<path class="ferry ${runs ? "runs" : "shut"}" d="${smooth(pts, false)}"/>${runs ? g(mid.p[0] + 1.6, mid.p[1] - 0.4, 0.8, `<g${flip ? ' transform="scale(-1 1)"' : ""}><path d="M-1.3 -0.1h2.6l-0.5 0.8h-1.6z" fill="${PAPER}" stroke="#3f5f6b" stroke-width="0.22" stroke-linejoin="round"/><path d="M-0.3 -0.1v-0.8h0.9v0.8" fill="${PAPER}" stroke="#3f5f6b" stroke-width="0.2"/></g>`, "ferry-boat") : ""}`;
    })
    .join("");
  // Barriers and notes on the roads still shut.
  const gates = GATES.filter((gt) => !(open(gt.a) && open(gt.b)))
    .map((gt) => {
      const ferry = ROADS.some((r) => r.ferry && roadKey(r.a, r.b) === roadKey(gt.a, gt.b));
      const at = along(roadPoints(gt.a, gt.b), gt.t);
      const bar = ferry ? "" : barrier(at.p, at.deg);
      // The note only once one end of the road is reachable: it's the next thing to aim for.
      const note =
        open(gt.a) || open(gt.b)
          ? `<text class="gnote" x="${f(gt.at[0])}" y="${f(gt.at[1])}" text-anchor="${gt.anchor ?? "middle"}">${gt.note.map((l, i) => `<tspan x="${f(gt.at[0])}" dy="${i ? 2.3 : 0}">${l}</tspan>`).join("")}</text>`
          : "";
      return bar + note;
    })
    .join("");

  const townsSvg = STOPS.map((t) => {
    const isOpen = open(t.id);
    const here = t.id === st.town;
    const { done, need } = unlockProgress(st.shiftsIn, t.id);
    const r = t.capital ? 3.1 : 2.5;
    const lit = st.night && st.reach.some((r) => r.id === t.id);
    const classes = ["home-town", isOpen ? "open" : "locked", here ? "here" : "", t.id === st.selected ? "sel" : "", t.capital ? "capital" : "", lit ? "lit" : ""].filter(Boolean).join(" ");
    const ev = eventOn(t.id, st.day);
    const soon = !ev && [1, 2].some((d) => eventOn(t.id, st.day + d));
    const place = labelPlace(t.id, r);
    // The event flag flies to the upper right, or the upper left where water is in the way.
    const side = FLAG_LEFT.has(t.id) ? -1 : 1;
    const flag = ev || soon ? `<path class="flag ${ev ? "today" : "soon"}" transform="translate(${f(side * (r + 0.6))} ${f(-r - 0.2)}) scale(${side} 1)" d="M0 0.6V-4.2M0 -4.2h3.2l-0.9 1.2 0.9 1.2H0"/>` : "";
    // The padlock sits over the node, or under it when the name is above.
    const lockY = place.side === "above" ? r + 1.3 : -r - 2.4;
    const lock = !isOpen ? `<path class="lock" transform="translate(0 ${f(lockY)})" d="M-1.3 -0.2h2.6v2.4h-2.6zM-0.75 -0.2v-0.9a0.75 0.75 0 0 1 1.5 0v0.9"/>` : "";
    // Pips show the shifts worked toward opening this town's roads: under the name, or under the node.
    const pipY = place.side === "below" ? r + 6.1 : r + 2;
    const pips =
      isOpen && t.roads.length && done < need
        ? `<g class="pips" transform="translate(0 ${f(pipY)})">${[0, 1, 2].map((i) => `<circle class="pip ${i < done ? "on" : ""}" cx="${f((i - 1) * 1.7)}" r="0.55"/>`).join("")}</g>`
        : "";
    const label = t.capital ? t.name.toUpperCase() : t.name;
    // The bonus diamond sits up and to the left of the node, or to its right when the name is above.
    const prizeAt = place.side === "above" ? [r + 1.6, -0.2] : [-r - 1.3, -r - 0.6];
    const prize = isOpen && st.bonusHere.includes(t.id) ? `<path class="prize" transform="translate(${f(prizeAt[0])} ${f(prizeAt[1])})" d="M0 -1.25L1 0L0 1.25L-1 0Z"/>` : "";
    // The marker and its name keep a readable size on screen as the map zooms (see --mk in home.css).
    return `<g class="${classes}" data-town="${t.id}" transform="translate(${t.x} ${t.y})">
      <circle class="hit" r="7.5"/>
      <g class="mk">
        <circle class="halo" r="${f(r + 1.6)}"/>
        ${t.capital ? `<circle class="ring" r="${f(r + 1.2)}"/>` : ""}
        <circle class="node" r="${r}"/>
        <path class="kind" data-region="${t.region}" d="${KITCHEN_GLYPH[t.region]}"/>
        <text class="tname" x="${f(place.dx)}" y="${f(place.dy)}" style="text-anchor:${place.anchor}">${label}</text>
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
  const size = st.px && st.px > 0 ? ` width="${VIEW.w * st.px}" height="${VIEW.h * st.px}"` : "";
  return `<svg class="home-svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"${size} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Road map">
    <defs>
      <clipPath id="home-island"><path d="${coastPath()}"/></clipPath>
      <clipPath id="home-coast"><path d="${smooth(REGION_SHAPE.coast)}"/></clipPath>
      ${REGIONS.map((r) => grad(`home-w-${r.id}`, REGION_WASH[r.id][0]) + grad(`home-w-${r.id}-deep`, REGION_WASH[r.id][1], 0.5)).join("")}
      ${grad("home-w-oasis", FOREST, 0.85)}
      <pattern id="home-grain" width="7" height="7" patternUnits="userSpaceOnUse" fill="${INK}" opacity="0.07"><circle cx="4.31" cy="5.10" r="0.07"/><circle cx="6.42" cy="5.08" r="0.08"/><circle cx="0.39" cy="3.27" r="0.08"/><circle cx="4.48" cy="6.15" r="0.04"/><circle cx="3.30" cy="1.83" r="0.06"/><circle cx="3.99" cy="0.29" r="0.04"/><circle cx="2.04" cy="6.25" r="0.07"/><circle cx="1.25" cy="5.46" r="0.04"/><circle cx="4.28" cy="1.04" r="0.04"/><circle cx="5.95" cy="1.58" r="0.04"/><circle cx="6.68" cy="5.96" r="0.04"/><circle cx="6.55" cy="3.76" r="0.06"/><circle cx="1.55" cy="6.41" r="0.06"/><circle cx="6.58" cy="6.10" r="0.04"/></pattern>
      <pattern id="home-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.2h2.4" stroke="${INK}" stroke-width="0.3" opacity="0.1"/></pattern>
    </defs>
    <g class="home-static ${lockedRegions.map((r) => `lock-${r}`).join(" ")}">${staticScene}</g>
    <g class="home-roads">${bridgeSvg}${ferries}${roads}${gates}</g>
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

