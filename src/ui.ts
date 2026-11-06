import type { Order, Plate } from "./game/types";
import { COOK_SCALE, cookZone, type Cookable } from "./game/cooking";
import { collapseCounted, dishOrder, layerQuality, PATTY_OFF, TIP_MOOD } from "./game/scoring";
import { BREADS, COUNTED, DRINK_COLOR, GARNISH_LABEL, DRINK_LABEL, DRINK_SHORT, extraCount, FRY_LABEL, fryOf, KIND_COLOR, KIND_LABEL, PROTEINS, SUGARED, TORTILLAS, type DrinkId, type FryKind, type Kind } from "./game/types";
import { fountainFor } from "./game/stops";
import { icon } from "./ui/icons";




export interface Ui {
  root: HTMLElement;
  /** Time of day on the truck's clock, and the bar for how far through the shift it is. */
  timer: HTMLElement;
  clockFill: HTMLElement;
  money: HTMLElement;
  rail: HTMLElement;
  tickets: HTMLElement[];
  /** The Ticket rail's early ticket: the next customer's order, peeking out under the bell. */
  peek: HTMLElement;
  /** "Sent back" notes, one over each customer. */
  sentBack: HTMLElement[];
  drinkLabels: HTMLElement[];
  hint: HTMLElement;
  hintText: HTMLElement;
  hintClose: HTMLButtonElement;
  tabs: HTMLButtonElement[];
  menuBtn: HTMLButtonElement;
  /** The service bell: a ring calls the next person in line. */
  bell: HTMLElement;
  /** Undo, at the left of the header: carries the last move back (DESIGN §31). */
  undo: HTMLButtonElement;
  bellCount: HTMLElement;
  bellLabel: HTMLElement;
  title: HTMLElement;
  summary: HTMLElement;
  update: HTMLElement;
  updateText: HTMLElement;
}

/*
 * Counter buttons show a small drawing of each station instead of a word: a fountain cup, the
 * flat-top with patties, the fry basket, inked like the kitchen (see .cbtn in style.css).
 */
const INK = `stroke="#2a2622" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
const TAB_ART: Record<string, string> = {
  Drinks: `<path d="M15.5 12h17l-2.2 19.6a2 2 0 0 1-2 1.8h-8.6a2 2 0 0 1-2-1.8z" fill="#de6f55" ${INK}/>
    <path d="M16.3 18.6h15.4l-.85 7.6H17.15z" fill="#faf7f1" ${INK}/>
    <path d="M19.6 22.6c1.4-1.1 2.8-1.1 4.2 0s2.8 1.1 4.2 0" fill="none" stroke="#de6f55" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="13.5" y="9" width="21" height="3.6" rx="1.8" fill="#f4efe6" ${INK}/>`,
  Grill: `<path d="M13 11.5c-1.2-1.6 1.2-2.6 0-4.4M24 10.5c-1.2-1.6 1.2-2.6 0-4.4M35 11.5c-1.2-1.6 1.2-2.6 0-4.4" fill="none" stroke="#c8472e" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M5 21h38v8.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="#8a8178" ${INK}/>
    <path d="M7.5 21 10 14.5h28L40.5 21z" fill="#4b4640" ${INK}/>
    <ellipse cx="17.5" cy="17.6" rx="5.4" ry="2.3" fill="#8a4a33" ${INK}/>
    <ellipse cx="30.5" cy="17.6" rx="5.4" ry="2.3" fill="#8a4a33" ${INK}/>
    <path d="M26.6 16.1h7.8l-1.2 2.3h-1.6l-.6 1.4-.8-1.4h-2.6z" fill="#f2c14e" ${INK}/>
    <circle cx="11" cy="26.2" r="1.7" fill="#f4efe6" ${INK}/><circle cx="17" cy="26.2" r="1.7" fill="#f4efe6" ${INK}/>`,
  // The Sunny Coast's panini press: a clamshell bay with its lid down on a panini, steam over it.
  Press: `<path d="M16 9.5c-1.2-1.6 1.2-2.6 0-4.4M24 8.5c-1.2-1.6 1.2-2.6 0-4.4M32 9.5c-1.2-1.6 1.2-2.6 0-4.4" fill="none" stroke="#c8472e" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M7 24h34v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#8a8178" ${INK}/>
    <path d="M10.5 21.4h27l.6 2.6H9.9z" fill="#e8b25c" ${INK}/>
    <path d="M10.4 12.6h27.2a1.6 1.6 0 0 1 1.6 1.6v6.2a1 1 0 0 1-1 1H9.8a1 1 0 0 1-1-1v-6.2a1.6 1.6 0 0 1 1.6-1.6z" fill="#b9b2a6" ${INK}/>
    <path d="M13 15.6h22M13 18.4h22" fill="none" stroke="#2a2622" stroke-width="1" opacity=".45"/>
    <path d="M6 20.6h36" fill="none" stroke="#2a2622" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M6 20.6h36" fill="none" stroke="#d8573a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="36.5" cy="28" r="1.6" fill="#ff9a2a" ${INK}/>`,
  // Red Rock's comal: a long black plate with two tortillas warming on it, flames under the hot end.
  Comal: `<path d="M5 22h38v7.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="#8a8178" ${INK}/>
    <path d="M6.5 22 9 15.5h30l2.5 6.5z" fill="#33302c" ${INK}/>
    <ellipse cx="17" cy="18.6" rx="6.2" ry="2.4" fill="#f0cf6a" ${INK}/>
    <ellipse cx="30.5" cy="18.6" rx="6.6" ry="2.5" fill="#f6ecd2" ${INK}/>
    <circle cx="15.4" cy="18.2" r=".8" fill="#b0702e"/><circle cx="18.6" cy="19.2" r=".7" fill="#b0702e"/><circle cx="31.6" cy="18" r=".7" fill="#c98a4a"/>
    <path d="M11 30c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2z" fill="#ff8a2a"/>
    <path d="M17 30c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2z" fill="#ff8a2a"/>
    <path d="M23 30c-1-1.4.4-2.6 0-4 1.2.8 1.6 1.8 1.2 2.6.6-.4.8-1 .6-1.8 1 1 .8 2.4-.2 3.2z" fill="#ff8a2a"/>
    <path d="M13 11.5c-1.2-1.6 1.2-2.6 0-4.4M24 10.5c-1.2-1.6 1.2-2.6 0-4.4" fill="none" stroke="#c8472e" stroke-width="1.4" stroke-linecap="round"/>`,
  // Orchard Isle's deck oven: a square brick oven, open at the front, its back glowing from the heating element, a flatbread on the deck.
  Oven: `<path d="M6 29V9.5A1.5 1.5 0 0 1 7.5 8h33A1.5 1.5 0 0 1 42 9.5V29z" fill="#c8664a" ${INK}/>
    <path d="M6.6 12.4h4.6M36.8 12.4h4.6M6.6 17.6h4.6M36.8 17.6h4.6M6.6 22.8h4.6M36.8 22.8h4.6M8.8 8.4v4M39 12.6v5M8.8 17.8v5M39 23v5.6M18 8.4v3M30 8.4v3M24 11.4v.4" fill="none" stroke="#2a2622" stroke-width="1" opacity=".45"/>
    <path d="M11.5 29V13h25v16z" fill="#4a3326" ${INK}/>
    <path d="M12.2 17.5h23.6v6.8H12.2z" fill="#ff8a2a" opacity=".28"/>
    <rect x="12.6" y="22.6" width="22.8" height="2" rx="1" fill="#ff8a2a"/>
    <path d="M5 28h38v3.2a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 31.2z" fill="#dcc8a4" ${INK}/>
    <ellipse cx="24" cy="27.4" rx="8" ry="2.1" fill="#e8b25c" ${INK}/>
    <circle cx="21.6" cy="27.2" r=".85" fill="#c8402a"/><circle cx="26.2" cy="27.6" r=".85" fill="#c8402a"/>`,
  Fryer: `<path d="M17.5 12.5 16 5M20.5 12.5V3.5M23.5 12.5l1-8M26.5 12.5l1.8-6.6M29.2 12.5l2.4-5.4" fill="none" stroke="#2a2622" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M17.5 12.5 16 5M20.5 12.5V3.5M23.5 12.5l1-8M26.5 12.5l1.8-6.6M29.2 12.5l2.4-5.4" fill="none" stroke="#f0c341" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 19h34v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#b9b2a6" ${INK}/>
    <path d="M7.75 19h32.5v3.2H7.75z" fill="#e0a83a"/>
    <path d="M14 11h19l-1.6 9H15.6z" fill="#e4ded3" ${INK}/>
    <path d="M18.5 11.5v8M23.5 11.5v8M28.5 11.5v8M14.6 15.3h17.8" fill="none" stroke="#2a2622" stroke-width="1" opacity=".55"/>
    <path d="M33 12.5h7.5" fill="none" stroke="#2a2622" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="14" cy="27" r="1.6" fill="#f4efe6" ${INK}/>`,
};
export const tabArt = (page: string) => `<svg class="tab-art" viewBox="0 0 48 36" aria-hidden="true">${TAB_ART[page] ?? ""}</svg>`;

