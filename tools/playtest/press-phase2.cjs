// Phase 2 kitchen checks (DESIGN §24): the Sunny Coast's panini press.
// Shots of the press counter at Saltwater Bay and Harbor City, a closed press with its meters, a
// finished panini on the tray with its ticket, the fryer's sweet potato fries, and the Pines grill
// unchanged. Then a Caprese and a Chicken Pesto are driven through the press with pointer events
// (built on the tray, lifted whole into a bay, pressed, lifted out, cut at Harbor City, served),
// and the score is printed.
// npm run build && npx vite preview --port 4175
// PORT=4175 NODE_PATH=$(npm root -g) node tools/playtest/press-phase2.cjs  ->  tools/playtest/shots-phase2/
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-phase2') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor'];
const save = (town) => ({
  tutorialDone: true, town, day: 20, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const ZIG = 'pesto';

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
  const drag = async (pts, ms = 16) => {
    await fire('pointerdown', ...pts[0]);
    for (const q of pts.slice(1)) { await p.waitForTimeout(ms); await fire('pointermove', ...q); }
    await p.waitForTimeout(ms);
    await fire('pointerup', ...pts[pts.length - 1]);
    await step(p, 0.4);
  };
  const tap = async (pt) => drag([pt, pt], 30);
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find((h) => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const plate = (i) => ev((i) => { const b = window.__bv.trayView.plates[i].burger; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; return window.__bv.project('tray', e[12], 0.3, e[14]); }, i);
  const press = () => ev(() => window.__bv.press());
  const proj = (v) => ev((v) => window.__bv.project('counter', v[0], v[1], v[2]), v);
  const hideHint = () => ev(() => { document.querySelector('[data-r="hint"]').style.display = 'none'; });
  return { b, p, ev, fire, drag, tap, hp, plate, press, proj, hideHint };
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
}

/** Squeeze a zigzag of sauce on the active burger: press the bottle, drag up, zigzag, let go. */
async function sauce(t, kind) {
  const [px] = await t.plate(0);
  const bt = await t.hp('bottle', { sauce: kind });
  const [cx, cy, side] = await t.ev(() => window.__bv.sauceCentre());
  await t.fire('pointerdown', ...bt);
  for (const q of line(bt[0], bt[1], px, cy, 12)) { await t.p.waitForTimeout(16); await t.fire('pointermove', ...q); }
  await step(t.p, 0.4);
  let at = [px, cy];
  for (let z = 0; z <= 5; z++) {
    const q = [cx + (z % 2 ? 0.3 : -0.3) * side, cy - 0.27 * side + z * 0.1 * side + 34];
    for (const r of line(at[0], at[1], q[0], q[1], 8)) { await t.p.waitForTimeout(8); await t.fire('pointermove', ...r); }
    at = q;
  }
  await step(t.p, 0.1);
  await t.fire('pointerup', ...at);
  await step(t.p, 0.6);
}

async function fromBin(t, kind, n = 1) {
  const [bx, by] = await t.hp('bin', { kind });
  const [px, py] = await t.plate(0);
  for (let i = 0; i < n; i++) await t.drag(line(bx, by, px, py, 10));
}

/** Lift the whole sandwich off tray 0 (drag down from it) and drop it in bay i. */
async function trayToBay(t, i) {
  const [px, py] = await t.plate(0);
  const pr = await t.press();
  const [bx, by] = await t.proj(pr.bays[i].plate);
  await t.drag(line(px, py, bx, by, 14));
}
async function closeBay(t, i) {
  const pr = await t.press();
  const [hx, hy] = await t.proj(pr.bays[i].handle);
  await t.drag(line(hx, hy, hx, hy + 70, 6));
}
/** Swipe the handle up to lift the lid. */
async function openBay(t, i) {
  const pr = await t.press();
  const [hx, hy] = await t.proj(pr.bays[i].handle);
  await t.drag(line(hx, hy, hx, hy - 70, 6));
  await step(t.p, 0.5);
}
async function bayToTray(t, i) {
  const pr = await t.press();
  const [bx, by] = await t.proj(pr.bays[i].plate);
  const [px, py] = await t.plate(0);
  await t.drag(line(bx, by + 4, px, py, 14));
}
/** Press until the bay's meter reads golden (its reading's perfect), within a limit. */
async function pressUntil(t, i, target, max = 40) {
  for (let s = 0; s < max; s += 0.5) {
    const pr = await t.press();
    const r = pr.bays[i].layers.find((l) => l.kind === 'ciabatta' || l.kind === 'sourdough') ?? pr.bays[i].layers[0];
    if (r.cook >= target) return s;
    await step(t.p, 0.5);
  }
  return max;
}
const serve = async (t) => {
  const [px, py] = await t.plate(0);
  const before = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice() }));
  await t.drag(line(px, py, px, py - 120, 8));
  await step(t.p, 0.3);
  const after = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, earned: +(after.money - before.money).toFixed(2), stars: after.stars.slice(before.stars.length), bubble: after.bubble };
};
const plateInfo = (t) => t.ev(() => window.__bv.game.slots[window.__bv.game.active].plate.layers.map((l) => `${l.piece.kind}:${window.__bv.cookLevel(l.piece).toFixed(2)}${l.piece.melt ? ' m' + l.piece.melt.toFixed(2) : ''}${l.piece.cut ? ' cut' : ''}`));

