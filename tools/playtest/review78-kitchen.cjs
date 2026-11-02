// Screenshots for the kitchen and mechanics fixes after the build #78 review (DESIGN §33).
// npm run build && npx vite preview --port 4175
// PORT=4175 [OUT=dir/] [ONLY=serve,ask,...] node tools/playtest/review78-kitchen.cjs
// Shots: a finished burger with Serve above the tray, the local ask chip and the Prep row, the tray
// zoom with folded tickets, a stamped coin, a 4★ aside, the warm zone's hold bar, soggy fries, the
// oven's uneven-bake cue, the regular's ticket, the garnish dish, the timer ring and the call chip.
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'out') + '/';
const { open, step, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town, extra = {}) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [], ...extra,
});
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

async function start(town, extra, prep) {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); }, save(town, extra));
  await p.reload();
  await p.waitForTimeout(900);
  if (prep) {
    await p.click('[data-home=open]');
    await p.waitForTimeout(900);
    await prep(p);
    await p.click('[data-act=open]');
    await p.waitForTimeout(300);
  } else await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1.5);
  return { b, p };
}
// With the clock driven by hand the page draws no frames, so fade-ins sit at their first frame: finish them.
const shot = async (p, name) => { await p.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} })); return p.screenshot({ path: `${out}${name}.png` }); };
const pc = `(() => { let uid = 9000; return (kind, cook = 0.55, extra = {}) => ({ piece: { uid: uid++, kind, cook: [cook, cook], ...extra }, offX: 0, offZ: 0 }); })()`;

