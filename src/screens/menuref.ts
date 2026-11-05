/**
 * The menu: every burger on the road, how each one is built, and what the sides, drinks and
 * extras cost. The current town's dishes come first; the other towns' follow, with a line on
 * what opens each locked one. Opens from the map's dock and from the pause menu.
 */
import * as gameMenu from "../game/menu";
import { ADD_PRICE, DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "../game/menu";
import { fountainFor, fryerOf, recipeCount, STOPS, townById, type Recipe, type Stop } from "../game/stops";
import { openedBy, SHIFTS_TO_UNLOCK, unlockProgress } from "../game/travel";
import { AFTER_OVEN, BREADS, COUNTED, DRINK_COLOR, PRESS_CHEESE, DRINK_LABEL, FRIES_PORTION, FRIES_SCOOP, KIND_COLOR, KIND_LABEL, SIZE_LABEL, TORTILLAS, type FryKind, type Kind, type Size } from "../game/types";
import { icon } from "../ui/icons";
import { openHowTo } from "./howto";
export { buildLine, methodTags, sidesLine } from "./dishtext";
import { esc, getDeps, modalDepth, modalHead, modalOpen, price, pushModal, popModal, wireJumpChips } from "./modal";

const SIZES: Size[] = ["S", "M", "L"];

const cup = (s: Size) => {
  const h = { S: 14, M: 18, L: 22 }[s];
  return `<svg viewBox="0 0 16 ${h + 3}" style="height:${h + 3}px" aria-hidden="true"><path d="M1.5 2.5h13l-1.6 ${h}H3.1z"/><path d="M0.8 2.5h14.4" class="rim"/></svg>`;
};

/**
 * Orchard Isle's flatbreads drawn from above: a golden oval (a calzone's half moon), its sauce, a
 * scatter of each topping and, for what goes on after the oven, leaves or a honey drizzle.
 */
export function pieArt(r: Recipe): string {
  const calzone = r.pie === "calzone";
  if (calzone)
    return `<div class="mref-stack pie" aria-hidden="true"><svg viewBox="0 0 64 44" width="100%"><path d="M6 30a26 22 0 0 1 52 0z" fill="#e3ad5a" stroke="#2a2622" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 30h48" stroke="#2a2622" stroke-width="1.6" stroke-linecap="round"/><g fill="#c47a3a">${[14, 22, 30, 38, 46].map((x) => `<circle cx="${x + 2}" cy="${29 - Math.sin(((x - 6) / 52) * Math.PI) * 2}" r="1.6"/>`).join("")}</g><path d="M26 16l4 3M34 16l4 3" stroke="#7a4a22" stroke-width="1.6" stroke-linecap="round"/></svg></div>`;
  const sauce = r.layers.includes("redsauce") ? "#c8402a" : r.layers.includes("oil") ? "#efe1a0" : null;
  const bits: string[] = [];
  let k = 0;
  for (const kind of r.layers) {
    if (kind === "dough" || kind === "redsauce" || kind === "oil") continue;
    if (kind === "honey") {
      bits.push(`<path d="M18 18l7 9 6-10 7 11 7-9" fill="none" stroke="#e9a92a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
      continue;
    }
    const n = COUNTED.has(kind) ? Math.min(6, recipeCount(r, kind)) : 3;
    const leaf = kind === "basil" || kind === "rocket";
    for (let i = 0; i < n; i++, k++) {
      const a = k * 2.4;
      const rr = 0.35 + 0.55 * (((k * 0.618) % 1) * 0.8 + 0.1);
      const x = (32 + Math.cos(a) * rr * 19).toFixed(1);
      const y = (22 + Math.sin(a) * rr * 13).toFixed(1);
      bits.push(leaf ? `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.7" transform="rotate(${(a * 57) % 180} ${x} ${y})" fill="${KIND_COLOR[kind]}" stroke="#2a2622" stroke-width=".8"/>` : `<circle cx="${x}" cy="${y}" r="${kind === "mozzarella" ? 3.4 : 2.4}" fill="${KIND_COLOR[kind]}" stroke="#2a2622" stroke-width=".8"/>`);
    }
  }
  return `<div class="mref-stack pie" aria-hidden="true"><svg viewBox="0 0 64 44" width="100%"><ellipse cx="32" cy="22" rx="29" ry="20" fill="#e3ad5a" stroke="#2a2622" stroke-width="1.6"/><ellipse cx="32" cy="22" rx="24" ry="16" fill="${sauce ?? "#f1dcaa"}"/>${bits.join("")}</svg></div>`;
}

/**
 * Red Rock's dishes drawn as the food: tacos standing in the rack seen from the front, a
 * quesadilla's folded half moon, a tostada's flat shell piled up, each with its fillings' colours.
 */
export function dishArt(r: Recipe): string {
  const fill = r.layers.filter((k) => !TORTILLAS.has(k) && k !== "tostada");
  const ink = `stroke="#2a2622" stroke-width="1.6" stroke-linejoin="round"`;
  const wrap = (body: string) => `<div class="mref-stack pie" aria-hidden="true"><svg viewBox="0 0 64 44" width="100%">${body}</svg></div>`;
  const shell = r.layers.includes("flour") ? "#efdcae" : "#f0cf6a";
  if (r.dish === "quesadilla") {
    const cheese = fill.find((k) => k === "jack" || k === "cheese") ?? "jack";
    return wrap(
      `<path d="M6 32a26 24 0 0 1 52 0z" fill="${shell}" ${ink}/><path d="M10 32c4-3 8 1 12-2s8 2 12-1 8 2 12-1 6 2 8 1" fill="none" stroke="${KIND_COLOR[cheese]}" stroke-width="2.4" stroke-linecap="round"/><path d="M8 32h48" stroke="#2a2622" stroke-width="1.6" stroke-linecap="round"/><g fill="#c4893a" opacity=".7"><circle cx="24" cy="20" r="1.6"/><circle cx="36" cy="16" r="1.4"/><circle cx="42" cy="24" r="1.5"/></g>`,
    );
  }
  if (r.dish === "tostada") {
    const dots = fill
      .flatMap((k, j) => [0, 1, 2].map((i) => `<circle cx="${(16 + ((i * 13 + j * 7) % 32)).toFixed(1)}" cy="${(18 + ((i * 5 + j * 3) % 8)).toFixed(1)}" r="${k === "beans" ? 3.2 : 2.3}" fill="${KIND_COLOR[k]}" stroke="#2a2622" stroke-width=".8"/>`))
      .join("");
    return wrap(`<ellipse cx="32" cy="24" rx="28" ry="12" fill="${shell}" ${ink}/><ellipse cx="32" cy="22" rx="22" ry="8" fill="${KIND_COLOR.beans ?? "#7a4a2a"}" opacity=".55"/>${dots}`);
  }
  // Tacos: up to three folded tortillas standing side by side, filling showing at the top.
  const tort = r.layers.find((k) => TORTILLAS.has(k));
  const n = Math.max(1, Math.min(3, tort ? recipeCount(r, tort) : 2));
  const w = 18;
  const x0 = 32 - (n * w + (n - 1) * 2) / 2;
  const tacos = Array.from({ length: n }, (_, i) => {
    const x = x0 + i * (w + 2);
    const bits = fill
      .slice(0, 4)
      .map((k, j) => `<circle cx="${(x + 4 + j * 3.4).toFixed(1)}" cy="${(19 - (j % 2) * 2).toFixed(1)}" r="2.3" fill="${KIND_COLOR[k]}" stroke="#2a2622" stroke-width=".7"/>`)
      .join("");
    return `${bits}<path d="M${x} 20a${w / 2} ${w / 2 + 2} 0 0 0 ${w} 0z" fill="${shell}" ${ink}/>`;
  }).join("");
  return wrap(`<path d="M4 36h56" stroke="#9aa0a0" stroke-width="3" stroke-linecap="round"/>${tacos}`);
}

const INK = `stroke="#2a2622" stroke-width="1.6" stroke-linejoin="round"`;

/** One fountain cup, lidded with a straw, the liquid in today's first drink's colour (the pause card's Drinks). */
export function cupArt(liquid: string): string {
  return `<div class="mref-side" aria-hidden="true"><svg viewBox="0 0 48 56" width="100%">
    <path d="M30 4l-4 14" stroke="#d8573a" stroke-width="3" stroke-linecap="round"/>
    <path d="M12.6 26h22.8l-2 24H14.6z" fill="${liquid}"/>
    <rect x="17" y="30" width="6" height="6" rx="1.2" fill="#eef7fa" stroke="#9cc7d6" stroke-width=".8"/><rect x="24" y="33" width="6" height="6" rx="1.2" fill="#eef7fa" stroke="#9cc7d6" stroke-width=".8"/>
    <path d="M11 18h26l-3 33H14z" fill="rgb(255 255 255 / .25)" ${INK}/>
    <path d="M9 18h30v-2.6c-5-4-25-4-30 0z" fill="#f6f2ea" ${INK}/>
  </svg></div>`;
}

/** One fryer carton of the town's usual side: sticks for fries, triangles for chips, rounds for fritters. */
export function cartonArt(kind: FryKind): string {
  const fill = { fries: "#f0c95a", sweet: "#e8893a", chips: "#f0cf6a", churros: "#c98a3e", zucchini: "#d9c46a", fritters: "#d79a48" }[kind];
  const ink = `stroke="#2a2622" stroke-width="1.1" stroke-linejoin="round"`;
  const top =
    kind === "chips"
      ? [10, 18, 26, 34].map((x, i) => `<path d="M${x} ${20 - (i % 2) * 3}l6 -10 6 10z" fill="${fill}" ${ink}/>`).join("")
      : kind === "fritters" || kind === "zucchini"
        ? [14, 24, 34, 19, 29].map((x, i) => `<circle cx="${x}" cy="${i < 3 ? 17 : 11}" r="5" fill="${fill}" ${ink}/>`).join("")
        : [12, 17, 22, 27, 32].map((x, i) => `<rect x="${x}" y="${4 + (i % 2) * 4}" width="4" height="18" rx="1.2" fill="${fill}" ${ink}/>`).join("");
  return `<div class="mref-side" aria-hidden="true"><svg viewBox="0 0 48 56" width="100%">${top}
    <path d="M8 18h32l-4 33H12z" fill="#d8573a" ${INK}/><path d="M15 26c3 3 15 3 18 0" fill="none" stroke="#f6f2ea" stroke-width="1.6" stroke-linecap="round"/>
  </svg></div>`;
}

/** The burger drawn as a little stack, top bun first, so a recipe reads at a glance. */
export function stackArt(r: Recipe): string {
  if (r.pie) return pieArt(r);
  if (r.dish) return dishArt(r);
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
  if (COUNTED.has(k) && recipeCount(r, k) > 1) return `${base} <b class="bv-mono">×${recipeCount(r, k)}</b>`;
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
  else if (r.pie === "calzone") tags.push(`<span class="bv-chip pill">${icon("flame")}Folded, baked</span>`);
  else if (r.pie) tags.push(`<span class="bv-chip pill">${icon("flame")}Baked in the oven</span>`);
  else if (r.toasted) tags.push(`<span class="bv-chip pill">${icon("toast")}Toasted bun</span>`);
  if (r.smash) tags.push(`<span class="bv-chip pill">${icon("smash")}Smashed thin</span>`);
  if (r.melt) tags.push(`<span class="bv-chip pill">${icon("cheese")}Melted cheese</span>`);
  const after = r.pie ? r.layers.filter((k) => AFTER_OVEN.has(k)) : [];
  if (after.length) tags.push(`<span class="bv-chip pill">${icon("sparkle")}${after.map((k) => KIND_LABEL[k]).join(", ")} after the oven</span>`);
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
    <p class="mref-note">Every town has its own dishes. Greyed ones are served in towns whose road hasn't opened yet.</p>
    ${groups.join("")}
  </section>`;
}

/** "a, b or c", lower case, for the Extras lines. */
const listOf = (kinds: Kind[]): string => {
  const w = kinds.map((k) => KIND_LABEL[k].toLowerCase());
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} or ${w[w.length - 1]}` : (w[0] ?? "");
};

/** Each kind of dish has its own icon: burgers, paninis, tacos, flatbreads. */
export function dishIcon(town: Pick<Stop, "press" | "comal" | "oven">): string {
  return town.press ? "panini" : town.comal ? "taco" : town.oven ? "flatbread" : "burger";
}

export function menuRefHtml(town: Stop, mult = 1, prog: RoadProgress | null = null): string {
  const base = new Set(townById(town.id).menu.map((r) => r.name));
  const press = !!town.press;
  const comal = !!town.comal;
  const oven = !!town.oven;
  const fryer = fryerOf(town);
  const main = press ? "Paninis" : comal ? "Tacos" : oven ? "Flatbreads" : "Burgers";
  const mainIcon = dishIcon(town);
  const scoops = (s: Size) => Math.round(FRIES_PORTION[s] / FRIES_SCOOP);
  const poutine = poutinePrice();
  const extras = gameMenu.extrasOn(town);
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
  <section class="mref-sec" data-sec="burgers">
    <h3 class="menu-h">${icon(mainIcon)}${main} in ${esc(town.name)} <span>${town.menu.length}</span></h3>
    <p class="mref-note">${press ? `Every panini is pressed golden, the cheese melted inside.${town.press?.slice ? " Cut in half on the board, they tip a little more." : ""}` : comal ? `Tortillas are warmed on the comal until soft and spotted, and tacos are filled in the rack on its warm end; a quesadilla is folded and flipped once, its cheese melted.${town.comal?.tpress ? " Hand-pressed tortillas earn a tip." : ""}` : oven ? `Every flatbread is built on the peel and baked in the deck oven; turned round so it bakes evenly, it comes out with leopard spots. Basil, rocket and honey go on after.${town.oven?.board ? " Cut in four on the board, they tip a little more." : ""}` : "Every patty goes out medium. Nobody asks for rare or well done."}</p>
    ${town.menu.map((r) => recipeHtml(r, mult, !base.has(r.name))).join("")}
  </section>
  ${elsewhereHtml(town, new Set(town.menu.map((r) => r.name)), prog)}
  <section class="mref-sec" data-sec="sides">
    <h3 class="menu-h">${icon("fries")}Sides</h3>
    <table class="bv-table mref-table">
      <thead><tr><th>${fryer.includes("chips") ? "Chips & salsa" : "Fries"}</th><th>Scoops</th><th class="num">Price</th></tr></thead>
      <tbody>${fryer.includes("chips") ? fries.replace(/ fries</g, " chips<") : fries}
      ${fryer.includes("churros") ? `<tr class="mref-poutine"><td colspan="2"><b>Churros</b><small>Same sizes and prices; sugar on top</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${fryer.includes("zucchini") ? `<tr class="mref-poutine"><td colspan="2"><b>Zucchini fritti</b><small>Same sizes and prices; battered, then fried and salted</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${fryer.includes("fritters") ? `<tr class="mref-poutine"><td colspan="2"><b>Apple fritters</b><small>Same sizes and prices; cinnamon sugar on top</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${fryer.includes("sweet") ? `<tr class="mref-poutine"><td colspan="2"><b>Sweet potato fries</b><small>Same sizes and prices; they cook faster</small></td><td class="num">${price(FRIES_PRICE.S)}+</td></tr>` : ""}
      ${poutine != null && town.poutine ? (fryer.includes("chips") ? `<tr class="mref-poutine"><td colspan="2"><b>Nachos</b><small>Chips, jalapeños, queso</small></td><td class="num">${price(poutine)}</td></tr>` : `<tr class="mref-poutine"><td colspan="2"><b>Poutine</b><small>Fries, cheese curds, gravy</small></td><td class="num">${price(poutine)}</td></tr>`) : ""}
      </tbody>
    </table>
    <p class="mref-note">Salted, or sugared where it says so. Cartons come from the stacks by the fryer.</p>
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
      ${extras.extra.length ? `<dt>Extra ${esc(listOf(extras.extra))}</dt><dd>+${price(EXTRA_PRICE)}</dd>` : ""}
      ${extras.add.length ? `<dt>Add ${esc(listOf(extras.add))}</dt><dd>+${price(ADD_PRICE)}</dd>` : ""}
      <dt>Leave something off</dt><dd>±$0</dd>
    </dl>
    <div class="bv-callout mref-tip">${icon("pickle")}<span>Toppings go on one piece at a time. A piece or two short can cost you a star; one or two extra can win a better one.</span></div>
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
