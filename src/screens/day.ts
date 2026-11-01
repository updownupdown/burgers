import { CROWD, MIN_MENU, menuFor } from "../game/business";
import { BONUSES, bonusById, GREAT, townBonus } from "../game/bonus";
import { expectedCustomers } from "../game/day";
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../game/difficulty";
import { criticChance, type PressPiece } from "../game/press";
import type { Closing, Save } from "../game/progress";
import { clockLabel, FIRST_HOUR, hourRate, LAST_HOUR, MIN_SHIFT, shiftHours, type ShiftWindow } from "../game/shift";
import { eventOn, townById, type Stop } from "../game/stops";
import { SHIFTS_TO_UNLOCK } from "../game/travel";
import { icon } from "../ui/icons";
import { buildLabel } from "../update";
import { stackArt } from "./menuref";
import { COUNTED, KIND_LABEL } from "../game/types";
import { recipeCount } from "../game/stops";
import "./day.css";

/**
 * The screens on either side of a shift, and the small ones off the map (see game/day.ts):
 *
 * - **Prep & Open**, before opening: one scrolling page around one big number, the people to
 *   expect and who they are, beside what draws them. Under it: the shift window on the day's lunch
 *   curve with a two-thumb slider, the menu one burger a row (a chevron opens its recipe), pacing,
 *   and the one bonus to bring. Everything here is fixed once the window opens.
 * - **Closing**, after the shift: the town's bonus, when a great shift unlocked it (with a Buy
 *   button when savings cover it), then the stars, the takings, today's reviews, the press and the road.
 * - **Reviews**, reached from the map.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const stars = (n: number) => `<span class="day-stars"><span>${"★".repeat(n)}</span><span class="off">${"★".repeat(Math.max(0, 3 - n))}</span></span>`;
const CROWD_ICON: Record<string, string> = { commuters: "truck", families: "people", foodies: "critic", party: "sparkle" };

/** Which boxes are open on Closing. Remembered while the app runs. */
const openBoxes = new Set<string>(["closing:road"]);
export function toggleBox(id: string): void {
  if (openBoxes.has(id)) openBoxes.delete(id);
  else openBoxes.add(id);
}

interface Box {
  id: string;
  icon: string;
  title: string;
  sub: string;
  /** The effect, in mono, and a word under it. */
  value: string;
  unit?: string;
  warn?: boolean;
  body: string;
}

function boxHtml(b: Box, act: string): string {
  const open = openBoxes.has(b.id);
  return `<section class="day-box ${open ? "open" : ""}">
    <button class="day-box-h" data-act="${act}" data-v="${b.id}" aria-expanded="${open}">
      <span class="ic">${icon(b.icon)}</span>
      <span class="t"><b>${b.title}</b><small>${b.sub}</small></span>
      <span class="v">${b.value}${b.unit ? `<small class="${b.warn ? "warn" : ""}">${b.unit}</small>` : ""}</span>
      <span class="chev">${icon("down")}</span>
    </button>
    <div class="day-box-b" ${open ? "" : "hidden"}>${b.body}</div>
  </section>`;
}

function seg(act: string, cur: string, opts: { v: string; label: string; small?: string; disabled?: boolean }[]): string {
  return `<div class="bv-seg compact" role="group">${opts
    .map((o) => `<button data-act="${act}" data-v="${o.v}" aria-pressed="${o.v === cur}" ${o.disabled ? "disabled" : ""}>${o.label}${o.small ? `<small>${o.small}</small>` : ""}</button>`)
    .join("")}</div>`;
}

const hourLabel = (h: number) => clockLabel(h);

/** The shift's hours as one label: "11:00am – 3:00pm · 4 h". */
export const shiftLabel = (w: ShiftWindow) => `${hourLabel(w.start)} – ${hourLabel(w.end)} · ${shiftHours(w)} h`;

/**
 * The day's arrivals as bars by the hour, with the shift's window lit, over a two-thumb slider
 * for opening and closing. Thumbs sit on the hour lines between bars; the window is at least
 * MIN_SHIFT hours.
 */
