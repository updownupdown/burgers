/**
 * Component review page: ui.html. Every component in components.css is shown
 * with toggles for its states, its markup, and the icon set with a search box.
 * Nothing here ships in the game bundle.
 */
import "./library.css";
import { ICON_NAMES, ICONS, icon, type IconGroup } from "./icons";



type St = Set<string>;
interface Spec {
  name: string;
  code?: string;
  note?: string;
  stage?: "row" | "scene" | "scene bottom" | "";
  night?: boolean;
  states?: [string, string, boolean?][]; // key, label, default on
  render: (s: St) => string;
}
interface Section { id: string; title: string; blurb: string; grid?: "wide"; specs?: Spec[]; html?: () => string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const has = (s: St, k: string) => (s.has(k) ? k : "");
const pick = (s: St, keys: string[], fallback = "") => keys.find((k) => s.has(k)) ?? fallback;

/* ---- sample data ------------------------------------------------------- */
const ORDER = {
  id: 14, name: "Luau Stack", price: 13,
  mods: [["add", "+ Melted cheese"], ["remove", "No mustard"]] as const,
  sides: [["Fries", "L", true], ["Cola", "M", false]] as const,
  layers: [
    ["Toasted bun", "#f0b45a", "ok"], ["Patty, medium", "#7a3a22", "ok"], ["Melted cheese", "#ffcf3f", "add"],
    ["Grilled pineapple", "#ffe066", ""], ["Bacon", "#d9534f", ""], ["Mustard", "#f2c200", "remove"], ["Toasted bun", "#f0b45a", ""],
  ] as const,
};

function ticket(s: St, o = ORDER, slot = 1): string {
  const state = pick(s, ["active", "late", "served", "new"]);
  const pat = s.has("late") ? 0.12 : s.has("served") ? 1 : 0.62;
  const patCls = pat < 0.25 ? "low" : pat < 0.5 ? "mid" : "";
  return `<button class="bv-ticket ${state}" style="--slot:var(--bv-slot-${slot})" aria-pressed="${s.has("active")}">
  <span class="id"><span>#${o.id}</span>${s.has("late") ? icon("warning") : ""}</span>
  <span class="name">${o.name}</span>
  <span class="mods">${o.mods.map(([c, t]) => `<span class="${c}">${t}</span>`).join("")}</span>
  <span class="bv-patience ${patCls}"><i style="--p:${pat * 100}%"></i></span>
  <span class="sides">${o.sides.map(([n, sz, ok]) => `<span class="${ok ? "ok" : ""}"><span class="sz">${sz}</span>${n}</span>`).join("")}</span>
</button>`;
}

function ticketX(s: St): string {
  const wrong = s.has("wrong");
  return `<div class="bv-ticket-x">
  <div class="head"><span class="id">#${ORDER.id}</span><span class="name">${ORDER.name}</span><span class="price">$${ORDER.price}.00</span></div>
  <div class="mods">${ORDER.mods.map(([c, t]) => `<span class="bv-chip ${c}">${t}</span>`).join("")}</div>
  <div class="bv-eyebrow dir">From the bottom</div>
  <ol>${ORDER.layers.map(([n, c, st], i) => {
    const cls = wrong && i === 3 ? "wrong" : st;
    const note = cls === "add" ? "added" : cls === "remove" ? "hold" : cls === "wrong" ? "missing" : "";
    return `<li class="${cls}"><span class="sw" style="--c:${c}"></span><span>${n}</span>${note ? `<span class="note">${note}</span>` : ""}</li>`;
  }).join("")}</ol>
  <div class="foot">${ORDER.sides.map(([n, sz, ok]) => `<span class="bv-chip ${ok ? "ok" : ""}"><span class="bv-mono">${sz}</span> ${n}</span>`).join("")}</div>
</div>`;
}

function hud(s: St): string {
  const t = s.has("low") ? "0:19" : s.has("closed") ? "0:00" : "2:14";
  return `<div class="bv-hud">
  <span class="where"><b>Saltwater Bay</b><span class="bv-coords">36.6°N 121.9°W</span></span>
  <span class="sp"></span>
  <span class="num ${has(s, "low")} ${has(s, "closed")}">${icon("timer")}${t}</span>
  <span class="num">${icon("coin")}$48.25</span>
  <button class="bv-btn icon sm" aria-label="Pause">${icon("pause")}</button>
</div>`;
}

function tabs(s: St): string {
  const names: [string, string][] = [["Drinks", "tap"], ["Grill", "grill"], ["Fryer", "fryer"]];
  return `<nav class="bv-tabs">
  ${names.map(([n, ic], i) => `<button class="bv-tab" aria-selected="${i === 1}">${icon(ic)}${n}${i === 0 && s.has("dot") ? `<span class="bv-dot live"></span>` : ""}${i === 2 && s.has("badge") ? `<span class="bv-badge">2</span>` : ""}</button>`).join("")}
  <button class="bv-bell ${has(s, "armed")} ${has(s, "ring")}" aria-label="Ring the bell" ${s.has("disabled") ? "disabled" : ""}>${icon("bell")}</button>
</nav>`;
}

function stars(n: number, lg = false): string {
  return `<span class="bv-stars ${lg ? "lg" : ""}">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? "on" : i - 0.5 === n ? "half" : "off"}">${icon(i - 0.5 === n ? "star-half" : "star")}</span>`).join("")}</span>`;
}

/* ---- sections ---------------------------------------------------------- */
const SECTIONS: Section[] = [
  {
    id: "tokens", title: "Tokens", blurb: "Colour, type and spacing live in src/ui/tokens.css as CSS custom properties. Add .bv-night to any container for the dark variant.",
    html: () => {
      const colours = [
        ["--bv-paper", "Paper"], ["--bv-paper-2", "Paper 2"], ["--bv-paper-3", "Paper 3"], ["--bv-ink", "Ink"], ["--bv-ink-2", "Ink 2"], ["--bv-mute", "Mute"],
        ["--bv-rule", "Rule"], ["--bv-rule-2", "Rule 2"], ["--bv-paprika", "Paprika"], ["--bv-paprika-soft", "Paprika soft"], ["--bv-olive", "Olive"], ["--bv-olive-soft", "Olive soft"],
        ["--bv-amber", "Amber"], ["--bv-amber-soft", "Amber soft"], ["--bv-night", "Night"], ["--bv-slot-0", "Slot 0"], ["--bv-slot-1", "Slot 1"], ["--bv-slot-2", "Slot 2"],
      ];
      const cs = getComputedStyle(document.documentElement);
      return `<div class="spec"><h3>Colour</h3><div class="swatches">${colours.map(([v, n]) => `<div class="swatch"><i style="background:var(${v})"></i><b>${n}</b><code>${v} ${cs.getPropertyValue(v).trim()}</code></div>`).join("")}</div></div>
      <div class="spec"><h3>Type</h3>
        <div class="type-row"><code>.bv-title.lg · serif 40</code><span class="bv-title lg">Saltwater Bay</span></div>
        <div class="type-row"><code>.bv-title · serif 28</code><span class="bv-title">Stock the truck <i>today</i></span></div>
        <div class="type-row"><code>.bv-title.sm · serif 20</code><span class="bv-title sm">Luau Stack</span></div>
        <div class="type-row"><code>.bv-eyebrow · 11</code><span class="bv-eyebrow">Stop two of three</span></div>
        <div class="type-row"><code>body · Manrope 14</code><span class="bv-body">Surfers, lifeguards and one very bold crab. Keep them fed until closing time.</span></div>
        <div class="type-row"><code>.bv-caption · 12</code><span class="bv-caption">Minimum size during a shift.</span></div>
        <div class="type-row"><code>.bv-mono · 14</code><span class="bv-mono">$48.25 · 02:14 · 36.6°N 121.9°W</span></div>
        <div class="type-row"><code>.bv-quote · serif italic</code><span class="bv-quote">“Pineapple was perfect.”</span></div>
      </div>
      <div class="spec"><h3>Rules</h3><ol class="bv-body" style="margin:0;padding-left:18px;display:grid;gap:4px;font-size:13px">
        <li>One accent (paprika), only for changes to an order and the active thing.</li>
        <li>Serif only for names: towns, sandwiches, people. Never for instructions or numbers.</li>
        <li>Money, time and coordinates in the mono face, tabular.</li>
        <li>The theme (route, coordinates) appears only where the town does.</li>
        <li>Nothing read during a shift below 12px; touch targets 44px.</li>
      </ol></div>`;
    },
  },
  {
    id: "buttons", title: "Buttons", blurb: "Four kinds. Primary is ink on paper; accent (paprika) is for the one action that matters on a screen, usually serving or opening.",
    specs: [
      { name: "Primary", code: ".bv-btn.primary", stage: "row", states: [["disabled", "Disabled"], ["busy", "Busy"], ["icon", "With icon"], ["sm", "Small"], ["lg", "Large"]],
        render: (s) => `<button class="bv-btn primary ${has(s, "busy")} ${has(s, "sm")} ${has(s, "lg")}" ${s.has("disabled") ? "disabled" : ""}>${s.has("icon") ? icon("truck") : ""}Open the window</button>` },
      { name: "Secondary", code: ".bv-btn", stage: "row", states: [["disabled", "Disabled"], ["icon", "With icon"], ["sm", "Small"]],
        render: (s) => `<button class="bv-btn ${has(s, "sm")}" ${s.has("disabled") ? "disabled" : ""}>${s.has("icon") ? icon("map") : ""}Trip map</button>` },
      { name: "Accent", code: ".bv-btn.accent", stage: "row", states: [["disabled", "Disabled"], ["busy", "Busy"], ["block", "Full width"]],
        render: (s) => `<button class="bv-btn accent ${has(s, "busy")} ${has(s, "block")}" ${s.has("disabled") ? "disabled" : ""}>${icon("cart")}Place order · <span class="bv-mono">$64.50</span></button>` },
      { name: "Ghost", code: ".bv-btn.ghost", stage: "row", states: [["disabled", "Disabled"]],
        render: (s) => `<button class="bv-btn ghost ${has(s, "sm")}" ${s.has("disabled") ? "disabled" : ""}>Later</button><button class="bv-btn ghost sm">${icon("restart")}Restart shift</button>` },
      { name: "Icon buttons", code: ".bv-btn.icon", stage: "row", states: [["sm", "Small"], ["primary", "Primary"]],
        render: (s) => ["menu", "pause", "close", "sound-on", "help"].map((n) => `<button class="bv-btn icon ${has(s, "sm")} ${has(s, "primary")}" aria-label="${n}">${icon(n)}</button>`).join("") },
      { name: "Button row", code: ".bv-btn-row", states: [["inline", "Inline"]],
        render: (s) => `<div class="bv-btn-row ${has(s, "inline")}"><button class="bv-btn primary">Resume</button><button class="bv-btn">Restart shift</button><button class="bv-btn ghost">Sound: on</button></div>` },
      { name: "Night", code: ".bv-night .bv-btn", night: true, stage: "row", render: () => `<div class="bv-night" style="display:flex;gap:10px;flex-wrap:wrap"><button class="bv-btn primary">Open the window</button><button class="bv-btn">Trip map</button><button class="bv-btn accent">${icon("bell")}Serve</button></div>` },
    ],
  },
  {
    id: "chips", title: "Chips, badges, dots", blurb: "Chips carry order modifiers and sizes. Badges count things. Dots mark attention.",
    specs: [
      { name: "Modifier chips", code: ".bv-chip.add / .remove", stage: "row", render: () => `<span class="bv-chip add">+ Melted cheese</span><span class="bv-chip remove">No mustard</span><span class="bv-chip">Well done</span><span class="bv-chip add">Extra patty</span>` },
      { name: "Status chips", code: ".bv-chip.ok / .warn / .solid", stage: "row", states: [["pill", "Pill"]], render: (s) => `<span class="bv-chip ok ${has(s, "pill")}">${icon("check")}Served</span><span class="bv-chip warn ${has(s, "pill")}">${icon("warning")}Cooling</span><span class="bv-chip solid ${has(s, "pill")}">Rush hour</span><span class="bv-chip ${has(s, "pill")}">${icon("new")}New here</span>` },
      { name: "Size chips", code: ".bv-chip.size", stage: "row", render: () => `<span class="bv-chip size">S</span><span class="bv-chip size">M</span><span class="bv-chip size solid">L</span><span class="bv-chip">${icon("fries")}<span class="bv-mono">L</span> Fries</span>` },
      { name: "Badges and dots", code: ".bv-badge / .bv-dot", stage: "row", render: () => `<span class="bv-badge">2</span><span class="bv-badge">12</span><span class="bv-dot"></span><span class="bv-dot live"></span><span class="bv-dot olive"></span><span class="bv-dot amber"></span>` },
    ],
  },
  {
    id: "hud", title: "HUD", blurb: "The bar over the kitchen: town (serif) with coordinates, time and money in mono, pause. Low time turns paprika and the timer icon pulses.",
    grid: "wide",
    specs: [
      { name: "HUD bar", code: ".bv-hud", stage: "scene", states: [["low", "Under 30s"], ["closed", "Closed"]], render: (s) => hud(s) },
      { name: "HUD bar, night", code: ".bv-night .bv-hud", stage: "scene", night: true, render: () => `<div class="bv-night">${hud(new Set())}</div>` },
      { name: "Patience bar", code: ".bv-patience", states: [["thick", "Thick"]], render: (s) => [[0.9, ""], [0.45, "mid"], [0.15, "low"]].map(([p, c]) => `<div class="bv-patience ${c} ${has(s, "thick")}"><i style="--p:${(p as number) * 100}%"></i></div>`).join("") },
      { name: "Hint pill", code: ".bv-hint", stage: "scene", render: () => `<span class="bv-hint" style="justify-self:center">${icon("arrow-up")}Swipe up on the patty to flip it</span>` },
    ],
  },
  {
    id: "tickets", title: "Tickets", blurb: "Compact tickets sit over the customers, three across. Tapping one expands it to the full build, bottom bun first. Modifiers are paprika; held items are struck through.",
    grid: "wide",
    specs: [
      { name: "Ticket", code: ".bv-ticket", stage: "scene", states: [["active", "Active"], ["late", "Late"], ["served", "Served"], ["new", "Just arrived"]], render: (s) => `<div style="max-width:120px">${ticket(s)}</div>` },
      { name: "Ticket row", code: ".bv-ticket-row", stage: "scene", render: () => `<div class="bv-ticket-row">${ticket(new Set(), { ...ORDER, id: 13, name: "Boardwalk Basic", mods: [["remove", "No ketchup"]] as never, sides: [["Fries", "S", false]] as never }, 0)}${ticket(new Set(["active"]))}${ticket(new Set(["late"]), { ...ORDER, id: 15, name: "Tide Pool Melt", mods: [["add", "+ Extra patty"]] as never, sides: [["Lemonade", "L", false]] as never }, 2)}</div>` },
      { name: "Expanded ticket", code: ".bv-ticket-x", stage: "scene", states: [["wrong", "Something missing"]], render: (s) => ticketX(s) },
      { name: "Expanded ticket, night", code: ".bv-night .bv-ticket-x", stage: "scene", night: true, render: () => `<div class="bv-night">${ticketX(new Set())}</div>` },
    ],
  },
  {
    id: "tabs", title: "Tabs and bell", blurb: "Counter tabs with icons; the active one gets a paprika underline. The bell is ink, turns paprika when armed (after the first ring), and swings when rung.",
    grid: "wide",
    specs: [
      { name: "Tabs + bell", code: ".bv-tabs / .bv-tab / .bv-bell", stage: "scene bottom", states: [["dot", "Attention dot"], ["badge", "Badge"], ["armed", "Bell armed"], ["ring", "Ringing"], ["disabled", "Bell disabled"]], render: (s) => tabs(s) },
      { name: "Tabs, night", code: ".bv-night .bv-tabs", stage: "scene bottom", night: true, render: () => `<div class="bv-night">${tabs(new Set(["dot"]))}</div>` },
    ],
  },
  {
    id: "controls", title: "Form controls", blurb: "Settings, the stock-up screen and the menu editor use these. Everything is 44px tall to the thumb.",
    specs: [
      { name: "Toggle", code: ".bv-toggle", states: [["on", "On", true], ["disabled", "Disabled"], ["state", "Show state text"], ["sub", "Subtitle"]],
        render: (s) => `<button class="bv-toggle" role="switch" aria-checked="${s.has("on")}" ${s.has("disabled") ? "disabled" : ""}><span class="lbl">Luau Stack · <span class="bv-mono">$13</span>${s.has("sub") ? "<small>Sells well with surfers</small>" : ""}</span>${s.has("state") ? `<span class="state">${s.has("on") ? "On the menu" : "Off"}</span>` : ""}<span class="sw"></span></button>` },
      { name: "Segmented", code: ".bv-seg", states: [["compact", "Compact"], ["disabled", "One disabled"]],
        render: (s) => `<div class="bv-eyebrow" style="display:flex;justify-content:space-between"><span>Patties</span><span style="color:var(--bv-paprika)">Choice</span></div><div class="bv-seg ${has(s, "compact")}">${[["0.70", "Value"], ["1.10", "Choice"], ["1.80", "Prime"]].map(([p, n], i) => `<button aria-pressed="${i === 1}" ${i === 2 && s.has("disabled") ? "disabled" : ""}><b>$${p}</b>${n}</button>`).join("")}</div>` },
      { name: "Stepper", code: ".bv-stepper", states: [["min", "At minimum"]], render: (s) => `<div class="bv-stepper"><button aria-label="Less" ${s.has("min") ? "disabled" : ""}>${icon("minus")}</button><output>$9.00</output><button aria-label="More">${icon("plus")}</button></div>` },
      { name: "Checkbox", code: ".bv-check", states: [["on", "Checked", true]], render: (s) => `<button class="bv-check" role="checkbox" aria-checked="${s.has("on")}"><span class="box">${s.has("on") ? icon("check") : ""}</span>Toasted bun</button>` },
      { name: "Text field", code: ".bv-field", states: [["error", "Error"]], render: (s) => `<div class="bv-field ${has(s, "error")}"><label for="f1">Name this sandwich</label><input id="f1" type="text" value="The Crab Shack" />${s.has("error") ? `<span class="msg">That name is already on the menu.</span>` : ""}</div>` },
      { name: "Slider", code: ".bv-slider", render: () => `<div class="bv-meter"><div class="lbl"><span>Music</span><b>70%</b></div></div><input class="bv-slider" type="range" min="0" max="100" value="70" aria-label="Music volume" />` },
    ],
  },
  {
    id: "lists", title: "Lists and data", blurb: "Rows for menus and settings, a stat list for end-of-shift sums, the route for the stop card, a table for prices.",
    specs: [
      { name: "Rows", code: ".bv-row", states: [["selected", "One selected"], ["locked", "One locked"]],
        render: (s) => `<div class="bv-list">
