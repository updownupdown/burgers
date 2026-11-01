// Kitchen fixes after build #68 (DESIGN §24): checks with pointer events and screenshots.
// 1 press: a Caprese built in a bay (the lid refuses until the top bread is on), pressed, lifted by a swipe up;
//   Harbor City with the board raised and a sandwich built on it.
// 2 comal: a quesadilla folded, then unfolded with a long press; the shredded cheese next to the pork.
// 3 fryer: zucchini dropped in the batter bowl, then picked up again for the basket.
// 4 nav: a swipe that starts on a counter button changes counter; a tap still presses it. Drinks
//   counter without size labels; indicator fade-in.
// 5 night: the sleep transition on its card.
// npm run build && npx vite preview --port 4175
// PORT=4175 NODE_PATH=$(npm root -g) node tools/playtest/fixes-68.cjs [1-5...]  ->  tools/playtest/shots-fixes/
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-fixes') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

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
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const hideHint = () => ev(() => { document.querySelector('[data-r="hint"]').style.display = 'none'; });
  const hint = () => ev(() => document.querySelector('[data-r="hintText"]')?.textContent ?? '');
  const shot = async (name) => { await p.screenshot({ path: `${out}${name}.png` }); };
  return { b, p, ev, fire, drag, tap, hp, plate, proj, hideHint, hint, shot };
}

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
  const before = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice() }));
  await t.drag(line(px, py, px, py - 120, 8));
  await step(t.p, 0.3);
  const after = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, earned: +(after.money - before.money).toFixed(2), stars: after.stars.slice(before.stars.length), bubble: after.bubble };
};
const plateInfo = (t) => t.ev(() => window.__bv.game.slots[window.__bv.game.active].plate.layers.map((l) => `${l.piece.kind}:${window.__bv.cookLevel(l.piece).toFixed(2)}${l.piece.melt ? ' m' + l.piece.melt.toFixed(2) : ''}${l.piece.cut ? ' cut' : ''}`));
const bays = (t) => t.ev(() => window.__bv.press().bays.map((b) => ({ closed: b.closed, kinds: b.layers.map((l) => l.kind).join(' ') })));

const CAPRESE_NOSAUCE = {
  name: 'Caprese', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'ciabatta', toasted: true }, { kind: 'mozzarella', melted: true, count: 3 }, { kind: 'tomato', count: 3 }, { kind: 'basil' }, { kind: 'ciabatta', toasted: true }],
};

