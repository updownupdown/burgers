import { BONUSES, GREAT } from "../game/bonus";
import { bonusState, ownsLook, workedIn } from "../game/garage";
import { lookById, LOOKS, onSale, SLOTS, type Slot } from "../game/looks";
import type { Save } from "../game/progress";
import { REGIONS, townById } from "../game/stops";
import { icon } from "../ui/icons";
import { truckSvg } from "./truckart";
import "./garage.css";

/**
 * The Garage, off the map: where savings go. The truck stands on top, wearing whatever is being
 * looked at (day or night). Two tabs under it:
 *
 * - **Bonuses**: one per town, in road order. Locked until a great shift there; then for sale;
 *   then owned and ready to bring from Prep.
 * - **Looks**: paint, awning, roof, lights, wheels, an inflatable and a tag-along. Tap one to try it on; buy it
 *   or wear it from the bar under the truck.
 */

export interface GarageView {
  tab: "bonuses" | "looks";
  slot: Slot;
  /** The look being tried on, if any. */
  preview: string | null;
  night: boolean;
}

export const GARAGE_START: GarageView = { tab: "bonuses", slot: "paint", preview: null, night: false };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function garageHtml(save: Save, v: GarageView): string {
  const preview = v.preview ? lookById(v.preview) : undefined;
  const look = preview ? { ...save.look, [preview.slot]: preview.id } : save.look;
  return `<div class="day-screen bv garage">
    <header class="menu-head bar">
      <span class="menu-head-ic" aria-hidden="true">${icon("garage")}</span>
      <div class="menu-headtext"><h2 class="bv-title">Garage</h2></div>
      <div class="gar-bank"><span class="bv-eyebrow">Savings</span><b class="bv-mono">${dollars(save.bank)}</b></div>
      <button class="bv-btn icon sm ghost menu-x" data-act="back" aria-label="Back to the map">${icon("close")}</button>
    </header>
    <div class="day-scroll">
      <section class="gar-stage ${v.night ? "night" : ""}">
        ${truckSvg(look, { night: v.night, cls: "gar-truck" })}
        <button class="gar-sky bv-btn icon sm" data-act="gar-night" aria-label="${v.night ? "See it by day" : "See it at night"}">${icon(v.night ? "sun" : "moon")}</button>
      </section>
      ${preview ? lookBar(save, preview.id) : ""}
      <div class="bv-seg compact gar-tabs" role="tablist">
        <button data-act="gar-tab" data-v="bonuses" aria-pressed="${v.tab === "bonuses"}">${icon("sparkle")}Bonuses</button>
        <button data-act="gar-tab" data-v="looks" aria-pressed="${v.tab === "looks"}">${icon("truck")}Looks</button>
      </div>
      ${v.tab === "bonuses" ? bonusesHtml(save) : looksHtml(save, v)}
    </div>
  </div>`;
}

function bonusesHtml(save: Save): string {
  const owned = save.bonuses.length;
  let html = `<p class="day-hint">Each town has one bonus. A great shift there (a ${GREAT.stars}★ average, ${Math.round(GREAT.served * 100)}% of orders served) unlocks it; then it's yours to buy. You own ${owned} of ${BONUSES.length}; bring up to three per shift from Prep.</p>`;
  for (const r of REGIONS) {
    const list = BONUSES.filter((b) => townById(b.town).region === r.id);
    html += `<h3 class="prep-h">${esc(r.name)}</h3><div class="gar-list">`;
    for (const b of list) {
      const st = bonusState(save, b.id);
      const town = townById(b.town).name;
      const reach = save.unlocked.includes(b.town);
      const action =
        st === "owned"
          ? `<span class="gar-owned">${icon("check")}Owned</span>`
          : st === "forSale"
            ? `<button class="bv-btn sm ${save.bank >= b.price ? "primary" : ""}" data-act="gar-buy-bonus" data-v="${b.id}" ${save.bank >= b.price ? "" : "disabled"}>${dollars(b.price)}</button>`
            : `<span class="gar-lock">${icon("lock")}${dollars(b.price)}</span>`;
      const where =
        st === "locked" ? (reach ? `Great shift in ${esc(town)} to unlock` : `${esc(town)}, further down the road`) : st === "forSale" ? `Unlocked in ${esc(town)}` : `From ${esc(town)} · ${esc(b.best)}`;
      html += `<div class="gar-item ${st}">
        <span class="ic">${icon(st === "locked" && !reach ? "lock" : b.icon)}</span>
        <span class="t"><b>${st === "locked" && !reach ? "?" : esc(b.name)}</b><small>${st === "locked" && !reach ? "Visit to find out" : esc(b.text)}</small><em>${where}</em></span>
        ${action}
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

function looksHtml(save: Save, v: GarageView): string {
  const worked = workedIn(save);
  const tabs = `<div class="gar-slots" role="tablist">${SLOTS.map((s) => `<button data-act="gar-slot" data-v="${s.id}" aria-pressed="${s.id === v.slot}">${s.name}</button>`).join("")}</div>`;
  const cards = LOOKS.filter((l) => l.slot === v.slot)
    .map((it) => {
      const owned = ownsLook(save, it.id);
      const wearing = save.look[it.slot] === it.id;
      const sale = onSale(it, worked);
      const tag = wearing ? `<span class="gar-tag on">Wearing</span>` : owned ? `<span class="gar-tag">Owned</span>` : !sale ? `<span class="gar-tag">${icon("lock")}Souvenir</span>` : `<span class="gar-tag price">${dollars(it.price)}</span>`;
      const thumb = truckSvg({ ...save.look, [it.slot]: it.id }, { crop: true, cls: "gar-thumb", night: v.night || it.slot === "lights" });
      return `<button class="gar-look ${it.grand ? "grand" : ""} ${wearing ? "wearing" : ""}" data-act="gar-try" data-v="${it.id}" aria-pressed="${v.preview === it.id}">
        ${thumb}<b>${esc(it.name)}</b>${tag}</button>`;
    })
    .join("");
  return `${tabs}<div class="gar-looks">${cards}</div>
    <p class="day-hint">Looks change nothing in the cooking. They show on the road map, at night, here, and around the kitchen window.</p>`;
}

/** Under the truck, for the look being tried on: what it is, and buy or wear. */
function lookBar(save: Save, id: string): string {
  const it = lookById(id)!;
  const owned = ownsLook(save, id);
  const wearing = save.look[it.slot] === id;
  const sale = onSale(it, workedIn(save));
  let action: string;
  if (wearing) action = `<span class="gar-owned">${icon("check")}Wearing</span>`;
  else if (owned) action = `<button class="bv-btn primary" data-act="gar-wear" data-v="${id}">Wear it</button>`;
  else if (!sale) action = `<span class="gar-lock">${icon("lock")}Sold in ${esc(townById(it.town!).name)}</span>`;
  else if (save.bank >= it.price) action = `<button class="bv-btn primary" data-act="gar-buy-look" data-v="${id}">${icon("coin")}Buy · ${dollars(it.price)}</button>`;
  else action = `<span class="gar-lock">${dollars(it.price - save.bank)} to go</span>`;
  return `<div class="gar-bar"><span class="t"><b>${esc(it.name)}${it.grand ? ` <em>Grand</em>` : ""}</b><small>${esc(it.text)}</small></span>${action}</div>`;
}
