// After build #69 (DESIGN §24): Orchard Isle's deck oven and the peel. Every flatbread is moved
// with the peel only: the bot drags the peel by its handle, swipes up to scoop a pie, swipes down to
// set it down (in the oven, on the board, on a tray), and nudges a pie in the oven round with the
// blade's edge. A Harvest Red (Applecross), a Fig & Ham (Larkvale) and a Calzone (Port Amber) are
// served at three stars, and a Port Amber flatbread is cut in four on the board.
// npm run build && npx vite preview --port 4175
// PORT=4175 node tools/playtest/oven-peel.cjs  ->  tools/playtest/shots-oven2/   (ONLY=13 runs sections 1 and 3)
const path = require('path');
process.env.OUT = process.env.OUT || path.join(__dirname, 'shots-oven2') + '/';
const { open, step, line, out, enterShift } = require('./lib.cjs');
const ALL = ['pinecrest', 'elkpass', 'cedarfalls', 'summit', 'saltwater', 'gullpoint', 'driftwood', 'harbor', 'redmesa', 'cactus', 'sunvalley', 'applecross', 'larkvale', 'portamber'];
const save = (town) => ({
  tutorialDone: true, town, day: 30, time: 'morning', unlocked: ALL, passedTowns: ALL,
  shiftsIn: Object.fromEntries(ALL.map((t) => [t, 3])), bank: 300, popularity: 60, found: [], bonuses: [],
});
const BLADE = { rx: 1.12, rz: 0.84 };

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
  const hint = () => ev(() => document.querySelector('[data-r="hint"]')?.textContent ?? '');
  return { b, p, ev, fire, drag, tap, hp, plate, oven, proj, hideHint, hint };
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
  const before = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice() }));
  await t.drag(line(px, py, px, py - 120, 8));
  await step(t.p, 0.3);
  const after = await t.ev(() => ({ served: window.__bv.game.served, money: window.__bv.game.money, stars: window.__bv.game.stars.slice(), bubble: document.querySelector('.bubble')?.textContent ?? null }));
  return { served: after.served - before.served, earned: +(after.money - before.money).toFixed(2), stars: after.stars.slice(before.stars.length), bubble: after.bubble };
};
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
  if (kind === 'oil') for (let i = 0; i <= 6; i++) pts.push([x + (i % 2 ? 0.55 : -0.55) * rx, 0.19, z + (-0.6 + i * 0.2) * rz]);
  else for (let i = 0; i <= 64; i++) { const a = i * 0.42; const r = Math.min(0.93, 0.05 + i * 0.0145); pts.push([x + Math.cos(a) * r * rx, 0.19, z + Math.sin(a) * r * rz]); }
  const scr = [];
  for (const q of pts) { const [sx, sy] = await t.proj(q); scr.push([sx, sy + 34]); }
  await t.fire('pointerdown', ...from);
  for (const q of line(from[0], from[1], scr[0][0], scr[0][1], 8)) { await t.p.waitForTimeout(12); await t.fire('pointermove', ...q); }
  for (const q of scr) { await t.p.waitForTimeout(10); await t.fire('pointermove', ...q); }
  await t.fire('pointerup', ...scr[scr.length - 1]);
  await step(t.p, 0.3);
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
const crust = async (t, i) => { const o = await t.oven(); const d = o.spots[i].layers[0]; return d ? `cook ${d.cook.map((c) => c.toFixed(2)).join('/')} turns ${d.turns} scorch ${d.scorch.toFixed(2)}` : 'empty'; };

/**
 * The peel in hand: a finger on its handle, moved at a carrying pace (slow enough not to count as
 * a swipe), stepping the game a frame between moves so the peel follows and nudges as in play.
 */
