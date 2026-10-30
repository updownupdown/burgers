import * as THREE from "three";
import { buzz, Sfx } from "./audio";
import { avgCook, bunToast, pattyLabel } from "./game/cooking";
import { makeOrder, orderFromRecipe, seededRng, type Rng } from "./game/menu";
import { freshSave, loadSave, passed, upgradeChoices, UPGRADES, writeSave, type UpgradeId } from "./game/progress";
import { STOPS } from "./game/stops";
import { HOLD_GRACE, HOLD_RUIN, payout, scorePlate } from "./game/scoring";
import type { DrinkId, Layer, Order, Piece, Plate, SauceKind } from "./game/types";
import { GRILLABLE, newPiece } from "./game/types";
import { makeCup, makeFood, makeFries, stackHeight } from "./render/food";
import { disposeObject } from "./render/materials";
import { CounterView, GRILL_SCALE, HOME_PAGE, PAGES, pageX, GRILL_TOP, WARM_X0, type GrillItem, type Hit } from "./scenes/counter";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import "./style.css";
import { buildUi, summaryHtml, ticketHtml, titleHtml } from "./ui";
import { buildLabel, registerServiceWorker, reloadTo, startUpdateChecks, type VersionInfo } from "./update";

// ---------------------------------------------------------------------------
// Setup

const canvas = document.getElementById("gl") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);

const sfx = new Sfx();
const customersView = new CustomersView();
const trayView = new TrayView();
const counter = new CounterView();
const ui = buildUi(document.getElementById("ui")!, PAGES);

const save = loadSave();
const stop = () => STOPS[game.stopIdx];
const has = (u: UpgradeId) => save.upgrades.includes(u);

interface Slot {
  order: Order | null;
  plate: Plate;
  patience: number;
  maxPatience: number;
  leaving: boolean;
  fig: CustomerFigure | null;
  ticketKey: string;
  bubble: HTMLElement | null;
  /** Ticket shows every layer rather than recipe + modifiers. */
  expanded: boolean;
}

const emptyPlate = (): Plate => ({ layers: [], fries: null, drink: null });

const game = {
  phase: "title" as "title" | "playing" | "paused" | "summary",
  time: 0,
  money: 0,
  tips: 0,
  served: 0,
  lost: 0,
  stars: [] as number[],
  best: null as { name: string; score: number } | null,
  spawned: 0,
  nextSpawn: 1.2,
  orderSeq: 1,
  active: 0,
  tutorial: true,
  stopIdx: save.stop,
  rng: seededRng(Date.now() % 100000) as Rng,
  slots: [0, 1, 2].map(
    (): Slot => ({ order: null, plate: emptyPlate(), patience: 0, maxPatience: 1, leaving: false, fig: null, ticketKey: "", bubble: null, expanded: false }),
  ),
  hintsShown: new Set<string>(),
  pendingUpdate: null as VersionInfo | null,
};

// ---------------------------------------------------------------------------
// Layout: a phone-shaped column split into bands

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const bands = { customers: { x: 0, y: 0, w: 0, h: 0 } as Rect, tray: {} as Rect, counter: {} as Rect, tabs: {} as Rect };
let colX = 0;
let viewH = 0;

function layout(): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  viewH = H;
  const w = Math.min(W, Math.round(H * 0.62), 560);
  colX = Math.round((W - w) / 2);
  const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-b")) || 0;
  const safeT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-t")) || 0;
  const tabsH = 64 + safeB;
  const custH = Math.round(THREE.MathUtils.clamp(H * 0.24, 150, 230));
  const trayH = Math.round(THREE.MathUtils.clamp(H * 0.18, 110, 180));
  bands.customers = { x: colX, y: 0, w, h: custH };
  bands.tray = { x: colX, y: custH, w, h: trayH };
  bands.counter = { x: colX, y: custH + trayH, w, h: H - custH - trayH - tabsH };
  bands.tabs = { x: colX, y: H - tabsH, w, h: tabsH };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H, false);
  // Size the canvas box to the visible viewport (not 100vh, which mobile browsers measure
  // with their toolbars hidden), so taps line up with what's drawn.
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  customersView.layout(w / custH);
  trayView.layout(w / trayH);
  counter.layout(w / bands.counter.h);

  const st = document.documentElement.style;
  st.setProperty("--gx", `${colX}px`);
  st.setProperty("--gw", `${w}px`);
  st.setProperty("--gh", `${H}px`);

  // Tickets fill the right part of each customer slot.
  const slotW = w / 3;
  ui.tickets.forEach((t, i) => {
    // At least wide enough for "Patty Med"; on narrow phones it overlaps the customer a little.
    const tw = Math.max(slotW * 0.51, 72);
    t.style.left = `${(i + 1) * slotW - tw - slotW * 0.02}px`;
    t.style.width = `${tw}px`;
    const top = Math.max(custH * 0.16, safeT + 44);
    t.style.top = `${top}px`;
    t.style.maxHeight = `${custH - top + trayH * 0.22}px`;
  });
  ui.hint.style.top = `${bands.counter.y + 8}px`;
  // Turned sideways mid-shift: pause behind the "turn your phone" overlay.
  if (W > H && H < 500 && game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    ui.menu.hidden = false;
  }
}
window.addEventListener("resize", layout);
layout();

function bandAt(y: number): "customers" | "tray" | "counter" | "tabs" {
  if (y < bands.tray.y) return "customers";
  if (y < bands.counter.y) return "tray";
  if (y < bands.tabs.y) return "counter";
  return "tabs";
}

