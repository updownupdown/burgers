// Phase 4 kitchen checks (DESIGN §24): Orchard Isle's hearth oven.
// Shots of the oven at Applecross and Port Amber, pies baking with their meters, a turn, a
// finished flatbread on the tray with its ticket, a calzone, the fryer with zucchini fritti and
// apple fritters, and the Pines grill, the coast press and the Red Rock comal unchanged. A Harvest
// Red and a Fig & Ham are driven through with pointer events (the dough tapped onto the peel,
// sauce ladled or oil drizzled, toppings tapped on, the pie slid into the oven and turned once,
// then out to the tray for basil or honey) and served, and the scores printed. Section 5 is the
// whole-trip check: dev mode's simulated 100% save, the map, the Garage's bonuses and every town's
// Prep & Open menu. ONLY=135 runs just those sections.
// npm run build && npx vite preview --port 4175
// PORT=4175 NODE_PATH=$(npm root -g) node tools/playtest/oven-phase4.cjs  ->  tools/playtest/shots-phase4/
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-phase4') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});

async function start(town) {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: '' });
  await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), save(town));
  await p.reload();
  await p.waitForTimeout(800);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 1.5);
  const ev = (f, a) => p.evaluate(f, a);
  const fire = (t, x, y) => ev(([t, x, y]) => document.getElementById('gl').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })), [t, x, y]);
  const drag = async (pts, ms = 16, after = 0.4) => {
    await fire('pointerdown', ...pts[0]);
    for (const q of pts.slice(1)) { await p.waitForTimeout(ms); await fire('pointermove', ...q); }
    await p.waitForTimeout(ms);
    await fire('pointerup', ...pts[pts.length - 1]);
    await step(p, after);
  };
  const tap = async (pt) => drag([pt, pt], 30, 0.2);
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find((h) => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const plate = (i) => ev((i) => { const b = window.__bv.trayView.plates[i].burger; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; return window.__bv.project('tray', e[12], 0.3, e[14]); }, i);
  const oven = () => ev(() => window.__bv.oven());
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const hideHint = () => ev(() => { document.querySelector('[data-r="hint"]').style.display = 'none'; });
  return { b, p, ev, fire, drag, tap, hp, plate, oven, proj, hideHint };
}

