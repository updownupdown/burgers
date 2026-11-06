/**
 * Bun Voyage icon set.
 *
 * Every icon is drawn on a 24 x 24 grid with a 1.75px stroke, round caps and
 * joins, no fills, in `currentColor`. They inherit the text colour of whatever
 * they sit in, so a paprika button gets paprika icons for free.
 *
 * Usage:
 *   import { icon } from "./ui/icons";
 *   el.innerHTML = `<button class="bv-btn">${icon("grill")} Grill</button>`;
 *
 * `icon()` returns an inline <svg>. Size it with CSS (`.bv-icon { width: 1em }`
 * is the default in components.css) or pass `size`. To add an icon, add one entry
 * to ICONS: inner SVG markup only (paths, circles, lines). The review page
 * (ui.html) picks it up automatically.
 */

export type IconGroup = "system" | "kitchen" | "food" | "trip" | "money" | "feedback";

interface IconDef {
  group: IconGroup;
  /** Inner SVG markup on the 24-grid. Use stroke only, no fill, no colours. */
  svg: string;
  /** Search words besides the name. */
  tags?: string;
}

const C = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const P = (d: string) => `<path d="${d}"/>`;
const DOT = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="0.6" fill="currentColor" stroke="none"/>`;

export const ICONS: Record<string, IconDef> = {
  /* ---- system ------------------------------------------------------- */
  logo: { group: "system", svg: P("M12 6a7 7 0 0 1 7 7v2H5v-2a7 7 0 0 1 7-7zM4 18h16") + `<circle cx="12" cy="3.6" r="1.4" fill="currentColor" stroke="none"/>`, tags: "bun voyage mark cloche burger knob" }, // one-colour version; public/logo.svg is the same mark in cream with a white knob
  menu: { group: "system", svg: P("M4 7h16M4 12h16M4 17h16"), tags: "hamburger lines" },
  close: { group: "system", svg: P("M6 6l12 12M18 6L6 18"), tags: "x dismiss" },
  back: { group: "system", svg: P("M15 5l-7 7 7 7"), tags: "chevron left arrow" },
  forward: { group: "system", svg: P("M9 5l7 7-7 7"), tags: "chevron right arrow next" },
  up: { group: "system", svg: P("M5 15l7-7 7 7"), tags: "chevron" },
  down: { group: "system", svg: P("M5 9l7 7 7-7"), tags: "chevron expand" },
  "arrow-up": { group: "system", svg: P("M12 19V5M5 12l7-7 7 7"), tags: "toss drag" },
  swap: { group: "system", svg: P("M4 8h13l-3-3M20 16H7l3 3"), tags: "swipe switch counters" },
  play: { group: "system", svg: P("M8 5.5v13l10-6.5z"), tags: "resume start" },
  pause: { group: "system", svg: P("M8 5v14M16 5v14") },
  undo: { group: "system", svg: P("M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"), tags: "back take back revert" },
  restart: { group: "system", svg: P("M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5"), tags: "retry again refresh" },
  update: { group: "system", svg: P("M12 4v10M8 10l4 4 4-4M5 19h14"), tags: "download new build" },
  "text-size": { group: "system", svg: P("M3 18l5-12 5 12M4.7 14h6.6M14 18l3.5-8 3.5 8M15.2 15.4h4.6"), tags: "type font larger letters accessibility" },
  hand: { group: "system", svg: P("M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14 10.5v-4a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a5 5 0 0 1-4-2L4 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14.5"), tags: "left right handed thumb accessibility" },
  copy: { group: "system", svg: P("M9 9h10v11H9zM15 9V4H5v11h4"), tags: "duplicate save code clipboard" },
  paste: { group: "system", svg: P("M9 5H6v15h12V5h-3M9 3.5h6V7H9z"), tags: "clipboard save code load" },
  settings: { group: "system", svg: P("M4 8h2.6M11.4 8H20M4 16h8.6M17.4 16H20") + C(9, 8, 2.4) + C(15, 16, 2.4), tags: "sliders toggles options" },
  "sound-on": { group: "system", svg: P("M4 10v4h3l5 4V6L7 10zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"), tags: "volume speaker audio" },
  "sound-off": { group: "system", svg: P("M4 10v4h3l5 4V6L7 10zM16 10l4 4M20 10l-4 4"), tags: "mute volume speaker" },
  music: { group: "system", svg: P("M9 18V6l10-2v12") + C(7, 18, 2) + C(17, 16, 2), tags: "radio note" },
  vibrate: { group: "system", svg: P("M9 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 9v6M20 9v6M12 17h.01"), tags: "haptics phone" },
  phone: { group: "system", svg: P("M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"), tags: "device screen" },
  wrench: { group: "system", svg: P("M14.5 4.5a4.5 4.5 0 0 0-5.6 5.6L4 15v5h5l4.9-4.9a4.5 4.5 0 0 0 5.6-5.6l-2.8 2.8-3-3z"), tags: "dev tools developer" },
  info: { group: "system", svg: C(12, 12, 8.5) + P("M12 11v5") + DOT(12, 8), tags: "about" },
  help: { group: "system", svg: C(12, 12, 8.5) + P("M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7") + DOT(12, 17), tags: "question how to play" },
  check: { group: "system", svg: P("M5 12.5l4.5 4.5L19 7"), tags: "done tick ok" },
  plus: { group: "system", svg: P("M12 5v14M5 12h14"), tags: "add more" },
  minus: { group: "system", svg: P("M5 12h14"), tags: "remove less" },
  search: { group: "system", svg: C(10.5, 10.5, 6) + P("M15 15l5 5"), tags: "find" },
  lock: { group: "system", svg: P("M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"), tags: "locked" },
  unlock: { group: "system", svg: P("M7 11V8a5 5 0 0 1 9.6-2M6 11h12v9H6z"), tags: "unlocked open" },
  eye: { group: "system", svg: P("M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z") + C(12, 12, 2.5), tags: "show visible" },
  "eye-off": { group: "system", svg: P("M3 12s3.5-6 9-6c1.3 0 2.5.3 3.6.8M21 12s-3.5 6-9 6c-1.3 0-2.5-.3-3.6-.8M4 4l16 16"), tags: "hide hidden" },
  share: { group: "system", svg: P("M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"), tags: "export" },
  trash: { group: "system", svg: P("M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"), tags: "delete garbage bin waste" },
  pin: { group: "system", svg: P("M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z") + C(12, 10, 2.2), tags: "location marker place" },
  external: { group: "system", svg: P("M14 4h6v6M20 4l-9 9M19 14v5H5V5h5"), tags: "link open" },
  language: { group: "system", svg: C(12, 12, 8.5) + P("M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"), tags: "globe world" },

  /* ---- kitchen (stations and tools) --------------------------------- */
  grill: { group: "kitchen", svg: P("M4 7h16M5 11h14M6 15h12M7 19h10M8 4v3M12 4v3M16 4v3"), tags: "griddle flat top station" },
  flame: { group: "kitchen", svg: P("M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1.5-4 .5 1.5 1.5 2 2.5 2 0-3-1-5 1-8z"), tags: "fire heat burn hot" },
  spatula: { group: "kitchen", svg: P("M3 21l7-7M10 14l-2-2 4-7 7 7-7 4z"), tags: "flip turner" },
  fryer: { group: "kitchen", svg: P("M5 9h14l-1 10H6zM8 9V6a4 4 0 0 1 8 0v3M9 13v3M12 13v3M15 13v3"), tags: "basket fries station oil" },
  tap: { group: "kitchen", svg: P("M4 9h9a4 4 0 0 1 4 4v1M13 6v3M11 6h4M17 14h2v3h-2zM7 9v10M4 19h6"), tags: "drink dispenser soda fountain pour" },
  bell: { group: "kitchen", svg: P("M12 5a7 7 0 0 1 7 7v2H5v-2a7 7 0 0 1 7-7zM4 17h16M12 5V3"), tags: "serve ring counter order up" },
  plate: { group: "kitchen", svg: C(12, 12, 9) + C(12, 12, 5), tags: "dish" },
  tray: { group: "kitchen", svg: P("M3 10h18l-2 4H5zM7 14v4M17 14v4M4 10V8h16v2"), tags: "serving assembly" },
  "warming-lamp": { group: "kitchen", svg: P("M12 3v3M7 6h10l2 4H5zM9 13l-1 3M12 13v3M15 13l1 3"), tags: "heat lamp holding pass" },
  press: { group: "kitchen", svg: P("M4 15h16v4H4zM6 15V9h12v6M12 9V5M9 5h6"), tags: "panini smash lid" },
  knife: { group: "kitchen", svg: P("M3 20l9-9M12 11l3-3 2 2a4 4 0 0 1-5 5zM14 8l6-6"), tags: "chop prep cut" },
  scraper: { group: "kitchen", svg: P("M4 14h16v3H4zM10 14V7a2 2 0 0 1 4 0v7"), tags: "clean grill scrape" },
  thermometer: { group: "kitchen", svg: P("M10 14V5a2 2 0 0 1 4 0v9a3.5 3.5 0 1 1-4 0zM12 10v6"), tags: "temperature heat dial doneness" },
  dial: { group: "kitchen", svg: C(12, 12, 8.5) + P("M12 12l4-4M12 3.5v2M3.5 12h2M12 18.5v2M18.5 12h2"), tags: "knob heat setting" },
  timer: { group: "kitchen", svg: C(12, 13, 7.5) + P("M12 9v4l2.5 2M9 3h6M12 3v2.5"), tags: "stopwatch shift clock time" },
  clock: { group: "kitchen", svg: C(12, 12, 8.5) + P("M12 7v5l3 2"), tags: "time hour" },
  "cup-stack": { group: "kitchen", svg: P("M7 5h10l-1 6H8zM8 11h8l-1 6H9zM9 17h6l-.7 3H9.7z"), tags: "cups containers supplies restock" },
  box: { group: "kitchen", svg: P("M3 8l9-4 9 4-9 4zM3 8v8l9 4 9-4V8M12 12v8"), tags: "stock supplies delivery package" },
  "spray-bottle": { group: "kitchen", svg: P("M9 9h6v12H9zM9 9V6h4l2-2h2M10 6l-2 2"), tags: "clean wipe mess spill" },
  towel: { group: "kitchen", svg: P("M4 6h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 18v3M16 18v3"), tags: "wipe cloth clean mess" },
  salt: { group: "kitchen", svg: P("M9 8h6l1 12H8zM9 8V5a3 3 0 0 1 6 0v3") + DOT(11, 4) + DOT(13, 3.5) + DOT(12, 2.5), tags: "shaker season" },

  /* ---- food (ingredients and menu) ---------------------------------- */
  burger: { group: "food", svg: P("M5 10a7 5 0 0 1 14 0zM4 13h16M5 16h14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"), tags: "sandwich menu item" },
  bun: { group: "food", svg: P("M4 13a8 7 0 0 1 16 0v2H4zM4 13h16") + DOT(9, 9) + DOT(12.5, 7.5) + DOT(15.5, 9.5), tags: "bread top sesame" },
  patty: { group: "food", svg: P("M4 11a8 3.5 0 0 1 16 0v2a8 3.5 0 0 1-16 0zM4 11a8 3.5 0 0 0 16 0"), tags: "beef meat" },
  cheese: { group: "food", svg: P("M4 9l16-3v11H4zM4 9l3 2.5M20 6l-3 4") + C(10, 13, 1.4) + C(15, 12, 1), tags: "slice melted" },
  bacon: { group: "food", svg: P("M4 8c3-3 5 3 8 0s5 3 8 0M4 12c3-3 5 3 8 0s5 3 8 0M4 16c3-3 5 3 8 0s5 3 8 0"), tags: "strip" },
  egg: { group: "food", svg: P("M12 3c4 0 7 5 7 10a7 7 0 0 1-14 0c0-5 3-10 7-10z") + C(12, 13, 2.5), tags: "fried breakfast" },
  lettuce: { group: "food", svg: P("M4 13c0-5 4-8 8-8s8 3 8 8c0 2-1 3-2 3-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0-1 0-2-1-2-3z"), tags: "greens leaf salad" },
  tomato: { group: "food", svg: C(12, 13, 7.5) + P("M12 5.5V3M9 5c1 1 2 1 3 0 1 1 2 1 3 0") + C(9.5, 13, 1.2) + C(14.5, 13, 1.2), tags: "slice red" },
  onion: { group: "food", svg: C(12, 13, 7.5) + C(12, 13, 4) + P("M12 5.5V3"), tags: "ring slice" },
  pickle: { group: "food", svg: P("M6 18L18 6a3 3 0 0 0-4-4L4 12a3 3 0 0 0 2 6z") + DOT(9, 13) + DOT(12, 10) + DOT(15, 7), tags: "cucumber gherkin" },
  pineapple: { group: "food", svg: P("M12 9c3 0 5 3 5 6.5S15 21 12 21s-5-2-5-5.5S9 9 12 9zM12 9c-1-2-2-3-4-3M12 9c1-2 2-3 4-3M12 9V5M9 14l6 4M15 14l-6 4"), tags: "tropical grilled" },
  jalapeno: { group: "food", svg: P("M17 5c1 0 2 1 2 2 0 6-5 11-11 12-2 .3-4-1-4-3 0-5 5-10 11-11zM17 5l2-2"), tags: "pepper chili hot spicy" },
  mushroom: { group: "food", svg: P("M4 12a8 7 0 0 1 16 0zM9 12v6a3 3 0 0 0 6 0v-6"), tags: "fungi" },
  avocado: { group: "food", svg: P("M12 3c3 0 6 6 6 11a6 6 0 0 1-12 0c0-5 3-11 6-11z") + C(12, 15, 2.5), tags: "guacamole" },
  ketchup: { group: "food", svg: P("M9 9h6v12H9zM10 9V6h4v3M11 6V3h2v3"), tags: "sauce bottle squeeze" },
  mustard: { group: "food", svg: P("M9 9h6v12H9zM10 9V6h4v3M11 6V3h2v3M12 12v5"), tags: "sauce bottle squeeze yellow" },
  sauce: { group: "food", svg: P("M8 10h8l-1 11H9zM10 10V7a2 2 0 0 1 4 0v3M12 7V4"), tags: "mayo special secret dip" },
  fries: { group: "food", svg: P("M6 11h12l-1.5 10h-9zM8 11V5M11 11V3M14 11V4M17 11V6M6 14h12"), tags: "chips side" },
  drink: { group: "food", svg: P("M6 5h12l-1.5 16h-9zM7 10h10M13 5l2-3"), tags: "cup soda cola lemonade straw" },
  "drink-size": { group: "food", svg: P("M3 11h5l-.8 9H3.8zM10 7h6l-1 13h-4zM18 3h3v17h-2z"), tags: "small medium large s m l" },
  "ice-cream": { group: "food", svg: P("M7 10h10l-5 11zM7 10a5 5 0 0 1 10 0"), tags: "cone dessert" },
  coffee: { group: "food", svg: P("M5 8h11v6a5 5 0 0 1-10 0zM16 9h2a2 2 0 0 1 0 4h-2M4 20h14M9 5V3M12 5V3"), tags: "hot mug breakfast" },
  panini: { group: "food", svg: P("M4 9h16v3H4zM4 15h16v3H4zM4 12h16v3H4zM6 9V7h12v2M7 12l2 1M11 12l2 1M15 12l2 1"), tags: "pressed sandwich melt toasted" },
  toast: { group: "food", svg: P("M6 10a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6v10H6zM9 13l3 3 3-3"), tags: "toasted bun bread" },
  taco: { group: "food", svg: P("M3 17a9 9 0 0 1 18 0zM6 11.5c1.5 1 3 1 4.5 0s3-1 4.5 0 2.5 1 3 .5M3 17h18"), tags: "tortilla tacos comal quesadilla red rock" },
  flatbread: { group: "food", svg: C(12, 12, 8.5) + C(12, 12, 6) + DOT(10, 10) + DOT(14.5, 11) + DOT(11, 14.5) + DOT(15, 15), tags: "pizza pie oven orchard isle" },
  smash: { group: "food", svg: P("M5 13h14M4 16a8 3 0 0 0 16 0M12 13V5M9 8l3-3 3 3"), tags: "pressed thin crust" },
  /** The food menu: a menu card with a burger at its head (not the three-line app menu). */
  "food-menu": { group: "food", svg: P("M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a3.5 2.6 0 0 1 7 0zM8.5 12.5h7M9 15h6M9 18h6"), tags: "menu card dishes recipes food" },
  "menu-book": { group: "food", svg: P("M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7zM7 9h3M7 12h3M14 9h3M14 12h3"), tags: "recipe book cookbook" },

  /* ---- trip (road, stops, map) -------------------------------------- */
  garage: { group: "trip", svg: P("M3 10l9-6 9 6v10H3zM7 20v-7h10v7M7 15.5h10M7 18h10"), tags: "savings bonuses looks shop" },
  truck: { group: "trip", svg: P("M3 7h11v9H3zM14 10h4l3 3v3h-7zM3 16v-1") + C(7, 17, 2) + C(17, 17, 2) + P("M5 11h7"), tags: "food truck van vehicle" },
  road: { group: "trip", svg: P("M7 21L10 3M17 21L14 3M12 6v2M12 11v2M12 16v2"), tags: "highway trip route" },
  map: { group: "trip", svg: P("M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"), tags: "atlas trip" },
  route: { group: "trip", svg: C(6, 6, 2.5) + C(18, 18, 2.5) + P("M8 7.5c4 0 4 9 8 9"), tags: "path journey next stop" },
  compass: { group: "trip", svg: C(12, 12, 8.5) + P("M15 9l-2 5-4 2 2-5z"), tags: "direction north navigation" },
  flag: { group: "trip", svg: P("M5 21V4M5 4h12l-3 4 3 4H5"), tags: "finish goal milestone" },
  sun: { group: "trip", svg: C(12, 12, 4) + P("M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"), tags: "day weather morning" },
  moon: { group: "trip", svg: P("M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"), tags: "night shift weather" },
  mountain: { group: "trip", svg: P("M3 19L9 8l3 5 2-3 7 9zM9 8l2 4"), tags: "pinecrest hills backdrop" },
  wave: { group: "trip", svg: P("M3 9c3-3 5 3 8 0s5 3 8 0M3 15c3-3 5 3 8 0s5 3 8 0"), tags: "beach sea saltwater bay" },
  cactus: { group: "trip", svg: P("M12 21V4M12 13h4V8M12 15H8v-5M6 21h12"), tags: "desert red mesa" },
  city: { group: "trip", svg: P("M3 21V9h5v12M8 21V4h8v17M16 21v-9h5v9M11 8h2M11 12h2M11 16h2"), tags: "town skyline stop" },
  calendar: { group: "trip", svg: P("M4 6h16v15H4zM4 10h16M8 3v5M16 3v5"), tags: "day date shift schedule" },

  /* ---- money (prices, stock, business) ------------------------------- */
  coin: { group: "money", svg: C(12, 12, 8.5) + P("M12 7.5v9M9.5 10a2.5 2 0 0 1 2.5-1.5c1.5 0 2.5.7 2.5 1.6 0 2.4-5 1.4-5 3.8 0 1 1 1.6 2.5 1.6a2.5 2 0 0 0 2.5-1.5"), tags: "dollar money cash earnings tip" },
  receipt: { group: "money", svg: P("M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3"), tags: "ticket bill total order" },
  tag: { group: "money", svg: P("M3 12V4h8l10 10-8 8z") + DOT(7, 8), tags: "price label" },
  cart: { group: "money", svg: P("M3 4h2l2.5 11h10L20 7H6.5") + C(9, 19, 1.5) + C(16, 19, 1.5), tags: "stock order buy supplies" },
  wallet: { group: "money", svg: P("M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V5h12v2M16 14h4") + DOT(16, 14), tags: "savings bank balance" },
  chart: { group: "money", svg: P("M4 20h16M6 16l4-5 3 3 5-7"), tags: "profit trend stats graph" },
  bars: { group: "money", svg: P("M5 20V13M11 20V6M17 20V10"), tags: "stats graph comparison" },
  percent: { group: "money", svg: P("M5 19L19 5") + C(7, 7, 2.2) + C(17, 17, 2.2), tags: "margin discount" },
  quality: { group: "money", svg: P("M12 3l2.6 5.4 6 .8-4.3 4.2 1 5.9L12 16.5l-5.3 2.8 1-5.9L3.4 9.2l6-.8z") + P("M9.5 12l1.7 1.7 3.3-3.3"), tags: "premium tier grade" },
  scale: { group: "money", svg: P("M12 4v16M4 20h16M12 6l-6 2M12 6l6 2M3 14l3-6 3 6a3 3 0 0 1-6 0zM15 14l3-6 3 6a3 3 0 0 1-6 0z"), tags: "balance cost tradeoff" },

  /* ---- feedback (ratings, status, people) --------------------------- */
  star: { group: "feedback", svg: P("M12 3l2.6 5.4 6 .8-4.3 4.2 1 5.9L12 16.5l-5.3 2.8 1-5.9L3.4 9.2l6-.8z"), tags: "rating review favourite" },
  "star-half": { group: "feedback", svg: P("M12 3l2.6 5.4 6 .8-4.3 4.2 1 5.9L12 16.5l-5.3 2.8 1-5.9L3.4 9.2l6-.8zM12 3v13.5"), tags: "rating review" },
  heart: { group: "feedback", svg: P("M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"), tags: "like favourite regular" },
  trophy: { group: "feedback", svg: P("M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3M12 14v4M8 20h8"), tags: "award best achievement" },
  review: { group: "feedback", svg: P("M4 5h16v11H9l-5 4zM8 9h8M8 12h5"), tags: "comment speech bubble feedback" },
  person: { group: "feedback", svg: C(12, 8, 4) + P("M4 21a8 8 0 0 1 16 0"), tags: "customer user profile" },
  people: { group: "feedback", svg: C(9, 8, 3.5) + P("M2 20a7 7 0 0 1 14 0M15 5a3.5 3.5 0 0 1 0 7M17 13a7 7 0 0 1 5 7"), tags: "customers crowd traffic rush" },
  critic: { group: "feedback", svg: C(12, 8, 4) + P("M4 21a8 8 0 0 1 16 0M8 8h8M12 4V2"), tags: "inspector reviewer vip" },
  smile: { group: "feedback", svg: C(12, 12, 8.5) + P("M8.5 14a4 4 0 0 0 7 0") + DOT(9.5, 10) + DOT(14.5, 10), tags: "happy good mood" },
  neutral: { group: "feedback", svg: C(12, 12, 8.5) + P("M9 15h6") + DOT(9.5, 10) + DOT(14.5, 10), tags: "meh ok mood" },
  frown: { group: "feedback", svg: C(12, 12, 8.5) + P("M8.5 16a4 4 0 0 1 7 0") + DOT(9.5, 10) + DOT(14.5, 10), tags: "sad angry bad mood" },
  warning: { group: "feedback", svg: P("M12 3l10 18H2zM12 10v4") + DOT(12, 17), tags: "alert danger late burnt" },
  "check-circle": { group: "feedback", svg: C(12, 12, 8.5) + P("M8.5 12.5l2.5 2.5 5-5"), tags: "success served correct" },
  "x-circle": { group: "feedback", svg: C(12, 12, 8.5) + P("M9 9l6 6M15 9l-6 6"), tags: "wrong failed missed" },
  sparkle: { group: "feedback", svg: P("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"), tags: "new bonus perfect shine" },
  patience: { group: "feedback", svg: P("M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9"), tags: "hourglass waiting time left" },
  new: { group: "feedback", svg: P("M3 12h3M5 6l2 2M12 3v3M19 6l-2 2M18 12h3M9 21l1.5-6 3.5-3.5 2 2L12.5 17z"), tags: "unlock reveal first time" },
};

export const ICON_NAMES = Object.keys(ICONS);

export interface IconOptions {
  /** CSS size, e.g. "20px" or "1.25em". Defaults to the `.bv-icon` rule (1em). */
  size?: string;
  /** Stroke width on the 24-grid. 1.75 is the set's default. */
  stroke?: number;
  /** Accessible label; without it the icon is decorative (aria-hidden). */
  label?: string;
  /** Extra class names. */
  class?: string;
}

/** Inline SVG for an icon name. Unknown names draw a small question mark so a typo is visible, never blank. */
export function icon(name: string, opts: IconOptions = {}): string {
  const def = ICONS[name] ?? ICONS.help;
  const style = opts.size ? ` style="width:${opts.size};height:${opts.size}"` : "";
  const a11y = opts.label ? ` role="img" aria-label="${opts.label}"` : ` aria-hidden="true"`;
  const sw = opts.stroke ?? 1.75;
  const cls = `bv-icon bv-icon-${name}${opts.class ? " " + opts.class : ""}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${style}${a11y}>${def.svg}</svg>`;
}

export function hasIcon(name: string): boolean {
  return name in ICONS;
}