function ndcIn(r: Rect, x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(((x - r.x) / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1);
}

// ---------------------------------------------------------------------------
// Orders and customers

function spawnCustomer(slotIdx: number): void {
  const s = game.slots[slotIdx];
  const level = game.time / stop().shiftLength;
  let order = makeOrder(game.orderSeq++, game.rng, level, stop());
  // The very first order of the trip is the simplest burger, with no sides.
  if (game.tutorial && game.spawned === 0) order = orderFromRecipe(order.id, stop().menu[0], "medium", false, null);
  s.order = order;
  s.plate = emptyPlate();
  // Recipes you haven't made a couple of times yet start with the full layer list showing.
  s.expanded = game.tutorial || (save.known[order.name] ?? 0) < 2;
  s.maxPatience = (50 + order.layers.length * 7 + (order.fries ? 12 : 0) + (order.drink ? 9 : 0)) * (has("bench") ? 1.25 : 1);
  if (game.tutorial && game.spawned === 0) s.maxPatience = 600;
  s.patience = s.maxPatience;
  s.leaving = false;
  s.fig = customersView.arrive(slotIdx, Math.floor(game.rng() * 1000));
  game.spawned++;
  sfx.pop();
  if (!game.slots[game.active].order) setActive(slotIdx);
  syncTray(slotIdx, false);
}

function setActive(i: number): void {
  game.active = i;
}

function clearSlot(i: number): void {
  const s = game.slots[i];
  s.order = null;
  s.plate = emptyPlate();
  s.fig = null;
  s.leaving = false;
  syncTray(i, false);
  if (game.active === i) {
    const other = game.slots.findIndex((sl) => sl.order && !sl.leaving);
    if (other >= 0) setActive(other);
  }
}

function customerLeaves(i: number, mood: "happy" | "sad" | "angry", say: string, good: boolean): void {
  const s = game.slots[i];
  s.leaving = true;
  s.fig?.setMood(mood);
  // Move straight on to the next order so nothing gets dropped on the departing plate.
  if (game.active === i) {
    const other = game.slots.findIndex((sl) => sl.order && !sl.leaving);
    if (other >= 0) setActive(other);
  }
  showBubble(i, say, good);
  setTimeout(() => customersView.leave(i, () => clearSlot(i)), 1100);
}

function serve(i: number): void {
  const s = game.slots[i];
  if (!s.order || s.leaving) {
    showHint("Pick an order first: tap a ticket or plate.", 2);
    return;
  }
  if (s.plate.layers.length === 0) {
    showHint("That plate is empty!", 2);
    return;
  }
  const r = scorePlate(s.order, s.plate);
  const { pay, tip: baseTip } = payout(s.order, r.score, s.patience / s.maxPatience);
  const tip = Math.round(baseTip * (has("tipjar") ? 1.3 : 1));
  game.money += pay;
  game.tips += tip;
  game.served++;
  game.stars.push(r.stars);
  if (r.stars >= 2) {
    save.known[s.order.name] = (save.known[s.order.name] ?? 0) + 1;
    writeSave(save);
  }
  if (!game.best || r.score > game.best.score) game.best = { name: `#${s.order.id} ${s.order.name} (${r.score}%)`, score: r.score };
  const praise = ["Perfect!", "Incredible!", "Chef's kiss!", "Just like Grandma's!"];
  const say =
    r.stars === 3
      ? praise[Math.floor(game.rng() * praise.length)]
      : r.notes.length
        ? capitalise(r.notes[0]) + (r.stars >= 2 ? ", but tasty!" : "…")
        : r.stars === 2
          ? "Pretty good!"
          : "Hmm, okay.";
  customerLeaves(i, r.stars >= 2 ? "happy" : r.stars === 1 ? "sad" : "angry", `${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} ${say}`, r.stars >= 2);
  // The food is handed over right away so the plate is free for the next order.
  s.plate = emptyPlate();
  syncTray(i, false);
  sfx.whoosh();
  coinPop(i, pay + tip);
  setTimeout(() => sfx.coin(), 250);
  buzz(r.stars >= 2 ? [20, 40, 20] : 60);
  if (game.tutorial) {
    game.tutorial = false;
    game.nextSpawn = game.time + 2;
    save.tutorialDone = true;
    writeSave(save);
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function showBubble(i: number, text: string, good: boolean): void {
  const s = game.slots[i];
  s.bubble?.remove();
  const b = document.createElement("div");
  b.className = `bubble ${good ? "good" : "bad"}`;
  b.textContent = text;
  const slotW = bands.customers.w / 3;
  b.style.left = `${Math.max(70, Math.min(bands.customers.w - 70, i * slotW + slotW * 0.4))}px`;
  b.style.top = `${bands.customers.h * 0.62}px`;
  ui.root.appendChild(b);
  s.bubble = b;
  setTimeout(() => {
    b.remove();
    if (s.bubble === b) s.bubble = null;
  }, 2600);
}

function coinPop(i: number, amount: number): void {
  const c = document.createElement("div");
  c.className = "coin";
  c.textContent = `+$${amount}`;
  const slotW = bands.customers.w / 3;
  c.style.left = `${i * slotW + slotW * 0.5}px`;
  c.style.top = `${bands.tray.y + 10}px`;
  ui.root.appendChild(c);
  setTimeout(() => c.remove(), 1500);
}

function syncTray(i: number, animate: boolean): void {
  trayView.plates[i].sync(game.slots[i].plate, animate, () => sfx.plop());
}

// ---------------------------------------------------------------------------
// Hints

let hintUntil = 0;
let hintText = "";
function showHint(text: string, seconds = 3): void {
  hintText = text;
  hintUntil = performance.now() + seconds * 1000;
}
function hintOnce(key: string, text: string, seconds = 4): void {
  if (game.hintsShown.has(key)) return;
  game.hintsShown.add(key);
  showHint(text, seconds);
}

function tutorialHint(): string | null {
  if (!game.tutorial || game.phase !== "playing") return null;
  const s = game.slots.find((sl) => sl.order);
  if (!s) return null;
  const layers = s.plate.layers;
  const pattyOnGrill = counter.grillItems.find((g) => g.piece.kind === "patty");
  if (counter.page !== HOME_PAGE) return "Swipe back to the Grill.";
  if (layers.length === 0) return "Drag a bun up onto the plate in the tray.";
  const hasPatty = layers.some((l) => l.piece.kind === "patty");
  if (!hasPatty) {
    if (!pattyOnGrill) return "Now drag a patty onto the grill.";
    const p = pattyOnGrill.piece;
    if (p.cook[0] < 0.5 && p.cook[1] < 0.3) return "Let it sizzle until the bottom browns…";
    if (p.cook[1] < 0.45) return "Swipe up on the patty to flip it!";
    if (p.cook[0] < 0.47) return "Nearly there. Cook the other side too.";
    return "Medium! Drag the patty up onto the bun.";
  }
  if (layers[layers.length - 1].piece.kind !== "bun" || layers.length < 3) return "Add the top bun.";
  return "Ring the bell twice to serve!";
}

// ---------------------------------------------------------------------------
// Input

type Payload =
  | { type: "piece"; piece: Piece; fromGrill: { x: number; z: number } | null }
  | { type: "stack"; layers: Layer[]; from: number }
  | { type: "fries"; cook: number; basket: number | null }
  | { type: "drink"; flavor: DrinkId; fill: number; tap: number };

interface Held {
  payload: Payload;
  counterObj: THREE.Object3D;
  trayObj: THREE.Object3D;
}

interface Pointer {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  /** Game time at pointer down, for hold gestures that must work with a stepped clock. */
  gt0: number;
  x: number;
  y: number;
  band: ReturnType<typeof bandAt>;
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate" | "hold";
  hit: Hit | null;
  held: Held | null;
  sauce: SauceKind | null;
  drawSlot: number;
  plate: number;
  samples: { x: number; y: number; t: number }[];
  moved: boolean;
}

let ptr: Pointer | null = null;
let lastGesture: unknown = null;
let armedSauce: SauceKind | null = null;
let lastSquirt = 0;

/** A burger (or part of one) as a single object to carry around. */
function stackVisual(layers: Layer[]): THREE.Object3D {
  const g = new THREE.Group();
  let y = 0;
  layers.forEach((l, i) => {
    const role = i === 0 ? "bottom" : "top";
    const o = makeFood(l.piece, role);
    o.position.set(l.offX, y, l.offZ);
    y += stackHeight(l.piece, role);
    g.add(o);
  });
  g.scale.setScalar(0.6);
  return g;
}

function payloadVisual(p: Payload): THREE.Object3D {
  if (p.type === "stack") return stackVisual(p.layers);
  if (p.type === "piece") {
    const o = makeFood(p.piece, "top");
    o.scale.setScalar(GRILL_SCALE);
    return o;
  }
  if (p.type === "fries") {
    const f = makeFries(true);
    f.userData.setCook(p.cook);
    f.scale.setScalar(1.2);
    return f;
  }
  const c = makeCup(p.flavor, true);
  c.userData.setFill(p.fill);
  return c;
}

function startHold(pt: Pointer, payload: Payload): void {
  const counterObj = payloadVisual(payload);
  const trayObj = payloadVisual(payload);
  if (payload.type === "fries" || payload.type === "drink") trayObj.scale.multiplyScalar(0.55);
  if (payload.type === "stack") trayObj.scale.setScalar(1);
  pt.held = { payload, counterObj, trayObj };
  pt.mode = "held";
  counter.setHeld(counterObj);
  moveHold(pt);
  sfx.pop();
}

function moveHold(pt: Pointer): void {
  if (!pt.held) return;
  const band = bandAt(pt.y);
  if (band === "tray" || band === "customers") {
    counter.moveHeld(new THREE.Vector3(), false);
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    trayView.showGhost(slot >= 0 ? slot : game.active, pt.held.trayObj);
  } else {
    trayView.showGhost(-1, null);
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    counter.moveHeld(g, true);
  }
}

function velocity(pt: Pointer): { vx: number; vy: number } {
  const end = pt.samples[pt.samples.length - 1]?.t ?? 0;
  const recent = pt.samples.filter((s) => end - s.t < 120);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = Math.max(1, b.t - a.t);
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

function addToPlate(slot: number, payload: Payload, spread: number): boolean {
  const s = game.slots[slot];
  if (s.leaving) {
    showHint("That customer is on their way out.", 1.5);
    return false;
  }
  if (payload.type === "stack") {
    // A burger built (or food kept) under the heat lamp goes on top of whatever's on the plate.
    for (const l of payload.layers) s.plate.layers.push(l);
    syncTray(slot, true);
    trayView.plates[slot].kick(0.4);
    return true;
  }
  if (payload.type === "piece") {
    const p = payload.piece;
    s.plate.layers.push({ piece: p, offX: (Math.random() - 0.5) * spread, offZ: (Math.random() - 0.5) * spread });
    syncTray(slot, true);
    trayView.plates[slot].kick(spread * 4);
    if (s.order) {
      const exp = s.order.layers[s.plate.layers.length - 1];
      if (exp && exp.kind === "patty" && p.kind === "patty") showHint(`Patty: ${pattyLabel((p.cook[0] + p.cook[1]) / 2)}`, 1.5);
    }
    return true;
  }
  if (payload.type === "fries") {
    if (s.plate.fries) {
      showHint("This plate already has fries.", 2);
      return false;
    }
    s.plate.fries = { cook: payload.cook };
  } else {
    if (s.plate.drink) {
      showHint("This plate already has a drink.", 2);
      return false;
    }
    s.plate.drink = { flavor: payload.flavor, fill: payload.fill };
  }
  syncTray(slot, false);
  sfx.plop();
  return true;
}

function finishHold(pt: Pointer): void {
  const held = pt.held!;
  const payload = held.payload;
  counter.setHeld(null);
  trayView.showGhost(-1, null);
  disposeObject(held.trayObj);
  const band = bandAt(pt.y);
  const { vy } = velocity(pt);
  const dur = (pt.samples[pt.samples.length - 1]?.t ?? pt.t0) - pt.t0;
  const fast = pt.y0 - pt.y > 40 && (vy < -0.6 || dur < 350);
  let done = false;

  if (band === "tray" || band === "customers") {
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    done = addToPlate(slot >= 0 ? slot : game.active, payload, has("steady") ? 0.03 : 0.08);
    if (done && slot >= 0) setActive(slot);
  } else if (band === "counter") {
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    const hold = counter.page === HOME_PAGE ? counter.overHold(g) : -1;
    if (counter.page === HOME_PAGE && counter.overTrash(g)) {
      sfx.thud();
      buzz(20);
      done = true;
    } else if (hold >= 0 && (payload.type === "piece" || payload.type === "stack")) {
      // Build a burger ahead (or park food) under the heat lamp.
      const spot = counter.holds[hold];
      const add = payload.type === "piece" ? [{ piece: payload.piece, offX: (Math.random() - 0.5) * 0.06, offZ: (Math.random() - 0.5) * 0.06 }] : payload.layers;
      if (spot.layers.length + add.length > 9) showHint("That stack's tall enough.", 1.5);
      else {
        spot.layers.push(...add);
        counter.syncHold(hold, true);
        sfx.plop();
        hintOnce("hold", "Food under the heat lamp stays hot but slowly dries out. Drag the stack to a plate when it's ready.", 4);
        done = true;
      }
    } else if (hold >= 0) {
      showHint("Fries and drinks go straight on the tray.", 1.5);
    } else if (payload.type === "stack") {
      // A single grill item can go back on the grill.
      const over = counter.overGrill(g);
      const only = payload.layers.length === 1 ? payload.layers[0].piece : null;
      if (over && only && GRILLABLE.has(only.kind)) {
        counter.addGrillItem(only, over.x, over.z);
        sfx.sizzleHit();
        done = true;
      }
    } else if (payload.type === "piece") {
      const over = counter.overGrill(g);
      if (over && GRILLABLE.has(payload.piece.kind)) {
        counter.addGrillItem(payload.piece, over.x, over.z);
        if (!payload.fromGrill) sfx.sizzleHit();
        else sfx.thud();
        done = true;
      } else if (fast && !payload.fromGrill) {
        // Flicked up from a bin: toss it onto the active plate, a little less neatly.
        done = addToPlate(game.active, payload, has("steady") ? 0.08 : 0.22);
        sfx.whoosh();
      } else if (over && !GRILLABLE.has(payload.piece.kind)) {
        showHint(`${capitalise(payload.piece.kind)} doesn't go on the grill. Drag it up to the tray.`, 2.5);
      }
    } else if (payload.type === "fries" && payload.basket === null) {
      const hit = counter.hit(ndcIn(bands.counter, pt.x, pt.y));
      if (hit?.type === "basket") {
        const b = counter.baskets[hit.idx];
        if (!b.loaded) {
          b.loaded = true;
          b.cook = 0;
          b.down = true;
          b.goldenRung = false;
          sfx.sizzleHit();
          done = true;
          hintOnce("fries-ding", "The fryer chimes when fries are golden. Tap the basket to lift it.", 4);
        } else showHint("That basket is busy.", 1.5);
      }
    }
  }

  if (!done) {
    // Put things back where they came from.
    if (payload.type === "piece" && payload.fromGrill) counter.addGrillItem(payload.piece, payload.fromGrill.x, payload.fromGrill.z);
    if (payload.type === "stack") {
      counter.holds[payload.from].layers.push(...payload.layers);
      counter.syncHold(payload.from, false);
    }
    if (payload.type === "fries" && payload.basket !== null) {
      const b = counter.baskets[payload.basket];
      b.loaded = true;
      b.cook = payload.cook;
    }
    if (payload.type === "drink") counter.taps[payload.tap].fill = payload.fill;
  } else if (payload.type === "drink") {
    counter.taps[payload.tap].fill = 0;
  }
}

function sauceAt(pt: Pointer, kind: SauceKind): void {
  const slot = trayView.pick(ndcIn(bands.tray, pt.x, pt.y));
  const target = slot >= 0 ? slot : game.active;
  const plate = game.slots[target].plate;
  if (plate.layers.length === 0) {
    showHint("Start with a bun before adding sauce.", 2);
    return;
  }
  let top = plate.layers[plate.layers.length - 1];
  // Lifting the finger and carrying on keeps drawing the same squiggle rather than adding a layer.
  if (top.piece.kind !== kind || !top.piece.stroke) {
    const p = newPiece(kind);
    p.stroke = [];
    plate.layers.push({ piece: p, offX: top.offX * 0.5, offZ: top.offZ * 0.5 });
    top = plate.layers[plate.layers.length - 1];
    pt.drawSlot = target;
    setActive(target);
  }
  const q = trayView.drawPoint(ndcIn(bands.tray, pt.x, pt.y), target);
  const stroke = top.piece.stroke!;
  const last = stroke[stroke.length - 1];
  if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 0.07) {
    stroke.push({ x: q.x - top.offX, z: q.z - top.offZ });
    syncTray(target, false);
    const now = performance.now();
    if (now - lastSquirt > 70) {
      sfx.squirt();
      lastSquirt = now;
    }
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (game.phase !== "playing" || ptr) return;
  sfx.unlock();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic or already-released pointers can't be captured; events still arrive.
  }
  const x = e.clientX - colX;
  const y = e.clientY;
  const pt: Pointer = {
    id: e.pointerId,
    x0: x,
    y0: y,
    t0: e.timeStamp,
    gt0: game.time,
    x,
    y,
    band: bandAt(y),
    mode: "none",
    hit: null,
    held: null,
    sauce: null,
    drawSlot: -1,
    plate: -1,
    samples: [{ x, y, t: e.timeStamp }],
    moved: false,
  };
  ptr = pt;
  if (x < 0 || x > bands.counter.w) return;

  if (pt.band === "counter") {
    const hit = counter.hit(ndcIn(bands.counter, x, y));
    pt.hit = hit;
    if (!hit) pt.mode = "swipe";
    else if (hit.type === "bin") startHold(pt, { type: "piece", piece: newPiece(hit.kind), fromGrill: null });
    else if (hit.type === "grillItem") pt.mode = "grill";
    else if (hit.type === "hold") pt.mode = "hold";
    else if (hit.type === "bottle") {
      pt.mode = "sauce";
      pt.sauce = hit.sauce;
      counter.liftBottle(hit.sauce, counter.groundPoint(ndcIn(bands.counter, x, y), 0.3));
    } else if (hit.type === "friesBin") startHold(pt, { type: "fries", cook: 0, basket: null });
    else if (hit.type === "basket") pt.mode = "basket";
    else if (hit.type === "tap") {
      pt.mode = "pour";
      counter.taps[hit.idx].pouring = true;
    } else if (hit.type === "cup") {
      const t = counter.taps[hit.idx];
      if (t.fill > 0.05) {
        startHold(pt, { type: "drink", flavor: t.flavor, fill: t.fill, tap: hit.idx });
        t.fill = 0;
      } else showHint("Hold the button above the cup to pour.", 2);
    }
  } else if (pt.band === "tray") {
    if (armedSauce) {
      pt.mode = "sauce";
      pt.sauce = armedSauce;
      sauceAt(pt, armedSauce);
    } else {
      pt.mode = "plate";
      pt.plate = trayView.pick(ndcIn(bands.tray, x, y));
      if (pt.plate >= 0) setActive(pt.plate);
    }
  } else if (pt.band === "customers") {
    setActive(Math.min(2, Math.floor((x / bands.customers.w) * 3)));
  }
});

canvas.addEventListener("pointermove", (e) => {
  const pt = ptr;
  if (!pt || e.pointerId !== pt.id) return;
  pt.x = e.clientX - colX;
  pt.y = e.clientY;
  const now = e.timeStamp;
  // Use coalesced events so flicks are measured accurately even when frames are slow.
  const evs = e.getCoalescedEvents?.() ?? [];
  for (const ce of evs.length ? evs : [e]) pt.samples.push({ x: ce.clientX - colX, y: ce.clientY, t: ce.timeStamp });
  while (pt.samples.length > 24) pt.samples.shift();
  const dx = pt.x - pt.x0;
  const dy = pt.y - pt.y0;
  if (Math.hypot(dx, dy) > 12) pt.moved = true;

  switch (pt.mode) {
    case "swipe":
      counter.dragOffset = -dx * (7.3 / bands.counter.w);
      break;
    case "held":
      moveHold(pt);
      break;
    case "grill":
      // Turn into a drag once the finger travels sideways or down, reaches the tray, or lingers.
      // A quick upward flick that stays on the counter is a flip, decided on release.
      if (pt.moved && pt.hit?.type === "grillItem" && (now - pt.t0 > 400 || Math.abs(dx) > Math.abs(dy) || dy > 0 || bandAt(pt.y) !== "counter")) {
        const item: GrillItem = pt.hit.item;
        if (item.flipT < 0) {
          counter.removeGrillItem(item);
          startHold(pt, { type: "piece", piece: item.piece, fromGrill: { x: item.x, z: item.z } });
        }
      }
      break;
    case "hold":
      // Drag a whole assembly-spot stack: to a plate, another spot, back to the grill, or the trash.
      if (pt.moved && pt.hit?.type === "hold") {
        const spot = counter.holds[pt.hit.idx];
        if (spot.layers.length) {
          const layers = spot.layers.splice(0);
          counter.syncHold(pt.hit.idx, false);
          startHold(pt, { type: "stack", layers, from: pt.hit.idx });
        } else pt.mode = "swipe";
      }
      break;
    case "basket":
      if (pt.moved && pt.hit?.type === "basket" && (now - pt.t0 > 400 || dy > 0 || bandAt(pt.y) !== "counter")) {
        const b = counter.baskets[pt.hit.idx];
        if (b.loaded) {
          b.loaded = false;
          b.down = false;
          startHold(pt, { type: "fries", cook: b.cook, basket: pt.hit.idx });
        }
      }
      break;
    case "sauce":
      if (bandAt(pt.y) === "tray") {
        counter.liftBottle(pt.sauce!, null);
        sauceAt(pt, pt.sauce!);
      } else if (bandAt(pt.y) === "counter") counter.liftBottle(pt.sauce!, counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3));
      break;
  }
});

function endPointer(e: PointerEvent, cancelled: boolean): void {
  const pt = ptr;
  if (!pt || e.pointerId !== pt.id) return;
  ptr = null;
  const dx = pt.x - pt.x0;
  const dy = pt.y - pt.y0;
  const dt = e.timeStamp - pt.t0;
  const { vy } = velocity(pt);
  const flickUp = !cancelled && dy < -30 && Math.abs(dy) > Math.abs(dx) && (dt < 400 || vy < -0.6);
  lastGesture = { mode: pt.mode, dx, dy, dt, vy, flickUp, moved: pt.moved };

  switch (pt.mode) {
    case "swipe": {
      counter.dragOffset = 0;
      if (!cancelled && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) goToPage(counter.page + (dx < 0 ? 1 : -1));
      break;
    }
    case "held":
      if (cancelled) {
        pt.y = pt.y0;
        pt.x = pt.x0;
      }
      finishHold(pt);
      break;
    case "grill":
      if (!cancelled && pt.hit?.type === "grillItem" && (flickUp || !pt.moved)) {
        if (flickUp) {
          if (counter.flip(pt.hit.item)) {
            sfx.flip();
            buzz(15);
            hintOnce("flip-done", "Nice flip!", 1.2);
          } else if (pt.hit.item.piece.kind === "egg") showHint("Eggs stay sunny side up. Drag it to the tray when the white sets.", 2.5);
        } else showHint("Swipe up to flip, or drag it to the tray.", 2);
      }
      break;
    case "basket":
      if (!cancelled && pt.hit?.type === "basket") {
        const b = counter.baskets[pt.hit.idx];
        if (!b.loaded) showHint("Drag frozen fries into the basket.", 2);
        else if (!pt.moved || flickUp) {
          b.down = !b.down;
          sfx.whoosh();
          if (!b.down) hintOnce("fries-drag", "Drag the fries up to the tray.", 2.5);
        }
      }
      break;
    case "pour":
      for (const t of counter.taps) t.pouring = false;
      break;
    case "sauce":
      counter.liftBottle(pt.sauce!, null);
      if (!cancelled && !pt.moved && pt.band === "counter") {
        armedSauce = armedSauce === pt.sauce ? null : pt.sauce;
        if (armedSauce) showHint(`Draw ${armedSauce} on a plate. Tap the bottle again to stop.`, 3);
      } else if (!cancelled && pt.moved && bandAt(pt.y) === "counter") {
        // Dropping the bottle on an assembly spot gives that burger a squiggle of sauce.
        const hold = counter.overHold(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.35));
        const spot = counter.holds[hold];
        if (spot?.layers.length) {
          const p = newPiece(pt.sauce!);
          p.stroke = [-0.5, -0.25, 0, 0.25, 0.5].map((x, k) => ({ x, z: k % 2 ? 0.18 : -0.18 }));
          spot.layers.push({ piece: p, offX: 0, offZ: 0 });
          counter.syncHold(hold, false);
          sfx.squirt();
        } else if (hold >= 0) showHint("Start that burger with a bun first.", 1.5);
      }
      break;
    case "hold":
      if (!cancelled && !pt.moved && pt.hit?.type === "hold") {
        if (counter.holds[pt.hit.idx].layers.length) showHint("Drag the stack to a plate. It stays warm here, but slowly dries out.", 2.5);
        else showHint("Build a burger here ahead of time, or park cooked food.", 2.5);
      }
      break;
    case "plate":
      if (!cancelled && pt.plate >= 0 && dy > 40 && Math.abs(dy) > Math.abs(dx)) removeTop(pt.plate);
      break;
  }
}
canvas.addEventListener("pointerup", (e) => endPointer(e, false));
canvas.addEventListener("pointercancel", (e) => endPointer(e, true));
canvas.addEventListener("lostpointercapture", (e) => endPointer(e, true));

