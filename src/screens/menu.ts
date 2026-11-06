/**
 * The in-game menus, as three cards:
 *
 *   openMenu()        the pause menu, in a shift: Resume, Restart, Quit, how the shift is going,
 *                     today's menu (ingredients, tips, sides, drinks), Settings and How to Play.
 *                     Closing it resumes.
 *   openSettings()    Settings on their own: sound, graphics, the app.
 *                     From the map's Settings button, and from the pause menu.
 *   openHowTo()       How to Play on its own (howto.ts). From the map's Help button.
 *   openMenuRef()     The menu: every dish, open or locked (menuref.ts).
 *   closeAll()        close everything, without resuming
 *
 *   initMenu(deps)    once, from main.ts
 */
import { COOK_TIME, COOK_TIMES, cookTime, setCookTime } from "../game/pace";
import { hapticsOn, hapticsSupported, setHaptics } from "../audio";
import { buildLabel, CURRENT, reloadTo } from "../update";
import { icon } from "../ui/icons";
import { opinionFace, opinionLabel } from "../ui/faces";
import { openHowTo } from "./howto";
import { openMenuRef } from "./menuref";
import { closeAllModals, esc, getDeps, modalDepth, modalHead, modalOpen, popModal, price, pushModal, setDeps, type GfxLevel, type MenuDeps, type ShiftSummary } from "./modal";
import { cartonArt, cupArt, methodTags, stackArt } from "./menuref";
import { dishTips, drinksInfo, ingredients, sidesInfo } from "./dishtext";
import { DRINK_COLOR, DRINK_LABEL, KIND_COLOR } from "../game/types";
import { clockLabel } from "../game/shift";
import { middleOf, type MiddleCounter, type Stop } from "../game/stops";

const MIDDLE_LABEL: Record<MiddleCounter, string> = { grill: "Grill", press: "Press", comal: "Comal", oven: "Oven" };
import { devOn, setDevOn, SIM_LEVELS, simLevel } from "../game/devmode";
import { coachOn, setCoachOn } from "../tutorial/coach";

export type { GfxLevel, MenuDeps } from "./modal";
export { openHowTo } from "./howto";
export { openMenuRef } from "./menuref";


const GFX: { id: GfxLevel; label: string; blurb: string }[] = [
  { id: "low", label: "Low", blurb: "No shadows, for older or slower phones." },
  { id: "standard", label: "Standard", blurb: "Hard shadows. A little lighter on the battery." },
  { id: "high", label: "High", blurb: "Soft shadows. Looks its best." },
];

/** Register what the menu needs from the game. Call once at startup. */
export function initMenu(deps: MenuDeps): void {
  setDeps(deps);
}

/** Close every menu layer. Nothing resumes: the caller is moving the game on. */
export function closeAll(): void {
  closeAllModals();
}

export const isMenuOpen = (): boolean => modalOpen();

const toggle = (m: string, ic: string, label: string, on: boolean, note = "") =>
  `<button class="bv-toggle menu-toggle" role="switch" aria-checked="${on}" data-m="${m}"><span class="lead">${icon(ic)}</span><span class="lbl">${label}${note ? `<small>${note}</small>` : ""}</span><span class="state">${on ? "On" : "Off"}</span><span class="sw"></span></button>`;

const row = (m: string, ic: string, label: string, note: string, trail = icon("forward"), extra = "") =>
  `<button class="bv-row menu-row" data-m="${m}" ${extra}><span class="lead">${icon(ic)}</span><span class="main"><b>${label}</b>${note ? `<small>${note}</small>` : ""}</span><span class="trail mute">${trail}</span></button>`;

const confirmBox = (id: string, text: string, yes: string) =>
  `<div class="bv-callout warn menu-confirm" data-confirm="${id}" hidden>${icon("warning")}<div><p>${text}</p><div class="bv-btn-row inline"><button class="bv-btn sm" data-m="cancel">Cancel</button><button class="bv-btn sm accent" data-m="${id}-yes">${yes}</button></div></div></div>`;

