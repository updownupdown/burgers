import { CROWD } from "../game/business";
import { expectedCustomers, rangeMiles, rangeUnits, runningCost } from "../game/day";
import { UPGRADES, type Save, type UpgradeId } from "../game/progress";
import { EVENTS, eventOn, nextDay, STOPS, townById, withEvent, type Stop } from "../game/stops";
import { applyTrip, canAfford, miles, openedBy, planTrip, SHIFTS_TO_UNLOCK, unlockProgress, type Legs, type Trip } from "../game/travel";
import { icon } from "../ui/icons";
import { dropBack, pushBack } from "./nav";
import { renderMap, roadPath, routePoints, SEA, townPoint, VIEW } from "./map";
import { PanZoom } from "./panzoom";
import "./home.css";

/**
 * The home screen: a full-screen road map with the truck's numbers always in view. Tap a town
 * for its sheet (crowd, upcoming events, shifts worked, the drive there). The map has two
 * states (see game/day.ts): in the morning it is daylight and the dock leads to Prep and the
 * shift; in the evening it goes dark, the roads within tonight's range are lit, and the dock
 * leads to the results, a short hop or sleep.
 */

export interface HomeDeps {
  save: Save;
  /** The Prep screen, then the shift, in the current town. */
  startShift(): void;
  /** Evening: the Closing screen again, the Reviews screen, the supply yard, today's menu, and sleep. */
  openResults(): void;
  openReviews(): void;
  openSupplies(): void;
  openMenuRef(): void;
  sleep(): void;
  /** The save changed here (a drive, an upgrade picked): persist it and sync the truck's town. */
  commit(): void;
  /** The game menu (General & Settings). Another module owns it; home only asks for it. */
  openSettings(): void;
  /** The How to Play modal. */
  openHowTo(): void;
  /** A town to open the sheet on straight away, e.g. one the last shift unlocked. */
  focus?: string | null;
  sfx?: { whoosh(): void; coin(): void; tap(): void };
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
  observer: MutationObserver;
  onResize: () => void;
}

let cur: Mounted | null = null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const CROWD_ICON: Record<string, string> = { commuters: "truck", families: "people", foodies: "critic", party: "sparkle" };
const UPGRADE_ICON: Record<UpgradeId, string> = { bench: "patience", tipjar: "coin", turbo: "fryer", autostop: "tap", steady: "spatula" };

// ---------------------------------------------------------------------------
// Mounting

/** Build (or rebuild) the home screen inside `root`, centred on the truck. */
export function mountHome(root: HTMLElement, deps: HomeDeps): void {
  unmountHome();
  root.classList.add("home-host");
  root.innerHTML = shellHtml(deps.save);
  const el = root.querySelector<HTMLElement>(".home")!;
  el.classList.toggle("evening", deps.save.time === "evening");
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
  const m: Mounted = { root, el, map, world, pz, base: 1, deps, selected: null, at: performance.now(), driving: false, observer: null!, onResize: () => fitMap(true) };
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
  renderOffer(m);
  const focus = deps.focus && deps.focus !== deps.save.town && STOPS.some((t) => t.id === deps.focus) ? deps.focus : null;
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
  m.observer.disconnect();
  window.removeEventListener("resize", m.onResize);
  m.pz.destroy();
  m.root.classList.remove("home-host");
  if (m.root.contains(m.el)) m.el.remove();
}

/** Redraw the numbers and the dock after the save changed elsewhere. */
export function refreshHome(): void {
  if (!cur) return;
  cur.el.classList.toggle("evening", cur.deps.save.time === "evening");
  renderMapInto(cur);
  // A fresh SVG has no size until fitMap gives it one; without this the map came back as open sea.
  fitMap(true);
  cur.el.querySelector(".home-stats")!.outerHTML = statsHtml(cur.deps.save);
  renderDock(cur);
  renderOffer(cur);
  if (cur.selected) renderSheet(cur, cur.selected);
}