/** Drop whatever the finger was doing, putting held things back (pause, tab switch, new shift). */
function cancelPointer(): void {
  if (ptr) endPointer(new PointerEvent("pointercancel", { pointerId: ptr.id }), true);
}

function removeTop(slot: number): void {
  const plate = game.slots[slot].plate;
  if (plate.layers.length) plate.layers.pop();
  else if (plate.drink) plate.drink = null;
  else if (plate.fries) plate.fries = null;
  else return;
  syncTray(slot, false);
  sfx.whoosh();
  buzz(10);
}

function goToPage(p: number): void {
  const before = counter.page;
  counter.setPage(p);
  if (counter.page !== before) sfx.whoosh();
  armedSauce = null;
}

ui.tabs.forEach((t, i) =>
  t.addEventListener("click", () => {
    sfx.unlock();
    goToPage(i);
  }),
);
ui.tickets.forEach((t, i) =>
  t.addEventListener("pointerdown", () => {
    sfx.unlock();
    // Tapping the ticket you're already on flips between recipe view and the full list.
    if (game.active === i) game.slots[i].expanded = !game.slots[i].expanded;
    setActive(i);
  }),
);

let lastDing = 0;
let singleDingTimer = 0;
ui.bell.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  sfx.unlock();
  if (game.phase !== "playing") return;
  sfx.ding();
  buzz(10);
  ui.bell.classList.remove("ring");
  void ui.bell.offsetWidth;
  ui.bell.classList.add("ring");
  const now = performance.now();
  if (now - lastDing < 550) {
    clearTimeout(singleDingTimer);
    lastDing = 0;
    serve(game.active);
  } else {
    lastDing = now;
    clearTimeout(singleDingTimer);
    singleDingTimer = window.setTimeout(() => showHint("Ding ding! Ring twice to serve.", 1.6), 600);
  }
});