function rangeHtml(w: ShiftWindow): string {
  const hours: number[] = [];
  for (let h = FIRST_HOUR; h < LAST_HOUR; h++) hours.push(h);
  const bw = 100 / hours.length;
  const bars = hours
    .map((h, i) => {
      const r = hourRate(h);
      const on = h >= w.start && h < w.end;
      const ht = 8 + r * 40;
      return `<rect class="${on ? "on" : ""}" data-h="${h}" x="${i * bw + 1}" y="${50 - ht}" width="${bw - 2}" height="${ht}" rx="1.5"/>`;
    })
    .join("");
  const span = LAST_HOUR - FIRST_HOUR;
  const pos = (h: number) => ((h - FIRST_HOUR) / span).toFixed(4);
  const input = (end: "start" | "end", v: number) =>
    `<input type="range" min="${FIRST_HOUR}" max="${LAST_HOUR}" step="1" value="${v}" data-range="${end}" aria-label="${end === "start" ? "Open at" : "Close at"}" aria-valuetext="${hourLabel(v)}">`;
  return `<div class="prep-range" style="--a:${pos(w.start)};--b:${pos(w.end)}">
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
    <div class="rng"><div class="track"><i></i></div>${input("start", w.start)}${input("end", w.end)}</div>
  </div>`;
}

/**
 * Drag a thumb: keep the window at least MIN_SHIFT hours (the thumb being dragged stops), then
 * light the bars and the label to match. Returns the window shown.
 */
export function syncRange(root: HTMLElement, moved: "start" | "end"): ShiftWindow {
  const a = root.querySelector<HTMLInputElement>('input[data-range="start"]')!;
  const b = root.querySelector<HTMLInputElement>('input[data-range="end"]')!;
  let start = Number(a.value);
  let end = Number(b.value);
  if (end - start < MIN_SHIFT) {
    if (moved === "start") start = end - MIN_SHIFT;
    else end = start + MIN_SHIFT;
    if (start < FIRST_HOUR) [start, end] = [FIRST_HOUR, FIRST_HOUR + MIN_SHIFT];
    if (end > LAST_HOUR) [start, end] = [LAST_HOUR - MIN_SHIFT, LAST_HOUR];
    a.value = String(start);
    b.value = String(end);
  }
  a.setAttribute("aria-valuetext", hourLabel(start));
  b.setAttribute("aria-valuetext", hourLabel(end));
  const w = { start, end };
  const box = root.querySelector<HTMLElement>(".prep-range");
  const span = LAST_HOUR - FIRST_HOUR;
  box?.style.setProperty("--a", ((start - FIRST_HOUR) / span).toFixed(4));
  box?.style.setProperty("--b", ((end - FIRST_HOUR) / span).toFixed(4));
  root.querySelectorAll<SVGRectElement>(".prep-range rect").forEach((r) => {
    const h = Number(r.dataset.h);
    r.classList.toggle("on", h >= start && h < end);
  });
  const label = root.querySelector(".prep-shift-label");
  if (label) label.textContent = shiftLabel(w);
  return w;
}

/** Prep's "Show ingredients" switch. Remembered on this device. */
let showIngredients = (() => {
  try {
    return localStorage.getItem("bv-prep-ing") === "1";
  } catch {
    return false;
  }
})();
export function toggleIngredients(): void {
  showIngredients = !showIngredients;
  try {
    localStorage.setItem("bv-prep-ing", showIngredients ? "1" : "0");
  } catch {
    // Storage can be unavailable; the switch just won't stick.
  }
}

// ---------------------------------------------------------------------------
// Prep & Open

export interface PrepInput {
  save: Save;
  /** Today's town, with its event applied. */
  stop: Stop;
  /** The pacing the shift will open on. */
  pacing: Difficulty;
}

