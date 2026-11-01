// Kitchen view study: screenshots of each counter with three customers, receipts and burgers,
// on a notched phone (safe area emulated), for one or more ?view= options.
// PORT=4175 VIEWS=0,A,B node tools/playtest/view-study.cjs  ->  out/view-<opt>-<page>.png
const { open, step, out } = require('./lib.cjs');
const views = (process.env.VIEWS || '0').split(',');
const [W, H] = (process.env.SIZE || '390x844').split('x').map(Number);
const SAFE = +(process.env.SAFE ?? 47);
const STOP = +(process.env.STOP ?? 0);
(async () => {
  for (const v of views) {
    const { b, p } = await open({ w: W, h: H, dpr: 2, query: v === '0' ? '' : `?view=${v}` });
    await p.evaluate(([s, look]) => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: s, tutorialDone: true, ...(look ? { look: JSON.parse(look), looks: Object.values(JSON.parse(look)) } : {}) })), [STOP, process.env.LOOK || '']);
    await p.reload();
    await p.waitForTimeout(600);
    await p.addStyleTag({ content: `:root{--safe-t:${SAFE}px !important} .hint{display:none !important}` });
    await p.evaluate(() => window.dispatchEvent(new Event('resize')));
    await p.click('[data-home=open]');
    await p.waitForTimeout(700);
    if (await p.$('[data-act=open]')) await p.click('[data-act=open]');
    await p.waitForTimeout(200);
    await p.evaluate(() => window.dispatchEvent(new Event('resize')));
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 3);
    await p.evaluate(() => {
      const g = window.__bv.game;
      let uid = 9000;
      const pc = (kind) => ({ piece: { uid: uid++, kind, cook: [0.55, 0.55], melt: kind === 'cheese' ? 1 : undefined }, offX: 0, offZ: 0 });
      const mk = (id, name, layers, extra = {}) => ({ id, name, price: 12, mods: [], layers: layers.map((kind) => ({ kind })), fries: false, drink: null, ...extra });
      const orders = [
        mk(41, 'Classic', ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'bun'], { fries: true, friesSize: 'M', drink: 'cola', drinkSize: 'M', ice: true }),
        mk(42, 'Double', ['bun', 'patty', 'cheese', 'patty', 'cheese', 'bun']),
        mk(43, 'Plain', ['bun', 'patty', 'bun'], { drink: 'tea', drinkSize: 'S', ice: false }),
      ];
      orders.forEach((o, i) => {
        if (!g.slots[i].fig) window.__bv.spawnCustomer(i, 7 + i * 5);
        const s = g.slots[i];
        s.order = o; s.leaving = false; s.maxPatience = 200; s.patience = 170 - i * 40; s.ticketKey = ''; s.sentBack = null;
      });
      const plates = [['bun', 'patty', 'cheese', 'lettuce'], ['bun', 'patty', 'cheese', 'patty', 'cheese', 'bun'], []];
      plates.forEach((ks, i) => {
        const s = g.slots[i];
        s.plate = { layers: ks.map(pc), fries: i === 0 ? { cook: 0.72, size: 'M', fill: 1, salt: 0.6 } : null, drink: i === 0 ? { flavor: 'cola', fill: 0.9, size: 'M', ice: true, lid: true } : null };
        window.__bv.trayView.plates[i].setDish(true);
        window.__bv.trayView.plates[i].sync(s.plate, false, () => {});
      });
      g.active = 0;
    });
    await step(p, 2);
    for (const page of [1, 0, 2]) {
      await p.evaluate((pg) => window.__bv.goToPage(pg), page);
      await step(p, 1.5);
      await p.waitForTimeout(250);
      await p.screenshot({ path: `${out}view-${v}-${STOP}-${page}${process.env.TAG || ''}.png` });
    }
    const bands = await p.evaluate(() => window.__bv.bands);
    console.log(v, JSON.stringify(bands));
    await b.close();
  }
})();
