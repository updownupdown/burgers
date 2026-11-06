import { CROWD } from "../game/business";
import { expectedCustomers, regionShifts } from "../game/day";
import { savedPacing, type Difficulty } from "../game/difficulty";
import { todaysClosing, type Closing, type Save } from "../game/progress";
import { ratingPull, reviewAverage } from "../game/reviews";
import { EVENTS, eventOn, FINAL_TOWN, nextDay, STOPS, townById, withEvent, type Stop } from "../game/stops";
import { applyTrip, miles, openedBy, planTrip, SHIFTS_TO_UNLOCK, unlockProgress, type Trip } from "../game/travel";
import { icon } from "../ui/icons";
import { logoStack } from "../ui/logo";
import { simLevel } from "../game/devmode";
import { dropBack, pushBack } from "./nav";
import { townBonus } from "../game/bonus";
import { buyBonus, readyToBuy } from "../game/garage";
import { truckSvg as truckArt } from "./truckart";
import { dollars } from "./garage";
import { modalClosedAt } from "./modal";
import { openReport } from "./report";
import { renderMap, roadPath, routePoints, SEA, townPoint, VIEW, LAND_BOX } from "./map";
import { PanZoom } from "./panzoom";
import { tripNo } from "../game/finale";
import { signatureOf } from "../game/identity";
import { openTripCard } from "./finale";
import { openBook, townStamps } from "./postcards";
import "./home.css";

/**
 * The home screen: a full-screen road map with the truck's numbers always in view. Tap a town
 * for its sheet (crowd, upcoming events, shifts worked, the drive there). The map has two
 * states (see game/day.ts): in the morning it is daylight and the dock leads to Prep and the
 * shift; in the evening it goes dark, every open town is lit (any of them is one drive away), and
 * the dock leads to a drive or sleep, and the dashboard's Results brings back today's report card.
 */

export interface HomeDeps {
  save: Save;
  /** The Prep screen, then the shift, in the current town. */
  startShift(): void;
  /** Popularity & reviews, today's menu, and sleep. (Today's report card is home's own: see report.ts.) */
  openReviews(): void;
  openMenuRef(): void;
  /** The Garage: savings, bonuses and looks. */
  openGarage(): void;
  sleep(): void;
  /** The save changed here (a drive, an upgrade picked): persist it and sync the truck's town. */
  commit(): void;
  /** The game menu (General & Settings). Another module owns it; home only asks for it. */
  openSettings(): void;
  /** The How to Play modal. */
  openHowTo(): void;
  /** Set tomorrow's pacing (the report card's Try Steady). */
  setPacing?(d: Difficulty): void;
  /** Start the next trip from the end of the trip's credits (DESIGN §50). */
  newTrip?(): void;
  /** A town to open the sheet on straight away, e.g. one the last shift unlocked. */
  focus?: string | null;
  /** Just slept: play the night passing over the map before handing it over. */
  night?: NightShow | null;
  /** Just closed: pull back out of the kitchen into the truck, then bring up today's report card. */
  arrive?: Arrival | null;
  sfx?: { whoosh(): void; coin(): void; tap(): void };
}

/**
 * The end of a shift arriving on the evening map (DESIGN.md §30): a picture of the kitchen as it
 * was (the 3D view as a JPEG, w × h CSS px, plus copies of the HUD, rail, counter buttons and the
 * Closed sign) to shrink into the truck. No picture: the report card just comes up.
 */
export interface Arrival {
  shot: string | null;
  layers: HTMLElement[];
  w: number;
  h: number;
}

/** What the night transition shows: the day turning, and how today moved popularity and rating. */
export interface NightShow {
  fromDay: number;
  toDay: number;
  town: string;
  /** Before and after today; null when there was no shift today. */
  pop: [number, number] | null;
  rating: [number, number] | null;
}

interface Mounted {
  root: HTMLElement;
  el: HTMLElement;
  map: HTMLElement;
  world: HTMLElement;
  pz: PanZoom;
  base: number;
  deps: HomeDeps;
  selected: string | null;
  at: number;
  driving: boolean;
  /** The night is still drawn while the night transition plays. */
  night: boolean;
  /** Ends the pull-back out of the kitchen early (a tap), while it plays. */
  arriving: (() => void) | null;
  observer: MutationObserver;
  onResize: () => void;
}

let cur: Mounted | null = null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const CROWD_ICON: Record<string, string> = { commuters: "truck", families: "people", foodies: "critic", party: "sparkle" };

// ---------------------------------------------------------------------------
// Mounting

/** Build (or rebuild) the home screen inside `root`, centred on the truck. */
export function mountHome(root: HTMLElement, deps: HomeDeps): void {
  unmountHome();
  root.classList.add("home-host");
  root.innerHTML = shellHtml(deps.save);
  const el = root.querySelector<HTMLElement>(".home")!;
  el.classList.toggle("evening", deps.save.time === "evening" || !!deps.night);
  const map = el.querySelector<HTMLElement>(".home-map")!;
  const world = el.querySelector<HTMLElement>(".home-world")!;
  const pz = new PanZoom({
    viewport: map,
    content: world,
    width: 1,
    height: 1,
    minScale: 1,
    maxScale: 1,
    margin: 0,
    onTap: (target) => onMapTap(target),
    onChange: (scale) => markerScale(world, scale),
    // Only the map itself pans; the dock, sheet, stats and buttons float over it.
    ignore: (target) => target !== map && !world.contains(target),
  });
  const m: Mounted = { root, el, map, world, pz, base: 1, deps, selected: null, at: performance.now(), driving: false, night: !!deps.night, arriving: null, observer: null!, onResize: () => (fitMap(true), fitDockName(m)) };
  cur = m;
  // If something else takes over the root (the business plan card), let go of it.
  m.observer = new MutationObserver(() => {
    if (cur === m && !root.contains(el)) unmountHome();
  });
  m.observer.observe(root, { childList: true });
  window.addEventListener("resize", m.onResize);
  el.addEventListener("click", onClick);

  renderMapInto(m);
  fitMap(false);
  renderDock(m);
  if (deps.night) playNight(m, deps.night);
  else if (deps.arrive) playArrive(m, deps.arrive);
  const focus = !deps.night && deps.focus && deps.focus !== deps.save.town && STOPS.some((t) => t.id === deps.focus) ? deps.focus : null;
  if (focus) select(m, focus, false);
  // Layout may not be final on the first frame (fonts, safe areas), so settle once more.
  requestAnimationFrame(() => {
    if (cur === m) fitMap(false, focus ?? undefined);
  });
}