(async () => {
  if (want('serve')) {
    const { b, p } = await start('pinecrest', {}, async (p) => {
      // The Prep screen with today's local ask.
      const sec = await p.$('.prep-ask');
      if (sec) await sec.scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      await shot(p, 'prep-local-ask');
    });
    // One order on tray 0, finished: Serve should appear above the tray after 0.3 s, not over the food.
    await p.evaluate((pcSrc) => {
      const pc = eval(pcSrc);
      const g = window.__bv.game;
      const o = { id: 51, name: 'Pinecrest Classic', price: 9, mods: [], layers: [{ kind: 'bun' }, { kind: 'patty' }, { kind: 'cheese' }, { kind: 'lettuce' }, { kind: 'tomato', count: 2 }, { kind: 'bun' }], fries: false, friesSize: 'S', drink: null, drinkSize: 'S' };
      const s = g.slots[0];
      s.order = o; s.leaving = false; s.maxPatience = 200; s.patience = 180; s.ticketKey = '';
      s.plate = { layers: ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'tomato', 'bun'].map((k) => pc(k, k === 'patty' ? 0.55 : 0)), fries: null, drink: null };
      window.__bv.trayView.plates[0].setDish(true);
      window.__bv.trayView.plates[0].sync(s.plate, true, () => {});
      g.active = 0;
    }, pc);
    await step(p, 0.1);
    await p.waitForTimeout(150);
    await shot(p, 'serve-hidden-while-landing');
    await step(p, 0.5);
    await p.waitForTimeout(300);
    await shot(p, 'serve-above-tray');
    // Fold the receipt: the trays zoom in.
    const t = await p.$('[data-r=ticket]:not([hidden])');
    if (t) {
      const mode = await t.getAttribute('data-mode');
      if (mode === 'big') { await t.click(); await step(p, 0.6); }
    }
    await step(p, 1);
    await p.waitForTimeout(300);
    await shot(p, 'tray-zoom-tickets-folded');
    // Serve it: a 5★ with no touches; then a grill-marked patty with drawn sauce for the stamps.
    await p.evaluate((pcSrc) => {
      const pc = eval(pcSrc);
      const g = window.__bv.game;
      const s = g.slots[0];
      s.plate.layers[1] = pc('patty', 0.55, { marks: [1, 0.4] });
      s.order.layers.splice(5, 0, { kind: 'ketchup' });
      const stroke = []; for (let k = 0; k < 60; k++) stroke.push({ x: Math.cos(k / 4) * 0.4 * (k / 60 + 0.4), z: Math.sin(k / 4) * 0.4 * (k / 60 + 0.4) });
      s.plate.layers.splice(6, 0, pc('ketchup', 0, { stroke }));
      window.__bv.trayView.plates[0].sync(s.plate, false, () => {});
    }, pc);
    await step(p, 0.4);
    const r = await p.evaluate(() => { const s = window.__bv.game.slots[0]; const x = window.__bv.scorePlate(s.order, s.plate); return { score: x.score, stars: x.stars, touches: x.touches, notes: x.notes }; });
    console.log('touch order', JSON.stringify(r));
    await p.evaluate(() => window.__bv.serve(0));
    await step(p, 0.35);
    await p.waitForTimeout(200);
    await shot(p, 'coin-with-touch-stamps');
    await b.close();
  }
  if (want('aside')) {
    const { b, p } = await start('pinecrest');
    await p.evaluate((pcSrc) => {
      const pc = eval(pcSrc);
      const g = window.__bv.game;
      const o = { id: 52, name: 'Pinecrest Classic', price: 12, mods: [], layers: [{ kind: 'bun' }, { kind: 'patty' }, { kind: 'cheese' }, { kind: 'bun' }], fries: true, friesSize: 'M', drink: null, drinkSize: 'S' };
      const s = g.slots[1];
      s.order = o; s.leaving = false; s.maxPatience = 200; s.patience = 150; s.ticketKey = '';
      s.fig = s.fig || null;
      s.plate = { layers: ['bun', 'patty', 'cheese', 'bun'].map((k) => pc(k)), fries: { cook: 0.72, size: 'M', fill: 1, salt: 0 }, drink: null };
      window.__bv.trayView.plates[1].setDish(true);
      window.__bv.trayView.plates[1].sync(s.plate, false, () => {});
    }, pc);
    await step(p, 0.3);
    await p.evaluate(() => window.__bv.serve(1));
    await step(p, 0.4);
    await p.waitForTimeout(250);
    await shot(p, 'four-star-aside');
    await b.close();
  }
  if (want('warm')) {
    // A patty parked on the warm zone for a while: its hold bar under the meter.
    const { b, p } = await start('pinecrest');
    await p.evaluate(() => window.__bv.goToPage(1));
    await step(p, 0.8);
    await p.evaluate(() => {
      const c = window.__bv.counter;
      const spots = c.zoneSpots(2);
      c.zones[2] = 'warm';
      for (let i = 0; i < 2; i++) {
        const it = c.addGrillItem({ uid: 8000 + i, kind: 'patty', cook: [0.55, 0.55] }, spots[i].x, spots[i].z);
        if (it) { it.piece.cook = [0.55, 0.55]; it.piece.held = i ? 70 : 20; }
      }
    });
    await step(p, 0.5);
    await p.waitForTimeout(300);
    await shot(p, 'warm-zone-hold-bars');
    await b.close();
  }
  if (want('oven')) {
    // A half-baked pie, its back side well ahead of its front: split meter and the turn arrow.
    const { b, p } = await start('applecross');
    await p.evaluate(() => window.__bv.goToPage(1));
    await step(p, 0.8);
    await p.evaluate(() => {
      const c = window.__bv.counter;
      const rim = [0.62, 0.7, 0.66, 0.5, 0.3, 0.22, 0.28, 0.45];
      c.setSpot(0, [{ piece: { uid: 7001, kind: 'dough', cook: [0.6, 0.31], rim, yaw: 0 }, offX: 0, offZ: 0 }]);
      c.setSpot(1, [{ piece: { uid: 7002, kind: 'dough', cook: [0.5, 0.5], rim: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], yaw: 0 }, offX: 0, offZ: 0 }]);
    });
    await p.evaluate(() => { const c = window.__bv.counter; c.ovenSpots[0].layers[0].piece.rim = [0.62, 0.7, 0.66, 0.5, 0.3, 0.22, 0.28, 0.45]; });
    await step(p, 0.1);
    await p.waitForTimeout(300);
    await shot(p, 'oven-uneven-bake-cue');
    await b.close();
  }
  if (want('fryer')) {
    // Kitchen timer: a ring on the counter buttons; fries lifted 40 s ago going soggy; a carton.
    const { b, p } = await start('pinecrest', { bonuses: ['timer', 'lamp'], bonus: 'timer' });
    await p.evaluate(() => window.__bv.goToPage(2));
    await step(p, 0.8);
    await p.evaluate(() => {
      const c = window.__bv.counter;
      Object.assign(c.baskets[0], { loaded: true, cook: 0.3, amount: 0.34, down: true, fry: 'fries' });
      Object.assign(c.baskets[1], { loaded: true, cook: 0.75, amount: 0.34, down: false, fry: 'fries', held: 40 });
      Object.assign(c.packs[0], { size: 'M', cook: 0.72, fill: 1, salt: 0, curds: false, gravy: false, fry: 'fries', held: 12 });
      c.syncPack(0);
    });
    await step(p, 0.4);
    await p.waitForTimeout(300);
    await shot(p, 'fryer-soggy-bars-and-timer-ring');
    await p.evaluate(() => window.__bv.goToPage(1));
    await step(p, 0.8);
    await p.evaluate(() => { const c = window.__bv.counter; const s = c.zoneSpots(0)[0]; c.addGrillItem({ uid: 8100, kind: 'patty', cook: [0.15, 0.1] }, s.x, s.z); });
    await step(p, 0.4);
    await p.waitForTimeout(300);
    await shot(p, 'grill-timer-rings');
    await b.close();
  }
  if (want('busy')) {
    // A full grill: crowded meters shrink, done ones well short of over-done go faint, the most
    // urgent sits on top.
    const { b, p } = await start('elkpass');
    await p.evaluate(() => window.__bv.goToPage(1));
    await step(p, 0.8);
    await p.evaluate(() => {
      const c = window.__bv.counter;
      let uid = 8200;
      const add = (kind, cook, i, k, dx = 0) => { const s = c.zoneSpots(i)[k]; c.addGrillItem({ uid: uid++, kind, cook: [cook, cook] }, s.x + dx, s.z); };
      add('patty', 0.2, 0, 0, -0.35); add('patty', 0.45, 0, 0, 0.35);
      add('patty', 0.5, 0, 1, -0.35); add('bacon', 0.3, 0, 1, 0.35);
      add('egg', 0.4, 1, 0, -0.3); add('egg', 0.2, 1, 0, 0.3);
      add('patty', 0.48, 1, 1); add('patty', 0.5, 2, 1);
    });
    await step(p, 2.5);
    await p.waitForTimeout(300);
    await shot(p, 'grill-busy-meters');
    await b.close();
  }
  if (want('garnish')) {
    // The coast: the cucumber dish by the ice, the regular's ticket with their name, and a
    // garnished drink on the tray.
    const { b, p } = await start('saltwater');
    await p.evaluate(() => window.__bv.goToPage(0));
    await step(p, 0.8);
    await p.evaluate(() => {
      const g = window.__bv.game;
      const s = g.slots[0];
      const o = window.__bv.regularOrder(77);
      s.order = o; s.leaving = false; s.maxPatience = 200; s.patience = 190; s.ticketKey = '';
      s.plate = { layers: [], fries: null, drink: { flavor: o.drink, fill: 0.86, size: o.drinkSize, ice: true, lid: true, garnish: o.garnish } };
      window.__bv.trayView.plates[0].sync(s.plate, true, () => {});
      g.active = 0;
    });
    await step(p, 0.4);
    await p.waitForTimeout(300);
    await shot(p, 'drinks-garnish-and-regular');
    await b.close();
  }
  console.log('done');
})();
