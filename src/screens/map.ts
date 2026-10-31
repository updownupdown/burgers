import { eventOn, REGIONS, STOPS, townById, type RegionId } from "../game/stops";
import { unlockProgress } from "../game/travel";

/**
 * The road map as an illustrated SVG: an island in the Sorbet palette with "Pencil Line"
 * outlines (each shape's own colour pulled toward ink), soft region shapes clipped to the
 * coastline, little pines, peaks, cacti, mesas and palms scattered where they don't get in the
 * way, curved roads between town nodes, and the truck parked on the current town. Locked
 * regions are greyed and cross-hatched like fog on a paper map.
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

const ISLAND: Pt[] = [
  [20, -3], [38, -5], [52, 3], [57, 16], [52, 30], [50, 40], [60, 45], [74, 44], [90, 45], [101, 54], [105, 70], [100, 86], [88, 98], [72, 96],
  [60, 100], [55, 112], [53, 128], [44, 141], [27, 146], [11, 138], [3, 122], [1, 106], [6, 90], [3, 72], [1, 54], [3, 36], [1, 20], [8, 6],
];
const REGION_SHAPE: Record<RegionId, Pt[]> = {
  mountains: [[-12, -12], [64, -12], [64, 22], [56, 38], [44, 52], [26, 58], [8, 56], [-12, 46]],
  coast: [[58, 46], [82, 40], [108, 50], [112, 80], [104, 100], [84, 106], [64, 104], [50, 90], [48, 66]],
  desert: [[-12, 84], [14, 80], [36, 86], [50, 98], [58, 114], [56, 134], [40, 150], [8, 150], [-12, 130]],
};
/** Where each region's name sits, out in the sea like a cartographer would. */
const REGION_LABEL: Record<RegionId, { x: number; y: number; anchor: "start" | "end" }> = {
  mountains: { x: 60, y: 36, anchor: "start" },
  coast: { x: 104, y: 108, anchor: "end" },
  desert: { x: 60, y: 126, anchor: "start" },
};

const towns = STOPS.map((t) => [t.x, t.y] as Pt);

/** The bend of a road between two towns: a quadratic control point a little off the straight line. */
function roadBend(a: string, b: string): Pt {
  const ta = townById(a);
  const tb = townById(b);
  const dx = tb.x - ta.x;
  const dy = tb.y - ta.y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = (a + b).split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 2 ? 1 : -1;
  const k = (len * 0.085 * sign) / len;
  return [(ta.x + tb.x) / 2 - dy * k, (ta.y + tb.y) / 2 + dx * k];
}

/** Road between two towns as path data, in map units. */
export function roadPath(a: string, b: string): string {
  const ta = townById(a);
  const tb = townById(b);
  const c = roadBend(a, b);
  return `M${f(ta.x)} ${f(ta.y)} Q${f(c[0])} ${f(c[1])} ${f(tb.x)} ${f(tb.y)}`;
}

const ROADS: [string, string][] = STOPS.flatMap((t) => t.roads.map((r) => [t.id, r] as [string, string]));

function nearRoad(p: Pt, pad: number): boolean {
  for (const [a, b] of ROADS) {
    const ta = townById(a);
    const tb = townById(b);
    const c = roadBend(a, b);
    let prev: Pt = [ta.x, ta.y];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const q: Pt = [(1 - t) * (1 - t) * ta.x + 2 * (1 - t) * t * c[0] + t * t * tb.x, (1 - t) * (1 - t) * ta.y + 2 * (1 - t) * t * c[1] + t * t * tb.y];
      if (segDist(p, prev, q) < pad) return true;
      prev = q;
    }
  }
  return false;
}

