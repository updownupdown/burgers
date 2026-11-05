import * as THREE from "three";
import { CABIN } from "./render/cabin";
import { buzz, Sfx } from "./audio";
import { cookLevel, COOK_SCALE, cookZone, darkSide, DRINK_FILL, friesZone, FRY_ZONE, isMelted, paleSide, SALT, setFolded, type Cookable } from "./game/cooking";
import { makeOrder, orderFromRecipe, seededRng, type Rng } from "./game/menu";
import { expectedCustomers, sleep } from "./game/day";
import { greatShift, townBonus, type BonusId } from "./game/bonus";
import { cookTime, shiftStretch } from "./game/pace";
import { arrivalGap, clockAt, clockLabel, shiftProgress, shiftSeconds, validShift, type ShiftWindow } from "./game/shift";
import { freshSave, loadSave, passed, passTown, todaysClosing, writeSave, type Closing } from "./game/progress";
import { eventOn, fountainFor, fryerOf, garnishFor, garnishOf, middleOf, townById, withEvent, type TownEvent } from "./game/stops";
import { criticChance, fadePopularity, pieceFor, type PressPiece } from "./game/press";
import { CHILL_BURN, DIFFICULTY, verdict, type Difficulty } from "./game/difficulty";
import { joinChance, lineDrain, linePatience, MAX_LINE, RUSH, rushAt, WINDOW, windowPatience, wordOfMouth } from "./game/line";
import { BENCH_SAUCE, FRIES_HOLD, HOLD_GRACE, HOLD_RUIN, LADLE_BAND, LEOPARD_EVEN, payout, quickSauceStroke, SAUCE_BAND, sauceCoverage, sauceGate, sauceVerdict, scorePlate, TOUCH_TIP, touchTip, type SauceWord } from "./game/scoring";
import { History, samePlace, type Move, type Place } from "./game/undo";
import { CROWD, menuFor } from "./game/business";
import { askCounts, askFor, served as askServed, type Ask } from "./game/asks";
import { addReviews, brief, leavesReview, opinionFor, opinionLine, ratingPull, reviewAverage } from "./game/reviews";
import { opinionFace, starRow } from "./ui/faces";
import { DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "./game/menu";
import type { DrinkId, FriesSize, FryKind, Garnish, Layer, Order, Piece, Plate, SauceKind, Size } from "./game/types";
import { GARNISH_LABEL } from "./game/types";
import { makeGarnish } from "./render/models/garnish";
import { countRegular, REGULAR_AT, REGULAR_GOAL, REGULAR_POP, regularOrder } from "./game/regulars";
import { AFTER_OVEN, BREADS, COMAL_FILL, COUNTED, DRINK_LABEL, FRIES_PORTION, FRIES_SCOOP, FRY_LABEL, fryOf, GRILLABLE, isSauce, KIND_LABEL, newPiece, pressable, PROTEINS, sauceRadius, SCOOPED, SIZE_LABEL, SUGARED, TORTILLAS, unfoldTortilla } from "./game/types";
import { SCALE } from "./render/units";
import { dressCup } from "./render/cup";
import { makeCarton, makeCup, makeFood, makeFries, sliceSpot, stackBases } from "./render/food";
import { TORTILLA_R } from "./render/tacos";
import { makeTacoRack } from "./render/dishes";
import { ageLayers, freshen, isTacoRun, joinTacos, RACK_FILL, RACK_SLOTS } from "./game/hold";
import { makeFlatbread } from "./render/flatbread";
import { makePeel, makeSauceLadle, PEEL } from "./render/machines/oven";
import { flickOf, slideArmed, slidUnder, type Flick } from "./game/peel";
import { cullSmallHulls, disposeObject, OUTLINE_PX, setOutlinePx, setOutlineViewport } from "./render/materials";
import { BlobShadows } from "./render/blobs";
import { playShiftReveal } from "./screens/reveal";
import { CounterView, CUP_IN_HAND, RACK_SCALE, EMPTY_PACK, STOPS, pageX, type DrinkCup, GRILL_SCALE, GRILLE_ZONE, FLAT_ZONE, HEARTH_Y, HOME_PAGE, PAGES, PEEL_Y, GRILL_TOP, ZONE_START, type GrillItem, type Hit, type PeelTarget, type PieHolder, type PiePlace } from "./scenes/counter";
import { PLATE } from "./render/machines/press";
import { CutZoom } from "./scenes/cutzoom";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import { SauceZoom } from "./scenes/saucezoom";
import { makeKnife } from "./render/knife";
import { makeEgg, type EggStage } from "./render/egg";
import "./ui/components.css";
import "./style.css";
import { homeBusy, mountHome, refreshHome, type Arrival, type NightShow } from "./screens/home";
import { Dusk } from "./render/dusk";
import { GARAGE_START, garageHtml, type GarageView } from "./screens/garage";
import { buyBonus, buyLook, wearLook } from "./game/garage";
import type { Slot as LookSlot } from "./game/looks";
import { renderPrep, reviewsHtml, syncRange, toggleIngredients } from "./screens/day";
import { buildUi, cookMeter, patienceMood, peekHtml, setDrinkLabels, setTabArt, ticketHtml, tortillaMeter } from "./ui";
import { icon } from "./ui/icons";
import { esc } from "./screens/modal";
import { DRINK_TINT } from "./render/machines";
import { buildLabel, registerServiceWorker, reloadTo, startUpdateChecks, type VersionInfo } from "./update";
import { closeAll, initMenu, openHowTo, openMenu, openMenuRef, openSettings } from "./screens/menu";
import { dropBack, pushBack } from "./screens/nav";
import { devOn, simulate, type SimLevel } from "./game/devmode";
import { coachOn, coachShowing, coachState, setCoachOn, skipLessonsFor, startCoach } from "./tutorial/coach";
import { lessons } from "./tutorial/lessons";
import { showWelcome, welcomeDue } from "./tutorial/welcome";
import { modalClosedAt, modalOpen } from "./screens/modal";

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
/** Frames drawn since the game paused (see frame()). */
let pausedDraws = 0;
try {
  const saved = localStorage.getItem("bv-gfx");
  if (saved === "high" || saved === "standard" || saved === "low") gfx = saved;
} catch {
  // ignore
}
/**
 * Chill, Balanced or Stressful (src/game/difficulty.ts), picked on Prep. A new player starts on
 * Chill (the welcome card says so); a trip already under way that never picked keeps Balanced.
 */
let difficulty: Difficulty = "balanced";
let pickedPacing = false;
try {
  const saved = localStorage.getItem("bv-difficulty");
  if (saved && saved in DIFFICULTY) {
    difficulty = saved as Difficulty;
    pickedPacing = true;
  }
} catch {
  // ignore
}
function applyGfx(level: Gfx): void {
  gfx = level;
  renderer.shadowMap.enabled = level !== "low";
  setOutlinePx(OUTLINE_PX[level]);
  for (const sun of [counter.sun, trayView.sun]) {
    sun.castShadow = level !== "low";
    sun.shadow.radius = level === "high" ? 5 : 1;
  }
  renderer.shadowMap.needsUpdate = true;
  redrawPaused();
}
const ui = buildUi(document.getElementById("ui")!, PAGES);

const save = loadSave();
if (!pickedPacing && !save.tutorialDone) difficulty = "chill";
/** The town being played, as it is today (an event makes it busier and changes the crowd). */
const stop = () => withEvent(townById(game.town), game.event);
/** The bonus brought into this shift (one at most, picked on Prep). */
const has = (b: BonusId) => game.bonus === b;

interface Slot {
  order: Order | null;
  plate: Plate;
  patience: number;
  maxPatience: number;
  leaving: boolean;
  fig: CustomerFigure | null;
  ticketKey: string;
  bubble: HTMLElement | null;
  /** The order came back once, with this complaint; next time they take it unless it's really wrong. */
  sentBack: string | null;
  /** Free sides they kept when they sent the order back: a customer never turns down free food. */
  kept: Pick<Plate, "fries" | "drink">;
  /** On the first shift, which guided order this is (0, 1, 2; see tutorial/lessons.ts), else -1. */
  lesson: number;
}

const emptyPlate = (): Plate => ({ layers: [], fries: null, drink: null });

/** Someone waiting in line, not yet at the window. Their look is fixed by `seed` so they keep it when called up. */
interface Waiting {
  seed: number;
  patience: number;
  maxPatience: number;
  /** With the Ticket rail, the front of the line has already ordered: this is their ticket. */
  order?: Order;
}

const game = {
  phase: "title" as "title" | "playing" | "paused" | "sundown" | "summary",
  time: 0,
  money: 0,
  tips: 0,
  served: 0,
  lost: 0,
  stars: [] as number[],
  best: null as { name: string; score: number } | null,
  spawned: 0,
  /** Customers who have reached the window and ordered. */
  ordered: 0,
  nextSpawn: 1.2,
  orderSeq: 1,
  active: 0,
  tutorial: true,
  /** The trip's first day on Chill: nothing scores under four stars and only happy customers review. */
  gentle: false,
  town: save.town,
  /** Town highlighted on the map. */
  mapSel: save.town,
  /** Event on in this town today, during a shift. */
  event: null as TownEvent | null,
  rng: seededRng(Date.now() % 100000) as Rng,
  slots: [0, 1, 2].map(
    (): Slot => ({ order: null, plate: emptyPlate(), patience: 0, maxPatience: 1, leaving: false, fig: null, ticketKey: "", bubble: null, sentBack: null, kept: { fries: null, drink: null }, lesson: -1 }),
  ),
  hintsShown: new Set<string>(),
  /** Today's local ask (game/asks.ts) and how many served orders have counted toward it. */
  ask: null as Ask | null,
  askCount: 0,
  /** The town's regular has come by this shift (game/regulars.ts). */
  regularCame: false,
  /** Today's rush (line.ts rushAt): when it starts, how many are still to come, when the next joins. */
  rush: null as { at: number; left: number; next: number } | null,
  pendingUpdate: null as VersionInfo | null,
  /** Customers expected this shift (business mode changes it). */
  customers: 0,
  /** The line outside, front first. People step up when the bell rings (or when the window is empty). */
  line: [] as Waiting[],
  /** Gave up waiting in line, and saw the line and kept walking. Neither ordered, so neither rates. */
  leftLine: 0,
  walkedPast: 0,
  /** Bell taps so far (two within BELL_WINDOW call the next person) and when the first landed. */
  bellTaps: 0,
  bellAt: 0,
  /** When the window emptied, so the next person steps up on their own after a beat. */
  emptySince: -1,
  /** What unordered sides and extra toppings would have sold for: they go out free. */
  comped: 0,
  /** Reviews left so far this shift (stars, 1..5); every customer's opinion is in `stars`. */
  reviews: [] as number[],
  /** Set on Prep and fixed for the shift: pacing, the window, and the one bonus brought along. */
  pacing: "balanced" as Difficulty,
  shift: validShift(null) as ShiftWindow,
  /** Play time of today's window in seconds (see shift.ts). */
  shiftLength: 180,
  bonus: null as BonusId | null,
  /** Which customer (by arrival order) is a food critic today, or -1; and what they wrote. */
  criticAt: -1,
  press: null as PressPiece | null,
  /** Which screen is up over the map, so its buttons redraw the right one. */
  overlay: null as null | "closing" | "reviews" | "garage",
  garage: { ...GARAGE_START } as GarageView,
};

/**
 * What a kitchen move carried (DESIGN §31), for Undo: food (pieces by reference, so whatever
 * cooked since stays cooked), a cup, a carton, loose fries, a dressing (ice, a lid, curds, gravy)
 * or a squeeze of sauce. See src/game/undo.ts for the rules and the "Undo" section below.
 */
type Moved =
  | { k: "food"; layers: Layer[]; rack?: boolean }
  | { k: "drink"; ref: object | null; p: Payload }
  | { k: "carton"; ref: object | null; p: Payload }
  | { k: "fries"; p: Extract<Payload, { type: "fries" }>; moved: number; pack?: { fill: number; cook: number; fry: FryKind } }
  | { k: "extra"; what: "ice" | "lid" | "curds" | "gravy"; ref: { ice?: boolean; lid?: boolean; curds?: boolean; gravy?: boolean }; p: Payload }
  | { k: "sauce"; piece: Piece; before: number; kind: SauceKind }
  | { k: "cut"; pieces: Piece[]; was: { cut: boolean; cutQ?: number; cuts?: number }[] }
  | { k: "salt"; f: { salt?: number }; before: number; sugar: boolean };
/** The things a move carried, so a stale move takes older moves of the same things with it (undo.ts). */
function movedKeys(m: Move<Moved>): readonly object[] {
  const w = m.what;
  switch (w.k) {
    case "food":
      return w.layers.map((l) => l.piece);
    case "sauce":
      return [w.piece];
    case "cut":
      return w.pieces;
    case "salt":
      return [w.f];
    case "drink":
    case "carton":
    case "extra":
      return w.ref ? [w.ref] : [];
    case "fries":
      return [];
  }
}
const history = new History<Moved>(movedKeys);

/** A critic's verdict goes in the paper (and, like every critic's, it's a review: see `react`). */
function criticVerdict(stars: number, notes: string[]): void {
  game.press = pieceFor(stars, notes, stop(), game.event, game.rng);
}

/**
 * Whether this customer leaves a review: the delighted and the angry far more often than the
 * merely fed, critics always (game/reviews.ts). The first Chill day only keeps the happy ones.
 */
function maybeReview(stars: number, critic: boolean): boolean {
  if (game.gentle && stars < 4) return false;
  if (!leavesReview(stars, critic, game.rng)) return false;
  game.reviews.push(stars);
  return true;
}

/** The stop as the customers see it: just the recipes left on today's menu. */
function shopStop() {
  const st = stop();
  return { ...st, menu: menuFor(st, save.hidden) };
}

/** What a giveaway would have sold for: unordered sides at menu price, extra toppings at the extra price. */
function compValue(order: Order, fries: Plate["fries"], drink: Plate["drink"], extraToppings = false): number {
  let v = 0;
  if (fries && !order.fries) v += fries.curds ? 8 : FRIES_PRICE[fries.size];
  if (drink && !order.drink) v += DRINK_PRICE[drink.size];
  if (extraToppings) v += EXTRA_PRICE;
  return v;
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
/** Where the receipts were last placed, so they're only moved when focus or the orders change. */
let ticketsAt = "";
/** The focused order's ticket is opened out. Tapping it folds it back; tapping a stub opens that one. */
let ticketOpen = true;
let viewH = 0;

function layout(): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  viewH = H;
  const w = Math.min(W, Math.round(H * 0.62), 560);
  colX = Math.round((W - w) / 2);
  const safeT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-t")) || 0;
  // No tab bar: the counter runs to the bottom of the screen and the counter buttons float over it.
  const tabsH = 0;
  // The customers band holds the window (HUD on top, customers, then the order rail) and the
  // receipts hanging from the rail; it's taller than the tray so the receipts have room.
  let custH = Math.round(THREE.MathUtils.clamp(H * 0.34, 200, 320));
  let trayH = Math.round(THREE.MathUtils.clamp(H * 0.14, 96, 140));
  const counterFull = H - custH - trayH - tabsH;
  // The counter shows only a strip of wall above it; the space saved goes to the window and the trays.
  counter.layout(w / counterFull);
  const crop = counter.cropFor(w, counterFull);
  const toWin = Math.round(crop * CABIN.toWindow);
  custH += toWin;
  trayH += crop - toWin;
  const hudH = safeT + 42;
  const railY = Math.round(hudH + (custH - hudH) * 0.5);
  bands.customers = { x: colX, y: 0, w, h: custH };
  bands.tray = { x: colX, y: custH, w, h: trayH };
  bands.counter = { x: colX, y: custH + trayH, w, h: counterFull - crop };
  bands.tabs = { x: colX, y: H - tabsH, w, h: tabsH };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfx === "low" ? 1 : 1.5));
  renderer.setSize(W, H, false);
  // Size the canvas box to the visible viewport (not 100vh, which mobile browsers measure
  // with their toolbars hidden), so taps line up with what's drawn.
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  customersView.bandPx = custH;
  customersView.layout(w / custH, hudH / custH, railY / custH);
  trayView.layout(w / trayH);
  counter.layout(w / counterFull);
  counter.setCrop(w, counterFull, crop);
  trayView.fitRoom(trayH);

  const st = document.documentElement.style;
  st.setProperty("--gx", `${colX}px`);
  st.setProperty("--gw", `${w}px`);
  st.setProperty("--gh", `${H}px`);

  // Receipts hang from the rail, one under each customer.
  const slotW = w / 3;
  ui.rail.style.top = `${railY - 4}px`;
  railTop = railY;
  // Long receipts may hang over the back of the tray band, down to the trays' receipt line, so the
  // trays stay clear to tap and swipe (burgers shrink to fit under them). Across, they're placed by
  // placeTickets as focus moves.
  const rimY = bands.tray.y + trayView.rimTop() * trayH;
  const maxH = Math.max(custH - railY + trayH * 0.1, rimY - 6 - railY);
  ui.tickets.forEach((t) => {
    t.style.top = `${railY}px`;
    t.style.maxHeight = `${maxH}px`;
    t.dataset.fit = "";
  });
  ui.sentBack.forEach((b, i) => {
    b.style.left = `${Math.max(slotW * 0.5, Math.min(w - slotW * 0.5, slotW * (i + 0.5)))}px`;
    b.style.top = `${railY - 6}px`;
    b.style.maxWidth = `${slotW - 8}px`;
  });
  ticketsAt = "";
  // Tips sit over the customers, clear of the receipts and the counter you're working on.
  ui.hint.style.top = `${hudH + 6}px`;
  // Turned sideways mid-shift: pause behind the "turn your phone" overlay.
  if (W > H && H < 500 && game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    openMenu();
  }
}
window.addEventListener("resize", () => {
  layout();
  redrawPaused();
});
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

function spawnCustomer(slotIdx: number, seed: number, early?: Order): void {
  const s = game.slots[slotIdx];
  let order = early ?? nextOrder();
  // The first shift's guided orders (tutorial/lessons.ts): the simplest burger, then the same with a
  // small drink (so the counters get swiped), then once more on its own.
  const lesson = game.tutorial && game.ordered < GUIDED ? game.ordered : -1;
  if (lesson >= 0) {
    const drink = lesson === 1 ? fountainFor(stop().region)[0] : null;
    order = orderFromRecipe(order.id, stop().menu[0], false, drink, [], "S", "S");
    if (drink) order.ice = null;
  }
  s.lesson = lesson;
  s.order = order;
  // The plate is kept: the slot was free, so anything on it was put there ahead for whoever steps up
  // (served, refused and walked-out trays are cleared when they leave).
  s.sentBack = null;
  s.kept = { fries: null, drink: null };
  // Window patience follows the work the order takes: its layers, sides and the dish's own steps (line.ts).
  s.maxPatience = windowPatience(order) * (has("bench") ? 1.3 : 1) * CROWD[stop().crowd].patience * DIFFICULTY[game.pacing].patience;
  if (devOn()) console.debug(`[patience] #${order.id} ${order.name}: ${s.maxPatience.toFixed(0)} s`);
  // Guided orders wait as long as it takes.
  if (lesson >= 0) s.maxPatience = 900;
  s.patience = s.maxPatience;
  s.leaving = false;
  if (game.ordered === game.criticAt && !game.tutorial) {
    order.critic = true;
    showHint("A food critic just ordered. Their verdict goes in the papers!", 3.5);
  }
  s.fig = customersView.arrive(slotIdx, seed);
  game.ordered++;
  sfx.pop();
  if (!game.slots[game.active].order) setActive(slotIdx);
  syncTray(slotIdx, false);
}

/** How many orders of the first shift are talked through (tutorial/lessons.ts). */
const GUIDED = 3;

/** A fresh order, as hard as this point in the shift. */
function nextOrder(): Order {
  const level = Math.min(1, game.time / game.shiftLength);
  // The town's regular is the shift's third customer, with the order they always have.
  if (!game.tutorial && !game.regularCame && game.ordered >= REGULAR_AT) {
    game.regularCame = true;
    return regularOrder(game.orderSeq++, shopStop());
  }
  const order = makeOrder(game.orderSeq++, game.rng, level, shopStop());
  // The area's local drinks come with its garnish (after build #78; none in the Pines).
  const garnish = garnishFor(shopStop().region, order.drink);
  if (garnish) {
    order.garnish = garnish;
    hintOnce("garnish", `Local drinks here come with ${garnish === "apple" ? "an apple slice" : garnish === "lime" ? "a lime wedge" : "a cucumber wheel"}: once the drink is on the tray, drag one up from the dish by the ice.`, 4);
  }
  return order;
}

/** Things the tutorial waits for the player to do once (tutorial/lessons.ts). */
const coachCounts = { bell: 0, folds: 0, opens: 0 };

/**
 * A tap on the bell calls the next person up. Taps within this many seconds of the last one only
 * ring (a quick double ring is still one customer); after a pause the next tap calls again.
 */
const BELL_WINDOW = 1.5;

/** The first in line steps up to a free place at the window (`prefer`, if it's free), if the difficulty allows another. */
function callNext(prefer = -1): boolean {
  const empty = (s: Slot) => !s.order && !s.fig;
  const free = prefer >= 0 && empty(game.slots[prefer]) ? prefer : game.slots.findIndex(empty);
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  if (free < 0 || !game.line.length || atWindow >= WINDOW[game.pacing]) return false;
  const w = game.line.shift()!;
  spawnCustomer(free, w.seed, w.order);
  return true;
}

/**
 * A tap on an empty tray calls the next person to it (after build #78): the bell is in the hardest
 * spot to reach with a thumb, the trays are not. The header bell still works.
 */
function callToTray(i: number): void {
  if (game.phase !== "playing") return;
  if (!game.line.length) return void hintOnce("tray-call-empty", "Nobody in line right now. A tap on an empty tray calls the next person when someone's waiting.", 3);
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  if (atWindow >= WINDOW[game.pacing]) return void hintOnce("bell-full", `No room at the window: ${WINDOW[game.pacing]} at a time on ${DIFFICULTY[game.pacing].label}. Serve someone first.`, 3.5);
  if (!callNext(i)) return;
  ui.bell.classList.remove("ring");
  void ui.bell.offsetWidth;
  ui.bell.classList.add("ring");
  sfx.bell();
  coachCounts.bell++;
  game.bellTaps = 1;
  game.bellAt = game.time;
}

/** A tap on the bell: calls the next person in line, unless the bell rang only a moment ago. */
function ringBell(): void {
  if (game.phase !== "playing") return;
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  ui.bell.classList.remove("ring");
  void ui.bell.offsetWidth;
  ui.bell.classList.add("ring");
  sfx.bell();
  const recent = game.bellTaps > 0 && game.time - game.bellAt < BELL_WINDOW;
  game.bellTaps = 1;
  game.bellAt = game.time;
  if (recent) return;
  if (!game.line.length) {
    hintOnce("bell-empty", "Nobody in line right now. The bell calls up the next person when there is one.", 3);
    return;
  }
  if (atWindow >= WINDOW[game.pacing]) {
    hintOnce("bell-full", `No room at the window: ${WINDOW[game.pacing]} at a time on ${DIFFICULTY[game.pacing].label}. Serve someone first.`, 3.5);
    return;
  }
  if (callNext()) {
    coachCounts.bell++;
    hintOnce("bell-called", "Next! More people at the window means more money, if you can keep up.", 3.5);
  }
}
// The header shows only how many wait in line (after build #82): people are called with the bell on an empty tray.

function setActive(i: number): void {
  game.active = i;
}

function clearSlot(i: number): void {
  const s = game.slots[i];
  history.forgetTray(i);
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

/** The customer goes, showing what they thought (a face, maybe a line) and any review they left. */
function customerLeaves(i: number, stars: number, say: string | null, reviewed: boolean, aside = false): void {
  const s = game.slots[i];
  s.leaving = true;
  s.fig?.setMood(stars >= 4 ? "happy" : stars === 3 ? "neutral" : stars === 2 ? "sad" : "angry");
  // Move straight on to the next order so nothing gets dropped on the departing plate.
  if (game.active === i) {
    const other = game.slots.findIndex((sl) => sl.order && !sl.leaving);
    if (other >= 0) setActive(other);
  }
  showOpinion(i, stars, say, reviewed, aside);
  setTimeout(() => customersView.leave(i, () => clearSlot(i)), 1100);
}

/** The local ask was met this shift. */
const askMet = (): boolean => !!game.ask && game.askCount >= game.ask.need;

/** A served order may count toward the local ask; meeting it pays its reward there and then. */
function noteServed(order: Order, r: { stars: number; touches: string[] }, patience: number): void {
  noteRegular(order, r.stars);
  const a = game.ask;
  if (!a || askMet() || !askCounts(a, askServed(r, patience))) return;
  game.askCount++;
  if (askMet()) {
    game.money += a.reward;
    showHint(`Local ask done: ${a.text}. +$${a.reward}, and today counts as two shifts here.`, 4);
    setTimeout(() => sfx.coin(), 700);
  }
}

/** A town's regular served (after build #78): count good visits; the third makes them a regular for good. */
function noteRegular(order: Order, stars: number): void {
  if (!order.regular) return;
  const tally = save.regulars?.[save.town] ?? 0;
  const r = countRegular(tally, stars);
  if (r.tally === tally) return;
  save.regulars = { ...save.regulars, [save.town]: r.tally };
  if (r.won) {
    save.popularity = Math.min(100, save.popularity + REGULAR_POP);
    showHint(`${order.regular} is a regular now, and tells everyone. +${REGULAR_POP} popularity.`, 4);
  } else showHint(`${order.regular} will be back (${r.tally} of ${REGULAR_GOAL}).`, 2.5);
}

/**
 * Hand a plate to its customer (swipe it up). They look it over: a good plate is taken and
 * paid for; a clearly wrong one comes back once for changes; a really wrong one is refused.
 * Free sides they didn't order are always kept.
 */
function serve(i: number): void {
  const s = game.slots[i];
  if (!s.order || s.leaving) {
    showHint("No one's waiting for that tray yet.", 1.5);
    return;
  }
  if (s.plate.layers.length === 0 && !s.plate.fries && !s.plate.drink) {
    showHint("That tray is empty!", 1.5);
    return;
  }
  // Serving can't be undone: whatever was put on this tray stays put (even if it comes back).
  finishFly();
  history.forgetTray(i);
  // Freebies kept from an earlier send-back count towards this verdict too.
  const plate: Plate = { ...s.plate, fries: s.plate.fries ?? s.kept.fries, drink: s.plate.drink ?? s.kept.drink };
  const r = scorePlate(s.order, plate);
  let call = s.lesson === 0 || s.lesson === 1 ? "accept" : verdict(r.score, game.pacing, !!s.sentBack, r.faulty, !!r.missing);
  // The first day on Chill never turns anyone away: a really wrong order comes back once for changes, then it's taken.
  if (game.gentle && call === "refuse") call = s.sentBack ? "accept" : "sendBack";
  // ...and anything taken that day is worth at least four stars.
  if (game.gentle && r.stars < 4) r.stars = 4;
  if (call === "sendBack") return sendBack(i, r.missing ?? r.notes[0] ?? "this isn't quite right");
  if (call === "refuse") return refuse(i, r.notes[0] ?? "this isn't what I ordered", r.perks.length > 0);
  const reviewed = maybeReview(r.stars, !!s.order.critic);
  // Giveaways make people happy, but they go out free.
  game.comped += compValue(s.order, plate.fries, plate.drink, r.perks.includes("extra toppings"));
  if (s.order.critic) criticVerdict(r.stars, r.notes);
  const { pay, tip: baseTip } = payout(s.order, r.score, s.patience / s.maxPatience);
  // The meal deal sign: a main (whatever the middle counter makes: anything built in layers) with
  // a side and a drink tips half again.
  const meal = has("combo") && s.order.layers.length > 0 && !!s.order.fries && !!s.order.drink;
  // Chef's touches (perfect sauce, grill marks, a clean cut, hand-pressed tortillas...) add a dollar or two each.
  const touches = r.stars >= 4 ? r.touches : [];
  const tip = Math.round(baseTip * (has("tipjar") ? 1.3 : 1) * (meal ? 1.5 : 1) * CROWD[stop().crowd].tips) + touchTip(touches, r.stars);
  game.money += pay;
  game.tips += tip;
  game.served++;
  game.stars.push(r.stars);
  if (r.stars >= 4) {
    save.known[s.order.name] = (save.known[s.order.name] ?? 0) + 1;
    writeSave(save);
  }
  if (!game.best || r.score > game.best.score) game.best = { name: `#${s.order.id} ${s.order.name} (${r.score}%)`, score: r.score };
  // Everyone shows a face; only something specific (missing, wrong, especially quick or good) gets words.
  const say = opinionLine({ stars: r.stars, missing: r.missing, notes: r.notes, perks: r.perks, patience: s.patience / s.maxPatience }, game.rng);
  customerLeaves(i, r.stars, say, reviewed, r.stars === 4 && !r.missing && r.notes.length > 0);
  noteServed(s.order, r, s.patience / s.maxPatience);
  // The food is handed over right away so the plate is free for the next order.
  s.plate = emptyPlate();
  syncTray(i, false);
  sfx.whoosh();
  coinPop(i, pay + tip, touches);
  setTimeout(() => sfx.coin(), 250);
  buzz(r.stars >= 4 ? [20, 40, 20] : 60);
  // Two guided orders in, the trip counts as started: a restart won't go back to the lessons.
  if (game.tutorial && s.lesson === 1) {
    save.tutorialDone = true;
    writeSave(save);
  }
  s.lesson = -1;
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
  showBubble(i, `Can you fix it? ${capitalise(brief(note))}.${took ? ` I'll keep the ${took}!` : ""}`, false);
  sfx.grumble();
  buzz([30, 40, 30]);
  hintOnce("sent-back", "Sent back: fix the tray and serve it again. Drag a wrong layer down off the tray into the trash.", 4);
}

/** Really wrong: they won't take it and leave without paying (but keep any freebies). */
function refuse(i: number, note: string, perk: boolean): void {
  const s = game.slots[i];
  const took = takeFreebies(s) ?? (s.kept.fries || s.kept.drink ? "freebie" : null);
  const stars = took || perk ? 2 : 1;
  game.lost++;
  if (s.order!.critic) criticVerdict(1, [note]);
  const reviewed = maybeReview(stars, !!s.order!.critic);
  game.comped += compValue(s.order!, s.kept.fries, s.kept.drink);
  sfx.grumble();
  buzz(80);
  customerLeaves(i, stars, `No thanks. ${capitalise(brief(note))}.${took ? ` I'll keep the ${took === "freebie" ? "free side" : took}.` : ""}`, reviewed);
  s.plate = emptyPlate();
  syncTray(i, false);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Over the customer's head: a speech bubble (a send-back asking for a fix). */
function showBubble(i: number, text: string, good: boolean): void {
  const b = document.createElement("div");
  b.className = `bubble ${good ? "good" : "bad"}`;
  b.textContent = text;
  placeOverHead(i, b, 2600);
}

/**
 * Over the customer's head as they go: their opinion as a face, with a short line only when it's
 * specific, and if they left a review, its stars popping out above.
 */
function showOpinion(i: number, stars: number, say: string | null, reviewed: boolean, aside = false): void {
  const b = document.createElement("div");
  // `aside`: a 4★'s small grey note on what cost the fifth star.
  b.className = `opinion ${opinionFor(stars)}${say ? " said" : ""}${aside ? " aside" : ""}`;
  b.innerHTML = `${opinionFace(stars)}${say ? `<span class="say"></span>` : ""}${reviewed ? `<span class="review">${starRow(stars)}</span>` : ""}`;
  if (say) b.querySelector(".say")!.textContent = say;
  placeOverHead(i, b, reviewed ? 2800 : 2400, true);
}

/** Over customer i's head, kept on screen; `narrow` keeps it inside their third of the window so neighbours' bubbles don't overlap. */
function placeOverHead(i: number, b: HTMLElement, ms: number, narrow = false): void {
  const s = game.slots[i];
  s.bubble?.remove();
  const W = bands.customers.w;
  const slotW = W / 3;
  if (narrow) b.style.maxWidth = `${Math.round(slotW - 6)}px`;
  // Above the customer's head, clear of the receipts on the rail.
  b.style.top = `${railTop * 0.58}px`;
  ui.root.appendChild(b);
  const half = b.offsetWidth / 2 + 4;
  b.style.left = `${Math.max(half, Math.min(W - half, i * slotW + slotW * 0.5))}px`;
  s.bubble = b;
  setTimeout(() => {
    b.remove();
    if (s.bubble === b) s.bubble = null;
  }, ms);
}

function coinPop(i: number, amount: number, touches: readonly string[] = []): void {
  const c = document.createElement("div");
  c.className = "coin";
  c.textContent = `+$${amount}`;
  // Chef's touches as small stamps under the coin ("+$1 Perfect sauce").
  for (const t of touches) {
    const st = document.createElement("span");
    st.className = "stamp";
    st.textContent = `+$${TOUCH_TIP[t] ?? 1} ${t}`;
    c.append(st);
  }
  if (touches.length) c.classList.add("touched");
  const slotW = bands.customers.w / 3;
  c.style.left = `${i * slotW + slotW * 0.5}px`;
  c.style.top = `${bands.tray.y + 10}px`;
  ui.root.appendChild(c);
  setTimeout(() => c.remove(), 1500);
}

/** Everything the ticket asks for is on the tray (right or not): it can be handed over with a tap. */
function trayReady(i: number): boolean {
  const s = game.slots[i];
  if (!s.order || s.leaving) return false;
  const p = s.plate;
  if (!p.layers.length && !p.fries && !p.drink) return false;
  const r = scorePlate(s.order, { ...p, fries: p.fries ?? s.kept.fries, drink: p.drink ?? s.kept.drink });
  return !r.missing && !r.notes.some((n) => n.startsWith("missing"));
}

// The Serve button on the trays: a tap is easier to find than a swipe. (Undo is in the header: see "Undo" below.)
const trayActs = game.slots.map((_, i) => {
  const serveBtn = document.createElement("button");
  serveBtn.className = "tray-serve";
  serveBtn.hidden = true;
  // A swipe up on the pill hands it over too (after build #82: it's more fun), and the chevrons
  // keep rising out of it to say so. A plain tap still serves.
  serveBtn.innerHTML = `<span class="chev" aria-hidden="true"><i></i><i></i></span>Serve`;
  serveBtn.setAttribute("aria-label", "Serve: tap, or swipe up");
  let swipe: { id: number; y0: number; dy: number } | null = null;
  serveBtn.addEventListener("pointerdown", (e) => {
    swipe = { id: e.pointerId, y0: e.clientY, dy: 0 };
    try {
      serveBtn.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; moves still arrive.
    }
  });
  serveBtn.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    swipe.dy = Math.min(0, e.clientY - swipe.y0);
    serveBtn.style.translate = `0 ${swipe.dy.toFixed(0)}px`;
  });
  const letGo = (cancel: boolean) => {
    const sw = swipe;
    swipe = null;
    serveBtn.style.translate = "";
    if (!sw || cancel || game.phase !== "playing" || !trayReady(i)) return;
    if (sw.dy < -24) serve(i);
  };
  serveBtn.addEventListener("pointerup", () => letGo(false));
  serveBtn.addEventListener("pointercancel", () => letGo(true));
  serveBtn.addEventListener("click", () => {
    if (game.phase === "playing" && trayReady(i)) serve(i);
  });
  ui.root.append(serveBtn);
  // On an empty tray while people wait, a desk bell (after build #82, drawn in the tray scene): a tap
  // rings it and calls the next one to this tray. It stays a moment (BELL_LINGER_MS) after the first
  // ring, so a second tap calls one more. This button is its touch area.
  const callBtn = document.createElement("button");
  callBtn.className = "tray-call";
  callBtn.hidden = true;
  callBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    trayBellTap(i);
  });
  ui.root.append(callBtn);
  return { serveBtn, callBtn };
});

