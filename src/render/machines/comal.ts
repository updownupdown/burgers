import * as THREE from "three";
import { bakedMesh, Parts } from "../bake";
import { box, C, cached, canvasTex, cyl, glow, machine, rbox, sideProfile, sph, studySpace, textDecal } from "./kit";
import { STUDY } from "../units";

/*
 * Red Rock's comal (DESIGN §24, phase 3): one long plate of seasoned black steel on a steel
 * cabinet, on the griddle's footprint so the cook surface is in the same place. No zone buttons:
 * the burners run hot under the left two thirds and low under the right third, which shows in
 * the flame glow along the front lip and in a faint tint over the plate. Study units below.
 */

const W = 8.7;
const D = 4.6;
const TOP = 1.3;
const PX = W / 2 - 0.3;
const PZ0 = -2.7;
const PZ1 = 1.45;
/** Where the hot part ends and the warm part begins (two thirds across). */
const SPLIT = -PX + ((2 * PX) * 2) / 3;

const body = cached(() => {
  const p = new Parts();
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-2.7, 1.6]) p.add(cyl(0.12, 0.14, 0.22, 10), C.rubber, { p: [x, 0.11, z] });
  p.add(rbox(W, 1.05, 4.6, 0.05), C.steel, { p: [0, 0.74, -0.55] });
  const pd = PZ1 - PZ0;
  const mid = (PZ0 + PZ1) / 2;
  // The plate: black seasoned steel with a soft sheen where it's been wiped.
  p.add(box(2 * PX + 0.16, 0.14, pd + 0.16), "#26292b", { p: [0, TOP - 0.07, mid] });
  // Seasoning sheen: lighter arcs where the cook's cloth has wiped, mostly over the hot part.
  for (const [x, z, r, a0, len] of [[-2.2, -1.2, 1.1, 0.3, 1.9], [-0.6, -0.2, 0.9, 3.6, 1.6], [-2.6, 0.6, 0.7, 4.4, 1.4], [0.6, -1.6, 0.8, 0.9, 1.5], [2.3, 0.2, 0.6, 3.9, 1.2]] as const) {
    p.add(new THREE.RingGeometry(r, r + 0.07, 16, 1, a0, len).rotateX(-Math.PI / 2), "#3a3f42", { p: [x, TOP + 0.002, z], ink: false });
  }
  // A raised rim round the plate.
  p.add(box(2 * PX + 0.3, 0.1, 0.12), "#1d2022", { p: [0, TOP + 0.03, PZ0 - 0.05] });
  p.add(box(2 * PX + 0.3, 0.06, 0.1), "#1d2022", { p: [0, TOP + 0.01, PZ1 + 0.06] });
  // Low splash guards at the back and sides.
  p.add(box(W, 0.4, 0.08), C.steelL, { p: [0, TOP + 0.2, PZ0 - 0.22] });
  p.add(box(W, 0.05, 0.16), C.steel, { p: [0, TOP + 0.41, PZ0 - 0.2] });
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) p.add(sideProfile([[PZ0 - 0.26, 0], [PZ1 + 0.25, 0], [PZ1 + 0.25, 0.08], [PZ0 - 0.26, 0.4]], 0.07), C.steelL, { p: [x, TOP, 0] });
  // The front lip: a dark slot where the burner flames show.
  p.add(box(W - 0.2, 0.28, 0.06), "#2b3134", { p: [0, TOP - 0.42, PZ1 + 0.3], ink: false });
  // Two burner knobs on the front, set and left alone.
  for (const x of [-W / 2 + 0.55, W / 2 - 0.55]) {
    p.add(cyl(0.2, 0.2, 0.12, 14), "#2d3336", { p: [x, TOP - 0.42, PZ1 + 0.36], r: [Math.PI / 2, 0, 0] });
    p.add(box(0.05, 0.22, 0.04), "#e9edef", { p: [x, TOP - 0.42, PZ1 + 0.43], ink: false });
  }
  return p;
});

