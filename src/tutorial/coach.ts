/**
 * Tutorial mode: a see-through thumb that shows the next move, with a short card saying what it
 * does. It goes beyond the black tips: it points at the real thing on screen (a button, a pan, a
 * tray), acts the gesture out (a tap shrinks and dips; a swipe or a drag presses, travels and lets
 * go) and waits until the player has done it.
 *
 * The coach never blocks a tap: its layer lets every touch through, so the game always plays on
 * even if a step can't find what it points at (it then shows only its card).
 *
 * Steps are plain objects (see lessons.ts): `when` says a step applies right now, `show` says
 * what to show. The first step that applies wins. A step marked `once` is remembered as learned
 * when its `done` turns true, and never shows again.
 *
 * On by default; the switch is in Settings (and on the welcome card). Turning it back on forgets
 * what was learned, so every lesson plays again.
 */
import "./coach.css";

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Gesture =
  /** Shrink and dip a little: a tap. */
  | { kind: "tap"; at: Pt }
  /** Press, carry slowly to `to`, let go: drag something there. */
  | { kind: "drag"; from: Pt; to: Pt }
  /** Press, flick quickly towards `to`, let go. */
  | { kind: "swipe"; from: Pt; to: Pt }
  /** Press and stay pressed. */
  | { kind: "hold"; at: Pt }
  /** Press, then keep moving in circles (sauce). */
  | { kind: "circle"; at: Pt; r: number }
  /** Press, carry to `to`, then circle there before letting go (sauce from the bottle). */
  | { kind: "dragCircle"; from: Pt; to: Pt; r: number };

export interface Show {
  /** Short line in bold. */
  title?: string;
  text: string;
  gesture?: Gesture | null;
  /** A ring around something to look at (a meter, the bell, a ticket). */
  ring?: Box | null;
  /** Keep the card clear of these (the ticket being read, say). */
  avoid?: Box[];
  /** Where the card goes: next to the gesture (auto), or pinned to the top or bottom. */
  place?: "auto" | "top" | "bottom";
  /** An info step: a button on the card moves on. */
  ok?: string;
  /** Keep acting the gesture out while the player's finger is down (sauce circles). */
  whileDown?: boolean;
  /** Show it now even on a step that otherwise waits for the player to sit idle (something's about to burn). */
  urgent?: boolean;
}

export interface Step {
  id: string;
  /** Remembered as learned once `done` is true. */
  once?: boolean;
  when(): boolean;
  done?(): boolean;
  show(): Show | null;
  /** Seconds the player must sit idle before it shows (a nudge rather than a lesson). */
  idle?: number;
}

const KEY = "bv-coach";

interface Stored {
  on: boolean;
  done: string[];
  /** Nothing was stored yet: the first visit with tutorial mode in the game. */
  fresh?: boolean;
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>;
      return { on: s.on !== false, done: Array.isArray(s.done) ? s.done.filter((x) => typeof x === "string") : [] };
    }
  } catch {
    // Storage can be unavailable (private mode): the tutorial just runs for this visit.
  }
  return { on: true, done: [], fresh: true };
}

const state = load();
const learned = new Set(state.done);

function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: state.on, done: [...learned] }));
  } catch {
    // ignore
  }
}

/** Tutorial mode is on (the default). */
export const coachOn = (): boolean => state.on;

/** Turn tutorial mode on or off. Turning it on forgets what was learned, so the lessons play again. */
export function setCoachOn(on: boolean): void {
  if (on && !state.on) learned.clear();
  state.on = on;
  store();
  if (!on) hide();
}

export const isLearned = (id: string): boolean => learned.has(id);

/**
 * A trip that was already under way before tutorial mode existed: count every lesson as learned,
 * so a seasoned player isn't walked through the bell. Turning the switch off and on replays them.
 */
export function skipLessonsFor(veteran: boolean): void {
  if (!state.fresh) return;
  state.fresh = false;
  if (veteran) for (const s of steps) if (s.once) learned.add(s.id);
  store();
}
export function markLearned(id: string): void {
  if (learned.has(id)) return;
  learned.add(id);
  store();
}

// ---------------------------------------------------------------------------
// The overlay

let host: HTMLElement | null = null;
let thumb: HTMLElement;
let ripple: HTMLElement;
let card: HTMLElement;
let cardTitle: HTMLElement;
let cardText: HTMLElement;
let cardOk: HTMLButtonElement;
let ringEl: HTMLElement;
let trail: SVGSVGElement;
let trailPath: SVGPathElement;
let target: HTMLElement;

