import { DEFAULT_LOOK, type Look } from "../game/looks";
import { INK, line, mix } from "./ink";
import "./truckart.css";

/**
 * The truck, side on and facing right, in the Pencil Line style: flat fills, a thin outline
 * tinted from each fill, and three bands of shade (a light strip under the roof, the body, a
 * darker skirt). Every cosmetic in game/looks.ts is drawn here, so the Garage, the night and the
 * road map all show the same truck.
 *
 * Art units: the truck sits on the ground at y = 116 and runs from x = 3 (rear bumper) to
 * x = 214 (front bumper). Roof things rise above y = 20; a trailer hangs off to the left; a
 * balloon or airship floats well above. The viewBox grows to fit whatever is fitted.
 *
 * `mini` is the road map's truck: the same shapes, thicker lines, and the fine detail (rivets,
 * planks, tickets, fringe) left out so it reads at a dozen pixels across.
 */

export interface TruckOpts {
  mini?: boolean;
  /** Night: the window is lit, bulbs and neon glow, searchlights sweep, the hot tub lights up. */
  night?: boolean;
  /** Width in CSS pixels (big art only); the height follows. */
  width?: number;
  /** Extra classes on the root. */
  cls?: string;
  /** For the Garage list: a tighter box around just the truck. */
  crop?: boolean;
}

const CREAM = "#faf3e6";
const CORAL = "#ff8a70";
const MUSTARD = "#f3c45a";
const CHERRY = "#d9534f";
const CHROME = "#d6dadc";
const GLASS = "#bfe3f2";
const TYRE = "#2f2a28";
const GOLD = "#e2b84a";
const WOOD = "#c98d5a";
const DARK = "#4b3f37";
const WARM = "#ffd98a";

interface Paint {
  base: string;
  belt: string;
  /** Diner two-tone: the upper half. */
  top?: string;
  finish?: "woodie" | "chrome" | "gold";
}

const PAINTS: Record<string, Paint> = {
  coral: { base: CORAL, belt: CREAM },
  sage: { base: "#9dbb8c", belt: CREAM },
  butter: { base: "#f2cf72", belt: CORAL },
  dusk: { base: "#56628f", belt: MUSTARD },
  twotone: { base: CHERRY, belt: CHROME, top: CREAM },
  woodie: { base: CREAM, belt: "#8a5a3c", finish: "woodie" },
  chrome: { base: "#c9cfd3", belt: "#9aa3a8", finish: "chrome" },
  gold: { base: GOLD, belt: "#b8892a", finish: "gold" },
};

/** A colour that stands for the paint on small things (the trailer, the balloon's stripes). */
export function paintColour(id: string): string {
  return PAINTS[id]?.base ?? CORAL;
}

let uid = 0;
/** The glow gradient of the truck being drawn (bulbs use it). */
let glowId = "";
const f = (n: number) => (Math.round(n * 100) / 100).toString();

// The body: a box with a rounded rear corner, and the cab in front with a sloped windscreen.
const BOX = "M8 30Q8 20 18 20H150V98H8Z";
const CAB = "M150 42H182Q189 42 193 48L204 70Q209 72 209 79V98H150Z";
const BODY = "M8 30Q8 20 18 20H150V42H182Q189 42 193 48L204 70Q209 72 209 79V98H8Z";
const WHEELS = [42, 180];
const WHEEL_Y = 103;

