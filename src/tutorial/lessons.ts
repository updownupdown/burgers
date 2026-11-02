/**
 * The tutorial's lessons (coach.ts runs them). Map lessons point at the map's own buttons; kitchen
 * lessons point at the stations through the counter's hit boxes and the trays' burgers, so they
 * follow the layout wherever it moves.
 *
 * The first shift (game.tutorial) is talked through order by order:
 *   1st order  every move shown, the clock waits;
 *   2nd order  the thumb comes back only when the player stops for a few seconds, and it brings a
 *              drink, so the counters get swiped; someone joins the line, so the bell gets rung
 *              and two tickets share the rail (fold one, open one);
 *   3rd order  a nudge only after a longer pause.
 * After that, each new thing gets its own lesson the first time an order needs it: fries, an egg,
 * a toasted bun, melted cheese, a sauce, a send-back.
 */
import * as THREE from "three";
import { cookLevel, COOK_SCALE, DRINK_FILL, friesZone, isMelted, isToasted, SALT } from "../game/cooking";
import type { Save } from "../game/progress";
import { readyToBuy } from "../game/garage";
import { STOPS as TOWNS, townById } from "../game/stops";
import { COUNTED, FRIES_PORTION, FRIES_SCOOP, FRY_LABEL, isSauce, KIND_LABEL, SIZE_LABEL, DRINK_LABEL, type Kind, type Order, type Plate } from "../game/types";
import type { CounterView, GrillItem } from "../scenes/counter";
import { HOME_PAGE } from "../scenes/counter";
import type { TrayView } from "../scenes/tray";
import type { EggStage } from "../render/egg";
import { okDone, type Box, type Gesture, type Pt, type Show, type Step } from "./coach";

/** What the lessons read from the game. main.ts hands this over once. */
export interface CoachWorld {
  save: Save;
  phase(): "title" | "playing" | "paused" | "summary";
  /** Prep is up over the map. */
  prepOpen(): boolean;
  /** The screen over the map, if any: closing, reviews, garage. */
  overlay(): string | null;
  /** The town whose sheet is open on the map. */
  mapSelected(): string | null;
  kitchen: KitchenWorld;
}

export interface KitchenSlot {
  order: Order | null;
  plate: Plate;
  leaving: boolean;
  fig: unknown;
  sentBack: string | null;
  /** Which of the first shift's guided orders this is (0, 1, 2), or -1. */
  lesson: number;
}

export interface KitchenWorld {
  game: { slots: KitchenSlot[]; active: number; line: unknown[]; tutorial: boolean; served: number; pacing: string };
  counter: CounterView;
  trayView: TrayView;
  /** Viewport point of a world point in a band of the 3D view. */
  project(band: "counter" | "tray", v: THREE.Vector3): Pt;
  /** The counter band, viewport px. */
  counterBand(): Box;
  ticketOpen(): boolean;
  tickets: HTMLElement[];
  bell: HTMLElement;
  /** The round counter buttons, one per counter. */
  tabs: HTMLElement[];
  /** Sauce being put on: `armed` once a bottle was tapped (waiting for a tap on a burger), `locked` once the view has zoomed onto the burger. */
  sauce(): { locked: boolean; armed: boolean } | null;
  /** The tray whose top layer the header's Undo would take off right now, or -1. */
  undoTray(): number;
  /** The header's Undo button. */
  undoButton: HTMLElement;
  /** Middle of the zoomed sauce view, and its radius, viewport px. */
  sauceCentre(): { x: number; y: number; r: number };
  eggStage(): EggStage | null;
  /** Something is in the player's hand. */
  holding(): boolean;
  /** How many people the window takes at once on this shift's pacing. */
  windowCap(): number;
  /** Running counts of things the player has done, for lessons that end when they've done it. */
  counts: { bell: number; folds: number; opens: number };
}

// ---------------------------------------------------------------------------
// Helpers

const rectOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const mid = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const q = (sel: string): HTMLElement | null => {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) if (rectOf(el) && !el.closest("[hidden]")) return el;
  return null;
};
const tapOn = (el: Element | null): Gesture | null => {
  const b = rectOf(el);
  return b ? { kind: "tap", at: mid(b) } : null;
};
const label = (k: Kind) => KIND_LABEL[k].toLowerCase();
const totalShifts = (s: Save) => Object.values(s.shiftsIn ?? {}).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// The map

/** Nothing covers the map: no screen over it, no night playing, no menu. */
function mapClear(w: CoachWorld): boolean {
  return w.phase() === "title" && !w.prepOpen() && !w.overlay() && !document.querySelector("div.home-night") && !document.querySelector(".home.driving");
}

/** The first new town the road has opened that the truck hasn't worked yet. */
function newTown(s: Save): string | null {
  const first = TOWNS[0].id;
  if (s.town !== first || totalShifts(s) === 0) return null;
  return s.unlocked.find((id) => id !== s.town && !(s.shiftsIn[id] ?? 0)) ?? null;
}