/** The tray bell stays this long after its first ring, for a second ring (after build #82). */
const BELL_LINGER_MS = 400;
/** Until when each tray's bell lingers after a ring (performance.now ms), and how many rings it took. */
const bellLinger = [0, 0, 0];
const bellRings = [0, 0, 0];
function trayBellTap(i: number): void {
  if (game.phase !== "playing") return;
  const now = performance.now();
  const lingering = now < bellLinger[i];
  if (lingering && bellRings[i] >= 2) return;
  // The first ring calls the next one to this tray; a second, to the next free tray.
  const ok = lingering ? callNext() : (callToTray(i), true);
  trayView.plates[i].ringBell();
  if (lingering) {
    sfx.bell();
    if (ok) coachCounts.bell++;
    bellRings[i] = 2;
  } else {
    bellRings[i] = 1;
    bellLinger[i] = now + BELL_LINGER_MS;
  }
  buzz(10);
}

/** The local ask's chip, pinned at the top of the window while the shift runs (game/asks.ts). */
const askChip = (() => {
  const el = document.createElement("div");
  el.className = "askchip";
  el.hidden = true;
  el.setAttribute("role", "status");
  ui.root.append(el);
  return el;
})();
function updateAskChip(): void {
  const a = game.ask;
  const show = !!a && (game.phase === "playing" || game.phase === "paused");
  askChip.hidden = !show;
  if (!show || !a) return;
  const met = game.askCount >= a.need;
  const html = `${icon("flag")}<span>${esc(a.text)}</span><b>${met ? "Done" : `${game.askCount}/${a.need}`}</b>`;
  if (askChip.dataset.k !== html) {
    askChip.dataset.k = html;
    askChip.innerHTML = html;
    askChip.classList.toggle("met", met);
  }
  const hud = ui.root.querySelector<HTMLElement>(".hud");
  const top = `${Math.round((hud?.getBoundingClientRect().bottom ?? 60) + 6)}px`;
  if (askChip.style.top !== top) askChip.style.top = top;
  if (askChip.style.left !== "12px") askChip.style.left = "12px";
}

/** The dish on a tray draws this much bigger while its receipt is folded (PlateView.boost). */
const TRAY_ZOOM = 1.3;

/** When each tray became ready (performance.now ms), so Serve waits for the last layer's landing. */
const readySince: (number | null)[] = [null, null, null];
/** Serve shows this long after the last layer lands (after build #78), so the squash plays first. */
const SERVE_DELAY_MS = 300;

function updateTrayActs(): void {
  const on = game.phase === "playing" && !ptr?.held;
  const now = performance.now();
  const room = game.slots.filter((s) => s.order || s.fig).length < WINDOW[game.pacing];
  game.slots.forEach((s, i) => {
    const { serveBtn, callBtn } = trayActs[i];
    // The desk bell: an empty tray, someone in line and room at the window (not while guided), or
    // a moment after a ring, for a second one.
    const lingering = now < bellLinger[i] && bellRings[i] < 2;
    // The bell itself stays put while food is carried (it used to blink out on every drag); only
    // its tap target steps aside so a drop on the tray isn't caught by it.
    const playing = game.phase === "playing";
    const bell = (playing && room && !s.order && !s.fig && game.line.length > 0 && !(game.tutorial && game.served < 2)) || (playing && lingering);
    const call = bell && on;
    callBtn.hidden = !call;
    trayView.plates[i].showBell(bell);
    if (call) {
      const label = `Ring for the next customer, ${game.line.length} waiting`;
      if (callBtn.getAttribute("aria-label") !== label) callBtn.setAttribute("aria-label", label);
      const v = trayView.plates[i].bellPoint().project(trayView.camera);
      const x = ((v.x + 1) / 2) * bands.tray.w;
      const y = bands.tray.y + ((1 - v.y) / 2) * bands.tray.h;
      callBtn.style.transform = `translate(${(x - 32).toFixed(0)}px, ${(y - 32).toFixed(0)}px)`;
    }
    const ready = on && trayReady(i);
    if (!ready) readySince[i] = null;
    else readySince[i] ??= now;
    const show = ready && now - readySince[i]! >= SERVE_DELAY_MS;
    serveBtn.hidden = !show;
    if (!show) return;
    // Serve is a slim pill along the tray's front lip, under the food and its staleness bar, so the
    // finished dish stays in view (it used to sit right over it).
    const v = trayView.staleBarPoint(i).project(trayView.camera);
    const slotW = bands.tray.w / 3;
    const y = bands.tray.y + ((1 - v.y) / 2) * bands.tray.h + 5;
    serveBtn.style.transform = `translate(${(i * slotW + slotW / 2 - 45).toFixed(0)}px, ${y.toFixed(0)}px)`;
  });
}

function syncTray(i: number, animate: boolean): void {
  const s = game.slots[i];
  // A plate on the tray means a burger is expected; drinks-only and fries-only orders get a bare tray.
  // A customer on their way out has taken their plate with them.
  trayView.plates[i].setDish(!!s.order && s.order.layers.length > 0 && !s.leaving);
  trayView.plates[i].setWants(!!s.order && s.order.fries && !s.leaving, !!s.order?.drink && !s.leaving);
  trayView.plates[i].sync(s.plate, animate, () => sfx.plop());
}

// ---------------------------------------------------------------------------
// Hints

let hintUntil = 0;
let hintText = "";
/** A tip the player closed: it stays hidden until a different one comes up. */
let hintDismissed = "";

function dismissHint(): void {
  hintDismissed = ui.hintText.textContent ?? "";
  if (hintText === hintDismissed) hintUntil = 0;
  ui.hint.hidden = true;
}
// Close a tip with its X, or flick it away sideways or up.
ui.hintClose.addEventListener("click", (e) => {
  e.stopPropagation();
  dismissHint();
});
{
  let start: { x: number; y: number; id: number } | null = null;
  ui.hint.addEventListener("pointerdown", (e) => {
    // The X takes its own tap; capturing here would steal its click.
    if ((e.target as HTMLElement).closest(".hint-x")) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    ui.hint.setPointerCapture(e.pointerId);
  });
  ui.hint.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = Math.min(0, e.clientY - start.y);
    ui.hint.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
    ui.hint.style.opacity = `${Math.max(0.2, 1 - Math.hypot(dx, dy) / 160)}`;
  });
  const end = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    ui.hint.style.opacity = "";
    if (Math.abs(dx) > 50 || dy < -30) dismissHint();
    else ui.hint.style.transform = "";
  };
  ui.hint.addEventListener("pointerup", end);
  ui.hint.addEventListener("pointercancel", end);
}
function showHint(text: string, seconds = 3): void {
  hintText = text;
  if (text === hintDismissed) hintDismissed = "";
  hintUntil = performance.now() + seconds * 1000;
}
function hintOnce(key: string, text: string, seconds = 4): void {
  if (game.hintsShown.has(key)) return;
  game.hintsShown.add(key);
  showHint(text, seconds);
}

/** The old text walkthrough of the first burger, for when tutorial mode (the thumb) is off. */
function tutorialHint(): string | null {
  if (!game.tutorial || game.phase !== "playing" || coachOn()) return null;
  const s = game.slots.find((sl) => sl.order);
  if (!s) return null;
  const layers = s.plate.layers;
  const pattyOnGrill = counter.grillItems.find((g) => g.piece.kind === "patty");
  if (counter.page !== HOME_PAGE) return "Tap the grill button at the edge of the counter to go back.";
  if (layers.length === 0) return "Drag a bun up onto the plate on the tray.";
  const hasPatty = layers.some((l) => l.piece.kind === "patty");
  if (!hasPatty) {
    if (!pattyOnGrill) return "Now drag a patty onto a hot part of the grill.";
    const t = cookLevel(pattyOnGrill.piece);
    if (t < COOK_SCALE.patty.done) return "Let it sizzle. Take it off when the meter is in the middle band.";
    if (t < COOK_SCALE.patty.over) return "Done! Drag the patty up onto the bun.";
    return "A bit past done. Grab it now, before it burns.";
  }
  if (layers[layers.length - 1].piece.kind !== "bun" || layers.length < 3) return "Add the top bun.";
  return "Tap Serve (or swipe the tray up) to hand it to the customer!";
}

// ---------------------------------------------------------------------------
// Input

type Payload =
  | { type: "piece"; piece: Piece; fromGrill: { x: number; z: number } | null; fromPlate?: number; fromBasket?: number }
  | { type: "stack"; layers: Layer[]; grill?: { x: number; z: number }; fromPlate?: number; bay?: number; board?: boolean; peel?: boolean; spot?: number; rack?: boolean; whole?: boolean }
  | { type: "fries"; cook: number; basket: number | null; amount: number; fry?: FryKind; fromBatter?: boolean; held?: number }
  | { type: "carton"; size: FriesSize; cook: number; fill: number; pack: number; salt: number; curds: boolean; gravy: boolean; fry?: FryKind; fromPlate?: number; held?: number }
  | { type: "salt"; sugar?: boolean }
  | { type: "curds" }
  | { type: "gravy" }
  | { type: "drink"; flavor: DrinkId | null; fill: number; size: Size; ice: boolean; lid: boolean; from: { x: number; z: number } | null; fromPlate?: number; garnish?: Garnish }
  | { type: "garnish"; kind: Garnish }
  | { type: "ice" }
  | { type: "lid"; size: Size }
  | { type: "empty"; kind: "cup" | "carton"; size: Size; stack: number; ice?: boolean };

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
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate" | "wipe" | "rub" | "egg" | "bay" | "handle" | "board" | "tpress" | "ladle" | "peel" | "fold" | "spot" | "bench" | "rack" | "knife" | "peelPie";
  /** The sauce or oil being spread on a pie being built (the oven page). */
  ladle?: SauceKind;
  /** A press near the side of an unbaked pie on the peel or the bench (pie-local): dragging it across the middle folds it into a calzone. */
  peelFold?: { holder: PieHolder; x: number; z: number };
  /** The peel in hand: when its last swipe was (ms), so one swipe is only counted once. */
  flickT?: number;
  /** A press on the edge of a tortilla on the comal (page-local grill point): dragging it across the middle folds it. */
  foldFrom?: { x: number; z: number };
  /** The carried knife has made its cut on this drag. */
  cutDone?: boolean;
  /** The press started on the trash chute with nothing in hand (a swipe there changes counter). */
  chute?: boolean;
  /** That swipe has already changed counter. */
  paged?: boolean;
  /** Tap whose spill is being wiped. */
  wipe: number;
  hit: Hit | null;
  held: Held | null;
  sauce: SauceKind | null;
  /** The tray a squeeze started on. */
  drawSlot: number;
  plate: number;
  /** The part of the tray pressed (the cup, the fries or the main), so a drag lifts what's under the finger. */
  part?: "cup" | "fries" | "main";
  samples: { x: number; y: number; t: number }[];
  moved: boolean;
}

let ptr: Pointer | null = null;
let lastGesture: unknown = null;
let lastSquirt = 0;

/** A burger (or part of one) as a single object to carry around. */
function stackVisual(layers: Layer[]): THREE.Object3D {
  const g = new THREE.Group();
  if (layers[0]?.piece.kind === "dough") {
    // A flatbread or calzone, carried whole.
    g.add(makeFlatbread(layers.map((l) => l.piece)));
    g.scale.setScalar(GRILL_SCALE);
    return g;
  }
  const { bases, yaw, back } = stackBases(layers.map((l) => l.piece));
  layers.forEach((l, i) => {
    const o = makeFood(l.piece, i === 0 ? "bottom" : "top");
    o.position.set(l.offX, bases[i], l.offZ - back[i]);
    o.rotation.y = yaw[i];
    g.add(o);
  });
  g.scale.setScalar(GRILL_SCALE);
  return g;
}

function payloadVisual(p: Payload, tray = false): THREE.Object3D {
  if (p.type === "stack" && p.rack) {
    // The taco rack off the comal, carried whole: four slots in hand, as many as it holds over a tray.
    const g = makeTacoRack(p.layers.map((l) => l.piece), tray ? 0 : RACK_SLOTS).group;
    if (!tray) g.scale.setScalar(GRILL_SCALE * RACK_SCALE);
    return g;
  }
  if (p.type === "stack") return stackVisual(p.layers);
  if (p.type === "piece") {
    const o = makeFood(p.piece, "top");
    o.scale.setScalar(GRILL_SCALE);
    return o;
  }
  if (p.type === "fries") {
    // Straight from the freezer or the basket: loose fries, no carton yet.
    const f = makeFries(false, "L", p.amount, { fry: p.fry });
    f.userData.setCook(p.cook);
    f.scale.setScalar(SCALE.fries);
    return f;
  }
  if (p.type === "salt" || p.type === "curds" || p.type === "gravy") return counter.fryTopMesh(p.type === "salt" && p.sugar ? "sugar" : p.type);
  if (p.type === "carton") {
    const f = makeFries(true, p.size, p.fill, p);
    f.userData.setCook(p.cook);
    f.scale.setScalar(SCALE.fries * f.userData.sizeScale);
    return f;
  }
  if (p.type === "empty") {
    const o = p.kind === "cup" ? makeCup(null, false, p.size) : makeCarton(p.size as FriesSize);
    o.scale.multiplyScalar(p.kind === "cup" ? CUP_IN_HAND : SCALE.fries);
    if (p.kind === "cup" && p.ice) dressCup(o as Parameters<typeof dressCup>[0], { ice: true, lid: false });
    return o;
  }
  if (p.type === "lid") return counter.extraMesh("lid", p.size);
  if (p.type === "ice") return counter.extraMesh(p.type);
  if (p.type === "garnish") {
    const g = makeGarnish(p.kind);
    g.scale.setScalar(1.6);
    return g;
  }
  const c = makeCup(p.flavor, p.lid, p.size);
  c.scale.multiplyScalar(CUP_IN_HAND);
  c.userData.setFill(p.fill);
  dressCup(c, p);
  return c;
}

function startHold(pt: Pointer, payload: Payload): void {
  const counterObj = payloadVisual(payload);
  const trayObj = payloadVisual(payload, true);
  if (payload.type !== "piece" && payload.type !== "stack") trayObj.scale.multiplyScalar(0.55);
  if (payload.type === "stack") trayObj.scale.setScalar(1);
  // Over the trays, a cup or carton shows exactly where it will land, at the size it lands at.
  if (payload.type === "drink" || payload.type === "carton") trayObj.scale.setScalar(1);
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
    counter.moveHeld(null);
    counter.highlightTrash(false);
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    const p = pt.held.payload;
    trayView.showGhost(slot >= 0 ? slot : game.active, pt.held.trayObj, p.type === "drink" ? "cup" : p.type === "carton" ? "fries" : "burger");
  } else {
    trayView.showGhost(-1, null);
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    counter.moveHeld(ndcIn(bands.counter, pt.x, pt.y));
    iceThroughBin(pt);
    counter.highlightTrash(band === "counter" && counter.overTrash(g));
  }
}

/**
 * An empty cup carried over the ice bin scoops its own ice (after build #86): no spoon needed. It
 * works for a cup from the stack or one picked up off the counter that has nothing in it yet.
 */
function iceThroughBin(pt: Pointer): void {
  const h = pt.held;
  if (!h || counter.page !== 0) return;
  const p = h.payload;
  const empty = p.type === "empty" && p.kind === "cup" && !p.ice;
  const bare = p.type === "drink" && !p.ice && !p.lid && p.fill < 0.02;
  if (!empty && !bare) return;
  if (counter.hit(ndcIn(bands.counter, pt.x, pt.y))?.type !== "ice") return;
  p.ice = true;
  dressCup(h.counterObj as Parameters<typeof dressCup>[0], { ice: true, lid: false });
  dressCup(h.trayObj as Parameters<typeof dressCup>[0], { ice: true, lid: false });
  sfx.ice();
  buzz(8);
}