// ---------------------------------------------------------------------------
// Screens

let screenShownAt = 0;
ui.root.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  const act = btn?.dataset.act;
  if (!act) return;
  // A double tap on one screen shouldn't also press a button on the screen that replaces it.
  if (performance.now() - screenShownAt < 450 && btn!.closest(".screen")) return;
  sfx.unlock();
  switch (act) {
    case "start":
    case "restart":
      startShift();
      break;
    case "pick": {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id as UpgradeId | undefined;
      if (!id || !save.offer.includes(id)) break;
      save.upgrades.push(id);
      save.offer = [];
      writeSave(save);
      sfx.coin();
      showTitle();
      break;
    }
    case "next":
      showTitle();
      break;
    case "new-trip":
      if (btn!.dataset.armed !== "1") {
        btn!.dataset.armed = "1";
        btn!.textContent = "Tap again to start over (upgrades and savings reset)";
        break;
      }
      Object.assign(save, freshSave(), { tutorialDone: save.tutorialDone, trips: save.trips, best: save.best });
      writeSave(save);
      showTitle();
      break;
    case "resume":
      game.phase = "playing";
      ui.menu.hidden = true;
      break;
    case "sound": {
      sfx.setMuted(!sfx.muted);
      (e.target as HTMLElement).textContent = `Sound: ${sfx.muted ? "off" : "on"}`;
      try {
        localStorage.setItem("bv-muted", sfx.muted ? "1" : "0");
      } catch {
        // Storage can be unavailable (private mode); the setting just won't stick.
      }
      break;
    }
    case "check-update": {
      const btn = e.target as HTMLButtonElement;
      btn.textContent = "Checking…";
      void checkNow().then((v) => {
        if (!v) btn.textContent = "Couldn't reach the server";
        else if (Number(v.build) > Number(__BUILD__)) btn.textContent = `Build #${v.build} is available`;
        else btn.textContent = "You're on the latest build";
      });
      break;
    }
    case "update-now":
      if (game.pendingUpdate) reloadTo(game.pendingUpdate.build, true);
      break;
    case "install":
      void installPrompt?.prompt();
      break;
    case "update-later":
      ui.update.hidden = true;
      break;
  }
});

