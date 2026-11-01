import * as THREE from "three";
import { newPiece, type Kind, type Piece } from "../../game/types";
import { makeFood, stackBases } from "../food";
import { applyKitchenLight, KITCHEN_BG } from "../lighting";
import { toon } from "../materials";
import { makeColdRail, makeFountain, makeIceWell, makeFryBasket, makeFryer, makeGriddle, makeLidStrawCaddy, makePackPad, makePrepUnit, makeSauceBottle, makeSauceCaddy, makeTrashChute, makeWarmShelf, makeSupplyShelf, FRY_BASKET } from "../machines";
import { makeCup, makeFries, makeFryPile, makeCartonStack } from "../food";
import { SCALE } from "../units";
import { counterTop, wallPanels } from "../wear";
import { makeKitchenTimer, makePaperRoll, makeTicketRail, makeTowel, makeUtensilCrock } from "../props";

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
    if (params.get("show") !== "kit") counterPatch(14, 5.4);
    const prep = makePrepUnit({ kinds: ["bun", "patty", "bacon", "egg", "cheese", "lettuce", "tomato", "onion", null] });
    const pf = prep.userData.footprint;
    at(prep, -4.0 + pf.w / 2, 0, 2.7 - 0.3 - pf.d / 2);
    const caddy = makeSauceCaddy();
    const c = prep.userData.spots.caddy!;
    at(caddy, prep.position.x + c.x, c.y, prep.position.z + c.z);
    const gr = makeGriddle();
    const gf = gr.userData.footprint;
    at(gr, 4.0 - gf.w / 2 - 0.1, 0, 2.7 - 0.35 - gf.d / 2);
    gr.userData.setZone(2, "warm");
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
  fryer() {
    counterPatch(14, 5.4);
    const fr = makeFryer();
    const ff = fr.userData.footprint;
    at(fr, -0.6, 0, -2.7 + 0.1 + ff.d / 2);
    const sp = fr.userData.spots;
    sp.wells.forEach((w, i) => {
      const b = makeFryBasket();
      const pile = makeFryPile(FRY_BASKET.w - 0.1, FRY_BASKET.d - 0.1, 4, 21 + i, true);
      pile.userData.setCook(i ? 0.75 : 0.4);
      pile.position.y = 0.02;
      b.add(pile);
      if (i === 0) {
        b.position.set(fr.position.x + w.x, sp.down.y, fr.position.z + w.z);
        fr.userData.bubbles[0].visible = true;
      } else {
        const h = sp.hang[i];
        b.position.set(fr.position.x + h.x, h.y, fr.position.z + h.z);
        b.rotation.x = h.tilt;
      }
      scene.add(b);
    });
    const pads = makePackPad();
    at(pads, 2.4, 0, 1.6);
    pads.userData.spots.pads.forEach((pd, i) => {
      const f = makeFries(true, i ? "L" : "M", 1, { salt: i === 1 ? 0.6 : 0 });
      f.userData.setCook(0.72);
      f.scale.setScalar(SCALE.fries);
      at(f, pads.position.x + pd.x, pd.y, pads.position.z + pd.z);
    });
    (["S", "M", "L"] as const).forEach((sz, i) => {
      const st = makeCartonStack(sz, 8);
      st.scale.setScalar(SCALE.fries);
      at(st, -3.4, 0, 0.2 + i * 0.9);
    });
    at(makeTrashChute(7.6), 0, 0, 2.45);
  },
  drinks() {
    counterPatch(14, 5.4);
    const fo = makeFountain();
    at(fo, 1.4, 0, -2.7 + 0.1 + fo.userData.footprint.d / 2);
    const sizes = ["S", "M", "L", "M", "L"] as const;
    fo.userData.spots.cups.forEach((c, i) => {
      const cup = makeCup((["pine", "pink", "cola", "water", "tea"] as const)[i], i === 3, sizes[i]);
      cup.userData.setFill(0.3 + i * 0.15);
      cup.userData.setIce(i > 1);
      cup.scale.setScalar(SCALE.cup);
      at(cup, fo.position.x + c.x, c.y, fo.position.z + c.z);
    });
    const tw = makeIceWell();
    at(tw, -2.6, 0, -2.7 + 0.1 + tw.userData.footprint.d / 2);
    const ld = makeLidStrawCaddy();
    at(ld, -2.4, 0, 1.6);
    at(makeTrashChute(7.6), 0, 0, 2.45);
  },
  supplies() {
    counterPatch(14, 5.4);
    const r = makeSupplyShelf();
    at(r, 0, 0, 0);
    r.userData.setBay(2, 1);
  },
  food() {
    // Rows: patties raw to burnt (and smashed), buns, cheese melting, veg, bacon and egg, then stacks.
    counterPatch(14, 6);
    const row = (z: number, items: [Piece, ("top" | "bottom")?][]) => items.forEach(([p, role], i) => food(p, (i - (items.length - 1) / 2) * 1.35, 0, z, role));
    row(-2.3, [[piece("patty", [0, 0])], [piece("patty", [0.3, 0.3])], [piece("patty", [0.55, 0.6])], [piece("patty", [0.85, 0.85])], [piece("patty", [1.2, 1.2])], [piece("patty", [0.6, 0.6], { smashed: true })]]);
    row(-1.0, [[piece("bun", [0, 0]), "bottom"], [piece("bun", [0.6, 0]), "bottom"], [piece("bun", [0, 0])], [piece("cheese", [0, 0], { melt: 0 })], [piece("cheese", [0, 0], { melt: 0.5 })], [piece("cheese", [0, 0], { melt: 1 })]]);
    row(0.25, [[piece("lettuce")], [piece("tomato")], [piece("onion")], [piece("pickle")], [piece("jalapeno")], [piece("pineapple", [0.3, 0.3])]]);
    row(1.45, [[piece("bacon", [0, 0])], [piece("bacon", [0.5, 0.5])], [piece("bacon", [0.9, 0.9])], [piece("egg", [0.1, 0])], [piece("egg", [0.5, 0])], [piece("egg", [1.0, 0])]]);
  },
  stack() {
    counterPatch(14, 6);
    const kinds: [Kind, [number, number], Partial<Piece>?][][] = [
      [["bun", [0.5, 0]], ["patty", [0.6, 0.6]], ["cheese", [0, 0], { melt: 0.7 }], ["lettuce", [0, 0]], ["tomato", [0, 0]], ["tomato", [0, 0]], ["bun", [0.4, 0]]],
      [["bun", [0.5, 0]], ["patty", [0.8, 0.8]], ["bacon", [0.7, 0.7]], ["cheese", [0, 0], { melt: 1 }], ["patty", [0.6, 0.6]], ["onion", [0, 0]], ["pickle", [0, 0]], ["pickle", [0, 0]], ["pickle", [0, 0]], ["bun", [0.4, 0]]],
      [["bun", [0.5, 0]], ["patty", [0.6, 0.6], { smashed: true }], ["egg", [0.6, 0]], ["jalapeno", [0, 0]], ["jalapeno", [0, 0]], ["jalapeno", [0, 0]], ["jalapeno", [0, 0]], ["bun", [0.4, 0]]],
    ];
    kinds.forEach((list, j) => {
      const pieces = list.map(([k, c, x]) => piece(k, c, x ?? {}));
      const { bases, yaw, back } = stackBases(pieces);
      const x0 = (j - 1) * 2.6;
      let run = 0;
      pieces.forEach((p, i) => {
        const o = makeFood(p, i === 0 ? "bottom" : "top");
        o.scale.setScalar(SCALE.burger);
        run = i > 0 && pieces[i - 1].kind === p.kind ? run + 1 : 0;
        const spread = ["tomato", "onion", "pickle", "jalapeno"].includes(p.kind);
        const sx = spread ? Math.cos(0.6 + run * 2.39996) * 0.42 : 0;
        const sz = spread ? Math.sin(0.6 + run * 2.39996) * 0.42 : 0;
        o.position.set(x0 + (sx) * SCALE.burger, bases[i] * SCALE.burger, (sz - back[i]) * SCALE.burger + 0.6);
        o.rotation.y = yaw[i];
        scene.add(o);
      });
    });
    (["S", "M", "L"] as const).forEach((sz, i) => {
      const f = makeFries(true, sz, 1, {});
      f.userData.setCook(0.72);
      f.scale.setScalar(SCALE.fries);
      at(f, -2.6 + i * 1.2, 0, -1.8);
      const c = makeCup((["cola", "pink", "tea"] as const)[i], i === 2, sz);
      c.userData.setFill(0.9);
      c.userData.setIce(true);
      c.scale.setScalar(SCALE.cup);
      at(c, 1.2 + i * 1.1, 0, -1.8);
    });
  },
  kit() {
    // The grill page with light wear and the working kit, all off the tap targets.
    at(counterTop(14, 5.4), 0, 0, 0);
    at(wallPanels(14, 6), 0, 0, -2.7);
    SHOWS.grill();
    at(makeTicketRail(5), -0.6, 3.0, -2.7);
    at(makeKitchenTimer(), 2.6, 3.1, -2.7);
    at(makePaperRoll(), -3.0, 4.0, -2.7);
    at(makeTowel(), -3.6, 0, 2.7);
    at(makeUtensilCrock(), 3.7, 0, -2.25);
  },
  props() {
    at(counterTop(8, 3), 0, 0, 0);
    at(wallPanels(8, 5), 0, 0, -1.5);
    at(makeTicketRail(3), -1, 2.6, -1.5);
    at(makeKitchenTimer(), 1.4, 2.4, -1.5);
    at(makePaperRoll(), 2.4, 1.4, -1.5);
    at(makeTowel(), -1.6, 0, 1.5);
    at(makeUtensilCrock(), 0.6, 0, 0);
  },
  cups() {
    counterPatch(14, 6);
    (["S", "M", "L"] as const).forEach((sz, i) => {
      for (const lid of [false, true]) {
        const c = makeCup((["cola", "pink", "tea"] as const)[i], lid, sz);
        c.userData.setFill(0.9);
        c.userData.setIce(true);
        c.scale.setScalar(SCALE.cup);
        at(c, -1.4 + i * 1.4, 0, lid ? 0.8 : -0.6);
      }
    });
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