export function truckSvg(look: Look = DEFAULT_LOOK, o: TruckOpts = {}): string {
  const id = `tk${++uid}`;
  const mini = !!o.mini;
  // Outline weight: thicker on the map so it survives the scale-down.
  const W = mini ? 4.2 : 1.1;
  const paint = PAINTS[look.paint] ?? PAINTS.coral;
  const ln = (c: string) => line(c);
  const P = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" stroke="${ln(fill.startsWith("url") ? paint.base : fill)}" stroke-width="${W}" stroke-linejoin="round" ${extra}/>`;

  const defs: string[] = [
    `<clipPath id="${id}-body"><path d="${BODY}"/></clipPath>`,
    `<clipPath id="${id}-box"><path d="${BOX}"/></clipPath>`,
    `<radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ffd98a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>`,
  ];
  glowId = `${id}-glow`;
  let bodyFill = paint.base;
  if (paint.finish === "chrome") {
    defs.push(`<linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef1f2"/><stop offset="0.22" stop-color="#c3cacf"/><stop offset="0.38" stop-color="#f5f7f8"/>
      <stop offset="0.55" stop-color="#aeb6bb"/><stop offset="0.78" stop-color="#d9dee1"/><stop offset="1" stop-color="#8f979c"/></linearGradient>`);
    bodyFill = `url(#${id}-metal)`;
  } else if (paint.finish === "gold") {
    defs.push(`<linearGradient id="${id}-metal" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="#fbe7a1"/><stop offset="0.25" stop-color="#e2b84a"/><stop offset="0.42" stop-color="#f8dc84"/>
      <stop offset="0.62" stop-color="#c9952f"/><stop offset="0.85" stop-color="#e8c25c"/><stop offset="1" stop-color="#a87a22"/></linearGradient>`);
    bodyFill = `url(#${id}-metal)`;
  }

  const back: string[] = [];
  const parts: string[] = [];
  const front: string[] = [];

  // ---- tag-alongs behind the truck: balloon, airship, trailer
  const tag = look.tag;
  const shade = (svg: string) => (svg ? `<g class="tk-shade">${svg}</g>` : "");
  if (tag === "balloon") back.push(shade(balloon(id, paint, W, mini, defs)));
  if (tag === "airship") back.push(shade(airship(id, paint, W, mini)));
  if (tag === "trailer") back.push(shade(trailer(paint, bodyFill, W, mini)));

  // ---- searchlight beams go behind everything
  if (look.lights === "search") back.push(searchBeams(id, defs, mini));

  // ---- ground shadow
  parts.push(`<ellipse class="tk-shadow" cx="108" cy="117" rx="${mini ? 112 : 106}" ry="${mini ? 9 : 5}"/>`);
  // Light from the window pools on the ground at night.
  parts.push(`<ellipse class="tk-pool" cx="76" cy="118" rx="${mini ? 70 : 62}" ry="${mini ? 12 : 7}" fill="url(#${id}-glow)"/>`);

  // ---- roof things that sit behind the body line (racks, tub)
  parts.push(shade(roof(look.roof, id, W, mini, defs)));

  // ---- the body
  parts.push(`<g class="tk-body">`);
  parts.push(P(BODY, bodyFill));
  parts.push(`<g clip-path="url(#${id}-body)">`);
  if (paint.top) parts.push(`<rect x="0" y="0" width="220" height="80" fill="${paint.top}"/>`);
  if (paint.finish === "woodie") parts.push(woodie(id, mini));
  // Three bands: a light strip under the roof, a darker skirt.
  const shadeBase = paint.finish ? paint.base : paint.base;
  parts.push(`<rect x="0" y="20" width="220" height="${mini ? 7 : 5}" fill="${mix(paint.top ?? shadeBase, "#ffffff", 0.35)}" opacity="${paint.finish === "chrome" || paint.finish === "gold" ? 0.25 : 0.7}"/>`);
  parts.push(`<rect x="0" y="42" width="220" height="${mini ? 6 : 4}" fill="${mix(paint.top ?? shadeBase, "#ffffff", 0.3)}" opacity="${paint.finish ? 0.2 : 0.55}" clip-path="url(#${id}-cabonly)"/>`);
  defs.push(`<clipPath id="${id}-cabonly"><path d="${CAB}"/></clipPath>`);
  parts.push(`<rect x="0" y="88" width="220" height="12" fill="${INK}" opacity="0.13"/>`);
  // Belt line.
  parts.push(`<rect x="0" y="80" width="220" height="${mini ? 6 : 4.5}" fill="${paint.belt}"/>`);
  if (!mini) parts.push(`<path d="M0 80h220M0 84.5h220" stroke="${ln(paint.belt)}" stroke-width="0.5" opacity="0.6"/>`);
  if (paint.finish === "chrome" && !mini) parts.push(rivets());
  if (paint.finish === "gold" && !mini) parts.push(filigree());
  parts.push(`</g>`);
  // Re-stroke the outline over the bands.
  parts.push(`<path d="${BODY}" fill="none" stroke="${ln(paint.base)}" stroke-width="${W}" stroke-linejoin="round"/>`);
  if (!mini) parts.push(`<path d="M150 42V98" stroke="${ln(paint.base)}" stroke-width="${W * 0.8}"/>`);
  parts.push(`<path class="tk-dim" d="${BODY}"/>`);

  // ---- cab: window, door, lights
  parts.push(`<path class="tk-glass" d="M156 48H181Q185 48 188 53L197 70H156Z" fill="${GLASS}" stroke="${ln(paint.top ?? paint.base)}" stroke-width="${W}" stroke-linejoin="round"/>`);
  if (!mini) {
    parts.push(`<path d="M162 66L174 50M168 68L180 52" stroke="#ffffff" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>`);
    parts.push(`<path d="M153 74V96M153 74H198" fill="none" stroke="${ln(paint.base)}" stroke-width="0.7" opacity="0.7"/>`);
    parts.push(`<rect x="157" y="76.5" width="7" height="2" rx="1" fill="${CHROME}" stroke="${ln(CHROME)}" stroke-width="0.5"/>`);
    parts.push(`<rect x="198.5" y="88" width="5" height="3" rx="1" fill="#f3a24a" stroke="${ln("#f3a24a")}" stroke-width="0.5"/>`);
  }
  parts.push(`<circle class="tk-head" cx="204" cy="81" r="${mini ? 4 : 3.4}" fill="${CREAM}" stroke="${ln(CREAM)}" stroke-width="${W * 0.8}"/>`);
  parts.push(`<rect x="8" y="70" width="${mini ? 6 : 4}" height="${mini ? 12 : 10}" rx="1" fill="${CHERRY}" stroke="${ln(CHERRY)}" stroke-width="${W * 0.6}"/>`);

  // ---- the serving window, lit at night
  parts.push(serviceWindow(W, mini));
  // Logo roundel.
  if (!mini) {
    parts.push(`<circle cx="136" cy="58" r="8.6" fill="${CREAM}" stroke="${ln(paint.top ?? paint.base)}" stroke-width="1"/>`);
    parts.push(`<path d="M130.6 59.4Q130.8 53 136 52.6Q141.2 53 141.4 59.4Z" fill="${MUSTARD}" stroke="${ln(MUSTARD)}" stroke-width="0.6"/><rect x="129.8" y="60" width="12.4" height="1.9" rx="0.9" fill="#8a5a3c"/><path d="M130.2 63.2h11.6" stroke="${MUSTARD}" stroke-width="1.6" stroke-linecap="round"/>`);
  }
  parts.push(`</g>`);

  // ---- chassis, bumpers, wheels
  parts.push(`<rect x="6" y="96" width="205" height="${mini ? 9 : 7}" rx="2" fill="#5a4f48" stroke="${ln("#5a4f48")}" stroke-width="${W * 0.6}"/>`);
  parts.push(`<rect x="2.5" y="91" width="8" height="10" rx="1.6" fill="${CHROME}" stroke="${ln(CHROME)}" stroke-width="${W * 0.7}"/>`);
  parts.push(`<rect x="203" y="89" width="11" height="11" rx="2" fill="${CHROME}" stroke="${ln(CHROME)}" stroke-width="${W * 0.7}"/>`);
  for (const x of WHEELS) parts.push(`<path d="M${x - 17} 98A17 17 0 0 1 ${x + 17} 98Z" fill="#3a332e"/>`);
  for (const x of WHEELS) parts.push(wheel(look.wheels, x, WHEEL_Y, 13, W, mini, id, defs));

  // ---- awning and lights
  parts.push(awning(look.awning, W, mini));
  parts.push(`<path class="tk-dim" d="M26 27H124L130 38H20Z"/>`);
  if (look.lights === "string") front.push(stringLights(mini));
  if (look.lights === "marquee") front.push(marquee(mini));
  if (look.lights === "search") front.push(searchLamps(W, mini));

  // ---- roof things in front of the roof line (signs, burger), and the inflatable on the pavement
  front.push(look.roof === "neon" ? roofFront(look.roof, id, W, mini, defs) : shade(roofFront(look.roof, id, W, mini, defs)));
  front.push(shade(inflatable(look.inflatable, W, mini)));
  if (paint.finish === "gold" && !mini) front.push(glints());

  // ---- the box around it all
  let [x0, y0, x1, y1] = o.crop ? [-2, -4, 218, 122] : [-8, 6, 224, 124];
  const roofTop: Record<string, number> = { none: 14, herbs: 2, canoe: -4, surf: -4, windmill: -62, neon: -12, burger: -32, hottub: -30 };
  const floatTop: Record<string, number> = { fries: 56, chef: 34, tubeman: -10 };
  y0 = Math.min(y0, (roofTop[look.roof] ?? 14) - 4, (floatTop[look.inflatable] ?? 99) - 6);
  if (look.lights === "search" && !o.crop) y0 = Math.min(y0, -70);
  if (tag === "trailer") x0 = -80;
  if (tag === "balloon") y0 = Math.min(y0, o.crop ? -60 : -134);
  if (tag === "airship") {
    y0 = Math.min(y0, o.crop ? -50 : -98);
    x0 = Math.min(x0, 30);
  }
  const vw = x1 - x0;
  const vh = y1 - y0;
  const size = o.width ? ` width="${o.width}" height="${f((o.width * vh) / vw)}"` : "";
  return `<svg class="tk${mini ? " mini" : ""}${o.night ? " night" : ""}${o.cls ? " " + o.cls : ""}" viewBox="${x0} ${y0} ${vw} ${vh}"${size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>${defs.join("")}</defs>
    ${back.join("")}${parts.join("")}${front.join("")}
  </svg>`;
}

/** Just the group, in art units, for drawing inside another SVG (the road map). */
export function truckGroup(look: Look, o: TruckOpts = {}): string {
  const svg = truckSvg(look, { ...o, crop: false });
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  return `<g class="tk${o.mini ? " mini" : ""}${o.night ? " night" : ""}">${inner}</g>`;
}

// ---------------------------------------------------------------------------
// Body pieces

