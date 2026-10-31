/**
 * The game menu: two tabs, General & Settings and How to Play. It opens from the menu button
 * in the truck (the shift waits while it's open) and from the home screen.
 *
 *   initMenu(deps)            once, from main.ts
 *   openMenu({ tab })         the menu (any deps can be overridden for one call)
 *   openHowTo(section?)       How to Play on its own
 *   openMenuRef(town?)        Today's menu
 *   closeAll()                close everything, without resuming
 */
import { hapticsOn, hapticsSupported, setHaptics } from "../audio";
import { buildLabel, CURRENT, reloadTo } from "../update";
import { icon } from "../ui/icons";
import { howToHtml, mountHowTo } from "./howto";
import { openMenuRef } from "./menuref";
import { closeAllModals, esc, getDeps, modalOpen, popModal, pushModal, setDeps, type GfxLevel, type MenuDeps } from "./modal";

export type { GfxLevel, MenuDeps } from "./modal";
export { openHowTo } from "./howto";
export { openMenuRef } from "./menuref";

import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../game/difficulty";

export type MenuTab = "general" | "howto";

const GFX: { id: GfxLevel; label: string; blurb: string }[] = [
  { id: "high", label: "High", blurb: "Soft shadows. Looks its best." },
  { id: "standard", label: "Standard", blurb: "Hard shadows. A little lighter on the battery." },
  { id: "low", label: "Low", blurb: "No shadows, for older or slower phones." },
];

let lastTab: MenuTab = "general";

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

function generalHtml(d: MenuDeps, inShift: boolean): string {
  const town = d.town();
  const gfx = d.gfx();
  const shift = inShift
    ? `<button class="bv-btn primary lg block" data-m="resume">${icon("play")}Resume</button>
      <div class="bv-btn-row inline">
        <button class="bv-btn" data-m="restart">${icon("restart")}Restart</button>
        <button class="bv-btn" data-m="quit">${icon("map")}Quit to map</button>
      </div>
      ${confirmBox("restart", "Start this shift again from the top? Today's customers and takings so far are lost.", "Restart")}
      ${confirmBox("quit", `Leave ${esc(town.name)} for the map? This shift's takings are lost and it won't count.`, "Quit to map")}`
    : "";
  return `${shift}
    ${row("menuref", "menu-book", "Today's menu", `${esc(town.name)} · ${town.menu.length} burgers, sides and drinks`)}
    <h3 class="menu-h">${icon("settings")}Settings</h3>
    <div class="menu-field">
      <span class="lead">${icon("clock")}</span>
      <div class="lbl"><b>Difficulty</b><small data-r="diff-note">${DIFFICULTY[d.difficulty()].blurb}${inShift ? " New customers feel it straight away." : ""}</small></div>
      <div class="bv-seg compact" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((k) => `<button role="radio" aria-pressed="${k === d.difficulty()}" aria-checked="${k === d.difficulty()}" data-m="difficulty" data-v="${k}">${DIFFICULTY[k].label}</button>`).join("")}</div>
    </div>
    ${toggle("sound", d.sound() ? "sound-on" : "sound-off", "Sound", d.sound())}
    ${hapticsSupported() ? toggle("haptics", "vibrate", "Vibration", hapticsOn(), "A buzz on flips, dings and burns") : ""}
    <div class="menu-field">
      <span class="lead">${icon("sparkle")}</span>
      <div class="lbl"><b>Graphics</b><small data-r="gfx-note">${GFX.find((g) => g.id === gfx)!.blurb}</small></div>
      <div class="bv-seg compact" role="radiogroup" aria-label="Graphics">${GFX.map((g) => `<button role="radio" aria-pressed="${g.id === gfx}" aria-checked="${g.id === gfx}" data-m="gfx" data-v="${g.id}">${g.label}</button>`).join("")}</div>
    </div>
    ${toggle("biz", "chart", "Business mode", d.biz(), `Buy ingredients, set prices and pick the menu before each shift. Reviews build a reputation.${inShift ? " Starts with your next shift." : ""}`)}
    <h3 class="menu-h">${icon("truck")}App</h3>
    ${row("update", "update", "Check for updates", "", "")}
    ${d.canInstall() ? row("install", "pin", "Install the app", "Add Bun Voyage to your home screen and play offline", "") : ""}
    ${row("newtrip", "flag", "Start a new trip", "Back to the first town. Upgrades and savings reset.", "", 'data-tone="danger"')}
    ${confirmBox("newtrip", inShift ? "End this shift and wipe the trip? Towns, upgrades and savings reset; best scores are kept." : "Wipe the trip and start again from the first town? Towns, upgrades and savings reset; best scores are kept.", "Start over")}
    <p class="menu-build bv-mono">${esc(buildLabel())}</p>`;
}

