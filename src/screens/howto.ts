/**
 * How to Play (after build #80): three tabs along the bottom of the card.
 * - **Basics**: what every kitchen shares. Tap and drag, tickets, the tray and serving, Undo,
 *   sauce, the knife, the meters, topping counts, the fryer and the drinks.
 * - **Kitchen**: the middle counter of each region (Grill, Press, Comal, Oven), picked along the
 *   top. Each has its counter, then recipes step by step with their real tickets, then where the
 *   dishes come on. It opens on the kitchen of the town you're in (or picked on the map).
 * - **The trip**: stars and reviews, pacing, the day, the map and the Garage.
 * Each tab (and each kitchen) is its own scroller with sticky jump chips. The drawings are small
 * looping SVGs (howto-art.ts), still under reduced motion. See DESIGN §32.
 */
import "./howto.css";
import { CROWD } from "../game/business";
import { RANGE_MI } from "../game/day";
import { DIFFICULTIES, DIFFICULTY } from "../game/difficulty";
import { DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE, orderFromRecipe } from "../game/menu";
import { GREAT } from "../game/bonus";
import { PASS_STARS } from "../game/progress";
import { HOLD_GRACE } from "../game/scoring";
import { SHIFTS_TO_UNLOCK } from "../game/travel";
import { opinionFace } from "../ui/faces";
import { EVENTS, fountainFor, fryerOf, middleOf, REGIONS, STOPS, type MiddleCounter, type Recipe, type RegionId, type Stop } from "../game/stops";
import { COUNTED, DRINK_LABEL, FRIES_PORTION, FRIES_SCOOP, FRY_LABEL, KIND_COLOR, KIND_LABEL, STANDARD_COUNT, type FryKind, type Kind, type Modifier, type Size } from "../game/types";
import { tabArt, ticketHtml } from "../ui";
import { icon } from "../ui/icons";
import { esc, getDeps, jumpTo, modalHead, modalOpen, popModal, price, pushModal, wireJumpChips } from "./modal";
import { openMenuRef, recipeHtml, stackArt } from "./menuref";
import {
  ART_KEYFRAMES,
  comalArt,
  dragArt,
  flipArt,
  grillArt,
  knifeArt,
  meterArt,
  ovenArt,
  peelArt,
  pressArt,
  quesaArt,
  sauceArt,
  tapArt,
  tostadaFlow,
  undoArt,
} from "./howto-art";

type Tab = "basics" | "kitchen" | "trip";

interface Sec {
  id: string;
  /** Chip label in the index. */
  chip: string;
  icon: string;
  title: string;
  lede: string;
  fig?: string;
  points?: string[];
  /** Optional footer (links, lists). */
  foot?: string;
  /** Free-form body in place of the drawing and points. */
  raw?: string;
  /** A counter drawing for the heading, in place of the icon. */
  art?: string;
}

/** A recipe, step by step, with its real ticket. */
interface Walk {
  id: string;
  chip: string;
  recipe: Recipe;
  /** Make the ticket's slice step show (Harbor City, Port Amber). */
  slice?: boolean;
  /** Where it's on the menu. */
  where: string;
  art: string;
  steps: string[];
  tip?: string;
  /** A row of frames over the ticket. */
  flow?: string;
}

const KITCHENS: { id: MiddleCounter; label: string; region: RegionId }[] = [
  { id: "grill", label: "Grill", region: "mountains" },
  { id: "press", label: "Press", region: "coast" },
  { id: "comal", label: "Comal", region: "desert" },
  { id: "oven", label: "Oven", region: "orchard" },
];
/** The chip icon for a kitchen's walkthroughs. */
const DISH_ICON: Record<MiddleCounter, string> = { grill: "burger", press: "panini", comal: "flame", oven: "flame" };
const regionName = (id: RegionId) => REGIONS.find((r) => r.id === id)!.name;
/** A region's name inside a sentence ("across the Pines"). */
const regionIn = (id: RegionId) => regionName(id).replace(/^The /, "the ").replace(/^Sunny Coast$/, "the Sunny Coast");

/* ---- facts from the game data -------------------------------------------- */