function serviceWindow(W: number, mini: boolean): string {
  const frame = `<rect x="32" y="40" width="86" height="32" rx="2" fill="none" stroke="${ln2(CHROME)}" stroke-width="${W * 1.4}"/>`;
  const inside = mini
    ? `<rect class="tk-in" x="32" y="40" width="86" height="32" rx="2"/>`
    : `<rect class="tk-in" x="32" y="40" width="86" height="32" rx="2"/>
      <rect class="tk-in-hood" x="38" y="40" width="40" height="7"/>
      <path class="tk-in-rail" d="M84 47H114"/>
      <path class="tk-ticket" d="M88 47h6v8l-1.5-1-1.5 1-1.5-1-1.5 1z"/><path class="tk-ticket" d="M98 47h6v10l-1.5-1-1.5 1-1.5-1-1.5 1z"/><path class="tk-ticket" d="M107 47h5v7l-1.25-1-1.25 1-1.25-1-1.25 1z"/>
      <path class="tk-in-shelf" d="M36 62H80"/>
      <path class="tk-in-pot" d="M42 62v-5h10v5M56 62v-4h8v4"/>`;
  const shelf = `<rect x="28" y="71" width="94" height="${mini ? 6 : 4.5}" rx="1" fill="${CHROME}" stroke="${ln2(CHROME)}" stroke-width="${W * 0.8}"/>`;
  const brackets = mini ? "" : `<path d="M36 75.5l5 6M114 75.5l-5 6" stroke="${ln2(CHROME)}" stroke-width="1.2" stroke-linecap="round"/>`;
  return inside + frame + shelf + brackets;
}

function woodie(id: string, mini: boolean): string {
  const rail = "#f3ead8";
  const planks = mini ? "" : Array.from({ length: 22 }, (_, i) => `<path d="M${12 + i * 6.3} 22V98" stroke="#a8714a" stroke-width="0.6" opacity="0.7"/>`).join("");
  const grain = mini ? "" : `<path d="M14 30q20 2 40 0t40 1 40-1M14 90q24 -2 50 0t50 1 30-1" stroke="#b47a4e" stroke-width="0.5" fill="none" opacity="0.6"/>`;
  return `<g clip-path="url(#${id}-box)"><rect x="8" y="20" width="142" height="80" fill="${WOOD}"/>${planks}${grain}</g>
    <path d="M12 30Q12 24 18 24H146V94H12Z" fill="none" stroke="${rail}" stroke-width="${mini ? 5 : 3.2}"/>
    <path d="M26 24V94M124 24V94" stroke="${rail}" stroke-width="${mini ? 4 : 2.6}"/>
    ${mini ? "" : `<path d="M12 30Q12 24 18 24H146V94H12Z" fill="none" stroke="${line(rail)}" stroke-width="0.5"/>`}`;
}

function rivets(): string {
  const dots: string[] = [];
  for (let x = 14; x < 148; x += 7) dots.push(`<circle cx="${x}" cy="24.5" r="0.7"/><circle cx="${x}" cy="93" r="0.7"/>`);
  for (let y = 30; y < 92; y += 7) dots.push(`<circle cx="12" cy="${y}" r="0.7"/><circle cx="146" cy="${y}" r="0.7"/>`);
  return `<g fill="#7d868b" opacity="0.8">${dots.join("")}</g><path d="M60 22L48 98M66 22L54 98M178 44L170 98" stroke="#ffffff" stroke-width="4" opacity="0.28"/>`;
}

function filigree(): string {
  const s = "#a87a22";
  return `<g fill="none" stroke="${s}" stroke-width="0.7" opacity="0.85">
    <path d="M14 28h132M14 92h132"/>
    <path d="M18 34c6-6 12 0 6 4s-8-4 0-6M142 34c-6-6-12 0-6 4s8-4 0-6M18 88c6 6 12 0 6-4s-8 4 0 6M142 88c-6 6-12 0-6-4s8 4 0 6"/>
    <path d="M124 36q12 -2 20 6M156 86q20 -4 44 0"/>
  </g>`;
}

function glints(): string {
  const star = (x: number, y: number, s: number, d: number) =>
    `<path class="tk-glint" style="animation-delay:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0 -5L1 -1L5 0L1 1L0 5L-1 1L-5 0L-1 -1Z" fill="#fffbe8"/>`;
  return star(24, 30, 1, 0) + star(140, 88, 0.8, 1.1) + star(196, 62, 0.9, 2.2) + star(70, 90, 0.7, 3.1);
}

function wheel(kind: string, x: number, y: number, r: number, W: number, mini: boolean, id: string, defs: string[]): string {
  const tyre = `<circle cx="${x}" cy="${y}" r="${r}" fill="${TYRE}"/>`;
  if (mini) {
    const hub = kind === "spinners" ? GOLD : kind === "steel" ? CREAM : CHROME;
    const wall = kind === "whitewall" ? `<circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="#f4efe6"/>` : "";
    const big = kind === "spinners" || kind === "chromehub";
    return tyre + wall + `<circle cx="${x}" cy="${y}" r="${r * (big ? 0.72 : 0.45)}" fill="${hub}"/>`;
  }
  if (kind === "whitewall")
    return `${tyre}<circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="#f4efe6" stroke="#cfc8bb" stroke-width="0.6"/><circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="${TYRE}"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${CHROME}" stroke="${ln2(CHROME)}" stroke-width="0.7"/><circle cx="${x - 1.4}" cy="${y - 1.6}" r="1.4" fill="#ffffff" opacity="0.8"/>`;
  if (kind === "chromehub" || kind === "spinners") {
    const metal = kind === "spinners" ? GOLD : CHROME;
    const spokes =
      kind === "spinners"
        ? `<g class="tk-spinner" style="transform-origin:${x}px ${y}px">${[0, 120, 240].map((a) => `<path transform="rotate(${a} ${x} ${y})" d="M${x} ${y}Q${f(x + 4.4)} ${f(y - 6)} ${f(x + 1.6)} ${f(y - r * 0.8)}Q${f(x - 3)} ${f(y - 6.4)} ${x} ${y}Z" fill="#fff0b8" stroke="#a87a22" stroke-width="0.6"/>`).join("")}</g>`
        : Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return `<path d="M${f(x + Math.cos(a + 0.18) * 3)} ${f(y + Math.sin(a + 0.18) * 3)}L${f(x + Math.cos(a) * r * 0.8)} ${f(y + Math.sin(a) * r * 0.8)}" stroke="${ln2(metal)}" stroke-width="0.9"/>`;
          }).join("");
    void id;
    void defs;
    // Big, low-profile rims: only a thin band of tyre shows.
    return `${tyre}<circle cx="${x}" cy="${y}" r="${f(r * 0.86)}" fill="${metal}" stroke="${ln2(metal)}" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="${f(r * 0.8)}" fill="none" stroke="${ln2(metal)}" stroke-width="0.5" opacity="0.7"/>${spokes}<circle cx="${x}" cy="${y}" r="3" fill="${metal}" stroke="${ln2(metal)}" stroke-width="0.7"/><path d="M${x - 8} ${y - 6}a10 10 0 0 1 7.5 -4.2" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.75" stroke-linecap="round"/>`;
  }
  return `${tyre}<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#6d6560"/><circle cx="${x}" cy="${y}" r="${r * 0.28}" fill="${CREAM}" stroke="${ln2(CREAM)}" stroke-width="${W * 0.5}"/>`;
}

// ---------------------------------------------------------------------------
// Awning and lights