export function unmountHome(): void {
  const m = cur;
  if (!m) return;
  cur = null;
  if (m.selected) dropBack("sheet");
  // Taken over mid pull-back: the shift's guard has nothing left to hold for.
  if (m.arriving) dropBack("shift");
  m.observer.disconnect();
  window.removeEventListener("resize", m.onResize);
  m.pz.destroy();
  m.root.classList.remove("home-host");
  if (m.root.contains(m.el)) m.el.remove();
}

/** True while the map is playing something (the pull-back, a drive, the night passing). */
export const homeBusy = (): boolean => !!cur && (cur.driving || cur.night || !!cur.arriving);

/** Redraw the numbers and the dock after the save changed elsewhere. */
export function refreshHome(): void {
  if (!cur) return;
  // Prep or a screen over the map just closed: its button's double tap shouldn't press one here.
  cur.at = performance.now();
  cur.el.classList.toggle("evening", cur.deps.save.time === "evening");
  renderMapInto(cur);
  // The fresh SVG comes sized (renderMapInto); fitting again keeps the view if the layout moved.
  fitMap(true);
  cur.el.querySelector(".home-stats")!.outerHTML = statsHtml(cur.deps.save);
  renderDock(cur);
  if (cur.selected) renderSheet(cur, cur.selected);
}

function shellHtml(save: Save): string {
  return `<div class="home bv bv-night">
    <div class="home-float">
    <header class="home-top">
      <div class="home-brand">
        <span class="home-logo">${logoStack()}</span>${tripNo(save) > 1 ? `<span class="bv-eyebrow">Trip ${tripNo(save)}</span>` : ""}${simLevel() !== null ? `<span class="home-dev bv-mono" title="Simulated progress (dev mode, in Settings)">Sim ${simLevel()}%</span>` : ""}
      </div>
      <div class="home-actions">
        <button class="bv-btn icon" data-home="book" aria-label="Postcard book" title="Postcard book">${icon("menu-book")}</button>
        <button class="bv-btn icon" data-home="howto" aria-label="How to play" title="How to play">${icon("help")}</button>
        <button class="bv-btn icon" data-home="settings" aria-label="Settings" title="Settings">${icon("settings")}</button>
      </div>
    </header>
    ${statsHtml(save)}
    </div>
    <div class="home-map" style="--home-sea:${SEA}">
      <div class="home-world"></div>
      <div class="home-zoom">
        <button data-home="zoom-in" aria-label="Zoom in">${icon("plus")}</button>
        <button data-home="zoom-out" aria-label="Zoom out">${icon("minus")}</button>
        <button class="locate" data-home="locate" aria-label="Find the truck">${icon("truck")}</button>
      </div>
      <div class="home-dock bv-light"></div>
      <div class="home-sheet bv-light" hidden></div>
    </div>
  </div>`;
}

/**
 * The dashboard card, one row of three buttons, each with its icon in its small label: popularity
 * and rating together (they open "Popularity & reviews"); the Garage with the savings, and a dot
 * when an unlocked bonus is affordable; and today's menu (in the evening, today's report card).
 */
function statsHtml(save: Save): string {
  const avg = reviewAverage(save.reviewCounts);
  const rating = avg === null ? "–" : avg.toFixed(1);
  const ready = readyToBuy(save);
  const evening = save.time === "evening";
  const last = todaysClosing(save);
  const cell = (ic: string, label: string, value: string, mono = true) => `<span><small>${icon(ic)}${label}</small><b class="${mono ? "bv-mono" : ""}">${value}</b></span>`;
  return `<div class="home-stats bv-light" role="group" aria-label="Your truck">
    <button class="home-pill duo" data-home="reviews" aria-label="Popularity ${save.popularity}, rating ${avg === null ? "none yet" : rating}: see popularity and reviews">${cell("people", "Popularity", String(save.popularity))}${cell("star", "Rating", rating)}</button>
    <button class="home-pill garage" data-home="garage" aria-label="Garage: savings ${dollars(save.bank)}${ready ? `, ${ready} bonus${ready > 1 ? "es" : ""} ready to buy` : ""}">${cell("garage", "Garage", dollars(save.bank))}${ready ? `<i class="dot"></i>` : ""}</button>
    ${
      evening && last
        ? `<button class="home-pill" data-home="results">${cell("receipt", "Today", "Results", false)}</button>`
        : `<button class="home-pill" data-home="menuref">${cell("food-menu", "Today's", "Menu", false)}</button>`
    }
  </div>`;
}

// ---------------------------------------------------------------------------
// The map

/** Towns a drive reaches right now: every open town (no overnight range since DESIGN §51). */
function reachable(s: Save): { id: string; path: string[] }[] {
  const out: { id: string; path: string[] }[] = [];
  for (const id of s.unlocked) {
    if (id === s.town) continue;
    const t = planTrip(s.town, id, s.unlocked);
    if (t) out.push({ id, path: t.path });
  }
  return out;
}