/** The plate's heat tint: hot over the left two thirds, warm over the right, blended across the split. */
let heat: THREE.CanvasTexture | null = null;
const heatTex = () =>
  (heat ??= canvasTex(128, 4, (c, w, h) => {
    const k = (SPLIT + PX) / (2 * PX);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,90,42,0.22)");
    g.addColorStop(Math.max(0, k - 0.08), "rgba(255,90,42,0.2)");
    g.addColorStop(Math.min(1, k + 0.08), "rgba(255,176,74,0.12)");
    g.addColorStop(1, "rgba(255,176,74,0.1)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }));

/** Little flames along the front slot: tall and orange under the hot part, low and amber under the warm end. */
function flames(g: THREE.Group): void {
  const flame = new THREE.ConeGeometry(0.07, 0.2, 5);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.85 + ((W - 1.7) * i) / (n - 1);
    const hot = x < SPLIT;
    const f = glow(flame, hot ? (i % 2 ? "#ff8a2a" : "#ffb03a") : "#f6c25a", hot ? 0.95 : 0.75);
    f.scale.set(1, hot ? 1 : 0.55, 1);
    f.position.set(x, TOP - 0.44 + (hot ? 0.02 : -0.03), PZ1 + 0.34);
    g.add(f);
    const core = glow(flame, "#5aa3ff", 0.8);
    core.scale.set(0.6, 0.35, 0.6);
    core.position.set(x, TOP - 0.5, PZ1 + 0.35);
    g.add(core);
  }
}

export interface ComalObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: {
      surface: { y: number; x0: number; x1: number; z0: number; z1: number };
      /** Thirds of the plate, left to right (as the griddle's zones). */
      zones: { x0: number; x1: number }[];
    };
  };
}

/** The comal, in game units: the griddle's cook surface (5.47 wide), the front lip about 1.2 in front of the plate's middle. */
export function makeComal(): ComalObject {
  const g = new THREE.Group() as ComalObject;
  g.add(bakedMesh(body()));
  const st = studySpace();
  g.add(st);
  flames(st);
  const pd = PZ1 - PZ0;
  const mid = (PZ0 + PZ1) / 2;
  // The heat over the plate: a red-orange glow over the hot two thirds easing into a softer amber
  // over the warm end, the change soft rather than a hard edge.
  const tint = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * PX - 0.1, pd - 0.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: heatTex(), transparent: true, depthWrite: false }),
  );
  tint.position.set(0, TOP + 0.006, mid);
  tint.renderOrder = 1;
  tint.raycast = () => {};
  tint.castShadow = false;
  st.add(tint);
  // HOT and WARM stamped flat along the plate's front edge (they used to be on the back guard, small
  // and hidden behind the rim), so they read from above; food set down there covers them.
  for (const [text, x, col] of [["HOT", (-PX + SPLIT) / 2, "#ff6a4a"], ["WARM", (SPLIT + PX) / 2, "#ffb54a"]] as const) {
    const l = textDecal(text, 0.42, { bg: "rgba(0,0,0,0)", color: col, fs: 64, pad: 4, weight: 800 });
    (l.material as THREE.MeshBasicMaterial).opacity = 0.8;
    l.renderOrder = 2;
    l.position.set(x, TOP + 0.008, PZ1 - 0.32);
    st.add(l);
  }
  const zoneW = (2 * PX) / 3;
  machine(g, W, D, TOP + 0.5, {
    surface: { y: TOP * STUDY, x0: -PX * STUDY, x1: PX * STUDY, z0: PZ0 * STUDY, z1: PZ1 * STUDY },
    zones: [0, 1, 2].map((i) => ({ x0: (-PX + zoneW * i) * STUDY, x1: (-PX + zoneW * (i + 1)) * STUDY })),
  });
  return g;
}

/*
 * The tortilla press (Sun Valley): a round cast-iron press on a wooden board, its top plate
 * hinged at the back with a lever over the front, and a bowl of masa balls beside it. Hold it
 * to bring the lever down and flatten a ball into a tortilla.
 */