/** Redraw a counter button for the station it leads to: the grill's becomes the panini press at the coast. */
export function setTabArt(tab: HTMLButtonElement | undefined, page: string): void {
  if (!tab || tab.dataset.art === page) return;
  tab.dataset.art = page;
  tab.innerHTML = tabArt(page);
  tab.setAttribute("aria-label", page);
  tab.title = page;
}

export function buildUi(root: HTMLElement, pages: readonly string[]): Ui {
  root.innerHTML = `
  <div class="hud">
    <button class="icon-btn undo-btn" data-r="undo" disabled aria-label="Undo the last move" title="Undo">${icon("undo")}</button>
    <div class="hud-clock" role="timer" aria-label="Shift time">
      <span class="chip" data-r="timer">11:00am</span>
      <span class="hud-bar" aria-hidden="true"><i data-r="clockFill"></i></span>
    </div>
    <span class="chip money" data-r="money">$0</span>
    <span class="spacer"></span>
    <span class="bell-btn line-chip" data-r="bell" hidden role="status" aria-label="People waiting in line">
      ${icon("people")}<span class="bell-count" data-r="bellCount">0</span><span class="bell-label" data-r="bellLabel">in line</span>
    </span>
    <button class="icon-btn" data-r="menuBtn" aria-label="Menu">${icon("menu")}</button>
  </div>
  <div class="rail" data-r="rail"></div>
  ${[0, 1, 2].map((i) => `<div class="ticket" data-r="ticket" data-slot="${i}" hidden></div>`).join("")}
  <div class="ticket stub peek" data-r="peek" aria-label="Next in line" hidden></div>
  ${[0, 1, 2].map(() => `<div class="sentback" data-r="sentback" hidden></div>`).join("")}
  <div class="hint" data-r="hint" role="status" hidden><span data-r="hintText"></span><button class="hint-x" data-r="hintClose" aria-label="Dismiss tip">${icon("close")}</button></div>
  ${fountainFor("mountains").map((d) => `<div class="dlabel" data-r="dlabel" style="--c:${DRINK_COLOR[d]}">${DRINK_SHORT[d]}</div>`).join("")}
  <nav class="cnav" aria-label="Counters">
    ${pages.map((p, i) => `<button class="cbtn" data-r="tab" data-page="${i}" data-lamp="off" aria-label="${p}" title="${p}">${TAB_ART[p] ? tabArt(p) : icon("box")}</button>`).join("")}
  </nav>
  <div class="update" data-r="update" hidden>
    <span data-r="updateText">A new build is ready.</span>
    <button class="later" data-act="update-later">Later</button>
    <button data-act="update-now">Update</button>
  </div>
  <div class="screen" data-r="title"></div>
  <div class="screen" data-r="summary" hidden></div>
  <div class="rotate" aria-live="polite"><div><span class="phone"></span><p>Turn your phone upright to keep cooking.</p></div></div>
  `;
  const q = (r: string) => root.querySelector<HTMLElement>(`[data-r="${r}"]`)!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-r="tab"]')];
  return {
    root,
    timer: q("timer"),
    clockFill: q("clockFill"),
    money: q("money"),
    rail: q("rail"),
    tickets: [...root.querySelectorAll<HTMLElement>('[data-r="ticket"]')],
    peek: q("peek"),
    sentBack: [...root.querySelectorAll<HTMLElement>('[data-r="sentback"]')],
    drinkLabels: [...root.querySelectorAll<HTMLElement>('[data-r="dlabel"]')],
    hint: q("hint"),
    hintText: q("hintText"),
    hintClose: q("hintClose") as HTMLButtonElement,
    tabs,
    menuBtn: q("menuBtn") as HTMLButtonElement,
    bell: q("bell"),
    undo: q("undo") as HTMLButtonElement,
    bellCount: q("bellCount"),
    bellLabel: q("bellLabel"),
    title: q("title"),
    summary: q("summary"),
    update: q("update"),
    updateText: q("updateText"),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);


/** Doneness pills: the same colour and word on the ticket and under the patty on the grill. */
export const DONENESS_PILL: Record<string, { label: string; color: string }> = {
  raw: { label: "Raw", color: "#d27585" },
  rare: { label: "Rare", color: "#c23b48" },
  medium: { label: "Med", color: "#a8642f" },
  well: { label: "Well", color: "#6b4127" },
  burnt: { label: "Burnt", color: "#231915" },
};

/** A patty-shaped pill with white text; `progress` (0..1) draws a bar for how far into that level it is. */
export function donenessPill(d: string, progress?: number, cls = ""): string {
  const p = DONENESS_PILL[d] ?? DONENESS_PILL.medium;
  const bar = progress === undefined ? "" : `<u><i style="width:${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%"></i></u>`;
  return `<span class="dpill ${d} ${cls}" style="--c:${p.color}"><b>${p.label}</b>${bar}</span>`;
}

/**
 * The one doneness meter, for everything that cooks (James's pick M14 from the meter study): a dark
 * pill in a thin black rim, the done range hatched, and a fill that runs edge to edge in one flat
 * colour for the food and where it is (raw pink, cooked brown, dark when over-done for a patty),
 * flashing red and black once burnt. Thin half-clear black lines mark the zone edges on top. No words.
 */