<button class="bv-row ${has(s, "selected")}"><span class="lead">${icon("burger")}</span><span class="main"><b>Luau Stack</b><small>Pineapple, bacon, mustard</small></span><span class="trail">$13</span></button>
<button class="bv-row"><span class="lead">${icon("panini")}</span><span class="main"><b>Tide Pool Melt</b><small>New at this stop</small></span><span class="trail">$12</span></button>
<button class="bv-row ${has(s, "locked")}"><span class="lead">${icon(s.has("locked") ? "lock" : "smash")}</span><span class="main"><b>Mesa Smash</b><small>${s.has("locked") ? "Unlocks in Red Mesa" : "Smashed thin, extra crust"}</small></span><span class="trail mute">${icon("forward")}</span></button>
</div>` },
      { name: "Stats", code: ".bv-stats", render: () => `<dl class="bv-stats"><dt>Orders served</dt><dd>11 / 12</dd><dt>Tips</dt><dd class="up">+$8.50</dd><dt>Ingredients</dt><dd class="down">−$26.10</dd><dt>Wasted</dt><dd class="down">−$3.40</dd><div class="total" style="display:contents"><dt>Profit</dt><dd>$41.00</dd></div></dl>` },
      { name: "Route", code: ".bv-route", render: () => `<ol class="bv-route"><li class="done">${icon("mountain")}Pinecrest<span class="trail">4.1 ★</span></li><li class="current">${icon("wave")}Saltwater Bay<span class="trail">112 mi</span></li><li>${icon("cactus")}Red Mesa<span class="trail">Locked</span></li></ol>` },
      { name: "Price table", code: ".bv-table", render: () => `<table class="bv-table"><thead><tr><th>Item</th><th class="num">Cost</th><th class="num">Price</th></tr></thead><tbody><tr><td>Boardwalk Basic</td><td class="num">2.10</td><td class="num">8.00</td></tr><tr><td>Luau Stack</td><td class="num">3.45</td><td class="num">13.00</td></tr><tr><td>Tide Pool Melt</td><td class="num">3.05</td><td class="num">12.00</td></tr><tr class="total"><td>Average margin</td><td class="num"></td><td class="num">73%</td></tr></tbody></table>` },
    ],
  },
  {
    id: "rating", title: "Ratings and reviews", blurb: "Stars are amber, the one place that colour is allowed on paper. Reviews are set in the serif italic, as a quote.",
    specs: [
      { name: "Stars", code: ".bv-stars", states: [["lg", "Large"]], render: (s) => `${stars(4, s.has("lg"))}<br>${stars(2.5, s.has("lg"))}` },
      { name: "Rating", code: ".bv-rating", states: [["down", "Falling"]], render: (s) => `<div class="bv-rating"><span class="num">${s.has("down") ? "3.6" : "4.3"}</span><span class="meta">${stars(s.has("down") ? 3.5 : 4)}<span>38 reviews · <span class="delta ${s.has("down") ? "down" : "up"}">${s.has("down") ? "down 0.4" : "up 0.2"} since Pinecrest</span></span></span></div>` },
      { name: "Review", code: ".bv-review", render: () => `<div class="bv-review"><q>Pineapple was perfect. My cola ended up all over the counter though.</q><span class="who">${stars(4)}Dee, lifeguard</span></div><div class="bv-review"><q>Fast, hot, and the bun was toasted. I'll be back.</q><span class="who">${stars(5)}Marco, surfer</span></div>` },
      { name: "Score tiles", code: ".bv-score", render: () => `<div class="bv-score"><div><b>11/12</b><small>Served</small></div><div><b>$41</b><small>Profit</small></div><div><b>4.3</b><small>Rating</small></div></div>` },
      { name: "Meters", code: ".bv-meter", render: () => `<div class="bv-meter"><div class="lbl"><span>Popularity</span><b>62%</b></div><div class="bar"><i style="--p:62%"></i></div></div><div class="bv-meter accent"><div class="lbl"><span>Rush</span><b>High</b></div><div class="bar"><i style="--p:85%"></i></div></div><div class="bv-meter olive"><div class="lbl"><span>Freshness</span><b>Good</b></div><div class="bar"><i style="--p:70%"></i></div></div>` },
    ],
  },
  {
    id: "cards", title: "Cards and callouts", blurb: "The stop card, the between-shift card and the summary all use .bv-card. Callouts carry one short message with an icon.",
    grid: "wide",
    specs: [
      { name: "Stop card", code: ".bv-card", states: [["night", "Night"]], render: (s) => `<div class="${has(s, "night")}"><div class="bv-card">
<span class="bv-eyebrow">Stop two of three</span>
<h2 class="bv-title lg">Saltwater Bay</h2>
<p class="bv-body">Surfers, lifeguards and one very bold crab. Keep them fed until closing time.</p>
<div class="bv-callout new">${icon("new")}<span>New here: grilled pineapple. Grill one side until it's golden.</span></div>
<ol class="bv-route"><li class="done">${icon("mountain")}Pinecrest<span class="trail">4.1 ★</span></li><li class="current">${icon("wave")}Saltwater Bay<span class="trail">112 mi</span></li><li>${icon("cactus")}Red Mesa<span class="trail">Locked</span></li></ol>
<div class="bv-btn-row"><button class="bv-btn primary">${icon("truck")}Open the window</button><button class="bv-btn">${icon("map")}Trip map</button></div>
<p class="bv-caption bv-mono" style="text-align:center">Build ${__BUILD__} · Savings $132</p>
</div></div>` },
      { name: "Callouts", code: ".bv-callout", render: () => `<div class="bv-callout">${icon("info")}<span>Tap a ticket to see the full build.</span></div><div class="bv-callout new">${icon("sparkle")}<span>New here: smash burgers.</span></div><div class="bv-callout good">${icon("check-circle")}<span>Perfect stack. +$2 tip.</span></div><div class="bv-callout warn">${icon("warning")}<span>The grill is getting dirty.</span></div>` },
      { name: "Card variants", code: ".bv-card.inset / .outlined", render: () => `<div class="bv-card inset"><span class="bv-eyebrow">Inset</span><p class="bv-body">For a block inside another card.</p></div><div class="bv-card outlined"><span class="bv-eyebrow">Outlined</span><p class="bv-body">For a list of offers to pick from.</p></div>` },
    ],
  },
  {
    id: "overlays", title: "Overlays and feedback", blurb: "Toasts for the update banner, bubbles over customers, floating coins, doneness tags over the grill.",
    specs: [
      { name: "Toast", code: ".bv-toast", states: [["accent", "Accent"]], render: (s) => `<div class="bv-toast ${has(s, "accent")}">${icon("update")}<span>Build #16 is ready.</span><button class="bv-btn ghost">Later</button><button class="bv-btn primary">Update</button></div>` },
      { name: "Bubbles", code: ".bv-bubble", stage: "scene", render: () => `<div style="display:flex;gap:14px;flex-wrap:wrap;padding-top:8px"><span class="bv-bubble order">Luau Stack, please</span><span class="bv-bubble good">${icon("smile")} Perfect!</span><span class="bv-bubble bad">${icon("frown")} Too slow</span></div>` },
      { name: "Coins", code: ".bv-coin", stage: "scene", render: () => `<div style="display:flex;gap:16px"><span class="bv-coin">+$13</span><span class="bv-coin">+$2 tip</span><span class="bv-coin minus">−$3</span></div>` },
      { name: "Grill tags", code: ".bv-tag", stage: "scene", render: () => `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="bv-tag rare">${icon("flame")}Rare</span><span class="bv-tag medium">Medium</span><span class="bv-tag well">Well</span><span class="bv-tag burnt">${icon("warning")}Burnt</span><span class="bv-tag warm">${icon("warming-lamp")}Warm</span><span class="bv-tag mute">${icon("cup-stack")}3 left</span></div>` },
      { name: "Zone pill", code: ".bv-zone", stage: "scene", render: () => `<div style="display:flex;gap:8px"><span class="bv-zone" style="--c:#c8472e">${icon("flame")}Hot side</span><span class="bv-zone" style="--c:#c99a3a">Warm side</span></div>` },
      { name: "Scrim + sheet", code: ".bv-scrim / .bv-sheet", stage: "scene", render: () => `<div class="bv-scrim" style="position:absolute;inset:0;align-items:end;padding:0"><div class="bv-sheet" style="width:100%"><div class="grip"></div><h2 class="bv-title sm">Paused</h2><div class="bv-btn-row"><button class="bv-btn primary">${icon("play")}Resume</button><button class="bv-btn ghost sm">${icon("restart")}Restart shift</button></div></div></div>` },
    ],
  },
  {
    id: "screens", title: "Screens", blurb: "The pieces together, at phone size, to check that everything sits well over the kitchen.",
    html: () => `<div style="display:flex;gap:20px;flex-wrap:wrap">
<div class="phone-frame"><div class="scr bv">
  <div class="hudpos">${hud(new Set())}</div>
  <div class="tixpos"><div class="bv-ticket-row">${ticket(new Set(), { ...ORDER, id: 13, name: "Boardwalk Basic", mods: [["remove", "No ketchup"]] as never, sides: [["Fries", "S", false]] as never }, 0)}${ticket(new Set(["active"]))}${ticket(new Set(["late"]), { ...ORDER, id: 15, name: "Tide Pool Melt", mods: [["add", "+ Extra patty"]] as never, sides: [["Lemonade", "L", false]] as never }, 2)}</div></div>
  <div class="xpos">${ticketX(new Set())}</div>
  <div class="tabpos">${tabs(new Set(["dot", "armed"]))}</div>
</div></div>
<div class="phone-frame"><div class="scr bv bv-night" style="background:var(--bv-night)"><div style="padding:34px 14px 14px;height:100%;display:grid;align-content:space-between">
  <div class="bv-card flat" style="background:transparent;padding:0">
    <span class="bv-title lg" style="font-size:36px">Bun <i>Voyage</i></span>
    <span class="bv-eyebrow">A food truck, on the road</span>
    <hr class="bv-rule">
    <ol class="bv-route"><li class="done">${icon("mountain")}Pinecrest<span class="trail">4.1 ★</span></li><li class="current">${icon("wave")}Saltwater Bay<span class="trail">112 mi</span></li><li>${icon("cactus")}Red Mesa<span class="trail">Locked</span></li></ol>
    <span class="bv-eyebrow" style="margin-top:8px">Stop two of three</span>
    <h2 class="bv-title lg">Saltwater Bay</h2>
    <p class="bv-body">Surfers, lifeguards and one very bold crab.</p>
    <div class="bv-callout new">${icon("new")}<span>New here: grilled pineapple</span></div>
  </div>
  <div class="bv-btn-row"><button class="bv-btn primary">${icon("truck")}Open the window</button><button class="bv-btn">${icon("map")}Trip map</button><p class="bv-caption bv-mono" style="text-align:center">Build ${__BUILD__} · Savings $132</p></div>
</div></div></div>
<div class="phone-frame"><div class="scr bv" style="background:var(--bv-paper)"><div style="padding:34px 14px 14px;height:100%;display:grid;gap:10px;align-content:start;overflow:auto">
  <div><span class="bv-eyebrow">Saltwater Bay · before opening</span><h2 class="bv-title">Stock the truck</h2></div>
  <div class="bv-rating"><span class="num">4.3</span><span class="meta">${stars(4)}<span>38 reviews · <span class="delta up">up 0.2</span></span></span></div>
  <div class="bv-eyebrow" style="display:flex;justify-content:space-between"><span>Patties</span><span style="color:var(--bv-paprika)">Choice</span></div>
  <div class="bv-seg compact">${[["0.70", "Value"], ["1.10", "Choice"], ["1.80", "Prime"]].map(([p, n], i) => `<button aria-pressed="${i === 1}"><b>$${p}</b>${n}</button>`).join("")}</div>
  <div class="bv-eyebrow" style="display:flex;justify-content:space-between"><span>Buns</span><span style="color:var(--bv-paprika)">Bakery</span></div>
  <div class="bv-seg compact">${[["0.20", "Value"], ["0.45", "Bakery"], ["0.80", "Brioche"]].map(([p, n], i) => `<button aria-pressed="${i === 1}"><b>$${p}</b>${n}</button>`).join("")}</div>
  <button class="bv-toggle" role="switch" aria-checked="true"><span class="lbl">Boardwalk Basic · <span class="bv-mono">$8</span></span><span class="sw"></span></button>
  <button class="bv-toggle" role="switch" aria-checked="true"><span class="lbl">Luau Stack · <span class="bv-mono">$13</span></span><span class="sw"></span></button>
  <button class="bv-toggle" role="switch" aria-checked="false"><span class="lbl">Tide Pool Melt · <span class="bv-mono">$12</span><small>New at this stop</small></span><span class="sw"></span></button>
  <dl class="bv-stats"><dt>Cost per burger</dt><dd>$2.35</dd><dt>Quality</dt><dd class="up">+0.4 ★</dd></dl>
  <button class="bv-btn accent block">${icon("cart")}Place order · <span class="bv-mono">$64.50</span></button>
</div></div></div>
</div>`,
  },
];

