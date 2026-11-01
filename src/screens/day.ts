import { CROWD, menuOf, PRICE, QUALITY, recipeCost, type Plan } from "../game/business";
import { GEAR, gearBlocker, projectShift, rangeMiles, RUNNING_COST, runningCost, solarSaving, type Projection } from "../game/day";
import { ADS, type AdLevel } from "../game/line";
import { criticChance, willingnessToPay, type PressPiece } from "../game/press";
import { UPGRADES, type Closing, type Save, type Upgrade } from "../game/progress";
import { eventOn, townById, type Stop } from "../game/stops";
import { SHIFTS_TO_UNLOCK } from "../game/travel";
import { icon } from "../ui/icons";
import { buildLabel } from "../update";
import "./day.css";

/**
 * The screens on either side of a shift, and the small ones off the map (see game/day.ts):
 *
 * - **Prep**, before opening: the day's choices in expand boxes. A closed box shows the choice
 *   on the left and what it does to the day on the right, so the screen reads as a short plan
 *   with nothing open. The ledger box is the projected receipt. The Open button carries the net.
 * - **Closing**, after the shift: the stars, three numbers, then the same boxes for takings,
 *   today's reviews, the press, the road and the free pick.
 * - **Night**: a card that charges the running cost and turns the day.
 * - **Reviews** and the **supply yard**, reached from the map's dock.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const cents = (n: number) => `$${n.toFixed(2)}`;
const range = (lo: number, hi: number) => `$${Math.round(lo)}–${Math.round(hi)}`;
const stars = (n: number) => `<span class="day-stars"><span>${"★".repeat(n)}</span><span class="off">${"★".repeat(Math.max(0, 3 - n))}</span></span>`;
const CROWD_ICON: Record<string, string> = { commuters: "truck", families: "people", foodies: "critic", party: "sparkle" };

/** Which boxes are open, per screen. Remembered while the app runs; Prep's "simple" is in the save. */
const openBoxes = new Set<string>(["closing:road"]);
export function toggleBox(id: string): void {
  if (openBoxes.has(id)) openBoxes.delete(id);
  else openBoxes.add(id);
}
export function closeBoxes(prefix: string): void {
  for (const id of [...openBoxes]) if (id.startsWith(prefix)) openBoxes.delete(id);
}

interface Box {
  id: string;
  icon: string;
  title: string;
  sub: string;
  /** The effect, in mono, and a word under it. */
  value: string;
  unit?: string;
  warn?: boolean;
  body: string;
}

function boxHtml(b: Box, act: string): string {
  const open = openBoxes.has(b.id);
  return `<section class="day-box ${open ? "open" : ""}">
    <button class="day-box-h" data-act="${act}" data-v="${b.id}" aria-expanded="${open}">
      <span class="ic">${icon(b.icon)}</span>
      <span class="t"><b>${b.title}</b><small>${b.sub}</small></span>
      <span class="v">${b.value}${b.unit ? `<small class="${b.warn ? "warn" : ""}">${b.unit}</small>` : ""}</span>
      <span class="chev">${icon("down")}</span>
    </button>
    <div class="day-box-b" ${open ? "" : "hidden"}>${b.body}</div>
  </section>`;
}

function seg(act: string, cur: string, opts: { v: string; label: string; small?: string; disabled?: boolean }[]): string {
  return `<div class="bv-seg compact" role="group">${opts
    .map((o) => `<button data-act="${act}" data-v="${o.v}" aria-pressed="${o.v === cur}" ${o.disabled ? "disabled" : ""}>${o.label}${o.small ? `<small>${o.small}</small>` : ""}</button>`)
    .join("")}</div>`;
}

function ledgerHtml(p: Projection, plan: Plan | null, crowdLabel: string, head: string, tail = ""): string {
  const row = (dt: string, dd: string, cls = "", sub = "") => `<dt class="${cls}">${dt}${sub ? `<small>${sub}</small>` : ""}</dt><dd class="${cls}">${dd}</dd>`;
  return `<div class="day-ledger">
    <h4><span>${head}</span><span>±15%</span></h4>
    <dl>
      ${row("Customers", String(p.customers), "", `${crowdLabel}${plan ? ` · ${PRICE[plan.price].label} prices` : ""}`)}
      ${row("Takings", money(p.takings), "", `${cents(p.order)} an order`)}
      ${row("Tips", money(p.tips))}
      ${plan ? row("Ingredients", `−${money(p.ingredients)}`, "neg", `${QUALITY[plan.quality].label} · ${cents(p.perOrder)} an order`) : ""}
      ${p.adCost ? row("Social media", `−${money(p.adCost)}`, "neg") : ""}
      ${row("Generator and propane", `−${money(p.running)}`, "neg", "charged tonight")}
      ${p.solar ? row("Solar", `+${money(Math.min(p.running, p.solar))}`, "sub") : ""}
      ${row("Net", range(p.lo, p.hi), "tot")}
    </dl>${tail}
  </div>`;
}

