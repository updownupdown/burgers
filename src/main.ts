import * as THREE from "three";
import { buzz, Sfx } from "./audio";
import { avgCook, bunToast, DRINK_FILL, FRIES_PERFECT, friesZone, FRIES_ZONE, pattyLabel, SALT } from "./game/cooking";
import { makeOrder, orderFromRecipe, seededRng, type Rng } from "./game/menu";
import { gearBlocker, gearById, projectShift, sleep, solarSaving, RUNNING_COST, type GearId } from "./game/day";
import { freshSave, loadSave, passed, passTown, upgradeChoices, UPGRADES, writeSave, type Closing, type UpgradeId } from "./game/progress";
import { eventOn, townById, withEvent, type TownEvent } from "./game/stops";
import { criticChance, fadePopularity, pieceFor, popularityTraffic, willingnessToPay, type PressPiece } from "./game/press";
import { DIFFICULTY, verdict, type Difficulty } from "./game/difficulty";
import { ADS, joinChance, lineDrain, linePatience, todayPopularity, WINDOW, wordOfMouth, type AdLevel } from "./game/line";
import { HOLD_GRACE, HOLD_RUIN, payout, SAUCE_BAND, sauceCoverage, sauceVerdict, scorePlate, starsFor, type SauceWord } from "./game/scoring";
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
import type { Dessert, DrinkId, FriesSize, Layer, Order, Piece, Plate, SauceKind, Size } from "./game/types";
import { COUNTED, DRINK_LABEL, FLAVOR_COLOR, FLAVOR_LABEL, FRIES_PORTION, FRIES_SCOOP, GRILLABLE, KIND_LABEL, newPiece, SIZE_LABEL } from "./game/types";
import { BLEND, DESSERT_PATIENCE, flavorsFor, MELT, meltLevel, SHAKE_SWIRL, SWIRL } from "./game/dessert";
import type { VesselState } from "./render/dessert";
import { SCALE } from "./render/units";
import { dressCup } from "./render/cup";
import { makeCarton, makeCup, makeFood, makeFries, sliceSpot, stackBases } from "./render/food";
import { disposeObject } from "./render/materials";
import { CounterView, CUP_IN_HAND, EMPTY_PACK, STOPS, GRILL_SCALE, HOME_PAGE, PAGES, GRILL_TOP, SLEEVE, ZONE_START, type GrillItem, type Hit } from "./scenes/counter";
import { CONE_COST, SOFT_COST } from "./game/business";
import { CustomersView, type CustomerFigure } from "./scenes/customers";
import { TrayView } from "./scenes/tray";
import { SauceZoom } from "./scenes/saucezoom";
import "./ui/components.css";
import "./style.css";
import { mountHome, refreshHome } from "./screens/home";
import { closeBoxes, closingHtml, nightHtml, prepHtml, reviewsHtml, suppliesHtml, toggleBox, type ReviewFilter } from "./screens/day";
import { buildUi, donenessPill, patienceMood, ticketHtml } from "./ui";
import { DRINK_TINT } from "./render/machines";
import { buildLabel, registerServiceWorker, reloadTo, startUpdateChecks, type VersionInfo } from "./update";
import { closeAll, initMenu, openHowTo, openMenu, openMenuRef, openSettings } from "./screens/menu";
import { dropBack, pushBack } from "./screens/nav";
import { complexityOf, setComplexity } from "./game/complexity";

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
  /** The order came back once, with this complaint; next time they take it unless it's really wrong. */
  sentBack: string | null;
  /** Free sides they kept when they sent the order back: a customer never turns down free food. */
  kept: Pick<Plate, "fries" | "drink" | "dessert">;
}

const emptyPlate = (): Plate => ({ layers: [], fries: null, drink: null, dessert: null });

