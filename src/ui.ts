import type { Order, Plate } from "./game/types";
import { collapseCounted, layerQuality, PATTY_OFF } from "./game/scoring";
import { DRINK_COLOR, DRINK_LABEL, DRINK_SHORT, DRINKS, KIND_COLOR, KIND_LABEL } from "./game/types";
import { icon } from "./ui/icons";




export interface Ui {
  root: HTMLElement;
  timer: HTMLElement;
  money: HTMLElement;
  stop: HTMLElement;
  rail: HTMLElement;
  tickets: HTMLElement[];
  /** "Sent back" notes, one over each customer. */
  sentBack: HTMLElement[];
  drinkLabels: HTMLElement[];
  hint: HTMLElement;
  hintText: HTMLElement;
  hintClose: HTMLButtonElement;
  tabs: HTMLButtonElement[];
  tabDots: HTMLElement[];
  menuBtn: HTMLButtonElement;
  /** The service bell: ring twice to call the next person in line. */
  bell: HTMLButtonElement;
  bellCount: HTMLElement;
  bellLabel: HTMLElement;
  title: HTMLElement;
  summary: HTMLElement;
  update: HTMLElement;
  updateText: HTMLElement;
}

/*
 * Counter tabs show a small drawing of each station instead of a word: a fountain cup, the
 * flat-top with patties, the fry basket. Inked like the kitchen, in muted
 * colour; tabs you're not on are faded (see .tab in style.css).
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
  Fryer: `<path d="M17.5 12.5 16 5M20.5 12.5V3.5M23.5 12.5l1-8M26.5 12.5l1.8-6.6M29.2 12.5l2.4-5.4" fill="none" stroke="#2a2622" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M17.5 12.5 16 5M20.5 12.5V3.5M23.5 12.5l1-8M26.5 12.5l1.8-6.6M29.2 12.5l2.4-5.4" fill="none" stroke="#f0c341" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 19h34v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#b9b2a6" ${INK}/>
    <path d="M7.75 19h32.5v3.2H7.75z" fill="#e0a83a"/>
    <path d="M14 11h19l-1.6 9H15.6z" fill="#e4ded3" ${INK}/>
    <path d="M18.5 11.5v8M23.5 11.5v8M28.5 11.5v8M14.6 15.3h17.8" fill="none" stroke="#2a2622" stroke-width="1" opacity=".55"/>
    <path d="M33 12.5h7.5" fill="none" stroke="#2a2622" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="14" cy="27" r="1.6" fill="#f4efe6" ${INK}/>`,
};
const tabArt = (page: string) => `<svg class="tab-art" viewBox="0 0 48 36" aria-hidden="true">${TAB_ART[page] ?? ""}</svg>`;

export function buildUi(root: HTMLElement, pages: readonly string[]): Ui {
  root.innerHTML = `
  <div class="hud">
    <span class="chip" data-r="stop"></span>
    <span class="chip" data-r="timer">3:00</span>
    <span class="chip money" data-r="money">$0</span>
    <span class="spacer"></span>
    <button class="bell-btn" data-r="bell" hidden aria-label="Ring the bell for the next customer">
      <span class="bell-count" data-r="bellCount">0</span>${icon("bell")}<span class="bell-label" data-r="bellLabel">line</span>
    </button>
    <button class="icon-btn" data-r="menuBtn" aria-label="Menu">${icon("menu")}</button>
  </div>
  <div class="rail" data-r="rail"></div>
  ${[0, 1, 2].map((i) => `<div class="ticket" data-r="ticket" data-slot="${i}" hidden></div>`).join("")}
  ${[0, 1, 2].map(() => `<div class="sentback" data-r="sentback" hidden></div>`).join("")}
  <div class="hint" data-r="hint" role="status" hidden><span data-r="hintText"></span><button class="hint-x" data-r="hintClose" aria-label="Dismiss tip">${icon("close")}</button></div>
  ${DRINKS.map((d) => `<div class="dlabel" data-r="dlabel" style="--c:${DRINK_COLOR[d]}">${DRINK_SHORT[d]}</div>`).join("")}
  <nav class="tabs">
    ${pages.map((p, i) => `<button class="tab" data-r="tab" data-page="${i}" aria-selected="false" aria-label="${p}" title="${p}">${TAB_ART[p] ? tabArt(p) : icon("box")}<span class="dot" hidden></span></button>`).join("")}
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
    money: q("money"),
    stop: q("stop"),
    rail: q("rail"),
    tickets: [...root.querySelectorAll<HTMLElement>('[data-r="ticket"]')],
    sentBack: [...root.querySelectorAll<HTMLElement>('[data-r="sentback"]')],
    drinkLabels: [...root.querySelectorAll<HTMLElement>('[data-r="dlabel"]')],
    hint: q("hint"),
    hintText: q("hintText"),
    hintClose: q("hintClose") as HTMLButtonElement,
    tabs,
    tabDots: tabs.map((t) => t.querySelector<HTMLElement>(".dot")!),
    menuBtn: q("menuBtn") as HTMLButtonElement,
    bell: q("bell") as HTMLButtonElement,
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

/** How a waiting customer feels. The figure at the window and the face on their ticket always agree. */
export function patienceMood(pct: number): "neutral" | "sad" | "angry" {
  return pct >= 0.5 ? "neutral" : pct >= 0.2 ? "sad" : "angry";
}

