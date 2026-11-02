/**
 * How to Play: a skimmable guide, one short section per part of the kitchen and the trip,
 * each with a small drawing. It opens on its own (from the home screen) and inline in the
 * game menu's second tab.
 */
import { CROWD } from "../game/business";
import { RANGE_MI } from "../game/day";
import { DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "../game/menu";
import { GREAT } from "../game/bonus";
import { PASS_STARS } from "../game/progress";
import { HOLD_GRACE } from "../game/scoring";
import { opinionFace } from "../ui/faces";
import { fryerOf, type Recipe } from "../game/stops";
import { COUNTED, FRIES_PORTION, FRIES_SCOOP, KIND_COLOR, KIND_LABEL, STANDARD_COUNT, type Kind, type Size } from "../game/types";
import { icon } from "../ui/icons";
import { getDeps, jumpTo, modalHead, modalOpen, popModal, price, pushModal, wireJumpChips } from "./modal";
import { openMenuRef, recipeHtml, stackArt } from "./menuref";

interface Sec {
  id: string;
  /** Chip label in the index. */
  chip: string;
  icon: string;
  title: string;
  lede: string;
  fig: string;
  points: string[];
  /** Optional footer (links). */
  foot?: string;
  /** Free-form body in place of the drawing and points. */
  raw?: string;
}

/* ---- small drawings ------------------------------------------------------- */

function face(mood: "calm" | "worried" | "fuming"): string {
  const mouth = mood === "calm" ? "M8.6 14.2c1.9 1.6 4.9 1.6 6.8 0" : mood === "worried" ? "M9 15.4h6" : "M8.6 16c1.9-1.8 4.9-1.8 6.8 0";
  const brows = mood === "fuming" ? `<path d="M7.4 8.2l3 1.3M16.6 8.2l-3 1.3"/>` : mood === "worried" ? `<path d="M7.6 9.2l2.8-1M16.4 9.2l-2.8-1"/>` : "";
  return `<svg class="hf ${mood}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><g><circle cx="9.2" cy="11.2" r="1.1"/><circle cx="14.8" cy="11.2" r="1.1"/>${brows}<path d="${mouth}"/></g></svg>`;
}

/** The doneness pill, as on the grill (with progress) and on receipts (without). */
export function donePill(level: "raw" | "rare" | "medium" | "well" | "burnt", progress?: number): string {
  const label = { raw: "Raw", rare: "Rare", medium: "Med", well: "Well", burnt: "Burnt" }[level];
  const bar = progress == null ? "" : `<i style="--p:${Math.round(progress * 100)}%"></i>`;
  return `<span class="dn-pill ${level}"><span>${label}</span>${bar}</span>`;
}

const arrow = `<span class="hw-arrow" aria-hidden="true">${icon("forward")}</span>`;

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

/** A worked example for the stacking drawing. */
const EXAMPLE: Recipe = { name: "Trailhead Classic", price: 9, layers: ["bun", "ketchup", "patty", "lettuce", "tomato", "bun"], toasted: true };

/** The panini example: a Caprese, pressed. */
const PANINI: Recipe = { name: "Caprese", price: 10, layers: ["ciabatta", "pesto", "mozzarella", "tomato", "basil", "ciabatta"], toasted: true, panini: true, melt: true, counts: { mozzarella: 3, tomato: 3 } };

/** Two press bays: one open with bread on its ribbed plate, one shut with its meter in front. */
function pressSvg(): string {
  const INK = `stroke="#2a2622" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;
  const ribs = (x: number, y: number, w: number) => [0, 1, 2, 3].map((i) => `<path d="M${x + 3} ${y + 2 + i * 3}h${w - 6}" stroke="#5a6064" stroke-width="1"/>`).join("");
  return `<svg class="hw-press" viewBox="0 0 168 84" aria-hidden="true">
    <g>
      <path d="M8 22 6 4h64l-2 18z" fill="#c9cfcd" ${INK}/>
      <path d="M10 6h56" stroke="#2a2622" stroke-width="1" opacity=".3"/>
      <path d="M4 3h68" stroke="#2a2622" stroke-width="5" stroke-linecap="round"/><path d="M4 3h68" stroke="#d8573a" stroke-width="3" stroke-linecap="round"/>
      <rect x="6" y="44" width="64" height="26" rx="3" fill="#aab3b1" ${INK}/>
      <rect x="10" y="34" width="56" height="12" rx="1.5" fill="#2f3336" ${INK}/>${ribs(10, 34, 56)}
      <rect x="20" y="31" width="36" height="9" rx="3" fill="#f0d49a" ${INK}/>
      <path d="M26 33.5h4M34 35.5h5M44 33.5h4" stroke="#c49a55" stroke-width="1.2"/>
    </g>
    <g>
      <rect x="96" y="44" width="64" height="26" rx="3" fill="#aab3b1" ${INK}/>
      <rect x="98" y="30" width="60" height="15" rx="4" fill="#c9cfcd" ${INK}/>
      <path d="M104 41h48" stroke="#e8b25c" stroke-width="2.4"/>
      <path d="M94 46h68" stroke="#2a2622" stroke-width="5" stroke-linecap="round"/><path d="M94 46h68" stroke="#d8573a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="152" cy="62" r="2.4" fill="#ff9a2a" ${INK}/>
      <path d="M112 26c-1.4-1.8 1.4-3 0-5M124 24c-1.4-1.8 1.4-3 0-5M136 26c-1.4-1.8 1.4-3 0-5" fill="none" stroke="#9aa0a0" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="104" y="74" width="48" height="8" rx="4" fill="#2c2f33" stroke="#0f1012" stroke-width="1.2"/>
      <rect x="104" y="74" width="30" height="8" rx="4" fill="#e9a64a"/>
    </g>
    <path d="M80 20v22" stroke="#2a2622" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 3"/>
    <path d="M76 36l4 6 4-6" fill="none" stroke="#2a2622" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** The panini press, for the Sunny Coast (DESIGN §24). */
function pressSec(): Sec {
  return {
    id: "press",
    chip: "Press",
    icon: "panini",
    title: "The panini press",
    lede: "On the Sunny Coast the grill makes way for a clamshell press. Both sides cook at once.",
    fig: `${pressSvg()}
      <div class="hw-stack">${stackArt(PANINI)}<p class="hw-cap">A Caprese: ciabatta, pesto, mozzarella ×3, tomato ×3, basil, ciabatta. Built bread first, then pressed.</p></div>`,
    points: [
      "<b>Build the sandwich</b> bread first, right in an <b>open bay</b>, on the tray or on the board. With the top slice on, drag down on the tray to lift the whole sandwich into a bay.",
      "<b>Pull the handle down</b> to close the lid. It only closes on a bread or a patty on its own, or a sandwich with bread top and bottom. The lid hides the food, so watch the <b>meter on the lid</b>: pale, golden with press lines, then dark. <b>Swipe the handle up</b> to lift the lid, then drag the panini back to the tray.",
      "The cheese inside melts while it's shut, and a little <b>oozes out</b> at the front when it has.",
      "<b>Chicken and veggie patties</b> are pressed on their own first, until their meter says done, then go in the sandwich and back in the press.",
      "<b>Avocado Toast</b> is open-faced: press only the sourdough, then add the avocado and rocket on the tray. The avocado never goes in the press.",
      "The <b>tuna well</b>: each tap is one scoop onto the active tray. Pesto and aioli squeeze from the bottles like any sauce.",
      "In <b>Harbor City</b> there's a third bay and a cutting board: drop a finished panini on the board and <b>swipe across it</b> to cut it in half before it goes out.",
    ],
  };
}

const TACOS: Recipe = { name: "Street Tacos", price: 10, layers: ["corn", "pork", "onion", "cilantro", "lime"], toasted: true, dish: "tacos", counts: { corn: 3, pork: 3, onion: 1 } };

/** A tortilla on the comal, its edge dragged across its middle into a half moon. */
function foldSvg(): string {
  return `<svg class="hw-svg" viewBox="0 0 160 90" aria-hidden="true">
    <rect x="6" y="18" width="148" height="56" rx="8" fill="#2f3335" stroke="#2a2622" stroke-width="1.6"/>
    <rect x="104" y="18" width="50" height="56" rx="0" fill="#ffb04a" opacity=".12"/>
    <ellipse cx="44" cy="46" rx="26" ry="20" fill="#f3e2b8" stroke="#2a2622" stroke-width="1.6"/>
    <g fill="#f6d77a"><rect x="34" y="40" width="14" height="3" rx="1.5"/><rect x="40" y="47" width="12" height="3" rx="1.5"/><rect x="30" y="50" width="10" height="3" rx="1.5"/></g>
    <path d="M44 66c0-10 0-20 0-30" stroke="#2a2622" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 3"/>
    <path d="M30 60c8-2 14-10 26-18" fill="none" stroke="#3f7fd0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M52 38l5 3-2 6" fill="none" stroke="#3f7fd0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M96 30h0a26 20 0 0 1 0 40z" fill="#ebc98a" stroke="#2a2622" stroke-width="1.6"/>
    <path d="M96 30v40" stroke="#2a2622" stroke-width="1.6"/>
    <path d="M120 52c2 0 3 2 2 4" fill="none" stroke="#f4c54a" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

const FLATBREAD: Recipe = { name: "Harvest Red", price: 10, layers: ["dough", "redsauce", "mozzarella", "basil"], toasted: true, pie: "flatbread", melt: true, counts: { mozzarella: 4 } };

/** The deck oven from above: brick back and side walls, the element glowing along the back, a pie nudged round by the peel's corner. */
function ovenSvg(): string {
  const INK = `stroke="#2a2622" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
  return `<svg class="hw-svg" viewBox="0 0 160 90" aria-hidden="true">
    <rect x="10" y="6" width="140" height="56" rx="2" fill="#dcc8a4" ${INK}/>
    <rect x="10" y="6" width="140" height="10" fill="#c8664a" ${INK}/>
    <rect x="10" y="6" width="10" height="56" fill="#b05e40" ${INK}/>
    <rect x="140" y="6" width="10" height="56" fill="#b05e40" ${INK}/>
    <path d="M20 11h120M45 6v5M70 6v5M95 6v5M120 6v5" stroke="#e7c9a8" stroke-width="1"/>
    <rect x="20" y="16" width="120" height="14" fill="#ffa860" opacity=".35"/>
    <rect x="22" y="16.5" width="116" height="3" rx="1.5" fill="#ff8a2a"/>
    <text x="80" y="27" text-anchor="middle" font-size="6.5" font-weight="800" fill="#8a3a10">HOT WALL</text>
    <ellipse cx="72" cy="42" rx="24" ry="13" fill="#f1dcaa" ${INK}/>
    <path d="M48 42a24 13 0 0 1 48 0z" fill="#d99a48"/>
    <ellipse cx="72" cy="42" rx="18" ry="9" fill="#c8402a"/>
    <g fill="#fbf6e6"><circle cx="65" cy="41" r="2.4"/><circle cx="75" cy="45" r="2.4"/><circle cx="79" cy="38" r="2.2"/></g>
    <path d="M76 54h26v8H76z" fill="#d9ad74" ${INK}/>
    <path d="M89 62v24" stroke="#b98a54" stroke-width="4" stroke-linecap="round"/>
    <path d="M106 58h16M118 54l4 4-4 4" fill="none" stroke="#3f7fd0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M100 31a28 16 0 0 1 0 20" fill="none" stroke="#3f7fd0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M97 28l3 3-4 2" fill="none" stroke="#3f7fd0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="14" y="70" width="52" height="8" rx="4" fill="#2c2f33" stroke="#0f1012" stroke-width="1.2"/>
    <rect x="14" y="70" width="34" height="8" rx="4" fill="#e3ad5a"/>
    <rect x="120" y="68" width="36" height="12" rx="4" fill="#ffd99a" ${INK}/><text x="138" y="77" text-anchor="middle" font-size="7" font-weight="800" fill="#6b3a00">↻ Nudge</text>
  </svg>`;
}

/** The deck oven, for Orchard Isle (DESIGN §24, phase 4; the peel after build #69). */
function ovenSec(board: boolean, fritters: boolean): Sec {
  return {
    id: "oven",
    chip: "Oven",
    icon: "flame",
    title: "The oven and the peel",
    lede: "On Orchard Isle the grill makes way for a deck oven, its back wall glowing hot. Flatbreads are built on the peel, and only the peel moves them.",
    fig: `${ovenSvg()}
      <div class="hw-stack">${stackArt(FLATBREAD)}<p class="hw-cap">Harvest Red: dough, tomato sauce, mozzarella ×4, then basil after the oven.</p></div>`,
    points: [
      "<b>Tap the dough</b> to lay a base on the peel. <b>Hold the ladle</b> in the pot and spread the sauce in a spiral out to the crust (white bases get a drizzle of olive oil instead). Then the toppings: tap a pan for one piece, or drag them on.",
      "<b>Drag the peel by its handle</b> into the oven and <b>swipe down</b> to slide the pie off onto the deck. To lift a pie, slide the blade right under it and <b>swipe up</b>. Swipe down over the <b>bench</b> to set one aside, or let go and the peel goes back where it lies.",
      "The half facing the <b>hot back wall</b> bakes <b>twice as fast</b>. The meter under the pie shows its <b>paler half</b>; when it says <b>Nudge</b>, set the peel's tip against the front of the pie and slide it sideways to <b>spin it round</b>. Once, about halfway, is right.",
      "Left as it is, the hot side <b>scorches</b>. Turned just right, both halves come out even, with <b>leopard spots</b> on the crust: a small bonus.",
      "To serve, lift it out on the peel, carry it up to a tray and <b>swipe down</b>. <b>Mushrooms</b> want the longer bake. <b>Basil, rocket and honey go on after</b>, at the tray (honey squeezes like any sauce).",
      ...(board ? ["In <b>Port Amber</b>: a third spot in the oven, the <b>Calzone</b> (fold it on the peel by dragging the dough's edge across the middle, then <b>nudge it round twice</b>), and the board in the bench's place: set a flatbread on it and <b>swipe across it twice</b> to cut it in four."] : []),
      `At the fryer, drop the <b>zucchini</b> in the <b>batter bowl</b>, then pick it up again for the basket; salt the fritti in the carton.${fritters ? " <b>Apple fritters</b> fry like fries and get cinnamon sugar from the sugar shaker." : ""}`,
    ],
  };
}

/** The comal, for Red Rock (DESIGN §24, phase 3). */
function comalSec(tpress: boolean): Sec {
  return {
    id: "comal",
    chip: "Comal",
    icon: "flame",
    title: "The comal",
    lede: "In Red Rock the grill makes way for a comal: one long steel plate, hot on the left two thirds and warm on the right end. No buttons to set.",
    fig: `${foldSvg()}
      <div class="hw-stack">${stackArt(TACOS)}<p class="hw-cap">Street Tacos: 3 corn tortillas, a scoop of pork in each, onion, cilantro and a lime wedge.</p></div>`,
    points: [
      "<b>Tortillas</b> warm on the hot side in about 6 seconds: pale and stiff, then <b>soft with brown spots</b> (done), then hard. Watch the meter under each one. Park finished ones on the warm end.",
      "<b>Tacos</b>: drag each warm tortilla up to the tray; it stands in the rack. Each <b>tap on the pork or bean well</b> is one scoop onto the tray, one per taco; the toppings go on once.",
      "<b>Quesadilla</b>: a flour tortilla on the comal, cheese on it, then <b>fold it</b>: press its edge and drag across the middle. <b>Flip it once</b>, and take it off when the cheese has melted, before the shell goes dark. Forgot something? <b>Press and hold</b> it to unfold it.",
      "<b>Pineapple</b> chars on the comal like on the grill; flick it to flip. Eggs crack on the hot side: flip once for over easy.",
      "<b>Tostadas</b> come from the fryer: drop a corn tortilla in an empty basket and lower it. The fryer also makes <b>chips</b> from the tortilla wedges, and nachos get jalapeños and queso where a poutine gets curds and gravy.",
      ...(tpress ? ["In <b>Sun Valley</b> there's a <b>tortilla press</b>: hold it down to flatten a ball of masa, then drag the tortilla to the comal. Hand-pressed tortillas earn a $2 tip. Churros come from the fryer: shake sugar on them."] : []),
    ],
  };
}

/* ---- the guide ------------------------------------------------------------ */

function sections(): Sec[] {
  const counted = [...COUNTED];
  const count = (k: Kind) => STANDARD_COUNT[k] ?? 1;
  const crowdLine = (Object.keys(CROWD) as (keyof typeof CROWD)[]).map((c) => `<li><b>${CROWD[c].label}</b> ${CROWD[c].blurb.replace(/\.$/, "").toLowerCase()}</li>`).join("");
  return [
    {
      id: "basics",
      chip: "Basics",
      icon: "sparkle",
      title: "The basics",
      lede: "Customers queue at the window. Cook what's on their receipt, stack it on their tray, tap Serve.",
      fig: `<ol class="hw-steps">
        <li>${icon("receipt")}<b>Read</b><span>the receipt</span></li>
        <li>${icon("grill")}<b>Cook</b><span>the food</span></li>
        <li>${icon("burger")}<b>Stack</b><span>on the tray</span></li>
        <li>${icon("arrow-up")}<b>Swipe up</b><span>to serve</span></li>
      </ol>
      <div class="hw-nav" aria-hidden="true">
        <span class="b">${icon("drink")}</span><span class="chute"></span><span class="b lit">${icon("fryer")}</span>
      </div>
      <p class="hw-cap">${icon("swap")}The round buttons at the edges take you to the next counter; a glowing ring means it needs you. You can also swipe along the trash chute with empty hands.</p>`,
      points: [
        "<b>Customers and trays stay put</b> while you switch counters, so you never lose an order.",
        "Most things are a <b>drag</b>: from a bin, the grill or a counter up to a tray.",
        "People wait in a <b>line</b> outside. When the window is empty the first steps up by themselves; otherwise <b>ring the bell</b> to call the next one (a quick double ring still calls one; pause a moment before calling another). Serving more at once earns more, if you can keep up.",
      ],
    },
    {
      id: "orders",
      chip: "Orders",
      icon: "receipt",
      title: "Orders",
      lede: "Each customer's receipt hangs on the rail under them.",
      fig: `<div class="hw-order">
        <div class="hw-railwrap">
          <div class="hw-rail" aria-hidden="true"></div>
          <div class="hw-receipt">
            <span class="rc-id bv-mono">#12</span>
            <b class="rc-name">Trailhead Classic</b>
            <span class="rc-row">${donePill("medium")}<em class="rc-n">1</em></span>
            <span class="rc-mod">+ Extra pickles<em class="rc-n">2</em></span>
            <span class="rc-side"><i class="sz">M</i>Fries<em class="rc-n">3</em></span>
            <span class="rc-side"><i class="sz">S</i>Water <span class="no">No ice</span></span>
          </div>
        </div>
        <ol class="hw-keys">
          <li><em class="rc-n">1</em>How to cook the patty</li>
          <li><em class="rc-n">2</em>Changes from the recipe</li>
          <li><em class="rc-n">3</em>Sides, size first</li>
        </ol>
      </div>
      <div class="hw-moods">
        <span class="mood calm">${face("calm")}<b>Calm</b></span>${arrow}
        <span class="mood worried">${face("worried")}<b>Worried</b></span>${arrow}
        <span class="mood fuming">${face("fuming")}<b>Fuming</b></span>
      </div>`,
      points: [
        "<b>Tap a receipt</b> (or its tray) to make that order the active one. Tap it again to see every layer.",
        "The face is their patience: <b>calm, worried, then fuming</b>. Fuming customers walk off without paying.",
        "Lines in paprika are changes: <b>No onion</b>, <b>Extra cheese</b>, <b>+ Bacon</b>. Items tick off as they land on the tray.",
        "Now and then someone wants <b>just a drink or just fries</b>. Their tray has no plate: no burger needed.",
      ],
    },
    {
      id: "grill",
      chip: "Grill",
      icon: "grill",
      title: "The grill",
      lede: "Patties cook slowly. Put them on early, then go do something else.",
      fig: `<div class="hw-dn">
        <div class="hw-dnrow">${donePill("rare", 0.5)}${donePill("medium", 0.5)}${donePill("well", 0.5)}${donePill("burnt")}</div>
        <p class="hw-cap">Every patty goes out <b>Medium</b>. Rare or Well will do, but customers notice; Burnt won't. The bar fills as the patty moves through a level.</p>
      </div>`,
      points: [
        "Drag a patty onto a hot part of the grill. <b>No flipping:</b> it cooks through on one side. Take it off when its tag says <b>Medium</b>.",
        "The grill has <b>three zones</b>, each with a button on the front: tap it to go <b>off, warm, hot</b>. The strip along the front shows it in blue, orange or red. A shift starts hot, hot, off.",
        "<b>Smash:</b> press and hold a fresh patty to flatten it. Smashed patties cook fast.",
        "<b>Melt:</b> drop a cheese slice on a patty while it's on the grill. They come off together.",
        "<b>Toast</b> buns face down. Bacon and pineapple grill too.",
        "<b>Eggs:</b> tap one in the tray to pick it up, then tap it on the grill to crack it. A quick, crisp tap opens it in one; otherwise tap again. Then drop the <b>shells in the trash</b>.",
        "A <b>warm</b> zone barely cooks and keeps food hot: park finished food there. Food on an off zone doesn't cook at all.",
      ],
    },
    {
      id: "stack",
      chip: "Stacking",
      icon: "burger",
      title: "Stacking",
      lede: "Build on the customer's tray, from the bottom bun up. A plate on the tray means they ordered a burger.",
      fig: `<div class="hw-stack">
        ${stackArt(EXAMPLE)}
        <ol class="hw-layers" reversed>${[...EXAMPLE.layers].reverse().map((k, i) => `<li><span class="bv-mono">${EXAMPLE.layers.length - i}</span><i class="swc" style="--c:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]}${COUNTED.has(k) ? ` <b class="bv-mono">×${count(k)}</b>` : ""}</li>`).join("")}</ol>
        <span class="hw-up">${icon("arrow-up")}<small>Build up</small></span>
      </div>
      <div class="hw-lamp">
        <span class="lampic">${icon("clock")}</span>
        <div><b>Waiting on the tray</b><span>Cooked food keeps for about ${HOLD_GRACE} s, then goes cold: the bar along the tray shows it</span><i class="q" aria-hidden="true"></i></div>
      </div>`,
      points: [
        "<b>Drag</b> ingredients up onto the active tray, or <b>flick</b> them up to toss them on.",
        "<b>Sauce:</b> press a bottle in the caddy and drag it up onto a burger on the tray. The view zooms in; keep moving to squeeze and watch the bar on the right for Perfect. Let go and the bottle goes back. In a hurry? <b>Tap</b> the bottle for a quick, rougher squeeze.",
        "Wrong layer? <b>Swipe down</b> on the tray to take the top one off. Mistakes go down the garbage chute.",
        "Cooking ahead? Leave finished food on a <b>warm</b> grill zone rather than on the tray, where it goes cold.",
      ],
    },
    {
      id: "toppings",
      chip: "Toppings",
      icon: "pickle",
      title: "Toppings",
      lede: "Sliced toppings go on one piece at a time, and every recipe has a count.",
      fig: `<ul class="hw-counts">${counted
        .map((k) => `<li><i class="swc" style="--c:${KIND_COLOR[k]}"></i><span>${KIND_LABEL[k]}</span><span class="pcs ${k}" style="--c:${KIND_COLOR[k]}">${"<b></b>".repeat(count(k))}</span><b class="bv-mono">×${count(k)}</b></li>`)
        .join("")}</ul>
      <p class="hw-cap">The standard count. Some recipes differ: check the Menu.</p>
      <div class="hw-scale">
        <div class="lo"><b>Fewer</b><span>Customers notice. May cost a review.</span></div>
        <div class="std"><b>Standard</b><span>Exactly right.</span></div>
        <div class="hi"><b>+1 or 2</b><span>Can win a better review, but comes off your takings.</span></div>
        <div class="paid"><b>Extra</b><span>On the receipt. They pay +${price(EXTRA_PRICE)}.</span></div>
      </div>`,
      points: [
        "Each drag puts <b>one piece</b> on the burger: count them as you go.",
        "<b>Extra</b> on a receipt means a bigger helping, and the customer pays a little more.",
        "Going light saves on ingredients, but customers notice. A little generosity can tip a good review into a great one; a pile of pickles won't.",
      ],
      foot: `<button class="bv-btn sm ghost" data-goto="menu">${icon("food-menu")}Counts for every recipe</button>`,
    },
    {
      id: "fryer",
      chip: "Fryer",
      icon: "fries",
      title: "The fryer",
      lede: "Scoop, lower, watch the meter, lift, pack, salt.",
      fig: `<div class="hw-scoops">${(["S", "M", "L"] as Size[])
        .map((s) => `<div><span class="dots">${"<i></i>".repeat(scoops(s))}</span><span class="cap">${scoops(s)} scoop${scoops(s) > 1 ? "s" : ""}</span>${carton(s)}<b><span class="bv-chip size">${s}</span> <span class="bv-mono">${price(FRIES_PRICE[s])}</span></b></div>`)
        .join("")}</div>
      <div class="hw-fz">
        <div class="fz-labels" aria-hidden="true"><span>Under</span><span>Just right</span><span>Over</span></div>
        <div class="fz-bar" role="img" aria-label="Cook bar: under, just right, over, with a line marking perfect">
          <span class="z under"></span><span class="z right"></span><span class="z over"></span>
          <i class="fz-line"></i><i class="fz-mark"></i>
        </div>
        <svg class="fz-curve" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 33 L100 25 L100 18 Q140 14 150 2 Q160 14 200 18 L200 25 L300 33 L300 34 L0 34Z" class="area"/>
          <path d="M0 33 L100 25 L100 18 Q140 14 150 2 Q160 14 200 18 L200 25 L300 33" class="ln"/>
        </svg>
        <p class="hw-cap fz-legend"><span>${face("worried")}</span>Customer happiness peaks at the line, and drops off within each zone too.<span>${face("calm")}</span></p>
      </div>
      <div class="hw-poutine">
        <span>${icon("fries")}Fries</span><b>+</b><span><i class="curd"></i>Cheese curds</span><b>+</b><span><i class="gravy"></i>Gravy</span><span class="eq"><b>=</b><span class="out">Poutine</span></span>
      </div>`,
      points: [
        "Drag <b>1, 2 or 3 scoops</b> of frozen fries into a basket for a small, medium or large.",
        "The basket waits for you: <b>tap it to lower</b> it into the oil, and tap again to lift. Fries take <b>about half a minute</b>, so get them going while the patties cook.",
        "Lift when the marker on the fryer's meter is on the line: the fryer <b>beeps</b> from perfect until you lift the basket. <b>Under</b> is soggy, <b>over</b> is burnt.",
        "Put an empty carton on a pad and <b>pack the fries</b> into it.",
        "<b>Salt:</b> hold the shaker over the carton and <b>shake it</b>. A bar on the left shows how salty they are: stop at <b>Perfect</b>. None tastes flat, too much is worse.",
        "Then drag the carton to the tray.",
        "<b>Poutine</b> is a meal of its own: fries in a carton, then cheese curds, then gravy.",
      ],
    },
    {
      id: "drinks",
      chip: "Drinks",
      icon: "drink",
      title: "Drinks",
      lede: "Four steps, always in this order.",
      fig: `<ol class="hw-drink">
        <li>${cupSvg("cup")}<b>Cup</b><span>S · M · L</span></li>
        <li>${cupSvg("ice")}<b>Ice</b><span>optional</span></li>
        <li>${cupSvg("pour")}<b>Pour</b><span>hold</span></li>
        <li>${cupSvg("lid")}<b>Lid</b></li>
      </ol>`,
      points: [
        `Take a cup of the right size from the front row: <b>S, M or L</b> (${price(DRINK_PRICE.S)} to ${price(DRINK_PRICE.L)}). Stand it anywhere on the counter, or straight under a nozzle; you can move a cup any time.`,
        "Add ice from the ice bin unless the receipt says <b>No ice</b>.",
        "<b>Hold</b> the drink's button on top of the fountain to pour. A bar on the left shows the level: let go at <b>Perfect</b>. Overflowing leaves a spill: <b>wipe it</b> before that nozzle takes another cup.",
        "Snap on a <b>lid of the cup's size</b>, then drag the drink up to the tray.",
      ],
    },
    {
      id: "serve",
      chip: "Serving",
      icon: "arrow-up",
      title: "Serving",
      lede: "When everything on the receipt is on a tray, a Serve button pops up on it: tap it (or swipe the tray up) to hand it over.",
      fig: `<div class="hw-serve">
        <div class="plates"><i></i><i class="on"></i><i></i></div>
        <div class="hw-swipe">${icon("arrow-up")}</div>
      </div>
      <ol class="hw-verdicts">
        <li><b>Looks good</b><span>They take it and pay. The better it is, the more they pay and tip.</span></li>
        <li><b>Sent back</b><span>Clearly off: they hand it back with what's wrong. Fix it and serve it again; this time they take it, and review what they got.</span></li>
        <li><b>Refused</b><span>Really wrong: no sale, and they leave.</span></li>
      </ol>`,
      points: [
        "Check the receipt first: a forgotten side or drink costs stars.",
        "To fix a burger, tap <b>undo</b> on its tray to bin the top layer, or <b>drag down</b> off the tray to lift it: drop it in the trash slot, back on the grill, or on another tray.",
        "Held items light up the <b>trash slot</b> red when a drop would bin them.",
        "<b>Unordered extras</b>, like fries or a drink they didn't ask for, can soften a bad review, and nobody ever turns down a freebie. They come off your takings, so save them for rescues.",
        "The bell shows how many are in line. Waiting has its own patience: the back of the line drifts off first, and people nearly at the window almost never leave. An order's patience only starts once they've ordered.",
        "A truck nobody knows yet draws a small crowd, and strangers won't join a long line. Good shifts spread the word, and a good rating brings a few more.",
        "How picky customers are, how patient, how many may stand at the window and how busy the line gets depends on the <b>Pacing</b> you pick on Prep &amp; Open.",
      ],
    },
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
          <li>${icon("check")}Doneness, toast and melt</li>
          <li>${icon("check")}Topping counts</li>
          <li>${icon("check")}Sides and drinks</li>
          <li>${icon("check")}A neat, fresh stack</li>
          <li>${icon("coin")}Fast <i>and</i> good: a tip</li>
        </ul>
      </div>`,
      points: [
        "<b>Tips</b> come from good food served before the customer gets worried.",
        "As they go, every customer shows a <b>face</b> for what they thought. They only say something when it's specific: a missing item, what was wrong, or that it was especially quick or good.",
        "Only some leave a <b>review</b>, the stars that pop up over their head. The delighted and the disappointed write in most; critics always do. Your <b>rating</b> is the average of every review.",
        `<b>Pass a shift</b> by serving at least half your customers with an average of ${PASS_STARS} stars or more.`,
        `A <b>great shift</b> (a ${GREAT.stars}★ average with almost everyone served) unlocks that town's <b>bonus</b>. Every town has its own.`,
      ],
    },
    {
      id: "trip",
      chip: "Road trip",
      icon: "map",
      title: "The road trip",
      lede: "Drive from town to town, and plan your route around events.",
      fig: `<svg class="hw-map" viewBox="0 0 300 116" role="img" aria-label="Three shifts in a town open the roads to its neighbours">
        <path d="M54 58 L150 24" class="road"/><path d="M54 58 L150 92" class="road"/>
        <path d="M150 24 L252 58" class="road locked"/><path d="M150 92 L252 58" class="road locked"/>
        <circle cx="54" cy="58" r="11" class="node here"/>
        <circle cx="54" cy="58" r="3.4" class="here-dot"/>
        <circle cx="150" cy="24" r="8" class="node"/><circle cx="150" cy="92" r="8" class="node"/>
        <circle cx="252" cy="58" r="9" class="node locked"/>
        <g class="pips">${[0, 1, 2].map((i) => `<circle cx="${44 + i * 10}" cy="80" r="3.6"/>`).join("")}</g>
        <text x="54" y="98" class="nl" text-anchor="middle">3 shifts here</text>
        <text x="54" y="38" class="nl" text-anchor="middle">You</text>
        <text x="172" y="28" class="nl">Open</text>
        <text x="172" y="96" class="nl">Open</text>
        <text x="252" y="84" class="nl" text-anchor="middle">Locked</text>
        <path d="M248.5 57v-2.2a3.5 3.5 0 0 1 7 0V57M247 57h10v6h-10z" class="lock"/>
      </svg>
      <div class="hw-drive">
        <span>${icon("moon")}<b>One road</b><small>Tonight, before you sleep</small></span>
        <span>${icon("sun")}<b>Further away</b><small>A whole day on the road</small></span>
      </div>
      <div class="hw-cal" aria-label="A town's calendar">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<span class="${d === 2 ? "today" : ""} ${d === 5 ? "ev" : ""}"><b class="bv-mono">${d}</b>${d === 5 ? "<i>Fair</i>" : ""}</span>`).join("")}</div>
      <p class="hw-cap">${icon("calendar")}A town's week ahead: today is day 2, and there's a fair on day 5.</p>`,
      points: [
        "Towns are dots joined by roads. Work <b>3 shifts</b> in a town to open the roads to its neighbours.",
        `${icon("moon")} After a shift the map goes dark. Roads <b>within tonight's range</b> (${RANGE_MI} miles, any one road) glow, and you can hop along them before you sleep.`,
        `${icon("sun")} Going <b>further</b> takes a whole day on the road, with no shift that day.`,
        `${icon("calendar")} <b>Tap a town</b> to see its crowd and calendar. Events (markets, fairs, rodeos) bring bigger crowds and sometimes a special recipe.`,
        `${icon("critic")} A <b>critic</b> may order; their receipt is marked. A great review lands in the paper or on TV and raises your <b>popularity</b>, which brings more customers.`,
      ],
      foot: `<p class="hw-sub">Who turns up</p><ul class="hw-crowds">${crowdLine}</ul>`,
    },
    {
      id: "prep",
      chip: "Prep & Open",
      icon: "bell",
      title: "Prep & Open",
      lede: "Before each shift: who to expect, what's on the menu, when to open, and one bonus.",
      fig: `<div class="hw-biz">
        <span class="bv-eyebrow">Expect today</span>
        <b class="bv-mono" style="font-size:28px">~12 customers</b>
        <span class="bv-eyebrow">Pacing</span>
        <div class="bv-seg compact" aria-hidden="true"><button tabindex="-1">Chill</button><button tabindex="-1" aria-pressed="true">Balanced</button><button tabindex="-1">Stressful</button></div>
      </div>`,
      points: [
        "How many people come depends on your <b>popularity</b> (who has heard of you) and your <b>rating</b> (what they say), both earned by cooking well.",
        "A longer <b>menu</b> brings more people and more kinds of order; hide recipes to keep it simple.",
        "Drag the <b>shift</b> slider to open early or close late: lunch peaks from noon to one, with quieter hours either side. A shift is at least four hours.",
        "Every burger on the menu can be ordered all day; the taller ones come up more as the shift goes on. Tap the chevron on a burger to read its recipe.",
        "<b>Pacing</b> and your <b>bonus</b> are set here and stay put for the whole shift. Bring one bonus at most.",
        "<b>Takings</b> are your score for the shift: orders, plus tips for speed, less anything you gave away free. They go into your <b>savings</b>.",
        "Spend savings in the <b>Garage</b> (the truck button by Settings): unlocked bonuses, and looks for the truck that show on the map and at night.",
      ],
    },
  ];
}