/* ---- icons section ------------------------------------------------------ */
const GROUPS: [IconGroup, string, string][] = [
  ["system", "System", "Navigation, settings, the usual."],
  ["kitchen", "Kitchen", "Stations and tools."],
  ["food", "Food", "Ingredients and menu items."],
  ["trip", "Trip", "Road, stops, map, weather."],
  ["money", "Money", "Prices, stock, business mode."],
  ["feedback", "Feedback", "Ratings, moods, status."],
];

function iconsHtml(): string {
  return `<div class="spec"><div class="ico-tools">
    <input id="ico-q" type="search" placeholder="Search ${ICON_NAMES.length} icons" aria-label="Search icons" />
    <label>Size <input id="ico-sz" type="range" min="12" max="48" value="28" /> <span class="bv-mono" id="ico-szv">28</span></label>
    <label>Stroke <input id="ico-sw" type="range" min="1" max="2.5" step="0.25" value="1.75" /> <span class="bv-mono" id="ico-swv">1.75</span></label>
    <label><input id="ico-night" type="checkbox" /> Night</label>
    <span class="note" style="font-size:12px;color:var(--bv-mute);font-weight:600">Click an icon to copy <code>icon("name")</code>.</span>
  </div></div>
  <div class="spec"><h3>In context</h3><div class="stage row">
    <button class="bv-btn primary">${icon("grill")}Grill</button><button class="bv-btn">${icon("fryer")}Fryer</button><span class="bv-chip ok">${icon("check")}Served</span><span class="bv-tag burnt">${icon("flame")}Burnt</span><span class="bv-hint">${icon("spatula")}Flip</span>
  </div><h3>Sizes</h3><div class="ico-size">${[12, 16, 20, 24, 32, 48].map((n) => `<div>${icon("truck", { size: n + "px" })}<span>${n}</span></div>`).join("")}</div></div>
  <div id="ico-groups">${GROUPS.map(([g, t, b]) => `<div class="ico-group" data-g="${g}"><h3>${t} <span style="font-weight:600;letter-spacing:0;text-transform:none">· ${b}</span></h3><div class="ico-grid">${ICON_NAMES.filter((n) => ICONS[n].group === g).map((n) => `<button class="ico" data-n="${n}" data-t="${n} ${ICONS[n].tags ?? ""}" title="${ICONS[n].tags ?? ""}">${icon(n)}<span>${n}</span></button>`).join("")}</div></div>`).join("")}</div>`;
}