function moodFace(mood: "neutral" | "sad" | "angry", critic = false): string {
  const mouth = mood === "neutral" ? "M5.5 11.2h5" : "M5.3 12c1.6-1.6 3.8-1.6 5.4 0";
  const brows = mood === "angry" ? `<path d="M4.4 5.2l2.6 1.2M11.6 5.2l-2.6 1.2"/>` : mood === "sad" ? `<path d="M4.6 6.2l2.4-1M11.4 6.2l-2.4-1"/>` : "";
  return `<svg class="face" viewBox="0 0 16 16" aria-label="${mood}"><circle cx="8" cy="8" r="7.2"/><g><circle cx="5.9" cy="7.6" r="1"/><circle cx="10.1" cy="7.6" r="1"/>${brows}<path d="${mouth}"/></g>${critic ? `<circle class="cdot" cx="13.6" cy="2.6" r="2.6"><title>Food critic</title></circle>` : ""}</svg>`;
}

/** Kitchen shorthand for a collapsed ticket, the way a cook calls it across the line. */
const SHORT_NAME: Record<string, string> = {
  "Plain Jane": "Plain J",
  "Trailhead Classic": "Trail C",
  "Cheesy Switchback": "Chz Sw",
  "Sunrise Summit": "Sunrise",
  "Lumberjack Stack": "Lumber",
  "Boardwalk Basic": "Brdwlk",
  "Luau Stack": "Luau",
  "Low Tide": "Lo Tide",
  "Big Kahuna": "Kahuna",
  "Sandy Pickle": "Sandy P",
  Tumbleweed: "Tumble",
  "Mesa Smash": "Mesa Sm",
  Rattlesnake: "Rattler",
  "Sunset Double": "Sun Dbl",
  "Ranch Breakfast": "Ranch B",
  "Campfire Melt": "Camp M",
  "Harbor Classic": "Harb C",
  "Sun Valley Supreme": "SV Sup",
  "Rodeo Double": "Rodeo D",
  Wipeout: "Wipeout",
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
};

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
}

function rowHtml(r: TicketRow): string {
  const cls = [r.state, r.mod ? "mod" : "", r.next ? "next" : ""].filter(Boolean).join(" ");
  return `<li class="${cls}" data-l style="--k:${r.color}">${ticketIcon(r.icon, r.color)}<span class="l">${r.label}</span>${r.tail}</li>`;
}

