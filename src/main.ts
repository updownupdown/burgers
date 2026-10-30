import * as THREE from "three";
import { buzz, Sfx } from "./audio";
import { pattyLabel } from "./game/cooking";
import { makeOrder, PINECREST_MENU, seededRng, type Rng } from "./game/menu";
import { payout, scorePlate } from "./game/scoring";
import type { DrinkId, Order, Piece, Plate, SauceKind } from "./game/types";
import { GRILLABLE, newPiece } from "./game/types";
import { makeCup, makeFood, makeFries } from "./render/food";
import { BIN_LAYOUT, CounterView, GRILL_SCALE, HOME_PAGE, PAGES, type GrillItem, type Hit } from "./scenes/counter";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import "./style.css";
import { buildUi, summaryHtml, ticketHtml } from "./ui";
import { buildLabel, reloadTo, startUpdateChecks, type VersionInfo } from "./update";

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

const SHIFT_LENGTH = 180;
const TOTAL_CUSTOMERS = 9;

interface Slot {
  order: Order | null;
  plate: Plate;
  patience: number;
  maxPatience: number;
  leaving: boolean;
  fig: CustomerFigure | null;
  ticketKey: string;
  bubble: HTMLElement | null;
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
  rng: seededRng(Date.now() % 100000) as Rng,
  slots: [0, 1, 2].map(
    (): Slot => ({ order: null, plate: emptyPlate(), patience: 0, maxPatience: 1, leaving: false, fig: null, ticketKey: "", bubble: null }),
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
  const tabsH = 64 + safeB;
  const custH = Math.round(THREE.MathUtils.clamp(H * 0.24, 150, 230));
  const trayH = Math.round(THREE.MathUtils.clamp(H * 0.18, 110, 180));
  bands.customers = { x: colX, y: 0, w, h: custH };
  bands.tray = { x: colX, y: custH, w, h: trayH };
  bands.counter = { x: colX, y: custH + trayH, w, h: H - custH - trayH - tabsH };
  bands.tabs = { x: colX, y: H - tabsH, w, h: tabsH };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
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
    t.style.left = `${i * slotW + slotW * 0.47}px`;
    t.style.width = `${slotW * 0.51}px`;
    t.style.top = `${custH * 0.2}px`;
    t.style.maxHeight = `${custH * 0.78}px`;
  });
  ui.hint.style.top = `${bands.counter.y + 8}px`;
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
  const level = game.time / SHIFT_LENGTH;
  let order = makeOrder(game.orderSeq++, game.rng, level);
  if (game.tutorial && game.spawned === 0) {
    const plain = PINECREST_MENU.find((r) => r.name === "Plain Jane")!;
    order = { id: order.id, name: plain.name, price: plain.price, layers: plain.layers.map((kind) => (kind === "patty" ? { kind, doneness: "medium" } : { kind, toasted: false })), fries: false, drink: null };
  }
  s.order = order;
  s.plate = emptyPlate();
  s.maxPatience = 50 + order.layers.length * 7 + (order.fries ? 12 : 0) + (order.drink ? 9 : 0);
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
  const { pay, tip } = payout(s.order, r.score, s.patience / s.maxPatience);
  game.money += pay;
  game.tips += tip;
  game.served++;
  game.stars.push(r.stars);
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
    if (p.cook[0] < 0.45 && p.cook[1] < 0.3) return "Let it sizzle until the bottom browns…";
    if (p.cook[1] < 0.4) return "Swipe up on the patty to flip it!";
    if (p.cook[0] < 0.42) return "Nearly there. Cook the other side too.";
    return "Medium! Drag the patty up onto the bun.";
  }
  if (layers[layers.length - 1].piece.kind !== "bun" || layers.length < 3) return "Add the top bun.";
  return "Ring the bell twice to serve!";
}

// ---------------------------------------------------------------------------
// Input

type Payload =
  | { type: "piece"; piece: Piece; fromGrill: { x: number; z: number } | null }
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
  x: number;
  y: number;
  band: ReturnType<typeof bandAt>;
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate";
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

