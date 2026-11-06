import { bonusById, GREAT, townBonus, type BonusId } from "../game/bonus";
import { ordersShown, PASS_STARS, type Closing, type Save } from "../game/progress";
import { addReviews, noReviews, reviewAverage, reviewTotal } from "../game/reviews";
import { clockLabel } from "../game/shift";
import { townById } from "../game/stops";
import { SHIFTS_TO_UNLOCK } from "../game/travel";
import { opinionFace, opinionLabel } from "../ui/faces";
import { icon } from "../ui/icons";
import { breakdownHtml, pressHtml } from "./day";
import { esc, popModal, pushModal } from "./modal";
import "./report.css";

/**
 * The report card (DESIGN.md §39): how the shift went, in a small modal over the evening map.
 * It comes up as the view lands on the truck, and the map's Results button brings it back for the
 * rest of the evening. Up top, what the old results sheet showed: the stars, a verdict, the
 * unlocked bonus and three numbers. Under them one row each for the orders, today's reviews,
 * popularity, the road and the town's bonus, and each row opens in place to the detail the old
 * full-screen Closing view had. Continue (or ×, the scrim, Back) leaves the evening map as it was.
 */

export interface ReportDeps {
  save: Save;
  /** Buy the unlocked bonus here: true once bought (and saved). */
  buy(id: BonusId): boolean;
  /** Leave for Popularity & reviews, the Garage or a town on the map (the card closes first). */
  reviews(): void;
  garage(): void;
  town(id: string): void;
  /** The card went away (Continue, ×, the scrim or Back), not when it left for another screen. */
  closed?(): void;
}

const KEY = "report";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const stars = (n: number) => `<span class="day-stars" aria-label="${n} of 5 stars"><span>${"★".repeat(n)}</span><span class="off">${"★".repeat(Math.max(0, 5 - n))}</span></span>`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Which rows are open. Remembered while the app runs, so Results opens the card as it was left. */
const openSecs = new Set<string>();

/** The one line under the town's name that says how the shift went. */
export function verdictLine(c: Closing): string {
  const town = townById(c.town);
  const avg = c.stars.length ? c.stars.reduce((a, b) => a + b, 0) / c.stars.length : 0;
  const gone = c.lost + c.leftLine;
  return c.served === 0
    ? gone > 0
      ? `Nobody got their food today: ${gone} walked out.`
      : "The truck stayed quiet today."
    : c.outcome === "failed"
      ? `${town.name} wasn't impressed. Serve at least half the customers with a ${PASS_STARS}★ average to count the day.`
      : c.great
        ? c.pacing === "stressful"
          ? `A great shift on Busy! ${town.name} will be talking about this for weeks.`
          : `A great shift. ${town.name} will be talking about this for weeks.`
        : avg >= 3.5
          ? "Solid shift. Everyone left full."
          : "A rough day at the grill, but you made it.";
}