// ---------------------------------------------------------------------------
// Prep

export interface PrepInput {
  save: Save;
  /** Today's town, with its event applied. */
  stop: Stop;
  /** Business mode's plan, or null in normal mode. */
  plan: Plan | null;
}

export function prepHtml(p: PrepInput): string {
  const { save, stop, plan } = p;
  const simple = save.simplePlan;
  const proj = projectShift({ stop, plan, popularity: save.popularity, ads: save.ads, rep: save.rep, upgrades: save.upgrades, gear: save.gear });
  const ev = eventOn(stop.id, save.day);
  const crowd = CROWD[stop.crowd];
  const tomorrow = eventOn(stop.id, save.day + 1);
  const critic = criticChance(stop.crowd, ev);
  const wtp = willingnessToPay(save.popularity, save.rep);
  const boxes: Box[] = [];

  const expectAt = (lvl: AdLevel) => projectShift({ stop, plan, popularity: save.popularity, ads: lvl, rep: save.rep, upgrades: save.upgrades, gear: save.gear }).customers;
  boxes.push({
    id: "prep:who",
    icon: CROWD_ICON[stop.crowd] ?? "people",
    title: "Who's coming",
    sub: `${crowd.label}${ev ? ` · ${esc(ev.name)} today` : ""}${save.ads ? ` · ${ADS[save.ads].label.toLowerCase()}` : ""}`,
    value: `~${proj.customers}`,
    unit: "customers",
    body: `<div class="day-crowd">${icon(CROWD_ICON[stop.crowd] ?? "people")}<span><b>${crowd.label}.</b> ${esc(crowd.blurb)} Patience ×${crowd.patience.toFixed(2)}, tips ×${crowd.tips.toFixed(1)}. A critic today: ${critic >= 0.5 ? "likely" : critic >= 0.25 ? "possible" : "unlikely"}.</span></div>
      ${ev ? `<div class="bv-callout">${icon("flag")}<span><b>${esc(ev.name)}.</b> ${esc(ev.blurb)} Busier and longer${ev.special ? `, with a special: ${esc(ev.special.name)}` : ""}.</span></div>` : ""}
      ${tomorrow ? `<div class="day-note">${icon("calendar")}<span><b>Tomorrow:</b> ${esc(tomorrow.name)} here.</span></div>` : ""}
      <div class="day-field"><span class="bv-eyebrow"><span>${icon("people")}Social media</span><span>Popularity ${save.popularity}</span></span>
      ${seg("prep-ads", String(save.ads), ADS.map((a, i) => ({ v: String(i), label: a.label, small: `${a.cost ? `$${a.cost}` : "free"} · ~${expectAt(i as AdLevel)}`, disabled: save.bank < a.cost })))}
      <span class="day-hint">${esc(ADS[save.ads].blurb)}${ADS[save.ads].buzz ? ` Popularity +${ADS[save.ads].buzz} today, +${ADS[save.ads].lasting} for good.` : " Fewer people come to a truck nobody knows yet; good shifts spread the word."}</span></div>`,
  });

  if (plan) {
    const menu = menuOf(stop, plan);
    const mult = PRICE[plan.price].mult;
    boxes.push({
      id: "prep:menu",
      icon: "menu",
      title: "Menu",
      sub: `${menu.length} of ${stop.menu.length} dishes`,
      value: cents(proj.avgPrice),
      unit: "avg price",
      body: `<div class="day-mlist">${stop.menu
        .map((r) => {
          const on = plan.menu.includes(r.name);
          const keep = r.price * mult - recipeCost(r, plan.quality);
          return `<button class="day-mrow" data-act="plan-m" data-v="${esc(r.name)}" aria-pressed="${on}"><span class="box">${icon("check")}</span><span class="nm">${esc(r.name)}${r.from ? `<small>Joins the menu ${Math.round(r.from * 100)}% of the way through</small>` : ""}</span><span class="pr">${cents(r.price * mult)}<small class="${keep < 4 ? "thin" : ""}">keeps ${cents(keep)}</small></span></button>`;
        })
        .join("")}</div>
        <span class="day-hint">More choice brings a few more customers. Two dishes minimum.</span>`,
    });
    boxes.push({
      id: "prep:ing",
      icon: "quality",
      title: "Ingredients",
      sub: esc(QUALITY[plan.quality].blurb),
      value: cents(proj.perOrder),
      unit: "an order",
      body: `${seg("plan-q", plan.quality, (Object.keys(QUALITY) as (keyof typeof QUALITY)[]).map((q) => ({ v: q, label: QUALITY[q].label, small: `×${QUALITY[q].cost}` })))}
        <span class="day-hint">${crowd.qualityWeight >= 1.4 ? `${crowd.label} notice ingredients a lot.` : crowd.qualityWeight <= 0.6 ? `${crowd.label} barely notice ingredients.` : `${crowd.label} notice ingredients a little.`} Each step of quality is worth about ${Math.round(8 * crowd.qualityWeight)} rating points per order.</span>`,
    });
    boxes.push({
      id: "prep:price",
      icon: "tag",
      title: "Prices",
      sub: esc(PRICE[plan.price].blurb),
      value: `×${PRICE[plan.price].traffic.toFixed(2)}`,
      unit: "customers",
      body: `${seg("plan-p", plan.price, (Object.keys(PRICE) as (keyof typeof PRICE)[]).map((k) => ({ v: k, label: PRICE[k].label, small: k === "fair" ? "as expected" : `${PRICE[k].mult > 1 ? "+" : "−"}${Math.round(Math.abs(PRICE[k].mult - 1) * 100)}%` })))}
        <span class="day-hint">Reputation ${save.rep.toFixed(1)}★ and popularity ${save.popularity}: people will pay <b>${wtp >= 0.5 ? "well above fair" : wtp >= 0.15 ? "a bit above fair" : wtp > -0.15 ? "fair prices" : "below fair"}</b> without complaint.${crowd.priceSensitivity >= 1.3 ? ` ${crowd.label} watch their wallets.` : ""}</span>`,
    });
  }

  const solar = solarSaving(save.gear);
  boxes.push({
    id: "prep:run",
    icon: "flame",
    title: "Running costs",
    sub: `Generator and propane${solar ? " · solar" : ""}`,
    value: `−$${runningCost(save.gear)}`,
    unit: solar ? "after solar" : "a night",
    body: `<span class="day-hint">Every night costs $${RUNNING_COST} for the generator and propane, charged when you sleep. ${
      solar ? `Your panels cover $${solar} of it.` : "A roof solar panel from the Summit City supply yard covers $5 of it and pays for itself in about twelve days."
    } Overnight range: ${rangeMiles(save.gear)} mi.</span>`,
  });

  if (!simple) {
    boxes.push({ id: "prep:ledger", icon: "receipt", title: "Ledger", sub: "What today should earn", value: range(proj.lo, proj.hi), unit: "net", body: ledgerHtml(proj, plan, crowd.label, `Day ${save.day} · ${esc(stop.name)}`) });
  }

  return `<div class="day-screen bv">
    <header class="day-top">
      <button class="bv-btn icon" data-act="back" aria-label="Back to the map">${icon("back")}</button>
      <div class="where"><span class="bv-eyebrow">Day ${save.day} · Prep</span><b>${esc(stop.name)}</b></div>
      <span class="bv-chip pill">${crowd.label}</span>
    </header>
    <div class="day-scroll">
      ${plan ? `<div class="day-pref"><span>${simple ? "Balanced" : "Complex"}</span><button data-act="prep-simple">${simple ? "Show more detail" : "Keep it simple"}</button></div>` : ""}
      ${boxes.map((b) => boxHtml(b, "prep-box")).join("")}
      ${plan ? "" : `<span class="day-hint">Simple complexity: the menu and prices are set for you. Balanced or Complex (in Settings) puts them on this screen.</span>`}
    </div>
    <footer class="day-foot">
      <div class="sum"><span class="bv-eyebrow">Projected net</span><b>${range(proj.lo, proj.hi)}</b></div>
      <button class="bv-btn primary lg" data-act="open">${icon("bell")}Open</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
// Closing

export function closingHtml(c: Closing, save: Save, offer: Upgrade[]): string {
  const town = townById(c.town);
  const avg = c.stars.length ? c.stars.reduce((a, b) => a + b, 0) / c.stars.length : 0;
  const verdict =
    c.served === 0
      ? "The truck stayed quiet today."
      : c.outcome === "failed"
        ? `${town.name} wasn't impressed. Serve at least half the customers with a 1★ average to count the day.`
        : avg >= 2.5
          ? `${town.name} will be talking about this for weeks.`
          : avg >= 1.5
            ? "Solid shift. Everyone left full."
            : "A rough day at the grill, but you made it.";
  const net = c.profit - c.running + Math.min(c.running, c.solar);
  const lifetime = save.ratingCount ? save.ratingSum / save.ratingCount : avg;
  const row = (dt: string, dd: string, cls = "", sub = "") => `<dt class="${cls}">${dt}${sub ? `<small>${sub}</small>` : ""}</dt><dd class="${cls}">${dd}</dd>`;
  const onTarget = c.projected ? (net < c.projected[0] ? "Under" : net > c.projected[1] ? "Over" : "On target") : "";
  const boxes: Box[] = [];
  boxes.push({
    id: "closing:take",
    icon: "receipt",
    title: "Takings",
    sub: `${c.served} order${c.served === 1 ? "" : "s"}${c.lost ? ` · ${c.lost} walked out` : ""}${c.leftLine ? ` · ${c.leftLine} left the line` : ""}`,
    value: money(net),
    unit: "net",
    body: `<div class="day-ledger"><h4><span>Day ${c.day}</span><span>${esc(town.name)}</span></h4><dl>
      ${row("Sales", money(c.earned))}
      ${row("Tips", money(c.tips))}
      ${c.spills ? row("Spilled soda", `−${money(c.spills)}`, "neg") : ""}
      ${c.adCost ? row("Social media", `−${money(c.adCost)}`, "neg") : ""}
      ${c.biz ? row("Ingredients", `−${money(c.costs)}`, "neg") : ""}
      ${row("Generator and propane", `−${money(c.running)}`, "neg", "charged tonight")}
      ${c.solar ? row("Solar", `+${money(Math.min(c.running, c.solar))}`, "sub") : ""}
      ${row("Net", money(net), "tot")}
    </dl>${c.projected ? `<div class="foot"><span>Projected ${range(c.projected[0], c.projected[1])}</span><b>${onTarget}</b></div>` : ""}</div>
    ${c.best ? `<span class="day-hint">Best order: ${esc(c.best)}.</span>` : ""}`,
  });
  if (c.biz) {
    boxes.push({
      id: "closing:rev",
      icon: "star",
      title: "Today's reviews",
      sub: c.served ? (c.reviews.length ? `From ${c.served} orders; best and worst below` : `${c.served} orders, no written reviews`) : "Nobody was served",
      value: `${avg.toFixed(1)}★`,
      unit: `rep ${c.repBefore.toFixed(1)} → ${c.rep.toFixed(1)}`,
      body: `<ul class="day-rev">${c.reviews.slice(0, 3).map((r) => `<li>${stars(r.stars)}<q>${esc(r.text)}</q></li>`).join("")}</ul>
        <button class="bv-btn sm" data-act="reviews">${icon("review")}All ${save.reviews.length} reviews</button>`,
    });
  }
  boxes.push({
    id: "closing:press",
    icon: "critic",
    title: "Press",
    sub: c.press ? `A critic ate here today` : "No critic today",
    value: c.pop[0] === c.pop[1] ? "—" : `${c.pop[1] > c.pop[0] ? "+" : "−"}${Math.abs(c.pop[1] - c.pop[0])}`,
    unit: c.pop[0] === c.pop[1] ? "" : `popularity ${c.pop[0]} → ${c.pop[1]}`,
    body: c.press ? pressHtml(c.press) : `<span class="day-hint">Popularity ${c.pop[1]}. Happy customers tell their friends; walk-outs tell theirs. Critics turn up more at events and in foodie towns.</span>`,
  });
  const left = SHIFTS_TO_UNLOCK - c.shiftsHere;
  const opened = c.opened.map((id) => townById(id).name);
  boxes.push({
    id: "closing:road",
    icon: "road",
    title: "The road",
    sub: c.outcome === "failed" ? "Shift not counted" : `Good shift · ${Math.min(c.shiftsHere, SHIFTS_TO_UNLOCK)} of ${SHIFTS_TO_UNLOCK} in ${esc(town.name)}`,
    value: opened.length ? "New road" : c.outcome === "trip" ? "Trip done" : c.outcome === "failed" ? "—" : left > 0 && town.roads.length ? `${left} more` : "Open",
    unit: "",
    body: `<div class="day-road"><span class="day-pips">${Array.from({ length: SHIFTS_TO_UNLOCK }, (_, i) => `<i class="${i < c.shiftsHere ? (i === c.shiftsHere - 1 && c.outcome !== "failed" ? "new" : "on") : ""}"></i>`).join("")}</span>
      <span>${
        c.outcome === "trip"
          ? "You've reached the end of the road. Every town stays open, so keep touring or start a new trip from the menu."
          : opened.length
            ? `<b>${opened.map(esc).join(" and ")}</b> ${opened.length > 1 ? "are" : "is"} open. Tap ${opened.length > 1 ? "one" : "it"} on the map to see the drive.`
            : c.outcome === "failed"
              ? "Serve at least half the customers with a 1★ average and the day counts toward the road."
              : left > 0 && town.roads.length
                ? `${left === 1 ? "One more good shift opens" : `${left} more good shifts open`} the road on.`
                : "The roads out of here are open."
      }</span></div>`,
  });
  if (offer.length && c.outcome !== "failed") {
    boxes.push({
      id: "closing:pick",
      icon: "sparkle",
      title: "A gift from the locals",
      sub: "Pick one. It stays on the truck.",
      value: "Free",
      unit: "",
      body: `<div class="day-offers">${offer.map((u) => `<button class="day-offer" data-act="pick" data-id="${u.id}"><b>${esc(u.name)}</b><span>${esc(u.text)}</span></button>`).join("")}</div>`,
    });
    openBoxes.add("closing:pick");
  }

  return `<div class="day-screen bv closing">
    <header class="day-hero">
      <span class="bv-eyebrow">Closing time · Day ${c.day}</span>
      <h2 class="bv-title">${esc(town.name)}</h2>
      <div class="day-hero-stars" aria-label="${avg.toFixed(1)} stars average">${stars(Math.round(avg))} <span class="bv-mono">${avg.toFixed(1)}</span></div>
      <p>${verdict}</p>
    </header>
    <div class="day-scroll">
      <div class="day-kpis">
        <div class="day-kpi"><span class="bv-eyebrow">Net</span><b class="${net >= 0 ? "up" : "dn"}">${net >= 0 ? "+" : ""}${money(net)}</b><small>after costs</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Rating</span><b>${avg.toFixed(1)}</b><small>lifetime ${lifetime.toFixed(1)}</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">Served</span><b>${c.served}</b><small>${c.lost + c.leftLine ? `${c.lost + c.leftLine} left` : "nobody left"}</small></div>
      </div>
      ${boxes.map((b) => boxHtml(b, "closing-box")).join("")}
      <p class="day-build">${esc(buildLabel())}</p>
    </div>
    <footer class="day-foot">
      <button class="bv-btn primary lg block" data-act="evening">${icon("moon")}Evening map</button>
    </footer>
  </div>`;
}

