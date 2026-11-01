/**
 * The menu: every burger on the road, how each one is built, and what the sides, drinks and
 * extras cost. The current town's dishes come first; the other towns' follow, with a line on
 * what opens each locked one. Opens from the map's dock and from the pause menu.
 */
import * as gameMenu from "../game/menu";
import { ADD_PRICE, DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "../game/menu";
import { fountainFor, fryerOf, recipeCount, STOPS, townById, type Recipe, type Stop } from "../game/stops";
import { openedBy, SHIFTS_TO_UNLOCK, unlockProgress } from "../game/travel";
import { BREADS, COUNTED, DRINK_COLOR, PRESS_CHEESE, DRINK_LABEL, FRIES_PORTION, FRIES_SCOOP, KIND_COLOR, KIND_LABEL, SIZE_LABEL, type Kind, type Size } from "../game/types";
import { icon } from "../ui/icons";
import { openHowTo } from "./howto";
import { esc, getDeps, modalDepth, modalHead, modalOpen, price, pushModal, popModal, wireJumpChips } from "./modal";

const SIZES: Size[] = ["S", "M", "L"];

const cup = (s: Size) => {
  const h = { S: 14, M: 18, L: 22 }[s];
  return `<svg viewBox="0 0 16 ${h + 3}" style="height:${h + 3}px" aria-hidden="true"><path d="M1.5 2.5h13l-1.6 ${h}H3.1z"/><path d="M0.8 2.5h14.4" class="rim"/></svg>`;
};

/** The burger drawn as a little stack, top bun first, so a recipe reads at a glance. */
export function stackArt(r: Recipe): string {
  const n = r.layers.length;
  const parts = r.layers.map((k, i) => {
    const c = `--c:${KIND_COLOR[k]}`;
    if (k === "bun") return `<i class="ms bun ${i === n - 1 ? "top" : "bot"} ${r.toasted ? "toast" : ""}" style="${c}"></i>`;
    if (k === "patty") return `<i class="ms patty ${r.smash ? "smash" : ""}" style="${c}"></i>`;
    // Panini bread, pressed golden with dark press lines.
    if (BREADS.has(k)) return `<i class="ms bread ${k} ${i === 0 ? "bot" : "top"}" style="${c}"></i>`;
    if (COUNTED.has(k)) {
      const count = Math.min(5, recipeCount(r, k));
      const melt = r.panini && !r.open && PRESS_CHEESE.has(k);
      return `<i class="ms pieces ${k} ${melt ? "melt" : ""}" style="${c}">${"<b></b>".repeat(count)}</i>`;
    }
    const melted = (k === "cheese" && r.melt && r.layers[i - 1] === "patty") || (r.panini && !r.open && PRESS_CHEESE.has(k));
    return `<i class="ms ${k} ${melted ? "melt" : ""}" style="${c}"></i>`;
  });
  return `<div class="mref-stack" aria-hidden="true">${parts.reverse().join("")}</div>`;
}

export function layerLabel(r: Recipe, k: Kind): string {
  const base = KIND_LABEL[k];
  if (COUNTED.has(k)) return `${base} <b class="bv-mono">×${recipeCount(r, k)}</b>`;
  return base;
}

export function recipeHtml(r: Recipe, mult: number, special: boolean, locked = false): string {
  const tags: string[] = [];
  if (special) tags.push(`<span class="bv-chip pill add">${icon("sparkle")}Event special</span>`);
  if (r.panini) {
    tags.push(`<span class="bv-chip pill">${icon("panini")}${r.open ? "Bread pressed, open-faced" : "Pressed"}</span>`);
    if (r.layers.some((k) => k === "chicken" || k === "veggie")) tags.push(`<span class="bv-chip pill">${icon("press")}${r.layers.includes("chicken") ? "Chicken" : "Patty"} pressed first</span>`);
    if (r.open && r.layers.includes("avocado")) tags.push(`<span class="bv-chip pill">${icon("avocado")}Avocado cold</span>`);
  } else if (r.dish === "quesadilla") tags.push(`<span class="bv-chip pill">${icon("toast")}Folded, flipped once</span>`);
  else if (r.dish === "tacos") tags.push(`<span class="bv-chip pill">${icon("toast")}Warm tortillas</span>`);
  else if (r.dish === "tostada") tags.push(`<span class="bv-chip pill">${icon("flame")}Fried shell</span>`);
  else if (r.toasted) tags.push(`<span class="bv-chip pill">${icon("toast")}Toasted bun</span>`);
  if (r.smash) tags.push(`<span class="bv-chip pill">${icon("smash")}Smashed, well done</span>`);
  if (r.melt) tags.push(`<span class="bv-chip pill">${icon("cheese")}Melted cheese</span>`);
  if (r.layers.includes("pineapple")) tags.push(`<span class="bv-chip pill">${icon("flame")}${r.dish ? "Charred" : "Grilled"} pineapple</span>`);
  if (r.egg === "over") tags.push(`<span class="bv-chip pill">${icon("flame")}Egg over easy</span>`);
  const flow = r.layers.map((k) => `<li><i class="swc" style="--c:${KIND_COLOR[k]}"></i><span>${layerLabel(r, k)}</span></li>`).join("");
  return `<article class="mref-item ${locked ? "locked" : ""}">
    ${stackArt(r)}
    <div class="mref-main">
      <div class="mref-top"><h4 class="mref-name">${esc(r.name)}</h4><span class="mref-price bv-mono">${price(Math.round(r.price * mult))}</span></div>
      <div class="mref-tags">${tags.join("")}</div>
      <p class="mref-caption">Bottom to top</p>
      <ol class="mref-flow">${flow}</ol>
    </div>
  </article>`;
}

/** Poutine is on the menu when the game says so (deps), or when the menu module prices it. */
function poutinePrice(): number | null {
  const d = getDeps();
  if (d?.poutine) return d.poutine();
  const p = (gameMenu as unknown as Record<string, unknown>).POUTINE_PRICE;
  return typeof p === "number" ? p : null;
}

/** Where the road stands, for the dishes served elsewhere. */
export interface RoadProgress {
  unlocked: string[];
  shiftsIn: Record<string, number>;
}

/** The other towns' burgers, grouped by town, each with whether its road is open and what opens it. */
function elsewhereHtml(town: Stop, seen: Set<string>, prog: RoadProgress | null): string {
  const groups: string[] = [];
  for (const t of STOPS) {
    if (t.id === town.id) continue;
    const dishes = t.menu.filter((r) => !seen.has(r.name));
    if (!dishes.length) continue;
    for (const r of dishes) seen.add(r.name);
    const open = !prog || prog.unlocked.includes(t.id);
    let gate = "";
    if (!open && prog) {
      const gates = openedBy(t.id).map((g) => ({ t: townById(g), ...unlockProgress(prog.shiftsIn, g) }));
      const near = gates.filter((g) => prog.unlocked.includes(g.t.id));
      const list = (near.length ? near : gates).map((g) => `${esc(g.t.name)} (${g.done}/${g.need})`).join(" or ");
      gate = list ? `Opens after ${SHIFTS_TO_UNLOCK} passed shifts in ${list}` : "Opens later on the trip";
    }
    groups.push(`<div class="mref-town ${open ? "" : "locked"}">
      <div class="mref-townhead">${icon(open ? "road" : "lock")}<b>${esc(t.name)}</b><span>${open ? (prog && prog.shiftsIn[t.id] ? `${prog.shiftsIn[t.id]} shift${prog.shiftsIn[t.id] === 1 ? "" : "s"} there` : "Road open") : gate}</span></div>
      ${dishes.map((r) => recipeHtml(r, 1, false, !open)).join("")}
    </div>`);
  }
  if (!groups.length) return "";
  return `<section class="mref-sec" data-sec="road">
    <h3 class="menu-h">${icon("map")}Down the road <span>${groups.length} towns</span></h3>
    <p class="mref-note">Every town has its own burgers. Greyed dishes are served in towns whose road hasn't opened yet.</p>
    ${groups.join("")}
  </section>`;
}

export function menuRefHtml(town: Stop, mult = 1, prog: RoadProgress | null = null): string {
  const base = new Set(townById(town.id).menu.map((r) => r.name));
  const press = !!town.press;
  const comal = !!town.comal;
  const fryer = fryerOf(town);
  const main = press ? "Paninis" : comal ? "Tacos" : "Burgers";
  const mainIcon = press ? "panini" : "burger";
  const scoops = (s: Size) => Math.round(FRIES_PORTION[s] / FRIES_SCOOP);
  const poutine = poutinePrice();
  const counted = [...COUNTED].map((k) => KIND_LABEL[k].toLowerCase());
  const countedText = `${counted.slice(0, -1).join(", ")} or ${counted[counted.length - 1]}`;
  const fries = SIZES.map(
    (s) => `<tr><td><span class="bv-chip size">${s}</span> ${SIZE_LABEL[s]} fries</td><td class="mref-scoops" aria-label="${scoops(s)} scoops">${'<i></i>'.repeat(scoops(s))}<span>${scoops(s)} scoop${scoops(s) > 1 ? "s" : ""}</span></td><td class="num">${price(FRIES_PRICE[s])}</td></tr>`,
  ).join("");
  return `
  <nav class="menu-chips" aria-label="Sections">
    <button class="bv-chip pill" data-jump="burgers">${icon(mainIcon)}${main}</button>
    <button class="bv-chip pill" data-jump="road">${icon("map")}Down the road</button>
    <button class="bv-chip pill" data-jump="sides">${icon("fries")}Sides</button>
    <button class="bv-chip pill" data-jump="drinks">${icon("drink")}Drinks</button>
    <button class="bv-chip pill" data-jump="extras">${icon("plus")}Extras</button>
  </nav>
  ${mult !== 1 ? `<p class="bv-callout mref-biz">${icon("tag")}<span>Your prices: today's are ${mult > 1 ? "raised" : "lowered"} (×${mult.toFixed(2).replace(/0$/, "")}).</span></p>` : ""}
  <section class="mref-sec" data-sec="burgers">
    <h3 class="menu-h">${icon(mainIcon)}${main} in ${esc(town.name)} <span>${town.menu.length}</span></h3>
    <p class="mref-note">${press ? `Every panini is pressed golden, the cheese melted inside.${town.press?.slice ? " Here they go out cut in half." : ""}` : comal ? `Tortillas are warmed on the comal until soft and spotted; a quesadilla is folded and flipped once, its cheese melted.${town.comal?.tpress ? " Hand-pressed tortillas earn a tip." : ""}` : "Every patty goes out medium. Nobody asks for rare or well done."}</p>
    ${town.menu.map((r) => recipeHtml(r, mult, !base.has(r.name))).join("")}
  </section>
  ${elsewhereHtml(town, new Set(town.menu.map((r) => r.name)), prog)}
  <section class="mref-sec" data-sec="sides">
    <h3 class="menu-h">${icon("fries")}Sides</h3>
    <table class="bv-table mref-table">
      <thead><tr><th>${fryer.includes("chips") ? "Chips & salsa" : "Fries"}</th><th>Scoops</th><th class="num">Price</th></tr></thead>
      <tbody>${fryer.includes("chips") ? fries.replace(/ fries</g, " chips<") : fries}
      ${fryer.includes("churros") ? `<tr class="mref-poutine"><td colspan="2"><b>Churros</b><small>Same sizes and prices; sugar on top</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${fryer.includes("sweet") ? `<tr class="mref-poutine"><td colspan="2"><b>Sweet potato fries</b><small>Same sizes and prices; they cook faster</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${poutine != null && town.poutine ? (fryer.includes("chips") ? `<tr class="mref-poutine"><td colspan="2"><b>Nachos</b><small>Chips, jalapeños, queso</small></td><td class="num">${price(poutine)}</td></tr>` : `<tr class="mref-poutine"><td colspan="2"><b>Poutine</b><small>Fries, cheese curds, gravy</small></td><td class="num">${price(poutine)}</td></tr>`) : ""}
      </tbody>
    </table>
    <p class="mref-note">Salted unless you skip it. Cartons come from the stacks by the fryer.</p>
  </section>
  <section class="mref-sec" data-sec="drinks">
    <h3 class="menu-h">${icon("drink")}Drinks</h3>
    <ul class="mref-flavours">${fountainFor(town.region).map((d) => `<li><i class="swc" style="--c:${DRINK_COLOR[d]}"></i>${DRINK_LABEL[d]}</li>`).join("")}</ul>
    <table class="bv-table mref-table">
      <thead><tr><th>Size</th><th></th><th class="num">Price</th></tr></thead>
      <tbody>${SIZES.map((s) => `<tr><td><span class="bv-chip size">${s}</span> ${SIZE_LABEL[s]}</td><td class="mref-cup">${cup(s)}</td><td class="num">${price(DRINK_PRICE[s])}</td></tr>`).join("")}</tbody>
    </table>
    <p class="mref-note">Every drink gets ice (unless they say “No ice”) and a lid.</p>
  </section>
  <section class="mref-sec" data-sec="extras">
    <h3 class="menu-h">${icon("plus")}Extras</h3>
    <dl class="bv-stats mref-extras">
      <dt>Extra ${esc(countedText)}</dt><dd>+${price(EXTRA_PRICE)}</dd>
      <dt>Add or double cheese, bacon, egg, lettuce or pineapple</dt><dd>+${price(ADD_PRICE)}</dd>
      <dt>Leave something off</dt><dd>±$0</dd>
    </dl>
    <div class="bv-callout mref-tip">${icon("pickle")}<span>Toppings go on one piece at a time. A piece or two fewer saves money but can cost you a review; one or two extra can win a better one.</span></div>
    <button class="bv-btn sm ghost mref-howto" data-m="howto-toppings">${icon("help")}How toppings work</button>
  </section>`;
}

/**
 * Open the menu for a town. With no town it uses the game's current one (main.ts's deps),
 * which in a shift is the town as played today: event specials and the day's picks included.
 */
export function openMenuRef(town?: Stop, opts: { priceMult?: number } = {}): void {
  const d = getDeps();
  const t = town ?? d?.town();
  if (!t) return;
  const mult = opts.priceMult ?? 1;
  const stacked = modalDepth() > 0;
  const prog = d?.progress?.() ?? null;
  const card = pushModal({
    key: "menuref",
    label: `Menu, ${t.name}`,
    cls: "mref",
    html: `${modalHead({ icon: "menu-book", title: `Menu · ${t.name}`, stacked, eyebrow: "Menu" })}
      <div class="menu-body menu-scroll">${menuRefHtml(t, mult, prog)}</div>`,
  });
  const body = card.querySelector<HTMLElement>(".menu-body")!;
  wireJumpChips(body);
  card.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-m]")?.dataset.m;
    if (act === "close") popModal();
    else if (act === "howto-toppings") {
      if (modalOpen("howto")) popModal();
      else openHowTo("toppings");
    }
  });
}
