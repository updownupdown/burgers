/**
 * How to Play: a skimmable guide, one short section per part of the kitchen and the trip,
 * each with a small drawing. It opens on its own (from the home screen) and inline in the
 * game menu's second tab.
 */
import { CROWD } from "../game/business";
import { DRINK_PRICE, EXTRA_PRICE, FRIES_PRICE } from "../game/menu";
import { HOLD_GRACE } from "../game/scoring";
import { DESSERT_PRICE } from "../game/dessert";
import type { Recipe } from "../game/stops";
import { COUNTED, FRIES_PORTION, FRIES_SCOOP, KIND_COLOR, KIND_LABEL, STANDARD_COUNT, type Kind, type Size } from "../game/types";
import { icon } from "../ui/icons";
import { getDeps, jumpTo, modalOpen, popModal, price, pushModal, wireJumpChips } from "./modal";
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

function cupSvg(step: "cup" | "ice" | "pour" | "lid" | "straw"): string {
  const body = "M9 16h22l-2.6 32H11.6z";
  const fill = step === "cup" || step === "ice" ? "" : `<path d="M10.1 26h19.8l-1.8 22H11.9z" class="liq"/>`;
  const ice = step === "cup" ? "" : `<rect x="13" y="${step === "ice" ? 38 : 28}" width="6" height="6" rx="1.2" class="ice"/><rect x="20" y="${step === "ice" ? 40 : 31}" width="6" height="6" rx="1.2" class="ice"/>`;
  const stream = step === "pour" ? `<rect x="18.8" y="2" width="2.4" height="24" rx="1.2" class="liq stream"/><path d="M14 4h12v4H14z" class="nozzle"/>` : "";
  const line = step === "pour" ? `<path d="M9.6 21h20.8" class="line"/>` : "";
  const lid = step === "lid" || step === "straw" ? `<path d="M7 16h26v-2.2c-4-3.6-22-3.6-26 0z" class="lid"/>` : "";
  const straw = step === "straw" ? `<path d="M22 13L27 1" class="straw"/>` : "";
  return `<svg class="hw-cup" viewBox="0 0 40 50" aria-hidden="true">${stream}${fill}${ice}<path d="${body}" class="cup"/>${line}${straw}${lid}</svg>`;
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
      lede: "Customers queue at the window. Cook what's on their receipt, stack it on their tray, swipe it up to them.",
      fig: `<ol class="hw-steps">
        <li>${icon("receipt")}<b>Read</b><span>the receipt</span></li>
        <li>${icon("grill")}<b>Cook</b><span>the food</span></li>
        <li>${icon("burger")}<b>Stack</b><span>on the tray</span></li>
        <li>${icon("arrow-up")}<b>Swipe up</b><span>to serve</span></li>
      </ol>
      <div class="hw-tabs" aria-hidden="true">
        <span>${icon("drink")}Drinks</span><span class="on">${icon("grill")}Grill</span><span>${icon("fryer")}Fryer</span><span>${icon("ice-cream")}Cold bar</span>
      </div>
      <p class="hw-cap">${icon("swap")}Tap a counter in the bottom bar, or swipe along the bar to move between them.</p>`,
      points: [
        "<b>Customers and trays stay put</b> while you switch counters, so you never lose an order.",
        "Most things are a <b>drag</b>: from a bin, the grill or a counter up to a tray.",
        "People wait in a <b>line</b> outside. When the window is empty the first steps up by themselves; otherwise <b>ring the bell twice</b> to call the next one. Serving more at once earns more, if you can keep up.",
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
        <div class="hw-match">
          <div class="hw-patty"><span class="lbl">On the grill</span>${donePill("medium", 0.45)}<svg viewBox="0 0 60 18" aria-hidden="true"><ellipse cx="30" cy="11" rx="26" ry="6" class="grillbar"/><ellipse cx="30" cy="8" rx="22" ry="6" fill="${KIND_COLOR.patty}"/></svg></div>
          <span class="hw-eq">${icon("check")}</span>
          <div class="hw-patty"><span class="lbl">On the receipt</span>${donePill("medium")}<span class="rc-mini">Trailhead Classic</span></div>
        </div>
        <p class="hw-cap">Same colour, same word. The bar fills as the patty moves through a level: take it off around the middle.</p>
      </div>`,
      points: [
        "Drag a patty onto a hot part of the grill. <b>Swipe up on it to flip</b>: each side cooks on its own, so cook both.",
        "The grill has <b>three zones</b>, each with a button on the front: tap it to go <b>off, warm, hot</b>. The strip along the front shows it in blue, orange or red. A shift starts hot, hot, off.",
        "<b>Smash:</b> press and hold a fresh patty to flatten it. Smashed patties cook fast and are always well done.",
        "<b>Melt:</b> drop a cheese slice on a patty while it's on the grill. They come off together.",
        "<b>Toast</b> buns face down. Bacon, eggs and pineapple grill too.",
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
        "<b>Sauce:</b> press a bottle in the caddy and drag it up onto a burger on the tray. The view zooms in; keep moving to squeeze and watch the bar on the right for Perfect. Let go and the bottle goes back.",
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
        <div class="lo"><b>Fewer</b><span>Saves money. May cost a review.</span></div>
        <div class="std"><b>Standard</b><span>Exactly right.</span></div>
        <div class="hi"><b>+1 or 2</b><span>Can win a better review.</span></div>
        <div class="paid"><b>Extra</b><span>On the receipt. They pay +${price(EXTRA_PRICE)}.</span></div>
      </div>`,
      points: [
        "Each drag puts <b>one piece</b> on the burger: count them as you go.",
        "<b>Extra</b> on a receipt means a bigger helping, and the customer pays a little more.",
        "Going light saves on ingredients, but customers notice. A little generosity can tip a good review into a great one; a pile of pickles won't.",
      ],
      foot: `<button class="bv-btn sm ghost" data-goto="menu">${icon("menu-book")}Counts for every recipe</button>`,
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
      lede: "Five steps, always in this order.",
      fig: `<ol class="hw-drink">
        <li>${cupSvg("cup")}<b>Cup</b><span>S · M · L</span></li>
        <li>${cupSvg("ice")}<b>Ice</b><span>optional</span></li>
        <li>${cupSvg("pour")}<b>Pour</b><span>hold</span></li>
        <li>${cupSvg("lid")}<b>Lid</b></li>
        <li>${cupSvg("straw")}<b>Straw</b></li>
      </ol>`,
      points: [
        `Take a cup of the right size from the front row: <b>S, M or L</b> (${price(DRINK_PRICE.S)} to ${price(DRINK_PRICE.L)}). Stand it anywhere on the counter, or straight under a nozzle; you can move a cup any time.`,
        "Add ice from the ice bin unless the receipt says <b>No ice</b>.",
        "<b>Hold</b> the drink's button on top of the fountain to pour. A bar on the left shows the level: let go at <b>Perfect</b>. Overflowing leaves a spill: <b>wipe it</b> before that nozzle takes another cup.",
        "Snap on a <b>lid of the cup's size</b>, add a <b>straw</b>, then drag the drink up to the tray.",
        "When a stack of cups (or the fryer's cartons) runs out, a fresh <b>sleeve</b> stands in its place: <b>tap it twice</b> to tear it open.",
      ],
    },
    {
      id: "coldbar",
      chip: "Cold bar",
      icon: "ice-cream",
      title: "Cold bar",
      lede: "Soft serve in a cone, or blended into a shake. Most people come back for one on its own.",
      fig: `<div class="hw-sup">
        <span>${icon("ice-cream")}<b>Cone or tin</b><small>under a nozzle</small></span>${arrow}
        <span class="taps"><i class="tapfx" aria-hidden="true"></i><b>Hold + circle</b><small>one loop, one ring</small></span>${arrow}
        <span class="stack">${icon("tray")}<b>To the tray</b><small>it melts there</small></span>
      </div>`,
      points: [
        "Take a <b>cone</b> or a steel <b>shake tin</b> from the front and stand it under a nozzle: <b>vanilla</b> on the left, the <b>region's flavour</b> on the right.",
        "<b>Press the handle</b> above it and, still holding, <b>circle your finger</b> round the cone. Each loop lays a ring: <b>three</b> is a perfect cone. Wander off centre and it leans.",
        "<b>Shakes:</b> two or three rings in a tin, then hang it on the <b>mixer</b> and <b>hold</b> the mixer. The bar on the left shows the blend: let go in the band. Drag the tin to the tray and it's poured into a cup.",
        `Soft serve <b>melts</b> on the tray, so make it last, just before you serve. A cone is ${price(DESSERT_PRICE.cone)}, a shake ${price(DESSERT_PRICE.shake)}.`,
      ],
    },
    {
      id: "serve",
      chip: "Serving",
      icon: "arrow-up",
      title: "Serving",
      lede: "Swipe a tray up to hand it to the customer above it.",
      fig: `<div class="hw-serve">
        <div class="plates"><i></i><i class="on"></i><i></i></div>
        <div class="hw-swipe">${icon("arrow-up")}</div>
      </div>
      <ol class="hw-verdicts">
        <li><b>Looks good</b><span>They take it and pay. The better it is, the more they pay and tip.</span></li>
        <li><b>Sent back</b><span>Clearly off: they hand it back with what's wrong. Fix it and swipe it up again; this time they take it, and review what they got.</span></li>
        <li><b>Refused</b><span>Really wrong: no sale, and they leave.</span></li>
      </ol>`,
      points: [
        "Check the receipt first: a forgotten side or drink costs stars.",
        "To fix a burger, <b>drag down</b> off its tray to lift the top layer: drop it in the trash slot, back on the grill, or on another tray.",
        "Held items light up the <b>trash slot</b> red when a drop would bin them.",
        "<b>Unordered extras</b>, like fries or a drink they didn't ask for, can soften a bad review, and nobody ever turns down a freebie. They cost you, so save them for rescues.",
        "The bell shows how many are in line. Waiting has its own patience: the back of the line drifts off first, and people nearly at the window almost never leave. An order's patience only starts once they've ordered.",
        "A truck nobody knows yet draws a small crowd, and strangers won't join a long line. Good shifts spread the word; <b>social media</b> on the town sheet buys a busier day.",
        "How picky customers are, how patient, how many may stand at the window and how busy the line gets depends on the <b>Difficulty</b> setting in the menu.",
      ],
    },
    {
      id: "score",
      chip: "Stars",
      icon: "star",
      title: "Stars and tips",
      lede: "Every order earns 0 to 3 stars, and pays more the better it is.",
      fig: `<div class="hw-score">
        <span class="bv-stars lg">${[0, 1, 2].map(() => `<span class="on">${icon("star")}</span>`).join("")}</span>
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
        "<b>Pass a shift</b> by serving at least half your customers with an average of 1 star or more. Passing earns a truck upgrade.",
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
        <span>${icon("moon")}<b>Within range</b><small>Tonight, a little gas</small></span>
        <span>${icon("sun")}<b>Further away</b><small>A whole day, gas by distance</small></span>
      </div>
      <div class="hw-cal" aria-label="A town's calendar">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<span class="${d === 2 ? "today" : ""} ${d === 5 ? "ev" : ""}"><b class="bv-mono">${d}</b>${d === 5 ? "<i>Fair</i>" : ""}</span>`).join("")}</div>
      <p class="hw-cap">${icon("calendar")}A town's week ahead: today is day 2, and there's a fair on day 5.</p>`,
      points: [
        "Towns are dots joined by roads. Work <b>3 shifts</b> in a town to open the roads to its neighbours.",
        `${icon("moon")} After a shift the map goes dark. Roads <b>within tonight's range</b> (100 miles to start) glow, and you can hop along them before you sleep. An engine tune-up from a city's supply yard stretches the range.`,
        `${icon("sun")} Going <b>further</b> takes a whole day on the road, and gas costs more the further you drive. Sleeping costs <b>$10</b> a night for the generator; a roof solar panel trims it.`,
        `${icon("calendar")} <b>Tap a town</b> to see its crowd and calendar. Events (markets, fairs, rodeos) bring bigger crowds and sometimes a special recipe.`,
        `${icon("critic")} A <b>critic</b> may order; their receipt is marked. A great review lands in the paper or on TV and raises your <b>popularity</b>, which brings customers and lets you charge more.`,
      ],
      foot: `<p class="hw-sub">Who turns up</p><ul class="hw-crowds">${crowdLine}</ul>`,
    },
    {
      id: "biz",
      chip: "Complexity",
      icon: "chart",
      title: "Complexity",
      lede: "Simple cooks and serves. Balanced and Complex run the books as well as the grill.",
      fig: `<div class="hw-biz">
        <span class="bv-eyebrow">Ingredients</span>
        <div class="bv-seg compact" aria-hidden="true"><button tabindex="-1">Budget</button><button tabindex="-1" aria-pressed="true">Standard</button><button tabindex="-1">Premium</button></div>
        <span class="bv-eyebrow">Prices</span>
        <div class="bv-seg compact" aria-hidden="true"><button tabindex="-1">Low</button><button tabindex="-1" aria-pressed="true">Fair</button><button tabindex="-1">High</button></div>
      </div>`,
      points: [
        "At <b>Balanced</b> or <b>Complex</b>, pick <b>ingredient quality</b>, <b>prices</b> and <b>today's menu</b> on the Prep screen before each shift. Complex opens the ledger too.",
        "Better food rates higher; higher prices bring fewer, pickier customers. Premium at high prices rates like standard at fair.",
        "Ingredients, cups and spills all cost money, so waste shows in your profit.",
        "Reviews build a <b>reputation</b> that follows the truck from town to town. Change complexity any time in Settings; stepping down keeps your reputation and upgrades for later.",
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
    icon: "menu-book",
    title: town ? `The menu in ${town.name}` : "The menu",
    lede: "How each burger is built, bottom to top, with its topping counts.",
    fig: "",
    points: [],
    raw: `<div class="hw-std"><span class="bv-eyebrow">Standard counts</span><div>${counts}</div></div>
      ${town ? `<div class="hw-menu">${town.menu.map((r) => recipeHtml(r, d?.priceMult?.() ?? 1, false)).join("")}</div>
      <button class="bv-btn block" data-m="menuref">${icon("menu-book")}Sides, drinks and extras</button>` : ""}`,
  };
}

export function howToHtml(): string {
  const secs = [...sections(), menuSec()];
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
    html: `<header class="menu-head">
        ${stacked ? `<button class="bv-btn icon sm ghost menu-back" data-m="close" aria-label="Back">${icon("back")}</button>` : ""}
        <div class="menu-headtext"><span class="bv-eyebrow">Bun Voyage</span><h2 class="bv-title">How to Play</h2></div>
        ${stacked ? "" : `<button class="bv-btn icon sm ghost menu-x" data-m="close" aria-label="Close">${icon("close")}</button>`}
      </header>
      <div class="menu-body menu-scroll">${howToHtml()}</div>`,
  });
  const body = card.querySelector<HTMLElement>(".menu-body")!;
  mountHowTo(body);
  card.querySelectorAll('[data-m="close"]').forEach((b) => b.addEventListener("click", () => popModal()));
  if (section) jumpTo(body, section);
}