function renderMapInto(m: Mounted): void {
  const s = m.deps.save;
  const night = s.time === "evening" || m.night;
  const bonusHere = s.unlocked.filter((id) => {
    const b = townBonus(id);
    return b && !s.found.includes(b.id);
  });
  m.world.innerHTML = renderMap({ town: s.town, unlocked: s.unlocked, shiftsIn: s.shiftsIn, day: s.day, selected: m.selected, night, reach: m.night ? [] : reachable(s), look: s.look, bonusHere, px: m.base, stamps: s.stamps });
  for (const t of m.world.querySelectorAll<SVGGElement>(".home-town")) t.classList.toggle("sel", t.dataset.town === m.selected);
}

/**
 * Town markers, names and the truck grow a little when zoomed out and shrink a little when
 * zoomed in, so names stay readable over the whole map without crowding it up close.
 */
function markerScale(world: HTMLElement, scale: number): void {
  const pxPerUnit = (cur?.base ?? 1) * scale;
  const k = Math.max(0.62, Math.min(1.45, (MARKER_UNIT / pxPerUnit) ** 0.55));
  const v = k.toFixed(2);
  if (world.style.getPropertyValue("--mk") !== v) world.style.setProperty("--mk", v);
  // Far out, only the capitals keep their names (larger), so the whole road stays readable.
  world.classList.toggle("far", pxPerUnit < FAR_UNIT);
}
/** Screen px per map unit at which markers are drawn at their natural size. */
const MARKER_UNIT = 5.2;
/** Below this many screen px per map unit, town names give way to the capitals' (see markerScale). */
const FAR_UNIT = 4.4;
/** Screen px per map unit at the default zoom: neighbouring towns a comfortable thumb apart. */
const DEFAULT_UNIT = 5.6;

/** Content px of a map point. */
function px(m: Mounted, p: [number, number]): [number, number] {
  return [(p[0] - VIEW.x) * m.base, (p[1] - VIEW.y) * m.base];
}

/** Size the SVG to the viewport and look at the truck (or a town). */
function fitMap(keepView: boolean, lookAt?: string): void {
  const m = cur;
  if (!m) return;
  const w = m.map.clientWidth;
  const h = m.map.clientHeight;
  if (!w || !h) return;
  const prev = keepView ? m.pz.toContent(w / 2, h / 2) : null;
  const prevBase = m.base;
  // Scale 1 shows the whole map; the default zoom puts neighbouring towns a comfortable thumb apart.
  m.base = Math.min(w / VIEW.w, h / VIEW.h);
  const svg = m.world.querySelector<SVGSVGElement>("svg")!;
  svg.setAttribute("width", `${VIEW.w * m.base}`);
  svg.setAttribute("height", `${VIEW.h * m.base}`);
  const home = Math.min(3, Math.max(1, DEFAULT_UNIT / m.base));
  // Some slack past the edges, so towns near the coast can still be brought to the middle.
  // Zoomed all the way out, the land (not the whole sheet of sea) fills the width, 16 px each side.
  const minScale = Math.min(home, Math.max(0.6, (w - 32) / ((LAND_BOX[2] - LAND_BOX[0]) * m.base)));
  m.pz.resize(VIEW.w * m.base, VIEW.h * m.base, minScale, 5, Math.round(Math.min(w * 0.55, h * 0.4)));
  const dockH = m.el.querySelector<HTMLElement>(".home-sheet:not([hidden])")?.offsetHeight ?? m.el.querySelector<HTMLElement>(".home-dock")?.offsetHeight ?? 0;
  const at = { x: w / 2, y: Math.max(h * 0.35, (h - dockH) / 2) };
  if (prev) m.pz.centerOn((prev.x / prevBase) * m.base, (prev.y / prevBase) * m.base, m.pz.scale, { x: w / 2, y: h / 2 });
  else {
    const [x, y] = px(m, townPoint(lookAt ?? m.deps.save.town));
    m.pz.centerOn(x, y, home, at);
  }
}

function onMapTap(target: Element): void {
  const m = cur;
  if (!m || m.driving || m.night) return;
  if (m.arriving) {
    m.arriving();
    return;
  }
  const id = target.closest<HTMLElement>("[data-town]")?.dataset.town;
  if (id) {
    m.deps.sfx?.tap();
    select(m, id, true);
  } else if (m.selected) deselect(m);
}

function select(m: Mounted, id: string, pan: boolean): void {
  if (!m.selected) pushBack("sheet", () => cur === m && deselect(m, true));
  m.selected = id;
  for (const t of m.world.querySelectorAll<SVGGElement>(".home-town")) t.classList.toggle("sel", t.dataset.town === id);
  // Route preview from the truck.
  const s = m.deps.save;
  const trip = planTrip(s.town, id, s.unlocked);
  const route = m.world.querySelector<SVGPathElement>(".home-route")!;
  route.setAttribute("d", trip ? trip.path.slice(1).map((b, i) => roadPath(trip.path[i], b)).join(" ") : "");
  renderSheet(m, id);
  m.el.querySelector<HTMLElement>(".home-dock")!.hidden = true;
  if (pan) revealTown(m, id);
}

function deselect(m: Mounted, fromBack = false): void {
  if (!fromBack) dropBack("sheet");
  m.selected = null;
  for (const t of m.world.querySelectorAll<SVGGElement>(".home-town.sel")) t.classList.remove("sel");
  m.world.querySelector<SVGPathElement>(".home-route")!.setAttribute("d", "");
  m.el.querySelector<HTMLElement>(".home-sheet")!.hidden = true;
  m.el.querySelector<HTMLElement>(".home-dock")!.hidden = false;
  fitDockName(m);
}

