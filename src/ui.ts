import type { Plan, Review } from "./game/business";
import { CROWD, menuOf, PRICE, QUALITY, recipeCost, ratingBonus } from "./game/business";
import type { Upgrade } from "./game/progress";
import type { Stop } from "./game/stops";
import type { PressPiece } from "./game/press";
import type { Order, Plate } from "./game/types";
import { collapseCounted } from "./game/scoring";
import { SHIFTS_TO_UNLOCK } from "./game/travel";
import { DRINK_COLOR, DRINK_LABEL, DRINKS, KIND_COLOR, KIND_LABEL } from "./game/types";
import { SLOT_COLORS } from "./scenes/tray";
import { buildLabel } from "./update";
import { icon } from "./ui/icons";



const starsText = (n: number) => `${"★".repeat(n)}${"☆".repeat(3 - n)}`;
const money = (n: number) => (n < 0 ? `−$${(-n).toFixed(2)}` : `$${n.toFixed(2)}`);

function reviewsHtml(reviews: Review[], max: number): string {
  if (!reviews.length) return "";
  return `<ul class="reviews">${reviews
    .slice(0, max)
    .map((r) => `<li><span class="rs">${starsText(r.stars)}</span> “${esc(r.text)}” <i>${esc(r.stop)}</i></li>`)
    .join("")}</ul>`;
}

/** Before a business-mode shift: ingredient quality, prices and today's menu. */
export function planHtml(p: { stop: Stop; plan: Plan; rep: number; reviews: Review[]; customers: number; wtp: number; popularity: number }): string {
  const seg = (act: string, cur: string, opts: [string, string][]) =>
    `<div class="seg">${opts.map(([v, l]) => `<button class="${v === cur ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const menu = menuOf(p.stop, p.plan);
  const avgCost = menu.reduce((s, r) => s + recipeCost(r, p.plan.quality), 0) / menu.length;
  const avgPrice = (menu.reduce((s, r) => s + r.price, 0) / menu.length) * PRICE[p.plan.price].mult;
  const bonus = ratingBonus(p.plan, p.stop.crowd, p.wtp);
  return `<div class="card plan">
    <p class="sub">Before opening · ${esc(p.stop.name)}</p>
    <h2>Plan the shift</h2>
    ${crowdHtml(p.stop.crowd)}
    <p class="rep">Reputation <b>${p.rep.toFixed(1)} ★</b>${p.reviews.length ? ` from ${p.reviews.length} reviews` : " (new truck)"} · Popularity <b>${p.popularity}</b></p>
    <h3>Ingredients</h3>
    ${seg("plan-q", p.plan.quality, Object.entries(QUALITY).map(([k, q]) => [k, q.label]))}
    <p class="note">${esc(QUALITY[p.plan.quality].blurb)}</p>
    <h3>Prices</h3>
    ${seg("plan-p", p.plan.price, Object.entries(PRICE).map(([k, q]) => [k, q.label]))}
    <p class="note">${esc(PRICE[p.plan.price].blurb)}</p>
    <h3>Menu</h3>
    <div class="chips">${p.stop.menu
      .map((r) => `<button class="${p.plan.menu.includes(r.name) ? "on" : ""}" data-act="plan-m" data-v="${esc(r.name)}">${esc(r.name)}</button>`)
      .join("")}</div>
    <p class="note">More choice brings more customers. Two recipes minimum.</p>
    <dl class="stats">
      <dt>Expected customers</dt><dd>about ${p.customers}</dd>
      <dt>Average burger price</dt><dd>${money(avgPrice)}</dd>
      <dt>Ingredients per burger</dt><dd>${money(avgCost)}</dd>
      <dt>Customers will pay</dt><dd>${p.wtp >= 0.5 ? "well above fair" : p.wtp >= 0.15 ? "a bit above fair" : p.wtp > -0.15 ? "fair prices" : "below fair"}</dd>
      <dt>Rating effect</dt><dd>${bonus > 0 ? "+" : bonus < 0 ? "−" : "±"}${Math.abs(bonus)} pts</dd>
    </dl>
    ${reviewsHtml(p.reviews, 2)}
    <div class="btn-row">
      <button class="btn primary" data-act="open">Open for business</button>
      <button class="btn small" data-act="next">Back</button>
    </div>
  </div>`;
}

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