const CAPRESE = {
  name: 'Caprese', price: 10, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M',
  layers: [{ kind: 'ciabatta', toasted: true }, { kind: 'pesto' }, { kind: 'mozzarella', melted: true, count: 3 }, { kind: 'tomato', count: 3 }, { kind: 'basil' }, { kind: 'ciabatta', toasted: true }],
};
const CHICKEN = {
  name: 'Chicken Pesto', price: 13, mods: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M', slice: true,
  layers: [{ kind: 'ciabatta', toasted: true }, { kind: 'pesto' }, { kind: 'chicken' }, { kind: 'mozzarella', melted: true, count: 2 }, { kind: 'tomato', count: 2 }, { kind: 'ciabatta', toasted: true }],
};

(async () => {
  // 1. Saltwater Bay: the press counter, then a Caprese all the way through.
  {
    const t = await start('saltwater');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}press-saltwater.png` });
    console.log('saltwater press', JSON.stringify(await t.press()));
    await forceOrder(t, CAPRESE);
    await fromBin(t, 'ciabatta');
    await sauce(t, ZIG);
    await fromBin(t, 'mozzarella', 3);
    await fromBin(t, 'tomato', 3);
    await fromBin(t, 'basil');
    await fromBin(t, 'ciabatta');
    console.log('built', JSON.stringify(await plateInfo(t)));
    await trayToBay(t, 0);
    // A lone ciabatta in the other bay, to show both meters.
    const [bx, by] = await t.hp('bin', { kind: 'ciabatta' });
    const pr0 = await t.press();
    await t.drag(line(bx, by, ...(await t.proj(pr0.bays[1].plate)), 12));
    await closeBay(t, 0);
    await closeBay(t, 1);
    const took = await pressUntil(t, 0, 0.5);
    console.log('pressed for', took, 's', JSON.stringify((await t.press()).bays.map((b) => ({ closed: b.closed, layers: b.layers.map((l) => l.kind + ':' + l.cook.toFixed(2) + (l.melt ? ' m' + l.melt.toFixed(2) : '')).join(' ') }))));
    await t.hideHint();
    await t.p.screenshot({ path: `${out}press-closed-meters.png` });
    await openBay(t, 0);
    await step(t.p, 0.4);
    await t.p.screenshot({ path: `${out}press-open-after.png` });
    await bayToTray(t, 0);
    console.log('on tray', JSON.stringify(await plateInfo(t)));
    // Tap the ticket so it shows the full receipt.
    await t.hideHint();
    await t.p.screenshot({ path: `${out}panini-on-tray.png` });
    const r = await serve(t);
    console.log('SERVED Caprese', JSON.stringify(r));
    await step(t.p, 1.5);
    // The food menu and How to Play draw the coast's paninis.
    await t.ev(() => window.__bv.menu.openMenuRef());
    await t.p.waitForTimeout(500);
    await t.p.screenshot({ path: `${out}menu-saltwater.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.ev(() => window.__bv.menu.openHowTo('press'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-press.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 2. Harbor City: three bays and the board; a Chicken Pesto, chicken pressed first, then cut.
  {
    const t = await start('harbor');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}press-harbor.png` });
    console.log('harbor press', JSON.stringify(await t.press()));
    await forceOrder(t, CHICKEN);
    const pr = await t.press();
    const [cx, cy] = await t.hp('bin', { kind: 'chicken' });
    await t.drag(line(cx, cy, ...(await t.proj(pr.bays[2].plate)), 12));
    await closeBay(t, 2);
    const s1 = await pressUntil(t, 2, 0.6);
    await openBay(t, 2);
    console.log('chicken pressed', s1, 's', JSON.stringify((await t.press()).bays[2].layers));
    await fromBin(t, 'ciabatta');
    await sauce(t, ZIG);
    await bayToTray(t, 2);
    await fromBin(t, 'mozzarella', 2);
    await fromBin(t, 'tomato', 2);
    await fromBin(t, 'ciabatta');
    console.log('built', JSON.stringify(await plateInfo(t)));
    await trayToBay(t, 1);
    await closeBay(t, 1);
    const s2 = await pressUntil(t, 1, 0.5);
    console.log('sandwich pressed', s2, 's');
    await openBay(t, 1);
    // Out of the bay onto the board, cut with the knife (DESIGN §38: tap the knife, then the
    // panini, and it's cut in half; there's no cut view any more), then up to the tray.
    const pb = await t.press();
    const [bx, by] = await t.proj(pb.bays[1].plate);
    const [dx, dy] = await t.proj(pb.board.at);
    await t.drag(line(bx, by + 4, dx, dy, 14));
    await t.hideHint();
    await t.p.screenshot({ path: `${out}harbor-on-board.png` });
    await t.tap(await t.hp('knife'));
    await t.tap([dx, dy]);
    await t.p.waitForTimeout(600);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}harbor-cut.png` });
    await step(t.p, 1);
    console.log('cut', JSON.stringify(await t.ev(() => window.__bv.counter.board.layers.map((l) => [l.piece.kind, !!l.piece.cut, l.piece.cutQ]))));
    const [px, py] = await t.plate(0);
    await t.drag(line(dx, dy, px, py, 14));
    console.log('on tray', JSON.stringify(await plateInfo(t)));
    await t.hideHint();
    await t.p.screenshot({ path: `${out}harbor-panini-on-tray.png` });
    const r = await serve(t);
    console.log('SERVED Chicken Pesto', JSON.stringify(r));
    await t.b.close();
  }
  // 3. Driftwood fryer: sweet potato fries in one basket, plain in the other.
  {
    const t = await start('driftwood');
    await t.ev(() => window.__bv.goToPage(2));
    await step(t.p, 1);
    const sw = await t.hp('fryBin', { fry: 'sweet' });
    const fr = await t.hp('friesBin');
    const b0 = await t.hp('basket', { idx: 0 });
    const b1 = await t.hp('basket', { idx: 1 });
    await t.drag(line(...sw, ...b0, 10));
    await t.drag(line(...fr, ...b1, 10));
    await t.tap(b0);
    await t.tap(b1);
    await step(t.p, 14);
    await t.hideHint();
    await t.p.screenshot({ path: `${out}fryer-sweet.png` });
    console.log('baskets', JSON.stringify(await t.ev(() => window.__bv.counter.baskets.map((b) => ({ fry: b.fry, cook: +b.cook.toFixed(2) })))));
    await t.b.close();
  }
  // 4. The Pines: the grill as it was.
  {
    const t = await start('pinecrest');
    await t.hideHint();
    await t.p.screenshot({ path: `${out}grill-pinecrest.png` });
    console.log('pines', JSON.stringify(await t.press()));
    await t.b.close();
  }
})();
