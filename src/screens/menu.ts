/**
 * The in-game menus, as three cards:
 *
 *   openMenu()        the pause menu, in a shift: Resume, Restart, Quit, and doors to the
 *                     menu, Settings and How to Play. Closing it resumes.
 *   openSettings()    Settings on their own: pacing, complexity, sound, graphics, the app.
 *                     From the map's Settings button, and from the pause menu.
 *   openHowTo()       How to Play on its own (howto.ts). From the map's Help button.
 *   openMenuRef()     The menu: every dish, open or locked (menuref.ts).
 *   closeAll()        close everything, without resuming
 *
 *   initMenu(deps)    once, from main.ts
 */
import { hapticsOn, hapticsSupported, setHaptics } from "../audio";
import { buildLabel, CURRENT, reloadTo } from "../update";
import { icon } from "../ui/icons";
import { openHowTo } from "./howto";
import { openMenuRef } from "./menuref";
import { closeAllModals, esc, getDeps, modalDepth, modalOpen, popModal, pushModal, setDeps, type GfxLevel, type MenuDeps } from "./modal";

export type { GfxLevel, MenuDeps } from "./modal";
export { openHowTo } from "./howto";
export { openMenuRef } from "./menuref";

import { COMPLEXITIES, COMPLEXITY, type Complexity } from "../game/complexity";
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../game/difficulty";

const GFX: { id: GfxLevel; label: string; blurb: string }[] = [
  { id: "high", label: "High", blurb: "Soft shadows. Looks its best." },
  { id: "standard", label: "Standard", blurb: "Hard shadows. A little lighter on the battery." },
  { id: "low", label: "Low", blurb: "No shadows, for older or slower phones." },
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

function head(eyebrow: string, title: string, stacked: boolean, closeLabel = "Close"): string {
  return `<header class="menu-head">
    ${stacked ? `<button class="bv-btn icon sm ghost menu-back" data-m="close" aria-label="Back">${icon("back")}</button>` : ""}
    <div class="menu-headtext"><span class="bv-eyebrow">${esc(eyebrow)}</span><h2 class="bv-title">${esc(title)}</h2></div>
    ${stacked ? "" : `<button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="${closeLabel}">${icon("close")}</button>`}
  </header>`;
}

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

/** Open the pause menu. Closing it (Resume, ×, Escape, Back or a tap outside) resumes. */
export function openMenu(over: Partial<MenuDeps> = {}): void {
  const d = resolveDeps(over);
  if (modalOpen("menu")) return;
  const inShift = d.inShift();
  const town = d.town();
  const card = pushModal({
    key: "menu",
    label: "Menu",
    cls: "gamemenu",
    onDismiss: () => {
      if (inShift) d.resume();
    },
    html: `${head(inShift ? "Paused" : (d.subtitle?.() ?? "Menu"), town.name, false, inShift ? "Close and resume" : "Close")}
      <div class="menu-body menu-scroll menu-general">
        ${
          inShift
            ? `<button class="bv-btn primary lg block" data-m="resume">${icon("play")}Resume</button>
          <div class="bv-btn-row inline">
            <button class="bv-btn" data-m="restart">${icon("restart")}Restart</button>
            <button class="bv-btn" data-m="quit">${icon("map")}Quit to map</button>
          </div>
          ${confirmBox("restart", "Start this shift again from the top? Today's customers and takings so far are lost.", "Restart")}
          ${confirmBox("quit", `Leave ${esc(town.name)} for the map? This shift's takings are lost and it won't count.`, "Quit to map")}
          <h3 class="menu-h">${icon("sun")}Today</h3>`
            : ""
        }
        ${row("menuref", "menu-book", "Menu", `${esc(town.name)} · ${town.menu.length} burgers, sides and drinks`)}
        <h3 class="menu-h">${icon("truck")}Bun Voyage</h3>
        ${row("settings", "settings", "Settings", "Pacing, complexity, sound, graphics")}
        ${row("howto", "help", "How to Play", "The grill, the fryer, the drinks, the road")}
        <p class="menu-build bv-mono">${esc(buildLabel())}</p>
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
        openMenuRef(d.town(), { priceMult: d.priceMult?.() ?? 1 });
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

// ---------------------------------------------------------------------------
// Settings

/** Open Settings. Stacks over the pause menu in a shift; stands alone from the map. */
export function openSettings(over: Partial<MenuDeps> = {}): void {
  const d = resolveDeps(over);
  if (modalOpen("settings")) return;
  const inShift = d.inShift();
  const stacked = modalDepth() > 0;
  const gfx = d.gfx();
  const card = pushModal({
    key: "settings",
    label: "Settings",
    cls: "tall settings",
    html: `${head("Bun Voyage", "Settings", stacked)}
      <div class="menu-body menu-scroll menu-general">
        <h3 class="menu-h">${icon("grill")}The game</h3>
        ${field("difficulty", "clock", "Pacing", DIFFICULTY[d.difficulty()].blurb + (inShift ? " New customers feel it straight away." : ""), DIFFICULTIES.map((k) => ({ v: k, label: DIFFICULTY[k].label })), d.difficulty())}
        ${field("complexity", "chart", "Complexity", COMPLEXITY[d.complexity()].blurb, COMPLEXITIES.map((k) => ({ v: k, label: COMPLEXITY[k].label })), d.complexity())}
        <p class="menu-note">${icon("info")}<span>Change either any time. Stepping down keeps your reputation, reviews and upgrades for when you step back up.${inShift ? " Complexity changes take effect with your next shift." : ""}</span></p>
        <h3 class="menu-h">${icon("settings")}Phone</h3>
        ${toggle("sound", d.sound() ? "sound-on" : "sound-off", "Sound", d.sound())}
        ${hapticsSupported() ? toggle("haptics", "vibrate", "Vibration", hapticsOn(), "A buzz on flips, dings and burns") : ""}
        ${field("gfx", "sparkle", "Graphics", GFX.find((g) => g.id === gfx)!.blurb, GFX.map((g) => ({ v: g.id, label: g.label })), gfx)}
        <h3 class="menu-h">${icon("truck")}App</h3>
        ${row("update", "update", "Check for updates", "", "")}
        ${d.canInstall() ? row("install", "pin", "Install the app", "Add Bun Voyage to your home screen and play offline", "") : ""}
        ${row("newtrip", "flag", "Start a new trip", "Back to the first town. Upgrades and savings reset.", "", 'data-tone="danger"')}
        ${confirmBox("newtrip", inShift ? "End this shift and wipe the trip? Towns, upgrades and savings reset; best scores are kept." : "Wipe the trip and start again from the first town? Towns, upgrades and savings reset; best scores are kept.", "Start over")}
        <p class="menu-build bv-mono">${esc(buildLabel())}</p>
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
      case "haptics": {
        const on = !hapticsOn();
        setHaptics(on);
        setToggle(btn, on);
        if (on) navigator.vibrate?.(20);
        break;
      }
      case "difficulty": {
        const v = btn.dataset.v as Difficulty;
        d.setDifficulty(v);
        pickSeg(card, btn, DIFFICULTY[v].blurb + (inShift ? " New customers feel it straight away." : ""));
        break;
      }
      case "complexity": {
        const v = btn.dataset.v as Complexity;
        d.setComplexity(v);
        pickSeg(card, btn, COMPLEXITY[v].blurb);
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