/** Icons on the counter tabs. */
const TAB_ICONS: Record<string, string> = { Drinks: "drink", Grill: "grill", Fryer: "fryer", Supplies: "box" };

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
  ${[0, 1, 2].map((i) => `<div class="ticket" data-r="ticket" data-slot="${i}" style="--slot:${SLOT_COLORS[i]}" hidden></div>`).join("")}
  ${[0, 1, 2].map(() => `<div class="sentback" data-r="sentback" hidden></div>`).join("")}
  <div class="hint" data-r="hint" hidden></div>
  ${DRINKS.map((d) => `<div class="dlabel" data-r="dlabel" style="--c:${DRINK_COLOR[d]}">${DRINK_LABEL[d]}</div>`).join("")}
  <nav class="tabs">
    ${pages.map((p, i) => `<button class="tab" data-r="tab" data-page="${i}" aria-selected="false">${icon(TAB_ICONS[p] ?? "box")}<span>${p}</span><span class="dot" hidden></span></button>`).join("")}
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
  // Runs of counted toppings are one layer; a layer is done once it has its full count.
  const stacked = collapseCounted(plate.layers);
  const modded = new Set(order.mods.filter((m) => m.type !== "no").map((m) => m.kind));
  // The plate matches the order up to `good` layers. Everything stacked above that has to come
  // off: those pieces are listed in red, crossed out, where they sit, above the layer that should
  // go there instead. A short count still on top is just unfinished.
  let good = 0;
  while (good < order.layers.length && stacked[good] && stacked[good].piece.kind === order.layers[good].kind && stacked[good].count >= (order.layers[good].count ?? 1)) good++;
  const partial = stacked.length === good + 1 && good < order.layers.length && stacked[good].piece.kind === order.layers[good].kind;
  const wrongFrom = partial ? stacked.length : good;
  const states: RowState[] = order.layers.map((_, i) => (i < good ? "done" : ""));
  const nextIdx = stacked.length > wrongFrom ? -1 : good;
  const removed = order.removed ?? order.mods.filter((m) => m.type === "no").map((m) => ({ kind: m.kind, at: order.layers.length - 1 }));
  const wrongRows: TicketRow[] = [];
  for (let i = stacked.length - 1; i >= wrongFrom; i--) {
    const k = stacked[i].piece.kind;
    const icon = k === "bun" ? (i === 0 ? "bunBottom" : "bunTop") : k;
    wrongRows.push({ icon, color: KIND_COLOR[k], label: KIND_LABEL[k], tail: stacked[i].count > 1 ? `<span class="n">×${stacked[i].count}</span>` : "", state: "wrong", mod: false, next: false });
  }
  // Wrong pieces past the top of the build go first in the list.
  if (wrongFrom >= order.layers.length) rows.push(...wrongRows);
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
      tail = `${donenessPill(exp.doneness ?? "medium")}${exp.smashed ? `<span class="mb smash" title="Smash">${SMASH_SVG}</span>` : ""}`;
    } else if (exp.kind === "pineapple") tail = modBox("grill", "Grill");
    else if (exp.melted) tail = modBox("melt", "Melt");
    if (exp.count) {
      const got = partial && i === good ? stacked[i].count : 0;
      tail += `<span class="n">${got ? `${got}/` : "×"}${exp.count}</span>`;
    }
    for (const r of removed.filter((r) => r.at === i + 1)) rows.push(removedRow(r.kind, states[i + 1] ?? ""));
    if (i === wrongFrom && wrongFrom < order.layers.length) rows.push(...wrongRows);
    rows.push({ icon, color: KIND_COLOR[exp.kind], label, tail, state: states[i], mod: modded.has(exp.kind), next: i === nextIdx });
  }
  for (const r of removed.filter((r) => r.at === 0)) rows.push(removedRow(r.kind, states[0] ?? ""));
  return rows;
}

/** "- Ketchup": a leave-off, where it would have gone. Crossed off once the layer above it is on. */
function removedRow(kind: Order["layers"][number]["kind"], above: RowState): TicketRow {
  const icon = kind === "bun" ? "bunTop" : kind;
  return { icon, color: KIND_COLOR[kind], label: `− ${KIND_LABEL[kind]}`, tail: "", state: above === "done" ? "done" : "", mod: true, next: false };
}

