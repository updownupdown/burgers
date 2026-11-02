import * as THREE from "three";
import { CABIN } from "./render/cabin";
import { buzz, Sfx } from "./audio";
import { cookLevel, COOK_SCALE, cookZone, DRINK_FILL, fireLead, friesZone, FRY_ZONE, isMelted, ovenLead, paleSide, SALT, type Cookable } from "./game/cooking";
import { makeOrder, orderFromRecipe, seededRng, type Rng } from "./game/menu";
import { expectedCustomers, sleep } from "./game/day";
import { greatShift, townBonus, type BonusId } from "./game/bonus";
import { arrivalGap, clockAt, clockLabel, shiftProgress, shiftSeconds, validShift, type ShiftWindow } from "./game/shift";
import { freshSave, loadSave, passed, passTown, writeSave, type Closing } from "./game/progress";
import { eventOn, fountainFor, fryerOf, middleOf, townById, withEvent, type TownEvent } from "./game/stops";
import { criticChance, fadePopularity, pieceFor, type PressPiece } from "./game/press";
import { DIFFICULTY, verdict, type Difficulty } from "./game/difficulty";
import { joinChance, lineDrain, linePatience, WINDOW, wordOfMouth } from "./game/line";
import { HOLD_GRACE, HOLD_RUIN, LADLE_BAND, payout, quickSauceStroke, SAUCE_BAND, sauceCoverage, sauceVerdict, scorePlate, type SauceWord } from "./game/scoring";
import { CROWD, menuFor } from "./game/business";
import { addReviews, brief, leavesReview, opinionFor, opinionLine, ratingPull, reviewAverage } from "./game/reviews";
import { opinionFace, starRow } from "./ui/faces";
import { DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "./game/menu";
import type { DrinkId, FriesSize, FryKind, Layer, Order, Piece, Plate, SauceKind, Size } from "./game/types";
import { AFTER_OVEN, BREADS, COMAL_FILL, COUNTED, DRINK_LABEL, FRIES_PORTION, FRIES_SCOOP, FRY_LABEL, fryOf, GRILLABLE, isSauce, KIND_LABEL, newPiece, pressable, PROTEINS, sauceRadius, SCOOPED, SIZE_LABEL, SUGARED, TORTILLAS, unfoldTortilla } from "./game/types";
import { SCALE } from "./render/units";
import { dressCup } from "./render/cup";
import { makeCarton, makeCup, makeFood, makeFries, sliceSpot, stackBases } from "./render/food";
import { TORTILLA_R } from "./render/tacos";
import { makeFlatbread } from "./render/flatbread";
import { makePeel, makeSauceLadle, PEEL } from "./render/machines/oven";
import { flickOf, type Flick } from "./game/peel";
import { disposeObject } from "./render/materials";
import { CounterView, CUP_IN_HAND, EMPTY_PACK, STOPS, GRILL_SCALE, GRILLE_ZONE, FLAT_ZONE, HEARTH_Y, HOME_PAGE, PAGES, PEEL_Y, GRILL_TOP, ZONE_START, type GrillItem, type Hit, type PeelTarget, type PieHolder } from "./scenes/counter";
import { PLATE } from "./render/machines/press";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import { SauceZoom } from "./scenes/saucezoom";
import { makeEgg, type EggStage } from "./render/egg";
import "./ui/components.css";
import "./style.css";
import { mountHome, refreshHome, type NightShow } from "./screens/home";
import { GARAGE_START, garageHtml, type GarageView } from "./screens/garage";
import { buyBonus, buyLook, wearLook } from "./game/garage";
import type { Slot as LookSlot } from "./game/looks";
import { closingHtml, prepHtml, reviewsHtml, syncRange, toggleBox, toggleIngredients } from "./screens/day";
import { buildUi, cookMeter, patienceMood, peekHtml, setDrinkLabels, setTabArt, ticketHtml } from "./ui";
import { DRINK_TINT } from "./render/machines";
import { buildLabel, registerServiceWorker, reloadTo, startUpdateChecks, type VersionInfo } from "./update";
import { scrollShadows } from "./screens/modal";
import { closeAll, initMenu, openHowTo, openMenu, openMenuRef, openSettings } from "./screens/menu";
import { dropBack, pushBack } from "./screens/nav";
import { simulate, type SimLevel } from "./game/devmode";
import { coachOn, coachShowing, coachState, setCoachOn, skipLessonsFor, startCoach } from "./tutorial/coach";
import { lessons } from "./tutorial/lessons";
import { showWelcome, welcomeDue } from "./tutorial/welcome";
import { modalOpen } from "./screens/modal";

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
  for (const sun of [counter.sun, trayView.sun]) {
    sun.castShadow = level !== "low";
    sun.shadow.radius = level === "high" ? 5 : 1;
  }
  renderer.shadowMap.needsUpdate = true;
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
  phase: "title" as "title" | "playing" | "paused" | "summary",
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
  s.plate = emptyPlate();
  s.sentBack = null;
  s.kept = { fries: null, drink: null };
  // Recipes you haven't made a couple of times yet start with the full layer list showing.
  // Every extra slice of a counted topping is another trip to the bin.
  const slices = order.layers.reduce((n, l) => n + Math.max(0, (l.count ?? 1) - 1), 0);
  s.maxPatience = (50 + order.layers.length * 7 + slices * 2 + order.layers.filter((l) => l.kind === "patty" || PROTEINS.has(l.kind)).length * 22 + (BREADS.has(order.layers[0]?.kind) ? 14 : 0) + (order.fries ? 30 : 0) + (order.poutine ? 10 : 0) + (order.drink ? 9 : 0)) * (has("bench") ? 1.3 : 1) * CROWD[stop().crowd].patience * DIFFICULTY[game.pacing].patience;
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
  return makeOrder(game.orderSeq++, game.rng, level, shopStop());
}

/** Things the tutorial waits for the player to do once (tutorial/lessons.ts). */
const coachCounts = { bell: 0, folds: 0, opens: 0 };

/**
 * A tap on the bell calls the next person up. Taps within this many seconds of the last one only
 * ring (a quick double ring is still one customer); after a pause the next tap calls again.
 */
const BELL_WINDOW = 1.5;

