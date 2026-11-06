import * as THREE from "three";
import type { Size } from "../../game/types";
import { bakedMesh, Parts } from "../bake";
import { STUDY } from "../units";
import { box, cached, canvasTex, cyl, decal, FONT, machine, rbox, sideProfile, studySpace, textDecal } from "./kit";

/*
 * Supplies and pass pieces: the supply shelf (two columns of steel bins with stickers), wrapped
 * sleeves, the fryer's packing pads and the trash chute. Study units below unless noted.
 */

export type SleeveKind = "cup" | "carton";
const SIZE_K: Record<Size, number> = { S: 0.82, M: 0.92, L: 1 };
const SLEEVE_LEN = 1.25;

const sleeveParts = (kind: SleeveKind, size: Size) => {
  const p = new Parts();
  const k = SIZE_K[size];
  const len = SLEEVE_LEN;
  if (kind === "cup") {
    const r = 0.42 * k;
    p.add(cyl(r, r * 0.9, len, 20), "#f6f3ec", { r: [0, 0, Math.PI / 2], p: [0, r, 0] });
    for (let i = 0; i < 4; i++) p.add(cyl(r + 0.012, r + 0.012, 0.04, 20), "#ddd6c8", { r: [0, 0, Math.PI / 2], p: [-len / 2 + 0.2 + (i * (len - 0.4)) / 3, r, 0], ink: false });
    p.add(cyl(r * 0.92, r * 0.92, 0.02, 20), "#e5573f", { r: [0, 0, Math.PI / 2], p: [len / 2 + 0.005, r, 0], ink: false });
  } else {
    const w = 0.62 * k;
    const h = 0.55 * k;
    p.add(rbox(len, h, w, 0.06), "#3f78c8", { p: [0, h / 2, 0] });
    for (let i = 0; i < 4; i++) p.add(box(0.05, h + 0.01, w + 0.01), "#f4ecd8", { p: [-len / 2 + 0.2 + (i * (len - 0.4)) / 3, h / 2, 0], ink: false });
  }
  // Plastic wrap sheen.
  p.add(box(len * 0.8, 0.01, 0.08), "#ffffff", { p: [0, (kind === "cup" ? 0.84 : 0.56) * k, -0.08], ink: false });
  return p;
};
const SLEEVES = new Map<string, ReturnType<typeof cached>>();
const sleeveBaked = (kind: SleeveKind, size: Size) => {
  const key = kind + size;
  let b = SLEEVES.get(key);
  if (!b) SLEEVES.set(key, (b = cached(() => sleeveParts(kind, size))));
  return b();
};

/**
 * A wrapped sleeve of cups or paper boats lying along z (or along x with `across`), its size
 * letter on top reading left to right. Game units, about 0.83 long.
 */
export function makeSleeve(kind: SleeveKind, size: Size, across = false): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = across ? 0 : Math.PI / 2;
  inner.add(bakedMesh(sleeveBaked(kind, size)));
  const st = studySpace();
  const t = textDecal(size, 0.32, { bg: "#3b2a3a", color: "#ffffff", fs: 64, w: 90, h: 90 });
  t.position.set(0, (kind === "cup" ? 0.85 : 0.56) * SIZE_K[size] + 0.01, 0);
  t.rotation.y = -inner.rotation.y;
  st.add(t);
  inner.add(st);
  g.add(inner);
  return g;
}

// ---- supply shelf ---------------------------------------------------------------

/** One bay of the supply shelf, game units: width, depth, and where each column and row sits. */
const BAY = { w: 3.9, d: 1.75 };
const COLS: Record<SleeveKind, number> = { cup: -2.15, carton: 2.15 };
const ROWS: Record<Size, number> = { S: -2.0, M: -0.2, L: 1.6 };
const BIN_H = 0.32;
/** The sloped label rail across the front of each bin: depth, and its height at the front and back. */
const RAIL = { d: 0.9, lo: 0.12, hi: 0.42 };
/** Its slope, so the sticker on it faces the steep counter camera. */
const RAIL_TILT = Math.atan2(RAIL.hi - RAIL.lo, RAIL.d);
const STEEL = "#c3cbca";
const STEEL_RIM = "#aeb8b7";

const INK = "#3b2a3a";
/** Sticker colours: soda red for cups, the sleeve's blue for paper boats. */
const STICKER: Record<SleeveKind, { bg: string; band: string; word: string }> = {
  cup: { bg: "#e65a46", band: "#ffd8cf", word: "CUPS" },
  carton: { bg: "#3f78c8", band: "#d6e4fa", word: "BOATS" },
};

