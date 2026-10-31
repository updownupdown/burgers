import * as THREE from "three";
import { bakedMesh, Parts } from "./bake";
import { grade, lineColor, outline, texturedToon } from "./materials";
import { box, C, cached, canvasTex, cyl, decal, FONT, machine, rbox, sph, studyMesh, studySpace } from "./machines/kit";
import { STUDY } from "./units";

/*
 * Working kit (the study's "Working kit" pick): the things a working cook keeps to hand. A ticket
 * rail with orders clipped on, a tea towel over the counter edge, a utensil crock, a wall paper
 * roll and a dial timer. Built in study units (10 cm) and returned in game units like the
 * machines, with userData.footprint and h. Place them on the wall, the edges and the corners,
 * never on a tap target.
 */

const PAPER = "#fffdf6";
const INK = "#3b2a3a";

/** A paper order ticket: number at the top, a few lines of scrawl, a torn foot. */
const TICKETS = new Map<number, THREE.CanvasTexture>();
function ticketTex(seed: number): THREE.CanvasTexture {
  let t = TICKETS.get(seed);
  if (t) return t;
  t = canvasTex(128, 200, (x, w, h) => {
    x.fillStyle = PAPER;
    x.fillRect(0, 0, w, h - 6);
    x.fillStyle = INK;
    x.font = `800 22px ${FONT}`;
    x.fillText("#" + (20 + seed), 10, 28);
    x.fillStyle = "rgba(59,42,58,.55)";
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 4 + (seed % 3); i++) x.fillRect(10, 46 + i * 22, 50 + r() * 55, 7);
    // Torn foot.
    x.fillStyle = PAPER;
    for (let i = 0; i < w; i += 10) {
      x.beginPath();
      x.moveTo(i, h - 6);
      x.lineTo(i + 5, h);
      x.lineTo(i + 10, h - 6);
      x.fill();
    }
  });
  TICKETS.set(seed, t);
  return t;
}

export interface TicketRailObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Where each ticket hangs from the rail (its top centre), left to right. */
      clips: { x: number; y: number; z: number }[];
      /** Ticket size, game units. */
      ticket: { w: number; h: number };
    };
    /** Show the first n placeholder tickets. */
    setTickets: (n: number) => void;
  };
}

const TICKET = { w: 1.0, h: 1.6 };

/**
 * A steel ticket rail for the wall, `w` game units long (default 5), with `tickets` placeholder
 * orders clipped on (default 3). Origin: the rail's centre, against the wall (z 0); it faces +z
 * and the tickets hang below it. Swap a ticket's map for a real order if you want it to double as UI.
 */
export function makeTicketRail(w = 5, o: { tickets?: number } = {}): TicketRailObject {
  const sw = w / STUDY;
  const g = new THREE.Group() as TicketRailObject;
  const p = new Parts();
  p.add(rbox(sw, 0.18, 0.18, 0.06), C.steelL, { p: [0, 0, 0.09] });
  p.add(box(sw - 0.1, 0.04, 0.04), C.steelD, { p: [0, -0.07, 0.19], ink: false });
  for (const x of [-sw / 2 + 0.25, sw / 2 - 0.25]) p.add(cyl(0.06, 0.06, 0.1, 10), C.steelD, { p: [x, 0, 0.0], r: [Math.PI / 2, 0, 0] });
  g.add(studyMesh(p));
  const st = studySpace();
  g.add(st);
  const n = Math.max(1, Math.floor((sw - 0.4) / 1.5));
  const clips: { x: number; y: number; z: number }[] = [];
  const tickets: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.5;
    clips.push({ x: x * STUDY, y: -0.06 * STUDY, z: 0.2 * STUDY });
    const t = decal(ticketTex(i), TICKET.w, TICKET.h, { up: false });
    t.position.set(x, -0.06 - TICKET.h / 2, 0.21);
    t.rotation.z = (i % 3 - 1) * 0.04;
    st.add(t);
    tickets.push(t);
  }
  machine(g, sw, 0.3, 0.18 + TICKET.h, { clips, ticket: { w: TICKET.w * STUDY, h: TICKET.h * STUDY } });
  g.userData.setTickets = (k) => tickets.forEach((t, i) => (t.visible = i < k));
  g.userData.setTickets(o.tickets ?? 3);
  return g;
}

// ---- towel -------------------------------------------------------------------------