/** Someone waiting in line, not yet at the window. Their look is fixed by `seed` so they keep it when called up. */
interface Waiting {
  seed: number;
  patience: number;
  maxPatience: number;
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
  town: save.town,
  /** Town highlighted on the map. */
  mapSel: save.town,
  /** Event on in this town today, during a shift. */
  event: null as TownEvent | null,
  rng: seededRng(Date.now() % 100000) as Rng,
  slots: [0, 1, 2].map(
    (): Slot => ({ order: null, plate: emptyPlate(), patience: 0, maxPatience: 1, leaving: false, fig: null, ticketKey: "", bubble: null, sentBack: null, kept: { fries: null, drink: null, dessert: null } }),
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
  /** Spent on social media today. */
  adCost: 0,
  /** Business mode: today's plan, ingredient spend and the reviews written so far. */
  plan: null as Plan | null,
  costs: 0,
  reviews: [] as Review[],
  /** Every rating this shift, walk-outs as zero, for reputation. */
  ratings: [] as number[],
  /** Which customer (by arrival order) is a food critic today, or -1; and what they wrote. */
  criticAt: -1,
  press: null as PressPiece | null,
  /** What Prep projected for today's net, shown again on the Closing screen. */
  projected: null as [number, number] | null,
  /** Which screen is up over the map, so its buttons redraw the right one. */
  overlay: null as null | "closing" | "night" | "reviews" | "supplies",
  reviewFilter: "all" as ReviewFilter,
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

/** How well known the truck is today: fame plus whatever buzz was bought (see ADS). */
const todayPop = () => todayPopularity(save.popularity, save.ads);

function plannedCustomers(plan: Plan): number {
  return Math.max(4, Math.round(stop().customers * trafficMult(plan, save.rep, menuOf(stop(), plan).length, stop().crowd) * popularityTraffic(todayPop())));
}

/** Customers expected without a business plan: the town's trade, scaled by crowd and fame. */
function expectedCustomers(): number {
  return Math.max(3, Math.round(stop().customers * CROWD[stop().crowd].traffic * popularityTraffic(todayPop())));
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

function spawnCustomer(slotIdx: number, seed: number): void {
  const s = game.slots[slotIdx];
  const level = game.time / stop().shiftLength;
  let order = makeOrder(game.orderSeq++, game.rng, level, shopStop());
  if (game.plan) order.price = Math.round(order.price * PRICE[game.plan.price].mult);
  // The very first order of the trip is the simplest burger, with no sides.
  if (game.tutorial && game.ordered === 0) order = orderFromRecipe(order.id, stop().menu[0], "medium", false, null);
  s.order = order;
  s.plate = emptyPlate();
  s.sentBack = null;
  s.kept = { fries: null, drink: null, dessert: null };
  // Recipes you haven't made a couple of times yet start with the full layer list showing.
  // Every extra slice of a counted topping is another trip to the bin.
  const slices = order.layers.reduce((n, l) => n + Math.max(0, (l.count ?? 1) - 1), 0);
  s.maxPatience = (50 + order.layers.length * 7 + slices * 2 + order.layers.filter((l) => l.kind === "patty").length * 22 + (order.fries ? 30 : 0) + (order.poutine ? 10 : 0) + (order.drink ? 9 : 0) + (order.dessert ? DESSERT_PATIENCE[order.dessert.kind] : 0)) * (has("bench") ? 1.25 : 1) * CROWD[stop().crowd].patience * DIFFICULTY[difficulty].patience;
  if (game.tutorial && game.ordered === 0) s.maxPatience = 600;
  s.patience = s.maxPatience;
  s.leaving = false;
  if (game.ordered === game.criticAt && !game.tutorial) {
    order.critic = true;
    showHint("A food critic just ordered. Their verdict goes in the papers!", 3.5);
  }
  s.fig = customersView.arrive(slotIdx, seed);
  game.ordered++;
  if (order.dessert && !order.layers.length) hintOnce("dessert-order", `A ${order.dessert.kind} from the Cold bar: the tab on the right. Stand a ${order.dessert.kind === "cone" ? "cone" : "tin"} under a nozzle, pull the handle and circle your finger round it.`, 5);
  sfx.pop();
  if (!game.slots[game.active].order) setActive(slotIdx);
  syncTray(slotIdx, false);
}

/** Two taps on the bell within this many seconds call the next person up. */
const BELL_WINDOW = 1.4;

/** The first in line steps up to a free place at the window, if the difficulty allows another. */
function callNext(): boolean {
  const free = game.slots.findIndex((s) => !s.order && !s.fig);
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  if (free < 0 || !game.line.length || atWindow >= WINDOW[difficulty]) return false;
  const w = game.line.shift()!;
  spawnCustomer(free, w.seed);
  return true;
}

/** A tap on the bell: the first arms it, the second (soon after) calls the next person in line. */
function ringBell(): void {
  if (game.phase !== "playing") return;
  const atWindow = game.slots.filter((s) => s.order || s.fig).length;
  ui.bell.classList.remove("ring");
  void ui.bell.offsetWidth;
  ui.bell.classList.add("ring");
  if (!game.line.length) {
    sfx.ding();
    hintOnce("bell-empty", "Nobody in line right now. The bell calls up the next person when there is one.", 3);
    return;
  }
  if (atWindow >= WINDOW[difficulty]) {
    sfx.ding();
    hintOnce("bell-full", `No room at the window: ${WINDOW[difficulty]} at a time on ${DIFFICULTY[difficulty].label}. Serve someone first.`, 3.5);
    return;
  }
  if (game.bellTaps === 0 || game.time - game.bellAt > BELL_WINDOW) {
    game.bellTaps = 1;
    game.bellAt = game.time;
    sfx.ding();
    return;
  }
  game.bellTaps = 0;
  sfx.ding();
  if (callNext()) hintOnce("bell-called", "Next! More people at the window means more money, if you can keep up.", 3.5);
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
    showHint("No one's waiting for that tray yet.", 1.5);
    return;
  }
  if (s.plate.layers.length === 0 && !s.plate.fries && !s.plate.drink && !s.plate.dessert) {
    showHint("That tray is empty!", 1.5);
    return;
  }
  // Freebies kept from an earlier send-back count towards this verdict too.
  const plate: Plate = { ...s.plate, fries: s.plate.fries ?? s.kept.fries, drink: s.plate.drink ?? s.kept.drink, dessert: s.plate.dessert ?? s.kept.dessert };
  const r = scorePlate(s.order, plate);
  if (game.plan) {
    // Ingredient quality and prices tilt every rating.
    r.score = Math.max(0, Math.min(100, r.score + ratingBonus(game.plan, stop().crowd, willingnessToPay(save.popularity, save.rep))));
    r.stars = starsFor(r.score);
  }
  const call = game.tutorial ? "accept" : verdict(r.score, difficulty, !!s.sentBack, r.faulty, !!r.missing);
  if (call === "sendBack") return sendBack(i, r.missing ?? r.notes[0] ?? "this isn't quite right");
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
  if (s.plate.dessert && !o.dessert) {
    s.kept.dessert = s.plate.dessert;
    s.plate.dessert = null;
    took = took ? "extras" : s.kept.dessert.kind === "cone" ? "ice cream" : "shake";
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
  hintOnce("sent-back", "Sent back: fix the tray and swipe it up again. Drag down off the tray to take the top layer off.", 4);
}

/** Really wrong: they won't take it and leave without paying (but keep any freebies). */
function refuse(i: number, note: string, perk: boolean): void {
  const s = game.slots[i];
  const took = takeFreebies(s) ?? (s.kept.fries || s.kept.drink || s.kept.dessert ? "freebie" : null);
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
  const s = game.slots[i];
  // A plate on the tray means a burger is expected; drinks-only and fries-only orders get a bare tray.
  trayView.plates[i].setDish(!!s.order && s.order.layers.length > 0);
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

function tutorialHint(): string | null {
  if (!game.tutorial || game.phase !== "playing") return null;
  const s = game.slots.find((sl) => sl.order);
  if (!s) return null;
  const layers = s.plate.layers;
  const pattyOnGrill = counter.grillItems.find((g) => g.piece.kind === "patty");
  if (counter.page !== HOME_PAGE) return "Tap the grill tab below to go back.";
  if (layers.length === 0) return "Drag a bun up onto the plate on the tray.";
  const hasPatty = layers.some((l) => l.piece.kind === "patty");
  if (!hasPatty) {
    if (!pattyOnGrill) return "Now drag a patty onto a hot part of the grill.";
    const p = pattyOnGrill.piece;
    if (p.cook[0] < 0.5 && p.cook[1] < 0.3) return "Let it sizzle until the bottom browns…";
    if (p.cook[1] < 0.45) return "Swipe up on the patty to flip it!";
    if (p.cook[0] < 0.47) return "Nearly there. Cook the other side too.";
    return "Medium! Drag the patty up onto the bun.";
  }
  if (layers[layers.length - 1].piece.kind !== "bun" || layers.length < 3) return "Add the top bun.";
  return "Swipe the tray up to hand it to the customer!";
}

// ---------------------------------------------------------------------------
// Input

type Payload =
  | { type: "piece"; piece: Piece; fromGrill: { x: number; z: number } | null; fromPlate?: number }
  | { type: "stack"; layers: Layer[]; grill?: { x: number; z: number } }
  | { type: "fries"; cook: number; basket: number | null; amount: number }
  | { type: "carton"; size: FriesSize; cook: number; fill: number; pack: number; salt: number; curds: boolean; gravy: boolean; fromPlate?: number }
  | { type: "salt" }
  | { type: "curds" }
  | { type: "gravy" }
  | { type: "drink"; flavor: DrinkId | null; fill: number; size: Size; ice: boolean; lid: boolean; straw: boolean; from: { x: number; z: number } | null; fromPlate?: number }
  | { type: "ice" }
  | { type: "lid"; size: Size }
  | { type: "straw" }
  | { type: "empty"; kind: "cup" | "carton"; size: Size; stack: number }
  /** A cone, a shake tin or a shake from the Cold bar: from a nozzle spot, the mixer, the stacks (null) or a tray. */
  | { type: "vessel"; s: VesselState; from: { spot: number } | "mixer" | null; fromPlate?: number };

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
  mode: "none" | "swipe" | "held" | "grill" | "basket" | "pour" | "sauce" | "plate" | "wipe" | "swirl" | "blend";
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
  const { bases, yaw, back } = stackBases(layers.map((l) => l.piece));
  layers.forEach((l, i) => {
    const o = makeFood(l.piece, i === 0 ? "bottom" : "top");
    o.position.set(l.offX, bases[i], l.offZ - back[i]);
    o.rotation.y = yaw[i];
    g.add(o);
  });
  g.scale.setScalar(SCALE.burger);
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
    f.scale.setScalar(SCALE.fries);
    return f;
  }
  if (p.type === "salt" || p.type === "curds" || p.type === "gravy") return counter.fryTopMesh(p.type);
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
  if (p.type === "vessel") return counter.vesselMesh(p.s);
  if (p.type === "lid") return counter.extraMesh("lid", p.size);
  if (p.type === "ice" || p.type === "straw") return counter.extraMesh(p.type);
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
    } else if (s.order) {
      const exp = s.order.layers[s.plate.layers.length - 1];
      if (exp && exp.kind === "patty" && p.kind === "patty") showHint(`Patty: ${pattyLabel((p.cook[0] + p.cook[1]) / 2)}`, 1.5);
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
  if (payload.type === "vessel") {
    const v = payload.s;
    if (s.plate.dessert) {
      showHint("This tray already has a dessert.", 2);
      return false;
    }
    if (!v.flavor || v.swirl < 0.3) {
      showHint(v.vessel === "cone" ? "Fill the cone first: stand it under a nozzle and pull the handle." : "Fill the tin first: stand it under a nozzle and pull the handle.", 2.5);
      return false;
    }
    if (v.vessel === "tin" && v.blend < 0.3) {
      showHint("Blend it on the mixer first: hang the tin on it and hold the mixer.", 2.5);
      return false;
    }
    s.plate.dessert = { kind: v.vessel === "cone" ? "cone" : "shake", flavor: v.flavor, swirl: v.swirl, lean: leanOf(v.offs), blend: v.blend, melt: 0, offs: v.offs };
    syncTray(slot, false);
    sfx.plop();
    return true;
  }
  if (payload.type === "ice" || payload.type === "lid" || payload.type === "straw") {
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
    s.plate.fries = { cook, size, fill, salt, curds, gravy };
  } else {
    if (s.plate.drink) {
      showHint("This tray already has a drink.", 2);
      return false;
    }
    if (!payload.flavor || payload.fill < 0.05) {
      showHint("Fill it first!", 1.5);
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
  if (payload.type === "salt") {
    // Salt goes on by shaking; letting go just puts the shaker back.
    counter.shakerObj.visible = true;
    if (!shaker.shakes && shaker.target) showHint("Shake it over the fries to salt them.", 2);
    shaker.target = null;
    return;
  }

  if (band === "tray" || band === "customers") {
    const slot = band === "tray" ? trayView.pick(ndcIn(bands.tray, pt.x, pt.y)) : game.active;
    done = addToPlate(slot >= 0 ? slot : game.active, payload, has("steady") ? 0.03 : 0.08);
    if (done && slot >= 0) setActive(slot);
  } else if (band === "counter") {
    const g = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), 0.3);
    // The griddle's plate stands well above the counter, so drops there are matched at its height.
    const gTop = counter.groundPoint(ndcIn(bands.counter, pt.x, pt.y), GRILL_TOP);
    const station = payload.type === "empty" || payload.type === "vessel" || payload.type === "carton" || payload.type === "drink" || payload.type === "ice" || payload.type === "lid" || payload.type === "straw" || payload.type === "curds" || payload.type === "gravy" || (payload.type === "fries" && payload.basket !== null);
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
      if (over && fits && GRILLABLE.has(base.kind)) {
        counter.addGrillItem(base, over.x, over.z, top);
        sfx.sizzleHit();
        zoneHint(over.x);
        done = true;
      }
    } else if (payload.type === "piece") {
      const over = counter.overGrill(gTop);
      const under = over && payload.piece.kind === "cheese" ? counter.grillItemAt(gTop) : null;
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
        zoneHint(over.x);
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
    if (payload.type === "piece" && payload.fromPlate !== undefined) {
      // Lifted off a tray and dropped nowhere useful: it goes back on top.
      game.slots[payload.fromPlate].plate.layers.push({ piece: payload.piece, offX: 0, offZ: 0 });
      syncTray(payload.fromPlate, false);
    }
    if (payload.type === "stack" && payload.grill) {
      const [base, top] = payload.layers.map((l) => l.piece);
      counter.addGrillItem(base, payload.grill.x, payload.grill.z, top);
    }
    if (payload.type === "fries" && payload.basket !== null) {
      const b = counter.baskets[payload.basket];
      Object.assign(b, { loaded: true, cook: payload.cook, amount: payload.amount });
    }
    if (payload.type === "drink") {
      const { flavor, fill, size, ice, lid, straw, from, fromPlate } = payload;
      // Lifted off a tray: back on the tray. Otherwise back where it stood (nothing else can have taken the spot meanwhile).
      if (fromPlate !== undefined && flavor) {
        game.slots[fromPlate].plate.drink = { flavor, fill, size, ice, lid, straw };
        syncTray(fromPlate, false);
      } else if (from) counter.placeCup({ flavor, fill, size, ice, lid, straw }, new THREE.Vector3(from.x, 0.3, from.z));
    }
    if (payload.type === "carton") {
      const { size, cook, fill, salt, curds, gravy, fromPlate } = payload;
      if (fromPlate !== undefined) {
        game.slots[fromPlate].plate.fries = { size, cook, fill, salt, curds, gravy };
        syncTray(fromPlate, false);
      } else {
        Object.assign(counter.packs[payload.pack], { size, cook, fill, salt, curds, gravy });
        counter.syncPack(payload.pack);
      }
    }
    if (payload.type === "empty") {
      const st = counter.stacks[payload.stack];
      st.count++;
      st.sleeve = false;
      counter.syncStack(st);
    }
    if (payload.type === "vessel") putVesselBack(payload);
  }
}

/** A cone, tin or shake dropped nowhere useful goes back where it came from (a fresh one from the stacks just goes back). */
function putVesselBack(p: Extract<Payload, { type: "vessel" }>): void {
  if (p.fromPlate !== undefined) {
    game.slots[p.fromPlate].plate.dessert = dessertOf(p.s);
    syncTray(p.fromPlate, false);
  } else if (p.from === "mixer") counter.mountTin(p.s);
  else if (p.from) counter.putOnSpot(p.from.spot, p.s);
}

/** How far a swirl leans: where its top ring ended up, the rings' drift added up. */
function leanOf(offs: { x: number; z: number }[]): number {
  let x = 0;
  let z = 0;
  for (const o of offs) {
    x += o.x * 0.35;
    z += o.z * 0.35;
  }
  return Math.hypot(x, z);
}

/** A cone or shake on a tray, from what was made at the Cold bar. */
function dessertOf(v: VesselState): Dessert {
  return { kind: v.vessel === "cone" ? "cone" : "shake", flavor: v.flavor ?? "vanilla", swirl: v.swirl, lean: leanOf(v.offs), blend: v.blend, melt: v.melt, offs: v.offs };
}

/** A tray's dessert as something to carry (lifted off the tray). */
function vesselOf(d: Dessert): VesselState {
  return { vessel: d.kind === "cone" ? "cone" : "shake", flavor: d.flavor, swirl: d.swirl, offs: d.offs ?? [], blend: d.blend, melt: d.melt };
}

/** Something just went down on a grill zone that's off or only warm: say so, once each. */
function zoneHint(x: number): void {
  const heat = counter.zones[counter.zoneAt(x)];
  if (heat === "off") showHint("That part of the grill is off. Tap its button on the front to heat it.", 2.5);
  else if (heat === "warm") hintOnce("zone-warm", "Warm keeps food hot without cooking it much. Park finished food here.", 3);
}

/** Curds or gravy onto fries in a carton (on a pad or a plate). False if it's already on. */
function topFries(f: { curds?: boolean; gravy?: boolean }, what: "curds" | "gravy"): boolean {
  if (f[what]) {
    showHint(what === "curds" ? "It's got curds." : "It's got gravy.", 1.2);
    return false;
  }
  f[what] = true;
  spend(FRY_TOP_COST[what]);
  sfx.plop();
  if (what === "gravy" && !f.curds) hintOnce("curds-first", "Curds go under the gravy so they soften just right.", 3);
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
  const f = shaker.target.f;
  const before = f.salt ?? 0;
  if (before >= SALT.max) return void showHint("That's plenty of salt!", 1.2);
  f.salt = Math.min(SALT.max, before + SALT.shake);
  shaker.shakes++;
  spend(FRY_TOP_COST.salt);
  sfx.shake();
  buzz(6);
  shaker.target.sync();
}

/** Drinks, fryer and Cold bar stations: cups under nozzles, cartons on packing spots, cones and tins under the soft-serve nozzles or on the mixer. */
function dropAtStation(payload: Payload, g: THREE.Vector3): boolean {
  if (payload.type === "curds" || payload.type === "gravy") {
    const pi = counter.friedPackAt(g);
    if (pi < 0) {
      if (counter.overPack(g) >= 0) showHint("Fill the carton with fries first.", 1.5);
      return false;
    }
    return topFries(counter.packs[pi], payload.type) && (counter.syncPack(pi), true);
  }
  if (payload.type === "ice" || payload.type === "lid" || payload.type === "straw") {
    const c = counter.page === 0 ? counter.cupAt(g) : null;
    if (!c) return false;
    // Ice first, then pour, then the lid (of the cup's size), then the straw through it.
    const problem = c[payload.type]
      ? `It already has ${payload.type === "ice" ? "ice" : `a ${payload.type}`}.`
      : payload.type === "ice" && c.lid
        ? "Ice goes in before the lid."
        : payload.type === "lid" && c.fill < 0.05
          ? "Pour the drink first."
          : payload.type === "lid" && payload.size !== c.size
            ? `That's a ${SIZE_LABEL[payload.size].toLowerCase()} lid. This cup takes a ${SIZE_LABEL[c.size].toLowerCase()} one.`
            : payload.type === "straw" && !c.lid
              ? "Lid first, then the straw."
              : "";
    if (problem) {
      showHint(problem, 2);
      return false;
    }
    counter.dressCupAt(c, payload.type);
    spend(EXTRA_COST[payload.type]);
    sfx.plop();
    if (payload.type === "lid") hintOnce("straw", "Now a straw through the lid.", 2.5);
    return true;
  }
  if ((payload.type === "empty" && payload.kind === "cup") || payload.type === "drink") {
    // A cup stands anywhere on the drinks counter; over a drip tray it goes under that nozzle.
    if (counter.page !== 0 || counter.overTrash(g)) return false;
    const c = payload.type === "drink" ? payload : { flavor: null, fill: 0, size: payload.size, ice: false, lid: false, straw: false };
    const { cup, why } = counter.placeCup({ flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid, straw: c.straw }, g);
    if (!cup) {
      if (why) showHint(why, 2);
      return false;
    }
    sfx.plop();
    if (payload.type === "empty") {
      spend(CUP_COST[payload.size]);
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
    Object.assign(p, { size: payload.size as FriesSize, cook: 0, fill: 0 });
    spend(CARTON_COST[payload.size as FriesSize]);
    counter.syncPack(pi);
    sfx.plop();
    hintOnce("pack", "Drag the fries from the basket into the carton.", 3);
    return true;
  }
  if (payload.type === "vessel") {
    if (counter.page !== 3) return false;
    const v = payload.s;
    if (counter.overMixer(g)) {
      if (v.vessel === "cone") showHint("Cones don't go on the mixer: shakes are made in a steel tin.", 2.5);
      else if (v.vessel === "shake") return false;
      else if (counter.mixer.tin) showHint("There's already a tin on the mixer.", 1.5);
      else if (!v.flavor || v.swirl < 0.3) showHint("Fill the tin with soft serve first.", 2);
      else {
        counter.mountTin(v);
        sfx.plop();
        hintOnce("blend", "Hold the mixer to blend. Watch the bar on the left and let go in the band.", 3.5);
        return true;
      }
      return false;
    }
    const si = counter.overColdSpot(g);
    if (si < 0 || v.vessel === "shake") return false;
    if (counter.coldSpots[si].held) {
      showHint("There's already something under that nozzle.", 1.5);
      return false;
    }
    counter.putOnSpot(si, v);
    sfx.plop();
    if (!v.flavor) hintOnce("swirl", "Press the handle above it and circle your finger round the cone: one loop, one ring. Three is perfect.", 4);
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
  const raw = pv.drawPoint(sauceZoom.ray(pt.x, pt.y - NOZZLE_UP), Infinity);
  trayView.showGhost(slot, s.bottle);
  trayView.ghostOver(raw);
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

/** Let go: the bottle goes back in the caddy and the camera eases back out. */
function endSauce(pt: Pointer, cancelled: boolean): void {
  const s = sauceDrag;
  if (!s) return;
  if (!cancelled && !s.locked && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) < 24)
    showHint("Hold the bottle and drag it onto a burger. Keep moving to squeeze; let go to put it back.", 3);
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
sauceUi.innerHTML = `<div class="sauce-score"><b></b><span></span></div><div class="sauce-meter"><i class="band"></i><i class="fill"></i><i class="line"></i><em>Perfect</em></div>`;
ui.root.appendChild(sauceUi);
const sauceScore = sauceUi.querySelector(".sauce-score") as HTMLElement;
const sauceFill = sauceUi.querySelector(".fill") as HTMLElement;
/** The meter's full height, as coverage. */
const METER_TOP = 0.8;
{
  const band = sauceUi.querySelector(".band") as HTMLElement;
  band.style.bottom = `${(SAUCE_BAND.lo / METER_TOP) * 100}%`;
  band.style.height = `${((SAUCE_BAND.hi - SAUCE_BAND.lo) / METER_TOP) * 100}%`;
  const line = `${(((SAUCE_BAND.lo + SAUCE_BAND.hi) / 2) / METER_TOP) * 100}%`;
  (sauceUi.querySelector(".line") as HTMLElement).style.bottom = line;
  (sauceUi.querySelector("em") as HTMLElement).style.bottom = line;
}
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
  sauceFill.style.height = `${Math.min(100, (cov / METER_TOP) * 100).toFixed(1)}%`;
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

/**
 * Soft serve: press a handle and circle your finger round the cone or tin under it. The angle
 * swept round the top of the swirl counts the rings (one loop, one ring, either way round); where
 * the finger's loops are centred against the cone makes each finished ring drift, so a sloppy
 * circle builds a leaning cone.
 */
const swirl = { spot: -1, ang: 0, last: 0, base: 0, sum: [] as { x: number; y: number; n: number }[] };

/** The top of the soft serve at a nozzle spot on screen (column x, page y), and pixels per world unit there. */
function spotScreen(i: number): { x: number; y: number; unit: number } {
  const w = counter.spotTop(i);
  const v = w.clone().project(counter.camera);
  const u = w.clone().add(new THREE.Vector3(1, 0, 0)).project(counter.camera);
  return { x: ((v.x + 1) / 2) * bands.counter.w, y: bands.counter.y + ((1 - v.y) / 2) * bands.counter.h, unit: (Math.abs(u.x - v.x) / 2) * bands.counter.w };
}

function startSwirl(pt: Pointer, i: number): void {
  const v = counter.coldSpots[i].held;
  const flavor = counter.flavors[i];
  if (!v) return showHint("Stand a cone or a tin under the nozzle first. They're at the front.", 2.5);
  if (v.flavor && v.flavor !== flavor && v.swirl > 0.05) return showHint(`That one has ${FLAVOR_LABEL[v.flavor].toLowerCase()} in it.`, 2);
  if (v.blend > 0) return showHint("That shake's already blended.", 1.5);
  v.flavor = flavor;
  pt.mode = "swirl";
  counter.pull(i, true);
  const c = spotScreen(i);
  Object.assign(swirl, { spot: i, ang: 0, last: Math.atan2(pt.y - c.y, pt.x - c.x), base: v.swirl, sum: [] });
  counter.syncSpot(i);
  sfx.whoosh();
  hintOnce("swirl-how", `Keep holding and circle your finger round the ${v.vessel}: one loop, one ring. ${v.vessel === "cone" ? "Three is perfect." : "Two or three for a shake."}`, 3.5);
}

function swirlMove(pt: Pointer): void {
  const i = swirl.spot;
  const v = counter.coldSpots[i]?.held;
  if (!v) return;
  const c = spotScreen(i);
  const dx = pt.x - c.x;
  const dy = pt.y - c.y;
  if (Math.hypot(dx, dy) < 12) return;
  const a = Math.atan2(dy, dx);
  let d = a - swirl.last;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  swirl.last = a;
  swirl.ang += d;
  const before = v.swirl;
  v.swirl = Math.min(SWIRL.max, swirl.base + Math.abs(swirl.ang) / (Math.PI * 2));
  if (v.swirl > before) spend(SOFT_COST * (v.swirl - before));
  // The ring being laid collects where the finger goes; once it's finished, its drift is where
  // those loops were centred, against the cone.
  const k = Math.floor(before);
  const e = (swirl.sum[k] ??= { x: 0, y: 0, n: 0 });
  e.x += pt.x;
  e.y += pt.y;
  e.n++;
  if (Math.floor(v.swirl) > k) {
    const R = Math.max(40, c.unit * 1.1);
    const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
    v.offs[k] = { x: clamp1((e.x / e.n - c.x) / R), z: clamp1((e.y / e.n - c.y) / R) };
    buzz(8);
    const target = v.vessel === "cone" ? SWIRL.perfect : 2;
    if (Math.floor(v.swirl) === target) {
      sfx.plop();
      buzz(16);
    }
    if (v.swirl >= SWIRL.max) showHint("It's overflowing! Let go.", 1.5);
  }
  counter.syncSpot(i);
}

function endSwirl(): void {
  if (swirl.spot >= 0) counter.pull(swirl.spot, false);
  const v = counter.coldSpots[swirl.spot]?.held;
  if (v?.vessel === "cone" && v.swirl >= 1) hintOnce("cone-done", "Drag the cone up to its tray. It melts there, so serve it soon.", 3);
  if (v?.vessel === "tin" && v.swirl >= 1) hintOnce("tin-done", "Now hang the tin on the mixer, on the right, and hold the mixer to blend.", 3.5);
  swirl.spot = -1;
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
    else if (hit.type === "zone") {
      const heat = counter.cycleZone(hit.idx);
      sfx.flip();
      buzz(10);
      hintOnce("zones", "Each button cycles its zone: off, warm, hot. The strip along the front shows it: blue, orange, red.", 3.5);
      if (heat === "warm") hintOnce("zone-warm", "Warm keeps food hot without cooking it much. Park finished food here.", 3);
    }
    else if (hit.type === "bottle") startSauce(pt, hit.sauce);
    else if (hit.type === "friesBin") startHold(pt, { type: "fries", cook: 0, basket: null, amount: FRIES_SCOOP });
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
        // The last one out: a fresh sleeve rises in its place, ready to tear open.
        if (s.count === 0) {
          Object.assign(s, { sleeve: true, tear: 0 });
          hintOnce("unwrap", `Out of ${what}: a fresh sleeve is waiting. Tap it twice to tear it open.`, 3);
        }
        counter.syncStack(s);
        startHold(pt, { type: "empty", kind: s.kind, size: s.size, stack: hit.idx });
      } else {
        Object.assign(s, { sleeve: true, tear: 0 });
        counter.syncStack(s);
      }
    } else if (hit.type === "ice") startHold(pt, { type: "ice" });
    else if (hit.type === "lids") startHold(pt, { type: "lid", size: hit.size });
    else if (hit.type === "straws") startHold(pt, { type: "straw" });
    else if (hit.type === "cones" || hit.type === "tins") {
      const vessel = hit.type === "cones" ? "cone" : "tin";
      if (vessel === "cone") spend(CONE_COST);
      startHold(pt, { type: "vessel", s: { vessel, flavor: null, swirl: 0, offs: [], blend: 0, melt: 0 }, from: null });
      hintOnce(`take-${vessel}`, `Stand the ${vessel} under a nozzle: vanilla on the left, ${FLAVOR_LABEL[counter.flavors[1]].toLowerCase()} on the right.`, 3);
    } else if (hit.type === "coldSpot") {
      const v = counter.takeFromSpot(hit.idx);
      if (v) startHold(pt, { type: "vessel", s: v, from: { spot: hit.idx } });
      else showHint("Stand a cone or a tin here: they're at the front.", 2);
    } else if (hit.type === "handle") startSwirl(pt, hit.idx);
    else if (hit.type === "mixer") {
      if (counter.mixer.tin) {
        pt.mode = "blend";
        counter.mixer.running = true;
        sfx.whoosh();
      } else showHint("Fill a steel tin with soft serve, then hang it here to blend a shake.", 2.5);
    }
    else if (hit.type === "pack") {
      const p = counter.packs[hit.idx];
      if (p.size && p.fill > 0) {
        startHold(pt, { type: "carton", size: p.size, cook: p.cook, fill: p.fill, pack: hit.idx, salt: p.salt, curds: p.curds, gravy: p.gravy });
        Object.assign(p, EMPTY_PACK);
        counter.syncPack(hit.idx);
      } else showHint(p.size ? "Drag fries from the basket into the carton." : "Grab a carton from the stacks, front left.", 2);
    }
    else if (hit.type === "basket") pt.mode = "basket";
    else if (hit.type === "shaker" || hit.type === "curds" || hit.type === "gravy") {
      startHold(pt, { type: hit.type === "shaker" ? "salt" : hit.type });
      if (hit.type === "shaker") {
        counter.shakerObj.visible = false;
        Object.assign(shaker, { shakes: 0, target: null, dirX: 0, dirY: 0, runX: 0, runY: 0 });
      }
      hintOnce(`fry-${hit.type}`, hit.type === "shaker" ? "Hold the shaker over fries and shake it. Watch the bar on the left: stop at the line." : hit.type === "curds" ? "Poutine: fries, then cheese curds, then gravy on top." : "Ladle gravy over the curds to finish a poutine.", 3);
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
      startHold(pt, { type: "drink", flavor: c.flavor, fill: c.fill, size: c.size, ice: c.ice, lid: c.lid, straw: c.straw, from: { x: c.x, z: c.z } });
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
    case "swipe":
      // Sideways swipes on the counter are free for station actions; counters change from the tab bar.
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
    case "grill":
      // Turn into a drag once the finger travels sideways or down, reaches the tray, or lingers.
      // A quick upward flick that stays on the counter is a flip, decided on release.
      if (pt.moved && pt.hit?.type === "grillItem" && (now - pt.t0 > 400 || Math.abs(dx) > Math.abs(dy) || dy > 0 || bandAt(pt.y) !== "counter")) {
        const item: GrillItem = pt.hit.item;
        if (item.flipT < 0) {
          counter.removeGrillItem(item);
          const at = { x: item.x, z: item.z };
          // A cheesed patty comes off the grill as a little stack.
          if (item.topping) startHold(pt, { type: "stack", layers: [item.piece, item.topping.piece].map((piece) => ({ piece, offX: 0, offZ: 0 })), grill: at });
          else startHold(pt, { type: "piece", piece: item.piece, fromGrill: at });
        }
      }
      break;
    case "plate": {
      // Drag down off a tray to lift the top thing off: the burger's top layer, else the drink,
      // else the fries. Drop it in the trash, on the grill or another tray; anywhere else it goes back.
      const s = pt.plate >= 0 ? game.slots[pt.plate] : null;
      if (!s || bandAt(pt.y) !== "counter") break;
      if (s.plate.layers.length) {
        const top = s.plate.layers.pop()!;
        startHold(pt, { type: "piece", piece: top.piece, fromGrill: null, fromPlate: pt.plate });
        hintOnce("peel", "Peeled off the top layer. Drop it in the trash slot, on the grill, or on another tray.", 3);
      } else if (s.plate.dessert) {
        const d = s.plate.dessert;
        s.plate.dessert = null;
        startHold(pt, { type: "vessel", s: vesselOf(d), from: null, fromPlate: pt.plate });
      } else if (s.plate.drink) {
        const d = s.plate.drink;
        s.plate.drink = null;
        startHold(pt, { type: "drink", flavor: d.flavor, fill: d.fill, size: d.size, ice: !!d.ice, lid: !!d.lid, straw: !!d.straw, from: null, fromPlate: pt.plate });
      } else if (s.plate.fries) {
        const f = s.plate.fries;
        s.plate.fries = null;
        startHold(pt, { type: "carton", size: f.size, cook: f.cook, fill: f.fill, pack: -1, salt: f.salt ?? 0, curds: !!f.curds, gravy: !!f.gravy, fromPlate: pt.plate });
      } else break;
      syncTray(pt.plate, false);
      break;
    }
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
      sauceMove(pt);
      break;
    case "swirl":
      swirlMove(pt);
      break;
    case "blend":
      // Drag the tin off the mixer to take it to a tray; holding still keeps it spinning.
      if (pt.moved && counter.mixer.tin) {
        counter.mixer.running = false;
        const v = counter.unmountTin();
        if (v) startHold(pt, { type: "vessel", s: v, from: "mixer" });
      }
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
          if (b.down) hintOnce("fries-ding", "Watch the meter on the fryer: it beeps at perfect until you lift the basket.", 3.5);
          else hintOnce("fries-drag", "Drag the fries into a carton on the pad.", 2.5);
        }
      }
      break;
    case "pour":
      for (const t of counter.taps) t.pouring = false;
      break;
    case "swirl":
      endSwirl();
      break;
    case "blend":
      counter.mixer.running = false;
      if (!cancelled && counter.mixer.tin && counter.mixer.tin.blend >= BLEND.lo) hintOnce("shake-done", "Drag the tin up to a tray: it's poured into a shake cup on the way.", 3);
      break;
    case "sauce":
      endSauce(pt, cancelled);
      break;
    case "plate":
      if (cancelled || pt.plate < 0) break;
      // Swipe a plate up to hand it to its customer. (Dragging down onto the counter lifts things
      // off; nothing is ever thrown away except in the trash.)
      if (dy < -40 && -dy > Math.abs(dx)) serve(pt.plate);
      else if (!pt.moved && game.slots[pt.plate].order) hintOnce("serve", "Swipe the tray up to hand it over.", 2.5);
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
      if (!counter.inHand) goToStop(counter.stop + (dx < 0 ? 1 : -1));
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
    if (!counter.inHand) goToPage(i);
  }),
);
// Touching a stub brings that order into focus and opens it; tapping the open ticket folds it back
// to a stub. Folding waits for the click, which the browser drops when the touch scrolls the list.
ui.tickets.forEach((t, i) => {
  let wasOpen = false;
  t.addEventListener("pointerdown", () => {
    sfx.unlock();
    wasOpen = t.dataset.mode === "big";
    if (!counter.inHand && !wasOpen) {
      setActive(i);
      ticketOpen = true;
    }
  });
  t.addEventListener("click", () => {
    if (wasOpen && t.dataset.mode === "big" && !counter.inHand) ticketOpen = false;
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
      if (save.tutorialDone) {
        showPrep();
        screenShownAt = performance.now();
      } else startShift();
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
      showPrep();
      break;
    }
    case "prep-ads": {
      const lvl = Math.max(0, Math.min(2, Number(btn!.dataset.v))) as AdLevel;
      if (save.bank < ADS[lvl].cost) break;
      save.ads = lvl;
      writeSave(save);
      showPrep();
      break;
    }
    case "prep-box":
    case "closing-box":
      toggleBox(btn!.dataset.v!);
      if (act === "prep-box") showPrep();
      else showClosing();
      break;
    case "prep-simple":
      // "Keep it simple" is the Balanced complexity; "Show more detail" is Complex (see game/complexity.ts).
      setComplexity(save, save.simplePlan ? "complex" : "balanced");
      if (save.simplePlan) closeBoxes("prep:");
      writeSave(save);
      showPrep();
      break;
    case "open":
      startShift(save.biz ? planFor(stop(), save.plan) : null);
      break;
    case "pick": {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id as UpgradeId | undefined;
      if (!id || !save.offer.includes(id)) break;
      save.upgrades.push(id);
      save.offer = [];
      writeSave(save);
      sfx.coin();
      if (game.overlay === "closing") showClosing();
      else showTitle();
      break;
    }
    case "evening":
    case "next":
      showTitle();
      break;
    case "back":
      closeOverlay();
      break;
    case "reviews":
      showReviews(game.reviewFilter);
      break;
    case "rf":
      showReviews(btn!.dataset.v as ReviewFilter);
      break;
    case "buy": {
      const id = btn!.dataset.id as GearId;
      const g = gearById(id);
      if (!g || gearBlocker(g, save.gear, save.town, save.bank)) break;
      save.bank -= g.cost;
      save.gear.push(id);
      writeSave(save);
      sfx.coin();
      showSupplies();
      break;
    }
    case "wake":
      if (game.overlay !== "night") break;
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
  complexity: () => complexityOf(save),
  setComplexity: (c) => {
    setComplexity(save, c);
    writeSave(save);
    if (game.phase === "title") showTitle();
  },
  progress: () => ({ unlocked: save.unlocked, shiftsIn: save.shiftsIn }),
  canInstall: () => !!installPrompt,
  install: () => void installPrompt?.prompt(),
  checkUpdate: () => checkNow(),
  resume: () => {
    if (game.phase === "paused") game.phase = "playing";
  },
  restart: () => {
    if (save.tutorialDone) showPrep();
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

/** Back in a shift pauses and opens the menu instead of leaving the page; the guard re-arms itself. */
function shiftGuard(): void {
  pushBack("shift", shiftGuard);
  if (game.phase === "playing") {
    cancelPointer();
    game.phase = "paused";
    openMenu();
  }
}

function startShift(plan: Plan | null = null): void {
  cancelPointer();
  for (const k of ["prep", "overlay"]) dropBack(k);
  prepOpen = false;
  shiftGuard();
  for (let i = 0; i < 3; i++) {
    const s = game.slots[i];
    if (s.fig) customersView.leave(i, () => {});
    s.bubble?.remove();
    Object.assign(s, { order: null, plate: emptyPlate(), fig: null, leaving: false, ticketKey: "", bubble: null });
    syncTray(i, false);
  }
  for (const g of [...counter.grillItems]) counter.removeGrillItem(g);
  counter.zones = [...ZONE_START];
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
    ordered: 0,
    nextSpawn: 1.2,
    active: 0,
    tutorial: !save.tutorialDone,
    plan,
    costs: 0,
    reviews: [],
    ratings: [],
    line: [],
    leftLine: 0,
    walkedPast: 0,
    bellTaps: 0,
    bellAt: 0,
    emptySince: 0,
    adCost: 0,
    press: null,
  });
  // Social media bought for today comes out of the tin as the window opens; if the tin can't cover it, no post.
  if (save.ads && save.bank < ADS[save.ads].cost) save.ads = 0;
  game.adCost = ADS[save.ads].cost;
  save.bank -= game.adCost;
  game.customers = plan ? plannedCustomers(plan) : expectedCustomers();
  const proj = projectShift({ stop: stop(), plan, popularity: save.popularity, ads: save.ads, rep: save.rep, upgrades: save.upgrades, gear: save.gear });
  game.projected = [proj.lo, proj.hi];
  // A shift starts a fresh block of driving: the evening's hops count against the whole range.
  save.driven = 0;
  writeSave(save);
  ui.bell.hidden = false;
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
  counter.setFlavors(flavorsFor(st.region));
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

/** Before opening: the day's choices in expand boxes, with the projected receipt. Both modes. */
function showPrep(): void {
  game.town = save.town;
  game.event = eventOn(save.town, save.day);
  game.overlay = null;
  if (!prepOpen) pushBack("prep", () => showTitle());
  prepOpen = true;
  const plan = save.biz ? planFor(stop(), save.plan) : null;
  if (plan) save.plan = plan;
  ui.title.innerHTML = prepHtml({ save, stop: stop(), plan });
  ui.title.hidden = false;
  ui.summary.hidden = true;
}

/** True while the Prep screen fills the title layer (the home screen is unmounted then). */
let prepOpen = false;

/** A screen over the map (closing, night, reviews, supplies) lives in the summary layer. */
function showOverlay(kind: NonNullable<typeof game.overlay>, html: string): void {
  // Redrawing the same screen (a box opened, a filter tapped) must not swallow the next tap.
  if (game.overlay !== kind) screenShownAt = performance.now();
  // One Back entry for the layer, however many screens replace each other in it.
  if (!game.overlay) pushBack("overlay", () => closeOverlay(true));
  game.overlay = kind;
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
  showOverlay("closing", closingHtml(save.last, save, offerList()));
}

function showReviews(filter: ReviewFilter): void {
  game.reviewFilter = filter;
  showOverlay("reviews", reviewsHtml(save, filter));
}

function showSupplies(): void {
  showOverlay("supplies", suppliesHtml(save));
}

/** Night falls: charge the running cost, turn the day, and show the card until it's tapped. */
function sleepNow(): void {
  if (save.time !== "evening") return;
  const night = sleep(save);
  save.last = null;
  writeSave(save);
  game.phase = "summary";
  ui.title.hidden = false;
  showOverlay("night", nightHtml(night, save));
  sfx.chime();
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
  // Whatever Back was pointing at (a shift, Prep, a screen over the map) is gone now.
  for (const k of ["shift", "prep", "overlay"]) dropBack(k);
  prepOpen = false;
  game.overlay = null;
  mountHome(ui.title, {
    save,
    focus: game.mapSel,
    startShift: () => {
      if (save.tutorialDone) {
        showPrep();
        screenShownAt = performance.now();
      } else startShift();
    },
    openResults: () => showClosing(),
    openReviews: () => showReviews(game.reviewFilter),
    openSupplies: () => showSupplies(),
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
  // Fame: yesterday's fades a touch, then word of mouth, the press and today's posts move it.
  save.popularity = fadePopularity(save.popularity) + wordOfMouth(game.stars, game.lost, game.leftLine) + (game.press?.pop ?? 0) + ADS[save.ads].lasting;
  save.popularity = Math.max(10, Math.min(100, save.popularity));
  customersView.setLine([]);
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
  // A pass counts the people who ordered, so a short line isn't a fail, but serving one person out of a town's trade isn't a pass.
  const ok = passed(avg, game.served, Math.max(game.served + game.lost, Math.ceil(game.customers * 0.4)));
  let lastStop = false;
  const before = [...save.unlocked];
  const profit = game.money + game.tips - spills() - game.costs;
  save.bank += Math.max(0, Math.round(profit));
  // The tin never goes below zero, even after an unlucky post.
  save.bank = Math.max(0, save.bank);
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
    spills: spills(),
    adCost: game.adCost,
    costs: Math.round(game.costs),
    biz: !!game.plan,
    profit: Math.round(profit),
    running: RUNNING_COST,
    solar: solarSaving(save.gear),
    projected: game.projected,
    // The most telling ones: the best and the worst of the day.
    reviews: highlights(game.reviews),
    rep: save.rep,
    repBefore,
    pop: [popBefore, save.popularity],
    best: game.best?.name ?? null,
    outcome: !ok ? "failed" : lastStop ? "trip" : "passed",
    opened: opened.map((t) => t.id),
    shiftsHere: save.shiftsIn?.[here.id] ?? 0,
    press: game.press,
  };
  save.last = closing;
  writeSave(save);
  ui.title.hidden = false;
  showClosing();
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
    if (!(game.tutorial && game.ordered >= 1)) game.time += dt;
    // People arrive while the window is open and join the line, unless it's long and they've never heard of the truck.
    const tutorialHold = game.tutorial && game.ordered >= 1;
    if (game.time < stop().shiftLength && game.spawned < game.customers && game.time >= game.nextSpawn && !tutorialHold) {
      game.spawned++;
      if (game.rng() < joinChance(game.line.length, todayPop())) {
        const max = linePatience(difficulty, stop().crowd);
        game.line.push({ seed: Math.floor(game.rng() * 1000), patience: max, maxPatience: max });
      } else game.walkedPast++;
      const level = game.time / stop().shiftLength;
      const busy = game.customers / stop().customers;
      game.nextSpawn = game.time + (((17 - 8 * level) * (0.8 + game.rng() * 0.4)) / busy) * DIFFICULTY[difficulty].spawnGap;
    }
    // If nobody's about, don't make the player wait for the next arrival.
    if (!game.slots.some((s) => s.order) && !game.line.length && game.nextSpawn > game.time + 2 && !game.tutorial) game.nextSpawn = game.time + 2;

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
    // An empty window calls the first in line up by itself after a beat; otherwise it's the bell.
    if (game.slots.some((s) => s.order || s.fig)) game.emptySince = game.time;
    else if (game.line.length && game.time - game.emptySince >= 0.7) callNext();
    if (game.bellTaps && game.time - game.bellAt > BELL_WINDOW) game.bellTaps = 0;
    customersView.setLine(game.line.map((w) => ({ seed: w.seed, mood: patienceMood(w.patience / w.maxPatience) })));

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

    // Cooked food waiting on a tray slowly goes cold and dry (the warm grill zone is the place to hold it).
    for (const s of game.slots) {
      for (const l of s.plate.layers) if (GRILLABLE.has(l.piece.kind) && Math.max(...l.piece.cook) > 0.15) l.piece.held = (l.piece.held ?? 0) + dt;
      // Soft serve melts on the tray, so it's the last thing to make before serving.
      if (s.plate.dessert) {
        const before = Math.round(meltLevel(s.plate.dessert) * 8);
        s.plate.dessert.melt += dt;
        if (Math.round(meltLevel(s.plate.dessert) * 8) !== before) syncTray(game.slots.indexOf(s), false);
      }
    }

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
    if (doneSpawning && !game.line.length && game.slots.every((s) => !s.order && !s.fig)) endShift();
  }

  if (game.phase === "playing" || game.phase === "title" || game.phase === "summary") {
    // Soda is paid for as it pours, so moving a cup around costs nothing.
    const poured = counter.cups.map((c) => c.fill);
    counter.update(game.phase === "playing" ? dt : 0);
    counter.cups.forEach((c, i) => spend((Math.min(1, c.fill) - Math.min(1, poured[i])) * SODA_COST[c.size]));
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
counter.events.burning = () => {
  if (counter.page !== HOME_PAGE) showHint("Something's burning on the grill! ←", 2.5);
  else hintOnce("burning", "Smoke means burning! Drag it to the trash can.", 2.5);
};

/** Soda lost to overflows this shift, in whole dollars. */
function spills(): number {
  return Math.round(counter.spillCost);
}

let lastTimerText = "";
function updateUi(dt = 0): void {
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
  ui.bell.hidden = game.phase === "title" || game.phase === "summary";
  const inLine = String(game.line.length);
  if (ui.bellCount.textContent !== inLine) ui.bellCount.textContent = inLine;
  const bellLabel = game.bellTaps ? "again" : "line";
  if (ui.bellLabel.textContent !== bellLabel) ui.bellLabel.textContent = bellLabel;
  ui.bell.classList.toggle("empty", !game.line.length);
  ui.bell.classList.toggle("armed", game.bellTaps > 0);
  ui.bell.classList.toggle("full", game.line.length > 0 && game.slots.filter((s) => s.order || s.fig).length >= WINDOW[difficulty]);
  placeTickets();
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
    const shownPct = game.tutorial && game.ordered === 1 && i === game.slots.findIndex((x) => x.order) ? 1 : pct;
    const mode = t.dataset.mode ?? "stub";
    const key = `${order.id}|${focused}|${mode}|${t.style.width}|${s.plate.layers.map((l) => l.piece.kind).join(",")}|${s.plate.fries ? `${s.plate.fries.size}${+!!s.plate.fries.salt}${+!!s.plate.fries.curds}${+!!s.plate.fries.gravy}` : ""}|${s.plate.drink ? `${s.plate.drink.flavor}${s.plate.drink.size}${+!!s.plate.drink.ice}${+!!s.plate.drink.lid}${+!!s.plate.drink.straw}` : ""}|${s.plate.dessert ? `${s.plate.dessert.kind}${s.plate.dessert.flavor}` : ""}`;
    if (key !== s.ticketKey || !t.dataset.fit) {
      t.classList.toggle("active", focused);
      t.classList.toggle("stub", mode === "stub");
      t.classList.toggle("half", mode === "half");
      if (mode !== "stub") fitTicket(t, (fold) => ticketHtml(order, s.plate, shownPct, true, fold));
      else {
        t.classList.remove("dense");
        t.innerHTML = ticketHtml(order, s.plate, shownPct, false);
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

  ui.tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === counter.page)));
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
    el.style.width = `${Math.round(tapPx - 5)}px`;
    el.style.left = `${x}px`;
    el.style.top = `${bands.counter.y + ((1 - v.y) / 2) * bands.counter.h}px`;
    el.classList.toggle("down", counter.taps[i].pouring);
  });
  // Tab dots: something needs attention on that counter.
  const friesReady = counter.baskets.some((b) => b.loaded && friesZone(b.cook) === "done");
  const friesBurning = counter.baskets.some((b) => b.loaded && b.down && b.cook >= FRIES_ZONE.over - 0.05);
  const grillBurning = counter.grillItems.some((g) => g.piece.cook[0] > 0.85);
  // Cold bar: someone's waiting on a dessert; hot when a shake on the mixer is going runny.
  const wantsDessert = game.slots.some((sl) => sl.order?.dessert && !sl.plate.dessert && !sl.leaving);
  const runny = !!counter.mixer.tin && counter.mixer.tin.blend > BLEND.hi;
  const dots = [false, grillBurning, friesReady || friesBurning, wantsDessert || runny];
  const hot = [false, grillBurning, friesBurning, runny];
  ui.tabDots.forEach((d, i) => {
    d.hidden = !dots[i] || i === counter.page;
    d.classList.toggle("hot", hot[i]);
  });

  const tut = tutorialHint();
  const now = performance.now();
  const text = now < hintUntil ? hintText : tut;
  const show = !!text && text !== hintDismissed && game.phase === "playing";
  if (show && ui.hintText.textContent !== text) {
    ui.hintText.textContent = text;
    ui.hint.style.transform = "";
  }
  ui.hint.hidden = !show;
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
const handleTags = counter.coldSpots.map(() => stationTag("lid"));
const coldTags = [stationTag("lid"), stationTag("lid"), stationTag("lid")];
const lidTags = counter.lidAt.map(() => stationTag("lid"));
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
  counter.stacks.forEach((s, i) => {
    const page = s.kind === "cup" ? 0 : 2;
    if (!on(page)) return void (stackTags[i].hidden = true);
    const text = s.sleeve ? "Tap to unwrap" : s.count ? `${s.size} · ${s.count}` : `${s.size} · empty`;
    placeTag(stackTags[i], s.obj.position.clone().add(new THREE.Vector3(0, 0, 0.6)), text, ["low", !s.sleeve && s.count <= 1]);
  });
  // Each lid stack says which cup size it fits.
  counter.lidAt.forEach((l, k) => {
    if (!on(0)) return void (lidTags[k].hidden = true);
    placeTag(lidTags[k], l.at.clone().add(new THREE.Vector3(0, 0, 0.6)), `Lid ${l.size}`);
  });
  // Cold bar: each handle's flavour, then the cones, the tins and the mixer.
  counter.coldSpots.forEach((_, i) => {
    if (!on(3)) return void (handleTags[i].hidden = true);
    placeTag(handleTags[i], counter.coldSpots[i].at.clone().add(new THREE.Vector3(0, 0, 1.15)), FLAVOR_LABEL[counter.flavors[i]]);
    handleTags[i].style.setProperty("--k", FLAVOR_COLOR[counter.flavors[i]]);
  });
  if (!on(3)) coldTags.forEach((t) => (t.hidden = true));
  else {
    placeTag(coldTags[0], counter.coneTubeAt.clone().add(new THREE.Vector3(0, 0, 0.75)), "Cones");
    placeTag(coldTags[1], counter.tinStackAt.clone().add(new THREE.Vector3(0, 0, 0.75)), "Shake tins");
    const m = counter.mixer;
    const word = !m.tin ? "Mixer" : m.tin.blend < BLEND.lo ? "Hold to blend" : m.tin.blend <= BLEND.hi ? "Smooth!" : "Runny";
    placeTag(coldTags[2], m.at.clone().add(new THREE.Vector3(0, 0, 1.0)), word, ["low", !!m.tin && m.tin.blend > BLEND.hi]);
  }
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
    // Cooked food going cold, or soft serve melting: whichever is further gone.
    const held = Math.max(0, ...s.plate.layers.map((l) => l.piece.held ?? 0));
    let left = 1;
    let state = "";
    if (held > 0) {
      left = Math.max(0, 1 - held / HOLD_RUIN);
      state = held < HOLD_GRACE ? "fresh" : held < (HOLD_GRACE + HOLD_RUIN) / 2 ? "drying" : "dry";
    }
    const d = s.plate.dessert;
    if (d && d.melt > 0) {
      const m = MELT[d.kind];
      const l2 = Math.max(0, 1 - d.melt / m.ruin);
      if (!state || l2 < left) {
        left = l2;
        state = d.melt < m.grace ? "fresh" : d.melt < (m.grace + m.ruin) / 2 ? "drying" : "dry";
      }
    }
    el.hidden = !playing || !s.order || !state;
    if (el.hidden) return;
    (el.firstElementChild as HTMLElement).style.width = `${(left * 100).toFixed(1)}%`;
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
 * A fries doneness meter: underdone, done and overdone zones, a line at perfect, and a marker
 * for where these fries are now.
 */
function friesMeter(cook: number): string {
  const end = FRIES_ZONE.burnt;
  const pct = (v: number) => `${((Math.min(end, Math.max(0, v)) / end) * 100).toFixed(1)}%`;
  return `<span class="fmeter ${friesZone(cook)}${cook >= end ? " burnt" : ""}" style="--u:${pct(FRIES_ZONE.done)};--d:${pct(FRIES_ZONE.over)};--p:${pct(FRIES_PERFECT)}"><i style="left:${pct(cook)}"></i></span>`;
}

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
  let show: null | { v: number; max: number; lo: number; hi: number; perfect: number; color: string; name: string } = null;
  if (t?.cup) show = { v: t.cup.fill, max: 1, lo: DRINK_FILL.full, hi: 1, perfect: DRINK_FILL.perfect, color: DRINK_TINT[t.cup.flavor ?? t.flavor], name: SIZE_LABEL[t.cup.size] };
  else if (salting) show = { v: shaker.target!.f.salt ?? 0, max: SALT.max, lo: SALT.low, hi: SALT.high, perfect: SALT.perfect, color: "#fbfaf6", name: "Salt" };
  else if (game.phase === "playing" && ptr?.mode === "swirl" && swirl.spot >= 0) {
    const v = counter.coldSpots[swirl.spot].held;
    if (v) {
      const shake = v.vessel === "tin";
      show = { v: v.swirl, max: 5, lo: shake ? SHAKE_SWIRL.lo : SWIRL.lo, hi: shake ? SHAKE_SWIRL.hi : SWIRL.hi, perfect: shake ? 2.5 : SWIRL.perfect, color: FLAVOR_COLOR[v.flavor ?? "vanilla"], name: "Rings" };
    }
  } else if (game.phase === "playing" && counter.mixer.running && counter.mixer.tin) {
    const v = counter.mixer.tin;
    show = { v: v.blend, max: BLEND.max, lo: BLEND.lo, hi: BLEND.hi, perfect: BLEND.perfect, color: FLAVOR_COLOR[v.flavor ?? "vanilla"], name: "Blend" };
  }
  levelBar.el.classList.toggle("on", !!show);
  // Shake the shaker in hand a little with each shake.
  shaker.wiggle = Math.max(0, shaker.wiggle - 0.12);
  const held = ptr?.held;
  if (held?.payload.type === "salt") held.counterObj.rotation.z = held.trayObj.rotation.z = Math.sin(performance.now() / 30) * 0.35 * shaker.wiggle;
  if (!show) return;
  const r = bands.counter;
  levelBar.el.style.top = `${r.y + r.h * 0.1}px`;
  levelBar.el.style.height = `${r.h * 0.62}px`;
  const pct = (x: number) => `${(Math.min(1, Math.max(0, x / show!.max)) * 100).toFixed(1)}%`;
  levelBar.fill.style.height = pct(show.v);
  levelBar.fill.style.background = show.color;
  levelBar.ok.style.bottom = pct(show.lo);
  levelBar.ok.style.height = `calc(${pct(show.hi)} - ${pct(show.lo)})`;
  levelBar.perfect.style.bottom = pct(show.perfect);
  levelBar.el.classList.toggle("over", show.v > show.hi + 0.001);
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
      spots.push({ at: counter.fryTagPoint(i), html: `${friesMeter(b.cook)}<span class="scoops" aria-label="${scoops} of 3 scoops">${pips}</span>` });
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
    // Under the item, or over its front edge on the front row, clear of the zone buttons.
    const v = it.obj.position.clone().add(new THREE.Vector3(0, 0.2, Math.min(0.66, counter.grillTagZ - it.z))).project(counter.camera);
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
    const heat = counter.heatOf(it);
    el.classList.toggle("hot", burning && heat === "hot");
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
  goToStop,
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
  save,
  showTitle,
  menu: { openMenu, openHowTo, openMenuRef, closeAll },
  manual: (on: boolean) => {
    manualClock = on;
  },
};