function shellHtml(save: Save): string {
  return `<div class="home bv bv-night">
    <header class="home-top">
      <div class="home-brand">
        <span class="home-logo" aria-label="Bun Voyage"><span class="w1">Bun</span><span class="w2">Voyage</span></span>${save.trips > 0 ? `<span class="bv-eyebrow">Trip ${save.trips + 1}</span>` : ""}
      </div>
      <div class="home-actions">
        <button class="bv-btn icon" data-home="howto" aria-label="How to play" title="How to play">${icon("help")}</button>
        <button class="bv-btn icon" data-home="settings" aria-label="Settings" title="Settings">${icon("settings")}</button>
      </div>
    </header>
    <div class="home-map" style="--home-sea:${SEA}">
      <div class="home-world"></div>
      ${statsHtml(save)}
      <div class="home-zoom">
        <button data-home="zoom-in" aria-label="Zoom in">${icon("plus")}</button>
        <button data-home="zoom-out" aria-label="Zoom out">${icon("minus")}</button>
        <button class="locate" data-home="locate" aria-label="Find the truck">${icon("truck")}</button>
      </div>
      <div class="home-dock bv-light"></div>
      <div class="home-sheet bv-light" hidden></div>
      <div class="home-offer" hidden></div>
    </div>
  </div>`;
}

/**
 * The dashboard card: the truck's four numbers, with the Day tile in coral because it is the one
 * that changes every morning, and the three doors (Menu or Results, Reviews, Supplies) in a row
 * under them. One card, so the map below it is the only other thing on the screen.
 */