/** A cup with a bent straw, drawn into a sticker at (cx, cy), `s` px per unit. */
function drawCupIcon(x: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  x.lineWidth = s * 0.09;
  x.lineJoin = x.lineCap = "round";
  x.strokeStyle = INK;
  // Straw first so the lid covers its foot.
  x.beginPath();
  x.moveTo(cx + s * 0.12, cy - s * 0.42);
  x.lineTo(cx + s * 0.22, cy - s * 0.9);
  x.lineTo(cx + s * 0.5, cy - s * 1.02);
  x.lineWidth = s * 0.16;
  x.stroke();
  x.strokeStyle = "#e5432b";
  x.lineWidth = s * 0.08;
  x.stroke();
  x.strokeStyle = INK;
  x.lineWidth = s * 0.09;
  // Cup body, tapering down, with a band.
  x.beginPath();
  x.moveTo(cx - s * 0.45, cy - s * 0.42);
  x.lineTo(cx + s * 0.45, cy - s * 0.42);
  x.lineTo(cx + s * 0.33, cy + s * 0.75);
  x.lineTo(cx - s * 0.33, cy + s * 0.75);
  x.closePath();
  x.fillStyle = "#fbf7ee";
  x.fill();
  x.stroke();
  x.fillStyle = "#6aa877";
  x.fillRect(cx - s * 0.39, cy + s * 0.02, s * 0.78, s * 0.24);
  // Lid.
  x.beginPath();
  x.roundRect(cx - s * 0.55, cy - s * 0.56, s * 1.1, s * 0.18, s * 0.08);
  x.fillStyle = "#fbf7ee";
  x.fill();
  x.stroke();
}

/** A paper boat heaped with fries, drawn into a sticker at (cx, cy). */
function drawBoatIcon(x: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  x.lineJoin = x.lineCap = "round";
  x.strokeStyle = INK;
  // Fries sticking up out of the boat, at a few angles.
  const sticks: [number, number][] = [[-0.42, -0.25], [-0.22, 0.05], [0, -0.12], [0.2, 0.15], [0.42, -0.2], [-0.08, 0.28], [0.3, 0.32]];
  for (const [dx, a] of sticks) {
    x.save();
    x.translate(cx + dx * s, cy - s * 0.05);
    x.rotate(a);
    x.beginPath();
    x.roundRect(-s * 0.08, -s * 0.85, s * 0.16, s * 0.85, s * 0.03);
    x.fillStyle = "#f3c84a";
    x.fill();
    x.lineWidth = s * 0.07;
    x.stroke();
    x.restore();
  }
  // The boat: a wide trapezoid with a checked band.
  x.beginPath();
  x.moveTo(cx - s * 0.78, cy - s * 0.1);
  x.lineTo(cx + s * 0.78, cy - s * 0.1);
  x.lineTo(cx + s * 0.55, cy + s * 0.6);
  x.lineTo(cx - s * 0.55, cy + s * 0.6);
  x.closePath();
  x.fillStyle = "#fbf7ee";
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = "#e5432b";
  for (let i = -5; i < 6; i += 2) x.fillRect(cx + i * s * 0.15, cy - s * 0.1, s * 0.15, s * 0.2);
  x.restore();
  x.lineWidth = s * 0.09;
  x.stroke();
}

const STICKERS = new Map<string, THREE.CanvasTexture>();
/**
 * A die-cut sticker for a supply bay: a white border round a coloured label with a cup or a fry
 * boat on it, the word and a big size letter in a badge. A little tilted, a little handmade.
 */
export function stickerTex(kind: SleeveKind, size: Size): THREE.CanvasTexture {
  const key = kind + size;
  let t = STICKERS.get(key);
  if (t) return t;
  const c = STICKER[kind];
  t = canvasTex(512, 192, (x, w, h) => {
    const pad = 10;
    // White die-cut border with a soft ink outline.
    x.beginPath();
    x.roundRect(pad, pad, w - pad * 2, h - pad * 2, 46);
    x.fillStyle = "#ffffff";
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = "rgba(59,42,58,.55)";
    x.stroke();
    // The coloured label inside.
    x.beginPath();
    x.roundRect(pad + 12, pad + 12, w - pad * 2 - 24, h - pad * 2 - 24, 36);
    x.fillStyle = c.bg;
    x.fill();
    // Icon in a cream disc on the left.
    x.beginPath();
    x.arc(104, h / 2, 62, 0, Math.PI * 2);
    x.fillStyle = c.band;
    x.fill();
    if (kind === "cup") drawCupIcon(x, 104, h / 2 + 8, 62);
    else drawBoatIcon(x, 104, h / 2 + 14, 52);
    // The word, and the size in a white badge.
    x.fillStyle = "#ffffff";
    x.font = `900 62px ${FONT}`;
    x.textAlign = "left";
    x.textBaseline = "middle";
    x.fillText(c.word, 182, h / 2 + 4);
    x.beginPath();
    x.arc(w - 82, h / 2, 50, 0, Math.PI * 2);
    x.fillStyle = "#ffffff";
    x.fill();
    x.fillStyle = INK;
    x.font = `900 70px ${FONT}`;
    x.textAlign = "center";
    x.fillText(size, w - 82, h / 2 + 5);
    // A shine across the top corner.
    x.beginPath();
    x.ellipse(w * 0.3, pad + 26, w * 0.18, 7, -0.04, 0, Math.PI * 2);
    x.fillStyle = "rgba(255,255,255,.35)";
    x.fill();
  });
  STICKERS.set(key, t);
  return t;
}

