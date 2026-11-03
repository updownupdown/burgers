// The end of a shift (DESIGN.md §30): sundown in the kitchen, the pull-back onto the evening map,
// the report card, Continue, Results and back, then Sleep. SKIP=1 taps during the sundown instead.
// PORT=4173 [TAG=x] node tools/playtest/sundown-shots.cjs  ->  tools/playtest/out/sundown-<tag>-*.png
const { open, out } = require('./lib.cjs');
const tag = process.env.TAG || 'now';
(async () => {
  const { b, p } = await open({ w: 390, h: 844, dpr: 2 });
  await p.evaluate(() => { localStorage.setItem('bv-save-v1', JSON.stringify({ stop: 1, tutorialDone: true, popularity: 41, day: 4 })); localStorage.setItem('bv-coach', JSON.stringify({ on: false, done: [] })); localStorage.setItem('bv-welcomed', '1'); });
  await p.reload(); await p.waitForTimeout(1200);
  await p.addStyleTag({ content: '.hint{display:none!important}' });
  await p.click('[data-home=open]'); await p.waitForTimeout(800);
  await p.click('[data-act=open]'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__bv.game; g.stars.push(5,4,4,5,3,4,5,4,2,5,4); g.served = 11; g.lost = 1; g.money += 118; g.tips += 17;
    g.reviews.push({ stars: 5, text: 'Worth the drive.', stop: 'x' }, { stars: 4, text: 'Fries could be crispier.', stop: 'x' });
    g.customers = g.spawned; g.line.length = 0; g.time = g.shiftLength + 1; });
  const t0 = Date.now(); const log = [];
  const shot = async (n) => { await p.screenshot({ path: `${out}sundown-${tag}-${n}.png` }); log.push(n + '@' + (Date.now() - t0) + ' ' + await p.evaluate(() => window.__bv.game.phase)); };
  if (process.env.SKIP) {
    await p.waitForTimeout(700); await shot('a-before-tap');
    await p.mouse.click(200, 400); await p.waitForTimeout(300); await shot('b-after-tap');
    await p.waitForTimeout(800); await shot('c-report');
  } else {
    for (let i = 0; i < 14; i++) { await p.waitForTimeout(230); await shot(String(i).padStart(2, '0')); }
    await p.waitForTimeout(1500); await shot('report');
    await p.click('.report-card [data-rep=continue]'); await p.waitForTimeout(700); await shot('map');
    await p.click('[data-home=results]'); await p.waitForTimeout(700); await shot('report-again');
    await p.click('.report-card [data-m=close]'); await p.waitForTimeout(500);
    await p.click('.home-dock [data-home=sleep]'); await p.waitForTimeout(1300); await shot('night');
    await p.waitForTimeout(3500); await shot('morning');
  }
  console.log(log.join('\n'));
  await b.close();
})();