/** Fries and drink beside the build: icon, then the item and its own modifiers stacked under it. */
function sideRows(order: Order, plate: Plate): string {
  const out: string[] = [];
  if (order.fries && !(order.poutine && !order.layers.length)) {
    const f = plate.fries;
    const state = !f ? "" : f.size === order.friesSize && !f.curds && !f.gravy ? "done" : "wrong";
    out.push(`<div class="sd ${state}">${ticketIcon("fries", "#c8472e")}<div><span class="sl"><i class="sz">${order.friesSize}</i>Fries</span></div></div>`);
  }
  if (order.drink) {
    const d = plate.drink;
    const iceOk = order.ice == null || !!d?.ice === order.ice;
    const wrong = !!d && (d.flavor !== order.drink || d.size !== order.drinkSize || !iceOk);
    const state = !d ? "" : wrong ? "wrong" : d.lid && d.straw ? "done" : "";
    const ice = order.ice === true ? modBox("ice", "Ice") : order.ice === false ? modBox("noice", "No ice") : "";
    out.push(
      `<div class="sd ${state}">${ticketIcon("drink", DRINK_COLOR[order.drink])}<div><span class="sl"><i class="sz">${order.drinkSize}</i><span class="dn">${DRINK_LABEL[order.drink]}</span></span>${ice ? `<span class="sm">${ice}</span>` : ""}</div></div>`,
    );
  }
  return out.join("");
}

/** Doneness for an order's patties, for a collapsed ticket: one pill with "×2" when they match. */
function pattyPills(order: Order): string {
  const pats = order.layers.filter((l) => l.kind === "patty").map((l) => l.doneness ?? "medium");
  if (!pats.length) return "";
  if (pats.every((d) => d === pats[0])) return `<div class="pp">${donenessPill(pats[0])}${pats.length > 1 ? `<span class="x">×${pats.length}</span>` : ""}</div>`;
  return `<div class="pp">${pats.map((d) => donenessPill(d)).join("")}</div>`;
}

