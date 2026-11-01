// Phase 3 kitchen checks (DESIGN §24): Red Rock's comal.
// Shots of the comal at Red Mesa and Sun Valley (tortilla press, three-bottle caddy), tortillas
// warming with their meters, a quesadilla mid-fold, tacos in the rack on the tray with the ticket,
// the fryer making chips and nachos (Cactus Junction) and churros (Sun Valley), and the Pines grill
// and the coast press unchanged. Street Tacos and a Quesadilla are driven through with pointer
// events (tortillas warmed on the comal, pork scooped with taps, the quesadilla filled, folded by
// dragging its edge across, flipped, then served) and the scores printed.
// npm run build && npx vite preview --port 4175
// PORT=4175 NODE_PATH=$(npm root -g) node tools/playtest/comal-phase3.cjs  ->  tools/playtest/shots-phase3/
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-phase3') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley'];
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
  const comal = () => ev(() => window.__bv.comal());
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const hideHint = () => ev(() => { document.querySelector('[data-r="hint"]').style.display = 'none'; });
  return { b, p, ev, fire, drag, tap, hp, plate, comal, proj, hideHint };
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
const serve = async (t) => {
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  const before = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, tips: window.__bv.game.tips, stars: window.__bv.game.stars.slice() }));
  await t.drag(line(px, py, px, py - 120, 8));
  await step(t.p, 0.3);
  const after = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, tips: window.__bv.game.tips, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, earned: +(after.money - before.money).toFixed(2), tips: +(after.tips - before.tips).toFixed(2), stars: after.stars.slice(before.stars.length), bubble: after.bubble };
};
const score = (t) => t.ev(() => {
  const g = window.__bv.game;
  const s = g.slots[g.active];
  return s.plate.layers.map((l) => `${l.piece.kind}:${window.__bv.cookLevel(l.piece).toFixed(2)}${l.piece.folded ? ' folded' : ''}${l.piece.melt ? ' m' + l.piece.melt.toFixed(2) : ''}${l.piece.flips ? ' f' + l.piece.flips : ''}`);
});
/** Drop something from a pan onto the comal at a world point. */
async function binTo(t, kind, world) {
  const [bx, by] = await t.hp('bin', { kind });
  await t.drag(line(bx, by, ...(await t.proj(world)), 12));
}
/** The comal item nearest a world point. */
const itemNear = async (t, x, z) => (await t.comal()).items.reduce((a, it) => (!a || Math.hypot(it.at[0] - x, it.at[2] - z) < Math.hypot(a.at[0] - x, a.at[2] - z) ? it : a), null);

const STREET = {
  name: 'Street Tacos', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'corn', toasted: true, count: 3 }, { kind: 'pork', count: 3 }, { kind: 'onion', count: 1 }, { kind: 'cilantro' }, { kind: 'lime' }],
};
const QUESA = {
  name: 'Quesadilla', price: 9, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'flour', toasted: true, folded: true }, { kind: 'jack', melted: true }],
};
const NACHOS = { name: 'Nachos', price: 8, mods: [], layers: [], poutine: true, fries: true, fry: 'chips', friesSize: 'M', drink: null, drinkSize: 'M' };

