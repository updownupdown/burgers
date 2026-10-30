import type { Upgrade } from "./game/progress";
import type { Stop } from "./game/stops";
import type { Order, Plate } from "./game/types";
import { DRINK_COLOR, DRINK_LABEL, KIND_COLOR, KIND_LABEL } from "./game/types";
import { SLOT_COLORS } from "./scenes/tray";
import { buildLabel } from "./update";

const BELL_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5a2 2 0 0 1 2 2v1.2A9 9 0 0 1 25 17v5H7v-5a9 9 0 0 1 7-8.8V7a2 2 0 0 1 2-2z" fill="#1d1410"/><rect x="4" y="22" width="24" height="4" rx="2" fill="#1d1410"/><circle cx="16" cy="4" r="2" fill="#1d1410"/></svg>`;
const MENU_SVG = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="9" width="14" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="14" width="14" height="2.4" rx="1.2" fill="currentColor"/></svg>`;

const HOW_TO = `
<ul>
  <li><b>Customers</b> wait at the window. Their ticket shows the burger from top to bottom. Tap a ticket or plate to work on that order.</li>
  <li><b>Drag</b> ingredients up onto the tray, or <b>flick</b> them up to toss them on.</li>
  <li><b>Patties, bacon, eggs, buns and pineapple</b> go on the grill first. <b>Swipe up</b> on a patty to flip it, then drag it up to the plate. Press and hold a fresh patty to smash it flat.</li>
  <li><b>Sauce:</b> drag a bottle up to the tray and draw on the burger.</li>
  <li><b>Swipe sideways</b> or use the tabs for the Drinks and Fryer counters.</li>
  <li><b>Ring the bell twice</b> to serve. Swipe down on a plate to take the top layer off.</li>
</ul>`;

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
  bell: HTMLButtonElement;
  menuBtn: HTMLButtonElement;
  title: HTMLElement;
  menu: HTMLElement;
  summary: HTMLElement;
  update: HTMLElement;
  install: HTMLElement;
  updateText: HTMLElement;
}

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
  ${(["pine", "lemon", "cola"] as const).map((d) => `<div class="dlabel" data-r="dlabel" style="--c:${DRINK_COLOR[d]}">${DRINK_LABEL[d]}</div>`).join("")}
  <nav class="tabs">
    ${pages.map((p, i) => `<button class="tab" data-r="tab" data-page="${i}" aria-selected="false">${p}<span class="dot" hidden></span></button>`).join("")}
    <button class="bell" data-r="bell" aria-label="Ring the bell (twice to serve)">${BELL_SVG}</button>
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
    bell: q("bell") as HTMLButtonElement,
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
  if (order.fries) sides.push(`<span class="${plate.fries ? "ok" : ""}"><b style="background:#f3d36b"></b>Fries</span>`);
  if (order.drink) sides.push(`<span class="${plate.drink?.flavor === order.drink ? "ok" : ""}"><b style="background:${DRINK_COLOR[order.drink]}"></b>${DRINK_LABEL[order.drink]}</span>`);
  const pct = Math.max(0, Math.min(1, patience));
  const color = pct > 0.5 ? "#4caf50" : pct > 0.25 ? "#f0a92b" : "#e5432b";
  return `<div class="pat"><i style="width:${(pct * 100).toFixed(0)}%;background:${color}"></i></div>
    <div class="name"><span class="l">#${order.id} ${esc(order.name)}</span><span class="exp">${expanded ? "▴" : "▾"}</span></div>
    ${body}
    ${sides.length ? `<div class="sides">${sides.join("")}</div>` : ""}`;
}

function offerHtml(offer: Upgrade[]): string {
  if (!offer.length) return "";
  return `<h3>Pick a truck upgrade</h3>
    <div class="offers">${offer.map((u) => `<button class="offer" data-act="pick" data-id="${u.id}"><b>${esc(u.name)}</b><span>${esc(u.text)}</span></button>`).join("")}</div>`;
}

export function titleHtml(t: { stop: Stop; stopNum: number; stops: number; trips: number; bank: number; owned: Upgrade[]; offer: Upgrade[]; fresh: boolean }): string {
  const trip = t.trips > 0 ? `Trip ${t.trips + 1} · ` : "";
  return `<div class="card">
    <p class="sub">${trip}A food truck road trip · Stop ${t.stopNum} of ${t.stops}</p>
    <h1>Bun Voyage</h1>
    ${offerHtml(t.offer)}
    <p>${esc(t.stop.blurb)}</p>
    ${t.stop.newThing ? `<p class="new">${esc(t.stop.newThing)}</p>` : ""}
    ${t.owned.length ? `<p class="owned">On the truck: ${t.owned.map((u) => esc(u.name)).join(", ")}</p>` : ""}
    ${t.fresh ? HOW_TO : `<details><summary><b>How to play</b></summary>${HOW_TO}</details>`}
    <div class="btn-row">
      <button class="btn primary" data-act="start" ${t.offer.length ? "disabled" : ""}>Open the window in ${esc(t.stop.name)}</button>
      ${t.fresh ? "" : `<button class="btn small" data-act="new-trip">Start a new trip</button>`}
    </div>
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
  best: string | null;
  outcome: "passed" | "failed" | "trip";
  next: Stop | null;
  offer: Upgrade[];
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
      ? `<button class="btn primary" data-act="restart">Try ${esc(s.stop.name)} again</button>`
      : s.offer.length
        ? ""
        : s.outcome === "trip"
          ? `<button class="btn primary" data-act="next">Head home and start a new trip</button>`
          : `<button class="btn primary" data-act="next">Drive to ${esc(s.next!.name)}</button>`;
  return `<div class="card">
    <p class="sub">Closing time · ${esc(s.stop.name)}</p>
    <h2>${s.outcome === "trip" ? "Road trip complete!" : s.outcome === "failed" ? "Shift over" : "Shift complete"}</h2>
    <div class="stars" aria-label="${avg.toFixed(1)} stars average">${starRow}</div>
    <p>${verdict}</p>
    <dl class="stats">
      <dt>Orders served</dt><dd>${s.served}</dd>
      <dt>Customers who left</dt><dd>${s.lost}</dd>
      <dt>Average rating</dt><dd>${avg.toFixed(1)} ★</dd>
      <dt>Sales</dt><dd>$${s.earned}</dd>
      <dt>Tips</dt><dd>$${s.tips}</dd>
      <dt>Total</dt><dd>$${s.earned + s.tips}</dd>
      ${s.best ? `<dt>Best order</dt><dd>${esc(s.best)}</dd>` : ""}
    </dl>
    ${s.outcome !== "failed" ? offerHtml(s.offer) : ""}
    <div class="btn-row">${buttons}</div>
    <p class="build">${esc(buildLabel())}</p>
  </div>`;
}
