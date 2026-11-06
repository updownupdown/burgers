import type { Difficulty } from "../game/difficulty";
/**
 * A small stack of modal layers for the game menu, How to Play and the menu reference.
 *
 * Layers live in one fixed host on <body>, above the 3D view and every HTML screen, so they
 * work the same in the truck and on the home screen. Each layer is a scrim with a card
 * centred on the game column (pillarboxed on desktop). The page never scrolls: long
 * content scrolls inside the card's body.
 */
import "./menu.css";
import type { Stop } from "../game/stops";
import type { Save } from "../game/progress";
import type { VersionInfo } from "../update";
import { dropBack, pushBack } from "./nav";
import { icon } from "../ui/icons";

export type GfxLevel = "high" | "standard" | "low";

/**
 * What the menus need from the game. main.ts registers these once with `initMenu`; a caller
 * (the home screen, say) can override any of them for one `openMenu` call.
 */
export interface MenuDeps {
  /** True while a shift is running or paused: shows Resume, Restart and Quit, and closing resumes. */
  inShift(): boolean;
  /** The town whose menu "Today's menu" shows: the one being played (event and hidden recipes applied), else the current or selected one. */
  town(): Stop;
  /** The counter on screen in a shift, so How to Play can open on it. */
  counter?(): "drinks" | "middle" | "fryer";
  /** Poutine's price if it's on today's menu, else null. */
  poutine?(): number | null;
  /** Small line under the menu title, e.g. "Day 4 · Pinecrest". */
  subtitle?(): string;
  /** Effects: every cooking and UI sound. */
  sound(): boolean;
  setSound(on: boolean): void;
  /** The region's ambient bed (src/ambience.ts), apart from the effects. */
  ambience?(): boolean;
  setAmbience?(on: boolean): void;
  difficulty(): Difficulty;
  setDifficulty(d: Difficulty): void;
  gfx(): GfxLevel;
  setGfx(level: GfxLevel): void;
  /** How the shift is going, for the pause menu. */
  shift?(): ShiftSummary;
  /** Which towns are open and how many shifts each has, for the menu's locked dishes. */
  progress?(): { unlocked: string[]; shiftsIn: Record<string, number> };
  canInstall(): boolean;
  install(): void;
  checkUpdate(): Promise<VersionInfo | null>;
  /** The menu closed during a shift: pick the shift back up. */
  resume(): void;
  restart(): void;
  /** Leave the shift for the map (already confirmed). */
  quit(): void;
  /** Wipe the trip and start over (already confirmed). */
  newTrip(): void;
  /** Tutorial mode was switched back on: the next shift is talked through again. */
  /** Tutorial mode switched in Settings: on replays the guided first shift, off skips it. */
  setTutorial?(on: boolean): void;
  /** The trip as a save code, for Settings → Copy save code (game/savecode.ts). */
  saveCode?(): string;
  /** Replace the trip with one pasted as a code (checked and confirmed already). */
  loadTrip?(s: Save): void;
  /** Dev mode: swap in a simulated trip at 0, 50 or 100% of the road, or bring the real one back (null). */
  simulate?(level: number | null): void;
}

/** The pause menu's picture of the shift so far. */
export interface ShiftSummary {
  /** Clock hours of the window, and the clock now. */
  start: number;
  end: number;
  now: number;
  /** 0..1 through the window; true once the window has shut and the last orders are going out. */
  progress: number;
  closing: boolean;
  /** Pacing for this shift, fixed when it opened. */
  pacing: string;
  pacingBlurb: string;
  /** People: expected today, served, at the window, waiting in line, and gone without food. */
  expected: number;
  served: number;
  atWindow: number;
  inLine: number;
  left: number;
  /** Every served customer's opinion, 1..5★, in order. */
  stars: number[];
  /** Takings so far (sales and tips, less spills), or null if the game doesn't count money. */
  takings: number | null;
  /** Reviews left so far (1..5★ each), in order: only some customers leave one. */
  reviews: number[];
}