const TP = { w: 2.7, d: 1.95 };
const PR = 0.72;
const pressBase = cached(() => {
  const p = new Parts();
  p.add(rbox(TP.w, 0.14, TP.d, 0.06), "#c98a52", { p: [0, 0.07, 0] });
  for (let i = 0; i < 4; i++) p.add(box(TP.w - 0.16, 0.004, 0.03), "#b07440", { p: [0, 0.142, -TP.d / 2 + 0.3 + i * 0.45], ink: false });
  // The bottom plate on three little feet, and the hinge post at the back.
  p.add(cyl(PR, PR, 0.14, 24), "#4a4f52", { p: [-0.45, 0.25, 0] });
  p.add(cyl(PR - 0.05, PR - 0.05, 0.01, 24), "#5d6366", { p: [-0.45, 0.325, 0], ink: false });
  p.add(box(0.3, 0.42, 0.22), "#3e4346", { p: [-0.45, 0.35, -PR - 0.08] });
  p.add(box(0.26, 0.12, 0.5), "#3e4346", { p: [-0.45, 0.2, PR + 0.12] });
  p.add(box(0.14, 0.5, 0.14), "#3e4346", { p: [-0.45, 0.4, PR + 0.22] });
  // A bowl of masa balls on the right.
  p.add(cyl(0.42, 0.3, 0.32, 18), "#e9dfcb", { p: [0.88, 0.3, 0.2] });
  p.add(cyl(0.36, 0.36, 0.02, 18), "#cfc3a8", { p: [0.88, 0.46, 0.2], ink: false });
  for (const [x, z] of [[0.78, 0.1], [0.98, 0.15], [0.86, 0.32], [0.95, -0.02]] as const) p.add(sph(0.14, 10, 7), "#efd28a", { p: [x, 0.52, z], s: [1, 0.85, 1] });
  return p;
});
const pressLid = cached(() => {
  const p = new Parts();
  // Hinged at its back edge: built with the hinge at the origin, the plate reaching forward.
  p.add(cyl(PR, PR, 0.12, 24), "#3e4346", { p: [0, 0.06, PR + 0.08] });
  p.add(box(0.5, 0.04, 0.3), "#575d61", { p: [0, 0.13, PR + 0.08], ink: false });
  return p;
});
const pressLever = cached(() => {
  const p = new Parts();
  // The lever: hinged at the front post, a bar running back over the lid with a wooden grip.
  p.add(box(0.12, 0.1, 1.9), "#3e4346", { p: [0, 0.05, -0.95] });
  p.add(cyl(0.11, 0.11, 0.5, 10), "#9a5a2e", { p: [0, 0.05, -1.95], r: [Math.PI / 2, 0, 0] });
  return p;
});
const masaBall = cached(() => new Parts().add(sph(0.26, 12, 8), "#efd28a", { p: [0, 0.18, 0], s: [1, 0.7, 1] }));
const masaFlat = cached(() => new Parts().add(cyl(0.62, 0.62, 0.05, 22), "#efd28a", { p: [0, 0.025, 0] }));

export interface TortillaPressObject extends THREE.Group {
  userData: {
    footprint: { w: number; d: number };
    h: number;
    spots: { plate: { x: number; y: number; z: number } };
    /** 0 open (ball on the plate) .. 1 pressed flat. */
    setPress: (t: number) => void;
  };
}

export function makeTortillaPress(): TortillaPressObject {
  const g = new THREE.Group() as TortillaPressObject;
  g.add(bakedMesh(pressBase()));
  const st = studySpace();
  g.add(st);
  const hinge = new THREE.Group();
  hinge.position.set(-0.45, 0.4, -PR - 0.08);
  const lid = bakedMesh(pressLid());
  lid.scale.setScalar(1 / STUDY);
  hinge.add(lid);
  const pivot = new THREE.Group();
  pivot.position.set(-0.45, 0.62, PR + 0.22);
  const lever = bakedMesh(pressLever());
  lever.scale.setScalar(1 / STUDY);
  pivot.add(lever);
  const ball = bakedMesh(masaBall());
  ball.scale.setScalar(1 / STUDY);
  ball.position.set(-0.45, 0.33, 0);
  const flat = bakedMesh(masaFlat());
  flat.scale.setScalar(1 / STUDY);
  flat.position.set(-0.45, 0.33, 0);
  st.add(hinge, pivot, ball, flat);
  machine(g, TP.w, TP.d, 1.6, { plate: { x: -0.45 * STUDY, y: 0.34 * STUDY, z: 0 } });
  g.userData.setPress = (t) => {
    const k = Math.max(0, Math.min(1, t));
    // Open, the lid stands up past vertical and the lever lies forward; pressed, both come down flat.
    hinge.rotation.x = -1.75 * (1 - k);
    pivot.rotation.x = 2.2 * (1 - k) - 0.05;
    ball.visible = k < 0.85;
    ball.scale.set(1 / STUDY, (1 / STUDY) * (1 - 0.6 * k), 1 / STUDY);
    flat.visible = k >= 0.85;
  };
  g.userData.setPress(0);
  return g;
}
