// A sequential "competent player" bot that plays a whole shift through real gestures.
const { open, gesture, line, hold, step, state, out } = require('./lib.cjs');
const ACTION = 0.5; // seconds of game time each gesture costs
const TARGET = { rare: 0.32, medium: 0.55, well: 0.78 };
(async () => {
  const { b, p } = await open({ query: process.argv[2] || '' });
  // STOP=n plays that stop of the road trip (tutorial already done).
  if (process.env.STOP) {
    // BIZ=quality,price plays business mode with that plan, e.g. BIZ=premium,high.
    const biz = process.env.BIZ ? process.env.BIZ.split(',') : null;
    // TOWN=id parks the truck in that town instead (STOP=n picks the first town of region n).
    const town = process.env.TOWN ? { town: process.env.TOWN, unlocked: [process.env.TOWN], day: +(process.env.DAY || 1) } : {};
    await p.evaluate(([n, biz, town]) => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: n, ...town, tutorialDone: true, biz: !!biz, plan: biz ? { quality: biz[0], price: biz[1], menu: [] } : null })), [+process.env.STOP, biz, town]);
    await p.reload();
    await p.waitForTimeout(600);
  }
  await p.click('[data-home=open]');
  if (process.env.BIZ) {
    await p.waitForTimeout(600);
    await p.screenshot({ path: '/tmp/claude-0/pt/plan.png' });
    await p.click('[data-act=open]');
  }
  await p.evaluate(() => window.__bv.manual(true));
  const ev = (f, a) => p.evaluate(f, a);
  const bin = (k) => ev((k) => { const b = window.__bv.bins.find(x => x.kind === k); return window.__bv.project('counter', b.x, 0.4, b.z); }, k);
  const plate = (i) => ev((i) => { const g = window.__bv.trayView.plates[i].group.position; return window.__bv.project('tray', g.x, 0.3, g.z); }, i);
  const items = () => ev(() => window.__bv.counter.grillItems.map((it, i) => ({ i, kind: it.piece.kind, cook: it.piece.cook.slice(), flipping: it.flipT >= 0, uid: it.piece.uid, melt: it.topping ? (it.topping.piece.melt ?? 0) : -1, x: it.x, z: it.z, scr: window.__bv.project('counter', it.x, 0.35, it.z) })));
  const page = async (n) => { await p.evaluate((n) => document.querySelectorAll('.tab')[n].click(), n); await step(p, 0.4); };
  const act = async (pts, ms) => { await gesture(p, pts, ms); await step(p, ACTION); };
  const spots = [[-2.5, 0.7], [-1.2, 0.7], [0.1, 0.7], [1.3, 0.7], [-2.5, 2.1], [-1.2, 2.1], [0.1, 2.1], [1.3, 2.1]];
  const log = [];
  let refills = 0;
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
    const need = order.layers.map((l, idx) => ({ ...l, idx })).filter(l => l.kind === 'patty' || l.kind === 'bacon' || l.kind === 'egg' || l.kind === 'pineapple' || (l.kind === 'bun' && l.toasted));
    const used = new Set((await items()).map(i => i.uid));
    let si = 0;
    const assigned = {}; const parked = new Map(); const skip = new Set();
    for (const n of need) {
      const [bx, by] = await bin(n.kind);
      const occupied = await items();
      let sp;
      do { sp = spots[si++ % spots.length]; } while (occupied.some(o => Math.hypot(o.x - sp[0], o.z - sp[1]) < 1));
      const [gx, gy] = await ev(([x, z]) => window.__bv.project('counter', x, 0.3, z), sp);
      await act(line(bx, by, gx, gy, 10));
      const after = await items();
      const fresh = after.find(i => !used.has(i.uid));
      if (fresh) {
        used.add(fresh.uid);
        assigned[n.idx] = fresh.uid;
        if (n.smashed) await hold(p, fresh.scr[0], fresh.scr[1], 600);
      }
    }
    // 2. Fries: start a batch in a free basket (leftovers from a small carton may still be in the other).
    let freshB = -1;
    if (order.fries) {
      await page(2);
      freshB = await ev(() => window.__bv.counter.baskets.findIndex(b => !b.loaded));
      if (freshB >= 0) {
        const [fx, fy] = await ev(() => { const v = window.__bv.counter.friesBinAt; return window.__bv.project('counter', v.x, v.y, v.z); });
        const [kx, ky] = await ev((i) => { const v = window.__bv.counter.baskets[i].obj.position; return window.__bv.project('counter', v.x, 1.0, v.z); }, freshB);
        // One scoop per small carton's worth: S/M/L take 1/2/3.
        for (let n = { S: 1, M: 2, L: 3 }[order.friesSize]; n > 0; n--) await act(line(fx, fy, kx, ky, 10));
      }
      await page(1);
    }
    // 3. Build bottom-up.
    const [px, py] = await plate(slot);
    for (let li = 0; li < order.layers.length; li++) {
      const l = order.layers[li];
      if (skip.has(li)) continue;
      const wantsMelt = (i) => order.layers[i]?.kind === 'patty' && order.layers[i + 1]?.melted;
      const cheeseOn = async (o) => { const [cx, cy] = await bin('cheese'); await act(line(cx, cy, o.scr[0], o.scr[1], 10)); };
      if (assigned[li]) {
        // cook, flipping when the down side reaches target
        for (let w = 0; w < 200; w++) {
          if (parked.has(assigned[li])) {
            // Parked under the heat lamp: drag that spot's stack onto the plate.
            const hi = parked.get(assigned[li]); parked.delete(assigned[li]);
            const [hx, hy] = await ev((i) => { const h = window.__bv.counter.holds[i]; return window.__bv.project('counter', h.x, 0.35, h.z); }, hi);
            await act(line(hx, hy, px, py, 12));
            break;
          }
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
            } else if (+ln[0] !== li && process.env.HOLD !== '0') {
              // Done but not needed yet: park it under the heat lamp so it doesn't overcook.
              const t2 = ex.kind === 'patty' ? TARGET[ex.doneness] : ex.kind === 'bacon' ? 0.6 : 0.5;
              const done2 = ex.kind === 'patty' || ex.kind === 'bacon' ? o.cook[0] >= t2 - 0.02 && o.cook[1] >= t2 - 0.02 : o.cook[0] >= t2;
              const free = done2 ? await ev(() => window.__bv.counter.holds.findIndex(h => !h.layers.length)) : -1;
              if (free >= 0 && ![...parked.values()].includes(free)) {
                if (wantsMelt(+ln[0]) && o.melt < 0) { await cheeseOn(o); skip.add(+ln[0] + 1); }
                const [rx, ry] = await ev((i) => { const h = window.__bv.counter.holds[i]; return window.__bv.project('counter', h.x, 0.35, h.z); }, free);
                await act(line(o.scr[0], o.scr[1], rx, ry, 12));
                if (await ev((u) => !window.__bv.counter.grillItems.some(g => g.piece.uid === u), o.uid)) parked.set(o.uid, free);
              }
            }
          }
          const tgt = l.kind === 'patty' ? TARGET[l.doneness] : l.kind === 'bun' || l.kind === 'egg' || l.kind === 'pineapple' ? 0.5 : 0.6;
          if (wantsMelt(li) && it.melt < 0 && it.cook[1] >= tgt - 0.02 && it.cook[0] >= tgt - 0.15 && !it.flipping) {
            await cheeseOn(it); skip.add(li + 1); continue;
          }
          const ready = (l.kind === 'patty' || l.kind === 'bacon' ? it.cook[0] >= tgt - 0.02 && it.cook[1] >= tgt - 0.02 : it.cook[0] >= tgt) && (!wantsMelt(li) || it.melt >= 0.5);
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
    // Take an empty cup or carton, unwrapping a fresh sleeve when the stack is out.
    const takeEmpty = async (kind, size, to) => {
      const si = await ev(([k, z]) => window.__bv.counter.stacks.findIndex(s => s.kind === k && s.size === z), [kind, size]);
      const s = await ev((i) => { const s = window.__bv.counter.stacks[i]; return { x: s.x, z: s.z, count: s.count }; }, si);
      const [sx, sy] = await ev(([x, z]) => window.__bv.project('counter', x, 0.4, z), [s.x, s.z]);
      if (!s.count) {
        // Open the cupboard, pick a sleeve off a shelf; the view comes back up while it's carried to the stack.
        await p.click('.cupbtn');
        await step(p, 1);
        const sleeve = await ev((k) => { const c = window.__bv.counter; const pr = c.hitMeshes.find(m => m.userData.cupboard && m.userData.hit.kind === k && Math.abs(m.position.x - c.camera.position.x) < 4); return window.__bv.project('counter', pr.position.x, pr.position.y, pr.position.z); }, kind);
        await ev(([x, y]) => { window.__bv.manual(true); document.getElementById('gl').dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })); }, sleeve);
        await step(p, 1);
        await ev(async ([a, b, x, y]) => { const c = document.getElementById('gl'); const fire = (t, px, py) => c.dispatchEvent(new PointerEvent(t, { clientX: px, clientY: py, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })); for (let i = 1; i <= 10; i++) { fire('pointermove', a + (x - a) * i / 10, b + (y - b) * i / 10); await new Promise(r => setTimeout(r, 16)); } fire('pointerup', x, y); }, [...sleeve, sx, sy]);
        await step(p, 0.3);
        await act([[sx, sy], [sx, sy]], 30);
        await act([[sx, sy], [sx, sy]], 30);
        refills++;
      }
      await act(line(sx, sy, to[0], to[1], 10));
    };
    // 4. Fries: carton on the packing spot, fill it from the baskets, carton to the tray.
    if (order.fries) {
      await page(2);
      const [kx2, ky2] = await ev(() => { const k = window.__bv.counter.packs[0]; return window.__bv.project('counter', k.x, 0.3, k.z); });
      await takeEmpty('carton', order.friesSize, [kx2, ky2]);
      for (let tries = 0; tries < 6; tries++) {
        const pk = await ev(() => window.__bv.counter.packs[0].fill);
        if (pk >= 0.99) break;
        const bs = await ev(() => window.__bv.counter.baskets.map(b => ({ loaded: b.loaded, down: b.down, cook: b.cook, amount: b.amount })));
        let bi = bs.findIndex(b => b.loaded && !b.down && b.cook >= 0.5 && b.cook < 1.05);
        if (bi < 0) bi = bs.findIndex(b => b.loaded && b.down);
        if (bi < 0) {
          // Nothing left anywhere: start another batch.
          const free = bs.findIndex(b => !b.loaded);
          const [fx, fy] = await ev(() => { const v = window.__bv.counter.friesBinAt; return window.__bv.project('counter', v.x, v.y, v.z); });
          const [bx2, by2] = await ev((i) => { const v = window.__bv.counter.baskets[i].obj.position; return window.__bv.project('counter', v.x, 1.0, v.z); }, free);
          await act(line(fx, fy, bx2, by2, 10));
          continue;
        }
        for (let w = 0; w < 80; w++) { const c = await ev((i) => window.__bv.counter.baskets[i].cook, bi); if (c >= 0.6) break; await step(p, 0.25); }
        const [bx, by] = await ev((i) => { const v = window.__bv.counter.baskets[i].obj.position; return window.__bv.project('counter', v.x, 1.0, v.z); }, bi);
        await act(line(bx, by, kx2, ky2, 10));
      }
      await act(line(kx2, ky2, px, py, 12));
      await page(1);
    }
    // 5. Drink: cup from the right stack, pour to about 90%, cup to the tray.
    if (order.drink) {
      await page(0);
      const idx = ['pine', 'pink', 'cola', 'water', 'tea'].indexOf(order.drink);
      const x = -14 + (idx - 2) * 1.4;
      const [cx, cy] = await ev((x) => window.__bv.project('counter', x, 0.5, -0.3), x);
      await takeEmpty('cup', order.drinkSize, [cx, cy]);
      const [tx, ty] = await ev((x) => window.__bv.project('counter', x, 1.2, -2.4), x);
      // Ice (when asked for) before pouring; lid and straw after.
      const extra = async (what) => {
        const pos = { ice: [1.9, 0.4, 3.05], lid: [1.15, 0.5, 1.7], straw: [2.65, 0.8, 1.75] }[what];
        const [ex, ey] = await ev(([x, y, z]) => window.__bv.project('counter', -14 + x, y, z), pos);
        await act(line(ex, ey, cx, cy, 10));
      };
      if (order.ice) await extra('ice');
      await hold(p, tx, ty, Math.round(0.9 / (0.42 * { S: 1.35, M: 1, L: 0.78 }[order.drinkSize]) * 1000));
      await extra('lid');
      await extra('straw');
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
  console.log('FINAL', JSON.stringify({ t: fin.t, phase: fin.phase, served: fin.served, lost: fin.lost, money: fin.money, tips: fin.tips, refills, spill: await ev(() => window.__bv.counter.spillCost) }));
  if (process.env.BIZ) await p.screenshot({ path: '/tmp/claude-0/pt/bizsum.png', fullPage: true });
  console.log('SAVE', await ev(() => localStorage.getItem('bv-save-v1')));
  console.log('SUMMARY', await ev(() => document.querySelector('[data-r=summary]').innerText.replace(/\s+/g, ' ').slice(0, 400)));
  await p.screenshot({ path: out + 'bot-end.png' });
  await b.close();
})();