/** Pan so the town sits in the part of the map the sheet doesn't cover. */
function revealTown(m: Mounted, id: string): void {
  const sheet = m.el.querySelector<HTMLElement>(".home-sheet")!;
  const free = m.map.clientHeight - (sheet.hidden ? 0 : sheet.offsetHeight);
  const [x, y] = px(m, townPoint(id));
  const sp = m.pz.toScreen(x, y);
  const w = m.map.clientWidth;
  if (sp.y > free - 48 || sp.y < 90 || sp.x < 40 || sp.x > w - 40) {
    // Zoomed all the way out the map can't pan (it sits centred), so come in far enough to bring the town clear of the sheet.
    const fits = VIEW.h * m.base * m.pz.scale <= m.map.clientHeight * 1.2;
    m.pz.centerOn(x, y, fits ? Math.max(m.pz.scale, DEFAULT_UNIT / m.base) : m.pz.scale, { x: w / 2, y: Math.max(100, free * 0.5) }, true);
  }
}

// ---------------------------------------------------------------------------
// Dock and sheet

function pipsHtml(done: number, need: number): string {
  return `<span class="home-pips" aria-label="${done} of ${need} shifts">${Array.from({ length: need }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span>`;
}

function shiftsLine(save: Save, t: Stop): string {
  const n = save.shiftsIn[t.id] ?? 0;
  // Short enough for the dock beside Prep & Open at 320px (the town sheet says more).
  if (!t.roads.length) return `<span class="t">${n ? `${n} shift${n === 1 ? "" : "s"} here` : t.id === FINAL_TOWN ? "Last stop of the trip" : "A side road"}</span>`;
  const { done, need } = unlockProgress(save.shiftsIn, t.id);
  // The pips carry the count; the words say what it's for.
  return `${pipsHtml(done, need)}<span class="t">${done >= need ? "roads open" : "to open the road"}</span>`;
}

/**
 * The dock's town name steps down a pixel at a time when it's too long for the room beside Prep &
 * Open (Saltwater Bay, Cactus Junction on a narrow phone) instead of losing its end to an ellipsis
 * (DESIGN §46); a long event's line loses its "today". Measured, so it holds for any name and width; it runs again once the serif has
 * loaded, on resize and when the dock comes back from under the town sheet.
 */
function fitDockName(m: Mounted): void {
  const b = m.el.querySelector<HTMLElement>(".home-dock-info b");
  if (!b) return;
  b.style.fontSize = "";
  if (!b.clientWidth) return;
  let size = parseFloat(getComputedStyle(b).fontSize);
  while (b.scrollWidth > b.clientWidth && size > 15) {
    size -= 1;
    b.style.fontSize = `${size}px`;
  }
  // An event's line drops its "today" (the flag and the morning already say it) rather than cut off.
  const t = m.el.querySelector<HTMLElement>(".home-dock-info .bv-caption .t");
  const today = t?.querySelector<HTMLElement>(".today");
  if (t && today) {
    today.hidden = false;
    today.hidden = t.scrollWidth > t.clientWidth;
  }
}

function renderDock(m: Mounted): void {
  const s = m.deps.save;
  const here = townById(s.town);
  const ev = eventOn(s.town, s.day);
  const dock = m.el.querySelector<HTMLElement>(".home-dock")!;
  const evening = s.time === "evening";
  const last = todaysClosing(s);
  const today = last ? `${last.stars.length ? `${(last.stars.reduce((a, b) => a + b, 0) / last.stars.length).toFixed(1)}★ · ` : ""}${last.served} served today` : "A day on the road";
  dock.innerHTML = `
    <div class="home-dock-row">
      <button class="home-dock-info" data-home="here" aria-label="About ${esc(here.name)}">
        <span class="bv-eyebrow home-dayline">${icon(evening ? "moon" : "sun")}Day ${s.day} · ${evening ? "Evening in" : "Morning in"}</span>
        <b>${esc(here.name)}</b>
        <span class="bv-caption">${evening ? esc(today) : ev ? `${icon("flag")}<span class="t">${esc(ev.name)}<span class="today"> today</span></span>` : shiftsLine(s, here)}</span>
      </button>
      ${
        evening
          ? `<button class="bv-btn primary lg" data-home="sleep">${icon("moon")}Sleep</button>`
          : `<button class="bv-btn primary lg" data-home="open">${icon("bell")}Prep &amp; Open</button>`
      }
    </div>`;
  fitDockName(m);
  document.fonts?.ready.then(() => cur === m && fitDockName(m));
}

function when(day: number, d: number): string {
  return d === day ? "today" : d === day + 1 ? "tomorrow" : `in ${d - day} days`;
}

function calendarHtml(t: Stop, day: number): string {
  const span = 14;
  const cells: string[] = [];
  const seen = new Map<string, number>();
  // The last night of the trip isn't in EVENTS (stops.ts FINALE): keep the events seen by id.
  const byId = new Map(EVENTS.map((e) => [e.id, e]));
  for (let d = day; d < day + span; d++) {
    const e = eventOn(t.id, d);
    if (e) byId.set(e.id, e);
    if (e && !seen.has(e.id)) seen.set(e.id, d);
    cells.push(`<span class="home-day ${d === day ? "today" : ""} ${e ? "ev" : ""}" title="Day ${d}${e ? `: ${esc(e.name)}` : ""}">${d}</span>`);
  }
  const own = EVENTS.filter((e) => e.town === t.id);
  let note: string;
  if (seen.size) {
    note = [...seen].map(([id, d]) => {
      const e = byId.get(id)!;
      return `<div>${icon("flag")}<span class="when">${when(day, d)}</span><span><b>${esc(e.name)}</b> · ${CROWD[e.crowd].label}, busier and longer${e.special ? ` · special: ${esc(e.special.name)}` : ""}</span></div>`;
    }).join("");
  } else if (own.length) {
    const e = own[0];
    note = `<div>${icon("calendar")}<span class="mute">Next ${esc(e.name)} on day ${nextDay(e, day)}, then every ${e.every} days.</span></div>`;
  } else note = `<div>${icon("calendar")}<span class="mute">No events here. Steady trade all year.</span></div>`;
  return `<div class="home-cal-wrap">
    <span class="bv-eyebrow"><span>Next two weeks</span><span>Day ${day}–${day + span - 1}</span></span>
    <div class="home-cal">${cells.join("")}</div>
    <div class="home-cal-note">${note}</div>
  </div>`;
}

