import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { faceted, mesh } from "../materials";
import { box, C, cached, cyl, glow, glowMat, machine, rbox, sideProfile, studySpace } from "./kit";
import { STUDY } from "../units";

/*
 * The wide stainless griddle (after build #36): one long plate in three identical zones, low
 * splash guards so the pans behind it stay in view, a grease trough, and a control ledge along the
 * front with a round power button and two indicator lamps per zone. Each zone has its own light strip along the front
 * edge: blue when it's off, orange on warm, red on hot.
 * Study units below; 8.7 x 6.0 x 1.9 (87 x 60 cm).
 */

const W = 8.7;
const D = 6.0;
/** Cook surface height. */
const TOP = 1.3;
/** How far the grille's bars (the left zone) stand above the plate, to their highlight's top. */
const BAR_H = 0.075;
/** The cook plate: x across, z from back to front. */
const PX = W / 2 - 0.3;
const PZ0 = -2.7;
const PZ1 = 1.45;
/** The front control ledge, its height and where the buttons sit on it. */
const LEDGE_Y = TOP - 0.12;
const BTN_Z = 2.38;
const LED_Z = 2.86;

export type ZoneHeat = "off" | "warm" | "hot";
export const ZONE_HEATS: ZoneHeat[] = ["off", "warm", "hot"];
/** Button cap, light strip and label colours per setting. */
export const ZONE_COLOR: Record<ZoneHeat, string> = { off: "#5aa3d8", warm: "#f39a2e", hot: "#e0442e" };
/** A faint tint over each zone of the plate, so hot reads warm even without the strip. */
const ZONE_TINT: Record<ZoneHeat, [string, number]> = { off: ["#9cc9ea", 0.06], warm: ["#ffb04a", 0.08], hot: ["#ff5a2a", 0.13] };

const zoneW = (2 * PX) / 3;
const zoneX = (i: number) => -PX + zoneW * (i + 0.5);

const body = cached(() => {
  const p = new Parts();
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-2.7, 2.6]) p.add(cyl(0.12, 0.14, 0.22, 10), C.rubber, { p: [x, 0.11, z] });
  p.add(rbox(W, 1.05, D - 0.3, 0.05), C.steel, { p: [0, 0.74, -0.05] });
  // The plate, with faint brushed bands so it reads as steel from above.
  const pd = PZ1 - PZ0;
  p.add(box(2 * PX + 0.1, 0.12, pd + 0.1), "#43484b", { p: [0, TOP - 0.06, (PZ0 + PZ1) / 2] });
  for (let i = 0; i < 7; i++) p.add(box(2 * PX - 0.2, 0.004, 0.08), "#53595c", { p: [0, TOP + 0.002, PZ0 + 0.35 + (i * (pd - 0.7)) / 6], ink: false });
  // The left zone is a grille: raised cast-iron bars front to back over a dark firebox, so a
  // patty seared there comes off with grill marks.
  {
    const x0 = -PX + 0.12;
    const x1 = -PX + zoneW - 0.12;
    p.add(box(x1 - x0 + 0.1, 0.01, pd - 0.1), "#1f2224", { p: [(x0 + x1) / 2, TOP + 0.003, (PZ0 + PZ1) / 2], ink: false });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
      p.add(box(0.13, 0.07, pd - 0.25), "#3c4144", { p: [x, TOP + 0.035, (PZ0 + PZ1) / 2], ink: 0.012 });
      p.add(box(0.06, 0.004, pd - 0.3), "#6b7377", { p: [x - 0.02, TOP + 0.072, (PZ0 + PZ1) / 2], ink: false });
    }
  }
  // Two shallow grooves split the plate into three equal zones.
  for (const k of [1, 2]) p.add(box(0.05, 0.006, pd - 0.1), "#6e777b", { p: [-PX + zoneW * k, TOP + 0.004, (PZ0 + PZ1) / 2], ink: false });
  // Grease trough along the front of the plate.
  p.add(box(2 * PX, 0.1, 0.32), "#2a2e30", { p: [0, TOP - 0.08, PZ1 + 0.2], ink: false });
  // The control ledge: a steel strip a little below the plate, the light rail at its front lip.
  p.add(rbox(W - 0.1, 0.14, 1.15, 0.04), C.steelL, { p: [0, LEDGE_Y - 0.07, 2.4] });
  p.add(box(W - 0.2, 0.08, 0.16), "#2b3134", { p: [0, LEDGE_Y + 0.02, LED_Z], ink: false });
  // Low splash guards: the back, and tapered sides.
  p.add(box(W, 0.45, 0.08), C.steelL, { p: [0, TOP + 0.22, PZ0 - 0.22] });
  p.add(box(W, 0.05, 0.16), C.steel, { p: [0, TOP + 0.46, PZ0 - 0.2] });
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) p.add(sideProfile([[PZ0 - 0.26, 0], [PZ1 + 0.3, 0], [PZ1 + 0.3, 0.1], [PZ0 - 0.26, 0.45]], 0.07), C.steelL, { p: [x, TOP, 0] });
  // A sunk well under each button.
  for (let i = 0; i < 3; i++) p.add(rbox(1.68, 0.05, 0.82, 0.05), "#3a4043", { p: [zoneX(i), LEDGE_Y + 0.01, BTN_Z], ink: false });
  return p;
});