let deps: MenuDeps | null = null;
export function setDeps(d: MenuDeps): void {
  deps = d;
}
export function getDeps(): MenuDeps | null {
  return deps;
}

interface Layer {
  el: HTMLElement;
  card: HTMLElement;
  /** Called when the layer is dismissed (close button, scrim, Escape, back), not when closed silently. */
  onDismiss?: () => void;
  restoreFocus: Element | null;
  key: string;
}

const stack: Layer[] = [];
let host: HTMLElement | null = null;
/** When a layer last closed, so the second tap of a double tap on its × doesn't land on what's under it. */
let closedAt = 0;
export const modalClosedAt = (): number => closedAt;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement("div");
  host.className = "bv menu-host";
  document.body.appendChild(host);
  document.addEventListener("keydown", (e) => {
    if (!stack.length) return;
    if (e.key === "Escape") {
      e.preventDefault();
      popModal();
    } else if (e.key === "Tab") {
      // Keep keyboard focus inside the top card.
      const card = stack[stack.length - 1].card;
      const f = [...card.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']), [href], input")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const inside = card.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === f[0] || document.activeElement === card)) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === f[f.length - 1])) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });
  return host;
}

/** `sh-top` on `host` while `body` is scrolled down from the top; `sh-bot` while there's more below. */
export function scrollShadows(host: HTMLElement, body: HTMLElement): void {
  host.classList.toggle("sh-top", body.scrollTop > 2);
  host.classList.toggle("sh-bot", body.scrollTop + body.clientHeight < body.scrollHeight - 2);
}

export interface ModalOpts {
  /** Identifies the layer, so opening the same one twice reuses it. */
  key: string;
  label: string;
  /** Card HTML: a head, an optional bar and a `.menu-body` that scrolls. */
  html: string;
  /** Extra classes on the card. */
  cls?: string;
  onDismiss?: () => void;
}

export function pushModal(o: ModalOpts): HTMLElement {
  const h = ensureHost();
  const existing = stack.find((l) => l.key === o.key);
  if (existing) return existing.card;
  const el = document.createElement("div");
  el.className = `bv-scrim menu-layer${stack.length ? " stacked" : ""}`;
  el.innerHTML = `<section class="menu-card ${o.cls ?? ""}" role="dialog" aria-modal="true" aria-label="${o.label}" tabindex="-1">${o.html}</section>`;
  const card = el.firstElementChild as HTMLElement;
  // A tap on the scrim (outside the card) dismisses this layer.
  el.addEventListener("click", (e) => {
    if (e.target === el) popModal();
  });
  // Keep stray pointer events from reaching anything underneath.
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("touchmove", (e) => {
    if (!(e.target as HTMLElement).closest(".menu-scroll")) e.preventDefault();
  }, { passive: false });
  // Shadows under the header and over a footer, only while there's more to scroll that way.
  card.addEventListener("scroll", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains("menu-body")) scrollShadows(card, t);
  }, true);
  const layer: Layer = { el, card, onDismiss: o.onDismiss, restoreFocus: document.activeElement, key: o.key };
  stack.push(layer);
  // The phone's back button closes this layer like its × would.
  pushBack(`modal:${o.key}`, () => {
    if (stack[stack.length - 1] === layer) popModal();
  });
  h.appendChild(el);
  card.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    const body = card.querySelector<HTMLElement>(".menu-body");
    if (body) scrollShadows(card, body);
  });
  return card;
}

/** Close the top layer. `silent` skips its dismiss callback (used before the game moves on). */
export function popModal(silent = false): void {
  const layer = stack.pop();
  if (!layer) return;
  dropBack(`modal:${layer.key}`);
  closedAt = performance.now();
  layer.el.remove();
  if (layer.restoreFocus instanceof HTMLElement && document.contains(layer.restoreFocus)) layer.restoreFocus.focus({ preventScroll: true });
  if (!silent) layer.onDismiss?.();
}