export function cookMeter(kind: Cookable, t: number, variant = ""): string {
  const z = COOK_SCALE[kind];
  const pct = (v: number) => `${((Math.min(z.burnt, Math.max(0, v)) / z.burnt) * 100).toFixed(1)}%`;
  const zone = cookZone(kind, t);
  const flash = zone === "burnt" && Math.floor(performance.now() / 260) % 2 === 0 ? " flash" : "";
  return `<span class="cmeter ${kind}${variant ? ` ${variant}` : ""} ${zone}${flash}" style="--u:${pct(z.done)};--d:${pct(z.over)};--v:${pct(t)}"><b></b></span>`;
}
/**
 * A taco tortilla's meter on the comal (after build #76): cold and stiff reads a cool grey-blue,
 * warm and soft (the ticket's "Warm") the same warm orange as the ticket chip, in a band hatched
 * warm, then brown once it goes hard. Under it, a "Warm" chip once it's there, "Hard" past it.
 */
export function tortillaMeter(kind: "corn" | "flour", t: number): string {
  const zone = cookZone(kind, t);
  const chip = zone === "done" ? `<b class="mlt warm">Warm</b>` : zone === "under" ? "" : `<b class="mlt hard">Hard</b>`;
  return cookMeter(kind, t, "warmup") + chip;
}

/** How a waiting customer feels. The figure at the window and the face on their ticket always agree. */
export function patienceMood(pct: number): "neutral" | "sad" | "angry" {
  return pct >= TIP_MOOD.full ? "neutral" : pct >= TIP_MOOD.half ? "sad" : "angry";
}

function moodFace(mood: "neutral" | "sad" | "angry", critic = false): string {
  const mouth = mood === "neutral" ? "M5.5 11.2h5" : "M5.3 12c1.6-1.6 3.8-1.6 5.4 0";
  const brows = mood === "angry" ? `<path d="M4.4 5.2l2.6 1.2M11.6 5.2l-2.6 1.2"/>` : mood === "sad" ? `<path d="M4.6 6.2l2.4-1M11.4 6.2l-2.4-1"/>` : "";
  return `<svg class="face" viewBox="0 0 16 16" aria-label="${mood}"><circle cx="8" cy="8" r="7.2"/><g><circle cx="5.9" cy="7.6" r="1"/><circle cx="10.1" cy="7.6" r="1"/>${brows}<path d="${mouth}"/></g>${critic ? `<circle class="cdot" cx="13.6" cy="2.6" r="2.6"><title>Food critic</title></circle>` : ""}</svg>`;
}

/** Name the fountain's push-button caps for the drinks it pours, left to right. */
export function setDrinkLabels(ui: Ui, drinks: readonly DrinkId[]): void {
  ui.drinkLabels.forEach((el, i) => {
    const d = drinks[i];
    if (!d) return;
    el.textContent = DRINK_SHORT[d];
    el.style.setProperty("--c", DRINK_COLOR[d]);
    // Clearing the width makes the kitchen refit the type to the new name.
    el.style.width = "";
  });
}

/** Kitchen shorthand for a collapsed ticket, the way a cook calls it across the line. */
const SHORT_NAME: Record<string, string> = {
  "Trailhead Classic": "Trail C",
  "Sunrise Summit": "Sunrise",
  "Campfire Melt": "Camp M",
  "Summit Smash": "Smash",
  "Lumberjack Stack": "Lumber",
  // Sunny Coast paninis
  Caprese: "Caprese",
  "Avocado Toast": "Avo T",
  "Tuna Melt": "Tuna M",
  "Chicken Pesto": "Chk Pst",
  "Veggie Club": "Veg Clb",
  // Red Rock's comal
  "Street Tacos": "Street",
  Quesadilla: "Quesa",
  "Pastor Tacos": "Pastor",
  "Bean Tostada": "Tostada",
  "Breakfast Taco": "Bkfst T",
  "Rodeo Platter": "Rodeo",
  Nachos: "Nachos",
  // phase 1 placeholder burgers for Orchard Isle
  "Cheesy Switchback": "Chz Sw",
  "Sandy Pickle": "Sandy P",
  "Sunset Double": "Sun Dbl",
  // Orchard Isle's flatbreads
  "Harvest Red": "Hvst Red",
  Mushroom: "Mush",
  "Fig & Ham": "Fig Ham",
  "Pear & Blue": "Pear Bl",
  Calzone: "Calzone",
  "Harvest Fair": "Fair",
  Poutine: "Poutine",
};

/** A short name for a recipe: the shorthand above, else initials or a clipped first word. */
export function shortName(name: string): string {
  if (SHORT_NAME[name]) return SHORT_NAME[name];
  const w = name.split(/\s+/);
  if (w.length >= 3) return w.map((x) => x[0]).join("").toUpperCase();
  if (w.length === 2) return `${w[0].slice(0, 5)} ${w[1][0]}`;
  return name.slice(0, 7);
}

/*
 * Ticket icons: one small, simple shape per ingredient (not a drawing), filled with --c so a row
 * can grey them out when stacked or turn them red when stacked wrong. 16x12, outlined lightly so
 * pale ones (egg, onion) still read on the paper.
 */