function peelHand(t) {
  let at = null;
  const moveTo = async (x, y, n = 8, ms = 22) => {
    for (const q of line(at[0], at[1], x, y, n).slice(1)) { await t.p.waitForTimeout(ms); await t.fire('pointermove', ...q); await step(t.p, 1 / 60); }
    at = [x, y];
  };
  return {
    async grab() {
      const o = await t.oven();
      at = await t.proj(o.peel.handle);
      await t.fire('pointerdown', ...at);
      await step(t.p, 0.05);
    },
    /** Carry the blade's centre over a world point (x, z on the counter). */
    async bladeTo(x, z) {
      for (let k = 0; k < 6; k++) {
        const o = await t.oven();
        const [bx, by, bz] = o.peel.at;
        if (Math.hypot(bx - x, bz - z) < 0.06) break;
        const a = await t.proj([bx, by, bz]);
        const b = await t.proj([x, by, z]);
        await moveTo(at[0] + (b[0] - a[0]), at[1] + (b[1] - a[1]), 8);
        await step(t.p, 0.15);
      }
    },
    /** Move the finger to a screen point (over the trays, say). */
    async fingerTo(x, y) { await moveTo(x, y, 10); await step(t.p, 0.1); },
    /** A quick thumb swipe up or down (about 60 px in 70 ms). */
    async swipe(dir) {
      await t.p.waitForTimeout(120);
      const dy = dir === 'up' ? -16 : 16;
      for (let i = 0; i < 4; i++) { await t.p.waitForTimeout(14); at = [at[0], at[1] + dy]; await t.fire('pointermove', ...at); }
      await step(t.p, 0.4);
    },
    /** Push the blade along (dx, dz world units) slowly, a frame at a time: a nudge. */
    async push(dx, dz, n = 14) {
      const o = await t.oven();
      const [bx, by, bz] = o.peel.at;
      const a = await t.proj([bx, by, bz]);
      const b = await t.proj([bx + dx, by, bz + dz]);
      await moveTo(at[0] + (b[0] - a[0]), at[1] + (b[1] - a[1]), n, 20);
    },
    async release() { await t.fire('pointerup', ...at); await step(t.p, 0.6); },
  };
}

/** Into the oven: grab the peel (with a pie on it), carry it over a spot, swipe down, let go. */
async function launch(t, i) {
  const h = peelHand(t);
  await h.grab();
  const o = await t.oven();
  await h.bladeTo(o.spots[i].at[0], o.spots[i].at[2]);
  await h.swipe('down');
  await h.release();
  const after = await t.oven();
  console.log(`  launched into spot ${i}:`, after.spots[i].layers.length ? 'yes' : 'NO', '| peel', after.peel.layers.length ? 'still full' : 'empty');
}
/**
 * Nudge the pie in spot i half round: the blade's edge set against the pie's side, pushed along it
 * a few times. Returns the screenshot hook mid-nudge.
 */
