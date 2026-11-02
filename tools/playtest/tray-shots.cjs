// The tray band in each tray look (?tray=kraft|diner|sheet|board|basket), with a burger, fries
// and a drink on the first tray, a burger on the second and fries and a drink on the third.
// PORT=4175 node tools/playtest/tray-shots.cjs  ->  tools/playtest/out/tray-<style>.png
const { open, step, out, enterShift } = require('./lib.cjs');
(async () => {
  for (const style of (process.env.STYLES || 'kraft,diner,sheet,board,basket').split(',')) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: `?tray=${style}` });
    await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ town: 'pinecrest', tutorialDone: true })));
    await p.reload();
    await p.waitForTimeout(600);
    await enterShift(p);
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 1);
    await p.evaluate(() => {
      const g = window.__bv.game;
      let uid = 9000;
      const pc = (kind, cook = 0.55) => ({ piece: { uid: uid++, kind, cook: [cook, cook], melt: kind === 'cheese' ? 1 : undefined, marks: kind === 'patty' ? [0.9, 0] : undefined }, offX: 0, offZ: 0 });
      const base = { price: 9, mods: [], friesSize: 'M', drinkSize: 'M', ice: null };
      const orders = [
        { ...base, id: 1, name: 'A', layers: [{ kind: 'bun' }, { kind: 'patty' }, { kind: 'cheese' }, { kind: 'lettuce' }, { kind: 'bun' }], fries: true, drink: 'cola' },
        { ...base, id: 2, name: 'B', layers: [{ kind: 'bun' }, { kind: 'patty' }, { kind: 'bun' }], fries: true, drink: 'pink' },
        { ...base, id: 3, name: 'C', layers: [], fries: true, drink: 'pine' },
      ];
      const plates = [
        { layers: ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'bun'].map((k) => pc(k)), fries: { cook: 0.72, size: 'M', fill: 1, salt: 0.6 }, drink: { flavor: 'cola', fill: 0.9, size: 'M', ice: true, lid: true } },
        { layers: ['bun', 'patty', 'bun'].map((k) => pc(k)), fries: null, drink: null },
        { layers: [], fries: { cook: 0.72, size: 'L', fill: 1, salt: 0.6 }, drink: { flavor: 'pine', fill: 0.9, size: 'L', ice: true, lid: true } },
      ];
      orders.forEach((o, i) => {
        const s = g.slots[i];
        Object.assign(s, { order: o, leaving: false, maxPatience: 200, patience: 150, ticketKey: '', plate: plates[i] });
        const pv = window.__bv.trayView.plates[i];
        pv.setDish(o.layers.length > 0);
        pv.setWants(o.fries, !!o.drink);
        pv.sync(s.plate, false, () => {});
      });
      g.active = 1;
    });
    await step(p, 0.5);
    await p.waitForTimeout(300);
    const t = await p.evaluate(() => window.__bv.bands.tray);
    await p.screenshot({ path: `${out}tray-${style}.png`, clip: { x: t.x, y: t.y, width: t.w, height: t.h } });
    await b.close();
  }
})();