/** Carrying something over a counter button for a moment switches to that counter, so items can move between counters. */
let hover = { tab: -1, since: 0 };
function hoverTab(pt: Pointer, now: number): void {
  const cx = pt.x + colX;
  const tab = ui.tabs.findIndex((t) => {
    if (t.style.pointerEvents === "none") return false;
    const r = t.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && pt.y >= r.top && pt.y <= r.bottom;
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
  if (payload.type === "stack" && payload.whole && payload.fromPlate !== slot && s.plate.layers.length) {
    showHint("That tray already has something on it.", 2);
    return false;
  }
  if (payload.type === "stack" && isTacoRun(payload.layers)) {
    // Tacos (the rack off the comal, or one tortilla built there) join the tacos on the tray. They
    // only start to go cold here, and the run is as fresh as its newest taco.
    if (s.plate.layers.length && !isTacoRun(s.plate.layers)) {
      showHint("That tray already has something else on it.", 2);
      return false;
    }
    s.plate.layers.splice(0, s.plate.layers.length, ...joinTacos(s.plate.layers, payload.layers));
    syncTray(slot, true);
    trayView.plates[slot].kick(0.4);
    if (payload.rack) hintOnce("rack-tray", game.slots[slot].order?.layers.some((l) => isSauce(l.kind)) ? "On the tray. Squeeze the salsa or crema over them here: sauce goes on at the tray." : "On the tray. Tacos only start to cool once they leave the comal.", 3.5);
    return true;
  }
  if (payload.type === "stack") {
    // A cheesed patty off the grill goes on as one piece.
    for (const l of payload.layers) s.plate.layers.push(l);
    syncTray(slot, true);
    trayView.plates[slot].kick(0.4);
    return true;
  }
  if (payload.type === "piece") {
    const p = payload.piece;
    const l = landing(s.plate.layers, p, spread);
    s.plate.layers.push(l);
    // A taco run on a tray goes cold from the last taco placed, not the first.
    if (TORTILLAS.has(p.kind) && isTacoRun(s.plate.layers)) freshen(s.plate.layers, [l]);
    if (SCOOPED.has(p.kind)) hintOnce("scoop", p.kind === "tuna" ? "One scoop of tuna. A Tuna Melt takes two: drag another." : "One scoop: one per taco. Drag another for the next taco.", 3);
    syncTray(slot, true);
    trayView.plates[slot].kick(COUNTED.has(p.kind) ? 0.05 : spread * 4);
    if (s.order && COUNTED.has(p.kind)) {
      // Count them on: "Pickles 2 of 3".
      let n = 0;
      for (let i = s.plate.layers.length - 1; i >= 0 && s.plate.layers[i].piece.kind === p.kind; i--) n++;
      const want = s.order.layers.find((e) => e.kind === p.kind)?.count;
      if (want) showHint(`${KIND_LABEL[p.kind]} ${n} of ${want}${n > want ? ": generous!" : ""}`, 1.2);
    }
    return true;
  }
  if (payload.type === "fries") {
    showHint("Fries go in a carton first. Grab one from the carton stacks, front left.", 2.5);
    return false;
  }
  if (payload.type === "empty") {
    showHint("Fill it first!", 1.5);
    return false;
  }
  if (payload.type === "ice" || payload.type === "lid") {
    showHint(`That goes on a cup at the drinks counter.`, 1.5);
    return false;
  }
  if (payload.type === "garnish") {
    // The local drink's garnish (after build #78) goes on once the drink is on the tray.
    const d = s.plate.drink;
    const label = GARNISH_LABEL[payload.kind].toLowerCase();
    if (!d) showHint(`Put the drink on the tray first, then the ${label}.`, 2);
    else if (d.garnish) showHint(`It already has its ${label}.`, 1.5);
    else {
      d.garnish = payload.kind;
      syncTray(slot, false);
      sfx.plop();
      return true;
    }
    return false;
  }
  if (payload.type === "curds" || payload.type === "gravy") {
    if (!s.plate.fries) {
      showHint("That goes on fries.", 1.5);
      return false;
    }
    if (!topFries(s.plate.fries, payload.type)) return false;
    dropped = { place: { at: "tray", slot }, ref: s.plate.fries };
    syncTray(slot, false);
    return true;
  }
  if (payload.type === "salt") return false;
  if (payload.type === "carton") {
    if (s.plate.fries) {
      showHint("This tray already has fries.", 2);
      return false;
    }
    const { cook, size, fill, salt, curds, gravy, held } = payload;
    s.plate.fries = { cook, size, fill, salt, curds, gravy, held: held ?? 0, ...(payload.fry && payload.fry !== "fries" ? { fry: payload.fry } : {}) };
    dropped = { place: { at: "tray", slot }, ref: s.plate.fries };
  } else {
    if (s.plate.drink) {
      showHint("This tray already has a drink.", 2);
      return false;
    }
    if (!payload.flavor || payload.fill < 0.05) {
      showHint("Fill it first!", 1.5);
      return false;
    }
    s.plate.drink = { flavor: payload.flavor, fill: payload.fill, size: payload.size, ice: payload.ice, lid: payload.lid, ...(payload.garnish ? { garnish: payload.garnish } : {}) };
    dropped = { place: { at: "tray", slot }, ref: s.plate.drink };
    if (!payload.lid) hintOnce("lid", "Drinks need a lid before they go out.", 3);
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
  // Where it came from, for Undo; what it went into when that isn't food we can find again (see noteMove).
  const from = originOf(payload);
  let binned = false;
  dropped = null;
  if (payload.type === "salt") {
    // Salt goes on by shaking; letting go just puts the shaker back.
    (payload.sugar ? counter.sugarShaker : counter.shakerObj).visible = true;
    if (!pt.moved && dur < 450) nameBubble(pt, nameOf(payload));
    else if (!shaker.shakes && shaker.target) showHint(payload.sugar ? `Shake it over the ${counter.orchard ? "fritters" : "churros"} to sugar them.` : "Shake it over the fries to salt them.", 2);
    shaker.target = null;
    shaker.logged.clear();
    return;
  }

  // A tap (no drag) on a pan, a well, a bin or a stack only says what's in it (DESIGN §31): things
  // are placed by dragging them, a drag from a well being one scoop. A cup standing on the counter
  // says what's in it too.
  if (!pt.moved && dur < 450 && (from.at === "supply" || payload.type === "drink")) {
    nameBubble(pt, nameOf(payload));
    if (payload.type === "drink") restorePayload(payload);
    return;
  }

  if (band === "tray" || band === "customers") {
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    if (payload.type === "stack" && payload.layers[0]?.piece.kind === "dough" && paleSide(payload.layers[0].piece) < 0.12) hintOnce("raw-pie", "That one hasn't been in the oven yet!", 2);
    done = addToPlate(slot >= 0 ? slot : game.active, payload, has("steady") ? 0.03 : 0.08);
    if (done && slot >= 0) setActive(slot);
  } else if (band === "counter" && counter.middle === "oven" && counter.page === HOME_PAGE && (payload.type === "stack" || payload.type === "piece") && ovenDrop(pt, payload)) {
    done = true;
  } else if (band === "counter" && counter.middle === "press" && counter.page === HOME_PAGE && (payload.type === "stack" || payload.type === "piece") && pressDrop(pt, payload)) {
    done = true;
  } else if (band === "counter") {
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    // The griddle's plate stands well above the counter, so drops there are matched at its height.
    const gTop = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), GRILL_TOP);
    const station = payload.type === "empty" || payload.type === "carton" || payload.type === "drink" || payload.type === "ice" || payload.type === "lid" || payload.type === "curds" || payload.type === "gravy" || (payload.type === "fries" && payload.basket !== null);
    if (station) done = dropAtStation(payload, g);
    if (!station && counter.overRack(gTop) && (payload.type === "piece" || (payload.type === "stack" && !payload.rack))) {
      // The taco rack on the comal's warm end: tortillas stand in it, fillings go in it.
      done = rackDrop(payload);
      if (done) sfx.plop();
    } else if (!done && counter.overTrash(g)) {
      // Every counter has a trash slot along its front edge.
      sfx.thud();
      buzz(20);
      done = true;
      binned = true;
    } else if (station) {
      // Missed the station: it goes back where it came from below.
    } else if (payload.type === "stack" && !payload.rack) {
      // A single grill item can go back on the grill.
      const over = counter.overGrill(gTop);
      const [base, top] = payload.layers.map((l) => l.piece);
      const fits = payload.layers.length === 1 || (payload.layers.length === 2 && base.kind === "patty" && top.kind === "cheese");
      const filled = counter.middle === "comal" && TORTILLAS.has(base.kind) && payload.layers.slice(1).every((l) => COMAL_FILL.has(l.piece.kind)) && !counter.grillItemAt(gTop);
      if (over && filled) {
        // A filled tortilla (or a quesadilla) back on the comal, filling and all.
        counter.addGrillItem(onTortilla(payload.layers), over.x, over.z);
        sfx.sizzleHit();
        done = true;
      } else if (over && fits && GRILLABLE.has(base.kind) && grillSpotOk(base, over)) {
        counter.addGrillItem(base, over.x, over.z, top);
        sfx.sizzleHit();
        zoneHint(over.x);
        done = true;
      }
    } else if (payload.type === "piece") {
      const over = counter.overGrill(gTop);
      const under = over ? counter.grillItemAt(gTop) : null;
      const comal = counter.middle === "comal";
      const fryHit = counter.page === 2 ? counter.hit(ndcIn(bands.counter, pt.x, pt.y)) : null;
      if (fryHit?.type === "basket" && (payload.piece.kind === "corn" || payload.piece.kind === "tostada")) {
        // A corn tortilla in an empty basket fries into a tostada shell (Red Rock).
        const b = counter.baskets[fryHit.idx];
        if (b.loaded) showHint("Use an empty basket for the tostada.", 2);
        else {
          const shell = payload.piece.kind === "tostada" ? payload.piece : newPiece("tostada");
          counter.setBasketShell(fryHit.idx, shell);
          Object.assign(b, { loaded: true, down: false, goldenRung: false, cook: 0, amount: 0 });
          sfx.plop();
          hintOnce("tostada", `Tap the basket to lower it. The tostada is crisp and golden in about ${Math.round(10 * cookTime())} seconds.`, 3.5);
          done = true;
        }
      } else if (comal && under && TORTILLAS.has(under.piece.kind) && (COMAL_FILL.has(payload.piece.kind) || isSauce(payload.piece.kind))) {
        // Fillings go on a tortilla on the comal: cheese for a quesadilla, or a taco built in place.
        if (under.piece.folded) showHint("It's folded already. Fill it before you fold it.", 2);
        else if (isSauce(payload.piece.kind)) showHint("Sauce goes on at the tray.", 1.5);
        else if ((under.piece.fill?.length ?? 0) >= 4) showHint("That's plenty on one tortilla.", 1.5);
        else {
          (under.piece.fill ??= []).push(payload.piece);
          sfx.plop();
          if (payload.piece.kind === "jack") hintOnce("quesa-fold", "Now fold it: drag the tortilla's edge across its middle. Then flip it once.", 4);
          else hintOnce("taco-fill", "Drag it by its middle into the taco rack on the warm end, or up to the tray. Dragging its edge across the middle folds it.", 4);
          done = true;
        }
      } else if (under && payload.piece.kind === "cheese" && counter.addTopping(under, payload.piece)) {
        sfx.plop();
        hintOnce("melt", "The cheese melts on the hot patty. Drag them up together when it slumps.", 3.5);
        done = true;
      } else if (over && payload.piece.kind === "cheese") {
        showHint(under?.topping ? "That patty already has cheese." : "Drop the cheese right on a patty to melt it.", 2);
      } else if (under && counter.canStack(under, payload.piece)) {
        // Buns on buns, patties on patties: a stack to hold for later. Only the bottom one cooks.
        counter.addGrillItem(payload.piece, under.x, under.z, undefined, under);
        sfx.plop();
        hintOnce("grill-stack", "Stacked. Only the bottom one touches the grill; park stacks on the warm end to hold them.", 3.5);
        done = true;
      } else if (over && GRILLABLE.has(payload.piece.kind)) {
        if (grillSpotOk(payload.piece, over)) {
          counter.addGrillItem(payload.piece, over.x, over.z);
          if (!payload.fromGrill) sfx.sizzleHit();
          else sfx.thud();
          zoneHint(over.x);
          done = true;
        }
      } else if (fast && !payload.fromGrill) {
        // Flicked up from a bin: toss it onto the active plate, a little less neatly.
        done = addToPlate(game.active, payload, has("steady") ? 0.08 : 0.22);
        sfx.whoosh();
      } else if (over && !GRILLABLE.has(payload.piece.kind)) {
        showHint(comal && COMAL_FILL.has(payload.piece.kind) ? `Drop the ${KIND_LABEL[payload.piece.kind].toLowerCase()} on a tortilla, or drag it up to the tray.` : `${KIND_LABEL[payload.piece.kind]} doesn't go on the ${comal ? "comal" : "grill"}. Drag it up to the tray.`, 2.5);
      }
    } else if (payload.type === "fries" && payload.basket === null && payload.fry === "zucchini" && counter.page === 2 && counter.overBatter(g)) {
      // Zucchini is dropped in the batter bowl (Orchard Isle), and picked up again battered.
      if (counter.batter + payload.amount > 1 + 1e-6) showHint("The bowl's full. Fry what's in it first.", 2);
      else {
        counter.setBatter(counter.batter + payload.amount);
        dropped = { place: { at: "batter" }, moved: payload.amount };
        sfx.plop();
        buzz(8);
        if (!payload.fromBatter) hintOnce("battered", "In the batter. Pick it up again and drop it in a basket to fry.", 3);
        done = true;
      }
    } else if (payload.type === "fries" && payload.basket === null) {
      const hit = counter.hit(ndcIn(bands.counter, pt.x, pt.y));
      if (hit?.type === "basket") {
        const b = counter.baskets[hit.idx];
        if (b.loaded && b.amount > 1 - FRIES_SCOOP / 2) showHint("That basket is full.", 1.5);
        else if (b.shell) showHint("There's a tostada frying in that basket.", 2);
        else if (payload.fry === "zucchini" && payload.cook < 0) showHint("Batter it first: drop the zucchini in the bowl at the back right, then pick it up again.", 2.5);
        else if (b.loaded && b.fry !== (payload.fry ?? "fries")) showHint(`Keep ${FRY_LABEL[b.fry].toLowerCase()} and ${FRY_LABEL[payload.fry ?? "fries"].toLowerCase()} in separate baskets.`, 2.5);
        else {
          b.fry = payload.fry ?? "fries";
          // Each scoop is one small carton's worth; raw fries added later pull the batch's cook back.
          const had = b.loaded ? b.amount : 0;
          b.cook = had ? (b.cook * had) / (had + payload.amount) : 0;
          b.amount = Math.min(1, had + payload.amount);
          dropped = { place: { at: "basket", i: hit.idx }, moved: b.amount - had };
          if (!b.loaded) Object.assign(b, { loaded: true, down: false, goldenRung: false });
          if (b.down) sfx.sizzleHit();
          else sfx.plop();
          done = true;
          hintOnce("fries-scoop", "One scoop fills a small carton, two a medium, three a large. Tap the basket to lower it.", 4);
        }
      }
    }
  }

  if (!done) restorePayload(payload);
  else noteMove(payload, from, binned);
}

/** Put a carried thing back where it came from (let go where it can't go). */
function restorePayload(payload: Payload): void {
  // Put things back where they came from.
  if (payload.type === "piece" && payload.fromGrill) backOnGrill(payload.piece, payload.fromGrill);
  if (payload.type === "piece" && payload.fromPlate !== undefined) {
    // Lifted off a tray and dropped nowhere useful: it goes back on top.
    game.slots[payload.fromPlate].plate.layers.push({ piece: payload.piece, offX: 0, offZ: 0 });
    syncTray(payload.fromPlate, false);
  }
  if (payload.type === "stack" && payload.grill) {
    const [base, top] = payload.layers.map((l) => l.piece);
    if (TORTILLAS.has(base.kind)) counter.addGrillItem(onTortilla(payload.layers), payload.grill.x, payload.grill.z);
    else counter.addGrillItem(base, payload.grill.x, payload.grill.z, top);
  }
  if (payload.type === "piece" && payload.fromBasket !== undefined) {
    counter.setBasketShell(payload.fromBasket, payload.piece);
    Object.assign(counter.baskets[payload.fromBasket], { loaded: true, down: false });
  }
  if (payload.type === "stack" && payload.fromPlate !== undefined) {
    game.slots[payload.fromPlate].plate.layers.push(...payload.layers);
    syncTray(payload.fromPlate, false);
  }
  if (payload.type === "stack" && payload.bay !== undefined) counter.setBay(counter.bays[payload.bay], payload.layers);
  if (payload.type === "stack" && payload.board) counter.setBoard(payload.layers);
  if (payload.type === "stack" && payload.rack) counter.setRack(payload.layers);
  if (payload.type === "stack" && payload.peel) counter.setPeel(payload.layers);
  if (payload.type === "stack" && payload.spot !== undefined) counter.setSpot(payload.spot, payload.layers);
  // Battered zucchini dropped nowhere useful goes back in the bowl.
  if (payload.type === "fries" && payload.fromBatter) counter.setBatter(Math.min(1, counter.batter + payload.amount));
  if (payload.type === "fries" && payload.basket !== null) {
    const b = counter.baskets[payload.basket];
    Object.assign(b, { loaded: true, cook: payload.cook, amount: payload.amount, fry: payload.fry ?? "fries" });
  }
  if (payload.type === "drink") {
    const { flavor, fill, size, ice, lid, from, fromPlate, garnish } = payload;
    // Lifted off a tray: back on the tray. Otherwise back where it stood (nothing else can have taken the spot meanwhile).
    if (fromPlate !== undefined && flavor) {
      game.slots[fromPlate].plate.drink = { flavor, fill, size, ice, lid, ...(garnish ? { garnish } : {}) };
      syncTray(fromPlate, false);
    } else if (from) counter.placeCup({ flavor, fill, size, ice, lid }, new THREE.Vector3(from.x, 0.3, from.z));
  }
  if (payload.type === "carton") {
    const { size, cook, fill, salt, curds, gravy, fromPlate } = payload;
    const held = payload.held ?? 0;
    const fry = payload.fry ?? "fries";
    if (fromPlate !== undefined) {
      game.slots[fromPlate].plate.fries = { size, cook, fill, salt, curds, gravy, held, ...(fry !== "fries" ? { fry } : {}) };
      syncTray(fromPlate, false);
    } else {
      Object.assign(counter.packs[payload.pack], { size, cook, fill, salt, curds, gravy, fry, held });
      counter.syncPack(payload.pack);
    }
  }
}

// ---------------------------------------------------------------------------
// Undo (DESIGN §31). Every drop that lands is noted with where the thing came from and where it
// went; the header's Undo button carries the newest one back, animated, the way it came. Food is
// kept by reference, so whatever cooked or burned since stays as it is. Serving forgets that tray's
// moves; cooking, burning and the verbs on food in place (flip, fold, smash, crack, cut, press) are
// never undone. The rules are in src/game/undo.ts.

/** What a drop went into, when it isn't food that can be found again by its pieces (set by addToPlate and dropAtStation). */
let dropped: { place: Place; ref?: object; moved?: number; pack?: { fill: number; cook: number; fry: FryKind } } | null = null;

const SUPPLY: Place = { at: "supply" };
const TRASH: Place = { at: "trash" };
const inLs = (ls: readonly Layer[], p: Piece) => ls.some((l) => l.piece === p);

/** Where a carried thing came from. */
function originOf(p: Payload): Place {
  switch (p.type) {
    case "piece":
      if (p.fromGrill) return { at: "grill", x: p.fromGrill.x, z: p.fromGrill.z };
      if (p.fromPlate !== undefined) return { at: "tray", slot: p.fromPlate };
      if (p.fromBasket !== undefined) return { at: "basket", i: p.fromBasket };
      return SUPPLY;
    case "stack":
      if (p.grill) return { at: "grill", x: p.grill.x, z: p.grill.z };
      if (p.fromPlate !== undefined) return { at: "tray", slot: p.fromPlate };
      if (p.bay !== undefined) return { at: "bay", i: p.bay };
      if (p.board) return { at: "board" };
      if (p.rack) return { at: "rack" };
      if (p.peel) return { at: "peel" };
      if (p.spot !== undefined) return { at: "spot", i: p.spot };
      return SUPPLY;
    case "fries":
      return p.basket !== null ? { at: "basket", i: p.basket } : p.fromBatter ? { at: "batter" } : SUPPLY;
    case "carton":
      return p.fromPlate !== undefined ? { at: "tray", slot: p.fromPlate } : p.pack >= 0 ? { at: "pack", i: p.pack } : SUPPLY;
    case "drink":
      return p.fromPlate !== undefined ? { at: "tray", slot: p.fromPlate } : p.from ? { at: "cup", x: p.from.x, z: p.from.z } : SUPPLY;
    default:
      return SUPPLY;
  }
}

/** Where a piece of food is now: on a tray, on the grill or comal (on its own, as a cheese slice or a tortilla's filling), in the press, on the board, in the rack, on the peel or in the oven, or frying as a shell. */
function whereFood(p: Piece): Place | null {
  for (let i = 0; i < 3; i++) if (inLs(game.slots[i].plate.layers, p)) return { at: "tray", slot: i };
  for (const it of counter.grillItems) if (it.piece === p || it.topping?.piece === p || it.piece.fill?.includes(p)) return { at: "grill", x: it.x, z: it.z };
  for (let i = 0; i < counter.bayCount; i++) if (inLs(counter.bays[i].layers, p)) return { at: "bay", i };
  if (counter.board?.on && inLs(counter.board.layers, p)) return { at: "board" };
  if (inLs(counter.bench.layers, p)) return { at: "bench" };
  if (inLs(counter.rack.layers, p)) return { at: "rack" };
  if (inLs(counter.peel.layers, p)) return { at: "peel" };
  for (let i = 0; i < counter.ovenCount; i++) if (inLs(counter.ovenSpots[i].layers, p)) return { at: "spot", i };
  const bi = counter.baskets.findIndex((b) => b.shell === p);
  return bi >= 0 ? { at: "basket", i: bi } : null;
}

/** A drop landed: note it, so Undo can carry it back. */
function noteMove(p: Payload, from: Place, binned: boolean): void {
  const d = dropped;
  dropped = null;
  if (p.type === "piece" || p.type === "stack") {
    const layers = p.type === "piece" ? [{ piece: p.piece, offX: 0, offZ: 0 }] : p.layers;
    const to = binned ? TRASH : whereFood(layers[0].piece);
    if (to) history.push({ what: { k: "food", layers: [...layers], rack: p.type === "stack" && !!p.rack }, from, to });
    return;
  }
  if (binned) {
    if (p.type === "drink") history.push({ what: { k: "drink", ref: null, p }, from, to: TRASH });
    else if (p.type === "carton") history.push({ what: { k: "carton", ref: null, p }, from, to: TRASH });
    else if (p.type === "fries") history.push({ what: { k: "fries", p, moved: p.amount }, from, to: TRASH });
    return;
  }
  if (!d) return;
  if (p.type === "drink" || (p.type === "empty" && p.kind === "cup")) history.push({ what: { k: "drink", ref: d.ref ?? null, p }, from, to: d.place });
  else if (p.type === "carton" || p.type === "empty") history.push({ what: { k: "carton", ref: d.ref ?? null, p }, from, to: d.place });
  else if (p.type === "fries") history.push({ what: { k: "fries", p, moved: d.moved ?? p.amount, pack: d.pack }, from, to: d.place });
  else if ((p.type === "ice" || p.type === "lid" || p.type === "curds" || p.type === "gravy") && d.ref) history.push({ what: { k: "extra", what: p.type, ref: d.ref, p }, from, to: d.place });
}

/** A pie moved with the peel, or a squeeze of sauce: noted where it happens (they don't go through finishHold). */
function noteFood(layers: Layer[], from: Place, to: Place): void {
  history.push({ what: { k: "food", layers: [...layers] }, from, to });
}
const restPlace = (): Place => (counter.rest === counter.board ? { at: "board" } : { at: "bench" });

/** The drink or carton a move left, as it is now. */
type CupData = { flavor: DrinkId | null; fill: number; size: Size; ice: boolean; lid: boolean };
type CartonData = { size: FriesSize; cook: number; fill: number; salt: number; curds: boolean; gravy: boolean; fry: FryKind; held?: number };

/** Is the moved thing still where the move put it? */
function stillThere(m: Move<Moved>): boolean {
  const w = m.what;
  const to = m.to;
  switch (w.k) {
    case "food": {
      const at = whereFood(w.layers[0].piece);
      return to.at === "trash" ? !at : !!at && samePlace(at, to);
    }
    case "salt": {
      if ((w.f.salt ?? 0) <= w.before) return false;
      if (to.at === "pack") return counter.packs[to.i] === w.f && !!counter.packs[to.i].size;
      return to.at === "tray" && game.slots[to.slot].plate.fries === w.f;
    }
    case "cut": {
      const at = whereFood(w.pieces[0]);
      return !!at && samePlace(at, to) && w.pieces.every((p, i) => (p.cuts ?? 0) > (w.was[i].cuts ?? 0) || (!!p.cut && !w.was[i].cut));
    }
    case "sauce": {
      const at = whereFood(w.piece);
      return !!at && samePlace(at, to) && (w.before === 0 || (w.piece.stroke?.length ?? 0) >= w.before);
    }
    case "drink":
      if (to.at === "trash") return true;
      if (to.at === "tray") return game.slots[to.slot].plate.drink === w.ref;
      return counter.cups.includes(w.ref as DrinkCup);
    case "carton":
      if (to.at === "trash") return true;
      if (to.at === "tray") return game.slots[to.slot].plate.fries === w.ref;
      return to.at === "pack" && !!counter.packs[to.i]?.size;
    case "fries": {
      const fry = w.p.fry ?? "fries";
      if (to.at === "trash") return true;
      if (to.at === "basket") {
        const b = counter.baskets[to.i];
        return b.loaded && !b.shell && b.fry === fry && b.amount >= w.moved - 0.02;
      }
      if (to.at === "pack") {
        const pk = counter.packs[to.i];
        return !!pk.size && pk.fry === fry && pk.fill > (w.pack?.fill ?? 0) + 0.01;
      }
      return to.at === "batter" && counter.batter >= w.moved - 0.02;
    }
    case "extra": {
      if (!w.ref[w.what]) return false;
      if (to.at === "cup") return counter.cups.includes(w.ref as DrinkCup);
      if (to.at === "pack") return counter.packs[to.i] === w.ref && !!counter.packs[to.i].size;
      return to.at === "tray" && game.slots[to.slot].plate.fries === w.ref;
    }
  }
}

/** Can the place it came from take it back? */
function canReturn(m: Move<Moved>): boolean {
  const f = m.from;
  const w = m.what;
  switch (f.at) {
    case "supply":
    case "knife":
      return true;
    case "tray": {
      const s = game.slots[f.slot];
      if (!s.order || s.leaving) return false;
      if (w.k === "drink") return !s.plate.drink;
      if (w.k === "carton") return !s.plate.fries;
      return true;
    }
    case "grill": {
      if (counter.middle !== "grill" && counter.middle !== "comal") return false;
      const under = counter.grillItemAt(counter.world(HOME_PAGE, f.x, GRILL_TOP, f.z));
      if (!under || w.k !== "food") return !under;
      return w.layers.length === 1 && counter.canStack(under, w.layers[0].piece);
    }
    case "bay":
      return f.i < counter.bayCount && !counter.bays[f.i].closed && !counter.bays[f.i].layers.length;
    case "board":
      return !!counter.board?.on && !counter.board.layers.length;
    case "bench":
      return !counter.bench.layers.length;
    case "rack":
      return !counter.rack.layers.length;
    case "peel":
      return !counter.peel.layers.length && !counter.peelHeld;
    case "spot":
      return f.i < counter.ovenCount && !counter.ovenSpots[f.i].layers.length;
    case "basket": {
      const b = counter.baskets[f.i];
      if (w.k === "fries") return !b.shell && (!b.loaded || (b.fry === (w.p.fry ?? "fries") && b.amount + w.moved <= 1.02));
      return !b.loaded && !b.shell;
    }
    case "pack":
      return !counter.packs[f.i].size;
    case "cup":
      return !counter.cupAt(new THREE.Vector3(f.x, 0.5, f.z));
    case "batter":
      return w.k === "fries" && counter.batter + w.moved <= 1.02;
    case "trash":
      return false;
  }
}
const undoOk = (m: Move<Moved>): boolean => stillThere(m) && canReturn(m);

/** Is there something to undo now? (The header button greys out when not.) */
function canUndo(): boolean {
  // Never while something is in the hand or flying back: every move of a thing in the air looks
  // stale, and asking would drop them all (the cause of undo losing its history after build #82).
  return game.phase === "playing" && !sauceDrag && !ptr && !fly && !eggHand && !!history.top(undoOk);
}

/** Take the moved thing out of where it went. Returns what to show flying back, and how to put it back. */
function takeBack(m: Move<Moved>): { show: Payload | THREE.Object3D; put: () => void } {
  const w = m.what;
  const to = m.to;
  const from = m.from;
  if (w.k === "food") {
    const set = new Set(w.layers.map((l) => l.piece));
    const strip = (ls: Layer[]) => ls.filter((l) => !set.has(l.piece));
    if (to.at === "tray") {
      const ls = game.slots[to.slot].plate.layers;
      ls.splice(0, ls.length, ...strip(ls));
      syncTray(to.slot, false);
    } else if (to.at === "grill") {
      for (const it of [...counter.grillItems]) {
        if (set.has(it.piece)) {
          if (w.layers.length > 1) it.piece.fill = undefined;
          counter.removeGrillItem(it);
        } else {
          if (it.topping && set.has(it.topping.piece)) counter.removeTopping(it);
          if (it.piece.fill?.some((p) => set.has(p))) {
            const rest = it.piece.fill.filter((p) => !set.has(p));
            it.piece.fill = rest.length ? rest : undefined;
          }
        }
      }
    } else if (to.at === "bay") counter.setBay(counter.bays[to.i], strip(counter.bays[to.i].layers));
    else if (to.at === "board") counter.setBoard(strip(counter.board!.layers));
    else if (to.at === "bench") counter.setRest(strip(counter.bench.layers));
    else if (to.at === "rack") counter.setRack(strip(counter.rack.layers));
    else if (to.at === "peel") counter.setPeel(strip(counter.peel.layers));
    else if (to.at === "spot") counter.setSpot(to.i, strip(counter.ovenSpots[to.i].layers));
    else if (to.at === "basket") {
      counter.setBasketShell(to.i, null);
      Object.assign(counter.baskets[to.i], { loaded: false, down: false });
    }
    const layers = w.layers;
    const show: Payload = layers.length === 1 && !w.rack ? { type: "piece", piece: layers[0].piece, fromGrill: null } : { type: "stack", layers, rack: w.rack };
    return { show, put: () => putFood(from, layers, !!w.rack) };
  }
  if (w.k === "salt") {
    // The salt (or sugar) comes off again, and the shaker flies back to its spot.
    w.f.salt = w.before;
    if (to.at === "pack") counter.syncPack(to.i);
    else if (to.at === "tray") syncTray(to.slot, false);
    return { show: { type: "salt", sugar: w.sugar }, put: () => {} };
  }
  if (w.k === "cut") {
    // The halves go back together (or the quarters), and the knife flies back to its spot.
    w.pieces.forEach((p, i) => {
      const was = w.was[i];
      p.cut = was.cut || undefined;
      p.cutQ = was.cutQ;
      p.cuts = was.cuts;
    });
    const bd = to.at === "peel" ? counter.peel : counter.board!;
    if (w.pieces[0].kind === "dough") counter.updatePie(bd);
    else counter.setBoard([...bd.layers]);
    const knife = makeKnife();
    knife.scale.setScalar(KNIFE_SCALE);
    return { show: knife, put: () => {} };
  }
  if (w.k === "sauce") {
    const at = whereFood(w.piece)!;
    const holder = at.at === "tray" ? game.slots[at.slot].plate.layers : at.at === "peel" ? counter.peel.layers : at.at === "board" ? counter.board!.layers : at.at === "bay" ? counter.bays[at.i].layers : counter.bench.layers;
    if (w.before === 0) {
      const i = holder.findIndex((l) => l.piece === w.piece);
      if (i >= 0) holder.splice(i, 1);
    } else w.piece.stroke!.length = w.before;
    if (at.at === "tray") syncTray(at.slot, false);
    else if (at.at === "peel") counter.setPeel([...holder]);
    else if (at.at === "board") counter.setBoard([...holder]);
    else if (at.at === "bay") counter.setBay(counter.bays[at.i], [...holder]);
    else counter.setRest([...holder]);
    const bottle = w.kind === "redsauce" ? makeSauceLadle() : counter.sauceBottle(w.kind);
    return { show: bottle, put: () => {} };
  }
  if (w.k === "drink") {
    let c: CupData;
    const pp = w.p as Extract<Payload, { type: "drink" | "empty" }>;
    if (to.at === "tray") {
      const d = game.slots[to.slot].plate.drink!;
      c = { flavor: d.flavor, fill: d.fill, size: d.size, ice: !!d.ice, lid: !!d.lid };
      game.slots[to.slot].plate.drink = null;
      syncTray(to.slot, false);
    } else if (to.at === "cup") {
      const cup = w.ref as DrinkCup;
      c = { flavor: cup.flavor, fill: cup.fill, size: cup.size, ice: cup.ice, lid: cup.lid };
      counter.removeCup(cup);
    } else c = pp.type === "drink" ? { flavor: pp.flavor, fill: pp.fill, size: pp.size, ice: pp.ice, lid: pp.lid } : { flavor: null, fill: 0, size: pp.size, ice: !!pp.ice, lid: false };
    const put = () => {
      if (from.at === "tray") {
        if (c.flavor) game.slots[from.slot].plate.drink = { flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid };
        syncTray(from.slot, true);
      } else if (from.at === "cup") counter.placeCup(c, new THREE.Vector3(from.x, 0.3, from.z));
    };
    return { show: { type: "drink", ...c, from: null }, put };
  }
  if (w.k === "carton") {
    let c: CartonData;
    const pp = w.p as Extract<Payload, { type: "carton" | "empty" }>;
    if (to.at === "tray") {
      const f = game.slots[to.slot].plate.fries!;
      c = { size: f.size, cook: f.cook, fill: f.fill, salt: f.salt ?? 0, curds: !!f.curds, gravy: !!f.gravy, fry: fryOf(f), held: f.held ?? 0 };
      game.slots[to.slot].plate.fries = null;
      syncTray(to.slot, false);
    } else if (to.at === "pack") {
      const pk = counter.packs[to.i];
      c = { size: pk.size!, cook: pk.cook, fill: pk.fill, salt: pk.salt, curds: pk.curds, gravy: pk.gravy, fry: pk.fry, held: pk.held };
      Object.assign(pk, EMPTY_PACK);
      counter.syncPack(to.i);
    } else c = pp.type === "carton" ? { size: pp.size, cook: pp.cook, fill: pp.fill, salt: pp.salt, curds: pp.curds, gravy: pp.gravy, fry: pp.fry ?? "fries", held: pp.held ?? 0 } : { size: pp.size as FriesSize, cook: 0, fill: 0, salt: 0, curds: false, gravy: false, fry: "fries" };
    const put = () => {
      if (from.at === "tray") {
        game.slots[from.slot].plate.fries = { size: c.size, cook: c.cook, fill: c.fill, salt: c.salt, curds: c.curds, gravy: c.gravy, held: c.held ?? 0, ...(c.fry !== "fries" ? { fry: c.fry } : {}) };
        syncTray(from.slot, true);
      } else if (from.at === "pack") {
        Object.assign(counter.packs[from.i], c);
        counter.syncPack(from.i);
      }
    };
    return { show: { type: "carton", ...c, pack: -1 }, put };
  }
  if (w.k === "fries") {
    const fry = w.p.fry ?? "fries";
    const moved = w.moved;
    if (to.at === "basket") {
      const b = counter.baskets[to.i];
      b.amount -= moved;
      if (b.amount < 0.02) Object.assign(b, { loaded: false, down: false, amount: 0, cook: 0 });
    } else if (to.at === "pack") {
      const pk = counter.packs[to.i];
      const was = w.pack ?? { fill: 0, cook: 0, fry: "fries" as FryKind };
      Object.assign(pk, { fill: was.fill, cook: was.cook, fry: was.fry });
      counter.syncPack(to.i);
    } else if (to.at === "batter") counter.setBatter(Math.max(0, counter.batter - moved));
    const put = () => {
      if (from.at === "basket") {
        const b = counter.baskets[from.i];
        if (b.loaded) b.amount = Math.min(1, b.amount + moved);
        else Object.assign(b, { loaded: true, down: false, cook: w.p.cook, amount: moved, fry, goldenRung: false });
      } else if (from.at === "batter") counter.setBatter(Math.min(1, counter.batter + moved));
    };
    return { show: { ...w.p, amount: moved }, put };
  }
  // A dressing: ice or a lid off a cup, curds or gravy off fries.
  w.ref[w.what] = false;
  if (to.at === "cup") dressCup((w.ref as DrinkCup).obj, w.ref as DrinkCup);
  else if (to.at === "pack") counter.syncPack(to.i);
  else if (to.at === "tray") syncTray(to.slot, false);
  return { show: w.p, put: () => {} };
}

/** Put food back where a move took it from. */
function putFood(from: Place, layers: Layer[], rack: boolean): void {
  switch (from.at) {
    case "tray": {
      const ls = game.slots[from.slot].plate.layers;
      if (rack || isTacoRun(layers)) ls.splice(0, ls.length, ...joinTacos(ls, layers));
      else ls.push(...layers);
      syncTray(from.slot, true);
      trayView.plates[from.slot].kick(0.3);
      break;
    }
    case "grill": {
      const [base, top] = layers.map((l) => l.piece);
      if (layers.length === 1) backOnGrill(base, from);
      else if (TORTILLAS.has(base.kind)) counter.addGrillItem(onTortilla(layers), from.x, from.z);
      else counter.addGrillItem(base, from.x, from.z, top);
      break;
    }
    case "bay":
      counter.setBay(counter.bays[from.i], layers);
      break;
    case "board":
      counter.setBoard(layers);
      break;
    case "bench":
      counter.setRest(layers);
      break;
    case "rack":
      counter.setRack(layers);
      break;
    case "peel":
      counter.setPeel(layers);
      break;
    case "spot":
      counter.setSpot(from.i, layers);
      break;
    case "basket":
      counter.setBasketShell(from.i, layers[0].piece);
      Object.assign(counter.baskets[from.i], { loaded: true, down: false });
      break;
  }
}

/** Where a place is in the counter scene (world), for the flight back; null for a tray. */
function placeWorld(place: Place, w: Moved): THREE.Vector3 | null {
  switch (place.at) {
    case "tray":
      return null;
    case "grill":
      return counter.world(HOME_PAGE, place.x, GRILL_TOP + 0.1, place.z);
    case "bay":
      return counter.bayPoint(place.i);
    case "board":
      return counter.boardPoint();
    case "bench":
      return counter.restPoint();
    case "rack":
      return counter.rackPoint();
    case "peel":
      return counter.peelPointWorld();
    case "spot":
      return counter.spotPoint(place.i);
    case "basket":
      return counter.baskets[place.i].obj.getWorldPosition(new THREE.Vector3());
    case "pack": {
      const pk = counter.packs[place.i];
      return new THREE.Vector3(pk.x, pk.y, pk.z);
    }
    case "cup":
      return new THREE.Vector3(place.x, 0.4, place.z);
    case "batter":
      return counter.batterPoint();
    case "trash":
      return counter.trashPoint().setY(0.3);
    case "knife":
      return counter.knifePoint();
    case "supply":
      return supplyWorld(w);
  }
}

/** The pan, bin, stack or bottle a thing came out of, world space. */
function supplyWorld(w: Moved): THREE.Vector3 | null {
  const proxy = (f: (h: Hit) => boolean) => counter.proxyPoint(f);
  switch (w.k) {
    case "food": {
      const p = w.layers[0].piece;
      if (p.kind === "dough") return counter.doughPoint();
      if (p.handmade && counter.tpressOn) return counter.tpressPoint();
      const b = counter.bins.find((x) => x.kind === p.kind);
      return b ? counter.world(HOME_PAGE, b.x, b.y, b.z) : null;
    }
    case "sauce":
      return w.kind === "redsauce" ? counter.potPoint() : (counter.bottles[w.kind]?.getWorldPosition(new THREE.Vector3()) ?? counter.caddyPoint());
    case "fries": {
      const fry = w.p.fry ?? "fries";
      return fry === "fries" ? counter.friesBinAt.clone() : (counter.fryBinAt[fry]?.clone() ?? null);
    }
    case "drink":
    case "carton": {
      const kind = w.k === "drink" ? "cup" : "carton";
      const size = (w.p as { size: Size }).size;
      const s = counter.stacks.find((x) => x.kind === kind && x.size === size) ?? counter.stacks.find((x) => x.kind === kind);
      return s ? new THREE.Vector3(s.x, 0.8, s.z) : null;
    }
    case "extra":
      return w.what === "lid" ? proxy((h) => h.type === "lids") : proxy((h) => h.type === w.what);
    case "cut":
      return counter.knifePoint();
    case "salt":
      return w.sugar ? counter.sugarShaker.getWorldPosition(new THREE.Vector3()) : counter.shakerObj.getWorldPosition(new THREE.Vector3());
  }
}

/** The counter page a world point is on. */
const pageOf = (v: THREE.Vector3): number => {
  let best = 0;
  for (let i = 1; i < PAGES.length; i++) if (Math.abs(v.x - pageX(i)) < Math.abs(v.x - pageX(best))) best = i;
  return best;
};

/** A screen point (column coordinates) of a world point in a band. */
function screenOf(band: "counter" | "tray", v: THREE.Vector3): { x: number; y: number } {
  const cam = band === "counter" ? counter.camera : trayView.camera;
  cam.updateMatrixWorld();
  const p = v.clone().project(cam);
  const r = bands[band];
  return { x: ((p.x + 1) / 2) * r.w, y: r.y + ((1 - p.y) / 2) * r.h };
}
/** Where a place shows on screen now (a tray's food spot, or a point on the counter). */
function placeScreen(place: Place, w: Moved): { x: number; y: number } | null {
  if (place.at === "tray") {
    const b = trayView.plates[place.slot].burger;
    b.updateWorldMatrix(true, false);
    const e = b.matrixWorld.elements;
    return screenOf("tray", new THREE.Vector3(e[12], 0.3, e[14]));
  }
  const v = placeWorld(place, w);
  return v ? screenOf("counter", v) : null;
}

/**
 * The thing flying back (Undo): drawn in the counter scene over the counter and floating over the
 * tray band above it, from where it is to where it came from, then put there.
 */
interface Fly {
  counterObj: THREE.Object3D;
  trayObj: THREE.Object3D;
  kind: "burger" | "cup" | "fries";
  from: () => { x: number; y: number } | null;
  to: () => { x: number; y: number } | null;
  slot: number;
  t: number;
  dur: number;
  done: () => void;
}
let fly: Fly | null = null;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function updateFly(dt: number): void {
  const f = fly;
  if (!f) return;
  f.t = Math.min(1, f.t + dt / f.dur);
  const a = f.from();
  const b = f.to();
  if (!a || !b || f.t >= 1) return finishFly();
  const k = easeInOut(f.t);
  // A little hop on the way, so it reads as carried back.
  const x = a.x + (b.x - a.x) * k;
  const y = a.y + (b.y - a.y) * k - Math.sin(Math.PI * f.t) * 46;
  if (y >= bands.counter.y) {
    trayView.showGhost(-1, null);
    counter.moveHeld(ndcIn(bands.counter, x, y));
  } else {
    counter.moveHeld(null);
    trayView.showGhost(f.slot, f.trayObj, f.kind);
    trayView.floatGhost(ndcIn(bands.tray, x, Math.max(bands.tray.y + 4, y)));
  }
}

/** Land whatever is flying back now (a new touch, another undo, or a serve doesn't wait for it). */
function finishFly(): void {
  const f = fly;
  if (!f) return;
  fly = null;
  counter.setHeld(null);
  trayView.floatGhost(null);
  trayView.showGhost(-1, null);
  disposeObject(f.trayObj);
  f.done();
}

/** The Undo button: carry the newest move back. */
function undoLast(): void {
  if (game.phase !== "playing") return;
  finishFly();
  if (sauceDrag || ptr) return;
  disarm();
  const m = history.pop(undoOk);
  if (!m) return;
  const start = placeScreen(m.to, m.what);
  const { show, put } = takeBack(m);
  // Show where it goes: carried back to a counter that isn't in view, the counter comes round.
  const dest = m.from.at === "tray" ? null : placeWorld(m.from, m.what);
  const src = m.to.at === "tray" || m.to.at === "trash" ? null : placeWorld(m.to, m.what);
  const page = dest ? pageOf(dest) : src ? pageOf(src) : counter.page;
  if (page !== counter.page) goToPage(page);
  const counterObj = show instanceof THREE.Object3D ? show : payloadVisual(show);
  const trayObj = show instanceof THREE.Object3D ? show.clone() : payloadVisual(show, true);
  if (!(show instanceof THREE.Object3D) && show.type !== "piece" && show.type !== "stack" && show.type !== "drink" && show.type !== "carton") trayObj.scale.multiplyScalar(0.55);
  counter.setHeld(counterObj);
  const kind = !(show instanceof THREE.Object3D) && show.type === "drink" ? "cup" : !(show instanceof THREE.Object3D) && show.type === "carton" ? "fries" : "burger";
  const slot = m.from.at === "tray" ? m.from.slot : m.to.at === "tray" ? m.to.slot : game.active;
  // From the trash, it rises out of the chute; to the pan, it sinks back in.
  const startAt = start ?? placeScreen(m.from, m.what);
  fly = {
    counterObj,
    trayObj,
    kind,
    slot,
    from: () => (m.to.at === "trash" ? placeScreen(TRASH, m.what) : m.to.at === "tray" ? startAt : placeScreen(m.to, m.what)),
    to: () => placeScreen(m.from, m.what) ?? startAt,
    t: 0,
    dur: 0.42,
    done: () => {
      put();
      sfx.plop();
      if (m.from.at === "tray") trayView.plates[m.from.slot].kick(0.3);
    },
  };
  updateFly(0);
  sfx.whoosh();
  buzz(10);
}
ui.undo.addEventListener("click", () => undoLast());

// ---------------------------------------------------------------------------
// Names: a tap on a pan, bin, stack, bottle or the knife says what it is, in a small bubble by the
// finger (DESIGN §31), so look-alikes (sourdough and ciabatta, the salsas) can be told apart.

const bubbleEl = document.createElement("div");
bubbleEl.className = "name-bubble";
bubbleEl.hidden = true;
ui.root.appendChild(bubbleEl);
let bubbleTimer = 0;
function nameBubble(at: { x: number; y: number }, text: string, ms = 1300): void {
  bubbleEl.textContent = text;
  bubbleEl.hidden = false;
  // Kept on screen; the tail still points at the finger.
  const half = bubbleEl.offsetWidth / 2;
  const x = THREE.MathUtils.clamp(at.x, half + 6, Math.max(half + 6, bands.counter.w - half - 6));
  bubbleEl.style.left = `${x}px`;
  bubbleEl.style.top = `${Math.max(bands.customers.y + 60, at.y - 52)}px`;
  bubbleEl.style.setProperty("--tail", `${THREE.MathUtils.clamp(at.x - x, -half + 14, half - 14)}px`);
  bubbleEl.style.animationDuration = `${ms}ms`;
  bubbleEl.classList.remove("pop");
  void bubbleEl.offsetWidth;
  bubbleEl.classList.add("pop");
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => (bubbleEl.hidden = true), ms);
}

/** What a carried thing is called. */
function nameOf(p: Payload): string {
  switch (p.type) {
    case "piece":
      return p.piece.handmade ? "Hand-pressed tortilla" : KIND_LABEL[p.piece.kind];
    case "stack":
      return KIND_LABEL[p.layers[0].piece.kind];
    case "fries":
      return p.fry === "zucchini" ? "Zucchini" : p.fry === "fritters" ? "Apples for fritters" : p.fry === "churros" ? "Churro dough" : p.fry === "chips" ? "Tortilla wedges" : p.fry === "sweet" ? "Sweet potato fries" : "Fries";
    case "carton":
      return FRY_LABEL[p.fry ?? "fries"];
    case "empty":
      return `${SIZE_LABEL[p.size]} ${p.kind}`;
    case "ice":
      return "Ice";
    case "lid":
      return `${SIZE_LABEL[p.size]} lid`;
    case "garnish":
      return GARNISH_LABEL[p.kind];
    case "curds":
      return counter.redRock ? "Jalapeños" : "Cheese curds";
    case "gravy":
      return counter.redRock ? "Queso" : "Gravy";
    case "salt":
      return p.sugar ? (counter.orchard ? "Cinnamon sugar" : "Sugar") : "Salt";
    case "drink":
      return p.flavor ? `${DRINK_LABEL[p.flavor]}${p.fill < 0.05 ? " (empty)" : ""}` : `${SIZE_LABEL[p.size]} cup`;
  }
}

// ---------------------------------------------------------------------------
// Eggs: tap one in the tray to pick it up (or drag it out), then tap it on the grill to crack
// it. A quick, crisp tap opens it in one; a slower one only cracks it and it takes a second tap.
// The egg drops onto the grill where it was tapped and the empty shells stay in hand until
// they go in the trash. While an egg or its shells are in hand, presses on the grill counter
// move them rather than doing anything else.

interface EggHand {
  stage: EggStage;
  obj: THREE.Object3D;
  /** Where it hovers, world space on the grill top. */
  at: THREE.Vector3;
  /** Knock animation, 1 just tapped down to 0. */
  knock: number;
}
let eggHand: EggHand | null = null;
/** A tap counts as clean when it's this quick (ms) and doesn't slide. */
const EGG_CLEAN_TAP = 220;
/** How high the egg hovers over the grill top while in hand, and how much bigger it's drawn there (it's nearer the eye). */
const EGG_HOVER = 0.55;
const EGG_IN_HAND = 1.4;

function setEggStage(stage: EggStage): void {
  const e = eggHand!;
  counter.scene.remove(e.obj);
  disposeObject(e.obj);
  e.stage = stage;
  e.obj = makeEgg(stage);
  e.obj.scale.setScalar(EGG_IN_HAND);
  counter.scene.add(e.obj);
}

function pickUpEgg(at: THREE.Vector3): void {
  const obj = makeEgg("whole");
  obj.scale.setScalar(EGG_IN_HAND);
  counter.scene.add(obj);
  eggHand = { stage: "whole", obj, at: at.clone(), knock: 0 };
  sfx.pop();
  hintOnce("egg-tap", "Tap the egg on the grill to crack it. A quick, crisp tap opens it in one.", 3.5);
}

function dropEggHand(): void {
  if (!eggHand) return;
  counter.scene.remove(eggHand.obj);
  disposeObject(eggHand.obj);
  eggHand = null;
}

function moveEgg(pt: Pointer): void {
  if (!eggHand) return;
  eggHand.at.copy(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), GRILL_TOP));
  counter.highlightTrash(counter.overTrash(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3)));
}

/** Let go of the egg (or shells) in hand: a knock on the grill, the trash, back in the tray, or it just waits there. */
function releaseEgg(pt: Pointer, dt: number, cancelled: boolean): void {
  const e = eggHand;
  counter.highlightTrash(false);
  if (!e || cancelled) return;
  const ndc = ndcIn(bands.counter, pt.x, pt.y);
  const g = counter.groundPoint(ndc, GRILL_TOP);
  const justPicked = pt.hit?.type === "bin" && pt.hit.kind === "egg" && !pt.moved;
  if (justPicked) return;
  if (counter.overTrash(counter.groundPoint(ndc, 0.3))) {
    dropEggHand();
    sfx.thud();
    buzz(20);
    return;
  }
  if (e.stage === "shells") {
    showHint("The shells go in the trash, along the front edge.", 2);
    return;
  }
  const hit = counter.hit(ndc);
  if (e.stage === "whole" && hit?.type === "bin" && hit.kind === "egg") {
    // Back in the tray.
    dropEggHand();
    sfx.plop();
    return;
  }
  const over = counter.overGrill(g);
  if (!over) return;
  if (counter.grillItemAt(g) || counter.messAt(over.x, over.z) >= 0) {
    showHint("Crack it on a clear spot of the grill.", 1.8);
    return;
  }
  const zone = counter.zoneAt(over.x);
  const comal = counter.middle === "comal";
  if (comal ? counter.zones[zone] !== "hot" : zone !== FLAT_ZONE && zone !== GRILLE_ZONE) {
    showHint(comal ? "Crack eggs on the hot side of the comal." : "Crack eggs on the flat middle of the grill.", 2);
    return;
  }
  e.knock = 1;
  buzz(12);
  if (zone === GRILLE_ZONE && !comal) {
    // Through the grille: a mess that has to be rubbed off.
    counter.addMess(over.x, over.z);
    setEggStage("shells");
    sfx.splash();
    buzz([20, 30, 20]);
    showHint("Eggs go through the grille! Rub the mess off, and crack eggs on the flat middle.", 3);
    return;
  }
  const clean = dt < EGG_CLEAN_TAP && !pt.moved;
  if (e.stage === "whole" && !clean) {
    setEggStage("cracked");
    sfx.thud();
    showHint("Cracked. Tap it again to open it.", 1.8);
    return;
  }
  const inOne = e.stage === "whole";
  counter.addGrillItem(newPiece("egg"), over.x, over.z);
  sfx.sizzleHit();
  setEggStage("shells");
  if (inOne) showHint("Clean crack!", 1.2);
  hintOnce("egg-shells", "Now drop the shells in the trash, along the front edge.", 3);
  zoneHint(over.x);
}

function updateEgg(dt: number): void {
  const e = eggHand;
  if (!e) return;
  e.knock = Math.max(0, e.knock - dt * 5);
  // A knock: down to the grill and back up.
  const dip = Math.sin(Math.PI * e.knock) * EGG_HOVER;
  e.obj.position.set(e.at.x, e.at.y + EGG_HOVER - dip, e.at.z);
  // A whole egg is held lying over, so from above it reads as an egg and not a ball.
  if (e.stage === "shells") e.obj.rotation.set(0, 0, 0);
  else e.obj.rotation.set(-0.35, 0, 1.25);
}

/** Can this piece go down here? Eggs only on the flat or warm part, and nothing on a mess. */
function grillSpotOk(piece: Piece, at: { x: number; z: number }): boolean {
  if (counter.messAt(at.x, at.z) >= 0) {
    showHint("Rub the egg off the grille first.", 2);
    return false;
  }
  if (piece.kind === "egg" && counter.middle === "grill" && counter.zoneAt(at.x) === GRILLE_ZONE) {
    showHint("Eggs fall through the grille. Keep them on the flat middle.", 2.2);
    return false;
  }
  return true;
}

/** Put a piece back where it was lifted from the grill: back on its stack if there is one. */
function backOnGrill(piece: Piece, at: { x: number; z: number }): void {
  const under = counter.grillItemAt(counter.world(HOME_PAGE, at.x, GRILL_TOP, at.z));
  counter.addGrillItem(piece, at.x, at.z, undefined, under && counter.canStack(under, piece) && Math.hypot(under.x - at.x, under.z - at.z) < 0.1 ? under : null);
}

/** Tortillas stand in the comal's taco rack. */
function rackHasTacos(): boolean {
  return counter.rack.layers.some((l) => TORTILLAS.has(l.piece.kind));
}

/**
 * Something dropped on the taco rack on the comal's warm end (after build #73): a warm tortilla
 * (with whatever was laid on it on the comal) stands in the next slot, and a filling goes in with
 * the tacos already there, as on a tray. In the rack nothing cooks on or goes cold. Sauce goes on
 * at the tray. False (with a hint) if it can't go in.
 */
function rackDrop(payload: Extract<Payload, { type: "piece" | "stack" }>): boolean {
  const layers: Layer[] = payload.type === "stack" ? payload.layers : [{ piece: payload.piece, offX: 0, offZ: 0 }];
  const base = layers[0]?.piece;
  if (!base) return false;
  const ls = counter.rack.layers;
  const tacos = ls.filter((l) => TORTILLAS.has(l.piece.kind)).length;
  const more = layers.filter((l) => TORTILLAS.has(l.piece.kind)).length;
  if (isSauce(base.kind)) return showHint("Salsa and crema go on at the tray.", 2), false;
  if (TORTILLAS.has(base.kind) && base.folded) return showHint("A quesadilla goes straight up to a tray.", 2), false;
  if (!TORTILLAS.has(base.kind) && !RACK_FILL.has(base.kind)) return showHint(`${KIND_LABEL[base.kind]} doesn't go in the taco rack.`, 2), false;
  if (!more && !tacos) return showHint("Stand a warm tortilla in the rack first, then fill it.", 2.5), false;
  if (tacos + more > RACK_SLOTS) return showHint(`The rack holds ${RACK_SLOTS} tacos. Take this one up to the tray first.`, 2.5), false;
  if (ls.length + layers.length > 24) return showHint("That's plenty in the rack.", 1.5), false;
  if (more && cookLevel(base) < COOK_SCALE[base.kind as Cookable].done * 0.5) return showHint("Warm it on the hot side first: the rack only keeps tortillas warm.", 2.5), false;
  counter.setRack(joinTacos(ls, layers));
  if (more) hintOnce("rack-in", "In the rack, where tacos stay warm. Drag a scoop of pork or beans in for each taco, drop the toppings in once, then drag the rack up to the tray.", 4.5);
  else if (!SCOOPED.has(base.kind) && base.kind !== "egg") hintOnce("rack-sprinkle", "Toppings go in once: they're sprinkled over every taco in the rack.", 3);
  return true;
}