function awning(kind: string, W: number, mini: boolean): string {
  // The canvas panel above the window, and its hem along the bottom.
  const panel = "M26 27H124L130 38H20Z";
  if (kind === "stripes") {
    const n = mini ? 6 : 11;
    const stripes: string[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const top = (t: number) => 26 + t * 98;
      const bot = (t: number) => 20 + t * 110;
      stripes.push(`<path d="M${f(top(t0))} 27H${f(top(t1))}L${f(bot(t1))} 38H${f(bot(t0))}Z" fill="${i % 2 ? CREAM : CHERRY}"/>`);
    }
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = 20 + (i / n) * 110;
      const b = 20 + ((i + 1) / n) * 110;
      pts.push(`<path d="M${f(a)} 38L${f((a + b) / 2)} 45L${f(b)} 38Z" fill="${i % 2 ? CREAM : CHERRY}" stroke="${ln2(CHERRY)}" stroke-width="${W * 0.7}" stroke-linejoin="round"/>`);
    }
    return stripes.join("") + `<path d="${panel}" fill="none" stroke="${ln2(CHERRY)}" stroke-width="${W}" stroke-linejoin="round"/>` + pts.join("");
  }
  if (kind === "velvet") {
    const red = "#7a2738";
    const fringe = mini
      ? `<rect x="20" y="38" width="110" height="4" fill="${GOLD}"/>`
      : Array.from({ length: 44 }, (_, i) => `<path d="M${f(21 + i * 2.5)} 38v${i % 2 ? 5 : 6}" stroke="${GOLD}" stroke-width="1"/>`).join("") +
        `<path d="M20 38H130" stroke="#b8892a" stroke-width="1.6"/>` +
        [22, 128].map((x) => `<path d="M${x} 38v4" stroke="#b8892a" stroke-width="0.8"/><path d="M${x - 2.4} 46q2.4 -5 4.8 0l-0.6 6h-3.6z" fill="${GOLD}" stroke="#a87a22" stroke-width="0.6"/>`).join("");
    const sheen = mini ? "" : `<path d="M40 28L36 37M70 28L68 37M100 28L102 37" stroke="#a8455a" stroke-width="3" opacity="0.6"/>`;
    return `<path d="${panel}" fill="${red}" stroke="${ln2(red)}" stroke-width="${W}" stroke-linejoin="round"/>${sheen}${fringe}`;
  }
  const fill = kind === "teal" ? "#4f9e9a" : MUSTARD;
  const hem = kind === "teal" ? CREAM : MUSTARD;
  const n = mini ? 6 : 10;
  const w = 110 / n;
  let d = "M20 38";
  for (let i = 0; i < n; i++) d += `a${f(w / 2)} ${f(w / 2.6)} 0 0 0 ${f(w)} 0`;
  const stripe = kind === "teal" || mini ? "" : `<path d="M23 34.5H127" stroke="${mix(MUSTARD, "#ffffff", 0.45)}" stroke-width="1.6"/>`;
  return `<path d="${panel}" fill="${fill}" stroke="${ln2(fill)}" stroke-width="${W}" stroke-linejoin="round"/>${stripe}<path d="${d}" fill="${hem}" stroke="${ln2(kind === "teal" ? fill : MUSTARD)}" stroke-width="${W * 0.8}" stroke-linejoin="round"/>`;
}

function bulb(x: number, y: number, r: number, cls = "", delay = 0): string {
  return `<g class="tk-bulb ${cls}"${delay ? ` style="animation-delay:${delay}s"` : ""}><circle class="halo" cx="${f(x)}" cy="${f(y)}" r="${f(r * 4.5)}" fill="url(#${glowId})"/><circle class="glass" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/></g>`;
}

function stringLights(mini: boolean): string {
  // A wire clipped to the awning's hem at each point, swagging between, a bulb hanging at each dip.
  const n = mini ? 5 : 9;
  const hem = 38.6;
  const sag = mini ? 6 : 5;
  const xs = Array.from({ length: n + 1 }, (_, i) => 21 + (i / n) * 108);
  let d = `M${f(xs[0])} ${hem}`;
  const dips: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const m = (xs[i] + xs[i + 1]) / 2;
    d += `Q${f(m)} ${f(hem + sag * 2)} ${f(xs[i + 1])} ${hem}`;
    dips.push([m, hem + sag]);
  }
  const clips = mini ? "" : xs.map((x) => `<rect x="${f(x - 0.9)}" y="${hem - 1.6}" width="1.8" height="2.4" rx="0.4" fill="#5a4f48"/>`).join("");
  const drops = mini ? "" : dips.map(([x, y]) => `<path d="M${f(x)} ${f(y)}v1.4" stroke="#3f3630" stroke-width="0.7"/>`).join("");
  return `<path class="tk-wire" d="${d}" fill="none"/>${clips}${drops}${dips.map(([x, y], i) => bulb(x, y + (mini ? 2.6 : 3.2), mini ? 3 : 2, "", i * 0.13)).join("")}`;
}

function marquee(mini: boolean): string {
  const out: string[] = [];
  const step = mini ? 14 : 7;
  let i = 0;
  const r = mini ? 2.6 : 1.4;
  for (let x = 32; x <= 118; x += step) out.push(bulb(x, 36.5, r, `chase c${i++ % 3}`));
  for (let y = 36.5 + step; y <= 72; y += step) {
    out.push(bulb(28.5, y, r, `chase c${i++ % 3}`));
    out.push(bulb(121.5, y, r, `chase c${i++ % 3}`));
  }
  return out.join("");
}

function searchLamps(W: number, mini: boolean): string {
  return [26, 132]
    .map(
      (x) =>
        `<g><rect x="${x - 2}" y="12" width="4" height="9" fill="#5a4f48"/><path d="M${x - 7} 4h14l2 9h-18z" fill="#6f7a80" stroke="${ln2("#6f7a80")}" stroke-width="${W * 0.8}" stroke-linejoin="round"/>${
          mini ? "" : `<ellipse class="tk-lens" cx="${x}" cy="4.5" rx="6" ry="1.8"/>`
        }</g>`,
    )
    .join("");
}