function ensureHost(): void {
  if (host) return;
  host = document.createElement("div");
  host.className = "coach";
  host.setAttribute("aria-live", "polite");
  host.innerHTML = `
    <svg class="coach-trail" aria-hidden="true"><path /></svg>
    <div class="coach-ring" hidden></div>
    <div class="coach-target" hidden></div>
    <div class="coach-ripple" aria-hidden="true"></div>
    <div class="coach-thumb" aria-hidden="true"></div>
    <div class="coach-card bv" hidden role="status">
      <b class="coach-title"></b>
      <p class="coach-text"></p>
      <button class="coach-ok bv-btn sm" hidden>Got it</button>
    </div>`;
  document.body.appendChild(host);
  thumb = host.querySelector(".coach-thumb")!;
  ripple = host.querySelector(".coach-ripple")!;
  card = host.querySelector(".coach-card")!;
  cardTitle = host.querySelector(".coach-title")!;
  cardText = host.querySelector(".coach-text")!;
  cardOk = host.querySelector(".coach-ok")!;
  ringEl = host.querySelector(".coach-ring")!;
  target = host.querySelector(".coach-target")!;
  trail = host.querySelector(".coach-trail")!;
  trailPath = trail.querySelector("path")!;
  cardOk.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current) okPressed.add(current.id);
  });
  // The card's button takes taps; nothing else in the coach does.
  cardOk.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function hide(): void {
  if (!host) return;
  thumb.style.opacity = "0";
  ripple.style.opacity = "0";
  card.hidden = true;
  ringEl.hidden = true;
  target.hidden = true;
  trailPath.setAttribute("d", "");
  shownText = "";
}

// ---------------------------------------------------------------------------
// The engine

let steps: Step[] = [];
let current: Step | null = null;
let since = 0;
let lastInput = -1e9;
let fingerDown = false;
let shownText = "";
/** Steps that have been on screen (only those can be marked learned). */
const seen = new Set<string>();
/** Info steps whose button was pressed. */
const okPressed = new Set<string>();
/** Something else (a modal) covers the screen: the coach waits. */
let paused: () => boolean = () => false;

/** Register the lessons and start the coach's own frame loop (it runs on the map as well as in a shift). */
export function startCoach(list: Step[], opts: { paused?: () => boolean } = {}): void {
  steps = list;
  if (opts.paused) paused = opts.paused;
  ensureHost();
  // Any touch counts as the player doing something; nudges wait for a quiet moment.
  window.addEventListener(
    "pointerdown",
    () => {
      lastInput = performance.now();
      fingerDown = true;
    },
    true,
  );
  const up = () => {
    lastInput = performance.now();
    fingerDown = false;
  };
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  requestAnimationFrame(loop);
}

/** An info step's button was pressed (lessons read this as their `done`). */
export const okDone = (id: string): boolean => okPressed.has(id);

/** What the coach shows right now, for the playtest bot: the step and its gesture (null while hidden). */
export function coachState(): { id: string; show: Show } | null {
  return current && lastShow && !card.hidden ? { id: current.id, show: lastShow } : null;
}
let lastShow: Show | null = null;

/** The coach is showing a card right now (the game hides its own tips meanwhile). */
export const coachShowing = (): boolean => !!host && !card.hidden;

/** The first step that applies and has something to show. */
function pick(): { step: Step; show: Show } | null {
  for (const s of steps) {
    if (s.once && learned.has(s.id)) continue;
    try {
      // A lesson counts as learned once it has been shown and the player has done it.
      if (s.done?.()) {
        if (s.once && seen.has(s.id)) markLearned(s.id);
        continue;
      }
      if (!s.when()) continue;
      const show = s.show();
      if (show) return { step: s, show };
    } catch {
      // A step that can't read the game right now just doesn't apply.
    }
  }
  return null;
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (!state.on || paused()) {
    current = null;
    hide();
    return;
  }
  const got = pick();
  const s = got?.step ?? null;
  if (s !== current) {
    current = s;
    if (s) seen.add(s.id);
    since = now;
    phase0 = now;
  }
  if (!got) {
    hide();
    return;
  }
  // A nudge waits for the player to sit still a while.
  const idle = got.step.idle ?? 0;
  if (idle && !got.show.urgent && (fingerDown || now - Math.max(since, lastInput) < idle * 1000)) {
    hide();
    return;
  }
  lastShow = got.show;
  draw(got.show, now);
}