/** "A", "A and B", "A, B and C". */
function and(list: string[]): string {
  return list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
const townsWhere = (f: (t: Stop) => boolean) => STOPS.filter(f).map((t) => t.name);

/** A recipe by name, from the towns' menus or an event's special. */
function recipe(name: string): Recipe {
  for (const t of STOPS) for (const r of t.menu) if (r.name === name) return r;
  const ev = EVENTS.find((e) => e.special?.name === name);
  if (ev?.special) return ev.special;
  throw new Error(`No recipe ${name}`);
}

/** Where a dish first comes on the menu, or the event that brings it. */
function whereOn(name: string): string {
  const t = STOPS.find((s) => s.menu.some((r) => r.name === name));
  if (t) return `On the menu from ${t.name}`;
  const ev = EVENTS.find((e) => e.special?.name === name);
  if (ev) return `The ${ev.name} special in ${STOPS.find((s) => s.id === ev.town)!.name}`;
  return "";
}

/** The kitchen's dishes in the order they come on, with the first town and price. */
function dishList(k: MiddleCounter, today?: Stop): string {
  const seen = new Map<string, { r: Recipe; from: string }>();
  for (const t of STOPS) if (middleOf(t) === k) for (const r of t.menu) if (!seen.has(r.name)) seen.set(r.name, { r, from: t.name });
  for (const e of EVENTS) {
    const t = STOPS.find((s) => s.id === e.town)!;
    if (e.special && middleOf(t) === k && !seen.has(e.special.name)) seen.set(e.special.name, { r: e.special, from: `${e.name}, ${t.name}` });
  }
  const on = new Set(today?.menu.map((r) => r.name) ?? []);
  return `<ul class="hw-dishes">${[...seen.values()]
    .map(({ r, from }) => `<li class="${on.has(r.name) ? "on" : ""}"><span class="nm">${esc(r.name)}</span><span class="fr">${esc(from)}</span><span class="pr">${price(r.price)}</span></li>`)
    .join("")}</ul>`;
}

/** The real ticket for a recipe, as it hangs on the rail with nothing on the tray yet. */
function ticketFor(r: Recipe, o: { slice?: boolean; fries?: boolean; drink?: "water" | null; mods?: Modifier[]; ice?: boolean } = {}): string {
  const order = orderFromRecipe(12, r, !!o.fries, o.drink ?? null, o.mods ?? [], "M", "S");
  if (o.slice) order.slice = true;
  if (o.ice != null) order.ice = o.ice;
  return `<div class="ticket active">${ticketHtml(order, { layers: [], fries: null, drink: null }, 0.82, true)}</div>`;
}

/* ---- small drawings kept from the old guide ------------------------------- */

function cupSvg(step: "cup" | "ice" | "pour" | "lid"): string {
  const body = "M9 16h22l-2.6 32H11.6z";
  const fill = step === "cup" || step === "ice" ? "" : `<path d="M10.1 26h19.8l-1.8 22H11.9z" class="liq"/>`;
  const ice = step === "cup" ? "" : `<rect x="13" y="${step === "ice" ? 38 : 28}" width="6" height="6" rx="1.2" class="ice"/><rect x="20" y="${step === "ice" ? 40 : 31}" width="6" height="6" rx="1.2" class="ice"/>`;
  const stream = step === "pour" ? `<rect x="18.8" y="2" width="2.4" height="24" rx="1.2" class="liq stream"/><path d="M14 4h12v4H14z" class="nozzle"/>` : "";
  const line = step === "pour" ? `<path d="M9.6 21h20.8" class="line"/>` : "";
  const lid = step === "lid" ? `<path d="M7 16h26v-2.2c-4-3.6-22-3.6-26 0z" class="lid"/>` : "";
  return `<svg class="hw-cup" viewBox="0 0 40 50" aria-hidden="true">${stream}${fill}${ice}<path d="${body}" class="cup"/>${line}${lid}</svg>`;
}

function carton(size: Size): string {
  const h = { S: 18, M: 23, L: 28 }[size];
  return `<svg class="hw-carton" viewBox="0 0 30 34" aria-hidden="true" style="height:${h + 6}px">
    <g transform="translate(0 ${34 - h - 2})">${[6, 10, 14, 18, 22].map((x, i) => `<rect x="${x}" y="${-4 - (i % 2) * 3}" width="3" height="12" rx="1" class="fry"/>`).join("")}
    <path d="M4 2h22l-2.5 ${h}h-17z" class="box"/></g></svg>`;
}

const scoops = (s: Size) => Math.round(FRIES_PORTION[s] / FRIES_SCOOP);

/** Map key marks, drawn like the map's own (home.css). */
const MK = {
  town: `<circle cx="14" cy="11" r="6" fill="#faf3e6" stroke="#3b2a3a" stroke-width="1.4"/>`,
  capital: `<circle cx="14" cy="11" r="8.6" fill="none" stroke="#3b2a3a" stroke-width="1"/><circle cx="14" cy="11" r="6" fill="#faf3e6" stroke="#3b2a3a" stroke-width="1.4"/><circle cx="14" cy="11" r="2.4" fill="#3b2a3a"/>`,
  pips: `<circle cx="7" cy="11" r="2.6" fill="#5f6b4a"/><circle cx="14" cy="11" r="2.6" fill="#5f6b4a"/><circle cx="21" cy="11" r="2.6" fill="#faf3e6" stroke="#3b2a3a" stroke-width="1"/>`,
  flag: `<path d="M9 19V3h11l-3 4 3 4H9" fill="#c8472e" stroke="#3b2a3a" stroke-width="1.1" stroke-linejoin="round"/>`,
  lock: `<path d="M8 10h12v9H8zM10.5 10V7.5a3.5 3.5 0 0 1 7 0V10" fill="#faf3e6" stroke="#6b645b" stroke-width="1.5" stroke-linejoin="round"/>`,
  prize: `<path d="M14 3l6 8-6 8-6-8z" fill="#e1b55c" stroke="#3b2a3a" stroke-width="1.1" stroke-linejoin="round"/>`,
  gated: `<path d="M2 11h24" stroke="#4d4239" stroke-width="2.4" stroke-dasharray="4 3"/><path d="M14 4v14" stroke="#c8472e" stroke-width="2.4" stroke-linecap="round"/>`,
  reach: `<rect width="28" height="22" rx="4" fill="#2a3340"/><path d="M3 15c6-6 14-6 22-8" fill="none" stroke="#a9ba88" stroke-width="2.4" stroke-linecap="round"/><circle cx="22" cy="8" r="3.4" fill="#ffe6a8" stroke="#e1b55c" stroke-width="1.2"/>`,
};
const mk = (svg: string) => `<svg viewBox="0 0 28 22" aria-hidden="true">${svg}</svg>`;

/* ---- the sections ---------------------------------------------------------- */

const CLASSIC = () => recipe("Trailhead Classic");

/** Basics: what every kitchen shares. */
function basicsSecs(town: Stop | undefined): Sec[] {
  const here = town ? middleOf(town) : "grill";
  const cook = { grill: "Cook", press: "Press", comal: "Warm", oven: "Bake" }[here];
  const cookIc = { grill: "grill", press: "panini", comal: "flame", oven: "flame" }[here];
  const knifeTowns = and(townsWhere((t) => !!t.press?.slice || !!t.oven?.board));
  const counted = countedFor(town);
  const count = (k: Kind) => STANDARD_COUNT[k] ?? 1;
  const ex = CLASSIC();
  return [
    {
      id: "basics",
      chip: "Basics",
      icon: "sparkle",
      title: "The basics",
      lede: "Customers queue at the window. Make what's on their ticket, build it on their tray, then serve it.",
      fig: `<ol class="hw-steps">
        <li>${icon("receipt")}<b>Read</b><span>the ticket</span></li>
        <li>${icon(cookIc)}<b>${cook}</b><span>the food</span></li>
        <li>${icon("tray")}<b>Build</b><span>on the tray</span></li>
        <li>${icon("arrow-up")}<b>Serve</b><span>tap or swipe up</span></li>
      </ol>
      <div class="hw-nav" aria-hidden="true">
        <span class="b">${icon("drink")}</span><span class="chute"></span><span class="b lit">${icon("fryer")}</span>
      </div>
      <p class="hw-cap">The round buttons at the edges take you to the next counter. A glowing ring means it needs you. With empty hands you can also swipe along the trash chute.</p>`,
      points: [
        "Three counters: <b>Drinks</b>, the kitchen in the middle, and the <b>Fryer</b>. Customers and trays stay put while you switch.",
        "People wait in a <b>line</b> outside. When the window is empty the first one steps up alone. Otherwise tap the bell, marked <b>Next</b>, to call one. More at the window earns more, if you can keep up.",
        "An order's patience only starts once they've ordered. In the line, the back drifts off first.",
      ],
    },
    {
      id: "hands",
      chip: "Tap & drag",
      icon: "tap",
      title: "Tap and drag",
      lede: "Tap anything to see its name; drag to place it. One drag from a well is one scoop.",
      fig: `<div class="hw-pair">
          <div>${tapArt()}<p class="hw-cap"><b>Tap</b>: its name. Nothing moves.</p></div>
          <div>${dragArt()}<p class="hw-cap"><b>Drag</b>: one piece, onto the tray.</p></div>
        </div>
        <div class="hw-pair">
          <div>${flipArt()}<p class="hw-cap"><b>Tap or flick up</b> on the heat to flip.</p></div>
          <div class="hw-pair-t"><p class="hw-cap">A <b>flick up</b> from a pan tosses a piece onto the active tray.</p><p class="hw-cap">Some things stay a tap: cracking an egg, lowering a basket.</p></div>
        </div>`,
      points: [
        "A tap on a pan, bin, stack or well only shows a name bubble. Placing always takes a drag.",
        "Each drag is <b>one piece</b>, so count as you go. From the pork, bean or tuna well, one drag is one scoop.",
        "Hold something over a counter button for a moment and that counter comes up, so you can carry food across.",
      ],
    },
    {
      id: "orders",
      chip: "Tickets",
      icon: "receipt",
      title: "Tickets",
      lede: "Each customer's ticket hangs on the rail. The open one shows the whole build, top first.",
      fig: `<div class="hw-tk ex">${ticketFor(ex, { fries: true, drink: "water", ice: false, mods: [{ type: "no", kind: "ketchup" }, { type: "extra", kind: "tomato" }] })}</div>
        ${ticketKey()}`,
      points: [
        "<b>Tap a ticket</b> to make that order active and open it. Tap it again to fold it, so you can see the others.",
        "The tray with the blue outline is the one you're building.",
        "Lines tick off as they land on the tray. The ticket is forgiving: a piece ticks off its line wherever it went. The stars are not.",
        "Now and then someone wants <b>just a drink or just a side</b>. Their tray has no plate.",
      ],
    },
    {
      id: "stack",
      chip: "Tray",
      icon: "tray",
      title: "The tray and serving",
      lede: "Build on the customer's tray, from the bottom up. Then hand it over.",
      fig: `<div class="hw-stack">
        ${stackArt(ex)}
        <ol class="hw-layers" reversed>${[...ex.layers].reverse().map((k, i) => `<li><span class="bv-mono">${ex.layers.length - i}</span><i class="swc" style="--c:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]}${COUNTED.has(k) ? ` <b class="bv-mono">×${count(k)}</b>` : ""}</li>`).join("")}</ol>
        <span class="hw-up">${icon("arrow-up")}<small>Build up</small></span>
      </div>
      <div class="hw-lamp">
        <span class="lampic">${icon("clock")}</span>
        <div><b>Waiting on the tray</b><span>Cooked food keeps about ${HOLD_GRACE} s on a tray, then goes cold; fries go soggy a little sooner. The bar along the tray shows it. The warm end of the grill or comal keeps food twice as long.</span><i class="q" aria-hidden="true"></i></div>
      </div>`,
      points: [
        "To fix a tray, drag a wrong layer to the trash. Held food lights the trash red when a drop would bin it.",
        "When everything is on, a <b>Serve</b> button pops up. Tap it, tap the tray, or swipe the tray up.",
        "Check the ticket first: a forgotten side or drink costs stars.",
        "<b>Unordered extras</b>, like fries they didn't ask for, can soften a bad review. They come off your takings, so save them for rescues.",
      ],
      foot: `<p class="hw-sub">What they do with it</p>
      <ol class="hw-verdicts">
        <li><b>Looks good</b><span>They take it and pay. The better it is, the more they pay and tip.</span></li>
        <li><b>Sent back</b><span>Clearly off: they hand it back saying what's wrong. Fix it and serve again. This time they take it.</span></li>
        <li><b>Refused</b><span>Really wrong: no sale, and they leave.</span></li>
      </ol>`,
    },
    {
      id: "undo",
      chip: "Undo",
      icon: "undo",
      title: "Undo",
      lede: "Undo (top left) puts back your last move.",
      fig: `${undoArt()}<p class="hw-cap">Tap Undo and the last thing you moved flies back.</p>`,
      points: [
        "It puts back an ingredient in its pan, food where it was, a squeeze of sauce, even something you binned.",
        "<b>Cooking keeps going.</b> A patty undone off a tray goes back on the grill as cooked as it is now.",
        "Served orders can't be undone. Neither can flips, folds, cuts or a turn in the oven.",
        "The button is grey when there's nothing to undo.",
      ],
    },
    {
      id: "sauce",
      chip: "Sauce",
      icon: "sauce",
      title: "Sauce",
      lede: "Tap the bottle, then the burger, and draw it on. Or drag the bottle straight on: it only starts once you're over the bun.",
      fig: `${sauceArt()}<p class="hw-cap">The bar on the left fills as you go. Lift at <b>Perfect</b>.</p>`,
      points: [
        "The close-up opens and waits for one stroke: press, draw, lift. It reads <b>Keep going</b>, <b>A bit more</b>, <b>Perfect</b>, <b>That's plenty</b>, then <b>Too much</b>.",
        "Sauce goes on at the tray, whatever the dish: ketchup and mustard, pesto and aioli, salsa and crema, honey.",
        "The red sauce pot at the oven is a ladle: drag it to spread, out to the crust.",
      ],
    },
    {
      id: "knife",
      chip: "Knife",
      icon: "knife",
      title: "The knife",
      lede: `Knife (${knifeTowns}): tap the knife, then the food, or drag the knife onto it, and draw a slice right across.`,
      fig: `<div class="hw-pair">
          <div>${knifeArt()}<p class="hw-cap"><b>Paninis</b>: once, in half.</p></div>
          <div>${knifeArt(true)}<p class="hw-cap"><b>Flatbreads</b>: twice, for four.</p></div>
        </div>`,
      points: [
        "The food must be on the board. The cut view opens over the counter.",
        "A slice counts once it goes in one side and out the other. The second cut on a flatbread goes the other way.",
        "Uncut costs the dish more than a crooked cut. A crooked one costs a little, never much.",
        "The ticket shows it: <b>Press › Cut</b> or <b>Bake › Cut 4</b>. A calzone goes out whole.",
      ],
    },
    {
      id: "meters",
      chip: "Meters",
      icon: "thermometer",
      title: "Doneness meters",
      lede: "Food on the heat has a meter under it. Done is the hatched middle band.",
      fig: `${meterArt()}<p class="hw-cap">Before the band it's not done yet. Past it, over, then burnt.</p>`,
      points: [
        "Patties, buns, eggs and bacon, the press lid, the fryer baskets and the pies in the oven all use it.",
        "Tortillas show their own colours: pale blue-grey, then orange with a <b>Warm</b> chip, then brown with <b>Hard</b>.",
        "A flatbread's meter reads its <b>palest side</b>.",
        "Fryer baskets beep from perfect until you lift them.",
      ],
    },
    {
      id: "toppings",
      chip: "Counts",
      icon: "pickle",
      title: town ? `Counts in ${town.name}` : "Topping counts",
      lede: "Sliced things go on one piece at a time, and every recipe has a count.",
      fig: `<ul class="hw-counts">${counted
        .map((k) => `<li><i class="swc" style="--c:${KIND_COLOR[k]}"></i><span>${KIND_LABEL[k]}</span><span class="pcs ${k}" style="--c:${KIND_COLOR[k]}">${"<b></b>".repeat(count(k))}</span><b class="bv-mono">×${count(k)}</b></li>`)
        .join("")}</ul>
      <p class="hw-cap">The standard count. Some recipes differ: the ticket shows it.</p>
      <div class="hw-scale">
        <div class="lo"><b>Fewer</b><span>Customers notice. It may cost a review.</span></div>
        <div class="std"><b>Standard</b><span>Exactly right.</span></div>
        <div class="hi"><b>+1 or 2</b><span>A small bonus for generosity. More than that won't help.</span></div>
        <div class="paid"><b>Extra</b><span>On the ticket. They pay +${price(EXTRA_PRICE)}.</span></div>
      </div>`,
      points: ["<b>Extra</b> on a ticket means a bigger helping, and the customer pays a little more."],
      foot: getDeps() ? `<button class="bv-btn sm ghost" data-m="menuref">${icon("food-menu")}Counts for every recipe</button>` : undefined,
    },
    fryerSec(town),
    {
      id: "drinks",
      chip: "Drinks",
      icon: "drink",
      title: "Drinks",
      lede: "Four steps, always in this order.",
      fig: `<ol class="hw-drink">
        <li>${cupSvg("cup")}<b>Cup</b><span>S · M · L</span></li>
        <li>${cupSvg("ice")}<b>Ice</b><span>unless No ice</span></li>
        <li>${cupSvg("pour")}<b>Pour</b><span>hold</span></li>
        <li>${cupSvg("lid")}<b>Lid</b></li>
      </ol>`,
      points: [
        `Take a cup of the right size: <b>S, M or L</b> (${price(DRINK_PRICE.S)} to ${price(DRINK_PRICE.L)}). Stand it under a nozzle. You can move a cup any time.`,
        "Add ice from the ice bin unless the ticket says <b>No ice</b>.",
        "<b>Hold</b> the drink's button to pour. The bar on the left shows the level: let go at <b>Perfect</b>. On Chill it stops at the line by itself.",
        "An overflow leaves a spill. <b>Wipe it</b> before that nozzle takes another cup.",
        "Snap on a <b>lid of the cup's size</b>, then drag the drink up to the tray.",
      ],
    },
  ];
}

/** The counted toppings this town's menu uses (all of them away from a town). */
function countedFor(town: Stop | undefined): Kind[] {
  const all = [...COUNTED];
  if (!town) return all;
  const used = new Set(town.menu.flatMap((r) => r.layers));
  const mine = all.filter((k) => used.has(k));
  return mine.length ? mine : all;
}

/** The ticket key: what each mark on a ticket means, drawn as on the ticket. */
function ticketKey(): string {
  return `<dl class="hw-key ticket">
    <dt><span class="kbar"><i></i></span></dt><dd>Patience: green, amber, then red. At the end they walk off.</dd>
    <dt><span class="ln nx">Lettuce</span></dt><dd>Next to go on.</dd>
    <dt><span class="ln dn">Bun</span></dt><dd>On the tray.</dd>
    <dt><span class="ln wr">Onion</span></dt><dd>Not wanted, or in the wrong place.</dd>
    <dt><span class="ln mod"><span class="kw">NO</span> Ketchup</span></dt><dd>A change from the menu. A <b>*</b> on a folded ticket.</dd>
    <dt><i class="mb toast">Toast</i><i class="mb melt">Melt</i></dt><dd>How to cook that layer.</dd>
    <dt><span class="how"><i class="mb toast">Press</i><i>›</i><i class="mb cut">Cut</i></span></dt><dd>Steps for the whole dish.</dd>
    <dt><i class="sz">M</i></dt><dd>Sides and drinks, size first.</dd>
  </dl>`;
}

/** What the fryer makes, one line each. */
const FRY_NOTE: Record<FryKind, string> = {
  fries: "done from about 20 s, perfect near 30.",
  sweet: "faster than fries, with a narrower done band.",
  chips: "tortilla wedges, golden in about 8 s.",
  churros: "a little quicker than fries. Shake sugar on them.",
  zucchini: "drop it in the batter bowl, pick it up again, then fry and salt.",
  fritters: "fry like fries, then cinnamon sugar from the shaker.",
};

function fryerSec(town: Stop | undefined): Sec {
  const kinds = town ? fryerOf(town) : (["fries"] as FryKind[]);
  const tostada = !!town?.menu.some((r) => r.dish === "tostada");
  const poutineFrom = STOPS.find((t) => t.poutine && middleOf(t) === "grill")?.name;
  const nachosFrom = STOPS.find((t) => t.poutine && middleOf(t) === "comal")?.name;
  const here = town
    ? `<div class="hw-key lite ticket" style="display:grid">${kinds
        .map((k) => `<span><b>${FRY_LABEL[k]}</b>: ${FRY_NOTE[k]}</span>`)
        .join("")}${tostada ? `<span><b>Tostada</b>: a corn tortilla in an empty basket. See the Comal.</span>` : ""}</div>`
    : "";
  return {
    id: "fryer",
    chip: "Fryer",
    icon: "fries",
    title: "The fryer",
    lede: "Scoop, lower, watch the meter, lift, pack, salt.",
    fig: `<div class="hw-scoops">${(["S", "M", "L"] as Size[])
      .map((s) => `<div><span class="dots">${"<i></i>".repeat(scoops(s))}</span><span class="cap">${scoops(s)} scoop${scoops(s) > 1 ? "s" : ""}</span>${carton(s)}<b><span class="bv-chip size">${s}</span> <span class="bv-mono">${price(FRIES_PRICE[s])}</span></b></div>`)
      .join("")}</div>
      ${town ? `<p class="hw-sub">In ${esc(town.name)}</p>${here}` : ""}`,
    points: [
      "Drag <b>1, 2 or 3 scoops</b> into a basket for a small, medium or large.",
      "<b>Tap the basket</b> to lower it into the oil, and tap again to lift. Fries take about half a minute, so start them early.",
      "It <b>beeps</b> from perfect until you lift it. Early is soggy, late is dark.",
      "Set an empty carton on a pad and drag the fries into it.",
      "<b>Salt</b>: pick up the shaker and shake it over the carton. Stop at the line on the bar.",
      "Then drag the carton up to the tray.",
      `<b>Poutine</b>${poutineFrom ? ` (from ${poutineFrom})` : ""}: fries in a carton, then cheese curds, then gravy.${nachosFrom ? ` <b>Nachos</b> (from ${nachosFrom}): chips, jalapeños, then queso.` : ""}`,
    ],
  };
}

/** The trip: everything around the cooking. */
function tripSecs(): Sec[] {
  const crowdLine = (Object.keys(CROWD) as (keyof typeof CROWD)[]).map((c) => `<li><b>${CROWD[c].label}</b> ${CROWD[c].blurb.replace(/\.$/, "").toLowerCase()}</li>`).join("");
  return [
    {
      id: "score",
      chip: "Stars",
      icon: "star",
      title: "Stars, reviews and tips",
      lede: "Every customer rates their order from 1 to 5 stars, and pays more the better it is.",
      fig: `<div class="hw-score">
        <span class="bv-stars lg">${[0, 1, 2, 3, 4].map(() => `<span class="on">${icon("star")}</span>`).join("")}</span>
        <span class="hw-faces" aria-label="Faces from delighted to angry">${[5, 4, 3, 2, 1].map((n) => opinionFace(n)).join("")}</span>
        <ul>
          <li>${icon("check")}Right layers, in order</li>
          <li>${icon("check")}Cooked, toasted, melted</li>
          <li>${icon("check")}Topping counts</li>
          <li>${icon("check")}Sides and drinks</li>
          <li>${icon("check")}A neat, fresh stack</li>
          <li>${icon("coin")}Fast <i>and</i> good: a tip</li>
        </ul>
      </div>`,
      points: [
        "<b>Tips</b> come from good food served before the customer gets worried.",
        "As they leave, everyone shows a <b>face</b> for what they thought. They only speak up when it's specific: something missing, something wrong, or especially quick or good.",
        "Only some leave a <b>review</b>, the stars over their head. The delighted and the disappointed write most. Critics always do. Your <b>rating</b> is the average of every review.",
        `<b>Pass a shift</b>: serve at least half your customers, with an average of ${PASS_STARS}★ or more.`,
        `A <b>great shift</b> (${GREAT.stars}★ or more, with ${Math.round(GREAT.served * 100)}% served) unlocks that town's <b>bonus</b>. Every town has its own.`,
        `${icon("critic")} A <b>critic</b>'s ticket is marked. A great review lands in the paper and brings more customers.`,
      ],
    },
    {
      id: "pacing",
      chip: "Pacing",
      icon: "dial",
      title: "Pacing",
      lede: "How busy and how picky. Pick it on Prep & Open. It stays put for the shift.",
      raw: `<ul class="hw-pace">${DIFFICULTIES.map((d) => `<li><b>${DIFFICULTY[d].label}</b>${esc(DIFFICULTY[d].blurb)}</li>`).join("")}</ul>`,
    },
    {
      id: "day",
      chip: "The day",
      icon: "sun",
      title: "The day",
      lede: "Prep in the morning, a lunch shift, then the evening on the map.",
      fig: `<div class="hw-biz">
        <span class="bv-eyebrow">Expect today</span>
        <b class="bv-mono" style="font-size:28px">~12 customers</b>
        <span class="bv-eyebrow">Pacing</span>
        <div class="bv-seg compact" aria-hidden="true"><button tabindex="-1">Chill</button><button tabindex="-1" aria-pressed="true">Balanced</button><button tabindex="-1">Stressful</button></div>
      </div>`,
      points: [
        "<b>Prep & Open</b>: who to expect, the menu, the shift's hours, the pacing and one bonus.",
        "A longer <b>menu</b> brings more people and more kinds of order. Hide recipes to keep it simple.",
        "Drag the <b>shift</b> slider to open early or close late. Lunch peaks from noon to one. A shift is at least four hours.",
        "At sundown the <b>Closed</b> sign goes up. The results come up over the evening map, then <b>Sleep</b> starts tomorrow.",
        "<b>Takings</b> are your score: orders and tips, less anything given away. They go into your <b>savings</b>.",
      ],
    },
    {
      id: "trip",
      chip: "Map",
      icon: "map",
      title: "The road trip",
      lede: "Drive from town to town, and plan your route around events.",
      fig: `<svg class="hw-map" viewBox="0 0 300 116" role="img" aria-label="Three passed shifts in a town open the roads to its neighbours">
        <path d="M54 58 L150 24" class="road"/><path d="M54 58 L150 92" class="road"/>
        <path d="M150 24 L252 58" class="road locked"/><path d="M150 92 L252 58" class="road locked"/>
        <circle cx="54" cy="58" r="11" class="node here"/>
        <circle cx="54" cy="58" r="3.4" class="here-dot"/>
        <circle cx="150" cy="24" r="8" class="node"/><circle cx="150" cy="92" r="8" class="node"/>
        <circle cx="252" cy="58" r="9" class="node locked"/>
        <g class="pips">${[0, 1, 2].map((i) => `<circle cx="${44 + i * 10}" cy="80" r="3.6"/>`).join("")}</g>
        <text x="54" y="98" class="nl" text-anchor="middle">${SHIFTS_TO_UNLOCK} passed shifts</text>
        <text x="54" y="38" class="nl" text-anchor="middle">You</text>
        <text x="172" y="28" class="nl">Open</text>
        <text x="172" y="96" class="nl">Open</text>
        <text x="252" y="84" class="nl" text-anchor="middle">Locked</text>
        <path d="M248.5 57v-2.2a3.5 3.5 0 0 1 7 0V57M247 57h10v6h-10z" class="lock"/>
      </svg>
      <ul class="hw-mapkey">
        <li>${mk(MK.town)}A town</li>
        <li>${mk(MK.capital)}A capital: it opens the next region</li>
        <li>${mk(MK.pips)}Passed shifts toward the next roads</li>
        <li>${mk(MK.flag)}An event: red today, gold in a day or two</li>
        <li>${mk(MK.lock)}Not open yet</li>
        <li>${mk(MK.prize)}A bonus still to win there</li>
        <li>${mk(MK.gated)}A highway that opens later: its note says when</li>
        <li>${mk(MK.reach)}At night: what you can still reach</li>
      </ul>
      <div class="hw-drive">
        <span>${icon("moon")}<b>Tonight</b><small>Short hops, ${RANGE_MI} miles in all</small></span>
        <span>${icon("sun")}<b>Further away</b><small>A whole day on the road</small></span>
      </div>
      <div class="hw-cal" aria-label="A town's calendar">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<span class="${d === 2 ? "today" : ""} ${d === 5 ? "ev" : ""}"><b class="bv-mono">${d}</b>${d === 5 ? "<i>Fair</i>" : ""}</span>`).join("")}</div>
      <p class="hw-cap">A town's week ahead: today is day 2, and there's a fair on day 5.</p>`,
      points: [
        `Pass <b>${SHIFTS_TO_UNLOCK} shifts</b> in a town to open the roads to its neighbours.`,
        `${icon("moon")} After a shift, roads within tonight's range glow. Hop along them before you sleep: the hops add up to ${RANGE_MI} miles.`,
        `${icon("sun")} Going <b>further</b> takes a whole day on the road, with no shift that day.`,
        `${icon("calendar")} <b>Tap a town</b> to see its crowd and calendar. Events bring bigger crowds and sometimes a special.`,
        "Good shifts spread the word. Every few customers who give 4★ or more bring in a little more <b>popularity</b>. Walk-outs, and people who give up on the line, cost some.",
      ],
      foot: `<p class="hw-sub">Who turns up</p><ul class="hw-crowds">${crowdLine}</ul>`,
    },
    {
      id: "garage",
      chip: "Garage",
      icon: "truck",
      title: "The Garage",
      lede: "Your savings buy bonuses and looks for the truck.",
      points: [
        "On the map, tap your <b>savings</b> (the button with the truck) to open the Garage.",
        "A great shift unlocks that town's bonus. Then it's for sale here.",
        "Bring <b>one bonus</b> per shift, picked on Prep & Open.",
        "Looks for the truck show on the map and at night.",
      ],
    },
  ];
}

