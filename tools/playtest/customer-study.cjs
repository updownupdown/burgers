// Customer study: the customer band in each design (?cust=0,a..e) at each region, plus a moods row.
// PORT=4175 [STYLES=0,a,b,c,d,e] [STOPS=0,1,2,3] node tools/playtest/customer-study.cjs  ->  out/cust-<style>-<stop>[-moods].png
const { open, step, out } = require('./lib.cjs');
const styles = (process.env.STYLES || '0,a,b,c,d,e').split(',');
const stops = (process.env.STOPS || '0,1,2,3').split(',').map(Number);
(async () => {
  for (const st of styles) {
    const { b, p } = await open({ w: 390, h: 844, dpr: 2, query: '?cust=' + st });
    for (const stop of stops) {
      await p.evaluate((s) => localStorage.setItem('bv-save-v1', JSON.stringify({ stop: s, tutorialDone: true })), stop);
      await p.reload();
      await p.waitForTimeout(600);
      await p.addStyleTag({ content: `:root{--safe-t:47px !important} .hint{display:none !important}` });
      await p.click('[data-home=open]');
      await p.waitForTimeout(700);
      if (await p.$('[data-act=open]')) await p.click('[data-act=open]');
      await p.waitForTimeout(200);
      await p.evaluate(() => window.dispatchEvent(new Event('resize')));
      await p.evaluate(() => window.__bv.manual(true));
      await step(p, 2);
      await p.evaluate((stop) => {
        const g = window.__bv.game;
        for (let i = 0; i < 3; i++) {
          window.__bv.spawnCustomer(i, 3 + i * 4 + stop * 7);
          const s = g.slots[i];
          s.maxPatience = 200; s.patience = 190 - i * 50;
        }
        g.active = 0;
      }, stop);
      await step(p, 3);
      await p.screenshot({ path: `${out}cust-${st}-${stop}.png`, clip: { x: 0, y: 40, width: 390, height: 200 } });
      if (stop === stops[0]) {
        for (const [i, m] of [[0, 'happy'], [1, 'sad'], [2, 'angry']]) await p.evaluate(([i, m]) => window.__bv.customersView.slots[i].fig.setMood(m), [i, m]);
        await step(p, 0);
        await p.screenshot({ path: `${out}cust-${st}-${stop}-moods.png`, clip: { x: 0, y: 40, width: 390, height: 200 } });
      }
    }
    await b.close();
  }
})();