/** A tortilla and what's on it, as one comal item (the fillings ride along in piece.fill). */
function onTortilla(layers: Layer[]): Piece {
  const [base, ...rest] = layers.map((l) => l.piece);
  base.fill = rest.length ? rest : undefined;
  return base;
}
/** A tortilla off the comal as a stack: the tortilla, then what was on it. */
function offTortilla(piece: Piece): Layer[] {
  const fill = piece.fill ?? [];
  piece.fill = undefined;
  return [piece, ...fill].map((p) => ({ piece: p, offX: 0, offZ: 0 }));
}

/** Something just went down on a grill zone that's off or only warm: say so, once each. */
function zoneHint(x: number): void {
  const zone = counter.zoneAt(x);
  const heat = counter.zones[zone];
  if (counter.middle === "comal") {
    if (heat === "warm") hintOnce("comal-warm", "The right end of the comal keeps things warm without cooking them on. Warm tortillas on the hot side, then stand them in the taco rack.", 4);
    else hintOnce("comal-hot", `Tortillas warm in about ${Math.round(6 * cookTime())} seconds: soft, with brown spots, and the meter turns orange and says Warm. Don't leave them till they go hard.`, 4);
    return;
  }
  if (heat === "off") showHint("That part of the grill is off. Tap its button on the front to heat it.", 2.5);
  else if (heat === "warm") hintOnce("zone-warm", "Warm holds food without cooking it, and nothing goes stale there. Park finished food here.", 3.5);
  else if (zone === GRILLE_ZONE) hintOnce("grille", "The grille sears grill marks into patties: customers love them.", 3.5);
}

/** Curds or gravy onto fries in a carton (on a pad or a plate). False if it's already on. */
function topFries(f: { curds?: boolean; gravy?: boolean }, what: "curds" | "gravy"): boolean {
  if (f[what]) {
    showHint(what === "curds" ? (counter.redRock ? "It's got jalapeños." : "It's got curds.") : counter.redRock ? "It's got queso." : "It's got gravy.", 1.2);
    return false;
  }
  f[what] = true;
  sfx.plop();
  if (what === "gravy" && !f.curds) hintOnce("curds-first", counter.redRock ? "Jalapeños go on before the queso." : "Curds go under the gravy so they soften just right.", 3);
  return true;
}

/**
 * The salt shaker in hand. Each change of direction (after a short run) is one shake; over fries
 * in a carton, on a pad or on a plate, a shake drops SALT.shake of salt on them.
 */
const shaker = { shakes: 0, target: null as null | { f: { salt?: number }; sync: () => void; at: Place }, logged: new Set<object>(), dirX: 0, dirY: 0, runX: 0, runY: 0, wiggle: 0 };

/** Fries in a carton under the finger: on a packing pad, or on a plate on the tray. */
function saltTarget(pt: Pointer): typeof shaker.target {
  const band = bandAt(pt.y);
  if (band === "counter") {
    const pi = counter.friedPackAt(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3));
    return pi >= 0 ? { f: counter.packs[pi], sync: () => counter.syncPack(pi), at: { at: "pack", i: pi } } : null;
  }
  if (band === "tray") {
    const slot = trayView.pick(ndcIn(bands.tray, pt.x, pt.y));
    const fries = slot >= 0 ? game.slots[slot].plate.fries : null;
    return fries ? { f: fries, sync: () => syncTray(slot, false), at: { at: "tray", slot } } : null;
  }
  return null;
}

function shakeSalt(pt: Pointer, dx: number, dy: number): void {
  shaker.target = saltTarget(pt);
  // A reversal on either axis after at least RUN px the other way is a shake.
  const RUN = 10;
  let shook = false;
  const axis = (d: number, dir: "dirX" | "dirY", run: "runX" | "runY") => {
    if (Math.abs(d) < 0.5) return;
    const sgn = Math.sign(d);
    if (sgn === shaker[dir]) shaker[run] += Math.abs(d);
    else {
      if (shaker[run] >= RUN && shaker[dir] !== 0) shook = true;
      shaker[dir] = sgn;
      shaker[run] = Math.abs(d);
    }
  };
  axis(dx, "dirX", "runX");
  axis(dy, "dirY", "runY");
  if (!shook) return;
  shaker.wiggle = 1;
  if (!shaker.target) {
    hintOnce("salt-where", "Shake it over fries in a carton, on the pad or on the plate.", 2.5);
    return;
  }
  const f = shaker.target.f as { salt?: number; fry?: FryKind };
  const sugar = ptr?.held?.payload.type === "salt" && !!ptr.held.payload.sugar;
  if (sugar !== SUGARED.has(fryOf(f))) {
    const sweet = counter.orchard ? "fritters" : "churros";
    showHint(sugar ? `Sugar goes on ${sweet}.` : `${capitalise(sweet)} get sugar, not salt: use the sugar shaker.`, 2);
    return;
  }
  const before = f.salt ?? 0;
  if (before >= SALT.max) return void showHint("That's plenty of salt!", 1.2);
  // One Undo takes back all the salt this shaker put on these fries in this go (after build #86).
  if (!shaker.logged.has(f)) {
    shaker.logged.add(f);
    history.push({ what: { k: "salt", f, before, sugar }, from: SUPPLY, to: shaker.target.at });
  }
  f.salt = Math.min(SALT.max, before + SALT.shake);
  shaker.shakes++;
  sfx.shake();
  buzz(6);
  shaker.target.sync();
}

/** Drinks and fryer stations: cups under nozzles, cartons on packing spots. */
function dropAtStation(payload: Payload, g: THREE.Vector3): boolean {
  if (payload.type === "curds" || payload.type === "gravy") {
    const pi = counter.friedPackAt(g);
    if (pi < 0) {
      if (counter.overPack(g) >= 0) showHint("Fill the carton with fries first.", 1.5);
      return false;
    }
    if (!topFries(counter.packs[pi], payload.type)) return false;
    counter.syncPack(pi);
    dropped = { place: { at: "pack", i: pi }, ref: counter.packs[pi] };
    return true;
  }
  if (payload.type === "ice" || payload.type === "lid") {
    const c = counter.page === 0 ? counter.cupAt(g) : null;
    if (!c) return false;
    // Ice first, then pour, then the lid (of the cup's size).
    const problem = c[payload.type]
      ? `It already has ${payload.type === "ice" ? "ice" : `a ${payload.type}`}.`
      : payload.type === "ice" && c.lid
        ? "Ice goes in before the lid."
        : payload.type === "lid" && c.fill < 0.05
          ? "Pour the drink first."
          : payload.type === "lid" && payload.size !== c.size
            ? `That's a ${SIZE_LABEL[payload.size].toLowerCase()} lid. This cup takes a ${SIZE_LABEL[c.size].toLowerCase()} one.`
            : "";
    if (problem) {
      showHint(problem, 2);
      return false;
    }
    counter.dressCupAt(c, payload.type);
    dropped = { place: { at: "cup", x: c.x, z: c.z }, ref: c };
    if (payload.type === "ice") sfx.ice();
    else sfx.plop();
    return true;
  }
  if ((payload.type === "empty" && payload.kind === "cup") || payload.type === "drink") {
    // A cup stands anywhere on the drinks counter; over a drip tray it goes under that nozzle.
    if (counter.page !== 0 || counter.overTrash(g)) return false;
    const c = payload.type === "drink" ? payload : { flavor: null, fill: 0, size: payload.size, ice: !!payload.ice, lid: false };
    const { cup, why } = counter.placeCup({ flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid }, g);
    if (!cup) {
      if (why) showHint(why, 2);
      return false;
    }
    sfx.plop();
    dropped = { place: { at: "cup", x: cup.x, z: cup.z }, ref: cup };
    if (payload.type === "empty") {
      hintOnce(cup.tap >= 0 ? "pour" : "cup-free", cup.tap >= 0 ? "Hold the drink's button on top of the fountain. Watch the bar on the left and let go at the line." : "Cups can stand anywhere. Move one under a nozzle to pour.", 3.5);
    }
    return true;
  }
  if (payload.type === "empty") {
    const pi = counter.overPack(g);
    const p = counter.packs[pi];
    if (!p) return false;
    if (p.size) {
      showHint("There's already a carton there.", 1.5);
      return false;
    }
    Object.assign(p, { size: payload.size as FriesSize, cook: 0, fill: 0, held: 0 });
    counter.syncPack(pi);
    dropped = { place: { at: "pack", i: pi } };
    sfx.plop();
    hintOnce("pack", "Drag the fries from the basket into the carton.", 3);
    return true;
  }
  if (payload.type === "fries" && payload.basket !== null) {
    const pi = counter.overPack(g);
    const p = counter.packs[pi];
    if (!p) return false;
    if (!p.size) {
      showHint("Put a carton there first.", 1.5);
      return false;
    }
    const fry = payload.fry ?? "fries";
    if (p.fill > 0 && p.fry !== fry) {
      showHint(`That carton has ${FRY_LABEL[p.fry].toLowerCase()} in it.`, 2);
      return false;
    }
    p.fry = fry;
    const portion = FRIES_PORTION[p.size as FriesSize];
    const room = (1 - p.fill) * portion;
    if (room < 0.01) {
      showHint("That carton's full.", 1.5);
      return false;
    }
    const moved = Math.min(room, payload.amount);
    dropped = { place: { at: "pack", i: pi }, moved, pack: { fill: p.fill, cook: p.cook, fry: p.fill > 0 ? p.fry : fry } };
    p.cook = (p.cook * p.fill * portion + payload.cook * moved) / (p.fill * portion + moved);
    // A carton is as soggy as the oldest fries in it.
    p.held = p.fill > 0 ? Math.max(p.held, payload.held ?? 0) : (payload.held ?? 0);
    p.fill = Math.min(1, p.fill + moved / portion);
    counter.syncPack(pi);
    sfx.plop();
    // Whatever didn't fit stays in the basket for the next carton.
    const left = payload.amount - moved;
    if (left > 0.02) Object.assign(counter.baskets[payload.basket], { loaded: true, cook: payload.cook, amount: left, down: false, fry, held: payload.held ?? 0 });
    if (p.fill < 0.95) hintOnce("skimpy", "Not quite full. Top it up with another batch, or customers call it skimpy.", 3);
    return true;
  }
  return false;
}

/**
 * Sauce, two ways (DESIGN §31). The quick way, one gesture: press a bottle in the caddy (the plates
 * that can take sauce light up), drag toward one and the camera eases in on it; once you're over it
 * the burger fills the screen and moving the finger squeezes a line; let go and the bottle goes back.
 * Sauce only starts once the nozzle has come in over the middle of the bun (`sauceGate`), so the
 * thumb crossing the near edge on its way in leaves nothing; after that the edge is meant. The
 * discoverable way: tap the bottle (it lifts out and the plates light up), tap a burger, and the
 * close-up opens and waits for one stroke: press and draw, and when the finger lifts it closes.
 */
interface SauceDrag {
  kind: SauceKind;
  /** Plates with a burger started on them. */
  ok: boolean[];
  slot: number;
  /** 0..1: how far the finger has come from the caddy toward the burger. */
  aim: number;
  locked: boolean;
  bottle: THREE.Object3D;
  lastPaint: number;
  /** The live score last shown, to buzz once on reaching the perfect band. */
  word: SauceWord | "";
  /** "drag": the one gesture from the bottle; "tap": the bottle tapped, then the burger. */
  how: "drag" | "tap";
  /** The nozzle has come in over the middle of the bun: sauce lands from now on (see sauceGate). */
  armed: boolean;
  /** Tap way: the one stroke is under way. */
  stroking: boolean;
  /** When the tap-way close-up opened (ms): unused, it closes by itself. */
  since: number;
  /** The layer this squeeze went into and its stroke's length before it, for Undo. */
  piece: Piece | null;
  before: number;
}
let sauceDrag: SauceDrag | null = null;
/** A bottle that was tapped: lifted out of the caddy, waiting for a tap on a burger. */
let sauceArm: { kind: SauceKind; at: number } | null = null;
const sauceZoom = new SauceZoom(trayView);
/** The sauce lands this far above the fingertip (CSS px), so the finger never hides the line. */
const NOZZLE_UP = 34;
/** How long a tapped bottle, or an opened close-up nobody draws on, waits (ms). */
const SAUCE_WAIT = { arm: 8000, open: 6000 };

/** The square the burger fills when fully zoomed, in column coordinates: centred on the tray band. */
function sauceFinal(): Rect {
  const w = bands.tray.w;
  const side = Math.min(w, Math.round(viewH * 0.5));
  const cy = bands.tray.y + bands.tray.h / 2;
  const y = Math.max(bands.customers.y + 44, cy - side / 2);
  return { x: (w - side) / 2, y, w: side, h: side };
}

const sauceTargets = () => game.slots.map((s) => s.plate.layers.length > 0);

function startSauce(pt: Pointer, kind: SauceKind): void {
  const ok = sauceTargets();
  if (!ok.some(Boolean) && !benchSauceTargets()) {
    nameBubble(pt, KIND_LABEL[kind]);
    showHint("Start a burger on a tray first, then put the sauce on it.", 2.5);
    buzz(10);
    return;
  }
  pt.mode = "sauce";
  pt.sauce = kind;
  counter.liftSauce(kind);
  const slot = ok[game.active] ? game.active : ok.findIndex(Boolean);
  sauceDrag = { kind, ok, slot, aim: 0, locked: false, bottle: counter.sauceBottle(kind), lastPaint: 0, word: "", how: "drag", armed: false, stroking: false, since: performance.now(), piece: null, before: 0 };
  sauceMove(pt);
  sfx.pop();
}

/**
 * Sauce on the press counter (after build #82): the bread on the cutting board or in an open press
 * bay takes a squeeze too, so aioli can go on the ciabatta while the panini is built in the press.
 * There's no close-up there: drop the bottle on it (or tap the bottle, then the bread) and an even
 * squeeze goes on, a little under the Perfect band's middle. Undo takes it back off.
 */
type Bench = "board" | { bay: number };
function benchSauceTargets(): boolean {
  if (counter.middle !== "press" || counter.page !== HOME_PAGE) return false;
  if (counter.board?.on && counter.board.layers.length) return true;
  return counter.bays.some((b, i) => i < counter.bayCount && !b.closed && b.layers.length > 0);
}
/** The board or the press bay under a screen point (column coordinates), if it has food on it. */
function benchUnder(x: number, y: number): Bench | null {
  if (counter.middle !== "press" || counter.page !== HOME_PAGE) return null;
  const ndc = ndcIn(bands.counter, x, y);
  if (counter.board?.on && counter.board.layers.length && counter.overBoard(counter.groundPoint(ndc, 0.12))) return "board";
  const bi = counter.overBay(counter.groundPoint(ndc, PLATE.y + 0.1));
  return bi >= 0 && counter.bays[bi].layers.length ? { bay: bi } : null;
}
function autoSauce(kind: SauceKind, where: Bench, at: { x: number; y: number }): boolean {
  if (where !== "board" && counter.bays[where.bay].closed) {
    showHint("Lift the lid first: swipe the handle up.", 2);
    return false;
  }
  const ls = where === "board" ? counter.board!.layers : counter.bays[where.bay].layers;
  const top = ls[ls.length - 1];
  if (!top) return false;
  if (top.piece.kind === kind && top.piece.stroke) {
    showHint(`It has ${KIND_LABEL[kind].toLowerCase()} on already. Undo takes it off.`, 2);
    return false;
  }
  const p = newPiece(kind);
  p.stroke = quickSauceStroke(BENCH_SAUCE);
  const next = [...ls, { piece: p, offX: top.offX * 0.5, offZ: top.offZ * 0.5 }];
  if (where === "board") counter.setBoard(next);
  else counter.setBay(counter.bays[where.bay], next);
  history.push({ what: { k: "sauce", piece: p, before: 0, kind }, from: SUPPLY, to: where === "board" ? { at: "board" } : { at: "bay", i: where.bay } });
  sfx.squirt();
  buzz(10);
  nameBubble(at, KIND_LABEL[kind], 1000);
  hintOnce("bench-sauce", "Sauced. On a tray you can draw it on yourself for a Perfect.", 3);
  return true;
}

/** The tap way, step one: the bottle lifts out of the caddy and waits for a tap on a burger. */
function armSauce(kind: SauceKind, at: { x: number; y: number }): void {
  disarm();
  sauceArm = { kind, at: performance.now() };
  counter.liftSauce(kind);
  const b = counter.bottles[kind];
  if (b) counter.pointSauce(b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.5, 0)));
  nameBubble(at, `${KIND_LABEL[kind]}: tap a burger`, 2200);
  hintOnce("sauce-arm", "Now tap the burger to put it on. Quicker: press the bottle and drag it straight onto the burger.", 3.5);
  sfx.pop();
}

/** Put a tapped bottle (or the lifted knife) back. */
function disarm(): void {
  if (sauceArm) {
    sauceArm = null;
    counter.liftSauce(null);
  }
  if (knifeArm) {
    knifeArm = false;
    counter.setKnife("rest");
  }
}

/** The tap way, step two: a burger tapped. The close-up opens and waits for one stroke. */
function openTapSauce(slot: number): void {
  const kind = sauceArm!.kind;
  sauceArm = null;
  counter.pointSauce(null);
  setActive(slot);
  sauceDrag = { kind, ok: sauceTargets(), slot, aim: 1, locked: true, bottle: counter.sauceBottle(kind), lastPaint: 0, word: "", how: "tap", armed: true, stroking: false, since: performance.now(), piece: null, before: 0 };
  trayView.showGhost(slot, sauceDrag.bottle);
  buzz(8);
  sfx.pop();
  hintOnce("sauce-draw", "Draw it on: press and move your finger over the burger. Lift it when you're done.", 3.5);
}

function sauceMove(pt: Pointer): void {
  const s = sauceDrag;
  if (!s) return;
  if (!s.locked) {
    // Aim at the plate in the finger's third of the screen, or the nearest one that can take sauce.
    const third = THREE.MathUtils.clamp(Math.floor(pt.x / (bands.tray.w / 3)), 0, 2);
    let best = -1;
    for (let i = 0; i < 3; i++) if (s.ok[i] && (best < 0 || Math.abs(i - third) < Math.abs(best - third))) best = i;
    s.slot = best;
    if (best < 0) {
      // Nothing on the trays to sauce: only the board or an open bay (after build #82).
      counter.pointSauce(bandAt(pt.y) === "counter" ? counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3).add(new THREE.Vector3(0, 1.4, 0)) : null);
      return;
    }
    const fin = sauceFinal();
    const cy = fin.y + fin.h / 2;
    s.aim = THREE.MathUtils.clamp((pt.y0 - pt.y) / Math.max(60, pt.y0 - cy), 0, 1);
    if (s.aim >= 0.8) {
      s.locked = true;
      setActive(s.slot);
      counter.pointSauce(null);
      buzz(8);
    } else if (bandAt(pt.y) === "counter" && s.aim < 0.5) {
      counter.pointSauce(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3).add(new THREE.Vector3(0, 1.4, 0)));
    } else counter.pointSauce(null);
    trayView.showGhost(s.aim >= 0.4 ? s.slot : -1, s.aim >= 0.4 ? s.bottle : null);
    trayView.ghostOver(null);
  }
  if (s.locked) paintSauce(pt);
}

/** Squeeze a line where the nozzle is, if it's over the burger (and, dragged in, once it's come in over the middle). */
function paintSauce(pt: Pointer): void {
  const s = sauceDrag!;
  const slot = s.slot;
  const pv = trayView.plates[slot];
  const raw0 = pv.drawPoint(sauceZoom.ray(pt.x, pt.y - NOZZLE_UP), Infinity);
  trayView.showGhost(slot, s.bottle);
  trayView.ghostOver(raw0);
  // Tacos and quesadillas aren't round: sauce is painted over the dish's own extent.
  const ext = pv.dishExtent();
  const raw = ext ? { x: raw0.x / ext.rx, z: raw0.z / ext.rz } : raw0;
  const r = Math.hypot(raw.x, raw.z);
  // The zoom is still easing in: the finger isn't over the burger it will see yet.
  if (sauceZoom.eased < 0.85) return;
  const gate = sauceGate(s.armed, r);
  s.armed = gate.armed;
  if (!gate.squeeze || r > 1.12) return;
  const q = r > 1 ? { x: raw.x / r, z: raw.z / r } : raw;
  const layers = game.slots[slot].plate.layers;
  let top = layers[layers.length - 1];
  // Carrying on with the same sauce keeps drawing the same squiggle rather than adding a layer.
  if (top.piece.kind !== s.kind || !top.piece.stroke) {
    const p = newPiece(s.kind);
    p.stroke = [];
    layers.push({ piece: p, offX: top.offX * 0.5, offZ: top.offZ * 0.5 });
    top = layers[layers.length - 1];
  }
  if (!s.piece) {
    s.piece = top.piece;
    s.before = top.piece.stroke!.length;
  }
  const stroke = top.piece.stroke!;
  const last = stroke[stroke.length - 1];
  if (!last || Math.hypot(q.x - top.offX - last.x, q.z - top.offZ - last.z) > 0.06) {
    stroke.push({ x: q.x - top.offX, z: q.z - top.offZ });
    syncTray(slot, false);
    s.lastPaint = performance.now();
    if (s.lastPaint - lastSquirt > 70) {
      sfx.squirt();
      lastSquirt = s.lastPaint;
    }
  }
}

/** Let go: a tap on the bottle lifts it to wait for a burger; otherwise the bottle goes back and the camera eases out. */
function endSauce(pt: Pointer, cancelled: boolean): void {
  const s = sauceDrag;
  if (!s) return;
  // Let go over the board or an open press bay: a squeeze goes on the bread there (after build #82).
  if (s.how === "drag" && !cancelled && !s.locked && bandAt(pt.y) === "counter" && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) >= 24) {
    const where = benchUnder(pt.x, pt.y);
    closeSauce();
    if (where) autoSauce(s.kind, where, pt);
    return;
  }
  if (s.how === "drag" && !cancelled && !s.locked && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) < 24) {
    closeSauce();
    armSauce(s.kind, pt);
    return;
  }
  closeSauce();
}

/** Close the close-up and put the bottle back; a squeeze that went on is noted for Undo. */
function closeSauce(): void {
  const s = sauceDrag;
  if (!s) return;
  if (s.piece && (s.piece.stroke?.length ?? 0) > s.before) {
    const to = whereFood(s.piece);
    if (to) history.push({ what: { k: "sauce", piece: s.piece, before: s.before, kind: s.kind }, from: SUPPLY, to });
  }
  counter.liftSauce(null);
  trayView.showGhost(-1, null);
  trayView.ghostOver(null);
  disposeObject(s.bottle);
  sauceDrag = null;
  sfx.pop();
}

/** The sauce in that plate's newest layer of this kind, if any. */
function sauceLayer(slot: number, kind: SauceKind): Piece | null {
  const layers = game.slots[slot].plate.layers;
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].piece.kind === kind && layers[i].piece.stroke) return layers[i].piece;
  return null;
}

const sauceUi = document.createElement("div");
sauceUi.className = "sauce-ui";
sauceUi.hidden = true;
sauceUi.innerHTML = `<div class="sauce-score"><b></b><span></span></div>`;
ui.root.appendChild(sauceUi);
const sauceScore = sauceUi.querySelector(".sauce-score") as HTMLElement;
/** The level bar's full height, as coverage. */
const METER_TOP = 0.8;
const SAUCE_TINT: Record<SauceKind, string> = { ketchup: "#d8261b", mustard: "#e9b80f", pesto: "#5f9a3a", aioli: "#f1e6c2", redsalsa: "#c8321f", greensalsa: "#6c9e2c", crema: "#f4efe2", redsauce: "#c8402a", oil: "#c9b84a", honey: "#e9a92a" };
/**
 * The sauce on the zoomed burger, for the shared level bar down the left (the same bar the drink
 * pour and the salt shaker use), or null when the close-up is closed.
 */
let sauceLevel: null | { v: number; kind: SauceKind; rect: Rect; over: boolean } = null;
const SAUCE_WORDS: Record<SauceWord, string> = { stingy: "Keep going", light: "A bit more", perfect: "Perfect", heavy: "That's plenty", drowning: "Too much" };

function updateSauce(dt: number): void {
  const now = performance.now();
  // A tapped bottle waits a while for a burger; an opened close-up nobody draws on closes again.
  if (sauceArm && (now - sauceArm.at > SAUCE_WAIT.arm || game.phase !== "playing")) disarm();
  if (sauceDrag?.how === "tap" && !sauceDrag.stroking && (now - sauceDrag.since > SAUCE_WAIT.open || game.phase !== "playing")) closeSauce();
  if (sauceArm && !sauceDrag) trayView.aim(sauceTargets(), -1, game.time);
  const s = sauceDrag;
  const target = s ? (s.locked ? 1 : s.aim * 0.75) : 0;
  sauceZoom.update(dt, target, s ? s.slot : -1, { x: 0, y: bands.tray.y, w: bands.tray.w, h: bands.tray.h }, sauceFinal());
  if (s) {
    trayView.aim(s.locked ? null : s.ok, s.slot, game.time);
    (s.bottle.userData as { squeeze?: (t: number) => void }).squeeze?.(performance.now() - s.lastPaint < 140 ? 1 : 0);
  }
  const k = sauceZoom.eased;
  const slot = sauceZoom.slot;
  sauceUi.hidden = !(k > 0.05 && slot >= 0 && game.phase === "playing");
  ui.root.classList.toggle("saucing", !sauceUi.hidden && k > 0.25);
  sauceLevel = null;
  if (sauceUi.hidden) return;
  const r = sauceZoom.rect;
  sauceUi.style.left = `${r.x}px`;
  sauceUi.style.top = `${r.y}px`;
  sauceUi.style.width = `${r.w}px`;
  sauceUi.style.height = `${r.h}px`;
  sauceUi.style.setProperty("--dim", (0.6 * k).toFixed(3));
  sauceUi.style.setProperty("--ui", Math.max(0, (k - 0.5) * 2).toFixed(3));
  const kind = s?.kind ?? (sauceUi.dataset.kind as SauceKind | undefined) ?? "ketchup";
  sauceUi.dataset.kind = kind;
  const cov = sauceCoverage(sauceLayer(slot, kind)?.stroke);
  const { word } = sauceVerdict(cov);
  const wanted = !!game.slots[slot].order?.layers.some((l) => l.kind === kind);
  if (k > 0.5) sauceLevel = { v: cov, kind, rect: { ...r }, over: cov > SAUCE_BAND.drown };
  const label = s?.how === "tap" && !s.stroking ? "Press and draw it on" : cov === 0 ? "Squeeze on" : wanted ? SAUCE_WORDS[word] : "Not on this order";
  sauceScore.dataset.word = wanted ? (cov === 0 ? "" : word) : "wrong";
  const b = sauceScore.firstElementChild as HTMLElement;
  const sp = sauceScore.lastElementChild as HTMLElement;
  if (b.textContent !== KIND_LABEL[kind]) b.textContent = KIND_LABEL[kind];
  if (sp.textContent !== label) sp.textContent = label;
  if (s && s.locked && wanted && word !== s.word) {
    if (word === "perfect") {
      buzz(12);
      sfx.plop();
    }
    s.word = word;
  }
}

/**
 * A card (the pause menu) just closed, or Prep's Open just started the shift: the second tap of a
 * double tap on Resume or Open isn't a kitchen tap.
 */
const afterCard = (e: Event) => e.timeStamp - Math.max(modalClosedAt(), screenShownAt) < 400;