/* ---- render ------------------------------------------------------------- */
function specHtml(sec: Section, sp: Spec, idx: number): string {
  const id = `${sec.id}-${idx}`;
  const on: St = new Set((sp.states ?? []).filter((s) => s[2]).map((s) => s[0]));
  return `<div class="spec ${sp.night ? "night" : ""}" data-spec="${id}">
    <h3><span>${sp.name}</span>${sp.code ? `<code>${esc(sp.code)}</code>` : ""}</h3>
    <div class="stage bv ${sp.stage ?? ""}" data-stage>${sp.render(on)}</div>
    ${sp.states?.length ? `<div class="states">${sp.states.map(([k, l, d]) => `<label><input type="checkbox" data-k="${k}" ${d ? "checked" : ""}>${l}</label>`).join("")}</div>` : ""}
    ${sp.note ? `<p class="note">${sp.note}</p>` : ""}
    <details class="src"><summary>Markup</summary><pre class="html" data-src></pre></details>
  </div>`;
}

const root = document.getElementById("lib")!;
root.className = "lib";
root.innerHTML = `
<nav class="lib-nav">
  <div class="wm">Bun <i>Voyage</i></div>
  <div class="ver">Components · build ${__BUILD__}</div>
  ${SECTIONS.map((s) => `<a href="#${s.id}">${s.title}</a>`).join("")}
  <a href="#icons">Icons</a>
</nav>
<main class="lib-main bv">
  <div class="lib-top">
    <div><h1>Dusk components</h1><p>Every piece of the Bun Voyage UI with its states, so adjustments can be made here before they go in the game. Source: <code class="bv-mono">src/ui/</code>.</p></div>
    <div class="lib-globals">
      <label>Scale <input id="g-scale" type="range" min="0.8" max="1.4" step="0.05" value="1" /></label>
      <label><input id="g-night" type="checkbox" /> Night everywhere</label>
      <label><input id="g-outline" type="checkbox" /> Show tap targets</label>
    </div>
  </div>
  ${SECTIONS.map((sec) => `<section class="lib-sec" id="${sec.id}"><header><h2>${sec.title}</h2><p>${sec.blurb}</p></header>${sec.html ? sec.html() : `<div class="lib-grid ${sec.grid ?? ""}">${sec.specs!.map((sp, i) => specHtml(sec, sp, i)).join("")}</div>`}</section>`).join("")}
  <section class="lib-sec" id="icons"><header><h2>Icons</h2><p>${ICON_NAMES.length} icons on a 24px grid, 1.75px stroke, currentColor. <code>import { icon } from "./ui/icons"</code> then <code>icon("grill")</code>. To add one, add an entry to ICONS in <code>src/ui/icons.ts</code>; it appears here automatically.</p></header>${iconsHtml()}</section>
</main>`;

