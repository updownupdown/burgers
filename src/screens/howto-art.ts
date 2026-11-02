/**
 * How to Play's drawings: small inline SVGs, most of them short loops that act out one verb
 * (a tap, a drag, a flick, a stroke of sauce, a slice, the peel, the press lid, the quesadilla
 * fold, Undo, the doneness meter). CSS animates them (howto.css); a few motion paths are
 * generated here as keyframes (`ART_KEYFRAMES`) so a moving thing follows a drawn line exactly.
 *
 * Every drawing's resting state is a readable still frame, with a dashed guide for the motion,
 * so with reduced motion (animations off) it still explains the move.
 *
 * The thumb is the tutorial's: a see-through dark disc with a white edge (DESIGN §26).
 */
import { COOK_SCALE } from "../game/cooking";
import { cookMeter } from "../ui";
import { KIND_COLOR } from "../game/types";

type P = [number, number];

const INK = `stroke="#2a2622" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
const INK_T = `stroke="#2a2622" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"`;

/** The tutorial's thumb, centred on 0,0. */
const thumb = `<circle r="10.5" class="tch-o"/><circle r="9" class="tch-i"/>`;

/** n+1 points along a quadratic curve. */
function quad(a: P, c: P, b: P, n = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

const len = (pts: P[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Keyframes that carry an element along `pts` (drawn at pts[0]) at an even speed between two
 * points in the loop (percentages), still before and after.
 */
function follow(name: string, pts: P[], t0: number, t1: number, back?: { t0: number; t1: number }): string {
  const total = len(pts) || 1;
  let run = 0;
  const kf: string[] = [`0%, ${t0}% { transform: translate(0px, 0px); }`];
  pts.forEach((p, i) => {
    if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    if (!i) return;
    const at = t0 + ((t1 - t0) * run) / total;
    kf.push(`${r1(at)}% { transform: translate(${r1(p[0] - pts[0][0])}px, ${r1(p[1] - pts[0][1])}px); }`);
  });
  const end = pts[pts.length - 1];
  const tx = `translate(${r1(end[0] - pts[0][0])}px, ${r1(end[1] - pts[0][1])}px)`;
  if (back) kf.push(`${back.t0}% { transform: ${tx}; }`, `${back.t1}%, 100% { transform: translate(0px, 0px); }`);
  else kf.push(`100% { transform: ${tx}; }`);
  return `@keyframes ${name} { ${kf.join(" ")} }`;
}

/** A dashed guide along a path, with an arrowhead at its end. */
function guide(pts: P[], cls = ""): string {
  const d = `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join("L")}`;
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const head = (s: number) => `${r1(b[0] - 6 * Math.cos(ang + s))} ${r1(b[1] - 6 * Math.sin(ang + s))}`;
  return `<path class="hwa-guide ${cls}" d="${d}"/><path class="hwa-guide head ${cls}" d="M${head(0.5)}L${r1(b[0])} ${r1(b[1])}L${head(-0.5)}"/>`;
}

/* ---- paths the loops follow -------------------------------------------- */

const DRAG_PATH = quad([40, 74], [56, 26], [108, 20], 12);
const SAUCE_PATH: P[] = [[70, 36], [116, 42], [66, 52], [120, 58], [68, 70], [114, 78]];
const UNDO_PATH = quad([166, 44], [118, -14], [64, 82], 14);

/** Generated keyframes for the drawings' motion paths: put once in the guide. */
export const ART_KEYFRAMES = [
  follow("hwa-drag", DRAG_PATH, 18, 62, { t0: 94, t1: 95 }),
  follow("hwa-sauce", SAUCE_PATH, 16, 74, { t0: 92, t1: 96 }),
  follow("hwa-undo", UNDO_PATH, 26, 60, { t0: 90, t1: 91 }),
].join("\n");

/* ---- the drawings ------------------------------------------------------ */

/** A steel pan of tomato slices, for the tap and the drag. */
function pan(x: number, y: number, w: number, h: number, slices: P[]): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#c9cfcd" ${INK}/>
    <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="3" fill="#aeb6b4"/>
    ${slices.map(([sx, sy]) => tomato(sx, sy)).join("")}`;
}
const tomato = (x: number, y: number, rx = 11, ry = 5) =>
  `<g transform="translate(${x} ${y})"><ellipse rx="${rx}" ry="${ry}" fill="${KIND_COLOR.tomato}" ${INK_T}/><ellipse rx="${rx * 0.62}" ry="${ry * 0.55}" fill="#f08a6e"/><circle cx="${-rx * 0.3}" r="1" fill="#fbe3c6"/><circle cx="${rx * 0.3}" r="1" fill="#fbe3c6"/></g>`;

/** Tap a pan: its name pops up, nothing moves. */
export function tapArt(): string {
  return `<svg class="hwa hwa-tap" viewBox="0 0 150 100" aria-hidden="true">
    ${pan(28, 56, 94, 36, [[50, 70], [74, 78], [98, 70]])}
    <g transform="translate(75 30)"><g class="tap-bub">
      <rect x="-31" y="-12" width="62" height="21" rx="10.5" fill="#232a33"/>
      <path d="M-5 8.6 0 14l5-5.4z" fill="#232a33"/>
      <text y="3" text-anchor="middle" class="hwa-txt light">Tomato</text>
    </g></g>
    <g transform="translate(75 72)"><g class="tap-f">${thumb}</g></g>
  </svg>`;
}

/** Drag from a pan up onto the bun on a tray: the slice rides with the thumb. */
export function dragArt(): string {
  const [x0, y0] = DRAG_PATH[0];
  return `<svg class="hwa hwa-drag" viewBox="0 0 150 100" aria-hidden="true">
    <rect x="72" y="6" width="72" height="34" rx="4" fill="#d9b27c" ${INK}/>
    <path d="M78 14h60M78 31h60" stroke="#b98a54" stroke-width="1" opacity=".55"/>
    <ellipse cx="108" cy="24" rx="20" ry="6.5" fill="${KIND_COLOR.bun}" ${INK}/>
    ${pan(6, 60, 66, 34, [[26, 80], [52, 82]])}
    ${guide(DRAG_PATH.slice(1, -2))}
    <g transform="translate(${x0} ${y0})"><g class="drag-mv">
      <g class="drag-pc">${tomato(0, 0)}</g>
      <g class="drag-f">${thumb}</g>
    </g></g>
  </svg>`;
}

/** Flick up on a patty: it hops and turns over, its seared face up. */
export function flipArt(): string {
  const patty = (top: string, marks: boolean) => `<ellipse cx="0" cy="3" rx="25" ry="6.5" fill="#7a3f2a" ${INK}/>
    <rect x="-25" y="-3" width="50" height="6" fill="#9a5038"/>
    <path d="M-25 -3v6M25 -3v6" ${INK}/>
    <ellipse cx="0" cy="-3" rx="25" ry="6.5" fill="${top}" ${INK}/>
    ${marks ? `<path d="M-14 -6.5l6 7M-3 -8l7 8M8 -7.5l6 6.5" stroke="#3a1c10" stroke-width="2" stroke-linecap="round"/>` : `<circle cx="-8" cy="-4" r="1.6" fill="#f3b4bd"/><circle cx="6" cy="-2" r="1.4" fill="#f3b4bd"/>`}`;
  return `<svg class="hwa hwa-flip" viewBox="0 0 150 100" aria-hidden="true">
    <rect x="10" y="68" width="130" height="14" rx="3" fill="#3b3734" ${INK}/>
    <path d="M22 72v6M38 72v6M54 72v6M70 72v6M86 72v6M102 72v6M118 72v6" stroke="#6a645d" stroke-width="2"/>
    <path class="hwa-guide" d="M108 58c10-12 8-30-8-36"/><path class="hwa-guide head" d="M106 25l-6-3 2 6"/>
    <g transform="translate(75 60)"><g class="flip-p">
      <g class="flip-a">${patty("#e58c95", false)}</g>
      <g class="flip-b">${patty("#93502f", true)}</g>
    </g></g>
    <g transform="translate(75 62)"><g class="flip-f">${thumb}</g></g>
    <path class="flip-streak" d="M68 50v-14M75 46v-18M82 50v-14" stroke="#2a2622" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

/** Draw a stroke of ketchup over a patty; the level bar on the left fills toward Perfect. */
export function sauceArt(): string {
  const d = `M${SAUCE_PATH.map((p) => p.join(" ")).join("L")}`;
  const [x0, y0] = SAUCE_PATH[0];
  return `<svg class="hwa hwa-sauce" viewBox="0 0 160 110" aria-hidden="true">
    <rect x="10" y="14" width="10" height="84" rx="5" fill="#2c2f33" ${INK}/>
    <rect x="12" y="45" width="6" height="21" fill="#4e7d6a" opacity=".55"/>
    <g class="sauce-lvl"><rect x="12" y="16" width="6" height="80" rx="3" fill="${KIND_COLOR.ketchup}"/></g>
    <path d="M6 55.5h18" stroke="#f6f2ea" stroke-width="1.6"/>
    <ellipse cx="92" cy="57" rx="42" ry="34" fill="${KIND_COLOR.bun}" ${INK}/>
    <ellipse cx="92" cy="57" rx="35" ry="28" fill="#8a4a33" ${INK}/>
    <path class="sauce-line" d="${d}" pathLength="1" fill="none" stroke="${KIND_COLOR.ketchup}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(${x0} ${y0})"><g class="sauce-b"><g class="sauce-bo" transform="rotate(28)">
      <path d="M0 0-2.6-8h5.2z" fill="#f4efe6" ${INK_T}/>
      <rect x="-7.5" y="-34" width="15" height="27" rx="4.5" fill="#cf3b2a" ${INK}/>
      <rect x="-5.5" y="-12" width="11" height="3" rx="1" fill="#f4efe6"/>
    </g></g></g>
  </svg>`;
}

/** The knife goes across a panini on the board; the halves part. `four` cuts a flatbread twice. */
export function knifeArt(four = false): string {
  const knife = `<g class="knife-k"><path d="M0 0-5-7v-25h8v28z" fill="#e3e8e8" ${INK}/><rect x="-5.5" y="-48" width="9" height="16" rx="2.5" fill="#4b3a2a" ${INK}/></g>`;
  if (four) {
    const q = (cls: string, d: string) => `<g class="${cls}"><path d="${d}" fill="#e3ad5a" ${INK}/><path d="${d}" fill="#c8402a" transform="translate(80 50) scale(.78) translate(-80 -50)"/></g>`;
    return `<svg class="hwa hwa-knife four" viewBox="0 0 160 100" aria-hidden="true">
      <rect x="22" y="6" width="116" height="88" rx="8" fill="#e3c08e" ${INK}/>
      <path d="M30 22h100M30 78h100" stroke="#c9a06a" stroke-width="1" opacity=".6"/>
      ${q("knq a", "M80 50V16a34 34 0 0 0-34 34z")}${q("knq b", "M80 50V16a34 34 0 0 1 34 34z")}
      ${q("knq c", "M80 50H46a34 34 0 0 0 34 34z")}${q("knq d", "M80 50h34a34 34 0 0 1-34 34z")}
      <path class="cut-line one" d="M80 12v76" pathLength="1"/>
      <path class="cut-line two" d="M42 50h76" pathLength="1"/>
      <g transform="translate(80 8)"><g class="knife-mv one">${knife}</g></g>
      <g transform="translate(40 50)"><g class="knife-mv two"><g transform="rotate(-90)">${knife}</g></g></g>
    </svg>`;
  }
  const lines = [40, 47, 54, 61].map((y) => `<path d="M48 ${y}h64" stroke="#94592b" stroke-width="1.3" opacity=".7"/>`).join("");
  return `<svg class="hwa hwa-knife" viewBox="0 0 160 100" aria-hidden="true">
    <rect x="18" y="14" width="124" height="72" rx="7" fill="#e3c08e" ${INK}/>
    <path d="M26 26h108M26 74h108" stroke="#c9a06a" stroke-width="1" opacity=".6"/>
    <defs><clipPath id="hwa-kl"><rect x="40" y="30" width="40" height="40"/></clipPath><clipPath id="hwa-kr"><rect x="80" y="30" width="40" height="40"/></clipPath></defs>
    <g class="kn-l"><g clip-path="url(#hwa-kl)"><rect x="44" y="33" width="72" height="34" rx="8" fill="#e9b25c" ${INK}/>${lines}</g><path d="M80 33v34" ${INK}/></g>
    <g class="kn-r"><g clip-path="url(#hwa-kr)"><rect x="44" y="33" width="72" height="34" rx="8" fill="#e9b25c" ${INK}/>${lines}</g><path d="M80 33v34" ${INK}/></g>
    <path class="cut-line" d="M80 22v56" pathLength="1"/>
    <g transform="translate(80 18)"><g class="knife-mv">${knife}</g></g>
  </svg>`;
}

/** The peel: pushed in under a pie on the oven deck, carried out over a tray, a swipe down sets it there. */
export function peelArt(): string {
  return `<svg class="hwa hwa-peel" viewBox="0 0 260 104" aria-hidden="true">
    <rect x="4" y="14" width="10" height="54" fill="#c8664a" ${INK}/>
    <path d="M4 26h10M4 38h10M4 50h10M9 14v12M9 38v12" stroke="#2a2622" stroke-width="1" opacity=".4"/>
    <rect x="14" y="20" width="4" height="46" rx="2" fill="#ff8a2a" opacity=".85"/>
    <rect x="18" y="20" width="30" height="46" fill="#ffa860" opacity=".18"/>
    <rect x="4" y="66" width="124" height="9" fill="#dcc8a4" ${INK}/>
    <rect x="158" y="82" width="66" height="7" rx="2" fill="#d9b27c" ${INK}/>
    <path d="M176 82v7M206 82v7" stroke="#b98a54" stroke-width="1" opacity=".6"/>
    <path class="hwa-guide" d="M150 40c10-6 26-8 38-4"/><path class="hwa-guide head" d="M182 32l6 4-6 3"/>
    <path class="hwa-guide" d="M234 48v24"/><path class="hwa-guide head" d="M230 66l4 6 4-6"/>
    <g class="peel-pie"><rect x="36" y="58" width="50" height="8" rx="4" fill="#e3ad5a" ${INK}/><path d="M42 59.5h38" stroke="#c8402a" stroke-width="2.4" stroke-linecap="round"/><circle cx="52" cy="59" r="1.6" fill="#fbf6e6"/><circle cx="68" cy="59.4" r="1.6" fill="#fbf6e6"/></g>
    <g class="peel-p">
      <path d="M92 64h50v2.6H96z" fill="#d9ad74" ${INK}/>
      <rect x="140" y="63.2" width="44" height="4" rx="2" fill="#b98a54" ${INK}/>
      <rect x="168" y="62.6" width="16" height="5.2" rx="2.6" fill="#4b3a2a"/>
      <g transform="translate(176 65)"><g class="peel-f">${thumb}</g></g>
    </g>
  </svg>`;
}

/** The press: pull the handle down to shut the lid, the bread turns golden, swipe the handle up. */
export function pressArt(): string {
  return `<svg class="hwa hwa-press" viewBox="0 0 160 104" aria-hidden="true">
    <rect x="22" y="76" width="100" height="18" rx="3" fill="#aab3b1" ${INK}/>
    <circle cx="110" cy="85" r="2.6" fill="#ff9a2a" ${INK_T}/>
    <rect x="26" y="70" width="92" height="7" rx="1.5" fill="#2f3336" ${INK}/>
    <rect class="press-bread" x="36" y="63" width="70" height="8" rx="3.5" fill="#f3e2b8" ${INK}/>
    <path class="press-lines" d="M44 66.5h54" stroke="#94592b" stroke-width="1.4"/>
    <g class="press-steam"><path d="M50 50c-2-3 2-4 0-8M70 48c-2-3 2-4 0-8M90 50c-2-3 2-4 0-8" fill="none" stroke="#9aa0a0" stroke-width="1.6" stroke-linecap="round"/></g>
    <path class="hwa-guide" d="M140 46V18"/><path class="hwa-guide head" d="M136 24l4-6 4 6"/>
    <g class="press-lid">
      <rect x="22" y="52" width="92" height="11" rx="3" fill="#c9cfcd" ${INK}/>
      <path d="M28 60h80" stroke="#2a2622" stroke-width="1" opacity=".3"/>
      <path d="M112 57.5h16" stroke="#2a2622" stroke-width="6" stroke-linecap="round"/><path d="M112 57.5h16" stroke="#d8573a" stroke-width="3.6" stroke-linecap="round"/>
      <g transform="translate(128 57.5)"><g class="press-f">${thumb}</g></g>
    </g>
    <circle cx="24" cy="62" r="2.4" fill="#5a6064"/>
  </svg>`;
}

/** A quesadilla: the edge dragged across folds it; a press and hold opens it back out. */
export function quesaArt(): string {
  const strands = (lower: boolean) =>
    [[-14, 8], [2, 14], [12, 6], [-4, 20], [-18, 18], [16, 18]]
      .map(([x, y]) => `<rect x="${80 + x}" y="${50 + (lower ? y : -y) - 1.2}" width="10" height="2.6" rx="1.3" fill="${KIND_COLOR.jack}" transform="rotate(${(x * 7) % 40} ${85 + x} ${50 + (lower ? y : -y)})"/>`)
      .join("");
  return `<svg class="hwa hwa-quesa" viewBox="0 0 160 100" aria-hidden="true">
    <rect x="6" y="8" width="148" height="86" rx="7" fill="#33302c" ${INK}/>
    <path d="M80 50m-32 0a32 32 0 0 0 64 0z" fill="#f6ecd2" ${INK}/>${strands(true)}
    <g class="q-flap"><path d="M48 50a32 32 0 0 1 64 0z" fill="#f6ecd2" ${INK}/>${strands(false)}</g>
    <g class="q-over"><path d="M48 50a32 32 0 0 0 64 0z" fill="#ead19a" ${INK}/><circle cx="68" cy="62" r="2" fill="#c98a4a"/><circle cx="92" cy="70" r="1.7" fill="#c98a4a"/><circle cx="84" cy="58" r="1.4" fill="#c98a4a"/></g>
    <path d="M48 50h64" stroke="#2a2622" stroke-width="1.2" stroke-dasharray="2 3" opacity=".6"/>
    <path class="hwa-guide q-g1" d="M128 22v50"/><path class="hwa-guide head q-g1" d="M124 66l4 6 4-6"/>
    <g transform="translate(80 22)"><g class="q-fold">${thumb}</g></g>
    <g transform="translate(80 68)"><g class="q-hold">
      <circle r="15" class="q-ring-bg"/><circle r="15" class="q-ring" pathLength="1" transform="rotate(-90)"/>${thumb}
    </g></g>
  </svg>`;
}

/** Undo: the button in the header is tapped, and the tomato flies off the burger back into its pan. */
export function undoArt(): string {
  const [x0, y0] = UNDO_PATH[0];
  return `<svg class="hwa hwa-undo" viewBox="0 0 230 104" aria-hidden="true">
    <rect x="4" y="4" width="90" height="26" rx="13" fill="#2a3340"/>
    <g transform="translate(17 17)">
      <circle r="10" class="undo-btn-bg"/>
      <path d="M-4.6 -2.6h5.2a4.4 4.4 0 0 1 0 8.8h-3.8M-2 -6l-3.4 3.4 3.4 3.4" fill="none" stroke="#232a33" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <rect x="34" y="12" width="34" height="10" rx="5" fill="#3a4452"/>
    <rect x="120" y="32" width="102" height="44" rx="4" fill="#d9b27c" ${INK}/>
    <ellipse cx="166" cy="60" rx="24" ry="7.5" fill="${KIND_COLOR.bun}" ${INK}/>
    <ellipse cx="166" cy="53" rx="22" ry="5.5" fill="#8a4a33" ${INK}/>
    ${pan(32, 74, 70, 26, [[52, 87], [80, 89]])}
    ${guide(UNDO_PATH.slice(2, -2))}
    <g transform="translate(${x0} ${y0})"><g class="undo-mv"><g class="undo-pc">${tomato(0, 0, 13, 4.6)}</g></g></g>
    <g transform="translate(17 17)"><g class="undo-f">${thumb}</g></g>
  </svg>`;
}

/**
 * The doneness meter (M14), the real markup, its fill running through not done, done (the hatched
 * band) and over to burnt, with the patty above it changing to match. At rest it shows done.
 */
export function meterArt(): string {
  const z = COOK_SCALE.patty;
  const u = (z.done / z.burnt) * 100;
  const d = (z.over / z.burnt) * 100;
  return `<div class="hwm" style="--mu:${u.toFixed(1)}%;--md:${d.toFixed(1)}%">
    <svg class="hwm-patty" viewBox="0 0 80 24" aria-hidden="true"><ellipse cx="40" cy="15" rx="30" ry="7" fill="#5a2c1c" ${INK}/><ellipse class="hwm-top" cx="40" cy="11" rx="30" ry="7" ${INK}/></svg>
    ${cookMeter("patty", z.perfect)}
    <div class="hwm-lbl" aria-hidden="true"><span>Not yet</span><span>Done</span><span>Over</span></div>
  </div>`;
}

/* ---- still drawings ----------------------------------------------------- */

/** The grill from the front: the ridged grille, the flat plate and the warm end, each with its power button and lamps. */
export function grillArt(): string {
  const zone = (x: number, lamps: ("red" | "orange" | "")[], label: string) => `
    <g transform="translate(${x} 0)">
      <circle cx="20" cy="72" r="7" fill="#f4efe6" ${INK}/><path d="M20 68.4v3.4M17.2 69.6a4 4 0 1 0 5.6 0" fill="none" stroke="#2a2622" stroke-width="1.3" stroke-linecap="round"/>
      ${lamps.map((c, i) => `<circle cx="${33 + i * 7}" cy="72" r="2.6" fill="${c === "red" ? "#e2412c" : c === "orange" ? "#f29a2e" : "#5b5650"}" ${INK_T}/>`).join("")}
      <text x="24" y="92" text-anchor="middle" class="hwa-txt">${label}</text>
    </g>`;
  return `<svg class="hwa hwa-grill" viewBox="0 0 160 98" aria-hidden="true">
    <rect x="6" y="18" width="148" height="44" rx="4" fill="#4b4640" ${INK}/>
    <rect x="8" y="20" width="48" height="40" fill="#3b3734"/>
    ${[12, 18, 24, 30, 36, 42, 48].map((x) => `<path d="M${x} 22v36" stroke="#6a645d" stroke-width="2.2"/>`).join("")}
    <path d="M56 20v40M104 20v40" stroke="#2a2622" stroke-width="1.2"/>
    <rect x="104.6" y="20" width="48.4" height="40" fill="#f29a2e" opacity=".14"/>
    <ellipse cx="31" cy="38" rx="13" ry="5" fill="#93502f" ${INK_T}/><path d="M24 35l4 5M30 34l4 6M36 35l3 4" stroke="#3a1c10" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="80" cy="40" rx="12" ry="7" fill="#f7f4ee" ${INK_T}/><circle cx="81" cy="40" r="3.6" fill="#ffcf2e"/>
    <ellipse cx="129" cy="40" rx="15" ry="5" fill="#e9b25c" ${INK_T}/>
    <path d="M30 14c-1.2-1.6 1.2-2.6 0-4.4M80 14c-1.2-1.6 1.2-2.6 0-4.4" fill="none" stroke="#c8472e" stroke-width="1.3" stroke-linecap="round"/>
    ${zone(8, ["red", "red"], "Grille")}${zone(56, ["red", "red"], "Flat")}${zone(105, ["orange", ""], "Warm")}
  </svg>`;
}

/** The comal: hot under the left two thirds, warm at the right end with the taco rack at its back. */
export function comalArt(): string {
  const taco = (x: number) => `<g transform="translate(${x} 0)"><path d="M-8 30a8 9 0 0 0 16 0z" fill="#f0cf6a" ${INK_T}/><path d="M-6 30c2-3 4-3 6-1 2-2 4-2 6 1" fill="#8a3b2a"/><circle cx="-2" cy="27.5" r="1.2" fill="#6fa64a"/><circle cx="3" cy="27" r="1.1" fill="#f3efe2"/></g>`;
  return `<svg class="hwa hwa-comal" viewBox="0 0 160 98" aria-hidden="true">
    <rect x="6" y="40" width="148" height="30" rx="4" fill="#33302c" ${INK}/>
    <rect x="104" y="40" width="50" height="30" rx="0" fill="#f29a2e" opacity=".13"/>
    <path d="M104 40v30" stroke="#f6f2ea" stroke-width="1" stroke-dasharray="2 3" opacity=".5"/>
    <g transform="translate(112 14)"><path d="M-6 20h44l-3 14H-3z" fill="#9aa0a0" ${INK_T}/>${taco(4)}${taco(18)}${taco(32)}</g>
    <ellipse cx="34" cy="55" rx="17" ry="7" fill="#f0cf6a" ${INK_T}/><circle cx="29" cy="54" r="1.3" fill="#b0702e"/><circle cx="39" cy="56.5" r="1.1" fill="#b0702e"/>
    <ellipse cx="74" cy="55" rx="17" ry="7" fill="#f6ecd2" ${INK_T}/>
    <path d="M18 80c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2zM40 80c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2zM62 80c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2zM84 80c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2z" fill="#ff8a2a"/>
    <text x="55" y="94" text-anchor="middle" class="hwa-txt">Hot</text>
    <text x="129" y="94" text-anchor="middle" class="hwa-txt">Warm · rack</text>
  </svg>`;
}

/** The deck oven from above: brick walls, the element glowing along the back, a pie browner on the side facing it, turned by the peel's tip. */
export function ovenArt(): string {
  return `<svg class="hwa hwa-oven" viewBox="0 0 160 92" aria-hidden="true">
    <rect x="10" y="6" width="140" height="56" rx="2" fill="#dcc8a4" ${INK}/>
    <rect x="10" y="6" width="140" height="10" fill="#c8664a" ${INK}/>
    <rect x="10" y="6" width="10" height="56" fill="#b05e40" ${INK}/>
    <rect x="140" y="6" width="10" height="56" fill="#b05e40" ${INK}/>
    <path d="M20 11h120M45 6v5M70 6v5M95 6v5M120 6v5" stroke="#e7c9a8" stroke-width="1"/>
    <rect x="20" y="16" width="120" height="14" fill="#ffa860" opacity=".35"/>
    <rect x="22" y="16.5" width="116" height="3" rx="1.5" fill="#ff8a2a"/>
    <text x="80" y="27.5" text-anchor="middle" class="hwa-txt hot">HOT BACK WALL</text>
    <ellipse cx="72" cy="43" rx="24" ry="13" fill="#f1dcaa" ${INK}/>
    <path d="M48 43a24 13 0 0 1 48 0z" fill="#d99a48"/>
    <ellipse cx="72" cy="43" rx="18" ry="9" fill="#c8402a"/>
    <g fill="#fbf6e6"><circle cx="65" cy="42" r="2.4"/><circle cx="75" cy="46" r="2.4"/><circle cx="79" cy="39" r="2.2"/></g>
    <path d="M76 55h26v8H76z" fill="#d9ad74" ${INK}/>
    <path d="M89 63v26" stroke="#b98a54" stroke-width="4" stroke-linecap="round"/>
    <path class="hwa-guide" d="M106 59h14"/><path class="hwa-guide head" d="M116 55l4 4-4 4"/>
    <path class="hwa-guide" d="M100 32a28 16 0 0 1 0 20"/><path class="hwa-guide head" d="M97 29l3 3-4 2"/>
  </svg>`;
}

/** The Bean Tostada in four frames: corn tortilla, the fryer basket, the shell on a tray, built. */
export function tostadaFlow(): string {
  const frame = (svg: string, cap: string) => `<li><svg viewBox="0 0 60 44" aria-hidden="true">${svg}</svg><span>${cap}</span></li>`;
  const shell = (y: number) => `<ellipse cx="30" cy="${y}" rx="22" ry="7" fill="${KIND_COLOR.tostada}" ${INK}/><circle cx="22" cy="${y - 1}" r="1.4" fill="#c98a3a"/><circle cx="36" cy="${y + 1.5}" r="1.2" fill="#c98a3a"/>`;
  return `<ol class="hw-flow">
    ${frame(`<ellipse cx="30" cy="26" rx="22" ry="8" fill="${KIND_COLOR.corn}" ${INK}/><circle cx="23" cy="25" r="1.3" fill="#b0702e"/><circle cx="37" cy="28" r="1.1" fill="#b0702e"/>`, "Corn tortilla")}
    ${frame(`<rect x="6" y="26" width="48" height="14" rx="3" fill="#e0a83a" ${INK}/><path d="M10 14h40l-3 16H13z" fill="#e4ded3" ${INK}/><path d="M20 15v14M30 15v14M40 15v14M11 22h38" stroke="#2a2622" stroke-width=".9" opacity=".5"/><ellipse cx="30" cy="20" rx="15" ry="4" fill="${KIND_COLOR.tostada}" ${INK_T}/>`, "Fry it")}
    ${frame(`<rect x="4" y="30" width="52" height="7" rx="2" fill="#d9b27c" ${INK}/>${shell(27)}`, "Up to a tray")}
    ${frame(`<rect x="4" y="32" width="52" height="7" rx="2" fill="#d9b27c" ${INK}/>${shell(29)}<ellipse cx="30" cy="25.5" rx="16" ry="4.6" fill="${KIND_COLOR.beans}" ${INK_T}/><path d="M18 23l5-2M26 21l6 1M34 22l6-2M22 25l5 1" stroke="#7fb24f" stroke-width="2" stroke-linecap="round"/><path d="M20 21h6M30 20h7M38 23h5" stroke="${KIND_COLOR.jack}" stroke-width="1.6" stroke-linecap="round"/><path d="M14 22c4-3 6 2 10-1s6 2 10-1 6 2 10-1" fill="none" stroke="${KIND_COLOR.crema}" stroke-width="2.2" stroke-linecap="round"/>`, "Toppings, crema")}
  </ol>`;
}
