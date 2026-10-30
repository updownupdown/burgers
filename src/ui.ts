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

const MENU_SVG = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="9" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="14" width="14" height="2.4" rx="1.2" fill="currentColor"/></svg>`;


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
  drinkLabels: HTMLElement[];
  hint: HTMLElement;
  tabs: HTMLButtonElement[];
  tabDots: HTMLElement[];
  menuBtn: HTMLButtonElement;
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
    <button class="icon-btn" data-r="menuBtn" aria-label="Menu">${MENU_SVG}</button>
  </div>
  <div class="rail" data-r="rail"></div>
  ${[0, 1, 2].map((i) => `<div class="ticket" data-r="ticket" data-slot="${i}" style="--slot:${SLOT_COLORS[i]}" hidden></div>`).join("")}
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
    drinkLabels: [...root.querySelectorAll<HTMLElement>('[data-r="dlabel"]')],
    hint: q("hint"),
    tabs,
    tabDots: tabs.map((t) => t.querySelector<HTMLElement>(".dot")!),
    menuBtn: q("menuBtn") as HTMLButtonElement,
    title: q("title"),
    summary: q("summary"),
    update: q("update"),
    updateText: q("updateText"),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const MOD_LABEL = { no: "No", extra: "Extra", add: "+" } as const;

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

function moodFace(mood: "neutral" | "sad" | "angry"): string {
  const mouth = mood === "neutral" ? "M5.5 11.2h5" : "M5.3 12c1.6-1.6 3.8-1.6 5.4 0";
  const brows = mood === "angry" ? `<path d="M4.4 5.2l2.6 1.2M11.6 5.2l-2.6 1.2"/>` : mood === "sad" ? `<path d="M4.6 6.2l2.4-1M11.4 6.2l-2.4-1"/>` : "";
  return `<svg class="face" viewBox="0 0 16 16" aria-label="${mood}"><circle cx="8" cy="8" r="7.2"/><g><circle cx="5.9" cy="7.6" r="1"/><circle cx="10.1" cy="7.6" r="1"/>${brows}<path d="${mouth}"/></g></svg>`;
}

/**
 * Ticket HTML. Compact (default once a recipe is familiar): the recipe name, how to cook
 * it, the modifiers, and a strip of pips showing stacking progress. Expanded: every layer,
 * top to bottom, ticked off as it's stacked in order.
 */
export function ticketHtml(order: Order, plate: Plate, patience: number, expanded: boolean): string {
  // Runs of counted toppings are one layer; a layer is done once it has its full count.
  const stacked = collapseCounted(plate.layers);
  let prefixOk = true;
  const okFlags = order.layers.map((exp, i) => {
    const got = stacked[i];
    prefixOk = prefixOk && !!got && got.piece.kind === exp.kind && got.count >= (exp.count ?? 1);
    return prefixOk;
  });
  const modded = new Set(order.mods.filter((m) => m.type !== "no").map((m) => m.kind));
  let body: string;
  if (order.poutine && !order.layers.length) {
    // A poutine meal: the carton, then curds and gravy on top.
    const f = plate.fries;
    const line = (ok: boolean, color: string, label: string) => `<li class="${ok ? "ok" : ""}"><b style="background:${color}"></b><span class="l">${label}</span></li>`;
    body = `<ol>${line(!!f && f.size === order.friesSize, "#f3d36b", `<i class="sz">${order.friesSize}</i> Fries`)}${line(!!f?.curds, "#f5edcf", "Cheese curds")}${line(!!f?.gravy, "#6e4020", "Gravy")}</ol>`;
  } else if (expanded) {
    const lines: string[] = [];
    for (let i = order.layers.length - 1; i >= 0; i--) {
      const exp = order.layers[i];
      let extra = "";
      if (exp.kind === "patty") extra = ` ${donenessPill(exp.doneness ?? "medium")}${exp.smashed ? ` <em>Smash</em>` : ""}`;
      if (exp.kind === "pineapple") extra = ` <em>Grilled</em>`;
      if (exp.kind === "bun" && exp.toasted) extra = ` <em>Toast</em>`;
      if (exp.melted) extra = ` <em>Melted</em>`;
      if (exp.count) {
        const got = stacked[i]?.piece.kind === exp.kind && okFlags[i - 1] !== false ? stacked[i].count : 0;
        extra = ` <span class="n">${got && got < exp.count ? `${got}/` : ""}×${exp.count}</span>`;
      }
      const cls = [okFlags[i] ? "ok" : "", modded.has(exp.kind) ? "mod" : ""].join(" ").trim();
      lines.push(`<li class="${cls}"><b style="background:${KIND_COLOR[exp.kind]}"></b><span class="l">${KIND_LABEL[exp.kind]}</span>${extra}</li>`);
    }
    const nos = order.mods.filter((m) => m.type === "no").map((m) => `<li class="no"><span class="l">No ${KIND_LABEL[m.kind].toLowerCase()}</span></li>`);
    body = `<ol>${lines.join("")}${nos.join("")}</ol>`;
  } else {
    const patty = order.layers.find((l) => l.kind === "patty");
    const bun = order.layers.find((l) => l.kind === "bun");
    const how: string[] = [];
    if (patty?.smashed) how.push("Smash");
    if (bun?.toasted) how.push("Toast");
    if (order.layers.some((l) => l.melted)) how.push("Melt");
    const mods = order.mods.map(
      (m) => `<li class="m ${m.type}"><b style="background:${KIND_COLOR[m.kind]}"></b><span class="l">${MOD_LABEL[m.type]} ${KIND_LABEL[m.kind].toLowerCase()}</span></li>`,
    );
    const pips = order.layers.map((l, i) => `<i class="${okFlags[i] ? "ok" : ""}" style="background:${KIND_COLOR[l.kind]}"></i>`).join("");
    body = `<div class="how">${patty ? donenessPill(patty.doneness ?? "medium") : ""}${how.map((h) => `<em>${h}</em>`).join(" ")}</div>
      ${mods.length ? `<ol>${mods.join("")}</ol>` : ""}
      <div class="pips" aria-label="${okFlags.filter(Boolean).length} of ${order.layers.length} layers">${pips}</div>`;
  }
  const sides: string[] = [];
  // Sizes lead so they're the first thing read: "L Fries", "S Pine Fizz".
  if (order.fries && !(order.poutine && !order.layers.length))
    sides.push(`<span class="${plate.fries?.size === order.friesSize ? "ok" : ""}"><b style="background:#f3d36b"></b><i class="sz">${order.friesSize}</i>Fries</span>`);
  if (order.drink) {
    const d = plate.drink;
    const iceOk = order.ice == null || !!d?.ice === order.ice;
    const ok = d?.flavor === order.drink && d.size === order.drinkSize && iceOk && d.lid && d.straw;
    // Ice only shows when the customer cares: "Ice" or a red "No ice".
    const ice = order.ice === true ? `<em class="ice">Ice</em>` : order.ice === false ? `<em class="ice no">No ice</em>` : "";
    sides.push(`<span class="${ok ? "ok" : ""}"><b style="background:${DRINK_COLOR[order.drink]}"></b><i class="sz">${order.drinkSize}</i>${DRINK_LABEL[order.drink]}${ice}</span>`);
  }
  const pct = Math.max(0, Math.min(1, patience));
  const mood = patienceMood(pct);
  return `<div class="pat ${mood}">${moodFace(mood)}<span><i style="width:${(pct * 100).toFixed(0)}%"></i></span></div>
    ${order.critic ? `<div class="critic" title="Food critic">Critic</div>` : ""}<div class="name"><span class="l">#${order.id} ${esc(order.name)}</span><span class="exp">${expanded ? "▴" : "▾"}</span></div>
    ${body}
    ${sides.length ? `<div class="sides">${sides.join("")}</div>` : ""}`;
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
      <dt>Customers who left</dt><dd>${s.lost}</dd>
      <dt>Average rating</dt><dd>${avg.toFixed(1)} ★</dd>
      <dt>Sales</dt><dd>$${s.earned}</dd>
      <dt>Tips</dt><dd>$${s.tips}</dd>
      ${s.spills ? `<dt>Spilled soda</dt><dd>−$${s.spills}</dd>` : ""}
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
