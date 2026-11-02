// After build #73 (DESIGN §24): tacos built in the rack on the comal's warm end, played with a
// finger. The page runs as a phone (390 x 844, dpr 2, hasTouch, isMobile); every gesture is a real
// touch sequence (CDP touch events), eased and a little shaky, at a person's pace, while the game
// clock runs in real time (ticked without drawing; drawn only for screenshots).
//
// Serves a Rodeo Platter (4 street tacos, Cactus Junction): four tortillas warmed on the hot side,
// stood in the rack one by one, pork tapped in, onion, cilantro and lime dragged in, left waiting
// in the rack a while, then the whole rack dragged up to the tray and served. Then Pastor Tacos
// (charred pineapple in the rack, green salsa squeezed at the tray), Street Tacos at Red Mesa with
// one taco filled on the comal before it goes in the rack, and a Quesadilla (fill, fold, flip).
// Each should come out at five stars with no "been sitting" note.
//
// npm run build && npx vite preview --port 4175
// PORT=4175 node tools/playtest/tacos-warm.cjs  ->  tools/playtest/shots-tacos/   (ONLY=123 picks sections)
const path = require('path');
const { chromium } = require('playwright');
const out = process.env.OUT || path.join(__dirname, 'shots-tacos') + '/';
require('fs').mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || 4175;
const ONLY = process.env.ONLY || '1234';
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = +(process.env.SEED || 7);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const jit = (a) => (rnd() - 0.5) * 2 * a;
const line = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const fails = [];

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
  await p.evaluate(() => { window.__bv.manual(true); window.__run = setInterval(() => window.__bv.tick(1 / 60), 16); });
  await sleep(1500);
  const cdp = await ctx.newCDPSession(p);
  const ev = (f, a) => p.evaluate(f, a);
  let at = null;
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 0.6, id: 0 }] });
  const t = {
    b, p, ev,
    get at() { return at; },
    draw: () => ev(() => window.__bv.step(0)),
    proj: (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v),
    comal: () => ev(() => window.__bv.comal()),
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
    async trace(pts, msPer = 16) {
      await t.down(...pts[0]);
      for (const q of pts.slice(1)) { await sleep(msPer); await send('touchMove', q[0], q[1]); at = q; }
      await sleep(msPer);
      await t.up();
      await sleep(250);
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
async function nextCustomer(t) {
  for (let i = 0; i < 40; i++) {
    const ok = await t.ev(() => { const g = window.__bv.game; const k = g.slots.findIndex((s) => s.order && !s.leaving && !s.plate.layers.length); if (k >= 0) g.active = k; else window.__bv.callNext(); return k >= 0; });
    if (ok) return;
    await sleep(500);
  }
}
async function serve(t, label, shotName) {
  const slot = await t.ev(() => window.__bv.game.active);
  const score = await t.ev((i) => { const g = window.__bv.game; const s = g.slots[i]; return window.__bv.scorePlate(s.order, s.plate); }, slot);
  const held = await t.ev((i) => Math.max(0, ...window.__bv.game.slots[i].plate.layers.map((l) => l.piece.held ?? 0)), slot);
  const [px, py] = await t.plate(slot);
  const before = await t.ev(() => ({ served: window.__bv.game.served, stars: window.__bv.game.stars.slice() }));
  const btn = await t.ev(() => { const b = [...document.querySelectorAll('.tray-serve')].filter((e) => !e.hidden)[0]; if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (btn) await t.p.touchscreen.tap(btn[0], btn[1]);
  else {
    await t.down(px, py);
    await sleep(80);
    await t.move(px + 6, py - 110, 160, { ease: 'out' });
    await t.up();
  }
  await sleep(350);
  if (shotName) await t.shot(shotName);
  await sleep(350);
  const after = await t.ev(() => ({ served: window.__bv.game.served, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  const stars = after.stars.slice(before.stars.length);
  console.log(`SERVED ${label}: score ${score.score} stars ${JSON.stringify(stars)} notes ${JSON.stringify(score.notes)} held ${held.toFixed(1)}s bubble ${JSON.stringify(after.bubble)}`);
  if (after.served - before.served !== 1 || stars[0] !== 5 || score.notes.some((n) => /sitting/.test(n))) fails.push(`${label}: ${JSON.stringify({ stars, notes: score.notes })}`);
  return score;
}

/** Comal spots on the hot side for n tortillas (world), two rows across the two hot thirds. */
async function hotSpots(t, n) {
  const c = await t.comal();
  const [z0, z1] = [c.zonePoints[0][2], c.zonePoints[1][2]];
  const xs = [c.zonePoints[0][0] - 0.45, c.zonePoints[0][0] + 0.48, c.zonePoints[1][0] - 0.5, c.zonePoints[1][0] + 0.4];
  const zs = [z0 - 0.15, z1 + 0.85];
  const spots = [];
  for (let i = 0; i < n; i++) spots.push([xs[i % 4], 0.87, zs[Math.floor(i / 4) % 2] + (i % 2 ? 0.25 : -0.05)]);
  return spots;
}
const near = (items, w) => items.reduce((a, it) => (!a || Math.hypot(it.at[0] - w[0], it.at[2] - w[2]) < Math.hypot(a.at[0] - w[0], a.at[2] - w[2]) ? it : a), null);
async function rackPt(t) { return t.proj((await t.comal()).rack.at); }
async function binTo(t, kind, to) { await t.drag(await t.hp('bin', { kind }), to); }
/** Wait (real time) until every tortilla on the comal is soft and spotted. */
async function warmAll(t, kinds = ['corn', 'flour']) {
  for (let i = 0; i < 60; i++) {
    const its = (await t.comal()).items.filter((it) => kinds.includes(it.kind) && !it.folded);
    if (its.length && its.every((it) => it.cook >= 0.45)) return;
    await sleep(250);
  }
}
/** Each warm tortilla on the comal into the rack, a person's drag apiece. */
async function tortillasToRack(t, spots, shotAfter) {
  for (let i = 0; i < spots.length; i++) {
    const it = near((await t.comal()).items, spots[i]);
    await t.drag(await t.proj(it.at), await rackPt(t));
    if (shotAfter && i === shotAfter.at) await t.shot(shotAfter.name);
  }
}
const rackNow = async (t) => (await t.comal()).rack.layers.map((l) => `${l.kind}:${l.cook.toFixed(2)}`).join(' ');
/** Lift the rack and carry it up to the active tray, a screenshot on the way. */
async function rackToTray(t, shotName) {
  const r = await rackPt(t);
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  await t.down(r[0] + jit(4), r[1] + jit(3));
  await sleep(110);
  await t.move(r[0] + jit(6), r[1] - 60, 200, { ease: 'in' });
  await t.move(px + jit(8), py + jit(6), 480, { bow: jit(12) });
  await sleep(120);
  if (shotName) await t.shot(shotName);
  await t.up();
  await sleep(500);
  const tray = await t.ev(() => { const g = window.__bv.game; return g.slots[g.active].plate.layers.map((l) => l.piece.kind).join(','); });
  console.log('  on the tray:', tray, '| rack now', JSON.stringify(await rackNow(t)));
}
/** Squeeze a bottle over the active tray (salsa on the tacos). */
async function trayBottle(t, kind) {
  const [px] = await t.plate(await t.ev(() => window.__bv.game.active));
  const bt = await t.hp('bottle', { sauce: kind });
  const [cx, cy, side] = await t.ev(() => window.__bv.sauceCentre());
  const pts = [...line(bt[0], bt[1], px, cy, 12)];
  for (let z = 0; z <= 6; z++) pts.push([cx + (z % 2 ? 0.32 : -0.32) * side, cy - 0.25 * side + z * 0.08 * side + 34]);
  const full = [];
  for (let i = 1; i < pts.length; i++) full.push(...line(...pts[i - 1], ...pts[i], 8).slice(i > 1 ? 1 : 0));
  await t.trace(full, 14);
  await sleep(300);
}

const RODEO = {
  name: 'Rodeo Platter', price: 15, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'corn', toasted: true, count: 4 }, { kind: 'pork', count: 4 }, { kind: 'onion', count: 1 }, { kind: 'cilantro' }, { kind: 'lime' }],
};
const STREET = { ...RODEO, name: 'Street Tacos', price: 10, layers: [{ kind: 'corn', toasted: true, count: 3 }, { kind: 'pork', count: 3 }, { kind: 'onion', count: 1 }, { kind: 'cilantro' }, { kind: 'lime' }] };
const PASTOR = { ...RODEO, name: 'Pastor Tacos', price: 12, layers: [{ kind: 'corn', toasted: true, count: 2 }, { kind: 'pork', count: 2 }, { kind: 'pineapple', toasted: true }, { kind: 'onion', count: 1 }, { kind: 'greensalsa' }] };
const QUESA = { ...RODEO, name: 'Quesadilla', price: 9, layers: [{ kind: 'flour', toasted: true, folded: true }, { kind: 'jack', melted: true }] };

(async () => {
  if (ONLY.includes('1') || ONLY.includes('2')) {
    const t = await start('cactus');
    await t.shot('comal-rack-empty');
    if (ONLY.includes('1')) {
      // 1. Rodeo Platter: 4 tortillas on the hot side, into the rack one by one, filled, held, served.
      await forceOrder(t, RODEO);
      const t0 = Date.now();
      const spots = await hotSpots(t, 4);
      for (const s of spots) await binTo(t, 'corn', await t.proj(s));
      await warmAll(t, ['corn']);
      await tortillasToRack(t, spots, { at: 1, name: 'rodeo-two-in-rack' });
      console.log('  rack:', await rackNow(t));
      // One drag from the well is one scoop into the rack (DESIGN §31: a tap only names it).
      for (let i = 0; i < 4; i++) await binTo(t, 'pork', await rackPt(t));
      await t.shot('rodeo-pork-in-rack', { hint: true });
      for (const k of ['onion', 'cilantro', 'lime']) await binTo(t, k, await rackPt(t));
      await t.shot('rodeo-built-on-warm-side');
      console.log('  rack:', await rackNow(t), `(${((Date.now() - t0) / 1000).toFixed(1)} s in)`);
      // Busy with something else for a while: nothing in the rack cools.
      await sleep(20000);
      const rk = (await t.comal()).rack.layers;
      console.log('  after 20 s in the rack: max held', Math.max(...rk.map((l) => l.held)), 'tortilla cook', rk.filter((l) => l.kind === 'corn').map((l) => l.cook.toFixed(2)).join('/'));
      await rackToTray(t, 'rodeo-rack-to-tray');
      await sleep(800);
      await t.shot('rodeo-on-tray');
      console.log(`  built and on the tray ${((Date.now() - t0) / 1000).toFixed(1)} s after the first tortilla`);
      await serve(t, 'Rodeo Platter', 'rodeo-served');
    }
    if (ONLY.includes('2')) {
      // 2. Pastor Tacos: pineapple charred on the comal and flipped, into the rack; green salsa at the tray.
      await nextCustomer(t);
      await forceOrder(t, PASTOR);
      const spots = await hotSpots(t, 3);
      await binTo(t, 'pineapple', await t.proj(spots[2]));
      await binTo(t, 'corn', await t.proj(spots[0]));
      await binTo(t, 'corn', await t.proj(spots[1]));
      await sleep(3500);
      const pin = near((await t.comal()).items, spots[2]);
      await t.tap(await t.proj(pin.at));
      await warmAll(t, ['corn']);
      await tortillasToRack(t, spots.slice(0, 2));
      for (let i = 0; i < 2; i++) await binTo(t, 'pork', await rackPt(t));
      for (let i = 0; i < 20; i++) { const it = near((await t.comal()).items, spots[2]); if (it.faces[0] >= 0.45 && it.faces[1] >= 0.3) break; await sleep(250); }
      await t.drag(await t.proj(near((await t.comal()).items, spots[2]).at), await rackPt(t));
      await binTo(t, 'onion', await rackPt(t));
      console.log('  rack:', await rackNow(t));
      await t.shot('pastor-in-rack');
      await rackToTray(t);
      await trayBottle(t, 'greensalsa');
      await t.shot('pastor-salsa-on-tray');
      await serve(t, 'Pastor Tacos');
    }
    await t.b.close();
  }
  if (ONLY.includes('3') || ONLY.includes('4')) {
    const t = await start('redmesa');
    if (ONLY.includes('3')) {
      // 3. Street Tacos: one tortilla gets its pork on the comal (the old way), the rest in the rack.
      await forceOrder(t, STREET);
      const spots = await hotSpots(t, 3);
      for (const s of spots) await binTo(t, 'corn', await t.proj(s));
      await warmAll(t, ['corn']);
      const first = near((await t.comal()).items, spots[0]);
      await binTo(t, 'pork', await t.proj(first.at));
      await binTo(t, 'onion', await t.proj(first.at));
      await tortillasToRack(t, spots);
      for (let i = 0; i < 2; i++) await binTo(t, 'pork', await rackPt(t));
      for (const k of ['onion', 'cilantro', 'lime']) await binTo(t, k, await rackPt(t));
      console.log('  rack:', await rackNow(t));
      await t.shot('street-in-rack');
      await rackToTray(t);
      await serve(t, 'Street Tacos');
    }
    if (ONLY.includes('4')) {
      // 4. Quesadilla: flour on the comal, cheese, fold by dragging the edge across, flip once.
      await nextCustomer(t);
      await forceOrder(t, QUESA);
      const c = await t.comal();
      const q0 = [c.zonePoints[1][0] - 0.2, 0.87, c.zonePoints[1][2] + 0.3];
      await binTo(t, 'flour', await t.proj(q0));
      let q = near((await t.comal()).items, q0);
      await binTo(t, 'jack', await t.proj(q.at));
      q = near((await t.comal()).items, q0);
      await t.trace(line(...(await t.proj([q.at[0], 0.87, q.at[2] + q.r * 0.75])), ...(await t.proj([q.at[0], 0.87, q.at[2] - q.r * 0.45])), 14), 22);
      q = near((await t.comal()).items, q0);
      console.log('  folded?', q.folded);
      for (let i = 0; i < 40; i++) { q = near((await t.comal()).items, q0); if (q.faces[0] >= 0.5) break; await sleep(250); }
      await t.tap(await t.proj(q.at));
      for (let i = 0; i < 60; i++) { q = near((await t.comal()).items, q0); if (Math.min(...q.faces) >= 0.45 && q.fill[0].melt >= 0.6) break; await sleep(250); }
      console.log('  quesadilla', JSON.stringify({ faces: q.faces.map((f) => +f.toFixed(2)), melt: +q.fill[0].melt.toFixed(2), flips: q.flips }));
      await t.drag(await t.proj(q.at), await t.plate(await t.ev(() => window.__bv.game.active)));
      await t.shot('quesadilla-on-tray');
      await serve(t, 'Quesadilla');
    }
    await t.b.close();
  }
  console.log(fails.length ? `FAILED:\n  ${fails.join('\n  ')}` : 'ALL GOOD');
  process.exit(fails.length ? 1 : 0);
})();