canvas.addEventListener("pointerdown", (e) => {
  if (game.phase !== "playing" || ptr || afterCard(e)) return;
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
  // Something flying back (Undo) lands at once.
  finishFly();
  if (x < 0 || x > bands.counter.w) return;
  // The tap way's sauce close-up is open: a press on it is the one stroke; anywhere else closes it.
  if (sauceDrag?.how === "tap") {
    const r = sauceFinal();
    if (!sauceDrag.stroking && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      pt.mode = "sauce";
      sauceDrag.stroking = true;
      paintSauce(pt);
    } else closeSauce();
    return;
  }
  // A tapped bottle waits for a tap on a burger; the lifted knife for a tap on the food on the board.
  if (knifeArm && pt.band !== "counter") disarm();
  if (sauceArm && pt.band !== "counter") {
    const slot = pt.band === "tray" ? trayView.pick(ndcIn(bands.tray, x, y)) : -1;
    if (slot >= 0 && game.slots[slot].plate.layers.length) openTapSauce(slot);
    else if (slot >= 0) showHint("Start a burger on that tray first.", 1.8);
    else disarm();
    return;
  }
  if (pt.band === "counter") {
    const hit = counter.hit(ndcIn(bands.counter, x, y));
    pt.hit = hit;
    if (knifeArm && hit?.type !== "knife") {
      // The knife's lifted: a tap on the food cuts it; anywhere else puts the knife down.
      const onBoard = hit?.type === "board" || counter.overBoard(counter.groundPoint(ndcIn(bands.counter, x, y), 0.12)) || overCutHolder(x, y);
      disarm();
      if (onBoard) {
        cutNow(pt);
        pt.mode = "none";
        return;
      }
    }
    if (sauceArm && !(hit?.type === "bottle" && hit.sauce === sauceArm.kind)) {
      const where = benchUnder(x, y);
      const kind = sauceArm.kind;
      disarm();
      if (where) {
        autoSauce(kind, where, pt);
        return;
      }
    }
    if (eggHand && counter.page === HOME_PAGE) {
      // An egg or its shells in hand: this press moves them (a tap on the grill cracks the egg).
      pt.mode = "egg";
      moveEgg(pt);
    } else if (!hit) {
      pt.mode = "swipe";
      // Empty hands on the trash chute: a sideways swipe along it moves to the next counter.
      pt.chute = counter.overTrash(counter.groundPoint(ndcIn(bands.counter, x, y)));
    }
    else if (hit.type === "bin" && hit.kind === "egg") {
      nameBubble(pt, KIND_LABEL.egg);
      pickUpEgg(counter.groundPoint(ndcIn(bands.counter, x, y), GRILL_TOP));
      pt.mode = "egg";
      moveEgg(pt);
    } else if (hit.type === "bin") {
      startHold(pt, { type: "piece", piece: newPiece(hit.kind), fromGrill: null });
    }
    else if (hit.type === "grillItem") {
      pt.mode = "grill";
      // On the edge of a filled tortilla, a drag across the middle folds it.
      const it = hit.item;
      if (counter.middle === "comal" && TORTILLAS.has(it.piece.kind) && !it.piece.folded && it.piece.fill?.length && it.flipT < 0) {
        const g = counter.groundPoint(ndcIn(bands.counter, x, y), GRILL_TOP);
        const at = { x: g.x - counter.world(HOME_PAGE, 0, 0, 0).x, z: g.z };
        const R = TORTILLA_R[it.piece.kind as "corn" | "flour"] * GRILL_SCALE;
        if (Math.hypot(at.x - it.x, at.z - it.z) > R * 0.3) pt.foldFrom = at;
      }
    }
    else if (hit.type === "rack") pt.mode = "rack";
    else if (hit.type === "tpress") {
      pt.mode = "tpress";
      sfx.pop();
    }
    else if (hit.type === "mess") {
      pt.mode = "rub";
      pt.wipe = hit.idx;
      hintOnce("rub", "Rub it back and forth to scrape it off.", 2);
    }
    else if (hit.type === "zone") {
      const heat = counter.cycleZone(hit.idx);
      sfx.flip();
      buzz(10);
      hintOnce("zones", "Each power button cycles its zone: off, warm, hot. Its lights show it: none for off, one orange for warm, two red for hot.", 3.5);
      if (heat === "warm") hintOnce("zone-warm", "Warm holds food without cooking it, and nothing goes stale there. Park finished food here.", 3.5);
    }
    else if (hit.type === "bottle") {
      // At the oven, olive oil goes on the base on the peel; honey goes on at the tray, after the oven.
      if (counter.middle === "oven" && hit.sauce === "oil") startLadle(pt, "oil");
      else startSauce(pt, hit.sauce);
    }
    else if (hit.type === "dough") startHold(pt, { type: "piece", piece: newPiece("dough"), fromGrill: null });
    else if (hit.type === "pot") startLadle(pt, "redsauce");
    else if (hit.type === "peel") startPeel(pt);
    else if (hit.type === "bench") {
      if (!startFold(pt, counter.bench)) pt.mode = "bench";
    } else if (hit.type === "spot") pt.mode = "spot";
    else if (hit.type === "batter") {
      // Battered zucchini sits in the bowl until it's picked up again for the basket.
      if (counter.batter > 0) {
        startHold(pt, { type: "fries", cook: 0, basket: null, amount: counter.batter, fry: "zucchini", fromBatter: true });
        counter.setBatter(0);
        hintOnce("battered-up", "Battered. Drop it in a basket to fry.", 2.5);
      } else showHint("Drop a scoop of zucchini in the batter, then pick it up again for the basket.", 2.5);
    }
    else if (hit.type === "friesBin") startHold(pt, { type: "fries", cook: 0, basket: null, amount: FRIES_SCOOP });
    else if (hit.type === "fryBin") {
      // Zucchini comes out raw (cook below 0) until it's been through the batter.
      startHold(pt, { type: "fries", cook: hit.fry === "zucchini" ? -1 : 0, basket: null, amount: FRIES_SCOOP, fry: hit.fry });
      if (hit.fry === "sweet") hintOnce("sweet", "Sweet potato fries cook faster than plain ones, and their golden window is shorter.", 3.5);
      else if (hit.fry === "chips") hintOnce("chips", `Tortilla wedges fry into chips in about ${Math.round(8 * cookTime())} seconds: drop a scoop in a basket and lower it.`, 3.5);
      else if (hit.fry === "churros") hintOnce("churros", "Churros fry like fries. Shake sugar on them once they're in the carton.", 3.5);
      else if (hit.fry === "zucchini") hintOnce("zucchini", "Zucchini fritti: drop it in the batter bowl at the back right, pick it up again, then into a basket. Salt them in the carton.", 4);
      else if (hit.fry === "fritters") hintOnce("fritters", "Apple fritters fry like fries. Shake cinnamon sugar on them once they're in the carton.", 3.5);
    }
    else if (hit.type === "bay") pt.mode = "bay";
    else if (hit.type === "handle") pt.mode = "handle";
    else if (hit.type === "knife") pt.mode = "knife";
    else if (hit.type === "board") {
      // At the oven the board is where a pie is set down: an unbaked one can be folded there too.
      if (!(counter.middle === "oven" && startFold(pt, counter.board!))) pt.mode = "board";
    } else if (hit.type === "stack") {
      const s = counter.stacks[hit.idx];
      startHold(pt, { type: "empty", kind: s.kind, size: s.size, stack: hit.idx });
    } else if (hit.type === "ice") startHold(pt, { type: "ice" });
    else if (hit.type === "lids") startHold(pt, { type: "lid", size: hit.size });
    else if (hit.type === "garnish" && counter.garnish) startHold(pt, { type: "garnish", kind: counter.garnish });
    else if (hit.type === "pack") {
      const p = counter.packs[hit.idx];
      if (p.size && p.fill > 0) {
        startHold(pt, { type: "carton", size: p.size, cook: p.cook, fill: p.fill, pack: hit.idx, salt: p.salt, curds: p.curds, gravy: p.gravy, fry: p.fry, held: p.held });
        Object.assign(p, EMPTY_PACK);
        counter.syncPack(hit.idx);
      } else showHint(p.size ? "Drag fries from the basket into the carton." : "Grab a carton from the stacks, front left.", 2);
    }
    else if (hit.type === "basket") pt.mode = "basket";
    else if (hit.type === "shaker" || hit.type === "curds" || hit.type === "gravy") {
      const sugar = hit.type === "shaker" && !!hit.sugar;
      startHold(pt, hit.type === "shaker" ? { type: "salt", sugar } : { type: hit.type });
      if (hit.type === "shaker") {
        (sugar ? counter.sugarShaker : counter.shakerObj).visible = false;
        Object.assign(shaker, { shakes: 0, target: null, dirX: 0, dirY: 0, runX: 0, runY: 0 });
      }
      const red = counter.redRock;
      hintOnce(
        `fry-${hit.type}${sugar ? "-sugar" : ""}${red ? "-red" : ""}`,
        hit.type === "shaker"
          ? sugar
            ? `Shake sugar over ${counter.orchard ? "fritters" : "churros"} in their carton. Watch the bar on the left: stop at the line.`
            : `Hold the shaker over ${red ? "chips" : "fries"} and shake it. Watch the bar on the left: stop at the line.`
          : hit.type === "curds"
            ? red
              ? "Nachos: chips, then jalapeños, then queso on top."
              : "Poutine: fries, then cheese curds, then gravy on top."
            : red
              ? "Ladle queso over the jalapeños to finish the nachos."
              : "Ladle gravy over the curds to finish a poutine.",
        3,
      );
    }
    else if (hit.type === "tap") {
      const t = counter.taps[hit.idx];
      const c = t.cup;
      if (!c) showHint("Put a cup under the nozzle first. Cups are in the front row.", 2.5);
      else if (c.lid) showHint("The lid's on.", 1.5);
      else if (c.flavor && c.flavor !== t.flavor && c.fill > 0.02) showHint(`That cup has ${DRINK_LABEL[c.flavor]} in it.`, 2);
      else {
        if (c.flavor !== t.flavor) counter.setCupFlavor(c, t.flavor);
        pt.mode = "pour";
        t.pouring = true;
      }
    } else if (hit.type === "cup") {
      // Pick any cup up, full or empty, to move it or take it to the tray.
      const c = counter.cups[hit.idx];
      startHold(pt, { type: "drink", flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid, from: { x: c.x, z: c.z } });
      counter.removeCup(c);
    } else if (hit.type === "spill") {
      const t = counter.taps[hit.idx];
      if (t.puddle > 0.01) {
        pt.mode = "wipe";
        pt.wipe = hit.idx;
      } else showHint("Stand a cup here, then hold the button on top to pour.", 2);
    }
  } else if (pt.band === "tray") {
    pt.mode = "plate";
    pt.plate = trayView.pick(ndcIn(bands.tray, x, y));
    if (pt.plate >= 0) {
      setActive(pt.plate);
      pt.part = trayView.partAt(ndcIn(bands.tray, x, y), pt.plate);
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
  while (pt.samples.length > 40) pt.samples.shift();
  const dx = pt.x - pt.x0;
  const dy = pt.y - pt.y0;
  if (Math.hypot(dx, dy) > 12) pt.moved = true;

  switch (pt.mode) {
    case "swipe": {
      // Sideways swipes on the counter are free for station actions; counters change from the tab
      // bar, or by swiping along the trash chute with empty hands.
      const dx = pt.x - pt.x0;
      if (pt.chute && !pt.paged && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(pt.y - pt.y0) * 1.5) {
        pt.paged = true;
        goToStop(counter.stop + (dx < 0 ? 1 : -1));
      }
      break;
    }
    case "egg":
      if (bandAt(pt.y) === "counter") moveEgg(pt);
      break;
    case "held":
      moveHold(pt);
      hoverTab(pt, e.timeStamp);
      if (pt.held?.payload.type === "salt") shakeSalt(pt, pt.x - lastX, pt.y - lastY);
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
    case "rub":
      // Scrub egg off the grille.
      if (counter.rubMess(pt.wipe, Math.hypot(pt.x - lastX, pt.y - lastY) / 380)) {
        sfx.pop();
        showHint("All clean.", 1.2);
        pt.mode = "none";
      }
      break;
    case "grill":
      if (pt.foldFrom && pt.hit?.type === "grillItem" && foldMove(pt, pt.hit.item)) break;
      // Turn into a drag once the finger travels sideways or down, reaches the tray, or lingers.
      // A quick upward flick that stays on the counter is a flip, decided on release.
      if (pt.moved && pt.hit?.type === "grillItem" && (now - pt.t0 > 400 || Math.abs(dx) > Math.abs(dy) || dy > 0 || bandAt(pt.y) !== "counter")) {
        const item: GrillItem = pt.hit.item;
        if (item.flipT < 0) {
          counter.removeGrillItem(item);
          const at = { x: item.x, z: item.z };
          // A cheesed patty comes off the grill as a little stack, and a filled tortilla with its filling.
          if (item.topping) startHold(pt, { type: "stack", layers: [item.piece, item.topping.piece].map((piece) => ({ piece, offX: 0, offZ: 0 })), grill: at });
          else if (item.piece.fill?.length) {
            startHold(pt, { type: "stack", layers: offTortilla(item.piece), grill: at });
          } else startHold(pt, { type: "piece", piece: item.piece, fromGrill: at });
        }
      }
      break;
    case "plate": {
      // Drag a tray's thing off it (after build #82: what's under the finger, the cup, the fries or
      // the main). Sideways onto another tray carries it whole, to fix a thing put on the wrong
      // tray; down onto the counter peels the main's top layer off (a sandwich or a quesadilla comes
      // whole). Drop it in the trash, on the grill or another tray; anywhere else it goes back.
      const s = pt.plate >= 0 ? game.slots[pt.plate] : null;
      if (!s) break;
      const down = bandAt(pt.y) === "counter";
      const sideways = !down && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!down && !sideways) break;
      const ls = s.plate.layers;
      const part = pt.part === "cup" && s.plate.drink ? "cup" : pt.part === "fries" && s.plate.fries ? "fries" : ls.length ? "main" : s.plate.drink ? "cup" : s.plate.fries ? "fries" : null;
      if (part === "main" && sideways) {
        // The whole dish, to another tray.
        startHold(pt, { type: "stack", layers: ls.splice(0), fromPlate: pt.plate, whole: true });
      } else if (part === "main" && ls[0].piece.kind === "dough" && (ls.length === 1 || !(AFTER_OVEN.has(ls[ls.length - 1].piece.kind)))) {
        // A flatbread only moves to the counter on the peel (what went on after the oven still peels off by hand).
        showHint("Flatbreads move on the peel: carry it up here, slide it under, and swipe up.", 2.5);
        pt.mode = "none";
        break;
      } else if (part === "main" && ls[0].piece.folded) {
        // A quesadilla comes off whole, to go back on the comal or another tray.
        startHold(pt, { type: "stack", layers: ls.splice(0), fromPlate: pt.plate });
      } else if (part === "main" && counter.middle === "press" && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind) && ls.length > 1) {
        // A sandwich with its lid on comes off whole, to go in the press or on the board.
        startHold(pt, { type: "stack", layers: ls.splice(0), fromPlate: pt.plate });
        hintOnce("panini-lift", "Drop the sandwich in an open bay and pull the handle down to press it.", 3.5);
      } else if (part === "main") {
        // Sauce can't be scraped off by hand (Undo takes a squeeze back): it comes off with what it's on.
        const n = ls.length > 1 && isSauce(ls[ls.length - 1].piece.kind) && ls[ls.length - 1].piece.stroke ? 2 : 1;
        if (n === 2 || (ls.length === 1 && isSauce(ls[0].piece.kind))) {
          startHold(pt, { type: "stack", layers: ls.splice(ls.length - n), fromPlate: pt.plate });
          hintOnce("sauce-off", "Sauce comes off with what it's on. Undo takes back a squeeze you didn't mean.", 3);
        } else {
          const top = ls.pop()!;
          startHold(pt, { type: "piece", piece: top.piece, fromGrill: null, fromPlate: pt.plate });
          hintOnce("peel", counter.middle === "press" ? "Peeled off the top layer. Drop it in the trash slot, in the press, or on another tray." : "Peeled off the top layer. Drop it in the trash slot, on the grill, or on another tray.", 3);
        }
      } else if (part === "cup") {
        const d = s.plate.drink!;
        s.plate.drink = null;
        startHold(pt, { type: "drink", flavor: d.flavor, fill: d.fill, size: d.size, ice: !!d.ice, lid: !!d.lid, from: null, fromPlate: pt.plate, ...(d.garnish ? { garnish: d.garnish } : {}) });
      } else if (part === "fries") {
        const f = s.plate.fries!;
        s.plate.fries = null;
        startHold(pt, { type: "carton", size: f.size, cook: f.cook, fill: f.fill, pack: -1, salt: f.salt ?? 0, curds: !!f.curds, gravy: !!f.gravy, fry: fryOf(f), fromPlate: pt.plate, held: f.held ?? 0 });
      } else break;
      syncTray(pt.plate, false);
      break;
    }
    case "basket":
      if (pt.moved && pt.hit?.type === "basket" && (now - pt.t0 > 400 || dy > 0 || Math.abs(dx) > Math.abs(dy) || bandAt(pt.y) !== "counter")) {
        const b = counter.baskets[pt.hit.idx];
        if (b.shell) {
          const shell = b.shell;
          counter.setBasketShell(pt.hit.idx, null);
          b.loaded = false;
          b.down = false;
          startHold(pt, { type: "piece", piece: shell, fromGrill: null, fromBasket: pt.hit.idx });
          hintOnce("tostada-up", "Drag the tostada up to a tray, then pile beans, lettuce, cheese and crema on it.", 3);
        } else if (b.loaded) {
          b.loaded = false;
          b.down = false;
          startHold(pt, { type: "fries", cook: b.cook, basket: pt.hit.idx, amount: b.amount, fry: b.fry, held: b.held });
        }
      }
      break;
    case "sauce":
      sauceMove(pt);
      break;
    case "handle":
      // Pull the handle down to close the lid; swipe it up to lift it.
      if (pt.hit?.type === "handle" && Math.abs(dy) > 26 && Math.abs(dy) > Math.abs(dx)) {
        const i = pt.hit.idx;
        const b = counter.bays[i];
        if (dy > 0 && !b.closed) tryCloseBay(i);
        else if (dy < 0 && b.closed) openBay(i);
        pt.mode = "none";
      }
      break;
    case "bay":
      if (pt.moved && pt.hit?.type === "bay") {
        const i = pt.hit.idx;
        const b = counter.bays[i];
        if (b.closed) {
          // A swipe up on a shut lid lifts it too; pulling down only presses harder.
          if (dy < -26 && -dy > Math.abs(dx)) openBay(i);
          else if (dy > 26) hintOnce("press-shut", "It's pressing. Swipe the handle up to lift the lid.", 2.5);
          else showHint("Lift the lid first: swipe the handle up.", 2);
          pt.mode = "none";
        } else if (b.layers.length) {
          const layers = b.layers;
          counter.setBay(b, []);
          startHold(pt, { type: "stack", layers, bay: i });
        } else pt.mode = "none";
      }
      break;
    case "ladle":
      paintLadle(pt);
      break;
    case "fold":
      if (pt.peelFold) {
        const f = pt.peelFold;
        const q = counter.buildPoint(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), f.holder === counter.peel ? PEEL_Y : 0.1), Infinity, f.holder);
        if (q && Math.sign(q.x) !== Math.sign(f.x) && Math.abs(q.x) > 0.25) {
          foldPie(f.holder);
          pt.mode = "none";
          break;
        }
        // Up or down the screen from the peel, it's the peel being picked up after all.
        if (f.holder === counter.peel && Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          pt.peelFold = undefined;
          grabPeel(pt);
        }
      }
      break;
    case "peel":
      movePeel(pt);
      break;
    case "peelPie":
      // A baked pie lifted off the peel by hand, to go up to a tray.
      if (pt.moved && counter.peel.layers.length) {
        const layers = counter.peel.layers;
        counter.setPeel([]);
        startHold(pt, { type: "stack", layers, peel: true });
        hintOnce("pie-hand", "Up to the tray with it.", 2);
      }
      break;
    case "rack": {
      // The taco rack on the comal: a drag lifts it whole, to go up to a tray.
      if (!pt.moved) break;
      const layers = counter.rack.layers;
      if (!layers.length) {
        showHint("Stand warm tortillas in the rack and fill them there, then drag it up to a tray.", 2.5);
        pt.mode = "none";
        break;
      }
      counter.setRack([]);
      startHold(pt, { type: "stack", layers, rack: true });
      hintOnce("rack-lift", "Up to a tray with it. A tray's tacos start to cool from when they land.", 3);
      break;
    }
    case "board": {
      // A drag lifts the sandwich off the board (cutting is the knife's job: see the knife below).
      const bd = counter.board!;
      if (!pt.moved || !bd.layers.length) break;
      if (counter.middle === "oven" && !bakedPie(bd)) {
        showHint("Lift it with the peel: push the blade in under it.", 2);
        pt.mode = "none";
      } else {
        const layers = bd.layers;
        counter.setBoard([]);
        startHold(pt, { type: "stack", layers, board: true });
      }
      break;
    }
    case "knife":
      if (pt.moved) carryKnife(pt);
      break;
  }
});

/** Seconds to hold a quesadilla on the comal before it opens back out. */
const UNFOLD_HOLD = 0.5;

/**
 * The fold: a press on a filled tortilla's edge, dragged across its middle, folds it over into a
 * half moon (a quesadilla). True while the gesture is still a fold (so it doesn't turn into a drag).
 */
function foldMove(pt: Pointer, it: GrillItem): boolean {
  const from = pt.foldFrom!;
  if (it.held || it.flipT >= 0 || it.piece.folded) {
    pt.foldFrom = undefined;
    return false;
  }
  const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), GRILL_TOP);
  const cur = { x: g.x - counter.world(HOME_PAGE, 0, 0, 0).x, z: g.z };
  const R = TORTILLA_R[it.piece.kind as "corn" | "flour"] * GRILL_SCALE;
  const ux = from.x - it.x;
  const uz = from.z - it.z;
  const ul = Math.hypot(ux, uz) || 1;
  // How far past the middle the finger has come, along the line from the edge it started on.
  const along = ((cur.x - it.x) * ux + (cur.z - it.z) * uz) / ul;
  if (along < -R * 0.2) {
    // Folding keeps the meter where it was (the half that goes over brings its cooked face up).
    setFolded(it.piece, true);
    // The half moon lies on the side the finger went, its crease across the drag.
    it.piece.foldYaw = Math.atan2(-ux, -uz);
    pt.foldFrom = undefined;
    pt.mode = "none";
    sfx.flip();
    buzz(15);
    hintOnce("quesa-flip", "Folded! Flip it once so both sides crisp, and take it off once the cheese has melted. Press and hold it to unfold.", 3.5);
    return true;
  }
  if (Math.hypot(cur.x - it.x, cur.z - it.z) > R * 1.5 || bandAt(pt.y) !== "counter") {
    // Left the tortilla: it's a drag after all.
    pt.foldFrom = undefined;
    return false;
  }
  return true;
}

/** Close a press bay on whatever is in it. */
function closeBay(i: number): void {
  const b = counter.bays[i];
  counter.setLid(i, true);
  sfx.thud();
  if (b.layers.length) sfx.sizzleHit();
  buzz(18);
  if (b.layers.length) hintOnce("press-lift", "Both sides cook at once. Watch the meter on the lid, then swipe the handle up to lift it.", 4);
}

/** Pull a bay's lid down, unless what's in it can't be pressed: then the lid bounces back up. */
function tryCloseBay(i: number): void {
  const b = counter.bays[i];
  const ks = b.layers.map((l) => l.piece.kind);
  if (pressable(ks)) return closeBay(i);
  counter.refuseLid(i);
  sfx.pop();
  buzz(8);
  showHint(
    BREADS.has(ks[0])
      ? "Put the top bread on first: the lid only closes on a whole sandwich."
      : PROTEINS.has(ks[0])
        ? `Press the ${KIND_LABEL[ks[0]].toLowerCase()} on its own, or build the sandwich on bread.`
        : "Start on bread: the lid only closes on a sandwich, or a bread or patty on its own.",
    2.5,
  );
}

/** Lift a press bay's lid. */
function openBay(i: number): void {
  counter.setLid(i, false);
  sfx.whoosh();
  if (counter.bays[i].layers.length) hintOnce("press-out", "Drag it out of the bay to the tray.", 2.5);
}

// ---------------------------------------------------------------------------
// The knife (DESIGN §31, simplified after build #84): Harbor City cuts its paninis in half on the
// board, Port Amber its flatbreads in four (on the board, or on the peel). Tap the knife (it lifts)
// and tap the food, or drag the knife onto the food: either cuts at once, always the same clean
// cut. Undo takes a cut back.

/** The knife was tapped: lifted off the board, waiting for a tap on the food. */
let knifeArm = false;
/** The knife carried by a finger, drawn in the counter scene. */
let knifeInHand: THREE.Object3D | null = null;
const KNIFE_SCALE = 0.9;

/**
 * What the knife cuts on: the board, or at the oven the peel when the board is bare (after build
 * #82: a baked flatbread can be cut right on the peel).
 */
function cutHolder(): PieHolder | null {
  const bd = counter.board?.on ? counter.board : null;
  if (bd?.layers.length) return bd;
  const pie = counter.peel.layers[0]?.piece;
  if (counter.middle === "oven" && !counter.peelHeld && pie?.kind === "dough" && paleSide(pie) >= 0.12) return counter.peel;
  return bd;
}
/** A screen point over what the knife cuts on (the board, or the peel at the oven). */
function overCutHolder(x: number, y: number): boolean {
  const h = cutHolder();
  if (!h?.layers.length) return false;
  const ndc = ndcIn(bands.counter, x, y);
  if (h === counter.peel) {
    const hit = counter.hit(ndc);
    return hit?.type === "peel" || counter.groundPoint(ndc, PEEL_Y).distanceTo(counter.peelPointWorld().setY(PEEL_Y)) < 1.4;
  }
  return counter.overBoard(counter.groundPoint(ndc, 0.12));
}
/** What's on the cutting spot and the pieces a cut marks, or a reason it can't be cut (said as a hint). */
function cuttable(): { pieces: Piece[]; round: boolean } | string {
  const ls = cutHolder()?.layers ?? [];
  const base = ls[0]?.piece;
  if (!base) return counter.middle === "oven" ? "Set a baked flatbread on the board or keep it on the peel, then cut it." : "Put a pressed panini on the board first.";
  if (base.kind === "dough") {
    if (base.folded) return "Calzones go out whole.";
    if ((base.cuts ?? 0) >= 2) return "It's in four already.";
    return { pieces: [base], round: true };
  }
  const top = ls[ls.length - 1]?.piece;
  if (!top || !BREADS.has(top.kind) || ls.length < 2) return "Only a closed panini gets cut.";
  if (top.cut) return "It's already cut.";
  return { pieces: ls.filter((l) => BREADS.has(l.piece.kind)).map((l) => l.piece), round: false };
}

/** Cut what's there: a panini in half, a flatbread in four. False (with a hint) if there's nothing to cut. */
function cutNow(at: { x: number; y: number }): boolean {
  const c = cuttable();
  const h = cutHolder();
  if (typeof c === "string" || !h) {
    showHint(typeof c === "string" ? c : "There's nothing to cut.", 2);
    buzz(8);
    return false;
  }
  const was = c.pieces.map((p) => ({ cut: !!p.cut, cutQ: p.cutQ, cuts: p.cuts }));
  if (c.round) {
    Object.assign(c.pieces[0], { cuts: 2, cutQ: 1 });
    counter.updatePie(h);
  } else {
    for (const p of c.pieces) Object.assign(p, { cut: true, cutQ: 1 });
    counter.setBoard([...h.layers]);
  }
  history.push({ what: { k: "cut", pieces: c.pieces, was }, from: { at: "knife" }, to: h === counter.peel ? { at: "peel" } : { at: "board" } });
  sfx.flip();
  buzz(25);
  nameBubble(at, c.round ? "In four" : "Cut in half", 1100);
  if (c.round) hintOnce("cut-four-done", "In four. Drag it up to the tray.", 2.5);
  else hintOnce("cut-done", "Cut in half. Drag it up to the tray.", 2.5);
  return true;
}

/** The knife dragged off its spot: it follows the finger, and cuts the food once it's carried over it. */
function carryKnife(pt: Pointer): void {
  if (!knifeInHand) {
    knifeInHand = makeKnife();
    knifeInHand.scale.setScalar(KNIFE_SCALE);
    counter.setKnife("away");
    counter.setHeld(knifeInHand);
    knifeArm = false;
  }
  const band = bandAt(pt.y);
  counter.moveHeld(band === "counter" ? ndcIn(bands.counter, pt.x, pt.y) : null);
  // Over food that's already cut, nothing happens (no hint while the knife's only passing).
  if (!pt.cutDone && band === "counter" && overCutHolder(pt.x, pt.y) && typeof cuttable() !== "string") pt.cutDone = cutNow(pt);
}

/** Let go of the knife: a tap lifts it (or puts it back down); carried, it goes back by the board. */
function endKnife(pt: Pointer, cancelled: boolean): void {
  if (knifeInHand) {
    putKnifeBack();
    return;
  }
  if (cancelled || pt.moved) return;
  if (knifeArm) return disarm();
  disarm();
  knifeArm = true;
  counter.setKnife("lifted");
  const what = counter.middle === "oven" ? "flatbread" : "panini";
  nameBubble(pt, `Knife: tap the ${what}`, 2200);
  hintOnce("knife-arm", `Now tap the ${what}. Or drag the knife onto it.`, 3.5);
  sfx.pop();
}
function putKnifeBack(): void {
  if (!knifeInHand) return;
  counter.setHeld(null);
  knifeInHand = null;
  counter.setKnife("rest");
}

/** A sandwich with bread top and bottom (it won't take more on top, nor go on top of something). */
const closedSandwich = (ls: readonly Layer[]): boolean => ls.length > 1 && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind);
/** Layers landing on a build in the press or on the board: a lone piece lands a little loose, a stack as it is. */
const stackOn = (base: Layer[], add: Layer[]): Layer[] => (add.length === 1 ? [landing(base, add[0].piece, 0.06)] : add);

/**
 * Drop food on the press counter: into an open bay or on the cutting board. A sandwich can be
 * built in either, piece by piece, or dropped in whole; the bay's lid only comes down on a bread
 * or a protein on its own, or a sandwich with bread top and bottom (see pressable). True if it
 * was taken.
 */
function pressDrop(pt: Pointer, payload: Extract<Payload, { type: "stack" | "piece" }>): boolean {
  const ndc = ndcIn(bands.counter, pt.x, pt.y);
  const layers: Layer[] = payload.type === "stack" ? payload.layers : [{ piece: payload.piece, offX: 0, offZ: 0 }];
  if (counter.overBoard(counter.groundPoint(ndc, 0.12))) {
    const bd = counter.board!;
    if (bd.layers.length && (closedSandwich(bd.layers) || closedSandwich(layers))) return showHint("The board's taken.", 1.5), false;
    // One more piece (or a patty off the press) on what's there, or a start on the empty board.
    counter.setBoard(bd.layers.length ? [...bd.layers, ...stackOn(bd.layers, layers)] : layers);
    sfx.plop();
    const ls = counter.board!.layers;
    if (ls.length > 1 && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind)) hintOnce("cut", "To cut it in half, tap the knife, then the panini (or drag the knife across it).", 3.5);
    return true;
  }
  const bi = counter.overBay(counter.groundPoint(ndc, PLATE.y + 0.1));
  if (bi < 0) return false;
  const b = counter.bays[bi];
  if (b.closed) return showHint("Lift the lid first: swipe the handle up.", 2), false;
  if (b.layers.length) {
    if (closedSandwich(b.layers) || closedSandwich(layers)) return showHint("That bay is full. Use another one.", 1.8), false;
    // Building in the bay: the piece (or a pressed patty from another bay) goes on top.
    counter.setBay(b, [...b.layers, ...stackOn(b.layers, layers)]);
    sfx.plop();
    const ks = b.layers.map((l) => l.piece.kind);
    if (pressable(ks)) hintOnce("press-close", "Pull the handle down to close the lid.", 3);
    else hintOnce("press-build", "Build it up, bread last. The lid only closes on a whole sandwich, or a bread or patty on its own.", 4);
    return true;
  }
  const base = layers[0].piece.kind;
  const lone = layers.length === 1;
  counter.setBay(b, layers);
  sfx.plop();
  if (pressable(layers.map((l) => l.piece.kind))) hintOnce("press-close", "Pull the handle down to close the lid.", 3);
  if (lone && PROTEINS.has(base)) hintOnce("press-protein", `Press the ${KIND_LABEL[base].toLowerCase()} on its own first, then build the sandwich and press it again.`, 4);
  return true;
}

// ---------------------------------------------------------------------------
// The oven (Orchard Isle; DESIGN §24, after builds #69 and #71). Flatbreads are built on the peel
// as it lies at home (or on the bench), and only the peel moves them: drag it by its handle, push
// the blade in under a pie (or set it under and swipe up) to lift it, swipe down to set it down
// where the blade is (in the oven, on the bench or board, on a tray), and push a pie in the oven
// sideways with the blade's tip to spin its pale side round to the hot back wall.

/** The order a pie on the counter is being built for: the one it was started for, else the active one. */
function pieOrder(d: Piece | undefined): Order | null {
  const id = d?.forOrder;
  const s = id !== undefined ? game.slots.find((x) => x.order?.id === id) : null;
  return s?.order ?? game.slots[game.active]?.order ?? null;
}

/** An unbaked pie being built: on the peel at home first, else on the bench or board. */
function buildHolder(): PieHolder | null {
  const open = (h: PieHolder) => {
    const d = h.layers[0]?.piece;
    return !!d && !d.folded && paleSide(d) <= 0.2;
  };
  if (counter.peelHome && open(counter.peel)) return counter.peel;
  if (open(counter.rest)) return counter.rest;
  return null;
}
/** Redraw a holder after its layers changed. */
function syncHolder(h: PieHolder): void {
  if (h === counter.peel) counter.setPeel(h.layers);
  else counter.setRest(h.layers);
}

/** A fresh base onto the empty peel or bench. */
function putBase(h: PieHolder, layers: Layer[]): void {
  const d = layers[0].piece;
  if (d.forOrder === undefined) d.forOrder = game.slots[game.active]?.order?.id;
  h.layers = layers;
  syncHolder(h);
  sfx.topping();
  if (layers.length === 1 && paleSide(d) < 0.05) {
    const o = pieOrder(d);
    const white = o && !o.layers.some((l) => l.kind === "redsauce");
    hintOnce(white ? "peel-white" : "peel-sauce", white ? (o!.layers.some((l) => l.kind === "oil") ? "A white base: drizzle olive oil over it from the bottle, then the toppings." : "A white base: no sauce, just the toppings.") : "Now the sauce: hold the ladle in the pot and spread it in a spiral over the base.", 3.5);
  }
}

/** One piece from a pan onto a pie being built. */
function addToPie(h: PieHolder, piece: Piece): boolean {
  const ls = h.layers;
  const d = ls[0]?.piece;
  if (!d) return showHint("Lay a dough base on the peel first.", 2), false;
  if (d.folded) return showHint("It's folded already: the filling goes in before the fold.", 2), false;
  // After the oven only the fresh things go on (after build #84 on the peel or board too, not just the tray).
  const baked = paleSide(d) > 0.2;
  if (baked && !AFTER_OVEN.has(piece.kind)) return showHint("It's been baked. Toppings go on before the oven; basil, rocket and honey after.", 2.5), false;
  ls.push({ piece, offX: 0, offZ: 0 });
  syncHolder(h);
  sfx.topping();
  const o = pieOrder(d);
  if (COUNTED.has(piece.kind)) {
    const n = ls.filter((l) => l.piece.kind === piece.kind).length;
    const want = o?.layers.find((e) => e.kind === piece.kind)?.count;
    if (want) showHint(`${KIND_LABEL[piece.kind]} ${n} of ${want}${n > want ? ": generous!" : ""}`, 1.2);
  }
  if (baked) {
    // Fresh on a baked pie: just right.
  } else if (AFTER_OVEN.has(piece.kind) && o?.layers.find((e) => e.kind === piece.kind)?.after) hintOnce("after-oven", `${KIND_LABEL[piece.kind]} goes on after the oven, at the tray, or it wilts.`, 3);
  else if (o?.layers[0]?.folded && !d.folded) hintOnce("calzone-fold", "A calzone: once it's filled, press near the side of the dough and drag across the middle to fold it.", 4);
  else if (h === counter.peel) hintOnce("peel-carry", "When it's built, drag the peel by its handle into the oven and swipe down to slide the pie off.", 4);
  return true;
}

/** Fold a pie being built over into a calzone. */
function foldPie(h: PieHolder): void {
  const ls = h.layers;
  const d = ls[0]?.piece;
  if (!d) return;
  d.folded = true;
  h.layers = [...ls];
  syncHolder(h);
  sfx.doughFold();
  buzz(15);
  hintOnce("calzone-in", "Folded! Into the oven with it on the peel. A calzone is thick and bakes slower.", 3.5);
}

/** A press near the side of an unbaked pie on the peel (at home) or the bench: the start of a fold. False if it isn't one. */
function startFold(pt: Pointer, h: PieHolder): boolean {
  const d = h.layers[0]?.piece;
  if (!d || d.folded || paleSide(d) > 0.1) return false;
  if (h === counter.peel && !counter.peelHome) return false;
  const q = counter.buildPoint(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), h === counter.peel ? PEEL_Y : 0.1), 1.3, h);
  if (!q || Math.abs(q.x) < 0.4 || Math.abs(q.z) > 0.9) return false;
  pt.mode = "fold";
  pt.peelFold = { holder: h, x: q.x, z: q.z };
  return true;
}

/** A press on the peel: the start of a fold (near the side of the raw pie on it), or the peel taken in hand. */
function startPeel(pt: Pointer): void {
  if (startFold(pt, counter.peel)) return;
  // A baked pie on the peel at rest can be picked up by hand and taken to a tray (after build #84);
  // the handle still carries the peel.
  if (bakedPie(counter.peel) && counter.peelHome && !nearPeelHandle(pt)) {
    pt.mode = "peelPie";
    return;
  }
  grabPeel(pt);
}
/** A pie on this holder that has been in the oven (it can go up to a tray by hand). */
function bakedPie(h: PieHolder): boolean {
  const d = h.layers[0]?.piece;
  return !!d && d.kind === "dough" && paleSide(d) >= 0.12;
}
/** The press is nearer the peel's handle than the pie on its blade. */
function nearPeelHandle(pt: Pointer): boolean {
  const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), PEEL_Y);
  return g.distanceTo(counter.peelHandleWorld().setY(PEEL_Y)) < g.distanceTo(counter.peelPointWorld().setY(PEEL_Y));
}
function grabPeel(pt: Pointer): void {
  pt.mode = "peel";
  peelJust = null;
  pt.flickT = -Infinity;
  counter.grabPeel(ndcIn(bands.counter, pt.x, pt.y));
  // A pie the blade is already under (one just built on it, or set down there) isn't slid onto it.
  slideArm.clear();
  slideScoop(true);
  sfx.peelLift();
  const full = counter.peel.layers.length > 0;
  hintOnce(full ? "peel-launch" : "peel-scoop", full ? "Over a free spot in the oven, swipe down to slide the pie off." : "Push the blade in under a pie to lift it onto the peel (or set it under and swipe up).", 3.5);
}

/** The peel follows the finger; over the trays it shows over the tray it would serve to. Pushed under a pie it scoops it; a quick swipe up or down scoops or drops. */
function movePeel(pt: Pointer): void {
  const band = bandAt(pt.y);
  counter.movePeel(band === "counter" ? ndcIn(bands.counter, pt.x, pt.y) : null);
  const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : band === "customers" ? game.active : -1;
  showPeelGhost(slot);
  // Once the blade has properly left where it last scooped from (or lingered there a while), a
  // swipe down that starts there counts again.
  const pj = peelJust;
  if (pj && pj.left === Infinity) {
    const b = counter.peelBlade();
    const p = pj.key.startsWith("spot") ? counter.ovenSpots[+pj.key.slice(4)] : pj.key === "rest" ? counter.rest : null;
    const away = pj.key.startsWith("slot") ? slot !== +pj.key.slice(4) : !b || !p || Math.hypot(b.x - p.x, b.z - p.z) > 1.1;
    if (away || performance.now() - pj.at > 1500) pj.left = performance.now();
  }
  if (band === "counter") slideScoop(false);
  const f = flickOf(pt.samples, pt.flickT);
  if (f) {
    pt.flickT = pt.samples[pt.samples.length - 1].t + 1;
    peelFlick(pt, f);
  }
}

/** The pies the peel can slide under: in the oven, and on the bench or board. */
function peelPies(): { key: string; place: PiePlace; take: () => void }[] {
  const out: { key: string; place: PiePlace; take: () => void }[] = [];
  for (let i = 0; i < counter.ovenCount; i++) if (counter.ovenSpots[i].layers.length) out.push({ key: `spot${i}`, place: counter.ovenSpots[i], take: () => scoopSpot(i) });
  if (counter.rest.layers.length) out.push({ key: "rest", place: counter.rest, take: scoopRest });
  return out;
}
/** Which pies a slide under would take (the blade's tip came at them from the front), by target key. */
const slideArm = new Map<string, boolean>();
/**
 * The empty blade pushed forward in under a pie scoops it, like a real peel: no swipe needed.
 * `init` only notes where the blade is (on picking the peel up), so a pie already on the blade stays put.
 */
function slideScoop(init: boolean): void {
  const b = counter.peelBlade();
  if (!b) return;
  for (const { key, place, take } of peelPies()) {
    const was = init ? false : (slideArm.get(key) ?? false);
    const armed = slideArmed(was, b, place, PEEL);
    if (!init && armed && !counter.peel.layers.length && slidUnder(b, place, PEEL)) {
      slideArm.set(key, false);
      take();
      return;
    }
    slideArm.set(key, armed);
  }
}

/** Scoop the pie in oven spot i onto the peel. */
function scoopSpot(i: number): void {
  const layers = counter.ovenSpots[i].layers;
  counter.setSpot(i, []);
  counter.setPeel(layers);
  noteFood(layers, { at: "spot", i }, { at: "peel" });
  justDid(`spot${i}`, "down");
  sfx.peelScrape();
  buzz(12);
  hintOnce("oven-out", counter.board?.on && !layers[0].piece.folded ? "Out it comes. Set it on the board (swipe down over it) and cut it in four with the knife, then up to a tray." : "Out it comes. Carry it up to a tray and swipe down. Basil, rocket and honey go on there.", 3.5);
}
/** Scoop the pie on the bench or board onto the peel. */
function scoopRest(): void {
  noteFood(counter.rest.layers, restPlace(), { at: "peel" });
  counter.setPeel(counter.rest.layers);
  counter.setRest([]);
  justDid("rest", "down");
  sfx.peelScrape();
  buzz(12);
}

/** The peel (and its pie) drawn hovering over a tray while it's carried up there. */
let peelGhost: { key: string; obj: THREE.Object3D } | null = null;
function showPeelGhost(slot: number): void {
  if (slot < 0) {
    trayView.showGhost(-1, null);
    return;
  }
  const key = counter.peel.layers.map((l) => l.piece.uid).join(",");
  if (!peelGhost || peelGhost.key !== key) {
    if (peelGhost) disposeObject(peelGhost.obj);
    const g = new THREE.Group();
    const peel = makePeel();
    peel.scale.setScalar(1 / GRILL_SCALE);
    g.add(peel);
    if (counter.peel.layers.length) {
      const fb = makeFlatbread(counter.peel.layers.map((l) => l.piece));
      fb.position.y = PEEL.y / GRILL_SCALE + 0.01;
      g.add(fb);
    }
    peelGhost = { key, obj: g };
  }
  trayView.showGhost(slot, peelGhost.obj);
}

/**
 * Where the peel last scooped a pie from or set one down, and the swipe back the other way that's
 * ignored there: after a scoop, pulling the peel back out (quickly, down the screen) is a carry,
 * not a drop, for any swipe that began before the blade had left (or lingered there 1.5 s); after
 * a drop, the finger's little rebound up isn't a scoop. `left` is when swipes there count again.
 */