/** The last section: today's recipes with their counts, as in the Menu. */
function menuSec(): Sec {
  const d = getDeps();
  const town = d?.town();
  const counts = [...COUNTED].map((k) => `<span class="bv-chip pill"><i class="swc" style="--c:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]} <b class="bv-mono">×${STANDARD_COUNT[k] ?? 1}</b></span>`).join("");
  return {
    id: "menu",
    chip: "Menu",
    icon: "food-menu",
    title: town ? `The menu in ${town.name}` : "The menu",
    lede: town?.press ? "How each panini is built, bottom to top, with its filling counts." : "How each burger is built, bottom to top, with its topping counts.",
    fig: "",
    points: [],
    raw: `<div class="hw-std"><span class="bv-eyebrow">Standard counts</span><div>${counts}</div></div>
      ${town ? `<div class="hw-menu">${town.menu.map((r) => recipeHtml(r, 1, false)).join("")}</div>
      <button class="bv-btn block" data-m="menuref">${icon("food-menu")}Sides, drinks and extras</button>` : ""}`,
  };
}

export function howToHtml(): string {
  const all = sections();
  // On the Sunny Coast the press section follows the grill's (and the menu shows paninis).
  if (getDeps()?.town()?.press) all.splice(all.findIndex((x) => x.id === "grill") + 1, 0, pressSec());
  // In Red Rock the comal's follows it.
  const comal = getDeps()?.town()?.comal;
  if (comal) all.splice(all.findIndex((x) => x.id === "grill") + 1, 0, comalSec(!!comal.tpress));
  // On Orchard Isle the oven's.
  const town = getDeps()?.town();
  if (town?.oven) all.splice(all.findIndex((x) => x.id === "grill") + 1, 0, ovenSec(town.oven.board, fryerOf(town).includes("fritters")));
  const secs = [...all, menuSec()];
  return `<nav class="menu-chips" aria-label="Sections">${secs.map((s) => `<button class="bv-chip pill" data-jump="${s.id}">${icon(s.icon)}${s.chip}</button>`).join("")}</nav>
  ${secs
    .map(
      (s) => `<section class="hw-sec" data-sec="${s.id}">
      <header class="hw-h"><span class="hw-ic">${icon(s.icon)}</span><div><h3 class="bv-title sm">${s.title}</h3><p class="hw-lede">${s.lede}</p></div></header>
      ${s.raw ?? `<figure class="hw-fig">${s.fig}</figure>
      <ul class="hw-pts">${s.points.map((p) => `<li>${p}</li>`).join("")}</ul>`}
      ${s.foot ? `<div class="hw-foot">${s.foot}</div>` : ""}
    </section>`,
    )
    .join("")}
  <p class="hw-end">${icon("truck")}That's the lot. Happy trails!</p>`;
}