/* ---- kitchens -------------------------------------------------------------- */

/** The counter section of a kitchen. */
function counterSec(k: MiddleCounter): Sec {
  const art = tabArt(KITCHENS.find((x) => x.id === k)!.label);
  if (k === "grill") {
    const smash = and(townsWhere((t) => middleOf(t) === "grill" && t.menu.some((r) => !!r.smash)));
    return {
      id: "counter",
      chip: "The grill",
      icon: "grill",
      art,
      title: "The grill",
      lede: "Three zones: the ridged grille, the flat and the warm end. Patties cook slowly, so start them early.",
      fig: `${grillArt()}<p class="hw-cap">Each zone's button on the front goes off, warm, hot. Two red lamps are hot, one orange is warm.</p>`,
      points: [
        "A shift starts <b>hot, hot, warm</b>. Warm holds food without cooking it, and it keeps there twice as long as on a tray (a small bar under the meter shows it). Park finished food on it, but not all shift.",
        "<b>Tap or flick up</b> to flip. Flip a patty once, about halfway, or its face down chars. Buns don't flip: they toast cut side down.",
        "Four seconds face down on the hot grille leaves <b>grill marks</b>, a small bonus.",
        "<b>Melt</b>: drop a cheese slice on a patty on the grill. They come off together.",
        "<b>Eggs</b>: tap the egg tray to pick one up, then tap the flat to crack it. One quick, clean tap opens it in one. On the grille it makes a mess to rub off. Drop the shells in the trash.",
        `<b>Smash</b> (${smash}): press and hold a fresh patty to flatten it. Thin patties cook fast.`,
        "Only the piece touching the grill cooks. Bacon grills too.",
      ],
    };
  }
  if (k === "press") {
    return {
      id: "counter",
      chip: "The press",
      icon: "panini",
      art,
      title: "The panini press",
      lede: "A clamshell press: both sides cook at once, under a lid that hides the food.",
      fig: `${pressArt()}<p class="hw-cap">Pull the handle down. At golden, swipe it up.</p>`,
      points: [
        "Build bread first, in an open bay or on a tray. Sauce goes on at the tray only. To move a whole sandwich from the tray into a bay, drag down on the tray.",
        "<b>Pull the handle down</b> to close. It only shuts on bread or a patty on its own, or a sandwich with bread top and bottom.",
        "Watch the <b>meter on the lid</b>: pale, golden with press lines, then dark. <b>Swipe the handle up</b> to open. A tap only gives a hint.",
        "Cheese inside melts while it's shut, and a little oozes out at the front when it has.",
        "<b>Chicken and veggie patties</b> are pressed on their own first, until their meter says done.",
        "The <b>tuna well</b>: one drag is one scoop.",
        `In <b>${and(townsWhere((t) => !!t.press?.slice))}</b>: a third bay and the board. Paninis are cut in half with the knife (see Basics).`,
      ],
    };
  }
  if (k === "comal") {
    const tpress = and(townsWhere((t) => !!t.comal?.tpress));
    return {
      id: "counter",
      chip: "The comal",
      icon: "flame",
      art,
      title: "The comal",
      lede: "One long steel plate: hot, hot, then warm at the right end, where the taco rack stands. No buttons.",
      fig: `${comalArt()}<p class="hw-cap">Tortillas warm on the hot side. Tacos are filled in the rack.</p>`,
      points: [
        "<b>Tortillas</b> are warm in about 6 seconds: soft with brown spots, and the <b>Warm</b> chip. From about 13 they go <b>Hard</b>.",
        "Drag a warm tortilla by its middle into the <b>taco rack</b>: four slots. A tortilla that's still cold is refused.",
        "In the rack, one drag from the pork or bean well is one scoop into one taco. Other toppings go in once and land on every taco.",
        "Salsa and crema go on at the tray, not in the rack. <b>Drag the rack up to a tray</b>.",
        "Nothing in the rack cooks on, and tacos keep there twice as long as on a tray. On a tray, tacos are as fresh as the last one placed.",
        "<b>Pineapple</b> chars on the comal: flick it to flip. <b>Eggs</b> crack on the hot side.",
        `<b>Tortilla press</b> (${tpress}): hold it to flatten a ball of masa, then drag the tortilla to the comal. Hand-pressed tortillas add ${price(2)} to the tip.`,
      ],
    };
  }
  const board = and(townsWhere((t) => !!t.oven?.board));
  return {
    id: "counter",
    chip: "The oven",
    icon: "flame",
    art,
    title: "The oven and the peel",
    lede: "A deck oven with a hot back wall. Pies are built on the peel, and only the peel moves them.",
    fig: `${peelArt()}<p class="hw-cap">Push the blade in under a pie, carry it out, swipe down over the tray.</p>
      ${ovenArt()}<p class="hw-cap">The side facing the back wall browns first. Nudge the pie with the peel's tip to turn it.</p>`,
    points: [
      "Drag the dough onto the peel. A tap only names it.",
      "Drag from the pot to ladle the sauce, out to the crust. The bar on the left shows how much. White bases get olive oil instead: drag from its bottle.",
      "<b>Drag the peel by its handle</b> into the oven and <b>swipe down</b> to set the pie on the deck.",
      "To lift a pie, <b>push the blade in under it</b>, or set it under and flick up.",
      "The meter shows the <b>palest side</b>. Turned about halfway, a pie bakes evenly, with <b>leopard spots</b>: a small bonus.",
      "Swipe down over the <b>bench</b> to set a pie aside. <b>Basil, rocket and honey</b> go on after, at the tray.",
      `In <b>${board}</b>: a third spot and the board in the bench's place, for cutting flatbreads in four.`,
    ],
  };
}

