/**
 * The guided first order at the panini press, the comal and the deck oven (DESIGN §48). The grill
 * has its guided first shift (lessons.ts); each later kitchen gets one order talked through the
 * first time the truck cooks on it (game/guided.ts says when). The clock waits until it's served,
 * and the coach shows one move at a time, read from what is on the counter right now, so a player
 * who does things in another order (or builds on the tray) still gets the right next move.
 *
 *   Press  Caprese: bread in a bay, pesto, the fillings, the top bread, handle down, wait for
 *          golden, handle up, out to the tray, Serve.
 *   Comal  Street Tacos: tortillas on the hot side, warm, into the rack, a scoop of pork each, the
 *          toppings once, the rack up to the tray, Serve.
 *   Oven   Harvest Red: dough on the peel, ladle the sauce, mozzarella, the peel into the oven and a
 *          flick down, wait, push the blade in under the pie, the peel over the tray and a flick
 *          down, basil, Serve.
 *
 * Anchors come from the counters' hit proxies and their own world points (bays, rack, peel, oven
 * spots), so they follow the layout.
 */
import * as THREE from "three";
import { cookLevel, COOK_SCALE, isMelted, isToasted, paleSide } from "../game/cooking";
import type { NewKitchen } from "../game/guided";
import { sauceCoverage, sauceVerdict } from "../game/scoring";
import { BREADS, COUNTED, isSauce, KIND_LABEL, PRESS_CHEESE, TORTILLAS, type Kind, type Order, type SauceKind } from "../game/types";
import { HOME_PAGE, type CounterView, type GrillItem } from "../scenes/counter";
import { okDone, type Box, type Gesture, type Pt, type Show, type Step } from "./coach";
import type { CoachWorld, KitchenSlot } from "./lessons";

const rectOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const mid = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const label = (k: Kind) => KIND_LABEL[k].toLowerCase();
const ringAround = (p: Pt, w = 120, h = 70): Box => ({ x: p.x - w / 2, y: p.y - h / 2, w, h });
/** How far a flick goes, px. */
const FLICK = 48;

const NAME: Record<NewKitchen, string> = { press: "press", comal: "comal", oven: "oven" };
const INTRO: Record<NewKitchen, { title: string; text: string }> = {
  press: { title: "The panini press", text: "A new kitchen. The press cooks both sides at once under its lid. This first order waits for you: follow the thumb one move at a time." },
  comal: { title: "The comal", text: "A new kitchen. The comal is a long hot plate, with a taco rack on its warm end. This first order waits for you: follow the thumb one move at a time." },
  oven: { title: "The deck oven", text: "A new kitchen. Pies are built on the peel, and only the peel moves them. This first order waits for you: follow the thumb one move at a time." },
};
const AFTER: Record<NewKitchen, string> = {
  press: "That's the press. From here the clock runs. The other paninis are in Today's Menu, and How to Play shows each one.",
  comal: "That's the comal. From here the clock runs. The quesadilla and the rest are in Today's Menu, and How to Play shows each one.",
  oven: "That's the oven. Turning a pie halfway with the peel's tip bakes it evenly, for a bit more. From here the clock runs.",
};