/** "+2" for each side ordered with the main (fries, drink), "*" when the order changes the menu recipe. */
function nameMarks(order: Order): string {
  const extras = (order.fries && !(order.poutine && !order.layers.length) ? 1 : 0) + (order.drink ? 1 : 0);
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
    const build = rows.filter((r) => r.state !== "wrong" && !r.label.startsWith("−"));
    const left = build.filter((r) => r.state !== "done").length;
    const fix = rows.some((r) => r.state === "wrong");
    const pips = build
      .reverse()
      .map((r) => `<i class="${r.state}" style="--k:${r.color}"></i>`)
      .join("");
    return `<div class="pat ${mood}">${moodFace(mood, !!order.critic)}${bar}</div>
      <div class="name"><span class="l">${esc(shortName(order.name))}</span>${nameMarks(order)}</div>
      ${pattyPills(order)}
      <div class="left${fix ? " fix" : ""}">${fix ? "Fix plate" : left ? `<b>${left}</b> left` : "Ready"}</div><div class="pips">${pips}</div>`;
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

function offerHtml(offer: Upgrade[]): string {
  if (!offer.length) return "";
  return `<h3>Pick a truck upgrade</h3>
    <div class="offers">${offer.map((u) => `<button class="offer" data-act="pick" data-id="${u.id}"><b>${esc(u.name)}</b><span>${esc(u.text)}</span></button>`).join("")}</div>`;
}

const OUTLET_LABEL = { paper: "Newspaper", magazine: "Magazine", tv: "On TV" } as const;

/** A press clipping: newspaper, magazine or TV spot. */
export function pressHtml(p: PressPiece, label?: string): string {
  return `<div class="press ${p.outlet}">
    ${label ? `<p class="plabel">${esc(label)}</p>` : ""}
    <p class="psrc">${OUTLET_LABEL[p.outlet]} · ${esc(p.source)}</p>
    <p class="phead">${esc(p.headline)}</p>
    <p class="pquote"><span class="rs">${starsText(p.stars)}</span> “${esc(p.quote)}”</p>
  </div>`;
}

const crowdHtml = (c: Stop["crowd"]) => `<p class="crowd"><b>${CROWD[c].label}:</b> ${esc(CROWD[c].blurb)}</p>`;

export function summaryHtml(s: {
  stop: Stop;
  served: number;
  lost: number;
  /** Gave up waiting in line before ordering. */
  leftLine: number;
  /** Saw the line and kept walking. */
  walkedPast: number;
  /** Spent on social media for the day. */
  adCost: number;
  stars: number[];
  earned: number;
  tips: number;
  spills: number;
  best: string | null;
  outcome: "passed" | "failed" | "trip";
  /** Towns whose roads this shift opened. */
  opened: Stop[];
  /** Good shifts in this town so far, counting this one. */
  shiftsHere?: number;
  press: PressPiece | null;
  /** Popularity before and after the shift. */
  pop: [number, number];
  offer: Upgrade[];
  /** Business mode extras. */
  biz: { costs: number; profit: number; reviews: Review[]; rep: number; repBefore: number } | null;
}): string {
  const avg = s.stars.length ? s.stars.reduce((a, b) => a + b, 0) / s.stars.length : 0;
  const rounded = Math.round(avg);
  const starRow = [0, 1, 2].map((i) => `<span class="${i < rounded ? "" : "off"}">★</span>`).join("");
  const verdict =
    s.served === 0
      ? "The truck stayed quiet today."
      : s.outcome === "failed"
        ? `${s.stop.name} wasn't impressed. Serve at least half the customers with a 1★ average to move on.`
        : avg >= 2.5
          ? `${s.stop.name} will be talking about this for weeks.`
          : avg >= 1.5
            ? "Solid shift. Everyone left full."
            : "A rough day at the grill, but you made it.";
  const buttons =
    s.outcome === "failed"
      ? `<button class="btn primary" data-act="restart">Try ${esc(s.stop.name)} again</button><button class="btn small" data-act="next">Back to the map</button>`
      : s.offer.length
        ? ""
        : `<button class="btn primary" data-act="next">Back to the map</button>`;
  const left = SHIFTS_TO_UNLOCK - (s.shiftsHere ?? 0);
  const opened = s.opened.length
    ? `<p class="new">New road${s.opened.length > 1 ? "s" : ""} open: ${s.opened.map((t) => esc(t.name)).join(" and ")}.</p>`
    : s.outcome === "passed" && left > 0 && s.stop.roads.length
      ? `<p class="new">${s.shiftsHere} of ${SHIFTS_TO_UNLOCK} good shifts in ${esc(s.stop.name)}. ${left === 1 ? "One more opens" : `${left} more open`} the road on.</p>`
      : "";
  return `<div class="card">
    <p class="sub">Closing time · ${esc(s.stop.name)}</p>
    <h2>${s.outcome === "trip" ? "Road trip complete!" : s.outcome === "failed" ? "Shift over" : "Shift complete"}</h2>
    <div class="stars" aria-label="${avg.toFixed(1)} stars average">${starRow}</div>
    <p>${verdict}</p>
    ${s.outcome === "trip" ? `<p class="new">You've reached the end of the road. Every town stays open, so keep touring or start a new trip.</p>` : opened}
    <dl class="stats">
      <dt>Orders served</dt><dd>${s.served}</dd>
      <dt>Walked out after ordering</dt><dd>${s.lost}</dd>
      ${s.leftLine ? `<dt>Gave up in line</dt><dd>${s.leftLine}</dd>` : ""}
      ${s.walkedPast ? `<dt>Walked past the line</dt><dd>${s.walkedPast}</dd>` : ""}
      <dt>Average rating</dt><dd>${avg.toFixed(1)} ★</dd>
      <dt>Sales</dt><dd>$${s.earned}</dd>
      <dt>Tips</dt><dd>$${s.tips}</dd>
      ${s.spills ? `<dt>Spilled soda</dt><dd>−$${s.spills}</dd>` : ""}
      ${s.adCost ? `<dt>Social media</dt><dd>−$${s.adCost}</dd>` : ""}
      ${s.biz ? `<dt>Ingredients</dt><dd>−$${Math.round(s.biz.costs)}</dd><dt>Profit</dt><dd class="${s.biz.profit < 0 ? "neg" : ""}">${s.biz.profit < 0 ? "−" : ""}$${Math.abs(Math.round(s.biz.profit))}</dd>` : `<dt>Total</dt><dd>$${s.earned + s.tips - s.spills}</dd>`}
      ${s.biz ? `<dt>Reputation</dt><dd>${s.biz.repBefore.toFixed(1)} → ${s.biz.rep.toFixed(1)} ★</dd>` : ""}
      ${s.best ? `<dt>Best order</dt><dd>${esc(s.best)}</dd>` : ""}
      ${s.pop[0] !== s.pop[1] ? `<dt>Popularity</dt><dd>${s.pop[0]} → ${s.pop[1]}</dd>` : ""}
    </dl>
    ${s.press ? pressHtml(s.press, `A critic ate here today. ${s.press.pop >= 0 ? "+" : "−"}${Math.abs(s.press.pop)} popularity.`) : ""}
    ${s.biz ? reviewsHtml(s.biz.reviews, 3) : ""}
    ${s.outcome !== "failed" ? offerHtml(s.offer) : ""}
    <div class="btn-row">${buttons}</div>
    <p class="build">${esc(buildLabel())}</p>
  </div>`;
}