ui.menuBtn.addEventListener("click", () => {
  if (game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    ui.menu.hidden = false;
  }
});

try {
  if (localStorage.getItem("bv-muted") === "1") {
    sfx.setMuted(true);
    ui.menu.querySelector('[data-act="sound"]')!.textContent = "Sound: off";
  }
} catch {
  // ignore
}

function startShift(): void {
  cancelPointer();
  armedSauce = null;
  for (let i = 0; i < 3; i++) {
    const s = game.slots[i];
    if (s.fig) customersView.leave(i, () => {});
    s.bubble?.remove();
    Object.assign(s, { order: null, plate: emptyPlate(), fig: null, leaving: false, ticketKey: "", bubble: null });
    syncTray(i, false);
  }
  for (const g of [...counter.grillItems]) counter.removeGrillItem(g);
  counter.holds.forEach((h, i) => {
    h.layers = [];
    counter.syncHold(i, false);
  });
  counter.warm = false;
  for (const b of counter.baskets) Object.assign(b, { loaded: false, cook: 0, down: false, goldenRung: false });
  for (const t of counter.taps) Object.assign(t, { fill: 0, pouring: false });
  Object.assign(game, {
    phase: "playing",
    time: 0,
    money: 0,
    tips: 0,
    served: 0,
    lost: 0,
    stars: [],
    best: null,
    spawned: 0,
    nextSpawn: 1.2,
    active: 0,
    tutorial: !save.tutorialDone,
  });
  applyStop();
  counter.fryBoost = has("turbo") ? 1.35 : 1;
  counter.autoStopPour = has("autostop");
  counter.setPage(HOME_PAGE);
  const intro = stop().newThing;
  if (intro && !game.tutorial) showHint(intro, 6);
  ui.title.hidden = true;
  ui.menu.hidden = true;
  ui.summary.hidden = true;
}

