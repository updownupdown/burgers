// The view out of the window in each area, with and without customers.
// PORT=4175 [TAG=x] node tools/playtest/scenery-shots.cjs -> out/scenery-<tag>-<area>[-empty].png
const { open, step, out } = require('./lib.cjs');
const opts = ['0'];
const kinds = ['mountains', 'beach', 'desert', 'orchard'];
(async () => {
  for (const o of opts) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: '' });
    await p.evaluate(() => localStorage.setItem('bv-save-v1', JSON.stringify({ town: 'pinecrest', tutorialDone: true })));
    await p.reload();
    await p.waitForTimeout(600);
    await p.addStyleTag({ content: `:root{--safe-t:47px !important} .hint{display:none !important}` });
    await p.evaluate(() => window.dispatchEvent(new Event('resize')));
    await p.click('[data-home=open]');
    await p.waitForTimeout(700);
    if (await p.$('[data-act=open]')) await p.click('[data-act=open]');
    await p.waitForTimeout(200);
    await p.evaluate(() => window.__bv.manual(true));
    await step(p, 2);
    const band = await p.evaluate(() => window.__bv.bands.customers);
    for (const kind of kinds) {
      for (const empty of [false, true]) {
        await p.evaluate(([kind, empty]) => {
          const v = window.__bv.customersView;
          v.setBackdrop(kind);
          for (let i = 0; i < 3; i++) {
            const fig = v.arrive(i, 3 + i * 4);
            fig.root.visible = !empty;
            v.slots[i].enterT = 1;
          }
          v.setLine(empty ? [] : [{ seed: 21, mood: 'neutral' }, { seed: 26, mood: 'happy' }, { seed: 30, mood: 'neutral' }]);
        }, [kind, empty]);
        await step(p, 1.5);
        await p.evaluate((empty) => { for (const s of window.__bv.customersView.slots) if (s.fig) s.fig.root.visible = !empty; }, empty);
        await step(p, 0.05);
        await p.waitForTimeout(150);
        await p.screenshot({ path: `${out}scenery-${process.env.TAG || 'now'}-${kind}${empty ? '-empty' : ''}.png`, clip: { x: 0, y: 0, width: band.w, height: band.h + 60 } });
      }
    }
    await b.close();
  }
})();
