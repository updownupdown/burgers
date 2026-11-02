// After builds #69 and #71 (DESIGN §24): Orchard Isle's deck oven and the peel, played with a
// finger. The page runs as a phone (390 x 844, dpr 2, hasTouch, isMobile) and every gesture is a
// real touch sequence (CDP touch events) shaped like a person's: eased, slow to start, a little
// diagonal, jittery, with pauses. The game clock runs in real time during gestures (ticked without
// drawing, so touch events arrive on time) and is fast-forwarded while pies bake.
//
// Serves a Harvest Red turned round (even bake), a Harvest Red left unturned (done but uneven:
// lower but no failure), a Fig & Ham (Larkvale), a Calzone and a Harvest Red cut in four on the
// board (Port Amber). Then scoops a pie 24 times with randomised human gestures, and checks that
// sweeping the blade past pies doesn't spin them.
//
// npm run build && npx vite preview --port 4175
// PORT=4175 node tools/playtest/oven-peel.cjs  ->  tools/playtest/shots-peel3/   (ONLY=1245 picks sections)
const path = require('path');
const { chromium } = require('playwright');
const out = process.env.OUT || path.join(__dirname, 'shots-peel3') + '/';
require('fs').mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || 4175;
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A seeded random, so a run can be repeated. */
let seed = +(process.env.SEED || 11);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const jit = (a) => (rnd() - 0.5) * 2 * a;

async function start(town) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForTimeout(600);
  await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); }, save(town));
  await p.reload();
  await p.waitForTimeout(900);
  await p.tap('[data-home=open]');
  await p.waitForTimeout(800);
  if (await p.$('[data-act=open]')) await p.tap('[data-act=open]');
  await p.waitForTimeout(300);
  // The game's clock runs in real time from here on, but without drawing (software GL is too slow
  // to draw at 60 fps, and touches arrive between frames as on a phone). Drawn only for screenshots.
  await p.evaluate(() => { window.__bv.manual(true); window.__run = setInterval(() => window.__bv.tick(1 / 60), 16); });
  await sleep(1500);
  // Tips are read once in play; the bot hides them so they never sit over what it presses.
  await p.addStyleTag({ content: '[data-r="hint"] { display: none !important; }' });
  const cdp = await ctx.newCDPSession(p);
  const ev = (f, a) => p.evaluate(f, a);
  let at = null;
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 0.6, id: 0 }] });
  const t = {
    b, p, ev,
    get at() { return at; },
    step: (s) => ev((s) => window.__bv.step(s), s),
    draw: () => ev(() => window.__bv.step(0)),
    proj: (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v),
    oven: () => ev(() => window.__bv.oven()),
    hideHint: () => ev(() => { document.querySelector('[data-r="hint"]').style.display = 'none'; }),
    async shot(name, clip) {
      await t.hideHint();
      await t.draw();
      await p.screenshot({ path: `${out}${name}.png`, ...(clip ? { clip } : {}) });
    },
    async down(x, y) { at = [x, y]; await send('touchStart', x, y); },
    async up() { await send('touchEnd'); at = null; },
    /**
     * Move the finger to (x, y) over `ms` like a person: eased (slow to start and to stop), a
     * little bow sideways, a pixel or two of tremor, samples every ~16 ms on the wall clock.
     */
    async move(x, y, ms, { ease = 'inout', tremor = 1.2, bow = 0 } = {}) {
      const [x0, y0] = at;
      const t0 = Date.now();
      // Paced by the wall clock: if the page is slow to take an event, the next one is further
      // along (fewer samples, as on a busy phone), never slower.
      for (;;) {
        await sleep(14);
        const u = Math.min(1, (Date.now() - t0) / ms);
        const e = ease === 'out' ? 1 - (1 - u) ** 2 : ease === 'in' ? u * u : u * u * (3 - 2 * u);
        const side = Math.sin(Math.PI * u) * bow;
        const last = u >= 1;
        const q = [x0 + (x - x0) * e + side + (last ? 0 : jit(tremor)), y0 + (y - y0) * e + (last ? 0 : jit(tremor))];
        await send('touchMove', q[0], q[1]);
        at = q;
        if (last) break;
      }
      at = [x, y];
    },
    async hold(ms) {
      // A finger held still still trembles a little.
      const t0 = Date.now();
      const [x, y] = at;
      while (Date.now() - t0 < ms) { await sleep(40); await send('touchMove', x + jit(0.8), y + jit(0.8)); }
      await send('touchMove', x, y);
    },
    async tap(pt) { await t.down(pt[0] + jit(2), pt[1] + jit(2)); await sleep(60 + rnd() * 50); await t.up(); await sleep(150); },
    /** A drag along screen points at a steady pace (painting sauce, folding, cutting). */
    async trace(pts, msPer = 14) {
      await t.down(...pts[0]);
      for (const q of pts.slice(1)) { await sleep(msPer); await send('touchMove', q[0], q[1]); at = q; }
      await sleep(msPer);
      await t.up();
      await sleep(200);
    },
    hp: (type, f = {}) => ev(([type, f]) => {
      const c = window.__bv.counter;
      const m = c.hitMeshes.find((h) => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
      if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
      return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
    }, [type, f]),
    plate: (i) => ev((i) => { const b = window.__bv.trayView.plates[i].burger; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; return window.__bv.project('tray', e[12], 0.3, e[14]); }, i),
  };
  return t;
}
const line = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);