/** The power symbol (a broken ring and a bar), flat, radius r, in light paint. */
function powerSymbol(r: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const t = r * 0.16;
  const gap = Math.PI / 3;
  const ringGeo = new THREE.TorusGeometry(r, t, 4, 28, Math.PI * 2 - gap);
  ringGeo.rotateZ(Math.PI / 2 + gap / 2);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = mesh(ringGeo, color, { ink: false, shadow: false });
  const bar = mesh(box(t * 2, t * 2, r * 1.05), color, { ink: false, shadow: false });
  bar.position.z = -r * 0.55;
  g.add(ring, bar);
  return g;
}

/** A round push-to-cycle power button: a steel bezel round a dark cap with the power symbol. */
function powerButton(): THREE.Group {
  const g = new THREE.Group();
  const bezel = mesh(cyl(0.42, 0.46, 0.1, 28), C.steel, { ink: 0.012 });
  bezel.position.y = 0.05;
  const capM = mesh(cyl(0.32, 0.34, 0.2, 28), "#2b3135", { ink: 0.012 });
  capM.position.y = 0.14;
  const rim = mesh(cyl(0.3, 0.3, 0.01, 28), "#3b4348", { ink: false, shadow: false });
  rim.position.y = 0.245;
  const sym = powerSymbol(0.15, "#e9edef");
  sym.position.y = 0.255;
  const shine = mesh(box(0.28, 0.005, 0.05), "#ffffff", { ink: false, opacity: 0.35, shadow: false });
  shine.position.set(0, 0.252, -0.22);
  g.add(bezel, capM, rim, sym, shine);
  return g;
}

/** Indicator lamps: both off when the zone is off, the first orange on warm, both red on hot. */
const LAMP_OFF = "#4a5155";
const LAMPS: Record<ZoneHeat, [string, string]> = { off: [LAMP_OFF, LAMP_OFF], warm: ["#ff9a2a", LAMP_OFF], hot: ["#ff3b25", "#ff3b25"] };

function lamp(): { g: THREE.Group; glass: THREE.Mesh; halo: THREE.Mesh } {
  const g = new THREE.Group();
  const bezel = mesh(cyl(0.17, 0.19, 0.08, 20), C.steel, { ink: 0.01 });
  bezel.position.y = 0.04;
  const glass = glow(faceted(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), LAMP_OFF);
  glass.position.y = 0.08;
  const halo = glow(cyl(0.28, 0.28, 0.005, 20), "#ff3b25", 0.0);
  halo.position.y = 0.085;
  g.add(bezel, glass, halo);
  return { g, glass, halo };
}

export interface GriddleObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      /** Cook surface in local game units. */
      surface: { y: number; x0: number; x1: number; z0: number; z1: number };
      /** How far food on the grille (zone 0) sits above the surface: it rests on the bars. */
      grille: number;
      /** The three zones, left to right: their x extent on the plate. */
      zones: { x0: number; x1: number }[];
      /** The top of each zone's push button. */
      buttons: { x: number; y: number; z: number }[];
    };
    /** Show a zone's setting: its button cap, light strip and plate tint. */
    setZone: (i: number, heat: ZoneHeat) => void;
    /** Push a zone's button in a little (0 up .. 1 fully in). */
    pressButton: (i: number, t: number) => void;
  };
}

/** The griddle, in game units: 5.47 x 4.0, cook surface at y 0.87, three zones about 1.7 wide. */
export function makeGriddle(): GriddleObject {
  const g = new THREE.Group() as GriddleObject;
  g.add(bakedMesh(body()));
  const st = studySpace();
  g.add(st);
  const pd = PZ1 - PZ0;
  const zones = [0, 1, 2].map((i) => {
    const x = zoneX(i);
    const led = glow(box(zoneW - 0.35, 0.05, 0.1), ZONE_COLOR.off);
    led.position.set(x, LEDGE_Y + 0.07, LED_Z);
    const tint = glow(box(zoneW - 0.08, 0.004, pd - 0.08), ZONE_TINT.off[0], ZONE_TINT.off[1]);
    tint.position.set(x, TOP + 0.006, (PZ0 + PZ1) / 2);
    tint.renderOrder = 1;
    const btn = powerButton();
    btn.position.set(x - 0.32, LEDGE_Y + 0.02, BTN_Z);
    const lamps = [lamp(), lamp()];
    lamps.forEach((l, k) => l.g.position.set(x + 0.18 + k * 0.42, LEDGE_Y + 0.02, BTN_Z));
    st.add(led, tint, btn, ...lamps.map((l) => l.g));
    return { led, tint, btn, lamps };
  });
  machine(g, W, D, TOP + 0.5, {
    surface: { y: TOP * STUDY, x0: -PX * STUDY, x1: PX * STUDY, z0: PZ0 * STUDY, z1: PZ1 * STUDY },
    grille: BAR_H * STUDY,
    zones: [0, 1, 2].map((i) => ({ x0: (zoneX(i) - zoneW / 2) * STUDY, x1: (zoneX(i) + zoneW / 2) * STUDY })),
    buttons: [0, 1, 2].map((i) => ({ x: zoneX(i) * STUDY, y: (LEDGE_Y + 0.3) * STUDY, z: BTN_Z * STUDY })),
  });
  g.userData.setZone = (i, heat) => {
    const z = zones[i];
    LAMPS[heat].forEach((c, k) => {
      z.lamps[k].glass.material = glowMat(c);
      z.lamps[k].halo.material = glowMat(c, c === LAMP_OFF ? 0 : 0.28);
    });
    z.led.material = glowMat(ZONE_COLOR[heat]);
    z.tint.material = glowMat(ZONE_TINT[heat][0], ZONE_TINT[heat][1]);
  };
  g.userData.pressButton = (i, t) => {
    zones[i].btn.position.y = LEDGE_Y + 0.02 - 0.1 * Math.max(0, Math.min(1, t));
  };
  return g;
}