const ICON_PATH: Record<string, string> = {
  bunTop: `<path d="M1.5 10.5C1.5 4.8 4.6 1.5 8 1.5s6.5 3.3 6.5 9z"/>`,
  bunBottom: `<path d="M1.5 3.5h13v2.2c0 2.9-2.2 4.8-5 4.8H6.5c-2.8 0-5-1.9-5-4.8z"/>`,
  patty: `<rect x="1.2" y="3" width="13.6" height="7" rx="3.5"/>`,
  smashed: `<rect x="0.6" y="4.5" width="14.8" height="4.2" rx="2.1"/>`,
  cheese: `<path d="M1 3.5h14v3.6h-3.2v2.6a1.2 1.2 0 0 1-2.4 0V7.1H1z"/>`,
  lettuce: `<path d="M1 8.5c1-3.5 2.4-3.5 3.5-1.2C5.6 4.6 7 4.6 8 7.3c1-2.7 2.4-2.7 3.5 0 1.1-2.3 2.5-2.3 3.5 1.2v1.5H1z"/>`,
  tomato: `<ellipse cx="8" cy="6.5" rx="6.8" ry="4.3"/><g class="hi"><circle cx="5.5" cy="6.5" r="1"/><circle cx="8" cy="6.5" r="1"/><circle cx="10.5" cy="6.5" r="1"/></g>`,
  onion: `<path fill-rule="evenodd" d="M8 2a6.5 4.5 0 1 0 0 9A6.5 4.5 0 1 0 8 2zm0 2.4a3.6 2.1 0 1 1 0 4.2 3.6 2.1 0 1 1 0-4.2z"/>`,
  pickle: `<ellipse cx="8" cy="6.5" rx="6.5" ry="3.8"/><g class="hi"><circle cx="5.6" cy="6.5" r=".8"/><circle cx="8" cy="5.5" r=".8"/><circle cx="10.4" cy="6.5" r=".8"/><circle cx="8" cy="7.6" r=".8"/></g>`,
  bacon: `<path d="M1 5.2c2.3-2.2 4.7-2.2 7 0s4.7 2.2 7 0v3c-2.3 2.2-4.7 2.2-7 0s-4.7-2.2-7 0z"/>`,
  egg: `<path d="M2 7c0-3 2.6-4.6 5.4-4.6 3.4 0 6.6 1.2 6.6 4.2 0 2.7-2.8 3.9-6 3.9C4.6 10.5 2 9.6 2 7z"/><circle class="yolk" cx="7.6" cy="6.6" r="2.3"/>`,
  ketchup: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  pineapple: `<path fill-rule="evenodd" d="M8 2a6.8 4.6 0 1 0 0 9.2A6.8 4.6 0 1 0 8 2zm0 3.5a1.6 1.1 0 1 1 0 2.2 1.6 1.1 0 1 1 0-2.2z"/>`,
  jalapeno: `<path fill-rule="evenodd" d="M8 2a4.6 4.6 0 1 0 0 9.2A4.6 4.6 0 1 0 8 2zm0 2.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 1 1 0-4.4z"/><g class="hi"><circle cx="8" cy="5.6" r=".7"/><circle cx="6.8" cy="7.4" r=".7"/><circle cx="9.2" cy="7.4" r=".7"/></g>`,
  fries: `<path class="st" d="M4 5.5 3.4 1.6h1.2L5.4 5zM6.4 5 6.2.8h1.2L7.6 5zM9 5l.5-3.9h1.2L10.2 5.4zM11.4 5.5l1-3.2h1.1l-.9 3.6z"/><path d="M2.6 4.6h10.8l-1.3 6.6H3.9z"/>`,
  drink: `<path d="M3.2 2.6h9.6l-1.2 8.9H4.4z"/><rect class="lid" x="2.4" y="1" width="11.2" height="1.8" rx=".9"/>`,
  curds: `<rect x="2" y="5" width="4.6" height="4.6" rx="1"/><rect x="7.2" y="3" width="4.6" height="4.6" rx="1"/><rect x="9" y="7" width="4.6" height="4.2" rx="1"/>`,
  gravy: `<path d="M1.5 6.5c2-1.4 3.6-.4 5-1.6 1.6-1.4 3.6-1 5.2.2 1.3 1 2.3.8 2.8.6v2.6c-1.6 1.6-4.6 2.3-7.5 2.3-2.8 0-4.6-.8-5.5-1.8z"/>`,
  // The Sunny Coast's panini fillings.
  ciabatta: `<rect x="1" y="3.2" width="14" height="6" rx="2.2"/><g class="hi"><path d="M4 5.4h2.2M9.4 6.8h2.4"/></g>`,
  sourdough: `<path d="M1.4 9.4V6.6C1.4 3.6 4.3 2 8 2s6.6 1.6 6.6 4.6v2.8z"/>`,
  chicken: `<path d="M1.4 7.2c0-2.6 2.8-4.2 6.4-4.2 3.6 0 6.8 1.4 6.8 3.8 0 2.4-3 3.6-6.4 3.6-3.8 0-6.8-.8-6.8-3.2z"/>`,
  veggie: `<rect x="1.2" y="3" width="13.6" height="7" rx="3.5"/><g class="hi"><circle cx="5" cy="5.6" r=".8"/><circle cx="9.6" cy="7.4" r=".8"/><circle cx="11.4" cy="5" r=".8"/></g>`,
  mozzarella: `<circle cx="8" cy="6.5" r="4.8"/>`,
  basil: `<path d="M8 1.6c3.8 1.4 5.6 4.6 4 8.2-1.4.6-2.8.6-4 .2-1.2.4-2.6.4-4-.2-1.6-3.6.2-6.8 4-8.2z"/>`,
  avocado: `<path fill-rule="evenodd" d="M8 1.2c2.4 0 3.6 2.6 4.6 4.6 1 2 1 5.2-4.6 5.2s-5.6-3.2-4.6-5.2C4.4 3.8 5.6 1.2 8 1.2zm0 5.2a2 2 0 1 0 0 4 2 2 0 1 0 0-4z"/>`,
  rocket: `<path d="M1 9.6c1.4-3 2.4-5.6 4-6.4.4 1.6-.2 3 .6 3.8 1-2 2-3.6 3.4-4.2.2 1.8-.4 3.2.4 4 1-1.4 2.6-2.4 4.6-2.8-.6 2.4-1.8 4.4-3.4 5.6z"/>`,
  cheddar: `<path d="M1 3.5h14v3.6h-3.2v2.6a1.2 1.2 0 0 1-2.4 0V7.1H1z"/>`,
  redonion: `<path fill-rule="evenodd" d="M8 2a6.5 4.5 0 1 0 0 9A6.5 4.5 0 1 0 8 2zm0 2.4a3.6 2.1 0 1 1 0 4.2 3.6 2.1 0 1 1 0-4.2z"/>`,
  tuna: `<path d="M1.6 9.6c0-3.2 2.8-5.8 6.4-5.8s6.4 2.6 6.4 5.8z"/><g class="hi"><path d="M5 7.2l1.4 1M8.4 6l1.2 1.2M10.6 7.6l.8.8"/></g>`,
  pesto: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  aioli: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  // Red Rock's comal.
  corn: `<ellipse cx="8" cy="6.5" rx="7" ry="4.2"/><g class="hi"><circle cx="5.4" cy="5.6" r=".8"/><circle cx="9.8" cy="7.6" r=".8"/></g>`,
  flour: `<ellipse cx="8" cy="6.5" rx="7.2" ry="4.4"/><g class="hi"><circle cx="6" cy="7.4" r=".8"/><circle cx="10.4" cy="5.4" r=".7"/></g>`,
  pork: `<rect x="1.6" y="4.4" width="4.4" height="3.8" rx="1"/><rect x="6" y="2.8" width="4.6" height="4" rx="1"/><rect x="9.4" y="6.2" width="4.8" height="3.8" rx="1"/>`,
  beans: `<path d="M1.4 9.6c.6-3.4 3.4-5.6 6.6-5.6s6 2.2 6.6 5.6z"/>`,
  cilantro: `<path d="M8 1.6c2.8 1 3.4 3.6 2.4 5.6 1.8-.6 3.6.4 3.6 2.4-2.6 1.2-4.6.8-6-.6-1.4 1.4-3.4 1.8-6 .6 0-2 1.8-3 3.6-2.4C4.6 5.2 5.2 2.6 8 1.6z"/>`,
  lime: `<path d="M1.4 9.4A6.6 6.6 0 0 1 14.6 9.4z"/>`,
  jack: `<path d="M1.6 4.2l5 1.2M3 8.4l5.4-1.4M8.6 3.4l5.6 2M9 9.2l5-1" class="st"/><rect x="2" y="3.6" width="5" height="1.4" rx=".7"/><rect x="3" y="7.2" width="5.4" height="1.4" rx=".7"/><rect x="8.6" y="3.8" width="5.6" height="1.4" rx=".7"/><rect x="9" y="8" width="5" height="1.4" rx=".7"/>`,
  tostada: `<ellipse cx="8" cy="6.8" rx="7.2" ry="3.6"/>`,
  redsalsa: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  greensalsa: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  crema: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  chips: `<path d="M1.4 10.4 5 2.2l4 8.2zM7.6 9.8l3.8-7.6 3.4 7.8z"/>`,
  queso: `<path d="M1.5 6.5c2-1.4 3.6-.4 5-1.6 1.6-1.4 3.6-1 5.2.2 1.3 1 2.3.8 2.8.6v2.6c-1.6 1.6-4.6 2.3-7.5 2.3-2.8 0-4.6-.8-5.5-1.8z"/>`,
  // Orchard Isle's hearth oven.
  dough: `<ellipse cx="8" cy="6.5" rx="7.2" ry="4.6"/><ellipse class="hi" cx="8" cy="6.5" rx="5" ry="2.8"/>`,
  calzone: `<path d="M1.2 9.6C1.2 5 4.2 2 8 2s6.8 3 6.8 7.6z"/><g class="hi"><path d="M2.6 9.2h10.8"/></g>`,
  redsauce: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  oil: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  honey: `<path d="M8 1.2c1.6 2.4 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 2.6-4.7 4.2-7.1z"/>`,
  mushroom: `<path d="M1.4 7c0-3 3-5 6.6-5s6.6 2 6.6 5z"/><rect x="6" y="6.6" width="4" height="4.4" rx="1.2"/>`,
  ham: `<path d="M1.6 4c3-1.6 9.8-1.6 12.8 0v4.6c-3 1.6-9.8 1.6-12.8 0z"/><g class="hi"><path d="M4 6.2c2.4-.8 5.6-.8 8 0"/></g>`,
  fig: `<circle cx="8" cy="6.6" r="4.8"/><g class="hi"><circle cx="8" cy="6.6" r="2.2"/></g>`,
  pear: `<path d="M2 9.4C4 4.4 8.6 2 14 2.6 12.6 8 8 10.6 2 9.4z"/>`,
  blue: `<rect x="2" y="4.6" width="4.4" height="4" rx="1"/><rect x="7" y="2.6" width="4.4" height="4" rx="1"/><rect x="9.6" y="6.6" width="4.4" height="4" rx="1"/><g class="hi"><circle cx="4" cy="6.6" r=".7"/><circle cx="9.2" cy="4.6" r=".7"/></g>`,
  fritters: `<circle cx="5" cy="7" r="3.6"/><circle cx="11" cy="6" r="3.6"/>`,
};