function kitchenWalks(k: MiddleCounter): Walk[] {
  if (k === "grill") {
    const sunrise = recipe("Sunrise Summit");
    const lj = recipe("Lumberjack Stack");
    return [
      {
        id: "sunrise",
        chip: "Sunrise",
        recipe: sunrise,
        where: whereOn(sunrise.name),
        art: stackArt(sunrise),
        steps: [
          "Start the <b>patty</b>: drag one onto the grille. It takes longest.",
          "Drag <b>two buns</b> onto the grill to toast, cut side down.",
          "Tap the egg tray, then tap the flat to <b>crack an egg</b>. Sunny side up: no flip.",
          "<b>Flip the patty</b> once, about halfway.",
          "On the tray: a toasted bun, lettuce, the patty once its meter is in the band, the egg, the top bun.",
          "<b>Serve</b>.",
        ],
        tip: "Done early? Park it on the <b>warm</b> zone. It won't cook on, and it keeps twice as long as on a tray.",
      },
      {
        id: "lumberjack",
        chip: "Lumberjack",
        recipe: lj,
        where: whereOn(lj.name),
        art: stackArt(lj),
        steps: [
          "<b>Two patties</b> on the grill, bacon beside them, and two buns to toast.",
          "Flip each patty once. Then drop a <b>cheese slice</b> on one to melt.",
          "On the tray: a bun, the patty with its cheese (they come up together), bacon, the second patty.",
          "<b>Ketchup</b>: tap the bottle, then the burger, and draw it on. Lift at Perfect.",
          "The top bun, then <b>serve</b>.",
        ],
      },
    ];
  }
  if (k === "press") {
    const cap = recipe("Caprese");
    const avo = recipe("Avocado Toast");
    const cut = and(townsWhere((t) => !!t.press?.slice));
    return [
      {
        id: "caprese",
        chip: "Caprese",
        recipe: cap,
        slice: true,
        where: `${whereOn(cap.name)}. Cut in ${cut}`,
        art: knifeArt(),
        steps: [
          "On a tray: <b>ciabatta</b>, then <b>pesto</b>. Tap the bottle, then the bread, and draw it on.",
          "Mozzarella ×3, tomato ×3, basil, then the top ciabatta.",
          "<b>Drag down</b> on the tray to lift the sandwich into an open bay. <b>Pull the handle down</b>.",
          "Watch the lid's meter. At golden, <b>swipe the handle up</b>.",
          `${cut}: drag it onto the board. Tap the knife, then the panini, and <b>draw one slice</b> across.`,
          "Drag it up to the tray and <b>serve</b>.",
        ],
        tip: "Without a cut it scores less than with a crooked one.",
      },
      {
        id: "avocado",
        chip: "Avocado",
        recipe: avo,
        where: whereOn(avo.name),
        art: stackArt(avo),
        steps: [
          "Drag a slice of <b>sourdough</b> into an open bay and pull the handle down.",
          "At golden, swipe the handle up and drag the toast to a tray.",
          "<b>Avocado ×4</b>, then rocket. The avocado never goes in the press.",
        ],
      },
    ];
  }
  if (k === "comal") {
    const rodeo = recipe("Rodeo Platter");
    const q = recipe("Quesadilla");
    const t = recipe("Bean Tostada");
    return [
      {
        id: "tostada",
        chip: "Tostada",
        recipe: t,
        where: `${whereOn(t.name)}. The shell comes from the fryer`,
        art: stackArt(t),
        flow: tostadaFlow(),
        steps: [
          "Pick up a <b>corn tortilla</b> at the comal. Hold it over the Fryer button and the fryer comes up.",
          "Drop it in an <b>empty basket</b>. It becomes a tostada shell.",
          "<b>Tap the basket</b> to lower it. About 10 s to done. It beeps from perfect: tap again to lift.",
          "Drag the shell <b>up to a tray</b>.",
          "<b>Beans</b> (one drag, one scoop), <b>lettuce</b>, <b>cheese</b>, in any order.",
          "<b>Crema</b>: tap the bottle, then the tostada, and draw it on. Then <b>serve</b>.",
        ],
        tip: "Lifted early, the shell is soggy. Left in, it goes dark, then burns.",
      },
      {
        id: "tacos",
        chip: "Platter",
        recipe: rodeo,
        where: whereOn(rodeo.name),
        art: comalArt(),
        steps: [
          "Lay <b>four corn tortillas</b> on the hot side.",
          "When each shows <b>Warm</b>, drag it by its middle into the rack.",
          "Fill in the rack: one drag from the <b>pork</b> well per taco.",
          "<b>Onion, cilantro, lime</b>: drag each in once. It goes over every taco.",
          "<b>Drag the rack up</b> to the tray, then serve.",
        ],
        tip: "Dragging a tortilla by its edge across the middle folds it. Drag by the middle to move it.",
      },
      {
        id: "quesadilla",
        chip: "Quesadilla",
        recipe: q,
        where: whereOn(q.name),
        art: quesaArt(),
        steps: [
          "A <b>flour tortilla</b> on the hot side, then drag <b>cheese</b> onto it.",
          "Press near its edge and <b>drag across the middle</b> to fold it.",
          "<b>Tap or flick up</b> to flip it once.",
          "The chip says Melting, then <b>Melted</b>. Take it to the tray before the shell goes dark.",
        ],
        tip: "Forgot something? <b>Press and hold</b> it for half a second to unfold it.",
      },
    ];
  }
  const red = recipe("Harvest Red");
  const cz = recipe("Calzone");
  const board = and(townsWhere((t) => !!t.oven?.board));
  return [
    {
      id: "harvest",
      chip: "Harvest Red",
      recipe: red,
      slice: true,
      where: `${whereOn(red.name)}. Cut in four in ${board}`,
      art: peelArt(),
      steps: [
        "Drag the dough onto the peel.",
        "Drag from the <b>sauce pot</b> and spread it out to the crust. Stop at Perfect.",
        "<b>Mozzarella ×4</b>.",
        "Drag the peel into the oven by its handle and <b>swipe down</b>.",
        "About halfway, <b>turn it</b> with the peel's tip.",
        `Push the blade in under it and carry it out. In ${board}, swipe down over the board.`,
        "Tap the knife, then the pie, and slice across. Then once more, the other way, for <b>four</b>.",
        "Lift it with the peel, swipe down over a tray, then add <b>basil</b>.",
      ],
      tip: "Elsewhere it goes straight from the oven to the tray, uncut.",
    },
    {
      id: "calzone",
      chip: "Calzone",
      recipe: cz,
      where: whereOn(cz.name),
      art: stackArt(cz),
      steps: [
        "Dough, sauce, then the fillings on the peel.",
        "Press near its side and <b>drag across</b> to fold it.",
        "Bake it. It's thick, so it takes longer. Turn it as usual.",
        "It goes out whole: no cut.",
      ],
    },
  ];
}