/* fill markup views */
function refreshSrc(el: Element) {
  const stage = el.querySelector("[data-stage]")!;
  const pre = el.querySelector("[data-src]")!;
  pre.textContent = stage.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, (m) => `{icon("${(m.match(/bv-icon-([\w-]+)/) ?? [])[1]}")}`).replace(/\n\s*\n/g, "\n").trim();
}
document.querySelectorAll(".spec[data-spec]").forEach(refreshSrc);

/* state toggles */
const specIndex = new Map<string, Spec>();
SECTIONS.forEach((sec) => sec.specs?.forEach((sp, i) => specIndex.set(`${sec.id}-${i}`, sp)));
root.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const spec = input.closest<HTMLElement>(".spec[data-spec]");
  if (spec && input.dataset.k) {
    const sp = specIndex.get(spec.dataset.spec!)!;
    const on: St = new Set([...spec.querySelectorAll<HTMLInputElement>("input[data-k]:checked")].map((i) => i.dataset.k!));
    spec.querySelector("[data-stage]")!.innerHTML = sp.render(on);
    refreshSrc(spec);
  }
});

/* interactive bits inside stages: toggles, segments, checks, tabs, tickets */
root.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const sw = t.closest<HTMLElement>(".bv-toggle[role=switch], .bv-check[role=checkbox]");
  if (sw && !t.closest(".lib-globals")) { sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")); if (sw.classList.contains("bv-check")) sw.querySelector(".box")!.innerHTML = sw.getAttribute("aria-checked") === "true" ? icon("check") : ""; }
  const seg = t.closest<HTMLElement>(".bv-seg button");
  if (seg) seg.parentElement!.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === seg)));
  const tab = t.closest<HTMLElement>(".bv-tab");
  if (tab) tab.parentElement!.querySelectorAll(".bv-tab").forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
  const bell = t.closest<HTMLElement>(".bv-bell");
  if (bell) { bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); bell.classList.toggle("armed"); }
  const tk = t.closest<HTMLElement>(".bv-ticket");
  if (tk && tk.parentElement?.classList.contains("bv-ticket-row")) tk.parentElement.querySelectorAll(".bv-ticket").forEach((b) => b.classList.toggle("active", b === tk));
  const ico = t.closest<HTMLElement>(".ico");
  if (ico) {
    const txt = `icon("${ico.dataset.n}")`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    ico.classList.add("copied"); setTimeout(() => ico.classList.remove("copied"), 900);
  }
});