/** Give the customer at the window this order (the playtest wants a known build). */
async function forceOrder(t, order) {
  await t.ev((o) => {
    const g = window.__bv.game;
    const s = g.slots[g.active];
    Object.assign(s.order, o);
    s.patience = s.maxPatience = 400;
    s.ticketKey = '';
  }, order);
  await step(t.p, 0.1);
}
/** Make sure a customer is at the window and active. */
async function nextCustomer(t) {
  for (let i = 0; i < 30; i++) {
    const ok = await t.ev(() => { const g = window.__bv.game; const k = g.slots.findIndex((s) => s.order && !s.leaving); if (k >= 0) g.active = k; else window.__bv.callNext(); return k >= 0; });
    if (ok) return;
    await step(t.p, 1);
  }
}
const serve = async (t) => {
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  const before = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, tips: window.__bv.game.tips, stars: window.__bv.game.stars.slice() }));
  await t.drag(line(px, py, px, py - 120, 8));
  await step(t.p, 0.3);
  const after = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, tips: window.__bv.game.tips, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, earned: +(after.money - before.money).toFixed(2), tips: +(after.tips - before.tips).toFixed(2), stars: after.stars.slice(before.stars.length), bubble: after.bubble };
};
/** What the active tray holds, and how the game would score it right now. */
const plateNow = (t) => t.ev(() => {
  const g = window.__bv.game;
  const s = g.slots[g.active];
  const d = s.plate.layers[0]?.piece;
  return { layers: s.plate.layers.map((l) => l.piece.kind).join(','), crust: d ? d.cook.map((c) => +c.toFixed(2)) : null, turns: d?.turns ?? 0, scorch: +(d?.scorch ?? 0).toFixed(2), cuts: d?.cuts ?? 0, folded: !!d?.folded };
});
/** Spread sauce from the pot (or olive oil from its bottle) over the pie on the peel, in a spiral. */
async function ladle(t, from, kind) {
  const o = await t.oven();
  const [x, , z] = o.peel.at;
  const rx = 1.6 * 0.441 * 0.95;
  const rz = 1.2 * 0.441 * 0.95;
  const pts = [];
  const turns = kind === 'oil' ? 0 : 1;
  if (kind === 'oil') for (let i = 0; i <= 6; i++) pts.push([x + (i % 2 ? 0.55 : -0.55) * rx, 0.19, z + (-0.6 + i * 0.2) * rz]);
  else for (let i = 0; i <= 64; i++) { const a = i * 0.42; const r = Math.min(0.93, 0.05 + i * 0.0145); pts.push([x + Math.cos(a) * r * rx, 0.19, z + Math.sin(a) * r * rz]); }
  const scr = [];
  for (const q of pts) { const [sx, sy] = await t.proj(q); scr.push([sx, sy + 34]); }
  await t.fire('pointerdown', ...from);
  for (const q of line(from[0], from[1], scr[0][0], scr[0][1], 8)) { await t.p.waitForTimeout(12); await t.fire('pointermove', ...q); }
  for (const q of scr) { await t.p.waitForTimeout(10); await t.fire('pointermove', ...q); }
  return async () => { await t.fire('pointerup', ...scr[scr.length - 1]); await step(t.p, 0.3); };
}
/** Squeeze a sauce bottle over the active tray (the honey after the oven). */
async function trayBottle(t, kind) {
  const [px] = await t.plate(await t.ev(() => window.__bv.game.active));
  const bt = await t.hp('bottle', { sauce: kind });
  const [cx, cy, side] = await t.ev(() => window.__bv.sauceCentre());
  await t.fire('pointerdown', ...bt);
  for (const q of line(bt[0], bt[1], px, cy, 12)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
  await step(t.p, 0.4);
  let at = [px, cy];
  for (let z = 0; z <= 5; z++) {
    const q = [cx + (z % 2 ? 0.3 : -0.3) * side, cy - 0.2 * side + z * 0.08 * side + 34];
    for (const r of line(at[0], at[1], q[0], q[1], 8)) { await t.p.waitForTimeout(8); await t.fire('pointermove', ...r); }
    at = q;
  }
  await step(t.p, 0.1);
  await t.fire('pointerup', ...at);
  await step(t.p, 0.6);
}
const tapBin = async (t, kind, n) => { const b = await t.hp('bin', { kind }); for (let i = 0; i < n; i++) await t.tap(b); };
const peelToSpot = async (t, i) => { const o = await t.oven(); await t.drag(line(...(await t.proj(o.peel.at)), ...(await t.proj(o.spots[i].at)), 12)); };
const spotTo = async (t, i, to) => { const o = await t.oven(); await t.drag(line(...(await t.proj(o.spots[i].at)), ...to, 14)); };
const crust = async (t, i) => { const o = await t.oven(); const d = o.spots[i].layers[0]; return d ? `cook ${d.cook.map((c) => c.toFixed(2)).join('/')} turns ${d.turns} scorch ${d.scorch.toFixed(2)}` : 'empty'; };

const HARVEST = {
  name: 'Harvest Red', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true, turns: 1 }, { kind: 'redsauce' }, { kind: 'mozzarella', count: 4, melted: true }, { kind: 'basil', after: true }],
};
const FIGHAM = {
  name: 'Fig & Ham', price: 13, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true, turns: 1 }, { kind: 'oil' }, { kind: 'mozzarella', count: 3, melted: true }, { kind: 'ham', count: 3 }, { kind: 'fig', count: 4 }, { kind: 'honey', after: true }],
};
const CALZONE = {
  name: 'Calzone', price: 14, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'dough', toasted: true, turns: 2, folded: true }, { kind: 'redsauce' }, { kind: 'mozzarella', count: 3, melted: true }, { kind: 'ham', count: 2 }, { kind: 'mushroom', count: 3 }],
};

const ONLY = process.env.ONLY || '';
const want = (n) => !ONLY || ONLY.includes(n);

