// Screenshots of the kitchen with the longest orders the game makes and a burger on every plate.
// PORT=4175 node tools/playtest/kitchen-shots.cjs [tag]  ->  tools/playtest/out/kitchen-<tag>-<w>x<h>.png
const { open, step, out } = require('./lib.cjs');
const tag = process.argv[2] || 'after';
const sizes = (process.env.SIZES || '390x844,360x740,430x932').split(',').map((s) => s.split('x').map(Number));
(async () => {
  for (const [w, h] of sizes) {
    const { b, p } = await open({ w, h, dpr: 2 });
    await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 2, tutorialDone: true })));
    await p.reload();
    await p.waitForTimeout(600);
    await p.click('[data-home=open]');
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 3);
    await p.evaluate(() => {
      const g = window.__bv.game;
      let uid = 9000;
      const pc = (kind, cook = 0.55) => ({ piece: { uid: uid++, kind, cook: [cook, cook], melt: kind === 'cheese' ? 1 : undefined }, offX: 0, offZ: 0 });
      // 9 layers: Sun Valley Supreme with extra pickles and an added onion, plus fries, a drink and a send-back.
      const big = {
        id: 41, name: 'Sun Valley Supreme', price: 18, critic: true,
        mods: [{ type: 'add', kind: 'pickle' }, { type: 'add', kind: 'onion' }, { type: 'no', kind: 'jalapeno' }],
        layers: [{ kind: 'bun', toasted: true }, { kind: 'patty', doneness: 'rare' }, { kind: 'cheese', melted: true }, { kind: 'bacon' }, { kind: 'pickle', count: 5 }, { kind: 'onion', count: 3 }, { kind: 'egg' }, { kind: 'tomato', count: 2 }, { kind: 'bun', toasted: true }],
        fries: true, friesSize: 'L', drink: 'pine', drinkSize: 'L', ice: false,
      };
      const dbl = {
        id: 42, name: 'Sunset Double', price: 16,
        mods: [{ type: 'extra', kind: 'jalapeno' }, { type: 'add', kind: 'bacon' }],
        layers: [{ kind: 'bun' }, { kind: 'patty', doneness: 'well' }, { kind: 'cheese' }, { kind: 'patty', doneness: 'well' }, { kind: 'cheese' }, { kind: 'bacon' }, { kind: 'jalapeno', count: 7 }, { kind: 'bun' }],
        fries: true, friesSize: 'M', drink: 'pink', drinkSize: 'M', ice: true,
      };
      const pout = { id: 43, name: 'Poutine', price: 9, mods: [], layers: [], fries: true, friesSize: 'L', drink: 'tea', drinkSize: 'S', ice: null, poutine: true };
      [big, dbl, pout].forEach((o, i) => {
        const s = g.slots[i];
        s.order = o; s.leaving = false; s.maxPatience = 200; s.patience = 150 - i * 50; s.expanded = true; s.ticketKey = '';
        s.sentBack = i === 0 ? 'patty undercooked' : null;
      });
      // Burgers on all three plates, part-built so ticks show.
      const plates = [
        ['bun', 'patty', 'cheese', 'bacon', 'pickle', 'pickle', 'pickle', 'pickle', 'pickle'],
        ['bun', 'patty', 'cheese', 'patty', 'cheese', 'bacon', 'bun'],
        ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'bun'],
      ];
      plates.forEach((ks, i) => {
        const s = g.slots[i];
        s.plate = { layers: ks.map((k) => pc(k)), fries: i === 1 ? { cook: 0.72, size: 'M', fill: 1, salt: true } : null, drink: i === 1 ? { flavor: 'pink', fill: 0.9, size: 'M', ice: true, lid: true, straw: true } : null };
        window.__bv.trayView.plates[i].sync(s.plate, false, () => {});
      });
      g.active = 0;
    });
    await step(p, 0.5);
    const file = `${out}kitchen-${tag}-${w}x${h}.png`;
    await p.screenshot({ path: file });
    // How each receipt fits: content height vs. box height.
    const fit = await p.evaluate(() => [...document.querySelectorAll('[data-r=ticket]')].map((t) => ({ cls: t.className, scrollH: t.scrollHeight, clientH: t.clientHeight, top: Math.round(t.getBoundingClientRect().top), bottom: Math.round(t.getBoundingClientRect().bottom) })));
    const tray = await p.evaluate(() => ({ tray: window.__bv.bands.tray, plates: window.__bv.trayView.plates.map((pl) => { const g = pl.group.position; return window.__bv.project('tray', g.x, 0.3, g.z).map(Math.round); }) }));
    console.log(file, JSON.stringify(fit), JSON.stringify(tray));
    // The same finished burger on every plate, to compare the outer plates with the middle one.
    await p.evaluate(() => {
      let uid = 9500;
      window.__bv.game.slots.forEach((s, i) => {
        s.plate = { layers: ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'bun'].map((kind) => ({ piece: { uid: uid++, kind, cook: [0.55, 0.55], melt: kind === 'cheese' ? 1 : undefined }, offX: 0, offZ: 0 })), fries: null, drink: null };
        window.__bv.trayView.plates[i].sync(s.plate, false, () => {});
      });
    });
    await step(p, 0.5);
    const t = tray.tray;
    await p.screenshot({ path: `${out}kitchen-${tag}-tray-${w}x${h}.png`, clip: { x: t.x, y: t.y, width: t.w, height: t.h } });
    await b.close();
  }
})();