(async () => {
  // 1. Red Mesa: the comal, Street Tacos, then a Quesadilla.
  {
    const t = await start('redmesa');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-redmesa.png` });
    await forceOrder(t, STREET);
    const zp = (await t.comal()).zonePoints;
    const spots = [[zp[0][0] - 0.45, 0.1], [zp[0][0] + 0.75, -0.25], [zp[1][0] + 0.7, 0.15]];
    for (const [x, z] of spots) await binTo(t, 'corn', [x, 0.87, z]);
    await step(t.p, 3);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-tortillas-warming.png` });
    await step(t.p, 3.6);
    console.log('tortillas', JSON.stringify((await t.comal()).items.map((i) => i.kind + ':' + i.cook.toFixed(2))));
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-tortillas-done.png` });
    const [px, py] = await t.plate(0);
    for (const [x, z] of spots) {
      const it = await itemNear(t, x, z);
      await t.drag(line(...(await t.proj(it.at)), px, py, 14));
    }
    const pork = await t.hp('bin', { kind: 'pork' });
    for (let i = 0; i < 3; i++) await t.tap(pork);
    for (const k of ['onion', 'cilantro', 'lime']) {
      const [bx, by] = await t.hp('bin', { kind: k });
      await t.drag(line(bx, by, px, py, 12));
    }
    console.log('street tacos on tray', JSON.stringify(await score(t)));
    await step(t.p, 0.6);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}tacos-on-tray.png` });
    console.log('SERVED Street Tacos', JSON.stringify(await serve(t)));
    await step(t.p, 2);
    // Quesadilla: flour on the comal, cheese on it, fold (drag the near edge up across the middle), flip once.
    for (let i = 0; i < 20; i++) {
      const ok = await t.ev(() => { const g = window.__bv.game; const k = g.slots.findIndex((s) => s.order && !s.leaving); if (k >= 0) g.active = k; else window.__bv.callNext(); return k >= 0; });
      if (ok) break;
      await step(t.p, 1);
    }
    await forceOrder(t, QUESA);
    const qx = zp[1][0] - 0.3;
    const qz = 0.15;
    await binTo(t, 'flour', [qx, 0.87, qz]);
    await binTo(t, 'jack', [qx, 0.87, qz]);
    let q = await itemNear(t, qx, qz);
    console.log('filled', JSON.stringify(q.fill), 'r', q.r.toFixed(2));
    await step(t.p, 1);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}quesadilla-filled.png` });
    const edge = await t.proj([q.at[0], 0.87, q.at[2] + q.r * 0.75]);
    const across = await t.proj([q.at[0], 0.87, q.at[2] - q.r * 0.45]);
    await t.drag(line(...edge, ...across, 10), 16, 0.04);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}quesadilla-mid-fold.png` });
    console.log('hinge', JSON.stringify(await t.ev(() => { const r = []; for (const it of window.__bv.counter.grillItems) it.obj.traverse((o) => { if (o.isGroup && Math.abs(o.rotation.x) > 0.01) r.push(+o.rotation.x.toFixed(2)); }); return r; })));
    q = await itemNear(t, qx, qz);
    console.log('folded?', q.folded, JSON.stringify(q.faces));
    await t.p.waitForTimeout(400);
    await step(t.p, 4.5);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}quesadilla-folded.png` });
    q = await itemNear(t, qx, qz);
    await t.tap(await t.proj(q.at));
    await step(t.p, 1);
    for (let s = 0; s < 20; s += 0.5) {
      q = await itemNear(t, qx, qz);
      if (Math.min(...q.faces) >= 0.42 && q.fill[0].melt >= 0.5) break;
      await step(t.p, 0.5);
    }
    console.log('quesadilla', JSON.stringify(q));
    await step(t.p, 0.4);
    const [qpx, qpy] = await t.plate((await t.ev(() => window.__bv.game.active)));
    await t.drag(line(...(await t.proj(q.at)), qpx, qpy, 14));
    console.log('quesadilla on tray', JSON.stringify(await score(t)));
    await step(t.p, 0.6);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}quesadilla-on-tray.png` });
    console.log('SERVED Quesadilla', JSON.stringify(await serve(t)));
    // The food menu and How to Play for Red Rock.
    await t.ev(() => window.__bv.menu.openMenuRef());
    await t.p.waitForTimeout(500);
    await t.p.screenshot({ path: `${out}menu-redmesa.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.ev(() => window.__bv.menu.openHowTo('comal'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-comal.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 2. Cactus Junction: chips in one basket, a tostada in the other; then nachos.
  {
    const t = await start('cactus');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-cactus.png` });
    // Where the fryer's things are, then back to the comal.
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const chips = await t.hp('fryBin', { fry: 'chips' });
    const b0 = await t.hp('basket', { idx: 0 });
    const b1 = await t.hp('basket', { idx: 1 });
    await t.ev(() => window.__bv.goToPage(1));
    await step(t.p, 1);
    // A corn tortilla carried from the comal's pans to the fryer (hovering on the fryer button
    // switches counter) and dropped in an empty basket: it fries into a tostada shell.
    const corn = await t.hp('bin', { kind: 'corn' });
    const tab = await t.ev(() => { const r = document.querySelector('[data-r="tab"][data-page="2"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await t.fire('pointerdown', ...corn);
    for (const q of line(...corn, ...tab, 10)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
    for (let i = 0; i < 25; i++) { await t.p.waitForTimeout(20); await t.fire('pointermove', tab[0] + (i % 2), tab[1]); }
    await step(t.p, 1);
    for (const q of line(...tab, ...b1, 10)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
    await t.fire('pointerup', ...b1);
    await step(t.p, 0.3);
    console.log('page', await t.ev(() => window.__bv.counter.page), 'basket 1', JSON.stringify((await t.comal()).baskets[1]));
    await t.drag(line(...chips, ...b0, 10));
    await t.drag(line(...chips, ...b0, 10));
    await t.tap(b0);
    await t.tap(b1);
    await step(t.p, 8.2);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}fryer-chips.png` });
    console.log('baskets', JSON.stringify((await t.comal()).baskets));
    // Lift the chips, pack them, then jalapeños and queso: nachos.
    await t.tap(b0);
    const stack = await t.hp('stack', { idx: 1 });
    const pad = await t.hp('pack', { idx: 0 });
    await t.drag(line(...stack, ...pad, 10));
    await t.drag(line(...b0, ...pad, 12));
    const jal = await t.hp('curds');
    const queso = await t.hp('gravy');
    await t.drag(line(...jal, ...pad, 10));
    await t.drag(line(...queso, ...pad, 10));
    await step(t.p, 0.5);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}fryer-nachos.png` });
    console.log('packs', JSON.stringify((await t.comal()).packs), JSON.stringify(await t.ev(() => window.__bv.counter.packs.map((p) => ({ curds: p.curds, gravy: p.gravy, salt: p.salt })))));
    await t.b.close();
  }
  // 3. Sun Valley: the tortilla press and three bottles; a hand-pressed tortilla to the comal; churros.
  {
    const t = await start('sunvalley');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-sunvalley.png` });
    const c = await t.comal();
    const tp = await t.proj(c.tpress);
    const dest = await t.proj([c.zonePoints[0][0], 0.87, 0.2]);
    await t.fire('pointerdown', ...tp);
    await step(t.p, 0.25);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}tortilla-press-down.png` });
    await step(t.p, 0.3);
    for (const q of line(...tp, ...dest, 12)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
    await t.fire('pointerup', ...dest);
    await step(t.p, 4);
    console.log('hand-pressed', JSON.stringify((await t.comal()).items.map((i) => i.kind + ':' + i.cook.toFixed(2))), JSON.stringify(await t.ev(() => window.__bv.counter.grillItems.map((g) => !!g.piece.handmade))));
    await t.hideHint();
    await t.p.screenshot({ path: `${out}comal-sunvalley-handmade.png` });
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const ch = await t.hp('fryBin', { fry: 'churros' });
    const b0 = await t.hp('basket', { idx: 0 });
    await t.drag(line(...ch, ...b0, 10));
    await t.drag(line(...ch, ...b0, 10));
    await t.tap(b0);
    await step(t.p, 16);
    await t.tap(b0);
    const stack = await t.hp('stack', { idx: 1 });
    const pad = await t.hp('pack', { idx: 0 });
    await t.drag(line(...stack, ...pad, 10));
    await t.drag(line(...b0, ...pad, 12));
    // Sugar: hold the sugar shaker over the carton and shake.
    const sg = await t.hp('shaker', { sugar: true });
    await t.fire('pointerdown', ...sg);
    for (const q of line(...sg, pad[0], pad[1] - 20, 8)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
    for (let i = 0; i < 6; i++) { await t.p.waitForTimeout(16); await t.fire('pointermove', pad[0] + (i % 2 ? 24 : -24), pad[1] - 20); }
    await t.fire('pointerup', pad[0], pad[1] - 20);
    await step(t.p, 0.4);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}fryer-churros.png` });
    console.log('churros', JSON.stringify(await t.ev(() => window.__bv.counter.packs.map((p) => ({ size: p.size, fry: p.fry, fill: +p.fill.toFixed(2), cook: +p.cook.toFixed(2), sugar: p.salt })))));
    await t.b.close();
  }
  // 4. The Pines grill and the coast press, as they were.
  for (const town of ['pinecrest', 'saltwater']) {
    const t = await start(town);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}unchanged-${town}.png` });
    console.log(town, (await t.comal()).middle);
    await t.b.close();
  }
})();