/** Tea-towel check in blueberry on cream: no food in the game is blue, so it can't read as an ingredient. */
let checkTex: THREE.CanvasTexture | null = null;
function towelTex(): THREE.CanvasTexture {
  if (checkTex) return checkTex;
  const a = "#" + grade("#f6efe0").getHexString();
  const b = "#" + grade("#6a8fd8").getHexString();
  checkTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = a;
    x.fillRect(0, 0, w, h);
    x.fillStyle = b;
    x.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) {
      x.fillRect(i * 16, 0, 8, h);
      x.fillRect(0, i * 16, w, 8);
    }
    x.globalAlpha = 1;
  });
  checkTex.wrapS = checkTex.wrapT = THREE.RepeatWrapping;
  return checkTex;
}

const TOWEL = { w: 1.3, top: 0.95, drop: 1.25, t: 0.04, r: 0.05 };

/**
 * A folded tea towel hung over a counter's front edge. Origin: the counter's front top edge
 * (y 0, z 0). It lies back along the top to z -0.63 and hangs 0.83 down the front, in game units.
 */
export function makeTowel(): THREE.Group {
  const g = new THREE.Group();
  const { w, top, drop, t, r } = TOWEL;
  const arc = (Math.PI / 2) * r;
  const len = top + arc + drop;
  const geo = new THREE.BoxGeometry(w, t, len, 6, 1, 40);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    const s = pos.getZ(i) + len / 2; // 0 at the back end, len at the hanging end
    let cy: number;
    let cz: number;
    let ny: number;
    let nz: number;
    if (s < top) {
      cy = r;
      cz = -top + s;
      ny = 1;
      nz = 0;
    } else if (s < top + arc) {
      const a = (s - top) / r; // 0 .. pi/2 over the edge
      ny = Math.cos(a);
      nz = Math.sin(a);
      cy = ny * r;
      cz = nz * r;
    } else {
      const d = s - top - arc;
      // The hanging part swings out a touch and ripples, so it reads as cloth.
      cy = -d;
      cz = r + 0.02 * d + 0.025 * Math.sin(x * 9 + d * 3) * Math.min(1, d * 2);
      ny = 0;
      nz = 1;
    }
    pos.setXYZ(i, x * (1 - 0.03 * Math.max(0, s - top - arc)), cy + ny * yy, cz + nz * yy);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, texturedToon(towelTex()));
  m.castShadow = m.receiveShadow = true;
  outline(m, 1.015, lineColor(grade("#6a8fd8")));
  const inner = studySpace();
  inner.add(m);
  g.add(inner);
  machine(g, w, top + r + t, drop + r, {});
  return g;
}

// ---- utensil crock ---------------------------------------------------------------------

const crockParts = cached(() => {
  const p = new Parts();
  p.add(cyl(0.38, 0.34, 0.9, 18), "#6a8fd8", { p: [0, 0.45, 0] });
  p.add(cyl(0.4, 0.4, 0.06, 18), "#7d9ee0", { p: [0, 0.9, 0] });
  p.add(cyl(0.33, 0.33, 0.02, 18), "#2f3740", { p: [0, 0.92, 0], ink: false });
  // A wooden spoon, a rubber spatula and steel tongs, leaning out of the mouth.
  const spoon = new Parts();
  spoon.add(rbox(0.09, 1.55, 0.09, 0.04), "#c98f5a", { p: [0, 0.78, 0] });
  spoon.add(sph(0.16, 10, 6), "#c98f5a", { p: [0, 1.62, 0], s: [1, 1.3, 0.45] });
  p.addParts(spoon, { p: [-0.1, 0.35, 0.05], r: [0.08, 0, 0.18] });
  const spat = new Parts();
  spat.add(rbox(0.09, 1.4, 0.09, 0.04), "#2d3336", { p: [0, 0.7, 0] });
  spat.add(rbox(0.32, 0.4, 0.05, 0.05), "#d24c3f", { p: [0, 1.58, 0] });
  p.addParts(spat, { p: [0.12, 0.35, -0.06], r: [-0.06, 0.4, -0.16] });
  const tongs = new Parts();
  for (const dx of [-0.05, 0.05]) tongs.add(rbox(0.05, 1.6, 0.08, 0.02), "#e3e8e6", { p: [dx, 0.8, 0], r: [0, 0, dx * 0.6] });
  tongs.add(cyl(0.08, 0.08, 0.12, 10), "#8e9a98", { p: [0, 1.62, 0], r: [Math.PI / 2, 0, 0] });
  p.addParts(tongs, { p: [0.02, 0.35, 0.12], r: [0.14, 0, 0.04] });
  return p;
});