/** When the current gesture's cycle started, so it restarts cleanly when the step changes. */
let phase0 = 0;
let gestureKey = "";

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, eased between. */
const span = (u: number, a: number, b: number) => ease(clamp01((u - a) / (b - a)));

interface Pose {
  x: number;
  y: number;
  /** 1 = resting, smaller = pressing. */
  s: number;
  o: number;
  /** 0..1: how pressed the thumb is (draws the ripple). */
  press: number;
}

/** Cycle length in seconds for a gesture. */
function period(g: Gesture): number {
  switch (g.kind) {
    case "tap":
      return 1.5;
    case "hold":
      return 2.6;
    case "circle":
      return 3;
    case "swipe":
      return 1.5;
    case "drag":
      return 1.6 + Math.min(1.2, Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y) / 300);
    case "dragCircle":
      return 3.6;
  }
}

/** Where the thumb is at u (0..1 through its cycle). */
function pose(g: Gesture, u: number): Pose {
  const fadeIn = span(u, 0, 0.1);
  const fadeOut = 1 - span(u, 0.9, 1);
  const o = Math.min(fadeIn, fadeOut);
  switch (g.kind) {
    case "tap": {
      // Rest, shrink and dip (the tap), come back up.
      const p = span(u, 0.3, 0.42) - span(u, 0.55, 0.68);
      return { x: g.at.x, y: g.at.y - 4 + p * 8, s: 1 - 0.22 * p, o, press: p };
    }
    case "hold": {
      const p = span(u, 0.15, 0.25) - span(u, 0.78, 0.88);
      return { x: g.at.x, y: g.at.y - 4 + p * 8, s: 1 - 0.22 * p, o, press: p };
    }
    case "swipe":
    case "drag": {
      const [a, b] = g.kind === "swipe" ? [0.28, 0.6] : [0.24, 0.76];
      const p = span(u, 0.12, 0.22) - span(u, b + 0.02, b + 0.1);
      const t = span(u, a, b);
      return { x: lerp(g.from.x, g.to.x, t), y: lerp(g.from.y, g.to.y, t) + p * 6, s: 1 - 0.2 * p, o, press: p };
    }
    case "circle": {
      const p = span(u, 0.1, 0.18) - span(u, 0.8, 0.88);
      const a = clamp01((u - 0.18) / 0.62) * Math.PI * 3;
      const r = g.r * Math.min(1, clamp01((u - 0.14) / 0.1));
      return { x: g.at.x + Math.sin(a) * r, y: g.at.y - Math.cos(a) * r * 0.8 + r * 0.8, s: 1 - 0.2 * p, o, press: p };
    }
    case "dragCircle": {
      const p = span(u, 0.08, 0.15) - span(u, 0.82, 0.9);
      const t = span(u, 0.15, 0.4);
      const a = clamp01((u - 0.42) / 0.38) * Math.PI * 3;
      const r = g.r * clamp01((u - 0.4) / 0.06);
      const cx = lerp(g.from.x, g.to.x, t);
      const cy = lerp(g.from.y, g.to.y, t);
      return { x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r * 0.8 + r * 0.8, s: 1 - 0.2 * p, o, press: p };
    }
  }
}

const THUMB = 56;