(async () => {
  const shot = (t, name) => t.hideHint().then(() => t.p.screenshot({ path: `${out}${name}.png` }));
  // 1. Applecross: the oven, a Harvest Red driven through and served.
  if (want('1')) {
    const t = await start('applecross');
    await shot(t, 'oven-applecross');
    await forceOrder(t, HARVEST);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    const fin = await ladle(t, await t.proj(o.pot), 'redsauce');
    await step(t.p, 0.05);
    await shot(t, 'ladle-sauce');
    await fin();
    await tapBin(t, 'mozzarella', 4);
    console.log('peel', JSON.stringify((await t.oven()).peel.layers.map((l) => l.kind + (l.stroke ? `(${l.stroke})` : ''))));
    await shot(t, 'peel-built');
    await peelToSpot(t, 0);
    // A second pie beside it, for the shot of two baking.
    await t.tap(await t.proj(o.dough));
    const fin2 = await ladle(t, await t.proj(o.pot), 'redsauce');
    await fin2();
    await tapBin(t, 'mushroom', 5);
    await peelToSpot(t, 1);
    await step(t.p, 9);
    console.log('at 10 s', await crust(t, 0));
    await shot(t, 'oven-baking-meters');
    await t.tap(await t.proj((await t.oven()).spots[0].at));
    await step(t.p, 0.15);
    await shot(t, 'oven-turn');
    await step(t.p, 10.6);
    console.log('at 21 s', await crust(t, 0));
    await shot(t, 'oven-done');
    const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
    await spotTo(t, 0, [px, py]);
    await tapBin(t, 'basil', 1);
    console.log('Harvest Red on tray', JSON.stringify(await plateNow(t)));
    await step(t.p, 0.5);
    await shot(t, 'flatbread-on-tray');
    console.log('SERVED Harvest Red', JSON.stringify(await serve(t)));
    // Leave the other pie in unturned, to see it scorch.
    await step(t.p, 4);
    console.log('unturned pie', await crust(t, 1));
    await shot(t, 'oven-scorching');
    await t.ev(() => window.__bv.menu.openMenuRef());
    await t.p.waitForTimeout(500);
    await t.p.screenshot({ path: `${out}menu-applecross.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.ev(() => window.__bv.menu.openHowTo('oven'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-oven.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    // The fryer: zucchini through the batter, fried and salted.
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const f = await t.oven();
    const zb = await t.proj(f.fryBins.zucchini);
    const bat = await t.proj(f.batter);
    const b0 = await t.hp('basket', { idx: 0 });
    await t.drag([...line(...zb, ...bat, 10), ...line(...bat, ...b0, 10)]);
    await t.drag([...line(...zb, ...bat, 10), ...line(...bat, ...b0, 10)]);
    await t.tap(b0);
    await step(t.p, 6);
    await shot(t, 'fryer-zucchini-frying');
    console.log('baskets', JSON.stringify(await t.ev(() => window.__bv.counter.baskets.map((b) => ({ loaded: b.loaded, fry: b.fry, cook: +b.cook.toFixed(2), amount: b.amount })))));
    await t.b.close();
  }
  // 2. Larkvale: a Fig & Ham (olive oil, honey after); apple fritters with sugar.
  if (want('2')) {
    const t = await start('larkvale');
    await shot(t, 'oven-larkvale');
    await forceOrder(t, FIGHAM);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    const fin = await ladle(t, await t.hp('bottle', { sauce: 'oil' }), 'oil');
    await fin();
    await tapBin(t, 'mozzarella', 3);
    await tapBin(t, 'ham', 3);
    await tapBin(t, 'fig', 4);
    console.log('peel', JSON.stringify((await t.oven()).peel.layers.map((l) => l.kind + (l.stroke ? `(${l.stroke})` : ''))));
    await shot(t, 'peel-fig-ham');
    await peelToSpot(t, 1);
    await step(t.p, 10);
    await t.tap(await t.proj((await t.oven()).spots[1].at));
    await step(t.p, 11);
    console.log('fig & ham crust', await crust(t, 1));
    const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
    await spotTo(t, 1, [px, py]);
    await trayBottle(t, 'honey');
    console.log('Fig & Ham on tray', JSON.stringify(await plateNow(t)));
    await shot(t, 'fig-ham-on-tray');
    console.log('SERVED Fig & Ham', JSON.stringify(await serve(t)));
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const f = await t.oven();
    const fr = await t.proj(f.fryBins.fritters);
    const b1 = await t.hp('basket', { idx: 1 });
    await t.drag(line(...fr, ...b1, 10));
    await t.drag(line(...fr, ...b1, 10));
    await t.tap(b1);
    await step(t.p, 15);
    await t.tap(b1);
    const stack = await t.hp('stack', { idx: 1 });
    const pad = await t.hp('pack', { idx: 0 });
    await t.drag(line(...stack, ...pad, 10));
    await t.drag(line(...b1, ...pad, 12));
    const sg = await t.hp('shaker', { sugar: true });
    await t.fire('pointerdown', ...sg);
    for (const q of line(...sg, pad[0], pad[1] - 20, 8)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
    for (let i = 0; i < 6; i++) { await t.p.waitForTimeout(16); await t.fire('pointermove', pad[0] + (i % 2 ? 24 : -24), pad[1] - 20); }
    await t.fire('pointerup', pad[0], pad[1] - 20);
    await step(t.p, 0.4);
    await shot(t, 'fryer-fritters');
    console.log('fritters', JSON.stringify(await t.ev(() => window.__bv.counter.packs.map((p) => ({ size: p.size, fry: p.fry, fill: +p.fill.toFixed(2), cook: +p.cook.toFixed(2), sugar: p.salt })))));
    await t.ev(() => window.__bv.menu.openMenuRef());
    await t.p.waitForTimeout(500);
    await t.p.screenshot({ path: `${out}menu-larkvale.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 3. Port Amber: three spots and the board; a calzone folded and turned twice; a flatbread cut in four.
  if (want('3')) {
    const t = await start('portamber');
    await shot(t, 'oven-portamber');
    await forceOrder(t, CALZONE);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    const fin = await ladle(t, await t.proj(o.pot), 'redsauce');
    await fin();
    await tapBin(t, 'mozzarella', 3);
    await tapBin(t, 'ham', 2);
    await tapBin(t, 'mushroom', 3);
    // Fold: press near the left edge of the dough and drag across the middle.
    const [x, y, z] = (await t.oven()).peel.at;
    await t.drag(line(...(await t.proj([x - 0.62, y, z])), ...(await t.proj([x + 0.4, y, z])), 10));
    console.log('folded?', JSON.stringify((await t.oven()).peel.layers[0]));
    await shot(t, 'calzone-on-peel');
    await peelToSpot(t, 0);
    await step(t.p, 6);
    await t.tap(await t.proj((await t.oven()).spots[0].at));
    // A Harvest Red alongside, for the board.
    await t.tap(await t.proj(o.dough));
    const fin2 = await ladle(t, await t.proj(o.pot), 'redsauce');
    await fin2();
    await tapBin(t, 'mozzarella', 4);
    await peelToSpot(t, 2);
    await step(t.p, 9);
    await t.tap(await t.proj((await t.oven()).spots[0].at));
    await step(t.p, 1);
    await t.tap(await t.proj((await t.oven()).spots[2].at));
    await step(t.p, 4.5);
    console.log('calzone', await crust(t, 0), '| flatbread', await crust(t, 2));
    await shot(t, 'oven-portamber-baking');
    const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
    await spotTo(t, 0, [px, py]);
    console.log('Calzone on tray', JSON.stringify(await plateNow(t)));
    await step(t.p, 0.4);
    await shot(t, 'calzone-on-tray');
    console.log('SERVED Calzone', JSON.stringify(await serve(t)));
    // The flatbread onto the board, cut in four.
    await step(t.p, 6);
    const ob = await t.oven();
    await spotTo(t, 2, await t.proj(ob.board.at));
    const bd = await t.proj(ob.board.at);
    await t.drag(line(bd[0] - 35, bd[1] - 4, bd[0] + 35, bd[1] - 4, 8));
    await step(t.p, 0.5);
    await t.drag(line(bd[0] - 35, bd[1] + 4, bd[0] + 35, bd[1] + 4, 8));
    console.log('board', JSON.stringify((await t.oven()).board.layers[0]));
    await shot(t, 'board-cut-in-four');
    await t.ev(() => window.__bv.menu.openHowTo('oven'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-oven-portamber.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 4. The Pines grill, the coast press and the Red Rock comal, as they were.
  if (want('4')) for (const town of ['pinecrest', 'saltwater', 'redmesa']) {
    const t = await start(town);
    await shot(t, `unchanged-${town}`);
    console.log(town, (await t.oven()).middle);
    await t.b.close();
  }
  // 5. Whole trip: dev mode's simulated 100% save; the map, the Garage's bonuses, and each town's
  // Prep & Open menu.
  if (want('5')) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: '' });
    await p.evaluate((s) => { localStorage.setItem('bv-save-v1', JSON.stringify(s)); localStorage.setItem('bv-dev', '1'); }, save('pinecrest'));
    await p.reload();
    await p.waitForTimeout(900);
    await p.click('[data-home=settings]');
    await p.waitForTimeout(500);
    await p.click('[data-m=sim][data-v="100"]');
    await p.waitForTimeout(300);
    await p.click('.settings [data-m=close]');
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}trip-map-100.png` });
    await p.click('[data-home=garage]');
    await p.waitForTimeout(700);
    const gar = await p.evaluate(() => [...document.querySelectorAll('.gar-item')].map((e) => e.querySelector('b')?.textContent ?? e.textContent.trim().slice(0, 30)));
    console.log('garage bonuses', gar.length, JSON.stringify(gar));
    await p.screenshot({ path: `${out}trip-garage.png`, fullPage: true });
    await p.click('[data-act=back]');
    await p.waitForTimeout(600);
    const sim = await p.evaluate(() => JSON.parse(localStorage.getItem('bv-save-v1')));
    for (const town of ALL) {
      await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify(s)), { ...sim, town, time: 'morning' });
      await p.reload();
      await p.waitForTimeout(900);
      await p.click('[data-home=open]');
      await p.waitForTimeout(600);
      const rows = await p.evaluate(() => [...document.querySelectorAll('.prep-row')].map((e) => (e.querySelector('b')?.textContent ?? e.textContent).trim() + (e.classList.contains('off') ? ' (off)' : '')));
      console.log('prep', town, JSON.stringify(rows));
      if (['applecross', 'larkvale', 'portamber'].includes(town)) await p.screenshot({ path: `${out}trip-prep-${town}.png`, fullPage: true });
    }
    await b.close();
  }
})();
