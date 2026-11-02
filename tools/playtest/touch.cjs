// Shared phone-touch helpers (as tacos-warm.cjs and oven-peel.cjs play): the page runs as a phone
// (390 x 844, dpr 2, hasTouch, isMobile); gestures are real CDP touch sequences, eased and a little
// shaky, at a person's pace, while the game clock runs in real time (ticked without drawing; drawn
// only for screenshots).
const { chromium } = require('playwright');
const PORT = process.env.PORT || 4175;
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = +(process.env.SEED || 7);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const jit = (a) => (rnd() - 0.5) * 2 * a;

async function start(town, out) {
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
  await p.evaluate(() => { window.__bv.manual(true); window.__run = setInterval(() => window.__bv.tick(1 / 60), 16); });
  await sleep(1500);
  const cdp = await ctx.newCDPSession(p);
  const ev = (f, a) => p.evaluate(f, a);
  let at = null;
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 0.6, id: 0 }] });
  const t = {
    b, p, ev, send,
    get at() { return at; },
    draw: () => ev(() => window.__bv.step(0)),
    proj: (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v),
    hint: () => ev(() => document.querySelector('[data-r="hint"]')?.textContent ?? ''),
    async shot(name, { hint = false } = {}) {
      if (!hint) await ev(() => { const h = document.querySelector('[data-r="hint"]'); if (h) h.style.visibility = 'hidden'; });
      await t.draw();
      await p.screenshot({ path: `${out}${name}.png` });
      await ev(() => { const h = document.querySelector('[data-r="hint"]'); if (h) h.style.visibility = ''; });
    },
    async down(x, y) { at = [x, y]; await send('touchStart', x, y); },
    async up() { await send('touchEnd'); at = null; },
    async move(x, y, ms, { ease = 'inout', tremor = 1.2, bow = 0 } = {}) {
      const [x0, y0] = at;
      const t0 = Date.now();
      for (;;) {
        await sleep(14);
        const u = Math.min(1, (Date.now() - t0) / ms);
        const e = ease === 'out' ? 1 - (1 - u) ** 2 : ease === 'in' ? u * u : ease === 'lin' ? u : u * u * (3 - 2 * u);
        const side = Math.sin(Math.PI * u) * bow;
        const last = u >= 1;
        const q = [x0 + (x - x0) * e + side + (last ? 0 : jit(tremor)), y0 + (y - y0) * e + (last ? 0 : jit(tremor))];
        await send('touchMove', q[0], q[1]);
        at = q;
        if (last) break;
      }
      at = [x, y];
    },
    async tap(pt) { await t.down(pt[0] + jit(3), pt[1] + jit(3)); await sleep(70 + rnd() * 60); await t.up(); await sleep(220 + rnd() * 160); },
    /** Press on `from`, pause like a person, carry it to `to` and let go. */
    async drag(from, to, ms = 420) {
      await t.down(from[0] + jit(3), from[1] + jit(3));
      await sleep(80 + rnd() * 70);
      await t.move(to[0] + jit(4), to[1] + jit(4), ms + rnd() * 120, { bow: jit(14) });
      await sleep(60 + rnd() * 60);
      await t.up();
      await sleep(250 + rnd() * 200);
    },
    /** Follow a list of points with the finger down. */
    async path(pts, msPer = 16) {
      for (const q of pts) { await sleep(msPer); await send('touchMove', q[0], q[1]); at = q; }
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

/** Give the customer at the window this order (the playtest wants a known build). */
async function forceOrder(t, order) {
  await t.ev((o) => {
    const g = window.__bv.game;
    let k = g.slots.findIndex((x) => x.order && !x.leaving && !x.plate.layers.length);
    if (k < 0) k = g.active;
    g.active = k;
    const s = g.slots[k];
    Object.assign(s.order, o);
    s.patience = s.maxPatience = 600;
    s.ticketKey = '';
  }, order);
}
/** Wait for a customer at the window with an empty tray and make them the active one. */
async function nextCustomer(t) {
  for (let i = 0; i < 40; i++) {
    const ok = await t.ev(() => { const g = window.__bv.game; const k = g.slots.findIndex((s) => s.order && !s.leaving && !s.plate.layers.length); if (k >= 0) g.active = k; else window.__bv.callNext(); return k >= 0; });
    if (ok) return;
    await sleep(500);
  }
}
module.exports = { start, sleep, jit, rnd, forceOrder, nextCustomer, ALL };