/** A three-way choice with a line under it that follows the pick. */
const field = (m: string, ic: string, label: string, note: string, opts: { v: string; label: string }[], cur: string) =>
  `<div class="menu-field">
    <span class="lead">${icon(ic)}</span>
    <div class="lbl"><b>${label}</b><small data-r="${m}-note">${note}</small></div>
    <div class="bv-seg compact" role="radiogroup" aria-label="${label}">${opts.map((o) => `<button role="radio" aria-pressed="${o.v === cur}" aria-checked="${o.v === cur}" data-m="${m}" data-v="${o.v}">${o.label}</button>`).join("")}</div>
  </div>`;


function resolveDeps(over: Partial<MenuDeps>): MenuDeps {
  const base = getDeps();
  const d = { ...base, ...over } as MenuDeps;
  if (!d.inShift || !d.town) throw new Error("menu: call initMenu(deps) first");
  return d;
}

/** Pick a radio in a segmented control and update the note under it. */
function pickSeg(card: HTMLElement, btn: HTMLElement, note: string): void {
  btn.parentElement!.querySelectorAll<HTMLElement>("button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b === btn));
    b.setAttribute("aria-checked", String(b === btn));
  });
  const n = card.querySelector(`[data-r="${btn.dataset.m}-note"]`);
  if (n) n.textContent = note;
}

// ---------------------------------------------------------------------------
// The pause menu

/** Open the pause menu. Closing it (Resume, Escape, Back or a tap outside) resumes. */
export function openMenu(over: Partial<MenuDeps> = {}): void {
  const d = resolveDeps(over);
  if (modalOpen("menu")) return;
  const inShift = d.inShift();
  const town = d.town();
  const card = pushModal({
    key: "menu",
    label: inShift ? "Paused" : "Menu",
    cls: inShift ? "gamemenu pause tall" : "gamemenu",
    onDismiss: () => {
      if (inShift) d.resume();
    },
    html: inShift
      ? pauseHtml(d, town)
      : `${modalHead({ icon: "menu", title: "Menu", stacked: false })}
      <div class="menu-body menu-scroll menu-general">
        ${row("menuref", "food-menu", "Menu", `${esc(town.name)} · ${town.menu.length} burgers, sides and drinks`)}
        <h3 class="menu-h">${icon("truck")}Bun Voyage</h3>
        ${row("settings", "settings", "Settings", "Sound, graphics, the app")}
        ${row("howto", "help", "How to Play", "Your kitchen step by step, the fryer, drinks, the road")}
        <p class="menu-build bv-mono">${esc(buildLabel())}</p>
      </div>`,
  });

  // Restart and Quit ask first, in the footer's own space: the confirm takes the buttons' place.
  const confirm = (id: string | null) => {
    const foot = card.querySelector<HTMLElement>(".pause-foot");
    if (!foot) return;
    foot.dataset.state = id ?? "";
    foot.querySelectorAll<HTMLElement>("[data-confirm]").forEach((c) => (c.hidden = c.dataset.confirm !== id));
    foot.querySelector<HTMLElement>(".pause-acts")!.toggleAttribute("inert", !!id);
    (foot.querySelector<HTMLElement>(id ? `[data-confirm="${id}"] [data-m="${id}-yes"]` : `[data-m="resume"]`))?.focus({ preventScroll: true });
  };

  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-m]");
    if (!btn || !card.contains(btn)) return;
    switch (btn.dataset.m!) {
      case "close":
      case "resume":
        popModal();
        break;
      case "restart":
      case "quit":
        confirm(btn.dataset.m!);
        break;
      case "cancel":
        confirm(null);
        break;
      case "restart-yes":
        closeAllModals();
        d.restart();
        break;
      case "quit-yes":
        closeAllModals();
        d.quit();
        break;
      case "menuref":
        openMenuRef(d.town());
        break;
      case "settings":
        openSettings(over);
        break;
      case "howto":
        openHowTo();
        break;
    }
  });
}