function searchBeams(id: string, defs: string[], mini: boolean): string {
  defs.push(`<linearGradient id="${id}-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.75"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>`);
  const len = mini ? 700 : 240;
  const half = mini ? 70 : 46;
  return [26, 132]
    .map((x, i) => `<g class="tk-beam" style="transform-origin:${x}px 4px;animation-delay:${i * -2.6}s"><path d="M${x - 5} 4L${x - half} ${4 - len}H${x + half}L${x + 5} 4Z" fill="url(#${id}-beam)"/></g>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Roof

/** The parts of a roof thing that sit behind the box line. */
function roof(kind: string, id: string, W: number, mini: boolean, defs: string[]): string {
  void id;
  void defs;
  const rack = `<path d="M28 20V12M132 20V12" stroke="#5a4f48" stroke-width="${mini ? 5 : 2.4}"/><path d="M18 12H142" stroke="#5a4f48" stroke-width="${mini ? 4 : 2}" stroke-linecap="round"/>`;
  if (kind === "canoe") {
    const hull = "#3f7a62";
    return `${rack}<path d="M6 11Q14 -6 80 -5Q146 -6 154 11Q150 13 144 11H16Q10 13 6 11Z" fill="${hull}" stroke="${ln2(hull)}" stroke-width="${W}" stroke-linejoin="round"/>
      ${mini ? "" : `<path d="M14 10.5H146" stroke="#e7d2a6" stroke-width="1.6"/><path d="M24 2Q80 -6 136 2" stroke="#ffffff" stroke-width="1.2" opacity="0.3" fill="none"/><path d="M40 -3.5V12M120 -3.5V12" stroke="#2f2a28" stroke-width="1.2"/>`}`;
  }
  if (kind === "surf") {
    const a = "#f1e0b8";
    const b = "#5aa9c8";
    return `${rack}
      <rect x="10" y="5" width="140" height="7" rx="3.5" fill="${a}" stroke="${ln2(a)}" stroke-width="${W}"/>
      <rect x="20" y="-2" width="124" height="7" rx="3.5" fill="${b}" stroke="${ln2(b)}" stroke-width="${W}"/>
      ${mini ? "" : `<path d="M14 8.5H146" stroke="${CORAL}" stroke-width="1.4"/><path d="M24 1.5H140" stroke="${CREAM}" stroke-width="1.2"/><path d="M26 -2l4 -6l5 6z" fill="${b}" stroke="${ln2(b)}" stroke-width="0.8" stroke-linejoin="round"/><path d="M44 -2.5V12M118 -2.5V12" stroke="#2f2a28" stroke-width="1.2"/>`}`;
  }
  if (kind === "herbs") {
    const box = "#9a6a48";
    const leaves = (x0: number, x1: number) => {
      const out: string[] = [];
      for (let x = x0 + 3; x < x1 - 2; x += mini ? 9 : 4.2) {
        const h = 5 + ((x * 7) % 5);
        const g = ["#5f8f4e", "#78a85f", "#4f7d45"][Math.floor(x) % 3];
        out.push(`<ellipse cx="${f(x)}" cy="${f(12 - h / 2)}" rx="${mini ? 5 : 2.8}" ry="${f(h / 1.6)}" fill="${g}" stroke="${ln2(g)}" stroke-width="${W * 0.5}"/>`);
      }
      if (!mini) for (let x = x0 + 8; x < x1 - 4; x += 13) out.push(`<circle cx="${x}" cy="${f(6 + (x % 3))}" r="1.6" fill="${CHERRY}" stroke="${ln2(CHERRY)}" stroke-width="0.5"/>`);
      return out.join("");
    };
    return `${leaves(20, 72)}${leaves(86, 138)}<rect x="20" y="11" width="52" height="9" rx="1" fill="${box}" stroke="${ln2(box)}" stroke-width="${W}"/><rect x="86" y="11" width="52" height="9" rx="1" fill="${box}" stroke="${ln2(box)}" stroke-width="${W}"/>`;
  }
  if (kind === "hottub") return hotTub(id, W, mini, defs);
  if (kind === "windmill") {
    const steel = "#a9afab";
    const lattice = mini
      ? `<path d="M62 20L71 -30M84 20L75 -30" stroke="${steel}" stroke-width="4"/>`
      : `<path d="M62 20L71 -30M84 20L75 -30M64 10H82M66 -2H80M68 -14H78M64 10L80 -2M82 10L66 -2M66 -2L78 -14M80 -2L68 -14M68 -14L76 -26M78 -14L70 -26" stroke="${line(steel)}" stroke-width="1" fill="none"/>`;
    return lattice;
  }
  return "";
}

/** The parts of a roof thing in front: signs, the burger, the windmill wheel. */
function roofFront(kind: string, id: string, W: number, mini: boolean, defs: string[]): string {
  if (kind === "windmill") {
    const blade = "#e4e6df";
    const n = mini ? 8 : 12;
    const blades = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 360;
      return `<path transform="rotate(${f(a)} 73 -34)" d="M72 -40L70.4 -55H75.6L74 -40Z" fill="${blade}" stroke="${line(blade)}" stroke-width="${mini ? 1.6 : 0.7}" stroke-linejoin="round"/>`;
    }).join("");
    const rings = mini ? "" : `<circle cx="73" cy="-34" r="15" fill="none" stroke="#7d868b" stroke-width="0.9"/><circle cx="73" cy="-34" r="7" fill="none" stroke="#7d868b" stroke-width="0.9"/>`;
    const vane = `<path d="M73 -34H104" stroke="#7d868b" stroke-width="${mini ? 3 : 1.4}"/><path d="M98 -44L112 -40V-28L98 -26Z" fill="${CORAL}" stroke="${line(CORAL)}" stroke-width="${W * 0.8}" stroke-linejoin="round"/>`;
    return `${vane}<g class="tk-spin" style="transform-origin:73px -34px">${blades}${rings}<circle cx="73" cy="-34" r="${mini ? 5 : 3.5}" fill="#7d868b"/></g>`;
  }
  if (kind === "neon") {
    defs.push(`<filter id="${id}-neon" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
    const board = "#2f2a33";
    const tube = `class="tk-neon" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    return `<g transform="translate(80 20) scale(0.78) translate(-80 -20)"><path d="M52 20V12M108 20V12" stroke="#5a4f48" stroke-width="${mini ? 5 : 2.2}"/>
      <rect x="36" y="-18" width="88" height="30" rx="4" fill="${board}" stroke="${line(board)}" stroke-width="${W}"/>
      <g ${tube} stroke-width="${mini ? 3.4 : 1.7}" filter="${mini ? "" : `url(#${id}-neon)`}">
        <path d="M44 4.5Q45 -11 56 -11Q67 -11 68 4.5Z"/><path d="M42 7.5H70"/><path d="M56 -11v-2.5"/>
        ${mini ? `<path d="M78 -6H116M78 4H110"/>` : `<ellipse cx="81" cy="-3.5" rx="4" ry="7"/><path d="M89 3.5V-10.5H93Q97 -10.5 97 -6.5Q97 -2.5 93 -2.5H89"/><path d="M109 -10.5H102V3.5H109M102 -3.5H107"/><path d="M113 3.5V-10.5L120 3.5V-10.5"/>`}
      </g></g>`;
  }
  if (kind === "burger") {
    const bun = "#e7a95a";
    const beef = "#6b3f2a";
    const post = "#7d868b";
    return `<g>
      <path d="M81 20V7H89V20Z" fill="${post}" stroke="${line(post)}" stroke-width="${W * 0.8}"/>
      <path d="M74 20.5Q74 17 78 17H92Q96 17 96 20.5Z" fill="${post}" stroke="${line(post)}" stroke-width="${W * 0.8}"/>
      ${mini ? "" : `<path d="M83 8V18" stroke="#ffffff" stroke-width="1.2" opacity="0.45"/>`}
      <g transform="translate(0 12)">
        <path d="M60 -10H110Q110 -3 104 -3H66Q60 -3 60 -10Z" fill="${bun}" stroke="${line(bun)}" stroke-width="${W}"/>
        <rect x="58" y="-17" width="54" height="7.5" rx="3.5" fill="${beef}" stroke="${line(beef)}" stroke-width="${W}"/>
        <path d="M58 -17H112L106 -12L100 -16L90 -10L82 -16L72 -12L64 -16Z" fill="${MUSTARD}" stroke="${line(MUSTARD)}" stroke-width="${W * 0.6}" stroke-linejoin="round"/>
        <path d="M57 -18q4 -4 7 0t7 0 7 0 7 0 7 0 7 0 7 0 7 0" fill="#7fb35f" stroke="${line("#7fb35f")}" stroke-width="${W * 0.7}"/>
        <path d="M59 -19Q60 -42 85 -42Q110 -42 111 -19Z" fill="${bun}" stroke="${line(bun)}" stroke-width="${W}"/>
        ${mini ? "" : `<path d="M66 -30Q74 -39 86 -39" stroke="#fff3d6" stroke-width="2" fill="none" opacity="0.6" stroke-linecap="round"/><g fill="${CREAM}">${[[72, -27], [80, -33], [90, -30], [98, -25], [86, -24], [78, -22], [96, -35]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="0.8" transform="rotate(-20 ${x} ${y})"/>`).join("")}</g>`}
      </g>
    </g>`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Tag-alongs

/** Inflatables stand on the pavement just behind the front wheel, in front of the body. */
function inflatable(kind: string, W: number, mini: boolean): string {
  if (kind === "tubeman") return tubeMan(W, mini);
  if (kind === "chef") return chef(W, mini);
  if (kind === "fries") return friesBalloon(W, mini);
  return "";
}

/** Little pegs and guy lines that hold an inflatable down. */
function pegs(x0: number, x1: number, top: number, mini: boolean): string {
  if (mini) return "";
  return `<path d="M${x0} ${top}L${x0 - 6} 116.5M${x1} ${top}L${x1 + 6} 116.5" stroke="#8a7d72" stroke-width="0.5"/><path d="M${x0 - 7} 116.5h2M${x1 + 5} 116.5h2" stroke="#5a4f48" stroke-width="1.2"/>`;
}

function tubeMan(W: number, mini: boolean): string {
  const red = "#e8553e";
  const yel = "#f3c45a";
  const ol = line(red);
  const sw = mini ? 3 : W;
  // A chain of tube segments, each nested in the last and swaying on its own clock: the whip.
  const seg = (h: number, w: number, cls: string, inner: string) =>
    `<g class="tk-tube ${cls}"><path d="M${-w / 2} 0Q${-w / 2 - 0.6} ${-h / 2} ${-w / 2} ${-h}H${w / 2}Q${w / 2 + 0.6} ${-h / 2} ${w / 2} 0Z" fill="${red}" stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round"/>${
      mini ? "" : `<path d="M${-w / 2 + 1.6} -2V${-h + 2}" stroke="#ffffff" stroke-width="1.1" opacity="0.35"/>`
    }<g transform="translate(0 ${-h})">${inner}</g></g>`;
  const arm = (side: number, cls: string) =>
    `<g transform="scale(${side} 1)"><g class="tk-tube ${cls}"><path d="M0 -1Q10 -6 18 -16Q20 -18 22 -16Q16 -4 2 3Z" fill="${red}" stroke="${ol}" stroke-width="${sw * 0.9}" stroke-linejoin="round"/>${
      mini ? "" : `<path d="M18.6 -16.6q2 -3 4 -1M19.4 -15.6l3 -3.2" stroke="${ol}" stroke-width="0.8" fill="none"/>`
    }</g></g>`;
  const head = `<g><path d="M-6 0Q-7 -12 0 -13Q7 -12 6 0Z" fill="${yel}" stroke="${line(yel)}" stroke-width="${sw}" stroke-linejoin="round"/>${
    mini
      ? ""
      : `<circle cx="-2.2" cy="-7.6" r="1.6" fill="#ffffff" stroke="${INK}" stroke-width="0.4"/><circle cx="2.4" cy="-7.6" r="1.6" fill="#ffffff" stroke="${INK}" stroke-width="0.4"/><circle cx="-1.8" cy="-7.4" r="0.7" fill="${INK}"/><circle cx="2.8" cy="-7.8" r="0.7" fill="${INK}"/><path d="M-3 -3.4Q0 -0.6 3 -3.4" stroke="${INK}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`
  }<path d="M-5 -12.5Q-6 -18 -2 -16Q0 -20 2 -16Q6 -18 5 -12.5" fill="${red}" stroke="${ol}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/></g>`;
  const top = seg(16, 9, "t3", `${arm(1, "a1")}${arm(-1, "a2")}${head}`);
  const body = seg(30, 10, "t1", seg(26, 9.5, "t2", top));
  const blower = `<path d="M-9 116V106Q-9 103 -6 103H6Q9 103 9 106V116Z" fill="#5f6b4a" stroke="${line("#5f6b4a")}" stroke-width="${sw * 0.8}"/>${
    mini ? "" : `<circle cx="0" cy="110" r="3" fill="none" stroke="#3f4632" stroke-width="0.7"/><path d="M-2 110h4M0 108v4" stroke="#3f4632" stroke-width="0.6"/>`
  }`;
  return `<g class="tk-float tk-tubeman" transform="translate(156 0)">${blower}<g transform="translate(0 103)">${body}</g></g>`;
}

