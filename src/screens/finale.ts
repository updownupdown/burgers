import { LAP, nextTripNo, tripNo, tripStats } from "../game/finale";
import type { Closing, Save } from "../game/progress";
import { bookTotals } from "../game/stamps";
import { townById } from "../game/stops";
import { icon } from "../ui/icons";
import { dollars } from "./garage";
import { esc, popModal, pushModal } from "./modal";
import { truckSvg } from "./truckart";
import "./finale.css";

/**
 * The end of the trip (DESIGN §50). After the last night at Port Amber the evening map shows the
 * trip card instead of the report card: the trip in numbers, every town worked with its best
 * shift, and the truck as it looks now. Drive off plays the truck leaving on the map (home.ts),
 * then the credits, then Keep touring or Start trip 2.
 *
 * Back, × and the scrim never lose the way: on the trip card they skip the drive to the credits;
 * on the credits they mean Keep touring. Reduced motion skips the drive and the credits' roll.
 */

export interface FinaleDeps {
  save: Save;
  /** The night's own report card, over the trip card. */
  report(): void;
  /** Play the truck leaving on the map; `done` comes when it has (at once with reduced motion). */
  driveOff(done: () => void): void;
  /** Start the next trip (already confirmed). */
  newTrip(): void;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function tripCardHtml(save: Save, c: Closing, replay: boolean): string {
  const st = tripStats(save);
  const tot = bookTotals(save);
  const avg = c.stars.length ? c.stars.reduce((a, b) => a + b, 0) / c.stars.length : 0;
  const no = tripNo(save);
  const kpi = (label: string, value: string, sub = "") => `<div class="day-kpi"><span class="bv-eyebrow">${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const row = (ic: string, label: string, value: string) => `<div class="fin-row">${icon(ic)}<span>${label}</span><b>${value}</b></div>`;
  return `<header class="menu-head bar fin-head">
      <div class="menu-headtext">
        <span class="bv-eyebrow">Trip ${no} · Day ${st.days}</span>
        <h2 class="bv-title">The end of the road</h2>
      </div>
      <button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="${replay ? "Close" : "Skip to the credits"}">${icon("close")}</button>
    </header>
    <div class="menu-body menu-scroll fin-body">
      <div class="fin-stage">${truckSvg(save.look, { night: true, cls: "fin-truck" })}</div>
      <p class="fin-verdict">${
        c.served
          ? `${esc(townById(c.town).name)} saw the truck off: ${c.served} served on the last night${c.stars.length ? `, ${avg.toFixed(1)}★` : ""}.`
          : `${esc(townById(c.town).name)} saw the truck off.`
      }</p>
      <div class="day-kpis">
        ${kpi("Days", String(st.days), "on the road")}
        ${kpi("Shifts", String(st.shifts), "worked")}
        ${kpi("Stamps", String(tot.stamps), `of ${tot.slots}`)}
      </div>
      <div class="fin-rows">
        ${st.best ? row("trophy", "Best order", `${esc(st.best.name)} <small>${st.best.score}% · ${esc(townById(st.best.town).name)}</small>`) : ""}
        ${row("person", "Regulars won", `${st.regulars} of ${st.regularsOf}`)}
        ${row("sparkle", "Bonuses found", `${st.bonuses} of ${st.bonusesOf}`)}
        ${row("garage", "Savings", dollars(st.savings))}
      </div>
      <h4 class="day-sub">${icon("map")}Towns on the way</h4>
      <ul class="fin-towns">${st.towns.map((t) => `<li><span>${esc(t.name)}</span><b class="bv-mono">${t.stars !== null ? `${t.stars.toFixed(1)}<i>★</i>` : "–"}</b></li>`).join("")}</ul>
    </div>
    <footer class="rep-foot fin-foot">
      <button class="bv-btn lg" data-fin="report" aria-label="The last night's report card">${icon("receipt")}<span>Report</span></button>
      <button class="bv-btn primary lg" data-fin="${replay ? "close" : "drive"}">${replay ? `${icon("map")}Close` : `${icon("truck")}Drive off`}</button>
    </footer>`;
}

/**
 * Open the trip card. `replay`: brought back from the map's Results later that evening, when it
 * only closes (the drive and the credits played already).
 */
export function openTripCard(c: Closing, d: FinaleDeps, replay: boolean): void {
  if (document.querySelector(".menu-card.fin-card")) return;
  let leaving = false;
  const toCredits = () => {
    if (leaving) return;
    leaving = true;
    d.driveOff(() => openCredits(d));
  };
  const card = pushModal({
    key: "trip",
    label: "The end of the road",
    cls: "fin-card",
    html: tripCardHtml(d.save, c, replay),
    // ×, the scrim and Back skip the drive and go to the credits (or just close on a replay).
    onDismiss: () => {
      if (!replay) openCredits(d);
    },
  });
  // The tap that skipped the pull-back lands just after the card is up: don't let it close the card.
  const shownAt = performance.now();
  card.parentElement!.addEventListener(
    "click",
    (e) => {
      if (performance.now() - shownAt < 400) e.stopImmediatePropagation();
    },
    true,
  );
  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fin], [data-m]");
    if (!btn) return;
    if (btn.dataset.m === "close") {
      popModal();
      return;
    }
    switch (btn.dataset.fin) {
      case "report":
        d.report();
        break;
      case "close":
        popModal();
        break;
      case "drive":
        popModal(true);
        toCredits();
        break;
    }
  });
}

const CREDITS: [string, string][] = [
  ["A game by", "James"],
  ["Built with", "Claude"],
  ["3D", "three.js"],
  ["Type", "Young Serif, Hanken Grotesk and DM Mono, under the SIL Open Font License"],
  ["Tested by", "a lot of very patient bots"],
  ["And", "everyone who waited in line"],
];

export function creditsHtml(save: Save): string {
  const next = nextTripNo(save);
  return `<div class="menu-body fin-credits-body ${reduced() ? "still menu-scroll" : ""}">
      <div class="fin-roll ${reduced() ? "still" : ""}">
        <span class="bv-eyebrow">Bun Voyage</span>
        <h2 class="bv-title">Thanks for driving</h2>
        ${CREDITS.map(([k, v]) => `<p><small>${esc(k)}</small><b>${esc(v)}</b></p>`).join("")}
      </div>
    </div>
    <footer class="fin-choice">
      <button class="bv-btn primary lg block" data-fin="trip2">${icon("flag")}Start trip ${next}</button>
      <p class="fin-note" data-fin-note>Looks, stamps and the postcard book come with you. Savings, bonuses, popularity and reviews start again, at popularity ${LAP.popularity}, with busier towns and stamps in gold.</p>
      <button class="bv-btn block" data-fin="tour">${icon("map")}Keep touring</button>
      <p class="fin-note">Every town stays open. Start the next trip any time from Settings.</p>
    </footer>`;
}

/** The credits, then the choice. Any way of closing it but Start trip is Keep touring. */
export function openCredits(d: FinaleDeps): void {
  if (document.querySelector(".menu-card.fin-credits")) return;
  const card = pushModal({ key: "credits", label: "Credits", cls: "fin-credits", html: creditsHtml(d.save) });
  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fin]");
    if (!btn) return;
    if (btn.dataset.fin === "tour") popModal();
    else if (btn.dataset.fin === "trip2") {
      // A new trip can't be undone: the first tap asks.
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1";
        btn.innerHTML = `${icon("flag")}Tap again to start trip ${nextTripNo(d.save)}`;
        return;
      }
      popModal(true);
      d.newTrip();
    }
  });
}
