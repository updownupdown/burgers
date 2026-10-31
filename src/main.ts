import * as THREE from "three";
import { buzz, Sfx } from "./audio";
import { avgCook, bunToast, FRIES_PERFECT, friesZone, FRIES_ZONE, MELT_RATE, pattyLabel } from "./game/cooking";
import { makeOrder, orderFromRecipe, seededRng, type Rng } from "./game/menu";
import { freshSave, loadSave, passed, passTown, upgradeChoices, UPGRADES, writeSave, type UpgradeId } from "./game/progress";
import { eventOn, townById, withEvent, type TownEvent } from "./game/stops";
import { criticChance, fadePopularity, pieceFor, popularityTraffic, willingnessToPay, type PressPiece } from "./game/press";
import { DIFFICULTY, verdict, type Difficulty } from "./game/difficulty";
import { HOLD_GRACE, HOLD_RUIN, payout, scorePlate, starsFor } from "./game/scoring";
import {
  CARTON_COST,
  CROWD,
  CUP_COST,
  EXTRA_COST,
  FRIES_BATCH_COST,
  FRY_TOP_COST,
  KIND_COST,
  menuOf,
  nextReputation,
  planFor,
  PRICE,
  QUALITY,
  ratingBonus,
  reviewFor,
  SODA_COST,
  trafficMult,
  type Plan,
  type Review,
} from "./game/business";
import type { DrinkId, FriesSize, Layer, Order, Piece, Plate, SauceKind, Size } from "./game/types";
import { COUNTED, FRIES_PORTION, FRIES_SCOOP, GRILLABLE, KIND_LABEL, newPiece } from "./game/types";
import { dressCup } from "./render/cup";
import { makeCarton, makeCup, makeFood, makeFries, sliceSpot, stackBases } from "./render/food";
import { disposeObject } from "./render/materials";
import { CounterView, EMPTY_PACK, GRILL_SCALE, HOME_PAGE, PAGES, pageX, GRILL_TOP, SLEEVE, WARM_X0, type GrillItem, type Hit } from "./scenes/counter";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import "./ui/components.css";
import "./style.css";
import { mountHome } from "./screens/home";
import { buildUi, donenessPill, patienceMood, planHtml, summaryHtml, ticketHtml } from "./ui";
import { buildLabel, registerServiceWorker, reloadTo, startUpdateChecks, type VersionInfo } from "./update";
import { closeAll, initMenu, openHowTo, openMenu, openMenuRef } from "./screens/menu";

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

/**
 * Graphics tiers change only cost, never the look: high = soft shadows, standard = hard
 * shadows, low = no shadows and a 1x pixel ratio for slower phones.
 */
type Gfx = "high" | "standard" | "low";
let gfx: Gfx = "high";
try {
  const saved = localStorage.getItem("bv-gfx");
  if (saved === "high" || saved === "standard" || saved === "low") gfx = saved;
} catch {
  // ignore
}
/** Chill, Balanced or Stressful (src/game/difficulty.ts); takes effect for new customers. */
let difficulty: Difficulty = "balanced";
try {
  const saved = localStorage.getItem("bv-difficulty");
  if (saved && saved in DIFFICULTY) difficulty = saved as Difficulty;
} catch {
  // ignore
}
function applyGfx(level: Gfx): void {
  gfx = level;
  renderer.shadowMap.enabled = level !== "low";
  for (const sun of [counter.sun, trayView.sun]) {
    sun.castShadow = level !== "low";
    sun.shadow.radius = level === "high" ? 5 : 1;
  }
  renderer.shadowMap.needsUpdate = true;
}
const ui = buildUi(document.getElementById("ui")!, PAGES);

const save = loadSave();
/** The town being played, as it is today (an event makes it busier and changes the crowd). */
const stop = () => withEvent(townById(game.town), game.event);
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
  /** The order came back once, with this complaint; next time they take it unless it's really wrong. */
  sentBack: string | null;
  /** Free sides they kept when they sent the order back: a customer never turns down free food. */
  kept: Pick<Plate, "fries" | "drink">;
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
  town: save.town,
  /** Town highlighted on the map. */
  mapSel: save.town,
  /** Event on in this town today, during a shift. */
  event: null as TownEvent | null,
  rng: seededRng(Date.now() % 100000) as Rng,
  slots: [0, 1, 2].map(
    (): Slot => ({ order: null, plate: emptyPlate(), patience: 0, maxPatience: 1, leaving: false, fig: null, ticketKey: "", bubble: null, expanded: false, sentBack: null, kept: { fries: null, drink: null } }),
  ),
  hintsShown: new Set<string>(),
  pendingUpdate: null as VersionInfo | null,
  /** Customers expected this shift (business mode changes it). */
  customers: 0,
  /** Business mode: today's plan, ingredient spend and the reviews written so far. */
  plan: null as Plan | null,
  costs: 0,
  reviews: [] as Review[],
  /** Every rating this shift, walk-outs as zero, for reputation. */
  ratings: [] as number[],
  /** Which customer (by arrival order) is a food critic today, or -1; and what they wrote. */
  criticAt: -1,
  press: null as PressPiece | null,
};

/** A critic's verdict counts like this many ordinary reviews. */
const CRITIC_WEIGHT = 5;

function criticVerdict(stars: number, notes: string[]): void {
  game.press = pieceFor(stars, notes, stop(), game.event, game.rng);
  if (game.plan) for (let k = 1; k < CRITIC_WEIGHT; k++) game.ratings.push(stars);
}

/** In business mode, ingredients cost money as they come out of the bins. */
function spend(amount: number): void {
  if (game.plan) game.costs += amount * QUALITY[game.plan.quality].cost;
}

/** The stop as the customers see it: just today's menu in business mode. */
function shopStop() {
  const st = stop();
  return game.plan ? { ...st, menu: menuOf(st, game.plan) } : st;
}

