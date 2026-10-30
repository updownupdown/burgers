// A sequential "competent player" bot that plays a whole shift through real gestures.
const { open, gesture, line, hold, step, state, out } = require('./lib');
const ACTION = 0.5; // seconds of game time each gesture costs
const TARGET = { rare: 0.32, medium: 0.55, well: 0.78 };
(async () => {
  const { b, p } = await open({ query: process.argv[2] || '' });
  await p.click('[data-act=start]');
  await p.evaluate(() => window.__bv.manual(true));
  const ev = (f, a) => p.evaluate(f, a);
  const bin = (k) => ev((k) => { const b = window.__bv.bins.find(x => x.kind === k); return window.__bv.project('counter', b.x, 0.4, b.z); }, k);
  const plate = (i) => ev((i) => { const g = window.__bv.trayView.plates[i].group.position; return window.__bv.project('tray', g.x, 0.3, g.z); }, i);
  const items = () => ev(() => window.__bv.counter.grillItems.map((it, i) => ({ i, kind: it.piece.kind, cook: it.piece.cook.slice(), flipping: it.flipT >= 0, uid: it.piece.uid, x: it.x, z: it.z, scr: window.__bv.project('counter', it.x, 0.35, it.z) })));
  const page = async (n) => { await p.evaluate((n) => document.querySelectorAll('.tab')[n].click(), n); await step(p, 0.4); };
  const act = async (pts, ms) => { await gesture(p, pts, ms); await step(p, ACTION); };
  const spots = [[-2.2, 0.7], [-0.7, 0.7], [0.8, 0.7], [2.3, 0.7], [-2.2, 2.1], [-0.7, 2.1], [0.8, 2.1], [2.3, 2.1]];
  const log = [];
  let guard = 0;
  while (guard++ < 400) {
    const st = await state(p);
    if (st.phase !== 'playing') break;
    const slot = st.slots.findIndex(s => s && s.patience > 0);
    if (slot < 0) { await step(p, 0.5); continue; }
    const order = await ev((i) => { const s = window.__bv.game.slots[i]; return s.order; }, slot);
    await ev((i) => { window.__bv.game.active = i; }, slot);
    const t0 = st.t;
    await page(1);
    // 1. Put grill items on.
    const need = order.layers.map((l, idx) => ({ ...l, idx })).filter(l => l.kind === 'patty' || l.kind === 'bacon' || l.kind === 'egg' || (l.kind === 'bun' && l.toasted));
    const used = new Set((await items()).map(i => i.uid));
    let si = 0;
    const assigned = {};
    for (const n of need) {
      const [bx, by] = await bin(n.kind);
      const occupied = await items();
      let sp;
      do { sp = spots[si++ % spots.length]; } while (occupied.some(o => Math.hypot(o.x - sp[0], o.z - sp[1]) < 1));
      const [gx, gy] = await ev(([x, z]) => window.__bv.project('counter', x, 0.3, z), sp);
      await act(line(bx, by, gx, gy, 10));
      const after = await items();
      const fresh = after.find(i => !used.has(i.uid));
      if (fresh) { used.add(fresh.uid); assigned[n.idx] = fresh.uid; }
    }
    // 2. Fries
    if (order.fries) {
      await page(2);
      const [fx, fy] = await ev(() => window.__bv.project('counter', 14 - 1.7, 0.6, -2.2));
      const [kx, ky] = await ev(() => window.__bv.project('counter', 14 - 1.55, 1.0, 0.45));
      await act(line(fx, fy, kx, ky, 10));
      await page(1);
    }
    // 3. Build bottom-up.
    const [px, py] = await plate(slot);
    for (let li = 0; li < order.layers.length; li++) {
      const l = order.layers[li];
      if (assigned[li]) {
        // cook, flipping when the down side reaches target
        for (let w = 0; w < 200; w++) {
          const it = (await items()).find(i => i.uid === assigned[li]);
          if (!it) break;
          // manage all items: flip any patty/bacon whose down side reached target
          for (const o of await items()) {
            if (o.flipping) continue;
            const ln = Object.entries(assigned).find(([, u]) => u === o.uid);
            if (!ln) continue;
            const ex = order.layers[+ln[0]];
            const tgt = ex.kind === 'patty' ? TARGET[ex.doneness] : 0.6;
            if ((ex.kind === 'patty' || ex.kind === 'bacon') && o.cook[0] >= tgt && o.cook[1] < 0.1) {
              await act(line(o.scr[0], o.scr[1], o.scr[0], o.scr[1] - 60, 4), 16);
            }
          }
          const tgt = l.kind === 'patty' ? TARGET[l.doneness] : l.kind === 'bun' ? 0.5 : l.kind === 'egg' ? 0.5 : 0.6;
          const ready = l.kind === 'patty' || l.kind === 'bacon' ? it.cook[0] >= tgt - 0.02 && it.cook[1] >= tgt - 0.02 : it.cook[0] >= tgt;
          if (ready && !it.flipping) {
            const now = (await items()).find(i => i.uid === assigned[li]);
            await act(line(now.scr[0], now.scr[1], px, py, 12));
            break;
          }
          await step(p, 0.25);
        }
      } else if (l.kind === 'ketchup' || l.kind === 'mustard') {
        const [sx, sy] = await ev((k) => { const b = window.__bv.counter.bottles[k]; return window.__bv.project('counter', b.position.x, 0.8, b.position.z); }, l.kind);
        const pts = line(sx, sy, px - 25, py - 6, 8);
        for (let z = 0; z < 6; z++) pts.push([px - 25 + (z % 2) * 50, py - 6 + z * 3]);
        await act(pts, 16);
      } else {
        const [bx, by] = await bin(l.kind);
        await act(line(bx, by, px, py, 10));
      }
    }
    // 4. Fries
    if (order.fries) {
      await page(2);
      for (let w = 0; w < 80; w++) { const c = await ev(() => window.__bv.counter.baskets[0].cook); if (c >= 0.6) break; await step(p, 0.25); }
      const [kx, ky] = await ev(() => window.__bv.project('counter', 14 - 1.55, 1.0, 0.45));
      await act(line(kx, ky, px, py, 12));
      await page(1);
    }
    // 5. Drink
    if (order.drink) {
      await page(0);
      const idx = ['pine', 'lemon', 'cola'].indexOf(order.drink);
      const x = -14 + (idx - 1) * 2.0;
      const [tx, ty] = await ev((x) => window.__bv.project('counter', x, 1.9, -1.7), x);
      await hold(p, tx, ty, 2100);
      const [cx, cy] = await ev((x) => window.__bv.project('counter', x, 0.6, -0.8), x);
      await act(line(cx, cy, px, py, 12));
      await page(1);
    }
    const before = await state(p);
    await p.evaluate(() => { const b = document.querySelector('.bell'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await step(p, 0.3);
    const afterServe = await ev(() => ({ stars: window.__bv.game.stars.slice(-1)[0], served: window.__bv.game.served, bubble: [...document.querySelectorAll('.bubble')].map(b => b.textContent).join(' | ') }));
    log.push({ order: order.name, plate: before.slots[slot] && before.slots[slot].plate.join(' '), want: before.slots[slot] && before.slots[slot].want, fries: before.slots[slot] && before.slots[slot].pf, drink: before.slots[slot] && before.slots[slot].pd, took: +(before.t - t0).toFixed(1), patienceLeft: before.slots[slot] && before.slots[slot].patience, ...afterServe });
    console.log(JSON.stringify(log[log.length - 1]));
    if (log.length === 3) await p.screenshot({ path: out + 'bot-mid.png' });
  }
  const fin = await state(p);
  console.log('FINAL', JSON.stringify({ t: fin.t, phase: fin.phase, served: fin.served, lost: fin.lost, money: fin.money, tips: fin.tips }));
  await p.screenshot({ path: out + 'bot-end.png' });
  await b.close();
})();