/** Give the customer at the window this order (the playtest wants a known build). */
async function forceOrder(t, order) {
  await t.ev((o) => {
    const g = window.__bv.game;
    let s = g.slots[g.active];
    if (!s.order) { const k = g.slots.findIndex((x) => x.order && !x.leaving); if (k >= 0) { g.active = k; s = g.slots[k]; } }
    Object.assign(s.order, o);
    s.patience = s.maxPatience = 600;
    s.ticketKey = '';
  }, order);
}
async function nextCustomer(t) {
  for (let i = 0; i < 30; i++) {
    const ok = await t.ev(() => { const g = window.__bv.game; const k = g.slots.findIndex((s) => s.order && !s.leaving && !s.plate.layers.length); if (k >= 0) g.active = k; else window.__bv.callNext(); return k >= 0; });
    if (ok) return;
    await t.step(1);
  }
}
const plateNow = (t) => t.ev(() => {
  const g = window.__bv.game;
  const s = g.slots[g.active];
  const d = s.plate.layers[0]?.piece;
  return { layers: s.plate.layers.map((l) => l.piece.kind).join(','), rim: d?.rim ? d.rim.map((c) => +c.toFixed(2)) : null, cuts: d?.cuts ?? 0, folded: !!d?.folded };
});
/** Serve the active tray with a flick up from it, and read the score the customer gave. */
async function serve(t) {
  const slot = await t.ev(() => window.__bv.game.active);
  const score = await t.ev((i) => { const g = window.__bv.game; const s = g.slots[i]; return window.__bv.scorePlate ? window.__bv.scorePlate(s.order, s.plate) : null; }, slot);
  const [px, py] = await t.plate(slot);
  const before = await t.ev(() => ({ served: window.__bv.game.served, stars: window.__bv.game.stars.slice() }));
  // The Serve button that shows over a finished tray, else a swipe up from the tray.
  const btn = await t.ev((i) => { const b = [...document.querySelectorAll('.tray-serve')].filter((e) => !e.hidden)[0]; if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, slot);
  if (btn) await t.p.touchscreen.tap(btn[0], btn[1]);
  else {
    await t.down(px, py);
    await sleep(80);
    await t.move(px + 6, py - 110, 160, { ease: 'out' });
    await t.up();
  }
  await sleep(600);
  const after = await t.ev(() => ({ served: window.__bv.game.served, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, stars: after.stars.slice(before.stars.length), bubble: after.bubble, score };
}

/** Spread sauce from the pot (or olive oil from its bottle) over the pie on the peel, in a spiral. */
async function ladle(t, from, kind) {
  const o = await t.oven();
  const [x, , z] = o.peel.at;
  const rx = 1.6 * 0.441 * 0.95;
  const rz = 1.2 * 0.441 * 0.95;
  const pts = [];
  if (kind === 'oil') for (let i = 0; i <= 6; i++) pts.push([x + (i % 2 ? 0.55 : -0.55) * rx, 0.19, z + (-0.6 + i * 0.2) * rz]);
  else for (let i = 0; i <= 64; i++) { const a = i * 0.42; const r = Math.min(0.93, 0.05 + i * 0.0145); pts.push([x + Math.cos(a) * r * rx, 0.19, z + Math.sin(a) * r * rz]); }
  const scr = [];
  for (const q of pts) { const [sx, sy] = await t.proj(q); scr.push([sx, sy + 34]); }
  await t.trace([...line(from[0], from[1], scr[0][0], scr[0][1], 8), ...scr], 12);
}
/** Squeeze a sauce bottle over the active tray (the honey after the oven). */
async function trayBottle(t, kind) {
  const [px] = await t.plate(await t.ev(() => window.__bv.game.active));
  const bt = await t.hp('bottle', { sauce: kind });
  const [cx, cy, side] = await t.ev(() => window.__bv.sauceCentre());
  const pts = [...line(bt[0], bt[1], px, cy, 12)];
  for (let z = 0; z <= 5; z++) pts.push([cx + (z % 2 ? 0.3 : -0.3) * side, cy - 0.2 * side + z * 0.08 * side + 34]);
  const full = [];
  for (let i = 1; i < pts.length; i++) full.push(...line(...pts[i - 1], ...pts[i], 8).slice(i > 1 ? 1 : 0));
  await t.trace(full, 12);
  await sleep(300);
}
const tapBin = async (t, kind, n) => { const b = await t.hp('bin', { kind }); for (let i = 0; i < n; i++) await t.tap(b); };
const crust = async (t, i) => { const o = await t.oven(); const d = o.spots[i].layers[0]; return d ? `rim ${d.rim.map((c) => c.toFixed(2)).join('/')} yaw ${d.yaw.toFixed(2)}` : 'empty'; };

/**
 * The peel in hand. The finger grabs the handle a little off its middle, and the bot steers the
 * blade by eye: each move goes most of the way there (people overshoot and correct a little).
 */
async function grab(t) {
  const o = await t.oven();
  const h = await t.proj(o.peel.handle);
  await t.down(h[0] + jit(5), h[1] + jit(6));
  await sleep(90 + rnd() * 60);
}
/** Carry the blade's centre near a world point (x, z), at a person's pace (`ms` per leg). */
async function bladeTo(t, x, z, { ms = 380, tol = 0.08, legs = 4 } = {}) {
  for (let k = 0; k < legs; k++) {
    const o = await t.oven();
    const [bx, by, bz] = o.peel.at;
    if (Math.hypot(bx - x, bz - z) < tol) break;
    const a = await t.proj([bx, by, bz]);
    const b = await t.proj([x, by, z]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    await t.move(t.at[0] + dx * (k ? 1 : 0.97), t.at[1] + dy * (k ? 1 : 0.97), k ? ms * 0.5 : ms, { bow: k ? 0 : jit(8) });
    await sleep(40 + rnd() * 60);
  }
}
/** A thumb flick up or down the screen: `len` px in `ms`, drifting `drift` px sideways, slow to start. */
async function flick(t, dir, { len = 45, ms = 110, drift = 6, pause = 120 } = {}) {
  if (pause) await t.hold(pause);
  await t.move(t.at[0] + drift, t.at[1] + (dir === 'up' ? -len : len), ms, { ease: 'inout', tremor: 1.5 });
}
const spotAt = async (t, i) => (await t.oven()).spots[i].at;
/** Into the oven: carry the pie over a spot (roughly), swipe down, let go. */
async function launch(t, i) {
  await grab(t);
  const [sx, , sz] = await spotAt(t, i);
  await bladeTo(t, sx + jit(0.15), sz + 0.1 + jit(0.15));
  if (process.env.DEBUG) await t.ev(() => { window.__rec = []; if (!window.__recOn) { window.__recOn = 1; const c = document.getElementById('gl'); for (const k of ['pointermove','pointerup','pointercancel','lostpointercapture']) c.addEventListener(k, (e) => window.__rec?.push([k.slice(7,12), Math.round(e.clientX), Math.round(e.clientY), Math.round(e.timeStamp)])); } });
  if (process.env.DEBUG) console.log('  peel before drop', JSON.stringify((await t.oven()).peel.at), JSON.stringify((await t.oven()).peel.target), 'mode', await t.ev(() => window.__bv.ptrMode?.()));
  await flick(t, 'down', { len: 40 + rnd() * 15, ms: 90 + rnd() * 40, drift: jit(8) });
  await sleep(80);
  if (process.env.DEBUG) console.log(JSON.stringify(await t.ev(() => window.__rec)));
  await t.up();
  await sleep(300);
  const o = await t.oven();
  console.log(`  into spot ${i}:`, o.spots[i].layers.length ? 'yes' : 'NO', '| peel', o.peel.layers.length ? 'still full' : 'empty');
}
/**
 * Turn the pie in spot i half round: the blade's tip set against the front of the pie, pushed
 * firmly sideways along it; back off and do it again until it's round.
 */
async function turnRound(t, i, shotName) {
  await grab(t);
  const [sx, , sz] = await spotAt(t, i);
  const yaw0 = (await t.oven()).spots[i].yaw;
  const tipZ = sz + 0.62 + 0.84;
  const x0 = Math.max(-0.45, sx - 0.95);
  const x1 = Math.min(3.15, sx + 1.25);
  for (let k = 0; k < 6; k++) {
    // A full push first; then shorter ones, judged by how far it still has to go.
    const left = Math.PI - Math.abs((await t.oven()).spots[i].yaw - yaw0);
    const reach = k === 0 ? x1 : Math.min(x1, sx - 0.55 + left * 0.75);
    await bladeTo(t, x0, tipZ + 0.5, { ms: 260 });
    await bladeTo(t, x0, tipZ, { ms: 200, tol: 0.05 });
    const o = await t.oven();
    const a = await t.proj(o.peel.at);
    const b = await t.proj([reach, o.peel.at[1], tipZ]);
    await t.move(t.at[0] + b[0] - a[0], t.at[1] + jit(3), 420 + rnd() * 120, { ease: 'inout', tremor: 1.5 });
    if (k === 0 && shotName) await t.shot(shotName);
    await bladeTo(t, x1, tipZ + 0.5, { ms: 200 });
    const now = (await t.oven()).spots[i];
    console.log(`    push ${k}: yaw ${now.yaw.toFixed(2)}`);
    if (Math.abs(now.yaw - yaw0) > 2.7) break;
  }
  await t.up();
  await sleep(300);
  const sp = (await t.oven()).spots[i];
  console.log(`  turned spot ${i}: yaw ${yaw0.toFixed(2)} -> ${sp.yaw.toFixed(2)} (cos ${Math.cos(sp.yaw).toFixed(2)})`);
}
/** Scoop the pie in spot i, one of several ways a person would. Leaves the finger down. */
async function scoop(t, i, how, shotName) {
  await grab(t);
  const [sx, , sz] = await spotAt(t, i);
  if (how === 'slide') {
    // Carry the blade in front of the pie, then push it straight in under it.
    await bladeTo(t, sx + jit(0.2), sz + 1.9);
    await bladeTo(t, sx + jit(0.25), sz + 0.05, { ms: 300, legs: 2 });
  } else if (how === 'slow') {
    // Up to the front of the pie, then creep in under it.
    await bladeTo(t, sx + jit(0.1), sz + 1.9);
    await bladeTo(t, sx, sz + 0.66 + 0.84 - 0.25, { ms: 1400, legs: 2, tol: 0.06 });
    if (shotName) await t.shot(shotName);
    await bladeTo(t, sx, sz + 0.1, { ms: 1600, legs: 2 });
  } else if (how === 'flick') {
    // The blade set roughly under it (the pie on its front half), a pause, a short flick up.
    await bladeTo(t, sx + jit(0.35), sz + 0.45 + jit(0.15));
    await flick(t, 'up', { len: 30 + rnd() * 20, ms: 90 + rnd() * 70, drift: jit(14), pause: 150 + rnd() * 200 });
  } else if (how === 'short') {
    // Short of the pie (its front crust just on the tip) and a quick flick up that carries it in under.
    await bladeTo(t, sx + jit(0.2), sz + 1.2);
    await flick(t, 'up', { len: 50, ms: 100, drift: jit(10), pause: 60 });
  }
  await sleep(60);
  const o = await t.oven();
  const ok = o.peel.layers.length > 0 && !o.spots[i].layers.length;
  if (shotName && how !== 'slow') await t.shot(shotName);
  console.log(`  scooped (${how}):`, ok ? 'yes' : 'NO');
  return ok;
}
/** From the peel in hand, carry up to the active tray and swipe down, let go. */
async function toTray(t) {
  await bladeTo(t, 1.3 + jit(0.3), 0.6);
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  if (process.env.DEBUG) await t.ev(() => { window.__rec = []; });
  await t.move(px + jit(10), py + 10 + jit(6), 420, { bow: jit(10) });
  if (process.env.DEBUG) console.log('  over tray', JSON.stringify(t.at), 'plate', px, py, 'peel', (await t.oven()).peel.layers.length, 'pick', await t.ev(([x, y]) => window.__bv.trayPick?.(x, y), t.at), 'hint', await t.ev(() => document.querySelector('[data-r="hint"]')?.textContent));
  await flick(t, 'down', { len: 40, ms: 100, drift: jit(6), pause: 150 });
  await sleep(60);
  if (process.env.DEBUG) console.log('  after flick peel', (await t.oven()).peel.layers.length, 'hint', await t.ev(() => document.querySelector('[data-r="hint"]')?.textContent), JSON.stringify(await t.ev(() => window.__rec?.slice(-10))));
  await t.up();
  await sleep(300);
  console.log('  on the tray:', JSON.stringify(await plateNow(t)));
}
/** Build a pie on the peel at home. */
async function buildPie(t, kind) {
  const o = await t.oven();
  await t.tap(await t.proj(o.dough));
  if (kind === 'fig') {
    await ladle(t, await t.hp('bottle', { sauce: 'oil' }), 'oil');
    await tapBin(t, 'mozzarella', 3); await tapBin(t, 'ham', 3); await tapBin(t, 'fig', 4);
  } else if (kind === 'calzone') {
    await ladle(t, await t.proj(o.pot), 'redsauce');
    await tapBin(t, 'mozzarella', 3); await tapBin(t, 'ham', 2); await tapBin(t, 'mushroom', 3);
    // Fold: press near the left edge of the dough and drag across the middle.
    const [x, y, z] = (await t.oven()).peel.at;
    await t.trace(line(...(await t.proj([x - 0.62, y, z])), ...(await t.proj([x + 0.4, y, z])), 10), 16);
    console.log('  folded?', (await t.oven()).peel.layers[0].folded);
  } else {
    await ladle(t, await t.proj(o.pot), 'redsauce');
    await tapBin(t, 'mozzarella', 4);
  }
}
/** Fast-forward the game until `s` seconds after `t0`. */
const gt = (t) => t.ev(() => window.__bv.game.time);
const until = async (t, t0, s) => { const now = (await gt(t)) - t0; if (s > now) await t.step(s - now); };

const HARVEST = {
  name: 'Harvest Red', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true }, { kind: 'redsauce' }, { kind: 'mozzarella', count: 4, melted: true }, { kind: 'basil', after: true }],
};
const FIGHAM = {
  name: 'Fig & Ham', price: 13, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true }, { kind: 'oil' }, { kind: 'mozzarella', count: 3, melted: true }, { kind: 'ham', count: 3 }, { kind: 'fig', count: 4 }, { kind: 'honey', after: true }],
};
const CALZONE = {
  name: 'Calzone', price: 14, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true, folded: true }, { kind: 'redsauce' }, { kind: 'mozzarella', count: 3, melted: true }, { kind: 'ham', count: 2 }, { kind: 'mushroom', count: 3 }],
  slice: false,
};
/** The oven's mouth, for close-up shots (CSS px). */
const OVEN_CLIP = { x: 0, y: 470, width: 390, height: 300 };