function plannedCustomers(plan: Plan): number {
  return Math.max(4, Math.round(stop().customers * trafficMult(plan, save.rep, menuOf(stop(), plan).length, stop().crowd) * popularityTraffic(save.popularity)));
}

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
/** Where the order rail sits in the customers band (CSS px from the top). */
let railTop = 100;
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
  // The customers band holds the window (HUD on top, customers, then the order rail) and the
  // receipts hanging from the rail; it's taller than the tray so the receipts have room.
  const custH = Math.round(THREE.MathUtils.clamp(H * 0.34, 200, 320));
  const trayH = Math.round(THREE.MathUtils.clamp(H * 0.14, 96, 140));
  const hudH = safeT + 42;
  const railY = Math.round(hudH + (custH - hudH) * 0.42);
  bands.customers = { x: colX, y: 0, w, h: custH };
  bands.tray = { x: colX, y: custH, w, h: trayH };
  bands.counter = { x: colX, y: custH + trayH, w, h: H - custH - trayH - tabsH };
  bands.tabs = { x: colX, y: H - tabsH, w, h: tabsH };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfx === "low" ? 1 : 1.5));
  renderer.setSize(W, H, false);
  // Size the canvas box to the visible viewport (not 100vh, which mobile browsers measure
  // with their toolbars hidden), so taps line up with what's drawn.
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  customersView.layout(w / custH, hudH / custH, railY / custH);
  trayView.layout(w / trayH);
  counter.layout(w / bands.counter.h);

  const st = document.documentElement.style;
  st.setProperty("--gx", `${colX}px`);
  st.setProperty("--gw", `${w}px`);
  st.setProperty("--gh", `${H}px`);

  // Receipts hang from the rail, one under each customer.
  const slotW = w / 3;
  ui.rail.style.top = `${railY - 4}px`;
  railTop = railY;
  ui.tickets.forEach((t, i) => {
    const tw = Math.min(slotW * 0.88, 170);
    t.style.left = `${slotW * i + (slotW - tw) / 2}px`;
    t.style.width = `${tw}px`;
    t.style.top = `${railY}px`;
    // Long receipts may hang over the back of the tray, down to just above the plates' rims
    // (allowing for the active receipt's 5% lift), so the plates stay clear to tap and swipe.
    const rimY = bands.tray.y + trayView.rimTop() * trayH;
    t.style.maxHeight = `${Math.max(custH - railY + trayH * 0.1, (rimY - 6 - railY) / 1.05)}px`;
  });
  ui.tickets.forEach((t) => (t.dataset.fit = ""));
  ui.hint.style.top = `${bands.counter.y + 8}px`;
  // Turned sideways mid-shift: pause behind the "turn your phone" overlay.
  if (W > H && H < 500 && game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    openMenu();
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

/** Pointer x is already relative to the game column (see pointerdown), so only y is offset by the band. */
function ndcIn(r: Rect, x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2((x / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1);
}

// ---------------------------------------------------------------------------
// Orders and customers

function spawnCustomer(slotIdx: number): void {
  const s = game.slots[slotIdx];
  const level = game.time / stop().shiftLength;
  let order = makeOrder(game.orderSeq++, game.rng, level, shopStop());
  if (game.plan) order.price = Math.round(order.price * PRICE[game.plan.price].mult);
  // The very first order of the trip is the simplest burger, with no sides.
  if (game.tutorial && game.spawned === 0) order = orderFromRecipe(order.id, stop().menu[0], "medium", false, null);
  s.order = order;
  s.plate = emptyPlate();
  s.sentBack = null;
  s.kept = { fries: null, drink: null };
  // Recipes you haven't made a couple of times yet start with the full layer list showing.
  s.expanded = game.tutorial || (save.known[order.name] ?? 0) < 2;
  // Every extra slice of a counted topping is another trip to the bin.
  const slices = order.layers.reduce((n, l) => n + Math.max(0, (l.count ?? 1) - 1), 0);
  s.maxPatience = (50 + order.layers.length * 7 + slices * 2 + order.layers.filter((l) => l.kind === "patty").length * 22 + (order.fries ? 30 : 0) + (order.poutine ? 10 : 0) + (order.drink ? 9 : 0)) * (has("bench") ? 1.25 : 1) * CROWD[stop().crowd].patience * DIFFICULTY[difficulty].patience;
  if (game.tutorial && game.spawned === 0) s.maxPatience = 600;
  s.patience = s.maxPatience;
  s.leaving = false;
  if (game.spawned === game.criticAt && !game.tutorial) {
    order.critic = true;
    showHint("A food critic just ordered. Their verdict goes in the papers!", 3.5);
  }
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

/**
 * Hand a plate to its customer (swipe it up). They look it over: a good plate is taken and
 * paid for; a clearly wrong one comes back once for changes; a really wrong one is refused.
 * Free sides they didn't order are always kept.
 */
function serve(i: number): void {
  const s = game.slots[i];
  if (!s.order || s.leaving) {
    showHint("No one's waiting for that plate yet.", 1.5);
    return;
  }
  if (s.plate.layers.length === 0 && !s.plate.fries && !s.plate.drink) {
    showHint("That plate is empty!", 1.5);
    return;
  }
  // Freebies kept from an earlier send-back count towards this verdict too.
  const plate: Plate = { ...s.plate, fries: s.plate.fries ?? s.kept.fries, drink: s.plate.drink ?? s.kept.drink };
  const r = scorePlate(s.order, plate);
  if (game.plan) {
    // Ingredient quality and prices tilt every rating.
    r.score = Math.max(0, Math.min(100, r.score + ratingBonus(game.plan, stop().crowd, willingnessToPay(save.popularity, save.rep))));
    r.stars = starsFor(r.score);
  }
  const call = game.tutorial ? "accept" : verdict(r.score, difficulty, !!s.sentBack, r.faulty);
  if (call === "sendBack") return sendBack(i, r.notes[0] ?? "this isn't quite right");
  if (call === "refuse") return refuse(i, r.notes[0] ?? "this isn't what I ordered", r.perks.length > 0);
  if (game.plan) {
    game.ratings.push(r.stars);
    const perk = r.perks.length && r.stars < 3 ? ` Loved the ${r.perks[0]}.` : "";
    const back = s.sentBack ? " Had to send it back once." : "";
    game.reviews.push({ stars: r.stars, text: reviewFor(r.stars, r.notes, game.plan, game.rng) + perk + back, stop: stop().name });
  }
  if (s.order.critic) criticVerdict(r.stars, r.notes);
  const { pay, tip: baseTip } = payout(s.order, r.score, s.patience / s.maxPatience);
  const tip = Math.round(baseTip * (has("tipjar") ? 1.3 : 1) * CROWD[stop().crowd].tips);
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
      : r.perks.length
        ? `Thanks for the ${r.perks[0]}!`
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

/** Unordered sides on the plate: the customer keeps them whatever happens to the order. */
function takeFreebies(s: Slot): string | null {
  const o = s.order!;
  let took: string | null = null;
  if (s.plate.fries && !o.fries) {
    s.kept.fries = s.plate.fries;
    s.plate.fries = null;
    took = s.kept.fries.curds ? "poutine" : "fries";
  }
  if (s.plate.drink && !o.drink) {
    s.kept.drink = s.plate.drink;
    s.plate.drink = null;
    took = took ? "extras" : "drink";
  }
  return took;
}

/** The order comes back with a request; the plate stays as it is for you to fix. */
function sendBack(i: number, note: string): void {
  const s = game.slots[i];
  s.sentBack = note;
  const took = takeFreebies(s);
  // Asking for a fix buys a little time.
  s.patience = Math.min(s.maxPatience, s.patience + s.maxPatience * 0.2);
  s.ticketKey = "";
  syncTray(i, true);
  trayView.plates[i].kick(0.5);
  s.fig?.setMood("sad");
  showBubble(i, `Can you fix it? ${capitalise(note)}.${took ? ` I'll keep the ${took}!` : ""}`, false);
  sfx.grumble();
  buzz([30, 40, 30]);
  hintOnce("sent-back", "Sent back: fix the plate and swipe it up again. Drag the burger down to a prep spot to take layers off.", 4);
}

/** Really wrong: they won't take it and leave without paying (but keep any freebies). */
function refuse(i: number, note: string, perk: boolean): void {
  const s = game.slots[i];
  const took = takeFreebies(s) ?? (s.kept.fries || s.kept.drink ? "freebie" : null);
  const stars = took || perk ? 1 : 0;
  game.lost++;
  if (s.order!.critic) criticVerdict(0, [note]);
  if (game.plan) {
    game.ratings.push(stars);
    game.reviews.push({ stars, text: `Refused it: ${note}.${took ? ` At least the ${took === "freebie" ? "free side" : took} was nice.` : ""}`, stop: stop().name });
  }
  sfx.grumble();
  buzz(80);
  customerLeaves(i, "angry", `No thanks. ${capitalise(note)}.${took ? ` I'll take the ${took === "freebie" ? "free side" : took} though.` : ""}`, false);
  s.plate = emptyPlate();
  syncTray(i, false);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function showBubble(i: number, text: string, good: boolean): void {
  const s = game.slots[i];
  s.bubble?.remove();
  const b = document.createElement("div");
  b.className = `bubble ${good ? "good" : "bad"}`;
  b.textContent = text;
  const slotW = bands.customers.w / 3;
  b.style.left = `${Math.max(70, Math.min(bands.customers.w - 70, i * slotW + slotW * 0.5))}px`;
  // Above the customer's head, clear of the receipts on the rail.
  b.style.top = `${railTop * 0.55}px`;
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
  if (counter.page !== HOME_PAGE) return "Tap Grill in the bar below to go back.";
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
  return "Swipe the plate up to hand it to the customer!";
}

// ---------------------------------------------------------------------------
// Input

type Payload =
  | { type: "piece"; piece: Piece; fromGrill: { x: number; z: number } | null; fromHold?: number }
  | { type: "stack"; layers: Layer[]; from: number; grill?: { x: number; z: number }; fromPlate?: number }
  | { type: "fries"; cook: number; basket: number | null; amount: number }
  | { type: "carton"; size: FriesSize; cook: number; fill: number; pack: number; salt: boolean; curds: boolean; gravy: boolean }
  | { type: "salt" }
  | { type: "curds" }
  | { type: "gravy" }
  | { type: "drink"; flavor: DrinkId; fill: number; tap: number; size: Size; ice: boolean; lid: boolean; straw: boolean }
  | { type: "ice" }
  | { type: "lid" }
  | { type: "straw" }
  | { type: "empty"; kind: "cup" | "carton"; size: Size; stack: number }
  | { type: "sleeve"; kind: "cup" | "carton" };

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
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate" | "hold" | "wipe";
  /** Tap whose spill is being wiped. */
  wipe: number;
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
  const { bases } = stackBases(layers.map((l) => l.piece));
  layers.forEach((l, i) => {
    const o = makeFood(l.piece, i === 0 ? "bottom" : "top");
    o.position.set(l.offX, bases[i], l.offZ);
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
    // Straight from the freezer or the basket: loose fries, no carton yet.
    const f = makeFries(false, "L", p.amount);
    f.userData.setCook(p.cook);
    f.scale.setScalar(1.3);
    return f;
  }
  if (p.type === "salt" || p.type === "curds" || p.type === "gravy") return counter.fryTopMesh(p.type);
  if (p.type === "carton") {
    const f = makeFries(true, p.size, p.fill, p);
    f.userData.setCook(p.cook);
    f.scale.setScalar(1.2 * f.userData.sizeScale);
    return f;
  }
  if (p.type === "empty") {
    const o = p.kind === "cup" ? makeCup(null, false, p.size) : makeCarton(p.size as FriesSize);
    o.scale.multiplyScalar(p.kind === "cup" ? 0.9 : 1.2);
    return o;
  }
  if (p.type === "sleeve") return counter.sleeveMesh(p.kind);
  if (p.type === "ice" || p.type === "lid" || p.type === "straw") return counter.extraMesh(p.type);
  const c = makeCup(p.flavor, p.lid, p.size);
  c.userData.setFill(p.fill);
  dressCup(c, p);
  return c;
}

function startHold(pt: Pointer, payload: Payload): void {
  const counterObj = payloadVisual(payload);
  const trayObj = payloadVisual(payload);
  if (payload.type !== "piece" && payload.type !== "stack") trayObj.scale.multiplyScalar(0.55);
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
    counter.highlightTrash(false);
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    trayView.showGhost(slot >= 0 ? slot : game.active, pt.held.trayObj);
  } else {
    trayView.showGhost(-1, null);
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    counter.moveHeld(g, true);
    counter.highlightTrash(band === "counter" && counter.overTrash(g));
  }
}

/** Carrying something over a tab for a moment switches to that counter, so items can move between counters. */
let hover = { tab: -1, since: 0 };
function hoverTab(pt: Pointer, now: number): void {
  if (bandAt(pt.y) !== "tabs") {
    hover.tab = -1;
    return;
  }
  const cx = pt.x + colX;
  const tab = ui.tabs.findIndex((t) => {
    const r = t.getBoundingClientRect();
    return cx >= r.left && cx <= r.right;
  });
  if (tab !== hover.tab) hover = { tab, since: now };
  else if (tab >= 0 && tab !== counter.page && now - hover.since > 280) goToPage(tab);
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

/** Where a new piece lands on a stack: counted toppings go round the burger one by one, the rest roughly centred. */
function landing(layers: Layer[], piece: Piece, spread: number): Layer {
  const jitter = () => (Math.random() - 0.5) * spread;
  if (!COUNTED.has(piece.kind)) return { piece, offX: jitter(), offZ: jitter() };
  let k = 0;
  for (let i = layers.length - 1; i >= 0 && layers[i].piece.kind === piece.kind; i--) k++;
  const [x, z] = sliceSpot(piece.kind, k);
  return { piece, offX: x + jitter() * 0.4, offZ: z + jitter() * 0.4 };
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
    const l = landing(s.plate.layers, p, spread);
    s.plate.layers.push(l);
    syncTray(slot, true);
    trayView.plates[slot].kick(COUNTED.has(p.kind) ? 0.05 : spread * 4);
    if (s.order && COUNTED.has(p.kind)) {
      // Count them on: "Pickles 2 of 3".
      let n = 0;
      for (let i = s.plate.layers.length - 1; i >= 0 && s.plate.layers[i].piece.kind === p.kind; i--) n++;
      const want = s.order.layers.find((e) => e.kind === p.kind)?.count;
      if (want) showHint(`${KIND_LABEL[p.kind]} ${n} of ${want}${n > want ? ": generous!" : ""}`, 1.2);
    } else if (s.order) {
      const exp = s.order.layers[s.plate.layers.length - 1];
      if (exp && exp.kind === "patty" && p.kind === "patty") showHint(`Patty: ${pattyLabel((p.cook[0] + p.cook[1]) / 2)}`, 1.5);
    }
    return true;
  }
  if (payload.type === "fries") {
    showHint("Fries go in a carton first. Grab one from the stacks behind the fryer.", 2.5);
    return false;
  }
  if (payload.type === "empty" || payload.type === "sleeve") {
    showHint(payload.type === "sleeve" ? "Unwrap that at the stack first." : "Fill it first!", 1.5);
    return false;
  }
  if (payload.type === "ice" || payload.type === "lid" || payload.type === "straw") {
    showHint(`That goes on a cup at the drinks counter.`, 1.5);
    return false;
  }
  if (payload.type === "salt" || payload.type === "curds" || payload.type === "gravy") {
    if (!s.plate.fries) {
      showHint("That goes on fries.", 1.5);
      return false;
    }
    if (!topFries(s.plate.fries, payload.type)) return false;
    syncTray(slot, false);
    return true;
  }
  if (payload.type === "carton") {
    if (s.plate.fries) {
      showHint("This plate already has fries.", 2);
      return false;
    }
    const { cook, size, fill, salt, curds, gravy } = payload;
    s.plate.fries = { cook, size, fill, salt, curds, gravy };
  } else {
    if (s.plate.drink) {
      showHint("This plate already has a drink.", 2);
      return false;
    }
    s.plate.drink = { flavor: payload.flavor, fill: payload.fill, size: payload.size, ice: payload.ice, lid: payload.lid, straw: payload.straw };
    if (!payload.lid) hintOnce("lid", "Drinks need a lid and a straw before they go out.", 3);
  }
  syncTray(slot, false);
  sfx.plop();
  return true;
}

function finishHold(pt: Pointer): void {
  const held = pt.held!;
  const payload = held.payload;
  counter.setHeld(null);
  counter.highlightTrash(false);
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
    const station = payload.type === "empty" || payload.type === "sleeve" || payload.type === "carton" || payload.type === "drink" || payload.type === "ice" || payload.type === "lid" || payload.type === "straw" || payload.type === "salt" || payload.type === "curds" || payload.type === "gravy" || (payload.type === "fries" && payload.basket !== null);
    if (station) done = dropAtStation(payload, g);
    if (!done && counter.overTrash(g)) {
      // Every counter has a trash slot along its front edge.
      sfx.thud();
      buzz(20);
      done = true;
    } else if (station) {
      // Missed the station: it goes back where it came from below.
    } else if (hold >= 0 && (payload.type === "piece" || payload.type === "stack")) {
      // Build a burger ahead (or park food) under the heat lamp.
      const spot = counter.holds[hold];
      const add = payload.type === "piece" ? [landing(spot.layers, payload.piece, 0.06)] : payload.layers;
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
      const [base, top] = payload.layers.map((l) => l.piece);
      const fits = payload.layers.length === 1 || (payload.layers.length === 2 && base.kind === "patty" && top.kind === "cheese");
      if (over && fits && GRILLABLE.has(base.kind)) {
        counter.addGrillItem(base, over.x, over.z, top);
        sfx.sizzleHit();
        done = true;
      }
    } else if (payload.type === "piece") {
      const over = counter.overGrill(g);
      const under = over && payload.piece.kind === "cheese" ? counter.grillItemAt(g) : null;
      if (under && counter.addTopping(under, payload.piece)) {
        sfx.plop();
        hintOnce("melt", "The cheese melts on the hot patty. Drag them up together when it slumps.", 3.5);
        done = true;
      } else if (over && payload.piece.kind === "cheese") {
        showHint(under?.topping ? "That patty already has cheese." : "Drop the cheese right on a patty to melt it.", 2);
      } else if (over && GRILLABLE.has(payload.piece.kind)) {
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
        if (b.loaded && b.amount > 1 - FRIES_SCOOP / 2) showHint("That basket is full.", 1.5);
        else {
          // Each scoop is one small carton's worth; raw fries added later pull the batch's cook back.
          spend(FRIES_BATCH_COST * payload.amount);
          const had = b.loaded ? b.amount : 0;
          b.cook = had ? (b.cook * had) / (had + payload.amount) : 0;
          b.amount = Math.min(1, had + payload.amount);
          if (!b.loaded) Object.assign(b, { loaded: true, down: false, goldenRung: false });
          if (b.down) sfx.sizzleHit();
          else sfx.plop();
          done = true;
          hintOnce("fries-scoop", "One scoop fills a small carton, two a medium, three a large. Tap the basket to lower it.", 4);
        }
      }
    }
  }

  if (!done) {
    // Put things back where they came from.
    if (payload.type === "piece" && payload.fromGrill) counter.addGrillItem(payload.piece, payload.fromGrill.x, payload.fromGrill.z);
    if (payload.type === "piece" && payload.fromHold !== undefined) {
      counter.holds[payload.fromHold].layers.push({ piece: payload.piece, offX: 0, offZ: 0 });
      counter.syncHold(payload.fromHold, false);
    }
    if (payload.type === "stack" && payload.grill) {
      const [base, top] = payload.layers.map((l) => l.piece);
      counter.addGrillItem(base, payload.grill.x, payload.grill.z, top);
    } else if (payload.type === "stack" && payload.fromPlate !== undefined) {
      game.slots[payload.fromPlate].plate.layers.push(...payload.layers);
      syncTray(payload.fromPlate, false);
    } else if (payload.type === "stack" && payload.from >= 0) {
      counter.holds[payload.from].layers.push(...payload.layers);
      counter.syncHold(payload.from, false);
    }
    if (payload.type === "fries" && payload.basket !== null) {
      const b = counter.baskets[payload.basket];
      Object.assign(b, { loaded: true, cook: payload.cook, amount: payload.amount });
    }
    if (payload.type === "drink") {
      counter.placeCup(payload.tap, payload.size);
      counter.taps[payload.tap].fill = payload.fill;
      for (const k of ["ice", "lid", "straw"] as const) if (payload[k]) counter.dressTap(payload.tap, k);
      spend(-payload.fill * SODA_COST[payload.size]);
    }
    if (payload.type === "carton") {
      const { size, cook, fill, salt, curds, gravy } = payload;
      Object.assign(counter.packs[payload.pack], { size, cook, fill, salt, curds, gravy });
      counter.syncPack(payload.pack);
    }
    if (payload.type === "empty") {
      counter.stacks[payload.stack].count++;
      counter.syncStack(counter.stacks[payload.stack]);
    }
  }
}

/** Salt, curds or gravy onto fries in a carton (on a pad or a plate). False if it's already on. */
function topFries(f: { salt?: boolean; curds?: boolean; gravy?: boolean }, what: "salt" | "curds" | "gravy"): boolean {
  if (f[what]) {
    showHint(what === "salt" ? "Already salted." : what === "curds" ? "It's got curds." : "It's got gravy.", 1.2);
    return false;
  }
  f[what] = true;
  spend(FRY_TOP_COST[what]);
  if (what === "salt") sfx.whoosh();
  else sfx.plop();
  if (what === "gravy" && !f.curds) hintOnce("curds-first", "Curds go under the gravy so they soften just right.", 3);
  return true;
}

/** Drinks and fryer stations: cups under nozzles, cartons on packing spots, sleeves on empty stacks. */
function dropAtStation(payload: Payload, g: THREE.Vector3): boolean {
  if (payload.type === "salt" || payload.type === "curds" || payload.type === "gravy") {
    const pi = counter.friedPackAt(g);
    if (pi < 0) {
      if (counter.overPack(g) >= 0) showHint("Fill the carton with fries first.", 1.5);
      return false;
    }
    return topFries(counter.packs[pi], payload.type) && (counter.syncPack(pi), true);
  }
  if (payload.type === "ice" || payload.type === "lid" || payload.type === "straw") {
    const ti = counter.overTap(g);
    const t = counter.taps[ti];
    if (!t) return false;
    // Ice first, then pour, then the lid, then the straw through it.
    const problem = !t.cup
      ? "Put a cup under the nozzle first."
      : t[payload.type]
        ? `It already has ${payload.type === "ice" ? "ice" : `a ${payload.type}`}.`
        : payload.type === "ice" && t.lid
          ? "Ice goes in before the lid."
          : payload.type === "lid" && t.fill < 0.05
            ? "Pour the drink first."
            : payload.type === "straw" && !t.lid
              ? "Lid first, then the straw."
              : "";
    if (problem) {
      showHint(problem, 1.8);
      return false;
    }
    counter.dressTap(ti, payload.type);
    spend(EXTRA_COST[payload.type]);
    sfx.plop();
    if (payload.type === "lid") hintOnce("straw", "Now a straw through the lid.", 2.5);
    return true;
  }
  if (payload.type === "empty" && payload.kind === "cup") {
    const ti = counter.overTap(g);
    const t = counter.taps[ti];
    if (!t) return false;
    if (t.cup) showHint("There's already a cup there.", 1.5);
    else if (t.puddle > 0.05) showHint("Wipe up the spill first: scrub it with your finger.", 2.5);
    else {
      counter.placeCup(ti, payload.size);
      spend(CUP_COST[payload.size]);
      sfx.plop();
      hintOnce("pour", "Hold the button above the cup. Let go before it overflows!", 3);
      return true;
    }
    return false;
  }
  if (payload.type === "empty") {
    const pi = counter.overPack(g);
    const p = counter.packs[pi];
    if (!p) return false;
    if (p.size) {
      showHint("There's already a carton there.", 1.5);
      return false;
    }
    Object.assign(p, { size: payload.size as FriesSize, cook: 0, fill: 0 });
    spend(CARTON_COST[payload.size as FriesSize]);
    counter.syncPack(pi);
    sfx.plop();
    hintOnce("pack", "Drag the fries from the basket into the carton.", 3);
    return true;
  }
  if (payload.type === "sleeve") {
    const si = counter.overStack(g);
    const s = counter.stacks[si];
    if (!s) return false;
    if (s.kind !== payload.kind) showHint(payload.kind === "cup" ? "Those are cups." : "Those are cartons.", 1.5);
    else if (s.count > 0 || s.sleeve) showHint("Use up the ones that are there first.", 1.5);
    else {
      Object.assign(s, { sleeve: true, tear: 0 });
      counter.syncStack(s);
      sfx.plop();
      hintOnce("unwrap", "Tap the sleeve to tear off the wrapper.", 2.5);
      return true;
    }
    return false;
  }
  if (payload.type === "fries" && payload.basket !== null) {
    const pi = counter.overPack(g);
    const p = counter.packs[pi];
    if (!p) return false;
    if (!p.size) {
      showHint("Put a carton there first.", 1.5);
      return false;
    }
    const portion = FRIES_PORTION[p.size as FriesSize];
    const room = (1 - p.fill) * portion;
    if (room < 0.01) {
      showHint("That carton's full.", 1.5);
      return false;
    }
    const moved = Math.min(room, payload.amount);
    p.cook = (p.cook * p.fill * portion + payload.cook * moved) / (p.fill * portion + moved);
    p.fill = Math.min(1, p.fill + moved / portion);
    counter.syncPack(pi);
    sfx.plop();
    // Whatever didn't fit stays in the basket for the next carton.
    const left = payload.amount - moved;
    if (left > 0.02) Object.assign(counter.baskets[payload.basket], { loaded: true, cook: payload.cook, amount: left, down: false });
    if (p.fill < 0.95) hintOnce("skimpy", "Not quite full. Top it up with another batch, or customers call it skimpy.", 3);
    return true;
  }
  return false;
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
    wipe: -1,
  };
  ptr = pt;
  if (x < 0 || x > bands.counter.w) return;

  if (pt.band === "counter") {
    const hit = counter.hit(ndcIn(bands.counter, x, y));
    pt.hit = hit;
    if (!hit) pt.mode = "swipe";
    else if (hit.type === "bin") {
      spend(KIND_COST[hit.kind]);
      startHold(pt, { type: "piece", piece: newPiece(hit.kind), fromGrill: null });
    }
    else if (hit.type === "grillItem") pt.mode = "grill";
    else if (hit.type === "hold") pt.mode = "hold";
    else if (hit.type === "bottle") {
      pt.mode = "sauce";
      pt.sauce = hit.sauce;
      counter.liftBottle(hit.sauce, counter.groundPoint(ndcIn(bands.counter, x, y), 0.3));
    } else if (hit.type === "friesBin") startHold(pt, { type: "fries", cook: 0, basket: null, amount: FRIES_SCOOP });
    else if (hit.type === "stack") {
      const s = counter.stacks[hit.idx];
      const what = s.kind === "cup" ? "cups" : "cartons";
      if (s.sleeve) {
        s.tear++;
        sfx.whoosh();
        if (s.tear >= 2) Object.assign(s, { sleeve: false, tear: 0, count: SLEEVE });
        counter.syncStack(s);
      } else if (s.count > 0) {
        s.count--;
        counter.syncStack(s);
        startHold(pt, { type: "empty", kind: s.kind, size: s.size, stack: hit.idx });
      } else showHint(`Out of ${what}! Fetch a wrapped sleeve from the Supplies counter.`, 3);
    } else if (hit.type === "ice") startHold(pt, { type: "ice" });
    else if (hit.type === "lids") startHold(pt, { type: "lid" });
    else if (hit.type === "straws") startHold(pt, { type: "straw" });
    else if (hit.type === "supplies") {
      startHold(pt, { type: "sleeve", kind: hit.kind });
      hintOnce("carry", `Hold the sleeve over the ${hit.kind === "cup" ? "Drinks" : "Fryer"} tab to carry it there, then drop it on an empty stack.`, 3.5);
    }
    else if (hit.type === "pack") {
      const p = counter.packs[hit.idx];
      if (p.size && p.fill > 0) {
        startHold(pt, { type: "carton", size: p.size, cook: p.cook, fill: p.fill, pack: hit.idx, salt: p.salt, curds: p.curds, gravy: p.gravy });
        Object.assign(p, EMPTY_PACK);
        counter.syncPack(hit.idx);
      } else showHint(p.size ? "Drag fries from the basket into the carton." : "Grab a carton from the stacks behind the fryer.", 2);
    }
    else if (hit.type === "basket") pt.mode = "basket";
    else if (hit.type === "shaker" || hit.type === "curds" || hit.type === "gravy") {
      startHold(pt, { type: hit.type === "shaker" ? "salt" : hit.type });
      hintOnce(`fry-${hit.type}`, hit.type === "shaker" ? "Shake salt over fries in a carton, on the pad or on the plate." : hit.type === "curds" ? "Poutine: fries, then cheese curds, then gravy on top." : "Ladle gravy over the curds to finish a poutine.", 3);
    }
    else if (hit.type === "tap") {
      const t = counter.taps[hit.idx];
      if (!t.cup) showHint("Put a cup under the nozzle first. Cups are in the stacks below.", 2.5);
      else if (t.lid) showHint("The lid's on.", 1.5);
      else {
        pt.mode = "pour";
        t.pouring = true;
      }
    } else if (hit.type === "cup") {
      const t = counter.taps[hit.idx];
      if (t.cup && t.fill > 0.05) {
        startHold(pt, { type: "drink", flavor: t.flavor, fill: t.fill, tap: hit.idx, size: t.size!, ice: t.ice, lid: t.lid, straw: t.straw });
        spend(t.fill * SODA_COST[t.size!]);
        counter.removeCup(hit.idx);
      } else if (!t.cup && t.puddle > 0.01) {
        pt.mode = "wipe";
        pt.wipe = hit.idx;
      } else showHint(t.cup ? "Hold the button above the cup to pour." : "Grab a cup from the stacks below.", 2);
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
  const [lastX, lastY] = [pt.x, pt.y];
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
      // Sideways swipes on the counter are free for station actions; counters change from the tab bar.
      break;
    case "held":
      moveHold(pt);
      hoverTab(pt, e.timeStamp);
      break;
    case "wipe": {
      // Scrub back and forth to mop up an overflow.
      const t = counter.taps[pt.wipe];
      const before = t.puddle;
      t.puddle = Math.max(0, t.puddle - Math.hypot(pt.x - lastX, pt.y - lastY) / 420);
      if (before > 0 && t.puddle === 0) {
        sfx.pop();
        showHint("All clean.", 1.2);
      }
      break;
    }
    case "grill":
      // Turn into a drag once the finger travels sideways or down, reaches the tray, or lingers.
      // A quick upward flick that stays on the counter is a flip, decided on release.
      if (pt.moved && pt.hit?.type === "grillItem" && (now - pt.t0 > 400 || Math.abs(dx) > Math.abs(dy) || dy > 0 || bandAt(pt.y) !== "counter")) {
        const item: GrillItem = pt.hit.item;
        if (item.flipT < 0) {
          counter.removeGrillItem(item);
          const at = { x: item.x, z: item.z };
          // A cheesed patty comes off the grill as a little stack.
          if (item.topping) startHold(pt, { type: "stack", layers: [item.piece, item.topping.piece].map((piece) => ({ piece, offX: 0, offZ: 0 })), from: -1, grill: at });
          else startHold(pt, { type: "piece", piece: item.piece, fromGrill: at });
        }
      }
      break;
    case "plate": {
      // Drag a burger down off its plate to a prep spot under the heat lamp, to fix it there.
      const s = pt.plate >= 0 ? game.slots[pt.plate] : null;
      if (s && s.plate.layers.length && bandAt(pt.y) === "counter") {
        const layers = s.plate.layers.splice(0);
        syncTray(pt.plate, false);
        if (counter.page !== HOME_PAGE) goToPage(HOME_PAGE);
        startHold(pt, { type: "stack", layers, from: -1, fromPlate: pt.plate });
        hintOnce("to-prep", "Drop it on a prep spot, then swipe down on it to take layers off.", 3);
      }
      break;
    }
    case "hold":
      // Swipe down on a prep spot to peel the top layer off; drag any other way to move the whole stack.
      if (pt.moved && pt.hit?.type === "hold") {
        const spot = counter.holds[pt.hit.idx];
        if (spot.layers.length && dy > 0 && dy > Math.abs(dx) * 1.2) {
          const top = spot.layers.pop()!;
          counter.syncHold(pt.hit.idx, false);
          startHold(pt, { type: "piece", piece: top.piece, fromGrill: null, fromHold: pt.hit.idx });
          hintOnce("peel", "Peeled off. Drop it in the trash slot, back on a stack, or on the grill.", 3);
        } else if (spot.layers.length) {
          const layers = spot.layers.splice(0);
          counter.syncHold(pt.hit.idx, false);
          startHold(pt, { type: "stack", layers, from: pt.hit.idx });
        } else pt.mode = "swipe";
      }
      break;
    case "basket":
      if (pt.moved && pt.hit?.type === "basket" && (now - pt.t0 > 400 || dy > 0 || Math.abs(dx) > Math.abs(dy) || bandAt(pt.y) !== "counter")) {
        const b = counter.baskets[pt.hit.idx];
        if (b.loaded) {
          b.loaded = false;
          b.down = false;
          startHold(pt, { type: "fries", cook: b.cook, basket: pt.hit.idx, amount: b.amount });
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
    case "swipe":
      break;
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
          } else if (pt.hit.item.topping) showHint("Flip the patty before the cheese goes on.", 2);
          else if (pt.hit.item.piece.kind === "egg") showHint("Eggs stay sunny side up. Drag it to the tray when the white sets.", 2.5);
        } else showHint("Swipe up to flip, or drag it to the tray.", 2);
      }
      break;
    case "basket":
      if (!cancelled && pt.hit?.type === "basket") {
        const b = counter.baskets[pt.hit.idx];
        if (!b.loaded) showHint("Drag frozen fries into the basket.", 2);
        else if (!pt.moved || flickUp) {
          b.down = !b.down;
          if (b.down) sfx.sizzleHit();
          else sfx.whoosh();
          if (b.down) hintOnce("fries-ding", "Watch the bar: lift them in the gold zone. The fryer chimes at perfect.", 3.5);
          else hintOnce("fries-drag", "Drag the fries into a carton on the pad.", 2.5);
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
      if (cancelled || pt.plate < 0) break;
      // Swipe a plate up to hand it to its customer.
      if (dy < -40 && -dy > Math.abs(dx)) serve(pt.plate);
      // Swipe down on a plate with only sides to take them off.
      else if (dy > 40 && dy > Math.abs(dx)) removeTop(pt.plate);
      else if (!pt.moved && game.slots[pt.plate].order) hintOnce("serve", "Swipe the plate up to hand it over.", 2.5);
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

// Swipe along the tab bar to move between counters (the counters themselves don't swipe).
{
  const nav = ui.tabs[0].parentElement!;
  let sx = -1;
  let swiped = false;
  nav.addEventListener("pointerdown", (e) => {
    sx = e.clientX;
    swiped = false;
  });
  nav.addEventListener("pointermove", (e) => {
    if (sx < 0 || swiped) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 36) {
      swiped = true;
      sfx.unlock();
      goToPage(counter.page + (dx < 0 ? 1 : -1));
    }
  });
  const end = () => (sx = -1);
  nav.addEventListener("pointerup", end);
  nav.addEventListener("pointercancel", end);
  // A swipe that started on a tab shouldn't also count as tapping it.
  nav.addEventListener("click", (e) => {
    if (swiped) {
      e.stopPropagation();
      e.preventDefault();
      swiped = false;
    }
  }, true);
}

ui.tabs.forEach((t, i) =>
  t.addEventListener("click", () => {
    sfx.unlock();
    goToPage(i);
  }),
);
/** When each receipt's list was last scrolled by the player, and when we last scrolled it ourselves. */
const ticketScroll = ui.tickets.map(() => ({ user: -Infinity, auto: -Infinity }));
ui.tickets.forEach((t, i) => {
  let wasActive = false;
  t.addEventListener("pointerdown", () => {
    sfx.unlock();
    wasActive = game.active === i;
    setActive(i);
  });
  // Tapping the ticket you're already on flips between recipe view and the full list. This waits
  // for the click, which the browser drops when the touch turns into scrolling a long list.
  t.addEventListener("click", () => {
    if (wasActive && game.active === i) game.slots[i].expanded = !game.slots[i].expanded;
    wasActive = false;
  });
  // Scroll events don't bubble; listen in the capture phase for the list inside.
  t.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      if (now - ticketScroll[i].auto > 150) ticketScroll[i].user = now;
      updateTicketMore(t);
    },
    true,
  );
});

/** Shows the "more" fades while the receipt's layer list has lines scrolled out of view above or below. */
function updateTicketMore(t: HTMLElement): void {
  const tb = t.querySelector<HTMLElement>(".tb");
  t.classList.toggle("more", !!tb && tb.scrollTop + tb.clientHeight < tb.scrollHeight - 2);
  t.classList.toggle("more-up", !!tb && tb.scrollTop > 2);
}

/**
 * A long list that has to scroll follows the build: burgers go together bottom up, so it keeps
 * the next layer to stack in view (starting at the bottom bun), unless the player has just
 * scrolled it themselves.
 */
function followTicket(i: number): void {
  const t = ui.tickets[i];
  const tb = t.querySelector<HTMLElement>(".tb");
  if (!tb || tb.scrollHeight <= tb.clientHeight + 1) return;
  if (performance.now() - ticketScroll[i].user < 4000) return;
  const rows = [...tb.querySelectorAll<HTMLElement>("li[data-l]")];
  const next = rows.filter((r) => !r.classList.contains("ok")).pop();
  if (!next) return;
  // Sit the next layer a little below the middle, so the one just stacked shows beneath it.
  const top = Math.max(0, Math.min(tb.scrollHeight - tb.clientHeight, Math.round(next.offsetTop - (tb.clientHeight - next.offsetHeight) * 0.6)));
  if (Math.abs(tb.scrollTop - top) < 1) return;
  ticketScroll[i].auto = performance.now();
  tb.scrollTop = top;
}

/**
 * Fits a receipt to the room under the rail: long orders step down to tighter, then denser type,
 * and whatever still doesn't fit scrolls inside the receipt, with a "more" cue, rather than being cut off.
 */
function fitTicket(t: HTMLElement): void {
  t.classList.remove("tight", "dense", "more");
  const tb = t.querySelector<HTMLElement>(".tb");
  if (!tb) return;
  // Too tall for the room, or a line cut short with an ellipsis.
  const over = () => tb.scrollHeight > tb.clientHeight + 1 || [...t.querySelectorAll<HTMLElement>("li .l")].some((l) => l.scrollWidth > l.clientWidth + 1);
  if (over()) t.classList.add("tight");
  if (over()) t.classList.add("dense");
  updateTicketMore(t);
}

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
      if (save.biz && save.tutorialDone) {
        showPlan();
        screenShownAt = performance.now();
      }
      else startShift();
      break;
    case "biz":
      save.biz = !save.biz;
      writeSave(save);
      showTitle();
      break;
    case "plan-q":
    case "plan-p":
    case "plan-m": {
      const plan = planFor(stop(), save.plan);
      const v = btn!.dataset.v!;
      if (act === "plan-q") plan.quality = v as Plan["quality"];
      else if (act === "plan-p") plan.price = v as Plan["price"];
      else if (plan.menu.includes(v)) {
        if (plan.menu.length > 2) plan.menu = plan.menu.filter((n) => n !== v);
        else showHint("Keep at least two recipes on the menu.", 2);
      } else plan.menu = [...plan.menu, v];
      save.plan = plan;
      writeSave(save);
      showPlan();
      break;
    }
    case "open":
      startShift(planFor(stop(), save.plan));
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
      game.mapSel = save.town;
      writeSave(save);
      showTitle();
      break;
    case "update-now":
      if (game.pendingUpdate) reloadTo(game.pendingUpdate.build, true);
      break;
    case "update-later":
      ui.update.hidden = true;
      break;
  }
});

// The game menu (src/screens/menu.ts). In a shift it pauses; closing it resumes.
const inShift = () => game.phase === "playing" || game.phase === "paused";
initMenu({
  inShift,
  town: () => (inShift() ? shopStop() : withEvent(townById(game.mapSel), eventOn(game.mapSel, save.day))),
  priceMult: () => (inShift() && game.plan ? PRICE[game.plan.price].mult : 1),
  subtitle: () => `Day ${save.day} · ${townById(save.town).name}`,
  sound: () => !sfx.muted,
  setSound: (on) => {
    sfx.unlock();
    sfx.setMuted(!on);
    try {
      localStorage.setItem("bv-muted", on ? "0" : "1");
    } catch {
      // Storage can be unavailable (private mode); the setting just won't stick.
    }
  },
  difficulty: () => difficulty,
  setDifficulty: (d) => {
    difficulty = d;
    try {
      localStorage.setItem("bv-difficulty", d);
    } catch {
      // ignore
    }
  },
  gfx: () => gfx,
  setGfx: (level) => {
    applyGfx(level);
    layout();
    try {
      localStorage.setItem("bv-gfx", level);
    } catch {
      // ignore
    }
  },
  biz: () => save.biz,
  setBiz: (on) => {
    save.biz = on;
    writeSave(save);
    if (game.phase === "title") showTitle();
  },
  canInstall: () => !!installPrompt,
  install: () => void installPrompt?.prompt(),
  checkUpdate: () => checkNow(),
  resume: () => {
    if (game.phase === "paused") game.phase = "playing";
  },
  restart: () => {
    if (save.biz && save.tutorialDone) showPlan();
    else startShift();
  },
  quit: () => showTitle(),
  newTrip: () => {
    Object.assign(save, freshSave(), { tutorialDone: save.tutorialDone, trips: save.trips, best: save.best });
    game.mapSel = save.town;
    writeSave(save);
    showTitle();
  },
});

ui.menuBtn.addEventListener("click", () => {
  if (game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    openMenu();
  }
});

applyGfx(gfx);
try {
  if (localStorage.getItem("bv-muted") === "1") {
    sfx.setMuted(true);
  }
} catch {
  // ignore
}

function startShift(plan: Plan | null = null): void {
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
  for (const b of counter.baskets) Object.assign(b, { loaded: false, cook: 0, down: false, goldenRung: false, amount: 0 });
  counter.resetStations(save.stock);
  game.town = save.town;
  game.event = eventOn(save.town, save.day);
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
    plan,
    costs: 0,
    reviews: [],
    ratings: [],
    customers: plan ? plannedCustomers(plan) : Math.round(stop().customers * CROWD[stop().crowd].traffic * popularityTraffic(save.popularity)),
    press: null,
  });
  applyStop();
  // Maybe a critic in today's line, never the very first customer.
  game.criticAt = game.rng() < criticChance(stop().crowd, game.event) ? 1 + Math.floor(game.rng() * Math.max(1, game.customers - 2)) : -1;
  counter.fryBoost = has("turbo") ? 1.35 : 1;
  counter.autoStopPour = has("autostop");
  counter.setPage(HOME_PAGE);
  const intro = game.event
    ? `${game.event.name} today! ${game.event.blurb}${game.event.special ? ` Special: ${game.event.special.name}.` : ""}`
    : stop().newThing;
  if (intro && !game.tutorial) showHint(intro, 6);
  ui.title.hidden = true;
  closeAll();
  ui.summary.hidden = true;
}

