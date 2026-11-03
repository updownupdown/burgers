import { CROWD, MIN_MENU, menuFor } from "../game/business";
import { BONUSES, bonusById, GREAT, townBonus } from "../game/bonus";
import { expectedCustomers } from "../game/day";
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../game/difficulty";
import { criticChance, type PressPiece } from "../game/press";
import type { Save } from "../game/progress";
import { ratingPull, reviewAverage, reviewTotal, REVIEW_CHANCE } from "../game/reviews";
import { clockLabel, FIRST_HOUR, hourRate, LAST_HOUR, MIN_SHIFT, shiftHours, type ShiftWindow } from "../game/shift";
import { eventOn, type Recipe, type Stop } from "../game/stops";
import { askFor } from "../game/asks";
import { icon } from "../ui/icons";
import { buildLine, methodTags, stackArt } from "./menuref";
import { scrollShadows } from "./modal";
import { morph, parseOne } from "../ui/morph";
import "./day.css";

/**
 * The screens on either side of a shift, and the small ones off the map (see game/day.ts):
 *
 * - **Prep & Open**, before opening: one scrolling page around one big number, the people to
 *   expect and who they are, beside what draws them. Under it: the shift window on the day's lunch
 *   curve with a two-thumb slider, the menu one burger a row (a chevron opens its recipe), pacing,
 *   and the one bonus to bring. Everything here is fixed once the window opens.
 * - After the shift, the report card on the evening map lives in report.ts.
 * - **Popularity & reviews**, reached from the map: popularity, the rating and its breakdown by
 *   stars, and the critics' clippings.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const stars = (n: number) => `<span class="day-stars" aria-label="${n} of 5 stars"><span>${"★".repeat(n)}</span><span class="off">${"★".repeat(Math.max(0, 5 - n))}</span></span>`;
const CROWD_ICON: Record<string, string> = { commuters: "truck", families: "people", foodies: "critic", party: "sparkle" };

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
  const input = { stop, popularity: save.popularity, rating: ratingPull(save.reviewCounts), hidden: save.hidden, shift: w, bonus, pacing };
  const rating = reviewAverage(save.reviewCounts);
  const expect = expectedCustomers(input);
  const menu = menuFor(stop, save.hidden);
  const critic = bonus === "press" ? 1 : criticChance(stop.crowd, ev);

  const rows = stop.menu
    .map((r) => {
      const on = menu.includes(r);
      const locked = on && menu.length <= MIN_MENU;
      const chips = methodTags(r);
      const build = buildLine(r);
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
          <li>${icon("star")}<span>Rating</span><b class="bv-mono">${rating === null ? "–" : rating.toFixed(1)}</b></li>
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
        <p class="day-hint prep-min" role="status" hidden>Keep at least ${MIN_MENU === 2 ? "two" : MIN_MENU} recipes on the menu.</p>
        <div class="prep-rows">${rows}</div>
      </section>

      ${askHtml(stop, menu, save.day, expect)}

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

/**
 * Draw Prep into its host. The first time it builds the card; after that (`again`: a dish
 * switched, the pacing or the window changed) it updates the same card in place, so it doesn't
 * rise in again, keeps its scroll and keeps focus on what was tapped.
 */
export function renderPrep(host: HTMLElement, p: PrepInput, again: boolean): void {
  const html = prepHtml(p);
  const cur = again ? host.querySelector<HTMLElement>(":scope > .day-screen.prep") : null;
  const next = cur && parseOne(html);
  if (cur && next) {
    // The scroll shadows are the card's own state: carry them over so they don't fade and back.
    for (const c of ["sh-top", "sh-bot"]) next.classList.toggle(c, cur.classList.contains(c));
    morph(cur, next);
  } else {
    host.innerHTML = html;
    const card = host.querySelector<HTMLElement>(".prep");
    const sc = card?.querySelector<HTMLElement>(".day-scroll");
    if (card && sc) sc.addEventListener("scroll", () => scrollShadows(card, sc), { passive: true });
  }
  const card = host.querySelector<HTMLElement>(".prep");
  const sc = card?.querySelector<HTMLElement>(".day-scroll");
  if (card && sc) scrollShadows(card, sc);
}