function statsHtml(save: Save): string {
  const avg = save.ratingCount ? save.ratingSum / save.ratingCount : null;
  const evening = save.time === "evening";
  const last = save.last && save.last.town === save.town ? save.last : null;
  return `<div class="home-stats" role="group" aria-label="Your truck">
    <div class="home-stat time"><span class="bv-eyebrow">${evening ? "Evening" : "Morning"}</span><b>${icon(evening ? "moon" : "sun")}Day ${save.day}</b></div>
    <div class="home-stat ${save.bank < 15 ? "low" : ""}"><span class="bv-eyebrow">Budget</span><b>${icon("coin")}$${save.bank}</b></div>
    <div class="home-stat"><span class="bv-eyebrow">Popularity</span><b>${icon("people")}${save.popularity}</b></div>
    <div class="home-stat"><span class="bv-eyebrow">Rating</span><b>${icon("star")}${avg === null ? "–" : avg.toFixed(1)}${save.ratingCount ? `<small>· ${save.ratingCount}</small>` : ""}</b></div>
    <div class="home-stats-acts">
      ${evening ? `<button data-home="results" ${last ? "" : "disabled"}>${icon("receipt")}Results</button>` : `<button data-home="menuref">${icon("menu")}Menu</button>`}
      <button data-home="reviews">${icon("star")}Reviews</button>
      <button data-home="supplies">${icon("box")}Supplies</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// The map

/** The time of day and the range left, which decide when a drive can happen. */
function legs(s: Save): Legs {
  return { time: s.time, range: rangeUnits(s.gear), driven: s.driven };
}

/** Towns a drive reaches right now without the day passing. */
function reachable(s: Save): { id: string; path: string[] }[] {
  const out: { id: string; path: string[] }[] = [];
  for (const id of s.unlocked) {
    if (id === s.town) continue;
    const t = planTrip(s.town, id, s.unlocked, legs(s));
    if (t && t.when === "now") out.push({ id, path: t.path });
  }
  return out;
}

function renderMapInto(m: Mounted): void {
  const s = m.deps.save;
  m.world.innerHTML = renderMap({ town: s.town, unlocked: s.unlocked, shiftsIn: s.shiftsIn, day: s.day, selected: m.selected, night: s.time === "evening", reach: reachable(s) });
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
}
/** Screen px per map unit at which markers are drawn at their natural size. */
const MARKER_UNIT = 5.2;
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
  m.pz.resize(VIEW.w * m.base, VIEW.h * m.base, 0.9, 5, Math.round(Math.min(w * 0.3, h * 0.18)));
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
  if (!m || m.driving) return;
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
  const trip = planTrip(s.town, id, s.unlocked, legs(s));
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
  if (!t.roads.length) return n ? `${n} shift${n === 1 ? "" : "s"} here` : "Last stop of the trip";
  const { done, need } = unlockProgress(save.shiftsIn, t.id);
  return done >= need ? `${pipsHtml(done, need)} roads open` : `${pipsHtml(done, need)} ${done} of ${need} shifts to open the road`;
}

function renderDock(m: Mounted): void {
  const s = m.deps.save;
  const here = townById(s.town);
  const ev = eventOn(s.town, s.day);
  const dock = m.el.querySelector<HTMLElement>(".home-dock")!;
  const evening = s.time === "evening";
  const last = s.last && s.last.town === s.town ? s.last : null;
  const today = last ? `${last.profit >= 0 ? "+" : "−"}$${Math.abs(Math.round(last.profit))} today` : "A day on the road";
  const due = runningCost(s.gear);
  dock.innerHTML = `
    <div class="home-dock-row">
      <button class="home-dock-info" data-home="here" aria-label="About ${esc(here.name)}">
        <span class="bv-eyebrow">${evening ? "Evening in" : "Morning in"}</span>
        <b>${esc(here.name)}</b>
        <span class="bv-caption">${evening ? esc(today) : ev ? `${icon("flag")}${esc(ev.name)} today` : shiftsLine(s, here)}</span>
      </button>
      ${
        evening
          ? `<button class="bv-btn primary lg" data-home="sleep">${icon("moon")}Sleep<span class="cost">${due ? `−$${due}` : "free"}</span></button>`
          : `<button class="bv-btn primary lg" data-home="open" ${s.offer.length ? "disabled" : ""}>${icon("bell")}Prep &amp; Open</button>`
      }
    </div>`;
}

function when(day: number, d: number): string {
  return d === day ? "today" : d === day + 1 ? "tomorrow" : `in ${d - day} days`;
}

function calendarHtml(t: Stop, day: number): string {
  const span = 14;
  const cells: string[] = [];
  const seen = new Map<string, number>();
  for (let d = day; d < day + span; d++) {
    const e = eventOn(t.id, d);
    if (e && !seen.has(e.id)) seen.set(e.id, d);
    cells.push(`<span class="home-day ${d === day ? "today" : ""} ${e ? "ev" : ""}" title="Day ${d}${e ? `: ${esc(e.name)}` : ""}">${d}</span>`);
  }
  const own = EVENTS.filter((e) => e.town === t.id);
  let note: string;
  if (seen.size) {
    note = [...seen].map(([id, d]) => {
      const e = EVENTS.find((x) => x.id === id)!;
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
  const trip = here || !open ? null : planTrip(s.town, id, s.unlocked, legs(s));
  const best = s.best[id];
  const busy = s.offer.length > 0;
  const evening = s.time === "evening";

  let action: string;
  if (here) {
    action = evening
      ? `<button class="bv-btn primary lg block" data-home="sleep">${icon("moon")}Sleep here<span class="cost">${runningCost(s.gear) ? `−$${runningCost(s.gear)}` : "free"}</span></button>
      <span class="bv-caption">Tomorrow: ${eventOn(id, s.day + 1) ? `${esc(eventOn(id, s.day + 1)!.name)} here.` : `shift ${(s.shiftsIn[id] ?? 0) + 1} here, or set off.`}</span>`
      : `<button class="bv-btn primary lg block" data-home="open" ${busy ? "disabled" : ""}>${icon("bell")}Prep &amp; Open${ev ? ` · ${esc(ev.name)}` : ""}</button>
      <span class="bv-caption">${busy ? "Pick your upgrade first." : ev ? "Event day: a longer, busier shift with its own crowd." : `Shift ${(s.shiftsIn[id] ?? 0) + 1} here. A shift fills the day.`}</span>`;
  } else if (trip) {
    const afford = canAfford(trip, s.bank);
    const can = afford && !busy && trip.when !== "tomorrow";
    const how = trip.when === "now" ? (evening ? "tonight" : "this morning") : trip.when === "day" ? "takes the day" : "tomorrow";
    const roads = `${trip.hops} road${trip.hops === 1 ? "" : "s"}, ${miles(trip.distance)} mi`;
    const range = rangeMiles(s.gear);
    const left = Math.max(0, Math.round(range - s.driven * 3));
    action = `<button class="bv-btn primary lg block" data-home="drive" data-id="${id}" ${can ? "" : "disabled"}>${icon("truck")}Drive here · ${how}<span class="cost">$${trip.cost}</span></button>
      <span class="bv-caption ${afford ? "" : "warn"}">${
        !afford
          ? `Not enough gas money: $${trip.cost} needed, $${s.bank} in the tin.`
          : trip.when === "now"
            ? evening
              ? `${roads}. Fits tonight's range (${left} mi left). Wake up there tomorrow.`
              : `${roads}. Within range, so you're there before the window opens.`
            : trip.when === "day"
              ? `${roads}. Further than the ${range} mi range: the drive takes the whole day, no shift today.`
              : `${roads}. Too far for tonight (${left} mi left of ${range}). Set off in the morning.`
      }</span>`;
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
      <button class="bv-btn icon" data-home="close" aria-label="Close">${icon("close")}</button>
    </div>
    <p class="bv-body home-blurb">${esc(t.blurb)} ${esc(crowd.blurb)}</p>
    ${calendarHtml(t, s.day)}
    <div class="home-facts">
      <div><span class="bv-eyebrow">Shifts here</span><b>${t.roads.length ? pipsHtml(unlockProgress(s.shiftsIn, id).done, SHIFTS_TO_UNLOCK) : ""}${s.shiftsIn[id] ?? 0}</b></div>
      <div><span class="bv-eyebrow">Best shift</span><b>${best !== undefined ? `${icon("star")}${best.toFixed(1)}` : "–"}</b></div>
      <div><span class="bv-eyebrow">${trip ? "From here" : "Customers"}</span><b>${trip ? `${miles(trip.distance)} mi` : `${icon("people")}~${expectedCustomers({ stop: withEvent(t, ev), plan: null, popularity: s.popularity, ads: here ? s.ads : 0, rep: s.rep, upgrades: s.upgrades, gear: s.gear })}`}</b></div>
    </div>
    ${open && t.newThing && !(s.shiftsIn[id] ?? 0) ? `<div class="bv-callout new">${icon("new")}<span>${esc(t.newThing)}</span></div>` : ""}
    <div class="home-action">${action}</div>`;
  sheet.hidden = false;
}