/* globals */
const main = root.querySelector<HTMLElement>(".lib-main")!;
(document.getElementById("g-scale") as HTMLInputElement).addEventListener("input", (e) => { main.style.zoom = (e.target as HTMLInputElement).value; });
(document.getElementById("g-night") as HTMLInputElement).addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  root.querySelectorAll<HTMLElement>(".spec:not(.night) [data-stage], .lib-sec#screens .scr:not(.bv-night)").forEach((s) => s.classList.toggle("bv-night", on));
  root.querySelectorAll<HTMLElement>(".spec:not(.night)").forEach((s) => s.classList.toggle("night", on));
});
(document.getElementById("g-outline") as HTMLInputElement).addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  let st = document.getElementById("g-outline-css");
  if (!st) { st = document.createElement("style"); st.id = "g-outline-css"; st.textContent = `[data-stage] button, .scr button { outline: 1px dashed rgb(200 71 46 / .7) !important; outline-offset: -1px; }`; document.head.appendChild(st); }
  (st as HTMLStyleElement).disabled = !on;
});

/* icon tools */
const q = document.getElementById("ico-q") as HTMLInputElement;
q.addEventListener("input", () => {
  const v = q.value.trim().toLowerCase();
  root.querySelectorAll<HTMLElement>(".ico").forEach((b) => { b.hidden = !!v && !b.dataset.t!.toLowerCase().includes(v); });
  root.querySelectorAll<HTMLElement>(".ico-group").forEach((g) => { g.hidden = !g.querySelector(".ico:not([hidden])"); });
});
const sz = document.getElementById("ico-sz") as HTMLInputElement;
sz.addEventListener("input", () => { document.getElementById("ico-szv")!.textContent = sz.value; (document.getElementById("ico-groups") as HTMLElement).style.setProperty("--isz", sz.value + "px"); });
const swi = document.getElementById("ico-sw") as HTMLInputElement;
swi.addEventListener("input", () => { document.getElementById("ico-swv")!.textContent = swi.value; root.querySelectorAll<SVGElement>("#ico-groups svg").forEach((s) => s.setAttribute("stroke-width", swi.value)); });
(document.getElementById("ico-night") as HTMLInputElement).addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  root.querySelectorAll<HTMLElement>("#ico-groups .ico").forEach((b) => { b.classList.toggle("bv-night", on); b.style.background = on ? "var(--bv-paper)" : ""; b.style.color = on ? "var(--bv-ink)" : ""; });
});

/* nav highlight */
const links = [...root.querySelectorAll<HTMLAnchorElement>(".lib-nav a")];
const io = new IntersectionObserver((es) => {
  es.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id)); });
}, { rootMargin: "-10% 0px -80% 0px" });
root.querySelectorAll("section.lib-sec").forEach((s) => io.observe(s));