/** Dress the truck for the current stop: scenery, pantry bins and HUD label. */
function applyStop(): void {
  const st = stop();
  counter.setPantry(st.pantry);
  customersView.setBackdrop(st.backdrop);
  ui.stop.textContent = game.event ? `${st.name} · ${game.event.name}` : st.name;
}

const offerList = () => save.offer.map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean);

/** The best, a middling and the worst review of the shift, without repeats. */
function highlights(reviews: Review[]): Review[] {
  const sorted = [...reviews].sort((a, b) => b.stars - a.stars);
  const picks = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].filter(Boolean);
  return picks.filter((r, i) => picks.findIndex((q) => q.text === r.text) === i);
}

function showPlan(): void {
  game.event = eventOn(save.town, save.day);
  const plan = planFor(stop(), save.plan);
  ui.title.innerHTML = planHtml({
    stop: stop(),
    plan,
    rep: save.rep,
    reviews: save.reviews,
    customers: plannedCustomers(plan),
    wtp: willingnessToPay(save.popularity, save.rep),
    popularity: save.popularity,
  });
  ui.title.hidden = false;
  ui.summary.hidden = true;
}

/**
 * The home screen: the road map with the truck's numbers, where the player drives, opens the
 * window or picks a pending upgrade. Lives in src/screens/home.ts; this only hands it what it needs.
 */