/** Compact ticket names for the comal's pieces ("Corn x3" rather than "Corn tortilla x3"). */
const TICKET_LABEL: Partial<Record<Kind, string>> = { corn: "Corn", flour: "Flour", tostada: "Tostada", greensalsa: "Salsa verde", redsalsa: "Salsa roja", redsauce: "Sauce", blue: "Blue", mozzarella: "Mozz" };
const ticketLabel = (k: Kind) => TICKET_LABEL[k] ?? KIND_LABEL[k];
/** A side's colour and name on a ticket, by what it's fried from. */
const FRY_COLOR: Record<FryKind, string> = { fries: "#f3d36b", sweet: "#f08a3a", chips: "#ebbe4a", churros: "#c9843a", zucchini: "#9cc25a", fritters: "#d9964a" };
const FRY_ICON: Record<FryKind, string> = { fries: "fries", sweet: "fries", chips: "chips", churros: "fries", zucchini: "fries", fritters: "fritters" };

const ticketIcon = (name: string, color: string) =>
  `<svg class="ic" viewBox="0 0 16 12" style="--c:${color}" aria-hidden="true">${ICON_PATH[name] ?? ICON_PATH.patty}</svg>`;

/** A press coming down on a patty: the "smash" modifier, as a box. */
const SMASH_SVG = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.2h6v2.4H7v2.2h1.8L6 8.4 3.2 5.8H5V3.6H3z"/><rect x="1" y="9.4" width="10" height="1.8" rx=".9"/></svg>`;
const modBox = (cls: string, text: string, title = text) => `<span class="mb ${cls}" title="${title}">${text}</span>`;

type RowState = "" | "done" | "wrong";
interface TicketRow {
  icon: string;
  color: string;
  label: string;
  /** Pills, modifier boxes and counts after the label. */
  tail: string;
  state: RowState;
  /** Changed from the menu: an extra, an add-on or a leave-off. */
  mod: boolean;
  /** The next thing to put on the plate. */
  next: boolean;
  /** A piece on the plate the order has no line for. */
  extra?: boolean;
  /** A leave-off ("NO Ketchup"). */
  removed?: boolean;
  /** How many go on ("×3"), or how far a short count has got ("2/3"): its own column on the ticket. */
  count?: string;
}

/**
 * One build line on a grid the whole list shares (O1 "Clean receipt" from the ticket study, after
 * build #88): icon | label | count | chips | tick, so counts and chips line up in columns. Done
 * lines go grey with a tick; strike-through is kept for a leave-off ("NO Ketchup").
 */
function rowHtml(r: TicketRow): string {
  const cls = [r.state, r.mod ? "mod" : "", r.next ? "next" : "", r.removed ? "rm" : ""].filter(Boolean).join(" ");
  const mark = r.state === "done" ? "✓" : r.state === "wrong" ? "✕" : "";
  return `<li class="${cls}" style="--k:${r.color}"><span class="i">${ticketIcon(r.icon, r.color)}</span><span class="l">${r.label}</span><span class="ct">${r.count ?? ""}</span><span class="cx">${r.tail}</span><span class="mk">${mark}</span></li>`;
}
/** Layers already on, folded into one grey line that still names them (a long build, see fitTicket). */
function doneRow(done: TicketRow[]): string {
  const names = done.filter((r) => !r.removed).map((r) => r.label.replace(/<b class="kw">[^<]*<\/b>\s*/g, "").replace(/<[^>]+>/g, "").trim() + (r.count ? ` ${r.count}` : ""));
  return `<li class="done sum"><span class="i"></span><span class="l">${names.join(" · ")}</span><span class="ct"></span><span class="cx"></span><span class="mk">✓</span></li>`;
}

/** What kind of dish an order is, from its bottom layer. */
type Dish = "burger" | "panini" | "toast" | "tacos" | "quesadilla" | "tostada" | "flatbread" | "calzone";
export function dishOf(order: Order): Dish {
  const ls = order.layers;
  const base = ls[0];
  if (!base) return "burger";
  if (BREADS.has(base.kind)) return ls.length > 1 && BREADS.has(ls[ls.length - 1].kind) ? "panini" : "toast";
  if (TORTILLAS.has(base.kind)) return base.folded ? "quesadilla" : "tacos";
  if (base.kind === "tostada") return "tostada";
  if (base.kind === "dough") return base.folded ? "calzone" : "flatbread";
  return "burger";
}
/**
 * The steps for the whole dish, in order, for the line at the top of the build (after build #76):
 * a panini is pressed whole (and cut at Harbor City), a quesadilla folded and flipped, a flatbread
 * baked (a calzone folded first; cut in four at Port Amber). Burgers, tacos, tostadas and open
 * toasts have none: their steps belong to single ingredients.
 */