type Bay = { kind: SleeveKind; size: Size; x: number; y: number; z: number };

export interface SupplyShelfObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Cup S, M, L down the left column, then boat S, M, L down the right. */
      bays: Bay[];
      /** Size of one bay. */
      bayW: number;
      bayD: number;
    };
    /** Show 0 to 2 sleeves in bay i. */
    setBay: (i: number, count: number) => void;
  };
}

const shelfBody = (() => {
  let b: ReturnType<Parts["bake"]> | null = null;
  return () => {
    if (b) return b;
    const p = new Parts();
    for (const x of Object.values(COLS)) {
      for (const z of Object.values(ROWS)) {
        // A shallow steel bin: floor, low back and side walls, and a sloped label rail in front.
        p.add(box(BAY.w, 0.06, BAY.d), STEEL, { p: [x, 0.03, z] });
        p.add(box(BAY.w, BIN_H, 0.06), STEEL_RIM, { p: [x, BIN_H / 2, z - BAY.d / 2 + 0.03] });
        for (const sx of [-1, 1]) p.add(box(0.06, BIN_H, BAY.d), STEEL_RIM, { p: [x + sx * (BAY.w / 2 - 0.03), BIN_H / 2, z] });
        p.add(sideProfile([[0, 0], [0, RAIL.lo], [-RAIL.d, RAIL.hi], [-RAIL.d, 0]], BAY.w - 0.12), STEEL, { p: [x, 0.06, z + BAY.d / 2] });
      }
    }
    b = p.bake();
    b.geo.userData.shared = true;
    if (b.hull) b.hull.userData.shared = true;
    return b;
  };
})();


/**
 * The supply shelf: two columns of shallow steel bins on the counter, cup sleeves down the left and
 * paper-boat sleeves down the right, small at the back to large at the front. Each bin carries a
 * sticker on its sloped front rail. Game units: 8.2 x 5.35, 0.45 tall.
 */
export function makeSupplyShelf(): SupplyShelfObject {
  const g = new THREE.Group() as SupplyShelfObject;
  g.add(bakedMesh(shelfBody()));
  const bays: Bay[] = [];
  const sleeves: THREE.Object3D[][] = [];
  const tilt = [-0.035, 0.025, -0.015, 0.03, -0.025, 0.02];
  (["cup", "carton"] as SleeveKind[]).forEach((kind) => {
    (["S", "M", "L"] as Size[]).forEach((size) => {
      const x = COLS[kind];
      const z = ROWS[size];
      bays.push({ kind, size, x, y: 0.06, z });
      const list: THREE.Object3D[] = [];
      for (const dx of [-0.95, 0.95]) {
        // Sleeves lie across the bin, behind the label rail.
        const s = makeSleeve(kind, size, true);
        s.rotation.y = dx > 0 ? 0.06 : -0.04;
        s.scale.setScalar(1.25);
        s.position.set(x + dx, 0.06, z - BAY.d / 2 + (BAY.d - RAIL.d) / 2);
        g.add(s);
        list.push(s);
      }
      sleeves.push(list);
      const d = decal(stickerTex(kind, size), 2.5, 0.94);
      d.rotation.set(RAIL_TILT, tilt[bays.length - 1], 0);
      d.position.set(x, 0.06 + (RAIL.lo + RAIL.hi) / 2 + 0.01, z + BAY.d / 2 - RAIL.d / 2);
      g.add(d);
    });
  });
  machine(g, 8.2 / STUDY, 5.35 / STUDY, 0.45 / STUDY, { bays, bayW: BAY.w, bayD: BAY.d });
  g.userData.setBay = (i, count) => sleeves[i]?.forEach((s, k) => (s.visible = k < count));
  return g;
}