/** Dress the truck for the current stop: scenery, pantry bins and HUD label. */
function applyStop(): void {
  const st = stop();
  counter.setPantry(st.pantry);
  customersView.setBackdrop(st.backdrop);
  ui.stop.textContent = st.name;
}

const offerList = () => save.offer.map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean);

function showTitle(): void {
  game.stopIdx = save.stop;
  applyStop();
  ui.title.innerHTML = titleHtml({
    stop: stop(),
    stopNum: game.stopIdx + 1,
    stops: STOPS.length,
    trips: save.trips,
    bank: save.bank,
    owned: save.upgrades.map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean),
    offer: offerList(),
    fresh: !save.tutorialDone && save.stop === 0,
  });
  game.phase = "title";
  screenShownAt = performance.now();
  ui.title.hidden = false;
  ui.summary.hidden = true;
  ui.menu.hidden = true;
  if (game.pendingUpdate) reloadTo(game.pendingUpdate.build);
}

function endShift(): void {
  game.phase = "summary";
  for (const s of game.slots) {
    s.bubble?.remove();
    s.bubble = null;
  }
  const here = stop();
  const avg = game.stars.length ? game.stars.reduce((a, b) => a + b, 0) / game.stars.length : 0;
  const ok = passed(avg, game.served, here.customers);
  const lastStop = game.stopIdx === STOPS.length - 1;
  save.bank += game.money + game.tips;
  save.best[here.id] = Math.max(save.best[here.id] ?? 0, avg);
  if (ok) {
    save.offer = upgradeChoices(save.upgrades, game.rng).map((u) => u.id);
    if (lastStop) {
      save.stop = 0;
      save.trips++;
    } else save.stop = game.stopIdx + 1;
  }
  writeSave(save);
  ui.summary.innerHTML = summaryHtml({
    stop: here,
    served: game.served,
    lost: game.lost,
    stars: game.stars,
    earned: game.money,
    tips: game.tips,
    best: game.best?.name ?? null,
    outcome: !ok ? "failed" : lastStop ? "trip" : "passed",
    next: STOPS[save.stop],
    offer: offerList(),
  });
  ui.summary.hidden = false;
  screenShownAt = performance.now();
  sfx.chime();
  // A pending update waits until the player leaves this screen (see showTitle).
  if (game.pendingUpdate) {
    ui.updateText.textContent = `Build #${game.pendingUpdate.build} will load when you continue.`;
    ui.update.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Updates

const checkNow = startUpdateChecks((v) => {
  game.pendingUpdate = v;
  if (game.phase === "title") {
    ui.updateText.textContent = `Updating to build #${v.build}…`;
    ui.update.hidden = false;
    setTimeout(() => {
      if (game.phase === "title") reloadTo(v.build);
    }, 1200);
  } else if (game.phase === "summary") {
    ui.updateText.textContent = `Build #${v.build} will load when you continue.`;
    ui.update.hidden = false;
  } else {
    ui.updateText.textContent = `Build #${v.build} is ready (you're on #${__BUILD__}).`;
    ui.update.hidden = false;
  }
});
console.info(`Bun Voyage ${buildLabel()}`);

// Installable app: the browser offers "Add to home screen"; we surface it in the menu.
registerServiceWorker();
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
  ui.install.hidden = false;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  ui.install.hidden = true;
});