/** Open the game menu. In a shift, closing it (Resume, ×, Escape or a tap outside) resumes. */
export function openMenu(over: Partial<MenuDeps> & { tab?: MenuTab } = {}): void {
  const base = getDeps();
  const d = { ...base, ...over } as MenuDeps;
  if (!d.inShift || !d.town) throw new Error("openMenu: call initMenu(deps) first");
  const tab = over.tab ?? lastTab;
  if (modalOpen("menu")) return;
  const inShift = d.inShift();
  const town = d.town();
  const sub = inShift ? `Paused · ${town.name}` : (d.subtitle?.() ?? town.name);
  const card = pushModal({
    key: "menu",
    label: "Menu",
    cls: "tall gamemenu",
    onDismiss: () => {
      if (inShift) d.resume();
    },
    html: `<header class="menu-head">
        <div class="menu-headtext"><span class="bv-eyebrow">${esc(sub)}</span><h2 class="bv-title">Menu</h2></div>
        <button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="${inShift ? "Close and resume" : "Close"}">${icon("close")}</button>
      </header>
      <div class="bv-seg compact menu-tabs" role="tablist">
        <button role="tab" data-m="tab" data-v="general">${icon("settings")}<span>General &amp; Settings</span></button>
        <button role="tab" data-m="tab" data-v="howto">${icon("help")}<span>How to Play</span></button>
      </div>
      <div class="menu-body menu-scroll menu-general" role="tabpanel" data-panel="general">${generalHtml(d, inShift)}</div>
      <div class="menu-body menu-scroll" role="tabpanel" data-panel="howto" hidden>${howToHtml()}</div>`,
  });
  mountHowTo(card.querySelector<HTMLElement>('[data-panel="howto"]')!);
  const showTab = (t: MenuTab) => {
    lastTab = t;
    card.querySelectorAll<HTMLElement>('[data-m="tab"]').forEach((b) => {
      const on = b.dataset.v === t;
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-selected", String(on));
    });
    card.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => {
      p.hidden = p.dataset.panel !== t;
      // A panel shown while hidden measured nothing; nudge its scroll spy.
      if (!p.hidden) p.dispatchEvent(new Event("scroll"));
    });
  };
  showTab(tab);

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
    const m = btn.dataset.m!;
    switch (m) {
      case "close":
      case "resume":
        popModal();
        break;
      case "tab":
        showTab(btn.dataset.v as MenuTab);
        break;
      case "restart":
      case "quit":
      case "newtrip":
        confirm(m);
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
      case "newtrip-yes":
        closeAllModals();
        d.newTrip();
        break;
      case "menuref":
        openMenuRef(d.town(), { priceMult: d.priceMult?.() ?? 1 });
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
      case "biz": {
        const on = !d.biz();
        d.setBiz(on);
        setToggle(btn, on);
        break;
      }
      case "difficulty": {
        const v = btn.dataset.v as Difficulty;
        d.setDifficulty(v);
        btn.parentElement!.querySelectorAll<HTMLElement>("button").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
          b.setAttribute("aria-checked", String(b === btn));
        });
        card.querySelector('[data-r="diff-note"]')!.textContent = DIFFICULTY[v].blurb;
        break;
      }
      case "gfx": {
        const v = btn.dataset.v as GfxLevel;
        d.setGfx(v);
        btn.parentElement!.querySelectorAll<HTMLElement>("button").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
          b.setAttribute("aria-checked", String(b === btn));
        });
        card.querySelector('[data-r="gfx-note"]')!.textContent = GFX.find((g) => g.id === v)!.blurb;
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