function showTitle(): void {
  game.town = save.town;
  game.event = eventOn(save.town, save.day);
  applyStop();
  game.phase = "title";
  screenShownAt = performance.now();
  ui.title.hidden = false;
  ui.summary.hidden = true;
  mountHome(ui.title, {
    save,
    focus: game.mapSel,
    startShift: () => {
      if (save.biz && save.tutorialDone) {
        showPlan();
        screenShownAt = performance.now();
      } else startShift();
    },
    commit: () => {
      writeSave(save);
      game.town = save.town;
      game.event = eventOn(save.town, save.day);
      applyStop();
    },
    openMenu: () => openMenu({ tab: "general" }),
    openHowTo: () => openHowTo(),
    sfx: { whoosh: () => sfx.whoosh(), coin: () => sfx.coin(), tap: () => sfx.unlock() },
  });
  game.mapSel = save.town;
  if (game.pendingUpdate) reloadTo(game.pendingUpdate.build);
}

function endShift(): void {
  game.phase = "summary";
  save.day++;
  const popBefore = save.popularity;
  save.popularity = Math.min(100, fadePopularity(save.popularity) + (game.press?.pop ?? 0));
  save.popularity = Math.max(10, save.popularity);
  if (game.press) save.press = [game.press, ...save.press].slice(0, 10);
  for (const s of game.slots) {
    s.bubble?.remove();
    s.bubble = null;
  }
  const here = stop();
  const avg = game.stars.length ? game.stars.reduce((a, b) => a + b, 0) / game.stars.length : 0;
  // Lifetime rating for the home screen: every served order's stars, in either mode.
  save.ratingCount += game.stars.length;
  save.ratingSum += game.stars.reduce((a, b) => a + b, 0);
  // A shift ends the day, so the truck may drive one road overnight again.
  save.overnightUsed = false;
  const ok = passed(avg, game.served, game.customers);
  let lastStop = false;
  const before = [...save.unlocked];
  const profit = game.money + game.tips - spills() - game.costs;
  save.bank += Math.max(0, Math.round(profit));
  const repBefore = save.rep;
  if (game.plan) {
    const r = nextReputation(save.rep, save.repWeight, game.ratings);
    save.rep = r.rep;
    save.repWeight = r.weight;
    save.reviews = [...game.reviews.slice().reverse(), ...save.reviews].slice(0, 30);
  }
  save.best[here.id] = Math.max(save.best[here.id] ?? 0, avg);
  save.stock = counter.stock();
  if (ok) {
    save.offer = upgradeChoices(save.upgrades, game.rng).map((u) => u.id);
    const firstTime = !save.passedTowns.includes(here.id);
    lastStop = passTown(save, here.id) && firstTime;
    if (lastStop) save.trips++;
  }
  const opened = save.unlocked.filter((id) => !before.includes(id)).map(townById);
  // Point the map at the next new town so "Back to the map" leads somewhere.
  if (opened.length) game.mapSel = opened[0].id;
  writeSave(save);
  ui.summary.innerHTML = summaryHtml({
    stop: here,
    shiftsHere: save.shiftsIn?.[here.id] ?? 0,
    served: game.served,
    lost: game.lost,
    stars: game.stars,
    earned: game.money,
    tips: game.tips,
    spills: spills(),
    biz: game.plan
      ? {
          costs: game.costs,
          profit,
          // Show the most telling ones: the best and the worst of the day.
          reviews: highlights(game.reviews),
          rep: save.rep,
          repBefore,
        }
      : null,
    best: game.best?.name ?? null,
    outcome: !ok ? "failed" : lastStop ? "trip" : "passed",
    opened,
    press: game.press,
    pop: [popBefore, save.popularity],
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
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
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
    if (game.time < stop().shiftLength && game.spawned < game.customers && free >= 0 && game.time >= game.nextSpawn && !tutorialHold) {
      spawnCustomer(free);
      const level = game.time / stop().shiftLength;
      const busy = game.customers / stop().customers;
      game.nextSpawn = game.time + (((17 - 8 * level) * (0.8 + game.rng() * 0.4)) / busy) * DIFFICULTY[difficulty].spawnGap;
    }
    // If the window is empty, don't make the player wait.
    if (!game.slots.some((s) => s.order) && game.nextSpawn > game.time + 2 && !game.tutorial) game.nextSpawn = game.time + 2;

    game.slots.forEach((s, i) => {
      if (!s.order || s.leaving) return;
      s.patience -= dt;
      if (s.fig) s.fig.setMood(patienceMood(s.patience / s.maxPatience));
      if (s.patience <= 0) {
        game.lost++;
        if (s.order.critic) criticVerdict(0, []);
        if (game.plan) {
          game.ratings.push(0);
          game.reviews.push({ stars: 0, text: reviewFor(0, [], game.plan, game.rng, true), stop: stop().name });
        }
        sfx.grumble();
        customerLeaves(i, "angry", "Too slow! I'm off.", false);
      }
    });

    // Food under the heat lamp slowly dries out.
    for (const h of counter.holds)
      h.layers.forEach((l, i) => {
        l.piece.held = (l.piece.held ?? 0) + dt;
        // Cheese sitting on a hot patty softens slowly under the lamp too.
        if (l.piece.kind === "cheese" && h.layers[i - 1]?.piece.kind === "patty") l.piece.melt = Math.min(1, (l.piece.melt ?? 0) + MELT_RATE.lamp * dt);
      });

    if (!game.hintsShown.has("melt-order") && game.slots[game.active]?.order?.layers.some((l) => l.melted))
      hintOnce("melt-order", "This one wants melted cheese: drop the slice on the patty while it's on the grill.", 4.5);

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

    const doneSpawning = game.time >= stop().shiftLength || game.spawned >= game.customers;
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
  showHint("It's overflowing! Wasted soda costs money, and the mess needs wiping.", 2.5);
};
counter.events.burning = () => {
  if (counter.page !== HOME_PAGE) showHint("Something's burning on the grill! ←", 2.5);
  else hintOnce("burning", "Smoke means burning! Drag it to the trash can.", 2.5);
};

/** Soda lost to overflows this shift, in whole dollars. */
function spills(): number {
  return Math.round(counter.spillCost);
}

let lastTimerText = "";
function updateUi(): void {
  const left = Math.max(0, stop().shiftLength - game.time);
  const tText = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Closing";
  if (tText !== lastTimerText) {
    ui.timer.textContent = tText;
    ui.timer.classList.toggle("closing", left <= 0);
    lastTimerText = tText;
  }
  const net = Math.round(game.money + game.tips - spills() - game.costs);
  const money = net < 0 ? `−$${-net}` : `$${net}`;
  if (ui.money.textContent !== money) ui.money.textContent = money;

  ui.rail.hidden = game.phase === "title";
  game.slots.forEach((s, i) => {
    const t = ui.tickets[i];
    const show = !!s.order && !s.leaving && game.phase !== "title";
    t.hidden = !show;
    if (!show || !s.order) return;
    const pct = s.patience / s.maxPatience;
    const key = `${s.order.id}|${s.expanded}|${s.plate.layers.map((l) => l.piece.kind).join(",")}|${s.plate.fries ? `${+!!s.plate.fries.salt}${+!!s.plate.fries.curds}${+!!s.plate.fries.gravy}` : ""}|${s.plate.drink?.flavor}|${Math.round(pct * 50)}`;
    if (key !== s.ticketKey || !t.dataset.fit) {
      const fresh = !s.ticketKey.startsWith(`${s.order.id}|${s.expanded}|`) || !t.dataset.fit;
      // Redrawing replaces the list, so carry over how far it was scrolled.
      const scrolled = fresh ? 0 : (t.querySelector<HTMLElement>(".tb")?.scrollTop ?? 0);
      t.innerHTML = ticketHtml(s.order, s.plate, game.tutorial && game.spawned === 1 && i === game.slots.findIndex((x) => x.order) ? 1 : pct, s.expanded, s.sentBack);
      s.ticketKey = key;
      if (fresh) {
        fitTicket(t);
        t.dataset.fit = "1";
      } else {
        const tb = t.querySelector<HTMLElement>(".tb");
        if (tb) tb.scrollTop = scrolled;
      }
      followTicket(i);
      updateTicketMore(t);
    }
    t.classList.toggle("active", i === game.active);
  });
  trayView.setActive(
    game.active,
    game.slots.map((s) => !!s.order),
  );

  ui.tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === counter.page)));
  updateGrillTags();
  updateFryTags();
  updateHoldUi();
  updateStationUi();
  // Labels are as wide as one tap, so they line up edge to edge along the machine.
  const tapPx = ((counter.drinkLabelPoint(1).project(counter.camera).x - counter.drinkLabelPoint(0).project(counter.camera).x) / 2) * bands.counter.w;
  ui.drinkLabels.forEach((el, i) => {
    const v = counter.drinkLabelPoint(i).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    el.style.width = `${Math.round(tapPx - 4)}px`;
    const visible = game.phase === "playing" && x > 20 && x < bands.counter.w - 20;
    el.hidden = !visible;
    if (visible) {
      el.style.left = `${x}px`;
      el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
    }
  });
  // Tab dots: something needs attention on that counter.
  const friesReady = counter.baskets.some((b) => b.loaded && friesZone(b.cook) === "done");
  const friesBurning = counter.baskets.some((b) => b.loaded && b.down && b.cook >= FRIES_ZONE.over - 0.05);
  const grillBurning = counter.grillItems.some((g) => g.piece.cook[0] > 0.85);
  // Supplies: a stack is out (or nearly), so a sleeve is needed.
  const lowStock = counter.stacks.some((st) => !st.sleeve && st.count <= 1);
  const dots = [false, grillBurning, friesReady || friesBurning, lowStock];
  const hot = [false, grillBurning, friesBurning, counter.stacks.some((st) => !st.sleeve && st.count === 0)];
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
/** Colour for each doneness band, so the grill tag can be read at a glance. */
/** Cook thresholds of each patty doneness level, to show progress through the current one. */
const DONENESS_BANDS: [string, number, number][] = [["raw", 0, 0.18], ["rare", 0.18, 0.43], ["medium", 0.43, 0.67], ["well", 0.67, 0.92], ["burnt", 0.92, 1.2]];