// ---------------------------------------------------------------------------
// Actions

function onClick(e: Event): void {
  const m = cur;
  if (!m) return;
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-home]");
  if (!btn || btn.hasAttribute("disabled")) return;
  // A double tap on the screen before this one shouldn't press a button here.
  if (performance.now() - m.at < 450) return;
  const act = btn.dataset.home!;
  const s = m.deps.save;
  switch (act) {
    case "open":
      if (s.offer.length && s.time === "morning") break;
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
      m.deps.openResults();
      break;
    case "reviews":
      m.deps.openReviews();
      break;
    case "supplies":
      m.deps.openSupplies();
      break;
    case "menuref":
      m.deps.openMenuRef();
      break;
    case "here":
      m.deps.sfx?.tap();
      select(m, s.town, true);
      break;
    case "close":
      deselect(m);
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
    case "pick":
      pick(m, btn.dataset.id as UpgradeId);
      break;
    case "settings":
      m.deps.openSettings();
      break;
    case "howto":
      m.deps.openHowTo();
      break;
  }
}

function toast(m: Mounted, text: string): void {
  m.el.querySelector(".home-toast")?.remove();
  const t = document.createElement("div");
  t.className = "home-toast";
  t.innerHTML = `${icon("warning")}<span>${esc(text)}</span>`;
  m.map.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function drive(m: Mounted, to: string): void {
  const s = m.deps.save;
  if (m.driving || s.offer.length) return;
  const trip = planTrip(s.town, to, s.unlocked, legs(s));
  if (!trip || trip.when === "tomorrow") return;
  if (!applyTrip(s, trip)) {
    toast(m, `Not enough gas money: $${trip.cost} needed.`);
    return;
  }
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
    // A day on the road lands on the evening map, and the lit roads change with what's left of the range.
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

function pick(m: Mounted, id: UpgradeId): void {
  const s = m.deps.save;
  if (!s.offer.includes(id)) return;
  s.upgrades.push(id);
  s.offer = [];
  m.deps.commit();
  m.deps.sfx?.coin();
  renderOffer(m);
  renderDock(m);
  if (m.selected) renderSheet(m, m.selected);
}

function renderOffer(m: Mounted): void {
  const s = m.deps.save;
  const box = m.el.querySelector<HTMLElement>(".home-offer")!;
  const offers = s.offer.map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean);
  // In the evening the pick lives on the Closing screen (Results); the card here catches a pick left until morning.
  if (!offers.length || s.time === "evening") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<div class="bv-card">
    <span class="bv-eyebrow">Shift passed · ${esc(townById(s.town).name)}</span>
    <h2 class="bv-title">Pick a truck upgrade</h2>
    <p class="bv-body">One of these goes on the truck for good.</p>
    <div class="home-offers">${offers.map((u) => `<button class="home-offer-btn" data-home="pick" data-id="${u.id}"><b>${icon(UPGRADE_ICON[u.id] ?? "sparkle")}${esc(u.name)}</b><span>${esc(u.text)}</span></button>`).join("")}</div>
  </div>`;
  box.hidden = false;
}