function draw(show: Show, now: number): void {
  const g = show.gesture ?? null;
  const key = g ? `${g.kind}` : "";
  if (key !== gestureKey) {
    gestureKey = key;
    phase0 = now;
  }
  // The thumb steps aside while the finger is busy, unless this gesture is meant to be followed.
  const showThumb = !!g && (!fingerDown || show.whileDown);
  if (g && showThumb) {
    const P = period(g) * 1000;
    const u = ((now - phase0) % P) / P;
    const p = pose(g, u);
    thumb.style.transform = `translate(${(p.x - THUMB / 2).toFixed(1)}px, ${(p.y - THUMB / 2).toFixed(1)}px) scale(${p.s.toFixed(3)})`;
    thumb.style.opacity = p.o.toFixed(2);
    ripple.style.transform = `translate(${(p.x - THUMB / 2).toFixed(1)}px, ${(p.y - THUMB / 2).toFixed(1)}px) scale(${(1 + p.press * 0.5).toFixed(3)})`;
    ripple.style.opacity = (p.press * 0.9 * p.o).toFixed(2);
  } else {
    thumb.style.opacity = "0";
    ripple.style.opacity = "0";
  }

  // A dashed trail from where a drag starts to where it goes, and a ring where it lands.
  const path = g && (g.kind === "drag" || g.kind === "swipe" || g.kind === "dragCircle") ? g : null;
  if (path) {
    const { from, to } = path;
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / d;
    const uy = (to.y - from.y) / d;
    const end = { x: to.x - ux * 6, y: to.y - uy * 6 };
    const ah = 10;
    const head = `M ${end.x - ux * ah - uy * ah * 0.6} ${end.y - uy * ah + ux * ah * 0.6} L ${end.x} ${end.y} L ${end.x - ux * ah + uy * ah * 0.6} ${end.y - uy * ah - ux * ah * 0.6}`;
    trailPath.setAttribute("d", `M ${from.x} ${from.y} L ${end.x} ${end.y} ${head}`);
  } else trailPath.setAttribute("d", "");
  const land = g && (g.kind === "drag" || g.kind === "dragCircle") ? g.to : null;
  target.hidden = !land;
  if (land) target.style.transform = `translate(${land.x - 26}px, ${land.y - 26}px)`;

  ringEl.hidden = !show.ring;
  if (show.ring) {
    const r = show.ring;
    Object.assign(ringEl.style, { left: `${r.x - 5}px`, top: `${r.y - 5}px`, width: `${r.w + 10}px`, height: `${r.h + 10}px` });
  }

  // The card.
  const text = `${show.title ?? ""}|${show.text}|${show.ok ?? ""}`;
  if (text !== shownText) {
    shownText = text;
    cardTitle.textContent = show.title ?? "";
    cardTitle.hidden = !show.title;
    cardText.textContent = show.text;
    cardOk.hidden = !show.ok;
    cardOk.textContent = show.ok ?? "";
    card.hidden = false;
    card.classList.remove("in");
    void card.offsetWidth;
    card.classList.add("in");
  }
  placeCard(show, g);
}

/** The game column (the 3D view and the HUD are pillarboxed on wide screens). */
function column(): { x: number; w: number } {
  const st = getComputedStyle(document.documentElement);
  const x = parseFloat(st.getPropertyValue("--gx")) || 0;
  const w = parseFloat(st.getPropertyValue("--gw")) || window.innerWidth;
  return { x, w };
}

/** What the card mustn't cover: around each point of the gesture, and the ring. */
function gestureBoxes(g: Gesture | null, show: Show): Box[] {
  const pts: Pt[] = [];
  if (g) {
    if ("at" in g) pts.push(g.at);
    if ("from" in g) pts.push(g.from, g.to);
  }
  const boxes: Box[] = pts.map((p) => ({ x: p.x - 40, y: p.y - 44, w: 80, h: 88 }));
  if (g && (g.kind === "circle" || g.kind === "dragCircle")) {
    const c = g.kind === "circle" ? g.at : g.to;
    boxes.push({ x: c.x - g.r - 40, y: c.y - 44, w: g.r * 2 + 80, h: g.r * 1.6 + 88 });
  }
  if (show.ring) boxes.push({ x: show.ring.x - 8, y: show.ring.y - 8, w: show.ring.w + 16, h: show.ring.h + 16 });
  return boxes;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function placeCard(show: Show, g: Gesture | null): void {
  const col = column();
  const W = Math.min(330, col.w - 24);
  card.style.width = `${W}px`;
  const H = card.offsetHeight || 80;
  const vh = window.innerHeight;
  const left = col.x + (col.w - W) / 2;
  const bottom = vh - H - 18;
  const busy = gestureBoxes(g, show);
  const avoid = [...(show.avoid ?? []), ...busy];
  const fits = (y: number) => y >= 8 && y + H <= vh - 8 && !avoid.some((b) => overlaps({ x: left, y, w: W, h: H }, b));
  let y: number;
  if (show.place === "top") y = 64;
  else if (show.place === "bottom") y = bottom;
  else {
    const cands: number[] = [];
    for (const b of busy) cands.push(b.y - H - 6, b.y + b.h + 6);
    cands.push(64, 8, bottom, vh * 0.5 - H / 2);
    y = cands.find(fits) ?? (busy.length && busy[0].y + busy[0].h / 2 > vh / 2 ? 64 : bottom);
  }
  y = Math.max(8, Math.min(vh - H - 8, y));
  card.style.transform = `translate(${left.toFixed(0)}px, ${y.toFixed(0)}px)`;
}