export function counterLessons(w: CoachWorld): Step[] {
  const k = w.kitchen;
  const c: CounterView = k.counter;
  const playing = () => w.phase() === "playing";
  /** The guided order's slot at this kitchen, or -1. */
  const slotOf = (m: NewKitchen): number => (playing() && k.game.guide === m && c.middle === m ? k.game.slots.findIndex((s) => !!s.order && !s.leaving && s.lesson === 0) : -1);

  const project = (v: THREE.Vector3) => k.project("counter", v);
  const proxy = (match: Parameters<CounterView["proxyPoint"]>[0], y = 0): Pt | null => {
    const v = c.proxyPoint(match);
    if (!v) return null;
    v.y += y;
    const p = project(v);
    const band = k.counterBand();
    return p.x > band.x + 4 && p.x < band.x + band.w - 4 && p.y > band.y && p.y < band.y + band.h ? p : null;
  };
  const bin = (kind: Kind) => proxy((h) => h.type === "bin" && h.kind === kind);
  const bottle = (kind: SauceKind) => proxy((h) => h.type === "bottle" && h.sauce === kind);
  const plateAt = (i: number): Pt => {
    const b = k.trayView.plates[i].burger;
    b.updateWorldMatrix(true, false);
    const e = b.matrixWorld.elements;
    return k.project("tray", new THREE.Vector3(e[12], 0.3, e[14]));
  };
  const serveBtn = (i: number): Pt | null => {
    const b = rectOf(document.querySelectorAll<HTMLElement>(".tray-serve")[i] ?? null);
    return b ? mid(b) : null;
  };
  const serve = (i: number): Show | null => {
    const at = serveBtn(i);
    return at ? { title: "Order up!", text: "Everything's on the tray. Tap Serve to hand it over.", gesture: { kind: "tap", at } } : null;
  };
  const ticket = (): Box | null => rectOf(k.tickets.find((t) => !t.hidden && t.dataset.mode === "big") ?? null);
  /** Back to the middle counter, if the player has swiped away from it. */
  const home = (m: NewKitchen): Show | null => {
    if (c.page === HOME_PAGE) return null;
    const t = c.trashPoint();
    const a = project(new THREE.Vector3(t.x, 0.3, t.z));
    const band = k.counterBand();
    const right = HOME_PAGE > c.page;
    return {
      title: `Back to the ${NAME[m]}`,
      text: `This order is made at the ${NAME[m]}. Swipe along the belt at the bottom, or tap its button.`,
      gesture: { kind: "swipe", from: { x: band.x + band.w * (right ? 0.68 : 0.32), y: a.y }, to: { x: band.x + band.w * (right ? 0.32 : 0.68), y: a.y } },
      ring: rectOf(k.tabs[HOME_PAGE] ?? null),
    };
  };
  /** Sauce drawn in a close-up: circles over its middle (the line lands a little above the fingertip). */
  const drawIn = (z: { x: number; y: number; r: number }, title: string, text: string): Show => ({
    title,
    text,
    gesture: { kind: "circle", at: { x: z.x, y: z.y + 34 - z.r * 0.3 }, r: z.r * 0.3 },
    whileDown: true,
    place: "top",
  });
  const undo = (): Show => {
    const r = rectOf(k.undoButton);
    return { title: "Oops, not that", text: "That isn't next on the ticket. Tap Undo, top left, to take it back.", gesture: r ? { kind: "tap", at: mid(r) } : null };
  };
  /** Ordered layers one piece at a time (two tomato slices are two entries). */
  const expand = (o: Order) => o.layers.flatMap((l, at) => Array.from({ length: l.count ?? 1 }, () => ({ kind: l.kind, at })));
  /** Pieces of a kind, and how many the ticket wants (kinds that aren't counted want one). */
  const wantOf = (o: Order, kind: Kind) => {
    const l = o.layers.find((x) => x.kind === kind);
    return l ? (COUNTED.has(kind) ? (l.count ?? 1) : 1) : 0;
  };
  const countIn = (ls: { piece: { kind: Kind } }[], kind: Kind) => ls.filter((l) => l.piece.kind === kind).length;

  // ---------------------------------------------------------------- the press

  const pressMove = (i: number): Show | null => {
    const s = k.game.slots[i];
    const o = s.order!;
    const done = serve(i);
    if (done) return done;
    const away = home("press");
    if (away) return away;
    const want = expand(o);
    // Where the sandwich is being built: a bay (the one mapped to this tray, or whichever has food), or the tray.
    const bays = c.bays.slice(0, c.bayCount);
    let bi = bays.findIndex((b) => b.layers.length > 0);
    const onTray = s.plate.layers.length > 0;
    if (bi < 0) bi = i < bays.length && !bays[i].closed ? i : bays.findIndex((b) => !b.closed);
    if (bi < 0) bi = 0;
    const bay = bays[bi];
    const bayAt = project(c.bayPoint(bi));
    const handleAt = project(c.handlePoint(bi));
    const ls = onTray && !bay.layers.length ? s.plate.layers : bay.layers;
    const target = onTray && !bay.layers.length ? plateAt(i) : bayAt;
    const got = ls.map((l) => l.piece.kind);
    const wrong = got.findIndex((g, j) => want[j]?.kind !== g);
    if (wrong >= 0) return undo();
    const bread = ls.find((l) => BREADS.has(l.piece.kind))?.piece;
    const level = bread ? cookLevel(bread) : 0;
    const sc = COOK_SCALE.ciabatta;
    const cheeseOk = ls.every((l) => !PRESS_CHEESE.has(l.piece.kind) || isMelted(l.piece));
    const pressed = !!bread && isToasted(bread);

    if (bay.layers.length && bay.closed) {
      const tag = project(c.bayTagPoint(bi));
      if (level >= sc.over) return { title: "Quick!", text: "It's getting dark. Swipe the handle up to lift the lid now.", gesture: { kind: "swipe", from: handleAt, to: { x: handleAt.x, y: handleAt.y - 70 } }, urgent: true };
      if (level < sc.done || (!cheeseOk && level < sc.perfect))
        return { title: "Pressing", text: "Both sides cook at once. Watch the meter on the lid: it's golden when the fill reaches the hatched band, and the cheese melts inside.", ring: ringAround(tag, 120, 60) };
      return { title: "Golden!", text: "Swipe the handle up to lift the lid.", gesture: { kind: "swipe", from: handleAt, to: { x: handleAt.x, y: handleAt.y - 70 } } };
    }
    // Everything's in: press it, or once pressed, out to the tray.
    if (got.length >= want.length) {
      if (bay.layers.length && pressed) return { title: "Out it comes", text: "Drag the panini out of the bay, up to the tray.", gesture: { kind: "drag", from: { x: bayAt.x, y: bayAt.y + 4 }, to: plateAt(i) } };
      if (bay.layers.length) return { title: "Press it", text: "Pull the handle down to close the lid.", gesture: { kind: "swipe", from: handleAt, to: { x: handleAt.x, y: handleAt.y + 70 } } };
      // Built on the tray: lift the whole sandwich into an open bay.
      return { title: "Into the press", text: "Drag down from the tray to lift the whole sandwich into an open bay.", gesture: { kind: "drag", from: plateAt(i), to: bayAt } };
    }
    const next = want[got.length];
    const exp = o.layers[next.at];
    if (isSauce(next.kind)) {
      const sk = next.kind as SauceKind;
      const sauce = k.sauce();
      const z = k.closeUp?.();
      if (sauce?.locked && z) return drawIn(z, KIND_LABEL[sk], `Draw it on: press, then move your finger round over the bread. Lift it when the bar says Perfect.`);
      if (sauce?.locked) return drawIn(k.sauceCentre(), KIND_LABEL[sk], "Draw it on: press, then move your finger round over the bread. Lift it when the bar says Perfect.");
      if (sauce?.armed) return { title: KIND_LABEL[sk], text: "Now tap the bread to put it on.", gesture: { kind: "tap", at: target } };
      const from = bottle(sk);
      return { title: KIND_LABEL[sk], text: `Tap the ${label(sk)} bottle, then tap the bread.`, gesture: from ? { kind: "tap", at: from } : null };
    }
    // A sauce only just started: a little more if it's very thin.
    const top = ls[ls.length - 1]?.piece;
    if (top && isSauce(top.kind) && top.stroke && sauceVerdict(sauceCoverage(top.stroke), top.kind).word === "stingy") {
      const from = bottle(top.kind as SauceKind);
      return { title: "A bit more", text: `That's very thin. Tap the ${label(top.kind)} bottle and the bread again, and draw a little more.`, gesture: from ? { kind: "tap", at: from } : null };
    }
    const from = bin(next.kind);
    const n = exp.count ?? 1;
    const have = got.length - want.findIndex((x) => x.at === next.at);
    const text = BREADS.has(next.kind)
      ? got.length === 0
        ? `Drag a ${label(next.kind)} into the open bay: the panini is built right there in the press.`
        : `The top ${label(next.kind)} closes the sandwich.`
      : n > 1
        ? `${KIND_LABEL[next.kind]} ×${n}: drag ${have ? "one more" : "one"} onto the bread. ${have} of ${n}.`
        : `Drag the ${label(next.kind)} on.`;
    return { title: BREADS.has(next.kind) ? (got.length === 0 ? "Bread first" : "Top bread") : KIND_LABEL[next.kind], text, gesture: from ? { kind: "drag", from, to: target } : null };
  };

  // ---------------------------------------------------------------- the comal

  /** Free places on the hot side for tortillas, page-local, two rows across the two hot thirds. */
  const hotSpot = (): Pt | null => {
    const z0 = c.zonePoint(0);
    const z1 = c.zonePoint(1);
    // Left to right along the hot two thirds, a tortilla's width apart, then a second row in front.
    const cands: [number, number][] = [];
    for (const z of [z0.z, z0.z + 0.95]) for (let x = z0.x - 0.5; x <= z1.x + 0.45; x += 1.0) cands.push([x, z]);
    const items = c.grillItems.map((g) => g.obj.getWorldPosition(new THREE.Vector3()));
    for (const [x, z] of cands) if (items.every((p) => Math.hypot(p.x - x, p.z - z) > 0.95)) return project(new THREE.Vector3(x, z0.y, z));
    return null;
  };
  const itemAt = (g: GrillItem): Pt => project(g.obj.getWorldPosition(new THREE.Vector3()));

  const comalMove = (i: number): Show | null => {
    const s = k.game.slots[i];
    const o = s.order!;
    const done = serve(i);
    if (done) return done;
    const base = o.layers[0]?.kind;
    if (!base || !TORTILLAS.has(base)) return null;
    const plate = plateAt(i);
    const rack = c.rack.layers;
    const onPlate = s.plate.layers;
    // Up on the tray already: anything still missing goes on there (sauces and toppings).
    if (onPlate.length && !rack.length) {
      for (const l of o.layers.slice(1)) {
        if (countIn(onPlate, l.kind) >= wantOf(o, l.kind)) continue;
        if (isSauce(l.kind)) return null;
        const from = bin(l.kind);
        return { title: KIND_LABEL[l.kind], text: `Drag the ${label(l.kind)} onto the tacos.`, gesture: from ? { kind: "drag", from, to: plate } : null };
      }
      return null;
    }
    const away = home("comal");
    if (away) return away;
    const W = wantOf(o, base);
    const onComal = c.grillItems.filter((g) => g.piece.kind === base && !g.held && !g.piece.folded);
    const have = onComal.length + countIn(rack, base) + countIn(onPlate, base);
    const sc = COOK_SCALE[base as "corn"];
    const rackAt = project(c.rackPoint());
    if (have < W) {
      const from = bin(base);
      const to = hotSpot();
      return {
        title: "Tortillas",
        text: `${W} tacos, so ${W} tortillas. Drag one onto the hot side of the comal, on the left.${have ? ` ${have} of ${W}.` : ""}`,
        gesture: from && to ? { kind: "drag", from, to } : null,
      };
    }
    if (onComal.length) {
      const hard = onComal.find((g) => cookLevel(g.piece) >= sc.over);
      if (hard) return { title: "Quick!", text: "That one's going hard. Drag it by its middle into the rack now.", gesture: { kind: "drag", from: itemAt(hard), to: rackAt }, urgent: true };
      const warm = onComal.filter((g) => cookLevel(g.piece) >= sc.done).sort((a, b) => cookLevel(b.piece) - cookLevel(a.piece))[0];
      if (warm)
        return {
          title: "Warm!",
          text: rack.some((l) => TORTILLAS.has(l.piece.kind)) ? "Drag the next warm one into the rack, by its middle." : "Soft and spotted: it's warm. Drag it by its middle into the taco rack on the warm end. Tacos are filled there.",
          gesture: { kind: "drag", from: itemAt(warm), to: rackAt },
        };
      const first = onComal.sort((a, b) => cookLevel(b.piece) - cookLevel(a.piece))[0];
      return { title: "Warming", text: "Watch the meter under each tortilla: it's warm when the fill reaches the hatched band and the chip says Warm.", ring: ringAround(itemAt(first), 130, 80) };
    }
    // Every tortilla is in the rack: the fillings, then up to the tray.
    for (const l of o.layers.slice(1)) {
      if (isSauce(l.kind)) continue;
      const n = wantOf(o, l.kind);
      const got = countIn(rack, l.kind) + countIn(onPlate, l.kind);
      if (got >= n) continue;
      const from = bin(l.kind);
      const scoop = l.kind === "pork" || l.kind === "beans";
      const text = scoop
        ? `One drag from the ${label(l.kind)} well is one scoop into one taco. ${got} of ${n}.`
        : l.kind === "lime"
          ? "Drag a lime wedge in. It sits beside the tacos."
          : `Drag the ${label(l.kind)} in once: it goes over every taco in the rack.`;
      return { title: KIND_LABEL[l.kind], text, gesture: from ? { kind: "drag", from, to: rackAt } : null };
    }
    return { title: "Up to the tray", text: "All filled. Drag the whole rack up to the tray.", gesture: { kind: "drag", from: rackAt, to: plate } };
  };

  // ---------------------------------------------------------------- the oven

  /** Where the finger goes for the peel's blade to sit centred over a world point (x, z): its handle, as it lies at home. */
  const handleFor = (x: number, z: number): Pt => {
    const h = c.peelHandleWorld();
    const p = c.peelPointWorld();
    return project(new THREE.Vector3(x + (h.x - p.x), h.y, z + (h.z - p.z)));
  };
  const flickDown = (from: Pt, to: Pt): Gesture => ({ kind: "dragSwipe", from, to, end: { x: to.x, y: to.y + FLICK } });

  const ovenMove = (i: number): Show | null => {
    const s = k.game.slots[i];
    const o = s.order!;
    const done = serve(i);
    if (done) return done;
    const plate = plateAt(i);
    // On the tray: what goes on after the oven.
    if (s.plate.layers[0]?.piece.kind === "dough") {
      for (const l of o.layers) {
        if (!l.after || countIn(s.plate.layers, l.kind) >= wantOf(o, l.kind)) continue;
        const from = bin(l.kind);
        return { title: KIND_LABEL[l.kind], text: `${KIND_LABEL[l.kind]} goes on after the oven, at the tray, so it stays fresh. Drag it on.`, gesture: from ? { kind: "drag", from, to: plate } : null };
      }
      return null;
    }
    const away = home("oven");
    if (away) return away;
    // The peel in hand: the gesture is under way, so the coach stays out of the way.
    if (c.peelHeld) return null;
    const handle = project(c.peelHandleWorld());
    const spots = c.ovenSpots.slice(0, c.ovenCount);
    const si = spots.findIndex((p) => p.layers.length > 0);
    if (si >= 0) {
      const d = spots[si].layers[0].piece;
      const pale = paleSide(d);
      const sc = COOK_SCALE.dough;
      const sp = c.spotPoint(si);
      const tag = project(c.spotTagPoint(si));
      const lift = handleFor(sp.x, sp.z);
      if (pale < sc.done) return { title: "Baking", text: "The meter shows the crust's palest side. It's done when the fill reaches the hatched band.", ring: ringAround(tag, 120, 56) };
      return {
        title: pale >= sc.over ? "Quick!" : "Done!",
        text: "Lift it out: press the peel's handle and push the blade straight in under the pie. Then let go: the peel comes back with it.",
        gesture: { kind: "drag", from: handle, to: lift },
        urgent: pale >= sc.over,
      };
    }
    const pie = c.peel.layers;
    const dough = pie[0]?.piece;
    if (!dough) {
      const rest = c.rest.layers;
      if (rest.length) {
        const r = c.restPoint();
        return { title: "Onto the peel", text: "Push the peel's blade in under the pie to lift it.", gesture: { kind: "drag", from: handle, to: handleFor(r.x, r.z) } };
      }
      return { title: "Dough first", text: "Drag a dough base onto the peel. The pie is built right there.", gesture: { kind: "drag", from: project(c.doughPoint()), to: project(c.peelPointWorld()) } };
    }
    const peelAt = project(c.peelPointWorld());
    if (paleSide(dough) >= 0.12) return { title: "Up to the tray", text: "Press the peel's handle, carry the pie up over the tray, and flick down to set it there.", gesture: flickDown(handle, plate) };
    // Being built on the peel.
    const zone = k.closeUp?.();
    if (k.ladling?.() && zone) return drawIn(zone, "Spread it", "Spread the sauce in a spiral, from the middle out to just inside the crust. Lift your finger when the bar says Perfect.");
    for (const l of o.layers.slice(1)) {
      if (l.after) continue;
      if (isSauce(l.kind)) {
        const sauce = pie.find((x) => x.piece.kind === l.kind)?.piece;
        if (sauce && sauceVerdict(sauceCoverage(sauce.stroke), l.kind).word !== "stingy") continue;
        const final = k.closeUpFinal?.();
        const from = l.kind === "redsauce" ? proxy((h) => h.type === "pot") : bottle(l.kind as SauceKind);
        const to = final ? { x: final.x, y: final.y + 34 } : peelAt;
        return {
          title: sauce ? "A bit more" : l.kind === "redsauce" ? "The sauce" : KIND_LABEL[l.kind],
          text: l.kind === "redsauce" ? "Press the ladle in the pot and keep your finger down: a close-up opens over the base. Spread it round from the middle out." : `Press the ${label(l.kind)} bottle and keep your finger down: a close-up opens. Drizzle it round over the base.`,
          gesture: from ? { kind: "dragCircle", from, to, r: (final?.r ?? 60) * 0.3 } : null,
        };
      }
      const n = wantOf(o, l.kind);
      const got = countIn(pie, l.kind);
      if (got >= n) continue;
      const from = bin(l.kind);
      return { title: KIND_LABEL[l.kind], text: n > 1 ? `${KIND_LABEL[l.kind]} ×${n}: drag one at a time onto the pie. ${got} of ${n}.` : `Drag the ${label(l.kind)} onto the pie.`, gesture: from ? { kind: "drag", from, to: peelAt } : null };
    }
    // Built: into the oven.
    const free = spots.findIndex((p) => !p.layers.length);
    if (free < 0) return null;
    const sp = c.spotPoint(free);
    return {
      title: "Into the oven",
      text: "Press the peel's handle, carry the pie over a free spot in the oven, and flick down to slide it off.",
      gesture: flickDown(handle, handleFor(sp.x, sp.z)),
    };
  };

  const MOVE: Record<NewKitchen, (i: number) => Show | null> = { press: pressMove, comal: comalMove, oven: ovenMove };
  const started = (m: NewKitchen, s: KitchenSlot): boolean =>
    s.plate.layers.length > 0 || (m === "press" ? c.bays.some((b) => b.layers.length > 0) : m === "comal" ? c.grillItems.length > 0 || c.rack.layers.length > 0 : c.peel.layers.length > 0);

  return (["press", "comal", "oven"] as const).flatMap((m): Step[] => [
    {
      id: `${m}-intro`,
      once: true,
      when: () => slotOf(m) >= 0 && !!ticket(),
      done: () => okDone(`${m}-intro`) || (slotOf(m) >= 0 && started(m, k.game.slots[slotOf(m)])),
      show: () => ({ ...INTRO[m], ring: ticket(), ok: "Let's cook", place: "bottom" }),
    },
    // Learned when the order is served (main.ts marks it), so a shift left half way teaches it again.
    { id: `guided-${m}`, once: true, when: () => slotOf(m) >= 0, show: () => MOVE[m](slotOf(m)) },
    {
      id: `${m}-after`,
      once: true,
      when: () => playing() && k.game.guided === m && c.middle === m && !k.holding(),
      done: () => okDone(`${m}-after`),
      show: () => ({ title: "Your kitchen now", text: AFTER[m], ok: "Got it", place: "bottom" }),
    },
  ]);
}