function renderSheet(m: Mounted, id: string): void {
  const s = m.deps.save;
  const t = townById(id);
  const here = id === s.town;
  const open = s.unlocked.includes(id);
  const ev = eventOn(id, s.day);
  const crowd = CROWD[ev?.crowd ?? t.crowd];
  const trip = here || !open ? null : planTrip(s.town, id, s.unlocked);
  const best = s.best[id];
  const evening = s.time === "evening";

  let action: string;
  if (here) {
    action = evening
      ? `<button class="bv-btn primary lg block" data-home="sleep">${icon("moon")}Sleep here</button>
      <span class="bv-caption">Tomorrow: ${eventOn(id, s.day + 1) ? `${esc(eventOn(id, s.day + 1)!.name)} here.` : `shift ${(s.shiftsIn[id] ?? 0) + 1} here, or set off.`}</span>`
      : `<button class="bv-btn primary lg block" data-home="open">${icon("bell")}Prep &amp; Open${ev ? ` · ${esc(ev.name)}` : ""}</button>
      ${ev ? `<span class="bv-caption">Event day: a longer, busier shift with its own crowd.</span>` : ""}`;
  } else if (trip) {
    action = `<button class="bv-btn primary lg block" data-home="drive" data-id="${id}">${icon("truck")}Drive here · ${evening ? "tonight" : "this morning"}</button>`;
  } else if (!open) {
    const gates = openedBy(id).map((g) => ({ t: townById(g), ...unlockProgress(s.shiftsIn, g) }));
    const reachable = gates.filter((g) => s.unlocked.includes(g.t.id));
    const near = gates.length ? (reachable.length ? reachable : gates) : [];
    action = `<div class="home-locked">${icon("lock")}<div><b>Locked</b><span>${
      near.length ? `Pass ${SHIFTS_TO_UNLOCK} shifts in ${near.map((g) => esc(g.t.name)).join(" or ")} to open the road.` : "Opens later on the trip."
    }</span>${near.map((g) => `<span class="prog">${pipsHtml(g.done, g.need)} ${esc(g.t.name)} · ${g.done} of ${g.need}</span>`).join("")}</div></div>`;
  } else {
    action = `<div class="home-locked">${icon("lock")}<div><b>No road from ${esc(townById(s.town).name)}</b><span>Drive to a town that joins it first.</span></div></div>`;
  }

  const sheet = m.el.querySelector<HTMLElement>(".home-sheet")!;
  sheet.innerHTML = `
    <div class="home-sheet-head">
      <div>
        <h2 class="bv-title">${esc(t.name)}</h2>
        <div class="home-tags">
          <span class="bv-chip pill crowd">${icon(CROWD_ICON[ev?.crowd ?? t.crowd] ?? "people")}${crowd.label}${ev ? " today" : ""}</span>
          ${t.capital ? `<span class="bv-chip pill">${icon("city")}Big city</span>` : ""}
          ${here ? `<span class="bv-chip pill here">${icon("truck")}You're here</span>` : ""}
        </div>
      </div>
      <button class="bv-btn icon ghost" data-home="close" aria-label="Close">${icon("close")}</button>
    </div>
    <p class="bv-body home-blurb">${esc(t.blurb)} ${esc(crowd.blurb)}</p>
    ${calendarHtml(t, s.day)}
    <div class="home-facts">
      <div><span class="bv-eyebrow">Shifts here</span><b>${t.roads.length ? pipsHtml(unlockProgress(s.shiftsIn, id).done, SHIFTS_TO_UNLOCK) : ""}${s.shiftsIn[id] ?? 0}</b></div>
      <div><span class="bv-eyebrow">Best shift</span><b>${best !== undefined ? `${icon("star")}${best.toFixed(1)}` : "–"}</b></div>
      <div><span class="bv-eyebrow">${trip ? "From here" : "Customers"}</span><b>${trip ? `${miles(trip.distance)} mi` : `${icon("people")}~${expectedCustomers({ stop: withEvent(t, ev), popularity: s.popularity, rating: ratingPull(s.reviewCounts), hidden: s.hidden, shift: s.shift, pacing: savedPacing() ?? (s.tutorialDone ? "balanced" : "chill"), regionShifts: regionShifts(s.shiftsIn, t) })}`}</b></div>
    </div>
    ${bonusRow(s, id)}
    ${identityRows(s, id)}
    ${open && t.newThing && !(s.shiftsIn[id] ?? 0) ? `<div class="bv-callout new">${icon("new")}<span>${esc(t.newThing)}</span></div>` : ""}
    <div class="home-action">${action}</div>`;
  sheet.hidden = false;
}

/** The town's bonus on its sheet: what it is and how far along it is. Unknown until the town is open. */
function bonusRow(s: Save, id: string): string {
  const b = townBonus(id);
  if (!b || !s.unlocked.includes(id)) return "";
  const state = s.bonuses.includes(b.id)
    ? `<em class="own">${icon("check")}Owned</em>`
    : s.found.includes(b.id)
      ? `<em class="sale">${dollars(b.price)} in the Garage</em>`
      : `<em>${icon("lock")}Great shift to unlock</em>`;
  return `<div class="home-bonus ${s.found.includes(b.id) ? "found" : ""}"><span class="ic">${icon(b.icon)}</span><span class="t"><span class="bv-eyebrow">Town bonus</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small></span>${state}</div>`;
}

/**
 * The town's signature dish and its postcard stamps (DESIGN §50), once the town is open (or
 * stamped on an earlier trip). The stamps open the postcard book at the town's page.
 */
function identityRows(s: Save, id: string): string {
  const stamped = Object.keys(s.stamps?.[id] ?? {}).length > 0;
  if (!s.unlocked.includes(id) && !stamped) return "";
  const sig = signatureOf(id);
  return `${sig ? `<div class="home-sig">${icon("food-menu")}<span>Known for its <b>${esc(sig)}</b></span></div>` : ""}
    <button class="home-stamps" data-home="book-town" data-id="${id}" aria-label="Stamps in the postcard book"><span class="bv-eyebrow">Stamps</span><span class="row">${townStamps(s, id, true)}</span><span class="chev">${icon("forward")}</span></button>`;
}

// ---------------------------------------------------------------------------
// Actions

function onClick(e: Event): void {
  const m = cur;
  if (!m) return;
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-home]");
  if (!btn || btn.hasAttribute("disabled")) return;
  // A double tap on the screen before this one shouldn't press a button here.
  if (m.arriving) {
    m.arriving();
    return;
  }
  if (performance.now() - Math.max(m.at, modalClosedAt()) < 450 || m.night) return;
  const act = btn.dataset.home!;
  const s = m.deps.save;
  switch (act) {
    case "open":
      m.deps.sfx?.tap();
      m.deps.startShift();
      break;
    case "drive":
      drive(m, btn.dataset.id!);
      break;
    case "sleep":
      if (m.driving) break;
      m.deps.sfx?.tap();
      m.deps.sleep();
      break;
    case "results":
      m.deps.sfx?.tap();
      showReport(m, false);
      break;
    case "reviews":
      m.deps.openReviews();
      break;
    case "menuref":
      m.deps.openMenuRef();
      break;
    case "garage":
      m.deps.sfx?.tap();
      m.deps.openGarage();
      break;
    case "here":
      m.deps.sfx?.tap();
      select(m, s.town, true);
      break;
    case "close":
      deselect(m);
      break;
    case "town":
      m.deps.sfx?.tap();
      select(m, btn.dataset.id!, true);
      break;
    case "zoom-in":
      m.pz.zoomBy(1.5, undefined, true);
      break;
    case "zoom-out":
      m.pz.zoomBy(1 / 1.5, undefined, true);
      break;
    case "locate": {
      const [x, y] = px(m, townPoint(s.town));
      const w = m.map.clientWidth;
      const h = m.map.clientHeight;
      const covered = m.el.querySelector<HTMLElement>(".home-sheet:not([hidden])")?.offsetHeight ?? m.el.querySelector<HTMLElement>(".home-dock")?.offsetHeight ?? 0;
      m.pz.centerOn(x, y, Math.max(m.pz.scale, 1.4), { x: w / 2, y: Math.max(h * 0.35, (h - covered) / 2) }, true);
      break;
    }
    case "settings":
      m.deps.openSettings();
      break;
    case "howto":
      m.deps.openHowTo();
      break;
    case "book":
      m.deps.sfx?.tap();
      openBook(s);
      break;
    case "book-town":
      m.deps.sfx?.tap();
      openBook(s, btn.dataset.id);
      break;
  }
}


function drive(m: Mounted, to: string): void {
  const s = m.deps.save;
  if (m.driving) return;
  const trip = planTrip(s.town, to, s.unlocked);
  if (!trip) return;
  applyTrip(s, trip);
  m.deps.commit();
  m.deps.sfx?.whoosh();
  animateDrive(m, trip);
}

/** Roll the truck along the route and follow it with the view, then settle on the new town. */
function animateDrive(m: Mounted, trip: Trip): void {
  const truck = m.world.querySelector<SVGGElement>(".home-truck")!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pts = routePoints(trip.path);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  total = Math.max(1, total);
  const duration = reduce ? 0 : Math.min(1700, 500 + trip.distance * 14);
  const from = townById(trip.from);
  const dest = townById(trip.to);
  truck.classList.toggle("west", dest.x < from.x);
  m.driving = true;
  m.el.classList.add("driving");
  // Keyframe offsets follow the distance along the roads so the speed stays even.
  let acc = 0;
  const frames = pts.map((p, i) => {
    if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    return { transform: `translate(${p[0]}px, ${p[1]}px)`, offset: Math.min(1, acc / total) };
  });
  frames[frames.length - 1].offset = 1;
  const [dx, dy] = px(m, [dest.x, dest.y]);
  const w = m.map.clientWidth;
  const free = m.map.clientHeight - (m.el.querySelector<HTMLElement>(".home-sheet")?.offsetHeight ?? 0);
  m.pz.centerOn(dx, dy, m.pz.scale, { x: w / 2, y: Math.max(100, free * 0.5) }, true);
  const finish = () => {
    m.driving = false;
    m.el.classList.remove("driving");
    m.el.classList.toggle("evening", m.deps.save.time === "evening");
    renderMapInto(m);
    m.el.querySelector(".home-stats")!.outerHTML = statsHtml(m.deps.save);
    renderDock(m);
    if (m.selected) renderSheet(m, m.selected);
  };
  if (duration === 0 || typeof truck.animate !== "function") {
    finish();
    return;
  }
  const anim = truck.animate(frames, { duration, easing: "ease-in-out", fill: "forwards" });
  anim.onfinish = () => {
    anim.cancel();
    finish();
  };
}

// ---------------------------------------------------------------------------
// Arriving from the kitchen

const ARRIVE_MS = { shrink: 1350, fade: 850, sheet: 1350 };

/**
 * The end of a shift, on the map: the kitchen (a picture of it) shrinks into the truck while the
 * map pulls back from close in, the truck's hatch glows, and today's report card comes up over
 * the evening map (Sleep is on the dock under it). Any tap finishes it at once.
 */
function playArrive(m: Mounted, a: Arrival): void {
  const s = m.deps.save;
  const last = todaysClosing(s);
  if (!last) {
    dropBack("shift");
    return;
  }
  fitMap(false);
  const truck = m.world.querySelector<SVGGElement>(".home-truck");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!a.shot || reduce) {
    showReport(m, true);
    return;
  }
  // Where the truck sits on screen, in the home element's own coordinates.
  const [tx, ty] = px(m, townPoint(s.town));
  const sp = m.pz.toScreen(tx, ty);
  const mapBox = m.map.getBoundingClientRect();
  const elBox = m.el.getBoundingClientRect();
  const ox = sp.x + mapBox.left - elBox.left;
  const oy = sp.y + mapBox.top - elBox.top - 4;
  const over = document.createElement("div");
  over.className = "home-arrive";
  over.setAttribute("aria-hidden", "true");
  const kitchen = document.createElement("div");
  // Light tokens inside, as in the kitchen: the map around it is on the night ones.
  kitchen.className = "kz bv-light";
  kitchen.style.width = `${a.w}px`;
  kitchen.style.height = `${a.h}px`;
  kitchen.style.left = `${-elBox.left}px`;
  kitchen.style.top = `${-elBox.top}px`;
  kitchen.style.transformOrigin = `${ox + elBox.left}px ${oy + elBox.top}px`;
  const img = new Image();
  img.src = a.shot;
  img.alt = "";
  kitchen.append(img, ...a.layers);
  over.appendChild(kitchen);
  m.el.appendChild(over);
  const ease = "cubic-bezier(0.6, 0, 0.25, 1)";
  const anims: Animation[] = [];
  const timers: number[] = [];
  anims.push(kitchen.animate([{ transform: "none", borderRadius: "0px" }, { transform: "scale(0.035)", borderRadius: "40px" }], { duration: ARRIVE_MS.shrink, easing: ease, fill: "forwards" }));
  anims.push(over.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: ARRIVE_MS.shrink, easing: "linear", fill: "forwards" }));
  // The map pulls back from close in on the truck: the same view, zoomed 2.2× about the truck, easing out.
  const view = m.world.style.transform;
  anims.push(m.world.animate([{ transform: `translate(${sp.x}px, ${sp.y}px) scale(2.2) translate(${-sp.x}px, ${-sp.y}px) ${view}` }, { transform: view }], { duration: ARRIVE_MS.shrink + 150, easing: ease }));
  const finish = () => {
    if (!m.arriving) return;
    m.arriving = null;
    for (const t of timers) clearTimeout(t);
    for (const an of anims) an.cancel();
    over.remove();
    showReport(m, true);
    truck?.classList.add("lit");
    timers.push(window.setTimeout(() => truck?.classList.remove("lit"), 2600));
    m.at = performance.now();
  };
  m.arriving = finish;
  timers.push(window.setTimeout(() => truck?.classList.add("lit"), ARRIVE_MS.fade));
  timers.push(window.setTimeout(finish, ARRIVE_MS.sheet));
}

/**
 * Today's report card (screens/report.ts), over the map. Buying the unlocked bonus on it saves and
 * updates the Garage button; its links close it and go to Popularity & reviews, the Garage or a town.
 */
function showReport(m: Mounted, arrive: boolean): void {
  const s = m.deps.save;
  const last = todaysClosing(s);
  // Straight after a shift the shift's Back guard has held through the pull-back; the card takes
  // over from it here, in the same tick, so the page never loses its catch on Back.
  if (arrive) dropBack("shift");
  if (!last) return;
  // The last night of the trip ends on the trip card (screens/finale.ts), which can still show
  // the night's own report card.
  if (last.finale) {
    openTripCard(
      last,
      {
        save: s,
        report: () => openReportCard(m, last, false),
        driveOff: (done) => driveOff(m, done),
        newTrip: () => m.deps.newTrip?.(),
      },
      !arrive,
    );
    return;
  }
  openReportCard(m, last, arrive);
}

function openReportCard(m: Mounted, last: Closing, arrive: boolean): void {
  const s = m.deps.save;
  openReport(
    last,
    {
      save: s,
      buy: (id) => {
        if (!buyBonus(s, id)) return false;
        m.deps.commit();
        m.deps.sfx?.coin();
        m.el.querySelector(".home-stats")!.outerHTML = statsHtml(s);
        return true;
      },
      reviews: () => m.deps.openReviews(),
      garage: () => m.deps.openGarage(),
      town: (id) => select(m, id, true),
      steady: () => {
        m.deps.setPacing?.("balanced");
        last.steady = false;
        m.deps.commit();
      },
      book: () => openBook(s, last.town),
    },
    arrive,
  );
}

// ---------------------------------------------------------------------------
// The drive-off at the end of the trip

const DRIVE_OFF_MS = { trail: 1600, truck: 2600, end: 3600 };

/**
 * After the trip card (screens/finale.ts): the map pulls out to the whole island, the trip's roads
 * light up in gold, and the truck leaves Port Amber on the ferry and fades out over the water.
 * A tap or Back skips to the end; with reduced motion the trail is drawn and it ends at once.
 */
function driveOff(m: Mounted, done: () => void): void {
  if (cur !== m || !m.el.isConnected) {
    done();
    return;
  }
  const s = m.deps.save;
  if (m.selected) deselect(m);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The trail: every road between two towns this trip worked in.
  const worked = new Set(STOPS.filter((t) => (s.shiftsIn[t.id] ?? 0) > 0 || s.passedTowns.includes(t.id)).map((t) => t.id));
  const d = STOPS.flatMap((t) => t.roads.filter((r) => worked.has(t.id) && worked.has(r)).map((r) => roadPath(t.id, r))).join(" ");
  const towns = m.world.querySelector(".home-towns");
  if (towns && d) towns.insertAdjacentHTML("beforebegin", `<path class="home-trail ${reduce ? "" : "draw"}" d="${d}"/>`);
  // Pull out to the land, centred on it.
  const [cx, cy] = px(m, [(LAND_BOX[0] + LAND_BOX[2]) / 2, (LAND_BOX[1] + LAND_BOX[3]) / 2]);
  m.pz.centerOn(cx, cy, 0, undefined, !reduce);
  if (reduce) {
    done();
    return;
  }
  m.driving = true;
  const truck = m.world.querySelector<SVGGElement>(".home-truck");
  const anims: Animation[] = [];
  const timers: number[] = [];
  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    for (const t of timers) clearTimeout(t);
    for (const a of anims) a.cancel();
    m.driving = false;
    m.el.removeEventListener("click", finish, true);
    dropBack("drive-off");
    done();
  };
  pushBack("drive-off", finish);
  m.el.addEventListener("click", finish, true);
  if (truck && typeof truck.animate === "function") {
    // Along the ferry line toward Harbor City, fading out over the water as it goes.
    const pts = routePoints([FINAL_TOWN, "harbor"]);
    const n = pts.length;
    const frames = pts.slice(0, n).map((p, i, a) => ({ transform: `translate(${p[0]}px, ${p[1]}px)`, opacity: i < a.length * 0.6 ? 1 : 1 - (i - a.length * 0.6) / (a.length * 0.4), offset: i / (a.length - 1) }));
    truck.classList.toggle("west", pts[n - 1][0] < pts[0][0]);
    timers.push(
      window.setTimeout(() => {
        anims.push(truck.animate(frames, { duration: DRIVE_OFF_MS.truck, easing: "ease-in-out", fill: "forwards" }));
      }, DRIVE_OFF_MS.trail * 0.5),
    );
  }
  timers.push(window.setTimeout(finish, DRIVE_OFF_MS.end));
}

// ---------------------------------------------------------------------------
// The night passing

const NIGHT_MS = { roll: 900, dawn: 2400, out: 3300, end: 3800 };

/**
 * Sleep, shown on the map itself: the evening map dims to night, the day counter rolls over,
 * today's change in popularity and rating counts up, then dawn washes the map back to morning.
 * No tap needed; a tap skips to the morning.
 */
function playNight(m: Mounted, n: NightShow): void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const box = document.createElement("div");
  box.className = "home-night";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  const delta = (pair: [number, number], digits: number) => {
    const d = pair[1] - pair[0];
    const r = Number(d.toFixed(digits));
    return r === 0 ? `<em>no change</em>` : `<em class="${r > 0 ? "up" : "dn"}">${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}</em>`;
  };
  const chip = (ic: string, label: string, pair: [number, number], digits: number) =>
    `<span class="home-night-chip">${icon(ic)}<span>${label}</span><b class="bv-mono" data-from="${pair[0]}" data-to="${pair[1]}" data-digits="${digits}">${pair[0].toFixed(digits)}</b>${delta(pair, digits)}</span>`;
  box.innerHTML = `<div class="sky"></div>
    <div class="home-night-c">
      <div class="orb" aria-hidden="true"><i class="moon"></i><i class="sun"></i></div>
      <div class="home-night-truck" aria-hidden="true">${truckArt(m.deps.save.look, { night: true, cls: "nt" })}</div>
      <span class="bv-eyebrow">Night in ${esc(n.town)}</span>
      <div class="home-dayroll" aria-label="Day ${n.toDay}"><span>Day</span><span class="num"><span class="track"><b>${n.fromDay}</b><b>${n.toDay}</b></span></span></div>
      <div class="home-night-deltas">${
        n.pop || n.rating
          ? `${n.pop ? chip("people", "Popularity", n.pop, 0) : ""}${n.rating ? chip("star", "Rating", n.rating, 1) : ""}`
          : `<span class="home-night-chip quiet">${icon("road")}<span>A day on the road</span></span>`
      }</div>
    </div>`;
  m.el.appendChild(box);
  const timers: number[] = [];
  let done = false;
  const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, reduce ? Math.min(ms, 300) + ms * 0.15 : ms));
  const countUp = () => {
    for (const b of box.querySelectorAll<HTMLElement>("b[data-from]")) {
      const from = Number(b.dataset.from);
      const to = Number(b.dataset.to);
      const digits = Number(b.dataset.digits);
      const t0 = performance.now();
      const stepFn = (now: number) => {
        const k = Math.min(1, (now - t0) / 800);
        const e = 1 - (1 - k) ** 3;
        b.textContent = (from + (to - from) * e).toFixed(digits);
        if (k < 1 && !done) requestAnimationFrame(stepFn);
        else b.textContent = to.toFixed(digits);
      };
      requestAnimationFrame(stepFn);
    }
  };
  const dawn = () => {
    if (!m.night) return;
    m.night = false;
    box.classList.add("dawn");
    box.querySelector(".home-night-truck .tk")?.classList.remove("night");
    m.el.classList.toggle("evening", m.deps.save.time === "evening");
    renderMapInto(m);
    fitMap(true);
  };
  const finish = () => {
    if (done) return;
    done = true;
    for (const t of timers) clearTimeout(t);
    dawn();
    box.remove();
    m.at = performance.now();
  };
  requestAnimationFrame(() => box.classList.add("in"));
  later(NIGHT_MS.roll, () => {
    box.classList.add("roll");
    countUp();
  });
  later(NIGHT_MS.dawn, dawn);
  later(NIGHT_MS.out, () => box.classList.add("out"));
  later(NIGHT_MS.end, finish);
  // A tap skips to the morning, but not the second half of the double tap on Sleep that started it.
  const shownAt = performance.now();
  box.addEventListener("click", () => {
    if (performance.now() - shownAt > 400) finish();
  });
  // Leaving the map mid-transition (back, a screen over it) just ends it.
  const stop = new MutationObserver(() => {
    if (!m.el.isConnected) {
      stop.disconnect();
      done = true;
      for (const t of timers) clearTimeout(t);
    }
  });
  stop.observe(m.root, { childList: true });
}