/** Today's local ask (game/asks.ts): optional, a little extra money, and the shift counts as two. */
function askHtml(stop: Stop, menu: readonly Recipe[], day: number, expect: number): string {
  const a = askFor(stop, menu, day, expect);
  return `<section class="prep-sec prep-card prep-ask">
        <h3 class="prep-h">${icon("flag")}Local ask <span class="prep-shift-label bv-mono">+${money(a.reward)}</span></h3>
        <p class="ask-text">${esc(a.text)}.</p>
        <span class="day-hint">Optional. Met, it pays ${money(a.reward)} and this shift counts as two toward opening the roads.</span>
      </section>`;
}

/** Reviews by stars as five bars, 5★ at the top. */
export function breakdownHtml(counts: readonly number[]): string {
  const max = Math.max(1, ...counts);
  return `<div class="day-bars" role="list" aria-label="Reviews by stars">${[5, 4, 3, 2, 1]
    .map((n) => {
      const k = counts[n - 1] ?? 0;
      return `<div class="row" role="listitem" aria-label="${n} stars: ${k}"><span class="lbl bv-mono">${n}<i>★</i></span><span class="bar"><i style="width:${((k / max) * 100).toFixed(1)}%"></i></span><b class="bv-mono">${k}</b></div>`;
    })
    .join("")}</div>`;
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
// Popularity & reviews

export function reviewsHtml(save: Save): string {
  const press = save.press;
  const counts = save.reviewCounts;
  const total = reviewTotal(counts);
  const avg = reviewAverage(counts);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `<div class="day-screen bv">
    <header class="day-top">
      <span class="day-top-ic" aria-hidden="true">${icon("people")}</span>
      <div class="where"><b>Popularity &amp; reviews</b></div>
      <button class="bv-btn icon" data-act="back" aria-label="Back to the map">${icon("close")}</button>
    </header>
    <div class="day-scroll">
      <p class="day-count">${total} review${total === 1 ? "" : "s"} · ${press.length} clipping${press.length === 1 ? "" : "s"}</p>
      <div class="day-kpis two">
        <div class="day-kpi"><span class="bv-eyebrow">${icon("people")}Popularity</span><b>${save.popularity}<small class="of">/100</small></b><small>How many people have heard of the truck. Happy customers spread the word; walk-outs cost some.</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">${icon("star")}Rating</span><b>${avg === null ? "–" : avg.toFixed(1)} <span class="st">★</span></b><small>${avg === null ? "No reviews yet." : `The average of ${total} review${total === 1 ? "" : "s"}.`} A good rating brings a few more people.</small></div>
      </div>
      <section class="day-card" aria-label="Reviews by stars">
        <div class="day-card-h"><b>Reviews by stars</b>${avg === null ? "" : `<span class="day-avg">${stars(Math.round(avg))}<span class="bv-mono">${avg.toFixed(1)}</span></span>`}</div>
        ${breakdownHtml(counts)}
        <span class="day-hint">Every customer has an opinion; only some write a review. About ${pct(REVIEW_CHANCE[5])} of the delighted and ${pct(REVIEW_CHANCE[1])} of the furious do, but only ${pct(REVIEW_CHANCE[3])} of those who thought it was just okay. Critics always review.</span>
      </section>
      <h3 class="day-sub">${icon("critic")}From the critics</h3>
      <div class="day-rlist">
        ${press.map((p) => `<div class="day-rcard critic">${pressHtml(p)}</div>`).join("")}
        ${press.length ? "" : `<span class="day-hint">No clippings yet. Critics turn up more at events and in foodie towns; a great review lands in the paper or on TV.</span>`}
      </div>
    </div>
  </div>`;
}