/** Close every layer without running dismiss callbacks. */
export function closeAllModals(): void {
  while (stack.length) popModal(true);
}

export const modalOpen = (key?: string): boolean => (key ? stack.some((l) => l.key === key) : stack.length > 0);
export const modalDepth = (): number => stack.length;

/**
 * A card's header bar. On its own: the icon and title on the left, a close × on the right. Stacked
 * over another card (Settings or How to Play from the pause menu): a back chevron, a small line
 * over the title (where it came from), and no ×.
 */
export function modalHead(o: { icon: string; title: string; stacked: boolean; eyebrow?: string; closeLabel?: string }): string {
  if (o.stacked)
    return `<header class="menu-head bar stacked">
      <button class="bv-btn icon sm ghost menu-back" data-m="close" aria-label="Back">${icon("back")}</button>
      <div class="menu-headtext">${o.eyebrow ? `<span class="bv-eyebrow">${esc(o.eyebrow)}</span>` : ""}<h2 class="bv-title">${esc(o.title)}</h2></div>
    </header>`;
  return `<header class="menu-head bar">
    <span class="menu-head-ic" aria-hidden="true">${icon(o.icon)}</span>
    <div class="menu-headtext"><h2 class="bv-title">${esc(o.title)}</h2></div>
    <button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="${o.closeLabel ?? "Close"}">${icon("close")}</button>
  </header>`;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Prices: whole dollars without cents, anything else with two decimals. */
export const price = (n: number): string => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * Jump chips over a scrolling body: tapping one scrolls to its section, and the chip of the
 * section being read lights up. Sections carry `data-sec`, chips `data-jump`.
 */
export function wireJumpChips(body: HTMLElement): void {
  const bar = body.querySelector<HTMLElement>(".menu-chips");
  if (!bar) return;
  const chips = [...bar.querySelectorAll<HTMLElement>("[data-jump]")];
  const secs = [...body.querySelectorAll<HTMLElement>("[data-sec]")];
  const offset = () => bar.offsetHeight + 6;
  bar.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-jump]");
    const sec = chip && secs.find((s) => s.dataset.sec === chip.dataset.jump);
    if (!sec) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top: Math.max(0, sec.offsetTop - offset()), behavior: reduce ? "auto" : "smooth" });
    mark(chip.dataset.jump!);
  });
  let current = "";
  const mark = (id: string) => {
    if (id === current) return;
    current = id;
    for (const c of chips) {
      const on = c.dataset.jump === id;
      c.classList.toggle("on", on);
      if (on) {
        // Keep the lit chip in view without scrolling anything else.
        const l = c.offsetLeft - 16;
        const r = c.offsetLeft + c.offsetWidth + 16 - bar.clientWidth;
        if (bar.scrollLeft > l) bar.scrollTo({ left: l, behavior: "smooth" });
        else if (bar.scrollLeft < r) bar.scrollTo({ left: r, behavior: "smooth" });
      }
    }
  };
  const spy = () => {
    const y = body.scrollTop + offset() + 24;
    let id = secs[0]?.dataset.sec ?? "";
    for (const s of secs) if (s.offsetTop <= y) id = s.dataset.sec!;
    // At the very bottom, the last section counts even if it's short.
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2 && secs.length) id = secs[secs.length - 1].dataset.sec!;
    mark(id);
  };
  body.addEventListener("scroll", spy, { passive: true });
  spy();
}

/** Scroll a body straight to one of its sections. */
export function jumpTo(body: HTMLElement, id: string): void {
  const sec = body.querySelector<HTMLElement>(`[data-sec="${id}"]`);
  const bar = body.querySelector<HTMLElement>(".menu-chips");
  if (sec) body.scrollTop = Math.max(0, sec.offsetTop - (bar?.offsetHeight ?? 0) - 6);
}