// ---- packing pads, trash chute --------------------------------------------------

const PAD = { w: 2.2, d: 1.6, gap: 1.9 };

export interface PackPadObject extends THREE.Group {
  userData: { footprint: { w: number; d: number }; h: number; spots: { pads: { x: number; y: number; z: number }[] } };
}

const padBody = cached(() => {
  const p = new Parts();
  const w = PAD.w * 2 + 0.4;
  // A small steel dump station (DESIGN §45): a rolled rim, a dark warming plate, and a sheet of
  // greaseproof paper on each pad, a little askew, in the same vocabulary as the trays and fryer.
  p.add(rbox(w, 0.16, PAD.d + 0.4, 0.04), "#c9d1cf", { p: [0, 0.08, 0] });
  p.add(rbox(w - 0.16, 0.05, PAD.d + 0.24, 0.03), "#3a4043", { p: [0, 0.165, 0], ink: false });
  for (const [i, x] of [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15].entries()) {
    p.add(box(PAD.w - 0.1, 0.01, PAD.d - 0.1), "#f3e9d3", { p: [x, 0.195, 0], r: [0, i ? -0.05 : 0.04, 0], ink: 0.01 });
  }
  // A row of small vent dots along the front lip.
  for (let i = 0; i < 9; i++) p.add(cyl(0.025, 0.025, 0.01, 6), "#8a9290", { p: [-w / 2 + 0.3 + (i * (w - 0.6)) / 8, 0.165, PAD.d / 2 + 0.16], ink: false });
  return p;
});

/** Two packing pads side by side along x, in game units 3.2 x 1.33. No heat glow: the heat is assumed to come from below. */
export function makePackPad(): PackPadObject {
  const g = new THREE.Group() as PackPadObject;
  g.add(bakedMesh(padBody()));
  const xs = [-PAD.gap / 2 - 0.15, PAD.gap / 2 + 0.15];
  machine(g, PAD.w * 2 + 0.4, PAD.d + 0.4, 0.2, { pads: xs.map((x) => ({ x: x * STUDY, y: 0.2 * STUDY, z: 0 })) });
  return g;
}

/**
 * A trash chute along a counter's front edge, `w` game units long and `d` deep: a dark slot in a
 * steel lip, closed by two rows of black rubber flaps that meet in the middle (they part as trash
 * drops through), with rounded steel end caps.
 */
export function makeTrashChute(w: number, d = 0.45): THREE.Group {
  const sw = w / STUDY;
  const sd = d / STUDY;
  const lip = 0.16;
  const p = new Parts();
  p.add(box(sw, 0.03, sd), "#2a2329", { p: [0, 0.01, 0], ink: false });
  for (const k of [-1, 1]) {
    p.add(box(sw + 0.04, 0.1, lip), "#d3d7d4", { p: [0, 0.05, k * (sd / 2 + lip / 2)], ink: false });
    p.add(box(sw + 0.04, 0.09, 0.045), "#6b716e", { p: [0, 0.045, k * (sd / 2 + lip + 0.022)], ink: false });
  }
  // Two rows of rubber flaps, back row a shade lighter, with hairline splits between them.
  const n = Math.max(1, Math.round(sw / 0.36));
  const fw = sw / n;
  const fd = sd / 2 - 0.025;
  for (let i = 0; i < n; i++) {
    const x = -sw / 2 + fw * (i + 0.5);
    p.add(box(fw - 0.06, 0.03, fd), "#4a4148", { p: [x, 0.045, -sd / 4 - 0.012], ink: false });
    p.add(box(fw - 0.06, 0.03, fd), "#3d353b", { p: [x, 0.04, sd / 4 + 0.012], ink: false });
  }
  // Rounded steel end caps: the chute stops just inside the outer counters, bookending the line.
  const r = sd / 2 + lip;
  for (const k of [-1, 1]) {
    const arc = (rr: number, h: number) => new THREE.CylinderGeometry(rr, rr, h, 24, 1, false, k < 0 ? Math.PI : 0, Math.PI);
    p.add(arc(r + 0.045, 0.09), "#6b716e", { p: [k * (sw / 2 + 0.02), 0.045, 0], ink: false });
    p.add(arc(r, 0.1), "#d3d7d4", { p: [k * (sw / 2 + 0.02), 0.05, 0], ink: false });
  }
  const g = new THREE.Group();
  // Unlit, so the slot stays properly dark and the steel lip bright under the kitchen's soft light.
  const m = bakedMesh(new Parts().addParts(p, { s: STUDY }).bake(), { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true }) });
  g.add(m);
  machine(g, sw, sd + lip * 2, 0.1, {});
  return g;
}