export function methodOf(order: Order): { cls: string; text: string }[] {
  const dish = dishOf(order);
  if (dish === "panini") return [{ cls: "toast", text: "Press" }, ...(order.slice ? [{ cls: "cut opt", text: "Cut?" }] : [])];
  if (dish === "quesadilla") return [{ cls: "fold", text: "Fold" }, { cls: "flip", text: "Flip" }];
  if (dish === "flatbread" || dish === "calzone")
    return [...(dish === "calzone" ? [{ cls: "fold", text: "Fold" }] : []), { cls: "toast", text: "Bake" }, ...(order.slice ? [{ cls: "cut opt", text: "Cut 4?" }] : [])];
  return [];
}
/** The method line: the dish's steps as chips, in order, above the build. */
function methodHtml(order: Order): string {
  const steps = methodOf(order);
  if (!steps.length) return "";
  return `<div class="how">${steps.map((s) => modBox(s.cls, s.text)).join('<i aria-hidden="true">›</i>')}</div>`;
}

/** The build, top of the burger first, compared against what's on the plate so far. */
function buildRows(order: Order, plate: Plate): TicketRow[] {
  const rows: TicketRow[] = [];
  if (order.poutine && !order.layers.length) {
    const f = plate.fries;
    const fry = fryOf(order);
    const fryState: RowState = !f ? "" : f.size === order.friesSize && fryOf(f) === fry ? "done" : "wrong";
    // Nachos (Red Rock): chips, jalapeños and queso where a poutine has fries, curds and gravy.
    const nachos = fry === "chips";
    const parts: [string, string, string, RowState][] = [
      [FRY_ICON[fry], FRY_COLOR[fry], `<i class="sz">${order.friesSize}</i>${FRY_LABEL[fry]}`, fryState],
      nachos ? ["jalapeno", KIND_COLOR.jalapeno, "Jalapeños", f?.curds ? (fryState === "wrong" ? "wrong" : "done") : ""] : ["curds", "#f5edcf", "Cheese curds", f?.curds ? (fryState === "wrong" ? "wrong" : "done") : ""],
      nachos ? ["queso", "#f2b632", "Queso", f?.gravy ? (f.curds && fryState !== "wrong" ? "done" : "wrong") : ""] : ["gravy", "#6e4020", "Gravy", f?.gravy ? (f.curds && fryState !== "wrong" ? "done" : "wrong") : ""],
    ];
    const next = parts.findIndex((p) => !p[3]);
    const wrong = parts.some((p) => p[3] === "wrong");
    parts.forEach(([icon, color, label, state], i) => rows.push({ icon, color, label, tail: "", state, mod: false, next: !wrong && i === next }));
    return rows.reverse();
  }
  if (!order.layers.length) {
    // Just a drink and/or fries: they are the whole order, so they get the main list.
    const f = plate.fries;
    const d = plate.drink;
    if (order.fries) {
      const fry = fryOf(order);
      const state: RowState = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy && fryOf(f) === fry ? "done" : "wrong";
      rows.push({ icon: FRY_ICON[fry], color: FRY_COLOR[fry], label: `<i class="sz">${order.friesSize}</i>${FRY_LABEL[fry]}`, tail: SUGARED.has(fry) ? modBox("sugar", "Sugar") : "", state, mod: false, next: false });
    }
    if (order.drink) {
      const iceOk = order.ice == null || !!d?.ice === order.ice;
      const state: RowState = !d ? "" : d.flavor !== order.drink || d.size !== order.drinkSize || !iceOk ? "wrong" : d.lid ? "done" : "";
      const ice = order.ice === true ? modBox("ice", "Ice") : order.ice === false ? modBox("noice", "No ice") : "";
      rows.push({ icon: "drink", color: DRINK_COLOR[order.drink], label: `<i class="sz">${order.drinkSize}</i>${DRINK_LABEL[order.drink]}`, tail: ice, state, mod: false, next: false });
    }
    const next = rows.find((r) => !r.state);
    if (next && !rows.some((r) => r.state === "wrong")) next.next = true;
    return rows;
  }
  // Runs of counted toppings are one layer; a layer is done once it has its full count.
  // A taco plate's pieces can go on in any order (dishOrder): tortillas first, then the fillings.
  const stacked = collapseCounted(dishOrder(order.layers, plate.layers));
  // Which ticket line each add-on or extra changed: the added layer sits highest of its kind.
  const addedAt = new Map<number, "add" | "extra">();
  for (const m of order.mods) {
    if (m.type !== "add" && m.type !== "extra") continue;
    const i = order.layers.map((l) => l.kind).lastIndexOf(m.kind);
    if (i >= 0) addedAt.set(i, COUNTED.has(m.kind) && m.type === "extra" ? "extra" : "add");
  }
  // The ticket is forgiving (the score isn't): each piece on the plate ticks off the lowest
  // ticket line of its kind still open, wherever it went in the stack, so a slip never asks for
  // another copy. A raw or burnt patty, or a counted topping left short under other
  // layers, still counts but shows red. Pieces the order has no line for are listed in red,
  // crossed out, where they sit. A short count still on top is just unfinished.
  const states: RowState[] = order.layers.map(() => "");
  const got: number[] = order.layers.map(() => 0);
  /** For each stack layer, the ticket line it ticked off, or -1 when the order has none for it. */
  const matchOf: number[] = stacked.map(() => -1);
  let partialIdx = -1;
  stacked.forEach((st, j) => {
    const i = order.layers.findIndex((exp, k) => exp.kind === st.piece.kind && !states[k] && k !== partialIdx);
    if (i < 0) return;
    matchOf[j] = i;
    got[i] = st.count;
    const exp = order.layers[i];
    if (st.count < (exp.count ?? 1)) {
      if (j === stacked.length - 1) partialIdx = i;
      else states[i] = "wrong";
    } else if (exp.kind === "patty" && layerQuality(exp, st.piece)[0] < PATTY_OFF) states[i] = "wrong";
    else states[i] = "done";
  });
  const nextIdx = partialIdx >= 0 ? partialIdx : states.findIndex((st) => !st);
  const removed = order.removed ?? order.mods.filter((m) => m.type === "no").map((m) => ({ kind: m.kind, at: order.layers.length - 1 }));
  // Extras sit just above the ticket line matched by the nearest piece under them (-1: at the very bottom).
  const extrasAt = new Map<number, TicketRow[]>();
  let below = -1;
  stacked.forEach((st, j) => {
    if (matchOf[j] >= 0) {
      below = matchOf[j];
      return;
    }
    const k = st.piece.kind;
    const icon = k === "bun" ? (j === 0 ? "bunBottom" : "bunTop") : k;
    const row: TicketRow = { icon, color: KIND_COLOR[k], label: ticketLabel(k), count: st.count > 1 ? `×${st.count}` : undefined, tail: "", state: "wrong", mod: false, next: false, extra: true };
    extrasAt.set(below, [row, ...(extrasAt.get(below) ?? [])]);
  });
  // Extras above the top of the build go first in the list.
  rows.push(...(extrasAt.get(order.layers.length - 1) ?? []));
  const dish = dishOf(order);
  for (let i = order.layers.length - 1; i >= 0; i--) {
    const exp = order.layers[i];
    let icon: string = exp.kind;
    let label = ticketLabel(exp.kind);
    let tail = "";
    let count: string | undefined;
    // Steps for the whole dish are on the method line (methodOf); a line only carries a step of its own.
    if (exp.kind === "dough") {
      // Baked in the deck oven (a calzone folded first): on the method line.
      if (exp.folded) icon = "calzone";
      label = exp.folded ? "Calzone" : "Dough";
    } else if (exp.after) tail = modBox("cold", "After");
    else if (TORTILLAS.has(exp.kind)) {
      // Taco tortillas are each warmed on the comal till soft (the meter's warm band); a
      // quesadilla's fold and flip are on the method line.
      if (!exp.folded) tail = modBox("warm", "Warm");
    } else if (exp.kind === "tostada") tail = modBox("toast", "Fry corn");
    else if (exp.kind === "bun") {
      icon = i === 0 ? "bunBottom" : "bunTop";
      if (exp.toasted) tail = modBox("toast", "Toast");
    } else if (BREADS.has(exp.kind)) {
      // A closed panini is pressed whole (the method line); an open toast's bread on its own.
      if (dish !== "panini") tail = modBox("toast", "Press");
    } else if (PROTEINS.has(exp.kind)) tail = modBox("toast", "Press first");
    else if (exp.cold) tail = modBox("cold", "Cold");
    else if (exp.kind === "patty") {
      if (exp.smashed) icon = "smashed";
      if (exp.smashed) tail = `<span class="mb smash" title="Smash">${SMASH_SVG}</span>`;
    } else if (exp.kind === "egg") tail = exp.flipped ? modBox("flip", "Flip") : modBox("sunny", "Sunny");
    else if (exp.kind === "pineapple") tail = modBox("grill", order.layers[0] && TORTILLAS.has(order.layers[0].kind) ? "Char" : "Grill");
    // Cheese melted on a burger's patty is a step of its own; in a panini, a quesadilla or on a
    // flatbread it melts as the dish cooks.
    else if (exp.melted && dish === "burger") tail = modBox("melt", "Melt");
    // "ADD Bacon", "ADD Tomato x2": an add-on, or the added copy of a doubled layer. A counted
    // topping asked for extra keeps its one line with the full count and says how many are added.
    const add = addedAt.get(i);
    if (add === "add") label = `${kw("ADD")}${label}`;
    // A count of one ("Onion x1") says nothing; it shows while short or when some are added.
    if (exp.count && (exp.count > 1 || add === "extra")) {
      const short = got[i] && got[i] < exp.count;
      // No "x1" (one onion on a taco is just "Onion").
      if (exp.count > 1 || short) count = short ? `${got[i]}/${exp.count}` : `×${exp.count}`;
      if (add === "extra") tail = modBox("add", `ADD ${extraCount(exp.kind)}`) + tail;
    } else if (add === "extra") label = `${kw("ADD")}${label}`;
    for (const r of removed.filter((r) => r.at === i + 1)) rows.push(removedRow(r.kind, states[i + 1] ?? ""));
    if (i < order.layers.length - 1) rows.push(...(extrasAt.get(i) ?? []));
    rows.push({ icon, color: KIND_COLOR[exp.kind], label, count, tail, state: states[i], mod: !!add, next: i === nextIdx });
  }
  rows.push(...(extrasAt.get(-1) ?? []));
  for (const r of removed.filter((r) => r.at === 0)) rows.push(removedRow(r.kind, states[0] ?? ""));
  return rows;
}