let peelJust: { key: string; dir: "up" | "down"; at: number; left: number } | null = null;
const targetKey = (t: PeelTarget | null): string | null => (t ? (t.kind === "spot" ? `spot${t.idx}` : t.kind) : null);
/** Note a scoop (ignore a swipe down there until the blade has left) or a drop (ignore the rebound up). */
function justDid(key: string, ignore: "up" | "down"): void {
  const now = performance.now();
  peelJust = { key, dir: ignore, at: now, left: ignore === "down" ? Infinity : now + 450 };
}
/**
 * A swipe `dir` that began at `t` (ms) over `key` is the carry or rebound after a scoop or drop
 * there. After a scoop on the counter, a swipe down anywhere on it that began before the blade left
 * is the pull out (so a pie never drops into the next spot on its way out).
 */
const ignored = (key: string | null, dir: "up" | "down", t: number): boolean => {
  const pj = peelJust;
  if (!key || !pj || pj.dir !== dir || t >= pj.left) return false;
  const counter = (k: string) => !k.startsWith("slot");
  return pj.key === key || (dir === "down" && counter(key) && counter(pj.key));
};

/** A swipe with the peel in hand: up to scoop the pie the blade is under, down to set its pie down there. */
function peelFlick(pt: Pointer, f: Flick): void {
  const fromBand = bandAt(f.from.y);
  const full = counter.peel.layers.length > 0;
  if (fromBand === "tray" || fromBand === "customers") {
    const slot = fromBand === "tray" ? trayView.pick(ndcIn(bands.tray, f.from.x, f.from.y)) : game.active;
    if (slot < 0) return;
    const plate = game.slots[slot].plate;
    if (ignored(`slot${slot}`, f.dir, f.from.t)) return;
    if (f.dir === "down" && full) {
      const layers = counter.peel.layers;
      if (plate.layers.length) return void showHint("That tray already has food on it.", 1.8);
      if (paleSide(layers[0].piece) < 0.12) hintOnce("raw-pie", "That one hasn't been in the oven yet!", 2);
      if (!addToPlate(slot, { type: "stack", layers }, 0)) return;
      counter.setPeel([]);
      noteFood(layers, { at: "peel" }, { at: "tray", slot });
      justDid(`slot${slot}`, "up");
      setActive(slot);
      sfx.pieDown();
      buzz(12);
      showPeelGhost(slot);
      const after = pieOrder(layers[0].piece)?.layers.some((l) => l.after);
      hintOnce("pie-served", after ? "On the tray. Basil, rocket and honey go on now, then tap Serve." : "On the tray. Tap Serve to hand it over.", 3);
    } else if (f.dir === "up" && !full && plate.layers[0]?.piece.kind === "dough") {
      counter.setPeel(plate.layers.splice(0));
      noteFood(counter.peel.layers, { at: "tray", slot }, { at: "peel" });
      justDid(`slot${slot}`, "down");
      syncTray(slot, false);
      sfx.peelScrape();
      showPeelGhost(slot);
    }
    return;
  }
  if (fromBand !== "counter") return;
  const now = ndcIn(bands.counter, pt.x, pt.y);
  if (f.dir === "up") {
    if (full) return;
    // Wherever along the swipe the blade was under a pie counts (a quick push in under it and up
    // is one move), and the peel stays there: the swipe doesn't carry it on up the screen.
    for (const q of f.path) {
      if (bandAt(q.y) !== "counter") break;
      const at = ndcIn(bands.counter, q.x, q.y);
      const t = counter.peelTarget(counter.bladeAt(at));
      const pie = t?.kind === "spot" ? counter.ovenSpots[t.idx].layers.length > 0 : t?.kind === "rest" && counter.rest.layers.length > 0;
      if (!t || !pie || ignored(targetKey(t), "up", f.from.t)) continue;
      counter.anchorPeel(at, now);
      if (t.kind === "spot") scoopSpot(t.idx);
      else scoopRest();
      slideArm.set(targetKey(t)!, false);
      return;
    }
    if (counter.bladeAt(ndcIn(bands.counter, f.from.x, f.from.y)).z < 0.2) hintOnce("scoop-under", "Push the blade in under a pie to lift it, or set it under and swipe up.", 2.5);
    return;
  }
  if (!full) return;
  // A swipe down acts where the peel was when it began, and doesn't carry it along.
  const from = ndcIn(bands.counter, f.from.x, f.from.y);
  const b = counter.bladeAt(from);
  const t = counter.peelTarget(b);
  if (ignored(targetKey(t), "down", f.from.t)) return;
  const act = (key: string) => {
    counter.anchorPeel(from, now);
    justDid(key, "up");
    slideArm.set(key, false);
  };
  const layers = counter.peel.layers;
  const d = layers[0].piece;
  if (t?.kind === "trash") {
    act("trash");
    noteFood(layers, { at: "peel" }, TRASH);
    counter.setPeel([]);
    sfx.thud();
    buzz(20);
    return;
  }
  if (t?.kind === "rest") {
    if (counter.rest.layers.length) return void showHint(counter.rest === counter.board ? "The board's taken." : "The bench is taken.", 1.5);
    act("rest");
    counter.setRest(layers);
    counter.setPeel([]);
    noteFood(layers, { at: "peel" }, restPlace());
    sfx.pieDown();
    if (counter.rest === counter.board && !d.folded && paleSide(d) > 0.2) hintOnce("cut-four", "Now cut it in four: tap the knife, then the flatbread (or drag the knife onto it).", 3.5);
    return;
  }
  let si = t?.kind === "spot" ? t.idx : -1;
  if (si >= 0 && counter.ovenSpots[si].layers.length) {
    const near = counter.nearFreeSpot(b);
    if (near < 0) return void showHint(counter.ovenSpots.slice(0, counter.ovenCount).every((s) => s.layers.length) ? "The oven's full." : "That spot's taken.", 1.5);
    si = near;
  }
  if (si < 0) si = counter.nearFreeSpot(b);
  if (si >= 0 && ignored(`spot${si}`, "down", f.from.t)) return;
  if (si < 0) {
    if (b.z < -0.6) showHint("Swipe down over a free spot in the oven, the bench or a tray.", 2);
    return;
  }
  act(`spot${si}`);
  counter.setSpot(si, layers);
  counter.setPeel([]);
  noteFood(layers, { at: "peel" }, { at: "spot", i: si });
  sfx.pieDown(true);
  buzz(10);
  if (d.folded) hintOnce("oven-calzone", "A calzone is thick and bakes slower. Watch its crust: turn it round with the peel if one side is getting ahead.", 4);
  else hintOnce("oven-turn", "In it goes. The side facing the hot back wall browns faster: watch the crust, and if you like, push the front of the pie sideways with the peel's tip to turn it round. An even bake is best.", 5);
}

function endPeel(pt: Pointer, cancelled: boolean): void {
  if (!cancelled) {
    const f = flickOf(pt.samples, pt.flickT);
    if (f) peelFlick(pt, f);
    else if (!pt.moved) peelTapHint();
  }
  counter.releasePeel();
  trayView.showGhost(-1, null);
}
function peelTapHint(): void {
  const ls = counter.peel.layers;
  const raw = ls.length && paleSide(ls[0].piece) <= 0.2;
  showHint(!ls.length ? "Drag the peel by its handle. Push it in under a pie to lift it; drag the dough onto it for a new base." : raw && !ls[0].piece.folded ? "Sauce it and add the toppings, then drag the peel into the oven and swipe down." : "Drag the peel by its handle and swipe down where the pie should go.", 2.6);
}

/** A piece dropped on the oven counter: onto a pie being built (on the peel at home, the bench or board). True if it was taken. */
function ovenDrop(pt: Pointer, payload: Extract<Payload, { type: "stack" | "piece" }>): boolean {
  if (payload.type !== "piece") return false;
  const ndc = ndcIn(bands.counter, pt.x, pt.y);
  if (payload.piece.kind === "dough") {
    const h = counter.overBuild(counter.groundPoint(ndc, 0.1));
    if (!h) return false;
    if (h.layers.length) return showHint(h === counter.peel ? "The peel's taken." : "That's taken.", 1.5), false;
    putBase(h, [{ piece: payload.piece, offX: 0, offZ: 0 }]);
    return true;
  }
  const q = counter.buildPoint(counter.groundPoint(ndc, 0.1), 1.4);
  if (q) return addToPie(q.holder, payload.piece);
  if (counter.ovenSpots.some((s, i) => i < counter.ovenCount && s.layers.length && counter.groundPoint(ndc, HEARTH_Y).distanceTo(counter.spotPoint(i)) < 0.9)) return showHint("Toppings go on before the oven.", 2), false;
  return false;
}

/** Tomato sauce from the pot, or olive oil from its bottle, spread straight onto a pie being built. */
let ladle: { kind: SauceKind; obj: THREE.Object3D; last: number; holder: PieHolder | null; piece: Piece | null; before: number } | null = null;
function startLadle(pt: Pointer, kind: SauceKind): void {
  const h = buildHolder();
  if (!h) {
    const any = counter.peel.layers.length || counter.rest.layers.length;
    showHint(any ? "Sauce goes on a raw base, before the oven." : "Lay a dough base on the peel first: drag the dough onto it.", 2);
    buzz(10);
    return;
  }
  pt.mode = "ladle";
  pt.ladle = kind;
  if (kind === "oil") counter.liftSauce("oil");
  const obj = kind === "redsauce" ? makeSauceLadle() : counter.sauceBottle(kind);
  counter.setHeld(obj);
  ladle = { kind, obj, last: 0, holder: null, piece: null, before: 0 };
  openLadleZoom(h);
  paintLadle(pt);
  sfx.peelLift();
  if (kind === "redsauce") hintOnce("ladle", "Spread it in a spiral from the middle out, to just inside the crust. Watch the bar on the left.", 3.5);
  else hintOnce("oil", "Drizzle it over the base, then add the toppings.", 3);
}
/**
 * The flatbread close-up (after build #82): while sauce or oil goes on a base, the counter is seen
 * from above in a square over it, as burgers and paninis get at the tray, so the spread is easy to
 * see. The finger in the square spreads on the base under it.
 */
const ladleZoom = new CutZoom();
let ladleZoomOn = false;
const ladleDim = document.createElement("div");
ladleDim.className = "cut-ui";
ladleDim.hidden = true;
ui.root.appendChild(ladleDim);
function ladleFinal(): Rect {
  const w = bands.counter.w;
  const side = Math.round(Math.min(w - 12, bands.counter.h * 0.92, viewH * 0.5));
  const y = Math.round(bands.counter.y + Math.max(6, (bands.counter.h - side) * 0.35));
  return { x: Math.round((w - side) / 2), y, w: side, h: side };
}
function openLadleZoom(h: PieHolder): void {
  const food = h.food;
  if (!food) return;
  const box = new THREE.Box3().setFromObject(food);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  centre.y = box.max.y;
  const reach = Math.max(size.x, size.z) / 2;
  const a = screenOf("counter", centre.clone().add(new THREE.Vector3(-reach, 0, 0)));
  const b = screenOf("counter", centre.clone().add(new THREE.Vector3(reach, 0, 0)));
  const mid = screenOf("counter", centre);
  const side = Math.max(20, b.x - a.x);
  ladleZoom.frame(centre, reach, { x: mid.x - side / 2, y: mid.y - side / 2, w: side, h: side });
  ladleZoomOn = true;
}
function updateLadleZoom(dt: number): void {
  if (ladleZoomOn && (!ladle || game.phase !== "playing")) ladleZoomOn = false;
  ladleZoom.update(dt, ladleZoomOn ? 1 : 0, ladleFinal());
  const k = ladleZoom.eased;
  ladleDim.hidden = !(k > 0.05 && game.phase === "playing");
  if (ladleDim.hidden) return;
  const r = ladleZoom.rect;
  Object.assign(ladleDim.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  ladleDim.style.setProperty("--dim", (0.6 * k).toFixed(3));
}
/** Where the nozzle is on the counter: through the close-up when the finger's in it. */
function ladleGround(x: number, y: number): THREE.Vector3 {
  const r = ladleZoom.rect;
  if (ladleZoomOn && ladleZoom.eased > 0.85 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return ladleZoom.point(x, y).setY(PEEL_Y + 0.12);
  return counter.groundPoint(ndcIn(bands.counter, x, y), PEEL_Y + 0.12);
}
function paintLadle(pt: Pointer): void {
  const l = ladle;
  if (!l) return;
  // While the close-up eases in, the finger isn't over the base it will see yet.
  if (ladleZoomOn && ladleZoom.eased < 0.85) return;
  const g = ladleGround(pt.x, pt.y - NOZZLE_UP);
  l.obj.visible = bandAt(pt.y) === "counter";
  l.obj.position.copy(g).add(new THREE.Vector3(0, l.kind === "redsauce" ? 0.0 : 0.25, 0));
  if (bandAt(pt.y) !== "counter") return;
  const hit = counter.buildPoint(g, 1.15, l.holder ?? undefined);
  if (!hit) return;
  const h = hit.holder;
  const d = h.layers[0]?.piece;
  if (!d || d.folded || paleSide(d) > 0.2) return;
  l.holder = h;
  const r = Math.hypot(hit.x, hit.z);
  const q = r > 1 ? { x: hit.x / r, z: hit.z / r } : { x: hit.x, z: hit.z };
  const ls = h.layers;
  let top = ls[ls.length - 1];
  // Carrying on with the same sauce keeps spreading the same layer.
  if (top.piece.kind !== l.kind || !top.piece.stroke) {
    const p = newPiece(l.kind);
    p.stroke = [];
    ls.push({ piece: p, offX: 0, offZ: 0 });
    syncHolder(h);
    top = ls[ls.length - 1];
  }
  const st = top.piece.stroke!;
  if (!l.piece) {
    l.piece = top.piece;
    l.before = st.length;
  }
  const last = st[st.length - 1];
  if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 0.05) {
    st.push(q);
    const now = performance.now();
    if (now - lastSquirt > 90) {
      sfx.sauceSpread(l.kind === "oil");
      lastSquirt = now;
    }
  }
}
function ladleStroke(l: { kind: SauceKind; holder: PieHolder | null }) {
  return (l.holder ?? buildHolder())?.layers.find((x) => x.piece.kind === l.kind)?.piece.stroke;
}
function endLadle(pt: Pointer, cancelled: boolean): void {
  const l = ladle;
  ladle = null;
  if (!l) return;
  counter.setHeld(null);
  if (l.kind === "oil") counter.liftSauce(null);
  const st = ladleStroke(l);
  if (l.piece && (l.piece.stroke?.length ?? 0) > l.before) {
    const to = whereFood(l.piece);
    if (to) history.push({ what: { k: "sauce", piece: l.piece, before: l.before, kind: l.kind }, from: SUPPLY, to });
  }
  if (!cancelled && !pt.moved) {
    nameBubble(pt, l.kind === "redsauce" ? "Tomato sauce" : KIND_LABEL[l.kind]);
    showHint(l.kind === "redsauce" ? "Hold the ladle and spread the sauce over the base." : "Hold the bottle and drizzle it over the base.", 2.5);
  }
  else if (st && l.kind === "redsauce" && sauceCoverage(st, sauceRadius("redsauce")) < LADLE_BAND.lo) hintOnce("ladle-more", "A bit more sauce: right out to the crust.", 2);
  if (!cancelled && pt.moved) sfx.topping();
}
/** How much of the base the sauce being spread covers, for the level bar. */
function ladleLevel(): null | { v: number; kind: SauceKind } {
  if (!ladle) return null;
  return { v: sauceCoverage(ladleStroke(ladle), sauceRadius(ladle.kind)), kind: ladle.kind };
}

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
    case "egg":
      releaseEgg(pt, dt, cancelled);
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
        // A tap or a flick up flips it; a drag moves it.
        if (flickUp || dt < 400) {
          const it = pt.hit.item;
          if (counter.flip(it)) {
            sfx.flip();
            buzz(15);
            hintOnce("flip-done", it.piece.kind === "egg" ? "Flipped: over easy. Leave it sunny side up for orders that want it." : "Nice flip! Flipping cooks it evenly.", 2);
          } else if (TORTILLAS.has(it.piece.kind) && it.piece.fill?.length && !it.piece.folded) showHint("Fold it first: drag the tortilla's edge across its middle.", 2.5);
          else if (it.piece.kind === "bun") showHint("Buns toast cut side down: no need to flip them.", 2);
          else if (it.topping) showHint("Take the cheese off first.", 2);
          else if (counter.above(it)) showHint("Take the top one off the stack first.", 2);
        } else showHint(pt.hit.item.piece.kind === "bun" ? "Drag it to the tray when it's toasted." : "Tap it to flip, or drag it to the tray.", 2);
      }
      break;
    case "basket":
      if (!cancelled && pt.hit?.type === "basket") {
        const b = counter.baskets[pt.hit.idx];
        if (!b.loaded) showHint(counter.redRock ? "Drag tortilla wedges into the basket, or a corn tortilla to fry a tostada." : "Drag frozen fries into the basket.", 2);
        else if (!pt.moved || flickUp) {
          b.down = !b.down;
          if (b.down) sfx.sizzleHit();
          else sfx.whoosh();
          if (b.down) hintOnce("fries-ding", "Watch the meter on the fryer: it beeps at perfect until you lift the basket.", 3.5);
          else hintOnce("fries-drag", "Drag the fries into a carton on the pad.", 2.5);
        }
      }
      break;
    case "pour":
      for (const t of counter.taps) t.pouring = false;
      break;
    case "tpress":
      counter.setTpress(0);
      if (!cancelled) showHint("Hold the press down to flatten the masa into a tortilla.", 2);
      break;
    case "handle":
      if (!cancelled && pt.hit?.type === "handle" && !pt.moved) {
        const i = pt.hit.idx;
        showHint(counter.bays[i].closed ? "Swipe the handle up to lift the lid." : "Pull the handle down to close the lid.", 2);
      }
      break;
    case "bay":
      if (!cancelled && pt.hit?.type === "bay" && !pt.moved) {
        const b = counter.bays[pt.hit.idx];
        showHint(b.closed ? "Swipe the handle up to lift the lid." : b.layers.length ? "Pull the handle down to close it, or drag the food out." : "Drop bread or chicken in here, or build a sandwich in it.", 2);
      }
      break;
    case "rack":
      if (!cancelled && !pt.moved) showHint(rackHasTacos() ? "Drag the rack up to a tray when the tacos are ready." : "The taco rack: stand warm tortillas in it and fill them here, where they stay warm.", 2.5);
      break;
    case "board":
      if (!cancelled && !pt.moved) {
        const pie = counter.middle === "oven";
        showHint(counter.board?.layers.length ? (pie ? "To cut it, tap the knife, then the flatbread (or drag the knife onto it)." : "To cut it, tap the knife, then the panini (or drag the knife onto it). Drag the panini to move it.") : pie ? "Set a flatbread here after the oven to cut it in four." : "Put a panini here to cut it in half.", 2.5);
      }
      break;
    case "knife":
      endKnife(pt, cancelled);
      break;
    case "ladle":
      endLadle(pt, cancelled);
      break;
    case "peel":
      endPeel(pt, cancelled);
      break;
    case "fold":
      if (!cancelled && !pt.moved) peelTapHint();
      break;
    case "bench":
    case "spot":
      if (!cancelled && !pt.moved) {
        const s = pt.mode === "spot" && pt.hit?.type === "spot" ? counter.ovenSpots[pt.hit.idx] : counter.bench;
        showHint(s.layers.length ? "Pies move on the peel: drag it by the handle and push the blade in under to lift." : pt.mode === "spot" ? "Carry a pie in on the peel and swipe down to slide it off." : "Set a pie down here off the peel: swipe down over the bench.", 2.6);
      }
      break;
    case "sauce":
      endSauce(pt, cancelled);
      break;
    case "plate":
      if (cancelled || pt.plate < 0) break;
      // Swipe a plate up to hand it to its customer. (Dragging down onto the counter lifts things
      // off; nothing is ever thrown away except in the trash.)
      if (dy < -40 && -dy > Math.abs(dx)) serve(pt.plate);
      // A tap on a finished tray hands it over too.
      else if (!pt.moved && trayReady(pt.plate)) serve(pt.plate);
      else if (!pt.moved && game.slots[pt.plate].order) hintOnce("serve", "When everything's on, tap Serve (or swipe the tray up) to hand it over.", 2.5);
      // A tap on an empty tray calls the next person in line to it.
      else if (!pt.moved && !game.slots[pt.plate].order && !game.slots[pt.plate].fig) callToTray(pt.plate);
      break;
  }
}
canvas.addEventListener("pointerup", (e) => endPointer(e, false));
canvas.addEventListener("pointercancel", (e) => endPointer(e, true));
canvas.addEventListener("lostpointercapture", (e) => endPointer(e, true));

/** A new shift (or the end of one): nothing in the air, nothing lifted, nothing to undo. */
function resetHands(): void {
  finishFly();
  closeSauce();
  putKnifeBack();
  disarm();
  history.clear();
}

/** Drop whatever the finger was doing, putting held things back (pause, tab switch, new shift). */
function cancelPointer(): void {
  if (ptr) endPointer(new PointerEvent("pointercancel", { pointerId: ptr.id }), true);
}

function goToPage(p: number): void {
  const before = counter.stop;
  counter.setPage(p);
  if (counter.stop !== before) sfx.whoosh();
}

/** Step along the camera stops (one per counter). */
function goToStop(s: number): void {
  const before = counter.stop;
  counter.setStop(s);
  if (counter.stop !== before) sfx.whoosh();
}

// A tap on a counter button goes to that counter; a swipe that starts on one changes counter the
// same way a swipe along the trash chute does (the buttons sit level with it), and isn't a tap.
ui.tabs.forEach((t, i) => {
  let sw: { id: number; x: number; y: number; paged: boolean } | null = null;
  let swiped = false;
  t.addEventListener("pointerdown", (e) => {
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, paged: false };
    swiped = false;
    try {
      t.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; their moves still arrive here.
    }
  });
  t.addEventListener("pointermove", (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) > 12) swiped = true;
    if (!sw.paged && game.phase === "playing" && !counter.inHand && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      sw.paged = true;
      sfx.unlock();
      goToStop(counter.stop + (dx < 0 ? 1 : -1));
    }
  });
  const end = (e: PointerEvent) => {
    if (sw && e.pointerId === sw.id) sw = null;
  };
  t.addEventListener("pointerup", end);
  t.addEventListener("pointercancel", end);
  t.addEventListener("click", (e) => {
    if (swiped) return void (swiped = false);
    if (afterCard(e)) return;
    sfx.unlock();
    if (!counter.inHand) goToPage(i);
  });
});
// Touching a stub brings that order into focus and opens it; tapping the open ticket folds it back
// to a stub. Folding waits for the click, which the browser drops when the touch scrolls the list.
ui.tickets.forEach((t, i) => {
  let wasOpen = false;
  t.addEventListener("pointerdown", () => {
    sfx.unlock();
    wasOpen = t.dataset.mode === "big";
    if (!counter.inHand && !wasOpen) {
      setActive(i);
      if (!ticketOpen) coachCounts.opens++;
      ticketOpen = true;
    }
  });
  t.addEventListener("click", () => {
    if (wasOpen && t.dataset.mode === "big" && !counter.inHand) {
      ticketOpen = false;
      coachCounts.folds++;
    }
    wasOpen = false;
  });
  // Scroll events don't bubble; listen in the capture phase for the list inside.
  t.addEventListener("scroll", (e) => (e.target as HTMLElement).classList?.toggle("up", (e.target as HTMLElement).scrollTop > 0), true);
});

/**
 * The focus rail: the order being worked on gets a wide receipt with its whole build ("big"); the
 * others shrink to stubs beside it, in their customers' order along the rail. With every ticket
 * folded, two orders (or one) share the rail as "half" tickets that still show the whole build,
 * and three are even stubs.
 */
function placeTickets(): void {
  const shown = game.slots.map((s) => !!s.order && !s.leaving && game.phase !== "title");
  const key = `${shown.join()}|${game.active}|${ticketOpen}`;
  if (key === ticketsAt) return;
  ticketsAt = key;
  const w = bands.customers.w;
  const n = shown.filter(Boolean).length;
  const m = 5;
  const gap = 5;
  const stub = Math.round(THREE.MathUtils.clamp(w * 0.18, 64, 78));
  const focus = shown[game.active] ? game.active : shown.indexOf(true);
  const slotW = w / 3;
  const bigW = n <= 1 ? Math.min(w - 2 * m, 260) : w - 2 * m - (n - 1) * (stub + gap);
  const evenW = (w - 2 * m - (n - 1) * gap) / Math.max(1, n);
  const halfW = n <= 1 ? Math.min(w - 2 * m, 200) : evenW;
  const mode = (i: number) => (ticketOpen ? (i === focus ? "big" : "stub") : n <= 2 ? "half" : "stub");
  const width = (i: number) => ({ big: bigW, half: halfW, stub: ticketOpen ? stub : evenW })[mode(i)];
  // A lone order sits under its own customer, as far as the screen allows.
  const loneW = n <= 1 && focus >= 0 ? width(focus) : 0;
  let x = n <= 1 ? THREE.MathUtils.clamp(slotW * (focus + 0.5) - loneW / 2, m, w - m - loneW) : m;
  ui.tickets.forEach((t, i) => {
    if (!shown[i]) return;
    const tw = width(i);
    t.dataset.mode = mode(i);
    t.style.left = `${Math.round(x)}px`;
    t.style.width = `${Math.round(tw)}px`;
    x += tw + gap;
  });
}

/** The Ticket rail's early ticket hangs under the bell, faded, until its customer steps up. */
function updatePeek(): void {
  const next = game.line[0]?.order;
  const show = !!next && has("rail") && (game.phase === "playing" || game.phase === "paused");
  ui.peek.hidden = !show;
  if (!show || !next) return;
  if (ui.peek.dataset.id !== String(next.id)) {
    ui.peek.dataset.id = String(next.id);
    ui.peek.innerHTML = peekHtml(next);
  }
  const host = ui.peek.offsetParent?.getBoundingClientRect();
  const bell = ui.bell.getBoundingClientRect();
  if (!host || !bell.width) return;
  const right = Math.round(host.right - bell.right);
  const top = Math.round(bell.bottom - host.top + 7);
  if (ui.peek.style.right !== `${right}px`) ui.peek.style.right = `${right}px`;
  if (ui.peek.style.top !== `${top}px`) ui.peek.style.top = `${top}px`;
}

/**
 * Fits the focused receipt to the room under the rail: rows tighten first, then the layers already
 * stacked fold into one line; whatever still doesn't fit scrolls inside the list.
 */
function fitTicket(t: HTMLElement, render: (fold: boolean) => string): void {
  t.classList.remove("dense");
  t.innerHTML = render(false);
  const tb = t.querySelector<HTMLElement>(".tb");
  if (!tb) return;
  const over = () => tb.scrollHeight > tb.clientHeight + 1 || t.scrollHeight > t.clientHeight + 1;
  if (!over()) return;
  t.classList.add("dense");
  if (!over()) return;
  t.innerHTML = render(true);
  // Still too long: keep the next layer to stack in view, near the bottom of the list.
  const list = t.querySelector<HTMLElement>(".tb");
  const next = list?.querySelector<HTMLElement>("li.next, li.wrong");
  if (!list || !next) return;
  list.scrollTop = Math.max(0, next.offsetTop + next.offsetHeight * 2.5 - list.clientHeight);
  list.classList.toggle("up", list.scrollTop > 0);
}

// ---------------------------------------------------------------------------
// Screens

let screenShownAt = 0;
// The shift window's two-thumb slider on Prep: follow the drag, then keep the window when let go.
ui.root.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const end = el.dataset?.range as "start" | "end" | undefined;
  if (!end || !prepOpen) return;
  syncRange(ui.summary, end);
});
ui.root.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  const end = el.dataset?.range as "start" | "end" | undefined;
  if (!end || !prepOpen) return;
  save.shift = validShift(syncRange(ui.summary, end));
  writeSave(save);
  showPrep();
});

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
      showPrep();
      screenShownAt = performance.now();
      break;
    case "prep-menu": {
      // Hide or show a recipe; the menu never drops below two.
      const v = btn!.dataset.v!;
      if (save.hidden.includes(v)) save.hidden = save.hidden.filter((n) => n !== v);
      else if (menuFor(stop(), [...save.hidden, v]).some((r) => r.name === v)) {
        // Hints only show in a shift: say it on the card, and shake the row.
        const note = ui.summary.querySelector<HTMLElement>(".prep-min");
        if (note) note.hidden = false;
        btn!.classList.remove("nope");
        void btn!.offsetWidth;
        btn!.classList.add("nope");
        buzz(30);
        break;
      } else save.hidden = [...save.hidden, v];
      writeSave(save);
      showPrep();
      break;
    }
    case "prep-pace": {
      const v = btn!.dataset.v as Difficulty;
      if (!(v in DIFFICULTY)) break;
      difficulty = v;
      try {
        localStorage.setItem("bv-difficulty", v);
      } catch {
        // Storage can be unavailable; the pick still holds for this session.
      }
      showPrep();
      break;
    }
    case "prep-ing":
      toggleIngredients();
      showPrep();
      break;
    case "prep-bonus": {
      const v = btn!.dataset.v as BonusId;
      save.bonus = save.bonus === v || !save.bonuses.includes(v) ? null : v;
      writeSave(save);
      showPrep();
      break;
    }
    case "gar-tab":
      game.garage.tab = btn!.dataset.v === "looks" ? "looks" : "bonuses";
      showGarage();
      break;
    case "gar-slot":
      game.garage.slot = btn!.dataset.v as LookSlot;
      game.garage.preview = null;
      showGarage();
      break;
    case "gar-night":
      game.garage.night = !game.garage.night;
      showGarage();
      break;
    case "gar-try": {
      const v = btn!.dataset.v!;
      game.garage.preview = game.garage.preview === v ? null : v;
      showGarage();
      break;
    }
    case "gar-wear":
      if (wearLook(save, btn!.dataset.v!)) {
        writeSave(save);
        sfx.pop();
        showGarage();
      }
      break;
    case "gar-buy-look":
      if (buyLook(save, btn!.dataset.v!)) {
        writeSave(save);
        sfx.coin();
        showGarage();
      }
      break;
    case "gar-buy-bonus":
      if (buyBonus(save, btn!.dataset.v as BonusId)) {
        writeSave(save);
        sfx.coin();
        showGarage();
      }
      break;
    case "open":
      startShift();
      break;
    case "next":
      showTitle();
      break;
    case "back":
      if (prepOpen) closePrep();
      else closeOverlay();
      break;
    case "reviews":
      showReviews();
      break;
    case "new-trip":
      if (btn!.dataset.armed !== "1") {
        btn!.dataset.armed = "1";
        btn!.textContent = "Tap again to start over (towns and bonuses reset)";
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
  subtitle: () => `Day ${save.day}`,
  counter: () => (counter.page === 0 ? "drinks" : counter.page === 2 ? "fryer" : "middle"),
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
  progress: () => ({ unlocked: save.unlocked, shiftsIn: save.shiftsIn }),
  shift: () => {
    const len = game.shiftLength;
    return {
      start: game.shift.start,
      end: game.shift.end,
      now: clockAt(game.time, game.shift, len),
      progress: shiftProgress(game.time, len),
      closing: game.time >= len,
      pacing: DIFFICULTY[game.pacing].label,
      pacingBlurb: DIFFICULTY[game.pacing].blurb,
      expected: game.customers,
      served: game.served,
      atWindow: game.slots.filter((s) => s.order && !s.leaving).length,
      inLine: game.line.length,
      left: game.lost + game.leftLine,
      stars: game.stars,
      takings: game.money + game.tips - spills() - game.comped,
      reviews: game.reviews.slice(),
    };
  },
  canInstall: () => !!installPrompt,
  install: () => void installPrompt?.prompt(),
  checkUpdate: () => checkNow(),
  resume: () => {
    if (game.phase === "paused") game.phase = "playing";
  },
  restart: () => showPrep(),
  quit: () => showTitle(),
  setTutorial: (on) => {
    // On replays the guided first shift; off means no guided shift either, as on the welcome card.
    save.tutorialDone = !on;
    writeSave(save);
  },
  simulate: (level) => {
    simulate(save, level === null ? null : (level as SimLevel));
    game.mapSel = save.town;
    writeSave(save);
    if (game.phase === "title") showTitle();
  },
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

/** Back in a shift pauses and opens the menu instead of leaving the page; the guard re-arms itself. */
function shiftGuard(): void {
  pushBack("shift", shiftGuard);
  if (game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    openMenu();
  }
}

function startShift(): void {
  cancelPointer();
  resetHands();
  endSundownLeftovers();
  for (const k of ["prep", "overlay"]) dropBack(k);
  prepOpen = false;
  ui.summary.classList.remove("prep-host");
  shiftGuard();
  for (let i = 0; i < 3; i++) {
    const s = game.slots[i];
    if (s.fig) customersView.leave(i, () => {});
    s.bubble?.remove();
    Object.assign(s, { order: null, plate: emptyPlate(), fig: null, leaving: false, ticketKey: "", bubble: null });
    syncTray(i, false);
  }
  for (const g of [...counter.grillItems]) counter.removeGrillItem(g);
  dropEggHand();
  counter.zones = [...ZONE_START];
  for (const b of counter.baskets) Object.assign(b, { loaded: false, cook: 0, down: false, goldenRung: false, amount: 0, fry: "fries" });
  counter.baskets.forEach((_, i) => counter.setBasketShell(i, null));
  counter.resetStations();
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
    ordered: 0,
    nextSpawn: 1.2,
    active: 0,
    // The guided shift's lessons are the grill's: anywhere else a replayed tutorial is a normal shift.
    tutorial: !save.tutorialDone && middleOf(stop()) === "grill",
    comped: 0,
    reviews: [],
    line: [],
    leftLine: 0,
    walkedPast: 0,
    bellTaps: 0,
    bellAt: 0,
    emptySince: 0,
    press: null,
  });
  // Prep's choices are fixed for the whole shift: pacing, the window and the bonus.
  game.pacing = difficulty;
  game.gentle = difficulty === "chill" && save.day === 1;
  game.shift = validShift(save.shift);
  game.bonus = save.bonus && save.bonuses.includes(save.bonus) ? save.bonus : null;
  // A slower kitchen (pace.ts) stretches the clock so the same people come over a longer shift.
  game.shiftLength = shiftSeconds(game.shift, stop().shiftLength) * shiftStretch();
  game.customers = expectedCustomers({ stop: stop(), popularity: save.popularity, rating: ratingPull(save.reviewCounts), hidden: save.hidden, shift: game.shift, bonus: game.bonus, pacing: game.pacing });
  // The range is refuelled by endShift, not here: a shift quit or reloaded half way doesn't count.
  // Today's local ask, the same one Prep showed (not on the guided first shift).
  game.ask = game.tutorial ? null : askFor(stop(), menuFor(stop(), save.hidden), save.day, game.customers);
  game.askCount = 0;
  game.regularCame = false;
  // A rush at capitals and on event days (not on the guided first shift).
  const rush = game.tutorial ? null : rushAt(!!stop().capital, !!game.event, save.day, game.shiftLength);
  game.rush = rush === null ? null : { at: rush, left: RUSH.people, next: rush };
  ui.bell.hidden = false;
  applyStop();
  // Maybe a critic in today's line, never the very first customer.
  game.criticAt = has("press") || game.rng() < criticChance(stop().crowd, game.event) ? 1 + Math.floor(game.rng() * Math.max(1, Math.min(game.customers, 8) - 2)) : -1;
  // Cooking takes cookTime() times as long as before build #86 (pace.ts), the oven too.
  counter.fryBoost = (has("turbo") ? 1.35 : 1) / cookTime();
  // Hot plate (the old Searing plate): the main counter cooks faster, whatever it is.
  counter.grillBoost = (has("sear") ? 1.25 : 1) / cookTime();
  counter.ovenBoost = (has("sear") ? 1.25 : 1) / cookTime();
  // Heat lamp: warm holding everywhere (the warm end, the rack, fries, the trays) ages at half the pace.
  counter.holdRate = has("lamp") ? 0.5 : 1;
  // Chill pours to the line by itself and nothing on the grill or in the fryer burns.
  counter.autoStopPour = has("autostop");
  counter.autoLid = has("autostop");
  // Chill (after build #82): things still burn, at half the pace once over-done.
  counter.burnPace = game.pacing === "chill" ? CHILL_BURN : 1;
  counter.setPage(HOME_PAGE);
  playShiftReveal();
  const intro = game.event
    ? `${game.event.name} today! ${game.event.blurb}${game.event.special ? ` Special: ${game.event.special.name}.` : ""}`
    : stop().newThing;
  if (intro && !game.tutorial) showHint(intro, 6);
  ui.title.hidden = true;
  closeAll();
  ui.summary.hidden = true;
  screenShownAt = performance.now();
}