function itemTag(p: Piece): string {
  switch (p.kind) {
    case "patty": {
      // Two pills that mirror the patty: the top one is the face up, the bottom one the face on the grill.
      // Each shows its level and how far into it the face is; a face matching the active order gets a tick.
      const want = game.slots[game.active]?.order?.layers.find((l) => l.kind === "patty")?.doneness;
      const half = (t: number) => {
        const [d, lo, hi] = DONENESS_BANDS.find(([, , h]) => t < h) ?? DONENESS_BANDS[4];
        return donenessPill(d, (t - lo) / (hi - lo), d === want ? "ok" : "");
      };
      return `<i class="pind">${half(p.cook[1])}${half(p.cook[0])}</i>`;
    }
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
// Labels for the cup and carton stacks, the supplies cabinets and any spills.
const stationTag = (cls: string): HTMLElement => {
  const el = document.createElement("div");
  el.className = `gtag ${cls}`;
  el.hidden = true;
  ui.root.appendChild(el);
  return el;
};
const stackTags = counter.stacks.map(() => stationTag("stack"));
const puddleTags = counter.taps.map(() => stationTag("hot"));
const supplyTags = [0, 1].map(() => stationTag("stack"));
function placeTag(el: HTMLElement, world: THREE.Vector3, text: string, cls?: [string, boolean]): void {
  el.hidden = false;
  if (el.textContent !== text) el.textContent = text;
  if (cls) el.classList.toggle(cls[0], cls[1]);
  const v = world.project(counter.camera);
  el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
  el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
}
function updateStationUi(): void {
  const playing = game.phase === "playing" && counter.dragOffset === 0;
  const on = (page: number) => playing && Math.abs(counter.page - page) < 1;
  counter.stacks.forEach((s, i) => {
    const page = s.kind === "cup" ? 0 : 2;
    if (!on(page)) return void (stackTags[i].hidden = true);
    const text = s.sleeve ? "Tap to unwrap" : s.count ? `${s.size} · ${s.count}` : `${s.size} · empty`;
    placeTag(stackTags[i], new THREE.Vector3(s.x, 0, s.z + 0.6), text, ["low", !s.sleeve && s.count <= 1]);
  });
  // Supplies counter: each crate's label lists how full the stacks it restocks are.
  (["cup", "carton"] as const).forEach((kind, k) => {
    if (!on(3)) return void (supplyTags[k].hidden = true);
    const st = counter.stacks.filter((x) => x.kind === kind);
    const text = `${kind === "cup" ? "Cups" : "Cartons"}: ${st.map((x) => `${x.size} ${x.sleeve ? "sleeve" : x.count}`).join(" · ")}`;
    placeTag(supplyTags[k], counter.supplyAt[kind].clone().add(new THREE.Vector3(0, 0, 1.55)), text, ["low", st.some((x) => !x.sleeve && x.count <= 1)]);
  });
  counter.taps.forEach((t, i) => {
    if (!on(0) || t.puddle < 0.01) return void (puddleTags[i].hidden = true);
    placeTag(puddleTags[i], new THREE.Vector3(t.x, 0.1, 0.25), t.cup ? "Spill!" : "Scrub to wipe");
  });
}

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

/**
 * A fries doneness meter: underdone, done and overdone zones, a line at perfect, and a marker
 * for where these fries are now.
 */
function friesMeter(cook: number): string {
  const end = FRIES_ZONE.burnt;
  const pct = (v: number) => `${((Math.min(end, Math.max(0, v)) / end) * 100).toFixed(1)}%`;
  return `<span class="fmeter ${friesZone(cook)}${cook >= end ? " burnt" : ""}" style="--u:${pct(FRIES_ZONE.done)};--d:${pct(FRIES_ZONE.over)};--p:${pct(FRIES_PERFECT)}"><i style="left:${pct(cook)}"></i></span>`;
}

const fryTags: HTMLElement[] = [];
/** Meters over each loaded basket and each filled carton on the packing pads. */
function updateFryTags(): void {
  const on = game.phase === "playing" && counter.page === 2;
  const spots: { at: THREE.Vector3; html: string }[] = [];
  if (on) {
    for (const b of counter.baskets) {
      if (!b.loaded) continue;
      const scoops = Math.round(b.amount / FRIES_SCOOP);
      const pips = [0, 1, 2].map((k) => `<b class="${k < scoops ? "on" : ""}"></b>`).join("");
      spots.push({ at: new THREE.Vector3(b.obj.position.x, 1.3, b.obj.position.z - 1.3), html: `${friesMeter(b.cook)}<span class="scoops" aria-label="${scoops} of 3 scoops">${pips}</span>` });
    }
    for (const p of counter.packs) {
      if (!p.size || p.fill <= 0) continue;
      const tops = [p.salt && "Salt", p.curds && "Curds", p.gravy && "Gravy"].filter(Boolean).map((t) => `<em>${t}</em>`).join("");
      spots.push({ at: new THREE.Vector3(p.x, 0.2, p.z + 0.5), html: `${friesMeter(p.cook)}${tops ? `<span class="tops">${tops}</span>` : ""}` });
    }
  }
  while (fryTags.length < spots.length) {
    const el = document.createElement("div");
    el.className = "ftag";
    ui.root.appendChild(el);
    fryTags.push(el);
  }
  fryTags.forEach((el, i) => {
    const sp = spots[i];
    el.hidden = !sp;
    if (!sp) return;
    if (el.innerHTML !== sp.html) el.innerHTML = sp.html;
    const v = sp.at.project(counter.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
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
    const v = it.obj.position.clone().add(new THREE.Vector3(0, 0.2, 0.66)).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    const patty = it.piece.kind === "patty";
    el.hidden = x < 0 || x > bands.counter.w || (it.flipT >= 0 && !patty);
    if (el.hidden) return;
    const html = itemTag(it.piece);
    if (el.innerHTML !== html) el.innerHTML = html;
    // The patty indicator flips with the patty.
    if (patty) (el.firstElementChild as HTMLElement).style.transform = it.flipT >= 0 ? `scaleY(${Math.cos(Math.PI * Math.min(1, it.flipT)).toFixed(3)})` : "";
    el.classList.toggle("pt", patty);
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
    // The home screen covers the truck completely, so skip drawing it there and save battery.
    if (game.phase !== "title") render();
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
      openMenu();
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
  goToPage,
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
  menu: { openMenu, openHowTo, openMenuRef, closeAll },
  manual: (on: boolean) => {
    manualClock = on;
  },
};

