import type { Plan, Review } from "./game/business";
import { CROWD, menuOf, PRICE, QUALITY, recipeCost, ratingBonus } from "./game/business";
import type { Upgrade } from "./game/progress";
import { EVENTS, eventOn, nextDay, REGIONS, STOPS, townById, type Stop } from "./game/stops";
import type { PressPiece } from "./game/press";
import type { Order, Plate } from "./game/types";
import { DRINK_COLOR, DRINK_LABEL, DRINKS, KIND_COLOR, KIND_LABEL } from "./game/types";
import { SLOT_COLORS } from "./scenes/tray";
import { buildLabel } from "./update";
import { icon } from "./ui/icons";

const MENU_SVG = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="9" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="14" width="14" height="2.4" rx="1.2" fill="currentColor"/></svg>`;

const HOW_TO = `
<ul>
  <li><b>Customers</b> wait at the window. Their ticket shows the burger from top to bottom. Tap a ticket or plate to work on that order.</li>
  <li><b>Drag</b> ingredients up onto the tray, or <b>flick</b> them up to toss them on.</li>
  <li><b>Patties, bacon, eggs, buns and pineapple</b> go on the grill first. <b>Swipe up</b> on a patty to flip it, then drag it up to the plate. Press and hold a fresh patty to smash it flat.</li>
  <li><b>Sauce:</b> drag a bottle up to the tray and draw on the burger.</li>
  <li><b>Swipe sideways</b> or use the tabs for the Drinks and Fryer counters.</li>
  <li><b>Melted cheese:</b> drop a slice on a patty while it's on the grill.</li>
  <li><b>Heat lamp spots</b> next to the grill hold food or a half-built burger. Drag the whole stack to a plate. Don't leave it too long.</li>
  <li><b>Drinks and fries</b> need a cup or carton from the stacks first. Watch the size on the ticket. Overflowing costs money and makes a mess to wipe up.</li>
  <li><b>Ring the bell twice</b> to serve. Swipe down on a plate to take the top layer off. Drop mistakes in the trash slot at the front of the grill.</li>