/** Dress the truck for the current stop: scenery, pantry bins and HUD label. */
function applyStop(): void {
  const st = stop();
  // The coast's middle counter is the panini press; everywhere else, the grill.
  const middle = middleOf(st);
  counter.setMiddle(middle, st.press?.bays ?? 2, !!st.press?.slice || !!st.oven?.board, !!st.comal?.tpress, st.oven?.spots ?? 2);
  counter.fryerCorn = st.menu.some((r) => r.dish === "tostada");
  counter.setFryerSides(st.poutine !== false && middle !== "press", fryerOf(st));
  setTabArt(ui.tabs[HOME_PAGE], middle === "press" ? "Press" : middle === "comal" ? "Comal" : middle === "oven" ? "Oven" : "Grill");
  counter.setPantry(st.pantry);
  // The fountain pours the area's two local drinks beside the three house ones.
  const drinks = fountainFor(st.region);
  counter.setDrinks(drinks);
  counter.setGarnish(garnishOf(st.region));
  setDrinkLabels(ui, drinks);
  customersView.setBackdrop(st.backdrop);
  customersView.setLook(save.look);
}


/** Before opening: who to expect, the menu, the window, pacing and a bonus. A card over the map. */
function showPrep(): void {
  game.town = save.town;
  game.event = eventOn(save.town, save.day);
  game.overlay = null;
  // From the pause menu (Restart) the map isn't up yet: put it under the card.
  if (game.phase !== "title") showTitle();
  if (!prepOpen) pushBack("prep", () => closePrep(true));
  // Redrawing Prep (a dish switched, the window moved) updates the card in place (day.ts).
  renderPrep(ui.summary, { save, stop: stop(), pacing: difficulty }, prepOpen);
  prepOpen = true;
  ui.summary.classList.add("prep-host");
  ui.summary.hidden = false;
}

/** Close Prep and go back to the map underneath. */
function closePrep(fromBack = false): void {
  if (!prepOpen) return;
  if (!fromBack) dropBack("prep");
  prepOpen = false;
  ui.summary.hidden = true;
  ui.summary.classList.remove("prep-host");
  ui.summary.innerHTML = "";
  refreshHome();
}

// A tap on the dimmed map around the Prep card closes it.
ui.summary.addEventListener("click", (e) => {
  if (prepOpen && e.target === ui.summary && performance.now() - screenShownAt > 450) closePrep();
});

/** True while the Prep card is up over the map (in the summary layer). */
let prepOpen = false;

/** A screen over the map (closing, night, reviews) lives in the summary layer. */
function showOverlay(kind: NonNullable<typeof game.overlay>, html: string): void {
  // Redrawing the same screen (a box opened, a filter tapped) must not swallow the next tap.
  if (game.overlay !== kind) screenShownAt = performance.now();
  // One Back entry for the layer, however many screens replace each other in it.
  if (!game.overlay) pushBack("overlay", () => closeOverlay(true));
  game.overlay = kind;
  ui.summary.classList.remove("prep-host");
  ui.summary.innerHTML = html;
  ui.summary.hidden = false;
}

/** Close whatever is over the map: an overlay in the summary layer, or the Prep screen. */
function closeOverlay(fromBack = false): void {
  if (!fromBack) dropBack(game.overlay ? "overlay" : "prep");
  game.overlay = null;
  ui.summary.hidden = true;
  // After a shift or a night the map isn't mounted yet; nor is it under the Prep screen.
  if (game.phase === "summary" || prepOpen) showTitle();
  else refreshHome();
}

/** The Garage: savings spent on bonuses and looks (src/screens/garage.ts). */
function showGarage(): void {
  const keep = game.overlay === "garage" ? (ui.summary.querySelector<HTMLElement>(".day-scroll")?.scrollTop ?? 0) : 0;
  if (game.overlay !== "garage") game.garage = { ...GARAGE_START, tab: game.garage.tab, night: save.time === "evening" };
  showOverlay("garage", garageHtml(save, game.garage));
  const sc = ui.summary.querySelector<HTMLElement>(".day-scroll");
  if (sc) sc.scrollTop = keep;
}

function showReviews(): void {
  showOverlay("reviews", reviewsHtml(save));
}

/**
 * Night falls: the day turns (see game/day.ts) and the map plays the night passing, with the
 * day counter rolling over and today's change in popularity and rating. No tap needed.
 */
function sleepNow(): void {
  if (save.time !== "evening") return;
  const last = todaysClosing(save);
  const fromDay = save.day;
  // Today's reviews moved the rating: from where it stood this morning (or, for a first review, from itself).
  const rating: [number, number] | null = last && last.reviews.length && last.rating !== null ? [last.ratingBefore ?? last.rating, last.rating] : null;
  sleep(save);
  save.last = null;
  writeSave(save);
  sfx.chime();
  showTitle({ fromDay, toDay: save.day, town: townById(save.town).name, pop: last ? [last.pop[0], save.popularity] : null, rating });
}

/**
 * The home screen: the road map with the truck's numbers, where the player drives, opens the
 * window or picks a pending upgrade. Lives in src/screens/home.ts; this only hands it what it needs.
 */
function showTitle(night: NightShow | null = null, arrive: Arrival | null = null): void {
  game.town = save.town;
  game.event = eventOn(save.town, save.day);
  applyStop();
  game.phase = "title";
  screenShownAt = performance.now();
  ui.title.hidden = false;
  ui.summary.hidden = true;
  ui.summary.classList.remove("prep-host");
  // Whatever Back was pointing at (a shift, Prep, a screen over the map) is gone now.
  for (const k of ["shift", "prep", "overlay"]) dropBack(k);
  prepOpen = false;
  game.overlay = null;
  mountHome(ui.title, {
    save,
    focus: arrive ? null : game.mapSel,
    night,
    arrive,
    startShift: () => {
      showPrep();
      screenShownAt = performance.now();
    },
    openReviews: () => showReviews(),
    openGarage: () => showGarage(),
    openMenuRef: () => openMenuRef(withEvent(townById(save.town), eventOn(save.town, save.day))),
    sleep: () => sleepNow(),
    commit: () => {
      writeSave(save);
      game.town = save.town;
      game.event = eventOn(save.town, save.day);
      applyStop();
    },
    openSettings: () => openSettings(),
    openHowTo: () => openHowTo(),
    sfx: { whoosh: () => sfx.whoosh(), coin: () => sfx.coin(), tap: () => sfx.unlock() },
  });
  game.mapSel = save.town;
  // Straight after a shift the update waits for the next screen, so the results aren't lost to a reload.
  if (game.pendingUpdate && !arrive) reloadTo(game.pendingUpdate.build);
}

// ---------------------------------------------------------------------------
// Sundown: the end of a shift (DESIGN.md §30)

/**
 * When the last customer has gone, the kitchen holds for a moment: the lights warm toward
 * evening, the sky in the window turns to sunset, a Closed sign drops into the window and the
 * clock reads Closed. Then the view pulls back out of the truck onto the evening map, where the
 * results come up as a sheet (see playArrive in screens/home.ts). A tap skips to the sheet.
 */
const SUNDOWN = { light: 1.5, sign: 0.25, out: 1.75 };
const dusk = new Dusk();
let sundown: { t: number; sign: HTMLElement; dropped: boolean; reduce: boolean } | null = null;

function startSundown(): void {
  cancelPointer();
  dropBack("shift");
  game.phase = "sundown";
  hintUntil = 0;
  for (const s of game.slots) {
    s.bubble?.remove();
    s.bubble = null;
  }
  dusk.begin([counter.scene, trayView.scene], customersView.scene, clearColor);
  const sign = document.createElement("div");
  sign.className = "closed-sign";
  sign.setAttribute("role", "status");
  sign.innerHTML = `<span class="cord"></span><span class="board"><b>Closed</b><small>See you tomorrow</small></span>`;
  const r = bands.customers;
  sign.style.left = `${r.x + r.w / 2}px`;
  // Hung from the top of the window, clear of the HUD that sits over it.
  const hud = ui.root.querySelector<HTMLElement>(".hud")?.getBoundingClientRect().bottom ?? 0;
  sign.style.top = `${Math.max(r.y + 26, hud + 22)}px`;
  ui.root.appendChild(sign);
  sundown = { t: 0, sign, dropped: false, reduce: matchMedia("(prefers-reduced-motion: reduce)").matches };
}

function stepSundown(dt: number): void {
  const sd = sundown;
  if (!sd) return;
  sd.t += dt;
  const k = Math.min(1, sd.t / (sd.reduce ? 0.3 : SUNDOWN.light));
  dusk.set(k * k * (3 - 2 * k));
  if (!sd.dropped && sd.t >= SUNDOWN.sign) {
    sd.dropped = true;
    sd.sign.classList.add("drop");
    sfx.chime();
  }
  if (sd.t >= SUNDOWN.out) finishSundown(false);
}

/** Leave the kitchen for the evening map; `quick` (a tap, or reduced motion) skips the pull-back. */
function finishSundown(quick: boolean): void {
  const sd = sundown;
  if (!sd) return;
  if (!sd.dropped) sfx.chime();
  let arrive: Arrival = { shot: null, layers: [], w: 0, h: 0 };
  if (!quick && !sd.reduce) {
    try {
      // The kitchen as it stands, to shrink into the truck on the map: the 3D view plus the HUD,
      // the rail, the counter buttons and the sign over it.
      dusk.set(1);
      render();
      const shot = canvas.toDataURL("image/jpeg", 0.82);
      const layers = [".hud", ".rail", ".cnav"].map((q) => ui.root.querySelector<HTMLElement>(q)?.cloneNode(true) as HTMLElement | undefined).filter((e): e is HTMLElement => !!e);
      layers.push(sd.sign.cloneNode(true) as HTMLElement);
      arrive = { shot, layers, w: canvas.clientWidth, h: canvas.clientHeight };
    } catch {
      // No picture of the kitchen (a lost context): the results simply come up.
    }
  }
  sd.sign.remove();
  sundown = null;
  endShift(arrive);
}

/** A new shift starts in daylight, with no sign in the window. */
function endSundownLeftovers(): void {
  sundown?.sign.remove();
  sundown = null;
  dusk.reset();
  ui.root.querySelectorAll(".closed-sign").forEach((e) => e.remove());
}

// A tap during the sundown skips straight to the results.
window.addEventListener(
  "pointerdown",
  () => {
    if (game.phase === "sundown" && sundown && sundown.t > 0.3) finishSundown(true);
  },
  true,
);

function endShift(arrive: Arrival): void {
  cancelPointer();
  resetHands();
  dropBack("shift");
  game.phase = "summary";
  // The shift fills the day; the evening follows, and only sleeping turns the day (see game/day.ts).
  save.time = "evening";
  save.driven = 0;
  const popBefore = save.popularity;
  // Popularity: yesterday's fades a touch, then word of mouth and the press move it.
  // The guest book doubles the good word; apology cookies keep walk-outs from costing any.
  const word = wordOfMouth(game.stars, has("cookies") ? 0 : game.lost, has("cookies") ? 0 : game.leftLine, save.popularity);
  save.popularity = fadePopularity(save.popularity) + (word > 0 && has("guestbook") ? word * 2 : word) + (game.press?.pop ?? 0);
  save.popularity = Math.max(10, Math.min(100, save.popularity));
  if (game.gentle) save.popularity = Math.max(popBefore, save.popularity);
  customersView.setLine([]);
  if (game.press) save.press = [game.press, ...save.press].slice(0, 10);
  for (const s of game.slots) {
    s.bubble?.remove();
    s.bubble = null;
  }
  const here = stop();
  const avg = game.stars.length ? game.stars.reduce((a, b) => a + b, 0) / game.stars.length : 0;
  // The rating is every review ever left, kept as a count per star.
  const ratingBefore = reviewAverage(save.reviewCounts);
  save.reviewCounts = addReviews(save.reviewCounts, game.reviews);
  // A pass counts the people who ordered, so a short line isn't a fail, but serving one person out of a town's trade isn't a pass.
  const ok = passed(avg, game.served, Math.max(game.served + game.lost, Math.ceil(game.customers * 0.4)));
  let lastStop = false;
  const before = [...save.unlocked];
  // Takings are the shift's score: what the orders paid and the tips, less giveaways and spills.
  const takings = Math.max(0, Math.round(game.money + game.tips - game.comped - spills()));
  const bestBefore = save.bestTakings[here.id] ?? null;
  save.bestTakings[here.id] = Math.max(bestBefore ?? 0, takings);
  // A shift with nobody served has no average to be best at.
  if (game.stars.length) save.best[here.id] = Math.max(save.best[here.id] ?? 0, avg);
  // The takings go into savings, for the Garage.
  save.bank += takings;
  // A great shift unlocks this town's bonus, for sale in the Garage from now on.
  const great = !game.tutorial && greatShift(game.stars, game.served, game.served + game.lost, game.customers);
  let unlocked: BonusId | null = null;
  const tb = townBonus(here.id);
  if (great && tb && !save.found.includes(tb.id)) {
    unlocked = tb.id;
    save.found.push(tb.id);
  }
  if (ok) {
    const firstTime = !save.passedTowns.includes(here.id);
    lastStop = passTown(save, here.id) && firstTime;
    // A great shift counts as two toward opening the roads (after build #78), as does a local ask met.
    if (great || askMet()) passTown(save, here.id);
    if (lastStop) save.trips++;
  }
  const opened = save.unlocked.filter((id) => !before.includes(id)).map(townById);
  // Point the map at the next new town so "Back to the map" leads somewhere.
  if (opened.length) game.mapSel = opened[0].id;
  const closing: Closing = {
    town: here.id,
    day: save.day,
    served: game.served,
    lost: game.lost,
    leftLine: game.leftLine,
    walkedPast: game.walkedPast,
    stars: game.stars.slice(),
    earned: game.money,
    tips: game.tips,
    comped: Math.round(game.comped),
    spills: spills(),
    takings,
    bestBefore,
    reviews: game.reviews.slice(),
    rating: reviewAverage(save.reviewCounts),
    ratingBefore,
    pop: [popBefore, save.popularity],
    best: game.best?.name ?? null,
    outcome: !ok ? "failed" : lastStop ? "trip" : "passed",
    opened: opened.map((t) => t.id),
    shiftsHere: save.shiftsIn?.[here.id] ?? 0,
    press: game.press,
    great,
    unlocked,
    usedBonus: game.bonus,
    bank: save.bank,
    shift: game.shift,
  };
  save.last = closing;
  save.tutorialDone = true;
  writeSave(save);
  ui.title.hidden = false;
  // The results land on the evening map, as a sheet, after the view pulls back out of the truck.
  showTitle(null, arrive);
  if (unlocked) setTimeout(() => sfx.coin(), arrive.shot ? 1900 : 400);
  // A pending update waits until the player leaves the report card (see showTitle and reloadWhenIdle).
  if (game.pendingUpdate) {
    ui.updateText.textContent = `Build #${game.pendingUpdate.build} will load when you continue.`;
    ui.update.hidden = false;
    reloadWhenIdle(game.pendingUpdate);
  }
}

// ---------------------------------------------------------------------------
// Updates

/**
 * On the map, reload onto a new build once nothing is open over it: not while the report card,
 * Prep, a screen or a card is up, nor while the map plays the pull-back, a drive or the night.
 */
function reloadWhenIdle(v: VersionInfo): void {
  setTimeout(() => {
    if (game.phase !== "title" || game.pendingUpdate !== v) return;
    if (modalOpen() || prepOpen || game.overlay || homeBusy()) reloadWhenIdle(v);
    else reloadTo(v.build);
  }, 1200);
}