async function nudge(t, i, shotName) {
  const h = peelHand(t);
  await h.grab();
  const o = await t.oven();
  const [sx, , sz] = o.spots[i].at;
  // From whichever side the walls leave room on.
  const turns0 = o.spots[i].layers[0].turns;
  const yaw0 = o.spots[i].yaw;
  // The blade's tip set against the front of the pie and slid sideways along it; then back off
  // toward the front, slide back, and in again for another push.
  const tipZ = sz + 0.72 + BLADE.rz;
  const x0 = Math.max(-0.48, sx - 1.0);
  const x1 = Math.min(3.18, sx + 1.5);
  for (let k = 0; k < 4; k++) {
    await h.bladeTo(x0, tipZ + 0.6);
    await h.bladeTo(x0, tipZ);
    const o2 = await t.oven();
    await h.push(x1 - o2.peel.at[0], 0, 16);
    if (k === 0 && shotName) { await t.hideHint(); await t.p.screenshot({ path: `${out}${shotName}.png` }); }
    await h.bladeTo(x1, tipZ + 0.6);
    await step(t.p, 0.4);
    const now = (await t.oven()).spots[i];
    console.log(`    push ${k}: turns ${now.layers[0].turns} yaw ${now.yaw.toFixed(2)}`);
    if (now.layers[0].turns > turns0 && Math.abs(now.yaw - yaw0) > 2.4) break;
  }
  await h.release();
  const sp = (await t.oven()).spots[i];
  console.log(`  nudged spot ${i}: turns ${turns0} -> ${sp.layers[0].turns}, yaw ${sp.yaw.toFixed(2)} (cos ${Math.cos(sp.yaw).toFixed(2)})`);
}
/** Out of the oven and onto the active tray: scoop with a swipe up, carry up, swipe down over the tray. */
async function toTray(t, i, shotName) {
  const h = peelHand(t);
  await h.grab();
  const o = await t.oven();
  await h.bladeTo(o.spots[i].at[0], o.spots[i].at[2]);
  await h.swipe('up');
  console.log('  scooped:', (await t.oven()).peel.layers.length ? 'yes' : 'NO');
  await h.bladeTo(o.spots[i].at[0], 0.6);
  if (shotName) { await t.hideHint(); await t.p.screenshot({ path: `${out}${shotName}.png` }); }
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  await h.fingerTo(px, py + 10);
  await h.swipe('down');
  await h.release();
  console.log('  on the tray:', JSON.stringify(await plateNow(t)));
}
/** Out of the oven onto the board: scoop, carry, swipe down over the board. */
async function toBoard(t, i) {
  const h = peelHand(t);
  await h.grab();
  const o = await t.oven();
  await h.bladeTo(o.spots[i].at[0], o.spots[i].at[2]);
  await h.swipe('up');
  await h.bladeTo(o.rest.at[0], o.rest.at[2]);
  await h.swipe('down');
  await h.release();
  console.log('  on the board:', JSON.stringify((await t.oven()).rest.layers.map((l) => l.kind)));
}
/** From the board to the tray. */
async function boardToTray(t) {
  const h = peelHand(t);
  await h.grab();
  const o = await t.oven();
  await h.bladeTo(o.rest.at[0], o.rest.at[2]);
  await h.swipe('up');
  await h.bladeTo(o.rest.at[0] + 1.5, 0.5);
  const [px, py] = await t.plate(await t.ev(() => window.__bv.game.active));
  await h.fingerTo(px, py + 10);
  await h.swipe('down');
  await h.release();
  console.log('  board -> tray:', JSON.stringify(await plateNow(t)));
}

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
  // 1. Applecross: the deck oven; a Harvest Red built on the peel, launched, nudged round once, served.
  if (want('1')) {
    const t = await start('applecross');
    await shot(t, 'oven-applecross');
    await forceOrder(t, HARVEST);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    await ladle(t, await t.proj(o.pot), 'redsauce');
    await tapBin(t, 'mozzarella', 4);
    console.log('peel', JSON.stringify((await t.oven()).peel.layers.map((l) => l.kind + (l.stroke ? `(${l.stroke})` : ''))));
    await shot(t, 'peel-built');
    // Carrying it in: a shot with the pie on the peel over the oven.
    {
      const h = peelHand(t);
      await h.grab();
      await h.bladeTo(o.spots[0].at[0], -0.2);
      await shot(t, 'peel-carrying');
      await h.bladeTo(o.spots[0].at[0], o.spots[0].at[2]);
      await h.swipe('down');
      await h.release();
      console.log('  launched:', (await t.oven()).spots[0].layers.length ? 'yes' : 'NO');
    }
    await step(t.p, 9.5);
    console.log('at 10 s', await crust(t, 0));
    await shot(t, 'oven-baking-meter');
    await nudge(t, 0, 'nudge-rotating');
    await step(t.p, 0.2);
    await shot(t, 'oven-turned');
    await step(t.p, 9.5);
    console.log('at 21 s', await crust(t, 0));
    await toTray(t, 0, 'peel-pie-out');
    await tapBin(t, 'basil', 1);
    await step(t.p, 0.5);
    await shot(t, 'served-on-tray');
    console.log('SERVED Harvest Red', JSON.stringify(await serve(t)));
    await t.ev(() => window.__bv.menu.openHowTo('oven'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-oven.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
  // 2. Larkvale: a Fig & Ham (olive oil before, honey after at the tray).
  if (want('2')) {
    const t = await start('larkvale');
    await shot(t, 'oven-larkvale');
    await forceOrder(t, FIGHAM);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    await ladle(t, await t.hp('bottle', { sauce: 'oil' }), 'oil');
    await tapBin(t, 'mozzarella', 3);
    await tapBin(t, 'ham', 3);
    await tapBin(t, 'fig', 4);
    await shot(t, 'peel-fig-ham');
    await launch(t, 1);
    await step(t.p, 10);
    await nudge(t, 1);
    await step(t.p, 10.5);
    console.log('fig & ham crust', await crust(t, 1));
    await toTray(t, 1);
    await trayBottle(t, 'honey');
    console.log('Fig & Ham on tray', JSON.stringify(await plateNow(t)));
    await shot(t, 'fig-ham-on-tray');
    console.log('SERVED Fig & Ham', JSON.stringify(await serve(t)));
    await t.b.close();
  }
  // 3. Port Amber: three spots and the board; a calzone folded and nudged round twice; a flatbread cut in four.
  if (want('3')) {
    const t = await start('portamber');
    await shot(t, 'oven-portamber');
    await forceOrder(t, CALZONE);
    const o = await t.oven();
    await t.tap(await t.proj(o.dough));
    await ladle(t, await t.proj(o.pot), 'redsauce');
    await tapBin(t, 'mozzarella', 3);
    await tapBin(t, 'ham', 2);
    await tapBin(t, 'mushroom', 3);
    // Fold: press near the left edge of the dough and drag across the middle.
    const [x, y, z] = (await t.oven()).peel.at;
    await t.drag(line(...(await t.proj([x - 0.62, y, z])), ...(await t.proj([x + 0.4, y, z])), 10));
    console.log('folded?', (await t.oven()).peel.layers[0].folded);
    await shot(t, 'calzone-on-peel');
    await launch(t, 0);
    const gt = () => t.ev(() => window.__bv.game.time);
    const t0 = await gt();
    const until = async (s) => { const now = (await gt()) - t0; if (s > now) await step(t.p, s - now); };
    await until(3.5);
    await nudge(t, 0);
    await until(13);
    await nudge(t, 0);
    await until(21);
    console.log('calzone', await crust(t, 0), 'after', ((await gt()) - t0).toFixed(1), 's');
    await shot(t, 'oven-portamber-calzone');
    await toTray(t, 0);
    console.log('SERVED Calzone', JSON.stringify(await serve(t)));
    // A Harvest Red for the board: baked in the right-hand spot, cut in four, then to the next tray.
    await nextCustomer(t);
    await forceOrder(t, { ...HARVEST, slice: true });
    await t.tap(await t.proj(o.dough));
    await ladle(t, await t.proj(o.pot), 'redsauce');
    await tapBin(t, 'mozzarella', 4);
    await launch(t, 2);
    const t1 = await gt();
    const until1 = async (s) => { const now = (await gt()) - t1; if (s > now) await step(t.p, s - now); };
    await until1(9.5);
    await shot(t, 'oven-portamber-baking');
    await nudge(t, 2);
    await until1(21);
    console.log('flatbread', await crust(t, 2));
    await toBoard(t, 2);
    const bd = await t.proj((await t.oven()).rest.at);
    await t.drag(line(bd[0] - 35, bd[1] - 4, bd[0] + 35, bd[1] - 4, 8));
    await step(t.p, 0.5);
    await t.drag(line(bd[0] - 35, bd[1] + 4, bd[0] + 35, bd[1] + 4, 8));
    console.log('board', JSON.stringify((await t.oven()).rest.layers[0]));
    await shot(t, 'board-cut-in-four');
    await boardToTray(t);
    await tapBin(t, 'basil', 1);
    await step(t.p, 0.4);
    await shot(t, 'cut-on-tray');
    console.log('SERVED cut Harvest Red', JSON.stringify(await serve(t)));
    await t.ev(() => window.__bv.menu.openHowTo('oven'));
    await t.p.waitForTimeout(800);
    await t.p.screenshot({ path: `${out}howto-oven-portamber.png` });
    await t.ev(() => window.__bv.menu.closeAll());
    await t.b.close();
  }
})();