export function prepHtml(p: PrepInput): string {
  const { save, stop, pacing } = p;
  const ev = eventOn(stop.id, save.day);
  const crowd = CROWD[stop.crowd];
  const w = save.shift;
  const bonus = save.bonus && save.bonuses.includes(save.bonus) ? save.bonus : null;
  const input = { stop, popularity: save.popularity, rep: save.rep, hidden: save.hidden, shift: w, bonus, pacing };
  const expect = expectedCustomers(input);
  const menu = menuFor(stop, save.hidden);
  const critic = bonus === "press" ? 1 : criticChance(stop.crowd, ev);

  const rows = stop.menu
    .map((r) => {
      const on = menu.includes(r);
      const locked = on && menu.length <= MIN_MENU;
      const chips = [r.toasted ? "Toasted bun" : "", r.smash ? "Smashed patty" : "", r.melt ? "Melted cheese" : ""].filter(Boolean);
      // Between the buns, bottom to top; counted toppings once, with their count.
      const inner = r.layers.slice(1, -1);
      const build = inner
        .filter((k, i) => !COUNTED.has(k) || inner.indexOf(k) === i)
        .map((k) => (COUNTED.has(k) ? `${KIND_LABEL[k]} ×${recipeCount(r, k)}` : KIND_LABEL[k]))
        .join(" · ");
      return `<button class="prep-row ${on ? "" : "off"}" data-act="prep-menu" data-v="${esc(r.name)}" aria-pressed="${on}" ${locked ? 'aria-disabled="true"' : ""}>
        <span class="tick">${on ? icon("check") : ""}</span>
        <span class="nm"><b>${esc(r.name)}</b>${
          showIngredients ? `<span class="build">${esc(build)}</span>${chips.length ? `<small>${chips.join(" · ")}</small>` : ""}` : ""
        }</span>
        ${stackArt(r)}
      </button>`;
    })
    .join("");

  const owned = BONUSES.filter((b) => save.bonuses.includes(b.id));
  const here = townBonus(stop.id);
  const goal = `a ${GREAT.stars}★ average with ${Math.round(GREAT.served * 100)}% of orders served`;
  const hereLine = here
    ? save.bonuses.includes(here.id)
      ? ""
      : save.found.includes(here.id)
        ? `<span class="day-hint">${icon(here.icon)}<span><b>${esc(here.name)}</b> is unlocked here: ${money(here.price)} in the Garage.</span></span>`
        : `<span class="day-hint">${icon("lock")}<span>A great shift here (${goal}) unlocks <b>${esc(here.name)}</b>: ${esc(here.text.charAt(0).toLowerCase() + here.text.slice(1))}</span></span>`
    : "";
  const bonusBody = owned.length
    ? `<div class="prep-bonuses">${owned
        .map(
          (b) => `<button class="prep-bonus" data-act="prep-bonus" data-v="${b.id}" aria-pressed="${b.id === bonus}">
          <span class="ic">${icon(b.icon)}</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small><span class="tick">${b.id === bonus ? icon("check") : ""}</span></button>`,
        )
        .join("")}</div>`
    : `<span class="day-hint">No bonuses yet. Each town has one: a great shift there unlocks it, then it's bought in the Garage.</span>`;

  return `<div class="day-screen bv prep" role="dialog" aria-modal="true" aria-label="Prep and open">
    <header class="menu-head bar">
      <span class="menu-head-ic" aria-hidden="true">${icon("bell")}</span>
      <div class="menu-headtext"><h2 class="bv-title">${esc(stop.name)}: Day ${save.day}</h2></div>
      <button class="bv-btn icon sm ghost menu-x" data-act="back" aria-label="Back to the map">${icon("close")}</button>
    </header>
    <div class="day-scroll">
      <section class="prep-expect prep-card">
        <div class="l">
          <b class="num bv-mono">${expect}</b>
          <div class="who"><span>expected customers</span><span class="bv-chip pill crowd">${icon(CROWD_ICON[stop.crowd] ?? "people")}${crowd.label}</span></div>
        </div>
        <ul class="r">
          <li>${icon("people")}<span>Popularity</span><b class="bv-mono">${save.popularity}</b></li>
          <li>${icon("star")}<span>Rating</span><b class="bv-mono">${save.rep.toFixed(1)}</b></li>
          <li>${icon("critic")}<span>Critic</span><b>${critic >= 1 ? "Booked" : critic >= 0.5 ? "Likely" : critic >= 0.25 ? "Possible" : "Unlikely"}</b></li>
        </ul>
        ${ev ? `<div class="bv-callout">${icon("flag")}<span><b>${esc(ev.name)}.</b> ${esc(ev.blurb)}${ev.special ? ` Special: ${esc(ev.special.name)}.` : ""}</span></div>` : ""}
      </section>

      <section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("timer")}Pacing</h3>
        ${seg("prep-pace", pacing, DIFFICULTIES.map((k) => ({ v: k, label: DIFFICULTY[k].label })))}
        <span class="day-hint">${esc(DIFFICULTY[pacing].blurb)}</span>
      </section>

      <section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("clock")}Shift <span class="prep-shift-label bv-mono">${shiftLabel(w)}</span></h3>
        ${rangeHtml(w)}
      </section>

      <section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("food-menu")}Menu
          <button class="bv-toggle prep-ing" role="switch" aria-checked="${showIngredients}" data-act="prep-ing"><span class="lbl">Show ingredients</span><span class="sw"></span></button>
        </h3>
        <div class="prep-rows">${rows}</div>
      </section>

      <section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("sparkle")}Bonus</h3>
        ${bonusBody}
        ${hereLine}
      </section>
    </div>
    <footer class="day-foot">
      <div class="sum"><span class="bv-eyebrow">${bonus ? esc(bonusById(bonus)!.name) : "No bonus"}</span><b>~${expect} customers</b></div>
      <button class="bv-btn primary lg" data-act="open">${icon("bell")}Open</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
// Closing

export function closingHtml(c: Closing, save: Save): string {
  const town = townById(c.town);
  const avg = c.stars.length ? c.stars.reduce((a, b) => a + b, 0) / c.stars.length : 0;
  const verdict =
    c.served === 0
      ? "The truck stayed quiet today."
      : c.outcome === "failed"
        ? `${town.name} wasn't impressed. Serve at least half the customers with a 1★ average to count the day.`
        : c.great
          ? `A great shift. ${town.name} will be talking about this for weeks.`
          : avg >= 1.5
            ? "Solid shift. Everyone left full."
            : "A rough day at the grill, but you made it.";
  const row = (dt: string, dd: string, cls = "", sub = "") => `<dt class="${cls}">${dt}${sub ? `<small>${sub}</small>` : ""}</dt><dd class="${cls}">${dd}</dd>`;
  const newBest = c.takings > 0 && (c.bestBefore === null || c.takings > c.bestBefore);
  const earned = c.unlocked ? bonusById(c.unlocked) : null;
  const owns = earned ? save.bonuses.includes(earned.id) : false;
  const boxes: Box[] = [];
  boxes.push({
    id: "closing:take",
    icon: "receipt",
    title: "Takings",
    sub: `${c.served} order${c.served === 1 ? "" : "s"}${c.lost ? ` · ${c.lost} walked out` : ""}${c.leftLine ? ` · ${c.leftLine} left the line` : ""}`,
    value: money(c.takings),
    unit: newBest ? (c.bestBefore === null ? "first here" : "town best") : `best ${money(c.bestBefore ?? 0)}`,
    body: `<div class="day-ledger"><h4><span>Day ${c.day}</span><span>${esc(town.name)}</span></h4><dl>
      ${row("Orders", money(c.earned))}
      ${row("Tips", money(c.tips), "", "for speed")}
      ${c.comped ? row("On the house", `−${money(c.comped)}`, "neg", "sides and extras nobody ordered") : ""}
      ${c.spills ? row("Spilled soda", `−${money(c.spills)}`, "neg") : ""}
      ${row("Takings", money(c.takings), "tot")}
      ${row("Savings", money(save.bank), "", "takings go in; spend them in the Garage")}
    </dl><div class="foot"><span>Best in ${esc(town.name)}</span><b>${newBest ? "New best!" : money(c.bestBefore ?? 0)}</b></div></div>
    ${c.best ? `<span class="day-hint">Best order: ${esc(c.best)}.</span>` : ""}`,
  });
  boxes.push({
    id: "closing:rev",
    icon: "star",
    title: "Today's reviews",
    sub: c.served ? (c.reviews.length ? `From ${c.served} orders; best and worst below` : `${c.served} orders, no written reviews`) : "Nobody was served",
    value: `${avg.toFixed(1)}★`,
    unit: `rating ${c.repBefore.toFixed(1)} → ${c.rep.toFixed(1)}`,
    body: `<ul class="day-rev">${c.reviews.slice(0, 3).map((r) => `<li>${stars(r.stars)}<q>${esc(r.text)}</q></li>`).join("")}</ul>
      <button class="bv-btn sm" data-act="reviews">${icon("review")}All ${save.reviews.length} reviews</button>`,
  });
  boxes.push({
    id: "closing:press",
    icon: "critic",
    title: "Popularity",
    sub: c.press ? `A critic ate here today` : "Word of mouth",
    value: c.pop[0] === c.pop[1] ? "—" : `${c.pop[1] > c.pop[0] ? "+" : "−"}${Math.abs(c.pop[1] - c.pop[0])}`,
    unit: c.pop[0] === c.pop[1] ? "" : `${c.pop[0]} → ${c.pop[1]}`,
    body: c.press ? pressHtml(c.press) : `<span class="day-hint">Popularity ${c.pop[1]}. Happy customers tell their friends; walk-outs tell theirs. Critics turn up more at events and in foodie towns.</span>`,
  });
  const left = SHIFTS_TO_UNLOCK - c.shiftsHere;
  const opened = c.opened.map((id) => townById(id).name);
  boxes.push({
    id: "closing:road",
    icon: "road",
    title: "The road",
    sub: c.outcome === "failed" ? "Shift not counted" : `Good shift · ${Math.min(c.shiftsHere, SHIFTS_TO_UNLOCK)} of ${SHIFTS_TO_UNLOCK} in ${esc(town.name)}`,
    value: opened.length ? "New road" : c.outcome === "trip" ? "Trip done" : c.outcome === "failed" ? "—" : left > 0 && town.roads.length ? `${left} more` : "Open",
    unit: "",
    body: `<div class="day-road"><span class="day-pips">${Array.from({ length: SHIFTS_TO_UNLOCK }, (_, i) => `<i class="${i < c.shiftsHere ? (i === c.shiftsHere - 1 && c.outcome !== "failed" ? "new" : "on") : ""}"></i>`).join("")}</span>
      <span>${
        c.outcome === "trip"
          ? "You've reached the end of the road. Every town stays open, so keep touring or start a new trip from the menu."
          : opened.length
            ? `<b>${opened.map(esc).join(" and ")}</b> ${opened.length > 1 ? "are" : "is"} open. Tap ${opened.length > 1 ? "one" : "it"} on the map to see the drive.`
            : c.outcome === "failed"
              ? "Serve at least half the customers with a 1★ average and the day counts toward the road."
              : left > 0 && town.roads.length
                ? `${left === 1 ? "One more good shift opens" : `${left} more good shifts open`} the road on.`
                : "The roads out of here are open."
      }</span></div>`,
  });

  const reward = earned
    ? `<section class="day-reward" aria-label="Bonus unlocked">
        <span class="bv-eyebrow">Great shift · ${esc(town.name)}'s bonus unlocked</span>
        <span class="ic">${icon(earned.icon)}</span>
        <b>${esc(earned.name)}</b>
        <p>${esc(earned.text)}</p>
        ${
          owns
            ? `<small>It's yours. Bring it from Prep &amp; Open, one bonus per shift.</small>`
            : save.bank >= earned.price
              ? `<button class="bv-btn primary block" data-act="buy-bonus" data-v="${earned.id}">${icon("coin")}Buy now · ${money(earned.price)}</button><small>Savings ${money(save.bank)}. Or later, in the Garage.</small>`
              : `<small>${money(earned.price)} in the Garage. Savings ${money(save.bank)}, ${money(earned.price - save.bank)} to go.</small>`
        }
      </section>`
    : "";
  const tb = townBonus(town.id);
  const goal =
    !earned && tb && !save.found.includes(tb.id) && c.outcome !== "failed"
      ? `<p class="day-goal">${icon("lock")}<span>A great shift here unlocks <b>${esc(tb.name)}</b>: ${GREAT.stars}★ average, ${Math.round(GREAT.served * 100)}% of orders served, at least ${GREAT.min}.</span></p>`
      : "";

  return `<div class="day-screen bv closing">
    <header class="day-hero">
      <span class="bv-eyebrow">Closing time · Day ${c.day} · ${hourLabel(c.shift.start)} to ${hourLabel(c.shift.end)}</span>
      <h2 class="bv-title">${esc(town.name)}</h2>
      <div class="day-hero-stars" aria-label="${avg.toFixed(1)} stars average">${stars(Math.round(avg))} <span class="bv-mono">${avg.toFixed(1)}</span></div>
      <p>${verdict}</p>
    </header>
    <div class="day-scroll">
      ${reward}
      <div class="day-kpis">
        <div class="day-kpi"><span class="bv-eyebrow">Takings</span><b class="${newBest ? "up" : ""}">${money(c.takings)}</b><small>${newBest ? "town best" : `best ${money(c.bestBefore ?? 0)}`}</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Rating</span><b>${c.rep.toFixed(1)}</b><small>${c.rep >= c.repBefore ? "+" : "−"}${Math.abs(c.rep - c.repBefore).toFixed(1)} today</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Served</span><b>${c.served}</b><small>${c.lost + c.leftLine ? `${c.lost + c.leftLine} left` : "nobody left"}</small></div>
      </div>
      ${goal}
      ${boxes.map((b) => boxHtml(b, "closing-box")).join("")}
      <p class="day-build">${esc(buildLabel())}</p>
    </div>
    <footer class="day-foot">
      <button class="bv-btn primary lg block" data-act="evening">${icon("moon")}Evening map</button>
    </footer>
  </div>`;
}

const OUTLET_LABEL = { paper: "Newspaper", magazine: "Magazine", tv: "On TV" } as const;

export function pressHtml(p: PressPiece): string {
  return `<div class="day-press ${p.outlet}">
    <span class="bv-eyebrow">${OUTLET_LABEL[p.outlet]} · ${esc(p.source)}</span>
    <b>${esc(p.headline)}</b>
    <q>${stars(p.stars)} ${esc(p.quote)}</q>
    <small>${p.pop >= 0 ? "+" : "−"}${Math.abs(p.pop)} popularity</small>
  </div>`;
}

// ---------------------------------------------------------------------------
// Reviews

export type ReviewFilter = "all" | "critics" | "good" | "bad" | "here";

export function reviewsHtml(save: Save, filter: ReviewFilter): string {
  const here = townById(save.town).name;
  const press = save.press;
  const reviews = save.reviews;
  const list =
    filter === "critics"
      ? []
      : reviews.filter((r) => filter === "all" || (filter === "good" && r.stars >= 3) || (filter === "bad" && r.stars <= 1) || (filter === "here" && r.stop === here));
  const showPress = filter === "all" || filter === "critics";
  const f = (v: ReviewFilter, label: string) => `<button data-act="rf" data-v="${v}" aria-pressed="${filter === v}">${label}</button>`;
  return `<div class="day-screen bv">
    <header class="day-top">
      <button class="bv-btn icon" data-act="back" aria-label="Back to the map">${icon("back")}</button>
      <div class="where"><span class="bv-eyebrow">${reviews.length} review${reviews.length === 1 ? "" : "s"} · ${press.length} clipping${press.length === 1 ? "" : "s"}</span><b>Popularity &amp; reviews</b></div>
    </header>
    <div class="day-scroll">
      <div class="day-kpis two">
        <div class="day-kpi"><span class="bv-eyebrow">${icon("people")}Popularity</span><b>${save.popularity}<small class="of">/100</small></b><small>How many people have heard of the truck. Fills the line.</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">${icon("star")}Rating</span><b>${save.ratingCount ? save.rep.toFixed(1) : "–"} <span class="st">★</span></b><small>${save.ratingCount ? "Recent reviews count most." : "No orders yet."} A good rating brings a few more people.</small></div>
      </div>
      <div class="day-filters">${f("all", "All")}${f("critics", "Critics")}${f("good", "3★")}${f("bad", "1★")}${f("here", esc(here))}</div>
      <div class="day-rlist">
        ${showPress ? press.map((p) => `<div class="day-rcard critic">${pressHtml(p)}</div>`).join("") : ""}
        ${list.map((r) => `<div class="day-rcard"><div class="h">${stars(r.stars)}<span class="who">${esc(r.stop)}</span></div><q>${esc(r.text)}</q></div>`).join("")}
        ${!list.length && !(showPress && press.length) ? `<span class="day-hint">${reviews.length || press.length ? "Nothing here yet." : "No reviews yet. Customers write one after they eat, and critics turn up at events and in foodie towns."}</span>` : ""}
      </div>
    </div>
  </div>`;
}