function chef(W: number, mini: boolean): string {
  const white = "#f6f1e7";
  const ol = line("#d8cfbf");
  const sw = mini ? 3 : W;
  const skin = "#f0c49a";
  return `<g class="tk-float tk-chef" transform="translate(156 0)">
    ${pegs(-9, 9, 84, mini)}
    <g class="tk-sway">
      <path d="M-11 116Q-14 96 -11 80Q-10 70 0 69Q10 70 11 80Q14 96 11 116Z" fill="${white}" stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round"/>
      ${mini ? "" : `<path d="M-9 98H9V113H-9Z" fill="${CORAL}" opacity="0.85"/><circle cx="0" cy="79" r="0.9" fill="${ol}"/><circle cx="0" cy="86" r="0.9" fill="${ol}"/><circle cx="0" cy="93" r="0.9" fill="${ol}"/>`}
      <path d="M-5.5 70.5H5.5" stroke="${CHERRY}" stroke-width="${mini ? 3 : 2.4}" stroke-linecap="round"/>
      <ellipse cx="0" cy="61" rx="8.5" ry="9" fill="${skin}" stroke="${line(skin)}" stroke-width="${sw}"/>
      ${mini ? "" : `<circle cx="-3" cy="60" r="0.9" fill="${INK}"/><circle cx="3" cy="60" r="0.9" fill="${INK}"/><path d="M-3 64.5Q0 67 3 64.5" stroke="${INK}" stroke-width="0.8" fill="none" stroke-linecap="round"/><circle cx="-5" cy="63.5" r="1.4" fill="#ec9a86" opacity="0.6"/><circle cx="5" cy="63.5" r="1.4" fill="#ec9a86" opacity="0.6"/>`}
      <path d="M-7.5 55Q-12 52 -10 46Q-9 38 -3 40Q0 33 3 40Q9 38 10 46Q12 52 7.5 55Z" fill="${white}" stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round"/>
      <path d="M-7.5 55H7.5V51.5H-7.5Z" fill="${white}" stroke="${ol}" stroke-width="${sw * 0.8}"/>
      <g class="tk-wave">
        <path d="M9 76Q18 70 22 60Q24 57 26 60Q24 72 12 82Z" fill="${white}" stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round"/>
        <circle cx="24" cy="58.5" r="2.6" fill="${skin}" stroke="${line(skin)}" stroke-width="${sw * 0.7}"/>
        <path d="M24 58L27 46" stroke="#5a4f48" stroke-width="${mini ? 3 : 1.6}" stroke-linecap="round"/><path d="M24.4 46.5L25.8 38L32 39.6L29.6 47.6Z" fill="${CHROME}" stroke="${line(CHROME)}" stroke-width="${sw * 0.7}" stroke-linejoin="round"/>
      </g>
      <path d="M-9 78Q-15 86 -14 94Q-13 97 -10.5 95Q-10 88 -7 82Z" fill="${white}" stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round"/>
    </g>
  </g>`;
}