</ul>`;

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
  tickets: HTMLElement[];
  drinkLabels: HTMLElement[];
  hint: HTMLElement;
  tabs: HTMLButtonElement[];
  tabDots: HTMLElement[];
  menuBtn: HTMLButtonElement;
  title: HTMLElement;
  menu: HTMLElement;
  summary: HTMLElement;
  update: HTMLElement;
  install: HTMLElement;
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
  <div class="screen" data-r="menu" hidden>
    <div class="card">
      <h2>Paused</h2>
      <div class="btn-row">
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart shift</button>
        <button class="btn" data-act="sound">Sound: on</button>
        <button class="btn" data-act="gfx">Graphics: high</button>
        <button class="btn" data-act="check-update">Check for updates</button>
        <button class="btn" data-act="install" data-r="install" hidden>Install the app</button>
      </div>
      <details><summary><b>How to play</b></summary>${HOW_TO}</details>
      <p class="build" data-r="build2"></p>
    </div>
  </div>
  <div class="screen" data-r="summary" hidden></div>
  <div class="rotate" aria-live="polite"><div><span class="phone"></span><p>Turn your phone upright to keep cooking.</p></div></div>
  `;
  const q = (r: string) => root.querySelector<HTMLElement>(`[data-r="${r}"]`)!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-r="tab"]')];
  q("build2").textContent = buildLabel();
  return {
    root,
    timer: q("timer"),
    money: q("money"),
    stop: q("stop"),
    tickets: [...root.querySelectorAll<HTMLElement>('[data-r="ticket"]')],
    drinkLabels: [...root.querySelectorAll<HTMLElement>('[data-r="dlabel"]')],
    hint: q("hint"),
    tabs,
    tabDots: tabs.map((t) => t.querySelector<HTMLElement>(".dot")!),
    menuBtn: q("menuBtn") as HTMLButtonElement,
    title: q("title"),
    menu: q("menu"),
    summary: q("summary"),
    update: q("update"),
    install: q("install"),
    updateText: q("updateText"),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const MOD_LABEL = { no: "No", extra: "Extra", add: "+" } as const;

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
  let prefixOk = true;
  const okFlags = order.layers.map((exp, i) => {
    const got = plate.layers[i];
    prefixOk = prefixOk && !!got && got.piece.kind === exp.kind;
    return prefixOk;
  });
  const modded = new Set(order.mods.filter((m) => m.type !== "no").map((m) => m.kind));
  let body: string;
  if (expanded) {
    const lines: string[] = [];
    for (let i = order.layers.length - 1; i >= 0; i--) {
      const exp = order.layers[i];
      let extra = "";
      if (exp.kind === "patty") extra = exp.smashed ? ` <em>Smash</em>` : ` <em>${exp.doneness === "rare" ? "Rare" : exp.doneness === "well" ? "Well" : "Med"}</em>`;
      if (exp.kind === "pineapple") extra = ` <em>Grilled</em>`;
      if (exp.kind === "bun" && exp.toasted) extra = ` <em>Toast</em>`;
      if (exp.melted) extra = ` <em>Melted</em>`;
      const cls = [okFlags[i] ? "ok" : "", modded.has(exp.kind) ? "mod" : ""].join(" ").trim();
      lines.push(`<li class="${cls}"><b style="background:${KIND_COLOR[exp.kind]}"></b><span class="l">${KIND_LABEL[exp.kind]}</span>${extra}</li>`);
    }
    const nos = order.mods.filter((m) => m.type === "no").map((m) => `<li class="no"><span class="l">No ${KIND_LABEL[m.kind].toLowerCase()}</span></li>`);
    body = `<ol>${lines.join("")}${nos.join("")}</ol>`;
  } else {
    const patty = order.layers.find((l) => l.kind === "patty");
    const bun = order.layers.find((l) => l.kind === "bun");
    const how: string[] = [];
    if (patty) how.push(patty.smashed ? "Smash" : patty.doneness === "rare" ? "Rare" : patty.doneness === "well" ? "Well" : "Med");
    if (bun?.toasted) how.push("Toast");
    if (order.layers.some((l) => l.melted)) how.push("Melt");
    const mods = order.mods.map(
      (m) => `<li class="m ${m.type}"><b style="background:${KIND_COLOR[m.kind]}"></b><span class="l">${MOD_LABEL[m.type]} ${KIND_LABEL[m.kind].toLowerCase()}</span></li>`,
    );
    const pips = order.layers.map((l, i) => `<i class="${okFlags[i] ? "ok" : ""}" style="background:${KIND_COLOR[l.kind]}"></i>`).join("");
    body = `<div class="how">${how.map((h) => `<em>${h}</em>`).join(" ")}</div>
      ${mods.length ? `<ol>${mods.join("")}</ol>` : ""}
      <div class="pips" aria-label="${okFlags.filter(Boolean).length} of ${order.layers.length} layers">${pips}</div>`;
  }
  const sides: string[] = [];
  // Sizes lead so they're the first thing read: "L Fries", "S Pine Fizz".
  if (order.fries)
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

/** The road map: regions, roads and towns. Locked towns are greyed out; the truck sits on the current one. */
function mapSvg(m: { town: string; selected: string; unlocked: string[]; passed: string[]; best: Record<string, number>; day: number }): string {
  const byId = new Map(STOPS.map((t) => [t.id, t]));
  const open = (id: string) => m.unlocked.includes(id);
  const land = REGIONS.map((r) => {
    const ts = STOPS.filter((t) => t.region === r.id);
    const x0 = Math.min(...ts.map((t) => t.x)) - 9;
    const x1 = Math.max(...ts.map((t) => t.x)) + 9;
    const y0 = Math.min(...ts.map((t) => t.y)) - 9;
    const y1 = Math.max(...ts.map((t) => t.y)) + 9;
    const lit = ts.some((t) => open(t.id));
    return `<g class="region ${lit ? "" : "locked"}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="9" fill="${r.color}"/>
      <text x="${r.label === "left" ? x0 + 3 : x1 - 3}" y="${y0 + 5}" class="rname" text-anchor="${r.label === "left" ? "start" : "end"}">${esc(r.name)}</text></g>`;
  }).join("");
  const roads = STOPS.flatMap((a) =>
    a.roads.map((id) => {
      const b = byId.get(id)!;
      const lit = open(a.id) && open(b.id);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="road ${lit ? "" : "locked"}"/>`;
    }),
  ).join("");
  const towns = STOPS.map((t) => {
    const cls = ["town", open(t.id) ? "" : "locked", m.passed.includes(t.id) ? "passed" : "", t.id === m.selected ? "sel" : "", t.capital ? "capital" : ""].join(" ");
    const stars = Math.round(m.best[t.id] ?? 0);
    const r = t.capital ? 3.6 : 2.8;
    return `<g class="${cls}" data-act="town" data-id="${t.id}">
      <circle cx="${t.x}" cy="${t.y}" r="7" class="hit"/>
      <circle cx="${t.x}" cy="${t.y}" r="${r}" class="dot"/>
      <text x="${t.x}" y="${t.y + r + 3.6}" class="tname">${esc(t.name)}</text>
      ${eventOn(t.id, m.day) ? `<g class="flag"><circle cx="${t.x + r + 1.6}" cy="${t.y - r - 0.4}" r="2.3"/><text x="${t.x + r + 1.6}" y="${t.y - r + 0.7}">!</text></g>` : ""}
      ${m.passed.includes(t.id) ? `<text x="${t.x}" y="${t.y - r - 1.2}" class="tstars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</text>` : ""}
    </g>`;
  }).join("");
  const here = byId.get(m.town)!;
  const truck = `<g class="truck" transform="translate(${here.x - 4} ${here.y - 9.5})">
    <rect x="0" y="0" width="8" height="4.6" rx="1.2" fill="#e5432b" stroke="#1d1410" stroke-width="0.6"/>
    <rect x="5" y="0.8" width="2.2" height="1.8" rx="0.4" fill="#bfe3f2"/>
    <circle cx="2" cy="4.8" r="1" fill="#1d1410"/><circle cx="6" cy="4.8" r="1" fill="#1d1410"/></g>`;
  return `<svg class="map" viewBox="0 0 100 140" role="img" aria-label="Road map">${land}${roads}${towns}${truck}</svg>`;
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

/** What's on soon, anywhere on the map. */
function eventsHtml(day: number): string {
  const soon = EVENTS.map((e) => ({ e, d: nextDay(e, day) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  return `<ul class="events">${soon
    .map(({ e, d }) => `<li data-act="town" data-id="${e.town}"><b>${d === day ? "Today" : d === day + 1 ? "Tomorrow" : `Day ${d}`}</b> ${esc(e.name)} · ${esc(townById(e.town).name)}</li>`)
    .join("")}</ul>`;
}

function townEventHtml(town: string, day: number): string {
  const e = EVENTS.find((x) => x.town === town);
  if (!e) return "";
  const d = nextDay(e, day);
  const when = d === day ? "today" : d === day + 1 ? "tomorrow" : `on day ${d}`;
  return `<p class="event"><b>${esc(e.name)} ${when}.</b> ${esc(e.blurb)}${e.special ? ` Special: ${esc(e.special.name)}.` : ""} Busier, longer shift.</p>`;
}

export function titleHtml(t: {
  town: Stop;
  selected: Stop;
  unlocked: string[];
  passed: string[];
  best: Record<string, number>;
  day: number;
  popularity: number;
  press: PressPiece | null;
  trips: number;
  bank: number;
  owned: Upgrade[];
  offer: Upgrade[];
  fresh: boolean;
  biz: boolean;
  rep: number;
  reviews: Review[];
}): string {
  const trip = t.trips > 0 ? `Trip ${t.trips + 1} · ` : "";
  const sel = t.selected;
  const here = sel.id === t.town.id;
  const canGo = t.unlocked.includes(sel.id);
  const best = t.best[sel.id];
  const region = REGIONS.find((r) => r.id === sel.region)!;
  const action = here
    ? `<button class="btn primary" data-act="start" ${t.offer.length ? "disabled" : ""}>Open the window in ${esc(sel.name)}</button>`
    : canGo
      ? `<button class="btn primary" data-act="drive" data-id="${sel.id}" ${t.offer.length ? "disabled" : ""}>Drive to ${esc(sel.name)}</button>`
      : `<button class="btn primary" disabled>Locked: pass a town next to it first</button>`;
  return `<div class="card title">
    <p class="sub">${trip}Day ${t.day} on the road · ${t.passed.length} of ${STOPS.length} towns · Popularity ${t.popularity}</p>
    <h1>Bun Voyage</h1>
    ${offerHtml(t.offer)}
    ${t.fresh ? "" : mapSvg({ town: t.town.id, selected: sel.id, unlocked: t.unlocked, passed: t.passed, best: t.best, day: t.day })}
    ${t.fresh ? "" : eventsHtml(t.day)}
    ${t.press ? pressHtml(t.press, "Latest press") : ""}
    <div class="townCard">
      <h3>${esc(sel.name)} <span class="rg">${esc(region.name)}${sel.capital ? " · big city" : ""}</span></h3>
      <p>${esc(sel.blurb)}</p>
      ${crowdHtml(eventOn(sel.id, t.day)?.crowd ?? sel.crowd)}
      ${townEventHtml(sel.id, t.day)}
      ${best !== undefined ? `<p class="note">Best shift here: ${best.toFixed(1)} ★</p>` : ""}
      ${canGo && sel.newThing ? `<p class="new">${esc(sel.newThing)}</p>` : ""}
    </div>
    ${t.owned.length ? `<p class="owned">On the truck: ${t.owned.map((u) => esc(u.name)).join(", ")}</p>` : ""}
    ${t.fresh ? HOW_TO : `<details><summary><b>How to play</b></summary>${HOW_TO}</details>`}
    <div class="btn-row">
      ${action}
      ${t.fresh ? "" : `<button class="btn small biz ${t.biz ? "on" : ""}" data-act="biz">Business mode: ${t.biz ? "on" : "off"}</button>`}
      ${t.fresh ? "" : `<button class="btn small" data-act="new-trip">Start a new trip</button>`}
    </div>
    ${t.biz ? `<p class="note">You buy the ingredients, set prices and pick the menu. Reviews stick around: reputation <b>${t.rep.toFixed(1)} ★</b>.</p>${reviewsHtml(t.reviews, 1)}` : ""}
    ${t.bank ? `<p class="build">Savings: $${t.bank}</p>` : ""}
    <p class="build">${esc(buildLabel())}</p>
  </div>`;
}

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
  const opened = s.opened.length ? `<p class="new">New road${s.opened.length > 1 ? "s" : ""} open: ${s.opened.map((t) => esc(t.name)).join(" and ")}.</p>` : "";
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
