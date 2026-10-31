// Plays the Cold bar through real gestures: a cone (three loops round it) and a shake (two and a
// half loops, then the mixer), each carried to its tray and served. Screenshots to out/cold-*.png.
// PORT=4173 node tools/playtest/coldbar.cjs
const { open, gesture, line, step, out, enterShift } = require('./lib.cjs');
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 0, tutorialDone: true })));
  await p.reload();
  await p.waitForTimeout(600);
  await enterShift(p);
  await p.evaluate(() => window.__bv.manual(true));
  await step(p, 2);
  const ev = (fn, a) => p.evaluate(fn, a);
  const hp = (type, f = {}) => ev(([type, f]) => {
    const c = window.__bv.counter;
    const m = c.hitMeshes.find(h => h.userData.hit.type === type && Object.entries(f).every(([k, v]) => h.userData.hit[k] === v));
    return window.__bv.project('counter', m.position.x, m.position.y, m.position.z);
  }, [type, f]);
  const top = (i) => ev((i) => { const t = window.__bv.counter.spotTop(i); return window.__bv.project('counter', t.x, t.y, t.z); }, i);
  const plate = (i) => ev((i) => { const g = window.__bv.trayView.plates[i].group.position; return window.__bv.project('tray', g.x, 0.3, g.z); }, i);
  const fire = (t, x, y) => ev(([t, x, y]) => document.getElementById('gl').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', isPrimary: true })), [t, x, y]);
  // Two orders: a huckleberry cone and a vanilla shake.
  await ev(() => {
    const g = window.__bv.game;
    const orders = [
      { id: 91, name: 'Huckleberry Cone', price: 3, mods: [], layers: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M', dessert: { kind: 'cone', flavor: 'huckleberry' } },
      { id: 92, name: 'Vanilla Shake', price: 5, mods: [], layers: [], fries: false, drink: null, friesSize: 'S', drinkSize: 'M', dessert: { kind: 'shake', flavor: 'vanilla' } },
    ];
    orders.forEach((o, i) => {
      const s = g.slots[i];
      Object.assign(s, { order: o, leaving: false, maxPatience: 200, patience: 190, ticketKey: '', plate: { layers: [], fries: null, drink: null, dessert: null }, kept: { fries: null, drink: null, dessert: null } });
      window.__bv.trayView.plates[i].setDish(false);
    });
    g.slots[2].order = null;
    g.active = 0;
    g.line = [];
  });
  await p.evaluate(() => document.querySelectorAll('.tab')[3].click());
  await step(p, 0.8);
  await p.screenshot({ path: out + 'cold-1-counter.png' });

  // Cone to the right nozzle (huckleberry), then press the handle and circle three times.
  const cones = await hp('cones');
  const spot1 = await hp('coldSpot', { idx: 1 });
  await gesture(p, line(cones[0], cones[1], spot1[0], spot1[1], 12));
  await step(p, 0.3);
  console.log('cone on spot:', await ev(() => JSON.stringify(window.__bv.counter.coldSpots[1].held)));
  const h1 = await hp('handle', { idx: 1 });
  await fire('pointerdown', ...h1);
  let c = await top(1);
  const R = 42;
  const loops = 3.15;
  let last = h1;
  for (let k = 0; k <= 64 * loops; k++) {
    if (k % 8 === 0) c = await top(1);
    const a = -Math.PI / 2 + (k / 64) * Math.PI * 2;
    last = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R * 0.8];
    await p.waitForTimeout(6);
    await fire('pointermove', ...last);
    if (k === 96) { await step(p, 0.05); await p.screenshot({ path: out + 'cold-2-swirling.png' }); }
  }
  await step(p, 0.05);
  await fire('pointerup', ...last);
  await step(p, 0.3);
  console.log('cone:', await ev(() => JSON.stringify(window.__bv.counter.coldSpots[1].held)));
  await p.screenshot({ path: out + 'cold-3-cone.png' });
  // Up to tray 0.
  let pl = await plate(0);
  await gesture(p, line(spot1[0], spot1[1], pl[0], pl[1], 14));
  await step(p, 0.3);
  console.log('tray 0 dessert:', await ev(() => JSON.stringify(window.__bv.game.slots[0].plate.dessert)));

  // Tin to the left nozzle (vanilla), two and a half loops, onto the mixer, hold, then to tray 1.
  const tins = await hp('tins');
  const spot0 = await hp('coldSpot', { idx: 0 });
  await gesture(p, line(tins[0], tins[1], spot0[0], spot0[1], 12));
  await step(p, 0.3);
  const h0 = await hp('handle', { idx: 0 });
  await fire('pointerdown', ...h0);
  for (let k = 0; k <= 64 * 2.6; k++) {
    if (k % 8 === 0) c = await top(0);
    const a = -Math.PI / 2 + (k / 64) * Math.PI * 2;
    last = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R * 0.8];
    await p.waitForTimeout(6);
    await fire('pointermove', ...last);
  }
  await fire('pointerup', ...last);
  await step(p, 0.3);
  console.log('tin:', await ev(() => JSON.stringify(window.__bv.counter.coldSpots[0].held)));
  const mixer = await hp('mixer');
  await gesture(p, line(spot0[0], spot0[1], mixer[0], mixer[1], 12));
  await step(p, 0.3);
  console.log('on mixer:', await ev(() => !!window.__bv.counter.mixer.tin));
  // Hold the mixer for 2.3 s of game time.
  await fire('pointerdown', ...mixer);
  await step(p, 1.2);
  await p.screenshot({ path: out + 'cold-4-blending.png' });
  await step(p, 1.1);
  await fire('pointerup', ...mixer);
  console.log('blend:', await ev(() => window.__bv.counter.mixer.tin && window.__bv.counter.mixer.tin.blend.toFixed(2)));
  pl = await plate(1);
  await gesture(p, line(mixer[0], mixer[1], pl[0], pl[1], 14));
  await step(p, 0.4);
  console.log('tray 1 dessert:', await ev(() => JSON.stringify(window.__bv.game.slots[1].plate.dessert)));
  await p.screenshot({ path: out + 'cold-5-trays.png' });
  // Serve both.
  const before = await ev(() => window.__bv.game.money);
  await ev(() => { window.__bv.serve(0); window.__bv.serve(1); });
  await step(p, 0.2);
  console.log('served', await ev(() => window.__bv.game.served), 'money +', (await ev(() => window.__bv.game.money)) - before, 'stars', await ev(() => window.__bv.game.stars.join(',')));
  await b.close();
})();