/** A blue crock of cooking tools for a counter corner. Origin at its base, 0.53 across, 1.3 tall (game units). */
export function makeUtensilCrock(): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(crockParts()));
  machine(g, 0.8, 0.8, 2.0, {});
  return g;
}

// ---- paper roll ------------------------------------------------------------------------

const rollParts = cached(() => {
  const p = new Parts();
  // Wall bracket: a back plate, two arms and a bar through the roll.
  p.add(rbox(2.4, 0.5, 0.08, 0.04), C.steelD, { p: [0, 0.2, 0.04] });
  for (const x of [-1.12, 1.12]) p.add(rbox(0.08, 0.2, 0.68, 0.03), C.steelD, { p: [x, 0.3, 0.38] });
  p.add(cyl(0.05, 0.05, 2.3, 8), C.steelL, { p: [0, 0, 0.62], r: [0, 0, Math.PI / 2], ink: false });
  p.add(cyl(0.45, 0.45, 2.0, 22), PAPER, { p: [0, 0, 0.62], r: [0, 0, Math.PI / 2] });
  p.add(cyl(0.12, 0.12, 2.02, 12), "#c9a77a", { p: [0, 0, 0.62], r: [0, 0, Math.PI / 2], ink: false });
  // The loose end of the paper hanging off the front of the roll.
  p.add(box(1.9, 0.6, 0.02), PAPER, { p: [0, -0.3, 1.07], ink: 0.01 });
  return p;
});

/** A paper towel roll on a wall bracket. Origin: the bracket's back at the wall (z 0), y 0 at the roll's axis. 1.6 wide, 0.72 deep. */
export function makePaperRoll(): THREE.Group {
  const g = new THREE.Group();
  g.add(bakedMesh(rollParts()));
  machine(g, 2.4, 1.1, 1.2, {});
  return g;
}

// ---- timer -------------------------------------------------------------------------------

let dialTex: THREE.CanvasTexture | null = null;
function timerFace(): THREE.CanvasTexture {
  if (dialTex) return dialTex;
  dialTex = canvasTex(128, 128, (x, w) => {
    const c = w / 2;
    x.fillStyle = "#fffaf0";
    x.beginPath();
    x.arc(c, c, c - 2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = INK;
    x.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.lineWidth = i % 3 ? 3 : 6;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10));
      x.lineTo(c + Math.cos(a) * (c - (i % 3 ? 18 : 24)), c + Math.sin(a) * (c - (i % 3 ? 18 : 24)));
      x.stroke();
    }
  });
  return dialTex;
}

const timerParts = cached(() => {
  const p = new Parts();
  p.add(cyl(0.32, 0.32, 0.22, 22), "#ffd166", { p: [0, 0, 0.11], r: [Math.PI / 2, 0, 0] });
  p.add(cyl(0.34, 0.34, 0.04, 22), "#f0b94a", { p: [0, 0, 0.2], r: [Math.PI / 2, 0, 0], ink: false });
  p.add(rbox(0.12, 0.1, 0.12, 0.03), "#2d3336", { p: [0, 0.34, 0.11] });
  return p;
});

export interface TimerObject extends THREE.Group {
  userData: { footprint: { w: number; d: number }; h: number; /** Turn the red sector: 0..1 of a full dial left. */ setLeft: (t: number) => void };
}

/** A yellow dial timer for the wall or the ticket rail. Origin at its back centre (z 0), facing +z. 0.45 across. */
export function makeKitchenTimer(): TimerObject {
  const g = new THREE.Group() as TimerObject;
  g.add(bakedMesh(timerParts()));
  const st = studySpace();
  g.add(st);
  const face = decal(timerFace(), 0.52, 0.52, { up: false });
  face.position.z = 0.225;
  st.add(face);
  const sector = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24, Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ color: grade("#e5573f"), transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }));
  sector.position.z = 0.228;
  sector.raycast = () => {};
  st.add(sector);
  const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.2), new THREE.MeshBasicMaterial({ color: grade(INK), polygonOffset: true, polygonOffsetFactor: -6 }));
  hand.geometry.translate(0, 0.1, 0);
  hand.position.z = 0.23;
  st.add(hand);
  machine(g, 0.7, 0.25, 0.8, {});
  g.userData.setLeft = (t) => {
    const a = Math.max(0.001, Math.min(1, t)) * Math.PI * 2;
    sector.geometry.dispose();
    sector.geometry = new THREE.CircleGeometry(0.17, 24, Math.PI / 2, a);
    hand.rotation.z = a;
  };
  g.userData.setLeft(0.4);
  return g;
}