/** The build, top of the burger first, compared against what's on the plate so far. */
function buildRows(order: Order, plate: Plate): TicketRow[] {
  const rows: TicketRow[] = [];
  if (order.poutine && !order.layers.length) {
    const f = plate.fries;
    const fryState: RowState = !f ? "" : f.size === order.friesSize ? "done" : "wrong";
    const parts: [string, string, string, RowState][] = [
      ["fries", "#f3d36b", `<i class="sz">${order.friesSize}</i>Fries`, fryState],
      ["curds", "#f5edcf", "Cheese curds", f?.curds ? (fryState === "wrong" ? "wrong" : "done") : ""],
      ["gravy", "#6e4020", "Gravy", f?.gravy ? (f.curds && fryState !== "wrong" ? "done" : "wrong") : ""],
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
      const state: RowState = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy ? "done" : "wrong";
      rows.push({ icon: "fries", color: "#f3d36b", label: `<i class="sz">${order.friesSize}</i>Fries`, tail: "", state, mod: false, next: false });
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
  const stacked = collapseCounted(plate.layers);
  const modded = new Set(order.mods.filter((m) => m.type !== "no").map((m) => m.kind));
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
    const row: TicketRow = { icon, color: KIND_COLOR[k], label: KIND_LABEL[k], tail: st.count > 1 ? `<span class="n">×${st.count}</span>` : "", state: "wrong", mod: false, next: false, extra: true };
    extrasAt.set(below, [row, ...(extrasAt.get(below) ?? [])]);
  });
  // Extras above the top of the build go first in the list.
  rows.push(...(extrasAt.get(order.layers.length - 1) ?? []));
  for (let i = order.layers.length - 1; i >= 0; i--) {
    const exp = order.layers[i];
    let icon: string = exp.kind;
    let label = KIND_LABEL[exp.kind];
    let tail = "";
    if (exp.kind === "bun") {
      icon = i === 0 ? "bunBottom" : "bunTop";
      if (exp.toasted) tail = modBox("toast", "Toast");
    } else if (exp.kind === "patty") {
      if (exp.smashed) icon = "smashed";
      if (exp.smashed) tail = `<span class="mb smash" title="Smash">${SMASH_SVG}</span>`;
    } else if (exp.kind === "pineapple") tail = modBox("grill", "Grill");
    else if (exp.melted) tail = modBox("melt", "Melt");
    if (exp.count) {
      const short = got[i] && got[i] < exp.count;
      tail += `<span class="n">${short ? `${got[i]}/` : "×"}${exp.count}</span>`;
    }
    for (const r of removed.filter((r) => r.at === i + 1)) rows.push(removedRow(r.kind, states[i + 1] ?? ""));
    if (i < order.layers.length - 1) rows.push(...(extrasAt.get(i) ?? []));
    rows.push({ icon, color: KIND_COLOR[exp.kind], label, tail, state: states[i], mod: modded.has(exp.kind), next: i === nextIdx });
  }
  rows.push(...(extrasAt.get(-1) ?? []));
  for (const r of removed.filter((r) => r.at === 0)) rows.push(removedRow(r.kind, states[0] ?? ""));
  return rows;
}

/** "- Ketchup": a leave-off, where it would have gone. Crossed off once the layer above it is on. */
function removedRow(kind: Order["layers"][number]["kind"], above: RowState): TicketRow {
  const icon = kind === "bun" ? "bunTop" : kind;
  return { icon, color: KIND_COLOR[kind], label: `− ${KIND_LABEL[kind]}`, tail: "", state: above === "done" ? "done" : "", mod: true, next: false };
}

/**
 * Fries and drinks beside the build, each under its own section icon with a pale rule, so the
 * items get the column's full width: size first ("[L] Pine Fizz"), its own modifiers under it.
 */