/** How today's reviews moved the rating, for the Rating number. */
function ratingDelta(c: Closing): string {
  const n = c.reviews.length;
  if (!n) return "no reviews today";
  if (c.rating === null || c.ratingBefore === null) return plural(n, "review");
  // Compared as shown, to one place, so it agrees with "4.1 → 4.0" in the reviews row.
  const d = Number((Number(c.rating.toFixed(1)) - Number(c.ratingBefore.toFixed(1))).toFixed(1));
  return d === 0 ? `${plural(n, "review")}, no change` : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} today`;
}

/** What every served customer thought: a face per opinion, 5★ to 1★, with how many. */
function opinionsHtml(opinions: readonly number[]): string {
  if (!opinions.length) return "";
  return `<div class="day-ops" aria-label="What customers thought">${[5, 4, 3, 2, 1]
    .map((n) => {
      const k = opinions.filter((s) => s === n).length;
      return `<span class="${k ? "" : "zero"}" title="${opinionLabel(n)}">${opinionFace(n)}<b class="bv-mono">${k}</b></span>`;
    })
    .join("")}</div>`;
}

interface Sec {
  id: string;
  icon: string;
  label: string;
  /** The short answer on the right, as on the old sheet. */
  value: string;
  cls?: string;
  body: string;
}

function secHtml(s: Sec): string {
  const open = openSecs.has(s.id);
  return `<section class="rep-sec ${s.cls ?? ""} ${open ? "open" : ""}">
    <button class="rep-sec-h" data-rep="sec" data-v="${s.id}" aria-expanded="${open}" aria-controls="rep-${s.id}">
      ${icon(s.icon)}<span class="l">${s.label}</span><em>${s.value}</em><span class="chev">${icon("down")}</span>
    </button>
    <div class="rep-sec-b" id="rep-${s.id}" ${open ? "" : "hidden"}>${s.body}</div>
  </section>`;
}

/** The bonus a great shift unlocked: what it does, and Buy right here when savings cover it. */
function rewardHtml(c: Closing, save: Save): string {
  const earned = c.unlocked ? bonusById(c.unlocked) : null;
  if (!earned) return "";
  const owns = save.bonuses.includes(earned.id);
  const act = owns
    ? `<small>It's yours. Bring it from Prep &amp; Open, up to three per shift.</small>`
    : save.bank >= earned.price
      ? `<button class="bv-btn primary sm" data-rep="buy" data-v="${earned.id}">${icon("coin")}Buy · ${money(earned.price)}</button>`
      : `<button class="bv-btn sm" data-rep="garage">${money(earned.price)} in the Garage</button>`;
  return `<section class="rep-reward" aria-label="Bonus unlocked">
    <span class="ic">${icon(earned.icon)}</span>
    <span class="t"><small class="bv-eyebrow">Great shift · bonus unlocked</small><b>${esc(earned.name)}</b><span>${esc(earned.text)}</span></span>
    <span class="a">${act}</span>
  </section>`;
}

