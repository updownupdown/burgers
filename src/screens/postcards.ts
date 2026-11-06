import { CROWD } from "../game/business";
import type { Save } from "../game/progress";
import { regularName } from "../game/regulars";
import { bookDishes, bookTotals, DISH_FIVES, STAMPS, stampSlots, type StampId, type StampTier } from "../game/stamps";
import { signatureOf } from "../game/identity";
import { REGIONS, STOPS } from "../game/stops";
import { icon } from "../ui/icons";
import { esc, modalHead, popModal, pushModal } from "./modal";
import "./postcards.css";

/**
 * The postcard book (DESIGN §50): one postcard per town with its stamps, then a row per dish for
 * serving it at five stars five times. Reached from the map's header and from a town's sheet;
 * everything in it is read from the save. Back, ×, the scrim or Escape close it.
 */

const KEY = "postcards";

/** One stamp: earned (gold from a later trip) or an empty dotted slot. */
export function stampHtml(id: StampId, tier: StampTier | 0, small = false): string {
  const d = STAMPS.find((s) => s.id === id)!;
  const cls = tier === 2 ? "gold" : tier === 1 ? "on" : "off";
  const what = tier === 2 ? `${d.label}, gold` : tier === 1 ? d.label : `${d.label}: not yet`;
  return `<span class="pc-stamp ${cls} ${small ? "sm" : ""}" title="${esc(d.how)}" aria-label="${esc(what)}">${icon(d.icon)}${small ? "" : `<small>${esc(d.label)}</small>`}</span>`;
}

/** A town's row of stamps, earned first in the book's order, empties after. */
export function townStamps(save: Pick<Save, "stamps">, town: string, small = false): string {
  const page = save.stamps?.[town] ?? {};
  return stampSlots(town)
    .map((id) => stampHtml(id, page[id] ?? 0, small))
    .join("");
}

function postcardHtml(save: Save, id: string): string {
  const t = STOPS.find((s) => s.id === id)!;
  const page = save.stamps?.[id] ?? {};
  const got = stampSlots(id).filter((s) => page[s]).length;
  const reached = save.unlocked.includes(id) || got > 0;
  const best = save.best[id];
  const sig = signatureOf(id);
  return `<article class="pc-card ${reached ? "" : "far"}" id="pc-${id}" data-town="${id}">
    <div class="pc-top">
      <div class="pc-name"><b>${esc(t.name)}</b><small>${reached ? `${esc(CROWD[t.crowd].label)}${sig ? ` · known for ${esc(sig)}` : ""}` : "Not reached yet"}</small></div>
      <span class="pc-count bv-mono">${got}/${stampSlots(id).length}</span>
    </div>
    <div class="pc-stamps">${townStamps(save, id)}</div>
    ${reached ? `<div class="pc-foot"><span>${icon("star")}Best ${best !== undefined ? `${best.toFixed(1)}★` : "–"}</span><span>${icon("person")}${esc(regularName(id))}</span></div>` : ""}
  </article>`;
}

function dishesHtml(save: Save): string {
  return `<ul class="pc-dishes">${bookDishes()
    .map((r) => {
      const n = Math.min(DISH_FIVES, save.fives?.[r.name] ?? 0);
      const done = n >= DISH_FIVES;
      return `<li class="${done ? "done" : ""}"><span class="nm">${esc(r.name)}</span><span class="dots" aria-label="${n} of ${DISH_FIVES} at five stars">${Array.from({ length: DISH_FIVES }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span><span class="ck">${done ? icon("check") : ""}</span></li>`;
    })
    .join("")}</ul>`;
}

export function bookHtml(save: Save): string {
  const tot = bookTotals(save);
  const lap = (save.tripNo ?? 1) >= 2;
  return `${modalHead({ icon: "menu-book", title: "Postcard book", stacked: false })}
    <div class="menu-body menu-scroll pc-body">
      <p class="pc-sum"><b class="bv-mono">${tot.stamps}</b> of ${tot.slots} stamps${tot.gold ? ` · <b class="bv-mono">${tot.gold}</b> gold` : ""} · <b class="bv-mono">${tot.dishes}</b> of ${tot.dishSlots} dishes</p>
      <div class="pc-legend">${STAMPS.map((s) => `<span>${stampHtml(s.id, 1, true)}<span>${esc(s.how)}.</span></span>`).join("")}
        <span class="pc-gold-note">${stampHtml("five", 2, true)}<span>${lap ? "This trip, stamps come in gold." : "On a second trip, stamps come in gold."} Towns with an event have five stamps; the others four.</span></span>
      </div>
      ${REGIONS.map(
        (r) => `<section class="pc-region" aria-label="${esc(r.name)}"><h3 class="day-sub">${esc(r.name)}</h3>
          <div class="pc-grid">${STOPS.filter((t) => t.region === r.id)
            .map((t) => postcardHtml(save, t.id))
            .join("")}</div></section>`,
      ).join("")}
      <section class="pc-region" aria-label="Dishes"><h3 class="day-sub">${icon("star")}Dishes at five stars</h3>
        <p class="day-hint">Serve a dish at five stars ${DISH_FIVES} times to tick it off.</p>
        ${dishesHtml(save)}
      </section>
    </div>`;
}

export const bookOpen = (): boolean => !!document.querySelector(".menu-card.pc-book");

/** Open the book, at a town's postcard if one is given. */
export function openBook(save: Save, town?: string | null): void {
  if (bookOpen()) return;
  const card = pushModal({ key: KEY, label: "Postcard book", cls: "pc-book", html: bookHtml(save) });
  card.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-m=close]")) popModal();
  });
  if (town) {
    const body = card.querySelector<HTMLElement>(".menu-body");
    const at = card.querySelector<HTMLElement>(`#pc-${town}`);
    if (body && at) {
      body.scrollTop = Math.max(0, at.offsetTop - 8);
      at.classList.add("here");
    }
  }
}