/** The pause card in a shift: how it's going, today's menu in brief, and the way out at the bottom. */
function pauseHtml(d: MenuDeps, town: Stop): string {
  const sh = d.shift?.();
  const at = d.counter?.();
  const here = at === "drinks" ? "Drinks" : at === "fryer" ? "Fryer" : MIDDLE_LABEL[middleOf(town)];
  return `<header class="menu-head bar">
      <span class="menu-head-ic" aria-hidden="true">${icon("pause")}</span>
      <div class="menu-headtext"><h2 class="bv-title">Paused</h2></div>
      <button class="bv-btn icon sm ghost" data-m="settings" aria-label="Settings" title="Settings">${icon("settings")}</button>
    </header>
    <div class="menu-body menu-scroll pause-body">
      <p class="pause-where">${icon("pin")}<b>${esc(town.name)}</b>${d.subtitle ? `<span>${esc(d.subtitle())}</span>` : ""}</p>
      ${sh ? shiftHtml(sh) : ""}
      <button class="bv-btn block pause-help" data-m="howto">${icon("help")}How to play · ${esc(here)}</button>
      ${todayMenuHtml(town, 1)}
    </div>
    <footer class="pause-foot">
      <div class="pause-acts">
        <div class="bv-btn-row inline">
          <button class="bv-btn" data-m="restart">${icon("restart")}Restart shift</button>
          <button class="bv-btn" data-m="quit">${icon("map")}Quit to map</button>
        </div>
        <button class="bv-btn primary lg block" data-m="resume">${icon("play")}Resume</button>
      </div>
      ${pauseConfirm("restart", "restart", "Start this shift again from the top?", "Today's customers so far are lost.", "Restart")}
      ${pauseConfirm("quit", "map", `Leave ${esc(town.name)} for the map?`, "This shift won't count.", "Quit to map")}
    </footer>`;
}

const pauseConfirm = (id: string, ic: string, q: string, note: string, yes: string) =>
  `<div class="pause-confirm" data-confirm="${id}" hidden role="alertdialog" aria-label="${esc(q)}">
    <p><b>${q}</b><span>${note}</span></p>
    <div class="bv-btn-row inline">
      <button class="bv-btn" data-m="cancel">${icon("close")}Cancel</button>
      <button class="bv-btn accent" data-m="${id}-yes">${icon(ic)}${yes}</button>
    </div>
  </div>`;

function shiftHtml(sh: ShiftSummary): string {
  const pct = Math.round(sh.progress * 100);
  const avg = sh.stars.length ? sh.stars.reduce((a, b) => a + b, 0) / sh.stars.length : null;
  const tally = [5, 4, 3, 2, 1].map((n) => ({ n, count: sh.stars.filter((x) => x === n).length }));
  const phase = sh.closing ? "Window shut · last orders" : pct < 25 ? "Opening hour" : pct < 70 ? "The rush" : "Winding down";
  return `<section class="pause-shift" aria-label="This shift">
    <div class="pause-clock">
      <div class="t"><span class="bv-eyebrow">${phase}</span><b class="bv-mono">${sh.closing ? "Closing" : clockLabel(sh.now)}</b></div>
      <span class="bv-chip pill" title="${esc(sh.pacingBlurb)}">${icon("clock")}${esc(sh.pacing)} pacing</span>
    </div>
    <div class="pause-bar ${sh.closing ? "closing" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <div class="pause-ends bv-mono"><span>${clockLabel(sh.start)}</span><span>${clockLabel(sh.end)}</span></div>
    <div class="pause-kpis">
      <div><b class="bv-mono">${sh.served}</b><small>served</small></div>
      <div><b class="bv-mono">${sh.atWindow + sh.inLine}</b><small>waiting</small></div>
      <div><b class="bv-mono">${sh.left}</b><small>left hungry</small></div>
      <div><b class="bv-mono">${avg === null ? "–" : avg.toFixed(1)}</b><small>avg stars</small></div>
    </div>
    <p class="pause-note">About ${sh.expected} people today${sh.takings !== null ? ` · <b class="bv-mono">$${Math.round(sh.takings)}</b> taken so far` : ""}.</p>
    ${
      sh.stars.length
        ? `<div class="pause-tally" aria-label="What customers thought so far">${tally.map((t) => `<span class="${t.count ? "" : "zero"}" title="${opinionLabel(t.n)}">${opinionFace(t.n)}<b class="bv-mono">${t.count}</b></span>`).join("")}</div>`
        : `<p class="pause-note mute">No one has been served yet.</p>`
    }
    ${
      sh.served
        ? `<p class="pause-revs">${icon("review")}<span>${sh.reviews.length ? `${sh.reviews.length} review${sh.reviews.length === 1 ? "" : "s"} so far` : "No reviews yet"}</span>${sh.reviews
            .slice(-6)
            .map((n) => `<b class="bv-mono">${n}<i>★</i></b>`)
            .join("")}</p>`
        : ""
    }
  </section>`;
}

