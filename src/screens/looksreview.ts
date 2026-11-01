import { DEFAULT_LOOK, LOOKS, SLOTS, type Look } from "../game/looks";
import { truckSvg } from "./truckart";

/** The catalogue page (looks.html): every cosmetic on the truck, by day and by night. */
const root = document.getElementById("looks")!;
const money = (n: number) => (n ? `$${n.toLocaleString("en-US")}` : "Free");
const card = (look: Look, title: string, sub: string, night: boolean) =>
  `<figure class="${night ? "n" : ""}">${truckSvg(look, { night, width: 300 })}<figcaption><b>${title}</b><span>${sub}</span></figcaption></figure>`;
let html = `<style>
  body{margin:0;background:#f4ede0;font-family:"Hanken Grotesk",system-ui,sans-serif;color:#3f3630}
  h2{font-family:"Young Serif",serif;font-weight:400;margin:28px 16px 8px}
  .row{display:flex;flex-wrap:wrap;gap:12px;padding:0 16px}
  figure{margin:0;background:#fbf7ef;border-radius:14px;padding:10px;width:300px}
  figure.n{background:linear-gradient(#1b2036,#2a3356)}
  figure.n figcaption{color:#e9e1d2}
  figcaption{display:grid;font-size:13px;margin-top:4px}
</style>`;
for (const s of SLOTS) {
  html += `<h2>${s.name}</h2><div class="row">`;
  for (const it of LOOKS.filter((l) => l.slot === s.id)) {
    const look = { ...DEFAULT_LOOK, [s.id]: it.id };
    html += card(look, it.name, `${money(it.price)}${it.town ? " · souvenir" : ""}`, false);
    html += card(look, it.name, "at night", true);
  }
  html += `</div>`;
}
root.innerHTML = html;

// The road map's truck: the same looks, drawn small.
const combos: Partial<Look>[] = [{}, { paint: "twotone", awning: "stripes", roof: "surf", wheels: "whitewall" }, { paint: "woodie", roof: "canoe", tag: "trailer", lights: "string" }, { paint: "chrome", roof: "neon", lights: "marquee", tag: "dog" }, { paint: "gold", awning: "velvet", roof: "hottub", lights: "search", wheels: "spinners", tag: "balloon" }, { paint: "dusk", roof: "windmill", tag: "airship" }, { paint: "sage", roof: "burger", awning: "teal" }, { roof: "herbs", paint: "butter" }];
let mini = `<h2>On the map</h2><div class="row">`;
for (const c of combos) for (const night of [false, true]) mini += `<figure class="${night ? "n" : ""}" style="width:150px">${truckSvg({ ...DEFAULT_LOOK, ...c }, { mini: true, night, width: 70 })}${truckSvg({ ...DEFAULT_LOOK, ...c }, { mini: true, night, width: 34 })}</figure>`;
root.insertAdjacentHTML("afterbegin", mini + `</div>`);