/** A keyword in front of a line: "NO Ketchup", "ADD Bacon". */
const kw = (w: string) => `<b class="kw">${w}</b> `;

/** "NO Ketchup": a leave-off, where it would have gone. Crossed off once the layer above it is on. */
function removedRow(kind: Order["layers"][number]["kind"], above: RowState): TicketRow {
  const icon = kind === "bun" ? "bunTop" : kind;
  return { icon, color: KIND_COLOR[kind], label: `${kw("NO")}${KIND_LABEL[kind]}`, tail: "", state: above === "done" ? "done" : "", mod: true, next: false, removed: true };
}

/** A side on the ticket: what it is, its size, its marks (Ice / No ice / garnish / Sugar) and whether it's on the tray. */
interface SideItem {
  icon: string;
  color: string;
  size: string;
  name: string;
  short: string;
  /** Ice or No ice: the cook's choice, so on every ticket. */
  marks: string;
  /** Sugar on fritters, a local drink's garnish: they always go on, so only the open ticket says so. */
  always: string;
  state: RowState;
}
/** The fries and drink with a main, or a poutine's drink, or the sides that are the whole order. */
function sidesOf(order: Order, plate: Plate | null): SideItem[] {
  const out: SideItem[] = [];
  if (order.fries && !(order.poutine && !order.layers.length)) {
    const fry = fryOf(order);
    const f = plate?.fries;
    const state: RowState = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy && fryOf(f) === fry ? "done" : "wrong";
    out.push({ icon: FRY_ICON[fry], color: FRY_COLOR[fry], size: order.friesSize, name: FRY_LABEL[fry], short: FRY_LABEL[fry], marks: "", always: SUGARED.has(fry) ? modBox("sugar", "Sugar") : "", state });
  }
  if (order.drink) {
    const d = plate?.drink;
    const iceOk = order.ice == null || !!d?.ice === order.ice;
    const state: RowState = !d ? "" : d.flavor !== order.drink || d.size !== order.drinkSize || !iceOk ? "wrong" : d.lid ? "done" : "";
    const ice = order.ice === true ? modBox("ice", "Ice") : order.ice === false ? modBox("noice", "No ice") : "";
    // The local drink's garnish (Coast cucumber, Red Rock lime, Isle apple), dropped on from the dish.
    const garnish = order.garnish ? modBox("garn", `+ ${GARNISH_LABEL[order.garnish]}`) : "";
    out.push({ icon: "drink", color: DRINK_COLOR[order.drink], size: order.drinkSize, name: DRINK_LABEL[order.drink], short: DRINK_SHORT[order.drink], marks: ice, always: garnish, state });
  }
  return out;
}
/**
 * A side in one grammar on every ticket: [icon] [size] name, then its marks. `inline` keeps the
 * marks on the name's line (fitTicket stacks them under the name when they don't fit). A side on
 * the tray shows its tick (or a red cross) where its icon was.
 */
function sideLine(sd: SideItem, { short = false, next = false, inline = false, small = false } = {}): string {
  const marks = small ? sd.marks : sd.marks + sd.always;
  const ic = sd.state ? `<b class="st">${sd.state === "done" ? "✓" : "✕"}</b>` : ticketIcon(sd.icon, sd.color);
  return `<div class="sd ${inline ? "inl" : "stk"} ${sd.state}${next ? " next" : ""}"><span class="i">${ic}</span><i class="sz">${sd.size}</i><span class="sn">${esc(short ? sd.short : sd.name)}</span>${marks ? `<span class="sm">${marks}</span>` : ""}</div>`;
}

/** Short side names for a stub, where the size letter does most of the work (plain fries need no word). */
const FRY_SHORT: Record<FryKind, string> = { fries: "", sweet: "Sweet", chips: "Chips", churros: "Churros", zucchini: "Zucchini", fritters: "Fritters" };

/**
 * The sides on a stub (James, after build #87): enough to make them without opening the ticket,
 * for a cook who knows the recipes: the fries' size (and kind when it isn't plain fries), the
 * drink's size and flavour, and ice asked for or left out. Each greys out once it's on the tray
 * right, or turns red when it's wrong. (A local drink's garnish and a fritter's sugar always go
 * on, so they aren't spelled out here; the open ticket has them.)
 */