const checkNow = startUpdateChecks((v) => {
  game.pendingUpdate = v;
  if (game.phase === "title") {
    const busy = modalOpen() || prepOpen || game.overlay || homeBusy();
    ui.updateText.textContent = busy ? `Build #${v.build} will load when you continue.` : `Updating to build #${v.build}…`;
    ui.update.hidden = false;
    reloadWhenIdle(v);
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

/** Seconds since the last guided arrival on the first shift. */
let guideGap = 0;

function tick(dt: number): void {
  if (game.phase === "playing") {
    // The first shift's guided orders (tutorial/lessons.ts): the clock waits while the first two are
    // talked through, and people come one at a time. The first customer; once they're served, the
    // next; and once that burger is under way, one more waits in line so the bell gets rung.
    const guiding = game.tutorial && game.served < 2;
    if (!(guiding && game.ordered >= 1)) game.time += dt;
    let due = game.time >= game.nextSpawn;
    if (guiding && game.ordered >= 1) {
      const started = game.slots.some((s) => s.lesson === 1 && (s.plate.layers.length > 0 || counter.grillItems.length > 0));
      const allowed = game.served === 0 ? 1 : started ? 3 : 2;
      guideGap += dt;
      due = game.ordered + game.line.length < allowed && guideGap > 1.2;
      if (due) guideGap = 0;
    }
    // People arrive while the window is open and join the line, unless it's long and they've never heard of the truck.
    if (game.time < game.shiftLength && game.spawned < game.customers && due) {
      game.spawned++;
      if (guiding || game.rng() < joinChance(game.line.length, save.popularity)) {
        const max = linePatience(game.pacing, stop().crowd) * (has("bench") ? 1.3 : 1);
        game.line.push({ seed: Math.floor(game.rng() * 1000), patience: max, maxPatience: max });
      } else game.walkedPast++;
      // People come along the lunch curve: busiest around noon, quieter early and late (see shift.ts).
      const hour = clockAt(game.time, game.shift, game.shiftLength);
      game.nextSpawn = game.time + arrivalGap(hour, game.shift, game.shiftLength, game.customers) * (0.8 + game.rng() * 0.4);
    }
    // The rush: a heads-up, then a few extra people join the line, one every few seconds.
    const r = game.rush;
    if (r && r.left > 0 && game.time >= r.next && game.time < game.shiftLength) {
      if (r.left === RUSH.people) {
        showHint(stop().capital ? "A tour bus pulls in!" : "The event crowd's here!", 3);
        sfx.pop();
      }
      r.left--;
      r.next = game.time + RUSH.over / RUSH.people;
      game.customers++;
      game.spawned++;
      if (game.line.length < MAX_LINE) {
        const max = linePatience(game.pacing, stop().crowd) * (has("bench") ? 1.3 : 1);
        game.line.push({ seed: Math.floor(game.rng() * 1000), patience: max, maxPatience: max });
      } else game.walkedPast++;
    }
    // If nobody's about, don't make the player wait for the next arrival.
    if (!game.slots.some((s) => s.order) && !game.line.length && game.nextSpawn > game.time + 2 && !guiding) game.nextSpawn = game.time + 2;

    // The line: patience drains slowest at the front, where they're nearly there.
    for (let k = game.line.length - 1; k >= 0; k--) {
      const w = game.line[k];
      // While the guided clock stands still, nobody in line loses patience either.
      if (!guiding) w.patience -= dt * lineDrain(k);
      if (w.patience <= 0) {
        game.line.splice(k, 1);
        game.leftLine++;
        if (!game.tutorial) hintOnce("left-line", "Someone gave up waiting in line. Ring the bell to call people up sooner.", 4);
      }
    }
    // The Ticket rail: whoever is first in line has their ticket up already (see updatePeek).
    if (has("rail") && game.line[0] && !game.line[0].order) game.line[0].order = nextOrder();
    // An empty window calls the first in line up by itself after a beat; otherwise it's the bell.
    if (game.slots.some((s) => s.order || s.fig)) game.emptySince = game.time;
    else if (game.line.length && (game.time - game.emptySince >= 0.7 || guiding) && callNext()) {
      // The bell rings itself, so the bell and "next customer" go together from the first order.
      ui.bell.classList.remove("ring");
      void ui.bell.offsetWidth;
      ui.bell.classList.add("ring");
      sfx.bell();
    } else if (game.pacing === "chill" && !game.tutorial && game.line[0] && game.line[0].patience < game.line[0].maxPatience * 0.6 && callNext()) {
      // On Chill nobody gives up in line: if they've waited a while and there's room, the bell rings for them.
      ui.bell.classList.remove("ring");
      void ui.bell.offsetWidth;
      ui.bell.classList.add("ring");
      sfx.bell();
    }
    if (game.bellTaps && game.time - game.bellAt > BELL_WINDOW) game.bellTaps = 0;
    customersView.setLine(game.line.map((w) => ({ seed: w.seed, mood: patienceMood(w.patience / w.maxPatience) })));

    game.slots.forEach((s, i) => {
      if (!s.order || s.leaving) return;
      s.patience -= dt;
      if (s.fig) s.fig.setMood(patienceMood(s.patience / s.maxPatience));
      if (s.patience <= 0) {
        game.lost++;
        if (s.order.critic) criticVerdict(1, []);
        // A walk-out is furious, and as likely as anyone to say so (not on the first Chill day).
        const reviewed = maybeReview(1, !!s.order.critic);
        sfx.grumble();
        customerLeaves(i, 1, "Too slow! I'm off.", reviewed);
      }
    });

    // Cooked food waiting on a tray slowly goes cold and dry (the warm grill zone holds it at half
    // the pace); fries on a tray go soggy. The heat lamp halves all of it (counter.holdRate).
    for (const s of game.slots) {
      ageLayers(s.plate.layers, dt, counter.holdRate);
      if (s.plate.fries && s.plate.fries.cook > 0.15) s.plate.fries.held = (s.plate.fries.held ?? 0) + dt * counter.holdRate;
    }

    if (counter.middle === "oven") {
      const o = game.slots[game.active]?.order;
      if (o?.layers[0]?.folded) hintOnce("calzone-order", "A calzone: build it on the peel, then drag the dough's edge across the middle to fold it, then into the oven.", 4.5);
      else if (o?.slice) hintOnce("slice-pie", "Port Amber cuts its flatbreads in four: after the oven, set it on the board with the peel and cut it twice with the knife.", 4.5);
      else if (o?.layers.some((l) => l.after)) hintOnce("after-order", "Basil, rocket and honey go on after the oven, once the flatbread is on the tray.", 4);
    } else if (counter.middle === "press") {
      const o = game.slots[game.active]?.order;
      if (o?.layers.some((l) => l.kind === "chicken" || l.kind === "veggie")) hintOnce("press-first", "The patty in this one goes in the press on its own first. Then build the sandwich and press it again.", 4.5);
      else if (o?.slice) hintOnce("slice-order", "Harbor City cuts its paninis: after pressing, put it on the board and cut it with the knife.", 4.5);
    } else if (counter.middle === "comal") {
      const base = game.slots[game.active]?.order?.layers[0];
      if (base && TORTILLAS.has(base.kind) && !base.folded) hintOnce("taco-order", "Tacos: warm the tortillas on the hot side, stand them in the rack on the warm end and fill them there, then drag the rack up to the tray.", 4.5);
    } else if (!game.hintsShown.has("melt-order") && game.slots[game.active]?.order?.layers.some((l) => l.melted))
      hintOnce("melt-order", "This one wants melted cheese: drop the slice on the patty while it's on the grill.", 4.5);
    // Elk Pass is a side road, so the first smash order may turn up in Summit City untaught.
    else if (!game.hintsShown.has("smash-order") && game.slots[game.active]?.order?.layers.some((l) => l.smashed))
      hintOnce("smash-order", "This one's a smash burger: press and hold a fresh patty on the grill to flatten it.", 4.5);

    // The tortilla press (Sun Valley): hold it down to flatten a ball of masa, then drag the tortilla off.
    if (ptr && ptr.mode === "tpress") {
      const t = Math.min(1, (game.time - ptr.gt0) / 0.45);
      counter.setTpress(t);
      if (t >= 1) {
        const piece = newPiece("corn");
        piece.handmade = true;
        sfx.thud();
        buzz(30);
        startHold(ptr, { type: "piece", piece, fromGrill: null });
        counter.setTpress(0);
        hintOnce("tpress", "Hand-pressed! Warm it on the comal like any tortilla. Customers tip for these.", 3.5);
      }
    }

    // Press and hold a fresh patty to smash it (at stops that serve smash burgers).
    if (ptr && ptr.mode === "grill" && !ptr.moved && ptr.hit?.type === "grillItem" && game.time - ptr.gt0 > 0.45 && stop().menu.some((r) => r.smash)) {
      if (counter.smash(ptr.hit.item)) {
        sfx.thud();
        sfx.sizzleHit();
        buzz(40);
        ptr.mode = "none";
        hintOnce("smash", "Smashed! Thin patties cook fast, so keep an eye on them.", 3);
      }
    }

    // Press and hold a quesadilla on the comal to open it back out, so its filling can be fixed.
    if (ptr && ptr.mode === "grill" && !ptr.moved && ptr.hit?.type === "grillItem" && counter.middle === "comal" && game.time - ptr.gt0 > UNFOLD_HOLD) {
      const it = ptr.hit.item;
      if (it.flipT < 0 && !it.held && unfoldTortilla(it.piece)) {
        it.squashV = 5;
        sfx.flip();
        buzz(20);
        ptr.mode = "none";
        hintOnce("unfold", "Unfolded. Fix the filling, then drag the edge across the middle to fold it again.", 3.5);
      }
    }

    const doneSpawning = game.time >= game.shiftLength || game.spawned >= game.customers;
    if (doneSpawning && !game.line.length && game.slots.every((s) => !s.order && !s.fig)) startSundown();
  }
  if (game.phase === "sundown") stepSundown(dt);

  if (game.phase === "playing" || game.phase === "sundown" || game.phase === "title" || game.phase === "summary") {
    counter.update(game.phase === "playing" ? dt : 0);
    trayView.update(dt);
    customersView.update(dt, game.active);
  }
  sfx.setLoops(game.phase === "playing" ? counter.sizzleLevel() : 0, game.phase === "playing" ? counter.bubbleLevel() : 0, counter.pouring(), game.phase === "playing" ? counter.ovenLevel() : 0);
  updateUi(dt);
}

counter.events.golden = () => {
  sfx.chime();
  if (counter.page !== 2) showHint("Fries are golden! →", 2);
};
counter.events.spill = () => {
  sfx.splash();
  buzz(80);
  showHint("It's overflowing! Let go, and wipe up the mess.", 2.5);
};
// Kitchen timer (bonus): a soft tick when anything on the grill or in the fryer reaches done.
counter.events.done = () => {
  if (game.phase === "playing" && has("timer")) sfx.tick();
};
counter.events.burning = () => {
  const where = counter.middle === "press" ? "in the press" : counter.middle === "oven" ? "in the oven" : "on the grill";
  if (counter.page !== HOME_PAGE) showHint(`Something's burning ${where}! ←`, 2.5);
  else if (counter.middle === "oven") hintOnce("burning-oven", "That pie's catching on the hot side! Turn it round with the peel's tip, or lift it out.", 3);
  else hintOnce("burning", counter.middle === "press" ? "Smoke means burning! Lift the lid and get it out." : "Smoke means burning! Drag it to the trash can.", 2.5);
};
// The peel nudging a pie in the oven round: a soft scrape as it goes.
counter.events.nudge = () => sfx.peelScrape();

/** Soda lost to overflows this shift, in whole dollars. */
/** The pie being made for an order, wherever it is on the oven counter (peel, oven, bench or board), or null. */
function piesFor(id: number): Layer[] | null {
  const holders: PieHolder[] = [counter.peel, ...counter.ovenSpots.slice(0, counter.ovenCount), counter.rest];
  return holders.find((h) => h.layers[0]?.piece.kind === "dough" && h.layers[0].piece.forOrder === id)?.layers ?? null;
}

function spills(): number {
  return Math.round(counter.spillCost);
}

let lastTimerText = "";
function updateUi(dt = 0): void {
  updateTrayActs();
  const len = game.shiftLength;
  const left = Math.max(0, len - game.time);
  const tText = game.phase === "sundown" ? "Closed" : left > 0 ? clockLabel(clockAt(game.time, game.shift, len)) : "Closing";
  if (tText !== lastTimerText) {
    ui.timer.textContent = tText;
    ui.timer.classList.toggle("closing", left <= 0 && game.phase !== "sundown");
    ui.timer.parentElement!.classList.toggle("closing", left <= 0 && game.phase !== "sundown");
    lastTimerText = tText;
  }
  const pct = `${(shiftProgress(game.time, len) * 100).toFixed(1)}%`;
  if (ui.clockFill.style.width !== pct) ui.clockFill.style.width = pct;
  const net = Math.round(game.money + game.tips - spills() - game.comped);
  const money = net < 0 ? `−$${-net}` : `$${net}`;
  if (ui.money.textContent !== money) ui.money.textContent = money;

  ui.rail.hidden = game.phase === "title";
  ui.bell.hidden = game.phase === "title" || game.phase === "summary" || game.phase === "sundown";
  const inLine = String(game.line.length);
  if (ui.bellCount.textContent !== inLine) ui.bellCount.textContent = inLine;
  const bellLabel = "in line";
  if (ui.bellLabel.textContent !== bellLabel) ui.bellLabel.textContent = bellLabel;
  ui.bell.classList.toggle("empty", !game.line.length);
  ui.bell.classList.toggle("full", game.line.length > 0 && game.slots.filter((s) => s.order || s.fig).length >= WINDOW[game.pacing]);
  placeTickets();
  updatePeek();
  game.slots.forEach((s, i) => {
    const t = ui.tickets[i];
    const show = !!s.order && !s.leaving && game.phase !== "title";
    t.hidden = !show;
    const back = ui.sentBack[i];
    const note = show && s.sentBack ? `Sent back: ${capitalise(s.sentBack)}` : "";
    back.hidden = !note;
    if (back.textContent !== note) back.textContent = note;
    if (!show || !s.order) return;
    const order = s.order;
    const focused = i === game.active;
    const pct = s.patience / s.maxPatience;
    const shownPct = s.lesson >= 0 ? 1 : pct;
    const mode = t.dataset.mode ?? "stub";
    // At the oven a pie is built on the peel and baked before it reaches the tray: until then the
    // ticket ticks off what's on the pie being made for this order.
    const pieShown = !s.plate.layers.length && counter.middle === "oven" ? piesFor(order.id) : null;
    // At the comal the active ticket also ticks off the tacos being filled in the rack.
    const rackShown = focused && counter.middle === "comal" && counter.rack.layers.length && (!s.plate.layers.length || isTacoRun(s.plate.layers)) ? [...s.plate.layers, ...counter.rack.layers] : null;
    const plate = pieShown ? { ...s.plate, layers: pieShown } : rackShown ? { ...s.plate, layers: rackShown } : s.plate;
    const key = `${order.id}|${focused}|${mode}|${t.style.width}|${plate.layers.map((l) => l.piece.kind).join(",")}|${s.plate.fries ? `${s.plate.fries.size}${+!!s.plate.fries.salt}${+!!s.plate.fries.curds}${+!!s.plate.fries.gravy}` : ""}|${s.plate.drink ? `${s.plate.drink.flavor}${s.plate.drink.size}${+!!s.plate.drink.ice}${+!!s.plate.drink.lid}` : ""}`;
    if (key !== s.ticketKey || !t.dataset.fit) {
      t.classList.toggle("active", focused);
      t.classList.toggle("stub", mode === "stub");
      t.classList.toggle("half", mode === "half");
      if (mode !== "stub") fitTicket(t, (fold) => ticketHtml(order, plate, shownPct, true, fold));
      else {
        t.classList.remove("dense");
        t.innerHTML = ticketHtml(order, plate, shownPct, false);
      }
      s.ticketKey = key;
      if (t.dataset.tipLost) {
        delete t.dataset.tipLost;
        t.querySelector(".tipc")?.classList.add("lost");
      }
      t.dataset.fit = "1";
    } else {
      // Patience runs on between redraws: just move the bar and the face's mood.
      const bar = t.querySelector<HTMLElement>(".bar > i");
      if (bar) bar.style.width = `${(Math.max(0, Math.min(1, shownPct)) * 100).toFixed(0)}%`;
      const mood = patienceMood(shownPct);
      const pat = t.querySelector<HTMLElement>(".pat");
      if (pat && !pat.classList.contains(mood)) {
        t.dataset.fit = "";
        // The tip just stepped down a band: a soft tick, and the coin gives a little start.
        if (s.lesson < 0) {
          sfx.tick();
          t.dataset.tipLost = "1";
        }
      }
    }
  });
  trayView.setActive(
    game.active,
    game.slots.map((s) => !!s.order),
  );
  // Each tray's burger fits under whatever receipt hangs over it, so tall stacks stay readable.
  trayView.plates.forEach((pv, i) => {
    const v = pv.burger.getWorldPosition(new THREE.Vector3()).project(trayView.camera);
    const x = colX + ((v.x + 1) / 2) * bands.tray.w;
    let bottom = bands.tray.y;
    for (const t of ui.tickets) {
      if (t.hidden || !t.offsetHeight) continue;
      const r = t.getBoundingClientRect();
      if (x > r.left - 24 && x < r.right + 24) bottom = Math.max(bottom, r.bottom);
    }
    trayView.fitUnder(i, (bottom - bands.tray.y) / bands.tray.h);
    // Receipt folded (or none): the dish zooms in to fill the wall the receipt left (after build #78).
    const t = ui.tickets[i];
    pv.boost = t.hidden || t.dataset.mode !== "big" ? TRAY_ZOOM : 1;
  });
  updateAskChip();
  updateSauce(dt);
  updateLadleZoom(dt);
  updateFly(dt);
  updateEgg(dt);
  // While a finger carries something (or a thing flies back) the button keeps its look.
  if (!ptr && !fly) {
    const undoOn = canUndo();
    if (ui.undo.disabled === undoOn) ui.undo.disabled = !undoOn;
  }

  placeNav();
  updateGrillTags(dt);
  updateFryTags();
  updateStaleUi();
  updateStationUi();
  updateLevelBar();
  // The fountain's push buttons: a cap per drink with its short name, as wide as one nozzle so
  // they line up edge to edge, pressed in while that drink pours.
  const tapPx = (counter.drinkButtonPoint(1).project(counter.camera).x - counter.drinkButtonPoint(0).project(counter.camera).x) * 0.5 * bands.counter.w;
  ui.drinkLabels.forEach((el, i) => {
    const v = counter.drinkButtonPoint(i).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    const visible = game.phase === "playing" && counter.page === 0 && x > 10 && x < bands.counter.w - 10;
    el.hidden = !visible;
    if (!visible) return;
    const wpx = `${Math.round(tapPx - 5)}px`;
    if (el.style.width !== wpx) {
      // Longer local names (Cucumber, Hibiscus) step the type down until they fit the cap.
      el.style.width = wpx;
      el.style.fontSize = "";
      for (let fs = 10; el.scrollWidth > el.clientWidth && fs >= 8; fs--) el.style.fontSize = `${fs}px`;
    }
    el.style.left = `${x}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
    el.classList.toggle("down", counter.taps[i].pouring);
  });
  // Tab dots: something needs attention on that counter.
  const friesReady = counter.baskets.some((b) => b.loaded && (b.shell ? cookZone("tostada", cookLevel(b.shell)) === "done" : friesZone(b.cook, b.fry) === "done"));
  const friesBurning = counter.baskets.some((b) => b.loaded && b.down && (b.shell ? cookLevel(b.shell) >= COOK_SCALE.tostada.over - 0.05 : b.cook >= FRY_ZONE[b.fry].over - 0.05));
  const grillBurning =
    counter.grillItems.some((g) => !g.below && g.piece.kind in COOK_SCALE && cookLevel(g.piece) > COOK_SCALE[g.piece.kind as Cookable].over + 0.1) ||
    counter.bays.some((b, i) => {
      const r = i < counter.bayCount && b.closed ? counter.bayReading(b) : null;
      return !!r && r.kind in COOK_SCALE && cookLevel(r) > COOK_SCALE[r.kind as Cookable].over + 0.05;
    });
  // The oven: a pie golden and ready, or one catching (the fire side running away, or burning).
  const pies = counter.middle === "oven" ? counter.ovenSpots.slice(0, counter.ovenCount).map((s) => s.layers[0]?.piece).filter((d): d is Piece => d?.kind === "dough") : [];
  const ovenReady = pies.some((d) => cookZone("dough", paleSide(d)) === "done");
  const ovenBurning = pies.some((d) => darkSide(d) > COOK_SCALE.dough.over);
  const dots = [false, grillBurning || ovenBurning || ovenReady, friesReady || friesBurning];
  const hot = [false, grillBurning || ovenBurning, friesBurning];
  ui.tabs.forEach((t, i) => {
    const lamp = hot[i] ? "coral" : dots[i] ? "amber" : "off";
    if (t.dataset.lamp !== lamp) t.dataset.lamp = lamp;
  });
  // The Kitchen timer: each counter button's ring fills toward the next thing there to reach done.
  const timing = has("timer") && game.phase === "playing" ? nextDone() : [null, null, null];
  ui.tabs.forEach((t, i) => {
    const p = timing[i];
    t.classList.toggle("timing", p !== null);
    if (p !== null) {
      const v = p.toFixed(2);
      if (t.style.getPropertyValue("--tp") !== v) t.style.setProperty("--tp", v);
    }
  });

  const tut = tutorialHint();
  const now = performance.now();
  const text = now < hintUntil ? hintText : tut;
  // The tutorial's card says it better while it's up.
  const show = !!text && text !== hintDismissed && game.phase === "playing" && !coachShowing();
  if (show && ui.hintText.textContent !== text) {
    ui.hintText.textContent = text;
    ui.hint.style.transform = "";
  }
  ui.hint.hidden = !show;
}

/**
 * The counter buttons (T17 from the tabs study): only the next counter each way, as round buttons
 * at the screen edges, level with the trash chute. Each tracks where its counter is as the camera
 * moves: a counter d screens away (d = its index minus the view's) sits in the middle and faded out
 * at d = 0, at the edge at d = ±1, and just off screen at d = ±2. So the button you press glides to
 * the middle and fades as you arrive, and the counter you left grows back out on the other side.
 */
const NAV_SIZE = 60;
function placeNav(): void {
  const f = counter.viewPage;
  const w = bands.counter.w;
  const S = NAV_SIZE, m = 10;
  const v = counter.trashPoint().project(counter.camera);
  const y = Math.round(bands.counter.y + ((1 - v.y) / 2) * bands.counter.h - S / 2);
  const C = w / 2 - S / 2, EL = m, ER = w - m - S, OL = -S - 24, OR = w + 24;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  ui.tabs.forEach((t, i) => {
    const d = i - f, ad = Math.abs(d);
    const x = d <= -1 ? lerp(EL, OL, Math.min(1, -d - 1)) : d < 0 ? lerp(C, EL, -d) : d < 1 ? lerp(C, ER, d) : lerp(ER, OR, Math.min(1, d - 1));
    const k = Math.min(1, ad);
    const tf = `translate(${x.toFixed(1)}px, ${y}px) scale(${(0.75 + 0.25 * k).toFixed(3)})`;
    if (t.style.transform !== tf) t.style.transform = tf;
    const op = k.toFixed(2);
    if (t.style.opacity !== op) t.style.opacity = op;
    const live = ad > 0.5 && ad < 1.5;
    const pe = live ? "" : "none";
    if (t.style.pointerEvents !== pe) t.style.pointerEvents = pe;
    t.tabIndex = live ? 0 : -1;
    t.setAttribute("aria-hidden", String(!live));
  });
}

/** A doneness meter under each grill item (the top of each stack), so players don't have to judge colour alone. */
const grillTags: HTMLElement[] = [];

/** The meter for a grill item, and how many are in its stack. */
function itemTag(it: GrillItem): string {
  const k = it.piece.kind;
  // A taco tortilla's meter says when it's warm (the ticket's "Warm" chip); a quesadilla's, its cheese.
  const jack = it.piece.fill?.find((f) => f.kind === "jack");
  const taco = (k === "corn" || k === "flour") && !it.piece.folded && !jack;
  const meter = taco ? tortillaMeter(k, cookLevel(it.piece)) : k in COOK_SCALE ? cookMeter(k as Cookable, cookLevel(it.piece)) : "";
  const n = counter.stackSize(it);
  // A quesadilla's cheese: melting, then melted.
  const melt = jack ? `<b class="mlt${isMelted(jack) ? " on" : ""}">${isMelted(jack) ? "Melted" : "Melting"}</b>` : "";
  // Off the heat, cooked food ages (warm holding): the bar shows how long it keeps.
  const hold = counter.heatOf(it) !== "hot" ? holdBar(it.piece.held) : "";
  return `${meter}${melt}${hold}${n > 1 ? `<b class="sc">×${n}</b>` : ""}`;
}
/**
 * Staleness bars beside the trays: a slim vertical bar that drains as the cooked food on the tray
 * goes cold and dry. It's green while the food keeps well, amber once it starts drying, red near the end.
 */
const holdTags: HTMLElement[] = [0, 1, 2].map(() => {
  const el = document.createElement("div");
  el.className = "stale";
  el.hidden = true;
  el.style.setProperty("--g", `${(1 - HOLD_GRACE / HOLD_RUIN) * 100}%`);
  el.innerHTML = "<i></i>";
  el.setAttribute("role", "img");
  ui.root.appendChild(el);
  return el;
});
// Spills on the drinks counter say how to clear them. (Cup, lid and carton stacks carry no size
// labels: the sizes read from the models.)
const stationTag = (cls: string): HTMLElement => {
  const el = document.createElement("div");
  el.className = `gtag ${cls}`;
  el.hidden = true;
  ui.root.appendChild(el);
  return el;
};
const puddleTags = counter.taps.map(() => stationTag("hot"));
/** The taco rack's warm-holding bar, in front of the rack while tacos wait in it. */
const rackTag = stationTag("rackhold");
function placeTag(el: HTMLElement, world: THREE.Vector3, text: string, cls?: [string, boolean]): void {
  el.hidden = false;
  if (el.textContent !== text) el.textContent = text;
  if (cls) el.classList.toggle(cls[0], cls[1]);
  const v = world.project(counter.camera);
  // Keep the whole tag on screen (they're centred on their point).
  const half = el.offsetWidth / 2 + 4;
  el.style.left = `${Math.min(bands.counter.w - half, Math.max(half, ((v.x + 1) / 2) * bands.counter.w))}px`;
  el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
}
function updateStationUi(): void {
  const playing = game.phase === "playing" && counter.settled;
  const on = (page: number) => playing && counter.page === page;
  counter.taps.forEach((t, i) => {
    if (!on(0) || t.puddle < 0.01) return void (puddleTags[i].hidden = true);
    if (t.cup) return void (puddleTags[i].hidden = true);
    placeTag(puddleTags[i], t.puddleObj.position.clone().setZ(t.puddleObj.position.z + 0.7), "Scrub to wipe");
  });
  const rackHeld = Math.max(0, ...counter.rack.layers.map((l) => l.piece.held ?? 0));
  const rackHtml = counter.middle === "comal" && on(HOME_PAGE) ? holdBar(rackHeld) : "";
  rackTag.hidden = !rackHtml;
  if (rackHtml) {
    if (rackTag.innerHTML !== rackHtml) rackTag.innerHTML = rackHtml;
    const v = counter.rackPoint().add(new THREE.Vector3(0, 0, 0.75)).project(counter.camera);
    rackTag.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    rackTag.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  }
}

function updateStaleUi(): void {
  const playing = game.phase === "playing";
  game.slots.forEach((s, i) => {
    const el = holdTags[i];
    const held = Math.max(0, ...s.plate.layers.map((l) => l.piece.held ?? 0), s.plate.fries ? friesOnTrayScale(s.plate.fries.held ?? 0) : 0);
    el.hidden = !playing || !s.order || held <= 0;
    if (el.hidden) return;
    const left = Math.max(0, 1 - held / HOLD_RUIN);
    (el.firstElementChild as HTMLElement).style.width = `${(left * 100).toFixed(1)}%`;
    const state = held < HOLD_GRACE ? "fresh" : held < (HOLD_GRACE + HOLD_RUIN) / 2 ? "drying" : "dry";
    if (el.dataset.state !== state) {
      el.dataset.state = state;
      el.setAttribute("aria-label", state === "fresh" ? "Fresh" : state === "drying" ? "Drying" : "Gone cold");
    }
    const v = trayView.staleBarPoint(i).project(trayView.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.tray.w}px`;
    el.style.top = `${bands.tray.y + ((1 - v.y) / 2) * bands.tray.h}px`;
  });
}

/**
 * Warm holding's bar (after build #78): the tray's staleness bar in small, under a meter on the
 * warm end, in the taco rack, on a lifted basket or a carton. Hidden while it keeps, amber once it
 * starts drying, red near the end. `grace` and `ruin` are that food's seconds.
 */
function holdBar(held: number | undefined, grace = HOLD_GRACE, ruin = HOLD_RUIN): string {
  const h = held ?? 0;
  // Only once it starts to dry (after build #86): a green line under fresh food read as a mystery.
  if (h < grace) return "";
  const left = Math.round(Math.max(0, 1 - h / ruin) * 20) * 5;
  const state = h < grace ? "fresh" : h < (grace + ruin) / 2 ? "drying" : "dry";
  return `<span class="hbar ${state}" role="img" aria-label="${state === "fresh" ? "Keeping" : state === "drying" ? "Drying" : "Gone cold"}"><i style="width:${left}%"></i></span>`;
}
/** Fries' soggy seconds as the tray bar's seconds, so one bar reads for both. */
const friesOnTrayScale = (h: number): number => (h <= FRIES_HOLD.grace ? (h * HOLD_GRACE) / FRIES_HOLD.grace : HOLD_GRACE + ((h - FRIES_HOLD.grace) * (HOLD_RUIN - HOLD_GRACE)) / (FRIES_HOLD.ruin - FRIES_HOLD.grace));

/**
 * For the Kitchen timer's rings: per counter (drinks, middle, fryer), how far the thing closest to
 * done has come toward it (0..1), or null when nothing there is on its way.
 */
function nextDone(): (number | null)[] {
  const best = (xs: number[]) => (xs.length ? Math.min(1, Math.max(...xs)) : null);
  const mid: number[] = [];
  for (const g of counter.grillItems) {
    const k = g.piece.kind as Cookable;
    if (g.below || !(k in COOK_SCALE) || counter.heatOf(g) !== "hot") continue;
    const lv = cookLevel(g.piece);
    if (lv < COOK_SCALE[k].done) mid.push(lv / COOK_SCALE[k].done);
  }
  counter.bays.forEach((b, i) => {
    const r = i < counter.bayCount && b.closed ? counter.bayReading(b) : null;
    if (r && r.kind in COOK_SCALE) {
      const lv = cookLevel(r);
      const d = COOK_SCALE[r.kind as Cookable].done;
      if (lv < d) mid.push(lv / d);
    }
  });
  if (counter.middle === "oven")
    for (const s of counter.ovenSpots.slice(0, counter.ovenCount)) {
      const d = s.layers[0]?.piece;
      if (d?.kind === "dough" && paleSide(d) < COOK_SCALE.dough.done) mid.push(paleSide(d) / COOK_SCALE.dough.done);
    }
  const fry: number[] = [];
  for (const b of counter.baskets) {
    if (!b.loaded || !b.down) continue;
    if (b.shell) {
      const lv = cookLevel(b.shell);
      if (lv < COOK_SCALE.tostada.done) fry.push(lv / COOK_SCALE.tostada.done);
    } else if (b.cook < FRY_ZONE[b.fry].done) fry.push(b.cook / FRY_ZONE[b.fry].done);
  }
  const drinks = counter.taps.filter((t) => t.pouring && t.cup).map((t) => t.cup!.fill / DRINK_FILL.perfect);
  return [best(drinks), best(mid), best(fry)];
}

/** Fries read on the same meter as everything else. */
const friesMeter = (cook: number, fry: FryKind = "fries"): string => cookMeter(fry, cook);

/**
 * The big level bar down the left of the counter: it fades in while a drink pours (how full the
 * cup is) or while the shaker is over fries (how salty they are), with a Perfect line to stop at
 * and the good band shaded, and fades out when you let go.
 */
const levelBar = (() => {
  const el = document.createElement("div");
  el.className = "lvl";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="lvl-tube"><div class="lvl-in"><i class="ok"></i><i class="fill"></i></div><div class="lvl-mark"><b class="perfect"><span>Perfect</span></b></div></div><em></em>`;
  ui.root.appendChild(el);
  return { el, fill: el.querySelector<HTMLElement>(".fill")!, ok: el.querySelector<HTMLElement>(".ok")!, perfect: el.querySelector<HTMLElement>(".perfect")!, name: el.querySelector<HTMLElement>("em")! };
})();
function updateLevelBar(): void {
  const t = game.phase === "playing" ? counter.taps.find((x) => x.pouring && x.cup) : undefined;
  const salting = game.phase === "playing" && ptr?.held?.payload.type === "salt" && shaker.target;
  let show: null | { v: number; max: number; lo: number; hi: number; perfect: number; color: string; name: string; over?: boolean } = null;
  const lad = game.phase === "playing" ? ladleLevel() : null;
  if (sauceLevel) show = { v: sauceLevel.v, max: METER_TOP, lo: SAUCE_BAND.lo, hi: SAUCE_BAND.hi, perfect: (SAUCE_BAND.lo + SAUCE_BAND.hi) / 2, color: SAUCE_TINT[sauceLevel.kind], name: capitalise(sauceLevel.kind), over: sauceLevel.over };
  // Tomato sauce wants the base covered to the crust; olive oil is a drizzle, like a squeeze bottle.
  else if (lad?.kind === "redsauce") show = { v: lad.v, max: 1, lo: LADLE_BAND.lo, hi: 1, perfect: 0.75, color: SAUCE_TINT.redsauce, name: "Sauce" };
  else if (lad) show = { v: lad.v, max: METER_TOP, lo: SAUCE_BAND.lo, hi: SAUCE_BAND.hi, perfect: (SAUCE_BAND.lo + SAUCE_BAND.hi) / 2, color: SAUCE_TINT[lad.kind], name: capitalise(KIND_LABEL[lad.kind]) };
  else if (t?.cup) show = { v: t.cup.fill, max: 1, lo: DRINK_FILL.full, hi: 1, perfect: DRINK_FILL.perfect, color: DRINK_TINT[t.cup.flavor ?? t.flavor], name: SIZE_LABEL[t.cup.size] };
  else if (salting) show = { v: shaker.target!.f.salt ?? 0, max: SALT.max, lo: SALT.low, hi: SALT.high, perfect: SALT.perfect, color: "#fbfaf6", name: "Salt" };
  levelBar.el.classList.toggle("on", !!show);
  levelBar.el.classList.toggle("sauce", !!sauceLevel);
  // Shake the shaker in hand a little with each shake.
  shaker.wiggle = Math.max(0, shaker.wiggle - 0.12);
  const held = ptr?.held;
  if (held?.payload.type === "salt") held.counterObj.rotation.z = held.trayObj.rotation.z = Math.sin(performance.now() / 30) * 0.35 * shaker.wiggle;
  if (!show) return;
  // Over the sauce close-up it runs down the left of the zoomed square; otherwise down the counter.
  const r = sauceLevel ? sauceLevel.rect : bands.counter;
  levelBar.el.style.left = sauceLevel ? `${r.x + 12}px` : "";
  levelBar.el.style.top = `${r.y + r.h * (sauceLevel ? 0.16 : 0.1)}px`;
  levelBar.el.style.height = `${r.h * (sauceLevel ? 0.7 : 0.62)}px`;
  const pct = (x: number) => `${(Math.min(1, Math.max(0, x / show!.max)) * 100).toFixed(1)}%`;
  levelBar.fill.style.height = pct(show.v);
  levelBar.fill.style.background = show.color;
  levelBar.ok.style.bottom = pct(show.lo);
  levelBar.ok.style.height = `calc(${pct(show.hi)} - ${pct(show.lo)})`;
  levelBar.perfect.style.bottom = pct(show.perfect);
  levelBar.el.classList.toggle("over", show.over ?? show.v > show.hi + 0.001);
  if (levelBar.name.textContent !== show.name) levelBar.name.textContent = show.name;
}

const fryTags: HTMLElement[] = [];
/** Meters over each loaded basket and each filled carton on the packing pads. */
function updateFryTags(): void {
  const on = game.phase === "playing" && counter.page === 2 && counter.settled;
  const spots: { at: THREE.Vector3; html: string }[] = [];
  if (on) {
    for (const [i, b] of counter.baskets.entries()) {
      if (!b.loaded) continue;
      const scoops = Math.round(b.amount / FRIES_SCOOP);
      const pips = [0, 1, 2].map((k) => `<b class="${k < scoops ? "on" : ""}"></b>`).join("");
      const hb = b.down ? "" : holdBar(b.held, FRIES_HOLD.grace, FRIES_HOLD.ruin);
      spots.push({ at: counter.fryTagPoint(i), html: `${friesMeter(b.cook, b.fry)}${hb}<span class="scoops" aria-label="${scoops} of 3 scoops">${pips}</span>` });
    }
    for (const p of counter.packs) {
      if (!p.size || p.fill <= 0) continue;
      const red = counter.redRock;
      const tops = [p.salt && (SUGARED.has(p.fry) ? "Sugar" : "Salt"), p.curds && (red ? "Jalapeños" : "Curds"), p.gravy && (red ? "Queso" : "Gravy")].filter(Boolean).map((t) => `<em>${t}</em>`).join("");
      spots.push({ at: new THREE.Vector3(p.x, 0.2, p.z + 0.5), html: `${friesMeter(p.cook, p.fry)}${holdBar(p.held, FRIES_HOLD.grace, FRIES_HOLD.ruin)}${tops ? `<span class="tops">${tops}</span>` : ""}` });
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

/** The uneven-bake turn arrows, one per oven spot. */
const turnCues: HTMLElement[] = [];

/** A meter in front of each press bay with food in it (the lid hides the food), and on a closed panini a melt mark. */
const bayTags: HTMLElement[] = [];
function updatePressTags(): void {
  const on = game.phase === "playing" && counter.middle === "press" && counter.page === HOME_PAGE && counter.settled;
  counter.bays.forEach((b, i) => {
    let el = bayTags[i];
    if (!el) {
      el = bayTags[i] = document.createElement("div");
      el.className = "gtag pt bay";
      ui.root.appendChild(el);
    }
    const r = on && i < counter.bayCount ? counter.bayReading(b) : null;
    el.hidden = !r;
    if (!r) return;
    const melt = b.layers.find((l) => l.piece.kind === "mozzarella" || l.piece.kind === "cheddar");
    const meter = r.kind in COOK_SCALE ? cookMeter(r.kind as Cookable, cookLevel(r)) : "";
    const html = `${meter}${melt ? `<em class="melt${isMelted(melt.piece) ? " on" : ""}">${isMelted(melt.piece) ? "Melted" : "Melting"}</em>` : ""}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle("off", !b.closed);
    const v = counter.bayTagPoint(i).project(counter.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
}

/** A meter in front of each pie in the oven: its paler side's bake (how even it is shows on the crust itself). */
const ovenTags: HTMLElement[] = [];
function updateOvenTags(): void {
  const on = game.phase === "playing" && counter.middle === "oven" && counter.page === HOME_PAGE && counter.settled;
  counter.ovenSpots.forEach((s, i) => {
    let el = ovenTags[i];
    if (!el) {
      el = ovenTags[i] = document.createElement("div");
      el.className = "gtag pt bay oven";
      ui.root.appendChild(el);
    }
    const d = on && i < counter.ovenCount ? s.layers[0]?.piece : undefined;
    el.hidden = !d || d.kind !== "dough";
    // The turn arrow goes with the pie (after build #82 it could linger once the pie was taken out).
    if (el.hidden || !d) {
      if (turnCues[i]) turnCues[i].hidden = true;
      return;
    }
    // Uneven (after build #78): the meter splits into the pale side and the dark side, and a turn
    // arrow sits on the pale edge of the pie, the side to nudge round to the back wall.
    const uneven = darkSide(d) - paleSide(d) > LEOPARD_EVEN && darkSide(d) < COOK_SCALE.dough.over;
    const html = uneven ? `<span class="split">${cookMeter("dough", paleSide(d))}${cookMeter("dough", darkSide(d))}</span>` : cookMeter("dough", paleSide(d));
    if (el.innerHTML !== html) el.innerHTML = html;
    const v = counter.spotTagPoint(i).project(counter.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
    const arrow = turnCues[i] ??= (() => {
      const a = document.createElement("div");
      a.className = "turncue";
      a.textContent = "↻";
      a.setAttribute("aria-label", "Pale side: nudge it round to the back");
      ui.root.appendChild(a);
      return a;
    })();
    const at = uneven ? counter.paleEdgePoint(i) : null;
    arrow.hidden = !at;
    if (at) {
      const w = at.project(counter.camera);
      arrow.style.left = `${((w.x + 1) / 2) * bands.counter.w}px`;
      arrow.style.top = `${bands.counter.y + ((1 - w.y) / 2) * bands.counter.h}px`;
    }
  });
  for (let i = counter.ovenSpots.length; i < turnCues.length; i++) turnCues[i].hidden = true;
}

/**
 * Busy surfaces (after build #78): each grill item's cook rate, measured from its meter between
 * frames and smoothed, so a tag can tell how far it is from over-done.
 */
const cookRates = new WeakMap<GrillItem, { lv: number; rate: number }>();
/** A meter this many seconds or more from over-done, in its done band, steps back (slim and faint). */
const METER_CALM_S = 5;

/** Seconds until a grill item reaches over-done at its current pace (Infinity when it isn't cooking). */
function secsToOver(it: GrillItem, dt: number): number {
  const k = it.piece.kind as Cookable;
  if (!(k in COOK_SCALE)) return Infinity;
  const lv = cookLevel(it.piece);
  const was = cookRates.get(it);
  const now = was && dt > 0 ? Math.max(0, (lv - was.lv) / dt) : 0;
  const rate = was ? (dt > 0 ? was.rate * 0.85 + now * 0.15 : was.rate) : 0;
  cookRates.set(it, { lv, rate });
  return rate > 1e-4 ? (COOK_SCALE[k].over - lv) / rate : Infinity;
}

function updateGrillTags(dt = 0): void {
  updatePressTags();
  updateOvenTags();
  // One tag per stack, under its top item.
  const items = game.phase === "playing" ? counter.grillItems.filter((g) => !counter.above(g)) : [];
  // Where each tag goes, first, so crowded ones can shrink and the most urgent can sit on top.
  const spots = items.map((it) => {
    const v = it.obj.position.clone().setY(GRILL_TOP).add(new THREE.Vector3(0, 0.2, Math.min(0.36, counter.grillTagZ - it.z))).project(counter.camera);
    const k = it.piece.kind;
    const zone = k in COOK_SCALE ? cookZone(k as Cookable, cookLevel(it.piece)) : "under";
    return { x: ((v.x + 1) / 2) * bands.counter.w, y: bands.counter.y + ((1 - v.y) / 2) * bands.counter.h, left: secsToOver(it, dt), zone };
  });
  const urgent = spots.reduce((u, s, i) => (s.zone === "done" && s.left < (spots[u]?.left ?? Infinity) ? i : u), -1);
  while (grillTags.length < items.length) {
    const el = document.createElement("div");
    el.className = "gtag pt";
    ui.root.appendChild(el);
    grillTags.push(el);
  }
  grillTags.forEach((el, i) => {
    const it = items[i];
    if (!it) {
      el.hidden = true;
      return;
    }
    // Under the item, or over its front edge on the front row, clear of the zone buttons.
    const { x, y, left, zone } = spots[i];
    el.hidden = x < 0 || x > bands.counter.w || it.flipT >= 0;
    if (el.hidden) return;
    const html = itemTag(it);
    if (el.innerHTML !== html) el.innerHTML = html;
    const heat = counter.heatOf(it);
    el.classList.toggle("warm", heat === "warm");
    el.classList.toggle("off", heat === "off");
    // Settled: done and still METER_CALM_S or more from over-done, the meter fades back. The done
    // item closest to over-done draws on top. (Every meter is the same size: none shrink when crowded.)
    el.classList.toggle("calm", zone === "done" && left >= METER_CALM_S);
    el.classList.toggle("urgent", i === urgent);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });
}

const clearColor = new THREE.Color("#2a3340");
let frameNo = 0;
// Low quality has no shadow map: soft blobs keep food, cups and cartons grounded instead.
const counterBlobs = new BlobShadows(counter.scene);
const trayBlobs = new BlobShadows(trayView.scene);
function render(): void {
  const H = viewH;
  const low = gfx === "low";
  counterBlobs.update(low, low ? [...counter.grillItems.filter((g) => !g.held).map((g) => g.obj), ...counter.cups.map((c) => c.obj), ...counter.packs.map((p) => p.obj), ...counter.stacks.map((s) => s.obj)] : []);
  trayBlobs.update(low, low ? trayView.plates.flatMap((p) => [p.entries.length ? p.burger : null, p.fries, p.cup]) : []);
  // Low quality: every so often, drop the outlines of things too small for a line to read.
  if (frameNo++ % 15 === 0) {
    cullSmallHulls(counter.scene, counter.camera, bands.counter.h, gfx === "low");
    cullSmallHulls(customersView.scene, customersView.camera, bands.customers.h, gfx === "low");
  }
  renderer.setScissorTest(false);
  renderer.setClearColor(clearColor);
  renderer.clear();
  renderer.setScissorTest(true);
  const draw = (r: Rect, scene: THREE.Scene, cam: THREE.Camera) => {
    const y = H - r.y - r.h;
    renderer.setViewport(r.x, y, r.w, r.h);
    renderer.setScissor(r.x, y, r.w, r.h);
    setOutlineViewport(r.w, r.h);
    renderer.render(scene, cam);
  };
  draw(bands.customers, customersView.scene, customersView.camera);
  draw(bands.tray, trayView.scene, trayView.camera);
  draw(bands.counter, counter.scene, counter.camera);
  if (sauceZoom.visible) {
    const r = sauceZoom.rect;
    draw({ x: colX + r.x, y: r.y, w: r.w, h: r.h }, trayView.scene, sauceZoom.camera);
  }
  if (ladleZoom.visible) {
    const r = ladleZoom.rect;
    draw({ x: colX + r.x, y: r.y, w: r.w, h: r.h }, counter.scene, ladleZoom.camera);
  }
}
/** Nothing moves under the pause menu: draw a couple of frames, then stop until something changes. */
function redrawPaused(): void {
  pausedDraws = 0;
}

let last = performance.now();
/** Automation can freeze the loop and drive time itself (see __bv below). */
let manualClock = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manualClock) {
    tick(dt);
    // The home screen covers the truck completely, so skip drawing it there and save battery;
    // paused, the picture under the menu is still, so it's drawn twice and then left.
    if (game.phase === "paused") {
      if (pausedDraws++ < 2) render();
    } else {
      pausedDraws = 0;
      if (game.phase !== "title") render();
    }
  }
  requestAnimationFrame(frame);
}
showTitle();
requestAnimationFrame(frame);

// Tutorial mode: the thumb (src/tutorial). It reads the game through this and never changes it.
startCoach(
  lessons({
    save,
    phase: () => game.phase,
    prepOpen: () => prepOpen,
    overlay: () => game.overlay,
    mapSelected: () => document.querySelector<HTMLElement>(".home-town.sel")?.dataset.town ?? null,
    kitchen: {
      game,
      counter,
      trayView,
      project: (band, v) => {
        const cam = band === "counter" ? counter.camera : trayView.camera;
        cam.updateMatrixWorld();
        const p = v.clone().project(cam);
        const r = bands[band];
        return { x: r.x + ((p.x + 1) / 2) * r.w, y: r.y + ((1 - p.y) / 2) * r.h };
      },
      counterBand: () => ({ x: bands.counter.x, y: bands.counter.y, w: bands.counter.w, h: bands.counter.h }),
      ticketOpen: () => ticketOpen,
      tickets: ui.tickets,
      bell: () => trayActs.find((a) => !a.callBtn.hidden)?.callBtn ?? null,
      tabs: ui.tabs,
      sauce: () => (sauceDrag ? { locked: sauceDrag.locked, armed: true } : sauceArm ? { locked: false, armed: true } : null),
      undoTray: () => {
        // Only when Undo would take that tray's top layer off (the one the lesson is about).
        const m = history.top(undoOk);
        if (m?.to.at !== "tray" || m.what.k !== "food") return -1;
        const ls = game.slots[m.to.slot].plate.layers;
        return m.what.layers.some((l) => l.piece === ls[ls.length - 1]?.piece) ? m.to.slot : -1;
      },
      undoButton: ui.undo,
      sauceCentre: () => {
        const f = sauceFinal();
        return { x: colX + f.x + f.w / 2, y: f.y + f.h / 2, r: f.w / 2 };
      },
      eggStage: () => eggHand?.stage ?? null,
      holding: () => !!counter.inHand || !!eggHand || ptr?.mode === "held",
      windowCap: () => WINDOW[game.pacing],
      counts: coachCounts,
    },
  }),
  { paused: () => modalOpen() || (game.phase === "playing" && document.hidden) },
);
skipLessonsFor(save.tutorialDone);

// A brand-new player: say hello, and that tutorial mode and Chill pacing are on (both can be switched off here).
if (welcomeDue(save)) {
  showWelcome({
    pacing: difficulty,
    done: (tutorial, chill) => {
      setCoachOn(tutorial);
      if (!tutorial) {
        save.tutorialDone = true;
        writeSave(save);
      }
      difficulty = chill ? "chill" : "balanced";
      try {
        localStorage.setItem("bv-difficulty", difficulty);
      } catch {
        // Storage can be unavailable; the pick still holds for this session.
      }
    },
  });
}

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
  spawnCustomer,
  customersView,
  serve,
  /** Show a customer's opinion (and a review) over slot i, for screenshots. */
  opinion: showOpinion,
  goToPage,
  goToStop,
  eggInHand: () => eggHand?.stage ?? null,
  cookLevel,
  stops: STOPS.length,
  ring: ringBell,
  callNext,
  scorePlate,
  /** What the finger on the counter is doing now (for the bot). */
  ptrMode: () => ptr?.mode ?? null,
  /** The tray slot under a screen point (CSS px), and which band it's in (for the bot). */
  trayPick: (x: number, y: number) => [bandAt(y), trayView.pick(ndcIn(bands.tray, x - colX, y))],
  gesture: () => lastGesture,
  /** Screen point (CSS px) of the fully zoomed sauce view's middle, and its side. */
  sauceCentre: () => {
    const f = sauceFinal();
    return [colX + f.x + f.w / 2, f.y + f.h / 2, f.w];
  },
  ptr: () => ptr && { mode: ptr.mode, hit: ptr.hit?.type, band: ptr.band },
  /** Undo (DESIGN §31): press the header button, whether it's on, how many moves are kept, and whether something is flying back. */
  undo: () => undoLast(),
  canUndo: () => canUndo(),
  history: () => history.size,
  flying: () => !!fly,
  /** The name bubble's text while it shows. */
  bubble: () => (bubbleEl.hidden ? null : bubbleEl.textContent),
  /** Sauce: the tapped bottle waiting for a burger, and the close-up if one is open. */
  sauceState: () => ({ armed: sauceArm?.kind ?? null, open: sauceDrag && { how: sauceDrag.how, locked: sauceDrag.locked, stroking: sauceDrag.stroking, slot: sauceDrag.slot, armed: sauceDrag.armed } }),
  /** The knife: where it lies (world), whether it's lifted, and the cut view (its square in CSS px, and the cuts made). */
  knife: () => ({ at: counter.knifePoint().toArray(), armed: knifeArm, carried: !!knifeInHand }),

  mem: () => ({ ...renderer.info.memory }),
  step: (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) tick(1 / 30);
    render();
  },
  /** One frame of the game without drawing it (a bot's touch playtest runs the clock this way in real time). */
  tick: (dt: number) => tick(dt),
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
  /** The press, for the playtest bot: where each bay's plate and handle are, and what's in them. */
  press: () => ({
    middle: counter.middle,
    bays: counter.bays.slice(0, counter.bayCount).map((b, i) => ({ closed: b.closed, open: b.open, layers: b.layers.map((l) => ({ kind: l.piece.kind, cook: cookLevel(l.piece), melt: l.piece.melt ?? 0, cut: !!l.piece.cut })), plate: counter.bayPoint(i).toArray(), handle: counter.handlePoint(i).toArray() })),
    board: counter.board?.on ? { at: counter.boardPoint().toArray(), layers: counter.board.layers.map((l) => l.piece.kind) } : null,
    fryBins: Object.fromEntries(Object.entries(counter.fryBinAt).map(([k, v]) => [k, v!.toArray()])),
  }),
  /** The oven, for the playtest bot: the peel, each spot and the board, and where the dough, pot and bottles are. */
  oven: () => {
    const pie = (ls: Layer[]) => ls.map((l) => ({ kind: l.piece.kind, cook: [...l.piece.cook], melt: l.piece.melt ?? 0, rim: [...(l.piece.rim ?? [])], yaw: l.piece.yaw ?? 0, scorch: l.piece.scorch ?? 0, folded: !!l.piece.folded, cuts: l.piece.cuts ?? 0, stroke: l.piece.stroke?.length ?? 0 }));
    return {
      middle: counter.middle,
      peel: { at: counter.peelPointWorld().toArray(), handle: counter.peelHandleWorld().toArray(), held: counter.peelHeld, home: counter.peelHome, layers: pie(counter.peel.layers), target: counter.peelTarget() },
      spots: counter.ovenSpots.slice(0, counter.ovenCount).map((s, i) => ({ at: counter.spotPoint(i).toArray(), spin: s.spin, yaw: s.layers[0]?.piece.yaw ?? 0, layers: pie(s.layers) })),
      rest: { at: counter.restPoint().toArray(), board: counter.rest === counter.board, layers: pie(counter.rest.layers) },
      board: counter.board?.on ? { at: counter.boardPoint().toArray(), layers: pie(counter.board.layers) } : null,
      dough: counter.doughPoint().toArray(),
      pot: counter.potPoint().toArray(),
      batter: counter.batterPoint().toArray(),
      fryBins: Object.fromEntries(Object.entries(counter.fryBinAt).map(([k, v]) => [k, v!.toArray()])),
    };
  },
  /** The comal, for the playtest bot: what's on it, where things are and the tortilla press. */
  comal: () => ({
    middle: counter.middle,
    zones: [...counter.zones],
    items: counter.grillItems.map((g) => ({ kind: g.piece.kind, at: g.obj.position.toArray(), cook: cookLevel(g.piece), faces: [...g.piece.cook], folded: !!g.piece.folded, fill: (g.piece.fill ?? []).map((f) => ({ kind: f.kind, melt: f.melt ?? 0 })), flips: g.piece.flips ?? 0, r: TORTILLA_R[g.piece.kind as "corn" | "flour"] ? TORTILLA_R[g.piece.kind as "corn" | "flour"] * GRILL_SCALE : 0 })),
    tpress: counter.tpressOn ? counter.tpressPoint().toArray() : null,
    rack: { at: counter.rackPoint().toArray(), layers: counter.rack.layers.map((l) => ({ kind: l.piece.kind, cook: cookLevel(l.piece), held: l.piece.held ?? 0 })) },
    zonePoints: [0, 1, 2].map((i) => counter.zonePoint(i).toArray()),
    baskets: counter.baskets.map((b, i) => ({ loaded: b.loaded, down: b.down, fry: b.fry, cook: b.cook, shell: b.shell ? cookLevel(b.shell) : null, at: counter.fryTagPoint(i).toArray() })),
    packs: counter.packs.map((p) => ({ size: p.size, fill: p.fill, fry: p.fry, at: [p.x, p.y, p.z] })),
  }),
  save,
  showTitle,
  coach: coachState,
  menu: { openMenu, openHowTo, openMenuRef, closeAll },
  /** The town's regular's order (after build #78), for screenshots. */
  regularOrder: (id: number) => regularOrder(id, shopStop()),
  manual: (on: boolean) => {
    manualClock = on;
  },
};