/**
 * Today's menu: only what's served today. Each dish as a little drawing, every ingredient bottom
 * to top (buns and counts included), how it's made, and a tip or two for the fussier ones. Then
 * the town's sides and drinks, one drawing each.
 */
function todayMenuHtml(town: Stop, mult: number): string {
  const items = town.menu
    .map((r) => {
      const notes = methodTags(r);
      const tips = dishTips(r, town);
      const flow = ingredients(r)
        .map((g) => `<li><i class="swc" style="--c:${KIND_COLOR[g.kind]}"></i>${esc(g.label)}${g.count > 1 ? `<b class="bv-mono">×${g.count}</b>` : ""}</li>`)
        .join("");
      return `<li class="pause-dish">
        ${stackArt(r)}
        <div class="pd-main">
          <div class="pd-top"><b>${esc(r.name)}</b><span class="bv-mono pr">${price(Math.round(r.price * mult))}</span></div>
          <ol class="pd-flow" aria-label="Bottom to top">${flow}</ol>
          ${notes.length ? `<span class="tags">${notes.map((n) => `<span class="bv-chip pill">${esc(n)}</span>`).join("")}</span>` : ""}
          ${tips.length ? `<ul class="pd-tips">${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        </div>
      </li>`;
    })
    .join("");
  const sides = sidesInfo(town);
  const drinks = drinksInfo(town);
  return `<section class="pause-menu" aria-label="Today's menu">
    <h3 class="menu-h">${icon("food-menu")}Today's menu <span>${town.menu.length}</span></h3>
    <p class="pause-note mute pd-caption">Ingredients bottom to top.</p>
    <ul class="pause-dishes">${items}</ul>
  </section>
  <section class="pause-extras" aria-label="Sides and drinks">
    <div class="pause-extra">
      ${cartonArt(sides.kind)}
      <div class="pe-main">
        <h3 class="menu-h">${icon("fries")}Sides</h3>
        <p class="pe-list">${sides.names.map(esc).join(" · ")}</p>
        <small>${esc(sides.note)}</small>
      </div>
    </div>
    <div class="pause-extra">
      ${cupArt(DRINK_COLOR[drinks.drinks[0]])}
      <div class="pe-main">
        <h3 class="menu-h">${icon("drink")}Drinks</h3>
        <ul class="pe-flavours">${drinks.drinks.map((dr) => `<li><i class="swc" style="--c:${DRINK_COLOR[dr]}"></i>${esc(DRINK_LABEL[dr])}</li>`).join("")}</ul>
        <small>${esc(drinks.note)}</small>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Settings

/** Open Settings. Stacks over the pause menu in a shift; stands alone from the map. */
export function openSettings(over: Partial<MenuDeps> = {}): void {
  const d = resolveDeps(over);
  if (modalOpen("settings")) return;
  const inShift = d.inShift();
  const stacked = modalDepth() > 0;
  const gfx = d.gfx();
  let buildTaps = 0;
  const card = pushModal({
    key: "settings",
    label: "Settings",
    cls: "settings",
    html: `${modalHead({ icon: "settings", title: "Settings", stacked, eyebrow: inShift ? "Paused" : undefined })}
      <div class="menu-body menu-scroll menu-general menu-groups">
        <section class="menu-group">
          <h3 class="menu-h">${icon("phone")}Device</h3>
          ${toggle("sound", d.sound() ? "sound-on" : "sound-off", "Sound", d.sound())}
          ${hapticsSupported() ? toggle("haptics", "vibrate", "Vibration", hapticsOn(), "A buzz on flips, dings and burns") : ""}
          ${field("gfx", "sparkle", "Graphics", GFX.find((g) => g.id === gfx)!.blurb, GFX.map((g) => ({ v: g.id, label: g.label })), gfx)}
        </section>
        <section class="menu-group">
          <h3 class="menu-h">${icon("sparkle")}Learning</h3>
          ${toggle("tutorial", "help", "Tutorial mode", coachOn(), "A see-through thumb shows each new move. Turning it on plays the lessons again.")}
        </section>
        <section class="menu-group">
          <h3 class="menu-h">${icon("truck")}App</h3>
          ${row("update", "update", "Check for updates", "", "")}
          ${d.canInstall() ? row("install", "pin", "Install the app", "Add Bun Voyage to your home screen and play offline", "") : ""}
          ${row("newtrip", "flag", "Start a new trip", "Back to the first town with an empty garage.", "", 'data-tone="danger"')}
          ${confirmBox("newtrip", `${inShift ? "End this shift and start over?" : "Start over?"} Savings, bonuses, looks, popularity and reviews all reset. Town bests are kept.`, "Start over")}
        </section>
        ${inShift || !d.simulate ? "" : devHtml()}
        <p class="menu-build bv-mono" ${inShift || !d.simulate ? "" : 'data-m="build"'}>${esc(buildLabel())}</p>
      </div>`,
  });

  const confirm = (id: string | null) =>
    card.querySelectorAll<HTMLElement>("[data-confirm]").forEach((c) => {
      const show = c.dataset.confirm === id;
      if (show && c.hidden) {
        c.hidden = false;
        c.scrollIntoView({ block: "nearest" });
      } else if (!show) c.hidden = true;
    });

  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-m]");
    if (!btn || !card.contains(btn)) return;
    switch (btn.dataset.m!) {
      case "close":
        popModal();
        break;
      case "newtrip":
        confirm("newtrip");
        break;
      case "cancel":
        confirm(null);
        break;
      case "newtrip-yes":
        closeAllModals();
        d.newTrip();
        break;
      case "sound": {
        const on = !d.sound();
        d.setSound(on);
        setToggle(btn, on);
        btn.querySelector(".lead")!.innerHTML = icon(on ? "sound-on" : "sound-off");
        break;
      }
      case "tutorial": {
        const on = !coachOn();
        setCoachOn(on);
        d.setTutorial?.(on);
        setToggle(btn, on);
        break;
      }
      case "haptics": {
        const on = !hapticsOn();
        setHaptics(on);
        setToggle(btn, on);
        if (on) navigator.vibrate?.(20);
        break;
      }
      case "dev": {
        const on = !devOn();
        setDevOn(on);
        setToggle(btn, on);
        card.querySelector<HTMLElement>(".menu-dev")!.hidden = !on;
        if (!on && simLevel() !== null) {
          d.simulate?.(null);
          const off = card.querySelector<HTMLElement>('[data-m="sim"][data-v="off"]');
          if (off) pickSeg(card, off, SIM_NOTE.off);
        }
        break;
      }
      case "build": {
        buildTaps++;
        const g = card.querySelector<HTMLElement>(".menu-devgroup");
        if (g && g.hidden && buildTaps >= 5) {
          g.hidden = false;
          g.scrollIntoView({ block: "nearest" });
        }
        break;
      }
      case "cooktime": {
        const v = Number(btn.dataset.v);
        setCookTime(v);
        pickSeg(card, btn, cookNote(v));
        break;
      }
      case "sim": {
        const v = btn.dataset.v!;
        d.simulate?.(v === "off" ? null : Number(v));
        pickSeg(card, btn, SIM_NOTE[v]);
        break;
      }
      case "gfx": {
        const v = btn.dataset.v as GfxLevel;
        d.setGfx(v);
        pickSeg(card, btn, GFX.find((g) => g.id === v)!.blurb);
        break;
      }
      case "update":
        void checkUpdate(btn, d);
        break;
      case "update-now":
        reloadTo(btn.dataset.v!, true);
        break;
      case "install":
        d.install();
        btn.remove();
        break;
    }
  });
}

const SIM_NOTE: Record<string, string> = {
  off: "Playing your real trip.",
  "0": "A fresh trip: the first town, nothing earned yet. Your real trip is kept aside.",
  "50": "Halfway down the road: half the towns worked, two bonuses, a fair name. Your real trip is kept aside.",
  "100": "The whole road worked: every town open, every bonus, well known. Your real trip is kept aside.",
};

/** The dev cook-time dial (pace.ts): what it does, at value `t`. */
function cookNote(t: number): string {
  const tag = t === COOK_TIME ? " (the default)" : t === 1 ? " (as before build #85)" : "";
  return `Cooking takes ${t}x the old time${tag}; patience and the shift clock follow. From the next shift.`;
}

/** The bottom of Settings: dev mode, and with it the progress simulator. */
function devHtml(): string {
  const on = devOn();
  const lvl = simLevel();
  const cur = lvl === null ? "off" : String(lvl);
  // Hidden until five taps on the build line, unless it's already on.
  return `<section class="menu-group menu-devgroup" ${on ? "" : "hidden"}>
    <h3 class="menu-h">${icon("wrench")}Developer</h3>
    ${toggle("dev", "wrench", "Dev mode", on, "Testing tools")}
    <div class="menu-dev" ${on ? "" : "hidden"}>
      ${field("sim", "chart", "Simulate progress", SIM_NOTE[cur], [{ v: "off", label: "Off" }, ...SIM_LEVELS.map((l) => ({ v: String(l), label: `${l}%` }))], cur)}
      ${field("cooktime", "clock", "Cook time", cookNote(cookTime()), COOK_TIMES.map((t) => ({ v: String(t), label: `${t}x` })), String(cookTime()))}
    </div>
  </section>`;
}

function setToggle(btn: HTMLElement, on: boolean): void {
  btn.setAttribute("aria-checked", String(on));
  btn.querySelector(".state")!.textContent = on ? "On" : "Off";
}

async function checkUpdate(btn: HTMLElement, d: MenuDeps): Promise<void> {
  const trail = btn.querySelector<HTMLElement>(".trail")!;
  const main = btn.querySelector<HTMLElement>(".main")!;
  btn.setAttribute("aria-busy", "true");
  trail.textContent = "Checking…";
  const v = await d.checkUpdate();
  btn.removeAttribute("aria-busy");
  if (!v) trail.textContent = "Couldn't reach the server";
  else if (Number(v.build) > Number(CURRENT.build)) {
    btn.dataset.m = "update-now";
    btn.dataset.v = v.build;
    btn.dataset.tone = "accent";
    main.innerHTML = `<b>Update to build #${esc(v.build)}</b><small>${d.inShift() ? "Reloads the game. Today's shift starts over." : "Reloads the game. Your trip is saved."}</small>`;
    trail.innerHTML = icon("forward");
  } else trail.textContent = "You're up to date";
}
