// The repo's competent-player bot (tools/playtest/bot.cjs), moved onto the window-line layout:
// targets come from the counter's hit proxies, sauce is lifted / drawn / put back, cartons are
// carried across the fryer's two stops with the edge carry, sleeves are sized.
const path = require('path');
const { open, gesture, line, hold, step, state, out } = require('./lib.cjs');
const OUT = out;
const ACTION = 0.5;
const TARGET = { rare: 0.32, medium: 0.55, well: 0.78 };
(async () => {
  const { b, p } = await open({ w: 412, h: 915 });
  let errors = 0;
  p.on('pageerror', () => errors++);
  p.on('console', m => { if (m.type() === 'error') errors++; });
  await p.evaluate(([n]) => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: n, tutorialDone: true })), [+(process.env.STOP || 0)]);
  await p.reload(); await p.waitForTimeout(600);
  await p.click('[data-home=open]');
  // The day's prep screen, when there is one.
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('[data-act=open]')?.click());
  await p.evaluate(() => window.__bv.manual(true));
  const ev = (f, a) => p.evaluate(f, a);
  // Screen point of a hit proxy's centre: hp('bin', {kind: 'patty'}).
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find(h => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    if (!m) throw new Error('no proxy ' + type + JSON.stringify(f));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const holdAt = (i) => ev((i) => { const q = window.__bv.counter.holdPoint(i); return window.__bv.project('counter', q.x, q.y + 0.2, q.z); }, i);
  const plate = (i) => ev((i) => { const g = window.__bv.trayView.plates[i].group.position; return window.__bv.project('tray', g.x, 0.3, g.z); }, i);
  const items = () => ev(() => window.__bv.counter.grillItems.map((it, i) => ({ i, kind: it.piece.kind, cook: it.piece.cook.slice(), flipping: it.flipT >= 0, uid: it.piece.uid, melt: it.topping ? (it.topping.piece.melt ?? 0) : -1, x: it.x, z: it.z, scr: window.__bv.project('counter', it.x, 0.95, it.z) })));
  const stop = async (s) => { await ev((s) => window.__bv.goToStop(s), s); await step(p, 0.6); };
  const page = async (n) => { await p.evaluate((n) => document.querySelectorAll('.tab')[n].click(), n); await step(p, 0.6); };
  const act = async (pts, ms) => { await gesture(p, pts, ms); await step(p, ACTION); };
  const tap = async ([x, y]) => act([[x, y], [x, y]], 30);
  // Press, carry along pts, rest there for restMs of real time, step the clock, then finish with
  // a carry to wherever `then()` says (re-projected after the camera moved) and let go.
  const fire = (t, x, y) => ev(([t, x, y]) => document.getElementById('gl').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })), [t, x, y]);
  const carryVia = async (pts, restMs, then) => {
    await fire('pointerdown', ...pts[0]);
    for (const q of pts.slice(1)) { await p.waitForTimeout(16); await fire('pointermove', ...q); }
    const l = pts[pts.length - 1];
    for (let t = 0; t < restMs; t += 60) { await p.waitForTimeout(60); await fire('pointermove', l[0] + (t / 60) % 2, l[1]); }
    await step(p, 0.7);
    const to = await then();
    for (const q of line(l[0], l[1], to[0], to[1], 10)) { await p.waitForTimeout(16); await fire('pointermove', ...q); }
    await fire('pointerup', ...to);
    await step(p, ACTION);
  };
  const W = 412;
  const spots = [[0.75, -0.3], [1.85, -0.3], [2.95, -0.3], [0.75, 0.6], [1.85, 0.6], [2.95, 0.6], [0.75, 1.45], [1.85, 1.45], [2.95, 1.45]];
  const log = [];
  let refills = 0, guard = 0, shots = 0;
  while (guard++ < 400) {
    const st = await state(p);
    if (st.phase !== 'playing') break;
    const slot = st.slots.findIndex(s => s && s.patience > 0);
    if (slot < 0) { await step(p, 0.5); continue; }
    const order = await ev((i) => window.__bv.game.slots[i].order, slot);
    await ev((i) => { window.__bv.game.active = i; }, slot);
    const t0 = st.t;
    await page(1);
    // 1. Grill items on.
    const need = order.layers.map((l, idx) => ({ ...l, idx })).filter(l => ['patty', 'bacon', 'egg', 'pineapple'].includes(l.kind) || (l.kind === 'bun' && l.toasted));
    const used = new Set((await items()).map(i => i.uid));
    let si = 0;
    const assigned = {}; const parked = new Map(); const skip = new Set();
    for (const n of need) {
      const [bx, by] = await hp('bin', { kind: n.kind });
      const occupied = await items();
      let sp, tries = 0;
      do { sp = spots[si++ % spots.length]; } while (occupied.some(o => Math.hypot(o.x - sp[0], o.z - sp[1]) < 1) && tries++ < spots.length);
      const [gx, gy] = await ev(([x, z]) => window.__bv.project('counter', x, 0.9, z), sp);
      await act(line(bx, by, gx, gy, 10));
      const fresh = (await items()).find(i => !used.has(i.uid));
      if (fresh) {
        used.add(fresh.uid);
        assigned[n.idx] = fresh.uid;
        if (n.smashed) await hold(p, fresh.scr[0], fresh.scr[1], 600);
      }
    }
    // 2. Fries batch: freezer and baskets are on the fryer's left stop.
    if (order.fries) {
      await stop(2);
      const freshB = await ev(() => window.__bv.counter.baskets.findIndex(b => !b.loaded));
      if (freshB >= 0) {
        const f = await hp('friesBin');
        const k = await hp('basket', { idx: freshB });
        for (let n = { S: 1, M: 2, L: 3 }[order.friesSize]; n > 0; n--) await act(line(f[0], f[1], k[0], k[1], 10));
        await tap(k);
      }
      await page(1);
    }
    const liftDone = async () => {
      const bi = await ev((perfect) => window.__bv.counter.baskets.findIndex(b => b.loaded && b.down && b.cook >= perfect), 0.7);
      if (bi < 0) return;
      const back = await ev(() => window.__bv.counter.stop);
      await stop(2);
      await tap(await hp('basket', { idx: bi }));
      await stop(back);
    };
    // 3. Build bottom-up.
    const [px, py] = await plate(slot);
    for (let li = 0; li < order.layers.length; li++) {
      const l = order.layers[li];
      if (skip.has(li)) continue;
      const wantsMelt = (i) => order.layers[i]?.kind === 'patty' && order.layers[i + 1]?.melted;
      const cheeseOn = async (o) => { const [cx, cy] = await hp('bin', { kind: 'cheese' }); await act(line(cx, cy, o.scr[0], o.scr[1], 10)); };
      if (assigned[li]) {
        for (let w = 0; w < 400; w++) {
          if (parked.has(assigned[li])) {
            const hi = parked.get(assigned[li]); parked.delete(assigned[li]);
            const [hx, hy] = await holdAt(hi);
            await act(line(hx, hy, px, py, 12));
            break;
          }
          const it = (await items()).find(i => i.uid === assigned[li]);
          if (!it) break;
          for (const o of await items()) {
            if (o.flipping) continue;
            const ln = Object.entries(assigned).find(([, u]) => u === o.uid);
            if (!ln) continue;
            const ex = order.layers[+ln[0]];
            const tgt = ex.kind === 'patty' ? TARGET[ex.doneness] : 0.6;
            if ((ex.kind === 'patty' || ex.kind === 'bacon') && o.cook[0] >= tgt && o.cook[1] < 0.1) {
              await act(line(o.scr[0], o.scr[1], o.scr[0], o.scr[1] - 60, 4), 16);
            } else if (+ln[0] !== li) {
              const t2 = ex.kind === 'patty' ? TARGET[ex.doneness] : ex.kind === 'bacon' ? 0.6 : 0.5;
              const done2 = ex.kind === 'patty' || ex.kind === 'bacon' ? o.cook[0] >= t2 - 0.02 && o.cook[1] >= t2 - 0.02 : o.cook[0] >= t2;
              const free = done2 ? await ev(() => window.__bv.counter.holds.findIndex(h => !h.layers.length)) : -1;
              if (free >= 0 && ![...parked.values()].includes(free)) {
                if (wantsMelt(+ln[0]) && o.melt < 0) { await cheeseOn(o); skip.add(+ln[0] + 1); }
                const [rx, ry] = await holdAt(free);
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
          await liftDone();
        }
      } else if (l.kind === 'ketchup' || l.kind === 'mustard') {
        // One gesture: press the bottle, drag it up onto the burger (the view zooms in), zigzag
        // across it, let go.
        const bt = await hp('bottle', { sauce: l.kind });
        const [cx, cy, side] = await ev(() => window.__bv.sauceCentre());
        await fire('pointerdown', ...bt);
        for (const q of line(bt[0], bt[1], px, cy, 12)) { await p.waitForTimeout(16); await fire('pointermove', ...q); }
        await step(p, 0.4);
        const zig = [];
        for (let z = 0; z <= 5; z++) zig.push([cx + (z % 2 ? 0.3 : -0.3) * side, cy - 0.27 * side + z * 0.1 * side + 34]);
        let at = [px, cy];
        for (const q of zig) { for (const r of line(at[0], at[1], q[0], q[1], 8)) { await p.waitForTimeout(8); await fire('pointermove', ...r); } at = q; }
        await step(p, 0.1);
        if (shots++ === 0) await p.screenshot({ path: OUT + 'kbot-sauce.png' });
        await fire('pointerup', ...at);
        await step(p, ACTION);
        if (await ev(() => window.__bv.counter.inHand)) console.log('SAUCE STILL IN HAND');
      } else {
        const [bx, by] = await hp('bin', { kind: l.kind });
        for (let n = l.count || 1; n > 0; n--) await act(line(bx, by, px, py, 10));
      }
    }
    // An empty cup or carton from its stack; fetch and unwrap a sleeve of that size when it's out.
    // `deliver(from)` carries it from the stack to where it goes.
    const takeEmpty = async (kind, size, deliver) => {
      const si = await ev(([k, z]) => window.__bv.counter.stacks.findIndex(s => s.kind === k && s.size === z), [kind, size]);
      let s = await hp('stack', { idx: si });
      if (!(await ev((i) => window.__bv.counter.stacks[i].count, si))) {
        const back = await ev(() => window.__bv.counter.page);
        const backStop = await ev(() => window.__bv.counter.stop);
        await page(3);
        const a = await hp('supplies', { kind, size });
        const tab = await ev((n) => { const r = document.querySelectorAll('.tab')[n].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, back);
        await carryVia(line(a[0], a[1], tab[0], tab[1], 10), 480, async () => { if ((await ev(() => window.__bv.counter.stop)) !== backStop) { await ev((s) => window.__bv.goToStop(s), backStop); await step(p, 0.6); } return hp('stack', { idx: si }); });
        s = await hp('stack', { idx: si });
        await tap(s); await tap(s);
        refills++;
      }
      await deliver(s);
    };
    // 4. Fries: carton from the stacks (left stop) carried to the pad (right stop) with the edge carry.
    if (order.fries) {
      await stop(2);
      await takeEmpty('carton', order.friesSize, async (s) => {
        await carryVia(line(s[0], s[1], W - 8, s[1] - 40, 12), 480, () => hp('pack', { idx: 0 }));
      });
      if ((await ev(() => window.__bv.counter.stop)) !== 3) console.log('EDGE CARRY DID NOT MOVE');
      if (!(await ev(() => window.__bv.counter.packs[0].size))) console.log('CARTON NOT ON PAD');
      const k2 = await hp('pack', { idx: 0 });
      for (let tries = 0; tries < 6; tries++) {
        if ((await ev(() => window.__bv.counter.packs[0].fill)) >= 0.99) break;
        const bs = await ev(() => window.__bv.counter.baskets.map(b => ({ loaded: b.loaded, down: b.down, cook: b.cook })));
        let bi = bs.findIndex(b => b.loaded && !b.down && b.cook >= 0.5 && b.cook < 0.95);
        if (bi < 0) bi = bs.findIndex(b => b.loaded && b.down);
        if (bi < 0) { bi = bs.findIndex(b => b.loaded && !b.down && b.cook < 0.5); if (bi >= 0) await tap(await hp('basket', { idx: bi })); }
        if (bi < 0) {
          const free = bs.findIndex(b => !b.loaded);
          await stop(2);
          const f = await hp('friesBin'), k = await hp('basket', { idx: free });
          await act(line(f[0], f[1], k[0], k[1], 10));
          await tap(k);
          await stop(3);
          continue;
        }
        for (let w = 0; w < 240; w++) { const c = await ev((i) => window.__bv.counter.baskets[i].cook, bi); if (c >= 0.68) break; await step(p, 0.25); }
        const bk = await hp('basket', { idx: bi });
        await act(line(bk[0], bk[1], k2[0], k2[1], 10));
      }
      for (const what of order.poutine ? ['curds', 'gravy'] : ['salt']) {
        const [tx, ty] = await hp(what === 'salt' ? 'shaker' : what);
        await act(line(tx, ty, k2[0], k2[1], 10));
      }
      await act(line(k2[0], k2[1], px, py, 12));
      await page(1);
    }
    // 5. Drink.
    if (order.drink) {
      await page(0);
      const idx = ['pine', 'pink', 'cola', 'water', 'tea'].indexOf(order.drink);
      const c = await hp('cup', { idx });
      await takeEmpty('cup', order.drinkSize, async (s) => act(line(s[0], s[1], c[0], c[1], 10)));
      const extra = async (what) => { const e = await hp(what); await act(line(e[0], e[1], c[0], c[1], 10)); };
      if (order.ice) await extra('ice');
      const t = await hp('tap', { idx });
      await hold(p, t[0], t[1], Math.round(0.9 / (0.42 * { S: 1.35, M: 1, L: 0.78 }[order.drinkSize]) * 1000));
      await extra('lids');
      await extra('straws');
      await act(line(c[0], c[1], px, py, 12));
      await page(1);
    }
    const before = await state(p);
    const servePlate = async () => { const [sx3, sy3] = await plate(slot); await gesture(p, line(sx3, sy3, sx3, sy3 - 120, 8), 16); await step(p, 0.3); };
    await servePlate();
    const back = await ev((i) => window.__bv.game.slots[i].sentBack, slot);
    if (back) { console.log('SENT BACK', back); await servePlate(); }
    await step(p, 0.3);
    const afterServe = await ev(() => ({ stars: window.__bv.game.stars.slice(-1)[0], served: window.__bv.game.served }));
    const bs = before.slots[slot];
    log.push({ order: order.name, plate: bs && bs.plate.join(' '), want: bs && bs.want, fries: bs && bs.pf, drink: bs && bs.pd, took: +(before.t - t0).toFixed(1), patienceLeft: bs && bs.patience, ...afterServe });
    console.log(JSON.stringify(log[log.length - 1]));
    if (log.length === 3) await p.screenshot({ path: OUT + 'kbot-mid.png' });
  }
  const fin = await state(p);
  const stars = await ev(() => window.__bv.game.stars);
  console.log('FINAL', JSON.stringify({ t: fin.t, phase: fin.phase, served: fin.served, lost: fin.lost, money: fin.money, tips: fin.tips, refills, avgStars: stars.length ? +(stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2) : 0, errors }));
  await p.screenshot({ path: OUT + 'kbot-end.png' });
  await b.close();
})();
