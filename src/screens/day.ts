import { CROWD, MIN_MENU, menuFor } from "../game/business";
import { BONUSES, bonusById, GREAT, MAX_PICKS, townBonus, validPicks } from "../game/bonus";
import { expectedCustomers, newRegionCrowd, regionShifts } from "../game/day";
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../game/difficulty";
import { criticChance, type PressPiece } from "../game/press";
import type { Save } from "../game/progress";
import { ratingPull, reviewAverage, reviewTotal, REVIEW_CHANCE } from "../game/reviews";
import { clockLabel, shiftHours, shiftKind, type ShiftWindow } from "../game/shift";
import { eventOn, REGIONS, type Recipe, type Stop } from "../game/stops";
import { askFor } from "../game/asks";
import { icon } from "../ui/icons";
import { buildLine, methodTags, stackArt } from "./menuref";
import { scrollShadows } from "./modal";
import { morph, parseOne } from "../ui/morph";
import "./day.css";

/**
 * The screens on either side of a shift, and the small ones off the map (see game/day.ts):
 *
 * - **Prep & Open**, before opening (DESIGN §51): it opens folded, showing only the people to
 *   expect, pacing and the shift (Lunch or Full day), the local ask, the bonuses brought last time
 *   and Open. "Change menu or bonuses" unfolds the menu, one dish a row, and the bonuses to pick
 *   from; once unfolded it stays open for the rest of the day. Everything here is fixed once the
 *   window opens.
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

/** The shift choice's two buttons: what each brings, in a line. */
const SHIFT_OPTS = [
  { v: "lunch", label: "Lunch", small: "11 to 3" },
  { v: "full", label: "Full day", small: "10 to 4" },
];

/**
 * Prep's fold ("Change menu or bonuses"): once opened it stays open for the rest of that day in
 * that town, also across a reload. Remembered on this device as "day:town".
 */