(async () => {
  if (want('1')) {
    // Saltwater Bay: build a Caprese right in bay 0.
    const t = await start('saltwater');
    await forceOrder(t, CAPRESE_NOSAUCE);
    const pr = await t.ev(() => window.__bv.press());
    const bay0 = await t.proj(pr.bays[0].plate);
    const toBay = async (kind, n = 1) => { const bin = await t.hp('bin', { kind }); for (let i = 0; i < n; i++) await t.drag(line(...bin, ...bay0, 12)); };
    await toBay('ciabatta');
    await toBay('mozzarella', 3);
    await toBay('tomato', 3);
    await toBay('basil');
    console.log('bay 0 built', JSON.stringify(await bays(t)));
    // Try to close it without the top bread: the lid dips and springs back.
    const h0 = await t.proj((await t.ev(() => window.__bv.press())).bays[0].handle);
    await t.drag(line(...h0, h0[0], h0[1] + 70, 6), 16, 0.12);
    await t.hideHint();
    await t.shot('press-refuse-mid');
    console.log('after refused close', JSON.stringify(await bays(t)), 'hint:', await t.hint());
    await step(t.p, 0.6);
    await toBay('ciabatta');
    await t.drag(line(...h0, h0[0], h0[1] + 70, 6));
    console.log('after close', JSON.stringify(await bays(t)));
    // A lone ciabatta in bay 1 too, so both meters show.
    const pr1 = await t.ev(() => window.__bv.press());
    const cb = await t.hp('bin', { kind: 'ciabatta' });
    await t.drag(line(...cb, ...(await t.proj(pr1.bays[1].plate)), 12));
    const h1 = await t.proj(pr1.bays[1].handle);
    await t.drag(line(...h1, h1[0], h1[1] + 70, 6));
    await step(t.p, 8);
    await t.hideHint();
    await t.shot('press-closed-meters');
    // A tap on the shut handle no longer lifts it; a swipe up does.
    const hc = await t.proj((await t.ev(() => window.__bv.press())).bays[0].handle);
    await t.tap(hc);
    console.log('after tap on shut handle', JSON.stringify(await bays(t)), 'hint:', await t.hint());
    await step(t.p, 5);
    await t.drag(line(...hc, hc[0], hc[1] - 70, 6));
    await step(t.p, 0.5);
    console.log('after swipe up', JSON.stringify(await bays(t)));
    await t.hideHint();
    await t.shot('press-open-after-swipe');
    const [px, py] = await t.plate(0);
    await t.drag(line(bay0[0], bay0[1] + 4, px, py, 14));
    console.log('on tray', JSON.stringify(await plateInfo(t)));
    console.log('SERVED Caprese (built in the bay)', JSON.stringify(await serve(t)));
    await t.b.close();
    // Harbor City: the raised board and caddy; a sandwich built on the board can't go... it can be cut once pressed.
    const u = await start('harbor');
    await u.hideHint();
    await u.shot('press-harbor');
    const pb = await u.ev(() => window.__bv.press());
    const board = await u.proj(pb.board.at);
    for (const k of ['ciabatta', 'cheddar', 'tomato']) { const bin = await u.hp('bin', { kind: k }); await u.drag(line(...bin, ...board, 12)); }
    console.log('board', JSON.stringify((await u.ev(() => window.__bv.press())).board.layers));
    await u.hideHint();
    await u.shot('press-harbor-board-build');
    await u.b.close();
  }
  if (want('2')) {
    const t = await start('redmesa');
    const zp = (await t.ev(() => window.__bv.comal())).zonePoints;
    const qx = zp[1][0] - 0.3, qz = 0.15;
    const binTo = async (kind, w) => { const [bx, by] = await t.hp('bin', { kind }); await t.drag(line(bx, by, ...(await t.proj(w)), 12)); };
    await binTo('flour', [qx, 0.87, qz]);
    await binTo('jack', [qx, 0.87, qz]);
    await binTo('corn', [zp[0][0] - 0.3, 0.87, 0.1]);
    await binTo('pork', [zp[0][0] - 0.3, 0.87, 0.1]);
    await step(t.p, 0.5);
    await t.hideHint();
    await t.shot('cheese-vs-pork-comal');
    // Close-up of the cold rail's cheese pan and the pork pan.
    await t.p.screenshot({ path: `${out}cheese-pans.png`, clip: { x: 0, y: 470, width: 390, height: 260 } });
    const near = async () => (await t.ev(() => window.__bv.comal())).items.reduce((a, it) => (!a || Math.hypot(it.at[0] - qx, it.at[2] - qz) < Math.hypot(a.at[0] - qx, a.at[2] - qz) ? it : a), null);
    let q = await near();
    const edge = await t.proj([q.at[0], 0.87, q.at[2] + q.r * 0.75]);
    const across = await t.proj([q.at[0], 0.87, q.at[2] - q.r * 0.45]);
    await t.drag(line(...edge, ...across, 10), 16, 0.6);
    q = await near();
    console.log('folded?', q.folded);
    await t.hideHint();
    await t.shot('quesadilla-folded');
    // Long press: it opens back out with its cheese.
    const at = await t.proj(q.at);
    await t.fire('pointerdown', ...at);
    await step(t.p, 0.7);
    await t.fire('pointerup', ...at);
    await step(t.p, 0.3);
    q = await near();
    console.log('after long press: folded?', q.folded, 'fill', JSON.stringify(q.fill.map((f) => f.kind)), 'hint:', await t.hint());
    await binTo('pork', [q.at[0], 0.87, q.at[2]]);
    q = await near();
    console.log('pork added', JSON.stringify(q.fill.map((f) => f.kind)));
    await t.hideHint();
    await t.shot('quesadilla-unfolded');
    await t.drag(line(...(await t.proj([q.at[0], 0.87, q.at[2] + q.r * 0.75])), ...(await t.proj([q.at[0], 0.87, q.at[2] - q.r * 0.45])), 10), 16, 0.6);
    q = await near();
    console.log('refolded?', q.folded);
    // A short tap still flips it.
    await t.tap(await t.proj(q.at));
    await step(t.p, 1);
    q = await near();
    console.log('tap flips', JSON.stringify(q.faces));
    await t.b.close();
  }
  if (want('3')) {
    const t = await start('applecross');
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const zb = await t.hp('fryBin', { fry: 'zucchini' });
    const bat = await t.hp('batter');
    const b0 = await t.hp('basket', { idx: 0 });
    // Dragging through the bowl no longer batters it.
    await t.drag([...line(...zb, ...bat, 10), ...line(...bat, ...b0, 10)]);
    console.log('dragged through:', JSON.stringify(await t.ev(() => window.__bv.counter.baskets.map((b) => b.loaded))), 'hint:', await t.hint());
    await t.drag(line(...zb, ...bat, 10));
    console.log('in bowl', await t.ev(() => window.__bv.counter.batter));
    await t.hideHint();
    await t.shot('zucchini-in-batter');
    await t.p.screenshot({ path: `${out}zucchini-in-batter-zoom.png`, clip: { x: 195, y: 430, width: 195, height: 200 } });
    await t.drag(line(...bat, ...b0, 10));
    console.log('basket', JSON.stringify(await t.ev(() => window.__bv.counter.baskets.map((b) => ({ loaded: b.loaded, fry: b.fry, cook: b.cook, amount: b.amount })))), 'bowl', await t.ev(() => window.__bv.counter.batter));
    await t.b.close();
  }
  if (want('4')) {
    const t = await start('pinecrest');
    const btn = async (page) => t.ev((page) => { const r = document.querySelector(`[data-r="tab"][data-page="${page}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, page);
    const swipeOn = async (page, dx) => {
      const [x, y] = await btn(page);
      await t.ev(async ([page, x, y, dx]) => {
        const el = document.querySelector(`[data-r="tab"][data-page="${page}"]`);
        const fire = (type, cx) => el.dispatchEvent(new PointerEvent(type, { clientX: cx, clientY: y, pointerId: 9, bubbles: true, pointerType: 'touch', isPrimary: true }));
        fire('pointerdown', x);
        for (let i = 1; i <= 8; i++) { await new Promise((r) => setTimeout(r, 16)); fire('pointermove', x + (dx * i) / 8); }
        fire('pointerup', x + dx);
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x + dx, clientY: y }));
      }, [page, x, y, dx]);
      await step(t.p, 1.2);
    };
    const page = () => t.ev(() => window.__bv.counter.page);
    console.log('start page', await page());
    // Swipe left starting on the right (fryer) button: the next counter to the right.
    await swipeOn(2, -90);
    console.log('swipe left from fryer button ->', await page());
    // Swipe right starting on the left (grill) button: back one.
    await swipeOn(1, 90);
    console.log('swipe right from grill button ->', await page());
    // Swipe right from the left (drinks) button.
    await swipeOn(0, 90);
    console.log('swipe right from drinks button ->', await page());
    await t.p.click('[data-r="tab"][data-page="1"]');
    await step(t.p, 1.2);
    console.log('tap grill button ->', await page());
    // Drinks counter: no size labels on the cup and lid stacks.
    await t.p.click('[data-r="tab"][data-page="0"]');
    await step(t.p, 1.2);
    await t.hideHint();
    await t.shot('drinks-no-size-labels');
    console.log('stack labels shown', await t.ev(() => [...document.querySelectorAll('.gtag.stack, .gtag.lid')].filter((e) => !e.hidden).length));
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1.2);
    await t.hideHint();
    await t.shot('fryer-no-size-labels');
    // Fade-in: a patty on the grill, swipe away and back; its meter animates in as the counter settles.
    await t.ev(() => window.__bv.goToPage(1));
    await step(t.p, 1.2);
    const [bx, by] = await t.hp('bin', { kind: 'patty' });
    const g = await t.ev(() => window.__bv.project('counter', ...window.__bv.counter.world(1, 1.2, 0.9, 0.4).toArray()));
    await t.drag(line(bx, by, ...g, 10));
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1.2);
    await t.ev(() => window.__bv.goToPage(1));
    await t.ev(() => window.__bv.manual(false));
    const fades = [];
    for (let i = 0; i < 14; i++) {
      await t.p.waitForTimeout(60);
      fades.push(await t.ev(() => { const e = [...document.querySelectorAll('.gtag.pt')].find((x) => !x.hidden); return e ? `${getComputedStyle(e).animationName}:${(+getComputedStyle(e).opacity).toFixed(2)}` : '-'; }));
    }
    console.log('grill tag as the counter settles', fades.join(' '));
    await t.b.close();
  }
  if (want('5')) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
    await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, ratingCount: 14, ratingSum: 31, popularity: 34 })));
    await p.reload();
    await p.waitForTimeout(900);
    await enterShift(p);
    await p.evaluate(() => { window.__bv.manual(true); const g = window.__bv.game; g.customers = 0; g.stars.push(3, 2); g.served = 2; });
    await step(p, 400);
    await p.waitForTimeout(800);
    if (await p.$('[data-act=evening]')) await p.click('[data-act=evening]');
    await p.waitForTimeout(800);
    await p.evaluate(() => window.__bv.manual(false));
    await p.click('.home-dock [data-home=sleep]');
    let last = 0;
    for (const ms of [500, 1500, 2300, 2700, 3100]) {
      await p.waitForTimeout(ms - last);
      last = ms;
      await p.screenshot({ path: `${out}night-${ms}.png` });
    }
    await b.close();
  }
})();