function walkHtml(w: Walk): string {
  return `<section class="hw-sec" data-sec="${w.id}">
    <div class="hw-walk">
      <p class="hw-sub">Step by step</p>
      <div class="hw-walk-h"><h4>${esc(w.recipe.name)}</h4><span class="pr">${price(w.recipe.price)}</span><span class="wh">${esc(w.where)}</span></div>
      ${w.flow ?? ""}
      <div class="hw-walk-top">
        <div class="hw-tk">${ticketFor(w.recipe, { slice: w.slice })}</div>
        <div class="hw-walk-art">${w.art}</div>
      </div>
      <ol class="hw-do">${w.steps.map((s) => `<li><span>${s}</span></li>`).join("")}</ol>
      ${w.tip ? `<p class="hw-tip">${w.tip}</p>` : ""}
    </div>
  </section>`;
}

/** A kitchen's sections: its counter, the walkthroughs, the sides here, its dishes, and today's menu if you're there. */
function kitchenHtml(k: MiddleCounter, town: Stop | undefined): string {
  const here = town && middleOf(town) === k ? town : undefined;
  const kt = KITCHENS.find((x) => x.id === k)!;
  const walks = kitchenWalks(k);
  const region = STOPS.filter((t) => middleOf(t) === k);
  const fry = [...new Set(region.flatMap((t) => fryerOf(t)))];
  const fountain = fountainFor(kt.region).map((d) => DRINK_LABEL[d]);
  const secs: Sec[] = [counterSec(k)];
  const sides: Sec = {
    id: "sides",
    chip: "Sides",
    icon: "fries",
    title: "Fryer and drinks here",
    lede: `Across ${regionIn(kt.region)}, the fryer makes ${and(fry.map((f) => FRY_LABEL[f].toLowerCase()))}.`,
    points: [
      ...fry.map((f) => `<b>${FRY_LABEL[f]}</b> (from ${STOPS.find((t) => middleOf(t) === k && fryerOf(t).includes(f))!.name}): ${FRY_NOTE[f]}`),
      ...(k === "comal" ? ["<b>Tostada shells</b>: a corn tortilla dropped in an empty basket."] : []),
      `The fountain pours two local drinks, <b>${fountain[0]}</b> and <b>${fountain[1]}</b>, beside ${and(fountain.slice(2))}.`,
    ],
    foot: `<button class="bv-btn sm ghost" data-goto="basics:fryer">${icon("fryer")}The fryer, step by step</button>`,
  };
  const dishes: Sec = {
    id: "dishes",
    chip: "Dishes",
    icon: "food-menu",
    title: `Dishes in ${regionIn(kt.region)}`,
    lede: "Each town adds to the menu. The capital has them all.",
    raw: dishList(k, here),
  };
  const today: Sec | null = here
    ? {
        id: "today",
        chip: "Today",
        icon: "food-menu",
        title: `Today in ${here.name}`,
        lede: "How each dish is built, bottom to top, with its counts.",
        raw: `<div class="hw-menu">${here.menu.map((r) => recipeHtml(r, 1, EVENTS.some((e) => e.special === r))).join("")}</div>
          ${getDeps() ? `<button class="bv-btn block" data-m="menuref">${icon("food-menu")}Sides, drinks and extras</button>` : ""}`,
      }
    : null;
  const chips = [secs[0], ...walks, sides, dishes, ...(today ? [today] : [])];
  return `<nav class="menu-chips" aria-label="Sections">${chips
    .map((s) => `<button class="bv-chip pill" data-jump="${s.id}">${icon("icon" in s ? s.icon : DISH_ICON[k])}${s.chip}</button>`)
    .join("")}</nav>
    ${secHtml(secs[0])}
    ${walks.map(walkHtml).join("")}
    ${secHtml(sides)}${secHtml(dishes)}${today ? secHtml(today) : ""}`;
}