const ONLY = process.env.ONLY || '';
const want = (n) => !ONLY || ONLY.includes(n);
const report = [];

(async () => {
  // 1. Applecross: a Harvest Red turned round once (even bake), then one left unturned (uneven).
  if (want('1')) {
    const t = await start('applecross');
    await t.shot('oven-applecross');
    await forceOrder(t, HARVEST);
    await buildPie(t, 'red');
    await t.shot('peel-built');
    await launch(t, 0);
    let t0 = await gt(t);
    await until(t, t0, 10);
    console.log('at 10 s', await crust(t, 0));
    await t.shot('bake-half-uneven', OVEN_CLIP);
    await turnRound(t, 0, 'turn-pushing');
    await until(t, t0, 21);
    console.log('at 21 s', await crust(t, 0));
    await t.shot('bake-even', OVEN_CLIP);
    await scoop(t, 0, 'slide', 'scoop-slide');
    await toTray(t);
    await tapBin(t, 'basil', 1);
    await sleep(300);
    await t.shot('served-on-tray');
    const even = await serve(t);
    console.log('SERVED Harvest Red (turned)', JSON.stringify(even));
    report.push(['Harvest Red, turned', even]);

    await nextCustomer(t);
    await forceOrder(t, HARVEST);
    await buildPie(t, 'red');
    await launch(t, 1);
    t0 = await gt(t);
    await until(t, t0, 20.5);
    console.log('unturned at 20.5 s', await crust(t, 1));
    await t.shot('bake-unturned-rim', OVEN_CLIP);
    await scoop(t, 1, 'flick', 'scoop-mid-flick');
    await toTray(t);
    await tapBin(t, 'basil', 1);
    const one = await serve(t);
    console.log('SERVED Harvest Red (unturned)', JSON.stringify(one));
    report.push(['Harvest Red, unturned', one]);
    await t.ev(() => window.__bv.menu.openHowTo('oven'));
    await sleep(800);
    await t.draw();
    await t.p.screenshot({ path: `${out}howto-oven.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 2. Larkvale: a Fig & Ham (olive oil before, honey after at the tray), scooped with a short flick.
  if (want('2')) {
    const t = await start('larkvale');
    await forceOrder(t, FIGHAM);
    await buildPie(t, 'fig');
    await launch(t, 1);
    const t0 = await gt(t);
    await until(t, t0, 10);
    await turnRound(t, 1);
    await until(t, t0, 21);
    console.log('fig & ham', await crust(t, 1));
    await scoop(t, 1, 'short');
    await toTray(t);
    await trayBottle(t, 'honey');
    console.log('Fig & Ham on tray', JSON.stringify(await plateNow(t)));
    await t.shot('fig-ham-on-tray');
    const r = await serve(t);
    console.log('SERVED Fig & Ham', JSON.stringify(r));
    report.push(['Fig & Ham', r]);
    await t.b.close();
  }
  // 3. Port Amber: a calzone (folded, turned once, scooped slowly), then a flatbread cut in four on the board.
  if (want('3')) {
    const t = await start('portamber');
    await t.shot('oven-portamber');
    await forceOrder(t, CALZONE);
    await buildPie(t, 'calzone');
    await t.shot('calzone-on-peel');
    await launch(t, 0);
    let t0 = await gt(t);
    await until(t, t0, 13);
    await turnRound(t, 0);
    await until(t, t0, 26);
    console.log('calzone', await crust(t, 0));
    await scoop(t, 0, 'slow', 'slow-approach-calzone');
    await toTray(t);
    const cal = await serve(t);
    console.log('SERVED Calzone', JSON.stringify(cal));
    report.push(['Calzone', cal]);

    await nextCustomer(t);
    await forceOrder(t, { ...HARVEST, slice: true });
    await buildPie(t, 'red');
    await launch(t, 2);
    t0 = await gt(t);
    await until(t, t0, 10);
    await turnRound(t, 2);
    await until(t, t0, 21);
    console.log('flatbread', await crust(t, 2));
    await scoop(t, 2, 'slow', 'slow-approach');
    // Over the board and down.
    const rest = (await t.oven()).rest.at;
    await bladeTo(t, rest[0], rest[2]);
    await flick(t, 'down', { len: 42, ms: 110, drift: jit(6) });
    await t.up();
    await sleep(300);
    console.log('  on the board:', JSON.stringify((await t.oven()).rest.layers.map((l) => l.kind)));
    const bd = await t.proj((await t.oven()).rest.at);
    await t.trace(line(bd[0] - 38, bd[1] - 4, bd[0] + 38, bd[1] - 4, 10), 14);
    await t.trace(line(bd[0] - 38, bd[1] + 5, bd[0] + 38, bd[1] + 5, 10), 14);
    console.log('  cuts', (await t.oven()).rest.layers[0]?.cuts);
    await t.shot('board-cut-in-four');
    // Off the board: the blade pushed in under it from the front, then up to the tray.
    await grab(t);
    await bladeTo(t, rest[0] + jit(0.2), rest[2] + 0.1 + jit(0.2));
    await flick(t, 'up', { len: 38, ms: 120, drift: jit(10) });
    console.log('  off the board:', (await t.oven()).peel.layers.length ? 'yes' : 'NO');
    await toTray(t);
    await tapBin(t, 'basil', 1);
    await t.shot('cut-on-tray');
    const cut = await serve(t);
    console.log('SERVED cut Harvest Red', JSON.stringify(cut));
    report.push(['Harvest Red, cut in four', cut]);
    await t.b.close();
  }
  // 4. Scoops, as people do them: random aim, speed, slant and pause, every way of scooping.
  if (want('4')) {
    const t = await start('applecross');
    const ways = ['flick', 'short', 'slide', 'flick', 'slow', 'short'];
    let ok = 0;
    const N = +(process.env.TRIALS || 24);
    for (let k = 0; k < N; k++) {
      await t.ev(() => {
        const c = window.__bv.counter;
        c.setPeel([]);
        const piece = { kind: 'dough', cook: [0.5, 0.5], uid: 9000 + Math.random(), yaw: Math.random() * 6 };
        c.setSpot(0, [{ piece, offX: 0, offZ: 0 }]);
        c.setSpot(1, []);
      });
      await sleep(500);
      const how = ways[k % ways.length];
      if (await scoop(t, 0, how)) ok++;
      await t.up();
      await sleep(400);
    }
    console.log(`SCOOPS: ${ok} / ${N}`);
    report.push(['human scoops', `${ok}/${N}`]);
    await t.b.close();
  }
  // 5. Port Amber: the blade swept along the front of the oven past three pies, and brushed past
  // one, at a normal pace: nothing spins. Then a deliberate push does.
  if (want('5')) {
    const t = await start('portamber');
    await t.ev(() => {
      const c = window.__bv.counter;
      for (let i = 0; i < 3; i++) c.setSpot(i, [{ piece: { kind: 'dough', cook: [0.3, 0.3], uid: 9100 + i, yaw: 0 }, offX: 0, offZ: 0 }]);
    });
    await sleep(300);
    const yaws = async () => (await t.oven()).spots.map((s) => +s.yaw.toFixed(3));
    await grab(t);
    const s0 = await spotAt(t, 0);
    // In over the deck, the tip short of the pies, and along past all three and back.
    await bladeTo(t, -0.4, s0[2] + 0.7 + 0.84 + 0.12);
    const o = await t.oven();
    const a = await t.proj(o.peel.at);
    const b = await t.proj([3.1, o.peel.at[1], o.peel.at[2]]);
    await t.move(t.at[0] + b[0] - a[0], t.at[1] + jit(4), 700, { tremor: 2 });
    await t.move(t.at[0] - (b[0] - a[0]), t.at[1] + jit(4), 700, { tremor: 2 });
    const swept = await yaws();
    // A brush: the tip, held clear in front of the pies, dipped quickly into the middle pie's
    // crust on the way past and out again (only what the brush itself does is counted).
    const s1 = await spotAt(t, 1);
    await bladeTo(t, s1[0] - 1.3, s1[2] + 0.66 + 0.84 + 0.3);
    const before = await yaws();
    const o2 = await t.oven();
    const a2 = await t.proj(o2.peel.at);
    const b2 = await t.proj([s1[0] - 0.7, o2.peel.at[1], s1[2] + 0.66 + 0.84 - 0.05]);
    const c2 = await t.proj([s1[0] - 0.1, o2.peel.at[1], s1[2] + 0.66 + 0.84 + 0.3]);
    await t.move(t.at[0] + b2[0] - a2[0], t.at[1] + b2[1] - a2[1], 90, { ease: 'in' });
    await t.move(t.at[0] + c2[0] - b2[0], t.at[1] + c2[1] - b2[1], 90, { ease: 'out' });
    await sleep(400);
    const brushed = (await yaws()).map((y, k) => +(y - before[k]).toFixed(3));
    await t.up();
    console.log('SPIN CHECK: swept past ->', JSON.stringify(swept), '| brush turned them by', JSON.stringify(brushed));
    report.push(['sweep past (yaw)', JSON.stringify(swept)], ['brush (turn)', JSON.stringify(brushed)]);
    await sleep(300);
    await turnRound(t, 1);
    report.push(['deliberate push (yaw)', JSON.stringify(await yaws())]);
    await t.b.close();
  }
  console.log('\nREPORT');
  for (const [k, v] of report) console.log(' ', k, typeof v === 'string' ? v : `score ${v.score?.score} stars ${JSON.stringify(v.stars)} notes ${JSON.stringify(v.score?.notes)} perks ${JSON.stringify(v.score?.perks)} faulty ${v.score?.faulty}`);
})();