// ---------------------------------------------------------------------------
// Main loop

function tick(dt: number): void {
  if (game.phase === "playing") {
    // The shift clock waits while the first customer is talked through their burger.
    if (!(game.tutorial && game.spawned >= 1)) game.time += dt;
    // Customers arrive while the window is open.
    const free = game.slots.findIndex((s) => !s.order && !s.fig);
    const tutorialHold = game.tutorial && game.spawned >= 1;
    if (game.time < stop().shiftLength && game.spawned < stop().customers && free >= 0 && game.time >= game.nextSpawn && !tutorialHold) {
      spawnCustomer(free);
      const level = game.time / stop().shiftLength;
      game.nextSpawn = game.time + (17 - 8 * level) * (0.8 + game.rng() * 0.4);
    }
    // If the window is empty, don't make the player wait.
    if (!game.slots.some((s) => s.order) && game.nextSpawn > game.time + 2 && !game.tutorial) game.nextSpawn = game.time + 2;

    game.slots.forEach((s, i) => {
      if (!s.order || s.leaving) return;
      s.patience -= dt;
      if (s.fig) s.fig.setMood(s.patience / s.maxPatience < 0.3 ? "sad" : "neutral");
      if (s.patience <= 0) {
        game.lost++;
        sfx.grumble();
        customerLeaves(i, "angry", "Too slow! I'm off.", false);
      }
    });

    // Food under the heat lamp slowly dries out.
    for (const h of counter.holds) for (const l of h.layers) l.piece.held = (l.piece.held ?? 0) + dt;

    // Press and hold a fresh patty to smash it (at stops that serve smash burgers).
    if (ptr && ptr.mode === "grill" && !ptr.moved && ptr.hit?.type === "grillItem" && game.time - ptr.gt0 > 0.45 && stop().menu.some((r) => r.smash)) {
      if (counter.smash(ptr.hit.item)) {
        sfx.thud();
        sfx.sizzleHit();
        buzz(40);
        ptr.mode = "none";
        hintOnce("smash", "Smashed! Thin patties cook fast, so flip them soon.", 3);
      }
    }

    const doneSpawning = game.time >= stop().shiftLength || game.spawned >= stop().customers;
    if (doneSpawning && game.slots.every((s) => !s.order && !s.fig)) endShift();
  }

  if (game.phase === "playing" || game.phase === "title" || game.phase === "summary") {
    counter.update(game.phase === "playing" ? dt : 0);
    trayView.update(dt);
    customersView.update(dt, game.active);
  }
  sfx.setLoops(game.phase === "playing" ? counter.sizzleLevel() : 0, game.phase === "playing" ? counter.bubbleLevel() : 0, counter.pouring());
  updateUi();
}

counter.events.golden = () => {
  sfx.chime();
  if (counter.page !== 2) showHint("Fries are golden! →", 2);
};
counter.events.spill = () => {
  sfx.splash();
  buzz(80);
  showHint("Whoops, it overflowed! Let go sooner.", 2);
};
counter.events.burning = () => {
  if (counter.page !== HOME_PAGE) showHint("Something's burning on the grill! ←", 2.5);
  else hintOnce("burning", "Smoke means burning! Drag it to the trash can.", 2.5);
};

let lastTimerText = "";
function updateUi(): void {
  const left = Math.max(0, stop().shiftLength - game.time);
  const tText = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Closing";
  if (tText !== lastTimerText) {
    ui.timer.textContent = tText;
    ui.timer.classList.toggle("closing", left <= 0);
    lastTimerText = tText;
  }
  const money = `$${game.money + game.tips}`;
  if (ui.money.textContent !== money) ui.money.textContent = money;

  game.slots.forEach((s, i) => {
    const t = ui.tickets[i];
    const show = !!s.order && !s.leaving && game.phase !== "title";
    t.hidden = !show;
    if (!show || !s.order) return;
    const pct = s.patience / s.maxPatience;
    const key = `${s.order.id}|${s.expanded}|${s.plate.layers.map((l) => l.piece.kind).join(",")}|${!!s.plate.fries}|${s.plate.drink?.flavor}|${Math.round(pct * 50)}`;
    if (key !== s.ticketKey) {
      const fresh = !s.ticketKey.startsWith(`${s.order.id}|${s.expanded}|`);
      t.innerHTML = ticketHtml(s.order, s.plate, game.tutorial && game.spawned === 1 && i === game.slots.findIndex((x) => x.order) ? 1 : pct, s.expanded);
      s.ticketKey = key;
      // Long orders on short screens get a denser ticket rather than being cut off.
      if (fresh) {
        t.classList.remove("tight");
        if (t.scrollHeight > t.clientHeight + 1) t.classList.add("tight");
      }
    }
    t.classList.toggle("active", i === game.active);
  });
  trayView.setActive(
    game.active,
    game.slots.map((s) => !!s.order),
  );

  ui.tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === counter.page)));
  updateGrillTags();
  updateHoldUi();
  ui.drinkLabels.forEach((el, i) => {
    const v = counter.drinkLabelPoint(i).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    const visible = game.phase === "playing" && x > 20 && x < bands.counter.w - 20;
    el.hidden = !visible;
    if (visible) {
      el.style.left = `${x}px`;
      el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
    }
  });
  // Tab dots: something needs attention on that counter.
  const friesReady = counter.baskets.some((b) => b.loaded && b.cook >= 0.55);
  const friesBurning = counter.baskets.some((b) => b.loaded && b.down && b.cook >= 0.9);
  const grillBurning = counter.grillItems.some((g) => g.piece.cook[0] > 0.85);
  const dots = [false, grillBurning, friesReady || friesBurning];
  const hot = [false, grillBurning, friesBurning];
  ui.tabDots.forEach((d, i) => {
    d.hidden = !dots[i] || i === counter.page;
    d.classList.toggle("hot", hot[i]);
  });

  const tut = tutorialHint();
  const now = performance.now();
  const text = now < hintUntil ? hintText : tut;
  if (text && ui.hint.textContent !== text) ui.hint.textContent = text;
  ui.hint.hidden = !text || game.phase !== "playing";
}