function friesBalloon(W: number, mini: boolean): string {
  const red = "#d9534f";
  const fry = "#f2c35a";
  const sw = mini ? 3 : W;
  const sticks = [
    [-7, 70, -14],
    [-9, 72, -9],
    [-5, 66, -4],
    [1, 68, -1],
    [-1, 62, 3],
    [3, 64, 7],
    [7, 69, 12],
    [9, 74, 17],
  ]
    .map(([x, y, a]) => `<rect x="${x - 2.4}" y="${y}" width="4.8" height="${86 - y}" rx="2" transform="rotate(${a} ${x} 86)" fill="${fry}" stroke="${line(fry)}" stroke-width="${sw * 0.8}"/>`)
    .join("");
  return `<g class="tk-float tk-fries" transform="translate(156 0)">
    ${pegs(-12, 12, 92, mini)}
    <g class="tk-sway">
      ${sticks}
      <path d="M-15 82Q0 87 15 82L12 114Q0 117 -12 114Z" fill="${red}" stroke="${line(red)}" stroke-width="${sw}" stroke-linejoin="round"/>
      ${mini ? "" : `<path d="M-14.6 86Q0 91 14.6 86" stroke="#ffffff" stroke-width="1" fill="none" opacity="0.5"/><path d="M-6 97Q-3 92 0 97Q3 92 6 97Q3 103 0 106Q-3 103 -6 97Z" fill="${MUSTARD}" stroke="${line(MUSTARD)}" stroke-width="0.6"/><path d="M-10 90L-8.6 112" stroke="#ffffff" stroke-width="2" opacity="0.25" stroke-linecap="round"/>`}
    </g>
  </g>`;
}

/**
 * The hot tub: a cedar barrel tub on a slatted deck over the roof, with steel hoops, a thick
 * rim, water that lights up at night, a towel over the side, steps up from the rear ladder and
 * a rail along the roof edge.
 */
function hotTub(id: string, W: number, mini: boolean, defs: string[]): string {
  const cedar = "#b07a4f";
  const cedarDk = "#8a5a3c";
  const deckC = "#9a6a48";
  const band = "#5a4f48";
  const cx = 82;
  const rx = 33;
  const top = -6;
  const bot = 15;
  defs.push(`<linearGradient id="${id}-staves" x1="0" x2="1"><stop offset="0" stop-color="#6e4630" stop-opacity="0.55"/><stop offset="0.22" stop-color="#6e4630" stop-opacity="0"/><stop offset="0.62" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="0.86" stop-color="#6e4630" stop-opacity="0.15"/><stop offset="1" stop-color="#6e4630" stop-opacity="0.6"/></linearGradient>`);
  defs.push(`<radialGradient id="${id}-water" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#bfe8ef"/><stop offset="0.6" stop-color="#7fc4d4"/><stop offset="1" stop-color="#4f97ab"/></radialGradient>`);
  defs.push(`<radialGradient id="${id}-tubglow"><stop offset="0" stop-color="#9ff0ff" stop-opacity="0.95"/><stop offset="0.6" stop-color="#5fd0e8" stop-opacity="0.5"/><stop offset="1" stop-color="#5fd0e8" stop-opacity="0"/></radialGradient>`);
  const body = `M${cx - rx} ${top}L${cx - rx + 1.5} ${bot}Q${cx} ${bot + 5} ${cx + rx - 1.5} ${bot}L${cx + rx} ${top}Z`;
  // Staves: lines spaced like the slats of a round tub, closer together towards the sides.
  const staves = mini
    ? ""
    : Array.from({ length: 15 }, (_, i) => {
        const t = -1 + ((i + 0.5) / 15) * 2;
        const x = cx + Math.sin((t * Math.PI) / 2) * (rx - 0.5);
        return `<path d="M${f(x)} ${top + 3}L${f(x - (x - cx) * 0.04)} ${f(bot + 4.6 * (1 - t * t))}" stroke="${cedarDk}" stroke-width="0.55" opacity="0.8"/>`;
      }).join("");
  const hoop = (y: number) =>
    `<path d="M${cx - rx + 0.3} ${y}Q${cx} ${y + 5} ${cx + rx - 0.3} ${y}" stroke="${band}" stroke-width="${mini ? 3 : 1.8}" fill="none"/>${
      mini ? "" : `<circle cx="${cx + rx - 4}" cy="${f(y + 0.9)}" r="0.8" fill="#9aa3a8"/><path d="M${cx - rx + 0.3} ${y - 0.7}Q${cx} ${y + 4.3} ${cx + rx - 0.3} ${y - 0.7}" stroke="#ffffff" stroke-width="0.4" opacity="0.35" fill="none"/>`
    }`;
  const deck = `<path d="M30 20V15H134V20Z" fill="${deckC}" stroke="${line(deckC)}" stroke-width="${W * 0.8}"/>${
    mini ? "" : `<path d="M30 17.5H134" stroke="${cedarDk}" stroke-width="0.5"/><path d="M40 15V20M56 15V20M108 15V20M124 15V20" stroke="${cedarDk}" stroke-width="0.5"/>`
  }`;
  const rail = mini ? "" : `<path d="M12 20V8M12 9H28M146 20V8M130 9H146M140 9V20" stroke="#9aa3a8" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const steps = mini ? "" : `<path d="M16 20V16H24V20ZM20 16V12H28V16" fill="${deckC}" stroke="${line(deckC)}" stroke-width="0.6"/>`;
  const ladder = `<path d="M4 22V94M10 22V94${mini ? "" : "M4 32h6M4 44h6M4 56h6M4 68h6M4 80h6M4 22Q4 15 10 15H14M10 22Q10 18 14 18"}" stroke="#7d868b" stroke-width="${mini ? 3 : 1.2}" fill="none"/>`;
  const rim = `<ellipse cx="${cx}" cy="${top}" rx="${rx + 1.2}" ry="${mini ? 5 : 6.2}" fill="${cedar}" stroke="${line(cedar)}" stroke-width="${W}"/>`;
  const water = `<ellipse cx="${cx}" cy="${top + 0.3}" rx="${rx - 2.2}" ry="${mini ? 3.4 : 4.4}" fill="url(#${id}-water)"/>`;
  const glow = `<ellipse class="tk-tubglow" cx="${cx}" cy="${top + 0.3}" rx="${rx - 2.2}" ry="${mini ? 3.4 : 4.4}" fill="url(#${id}-tubglow)"/>`;
  const ripples = mini
    ? ""
    : `<path class="tk-ripple" d="M${cx - 18} ${top}q5 -1.4 10 0t10 0M${cx + 2} ${top + 1.6}q4 -1.2 8 0t8 0" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.7" stroke-linecap="round"/>`;
  const towel = mini
    ? ""
    : `<path d="M${cx + 16} ${top + 3.5}Q${cx + 21} ${top + 2} ${cx + 25} ${top + 3}L${cx + 26} ${top + 15}Q${cx + 21} ${top + 16.5} ${cx + 17} ${top + 15}Z" fill="${CREAM}" stroke="${line(CREAM)}" stroke-width="0.6" stroke-linejoin="round"/><path d="M${cx + 16.6} ${top + 11}Q${cx + 21} ${top + 12.4} ${cx + 25.6} ${top + 11}" stroke="${CORAL}" stroke-width="1.6" fill="none"/>`;
  const steam = mini
    ? ""
    : [cx - 18, cx - 4, cx + 10, cx + 22]
        .map((x, i) => `<path class="tk-steam" style="animation-delay:${(i * 0.7).toFixed(1)}s" d="M${x} ${top - 3}q-4 -6 0 -11t0 -11" fill="none" stroke="#ffffff" stroke-width="${i % 2 ? 2 : 3}" stroke-linecap="round"/>`)
        .join("");
  return `${ladder}${rail}${deck}${steps}
    <path d="${body}" fill="${cedar}" stroke="${line(cedar)}" stroke-width="${W}" stroke-linejoin="round"/>
    ${mini ? "" : `<path d="${body}" fill="url(#${id}-staves)"/>`}${staves}${hoop(top + 7)}${hoop(bot - 4)}
    ${rim}${water}${glow}${ripples}${towel}${steam}`;
}