const FOLD_KEY = "bv-prep-fold";
export function prepUnfolded(day: number, town: string): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === `${day}:${town}`;
  } catch {
    return unfoldedHere === `${day}:${town}`;
  }
}
let unfoldedHere = "";
export function togglePrepFold(day: number, town: string): void {
  const open = !prepUnfolded(day, town);
  unfoldedHere = open ? `${day}:${town}` : "";
  try {
    if (open) localStorage.setItem(FOLD_KEY, unfoldedHere);
    else localStorage.removeItem(FOLD_KEY);
  } catch {
    // Storage can be unavailable; the fold still holds for this session.
  }
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
  const picks = validPicks(save.picks, save.bonuses);
  const fresh = regionShifts(save.shiftsIn, stop);
  const input = { stop, popularity: save.popularity, rating: ratingPull(save.reviewCounts), hidden: save.hidden, shift: w, bonuses: picks, pacing, regionShifts: fresh };
  const region = REGIONS.find((r) => r.id === stop.region);
  const rating = reviewAverage(save.reviewCounts);
  const expect = expectedCustomers(input);
  const menu = menuFor(stop, save.hidden);
  const critic = picks.includes("press") ? 1 : criticChance(stop.crowd, ev);

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
  const unfolded = prepUnfolded(save.day, stop.id);
  const kind = shiftKind(w);
  // Folded: the bonuses brought (last time's picks, still owned) as a line of chips.
  const brought = picks.length
    ? `<div class="prep-brought">${picks.map((id) => bonusById(id)!).map((b) => `<span class="bv-chip pill">${icon(b.icon)}${esc(b.name)}</span>`).join("")}</div>`
    : `<span class="day-hint">${owned.length ? "No bonus brought today." : "No bonuses yet. Each town has one: a great shift there unlocks it, then it's bought in the Garage."}</span>`;
  const bonusBody = owned.length
    ? `<div class="prep-bonuses">${owned
        .map(
          (b) => `<button class="prep-bonus" data-act="prep-bonus" data-v="${b.id}" aria-pressed="${picks.includes(b.id)}">
          <span class="ic">${icon(b.icon)}</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small><span class="tick">${picks.includes(b.id) ? icon("check") : ""}</span></button>`,
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
        ${newRegionCrowd(fresh) < 1 ? `<div class="bv-callout">${icon("people")}<span>Word hasn't reached ${esc(region?.name ?? "these parts")} yet, so it's a quieter day while you find your feet.</span></div>` : ""}
        ${ev ? `<div class="bv-callout">${icon("flag")}<span><b>${esc(ev.name)}.</b> ${esc(ev.blurb)}${ev.special ? ` Special: ${esc(ev.special.name)}.` : ""}</span></div>` : ""}
      </section>

      <section class="prep-sec prep-card prep-today">
        <h3 class="prep-h">${icon("timer")}Pacing</h3>
        ${seg("prep-pace", pacing, DIFFICULTIES.map((k) => ({ v: k, label: DIFFICULTY[k].label })))}
        <span class="day-hint">${esc(DIFFICULTY[pacing].blurb)}</span>
        <h3 class="prep-h">${icon("clock")}Shift <span class="prep-shift-label bv-mono">${shiftLabel(w)}</span></h3>
        ${seg("prep-shift", kind, SHIFT_OPTS)}
        <span class="day-hint">${kind === "full" ? "Half as long again as lunch, with more customers and more takings." : "The lunch rush, about five minutes. A full day runs longer and pays more."}</span>
      </section>

      ${askHtml(stop, menu, save.day, expect, !!save.shiftsIn[stop.id])}

      ${
        unfolded
          ? ""
          : `<section class="prep-sec prep-card prep-bring">
        <h3 class="prep-h">${icon("sparkle")}Bonuses</h3>
        ${brought}
        ${hereLine}
      </section>`
      }

      <button class="prep-fold" data-act="prep-fold" aria-expanded="${unfolded}">
        <span><b>Change menu or bonuses</b><small>${menu.length} dishes on the menu${owned.length ? ` · ${picks.length} of ${Math.min(MAX_PICKS, owned.length)} bonuses` : ""}</small></span>${icon("down")}
      </button>

      ${
        unfolded
          ? `<section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("food-menu")}Menu
          <button class="bv-toggle prep-ing" role="switch" aria-checked="${showIngredients}" data-act="prep-ing"><span class="lbl">Show ingredients</span><span class="sw"></span></button>
        </h3>
        <p class="day-hint prep-min" role="status" hidden>Keep at least ${MIN_MENU === 2 ? "two" : MIN_MENU} recipes on the menu.</p>
        <div class="prep-rows">${rows}</div>
      </section>

      <section class="prep-sec prep-card">
        <h3 class="prep-h">${icon("sparkle")}Bonuses${owned.length > 1 ? `<span>Pick up to ${MAX_PICKS}</span>` : ""}</h3>
        ${bonusBody}
        ${hereLine}
      </section>`
          : ""
      }
    </div>
    <footer class="day-foot">
      <div class="sum"><span class="bv-eyebrow">${picks.length === 1 ? esc(bonusById(picks[0])!.name) : picks.length ? `${picks.length} bonuses` : "No bonus"}</span><b><span class="bv-mono">~${expect}</span> customers</b></div>
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
function askHtml(stop: Stop, menu: readonly Recipe[], day: number, expect: number, beenBefore: boolean): string {
  // No local ask on a town's first shift (one new thing at a time; main.ts startShift agrees).
  if (!beenBefore) return "";
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
    <header class="menu-head bar">
      <span class="menu-head-ic" aria-hidden="true">${icon("people")}</span>
      <div class="menu-headtext"><h2 class="bv-title">Popularity &amp; reviews</h2></div>
      <button class="bv-btn icon sm ghost menu-x" data-act="back" aria-label="Back to the map">${icon("close")}</button>
    </header>
    <div class="day-scroll">
      ${total || press.length ? `<p class="day-count">${total} review${total === 1 ? "" : "s"} · ${press.length} clipping${press.length === 1 ? "" : "s"}</p>` : ""}
      <div class="day-kpis two">
        <div class="day-kpi"><span class="bv-eyebrow">${icon("people")}Popularity</span><b>${save.popularity}<small class="of">/100</small></b><small>How many people have heard of the truck. Happy customers spread the word; walk-outs cost some.</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">${icon("star")}Rating</span><b>${avg === null ? "–" : avg.toFixed(1)} <span class="st">★</span></b><small>${avg === null ? "No reviews yet." : `The average of ${total} review${total === 1 ? "" : "s"}.`} A good rating brings a few more people.</small></div>
      </div>
      ${
        total
          ? `<section class="day-card" aria-label="Reviews by stars">
        <div class="day-card-h"><b>Reviews by stars</b>${avg === null ? "" : `<span class="day-avg">${stars(Math.round(avg))}<span class="bv-mono">${avg.toFixed(1)}</span></span>`}</div>
        ${breakdownHtml(counts)}
        <span class="day-hint">Every customer has an opinion; only some write a review. About ${pct(REVIEW_CHANCE[5])} of the delighted and ${pct(REVIEW_CHANCE[1])} of the furious do, but only ${pct(REVIEW_CHANCE[3])} of those who thought it was just okay. Critics always review.</span>
      </section>`
          : `<section class="rev-empty" aria-label="No reviews yet">${stars(0)}<b>No reviews yet</b><span>About ${pct(REVIEW_CHANCE[5])} of the delighted and ${pct(REVIEW_CHANCE[1])} of the furious write one; critics always do. The first lands after a shift.</span></section>`
      }
      <h3 class="day-sub">${icon("critic")}From the critics</h3>
      <div class="day-rlist">
        ${press.map((p) => `<div class="day-rcard critic">${pressHtml(p)}</div>`).join("")}
        ${press.length ? "" : `<span class="day-hint">No clippings yet. Critics turn up more at events and in foodie towns; a great review lands in the paper or on TV.</span>`}
      </div>
    </div>
  </div>`;
}