function sideRows(order: Order, plate: Plate): string {
  const out: string[] = [];
  const section = (icon: string, color: string) => `<div class="sec">${ticketIcon(icon, color)}<i></i></div>`;
  // With no burger, just a drink or fries are the build itself (buildRows), and a poutine's fries are too.
  if (!order.layers.length && !order.poutine) return "";
  if (order.fries && order.layers.length) {
    const f = plate.fries;
    const state = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy ? "done" : "wrong";
    out.push(`<div class="sg">${section("fries", "#c8472e")}<div class="sd ${state}"><span class="sl"><i class="sz">${order.friesSize}</i><span class="dn">Fries</span></span></div></div>`);
  }
  if (order.drink) {
    const d = plate.drink;
    const iceOk = order.ice == null || !!d?.ice === order.ice;
    const wrong = !!d && (d.flavor !== order.drink || d.size !== order.drinkSize || !iceOk);
    const state = !d ? "" : wrong ? "wrong" : d.lid ? "done" : "";
    const ice = order.ice === true ? modBox("ice", "Ice") : order.ice === false ? modBox("noice", "No ice") : "";
    out.push(
      `<div class="sg">${section("drink", DRINK_COLOR[order.drink])}<div class="sd ${state}"><span class="sl"><i class="sz">${order.drinkSize}</i><span class="dn">${DRINK_LABEL[order.drink]}</span></span>${ice ? `<span class="sm">${ice}</span>` : ""}</div></div>`,
    );
  }
  return out.join("");
}

/** "+2" for each side ordered with the main (fries, drink), "*" when the order changes the menu recipe. */
function nameMarks(order: Order): string {
  // Sides with a burger; with no burger they're the order itself.
  const extras = order.layers.length ? (order.fries ? 1 : 0) + (order.drink ? 1 : 0) : order.poutine && order.drink ? 1 : 0;
  return `${order.mods.length ? `<span class="ast">*</span>` : ""}${extras ? `<span class="plus">+${extras}</span>` : ""}`;
}

/**
 * Ticket HTML for the focus rail. The order being worked on (`focused`) is a full receipt: patience,
 * the name, then the whole build top to bottom with the fries and drink beside it. The others are
 * stubs: patience, a short name, doneness and how much is left. `fold` squeezes a long build by
 * folding the layers already stacked into one line.
 */
export function ticketHtml(order: Order, plate: Plate, patience: number, focused: boolean, fold = false): string {
  const pct = Math.max(0, Math.min(1, patience));
  const mood = patienceMood(pct);
  const bar = `<span class="bar"><i style="width:${(pct * 100).toFixed(0)}%"></i></span>`;
  const rows = buildRows(order, plate);
  if (!focused) {
    const build = rows.filter((r) => !r.extra && !r.label.startsWith("−"));
    const left = build.filter((r) => !r.state).length;
    const pips = build
      .reverse()
      .map((r) => `<i class="${r.state}" style="--k:${r.color}"></i>`)
      .join("");
    return `<div class="pat ${mood}">${moodFace(mood, !!order.critic)}${bar}</div>
      <div class="name"><span class="l">${esc(shortName(order.name))}</span>${nameMarks(order)}</div>
      <div class="left">${left ? `<b>${left}</b> left` : "Ready"}</div><div class="pips">${pips}</div>`;
  }
  let list = rows;
  let folded = "";
  if (fold) {
    const done = rows.filter((r) => r.state === "done");
    if (done.length > 1) {
      list = rows.filter((r) => r.state !== "done");
      folded = `<li class="done fold"><span class="l">${done.length} stacked</span></li>`;
    }
  }
  const sides = sideRows(order, plate);
  return `<div class="pat ${mood}">${moodFace(mood)}${bar}${order.critic ? `<em class="critic" title="Food critic">Critic</em>` : ""}</div>
    <div class="name"><span class="l">${esc(order.name)}</span>${nameMarks(order)}</div>
    <div class="cols${sides ? "" : " solo"}"><div class="tb"><ol>${list.map(rowHtml).join("")}${folded}</ol></div>${sides ? `<div class="sides">${sides}</div>` : ""}</div>`;
}