/** Wire a body holding howToHtml(): jump chips, and the links out of the guide. */
export function mountHowTo(body: HTMLElement): void {
  wireJumpChips(body);
  if (!getDeps()) body.querySelectorAll('[data-m="menuref"]').forEach((b) => b.remove());
  body.addEventListener("click", (e) => {
    const goto = (e.target as HTMLElement).closest<HTMLElement>("[data-goto]");
    if (goto) {
      const sec = body.querySelector<HTMLElement>(`[data-sec="${goto.dataset.goto}"]`);
      const bar = body.querySelector<HTMLElement>(".menu-chips");
      if (sec) body.scrollTo({ top: sec.offsetTop - (bar?.offsetHeight ?? 0) - 6, behavior: "smooth" });
      return;
    }
    if (!(e.target as HTMLElement).closest('[data-m="menuref"]')) return;
    // Came here from the menu reference: just go back to it.
    if (modalOpen("menuref")) popModal();
    else openMenuRef();
  });
}

/** Open How to Play on its own, optionally at one section ("grill", "toppings"...). */
export function openHowTo(section?: string): void {
  if (modalOpen("howto")) return;
  const stacked = modalOpen();
  const card = pushModal({
    key: "howto",
    label: "How to Play",
    cls: "howto",
    html: `${modalHead({ icon: "help", title: "How to Play", stacked, eyebrow: "Menu" })}
      <div class="menu-body menu-scroll">${howToHtml()}</div>`,
  });
  const body = card.querySelector<HTMLElement>(".menu-body")!;
  mountHowTo(body);
  card.querySelectorAll('[data-m="close"]').forEach((b) => b.addEventListener("click", () => popModal()));
  if (section) jumpTo(body, section);
}