/** The card's HTML: head, scrolling body (numbers, then the rows), and Continue. */
export function reportHtml(c: Closing, save: Save): string {
  const town = townById(c.town);
  const avg = c.stars.length ? c.stars.reduce((a, b) => a + b, 0) / c.stars.length : 0;
  const newBest = c.takings > 0 && (c.bestBefore === null || c.takings > c.bestBefore);
  const gone = c.lost + c.leftLine;
  const secs: Sec[] = [];
  const orders = ordersShown(c);

  const row = (dt: string, dd: string, cls = "", sub = "") => `<dt class="${cls}">${dt}${sub ? `<small>${sub}</small>` : ""}</dt><dd class="${cls}">${dd}</dd>`;
  secs.push({
    id: "take",
    icon: "receipt",
    label: "Orders",
    value: `${money(orders)}${c.tips ? ` + ${money(c.tips)} tips` : ""}`,
    body: `<div class="day-ledger"><dl>
      ${row("Orders", money(orders), "", `${plural(c.served, "order")}${c.lost ? ` · ${c.lost} walked out` : ""}${c.leftLine ? ` · ${c.leftLine} left the line` : ""}${c.walkedPast ? ` · ${c.walkedPast} walked past the line` : ""}`)}
      ${row("Tips", money(c.tips), "", "for speed")}
      ${c.comped ? row("On the house", `−${money(c.comped)}`, "neg", "sides and extras nobody ordered") : ""}
      ${c.spills ? row("Spilled soda", `−${money(c.spills)}`, "neg") : ""}
      ${row("Takings", money(c.takings), "tot")}
      ${row("Savings", money(save.bank), "", "takings go in; spend them in the Garage")}
    </dl><div class="foot"><span>Best in ${esc(town.name)}</span><b>${newBest ? "New best!" : money(c.bestBefore ?? 0)}</b></div></div>
    ${c.best ? `<span class="day-hint">Best order: ${esc(c.best)}.</span>` : ""}`,
  });

  const today = reviewAverage(addReviews(noReviews(), c.reviews));
  const all = reviewTotal(save.reviewCounts);
  const customers = c.served + c.lost;
  secs.push({
    id: "rev",
    icon: "star",
    label: "Reviews today",
    value: c.reviews.length ? `${today === null ? "" : `${today.toFixed(1)}★ · `}${c.reviews.length} of ${customers}` : "none",
    body: `${c.stars.length ? `<h4 class="day-sub">What customers thought</h4>${opinionsHtml(c.stars)}` : ""}
      ${
        c.reviews.length
          ? `<h4 class="day-sub">Reviews left today</h4>${breakdownHtml(addReviews(noReviews(), c.reviews))}${
              c.rating !== null ? `<span class="day-hint">Rating ${c.ratingBefore === null || c.ratingBefore.toFixed(1) === c.rating.toFixed(1) ? c.rating.toFixed(1) : `${c.ratingBefore.toFixed(1)} → ${c.rating.toFixed(1)}`}.</span>` : ""
            }`
          : `<span class="day-hint">Nobody wrote in today. Most people don't; the delighted and the disappointed are the ones who do.</span>`
      }
      <button class="bv-btn sm" data-rep="reviews">${icon("review")}All ${plural(all, "review")}</button>`,
  });

  const pop = c.pop[1] - c.pop[0];
  secs.push({
    id: "pop",
    icon: "people",
    label: c.press ? "Popularity · a critic came" : "Popularity",
    value: pop === 0 ? `${c.pop[1]}, no change` : `${pop > 0 ? "+" : "−"}${Math.abs(pop)} · ${c.pop[0]} → ${c.pop[1]}`,
    cls: pop > 0 ? "up" : pop < 0 ? "dn" : "",
    body: c.press
      ? pressHtml(c.press)
      : `<span class="day-hint">Popularity ${c.pop[1]}. Happy customers tell their friends; walk-outs tell theirs. Critics turn up more at events and in foodie towns.</span>`,
  });

  const opened = c.opened.map(townById);
  const left = SHIFTS_TO_UNLOCK - c.shiftsHere;
  const roadShort =
    c.outcome === "trip"
      ? "Trip done"
      : opened.length
        ? `<b>${opened.map((t) => esc(t.name)).join(" and ")}</b> open`
        : c.outcome === "failed"
          ? "Not counted"
          : left > 0 && town.roads.length
            ? `${Math.min(c.shiftsHere, SHIFTS_TO_UNLOCK)} of ${SHIFTS_TO_UNLOCK} · ${left} more`
            : town.roads.length
              ? "Roads open"
              : "A side road";
  const roadLong =
    c.outcome === "trip"
      ? "You've reached the end of the road. Every town stays open, so keep touring or start a new trip from the menu."
      : opened.length
        ? `<b>${opened.map((t) => esc(t.name)).join(" and ")}</b> ${opened.length > 1 ? "are" : "is"} open. Tap ${opened.length > 1 ? "one" : "it"} on the map to see the drive.`
        : c.outcome === "failed"
          ? `Serve at least half the customers with a ${PASS_STARS}★ average and the day counts toward the road.`
          : left > 0 && town.roads.length
            ? `Good shift. ${left === 1 ? "One more good shift opens" : `${left} more good shifts open`} the road on.`
            : town.roads.length
              ? "The roads out of here are open."
              : "Nothing further opens from here: it's a side road.";
  secs.push({
    id: "road",
    icon: "road",
    label: "The road",
    value: roadShort,
    cls: opened.length ? "go" : "",
    body: `<div class="day-road"><span class="day-pips">${Array.from({ length: SHIFTS_TO_UNLOCK }, (_, i) => `<i class="${i < c.shiftsHere ? (i === c.shiftsHere - 1 && c.outcome !== "failed" ? "new" : "on") : ""}"></i>`).join("")}</span><span>${roadLong}</span></div>
      ${opened.length ? `<button class="bv-btn sm" data-rep="town" data-v="${opened[0].id}">${icon("map")}See ${esc(opened[0].name)}</button>` : ""}`,
  });

  const tb = townBonus(town.id);
  if (!c.unlocked && tb && !save.found.includes(tb.id) && c.outcome !== "failed")
    secs.push({
      id: "goal",
      icon: "lock",
      label: "Town bonus",
      value: esc(tb.name),
      body: `<span class="day-hint">A great shift here unlocks <b>${esc(tb.name)}</b>: ${GREAT.stars}★ average opinion, ${Math.round(GREAT.served * 100)}% of orders served, at least ${GREAT.min} (or 80% of a smaller crowd).</span>`,
    });

  return `<header class="menu-head bar rep-head">
      <div class="menu-headtext">
        <span class="bv-eyebrow">Closed · Day ${c.day} · ${clockLabel(c.shift.start)}&nbsp;to&nbsp;${clockLabel(c.shift.end)}</span>
        <h2 class="bv-title">${esc(town.name)}</h2>
      </div>
      <button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="Close the report card">${icon("close")}</button>
    </header>
    <div class="menu-body menu-scroll rep-body">
      <p class="rep-verdict">${
        c.stars.length
          ? `<span class="rep-stars" aria-label="${avg.toFixed(1)} stars average">${stars(Math.round(avg))}<span class="bv-mono">${avg.toFixed(1)}</span></span>`
          : ""
      }<span>${verdictLine(c)}</span></p>
      <div class="rep-reward-slot">${rewardHtml(c, save)}</div>
      <div class="day-kpis">
        <div class="day-kpi"><span class="bv-eyebrow">Takings</span><b class="${newBest ? "up" : ""}" data-count="${c.takings}">${money(c.takings)}</b><small>${newBest ? (c.bestBefore === null ? "first here" : "town best") : `best ${money(c.bestBefore ?? 0)}`}</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Rating</span><b>${c.rating === null ? "–" : c.rating.toFixed(1)}</b><small>${ratingDelta(c)}</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Served</span><b>${c.served}</b><small>${gone ? `${gone} left` : "nobody left"}</small></div>
      </div>
      <div class="rep-secs">${secs.map(secHtml).join("")}</div>
    </div>
    <footer class="rep-foot">
      <button class="bv-btn primary lg block" data-rep="continue">${icon("map")}Continue</button>
    </footer>`;
}

/** Takings count up as the card arrives. */
function countUp(root: HTMLElement): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const b of root.querySelectorAll<HTMLElement>("[data-count]")) {
    const to = Number(b.dataset.count);
    const t0 = performance.now();
    const f = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      b.textContent = money(to * (1 - (1 - k) ** 3));
      if (k < 1 && b.isConnected) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
}

export const reportOpen = (): boolean => !!document.querySelector(".menu-card.report-card");

/** Open the report card on `c`. `arrive`: straight after the shift, so the takings count up. */
export function openReport(c: Closing, d: ReportDeps, arrive = false): void {
  if (reportOpen()) return;
  const card = pushModal({
    key: KEY,
    label: `Report card, ${townById(c.town).name}`,
    cls: "report-card",
    html: reportHtml(c, d.save),
    onDismiss: () => d.closed?.(),
  });
  if (arrive) countUp(card);
  // The tap that skipped the pull-back lands just after the card is up: don't let it close the card.
  const shownAt = performance.now();
  card.parentElement!.addEventListener(
    "click",
    (e) => {
      if (performance.now() - shownAt < 400) e.stopImmediatePropagation();
    },
    true,
  );
  /** Close quietly and go elsewhere. */
  const leave = (go: () => void) => {
    popModal(true);
    go();
  };
  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-rep], [data-m]");
    if (!btn) return;
    if (btn.dataset.m === "close") {
      popModal();
      return;
    }
    switch (btn.dataset.rep) {
      case "continue":
        popModal();
        break;
      case "sec": {
        // Open or close in place; nothing else on the card moves but what's under the row.
        const id = btn.dataset.v!;
        const open = !openSecs.has(id);
        if (open) openSecs.add(id);
        else openSecs.delete(id);
        const sec = btn.closest<HTMLElement>(".rep-sec")!;
        sec.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", String(open));
        sec.querySelector<HTMLElement>(".rep-sec-b")!.hidden = !open;
        if (open) {
          const body = card.querySelector<HTMLElement>(".menu-body")!;
          // Bring the opened row's detail into view if it ran off the bottom.
          const over = sec.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
          if (over > 0) body.scrollBy({ top: Math.min(over + 8, sec.offsetTop - body.scrollTop), behavior: "smooth" });
        }
        break;
      }
      case "buy":
        if (d.buy(btn.dataset.v as BonusId)) card.querySelector<HTMLElement>(".rep-reward-slot")!.innerHTML = rewardHtml(c, d.save);
        break;
      case "garage":
        leave(d.garage);
        break;
      case "reviews":
        leave(d.reviews);
        break;
      case "town":
        leave(() => d.town(btn.dataset.v!));
        break;
    }
  });
}