function sideChips(order: Order, plate: Plate | null): string {
  const out: string[] = [];
  if (order.fries && order.layers.length) {
    const fry = fryOf(order);
    const f = plate?.fries;
    const state = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy && fryOf(f) === fry ? "done" : "wrong";
    out.push(`<li class="${state}" aria-label="${order.friesSize} ${FRY_LABEL[fry]}">${ticketIcon(FRY_ICON[fry], FRY_COLOR[fry])}<i class="sz">${order.friesSize}</i>${FRY_SHORT[fry] ? `<span class="dn">${FRY_SHORT[fry]}</span>` : ""}</li>`);
  }
  if (order.drink) {
    const d = plate?.drink;
    const iceOk = order.ice == null || !!d?.ice === order.ice;
    const state = !d ? "" : d.flavor !== order.drink || d.size !== order.drinkSize || !iceOk ? "wrong" : d.lid ? "done" : "";
    const ice = order.ice === true ? `<b class="kw">ICE</b>` : order.ice === false ? `<b class="kw">NO ICE</b>` : "";
    out.push(`<li class="${state}" aria-label="${order.drinkSize} ${DRINK_LABEL[order.drink]}${order.ice === true ? ", ice" : order.ice === false ? ", no ice" : ""}">${ticketIcon("drink", DRINK_COLOR[order.drink])}<i class="sz">${order.drinkSize}</i><span class="dn">${DRINK_SHORT[order.drink]}</span>${ice}</li>`);
  }
  return out.length ? `<ul class="sc">${out.join("")}</ul>` : "";
}

/**
 * The tip coin on the ticket (after build #78): the tip steps down with the customer's mood, so the
 * coin is whole while they look calm, half once they look sad, and gone once they're angry.
 */
function tipCoin(pct: number): string {
  const share = pct >= TIP_MOOD.full ? "full" : pct >= TIP_MOOD.half ? "half" : "none";
  return `<i class="tipc ${share}" title="${share === "full" ? "Full tip" : share === "half" ? "Half tip" : "No tip"}" aria-label="${share === "full" ? "Full tip" : share === "half" ? "Half tip" : "No tip"}">$</i>`;
}

/** What an order changes from the menu, for the folded stub: "NO Pickles", "ADD Bacon", "Toast". */
export function exceptions(order: Order): string[] {
  const out = order.mods.map((m) => {
    if (m.type === "toast") return `${kw("TOAST")}Bun`;
    const label = KIND_LABEL[m.kind];
    if (m.type === "no") return `${kw("NO")}${label}`;
    return `${kw("ADD")}${m.type === "extra" && COUNTED.has(m.kind) ? `${extraCount(m.kind)} ` : ""}${label}`;
  });
  return out;
}

/**
 * Ticket HTML for the focus rail. The order being worked on (`focused`) is a full receipt: patience,
 * the name, then the whole build top to bottom with the fries and drink beside it. The others are
 * stubs: patience, a short name, doneness and how much is left. `fold` squeezes a long build by
 * folding the layers already stacked into one line.
 */
/** The Ticket rail's early ticket: no patience bar yet, just who's next and what they'll want. */
export function peekHtml(order: Order): string {
  const ex = exceptions(order);
  return `<div class="nx">Next up</div>
    <div class="name"><span class="l">${esc(shortName(order.name))}</span></div>
    ${ex.length ? `<ul class="ex">${ex.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}${sideChips(order, null)}`;
}

/**
 * Ticket HTML for the focus rail: O1 "Clean receipt" from the ticket study (after build #88).
 *
 * Small (`focused` false): patience, the name, a progress strip with one segment per layer, the
 * changes from the menu, then every side with its size, name and marks: enough to finish the order
 * without opening it, for a cook who knows the recipes.
 *
 * Open: the whole build top first on one grid, the dish's steps under the name, the sides in a
 * footer. `level` (0-4) squeezes a long build to fit: fold the layers already on into one line,
 * tighten, put the steps beside the name, then the name beside the
 * patience bar. `width` is the ticket's width in px.
 */
export function ticketHtml(order: Order, plate: Plate, patience: number, focused: boolean, level = 0, width = 300): string {
  const pct = Math.max(0, Math.min(1, patience));
  const mood = patienceMood(pct);
  const bar = `<span class="bar"><i style="width:${(pct * 100).toFixed(0)}%"></i></span>`;
  const sidesOnly = !order.layers.length && !order.poutine;
  const title = sidesOnly ? "Sides" : order.name;
  const nameDiv = (cls = "") => `<div class="name${cls}" data-short="${esc(sidesOnly ? "Sides" : shortName(order.name))}"><span class="l">${esc(title)}</span></div>`;
  const rows = buildRows(order, plate);
  const sides = sidesOf(order, plate);
  if (!focused) {
    const ex = exceptions(order);
    const badge = width >= 110;
    const pips = sidesOnly
      ? ""
      : `<div class="pips" aria-hidden="true">${rows
          .filter((r) => !r.removed && !r.extra)
          .reverse()
          .map((r) => `<i class="${r.state}${r.next ? " nx" : ""}"></i>`)
          .join("")}</div>`;
    return `<div class="pat ${mood}">${moodFace(mood, !!order.critic && !badge)}${bar}${tipCoin(pct)}${order.critic && badge ? `<em class="critic" title="Food critic">Critic</em>` : ""}</div>
      ${nameDiv(" sm")}${pips}
      ${ex.length ? `<div class="cgs">${ex.map((e) => `<div class="cg">${e}</div>`).join("")}</div>` : ""}
      ${sides.length ? `<div class="sds">${sides.map((x) => sideLine(x, { short: width < 110, small: true })).join("")}</div>` : ""}`;
  }
  const how = methodHtml(order);
  const head =
    level >= 4
      ? `<div class="pat cmp ${mood}">${moodFace(mood, !!order.critic)}${nameDiv()}${bar}${tipCoin(pct)}</div>${how}`
      : `<div class="pat ${mood}">${moodFace(mood)}${bar}${tipCoin(pct)}${order.critic ? `<em class="critic" title="Food critic">Critic</em>` : ""}</div>` +
        (level >= 3 && how ? `<div class="nmrow">${nameDiv()}${how}</div>` : nameDiv() + how);
  if (sidesOnly) {
    const next = sides.findIndex((x) => !x.state);
    return `${head}<div class="sds main">${sides.map((x, i) => sideLine(x, { next: i === next, inline: true })).join("")}</div>`;
  }
  let list = rows;
  let folded = "";
  if (level >= 1) {
    const done = rows.filter((r) => r.state === "done");
    if (done.length > 1) {
      list = rows.filter((r) => r.state !== "done");
      folded = doneRow(done);
    }
  }
  // Fries and drink side by side only where both fit with their marks.
  const cols = sides.length > 1 && width >= 250;
  const foot = sides.length ? `<div class="foot${cols ? " cols" : ""}">${sides.map((x) => sideLine(x, { short: cols && width < 250, inline: !cols })).join("")}</div>` : "";
  return `${head}<div class="tb"><ol class="bl">${list.map(rowHtml).join("")}${folded}</ol></div>${foot}`;
}