/** Small doneness tags floating over grill items, so players don't have to judge colour alone. */
const grillTags: HTMLElement[] = [];
function itemTag(p: Piece): string {
  const short = (t: number) => {
    const l = pattyLabel(t);
    return l === "Well done" ? "Well" : l === "Medium" ? "Med" : l;
  };
  switch (p.kind) {
    case "patty":
      return `<span>▼ ${short(p.cook[0])}</span><span>▲ ${short(p.cook[1])}</span>`;
    case "bacon": {
      const t = avgCook(p);
      return t >= 1 ? "Burnt" : t >= 0.4 ? "Crispy" : p.cook[0] > 0.3 && p.cook[1] < 0.1 ? "Flip me" : "Raw";
    }
    case "egg": {
      const t = Math.max(p.cook[0], p.cook[1]);
      return t >= 1 ? "Rubbery" : t >= 0.35 ? "Set" : "Runny";
    }
    case "pineapple": {
      const t = Math.max(p.cook[0], p.cook[1]);
      return t >= 1 ? "Burnt" : t >= 0.35 ? "Grilled" : "Grilling";
    }
    case "bun": {
      const t = bunToast(p);
      return t >= 0.95 ? "Burnt" : t >= 0.35 ? "Toasted" : "Toasting";
    }
    default:
      return "";
  }
}
/** Freshness tags over the assembly spots, and the grill's Hot/Warm switch. */
const holdTags: HTMLElement[] = [0, 1, 2].map(() => {
  const el = document.createElement("div");
  el.className = "gtag hold";
  el.hidden = true;
  ui.root.appendChild(el);
  return el;
});
const zoneBtn = document.createElement("button");
zoneBtn.className = "zone";
zoneBtn.hidden = true;
ui.root.appendChild(zoneBtn);
zoneBtn.addEventListener("click", () => {
  counter.warm = !counter.warm;
  sfx.flip();
  if (counter.warm) hintOnce("warm", "The right end of the grill is on low: food there barely cooks.", 3);
});
function updateHoldUi(): void {
  const onGrill = game.phase === "playing" && Math.abs(counter.page - HOME_PAGE) < 1 && counter.dragOffset === 0;
  counter.holds.forEach((h, i) => {
    const el = holdTags[i];
    const held = Math.max(0, ...h.layers.map((l) => l.piece.held ?? 0));
    el.hidden = !onGrill || !h.layers.length;
    if (el.hidden) return;
    const text = held < HOLD_GRACE ? "Fresh" : held < (HOLD_GRACE + HOLD_RUIN) / 2 ? "Drying" : "Dried out";
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("hot", held >= (HOLD_GRACE + HOLD_RUIN) / 2);
    const v = new THREE.Vector3(pageX(1) + h.x, 0.3, h.z + 0.5).project(counter.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
  zoneBtn.hidden = !onGrill;
  if (zoneBtn.hidden) return;
  const label = counter.warm ? "Warm: on" : "Warm: off";
  if (zoneBtn.textContent !== label) zoneBtn.textContent = label;
  zoneBtn.classList.toggle("on", counter.warm);
  const v = new THREE.Vector3(pageX(1) + WARM_X0 + 0.95, GRILL_TOP, 2.6).project(counter.camera);
  zoneBtn.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
  zoneBtn.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
}

function updateGrillTags(): void {
  const items = game.phase === "playing" ? counter.grillItems : [];
  while (grillTags.length < items.length) {
    const el = document.createElement("div");
    el.className = "gtag";
    ui.root.appendChild(el);
    grillTags.push(el);
  }
  grillTags.forEach((el, i) => {
    const it = items[i];
    if (!it) {
      el.hidden = true;
      return;
    }
    const v = it.obj.position.clone().add(new THREE.Vector3(0, 0.2, 0.75)).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    el.hidden = x < 0 || x > bands.counter.w || it.flipT >= 0;
    if (el.hidden) return;
    const html = itemTag(it.piece);
    if (el.innerHTML !== html) el.innerHTML = html;
    const burning = Math.max(it.piece.cook[0], it.piece.cook[1]) >= (it.piece.kind === "patty" || it.piece.kind === "bacon" ? 0.92 : 0.95);
    el.classList.toggle("hot", burning && !counter.isWarm(it));
    el.classList.toggle("warm", counter.isWarm(it));
    el.style.left = `${x}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
}

const clearColor = new THREE.Color("#16231f");
function render(): void {
  const H = viewH;
  renderer.setScissorTest(false);
  renderer.setClearColor(clearColor);
  renderer.clear();
  renderer.setScissorTest(true);
  const draw = (r: Rect, scene: THREE.Scene, cam: THREE.Camera) => {
    const y = H - r.y - r.h;
    renderer.setViewport(r.x, y, r.w, r.h);
    renderer.setScissor(r.x, y, r.w, r.h);
    renderer.render(scene, cam);
  };
  draw(bands.customers, customersView.scene, customersView.camera);
  draw(bands.tray, trayView.scene, trayView.camera);
  draw(bands.counter, counter.scene, counter.camera);
}

let last = performance.now();
/** Automation can freeze the loop and drive time itself (see __bv below). */
let manualClock = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manualClock) {
    tick(dt);
    render();
  }
  requestAnimationFrame(frame);
}
showTitle();
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cancelPointer();
    if (game.phase === "playing") {
      game.phase = "paused";
      ui.menu.hidden = false;
    }
    sfx.suspend();
  }
});
window.addEventListener("blur", cancelPointer);

// Debug/automation hook for playtesting in a headless browser.
(window as unknown as { __bv: unknown }).__bv = {
  game,
  counter,
  trayView,
  bands,
  startShift,
  serve,
  gesture: () => lastGesture,
  ptr: () => ptr && { mode: ptr.mode, hit: ptr.hit?.type, band: ptr.band },
  mem: () => ({ ...renderer.info.memory }),
  step: (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) tick(1 / 30);
    render();
  },
  /** Screen position (CSS px) of a world point in one of the bands. */
  project: (band: "counter" | "tray" | "customers", x: number, y: number, z: number) => {
    const cam = band === "counter" ? counter.camera : band === "tray" ? trayView.camera : customersView.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(cam);
    const r = bands[band];
    return [r.x + ((v.x + 1) / 2) * r.w, r.y + ((1 - v.y) / 2) * r.h];
  },
  get bins() {
    return counter.bins;
  },
  save,
  showTitle,
  manual: (on: boolean) => {
    manualClock = on;
  },
};

