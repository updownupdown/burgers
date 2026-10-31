import * as THREE from "three";
import { newPiece, type Kind, type Piece } from "../../game/types";
import { makeFood } from "../food";
import { applyKitchenLight, KITCHEN_BG } from "../lighting";
import { toon } from "../materials";
import { makeColdRail, makePrepUnit } from "../machines/coldRail";
import { makeGriddle } from "../machines/griddle";
import { makeSauceCaddy, makeSauceBottle } from "../machines/sauces";
import { makeWarmShelf } from "../machines/warmShelf";
import { SCALE } from "../units";

/*
 * Dev-only page for looking at models in the game's camera without playing a shift:
 * /src/render/preview/index.html?show=grill. Not part of the build.
 */

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = KITCHEN_BG.clone();
applyKitchenLight(scene, { shadowBox: { left: -8, right: 8, top: 8, bottom: -8 } });

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
/** Width of counter the camera fits across, in game units. */
const params = new URLSearchParams(location.search);
const across = Number(params.get("across") ?? 8.2);

function counterPatch(w: number, d: number): void {
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), toon("#efe6d8"));
  top.position.set(0, -0.2, 0);
  top.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 0.4), toon("#e9dfcf"));
  wall.position.set(0, 2.6, -d / 2 - 0.2);
  wall.receiveShadow = true;
  scene.add(top, wall);
}

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T => {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  scene.add(o);
  return o;
};

function piece(kind: Kind, cook: [number, number] = [0, 0], extra: Partial<Piece> = {}): Piece {
  return Object.assign(newPiece(kind), { cook }, extra);
}

function food(p: Piece, x: number, y: number, z: number, role: "top" | "bottom" = "top"): void {
  const o = makeFood(p, role);
  o.scale.setScalar(SCALE.burger);
  at(o, x, y, z, p.uid * 1.3);
}

const SHOWS: Record<string, () => void> = {
  grill() {
    counterPatch(14, 5.4);
    const prep = makePrepUnit({ kinds: ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", null] });
    const pf = prep.userData.footprint;
    at(prep, -4.0 + pf.w / 2, 0, 2.7 - 0.3 - pf.d / 2);
    const caddy = makeSauceCaddy();
    const c = prep.userData.spots.caddy!;
    at(caddy, prep.position.x + c.x, c.y, prep.position.z + c.z);
    const gr = makeGriddle();
    const gf = gr.userData.footprint;
    at(gr, 4.0 - gf.w / 2 - 0.1, 0, 2.7 - 0.35 - gf.d / 2);
    gr.userData.setWarm(true);
    const shelf = makeWarmShelf({ legs: 2.3 });
    at(shelf, gr.position.x, 2.3, -2.7 + 0.75);
    const s = gr.userData.spots.surface;
    const y = s.y;
    const gx = gr.position.x;
    const gz = gr.position.z;
    food(piece("patty", [0.05, 0]), gx - 1.2, y, gz - 0.3);
    food(piece("patty", [0.5, 0.3]), gx, y, gz - 0.3);
    food(piece("patty", [0.8, 0.8]), gx - 1.2, y, gz + 0.65);
    food(piece("bacon", [0.6, 0.5]), gx + 0.0, y, gz + 0.7);
    food(piece("bun", [0.4, 0]), gx + 1.3, y, gz + 0.1, "bottom");
    const b = makeSauceBottle("ketchup");
    at(b, -1.0, 2.2, 3.0);
  },
  rail() {
    counterPatch(14, 6);
    at(makeColdRail({ cols: 5, rows: 2, kinds: ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", "pickle"] }), 0, 0, 0);
  },
};

(SHOWS[params.get("show") ?? "grill"] ?? SHOWS.grill)();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dist = Math.hypot(12.6, 5.3);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.atan(across / 2 / dist)) / camera.aspect));
  camera.updateProjectionMatrix();
}
resize();
camera.position.set(0, 12.6, 5.2);
camera.lookAt(0, 0, -0.1);
if (params.get("cam") === "low") {
  camera.position.set(0, 6, 9);
  camera.lookAt(0, 0.8, 0);
}
renderer.setAnimationLoop(() => renderer.render(scene, camera));
(window as unknown as { __ready: boolean }).__ready = true;