function mapSteps(w: CoachWorld): Step[] {
  const s = w.save;
  const firstTown = () => s.town === TOWNS[0].id;
  return [
    {
      id: "map-open",
      once: true,
      when: () => mapClear(w) && s.time === "morning" && totalShifts(s) === 0,
      done: () => w.prepOpen() || totalShifts(s) > 0,
      show: () => ({
        title: "Your first stop",
        text: `This is ${townById(s.town).name}, where the trip starts. Tap Prep & Open to get the truck ready for lunch.`,
        gesture: tapOn(q(".home-sheet:not([hidden]) [data-home=open]") ?? q(".home-dock [data-home=open]")),
      }),
    },
    {
      id: "prep-open",
      once: true,
      when: () => w.prepOpen() && totalShifts(s) === 0,
      done: () => w.phase() === "playing" || totalShifts(s) > 0,
      show: () => ({
        title: "Prep & Open",
        text: "Who's coming, today's menu and the pacing. You're on Chill: patient customers, never a rush. Tap Open when you're ready.",
        gesture: tapOn(q(".prep [data-act=open]")),
        ring: rectOf(q(".prep .prep-sec .bv-seg")),
      }),
    },
    {
      id: "closing",
      once: true,
      when: () => w.overlay() === "closing" && totalShifts(s) <= 1,
      done: () => totalShifts(s) > 1 || s.day > 1,
      show: () => {
        const btn = q("[data-act=evening]");
        return {
          title: "Shift done!",
          text: btn ? "Your stars, takings and reviews are all here. Tap Evening map to carry on." : "Your stars, takings and reviews are all here. Scroll down for the way back to the map.",
          gesture: tapOn(btn),
          place: "top",
        };
      },
    },
    {
      id: "evening-sleep",
      once: true,
      when: () => mapClear(w) && s.time === "evening" && s.day === 1,
      done: () => s.day > 1,
      show: () => ({
        title: "Evening",
        text: "The day's work is done. In the evening you can make a short drive, or sleep. For now, tap Sleep to start tomorrow.",
        gesture: tapOn(q(".home-sheet:not([hidden]) [data-home=sleep]") ?? q(".home-dock [data-home=sleep]")),
      }),
    },
    {
      id: "map-pips",
      once: true,
      when: () => mapClear(w) && s.time === "morning" && s.day >= 2 && firstTown() && !w.mapSelected() && !!q(".home-dock .home-pips"),
      done: () => okDone("map-pips") || totalShifts(s) >= 3,
      show: () => ({
        title: "A new day",
        text: "Three shifts here open the road to the next towns. The dots show how many you've done. Each shift counts, good or not.",
        ring: rectOf(q(".home-dock .home-pips")),
        ok: "Got it",
      }),
    },
    {
      id: "town-drive",
      once: true,
      when: () => mapClear(w) && !!newTown(s) && w.mapSelected() === newTown(s) && !!q("[data-home=drive]:not([disabled])"),
      done: () => !firstTown(),
      show: () => ({
        title: "Hit the road",
        text: `Tap Drive here. The truck sets off for ${townById(newTown(s)!).name}, with a new crowd and new dishes.`,
        gesture: tapOn(q("[data-home=drive]")),
        place: "top",
      }),
    },
    {
      id: "town-tap",
      once: true,
      when: () => mapClear(w) && !!newTown(s) && w.mapSelected() !== newTown(s),
      done: () => !firstTown(),
      show: () => {
        const id = newTown(s)!;
        const marker = q(`.home-world [data-town="${id}"] circle`) ?? q(`.home-world [data-town="${id}"]`);
        const map = rectOf(q(".home-map"));
        const b = rectOf(marker);
        const inView = !!b && !!map && b.y > map.y + 90 && b.y < map.y + map.h - 130;
        return {
          title: "A new town!",
          text: `The road to ${townById(id).name} is open. ${inView ? "Tap it on the map." : "Drag the map to find it, then tap it."}`,
          gesture: inView ? { kind: "tap", at: mid(b!) } : null,
          place: "top",
        };
      },
    },
    {
      id: "garage",
      once: true,
      when: () => mapClear(w) && readyToBuy(s) > 0,
      done: () => w.overlay() === "garage",
      show: () => ({
        title: "Treat the truck",
        text: "You've saved enough for the bonus you unlocked. Tap your savings to open the Garage.",
        gesture: tapOn(q(".home-bank")),
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// The kitchen

/** The order being worked on, if the shift is running. */
function activeSlot(k: KitchenWorld): KitchenSlot | null {
  const s = k.game.slots[k.game.active];
  return s && s.order && !s.leaving ? s : null;
}

/** Ordered layers one piece at a time (two tomato slices are two entries). */
function expand(o: Order): { kind: Kind; at: number }[] {
  return o.layers.flatMap((l, at) => Array.from({ length: l.count ?? 1 }, () => ({ kind: l.kind, at })));
}

/** Where the plate stands against the ticket: the first wrong layer, or the next one wanted. */
function progress(o: Order, p: Plate): { wrong: number; next: number; want: { kind: Kind; at: number }[] } {
  const want = expand(o);
  const got = p.layers.map((l) => l.piece.kind);
  const wrong = got.findIndex((g, i) => want[i]?.kind !== g);
  return { wrong, next: got.length, want };
}

function lessonStepsKitchen(w: CoachWorld): Step[] {
  const k = w.kitchen;
  const c = k.counter;
  const playing = () => w.phase() === "playing";
  const grill = () => c.middle === "grill";

  const proxy = (match: Parameters<CounterView["proxyPoint"]>[0], y = 0): Pt | null => {
    const v = c.proxyPoint(match);
    if (!v) return null;
    v.y += y;
    const p = k.project("counter", v);
    const band = k.counterBand();
    return p.x > band.x + 4 && p.x < band.x + band.w - 4 && p.y > band.y && p.y < band.y + band.h ? p : null;
  };
  const bin = (kind: Kind) => proxy((h) => h.type === "bin" && h.kind === kind);
  const plateAt = (i: number): Pt => {
    const b = k.trayView.plates[i].burger;
    b.updateWorldMatrix(true, false);
    const e = b.matrixWorld.elements;
    return k.project("tray", new THREE.Vector3(e[12], 0.3, e[14]));
  };
  /** The header's Undo button, when it would take something off this tray. */
  const undoAt = (i: number): Pt | null => {
    const r = k.undoTray() === i ? rectOf(k.undoButton) : null;
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  };
  const itemAt = (it: GrillItem): Pt => k.project("counter", c.world(HOME_PAGE, it.x, 0.95, it.z));
  const zoneAt = (i: number): Pt => k.project("counter", c.zonePoint(i));
  const trashAt = (): Pt => {
    const t = c.trashPoint();
    return k.project("counter", new THREE.Vector3(t.x, 0.3, t.z));
  };
  /** A swipe along the belt (the trash chute) towards a counter. */
  const toCounter = (page: number): Gesture | null => {
    if (c.page === page) return null;
    const a = trashAt();
    const band = k.counterBand();
    const right = page > c.page;
    // Swiping left brings the counter on the right into view, and the other way round.
    const from = { x: band.x + band.w * (right ? 0.68 : 0.32), y: a.y };
    const to = { x: band.x + band.w * (right ? 0.32 : 0.68), y: a.y };
    return { kind: "swipe", from, to };
  };
  const navRing = (page: number): Box | null => rectOf(k.tabs[page]);
  const COUNTER_NAME = ["drinks", "grill", "fryer"];
  const goTo = (page: number, why: string): Show => ({
    title: `To the ${COUNTER_NAME[page]}`,
    text: `${why} Swipe along the belt at the bottom, or tap the ${COUNTER_NAME[page]} button.`,
    gesture: toCounter(page),
    ring: navRing(page),
  });
  const ticket = (): Box | null => rectOf(k.tickets.find((t) => !t.hidden && t.dataset.mode === "big") ?? null);
  const grillItems = (kind: Kind) => c.grillItems.filter((g) => g.piece.kind === kind && !g.held && !c.above(g));
  const ringAround = (p: Pt, w = 110, h = 70): Box => ({ x: p.x - w / 2, y: p.y - h / 2 + 10, w, h });

  /**
   * The next move on the burger for this slot, or null when the burger part is done (or isn't
   * something these lessons know: the press, the comal and the oven teach with their own tips).
   * `only` limits it to one new thing (an egg, a toasted bun, melted cheese, a sauce) for orders
   * after the guided ones.
   */
  const burgerMove = (slotIdx: number, only?: "egg" | "toast" | "melt" | "sauce" | "grill" | "smash"): Show | null => {
    const s = k.game.slots[slotIdx];
    const o = s.order!;
    if (!grill() || !o.layers.length || o.layers[0].kind !== "bun") return null;
    const pr = progress(o, s.plate);
    const plate = plateAt(slotIdx);
    if (pr.wrong >= 0) {
      if (only) return null;
      return {
        title: "Oops, not that",
        text: undoAt(slotIdx) ? "That isn't next on the ticket. Tap Undo, top left, to put it back." : "That isn't next on the ticket. Drag it down off the tray into the trash.",
        gesture: undoAt(slotIdx) ? { kind: "tap", at: undoAt(slotIdx)! } : { kind: "drag", from: plate, to: trashAt() },
      };
    }
    if (pr.next >= pr.want.length) return null;
    const next = pr.want[pr.next];
    const exp = o.layers[next.at];
    const onGrill = c.page === HOME_PAGE;
    const back = () => goTo(HOME_PAGE, "The burger is made at the grill.");

    // A smash burger: press and hold a patty while it's still fresh, whatever comes next.
    const smashLeft = o.layers.some((l, i) => l.smashed && i >= next.at);
    const fresh = smashLeft && onGrill ? grillItems("patty").find((g) => !g.piece.smashed && cookLevel(g.piece) < 0.22 && !g.topping && g.flipT < 0) : undefined;
    if (fresh && (!only || only === "smash")) return { title: "Smash it", text: "A smash burger: press and hold the fresh patty for a moment to flatten it. Thin patties cook fast!", gesture: { kind: "hold", at: itemAt(fresh) }, urgent: true };
    if (only === "smash") return null;

    // Anything cooked is better started early: get the patties (and bacon) going first.
    const cookedKinds: Kind[] = ["patty", "bacon"];
    for (const kind of cookedKinds) {
      const need = pr.want.slice(pr.next).filter((x) => x.kind === kind).length;
      const have = grillItems(kind).length + c.grillItems.filter((g) => g.piece.kind === kind && c.above(g)).length;
      if (need > have && (only === undefined || only === "grill")) {
        if (!onGrill) return back();
        const from = bin(kind);
        return {
          title: kind === "patty" ? (pr.next === 0 ? "Patty first" : "Another patty") : "Bacon on",
          text: kind === "patty" ? (pr.next === 0 ? "Patties take the longest, so start one first: drag a patty onto the hot grill." : "Drag a patty onto the hot grill.") : "Drag bacon onto the hot grill. It cooks while you build.",
          gesture: from ? { kind: "drag", from, to: zoneAt(0) } : null,
        };
      }
    }

    if (isSauce(next.kind)) {
      if (only && only !== "sauce") return null;
      const sc = k.sauce();
      if (sc?.locked) {
        const z = k.sauceCentre();
        return { title: "Squeeze", text: `Draw circles with your finger to cover the bun. Lift it when it says Perfect.`, gesture: { kind: "circle", at: { x: z.x, y: z.y - z.r * 0.4 }, r: z.r * 0.35 }, whileDown: true, place: "top" };
      }
      if (sc?.armed) return { title: KIND_LABEL[next.kind], text: "Now tap the burger to put it on.", gesture: { kind: "tap", at: plate } };
      if (!onGrill) return back();
      const from = proxy((h) => h.type === "bottle" && h.sauce === next.kind);
      // The very first burger: tap the bottle, then the burger. After that, the quicker drag.
      if (s.lesson === 0)
        return { title: KIND_LABEL[next.kind], text: `Tap the ${label(next.kind)} bottle, then tap the burger.`, gesture: from ? { kind: "tap", at: from } : null };
      return {
        title: KIND_LABEL[next.kind],
        text: `Quicker: press the ${label(next.kind)} bottle and drag it up onto the burger, then keep drawing circles until it says Perfect.`,
        gesture: from ? { kind: "dragCircle", from, to: plate, r: 22 } : null,
      };
    }

    if (next.kind === "patty" || next.kind === "bacon") {
      if (only && only !== "grill" && !(only === "melt" && o.layers[next.at + 1]?.melted)) return null;
      if (!onGrill) return back();
      const it = grillItems(next.kind).sort((a, b) => cookLevel(b.piece) - cookLevel(a.piece))[0];
      if (!it) return null;
      const at = itemAt(it);
      const lvl = cookLevel(it.piece);
      const sc = COOK_SCALE[next.kind];
      const melt = o.layers[next.at + 1]?.melted && o.layers[next.at + 1].kind === "cheese";
      if (melt && !it.topping && lvl >= sc.done * 0.5) {
        const from = bin("cheese");
        return { title: "Melt the cheese", text: "This one wants melted cheese: drop a slice right on the patty while it's on the grill.", gesture: from ? { kind: "drag", from, to: at } : null };
      }
      if (only === "melt") {
        if (!melt) return null;
        if (it.topping && !isMelted(it.topping.piece)) return { title: "Melting", text: "Wait for the cheese to slump over the patty, then drag them up together.", ring: ringAround(at) };
        if (it.topping) return { title: "Melted", text: "Drag the patty up with its cheese.", gesture: { kind: "drag", from: at, to: plate } };
        return { title: "Melted cheese", text: "This one wants melted cheese. When the patty is about halfway, drop a cheese slice on it.", ring: ringAround(at) };
      }
      if (lvl >= sc.burnt) return { title: "Burnt!", text: "That one's burnt. Drag it into the trash at the front and start another.", gesture: { kind: "drag", from: at, to: trashAt() }, urgent: true };
      if (lvl < sc.done) {
        if (!(it.piece.flips ?? 0) && lvl >= sc.done * 0.5 && it.flipT < 0 && !it.topping)
          return { title: "Flip it", text: `Tap the ${label(next.kind)} to flip it, so both sides cook.`, gesture: { kind: "tap", at } };
        return {
          title: "Sizzling",
          text: next.kind === "patty" ? "It's cooking. Watch the meter under it: it's done when the fill reaches the hatched middle band." : "Cooking. Watch the meter under it for the hatched middle band.",
          ring: ringAround(at, 120, 76),
        };
      }
      if (melt && it.topping && !isMelted(it.topping.piece)) return { title: "Melting", text: "Wait for the cheese to slump over the patty, then drag them up together.", ring: ringAround(at) };
      return {
        title: lvl >= sc.over ? "Quick!" : "Done!",
        text: lvl >= sc.over ? `It's getting dark. Drag the ${label(next.kind)} up to the burger now.` : `Drag the ${label(next.kind)} up onto the burger.`,
        gesture: { kind: "drag", from: at, to: plate },
        urgent: lvl >= sc.over,
      };
    }

    if (next.kind === "egg") {
      if (only && only !== "egg") return null;
      if (!onGrill) return back();
      const stage = k.eggStage();
      if (stage === "shells") return { title: "Shells away", text: "Tap the trash at the front to drop the shells.", gesture: { kind: "tap", at: trashAt() } };
      if (stage) return { title: "Crack it", text: "Tap the egg on the flat middle of the grill to crack it. One crisp tap.", gesture: { kind: "tap", at: zoneAt(1) } };
      const eggs = grillItems("egg");
      const it = eggs.sort((a, b) => cookLevel(b.piece) - cookLevel(a.piece))[0];
      if (!it) {
        const from = bin("egg");
        return { title: "An egg", text: "Tap the eggs to pick one up.", gesture: from ? { kind: "tap", at: from } : null };
      }
      const at = itemAt(it);
      const lvl = cookLevel(it.piece);
      if (exp.flipped && !(it.piece.flips ?? 0) && lvl >= 0.2 && it.flipT < 0) return { title: "Over easy", text: "This egg is served over easy: tap it to flip it once.", gesture: { kind: "tap", at } };
      if (lvl < COOK_SCALE.egg.done) return { title: "Frying", text: exp.flipped ? "Let it set." : "Sunny side up: no flip. Let it set until the meter reaches the middle band.", ring: ringAround(at) };
      return { title: "Egg's ready", text: "Drag the egg up onto the burger.", gesture: { kind: "drag", from: at, to: plate } };
    }

    if (next.kind === "bun" && exp.toasted) {
      if (only && only !== "toast") return null;
      if (!onGrill) return back();
      const buns = grillItems("bun");
      const it = buns.sort((a, b) => cookLevel(b.piece) - cookLevel(a.piece))[0];
      if (!it) {
        const from = bin("bun");
        return { title: "Toasted bun", text: "This one comes on a toasted bun: drag a bun onto the grill first.", gesture: from ? { kind: "drag", from, to: zoneAt(1) } : null };
      }
      const at = itemAt(it);
      if (!isToasted(it.piece)) return { title: "Toasting", text: "Leave it cut side down until the meter reaches the middle band.", ring: ringAround(at) };
      return { title: "Toasted", text: "Drag the bun up to the tray.", gesture: { kind: "drag", from: at, to: plate } };
    }

    if (only) return null;
    if (!onGrill) return back();
    const from = bin(next.kind);
    const want = exp.count ?? 1;
    const done = pr.next - pr.want.findIndex((x) => x.at === next.at);
    const counted = COUNTED.has(next.kind) && want > 1;
    const text =
      next.kind === "bun"
        ? pr.next === 0
          ? "Drag a bun onto the tray. That's the bottom of the burger: build it up from there."
          : "Finish with the top bun."
        : counted
          ? `${KIND_LABEL[next.kind]} ×${want}: drag ${done ? "one more slice" : "a slice"} onto the burger${done ? "" : ", then another"}.`
          : `Drag the ${label(next.kind)} onto the burger.`;
    return { title: next.kind === "bun" ? (pr.next === 0 ? "Bottom bun" : "Top bun") : KIND_LABEL[next.kind], text, gesture: from ? { kind: "drag", from, to: plate } : null };
  };

  /** The drink: cup under the right nozzle, ice, pour, lid, up to the tray. */
  const drinkMove = (slotIdx: number): Show | null => {
    const s = k.game.slots[slotIdx];
    const o = s.order!;
    if (!o.drink || s.plate.drink) return null;
    const name = DRINK_LABEL[o.drink];
    const size = SIZE_LABEL[o.drinkSize].toLowerCase();
    if (c.page !== 0) return { ...goTo(0, `This order wants a ${size} ${name}. Drinks are on the counter to the left.`) };
    const ti = c.taps.findIndex((t) => t.flavor === o.drink);
    const cup = c.cups.find((x) => x.size === o.drinkSize && !x.lid && (!x.flavor || x.flavor === o.drink)) ?? c.cups.find((x) => x.size === o.drinkSize && x.flavor === o.drink);
    const tapAt = ti >= 0 ? k.project("counter", c.tapCupPoint(ti)) : null;
    if (!cup) {
      const si = c.stacks.findIndex((st) => st.kind === "cup" && st.size === o.drinkSize);
      const from = proxy((h) => h.type === "stack" && h.idx === si, 0.4);
      return { title: "A cup", text: `Grab a ${size} cup and stand it under the ${name} nozzle.`, gesture: from && tapAt ? { kind: "drag", from, to: tapAt } : null };
    }
    const cupAt = k.project("counter", new THREE.Vector3(cup.x, 0.9, cup.z));
    if (cup.lid) return { title: "Ready", text: "Drag the drink up to the tray.", gesture: { kind: "drag", from: cupAt, to: plateAt(slotIdx) } };
    if (cup.tap !== ti && cup.fill < 0.05) return { title: "Under the nozzle", text: `Move the cup under the ${name} nozzle.`, gesture: tapAt ? { kind: "drag", from: cupAt, to: tapAt } : null };
    if (o.ice !== false && !cup.ice && cup.fill < 0.05) {
      const from = proxy((h) => h.type === "ice", 0.3);
      return { title: "Ice first", text: "Scoop some ice into the cup before you pour.", gesture: from ? { kind: "drag", from, to: cupAt } : null };
    }
    if (cup.fill < DRINK_FILL.full) {
      const btn = ti >= 0 ? k.project("counter", c.drinkButtonPoint(ti)) : null;
      return { title: "Pour", text: k.game.pacing === "chill" ? `Hold the ${name} button to pour. On Chill it stops at the line by itself.` : `Hold the ${name} button to pour. Watch the bar on the left and let go at the line.`, gesture: btn ? { kind: "hold", at: btn } : null, whileDown: true };
    }
    const from = proxy((h) => h.type === "lids" && h.size === cup.size, 0.3);
    return { title: "Lid on", text: `Drag a ${SIZE_LABEL[cup.size].toLowerCase()} lid onto the cup.`, gesture: from ? { kind: "drag", from, to: cupAt } : null };
  };

  /** Fries: scoop into a basket, lower, lift when golden, carton on the pad, fries in, salt, up to the tray. */
  const friesMove = (slotIdx: number): Show | null => {
    const s = k.game.slots[slotIdx];
    const o = s.order!;
    if (!o.fries || s.plate.fries || o.poutine) return null;
    const fry = o.fry ?? "fries";
    const name = FRY_LABEL[fry].toLowerCase();
    const size = SIZE_LABEL[o.friesSize].toLowerCase();
    if (c.page !== 2) return { ...goTo(2, `This order wants ${size} ${name}. The fryer is on the counter to the right.`) };
    const packI = c.packs.findIndex((p) => p.size === o.friesSize && p.fill > 0 && p.fry === fry) ;
    const pack = packI >= 0 ? c.packs[packI] : null;
    const packAt = (i: number) => k.project("counter", new THREE.Vector3(c.packs[i].x, c.packs[i].y + 0.4, c.packs[i].z));
    const plate = plateAt(slotIdx);
    if (pack && pack.fill >= 0.95) {
      if ((pack.salt ?? 0) < SALT.low && (fry === "fries" || fry === "sweet")) {
        const from = proxy((h) => h.type === "shaker" && !h.sugar, 0.4);
        return { title: "Salt", text: `Pick up the salt and shake it over the ${name}. Stop at the line on the bar.`, gesture: from ? { kind: "dragCircle", from, to: packAt(packI), r: 14 } : null, whileDown: true };
      }
      return { title: "Up they go", text: `Drag the carton up to the tray.`, gesture: { kind: "drag", from: packAt(packI), to: plate } };
    }
    const bi = c.baskets.findIndex((b) => b.loaded && !b.shell && b.fry === fry);
    const b = bi >= 0 ? c.baskets[bi] : null;
    const basketAt = (i: number) => k.project("counter", c.fryTagPoint(i));
    const basketProxy = (i: number) => proxy((h) => h.type === "basket" && h.idx === i, 0.3) ?? basketAt(i);
    const portion = FRIES_PORTION[o.friesSize];
    if (!b || (!b.down && b.cook < 0.05 && b.amount + 1e-6 < portion)) {
      const free = b ? bi : c.baskets.findIndex((x) => !x.loaded);
      if (free < 0) return null;
      const from = fry === "fries" ? proxy((h) => h.type === "friesBin", 0.3) : proxy((h) => h.type === "fryBin" && h.fry === fry, 0.3);
      const scoops = Math.round(portion / FRIES_SCOOP);
      const have = b ? Math.round(b.amount / FRIES_SCOOP) : 0;
      return {
        title: `${SIZE_LABEL[o.friesSize]} ${name}`,
        text: `Drag frozen ${name} into a basket: one scoop for a small, two for a medium, three for a large.${have ? ` ${have} of ${scoops} so far.` : ""}`,
        gesture: from ? { kind: "drag", from, to: basketProxy(free) } : null,
      };
    }
    const zone = friesZone(b.cook, fry);
    if (!b.down && zone === "under") return { title: "Into the oil", text: "Tap the basket to lower it into the oil.", gesture: { kind: "tap", at: basketProxy(bi) } };
    if (b.down && zone === "under") return { title: "Frying", text: "Watch the meter: they're done when the fill reaches the hatched middle band.", ring: ringAround(basketAt(bi), 120, 60) };
    if (b.down) return { title: "Golden!", text: "Tap the basket to lift it out of the oil.", gesture: { kind: "tap", at: basketProxy(bi) } };
    const emptyPack = c.packs.findIndex((p) => p.size === o.friesSize && p.fill < 0.95);
    if (emptyPack < 0) {
      const si = c.stacks.findIndex((st) => st.kind === "carton" && st.size === o.friesSize);
      const from = proxy((h) => h.type === "stack" && h.idx === si, 0.3);
      const pad = c.packs.findIndex((p) => !p.size);
      const to = pad >= 0 ? proxy((h) => h.type === "pack" && h.idx === pad, 0.2) : null;
      return { title: "A carton", text: `Grab a ${size} carton and set it on the pad.`, gesture: from && to ? { kind: "drag", from, to } : null };
    }
    return { title: "Fill it", text: `Drag the ${name} from the basket into the carton.`, gesture: { kind: "drag", from: basketProxy(bi), to: packAt(emptyPack) } };
  };

  /** Everything on the tray and nothing wrong: hand it over. */
  const serveMove = (slotIdx: number): Show | null => {
    const s = k.game.slots[slotIdx];
    const o = s.order!;
    const pr = progress(o, s.plate);
    if (pr.wrong >= 0 || pr.next < pr.want.length) return null;
    if ((o.drink && !s.plate.drink) || (o.fries && !s.plate.fries)) return null;
    const at = plateAt(slotIdx);
    const btn = rectOf(document.querySelectorAll<HTMLElement>(".tray-serve")[slotIdx] ?? null);
    if (btn) return { title: "Order up!", text: "Everything's on the tray. Tap Serve to hand it over.", gesture: { kind: "tap", at: { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 } } };
    return { title: "Order up!", text: "Everything's on the tray. Swipe the tray up to hand it over.", gesture: { kind: "swipe", from: { x: at.x, y: at.y + 10 }, to: { x: at.x, y: at.y - 110 } } };
  };

  /** One of the first shift's guided orders is being worked on (not while a sauce is mid-squeeze elsewhere). */
  const guided = (n: number) => {
    const s = activeSlot(k);
    return playing() && !!s && s.lesson === n && grill();
  };
  const sideFirst = (slotIdx: number) => {
    // The burger first, then the sides; but once the player is at the drinks or the fryer, help there.
    const s = k.game.slots[slotIdx];
    const pr = progress(s.order!, s.plate);
    return pr.wrong < 0 && pr.next >= pr.want.length;
  };
  const guide = (slotIdx: number): Show | null => {
    const s = k.game.slots[slotIdx];
    const o = s.order!;
    if (c.page === 0 && o.drink && !s.plate.drink) return drinkMove(slotIdx);
    if (c.page === 2 && o.fries && !s.plate.fries) return friesMove(slotIdx);
    return burgerMove(slotIdx) ?? (sideFirst(slotIdx) ? (drinkMove(slotIdx) ?? friesMove(slotIdx) ?? serveMove(slotIdx)) : null);
  };

  return [
    // --- The very first order: what the ticket says.
    {
      id: "first-ticket",
      once: true,
      when: () => guided(0) && !!ticket(),
      done: () => okDone("first-ticket") || (activeSlot(k)?.plate.layers.length ?? 0) > 0 || c.grillItems.length > 0,
      show: () => ({
        title: "Your first customer!",
        text: "Their order is on the ticket. Burgers are built from the bottom up: the highlighted line is what goes on next.",
        ring: ticket(),
        ok: "Let's cook",
        place: "bottom",
      }),
    },
    // --- The bell: someone is waiting and there's room at the window.
    {
      id: "bell",
      once: true,
      when: () => {
        if (!playing() || k.holding() || k.sauce()) return false;
        // Only while someone is being served (an empty window calls the next person up by itself).
        const busy = k.game.slots.filter((s) => s.order && !s.leaving).length;
        const at = k.game.slots.filter((s) => s.order || s.fig).length;
        return k.game.line.length > 0 && busy >= 1 && at < k.windowCap();
      },
      done: () => k.counts.bell > 0,
      show: () => ({
        title: "Ring the bell",
        text: "Someone's waiting in line: the number on the bell. Ring it to call them up to the window. More orders at once means more money.",
        gesture: tapOn(k.bell),
        place: "bottom",
      }),
    },
    // --- Two tickets on the rail: fold the big one, then open one again.
    {
      id: "ticket-fold",
      once: true,
      when: () => playing() && !k.holding() && !k.sauce() && k.game.slots.filter((s) => s.order && !s.leaving).length >= 2 && k.ticketOpen() && !!ticket(),
      done: () => k.counts.folds > 0,
      show: () => ({
        title: "Two orders",
        text: "Tap the big ticket to fold it. Folded, you can see both orders side by side.",
        gesture: tapOn(k.tickets.find((t) => !t.hidden && t.dataset.mode === "big") ?? null),
        place: "bottom",
      }),
    },
    {
      id: "ticket-open",
      once: true,
      when: () => playing() && !k.holding() && !k.sauce() && k.counts.folds > 0 && !k.ticketOpen() && k.game.slots.filter((s) => s.order && !s.leaving).length >= 2,
      done: () => k.counts.opens > 0,
      show: () => {
        // Back to the order they were on; tapping any other opens that one instead.
        const mine = k.tickets[k.game.active];
        const t = mine && !mine.hidden ? mine : (k.tickets.find((x) => !x.hidden) ?? null);
        return {
          title: "Pick an order",
          text: "Tap a ticket to open it and work on that order. The tray with the blue outline is the one you're building.",
          gesture: tapOn(t),
          place: "bottom",
        };
      },
    },
    // --- New things, the first time an order needs them.
    {
      id: "drinks",
      once: true,
      when: () => {
        const s = activeSlot(k);
        return playing() && !!s?.order?.drink && !s.plate.drink && grill() && (c.page === 0 || sideFirst(k.game.active));
      },
      done: () => k.game.slots.some((s) => !!s.plate.drink?.lid),
      show: () => drinkMove(k.game.active),
    },
    {
      id: "fries",
      once: true,
      when: () => {
        const s = activeSlot(k);
        return playing() && !!s?.order?.fries && !s.order.poutine && !s.plate.fries && (c.page === 2 || sideFirst(k.game.active) || c.baskets.some((b) => b.loaded));
      },
      done: () => k.game.slots.some((s) => !!s.plate.fries),
      show: () => friesMove(k.game.active),
    },
    ...(["egg", "toast", "melt", "sauce", "smash"] as const).map(
      (only): Step => ({
        id: `first-${only}`,
        once: true,
        when: () => playing() && !!activeSlot(k) && !!burgerMove(k.game.active, only),
        done: () =>
          k.game.slots.some((s) =>
            s.plate.layers.some((l, i) =>
              only === "egg"
                ? l.piece.kind === "egg"
                : only === "toast"
                  ? l.piece.kind === "bun" && isToasted(l.piece)
                  : only === "melt"
                    ? l.piece.kind === "cheese" && isMelted(l.piece)
                    : only === "smash"
                      ? !!l.piece.smashed
                      : isSauce(l.piece.kind) && i > 0,
            ),
          ),
        show: () => burgerMove(k.game.active, only),
      }),
    ),
    {
      id: "sent-back",
      once: true,
      when: () => playing() && k.game.slots.some((s) => s.sentBack && s.order && !s.leaving),
      done: () => !k.game.slots.some((s) => s.sentBack && s.order && !s.leaving) && okDone("sent-back"),
      show: () => {
        const i = k.game.slots.findIndex((s) => s.sentBack && s.order && !s.leaving);
        const note = rectOf(document.querySelectorAll<HTMLElement>(".sentback")[i] ?? null);
        return {
          title: "Sent back",
          text: "They want something fixed: it's in the red note. Fix the tray (drag a wrong layer down off it into the trash), then tap Serve again.",
          ring: note,
          ok: "OK",
          place: "bottom",
        };
      },
    },
    // --- The first shift's guided orders.
    { id: "guide-0", when: () => guided(0), show: () => guide(k.game.active) },
    { id: "guide-1-side", when: () => guided(1) && (c.page !== HOME_PAGE || sideFirst(k.game.active)), show: () => guide(k.game.active) },
    { id: "guide-1", when: () => guided(1), idle: 3.5, show: () => guide(k.game.active) },
    { id: "guide-2", when: () => guided(2), idle: 6, show: () => guide(k.game.active) },
    {
      id: "back-to-grill",
      once: true,
      when: () => playing() && grill() && c.page !== HOME_PAGE && !k.holding() && k.game.slots.some((s) => s.order && !s.leaving && progress(s.order, s.plate).next < progress(s.order, s.plate).want.length) && k.game.slots.every((s) => !s.order || s.leaving || ((!s.order.drink || !!s.plate.drink) && (!s.order.fries || !!s.plate.fries))),
      done: () => c.page === HOME_PAGE,
      show: () => goTo(HOME_PAGE, "Back to the grill."),
    },
  ];
}

/** Every lesson, in the order they take priority. */
export function lessons(w: CoachWorld): Step[] {
  // In the truck the card keeps clear of the tickets: they're what the player is reading.
  const kitchen = lessonStepsKitchen(w).map((st): Step => ({
    ...st,
    show: () => {
      const sh = st.show();
      if (!sh) return null;
      const tickets = w.kitchen.tickets.filter((t) => !t.hidden).map(rectOf).filter((b): b is Box => !!b);
      return { ...sh, avoid: [...(sh.avoid ?? []), ...tickets] };
    },
  }));
  return [...mapSteps(w), ...kitchen];
}