function nearTown(p: Pt, pad: number): boolean {
  return towns.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1] + 2) < pad);
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
      if (nearTown(p, 8.5) || nearRoad(p, 4.5)) continue;
    } else if (inPoly(p, ISLAND) || polyDist(p, ISLAND) < 4) continue;
    if (extra && !extra(p)) continue;
    if (out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
    out.push(p);
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

function buildStatic(): string {
  const island = smooth(wobble(ISLAND, 0.9, 7));
  const regions = REGIONS.map((r) => {
    const shape = smooth(wobble(REGION_SHAPE[r.id], 1.2, 11 + r.id.length));
    return `<g class="home-region" data-region="${r.id}"><path class="fill" d="${shape}" fill="${REGION_FILL[r.id]}"/><path class="fog" d="${shape}"/><path class="edge" d="${shape}" fill="none" stroke="${line(REGION_FILL[r.id])}" stroke-width="0.4" stroke-dasharray="1.6 1.3" opacity="0.5"/></g>`;
  }).join("");

  // Drawings per region, kept off the towns and roads.
  const deco: Record<RegionId, string> = { mountains: "", coast: "", desert: "" };
  deco.mountains += [[35, 8, 1], [42.5, 5, 1.25], [49, 11, 0.9], [7, 47, 0.75], [12.5, 50, 0.6]].map(([x, y, s]) => peak(x, y, s)).join("");
  deco.mountains += scatter(REGION_SHAPE.mountains, 22, 3, true, 4.2, (p) => !(p[1] < 16 && p[0] > 30 && p[0] < 54) && !(p[0] < 16 && p[1] > 43))
    .map((p, i) => pine(p[0], p[1], 0.75 + (i % 3) * 0.12))
    .join("");
  deco.coast += scatter(REGION_SHAPE.coast, 9, 5, true, 6, (p) => polyDist(p, ISLAND) < 10)
    .map((p, i) => palm(p[0], p[1], 0.85 + (i % 2) * 0.15))
    .join("");
  deco.desert += [[36, 96, 1], [10.5, 127, 0.85], [48, 122, 0.7]].map(([x, y, s]) => mesa(x, y, s)).join("");
  deco.desert += scatter(REGION_SHAPE.desert, 11, 9, true, 5, (p) => Math.hypot(p[0] - 36, p[1] - 96) > 7 && Math.hypot(p[0] - 10.5, p[1] - 127) > 6)
    .map((p, i) => cactus(p[0], p[1], 0.7 + (i % 3) * 0.12))
    .join("");

  const waves = scatter([[VIEW.x, VIEW.y], [VIEW.x + VIEW.w, VIEW.y], [VIEW.x + VIEW.w, VIEW.y + VIEW.h], [VIEW.x, VIEW.y + VIEW.h]], 26, 21, false, 9, (p) => polyDist(p, ISLAND) < 34)
    .map((p, i) => wave(p[0], p[1], 0.8 + (i % 3) * 0.2))
    .join("");

  const labels = REGIONS.map((r) => {
    const l = REGION_LABEL[r.id];
    return `<text class="rname" data-region="${r.id}" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${r.name}</text>`;
  }).join("");

  return `
    <g class="home-sea">${waves}${boat(96, 26, 1)}${boat(68, 134, 0.9, true)}${compassRose(94, 138)}${scaleBar(70, 146)}</g>
    <path d="${island}" fill="none" stroke="${mix(SEA, CREAM, 0.45)}" stroke-width="3.2" stroke-linejoin="round"/>
    <path class="home-land" d="${island}" fill="${LAND}" stroke="${line(LAND)}" stroke-width="0.7" stroke-linejoin="round"/>
    <g clip-path="url(#home-island)">${regions}</g>
    <path d="${island}" fill="none" stroke="${line(LAND)}" stroke-width="0.7" stroke-linejoin="round"/>
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

  const roads = ROADS.map(([a, b]) => {
    const lit = open(a) && open(b);
    const d = roadPath(a, b);
    return lit ? `<path class="road" d="${d}"/><path class="road-dash" d="${d}"/>` : `<path class="road locked" d="${d}"/>`;
  }).join("");

  const townsSvg = STOPS.map((t) => {
    const isOpen = open(t.id);
    const here = t.id === st.town;
    const { done, need } = unlockProgress(st.shiftsIn, t.id);
    const r = t.capital ? 3.1 : 2.5;
    const cls = ["home-town", isOpen ? "open" : "locked", here ? "here" : "", t.id === st.selected ? "sel" : "", t.capital ? "capital" : ""].filter(Boolean).join(" ");
    const ev = eventOn(t.id, st.day);
    const soon = !ev && [1, 2].some((d) => eventOn(t.id, st.day + d));
    const flag = ev || soon ? `<path class="flag ${ev ? "today" : "soon"}" transform="translate(${f(r + 0.6)} ${f(-r - 0.2)})" d="M0 0.6V-4.2M0 -4.2h3.2l-0.9 1.2 0.9 1.2H0"/>` : "";
    const lock = !isOpen ? `<path class="lock" transform="translate(0 ${f(-r - 2.4)})" d="M-1.3 -0.2h2.6v2.4h-2.6zM-0.75 -0.2v-0.9a0.75 0.75 0 0 1 1.5 0v0.9"/>` : "";
    // Pips show the shifts worked toward opening this town's roads.
    const pips =
      isOpen && t.roads.length && done < need
        ? `<g class="pips" transform="translate(0 ${f(r + 6.1)})">${[0, 1, 2].map((i) => `<circle class="pip ${i < done ? "on" : ""}" cx="${f((i - 1) * 1.7)}" r="0.55"/>`).join("")}</g>`
        : "";
    const label = t.capital ? t.name.toUpperCase() : t.name;
    return `<g class="${cls}" data-town="${t.id}" transform="translate(${t.x} ${t.y})">
      <circle class="hit" r="7.5"/>
      <circle class="halo" r="${f(r + 1.6)}"/>
      ${t.capital ? `<circle class="ring" r="${f(r + 1.2)}"/>` : ""}
      <circle class="node" r="${r}"/>
      ${t.capital ? `<circle class="core" r="1.1"/>` : ""}
      <text class="tname" y="${f(r + 3.7)}">${label}</text>
      ${pips}${flag}${lock}
    </g>`;
  }).join("");

  const here = townById(st.town);
  const truck = `<g class="home-truck" style="transform:translate(${here.x}px, ${here.y}px)">${truckSvg()}</g>`;

  return `<svg class="home-svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Road map">
    <defs>
      <clipPath id="home-island"><path d="${smooth(wobble(ISLAND, 0.9, 7))}"/></clipPath>
      <pattern id="home-hatch" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.1h2.2" stroke="${INK}" stroke-width="0.35" opacity="0.16"/></pattern>
    </defs>
    <g class="home-static ${lockedRegions.map((r) => `lock-${r}`).join(" ")}">${staticScene}</g>
    <g class="home-roads">${roads}</g>
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