function trailer(paint: Paint, bodyFill: string, W: number, mini: boolean): string {
  const body = paint.finish === "woodie" ? WOOD : paint.top ? paint.top : paint.base;
  const fill = paint.finish === "chrome" || paint.finish === "gold" ? bodyFill : body;
  const shape = "M-72 100V80Q-72 54 -42 54Q-14 54 -8 84V100Z";
  const belt = paint.top ? paint.base : paint.belt;
  return `<g class="tk-trailer">
    <path d="M-10 99H6" stroke="#5a4f48" stroke-width="${mini ? 5 : 2.4}" stroke-linecap="round"/>
    <path d="${shape}" fill="${fill}" stroke="${line(body)}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M-72 84H-8.6V88.5H-72Z" fill="${belt}"/>
    <path d="M-70 60Q-56 56 -42 56" stroke="#ffffff" stroke-width="${mini ? 4 : 2}" fill="none" opacity="0.35" stroke-linecap="round"/>
    <circle cx="-40" cy="70" r="${mini ? 7 : 6}" fill="${GLASS}" stroke="${line(body)}" stroke-width="${W * 0.9}"/>
    ${mini ? "" : `<path d="M-62 98V74h12v24" fill="none" stroke="${line(body)}" stroke-width="0.8"/><circle cx="-52.5" cy="86" r="0.9" fill="${line(body)}"/><path d="M-43 66l-3 5M-38 65l-4 7" stroke="#ffffff" stroke-width="1" opacity="0.6"/>`}
    <path d="M-60 100A12 12 0 0 1 -28 100Z" fill="#3a332e"/>
    <circle cx="-44" cy="103" r="11" fill="${TYRE}"/><circle cx="-44" cy="103" r="5" fill="#6d6560"/><circle cx="-44" cy="103" r="2.6" fill="${CREAM}"/>
  </g>`;
}

function balloon(id: string, paint: Paint, W: number, mini: boolean, defs: string[]): string {
  const a = paint.finish === "woodie" ? WOOD : paint.base;
  const b = paint.top ?? CREAM;
  const env = "M64 -128C98 -128 106 -96 94 -72C88 -60 78 -52 73 -46H55C50 -52 40 -60 34 -72C22 -96 30 -128 64 -128Z";
  defs.push(`<clipPath id="${id}-env"><path d="${env}"/></clipPath>`);
  const gores: string[] = [];
  const n = mini ? 4 : 8;
  for (let i = 0; i < n; i++) {
    if (i % 2) continue;
    const x0 = 26 + (i / n) * 76;
    const x1 = 26 + ((i + 1) / n) * 76;
    gores.push(`<path d="M64 -130Q${f(x0 - 2)} -96 ${f(x0 * 0.4 + 64 * 0.6)} -46H${f(x1 * 0.4 + 64 * 0.6)}Q${f(x1 + 2)} -96 64 -130Z" fill="${b}"/>`);
  }
  return `<g class="tk-balloon">
    <path d="M64 -26Q86 -6 80 20" fill="none" stroke="#7d6a5a" stroke-width="${mini ? 2.5 : 0.8}"/>
    <path d="M55 -46L57 -36M73 -46L71 -36" stroke="#7d6a5a" stroke-width="${mini ? 2.5 : 0.8}"/>
    <path d="${env}" fill="${a}"/>
    <g clip-path="url(#${id}-env)">${gores.join("")}<rect x="20" y="-82" width="90" height="5" fill="${paint.belt}" opacity="0.9"/><path d="M40 -112Q50 -124 64 -124" stroke="#ffffff" stroke-width="${mini ? 5 : 3}" fill="none" opacity="0.35" stroke-linecap="round"/></g>
    <path d="${env}" fill="none" stroke="${line(a)}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M56 -36H72L70 -26H58Z" fill="#b8874f" stroke="${line("#b8874f")}" stroke-width="${W * 0.8}" stroke-linejoin="round"/>
    ${mini ? "" : `<path d="M57 -32H71M58.6 -29H69.4" stroke="#8a5a3c" stroke-width="0.5"/><path class="tk-flame" d="M64 -44q-2 -3 0 -6q2 3 0 6z" fill="${MUSTARD}"/>`}
  </g>`;
}

function airship(id: string, paint: Paint, W: number, mini: boolean): string {
  void id;
  const skin = "#e9e4da";
  const band = paint.finish === "woodie" ? WOOD : paint.base;
  return `<g class="tk-airship">
    <path d="M60 -72L46 -88H58L72 -76ZM60 -58L46 -42H58L72 -54Z" fill="${band}" stroke="${line(band)}" stroke-width="${W * 0.8}" stroke-linejoin="round"/>
    <ellipse cx="118" cy="-65" rx="62" ry="17" fill="${skin}" stroke="${line(skin)}" stroke-width="${W}"/>
    <path d="M58 -63.5H178" stroke="${band}" stroke-width="${mini ? 8 : 6}"/>
    ${mini ? "" : `<path d="M80 -79Q118 -86 160 -77" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.6" stroke-linecap="round"/><path d="M90 -81.5V-48.5M118 -82V-48M146 -81V-49.5" stroke="${line(skin)}" stroke-width="0.5" opacity="0.6"/>
    <text x="118" y="-69" text-anchor="middle" font-size="7.2" font-weight="700" letter-spacing="1.6" fill="${line(band)}">BUN VOYAGE</text>`}
    <path d="M106 -48H130L127 -42H109Z" fill="#5a4f48" stroke="${line("#5a4f48")}" stroke-width="${W * 0.7}"/>
    ${mini ? "" : `<path d="M112 -46h3M118 -46h3M124 -46h3" stroke="${WARM}" stroke-width="1.4"/>`}
    <path d="M53 -65l-4 -3v6z" fill="#7d868b"/>
  </g>`;
}

/** Outline for a fixed colour (module-level so small helpers can share it). */
function ln2(c: string): string {
  return line(c);
}

export const TRUCK_COLOURS = { WARM, DARK };