const OUTLET_LABEL = { paper: "Newspaper", magazine: "Magazine", tv: "On TV" } as const;

export function pressHtml(p: PressPiece): string {
  return `<div class="day-press ${p.outlet}">
    <span class="bv-eyebrow">${OUTLET_LABEL[p.outlet]} · ${esc(p.source)}</span>
    <b>${esc(p.headline)}</b>
    <q>${stars(p.stars)} ${esc(p.quote)}</q>
    <small>${p.pop >= 0 ? "+" : "−"}${Math.abs(p.pop)} popularity</small>
  </div>`;
}

// ---------------------------------------------------------------------------
// Reviews

export type ReviewFilter = "all" | "critics" | "good" | "bad" | "here";

export function reviewsHtml(save: Save, filter: ReviewFilter): string {
  const here = townById(save.town).name;
  const press = save.press;
  const reviews = save.reviews;
  const list =
    filter === "critics"
      ? []
      : reviews.filter((r) => filter === "all" || (filter === "good" && r.stars >= 3) || (filter === "bad" && r.stars <= 1) || (filter === "here" && r.stop === here));
  const showPress = filter === "all" || filter === "critics";
  const f = (v: ReviewFilter, label: string) => `<button data-act="rf" data-v="${v}" aria-pressed="${filter === v}">${label}</button>`;
  return `<div class="day-screen bv">
    <header class="day-top">
      <button class="bv-btn icon" data-act="back" aria-label="Back to the map">${icon("back")}</button>
      <div class="where"><span class="bv-eyebrow">${reviews.length} review${reviews.length === 1 ? "" : "s"} · ${press.length} clipping${press.length === 1 ? "" : "s"}</span><b>Popularity &amp; reviews</b></div>
    </header>
    <div class="day-scroll">
      <div class="day-kpis two">
        <div class="day-kpi"><span class="bv-eyebrow">${icon("people")}Popularity</span><b>${save.popularity}<small class="of">/100</small></b><small>How many people have heard of the truck. More people come to the window.</small></div>
        <div class="day-kpi"><span class="bv-eyebrow">${icon("star")}Rating</span><b>${save.ratingCount ? (save.ratingSum / save.ratingCount).toFixed(1) : "–"} <span class="st">★</span></b><small>${save.ratingCount ? `Average over ${save.ratingCount} order${save.ratingCount === 1 ? "" : "s"}.` : "No orders yet."} Good ratings bring people back and spread the word.</small></div>
      </div>
      <div class="day-filters">${f("all", "All")}${f("critics", "Critics")}${f("good", "3★")}${f("bad", "1★")}${f("here", esc(here))}</div>
      <div class="day-rlist">
        ${showPress ? press.map((p) => `<div class="day-rcard critic">${pressHtml(p)}</div>`).join("") : ""}
        ${list.map((r) => `<div class="day-rcard"><div class="h">${stars(r.stars)}<span class="who">${esc(r.stop)}</span></div><q>${esc(r.text)}</q></div>`).join("")}
        ${!list.length && !(showPress && press.length) ? `<span class="day-hint">${reviews.length || press.length ? "Nothing here yet." : "No reviews yet. Customers write one after they eat, and critics turn up at events and in foodie towns."}</span>` : ""}
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Supply yard

export function suppliesHtml(save: Save): string {
  const here = townById(save.town);
  const sellsHere = GEAR.some((g) => g.soldAt === here.id);
  return `<div class="day-screen bv">
    <header class="day-top">
      <button class="bv-btn icon" data-act="back" aria-label="Back to the map">${icon("back")}</button>
      <div class="where"><span class="bv-eyebrow">${sellsHere ? `${esc(here.name)} supply yard` : "Sold in the big cities"}</span><b>Supplies</b></div>
      <span class="bv-chip pill">${icon("coin")}$${save.bank}</span>
    </header>
    <div class="day-scroll">
      <span class="day-hint">Parts for the truck, bought for cash where they're sold. Running cost tonight: $${runningCost(save.gear)}. Overnight range: ${rangeMiles(save.gear)} mi.</span>
      <div class="day-gear">${GEAR.map((g) => {
        const why = gearBlocker(g, save.gear, save.town, save.bank);
        const owned = save.gear.includes(g.id);
        return `<div class="day-gear-row ${owned ? "owned" : ""}">
          <span class="ic">${icon(g.id.startsWith("solar") ? "sun" : "truck")}</span>
          <span class="t"><b>${esc(g.name)}</b><small>${esc(g.text)}</small><small class="where">${owned ? "Fitted" : `Sold in ${esc(townById(g.soldAt).name)}`}</small></span>
          ${owned ? `<span class="bv-chip ok">${icon("check")}Fitted</span>` : `<button class="bv-btn sm ${why ? "" : "primary"}" data-act="buy" data-id="${g.id}" ${why ? "disabled" : ""}>$${g.cost}</button>`}
          ${why && !owned ? `<small class="why">${esc(why)}</small>` : ""}
        </div>`;
      }).join("")}</div>
      <div class="day-gear-owned"><span class="bv-eyebrow">Kitchen upgrades</span><span class="day-hint">${save.upgrades.length ? save.upgrades.map((u) => esc(UPGRADES.find((x) => x.id === u)?.name ?? u)).join(", ") : "None yet. The locals offer one after a good shift."}</span></div>
    </div>
  </div>`;
}