/** The first in line steps up to a free place at the window, if the difficulty allows another. */
function callNext(): boolean {
  const free = game.slots.findIndex((s) => !s.order && !s.fig);
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  if (free < 0 || !game.line.length || atWindow >= WINDOW[game.pacing]) return false;
  const w = game.line.shift()!;
  spawnCustomer(free, w.seed, w.order);
  return true;
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
ui.bell.addEventListener("click", ringBell);

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

/** The customer goes, showing what they thought (a face, maybe a line) and any review they left. */
function customerLeaves(i: number, stars: number, say: string | null, reviewed: boolean): void {
  const s = game.slots[i];
  s.leaving = true;
  s.fig?.setMood(stars >= 4 ? "happy" : stars === 3 ? "neutral" : stars === 2 ? "sad" : "angry");
  // Move straight on to the next order so nothing gets dropped on the departing plate.
  if (game.active === i) {
    const other = game.slots.findIndex((sl) => sl.order && !sl.leaving);
    if (other >= 0) setActive(other);
  }
  showOpinion(i, stars, say, reviewed);
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
    showHint("No one's waiting for that tray yet.", 1.5);
    return;
  }
  if (s.plate.layers.length === 0 && !s.plate.fries && !s.plate.drink) {
    showHint("That tray is empty!", 1.5);
    return;
  }
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
  // Hand-pressed tortillas (Sun Valley's press) earn a couple of dollars on top.
  const handmade = r.perks.includes("hand-pressed tortillas") ? 2 : 0;
  const tip = Math.round(baseTip * (has("tipjar") ? 1.3 : 1) * (meal ? 1.5 : 1) * CROWD[stop().crowd].tips) + handmade;
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
  customerLeaves(i, r.stars, say, reviewed);
  // The food is handed over right away so the plate is free for the next order.
  s.plate = emptyPlate();
  syncTray(i, false);
  sfx.whoosh();
  coinPop(i, pay + tip);
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
  hintOnce("sent-back", "Sent back: fix the tray and serve it again. The undo button on the tray takes the top layer off.", 4);
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
function showOpinion(i: number, stars: number, say: string | null, reviewed: boolean): void {
  const b = document.createElement("div");
  b.className = `opinion ${opinionFor(stars)}${say ? " said" : ""}`;
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

/** Where a tray's food sits on screen (its burger spot). */
function plateScreen(i: number): { x: number; y: number } {
  const b = trayView.plates[i].burger;
  b.updateWorldMatrix(true, false);
  const e = b.matrixWorld.elements;
  const v = new THREE.Vector3(e[12], 0.3, e[14]).project(trayView.camera);
  const r = bands.tray;
  return { x: r.x + ((v.x + 1) / 2) * r.w, y: r.y + ((1 - v.y) / 2) * r.h };
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

/** What the Undo button would take off: the top layer, else the drink, else the fries; null when it can't. */
function undoable(i: number): boolean {
  const s = game.slots[i];
  if (!s.order || s.leaving) return false;
  const ls = s.plate.layers;
  if (ls.length) {
    // Flatbreads move on the peel, and a folded quesadilla or a lidded sandwich comes off whole: no one-tap undo.
    if (ls[0].piece.kind === "dough" && !AFTER_OVEN.has(ls[ls.length - 1].piece.kind)) return false;
    if (ls[0].piece.folded) return false;
    if (counter.middle === "press" && ls.length > 1 && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind)) return false;
    return true;
  }
  return !!s.plate.drink || !!s.plate.fries;
}

/** Undo: the top thing on a tray goes in the trash. */
function undoTop(i: number): void {
  if (!undoable(i)) return;
  const s = game.slots[i];
  if (s.plate.layers.length) s.plate.layers.pop();
  else if (s.plate.drink) s.plate.drink = null;
  else s.plate.fries = null;
  syncTray(i, false);
  sfx.thud();
  buzz(12);
}

// Serve and Undo buttons on the trays: a tap is easier to find than a swipe.
const trayActs = game.slots.map((_, i) => {
  const serveBtn = document.createElement("button");
  serveBtn.className = "tray-serve";
  serveBtn.hidden = true;
  serveBtn.innerHTML = `<span aria-hidden="true">↑</span>Serve`;
  serveBtn.addEventListener("click", () => {
    if (game.phase === "playing" && trayReady(i)) serve(i);
  });
  const undoBtn = document.createElement("button");
  undoBtn.className = "tray-undo";
  undoBtn.hidden = true;
  undoBtn.setAttribute("aria-label", "Undo: take the top thing off");
  undoBtn.innerHTML = `<span aria-hidden="true">↶</span>`;
  undoBtn.addEventListener("click", () => {
    if (game.phase === "playing") undoTop(i);
  });
  ui.root.append(serveBtn, undoBtn);
  return { serveBtn, undoBtn };
});

function updateTrayActs(): void {
  const on = game.phase === "playing" && !ptr?.held;
  game.slots.forEach((_, i) => {
    const { serveBtn, undoBtn } = trayActs[i];
    const ready = on && trayReady(i);
    const undo = on && i === game.active && undoable(i);
    serveBtn.hidden = !ready;
    undoBtn.hidden = !undo;
    if (!ready && !undo) return;
    const p = plateScreen(i);
    const slotW = bands.tray.w / 3;
    // Serve sits over the finished food; Undo in the tray's bottom-left corner.
    if (ready) serveBtn.style.transform = `translate(${(i * slotW + slotW / 2 - 42).toFixed(0)}px, ${(p.y - 18).toFixed(0)}px)`;
    if (undo) undoBtn.style.transform = `translate(${(i * slotW + 2).toFixed(0)}px, ${(p.y + 2).toFixed(0)}px)`;
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
  | { type: "stack"; layers: Layer[]; grill?: { x: number; z: number }; fromPlate?: number; bay?: number; board?: boolean; peel?: boolean; spot?: number }
  | { type: "fries"; cook: number; basket: number | null; amount: number; fry?: FryKind; fromBatter?: boolean }
  | { type: "carton"; size: FriesSize; cook: number; fill: number; pack: number; salt: number; curds: boolean; gravy: boolean; fry?: FryKind; fromPlate?: number }
  | { type: "salt"; sugar?: boolean }
  | { type: "curds" }
  | { type: "gravy" }
  | { type: "drink"; flavor: DrinkId | null; fill: number; size: Size; ice: boolean; lid: boolean; from: { x: number; z: number } | null; fromPlate?: number }
  | { type: "ice" }
  | { type: "lid"; size: Size }
  | { type: "empty"; kind: "cup" | "carton"; size: Size; stack: number };

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
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate" | "wipe" | "rub" | "egg" | "bay" | "handle" | "board" | "tpress" | "ladle" | "peel" | "fold" | "spot" | "bench";
  /** The sauce or oil being spread on a pie being built (the oven page). */
  ladle?: SauceKind;
  /** A press near the side of an unbaked pie on the peel or the bench (pie-local): dragging it across the middle folds it into a calzone. */
  peelFold?: { holder: PieHolder; x: number; z: number };
  /** The peel in hand: when its last swipe was (ms), so one swipe is only counted once. */
  flickT?: number;
  /** A press on the edge of a tortilla on the comal (page-local grill point): dragging it across the middle folds it. */
  foldFrom?: { x: number; z: number };
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

function payloadVisual(p: Payload): THREE.Object3D {
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
    return o;
  }
  if (p.type === "lid") return counter.extraMesh("lid", p.size);
  if (p.type === "ice") return counter.extraMesh(p.type);
  const c = makeCup(p.flavor, p.lid, p.size);
  c.scale.multiplyScalar(CUP_IN_HAND);
  c.userData.setFill(p.fill);
  dressCup(c, p);
  return c;
}

function startHold(pt: Pointer, payload: Payload): void {
  const counterObj = payloadVisual(payload);
  const trayObj = payloadVisual(payload);
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
    counter.highlightTrash(band === "counter" && counter.overTrash(g));
  }
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
  if (payload.type === "curds" || payload.type === "gravy") {
    if (!s.plate.fries) {
      showHint("That goes on fries.", 1.5);
      return false;
    }
    if (!topFries(s.plate.fries, payload.type)) return false;
    syncTray(slot, false);
    return true;
  }
  if (payload.type === "salt") return false;
  if (payload.type === "carton") {
    if (s.plate.fries) {
      showHint("This tray already has fries.", 2);
      return false;
    }
    const { cook, size, fill, salt, curds, gravy } = payload;
    s.plate.fries = { cook, size, fill, salt, curds, gravy, ...(payload.fry && payload.fry !== "fries" ? { fry: payload.fry } : {}) };
  } else {
    if (s.plate.drink) {
      showHint("This tray already has a drink.", 2);
      return false;
    }
    if (!payload.flavor || payload.fill < 0.05) {
      showHint("Fill it first!", 1.5);
      return false;
    }
    s.plate.drink = { flavor: payload.flavor, fill: payload.fill, size: payload.size, ice: payload.ice, lid: payload.lid };
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
  if (payload.type === "salt") {
    // Salt goes on by shaking; letting go just puts the shaker back.
    (payload.sugar ? counter.sugarShaker : counter.shakerObj).visible = true;
    if (!shaker.shakes && shaker.target) showHint(payload.sugar ? `Shake it over the ${counter.orchard ? "fritters" : "churros"} to sugar them.` : "Shake it over the fries to salt them.", 2);
    shaker.target = null;
    return;
  }

  if (payload.type === "piece" && SCOOPED.has(payload.piece.kind) && payload.fromPlate === undefined && !payload.fromGrill && !pt.moved && dur < 450) {
    // The tuna well, and the pork and bean wells: a tap is one scoop onto the tray in front.
    addToPlate(game.active, payload, 0.04);
    sfx.plop();
    if (payload.piece.kind === "tuna") hintOnce("tuna", "Each tap is one scoop of tuna onto the tray. A Tuna Melt takes two.", 3);
    else hintOnce("scoop", "Each tap is one scoop onto the tray: one per taco. Or drag a scoop onto a tortilla on the comal.", 3.5);
    return;
  }

  if (counter.middle === "oven" && counter.page === HOME_PAGE && band === "counter" && payload.type === "piece" && payload.fromPlate === undefined && !payload.fromGrill && !pt.moved && dur < 450) {
    // At the oven a tap on the dough puts a base on the peel, and a tap on a pan puts one piece on
    // the pie there (or, for basil and rocket, on the flatbread on the tray).
    ovenTap(payload.piece);
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
    if (!done && counter.overTrash(g)) {
      // Every counter has a trash slot along its front edge.
      sfx.thud();
      buzz(20);
      done = true;
    } else if (station) {
      // Missed the station: it goes back where it came from below.
    } else if (payload.type === "stack") {
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
          hintOnce("tostada", "Tap the basket to lower it. The tostada is crisp and golden in about 10 seconds.", 3.5);
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
          else hintOnce("taco-fill", "Drag it up by its middle to take it to the tray. Dragging its edge across the middle folds it.", 4);
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
    if (payload.type === "stack" && payload.peel) counter.setPeel(payload.layers);
    if (payload.type === "stack" && payload.spot !== undefined) counter.setSpot(payload.spot, payload.layers);
    // Battered zucchini dropped nowhere useful goes back in the bowl.
    if (payload.type === "fries" && payload.fromBatter) counter.setBatter(Math.min(1, counter.batter + payload.amount));
    if (payload.type === "fries" && payload.basket !== null) {
      const b = counter.baskets[payload.basket];
      Object.assign(b, { loaded: true, cook: payload.cook, amount: payload.amount, fry: payload.fry ?? "fries" });
    }
    if (payload.type === "drink") {
      const { flavor, fill, size, ice, lid, from, fromPlate } = payload;
      // Lifted off a tray: back on the tray. Otherwise back where it stood (nothing else can have taken the spot meanwhile).
      if (fromPlate !== undefined && flavor) {
        game.slots[fromPlate].plate.drink = { flavor, fill, size, ice, lid };
        syncTray(fromPlate, false);
      } else if (from) counter.placeCup({ flavor, fill, size, ice, lid }, new THREE.Vector3(from.x, 0.3, from.z));
    }
    if (payload.type === "carton") {
      const { size, cook, fill, salt, curds, gravy, fromPlate } = payload;
      const fry = payload.fry ?? "fries";
      if (fromPlate !== undefined) {
        game.slots[fromPlate].plate.fries = { size, cook, fill, salt, curds, gravy, ...(fry !== "fries" ? { fry } : {}) };
        syncTray(fromPlate, false);
      } else {
        Object.assign(counter.packs[payload.pack], { size, cook, fill, salt, curds, gravy, fry });
        counter.syncPack(payload.pack);
      }
    }
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
    if (heat === "warm") hintOnce("comal-warm", "The right end of the comal only keeps things warm. Cook on the hot side, then park them here.", 3.5);
    else hintOnce("comal-hot", "Tortillas warm in about 6 seconds: soft, with brown spots. Don't leave them till they go hard.", 4);
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
const shaker = { shakes: 0, target: null as null | { f: { salt?: number }; sync: () => void }, dirX: 0, dirY: 0, runX: 0, runY: 0, wiggle: 0 };

/** Fries in a carton under the finger: on a packing pad, or on a plate on the tray. */
function saltTarget(pt: Pointer): typeof shaker.target {
  const band = bandAt(pt.y);
  if (band === "counter") {
    const pi = counter.friedPackAt(counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3));
    return pi >= 0 ? { f: counter.packs[pi], sync: () => counter.syncPack(pi) } : null;
  }
  if (band === "tray") {
    const slot = trayView.pick(ndcIn(bands.tray, pt.x, pt.y));
    const fries = slot >= 0 ? game.slots[slot].plate.fries : null;
    return fries ? { f: fries, sync: () => syncTray(slot, false) } : null;
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
    return topFries(counter.packs[pi], payload.type) && (counter.syncPack(pi), true);
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
    sfx.plop();
    return true;
  }
  if ((payload.type === "empty" && payload.kind === "cup") || payload.type === "drink") {
    // A cup stands anywhere on the drinks counter; over a drip tray it goes under that nozzle.
    if (counter.page !== 0 || counter.overTrash(g)) return false;
    const c = payload.type === "drink" ? payload : { flavor: null, fill: 0, size: payload.size, ice: false, lid: false };
    const { cup, why } = counter.placeCup({ flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid }, g);
    if (!cup) {
      if (why) showHint(why, 2);
      return false;
    }
    sfx.plop();
    if (payload.type === "empty") {
      hintOnce(cup.tap >= 0 ? "pour" : "cup-free", cup.tap >= 0 ? (game.pacing === "chill" ? "Hold the drink's button on top of the fountain. On Chill it stops at the line by itself." : "Hold the drink's button on top of the fountain. Watch the bar on the left and let go at the line.") : "Cups can stand anywhere. Move one under a nozzle to pour.", 3.5);
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
    Object.assign(p, { size: payload.size as FriesSize, cook: 0, fill: 0 });
    counter.syncPack(pi);
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
    p.cook = (p.cook * p.fill * portion + payload.cook * moved) / (p.fill * portion + moved);
    p.fill = Math.min(1, p.fill + moved / portion);
    counter.syncPack(pi);
    sfx.plop();
    // Whatever didn't fit stays in the basket for the next carton.
    const left = payload.amount - moved;
    if (left > 0.02) Object.assign(counter.baskets[payload.basket], { loaded: true, cook: payload.cook, amount: left, down: false, fry });
    if (p.fill < 0.95) hintOnce("skimpy", "Not quite full. Top it up with another batch, or customers call it skimpy.", 3);
    return true;
  }
  return false;
}

/**
 * Drag to sauce. Press a bottle in the caddy and the plates that can take sauce light up; drag
 * toward one and the camera eases in on it; once you're over it the burger fills the screen and
 * moving the finger squeezes a line. Let go and the bottle goes back in the caddy. One gesture.
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
}
let sauceDrag: SauceDrag | null = null;
const sauceZoom = new SauceZoom(trayView);
/** The sauce lands this far above the fingertip (CSS px), so the finger never hides the line. */
const NOZZLE_UP = 34;

/** The square the burger fills when fully zoomed, in column coordinates: centred on the tray band. */
function sauceFinal(): Rect {
  const w = bands.tray.w;
  const side = Math.min(w, Math.round(viewH * 0.5));
  const cy = bands.tray.y + bands.tray.h / 2;
  const y = Math.max(bands.customers.y + 44, cy - side / 2);
  return { x: (w - side) / 2, y, w: side, h: side };
}

function startSauce(pt: Pointer, kind: SauceKind): void {
  const ok = game.slots.map((s) => s.plate.layers.length > 0);
  if (!ok.some(Boolean)) {
    showHint("Start a burger on a tray first, then drag the sauce onto it.", 2.5);
    buzz(10);
    return;
  }
  pt.mode = "sauce";
  pt.sauce = kind;
  counter.liftSauce(kind);
  const slot = ok[game.active] ? game.active : ok.findIndex(Boolean);
  sauceDrag = { kind, ok, slot, aim: 0, locked: false, bottle: counter.sauceBottle(kind), lastPaint: 0, word: "" };
  sauceMove(pt);
  sfx.pop();
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

/** Squeeze a line where the nozzle is, if it's over the burger. */
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
  if (r > 1.12) return;
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

/** A quick squeeze from a tap on the bottle: a loose spiral on that tray's top layer. */
function quickSauce(kind: SauceKind, slot: number): void {
  const layers = slot >= 0 ? game.slots[slot].plate.layers : [];
  if (!layers.length) return;
  const top = layers[layers.length - 1];
  if (top.piece.kind === kind) {
    showHint(`There's ${kind} on already. To add more, drag the bottle onto the burger and draw circles.`, 3);
    return;
  }
  setActive(slot);
  const p = newPiece(kind);
  p.stroke = quickSauceStroke();
  layers.push({ piece: p, offX: top.offX * 0.5, offZ: top.offZ * 0.5 });
  syncTray(slot, true);
  sfx.squirt();
  buzz(10);
  hintOnce("quick-sauce", "A quick squeeze. For a Perfect, drag the bottle onto the burger and draw circles until it says Perfect.", 4);
}

/** Let go: the bottle goes back in the caddy and the camera eases back out. */
function endSauce(pt: Pointer, cancelled: boolean): void {
  const s = sauceDrag;
  if (!s) return;
  // A tap on the bottle: a quick squeeze onto the burger being built. Good enough; draw it yourself for Perfect.
  if (!cancelled && !s.locked && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) < 24) quickSauce(s.kind, s.ok[game.active] ? game.active : s.ok.findIndex(Boolean));
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
  const label = cov === 0 ? "Squeeze on" : wanted ? SAUCE_WORDS[word] : "Not on this order";
  sauceScore.dataset.word = wanted ? (cov === 0 ? "" : word) : "wrong";
  const b = sauceScore.firstElementChild as HTMLElement;
  const sp = sauceScore.lastElementChild as HTMLElement;
  if (b.textContent !== capitalise(kind)) b.textContent = capitalise(kind);
  if (sp.textContent !== label) sp.textContent = label;
  if (s && s.locked && wanted && word !== s.word) {
    if (word === "perfect") {
      buzz(12);
      sfx.plop();
    }
    s.word = word;
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
      else if (hit.fry === "chips") hintOnce("chips", "Tortilla wedges fry into chips in about 8 seconds: drop a scoop in a basket and lower it.", 3.5);
      else if (hit.fry === "churros") hintOnce("churros", "Churros fry like fries. Shake sugar on them once they're in the carton.", 3.5);
      else if (hit.fry === "zucchini") hintOnce("zucchini", "Zucchini fritti: drop it in the batter bowl at the back right, pick it up again, then into a basket. Salt them in the carton.", 4);
      else if (hit.fry === "fritters") hintOnce("fritters", "Apple fritters fry like fries. Shake cinnamon sugar on them once they're in the carton.", 3.5);
    }
    else if (hit.type === "bay") pt.mode = "bay";
    else if (hit.type === "handle") pt.mode = "handle";
    else if (hit.type === "board") {
      // At the oven the board is where a pie is set down: an unbaked one can be folded there too.
      if (!(counter.middle === "oven" && startFold(pt, counter.board!))) pt.mode = "board";
    } else if (hit.type === "stack") {
      const s = counter.stacks[hit.idx];
      startHold(pt, { type: "empty", kind: s.kind, size: s.size, stack: hit.idx });
    } else if (hit.type === "ice") startHold(pt, { type: "ice" });
    else if (hit.type === "lids") startHold(pt, { type: "lid", size: hit.size });
    else if (hit.type === "pack") {
      const p = counter.packs[hit.idx];
      if (p.size && p.fill > 0) {
        startHold(pt, { type: "carton", size: p.size, cook: p.cook, fill: p.fill, pack: hit.idx, salt: p.salt, curds: p.curds, gravy: p.gravy, fry: p.fry });
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
    if (pt.plate >= 0) setActive(pt.plate);
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
      // Drag down off a tray to lift the top thing off: the burger's top layer, else the drink,
      // else the fries. Drop it in the trash, on the grill or another tray; anywhere else it goes back.
      const s = pt.plate >= 0 ? game.slots[pt.plate] : null;
      if (!s || bandAt(pt.y) !== "counter") break;
      const ls = s.plate.layers;
      if (ls.length && ls[0].piece.kind === "dough" && (ls.length === 1 || !(AFTER_OVEN.has(ls[ls.length - 1].piece.kind)))) {
        // A flatbread only moves on the peel (what went on after the oven still peels off by hand).
        showHint("Flatbreads move on the peel: carry it up here, slide it under, and swipe up.", 2.5);
        pt.mode = "none";
        break;
      } else if (ls.length && ls[0].piece.folded) {
        // A quesadilla comes off whole, to go back on the comal or another tray.
        startHold(pt, { type: "stack", layers: ls.splice(0), fromPlate: pt.plate });
      } else if (ls.length && counter.middle === "press" && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind)) {
        // A sandwich with its lid on comes off whole, to go in the press or on the board.
        startHold(pt, { type: "stack", layers: ls.splice(0), fromPlate: pt.plate });
        if (ls.length === 0 && pt.held && (pt.held.payload as { layers: Layer[] }).layers.length > 1) hintOnce("panini-lift", "Drop the sandwich in an open bay and pull the handle down to press it.", 3.5);
      } else if (ls.length) {
        const top = ls.pop()!;
        startHold(pt, { type: "piece", piece: top.piece, fromGrill: null, fromPlate: pt.plate });
        hintOnce("peel", counter.middle === "press" ? "Peeled off the top layer. Drop it in the trash slot, in the press, or on another tray." : "Peeled off the top layer. Drop it in the trash slot, on the grill, or on another tray.", 3);
      } else if (s.plate.drink) {
        const d = s.plate.drink;
        s.plate.drink = null;
        startHold(pt, { type: "drink", flavor: d.flavor, fill: d.fill, size: d.size, ice: !!d.ice, lid: !!d.lid, from: null, fromPlate: pt.plate });
      } else if (s.plate.fries) {
        const f = s.plate.fries;
        s.plate.fries = null;
        startHold(pt, { type: "carton", size: f.size, cook: f.cook, fill: f.fill, pack: -1, salt: f.salt ?? 0, curds: !!f.curds, gravy: !!f.gravy, fry: fryOf(f), fromPlate: pt.plate });
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
          startHold(pt, { type: "fries", cook: b.cook, basket: pt.hit.idx, amount: b.amount, fry: b.fry });
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
    case "board": {
      const bd = counter.board!;
      if (!pt.moved || !bd.layers.length) break;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        // A swipe across the board cuts the sandwich in half.
        cutOnBoard();
        pt.mode = "none";
      } else if (counter.middle === "oven" && (Math.abs(dy) > 24 || bandAt(pt.y) !== "counter")) {
        showHint("Lift it with the peel: slide the blade under it and swipe up.", 2);
        pt.mode = "none";
      } else if (Math.abs(dy) > 24 || bandAt(pt.y) !== "counter") {
        const layers = bd.layers;
        counter.setBoard([]);
        startHold(pt, { type: "stack", layers, board: true });
      }
      break;
    }
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
    it.piece.folded = true;
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

/** Slice the sandwich on the cutting board in half (Harbor City). */
function cutOnBoard(): void {
  const bd = counter.board!;
  const ls = bd.layers;
  const base = ls[0]?.piece;
  if (base?.kind === "dough") {
    // Port Amber cuts its flatbreads in four: two swipes.
    if (base.folded) return void showHint("Calzones go out whole.", 1.5);
    if ((base.cuts ?? 0) >= 2) return void showHint("It's in four already.", 1.5);
    base.cuts = (base.cuts ?? 0) + 1;
    counter.updatePie(bd);
    sfx.flip();
    buzz(25);
    if (base.cuts === 1) hintOnce("cut-again", "Halves. Once more the other way for four.", 2.5);
    else hintOnce("cut-four-done", "In four. Drag it up to the tray.", 2.5);
    return;
  }
  const top = ls[ls.length - 1]?.piece;
  if (!top || !BREADS.has(top.kind) || ls.length < 2) {
    showHint("Only a closed panini gets cut.", 2);
    return;
  }
  if (top.cut) {
    showHint("It's already cut.", 1.5);
    return;
  }
  for (const l of ls) if (BREADS.has(l.piece.kind)) l.piece.cut = true;
  counter.setBoard([...ls]);
  sfx.flip();
  buzz(25);
  hintOnce("cut-done", "Cut in half. Drag it up to the tray.", 2.5);
}

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
    if (bd.layers.length && payload.type === "stack") return showHint("The board's taken.", 1.5), false;
    // One more piece on what's there, or a start on the empty board.
    counter.setBoard(bd.layers.length && payload.type === "piece" ? [...bd.layers, landing(bd.layers, payload.piece, 0.06)] : layers);
    sfx.plop();
    const ls = counter.board!.layers;
    if (ls.length > 1 && BREADS.has(ls[0].piece.kind) && BREADS.has(ls[ls.length - 1].piece.kind)) hintOnce("cut", "Swipe across the panini to cut it in half.", 3);
    return true;
  }
  const bi = counter.overBay(counter.groundPoint(ndc, PLATE.y + 0.1));
  if (bi < 0) return false;
  const b = counter.bays[bi];
  if (b.closed) return showHint("Lift the lid first: swipe the handle up.", 2), false;
  if (b.layers.length) {
    if (payload.type === "stack") return showHint("That bay is full. Use another one.", 1.8), false;
    // Building in the bay: the piece goes on top.
    counter.setBay(b, [...b.layers, landing(b.layers, payload.piece, 0.06)]);
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
// The oven (Orchard Isle; DESIGN §24, after build #69). Flatbreads are built on the peel as it
// lies at home (or on the bench), and only the peel moves them: drag it by its handle, slide the
// blade under a pie and swipe up to lift it, swipe down to set it down where the blade is (in
// the oven, on the bench or board, on a tray), and nudge a pie in the oven with the blade's edge
// to spin its pale side round to the hot back wall.

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

/** A tap at the oven: a base from the dough stack onto the peel (or the bench), or one piece from a pan onto the pie being built. */
function ovenTap(piece: Piece): void {
  if (piece.kind === "dough") {
    if (counter.peelHome && !counter.peel.layers.length) putBase(counter.peel, [{ piece, offX: 0, offZ: 0 }]);
    else if (!counter.rest.layers.length) putBase(counter.rest, [{ piece, offX: 0, offZ: 0 }]);
    else showHint("The peel and the bench are both taken: get a pie into the oven first.", 2.5);
    return;
  }
  const plate = game.slots[game.active].plate;
  if (AFTER_OVEN.has(piece.kind) && plate.layers[0]?.piece.kind === "dough") {
    addToPlate(game.active, { type: "piece", piece, fromGrill: null }, 0.04);
    sfx.plop();
    return;
  }
  const h = buildHolder();
  if (h) {
    addToPie(h, piece);
    return;
  }
  const any = counter.peel.layers.length || counter.rest.layers.length;
  showHint(AFTER_OVEN.has(piece.kind) ? `${KIND_LABEL[piece.kind]} goes on after the oven, with the flatbread on the tray.` : any ? "Toppings go on before the oven, on a base that's still raw." : "Lay a dough base on the peel first: tap the dough.", 2.5);
}

/** A fresh base onto the empty peel or bench. */
function putBase(h: PieHolder, layers: Layer[]): void {
  const d = layers[0].piece;
  if (d.forOrder === undefined) d.forOrder = game.slots[game.active]?.order?.id;
  h.layers = layers;
  syncHolder(h);
  sfx.plop();
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
  if (paleSide(d) > 0.2) return showHint("It's been baked. Toppings go on before the oven; basil, rocket and honey on the tray.", 2.5), false;
  ls.push({ piece, offX: 0, offZ: 0 });
  syncHolder(h);
  sfx.plop();
  const o = pieOrder(d);
  if (COUNTED.has(piece.kind)) {
    const n = ls.filter((l) => l.piece.kind === piece.kind).length;
    const want = o?.layers.find((e) => e.kind === piece.kind)?.count;
    if (want) showHint(`${KIND_LABEL[piece.kind]} ${n} of ${want}${n > want ? ": generous!" : ""}`, 1.2);
  }
  if (AFTER_OVEN.has(piece.kind) && o?.layers.find((e) => e.kind === piece.kind)?.after) hintOnce("after-oven", `${KIND_LABEL[piece.kind]} goes on after the oven, at the tray, or it wilts.`, 3);
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
  sfx.flip();
  buzz(15);
  hintOnce("calzone-in", "Folded! Into the oven with it on the peel. A calzone is thick: nudge it round twice.", 3.5);
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
  grabPeel(pt);
}
function grabPeel(pt: Pointer): void {
  pt.mode = "peel";
  peelJust = null;
  pt.flickT = -Infinity;
  counter.grabPeel(ndcIn(bands.counter, pt.x, pt.y));
  sfx.pop();
  const full = counter.peel.layers.length > 0;
  hintOnce(full ? "peel-launch" : "peel-scoop", full ? "Over a free spot in the oven, swipe down to slide the pie off." : "Slide the blade right under a pie and swipe up to lift it onto the peel.", 3.5);
}

/** The peel follows the finger; over the trays it shows over the tray it would serve to. A quick swipe up or down scoops or drops. */
function movePeel(pt: Pointer): void {
  const band = bandAt(pt.y);
  counter.movePeel(band === "counter" ? ndcIn(bands.counter, pt.x, pt.y) : null);
  const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : band === "customers" ? game.active : -1;
  showPeelGhost(slot);
  // Once the blade has left where it last scooped or set down, a swipe there counts again.
  const here = band === "counter" ? targetKey(counter.peelTarget()) : slot >= 0 ? `slot${slot}` : null;
  if (peelJust && here !== peelJust) peelJust = null;
  const f = flickOf(pt.samples, pt.flickT);
  if (f) {
    pt.flickT = pt.samples[pt.samples.length - 1].t + 1;
    peelFlick(pt, f);
  }
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

/** Where the peel last scooped a pie from, or set one down, until the blade leaves it: the swipe back the other way there is just the carry. */
let peelJust: string | null = null;
const targetKey = (t: PeelTarget | null): string | null => (t ? (t.kind === "spot" ? `spot${t.idx}` : t.kind) : null);

/** A swipe with the peel in hand: up to scoop the pie the blade is under, down to set its pie down there. */
function peelFlick(pt: Pointer, f: Flick): void {
  const fromBand = bandAt(f.from.y);
  const full = counter.peel.layers.length > 0;
  if (fromBand === "tray" || fromBand === "customers") {
    const slot = fromBand === "tray" ? trayView.pick(ndcIn(bands.tray, f.from.x, f.from.y)) : game.active;
    if (slot < 0) return;
    const plate = game.slots[slot].plate;
    if (peelJust === `slot${slot}`) return;
    if (f.dir === "down" && full) {
      const layers = counter.peel.layers;
      if (plate.layers.length) return void showHint("That tray already has food on it.", 1.8);
      if (paleSide(layers[0].piece) < 0.12) hintOnce("raw-pie", "That one hasn't been in the oven yet!", 2);
      if (!addToPlate(slot, { type: "stack", layers }, 0)) return;
      counter.setPeel([]);
      peelJust = `slot${slot}`;
      setActive(slot);
      sfx.plop();
      buzz(12);
      showPeelGhost(slot);
      const after = pieOrder(layers[0].piece)?.layers.some((l) => l.after);
      hintOnce("pie-served", after ? "On the tray. Basil, rocket and honey go on now, then tap Serve." : "On the tray. Tap Serve to hand it over.", 3);
    } else if (f.dir === "up" && !full && plate.layers[0]?.piece.kind === "dough") {
      counter.setPeel(plate.layers.splice(0));
      peelJust = `slot${slot}`;
      syncTray(slot, false);
      sfx.whoosh();
      showPeelGhost(slot);
    }
    return;
  }
  if (fromBand !== "counter") return;
  // The swipe acts where the peel was when it began.
  const from = ndcIn(bands.counter, f.from.x, f.from.y);
  const b = counter.bladeAt(from);
  const t = counter.peelTarget(b);
  if (targetKey(t) && targetKey(t) === peelJust) return;
  const act = (key: string | null) => {
    // The swipe doesn't carry the peel along: it stays where the swipe began.
    counter.anchorPeel(from, ndcIn(bands.counter, pt.x, pt.y));
    peelJust = key;
  };
  if (f.dir === "up") {
    if (full) return;
    if (t?.kind === "spot" && counter.ovenSpots[t.idx].layers.length) {
      const layers = counter.ovenSpots[t.idx].layers;
      act(targetKey(t));
      counter.setSpot(t.idx, []);
      counter.setPeel(layers);
      sfx.whoosh();
      buzz(12);
      hintOnce("oven-out", counter.board?.on && !layers[0].piece.folded ? "Out it comes. Set it on the board to cut it in four (swipe down over it), then up to a tray." : "Out it comes. Carry it up to a tray and swipe down. Basil, rocket and honey go on there.", 3.5);
    } else if (t?.kind === "rest" && counter.rest.layers.length) {
      act("rest");
      counter.setPeel(counter.rest.layers);
      counter.setRest([]);
      sfx.whoosh();
      buzz(12);
    } else if (b.z < 0.2) hintOnce("scoop-under", "Slide the blade right under a pie, then swipe up to lift it.", 2.5);
    return;
  }
  if (!full) return;
  const layers = counter.peel.layers;
  const d = layers[0].piece;
  if (t?.kind === "trash") {
    act("trash");
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
    sfx.plop();
    if (counter.rest === counter.board && !d.folded && paleSide(d) > 0.2) hintOnce("cut-four", "Swipe across the flatbread to cut it, and again the other way for four.", 3.5);
    return;
  }
  let si = t?.kind === "spot" ? t.idx : -1;
  if (si >= 0 && counter.ovenSpots[si].layers.length) {
    const near = counter.nearFreeSpot(b);
    if (near < 0) return void showHint(counter.ovenSpots.slice(0, counter.ovenCount).every((s) => s.layers.length) ? "The oven's full." : "That spot's taken.", 1.5);
    si = near;
  }
  if (si < 0) si = counter.nearFreeSpot(b);
  if (si < 0) {
    if (b.z < 0.4) showHint("Swipe down over a free spot in the oven, the bench or a tray.", 2);
    return;
  }
  act(`spot${si}`);
  counter.setSpot(si, layers);
  counter.setPeel([]);
  sfx.sizzleHit();
  buzz(10);
  if (d.folded) hintOnce("oven-calzone", "A calzone bakes slower and catches quicker: nudge it round about a third of the way, and again later.", 4);
  else hintOnce("oven-turn", "In it goes. The half facing the hot back wall bakes twice as fast: about halfway, set the peel's tip against the front of the pie and slide it sideways to spin it round.", 4.5);
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
  showHint(!ls.length ? "Drag the peel by its handle. Slide it under a pie and swipe up to lift it; tap the dough for a new base." : raw && !ls[0].piece.folded ? "Sauce it and add the toppings, then drag the peel into the oven and swipe down." : "Drag the peel by its handle and swipe down where the pie should go.", 2.6);
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
let ladle: { kind: SauceKind; obj: THREE.Object3D; last: number; holder: PieHolder | null } | null = null;
function startLadle(pt: Pointer, kind: SauceKind): void {
  const h = buildHolder();
  if (!h) {
    const any = counter.peel.layers.length || counter.rest.layers.length;
    showHint(any ? "Sauce goes on a raw base, before the oven." : "Lay a dough base on the peel first: tap the dough.", 2);
    buzz(10);
    return;
  }
  pt.mode = "ladle";
  pt.ladle = kind;
  if (kind === "oil") counter.liftSauce("oil");
  const obj = kind === "redsauce" ? makeSauceLadle() : counter.sauceBottle(kind);
  counter.setHeld(obj);
  ladle = { kind, obj, last: 0, holder: null };
  paintLadle(pt);
  sfx.pop();
  if (kind === "redsauce") hintOnce("ladle", "Spread it in a spiral from the middle out, to just inside the crust. Watch the bar on the left.", 3.5);
  else hintOnce("oil", "Drizzle it over the base, then add the toppings.", 3);
}
function paintLadle(pt: Pointer): void {
  const l = ladle;
  if (!l) return;
  const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y - NOZZLE_UP), PEEL_Y + 0.12);
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
  const last = st[st.length - 1];
  if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 0.05) {
    st.push(q);
    const now = performance.now();
    if (now - lastSquirt > 90) {
      sfx.squirt();
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
  if (!cancelled && !pt.moved) showHint(l.kind === "redsauce" ? "Hold the ladle and spread the sauce over the base." : "Hold the bottle and drizzle it over the base.", 2.5);
  else if (st && l.kind === "redsauce" && sauceCoverage(st, sauceRadius("redsauce")) < LADLE_BAND.lo) hintOnce("ladle-more", "A bit more sauce: right out to the crust.", 2);
  sfx.pop();
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
    case "board":
      if (!cancelled && !pt.moved) {
        const pie = counter.middle === "oven";
        showHint(counter.board?.layers.length ? (pie ? "Swipe across it to cut it: twice for four." : "Swipe across it to cut it, or drag it up to the tray.") : pie ? "Put a flatbread here after the oven to cut it in four." : "Put a panini here to cut it in half.", 2);
      }
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
        showHint(s.layers.length ? "Pies move on the peel: drag it by the handle, slide the blade under, and swipe up to lift." : pt.mode === "spot" ? "Carry a pie in on the peel and swipe down to slide it off." : "Set a pie down here off the peel: swipe down over the bench.", 2.6);
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
  t.addEventListener("click", () => {
    if (swiped) return void (swiped = false);
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
      else if (menuFor(stop(), [...save.hidden, v]).some((r) => r.name === v)) showHint("Keep at least two recipes on the menu.", 2);
      else save.hidden = [...save.hidden, v];
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
    case "buy-bonus":
      if (buyBonus(save, btn!.dataset.v as BonusId)) {
        writeSave(save);
        sfx.coin();
        showClosing();
      }
      break;
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
    case "closing-box":
      toggleBox(btn!.dataset.v!);
      showClosing();
      break;
    case "open":
      startShift();
      break;
    case "evening":
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
  replayTutorial: () => {
    save.tutorialDone = false;
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
    tutorial: !save.tutorialDone,
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
  game.shiftLength = shiftSeconds(game.shift, stop().shiftLength);
  game.customers = expectedCustomers({ stop: stop(), popularity: save.popularity, rating: ratingPull(save.reviewCounts), hidden: save.hidden, shift: game.shift, bonus: game.bonus, pacing: game.pacing });
  // A shift starts a fresh block of driving: the evening's hops count against the whole range.
  save.driven = 0;
  writeSave(save);
  ui.bell.hidden = false;
  applyStop();
  // Maybe a critic in today's line, never the very first customer.
  game.criticAt = has("press") || game.rng() < criticChance(stop().crowd, game.event) ? 1 + Math.floor(game.rng() * Math.max(1, Math.min(game.customers, 8) - 2)) : -1;
  counter.fryBoost = has("turbo") ? 1.35 : 1;
  // Hot plate (the old Searing plate): the main counter cooks faster, whatever it is.
  counter.grillBoost = has("sear") ? 1.25 : 1;
  // Chill pours to the line by itself and nothing on the grill or in the fryer burns.
  counter.autoStopPour = has("autostop") || game.pacing === "chill";
  counter.noBurn = game.pacing === "chill";
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
  // The coast's middle counter is the panini press; everywhere else, the grill.
  const middle = middleOf(st);
  counter.setMiddle(middle, st.press?.bays ?? 2, !!st.press?.slice || !!st.oven?.board, !!st.comal?.tpress, st.oven?.spots ?? 2);
  counter.setFryerSides(st.poutine !== false && middle !== "press", fryerOf(st));
  setTabArt(ui.tabs[HOME_PAGE], middle === "press" ? "Press" : middle === "comal" ? "Comal" : middle === "oven" ? "Oven" : "Grill");
  counter.setPantry(st.pantry);
  // The fountain pours the area's two local drinks beside the three house ones.
  const drinks = fountainFor(st.region);
  counter.setDrinks(drinks);
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
  // Redrawing Prep (a dish switched, the window moved) keeps the page where it was.
  const keep = prepOpen ? (ui.summary.querySelector<HTMLElement>(".prep .day-scroll")?.scrollTop ?? 0) : 0;
  prepOpen = true;
  ui.summary.innerHTML = prepHtml({ save, stop: stop(), pacing: difficulty });
  ui.summary.classList.add("prep-host");
  const sc = ui.summary.querySelector<HTMLElement>(".prep .day-scroll");
  const card = ui.summary.querySelector<HTMLElement>(".prep");
  if (sc && card) {
    sc.scrollTop = keep;
    scrollShadows(card, sc);
    sc.addEventListener("scroll", () => scrollShadows(card, sc), { passive: true });
  }
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

function showClosing(): void {
  if (!save.last) {
    showTitle();
    return;
  }
  showOverlay("closing", closingHtml(save.last, save));
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
  const last = save.last && save.last.town === save.town ? save.last : null;
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
function showTitle(night: NightShow | null = null): void {
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
    focus: game.mapSel,
    night,
    startShift: () => {
      showPrep();
      screenShownAt = performance.now();
    },
    openResults: () => showClosing(),
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
  if (game.pendingUpdate) reloadTo(game.pendingUpdate.build);
}

function endShift(): void {
  cancelPointer();
  dropBack("shift");
  game.phase = "summary";
  // The shift fills the day; the evening follows, and only sleeping turns the day (see game/day.ts).
  save.time = "evening";
  save.driven = 0;
  const popBefore = save.popularity;
  // Popularity: yesterday's fades a touch, then word of mouth and the press move it.
  // The guest book doubles the good word; apology cookies keep walk-outs from costing any.
  const word = wordOfMouth(game.stars, has("cookies") ? 0 : game.lost, has("cookies") ? 0 : game.leftLine);
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
  save.best[here.id] = Math.max(save.best[here.id] ?? 0, avg);
  // The takings go into savings, for the Garage.
  save.bank += takings;
  // A great shift unlocks this town's bonus, for sale in the Garage from now on.
  const great = !game.tutorial && greatShift(game.stars, game.served, game.served + game.lost);
  let unlocked: BonusId | null = null;
  const tb = townBonus(here.id);
  if (great && tb && !save.found.includes(tb.id)) {
    unlocked = tb.id;
    save.found.push(tb.id);
  }
  if (ok) {
    const firstTime = !save.passedTowns.includes(here.id);
    lastStop = passTown(save, here.id) && firstTime;
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
  showClosing();
  sfx.chime();
  if (unlocked) setTimeout(() => sfx.coin(), 400);
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
    // If nobody's about, don't make the player wait for the next arrival.
    if (!game.slots.some((s) => s.order) && !game.line.length && game.nextSpawn > game.time + 2 && !guiding) game.nextSpawn = game.time + 2;

    // The line: patience drains slowest at the front, where they're nearly there.
    for (let k = game.line.length - 1; k >= 0; k--) {
      const w = game.line[k];
      w.patience -= dt * lineDrain(k);
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

    // Cooked food waiting on a tray slowly goes cold and dry (the warm grill zone is the place to hold it).
    for (const s of game.slots)
      for (const l of s.plate.layers) if ((GRILLABLE.has(l.piece.kind) || BREADS.has(l.piece.kind) || PROTEINS.has(l.piece.kind) || l.piece.kind === "dough") && Math.max(...l.piece.cook) > 0.15) l.piece.held = (l.piece.held ?? 0) + dt * (has("lamp") ? 0.5 : 1);

    if (counter.middle === "oven") {
      const o = game.slots[game.active]?.order;
      if (o?.layers[0]?.folded) hintOnce("calzone-order", "A calzone: build it on the peel, then drag the dough's edge across the middle to fold it. Nudge it round twice in the oven.", 4.5);
      else if (o?.slice) hintOnce("slice-pie", "Port Amber cuts its flatbreads in four: after the oven, set it on the board with the peel and swipe across it twice.", 4.5);
      else if (o?.layers.some((l) => l.after)) hintOnce("after-order", "Basil, rocket and honey go on after the oven, once the flatbread is on the tray.", 4);
    } else if (counter.middle === "press") {
      const o = game.slots[game.active]?.order;
      if (o?.layers.some((l) => l.kind === "chicken" || l.kind === "veggie")) hintOnce("press-first", "The patty in this one goes in the press on its own first. Then build the sandwich and press it again.", 4.5);
      else if (o?.slice) hintOnce("slice-order", "Harbor City cuts its paninis: after pressing, put it on the board and swipe across it.", 4.5);
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
    if (doneSpawning && !game.line.length && game.slots.every((s) => !s.order && !s.fig)) endShift();
  }

  if (game.phase === "playing" || game.phase === "title" || game.phase === "summary") {
    counter.update(game.phase === "playing" ? dt : 0);
    trayView.update(dt);
    customersView.update(dt, game.active);
  }
  sfx.setLoops(game.phase === "playing" ? counter.sizzleLevel() : 0, game.phase === "playing" ? counter.bubbleLevel() : 0, counter.pouring());
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
  else if (counter.middle === "oven") hintOnce("burning-oven", "That pie's catching on the hot side! Nudge it round with the peel, or lift it out.", 3);
  else hintOnce("burning", counter.middle === "press" ? "Smoke means burning! Lift the lid and get it out." : "Smoke means burning! Drag it to the trash can.", 2.5);
};
// The peel nudging a pie in the oven round: a soft scrape as it goes, a flip sound once the other half faces the heat.
counter.events.nudge = () => sfx.whoosh();
counter.events.turned = (i) => {
  sfx.flip();
  buzz(12);
  const d = counter.ovenSpots[i]?.layers[0]?.piece;
  if (d?.folded) hintOnce("turn-calzone", (d.turns ?? 0) >= 2 ? "Turned twice: that calzone will bake through." : "Turned. A calzone is thick: nudge it round again later so the far side catches up.", 3);
  else hintOnce("turn-done", "Turned! The other half faces the hot wall now. Once is right for a flatbread.", 3);
};

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
  const tText = left > 0 ? clockLabel(clockAt(game.time, game.shift, len)) : "Closing";
  if (tText !== lastTimerText) {
    ui.timer.textContent = tText;
    ui.timer.classList.toggle("closing", left <= 0);
    ui.timer.parentElement!.classList.toggle("closing", left <= 0);
    lastTimerText = tText;
  }
  const pct = `${(shiftProgress(game.time, len) * 100).toFixed(1)}%`;
  if (ui.clockFill.style.width !== pct) ui.clockFill.style.width = pct;
  const net = Math.round(game.money + game.tips - spills() - game.comped);
  const money = net < 0 ? `−$${-net}` : `$${net}`;
  if (ui.money.textContent !== money) ui.money.textContent = money;

  ui.rail.hidden = game.phase === "title";
  ui.bell.hidden = game.phase === "title" || game.phase === "summary";
  const inLine = String(game.line.length);
  if (ui.bellCount.textContent !== inLine) ui.bellCount.textContent = inLine;
  const bellLabel = "Next";
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
    const plate = pieShown ? { ...s.plate, layers: pieShown } : s.plate;
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
      t.dataset.fit = "1";
    } else {
      // Patience runs on between redraws: just move the bar and the face's mood.
      const bar = t.querySelector<HTMLElement>(".bar > i");
      if (bar) bar.style.width = `${(Math.max(0, Math.min(1, shownPct)) * 100).toFixed(0)}%`;
      const mood = patienceMood(shownPct);
      const pat = t.querySelector<HTMLElement>(".pat");
      if (pat && !pat.classList.contains(mood)) t.dataset.fit = "";
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
  });
  updateSauce(dt);
  updateEgg(dt);

  placeNav();
  updateGrillTags();
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
  const ovenBurning = pies.some((d) => Math.max(...d.cook) > COOK_SCALE.dough.over + 0.05 || fireLead(d) > ovenLead(d));
  const dots = [false, grillBurning || ovenBurning || ovenReady, friesReady || friesBurning];
  const hot = [false, grillBurning || ovenBurning, friesBurning];
  ui.tabs.forEach((t, i) => {
    const lamp = hot[i] ? "coral" : dots[i] ? "amber" : "off";
    if (t.dataset.lamp !== lamp) t.dataset.lamp = lamp;
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
  const meter = k in COOK_SCALE ? cookMeter(k as Cookable, cookLevel(it.piece)) : "";
  const n = counter.stackSize(it);
  // A quesadilla's cheese: melting, then melted.
  const jack = it.piece.fill?.find((f) => f.kind === "jack");
  const melt = jack ? `<b class="mlt${isMelted(jack) ? " on" : ""}">${isMelted(jack) ? "Melted" : "Melting"}</b>` : "";
  return `${meter}${melt}${n > 1 ? `<b class="sc">×${n}</b>` : ""}`;
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
}

function updateStaleUi(): void {
  const playing = game.phase === "playing";
  game.slots.forEach((s, i) => {
    const el = holdTags[i];
    const held = Math.max(0, ...s.plate.layers.map((l) => l.piece.held ?? 0));
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
      spots.push({ at: counter.fryTagPoint(i), html: `${friesMeter(b.cook, b.fry)}<span class="scoops" aria-label="${scoops} of 3 scoops">${pips}</span>` });
    }
    for (const p of counter.packs) {
      if (!p.size || p.fill <= 0) continue;
      const red = counter.redRock;
      const tops = [p.salt && (SUGARED.has(p.fry) ? "Sugar" : "Salt"), p.curds && (red ? "Jalapeños" : "Curds"), p.gravy && (red ? "Queso" : "Gravy")].filter(Boolean).map((t) => `<em>${t}</em>`).join("");
      spots.push({ at: new THREE.Vector3(p.x, 0.2, p.z + 0.5), html: `${friesMeter(p.cook, p.fry)}${tops ? `<span class="tops">${tops}</span>` : ""}` });
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

/** A meter in front of each pie in the oven: its paler side's bake, and when to nudge it round. */
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
    if (el.hidden || !d) return;
    const lead = fireLead(d) / ovenLead(d);
    const turns = d.turns ?? 0;
    // The chip says when to nudge it round: soon, now (the hot side is running away), or that it's been turned.
    const chip = lead > 1 ? `<em class="turn hot">↻ Nudge!</em>` : lead > 0.6 ? `<em class="turn">↻ Nudge</em>` : turns ? `<em class="turn on">Turned${turns > 1 ? ` ×${turns}` : ""}</em>` : "";
    const html = `${cookMeter("dough", paleSide(d))}${chip}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    const v = counter.spotTagPoint(i).project(counter.camera);
    el.style.left = `${((v.x + 1) / 2) * bands.counter.w}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
}

function updateGrillTags(): void {
  updatePressTags();
  updateOvenTags();
  // One tag per stack, under its top item.
  const items = game.phase === "playing" ? counter.grillItems.filter((g) => !counter.above(g)) : [];
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
    const v = it.obj.position.clone().setY(GRILL_TOP).add(new THREE.Vector3(0, 0.2, Math.min(0.36, counter.grillTagZ - it.z))).project(counter.camera);
    const x = ((v.x + 1) / 2) * bands.counter.w;
    el.hidden = x < 0 || x > bands.counter.w || it.flipT >= 0;
    if (el.hidden) return;
    const html = itemTag(it);
    if (el.innerHTML !== html) el.innerHTML = html;
    const heat = counter.heatOf(it);
    el.classList.toggle("warm", heat === "warm");
    el.classList.toggle("off", heat === "off");
    el.style.left = `${x}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
  });
}

const clearColor = new THREE.Color("#2a3340");
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
  if (sauceZoom.visible) {
    const r = sauceZoom.rect;
    draw({ x: colX + r.x, y: r.y, w: r.w, h: r.h }, trayView.scene, sauceZoom.camera);
  }
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
      bell: ui.bell,
      tabs: ui.tabs,
      sauce: () => (sauceDrag ? { locked: sauceDrag.locked } : null),
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
  gesture: () => lastGesture,
  /** Screen point (CSS px) of the fully zoomed sauce view's middle, and its side. */
  sauceCentre: () => {
    const f = sauceFinal();
    return [colX + f.x + f.w / 2, f.y + f.h / 2, f.w];
  },
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
  /** The press, for the playtest bot: where each bay's plate and handle are, and what's in them. */
  press: () => ({
    middle: counter.middle,
    bays: counter.bays.slice(0, counter.bayCount).map((b, i) => ({ closed: b.closed, open: b.open, layers: b.layers.map((l) => ({ kind: l.piece.kind, cook: cookLevel(l.piece), melt: l.piece.melt ?? 0, cut: !!l.piece.cut })), plate: counter.bayPoint(i).toArray(), handle: counter.handlePoint(i).toArray() })),
    board: counter.board?.on ? { at: counter.boardPoint().toArray(), layers: counter.board.layers.map((l) => l.piece.kind) } : null,
    fryBins: Object.fromEntries(Object.entries(counter.fryBinAt).map(([k, v]) => [k, v!.toArray()])),
  }),
  /** The oven, for the playtest bot: the peel, each spot and the board, and where the dough, pot and bottles are. */
  oven: () => {
    const pie = (ls: Layer[]) => ls.map((l) => ({ kind: l.piece.kind, cook: [...l.piece.cook], melt: l.piece.melt ?? 0, turns: l.piece.turns ?? 0, scorch: l.piece.scorch ?? 0, folded: !!l.piece.folded, cuts: l.piece.cuts ?? 0, stroke: l.piece.stroke?.length ?? 0 }));
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
    zonePoints: [0, 1, 2].map((i) => counter.zonePoint(i).toArray()),
    baskets: counter.baskets.map((b, i) => ({ loaded: b.loaded, down: b.down, fry: b.fry, cook: b.cook, shell: b.shell ? cookLevel(b.shell) : null, at: counter.fryTagPoint(i).toArray() })),
    packs: counter.packs.map((p) => ({ size: p.size, fill: p.fill, fry: p.fry, at: [p.x, p.y, p.z] })),
  }),
  save,
  showTitle,
  coach: coachState,
  menu: { openMenu, openHowTo, openMenuRef, closeAll },
  manual: (on: boolean) => {
    manualClock = on;
  },
};