function payloadVisual(p: Payload): THREE.Object3D {
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
  if (payload.type !== "piece") trayObj.scale.multiplyScalar(0.55);
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
  const band = bandAt(pt.y);
  const { vy } = velocity(pt);
  const dur = (pt.samples[pt.samples.length - 1]?.t ?? pt.t0) - pt.t0;
  const fast = pt.y0 - pt.y > 40 && (vy < -0.6 || dur < 350);
  let done = false;

  if (band === "tray" || band === "customers") {
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    done = addToPlate(slot >= 0 ? slot : game.active, payload, 0.08);
    if (done && slot >= 0) setActive(slot);
  } else if (band === "counter") {
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    if (payload.type === "piece") {
      const over = counter.overGrill(g);
      if (over && GRILLABLE.has(payload.piece.kind)) {
        counter.addGrillItem(payload.piece, over.x, over.z);
        if (!payload.fromGrill) sfx.sizzleHit();
        else sfx.thud();
        done = true;
      } else if (fast && !payload.fromGrill) {
        // Flicked up from a bin: toss it onto the active plate, a little less neatly.
        done = addToPlate(game.active, payload, 0.22);
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
  if (pt.drawSlot !== target || top.piece.kind !== kind || !top.piece.stroke) {
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
      if (pt.hit?.type === "grillItem" && (flickUp || !pt.moved)) {
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
      if (pt.hit?.type === "basket") {
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
      if (!pt.moved && pt.band === "counter") {
        armedSauce = armedSauce === pt.sauce ? null : pt.sauce;
        if (armedSauce) showHint(`Draw ${armedSauce} on a plate. Tap the bottle again to stop.`, 3);
      } else if (pt.band === "tray" && armedSauce) {
        // Keep the bottle armed for more drawing.
      }
      break;
    case "plate":
      if (pt.plate >= 0 && dy > 40 && Math.abs(dy) > Math.abs(dx)) removeTop(pt.plate);
      break;
  }
}
canvas.addEventListener("pointerup", (e) => endPointer(e, false));
canvas.addEventListener("pointercancel", (e) => endPointer(e, true));

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

ui.root.addEventListener("click", (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
  if (!act) return;
  sfx.unlock();
  switch (act) {
    case "start":
    case "restart":
      startShift();
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
      if (game.pendingUpdate) reloadTo(game.pendingUpdate.build);
      break;
    case "update-later":
      ui.update.hidden = true;
      break;
  }
});

ui.menuBtn.addEventListener("click", () => {
  if (game.phase === "playing") {
    game.phase = "paused";
    ui.menu.hidden = false;
  }
});

try {
  if (localStorage.getItem("bv-muted") === "1") sfx.setMuted(true);
} catch {
  // ignore
}

function startShift(): void {
  for (let i = 0; i < 3; i++) {
    const s = game.slots[i];
    if (s.fig) customersView.leave(i, () => {});
    s.bubble?.remove();
    Object.assign(s, { order: null, plate: emptyPlate(), fig: null, leaving: false, ticketKey: "", bubble: null });
    syncTray(i, false);
  }
  for (const g of [...counter.grillItems]) counter.removeGrillItem(g);
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
    tutorial: !game.hintsShown.has("tutorial-done"),
  });
  game.hintsShown.add("tutorial-done");
  counter.setPage(HOME_PAGE);
  ui.title.hidden = true;
  ui.menu.hidden = true;
  ui.summary.hidden = true;
}

function endShift(): void {
  game.phase = "summary";
  for (const s of game.slots) {
    s.bubble?.remove();
    s.bubble = null;
  }
  ui.summary.innerHTML = summaryHtml({
    served: game.served,
    lost: game.lost,
    stars: game.stars,
    earned: game.money,
    tips: game.tips,
    best: game.best?.name ?? null,
  });
  ui.summary.hidden = false;
  sfx.chime();
  if (game.pendingUpdate) reloadTo(game.pendingUpdate.build);
}

// ---------------------------------------------------------------------------
// Updates

const checkNow = startUpdateChecks((v) => {
  game.pendingUpdate = v;
  if (game.phase === "title" || game.phase === "summary") {
    ui.updateText.textContent = `Updating to build #${v.build}…`;
    ui.update.hidden = false;
    setTimeout(() => reloadTo(v.build), 1200);
  } else {
    ui.updateText.textContent = `Build #${v.build} is ready (you're on #${__BUILD__}).`;
    ui.update.hidden = false;
  }
});
console.info(`Bun Voyage ${buildLabel()}`);

// ---------------------------------------------------------------------------
// Main loop

function tick(dt: number): void {
  if (game.phase === "playing") {
    game.time += dt;
    // Customers arrive while the window is open.
    const free = game.slots.findIndex((s) => !s.order && !s.fig);
    const tutorialHold = game.tutorial && game.spawned >= 1;
    if (game.time < SHIFT_LENGTH && game.spawned < TOTAL_CUSTOMERS && free >= 0 && game.time >= game.nextSpawn && !tutorialHold) {
      spawnCustomer(free);
      const level = game.time / SHIFT_LENGTH;
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

    const doneSpawning = game.time >= SHIFT_LENGTH || game.spawned >= TOTAL_CUSTOMERS;
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
  else hintOnce("burning", "Smoke means burning. Get it off the grill!", 2.5);
};

let lastTimerText = "";
function updateUi(): void {
  const left = Math.max(0, SHIFT_LENGTH - game.time);
  const tText = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Closing";
  if (tText !== lastTimerText) {
    ui.timer.textContent = tText;
    ui.timer.classList.toggle("closing", left <= 0);
    lastTimerText = tText;
  }
  ui.money.textContent = `$${game.money + game.tips}`;

  game.slots.forEach((s, i) => {
    const t = ui.tickets[i];
    const show = !!s.order && !s.leaving && game.phase !== "title";
    t.hidden = !show;
    if (!show || !s.order) return;
    const pct = s.patience / s.maxPatience;
    const key = `${s.order.id}|${s.plate.layers.map((l) => l.piece.kind).join(",")}|${!!s.plate.fries}|${s.plate.drink?.flavor}|${Math.round(pct * 50)}`;
    if (key !== s.ticketKey) {
      t.innerHTML = ticketHtml(s.order, s.plate, game.tutorial && game.spawned === 1 && i === game.slots.findIndex((x) => x.order) ? 1 : pct);
      s.ticketKey = key;
    }
    t.classList.toggle("active", i === game.active);
  });
  trayView.setActive(
    game.active,
    game.slots.map((s) => !!s.order),
  );

  ui.tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === counter.page)));
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
  if (text) ui.hint.textContent = text;
  ui.hint.hidden = !text || game.phase !== "playing";
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
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && game.phase === "playing") {
    game.phase = "paused";
    ui.menu.hidden = false;
  }
});

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
  bins: BIN_LAYOUT,
  manual: (on: boolean) => {
    manualClock = on;
  },
};