function secHtml(s: Sec): string {
  const ic = s.art ? `<span class="hw-ic art">${s.art}</span>` : `<span class="hw-ic">${icon(s.icon)}</span>`;
  return `<section class="hw-sec" data-sec="${s.id}">
    <header class="hw-h">${ic}<div><h3 class="bv-title sm">${s.title}</h3><p class="hw-lede">${s.lede}</p></div></header>
    ${s.raw ?? `${s.fig ? `<figure class="hw-fig">${s.fig}</figure>` : ""}
    ${s.points?.length ? `<ul class="hw-pts">${s.points.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}`}
    ${s.foot ? `<div class="hw-foot">${s.foot}</div>` : ""}
  </section>`;
}

function listBody(secs: Sec[], end = ""): string {
  return `<nav class="menu-chips" aria-label="Sections">${secs.map((s) => `<button class="bv-chip pill" data-jump="${s.id}">${icon(s.icon)}${s.chip}</button>`).join("")}</nav>
    ${secs.map(secHtml).join("")}${end}`;
}

/* ---- the card -------------------------------------------------------------- */

const BASICS_IDS = ["basics", "hands", "orders", "stack", "undo", "sauce", "knife", "meters", "toppings", "fryer", "drinks", "serve"];
const TRIP_IDS = ["score", "pacing", "day", "trip", "garage", "prep"];

/** Where a target ("toppings", "comal", "kitchen:comal:tostada", "basics:drinks") lands. */
function resolve(target: string | undefined, home: MiddleCounter): { tab: Tab; kitchen: MiddleCounter; sec?: string } {
  if (!target) {
    const d = getDeps();
    const at = d?.inShift() ? d.counter?.() : undefined;
    if (at === "drinks") return { tab: "basics", kitchen: home, sec: "drinks" };
    if (at === "fryer") return { tab: "basics", kitchen: home, sec: "fryer" };
    return { tab: "kitchen", kitchen: home };
  }
  const [a, b, c] = target.split(":");
  const isK = (x: string | undefined): x is MiddleCounter => KITCHENS.some((k) => k.id === x);
  if (a === "kitchen") return { tab: "kitchen", kitchen: isK(b) ? b : home, sec: c };
  if (isK(a)) return { tab: "kitchen", kitchen: a, sec: b };
  if (a === "basics" || a === "trip") return { tab: a, kitchen: home, sec: b };
  if (a === "serve") return { tab: "basics", kitchen: home, sec: "stack" };
  if (a === "prep") return { tab: "trip", kitchen: home, sec: "day" };
  if (BASICS_IDS.includes(a)) return { tab: "basics", kitchen: home, sec: a };
  if (TRIP_IDS.includes(a)) return { tab: "trip", kitchen: home, sec: a };
  return { tab: "kitchen", kitchen: home };
}

function howToHtml(town: Stop | undefined, home: MiddleCounter, stacked: boolean, eyebrow: string): string {
  const pick = KITCHENS.map(
    (k) => `<button type="button" data-k="${k.id}" class="${k.id === home && town ? "here" : ""}" aria-pressed="false">${tabArt(k.label)}<span>${k.label}</span><small>${k.id === home && town ? "Here" : regionName(k.region)}</small></button>`,
  ).join("");
  const tabs: [Tab, string, string][] = [
    ["basics", "sparkle", "Basics"],
    ["kitchen", "spatula", "Kitchen"],
    ["trip", "map", "The trip"],
  ];
  const footer = `<p class="hw-end">${icon("truck")}That's the lot. Happy trails!<small>To play a guided shift again, turn on Tutorial mode in Settings, under Learning.</small></p>`;
  return `${modalHead({ icon: "help", title: "How to Play", stacked, eyebrow })}
    <style>${ART_KEYFRAMES}</style>
    <div class="hw-kpick" role="group" aria-label="Kitchens" hidden>${pick}</div>
    <div class="menu-body menu-scroll hw-body" data-tab="basics" hidden>${listBody(basicsSecs(town))}</div>
    ${KITCHENS.map((k) => `<div class="menu-body menu-scroll hw-body" data-tab="kitchen" data-k="${k.id}" hidden>${kitchenHtml(k.id, town)}</div>`).join("")}
    <div class="menu-body menu-scroll hw-body" data-tab="trip" hidden>${listBody(tripSecs(), footer)}</div>
    <nav class="hw-tabs" role="tablist" aria-label="How to Play">${tabs
      .map(([id, ic, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false">${icon(ic)}<span>${label}</span></button>`)
      .join("")}</nav>`;
}

/** Open How to Play, optionally at one place: "toppings", "comal", "kitchen:comal:tostada", "trip:garage". */
export function openHowTo(section?: string): void {
  if (modalOpen("howto")) return;
  const stacked = modalOpen();
  const d = getDeps();
  const town = d?.town();
  const home: MiddleCounter = town ? middleOf(town) : "grill";
  const eyebrow = modalOpen("menuref") ? "Menu" : d?.inShift() ? "Paused" : "Menu";
  const card = pushModal({ key: "howto", label: "How to Play", cls: "howto", html: howToHtml(town, home, stacked, eyebrow) });
  const bodies = [...card.querySelectorAll<HTMLElement>(".hw-body")];
  const pick = card.querySelector<HTMLElement>(".hw-kpick")!;
  bodies.forEach((b) => wireJumpChips(b));
  let kitchen: MiddleCounter = home;

  const show = (t: Tab, k: MiddleCounter, sec?: string) => {
    kitchen = k;
    let shown: HTMLElement | null = null;
    for (const b of bodies) {
      const on = b.dataset.tab === t && (t !== "kitchen" || b.dataset.k === k);
      b.hidden = !on;
      if (on) shown = b;
    }
    pick.hidden = t !== "kitchen";
    pick.querySelectorAll<HTMLElement>("[data-k]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    card.querySelectorAll<HTMLElement>(".hw-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    if (!shown) return;
    const body: HTMLElement = shown;
    if (sec) jumpTo(body, sec);
    // Let the jump chips and the scroll shadows catch up with the body that's now showing.
    body.dispatchEvent(new Event("scroll"));
  };

  card.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-m="close"]')) return popModal();
    const t = el.closest<HTMLElement>(".hw-tabs [data-tab]");
    if (t) return show(t.dataset.tab as Tab, kitchen);
    const k = el.closest<HTMLElement>(".hw-kpick [data-k]");
    if (k) return show("kitchen", k.dataset.k as MiddleCounter);
    const go = el.closest<HTMLElement>("[data-goto]");
    if (go) {
      const r = resolve(go.dataset.goto, home);
      return show(r.tab, r.kitchen, r.sec);
    }
    if (el.closest('[data-m="menuref"]')) {
      // Came here from the menu reference: just go back to it.
      if (modalOpen("menuref")) popModal();
      else openMenuRef();
    }
  });

  const r = resolve(section, home);
  show(r.tab, r.kitchen, r.sec);
}
